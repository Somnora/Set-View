// ---------------------------------------------------------------------------
// Location import adapter (runtime: three.js allowed). Parses an imported
// mesh file's bytes with three's loaders and hands plain position/index arrays
// to the pure ingest core (sceneImport.ts), which builds the LocationScan.
//
// Bytes in, never URLs: files are read as ArrayBuffers (picker, drop box,
// blob store) and parsed directly, because blob: URL loads are unreliable on
// the Quest Browser. Formats are identified by content (sniffSceneFile).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { GLTFLoader, type GLTFLoaderPlugin, type GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import {
  buildLocationScanFromParts,
  captureLicenseNote,
  checkImportBudget,
  describeSceneFileKind,
  detectCaptureApp,
  guessUnitScale,
  locationImportRefusal,
  sniffSceneFile,
  SNIFF_BYTES,
  UNIT_SCALE,
  type AxisConvention,
  type BudgetResult,
  type BuiltLocation,
  type CaptureApp,
  type ImportMeshPart,
  type SceneFileKind,
  type UnitGuess,
} from './sceneImport.ts';

/** Where the dev server and the build serve three's decoders (vite.plugins.ts). */
function decoderBase(): string {
  const env = (import.meta as { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL ?? '/';
  return `${base.endsWith('/') ? base : `${base}/`}decoders/`;
}

// One Draco decoder per page: it owns worker threads.
let dracoLoader: import('three/examples/jsm/loaders/DRACOLoader.js').DRACOLoader | null = null;
async function getDracoLoader() {
  if (!dracoLoader) {
    const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(`${decoderBase()}draco/`);
    dracoLoader.setDecoderConfig({ type: 'wasm' });
  }
  return dracoLoader;
}

let ktx2Loader: import('three/examples/jsm/loaders/KTX2Loader.js').KTX2Loader | null = null;
async function getKtx2Loader(renderer: THREE.WebGLRenderer) {
  if (!ktx2Loader) {
    const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js');
    ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath(`${decoderBase()}basis/`);
    ktx2Loader.detectSupport(renderer);
  }
  return ktx2Loader;
}

const TEXTURE_SLOTS = ['baseColorTexture', 'metallicRoughnessTexture'] as const;
const MATERIAL_TEXTURES = ['normalTexture', 'occlusionTexture', 'emissiveTexture'] as const;

/**
 * GLTFLoader plugin that removes every texture reference from the materials
 * before anything loads, so a geometry-only import never decodes the
 * (often 4K) photo textures of a phone scan.
 */
function skipTexturesPlugin(parser: GLTFParser, onTextured: (textured: boolean) => void): GLTFLoaderPlugin {
  return {
    name: 'SETVIEW_skip_textures',
    beforeRoot() {
      // Record whether the model is textured before the references are removed.
      onTextured(gltfHasTextures(parser.json as Parameters<typeof gltfHasTextures>[0]));
      const json = parser.json as { materials?: Record<string, unknown>[] };
      for (const m of json.materials ?? []) {
        const pbr = m.pbrMetallicRoughness as Record<string, unknown> | undefined;
        if (pbr) for (const k of TEXTURE_SLOTS) delete pbr[k];
        for (const k of MATERIAL_TEXTURES) delete m[k];
        // Texture-bearing material extensions (specular-glossiness, clearcoat, ...).
        delete m.extensions;
      }
      return null;
    },
  } as GLTFLoaderPlugin;
}

/** True when a glTF JSON has materials that use textures. */
function gltfHasTextures(json: { textures?: unknown[]; materials?: { pbrMetallicRoughness?: { baseColorTexture?: unknown }; extensions?: Record<string, { diffuseTexture?: unknown }> }[] }): boolean {
  if (!json.textures?.length) return false;
  return (json.materials ?? []).some(
    (m) => !!m.pbrMetallicRoughness?.baseColorTexture || !!m.extensions?.KHR_materials_pbrSpecularGlossiness?.diffuseTexture,
  );
}

export interface ParsedModel {
  root: THREE.Object3D;
  /** glTF asset.generator, when present. */
  generator: string | null;
  /** The model carries photo textures or vertex colours (Photo mode is worth offering). */
  textured: boolean;
}

/**
 * Parses mesh bytes into a three.js object. With textures false, glTF
 * textures are skipped entirely (geometry import); with true they load
 * (Photo mode). KTX2 textures need a renderer for format detection.
 */
export async function parseModelBytes(
  bytes: ArrayBuffer,
  kind: SceneFileKind,
  opts: { textures: boolean; renderer?: THREE.WebGLRenderer | null },
): Promise<ParsedModel> {
  switch (kind) {
    case 'glb': {
      const loader = new GLTFLoader();
      loader.setDRACOLoader(await getDracoLoader());
      const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
      loader.setMeshoptDecoder(MeshoptDecoder);
      if (opts.textures && opts.renderer) loader.setKTX2Loader(await getKtx2Loader(opts.renderer));
      let strippedTextured: boolean | null = null;
      if (!opts.textures) loader.register((parser) => skipTexturesPlugin(parser, (t) => (strippedTextured = t)));
      const gltf = await loader.parseAsync(bytes, '');
      const json = gltf.parser.json as { asset?: { generator?: string } } & Parameters<typeof gltfHasTextures>[0];
      return {
        root: gltf.scene,
        generator: typeof json.asset?.generator === 'string' ? json.asset.generator : null,
        textured: strippedTextured ?? gltfHasTextures(json),
      };
    }
    case 'obj': {
      const text = new TextDecoder('utf-8').decode(bytes);
      // OBJ materials and textures live in separate .mtl and image files we never receive.
      return { root: new OBJLoader().parse(text), generator: null, textured: false };
    }
    case 'ply-mesh': {
      const geom = new PLYLoader().parse(bytes);
      return { root: new THREE.Mesh(geom), generator: null, textured: !!geom.getAttribute('color') };
    }
    case 'fbx': {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      const root = new FBXLoader().parse(bytes, '');
      let textured = false;
      root.traverse((o) => {
        const mats = (o as THREE.Mesh).material;
        for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
          if ((m as THREE.MeshBasicMaterial).map) textured = true;
        }
      });
      return { root, generator: null, textured };
    }
    default:
      throw new Error(locationImportRefusal(kind) ?? `${describeSceneFileKind(kind)} is not a mesh`);
  }
}

/** Reads a position attribute as plain xyz floats (handles interleaved and quantized data). */
function readPositions(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Float32Array {
  const plain = !(attr as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && !attr.normalized;
  if (plain && attr.array instanceof Float32Array && attr.itemSize === 3) return new Float32Array(attr.array);
  const out = new Float32Array(attr.count * 3);
  for (let i = 0; i < attr.count; i++) {
    out[i * 3] = attr.getX(i);
    out[i * 3 + 1] = attr.getY(i);
    out[i * 3 + 2] = attr.getZ(i);
  }
  return out;
}

/**
 * Flattens every triangle mesh under root into ImportMeshParts with world
 * matrices (instanced meshes expand per instance). Points and lines are skipped.
 */
export function partsFromObject3D(root: THREE.Object3D): ImportMeshPart[] {
  root.updateMatrixWorld(true);
  const parts: ImportMeshPart[] = [];
  const instanceWorld = new THREE.Matrix4();
  const instanceLocal = new THREE.Matrix4();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry as THREE.BufferGeometry | undefined;
    const pos = g?.getAttribute('position') as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
    if (!g || !pos || pos.count < 3) return;
    const positions = readPositions(pos);
    const indices = g.index ? Uint32Array.from(g.index.array as ArrayLike<number>) : null;
    const inst = o as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, instanceLocal);
        instanceWorld.multiplyMatrices(inst.matrixWorld, instanceLocal);
        parts.push({ positions, indices, matrix: instanceWorld.toArray() });
      }
      return;
    }
    parts.push({ positions, indices, matrix: mesh.matrixWorld.toArray() });
  });
  return parts;
}

/** Disposes geometries, materials and textures of a parsed model. */
export function disposeModel(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) {
      for (const v of Object.values(m)) if ((v as THREE.Texture)?.isTexture) (v as THREE.Texture).dispose();
      m.dispose();
    }
  });
}

export type UpAxisChoice = 'auto' | AxisConvention;
export type UnitChoice = 'auto' | UnitGuess;

export interface LocationImportOptions {
  fileName?: string;
  upAxis?: UpAxisChoice;
  unit?: UnitChoice;
  renderer?: THREE.WebGLRenderer | null;
}

export type LocationImportResult =
  | {
      ok: true;
      built: BuiltLocation & { scan: NonNullable<BuiltLocation['scan']> };
      kind: SceneFileKind;
      app: CaptureApp;
      textured: boolean;
      budget: BudgetResult;
      /** Unit that was applied (after any auto guess). */
      unit: UnitGuess;
      convention: AxisConvention;
      /** User-facing notes: warnings, unit guess, license reminder. */
      notes: string[];
    }
  | { ok: false; kind: SceneFileKind; message: string };

/**
 * Turns mesh bytes into a LocationScan: identify, parse (geometry only),
 * flatten, convert, guess units, check the budget. Pure of side effects
 * (nothing is stored); the caller decides what to keep.
 */
export async function importLocationBytes(bytes: ArrayBuffer, opts: LocationImportOptions = {}): Promise<LocationImportResult> {
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, SNIFF_BYTES));
  const kind = sniffSceneFile(head, bytes.byteLength);
  const refusal = locationImportRefusal(kind);
  if (refusal) return { ok: false, kind, message: refusal };
  let model: ParsedModel;
  try {
    model = await parseModelBytes(bytes, kind, { textures: false, renderer: opts.renderer });
  } catch (e) {
    return { ok: false, kind, message: `Could not read this ${describeSceneFileKind(kind)}: ${(e as Error)?.message ?? e}` };
  }
  const parts = partsFromObject3D(model.root);
  const convention: AxisConvention = !opts.upAxis || opts.upAxis === 'auto' ? 'RUB' : opts.upAxis;
  const notes: string[] = [];
  let unit: UnitGuess = !opts.unit || opts.unit === 'auto' ? 'm' : opts.unit;
  let built = buildLocationScanFromParts(parts, { convention, unitScale: UNIT_SCALE[unit] });
  if (built.scan && (!opts.unit || opts.unit === 'auto')) {
    const guess = guessUnitScale(built.sourceBoundsMin, built.sourceBoundsMax);
    if (guess.unit !== 'm') {
      unit = guess.unit;
      built = buildLocationScanFromParts(parts, { convention, unitScale: guess.scale });
      notes.push(
        `The model is ${Math.round(guess.extent)} units across, so it was read as ${guess.unit === 'cm' ? 'centimetres' : 'millimetres'}. Set Units if that is wrong.`,
      );
    }
  }
  disposeModel(model.root);
  if (!built.scan) return { ok: false, kind, message: built.error ?? 'The file contains no usable triangles.' };
  notes.push(...built.warnings);
  const budget = checkImportBudget(built.stats);
  if (budget.level === 'warn') notes.push(budget.reason);
  const app = detectCaptureApp(model.generator, opts.fileName);
  const license = captureLicenseNote(app);
  if (license) notes.push(license);
  if (budget.level === 'reject') return { ok: false, kind, message: budget.reason };
  return {
    ok: true,
    built: built as BuiltLocation & { scan: NonNullable<BuiltLocation['scan']> },
    kind,
    app,
    textured: model.textured,
    budget,
    unit,
    convention,
    notes,
  };
}
