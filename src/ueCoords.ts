// ---------------------------------------------------------------------------
// Pure Domain Engine: SetView <-> Unreal Engine Coordinate Contract
//
// The single source of truth for every SetView -> Unreal handoff (USD, generated
// Python, JSON manifest, LiveLink/VCam, nDisplay). Pure module: ZERO Three.js,
// ZERO DOM, ZERO imports, so it can be unit-tested in plain Node and ported
// verbatim alongside the rest of the domain layer.
//
// SetView is RIGHT-handed, Y-up, metres: +X right, +Y up, camera looks down -Z,
// and an actor heading `rotationY` of 0 faces +Z.
// Unreal is LEFT-handed, Z-up, centimetres: +X forward, +Y right, +Z up.
//
// Converting right-handed to left-handed REQUIRES a basis map with determinant
// -1 (an odd number of axis negations). A determinant +1 permutation such as
// (x, y, z) -> (z, x, y) is a pure rotation: it keeps the scene internally
// self-consistent but mirrors it, silently reversing all screen direction. That
// bug is why every transform in this repo must route through this module.
//
//   x_ue = -z_sv * 100      y_ue = x_sv * 100      z_ue = y_sv * 100
//   basis matrix [[0,0,-1],[1,0,0],[0,1,0]], det = -1
//
// The paired heading correction is yaw_ue = 180 - degrees(rotationY): SetView
// heading 0 faces +Z, which maps to Unreal -X, i.e. yaw 180. An identity SetView
// camera quaternion (looking down -Z) therefore lands on Unreal yaw 0, facing +X.
// ---------------------------------------------------------------------------

export interface UeVec3 {
  x: number;
  y: number;
  z: number;
}

export interface UeQuat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Unreal FRotator, degrees. */
export interface UeRotator {
  pitch: number;
  yaw: number;
  roll: number;
}

/** Unreal orthonormal frame: the three rows of an FRotationMatrix. */
export interface UeBasis {
  forward: UeVec3;
  right: UeVec3;
  up: UeVec3;
}

/** SetView metres -> Unreal centimetres. */
export const SV_TO_UE_SCALE = 100.0;

const RAD2DEG = 180.0 / Math.PI;
const DEG2RAD = Math.PI / 180.0;

/** Normalises the negative zero that `-0 * s` produces so equality checks behave. */
function noNegZero(v: number): number {
  return v === 0 ? 0 : v;
}

function finite(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

/**
 * Maps a SetView direction vector into Unreal's axis convention (no unit scaling).
 * This is the determinant -1 basis map: (x, y, z) -> (-z, x, y).
 */
export function svDirectionToUe(v: { x: number; y: number; z: number }): UeVec3 {
  const x = finite(v.x);
  const y = finite(v.y);
  const z = finite(v.z);
  return { x: noNegZero(-z), y: noNegZero(x), z: noNegZero(y) };
}

/** Inverse of {@link svDirectionToUe}: (x, y, z)_ue -> (y, z, -x)_sv. */
export function ueDirectionToSv(v: { x: number; y: number; z: number }): UeVec3 {
  const x = finite(v.x);
  const y = finite(v.y);
  const z = finite(v.z);
  return { x: noNegZero(y), y: noNegZero(z), z: noNegZero(-x) };
}

/**
 * Converts a SetView position (metres, Y-up, right-handed) to Unreal Engine
 * (centimetres, Z-up, left-handed).
 */
export function svToUeLocation(
  pos: { x: number; y: number; z: number },
  scaleFactor: number = SV_TO_UE_SCALE,
): UeVec3 {
  const x = finite(pos.x);
  const y = finite(pos.y);
  const z = finite(pos.z);
  return {
    x: noNegZero(-z * scaleFactor),
    y: noNegZero(x * scaleFactor),
    z: noNegZero(y * scaleFactor),
  };
}

/** Inverse of {@link svToUeLocation}: Unreal centimetres back to SetView metres. */
export function ueToSvLocation(
  loc: { x: number; y: number; z: number },
  scaleFactor: number = SV_TO_UE_SCALE,
): UeVec3 {
  const x = finite(loc.x);
  const y = finite(loc.y);
  const z = finite(loc.z);
  if (!scaleFactor) return { x: 0, y: 0, z: 0 };
  return {
    x: noNegZero(y / scaleFactor),
    y: noNegZero(z / scaleFactor),
    z: noNegZero(-x / scaleFactor),
  };
}

/**
 * Converts a SetView heading (radians around +Y, 0 = +Z) to an Unreal Yaw
 * (degrees around +Z, 0 = +X). SetView +Z is Unreal -X, hence the 180 offset
 * and the reversed sweep direction.
 */
export function svHeadingToUeYaw(rotationYRad: number): number {
  return 180.0 - finite(rotationYRad) * RAD2DEG;
}

/** Inverse of {@link svHeadingToUeYaw}. */
export function ueYawToSvHeading(yawDeg: number): number {
  return (180.0 - finite(yawDeg)) * DEG2RAD;
}

/**
 * Extracts an Unreal FRotator from an Unreal orthonormal frame.
 * Mirrors Unreal's own FRotationMatrix rows:
 *   forward = (CP*CY, CP*SY, SP)
 *   right   = (SR*SP*CY - CR*SY, SR*SP*SY + CR*CY, -SR*CP)
 *   up      = (-(CR*SP*CY + SR*SY), CY*SR - CR*SP*SY, CR*CP)
 * so yaw/pitch come from forward and roll from atan2(-right.z, up.z).
 */
export function ueBasisToRotator(forward: UeVec3, right: UeVec3, up: UeVec3): UeRotator {
  const yawDeg = Math.atan2(forward.y, forward.x) * RAD2DEG;
  const horiz = Math.sqrt(forward.x * forward.x + forward.y * forward.y);
  const pitchDeg = Math.atan2(forward.z, horiz) * RAD2DEG;
  const rollDeg = Math.atan2(-right.z, up.z) * RAD2DEG;
  return {
    pitch: Number.isFinite(pitchDeg) ? pitchDeg : 0,
    yaw: Number.isFinite(yawDeg) ? yawDeg : 0,
    roll: Number.isFinite(rollDeg) ? rollDeg : 0,
  };
}

/** Rebuilds the Unreal orthonormal frame from an FRotator (exact inverse of {@link ueBasisToRotator}). */
export function ueRotatorToBasis(rot: UeRotator): UeBasis {
  const p = finite(rot.pitch) * DEG2RAD;
  const y = finite(rot.yaw) * DEG2RAD;
  const r = finite(rot.roll) * DEG2RAD;
  const sp = Math.sin(p);
  const cp = Math.cos(p);
  const sy = Math.sin(y);
  const cy = Math.cos(y);
  const sr = Math.sin(r);
  const cr = Math.cos(r);
  return {
    forward: { x: cp * cy, y: cp * sy, z: sp },
    right: { x: sr * sp * cy - cr * sy, y: sr * sp * sy + cr * cy, z: -sr * cp },
    up: { x: -(cr * sp * cy + sr * sy), y: cy * sr - cr * sp * sy, z: cr * cp },
  };
}

/**
 * Camera basis (forward / up / right) of a Three.js quaternion, in SetView world
 * space. Three.js cameras look down local -Z with local +Y up and local +X right.
 */
export function svQuatToBasis(q: { x: number; y: number; z: number; w: number }): {
  forward: UeVec3;
  up: UeVec3;
  right: UeVec3;
} {
  let qx = finite(q.x);
  let qy = finite(q.y);
  let qz = finite(q.z);
  let qw = Number.isFinite(q.w) ? q.w : 1;
  const len = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
  if (len > 1e-9) {
    qx /= len;
    qy /= len;
    qz /= len;
    qw /= len;
  } else {
    qx = 0;
    qy = 0;
    qz = 0;
    qw = 1;
  }

  return {
    // R * (0, 0, -1)
    forward: {
      x: -2.0 * (qx * qz + qw * qy),
      y: -2.0 * (qy * qz - qw * qx),
      z: -(1.0 - 2.0 * (qx * qx + qy * qy)),
    },
    // R * (0, 1, 0)
    up: {
      x: 2.0 * (qx * qy - qw * qz),
      y: 1.0 - 2.0 * (qx * qx + qz * qz),
      z: 2.0 * (qy * qz + qw * qx),
    },
    // R * (1, 0, 0)
    right: {
      x: 1.0 - 2.0 * (qy * qy + qz * qz),
      y: 2.0 * (qx * qy + qw * qz),
      z: 2.0 * (qx * qz - qw * qy),
    },
  };
}

/**
 * Converts a Three.js / SetView camera quaternion to an Unreal FRotator.
 * An identity quaternion yields (0, 0, 0): the camera faces Unreal +X.
 */
export function svQuatToUeRotator(q: { x: number; y: number; z: number; w: number }): UeRotator {
  const b = svQuatToBasis(q);
  return ueBasisToRotator(svDirectionToUe(b.forward), svDirectionToUe(b.right), svDirectionToUe(b.up));
}

/**
 * Converts an Unreal FRotator back to a Three.js / SetView camera quaternion
 * (exact inverse of {@link svQuatToUeRotator}).
 */
export function ueRotatorToSvQuat(rot: UeRotator): UeQuat {
  const basis = ueRotatorToBasis(rot);
  const f = ueDirectionToSv(basis.forward);
  const u = ueDirectionToSv(basis.up);
  // SetView camera columns: right (+X), up (+Y), back (+Z = -forward).
  const r: UeVec3 = {
    x: f.y * u.z - f.z * u.y,
    y: f.z * u.x - f.x * u.z,
    z: f.x * u.y - f.y * u.x,
  };

  const m00 = r.x;
  const m01 = u.x;
  const m02 = -f.x;
  const m10 = r.y;
  const m11 = u.y;
  const m12 = -f.y;
  const m20 = r.z;
  const m21 = u.z;
  const m22 = -f.z;

  const trace = m00 + m11 + m22;
  let qx = 0;
  let qy = 0;
  let qz = 0;
  let qw = 1;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    qw = 0.25 / s;
    qx = (m21 - m12) * s;
    qy = (m02 - m20) * s;
    qz = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }

  const len = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
  if (!(len > 1e-9)) return { x: 0, y: 0, z: 0, w: 1 };
  return { x: qx / len, y: qy / len, z: qz / len, w: qw / len };
}

/**
 * Converts an Unreal FRotator to Unreal's own left-handed quaternion,
 * matching FRotator::Quaternion() exactly.
 */
export function ueRotatorToUeQuat(rot: UeRotator): UeQuat {
  const p = finite(rot.pitch) * DEG2RAD * 0.5;
  const y = finite(rot.yaw) * DEG2RAD * 0.5;
  const r = finite(rot.roll) * DEG2RAD * 0.5;

  const sp = Math.sin(p);
  const cp = Math.cos(p);
  const sy = Math.sin(y);
  const cy = Math.cos(y);
  const sr = Math.sin(r);
  const cr = Math.cos(r);

  return {
    x: cr * sp * sy - sr * cp * cy,
    y: -cr * sp * cy - sr * cp * sy,
    z: cr * cp * sy - sr * sp * cy,
    w: cr * cp * cy + sr * sp * sy,
  };
}
