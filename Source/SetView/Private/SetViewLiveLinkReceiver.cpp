#include "SetViewLiveLinkReceiver.h"
#include "SetView.h"
#include "Serialization/JsonSerializer.h"
#include "JsonObjectConverter.h"
#include "CineCameraComponent.h"

ASetViewLiveLinkReceiver::ASetViewLiveLinkReceiver()
{
	PrimaryActorTick.bCanEverTick = true;
	ListenSocket = nullptr;
	ReceiveBuffer.SetNumUninitialized(65535);
}

void ASetViewLiveLinkReceiver::BeginPlay()
{
	Super::BeginPlay();
	StartListening();
}

void ASetViewLiveLinkReceiver::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	StopListening();
	Super::EndPlay(EndPlayReason);
}

bool ASetViewLiveLinkReceiver::StartListening()
{
	if (ListenSocket)
	{
		StopListening();
	}

	FIPv4Address Addr = FIPv4Address::Any;
	FIPv4Endpoint Endpoint(Addr, ListenPort);

	ListenSocket = FUdpSocketBuilder(TEXT("SetViewLiveLinkReceiverSocket"))
		.AsNonBlocking()
		.AsReusable()
		.BoundToEndpoint(Endpoint)
		.WithReceiveBufferSize(2 * 1024 * 1024);

	if (ListenSocket)
	{
		UE_LOG(LogSetView, Log, TEXT("SetView LiveLink UDP Server listening on port %d"), ListenPort);
		return true;
	}

	UE_LOG(LogSetView, Error, TEXT("Failed to create SetView LiveLink UDP Server on port %d"), ListenPort);
	return false;
}

void ASetViewLiveLinkReceiver::StopListening()
{
	if (ListenSocket)
	{
		ListenSocket->Close();
		ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM)->DestroySocket(ListenSocket);
		ListenSocket = nullptr;
		UE_LOG(LogSetView, Log, TEXT("SetView LiveLink UDP Server stopped."));
	}
}

void ASetViewLiveLinkReceiver::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (!ListenSocket) return;

	uint32 PendingDataSize = 0;
	while (ListenSocket->HasPendingData(PendingDataSize))
	{
		int32 BytesRead = 0;
		TSharedRef<FInternetAddr> Sender = ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM)->CreateInternetAddr();
		
		if (ListenSocket->RecvFrom(ReceiveBuffer.GetData(), ReceiveBuffer.Num(), BytesRead, *Sender))
		{
			if (BytesRead > 0)
			{
				FString JsonString = FString(BytesRead, UTF8_TO_TCHAR(reinterpret_cast<const char*>(ReceiveBuffer.GetData())));
				ProcessIncomingData(JsonString);
			}
		}
	}
}

void ASetViewLiveLinkReceiver::ProcessIncomingData(const FString& JsonString)
{
	TSharedPtr<FJsonObject> JsonObject;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonString);

	if (FJsonSerializer::Deserialize(Reader, JsonObject) && JsonObject.IsValid())
	{
		FSetViewCameraPacket Packet;

		// Schema is encodeLiveLinkCameraPacket() in src/livelink.ts:
		//   { subjectName, transform: { setView: {...},
		//                               unreal: { location, rotation, quaternion } },
		//     camera: { focalLengthMm, apertureTStop, ... }, status: { isRecording, ... } }
		// This used to read camera_name / location / rotation / focal_length / aperture at
		// the top level -- none of which the packet has ever contained -- so every field
		// silently came back empty.
		JsonObject->TryGetStringField(TEXT("subjectName"), Packet.CameraName);

		// transform.unreal is ALREADY in Unreal space: centimetres and Rotator degrees,
		// converted by ueCoords.ts. Do not re-convert here. Keeping the SetView -> Unreal
		// handedness convention in exactly one place is what stopped this pipeline from
		// exporting mirrored scenes; a second copy in C++ would reopen that.
		const TSharedPtr<FJsonObject>* TransformObj = nullptr;
		if (JsonObject->TryGetObjectField(TEXT("transform"), TransformObj) && TransformObj)
		{
			const TSharedPtr<FJsonObject>* UnrealObj = nullptr;
			if ((*TransformObj)->TryGetObjectField(TEXT("unreal"), UnrealObj) && UnrealObj)
			{
				const TSharedPtr<FJsonObject>* LocObj = nullptr;
				if ((*UnrealObj)->TryGetObjectField(TEXT("location"), LocObj) && LocObj)
				{
					Packet.Location = FVector(
						(*LocObj)->GetNumberField(TEXT("x")),
						(*LocObj)->GetNumberField(TEXT("y")),
						(*LocObj)->GetNumberField(TEXT("z")));
				}

				const TSharedPtr<FJsonObject>* RotObj = nullptr;
				if ((*UnrealObj)->TryGetObjectField(TEXT("rotation"), RotObj) && RotObj)
				{
					Packet.Rotation = FRotator(
						(*RotObj)->GetNumberField(TEXT("pitch")),
						(*RotObj)->GetNumberField(TEXT("yaw")),
						(*RotObj)->GetNumberField(TEXT("roll")));
				}
			}
		}

		const TSharedPtr<FJsonObject>* CameraObj = nullptr;
		if (JsonObject->TryGetObjectField(TEXT("camera"), CameraObj) && CameraObj)
		{
			double FocalLengthMm = 0.0;
			if ((*CameraObj)->TryGetNumberField(TEXT("focalLengthMm"), FocalLengthMm))
			{
				Packet.FocalLength = static_cast<float>(FocalLengthMm);
			}
			double ApertureTStop = 0.0;
			if ((*CameraObj)->TryGetNumberField(TEXT("apertureTStop"), ApertureTStop))
			{
				Packet.Aperture = static_cast<float>(ApertureTStop);
			}
		}

		const TSharedPtr<FJsonObject>* StatusObj = nullptr;
		if (JsonObject->TryGetObjectField(TEXT("status"), StatusObj) && StatusObj)
		{
			(*StatusObj)->TryGetBoolField(TEXT("isRecording"), Packet.bIsRecording);
		}

		// The camera packet carries no take name -- metadata is free-form extraProperties,
		// so read it only if the sender chose to put one there. Left empty otherwise
		// rather than filled with a stand-in that would read as real take data.
		const TSharedPtr<FJsonObject>* MetadataObj = nullptr;
		if (JsonObject->TryGetObjectField(TEXT("metadata"), MetadataObj) && MetadataObj)
		{
			(*MetadataObj)->TryGetStringField(TEXT("activeTake"), Packet.ActiveTakeName);
		}

		if (TargetCameraActor)
		{
			TargetCameraActor->SetActorLocation(Packet.Location);
			TargetCameraActor->SetActorRotation(Packet.Rotation);
			
			if (UCineCameraComponent* CineCamComp = TargetCameraActor->GetCineCameraComponent())
			{
				CineCamComp->CurrentFocalLength = Packet.FocalLength;
				CineCamComp->CurrentAperture = Packet.Aperture;
			}
		}

		OnPacketReceived.Broadcast(Packet);
	}
}
