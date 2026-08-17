// ---------------------------------------------------------------------------
// Pure domain 3D scan exporters and synthetic scan generation.
// ZERO Three.js or DOM imports. Portable across platforms and test runners.
//
// Formats:
//   - Wavefront OBJ + MTL (hierarchical semantic grouping, material tints)
//   - Stanford PLY (ASCII & binary with vertex normals & semantic RGB)
//   - USDA OpenUSD (for Unreal Engine 5, Maya, Blender, Omniverse)
//   - RFC 7946 GeoJSON (2D architectural floorplan & furniture footprints)
// ---------------------------------------------------------------------------

import { uid } from './model.ts';
import { isMovableScanMesh, type LocationScan, type ScanMeshData } from './scan.ts';

export interface SemanticColor {
  r: number; // 0..1
  g: number;
  b: number;
  hex: number;
}

export const SEMANTIC_PALETTE: Record<string, SemanticColor> = {
  floor: { r: 0.431, g: 0.455, b: 0.502, hex: 0x6e7480 },
  ceiling: { r: 0.725, g: 0.745, b: 0.784, hex: 0xb9bec8 },
  wall: { r: 0.604, g: 0.631, b: 0.675, hex: 0x9aa1ac },
  'wall face': { r: 0.604, g: 0.631, b: 0.675, hex: 0x9aa1ac },
  walls: { r: 0.604, g: 0.631, b: 0.675, hex: 0x9aa1ac },
  table: { r: 0.478, g: 0.541, b: 0.651, hex: 0x7a8aa6 },
  desk: { r: 0.478, g: 0.541, b: 0.651, hex: 0x7a8aa6 },
  couch: { r: 0.478, g: 0.541, b: 0.651, hex: 0x7a8aa6 },
  sofa: { r: 0.478, g: 0.541, b: 0.651, hex: 0x7a8aa6 },
  bed: { r: 0.478, g: 0.541, b: 0.651, hex: 0x7a8aa6 },
  chair: { r: 0.478, g: 0.541, b: 0.651, hex: 0x7a8aa6 },
  shelf: { r: 0.478, g: 0.541, b: 0.651, hex: 0x7a8aa6 },
  screen: { r: 0.361, g: 0.416, b: 0.510, hex: 0x5c6a82 },
  door: { r: 0.541, g: 0.592, b: 0.659, hex: 0x8a97a8 },
  window: { r: 0.541, g: 0.592, b: 0.659, hex: 0x8a97a8 },
  furniture: { r: 0.478, g: 0.541, b: 0.651, hex: 0x7a8aa6 },
  'global mesh': { r: 0.541, g: 0.561, b: 0.596, hex: 0x8a8f98 },
  default: { r: 0.541, g: 0.561, b: 0.596, hex: 0x8a8f98 },
};

/** Returns semantic RGB color for any scan label. */
export function getSemanticColor(label: string): SemanticColor {
  const key = label.trim().toLowerCase();
  return SEMANTIC_PALETTE[key] ?? SEMANTIC_PALETTE.default;
}

/** Computes smooth vertex normals for a triangle mesh. */
export function calculateMeshNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  const triCount = Math.floor(indices.length / 3);

  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];

    const v0x = positions[i0 * 3];
    const v0y = positions[i0 * 3 + 1];
    const v0z = positions[i0 * 3 + 2];

    const v1x = positions[i1 * 3];
    const v1y = positions[i1 * 3 + 1];
    const v1z = positions[i1 * 3 + 2];

    const v2x = positions[i2 * 3];
    const v2y = positions[i2 * 3 + 1];
    const v2z = positions[i2 * 3 + 2];

    const e1x = v1x - v0x;
    const e1y = v1y - v0y;
    const e1z = v1z - v0z;

    const e2x = v2x - v0x;
    const e2y = v2y - v0y;
    const e2z = v2z - v0z;

    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    normals[i0 * 3] += nx;
    normals[i0 * 3 + 1] += ny;
    normals[i0 * 3 + 2] += nz;

    normals[i1 * 3] += nx;
    normals[i1 * 3 + 1] += ny;
    normals[i1 * 3 + 2] += nz;

    normals[i2 * 3] += nx;
    normals[i2 * 3 + 1] += ny;
    normals[i2 * 3 + 2] += nz;
  }

  const vertCount = Math.floor(positions.length / 3);
  for (let i = 0; i < vertCount; i++) {
    const nx = normals[i * 3];
    const ny = normals[i * 3 + 1];
    const nz = normals[i * 3 + 2];
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-8) {
      normals[i * 3] = nx / len;
      normals[i * 3 + 1] = ny / len;
      normals[i * 3 + 2] = nz / len;
    } else {
      normals[i * 3] = 0;
      normals[i * 3 + 1] = 1;
      normals[i * 3 + 2] = 0;
    }
  }

  return normals;
}

/** Axis-aligned bounding box of 3D vertex positions. */
export function calculateMeshAABB(positions: Float32Array): {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
} {
  if (positions.length < 3) {
    return { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function sanitizeIdentifier(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
}

// ---------------------------------------------------------------------------
// 1. Wavefront OBJ + MTL Exporter
// ---------------------------------------------------------------------------

export interface ObjExportResult {
  obj: string;
  mtl: string;
}

/**
 * Exports a LocationScan as Wavefront OBJ with distinct groups and MTL definitions.
 */
export function exportScanAsObj(scan: LocationScan, mtlFilename = 'location_scan.mtl'): ObjExportResult {
  const objLines: string[] = [];
  const mtlLines: string[] = [];

  objLines.push('# SetView Location Room Scan Export');
  objLines.push(`# Scan ID: ${scan.id}`);
  objLines.push(`# Captured: ${new Date(scan.capturedAt).toISOString()}`);
  objLines.push(`mtllib ${mtlFilename}`);
  objLines.push('');

  mtlLines.push('# SetView Location Scan Material Library');
  mtlLines.push(`# Generated: ${new Date().toISOString()}`);
  mtlLines.push('');

  const usedMaterials = new Set<string>();
  let vertexOffset = 1;

  for (let mIdx = 0; mIdx < scan.meshes.length; mIdx++) {
    const mesh = scan.meshes[mIdx];
    if (mesh.positions.length < 3 || mesh.indices.length < 3) continue;

    const label = mesh.label || 'mesh';
    const tag = sanitizeIdentifier(label);
    const objName = `mesh_${mIdx + 1}_${tag}`;
    const matName = `mat_${tag}`;

    if (!usedMaterials.has(matName)) {
      usedMaterials.add(matName);
      const color = getSemanticColor(label);
      mtlLines.push(`newmtl ${matName}`);
      mtlLines.push('Ka 0.2000 0.2000 0.2000');
      mtlLines.push(`Kd ${color.r.toFixed(4)} ${color.g.toFixed(4)} ${color.b.toFixed(4)}`);
      mtlLines.push('Ks 0.1000 0.1000 0.1000');
      mtlLines.push('Ns 10.0000');
      mtlLines.push('d 1.0000');
      mtlLines.push('illum 2');
      mtlLines.push('');
    }

    objLines.push(`o ${objName}`);
    objLines.push(`g ${tag}`);
    objLines.push(`usemtl ${matName}`);

    const normals = calculateMeshNormals(mesh.positions, mesh.indices);
    const vertCount = Math.floor(mesh.positions.length / 3);

    for (let i = 0; i < vertCount; i++) {
      const x = mesh.positions[i * 3].toFixed(4);
      const y = mesh.positions[i * 3 + 1].toFixed(4);
      const z = mesh.positions[i * 3 + 2].toFixed(4);
      objLines.push(`v ${x} ${y} ${z}`);
    }

    for (let i = 0; i < vertCount; i++) {
      const nx = normals[i * 3].toFixed(4);
      const ny = normals[i * 3 + 1].toFixed(4);
      const nz = normals[i * 3 + 2].toFixed(4);
      objLines.push(`vn ${nx} ${ny} ${nz}`);
    }

    objLines.push('s 1');

    const triCount = Math.floor(mesh.indices.length / 3);
    for (let t = 0; t < triCount; t++) {
      const i0 = mesh.indices[t * 3] + vertexOffset;
      const i1 = mesh.indices[t * 3 + 1] + vertexOffset;
      const i2 = mesh.indices[t * 3 + 2] + vertexOffset;
      objLines.push(`f ${i0}//${i0} ${i1}//${i1} ${i2}//${i2}`);
    }

    objLines.push('');
    vertexOffset += vertCount;
  }

  return {
    obj: objLines.join('\n'),
    mtl: mtlLines.join('\n'),
  };
}

// ---------------------------------------------------------------------------
// 2. Stanford PLY Exporter (ASCII / Binary)
// ---------------------------------------------------------------------------

/**
 * Exports a LocationScan as Stanford PLY (ASCII string or binary Uint8Array).
 */
export function exportScanAsPly(scan: LocationScan, binary?: boolean): string | Uint8Array {
  let totalVerts = 0;
  let totalFaces = 0;

  for (const m of scan.meshes) {
    totalVerts += Math.floor(m.positions.length / 3);
    totalFaces += Math.floor(m.indices.length / 3);
  }

  if (binary) {
    const headerStr = [
      'ply',
      'format binary_little_endian 1.0',
      'comment SetView Location Room Scan Export',
      `element vertex ${totalVerts}`,
      'property float x',
      'property float y',
      'property float z',
      'property float nx',
      'property float ny',
      'property float nz',
      'property uchar red',
      'property uchar green',
      'property uchar blue',
      `element face ${totalFaces}`,
      'property list uchar int vertex_indices',
      'end_header',
    ].join('\n') + '\n';

    const enc = new TextEncoder();
    const headerBytes = enc.encode(headerStr);
    const vertByteLen = totalVerts * (3 * 4 + 3 * 4 + 3 * 1); // 27 bytes per vert
    const faceByteLen = totalFaces * (1 + 3 * 4); // 13 bytes per face
    const totalBytes = headerBytes.length + vertByteLen + faceByteLen;

    const buffer = new ArrayBuffer(totalBytes);
    const outBytes = new Uint8Array(buffer);
    const view = new DataView(buffer);

    outBytes.set(headerBytes, 0);
    let offset = headerBytes.length;

    // Write vertices
    for (const mesh of scan.meshes) {
      const normals = calculateMeshNormals(mesh.positions, mesh.indices);
      const color = getSemanticColor(mesh.label);
      const r = Math.round(Math.max(0, Math.min(255, color.r * 255)));
      const g = Math.round(Math.max(0, Math.min(255, color.g * 255)));
      const b = Math.round(Math.max(0, Math.min(255, color.b * 255)));
      const vertCount = Math.floor(mesh.positions.length / 3);

      for (let i = 0; i < vertCount; i++) {
        view.setFloat32(offset, mesh.positions[i * 3], true);
        offset += 4;
        view.setFloat32(offset, mesh.positions[i * 3 + 1], true);
        offset += 4;
        view.setFloat32(offset, mesh.positions[i * 3 + 2], true);
        offset += 4;

        view.setFloat32(offset, normals[i * 3], true);
        offset += 4;
        view.setFloat32(offset, normals[i * 3 + 1], true);
        offset += 4;
        view.setFloat32(offset, normals[i * 3 + 2], true);
        offset += 4;

        view.setUint8(offset, r);
        offset += 1;
        view.setUint8(offset, g);
        offset += 1;
        view.setUint8(offset, b);
        offset += 1;
      }
    }

    // Write faces
    let baseOffset = 0;
    for (const mesh of scan.meshes) {
      const triCount = Math.floor(mesh.indices.length / 3);
      for (let t = 0; t < triCount; t++) {
        view.setUint8(offset, 3);
        offset += 1;
        view.setInt32(offset, mesh.indices[t * 3] + baseOffset, true);
        offset += 4;
        view.setInt32(offset, mesh.indices[t * 3 + 1] + baseOffset, true);
        offset += 4;
        view.setInt32(offset, mesh.indices[t * 3 + 2] + baseOffset, true);
        offset += 4;
      }
      baseOffset += Math.floor(mesh.positions.length / 3);
    }

    return outBytes;
  }

  // ASCII PLY
  const lines: string[] = [];
  lines.push('ply');
  lines.push('format ascii 1.0');
  lines.push('comment SetView Location Room Scan Export');
  lines.push(`element vertex ${totalVerts}`);
  lines.push('property float x');
  lines.push('property float y');
  lines.push('property float z');
  lines.push('property float nx');
  lines.push('property float ny');
  lines.push('property float nz');
  lines.push('property uchar red');
  lines.push('property uchar green');
  lines.push('property uchar blue');
  lines.push(`element face ${totalFaces}`);
  lines.push('property list uchar int vertex_indices');
  lines.push('end_header');

  for (const mesh of scan.meshes) {
    const normals = calculateMeshNormals(mesh.positions, mesh.indices);
    const color = getSemanticColor(mesh.label);
    const r = Math.round(Math.max(0, Math.min(255, color.r * 255)));
    const g = Math.round(Math.max(0, Math.min(255, color.g * 255)));
    const b = Math.round(Math.max(0, Math.min(255, color.b * 255)));
    const vertCount = Math.floor(mesh.positions.length / 3);

    for (let i = 0; i < vertCount; i++) {
      const x = mesh.positions[i * 3].toFixed(4);
      const y = mesh.positions[i * 3 + 1].toFixed(4);
      const z = mesh.positions[i * 3 + 2].toFixed(4);
      const nx = normals[i * 3].toFixed(4);
      const ny = normals[i * 3 + 1].toFixed(4);
      const nz = normals[i * 3 + 2].toFixed(4);
      lines.push(`${x} ${y} ${z} ${nx} ${ny} ${nz} ${r} ${g} ${b}`);
    }
  }

  let baseOffset = 0;
  for (const mesh of scan.meshes) {
    const triCount = Math.floor(mesh.indices.length / 3);
    for (let t = 0; t < triCount; t++) {
      const i0 = mesh.indices[t * 3] + baseOffset;
      const i1 = mesh.indices[t * 3 + 1] + baseOffset;
      const i2 = mesh.indices[t * 3 + 2] + baseOffset;
      lines.push(`3 ${i0} ${i1} ${i2}`);
    }
    baseOffset += Math.floor(mesh.positions.length / 3);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 3. OpenUSD (USDA) Exporter
// ---------------------------------------------------------------------------

/**
 * Exports a LocationScan as USDA OpenUSD text representation.
 */
export function exportScanAsUsd(scan: LocationScan): string {
  const lines: string[] = [];

  lines.push('#usda 1.0');
  lines.push('(');
  lines.push('    defaultPrim = "LocationScan"');
  lines.push('    metersPerUnit = 1.0');
  lines.push('    upAxis = "Y"');
  lines.push('    doc = "SetView 3D Location Room Scan"');
  lines.push(')');
  lines.push('');
  lines.push('def Xform "LocationScan" (');
  lines.push('    kind = "group"');
  lines.push(')');
  lines.push('{');

  // Scope: Materials
  lines.push('    def Scope "Materials"');
  lines.push('    {');
  const usedMats = new Set<string>();
  for (const mesh of scan.meshes) {
    const tag = sanitizeIdentifier(mesh.label || 'mesh');
    const matName = `Mat_${tag}`;
    if (usedMats.has(matName)) continue;
    usedMats.add(matName);
    const col = getSemanticColor(mesh.label);

    lines.push(`        def Material "${matName}"`);
    lines.push('        {');
    lines.push('            def Shader "PBRShader"');
    lines.push('            {');
    lines.push('                uniform token info:id = "UsdPreviewSurface"');
    lines.push(
      `                color3f inputs:diffuseColor = (${col.r.toFixed(4)}, ${col.g.toFixed(4)}, ${col.b.toFixed(4)})`,
    );
    lines.push('                float inputs:roughness = 0.6');
    lines.push('                float inputs:metallic = 0.0');
    lines.push('                token outputs:surface');
    lines.push('            }');
    lines.push(`            token outputs:surface.connect = </LocationScan/Materials/${matName}/PBRShader.outputs:surface>`);
    lines.push('        }');
  }
  lines.push('    }');
  lines.push('');

  // Meshes
  lines.push('    def Xform "Meshes"');
  lines.push('    {');
  for (let mIdx = 0; mIdx < scan.meshes.length; mIdx++) {
    const mesh = scan.meshes[mIdx];
    if (mesh.positions.length < 3 || mesh.indices.length < 3) continue;

    const tag = sanitizeIdentifier(mesh.label || 'mesh');
    const meshName = `Mesh_${tag}_${mIdx + 1}`;
    const matName = `Mat_${tag}`;
    const normals = calculateMeshNormals(mesh.positions, mesh.indices);
    const col = getSemanticColor(mesh.label);
    const vertCount = Math.floor(mesh.positions.length / 3);
    const triCount = Math.floor(mesh.indices.length / 3);

    lines.push(`        def Mesh "${meshName}" (`);
    lines.push('            apiSchemas = ["MaterialBindingAPI"]');
    lines.push('        )');
    lines.push('        {');
    lines.push(`            rel material:binding = </LocationScan/Materials/${matName}>`);

    // faceVertexCounts
    const faceCounts: number[] = new Array(triCount).fill(3);
    lines.push(`            int[] faceVertexCounts = [${faceCounts.join(', ')}]`);

    // faceVertexIndices
    const indicesList = Array.from(mesh.indices);
    lines.push(`            int[] faceVertexIndices = [${indicesList.join(', ')}]`);

    // points
    const pointsFormatted: string[] = [];
    for (let i = 0; i < vertCount; i++) {
      const x = mesh.positions[i * 3].toFixed(4);
      const y = mesh.positions[i * 3 + 1].toFixed(4);
      const z = mesh.positions[i * 3 + 2].toFixed(4);
      pointsFormatted.push(`(${x}, ${y}, ${z})`);
    }
    lines.push(`            point3f[] points = [${pointsFormatted.join(', ')}]`);

    // normals
    const normalsFormatted: string[] = [];
    for (let i = 0; i < vertCount; i++) {
      const nx = normals[i * 3].toFixed(4);
      const ny = normals[i * 3 + 1].toFixed(4);
      const nz = normals[i * 3 + 2].toFixed(4);
      normalsFormatted.push(`(${nx}, ${ny}, ${nz})`);
    }
    lines.push(`            normal3f[] normals = [${normalsFormatted.join(', ')}] (`);
    lines.push('                interpolation = "vertex"');
    lines.push('            )');

    // displayColor
    lines.push(
      `            color3f[] primvars:displayColor = [(${col.r.toFixed(4)}, ${col.g.toFixed(4)}, ${col.b.toFixed(4)})] (`,
    );
    lines.push('                interpolation = "constant"');
    lines.push('            )');

    lines.push('            uniform token subdivisionScheme = "none"');
    lines.push('            uniform token orientation = "rightHanded"');
    lines.push('        }');
  }
  lines.push('    }');
  lines.push('}');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 4. 2D Architectural GeoJSON Exporter
// ---------------------------------------------------------------------------

/** 2D Monotone Chain convex hull of [x, z] points. */
export function compute2DConvexHull(points: [number, number][]): [number, number][] {
  if (points.length <= 2) return [...points];

  // Remove duplicates and sort by x then z
  const unique = Array.from(
    new Map(points.map((p) => [`${p[0].toFixed(4)},${p[1].toFixed(4)}`, p])).values(),
  ).sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));

  if (unique.length <= 2) return unique;

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  // Lower hull
  const lower: [number, number][] = [];
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Upper hull
  const upper: [number, number][] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Polygon 2D area (Shoelace formula). */
function computePolygonArea(coords: [number, number][]): number {
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n - 1; i++) {
    area += coords[i][0] * coords[i + 1][1] - coords[i + 1][0] * coords[i][1];
  }
  return Math.abs(area) / 2;
}

export interface GeoJsonScanFeature {
  type: 'Feature';
  id: string;
  properties: {
    label: string;
    meshIndex: number;
    isFurniture: boolean;
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    minY: number;
    maxY: number;
    widthM: number;
    depthM: number;
    heightM: number;
    areaM2: number;
    vertexCount: number;
    triangleCount: number;
  };
  geometry: {
    type: 'Polygon';
    coordinates: [number, number][][];
  };
}

export interface GeoJsonScanCollection {
  type: 'FeatureCollection';
  name: string;
  properties: {
    scanId: string;
    capturedAt: number;
    totalMeshes: number;
    totalVertices: number;
    totalTriangles: number;
  };
  features: GeoJsonScanFeature[];
}

/**
 * Exports a LocationScan as RFC 7946 GeoJSON FeatureCollection of 2D architectural boundaries.
 */
export function exportScanAsGeoJson(scan: LocationScan): string {
  let totalVerts = 0;
  let totalTris = 0;
  const features: GeoJsonScanFeature[] = [];

  for (let mIdx = 0; mIdx < scan.meshes.length; mIdx++) {
    const mesh = scan.meshes[mIdx];
    const vertCount = Math.floor(mesh.positions.length / 3);
    const triCount = Math.floor(mesh.indices.length / 3);
    totalVerts += vertCount;
    totalTris += triCount;

    if (vertCount === 0) continue;

    const aabb = calculateMeshAABB(mesh.positions);
    const xzPoints: [number, number][] = [];
    for (let i = 0; i < vertCount; i++) {
      xzPoints.push([
        Number(mesh.positions[i * 3].toFixed(4)),
        Number(mesh.positions[i * 3 + 2].toFixed(4)),
      ]);
    }

    const hull = compute2DConvexHull(xzPoints);
    let polyCoords: [number, number][];

    if (hull.length >= 3) {
      polyCoords = [...hull, hull[0]]; // Close polygon ring
    } else {
      // Fall back to bounding box rectangle
      const x0 = Number(aabb.minX.toFixed(4));
      const x1 = Number(aabb.maxX.toFixed(4));
      const z0 = Number(aabb.minZ.toFixed(4));
      const z1 = Number(aabb.maxZ.toFixed(4));
      polyCoords = [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
        [x0, z0],
      ];
    }

    const areaM2 = Number(computePolygonArea(polyCoords).toFixed(3));
    const isFurniture = isMovableScanMesh(mesh.label);

    features.push({
      type: 'Feature',
      id: `mesh-${mIdx + 1}-${sanitizeIdentifier(mesh.label)}`,
      properties: {
        label: mesh.label,
        meshIndex: mIdx,
        isFurniture,
        minX: Number(aabb.minX.toFixed(3)),
        maxX: Number(aabb.maxX.toFixed(3)),
        minZ: Number(aabb.minZ.toFixed(3)),
        maxZ: Number(aabb.maxZ.toFixed(3)),
        minY: Number(aabb.minY.toFixed(3)),
        maxY: Number(aabb.maxY.toFixed(3)),
        widthM: Number((aabb.maxX - aabb.minX).toFixed(3)),
        depthM: Number((aabb.maxZ - aabb.minZ).toFixed(3)),
        heightM: Number((aabb.maxY - aabb.minY).toFixed(3)),
        areaM2,
        vertexCount: vertCount,
        triangleCount: triCount,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [polyCoords],
      },
    });
  }

  const geoJson: GeoJsonScanCollection = {
    type: 'FeatureCollection',
    name: `LocationScan_${scan.id}`,
    properties: {
      scanId: scan.id,
      capturedAt: scan.capturedAt,
      totalMeshes: scan.meshes.length,
      totalVertices: totalVerts,
      totalTriangles: totalTris,
    },
    features,
  };

  return JSON.stringify(geoJson, null, 2);
}

// ---------------------------------------------------------------------------
// 5. Synthetic Location Scan Generator
// ---------------------------------------------------------------------------

interface BoxSpec {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** Generates unified vertex positions & triangle indices for one or more boxes. */
function createBoxesMesh(label: string, boxes: BoxSpec[]): ScanMeshData {
  const vertCountPerBox = 24;
  const triCountPerBox = 12;
  const totalVerts = boxes.length * vertCountPerBox;
  const totalIndices = boxes.length * triCountPerBox * 3;

  const positions = new Float32Array(totalVerts * 3);
  const indices = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;

  for (const b of boxes) {
    const x0 = b.minX;
    const y0 = b.minY;
    const z0 = b.minZ;
    const x1 = b.maxX;
    const y1 = b.maxY;
    const z1 = b.maxZ;

    const baseV = vOffset / 3;

    // 6 Faces: 4 verts per face
    // +Z (front)
    positions[vOffset++] = x0; positions[vOffset++] = y0; positions[vOffset++] = z1;
    positions[vOffset++] = x1; positions[vOffset++] = y0; positions[vOffset++] = z1;
    positions[vOffset++] = x1; positions[vOffset++] = y1; positions[vOffset++] = z1;
    positions[vOffset++] = x0; positions[vOffset++] = y1; positions[vOffset++] = z1;

    // -Z (back)
    positions[vOffset++] = x1; positions[vOffset++] = y0; positions[vOffset++] = z0;
    positions[vOffset++] = x0; positions[vOffset++] = y0; positions[vOffset++] = z0;
    positions[vOffset++] = x0; positions[vOffset++] = y1; positions[vOffset++] = z0;
    positions[vOffset++] = x1; positions[vOffset++] = y1; positions[vOffset++] = z0;

    // +Y (top)
    positions[vOffset++] = x0; positions[vOffset++] = y1; positions[vOffset++] = z1;
    positions[vOffset++] = x1; positions[vOffset++] = y1; positions[vOffset++] = z1;
    positions[vOffset++] = x1; positions[vOffset++] = y1; positions[vOffset++] = z0;
    positions[vOffset++] = x0; positions[vOffset++] = y1; positions[vOffset++] = z0;

    // -Y (bottom)
    positions[vOffset++] = x0; positions[vOffset++] = y0; positions[vOffset++] = z0;
    positions[vOffset++] = x1; positions[vOffset++] = y0; positions[vOffset++] = z0;
    positions[vOffset++] = x1; positions[vOffset++] = y0; positions[vOffset++] = z1;
    positions[vOffset++] = x0; positions[vOffset++] = y0; positions[vOffset++] = z1;

    // +X (right)
    positions[vOffset++] = x1; positions[vOffset++] = y0; positions[vOffset++] = z1;
    positions[vOffset++] = x1; positions[vOffset++] = y0; positions[vOffset++] = z0;
    positions[vOffset++] = x1; positions[vOffset++] = y1; positions[vOffset++] = z0;
    positions[vOffset++] = x1; positions[vOffset++] = y1; positions[vOffset++] = z1;

    // -X (left)
    positions[vOffset++] = x0; positions[vOffset++] = y0; positions[vOffset++] = z0;
    positions[vOffset++] = x0; positions[vOffset++] = y0; positions[vOffset++] = z1;
    positions[vOffset++] = x0; positions[vOffset++] = y1; positions[vOffset++] = z1;
    positions[vOffset++] = x0; positions[vOffset++] = y1; positions[vOffset++] = z0;

    // 12 Triangles (2 per face)
    for (let f = 0; f < 6; f++) {
      const fBase = baseV + f * 4;
      indices[iOffset++] = fBase;
      indices[iOffset++] = fBase + 1;
      indices[iOffset++] = fBase + 2;

      indices[iOffset++] = fBase;
      indices[iOffset++] = fBase + 2;
      indices[iOffset++] = fBase + 3;
    }
  }

  return {
    label,
    positions,
    indices,
  };
}

/**
 * Creates a synthetic realistic 3D room LocationScan for desktop testing and location scouting preview.
 */
export function createSyntheticLocationScan(
  roomWidthM = 6.0,
  roomDepthM = 5.0,
  roomHeightM = 2.8,
  furnitureLabels: string[] = ['couch', 'table', 'desk'],
): LocationScan {
  const hw = Math.max(2.0, roomWidthM) / 2;
  const hd = Math.max(2.0, roomDepthM) / 2;
  const h = Math.max(1.8, roomHeightM);

  const meshes: ScanMeshData[] = [];

  // Floor
  meshes.push(
    createBoxesMesh('floor', [
      { minX: -hw, minY: -0.05, minZ: -hd, maxX: hw, maxY: 0.0, maxZ: hd },
    ]),
  );

  // Ceiling
  meshes.push(
    createBoxesMesh('ceiling', [
      { minX: -hw, minY: h, minZ: -hd, maxX: hw, maxY: h + 0.05, maxZ: hd },
    ]),
  );

  // 4 Walls
  meshes.push(
    createBoxesMesh('walls', [
      // North wall (Z-)
      { minX: -hw, minY: 0, minZ: -hd - 0.1, maxX: hw, maxY: h, maxZ: -hd },
      // South wall (Z+)
      { minX: -hw, minY: 0, minZ: hd, maxX: hw, maxY: h, maxZ: hd + 0.1 },
      // East wall (X+)
      { minX: hw, minY: 0, minZ: -hd, maxX: hw + 0.1, maxY: h, maxZ: hd },
      // West wall (X-)
      { minX: -hw - 0.1, minY: 0, minZ: -hd, maxX: -hw, maxY: h, maxZ: hd },
    ]),
  );

  // Door
  meshes.push(
    createBoxesMesh('door', [
      { minX: hw - 0.05, minY: 0, minZ: -0.45, maxX: hw + 0.05, maxY: 2.05, maxZ: 0.45 },
    ]),
  );

  // Window
  meshes.push(
    createBoxesMesh('window', [
      { minX: -hw - 0.05, minY: 0.9, minZ: -0.8, maxX: -hw + 0.05, maxY: 2.1, maxZ: 0.8 },
    ]),
  );

  // Add requested furniture items
  const normalizedLabels = furnitureLabels.map((l) => l.trim().toLowerCase());

  if (normalizedLabels.includes('couch') || normalizedLabels.includes('sofa')) {
    // Couch: Base seat, backrest, left arm, right arm
    meshes.push(
      createBoxesMesh('couch', [
        { minX: -1.0, minY: 0, minZ: hd * 0.4, maxX: 1.0, maxY: 0.45, maxZ: hd * 0.4 + 0.9 },
        { minX: -1.0, minY: 0.45, minZ: hd * 0.4 + 0.7, maxX: 1.0, maxY: 0.85, maxZ: hd * 0.4 + 0.9 },
        { minX: -1.15, minY: 0, minZ: hd * 0.4, maxX: -0.95, maxY: 0.65, maxZ: hd * 0.4 + 0.9 },
        { minX: 0.95, minY: 0, minZ: hd * 0.4, maxX: 1.15, maxY: 0.65, maxZ: hd * 0.4 + 0.9 },
      ]),
    );
  }

  if (normalizedLabels.includes('table')) {
    // Table: Top + 4 legs
    meshes.push(
      createBoxesMesh('table', [
        { minX: -0.75, minY: 0.72, minZ: -0.5, maxX: 0.75, maxY: 0.76, maxZ: 0.5 },
        { minX: -0.7, minY: 0, minZ: -0.45, maxX: -0.62, maxY: 0.72, maxZ: -0.37 },
        { minX: 0.62, minY: 0, minZ: -0.45, maxX: 0.7, maxY: 0.72, maxZ: -0.37 },
        { minX: -0.7, minY: 0, minZ: 0.37, maxX: -0.62, maxY: 0.72, maxZ: 0.45 },
        { minX: 0.62, minY: 0, minZ: 0.37, maxX: 0.7, maxY: 0.72, maxZ: 0.45 },
      ]),
    );
  }

  if (normalizedLabels.includes('desk')) {
    // Desk: Tabletop + left and right drawer pedestals
    const deskX = hw * 0.5;
    const deskZ = -hd * 0.6;
    meshes.push(
      createBoxesMesh('desk', [
        { minX: deskX - 0.7, minY: 0.73, minZ: deskZ - 0.4, maxX: deskX + 0.7, maxY: 0.76, maxZ: deskZ + 0.4 },
        { minX: deskX - 0.65, minY: 0, minZ: deskZ - 0.38, maxX: deskX - 0.35, maxY: 0.73, maxZ: deskZ + 0.38 },
        { minX: deskX + 0.35, minY: 0, minZ: deskZ - 0.38, maxX: deskX + 0.65, maxY: 0.73, maxZ: deskZ + 0.38 },
      ]),
    );
  }

  if (normalizedLabels.includes('chair')) {
    // Chair: Seat, backrest, 4 legs
    meshes.push(
      createBoxesMesh('chair', [
        { minX: -0.25, minY: 0.45, minZ: -0.25, maxX: 0.25, maxY: 0.49, maxZ: 0.25 },
        { minX: -0.25, minY: 0.49, minZ: 0.2, maxX: 0.25, maxY: 0.9, maxZ: 0.25 },
        { minX: -0.23, minY: 0, minZ: -0.23, maxX: -0.18, maxY: 0.45, maxZ: -0.18 },
        { minX: 0.18, minY: 0, minZ: -0.23, maxX: 0.23, maxY: 0.45, maxZ: -0.18 },
        { minX: -0.23, minY: 0, minZ: 0.18, maxX: -0.18, maxY: 0.45, maxZ: 0.23 },
        { minX: 0.18, minY: 0, minZ: 0.18, maxX: 0.23, maxY: 0.45, maxZ: 0.23 },
      ]),
    );
  }

  if (normalizedLabels.includes('bed')) {
    // Bed: Base, mattress, headboard
    meshes.push(
      createBoxesMesh('bed', [
        { minX: -1.0, minY: 0, minZ: -hd + 0.2, maxX: 1.0, maxY: 0.3, maxZ: -hd + 2.2 },
        { minX: -0.95, minY: 0.3, minZ: -hd + 0.25, maxX: 0.95, maxY: 0.6, maxZ: -hd + 2.15 },
        { minX: -1.05, minY: 0, minZ: -hd + 0.1, maxX: 1.05, maxY: 1.1, maxZ: -hd + 0.2 },
      ]),
    );
  }

  if (normalizedLabels.includes('shelf')) {
    // Shelf: Outer frame + 3 shelves
    meshes.push(
      createBoxesMesh('shelf', [
        { minX: -hw + 0.1, minY: 0, minZ: 0.5, maxX: -hw + 0.4, maxY: 1.8, maxZ: 1.7 },
        { minX: -hw + 0.12, minY: 0.45, minZ: 0.52, maxX: -hw + 0.38, maxY: 0.48, maxZ: 1.68 },
        { minX: -hw + 0.12, minY: 0.9, minZ: 0.52, maxX: -hw + 0.38, maxY: 0.93, maxZ: 1.68 },
        { minX: -hw + 0.12, minY: 1.35, minZ: 0.52, maxX: -hw + 0.38, maxY: 1.38, maxZ: 1.68 },
      ]),
    );
  }

  if (normalizedLabels.includes('screen')) {
    // Screen: Flat panel TV mounted on wall
    meshes.push(
      createBoxesMesh('screen', [
        { minX: -0.7, minY: 1.2, minZ: -hd + 0.02, maxX: 0.7, maxY: 2.0, maxZ: -hd + 0.08 },
      ]),
    );
  }

  return {
    version: 1,
    id: uid(),
    capturedAt: Date.now(),
    meshes,
  };
}
