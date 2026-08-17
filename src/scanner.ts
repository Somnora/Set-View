// ---------------------------------------------------------------------------
// Location scanning: reads the headset's Scene Mesh (WebXR mesh-detection)
// and Room Plane capture (WebXR plane-detection) off a live XRFrame and
// snapshots it into a LocationScan in scene space.
//
// Re-bases from per-mesh XR spaces into scene space (contentRoot local)
// so the scan lands in the same coordinates actors and cameras use:
// meters, y-up, y=0 floor.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { uid } from './model.ts';
import type { LocationScan, ScanMeshData } from './scan.ts';
import { transformPositions } from './scan.ts';

const _meshMatrix = new THREE.Matrix4();

/** Structural interface for WebXR XRPlane detection fallback. */
interface XRPlaneLike {
  planeSpace: XRSpace;
  polygon: ReadonlyArray<{ x: number; y: number; z?: number }>;
  orientation?: 'horizontal' | 'vertical';
  semanticLabel?: string;
}

/** Structural interface for extended XRFrame with plane detection. */
interface XRFrameExtended extends Omit<XRFrame, 'detectedPlanes'> {
  detectedPlanes?: Set<XRPlaneLike>;
}

/** Sanitizes raw position and index buffers, rejecting non-finite values and out of bounds indices. */
function sanitizeMeshBuffers(
  rawPositions: Float32Array,
  rawIndices: Uint32Array,
): { positions: Float32Array; indices: Uint32Array } | null {
  const vertCount = Math.floor(rawPositions.length / 3);
  if (vertCount < 3) return null;

  // Validate all coordinates are finite numbers
  for (let i = 0; i < rawPositions.length; i++) {
    if (!Number.isFinite(rawPositions[i])) return null;
  }

  // Filter valid triangles whose indices are strictly within bounds and non-degenerate
  const validTriIndices: number[] = [];
  const triCount = Math.floor(rawIndices.length / 3);

  for (let t = 0; t < triCount; t++) {
    const i0 = rawIndices[t * 3];
    const i1 = rawIndices[t * 3 + 1];
    const i2 = rawIndices[t * 3 + 2];

    if (i0 < vertCount && i1 < vertCount && i2 < vertCount && i0 !== i1 && i1 !== i2 && i0 !== i2) {
      validTriIndices.push(i0, i1, i2);
    }
  }

  if (validTriIndices.length < 3) return null;

  return {
    positions: rawPositions,
    indices: new Uint32Array(validTriIndices),
  };
}

/** Converts a 2D/3D polygon from XRPlane into a triangulated ScanMeshData. */
function triangulatePlanePolygon(
  plane: XRPlaneLike,
  frame: XRFrame,
  refSpace: XRReferenceSpace,
  worldToScene: THREE.Matrix4,
): ScanMeshData | null {
  const poly = plane.polygon;
  if (!poly || poly.length < 3) return null;

  const pose = frame.getPose(plane.planeSpace, refSpace);
  if (!pose) return null;

  const matrixValid = pose.transform.matrix.every((v) => Number.isFinite(v));
  if (!matrixValid) return null;

  _meshMatrix.fromArray(pose.transform.matrix).premultiply(worldToScene);

  const n = poly.length;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const pt = poly[i];
    positions[i * 3] = pt.x ?? 0;
    positions[i * 3 + 1] = pt.y ?? 0;
    positions[i * 3 + 2] = pt.z ?? 0;
  }

  transformPositions(positions, _meshMatrix.elements);

  // Triangulate convex polygon as triangle fan
  const triCount = n - 2;
  const indices = new Uint32Array(triCount * 3);
  for (let i = 0; i < triCount; i++) {
    indices[i * 3] = 0;
    indices[i * 3 + 1] = i + 1;
    indices[i * 3 + 2] = i + 2;
  }

  const label = plane.semanticLabel
    ? plane.semanticLabel.toLowerCase()
    : plane.orientation === 'horizontal'
      ? 'floor'
      : 'wall';

  return {
    label,
    positions,
    indices,
  };
}

/**
 * Snapshots every tracked mesh and detected plane this frame into a LocationScan in scene space.
 * Returns null when mesh/plane detection is unavailable or nothing is tracked yet.
 *
 * `worldToScene` re-bases from the XR reference space into scene space; pass
 * the inverse of contentRoot.matrixWorld, which also folds away any active
 * teleport offset.
 */
export function captureScanFromFrame(
  frame: XRFrame,
  refSpace: XRReferenceSpace,
  worldToScene: THREE.Matrix4,
): LocationScan | null {
  const detected = frame.detectedMeshes;
  const detectedPlanes = (frame as XRFrameExtended).detectedPlanes;

  const hasMeshes = detected && detected.size > 0;
  const hasPlanes = detectedPlanes && detectedPlanes.size > 0;

  if (!hasMeshes && !hasPlanes) return null;

  const meshes: ScanMeshData[] = [];

  // 1. Process WebXR Scene Meshes
  if (hasMeshes) {
    for (const mesh of detected!) {
      const pose = frame.getPose(mesh.meshSpace, refSpace);
      if (!pose) continue; // untracked this frame, skip rather than misplace
      if (mesh.vertices.length < 9 || mesh.indices.length < 3) continue;

      const matrixValid = pose.transform.matrix.every((v) => Number.isFinite(v));
      if (!matrixValid) continue;

      _meshMatrix.fromArray(pose.transform.matrix).premultiply(worldToScene);
      const positions = new Float32Array(mesh.vertices);
      transformPositions(positions, _meshMatrix.elements);

      const rawIndices = new Uint32Array(mesh.indices);
      const sanitized = sanitizeMeshBuffers(positions, rawIndices);
      if (!sanitized) continue;

      meshes.push({
        label: mesh.semanticLabel ? mesh.semanticLabel.toLowerCase() : 'global mesh',
        positions: sanitized.positions,
        indices: sanitized.indices,
      });
    }
  }

  // 2. Process WebXR Detected Planes (fallback or complementary capture)
  if (meshes.length === 0 && hasPlanes) {
    for (const plane of detectedPlanes!) {
      const planeMesh = triangulatePlanePolygon(plane, frame, refSpace, worldToScene);
      if (planeMesh) {
        const sanitized = sanitizeMeshBuffers(planeMesh.positions, planeMesh.indices);
        if (sanitized) {
          meshes.push({
            label: planeMesh.label,
            positions: sanitized.positions,
            indices: sanitized.indices,
          });
        }
      }
    }
  }

  if (meshes.length === 0) return null;
  return { version: 1, id: uid(), capturedAt: Date.now(), meshes };
}
