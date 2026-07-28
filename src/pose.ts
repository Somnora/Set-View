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
  | 'seated_arms_thighs'
  | 'seated_leaning_table'
  | 'standing_point'
  | 'standing_reach'
  | 'standing_hands_hips'
  | 'standing_crossed_arms'
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
  /** Spine rotation.x; tilts torso forward/back relative to hips. */
  spine: number;
  /** Shoulder pivot rotation.x; + swings the arms forward. Default fallback. */
  shoulder: number;
  /** Right shoulder pivot rotation.x. */
  shoulderR: number;
  /** Left shoulder pivot rotation.x. */
  shoulderL: number;
  /** Right elbow pivot rotation.x; bends lower arm. */
  elbowR: number;
  /** Left elbow pivot rotation.x; bends lower arm. */
  elbowL: number;
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
    spine: 0,
    shoulder: 0,
    shoulderR: 0,
    shoulderL: 0,
    elbowR: 0,
    elbowL: 0,
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
    spine: 0,
    shoulder: 0.05,
    shoulderR: 0.05,
    shoulderL: 0.05,
    elbowR: 0,
    elbowL: 0,
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
    spine: 0,
    shoulder: 0.05,
    shoulderR: 0.05,
    shoulderL: 0.05,
    elbowR: 0,
    elbowL: 0,
    legSplay: 0,
  },
  {
    id: 'standing_point',
    name: 'Standing (pointing)',
    short: 'Point',
    bodyRot: { x: 0, y: 0, z: 0 },
    bodyLift: 0,
    hip: 0,
    knee: 0,
    spine: 0,
    shoulder: 0.75,
    shoulderR: 1.5,
    shoulderL: 0,
    elbowR: 0.1,
    elbowL: 0,
    legSplay: 0,
  },
  {
    id: 'standing_reach',
    name: 'Standing (reaching)',
    short: 'Reach',
    bodyRot: { x: 0, y: 0, z: 0 },
    bodyLift: 0,
    hip: 0.1,
    knee: -0.1,
    spine: 0.15,
    shoulder: 1.1,
    shoulderR: 2.2,
    shoulderL: 0.1,
    elbowR: 0.25,
    elbowL: 0.1,
    legSplay: 0.05,
  },
  {
    id: 'standing_hands_hips',
    name: 'Standing (hands on hips)',
    short: 'Akimbo',
    bodyRot: { x: 0, y: 0, z: 0 },
    bodyLift: 0,
    hip: 0,
    knee: 0,
    spine: -0.05,
    shoulder: -0.3,
    shoulderR: -0.3,
    shoulderL: -0.3,
    elbowR: 1.8,
    elbowL: 1.8,
    legSplay: 0.12,
  },
  {
    id: 'standing_crossed_arms',
    name: 'Standing (crossed arms)',
    short: 'Crossed',
    bodyRot: { x: 0, y: 0, z: 0 },
    bodyLift: 0,
    hip: 0,
    knee: 0,
    spine: 0,
    shoulder: 0.7,
    shoulderR: 0.7,
    shoulderL: 0.7,
    elbowR: 2.0,
    elbowL: 2.0,
    legSplay: 0.05,
  },
  {
    id: 'seated-chair',
    name: 'Seated (chair)',
    short: 'Sit',
    bodyRot: { x: 0, y: 0, z: 0 },
    bodyLift: -0.42,
    hip: 1.45,
    knee: -1.5,
    spine: 0,
    shoulder: 0.28,
    shoulderR: 0.28,
    shoulderL: 0.28,
    elbowR: 0,
    elbowL: 0,
    legSplay: 0.05,
  },
  {
    id: 'seated_arms_thighs',
    name: 'Seated (arms on thighs)',
    short: 'Sit Thighs',
    bodyRot: { x: 0, y: 0, z: 0 },
    bodyLift: -0.42,
    hip: 1.45,
    knee: -1.5,
    spine: 0.1,
    shoulder: 0.4,
    shoulderR: 0.4,
    shoulderL: 0.4,
    elbowR: 1.2,
    elbowL: 1.2,
    legSplay: 0.05,
  },
  {
    id: 'seated_leaning_table',
    name: 'Seated (leaning forward)',
    short: 'Sit Lean',
    bodyRot: { x: 0, y: 0, z: 0 },
    bodyLift: -0.42,
    hip: 1.5,
    knee: -1.5,
    spine: 0.4,
    shoulder: 0.6,
    shoulderR: 0.6,
    shoulderL: 0.6,
    elbowR: 1.6,
    elbowL: 1.6,
    legSplay: 0.08,
  },
  {
    id: 'seated-lounge',
    name: 'Seated (lounging)',
    short: 'Lounge',
    bodyRot: { x: -0.35, y: 0, z: 0 },
    bodyLift: -0.5,
    hip: 1.0,
    knee: -0.55,
    spine: 0,
    shoulder: 0.2,
    shoulderR: 0.2,
    shoulderL: 0.2,
    elbowR: 0,
    elbowL: 0,
    legSplay: 0.08,
  },
  {
    id: 'seated-cross',
    name: 'Seated (cross-legged)',
    short: 'Cross',
    bodyRot: { x: 0, y: 0, z: 0 },
    bodyLift: -0.62,
    hip: 1.35,
    knee: -2.2,
    spine: 0,
    shoulder: 0.2,
    shoulderR: 0.2,
    shoulderL: 0.2,
    elbowR: 0,
    elbowL: 0,
    legSplay: 0.5,
  },
  {
    id: 'lying-up',
    name: 'Lying flat (face up)',
    short: 'Lie up',
    bodyRot: { x: -HALF_PI, y: 0, z: 0 },
    bodyLift: 0,
    hip: 0,
    knee: 0,
    spine: 0,
    shoulder: 0.12,
    shoulderR: 0.12,
    shoulderL: 0.12,
    elbowR: 0,
    elbowL: 0,
    legSplay: 0.05,
  },
  {
    id: 'lying-down',
    name: 'Lying flat (face down)',
    short: 'Lie dn',
    bodyRot: { x: HALF_PI, y: 0, z: 0 },
    bodyLift: 0,
    hip: 0,
    knee: 0,
    spine: 0,
    shoulder: 0.12,
    shoulderR: 0.12,
    shoulderL: 0.12,
    elbowR: 0,
    elbowL: 0,
    legSplay: 0.05,
  },
  {
    id: 'lying-left',
    name: 'Lying on side (facing left)',
    short: 'Side L',
    bodyRot: { x: -HALF_PI, y: 0, z: HALF_PI },
    bodyLift: 0,
    hip: 0.15,
    knee: -0.25,
    spine: 0,
    shoulder: 0.15,
    shoulderR: 0.15,
    shoulderL: 0.15,
    elbowR: 0,
    elbowL: 0,
    legSplay: 0,
  },
  {
    id: 'lying-right',
    name: 'Lying on side (facing right)',
    short: 'Side R',
    bodyRot: { x: -HALF_PI, y: 0, z: -HALF_PI },
    bodyLift: 0,
    hip: 0.15,
    knee: -0.25,
    spine: 0,
    shoulder: 0.15,
    shoulderR: 0.15,
    shoulderL: 0.15,
    elbowR: 0,
    elbowL: 0,
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
