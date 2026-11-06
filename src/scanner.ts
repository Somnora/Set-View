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
import {
  classifyPlane,
  GLOBAL_MESH_LABEL,
  normalizeSemanticLabel,
  planeLabel,
  sanitizeMeshBuffers,
  transformPositions,
  triangulatePolygon,
} from './scan.ts';

const _meshMatrix = new THREE.Matrix4();

/** Structural interface for WebXR XRPlane detection fallback. */
interface XRPlaneLike {
  planeSpace: XRSpace;
  polygon: ReadonlyArray<{ x: number; y: number; z?: number }>;
  orientation?: 'horizontal' | 'vertical';
  semanticLabel?: string;
  /** When the plane's polygon or pose last changed (WebXR plane-detection). */
  lastChangedTime?: number;
}

/** Structural interface for extended XRFrame with plane detection. */
interface XRFrameExtended extends Omit<XRFrame, 'detectedPlanes'> {
  detectedPlanes?: Set<XRPlaneLike>;
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
  const xz = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const pt = poly[i];
    positions[i * 3] = pt.x ?? 0;
    positions[i * 3 + 1] = pt.y ?? 0;
    positions[i * 3 + 2] = pt.z ?? 0;
    // The polygon lies in the plane's x-z plane (plane-space y is its normal).
    xz[i * 2] = pt.x ?? 0;
    xz[i * 2 + 1] = pt.z ?? 0;
  }

  transformPositions(positions, _meshMatrix.elements);

  // Ear clipping: concave outlines (an L-shaped floor) triangulate correctly,
  // and the triangles face along the plane normal.
  const indices = triangulatePolygon(xz);
  if (indices.length < 3) return null;

  // Plane pieces are marked 'plane:' (static, never grabbable). Unlabeled planes
  // (Android XR Chrome reports none) are classified by their normal and height.
  const e = _meshMatrix.elements;
  const normalUp = e[5] / (Math.hypot(e[4], e[5], e[6]) || 1);
  let sumY = 0;
  for (let i = 0; i < n; i++) sumY += positions[i * 3 + 1];
  const label = plane.semanticLabel?.trim()
    ? planeLabel(plane.semanticLabel)
    : planeLabel(classifyPlane(normalUp, sumY / n));

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
        // No label = the room shell. A blank one normalizes to 'unlabeled'; both are static.
        label: mesh.semanticLabel ? normalizeSemanticLabel(mesh.semanticLabel) : GLOBAL_MESH_LABEL,
        positions: sanitized.positions,
        indices: sanitized.indices,
      });
    }
  }

  // 2. WebXR planes, kept alongside meshes (marked 'plane:'): on Quest they are
  // the labelled walls, doors and windows, kept for turning the room into
  // editable walls; on Android XR they are the whole capture. The renderer hides
  // them when a room mesh already draws the same surfaces.
  if (hasPlanes) {
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

/**
 * Planes-only capture (Android XR): keeps every detected plane as the user
 * looks around, keyed by the XRPlane object, and re-triangulates one only
 * when its lastChangedTime moves. The caller refreshes it at most every
 * SCAN_COLLECT_INTERVAL_MS (scanFlow.ts), never per frame.
 */
export class PlaneCollector {
  private entries = new Map<object, { changed: number; mesh: ScanMeshData }>();

  get count(): number {
    return this.entries.size;
  }

  /** Reads this frame's planes into the collection. Returns the plane count. */
  refresh(frame: XRFrame, refSpace: XRReferenceSpace, worldToScene: THREE.Matrix4): number {
    const planes = (frame as unknown as XRFrameExtended).detectedPlanes;
    if (!planes) return this.entries.size;
    for (const plane of planes) {
      const changed = plane.lastChangedTime ?? 0;
      const prev = this.entries.get(plane);
      if (prev && prev.changed === changed) continue;
      const piece = triangulatePlanePolygon(plane, frame, refSpace, worldToScene);
      const clean = piece ? sanitizeMeshBuffers(piece.positions, piece.indices) : null;
      if (clean && piece) this.entries.set(plane, { changed, mesh: { label: piece.label, positions: clean.positions, indices: clean.indices } });
    }
    return this.entries.size;
  }

  /** The collection as a LocationScan, or null when empty. */
  toScan(): LocationScan | null {
    if (!this.entries.size) return null;
    const meshes = [...this.entries.values()].map((e) => e.mesh);
    return { version: 1, id: uid(), capturedAt: Date.now(), meshes };
  }

  /**
   * Writes every plane outline as line-segment endpoints into out (xyz pairs),
   * stopping when it is full. Returns the number of vertices written. Reuses
   * the caller's buffer: no allocation.
   */
  writeOutlines(out: Float32Array): number {
    let o = 0;
    for (const { mesh } of this.entries.values()) {
      const p = mesh.positions;
      const n = p.length / 3;
      for (let i = 0; i < n; i++) {
        if (o + 6 > out.length) return o / 3;
        const j = (i + 1) % n;
        out[o++] = p[i * 3];
        out[o++] = p[i * 3 + 1];
        out[o++] = p[i * 3 + 2];
        out[o++] = p[j * 3];
        out[o++] = p[j * 3 + 1];
        out[o++] = p[j * 3 + 2];
      }
    }
    return o / 3;
  }

  clear(): void {
    this.entries.clear();
  }
}
