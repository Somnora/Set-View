// ---------------------------------------------------------------------------
// SetView 3D Spatial Comfort Visualizer & Fullscreen Locomotion Vignette
// Ergonomic reach envelopes, near-eye vergence shell, neck strain cone,
// out-of-reach warning markers, and zero-allocation dynamic vignette shader.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import {
  calculateDynamicComfortVignetteRadius,
  createDefaultComfortConfig,
  type VRComfortConfig,
} from './comfortEngine.ts';

// Scratch vector / matrix to guarantee zero per-frame garbage collection
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

export class SpatialComfortRenderer {
  public readonly group: THREE.Group;
  public readonly vignetteGroup: THREE.Group;

  private config: VRComfortConfig;
  private isVisible: boolean = false;
  private isVignetteEnabled: boolean = true;

  // Reach shells
  private readonly reachEnvelopeGroup: THREE.Group;
  private readonly nearEyeMesh: THREE.Mesh;
  private readonly optimalReachMesh: THREE.Mesh;
  private readonly maxReachMesh: THREE.Mesh;
  private readonly excessiveReachRing: THREE.LineSegments;

  // Neck strain & gaze indicator
  private readonly neckIndicatorGroup: THREE.Group;
  private readonly gazeRayLine: THREE.Line;
  private readonly neutralConeMesh: THREE.Mesh;

  // Fullscreen dynamic vignette plane
  public readonly vignetteMesh: THREE.Mesh;
  private readonly vignetteMaterial: THREE.ShaderMaterial;
  private currentVignetteRadius: number = 1.0;

  // Previous camera pose for automatic speed & angular velocity tracking
  private readonly prevCamPos: THREE.Vector3 = new THREE.Vector3();
  private readonly prevCamQuat: THREE.Quaternion = new THREE.Quaternion();
  private hasPrevCamPose: boolean = false;

  // Out of reach markers pool
  private readonly warningMarkersGroup: THREE.Group;
  private readonly warningMarkerMeshes: THREE.Mesh[] = [];
  private readonly maxWarningMarkers: number = 32;

  constructor(initialConfig?: Partial<VRComfortConfig> | null) {
    this.config = createDefaultComfortConfig(initialConfig ?? undefined);
    this.group = new THREE.Group();
    this.group.name = 'SpatialComfortRenderer';

    this.vignetteGroup = new THREE.Group();
    this.vignetteGroup.name = 'VRComfortVignette';

    // 1. Fullscreen Dynamic Vignette Plane (Attached to camera)
    const vignetteGeo = new THREE.PlaneGeometry(2, 2);
    this.vignetteMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uRadius: { value: 1.0 },
        uFeather: { value: 0.25 },
        uAspect: { value: 1.0 },
        uVignetteColor: { value: new THREE.Color(0x000000) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, -0.1, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uRadius;
        uniform float uFeather;
        uniform float uAspect;
        uniform vec3 uVignetteColor;
        varying vec2 vUv;

        void main() {
          vec2 center = vec2(0.5, 0.5);
          vec2 coord = vUv - center;
          coord.x *= uAspect;

          float dist = length(coord) * 2.0;
          float edge0 = max(0.01, uRadius - uFeather);
          float edge1 = uRadius;
          float factor = smoothstep(edge0, edge1, dist);

          if (factor <= 0.001) {
            discard;
          }

          gl_FragColor = vec4(uVignetteColor, factor);
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.vignetteMesh = new THREE.Mesh(vignetteGeo, this.vignetteMaterial);
    this.vignetteMesh.frustumCulled = false;
    this.vignetteMesh.renderOrder = 9999;
    this.vignetteGroup.add(this.vignetteMesh);

    // 2. Concentric Reach Envelopes
    this.reachEnvelopeGroup = new THREE.Group();
    this.reachEnvelopeGroup.name = 'ReachEnvelopes';

    const nearEyeGeo = new THREE.SphereGeometry(0.25, 16, 12);
    const nearEyeMat = new THREE.MeshBasicMaterial({
      color: 0xec4899,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    this.nearEyeMesh = new THREE.Mesh(nearEyeGeo, nearEyeMat);
    this.reachEnvelopeGroup.add(this.nearEyeMesh);

    const optimalGeo = new THREE.SphereGeometry(0.55, 24, 16);
    const optimalMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      wireframe: true,
      transparent: true,
      opacity: 0.25,
    });
    this.optimalReachMesh = new THREE.Mesh(optimalGeo, optimalMat);
    this.reachEnvelopeGroup.add(this.optimalReachMesh);

    const armLength = this.config.userArmLengthM || 0.65;
    const maxReachGeo = new THREE.SphereGeometry(armLength, 24, 16);
    const maxReachMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
    });
    this.maxReachMesh = new THREE.Mesh(maxReachGeo, maxReachMat);
    this.reachEnvelopeGroup.add(this.maxReachMesh);

    const ringGeo = new THREE.RingGeometry(armLength, armLength + 0.02, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    this.excessiveReachRing = new THREE.LineSegments(
      new THREE.EdgesGeometry(ringGeo),
      new THREE.LineBasicMaterial({ color: 0xef4444 }),
    );
    this.reachEnvelopeGroup.add(this.excessiveReachRing);

    this.group.add(this.reachEnvelopeGroup);

    // 3. Neck Strain & Gaze Indicator (15-deg Neutral Cone)
    this.neckIndicatorGroup = new THREE.Group();
    this.neckIndicatorGroup.name = 'NeckStrainIndicator';

    const gazeGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -2.0),
    ]);
    const gazeMat = new THREE.LineBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.7,
    });
    this.gazeRayLine = new THREE.Line(gazeGeo, gazeMat);
    this.neckIndicatorGroup.add(this.gazeRayLine);

    const coneRadius = Math.tan((15 * Math.PI) / 180) * 1.5;
    const coneGeo = new THREE.ConeGeometry(coneRadius, 1.5, 16, 1, true);
    coneGeo.rotateX(-Math.PI / 2);
    coneGeo.translate(0, 0, -0.75);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
    });
    this.neutralConeMesh = new THREE.Mesh(coneGeo, coneMat);
    this.neckIndicatorGroup.add(this.neutralConeMesh);

    this.group.add(this.neckIndicatorGroup);

    // 4. Out of reach Warning Markers
    this.warningMarkersGroup = new THREE.Group();
    this.warningMarkersGroup.name = 'OutOfReachWarnings';

    const warningGeo = new THREE.RingGeometry(0.04, 0.06, 16);
    const warningMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    for (let i = 0; i < this.maxWarningMarkers; i++) {
      const marker = new THREE.Mesh(warningGeo, warningMat);
      marker.visible = false;
      this.warningMarkerMeshes.push(marker);
      this.warningMarkersGroup.add(marker);
    }
    this.group.add(this.warningMarkersGroup);

    this.updateVisibility();
  }

  public setConfig(config?: Partial<VRComfortConfig> | null): void {
    this.config = createDefaultComfortConfig(config ?? undefined);
    this.isVignetteEnabled = this.config.vignette.enabled;

    // Rescale reach shells if user arm length changed
    const armLen = this.config.userArmLengthM || 0.65;
    this.maxReachMesh.scale.set(armLen / 0.65, armLen / 0.65, armLen / 0.65);
    this.updateVisibility();
  }

  /**
   * Whether the reach shells and out-of-reach markers are showing.
   *
   * Exposed so the per-frame caller can skip building the `targetPositions` array
   * when it would only be discarded: that argument is consumed solely inside the
   * `isVisible` branch of update(), and arguments are evaluated eagerly, so building
   * it unconditionally allocated one object per prop, camera and actor every frame
   * for nothing in the normal hidden case.
   */
  public getIsVisible(): boolean {
    return this.isVisible;
  }

  public setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.updateVisibility();
  }

  public setVignetteVisible(visible: boolean): void {
    this.isVignetteEnabled = visible;
    this.vignetteGroup.visible = visible && this.config.vignette.enabled;
  }

  private updateVisibility(): void {
    this.reachEnvelopeGroup.visible = this.isVisible;
    this.neckIndicatorGroup.visible = this.isVisible;
    this.warningMarkersGroup.visible = this.isVisible;
    this.vignetteGroup.visible = this.isVignetteEnabled && this.config.vignette.enabled;
  }

  /**
   * Zero-allocation per-frame update loop.
   */
  public update(
    camera: THREE.Camera,
    dtSec: number,
    targetPositions?: Array<
      | { x: number; y: number; z: number }
      | { position: { x: number; y: number; z: number } }
    >,
  ): void {
    const effectiveDt = dtSec > 0.0001 ? dtSec : 1 / 72;

    camera.getWorldPosition(_v1);
    camera.getWorldQuaternion(_q1);

    // Calculate linear speed and angular velocity from camera pose delta
    let linearSpeedMPerSec = 0;
    let angularSpeedDegPerSec = 0;
    if (this.hasPrevCamPose && effectiveDt > 0.0001) {
      linearSpeedMPerSec = _v1.distanceTo(this.prevCamPos) / effectiveDt;
      const dot = Math.abs(Math.max(-1, Math.min(1, _q1.dot(this.prevCamQuat))));
      const angleRad = 2 * Math.acos(dot);
      angularSpeedDegPerSec = (angleRad * (180 / Math.PI)) / effectiveDt;
    }
    this.prevCamPos.copy(_v1);
    this.prevCamQuat.copy(_q1);
    this.hasPrevCamPose = true;

    // 1. Dynamic Comfort Vignette Tunneling Radius
    if (this.isVignetteEnabled && this.config.vignette.enabled) {
      const targetRadius = calculateDynamicComfortVignetteRadius(
        linearSpeedMPerSec,
        angularSpeedDegPerSec,
        this.config.vignette,
      );

      // Smooth exponential decay fade
      const fadeSpeedFactor = Math.max(0.01, this.config.vignette.fadeSpeedMs / 1000);
      const alpha = 1.0 - Math.exp(-effectiveDt / fadeSpeedFactor);
      this.currentVignetteRadius += (targetRadius - this.currentVignetteRadius) * alpha;

      this.vignetteMaterial.uniforms.uRadius.value = this.currentVignetteRadius;

      // Update aspect ratio
      if ('aspect' in camera && typeof (camera as any).aspect === 'number') {
        this.vignetteMaterial.uniforms.uAspect.value = (camera as any).aspect;
      }
    }

    // 2. Position Reach Envelope at Shoulder/Eye origin
    if (this.isVisible) {
      // Lower origin slightly to shoulder level
      _v1.y -= 0.25;
      this.reachEnvelopeGroup.position.copy(_v1);

      // Align neck indicator with camera head pose
      this.neckIndicatorGroup.position.copy(_v1);
      this.neckIndicatorGroup.quaternion.copy(_q1);

      // 3. Update Out-of-Reach Warnings
      if (targetPositions && targetPositions.length > 0) {
        const armLen = this.config.userArmLengthM || 0.65;
        let markerIdx = 0;

        for (const target of targetPositions) {
          if (markerIdx >= this.maxWarningMarkers) break;
          const pos = 'position' in target ? target.position : target;
          _v2.set(pos.x, pos.y, pos.z);
          const dist = _v1.distanceTo(_v2);

          if (dist > armLen || dist < 0.25) {
            const marker = this.warningMarkerMeshes[markerIdx];
            marker.position.copy(_v2);
            marker.quaternion.copy(_q1);
            marker.visible = true;

            // Pulse warning opacity
            const pulse = (Math.sin(performance.now() * 0.008) + 1.0) * 0.5;
            const mat = marker.material as THREE.MeshBasicMaterial;
            mat.opacity = 0.4 + pulse * 0.5;
            mat.color.setHex(dist < 0.25 ? 0xec4899 : 0xef4444);

            markerIdx++;
          }
        }

        for (let j = markerIdx; j < this.maxWarningMarkers; j++) {
          this.warningMarkerMeshes[j].visible = false;
        }
      } else {
        for (const m of this.warningMarkerMeshes) {
          m.visible = false;
        }
      }
    }
  }

  public dispose(): void {
    this.vignetteMaterial.dispose();
    this.vignetteMesh.geometry.dispose();

    this.nearEyeMesh.geometry.dispose();
    (this.nearEyeMesh.material as THREE.Material).dispose();

    this.optimalReachMesh.geometry.dispose();
    (this.optimalReachMesh.material as THREE.Material).dispose();

    this.maxReachMesh.geometry.dispose();
    (this.maxReachMesh.material as THREE.Material).dispose();

    this.excessiveReachRing.geometry.dispose();
    (this.excessiveReachRing.material as THREE.Material).dispose();

    this.gazeRayLine.geometry.dispose();
    (this.gazeRayLine.material as THREE.Material).dispose();

    this.neutralConeMesh.geometry.dispose();
    (this.neutralConeMesh.material as THREE.Material).dispose();

    for (const m of this.warningMarkerMeshes) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }
}
