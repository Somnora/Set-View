// ---------------------------------------------------------------------------
// Location renderer: turns a LocationScan into three.js meshes under
// contentRoot, so the scanned room obeys the same view transforms as actors
// and cameras (teleport walkthrough, miniature diorama, camera view).
//
// Display modes:
//   hidden    - on location, the real room is visible in passthrough; default.
//   ghost     - translucent overlay for checking scan/world alignment.
//   solid     - gray-box set for walking the location anywhere (VR walkthrough).
//   wireframe - semantic wireframe overlay for scouting spatial layout.
//
// Whatever the mode, the virtual camera pass temporarily forces solid so the
// monitor and photo captures frame shots inside the scanned set.
//
// Perf: flat Lambert per the app-wide budget (no shadows, no textures - the
// platform never exposes camera imagery, so scans are untextured by design).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import type { FurniturePlacement } from './model.ts';
import { isMovableScanMesh, meshFootprintCenter, quatYaw, type LocationScan } from './scan.ts';

export type LocationMode = 'hidden' | 'ghost' | 'solid' | 'wireframe';

const GHOST_OPACITY = 0.35;
const WIREFRAME_OPACITY = 0.85;

/** Subtle semantic tints so walls/floor/furniture read at a glance. */
const LABEL_COLORS: Record<string, number> = {
  floor: 0x6e7480,
  ceiling: 0xb9bec8,
  'wall face': 0x9aa1ac,
  wall: 0x9aa1ac,
  walls: 0x9aa1ac,
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
  /** Captured footprint center - the mesh's rest position after re-centering. */
  center: THREE.Vector3;
}

export interface RoomDimensions {
  min: THREE.Vector3;
  max: THREE.Vector3;
  widthM: number;
  depthM: number;
  heightM: number;
}

export class LocationRenderer {
  /** Parent under contentRoot. */
  readonly group = new THREE.Group();
  mode: LocationMode = 'hidden';

  /** Whether a wireframe edge overlay is active on top of solid / ghost rendering. */
  wireframeOverlay = false;

  /** Floor level vertical offset in meters (for manual or auto leveling). */
  floorOffset = 0;

  /** Whether the room bounding box visualizer is enabled. */
  showBounds = false;

  /** One shared material per distinct color; retuned when the mode changes. */
  private materials = new Map<number, THREE.MeshLambertMaterial>();
  private cameraPassRestore: LocationMode | null = null;
  /** Labeled (non-global) scan meshes, movable in Stage 1. */
  private furniture: FurnitureEntry[] = [];
  /** Active scan geometry bounding box info. */
  private activeDimensions: RoomDimensions | null = null;
  /** Bounding box visualization group. */
  private boundsGroup = new THREE.Group();
  /** Wireframe overlay line segments. */
  private wireframeLines: THREE.LineSegments[] = [];

  constructor() {
    this.group.name = 'location-scan';
    this.group.visible = false;
    this.boundsGroup.name = 'location-scan-bounds';
    this.boundsGroup.visible = false;
    this.group.add(this.boundsGroup);
  }

  get hasScan(): boolean {
    return this.furniture.length > 0 || this.group.children.some((c) => c !== this.boundsGroup);
  }

  get dimensions(): RoomDimensions | null {
    return this.activeDimensions;
  }

  /** Replaces the displayed scan (null clears). Disposes prior geometry. */
  setScan(scan: LocationScan | null): void {
    this.clear();
    if (!scan) return;

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;

    scan.meshes.forEach((m, meshIndex) => {
      const geo = new THREE.BufferGeometry();
      const movable = isMovableScanMesh(m.label);
      let center = new THREE.Vector3();

      for (let i = 0; i + 2 < m.positions.length; i += 3) {
        const x = m.positions[i];
        const y = m.positions[i + 1];
        const z = m.positions[i + 2];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }

      if (movable) {
        // Re-center the geometry on its XZ footprint and put the offset in the
        // object's position, so yawing the mesh pivots the couch about itself
        // instead of orbiting the scene origin. The stored buffer is untouched.
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

      geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, this.material(labelColor(m.label)));
      mesh.name = `scan:${m.label}`;
      if (movable) {
        mesh.position.copy(center);
        mesh.userData.scanMeshIndex = meshIndex;
        this.furniture.push({ mesh, meshIndex, label: m.label, center });
      }
      this.group.add(mesh);

      // Create optional wireframe overlay edges
      const wireGeo = new THREE.WireframeGeometry(geo);
      const wireMat = new THREE.LineBasicMaterial({
        color: labelColor(m.label),
        transparent: true,
        opacity: 0.4,
      });
      const wireLine = new THREE.LineSegments(wireGeo, wireMat);
      wireLine.name = `scan-wire:${m.label}`;
      if (movable) {
        wireLine.position.copy(center);
      }
      wireLine.visible = this.wireframeOverlay;
      this.wireframeLines.push(wireLine);
      this.group.add(wireLine);
    });

    if (minX !== Infinity) {
      this.activeDimensions = {
        min: new THREE.Vector3(minX, minY, minZ),
        max: new THREE.Vector3(maxX, maxY, maxZ),
        widthM: maxX - minX,
        depthM: maxZ - minZ,
        heightM: maxY - minY,
      };
      this.rebuildBoundingBox();
    }

    this.group.position.y = this.floorOffset;
    this.applyMode();
  }

  // --- floor leveling & alignment --------------------------------------------

  /** Sets vertical floor leveling offset in meters. */
  setFloorOffset(offsetY: number): void {
    this.floorOffset = offsetY;
    this.group.position.y = this.floorOffset;
  }

  /** Automatically adjusts floor level so the lowest floor geometry rests at y=0. */
  autoLevelFloor(): number {
    if (!this.activeDimensions) return 0;
    const lowestY = this.activeDimensions.min.y;
    const correction = -lowestY;
    this.setFloorOffset(correction);
    return correction;
  }

  // --- wireframe overlay & bounding box visualization ------------------------

  setWireframeOverlay(enabled: boolean): void {
    this.wireframeOverlay = enabled;
    for (const w of this.wireframeLines) {
      w.visible = enabled && this.mode !== 'hidden';
    }
  }

  toggleBounds(show?: boolean): boolean {
    this.showBounds = show !== undefined ? show : !this.showBounds;
    this.boundsGroup.visible = this.showBounds && this.mode !== 'hidden' && this.hasScan;
    return this.showBounds;
  }

  private rebuildBoundingBox(): void {
    while (this.boundsGroup.children.length > 0) {
      const child = this.boundsGroup.children[0];
      this.boundsGroup.remove(child);
      if ((child as THREE.Mesh).geometry) {
        (child as THREE.Mesh).geometry.dispose();
      }
    }

    if (!this.activeDimensions) return;
    const { min, max, widthM, depthM, heightM } = this.activeDimensions;
    if (widthM <= 0 || depthM <= 0 || heightM <= 0) return;

    const center = new THREE.Vector3(
      (min.x + max.x) / 2,
      (min.y + max.y) / 2,
      (min.z + max.z) / 2,
    );

    const boxGeo = new THREE.BoxGeometry(widthM, heightM, depthM);
    const wireGeo = new THREE.WireframeGeometry(boxGeo);
    boxGeo.dispose();

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x66ccff,
      transparent: true,
      opacity: 0.75,
    });

    const wireBox = new THREE.LineSegments(wireGeo, lineMat);
    wireBox.position.copy(center);
    this.boundsGroup.add(wireBox);
    this.boundsGroup.visible = this.showBounds && this.mode !== 'hidden';
  }

  // --- movable furniture (Stage 1) -------------------------------------------

  /** Sets every movable mesh from its placement (absent entry = as captured). */
  applyPlacements(placements: FurniturePlacement[] | undefined): void {
    for (const f of this.furniture) {
      const p = placements?.find((x) => x.meshIndex === f.meshIndex);
      f.mesh.position.set(f.center.x + (p?.dx ?? 0), 0, f.center.z + (p?.dz ?? 0));
      f.mesh.rotation.set(0, p?.rotY ?? 0, 0);

      // Match wireframe overlay placement if present
      const wire = this.wireframeLines.find((w) => w.name === `scan-wire:${f.label}`);
      if (wire) {
        wire.position.copy(f.mesh.position);
        wire.rotation.copy(f.mesh.rotation);
      }
    }
  }

  /** Raycast targets for grab - only while the scan is actually visible. */
  furnitureTargets(): THREE.Object3D[] {
    if (this.mode === 'hidden' || this.furniture.length === 0) return [];
    return this.furniture.map((f) => f.mesh);
  }

  furnitureLabel(meshIndex: number): string {
    return this.furniture.find((f) => f.meshIndex === meshIndex)?.label ?? 'furniture';
  }

  /**
   * Settles a just-released (or drag-cancelled) furniture mesh back onto the
   * floor plane: position y to 0, rotation to pure yaw; returns placement.
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
    const order: LocationMode[] = ['hidden', 'ghost', 'solid', 'wireframe'];
    this.setMode(order[(order.indexOf(this.mode) + 1) % order.length]);
    return this.mode;
  }

  /**
   * Forces the scan visible + solid for the virtual camera's render pass, so
   * the monitor/captures show shots composed inside the scanned set even when
   * the wearer has it hidden. Call endCameraPass in a finally.
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
    this.boundsGroup.visible = this.showBounds && this.mode !== 'hidden' && this.hasScan;

    const ghost = this.mode === 'ghost';
    const isWireframe = this.mode === 'wireframe';

    for (const mat of this.materials.values()) {
      mat.wireframe = isWireframe;
      mat.transparent = ghost || isWireframe;
      mat.opacity = ghost ? GHOST_OPACITY : isWireframe ? WIREFRAME_OPACITY : 1;
      mat.depthWrite = !ghost && !isWireframe;
      mat.needsUpdate = false;
    }

    for (const w of this.wireframeLines) {
      w.visible = (this.wireframeOverlay || isWireframe) && this.mode !== 'hidden';
    }
  }

  private clear(): void {
    for (const child of [...this.group.children]) {
      if (child === this.boundsGroup) continue;
      this.group.remove(child);
      (child as THREE.Mesh).geometry?.dispose();
    }
    this.furniture = [];
    this.wireframeLines = [];
    this.activeDimensions = null;
    while (this.boundsGroup.children.length > 0) {
      const b = this.boundsGroup.children[0];
      this.boundsGroup.remove(b);
      (b as THREE.Mesh).geometry?.dispose();
    }
  }
}

function labelColor(label: string): number {
  return LABEL_COLORS[label.toLowerCase()] ?? DEFAULT_COLOR;
}
