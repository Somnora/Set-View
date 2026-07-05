// ---------------------------------------------------------------------------
// SetView scene data model — PURE DATA, no three.js, no DOM.
// This file (with lens.ts and timeline.ts) is the portable domain core that
// maps 1:1 onto plain C# classes for the planned Unity port.
//
// Conventions:
//  - All positions are meters, in "scene space": the world space of the AR
//    reference space (local-floor) at authoring time. y = 0 is the floor.
//  - rotationY is a heading in radians around +Y; 0 faces +Z.
// ---------------------------------------------------------------------------

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

/** One stored blocking mark for an actor. */
export interface TransformKeyframe {
  /** Feet point on the floor, scene space, meters. */
  position: Vec3;
  /** Facing at this mark, radians around +Y. */
  rotationY: number;
}

export type NoteKind = 'dialogue' | 'action';

export interface ActorNote {
  id: string;
  kind: NoteKind;
  text: string;
  createdAt: number;
}

export interface ActorData {
  id: string;
  name: string;
  /** '#rrggbb' */
  color: string;
  /** Current (rest) position — feet on floor. */
  position: Vec3;
  rotationY: number;
  keyframes: TransformKeyframe[];
  notes: ActorNote[];
}

export const MAX_KEYFRAMES = 5;

/** Default playback speed used to derive segment durations. */
export const WALK_SPEED_MS = 1.4;

export const ASPECT_NAMES = ['2.39:1', '16:9', '4:3'] as const;
export type AspectName = (typeof ASPECT_NAMES)[number];

export function aspectValue(a: AspectName): number {
  switch (a) {
    case '2.39:1':
      return 2.39;
    case '16:9':
      return 16 / 9;
    case '4:3':
      return 4 / 3;
  }
}

export const FOCAL_LENGTHS = [16, 24, 35, 50, 85, 135] as const;
export type FocalLength = (typeof FOCAL_LENGTHS)[number];

export function stepFocal(f: FocalLength, dir: 1 | -1): FocalLength {
  const i = FOCAL_LENGTHS.indexOf(f);
  const next = Math.min(FOCAL_LENGTHS.length - 1, Math.max(0, i + dir));
  return FOCAL_LENGTHS[next];
}

export interface CameraSetupData {
  id: string;
  name: string; // 'CAM A', 'CAM B', ...
  /** Lens/eye point, scene space, meters. */
  position: Vec3;
  /** Full orientation (cameras are not floor-locked). */
  rotation: Quat;
  lensFocalLength: FocalLength;
  aspect: AspectName;
}

export interface SceneData {
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  actors: ActorData[];
  cameras: CameraSetupData[];
}

// --- factories --------------------------------------------------------------

export const ACTOR_PALETTE = [
  '#e5484d', // red
  '#3e9bf0', // blue
  '#46a758', // green
  '#f5a524', // amber
  '#8e4ec6', // purple
  '#12a594', // teal
  '#e93d82', // pink
  '#f76b15', // orange
  '#7ce2fe', // sky
  '#bdee63', // lime
] as const;

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createScene(name: string): SceneData {
  const now = Date.now();
  return { version: 1, id: uid(), name, createdAt: now, updatedAt: now, actors: [], cameras: [] };
}

/** Creates an actor with a unique name and the next palette color. */
export function createActor(scene: SceneData, position: Vec3, rotationY: number): ActorData {
  let n = scene.actors.length + 1;
  while (scene.actors.some((a) => a.name === `Actor ${n}`)) n++;
  const actor: ActorData = {
    id: uid(),
    name: `Actor ${n}`,
    color: ACTOR_PALETTE[scene.actors.length % ACTOR_PALETTE.length],
    position: { ...position },
    rotationY,
    keyframes: [],
    notes: [],
  };
  scene.actors.push(actor);
  return actor;
}

export function createCameraSetup(
  scene: SceneData,
  position: Vec3,
  rotation: Quat,
  lensFocalLength: FocalLength,
  aspect: AspectName,
): CameraSetupData {
  const letter = String.fromCharCode(65 + (scene.cameras.length % 26)); // A, B, C...
  const cam: CameraSetupData = {
    id: uid(),
    name: `CAM ${letter}`,
    position: { ...position },
    rotation: { ...rotation },
    lensFocalLength,
    aspect,
  };
  scene.cameras.push(cam);
  return cam;
}

export function addNote(actor: ActorData, kind: NoteKind, text: string): ActorNote {
  const note: ActorNote = { id: uid(), kind, text, createdAt: Date.now() };
  actor.notes.push(note);
  return note;
}

/** Returns false (and does nothing) when the actor is at MAX_KEYFRAMES. */
export function addKeyframe(actor: ActorData, position: Vec3, rotationY: number): boolean {
  if (actor.keyframes.length >= MAX_KEYFRAMES) return false;
  actor.keyframes.push({ position: { ...position }, rotationY });
  return true;
}

/** Basic shape check used when importing scene JSON from disk. */
export function isSceneData(v: unknown): v is SceneData {
  const s = v as SceneData;
  return (
    !!s &&
    typeof s === 'object' &&
    s.version === 1 &&
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    Array.isArray(s.actors) &&
    Array.isArray(s.cameras)
  );
}
