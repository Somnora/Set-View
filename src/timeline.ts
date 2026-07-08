// ---------------------------------------------------------------------------
// Keyframe timeline math — PURE, portable (Unity: a static Timeline class).
// Segment durations are derived from distance at walking speed; playback is
// linear interpolation between marks.
// ---------------------------------------------------------------------------

import { WALK_SPEED_MS, type TransformKeyframe, type Vec3 } from './model.ts';
import type { StanceId } from './pose.ts';

export interface Timeline {
  /** Absolute time (seconds) at which each keyframe is reached. times[0] = 0. */
  times: number[];
  duration: number;
}

function dist(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Shortest-arc interpolation between two angles (radians). */
export function lerpAngle(a: number, b: number, u: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * u;
}

export interface MoveStats {
  marks: number;
  /** Total path length across all keyframe segments (meters). */
  distanceM: number;
  /** Playback duration at `speed` (seconds), incl. min per-segment beat. */
  durationS: number;
  /** Average speed over the move (m/s); 0 for a static/one-mark actor. */
  avgSpeed: number;
}

/** Summary numbers for one actor's blocking move. Pure; unit-testable. */
export function moveStats(kfs: TransformKeyframe[], speed = WALK_SPEED_MS): MoveStats {
  let d = 0;
  for (let i = 1; i < kfs.length; i++) d += dist(kfs[i - 1].position, kfs[i].position);
  const { duration } = buildTimeline(kfs, speed);
  return { marks: kfs.length, distanceM: d, durationS: duration, avgSpeed: duration > 0 ? d / duration : 0 };
}

export function buildTimeline(kfs: TransformKeyframe[], speed = WALK_SPEED_MS): Timeline {
  const times: number[] = [];
  let t = 0;
  for (let i = 0; i < kfs.length; i++) {
    if (i > 0) {
      const d = dist(kfs[i - 1].position, kfs[i].position);
      // A zero-length move (pure turn in place) still takes a beat.
      t += Math.max(d / speed, 0.4);
    }
    times.push(t);
  }
  return { times, duration: t };
}

export interface TimelineSample {
  position: Vec3;
  /** Desired facing: travel heading while moving, keyframe facing at rest. */
  rotationY: number;
  moving: boolean;
  /** Instantaneous speed in m/s (0 when holding a mark). */
  speed: number;
  /**
   * Stance held at the governing mark while NOT moving: the first mark before
   * the move starts, the destination mark during a turn-in-place beat, the
   * last mark from arrival on. Undefined while walking, and for marks with no
   * stamped stance (the caller falls back to the actor's rest stance).
   */
  stance?: StanceId;
}

/**
 * Samples actor state at time t (seconds, clamped to [0, duration]).
 * Returns null when there are fewer than 1 keyframes.
 */
export function sampleTimeline(
  kfs: TransformKeyframe[],
  tl: Timeline,
  t: number,
): TimelineSample | null {
  if (kfs.length === 0) return null;
  if (kfs.length === 1 || t <= 0) {
    const k = kfs[0];
    return { position: { ...k.position }, rotationY: k.rotationY, moving: false, speed: 0, stance: k.stance };
  }
  if (t >= tl.duration) {
    const k = kfs[kfs.length - 1];
    return { position: { ...k.position }, rotationY: k.rotationY, moving: false, speed: 0, stance: k.stance };
  }
  let i = 0;
  while (i < tl.times.length - 2 && t >= tl.times[i + 1]) i++;
  const a = kfs[i];
  const b = kfs[i + 1];
  const t0 = tl.times[i];
  const t1 = tl.times[i + 1];
  const u = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
  const position: Vec3 = {
    x: a.position.x + (b.position.x - a.position.x) * u,
    y: a.position.y + (b.position.y - a.position.y) * u,
    z: a.position.z + (b.position.z - a.position.z) * u,
  };
  const dx = b.position.x - a.position.x;
  const dz = b.position.z - a.position.z;
  const segLen = Math.sqrt(dx * dx + dz * dz);
  const segDur = t1 - t0;
  const speed = segDur > 0 ? segLen / segDur : 0;
  const moving = segLen > 0.05;
  let rotationY: number;
  if (moving) {
    // Face travel direction; ease into the destination facing near arrival.
    const heading = Math.atan2(dx, dz);
    rotationY = u > 0.8 ? lerpAngle(heading, b.rotationY, (u - 0.8) / 0.2) : heading;
  } else {
    rotationY = lerpAngle(a.rotationY, b.rotationY, u);
  }
  // A turn-in-place beat settles into the destination mark's stance ("walk to
  // the chair, then sit" = a same-spot mark with a seated stance).
  return { position, rotationY, moving, speed, stance: moving ? undefined : b.stance };
}
