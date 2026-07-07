// ---------------------------------------------------------------------------
// Location scanning: reads the headset's Scene Mesh (WebXR mesh-detection)
// off a live XRFrame and snapshots it into a LocationScan in scene space.
//
// The platform does the actual reconstruction (the Quest builds the mesh from
// its cameras + depth during Space Setup / room scanning); this module copies
// the tracked geometry out and re-bases it from per-mesh XR spaces into scene
// space (contentRoot local) so the scan lands in the same coordinates actors
// and cameras use — meters, y-up, y=0 floor.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { uid } from './model.ts';
import type { LocationScan, ScanMeshData } from './scan.ts';
import { transformPositions } from './scan.ts';

const _meshMatrix = new THREE.Matrix4();

/**
 * Snapshots every tracked mesh this frame. Returns null when mesh-detection
 * is unavailable or nothing is tracked yet (caller keeps polling — the set
 * fills a few frames after the session grants the feature, or after Space
 * Setup completes).
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
  if (!detected || detected.size === 0) return null;
  const meshes: ScanMeshData[] = [];
  for (const mesh of detected) {
    const pose = frame.getPose(mesh.meshSpace, refSpace);
    if (!pose) continue; // untracked this frame — skip rather than misplace
    if (mesh.vertices.length < 9 || mesh.indices.length < 3) continue;
    // scene = worldToScene × (meshSpace → reference space) applied per vertex.
    _meshMatrix.fromArray(pose.transform.matrix).premultiply(worldToScene);
    const positions = new Float32Array(mesh.vertices); // snapshot — XR owns the original
    transformPositions(positions, _meshMatrix.elements);
    meshes.push({
      label: mesh.semanticLabel ?? 'global mesh',
      positions,
      indices: new Uint32Array(mesh.indices),
    });
  }
  if (meshes.length === 0) return null;
  return { version: 1, id: uid(), capturedAt: Date.now(), meshes };
}
