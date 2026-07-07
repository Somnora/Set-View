// ---------------------------------------------------------------------------
// Locomotion math — PURE, portable (Unity: a static Locomotion helper).
//
// SetView's movement model: in passthrough AR the user physically exists in
// the room, so "moving through the virtual set" means translating/rotating the
// content instead of a camera rig. Both smooth glide and snap-turn are
// expressed as changes to contentRoot's rigid transform (a world-space
// translation `offset` plus a yaw `viewYaw`), exactly like point-teleport —
// which keeps anchored content consistent (see views.ts).
//
// These functions are the arithmetic core; the THREE vector plumbing (deriving
// world forward/right from the head quaternion) lives in main.ts / views.ts.
// ---------------------------------------------------------------------------

export interface MoveAmount {
  /** Meters to advance along the head's forward (into the scene = +). */
  forward: number;
  /** Meters to strafe along the head's right (+ = right). */
  right: number;
}

/**
 * Converts a thumbstick reading into a per-frame move amount. Applies a radial
 * deadzone and clamps the input vector to unit length so diagonals aren't
 * faster than cardinals. Gamepad convention: stickY is negative when pushed
 * up/forward, so forward = -stickY.
 */
export function locomotionAmount(
  stickX: number,
  stickY: number,
  speed: number,
  dt: number,
  deadzone = 0.15,
): MoveAmount {
  let ax = stickX;
  let ay = stickY;
  const mag = Math.hypot(ax, ay);
  if (mag < deadzone) return { forward: 0, right: 0 };
  if (mag > 1) {
    ax /= mag;
    ay /= mag;
  }
  const step = speed * dt;
  return { forward: -ay * step, right: ax * step };
}

/**
 * viewYaw delta for one snap-turn step. `step` is +1 for a stick push to the
 * RIGHT and -1 for LEFT (see input.stickStepX). Convention: a right push turns
 * the VIEW right, which means yawing the content by a POSITIVE angle about the
 * user — e.g. an actor on your right swings to front (verified in the pivot
 * test). So the angle is simply step·increment; the sign lives here, tested,
 * rather than as a bare literal at the call site.
 */
export function snapTurnAngle(step: -1 | 0 | 1, incrementRad: number): number {
  return step * incrementRad;
}

export interface XZ {
  x: number;
  z: number;
}

/**
 * Rotates a world-space translation `offset` about a world pivot by `angle`
 * radians around +Y, returning the new offset. Used by snap-turn: rotating the
 * whole set about the user keeps the point under their feet fixed while the
 * world yaws. Rotation about +Y on (x,z): x' = x·cos + z·sin, z' = -x·sin + z·cos.
 */
export function rotateOffsetAboutPivot(offset: XZ, pivot: XZ, angle: number): XZ {
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  const ox = offset.x - pivot.x;
  const oz = offset.z - pivot.z;
  return {
    x: pivot.x + (ox * c + oz * s),
    z: pivot.z + (-ox * s + oz * c),
  };
}
