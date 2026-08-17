// ---------------------------------------------------------------------------
// Interactive Spatial Transform Gizmo (Translate, Rotate, Scale)
//
// Full-featured 3D manipulation widget for SetView:
//   - Translate: X/Y/Z arrow handles + XY/XZ/YZ plane squares + central sphere
//   - Rotate: X/Y/Z torus rings + camera-facing screen trackball billboard ring
//   - Scale: X/Y/Z box handles + central uniform scale cube
//   - Color coded: X (#ef4444 Red), Y (#22c55e Green), Z (#3b82f6 Blue),
//     Central/Uniform (#f59e0b Amber), Hover/Active (#38bdf8 Sky)
//   - Constant screen size scaling dynamically adjusted to camera distance
//   - Support for actor, camera, light, and prop target attachment
//   - Zero per-frame allocations during drag updates
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import {
  applyGizmoRotation,
  applyGizmoRotationQuat,
  applyGizmoScale,
  applyGizmoTranslation,
  applyGizmoUniformScale,
  calculateAxisRayOffset,
  calculatePlaneRayIntersection,
  calculateRotationAngleOnPlane,
  calculateScaleDelta,
  DEFAULT_GIZMO_SNAP_CONFIG,
  type GizmoAxis,
  type GizmoMode,
  type GizmoSnapConfig,
  type Quat,
  type Vec3,
} from './gizmoMath.ts';
import type { LightData } from './model.ts';
import type { ActorObject } from './actors.ts';
import type { CamObject } from './cameraView.ts';
import type { PropObject } from './propsManager.ts';

// --- Color Constants ---------------------------------------------------------

export const GIZMO_COLORS = {
  x: 0xef4444, // Red
  y: 0x22c55e, // Green
  z: 0x3b82f6, // Blue
  xy: 0xeab308, // Yellow
  xz: 0xec4899, // Pink
  yz: 0x06b6d4, // Cyan
  uniform: 0xf59e0b, // Amber
  screen: 0xf59e0b, // Amber
  hover: 0x38bdf8, // Sky Blue
  active: 0x38bdf8, // Sky Blue
} as const;

// --- Scratch Memory (Zero allocations during drag frames) ---------------------

const _scratchDir = new THREE.Vector3();
const _scratchAxisOrigin = new THREE.Vector3();
const _scratchAxisDir = new THREE.Vector3();
const _scratchPlaneNormal = new THREE.Vector3();
const _scratchCamPos = new THREE.Vector3();
const _scratchTargetPos = new THREE.Vector3();
const _scratchDeltaPos = new THREE.Vector3();
const _scratchQuat = new THREE.Quaternion();
const _scratchEuler = new THREE.Euler();
const _scratchRaycaster = new THREE.Raycaster();

export type GizmoTargetKind = 'actor' | 'camera' | 'light' | 'prop' | 'object3d';

export interface GizmoTarget {
  kind: GizmoTargetKind;
  id: string;
  root: THREE.Object3D;
  getPosition: () => Vec3;
  setPosition: (pos: Vec3) => void;
  getRotation?: () => Quat | number | Vec3;
  setRotation?: (rot: Quat | number | Vec3) => void;
  getScale?: () => Vec3 | number;
  setScale?: (scale: Vec3 | number) => void;
  data?: unknown;
}

export interface GizmoEvents {
  onDragStart?: (target: GizmoTarget | null, axis: GizmoAxis, mode: GizmoMode) => void;
  onTransform?: (target: GizmoTarget, mode: GizmoMode, axis: GizmoAxis) => void;
  onDragEnd?: (target: GizmoTarget | null, axis: GizmoAxis, mode: GizmoMode) => void;
  onHoverChange?: (axis: GizmoAxis | null) => void;
}

export class TransformGizmo {
  /** Root visual group for the gizmo in the Three.js scene graph. */
  readonly root = new THREE.Group();

  private mode: GizmoMode = 'translate';
  private snapConfig: GizmoSnapConfig = { ...DEFAULT_GIZMO_SNAP_CONFIG };
  private target: GizmoTarget | null = null;
  private space: 'world' | 'local' = 'world';

  // Sub-groups per mode
  private translateGroup = new THREE.Group();
  private rotateGroup = new THREE.Group();
  private scaleGroup = new THREE.Group();
  private screenBillboardGroup = new THREE.Group();

  // Handle mesh collections for hit-testing and hovering
  private handles: THREE.Mesh[] = [];
  private handleMaterials = new Map<THREE.Mesh, { defaultMat: THREE.Material; highlightMat: THREE.Material }>();

  // Drag State Machine
  private isDragging = false;
  private activeAxis: GizmoAxis | null = null;
  private hoveredAxis: GizmoAxis | null = null;

  // Initial transform state captured at drag start
  private dragInitialPos: Vec3 = { x: 0, y: 0, z: 0 };
  private dragInitialRotQuat: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private dragInitialRotY = 0;
  private dragInitialRotEuler: Vec3 = { x: 0, y: 0, z: 0 };
  private dragInitialScaleVec: Vec3 = { x: 1, y: 1, z: 1 };
  private dragInitialScaleScalar = 1;

  // Interaction intersection anchors
  private dragStartHitPoint: Vec3 = { x: 0, y: 0, z: 0 };
  private dragStartAxisOffset = 0;
  private dragStartRefDir: Vec3 = { x: 1, y: 0, z: 0 };
  private dragPlaneNormal: Vec3 = { x: 0, y: 1, z: 0 };
  private dragPlaneOrigin: Vec3 = { x: 0, y: 0, z: 0 };
  private dragAxisDir: Vec3 = { x: 1, y: 0, z: 0 };

  events: GizmoEvents = {};

  constructor() {
    this.root.name = 'TransformGizmo_Root';
    this.root.visible = false;
    this.root.renderOrder = 9999;

    this.root.add(this.translateGroup);
    this.root.add(this.rotateGroup);
    this.root.add(this.scaleGroup);
    this.rotateGroup.add(this.screenBillboardGroup);

    this.buildTranslateHandles();
    this.buildRotateHandles();
    this.buildScaleHandles();

    this.setMode('translate');
  }

  // --- Handle Mesh Builders --------------------------------------------------

  private createMaterial(color: number, opacity = 1.0): { defaultMat: THREE.MeshBasicMaterial; highlightMat: THREE.MeshBasicMaterial } {
    const defaultMat = new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1.0,
      opacity,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const highlightMat = new THREE.MeshBasicMaterial({
      color: GIZMO_COLORS.hover,
      transparent: opacity < 1.0,
      opacity: Math.min(1.0, opacity + 0.2),
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    return { defaultMat, highlightMat };
  }

  private registerHandle(mesh: THREE.Mesh, axis: GizmoAxis, mode: GizmoMode, mats: { defaultMat: THREE.Material; highlightMat: THREE.Material }): void {
    mesh.userData = { axis, mode, isGizmoHandle: true };
    this.handles.push(mesh);
    this.handleMaterials.set(mesh, mats);
  }

  private buildTranslateHandles(): void {
    const arrowLen = 0.75;
    const arrowRadius = 0.018;
    const coneLen = 0.22;
    const coneRadius = 0.06;

    // X Axis Handle (Red)
    const xMats = this.createMaterial(GIZMO_COLORS.x);
    const xCyl = new THREE.Mesh(new THREE.CylinderGeometry(arrowRadius, arrowRadius, arrowLen, 12), xMats.defaultMat);
    xCyl.position.x = arrowLen * 0.5;
    xCyl.rotation.z = -Math.PI * 0.5;
    const xCone = new THREE.Mesh(new THREE.ConeGeometry(coneRadius, coneLen, 16), xMats.defaultMat);
    xCone.position.x = arrowLen + coneLen * 0.5;
    xCone.rotation.z = -Math.PI * 0.5;
    this.registerHandle(xCyl, 'x', 'translate', xMats);
    this.registerHandle(xCone, 'x', 'translate', xMats);
    this.translateGroup.add(xCyl, xCone);

    // Y Axis Handle (Green)
    const yMats = this.createMaterial(GIZMO_COLORS.y);
    const yCyl = new THREE.Mesh(new THREE.CylinderGeometry(arrowRadius, arrowRadius, arrowLen, 12), yMats.defaultMat);
    yCyl.position.y = arrowLen * 0.5;
    const yCone = new THREE.Mesh(new THREE.ConeGeometry(coneRadius, coneLen, 16), yMats.defaultMat);
    yCone.position.y = arrowLen + coneLen * 0.5;
    this.registerHandle(yCyl, 'y', 'translate', yMats);
    this.registerHandle(yCone, 'y', 'translate', yMats);
    this.translateGroup.add(yCyl, yCone);

    // Z Axis Handle (Blue)
    const zMats = this.createMaterial(GIZMO_COLORS.z);
    const zCyl = new THREE.Mesh(new THREE.CylinderGeometry(arrowRadius, arrowRadius, arrowLen, 12), zMats.defaultMat);
    zCyl.position.z = arrowLen * 0.5;
    zCyl.rotation.x = Math.PI * 0.5;
    const zCone = new THREE.Mesh(new THREE.ConeGeometry(coneRadius, coneLen, 16), zMats.defaultMat);
    zCone.position.z = arrowLen + coneLen * 0.5;
    zCone.rotation.x = Math.PI * 0.5;
    this.registerHandle(zCyl, 'z', 'translate', zMats);
    this.registerHandle(zCone, 'z', 'translate', zMats);
    this.translateGroup.add(zCyl, zCone);

    // Plane Handles (XY, XZ, YZ planar squares)
    const planeSize = 0.25;
    const planeOffset = 0.25;

    // XY Plane (Yellow)
    const xyMats = this.createMaterial(GIZMO_COLORS.xy, 0.45);
    const xyPlane = new THREE.Mesh(new THREE.PlaneGeometry(planeSize, planeSize), xyMats.defaultMat);
    xyPlane.position.set(planeOffset, planeOffset, 0);
    this.registerHandle(xyPlane, 'xy', 'translate', xyMats);
    this.translateGroup.add(xyPlane);

    // XZ Plane (Pink)
    const xzMats = this.createMaterial(GIZMO_COLORS.xz, 0.45);
    const xzPlane = new THREE.Mesh(new THREE.PlaneGeometry(planeSize, planeSize), xzMats.defaultMat);
    xzPlane.position.set(planeOffset, 0, planeOffset);
    xzPlane.rotation.x = Math.PI * 0.5;
    this.registerHandle(xzPlane, 'xz', 'translate', xzMats);
    this.translateGroup.add(xzPlane);

    // YZ Plane (Cyan)
    const yzMats = this.createMaterial(GIZMO_COLORS.yz, 0.45);
    const yzPlane = new THREE.Mesh(new THREE.PlaneGeometry(planeSize, planeSize), yzMats.defaultMat);
    yzPlane.position.set(0, planeOffset, planeOffset);
    yzPlane.rotation.y = Math.PI * 0.5;
    this.registerHandle(yzPlane, 'yz', 'translate', yzMats);
    this.translateGroup.add(yzPlane);

    // Central Uniform Translate Handle (Amber)
    const centerMats = this.createMaterial(GIZMO_COLORS.uniform, 0.8);
    const centerSphere = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), centerMats.defaultMat);
    this.registerHandle(centerSphere, 'screen', 'translate', centerMats);
    this.translateGroup.add(centerSphere);
  }

  private buildRotateHandles(): void {
    const ringRadius = 0.95;
    const ringTube = 0.02;
    const segments = 48;

    // X Axis Rotation Ring (Red)
    const xMats = this.createMaterial(GIZMO_COLORS.x);
    const xRing = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, ringTube, 12, segments), xMats.defaultMat);
    xRing.rotation.y = Math.PI * 0.5;
    this.registerHandle(xRing, 'x', 'rotate', xMats);
    this.rotateGroup.add(xRing);

    // Y Axis Rotation Ring (Green)
    const yMats = this.createMaterial(GIZMO_COLORS.y);
    const yRing = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, ringTube, 12, segments), yMats.defaultMat);
    yRing.rotation.x = Math.PI * 0.5;
    this.registerHandle(yRing, 'y', 'rotate', yMats);
    this.rotateGroup.add(yRing);

    // Z Axis Rotation Ring (Blue)
    const zMats = this.createMaterial(GIZMO_COLORS.z);
    const zRing = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, ringTube, 12, segments), zMats.defaultMat);
    this.registerHandle(zRing, 'z', 'rotate', zMats);
    this.rotateGroup.add(zRing);

    // Camera-facing Outer Billboard Ring (Amber)
    const screenMats = this.createMaterial(GIZMO_COLORS.screen, 0.7);
    const screenRing = new THREE.Mesh(new THREE.TorusGeometry(ringRadius * 1.18, ringTube * 0.8, 12, segments), screenMats.defaultMat);
    this.registerHandle(screenRing, 'screen', 'rotate', screenMats);
    this.screenBillboardGroup.add(screenRing);
  }

  private buildScaleHandles(): void {
    const shaftLen = 0.75;
    const shaftRadius = 0.018;
    const boxSize = 0.14;

    // X Axis Scale (Red)
    const xMats = this.createMaterial(GIZMO_COLORS.x);
    const xShaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLen, 12), xMats.defaultMat);
    xShaft.position.x = shaftLen * 0.5;
    xShaft.rotation.z = -Math.PI * 0.5;
    const xBox = new THREE.Mesh(new THREE.BoxGeometry(boxSize, boxSize, boxSize), xMats.defaultMat);
    xBox.position.x = shaftLen + boxSize * 0.5;
    this.registerHandle(xShaft, 'x', 'scale', xMats);
    this.registerHandle(xBox, 'x', 'scale', xMats);
    this.scaleGroup.add(xShaft, xBox);

    // Y Axis Scale (Green)
    const yMats = this.createMaterial(GIZMO_COLORS.y);
    const yShaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLen, 12), yMats.defaultMat);
    yShaft.position.y = shaftLen * 0.5;
    const yBox = new THREE.Mesh(new THREE.BoxGeometry(boxSize, boxSize, boxSize), yMats.defaultMat);
    yBox.position.y = shaftLen + boxSize * 0.5;
    this.registerHandle(yShaft, 'y', 'scale', yMats);
    this.registerHandle(yBox, 'y', 'scale', yMats);
    this.scaleGroup.add(yShaft, yBox);

    // Z Axis Scale (Blue)
    const zMats = this.createMaterial(GIZMO_COLORS.z);
    const zShaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLen, 12), zMats.defaultMat);
    zShaft.position.z = shaftLen * 0.5;
    zShaft.rotation.x = Math.PI * 0.5;
    const zBox = new THREE.Mesh(new THREE.BoxGeometry(boxSize, boxSize, boxSize), zMats.defaultMat);
    zBox.position.z = shaftLen + boxSize * 0.5;
    this.registerHandle(zShaft, 'z', 'scale', zMats);
    this.registerHandle(zBox, 'z', 'scale', zMats);
    this.scaleGroup.add(zShaft, zBox);

    // Uniform Center Cube (Amber)
    const uniformMats = this.createMaterial(GIZMO_COLORS.uniform, 0.85);
    const centerCube = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), uniformMats.defaultMat);
    this.registerHandle(centerCube, 'uniform', 'scale', uniformMats);
    this.scaleGroup.add(centerCube);
  }

  // --- Configuration & Mode Switching -----------------------------------------

  getMode(): GizmoMode {
    return this.mode;
  }

  setMode(mode: GizmoMode): void {
    this.mode = mode;
    this.translateGroup.visible = mode === 'translate';
    this.rotateGroup.visible = mode === 'rotate';
    this.scaleGroup.visible = mode === 'scale';
  }

  getSnapConfig(): GizmoSnapConfig {
    return { ...this.snapConfig };
  }

  setSnapConfig(config: Partial<GizmoSnapConfig>): void {
    this.snapConfig = { ...this.snapConfig, ...config };
  }

  toggleSnap(): boolean {
    this.snapConfig.enabled = !this.snapConfig.enabled;
    return this.snapConfig.enabled;
  }

  getSpace(): 'world' | 'local' {
    return this.space;
  }

  setSpace(space: 'world' | 'local'): void {
    this.space = space;
    this.syncGizmoOrientation();
  }

  // --- Target Attachment API --------------------------------------------------

  attach(target: GizmoTarget | null): void {
    this.target = target;
    if (target) {
      this.root.visible = true;
      this.syncGizmoTransform();
    } else {
      this.root.visible = false;
    }
  }

  detach(): void {
    this.target = null;
    this.root.visible = false;
    this.isDragging = false;
    this.activeAxis = null;
    this.clearHover();
  }

  getTarget(): GizmoTarget | null {
    return this.target;
  }

  isAttached(): boolean {
    return this.target !== null;
  }

  attachActor(actor: ActorObject): void {
    this.attach({
      kind: 'actor',
      id: actor.data.id,
      root: actor.root,
      data: actor.data,
      getPosition: () => ({ ...actor.data.position }),
      setPosition: (pos: Vec3) => {
        actor.data.position.x = pos.x;
        actor.data.position.y = pos.y;
        actor.data.position.z = pos.z;
        actor.root.position.set(pos.x, pos.y, pos.z);
      },
      getRotation: () => actor.data.rotationY,
      setRotation: (rot: Quat | number | Vec3) => {
        if (typeof rot === 'number') {
          actor.data.rotationY = rot;
          actor.root.rotation.y = rot;
        }
      },
      getScale: () => actor.data.scale,
      setScale: (scale: Vec3 | number) => {
        const s = typeof scale === 'number' ? scale : scale.y;
        actor.data.scale = s;
        actor.root.scale.set(s, s, s);
      },
    });
  }

  attachCamera(cam: CamObject): void {
    this.attach({
      kind: 'camera',
      id: cam.data.id,
      root: cam.root,
      data: cam.data,
      getPosition: () => ({ ...cam.data.position }),
      setPosition: (pos: Vec3) => {
        cam.data.position.x = pos.x;
        cam.data.position.y = pos.y;
        cam.data.position.z = pos.z;
        cam.root.position.set(pos.x, pos.y, pos.z);
      },
      getRotation: () => ({ ...cam.data.rotation }),
      setRotation: (rot: Quat | number | Vec3) => {
        if (typeof rot === 'object' && 'w' in rot) {
          cam.data.rotation.x = rot.x;
          cam.data.rotation.y = rot.y;
          cam.data.rotation.z = rot.z;
          cam.data.rotation.w = rot.w;
          cam.root.quaternion.set(rot.x, rot.y, rot.z, rot.w);
        }
      },
    });
  }

  attachLight(light: LightData, root: THREE.Object3D, onChange?: (l: LightData) => void): void {
    this.attach({
      kind: 'light',
      id: light.id,
      root,
      data: light,
      getPosition: () => ({ x: light.position[0], y: light.position[1], z: light.position[2] }),
      setPosition: (pos: Vec3) => {
        light.position[0] = pos.x;
        light.position[1] = pos.y;
        light.position[2] = pos.z;
        root.position.set(pos.x, pos.y, pos.z);
        onChange?.(light);
      },
      getRotation: () => ({ x: light.rotationX, y: light.rotationY, z: 0 }),
      setRotation: (rot: Quat | number | Vec3) => {
        if (typeof rot === 'object' && 'y' in rot && !('w' in rot)) {
          light.rotationX = rot.x;
          light.rotationY = rot.y;
          root.rotation.set(rot.x, rot.y, 0, 'YXZ');
          onChange?.(light);
        }
      },
    });
  }

  attachProp(prop: PropObject): void {
    this.attach({
      kind: 'prop',
      id: prop.data.id,
      root: prop.root,
      data: prop.data,
      getPosition: () => ({ ...prop.data.position }),
      setPosition: (pos: Vec3) => {
        prop.data.position.x = pos.x;
        prop.data.position.y = pos.y;
        prop.data.position.z = pos.z;
        prop.root.position.set(pos.x, pos.y, pos.z);
      },
      getRotation: () => ({
        x: prop.data.rotationX ?? 0,
        y: prop.data.rotationY,
        z: prop.data.rotationZ ?? 0,
      }),
      setRotation: (rot: Quat | number | Vec3) => {
        if (typeof rot === 'number') {
          prop.data.rotationY = rot;
          prop.root.rotation.y = rot;
        } else if (typeof rot === 'object' && 'y' in rot && !('w' in rot)) {
          prop.data.rotationX = rot.x;
          prop.data.rotationY = rot.y;
          prop.data.rotationZ = rot.z;
          prop.root.rotation.set(rot.x, rot.y, rot.z, 'YXZ');
        } else if (typeof rot === 'object' && 'w' in rot) {
          prop.root.quaternion.set(rot.x, rot.y, rot.z, rot.w);
          _scratchEuler.setFromQuaternion(prop.root.quaternion, 'YXZ');
          prop.data.rotationX = _scratchEuler.x;
          prop.data.rotationY = _scratchEuler.y;
          prop.data.rotationZ = _scratchEuler.z;
        }
      },
      getScale: () => ({ ...prop.data.scale }),
      setScale: (scale: Vec3 | number) => {
        if (typeof scale === 'number') {
          prop.data.scale.x = scale;
          prop.data.scale.y = scale;
          prop.data.scale.z = scale;
          prop.root.scale.set(scale, scale, scale);
        } else {
          prop.data.scale.x = scale.x;
          prop.data.scale.y = scale.y;
          prop.data.scale.z = scale.z;
          prop.root.scale.set(scale.x, scale.y, scale.z);
        }
      },
    });
  }

  attachObject(object: THREE.Object3D, onTransform?: (pos: Vec3, rot: Quat, scale: Vec3) => void): void {
    this.attach({
      kind: 'object3d',
      id: object.uuid,
      root: object,
      getPosition: () => ({ x: object.position.x, y: object.position.y, z: object.position.z }),
      setPosition: (pos: Vec3) => {
        object.position.set(pos.x, pos.y, pos.z);
        onTransform?.(
          { x: object.position.x, y: object.position.y, z: object.position.z },
          { x: object.quaternion.x, y: object.quaternion.y, z: object.quaternion.z, w: object.quaternion.w },
          { x: object.scale.x, y: object.scale.y, z: object.scale.z }
        );
      },
      getRotation: () => ({
        x: object.quaternion.x,
        y: object.quaternion.y,
        z: object.quaternion.z,
        w: object.quaternion.w,
      }),
      setRotation: (rot: Quat | number | Vec3) => {
        if (typeof rot === 'object' && 'w' in rot) {
          object.quaternion.set(rot.x, rot.y, rot.z, rot.w);
        } else if (typeof rot === 'number') {
          object.rotation.y = rot;
        }
        onTransform?.(
          { x: object.position.x, y: object.position.y, z: object.position.z },
          { x: object.quaternion.x, y: object.quaternion.y, z: object.quaternion.z, w: object.quaternion.w },
          { x: object.scale.x, y: object.scale.y, z: object.scale.z }
        );
      },
      getScale: () => ({ x: object.scale.x, y: object.scale.y, z: object.scale.z }),
      setScale: (scale: Vec3 | number) => {
        if (typeof scale === 'number') {
          object.scale.set(scale, scale, scale);
        } else {
          object.scale.set(scale.x, scale.y, scale.z);
        }
        onTransform?.(
          { x: object.position.x, y: object.position.y, z: object.position.z },
          { x: object.quaternion.x, y: object.quaternion.y, z: object.quaternion.z, w: object.quaternion.w },
          { x: object.scale.x, y: object.scale.y, z: object.scale.z }
        );
      },
    });
  }

  // --- Transform Synchronization ---------------------------------------------

  private syncGizmoTransform(): void {
    if (!this.target) return;
    const pos = this.target.getPosition();
    this.root.position.set(pos.x, pos.y, pos.z);
    this.syncGizmoOrientation();
  }

  private syncGizmoOrientation(): void {
    if (!this.target) return;
    if (this.space === 'local') {
      this.target.root.getWorldQuaternion(_scratchQuat);
      this.root.quaternion.copy(_scratchQuat);
    } else {
      this.root.quaternion.identity();
    }
  }

  /**
   * Per-frame camera distance scaling and screen billboard orientation.
   * Maintains constant angular size in user's view.
   */
  update(camera: THREE.Camera): void {
    if (!this.root.visible || !this.target) return;

    this.root.getWorldPosition(_scratchTargetPos);
    camera.getWorldPosition(_scratchCamPos);

    const distance = _scratchTargetPos.distanceTo(_scratchCamPos);
    // Dynamic constant screen-size scaling
    const scaleFactor = Math.max(0.001, distance * 0.15);
    this.root.scale.setScalar(scaleFactor);

    // Keep the screen trackball ring facing camera
    camera.getWorldQuaternion(_scratchQuat);
    this.screenBillboardGroup.quaternion.copy(_scratchQuat);
  }

  // --- Hit Testing and Hover Management ---------------------------------------

  private setMeshHighlight(mesh: THREE.Mesh, highlight: boolean): void {
    const mats = this.handleMaterials.get(mesh);
    if (!mats) return;
    mesh.material = highlight ? mats.highlightMat : mats.defaultMat;
  }

  private clearHover(): void {
    if (this.hoveredAxis) {
      for (const h of this.handles) {
        if (h.userData.axis === this.hoveredAxis && h.userData.mode === this.mode) {
          this.setMeshHighlight(h, false);
        }
      }
      this.hoveredAxis = null;
      this.events.onHoverChange?.(null);
    }
  }

  private setHoverAxis(axis: GizmoAxis): void {
    if (this.hoveredAxis === axis) return;
    this.clearHover();
    this.hoveredAxis = axis;
    for (const h of this.handles) {
      if (h.userData.axis === axis && h.userData.mode === this.mode) {
        this.setMeshHighlight(h, true);
      }
    }
    this.events.onHoverChange?.(axis);
  }

  intersectRay(rayOrigin: THREE.Vector3, rayDir: THREE.Vector3): { mesh: THREE.Mesh; axis: GizmoAxis; point: THREE.Vector3 } | null {
    if (!this.root.visible || !this.target) return null;

    _scratchRaycaster.ray.origin.copy(rayOrigin);
    _scratchRaycaster.ray.direction.copy(rayDir).normalize();

    const activeGroup =
      this.mode === 'translate'
        ? this.translateGroup
        : this.mode === 'rotate'
          ? this.rotateGroup
          : this.scaleGroup;

    const intersections = _scratchRaycaster.intersectObjects(activeGroup.children, true);
    if (intersections.length > 0) {
      const hit = intersections[0];
      const mesh = hit.object as THREE.Mesh;
      const axis = mesh.userData.axis as GizmoAxis;
      if (axis) {
        return { mesh, axis, point: hit.point };
      }
    }
    return null;
  }

  // --- Drag State Machine -----------------------------------------------------

  onPointerDown(rayOrigin: THREE.Vector3, rayDir: THREE.Vector3, camera?: THREE.Camera): boolean {
    if (!this.root.visible || !this.target) return false;

    const hit = this.intersectRay(rayOrigin, rayDir);
    if (!hit) return false;

    this.isDragging = true;
    this.activeAxis = hit.axis;
    this.setHoverAxis(hit.axis);

    // Capture target baseline state
    this.dragInitialPos = this.target.getPosition();
    const rot = this.target.getRotation ? this.target.getRotation() : undefined;
    if (typeof rot === 'number') {
      this.dragInitialRotY = rot;
    } else if (rot && 'w' in rot) {
      const q = rot as Quat;
      this.dragInitialRotQuat = { x: q.x, y: q.y, z: q.z, w: q.w };
    } else if (rot && 'y' in rot) {
      const e = rot as Vec3;
      this.dragInitialRotEuler = { x: e.x, y: e.y, z: e.z };
    }

    const sc = this.target.getScale ? this.target.getScale() : undefined;
    if (typeof sc === 'number') {
      this.dragInitialScaleScalar = sc;
    } else if (sc && 'x' in sc) {
      const s = sc as Vec3;
      this.dragInitialScaleVec = { x: s.x, y: s.y, z: s.z };
    }

    // Set up math interaction geometry
    this.root.getWorldPosition(_scratchAxisOrigin);
    const gizmoPos: Vec3 = { x: _scratchAxisOrigin.x, y: _scratchAxisOrigin.y, z: _scratchAxisOrigin.z };

    // Resolve axis unit vector
    _scratchAxisDir.set(
      hit.axis === 'x' ? 1 : 0,
      hit.axis === 'y' ? 1 : 0,
      hit.axis === 'z' ? 1 : 0
    );
    if (this.space === 'local') {
      _scratchAxisDir.applyQuaternion(this.root.quaternion);
    }
    this.dragAxisDir = { x: _scratchAxisDir.x, y: _scratchAxisDir.y, z: _scratchAxisDir.z };

    // Resolve plane normal
    if (this.mode === 'translate') {
      if (hit.axis === 'xy') {
        _scratchPlaneNormal.set(0, 0, 1);
      } else if (hit.axis === 'xz') {
        _scratchPlaneNormal.set(0, 1, 0);
      } else if (hit.axis === 'yz') {
        _scratchPlaneNormal.set(1, 0, 0);
      } else {
        // For single axis translation, pick plane containing axis and facing camera
        if (camera) {
          camera.getWorldPosition(_scratchCamPos);
          _scratchDir.subVectors(_scratchCamPos, _scratchAxisOrigin).normalize();
          _scratchPlaneNormal.crossVectors(_scratchAxisDir, _scratchDir).cross(_scratchAxisDir).normalize();
        } else {
          _scratchPlaneNormal.set(0, 1, 0);
        }
      }
    } else if (this.mode === 'rotate') {
      if (hit.axis === 'x') _scratchPlaneNormal.set(1, 0, 0);
      else if (hit.axis === 'y') _scratchPlaneNormal.set(0, 1, 0);
      else if (hit.axis === 'z') _scratchPlaneNormal.set(0, 0, 1);
      else if (hit.axis === 'screen' && camera) {
        camera.getWorldDirection(_scratchPlaneNormal).negate();
      } else {
        _scratchPlaneNormal.set(0, 1, 0);
      }
    } else if (this.mode === 'scale') {
      if (camera) {
        camera.getWorldDirection(_scratchPlaneNormal).negate();
      } else {
        _scratchPlaneNormal.set(0, 1, 0);
      }
    }

    if (this.space === 'local' && this.mode === 'rotate' && hit.axis !== 'screen') {
      _scratchPlaneNormal.applyQuaternion(this.root.quaternion);
    }

    this.dragPlaneNormal = { x: _scratchPlaneNormal.x, y: _scratchPlaneNormal.y, z: _scratchPlaneNormal.z };
    this.dragPlaneOrigin = gizmoPos;

    // Initial ray hit and offset
    const ro: Vec3 = { x: rayOrigin.x, y: rayOrigin.y, z: rayOrigin.z };
    const rd: Vec3 = { x: rayDir.x, y: rayDir.y, z: rayDir.z };

    if (this.mode === 'translate') {
      if (hit.axis === 'x' || hit.axis === 'y' || hit.axis === 'z') {
        this.dragStartAxisOffset = calculateAxisRayOffset(ro, rd, gizmoPos, this.dragAxisDir);
      } else {
        const planeHit = calculatePlaneRayIntersection(ro, rd, this.dragPlaneOrigin, this.dragPlaneNormal);
        this.dragStartHitPoint = planeHit ?? { x: hit.point.x, y: hit.point.y, z: hit.point.z };
      }
    } else if (this.mode === 'rotate') {
      const planeHit = calculatePlaneRayIntersection(ro, rd, this.dragPlaneOrigin, this.dragPlaneNormal);
      const hp = planeHit ?? { x: hit.point.x, y: hit.point.y, z: hit.point.z };
      this.dragStartHitPoint = hp;
      this.dragStartRefDir = {
        x: hp.x - gizmoPos.x,
        y: hp.y - gizmoPos.y,
        z: hp.z - gizmoPos.z,
      };
    } else if (this.mode === 'scale') {
      this.dragStartHitPoint = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
    }

    this.events.onDragStart?.(this.target, hit.axis, this.mode);
    return true;
  }

  onPointerMove(rayOrigin: THREE.Vector3, rayDir: THREE.Vector3): boolean {
    if (!this.root.visible || !this.target) return false;

    if (!this.isDragging || !this.activeAxis) {
      // Hover hit-test
      const hit = this.intersectRay(rayOrigin, rayDir);
      if (hit) {
        this.setHoverAxis(hit.axis);
      } else {
        this.clearHover();
      }
      return hit !== null;
    }

    // Active Drag Processing (ZERO per-frame allocations)
    const ro: Vec3 = { x: rayOrigin.x, y: rayOrigin.y, z: rayOrigin.z };
    const rd: Vec3 = { x: rayDir.x, y: rayDir.y, z: rayDir.z };
    this.root.getWorldPosition(_scratchAxisOrigin);
    const gizmoPos: Vec3 = { x: _scratchAxisOrigin.x, y: _scratchAxisOrigin.y, z: _scratchAxisOrigin.z };

    if (this.mode === 'translate') {
      if (this.activeAxis === 'x' || this.activeAxis === 'y' || this.activeAxis === 'z') {
        const currentOffset = calculateAxisRayOffset(ro, rd, gizmoPos, this.dragAxisDir);
        const deltaOffset = currentOffset - this.dragStartAxisOffset;
        _scratchDeltaPos.set(
          this.dragAxisDir.x * deltaOffset,
          this.dragAxisDir.y * deltaOffset,
          this.dragAxisDir.z * deltaOffset
        );
      } else {
        const planeHit = calculatePlaneRayIntersection(ro, rd, this.dragPlaneOrigin, this.dragPlaneNormal);
        if (planeHit) {
          _scratchDeltaPos.set(
            planeHit.x - this.dragStartHitPoint.x,
            planeHit.y - this.dragStartHitPoint.y,
            planeHit.z - this.dragStartHitPoint.z
          );
        }
      }

      const deltaVec: Vec3 = { x: _scratchDeltaPos.x, y: _scratchDeltaPos.y, z: _scratchDeltaPos.z };
      const newPos = applyGizmoTranslation(
        this.dragInitialPos,
        deltaVec,
        this.activeAxis,
        this.snapConfig
      );
      this.target.setPosition(newPos);
      this.root.position.set(newPos.x, newPos.y, newPos.z);
      this.events.onTransform?.(this.target, 'translate', this.activeAxis);
    } else if (this.mode === 'rotate') {
      const planeHit = calculatePlaneRayIntersection(ro, rd, this.dragPlaneOrigin, this.dragPlaneNormal);
      if (planeHit) {
        const angle = calculateRotationAngleOnPlane(
          planeHit,
          gizmoPos,
          this.dragPlaneNormal,
          this.dragStartRefDir
        );

        if (this.target.getRotation && this.target.setRotation) {
          const rot = this.target.getRotation();
          if (typeof rot === 'number') {
            const newRotY = applyGizmoRotation(this.dragInitialRotY, angle, this.snapConfig);
            this.target.setRotation(newRotY);
          } else if (rot && 'w' in rot) {
            const newQuat = applyGizmoRotationQuat(
              this.dragInitialRotQuat,
              this.dragPlaneNormal,
              angle,
              this.snapConfig
            );
            this.target.setRotation(newQuat);
          } else if (rot && 'y' in rot) {
            const newEuler = { ...this.dragInitialRotEuler };
            if (this.activeAxis === 'x') newEuler.x = applyGizmoRotation(this.dragInitialRotEuler.x, angle, this.snapConfig);
            else if (this.activeAxis === 'y') newEuler.y = applyGizmoRotation(this.dragInitialRotEuler.y, angle, this.snapConfig);
            else if (this.activeAxis === 'z') newEuler.z = applyGizmoRotation(this.dragInitialRotEuler.z, angle, this.snapConfig);
            this.target.setRotation(newEuler);
          }
        }
        this.syncGizmoOrientation();
        this.events.onTransform?.(this.target, 'rotate', this.activeAxis);
      }
    } else if (this.mode === 'scale') {
      const planeHit = calculatePlaneRayIntersection(ro, rd, this.dragPlaneOrigin, this.dragPlaneNormal);
      if (planeHit) {
        const isUniform = this.activeAxis === 'uniform' || this.activeAxis === 'screen';
        const axisDir = isUniform ? undefined : this.dragAxisDir;
        const scaleDelta = calculateScaleDelta(this.dragStartHitPoint, planeHit, gizmoPos, axisDir);

        if (this.target.getScale && this.target.setScale) {
          const sc = this.target.getScale();
          if (typeof sc === 'number') {
            const newScale = applyGizmoUniformScale(this.dragInitialScaleScalar, scaleDelta, this.snapConfig);
            this.target.setScale(newScale);
          } else if (sc && 'x' in sc) {
            const newScaleVec = applyGizmoScale(
              this.dragInitialScaleVec,
              scaleDelta,
              this.activeAxis,
              this.snapConfig
            );
            this.target.setScale(newScaleVec);
          }
        }
        this.events.onTransform?.(this.target, 'scale', this.activeAxis);
      }
    }

    return true;
  }

  onPointerUp(): boolean {
    if (!this.isDragging) return false;
    const endedAxis = this.activeAxis ?? 'x';
    this.isDragging = false;
    this.activeAxis = null;
    this.clearHover();
    this.events.onDragEnd?.(this.target, endedAxis, this.mode);
    return true;
  }

  dispose(): void {
    this.detach();
    for (const h of this.handles) {
      h.geometry.dispose();
      const mats = this.handleMaterials.get(h);
      if (mats) {
        mats.defaultMat.dispose();
        mats.highlightMat.dispose();
      }
    }
    this.handles = [];
    this.handleMaterials.clear();
  }
}
