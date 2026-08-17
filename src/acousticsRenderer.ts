// ---------------------------------------------------------------------------
// SetView Soundstage Acoustics & Spatial Dialogue Three.js Visualizer
//
// Renders:
//   - Parametric 3D Microphone Polar Directivity Lobes (Shotgun, Hypercardioid, Cardioid, Omni, Fig-8)
//   - Telescoping Carbon Fiber Boom Poles, Shockmount Cradles & Windscreen Blimps
//   - Actor Chest Lavalier Transmitters & Omnidirectional Pick-up Radii
//   - Dynamic Camera Frame Gate Incursion Warning Plane (Safe / Caution / In-Shot Breach)
//   - Conversational Speech SPL Wave Rings
//   - WebXR 72/90fps zero-allocation per frame update loop
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import type {
  AcousticsConfig,
  BoomIncursionAlert,
  BoomMicEntity,
  LavalierMicEntity,
  MicCapsuleProfile,
  MicPolarPattern,
} from './acousticsEngine.ts';
import {
  CURATED_MIC_PROFILES,
  calculateBoomFrameIncursion,
  createAcousticsConfig,
  normalizeAcousticsConfig,
} from './acousticsEngine.ts';
import {
  type ActorData,
  type CameraSetupData,
  aspectValue,
  sensorFormat,
} from './model.ts';

/** Creates a parametric polar directivity lobe mesh for a given microphone polar pattern. */
function createPolarLobeGeometry(pattern: MicPolarPattern, segmentsTheta = 24, segmentsPhi = 16): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const tempColor = new THREE.Color();

  for (let j = 0; j <= segmentsPhi; j++) {
    const phi = (j / segmentsPhi) * Math.PI; // 0 (front pole) to PI (back pole)
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);

    for (let i = 0; i <= segmentsTheta; i++) {
      const theta = (i / segmentsTheta) * Math.PI * 2;
      const cosTheta = Math.cos(theta);
      const sinTheta = Math.sin(theta);

      // Polar pattern response function
      let r = 1.0;
      switch (pattern) {
        case 'omnidirectional':
          r = 1.0;
          break;
        case 'cardioid':
          r = 0.5 + 0.5 * cosPhi;
          break;
        case 'hypercardioid':
          r = Math.abs(0.25 + 0.75 * cosPhi);
          break;
        case 'figure_eight':
          r = Math.abs(cosPhi);
          break;
        case 'shotgun_supercardioid':
        default: {
          const base = Math.abs(0.37 + 0.63 * cosPhi);
          // Tight interference lobe shaping
          const tubeTuning = Math.pow(Math.max(0.01, (1.0 + cosPhi) * 0.5), 1.8);
          r = base * 0.4 + tubeTuning * 0.6;
          break;
        }
      }

      // Scale to acoustic reach meters
      const radiusM = Math.max(0.08, r * 1.35);

      // Microphones point forward along -Z in local space
      const x = radiusM * sinPhi * sinTheta;
      const y = radiusM * sinPhi * cosTheta;
      const z = -radiusM * cosPhi;

      positions.push(x, y, z);

      // Color mapping: On-axis green -> off-axis yellow -> rear cyan/blue
      const dbAtten = 20.0 * Math.log10(Math.max(0.001, r));
      if (dbAtten > -3) {
        tempColor.setRGB(0.18, 0.85, 0.35); // Bright Green
      } else if (dbAtten > -9) {
        tempColor.setRGB(0.95, 0.75, 0.15); // Yellow / Amber
      } else if (dbAtten > -18) {
        tempColor.setRGB(0.95, 0.35, 0.15); // Orange
      } else {
        tempColor.setRGB(0.2, 0.6, 0.9); // Cyan / Blue
      }
      colors.push(tempColor.r, tempColor.g, tempColor.b);
    }
  }

  // Generate quad indices
  for (let j = 0; j < segmentsPhi; j++) {
    for (let i = 0; i < segmentsTheta; i++) {
      const a = j * (segmentsTheta + 1) + i;
      const b = (j + 1) * (segmentsTheta + 1) + i;
      const c = (j + 1) * (segmentsTheta + 1) + (i + 1);
      const d = j * (segmentsTheta + 1) + (i + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

export class AcousticsRenderer {
  public readonly group = new THREE.Group();

  private config: AcousticsConfig;
  private boomGroups = new Map<string, THREE.Group>();
  private lavalierGroups = new Map<string, THREE.Group>();
  private speechWaveGroup = new THREE.Group();
  private incursionWarningMesh: THREE.Mesh | null = null;
  private incursionWarningLine: THREE.LineSegments | null = null;

  private isLobeVisible = true;
  private isWavesVisible = true;
  private isIncursionVisible = true;

  // Shared reusable materials
  private readonly boomPoleMat: THREE.MeshStandardMaterial;
  private readonly shockmountMat: THREE.MeshStandardMaterial;
  private readonly blimpMat: THREE.MeshStandardMaterial;
  private readonly operatorBaseMat: THREE.MeshBasicMaterial;
  private readonly lavChestMat: THREE.MeshStandardMaterial;
  private readonly waveRingMat: THREE.MeshBasicMaterial;
  private readonly incursionMat: THREE.MeshBasicMaterial;

  // Cached vector buffers to prevent garbage collection in render loops
  private readonly tempV1 = new THREE.Vector3();
  private readonly tempV2 = new THREE.Vector3();
  private readonly tempDir = new THREE.Vector3();

  constructor(initialConfig?: AcousticsConfig) {
    this.group.name = 'AcousticsRoot';
    this.config = initialConfig ? normalizeAcousticsConfig(initialConfig) : createAcousticsConfig();

    this.boomPoleMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Matte Carbon Fiber Dark Grey
      roughness: 0.4,
      metalness: 0.8,
    });

    this.shockmountMat = new THREE.MeshStandardMaterial({
      color: 0xef4444, // Red Rycote Lyre Suspension
      roughness: 0.5,
      metalness: 0.2,
    });

    this.blimpMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Windscreen Blimp Basket Mesh
      roughness: 0.9,
      metalness: 0.1,
      wireframe: false,
    });

    this.operatorBaseMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    });

    this.lavChestMat = new THREE.MeshStandardMaterial({
      color: 0x10b981, // Emerald Green Transmitter Indicator
      emissive: 0x059669,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.5,
    });

    this.waveRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.4,
      wireframe: true,
      depthWrite: false,
    });

    this.incursionMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.group.add(this.speechWaveGroup);
    this.speechWaveGroup.name = 'SpeechAcousticWaves';

    this.createIncursionVisualizer();
    this.rebuild();
  }

  public setConfig(newConfig: AcousticsConfig): void {
    this.config = normalizeAcousticsConfig(newConfig);
    this.rebuild();
  }

  public getConfig(): AcousticsConfig {
    return this.config;
  }

  public setLobeVisibility(visible: boolean): void {
    this.isLobeVisible = visible;
    this.boomGroups.forEach((grp) => {
      const lobe = grp.getObjectByName('PolarLobe');
      if (lobe) lobe.visible = visible;
    });
  }

  public setWavesVisibility(visible: boolean): void {
    this.isWavesVisible = visible;
    this.speechWaveGroup.visible = visible;
  }

  public setIncursionVisibility(visible: boolean): void {
    this.isIncursionVisible = visible;
    if (this.incursionWarningMesh) this.incursionWarningMesh.visible = visible;
    if (this.incursionWarningLine) this.incursionWarningLine.visible = visible;
  }

  /** Rebuilds 3D meshes for all boom poles and lavaliers. */
  public rebuild(): void {
    // Clear old boom groups
    this.boomGroups.forEach((grp) => {
      this.group.remove(grp);
      this.disposeObjectHierarchy(grp);
    });
    this.boomGroups.clear();

    // Clear old lavalier groups
    this.lavalierGroups.forEach((grp) => {
      this.group.remove(grp);
      this.disposeObjectHierarchy(grp);
    });
    this.lavalierGroups.clear();

    if (!this.config.enabled) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    // Build boom rigs
    for (const boom of this.config.boomMics) {
      const boomGrp = this.createBoomRigObject(boom);
      this.group.add(boomGrp);
      this.boomGroups.set(boom.id, boomGrp);
    }

    // Build lavalier markers
    for (const lav of this.config.lavalierMics) {
      const lavGrp = this.createLavalierObject(lav);
      this.group.add(lavGrp);
      this.lavalierGroups.set(lav.id, lavGrp);
    }
  }

  private createIncursionVisualizer(): void {
    const planeGeo = new THREE.PlaneGeometry(3.0, 0.4);
    this.incursionWarningMesh = new THREE.Mesh(planeGeo, this.incursionMat);
    this.incursionWarningMesh.name = 'BoomIncursionPlane';
    this.incursionWarningMesh.visible = false;

    const lineGeo = new THREE.EdgesGeometry(planeGeo);
    this.incursionWarningLine = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 }),
    );
    this.incursionWarningLine.name = 'BoomIncursionBoundary';
    this.incursionWarningLine.visible = false;

    this.group.add(this.incursionWarningMesh);
    this.group.add(this.incursionWarningLine);
  }

  private createBoomRigObject(boom: BoomMicEntity): THREE.Group {
    const grp = new THREE.Group();
    grp.name = `BoomRig_${boom.id}`;

    const profile: MicCapsuleProfile =
      CURATED_MIC_PROFILES[boom.capsuleId] || CURATED_MIC_PROFILES.sennheiser_mkh416;

    // 1. Operator Footprint Pedestal
    const opPos = boom.pole.operatorPosition;
    const baseGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.05, 16);
    const baseMesh = new THREE.Mesh(baseGeo, this.operatorBaseMat);
    baseMesh.position.set(opPos.x, opPos.y + 0.025, opPos.z);
    baseMesh.name = 'OperatorBase';
    grp.add(baseMesh);

    // Operator pivot point at shoulder/hands height
    const pivot = new THREE.Vector3(opPos.x, opPos.y + boom.pole.pivotHeightM, opPos.z);
    const capsulePos = new THREE.Vector3(boom.position.x, boom.position.y, boom.position.z);

    // 2. Telescoping Boom Pole Cylinder
    const poleLength = pivot.distanceTo(capsulePos);
    const poleGeo = new THREE.CylinderGeometry(0.016, 0.022, Math.max(0.1, poleLength), 12);
    poleGeo.translate(0, poleLength * 0.5, 0);
    poleGeo.rotateX(Math.PI * 0.5); // align along +Z

    const poleMesh = new THREE.Mesh(poleGeo, this.boomPoleMat);
    poleMesh.position.copy(pivot);
    poleMesh.lookAt(capsulePos);
    poleMesh.name = 'TelescopingPole';
    grp.add(poleMesh);

    // 3. Capsule Head Assembly Group
    const headGroup = new THREE.Group();
    headGroup.name = 'CapsuleHead';
    headGroup.position.copy(capsulePos);
    headGroup.quaternion.set(boom.orientation.x, boom.orientation.y, boom.orientation.z, boom.orientation.w);

    // Shockmount Lyre Ring
    const mountGeo = new THREE.TorusGeometry(0.045, 0.006, 8, 16);
    const mountMesh = new THREE.Mesh(mountGeo, this.shockmountMat);
    mountMesh.name = 'ShockmountLyre';
    headGroup.add(mountMesh);

    // Windscreen Blimp Basket
    const blimpLength = Math.max(0.18, (profile.tubeLengthM ?? 0.25) + 0.08);
    const blimpGeo = new THREE.CapsuleGeometry(0.038, blimpLength, 8, 16);
    blimpGeo.rotateX(Math.PI * 0.5); // align along -Z / +Z
    const blimpMesh = new THREE.Mesh(blimpGeo, this.blimpMat);
    blimpMesh.position.set(0, 0, -blimpLength * 0.35);
    blimpMesh.name = 'WindscreenBlimp';
    headGroup.add(blimpMesh);

    // 4. Parametric 3D Polar Directivity Lobe Mesh
    const lobeGeo = createPolarLobeGeometry(profile.pattern, 20, 14);
    const lobeMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.35,
      wireframe: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const lobeMesh = new THREE.Mesh(lobeGeo, lobeMat);
    lobeMesh.name = 'PolarLobe';
    lobeMesh.visible = this.isLobeVisible;
    headGroup.add(lobeMesh);

    grp.add(headGroup);
    return grp;
  }

  private createLavalierObject(lav: LavalierMicEntity): THREE.Group {
    const grp = new THREE.Group();
    grp.name = `Lav_${lav.id}`;

    // Transmitter indicator body
    const bodyGeo = new THREE.BoxGeometry(0.04, 0.06, 0.015);
    const bodyMesh = new THREE.Mesh(bodyGeo, this.lavChestMat);
    bodyMesh.name = 'TransmitterPack';
    grp.add(bodyMesh);

    // Omnidirectional sensitivity sphere
    const haloGeo = new THREE.SphereGeometry(0.25, 12, 8);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.2,
      wireframe: true,
      depthWrite: false,
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    haloMesh.name = 'OmniPickupRadius';
    grp.add(haloMesh);

    return grp;
  }

  /**
   * Updates dynamic positions, speech acoustic wave rings, and frame incursion alerts
   * in real time without creating heap allocations.
   */
  public update(
    actors: ActorData[],
    activeCamera?: CameraSetupData,
    elapsedSeconds: number = 0,
  ): BoomIncursionAlert[] {
    if (!this.config.enabled) return [];

    const incursionAlerts: BoomIncursionAlert[] = [];

    // 1. Update Lavalier positions relative to assigned actors
    for (const lav of this.config.lavalierMics) {
      const lavGrp = this.lavalierGroups.get(lav.id);
      if (!lavGrp) continue;

      const actor = actors.find((a) => a.id === lav.actorId);
      if (actor) {
        lavGrp.visible = true;
        lavGrp.position.set(
          actor.position.x + lav.chestOffset.x,
          actor.position.y + lav.chestOffset.y,
          actor.position.z + lav.chestOffset.z,
        );
      } else {
        lavGrp.visible = false;
      }
    }

    // 2. Update boom cues and frame incursion checks
    for (const boom of this.config.boomMics) {
      const boomGrp = this.boomGroups.get(boom.id);
      if (!boomGrp) continue;

      // Auto-aim cue if target actor is specified
      if (boom.targetActorId) {
        const targetActor = actors.find((a) => a.id === boom.targetActorId);
        if (targetActor) {
          // Point boom capsule directly at actor vocal tract (~1.65m height)
          this.tempV1.set(targetActor.position.x, targetActor.position.y + 1.65, targetActor.position.z);
          boom.pole.targetPoint = { x: this.tempV1.x, y: this.tempV1.y, z: this.tempV1.z };

          const head = boomGrp.getObjectByName('CapsuleHead');
          if (head) {
            this.tempDir.subVectors(this.tempV1, head.position).normalize();
            // Invert forward for Three.js lookAt convention
            this.tempV2.copy(head.position).add(this.tempDir);
            head.lookAt(this.tempV2);
            boom.orientation = {
              x: head.quaternion.x,
              y: head.quaternion.y,
              z: head.quaternion.z,
              w: head.quaternion.w,
            };
          }
        }
      }

      // Check frame incursion against active camera
      if (activeCamera && this.isIncursionVisible) {
        const camPos = activeCamera.position;
        const camRot = activeCamera.rotation;
        const fmt = sensorFormat(activeCamera.formatId);
        const fov = 2 * Math.atan((fmt.gateWidthMm / 2) / (activeCamera.lensFocalLength || 35)) * (180 / Math.PI);
        const aspect = aspectValue(activeCamera.aspect);

        const alert = calculateBoomFrameIncursion(
          boom.position,
          0.06, // 6cm blimp radius
          camPos,
          camRot,
          fov,
          aspect,
        );
        incursionAlerts.push(alert);

        // Update incursion visual plane
        if (alert.severity === 'breach_in_shot' || alert.severity === 'warning_near_gate') {
          if (this.incursionWarningMesh && this.incursionWarningLine) {
            this.incursionWarningMesh.visible = true;
            this.incursionWarningLine.visible = true;

            const isBreach = alert.severity === 'breach_in_shot';
            this.incursionMat.color.setHex(isBreach ? 0xef4444 : 0xf59e0b);

            // Position warning indicator right at camera top gate line
            this.incursionWarningMesh.position.set(boom.position.x, boom.position.y - 0.05, boom.position.z);
            this.incursionWarningLine.position.copy(this.incursionWarningMesh.position);
          }
        } else {
          if (this.incursionWarningMesh) this.incursionWarningMesh.visible = false;
          if (this.incursionWarningLine) this.incursionWarningLine.visible = false;
        }
      }
    }

    // 3. Update Conversational Dialogue Wave Rings
    if (this.isWavesVisible && actors.length > 0) {
      this.updateSpeechWaveRings(actors, elapsedSeconds);
    }

    return incursionAlerts;
  }

  private updateSpeechWaveRings(actors: ActorData[], elapsedSeconds: number): void {
    // Dynamic animated rings around talking actors
    const numActors = actors.length;
    while (this.speechWaveGroup.children.length < numActors * 2) {
      const ringGeo = new THREE.RingGeometry(0.3, 0.35, 24);
      ringGeo.rotateX(-Math.PI * 0.5); // Lay flat on horizontal plane
      const ringMesh = new THREE.Mesh(ringGeo, this.waveRingMat);
      this.speechWaveGroup.add(ringMesh);
    }

    let ringIdx = 0;
    for (const actor of actors) {
      const phase = (elapsedSeconds * 1.5 + ringIdx) % 1.0;
      const ring1 = this.speechWaveGroup.children[ringIdx++] as THREE.Mesh;
      const ring2 = this.speechWaveGroup.children[ringIdx++] as THREE.Mesh;

      if (ring1) {
        ring1.visible = true;
        ring1.position.set(actor.position.x, actor.position.y + 1.5, actor.position.z);
        const scale1 = 0.5 + phase * 2.0;
        ring1.scale.set(scale1, scale1, scale1);
      }

      if (ring2) {
        const phase2 = (phase + 0.5) % 1.0;
        ring2.visible = true;
        ring2.position.set(actor.position.x, actor.position.y + 1.5, actor.position.z);
        const scale2 = 0.5 + phase2 * 2.0;
        ring2.scale.set(scale2, scale2, scale2);
      }
    }

    // Hide extra rings
    for (let i = ringIdx; i < this.speechWaveGroup.children.length; i++) {
      this.speechWaveGroup.children[i].visible = false;
    }
  }

  private disposeObjectHierarchy(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).geometry) {
        (child as THREE.Mesh).geometry.dispose();
      }
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else if (mat) {
          mat.dispose();
        }
      }
    });
  }

  public dispose(): void {
    this.boomGroups.forEach((grp) => this.disposeObjectHierarchy(grp));
    this.lavalierGroups.forEach((grp) => this.disposeObjectHierarchy(grp));
    this.disposeObjectHierarchy(this.speechWaveGroup);

    this.boomPoleMat.dispose();
    this.shockmountMat.dispose();
    this.blimpMat.dispose();
    this.operatorBaseMat.dispose();
    this.lavChestMat.dispose();
    this.waveRingMat.dispose();
    this.incursionMat.dispose();

    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
  }
}
