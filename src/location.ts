// ---------------------------------------------------------------------------
// Location renderer: turns a LocationScan into three.js meshes under
// contentRoot, so the scanned room obeys the same view transforms as actors
// and cameras (teleport walkthrough, miniature diorama, camera view).
//
// Display modes:
//   hidden — on location, the real room is visible in passthrough; default.
//   ghost  — translucent overlay for checking scan/world alignment.
//   solid  — gray-box set for walking the location anywhere (VR walkthrough).
// Whatever the mode, the virtual camera pass temporarily forces solid so the
// monitor and photo captures frame shots inside the scanned set.
//
// Perf: flat Lambert per the app-wide budget (no shadows, no textures — the
// platform never exposes camera imagery, so scans are untextured by design).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import type { FurniturePlacement } from './model.ts';
import { isMovableScanMesh, meshFootprintCenter, quatYaw, type LocationScan } from './scan.ts';

export type LocationMode = 'hidden' | 'ghost' | 'solid';

const GHOST_OPACITY = 0.35;

/** Subtle semantic tints so walls/floor/furniture read at a glance. */
const LABEL_COLORS: Record<string, number> = {
  floor: 0x6e7480,
  ceiling: 0xb9bec8,
  'wall face': 0x9aa1ac,
  wall: 0x9aa1ac,
  table: 0x7a8aa6,
  desk: 0x7a8aa6,
  couch: 0x7a8aa6,
  bed: 0x7a8aa6,
  shelf: 0x7a8aa6,
  screen: 0x5c6a82,
  door: 0x8a97a8,
  window: 0x8a97a8,
};
const DEFAULT_COLOR = 0x8a8f98;

interface FurnitureEntry {
  mesh: THREE.Mesh;
  /** Index into the scan's mesh list (the placement key). */
  meshIndex: number;
  label: string;
  /** Captured footprint center — the mesh's rest position after re-centering. */
  center: THREE.Vector3;
}

export class LocationRenderer {
  /** Parent under contentRoot. */
  readonly group = new THREE.Group();
  mode: LocationMode = 'hidden';

  /** One shared material per distinct color; retuned when the mode changes. */
  private materials = new Map<number, THREE.MeshLambertMaterial>();
  private cameraPassRestore: LocationMode | null = null;
  /** Labeled (non-global) scan meshes, movable in Stage 1. */
  private furniture: FurnitureEntry[] = [];

  constructor() {
    this.group.name = 'location-scan';
    this.group.visible = false;
  }

  get hasScan(): boolean {
    return this.group.children.length > 0;
  }

  /** Replaces the displayed scan (null clears). Disposes prior geometry. */
  setScan(scan: LocationScan | null): void {
    this.clear();
    if (!scan) return;
    scan.meshes.forEach((m, meshIndex) => {
      const geo = new THREE.BufferGeometry();
      const movable = isMovableScanMesh(m.label);
      let center = new THREE.Vector3();
      if (movable) {
        // Re-center the geometry on its XZ footprint and put the offset in the
        // object's position, so yawing the mesh pivots the couch about itself
        // instead of orbiting the scene origin. The stored buffer is untouched
        // (positions may be shared with the persisted scan) — copy first.
        const c = meshFootprintCenter(m.positions);
        center = new THREE.Vector3(c.x, 0, c.z);
        const local = new Float32Array(m.positions);
        for (let i = 0; i + 2 < local.length; i += 3) {
          local[i] -= c.x;
          local[i + 2] -= c.z;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(local, 3));
      } else {
        geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
      }
      // Indices fit u16 for typical room meshes; three picks the array type.
      geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
      geo.computeVertexNormals(); // untextured Lambert needs normals to read as 3D
      const mesh = new THREE.Mesh(geo, this.material(labelColor(m.label)));
      mesh.name = `scan:${m.label}`;
      if (movable) {
        mesh.position.copy(center);
        mesh.userData.scanMeshIndex = meshIndex;
        this.furniture.push({ mesh, meshIndex, label: m.label, center });
      }
      this.group.add(mesh);
    });
    this.applyMode();
  }

  // --- movable furniture (Stage 1) -------------------------------------------

  /** Sets every movable mesh from its placement (absent entry = as captured). */
  applyPlacements(placements: FurniturePlacement[] | undefined): void {
    for (const f of this.furniture) {
      const p = placements?.find((x) => x.meshIndex === f.meshIndex);
      f.mesh.position.set(f.center.x + (p?.dx ?? 0), 0, f.center.z + (p?.dz ?? 0));
      f.mesh.rotation.set(0, p?.rotY ?? 0, 0);
    }
  }

  /** Raycast targets for grab — only while the scan is actually visible. */
  furnitureTargets(): THREE.Object3D[] {
    if (this.mode === 'hidden' || this.furniture.length === 0) return [];
    return this.furniture.map((f) => f.mesh);
  }

  furnitureLabel(meshIndex: number): string {
    return this.furniture.find((f) => f.meshIndex === meshIndex)?.label ?? 'furniture';
  }

  /**
   * Settles a just-released (or drag-cancelled) furniture mesh back onto the
   * floor plane — position y to 0, rotation to pure yaw — and returns its
   * placement for the scene JSON. The mesh must already be back under `group`.
   */
  commitFurniture(mesh: THREE.Object3D): FurniturePlacement | null {
    const f = this.furniture.find((x) => x.mesh === mesh);
    if (!f) return null;
    const q = mesh.quaternion;
    const rotY = quatYaw(q.x, q.y, q.z, q.w);
    mesh.position.y = 0;
    mesh.rotation.set(0, rotY, 0);
    return {
      meshIndex: f.meshIndex,
      dx: mesh.position.x - f.center.x,
      dz: mesh.position.z - f.center.z,
      rotY,
    };
  }

  setMode(mode: LocationMode): void {
    this.mode = mode;
    this.applyMode();
  }

  cycleMode(): LocationMode {
    const order: LocationMode[] = ['hidden', 'ghost', 'solid'];
    this.setMode(order[(order.indexOf(this.mode) + 1) % order.length]);
    return this.mode;
  }

  /**
   * Forces the scan visible + solid for the virtual camera's render pass, so
   * the monitor/captures show shots composed inside the scanned set even when
   * the wearer has it hidden. Call end… in a finally.
   */
  beginCameraPass(): void {
    if (this.cameraPassRestore !== null || !this.hasScan) return;
    this.cameraPassRestore = this.mode;
    this.mode = 'solid';
    this.applyMode();
  }

  endCameraPass(): void {
    if (this.cameraPassRestore === null) return;
    this.mode = this.cameraPassRestore;
    this.cameraPassRestore = null;
    this.applyMode();
  }

  private material(color: number): THREE.MeshLambertMaterial {
    let mat = this.materials.get(color);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ color });
      this.materials.set(color, mat);
    }
    return mat;
  }

  private applyMode(): void {
    this.group.visible = this.mode !== 'hidden' && this.hasScan;
    const ghost = this.mode === 'ghost';
    for (const mat of this.materials.values()) {
      mat.transparent = ghost;
      mat.opacity = ghost ? GHOST_OPACITY : 1;
      // Ghost overlays passthrough without stomping the depth of virtual set
      // pieces behind it; solid occludes like a real set wall.
      mat.depthWrite = !ghost;
      mat.needsUpdate = false;
    }
  }

  private clear(): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      (child as THREE.Mesh).geometry?.dispose();
    }
    this.furniture = [];
    // Materials are shared/reused across scans; keep them.
  }
}

function labelColor(label: string): number {
  return LABEL_COLORS[label.toLowerCase()] ?? DEFAULT_COLOR;
}
