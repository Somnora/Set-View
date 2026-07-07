// ---------------------------------------------------------------------------
// Actor stance / pose targets — PURE, renderer-free (Unity: a static Pose
// table + a struct). This module holds only the joint-target NUMBERS for each
// stance; actors.ts maps them onto the three.js rig. Keeping the numbers here
// makes them unit-testable and portable, and keeps the geometry in one place.
//
// Rig convention (see actors.ts buildObject): feet at the origin (y=0), body a
// group of pivots — hip -> thigh -> knee -> shin, shoulder -> arm, plus head.
// A pose is expressed as:
//   - a whole-body Euler (bodyRot) + vertical lift, both about the feet origin
//     (so lean tilts about the feet and lying swings the body down flat), and
//   - per-joint rotations (hip/knee/shoulder), mirrored L/R, plus an optional
//     outward leg splay for cross-legged.
//
// Angle signs follow three.js: a positive rotation.x on a downward-hanging
// pivot swings it toward -Z (forward). Values here are a considered first pass;
// like WRIST_POS and FRAME_LINE_DIST they are visually tuned on-headset (the
// tests assert structure/finiteness, not aesthetics).
// ---------------------------------------------------------------------------

export type StanceId =
  | 'standing'
  | 'lean-left'
  | 'lean-right'
  | 'seated-chair'
  | 'seated-lounge'
  | 'seated-cross'
  | 'lying-up'
  | 'lying-down'
  | 'lying-left'
  | 'lying-right';

export interface PoseTargets {
  id: StanceId;
  /** Full label (prep-page dropdown, readouts). */
  name: string;
  /** Compact label (wrist button, status line). */
  short: string;
  /** Body-group Euler about the feet origin, radians (pitch X, yaw Y, roll Z). */
  bodyRot: { x: number; y: number; z: number };
  /** Vertical offset of the body group, meters (negative lowers the hips). */
  bodyLift: number;
  /** Hip pivot rotation.x; + swings the thigh forward (-Z). Mirrored L/R. */
  hip: number;
  /** Knee pivot rotation.x; bends the shin relative to the thigh. */
  knee: number;
  /** Shoulder pivot rotation.x; + swings the arms forward. Mirrored L/R. */
  shoulder: number;
  /** Outward leg splay (leg pivot rotation.z), mirrored L/R. 0 for most poses. */
  legSplay: number;
}

const HALF_PI = Math.PI / 2;

/**
 * Every stance, in cycle order. The order is the wrist-button cycle order:
 * upright poses, then seated, then lying — a natural progression.
 */
export const STANCES: readonly PoseTargets[] = [
  {
    id: 'standing',
    name: 'Standing',
    short: 'Stand',
    bodyRot: { x: 0, y: 0, z: 0 },
    bodyLift: 0,
    hip: 0,
    knee: 0,
    shoulder: 0,
    legSplay: 0,
  },
  {
    id: 'lean-left',
    name: 'Leaning left',
    short: 'Lean L',
    bodyRot: { x: 0, y: 0, z: 0.2 },
    bodyLift: 0,
    hip: 0,
    knee: 0,
    shoulder: 0.05,
    legSplay: 0,
  },
  {
    id: 'lean-right',
    name: 'Leaning right',
    short: 'Lean R',
    bodyRot: { x: 0, y: 0, z: -0.2 },
    bodyLift: 0,
    hip: 0,
    knee: 0,
    shoulder: 0.05,
    legSplay: 0,
  },
  {
    id: 'seated-chair',
    name: 'Seated (chair)',
    short: 'Sit',
    bodyRot: { x: 0, y: 0, z: 0 },
    bodyLift: -0.42,
    hip: 1.45, // thighs ~horizontal forward
    knee: -1.5, // shins ~vertical down
    shoulder: 0.28,
    legSplay: 0.05,
  },
  {
    id: 'seated-lounge',
    name: 'Seated (lounging)',
    short: 'Lounge',
    bodyRot: { x: -0.35, y: 0, z: 0 }, // torso reclined back
    bodyLift: -0.5,
    hip: 1.0, // legs extended forward-ish
    knee: -0.55,
    shoulder: 0.2,
    legSplay: 0.08,
  },
  {
    id: 'seated-cross',
    name: 'Seated (cross-legged)',
    short: 'Cross',
    bodyRot: { x: 0, y: 0, z: 0 },
    bodyLift: -0.62, // hips low, near the floor
    hip: 1.35,
    knee: -2.2, // shins tucked under
    shoulder: 0.2,
    legSplay: 0.5, // knees out to the sides
  },
  {
    id: 'lying-up',
    name: 'Lying flat (face up)',
    short: 'Lie up',
    bodyRot: { x: -HALF_PI, y: 0, z: 0 }, // swing flat, on the back
    bodyLift: 0,
    hip: 0,
    knee: 0,
    shoulder: 0.12,
    legSplay: 0.05,
  },
  {
    id: 'lying-down',
    name: 'Lying flat (face down)',
    short: 'Lie dn',
    bodyRot: { x: HALF_PI, y: 0, z: 0 }, // swing flat, on the front
    bodyLift: 0,
    hip: 0,
    knee: 0,
    shoulder: 0.12,
    legSplay: 0.05,
  },
  {
    id: 'lying-left',
    name: 'Lying on side (facing left)',
    short: 'Side L',
    bodyRot: { x: -HALF_PI, y: 0, z: HALF_PI }, // flat, rolled onto the left side
    bodyLift: 0,
    hip: 0.15, // slight tuck reads as reclined, not rigid
    knee: -0.25,
    shoulder: 0.15,
    legSplay: 0,
  },
  {
    id: 'lying-right',
    name: 'Lying on side (facing right)',
    short: 'Side R',
    bodyRot: { x: -HALF_PI, y: 0, z: -HALF_PI }, // flat, rolled onto the right side
    bodyLift: 0,
    hip: 0.15,
    knee: -0.25,
    shoulder: 0.15,
    legSplay: 0,
  },
];

export const DEFAULT_STANCE: StanceId = 'standing';

/** True when `id` is a known stance. */
export function isStanceId(id: unknown): id is StanceId {
  return typeof id === 'string' && STANCES.some((p) => p.id === id);
}

/** Pose targets for a stance id, falling back to standing for anything unknown. */
export function poseFor(id: string | undefined): PoseTargets {
  return STANCES.find((p) => p.id === id) ?? STANCES[0];
}

/**
 * The next (dir +1) or previous (dir -1) stance in cycle order, wrapping.
 * Used by the wrist "Stance" button.
 */
export function cycleStance(id: string | undefined, dir: 1 | -1 = 1): StanceId {
  const i = STANCES.findIndex((p) => p.id === id);
  const base = i < 0 ? 0 : i;
  const n = STANCES.length;
  return STANCES[(base + dir + n) % n].id;
}
