// ---------------------------------------------------------------------------
// Desktop scene preview — a non-XR orbit view of the current scene on the
// landing page. Reuses the live scene graph (actors with stances, keyframe
// footprints/paths, camera gizmos) and the KeyframeSystem for playback, so
// blocking, poses, and lens framing can be sanity-checked at a laptop before
// a headset session. AR-only concerns (anchors, passthrough, drift, fps
// budget, wrist UI) still need TESTING.md on the Quest.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { aspectValue, sensorFormat, type SceneData } from './model.ts';
import { vFovDeg } from './lens.ts';
import type { KeyframeSystem } from './keyframes.ts';

function fmtTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export class DesktopPreview {
  /** True while the preview owns the renderer's animation loop. */
  active = false;
  onClose: () => void = () => {};

  private renderer: THREE.WebGLRenderer;
  private scene3: THREE.Scene;
  private contentRoot: THREE.Group;
  private keyframes: KeyframeSystem;
  /** Objects that live in the scene for AR but must not show on desktop. */
  private hideInPreview: THREE.Object3D[];

  private camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.05, 100);
  private controls: OrbitControls | null = null;
  private grid: THREE.GridHelper | null = null;
  private sceneData: SceneData | null = null;
  /** null = orbit; otherwise index into sceneData.cameras (lens view). */
  private lensIndex: number | null = null;
  private lastT = 0;

  // Saved state, restored on close so the next AR session is untouched.
  private savedContent = {
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
  };
  private savedVisibility: [THREE.Object3D, boolean][] = [];

  // DOM
  private bar: HTMLDivElement | null = null;
  private playBtn: HTMLButtonElement | null = null;
  private lensBtn: HTMLButtonElement | null = null;
  private scrub: HTMLInputElement | null = null;
  private clock: HTMLSpanElement | null = null;
  private letterbox: [HTMLDivElement, HTMLDivElement] | null = null;
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);

  constructor(
    renderer: THREE.WebGLRenderer,
    scene3: THREE.Scene,
    contentRoot: THREE.Group,
    keyframes: KeyframeSystem,
    hideInPreview: THREE.Object3D[],
  ) {
    this.renderer = renderer;
    this.scene3 = scene3;
    this.contentRoot = contentRoot;
    this.keyframes = keyframes;
    this.hideInPreview = hideInPreview;
  }

  open(scene: SceneData, bounds: THREE.Box3 | null): void {
    if (this.active) this.close();
    this.active = true;
    this.sceneData = scene;
    this.lensIndex = null;
    this.lastT = 0;

    // The preview assumes true registration: snapshot and reset any leftover
    // AR view transform (teleport/mini) instead of fighting ViewManager.
    this.savedContent.pos.copy(this.contentRoot.position);
    this.savedContent.quat.copy(this.contentRoot.quaternion);
    this.savedContent.scale.copy(this.contentRoot.scale);
    this.contentRoot.position.set(0, 0, 0);
    this.contentRoot.quaternion.identity();
    this.contentRoot.scale.setScalar(1);

    this.savedVisibility = this.hideInPreview.map((o) => [o, o.visible]);
    for (const o of this.hideInPreview) o.visible = false;

    this.scene3.background = new THREE.Color(0x14181f);
    this.grid = new THREE.GridHelper(20, 20, 0x3c4a63, 0x232a36);
    this.scene3.add(this.grid);

    // Frame the scene: orbit target at the content center, dolly back by size.
    const center = new THREE.Vector3(0, 0.9, 0);
    let radius = 4;
    if (bounds && !bounds.isEmpty()) {
      bounds.getCenter(center);
      radius = Math.max(3, bounds.getSize(new THREE.Vector3()).length() * 0.75);
    }
    this.camera.position.set(center.x + radius * 0.7, center.y + radius * 0.55, center.z + radius * 0.7);
    // The canvas is pointer-events:none so the landing page stays clickable;
    // orbit input needs it back on for the preview's lifetime only.
    this.renderer.domElement.style.pointerEvents = 'auto';
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(center);
    this.controls.maxPolarAngle = Math.PI * 0.495; // don't orbit under the floor
    this.controls.update();

    this.buildBar();
    window.addEventListener('keydown', this.keyHandler);
    this.renderer.setAnimationLoop((t) => this.tick(t));
  }

  close(): void {
    if (!this.active) return;
    this.active = false;
    this.renderer.setAnimationLoop(null);
    this.keyframes.stop();
    window.removeEventListener('keydown', this.keyHandler);

    this.controls?.dispose();
    this.controls = null;
    this.renderer.domElement.style.pointerEvents = 'none';
    if (this.grid) {
      this.scene3.remove(this.grid);
      this.grid.geometry.dispose();
      (this.grid.material as THREE.Material).dispose();
      this.grid = null;
    }
    this.scene3.background = null; // alpha canvas again (AR passthrough)
    for (const [o, v] of this.savedVisibility) o.visible = v;
    this.savedVisibility = [];
    this.contentRoot.position.copy(this.savedContent.pos);
    this.contentRoot.quaternion.copy(this.savedContent.quat);
    this.contentRoot.scale.copy(this.savedContent.scale);

    this.bar?.remove();
    this.bar = null;
    if (this.letterbox) {
      this.letterbox[0].remove();
      this.letterbox[1].remove();
      this.letterbox = null;
    }
    this.sceneData = null;
    this.onClose();
  }

  // --- per-frame -------------------------------------------------------------

  private tick(t: number): void {
    const dt = this.lastT ? Math.min((t - this.lastT) / 1000, 0.1) : 0;
    this.lastT = t;
    this.keyframes.tick(dt);
    this.syncBar();

    const canvas = this.renderer.domElement;
    if (!this.applyLensView()) {
      this.camera.fov = 55;
      this.camera.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      this.camera.updateProjectionMatrix();
      this.controls?.update();
    }
    this.renderer.render(this.scene3, this.camera);
  }

  /**
   * In lens view, poses the preview camera exactly at the selected camera
   * setup with its true vertical FOV (letterbox bars crop the canvas to the
   * camera's aspect, so the horizontal extent is faithful too). Returns false
   * in orbit mode.
   */
  private applyLensView(): boolean {
    const s = this.sceneData;
    if (this.lensIndex === null || !s || !s.cameras.length) return false;
    const d = s.cameras[Math.min(this.lensIndex, s.cameras.length - 1)];
    this.camera.fov = vFovDeg(d.lensFocalLength, d.aspect, d.formatId);
    this.camera.aspect = this.fitLetterbox(aspectValue(d.aspect));
    this.camera.updateProjectionMatrix();
    this.camera.position.set(d.position.x, d.position.y, d.position.z);
    this.camera.quaternion.set(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
    return true;
  }

  /** Sizes the black bars to crop the canvas to `want` (w/h) and returns it. */
  private fitLetterbox(want: number): number {
    if (!this.letterbox) return want;
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth;
    const h = Math.max(1, canvas.clientHeight);
    const [a, b] = this.letterbox;
    if (w / h > want) {
      const barW = Math.max(0, Math.round((w - h * want) / 2));
      a.style.cssText = `position:fixed;left:0;top:0;bottom:0;width:${barW}px;background:#000;z-index:5;`;
      b.style.cssText = `position:fixed;right:0;top:0;bottom:0;width:${barW}px;background:#000;z-index:5;`;
    } else {
      const barH = Math.max(0, Math.round((h - w / want) / 2));
      a.style.cssText = `position:fixed;left:0;right:0;top:0;height:${barH}px;background:#000;z-index:5;`;
      b.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${barH}px;background:#000;z-index:5;`;
    }
    return want;
  }

  // --- toolbar ----------------------------------------------------------------

  private buildBar(): void {
    const bar = document.createElement('div');
    bar.className = 'preview-bar';
    const btn = (label: string, onClick: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = onClick;
      bar.appendChild(b);
      return b;
    };
    this.lensBtn = btn('View: Orbit', () => this.cycleLens());
    this.playBtn = btn('▶ Play', () => this.togglePlay());
    btn('⏹ Stop', () => this.keyframes.stop());
    this.scrub = document.createElement('input');
    this.scrub.type = 'range';
    this.scrub.min = '0';
    this.scrub.max = '1000';
    this.scrub.value = '0';
    this.scrub.oninput = () => this.keyframes.scrubTo(Number(this.scrub!.value) / 1000);
    bar.appendChild(this.scrub);
    this.clock = document.createElement('span');
    this.clock.textContent = '0:00 / 0:00';
    bar.appendChild(this.clock);
    btn('✕ Close', () => this.close());
    document.body.appendChild(bar);
    this.bar = bar;

    const mkBar = (): HTMLDivElement => {
      const d = document.createElement('div');
      d.style.display = 'none';
      document.body.appendChild(d);
      return d;
    };
    this.letterbox = [mkBar(), mkBar()];
  }

  private syncBar(): void {
    if (!this.bar) return;
    if (this.playBtn) this.playBtn.textContent = this.keyframes.playing ? '⏸ Pause' : '▶ Play';
    if (this.scrub && this.keyframes.duration > 0 && this.keyframes.playing) {
      this.scrub.value = String(Math.round(this.keyframes.normalizedT * 1000));
    }
    if (this.clock) {
      this.clock.textContent = `${fmtTime(this.keyframes.t)} / ${fmtTime(this.keyframes.duration)}`;
    }
    if (this.lensIndex === null && this.letterbox) {
      this.letterbox[0].style.display = 'none';
      this.letterbox[1].style.display = 'none';
    }
  }

  /** Orbit → CAM A → CAM B → … → Orbit. Lens view disables orbiting. */
  private cycleLens(): void {
    const s = this.sceneData;
    const n = s?.cameras.length ?? 0;
    if (!n) {
      this.lensIndex = null;
      if (this.lensBtn) this.lensBtn.textContent = 'View: Orbit (no cams)';
      return;
    }
    this.lensIndex = this.lensIndex === null ? 0 : this.lensIndex + 1;
    if (this.lensIndex >= n) this.lensIndex = null;
    if (this.controls) this.controls.enabled = this.lensIndex === null;
    if (this.lensBtn) {
      if (this.lensIndex === null) {
        this.lensBtn.textContent = 'View: Orbit';
      } else {
        const d = s!.cameras[this.lensIndex];
        this.lensBtn.textContent = `View: ${d.name} · ${Math.round(d.lensFocalLength)}mm ${
          sensorFormat(d.formatId).short
        } · ${d.aspect}`;
      }
    }
  }

  private togglePlay(): void {
    if (this.keyframes.playing) this.keyframes.pause();
    else this.keyframes.play();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.close();
    else if (e.key === ' ') {
      e.preventDefault();
      this.togglePlay();
    }
  }
}
