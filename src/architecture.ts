// ---------------------------------------------------------------------------
// Pure Domain Engine: Architectural Modeling (Walls, Windows, Doors, Materials)
//
// ZERO Three.js and ZERO DOM dependencies: pure data and deterministic math.
// Manages:
//   - Architectural set structures and wall geometry data models
//   - Wall finishes, PBR wallpaper presets, and procedural surface types
//   - Window and door opening definitions, alignments, and spatial cutouts
//   - Pure vector math for wall polygons, bounding boxes, and frame openings
//   - Entity normalization, type guards, and factory helpers
// ---------------------------------------------------------------------------

import type { Vec3 } from './model.ts';

export type WallFinishType =
  | 'painted_drywall'
  | 'victorian_damask'
  | 'midcentury_geometric'
  | 'exposed_brick'
  | 'wood_paneling'
  | 'industrial_concrete'
  | 'acoustic_foam'
  | 'custom_color';

export type WindowType =
  | 'casement'
  | 'sash'
  | 'picture'
  | 'floor_to_ceiling'
  | 'stained_glass'
  | 'arched';

export type DoorType =
  | 'single_swing'
  | 'double_french'
  | 'sliding_barn'
  | 'studio_acoustic'
  | 'pocket';

export interface WindowData {
  id: string;
  name: string;
  type: WindowType;
  /** Offset in meters from the wall start point along the wall axis. */
  offsetAlongWallM: number;
  /** Sill elevation above the floor in meters. */
  heightFromFloorM: number;
  /** Opening width in meters. */
  widthM: number;
  /** Opening height in meters. */
  heightM: number;
  /** Optional glass tint color hex (e.g. '#e0f2fe'). */
  glassTintHex?: string;
  /** Glass surface roughness [0.0, 1.0]. */
  glassRoughness?: number;
  /** Glass opacity [0.0, 1.0]. */
  glassOpacity?: number;
  /** Window casing and muntin frame color hex. */
  frameColorHex?: string;
}

export interface DoorData {
  id: string;
  name: string;
  type: DoorType;
  /** Offset in meters from the wall start point along the wall axis. */
  offsetAlongWallM: number;
  /** Opening width in meters. */
  widthM: number;
  /** Opening height in meters. */
  heightM: number;
  /** Interactive open angle in degrees [0, 180]. */
  openAngleDeg?: number;
  /** Door slab and trim finish color hex override. */
  finishHex?: string;
}

export interface WallData {
  id: string;
  name: string;
  /** Wall baseline start position in scene space (meters, y = floor). */
  start: Vec3;
  /** Wall baseline end position in scene space (meters, y = floor). */
  end: Vec3;
  /** Vertical wall height in meters. */
  heightM: number;
  /** Wall thickness in meters. */
  thicknessM: number;
  /** Architectural surface finish preset. */
  finish: WallFinishType;
  /** Color tint override hex. */
  tintHex: string;
  /** PBR surface roughness [0.0, 1.0]. */
  roughness: number;
  /** UV texture repeat count [u, v]. */
  uvTiling: [number, number];
  /** Optional window openings cut into this wall. */
  windows?: WindowData[];
  /** Optional door openings cut into this wall. */
  doors?: DoorData[];
}

export interface ArchitecturalSet {
  id: string;
  name: string;
  walls: WallData[];
  floorFinish?: string;
  ceilingHeightM?: number;
}

export interface WallFinishPreset {
  id: WallFinishType;
  name: string;
  defaultTintHex: string;
  defaultRoughness: number;
  defaultMetalness: number;
  defaultUvTiling: [number, number];
  description: string;
}

export const WALL_FINISH_PRESETS: Record<WallFinishType, WallFinishPreset> = {
  painted_drywall: {
    id: 'painted_drywall',
    name: 'Painted Drywall',
    defaultTintHex: '#f1f5f9',
    defaultRoughness: 0.85,
    defaultMetalness: 0.0,
    defaultUvTiling: [1, 1],
    description: 'Smooth painted interior drywall with subtle matte plaster texture.',
  },
  victorian_damask: {
    id: 'victorian_damask',
    name: 'Victorian Damask',
    defaultTintHex: '#881337',
    defaultRoughness: 0.6,
    defaultMetalness: 0.1,
    defaultUvTiling: [2, 2],
    description: 'Ornate period floral damask wallpaper with velvety sheen.',
  },
  midcentury_geometric: {
    id: 'midcentury_geometric',
    name: 'Mid-Century Geometric',
    defaultTintHex: '#d97706',
    defaultRoughness: 0.7,
    defaultMetalness: 0.0,
    defaultUvTiling: [3, 3],
    description: 'Retro 1960s diamond and starburst geometric patterned wallpaper.',
  },
  exposed_brick: {
    id: 'exposed_brick',
    name: 'Exposed Brick',
    defaultTintHex: '#991b1b',
    defaultRoughness: 0.95,
    defaultMetalness: 0.0,
    defaultUvTiling: [4, 4],
    description: 'Rustic urban brickwork with mortar joints and weathered texture.',
  },
  wood_paneling: {
    id: 'wood_paneling',
    name: 'Wood Paneling',
    defaultTintHex: '#78350f',
    defaultRoughness: 0.45,
    defaultMetalness: 0.05,
    defaultUvTiling: [2, 1],
    description: 'Vertical tongue-and-groove warm oak wood wall paneling.',
  },
  industrial_concrete: {
    id: 'industrial_concrete',
    name: 'Industrial Concrete',
    defaultTintHex: '#64748b',
    defaultRoughness: 0.9,
    defaultMetalness: 0.1,
    defaultUvTiling: [2, 2],
    description: 'Cast architectural concrete with formwork seams and tie holes.',
  },
  acoustic_foam: {
    id: 'acoustic_foam',
    name: 'Acoustic Foam',
    defaultTintHex: '#1e293b',
    defaultRoughness: 0.98,
    defaultMetalness: 0.0,
    defaultUvTiling: [6, 6],
    description: 'Studio pyramid acoustic soundproofing wedge foam panels.',
  },
  custom_color: {
    id: 'custom_color',
    name: 'Custom Studio Color',
    defaultTintHex: '#3b82f6',
    defaultRoughness: 0.75,
    defaultMetalness: 0.0,
    defaultUvTiling: [1, 1],
    description: 'Uniform matte studio flat with custom hex color tinting.',
  },
};

export interface WindowTypeDefinition {
  type: WindowType;
  name: string;
  defaultWidthM: number;
  defaultHeightM: number;
  defaultHeightFromFloorM: number;
  defaultGlassTintHex: string;
  defaultGlassRoughness: number;
  defaultGlassOpacity: number;
  defaultFrameColorHex: string;
  description: string;
}

export const DEFAULT_WINDOW_TYPES: Record<WindowType, WindowTypeDefinition> = {
  casement: {
    type: 'casement',
    name: 'Casement Window',
    defaultWidthM: 0.9,
    defaultHeightM: 1.2,
    defaultHeightFromFloorM: 0.9,
    defaultGlassTintHex: '#e0f2fe',
    defaultGlassRoughness: 0.1,
    defaultGlassOpacity: 0.35,
    defaultFrameColorHex: '#334155',
    description: 'Hinged side-opening residential window with muntin grid.',
  },
  sash: {
    type: 'sash',
    name: 'Double-Hung Sash Window',
    defaultWidthM: 1.0,
    defaultHeightM: 1.5,
    defaultHeightFromFloorM: 0.8,
    defaultGlassTintHex: '#f0f9ff',
    defaultGlassRoughness: 0.08,
    defaultGlassOpacity: 0.3,
    defaultFrameColorHex: '#ffffff',
    description: 'Classic vertical sliding two-pane architectural window.',
  },
  picture: {
    type: 'picture',
    name: 'Picture Window',
    defaultWidthM: 2.0,
    defaultHeightM: 1.5,
    defaultHeightFromFloorM: 0.7,
    defaultGlassTintHex: '#e0f2fe',
    defaultGlassRoughness: 0.05,
    defaultGlassOpacity: 0.25,
    defaultFrameColorHex: '#1e293b',
    description: 'Large fixed single-pane scenic panoramic window.',
  },
  floor_to_ceiling: {
    type: 'floor_to_ceiling',
    name: 'Floor to Ceiling Glass',
    defaultWidthM: 1.8,
    defaultHeightM: 2.7,
    defaultHeightFromFloorM: 0.0,
    defaultGlassTintHex: '#bae6fd',
    defaultGlassRoughness: 0.05,
    defaultGlassOpacity: 0.3,
    defaultFrameColorHex: '#0f172a',
    description: 'Modern high-rise full height architectural curtain glazing.',
  },
  stained_glass: {
    type: 'stained_glass',
    name: 'Stained Glass Window',
    defaultWidthM: 1.0,
    defaultHeightM: 1.8,
    defaultHeightFromFloorM: 0.8,
    defaultGlassTintHex: '#a855f7',
    defaultGlassRoughness: 0.2,
    defaultGlassOpacity: 0.65,
    defaultFrameColorHex: '#451a03',
    description: 'Cathedral style decorative stained glass with leaded came framing.',
  },
  arched: {
    type: 'arched',
    name: 'Arched Window',
    defaultWidthM: 1.2,
    defaultHeightM: 1.8,
    defaultHeightFromFloorM: 0.8,
    defaultGlassTintHex: '#e0f2fe',
    defaultGlassRoughness: 0.1,
    defaultGlassOpacity: 0.35,
    defaultFrameColorHex: '#475569',
    description: 'Romanesque arched top window with radial mullions.',
  },
};

export interface DoorTypeDefinition {
  type: DoorType;
  name: string;
  defaultWidthM: number;
  defaultHeightM: number;
  defaultOpenAngleDeg: number;
  defaultFinishHex: string;
  description: string;
}

export const DEFAULT_DOOR_TYPES: Record<DoorType, DoorTypeDefinition> = {
  single_swing: {
    type: 'single_swing',
    name: 'Single Swing Door',
    defaultWidthM: 0.9,
    defaultHeightM: 2.1,
    defaultOpenAngleDeg: 0,
    defaultFinishHex: '#78350f',
    description: 'Standard interior passage door with handle and trim frame.',
  },
  double_french: {
    type: 'double_french',
    name: 'Double French Doors',
    defaultWidthM: 1.8,
    defaultHeightM: 2.1,
    defaultOpenAngleDeg: 0,
    defaultFinishHex: '#f8fafc',
    description: 'Pair of symmetrical glazed French doors with dual handles.',
  },
  sliding_barn: {
    type: 'sliding_barn',
    name: 'Sliding Barn Door',
    defaultWidthM: 1.1,
    defaultHeightM: 2.2,
    defaultOpenAngleDeg: 0,
    defaultFinishHex: '#451a03',
    description: 'Top-track mounted rustic sliding plank timber door.',
  },
  studio_acoustic: {
    type: 'studio_acoustic',
    name: 'Soundstage Acoustic Door',
    defaultWidthM: 1.0,
    defaultHeightM: 2.2,
    defaultOpenAngleDeg: 0,
    defaultFinishHex: '#1e293b',
    description: 'Heavy soundproof soundstage air-lock door with compression seals.',
  },
  pocket: {
    type: 'pocket',
    name: 'Pocket Door',
    defaultWidthM: 0.85,
    defaultHeightM: 2.1,
    defaultOpenAngleDeg: 0,
    defaultFinishHex: '#d1d5db',
    description: 'Recessed sliding door that slides into wall cavity.',
  },
};

export interface WallPolygon {
  corners: Vec3[];
  normal: Vec3;
  lengthM: number;
}

export interface WallBoundingBox {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  size: Vec3;
}

export interface WallOpeningBounds {
  center: Vec3;
  min: Vec3;
  max: Vec3;
  localOffset: Vec3;
}

function archUid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `arch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function isVec3(v: unknown): v is Vec3 {
  const p = v as Vec3;
  return (
    !!p &&
    typeof p === 'object' &&
    typeof p.x === 'number' &&
    Number.isFinite(p.x) &&
    typeof p.y === 'number' &&
    Number.isFinite(p.y) &&
    typeof p.z === 'number' &&
    Number.isFinite(p.z)
  );
}

// --- Factories --------------------------------------------------------------

/**
 * Creates a new WindowData instance with validated defaults.
 */
export function createWindowData(params?: Partial<WindowData>): WindowData {
  const type: WindowType = params?.type ?? 'casement';
  const def = DEFAULT_WINDOW_TYPES[type] ?? DEFAULT_WINDOW_TYPES.casement;
  return {
    id: params?.id || archUid(),
    name: params?.name || def.name,
    type,
    offsetAlongWallM: typeof params?.offsetAlongWallM === 'number' && Number.isFinite(params.offsetAlongWallM)
      ? Math.max(0, params.offsetAlongWallM)
      : 1.0,
    heightFromFloorM: typeof params?.heightFromFloorM === 'number' && Number.isFinite(params.heightFromFloorM)
      ? Math.max(0, params.heightFromFloorM)
      : def.defaultHeightFromFloorM,
    widthM: typeof params?.widthM === 'number' && Number.isFinite(params.widthM) && params.widthM > 0
      ? params.widthM
      : def.defaultWidthM,
    heightM: typeof params?.heightM === 'number' && Number.isFinite(params.heightM) && params.heightM > 0
      ? params.heightM
      : def.defaultHeightM,
    glassTintHex: params?.glassTintHex ?? def.defaultGlassTintHex,
    glassRoughness: typeof params?.glassRoughness === 'number' && Number.isFinite(params.glassRoughness)
      ? Math.max(0, Math.min(1, params.glassRoughness))
      : def.defaultGlassRoughness,
    glassOpacity: typeof params?.glassOpacity === 'number' && Number.isFinite(params.glassOpacity)
      ? Math.max(0, Math.min(1, params.glassOpacity))
      : def.defaultGlassOpacity,
    frameColorHex: params?.frameColorHex ?? def.defaultFrameColorHex,
  };
}

/**
 * Creates a new DoorData instance with validated defaults.
 */
export function createDoorData(params?: Partial<DoorData>): DoorData {
  const type: DoorType = params?.type ?? 'single_swing';
  const def = DEFAULT_DOOR_TYPES[type] ?? DEFAULT_DOOR_TYPES.single_swing;
  return {
    id: params?.id || archUid(),
    name: params?.name || def.name,
    type,
    offsetAlongWallM: typeof params?.offsetAlongWallM === 'number' && Number.isFinite(params.offsetAlongWallM)
      ? Math.max(0, params.offsetAlongWallM)
      : 1.0,
    widthM: typeof params?.widthM === 'number' && Number.isFinite(params.widthM) && params.widthM > 0
      ? params.widthM
      : def.defaultWidthM,
    heightM: typeof params?.heightM === 'number' && Number.isFinite(params.heightM) && params.heightM > 0
      ? params.heightM
      : def.defaultHeightM,
    openAngleDeg: typeof params?.openAngleDeg === 'number' && Number.isFinite(params.openAngleDeg)
      ? Math.max(-180, Math.min(180, params.openAngleDeg))
      : def.defaultOpenAngleDeg,
    finishHex: params?.finishHex ?? def.defaultFinishHex,
  };
}

/**
 * Creates a new WallData instance with validated defaults and finish presets.
 * Supports both `createWallData(params)` and `createWallData(start, end, overrides)`.
 */
export function createWallData(
  startOrParams?: Vec3 | Partial<WallData>,
  endOrOverrides?: Vec3 | Partial<WallData>,
  maybeOverrides?: Partial<WallData>,
): WallData {
  let params: Partial<WallData> = {};

  if (startOrParams && typeof startOrParams === 'object' && ('x' in startOrParams && 'y' in startOrParams && 'z' in startOrParams)) {
    // Positional signature: createWallData(start, end, overrides)
    const startVec = startOrParams as Vec3;
    const endVec = (endOrOverrides && typeof endOrOverrides === 'object' && 'x' in endOrOverrides) ? (endOrOverrides as Vec3) : { x: startVec.x + 4, y: startVec.y, z: startVec.z };
    const overrides = maybeOverrides ?? (endOrOverrides && !('x' in endOrOverrides) ? (endOrOverrides as Partial<WallData>) : {});
    params = {
      start: startVec,
      end: endVec,
      ...overrides,
    };
  } else if (startOrParams && typeof startOrParams === 'object') {
    params = startOrParams as Partial<WallData>;
  }

  const finish: WallFinishType = params?.finish ?? 'painted_drywall';
  const preset = WALL_FINISH_PRESETS[finish] ?? WALL_FINISH_PRESETS.painted_drywall;
  return {
    id: params?.id || archUid(),
    name: params?.name || 'Wall',
    start: params?.start ? { ...params.start } : { x: 0, y: 0, z: 0 },
    end: params?.end ? { ...params.end } : { x: 4, y: 0, z: 0 },
    heightM: typeof params?.heightM === 'number' && Number.isFinite(params.heightM) && params.heightM > 0
      ? params.heightM
      : 2.8,
    thicknessM: typeof params?.thicknessM === 'number' && Number.isFinite(params.thicknessM) && params.thicknessM > 0
      ? params.thicknessM
      : 0.15,
    finish,
    tintHex: params?.tintHex ?? preset.defaultTintHex,
    roughness: typeof params?.roughness === 'number' && Number.isFinite(params.roughness)
      ? Math.max(0, Math.min(1, params.roughness))
      : preset.defaultRoughness,
    uvTiling: params?.uvTiling ? [params.uvTiling[0], params.uvTiling[1]] : [...preset.defaultUvTiling],
    windows: params?.windows ? params.windows.map((w) => createWindowData(w)) : [],
    doors: params?.doors ? params.doors.map((d) => createDoorData(d)) : [],
  };
}

/**
 * Creates a new ArchitecturalSet instance.
 * Supports `createArchitecturalSet(name, walls, params)` and `createArchitecturalSet(name, params)`.
 */
export function createArchitecturalSet(
  name = 'Set Architecture',
  wallsOrParams?: WallData[] | Partial<ArchitecturalSet>,
  params?: Partial<ArchitecturalSet>,
): ArchitecturalSet {
  let walls: WallData[] = [];
  let extraParams: Partial<ArchitecturalSet> = {};

  if (Array.isArray(wallsOrParams)) {
    walls = wallsOrParams;
    extraParams = params ?? {};
  } else if (wallsOrParams && typeof wallsOrParams === 'object') {
    extraParams = wallsOrParams;
    if (Array.isArray(extraParams.walls)) {
      walls = extraParams.walls;
    }
  }

  return {
    id: extraParams.id || archUid(),
    name: extraParams.name || name,
    walls: walls.map((w) => createWallData(w)),
    floorFinish: extraParams.floorFinish,
    ceilingHeightM: typeof extraParams.ceilingHeightM === 'number' && Number.isFinite(extraParams.ceilingHeightM)
      ? extraParams.ceilingHeightM
      : undefined,
  };
}

// --- Type Guards ------------------------------------------------------------

export function isWindowData(v: unknown): v is WindowData {
  const w = v as WindowData;
  return (
    !!w &&
    typeof w === 'object' &&
    typeof w.id === 'string' &&
    typeof w.name === 'string' &&
    typeof w.type === 'string' &&
    ['casement', 'sash', 'picture', 'floor_to_ceiling', 'stained_glass', 'arched'].includes(w.type) &&
    typeof w.offsetAlongWallM === 'number' &&
    Number.isFinite(w.offsetAlongWallM) &&
    w.offsetAlongWallM >= 0 &&
    typeof w.heightFromFloorM === 'number' &&
    Number.isFinite(w.heightFromFloorM) &&
    w.heightFromFloorM >= 0 &&
    typeof w.widthM === 'number' &&
    Number.isFinite(w.widthM) &&
    w.widthM > 0 &&
    typeof w.heightM === 'number' &&
    Number.isFinite(w.heightM) &&
    w.heightM > 0 &&
    (w.glassTintHex === undefined || typeof w.glassTintHex === 'string') &&
    (w.glassRoughness === undefined || (typeof w.glassRoughness === 'number' && Number.isFinite(w.glassRoughness) && w.glassRoughness >= 0 && w.glassRoughness <= 1)) &&
    (w.glassOpacity === undefined || (typeof w.glassOpacity === 'number' && Number.isFinite(w.glassOpacity) && w.glassOpacity >= 0 && w.glassOpacity <= 1)) &&
    (w.frameColorHex === undefined || typeof w.frameColorHex === 'string')
  );
}

export function isDoorData(v: unknown): v is DoorData {
  const d = v as DoorData;
  return (
    !!d &&
    typeof d === 'object' &&
    typeof d.id === 'string' &&
    typeof d.name === 'string' &&
    typeof d.type === 'string' &&
    ['single_swing', 'double_french', 'sliding_barn', 'studio_acoustic', 'pocket'].includes(d.type) &&
    typeof d.offsetAlongWallM === 'number' &&
    Number.isFinite(d.offsetAlongWallM) &&
    d.offsetAlongWallM >= 0 &&
    typeof d.widthM === 'number' &&
    Number.isFinite(d.widthM) &&
    d.widthM > 0 &&
    typeof d.heightM === 'number' &&
    Number.isFinite(d.heightM) &&
    d.heightM > 0 &&
    (d.openAngleDeg === undefined || (typeof d.openAngleDeg === 'number' && Number.isFinite(d.openAngleDeg) && d.openAngleDeg >= -180 && d.openAngleDeg <= 180)) &&
    (d.finishHex === undefined || typeof d.finishHex === 'string')
  );
}

export function isWallData(v: unknown): v is WallData {
  const w = v as WallData;
  return (
    !!w &&
    typeof w === 'object' &&
    typeof w.id === 'string' &&
    typeof w.name === 'string' &&
    isVec3(w.start) &&
    isVec3(w.end) &&
    typeof w.heightM === 'number' &&
    Number.isFinite(w.heightM) &&
    w.heightM > 0 &&
    typeof w.thicknessM === 'number' &&
    Number.isFinite(w.thicknessM) &&
    w.thicknessM > 0 &&
    typeof w.finish === 'string' &&
    [
      'painted_drywall',
      'victorian_damask',
      'midcentury_geometric',
      'exposed_brick',
      'wood_paneling',
      'industrial_concrete',
      'acoustic_foam',
      'custom_color',
    ].includes(w.finish) &&
    typeof w.tintHex === 'string' &&
    typeof w.roughness === 'number' &&
    Number.isFinite(w.roughness) &&
    w.roughness >= 0 &&
    w.roughness <= 1 &&
    Array.isArray(w.uvTiling) &&
    w.uvTiling.length === 2 &&
    w.uvTiling.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0) &&
    (w.windows === undefined || (Array.isArray(w.windows) && w.windows.every(isWindowData))) &&
    (w.doors === undefined || (Array.isArray(w.doors) && w.doors.every(isDoorData)))
  );
}

export function isArchitecturalSet(v: unknown): v is ArchitecturalSet {
  const s = v as ArchitecturalSet;
  return (
    !!s &&
    typeof s === 'object' &&
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    Array.isArray(s.walls) &&
    s.walls.every(isWallData) &&
    (s.floorFinish === undefined || typeof s.floorFinish === 'string') &&
    (s.ceilingHeightM === undefined || (typeof s.ceilingHeightM === 'number' && Number.isFinite(s.ceilingHeightM) && s.ceilingHeightM > 0))
  );
}

// --- Normalization ----------------------------------------------------------

export function normalizeWindowData(window: WindowData): WindowData {
  const win = { ...window };
  const validTypes: WindowType[] = ['casement', 'sash', 'picture', 'floor_to_ceiling', 'stained_glass', 'arched'];
  if (!validTypes.includes(win.type)) {
    win.type = 'casement';
  }
  const def = DEFAULT_WINDOW_TYPES[win.type] ?? DEFAULT_WINDOW_TYPES.casement;
  if (!win.name || typeof win.name !== 'string') win.name = def.name;
  if (!Number.isFinite(win.offsetAlongWallM) || win.offsetAlongWallM < 0) win.offsetAlongWallM = 0;
  if (!Number.isFinite(win.heightFromFloorM) || win.heightFromFloorM < 0) win.heightFromFloorM = def.defaultHeightFromFloorM;
  if (!Number.isFinite(win.widthM) || win.widthM <= 0) win.widthM = def.defaultWidthM;
  if (!Number.isFinite(win.heightM) || win.heightM <= 0) win.heightM = def.defaultHeightM;
  if (typeof win.glassTintHex !== 'string') win.glassTintHex = def.defaultGlassTintHex;
  if (!Number.isFinite(win.glassRoughness) || win.glassRoughness! < 0 || win.glassRoughness! > 1) {
    win.glassRoughness = def.defaultGlassRoughness;
  }
  if (!Number.isFinite(win.glassOpacity) || win.glassOpacity! < 0 || win.glassOpacity! > 1) {
    win.glassOpacity = def.defaultGlassOpacity;
  }
  if (typeof win.frameColorHex !== 'string') win.frameColorHex = def.defaultFrameColorHex;
  return win;
}

export function normalizeDoorData(door: DoorData): DoorData {
  const d = { ...door };
  const validTypes: DoorType[] = ['single_swing', 'double_french', 'sliding_barn', 'studio_acoustic', 'pocket'];
  if (!validTypes.includes(d.type)) {
    d.type = 'single_swing';
  }
  const def = DEFAULT_DOOR_TYPES[d.type] ?? DEFAULT_DOOR_TYPES.single_swing;
  if (!d.name || typeof d.name !== 'string') d.name = def.name;
  if (!Number.isFinite(d.offsetAlongWallM) || d.offsetAlongWallM < 0) d.offsetAlongWallM = 0;
  if (!Number.isFinite(d.widthM) || d.widthM <= 0) d.widthM = def.defaultWidthM;
  if (!Number.isFinite(d.heightM) || d.heightM <= 0) d.heightM = def.defaultHeightM;
  if (!Number.isFinite(d.openAngleDeg) || d.openAngleDeg! < -180 || d.openAngleDeg! > 180) {
    d.openAngleDeg = def.defaultOpenAngleDeg;
  }
  if (typeof d.finishHex !== 'string') d.finishHex = def.defaultFinishHex;
  return d;
}

export function normalizeWallData(wall: WallData): WallData {
  const w = { ...wall };
  if (!isVec3(w.start)) w.start = { x: 0, y: 0, z: 0 };
  if (!isVec3(w.end)) w.end = { x: 4, y: 0, z: 0 };
  if (!Number.isFinite(w.heightM) || w.heightM < 0.2) w.heightM = 2.8;
  if (!Number.isFinite(w.thicknessM) || w.thicknessM < 0.01) w.thicknessM = 0.15;
  const validFinishes: WallFinishType[] = [
    'painted_drywall',
    'victorian_damask',
    'midcentury_geometric',
    'exposed_brick',
    'wood_paneling',
    'industrial_concrete',
    'acoustic_foam',
    'custom_color',
  ];
  if (!validFinishes.includes(w.finish)) {
    w.finish = 'painted_drywall';
  }
  const preset = WALL_FINISH_PRESETS[w.finish] ?? WALL_FINISH_PRESETS.painted_drywall;
  if (typeof w.tintHex !== 'string' || !/^#[0-9a-fA-F]{3,8}$/.test(w.tintHex)) {
    w.tintHex = preset.defaultTintHex;
  }
  if (!Number.isFinite(w.roughness) || w.roughness < 0 || w.roughness > 1) {
    w.roughness = preset.defaultRoughness;
  }
  if (
    !Array.isArray(w.uvTiling) ||
    w.uvTiling.length !== 2 ||
    !Number.isFinite(w.uvTiling[0]) ||
    !Number.isFinite(w.uvTiling[1]) ||
    w.uvTiling[0] <= 0 ||
    w.uvTiling[1] <= 0
  ) {
    w.uvTiling = [...preset.defaultUvTiling];
  }
  if (Array.isArray(w.windows)) {
    w.windows = w.windows
      .filter((win) => win && typeof win === 'object')
      .map((win) => normalizeWindowData(win as WindowData));
  } else {
    w.windows = [];
  }
  if (Array.isArray(w.doors)) {
    w.doors = w.doors
      .filter((door) => door && typeof door === 'object')
      .map((door) => normalizeDoorData(door as DoorData));
  } else {
    w.doors = [];
  }
  return w;
}

export function normalizeArchitecturalSet(set: ArchitecturalSet): ArchitecturalSet {
  const s = { ...set };
  if (typeof s.id !== 'string' || !s.id) s.id = archUid();
  if (typeof s.name !== 'string' || !s.name) s.name = 'Set Architecture';
  if (Array.isArray(s.walls)) {
    s.walls = s.walls
      .filter((w) => w && typeof w === 'object' && (('start' in w && 'end' in w) || isWallData(w)))
      .map((w) => normalizeWallData(w as WallData));
  } else {
    s.walls = [];
  }
  if (s.floorFinish !== undefined && typeof s.floorFinish !== 'string') {
    s.floorFinish = undefined;
  }
  if (typeof s.ceilingHeightM !== 'number' || !Number.isFinite(s.ceilingHeightM) || s.ceilingHeightM <= 0) {
    s.ceilingHeightM = undefined;
  }
  return s;
}

// --- Spatial Math & Geometric Analysis --------------------------------------

/**
 * Calculates the wall footprint polygon, normal vector, and length in meters.
 * Pure deterministic 2D/3D geometry.
 */
export function calculateWallPolygon(wall: WallData): WallPolygon {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const lengthM = Math.hypot(dx, dz);

  let nx = 0;
  let nz = 1;
  if (lengthM > 1e-6) {
    const ux = dx / lengthM;
    const uz = dz / lengthM;
    // Perpendicular normal in horizontal XZ plane
    nx = Math.abs(uz) < 1e-12 ? 0 : -uz;
    nz = Math.abs(ux) < 1e-12 ? 0 : ux;
  }

  const halfT = wall.thicknessM / 2;
  const corners: Vec3[] = [
    { x: wall.start.x - nx * halfT, y: wall.start.y, z: wall.start.z - nz * halfT },
    { x: wall.start.x + nx * halfT, y: wall.start.y, z: wall.start.z + nz * halfT },
    { x: wall.end.x + nx * halfT, y: wall.end.y, z: wall.end.z + nz * halfT },
    { x: wall.end.x - nx * halfT, y: wall.end.y, z: wall.end.z - nz * halfT },
  ];

  return {
    corners,
    normal: { x: nx, y: 0, z: nz },
    lengthM,
  };
}

/**
 * Calculates the 3D Axis-Aligned Bounding Box (AABB) of a wall.
 */
export function calculateWallBoundingBox(wall: WallData): WallBoundingBox {
  const poly = calculateWallPolygon(wall);
  const minY = Math.min(wall.start.y, wall.end.y);
  const maxY = Math.max(wall.start.y, wall.end.y) + wall.heightM;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const c of poly.corners) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.z < minZ) minZ = c.z;
    if (c.z > maxZ) maxZ = c.z;
  }

  const min: Vec3 = { x: minX, y: minY, z: minZ };
  const max: Vec3 = { x: maxX, y: maxY, z: maxZ };
  const center: Vec3 = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    z: (minZ + maxZ) / 2,
  };
  const size: Vec3 = {
    x: maxX - minX,
    y: maxY - minY,
    z: maxZ - minZ,
  };

  return { min, max, center, size };
}

/**
 * Calculates the 3D spatial center, bounding limits, and local offsets for a window opening.
 */
export function calculateWindowOpening(wall: WallData, window: WindowData): WallOpeningBounds {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const wallLen = Math.hypot(dx, dz);

  let ux = 1;
  let uz = 0;
  let nx = 0;
  let nz = 1;
  if (wallLen > 1e-6) {
    ux = dx / wallLen;
    uz = dz / wallLen;
    nx = -uz;
    nz = ux;
  }

  const centerDist = window.offsetAlongWallM + window.widthM / 2;
  const centerY = wall.start.y + window.heightFromFloorM + window.heightM / 2;
  const center: Vec3 = {
    x: wall.start.x + ux * centerDist,
    y: centerY,
    z: wall.start.z + uz * centerDist,
  };

  const halfT = wall.thicknessM / 2;
  const halfW = window.widthM / 2;
  const halfH = window.heightM / 2;

  // 8 corner points of window opening volume
  const corners: Vec3[] = [];
  for (const wSign of [-1, 1]) {
    for (const hSign of [-1, 1]) {
      for (const tSign of [-1, 1]) {
        corners.push({
          x: center.x + ux * (halfW * wSign) + nx * (halfT * tSign),
          y: center.y + halfH * hSign,
          z: center.z + uz * (halfW * wSign) + nz * (halfT * tSign),
        });
      }
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const pt of corners) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
    if (pt.z < minZ) minZ = pt.z;
    if (pt.z > maxZ) maxZ = pt.z;
  }

  return {
    center,
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    localOffset: {
      x: centerDist,
      y: window.heightFromFloorM + halfH,
      z: 0,
    },
  };
}

/**
 * Calculates the 3D spatial center, bounding limits, and local offsets for a door opening.
 */
export function calculateDoorOpening(wall: WallData, door: DoorData): WallOpeningBounds {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const wallLen = Math.hypot(dx, dz);

  let ux = 1;
  let uz = 0;
  let nx = 0;
  let nz = 1;
  if (wallLen > 1e-6) {
    ux = dx / wallLen;
    uz = dz / wallLen;
    nx = -uz;
    nz = ux;
  }

  const centerDist = door.offsetAlongWallM + door.widthM / 2;
  const centerY = wall.start.y + door.heightM / 2;
  const center: Vec3 = {
    x: wall.start.x + ux * centerDist,
    y: centerY,
    z: wall.start.z + uz * centerDist,
  };

  const halfT = wall.thicknessM / 2;
  const halfW = door.widthM / 2;
  const halfH = door.heightM / 2;

  const corners: Vec3[] = [];
  for (const wSign of [-1, 1]) {
    for (const hSign of [-1, 1]) {
      for (const tSign of [-1, 1]) {
        corners.push({
          x: center.x + ux * (halfW * wSign) + nx * (halfT * tSign),
          y: center.y + halfH * hSign,
          z: center.z + uz * (halfW * wSign) + nz * (halfT * tSign),
        });
      }
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const pt of corners) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
    if (pt.z < minZ) minZ = pt.z;
    if (pt.z > maxZ) maxZ = pt.z;
  }

  return {
    center,
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    localOffset: {
      x: centerDist,
      y: halfH,
      z: 0,
    },
  };
}
