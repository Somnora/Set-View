// ---------------------------------------------------------------------------
// Pure Domain Engine: 3D Gaussian Splatting & Spatial Floorplan Alignment
//
// ZERO Three.js and ZERO DOM dependencies: pure data and deterministic math.
// Manages:
//   - 3D Gaussian Splat representation (position, scale, rotation, color, opacity)
//   - Binary & ASCII Gaussian PLY parser and exporter (.ply)
//   - Compact 32-byte binary splat parser and exporter (.splat)
//   - RANSAC horizontal plane detection (floor and ceiling extraction)
//   - Architectural wall fitting from photogrammetry splat clouds
//   - Spatial floorplan auto-alignment (rotation, translation, and scale fitting)
//   - Spatial voxel downsampling for Meta Quest 3 72fps mobile LOD budgets
//   - Synthetic scout scan cloud generation for offline testing and pre-viz
// ---------------------------------------------------------------------------

import type { Vec3, Quat } from './model.ts';
import {
  type ArchitecturalSet,
  type WallData,
  createArchitecturalSet,
  createWallData,
  normalizeArchitecturalSet,
} from './architecture.ts';

/**
 * Single 3D Gaussian Splat representation.
 */
export interface GaussianSplat {
  /** Center position in scene space (meters). */
  position: Vec3;
  /** 3D covariance principal radii / standard deviations along local axes (meters). */
  scale: Vec3;
  /** Orientation quaternion (x, y, z, w). */
  rotation: Quat;
  /** Base RGB color [0.0, 1.0]. */
  color: {
    r: number;
    g: number;
    b: number;
  };
  /** Opacity [0.0, 1.0]. */
  opacity: number;
  /** Optional spherical harmonics coefficients (DC or higher orders). */
  sphericalHarmonics?: number[];
}

/**
 * 3D Gaussian Splat Cloud scene data container.
 */
export interface GaussianCloudData {
  id: string;
  name: string;
  splatCount: number;
  bounds: {
    min: Vec3;
    max: Vec3;
  };
  splats: GaussianSplat[];
  /** Spatial transformation in scene space. */
  transform: {
    position: Vec3;
    rotation: Quat;
    scale: number;
  };
  /** Optional floor and cardinal alignment calibration metadata. */
  floorAlignment?: {
    floorHeightY: number;
    northAngleRad: number;
    originOffset: Vec3;
  };
}

/**
 * Result of RANSAC plane fitting on splat point coordinates.
 * Plane equation: normal.x * x + normal.y * y + normal.z * z + d = 0.
 */
export interface PlaneRansacResult {
  /** Centroid point on the plane. */
  point: Vec3;
  /** Unit normal vector of the plane. */
  normal: Vec3;
  /** Number of splat centers within distance threshold. */
  inlierCount: number;
  /** Plane equation coefficient d such that dot(normal, p) + d = 0. */
  d: number;
}

/**
 * Result of aligning a 3D Gaussian Splat Cloud to an architectural floorplan.
 */
export interface SplatAlignmentResult {
  /** Calculated transformation to align the splat cloud to the room set. */
  alignedTransform: {
    position: Vec3;
    rotation: Quat;
    scale: number;
  };
  /** Alignment confidence score [0.0, 1.0]. */
  confidenceScore: number;
  /** Detected floor elevation in original splat cloud coordinates. */
  floorHeightY: number;
  /** Optional walls extracted from vertical splat clusters. */
  extractedWalls?: WallData[];
}

// --- Helper Utilities ---

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `splat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Constant for spherical harmonics DC term to linear RGB conversion. */
const SH_C0 = 0.28209479177387814;

/**
 * Calculates the axis-aligned bounding box of a collection of splats.
 */
export function calculateCloudBoundingBox(splats: GaussianSplat[]): { min: Vec3; max: Vec3 } {
  if (splats.length === 0) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < splats.length; i++) {
    const p = splats[i].position;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (p.z > maxZ) maxZ = p.z;
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

/**
 * Creates a new empty GaussianCloudData container.
 */
export function createGaussianCloud(id?: string, name?: string): GaussianCloudData {
  return {
    id: id || uid(),
    name: name || 'Scout Splat Cloud',
    splatCount: 0,
    bounds: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
    },
    splats: [],
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: 1.0,
    },
  };
}

/**
 * Creates a GaussianCloudData object with an optional name and initial splats.
 */
export function createGaussianSplatCloud(name?: string, splats: GaussianSplat[] = []): GaussianCloudData {
  const bounds = calculateCloudBoundingBox(splats);
  return {
    id: uid(),
    name: name || 'Scout Splat Cloud',
    splatCount: splats.length,
    bounds,
    splats,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: 1.0,
    },
  };
}

/**
 * Type guard for GaussianSplat.
 */
export function isGaussianSplat(raw: unknown): raw is GaussianSplat {
  if (!raw || typeof raw !== 'object') return false;
  const s = raw as Record<string, unknown>;

  const hasPos =
    s.position &&
    typeof s.position === 'object' &&
    isFiniteNum((s.position as Vec3).x) &&
    isFiniteNum((s.position as Vec3).y) &&
    isFiniteNum((s.position as Vec3).z);

  const hasScale =
    s.scale &&
    typeof s.scale === 'object' &&
    isFiniteNum((s.scale as Vec3).x) &&
    isFiniteNum((s.scale as Vec3).y) &&
    isFiniteNum((s.scale as Vec3).z);

  const hasRot =
    s.rotation &&
    typeof s.rotation === 'object' &&
    isFiniteNum((s.rotation as Quat).x) &&
    isFiniteNum((s.rotation as Quat).y) &&
    isFiniteNum((s.rotation as Quat).z) &&
    isFiniteNum((s.rotation as Quat).w);

  const hasColor =
    s.color &&
    typeof s.color === 'object' &&
    isFiniteNum((s.color as { r: number }).r) &&
    isFiniteNum((s.color as { g: number }).g) &&
    isFiniteNum((s.color as { b: number }).b);

  const hasOpacity = isFiniteNum(s.opacity);

  return Boolean(hasPos && hasScale && hasRot && hasColor && hasOpacity);
}

/**
 * Type guard for GaussianCloudData.
 */
export function isGaussianCloud(raw: unknown): raw is GaussianCloudData {
  if (!raw || typeof raw !== 'object') return false;
  const c = raw as Record<string, unknown>;

  const hasId = typeof c.id === 'string' && c.id.length > 0;
  const hasName = typeof c.name === 'string';
  const hasCount = typeof c.splatCount === 'number';
  const hasSplats = Array.isArray(c.splats);
  const hasBounds =
    c.bounds &&
    typeof c.bounds === 'object' &&
    (c.bounds as Record<string, unknown>).min &&
    (c.bounds as Record<string, unknown>).max;
  const hasTransform =
    c.transform &&
    typeof c.transform === 'object' &&
    (c.transform as Record<string, unknown>).position &&
    (c.transform as Record<string, unknown>).rotation &&
    typeof (c.transform as Record<string, unknown>).scale === 'number';

  return Boolean(hasId && hasName && hasCount && hasSplats && hasBounds && hasTransform);
}

export const isGaussianCloudData = isGaussianCloud;

/**
 * Sanitizes and normalizes a GaussianCloudData object.
 */
export function normalizeGaussianCloud(raw: unknown): GaussianCloudData {
  if (!raw || typeof raw !== 'object') {
    return createGaussianCloud();
  }

  const c = raw as Partial<GaussianCloudData>;
  const id = typeof c.id === 'string' && c.id.length > 0 ? c.id : uid();
  const name = typeof c.name === 'string' && c.name.length > 0 ? c.name : 'Scout Splat Cloud';

  const splats: GaussianSplat[] = [];
  if (Array.isArray(c.splats)) {
    for (let i = 0; i < c.splats.length; i++) {
      const s = c.splats[i] as any;
      if (s && typeof s === 'object') {
        const pos = s.position && typeof s.position === 'object' ? s.position : {};
        const scale = s.scale && typeof s.scale === 'object' ? s.scale : {};
        const rot = s.rotation && typeof s.rotation === 'object' ? s.rotation : {};
        const col = s.color && typeof s.color === 'object' ? s.color : {};

        let qx = isFiniteNum(rot.x) ? rot.x : 0;
        let qy = isFiniteNum(rot.y) ? rot.y : 0;
        let qz = isFiniteNum(rot.z) ? rot.z : 0;
        let qw = isFiniteNum(rot.w) ? rot.w : 1;
        const qNorm = Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
        if (qNorm > 1e-6) {
          qx /= qNorm;
          qy /= qNorm;
          qz /= qNorm;
          qw /= qNorm;
        } else {
          qx = 0;
          qy = 0;
          qz = 0;
          qw = 1;
        }

        splats.push({
          position: {
            x: isFiniteNum(pos.x) ? pos.x : 0,
            y: isFiniteNum(pos.y) ? pos.y : 0,
            z: isFiniteNum(pos.z) ? pos.z : 0,
          },
          scale: {
            x: isFiniteNum(scale.x) && scale.x > 0 ? scale.x : 0.05,
            y: isFiniteNum(scale.y) && scale.y > 0 ? scale.y : 0.05,
            z: isFiniteNum(scale.z) && scale.z > 0 ? scale.z : 0.05,
          },
          rotation: {
            x: qx,
            y: qy,
            z: qz,
            w: qw,
          },
          color: {
            r: clamp(isFiniteNum(col.r) ? col.r : 0.8, 0, 1),
            g: clamp(isFiniteNum(col.g) ? col.g : 0.8, 0, 1),
            b: clamp(isFiniteNum(col.b) ? col.b : 0.8, 0, 1),
          },
          opacity: clamp(isFiniteNum(s.opacity) ? s.opacity : 1.0, 0, 1),
          sphericalHarmonics: Array.isArray(s.sphericalHarmonics)
            ? s.sphericalHarmonics.filter(isFiniteNum)
            : undefined,
        });
      }
    }
  }

  const bounds = calculateCloudBoundingBox(splats);

  const transform = {
    position: {
      x: isFiniteNum(c.transform?.position?.x) ? c.transform!.position.x : 0,
      y: isFiniteNum(c.transform?.position?.y) ? c.transform!.position.y : 0,
      z: isFiniteNum(c.transform?.position?.z) ? c.transform!.position.z : 0,
    },
    rotation: {
      x: isFiniteNum(c.transform?.rotation?.x) ? c.transform!.rotation.x : 0,
      y: isFiniteNum(c.transform?.rotation?.y) ? c.transform!.rotation.y : 0,
      z: isFiniteNum(c.transform?.rotation?.z) ? c.transform!.rotation.z : 0,
      w: isFiniteNum(c.transform?.rotation?.w) ? c.transform!.rotation.w : 1,
    },
    scale: isFiniteNum(c.transform?.scale) && c.transform!.scale > 0 ? c.transform!.scale : 1.0,
  };

  let floorAlignment: GaussianCloudData['floorAlignment'];
  if (c.floorAlignment && typeof c.floorAlignment === 'object') {
    floorAlignment = {
      floorHeightY: isFiniteNum(c.floorAlignment.floorHeightY) ? c.floorAlignment.floorHeightY : 0,
      northAngleRad: isFiniteNum(c.floorAlignment.northAngleRad) ? c.floorAlignment.northAngleRad : 0,
      originOffset: {
        x: isFiniteNum(c.floorAlignment.originOffset?.x) ? c.floorAlignment.originOffset.x : 0,
        y: isFiniteNum(c.floorAlignment.originOffset?.y) ? c.floorAlignment.originOffset.y : 0,
        z: isFiniteNum(c.floorAlignment.originOffset?.z) ? c.floorAlignment.originOffset.z : 0,
      },
    };
  }

  return {
    id,
    name,
    splatCount: splats.length,
    bounds,
    splats,
    transform,
    floorAlignment,
  };
}

// --- PLY Parser & Exporter ---

interface PlyProperty {
  name: string;
  type: string;
  byteOffset: number;
}

/**
 * Parses binary or ASCII Gaussian Splat PLY file buffer or text into a GaussianCloudData object.
 */
export function parseGaussianPly(buffer: ArrayBuffer | Uint8Array | string): GaussianCloudData {
  let bytes: Uint8Array;
  if (typeof buffer === 'string') {
    bytes = new TextEncoder().encode(buffer);
  } else if (buffer instanceof Uint8Array) {
    bytes = buffer;
  } else {
    bytes = new Uint8Array(buffer);
  }
  const textDecoder = new TextDecoder('ascii');

  // Search for end_header
  let headerText = '';
  let headerEndByteIndex = 0;

  // Header is usually within the first 4KB
  const searchLimit = Math.min(bytes.length, 8192);
  let searchStr = '';
  for (let i = 0; i < searchLimit; i++) {
    searchStr += String.fromCharCode(bytes[i]);
    if (searchStr.endsWith('end_header\n') || searchStr.endsWith('end_header\r\n')) {
      headerText = searchStr;
      headerEndByteIndex = i + 1;
      break;
    }
  }

  if (!headerText) {
    // If not found in 8KB, search entire buffer
    const fullText = textDecoder.decode(bytes);
    const endHeaderMatch = fullText.indexOf('end_header');
    if (endHeaderMatch === -1) {
      throw new Error('Invalid PLY: Missing end_header token');
    }
    const lineEnd = fullText.indexOf('\n', endHeaderMatch);
    headerEndByteIndex = lineEnd !== -1 ? lineEnd + 1 : endHeaderMatch + 10;
    headerText = fullText.slice(0, headerEndByteIndex);
  }

  const lines = headerText.split(/\r?\n/);
  if (lines.length === 0 || lines[0].trim() !== 'ply') {
    throw new Error('Invalid PLY: Missing initial "ply" signature');
  }

  let format = 'ascii';
  let vertexCount = 0;
  const properties: PlyProperty[] = [];
  let currentOffset = 0;
  let inVertexElement = false;

  for (const line of lines) {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length === 0) continue;

    if (tokens[0] === 'format') {
      format = tokens[1];
    } else if (tokens[0] === 'element') {
      if (tokens[1] === 'vertex') {
        inVertexElement = true;
        vertexCount = parseInt(tokens[2], 10) || 0;
      } else {
        inVertexElement = false;
      }
    } else if (tokens[0] === 'property' && inVertexElement) {
      const propType = tokens[1];
      const propName = tokens[2];
      properties.push({
        name: propName,
        type: propType,
        byteOffset: currentOffset,
      });

      // Type size calculation for binary
      let typeSize = 4;
      if (propType === 'float' || propType === 'float32' || propType === 'int' || propType === 'uint' || propType === 'int32' || propType === 'uint32') {
        typeSize = 4;
      } else if (propType === 'double' || propType === 'float64') {
        typeSize = 8;
      } else if (propType === 'uchar' || propType === 'uint8' || propType === 'char' || propType === 'int8') {
        typeSize = 1;
      } else if (propType === 'short' || propType === 'uint16' || propType === 'int16') {
        typeSize = 2;
      }
      currentOffset += typeSize;
    }
  }

  const stride = currentOffset;
  const propMap = new Map<string, PlyProperty>();
  for (const p of properties) {
    propMap.set(p.name, p);
  }

  const splats: GaussianSplat[] = [];

  if (format === 'binary_little_endian' || format === 'binary_big_endian') {
    const littleEndian = format === 'binary_little_endian';
    const dataView = new DataView(bytes.buffer, bytes.byteOffset + headerEndByteIndex);

    const xProp = propMap.get('x');
    const yProp = propMap.get('y');
    const zProp = propMap.get('z');

    const fdc0Prop = propMap.get('f_dc_0') || propMap.get('red');
    const fdc1Prop = propMap.get('f_dc_1') || propMap.get('green');
    const fdc2Prop = propMap.get('f_dc_2') || propMap.get('blue');

    const opacityProp = propMap.get('opacity');
    const scale0Prop = propMap.get('scale_0');
    const scale1Prop = propMap.get('scale_1');
    const scale2Prop = propMap.get('scale_2');

    const rot0Prop = propMap.get('rot_0');
    const rot1Prop = propMap.get('rot_1');
    const rot2Prop = propMap.get('rot_2');
    const rot3Prop = propMap.get('rot_3');

    const readVal = (offset: number, type: string): number => {
      if (offset + 1 > dataView.byteLength) return 0;
      if (type === 'float' || type === 'float32') {
        return dataView.getFloat32(offset, littleEndian);
      } else if (type === 'double' || type === 'float64') {
        return dataView.getFloat64(offset, littleEndian);
      } else if (type === 'uchar' || type === 'uint8') {
        return dataView.getUint8(offset);
      } else if (type === 'char' || type === 'int8') {
        return dataView.getInt8(offset);
      } else if (type === 'short' || type === 'int16') {
        return dataView.getInt16(offset, littleEndian);
      } else if (type === 'ushort' || type === 'uint16') {
        return dataView.getUint16(offset, littleEndian);
      } else if (type === 'int' || type === 'int32') {
        return dataView.getInt32(offset, littleEndian);
      } else if (type === 'uint' || type === 'uint32') {
        return dataView.getUint32(offset, littleEndian);
      }
      return dataView.getFloat32(offset, littleEndian);
    };

    const maxSplats = Math.min(vertexCount, Math.floor(dataView.byteLength / stride));

    for (let i = 0; i < maxSplats; i++) {
      const base = i * stride;

      const px = xProp ? readVal(base + xProp.byteOffset, xProp.type) : 0;
      const py = yProp ? readVal(base + yProp.byteOffset, yProp.type) : 0;
      const pz = zProp ? readVal(base + zProp.byteOffset, zProp.type) : 0;

      // Colors: handle f_dc SH vs uint8/float RGB
      let r = 0.8;
      let g = 0.8;
      let b = 0.8;

      if (fdc0Prop && fdc1Prop && fdc2Prop) {
        const raw0 = readVal(base + fdc0Prop.byteOffset, fdc0Prop.type);
        const raw1 = readVal(base + fdc1Prop.byteOffset, fdc1Prop.type);
        const raw2 = readVal(base + fdc2Prop.byteOffset, fdc2Prop.type);

        if (fdc0Prop.name.startsWith('f_dc')) {
          // Standard Inria 3DGS Spherical Harmonics DC component
          r = clamp(0.5 + SH_C0 * raw0, 0, 1);
          g = clamp(0.5 + SH_C0 * raw1, 0, 1);
          b = clamp(0.5 + SH_C0 * raw2, 0, 1);
        } else if (fdc0Prop.type === 'uchar' || fdc0Prop.type === 'uint8') {
          r = raw0 / 255;
          g = raw1 / 255;
          b = raw2 / 255;
        } else {
          r = raw0 > 1.0 ? raw0 / 255 : raw0;
          g = raw1 > 1.0 ? raw1 / 255 : raw1;
          b = raw2 > 1.0 ? raw2 / 255 : raw2;
        }
      }

      // Opacity: logit vs direct
      let opacity = 1.0;
      if (opacityProp) {
        const rawOp = readVal(base + opacityProp.byteOffset, opacityProp.type);
        if (opacityProp.type === 'uchar' || opacityProp.type === 'uint8') {
          opacity = rawOp / 255;
        } else if (rawOp < 0 || rawOp > 1.0) {
          // Inria 3DGS stores unactivated logits: sigmoid(rawOp)
          opacity = 1 / (1 + Math.exp(-rawOp));
        } else {
          opacity = rawOp;
        }
      }

      // Scale: log scale vs direct scale
      let sx = 0.05;
      let sy = 0.05;
      let sz = 0.05;
      if (scale0Prop && scale1Prop && scale2Prop) {
        const rawSx = readVal(base + scale0Prop.byteOffset, scale0Prop.type);
        const rawSy = readVal(base + scale1Prop.byteOffset, scale1Prop.type);
        const rawSz = readVal(base + scale2Prop.byteOffset, scale2Prop.type);

        // Inria 3DGS stores log-scale
        sx = Math.exp(rawSx);
        sy = Math.exp(rawSy);
        sz = Math.exp(rawSz);

        // Fallback guard against extreme non-finite values
        if (!Number.isFinite(sx) || sx <= 0 || sx > 50) sx = 0.05;
        if (!Number.isFinite(sy) || sy <= 0 || sy > 50) sy = 0.05;
        if (!Number.isFinite(sz) || sz <= 0 || sz > 50) sz = 0.05;
      }

      // Rotation quaternion
      let qx = 0;
      let qy = 0;
      let qz = 0;
      let qw = 1;
      if (rot0Prop && rot1Prop && rot2Prop && rot3Prop) {
        // Inria 3DGS convention: rot_0 = w, rot_1 = x, rot_2 = y, rot_3 = z
        const rw = readVal(base + rot0Prop.byteOffset, rot0Prop.type);
        const rx = readVal(base + rot1Prop.byteOffset, rot1Prop.type);
        const ry = readVal(base + rot2Prop.byteOffset, rot2Prop.type);
        const rz = readVal(base + rot3Prop.byteOffset, rot3Prop.type);

        const len = Math.hypot(rw, rx, ry, rz);
        if (len > 0.0001) {
          qw = rw / len;
          qx = rx / len;
          qy = ry / len;
          qz = rz / len;
        }
      }

      splats.push({
        position: { x: px, y: py, z: pz },
        scale: { x: sx, y: sy, z: sz },
        rotation: { x: qx, y: qy, z: qz, w: qw },
        color: { r, g, b },
        opacity: clamp(opacity, 0, 1),
      });
    }
  } else {
    // ASCII parsing
    const bodyText = textDecoder.decode(bytes.subarray(headerEndByteIndex));
    const bodyLines = bodyText.trim().split(/\r?\n/);

    const xIdx = properties.findIndex((p) => p.name === 'x');
    const yIdx = properties.findIndex((p) => p.name === 'y');
    const zIdx = properties.findIndex((p) => p.name === 'z');
    const fdc0Idx = properties.findIndex((p) => p.name === 'f_dc_0' || p.name === 'red');
    const fdc1Idx = properties.findIndex((p) => p.name === 'f_dc_1' || p.name === 'green');
    const fdc2Idx = properties.findIndex((p) => p.name === 'f_dc_2' || p.name === 'blue');
    const opIdx = properties.findIndex((p) => p.name === 'opacity');
    const sc0Idx = properties.findIndex((p) => p.name === 'scale_0');
    const sc1Idx = properties.findIndex((p) => p.name === 'scale_1');
    const sc2Idx = properties.findIndex((p) => p.name === 'scale_2');
    const r0Idx = properties.findIndex((p) => p.name === 'rot_0');
    const r1Idx = properties.findIndex((p) => p.name === 'rot_1');
    const r2Idx = properties.findIndex((p) => p.name === 'rot_2');
    const r3Idx = properties.findIndex((p) => p.name === 'rot_3');

    for (let i = 0; i < bodyLines.length && splats.length < vertexCount; i++) {
      const tokens = bodyLines[i].trim().split(/\s+/);
      if (tokens.length < properties.length) continue;

      const px = xIdx >= 0 ? parseFloat(tokens[xIdx]) || 0 : 0;
      const py = yIdx >= 0 ? parseFloat(tokens[yIdx]) || 0 : 0;
      const pz = zIdx >= 0 ? parseFloat(tokens[zIdx]) || 0 : 0;

      let r = 0.8;
      let g = 0.8;
      let b = 0.8;
      if (fdc0Idx >= 0 && fdc1Idx >= 0 && fdc2Idx >= 0) {
        const raw0 = parseFloat(tokens[fdc0Idx]) || 0;
        const raw1 = parseFloat(tokens[fdc1Idx]) || 0;
        const raw2 = parseFloat(tokens[fdc2Idx]) || 0;
        if (properties[fdc0Idx].name.startsWith('f_dc')) {
          r = clamp(0.5 + SH_C0 * raw0, 0, 1);
          g = clamp(0.5 + SH_C0 * raw1, 0, 1);
          b = clamp(0.5 + SH_C0 * raw2, 0, 1);
        } else {
          r = raw0 > 1.0 ? raw0 / 255 : raw0;
          g = raw1 > 1.0 ? raw1 / 255 : raw1;
          b = raw2 > 1.0 ? raw2 / 255 : raw2;
        }
      }

      let opacity = 1.0;
      if (opIdx >= 0) {
        const rawOp = parseFloat(tokens[opIdx]) || 0;
        if (rawOp < 0 || rawOp > 1.0) {
          opacity = 1 / (1 + Math.exp(-rawOp));
        } else {
          opacity = rawOp;
        }
      }

      let sx = 0.05;
      let sy = 0.05;
      let sz = 0.05;
      if (sc0Idx >= 0 && sc1Idx >= 0 && sc2Idx >= 0) {
        sx = Math.exp(parseFloat(tokens[sc0Idx]) || 0);
        sy = Math.exp(parseFloat(tokens[sc1Idx]) || 0);
        sz = Math.exp(parseFloat(tokens[sc2Idx]) || 0);
        if (!Number.isFinite(sx) || sx <= 0 || sx > 50) sx = 0.05;
        if (!Number.isFinite(sy) || sy <= 0 || sy > 50) sy = 0.05;
        if (!Number.isFinite(sz) || sz <= 0 || sz > 50) sz = 0.05;
      }

      let qw = 1;
      let qx = 0;
      let qy = 0;
      let qz = 0;
      if (r0Idx >= 0 && r1Idx >= 0 && r2Idx >= 0 && r3Idx >= 0) {
        const rw = parseFloat(tokens[r0Idx]) || 1;
        const rx = parseFloat(tokens[r1Idx]) || 0;
        const ry = parseFloat(tokens[r2Idx]) || 0;
        const rz = parseFloat(tokens[r3Idx]) || 0;
        const len = Math.hypot(rw, rx, ry, rz);
        if (len > 0.0001) {
          qw = rw / len;
          qx = rx / len;
          qy = ry / len;
          qz = rz / len;
        }
      }

      splats.push({
        position: { x: px, y: py, z: pz },
        scale: { x: sx, y: sy, z: sz },
        rotation: { x: qx, y: qy, z: qz, w: qw },
        color: { r, g, b },
        opacity: clamp(opacity, 0, 1),
      });
    }
  }

  const bounds = calculateCloudBoundingBox(splats);
  return {
    id: uid(),
    name: 'Imported Splat Cloud',
    splatCount: splats.length,
    bounds,
    splats,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: 1.0,
    },
  };
}

/**
 * Exports a GaussianCloudData to standard 3DGS PLY format (Binary Uint8Array or ASCII string).
 */
export function exportGaussianPly(cloud: GaussianCloudData, binary: boolean = true): Uint8Array | string {
  const count = cloud.splats.length;

  if (!binary) {
    let ascii = 'ply\n';
    ascii += 'format ascii 1.0\n';
    ascii += `element vertex ${count}\n`;
    ascii += 'property float x\n';
    ascii += 'property float y\n';
    ascii += 'property float z\n';
    ascii += 'property float f_dc_0\n';
    ascii += 'property float f_dc_1\n';
    ascii += 'property float f_dc_2\n';
    ascii += 'property float opacity\n';
    ascii += 'property float scale_0\n';
    ascii += 'property float scale_1\n';
    ascii += 'property float scale_2\n';
    ascii += 'property float rot_0\n';
    ascii += 'property float rot_1\n';
    ascii += 'property float rot_2\n';
    ascii += 'property float rot_3\n';
    ascii += 'end_header\n';

    for (let i = 0; i < count; i++) {
      const s = cloud.splats[i];
      const fdc0 = (s.color.r - 0.5) / SH_C0;
      const fdc1 = (s.color.g - 0.5) / SH_C0;
      const fdc2 = (s.color.b - 0.5) / SH_C0;
      const safeOp = clamp(s.opacity, 0.0001, 0.9999);
      const rawOp = Math.log(safeOp / (1 - safeOp));
      const logSx = Math.log(Math.max(0.0001, s.scale.x));
      const logSy = Math.log(Math.max(0.0001, s.scale.y));
      const logSz = Math.log(Math.max(0.0001, s.scale.z));
      const rw = s.rotation.w;
      const rx = s.rotation.x;
      const ry = s.rotation.y;
      const rz = s.rotation.z;

      ascii += `${s.position.x.toFixed(5)} ${s.position.y.toFixed(5)} ${s.position.z.toFixed(5)} ${fdc0.toFixed(5)} ${fdc1.toFixed(5)} ${fdc2.toFixed(5)} ${rawOp.toFixed(5)} ${logSx.toFixed(5)} ${logSy.toFixed(5)} ${logSz.toFixed(5)} ${rw.toFixed(5)} ${rx.toFixed(5)} ${ry.toFixed(5)} ${rz.toFixed(5)}\n`;
    }

    return ascii;
  }

  // Binary little-endian export
  const header =
    'ply\n' +
    'format binary_little_endian 1.0\n' +
    `element vertex ${count}\n` +
    'property float x\n' +
    'property float y\n' +
    'property float z\n' +
    'property float f_dc_0\n' +
    'property float f_dc_1\n' +
    'property float f_dc_2\n' +
    'property float opacity\n' +
    'property float scale_0\n' +
    'property float scale_1\n' +
    'property float scale_2\n' +
    'property float rot_0\n' +
    'property float rot_1\n' +
    'property float rot_2\n' +
    'property float rot_3\n' +
    'end_header\n';

  const headerBytes = new TextEncoder().encode(header);
  const vertexStride = 14 * 4; // 14 float32 values = 56 bytes per vertex
  const totalLength = headerBytes.length + count * vertexStride;
  const outBuffer = new Uint8Array(totalLength);

  outBuffer.set(headerBytes, 0);
  const dataView = new DataView(outBuffer.buffer, headerBytes.length);

  for (let i = 0; i < count; i++) {
    const s = cloud.splats[i];
    const offset = i * vertexStride;

    dataView.setFloat32(offset, s.position.x, true);
    dataView.setFloat32(offset + 4, s.position.y, true);
    dataView.setFloat32(offset + 8, s.position.z, true);

    const fdc0 = (s.color.r - 0.5) / SH_C0;
    const fdc1 = (s.color.g - 0.5) / SH_C0;
    const fdc2 = (s.color.b - 0.5) / SH_C0;
    dataView.setFloat32(offset + 12, fdc0, true);
    dataView.setFloat32(offset + 16, fdc1, true);
    dataView.setFloat32(offset + 20, fdc2, true);

    const safeOp = clamp(s.opacity, 0.0001, 0.9999);
    const rawOp = Math.log(safeOp / (1 - safeOp));
    dataView.setFloat32(offset + 24, rawOp, true);

    dataView.setFloat32(offset + 28, Math.log(Math.max(0.0001, s.scale.x)), true);
    dataView.setFloat32(offset + 32, Math.log(Math.max(0.0001, s.scale.y)), true);
    dataView.setFloat32(offset + 36, Math.log(Math.max(0.0001, s.scale.z)), true);

    dataView.setFloat32(offset + 40, s.rotation.w, true);
    dataView.setFloat32(offset + 44, s.rotation.x, true);
    dataView.setFloat32(offset + 48, s.rotation.y, true);
    dataView.setFloat32(offset + 52, s.rotation.z, true);
  }

  return outBuffer;
}

// --- Compact .splat 32-Byte Format Parser & Exporter ---

/**
 * Parses a 32-byte per splat binary buffer (.splat format).
 * Layout:
 *   position: 3 x float32 (12 bytes)
 *   scale:    3 x float32 (12 bytes)
 *   color:    4 x uint8 (RGBA, 4 bytes)
 *   rotation: 4 x uint8 (quat quantized (q*128)+128, 4 bytes)
 */
export function parseCompactSplat(buffer: ArrayBuffer | Uint8Array): GaussianCloudData {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length % 32 !== 0) {
    throw new Error(`Invalid .splat buffer length (${bytes.length} bytes): must be a multiple of 32 bytes`);
  }
  const splatCount = Math.floor(bytes.length / 32);
  const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);

  const splats: GaussianSplat[] = [];

  for (let i = 0; i < splatCount; i++) {
    const base = i * 32;

    const px = dataView.getFloat32(base, true);
    const py = dataView.getFloat32(base + 4, true);
    const pz = dataView.getFloat32(base + 8, true);

    const sx = dataView.getFloat32(base + 12, true);
    const sy = dataView.getFloat32(base + 16, true);
    const sz = dataView.getFloat32(base + 20, true);

    const r = dataView.getUint8(base + 24) / 255;
    const g = dataView.getUint8(base + 25) / 255;
    const b = dataView.getUint8(base + 26) / 255;
    const a = dataView.getUint8(base + 27) / 255;

    const rx = (dataView.getUint8(base + 28) - 128) / 128;
    const ry = (dataView.getUint8(base + 29) - 128) / 128;
    const rz = (dataView.getUint8(base + 30) - 128) / 128;
    const rw = (dataView.getUint8(base + 31) - 128) / 128;

    const len = Math.hypot(rw, rx, ry, rz);
    const qx = len > 0.0001 ? rx / len : 0;
    const qy = len > 0.0001 ? ry / len : 0;
    const qz = len > 0.0001 ? rz / len : 0;
    const qw = len > 0.0001 ? rw / len : 1;

    splats.push({
      position: { x: px, y: py, z: pz },
      scale: {
        x: Number.isFinite(sx) && sx > 0 ? sx : 0.05,
        y: Number.isFinite(sy) && sy > 0 ? sy : 0.05,
        z: Number.isFinite(sz) && sz > 0 ? sz : 0.05,
      },
      rotation: { x: qx, y: qy, z: qz, w: qw },
      color: { r, g, b },
      opacity: a,
    });
  }

  const bounds = calculateCloudBoundingBox(splats);
  return {
    id: uid(),
    name: 'Imported Compact Splat',
    splatCount: splats.length,
    bounds,
    splats,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: 1.0,
    },
  };
}

/**
 * Exports a GaussianCloudData to standard 32-byte per splat binary buffer (.splat format).
 */
export function exportCompactSplat(cloud: GaussianCloudData): Uint8Array {
  const count = cloud.splats.length;
  const out = new Uint8Array(count * 32);
  const dataView = new DataView(out.buffer);

  for (let i = 0; i < count; i++) {
    const s = cloud.splats[i];
    const base = i * 32;

    dataView.setFloat32(base, s.position.x, true);
    dataView.setFloat32(base + 4, s.position.y, true);
    dataView.setFloat32(base + 8, s.position.z, true);

    dataView.setFloat32(base + 12, s.scale.x, true);
    dataView.setFloat32(base + 16, s.scale.y, true);
    dataView.setFloat32(base + 20, s.scale.z, true);

    dataView.setUint8(base + 24, Math.round(clamp(s.color.r * 255, 0, 255)));
    dataView.setUint8(base + 25, Math.round(clamp(s.color.g * 255, 0, 255)));
    dataView.setUint8(base + 26, Math.round(clamp(s.color.b * 255, 0, 255)));
    dataView.setUint8(base + 27, Math.round(clamp(s.opacity * 255, 0, 255)));

    dataView.setUint8(base + 28, Math.round(clamp(s.rotation.x * 128 + 128, 0, 255)));
    dataView.setUint8(base + 29, Math.round(clamp(s.rotation.y * 128 + 128, 0, 255)));
    dataView.setUint8(base + 30, Math.round(clamp(s.rotation.z * 128 + 128, 0, 255)));
    dataView.setUint8(base + 31, Math.round(clamp(s.rotation.w * 128 + 128, 0, 255)));
  }

  return out;
}

// --- Spatial Voxel Downsampling (Meta Quest 3 72fps mobile LOD) ---

/**
 * Downsamples a splat collection using a 3D spatial voxel grid.
 * Clusters splats falling into the same spatial voxel cell to meet mobile frame rate budgets.
 */
export function voxelDownsampleSplats(splats: GaussianSplat[], voxelSizeM: number): GaussianSplat[] {
  if (splats.length === 0 || voxelSizeM <= 0) return [...splats];

  const invVoxel = 1.0 / voxelSizeM;

  interface VoxelAccumulator {
    count: number;
    posX: number;
    posY: number;
    posZ: number;
    scaleX: number;
    scaleY: number;
    scaleZ: number;
    rotX: number;
    rotY: number;
    rotZ: number;
    rotW: number;
    colorR: number;
    colorG: number;
    colorB: number;
    opacity: number;
  }

  const grid = new Map<number, VoxelAccumulator>();

  for (let i = 0; i < splats.length; i++) {
    const s = splats[i];
    const vx = (Math.floor(s.position.x * invVoxel) + 2048) & 0xfff;
    const vy = (Math.floor(s.position.y * invVoxel) + 2048) & 0xfff;
    const vz = (Math.floor(s.position.z * invVoxel) + 128) & 0xff;
    const key = vx | (vy << 12) | (vz << 24);

    let cell = grid.get(key);
    if (!cell) {
      cell = {
        count: 0,
        posX: 0,
        posY: 0,
        posZ: 0,
        scaleX: 0,
        scaleY: 0,
        scaleZ: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        rotW: 0,
        colorR: 0,
        colorG: 0,
        colorB: 0,
        opacity: 0,
      };
      grid.set(key, cell);
    }

    cell.count += 1;
    cell.posX += s.position.x;
    cell.posY += s.position.y;
    cell.posZ += s.position.z;
    cell.scaleX += s.scale.x;
    cell.scaleY += s.scale.y;
    cell.scaleZ += s.scale.z;

    // Align quaternion hemisphere for smooth averaging
    const dot = cell.rotX * s.rotation.x + cell.rotY * s.rotation.y + cell.rotZ * s.rotation.z + cell.rotW * s.rotation.w;
    const sign = dot < 0 ? -1 : 1;
    cell.rotX += s.rotation.x * sign;
    cell.rotY += s.rotation.y * sign;
    cell.rotZ += s.rotation.z * sign;
    cell.rotW += s.rotation.w * sign;

    cell.colorR += s.color.r;
    cell.colorG += s.color.g;
    cell.colorB += s.color.b;
    cell.opacity += s.opacity;
  }

  const downsampled: GaussianSplat[] = [];
  for (const cell of grid.values()) {
    const invN = 1.0 / cell.count;
    const qLen = Math.hypot(cell.rotX, cell.rotY, cell.rotZ, cell.rotW);

    downsampled.push({
      position: {
        x: cell.posX * invN,
        y: cell.posY * invN,
        z: cell.posZ * invN,
      },
      scale: {
        x: (cell.scaleX * invN) * Math.min(1.5, Math.pow(cell.count, 0.33)),
        y: (cell.scaleY * invN) * Math.min(1.5, Math.pow(cell.count, 0.33)),
        z: (cell.scaleZ * invN) * Math.min(1.5, Math.pow(cell.count, 0.33)),
      },
      rotation: {
        x: qLen > 0.0001 ? cell.rotX / qLen : 0,
        y: qLen > 0.0001 ? cell.rotY / qLen : 0,
        z: qLen > 0.0001 ? cell.rotZ / qLen : 0,
        w: qLen > 0.0001 ? cell.rotW / qLen : 1,
      },
      color: {
        r: clamp(cell.colorR * invN, 0, 1),
        g: clamp(cell.colorG * invN, 0, 1),
        b: clamp(cell.colorB * invN, 0, 1),
      },
      opacity: clamp(cell.opacity * invN, 0, 1),
    });
  }

  return downsampled;
}

// --- RANSAC Plane Detection ---

/**
 * Fits a 3D plane to a collection of 3D points using RANSAC.
 * Given 3 random points p1, p2, p3, computes normal = normalize((p2 - p1) x (p3 - p1)),
 * d = -dot(normal, p1). Counts inliers within distanceThreshold.
 * Iterates maxIterations times and returns the best PlaneRansacResult, or null if points.length < 3.
 */
export function fitPlaneRansac(
  points: Vec3[],
  maxIterations: number = 200,
  distanceThreshold: number = 0.05,
): PlaneRansacResult | null {
  if (points.length < 3) return null;

  let bestInliers = 0;
  let bestNormal: Vec3 = { x: 0, y: 1, z: 0 };
  let bestPoint: Vec3 = { x: 0, y: 0, z: 0 };
  let bestD = 0;

  const n = points.length;
  const iters = Math.min(maxIterations, 500);

  for (let iter = 0; iter < iters; iter++) {
    const i1 = Math.floor(Math.random() * n);
    let i2 = Math.floor(Math.random() * n);
    let i3 = Math.floor(Math.random() * n);
    if (i1 === i2 || i2 === i3 || i1 === i3) continue;

    const p1 = points[i1];
    const p2 = points[i2];
    const p3 = points[i3];

    // Vector v1 = p2 - p1, v2 = p3 - p1
    const v1x = p2.x - p1.x;
    const v1y = p2.y - p1.y;
    const v1z = p2.z - p1.z;

    const v2x = p3.x - p1.x;
    const v2y = p3.y - p1.y;
    const v2z = p3.z - p1.z;

    // Cross product: normal = v1 x v2
    const nx = v1y * v2z - v1z * v2y;
    const ny = v1z * v2x - v1x * v2z;
    const nz = v1x * v2y - v1y * v2x;

    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-6) continue;

    const invLen = 1 / len;
    let normX = nx * invLen;
    let normY = ny * invLen;
    let normZ = nz * invLen;

    // Enforce canonical orientation (positive Y if horizontal)
    if (normY < 0) {
      normX = -normX;
      normY = -normY;
      normZ = -normZ;
    }

    const d = -(normX * p1.x + normY * p1.y + normZ * p1.z);

    const sampleStep = n > 2000 ? Math.ceil(n / 2000) : 1;
    let inliers = 0;
    for (let j = 0; j < n; j += sampleStep) {
      const p = points[j];
      const dist = Math.abs(normX * p.x + normY * p.y + normZ * p.z + d);
      if (dist <= distanceThreshold) {
        inliers++;
      }
    }

    if (inliers > bestInliers) {
      bestInliers = inliers;
      bestNormal = { x: normX, y: normY, z: normZ };
      bestPoint = { x: p1.x, y: p1.y, z: p1.z };
      bestD = d;
    }
  }

  if (bestInliers < 3) return null;

  // Single pass full evaluation on the winning plane if subsampled
  if (n > 2000) {
    let exactInliers = 0;
    for (let j = 0; j < n; j++) {
      const p = points[j];
      const dist = Math.abs(bestNormal.x * p.x + bestNormal.y * p.y + bestNormal.z * p.z + bestD);
      if (dist <= distanceThreshold) {
        exactInliers++;
      }
    }
    bestInliers = exactInliers;
  }

  return {
    point: bestPoint,
    normal: bestNormal,
    inlierCount: bestInliers,
    d: bestD,
  };
}

/**
 * Detects horizontal planes (floor and ceiling) in a 3D Gaussian splat cloud using RANSAC.
 */
export function detectHorizontalPlanes(
  splats: GaussianSplat[],
  sampleCount: number = 2000,
  thresholdM: number = 0.08,
): { floorPlane: PlaneRansacResult; ceilingPlane?: PlaneRansacResult } {
  if (splats.length === 0) {
    const fallbackPlane: PlaneRansacResult = {
      point: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 1, z: 0 },
      inlierCount: 0,
      d: 0,
    };
    return { floorPlane: fallbackPlane };
  }

  const step = Math.max(1, Math.floor(splats.length / sampleCount));
  const pool: Vec3[] = [];
  for (let i = 0; i < splats.length; i += step) {
    pool.push(splats[i].position);
  }

  // Group candidate horizontal planes by elevation Y
  const yBuckets = new Map<number, number[]>(); // rounded Y -> splat indices
  const bucketSize = 0.05; // 5cm buckets

  for (let i = 0; i < pool.length; i++) {
    const key = Math.round(pool[i].y / bucketSize);
    let arr = yBuckets.get(key);
    if (!arr) {
      arr = [];
      yBuckets.set(key, arr);
    }
    arr.push(i);
  }

  // Find candidate peaks
  interface PlanePeak {
    y: number;
    inlierCount: number;
  }

  const peaks: PlanePeak[] = [];
  for (const [key] of yBuckets.entries()) {
    const centerNormY = key * bucketSize;
    let count = 0;
    for (let i = 0; i < pool.length; i++) {
      if (Math.abs(pool[i].y - centerNormY) <= thresholdM) {
        count++;
      }
    }
    if (count > pool.length * 0.02) {
      peaks.push({ y: centerNormY, inlierCount: count });
    }
  }

  peaks.sort((a, b) => b.inlierCount - a.inlierCount);

  if (peaks.length === 0) {
    // Fallback: estimate from lowest points
    let minY = Infinity;
    for (const p of pool) {
      if (p.y < minY) minY = p.y;
    }
    const floorY = Number.isFinite(minY) ? minY : 0;
    return {
      floorPlane: {
        point: { x: 0, y: floorY, z: 0 },
        normal: { x: 0, y: 1, z: 0 },
        inlierCount: pool.length,
        d: -floorY,
      },
    };
  }

  // Lowest prominent horizontal peak is the floor
  let floorPeak = peaks[0];
  for (const pk of peaks) {
    if (pk.y < floorPeak.y && pk.inlierCount >= floorPeak.inlierCount * 0.4) {
      floorPeak = pk;
    }
  }

  // Refine floor plane with exact inlier centroid
  let floorSumY = 0;
  let floorCount = 0;
  for (const p of pool) {
    if (Math.abs(p.y - floorPeak.y) <= thresholdM) {
      floorSumY += p.y;
      floorCount++;
    }
  }
  const refinedFloorY = floorCount > 0 ? floorSumY / floorCount : floorPeak.y;

  const floorPlane: PlaneRansacResult = {
    point: { x: 0, y: refinedFloorY, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
    inlierCount: floorCount,
    d: -refinedFloorY,
  };

  // Check for ceiling peak (above floor by at least 2.0 meters)
  let ceilingPlane: PlaneRansacResult | undefined;
  const ceilingCandidates = peaks.filter((p) => p.y >= refinedFloorY + 2.0 && p.y <= refinedFloorY + 6.0);

  if (ceilingCandidates.length > 0) {
    ceilingCandidates.sort((a, b) => b.inlierCount - a.inlierCount);
    const ceilPeak = ceilingCandidates[0];

    let ceilSumY = 0;
    let ceilCount = 0;
    for (const p of pool) {
      if (Math.abs(p.y - ceilPeak.y) <= thresholdM) {
        ceilSumY += p.y;
        ceilCount++;
      }
    }
    const refinedCeilY = ceilCount > 0 ? ceilSumY / ceilCount : ceilPeak.y;

    ceilingPlane = {
      point: { x: 0, y: refinedCeilY, z: 0 },
      normal: { x: 0, y: -1, z: 0 },
      inlierCount: ceilCount,
      d: refinedCeilY,
    };
  }

  return { floorPlane, ceilingPlane };
}

// --- Architectural Wall Extraction & RANSAC Wall Fitting ---

/**
 * Fits architectural floor, ceiling, and vertical wall planes from a splat cloud.
 */
export function fitArchitecturalPlanesFromSplats(
  cloud: GaussianCloudData,
  maxPlanes: number = 8,
): ArchitecturalSet {
  const floorSet = createArchitecturalSet(cloud.name ? `${cloud.name} Architecture` : 'Scout Architecture');
  if (cloud.splats.length === 0) return floorSet;

  const { floorPlane, ceilingPlane } = detectHorizontalPlanes(cloud.splats);
  const floorY = floorPlane.point.y;
  const ceilingHeightM = ceilingPlane ? Math.abs(ceilingPlane.point.y - floorY) : 2.8;
  floorSet.ceilingHeightM = ceilingHeightM;

  // Filter out floor and ceiling splats to isolate vertical walls
  const wallCandidates = cloud.splats.filter((s) => {
    const dyFloor = Math.abs(s.position.y - floorY);
    const dyCeil = ceilingPlane ? Math.abs(s.position.y - ceilingPlane.point.y) : Infinity;
    return dyFloor > 0.2 && dyCeil > 0.2;
  });

  if (wallCandidates.length < 20) {
    // Generate default bounding perimeter walls if insufficient vertical points
    const bounds = cloud.bounds;
    const minX = bounds.min.x;
    const maxX = bounds.max.x;
    const minZ = bounds.min.z;
    const maxZ = bounds.max.z;

    const walls: WallData[] = [
      createWallData({
        name: 'North Wall',
        start: { x: minX, y: 0, z: minZ },
        end: { x: maxX, y: 0, z: minZ },
        heightM: ceilingHeightM,
      }),
      createWallData({
        name: 'East Wall',
        start: { x: maxX, y: 0, z: minZ },
        end: { x: maxX, y: 0, z: maxZ },
        heightM: ceilingHeightM,
      }),
      createWallData({
        name: 'South Wall',
        start: { x: maxX, y: 0, z: maxZ },
        end: { x: minX, y: 0, z: maxZ },
        heightM: ceilingHeightM,
      }),
      createWallData({
        name: 'West Wall',
        start: { x: minX, y: 0, z: maxZ },
        end: { x: minX, y: 0, z: minZ },
        heightM: ceilingHeightM,
      }),
    ];

    floorSet.walls = walls;
    return floorSet;
  }

  // 2D RANSAC in XZ plane to detect wall line segments
  const remainingPoints = wallCandidates.map((s) => ({ x: s.position.x, z: s.position.z }));
  const distanceThreshold = 0.12; // 12cm tolerance for wall thickness
  const minInliers = Math.max(15, Math.floor(wallCandidates.length * 0.05));

  const detectedWalls: WallData[] = [];

  for (let planeIdx = 0; planeIdx < maxPlanes && remainingPoints.length > minInliers; planeIdx++) {
    let bestInliers: number[] = [];
    let bestLine = { a: 0, b: 1, c: 0 }; // ax + bz + c = 0 with a^2 + b^2 = 1

    const iters = Math.min(200, remainingPoints.length * 2);

    for (let it = 0; it < iters; it++) {
      const idx1 = Math.floor(Math.random() * remainingPoints.length);
      let idx2 = Math.floor(Math.random() * remainingPoints.length);
      if (idx1 === idx2) continue;

      const p1 = remainingPoints[idx1];
      const p2 = remainingPoints[idx2];
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.4) continue; // Skip near-identical points

      // Line normal (a, b) perpendicular to (dx, dz)
      const a = -dz / len;
      const b = dx / len;
      const c = -(a * p1.x + b * p1.z);

      const inliers: number[] = [];
      for (let i = 0; i < remainingPoints.length; i++) {
        const pt = remainingPoints[i];
        const dist = Math.abs(a * pt.x + b * pt.z + c);
        if (dist <= distanceThreshold) {
          inliers.push(i);
        }
      }

      if (inliers.length > bestInliers.length) {
        bestInliers = inliers;
        bestLine = { a, b, c };
      }
    }

    if (bestInliers.length < minInliers) break;

    // Project inliers along line direction to find start and end
    const dirX = bestLine.b;
    const dirZ = -bestLine.a;

    let minT = Infinity;
    let maxT = -Infinity;

    for (const inlierIdx of bestInliers) {
      const pt = remainingPoints[inlierIdx];
      // Nearest point on line
      const dist = bestLine.a * pt.x + bestLine.b * pt.z + bestLine.c;
      const projX = pt.x - bestLine.a * dist;
      const projZ = pt.z - bestLine.b * dist;

      const t = projX * dirX + projZ * dirZ;
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;
    }

    if (maxT - minT >= 0.5) {
      // Find origin on line
      const lineDist = bestLine.c;
      const originX = -bestLine.a * lineDist;
      const originZ = -bestLine.b * lineDist;

      const startX = originX + dirX * minT;
      const startZ = originZ + dirZ * minT;
      const endX = originX + dirX * maxT;
      const endZ = originZ + dirZ * maxT;

      const wall = createWallData({
        name: `Wall ${planeIdx + 1}`,
        start: { x: startX, y: 0, z: startZ },
        end: { x: endX, y: 0, z: endZ },
        heightM: ceilingHeightM,
        thicknessM: 0.15,
        finish: 'painted_drywall',
        tintHex: '#f1f5f9',
      });

      detectedWalls.push(wall);
    }

    // Remove inliers from remaining points pool
    const inlierSet = new Set(bestInliers);
    const nextPoints = [];
    for (let i = 0; i < remainingPoints.length; i++) {
      if (!inlierSet.has(i)) {
        nextPoints.push(remainingPoints[i]);
      }
    }
    remainingPoints.length = 0;
    remainingPoints.push(...nextPoints);
  }

  floorSet.walls = detectedWalls;
  return normalizeArchitecturalSet(floorSet);
}

// --- Floorplan Alignment Solver ---

/**
 * Automatically computes translation, yaw rotation, and scale to align a 3D Gaussian Splat Cloud
 * to a SetView architectural room layout.
 */
export function alignSplatCloudToFloorplan(
  cloud: GaussianCloudData,
  floorplan?: ArchitecturalSet,
): SplatAlignmentResult {
  if (cloud.splats.length === 0) {
    return {
      alignedTransform: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: 1.0,
      },
      confidenceScore: 0.0,
      floorHeightY: 0,
    };
  }

  // Step 1: Detect floor elevation in splat cloud
  const { floorPlane } = detectHorizontalPlanes(cloud.splats);
  const splatFloorY = floorPlane.point.y;

  // Translation in Y grounds the cloud at Y = 0 (SetView floor standard)
  const translateY = -splatFloorY;

  // Step 2: Calculate 2D centroid of splats and floorplan
  const cloudBounds = cloud.bounds;
  const splatCenter = {
    x: (cloudBounds.min.x + cloudBounds.max.x) / 2,
    z: (cloudBounds.min.z + cloudBounds.max.z) / 2,
  };

  let floorplanCenter = { x: 0, z: 0 };
  if (floorplan && Array.isArray(floorplan.walls) && floorplan.walls.length > 0) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const w of floorplan.walls) {
      if (w.start.x < minX) minX = w.start.x;
      if (w.end.x < minX) minX = w.end.x;
      if (w.start.x > maxX) maxX = w.start.x;
      if (w.end.x > maxX) maxX = w.end.x;

      if (w.start.z < minZ) minZ = w.start.z;
      if (w.end.z < minZ) minZ = w.end.z;
      if (w.start.z > maxZ) maxZ = w.start.z;
      if (w.end.z > maxZ) maxZ = w.end.z;
    }

    if (Number.isFinite(minX) && Number.isFinite(maxX)) {
      floorplanCenter = {
        x: (minX + maxX) / 2,
        z: (minZ + maxZ) / 2,
      };
    }
  }

  // Step 3: Extract walls from splat cloud for orientation matching
  const extractedArch = fitArchitecturalPlanesFromSplats(cloud, 6);
  const extractedWalls = extractedArch.walls;

  // Step 4: Find principal wall orientation angle in splat cloud vs floorplan
  let bestYawRad = 0;
  let maxConfidence = 0.75;

  if (extractedWalls.length > 0 && floorplan && Array.isArray(floorplan.walls) && floorplan.walls.length > 0) {
    // Collect wall angles
    const getAngles = (walls: WallData[]) =>
      walls.map((w) => {
        const dx = w.end.x - w.start.x;
        const dz = w.end.z - w.start.z;
        let angle = Math.atan2(dz, dx);
        if (angle < 0) angle += Math.PI;
        return angle % (Math.PI / 2); // 90-degree periodic
      });

    const splatAngles = getAngles(extractedWalls);
    const floorplanAngles = getAngles(floorplan.walls);

    if (splatAngles.length > 0 && floorplanAngles.length > 0) {
      const avgSplatAngle = splatAngles.reduce((a, b) => a + b, 0) / splatAngles.length;
      const avgFpAngle = floorplanAngles.reduce((a, b) => a + b, 0) / floorplanAngles.length;

      const deltaAngle = avgFpAngle - avgSplatAngle;
      bestYawRad = deltaAngle;
      maxConfidence = 0.85;
    }
  }

  // Compute translation X and Z: align centers
  const cosYaw = Math.cos(bestYawRad);
  const sinYaw = Math.sin(bestYawRad);

  // Rotate splatCenter by yaw
  const rotCenterX = splatCenter.x * cosYaw - splatCenter.z * sinYaw;
  const rotCenterZ = splatCenter.x * sinYaw + splatCenter.z * cosYaw;

  const translateX = floorplanCenter.x - rotCenterX;
  const translateZ = floorplanCenter.z - rotCenterZ;

  // Orientation quaternion for yaw rotation around +Y
  const halfYaw = bestYawRad / 2;
  const rotQuat: Quat = {
    x: 0,
    y: Math.sin(halfYaw),
    z: 0,
    w: Math.cos(halfYaw),
  };

  return {
    alignedTransform: {
      position: { x: translateX, y: translateY, z: translateZ },
      rotation: rotQuat,
      scale: 1.0,
    },
    confidenceScore: maxConfidence,
    floorHeightY: splatFloorY,
    extractedWalls,
  };
}

// --- Synthetic Scout Splat Cloud Generator (Test & Offline Pre-Viz) ---

/**
 * Generates a photorealistic synthetic 3D Gaussian Splat room scout reconstruction.
 * Useful for automated tests, offline previews, and mock XR stage blocking.
 */
export function generateSyntheticScoutSplatCloud(
  sceneName: string = 'Studio Stage Scout',
  splatCount: number = 3000,
): GaussianCloudData {
  const splats: GaussianSplat[] = [];

  const roomWidth = 6.0; // X: -3 to +3
  const roomLength = 5.0; // Z: -2.5 to +2.5
  const roomHeight = 2.8; // Y: 0 to 2.8

  const floorBudget = Math.floor(splatCount * 0.35);
  const wallBudget = Math.floor(splatCount * 0.45);
  const ceilingBudget = Math.floor(splatCount * 0.1);
  const furnitureBudget = splatCount - floorBudget - wallBudget - ceilingBudget;

  // 1. Floor Splats (wood plank / concrete stage texture)
  for (let i = 0; i < floorBudget; i++) {
    const x = (Math.random() - 0.5) * roomWidth;
    const z = (Math.random() - 0.5) * roomLength;
    const y = (Math.random() - 0.5) * 0.02; // Floor around y = 0

    // Parquet / wooden stage warm color variation
    const woodGrain = Math.sin(x * 12.0) * 0.05 + Math.cos(z * 4.0) * 0.03;
    const r = clamp(0.55 + woodGrain + (Math.random() - 0.5) * 0.05, 0, 1);
    const g = clamp(0.38 + woodGrain * 0.8 + (Math.random() - 0.5) * 0.05, 0, 1);
    const b = clamp(0.24 + woodGrain * 0.5 + (Math.random() - 0.5) * 0.04, 0, 1);

    splats.push({
      position: { x, y, z },
      scale: {
        x: 0.04 + Math.random() * 0.03,
        y: 0.01 + Math.random() * 0.01,
        z: 0.08 + Math.random() * 0.05,
      },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      color: { r, g, b },
      opacity: 0.85 + Math.random() * 0.15,
    });
  }

  // 2. Perimeter Wall Splats (North, East, South, West)
  const perWall = Math.floor(wallBudget / 4);
  const wallConfigs = [
    { side: 'north', z: -roomLength / 2, xMin: -roomWidth / 2, xMax: roomWidth / 2, tint: { r: 0.82, g: 0.84, b: 0.86 } },
    { side: 'south', z: roomLength / 2, xMin: -roomWidth / 2, xMax: roomWidth / 2, tint: { r: 0.80, g: 0.82, b: 0.85 } },
    { side: 'east', x: roomWidth / 2, zMin: -roomLength / 2, zMax: roomLength / 2, tint: { r: 0.78, g: 0.80, b: 0.82 } },
    { side: 'west', x: -roomWidth / 2, zMin: -roomLength / 2, zMax: roomLength / 2, tint: { r: 0.85, g: 0.87, b: 0.89 } },
  ];

  for (const w of wallConfigs) {
    for (let i = 0; i < perWall; i++) {
      const y = Math.random() * roomHeight;
      let x = 0;
      let z = 0;

      if (w.side === 'north' || w.side === 'south') {
        x = w.xMin! + Math.random() * (w.xMax! - w.xMin!);
        z = w.z! + (Math.random() - 0.5) * 0.03;
      } else {
        z = w.zMin! + Math.random() * (w.zMax! - w.zMin!);
        x = w.x! + (Math.random() - 0.5) * 0.03;
      }

      const plasterNoise = (Math.random() - 0.5) * 0.06;
      splats.push({
        position: { x, y, z },
        scale: {
          x: 0.05 + Math.random() * 0.03,
          y: 0.05 + Math.random() * 0.03,
          z: 0.02 + Math.random() * 0.01,
        },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        color: {
          r: clamp(w.tint.r + plasterNoise, 0, 1),
          g: clamp(w.tint.g + plasterNoise, 0, 1),
          b: clamp(w.tint.b + plasterNoise, 0, 1),
        },
        opacity: 0.9 + Math.random() * 0.1,
      });
    }
  }

  // 3. Ceiling Splats (Light fixtures, acoustic baffles)
  for (let i = 0; i < ceilingBudget; i++) {
    const x = (Math.random() - 0.5) * roomWidth;
    const z = (Math.random() - 0.5) * roomLength;
    const y = roomHeight + (Math.random() - 0.5) * 0.03;

    splats.push({
      position: { x, y, z },
      scale: {
        x: 0.06 + Math.random() * 0.04,
        y: 0.02 + Math.random() * 0.01,
        z: 0.06 + Math.random() * 0.04,
      },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      color: { r: 0.92, g: 0.92, b: 0.94 },
      opacity: 0.85,
    });
  }

  // 4. Interior Furniture Splats (Director Chair & Apple Box Set Piece)
  const chairCenter = { x: -0.8, y: 0.45, z: -0.5 };
  const appleBoxCenter = { x: 1.2, y: 0.2, z: 0.6 };

  const perProp = Math.floor(furnitureBudget / 2);

  // Director's Chair (Dark canvas and wooden frame)
  for (let i = 0; i < perProp; i++) {
    const x = chairCenter.x + (Math.random() - 0.5) * 0.6;
    const y = chairCenter.y + (Math.random() - 0.5) * 0.8;
    const z = chairCenter.z + (Math.random() - 0.5) * 0.6;

    const isSeat = y > 0.4 && y < 0.55;
    const r = isSeat ? 0.12 : 0.45;
    const g = isSeat ? 0.14 : 0.28;
    const b = isSeat ? 0.22 : 0.16;

    splats.push({
      position: { x, y, z },
      scale: { x: 0.025, y: 0.025, z: 0.025 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      color: { r, g, b },
      opacity: 0.95,
    });
  }

  // Apple Box (Plywood grain)
  for (let i = 0; i < perProp; i++) {
    const x = appleBoxCenter.x + (Math.random() - 0.5) * 0.5;
    const y = appleBoxCenter.y + (Math.random() - 0.5) * 0.3;
    const z = appleBoxCenter.z + (Math.random() - 0.5) * 0.35;

    splats.push({
      position: { x, y, z },
      scale: { x: 0.02, y: 0.02, z: 0.02 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      color: { r: 0.82, g: 0.68, b: 0.48 },
      opacity: 0.95,
    });
  }

  // Fill any integer division rounding difference to reach exact requested splatCount
  while (splats.length < splatCount) {
    const x = (Math.random() - 0.5) * roomWidth;
    const z = (Math.random() - 0.5) * roomLength;
    const y = (Math.random() - 0.5) * 0.02;
    splats.push({
      position: { x, y, z },
      scale: { x: 0.04, y: 0.01, z: 0.08 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      color: { r: 0.55, g: 0.38, b: 0.24 },
      opacity: 0.9,
    });
  }

  const bounds = calculateCloudBoundingBox(splats);

  return {
    id: uid(),
    name: sceneName,
    splatCount: splats.length,
    bounds,
    splats,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: 1.0,
    },
    floorAlignment: {
      floorHeightY: 0.0,
      northAngleRad: 0.0,
      originOffset: { x: 0, y: 0, z: 0 },
    },
  };
}
