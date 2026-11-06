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
