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

import { aspectValue, sensorFormat, type AspectName, type SensorFormat } from './model.ts';

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
