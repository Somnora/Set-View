// ---------------------------------------------------------------------------
// SetView Contextual Radial Quick-Action View
// Floating 3D spatial arc displaying contextual entity actions near selections.
// Provides tactile raycast hover, click/pinch detection, and haptic feedback.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import {
  generateEntityContextActions,
  type ContextQuickAction,
} from './spatialInteraction.ts';
import { globalSpatialFeedback } from './spatialFeedback.ts';

export interface RadialActionCallback {
  (action: ContextQuickAction, entityId: string, entityType: string): void;
}

interface RadialButtonEntry {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  texture: THREE.CanvasTexture;
  action: ContextQuickAction;
  basePosition: THREE.Vector3;
}

export class ContextualRadialView {
  readonly group = new THREE.Group();

  private buttons: RadialButtonEntry[] = [];
  private activeEntityType: string | null = null;
  private activeEntityId: string | null = null;
  private hoveredButton: RadialButtonEntry | null = null;
  private onActionCallback: RadialActionCallback | null = null;

  // Reusable vectors to avoid allocations in update loop
  private readonly tempCamPos = new THREE.Vector3();
  private readonly tempTarget = new THREE.Vector3();

  constructor() {
    this.group.name = 'ContextualRadialView';
    this.group.visible = false;
  }

  /** Registers callback invoked when a quick action is activated. */
  public setOnAction(callback: RadialActionCallback): void {
    this.onActionCallback = callback;
  }

  /**
   * Displays the contextual radial arc menu for the selected entity at its world position.
   */
  public show(
    entityType: 'camera' | 'actor' | 'light' | 'prop' | 'wall' | 'splat',
    entityId: string,
    worldPosition: THREE.Vector3,
    metadata?: Record<string, unknown>,
  ): void {
    this.clearButtons();

    this.activeEntityType = entityType;
    this.activeEntityId = entityId;

    const actions = generateEntityContextActions(entityType, entityId, metadata);
    if (actions.length === 0) {
      this.hide();
      return;
    }

    this.group.position.copy(worldPosition);
    this.group.position.y += 0.35; // Position slightly above entity center

    this.buildActionButtons(actions);
    this.group.visible = true;

    // Tactile audio & haptic cue on menu appearance
    globalSpatialFeedback.playSpatialSound('whoosh', {
      x: worldPosition.x,
      y: worldPosition.y,
      z: worldPosition.z,
    });
    globalSpatialFeedback.triggerHaptic('both', 'tick');
  }

  /** Hides the contextual radial menu. */
  public hide(): void {
    this.group.visible = false;
    this.activeEntityId = null;
    this.activeEntityType = null;
    this.hoveredButton = null;
    this.clearButtons();
  }

  /** Returns whether radial menu is currently active and visible. */
  public isVisible(): boolean {
    return this.group.visible;
  }

  /** Returns active entity ID. */
  public getActiveEntityId(): string | null {
    return this.activeEntityId;
  }

  private clearButtons(): void {
    for (const btn of this.buttons) {
      this.group.remove(btn.mesh);
      btn.mesh.geometry.dispose();
      btn.material.dispose();
      btn.texture.dispose();
    }
    this.buttons = [];
  }

  private buildActionButtons(actions: ContextQuickAction[]): void {
    const count = actions.length;
    const arcRadius = 0.32; // Meters from center
    const totalArcRad = Math.min(Math.PI * 0.85, count * 0.38);
    const startAngle = -totalArcRad * 0.5;
    const angleStep = count > 1 ? totalArcRad / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      const action = actions[i];
      const angle = count === 1 ? 0 : startAngle + i * angleStep;

      // Arc layout on XY plane of local group
      const x = Math.sin(angle) * arcRadius;
      const y = Math.cos(angle) * arcRadius * 0.5 + 0.1;
      const z = 0;

      const texture = this.createButtonCanvasTexture(action.label, action.icon);
      const mat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: false,
      });

      const geo = new THREE.CircleGeometry(0.065, 32);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.userData = { isRadialButton: true, actionId: action.id, index: i };
      mesh.renderOrder = 999;

      this.group.add(mesh);

      const entry: RadialButtonEntry = {
        mesh,
        material: mat,
        texture,
        action,
        basePosition: new THREE.Vector3(x, y, z),
      };

      this.buttons.push(entry);
    }
  }

  private createButtonCanvasTexture(label: string, icon: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Outer circular disc
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(18, 24, 38, 0.92)';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.75)';
    ctx.stroke();

    // Icon
    ctx.font = '64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, 128, 96);

    // Label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(label, 128, 178);

    const texture = new THREE.CanvasTexture(canvas);
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    return texture;
  }

  /**
   * Smoothly orients radial menu towards the viewer camera.
   */
  public update(camera: THREE.Camera): void {
    if (!this.group.visible) return;

    camera.getWorldPosition(this.tempCamPos);
    this.tempTarget.copy(this.group.position);
    this.group.lookAt(this.tempCamPos);
  }

  /**
   * Evaluates raycast hits on radial buttons, updates hover state and returns clicked action.
   */
  public handlePointer(raycaster: THREE.Raycaster, isClick: boolean): ContextQuickAction | null {
    if (!this.group.visible || this.buttons.length === 0) return null;

    const meshes = this.buttons.map((b) => b.mesh);
    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hitMesh = intersects[0].object as THREE.Mesh;
      const entry = this.buttons.find((b) => b.mesh === hitMesh);

      if (entry) {
        if (this.hoveredButton !== entry) {
          this.hoveredButton = entry;
          entry.mesh.scale.set(1.15, 1.15, 1.15);
          globalSpatialFeedback.triggerHaptic('both', 'tick');
        }

        if (isClick) {
          globalSpatialFeedback.playSpatialSound('snap', {
            x: entry.mesh.position.x,
            y: entry.mesh.position.y,
            z: entry.mesh.position.z,
          });
          globalSpatialFeedback.triggerHaptic('both', 'snap');

          if (this.onActionCallback && this.activeEntityId && this.activeEntityType) {
            this.onActionCallback(entry.action, this.activeEntityId, this.activeEntityType);
          }
          return entry.action;
        }
      }
    } else {
      if (this.hoveredButton) {
        this.hoveredButton.mesh.scale.set(1.0, 1.0, 1.0);
        this.hoveredButton = null;
      }
    }

    return null;
  }
}
