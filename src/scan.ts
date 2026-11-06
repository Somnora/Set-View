// ---------------------------------------------------------------------------
// Location scan data — PURE, no three.js, no DOM. Portable (Unity: a ScanMesh
// struct + static codec class).
//
// A LocationScan is the captured room geometry from the headset's Scene Mesh
// (WebXR mesh-detection): one or more triangle meshes in scene space (meters,
// y-up, y=0 floor — the same space actors and cameras live in). Geometry only;
// the platform never exposes camera texture, so scans are untextured by
// design (rendered as a gray-box set).
//
// Storage strategy: scans are far too large for the localStorage scene JSON,
// so blobs live in IndexedDB keyed by scan id and SceneData carries only a
// small ScanSummary. For file export/import the blob is embedded in the scene
// JSON as base64 of the binary layout below (little-endian throughout):
//
//   u32  format version (1)
//   f64  capturedAt (epoch ms)
//   u32  mesh count
//   per mesh:
//     u32  label byte length, then UTF-8 label bytes
//     u32  position float count (3 × vertices)
//     u8   index width (2 | 4)
//     u32  index count (3 × triangles)
//     f32… positions, then u16|u32… indices
// ---------------------------------------------------------------------------

import { uid, type FurniturePlacement, type ScanSummary, type Vec3 } from './model.ts';
import { rotateXZ, wrapAngle, type RigidDelta } from './registration.ts';

export interface ScanMeshData {
  /** Semantic label from the platform ('global mesh', 'table', 'couch', …),
   *  normalized at capture; older stored scans may carry raw spellings. */
  label: string;
  /** Vertex positions as xyz triplets, scene space, meters. */
  positions: Float32Array;
  /** Triangle vertex indices (3 per triangle). */
  indices: Uint32Array;
}

export interface LocationScan {
  version: 1;
  id: string;
  /** Epoch ms at capture. */
  capturedAt: number;
  meshes: ScanMeshData[];
}

/** Import sanity caps — reject hostile/corrupt files before allocating. */
const MAX_MESHES = 1024;
const MAX_VERTICES_TOTAL = 4_000_000;
const MAX_INDICES_TOTAL = 24_000_000;

/**
 * Applies a column-major 4×4 matrix (three.js `Matrix4.elements` /
 * `XRRigidTransform.matrix` layout) to xyz triplets in place.
 */
export function transformPositions(positions: Float32Array, m: ArrayLike<number>): void {
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    positions[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    positions[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    positions[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
}

/**
 * Sanitizes raw position and index buffers: rejects a mesh with any non-finite
 * coordinate or fewer than 3 vertices, and drops triangles whose indices are
 * out of range or degenerate (repeated vertex). Null when nothing valid is left.
 * Positions are returned as-is (not copied); indices are a new array only when
 * some triangle was dropped. Shared by headset capture and file import.
 */
export function sanitizeMeshBuffers(
  rawPositions: Float32Array,
  rawIndices: Uint32Array,
): { positions: Float32Array; indices: Uint32Array } | null {
  const vertCount = Math.floor(rawPositions.length / 3);
  if (vertCount < 3) return null;
  for (let i = 0; i < rawPositions.length; i++) {
    if (!Number.isFinite(rawPositions[i])) return null;
  }
  const triCount = Math.floor(rawIndices.length / 3);
  const valid = (t: number): boolean => {
    const i0 = rawIndices[t * 3];
    const i1 = rawIndices[t * 3 + 1];
    const i2 = rawIndices[t * 3 + 2];
    return i0 < vertCount && i1 < vertCount && i2 < vertCount && i0 !== i1 && i1 !== i2 && i0 !== i2;
  };
  // Two passes (count, then fill) so large imports never grow a JS number array.
  let kept = 0;
  for (let t = 0; t < triCount; t++) if (valid(t)) kept++;
  if (kept === 0) return null;
  if (kept === triCount && rawIndices.length === triCount * 3) {
    return { positions: rawPositions, indices: rawIndices };
  }
  const indices = new Uint32Array(kept * 3);
  let o = 0;
  for (let t = 0; t < triCount; t++) {
    if (!valid(t)) continue;
    indices[o++] = rawIndices[t * 3];
    indices[o++] = rawIndices[t * 3 + 1];
    indices[o++] = rawIndices[t * 3 + 2];
  }
  return { positions: rawPositions, indices };
}

// --- furniture placement (movable labeled meshes) ---------------------------

/**
 * Marks scan pieces built from WebXR planes, as opposed to Scene Mesh meshes:
 * 'plane:wall', 'plane:door'. Carried in the label rather than a codec field so
 * the scan blob format, file exports and the Unreal importer are unchanged
 * (review R3). Kept for converting a captured room into editable walls later.
 */
export const PLANE_LABEL_PREFIX = 'plane:';

/** The platform's whole-room mesh label (the room shell, never movable). */
export const GLOBAL_MESH_LABEL = 'global mesh';

/** Label for a mesh or plane the platform did not classify (static). */
export const UNLABELED_SCAN_LABEL = 'unlabeled';

/**
 * Platform label spellings folded onto one canonical label. Keys are already
 * lowercased, trimmed, and have '_' / '-' turned into spaces. Quest emits
 * 'wall face', 'door frame', 'window frame', 'invisible wall face' and
 * 'storage'; the synthetic test room uses 'walls'. The exact strings each
 * headset emits are still unconfirmed on device (P0.0 probe).
 */
const SEMANTIC_LABEL_ALIASES: Record<string, string> = {
  'wall face': 'wall',
  walls: 'wall',
  'door frame': 'door',
  'window frame': 'window',
  'invisible wall face': 'window',
  storage: 'shelf',
  sofa: 'couch',
};

/**
 * Canonical form of a platform semantic label: lowercase, trimmed, with known
 * aliases folded ('door frame' to 'door', 'storage' to 'shelf', ...). A missing
 * or blank label becomes 'unlabeled'. Idempotent, so stored scans that still
 * carry raw platform labels can be normalized again on load.
 */
export function normalizeSemanticLabel(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return UNLABELED_SCAN_LABEL;
  // A plane-sourced piece keeps its marker; only the semantic part is normalized.
  if (raw.toLowerCase().startsWith(PLANE_LABEL_PREFIX)) return PLANE_LABEL_PREFIX + normalizeSemanticLabel(raw.slice(PLANE_LABEL_PREFIX.length));
  // Trim last: a leading or trailing '_' / '-' becomes a space first.
  const key = raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!key) return UNLABELED_SCAN_LABEL;
  return SEMANTIC_LABEL_ALIASES[key] ?? key;
}

/**
 * Bounded furniture the user may pick up and re-place. Everything else
 * (floor, ceiling, walls, doors, windows, wall art, the room shell and
 * unlabeled geometry) stays put: grabbing a floor or a wall is never intended.
 */
export const MOVABLE_SCAN_LABELS: ReadonlySet<string> = new Set([
  'table',
  'desk',
  'couch',
  'chair',
  'shelf',
  'bed',
  'screen',
  'lamp',
  'plant',
  'other',
]);

/** True for scan meshes the user can pick up and re-place (Stage 1). A plane
 *  piece is a flat outline, never a grabbable object. */
export function isMovableScanMesh(label: string): boolean {
  const n = normalizeSemanticLabel(label);
  return !isPlaneLabel(n) && MOVABLE_SCAN_LABELS.has(n);
}

// --- plane-sourced pieces (P1.8) ------------------------------------------------

export function isPlaneLabel(label: string): boolean {
  return label.toLowerCase().startsWith(PLANE_LABEL_PREFIX);
}

/** The semantic part of a label ('plane:wall' -> 'wall'). */
export function baseScanLabel(label: string): string {
  return isPlaneLabel(label) ? label.slice(PLANE_LABEL_PREFIX.length) : label;
}

export function planeLabel(semantic: string): string {
  return PLANE_LABEL_PREFIX + normalizeSemanticLabel(semantic);
}

/**
 * Semantic class for a plane the platform left unlabeled (Android XR Chrome
 * reports none): vertical planes are walls; horizontal ones are floor near the
 * floor, ceiling above head height, and a table or counter in between.
 * normalUp is the plane normal's up component in scene space (|n . +Y|).
 */
export function classifyPlane(normalUp: number, heightAboveFloor: number): string {
  if (Math.abs(normalUp) < 0.7) return 'wall';
  if (heightAboveFloor < 0.25) return 'floor';
  if (heightAboveFloor > 1.9) return 'ceiling';
  return 'table';
}

/**
 * Triangulates a simple polygon given as x,z pairs (a WebXR plane polygon in
 * plane space) by ear clipping, so concave outlines (an L-shaped floor, a wall
 * with a notch) triangulate correctly; a fan only works for convex ones.
 * Returns indices into the input vertices. Falls back to a fan for whatever is
 * left if the outline is degenerate or self-intersecting.
 */
export function triangulatePolygon(xz: ArrayLike<number>): Uint32Array {
  const n = Math.floor(xz.length / 2);
  if (n < 3) return new Uint32Array(0);
  const X = (i: number) => xz[i * 2];
  const Z = (i: number) => xz[i * 2 + 1];
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) area += X(j) * Z(i) - X(i) * Z(j);
  // Work counter-clockwise in (x, z); the emitted winding is fixed up below.
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(area >= 0 ? i : n - 1 - i);
  const out: number[] = [];
  const cross = (a: number, b: number, c: number) => (X(b) - X(a)) * (Z(c) - Z(a)) - (Z(b) - Z(a)) * (X(c) - X(a));
  const inside = (p: number, a: number, b: number, c: number) =>
    cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const a = idx[(k + idx.length - 1) % idx.length];
      const b = idx[k];
      const c = idx[(k + 1) % idx.length];
      if (cross(a, b, c) <= 1e-12) continue; // reflex or flat corner
      let ear = true;
      for (const p of idx) {
        if (p === a || p === b || p === c) continue;
        if (inside(p, a, b, c)) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;
      out.push(a, b, c);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // degenerate: fan the rest
  }
  for (let k = 1; k + 1 < idx.length; k++) out.push(idx[0], idx[k], idx[k + 1]);
  // Counter-clockwise in (x, z) faces -y; flip so plane triangles face +y (plane-space up).
  for (let k = 0; k + 2 < out.length; k += 3) {
    const tmp = out[k + 1];
    out[k + 1] = out[k + 2];
    out[k + 2] = tmp;
  }
  return Uint32Array.from(out);
}

// --- floor height ---------------------------------------------------------------

/**
 * Height of the scan's labelled floor in the scan's own space: the lowest
 * vertex of the meshes or planes labelled 'floor'. Null when nothing is
 * labelled floor. Unlabelled geometry is deliberately not used: a depth-built
 * room mesh can hold phantom surfaces below a glossy floor, and treating one
 * as the floor would sink the whole scene.
 */
export function scanFloorY(scan: LocationScan): number | null {
  let min = Infinity;
  for (const m of scan.meshes) {
    // A labelled floor plane counts too: it is the floor surface itself.
    if (baseScanLabel(normalizeSemanticLabel(m.label)) !== 'floor') continue;
    const p = m.positions;
    for (let i = 1; i < p.length; i += 3) if (p[i] < min) min = p[i];
  }
  return Number.isFinite(min) ? min : null;
}

/** Moves every vertex of a scan up by dy meters (in place). */
export function translateScanY(scan: LocationScan, dy: number): void {
  for (const m of scan.meshes) {
    const p = m.positions;
    for (let i = 1; i < p.length; i += 3) p[i] += dy;
  }
}

// --- capture capability -------------------------------------------------------

/** Where Scan Room can read room geometry from. */
export type ScanSource = 'meshes' | 'planes';

export interface ScanCapability {
  canScan: boolean;
  /** Sources capture may read, preferred first. */
  sources: ScanSource[];
  /** Short user-facing line: why scanning is refused, or what it will read. */
  reason: string;
}

/**
 * Whether Scan Room can run in this session. `enabledFeatures` is
 * XRSession.enabledFeatures; `reported` is false when the browser did not
 * expose that list. Unreported features are unknown, not absent, so both
 * sources are tried instead of refusing (capture simply finds nothing and
 * times out if neither exists). Meshes are preferred: Quest Scene Mesh is
 * denser than its planes; planes are the Android XR path.
 */
export function scanCapability(input: { enabledFeatures: readonly string[]; reported: boolean }): ScanCapability {
  if (!input.reported) {
    return { canScan: true, sources: ['meshes', 'planes'], reason: 'features not reported, trying meshes and planes' };
  }
  const sources: ScanSource[] = [];
  if (input.enabledFeatures.includes('mesh-detection')) sources.push('meshes');
  if (input.enabledFeatures.includes('plane-detection')) sources.push('planes');
  if (sources.length === 0) {
    return { canScan: false, sources, reason: 'browser has no mesh or plane detection' };
  }
  const reason =
    sources.length === 2 ? 'room mesh, planes as fallback' : sources[0] === 'meshes' ? 'room mesh' : 'detected planes';
  return { canScan: true, sources, reason };
}

// --- room capture (Space Setup) -----------------------------------------------

/** Why a Space Setup request is refused before the platform is even asked. */
export type RoomCaptureRefusal = 'no-session' | 'unsupported' | 'no-plane-detection' | 'already-used';

/**
 * Pre-flight for XRSession.initiateRoomCapture: the spec allows one call per
 * session, it rejects without plane-detection, and Chrome ships it as a stub
 * that resolves without capturing. Null = a request may be made.
 */
export function roomCaptureRefusal(input: {
  hasSession: boolean;
  /** typeof session.initiateRoomCapture === 'function' */
  hasApi: boolean;
  enabledFeatures: readonly string[];
  /** Already called once in this session. */
  used: boolean;
}): RoomCaptureRefusal | null {
  if (!input.hasSession) return 'no-session';
  if (!input.hasApi) return 'unsupported';
  if (!input.enabledFeatures.includes('plane-detection')) return 'no-plane-detection';
  if (input.used) return 'already-used';
  return null;
}

/**
 * User text for a Space Setup request that did not run: a RoomCaptureRefusal
 * or the DOMException name initiateRoomCapture rejected with. The first ~40
 * characters are what the wrist debug tail shows, so the gist comes first.
 */
export function roomCaptureMessage(errName: string): string {
  switch (errName) {
    case 'NotSupportedError':
    case 'unsupported':
      return 'Space Setup not available here: run it in Quest Settings';
    case 'InvalidStateError':
    case 'already-used':
      return 'Space Setup already used this session: re-enter AR to run it again';
    case 'OperationError':
      return 'Space Setup did not finish: run it in Quest Settings';
    case 'no-plane-detection':
      return 'Space Setup needs plane detection: not granted in this session';
    case 'no-session':
      return 'Space Setup needs an AR session';
    default:
      return `Space Setup failed (${errName || 'unknown error'}): run it in Quest Settings`;
  }
}

/**
 * XZ bounds center of a mesh's vertex positions — the pivot furniture yaws
 * about (y stays 0: furniture slides on the floor plane).
 */
export function meshFootprintCenter(positions: Float32Array): Vec3 {
  if (positions.length < 3) return { x: 0, y: 0, z: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { x: (minX + maxX) / 2, y: 0, z: (minZ + maxZ) / 2 };
}

/**
 * Bakes a rigid move (turn about world up, then translate) into a scan: every
 * position moves, the result gets a new id (the blob store never rewrites a
 * blob under its id, so undo can return to the old one), and furniture
 * placements are rewritten so each moved piece lands exactly where the same
 * move takes it. A placement is relative to its mesh's footprint centre (an
 * axis-aligned box centre, which does not turn with the mesh), so the offset
 * picks up a correction: with R the turn, c and c' the centre before and
 * after, and e = R c + t - c', the new offset is R d + e - Ry(rotY_f) e and the
 * piece's own yaw is unchanged. Input is not mutated.
 */
export function applyRigidToScan(
  scan: LocationScan,
  furniture: readonly FurniturePlacement[] | undefined,
  d: RigidDelta,
): { scan: LocationScan; furniture: FurniturePlacement[] | undefined } {
  const c = Math.cos(d.rotY);
  const s = Math.sin(d.rotY);
  const meshes = scan.meshes.map((m) => {
    const p = new Float32Array(m.positions.length);
    for (let i = 0; i + 2 < m.positions.length; i += 3) {
      const x = m.positions[i];
      const z = m.positions[i + 2];
      p[i] = x * c + z * s + d.dx;
      p[i + 1] = m.positions[i + 1] + d.dy;
      p[i + 2] = -x * s + z * c + d.dz;
    }
    return { label: m.label, positions: p, indices: m.indices };
  });
  let placed: FurniturePlacement[] | undefined;
  if (furniture && furniture.length) {
    placed = [];
    for (const f of furniture) {
      const before = scan.meshes[f.meshIndex];
      const after = meshes[f.meshIndex];
      if (!before || !after) continue;
      const c0 = meshFootprintCenter(before.positions);
      const c1 = meshFootprintCenter(after.positions);
      const rc = rotateXZ(d.rotY, c0.x, c0.z);
      const ex = rc.x + d.dx - c1.x;
      const ez = rc.z + d.dz - c1.z;
      const rd = rotateXZ(d.rotY, f.dx, f.dz);
      const re = rotateXZ(f.rotY, ex, ez);
      placed.push({ meshIndex: f.meshIndex, dx: rd.x + ex - re.x, dz: rd.z + ez - re.z, rotY: wrapAngle(f.rotY) });
    }
  }
  return { scan: { version: 1, id: uid(), capturedAt: scan.capturedAt, meshes }, furniture: placed };
}

/**
 * Yaw (radians about +Y, 0 = +Z — the app-wide heading convention) of a
 * quaternion, by projecting its rotated forward onto the floor plane. Robust
 * for furniture (mostly-yaw rotations); a degenerate vertical forward → 0.
 */
export function quatYaw(x: number, y: number, z: number, w: number): number {
  // q * (0,0,1), then heading of the XZ projection.
  const fx = 2 * (x * z + w * y);
  const fz = 1 - 2 * (x * x + y * y);
  if (fx * fx + fz * fz < 1e-12) return 0;
  return Math.atan2(fx, fz);
}

/** Structural check for a scan object (e.g. read back from IndexedDB). */
export function isLocationScan(v: unknown): v is LocationScan {
  const s = v as LocationScan;
  return (
    !!s &&
    typeof s === 'object' &&
    s.version === 1 &&
    typeof s.id === 'string' &&
    typeof s.capturedAt === 'number' &&
    Array.isArray(s.meshes) &&
    s.meshes.every(
      (m) =>
        !!m &&
        typeof m.label === 'string' &&
        m.positions instanceof Float32Array &&
        m.positions.length % 3 === 0 &&
        m.indices instanceof Uint32Array &&
        m.indices.length % 3 === 0,
    )
  );
}

/** Counts + bounds for a scan, in the compact form SceneData embeds. */
export function summarizeScan(scan: LocationScan): ScanSummary {
  let vertices = 0;
  let triangles = 0;
  const min: Vec3 = { x: Infinity, y: Infinity, z: Infinity };
  const max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const m of scan.meshes) {
    vertices += m.positions.length / 3;
    triangles += m.indices.length / 3;
    const p = m.positions;
    for (let i = 0; i + 2 < p.length; i += 3) {
      if (p[i] < min.x) min.x = p[i];
      if (p[i] > max.x) max.x = p[i];
      if (p[i + 1] < min.y) min.y = p[i + 1];
      if (p[i + 1] > max.y) max.y = p[i + 1];
      if (p[i + 2] < min.z) min.z = p[i + 2];
      if (p[i + 2] > max.z) max.z = p[i + 2];
    }
  }
  if (vertices === 0) {
    min.x = min.y = min.z = 0;
    max.x = max.y = max.z = 0;
  }
  return {
    id: scan.id,
    capturedAt: scan.capturedAt,
    vertices,
    triangles,
    boundsMin: min,
    boundsMax: max,
  };
}

// --- base64 (pure — no btoa/atob so the codec ports verbatim) ---------------

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Int8Array(128).fill(-1);
  for (let i = 0; i < B64_CHARS.length; i++) t[B64_CHARS.charCodeAt(i)] = i;
  return t;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    chunk +=
      B64_CHARS[b0 >> 2] +
      B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)] +
      (i + 1 < bytes.length ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=') +
      (i + 2 < bytes.length ? B64_CHARS[b2 & 63] : '=');
    if (chunk.length >= 0x8000) {
      parts.push(chunk);
      chunk = '';
    }
  }
  parts.push(chunk);
  return parts.join('');
}

/** Returns null on any non-base64 input (bad charset / bad length). */
export function base64ToBytes(s: string): Uint8Array | null {
  let len = s.length;
  while (len > 0 && s[len - 1] === '=') len--;
  if (s.length % 4 !== 0 || len % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let o = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < len; i++) {
    const c = s.charCodeAt(i);
    const v = c < 128 ? B64_LOOKUP[c] : -1;
    if (v < 0) return null;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

// --- binary codec ------------------------------------------------------------

/** Serializes a scan to base64 for embedding in exported scene JSON. */
export function encodeScan(scan: LocationScan): string {
  const enc = new TextEncoder();
  const labels = scan.meshes.map((m) => enc.encode(m.label));
  let size = 4 + 8 + 4;
  for (let i = 0; i < scan.meshes.length; i++) {
    const m = scan.meshes[i];
    const wide = m.positions.length / 3 > 0xffff;
    size += 4 + labels[i].length + 4 + 1 + 4 + m.positions.length * 4 + m.indices.length * (wide ? 4 : 2);
  }
  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let o = 0;
  view.setUint32(o, 1, true);
  o += 4;
  view.setFloat64(o, scan.capturedAt, true);
  o += 8;
  view.setUint32(o, scan.meshes.length, true);
  o += 4;
  for (let i = 0; i < scan.meshes.length; i++) {
    const m = scan.meshes[i];
    const wide = m.positions.length / 3 > 0xffff;
    view.setUint32(o, labels[i].length, true);
    o += 4;
    bytes.set(labels[i], o);
    o += labels[i].length;
    view.setUint32(o, m.positions.length, true);
    o += 4;
    view.setUint8(o, wide ? 4 : 2);
    o += 1;
    view.setUint32(o, m.indices.length, true);
    o += 4;
    for (let k = 0; k < m.positions.length; k++, o += 4) view.setFloat32(o, m.positions[k], true);
    if (wide) {
      for (let k = 0; k < m.indices.length; k++, o += 4) view.setUint32(o, m.indices[k], true);
    } else {
      for (let k = 0; k < m.indices.length; k++, o += 2) view.setUint16(o, m.indices[k], true);
    }
  }
  return bytesToBase64(bytes);
}

/**
 * Decodes a base64 scan blob. Deep-validated (caps, index ranges, finite
 * positions) so a malformed import can't crash the renderer or OOM the
 * headset; returns null on anything suspect. The scan gets a FRESH id — an
 * import must never collide with an existing stored blob.
 */
export function decodeScan(b64: string): LocationScan | null {
  const bytes = base64ToBytes(b64);
  if (!bytes || bytes.length < 16) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  try {
    let o = 0;
    const version = view.getUint32(o, true);
    o += 4;
    if (version !== 1) return null;
    const capturedAt = view.getFloat64(o, true);
    o += 8;
    if (!Number.isFinite(capturedAt)) return null;
    const meshCount = view.getUint32(o, true);
    o += 4;
    if (meshCount > MAX_MESHES) return null;
    let totalVerts = 0;
    let totalIdx = 0;
    const meshes: ScanMeshData[] = [];
    for (let i = 0; i < meshCount; i++) {
      const labelLen = view.getUint32(o, true);
      o += 4;
      if (o + labelLen > bytes.length) return null;
      const label = dec.decode(bytes.subarray(o, o + labelLen));
      o += labelLen;
      const posCount = view.getUint32(o, true);
      o += 4;
      const idxWidth = view.getUint8(o);
      o += 1;
      const idxCount = view.getUint32(o, true);
      o += 4;
      if (posCount % 3 !== 0 || idxCount % 3 !== 0) return null;
      if ((idxWidth !== 2 && idxWidth !== 4) || o + posCount * 4 + idxCount * idxWidth > bytes.length) return null;
      totalVerts += posCount / 3;
      totalIdx += idxCount;
      if (totalVerts > MAX_VERTICES_TOTAL || totalIdx > MAX_INDICES_TOTAL) return null;
      const positions = new Float32Array(posCount);
      for (let k = 0; k < posCount; k++, o += 4) {
        positions[k] = view.getFloat32(o, true);
        if (!Number.isFinite(positions[k])) return null;
      }
      const vertexCount = posCount / 3;
      const indices = new Uint32Array(idxCount);
      if (idxWidth === 4) {
        for (let k = 0; k < idxCount; k++, o += 4) indices[k] = view.getUint32(o, true);
      } else {
        for (let k = 0; k < idxCount; k++, o += 2) indices[k] = view.getUint16(o, true);
      }
      for (let k = 0; k < idxCount; k++) if (indices[k] >= vertexCount) return null;
      meshes.push({ label, positions, indices });
    }
    if (o !== bytes.length) return null; // trailing garbage
    return { version: 1, id: uid(), capturedAt, meshes };
  } catch {
    return null;
  }
}
