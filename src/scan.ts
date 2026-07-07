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

import { uid, type ScanSummary, type Vec3 } from './model.ts';

export interface ScanMeshData {
  /** Semantic label from the platform ('global mesh', 'table', 'couch', …). */
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
