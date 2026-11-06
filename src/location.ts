// ---------------------------------------------------------------------------
// Location renderer: turns a LocationScan into three.js meshes under
// contentRoot, so the scanned room obeys the same view transforms as actors
// and cameras (teleport walkthrough, miniature diorama, camera view).
//
// Display modes:
//   hidden    - on location, the real room is visible in passthrough; default.
//   ghost     - translucent overlay for checking scan/world alignment.
//   solid     - gray-box set for walking the location anywhere (VR walkthrough).
//   wireframe - semantic wireframe overlay for scouting spatial layout.
//   photo     - the textured original of an imported phone scan (P1.4), unlit,
//               offered only once that original has loaded.
//
// Whatever the mode, the virtual camera pass temporarily forces photo (when
// loaded) or solid, so the monitor and captures frame shots inside the set.
//
// Each display mode draws with its own fixed-flag materials (see
// MaterialVariant) and a mode switch swaps them, because three bakes the
// translucency of the first compile into the shader program.
//
// Perf: flat Lambert per the app-wide budget (no shadows). Headset captures are
// untextured by design (the platform never exposes camera imagery). Photo mode
// is the one exception: MeshBasicMaterial, because phone-scan textures already
// contain their lighting, with meshes merged per material and textures capped
// at PHOTO_MAX_TEXTURE px.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FurniturePlacement, LocationDisplayMode } from './model.ts';
import type { RigidDelta } from './registration.ts';
import {
  baseScanLabel,
  GLOBAL_MESH_LABEL,
  isMovableScanMesh,
  isPlaneLabel,
  meshFootprintCenter,
  normalizeSemanticLabel,
  quatYaw,
  type LocationScan,
} from './scan.ts';

export type LocationMode = LocationDisplayMode;

/**
 * Material set a display mode draws with. Each variant's flags are fixed at
 * creation and never toggled: three r180 bakes '#define OPAQUE' (alpha forced
 * to 1) into a program compiled while transparent is false and does not
 * recompile when the flag later flips. Flipping one shared material used to
 * leave Ghost and Wireframe fully opaque over passthrough once anything (the
 * Camera View pass forces Solid) had compiled it Solid first. Swapping fixed
 * variants never needs a recompile, so the per-frame camera pass costs one
 * material assignment per mesh and no shader-program churn.
 */
type MaterialVariant = 'solid' | 'ghost' | 'wireframe';

/** Longest texture edge Photo mode keeps (px); larger photo textures are downscaled once at load. */
export const PHOTO_MAX_TEXTURE = 2048;

/** Size a texture is drawn at under PHOTO_MAX_TEXTURE, keeping its aspect ratio. */
export function fitTextureSize(width: number, height: number, max = PHOTO_MAX_TEXTURE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!(longest > max)) return { width, height };
  const k = max / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

export type PhotoState = 'none' | 'loading' | 'ready' | 'failed';

const GHOST_OPACITY = 0.35;
const WIREFRAME_OPACITY = 0.85;

/** Subtle semantic tints so walls/floor/furniture read at a glance. Keys are
 *  normalized labels (see normalizeSemanticLabel). */
const LABEL_COLORS: Record<string, number> = {
  floor: 0x6e7480,
  ceiling: 0xb9bec8,
  wall: 0x9aa1ac,
  table: 0x7a8aa6,
  chair: 0x7a8aa6,
  desk: 0x7a8aa6,
  couch: 0x7a8aa6,
  bed: 0x7a8aa6,
  shelf: 0x7a8aa6,
  screen: 0x5c6a82,
  door: 0x8a97a8,
  window: 0x8a97a8,
};
const DEFAULT_COLOR = 0x8a8f98;

/** Wire overlays are visuals only: never hit by grab/hover rays (and a
 *  LineSegments raycast over every edge of a room mesh would be costly). */
const noRaycast = (): void => {};

interface FurnitureEntry {
  mesh: THREE.Mesh;
  /** Index into the scan's mesh list (the placement key). */
  meshIndex: number;
  label: string;
  /** Captured footprint center - the mesh's rest position after re-centering. */
  center: THREE.Vector3;
}

export interface RoomDimensions {
  min: THREE.Vector3;
  max: THREE.Vector3;
  widthM: number;
  depthM: number;
  heightM: number;
}

export class LocationRenderer {
  /** Parent under contentRoot. */
  readonly group = new THREE.Group();
  mode: LocationMode = 'hidden';

  /** Whether a wireframe edge overlay is active on top of solid / ghost rendering. */
  wireframeOverlay = false;

  /** Floor level vertical offset in meters (for manual or auto leveling). */
  floorOffset = 0;

  /** Whether the room bounding box visualizer is enabled. */
  showBounds = false;

  /** Shared materials per display variant and color (see MaterialVariant). */
  private materials: Record<MaterialVariant, Map<number, THREE.MeshLambertMaterial>> = {
    solid: new Map(),
    ghost: new Map(),
    wireframe: new Map(),
  };
  /** Shared wire-overlay material per color. */
  private wireMaterials = new Map<number, THREE.LineBasicMaterial>();
  private cameraPassRestore: LocationMode | null = null;
  /** Every scan mesh, indexed by its position in the scan (the placement key). */
  private meshes: THREE.Mesh[] = [];
  /** Tint of meshes[i]. */
  private meshColors: number[] = [];
  /**
   * meshes[i] is a plane piece drawn by the room mesh already (Quest captures
   * both). Kept in the scan for wall conversion, never drawn or picked.
   */
  private meshHidden: boolean[] = [];
  /** Bounded furniture meshes, movable in Stage 1. */
  private furniture: FurnitureEntry[] = [];
  /** Footprint center of a static mesh with a saved placement, by mesh index
   *  (computed on first use; see applyPlacements). */
  private staticPivots = new Map<number, THREE.Vector3>();
  /** Active scan geometry bounding box info. */
  private activeDimensions: RoomDimensions | null = null;
  /** Bounding box visualization group. */
  private boundsGroup = new THREE.Group();
  /**
   * Wireframe edge overlay of meshes[i], keyed by the same index. Built
   * lazily the first time Wireframe mode or the overlay is shown (an edge
   * geometry can outweigh its mesh), and parented to its mesh, so placements,
   * a grip carry and commitFurniture move it with the mesh. Empty until then.
   */
  private wireframeLines: THREE.LineSegments[] = [];
  /**
   * Photo mode: the textured original of an imported location, placed by its
   * source-to-scene transform (ScanSourceFile.transform). A child of group,
   * so floor leveling and the view transforms apply to it as to the scan.
   */
  private readonly photoGroup = new THREE.Group();
  private photoMaterials: THREE.MeshBasicMaterial[] = [];
  private photoTextures: THREE.Texture[] = [];
  /** Whether the current scan has a photo original, and how loading it went. */
  photoState: PhotoState = 'none';
  /** Blob id of the photo original on show, so a re-aligned scan can keep it. */
  photoSourceId: string | null = null;

  constructor() {
    this.group.name = 'location-scan';
    this.group.visible = false;
    this.boundsGroup.name = 'location-scan-bounds';
    this.boundsGroup.visible = false;
    this.group.add(this.boundsGroup);
    this.photoGroup.name = 'location-photo';
    this.photoGroup.matrixAutoUpdate = false;
    this.photoGroup.visible = false;
    this.group.add(this.photoGroup);
  }

  get hasScan(): boolean {
    return this.meshes.length > 0;
  }

  /** The textured original is loaded and Photo mode can show it. */
  get hasPhoto(): boolean {
    return this.photoState === 'ready';
  }

  /** The scan has a textured original that is being loaded (Photo shows Solid until then). */
  markPhotoLoading(): void {
    this.disposePhoto();
    this.photoState = 'loading';
    this.applyMode();
  }

  /** The original could not be loaded (missing on this device, unreadable, out of memory). */
  markPhotoFailed(): void {
    this.disposePhoto();
    this.photoState = 'failed';
    this.applyMode();
  }

  /**
   * Shows `root` (a parsed original with its textures) as Photo mode: every
   * mesh is baked into the root's space, re-materialled unlit, and merged per
   * material; textures over PHOTO_MAX_TEXTURE are downscaled. Takes ownership
   * of root's geometries and textures (disposed here or on clear).
   */
  setPhoto(root: THREE.Object3D, transform: ArrayLike<number>, sourceId: string | null = null): void {
    this.disposePhoto();
    root.updateMatrixWorld(true);
    const buckets = new Map<string, { material: THREE.MeshBasicMaterial; geoms: THREE.BufferGeometry[] }>();
    const textureFor = new Map<THREE.Texture, THREE.Texture>();
    const used: THREE.Mesh[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry?.getAttribute('position')) return;
      used.push(mesh);
      const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial | undefined;
      const srcMap = src?.map ?? null;
      const g = mesh.geometry;
      const hasUv = !!srcMap && !!g.getAttribute('uv');
      const hasColor = !!g.getAttribute('color');
      let map: THREE.Texture | null = null;
      if (hasUv && srcMap) {
        map = textureFor.get(srcMap) ?? downscaleTexture(srcMap);
        textureFor.set(srcMap, map);
      }
      const color = map || hasColor ? 0xffffff : (src?.color?.getHex() ?? DEFAULT_COLOR);
      const key = `${map ? map.uuid : 'nomap'}|${hasColor ? 'vc' : 'novc'}|${color}|${src?.side ?? THREE.FrontSide}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          material: new THREE.MeshBasicMaterial({ map, vertexColors: hasColor, color, side: src?.side ?? THREE.FrontSide }),
          geoms: [],
        };
        buckets.set(key, bucket);
      }
      // Only what an unlit draw needs, so parts merge and normals are not kept.
      const baked = new THREE.BufferGeometry();
      baked.setAttribute('position', g.getAttribute('position').clone());
      if (map) baked.setAttribute('uv', g.getAttribute('uv').clone());
      if (hasColor) baked.setAttribute('color', g.getAttribute('color').clone());
      if (g.index) baked.setIndex(g.index.clone());
      baked.applyMatrix4(mesh.matrixWorld);
      bucket.geoms.push(baked);
    });
    for (const { material, geoms } of buckets.values()) {
      this.photoMaterials.push(material);
      const indexed = geoms.every((x) => x.index);
      const merged = geoms.length > 1 && (indexed || geoms.every((x) => !x.index)) ? mergeGeometries(geoms, false) : null;
      const parts = merged ? [merged] : geoms;
      if (merged) for (const x of geoms) x.dispose();
      for (const part of parts) {
        const m = new THREE.Mesh(part, material);
        m.name = 'location-photo-part';
        m.raycast = noRaycast; // grabs and hover use the geometry scan
        this.photoGroup.add(m);
      }
    }
    // The parsed original is no longer needed: its geometry was copied, a
    // texture that was downscaled is replaced by its copy, and textures Photo
    // mode never draws (normal, roughness, ...) are freed with their images.
    const kept = new Set(textureFor.values());
    const unused = new Set<THREE.Texture>();
    for (const mesh of used) {
      mesh.geometry.dispose();
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!m) continue;
        for (const v of Object.values(m)) {
          if ((v as THREE.Texture)?.isTexture && !kept.has(v as THREE.Texture)) unused.add(v as THREE.Texture);
        }
        m.dispose();
      }
    }
    for (const tex of unused) {
      disposeTextureImage(tex);
      tex.dispose();
    }
    for (const tex of kept) this.photoTextures.push(tex);
    this.setPhotoTransform(transform);
    this.photoState = 'ready';
    this.photoSourceId = sourceId;
    this.applyMode();
  }

  // --- Align (P1.6): a pending move previewed on the group, baked on Apply ---

  /** Scan meshes a picking ray can hit (Align's scan points), while shown. */
  pickTargets(): THREE.Object3D[] {
    return this.mode === 'hidden' ? [] : this.meshes.filter((_, i) => !this.meshHidden[i]);
  }

  /** Back to the rest pose: scan coordinates are scene coordinates (plus the floor offset). */
  resetPose(): void {
    this.group.position.set(0, this.floorOffset, 0);
    this.group.quaternion.identity();
    this.group.scale.set(1, 1, 1);
  }

  /** Shows the scan moved by d (a preview; the data is unchanged until Apply bakes it). */
  previewDelta(d: RigidDelta): void {
    this.group.position.set(d.dx, this.floorOffset + d.dy, d.dz);
    this.group.rotation.set(0, d.rotY, 0);
  }

  /**
   * The move the group's current pose represents relative to rest, pure yaw
   * (pitch and roll from a hand-held carry are dropped). Assumes the group's
   * parent is contentRoot at its rest pose, which Align requires.
   */
  poseDelta(): RigidDelta {
    const q = this.group.quaternion;
    const p = this.group.position;
    return { dx: p.x, dy: p.y - this.floorOffset, dz: p.z, rotY: quatYaw(q.x, q.y, q.z, q.w) };
  }

  /** Re-places the photo original (after an Align moved the scan). */
  setPhotoTransform(transform: ArrayLike<number> | null | undefined): void {
    if (!transform || transform.length !== 16) return;
    this.photoGroup.matrix.fromArray(transform as number[]);
    this.photoGroup.matrixWorldNeedsUpdate = true;
  }

  /** Parts drawn in Photo mode (for tests and the headed smoke). */
  get photoPartCount(): number {
    return this.photoGroup.children.length;
  }

  /** Pixel sizes of the textures Photo mode keeps (for the headed smoke). */
  photoTextureSizes(): { width: number; height: number }[] {
    return this.photoTextures.map((t) => {
      const img = t.image as { width?: number; height?: number } | null;
      return { width: img?.width ?? 0, height: img?.height ?? 0 };
    });
  }

  private disposePhoto(): void {
    this.photoSourceId = null;
    for (const child of [...this.photoGroup.children]) {
      this.photoGroup.remove(child);
      (child as THREE.Mesh).geometry?.dispose();
    }
    for (const m of this.photoMaterials) m.dispose();
    for (const tex of this.photoTextures) {
      disposeTextureImage(tex);
      tex.dispose();
    }
    this.photoMaterials = [];
    this.photoTextures = [];
    this.photoState = 'none';
  }

  get dimensions(): RoomDimensions | null {
    return this.activeDimensions;
  }

  /**
   * Replaces the displayed scan (null clears). Disposes prior geometry, and the
   * photo original unless keepPhoto (the same original, e.g. after an Align
   * rebuilt the scan under a new id). Resets any Align preview pose.
   */
  setScan(scan: LocationScan | null, opts: { keepPhoto?: boolean } = {}): void {
    this.clear(!!opts.keepPhoto && !!scan);
    this.resetPose();
    if (!scan) {
      this.applyMode(); // nothing left to show
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    // A room mesh draws walls and floor already; plane pieces would double them.
    const hasRoomMesh = scan.meshes.some((m) => normalizeSemanticLabel(m.label) === GLOBAL_MESH_LABEL);

    scan.meshes.forEach((m, meshIndex) => {
      const geo = new THREE.BufferGeometry();
      const movable = isMovableScanMesh(m.label);
      let center = new THREE.Vector3();

      for (let i = 0; i + 2 < m.positions.length; i += 3) {
        const x = m.positions[i];
        const y = m.positions[i + 1];
        const z = m.positions[i + 2];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }

      if (movable) {
        // Re-center the geometry on its XZ footprint and put the offset in the
        // object's position, so yawing the mesh pivots the couch about itself
        // instead of orbiting the scene origin. The stored buffer is untouched.
        const c = meshFootprintCenter(m.positions);
        center = new THREE.Vector3(c.x, 0, c.z);
        const local = new Float32Array(m.positions);
        for (let i = 0; i + 2 < local.length; i += 3) {
          local[i] -= c.x;
          local[i + 2] -= c.z;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(local, 3));
      } else {
        geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
      }

      geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
      geo.computeVertexNormals();
      const color = labelColor(m.label);
      const mesh = new THREE.Mesh(geo, this.material(variantFor(this.mode), color));
      mesh.name = `scan:${m.label}`;
      if (movable) {
        mesh.position.copy(center);
        mesh.userData.scanMeshIndex = meshIndex;
        this.furniture.push({ mesh, meshIndex, label: normalizeSemanticLabel(m.label), center });
      }
      this.meshes.push(mesh);
      this.meshColors.push(color);
      this.meshHidden.push(hasRoomMesh && isPlaneLabel(m.label));
      this.group.add(mesh);
      // Wireframe overlay edges are built on first use (ensureWireframes).
    });

    if (minX !== Infinity) {
      this.activeDimensions = {
        min: new THREE.Vector3(minX, minY, minZ),
        max: new THREE.Vector3(maxX, maxY, maxZ),
        widthM: maxX - minX,
        depthM: maxZ - minZ,
        heightM: maxY - minY,
      };
      this.rebuildBoundingBox();
    }

    this.group.position.y = this.floorOffset;
    this.applyMode();
  }

  // --- floor leveling & alignment --------------------------------------------

  /** Sets vertical floor leveling offset in meters. */
  setFloorOffset(offsetY: number): void {
    this.floorOffset = offsetY;
    this.group.position.y = this.floorOffset;
  }

  /** Automatically adjusts floor level so the lowest floor geometry rests at y=0. */
  autoLevelFloor(): number {
    if (!this.activeDimensions) return 0;
    const lowestY = this.activeDimensions.min.y;
    const correction = -lowestY;
    this.setFloorOffset(correction);
    return correction;
  }

  // --- wireframe overlay & bounding box visualization ------------------------

  setWireframeOverlay(enabled: boolean): void {
    this.wireframeOverlay = enabled;
    this.applyWireVisibility();
  }

  toggleBounds(show?: boolean): boolean {
    this.showBounds = show !== undefined ? show : !this.showBounds;
    this.boundsGroup.visible = this.showBounds && this.mode !== 'hidden' && this.hasScan;
    return this.showBounds;
  }

  private rebuildBoundingBox(): void {
    while (this.boundsGroup.children.length > 0) {
      const child = this.boundsGroup.children[0];
      this.boundsGroup.remove(child);
      if ((child as THREE.Mesh).geometry) {
        (child as THREE.Mesh).geometry.dispose();
      }
    }

    if (!this.activeDimensions) return;
    const { min, max, widthM, depthM, heightM } = this.activeDimensions;
    if (widthM <= 0 || depthM <= 0 || heightM <= 0) return;

    const center = new THREE.Vector3(
      (min.x + max.x) / 2,
      (min.y + max.y) / 2,
      (min.z + max.z) / 2,
    );

    const boxGeo = new THREE.BoxGeometry(widthM, heightM, depthM);
    const wireGeo = new THREE.WireframeGeometry(boxGeo);
    boxGeo.dispose();

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x66ccff,
      transparent: true,
      opacity: 0.75,
    });

    const wireBox = new THREE.LineSegments(wireGeo, lineMat);
    wireBox.position.copy(center);
    this.boundsGroup.add(wireBox);
    this.boundsGroup.visible = this.showBounds && this.mode !== 'hidden';
  }

  // --- movable furniture (Stage 1) -------------------------------------------

  /**
   * Sets every mesh from its placement (absent entry = as captured). Static
   * pieces can carry one too: before labels were normalized everything except
   * the room shell was grabbable, so a wall, door or unlabeled piece may have
   * been moved. Those keep rendering where they were moved, but are not grab
   * targets any more.
   */
  applyPlacements(placements: FurniturePlacement[] | undefined): void {
    for (const f of this.furniture) {
      const p = placements?.find((x) => x.meshIndex === f.meshIndex);
      f.mesh.position.set(f.center.x + (p?.dx ?? 0), 0, f.center.z + (p?.dz ?? 0));
      f.mesh.rotation.set(0, p?.rotY ?? 0, 0);
      // A built wire overlay is the mesh's child, so it follows on its own.
    }
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      if (mesh.userData.scanMeshIndex !== undefined) continue; // furniture, set above
      const p = placements?.find((x) => x.meshIndex === i);
      if (!p) {
        mesh.position.set(0, 0, 0);
        mesh.rotation.set(0, 0, 0);
        continue;
      }
      // A static mesh's geometry is not re-centered (it shares the scan's
      // buffer), so yaw it about its footprint center c and then move it by
      // (dx, dz): position = c + d - R(rotY) c. Same result as furniture.
      let c = this.staticPivots.get(i);
      if (!c) {
        const fc = meshFootprintCenter(mesh.geometry.getAttribute('position').array as Float32Array);
        c = new THREE.Vector3(fc.x, 0, fc.z);
        this.staticPivots.set(i, c);
      }
      const cos = Math.cos(p.rotY);
      const sin = Math.sin(p.rotY);
      mesh.rotation.set(0, p.rotY, 0);
      mesh.position.set(c.x + p.dx - (c.x * cos + c.z * sin), 0, c.z + p.dz - (c.z * cos - c.x * sin));
    }
  }

  /** Raycast targets for grab - only while the scan is actually visible. */
  furnitureTargets(): THREE.Object3D[] {
    if (this.mode === 'hidden' || this.furniture.length === 0) return [];
    return this.furniture.map((f) => f.mesh);
  }

  furnitureLabel(meshIndex: number): string {
    return this.furniture.find((f) => f.meshIndex === meshIndex)?.label ?? 'furniture';
  }

  /**
   * Whether `mesh` is a furniture piece of the scan shown now. False once
   * setScan replaced (or removed) the scan it came from: clear() has then
   * detached and disposed it, and re-attaching it would leave a ghost that no
   * later clear() or hover list knows about.
   */
  ownsFurniture(mesh: THREE.Object3D): boolean {
    return this.furniture.some((f) => f.mesh === mesh);
  }

  /**
   * Settles a just-released (or drag-cancelled) furniture mesh back onto the
   * floor plane: position y to 0, rotation to pure yaw; returns placement.
   */
  commitFurniture(mesh: THREE.Object3D): FurniturePlacement | null {
    const f = this.furniture.find((x) => x.mesh === mesh);
    if (!f) return null;
    const q = mesh.quaternion;
    const rotY = quatYaw(q.x, q.y, q.z, q.w);
    mesh.position.y = 0;
    mesh.rotation.set(0, rotY, 0);
    return {
      meshIndex: f.meshIndex,
      dx: mesh.position.x - f.center.x,
      dz: mesh.position.z - f.center.z,
      rotY,
    };
  }

  setMode(mode: LocationMode): void {
    this.mode = mode;
    this.applyMode();
  }

  cycleMode(): LocationMode {
    // Photo joins the cycle only once the textured original has loaded.
    const order: LocationMode[] = this.hasPhoto
      ? ['hidden', 'ghost', 'solid', 'wireframe', 'photo']
      : ['hidden', 'ghost', 'solid', 'wireframe'];
    const at = order.indexOf(this.mode);
    this.setMode(order[(at < 0 ? 0 : at + 1) % order.length]);
    return this.mode;
  }

  /**
   * Forces the scan visible for the virtual camera's render pass (the textured
   * original when it is loaded, otherwise solid), so the monitor/captures show
   * shots composed inside the set even when the wearer has it hidden. Call
   * endCameraPass in a finally.
   */
  beginCameraPass(): void {
    if (this.cameraPassRestore !== null || !this.hasScan) return;
    this.cameraPassRestore = this.mode;
    this.mode = this.hasPhoto ? 'photo' : 'solid';
    this.applyMode();
  }

  endCameraPass(): void {
    if (this.cameraPassRestore === null) return;
    this.mode = this.cameraPassRestore;
    this.cameraPassRestore = null;
    this.applyMode();
  }

  /** The shared material for a variant and color, created with fixed flags. */
  private material(variant: MaterialVariant, color: number): THREE.MeshLambertMaterial {
    const set = this.materials[variant];
    let mat = set.get(color);
    if (!mat) {
      mat =
        variant === 'ghost'
          ? new THREE.MeshLambertMaterial({ color, transparent: true, opacity: GHOST_OPACITY, depthWrite: false })
          : variant === 'wireframe'
            ? new THREE.MeshLambertMaterial({
                color,
                transparent: true,
                opacity: WIREFRAME_OPACITY,
                depthWrite: false,
                wireframe: true,
              })
            : new THREE.MeshLambertMaterial({ color });
      set.set(color, mat);
    }
    return mat;
  }

  /** Runs on every mode change, including twice a frame during the camera
   *  pass: material swaps and visibility flags only, no allocation. */
  private applyMode(): void {
    this.group.visible = this.mode !== 'hidden' && this.hasScan;
    this.boundsGroup.visible = this.showBounds && this.mode !== 'hidden' && this.hasScan;

    // Photo shows the textured original instead of the scan meshes; until it
    // has loaded (or when it failed), Photo draws the scan as Solid.
    const photo = this.mode === 'photo' && this.hasPhoto;
    this.photoGroup.visible = photo;
    const variant = variantFor(this.mode);
    for (let i = 0; i < this.meshes.length; i++) {
      this.meshes[i].material = this.material(variant, this.meshColors[i]);
      this.meshes[i].visible = !photo && !this.meshHidden[i];
    }
    this.applyWireVisibility();
  }

  private applyWireVisibility(): void {
    const show = (this.wireframeOverlay || this.mode === 'wireframe') && this.mode !== 'hidden';
    if (show) this.ensureWireframes();
    for (let i = 0; i < this.wireframeLines.length; i++) this.wireframeLines[i].visible = show;
  }

  /** Builds the edge overlay for every mesh that lacks one (first use only). */
  private ensureWireframes(): void {
    for (let i = this.wireframeLines.length; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      const color = this.meshColors[i];
      let mat = this.wireMaterials.get(color);
      if (!mat) {
        mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.4 });
        this.wireMaterials.set(color, mat);
      }
      // Built from the mesh's own (possibly re-centered) geometry and parented
      // to it with an identity local transform, so it lines up and moves with it.
      const wire = new THREE.LineSegments(new THREE.WireframeGeometry(mesh.geometry), mat);
      wire.name = `scan-wire:${i}`;
      wire.raycast = noRaycast;
      mesh.add(wire);
      this.wireframeLines.push(wire);
    }
  }

  private clear(keepPhoto = false): void {
    // Meshes may sit outside this.group (a grip carry re-parents one to the
    // controller ray), so detach through the mesh list rather than children.
    for (const mesh of this.meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    for (const wire of this.wireframeLines) wire.geometry.dispose();
    this.meshes = [];
    this.meshColors = [];
    this.meshHidden = [];
    this.furniture = [];
    this.staticPivots.clear();
    this.wireframeLines = [];
    this.activeDimensions = null;
    // The photo original belongs to the scan it was imported with, unless the
    // caller is swapping in a re-aligned copy of the same scan.
    if (!keepPhoto) this.disposePhoto();
    while (this.boundsGroup.children.length > 0) {
      const b = this.boundsGroup.children[0];
      this.boundsGroup.remove(b);
      (b as THREE.Mesh).geometry?.dispose();
    }
  }
}

/** Frees the pixel data behind a texture (ImageBitmap) when the browser allows it. */
function disposeTextureImage(tex: THREE.Texture): void {
  const img = tex.image as { close?: () => void } | null;
  if (img && typeof img.close === 'function') img.close();
}

/**
 * The texture itself when it fits PHOTO_MAX_TEXTURE (or cannot be redrawn,
 * e.g. GPU-compressed KTX2), otherwise a downscaled canvas copy with the same
 * sampling settings. Runs once per texture at load, never per frame.
 */
function downscaleTexture(tex: THREE.Texture): THREE.Texture {
  const img = tex.image as (CanvasImageSource & { width: number; height: number }) | null;
  if (!img || (tex as THREE.CompressedTexture).isCompressedTexture || typeof document === 'undefined') return tex;
  const size = fitTextureSize(img.width, img.height);
  if (size.width === img.width && size.height === img.height) return tex;
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return tex;
  ctx.drawImage(img, 0, 0, size.width, size.height);
  const copy = new THREE.CanvasTexture(canvas);
  copy.colorSpace = tex.colorSpace;
  copy.flipY = tex.flipY;
  copy.wrapS = tex.wrapS;
  copy.wrapT = tex.wrapT;
  copy.channel = tex.channel;
  copy.offset.copy(tex.offset);
  copy.repeat.copy(tex.repeat);
  copy.rotation = tex.rotation;
  copy.center.copy(tex.center);
  return copy;
}

function variantFor(mode: LocationMode): MaterialVariant {
  // Hidden draws nothing; it keeps the solid set so the camera pass, which
  // forces solid, finds the meshes already on it. Photo falls back to solid.
  return mode === 'ghost' ? 'ghost' : mode === 'wireframe' ? 'wireframe' : 'solid';
}

function labelColor(label: string): number {
  // Normalized so scans stored before label normalization still tint right.
  return LABEL_COLORS[baseScanLabel(normalizeSemanticLabel(label))] ?? DEFAULT_COLOR;
}
