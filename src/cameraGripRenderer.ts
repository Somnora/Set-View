// ---------------------------------------------------------------------------
// SetView 3D Physical Camera Grip Rig Renderer & Articulator
//
// Target: Meta Quest 3 72fps, zero per-frame garbage collection allocations.
// Renders:
//   - Tripod Fluid Head (telescoping legs, spreader, pan head & handle)
//   - Steadicam (carbon sled, monitor, battery stage, articulated ISO-arm)
//   - Chapman Hybrid Dolly (wheeled chassis, hydraulic pedestal, curved tracks)
//   - Technocrane / Jib (base, rotating turret, telescoping boom, remote head)
//   - Drone / UAV (quadcopter carbon arms, motor pods, rotors, 3-axis gimbal)
//   - Cable Cam (overhead span cable, motorized trolley carriage, drop rod)
//   - Handheld EasyRig (shoulder base, dual 15mm rods/grips, overhead support)
//   - Reach envelope wireframes (crane reach dome, track paths, elevation bounds)
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import {
  type GripRigConfig,
  type GripRigType,
  normalizeGripRigConfig,
} from './cameraGrip.ts';
import type { CameraSetupData } from './model.ts';
import { disposeTree } from './ui.ts';

// Scratch math objects allocated once to prevent runtime GC in WebXR
const _v1 = new THREE.Vector3();

// Shared material cache
const _matCache = new Map<string, THREE.Material>();

function getMaterial(
  colorHex: number,
  roughness = 0.5,
  metalness = 0.5,
  wireframe = false,
  opacity = 1.0,
): THREE.Material {
  const key = `mat_${colorHex}_${roughness}_${metalness}_${wireframe}_${opacity}`;
  let mat = _matCache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness,
      metalness,
      wireframe,
      transparent: opacity < 1.0,
      opacity,
      side: wireframe ? THREE.DoubleSide : THREE.FrontSide,
    });
    _matCache.set(key, mat);
  }
  return mat;
}

export interface GripRigVisualInstance {
  root: THREE.Group;
  type: GripRigType;
  turretGroup?: THREE.Group;
  boomGroup?: THREE.Group;
  boomInnerMesh?: THREE.Mesh;
  counterweightMesh?: THREE.Mesh;
  dollyChassis?: THREE.Group;
  pedestalMesh?: THREE.Mesh;
  trackGroup?: THREE.Group;
  tripodLegs?: THREE.Group[];
  spreaderRing?: THREE.Mesh;
  droneRotors?: THREE.Mesh[];
  envelopeMesh?: THREE.LineSegments | THREE.Mesh;
  update: (cam: CameraSetupData, dt: number, timeS?: number) => void;
  dispose: () => void;
}

export class CameraGripVisualizer {
  private readonly instances = new Map<string, GripRigVisualInstance>();
  readonly container = new THREE.Group();

  constructor() {
    this.container.name = 'CameraGripVisualizers';
  }

  /**
   * Builds or updates the 3D physical grip rig visualizer for a given camera.
   */
  syncCameraRig(cam: CameraSetupData): GripRigVisualInstance | null {
    if (!cam.gripRig) {
      this.removeCameraRig(cam.id);
      return null;
    }

    const current = this.instances.get(cam.id);
    if (current && current.type === cam.gripRig.type) {
      return current;
    }

    // Rebuild visual model
    this.removeCameraRig(cam.id);
    const instance = this.createVisualInstance(cam.gripRig, cam);
    this.instances.set(cam.id, instance);
    this.container.add(instance.root);
    return instance;
  }

  removeCameraRig(cameraId: string): void {
    const existing = this.instances.get(cameraId);
    if (existing) {
      this.container.remove(existing.root);
      existing.dispose();
      this.instances.delete(cameraId);
    }
  }

  updateAll(cameras: CameraSetupData[], dt: number, timeS = 0): void {
    const currentCamIds = new Set<string>();
    for (const cam of cameras) {
      if (cam.gripRig) {
        currentCamIds.add(cam.id);
        let inst = this.instances.get(cam.id);
        if (!inst || inst.type !== cam.gripRig.type) {
          inst = this.syncCameraRig(cam) ?? undefined;
        }
        if (inst) {
          inst.update(cam, dt, timeS);
        }
      }
    }

    // Prune removed cameras
    for (const [id, inst] of this.instances.entries()) {
      if (!currentCamIds.has(id)) {
        this.container.remove(inst.root);
        inst.dispose();
        this.instances.delete(id);
      }
    }
  }

  dispose(): void {
    for (const inst of this.instances.values()) {
      inst.dispose();
    }
    this.instances.clear();
    disposeTree(this.container);
    this.container.clear();
  }

  // -------------------------------------------------------------------------
  // Procedural 3D Rig Model Generators
  // -------------------------------------------------------------------------

  private createVisualInstance(config: GripRigConfig, cam: CameraSetupData): GripRigVisualInstance {
    const rig = normalizeGripRigConfig(config);
    const root = new THREE.Group();
    root.name = `GripRig_${cam.id}_${rig.type}`;

    switch (rig.type) {
      case 'tripod_fluid_head':
        return this.buildTripodInstance(root, rig, cam);
      case 'dolly_curved_track':
        return this.buildDollyInstance(root, rig, cam);
      case 'jib_crane':
      case 'technocrane':
        return this.buildTechnocraneInstance(root, rig, cam);
      case 'steadicam':
        return this.buildSteadicamInstance(root, rig, cam);
      case 'handheld_rig':
        return this.buildHandheldInstance(root, rig, cam);
      case 'drone_uav':
        return this.buildDroneInstance(root, rig, cam);
      case 'cable_cam':
        return this.buildCableCamInstance(root, rig, cam);
      default:
        return this.buildTripodInstance(root, rig, cam);
    }
  }

  // 1. Tripod with Fluid Head
  private buildTripodInstance(
    root: THREE.Group,
    rig: GripRigConfig,
    _cam: CameraSetupData,
  ): GripRigVisualInstance {
    const darkMat = getMaterial(0x22262e, 0.4, 0.6);
    const carbonMat = getMaterial(0x181a1f, 0.3, 0.8);
    const goldMat = getMaterial(0xd4af37, 0.3, 0.9);

    const basePos = rig.turretBasePos ?? { x: _cam.position.x, y: 0, z: _cam.position.z };
    root.position.set(basePos.x, 0, basePos.z);

    // Fluid Head
    const headGroup = new THREE.Group();
    const bowlMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.05, 16), goldMat);
    bowlMesh.position.y = -0.025;
    const plateMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.16), darkMat);
    const panHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.28, 8), darkMat);
    panHandle.rotation.x = Math.PI / 3;
    panHandle.position.set(0.06, -0.05, 0.14);

    headGroup.add(bowlMesh, plateMesh, panHandle);
    root.add(headGroup);

    // 3 Telescoping Carbon Legs
    const tripodLegs: THREE.Group[] = [];
    for (let i = 0; i < 3; i++) {
      const legPivot = new THREE.Group();
      const angle = (i * 2 * Math.PI) / 3;
      legPivot.rotation.y = angle;

      const upperLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.01, 1.0, 8), carbonMat);
      upperLeg.position.y = -0.5;
      legPivot.add(upperLeg);

      tripodLegs.push(legPivot);
      headGroup.add(legPivot);
    }

    // Floor Spreader
    const spreaderRing = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.28, 16).rotateX(-Math.PI / 2), darkMat);
    spreaderRing.position.y = 0.02;
    root.add(spreaderRing);

    return {
      root,
      type: 'tripod_fluid_head',
      tripodLegs,
      spreaderRing,
      update: (camData: CameraSetupData) => {
        const h = Math.max(0.3, camData.position.y);
        headGroup.position.y = h;
        headGroup.rotation.y = 0;

        const legSpreadRadius = Math.max(0.2, h * 0.45);
        spreaderRing.scale.set(legSpreadRadius / 0.26, 1, legSpreadRadius / 0.26);

        for (let i = 0; i < 3; i++) {
          const leg = tripodLegs[i];
          const legLen = Math.sqrt(h * h + legSpreadRadius * legSpreadRadius);
          leg.children[0].scale.set(1, legLen, 1);
          leg.children[0].position.y = -legLen / 2;
          leg.rotation.z = Math.atan2(legSpreadRadius, h);
        }
      },
      dispose: () => {
        disposeTree(root);
      },
    };
  }

  // 2. Chapman Hybrid Dolly on Curved / Straight Track
  private buildDollyInstance(
    root: THREE.Group,
    rig: GripRigConfig,
    _cam: CameraSetupData,
  ): GripRigVisualInstance {
    const chassisMat = getMaterial(0x1e293b, 0.5, 0.7);
    const chromeMat = getMaterial(0xe2e8f0, 0.2, 0.95);
    const railMat = getMaterial(0x94a3b8, 0.3, 0.9);
    const tireMat = getMaterial(0x0f172a, 0.8, 0.1);

    const basePos = rig.turretBasePos ?? { x: 0, y: 0, z: 0 };
    root.position.set(basePos.x, 0, basePos.z);

    // Track Rails
    const trackGroup = new THREE.Group();
    const radius = rig.trackRadiusM ?? 5.0;

    // Curved Track Rails
    const railInner = new THREE.Mesh(
      new THREE.TorusGeometry(radius - 0.31, 0.02, 8, 48, Math.PI).rotateX(Math.PI / 2),
      railMat,
    );
    const railOuter = new THREE.Mesh(
      new THREE.TorusGeometry(radius + 0.31, 0.02, 8, 48, Math.PI).rotateX(Math.PI / 2),
      railMat,
    );
    trackGroup.add(railInner, railOuter);

    // Cross Sleepers
    for (let i = 0; i <= 16; i++) {
      const angle = (i * Math.PI) / 16;
      const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.02, 0.06), chassisMat);
      sleeper.position.set(radius * Math.cos(angle), 0.01, radius * Math.sin(angle));
      sleeper.rotation.y = -angle;
      trackGroup.add(sleeper);
    }
    root.add(trackGroup);

    // Dolly Chassis
    const dollyChassis = new THREE.Group();
    const chassisBody = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 1.1), chassisMat);
    chassisBody.position.y = 0.12;

    // 4 Dual Wheel Bogies
    for (const [wx, wz] of [[-0.31, -0.42], [0.31, -0.42], [-0.31, 0.42], [0.31, 0.42]]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16).rotateZ(Math.PI / 2),
        tireMat,
      );
      wheel.position.set(wx, 0.06, wz);
      dollyChassis.add(wheel);
    }

    // Hydraulic Center Pedestal
    const pedestalBase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.3, 16), chassisMat);
    pedestalBase.position.y = 0.25;
    const pedestalMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 16), chromeMat);
    pedestalMesh.position.y = 0.6;
    dollyChassis.add(chassisBody, pedestalBase, pedestalMesh);
    root.add(dollyChassis);

    return {
      root,
      type: 'dolly_curved_track',
      dollyChassis,
      pedestalMesh,
      trackGroup,
      update: (camData: CameraSetupData) => {
        const dx = camData.position.x - basePos.x;
        const dz = camData.position.z - basePos.z;
        const angle = Math.atan2(dz, dx);

        dollyChassis.position.set(radius * Math.cos(angle), 0, radius * Math.sin(angle));
        dollyChassis.rotation.y = -angle + Math.PI / 2;

        const pedestalHeight = Math.max(0.4, camData.position.y);
        pedestalMesh.scale.set(1, pedestalHeight, 1);
        pedestalMesh.position.y = 0.2 + pedestalHeight / 2;
      },
      dispose: () => {
        disposeTree(root);
      },
    };
  }

  // 3. Technocrane & Jib Crane
  private buildTechnocraneInstance(
    root: THREE.Group,
    rig: GripRigConfig,
    _cam: CameraSetupData,
  ): GripRigVisualInstance {
    const baseMat = getMaterial(0x1e293b, 0.6, 0.7);
    const armOuterMat = getMaterial(0x0f172a, 0.4, 0.85);
    const armInnerMat = getMaterial(0x475569, 0.2, 0.9);
    const weightMat = getMaterial(0x64748b, 0.7, 0.4);
    const wireMat = getMaterial(0x38bdf8, 0.5, 0.1, true, 0.35);

    const basePos = rig.turretBasePos ?? { x: 0, y: 0, z: 0 };
    root.position.set(basePos.x, 0, basePos.z);

    // Crane Heavy Base Truck with 4 Outriggers
    const truck = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 1.6), baseMat);
    truck.position.y = 0.15;
    root.add(truck);

    // Rotating Turret
    const turretGroup = new THREE.Group();
    turretGroup.position.y = 0.8;
    const turretPost = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.6, 16), baseMat);
    turretPost.position.y = -0.3;
    turretGroup.add(turretPost);
    root.add(turretGroup);

    // Boom Pivot & Arm
    const boomGroup = new THREE.Group();
    const fulcrumPivot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.35, 16).rotateZ(Math.PI / 2),
      baseMat,
    );
    boomGroup.add(fulcrumPivot);

    // Outer Truss Section
    const boomOuter = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 2.5), armOuterMat);
    boomOuter.position.z = -1.25;

    // Inner Telescoping Boom Section
    const boomInnerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 3.0), armInnerMat);
    boomInnerMesh.position.z = -2.5;

    // Counterweight Section (Rear of Fulcrum)
    const counterweightMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.8), weightMat);
    counterweightMesh.position.z = 0.9;

    boomGroup.add(boomOuter, boomInnerMesh, counterweightMesh);
    turretGroup.add(boomGroup);

    // Reach Envelope Wireframe Dome
    const maxReach = rig.armLengthM ?? (rig.type === 'technocrane' ? 9.14 : 3.6);
    const envelopeGeo = new THREE.SphereGeometry(maxReach, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const envelopeMesh = new THREE.LineSegments(new THREE.WireframeGeometry(envelopeGeo), wireMat);
    envelopeMesh.position.y = 0.8;
    root.add(envelopeMesh);

    return {
      root,
      type: rig.type,
      turretGroup,
      boomGroup,
      boomInnerMesh,
      counterweightMesh,
      envelopeMesh,
      update: (camData: CameraSetupData) => {
        _v1.set(camData.position.x - basePos.x, camData.position.y - 0.8, camData.position.z - basePos.z);
        const yaw = Math.atan2(_v1.x, -_v1.z);
        turretGroup.rotation.y = yaw;

        const horizDist = Math.sqrt(_v1.x * _v1.x + _v1.z * _v1.z);
        const pitch = Math.atan2(_v1.y, horizDist);
        boomGroup.rotation.x = -pitch;

        const totalDist = _v1.length();
        const extension = Math.min(totalDist, maxReach);
        const scaleZ = Math.max(0.5, extension / 3.0);
        boomInnerMesh.scale.set(1, 1, scaleZ);
        boomInnerMesh.position.z = -scaleZ * 1.5;

        // Dynamic counterweight shift for realistic balance
        counterweightMesh.position.z = 0.6 + (extension / maxReach) * 0.6;
      },
      dispose: () => {
        disposeTree(root);
      },
    };
  }

  // 4. Steadicam System (Sled, Iso-Elastic Arm, Battery/Monitor Stage)
  private buildSteadicamInstance(
    root: THREE.Group,
    _rig: GripRigConfig,
    _cam: CameraSetupData,
  ): GripRigVisualInstance {
    const carbonMat = getMaterial(0x181a1f, 0.3, 0.85);
    const titaniumMat = getMaterial(0x64748b, 0.3, 0.9);
    const goldMat = getMaterial(0xd4af37, 0.3, 0.9);

    const sledGroup = new THREE.Group();

    // Central Carbon Fiber Post
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.65, 12), carbonMat);
    post.position.y = -0.32;

    // Gimbal Collar
    const gimbal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.06, 12),
      goldMat,
    );
    gimbal.position.y = -0.18;

    // Lower Sled Stage (Monitor + Battery Counterweight)
    const lowerStage = new THREE.Group();
    lowerStage.position.y = -0.65;
    const batt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.14), titaniumMat);
    batt.position.set(0, 0, 0.1);
    const mon = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.02), titaniumMat);
    mon.position.set(0, 0.05, -0.12);
    mon.rotation.x = -Math.PI / 8;
    lowerStage.add(batt, mon);

    // Iso-Elastic Spring Arm
    const isoArm = new THREE.Group();
    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.28), titaniumMat);
    upperArm.position.set(0.12, -0.1, 0.14);
    upperArm.rotation.y = Math.PI / 4;
    isoArm.add(upperArm);

    sledGroup.add(post, gimbal, lowerStage, isoArm);
    root.add(sledGroup);

    return {
      root,
      type: 'steadicam',
      update: (camData: CameraSetupData) => {
        root.position.set(camData.position.x, camData.position.y, camData.position.z);
        root.quaternion.set(camData.rotation.x, camData.rotation.y, camData.rotation.z, camData.rotation.w);
      },
      dispose: () => {
        disposeTree(root);
      },
    };
  }

  // 5. Handheld Rig with EasyRig Overhead Suspension
  private buildHandheldInstance(
    root: THREE.Group,
    _rig: GripRigConfig,
    _cam: CameraSetupData,
  ): GripRigVisualInstance {
    const cageMat = getMaterial(0x1e293b, 0.4, 0.7);
    const rubberMat = getMaterial(0x0f172a, 0.9, 0.1);
    const cordMat = getMaterial(0xf59e0b, 0.5, 0.2);

    const cageGroup = new THREE.Group();

    // Dual 15mm Handgrips
    for (const side of [-0.14, 0.14]) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.18, 8), cageMat);
      rod.position.set(side, -0.1, -0.06);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 12), rubberMat);
      grip.position.set(side, -0.14, -0.06);
      cageGroup.add(rod, grip);
    }

    // Top Handle & EasyRig Line
    const topHandle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.16), cageMat);
    topHandle.position.set(0, 0.08, -0.02);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.6, 6), cordMat);
    line.position.set(0, 0.38, 0);

    cageGroup.add(topHandle, line);
    root.add(cageGroup);

    return {
      root,
      type: 'handheld_rig',
      update: (camData: CameraSetupData) => {
        root.position.set(camData.position.x, camData.position.y, camData.position.z);
        root.quaternion.set(camData.rotation.x, camData.rotation.y, camData.rotation.z, camData.rotation.w);
      },
      dispose: () => {
        disposeTree(root);
      },
    };
  }

  // 6. Drone / UAV Quadcopter with 3-Axis Gimbal
  private buildDroneInstance(
    root: THREE.Group,
    _rig: GripRigConfig,
    _cam: CameraSetupData,
  ): GripRigVisualInstance {
    const carbonMat = getMaterial(0x0f172a, 0.3, 0.9);
    const motorMat = getMaterial(0xd97706, 0.3, 0.8);
    const rotorMat = getMaterial(0x38bdf8, 0.2, 0.1, false, 0.35);

    const droneFrame = new THREE.Group();
    droneFrame.position.y = 0.22; // frame sits above gimbal / camera

    // Center Hub
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.08, 6), carbonMat);
    droneFrame.add(hub);

    // 4 Diagonal Motor Arms & Rotors
    const droneRotors: THREE.Mesh[] = [];
    const armLen = 0.38;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, armLen), carbonMat);
      arm.position.set((armLen / 2) * Math.cos(angle), 0, (armLen / 2) * Math.sin(angle));
      arm.rotation.y = -angle + Math.PI / 2;

      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12), motorMat);
      motor.position.set(armLen * Math.cos(angle), 0.03, armLen * Math.sin(angle));

      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.005, 16), rotorMat);
      rotor.position.set(armLen * Math.cos(angle), 0.055, armLen * Math.sin(angle));

      droneRotors.push(rotor);
      droneFrame.add(arm, motor, rotor);
    }

    // 3-Axis Camera Gimbal Frame
    const gimbalFrame = new THREE.Group();
    gimbalFrame.position.y = -0.1;
    const yawMotor = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 12), motorMat);
    gimbalFrame.add(yawMotor);
    droneFrame.add(gimbalFrame);

    root.add(droneFrame);

    return {
      root,
      type: 'drone_uav',
      droneRotors,
      update: (camData: CameraSetupData, _dt: number, timeS = 0) => {
        root.position.set(camData.position.x, camData.position.y, camData.position.z);
        // Spin rotor discs
        const spin = timeS * 45.0;
        for (let i = 0; i < droneRotors.length; i++) {
          droneRotors[i].rotation.y = spin * (i % 2 === 0 ? 1 : -1);
        }
      },
      dispose: () => {
        disposeTree(root);
      },
    };
  }

  // 7. Cable Cam Overhead Highwire
  private buildCableCamInstance(
    root: THREE.Group,
    rig: GripRigConfig,
    _cam: CameraSetupData,
  ): GripRigVisualInstance {
    const cableMat = getMaterial(0x94a3b8, 0.2, 0.95);
    const trolleyMat = getMaterial(0x1e293b, 0.5, 0.7);
    const pulleyMat = getMaterial(0xd97706, 0.3, 0.8);

    const basePos = rig.turretBasePos ?? { x: 0, y: 0, z: 0 };
    root.position.set(basePos.x, 0, basePos.z);

    // Highwire Overhead Span Cable
    const span = rig.armLengthM ?? 50.0;
    const cableMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, span, 8).rotateZ(Math.PI / 2),
      cableMat,
    );
    cableMesh.position.y = 8.0;
    root.add(cableMesh);

    // Trolley Carriage
    const trolley = new THREE.Group();
    trolley.position.y = 8.0;
    const trolleyBody = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.2), trolleyMat);
    const pulleyL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12).rotateX(Math.PI / 2), pulleyMat);
    pulleyL.position.set(-0.16, 0.05, 0);
    const pulleyR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12).rotateX(Math.PI / 2), pulleyMat);
    pulleyR.position.set(0.16, 0.05, 0);

    // Drop Down Support Rod
    const dropRod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 5.0, 8), trolleyMat);
    dropRod.position.y = -2.5;

    trolley.add(trolleyBody, pulleyL, pulleyR, dropRod);
    root.add(trolley);

    return {
      root,
      type: 'cable_cam',
      update: (camData: CameraSetupData) => {
        trolley.position.set(camData.position.x - basePos.x, 8.0, camData.position.z - basePos.z);
        const dropHeight = Math.max(0.5, 8.0 - camData.position.y);
        dropRod.scale.set(1, dropHeight / 5.0, 1);
        dropRod.position.y = -dropHeight / 2;
      },
      dispose: () => {
        disposeTree(root);
      },
    };
  }
}
