// ---------------------------------------------------------------------------
// SetView In-Camera VFX (ICVFX) Three.js LED Volume & Inner Frustum Renderer
//
// Renders:
//   - 3D Curved Cylindrical LED Volume walls, Flat backdrops, Ceiling Canopies, Wild Walls
//   - Procedural LED panel tile grid lines & calibrated PBR emissive surface
//   - Dynamic Camera Inner Frustum projection with overscan margins & off-axis perspective lines
//   - Live Moiré Optical Safety Heatmap overlay
//   - Meta Quest 3 72fps optimizations (depth-write false overlays, minimal allocations, clean disposal)
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import {
  type InnerFrustumBounds,
  type LedVolumeConfig,
  type LedVolumeWall,
  type MoireAnalysisResult,
  calculateInnerFrustumIntersection,
  calculateMoireRisk,
  createLedVolumeConfig,
  normalizeLedVolumeConfig,
} from './icvfxEngine.ts';

/** Cache for procedural canvas textures to conserve WebGL memory on mobile WebXR. */
const _textureCache = new Map<string, THREE.CanvasTexture>();

function getOrCreateLedGridTexture(pixelPitchMm: number, colorTempKelvin: number): THREE.CanvasTexture {
  const key = `led_grid_${pixelPitchMm.toFixed(2)}_${colorTempKelvin}`;
  let tex = _textureCache.get(key);
  if (tex) return tex;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Dark matte background
    ctx.fillStyle = '#0a0d12';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle LED sub-panel grid lines (500x500mm cabinet seams)
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 508, 508);

    // Fine pixel module grid (250x250mm modules)
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(256, 0);
    ctx.lineTo(256, 512);
    ctx.moveTo(0, 256);
    ctx.lineTo(512, 256);
    ctx.stroke();

    // Subtle pixel pitch indicator dots
    ctx.fillStyle = '#1e3a5f';
    const dotSpacing = Math.max(8, Math.min(32, Math.round(pixelPitchMm * 6)));
    for (let x = 8; x < 512; x += dotSpacing) {
      for (let y = 8; y < 512; y += dotSpacing) {
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }
  }

  tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  _textureCache.set(key, tex);
  return tex;
}

export class LedVolumeRenderer {
  public readonly group = new THREE.Group();

  private config: LedVolumeConfig;
  private wallMeshes: THREE.Mesh[] = [];
  private gridMaterials: THREE.MeshStandardMaterial[] = [];
  private frustumLineGroup = new THREE.Group();
  private frustumCornerLines: THREE.LineSegments | null = null;
  private frustumPolyMesh: THREE.Mesh | null = null;
  private heatmapMeshes: THREE.Mesh[] = [];

  private isFrustumVisible = true;
  private isHeatmapVisible = false;

  // Cached vector math to avoid GC allocations in XR render loop
  private readonly tempCamPos = new THREE.Vector3();
  private readonly tempCamQuat = new THREE.Quaternion();

  constructor(initialConfig?: LedVolumeConfig) {
    this.group.name = 'LedVolumeRoot';
    this.config = initialConfig ? normalizeLedVolumeConfig(initialConfig) : createLedVolumeConfig();

    this.group.add(this.frustumLineGroup);
    this.frustumLineGroup.name = 'InnerFrustumOverlay';

    this.rebuild();
  }

  /** Updates or replaces the LED Volume configuration and rebuilds stage geometry. */
  public setConfig(newConfig: LedVolumeConfig): void {
    this.config = normalizeLedVolumeConfig(newConfig);
    this.rebuild();
  }

  /** Gets active LED volume config. */
  public getConfig(): LedVolumeConfig {
    return this.config;
  }

  /** Toggles visibility of the dynamic camera Inner Frustum projection overlay. */
  public setFrustumVisible(visible: boolean): void {
    this.isFrustumVisible = visible;
    this.frustumLineGroup.visible = visible;
  }

  /** Toggles visibility of the Moiré safety risk heatmap. */
  public setMoireHeatmapVisible(visible: boolean): void {
    this.isHeatmapVisible = visible;
    for (const hm of this.heatmapMeshes) {
      hm.visible = visible;
    }
  }

  /**
   * Updates dynamic inner frustum ray-wall intersection calculations and Moiré analysis
   * using the latest camera pose and optical parameters.
   */
  public update(
    camera:
      | THREE.PerspectiveCamera
      | {
          position: THREE.Vector3;
          quaternion: THREE.Quaternion;
          fov: number;
          aspect: number;
        },
    focalLengthMm = 35,
    sensorWidthMm = 24.89,
    sensorResPx = 4096,
  ): { bounds: InnerFrustumBounds; moire: MoireAnalysisResult } {
    if (!this.config.enabled) {
      this.group.visible = false;
      return {
        bounds: { corners: [], activeWalls: [], surfaceAreaSqm: 0, overscanFactor: 1 },
        moire: {
          riskLevel: 'safe',
          nyquistFrequencyRatio: 0,
          sensorNyquistLpMm: 0,
          projectedPitchLpMm: 0,
          pixelPitchMm: 2.3,
          cameraDistanceM: 5,
          focalLengthMm,
          sensorWidthMm,
          minSafeDistanceM: 2,
          message: 'ICVFX Volume disabled',
        },
      };
    }

    this.group.visible = true;

    this.tempCamPos.copy(camera.position);
    this.tempCamQuat.copy(camera.quaternion);

    const fov = 'fov' in camera ? camera.fov : 45;
    const aspect = 'aspect' in camera ? camera.aspect : 16 / 9;

    const bounds = calculateInnerFrustumIntersection(
      { x: this.tempCamPos.x, y: this.tempCamPos.y, z: this.tempCamPos.z },
      { x: this.tempCamQuat.x, y: this.tempCamQuat.y, z: this.tempCamQuat.z, w: this.tempCamQuat.w },
      fov,
      aspect,
      this.config.walls,
      this.config.cameraOverscanPercent,
    );

    // Calculate nearest wall distance for Moiré analysis
    let minDistance = 10.0;
    let targetPixelPitch = 2.3;

    for (const wall of this.config.walls.filter((w) => w.enabled)) {
      const dx = this.tempCamPos.x - wall.center.x;
      const dz = this.tempCamPos.z - wall.center.z;
      const distToCenter = Math.hypot(dx, dz);
      const distToSurface = wall.type === 'curved_perimeter' && wall.radiusM > 0
        ? Math.abs(distToCenter - wall.radiusM)
        : Math.hypot(dx, this.tempCamPos.y - wall.center.y, dz);

      if (distToSurface < minDistance) {
        minDistance = distToSurface;
        targetPixelPitch = wall.pixelPitchMm;
      }
    }

    const moire = calculateMoireRisk(
      minDistance,
      focalLengthMm,
      sensorWidthMm,
      sensorResPx,
      targetPixelPitch,
    );

    if (this.isFrustumVisible) {
      this.updateFrustumGeometry(bounds);
    }

    if (this.isHeatmapVisible) {
      this.updateHeatmapColors(moire.riskLevel);
    }

    return { bounds, moire };
  }

  private rebuild(): void {
    this.disposeMeshes();

    if (!this.config.enabled) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    for (const wall of this.config.walls) {
      if (!wall.enabled) continue;
      this.buildWallMesh(wall);
    }

    this.buildFrustumOverlay();
  }

  private buildWallMesh(wall: LedVolumeWall): void {
    const tex = getOrCreateLedGridTexture(wall.pixelPitchMm, wall.colorTempKelvin);
    const repeatU = Math.max(1, Math.round(wall.widthM / 0.5));
    const repeatV = Math.max(1, Math.round(wall.heightM / 0.5));
    tex.repeat.set(repeatU, repeatV);

    // Calibrated PBR emissive LED material
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#1e293b'),
      emissive: new THREE.Color('#0f172a'),
      emissiveIntensity: Math.min(2.0, wall.brightnessNits / 1000.0),
      roughness: 0.85,
      metalness: 0.1,
      map: tex,
      side: THREE.DoubleSide,
    });
    this.gridMaterials.push(mat);

    let geo: THREE.BufferGeometry;

    if (wall.type === 'curved_perimeter' && wall.radiusM > 0) {
      // Curved cylindrical arc mesh
      const thetaLength = (wall.arcAngleDeg * Math.PI) / 180.0;
      const thetaStart = -thetaLength * 0.5 + Math.PI * 0.5;
      const radialSegments = Math.max(16, Math.min(64, Math.round((wall.arcAngleDeg / 360) * 48)));

      geo = new THREE.CylinderGeometry(
        wall.radiusM,
        wall.radiusM,
        wall.heightM,
        radialSegments,
        1,
        true,
        thetaStart,
        thetaLength,
      );
    } else if (wall.type === 'ceiling_canopy') {
      if (wall.radiusM > 0) {
        geo = new THREE.CircleGeometry(wall.radiusM, 32);
      } else {
        geo = new THREE.PlaneGeometry(wall.widthM, wall.widthM);
      }
    } else {
      // Flat wall / Wild wall / Floor panel
      geo = new THREE.PlaneGeometry(wall.widthM, wall.heightM);
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(wall.center.x, wall.center.y, wall.center.z);
    mesh.rotation.y = wall.rotationY;

    if (wall.type === 'ceiling_canopy' || wall.type === 'floor_panel') {
      mesh.rotation.x = Math.PI * 0.5;
    }

    mesh.name = `LedWall_${wall.id}`;
    mesh.userData = { wallId: wall.id, wallType: wall.type };

    this.group.add(mesh);
    this.wallMeshes.push(mesh);

    // Heatmap Overlay Mesh (slightly in front of wall surface)
    const heatMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#10b981'),
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const heatMesh = new THREE.Mesh(geo.clone(), heatMat);
    heatMesh.position.copy(mesh.position);
    heatMesh.rotation.copy(mesh.rotation);
    heatMesh.visible = this.isHeatmapVisible;
    this.group.add(heatMesh);
    this.heatmapMeshes.push(heatMesh);
  }

  private buildFrustumOverlay(): void {
    // 4 Corner Lines & Viewport Perimeter
    const lineGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(24 * 3); // 12 lines x 2 vertices
    lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const lineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color('#38bdf8'), // Neon Blue
      linewidth: 2,
      depthWrite: false,
      transparent: true,
      opacity: 0.85,
    });

    this.frustumCornerLines = new THREE.LineSegments(lineGeo, lineMat);
    this.frustumCornerLines.renderOrder = 998;
    this.frustumLineGroup.add(this.frustumCornerLines);

    // Inner Frustum Tinted Polygon
    const polyGeo = new THREE.BufferGeometry();
    const polyPos = new Float32Array([
      -1, 1, 0,
      1, 1, 0,
      1, -1, 0,
      -1, 1, 0,
      1, -1, 0,
      -1, -1, 0,
    ]);
    polyGeo.setAttribute('position', new THREE.BufferAttribute(polyPos, 3));

    const polyMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#0284c7'),
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.frustumPolyMesh = new THREE.Mesh(polyGeo, polyMat);
    this.frustumPolyMesh.renderOrder = 997;
    this.frustumLineGroup.add(this.frustumPolyMesh);
  }

  private updateFrustumGeometry(bounds: InnerFrustumBounds): void {
    if (!this.frustumCornerLines || !this.frustumPolyMesh || bounds.corners.length < 4) return;

    const [c0, c1, c2, c3] = bounds.corners;

    // Update Frustum Perimeter Wireframe
    const linePosAttr = this.frustumCornerLines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const lineArr = linePosAttr.array as Float32Array;

    let idx = 0;
    const addLine = (pA: { x: number; y: number; z: number }, pB: { x: number; y: number; z: number }) => {
      lineArr[idx++] = pA.x; lineArr[idx++] = pA.y; lineArr[idx++] = pA.z;
      lineArr[idx++] = pB.x; lineArr[idx++] = pB.y; lineArr[idx++] = pB.z;
    };

    // 4 Quad boundary edges
    addLine(c0, c1);
    addLine(c1, c2);
    addLine(c2, c3);
    addLine(c3, c0);

    // Off-axis perspective crosshairs
    const midTop = { x: (c0.x + c1.x) * 0.5, y: (c0.y + c1.y) * 0.5, z: (c0.z + c1.z) * 0.5 };
    const midBot = { x: (c3.x + c2.x) * 0.5, y: (c3.y + c2.y) * 0.5, z: (c3.z + c2.z) * 0.5 };
    const midLeft = { x: (c0.x + c3.x) * 0.5, y: (c0.y + c3.y) * 0.5, z: (c0.z + c3.z) * 0.5 };
    const midRight = { x: (c1.x + c2.x) * 0.5, y: (c1.y + c2.y) * 0.5, z: (c1.z + c2.z) * 0.5 };

    addLine(midTop, midBot);
    addLine(midLeft, midRight);

    linePosAttr.needsUpdate = true;

    // Update Inner Frustum Quad Mesh Triangles
    const polyPosAttr = this.frustumPolyMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const polyArr = polyPosAttr.array as Float32Array;

    // Triangle 1: c0, c1, c2
    polyArr[0] = c0.x; polyArr[1] = c0.y; polyArr[2] = c0.z;
    polyArr[3] = c1.x; polyArr[4] = c1.y; polyArr[5] = c1.z;
    polyArr[6] = c2.x; polyArr[7] = c2.y; polyArr[8] = c2.z;

    // Triangle 2: c0, c2, c3
    polyArr[9] = c0.x; polyArr[10] = c0.y; polyArr[11] = c0.z;
    polyArr[12] = c2.x; polyArr[13] = c2.y; polyArr[14] = c2.z;
    polyArr[15] = c3.x; polyArr[16] = c3.y; polyArr[17] = c3.z;

    polyPosAttr.needsUpdate = true;
  }

  private updateHeatmapColors(riskLevel: MoireAnalysisResult['riskLevel']): void {
    let colorHex = '#10b981'; // safe green
    let opacity = 0.20;

    switch (riskLevel) {
      case 'severe_moire':
        colorHex = '#ef4444'; // red
        opacity = 0.50;
        break;
      case 'high_risk':
        colorHex = '#f97316'; // orange
        opacity = 0.38;
        break;
      case 'low_risk':
        colorHex = '#eab308'; // yellow
        opacity = 0.28;
        break;
      case 'safe':
      default:
        colorHex = '#10b981';
        opacity = 0.18;
        break;
    }

    const col = new THREE.Color(colorHex);
    for (const hm of this.heatmapMeshes) {
      const mat = hm.material as THREE.MeshBasicMaterial;
      mat.color.copy(col);
      mat.opacity = opacity;
    }
  }

  private disposeMeshes(): void {
    for (const m of this.wallMeshes) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.wallMeshes = [];

    for (const mat of this.gridMaterials) {
      mat.dispose();
    }
    this.gridMaterials = [];

    for (const hm of this.heatmapMeshes) {
      this.group.remove(hm);
      hm.geometry.dispose();
      (hm.material as THREE.Material).dispose();
    }
    this.heatmapMeshes = [];

    if (this.frustumCornerLines) {
      this.frustumLineGroup.remove(this.frustumCornerLines);
      this.frustumCornerLines.geometry.dispose();
      (this.frustumCornerLines.material as THREE.Material).dispose();
      this.frustumCornerLines = null;
    }

    if (this.frustumPolyMesh) {
      this.frustumLineGroup.remove(this.frustumPolyMesh);
      this.frustumPolyMesh.geometry.dispose();
      (this.frustumPolyMesh.material as THREE.Material).dispose();
      this.frustumPolyMesh = null;
    }
  }

  public dispose(): void {
    this.disposeMeshes();
    this.group.clear();
  }
}
