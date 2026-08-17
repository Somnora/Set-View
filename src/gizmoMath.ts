// ---------------------------------------------------------------------------
// Pure Domain Spatial Gizmo Mathematics (Zero Three.js / DOM imports)
//
// Core math for 3D translation, rotation, and scaling gizmos:
//   - Precise ray-axis closest point and skew-line distance math
//   - Ray-plane intersections for planar dragging
//   - Signed planar angular rotation math
//   - Proportional scale factor computation
//   - Granular configurable snapping for translation, rotation, and scaling
//   - Zero-allocation domain transform resolution
// ---------------------------------------------------------------------------

export type GizmoMode = 'translate' | 'rotate' | 'scale';

export type GizmoAxis =
  | 'x'
  | 'y'
  | 'z'
  | 'xy'
  | 'xz'
  | 'yz'
  | 'screen'
  | 'uniform';

export interface GizmoSnapConfig {
  /** Translation snap step in meters (e.g. 0.1m, 0.5m, 1.0m). */
  translateSnapM: number;
  /** Rotation snap angle in radians (e.g. Math.PI / 12 for 15 deg, Math.PI / 4 for 45 deg). */
  rotateSnapRad: number;
  /** Scale snap step factor (e.g. 0.1x). */
  scaleSnapStep: number;
  /** Whether snapping is currently active. */
  enabled: boolean;
}

export const DEFAULT_GIZMO_SNAP_CONFIG: GizmoSnapConfig = {
  translateSnapM: 0.1,
  rotateSnapRad: Math.PI / 12, // 15 degrees
  scaleSnapStep: 0.1,
  enabled: false,
};

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

// --- Vector and Quaternion Pure Math Helpers ---------------------------------

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function vec3Clone(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vec3Scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function vec3Length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function vec3Distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function quatIdentity(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 };
}

export function quatFromAxisAngle(axis: Vec3, rad: number): Quat {
  const normAxis = vec3Normalize(axis);
  const halfAngle = rad * 0.5;
  const s = Math.sin(halfAngle);
  return {
    x: normAxis.x * s,
    y: normAxis.y * s,
    z: normAxis.z * s,
    w: Math.cos(halfAngle),
  };
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function quatRotateVec3(q: Quat, v: Vec3): Vec3 {
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

// --- Snapping Utilities ------------------------------------------------------

/**
 * Snaps a scalar value to the nearest discrete step increment.
 */
export function snapValue(val: number, step: number): number {
  if (!Number.isFinite(val)) return 0;
  if (!Number.isFinite(step) || step <= 0) return val;
  const snapped = Math.round(val / step) * step;
  return Math.abs(snapped) < 1e-12 ? 0 : Number(snapped.toFixed(10));
}

/**
 * Snaps a 3D vector to a coordinate grid of specified step size.
 */
export function snapVec3(v: Vec3, step: number): Vec3 {
  return {
    x: snapValue(v.x, step),
    y: snapValue(v.y, step),
    z: snapValue(v.z, step),
  };
}

/**
 * Snaps an angle in radians to discrete angular steps.
 */
export function snapRotation(rad: number, stepRad: number): number {
  if (!Number.isFinite(rad)) return 0;
  if (!Number.isFinite(stepRad) || stepRad <= 0) return rad;
  return snapValue(rad, stepRad);
}

// --- Ray and Geometry Math ---------------------------------------------------

/**
 * Calculates the offset parameter along an axis line for the point closest to a 3D ray.
 *
 * @param rayOrigin Origin of the pointer ray.
 * @param rayDir Direction vector of the pointer ray.
 * @param axisOrigin Origin of the gizmo axis.
 * @param axisDir Unit direction vector of the axis.
 * @returns Signed distance along the axis from axisOrigin to the closest point.
 */
export function calculateAxisRayOffset(
  rayOrigin: Vec3,
  rayDir: Vec3,
  axisOrigin: Vec3,
  axisDir: Vec3
): number {
  const normRayDir = vec3Normalize(rayDir);
  const normAxisDir = vec3Normalize(axisDir);

  const w0 = vec3Sub(axisOrigin, rayOrigin);
  const a = vec3Dot(normAxisDir, normAxisDir);
  const b = vec3Dot(normAxisDir, normRayDir);
  const c = vec3Dot(normRayDir, normRayDir);
  const d = vec3Dot(normAxisDir, w0);
  const e = vec3Dot(normRayDir, w0);

  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-6) {
    // Parallel or degenerate rays: orthogonal projection of origin offset
    return -d;
  }
  return (b * e - c * d) / denom;
}

/**
 * Calculates the intersection point between a 3D ray and a plane.
 *
 * @param rayOrigin Origin of the ray.
 * @param rayDir Direction vector of the ray.
 * @param planeOrigin A point lying on the plane.
 * @param planeNormal Normal vector of the plane.
 * @returns 3D intersection point or null if ray is parallel to plane.
 */
export function calculatePlaneRayIntersection(
  rayOrigin: Vec3,
  rayDir: Vec3,
  planeOrigin: Vec3,
  planeNormal: Vec3
): Vec3 | null {
  const normPlaneNormal = vec3Normalize(planeNormal);
  const normRayDir = vec3Normalize(rayDir);

  const denom = vec3Dot(normRayDir, normPlaneNormal);
  if (Math.abs(denom) < 1e-7) {
    return null;
  }

  const p0_minus_r0 = vec3Sub(planeOrigin, rayOrigin);
  const t = vec3Dot(p0_minus_r0, normPlaneNormal) / denom;

  if (!Number.isFinite(t)) {
    return null;
  }

  return vec3Add(rayOrigin, vec3Scale(normRayDir, t));
}

/**
 * Calculates the signed rotation angle in radians on a 2D plane relative to a reference direction.
 *
 * @param hitPoint Current hit point on the rotation plane.
 * @param center Center point of the rotation plane/gizmo.
 * @param planeNormal Unit normal vector of the rotation plane.
 * @param referenceDir Reference direction on the plane (start of drag).
 * @returns Signed angle in radians in range [-Math.PI, Math.PI].
 */
export function calculateRotationAngleOnPlane(
  hitPoint: Vec3,
  center: Vec3,
  planeNormal: Vec3,
  referenceDir: Vec3
): number {
  const normPlaneNormal = vec3Normalize(planeNormal);
  const normRefDir = vec3Normalize(referenceDir);

  const v = vec3Sub(hitPoint, center);
  const dotN = vec3Dot(v, normPlaneNormal);
  const proj = vec3Sub(v, vec3Scale(normPlaneNormal, dotN));
  const projLen = vec3Length(proj);
  if (projLen < 1e-7) {
    return 0;
  }
  const normProj = vec3Scale(proj, 1 / projLen);

  const cosAngle = Math.max(-1, Math.min(1, vec3Dot(normRefDir, normProj)));
  const cross = vec3Cross(normPlaneNormal, normRefDir);
  const sinAngle = Math.max(-1, Math.min(1, vec3Dot(cross, normProj)));

  return Math.atan2(sinAngle, cosAngle);
}

/**
 * Calculates the scale factor delta between drag start and current hit point.
 *
 * @param dragStartPoint 3D point where scaling gesture initiated.
 * @param currentPoint Current 3D hit point during drag.
 * @param center Center point of the gizmo.
 * @param axisDir Optional direction vector for single-axis constraint.
 * @returns Multiplicative scale factor (always > 0).
 */
export function calculateScaleDelta(
  dragStartPoint: Vec3,
  currentPoint: Vec3,
  center: Vec3,
  axisDir?: Vec3
): number {
  if (axisDir) {
    const normAxis = vec3Normalize(axisDir);
    const v0 = vec3Sub(dragStartPoint, center);
    const v1 = vec3Sub(currentPoint, center);
    const d0 = vec3Dot(v0, normAxis);
    const d1 = vec3Dot(v1, normAxis);
    if (Math.abs(d0) < 1e-6) return 1.0;
    const ratio = d1 / d0;
    return Math.max(0.01, ratio);
  } else {
    const d0 = vec3Distance(dragStartPoint, center);
    const d1 = vec3Distance(currentPoint, center);
    if (d0 < 1e-6) return 1.0;
    const ratio = d1 / d0;
    return Math.max(0.01, ratio);
  }
}

// --- Transform Application Helpers -------------------------------------------

/**
 * Applies translation delta to a starting position with axis constraints and snapping.
 */
export function applyGizmoTranslation(
  startPos: Vec3,
  delta: Vec3,
  axis: GizmoAxis,
  snap?: GizmoSnapConfig
): Vec3 {
  const result = { ...startPos };
  const step = snap?.enabled ? snap.translateSnapM : 0;

  switch (axis) {
    case 'x':
      result.x = step > 0 ? snapValue(startPos.x + delta.x, step) : startPos.x + delta.x;
      break;
    case 'y':
      result.y = step > 0 ? snapValue(startPos.y + delta.y, step) : startPos.y + delta.y;
      break;
    case 'z':
      result.z = step > 0 ? snapValue(startPos.z + delta.z, step) : startPos.z + delta.z;
      break;
    case 'xy':
      result.x = step > 0 ? snapValue(startPos.x + delta.x, step) : startPos.x + delta.x;
      result.y = step > 0 ? snapValue(startPos.y + delta.y, step) : startPos.y + delta.y;
      break;
    case 'xz':
      result.x = step > 0 ? snapValue(startPos.x + delta.x, step) : startPos.x + delta.x;
      result.z = step > 0 ? snapValue(startPos.z + delta.z, step) : startPos.z + delta.z;
      break;
    case 'yz':
      result.y = step > 0 ? snapValue(startPos.y + delta.y, step) : startPos.y + delta.y;
      result.z = step > 0 ? snapValue(startPos.z + delta.z, step) : startPos.z + delta.z;
      break;
    case 'screen':
    case 'uniform':
    default:
      result.x = step > 0 ? snapValue(startPos.x + delta.x, step) : startPos.x + delta.x;
      result.y = step > 0 ? snapValue(startPos.y + delta.y, step) : startPos.y + delta.y;
      result.z = step > 0 ? snapValue(startPos.z + delta.z, step) : startPos.z + delta.z;
      break;
  }
  return result;
}

/**
 * Applies scalar angular rotation with optional snapping.
 */
export function applyGizmoRotation(
  startRotY: number,
  deltaRad: number,
  snap?: GizmoSnapConfig
): number {
  const raw = startRotY + deltaRad;
  if (snap?.enabled && snap.rotateSnapRad > 0) {
    return snapRotation(raw, snap.rotateSnapRad);
  }
  return raw;
}

/**
 * Applies 3D quaternion rotation with axis-angle delta and optional snapping.
 */
export function applyGizmoRotationQuat(
  startRot: Quat,
  axis: Vec3,
  angleRad: number,
  snap?: GizmoSnapConfig
): Quat {
  const effectiveAngle =
    snap?.enabled && snap.rotateSnapRad > 0
      ? snapRotation(angleRad, snap.rotateSnapRad)
      : angleRad;
  const deltaQuat = quatFromAxisAngle(axis, effectiveAngle);
  return quatMultiply(deltaQuat, startRot);
}

/**
 * Applies scale factor to a 3D scale vector with axis constraints and snapping.
 */
export function applyGizmoScale(
  startScale: Vec3,
  scaleFactor: number | Vec3,
  axis: GizmoAxis,
  snap?: GizmoSnapConfig
): Vec3 {
  const step = snap?.enabled ? snap.scaleSnapStep : 0;
  const result = { ...startScale };

  if (typeof scaleFactor === 'number') {
    const factor = scaleFactor;
    switch (axis) {
      case 'x': {
        const s = startScale.x * factor;
        result.x = Math.max(0.01, step > 0 ? snapValue(s, step) : s);
        break;
      }
      case 'y': {
        const s = startScale.y * factor;
        result.y = Math.max(0.01, step > 0 ? snapValue(s, step) : s);
        break;
      }
      case 'z': {
        const s = startScale.z * factor;
        result.z = Math.max(0.01, step > 0 ? snapValue(s, step) : s);
        break;
      }
      case 'xy': {
        const sx = startScale.x * factor;
        const sy = startScale.y * factor;
        result.x = Math.max(0.01, step > 0 ? snapValue(sx, step) : sx);
        result.y = Math.max(0.01, step > 0 ? snapValue(sy, step) : sy);
        break;
      }
      case 'xz': {
        const sx = startScale.x * factor;
        const sz = startScale.z * factor;
        result.x = Math.max(0.01, step > 0 ? snapValue(sx, step) : sx);
        result.z = Math.max(0.01, step > 0 ? snapValue(sz, step) : sz);
        break;
      }
      case 'yz': {
        const sy = startScale.y * factor;
        const sz = startScale.z * factor;
        result.y = Math.max(0.01, step > 0 ? snapValue(sy, step) : sy);
        result.z = Math.max(0.01, step > 0 ? snapValue(sz, step) : sz);
        break;
      }
      case 'uniform':
      case 'screen':
      default: {
        const sx = startScale.x * factor;
        const sy = startScale.y * factor;
        const sz = startScale.z * factor;
        result.x = Math.max(0.01, step > 0 ? snapValue(sx, step) : sx);
        result.y = Math.max(0.01, step > 0 ? snapValue(sy, step) : sy);
        result.z = Math.max(0.01, step > 0 ? snapValue(sz, step) : sz);
        break;
      }
    }
  } else {
    result.x = Math.max(
      0.01,
      step > 0 ? snapValue(startScale.x * scaleFactor.x, step) : startScale.x * scaleFactor.x
    );
    result.y = Math.max(
      0.01,
      step > 0 ? snapValue(startScale.y * scaleFactor.y, step) : startScale.y * scaleFactor.y
    );
    result.z = Math.max(
      0.01,
      step > 0 ? snapValue(startScale.z * scaleFactor.z, step) : startScale.z * scaleFactor.z
    );
  }

  return result;
}

/**
 * Applies uniform scale multiplier to a scalar scale.
 */
export function applyGizmoUniformScale(
  startScale: number,
  factor: number,
  snap?: GizmoSnapConfig
): number {
  const step = snap?.enabled ? snap.scaleSnapStep : 0;
  const s = startScale * factor;
  return Math.max(0.01, step > 0 ? snapValue(s, step) : s);
}

export interface GizmoTransformInput {
  mode: GizmoMode;
  axis: GizmoAxis;
  startPosition: Vec3;
  startRotation?: Quat | number | Vec3;
  startScale?: Vec3 | number;
  deltaPosition?: Vec3;
  deltaRotationAngleRad?: number;
  rotationAxis?: Vec3;
  scaleFactor?: number | Vec3;
  snap?: GizmoSnapConfig;
}

export interface GizmoTransformResult {
  position: Vec3;
  rotation?: Quat | number | Vec3;
  scale?: Vec3 | number;
}

/**
 * Coordinates unified domain transform application across translate, rotate, and scale modes.
 */
export function applyGizmoTransform(input: GizmoTransformInput): GizmoTransformResult {
  const result: GizmoTransformResult = {
    position: { ...input.startPosition },
    rotation: input.startRotation,
    scale: input.startScale,
  };

  if (input.mode === 'translate' && input.deltaPosition) {
    result.position = applyGizmoTranslation(
      input.startPosition,
      input.deltaPosition,
      input.axis,
      input.snap
    );
  } else if (input.mode === 'rotate') {
    const angle = input.deltaRotationAngleRad ?? 0;
    const axis = input.rotationAxis ?? { x: 0, y: 1, z: 0 };
    if (typeof input.startRotation === 'number') {
      result.rotation = applyGizmoRotation(input.startRotation, angle, input.snap);
    } else if (input.startRotation && 'w' in input.startRotation) {
      result.rotation = applyGizmoRotationQuat(input.startRotation, axis, angle, input.snap);
    } else if (input.startRotation && 'y' in input.startRotation) {
      const cur = input.startRotation as Vec3;
      const step = input.snap?.enabled ? input.snap.rotateSnapRad : 0;
      if (input.axis === 'x') {
        result.rotation = {
          ...cur,
          x: step > 0 ? snapRotation(cur.x + angle, step) : cur.x + angle,
        };
      } else if (input.axis === 'y') {
        result.rotation = {
          ...cur,
          y: step > 0 ? snapRotation(cur.y + angle, step) : cur.y + angle,
        };
      } else if (input.axis === 'z') {
        result.rotation = {
          ...cur,
          z: step > 0 ? snapRotation(cur.z + angle, step) : cur.z + angle,
        };
      }
    }
  } else if (input.mode === 'scale' && input.scaleFactor !== undefined) {
    if (typeof input.startScale === 'number') {
      const f = typeof input.scaleFactor === 'number' ? input.scaleFactor : input.scaleFactor.x;
      result.scale = applyGizmoUniformScale(input.startScale, f, input.snap);
    } else if (input.startScale) {
      result.scale = applyGizmoScale(input.startScale, input.scaleFactor, input.axis, input.snap);
    }
  }

  return result;
}
