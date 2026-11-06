// ---------------------------------------------------------------------------
// Walls, doors and windows from scene data (SceneData.architecture), drawn on
// the Quest 3 budget (roadmap P2.1).
//
//   - Flat MeshLambertMaterial, cached per color (glass: transparent Lambert),
//     no shadows and no textures, like the rest of the scene.
//   - Each wall's fixed parts are merged per material, so a plain wall is one
//     draw call. Openings add one call per extra color (frames, glass), and each
//     door leaf stays a separate mesh so it can still swing or slide.
//   - Every mesh carries userData.wallId for raycasting.
//   - setArchitecture rebuilds only when the walls changed, so undo, redo and
//     collab refreshes that do not touch walls cost one string compare.
//
// Wall local frame: +X along start -> end, +Y up, origin at the start point
// (y = the floor under the wall), the wall's thickness centred on its baseline.
// The group belongs under contentRoot, so walls move with Re-align, the
// diorama and the desktop preview like every other piece of scene content.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ArchitecturalSet, DoorData, WallData, WindowData } from './architecture.ts';

interface OpeningSpan {
  kind: 'window' | 'door';
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  windowData?: WindowData;
  doorData?: DoorData;
}

const FRAME_THICK = 0.04;
const DEFAULT_WINDOW_FRAME = '#334155';
const DEFAULT_DOOR_FINISH = '#78350f';
const DOOR_FRAME = '#1e293b';
const DOOR_HANDLE = '#e2e8f0';
const DEFAULT_GLASS = '#e0f2fe';
const DEFAULT_GLASS_OPACITY = 0.35;

/** Box geometry moved into place (rotated about Z first, then translated). */
function box(w: number, h: number, d: number, x: number, y: number, z: number, rotZ = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotZ) g.rotateZ(rotZ);
  g.translate(x, y, z);
  return g;
}

/** Geometry gathered per material, merged into one mesh each. */
class PartBatch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(mat: THREE.Material, geo: THREE.BufferGeometry): void {
    const list = this.parts.get(mat);
    if (list) list.push(geo);
    else this.parts.set(mat, [geo]);
  }

  /** One mesh per material, added to `parent`. Source geometries are freed after a merge. */
  build(parent: THREE.Object3D, name: string): void {
    for (const [mat, geos] of this.parts) {
      let geo = geos[0];
      if (geos.length > 1) {
        geo = mergeGeometries(geos, false) ?? geos[0];
        if (geo !== geos[0]) for (const g of geos) g.dispose();
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name;
      if ((mat as THREE.Material).transparent) mesh.renderOrder = 1;
      parent.add(mesh);
    }
    this.parts.clear();
  }
}

export class ArchitectureRenderer {
  /** Every wall, under contentRoot. Stable for the renderer's lifetime. */
  readonly group = new THREE.Group();
  private wallGroups = new Map<string, THREE.Group>();
  private materials = new Map<string, THREE.MeshLambertMaterial>();
  /** The walls last shown by setArchitecture, as JSON; '' forces a rebuild. */
  private shownSignature = '';

  constructor() {
    this.group.name = 'architecture';
  }

  /** Number of walls on display. */
  get wallCount(): number {
    return this.wallGroups.size;
  }

  /**
   * Shows a scene's walls (none for null). Rebuilds only when they differ from
   * what is on display; a rebuild allocates, so it belongs to user-paced edits,
   * never to a frame.
   */
  setArchitecture(set: ArchitecturalSet | null | undefined): void {
    const walls = set?.walls ?? [];
    const signature = JSON.stringify(walls);
    if (signature === this.shownSignature && this.wallGroups.size === walls.length) return;
    this.clearWalls();
    for (const wall of walls) this.group.add(this.createWallMesh(wall));
    this.shownSignature = signature;
  }

  /** Replaces what is shown with a whole set and returns the group holding it. */
  createArchitecturalSetMesh(set: ArchitecturalSet): THREE.Group {
    this.shownSignature = '';
    this.setArchitecture(set);
    return this.group;
  }

  /**
   * Builds one wall with its openings and registers it (updateDoorAngle finds
   * it), without adding it to the group.
   */
  createWallMesh(wall: WallData): THREE.Group {
    const wallRoot = new THREE.Group();
    wallRoot.name = `wall_${wall.id}`;
    wallRoot.userData = { wallId: wall.id };
    this.wallGroups.set(wall.id, wallRoot);

    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const lengthM = Math.hypot(dx, dz);
    if (lengthM < 1e-4 || !(wall.heightM > 0) || !(wall.thicknessM > 0)) return wallRoot;

    // Local +X onto the wall direction: a rotation of atan2(dx, dz) - 90 deg about +Y.
    wallRoot.position.set(wall.start.x, wall.start.y, wall.start.z);
    wallRoot.rotation.y = Math.atan2(dx, dz) - Math.PI / 2;

    const h = wall.heightM;
    const t = wall.thicknessM;
    const wallMat = this.solid(wall.tintHex);
    const fixed = new PartBatch();

    const openings: OpeningSpan[] = [];
    for (const win of wall.windows ?? []) {
      const xMin = clamp(win.offsetAlongWallM, 0, lengthM);
      const xMax = clamp(win.offsetAlongWallM + win.widthM, 0, lengthM);
      const yMin = clamp(win.heightFromFloorM, 0, h);
      const yMax = clamp(win.heightFromFloorM + win.heightM, 0, h);
      if (xMax > xMin && yMax > yMin) openings.push({ kind: 'window', xMin, xMax, yMin, yMax, windowData: win });
    }
    for (const door of wall.doors ?? []) {
      const xMin = clamp(door.offsetAlongWallM, 0, lengthM);
      const xMax = clamp(door.offsetAlongWallM + door.widthM, 0, lengthM);
      const yMax = clamp(door.heightM, 0, h);
      if (xMax > xMin && yMax > 0) openings.push({ kind: 'door', xMin, xMax, yMin: 0, yMax, doorData: door });
    }
    openings.sort((a, b) => a.xMin - b.xMin);

    // The wall itself: full-height blocks between openings, a lintel above each
    // opening and a sill block under each window.
    let currentX = 0;
    for (const op of openings) {
      if (op.xMin > currentX + 1e-4) {
        const w = op.xMin - currentX;
        fixed.add(wallMat, box(w, h, t, currentX + w / 2, h / 2, 0));
      }
      const ow = op.xMax - op.xMin;
      if (op.yMax < h - 1e-4) fixed.add(wallMat, box(ow, h - op.yMax, t, op.xMin + ow / 2, (op.yMax + h) / 2, 0));
      if (op.kind === 'window' && op.yMin > 1e-4) fixed.add(wallMat, box(ow, op.yMin, t, op.xMin + ow / 2, op.yMin / 2, 0));

      if (op.windowData) {
        this.addWindow(fixed, op.windowData, t, op.xMin + ow / 2, (op.yMin + op.yMax) / 2, ow, op.yMax - op.yMin);
      } else if (op.doorData) {
        wallRoot.add(this.buildDoor(fixed, op.doorData, t, op.xMin, ow, op.yMax));
      }
      currentX = Math.max(currentX, op.xMax);
    }
    if (lengthM > currentX + 1e-4) {
      const w = lengthM - currentX;
      fixed.add(wallMat, box(w, h, t, currentX + w / 2, h / 2, 0));
    }

    fixed.build(wallRoot, `wall_solid_${wall.id}`);
    wallRoot.traverse((o) => {
      o.userData.wallId = wall.id;
    });
    return wallRoot;
  }

  /** Frame, glass and muntins of a window centred at (cx, cy) in the wall's frame. */
  private addWindow(fixed: PartBatch, win: WindowData, wallT: number, cx: number, cy: number, w: number, h: number): void {
    const frameMat = this.solid(win.frameColorHex ?? DEFAULT_WINDOW_FRAME);
    const glassMat = this.glass(win.glassTintHex ?? DEFAULT_GLASS, win.glassOpacity ?? DEFAULT_GLASS_OPACITY);
    const f = FRAME_THICK;
    const depth = wallT + 0.02; // stands slightly proud of both faces
    const innerH = Math.max(0.001, h - f * 2);
    const glassW = Math.max(0.001, w - f * 2);
    fixed.add(frameMat, box(w, f, depth, cx, cy + h / 2 - f / 2, 0));
    fixed.add(frameMat, box(w, f, depth + 0.04, cx, cy - h / 2 + f / 2, 0)); // sill
    fixed.add(frameMat, box(f, innerH, depth, cx - w / 2 + f / 2, cy, 0));
    fixed.add(frameMat, box(f, innerH, depth, cx + w / 2 - f / 2, cy, 0));
    fixed.add(glassMat, box(glassW, innerH, 0.008, cx, cy, 0));
    if (win.type === 'casement') {
      fixed.add(frameMat, box(0.025, innerH, depth * 0.7, cx, cy, 0));
    } else if (win.type === 'sash') {
      fixed.add(frameMat, box(glassW, 0.035, depth * 0.75, cx, cy, 0));
    } else if (win.type === 'stained_glass') {
      fixed.add(frameMat, box(0.02, innerH, 0.015, cx, cy, 0, Math.PI / 4));
      fixed.add(frameMat, box(0.02, innerH, 0.015, cx, cy, 0, -Math.PI / 4));
    }
  }

  /**
   * A door's frame goes into the wall's fixed parts; its leaf (or leaves) is
   * returned in a group at the opening, on a hinge or slide the open angle moves.
   */
  private buildDoor(fixed: PartBatch, door: DoorData, wallT: number, x0: number, w: number, h: number): THREE.Group {
    const group = new THREE.Group();
    group.name = `door_${door.id}`;
    group.position.set(x0, 0, 0);
    group.userData.widthM = w; // a sliding door's travel
    const frameMat = this.solid(DOOR_FRAME);
    const slabMat = this.solid(door.finishHex ?? DEFAULT_DOOR_FINISH);
    const f = FRAME_THICK;
    const depth = wallT + 0.02;
    fixed.add(frameMat, box(w, f, depth, x0 + w / 2, h - f / 2, 0));
    fixed.add(frameMat, box(f, h - f, depth, x0 + f / 2, (h - f) / 2, 0));
    fixed.add(frameMat, box(f, h - f, depth, x0 + w - f / 2, (h - f) / 2, 0));

    const slabW = Math.max(0.001, w - f * 2);
    const slabH = Math.max(0.001, h - f);
    const slabT = 0.045;
    const openDeg = door.openAngleDeg ?? 0;

    if (door.type === 'double_french') {
      const leafW = slabW / 2;
      const glassMat = this.glass(DEFAULT_GLASS, DEFAULT_GLASS_OPACITY);
      for (const side of [1, -1] as const) {
        const hinge = new THREE.Group();
        hinge.name = `door_hinge_${side === 1 ? 'left' : 'right'}_${door.id}`;
        hinge.position.set(side === 1 ? f : w - f, 0, 0);
        hinge.rotation.y = (side * openDeg * Math.PI) / 180;
        const leaf = new PartBatch();
        leaf.add(slabMat, box(leafW, slabH, slabT, (side * leafW) / 2, slabH / 2, 0));
        leaf.add(glassMat, box(leafW * 0.7, slabH * 0.75, 0.008, (side * leafW) / 2, slabH / 2, 0));
        leaf.build(hinge, `door_leaf_${door.id}`);
        group.add(hinge);
      }
    } else if (door.type === 'sliding_barn') {
      fixed.add(frameMat, box(w * 2, 0.04, 0.05, x0 + w, h + 0.05, wallT / 2 + 0.04)); // track
      const slide = new THREE.Group();
      slide.name = `door_slide_${door.id}`;
      slide.position.set(f + (openDeg / 90) * w, 0, wallT / 2 + 0.03);
      const leaf = new PartBatch();
      leaf.add(slabMat, box(slabW + 0.1, slabH + 0.05, slabT, slabW / 2, slabH / 2, 0));
      leaf.build(slide, `door_leaf_${door.id}`);
      group.add(slide);
    } else {
      const hinge = new THREE.Group();
      hinge.name = `door_hinge_${door.id}`;
      hinge.position.set(f, 0, 0);
      hinge.rotation.y = (openDeg * Math.PI) / 180;
      const leaf = new PartBatch();
      leaf.add(slabMat, box(slabW, slabH, slabT, slabW / 2, slabH / 2, 0));
      // Handle: a rosette through the leaf and a lever on each face.
      const handleMat = this.solid(DOOR_HANDLE);
      const hx = slabW - 0.08;
      const plate = new THREE.CylinderGeometry(0.03, 0.03, slabT + 0.01, 12);
      plate.rotateX(Math.PI / 2);
      plate.translate(hx, 0.95, 0);
      leaf.add(handleMat, plate);
      leaf.add(handleMat, box(0.11, 0.02, 0.02, hx - 0.04, 0.95, slabT / 2 + 0.03));
      leaf.add(handleMat, box(0.11, 0.02, 0.02, hx - 0.04, 0.95, -slabT / 2 - 0.03));
      leaf.build(hinge, `door_leaf_${door.id}`);
      group.add(hinge);
    }
    return group;
  }

  /** Swings (or slides) a door without rebuilding its wall. */
  updateDoorAngle(wallId: string, doorId: string, angleDeg: number): void {
    const wallRoot = this.wallGroups.get(wallId);
    if (!wallRoot) return;
    const rad = (angleDeg * Math.PI) / 180;
    const single = wallRoot.getObjectByName(`door_hinge_${doorId}`);
    if (single) single.rotation.y = rad;
    const left = wallRoot.getObjectByName(`door_hinge_left_${doorId}`);
    if (left) left.rotation.y = rad;
    const right = wallRoot.getObjectByName(`door_hinge_right_${doorId}`);
    if (right) right.rotation.y = -rad;
    const slide = wallRoot.getObjectByName(`door_slide_${doorId}`);
    const width = wallRoot.getObjectByName(`door_${doorId}`)?.userData.widthM as number | undefined;
    if (slide && width !== undefined) slide.position.x = FRAME_THICK + (angleDeg / 90) * width;
  }

  /** Rebuilds one wall in place. */
  updateWall(wall: WallData): void {
    this.removeWall(wall.id);
    this.group.add(this.createWallMesh(wall));
    this.shownSignature = '';
  }

  removeWall(wallId: string): void {
    const existing = this.wallGroups.get(wallId);
    if (!existing) return;
    this.group.remove(existing);
    disposeGeometries(existing);
    this.wallGroups.delete(wallId);
    this.shownSignature = '';
  }

  /** Frees every wall and material. The group stays usable (empty). */
  dispose(): void {
    this.clearWalls();
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
  }

  private clearWalls(): void {
    // The group's children too: two walls sharing an id keep only one map entry.
    for (const wallRoot of new Set([...this.group.children, ...this.wallGroups.values()])) {
      this.group.remove(wallRoot);
      disposeGeometries(wallRoot);
    }
    this.wallGroups.clear();
    this.shownSignature = '';
  }

  private solid(hex: string): THREE.MeshLambertMaterial {
    const key = `solid:${hex}`;
    let mat = this.materials.get(key);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ color: safeColor(hex, '#cbd5e1') });
      this.materials.set(key, mat);
    }
    return mat;
  }

  private glass(hex: string, opacity: number): THREE.MeshLambertMaterial {
    const o = clamp(Number.isFinite(opacity) ? opacity : DEFAULT_GLASS_OPACITY, 0.05, 1);
    const key = `glass:${hex}:${o}`;
    let mat = this.materials.get(key);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ color: safeColor(hex, DEFAULT_GLASS), transparent: true, opacity: o, depthWrite: false });
      this.materials.set(key, mat);
    }
    return mat;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** A CSS hex color three can read, or the fallback (three warns and goes white on garbage). */
function safeColor(hex: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(hex) || /^#[0-9a-f]{3}$/i.test(hex) ? hex : fallback;
}

/** Frees geometries only: materials are shared across walls and owned by the renderer. */
function disposeGeometries(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
}
