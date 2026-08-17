#pragma once

#include "CoreMinimal.h"
#include "CineCameraActor.h"
#include "SetViewCameraGripActor.generated.h"

UENUM(BlueprintType)
enum class ESetViewGripRigType : uint8
{
	FreeHandHeld   UMETA(DisplayName = "Handheld Free 6DoF"),
	Tripod         UMETA(DisplayName = "Heavy Studio Tripod"),
	Steadicam      UMETA(DisplayName = "Inertial Steadicam Arm"),
	DollyTrack     UMETA(DisplayName = "Chapman Dolly on Track"),
	Technocrane    UMETA(DisplayName = "Telescopic Technocrane"),
	DroneUAV       UMETA(DisplayName = "Aerodynamic Drone UAV")
};

UCLASS(Blueprintable, ClassGroup=(SetView))
class SETVIEW_API ASetViewCameraGripActor : public ACineCameraActor
{
	GENERATED_BODY()

public:
	ASetViewCameraGripActor();

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SetView|Grip")
	ESetViewGripRigType GripType = ESetViewGripRigType::Steadicam;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SetView|Grip")
	float MassKg = 18.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SetView|Grip")
	float SpringStiffness = 85.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SetView|Grip")
	float DampingRatio = 0.85f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SetView|Grip")
	float CraneMaxReachCm = 650.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SetView|Grip")
	FVector CranePivotLocation = FVector::ZeroVector;

	UFUNCTION(BlueprintCallable, Category = "SetView|Grip")
	void UpdateGripTarget(const FVector& TargetLocation, const FRotator& TargetRotation, float DeltaTime);

protected:
	virtual void Tick(float DeltaTime) override;

private:
	FVector CurrentVelocity = FVector::ZeroVector;
	FVector CurrentFilteredLocation = FVector::ZeroVector;
	FRotator CurrentFilteredRotation = FRotator::ZeroRotator;
};
