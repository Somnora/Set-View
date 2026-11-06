// ---------------------------------------------------------------------------
// 3D Set & Prop Renderer, Procedural Geometry Engine & 3D Loaders
//
// Renders:
//   - 16 procedural, high-detail film set primitives (zero texture asset downloads)
//   - Custom user-uploaded GLTF/GLB/OBJ meshes via dynamic loaders
//   - Selection bounding box gizmo, floor projection, and 3D transform manipulators
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { clone as cloneModel } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  getBuiltinPropDefinition,
  resolvePropSourceType,
  type PropData,
} from './props.ts';
import { globalPropStore, type CustomPropAsset } from './propStore.ts';

// Shared reusable materials & geometries to keep WebXR draw calls minimal
const _matCache = new Map<string, THREE.Material>();

function getOrCreateMaterial(colorHex: string, roughness = 0.5, metalness = 0.1): THREE.MeshStandardMaterial {
  const key = `${colorHex}_${roughness}_${metalness}`;
  let mat = _matCache.get(key) as THREE.MeshStandardMaterial;
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      roughness,
      metalness,
      flatShading: true,
    });
    _matCache.set(key, mat);
  }
  return mat;
}

const WOOD_MAT = getOrCreateMaterial('#854d0e', 0.8, 0.0);
const CHROME_MAT = getOrCreateMaterial('#94a3b8', 0.2, 0.85);
const BLACK_MAT = getOrCreateMaterial('#0f172a', 0.7, 0.2);
const FABRIC_MAT = getOrCreateMaterial('#1e293b', 0.9, 0.0);
const GREEN_CHROMA_MAT = getOrCreateMaterial('#22c55e', 0.9, 0.0);
const EMISSIVE_WARM_MAT = new THREE.MeshBasicMaterial({ color: 0xffedd5 });

/** Texture slots carried over when an uploaded model's materials become Lambert. */
type LambertSource = THREE.Material & {
  color?: THREE.Color;
  map?: THREE.Texture | null;
  emissive?: THREE.Color;
  emissiveMap?: THREE.Texture | null;
  emissiveIntensity?: number;
  alphaMap?: THREE.Texture | null;
  flatShading?: boolean;
};

/**
 * Makes an uploaded model obey the render budget (flat Lambert, no lights of
 * its own). glTF materials parse as MeshStandard/Physical (PBR: costlier, and
 * metallic parts render black with no environment map) and OBJ as Phong; each
 * becomes a MeshLambertMaterial with the same colour, base and emissive maps,
 * vertex colours, transparency and side. Unlit (MeshBasic) materials stay.
 * KHR_lights_punctual lights would light the whole set and force a shader
 * recompile, so each is swapped for an empty group that keeps its children.
 *
 * Returns how many texture maps the original materials carried, so a caller
 * can tell when a model that declares textures got none of them.
 */
export function flattenModelForBudget(root: THREE.Object3D): number {
  const lights: THREE.Light[] = [];
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Light).isLight) lights.push(o as THREE.Light);
    else if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });

  for (const light of lights) {
    const stand = new THREE.Group();
    stand.name = light.name;
    stand.position.copy(light.position);
    stand.quaternion.copy(light.quaternion);
    stand.scale.copy(light.scale);
    const target = (light as THREE.Light & { target?: THREE.Object3D }).target;
    for (const child of [...light.children]) if (child !== target) stand.add(child);
    const parent = light.parent;
    light.removeFromParent();
    parent?.add(stand);
    light.dispose();
  }

  const swapped = new Map<THREE.Material, THREE.Material>();
  const seenMaps = new Set<THREE.Texture>();
  const keptMaps = new Set<THREE.Texture>();
  const swap = (m: THREE.Material): THREE.Material => {
    const known = swapped.get(m);
    if (known) return known;
    for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) seenMaps.add(v as THREE.Texture);
    if ((m as THREE.MeshLambertMaterial).isMeshLambertMaterial || (m as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
      for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) keptMaps.add(v as THREE.Texture);
      swapped.set(m, m);
      return m;
    }
    const src = m as LambertSource;
    const lambert = new THREE.MeshLambertMaterial({
      name: src.name,
      color: src.color ?? 0xffffff,
      map: src.map ?? null,
      emissive: src.emissive ?? 0x000000,
      emissiveMap: src.emissiveMap ?? null,
      emissiveIntensity: src.emissiveIntensity ?? 1,
      alphaMap: src.alphaMap ?? null,
      vertexColors: src.vertexColors,
      transparent: src.transparent,
      opacity: src.opacity,
      alphaTest: src.alphaTest,
      side: src.side,
      depthWrite: src.depthWrite,
      flatShading: src.flatShading ?? false,
    });
    for (const t of [lambert.map, lambert.emissiveMap, lambert.alphaMap]) if (t) keptMaps.add(t);
    swapped.set(m, lambert);
    return lambert;
  };
  for (const mesh of meshes) {
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  }
  // Free what the Lambert copies no longer reference (PBR maps, old materials).
  for (const t of seenMaps) if (!keptMaps.has(t)) t.dispose();
  for (const [from, to] of swapped) if (from !== to) from.dispose();
  return seenMaps.size;
}

/**
 * Frees a prop subtree: geometry, skeletons, materials and EVERY texture slot
 * on them. ui.ts disposeTree frees only `map`, which would leak the emissive
 * and alpha maps flattenModelForBudget keeps. Sprite geometry is three's
 * shared quad, so a label sprite keeps it (its material and texture go).
 */
export function disposeModelTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry && !(o as THREE.Sprite).isSprite) mesh.geometry.dispose();
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if ((v as THREE.Texture | null)?.isTexture) (v as THREE.Texture).dispose();
      m.dispose();
    }
  });
}

/** Triangles a ray tests in a model: three's Mesh.raycast has no BVH and walks every one. */
export function countModelTriangles(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    const verts = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
    const copies = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1;
    n += Math.floor(verts / 3) * copies;
  });
  return n;
}

/**
 * Uploaded models with more triangles than this are picked by an invisible
 * box over their bounds instead of their triangles. Hover raycasts every
 * frame, and inside a model's bounds Mesh.raycast tests each triangle: about
 * 2 ms for 50k triangles on an Apple Silicon Mac, more on Quest 3, against a
 * 13.9 ms frame at 72 fps.
 */
export const EXACT_PICK_MAX_TRIANGLES = 5000;

/** three's Raycaster does not descend into a node whose raycast returns false. */
function skipSubtreeRaycast(): boolean {
  return false;
}

/** Identifies the stored asset a cached model was parsed from. */
function assetStamp(asset: CustomPropAsset | null): string {
  return asset ? `${asset.fileType}:${asset.sizeBytes}:${asset.uploadedAt}` : '';
}

/** One parsed upload, shared by every prop that shows it (see PropRenderer.models). */
interface CachedModel {
  key: string;
  /** assetStamp of the asset it was parsed from. */
  stamp: string;
  /** The grounded, flattened model; never in a scene itself. Null when the load failed. */
  template: Promise<THREE.Group | null>;
  /** Picked by its box: template children are [model, pick box] (EXACT_PICK_MAX_TRIANGLES). */
  boxPick: boolean;
  /** Clones handed out and not yet released. */
  users: number;
  freed: boolean;
}

export interface PropRenderInstance {
  data: PropData;
  root: THREE.Group;
  contentGroup: THREE.Group;
  selectionBox: THREE.LineSegments | null;
  footprintMesh: THREE.Mesh | null;
  isSelected: boolean;
}

export class PropRenderer {
  private gltfLoader = new GLTFLoader();
  private objLoader = new OBJLoader();

  /**
   * Parsed uploads by customModelKey. props.setScene (undo, redo, remote
   * patches, scene load) disposes and rebuilds every prop; without this each
   * rebuild re-parsed every upload on the main thread, once per copy, and the
   * model vanished until the parse finished. Each prop gets a clone sharing
   * the template's geometry, materials and textures: disposeProp releases it
   * instead of freeing them, and the template is freed once no prop uses it.
   * Failed loads are never cached, so a model imported later still loads.
   */
  private models = new Map<string, CachedModel>();
  /** A handed-out clone -> the cached model it shares resources with. */
  private modelUsers = new WeakMap<THREE.Object3D, CachedModel>();

  /**
   * Called when an uploaded model cannot be shown and the prop falls back to a
   * placeholder box (missing from this device's store, unsupported file type,
   * or a parse error such as a Draco-compressed GLB). main.ts routes it to the
   * debug log and the wrist status.
   */
  onLoadError?: (assetKey: string, err: unknown) => void;

  /**
   * Called when an uploaded model IS shown but incompletely: today, a model
   * that declares textures and got none of them (GLTFLoader only logs a
   * failed texture to the console and carries on untextured).
   */
  onLoadWarning?: (assetKey: string, message: string) => void;

  /** Builds the Three.js 3D visual object for a given PropData. */
  async createPropMesh(prop: PropData): Promise<THREE.Group> {
    const group = new THREE.Group();
    group.name = `prop_${prop.id}`;

    if (prop.customModelKey && resolvePropSourceType(prop.sourceType, prop.customModelKey) === 'indexeddb') {
      const customMesh = await this.loadCustomModel(prop.customModelKey);
      if (customMesh) {
        group.add(customMesh);
        return group;
      }
    }

    // Built-in or fallback procedural geometry
    const proceduralMesh = this.buildProceduralProp(prop);
    group.add(proceduralMesh);
    return group;
  }

  /**
   * A prop's own copy of a custom model, from the cache (see models). Null
   * when it cannot be shown (the caller then shows the placeholder box).
   */
  private async loadCustomModel(customKey: string, recheck = true): Promise<THREE.Group | null> {
    // Acquired before any await: setScene clears every prop and rebuilds them
    // in the same task, and release() frees a template only a tick later.
    const entry = this.acquireModel(customKey);
    const template = await entry.template;
    if (!template) {
      this.release(entry);
      return null;
    }
    if (recheck && assetStamp(await globalPropStore.getAsset(customKey)) !== entry.stamp) {
      // Deleted or replaced in the library since it was parsed: load what is stored now.
      if (this.models.get(customKey) === entry) this.models.delete(customKey);
      this.release(entry);
      return this.loadCustomModel(customKey, false);
    }
    const model = cloneModel(template) as THREE.Group;
    if (entry.boxPick) model.children[0].raycast = skipSubtreeRaycast;
    this.modelUsers.set(model, entry);
    return model;
  }

  private acquireModel(key: string): CachedModel {
    let entry = this.models.get(key);
    if (!entry) {
      const created: CachedModel = { key, stamp: '', template: Promise.resolve(null), boxPick: false, users: 0, freed: false };
      created.template = this.parseCustomModel(key, created).then((t) => {
        if (!t && this.models.get(key) === created) this.models.delete(key);
        return t;
      });
      this.models.set(key, created);
      entry = created;
    }
    entry.users++;
    return entry;
  }

  /** Drops one clone's hold; an unused template is freed a tick later unless re-acquired. */
  private release(entry: CachedModel): void {
    if (--entry.users > 0) return;
    setTimeout(() => {
      if (entry.users > 0 || entry.freed) return;
      entry.freed = true;
      if (this.models.get(entry.key) === entry) this.models.delete(entry.key);
      void entry.template.then((t) => {
        if (t) disposeModelTree(t);
      });
    }, 0);
  }

  /**
   * Loads and normalizes a custom 3D model from PropStore. Parses the stored
   * bytes directly (GLTFLoader.parseAsync / OBJLoader.parse) rather than
   * fetching the model through a blob: URL, which Quest Browser has been
   * reported to refuse with ERR_ACCESS_DENIED. Images embedded in a GLB still
   * go through blob: URLs inside GLTFLoader, so textured GLBs on Quest are
   * unverified on device; if every texture fails the model shows untextured
   * and onLoadWarning says so. Failures go to onLoadError and return null.
   */
  private async parseCustomModel(customKey: string, entry: CachedModel): Promise<THREE.Group | null> {
    const root = new THREE.Group();
    try {
      const asset = await globalPropStore.getAsset(customKey);
      if (!asset || !asset.buffer) {
        throw new Error('model not found in this device\'s prop library (uploaded on another device, or deleted)');
      }
      entry.stamp = assetStamp(asset);

      if (asset.fileType !== 'glb' && asset.fileType !== 'gltf' && asset.fileType !== 'obj') {
        throw new Error(`unsupported model type "${asset.fileType}" (use GLB, glTF or OBJ)`);
      }
      let declaredTextures = 0;
      try {
        if (asset.fileType === 'obj') {
          root.add(this.objLoader.parse(new TextDecoder().decode(asset.buffer)));
        } else {
          // Empty base path: a .gltf whose buffers or textures are separate files
          // cannot resolve them and fails here (reported); embedded data URIs
          // work. Draco / meshopt / KTX2 compressed files fail too (no decoders).
          const gltf = await this.gltfLoader.parseAsync(asset.buffer, '');
          declaredTextures = (gltf.parser.json as { textures?: unknown[] }).textures?.length ?? 0;
          root.add(gltf.scene);
        }
      } catch (parseErr) {
        const why = parseErr instanceof Error ? parseErr.message : String(parseErr);
        throw new Error(`could not read ${asset.fileName || asset.fileType.toUpperCase()}: ${why}`);
      }

      const loadedTextures = flattenModelForBudget(root);
      if (declaredTextures > 0 && loadedTextures === 0) {
        this.onLoadWarning?.(customKey, `${asset.fileName || 'model'}: textures did not load, shown untextured`);
      }

      // Compute bounding box and normalize center/floor
      const box = new THREE.Box3().setFromObject(root);
      if (box.isEmpty()) throw new Error('model has no visible geometry');
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      // Center horizontally and align bottom to floor (y = 0)
      root.position.x = -center.x;
      root.position.y = -box.min.y;
      root.position.z = -center.z;

      const wrapper = new THREE.Group();
      wrapper.add(root);
      if (countModelTriangles(root) > EXACT_PICK_MAX_TRIANGLES) {
        // Mesh.raycast ignores material.visible, and the renderer skips it.
        const pick = new THREE.Mesh(
          new THREE.BoxGeometry(Math.max(size.x, 0.01), Math.max(size.y, 0.01), Math.max(size.z, 0.01)),
          new THREE.MeshBasicMaterial({ visible: false }),
        );
        pick.name = 'prop_pick_box';
        pick.position.y = size.y / 2;
        wrapper.add(pick);
        entry.boxPick = true;
      }
      return wrapper;
    } catch (err) {
      // Free anything a parse got as far as building before it failed.
      disposeModelTree(root);
      this.onLoadError?.(customKey, err);
      return null;
    }
  }

  /** Builds stylized low-poly cinematic primitives for built-in props. */
  buildProceduralProp(prop: PropData): THREE.Group {
    const root = new THREE.Group();
    const colorHex = prop.colorHex || '#475569';
    const primaryMat = getOrCreateMaterial(colorHex, 0.6, 0.1);

    switch (prop.assetId) {
      case 'directors_chair': {
        // Scissor legs
        const legGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.9, 6);
        const legMat = WOOD_MAT;
        const leg1 = new THREE.Mesh(legGeo, legMat);
        leg1.position.set(-0.2, 0.45, 0);
        leg1.rotation.z = 0.2;
        const leg2 = new THREE.Mesh(legGeo, legMat);
        leg2.position.set(0.2, 0.45, 0);
        leg2.rotation.z = -0.2;
        root.add(leg1, leg2);

        // Canvas seat
        const seatGeo = new THREE.BoxGeometry(0.48, 0.02, 0.42);
        const seat = new THREE.Mesh(seatGeo, FABRIC_MAT);
        seat.position.set(0, 0.72, 0);
        root.add(seat);

        // Canvas backrest
        const backGeo = new THREE.BoxGeometry(0.48, 0.22, 0.02);
        const back = new THREE.Mesh(backGeo, FABRIC_MAT);
        back.position.set(0, 1.05, -0.2);
        root.add(back);

        // Wooden armrests
        const armGeo = new THREE.BoxGeometry(0.04, 0.03, 0.44);
        const armL = new THREE.Mesh(armGeo, legMat);
        armL.position.set(-0.25, 0.88, 0);
        const armR = new THREE.Mesh(armGeo, legMat);
        armR.position.set(0.25, 0.88, 0);
        root.add(armL, armR);
        break;
      }

      case 'apple_box_full': {
        const boxGeo = new THREE.BoxGeometry(0.3, 0.2, 0.5);
        const box = new THREE.Mesh(boxGeo, WOOD_MAT);
        box.position.y = 0.1;
        root.add(box);
        break;
      }

      case 'apple_box_half': {
        const boxGeo = new THREE.BoxGeometry(0.3, 0.1, 0.5);
        const box = new THREE.Mesh(boxGeo, WOOD_MAT);
        box.position.y = 0.05;
        root.add(box);
        break;
      }

      case 'apple_box_quarter': {
        const boxGeo = new THREE.BoxGeometry(0.3, 0.05, 0.5);
        const box = new THREE.Mesh(boxGeo, WOOD_MAT);
        box.position.y = 0.025;
        root.add(box);
        break;
      }

      case 'c_stand_with_arm': {
        // Turtle base
        const legGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.45, 8);
        for (let i = 0; i < 3; i++) {
          const leg = new THREE.Mesh(legGeo, CHROME_MAT);
          const ang = (i * Math.PI * 2) / 3;
          leg.position.set(Math.cos(ang) * 0.22, 0.08 + i * 0.04, Math.sin(ang) * 0.22);
          leg.rotation.z = Math.PI / 2;
          leg.rotation.y = ang;
          root.add(leg);
        }

        // Telescoping column
        const columnGeo = new THREE.CylinderGeometry(0.02, 0.025, 1.6, 8);
        const col = new THREE.Mesh(columnGeo, CHROME_MAT);
        col.position.y = 0.85;
        root.add(col);

        // Knuckle head + Grip arm
        const knuckleGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.06, 8);
        const knuckle = new THREE.Mesh(knuckleGeo, BLACK_MAT);
        knuckle.position.set(0, 1.65, 0);
        knuckle.rotation.x = Math.PI / 2;
        root.add(knuckle);

        const armGeo = new THREE.CylinderGeometry(0.01, 0.01, 1.0, 8);
        const arm = new THREE.Mesh(armGeo, CHROME_MAT);
        arm.position.set(0.35, 1.65, 0);
        arm.rotation.z = Math.PI / 2;
        root.add(arm);
        break;
      }

      case 'film_slate_clapper': {
        // Slate board
        const boardGeo = new THREE.BoxGeometry(0.3, 0.2, 0.015);
        const board = new THREE.Mesh(boardGeo, BLACK_MAT);
        board.position.y = 0.1;
        root.add(board);

        // Hinged clapper stick on top
        const stickGeo = new THREE.BoxGeometry(0.3, 0.04, 0.018);
        const stick = new THREE.Mesh(stickGeo, primaryMat);
        stick.position.set(0, 0.22, 0);
        stick.rotation.z = 0.15; // angled slightly open
        root.add(stick);
        break;
      }

      case 'production_desk': {
        // Desk top
        const topGeo = new THREE.BoxGeometry(1.5, 0.04, 0.8);
        const top = new THREE.Mesh(topGeo, primaryMat);
        top.position.y = 0.74;
        root.add(top);

        // Metal square legs
        const legGeo = new THREE.BoxGeometry(0.05, 0.72, 0.05);
        const legOffsets = [
          [-0.7, 0.36, -0.35],
          [0.7, 0.36, -0.35],
          [-0.7, 0.36, 0.35],
          [0.7, 0.36, 0.35],
        ];
        for (const [x, y, z] of legOffsets) {
          const leg = new THREE.Mesh(legGeo, BLACK_MAT);
          leg.position.set(x, y, z);
          root.add(leg);
        }
        break;
      }

      case 'office_chair': {
        // 5-Star base
        const baseGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.04, 5);
        const base = new THREE.Mesh(baseGeo, BLACK_MAT);
        base.position.y = 0.08;
        root.add(base);

        // Center cylinder
        const colGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8);
        const col = new THREE.Mesh(colGeo, CHROME_MAT);
        col.position.y = 0.28;
        root.add(col);

        // Seat cushion
        const seatGeo = new THREE.BoxGeometry(0.5, 0.08, 0.48);
        const seat = new THREE.Mesh(seatGeo, FABRIC_MAT);
        seat.position.y = 0.52;
        root.add(seat);

        // Backrest
        const backGeo = new THREE.BoxGeometry(0.46, 0.45, 0.06);
        const back = new THREE.Mesh(backGeo, FABRIC_MAT);
        back.position.set(0, 0.8, -0.22);
        root.add(back);
        break;
      }

      case 'doorframe_standard': {
        const jambGeo = new THREE.BoxGeometry(0.08, 2.14, 0.15);
        const jambL = new THREE.Mesh(jambGeo, primaryMat);
        jambL.position.set(-0.44, 1.07, 0);
        const jambR = new THREE.Mesh(jambGeo, primaryMat);
        jambR.position.set(0.44, 1.07, 0);

        const headerGeo = new THREE.BoxGeometry(0.96, 0.08, 0.15);
        const header = new THREE.Mesh(headerGeo, primaryMat);
        header.position.set(0, 2.1, 0);

        root.add(jambL, jambR, header);
        break;
      }

      case 'window_frame_double': {
        const frameGeo = new THREE.BoxGeometry(1.4, 1.6, 0.1);
        const frameMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(colorHex),
          wireframe: true,
        });
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.y = 1.2;
        root.add(frame);

        // Glass pane representation (translucent)
        const glassGeo = new THREE.PlaneGeometry(1.3, 1.5);
        const glassMat = new THREE.MeshBasicMaterial({
          color: 0x93c5fd,
          transparent: true,
          opacity: 0.25,
          side: THREE.DoubleSide,
        });
        const glass = new THREE.Mesh(glassGeo, glassMat);
        glass.position.y = 1.2;
        root.add(glass);
        break;
      }

      case 'practical_floor_lamp': {
        // Weighted base
        const baseGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.03, 16);
        const base = new THREE.Mesh(baseGeo, BLACK_MAT);
        base.position.y = 0.015;
        root.add(base);

        // Stem
        const stemGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.5, 8);
        const stem = new THREE.Mesh(stemGeo, CHROME_MAT);
        stem.position.y = 0.75;
        root.add(stem);

        // Lamp shade
        const shadeGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.28, 16, 1, true);
        const shade = new THREE.Mesh(shadeGeo, primaryMat);
        shade.position.y = 1.52;
        root.add(shade);

        // Glowing bulb inside
        const bulbGeo = new THREE.SphereGeometry(0.05, 8, 8);
        const bulb = new THREE.Mesh(bulbGeo, EMISSIVE_WARM_MAT);
        bulb.position.y = 1.52;
        root.add(bulb);
        break;
      }

      case 'couch_leather_3seater': {
        // Main base
        const baseGeo = new THREE.BoxGeometry(2.1, 0.25, 0.9);
        const base = new THREE.Mesh(baseGeo, primaryMat);
        base.position.y = 0.18;
        root.add(base);

        // 3 Seat cushions
        const cushionGeo = new THREE.BoxGeometry(0.62, 0.14, 0.65);
        for (let i = -1; i <= 1; i++) {
          const cushion = new THREE.Mesh(cushionGeo, primaryMat);
          cushion.position.set(i * 0.64, 0.35, 0.05);
          root.add(cushion);
        }

        // Backrest
        const backGeo = new THREE.BoxGeometry(2.1, 0.5, 0.22);
        const back = new THREE.Mesh(backGeo, primaryMat);
        back.position.set(0, 0.6, -0.32);
        root.add(back);

        // Armrests
        const armGeo = new THREE.BoxGeometry(0.18, 0.35, 0.88);
        const armL = new THREE.Mesh(armGeo, primaryMat);
        armL.position.set(-1.0, 0.45, 0);
        const armR = new THREE.Mesh(armGeo, primaryMat);
        armR.position.set(1.0, 0.45, 0);
        root.add(armL, armR);
        break;
      }

      case 'green_screen_frame': {
        // Frame pipes
        const pipeMat = CHROME_MAT;
        const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.44, 8), pipeMat);
        postL.position.set(-1.22, 1.22, 0);
        const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.44, 8), pipeMat);
        postR.position.set(1.22, 1.22, 0);
        const barTop = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.44, 8), pipeMat);
        barTop.position.set(0, 2.44, 0);
        barTop.rotation.z = Math.PI / 2;
        root.add(postL, postR, barTop);

        // Green Screen canvas
        const canvasGeo = new THREE.PlaneGeometry(2.38, 2.38);
        const canvas = new THREE.Mesh(canvasGeo, GREEN_CHROMA_MAT);
        canvas.position.set(0, 1.22, 0);
        root.add(canvas);
        break;
      }

      default: {
        // Generic bounding cube for other props
        const def = getBuiltinPropDefinition(prop.assetId);
        const d = def?.dimensions || { width: 0.6, height: 0.6, depth: 0.6 };
        const boxGeo = new THREE.BoxGeometry(d.width, d.height, d.depth);
        const box = new THREE.Mesh(boxGeo, primaryMat);
        box.position.y = d.height / 2;
        root.add(box);
        break;
      }
    }

    return root;
  }

  /** Creates a wireframe selection bounding box. */
  createSelectionGizmo(
    dim: { width: number; height: number; depth: number } | { x: number; y: number; z: number },
    color = 0x38bdf8,
  ): THREE.LineSegments {
    const w = 'width' in dim ? dim.width : dim.x;
    const h = 'height' in dim ? dim.height : dim.y;
    const d = 'depth' in dim ? dim.depth : dim.z;
    const boxGeo = new THREE.BoxGeometry(w, h, d);
    const edges = new THREE.EdgesGeometry(boxGeo);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, linewidth: 2 }));
    line.position.y = h / 2;
    return line;
  }

  /**
   * Disposes a rendered prop hierarchy. An uploaded model in it is a clone
   * sharing the cached template's geometry, materials and textures, so it is
   * detached and released instead (only its own skeleton copies are freed).
   */
  disposeProp(root: THREE.Object3D): void {
    const shared: THREE.Object3D[] = [];
    root.traverse((o) => {
      if (this.modelUsers.has(o)) shared.push(o);
    });
    for (const model of shared) {
      const entry = this.modelUsers.get(model)!;
      this.modelUsers.delete(model);
      model.removeFromParent();
      model.traverse((o) => {
        if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.SkinnedMesh).skeleton.dispose();
      });
      this.release(entry);
    }
    if (!shared.includes(root)) disposeModelTree(root);
  }
}

export const globalPropRenderer = new PropRenderer();
