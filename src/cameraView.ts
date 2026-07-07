// ---------------------------------------------------------------------------
// Camera setups, lens simulation, and the two Camera View surfaces:
//  1. Virtual monitor — a floating quad showing a render-to-texture of the
//     virtual scene from the selected camera with correct Super-35 FOV,
//     letterboxed to the chosen aspect. (Passthrough pixels cannot be
//     captured, so the monitor composites actors over a neutral dark
//     background with a subtle grid floor for spatial context.)
//  2. Eyes-as-camera frame lines — focal-correct frame rectangle + soft
//     letterbox mask drawn in the user's own view; A commits the head pose
//     as a new camera setup.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import {
  aspectValue,
  createCameraSetup,
  DEFAULT_FORMAT_ID,
  DEFAULT_TSTOP,
  sensorFormat,
  stepFocal,
  vecDistance,
  type AspectName,
  type CameraSetupData,
  type FocalLength,
  type SceneData,
} from './model.ts';
import { depthOfFieldFor, dFovDeg, frameSizeAtDistance, hFovDeg, vFovDeg } from './lens.ts';
import type { SessionManager } from './session.ts';
import { disposeTree, makeLabel, type Label } from './ui.ts';

/** Formats a distance in meters as e.g. '3.4m' or '∞'. */
function m(v: number): string {
  return v === Infinity ? '∞' : `${v.toFixed(v < 10 ? 1 : 0)}m`;
}

/** Reused each frame by updateFromAnchors to avoid per-camera allocations. */
const _scratchAnchor = new THREE.Vector3();

const FRAME_LINE_DIST = 1.4; // meters from the eye
const MONITOR_IMG_W = 0.6; // meters
const RT_BASE_W = 1024;

export interface CamObject {
  data: CameraSetupData;
  root: THREE.Group;
  label: Label;
  frustum: THREE.LineSegments;
  anchor: XRAnchor | null;
}

export class CameraSystem {
  /** All camera gizmos; child of contentRoot. */
  readonly gizmoGroup = new THREE.Group();
  /** Floating director's monitor; child of the scene root (world space). */
  readonly monitor = new THREE.Group();
  /** Frame-line overlay; child of the user camera. */
  readonly frameLines = new THREE.Group();
  /** Grid floor visible ONLY inside the virtual-camera render. */
  readonly monitorGrid: THREE.Object3D;

  activeId: string | null = null;
  eyesMode = false;
  eyesFocal: FocalLength = 35;
  /** Aspect used for frame lines and for newly committed cameras. */
  currentAspect: AspectName = '2.39:1';
  /** Format/stop applied to newly committed cameras (edit per-camera later). */
  currentFormat: string = DEFAULT_FORMAT_ID;
  currentTStop: number = DEFAULT_TSTOP;
  onChange: () => void = () => {};

  private scene: SceneData;
  private session: SessionManager;
  private contentRoot: THREE.Group;
  private objects = new Map<string, CamObject>();
  private rtCamera: THREE.PerspectiveCamera;
  private rt: THREE.WebGLRenderTarget | null = null;
  private monitorImage: THREE.Mesh;
  private monitorImageMat: THREE.MeshBasicMaterial;
  private monitorInfo: Label;
  private frameRect = new THREE.Group();
  private frameLabel: Label;
  private frameLabelFlashUntil = 0;
  // Reused across renderPass frames to avoid per-frame allocations.
  private readonly visRestore: [THREE.Object3D, boolean][] = [];
  private readonly prevColor = new THREE.Color();

  constructor(scene: SceneData, session: SessionManager, contentRoot: THREE.Group) {
    this.scene = scene;
    this.session = session;
    this.contentRoot = contentRoot;

    this.rtCamera = new THREE.PerspectiveCamera(40, 2.39, 0.05, 100);
    contentRoot.add(this.rtCamera);
    contentRoot.add(this.gizmoGroup);

    this.monitorGrid = new THREE.GridHelper(24, 24, 0x46536b, 0x272e3d);
    this.monitorGrid.position.y = 0.002;
    this.monitorGrid.visible = false;
    contentRoot.add(this.monitorGrid);

    // Monitor: dark housing + image plane + info strip.
    const housing = new THREE.Mesh(
      new THREE.PlaneGeometry(MONITOR_IMG_W + 0.05, MONITOR_IMG_W / (16 / 9) + 0.1),
      new THREE.MeshBasicMaterial({ color: 0x05060a }),
    );
    this.monitorImageMat = new THREE.MeshBasicMaterial({ color: 0x111318, toneMapped: false });
    this.monitorImage = new THREE.Mesh(
      new THREE.PlaneGeometry(MONITOR_IMG_W, MONITOR_IMG_W / 2.39),
      this.monitorImageMat,
    );
    this.monitorImage.position.z = 0.004;
    this.monitorInfo = makeLabel('NO CAMERA — turn on Frame Lines, walk, press A', 0.028, {
      fontPx: 30,
      mono: true,
    });
    this.monitorInfo.sprite.position.set(0, -(MONITOR_IMG_W / (16 / 9)) / 2 - 0.02, 0.01);
    this.monitor.add(housing, this.monitorImage, this.monitorInfo.sprite);
    this.monitor.visible = false;
    this.monitor.renderOrder = 25;

    // Frame lines + letterbox mask + lens readout.
    this.frameLabel = makeLabel('35mm · 2.39:1', 0.05, { fontPx: 36, mono: true });
    this.frameLines.add(this.frameRect, this.frameLabel.sprite);
    this.frameLines.visible = false;
    this.rebuildFrameLines();
  }

  // --- scene lifecycle -------------------------------------------------------

  setScene(scene: SceneData): void {
    this.scene = scene;
    for (const obj of this.objects.values()) {
      obj.anchor?.delete?.();
      this.gizmoGroup.remove(obj.root);
      disposeTree(obj.root);
    }
    this.objects.clear();
    this.activeId = null;
    for (const c of scene.cameras) this.buildGizmo(c);
    if (scene.cameras.length) this.setActive(scene.cameras[scene.cameras.length - 1].id);
    this.refreshMonitorInfo();
  }

  all(): CamObject[] {
    return Array.from(this.objects.values());
  }

  get(id: string): CamObject | undefined {
    return this.objects.get(id);
  }

  get active(): CamObject | null {
    return this.activeId ? (this.objects.get(this.activeId) ?? null) : null;
  }

  /**
   * Commits a camera at the given WORLD pose (head or reticle flow). The
   * pose is converted into content space so it stays glued to the scene.
   */
  placeAtPose(worldPos: THREE.Vector3, worldQuat: THREE.Quaternion): CamObject {
    this.contentRoot.updateMatrixWorld();
    const inv = this.contentRoot.matrixWorld.clone().invert();
    const local = new THREE.Matrix4()
      .compose(worldPos, worldQuat, new THREE.Vector3(1, 1, 1))
      .premultiply(inv);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    local.decompose(p, q, new THREE.Vector3());
    const focal = this.eyesMode ? this.eyesFocal : (this.active?.data.lensFocalLength ?? 35);
    const data = createCameraSetup(
      this.scene,
      { x: p.x, y: p.y, z: p.z },
      { x: q.x, y: q.y, z: q.z, w: q.w },
      focal,
      this.currentAspect,
      this.currentTStop,
      this.currentFormat,
    );
    const obj = this.buildGizmo(data);
    this.setActive(data.id);
    this.onChange();
    return obj;
  }

  remove(id: string): void {
    const obj = this.objects.get(id);
    if (!obj) return;
    obj.anchor?.delete?.();
    this.gizmoGroup.remove(obj.root);
    disposeTree(obj.root);
    this.objects.delete(id);
    this.scene.cameras = this.scene.cameras.filter((c) => c.id !== id);
    if (this.activeId === id) {
      this.activeId = this.scene.cameras.length
        ? this.scene.cameras[this.scene.cameras.length - 1].id
        : null;
    }
    this.refreshMonitorInfo();
    this.onChange();
  }

  setActive(id: string | null): void {
    this.activeId = id;
    for (const obj of this.objects.values()) {
      const isActive = obj.data.id === id;
      (obj.frustum.material as THREE.LineBasicMaterial).color.set(isActive ? 0x66ccff : 0x3d6a84);
      (obj.frustum.material as THREE.LineBasicMaterial).opacity = isActive ? 0.95 : 0.5;
    }
    this.refreshRT();
    this.refreshMonitorInfo();
  }

  /**
   * Re-syncs one camera's visuals from its (externally mutated) data — used by
   * the landing-page editor. Cheaper and less side-effecting than setScene: no
   * teardown, and the active camera is preserved.
   */
  refreshCamera(id: string): void {
    const obj = this.objects.get(id);
    if (!obj) return;
    const d = obj.data;
    obj.root.position.set(d.position.x, d.position.y, d.position.z);
    obj.root.quaternion.set(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
    obj.label.setText(`${obj.data.name} · ${Math.round(d.lensFocalLength)}mm`);
    this.rebuildFrustum(obj);
    if (this.activeId === id) {
      this.refreshRT();
      this.refreshMonitorInfo();
    }
  }

  // --- lens & aspect controls --------------------------------------------------

  stepActiveFocal(dir: 1 | -1): void {
    const obj = this.active;
    if (!obj) return;
    obj.data.lensFocalLength = stepFocal(obj.data.lensFocalLength, dir);
    this.rebuildFrustum(obj);
    obj.label.setText(`${obj.data.name} · ${Math.round(obj.data.lensFocalLength)}mm`);
    this.refreshMonitorInfo();
    this.onChange();
  }

  stepEyesFocal(dir: 1 | -1): void {
    this.eyesFocal = stepFocal(this.eyesFocal, dir);
    this.rebuildFrameLines();
  }

  cycleAspect(): AspectName {
    const order: AspectName[] = ['2.39:1', '16:9', '4:3'];
    this.currentAspect = order[(order.indexOf(this.currentAspect) + 1) % order.length];
    const obj = this.active;
    if (obj) {
      obj.data.aspect = this.currentAspect;
      this.rebuildFrustum(obj);
      this.refreshRT();
      this.refreshMonitorInfo();
    }
    this.rebuildFrameLines();
    this.onChange();
    return this.currentAspect;
  }

  setEyesMode(on: boolean): void {
    this.eyesMode = on;
    this.frameLines.visible = on;
    if (on) this.rebuildFrameLines();
  }

  /** Position-only re-anchor (mirrors ActorManager.reanchor). */
  reanchor(obj: CamObject, frame: XRFrame): void {
    obj.anchor?.delete?.();
    obj.anchor = null;
    const p = obj.data.position;
    void this.session.createAnchor(frame, new THREE.Vector3(p.x, p.y, p.z)).then((anchor) => {
      obj.anchor = anchor;
    });
  }

  updateFromAnchors(frame: XRFrame, skipId: string | null): void {
    for (const obj of this.objects.values()) {
      if (!obj.anchor || obj.data.id === skipId) continue;
      const p = this.session.anchorPosition(frame, obj.anchor, _scratchAnchor);
      if (!p) continue;
      obj.data.position.x = p.x;
      obj.data.position.y = p.y;
      obj.data.position.z = p.z;
      obj.root.position.copy(p);
    }
  }

  /** Syncs data → visual after an external move (grab release). */
  syncFromRoot(obj: CamObject): void {
    obj.data.position = { x: obj.root.position.x, y: obj.root.position.y, z: obj.root.position.z };
    const q = obj.root.quaternion;
    obj.data.rotation = { x: q.x, y: q.y, z: q.z, w: q.w };
    this.onChange();
  }

  raycastTargets(): THREE.Object3D[] {
    return Array.from(this.objects.values()).map((o) => o.root);
  }

  overlayObjects(): THREE.Object3D[] {
    return Array.from(this.objects.values()).map((o) => o.label.sprite);
  }

  // --- per-frame updates ---------------------------------------------------------

  /** Lazy-follow monitor placement + flash restore. Call every frame. */
  update(dt: number, time: number, headPos: THREE.Vector3, headQuat: THREE.Quaternion): void {
    if (this.monitor.visible) {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);
      const desired = headPos.clone().addScaledVector(forward, 0.7);
      desired.y -= 0.06;
      const k = 1 - Math.exp(-dt * 5);
      this.monitor.position.lerp(desired, this.monitor.position.lengthSq() === 0 ? 1 : k);
      this.monitor.lookAt(headPos);
    }
    if (this.frameLabelFlashUntil && time > this.frameLabelFlashUntil) {
      this.frameLabelFlashUntil = 0;
      this.rebuildFrameLines();
    }
  }

  flashFrameLabel(msg: string): void {
    this.frameLabel.setText(msg, { fontPx: 36, mono: true, bg: 'rgba(46,91,215,0.95)' });
    this.frameLabelFlashUntil = performance.now() + 1100;
  }

  /**
   * Renders the active camera's view into the monitor texture. `hidden` is
   * every UI/overlay object that must not appear in the frame.
   */
  renderMonitor(renderer: THREE.WebGLRenderer, scene3: THREE.Scene, hidden: THREE.Object3D[]): void {
    const obj = this.active;
    if (!obj || !this.monitor.visible) return;
    if (!this.rt) this.refreshRT();
    if (!this.rt) return;
    this.poseRtCamera(obj);
    this.renderPass(renderer, scene3, this.rt, hidden);
    if (this.monitorImageMat.map !== this.rt.texture) {
      this.monitorImageMat.map = this.rt.texture;
      this.monitorImageMat.color.set(0xffffff);
      this.monitorImageMat.needsUpdate = true;
    }
  }

  /**
   * Captures the active camera's frame at 1920 px wide with a burned-in
   * slate and triggers a PNG download. Returns the filename or null.
   */
  capture(
    renderer: THREE.WebGLRenderer,
    scene3: THREE.Scene,
    hidden: THREE.Object3D[],
    sceneName: string,
  ): string | null {
    const obj = this.active;
    if (!obj) return null;
    const aspect = aspectValue(obj.data.aspect);
    const w = 1920;
    const h = Math.round(w / aspect);
    const rt = new THREE.WebGLRenderTarget(w, h);
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const pixels = new Uint8Array(w * h * 4);
    try {
      this.poseRtCamera(obj);
      this.renderPass(renderer, scene3, rt, hidden);
      renderer.readRenderTargetPixels(rt, 0, 0, w, h, pixels);
    } finally {
      rt.dispose(); // never leak the RT, even if the render throws
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    // GL reads bottom-up; flip rows.
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4;
      img.data.set(pixels.subarray(src, src + w * 4), y * w * 4);
    }
    ctx.putImageData(img, 0, 0);

    const stamp = new Date();
    const fmt = sensorFormat(obj.data.formatId);
    const hd = hFovDeg(obj.data.lensFocalLength, fmt);
    const dist = this.nearestActorDistance(obj.data);
    const dof = dist !== null ? depthOfFieldFor(obj.data, dist) : null;
    const optics =
      `${Math.round(obj.data.lensFocalLength)}mm ${fmt.short} · T${obj.data.tStop} · ${obj.data.aspect} · H${hd.toFixed(1)}°` +
      (dof ? ` · focus ${m(dist!)} · DOF ${m(dof.nearM)}–${m(dof.farM)}` : '');
    const slate = `${sceneName}  ·  ${obj.data.name}  ·  ${optics}  ·  ${stamp.toLocaleString()}`;
    const barH = 56;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, h - barH, w, barH);
    ctx.fillStyle = '#e8ecf3';
    ctx.font = '500 24px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(slate, 24, h - barH / 2);

    const filename = `${slug(sceneName)}-${slug(obj.data.name)}-${obj.data.lensFocalLength}mm-${timestamp(stamp)}.png`;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }, 'image/png');
    return filename;
  }

  // --- internals -----------------------------------------------------------------

  private poseRtCamera(obj: CamObject): void {
    const d = obj.data;
    this.rtCamera.position.set(d.position.x, d.position.y, d.position.z);
    this.rtCamera.quaternion.set(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
    this.rtCamera.fov = vFovDeg(d.lensFocalLength, d.aspect, sensorFormat(d.formatId));
    this.rtCamera.aspect = aspectValue(d.aspect);
    this.rtCamera.updateProjectionMatrix();
  }

  /** Distance (m) from a camera to the nearest actor's feet, or null. */
  private nearestActorDistance(cam: CameraSetupData): number | null {
    let best: number | null = null;
    for (const a of this.scene.actors) {
      const d = vecDistance(cam.position, a.position);
      if (best === null || d < best) best = d;
    }
    return best;
  }

  /**
   * Full cinematographer readout for a camera: lens, format, aspect, angle of
   * view, and — when there's a subject to focus on — depth of field and the
   * frame width at that distance.
   */
  private cameraReadout(cam: CameraSetupData): string {
    const fmt = sensorFormat(cam.formatId);
    const h = hFovDeg(cam.lensFocalLength, fmt);
    const dia = dFovDeg(cam.lensFocalLength, cam.aspect, fmt);
    let s = `${cam.name} · ${Math.round(cam.lensFocalLength)}mm ${fmt.short} · ${cam.aspect} · T${cam.tStop}`;
    s += `\nAoV H${h.toFixed(1)}° Ø${dia.toFixed(1)}°`;
    const dist = this.nearestActorDistance(cam);
    if (dist !== null) {
      const dof = depthOfFieldFor(cam, dist);
      const fw = frameSizeAtDistance(cam.lensFocalLength, cam.aspect, dist, fmt).width;
      s += ` · subj ${m(dist)}\nDOF ${m(dof.nearM)}–${m(dof.farM)} · frame ${fw.toFixed(1)}m wide`;
    }
    return s;
  }

  private renderPass(
    renderer: THREE.WebGLRenderer,
    scene3: THREE.Scene,
    rt: THREE.WebGLRenderTarget,
    hidden: THREE.Object3D[],
  ): void {
    // Snapshot state we're about to mutate. The restore runs in `finally` so a
    // single render throw (context loss, shader error) can never leave
    // xr.enabled=false — which would freeze/black the headset for the rest of
    // the session — nor leave HUD objects hidden or the RT bound. All mutations
    // live inside the try so any throw is fully unwound. renderPass is
    // intentionally NOT re-entrant (single setAnimationLoop caller), so the
    // shared visRestore/prevColor scratch is safe.
    for (const o of hidden) this.visRestore.push([o, o.visible]);
    const xrWas = renderer.xr.enabled;
    const prevTarget = renderer.getRenderTarget();
    renderer.getClearColor(this.prevColor);
    const prevAlpha = renderer.getClearAlpha();

    try {
      for (const o of hidden) o.visible = false;
      this.monitorGrid.visible = true;
      renderer.xr.enabled = false;
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x101318, 1);
      renderer.clear();
      renderer.render(scene3, this.rtCamera);
    } finally {
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(this.prevColor, prevAlpha);
      renderer.xr.enabled = xrWas;
      this.monitorGrid.visible = false;
      for (const [o, v] of this.visRestore) o.visible = v;
      this.visRestore.length = 0;
    }
  }

  private refreshRT(): void {
    const obj = this.active;
    if (!obj) return;
    const aspect = aspectValue(obj.data.aspect);
    const w = RT_BASE_W;
    const h = Math.round(w / aspect);
    if (this.rt && this.rt.width === w && this.rt.height === h) return;
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(w, h);
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.monitorImageMat.map = null; // reattached on next renderMonitor
    this.monitorImageMat.color.set(0x111318);
    // Resize the image plane to the new aspect (letterbox inside housing).
    this.monitorImage.geometry.dispose();
    this.monitorImage.geometry = new THREE.PlaneGeometry(MONITOR_IMG_W, MONITOR_IMG_W / aspect);
  }

  private refreshMonitorInfo(): void {
    const obj = this.active;
    this.monitorInfo.setText(
      obj ? this.cameraReadout(obj.data) : 'NO CAMERA — turn on Frame Lines, walk, press A',
      { fontPx: 28, mono: true },
    );
  }

  private buildGizmo(data: CameraSetupData): CamObject {
    const root = new THREE.Group();
    root.userData.cameraId = data.id;
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2b303c, flatShading: true });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.08), bodyMat);
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.07, 12).rotateX(Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x11141a, flatShading: true }),
    );
    lens.position.z = -0.075; // cameras look down -Z
    const accent = new THREE.Mesh(
      new THREE.BoxGeometry(0.145, 0.012, 0.085),
      new THREE.MeshBasicMaterial({ color: 0x66ccff }),
    );
    accent.position.y = 0.052;

    const frustum = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.7 }),
    );

    const label = makeLabel(`${data.name} · ${Math.round(data.lensFocalLength)}mm`, 0.055);
    label.sprite.position.y = 0.16;

    root.add(body, lens, accent, frustum, label.sprite);
    root.position.set(data.position.x, data.position.y, data.position.z);
    root.quaternion.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);
    this.gizmoGroup.add(root);

    const obj: CamObject = { data, root, label, frustum, anchor: null };
    this.objects.set(data.id, obj);
    this.rebuildFrustum(obj);
    return obj;
  }

  /** Sightline cone: 4 edges + frame rectangle at 0.6 m, sized by the lens. */
  private rebuildFrustum(obj: CamObject): void {
    const depth = 0.6;
    const { width, height } = frameSizeAtDistance(
      obj.data.lensFocalLength,
      obj.data.aspect,
      depth,
      sensorFormat(obj.data.formatId),
    );
    const hw = width / 2;
    const hh = height / 2;
    const o = new THREE.Vector3(0, 0, 0);
    const c = [
      new THREE.Vector3(-hw, hh, -depth),
      new THREE.Vector3(hw, hh, -depth),
      new THREE.Vector3(hw, -hh, -depth),
      new THREE.Vector3(-hw, -hh, -depth),
    ];
    const pts: THREE.Vector3[] = [];
    for (const corner of c) pts.push(o.clone(), corner);
    for (let i = 0; i < 4; i++) pts.push(c[i], c[(i + 1) % 4]);
    obj.frustum.geometry.dispose();
    obj.frustum.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  }

  /** Frame rectangle + letterbox mask + readout for eyes-as-camera mode. */
  private rebuildFrameLines(): void {
    disposeTree(this.frameRect); // focal steps rebuild this — free GPU buffers
    this.frameRect.clear();
    const fmt = sensorFormat(this.currentFormat);
    const { width, height } = frameSizeAtDistance(this.eyesFocal, this.currentAspect, FRAME_LINE_DIST, fmt);
    const hw = width / 2;
    const hh = height / 2;
    const z = -FRAME_LINE_DIST;

    const rect = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-hw, hh, z),
        new THREE.Vector3(hw, hh, z),
        new THREE.Vector3(hw, -hh, z),
        new THREE.Vector3(-hw, -hh, z),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthTest: false }),
    );
    rect.renderOrder = 40;

    const cross = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.02 * width, 0, z),
        new THREE.Vector3(0.02 * width, 0, z),
        new THREE.Vector3(0, -0.02 * width, z),
        new THREE.Vector3(0, 0.02 * width, z),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthTest: false }),
    );
    cross.renderOrder = 40;

    // Letterbox: translucent dark bars outside the frame (dims passthrough).
    const maskMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45,
      depthTest: false,
      depthWrite: false,
    });
    const M = Math.max(width, height) * 2.4; // mask extent beyond the frame
    const bars = [
      { w: M * 2, h: M - hh, x: 0, y: hh + (M - hh) / 2 }, // top
      { w: M * 2, h: M - hh, x: 0, y: -hh - (M - hh) / 2 }, // bottom
      { w: M - hw, h: height, x: hw + (M - hw) / 2, y: 0 }, // right
      { w: M - hw, h: height, x: -hw - (M - hw) / 2, y: 0 }, // left
    ];
    for (const b of bars) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), maskMat);
      m.position.set(b.x, b.y, z);
      m.renderOrder = 39;
      this.frameRect.add(m);
    }
    this.frameRect.add(rect, cross);

    const h = hFovDeg(this.eyesFocal, fmt);
    const fw = frameSizeAtDistance(this.eyesFocal, this.currentAspect, FRAME_LINE_DIST, fmt).width;
    this.frameLabel.setText(
      `${Math.round(this.eyesFocal)}mm ${fmt.short} · ${this.currentAspect} · H${h.toFixed(0)}° · ${fw.toFixed(1)}m @ ${FRAME_LINE_DIST}m`,
      { fontPx: 34, mono: true },
    );
    this.frameLabel.sprite.position.set(0, -hh - 0.06 * width, z);
    this.frameLabel.sprite.center.set(0.5, 0.5);
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
}

function timestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
