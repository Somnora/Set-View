// ---------------------------------------------------------------------------
// Registration: lining a scanned or imported location up with the real room.
// PURE: no three.js, no DOM.
//
// SetView never puts a live registration transform on contentRoot: actor and
// camera anchors are created and read back in reference space (actors.ts
// reanchor, updateFromAnchors), so an offset there would misplace every
// anchored object. Alignment is baked into the scene data instead
// (applyRigidToScan in scan.ts, transformSceneRigid for the whole set), as a
// rigid delta: a turn about world up (+Y) followed by a translation.
//
// Rotation convention (three.js Object3D.rotation.y / Matrix4.makeRotationY):
//   x' =  x cos(a) + z sin(a)
//   z' = -x sin(a) + z cos(a)
// ---------------------------------------------------------------------------

import type { Vec3 } from './model.ts';

/** A rigid move in scene space: turn rotY (radians) about world up through the origin, then translate. */
export interface RigidDelta {
  dx: number;
  dy: number;
  dz: number;
  rotY: number;
}

export const IDENTITY_DELTA: Readonly<RigidDelta> = { dx: 0, dy: 0, dz: 0, rotY: 0 };

/** Closest two picked points may be, horizontally, for a stable two-point solve (m). */
export const MIN_TWO_POINT_SPAN_M = 0.5;
/** Residual above which a two-point fit is flagged (the two spans disagree; wrong points or units). */
export const TWO_POINT_WARN_RESIDUAL_M = 0.1;

/** Applies a delta to a point. */
export function applyRigidToPoint(d: RigidDelta, p: Vec3): Vec3 {
  const c = Math.cos(d.rotY);
  const s = Math.sin(d.rotY);
  return { x: p.x * c + p.z * s + d.dx, y: p.y + d.dy, z: -p.x * s + p.z * c + d.dz };
}

/** Rotates a horizontal vector (no translation). */
export function rotateXZ(rotY: number, x: number, z: number): { x: number; z: number } {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  return { x: x * c + z * s, z: -x * s + z * c };
}

/** Wraps an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  let r = a % (2 * Math.PI);
  if (r <= -Math.PI) r += 2 * Math.PI;
  if (r > Math.PI) r -= 2 * Math.PI;
  return r;
}

/** Column-major 4x4 of a delta (T * Ry), for composing with other transforms. */
export function rigidDeltaMatrix(d: RigidDelta): number[] {
  const c = Math.cos(d.rotY);
  const s = Math.sin(d.rotY);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, d.dx, d.dy, d.dz, 1];
}

/** b after a: the single delta equal to applying a, then b. */
export function composeRigid(a: RigidDelta, b: RigidDelta): RigidDelta {
  const t = rotateXZ(b.rotY, a.dx, a.dz);
  return { dx: t.x + b.dx, dy: a.dy + b.dy, dz: t.z + b.dz, rotY: wrapAngle(a.rotY + b.rotY) };
}

/** The delta that undoes d. */
export function invertRigid(d: RigidDelta): RigidDelta {
  const t = rotateXZ(-d.rotY, -d.dx, -d.dz);
  return { dx: t.x, dy: -d.dy, dz: t.z, rotY: wrapAngle(-d.rotY) };
}

export type TwoPointSolution =
  | {
      ok: true;
      delta: RigidDelta;
      /** RMS horizontal distance between the moved scan points and the real ones (m). */
      residual: number;
      /** The residual is large enough to doubt the fit. */
      warn: boolean;
    }
  | { ok: false; reason: string };

/**
 * The rigid move (turn about up + translation) that takes scan points
 * srcA, srcB onto real points dstA, dstB: the turn lines up the A-to-B
 * directions, the translation matches the midpoints, and the height shift is
 * the mean vertical difference. Two points cannot fix scale, so a length
 * mismatch shows up as the residual.
 */
export function solveTwoPoint(srcA: Vec3, srcB: Vec3, dstA: Vec3, dstB: Vec3, minSpan = MIN_TWO_POINT_SPAN_M): TwoPointSolution {
  const finite = [srcA, srcB, dstA, dstB].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  if (!finite) return { ok: false, reason: 'A picked point was not valid. Pick it again.' };
  const sx = srcB.x - srcA.x;
  const sz = srcB.z - srcA.z;
  const tx = dstB.x - dstA.x;
  const tz = dstB.z - dstA.z;
  const spanSrc = Math.hypot(sx, sz);
  const spanDst = Math.hypot(tx, tz);
  if (spanSrc < minSpan || spanDst < minSpan) {
    return {
      ok: false,
      reason: `Pick points at least ${minSpan} m apart (scan ${spanSrc.toFixed(2)} m, room ${spanDst.toFixed(2)} m). Farther apart is more accurate.`,
    };
  }
  // Heading of a horizontal vector under the convention above: rotating (x, z)
  // by a adds a to atan2(x, z).
  const rotY = wrapAngle(Math.atan2(tx, tz) - Math.atan2(sx, sz));
  const mid = (p: Vec3, q: Vec3) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2 });
  const ms = mid(srcA, srcB);
  const md = mid(dstA, dstB);
  const r = rotateXZ(rotY, ms.x, ms.z);
  const delta: RigidDelta = { dx: md.x - r.x, dy: md.y - ms.y, dz: md.z - r.z, rotY };
  const a = applyRigidToPoint(delta, srcA);
  const b = applyRigidToPoint(delta, srcB);
  const residual = Math.sqrt(
    ((a.x - dstA.x) ** 2 + (a.z - dstA.z) ** 2 + (b.x - dstB.x) ** 2 + (b.z - dstB.z) ** 2) / 2,
  );
  return { ok: true, delta, residual, warn: residual > TWO_POINT_WARN_RESIDUAL_M };
}

// --- two-point flow ----------------------------------------------------------

/**
 * Two-point Align, one trigger per step: a feature on the scan, the same
 * feature in the real room, then a second pair; the fit then previews until
 * applied. Back steps one point back.
 */
export type TwoPointPhase = 'scanA' | 'realA' | 'scanB' | 'realB' | 'preview';

export interface TwoPointState {
  phase: TwoPointPhase;
  srcA: Vec3 | null;
  dstA: Vec3 | null;
  srcB: Vec3 | null;
  dstB: Vec3 | null;
  solution: TwoPointSolution | null;
  /** Why the last solve was refused (cleared by the next point). */
  error: string | null;
}

export function twoPointInitial(): TwoPointState {
  return { phase: 'scanA', srcA: null, dstA: null, srcB: null, dstB: null, solution: null, error: null };
}

/** Records the point for the current step. A refused solve returns to the second scan point. */
export function twoPointAddPoint(s: TwoPointState, p: Vec3): TwoPointState {
  const pt = { x: p.x, y: p.y, z: p.z };
  switch (s.phase) {
    case 'scanA':
      return { ...s, srcA: pt, phase: 'realA', error: null };
    case 'realA':
      return { ...s, dstA: pt, phase: 'scanB', error: null };
    case 'scanB':
      return { ...s, srcB: pt, phase: 'realB', error: null };
    case 'realB': {
      const solution = solveTwoPoint(s.srcA!, s.srcB!, s.dstA!, pt);
      if (!solution.ok) return { ...s, srcB: null, dstB: null, phase: 'scanB', solution: null, error: solution.reason };
      return { ...s, dstB: pt, phase: 'preview', solution, error: null };
    }
    default:
      return s;
  }
}

/** Steps back one point (from the preview, back to the last real point). */
export function twoPointBack(s: TwoPointState): TwoPointState {
  switch (s.phase) {
    case 'preview':
      return { ...s, dstB: null, solution: null, phase: 'realB', error: null };
    case 'realB':
      return { ...s, srcB: null, phase: 'scanB', error: null };
    case 'scanB':
      return { ...s, dstA: null, phase: 'realA', error: null };
    case 'realA':
      return { ...s, srcA: null, phase: 'scanA', error: null };
    default:
      return s;
  }
}

/** One-line instruction for the wheel hub and wrist status. */
export function twoPointPrompt(s: TwoPointState): string {
  const err = s.error ? `${s.error} ` : '';
  switch (s.phase) {
    case 'scanA':
      return `${err}Trigger on a feature of the scan (point A).`;
    case 'realA':
      return `${err}Trigger on the same spot in the real room (point A).`;
    case 'scanB':
      return `${err}Trigger on a second scan feature, far from A (point B).`;
    case 'realB':
      return `${err}Trigger on the same spot in the real room (point B).`;
    case 'preview': {
      const sol = s.solution;
      const fit = sol && sol.ok ? ` Fit within ${(sol.residual * 100).toFixed(0)} cm${sol.warn ? ', check the points' : ''}.` : '';
      return `Preview.${fit} Apply to keep it, Back to repick.`;
    }
  }
}

// --- whole-scene re-registration (P1.7) ----------------------------------------

/** Unit quaternion, x y z w. */
interface Q {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** q_yaw(a) * q: turns an orientation by a about world up. */
export function yawQuat(q: Q, a: number): Q {
  const s = Math.sin(a / 2);
  const c = Math.cos(a / 2);
  // (0, s, 0, c) * (x, y, z, w)
  return {
    x: c * q.x + s * q.z,
    y: c * q.y + s * q.w,
    z: c * q.z - s * q.x,
    w: c * q.w - s * q.y,
  };
}

function quatFromEulerXYZ(x: number, y: number, z: number): Q {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3,
  };
}

function eulerXYZFromQuat(q: Q): { x: number; y: number; z: number } {
  const { x, y, z, w } = q;
  const m11 = 1 - 2 * (y * y + z * z), m12 = 2 * (x * y - w * z), m13 = 2 * (x * z + w * y);
  const m22 = 1 - 2 * (x * x + z * z), m23 = 2 * (y * z - w * x);
  const m32 = 2 * (y * z + w * x), m33 = 1 - 2 * (x * x + y * y);
  const ey = Math.asin(Math.max(-1, Math.min(1, m13)));
  if (Math.abs(m13) < 0.9999999) return { x: Math.atan2(-m23, m33), y: ey, z: Math.atan2(-m12, m11) };
  return { x: Math.atan2(m32, m22), y: ey, z: 0 };
}

/** An XYZ-order Euler (three.js default) turned by a about world up. Exact for any tilt. */
export function yawEulerXYZ(e: { x: number; y: number; z: number }, a: number): { x: number; y: number; z: number } {
  if (Math.abs(e.x) < 1e-12 && Math.abs(e.z) < 1e-12) return { x: e.x, y: wrapAngle(e.y + a), z: e.z };
  return eulerXYZFromQuat(yawQuat(quatFromEulerXYZ(e.x, e.y, e.z), a));
}

/**
 * The explicit schema transformSceneRigid works to (review R5): every world
 * position, heading and orientation a scene stores, and the vector fields it
 * deliberately leaves alone. Paths use [] for "every element". The domain test
 * walks a fully populated scene and fails on any spatial field not listed here,
 * so a new positional field cannot be added without deciding how it moves.
 */
export const RIGID_SCENE_SCHEMA = {
  /** Moved by the full delta (turn, then translate). */
  positions: [
    'actors[].position',
    'actors[].keyframes[].position',
    'actors[].ikTargets.leftHand',
    'actors[].ikTargets.rightHand',
    'actors[].ikTargets.leftFoot',
    'actors[].ikTargets.rightFoot',
    'cameras[].position',
    'cameras[].keyframes[].position',
    'cameras[].gripRig.trackPoints[]',
    'cameras[].gripRig.turretBasePos',
    'lights[].position',
    'props[].position',
    'audioCues[].position',
    'architecture.walls[].start',
    'architecture.walls[].end',
    'gaussianClouds[].transform.position',
    'icvfx.walls[].center',
    'acoustics.boomMics[].position',
    'acoustics.boomMics[].pole.operatorPosition',
    'acoustics.boomMics[].pole.targetPoint',
    'setDressing.settledItems[].position',
  ],
  /** Headings (radians about up, rotation.y convention): plus the turn. */
  headings: [
    'actors[].rotationY',
    'actors[].keyframes[].rotationY',
    'lights[].rotationY',
    'props[].rotationY',
    'icvfx.walls[].rotationY',
  ],
  /** World orientations (quaternions): turned about world up. */
  orientations: [
    'cameras[].rotation',
    'cameras[].keyframes[].rotation',
    'gaussianClouds[].transform.rotation',
    'acoustics.boomMics[].orientation',
  ],
  /** XYZ Euler orientations: turned about world up (exact for any tilt). */
  eulers: ['setDressing.settledItems[].rotation'],
  /** Heights: plus the vertical shift. */
  heights: ['setDressing.settledItems[].surfaceY'],
  /** Axis-aligned boxes: re-bounded around the moved corners (exact for quarter turns, larger otherwise). */
  boxes: ['setDressing.regions[].bounds'],
  /** Scene True North (degrees, solarEngine convention): north stays fixed to the real world. */
  north: ['solar.northHeadingDeg'],
  /**
   * Deliberately untouched: local offsets, sizes and derived data.
   * The scan summary is replaced by the caller (applyRigidToScan) and is not walked.
   */
  local: [
    'acoustics.lavalierMics[].chestOffset',
    'gaussianClouds[].floorAlignment.originOffset',
    'gaussianClouds[].bounds.min',
    'gaussianClouds[].bounds.max',
    'gaussianClouds[].splats[].position',
    'gaussianClouds[].splats[].scale',
    'gaussianClouds[].splats[].rotation',
    'props[].scale',
    'setDressing.settledItems[].scale',
    'setDressing.scatterConfig.templates[].defaultScale',
  ],
} as const;

type AnyRec = Record<string, unknown>;
const isObj = (v: unknown): v is AnyRec => !!v && typeof v === 'object' && !Array.isArray(v);
const isVec = (v: unknown): v is { x: number; y: number; z: number } =>
  isObj(v) && typeof v.x === 'number' && typeof v.y === 'number' && typeof v.z === 'number';

/** Calls fn on every value at a schema path ('a[].b.c'). */
function visitPath(root: unknown, path: string, fn: (parent: AnyRec, key: string, value: unknown) => void): void {
  const parts = path.split('.');
  const walk = (node: unknown, i: number): void => {
    if (node == null) return;
    const part = parts[i];
    const isArr = part.endsWith('[]');
    const key = isArr ? part.slice(0, -2) : part;
    if (!isObj(node)) return;
    const value = node[key];
    if (i === parts.length - 1) {
      if (isArr) {
        if (Array.isArray(value)) value.forEach((_, j) => fn(value as unknown as AnyRec, String(j), value[j]));
      } else if (value !== undefined) {
        fn(node, key, value);
      }
      return;
    }
    if (isArr) {
      if (Array.isArray(value)) for (const el of value) walk(el, i + 1);
    } else {
      walk(value, i + 1);
    }
  };
  walk(root, 0);
}

/**
 * Bakes a rigid move into every world position, heading and orientation of a
 * scene (RIGID_SCENE_SCHEMA), in place: the "Everything" scope of Align, for
 * returning to a room on another day. Positions given as [x, y, z] arrays
 * (lights) are handled too. The scan is left to the caller (applyRigidToScan
 * plus the Photo source transform), and anchors must be re-queued afterwards.
 */
export function transformSceneRigid<T extends object>(scene: T, d: RigidDelta): T {
  const S = RIGID_SCENE_SCHEMA;
  const moveVec = (v: { x: number; y: number; z: number }) => {
    const p = applyRigidToPoint(d, v);
    v.x = p.x;
    v.y = p.y;
    v.z = p.z;
  };
  for (const path of S.positions) {
    visitPath(scene, path, (parent, key, value) => {
      if (isVec(value)) moveVec(value);
      else if (Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number')) {
        const p = applyRigidToPoint(d, { x: value[0], y: value[1], z: value[2] });
        parent[key] = [p.x, p.y, p.z];
      }
    });
  }
  for (const path of S.headings) {
    visitPath(scene, path, (parent, key, value) => {
      if (typeof value === 'number' && Number.isFinite(value)) parent[key] = wrapAngle(value + d.rotY);
    });
  }
  for (const path of S.orientations) {
    visitPath(scene, path, (parent, key, value) => {
      const q = value as Q;
      if (isObj(q) && typeof q.w === 'number' && typeof q.x === 'number') parent[key] = yawQuat(q, d.rotY);
    });
  }
  for (const path of S.eulers) {
    visitPath(scene, path, (parent, key, value) => {
      if (isVec(value)) parent[key] = yawEulerXYZ(value, d.rotY);
    });
  }
  for (const path of S.heights) {
    visitPath(scene, path, (parent, key, value) => {
      if (typeof value === 'number' && Number.isFinite(value)) parent[key] = value + d.dy;
    });
  }
  for (const path of S.boxes) {
    visitPath(scene, path, (_parent, _key, value) => {
      const b = value as { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
      if (!isObj(b) || !isVec(b.min) || !isVec(b.max)) return;
      const xs: number[] = [];
      const zs: number[] = [];
      for (const x of [b.min.x, b.max.x]) {
        for (const z of [b.min.z, b.max.z]) {
          const p = applyRigidToPoint(d, { x, y: 0, z });
          xs.push(p.x);
          zs.push(p.z);
        }
      }
      b.min = { x: Math.min(...xs), y: b.min.y + d.dy, z: Math.min(...zs) };
      b.max = { x: Math.max(...xs), y: b.max.y + d.dy, z: Math.max(...zs) };
    });
  }
  for (const path of S.north) {
    visitPath(scene, path, (parent, key, value) => {
      // calculateSolarVector uses heading = azimuth + north with -Z north; turning
      // the scene by a turns that direction to heading - a.
      if (typeof value === 'number' && Number.isFinite(value)) {
        const deg = value - (d.rotY * 180) / Math.PI;
        parent[key] = ((deg % 360) + 360) % 360;
      }
    });
  }
  return scene;
}
