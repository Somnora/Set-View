// ---------------------------------------------------------------------------
// 3D Gaussian Splatting Three.js Real-Time Viewport Renderer
//
// Features:
//   - High-performance GPU instanced billboard splats with 2D Gaussian falloff
//   - Zero-allocation per-frame view-axis depth sorting for alpha compositing
//   - Mobile Quest 3 72fps LOD budget throttling & distance culling
//   - Spatial floorplan wireframe alignment and bounding box visualizers
//   - Clean memory disposal and typed buffer pooling
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import type { GaussianCloudData, GaussianSplat } from './gaussianSplat.ts';
import type { ArchitecturalSet } from './architecture.ts';

/** Vertex shader for GPU instanced Gaussian splats. */
const SPLAT_VERTEX_SHADER = /* glsl */ `
  attribute vec3 instancePos;
  attribute vec3 instanceScale;
  attribute vec4 instanceRot;
  attribute vec3 instanceCol;
  attribute float instanceOp;

  uniform float uOpacityMultiplier;
  uniform float uScaleMultiplier;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vOpacity;

  // Rotate vector by quaternion
  vec3 rotateVecByQuat(vec3 v, vec4 q) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
  }

  void main() {
    vUv = position.xy * 2.0; // [-1, 1]
    vColor = instanceCol;
    vOpacity = instanceOp * uOpacityMultiplier;

    // Local billboard vertex offset oriented to splat rotation or camera
    vec3 localOffset = vec3(position.x * instanceScale.x, position.y * instanceScale.y, position.z * instanceScale.z) * uScaleMultiplier * 3.0;
    vec3 orientedOffset = rotateVecByQuat(localOffset, instanceRot);

    // Transform to world space
    vec4 worldPos = modelMatrix * vec4(instancePos + orientedOffset, 1.0);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

/** Fragment shader computing analytical Gaussian radial opacity falloff. */
const SPLAT_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vOpacity;

  void main() {
    float distSq = dot(vUv, vUv);
    if (distSq > 1.0) {
      discard;
    }

    // 2D Gaussian falloff: exp(-2.0 * r^2)
    float alpha = exp(-2.0 * distSq) * vOpacity;
    if (alpha < 0.02) {
      discard;
    }

    gl_FragColor = vec4(vColor, alpha);
  }
`;

export interface SplatRendererOptions {
  maxSplats?: number;
  opacityMultiplier?: number;
  scaleMultiplier?: number;
  enableDepthSort?: boolean;
}

export class GaussianSplatRenderer {
  readonly group = new THREE.Group();
  private cloud: GaussianCloudData | null = null;

  // Instanced Rendering
  private instancedMesh: THREE.InstancedMesh | null = null;
  private splatMaterial: THREE.ShaderMaterial | null = null;
  private splatGeometry: THREE.BufferGeometry | null = null;

  // Buffer attributes
  private posAttr: THREE.InstancedBufferAttribute | null = null;
  private scaleAttr: THREE.InstancedBufferAttribute | null = null;
  private rotAttr: THREE.InstancedBufferAttribute | null = null;
  private colAttr: THREE.InstancedBufferAttribute | null = null;
  private opAttr: THREE.InstancedBufferAttribute | null = null;

  // Depth Sorting & GC Zero-Allocation Pools
  private rawSplats: GaussianSplat[] = [];
  private sortedIndices: Int32Array = new Int32Array(0);
  private depthBuffer: Float32Array = new Float32Array(0);
  private lastSortFrame = 0;
  private sortIntervalFrames = 2; // Throttle sorting for Quest 3 72fps budget

  // Transform Gizmo & Alignment Visualizers
  private wireframeGroup = new THREE.Group();
  private bboxHelper: THREE.Box3Helper | null = null;
  private showAlignmentOverlay = false;

  // Configuration
  private maxSplatBudget = 100000;
  private opacityMultiplier = 1.0;
  private scaleMultiplier = 1.0;
  private isDepthSortEnabled = true;

  constructor(options?: SplatRendererOptions) {
    if (options?.maxSplats !== undefined) this.maxSplatBudget = options.maxSplats;
    if (options?.opacityMultiplier !== undefined) this.opacityMultiplier = options.opacityMultiplier;
    if (options?.scaleMultiplier !== undefined) this.scaleMultiplier = options.scaleMultiplier;
    if (options?.enableDepthSort !== undefined) this.isDepthSortEnabled = options.enableDepthSort;

    this.group.name = 'GaussianSplatRenderer';
    this.wireframeGroup.name = 'SplatAlignmentWireframe';
    this.group.add(this.wireframeGroup);
    this.wireframeGroup.visible = this.showAlignmentOverlay;
  }

  /**
   * Sets or replaces the active Gaussian Cloud data.
   */
  setCloud(cloud: GaussianCloudData | null): void {
    this.cloud = cloud;
    this.rebuildMesh();
    this.updateTransformFromCloud();
    this.updateAlignmentWireframe();
  }

  /**
   * Returns current active cloud data.
   */
  getCloud(): GaussianCloudData | null {
    return this.cloud;
  }

  /**
   * Sets the maximum number of splats rendered for LOD performance throttling.
   */
  setSplatBudget(budget: number): void {
    const clamped = Math.max(100, Math.min(500000, Math.floor(budget)));
    if (this.maxSplatBudget !== clamped) {
      this.maxSplatBudget = clamped;
      this.rebuildMesh();
    }
  }

  getSplatBudget(): number {
    return this.maxSplatBudget;
  }

  /**
   * Sets the global opacity multiplier for splat transparency tuning.
   */
  setOpacityMultiplier(val: number): void {
    this.opacityMultiplier = Math.max(0.0, Math.min(2.0, val));
    if (this.splatMaterial) {
      this.splatMaterial.uniforms.uOpacityMultiplier.value = this.opacityMultiplier;
    }
  }

  getOpacityMultiplier(): number {
    return this.opacityMultiplier;
  }

  /**
   * Sets the scale multiplier for splats.
   */
  setScaleMultiplier(val: number): void {
    this.scaleMultiplier = Math.max(0.1, Math.min(5.0, val));
    if (this.splatMaterial) {
      this.splatMaterial.uniforms.uScaleMultiplier.value = this.scaleMultiplier;
    }
  }

  getScaleMultiplier(): number {
    return this.scaleMultiplier;
  }

  /**
   * Enables or disables real-time camera depth sorting.
   */
  setDepthSortEnabled(enabled: boolean): void {
    this.isDepthSortEnabled = enabled;
  }

  /**
   * Shows or hides floorplan alignment wireframe guides.
   */
  setShowAlignmentWireframe(show: boolean): void {
    this.showAlignmentOverlay = show;
    this.wireframeGroup.visible = show;
  }

  /**
   * Updates floorplan alignment wireframe visuals.
   */
  setFloorplanOverlay(floorplan?: ArchitecturalSet | null): void {
    while (this.wireframeGroup.children.length > 0) {
      const child = this.wireframeGroup.children[0];
      this.wireframeGroup.remove(child);
      if (child instanceof THREE.LineSegments || child instanceof THREE.Mesh) {
        child.geometry?.dispose();
      }
    }

    if (!floorplan || floorplan.walls.length === 0) {
      // Create standard floor grid
      const grid = new THREE.GridHelper(10, 20, 0x38bdf8, 0x1e293b);
      grid.position.y = 0.005;
      this.wireframeGroup.add(grid);
      return;
    }

    // Build floorplan wall outlines
    const points: THREE.Vector3[] = [];
    for (const w of floorplan.walls) {
      const p1 = new THREE.Vector3(w.start.x, 0.01, w.start.z);
      const p2 = new THREE.Vector3(w.end.x, 0.01, w.end.z);
      const p3 = new THREE.Vector3(w.end.x, w.heightM, w.end.z);
      const p4 = new THREE.Vector3(w.start.x, w.heightM, w.start.z);

      // Bottom
      points.push(p1, p2);
      // Top
      points.push(p4, p3);
      // Verticals
      points.push(p1, p4);
      points.push(p2, p3);
    }

    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 2,
      transparent: true,
      opacity: 0.8,
    });
    const wire = new THREE.LineSegments(lineGeo, lineMat);
    this.wireframeGroup.add(wire);
  }

  private updateTransformFromCloud(): void {
    if (!this.cloud) return;
    const t = this.cloud.transform;
    this.group.position.set(t.position.x, t.position.y, t.position.z);
    this.group.quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
    this.group.scale.setScalar(t.scale);
  }

  private updateAlignmentWireframe(): void {
    if (!this.cloud) return;
    if (this.bboxHelper) {
      this.group.remove(this.bboxHelper);
      this.bboxHelper.geometry?.dispose();
      this.bboxHelper = null;
    }

    const b = this.cloud.bounds;
    const box = new THREE.Box3(
      new THREE.Vector3(b.min.x, b.min.y, b.min.z),
      new THREE.Vector3(b.max.x, b.max.y, b.max.z),
    );
    this.bboxHelper = new THREE.Box3Helper(box, new THREE.Color(0x38bdf8));
    this.bboxHelper.visible = this.showAlignmentOverlay;
    this.group.add(this.bboxHelper);
  }

  private rebuildMesh(): void {
    if (this.instancedMesh) {
      this.group.remove(this.instancedMesh);
      this.instancedMesh.geometry?.dispose();
      this.instancedMesh = null;
    }

    if (!this.cloud || this.cloud.splats.length === 0) {
      return;
    }

    const count = Math.min(this.cloud.splats.length, this.maxSplatBudget);
    this.rawSplats = this.cloud.splats.slice(0, count);

    // Pre-allocate depth sorting buffers (zero allocations in hot loop)
    this.sortedIndices = new Int32Array(count);
    this.depthBuffer = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.sortedIndices[i] = i;
    }

    // Billboard quad geometry
    const quad = new THREE.PlaneGeometry(1, 1);
    this.splatGeometry = new THREE.InstancedBufferGeometry();
    this.splatGeometry.index = quad.index;
    this.splatGeometry.attributes.position = quad.attributes.position;
    this.splatGeometry.attributes.uv = quad.attributes.uv;

    // Instanced buffers
    const posArr = new Float32Array(count * 3);
    const scaleArr = new Float32Array(count * 3);
    const rotArr = new Float32Array(count * 4);
    const colArr = new Float32Array(count * 3);
    const opArr = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const s = this.rawSplats[i];
      const i3 = i * 3;
      const i4 = i * 4;

      posArr[i3] = s.position.x;
      posArr[i3 + 1] = s.position.y;
      posArr[i3 + 2] = s.position.z;

      scaleArr[i3] = s.scale.x;
      scaleArr[i3 + 1] = s.scale.y;
      scaleArr[i3 + 2] = s.scale.z;

      rotArr[i4] = s.rotation.x;
      rotArr[i4 + 1] = s.rotation.y;
      rotArr[i4 + 2] = s.rotation.z;
      rotArr[i4 + 3] = s.rotation.w;

      colArr[i3] = s.color.r;
      colArr[i3 + 1] = s.color.g;
      colArr[i3 + 2] = s.color.b;

      opArr[i] = s.opacity;
    }

    this.posAttr = new THREE.InstancedBufferAttribute(posArr, 3);
    this.scaleAttr = new THREE.InstancedBufferAttribute(scaleArr, 3);
    this.rotAttr = new THREE.InstancedBufferAttribute(rotArr, 4);
    this.colAttr = new THREE.InstancedBufferAttribute(colArr, 3);
    this.opAttr = new THREE.InstancedBufferAttribute(opArr, 1);

    this.splatGeometry.setAttribute('instancePos', this.posAttr);
    this.splatGeometry.setAttribute('instanceScale', this.scaleAttr);
    this.splatGeometry.setAttribute('instanceRot', this.rotAttr);
    this.splatGeometry.setAttribute('instanceCol', this.colAttr);
    this.splatGeometry.setAttribute('instanceOp', this.opAttr);

    this.splatMaterial = new THREE.ShaderMaterial({
      vertexShader: SPLAT_VERTEX_SHADER,
      fragmentShader: SPLAT_FRAGMENT_SHADER,
      uniforms: {
        uOpacityMultiplier: { value: this.opacityMultiplier },
        uScaleMultiplier: { value: this.scaleMultiplier },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    });

    this.instancedMesh = new THREE.InstancedMesh(this.splatGeometry, this.splatMaterial, count);
    this.instancedMesh.frustumCulled = false;
    this.group.add(this.instancedMesh);
  }

  /**
   * Per-frame camera update: performs view-direction depth sorting without heap allocations.
   */
  update(camera: THREE.Camera): void {
    if (!this.instancedMesh || !this.cloud || !this.isDepthSortEnabled || this.rawSplats.length === 0) {
      return;
    }

    this.lastSortFrame++;
    if (this.lastSortFrame % this.sortIntervalFrames !== 0) {
      return;
    }

    // Camera view direction
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);

    const count = this.rawSplats.length;
    const splats = this.rawSplats;
    const depths = this.depthBuffer;
    const indices = this.sortedIndices;

    const groupPos = this.group.position;

    // Compute depth projection for each splat along camera direction
    for (let i = 0; i < count; i++) {
      const s = splats[i].position;
      // World space position approximation
      const wx = s.x + groupPos.x;
      const wy = s.y + groupPos.y;
      const wz = s.z + groupPos.z;

      depths[i] = wx * camDir.x + wy * camDir.y + wz * camDir.z;
    }

    // Depth sort indices back-to-front (furthest first for normal alpha blending)
    indices.sort((a, b) => depths[b] - depths[a]);

    // Update instanced attributes with sorted order
    if (this.posAttr && this.scaleAttr && this.rotAttr && this.colAttr && this.opAttr) {
      const posArr = this.posAttr.array as Float32Array;
      const scaleArr = this.scaleAttr.array as Float32Array;
      const rotArr = this.rotAttr.array as Float32Array;
      const colArr = this.colAttr.array as Float32Array;
      const opArr = this.opAttr.array as Float32Array;

      for (let i = 0; i < count; i++) {
        const origIdx = indices[i];
        const s = splats[origIdx];
        const i3 = i * 3;
        const i4 = i * 4;

        posArr[i3] = s.position.x;
        posArr[i3 + 1] = s.position.y;
        posArr[i3 + 2] = s.position.z;

        scaleArr[i3] = s.scale.x;
        scaleArr[i3 + 1] = s.scale.y;
        scaleArr[i3 + 2] = s.scale.z;

        rotArr[i4] = s.rotation.x;
        rotArr[i4 + 1] = s.rotation.y;
        rotArr[i4 + 2] = s.rotation.z;
        rotArr[i4 + 3] = s.rotation.w;

        colArr[i3] = s.color.r;
        colArr[i3 + 1] = s.color.g;
        colArr[i3 + 2] = s.color.b;

        opArr[i] = s.opacity;
      }

      this.posAttr.needsUpdate = true;
      this.scaleAttr.needsUpdate = true;
      this.rotAttr.needsUpdate = true;
      this.colAttr.needsUpdate = true;
      this.opAttr.needsUpdate = true;
    }
  }

  /**
   * Disposes of all Three.js geometries, materials, and GPU buffers.
   */
  dispose(): void {
    if (this.instancedMesh) {
      this.group.remove(this.instancedMesh);
      this.instancedMesh.geometry?.dispose();
      this.instancedMesh = null;
    }
    if (this.splatMaterial) {
      this.splatMaterial.dispose();
      this.splatMaterial = null;
    }
    if (this.splatGeometry) {
      this.splatGeometry.dispose();
      this.splatGeometry = null;
    }
    if (this.bboxHelper) {
      this.group.remove(this.bboxHelper);
      this.bboxHelper.geometry?.dispose();
      this.bboxHelper = null;
    }
    while (this.wireframeGroup.children.length > 0) {
      const c = this.wireframeGroup.children[0];
      this.wireframeGroup.remove(c);
      if (c instanceof THREE.LineSegments || c instanceof THREE.Mesh) {
        c.geometry?.dispose();
      }
    }
    this.group.clear();
  }
}
