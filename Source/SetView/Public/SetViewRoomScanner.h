#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ProceduralMeshComponent.h"
#include "SetViewRoomScanner.generated.h"

USTRUCT(BlueprintType)
struct FSetViewPlaneAnchor
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "SetView|Scan")
	FString AnchorId;

	UPROPERTY(BlueprintReadWrite, Category = "SetView|Scan")
	FVector Center;

	UPROPERTY(BlueprintReadWrite, Category = "SetView|Scan")
	FVector Normal;

	UPROPERTY(BlueprintReadWrite, Category = "SetView|Scan")
	FVector2D Extents;

	UPROPERTY(BlueprintReadWrite, Category = "SetView|Scan")
	FString Label; // Floor, Ceiling, Wall, Door, Window
};

UCLASS(Blueprintable, ClassGroup=(SetView))
class SETVIEW_API ASetViewRoomScanner : public AActor
{
	GENERATED_BODY()

public:
	ASetViewRoomScanner();

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "SetView|Scan")
	UProceduralMeshComponent* ProceduralMesh;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SetView|Scan")
	UMaterialInterface* ScanMaterial;

	UPROPERTY(BlueprintReadOnly, Category = "SetView|Scan")
	TArray<FSetViewPlaneAnchor> DetectedPlanes;

	UFUNCTION(BlueprintCallable, Category = "SetView|Scan")
	void ReconstructRoomFromPointCloud(const TArray<FVector>& Positions, const TArray<FColor>& Colors);

	UFUNCTION(BlueprintCallable, Category = "SetView|Scan")
	void GenerateArchitecturalWallPlanes(const TArray<FSetViewPlaneAnchor>& Planes, float WallThicknessCm = 15.0f);

	UFUNCTION(BlueprintCallable, Category = "SetView|Scan")
	void ClearScanMesh();
};
