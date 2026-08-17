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
		Packet.CameraName = JsonObject->GetStringField(TEXT("camera_name"));

		// Coordinate transformation from SetView (meters, Y-up) to UE5 (cm, Z-up)
		// Location: UE X = SV -Z * 100, UE Y = SV X * 100, UE Z = SV Y * 100
		if (JsonObject->HasField(TEXT("location")))
		{
			TSharedPtr<FJsonObject> LocObj = JsonObject->GetObjectField(TEXT("location"));
			double SvX = LocObj->GetNumberField(TEXT("x"));
			double SvY = LocObj->GetNumberField(TEXT("y"));
			double SvZ = LocObj->GetNumberField(TEXT("z"));
			Packet.Location = FVector(-SvZ * 100.0, SvX * 100.0, SvY * 100.0);
		}

		// Rotation: Rotator degrees (Roll, Pitch, Yaw)
		if (JsonObject->HasField(TEXT("rotation")))
		{
			TSharedPtr<FJsonObject> RotObj = JsonObject->GetObjectField(TEXT("rotation"));
			double Pitch = RotObj->GetNumberField(TEXT("pitch"));
			double Yaw = RotObj->GetNumberField(TEXT("yaw"));
			double Roll = RotObj->GetNumberField(TEXT("roll"));
			Packet.Rotation = FRotator(Pitch, Yaw, Roll);
		}

		Packet.FocalLength = JsonObject->GetNumberField(TEXT("focal_length"));
		Packet.Aperture = JsonObject->GetNumberField(TEXT("aperture"));
		Packet.bIsRecording = JsonObject->GetBoolField(TEXT("is_recording"));
		Packet.ActiveTakeName = JsonObject->GetStringField(TEXT("active_take"));

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
