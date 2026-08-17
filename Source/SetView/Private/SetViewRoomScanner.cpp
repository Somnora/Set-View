#include "SetViewRoomScanner.h"

ASetViewRoomScanner::ASetViewRoomScanner()
{
	PrimaryActorTick.bCanEverTick = false;

	ProceduralMesh = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("ProceduralMesh"));
	RootComponent = ProceduralMesh;
	ProceduralMesh->bUseAsyncCooking = true;
	ProceduralMesh->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
}

void ASetViewRoomScanner::ClearScanMesh()
{
	if (ProceduralMesh)
	{
		ProceduralMesh->ClearAllMeshSections();
	}
	DetectedPlanes.Empty();
}

void ASetViewRoomScanner::ReconstructRoomFromPointCloud(const TArray<FVector>& Positions, const TArray<FColor>& Colors)
{
	if (!ProceduralMesh || Positions.Num() < 3) return;

	TArray<FVector> Vertices;
	TArray<int32> Triangles;
	TArray<FVector> Normals;
	TArray<FVector2D> UV0;
	TArray<FColor> VertexColors;
	TArray<FProcMeshTangent> Tangents;

	// Triangulate or generate point quads for point clouds
	for (int32 i = 0; i < Positions.Num(); ++i)
	{
		FVector P = Positions[i];
		FColor C = (i < Colors.Num()) ? Colors[i] : FColor::White;

		float QuadSize = 4.0f; // 4cm splat quad
		int32 BaseIdx = Vertices.Num();

		Vertices.Add(P + FVector(0, -QuadSize, -QuadSize));
		Vertices.Add(P + FVector(0,  QuadSize, -QuadSize));
		Vertices.Add(P + FVector(0,  QuadSize,  QuadSize));
		Vertices.Add(P + FVector(0, -QuadSize,  QuadSize));

		Normals.Add(FVector(1, 0, 0));
		Normals.Add(FVector(1, 0, 0));
		Normals.Add(FVector(1, 0, 0));
		Normals.Add(FVector(1, 0, 0));

		UV0.Add(FVector2D(0, 0));
		UV0.Add(FVector2D(1, 0));
		UV0.Add(FVector2D(1, 1));
		UV0.Add(FVector2D(0, 1));

		VertexColors.Add(C);
		VertexColors.Add(C);
		VertexColors.Add(C);
		VertexColors.Add(C);

		Triangles.Add(BaseIdx + 0);
		Triangles.Add(BaseIdx + 1);
		Triangles.Add(BaseIdx + 2);

		Triangles.Add(BaseIdx + 0);
		Triangles.Add(BaseIdx + 2);
		Triangles.Add(BaseIdx + 3);
	}

	ProceduralMesh->CreateMeshSection(0, Vertices, Triangles, Normals, UV0, VertexColors, Tangents, true);
	if (ScanMaterial)
	{
		ProceduralMesh->SetMaterial(0, ScanMaterial);
	}
}

void ASetViewRoomScanner::GenerateArchitecturalWallPlanes(const TArray<FSetViewPlaneAnchor>& Planes, float WallThicknessCm)
{
	if (!ProceduralMesh || Planes.Num() == 0) return;

	DetectedPlanes = Planes;
	TArray<FVector> Vertices;
	TArray<int32> Triangles;
	TArray<FVector> Normals;
	TArray<FVector2D> UV0;
	TArray<FColor> VertexColors;
	TArray<FProcMeshTangent> Tangents;

	for (int32 i = 0; i < Planes.Num(); ++i)
	{
		const FSetViewPlaneAnchor& Plane = Planes[i];
		FVector Right = FVector::CrossProduct(Plane.Normal, FVector::UpVector).GetSafeNormal();
		if (Right.IsNearlyZero())
		{
			Right = FVector::CrossProduct(Plane.Normal, FVector::ForwardVector).GetSafeNormal();
		}
		FVector Up = FVector::CrossProduct(Right, Plane.Normal).GetSafeNormal();

		float HalfW = Plane.Extents.X * 0.5f;
		float HalfH = Plane.Extents.Y * 0.5f;

		int32 BaseIdx = Vertices.Num();

		Vertices.Add(Plane.Center - Right * HalfW - Up * HalfH);
		Vertices.Add(Plane.Center + Right * HalfW - Up * HalfH);
		Vertices.Add(Plane.Center + Right * HalfW + Up * HalfH);
		Vertices.Add(Plane.Center - Right * HalfW + Up * HalfH);

		for (int32 j = 0; j < 4; ++j)
		{
			Normals.Add(Plane.Normal);
			VertexColors.Add(FColor(200, 220, 240, 255));
		}

		UV0.Add(FVector2D(0, 0));
		UV0.Add(FVector2D(Plane.Extents.X / 100.0f, 0));
		UV0.Add(FVector2D(Plane.Extents.X / 100.0f, Plane.Extents.Y / 100.0f));
		UV0.Add(FVector2D(0, Plane.Extents.Y / 100.0f));

		Triangles.Add(BaseIdx + 0);
		Triangles.Add(BaseIdx + 1);
		Triangles.Add(BaseIdx + 2);

		Triangles.Add(BaseIdx + 0);
		Triangles.Add(BaseIdx + 2);
		Triangles.Add(BaseIdx + 3);
	}

	ProceduralMesh->CreateMeshSection(1, Vertices, Triangles, Normals, UV0, VertexColors, Tangents, true);
}
