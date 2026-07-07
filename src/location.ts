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
import type { LocationScan } from './scan.ts';

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

export class LocationRenderer {
  /** Parent under contentRoot. */
  readonly group = new THREE.Group();
  mode: LocationMode = 'hidden';

  /** One shared material per distinct color; retuned when the mode changes. */
  private materials = new Map<number, THREE.MeshLambertMaterial>();
  private cameraPassRestore: LocationMode | null = null;

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
    for (const m of scan.meshes) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
      // Indices fit u16 for typical room meshes; three picks the array type.
      geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
      geo.computeVertexNormals(); // untextured Lambert needs normals to read as 3D
      const mesh = new THREE.Mesh(geo, this.material(labelColor(m.label)));
      mesh.name = `scan:${m.label}`;
      this.group.add(mesh);
    }
    this.applyMode();
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
    // Materials are shared/reused across scans; keep them.
  }
}

function labelColor(label: string): number {
  return LABEL_COLORS[label.toLowerCase()] ?? DEFAULT_COLOR;
}
