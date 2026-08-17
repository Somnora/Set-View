// ---------------------------------------------------------------------------
// Prop & Set Asset 3D Lifecycle Manager
//
// Bridges SceneData.props and Three.js scene graph:
//   - Root group for all 3D props attached to contentRoot
//   - Selection bounding box visuals, floor hit testing, and dragging
//   - High-performance zero-allocation per-frame transform updates
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import type { PropData, SceneData, Vec3 } from './model.ts';
import { calculatePropAABB, createPropData, duplicatePropData, getBuiltinPropDefinition } from './props.ts';
import { globalPropRenderer } from './propRenderer.ts';
import type { SessionManager } from './session.ts';
import { disposeTree, makeLabel, type Label } from './ui.ts';

export interface PropObject {
  data: PropData;
  root: THREE.Group;
  contentGroup: THREE.Group;
  label: Label;
  selectionBox: THREE.LineSegments | null;
  footprintRing: THREE.Mesh | null;
  anchor: XRAnchor | null;
  overridden: boolean;
}

export class PropsManager {
  readonly group = new THREE.Group();

  private objects = new Map<string, PropObject>();
  readonly session: SessionManager;
  private scene: SceneData;
  private selectedId: string | null = null;

  constructor(session: SessionManager, scene: SceneData) {
    this.session = session;
    this.scene = scene;
    this.group.name = 'props_manager_root';
  }

  setScene(scene: SceneData): void {
    this.scene = scene;
    this.clear();
    if (scene.props) {
      for (const p of scene.props) {
        this.buildObject(p);
      }
    }
  }

  clear(): void {
    for (const obj of this.objects.values()) {
      obj.anchor?.delete?.();
      this.group.remove(obj.root);
      disposeTree(obj.root);
    }
    this.objects.clear();
    this.selectedId = null;
  }

  all(): PropObject[] {
    return Array.from(this.objects.values());
  }

  get(id: string): PropObject | undefined {
    return this.objects.get(id);
  }

  getSelected(): PropObject | undefined {
    return this.selectedId ? this.objects.get(this.selectedId) : undefined;
  }

  setSelected(id: string | null): void {
    if (this.selectedId === id) return;
    if (this.selectedId) {
      const prev = this.objects.get(this.selectedId);
      if (prev && prev.selectionBox) prev.selectionBox.visible = false;
    }
    this.selectedId = id;
    if (this.selectedId) {
      const curr = this.objects.get(this.selectedId);
      if (curr && curr.selectionBox) curr.selectionBox.visible = true;
    }
  }

  /** Spawns a new prop into the scene and 3D viewport. */
  async addProp(assetId: string, position: Vec3, options: Partial<PropData> = {}): Promise<PropObject> {
    const data = createPropData(assetId, options.name, position, options);
    if (!this.scene.props) this.scene.props = [];
    this.scene.props.push(data);

    const obj = await this.buildObject(data);
    this.setSelected(data.id);
    return obj;
  }

  /** Duplicates an existing prop with an offset. */
  async duplicateProp(id: string, offset: Vec3 = { x: 0.4, y: 0, z: 0.4 }): Promise<PropObject | null> {
    const src = this.objects.get(id);
    if (!src) return null;

    const dupData = duplicatePropData(src.data, offset);
    if (!this.scene.props) this.scene.props = [];
    this.scene.props.push(dupData);

    const obj = await this.buildObject(dupData);
    this.setSelected(dupData.id);
    return obj;
  }

  /** Removes a prop from the scene and 3D graph. */
  removeProp(id: string): boolean {
    const obj = this.objects.get(id);
    if (!obj) return false;

    obj.anchor?.delete?.();
    this.group.remove(obj.root);
    disposeTree(obj.root);
    this.objects.delete(id);

    if (this.scene.props) {
      const idx = this.scene.props.findIndex((p) => p.id === id);
      if (idx >= 0) this.scene.props.splice(idx, 1);
    }
    if (this.selectedId === id) this.selectedId = null;
    return true;
  }

  /** Updates an existing prop's transform and appearance. */
  updateProp(id: string, updates: Partial<PropData>): void {
    const obj = this.objects.get(id);
    if (!obj) return;

    Object.assign(obj.data, updates);

    if (updates.position) {
      obj.root.position.set(obj.data.position.x, obj.data.position.y, obj.data.position.z);
    }
    if (updates.rotationY !== undefined) {
      obj.root.rotation.y = obj.data.rotationY;
    }
    if (updates.scale) {
      obj.root.scale.set(obj.data.scale.x, obj.data.scale.y, obj.data.scale.z);
    }
    if (updates.name && obj.label) {
      obj.label.setText(obj.data.name);
    }
  }

  /** Meshes for hover/select raycasting; carries userData.propId. */
  raycastTargets(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const obj of this.objects.values()) {
      if (obj.data.visible !== false) out.push(obj.root);
    }
    return out;
  }

  /** Sets hover visualizer outline. */
  setHovered(id: string | null): void {
    for (const [key, obj] of this.objects.entries()) {
      if (obj.selectionBox && key !== this.selectedId) {
        obj.selectionBox.visible = key === id;
      }
    }
  }

  /** Billboards/helpers that should be hidden during virtual camera capture. */
  overlayObjects(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const obj of this.objects.values()) {
      if (obj.label?.sprite) out.push(obj.label.sprite);
      if (obj.footprintRing) out.push(obj.footprintRing);
      if (obj.selectionBox) out.push(obj.selectionBox);
    }
    return out;
  }

  private async buildObject(data: PropData): Promise<PropObject> {
    const root = new THREE.Group();
    root.name = `prop_root_${data.id}`;
    root.userData.propId = data.id;
    root.position.set(data.position.x, data.position.y, data.position.z);
    root.rotation.y = data.rotationY;
    root.scale.set(data.scale.x, data.scale.y, data.scale.z);

    const contentGroup = await globalPropRenderer.createPropMesh(data);
    root.add(contentGroup);

    // Compute dimensions for bounding box and label
    const def = getBuiltinPropDefinition(data.assetId);
    const aabb = calculatePropAABB(data, def);

    // Bounding box selection visualizer
    const selectionBox = globalPropRenderer.createSelectionGizmo(aabb.size, 0x38bdf8);
    selectionBox.visible = this.selectedId === data.id;
    root.add(selectionBox);

    // Floor footprint ring
    const footprintGeo = new THREE.RingGeometry(0.2, 0.24, 24);
    const footprintMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
    });
    const footprintRing = new THREE.Mesh(footprintGeo, footprintMat);
    footprintRing.rotation.x = -Math.PI / 2;
    footprintRing.position.y = 0.01;
    root.add(footprintRing);

    // Floating text label
    const label = makeLabel(data.name, 0.055, {
      fontPx: 38,
      bg: 'rgba(15, 23, 42, 0.85)',
      fg: '#e2e8f0',
    });
    label.sprite.position.set(0, aabb.size.y + 0.25, 0);
    root.add(label.sprite);

    const obj: PropObject = {
      data,
      root,
      contentGroup,
      label,
      selectionBox,
      footprintRing,
      anchor: null,
      overridden: false,
    };

    this.objects.set(data.id, obj);
    this.group.add(root);
    return obj;
  }

  /** Raycasts against all props in the scene. */
  raycast(raycaster: THREE.Raycaster): { object: PropObject; point: THREE.Vector3; distance: number } | null {
    let closest: { object: PropObject; point: THREE.Vector3; distance: number } | null = null;

    for (const obj of this.objects.values()) {
      if (!obj.data.visible) continue;
      const intersects = raycaster.intersectObject(obj.root, true);
      if (intersects.length > 0) {
        const hit = intersects[0];
        if (!closest || hit.distance < closest.distance) {
          closest = {
            object: obj,
            point: hit.point,
            distance: hit.distance,
          };
        }
      }
    }
    return closest;
  }
}
