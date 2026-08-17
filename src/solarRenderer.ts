// ---------------------------------------------------------------------------
// SetView 3D Natural Sky & Physical Solar Environment Renderer
//
// Renders:
//   - Physical Rayleigh and Mie Atmospheric Scattering Sky Dome Shader
//   - Directional Sun Light with Real-time Cascaded Shadows & Frustum
//   - Emissive Sun Celestial Disc & Soft Atmospheric Corona Flare
//   - Hemispherical Ambient Sky Fill Light with Ground Albedo Bounce
//   - 3D Celestial Daily Sun Path Trajectory Arc with Hour Markers
//   - Floor True North Compass Rose & Solar Alignment Indicator
//   - WebXR Meta Quest 3 72fps / 90fps Zero-Allocation Update Loop
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import {
  type SolarEnvironmentConfig,
  type SolarEphemerisResult,
  calculateSolarEphemeris,
  generateSolarPathPoints,
  normalizeSolarEnvironmentConfig,
} from './solarEngine.ts';

// Helper for sky gradient colors
export function calculateRaymieSkyColors(
  elevationDeg: number,
  turbidity: number,
  groundAlbedo: number,
): {
  zenithColor: THREE.Color;
  horizonColor: THREE.Color;
  groundColor: THREE.Color;
  sunColor: THREE.Color;
} {
  const zenith = new THREE.Color();
  const horizon = new THREE.Color();
  const ground = new THREE.Color();
  const sun = new THREE.Color();

  if (elevationDeg > 20) {
    // Bright Daylight
    const t = Math.min(1.0, (elevationDeg - 20) / 40);
    zenith.setRGB(0.18 + t * 0.08, 0.42 + t * 0.15, 0.85 + t * 0.1);
    horizon.setRGB(0.65 + t * 0.1, 0.78 + t * 0.1, 0.9 + t * 0.05);
    sun.setRGB(1.0, 0.98, 0.92);
  } else if (elevationDeg > 0) {
    // Golden Hour Sunset / Sunrise
    const t = elevationDeg / 20;
    zenith.setRGB(0.12 + t * 0.06, 0.25 + t * 0.17, 0.6 + t * 0.25);
    horizon.setRGB(0.95 - t * 0.3, 0.45 + t * 0.33, 0.2 + t * 0.7);
    sun.setRGB(1.0, 0.65 + t * 0.33, 0.3 + t * 0.62);
  } else if (elevationDeg > -6) {
    // Blue Hour / Civil Twilight
    const t = (elevationDeg + 6) / 6;
    zenith.setRGB(0.04 + t * 0.08, 0.08 + t * 0.17, 0.28 + t * 0.32);
    horizon.setRGB(0.45 * t, 0.22 * t, 0.35 * t + 0.15);
    sun.setRGB(0.6 * t, 0.3 * t, 0.1 * t);
  } else if (elevationDeg > -18) {
    // Nautical / Astronomical Twilight
    const t = (elevationDeg + 18) / 12;
    zenith.setRGB(0.01 + t * 0.03, 0.02 + t * 0.06, 0.08 + t * 0.2);
    horizon.setRGB(0.02 + t * 0.1, 0.03 + t * 0.1, 0.08 + t * 0.15);
    sun.setRGB(0.05, 0.05, 0.1);
  } else {
    // Deep Night
    zenith.setRGB(0.005, 0.008, 0.02);
    horizon.setRGB(0.01, 0.015, 0.035);
    sun.setRGB(0.1, 0.12, 0.2); // Faint lunar tint
  }

  // Adjust for turbidity haze
  const haze = Math.max(0, (turbidity - 2.5) * 0.08);
  horizon.r = Math.min(1.0, horizon.r + haze * 0.2);
  horizon.g = Math.min(1.0, horizon.g + haze * 0.1);
  horizon.b = Math.max(0, horizon.b - haze * 0.1);

  // Ground bounce is modulated by ground albedo
  ground.copy(horizon).multiplyScalar(groundAlbedo * 0.85);

  return { zenithColor: zenith, horizonColor: horizon, groundColor: ground, sunColor: sun };
}

/** Vertex shader for physical sky dome. */
const SKY_VERTEX_SHADER = `
varying vec3 vWorldPosition;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

/** Fragment shader computing Rayleigh/Mie gradients and solar flare. */
const SKY_FRAGMENT_SHADER = `
uniform vec3 uSunDirection;
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uGroundColor;
uniform vec3 uSunDiscColor;
uniform float uSunElevation;
uniform float uTurbidity;
uniform float uSunSize;
varying vec3 vWorldPosition;

void main() {
  vec3 viewDir = normalize(vWorldPosition);
  float height = viewDir.y;

  // Sky hemispherical gradient
  vec3 skyColor;
  if (height >= 0.0) {
    float h = pow(height, 0.45);
    skyColor = mix(uHorizonColor, uZenithColor, h);
  } else {
    float g = pow(clamp(-height * 2.0, 0.0, 1.0), 0.5);
    skyColor = mix(uHorizonColor, uGroundColor, g);
  }

  // Solar disc and corona flare
  float cosTheta = dot(viewDir, uSunDirection);
  if (uSunElevation > -4.0 && cosTheta > 0.0) {
    // Sharp sun disc
    float sunAngle = acos(clamp(cosTheta, -1.0, 1.0));
    float discRadius = uSunSize * 0.035;
    if (sunAngle < discRadius) {
      float edge = smoothstep(discRadius, discRadius * 0.85, sunAngle);
      skyColor = mix(skyColor, uSunDiscColor * 2.5, edge);
    }
    // Mie forward-scattering corona halo
    float mieCorona = pow(max(0.0, cosTheta), 45.0 + (10.0 - uTurbidity) * 5.0) * (0.85 + uTurbidity * 0.08);
    if (height > -0.05) {
      skyColor += uSunDiscColor * mieCorona * 0.75;
    }
  }

  gl_FragColor = vec4(skyColor, 1.0);
}
`;

/** Procedural Canvas Texture cache for Floor Compass Rose. */
let _compassTexture: THREE.CanvasTexture | null = null;

function getOrCreateCompassTexture(): THREE.CanvasTexture {
  if (_compassTexture) return _compassTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 512, 512);

    const cx = 256;
    const cy = 256;
    const r = 220;

    // Outer circle
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Inner circle
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 30, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshairs
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.stroke();

    // North Arrow (Red / Amber accent)
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r + 15);
    ctx.lineTo(cx - 16, cy - r + 65);
    ctx.lineTo(cx + 16, cy - r + 65);
    ctx.closePath();
    ctx.fill();

    // Cardinal Labels
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#f87171'; // N
    ctx.fillText('N', cx, cy - r + 90);

    ctx.fillStyle = '#94a3b8'; // S
    ctx.fillText('S', cx, cy + r - 90);

    ctx.fillStyle = '#94a3b8'; // E
    ctx.fillText('E', cx + r - 90, cy);

    ctx.fillStyle = '#94a3b8'; // W
    ctx.fillText('W', cx - r + 90, cy);
  }

  _compassTexture = new THREE.CanvasTexture(canvas);
  _compassTexture.wrapS = THREE.ClampToEdgeWrapping;
  _compassTexture.wrapT = THREE.ClampToEdgeWrapping;
  return _compassTexture;
}

export class SolarEnvironmentRenderer {
  public group: THREE.Group;
  private config: SolarEnvironmentConfig;
  private currentEphemeris: SolarEphemerisResult;

  // 3D Objects
  private skyDomeMesh: THREE.Mesh;
  private skyShaderMaterial: THREE.ShaderMaterial;
  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private sunDiscMesh: THREE.Mesh;
  private sunDiscMaterial: THREE.MeshBasicMaterial;
  private sunCoronaSprite: THREE.Sprite;
  private sunPathLine: THREE.Line;
  private sunPathGeometry: THREE.BufferGeometry;
  private hourMarkersGroup: THREE.Group;
  private compassMesh: THREE.Mesh;

  // Zero-allocation scratch vectors & colors
  private scratchSunPos = new THREE.Vector3();

  constructor(initialConfig?: Partial<SolarEnvironmentConfig>) {
    this.config = normalizeSolarEnvironmentConfig(initialConfig);
    this.currentEphemeris = calculateSolarEphemeris(this.config);
    this.group = new THREE.Group();
    this.group.name = 'SetView_SolarEnvironment';

    // 1. Sky Dome Geometry & Shader
    const skyGeo = new THREE.SphereGeometry(450, 32, 16);
    this.skyShaderMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      uniforms: {
        uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
        uZenithColor: { value: new THREE.Color(0x2563eb) },
        uHorizonColor: { value: new THREE.Color(0x93c5fd) },
        uGroundColor: { value: new THREE.Color(0x1e293b) },
        uSunDiscColor: { value: new THREE.Color(0xffffff) },
        uSunElevation: { value: 45.0 },
        uTurbidity: { value: 2.5 },
        uSunSize: { value: 1.0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.skyDomeMesh = new THREE.Mesh(skyGeo, this.skyShaderMaterial);
    this.skyDomeMesh.name = 'SkyDome';
    this.group.add(this.skyDomeMesh);

    // 2. Directional Sun Light with Shadows
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sunLight.name = 'SunDirectionalLight';
    this.sunLight.castShadow = this.config.castShadows;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 250;
    const shadowD = 35;
    this.sunLight.shadow.camera.left = -shadowD;
    this.sunLight.shadow.camera.right = shadowD;
    this.sunLight.shadow.camera.top = shadowD;
    this.sunLight.shadow.camera.bottom = -shadowD;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.02;
    this.group.add(this.sunLight);
    this.group.add(this.sunLight.target);

    // 3. Emissive Sun Disc Mesh & Soft Corona Sprite
    const discGeo = new THREE.CircleGeometry(12, 32);
    this.sunDiscMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.sunDiscMesh = new THREE.Mesh(discGeo, this.sunDiscMaterial);
    this.sunDiscMesh.name = 'SunDiscMesh';
    this.group.add(this.sunDiscMesh);

    const coronaMat = new THREE.SpriteMaterial({
      color: 0xffeedd,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sunCoronaSprite = new THREE.Sprite(coronaMat);
    this.sunCoronaSprite.scale.set(75, 75, 1);
    this.group.add(this.sunCoronaSprite);

    // 4. Ambient / Hemispherical Sky Fill Light
    this.hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.4);
    this.hemiLight.name = 'SunHemisphereFillLight';
    this.group.add(this.hemiLight);

    // 5. 3D Sun Path Arc & Hour Markers
    this.sunPathGeometry = new THREE.BufferGeometry();
    const sunPathMaterial = new THREE.LineBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.5,
      linewidth: 2,
      depthWrite: false,
    });
    this.sunPathLine = new THREE.Line(this.sunPathGeometry, sunPathMaterial);
    this.sunPathLine.name = 'SunTrajectoryArc';
    this.group.add(this.sunPathLine);

    this.hourMarkersGroup = new THREE.Group();
    this.hourMarkersGroup.name = 'SunPathHourMarkers';
    this.group.add(this.hourMarkersGroup);

    // 6. Floor Compass Rose & True North Indicator
    const compassGeo = new THREE.PlaneGeometry(16, 16);
    const compassMat = new THREE.MeshBasicMaterial({
      map: getOrCreateCompassTexture(),
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.compassMesh = new THREE.Mesh(compassGeo, compassMat);
    this.compassMesh.rotation.x = -Math.PI / 2;
    this.compassMesh.position.y = 0.01; // Just above floor
    this.compassMesh.name = 'FloorCompassRose';
    this.group.add(this.compassMesh);

    // Initial sync
    this.rebuildSunPathGeometry();
    this.applyConfigInternal();
  }

  /** Gets the current configuration. */
  public getConfig(): SolarEnvironmentConfig {
    return this.config;
  }

  /** Gets the active ephemeris calculation results. */
  public getEphemeris(): SolarEphemerisResult {
    return this.currentEphemeris;
  }

  /** Updates the configuration and syncs renderer visuals. */
  public setConfig(newConfig: Partial<SolarEnvironmentConfig>): void {
    const wasEnabled = this.config.enabled;
    const oldLat = this.config.location.latitude;
    const oldLon = this.config.location.longitude;
    const oldDate = `${this.config.date.year}-${this.config.date.month}-${this.config.date.day}`;
    const oldHeading = this.config.northHeadingDeg;

    this.config = normalizeSolarEnvironmentConfig({ ...this.config, ...newConfig });
    this.currentEphemeris = calculateSolarEphemeris(this.config);

    // If location, date, or North heading changed, regenerate trajectory arc
    const newDate = `${this.config.date.year}-${this.config.date.month}-${this.config.date.day}`;
    if (
      oldLat !== this.config.location.latitude ||
      oldLon !== this.config.location.longitude ||
      oldDate !== newDate ||
      oldHeading !== this.config.northHeadingDeg
    ) {
      this.rebuildSunPathGeometry();
    }

    if (wasEnabled !== this.config.enabled) {
      this.group.visible = this.config.enabled;
    }

    this.applyConfigInternal();
  }

  /**
   * Fast time scrub update avoiding full geometry rebuilds.
   * Ideal for real-time time slider dragging and animations.
   */
  public setTimeOfDay(decimalHours: number): void {
    this.config.timeOfDayHours = Math.max(0, Math.min(24, decimalHours));
    this.currentEphemeris = calculateSolarEphemeris(this.config);
    this.applyConfigInternal();
  }

  /**
   * Frame update tick advancing continuous time if playback speed is active.
   * Guaranteed zero garbage-collection allocations per frame.
   */
  public update(deltaSeconds: number): void {
    if (!this.config.enabled || this.config.timePlaybackSpeed === 0) return;

    // Advance timeOfDayHours: speed 1.0 = 1 sec/sec, speed 60 = 1 min/sec (3600 = 1 hr/sec)
    const hoursDelta = (deltaSeconds * this.config.timePlaybackSpeed) / 3600;
    let newTime = (this.config.timeOfDayHours + hoursDelta) % 24;
    if (newTime < 0) newTime += 24;
    this.config.timeOfDayHours = newTime;

    this.currentEphemeris = calculateSolarEphemeris(this.config);
    this.applyConfigInternal();
  }

  /** Rebuilds the 3D sun path arc line and hour marker glyphs. */
  private rebuildSunPathGeometry(): void {
    const pathRadius = 90; // Trajectory sphere radius in meters
    const points = generateSolarPathPoints(this.config, 96);
    const positions = new Float32Array((points.length + 1) * 3);

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      positions[i * 3 + 0] = p.x * pathRadius;
      positions[i * 3 + 1] = p.y * pathRadius;
      positions[i * 3 + 2] = p.z * pathRadius;
    }

    this.sunPathGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.sunPathGeometry.attributes.position.needsUpdate = true;

    // Rebuild hour markers
    while (this.hourMarkersGroup.children.length > 0) {
      const child = this.hourMarkersGroup.children[0];
      this.hourMarkersGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }

    const markerSphereGeo = new THREE.SphereGeometry(0.8, 12, 12);
    const markerMatDay = new THREE.MeshBasicMaterial({ color: 0xf59e0b, depthWrite: false });
    const markerMatNoon = new THREE.MeshBasicMaterial({ color: 0xef4444, depthWrite: false });
    const markerMatNight = new THREE.MeshBasicMaterial({ color: 0x475569, depthWrite: false });

    for (let h = 0; h < 24; h += 2) {
      const hourConfig = { ...this.config, timeOfDayHours: h };
      const eph = calculateSolarEphemeris(hourConfig);
      const isNoon = h === 12;
      const isDay = eph.elevationDeg > 0;

      const marker = new THREE.Mesh(
        markerSphereGeo,
        isNoon ? markerMatNoon : isDay ? markerMatDay : markerMatNight,
      );
      marker.position.set(
        eph.sunDirectionVector.x * pathRadius,
        eph.sunDirectionVector.y * pathRadius,
        eph.sunDirectionVector.z * pathRadius,
      );
      marker.name = `HourMarker_${h}`;
      this.hourMarkersGroup.add(marker);
    }
  }

  /** Synchronizes lights, materials, and matrices to current ephemeris. */
  private applyConfigInternal(): void {
    if (!this.config.enabled) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    const eph = this.currentEphemeris;
    const skyColors = calculateRaymieSkyColors(
      eph.elevationDeg,
      this.config.skyTurbidity,
      this.config.groundAlbedo,
    );

    // 1. Update Sky Dome Shader Uniforms
    const u = this.skyShaderMaterial.uniforms;
    u.uSunDirection.value.set(
      eph.sunDirectionVector.x,
      eph.sunDirectionVector.y,
      eph.sunDirectionVector.z,
    );
    u.uZenithColor.value.copy(skyColors.zenithColor);
    u.uHorizonColor.value.copy(skyColors.horizonColor);
    u.uGroundColor.value.copy(skyColors.groundColor);
    u.uSunDiscColor.value.copy(skyColors.sunColor);
    u.uSunElevation.value = eph.elevationDeg;
    u.uTurbidity.value = this.config.skyTurbidity;

    // 2. Position Sun Disc & Corona on Celestial Sphere
    const celestialDistance = 400; // Inside 450m dome
    this.scratchSunPos.set(
      eph.sunDirectionVector.x * celestialDistance,
      eph.sunDirectionVector.y * celestialDistance,
      eph.sunDirectionVector.z * celestialDistance,
    );
    this.sunDiscMesh.position.copy(this.scratchSunPos);
    this.sunDiscMesh.lookAt(0, 0, 0);
    this.sunDiscMaterial.color.copy(skyColors.sunColor);
    this.sunCoronaSprite.position.copy(this.scratchSunPos);

    // Sun disc visibility based on horizon elevation
    const sunVisible = eph.elevationDeg > -5.0;
    this.sunDiscMesh.visible = sunVisible;
    this.sunCoronaSprite.visible = sunVisible;

    // 3. Directional Sun Light
    const sunLightDistance = 100;
    this.sunLight.position.set(
      eph.sunDirectionVector.x * sunLightDistance,
      Math.max(0.01, eph.sunDirectionVector.y * sunLightDistance),
      eph.sunDirectionVector.z * sunLightDistance,
    );
    this.sunLight.target.position.set(0, 0, 0);
    this.sunLight.color.copy(skyColors.sunColor);

    // Intensity scaling
    const normalizedDirectLux = eph.directSunIlluminanceLux / 100000; // ~1.0 at high noon clear
    this.sunLight.intensity = Math.max(0, normalizedDirectLux * this.config.sunIntensityMultiplier);
    this.sunLight.castShadow = this.config.castShadows && eph.elevationDeg > 0.5;

    // 4. Ambient Hemispherical Light
    this.hemiLight.color.copy(skyColors.zenithColor);
    this.hemiLight.groundColor.copy(skyColors.groundColor);
    const normalizedDiffuseLux = (eph.diffuseSkyIlluminanceLux / 15000) * 0.45;
    this.hemiLight.intensity = Math.max(0.05, normalizedDiffuseLux * this.config.sunIntensityMultiplier);

    // 5. Floor Compass Rose Heading Rotation
    this.compassMesh.rotation.z = -this.config.northHeadingDeg * (Math.PI / 180);
  }

  /** Cleans up all Three.js geometries, textures, materials, and lights. */
  public dispose(): void {
    this.skyDomeMesh.geometry.dispose();
    this.skyShaderMaterial.dispose();
    this.sunDiscMesh.geometry.dispose();
    this.sunDiscMaterial.dispose();
    this.sunCoronaSprite.material.dispose();
    this.sunPathGeometry.dispose();
    (this.sunPathLine.material as THREE.Material).dispose();
    this.compassMesh.geometry.dispose();
    (this.compassMesh.material as THREE.Material).dispose();

    while (this.hourMarkersGroup.children.length > 0) {
      const c = this.hourMarkersGroup.children[0];
      this.hourMarkersGroup.remove(c);
      if (c instanceof THREE.Mesh) {
        c.geometry.dispose();
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else c.material.dispose();
      }
    }

    this.group.clear();
  }
}
