// ---------------------------------------------------------------------------
// Scene / location file ingest core. PURE: no three.js, no DOM.
//
// Files reach SetView from pickers that may drop or rename extensions (the
// Quest Browser 2D page), from a LAN drop box, and from desktop drag and drop,
// so formats are identified by their bytes, never by name or MIME type.
// A runtime adapter (locationImport.ts) parses meshes with three's loaders and
// hands plain position/index arrays here, where they are converted into the
// existing LocationScan: scene space, meters, y-up, floor at y=0.
// ---------------------------------------------------------------------------

import { uid, type Vec3 } from './model.ts';
import { sanitizeMeshBuffers, transformPositions, type LocationScan, type ScanMeshData } from './scan.ts';

export type SceneFileKind =
  | 'glb'
  | 'gltf-json'
  | 'setview-json'
  | 'obj'
  | 'fbx'
  | 'ply-mesh'
  | 'ply-3dgs'
  | 'ply-3dgs-compressed'
  | 'ply-points'
  | 'spz'
  | 'splat'
  | 'zip'
  | 'png'
  | 'jpeg'
  | 'unknown';

/** How many leading bytes callers should pass to sniffSceneFile (PLY headers can be long). */
export const SNIFF_BYTES = 65536;

/** Kinds that import as a location mesh (geometry). */
export const LOCATION_MESH_KINDS: ReadonlySet<SceneFileKind> = new Set(['glb', 'obj', 'fbx', 'ply-mesh']);
/** Gaussian splat kinds: refused until splat locations exist (roadmap P3.2). */
export const SPLAT_KINDS: ReadonlySet<SceneFileKind> = new Set(['ply-3dgs', 'ply-3dgs-compressed', 'spz', 'splat']);

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0): boolean => {
  if (b.length < at + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[at + i] !== sig[i]) return false;
  return true;
};
const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));

/** Latin-1 decode of a byte range (header text only; never the whole file). */
function headText(b: Uint8Array, max: number): string {
  const n = Math.min(b.length, max);
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(b[i]);
  return s;
}

/** True when the bytes look like text (no NULs, few control characters). */
function looksTextual(b: Uint8Array, max = 4096): boolean {
  const n = Math.min(b.length, max);
  if (n === 0) return false;
  let ctrl = 0;
  for (let i = 0; i < n; i++) {
    const c = b[i];
    if (c === 0) return false;
    if (c < 9 || (c > 13 && c < 32)) ctrl++;
  }
  return ctrl / n < 0.02;
}

export interface PlyHeaderInfo {
  format: 'ascii' | 'binary_little_endian' | 'binary_big_endian' | 'unknown';
  /** Elements in header order, with their property names. */
  elements: { name: string; count: number; properties: string[] }[];
  /** Byte length of the header including the end_header line, or -1 if not found. */
  headerBytes: number;
}

/** Parses a PLY header from the first bytes of a file. Null when it is not a PLY. */
export function parsePlyHeader(head: Uint8Array): PlyHeaderInfo | null {
  if (!startsWith(head, ascii('ply'))) return null;
  const text = headText(head, head.length);
  const end = text.indexOf('end_header');
  const lines = (end >= 0 ? text.slice(0, end) : text).split(/\r?\n/);
  if (lines[0].trim() !== 'ply') return null;
  const info: PlyHeaderInfo = { format: 'unknown', elements: [], headerBytes: -1 };
  if (end >= 0) {
    const nl = text.indexOf('\n', end);
    info.headerBytes = nl >= 0 ? nl + 1 : text.length;
  }
  for (const raw of lines.slice(1)) {
    const parts = raw.trim().split(/\s+/);
    if (parts[0] === 'format' && parts[1]) {
      const f = parts[1];
      info.format = f === 'ascii' || f === 'binary_little_endian' || f === 'binary_big_endian' ? f : 'unknown';
    } else if (parts[0] === 'element' && parts.length >= 3) {
      const count = Number(parts[2]);
      info.elements.push({ name: parts[1], count: Number.isFinite(count) ? count : 0, properties: [] });
    } else if (parts[0] === 'property' && info.elements.length) {
      info.elements[info.elements.length - 1].properties.push(parts[parts.length - 1]);
    }
  }
  return info;
}

/** Classifies a parsed PLY header. */
function plyKind(h: PlyHeaderInfo): SceneFileKind {
  if (h.elements.length && h.elements[0].name === 'chunk') return 'ply-3dgs-compressed';
  const vertex = h.elements.find((e) => e.name === 'vertex');
  const face = h.elements.find((e) => e.name === 'face');
  if (vertex) {
    const p = new Set(vertex.properties);
    if (p.has('f_dc_0') && p.has('scale_0') && p.has('rot_0') && p.has('opacity')) return 'ply-3dgs';
  }
  if (face && face.count > 0) return 'ply-mesh';
  return 'ply-points';
}

/**
 * Plausibility check for a headerless .splat file (32-byte records:
 * f32 position xyz, f32 scale xyz, u8 rgba, u8 rotation quaternion).
 */
function plausibleSplat(head: Uint8Array, totalBytes: number): boolean {
  if (totalBytes < 32 || totalBytes % 32 !== 0 || head.length < 32) return false;
  const v = new DataView(head.buffer, head.byteOffset, Math.min(head.length, 32 * 4));
  const records = Math.min(4, Math.floor(v.byteLength / 32));
  for (let r = 0; r < records; r++) {
    const o = r * 32;
    for (let i = 0; i < 3; i++) {
      const p = v.getFloat32(o + i * 4, true);
      if (!Number.isFinite(p) || Math.abs(p) > 1e5) return false;
    }
    for (let i = 0; i < 3; i++) {
      const s = v.getFloat32(o + 12 + i * 4, true);
      if (!Number.isFinite(s) || s <= 0 || s > 1e3) return false;
    }
  }
  return true;
}

/**
 * Identifies a scene or location file from its leading bytes (pass at least
 * SNIFF_BYTES when available) and, for headerless formats, its total size.
 */
export function sniffSceneFile(head: Uint8Array, totalBytes: number = head.length): SceneFileKind {
  if (head.length === 0) return 'unknown';
  if (startsWith(head, ascii('glTF'))) return 'glb';
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])) return 'zip';
  if (startsWith(head, ascii('Kaydara FBX Binary'))) return 'fbx';
  if (startsWith(head, ascii('NGSP'))) return 'spz';
  // SPZ is gzip-wrapped; any gzip stream is reported as SPZ (the only gzip format we accept).
  if (startsWith(head, [0x1f, 0x8b])) return 'spz';
  const ply = parsePlyHeader(head);
  if (ply) return plyKind(ply);
  if (looksTextual(head)) {
    const text = headText(head, Math.min(head.length, SNIFF_BYTES)).replace(/^﻿/, '');
    const trimmed = text.trimStart();
    if (trimmed.startsWith('{')) {
      if (/"asset"\s*:\s*\{/.test(text) && /"version"\s*:\s*"2/.test(text)) return 'gltf-json';
      if (/"(actors|cameras|walkSpeed)"\s*:/.test(text)) return 'setview-json';
      return 'unknown';
    }
    if (/^;\s*FBX/m.test(trimmed.slice(0, 200))) return 'fbx';
    // OBJ: vertex lines near the top (faces can sit beyond the sniffed bytes).
    if (/^v\s+[-+.\d]/m.test(text) && !/^\s*</.test(trimmed)) return 'obj';
    return 'unknown';
  }
  if (plausibleSplat(head, totalBytes)) return 'splat';
  return 'unknown';
}

/** Short user-facing name for a file kind. */
export function describeSceneFileKind(kind: SceneFileKind): string {
  switch (kind) {
    case 'glb': return 'glTF binary (.glb)';
    case 'gltf-json': return 'glTF JSON (.gltf)';
    case 'setview-json': return 'SetView scene (.setview.json)';
    case 'obj': return 'Wavefront OBJ mesh';
    case 'fbx': return 'FBX mesh';
    case 'ply-mesh': return 'PLY mesh';
    case 'ply-3dgs': return '3D Gaussian splat PLY';
    case 'ply-3dgs-compressed': return 'compressed Gaussian splat PLY';
    case 'ply-points': return 'PLY point cloud (no faces)';
    case 'spz': return 'SPZ Gaussian splat';
    case 'splat': return '.splat Gaussian splat';
    case 'zip': return 'zip archive';
    case 'png': return 'PNG image';
    case 'jpeg': return 'JPEG image';
    default: return 'unrecognised file';
  }
}

/**
 * Why a file cannot be imported as a location, or null when it can.
 * Covers every kind that is recognised but not (yet) a location mesh.
 */
export function locationImportRefusal(kind: SceneFileKind): string | null {
  if (LOCATION_MESH_KINDS.has(kind)) return null;
  if (SPLAT_KINDS.has(kind)) {
    return 'Gaussian splats cannot be used as a location yet. Export a mesh (GLB, OBJ, FBX or a PLY mesh) from the capture app instead.';
  }
  switch (kind) {
    case 'gltf-json': return 'Separate-file glTF (.gltf) is not supported. Export a single .glb instead.';
    case 'setview-json': return 'This is a SetView scene. Use Import Scene on the landing page instead.';
    case 'ply-points': return 'This PLY has points but no faces. Export a mesh from the capture app instead.';
    case 'zip': return 'Zip archives are not supported. Unzip it and import the .glb, .obj or .ply inside.';
    case 'png':
    case 'jpeg': return 'Images cannot be used as a location.';
    default: return 'This file was not recognised as a GLB, OBJ, FBX or PLY mesh.';
  }
}

// --- conventions and units --------------------------------------------------

/**
 * Source axis conventions:
 *   RUB  right, up, back: glTF / three.js / Polycam / SPZ (identity)
 *   RDF  right, down, forward: OpenCV, most 3DGS PLY (180 degrees about X)
 *   ZUP  right-handed Z-up: many scanners and DCC tools (-90 degrees about X)
 */
export type AxisConvention = 'RUB' | 'RDF' | 'ZUP';

/** Column-major 4x4 matrix mapping a source convention into SetView's y-up space. */
export function conventionMatrix(c: AxisConvention): number[] {
  switch (c) {
    case 'RDF':
      return [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];
    case 'ZUP':
      // x -> x, y (forward) -> -z, z (up) -> y
      return [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1];
    default:
      return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }
}

/** Column-major product a * b. */
export function multiplyMat4(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const out = new Array<number>(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export type UnitGuess = 'm' | 'cm' | 'mm';
export const UNIT_SCALE: Readonly<Record<UnitGuess, number>> = { m: 1, cm: 0.01, mm: 0.001 };

/**
 * Guesses the unit of a location from its largest extent. Rooms and locations
 * are a few meters to about 100 m across, so a much larger number is almost
 * certainly centimetres or millimetres. A hint for the UI, not a decision.
 */
export function guessUnitScale(boundsMin: Vec3, boundsMax: Vec3): { unit: UnitGuess; scale: number; extent: number } {
  const extent = Math.max(boundsMax.x - boundsMin.x, boundsMax.y - boundsMin.y, boundsMax.z - boundsMin.z);
  const unit: UnitGuess = extent > 3000 ? 'mm' : extent > 300 ? 'cm' : 'm';
  return { unit, scale: UNIT_SCALE[unit], extent };
}

// --- budget ----------------------------------------------------------------

export interface ImportBudget {
  warnTriangles: number;
  rejectTriangles: number;
}

/**
 * Placeholder caps until measured on a Quest 3 (roadmap spike S8). The scan is
 * drawn as one mesh per part, every frame, and again in the Camera View pass.
 */
export const DEFAULT_IMPORT_BUDGET: ImportBudget = { warnTriangles: 300_000, rejectTriangles: 500_000 };

export interface BudgetResult {
  level: 'ok' | 'warn' | 'reject';
  reason: string;
}

export function checkImportBudget(
  stats: { triangles: number; vertices: number; meshes: number },
  budget: ImportBudget = DEFAULT_IMPORT_BUDGET,
): BudgetResult {
  const k = (n: number) => `${Math.round(n / 1000)}k`;
  if (stats.triangles > budget.rejectTriangles) {
    return {
      level: 'reject',
      reason: `${k(stats.triangles)} triangles is more than the headset can draw smoothly (limit ${k(budget.rejectTriangles)}). Reduce the mesh in the capture app and export again.`,
    };
  }
  if (stats.triangles > budget.warnTriangles) {
    return {
      level: 'warn',
      reason: `${k(stats.triangles)} triangles is heavy for the headset (comfortable up to ${k(budget.warnTriangles)}). It may lower the frame rate.`,
    };
  }
  return { level: 'ok', reason: `${k(stats.triangles)} triangles` };
}

// --- conversion to LocationScan ---------------------------------------------

export interface ImportMeshPart {
  /** xyz triplets in the part's local space (source units and axes). */
  positions: Float32Array;
  /** Triangle indices, or null for a non-indexed triangle list. */
  indices: Uint32Array | Uint16Array | null;
  /** Column-major local-to-source-root matrix (the node's world matrix), or null for identity. */
  matrix?: ArrayLike<number> | null;
}

export interface BuildLocationOptions {
  convention?: AxisConvention;
  /** Multiplies every coordinate (source unit to meters). */
  unitScale?: number;
  /** Keep source coordinates instead of recentring to the floor and the XZ origin. */
  keepCoordinates?: boolean;
  /** Mesh label for every part; imported meshes are static (not furniture). */
  label?: string;
  id?: string;
  capturedAt?: number;
}

export interface BuiltLocation {
  scan: LocationScan | null;
  /** Why scan is null. */
  error?: string;
  warnings: string[];
  stats: { meshes: number; vertices: number; triangles: number; droppedParts: number };
  /** Source extents before unit scaling, for guessUnitScale. */
  sourceBoundsMin: Vec3;
  sourceBoundsMax: Vec3;
  /**
   * Column-major source-root-to-scene matrix that was applied (recentre * unit
   * scale * convention). The Photo mode renderer applies it to the original
   * file so the textured model lines up with the geometry scan.
   */
  sourceTransform: number[];
}

/** Same caps as the scan codec, so an import can always be stored and exported. */
const MAX_MESHES = 1024;
const MAX_VERTICES_TOTAL = 4_000_000;
const MAX_INDICES_TOTAL = 24_000_000;

export const IMPORTED_MESH_LABEL = 'imported mesh';

/**
 * Converts parsed mesh parts into a LocationScan in scene space: bakes each
 * part's matrix, the axis convention and the unit scale, generates indices for
 * non-indexed geometry, drops invalid triangles, enforces the codec caps, and
 * (unless keepCoordinates) moves the lowest point to y=0 and centres X and Z.
 */
export function buildLocationScanFromParts(parts: readonly ImportMeshPart[], opts: BuildLocationOptions = {}): BuiltLocation {
  const warnings: string[] = [];
  const conv = conventionMatrix(opts.convention ?? 'RUB');
  const unit = opts.unitScale && opts.unitScale > 0 && Number.isFinite(opts.unitScale) ? opts.unitScale : 1;
  const scaleConv = multiplyMat4([unit, 0, 0, 0, 0, unit, 0, 0, 0, 0, unit, 0, 0, 0, 0, 1], conv);
  const srcMin: Vec3 = { x: Infinity, y: Infinity, z: Infinity };
  const srcMax: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity };
  const meshes: ScanMeshData[] = [];
  let droppedParts = 0;
  let vertices = 0;
  let indexCount = 0;
  const empty = (error: string): BuiltLocation => ({
    scan: null,
    error,
    warnings,
    stats: { meshes: 0, vertices: 0, triangles: 0, droppedParts },
    sourceBoundsMin: { x: 0, y: 0, z: 0 },
    sourceBoundsMax: { x: 0, y: 0, z: 0 },
    sourceTransform: conventionMatrix('RUB'),
  });

  for (const part of parts) {
    if (!part || !(part.positions instanceof Float32Array) || part.positions.length < 9) {
      droppedParts++;
      continue;
    }
    const positions = new Float32Array(part.positions.length - (part.positions.length % 3));
    positions.set(part.positions.subarray(0, positions.length));
    if (part.matrix) transformPositions(positions, part.matrix);
    // Source-space bounds (after the node matrix, before convention and units).
    for (let i = 0; i + 2 < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      if (x < srcMin.x) srcMin.x = x;
      if (x > srcMax.x) srcMax.x = x;
      if (y < srcMin.y) srcMin.y = y;
      if (y > srcMax.y) srcMax.y = y;
      if (z < srcMin.z) srcMin.z = z;
      if (z > srcMax.z) srcMax.z = z;
    }
    transformPositions(positions, scaleConv);
    let indices: Uint32Array;
    if (part.indices) {
      indices = part.indices instanceof Uint32Array ? part.indices : Uint32Array.from(part.indices);
    } else {
      const n = positions.length / 3 - ((positions.length / 3) % 3);
      indices = new Uint32Array(n);
      for (let i = 0; i < n; i++) indices[i] = i;
    }
    const clean = sanitizeMeshBuffers(positions, indices);
    if (!clean) {
      droppedParts++;
      continue;
    }
    if (meshes.length >= MAX_MESHES) {
      return empty(`The file has more than ${MAX_MESHES} separate meshes. Merge them in the capture app and export again.`);
    }
    vertices += clean.positions.length / 3;
    indexCount += clean.indices.length;
    if (vertices > MAX_VERTICES_TOTAL || indexCount > MAX_INDICES_TOTAL) {
      return empty('The mesh is too large to store (over 4 million vertices or 8 million triangles).');
    }
    meshes.push({ label: opts.label ?? IMPORTED_MESH_LABEL, positions: clean.positions, indices: clean.indices });
  }

  if (!meshes.length) return empty('The file contains no usable triangles.');
  if (droppedParts) warnings.push(`${droppedParts} part${droppedParts === 1 ? '' : 's'} had no usable triangles and ${droppedParts === 1 ? 'was' : 'were'} skipped.`);

  // Recentre: lowest point to the floor, XZ centre to the origin.
  let recentre = conventionMatrix('RUB');
  if (!opts.keepCoordinates) {
    let minY = Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const m of meshes) {
      const p = m.positions;
      for (let i = 0; i + 2 < p.length; i += 3) {
        if (p[i] < minX) minX = p[i];
        if (p[i] > maxX) maxX = p[i];
        if (p[i + 1] < minY) minY = p[i + 1];
        if (p[i + 2] < minZ) minZ = p[i + 2];
        if (p[i + 2] > maxZ) maxZ = p[i + 2];
      }
    }
    const dx = -(minX + maxX) / 2;
    const dy = -minY;
    const dz = -(minZ + maxZ) / 2;
    recentre = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, dx, dy, dz, 1];
    for (const m of meshes) transformPositions(m.positions, recentre);
  }

  const triangles = indexCount / 3;
  return {
    scan: { version: 1, id: opts.id ?? uid(), capturedAt: opts.capturedAt ?? Date.now(), meshes },
    warnings,
    stats: { meshes: meshes.length, vertices, triangles, droppedParts },
    sourceBoundsMin: srcMin,
    sourceBoundsMax: srcMax,
    sourceTransform: multiplyMat4(recentre, scaleConv),
  };
}

// --- capture-app hints --------------------------------------------------------

/** Capture apps we can recognise from glTF asset.generator or file names. */
export type CaptureApp = 'polycam' | 'scaniverse' | 'kiri' | 'luma' | 'unknown';

/** Best-effort capture-app detection from a glTF generator string and the file name. */
export function detectCaptureApp(generator: string | null | undefined, fileName: string | null | undefined): CaptureApp {
  const s = `${generator ?? ''} ${fileName ?? ''}`.toLowerCase();
  if (s.includes('polycam')) return 'polycam';
  if (s.includes('scaniverse')) return 'scaniverse';
  if (s.includes('kiri')) return 'kiri';
  if (s.includes('luma')) return 'luma';
  return 'unknown';
}

/**
 * Licensing reminder for free-tier captures. A previs tool for paid
 * productions should not imply that a free-tier capture is production-usable.
 */
export function captureLicenseNote(app: CaptureApp): string | null {
  switch (app) {
    case 'scaniverse':
      return 'Scaniverse Free and Plus captures carry no commercial rights. Check the license before using this capture on a paid production.';
    case 'polycam':
      return 'Check your Polycam plan allows commercial use before using this capture on a paid production.';
    case 'kiri':
    case 'luma':
      return 'Check the capture app license allows commercial use before using this capture on a paid production.';
    default:
      return null;
  }
}
