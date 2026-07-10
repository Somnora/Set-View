// ---------------------------------------------------------------------------
// Hand tool wheel — PURE, renderer-free (the tested surface).
//
// The wheel is the app's top-level menu: look at your left hand and a ring of
// the tools for the CURRENT working mode fans around it. Two modes split the
// two jobs on a set:
//   block — plan the shot: place/move actors and cameras, marks, lenses.
//   dress — adjust the physical space: scan the room, move scanned furniture.
// The hub shows the mode; the ring holds at most 8 sectors ordered roughly
// start-to-finish through a session. "More" opens the detailed wrist panel.
// wheelView.ts renders this; main.ts routes presses and gaze-gating.
// ---------------------------------------------------------------------------

export type InteractionMode = 'block' | 'dress';

export interface WheelSector {
  id: string;
  /** Short label drawn in the sector (line-broken on \n). */
  label: string;
}

export interface WheelContext {
  mode: InteractionMode;
  placeMode: 'actor' | 'camera';
  viewMode: 'full' | 'mini' | 'camera';
  playing: boolean;
  recording: boolean;
  /** A location scan exists in the scene (enables Loc cycling). */
  hasScan: boolean;
  locationMode: 'hidden' | 'ghost' | 'solid';
}

export const MAX_SECTORS = 8;

/** Sectors for the current state, clockwise from the top. Max 8. */
export function wheelSectors(ctx: WheelContext): WheelSector[] {
  const viewLabel = { full: 'Full', mini: 'Mini', camera: 'Cam' }[ctx.viewMode];
  const common: WheelSector[] = [
    { id: 'wheel-mode', label: ctx.mode === 'block' ? 'Dress\nthe set' : 'Block\nthe shot' },
  ];
  const tail: WheelSector[] = [
    { id: 'wheel-view', label: `View:\n${viewLabel}` },
    { id: 'wheel-photo', label: 'Photo' },
    { id: 'wheel-rec', label: ctx.recording ? 'Stop\nRec' : 'Rec' },
    { id: 'wheel-more', label: 'More' },
  ];
  if (ctx.mode === 'block') {
    return [
      ...common,
      { id: 'wheel-place', label: ctx.placeMode === 'actor' ? 'Place:\nActor' : 'Place:\nCam' },
      { id: 'wheel-play', label: ctx.playing ? 'Pause' : 'Play' },
      { id: 'wheel-undo', label: 'Undo' },
      ...tail,
    ];
  }
  return [
    ...common,
    { id: 'wheel-scan', label: 'Scan\nRoom' },
    {
      id: 'wheel-loc',
      label: ctx.hasScan
        ? `Room:\n${ctx.locationMode[0].toUpperCase()}${ctx.locationMode.slice(1)}`
        : 'Room:\n(scan first)',
    },
    { id: 'wheel-undo', label: 'Undo' },
    ...tail,
  ];
}

// --- ring geometry -----------------------------------------------------------

/** Radii as fractions of the canvas half-size (uv distance from center). */
export const HUB_R = 0.3;
export const RING_R = 0.98;

/**
 * Which sector (index into the sectors array) a point hits, for a square
 * canvas with uv in [0,1]². The hub returns 'hub'; outside the ring, null.
 * Sector 0 is centered at 12 o'clock; order proceeds clockwise.
 */
export function wheelHit(u: number, v: number, sectorCount: number): number | 'hub' | null {
  const dx = u * 2 - 1;
  const dy = 1 - v * 2; // canvas v grows downward; make +y up
  const r = Math.sqrt(dx * dx + dy * dy);
  if (r <= HUB_R) return 'hub';
  if (r > RING_R || sectorCount <= 0) return null;
  // Angle from 12 o'clock, clockwise, in [0, 2π).
  let a = Math.atan2(dx, dy);
  if (a < 0) a += Math.PI * 2;
  const step = (Math.PI * 2) / sectorCount;
  return Math.floor(((a + step / 2) % (Math.PI * 2)) / step) % sectorCount;
}

/** Center angle (radians from 12 o'clock, clockwise) of sector i of n. */
export function sectorAngle(i: number, n: number): number {
  return (i * Math.PI * 2) / n;
}

// --- gaze summon ---------------------------------------------------------------

/**
 * Show/hide thresholds for summoning the wheel by looking at the hand, on the
 * dot product of head-forward with the direction to the wrist. Hysteresis:
 * engage needs a deliberate look; disengage only when clearly looking away,
 * so the wheel doesn't flicker at the boundary.
 */
export const GAZE_SHOW_DOT = 0.86;
export const GAZE_HIDE_DOT = 0.72;
/** Beyond arm's reach it's not a "look at your hand" — never summon. */
export const GAZE_MAX_DISTANCE_M = 1.2;

export interface GazeInput {
  /** Normalized head forward. */
  fwd: { x: number; y: number; z: number };
  /** Wrist position minus head position (unnormalized). */
  toWrist: { x: number; y: number; z: number };
  /** Whether the wheel is currently shown (selects the hysteresis edge). */
  shown: boolean;
}

/** Whether the wheel should be shown this frame. */
export function gazeEngaged({ fwd, toWrist, shown }: GazeInput): boolean {
  const dist = Math.sqrt(toWrist.x ** 2 + toWrist.y ** 2 + toWrist.z ** 2);
  if (dist > GAZE_MAX_DISTANCE_M || dist < 1e-6) return false;
  const dot = (fwd.x * toWrist.x + fwd.y * toWrist.y + fwd.z * toWrist.z) / dist;
  return dot >= (shown ? GAZE_HIDE_DOT : GAZE_SHOW_DOT);
}
