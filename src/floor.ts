// ---------------------------------------------------------------------------
// Floor-height correction — PURE, renderer-free (the tested surface).
//
// First-QA failure mode (2026-07-10, on video): the headset's floor origin
// sat well above the real floor (bad boundary floor height / local-space
// fallback), so every actor authored at scene y=0 rendered with its feet at
// head height — giant legs dangling from the ceiling — while the hit-test
// reticle sat correctly on the REAL floor. The reticle is the tell: hit-test
// hits real surfaces, so the lowest hit over the first seconds of a session
// IS the real floor. When that lowest hit is meaningfully below y=0, the
// reference space's floor is too high and the scene should be re-based.
//
// Deliberately one-directional: hits can land on desks and props (above the
// real floor), so a lowest-hit ABOVE y=0 proves nothing and is never
// "corrected". Below y=0 there is no real geometry to hit unless the floor
// origin is wrong.
// ---------------------------------------------------------------------------

/** Only correct when the floor estimate is off by more than this. */
export const FLOOR_MIN_CORRECTION_M = 0.15;
/** Wait for this many floor-ray hits before trusting the minimum. */
export const FLOOR_MIN_HITS = 10;
/** ...and this long into the session (ms), so one early glance can't commit. */
export const FLOOR_SETTLE_MS = 2000;
/** Sanity band: corrected eye height must look like a seated..standing human. */
export const FLOOR_MIN_EYE_M = 0.6;
export const FLOOR_MAX_EYE_M = 3.0;

export interface FloorEstimate {
  /** Lowest world-space hit y seen this session. */
  minHitY: number;
  hits: number;
  /** ms timestamp of the first observed hit. */
  firstHitAt: number;
  committed: boolean;
}

export function newFloorEstimate(): FloorEstimate {
  return { minHitY: Infinity, hits: 0, firstHitAt: 0, committed: false };
}

/** Feed one hit-test result (world y, ms clock). Mutates + returns e. */
export function observeFloorHit(e: FloorEstimate, hitY: number, timeMs: number): FloorEstimate {
  if (e.committed || !Number.isFinite(hitY)) return e;
  if (e.hits === 0) e.firstHitAt = timeMs;
  e.hits++;
  if (hitY < e.minHitY) e.minHitY = hitY;
  return e;
}

/**
 * The y offset to re-base content by (scene floor -> real floor), or null
 * while the evidence is insufficient / the floor already looks right. On a
 * non-null return the caller applies it once and marks the estimate committed.
 */
export function floorCorrection(e: FloorEstimate, headY: number, timeMs: number): number | null {
  if (e.committed || e.hits < FLOOR_MIN_HITS) return null;
  if (timeMs - e.firstHitAt < FLOOR_SETTLE_MS) return null;
  if (e.minHitY > -FLOOR_MIN_CORRECTION_M) return null; // floor plausible (or hits were props)
  const correctedEye = headY - e.minHitY;
  if (correctedEye < FLOOR_MIN_EYE_M || correctedEye > FLOOR_MAX_EYE_M) return null;
  return e.minHitY;
}
