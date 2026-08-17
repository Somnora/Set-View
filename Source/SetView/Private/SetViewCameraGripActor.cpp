#include "SetViewCameraGripActor.h"

ASetViewCameraGripActor::ASetViewCameraGripActor()
{
	PrimaryActorTick.bCanEverTick = true;
}

void ASetViewCameraGripActor::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);
}

void ASetViewCameraGripActor::UpdateGripTarget(const FVector& TargetLocation, const FRotator& TargetRotation, float DeltaTime)
{
	if (DeltaTime <= 0.0f) return;

	FVector DesiredLocation = TargetLocation;

	// Clamp to crane spherical reach limit if Technocrane
	if (GripType == ESetViewGripRigType::Technocrane)
	{
		FVector Offset = DesiredLocation - CranePivotLocation;
		if (Offset.Size() > CraneMaxReachCm)
		{
			DesiredLocation = CranePivotLocation + Offset.GetSafeNormal() * CraneMaxReachCm;
		}
	}

	// Apply 2nd order mass-spring-damper physics
	float Omega = FMath::Sqrt(FMath::Max(1.0f, SpringStiffness / FMath::Max(1.0f, MassKg)));
	FVector Displacement = DesiredLocation - CurrentFilteredLocation;
	FVector SpringForce = Displacement * (Omega * Omega);
	FVector DampingForce = CurrentVelocity * (2.0f * DampingRatio * Omega);
	FVector Acceleration = SpringForce - DampingForce;

	CurrentVelocity += Acceleration * DeltaTime;
	CurrentFilteredLocation += CurrentVelocity * DeltaTime;

	// Smooth rotational interpolation
	CurrentFilteredRotation = FMath::RInterpTo(CurrentFilteredRotation, TargetRotation, DeltaTime, 12.0f);

	SetActorLocation(CurrentFilteredLocation);
	SetActorRotation(CurrentFilteredRotation);
}
