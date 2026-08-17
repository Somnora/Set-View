// ---------------------------------------------------------------------------
// SetView 3D Spatial Set Dressing, Semantic Region & AI Ghost Visualizer
// ZERO per-frame heap allocation discipline during render and update loops.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import type { SceneData } from './model.ts';
import type {
  ScatterRegion,
  SettledPropItem,
  SetDressingConfig,
} from './setDressingEngine.ts';

// Scratch objects to ensure zero per-frame garbage collection
const _c1 = new THREE.Color();

export class SetDressingRenderer {
  public readonly group: THREE.Group;

  // Region visualization group
  private readonly regionsGroup: THREE.Group;
  private readonly regionMeshes: Map<string, { box: THREE.LineSegments; fill: THREE.Mesh }> = new Map();

  // Settled props visual group
  private readonly settledPropsGroup: THREE.Group;
  private readonly propMeshes: Map<string, THREE.Mesh> = new Map();

  // Ghost preview group (for proposed AI scatter mutations before acceptance)
  private readonly ghostPropsGroup: THREE.Group;
  private readonly ghostMeshes: THREE.Mesh[] = [];

  // Shared reusable geometries and materials
  private readonly unitBoxGeo: THREE.BoxGeometry;
  private readonly unitCylinderGeo: THREE.CylinderGeometry;
  private readonly boxEdgesGeo: THREE.EdgesGeometry;

  // Region materials
  private readonly floorWireMat: THREE.LineBasicMaterial;
  private readonly floorFillMat: THREE.MeshBasicMaterial;
  private readonly tableWireMat: THREE.LineBasicMaterial;
  private readonly tableFillMat: THREE.MeshBasicMaterial;
  private readonly wallWireMat: THREE.LineBasicMaterial;
  private readonly wallFillMat: THREE.MeshBasicMaterial;

  // Ghost material
  private readonly ghostMaterial: THREE.MeshBasicMaterial;

  private isVisible: boolean = true;

  constructor(initialConfig?: SetDressingConfig) {
    this.group = new THREE.Group();
    this.group.name = 'SetDressingRenderer';


    this.regionsGroup = new THREE.Group();
    this.regionsGroup.name = 'ScatterRegions';
    this.group.add(this.regionsGroup);

    this.settledPropsGroup = new THREE.Group();
    this.settledPropsGroup.name = 'SettledProps';
    this.group.add(this.settledPropsGroup);

    this.ghostPropsGroup = new THREE.Group();
    this.ghostPropsGroup.name = 'GhostProps';
    this.group.add(this.ghostPropsGroup);

    // Reusable Unit Geometries
    this.unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.unitCylinderGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
    this.boxEdgesGeo = new THREE.EdgesGeometry(this.unitBoxGeo);

    // Semantic Region Materials
    // Floor: Cyan
    this.floorWireMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, linewidth: 2 });
    this.floorFillMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Tabletop: Amber
    this.tableWireMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 2 });
    this.tableFillMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Wall / Perimeter: Purple
    this.wallWireMat = new THREE.LineBasicMaterial({ color: 0xa855f7, linewidth: 2 });
    this.wallFillMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Ghost Preview Material (Pulsing cyan/emerald ghost look)
    this.ghostMaterial = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });

    if (initialConfig) {
      this.setConfig(initialConfig);
    }
  }

  /**
   * Toggles visibility of the entire set dressing renderer.
   */
  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.group.visible = visible;
  }

  /**
   * Toggles visibility of semantic region bounding boxes.
   */
  public setShowRegions(show: boolean): void {
    this.regionsGroup.visible = show;
  }

  /**
   * Sets new set dressing configuration directly.
   */
  public setConfig(config: SetDressingConfig, ghostItems?: SettledPropItem[]): void {
    if (!this.isVisible) return;
    this.syncRegions(config.regions || []);
    this.syncSettledProps(config.settledItems || []);
    this.syncGhostProps(ghostItems || []);
  }

  /**
   * Main scene update function. Call whenever scene data or set dressing changes.
   */
  public update(sceneData: SceneData, ghostItems?: SettledPropItem[]): void {
    if (!this.isVisible) return;

    const dressing: SetDressingConfig | undefined = sceneData.setDressing;
    const regions: ScatterRegion[] = dressing?.regions || [];
    const settledItems: SettledPropItem[] = dressing?.settledItems || [];

    // 1. Sync Scatter Regions
    this.syncRegions(regions);

    // 2. Sync Settled Props
    this.syncSettledProps(settledItems);

    // 3. Sync Ghost Previews (if any pending AI mutations)
    this.syncGhostProps(ghostItems || []);
  }


  private syncRegions(regions: ScatterRegion[]): void {
    const activeRegionIds = new Set<string>();

    for (const reg of regions) {
      activeRegionIds.add(reg.id);

      const dx = Math.max(0.01, reg.bounds.max.x - reg.bounds.min.x);
      const dy = Math.max(0.01, reg.bounds.max.y - reg.bounds.min.y);
      const dz = Math.max(0.01, reg.bounds.max.z - reg.bounds.min.z);

      const cx = (reg.bounds.min.x + reg.bounds.max.x) * 0.5;
      const cy = (reg.bounds.min.y + reg.bounds.max.y) * 0.5;
      const cz = (reg.bounds.min.z + reg.bounds.max.z) * 0.5;

      let entry = this.regionMeshes.get(reg.id);
      if (!entry) {
        let wireMat = this.floorWireMat;
        let fillMat = this.floorFillMat;

        if (reg.type === 'tabletop') {
          wireMat = this.tableWireMat;
          fillMat = this.tableFillMat;
        } else if (reg.type === 'wall' || reg.type === 'perimeter') {
          wireMat = this.wallWireMat;
          fillMat = this.wallFillMat;
        }

        const box = new THREE.LineSegments(this.boxEdgesGeo, wireMat);
        const fill = new THREE.Mesh(this.unitBoxGeo, fillMat);

        box.name = `Region_Box_${reg.id}`;
        fill.name = `Region_Fill_${reg.id}`;

        this.regionsGroup.add(box);
        this.regionsGroup.add(fill);

        entry = { box, fill };
        this.regionMeshes.set(reg.id, entry);
      }

      entry.box.position.set(cx, cy, cz);
      entry.box.scale.set(dx, dy, dz);

      entry.fill.position.set(cx, cy, cz);
      entry.fill.scale.set(dx, dy, dz);
    }

    // Clean up removed regions
    for (const [id, entry] of this.regionMeshes.entries()) {
      if (!activeRegionIds.has(id)) {
        this.regionsGroup.remove(entry.box);
        this.regionsGroup.remove(entry.fill);
        this.regionMeshes.delete(id);
      }
    }
  }

  private syncSettledProps(items: SettledPropItem[]): void {
    const activeItemIds = new Set<string>();

    for (const item of items) {
      activeItemIds.add(item.id);

      let mesh = this.propMeshes.get(item.id);
      if (!mesh) {
        const mat = new THREE.MeshLambertMaterial({
          color: _c1.set(item.color || '#94a3b8'),
          transparent: true,
          opacity: 0.9,
        });

        const isCylinder = item.propType.includes('pipe') || item.propType.includes('canister') || item.propType.includes('phone');
        mesh = new THREE.Mesh(isCylinder ? this.unitCylinderGeo : this.unitBoxGeo, mat);
        mesh.name = `SettledProp_${item.id}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        this.settledPropsGroup.add(mesh);
        this.propMeshes.set(item.id, mesh);
      }

      // Update position, rotation, and scale without heap allocation
      mesh.position.set(item.position.x, item.position.y + (item.scale.y * 0.5), item.position.z);
      mesh.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z);
      mesh.scale.set(
        Math.max(0.05, item.scale.x),
        Math.max(0.05, item.scale.y),
        Math.max(0.05, item.scale.z),
      );
    }

    // Clean up removed items
    for (const [id, mesh] of this.propMeshes.entries()) {
      if (!activeItemIds.has(id)) {
        this.settledPropsGroup.remove(mesh);
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
        this.propMeshes.delete(id);
      }
    }
  }

  private syncGhostProps(ghosts: SettledPropItem[]): void {
    // Hide extra ghost meshes
    while (this.ghostMeshes.length < ghosts.length) {
      const mesh = new THREE.Mesh(this.unitBoxGeo, this.ghostMaterial);
      mesh.name = `Ghost_Prop_${this.ghostMeshes.length}`;
      this.ghostPropsGroup.add(mesh);
      this.ghostMeshes.push(mesh);
    }

    for (let i = 0; i < this.ghostMeshes.length; i++) {
      const mesh = this.ghostMeshes[i];
      if (i < ghosts.length) {
        const item = ghosts[i];
        mesh.visible = true;
        mesh.position.set(item.position.x, item.position.y + (item.scale.y * 0.5), item.position.z);
        mesh.rotation.set(item.rotation.x, item.rotation.y, item.rotation.z);
        mesh.scale.set(item.scale.x, item.scale.y, item.scale.z);
      } else {
        mesh.visible = false;
      }
    }
  }

  /**
   * Disposes of all allocated Three.js resources.
   */
  public dispose(): void {
    this.unitBoxGeo.dispose();
    this.unitCylinderGeo.dispose();
    this.boxEdgesGeo.dispose();

    this.floorWireMat.dispose();
    this.floorFillMat.dispose();
    this.tableWireMat.dispose();
    this.tableFillMat.dispose();
    this.wallWireMat.dispose();
    this.wallFillMat.dispose();
    this.ghostMaterial.dispose();

    for (const entry of this.regionMeshes.values()) {
      this.regionsGroup.remove(entry.box);
      this.regionsGroup.remove(entry.fill);
    }
    this.regionMeshes.clear();

    for (const mesh of this.propMeshes.values()) {
      this.settledPropsGroup.remove(mesh);
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else mesh.material.dispose();
    }
    this.propMeshes.clear();

    for (const ghost of this.ghostMeshes) {
      this.ghostPropsGroup.remove(ghost);
    }
    this.ghostMeshes.length = 0;
  }
}
