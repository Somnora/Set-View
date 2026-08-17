// ---------------------------------------------------------------------------
// Pure Domain Character Rigging, Motion Capture (BVH), and IK Engine
//
// ZERO Three.js or DOM imports. Runs in pure Node.js unit tests.
//
// Features:
//   - 20-bone standard humanoid hierarchy with anthropometric rest proportions
//   - Analytical Two-Bone Inverse Kinematics (Law of Cosines + Pole Vectors)
//   - Look-At Inverse Kinematics with pitch and yaw angular limits
//   - Animation clip sampling, looping, and multi-track quaternion slerp
//   - Full-body pose blending (shortest-arc quaternion SLERP + position LERP)
//   - Curated stock animation library (10 clips) & stock pose presets (11 poses)
//   - Biovision Hierarchy (.bvh) mocap parser and serializer
// ---------------------------------------------------------------------------

import type { Quat, Vec3 } from './model.ts';

// --- Types -------------------------------------------------------------------

export type HumanoidBoneName =
  | 'Hips'
  | 'Spine'
  | 'Spine1'
  | 'Spine2'
  | 'Neck'
  | 'Head'
  | 'LeftShoulder'
  | 'LeftArm'
  | 'LeftForeArm'
  | 'LeftHand'
  | 'RightShoulder'
  | 'RightArm'
  | 'RightForeArm'
  | 'RightHand'
  | 'LeftUpLeg'
  | 'LeftLeg'
  | 'LeftFoot'
  | 'LeftToeBase'
  | 'RightUpLeg'
  | 'RightLeg'
  | 'RightFoot'
  | 'RightToeBase';

export const HUMANOID_BONE_NAMES: readonly HumanoidBoneName[] = [
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'Head',
  'LeftShoulder',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'RightShoulder',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'LeftToeBase',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
  'RightToeBase',
] as const;

export interface BoneNode {
  name: HumanoidBoneName;
  parent: HumanoidBoneName | null;
  children: HumanoidBoneName[];
  restPosition: Vec3;
  restRotation: Quat;
  length: number;
}

export interface BoneHierarchy {
  root: HumanoidBoneName;
  bones: Record<HumanoidBoneName, BoneNode>;
}

export interface HumanoidRigDefinition {
  name: string;
  hierarchy: BoneHierarchy;
  boneOrder: HumanoidBoneName[];
}

export interface BoneTransform {
  position?: Vec3;
  rotation: Quat;
  scale?: Vec3;
}

export interface BoneAnimationTrack {
  boneName: HumanoidBoneName;
  rotations: { timeS: number; quat: Quat }[];
  positions?: { timeS: number; pos: Vec3 }[];
}

export interface AnimationClipData {
  name: string;
  durationS: number;
  fps: number;
  loop: boolean;
  tracks: BoneAnimationTrack[];
}

export interface PosePreset {
  name: string;
  category: 'gesture' | 'posture' | 'action';
  bones: Partial<Record<HumanoidBoneName, Quat>>;
}

export interface IKTargetConfig {
  targetPos: Vec3;
  poleVector?: Vec3;
  weight?: number;
}

// --- Pure Math Utilities -----------------------------------------------------

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function v3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function v3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function v3Scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function v3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function v3Cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function v3Length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function v3Normalize(v: Vec3): Vec3 {
  const len = v3Length(v);
  if (len < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function v3Distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function v3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export function qIdentity(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 };
}

export function qNormalize(q: Quat): Quat {
  const len = Math.hypot(q.x, q.y, q.z, q.w);
  if (len < 1e-9) return { x: 0, y: 0, z: 0, w: 1 };
  const inv = 1 / len;
  return { x: q.x * inv, y: q.y * inv, z: q.z * inv, w: q.w * inv };
}

export function qDot(a: Quat, b: Quat): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

export function qConjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

export function qMultiply(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export const vecAdd = v3Add;
export const vecSub = v3Sub;
export const vecLen = v3Length;
export const vecDist = v3Distance;
export const normalizeQuat = qNormalize;
export const quatMultiply = qMultiply;

export function qRotateVec3(q: Quat, v: Vec3): Vec3 {
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  const vx = v.x, vy = v.y, vz = v.z;

  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;

  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
}

export function qFromAxisAngle(axis: Vec3, rad: number): Quat {
  const norm = v3Normalize(axis);
  const half = rad * 0.5;
  const s = Math.sin(half);
  return {
    x: norm.x * s,
    y: norm.y * s,
    z: norm.z * s,
    w: Math.cos(half),
  };
}

export function qSlerp(qa: Quat, qb: Quat, t: number): Quat {
  let cosHalfTheta = qDot(qa, qb);
  let bx = qb.x;
  let by = qb.y;
  let bz = qb.z;
  let bw = qb.w;

  if (cosHalfTheta < 0) {
    cosHalfTheta = -cosHalfTheta;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }

  if (cosHalfTheta >= 0.9995) {
    return qNormalize({
      x: qa.x + (bx - qa.x) * t,
      y: qa.y + (by - qa.y) * t,
      z: qa.z + (bz - qa.z) * t,
      w: qa.w + (bw - qa.w) * t,
    });
  }

  const halfTheta = Math.acos(Math.min(1, Math.max(-1, cosHalfTheta)));
  const sinHalfTheta = Math.sqrt(Math.max(0, 1.0 - cosHalfTheta * cosHalfTheta));
  if (sinHalfTheta < 1e-6) {
    return qNormalize({
      x: qa.x + (bx - qa.x) * t,
      y: qa.y + (by - qa.y) * t,
      z: qa.z + (bz - qa.z) * t,
      w: qa.w + (bw - qa.w) * t,
    });
  }

  const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

  return {
    x: qa.x * ratioA + bx * ratioB,
    y: qa.y * ratioA + by * ratioB,
    z: qa.z * ratioA + bz * ratioB,
    w: qa.w * ratioA + bw * ratioB,
  };
}

export function qFromToRotation(from: Vec3, to: Vec3): Quat {
  const f = v3Normalize(from);
  const t = v3Normalize(to);
  const dot = v3Dot(f, t);

  if (dot >= 0.999999) {
    return qIdentity();
  }
  if (dot <= -0.999999) {
    let axis = v3Cross({ x: 1, y: 0, z: 0 }, f);
    if (v3Length(axis) < 0.01) {
      axis = v3Cross({ x: 0, y: 1, z: 0 }, f);
    }
    axis = v3Normalize(axis);
    return { x: axis.x, y: axis.y, z: axis.z, w: 0 };
  }

  const axis = v3Cross(f, t);
  const w = Math.sqrt((1 + dot) * 2);
  const invW = 1 / w;
  return qNormalize({
    x: axis.x * invW,
    y: axis.y * invW,
    z: axis.z * invW,
    w: w * 0.5,
  });
}

/** Euler angles in radians to Quaternion (YXZ intrinsic order). */
export function eulerYXZToQuat(xRad: number, yRad: number, zRad: number): Quat {
  const qx = qFromAxisAngle({ x: 1, y: 0, z: 0 }, xRad);
  const qy = qFromAxisAngle({ x: 0, y: 1, z: 0 }, yRad);
  const qz = qFromAxisAngle({ x: 0, y: 0, z: 1 }, zRad);
  return qNormalize(qMultiply(qy, qMultiply(qx, qz)));
}

/** Alias for Euler angles (radians) to Quaternion conversion. */
export const eulerToQuat = eulerYXZToQuat;
export const qFromEuler = eulerYXZToQuat;

/** Converts Euler angles with arbitrary 3-axis order to Quaternion. */
export function eulerDegToQuat(xDeg: number, yDeg: number, zDeg: number, order = 'ZXY'): Quat {
  const toRad = Math.PI / 180;
  const qx = qFromAxisAngle({ x: 1, y: 0, z: 0 }, xDeg * toRad);
  const qy = qFromAxisAngle({ x: 0, y: 1, z: 0 }, yDeg * toRad);
  const qz = qFromAxisAngle({ x: 0, y: 0, z: 1 }, zDeg * toRad);

  let res = qIdentity();
  for (let i = 0; i < order.length; i++) {
    const axis = order[i].toUpperCase();
    if (axis === 'X') res = qMultiply(res, qx);
    else if (axis === 'Y') res = qMultiply(res, qy);
    else if (axis === 'Z') res = qMultiply(res, qz);
  }
  return qNormalize(res);
}

/** Converts Quaternion to Euler angles in degrees (ZXY order for BVH export). */
export function quatToEulerDegZXY(q: Quat): { xDeg: number; yDeg: number; zDeg: number } {
  const norm = qNormalize(q);
  const x = norm.x, y = norm.y, z = norm.z, w = norm.w;

  // Matrix elements
  const m12 = 2 * (x * y + w * z);
  const m22 = w * w + y * y - x * x - z * z;
  const m32 = 2 * (y * z - w * x);
  const m31 = 2 * (x * z + w * y);
  const m33 = w * w + z * z - x * x - y * y;

  const clamp = (val: number) => Math.max(-1, Math.min(1, val));
  const xRad = Math.asin(clamp(-m32));
  let yRad = 0;
  let zRad = 0;

  if (Math.abs(m32) < 0.99999) {
    yRad = Math.atan2(m31, m33);
    zRad = Math.atan2(m12, m22);
  } else {
    // Gimbal lock
    zRad = Math.atan2(-2 * (x * z - w * y), w * w + x * x - y * y - z * z);
  }

  const toDeg = 180 / Math.PI;
  return {
    xDeg: xRad * toDeg,
    yDeg: yRad * toDeg,
    zDeg: zRad * toDeg,
  };
}

// --- Rig Definition ----------------------------------------------------------

/**
 * Creates the standard SetView humanoid bone hierarchy with realistic
 * anthropometric proportions (~1.75m total height in T-pose).
 */
export function createDefaultHumanoidRig(): HumanoidRigDefinition {
  const bones: Record<HumanoidBoneName, BoneNode> = {
    Hips: {
      name: 'Hips',
      parent: null,
      children: ['Spine', 'LeftUpLeg', 'RightUpLeg'],
      restPosition: { x: 0, y: 0.95, z: 0 },
      restRotation: qIdentity(),
      length: 0.12,
    },
    Spine: {
      name: 'Spine',
      parent: 'Hips',
      children: ['Spine1'],
      restPosition: { x: 0, y: 0.12, z: 0 },
      restRotation: qIdentity(),
      length: 0.14,
    },
    Spine1: {
      name: 'Spine1',
      parent: 'Spine',
      children: ['Spine2'],
      restPosition: { x: 0, y: 0.14, z: 0 },
      restRotation: qIdentity(),
      length: 0.14,
    },
    Spine2: {
      name: 'Spine2',
      parent: 'Spine1',
      children: ['Neck', 'LeftShoulder', 'RightShoulder'],
      restPosition: { x: 0, y: 0.14, z: 0 },
      restRotation: qIdentity(),
      length: 0.14,
    },
    Neck: {
      name: 'Neck',
      parent: 'Spine2',
      children: ['Head'],
      restPosition: { x: 0, y: 0.14, z: 0 },
      restRotation: qIdentity(),
      length: 0.09,
    },
    Head: {
      name: 'Head',
      parent: 'Neck',
      children: [],
      restPosition: { x: 0, y: 0.09, z: 0 },
      restRotation: qIdentity(),
      length: 0.16,
    },
    LeftShoulder: {
      name: 'LeftShoulder',
      parent: 'Spine2',
      children: ['LeftArm'],
      restPosition: { x: -0.08, y: 0.1, z: 0 },
      restRotation: qIdentity(),
      length: 0.12,
    },
    LeftArm: {
      name: 'LeftArm',
      parent: 'LeftShoulder',
      children: ['LeftForeArm'],
      restPosition: { x: -0.12, y: 0, z: 0 },
      restRotation: qIdentity(),
      length: 0.28,
    },
    LeftForeArm: {
      name: 'LeftForeArm',
      parent: 'LeftArm',
      children: ['LeftHand'],
      restPosition: { x: -0.28, y: 0, z: 0 },
      restRotation: qIdentity(),
      length: 0.26,
    },
    LeftHand: {
      name: 'LeftHand',
      parent: 'LeftForeArm',
      children: [],
      restPosition: { x: -0.26, y: 0, z: 0 },
      restRotation: qIdentity(),
      length: 0.16,
    },
    RightShoulder: {
      name: 'RightShoulder',
      parent: 'Spine2',
      children: ['RightArm'],
      restPosition: { x: 0.08, y: 0.1, z: 0 },
      restRotation: qIdentity(),
      length: 0.12,
    },
    RightArm: {
      name: 'RightArm',
      parent: 'RightShoulder',
      children: ['RightForeArm'],
      restPosition: { x: 0.12, y: 0, z: 0 },
      restRotation: qIdentity(),
      length: 0.28,
    },
    RightForeArm: {
      name: 'RightForeArm',
      parent: 'RightArm',
      children: ['RightHand'],
      restPosition: { x: 0.28, y: 0, z: 0 },
      restRotation: qIdentity(),
      length: 0.26,
    },
    RightHand: {
      name: 'RightHand',
      parent: 'RightForeArm',
      children: [],
      restPosition: { x: 0.26, y: 0, z: 0 },
      restRotation: qIdentity(),
      length: 0.16,
    },
    LeftUpLeg: {
      name: 'LeftUpLeg',
      parent: 'Hips',
      children: ['LeftLeg'],
      restPosition: { x: -0.09, y: -0.05, z: 0 },
      restRotation: qIdentity(),
      length: 0.42,
    },
    LeftLeg: {
      name: 'LeftLeg',
      parent: 'LeftUpLeg',
      children: ['LeftFoot'],
      restPosition: { x: 0, y: -0.42, z: 0 },
      restRotation: qIdentity(),
      length: 0.4,
    },
    LeftFoot: {
      name: 'LeftFoot',
      parent: 'LeftLeg',
      children: ['LeftToeBase'],
      restPosition: { x: 0, y: -0.4, z: 0 },
      restRotation: qIdentity(),
      length: 0.14,
    },
    LeftToeBase: {
      name: 'LeftToeBase',
      parent: 'LeftFoot',
      children: [],
      restPosition: { x: 0, y: -0.08, z: 0.12 },
      restRotation: qIdentity(),
      length: 0.08,
    },
    RightUpLeg: {
      name: 'RightUpLeg',
      parent: 'Hips',
      children: ['RightLeg'],
      restPosition: { x: 0.09, y: -0.05, z: 0 },
      restRotation: qIdentity(),
      length: 0.42,
    },
    RightLeg: {
      name: 'RightLeg',
      parent: 'RightUpLeg',
      children: ['RightFoot'],
      restPosition: { x: 0, y: -0.42, z: 0 },
      restRotation: qIdentity(),
      length: 0.4,
    },
    RightFoot: {
      name: 'RightFoot',
      parent: 'RightLeg',
      children: ['RightToeBase'],
      restPosition: { x: 0, y: -0.4, z: 0 },
      restRotation: qIdentity(),
      length: 0.14,
    },
    RightToeBase: {
      name: 'RightToeBase',
      parent: 'RightFoot',
      children: [],
      restPosition: { x: 0, y: -0.08, z: 0.12 },
      restRotation: qIdentity(),
      length: 0.08,
    },
  };

  return {
    name: 'DefaultHumanoidRig',
    hierarchy: {
      root: 'Hips',
      bones,
    },
    boneOrder: [...HUMANOID_BONE_NAMES],
  };
}

// --- Animation Clip Sampler & Pose Blending ----------------------------------

/**
 * Samples an animation clip at time `timeS`, interpolating rotations with SLERP
 * and positions with LERP. Returns a full set of bone transforms.
 */
export function sampleAnimationClip(
  clip: AnimationClipData,
  timeS: number,
): Record<HumanoidBoneName, BoneTransform> {
  const result = {} as Record<HumanoidBoneName, BoneTransform>;

  let t = timeS;
  if (clip.durationS > 0) {
    if (clip.loop) {
      t = ((timeS % clip.durationS) + clip.durationS) % clip.durationS;
    } else {
      t = Math.max(0, Math.min(timeS, clip.durationS));
    }
  } else {
    t = 0;
  }

  // Pre-initialize with identity transforms
  for (const name of HUMANOID_BONE_NAMES) {
    result[name] = {
      rotation: qIdentity(),
      position: undefined,
    };
  }

  for (const track of clip.tracks) {
    const bone = track.boneName;
    if (!result[bone]) continue;

    // Sample Rotation
    if (track.rotations && track.rotations.length > 0) {
      const rots = track.rotations;
      if (rots.length === 1 || t <= rots[0].timeS) {
        result[bone].rotation = { ...rots[0].quat };
      } else if (t >= rots[rots.length - 1].timeS) {
        result[bone].rotation = { ...rots[rots.length - 1].quat };
      } else {
        let i = 0;
        while (i < rots.length - 2 && t >= rots[i + 1].timeS) i++;
        const r0 = rots[i];
        const r1 = rots[i + 1];
        const span = r1.timeS - r0.timeS;
        const u = span > 0 ? (t - r0.timeS) / span : 0;
        result[bone].rotation = qSlerp(r0.quat, r1.quat, u);
      }
    }

    // Sample Position
    if (track.positions && track.positions.length > 0) {
      const poss = track.positions;
      if (poss.length === 1 || t <= poss[0].timeS) {
        result[bone].position = { ...poss[0].pos };
      } else if (t >= poss[poss.length - 1].timeS) {
        result[bone].position = { ...poss[poss.length - 1].pos };
      } else {
        let i = 0;
        while (i < poss.length - 2 && t >= poss[i + 1].timeS) i++;
        const p0 = poss[i];
        const p1 = poss[i + 1];
        const span = p1.timeS - p0.timeS;
        const u = span > 0 ? (t - p0.timeS) / span : 0;
        result[bone].position = v3Lerp(p0.pos, p1.pos, u);
      }
    }
  }

  return result;
}

/**
 * Blends two full-body poses using shortest-arc SLERP for rotations and LERP for translations.
 */
export function blendPoses(
  poseA: Record<HumanoidBoneName, BoneTransform>,
  poseB: Record<HumanoidBoneName, BoneTransform>,
  alpha: number,
): Record<HumanoidBoneName, BoneTransform> {
  const a = Math.max(0, Math.min(1, alpha));
  const out = {} as Record<HumanoidBoneName, BoneTransform>;

  for (const name of HUMANOID_BONE_NAMES) {
    const bA = poseA[name] ?? { rotation: qIdentity() };
    const bB = poseB[name] ?? { rotation: qIdentity() };

    const rot = qSlerp(bA.rotation, bB.rotation, a);
    let pos: Vec3 | undefined;

    if (bA.position && bB.position) {
      pos = v3Lerp(bA.position, bB.position, a);
    } else if (bA.position) {
      pos = { ...bA.position };
    } else if (bB.position) {
      pos = { ...bB.position };
    }

    out[name] = {
      rotation: rot,
      position: pos,
    };
  }

  return out;
}

/**
 * Evaluates Forward Kinematics (FK) for a character rig given local transforms,
 * calculating global world positions and orientations for all bones.
 */
export function forwardKinematics(
  hierarchy: BoneHierarchy,
  localPose: Record<HumanoidBoneName, BoneTransform>,
  rootWorldPos: Vec3 = { x: 0, y: 0, z: 0 },
  rootWorldRot: Quat = { x: 0, y: 0, z: 0, w: 1 },
): Record<HumanoidBoneName, { position: Vec3; rotation: Quat }> {
  const out: Partial<Record<HumanoidBoneName, { position: Vec3; rotation: Quat }>> = {};

  function solveBone(name: HumanoidBoneName): { position: Vec3; rotation: Quat } {
    if (out[name]) return out[name]!;

    const node = hierarchy.bones[name];
    const local = localPose[name] ?? {
      position: node.restPosition,
      rotation: node.restRotation,
    };

    const localPos = local.position ?? node.restPosition;
    const localRot = local.rotation ?? node.restRotation;

    if (!node.parent) {
      // Root bone (Hips)
      const worldRot = qNormalize(qMultiply(rootWorldRot, localRot));
      const rotatedOffset = qRotateVec3(rootWorldRot, localPos);
      const worldPos = v3Add(rootWorldPos, rotatedOffset);
      const res = { position: worldPos, rotation: worldRot };
      out[name] = res;
      return res;
    }

    const parentTransform = solveBone(node.parent);
    const worldRot = qNormalize(qMultiply(parentTransform.rotation, localRot));
    const rotatedOffset = qRotateVec3(parentTransform.rotation, localPos);
    const worldPos = v3Add(parentTransform.position, rotatedOffset);
    const res = { position: worldPos, rotation: worldRot };
    out[name] = res;
    return res;
  }

  for (const name of Object.keys(hierarchy.bones) as HumanoidBoneName[]) {
    solveBone(name);
  }

  return out as Record<HumanoidBoneName, { position: Vec3; rotation: Quat }>;
}

// --- Inverse Kinematics (Two-Bone IK & Look-At IK) ---------------------------

/**
 * Analytical Two-Bone Inverse Kinematics solver using the Law of Cosines.
 * Solves root (e.g. Shoulder/Hip) and mid (e.g. Elbow/Knee) rotations to reach targetPos.
 */
export function solveTwoBoneIK(
  rootPos: Vec3,
  midPos: Vec3,
  endPos: Vec3,
  targetPos: Vec3,
  poleVector: Vec3,
  upperLen: number,
  lowerLen: number,
): { midRotation: Quat; rootRotation: Quat } {
  const dVec = v3Sub(targetPos, rootPos);
  const d = v3Length(dVec);

  const maxReach = upperLen + lowerLen;
  const minReach = Math.abs(upperLen - lowerLen);
  const clampedD = Math.max(minReach + 1e-4, Math.min(maxReach - 1e-4, d));

  const targetDir = d < 1e-6 ? { x: 0, y: 0, z: 1 } : v3Normalize(dVec);

  // Law of cosines: root angle
  let cosRoot = (upperLen * upperLen + clampedD * clampedD - lowerLen * lowerLen) / (2 * upperLen * clampedD);
  cosRoot = Math.max(-1, Math.min(1, cosRoot));
  const sinRoot = Math.sqrt(Math.max(0, 1 - cosRoot * cosRoot));

  // Determine bending plane normal
  const poleRel = v3Sub(poleVector, rootPos);
  let planeNormal = v3Cross(targetDir, poleRel);
  if (v3Length(planeNormal) < 1e-4) {
    let fallback = v3Cross(targetDir, { x: 0, y: 1, z: 0 });
    if (v3Length(fallback) < 1e-4) {
      fallback = v3Cross(targetDir, { x: 1, y: 0, z: 0 });
    }
    planeNormal = fallback;
  }
  planeNormal = v3Normalize(planeNormal);

  // Bend direction orthogonal to targetDir in the bend plane
  let bendDir = v3Normalize(v3Cross(planeNormal, targetDir));
  if (v3Dot(bendDir, poleRel) < 0) {
    bendDir = v3Scale(bendDir, -1);
  }

  // Solved mid joint position
  const midSolved = v3Add(
    rootPos,
    v3Add(v3Scale(targetDir, upperLen * cosRoot), v3Scale(bendDir, upperLen * sinRoot)),
  );

  // Upper bone rotation
  const origUpper = v3Sub(midPos, rootPos);
  const newUpper = v3Sub(midSolved, rootPos);
  const rootRotation = qFromToRotation(origUpper, newUpper);

  // Lower bone rotation
  const origLower = v3Sub(endPos, midPos);
  const newLower = v3Sub(targetPos, midSolved);
  const midRotation = qFromToRotation(origLower, newLower);

  return { midRotation, rootRotation };
}

/**
 * Look-At Inverse Kinematics solver for head and neck orientation.
 * Clamps maximum pitch and yaw relative to character forward (+Z).
 */
export function solveLookAtIK(
  headWorldPos: Vec3,
  headWorldQuat: Quat,
  targetWorldPos: Vec3,
  maxPitchDeg = 45,
  maxYawDeg = 70,
): Quat {
  const delta = v3Sub(targetWorldPos, headWorldPos);
  const dist = v3Length(delta);
  if (dist < 1e-6) return { ...headWorldQuat };

  const targetDirWorld = v3Scale(delta, 1 / dist);

  // Convert world direction into head local coordinates
  const localDir = qRotateVec3(qConjugate(headWorldQuat), targetDirWorld);

  const maxYawRad = (maxYawDeg * Math.PI) / 180;
  const maxPitchRad = (maxPitchDeg * Math.PI) / 180;

  // Yaw around Y axis, Pitch around X axis
  let yaw = Math.atan2(localDir.x, localDir.z);
  let pitch = Math.atan2(-localDir.y, Math.hypot(localDir.x, localDir.z));

  yaw = Math.max(-maxYawRad, Math.min(maxYawRad, yaw));
  pitch = Math.max(-maxPitchRad, Math.min(maxPitchRad, pitch));

  const qYaw = qFromAxisAngle({ x: 0, y: 1, z: 0 }, yaw);
  const qPitch = qFromAxisAngle({ x: 1, y: 0, z: 0 }, pitch);
  const localRot = qMultiply(qYaw, qPitch);

  return qNormalize(qMultiply(headWorldQuat, localRot));
}

// --- Stock Pose Presets ------------------------------------------------------

export const STOCK_POSE_PRESETS: Record<string, PosePreset> = {
  t_pose: {
    name: 'T-Pose',
    category: 'posture',
    bones: {
      Hips: qIdentity(),
      Spine: qIdentity(),
      Spine1: qIdentity(),
      Spine2: qIdentity(),
      Neck: qIdentity(),
      Head: qIdentity(),
      LeftShoulder: qIdentity(),
      LeftArm: qIdentity(),
      LeftForeArm: qIdentity(),
      LeftHand: qIdentity(),
      RightShoulder: qIdentity(),
      RightArm: qIdentity(),
      RightForeArm: qIdentity(),
      RightHand: qIdentity(),
      LeftUpLeg: qIdentity(),
      LeftLeg: qIdentity(),
      LeftFoot: qIdentity(),
      RightUpLeg: qIdentity(),
      RightLeg: qIdentity(),
      RightFoot: qIdentity(),
    },
  },
  relaxed_stand: {
    name: 'Relaxed Stand',
    category: 'posture',
    bones: {
      LeftArm: qFromEuler(0.05, 0, 0.18),
      RightArm: qFromEuler(0.05, 0, -0.18),
      LeftForeArm: qFromEuler(0.12, 0, 0.05),
      RightForeArm: qFromEuler(0.12, 0, -0.05),
      Spine: qFromEuler(0.02, 0, 0),
      Head: qFromEuler(-0.02, 0, 0),
    },
  },
  arms_crossed: {
    name: 'Arms Crossed',
    category: 'gesture',
    bones: {
      LeftArm: qFromEuler(0.55, -0.28, 0.65),
      LeftForeArm: qFromEuler(1.55, 0.35, 0.15),
      RightArm: qFromEuler(0.55, 0.28, -0.65),
      RightForeArm: qFromEuler(1.55, -0.35, -0.15),
      Spine1: qFromEuler(0.04, 0, 0),
    },
  },
  hands_on_hips: {
    name: 'Hands on Hips',
    category: 'posture',
    bones: {
      LeftArm: qFromEuler(0.12, 0.32, 0.72),
      LeftForeArm: qFromEuler(1.25, -0.22, 0.45),
      RightArm: qFromEuler(0.12, -0.32, -0.72),
      RightForeArm: qFromEuler(1.25, 0.22, -0.45),
      Spine: qFromEuler(-0.03, 0, 0),
    },
  },
  fist: {
    name: 'Fists Raised',
    category: 'action',
    bones: {
      LeftArm: qFromEuler(0.4, 0.2, 0.3),
      LeftForeArm: qFromEuler(1.3, 0.2, 0),
      RightArm: qFromEuler(0.4, -0.2, -0.3),
      RightForeArm: qFromEuler(1.3, -0.2, 0),
      Spine: qFromEuler(0.05, 0, 0),
    },
  },
  point: {
    name: 'Point Forward',
    category: 'gesture',
    bones: {
      RightArm: qFromEuler(1.42, 0, -0.15),
      RightForeArm: qFromEuler(0.08, 0, 0),
      LeftArm: qFromEuler(0.05, 0, 0.18),
      LeftForeArm: qFromEuler(0.12, 0, 0.05),
      Head: qFromEuler(0, -0.1, 0),
    },
  },
  hold_cup: {
    name: 'Hold Cup',
    category: 'action',
    bones: {
      RightArm: qFromEuler(0.48, -0.18, -0.28),
      RightForeArm: qFromEuler(1.38, 0.28, 0),
      RightHand: qFromEuler(0.18, 0.38, 0),
      LeftArm: qFromEuler(0.05, 0, 0.18),
      LeftForeArm: qFromEuler(0.12, 0, 0.05),
    },
  },
  hold_gun: {
    name: 'Aim Firearm',
    category: 'action',
    bones: {
      RightArm: qFromEuler(1.48, 0.08, -0.12),
      RightForeArm: qFromEuler(0.04, 0, 0),
      LeftArm: qFromEuler(1.42, -0.24, 0.28),
      LeftForeArm: qFromEuler(0.28, 0.28, 0),
      Spine: qFromEuler(0.05, -0.1, 0),
      Head: qFromEuler(0, 0.08, 0),
    },
  },
  hold_phone: {
    name: 'Hold Phone to Ear',
    category: 'action',
    bones: {
      RightArm: qFromEuler(0.78, -0.28, -0.38),
      RightForeArm: qFromEuler(2.05, 0.48, 0.18),
      RightHand: qFromEuler(0.28, 0.18, 0),
      Head: qFromEuler(0.08, -0.18, 0.08),
      LeftArm: qFromEuler(0.05, 0, 0.18),
      LeftForeArm: qFromEuler(0.12, 0, 0.05),
    },
  },
  wave: {
    name: 'Wave Hand',
    category: 'gesture',
    bones: {
      RightArm: qFromEuler(2.25, 0.28, -0.55),
      RightForeArm: qFromEuler(0.68, 0.38, -0.18),
      RightHand: qFromEuler(0, 0.38, 0),
      Head: qFromEuler(-0.05, -0.15, 0),
    },
  },
  clap: {
    name: 'Clap Hands',
    category: 'action',
    bones: {
      LeftArm: qFromEuler(0.78, 0.48, 0.38),
      LeftForeArm: qFromEuler(1.08, -0.38, 0),
      RightArm: qFromEuler(0.78, -0.48, -0.38),
      RightForeArm: qFromEuler(1.08, 0.38, 0),
      Spine: qFromEuler(0.05, 0, 0),
    },
  },
};

// --- Procedural Stock Animation Library --------------------------------------

function buildSineTrack(
  boneName: HumanoidBoneName,
  durationS: number,
  fps: number,
  evaluator: (phase: number) => { x: number; y: number; z: number; posX?: number; posY?: number; posZ?: number },
): BoneAnimationTrack {
  const frameCount = Math.max(2, Math.round(durationS * fps));
  const rotations: { timeS: number; quat: Quat }[] = [];
  const positions: { timeS: number; pos: Vec3 }[] = [];

  for (let i = 0; i <= frameCount; i++) {
    const timeS = (i / frameCount) * durationS;
    const phase = (timeS / durationS) * Math.PI * 2;
    const res = evaluator(phase);

    rotations.push({
      timeS,
      quat: qFromEuler(res.x, res.y, res.z),
    });

    if (res.posX !== undefined || res.posY !== undefined || res.posZ !== undefined) {
      positions.push({
        timeS,
        pos: {
          x: res.posX ?? 0,
          y: res.posY ?? 0,
          z: res.posZ ?? 0,
        },
      });
    }
  }

  return {
    boneName,
    rotations,
    positions: positions.length > 0 ? positions : undefined,
  };
}

export const STOCK_ANIMATION_CLIPS: Record<string, AnimationClipData> = {
  idle_breathing: {
    name: 'Idle Breathing',
    durationS: 3.0,
    fps: 30,
    loop: true,
    tracks: [
      buildSineTrack('Spine', 3.0, 30, (p) => ({ x: Math.sin(p) * 0.02, y: 0, z: Math.cos(p) * 0.005 })),
      buildSineTrack('Spine1', 3.0, 30, (p) => ({ x: Math.sin(p) * 0.03, y: 0, z: 0 })),
      buildSineTrack('Spine2', 3.0, 30, (p) => ({ x: Math.sin(p) * 0.025, y: 0, z: 0 })),
      buildSineTrack('Head', 3.0, 30, (p) => ({ x: -Math.sin(p) * 0.015, y: Math.sin(p * 0.5) * 0.03, z: 0 })),
      buildSineTrack('LeftArm', 3.0, 30, (p) => ({ x: 0.05 + Math.sin(p) * 0.01, y: 0, z: 0.18 })),
      buildSineTrack('RightArm', 3.0, 30, (p) => ({ x: 0.05 + Math.sin(p) * 0.01, y: 0, z: -0.18 })),
      buildSineTrack('Hips', 3.0, 30, (p) => ({
        x: 0,
        y: 0,
        z: 0,
        posY: 0.95 + Math.sin(p) * 0.008,
      })),
    ],
  },
  walk_cycle: {
    name: 'Walk Cycle',
    durationS: 1.0,
    fps: 30,
    loop: true,
    tracks: [
      buildSineTrack('LeftUpLeg', 1.0, 30, (p) => ({
        x: Math.sin(p) * 0.45,
        y: 0,
        z: 0.03,
      })),
      buildSineTrack('RightUpLeg', 1.0, 30, (p) => ({
        x: -Math.sin(p) * 0.45,
        y: 0,
        z: -0.03,
      })),
      buildSineTrack('LeftLeg', 1.0, 30, (p) => ({
        x: Math.max(0, -Math.sin(p)) * 0.65,
        y: 0,
        z: 0,
      })),
      buildSineTrack('RightLeg', 1.0, 30, (p) => ({
        x: Math.max(0, Math.sin(p)) * 0.65,
        y: 0,
        z: 0,
      })),
      buildSineTrack('LeftFoot', 1.0, 30, (p) => ({
        x: Math.sin(p) * 0.18,
        y: 0,
        z: 0,
      })),
      buildSineTrack('RightFoot', 1.0, 30, (p) => ({
        x: -Math.sin(p) * 0.18,
        y: 0,
        z: 0,
      })),
      buildSineTrack('LeftArm', 1.0, 30, (p) => ({
        x: -Math.sin(p) * 0.35,
        y: 0,
        z: 0.12,
      })),
      buildSineTrack('RightArm', 1.0, 30, (p) => ({
        x: Math.sin(p) * 0.35,
        y: 0,
        z: -0.12,
      })),
      buildSineTrack('LeftForeArm', 1.0, 30, (p) => ({
        x: 0.2 + Math.max(0, -Math.sin(p)) * 0.25,
        y: 0,
        z: 0,
      })),
      buildSineTrack('RightForeArm', 1.0, 30, (p) => ({
        x: 0.2 + Math.max(0, Math.sin(p)) * 0.25,
        y: 0,
        z: 0,
      })),
      buildSineTrack('Spine', 1.0, 30, (p) => ({
        x: 0.03,
        y: Math.sin(p) * 0.08,
        z: Math.cos(p) * 0.02,
      })),
      buildSineTrack('Hips', 1.0, 30, (p) => ({
        x: 0,
        y: -Math.sin(p) * 0.08,
        z: 0,
        posY: 0.95 + Math.abs(Math.sin(p * 2)) * 0.02,
      })),
    ],
  },
  run_cycle: {
    name: 'Run Cycle',
    durationS: 0.65,
    fps: 30,
    loop: true,
    tracks: [
      buildSineTrack('LeftUpLeg', 0.65, 30, (p) => ({
        x: Math.sin(p) * 0.75,
        y: 0,
        z: 0.04,
      })),
      buildSineTrack('RightUpLeg', 0.65, 30, (p) => ({
        x: -Math.sin(p) * 0.75,
        y: 0,
        z: -0.04,
      })),
      buildSineTrack('LeftLeg', 0.65, 30, (p) => ({
        x: Math.max(0, -Math.sin(p)) * 1.2,
        y: 0,
        z: 0,
      })),
      buildSineTrack('RightLeg', 0.65, 30, (p) => ({
        x: Math.max(0, Math.sin(p)) * 1.2,
        y: 0,
        z: 0,
      })),
      buildSineTrack('LeftArm', 0.65, 30, (p) => ({
        x: -Math.sin(p) * 0.7,
        y: 0,
        z: 0.2,
      })),
      buildSineTrack('RightArm', 0.65, 30, (p) => ({
        x: Math.sin(p) * 0.7,
        y: 0,
        z: -0.2,
      })),
      buildSineTrack('LeftForeArm', 0.65, 30, () => ({
        x: 1.35,
        y: 0,
        z: 0,
      })),
      buildSineTrack('RightForeArm', 0.65, 30, () => ({
        x: 1.35,
        y: 0,
        z: 0,
      })),
      buildSineTrack('Spine', 0.65, 30, (p) => ({
        x: 0.22,
        y: Math.sin(p) * 0.12,
        z: 0,
      })),
      buildSineTrack('Hips', 0.65, 30, (p) => ({
        x: 0,
        y: -Math.sin(p) * 0.12,
        z: 0,
        posY: 0.95 + Math.abs(Math.sin(p * 2)) * 0.04,
      })),
    ],
  },
  sit_down: {
    name: 'Sit Down',
    durationS: 2.0,
    fps: 30,
    loop: false,
    tracks: [
      buildSineTrack('Hips', 2.0, 30, (p) => {
        const u = p / (Math.PI * 2);
        return {
          x: 0,
          y: 0,
          z: 0,
          posY: 0.95 - u * 0.43,
          posZ: -u * 0.15,
        };
      }),
      buildSineTrack('LeftUpLeg', 2.0, 30, (p) => ({
        x: (p / (Math.PI * 2)) * 1.57,
        y: 0,
        z: 0.1,
      })),
      buildSineTrack('RightUpLeg', 2.0, 30, (p) => ({
        x: (p / (Math.PI * 2)) * 1.57,
        y: 0,
        z: -0.1,
      })),
      buildSineTrack('LeftLeg', 2.0, 30, (p) => ({
        x: -(p / (Math.PI * 2)) * 1.57,
        y: 0,
        z: 0,
      })),
      buildSineTrack('RightLeg', 2.0, 30, (p) => ({
        x: -(p / (Math.PI * 2)) * 1.57,
        y: 0,
        z: 0,
      })),
      buildSineTrack('Spine', 2.0, 30, (p) => {
        const u = p / (Math.PI * 2);
        return { x: Math.sin(u * Math.PI) * 0.25, y: 0, z: 0 };
      }),
      buildSineTrack('LeftArm', 2.0, 30, (p) => ({
        x: (p / (Math.PI * 2)) * 0.45,
        y: 0,
        z: 0.15,
      })),
      buildSineTrack('RightArm', 2.0, 30, (p) => ({
        x: (p / (Math.PI * 2)) * 0.45,
        y: 0,
        z: -0.15,
      })),
    ],
  },
  stand_up: {
    name: 'Stand Up',
    durationS: 2.0,
    fps: 30,
    loop: false,
    tracks: [
      buildSineTrack('Hips', 2.0, 30, (p) => {
        const u = 1 - p / (Math.PI * 2);
        return {
          x: 0,
          y: 0,
          z: 0,
          posY: 0.95 - u * 0.43,
          posZ: -u * 0.15,
        };
      }),
      buildSineTrack('LeftUpLeg', 2.0, 30, (p) => ({
        x: (1 - p / (Math.PI * 2)) * 1.57,
        y: 0,
        z: 0.1,
      })),
      buildSineTrack('RightUpLeg', 2.0, 30, (p) => ({
        x: (1 - p / (Math.PI * 2)) * 1.57,
        y: 0,
        z: -0.1,
      })),
      buildSineTrack('LeftLeg', 2.0, 30, (p) => ({
        x: -(1 - p / (Math.PI * 2)) * 1.57,
        y: 0,
        z: 0,
      })),
      buildSineTrack('RightLeg', 2.0, 30, (p) => ({
        x: -(1 - p / (Math.PI * 2)) * 1.57,
        y: 0,
        z: 0,
      })),
      buildSineTrack('Spine', 2.0, 30, (p) => {
        const u = p / (Math.PI * 2);
        return { x: Math.sin(u * Math.PI) * 0.3, y: 0, z: 0 };
      }),
    ],
  },
  talk_gesturing: {
    name: 'Talk & Gesture',
    durationS: 4.0,
    fps: 30,
    loop: true,
    tracks: [
      buildSineTrack('Head', 4.0, 30, (p) => ({
        x: Math.sin(p * 2) * 0.08,
        y: Math.cos(p) * 0.15,
        z: Math.sin(p) * 0.05,
      })),
      buildSineTrack('RightArm', 4.0, 30, (p) => ({
        x: 0.6 + Math.sin(p * 2) * 0.25,
        y: -0.2 + Math.cos(p) * 0.15,
        z: -0.3,
      })),
      buildSineTrack('RightForeArm', 4.0, 30, (p) => ({
        x: 1.2 + Math.sin(p * 2 + 1) * 0.3,
        y: 0.2,
        z: 0,
      })),
      buildSineTrack('LeftArm', 4.0, 30, (p) => ({
        x: 0.2 + Math.sin(p) * 0.1,
        y: 0.1,
        z: 0.2,
      })),
      buildSineTrack('LeftForeArm', 4.0, 30, (p) => ({
        x: 0.4 + Math.cos(p) * 0.15,
        y: 0,
        z: 0,
      })),
      buildSineTrack('Spine', 4.0, 30, (p) => ({
        x: 0.02,
        y: Math.sin(p) * 0.06,
        z: Math.cos(p * 0.5) * 0.02,
      })),
    ],
  },
  argue_angry: {
    name: 'Argue Angry',
    durationS: 3.0,
    fps: 30,
    loop: true,
    tracks: [
      buildSineTrack('Spine', 3.0, 30, (p) => ({
        x: 0.12 + Math.sin(p * 3) * 0.04,
        y: Math.sin(p * 2) * 0.08,
        z: 0,
      })),
      buildSineTrack('Head', 3.0, 30, (p) => ({
        x: Math.sin(p * 4) * 0.14,
        y: Math.cos(p * 2) * 0.2,
        z: 0,
      })),
      buildSineTrack('RightArm', 3.0, 30, (p) => ({
        x: 1.3 + Math.sin(p * 4) * 0.35,
        y: 0,
        z: -0.2,
      })),
      buildSineTrack('RightForeArm', 3.0, 30, (p) => ({
        x: 0.4 + Math.sin(p * 4 + 1) * 0.3,
        y: 0,
        z: 0,
      })),
      buildSineTrack('LeftArm', 3.0, 30, () => ({
        x: 0.4,
        y: 0.2,
        z: 0.4,
      })),
      buildSineTrack('LeftForeArm', 3.0, 30, (p) => ({
        x: 1.2 + Math.sin(p * 2) * 0.15,
        y: 0,
        z: 0,
      })),
    ],
  },
  investigate_lookaround: {
    name: 'Investigate Look Around',
    durationS: 5.0,
    fps: 30,
    loop: true,
    tracks: [
      buildSineTrack('Head', 5.0, 30, (p) => ({
        x: Math.sin(p * 2) * 0.08,
        y: Math.sin(p) * 0.65,
        z: Math.cos(p) * 0.06,
      })),
      buildSineTrack('Neck', 5.0, 30, (p) => ({
        x: 0,
        y: Math.sin(p) * 0.25,
        z: 0,
      })),
      buildSineTrack('Spine', 5.0, 30, (p) => ({
        x: 0.08,
        y: Math.sin(p) * 0.15,
        z: 0,
      })),
      buildSineTrack('RightArm', 5.0, 30, (p) => ({
        x: 0.35 + Math.sin(p) * 0.1,
        y: 0,
        z: -0.25,
      })),
      buildSineTrack('LeftArm', 5.0, 30, (p) => ({
        x: 0.35 - Math.sin(p) * 0.1,
        y: 0,
        z: 0.25,
      })),
    ],
  },
  crouch_walk: {
    name: 'Crouch Walk',
    durationS: 1.6,
    fps: 30,
    loop: true,
    tracks: [
      buildSineTrack('Hips', 1.6, 30, (p) => ({
        x: 0,
        y: 0,
        z: 0,
        posY: 0.68 + Math.abs(Math.sin(p * 2)) * 0.02,
      })),
      buildSineTrack('Spine', 1.6, 30, (p) => ({
        x: 0.35,
        y: Math.sin(p) * 0.08,
        z: 0,
      })),
      buildSineTrack('LeftUpLeg', 1.6, 30, (p) => ({
        x: 0.75 + Math.sin(p) * 0.35,
        y: 0,
        z: 0.1,
      })),
      buildSineTrack('RightUpLeg', 1.6, 30, (p) => ({
        x: 0.75 - Math.sin(p) * 0.35,
        y: 0,
        z: -0.1,
      })),
      buildSineTrack('LeftLeg', 1.6, 30, (p) => ({
        x: -1.1 + Math.max(0, -Math.sin(p)) * 0.45,
        y: 0,
        z: 0,
      })),
      buildSineTrack('RightLeg', 1.6, 30, (p) => ({
        x: -1.1 + Math.max(0, Math.sin(p)) * 0.45,
        y: 0,
        z: 0,
      })),
      buildSineTrack('LeftArm', 1.6, 30, (p) => ({
        x: 0.4 - Math.sin(p) * 0.25,
        y: 0,
        z: 0.25,
      })),
      buildSineTrack('RightArm', 1.6, 30, (p) => ({
        x: 0.4 + Math.sin(p) * 0.25,
        y: 0,
        z: -0.25,
      })),
    ],
  },
  combat_guard: {
    name: 'Combat Guard',
    durationS: 2.0,
    fps: 30,
    loop: true,
    tracks: [
      buildSineTrack('Spine', 2.0, 30, (p) => ({
        x: 0.12,
        y: 0.25 + Math.sin(p) * 0.04,
        z: 0,
      })),
      buildSineTrack('LeftUpLeg', 2.0, 30, () => ({
        x: 0.3,
        y: 0,
        z: 0.15,
      })),
      buildSineTrack('RightUpLeg', 2.0, 30, () => ({
        x: -0.15,
        y: 0,
        z: -0.15,
      })),
      buildSineTrack('LeftLeg', 2.0, 30, () => ({
        x: -0.35,
        y: 0,
        z: 0,
      })),
      buildSineTrack('RightLeg', 2.0, 30, () => ({
        x: -0.25,
        y: 0,
        z: 0,
      })),
      buildSineTrack('LeftArm', 2.0, 30, (p) => ({
        x: 1.25 + Math.sin(p * 2) * 0.05,
        y: 0.35,
        z: 0.2,
      })),
      buildSineTrack('LeftForeArm', 2.0, 30, () => ({
        x: 1.45,
        y: 0,
        z: 0,
      })),
      buildSineTrack('RightArm', 2.0, 30, (p) => ({
        x: 1.15 + Math.cos(p * 2) * 0.05,
        y: -0.2,
        z: -0.2,
      })),
      buildSineTrack('RightForeArm', 2.0, 30, () => ({
        x: 1.55,
        y: 0,
        z: 0,
      })),
      buildSineTrack('Hips', 2.0, 30, (p) => ({
        x: 0,
        y: 0,
        z: 0,
        posY: 0.92 + Math.abs(Math.sin(p * 2)) * 0.015,
      })),
    ],
  },
};

// --- BVH Mocap Parser & Serializer -------------------------------------------

const BVH_BONE_MAP: Record<string, HumanoidBoneName> = {
  hips: 'Hips',
  pelvis: 'Hips',
  hip: 'Hips',
  root: 'Hips',
  spine: 'Spine',
  spine1: 'Spine1',
  spine2: 'Spine2',
  chest: 'Spine1',
  upperchest: 'Spine2',
  chest2: 'Spine2',
  neck: 'Neck',
  head: 'Head',
  leftshoulder: 'LeftShoulder',
  leftcollar: 'LeftShoulder',
  lshoulder: 'LeftShoulder',
  l_clavicle: 'LeftShoulder',
  leftarm: 'LeftArm',
  leftuparm: 'LeftArm',
  larm: 'LeftArm',
  l_upperarm: 'LeftArm',
  leftforearm: 'LeftForeArm',
  leftlowarm: 'LeftForeArm',
  lforearm: 'LeftForeArm',
  l_forearm: 'LeftForeArm',
  lefthand: 'LeftHand',
  lwrist: 'LeftHand',
  lhand: 'LeftHand',
  l_hand: 'LeftHand',
  rightshoulder: 'RightShoulder',
  rightcollar: 'RightShoulder',
  rshoulder: 'RightShoulder',
  r_clavicle: 'RightShoulder',
  rightarm: 'RightArm',
  rightuparm: 'RightArm',
  rarm: 'RightArm',
  r_upperarm: 'RightArm',
  rightforearm: 'RightForeArm',
  rightlowarm: 'RightForeArm',
  rforearm: 'RightForeArm',
  r_forearm: 'RightForeArm',
  righthand: 'RightHand',
  rwrist: 'RightHand',
  rhand: 'RightHand',
  r_hand: 'RightHand',
  leftupleg: 'LeftUpLeg',
  leftthigh: 'LeftUpLeg',
  lupleg: 'LeftUpLeg',
  l_thigh: 'LeftUpLeg',
  leftleg: 'LeftLeg',
  leftshin: 'LeftLeg',
  lleg: 'LeftLeg',
  l_calf: 'LeftLeg',
  leftfoot: 'LeftFoot',
  leftankle: 'LeftFoot',
  lfoot: 'LeftFoot',
  l_foot: 'LeftFoot',
  lefttoebase: 'LeftToeBase',
  lefttoe: 'LeftToeBase',
  ltoe: 'LeftToeBase',
  l_toe: 'LeftToeBase',
  rightupleg: 'RightUpLeg',
  rightthigh: 'RightUpLeg',
  rupleg: 'RightUpLeg',
  r_thigh: 'RightUpLeg',
  rightleg: 'RightLeg',
  rightshin: 'RightLeg',
  rleg: 'RightLeg',
  r_calf: 'RightLeg',
  rightfoot: 'RightFoot',
  rightankle: 'RightFoot',
  rfoot: 'RightFoot',
  r_foot: 'RightFoot',
  righttoebase: 'RightToeBase',
  righttoe: 'RightToeBase',
  rtoe: 'RightToeBase',
  r_toe: 'RightToeBase',
};

function normalizeBvhJointName(rawName: string): HumanoidBoneName | null {
  const clean = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (BVH_BONE_MAP[clean]) return BVH_BONE_MAP[clean];
  for (const [k, v] of Object.entries(BVH_BONE_MAP)) {
    if (clean.endsWith(k) || clean.includes(k)) return v;
  }
  return null;
}

interface ParsedBvhJoint {
  rawName: string;
  mappedBone: HumanoidBoneName | null;
  channels: string[];
  channelOffset: number;
}

/**
 * Parses Biovision (.bvh) text format into standard `AnimationClipData`.
 */
export function parseBvh(bvhText: string): AnimationClipData {
  const lines = bvhText.split(/\r?\n/);
  const joints: ParsedBvhJoint[] = [];
  let totalChannels = 0;

  let inMotion = false;
  let frameCount = 0;
  let frameTime = 1 / 30;
  const motionLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('MOTION')) {
      inMotion = true;
      continue;
    }

    if (!inMotion) {
      if (line.startsWith('ROOT') || line.startsWith('JOINT')) {
        const parts = line.split(/\s+/);
        const rawName = parts[1] ?? 'Unknown';
        const mappedBone = normalizeBvhJointName(rawName);
        joints.push({
          rawName,
          mappedBone,
          channels: [],
          channelOffset: totalChannels,
        });
      } else if (line.startsWith('CHANNELS')) {
        const parts = line.split(/\s+/);
        const count = parseInt(parts[1], 10);
        const chs = parts.slice(2, 2 + count);
        if (joints.length > 0) {
          joints[joints.length - 1].channels = chs;
          totalChannels += count;
        }
      }
    } else {
      if (line.startsWith('Frames:')) {
        frameCount = parseInt(line.split(':')[1].trim(), 10) || 0;
      } else if (line.startsWith('Frame Time:')) {
        frameTime = parseFloat(line.split(':')[1].trim()) || 1 / 30;
      } else {
        motionLines.push(line);
      }
    }
  }

  const fps = Math.round(1 / frameTime) || 30;
  const trackMap = new Map<HumanoidBoneName, BoneAnimationTrack>();

  for (const j of joints) {
    if (j.mappedBone && !trackMap.has(j.mappedBone)) {
      trackMap.set(j.mappedBone, {
        boneName: j.mappedBone,
        rotations: [],
        positions: j.mappedBone === 'Hips' ? [] : undefined,
      });
    }
  }

  const numFrames = Math.min(frameCount, motionLines.length);
  for (let f = 0; f < numFrames; f++) {
    const timeS = f * frameTime;
    const values = motionLines[f].trim().split(/\s+/).map(Number);
    if (values.length < totalChannels) continue;

    for (const j of joints) {
      if (!j.mappedBone) continue;
      const track = trackMap.get(j.mappedBone);
      if (!track) continue;

      let posX = 0, posY = 0, posZ = 0;
      let hasPos = false;
      let rotX = 0, rotY = 0, rotZ = 0;
      let rotOrder = '';

      for (let c = 0; c < j.channels.length; c++) {
        const ch = j.channels[c].toLowerCase();
        const val = values[j.channelOffset + c] || 0;

        if (ch === 'xposition') { posX = val * 0.01; hasPos = true; } // scale cm to m
        else if (ch === 'yposition') { posY = val * 0.01; hasPos = true; }
        else if (ch === 'zposition') { posZ = val * 0.01; hasPos = true; }
        else if (ch === 'xrotation') { rotX = val; rotOrder += 'X'; }
        else if (ch === 'yrotation') { rotY = val; rotOrder += 'Y'; }
        else if (ch === 'zrotation') { rotZ = val; rotOrder += 'Z'; }
      }

      const quat = eulerDegToQuat(rotX, rotY, rotZ, rotOrder || 'ZXY');
      track.rotations.push({ timeS, quat });

      if (hasPos && track.positions) {
        track.positions.push({ timeS, pos: { x: posX, y: posY, z: posZ } });
      }
    }
  }

  const tracks = Array.from(trackMap.values());
  const durationS = numFrames * frameTime;

  return {
    name: 'Imported BVH Mocap',
    durationS,
    fps,
    loop: true,
    tracks,
  };
}

/**
 * Serializes an `AnimationClipData` into standard Biovision (.bvh) text.
 */
export function exportBvh(clip: AnimationClipData, rig: HumanoidRigDefinition = createDefaultHumanoidRig()): string {
  const lines: string[] = [];
  lines.push('HIERARCHY');

  function writeJoint(node: BoneNode, indent: string): void {
    const isRoot = node.parent === null;
    if (isRoot) {
      lines.push(`${indent}ROOT ${node.name}`);
    } else {
      lines.push(`${indent}JOINT ${node.name}`);
    }
    lines.push(`${indent}{`);
    lines.push(
      `${indent}  OFFSET ${(node.restPosition.x * 100).toFixed(4)} ${(node.restPosition.y * 100).toFixed(4)} ${(node.restPosition.z * 100).toFixed(4)}`,
    );

    if (isRoot) {
      lines.push(`${indent}  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation`);
    } else {
      lines.push(`${indent}  CHANNELS 3 Zrotation Xrotation Yrotation`);
    }

    if (node.children.length === 0) {
      lines.push(`${indent}  End Site`);
      lines.push(`${indent}  {`);
      lines.push(`${indent}    OFFSET 0.0000 ${(node.length * 100).toFixed(4)} 0.0000`);
      lines.push(`${indent}  }`);
    } else {
      for (const childName of node.children) {
        const childNode = rig.hierarchy.bones[childName];
        if (childNode) writeJoint(childNode, indent + '  ');
      }
    }

    lines.push(`${indent}}`);
  }

  writeJoint(rig.hierarchy.bones[rig.hierarchy.root], '');

  // Motion Section
  const fps = Math.max(1, clip.fps || 30);
  const frameTime = 1 / fps;
  const frameCount = Math.max(1, Math.round(clip.durationS * fps) + 1);

  lines.push('MOTION');
  lines.push(`Frames: ${frameCount}`);
  lines.push(`Frame Time: ${frameTime.toFixed(6)}`);

  // Linearize joints in hierarchy traversal order
  const traversalOrder: HumanoidBoneName[] = [];
  function collectOrder(name: HumanoidBoneName): void {
    traversalOrder.push(name);
    const node = rig.hierarchy.bones[name];
    if (node) {
      for (const ch of node.children) collectOrder(ch);
    }
  }
  collectOrder(rig.hierarchy.root);

  for (let f = 0; f < frameCount; f++) {
    const timeS = f * frameTime;
    const pose = sampleAnimationClip(clip, timeS);
    const row: string[] = [];

    for (const boneName of traversalOrder) {
      const transform = pose[boneName] ?? { rotation: qIdentity() };
      const isRoot = boneName === rig.hierarchy.root;

      if (isRoot) {
        const pos = transform.position ?? rig.hierarchy.bones[boneName].restPosition;
        row.push(
          (pos.x * 100).toFixed(4),
          (pos.y * 100).toFixed(4),
          (pos.z * 100).toFixed(4),
        );
      }

      const euler = quatToEulerDegZXY(transform.rotation);
      row.push(
        euler.zDeg.toFixed(4),
        euler.xDeg.toFixed(4),
        euler.yDeg.toFixed(4),
      );
    }

    lines.push(row.join(' '));
  }

  return lines.join('\n');
}
