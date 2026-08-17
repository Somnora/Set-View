// ---------------------------------------------------------------------------
// SetView 3D Screenplay Line-of-Action & Cinematography Continuity Visualizer
//
// Renders:
//   - 3D Visual Line-of-Action Conversation Vector (Cyan/Blue glowing line between actors)
//   - 180-Degree Semi-Circular Exclusion Zone Arc (Translucent crimson floor disk)
//   - Camera Cut Transition Arcs connecting camera pairs with color coding:
//       * Green = Safe Continuity
//       * Amber = 30-Degree Jump Cut Warning
//       * Red   = 180-Degree Axis Cross Violation
//   - Actor Eyeline Sightline Rays projecting towards conversation partner
//   - WebXR Meta Quest 3 72fps / 90fps Zero-Allocation Update Loop
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import type { ScreenplayConfig } from './screenplayEngine.ts';
import {
  check180LineOfActionPair,
  normalizeScreenplayConfig,
} from './screenplayEngine.ts';
import type { ActorData, CameraSetupData } from './model.ts';

const MAX_CAM_TRANSITION_LINES = 16;
const ARC_SEGMENTS = 24;

export class ScreenplayContinuityRenderer {
  public readonly group: THREE.Group;

  private config: ScreenplayConfig | null = null;
  private isVisible: boolean = true;

  // 1. Line of Action Visual Elements
  private lineOfActionGeo: THREE.BufferGeometry;
  private lineOfActionMat: THREE.LineBasicMaterial;
  private lineOfActionLine: THREE.Line;

  private nodeAGeo: THREE.SphereGeometry;
  private nodeBGeo: THREE.SphereGeometry;
  private nodeMat: THREE.MeshBasicMaterial;
  private nodeAMesh: THREE.Mesh;
  private nodeBMesh: THREE.Mesh;

  // 2. 180-Degree Exclusion Zone Semi-Disk
  private exclusionZoneGeo: THREE.BufferGeometry;
  private exclusionZoneMat: THREE.MeshBasicMaterial;
  private exclusionZoneMesh: THREE.Mesh;

  // 3. Eyeline Sightlines
  private eyelineAGeo: THREE.BufferGeometry;
  private eyelineBGeo: THREE.BufferGeometry;
  private eyelineMat: THREE.LineDashedMaterial;
  private eyelineALine: THREE.Line;
  private eyelineBLine: THREE.Line;

  // 4. Camera Transition Arcs Pool
  private transitionArcLines: THREE.Line[] = [];
  private transitionArcGeos: THREE.BufferGeometry[] = [];
  private matSafe: THREE.LineBasicMaterial;
  private matJumpCut: THREE.LineBasicMaterial;
  private matCross180: THREE.LineBasicMaterial;

  // Pre-allocated scratch objects for zero-allocation per frame
  private readonly vA = new THREE.Vector3();
  private readonly vB = new THREE.Vector3();
  private readonly vMid = new THREE.Vector3();
  private readonly vDir = new THREE.Vector3();
  private readonly vPerp = new THREE.Vector3();
  private readonly vCamA = new THREE.Vector3();
  private readonly vCamB = new THREE.Vector3();
  private readonly vArcMid = new THREE.Vector3();

  constructor(initialConfig?: ScreenplayConfig | null) {
    this.group = new THREE.Group();
    this.group.name = 'ScreenplayContinuityOverlay';
    if (initialConfig) {
      this.config = normalizeScreenplayConfig(initialConfig);
    }

    // Line of Action Line
    this.lineOfActionGeo = new THREE.BufferGeometry();
    this.lineOfActionGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(6), 3),
    );
    this.lineOfActionMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8, // Electric Cyan
      linewidth: 3,
      transparent: true,
      opacity: 0.9,
    });
    this.lineOfActionLine = new THREE.Line(this.lineOfActionGeo, this.lineOfActionMat);
    this.group.add(this.lineOfActionLine);

    // Node spheres at actor conversation points
    this.nodeAGeo = new THREE.SphereGeometry(0.08, 16, 16);
    this.nodeBGeo = new THREE.SphereGeometry(0.08, 16, 16);
    this.nodeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
    });
    this.nodeAMesh = new THREE.Mesh(this.nodeAGeo, this.nodeMat);
    this.nodeBMesh = new THREE.Mesh(this.nodeBGeo, this.nodeMat);
    this.group.add(this.nodeAMesh);
    this.group.add(this.nodeBMesh);

    // 180-Degree Exclusion Zone Semi-Disk
    this.exclusionZoneGeo = new THREE.BufferGeometry();
    const diskPos = new Float32Array((ARC_SEGMENTS + 2) * 3);
    const diskIndices: number[] = [];
    for (let i = 1; i <= ARC_SEGMENTS; i++) {
      diskIndices.push(0, i, i + 1);
    }
    this.exclusionZoneGeo.setAttribute('position', new THREE.BufferAttribute(diskPos, 3));
    this.exclusionZoneGeo.setIndex(diskIndices);

    this.exclusionZoneMat = new THREE.MeshBasicMaterial({
      color: 0xef4444, // Crimson Red
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.exclusionZoneMesh = new THREE.Mesh(this.exclusionZoneGeo, this.exclusionZoneMat);
    this.group.add(this.exclusionZoneMesh);

    // Eyelines
    this.eyelineMat = new THREE.LineDashedMaterial({
      color: 0xfde047, // Bright Yellow
      dashSize: 0.15,
      gapSize: 0.08,
      transparent: true,
      opacity: 0.85,
    });
    this.eyelineAGeo = new THREE.BufferGeometry();
    this.eyelineAGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.eyelineALine = new THREE.Line(this.eyelineAGeo, this.eyelineMat);
    this.group.add(this.eyelineALine);

    this.eyelineBGeo = new THREE.BufferGeometry();
    this.eyelineBGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.eyelineBLine = new THREE.Line(this.eyelineBGeo, this.eyelineMat);
    this.group.add(this.eyelineBLine);

    // Materials for Camera Cut Transition Arcs
    this.matSafe = new THREE.LineBasicMaterial({
      color: 0x10b981, // Emerald Green
      transparent: true,
      opacity: 0.75,
    });
    this.matJumpCut = new THREE.LineBasicMaterial({
      color: 0xf59e0b, // Amber Warning
      transparent: true,
      opacity: 0.85,
    });
    this.matCross180 = new THREE.LineBasicMaterial({
      color: 0xef4444, // Red Violation
      transparent: true,
      opacity: 0.95,
    });

    // Create pooled line objects for camera transitions
    for (let i = 0; i < MAX_CAM_TRANSITION_LINES; i++) {
      const geo = new THREE.BufferGeometry();
      const posArray = new Float32Array((ARC_SEGMENTS + 1) * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
      const line = new THREE.Line(geo, this.matSafe);
      line.visible = false;
      this.transitionArcGeos.push(geo);
      this.transitionArcLines.push(line);
      this.group.add(line);
    }
  }

  public setConfig(config?: ScreenplayConfig | null): void {
    if (!config) {
      this.config = null;
      this.group.visible = false;
      return;
    }
    this.config = normalizeScreenplayConfig(config);
    this.group.visible = this.isVisible && this.config.enabled;
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.group.visible = visible && (this.config?.enabled ?? true);
  }

  /**
   * Updates 3D visual overlays based on current actors and camera setups.
   * Zero allocation inside this method for high-performance VR rendering.
   */
  public update(actors: ActorData[], cameras: CameraSetupData[]): void {
    if (!this.group.visible || actors.length < 2) {
      this.hideAll();
      return;
    }

    // Determine dialogue partner A and B
    let actorA = actors.find((a) => a.id === this.config?.dialoguePartnerAId) || actors[0];
    let actorB = actors.find((a) => a.id === this.config?.dialoguePartnerBId) || actors[1];

    if (actorA.id === actorB.id && actors.length > 1) {
      actorB = actors[1];
    }

    const eyeHeight = 1.6;
    this.vA.set(actorA.position.x, actorA.position.y + eyeHeight * 0.85, actorA.position.z);
    this.vB.set(actorB.position.x, actorB.position.y + eyeHeight * 0.85, actorB.position.z);

    // 1. Update Line of Action Line positions
    const loaPos = this.lineOfActionGeo.attributes.position as THREE.BufferAttribute;
    const loaArr = loaPos.array as Float32Array;
    loaArr[0] = this.vA.x;
    loaArr[1] = this.vA.y;
    loaArr[2] = this.vA.z;
    loaArr[3] = this.vB.x;
    loaArr[4] = this.vB.y;
    loaArr[5] = this.vB.z;
    loaPos.needsUpdate = true;
    this.lineOfActionLine.visible = true;

    // Node spheres
    this.nodeAMesh.position.copy(this.vA);
    this.nodeBMesh.position.copy(this.vB);
    this.nodeAMesh.visible = true;
    this.nodeBMesh.visible = true;

    // 2. Update 180-Degree Exclusion Zone Semi-Disk on Floor
    this.vMid.addVectors(actorA.position, actorB.position).multiplyScalar(0.5);
    this.vMid.y = 0.02; // Just above floor

    this.vDir.subVectors(actorB.position, actorA.position);
    this.vDir.y = 0;
    const lineLen = this.vDir.length() || 1.5;
    this.vDir.normalize();

    // Perpendicular vector pointing to the "safe side"
    this.vPerp.set(-this.vDir.z, 0, this.vDir.x);

    // Exclusion zone is on the opposite side of perpendicular (negative side)
    const baseHeading = Math.atan2(this.vDir.x, this.vDir.z);
    const radius = Math.max(4.0, lineLen * 2.5);

    const diskPosAttr = this.exclusionZoneGeo.attributes.position as THREE.BufferAttribute;
    const diskArr = diskPosAttr.array as Float32Array;

    // Center vertex
    diskArr[0] = this.vMid.x;
    diskArr[1] = this.vMid.y;
    diskArr[2] = this.vMid.z;

    // Arc vertices from 0 to PI on the exclusion side
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const angle = baseHeading + Math.PI + (i / ARC_SEGMENTS) * Math.PI;
      const vx = this.vMid.x + Math.sin(angle) * radius;
      const vz = this.vMid.z + Math.cos(angle) * radius;
      const idx = (i + 1) * 3;
      diskArr[idx] = vx;
      diskArr[idx + 1] = this.vMid.y;
      diskArr[idx + 2] = vz;
    }
    diskPosAttr.needsUpdate = true;
    this.exclusionZoneMesh.visible = true;

    // 3. Eyeline Sightlines
    const eyeAPos = this.eyelineAGeo.attributes.position as THREE.BufferAttribute;
    const eyeAArr = eyeAPos.array as Float32Array;
    eyeAArr[0] = this.vA.x;
    eyeAArr[1] = this.vA.y;
    eyeAArr[2] = this.vA.z;
    eyeAArr[3] = this.vA.x + (this.vB.x - this.vA.x) * 0.7;
    eyeAArr[4] = this.vA.y;
    eyeAArr[5] = this.vA.z + (this.vB.z - this.vA.z) * 0.7;
    eyeAPos.needsUpdate = true;
    this.eyelineALine.computeLineDistances();
    this.eyelineALine.visible = true;

    const eyeBPos = this.eyelineBGeo.attributes.position as THREE.BufferAttribute;
    const eyeBArr = eyeBPos.array as Float32Array;
    eyeBArr[0] = this.vB.x;
    eyeBArr[1] = this.vB.y;
    eyeBArr[2] = this.vB.z;
    eyeBArr[3] = this.vB.x + (this.vA.x - this.vB.x) * 0.7;
    eyeBArr[4] = this.vB.y;
    eyeBArr[5] = this.vB.z + (this.vA.z - this.vB.z) * 0.7;
    eyeBPos.needsUpdate = true;
    this.eyelineBLine.computeLineDistances();
    this.eyelineBLine.visible = true;

    // 4. Camera Cut Transition Arcs
    let arcIdx = 0;
    if (cameras.length >= 2) {
      for (let i = 0; i < cameras.length && arcIdx < MAX_CAM_TRANSITION_LINES; i++) {
        for (let j = i + 1; j < cameras.length && arcIdx < MAX_CAM_TRANSITION_LINES; j++) {
          const camA = cameras[i];
          const camB = cameras[j];

          const targetA = camA.lookAtTargetActorId || camA.focusTargetActorId;
          const targetB = camB.lookAtTargetActorId || camB.focusTargetActorId;

          const analysis = check180LineOfActionPair(
            actorA.position,
            actorB.position,
            camA.position,
            targetA ? actorA.position : { x: 0, y: 1.6, z: 0 },
            camB.position,
            targetB ? actorB.position : { x: 0, y: 1.6, z: 0 },
            camA.name,
            camB.name,
            camA.id,
            camB.id,
          );

          this.vCamA.set(camA.position.x, camA.position.y + 0.1, camA.position.z);
          this.vCamB.set(camB.position.x, camB.position.y + 0.1, camB.position.z);

          // Control point for quadratic curve arc
          this.vArcMid.addVectors(this.vCamA, this.vCamB).multiplyScalar(0.5);
          this.vArcMid.y += 0.6; // Arch upwards

          const arcLine = this.transitionArcLines[arcIdx];
          const arcGeo = this.transitionArcGeos[arcIdx];
          const arcPosAttr = arcGeo.attributes.position as THREE.BufferAttribute;
          const arcArr = arcPosAttr.array as Float32Array;

          for (let s = 0; s <= ARC_SEGMENTS; s++) {
            const t = s / ARC_SEGMENTS;
            const omt = 1 - t;
            // Quadratic Bezier: (1-t)^2 * P0 + 2*(1-t)*t * P1 + t^2 * P2
            const px = omt * omt * this.vCamA.x + 2 * omt * t * this.vArcMid.x + t * t * this.vCamB.x;
            const py = omt * omt * this.vCamA.y + 2 * omt * t * this.vArcMid.y + t * t * this.vCamB.y;
            const pz = omt * omt * this.vCamA.z + 2 * omt * t * this.vArcMid.z + t * t * this.vCamB.z;
            const k = s * 3;
            arcArr[k] = px;
            arcArr[k + 1] = py;
            arcArr[k + 2] = pz;
          }
          arcPosAttr.needsUpdate = true;

          // Apply material based on severity
          if (analysis.severity === 'violation_180_cross') {
            arcLine.material = this.matCross180;
          } else if (analysis.severity === 'warning_jump_cut') {
            arcLine.material = this.matJumpCut;
          } else {
            arcLine.material = this.matSafe;
          }

          arcLine.visible = true;
          arcIdx++;
        }
      }
    }

    // Hide remaining unused pooled arcs
    for (let k = arcIdx; k < MAX_CAM_TRANSITION_LINES; k++) {
      this.transitionArcLines[k].visible = false;
    }
  }

  private hideAll(): void {
    this.lineOfActionLine.visible = false;
    this.nodeAMesh.visible = false;
    this.nodeBMesh.visible = false;
    this.exclusionZoneMesh.visible = false;
    this.eyelineALine.visible = false;
    this.eyelineBLine.visible = false;
    for (const arc of this.transitionArcLines) {
      arc.visible = false;
    }
  }

  public dispose(): void {
    this.lineOfActionGeo.dispose();
    this.lineOfActionMat.dispose();
    this.nodeAGeo.dispose();
    this.nodeBGeo.dispose();
    this.nodeMat.dispose();
    this.exclusionZoneGeo.dispose();
    this.exclusionZoneMat.dispose();
    this.eyelineAGeo.dispose();
    this.eyelineBGeo.dispose();
    this.eyelineMat.dispose();
    this.matSafe.dispose();
    this.matJumpCut.dispose();
    this.matCross180.dispose();

    for (const geo of this.transitionArcGeos) {
      geo.dispose();
    }
    this.group.clear();
  }
}
