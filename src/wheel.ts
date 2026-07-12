// ---------------------------------------------------------------------------
// Palm tool wheel — PURE, renderer-free (the tested surface).
//
// The wheel is the app's top-level menu: look at your left palm and a ring of
// tools appears in it. Tap a sector with a fingertip (or point + trigger with
// a controller) to press. Some sectors open a SUB-WHEEL in place — the hub
// turns into Back. Two modes split the two jobs on a set:
//   block — plan the shot: actors, cameras, marks, lenses.
//   dress — adjust the physical space: scan the room, move scanned furniture.
// wheelView.ts renders this; main.ts owns the current path and routes presses.
// ---------------------------------------------------------------------------

export type InteractionMode = 'block' | 'dress';

/**
 * Placement arming. 'none' is the DEFAULT: a bare trigger/pinch must never
 * create content — on hand tracking every stray thumb-index touch reads as a
 * pinch, and third-QA showed each palm tap spawning an actor. Placing is an
 * armed tool: pick it (wheel Place sector / X button), then the pinch places.
 */
export type PlaceArm = 'none' | 'actor' | 'camera';

/** The Place tool cycle (wheel sector and the X button step through it). */
export function nextPlaceMode(mode: PlaceArm): PlaceArm {
  return mode === 'none' ? 'actor' : mode === 'actor' ? 'camera' : 'none';
}

/** Menu levels: the root ring, or one of the sub-wheels. */
export type WheelPath = 'root' | 'lens' | 'marks' | 'capture' | 'edit';

export interface WheelSector {
  id: string;
  /** Short label drawn in the sector (line-broken on \n). */
  label: string;
  /** Opens a sub-wheel instead of performing an action. */
  submenu?: WheelPath;
}

export interface WheelMenu {
  /** Hub button: mode toggle at root, Back inside a sub-wheel. */
  hub: { id: string; label: string; sub: string };
  sectors: WheelSector[];
}

export interface WheelContext {
  mode: InteractionMode;
  placeMode: PlaceArm;
  viewMode: 'full' | 'mini' | 'camera';
  playing: boolean;
  recording: boolean;
  /** A location scan exists in the scene (enables Room cycling). */
  hasScan: boolean;
  locationMode: 'hidden' | 'ghost' | 'solid';
  /** Active-camera lens state, for value labels in the Lens sub-wheel. */
  lensFocal: number;
  tStop: number;
  formatShort: string;
  aspect: string;
  eyesMode: boolean;
  dofOn: boolean;
  /** Playback pace (m/s) for the Marks sub-wheel readout. */
  pace: number;
}

export const MAX_SECTORS = 8;

/** The wheel for a given state + menu level. Sector 0 sits at 12 o'clock. */
export function wheelMenu(ctx: WheelContext, path: WheelPath): WheelMenu {
  if (path !== 'root') {
    return { hub: { id: 'wheel-back', label: '◂ Back', sub: 'to tools' }, sectors: SUBMENUS[path](ctx) };
  }
  const viewLabel = { full: 'Full', mini: 'Mini', camera: 'Cam' }[ctx.viewMode];
  const hub = {
    id: 'wheel-mode',
    label: ctx.mode.toUpperCase(),
    sub: ctx.mode === 'block' ? 'tap: dress set' : 'tap: block shot',
  };
  if (ctx.mode === 'block') {
    return {
      hub,
      sectors: [
        {
          id: 'wheel-place',
          label:
            ctx.placeMode === 'none' ? 'Place:\nOff' : ctx.placeMode === 'actor' ? 'Place:\nActor' : 'Place:\nCam',
        },
        { id: 'sub-marks', label: 'Marks ▸', submenu: 'marks' },
        { id: 'sub-lens', label: 'Lens ▸', submenu: 'lens' },
        { id: 'wheel-view', label: `View:\n${viewLabel}` },
        { id: 'sub-capture', label: 'Camera ▸', submenu: 'capture' },
        { id: 'sub-edit', label: 'Edit ▸', submenu: 'edit' },
        { id: 'wheel-more', label: 'More' },
      ],
    };
  }
  return {
    hub,
    sectors: [
      { id: 'scan', label: 'Scan\nRoom' },
      {
        id: 'location',
        label: ctx.hasScan
          ? `Room:\n${ctx.locationMode[0].toUpperCase()}${ctx.locationMode.slice(1)}`
          : 'Room:\n(scan first)',
      },
      { id: 'wheel-view', label: `View:\n${viewLabel}` },
      { id: 'sub-capture', label: 'Camera ▸', submenu: 'capture' },
      { id: 'sub-edit', label: 'Edit ▸', submenu: 'edit' },
      { id: 'wheel-more', label: 'More' },
    ],
  };
}

const SUBMENUS: Record<Exclude<WheelPath, 'root'>, (ctx: WheelContext) => WheelSector[]> = {
  lens: (ctx) => [
    { id: 'focal-down', label: 'Focal −' },
    { id: 'focal-up', label: 'Focal +' },
    { id: 'tstop', label: `T-stop\nT${ctx.tStop}` },
    { id: 'format', label: `Format\n${ctx.formatShort}` },
    { id: 'aspect', label: `Aspect\n${ctx.aspect}` },
    { id: 'framelines', label: ctx.eyesMode ? 'Frame\nLines ✓' : 'Frame\nLines' },
    { id: 'dof', label: ctx.dofOn ? 'DOF ✓' : 'DOF' },
  ],
  marks: (ctx) => [
    { id: 'mark', label: 'Mark\nhere' },
    { id: 'play', label: ctx.playing ? 'Pause' : 'Play' },
    { id: 'stop', label: 'Stop' },
    { id: 'clearkf', label: 'Clear\nmarks' },
    { id: 'pace-slow', label: 'Pace −' },
    { id: 'pace-fast', label: `Pace +\n${ctx.pace.toFixed(1)} m/s` },
  ],
  capture: (ctx) => [
    { id: 'capture', label: 'Photo' },
    { id: 'record', label: ctx.recording ? 'Stop\nRec ⏺' : 'Rec' },
    { id: 'exit', label: 'Exit AR' },
  ],
  edit: () => [
    { id: 'undo', label: 'Undo' },
    { id: 'redo', label: 'Redo' },
    { id: 'dup', label: 'Duplicate' },
    { id: 'delete', label: 'Delete' },
    { id: 'stance', label: 'Stance ▸' },
    { id: 'notes', label: 'Notes' },
  ],
};

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

// --- fingertip touch ------------------------------------------------------------

/**
 * Fingertip press detection against the wheel plane, in WHEEL-LOCAL meters
 * (+z toward the viewer, disc of `radius` around the origin). A press fires
 * on the DOWN edge: the tip must first hover in front of the plane, then
 * push to (or through) it. Pulling back past the hover band re-arms.
 *
 * Tuned for occluded tracking (the tapping finger hides behind the palm, so
 * joint positions jitter): the press plane sits proud of the disc, the re-arm
 * lift is short, and arming works anywhere NEAR the disc — a natural tap
 * often approaches from the side of the ring, not head-on through it.
 */
export const TOUCH_PRESS_Z = 0.012;
export const TOUCH_ARM_Z = 0.025;
export const TOUCH_MAX_BEHIND_Z = -0.08;
/** Tips beyond this multiple of the disc radius don't touch the state. */
export const TOUCH_NEAR_FACTOR = 2;

export interface TouchState {
  armed: boolean;
}

export interface TouchSample {
  /** uv on the wheel (0..1, canvas orientation) or null when off the disc. */
  u: number;
  v: number;
  pressed: boolean;
}

/**
 * Feed one fingertip position (wheel-local). Returns the uv + whether a press
 * fired this frame; mutates `state` for the edge detection.
 */
export function touchWheel(
  state: TouchState,
  x: number,
  y: number,
  z: number,
  radius: number,
): TouchSample | null {
  const r = Math.sqrt(x * x + y * y);
  if (r > radius * TOUCH_NEAR_FACTOR || z < TOUCH_MAX_BEHIND_Z || z > 0.25) {
    // Far from the disc in any direction: keep the armed state, nothing to
    // report (a tap can start slightly off-plane).
    return null;
  }
  // Arm anywhere near the disc, including just off its rim — occluded finger
  // tracking skips frames, and side approaches never pass through the front.
  if (z >= TOUCH_ARM_Z) state.armed = true;
  if (r > radius) return null; // near (state updated) but not on the disc
  const u = x / (radius * 2) + 0.5;
  const v = 0.5 - y / (radius * 2);
  let pressed = false;
  if (state.armed && z <= TOUCH_PRESS_Z) {
    pressed = true;
    state.armed = false;
  }
  return { u, v, pressed };
}

// (The wheel used to be gaze-summoned — look at your palm to reveal it. Three
// QA sessions showed that left users with no way into the menu at all, so it
// is gone: the wheel now always rides the left hand and a hard Y button parks
// it in front of the face. See main.ts loop + toggleMenuInFront.)
