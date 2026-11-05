// ---------------------------------------------------------------------------
// Pure Domain Engine: Set & Prop Assets, Stock Catalog & Spatial Math
//
// Pure domain module with ZERO Three.js or DOM imports for 100% Node testability.
// Manages:
//   - Prop definitions and categories (furniture, grip, architecture, lighting, dressing)
//   - Built-in stock asset catalog with real-world metric dimensions
//   - Prop instance data modeling, cloning, validation, and normalization
//   - Axis-aligned bounding box (AABB) & floor-snap spatial calculations
//   - Grid layout and search filtering
// ---------------------------------------------------------------------------

import type { Vec3 } from './model.ts';

export type PropSourceType = 'builtin' | 'custom_url' | 'indexeddb' | 'procedural';

export type PropCategory =
  | 'furniture'
  | 'grip_camera'
  | 'architecture'
  | 'practical_light'
  | 'set_dressing'
  | 'virtual_production'
  | 'custom';

export interface PropDimensions {
  /** Width along local X axis in meters. */
  width: number;
  /** Height along local Y axis in meters. */
  height: number;
  /** Depth along local Z axis in meters. */
  depth: number;
}

export interface PropDefinition {
  id: string;
  name: string;
  category: PropCategory;
  sourceType: PropSourceType;
  dimensions: PropDimensions;
  defaultColorHex: string;
  description: string;
  tags: readonly string[];
  /** Optional preview icon key or badge symbol. */
  iconSymbol?: string;
  /** Optional custom model URL or remote asset link. */
  sourceUrl?: string;
}

export interface PropData {
  id: string;
  assetId: string;
  name: string;
  category: PropCategory;
  /** Scene-space translation in meters [x, y, z]. */
  position: Vec3;
  /** Heading rotation around +Y axis in radians (0 = +Z). */
  rotationY: number;
  /** Pitch rotation around local X axis in radians (default 0). */
  rotationX?: number;
  /** Roll rotation around local Z axis in radians (default 0). */
  rotationZ?: number;
  /** Metric scale multiplier along each axis (default {x:1, y:1, z:1}). */
  scale: Vec3;
  /** Optional custom tint color hex override (e.g. '#e5484d'). */
  colorHex?: string;
  /** Whether prop is locked against accidental transforms. */
  isLocked?: boolean;
  /** Whether prop is visible in viewport. */
  visible?: boolean;
  /** Source storage type for model loader. */
  sourceType: PropSourceType;
  /** Key in IndexedDB PropStore if custom user-uploaded asset. */
  customModelKey?: string;
  /** Arbitrary production notes or metadata. */
  metadata?: Record<string, string | number | boolean>;
}

export interface PropAABB {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  size: Vec3;
}

// --- Built-in Stock Catalog -------------------------------------------------

export const BUILTIN_PROPS: readonly PropDefinition[] = [
  {
    id: 'directors_chair',
    name: "Director's Chair",
    category: 'furniture',
    sourceType: 'builtin',
    dimensions: { width: 0.62, height: 1.18, depth: 0.54 },
    defaultColorHex: '#1e293b',
    description: 'Foldable wooden director chair with canvas seat and backrest.',
    tags: ['chair', 'seating', 'director', 'furniture', 'wood'],
    iconSymbol: '🪑',
  },
  {
    id: 'apple_box_full',
    name: 'Apple Box (Full)',
    category: 'grip_camera',
    sourceType: 'builtin',
    dimensions: { width: 0.3, height: 0.2, depth: 0.5 },
    defaultColorHex: '#b45309',
    description: 'Standard 8x12x20 inch wooden full apple box for camera and actor staging.',
    tags: ['apple box', 'grip', 'wood', 'support', 'staging'],
    iconSymbol: '📦',
  },
  {
    id: 'apple_box_half',
    name: 'Apple Box (Half)',
    category: 'grip_camera',
    sourceType: 'builtin',
    dimensions: { width: 0.3, height: 0.1, depth: 0.5 },
    defaultColorHex: '#92400e',
    description: 'Standard 4x12x20 inch wooden half apple box.',
    tags: ['apple box', 'grip', 'wood', 'half'],
    iconSymbol: '📦',
  },
  {
    id: 'apple_box_quarter',
    name: 'Apple Box (Quarter)',
    category: 'grip_camera',
    sourceType: 'builtin',
    dimensions: { width: 0.3, height: 0.05, depth: 0.5 },
    defaultColorHex: '#78350f',
    description: 'Standard 2x12x20 inch wooden quarter apple box (pancake).',
    tags: ['apple box', 'grip', 'wood', 'quarter', 'pancake'],
    iconSymbol: '📦',
  },
  {
    id: 'c_stand_with_arm',
    name: 'C-Stand with Grip Arm',
    category: 'grip_camera',
    sourceType: 'builtin',
    dimensions: { width: 0.75, height: 2.3, depth: 0.75 },
    defaultColorHex: '#94a3b8',
    description: 'Chrome Century stand with 40-inch grip arm and knuckle for flags/lights.',
    tags: ['c-stand', 'grip', 'stand', 'lighting', 'flag', 'metal'],
    iconSymbol: '🗼',
  },
  {
    id: 'film_slate_clapper',
    name: 'Film Clapper Slate',
    category: 'set_dressing',
    sourceType: 'builtin',
    dimensions: { width: 0.3, height: 0.25, depth: 0.03 },
    defaultColorHex: '#0f172a',
    description: 'Acrylic production clapper board with chevron sticks and timecode readout.',
    tags: ['slate', 'clapper', 'camera', 'sync', 'production'],
    iconSymbol: '🎬',
  },
  {
    id: 'production_desk',
    name: 'Production Office Desk',
    category: 'furniture',
    sourceType: 'builtin',
    dimensions: { width: 1.5, height: 0.76, depth: 0.8 },
    defaultColorHex: '#475569',
    description: 'Modern rectangular work desk with metal frame and wooden top.',
    tags: ['desk', 'table', 'office', 'furniture'],
    iconSymbol: '🖥️',
  },
  {
    id: 'office_chair',
    name: 'Ergonomic Office Chair',
    category: 'furniture',
    sourceType: 'builtin',
    dimensions: { width: 0.65, height: 0.98, depth: 0.65 },
    defaultColorHex: '#334155',
    description: 'Swivel rolling office task chair with armrests.',
    tags: ['chair', 'office', 'seating', 'desk'],
    iconSymbol: '💺',
  },
  {
    id: 'doorframe_standard',
    name: 'Standard Doorframe Unit',
    category: 'architecture',
    sourceType: 'builtin',
    dimensions: { width: 0.96, height: 2.14, depth: 0.15 },
    defaultColorHex: '#e2e8f0',
    description: 'Standard 36x84 inch residential timber doorframe and casing.',
    tags: ['door', 'doorframe', 'wall', 'architecture', 'flat'],
    iconSymbol: '🚪',
  },
  {
    id: 'window_frame_double',
    name: 'Double Window Flat',
    category: 'architecture',
    sourceType: 'builtin',
    dimensions: { width: 1.4, height: 1.6, depth: 0.15 },
    defaultColorHex: '#cbd5e1',
    description: 'Double-hung studio window flat for practical light motivation.',
    tags: ['window', 'architecture', 'wall', 'set piece'],
    iconSymbol: '🪟',
  },
  {
    id: 'practical_floor_lamp',
    name: 'Practical Floor Lamp',
    category: 'practical_light',
    sourceType: 'builtin',
    dimensions: { width: 0.45, height: 1.65, depth: 0.45 },
    defaultColorHex: '#fbbf24',
    description: 'Tall standing living room floor lamp with cylindrical fabric shade.',
    tags: ['lamp', 'lighting', 'practical', 'floor lamp'],
    iconSymbol: '💡',
  },
  {
    id: 'practical_desk_lamp',
    name: 'Banker / Desk Lamp',
    category: 'practical_light',
    sourceType: 'builtin',
    dimensions: { width: 0.28, height: 0.42, depth: 0.24 },
    defaultColorHex: '#10b981',
    description: 'Adjustable brass table lamp with green glass shade.',
    tags: ['lamp', 'desk lamp', 'practical', 'table'],
    iconSymbol: '🛋️',
  },
  {
    id: 'boom_mic_stand',
    name: 'Boom Pole & Mic Stand',
    category: 'grip_camera',
    sourceType: 'builtin',
    dimensions: { width: 0.6, height: 2.4, depth: 0.6 },
    defaultColorHex: '#1e293b',
    description: 'Telescoping audio boom pole in C-stand cradle with shotgun mic blimp.',
    tags: ['sound', 'audio', 'boom', 'microphone', 'sound recording'],
    iconSymbol: '🎙️',
  },
  {
    id: 'camera_tripod_heavy',
    name: 'Heavy-Duty Cinema Tripod',
    category: 'grip_camera',
    sourceType: 'builtin',
    dimensions: { width: 0.85, height: 1.55, depth: 0.85 },
    defaultColorHex: '#0284c7',
    description: 'Carbon fiber cinema tripod legs with fluid head and spreader.',
    tags: ['tripod', 'camera support', 'fluid head', 'camera'],
    iconSymbol: '📐',
  },
  {
    id: 'coffee_table',
    name: 'Low Coffee Table',
    category: 'furniture',
    sourceType: 'builtin',
    dimensions: { width: 1.1, height: 0.45, depth: 0.6 },
    defaultColorHex: '#78350f',
    description: 'Low wooden coffee table for living room blocking.',
    tags: ['table', 'coffee table', 'furniture', 'living room'],
    iconSymbol: '☕',
  },
  {
    id: 'couch_leather_3seater',
    name: '3-Seater Sofa',
    category: 'furniture',
    sourceType: 'builtin',
    dimensions: { width: 2.1, height: 0.85, depth: 0.92 },
    defaultColorHex: '#3f2e24',
    description: 'Deep 3-cushion living room couch with back cushions and armrests.',
    tags: ['sofa', 'couch', 'furniture', 'living room', 'seating'],
    iconSymbol: '🛋️',
  },
  {
    id: 'green_screen_frame',
    name: 'Green Screen Frame (8x8 ft)',
    category: 'virtual_production',
    sourceType: 'builtin',
    dimensions: { width: 2.44, height: 2.44, depth: 0.7 },
    defaultColorHex: '#22c55e',
    description: 'Aluminum modular 8x8 foot frame with stretched chroma green rag.',
    tags: ['green screen', 'chroma', 'vfx', 'virtual production', 'grip'],
    iconSymbol: '🟩',
  },
] as const;

// --- Category Display Metadata ----------------------------------------------

export const PROP_CATEGORIES: Record<PropCategory, { label: string; icon: string; order: number }> = {
  furniture: { label: 'Set Furniture', icon: '🪑', order: 1 },
  grip_camera: { label: 'Grip & Camera Support', icon: '📦', order: 2 },
  architecture: { label: 'Architecture & Flats', icon: '🚪', order: 3 },
  practical_light: { label: 'Practical Lighting', icon: '💡', order: 4 },
  set_dressing: { label: 'Set Dressing & Props', icon: '🎬', order: 5 },
  virtual_production: { label: 'Virtual Production / VFX', icon: '🟩', order: 6 },
  custom: { label: 'Custom Uploads', icon: '📁', order: 7 },
};

// --- Lookup & Factory Functions ---------------------------------------------

export function getBuiltinPropDefinition(assetId: string): PropDefinition | undefined {
  return BUILTIN_PROPS.find((p) => p.id === assetId);
}

export function findPropDefinition(assetId: string, customCatalog: readonly PropDefinition[] = []): PropDefinition | undefined {
  return customCatalog.find((p) => p.id === assetId) ?? getBuiltinPropDefinition(assetId);
}

const PROP_SOURCE_TYPES: readonly PropSourceType[] = ['builtin', 'custom_url', 'indexeddb', 'procedural'];

/**
 * The loader a prop needs. A prop that carries a customModelKey is an uploaded
 * model in the IndexedDB PropStore, so an absent or 'builtin' source type is
 * upgraded to 'indexeddb'. Older builds saved uploads as 'builtin', which made
 * them render as placeholder cubes; this repairs those on load. Unknown
 * strings fall back to `fallback`.
 */
export function resolvePropSourceType(
  sourceType: unknown,
  customModelKey: unknown,
  fallback: PropSourceType = 'builtin',
): PropSourceType {
  const known = PROP_SOURCE_TYPES.includes(sourceType as PropSourceType) ? (sourceType as PropSourceType) : null;
  const hasKey = typeof customModelKey === 'string' && customModelKey.length > 0;
  if (hasKey && (known === null || known === 'builtin')) return 'indexeddb';
  return known ?? fallback;
}

let _propCounter = 1;

export function createPropData(
  assetId: string,
  name?: string,
  position: Vec3 = { x: 0, y: 0, z: 0 },
  options: Partial<PropData> = {},
): PropData {
  const def = getBuiltinPropDefinition(assetId);
  const defaultName = def ? `${def.name} ${_propCounter++}` : `Prop ${_propCounter++}`;
  const category = options.category ?? def?.category ?? 'set_dressing';
  const sourceType = resolvePropSourceType(options.sourceType, options.customModelKey, def?.sourceType ?? 'builtin');

  return {
    id: options.id || `prop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    assetId,
    name: name || options.name || defaultName,
    category,
    position: { x: position.x, y: position.y, z: position.z },
    rotationY: options.rotationY ?? 0,
    rotationX: options.rotationX ?? 0,
    rotationZ: options.rotationZ ?? 0,
    scale: options.scale ? { ...options.scale } : { x: 1, y: 1, z: 1 },
    colorHex: options.colorHex ?? def?.defaultColorHex,
    isLocked: options.isLocked ?? false,
    visible: options.visible ?? true,
    sourceType,
    customModelKey: options.customModelKey,
    metadata: options.metadata ? { ...options.metadata } : undefined,
  };
}

export function duplicatePropData(prop: PropData, offset: Vec3 = { x: 0.5, y: 0, z: 0.5 }): PropData {
  return {
    ...prop,
    id: `prop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: `${prop.name} (Copy)`,
    position: {
      x: prop.position.x + offset.x,
      y: prop.position.y + offset.y,
      z: prop.position.z + offset.z,
    },
    scale: { ...prop.scale },
    isLocked: false,
  };
}

// --- Type Guards & Normalization --------------------------------------------

export function isPropData(val: unknown): val is PropData {
  if (!val || typeof val !== 'object') return false;
  const p = val as Record<string, unknown>;
  if (typeof p.id !== 'string' || !p.id) return false;
  if (typeof p.assetId !== 'string' || !p.assetId) return false;
  if (typeof p.name !== 'string') return false;
  if (!p.position || typeof p.position !== 'object') return false;
  const pos = p.position as Record<string, unknown>;
  if (typeof pos.x !== 'number' || typeof pos.y !== 'number' || typeof pos.z !== 'number') return false;
  if (typeof p.rotationY !== 'number') return false;
  return true;
}

export function normalizePropData(raw: unknown): PropData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === 'string' && r.id ? r.id : `prop-${Date.now().toString(36)}`;
  const assetId = typeof r.assetId === 'string' && r.assetId ? r.assetId : 'apple_box_full';
  const def = getBuiltinPropDefinition(assetId);

  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : def?.name || 'Prop';
  const category = (typeof r.category === 'string' && r.category in PROP_CATEGORIES
    ? r.category
    : def?.category || 'set_dressing') as PropCategory;

  const rawPos = (r.position && typeof r.position === 'object' ? r.position : {}) as Record<string, unknown>;
  const position: Vec3 = {
    x: Number.isFinite(rawPos.x) ? Number(rawPos.x) : 0,
    y: Number.isFinite(rawPos.y) ? Number(rawPos.y) : 0,
    z: Number.isFinite(rawPos.z) ? Number(rawPos.z) : 0,
  };

  const rotationY = Number.isFinite(r.rotationY) ? Number(r.rotationY) : 0;
  const rotationX = Number.isFinite(r.rotationX) ? Number(r.rotationX) : 0;
  const rotationZ = Number.isFinite(r.rotationZ) ? Number(r.rotationZ) : 0;

  const rawScale = (r.scale && typeof r.scale === 'object' ? r.scale : {}) as Record<string, unknown>;
  const clampScale = (v: unknown) => {
    const num = Number(v);
    if (!Number.isFinite(num) || num <= 0) return 1;
    return Math.max(0.05, Math.min(20.0, num));
  };
  const scale: Vec3 = {
    x: clampScale(rawScale.x),
    y: clampScale(rawScale.y),
    z: clampScale(rawScale.z),
  };

  const colorHex = typeof r.colorHex === 'string' && r.colorHex.startsWith('#') ? r.colorHex : def?.defaultColorHex;
  const isLocked = Boolean(r.isLocked);
  const visible = r.visible !== false;
  const customModelKey = typeof r.customModelKey === 'string' ? r.customModelKey : undefined;
  const sourceType = resolvePropSourceType(r.sourceType, customModelKey, def?.sourceType || 'builtin');

  return {
    id,
    assetId,
    name,
    category,
    position,
    rotationY,
    rotationX,
    rotationZ,
    scale,
    colorHex,
    isLocked,
    visible,
    sourceType,
    customModelKey,
    metadata: r.metadata && typeof r.metadata === 'object' ? (r.metadata as Record<string, string | number | boolean>) : undefined,
  };
}

// --- Spatial Bounds & Snapping Math -----------------------------------------

/** Calculates the world Axis-Aligned Bounding Box (AABB) for a prop instance. */
export function calculatePropAABB(prop: PropData, customDef?: PropDefinition): PropAABB {
  const def = customDef || getBuiltinPropDefinition(prop.assetId);
  const baseDim: PropDimensions = def?.dimensions || { width: 1.0, height: 1.0, depth: 1.0 };

  const scaledW = baseDim.width * Math.abs(prop.scale.x);
  const scaledH = baseDim.height * Math.abs(prop.scale.y);
  const scaledD = baseDim.depth * Math.abs(prop.scale.z);

  // Approximate yaw rotation expansion on XZ plane
  const cos = Math.abs(Math.cos(prop.rotationY));
  const sin = Math.abs(Math.sin(prop.rotationY));

  const rotatedW = scaledW * cos + scaledD * sin;
  const rotatedD = scaledW * sin + scaledD * cos;

  const halfW = rotatedW / 2;
  const halfD = rotatedD / 2;

  const min: Vec3 = {
    x: prop.position.x - halfW,
    y: prop.position.y,
    z: prop.position.z - halfD,
  };

  const max: Vec3 = {
    x: prop.position.x + halfW,
    y: prop.position.y + scaledH,
    z: prop.position.z + halfD,
  };

  const center: Vec3 = {
    x: prop.position.x,
    y: prop.position.y + scaledH / 2,
    z: prop.position.z,
  };

  const size: Vec3 = {
    x: rotatedW,
    y: scaledH,
    z: rotatedD,
  };

  return { min, max, center, size };
}

/** Snaps prop base to floor height (default floorY = 0.0m). */
export function snapPropToFloor(prop: PropData, floorY = 0.0): PropData {
  return {
    ...prop,
    position: {
      ...prop.position,
      y: floorY,
    },
  };
}

/** A real-surface hit this close (horizontally, m) to a released prop counts as under it. */
export const PROP_SETTLE_RADIUS_M = 0.25;
/** ...and may sit at most this far (m) above the prop's base: a prop drops onto a surface, never up. */
export const PROP_SETTLE_ABOVE_M = 0.1;

/**
 * Base height (scene space) a just-released prop settles to. `hit` is the
 * current platform hit-test point in the same space, or null. The hit is where
 * the pointer ray meets the real room, which is usually NOT under the prop, so
 * it only counts when it lies within PROP_SETTLE_RADIUS_M of the prop's XZ and
 * no more than PROP_SETTLE_ABOVE_M above its base (the prop rests on that real
 * surface, e.g. a table). Anything else lands the prop on the floor, y = 0.
 */
export function settlePropY(prop: Vec3, hit: Vec3 | null): number {
  if (hit) {
    const dx = hit.x - prop.x;
    const dz = hit.z - prop.z;
    if (dx * dx + dz * dz <= PROP_SETTLE_RADIUS_M * PROP_SETTLE_RADIUS_M && hit.y <= prop.y + PROP_SETTLE_ABOVE_M) {
      return hit.y;
    }
  }
  return 0;
}

/** A spawn hit farther than this (m, horizontally) from the viewer is not where they meant. */
export const PROP_SPAWN_HIT_MAX_M = 3;
/** ...and neither is one less than this far (m) below the viewer's eyes (a wall, not a surface). */
export const PROP_SPAWN_HIT_BELOW_EYE_M = 0.6;

/**
 * Whether a hit-test point (scene space) is a plausible place to drop a newly
 * spawned prop, given the viewer's eye position in the same space. A preset
 * picked by controller ray, above all with the wheel parked in front of the
 * face, leaves the ray running on through the virtual wheel to a far wall or
 * a distant patch of floor; spawning there sticks the prop to the wall at
 * chest height or several meters away. Only a hit within reach
 * (PROP_SPAWN_HIT_MAX_M) and at least PROP_SPAWN_HIT_BELOW_EYE_M below the
 * eyes (floor, table, counter) counts; otherwise the caller uses its
 * in-front-of-you floor point.
 */
export function propSpawnHitUsable(hit: Vec3, eye: Vec3): boolean {
  const dx = hit.x - eye.x;
  const dz = hit.z - eye.z;
  return dx * dx + dz * dz <= PROP_SPAWN_HIT_MAX_M * PROP_SPAWN_HIT_MAX_M && hit.y <= eye.y - PROP_SPAWN_HIT_BELOW_EYE_M;
}

/** Step (m) of the prop Snap to Grid action; matches the gizmo translate snap. */
export const PROP_GRID_STEP_M = 0.1;

/**
 * Snaps a prop's floor position (x, z) to the nearest point of a square grid
 * with the given step, keeping its height and heading. (calculateGridPlacement
 * below lays out the Nth prop of a batch; it does not snap a single prop.)
 */
export function snapPropToGrid(prop: PropData, step = PROP_GRID_STEP_M): PropData {
  const snap = (v: number) => (step > 0 ? Math.round(Math.round(v / step) * step * 1e6) / 1e6 : v);
  return {
    ...prop,
    position: {
      x: snap(prop.position.x),
      y: prop.position.y,
      z: snap(prop.position.z),
    },
  };
}

/** Calculates automatic grid layout positions for multiple props. */
export function calculateGridPlacement(
  index: number,
  origin: Vec3 = { x: 0, y: 0, z: 0 },
  spacing = 1.2,
  columns = 4,
): Vec3 {
  const col = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: origin.x + (col - (columns - 1) / 2) * spacing,
    y: origin.y,
    z: origin.z + row * spacing,
  };
}

// --- Filtering & Search -----------------------------------------------------

export function filterPropsByCategory(
  props: readonly PropDefinition[],
  category: PropCategory | 'all',
): PropDefinition[] {
  if (category === 'all') return [...props];
  return props.filter((p) => p.category === category);
}

export function searchProps(
  props: readonly PropDefinition[],
  query: string,
): PropDefinition[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...props];

  return props.filter((p) => {
    if (p.name.toLowerCase().includes(q)) return true;
    if (p.description.toLowerCase().includes(q)) return true;
    if (p.category.toLowerCase().includes(q)) return true;
    return p.tags.some((tag) => tag.toLowerCase().includes(q));
  });
}

export function formatDimensions(d: PropDimensions): string {
  const formatM = (v: number) => (v < 1.0 ? `${Math.round(v * 100)}cm` : `${v.toFixed(2)}m`);
  return `${formatM(d.width)} × ${formatM(d.height)} × ${formatM(d.depth)}`;
}
