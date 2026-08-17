#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Sockets.h"
#include "SocketSubsystem.h"
#include "Common/UdpSocketBuilder.h"
#include "CineCameraActor.h"
#include "SetViewLiveLinkReceiver.generated.h"

USTRUCT(BlueprintType)
struct FSetViewCameraPacket
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "SetView")
	FString CameraName;

	UPROPERTY(BlueprintReadOnly, Category = "SetView")
	FVector Location;

	UPROPERTY(BlueprintReadOnly, Category = "SetView")
	FRotator Rotation;

	UPROPERTY(BlueprintReadOnly, Category = "SetView")
	float FocalLength;

	UPROPERTY(BlueprintReadOnly, Category = "SetView")
	float Aperture;

	UPROPERTY(BlueprintReadOnly, Category = "SetView")
	bool bIsRecording;

	UPROPERTY(BlueprintReadOnly, Category = "SetView")
	FString ActiveTakeName;
};

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSetViewCameraPacketReceived, const FSetViewCameraPacket&, Packet);

UCLASS(Blueprintable, ClassGroup=(SetView))
class SETVIEW_API ASetViewLiveLinkReceiver : public AActor
{
	GENERATED_BODY()

public:
	ASetViewLiveLinkReceiver();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SetView|LiveLink")
	int32 ListenPort = 8000;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SetView|LiveLink")
	ACineCameraActor* TargetCameraActor;

	UPROPERTY(BlueprintAssignable, Category = "SetView|LiveLink")
	FOnSetViewCameraPacketReceived OnPacketReceived;

	UFUNCTION(BlueprintCallable, Category = "SetView|LiveLink")
	bool StartListening();

	UFUNCTION(BlueprintCallable, Category = "SetView|LiveLink")
	void StopListening();

protected:
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void Tick(float DeltaTime) override;

private:
	FSocket* ListenSocket;
	TArray<uint8> ReceiveBuffer;
	void ProcessIncomingData(const FString& JsonString);
};
