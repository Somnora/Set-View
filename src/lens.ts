// ---------------------------------------------------------------------------
// Lens math — PURE, portable (Unity: a static LensMath class).
//
// Sensor model: the horizontal angle of view is set by the format's physical
// gate width and anamorphic squeeze (the way a director's viewfinder behaves —
// a shared-width framing chart). The vertical extent follows from the chosen
// aspect ratio. Depth-of-field uses the format's circle of confusion.
//
// Anamorphic note: horizontal AoV uses gateWidth·squeeze (a 2x anamorphic 50mm
// frames like a 25mm spherical). We still derive the vertical extent from the
// target (desqueezed) aspect, which is what the delivered frame looks like.
// ---------------------------------------------------------------------------

import {
  aspectValue,
  sensorFormat,
  type AspectName,
  type CameraSetupData,
  type Quat,
  type SensorFormat,
  type Vec3,
} from './model.ts';

/** Historical Super-35 gate width, kept for reference/tests. */
export const SUPER35_WIDTH_MM = 24.89;

/** Resolves a format from an id, or passes a format through. */
function fmtOf(format: SensorFormat | string): SensorFormat {
  return typeof format === 'string' ? sensorFormat(format) : format;
}

/** Horizontal field of view in radians for a focal length on a format. */
export function hFovRad(focalMm: number, format: SensorFormat | string): number {
  const f = fmtOf(format);
  return 2 * Math.atan((f.gateWidthMm * f.squeeze) / (2 * focalMm));
}

export function hFovDeg(focalMm: number, format: SensorFormat | string): number {
  return (hFovRad(focalMm, format) * 180) / Math.PI;
}

/** Vertical FOV in radians, derived from the horizontal FOV and the aspect. */
export function vFovRad(focalMm: number, aspect: AspectName, format: SensorFormat | string): number {
  return 2 * Math.atan(Math.tan(hFovRad(focalMm, format) / 2) / aspectValue(aspect));
}

/**
 * Vertical FOV in degrees — what a three.js PerspectiveCamera (or Unity
 * Camera.fieldOfView) wants.
 */
export function vFovDeg(focalMm: number, aspect: AspectName, format: SensorFormat | string): number {
  return (vFovRad(focalMm, aspect, format) * 180) / Math.PI;
}

/** Diagonal FOV in degrees (tan-combined H and V half-angles). */
export function dFovDeg(focalMm: number, aspect: AspectName, format: SensorFormat | string): number {
  const th = Math.tan(hFovRad(focalMm, format) / 2);
  const tv = Math.tan(vFovRad(focalMm, aspect, format) / 2);
  return (2 * Math.atan(Math.sqrt(th * th + tv * tv)) * 180) / Math.PI;
}

/**
 * Width/height in meters of the frame rectangle at `distance` meters from the
 * eye. Used for the eyes-as-camera frame-line overlay and field-width readouts.
 */
export function frameSizeAtDistance(
  focalMm: number,
  aspect: AspectName,
  distance: number,
  format: SensorFormat | string,
): { width: number; height: number } {
  const width = 2 * distance * Math.tan(hFovRad(focalMm, format) / 2);
  return { width, height: width / aspectValue(aspect) };
}

// --- depth of field ---------------------------------------------------------

export interface DepthOfField {
  /** Nearest in-focus distance, meters. */
  nearM: number;
  /** Farthest in-focus distance, meters (Infinity at/beyond hyperfocal). */
  farM: number;
  /** Hyperfocal distance, meters. */
  hyperfocalM: number;
  /** Total depth of field, meters (Infinity when farM is Infinity). */
  dofM: number;
}

/** Hyperfocal distance in meters. `fNumber` ≈ T-stop for this purpose. */
export function hyperfocalM(focalMm: number, fNumber: number, cocMm: number): number {
  return ((focalMm * focalMm) / (fNumber * cocMm) + focalMm) / 1000;
}

/**
 * Near/far focus limits at a subject distance (meters). Standard thin-lens DOF
 * with the format's circle of confusion. We approximate the geometric f-number
 * by the T-stop (the difference is well under 1/3 stop, and DPs set T).
 */
export function depthOfField(
  focalMm: number,
  fNumber: number,
  subjectM: number,
  cocMm: number,
): DepthOfField {
  const f = focalMm;
  const Hmm = (f * f) / (fNumber * cocMm) + f; // hyperfocal in mm
  const s = subjectM * 1000; // subject distance in mm
  const nearMm = (s * (Hmm - f)) / (Hmm + s - 2 * f);
  const farDen = Hmm - s;
  const nearM = nearMm / 1000;
  const farM = farDen <= 0 ? Infinity : (s * (Hmm - f)) / farDen / 1000;
  return {
    nearM,
    farM,
    hyperfocalM: Hmm / 1000,
    dofM: farM === Infinity ? Infinity : farM - nearM,
  };
}

/** Convenience: depth of field straight from a camera setup + subject range. */
export function depthOfFieldFor(
  cam: { lensFocalLength: number; tStop: number; formatId: string },
  subjectM: number,
): DepthOfField {
  return depthOfField(cam.lensFocalLength, cam.tStop, subjectM, sensorFormat(cam.formatId).cocMm);
}

/**
 * Blur-disk diameter, in millimetres on the sensor, for a point at `subjectM`
 * when focus is at `focusM` — the physical basis for the simulated depth-of-
 * field blur on the virtual monitor. Thin-lens circle of confusion:
 *   c = F²·|d − s| / (N·d·(s − F))
 * with F the focal length in metres. Returns 0 at the focus plane and for
 * degenerate inputs. The DOF shader in cameraView.ts recomputes this same
 * formula per pixel; this pure version is the tested source of truth.
 */
export function cocDiameterMm(focalMm: number, fNumber: number, focusM: number, subjectM: number): number {
  const F = focalMm / 1000; // focal length in metres
  if (!(subjectM > 0) || !(focusM > F) || !(fNumber > 0)) return 0;
  return ((F * F * Math.abs(subjectM - focusM)) / (fNumber * subjectM * (focusM - F))) * 1000;
}

// --- Shot framing & coverage telemetry --------------------------------------

export type ShotSize = 'ECU' | 'CU' | 'MCU' | 'MS' | 'MLS' | 'WS' | 'EWS';

export interface ShotFramingTelemetry {
  shotSize: ShotSize;
  shotSizeLabel: string;
  subjectDistanceM: number;
  fieldWidthM: number;
  fieldHeightM: number;
  subjectFrameCoveragePct: number;
}

export function shotSizeDescription(size: ShotSize): string {
  switch (size) {
    case 'ECU':
      return 'Extreme Close-Up (ECU)';
    case 'CU':
      return 'Close-Up (CU)';
    case 'MCU':
      return 'Medium Close-Up (MCU)';
    case 'MS':
      return 'Medium Shot (MS)';
    case 'MLS':
      return 'Medium Long Shot / Cowboy (MLS)';
    case 'WS':
      return 'Wide Shot / Full (WS)';
    case 'EWS':
      return 'Extreme Wide Shot (EWS)';
  }
}

/**
 * Classifies shot scale (ECU through EWS) based on lens optics, sensor gate,
 * distance, and subject height.
 */
export function classifyShotSize(
  focalMm: number,
  aspect: AspectName,
  format: SensorFormat | string,
  subjectDistanceM: number,
  subjectHeightM: number = 1.75,
): ShotFramingTelemetry {
  const dist = Math.max(0.01, subjectDistanceM);
  const height = subjectHeightM > 0 ? subjectHeightM : 1.75;
  const fovH = hFovRad(focalMm, format);
  const fovV = vFovRad(focalMm, aspect, format);

  const fieldWidthM = 2 * dist * Math.tan(fovH / 2);
  const fieldHeightM = 2 * dist * Math.tan(fovV / 2);
  const subjectFrameCoveragePct = fieldHeightM > 0 ? (height / fieldHeightM) * 100 : 0;

  let shotSize: ShotSize = 'WS';
  if (subjectFrameCoveragePct >= 150) shotSize = 'ECU';
  else if (subjectFrameCoveragePct >= 80) shotSize = 'CU';
  else if (subjectFrameCoveragePct >= 50) shotSize = 'MCU';
  else if (subjectFrameCoveragePct >= 35) shotSize = 'MS';
  else if (subjectFrameCoveragePct >= 25) shotSize = 'MLS';
  else if (subjectFrameCoveragePct >= 14) shotSize = 'WS';
  else shotSize = 'EWS';

  return {
    shotSize,
    shotSizeLabel: shotSizeDescription(shotSize),
    subjectDistanceM: dist,
    fieldWidthM,
    fieldHeightM,
    subjectFrameCoveragePct,
  };
}

// --- Pure quaternion & frustum collision mathematics ------------------------

/**
 * Rotates a 3D vector by a quaternion (pure, no Three.js).
 */
export function quatRotateVector(q: Quat, v: Vec3): Vec3 {
  const qx = q.x;
  const qy = q.y;
  const qz = q.z;
  const qw = q.w;

  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * v.z - qz * v.y);
  const ty = 2 * (qz * v.x - qx * v.z);
  const tz = 2 * (qx * v.y - qy * v.x);

  // v' = v + qw * t + cross(q.xyz, t)
  return {
    x: v.x + qw * tx + (qy * tz - qz * ty),
    y: v.y + qw * ty + (qz * tx - qx * tz),
    z: v.z + qw * tz + (qx * ty - qy * tx),
  };
}

/**
 * Rotates a 3D vector by the inverse (conjugate) of a quaternion.
 */
export function quatInverseRotateVector(q: Quat, v: Vec3): Vec3 {
  // Conjugate quaternion has negated xyz
  const qx = -q.x;
  const qy = -q.y;
  const qz = -q.z;
  const qw = q.w;

  const tx = 2 * (qy * v.z - qz * v.y);
  const ty = 2 * (qz * v.x - qx * v.z);
  const tz = 2 * (qx * v.y - qy * v.x);

  return {
    x: v.x + qw * tx + (qy * tz - qz * ty),
    y: v.y + qw * ty + (qz * tx - qx * tz),
    z: v.z + qw * tz + (qx * ty - qy * tx),
  };
}

/**
 * Tests whether a 3D scene point lies inside a camera's field of view frustum.
 * Camera space convention: forward is -Z, right is +X, up is +Y.
 */
export function isPointInFrustum(
  point: Vec3,
  camPos: Vec3,
  camRot: Quat,
  focalMm: number,
  aspect: AspectName,
  format: SensorFormat | string,
  nearM: number = 0.1,
  farM: number = 100.0,
): boolean {
  const relPoint: Vec3 = {
    x: point.x - camPos.x,
    y: point.y - camPos.y,
    z: point.z - camPos.z,
  };

  const localPoint = quatInverseRotateVector(camRot, relPoint);
  // In camera local coordinates, forward direction is -Z
  const forwardDist = -localPoint.z;

  if (forwardDist < nearM || forwardDist > farM) {
    return false;
  }

  const halfFovH = hFovRad(focalMm, format) / 2;
  const halfFovV = vFovRad(focalMm, aspect, format) / 2;

  const maxHalfWidth = forwardDist * Math.tan(halfFovH);
  const maxHalfHeight = forwardDist * Math.tan(halfFovV);

  return Math.abs(localPoint.x) <= maxHalfWidth && Math.abs(localPoint.y) <= maxHalfHeight;
}

export interface CameraFrustumCollision {
  observerCamId: string;
  observerCamName: string;
  observedCamId: string;
  observedCamName: string;
  distanceM: number;
}

/**
 * Identifies pairs of cameras where one camera is visible within the lens view frustum of another.
 */
export function findCamerasInFrustums(
  cameras: CameraSetupData[],
  nearM: number = 0.1,
  farM: number = 50.0,
): CameraFrustumCollision[] {
  const collisions: CameraFrustumCollision[] = [];

  for (const observer of cameras) {
    for (const observed of cameras) {
      if (observer.id === observed.id) continue;

      const inside = isPointInFrustum(
        observed.position,
        observer.position,
        observer.rotation,
        observer.lensFocalLength,
        observer.aspect,
        observer.formatId,
        nearM,
        farM,
      );

      if (inside) {
        const dx = observed.position.x - observer.position.x;
        const dy = observed.position.y - observer.position.y;
        const dz = observed.position.z - observer.position.z;
        const distanceM = Math.sqrt(dx * dx + dy * dy + dz * dz);

        collisions.push({
          observerCamId: observer.id,
          observerCamName: observer.name,
          observedCamId: observed.id,
          observedCamName: observed.name,
          distanceM,
        });
      }
    }
  }

  return collisions;
}
