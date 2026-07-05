// ---------------------------------------------------------------------------
// Lens math — PURE, portable (Unity: a static LensMath class).
//
// Sensor model: Super 35, 24.89 mm wide gate. We hold the horizontal width
// constant across aspect ratios (the way a director's viewfinder behaves):
// the horizontal FOV depends only on focal length; vertical extent follows
// from the chosen aspect ratio.
// ---------------------------------------------------------------------------

import { aspectValue, type AspectName, type FocalLength } from './model.ts';

export const SUPER35_WIDTH_MM = 24.89;

/** Horizontal field of view in radians for a focal length on Super 35. */
export function hFovRad(focal: FocalLength): number {
  return 2 * Math.atan(SUPER35_WIDTH_MM / (2 * focal));
}

/**
 * Vertical FOV in degrees for a focal length and frame aspect — this is what
 * a three.js PerspectiveCamera (or Unity Camera.fieldOfView) wants.
 */
export function vFovDeg(focal: FocalLength, aspect: AspectName): number {
  const sensorHeight = SUPER35_WIDTH_MM / aspectValue(aspect);
  return (2 * Math.atan(sensorHeight / (2 * focal)) * 180) / Math.PI;
}

/**
 * Width/height in meters of the frame rectangle at `distance` meters from
 * the eye. Used for the eyes-as-camera frame-line overlay.
 */
export function frameSizeAtDistance(
  focal: FocalLength,
  aspect: AspectName,
  distance: number,
): { width: number; height: number } {
  const width = 2 * distance * Math.tan(hFovRad(focal) / 2);
  return { width, height: width / aspectValue(aspect) };
}
