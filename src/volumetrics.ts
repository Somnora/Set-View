// ---------------------------------------------------------------------------
// Real-time volumetric lighting and atmospheric set fog simulation.
// Optimized for WebXR on Meta Quest 3 (72fps budget).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { type AtmosphereConfig } from './atmosphere.ts';
import { type LightData } from './model.ts';

/**
 * Converts color temperature in Kelvin (1000K to 40000K) to a normalized RGB color.
 * Uses the Planckian locus approximation algorithm.
 */
export function kelvinToRgb(kelvin: number): THREE.Color {
  const temp = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let r: number, g: number, b: number;

  if (temp <= 66) {
    r = 255;
    g = Math.max(0, Math.min(255, 99.4708025861 * Math.log(temp) - 161.1195681661));
    if (temp <= 19) {
      b = 0;
    } else {
      b = Math.max(0, Math.min(255, 138.5177312231 * Math.log(temp - 10) - 305.0447927307));
    }
  } else {
    r = Math.max(0, Math.min(255, 329.698727446 * Math.pow(temp - 60, -0.1332047592)));
    g = Math.max(0, Math.min(255, 288.1221695283 * Math.pow(temp - 60, -0.0755148492)));
    b = 255;
  }

  return new THREE.Color(r / 255, g / 255, b / 255);
}

const BEAM_VERT = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  void main() {
    vLocalPos = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPos = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const BEAM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uDensity;
  uniform float uScattering;
  uniform float uBeamIntensity;
  uniform float uLightIntensity;
  uniform float uHeightFalloff;
  uniform float uConeAngleRad;
  uniform float uConeLength;
  uniform float uTime;

  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  varying vec3 vNormal;
  varying vec3 vViewPos;

  void main() {
    // Distance along the cone axis from apex (z is negative extending to -uConeLength)
    float zDist = max(0.001, -vLocalPos.z);
    float coneRadiusAtZ = zDist * tan(uConeAngleRad * 0.5);
    float radialDist = length(vLocalPos.xy);
    float rho = clamp(radialDist / max(0.001, coneRadiusAtZ), 0.0, 1.0);

    // Soft radial edge falloff
    float radialSoftness = smoothstep(1.0, 0.05, rho);
    float edgePower = pow(clamp(1.0 - rho, 0.0, 1.0), 1.2);

    // Longitudinal distance extinction falloff
    float distNorm = clamp(zDist / uConeLength, 0.0, 1.0);
    float distFalloff = pow(1.0 - distNorm, 1.4) / (1.0 + 0.08 * zDist);

    // Height-based atmospheric extinction
    float heightExtinction = exp(-uHeightFalloff * max(0.0, vWorldPos.y));

    // Near camera fade to prevent hard near-plane intersection artifacts
    float camDist = length(vViewPos);
    float nearFade = smoothstep(0.15, 0.65, camDist);

    // Silhouette glancing angle softening
    float viewDot = abs(dot(normalize(vNormal), normalize(vViewPos)));
    float glanceSoft = pow(viewDot, 0.4);

    // Forward scattering boost
    float scatteringBoost = 1.0 + uScattering * 0.6;

    float alpha = radialSoftness * edgePower * distFalloff * heightExtinction * nearFade * glanceSoft * uDensity * uBeamIntensity * uLightIntensity * scatteringBoost;

    vec3 beamRgb = uColor * alpha * 1.5;
    gl_FragColor = vec4(beamRgb, alpha);
  }
`;

/**
 * Builds an analytical cone geometry anchored at origin (0, 0, 0) extending along -Z.
 */
export function createLightBeamGeometry(
  coneAngleDeg: number,
  length: number = 14.0,
  radialSegments: number = 32,
): THREE.BufferGeometry {
  const halfAngleRad = (coneAngleDeg * 0.5 * Math.PI) / 180;
  const radiusBottom = Math.max(0.1, length * Math.tan(halfAngleRad));
  const radiusTop = 0.02;

  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, radialSegments, 6, true);
  // Shift along Y so apex top is at y=0, base is at y=-length
  geo.translate(0, -length * 0.5, 0);
  // Rotate -90 deg on X so apex is at (0,0,0) and base extends along -Z
  geo.rotateX(-Math.PI * 0.5);
  return geo;
}

export function createLightBeamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffffff) },
      uDensity: { value: 0.2 },
      uScattering: { value: 0.5 },
      uBeamIntensity: { value: 1.0 },
      uLightIntensity: { value: 1.0 },
      uHeightFalloff: { value: 0.3 },
      uConeAngleRad: { value: (45 * Math.PI) / 180 },
      uConeLength: { value: 14.0 },
      uTime: { value: 0.0 },
    },
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

const MOTES_VERT = /* glsl */ `
  attribute vec3 aInstancePos;
  attribute vec4 aInstancePhase;
  attribute float aInstanceScale;

  uniform float uTime;
  uniform vec3 uCameraPos;
  uniform vec3 uBoundsMin;
  uniform vec3 uBoundsMax;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vViewPos;
  varying float vScale;

  void main() {
    vUv = uv;
    vScale = aInstanceScale;

    // Gentle Brownian motion and laminar air drift simulation
    vec3 turbulence = vec3(
      sin(uTime * 0.35 + aInstancePhase.x) * 0.18 + cos(uTime * 0.15 + aInstancePhase.y) * 0.08,
      sin(uTime * 0.25 + aInstancePhase.z) * 0.12 - mod(uTime * 0.04 + aInstancePhase.w, 0.6),
      cos(uTime * 0.30 + aInstancePhase.w) * 0.18 + sin(uTime * 0.18 + aInstancePhase.x) * 0.08
    );

    vec3 pos = aInstancePos + turbulence;

    // Wrap around viewer bounding envelope
    vec3 boxSize = uBoundsMax - uBoundsMin;
    pos = mod(pos - uCameraPos - uBoundsMin, boxSize) + uCameraPos + uBoundsMin;

    // Billboard quad facing the camera
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    mvPosition.xy += (position.xy * aInstanceScale);

    vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
    vViewPos = -mvPosition.xyz;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const MOTES_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uDensity;
  uniform float uHeightFalloff;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vViewPos;
  varying float vScale;

  void main() {
    // Soft circular mote particle
    float dist = length(vUv - vec2(0.5));
    float shape = smoothstep(0.5, 0.05, dist);
    if (shape <= 0.001) discard;

    float camDist = length(vViewPos);
    // Near distance fade out to prevent lens clipping
    float nearFade = smoothstep(0.25, 0.85, camDist);
    // Far distance fade out to prevent pop-in
    float farFade = smoothstep(12.0, 7.5, camDist);

    // Height-based atmospheric extinction
    float heightExtinction = exp(-uHeightFalloff * max(0.0, vWorldPos.y));

    float alpha = shape * nearFade * farFade * heightExtinction * uDensity * vScale * 0.8;
    vec3 moteColor = uColor * alpha * 1.8;

    gl_FragColor = vec4(moteColor, alpha);
  }
`;

export function createDustMotesMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xd8e2ec) },
      uDensity: { value: 0.2 },
      uHeightFalloff: { value: 0.3 },
      uTime: { value: 0.0 },
      uCameraPos: { value: new THREE.Vector3(0, 1.6, 0) },
      uBoundsMin: { value: new THREE.Vector3(-7, -1, -7) },
      uBoundsMax: { value: new THREE.Vector3(7, 4, 7) },
    },
    vertexShader: MOTES_VERT,
    fragmentShader: MOTES_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

interface ConeEntry {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  geometry: THREE.BufferGeometry;
  coneAngleDeg: number;
  length: number;
}

/**
 * Real-time volumetric fog, analytical spot light beams, and floating dust motes simulation.
 */
export class VolumetricManager {
  /** Root group containing all volumetric visual objects. */
  readonly group = new THREE.Group();

  private scene: THREE.Scene;
  private beamsGroup = new THREE.Group();
  private motesMesh: THREE.Mesh | null = null;
  private motesMaterial: THREE.ShaderMaterial | null = null;
  private motesGeometry: THREE.InstancedBufferGeometry | null = null;
  private readonly maxMotes = 1000;

  private conePool = new Map<string, ConeEntry>();
  private accumulatedTime = 0;
  private currentConfig: AtmosphereConfig | null = null;

  // Reused objects to eliminate per-frame allocations
  private tempColor = new THREE.Color();
  private tempTint = new THREE.Color();
  private tempEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private tempQuat = new THREE.Quaternion();
  private tempCamPos = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = 'VolumetricManagerRoot';
    this.beamsGroup.name = 'VolumetricLightBeams';
    this.group.add(this.beamsGroup);
    this.scene.add(this.group);

    this.initDustMotes();
  }

  private initDustMotes(): void {
    const baseQuad = new THREE.PlaneGeometry(0.035, 0.035);
    const instGeo = new THREE.InstancedBufferGeometry();
    instGeo.index = baseQuad.index;
    instGeo.attributes.position = baseQuad.attributes.position;
    instGeo.attributes.uv = baseQuad.attributes.uv;

    const posArray = new Float32Array(this.maxMotes * 3);
    const phaseArray = new Float32Array(this.maxMotes * 4);
    const scaleArray = new Float32Array(this.maxMotes);

    for (let i = 0; i < this.maxMotes; i++) {
      posArray[i * 3 + 0] = (Math.random() - 0.5) * 14.0;
      posArray[i * 3 + 1] = 0.2 + Math.random() * 3.8;
      posArray[i * 3 + 2] = (Math.random() - 0.5) * 14.0;

      phaseArray[i * 4 + 0] = Math.random() * Math.PI * 2;
      phaseArray[i * 4 + 1] = Math.random() * Math.PI * 2;
      phaseArray[i * 4 + 2] = Math.random() * Math.PI * 2;
      phaseArray[i * 4 + 3] = Math.random() * Math.PI * 2;

      scaleArray[i] = 0.5 + Math.random() * 1.1;
    }

    instGeo.setAttribute('aInstancePos', new THREE.InstancedBufferAttribute(posArray, 3));
    instGeo.setAttribute('aInstancePhase', new THREE.InstancedBufferAttribute(phaseArray, 4));
    instGeo.setAttribute('aInstanceScale', new THREE.InstancedBufferAttribute(scaleArray, 1));
    instGeo.instanceCount = 0;

    this.motesGeometry = instGeo;
    this.motesMaterial = createDustMotesMaterial();
    this.motesMesh = new THREE.Mesh(this.motesGeometry, this.motesMaterial);
    this.motesMesh.frustumCulled = false;
    this.motesMesh.name = 'FloatingDustMotes';
    this.group.add(this.motesMesh);
  }

  /**
   * Updates the volumetric simulation state for the active frame.
   */
  update(
    atmosphere: AtmosphereConfig,
    lights: LightData[] = [],
    camera?: THREE.Camera,
    deltaSeconds: number = 0.016,
  ): void {
    this.currentConfig = atmosphere;
    this.accumulatedTime += Math.min(deltaSeconds, 0.1);

    if (!atmosphere.enabled || atmosphere.density <= 0) {
      this.beamsGroup.visible = false;
      if (this.motesMesh) this.motesMesh.visible = false;
      if (this.scene.fog) this.scene.fog = null;
      return;
    }

    this.beamsGroup.visible = true;

    // 1. Height-attenuated scene fog integration
    this.tempTint.set(atmosphere.tintHex);
    const fogDensity = atmosphere.density * 0.032;
    if (!this.scene.fog || !(this.scene.fog instanceof THREE.FogExp2)) {
      this.scene.fog = new THREE.FogExp2(this.tempTint.getHex(), fogDensity);
    } else {
      this.scene.fog.color.copy(this.tempTint);
      this.scene.fog.density = fogDensity;
    }

    // 2. Camera position tracking
    if (camera) {
      camera.getWorldPosition(this.tempCamPos);
    } else {
      this.tempCamPos.set(0, 1.6, 0);
    }

    // 3. Floating dust motes simulation
    if (this.motesMesh && this.motesMaterial && this.motesGeometry) {
      const activeMotesCount = Math.min(this.maxMotes, Math.max(0, atmosphere.dustMotesCount));
      this.motesGeometry.instanceCount = activeMotesCount;
      this.motesMesh.visible = activeMotesCount > 0;

      if (this.motesMesh.visible) {
        const u = this.motesMaterial.uniforms;
        u.uTime.value = this.accumulatedTime;
        u.uDensity.value = atmosphere.density;
        u.uHeightFalloff.value = atmosphere.heightFalloff;
        (u.uColor.value as THREE.Color).copy(this.tempTint);
        (u.uCameraPos.value as THREE.Vector3).copy(this.tempCamPos);
      }
    }

    // 4. Analytical light beam cones for spot lights
    const spotLights = lights.filter((l) => l.type === 'spot' && l.intensity > 0);
    const activeLightIds = new Set<string>();

    for (const light of spotLights) {
      activeLightIds.add(light.id);
      this.updateLightBeam(light, atmosphere);
    }

    // Clean up inactive light cones
    for (const [id, entry] of this.conePool.entries()) {
      if (!activeLightIds.has(id)) {
        this.beamsGroup.remove(entry.mesh);
        entry.geometry.dispose();
        entry.material.dispose();
        this.conePool.delete(id);
      }
    }
  }

  private updateLightBeam(light: LightData, atmosphere: AtmosphereConfig): void {
    const beamLength = Math.min(22.0, Math.max(5.0, 6.0 + light.intensity * 4.0));
    const coneAngle = Math.max(5, Math.min(170, light.coneAngleDeg));

    let entry = this.conePool.get(light.id);
    if (!entry) {
      const geo = createLightBeamGeometry(coneAngle, beamLength);
      const mat = createLightBeamMaterial();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `Beam_${light.name}`;
      this.beamsGroup.add(mesh);

      entry = {
        mesh,
        material: mat,
        geometry: geo,
        coneAngleDeg: coneAngle,
        length: beamLength,
      };
      this.conePool.set(light.id, entry);
    } else if (
      Math.abs(entry.coneAngleDeg - coneAngle) > 0.5 ||
      Math.abs(entry.length - beamLength) > 0.5
    ) {
      // Rebuild geometry when cone parameters change significantly
      entry.geometry.dispose();
      entry.geometry = createLightBeamGeometry(coneAngle, beamLength);
      entry.mesh.geometry = entry.geometry;
      entry.coneAngleDeg = coneAngle;
      entry.length = beamLength;
    }

    // Set position and orientation (matching model coordinate system: pitch rotationX, yaw rotationY)
    entry.mesh.position.set(light.position[0], light.position[1], light.position[2]);
    this.tempEuler.set(light.rotationX, light.rotationY, 0, 'YXZ');
    this.tempQuat.setFromEuler(this.tempEuler);
    entry.mesh.quaternion.copy(this.tempQuat);

    // Compute composite color from Kelvin temperature and atmospheric tint
    const kelvinColor = kelvinToRgb(light.colorKelvin);
    this.tempColor.copy(kelvinColor).multiply(this.tempTint);

    // Update material uniforms
    const u = entry.material.uniforms;
    (u.uColor.value as THREE.Color).copy(this.tempColor);
    u.uDensity.value = atmosphere.density;
    u.uScattering.value = atmosphere.scatteringFactor;
    u.uBeamIntensity.value = atmosphere.beamIntensity;
    u.uLightIntensity.value = light.intensity;
    u.uHeightFalloff.value = atmosphere.heightFalloff;
    u.uConeAngleRad.value = (coneAngle * Math.PI) / 180;
    u.uConeLength.value = beamLength;
    u.uTime.value = this.accumulatedTime;
  }

  /**
   * Advances the internal simulation time and refreshes shader uniforms.
   */
  tick(
    deltaSeconds: number,
    atmosphere?: AtmosphereConfig,
    lights: LightData[] = [],
    camera?: THREE.Camera,
  ): void {
    const config = atmosphere ?? this.currentConfig;
    if (config) {
      this.update(config, lights, camera, deltaSeconds);
    }
  }

  get activeConeCount(): number {
    return this.conePool.size;
  }

  get activeMotesCount(): number {
    return this.motesGeometry ? this.motesGeometry.instanceCount : 0;
  }

  /**
   * Disposes all GPU buffers, geometries, materials, and detach from scene.
   */
  dispose(): void {
    for (const entry of this.conePool.values()) {
      entry.geometry.dispose();
      entry.material.dispose();
    }
    this.conePool.clear();

    if (this.motesGeometry) {
      this.motesGeometry.dispose();
      this.motesGeometry = null;
    }
    if (this.motesMaterial) {
      this.motesMaterial.dispose();
      this.motesMaterial = null;
    }

    this.beamsGroup.clear();
    this.group.clear();
    this.scene.remove(this.group);
    if (this.scene.fog) {
      this.scene.fog = null;
    }
  }
}
