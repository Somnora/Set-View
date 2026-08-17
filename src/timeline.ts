// ---------------------------------------------------------------------------
// Keyframe timeline math — PURE, portable (Unity: a static Timeline class).
// Segment durations are derived from distance at walking speed; playback is
// linear interpolation between marks.
// ---------------------------------------------------------------------------

import {
  DEFAULT_DOLLY_SPEED_MS,
  WALK_SPEED_MS,
  type CameraKeyframe,
  type CameraMoveType,
  type Quat,
  type TransformKeyframe,
  type Vec3,
} from './model.ts';
import type { StanceId } from './pose.ts';

export interface Timeline {
  /** Absolute time (seconds) at which each keyframe is reached. times[0] = 0. */
  times: number[];
  duration: number;
}

export interface CameraTimeline {
  /** Absolute time (seconds) at which each camera mark is reached. times[0] = 0. */
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

// ---------------------------------------------------------------------------
// Camera Motion & Spline Trajectory Math
// ---------------------------------------------------------------------------

export function quatNormalize(q: Quat): Quat {
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (len < 1e-9) return { x: 0, y: 0, z: 0, w: 1 };
  const inv = 1 / len;
  return { x: q.x * inv, y: q.y * inv, z: q.z * inv, w: q.w * inv };
}

export function quatDot(a: Quat, b: Quat): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

/** Spherical linear interpolation between two orientations (shortest arc). */
export function quatSlerp(qa: Quat, qb: Quat, t: number): Quat {
  let cosHalfTheta = quatDot(qa, qb);
  let bx = qb.x,
    by = qb.y,
    bz = qb.z,
    bw = qb.w;

  if (cosHalfTheta < 0) {
    cosHalfTheta = -cosHalfTheta;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }

  if (cosHalfTheta >= 0.9995) {
    const x = qa.x + (bx - qa.x) * t;
    const y = qa.y + (by - qa.y) * t;
    const z = qa.z + (bz - qa.z) * t;
    const w = qa.w + (bw - qa.w) * t;
    return quatNormalize({ x, y, z, w });
  }

  const halfTheta = Math.acos(cosHalfTheta);
  const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);
  const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

  return {
    x: qa.x * ratioA + bx * ratioB,
    y: qa.y * ratioA + by * ratioB,
    z: qa.z * ratioA + bz * ratioB,
    w: qa.w * ratioA + bw * ratioB,
  };
}

/**
 * Computes an orientation quaternion such that camera local -Z points from `eye` to `target`.
 * Pure and zero-dependency.
 */
export function quatLookAt(eye: Vec3, target: Vec3, worldUp: Vec3 = { x: 0, y: 1, z: 0 }): Quat {
  const dx = target.x - eye.x;
  const dy = target.y - eye.y;
  const dz = target.z - eye.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  if (distSq < 1e-12) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }
  const invDist = 1 / Math.sqrt(distSq);
  // Forward unit vector in world space
  const fx = dx * invDist;
  const fy = dy * invDist;
  const fz = dz * invDist;

  // Camera looks down -Z, so camera local +Z axis aligns with -forward
  let zx = -fx;
  let zy = -fy;
  let zz = -fz;

  // Check if camera forward is parallel to world up
  let upx = worldUp.x;
  let upy = worldUp.y;
  let upz = worldUp.z;
  const dotUp = Math.abs(fx * upx + fy * upy + fz * upz);
  if (dotUp > 0.999) {
    // Pick alternative up vector
    upx = 0;
    upy = 0;
    upz = 1;
  }

  // Camera local +X = Up x Zcam
  let xx = upy * zz - upz * zy;
  let xy = upz * zx - upx * zz;
  let xz = upx * zy - upy * zx;
  const lenX = Math.sqrt(xx * xx + xy * xy + xz * xz);
  if (lenX > 1e-9) {
    const invX = 1 / lenX;
    xx *= invX;
    xy *= invX;
    xz *= invX;
  }

  // Camera local +Y = Zcam x Xcam
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  // Matrix -> Quaternion conversion
  const m00 = xx,
    m01 = yx,
    m02 = zx;
  const m10 = xy,
    m11 = yy,
    m12 = zy;
  const m20 = xz,
    m21 = yz,
    m22 = zz;

  const trace = m00 + m11 + m22;
  let qx = 0,
    qy = 0,
    qz = 0,
    qw = 1;

  if (trace > 0) {
    const s = Math.sqrt(trace + 1.0) * 2;
    qw = 0.25 * s;
    qx = (m21 - m12) / s;
    qy = (m02 - m20) / s;
    qz = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }

  return quatNormalize({ x: qx, y: qy, z: qz, w: qw });
}

/** Standard Catmull-Rom spline interpolation between p1 and p2 using control points p0 and p3. */
export function catmullRomVec3(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    z:
      0.5 *
      (2 * p1.z +
        (-p0.z + p2.z) * t +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  };
}

/** Builds timeline timestamps for camera marks based on dolly speed and hold beats. */
export function buildCameraTimeline(
  kfs: CameraKeyframe[],
  speedMs = DEFAULT_DOLLY_SPEED_MS,
  overrideDurationS?: number,
): CameraTimeline {
  const times: number[] = [];
  let t = 0;
  for (let i = 0; i < kfs.length; i++) {
    if (i > 0) {
      const d = dist(kfs[i - 1].position, kfs[i].position);
      const moveDuration = d > 1e-4 ? d / Math.max(0.1, speedMs) : 0.5;
      const hold = kfs[i - 1].holdDurationS ?? 0;
      t += moveDuration + hold;
    }
    times.push(t);
  }
  if (kfs.length > 0 && kfs[kfs.length - 1].holdDurationS) {
    t += kfs[kfs.length - 1].holdDurationS!;
  }

  if (overrideDurationS !== undefined && overrideDurationS > 0 && t > 0) {
    const scale = overrideDurationS / t;
    return {
      times: times.map((tm) => tm * scale),
      duration: overrideDurationS,
    };
  }

  return { times, duration: t };
}

export interface CameraSample {
  position: Vec3;
  rotation: Quat;
  lensFocalLength: number;
  focusDistanceM: number;
  speed: number;
  moving: boolean;
  t: number;
}

/** Samples camera state at time t (seconds). */
export function sampleCameraTimeline(
  kfs: CameraKeyframe[],
  tl: CameraTimeline,
  t: number,
  lookAtTargetPos?: Vec3,
  smoothSpline = true,
): CameraSample | null {
  if (kfs.length === 0) return null;
  const clampedT = Math.max(0, Math.min(t, tl.duration));
  if (kfs.length === 1 || tl.duration <= 1e-4) {
    const k = kfs[0];
    const pos = { ...k.position };
    const rot = lookAtTargetPos ? quatLookAt(pos, lookAtTargetPos) : { ...k.rotation };
    const focusDist = lookAtTargetPos ? dist(pos, lookAtTargetPos) : (k.focusDistanceM ?? 3.0);
    return {
      position: pos,
      rotation: rot,
      lensFocalLength: k.lensFocalLength,
      focusDistanceM: focusDist,
      speed: 0,
      moving: false,
      t: clampedT,
    };
  }

  let i = 0;
  while (i < tl.times.length - 2 && clampedT >= tl.times[i + 1]) i++;

  const a = kfs[i];
  const b = kfs[i + 1];
  const t0 = tl.times[i];
  const t1 = tl.times[i + 1];
  const u = t1 > t0 ? Math.min(1, Math.max(0, (clampedT - t0) / (t1 - t0))) : 1;

  let position: Vec3;
  if (smoothSpline && kfs.length >= 3) {
    const p0 = (i > 0 ? kfs[i - 1] : a).position;
    const p1 = a.position;
    const p2 = b.position;
    const p3 = (i + 2 < kfs.length ? kfs[i + 2] : b).position;
    position = catmullRomVec3(p0, p1, p2, p3, u);
  } else {
    position = {
      x: a.position.x + (b.position.x - a.position.x) * u,
      y: a.position.y + (b.position.y - a.position.y) * u,
      z: a.position.z + (b.position.z - a.position.z) * u,
    };
  }

  const rotation = lookAtTargetPos ? quatLookAt(position, lookAtTargetPos) : quatSlerp(a.rotation, b.rotation, u);
  const lensFocalLength = a.lensFocalLength + (b.lensFocalLength - a.lensFocalLength) * u;
  const aFocus = a.focusDistanceM ?? 3.0;
  const bFocus = b.focusDistanceM ?? 3.0;
  const focusDistanceM = lookAtTargetPos ? dist(position, lookAtTargetPos) : aFocus + (bFocus - aFocus) * u;

  const segDist = dist(a.position, b.position);
  const segDur = t1 - t0;
  const speed = segDur > 0 ? segDist / segDur : 0;
  const moving = segDist > 0.05 && speed > 0.01;

  return {
    position,
    rotation,
    lensFocalLength,
    focusDistanceM,
    speed,
    moving,
    t: clampedT,
  };
}

export interface CameraMoveClassification {
  moveType: CameraMoveType;
  description: string;
  totalDistanceM: number;
  durationS: number;
  avgSpeedMs: number;
  peakSpeedMs: number;
  hasFocalPull: boolean;
  focalMinMm: number;
  focalMaxMm: number;
  isPureRotation: boolean;
}

/** Classifies camera choreography into industry standard move types. Pure. */
export function classifyCameraMove(
  kfs: CameraKeyframe[],
  speedMs = DEFAULT_DOLLY_SPEED_MS,
): CameraMoveClassification {
  if (kfs.length <= 1) {
    const focal = kfs[0]?.lensFocalLength ?? 35;
    return {
      moveType: 'static',
      description: 'Static Lock-off Tripod',
      totalDistanceM: 0,
      durationS: 0,
      avgSpeedMs: 0,
      peakSpeedMs: 0,
      hasFocalPull: false,
      focalMinMm: focal,
      focalMaxMm: focal,
      isPureRotation: false,
    };
  }

  let totalDist = 0;
  const focals = kfs.map((k) => k.lensFocalLength);
  const focalMin = Math.min(...focals);
  const focalMax = Math.max(...focals);
  const hasFocalPull = Math.abs(focalMax - focalMin) >= 1.0;

  for (let i = 1; i < kfs.length; i++) {
    totalDist += dist(kfs[i - 1].position, kfs[i].position);
  }

  const tl = buildCameraTimeline(kfs, speedMs);
  const durationS = tl.duration;
  const avgSpeed = durationS > 0 ? totalDist / durationS : 0;

  let peakSpeed = 0;
  for (let i = 1; i < kfs.length; i++) {
    const d = dist(kfs[i - 1].position, kfs[i].position);
    const dt = tl.times[i] - tl.times[i - 1];
    const s = dt > 0 ? d / dt : 0;
    if (s > peakSpeed) peakSpeed = s;
  }

  if (totalDist < 0.05) {
    const q0 = kfs[0].rotation;
    const qEnd = kfs[kfs.length - 1].rotation;
    const dot = Math.abs(quatDot(q0, qEnd));
    const isRot = dot < 0.999;
    if (isRot) {
      return {
        moveType: 'pan-tilt',
        description: 'Pan / Tilt on Tripod',
        totalDistanceM: 0,
        durationS,
        avgSpeedMs: 0,
        peakSpeedMs: 0,
        hasFocalPull,
        focalMinMm: focalMin,
        focalMaxMm: focalMax,
        isPureRotation: true,
      };
    }
    if (hasFocalPull) {
      return {
        moveType: 'zoom',
        description: 'Optical Zoom (Tripod)',
        totalDistanceM: 0,
        durationS,
        avgSpeedMs: 0,
        peakSpeedMs: 0,
        hasFocalPull: true,
        focalMinMm: focalMin,
        focalMaxMm: focalMax,
        isPureRotation: false,
      };
    }
    return {
      moveType: 'static',
      description: 'Static Lock-off Tripod',
      totalDistanceM: 0,
      durationS: 0,
      avgSpeedMs: 0,
      peakSpeedMs: 0,
      hasFocalPull: false,
      focalMinMm: focalMin,
      focalMaxMm: focalMax,
      isPureRotation: false,
    };
  }

  const p0 = kfs[0].position;
  const pEnd = kfs[kfs.length - 1].position;
  const deltaWorld: Vec3 = { x: pEnd.x - p0.x, y: pEnd.y - p0.y, z: pEnd.z - p0.z };

  const q0 = kfs[0].rotation ?? { x: 0, y: 0, z: 0, w: 1 };
  const q0Inv: Quat = { x: -q0.x, y: -q0.y, z: -q0.z, w: q0.w };

  const vx = deltaWorld.x,
    vy = deltaWorld.y,
    vz = deltaWorld.z;
  const qx = q0Inv.x,
    qy = q0Inv.y,
    qz = q0Inv.z,
    qw = q0Inv.w;
  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;
  const localX = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const localY = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const localZ = iz * qw + iw * -qz + ix * -qy - iy * -qx;

  const pushPull = -localZ;
  const truck = localX;
  const boom = localY;

  const absPush = Math.abs(pushPull);
  const absTruck = Math.abs(truck);
  const absBoom = Math.abs(boom);

  let moveType: CameraMoveType = 'compound';
  let description = 'Compound 3D Camera Move';

  if (absPush > 1.5 * (absTruck + absBoom)) {
    if (pushPull > 0) {
      moveType = 'dolly-push';
      description = `Dolly Push-In (${absPush.toFixed(1)}m)`;
    } else {
      moveType = 'dolly-pull';
      description = `Dolly Pull-Out (${absPush.toFixed(1)}m)`;
    }
  } else if (absTruck > 1.5 * (absPush + absBoom)) {
    moveType = 'truck';
    description = `Tracking / Truck Shot (${absTruck.toFixed(1)}m ${truck > 0 ? 'Right' : 'Left'})`;
  } else if (absBoom > 1.5 * (absPush + absTruck)) {
    moveType = 'boom';
    description = `Crane / Jib Pedestal (${absBoom.toFixed(1)}m ${boom > 0 ? 'Up' : 'Down'})`;
  } else if (kfs.length >= 3) {
    moveType = 'arc';
    description = `Arc / Orbit Move (${totalDist.toFixed(1)}m)`;
  } else {
    moveType = 'compound';
    description = `Compound Move (${totalDist.toFixed(1)}m)`;
  }

  return {
    moveType,
    description,
    totalDistanceM: totalDist,
    durationS,
    avgSpeedMs: avgSpeed,
    peakSpeedMs: peakSpeed,
    hasFocalPull,
    focalMinMm: focalMin,
    focalMaxMm: focalMax,
    isPureRotation: false,
  };
}

export interface DollyRailGeometry {
  points: Vec3[];
  totalLengthM: number;
  boundsMin: Vec3;
  boundsMax: Vec3;
}

/** Generates smooth sub-sampled points along the camera spline rail for AR rendering and floorplans. */
export function generateDollyRail(kfs: CameraKeyframe[], stepsPerSegment = 8): DollyRailGeometry {
  if (kfs.length === 0) {
    return {
      points: [],
      totalLengthM: 0,
      boundsMin: { x: 0, y: 0, z: 0 },
      boundsMax: { x: 0, y: 0, z: 0 },
    };
  }
  if (kfs.length === 1) {
    const p = kfs[0].position;
    return {
      points: [{ ...p }],
      totalLengthM: 0,
      boundsMin: { ...p },
      boundsMax: { ...p },
    };
  }

  const points: Vec3[] = [];
  let totalLengthM = 0;
  const boundsMin: Vec3 = { x: Infinity, y: Infinity, z: Infinity };
  const boundsMax: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity };

  function addPoint(pt: Vec3) {
    points.push(pt);
    if (pt.x < boundsMin.x) boundsMin.x = pt.x;
    if (pt.y < boundsMin.y) boundsMin.y = pt.y;
    if (pt.z < boundsMin.z) boundsMin.z = pt.z;
    if (pt.x > boundsMax.x) boundsMax.x = pt.x;
    if (pt.y > boundsMax.y) boundsMax.y = pt.y;
    if (pt.z > boundsMax.z) boundsMax.z = pt.z;
  }

  const numSegments = kfs.length - 1;
  for (let seg = 0; seg < numSegments; seg++) {
    const p0 = (seg > 0 ? kfs[seg - 1] : kfs[seg]).position;
    const p1 = kfs[seg].position;
    const p2 = kfs[seg + 1].position;
    const p3 = (seg + 2 < kfs.length ? kfs[seg + 2] : kfs[seg + 1]).position;

    const steps = Math.max(2, stepsPerSegment);
    for (let s = seg === 0 ? 0 : 1; s <= steps; s++) {
      const u = s / steps;
      const pt = catmullRomVec3(p0, p1, p2, p3, u);
      if (points.length > 0) {
        totalLengthM += dist(points[points.length - 1], pt);
      }
      addPoint(pt);
    }
  }

  return { points, totalLengthM, boundsMin, boundsMax };
}

