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

/** Convenient stepping presets. Focal length itself is a free mm value so a
 *  DP can store real primes (18/27/40/65/100) or a zoom setting. */
export const FOCAL_LENGTHS = [16, 24, 35, 50, 85, 135] as const;
/** A focal length in millimeters. Free value; FOCAL_LENGTHS is only for steps. */
export type FocalLength = number;

/**
 * Snaps to the nearest preset, then steps one preset in `dir`. A stored
 * non-preset value (e.g. 27mm) steps to the sensible neighbour (24 or 35).
 */
export function stepFocal(f: number, dir: 1 | -1): number {
  const p = FOCAL_LENGTHS;
  let i = 0;
  for (let k = 1; k < p.length; k++) {
    if (Math.abs(p[k] - f) < Math.abs(p[i] - f)) i = k;
  }
  if (Math.abs(p[i] - f) < 1e-6) {
    i = Math.min(p.length - 1, Math.max(0, i + dir));
  } else if (dir > 0 && p[i] < f) {
    i = Math.min(p.length - 1, i + 1);
  } else if (dir < 0 && p[i] > f) {
    i = Math.max(0, i - 1);
  }
  return p[i];
}

/**
 * A capture format. Horizontal angle of view depends on the physical gate
 * width and the anamorphic squeeze (2x anamorphic on a 50mm frames like a 25mm
 * spherical). cocMm is the circle of confusion used for depth-of-field.
 */
export interface SensorFormat {
  id: string;
  name: string;
  /** Compact label for slates/readouts. */
  short: string;
  /** Horizontal gate width in mm. */
  gateWidthMm: number;
  /** Circle of confusion in mm (DOF). */
  cocMm: number;
  /** Anamorphic squeeze (1 = spherical, 2 = 2x anamorphic). */
  squeeze: number;
}

export const SENSOR_FORMATS: readonly SensorFormat[] = [
  { id: 'super35', name: 'Super 35', short: 'S35', gateWidthMm: 24.89, cocMm: 0.025, squeeze: 1 },
  { id: 'fullframe', name: 'Full Frame / VV', short: 'FF', gateWidthMm: 36.0, cocMm: 0.029, squeeze: 1 },
  { id: 'super16', name: 'Super 16', short: 'S16', gateWidthMm: 12.52, cocMm: 0.015, squeeze: 1 },
  { id: 'anamorphic35', name: 'S35 Anamorphic 2×', short: 'ANA2×', gateWidthMm: 24.89, cocMm: 0.025, squeeze: 2 },
];

export const DEFAULT_FORMAT_ID = 'super35';
export const DEFAULT_TSTOP = 2.8;

export function sensorFormat(id: string): SensorFormat {
  return SENSOR_FORMATS.find((f) => f.id === id) ?? SENSOR_FORMATS[0];
}

/** Tripod-height presets (meters) so a DP can author low/high/overhead shots. */
export interface TripodHeight {
  name: string;
  y: number;
}
export const TRIPOD_HEIGHTS: readonly TripodHeight[] = [
  { name: 'Low hat', y: 0.3 },
  { name: 'Low', y: 0.6 },
  { name: 'Waist', y: 1.1 },
  { name: 'Eye', y: 1.6 },
  { name: 'High', y: 2.4 },
];

export interface CameraSetupData {
  id: string;
  name: string; // 'CAM A', 'CAM B', ...
  /** Lens/eye point, scene space, meters. */
  position: Vec3;
  /** Full orientation (cameras are not floor-locked). */
  rotation: Quat;
  /** Focal length in mm (free value). */
  lensFocalLength: FocalLength;
  aspect: AspectName;
  /** Aperture as a T-stop (≈ f-number for DOF). */
  tStop: number;
  /** SensorFormat id (see SENSOR_FORMATS). */
  formatId: string;
}

/**
 * Compact description of a captured location scan. The heavy geometry blob
 * lives outside the scene JSON (IndexedDB, keyed by `id` — see scanStore.ts);
 * this summary is what localStorage autosave carries.
 */
export interface ScanSummary {
  /** Key of the geometry blob in the scan store. */
  id: string;
  /** Epoch ms at capture. */
  capturedAt: number;
  vertices: number;
  triangles: number;
  /** Axis-aligned bounds in scene space (meters). */
  boundsMin: Vec3;
  boundsMax: Vec3;
}

export interface SceneData {
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  actors: ActorData[];
  cameras: CameraSetupData[];
  /** Playback pace for blocking moves (m/s); drives segment timing. */
  walkSpeed: number;
  /** Captured location scan, if any. Absent/null = no scan. */
  scan?: ScanSummary | null;
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
  return {
    version: 1,
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    actors: [],
    cameras: [],
    walkSpeed: WALK_SPEED_MS,
    scan: null,
  };
}

/** First unused "Actor N" name for a scene. */
export function nextActorName(scene: SceneData): string {
  let n = scene.actors.length + 1;
  while (scene.actors.some((a) => a.name === `Actor ${n}`)) n++;
  return `Actor ${n}`;
}

/** First unused "CAM X" name (letters A–Z, then a numeric suffix). */
export function nextCameraName(scene: SceneData): string {
  let i = 0;
  while (i < 26 && scene.cameras.some((c) => c.name === `CAM ${String.fromCharCode(65 + i)}`)) i++;
  return i < 26 ? `CAM ${String.fromCharCode(65 + i)}` : `CAM ${scene.cameras.length + 1}`;
}

/** Creates an actor with a unique name and the next palette color. */
export function createActor(scene: SceneData, position: Vec3, rotationY: number): ActorData {
  const actor: ActorData = {
    id: uid(),
    name: nextActorName(scene),
    color: ACTOR_PALETTE[scene.actors.length % ACTOR_PALETTE.length],
    position: { ...position },
    rotationY,
    keyframes: [],
    notes: [],
  };
  scene.actors.push(actor);
  return actor;
}

/** Deep-clones an actor into the scene: new id, unique name, offset pose. */
export function duplicateActor(scene: SceneData, id: string): ActorData | null {
  const src = scene.actors.find((a) => a.id === id);
  if (!src) return null;
  const copy: ActorData = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.color = ACTOR_PALETTE[scene.actors.length % ACTOR_PALETTE.length];
  copy.position = { x: src.position.x + 0.6, y: src.position.y, z: src.position.z };
  for (const k of copy.keyframes) k.position.x += 0.6; // shift the whole path
  copy.name = nextActorName(scene);
  scene.actors.push(copy);
  return copy;
}

/** Deep-clones a camera into the scene: new id, unique name, offset position. */
export function duplicateCameraSetup(scene: SceneData, id: string): CameraSetupData | null {
  const src = scene.cameras.find((c) => c.id === id);
  if (!src) return null;
  const copy: CameraSetupData = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.position = { x: src.position.x + 0.4, y: src.position.y, z: src.position.z };
  copy.name = nextCameraName(scene);
  scene.cameras.push(copy);
  return copy;
}

export function createCameraSetup(
  scene: SceneData,
  position: Vec3,
  rotation: Quat,
  lensFocalLength: FocalLength,
  aspect: AspectName,
  tStop: number = DEFAULT_TSTOP,
  formatId: string = DEFAULT_FORMAT_ID,
): CameraSetupData {
  // First unused letter (A, B, C...) so deleting a middle camera never yields
  // a duplicate name on the next add. Past 26 cameras, fall back to a numeric
  // suffix (bounded — never spin looking for a free letter that can't exist).
  let i = 0;
  while (i < 26 && scene.cameras.some((c) => c.name === `CAM ${String.fromCharCode(65 + i)}`)) i++;
  const name = i < 26 ? `CAM ${String.fromCharCode(65 + i)}` : `CAM ${scene.cameras.length + 1}`;
  const cam: CameraSetupData = {
    id: uid(),
    name,
    position: { ...position },
    rotation: { ...rotation },
    lensFocalLength,
    aspect,
    tStop,
    formatId,
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

/** Euclidean distance between two scene-space points (meters). Pure. */
export function vecDistance(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}
function isVec3(v: unknown): v is Vec3 {
  const p = v as Vec3;
  return !!p && typeof p === 'object' && isFiniteNum(p.x) && isFiniteNum(p.y) && isFiniteNum(p.z);
}
function isQuat(v: unknown): v is Quat {
  const q = v as Quat;
  return (
    !!q && typeof q === 'object' && isFiniteNum(q.x) && isFiniteNum(q.y) && isFiniteNum(q.z) && isFiniteNum(q.w)
  );
}
function isActorData(v: unknown): boolean {
  const a = v as ActorData;
  return (
    !!a &&
    typeof a === 'object' &&
    typeof a.id === 'string' &&
    typeof a.name === 'string' &&
    typeof a.color === 'string' &&
    isVec3(a.position) &&
    isFiniteNum(a.rotationY) &&
    Array.isArray(a.keyframes) &&
    a.keyframes.every(
      (k) => isVec3((k as TransformKeyframe)?.position) && isFiniteNum((k as TransformKeyframe)?.rotationY),
    ) &&
    Array.isArray(a.notes)
  );
}
function isCameraData(v: unknown): boolean {
  const c = v as CameraSetupData;
  return (
    !!c &&
    typeof c === 'object' &&
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    isVec3(c.position) &&
    isQuat(c.rotation) &&
    isFiniteNum(c.lensFocalLength) &&
    c.lensFocalLength > 0 &&
    (ASPECT_NAMES as readonly string[]).includes(c.aspect)
  );
}

function isScanSummary(v: unknown): v is ScanSummary {
  const s = v as ScanSummary;
  return (
    !!s &&
    typeof s === 'object' &&
    typeof s.id === 'string' &&
    isFiniteNum(s.capturedAt) &&
    isFiniteNum(s.vertices) &&
    isFiniteNum(s.triangles) &&
    isVec3(s.boundsMin) &&
    isVec3(s.boundsMax)
  );
}

/**
 * Deep shape check used when importing scene JSON from disk — validates every
 * actor and camera so a malformed file can't crash the renderer on load.
 * Note: tStop/formatId are intentionally NOT required (older exports lack
 * them); normalizeScene() fills their defaults.
 */
export function isSceneData(v: unknown): v is SceneData {
  const s = v as SceneData;
  return (
    !!s &&
    typeof s === 'object' &&
    s.version === 1 &&
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    Array.isArray(s.actors) &&
    s.actors.every(isActorData) &&
    Array.isArray(s.cameras) &&
    s.cameras.every(isCameraData) &&
    (s.scan == null || isScanSummary(s.scan))
  );
}

/** Fills defaults for fields absent from older scene JSON. Mutates + returns. */
export function normalizeScene(s: SceneData): SceneData {
  if (!isFiniteNum(s.walkSpeed) || s.walkSpeed <= 0) s.walkSpeed = WALK_SPEED_MS;
  if (s.scan === undefined) s.scan = null;
  for (const c of s.cameras) {
    if (!isFiniteNum(c.lensFocalLength) || c.lensFocalLength <= 0) c.lensFocalLength = 35;
    if (!isFiniteNum(c.tStop) || c.tStop <= 0) c.tStop = DEFAULT_TSTOP;
    if (typeof c.formatId !== 'string' || !SENSOR_FORMATS.some((f) => f.id === c.formatId)) {
      c.formatId = DEFAULT_FORMAT_ID;
    }
  }
  return s;
}
