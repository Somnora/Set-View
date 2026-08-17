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
import { aspectValue, computeFocusDistance, computeVillageLayout, createAtmosphereConfig, type SceneData } from './model.ts';
import { classifyShotSize, vFovDeg } from './lens.ts';
import { buildCameraTimeline, buildTimeline, sampleCameraTimeline, sampleTimeline } from './timeline.ts';
import type { KeyframeSystem } from './keyframes.ts';
import { generateDawStemManifest } from './audioCues.ts';
import { openAiAnalysisModal, openDailiesVideoStudioModal } from './ui.ts';
import { AnimaticVideoRenderer } from './animaticVideoRenderer.ts';
import { VolumetricManager } from './volumetrics.ts';

export class DesktopPreview {
  /** True while the preview owns the renderer's animation loop. */
  active = false;
  onClose: () => void = () => {};
  onOpenCollab?: () => void;
  onOpenProps?: () => void;
  onOpenLiveLink?: () => void;
  onOpenDmxBridge?: () => void;
  onOpenIcvfx?: () => void;
  onOpenAcoustics?: () => void;
  onOpenSolar?: () => void;
  onOpenScreenplay?: () => void;
  onOpenWebXRProfiler?: () => void;
  onOpenVRComfort?: () => void;
  onOpenSetDressing?: () => void;


  private renderer: THREE.WebGLRenderer;
  private scene3: THREE.Scene;
  private contentRoot: THREE.Group;
  private keyframes: KeyframeSystem;
  private volumetrics: VolumetricManager | null = null;
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
  private loopBtn: HTMLButtonElement | null = null;
  private rateBtn: HTMLButtonElement | null = null;
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

    this.volumetrics = new VolumetricManager(this.scene3);
    this.volumetrics.update(
      scene.atmosphere ?? createAtmosphereConfig('clear'),
      scene.lights ?? [],
      this.camera,
    );

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

    this.volumetrics?.dispose();
    this.volumetrics = null;

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
    this.volumetrics?.tick(dt, this.sceneData?.atmosphere, this.sceneData?.lights ?? [], this.camera);
    this.syncBar();

    const canvas = this.renderer.domElement;
    if (this.lensIndex === -1) {
      if (this.letterbox) {
        this.letterbox[0].style.display = 'none';
        this.letterbox[1].style.display = 'none';
      }
      this.renderVillageView(canvas);
    } else if (!this.applyLensView()) {
      this.camera.fov = 55;
      this.camera.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      this.camera.updateProjectionMatrix();
      this.controls?.update();
      this.renderer.render(this.scene3, this.camera);
    } else {
      this.renderer.render(this.scene3, this.camera);
    }
  }

  /**
   * Renders the multi-camera Video Village viewport matrix directly on the canvas.
   */
  private renderVillageView(canvas: HTMLCanvasElement): void {
    const s = this.sceneData;
    if (!s || !s.cameras.length) return;
    const w = canvas.clientWidth;
    const h = Math.max(1, canvas.clientHeight);
    const aspect = w / h;
    const layout = computeVillageLayout(s.cameras, 'grid-4', aspect);

    const prevScissorTest = this.renderer.getScissorTest();
    this.renderer.setScissorTest(true);
    this.renderer.setClearColor(0x0a0d14, 1);
    this.renderer.clear();

    for (const slot of layout.activeSlots) {
      const d = s.cameras.find((c) => c.id === slot.cameraId);
      if (!d) continue;

      let pos = d.position;
      let rot = d.rotation;
      let focal = d.lensFocalLength;
      if (d.keyframes && d.keyframes.length >= 2) {
        const tl = buildCameraTimeline(d.keyframes);
        let lookPos: { x: number; y: number; z: number } | undefined;
        if (d.lookAtTargetActorId) {
          const target = s.actors.find((a) => a.id === d.lookAtTargetActorId);
          if (target) {
            if (target.keyframes && target.keyframes.length >= 2) {
              const atl = buildTimeline(target.keyframes, s.walkSpeed);
              const asamp = sampleTimeline(target.keyframes, atl, this.keyframes.t);
              if (asamp) lookPos = { x: asamp.position.x, y: asamp.position.y + 1.4, z: asamp.position.z };
            } else {
              lookPos = { x: target.position.x, y: target.position.y + 1.4, z: target.position.z };
            }
          }
        }
        const sample = sampleCameraTimeline(d.keyframes, tl, this.keyframes.t, lookPos);
        if (sample) {
          pos = sample.position;
          rot = sample.rotation;
          focal = sample.lensFocalLength;
        }
      }

      this.camera.fov = vFovDeg(focal, d.aspect, d.formatId);
      this.camera.aspect = aspectValue(d.aspect);
      this.camera.updateProjectionMatrix();
      this.camera.position.set(pos.x, pos.y, pos.z);
      this.camera.quaternion.set(rot.x, rot.y, rot.z, rot.w);

      const vx = Math.round(slot.frameRect.x * w);
      const vy = Math.round((1 - slot.frameRect.y - slot.frameRect.height) * h);
      const vw = Math.max(1, Math.round(slot.frameRect.width * w));
      const vh = Math.max(1, Math.round(slot.frameRect.height * h));

      this.renderer.setViewport(vx, vy, vw, vh);
      this.renderer.setScissor(vx, vy, vw, vh);
      this.renderer.render(this.scene3, this.camera);
    }

    this.renderer.setScissorTest(prevScissorTest);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.setScissor(0, 0, w, h);
  }

  /**
   * In lens view, poses the preview camera exactly at the selected camera
   * setup with its true vertical FOV (letterbox bars crop the canvas to the
   * camera's aspect, so the horizontal extent is faithful too). Returns false
   * in orbit mode.
   */
  private applyLensView(): boolean {
    const s = this.sceneData;
    if (this.lensIndex === null || this.lensIndex < 0 || !s || !s.cameras.length) return false;
    const d = s.cameras[Math.min(this.lensIndex, s.cameras.length - 1)];

    let pos = d.position;
    let rot = d.rotation;
    let focal = d.lensFocalLength;
    if (d.keyframes && d.keyframes.length >= 2) {
      const tl = buildCameraTimeline(d.keyframes);
      let lookPos: { x: number; y: number; z: number } | undefined;
      if (d.lookAtTargetActorId) {
        const target = s.actors.find((a) => a.id === d.lookAtTargetActorId);
        if (target) {
          if (target.keyframes && target.keyframes.length >= 2) {
            const atl = buildTimeline(target.keyframes, s.walkSpeed);
            const asamp = sampleTimeline(target.keyframes, atl, this.keyframes.t);
            if (asamp) lookPos = { x: asamp.position.x, y: asamp.position.y + 1.4, z: asamp.position.z };
          } else {
            lookPos = { x: target.position.x, y: target.position.y + 1.4, z: target.position.z };
          }
        }
      }
      const sample = sampleCameraTimeline(d.keyframes, tl, this.keyframes.t, lookPos);
      if (sample) {
        pos = sample.position;
        rot = sample.rotation;
        focal = sample.lensFocalLength;
      }
    }

    this.camera.fov = vFovDeg(focal, d.aspect, d.formatId);
    this.camera.aspect = this.fitLetterbox(aspectValue(d.aspect));
    this.camera.updateProjectionMatrix();
    this.camera.position.set(pos.x, pos.y, pos.z);
    this.camera.quaternion.set(rot.x, rot.y, rot.z, rot.w);
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
    btn('|< -1F', () => { this.keyframes.stepFrames(-1); this.syncBar(); });
    this.playBtn = btn('▶ Play', () => this.togglePlay());
    btn('+1F >|', () => { this.keyframes.stepFrames(1); this.syncBar(); });
    this.loopBtn = btn('🔁 Loop', () => { this.keyframes.toggleLoop(); this.syncBar(); });
    this.rateBtn = btn('⚡ 1.0x', () => { this.keyframes.cycleRate(); this.syncBar(); });
    btn('⏹ Stop', () => this.keyframes.stop());
    this.scrub = document.createElement('input');
    this.scrub.type = 'range';
    this.scrub.min = '0';
    this.scrub.max = '1000';
    this.scrub.value = '0';
    this.scrub.oninput = () => this.keyframes.scrubTo(Number(this.scrub!.value) / 1000);
    bar.appendChild(this.scrub);
    this.clock = document.createElement('span');
    this.clock.textContent = '00:00:00:00 / 00:00:00:00';
    this.clock.style.fontFamily = 'monospace';
    bar.appendChild(this.clock);

    if (this.sceneData?.audioCues && this.sceneData.audioCues.length > 0) {
      btn('🎵 Export DAW Stems', () => this.exportDawStems());
    }

    if (this.sceneData) {
      btn('🎬 Storyboards & Continuity', () => openAiAnalysisModal(this.sceneData!));
      btn('🎬 Dailies Video Reel', () => {
        openDailiesVideoStudioModal(
          this.sceneData!,
          async (options, onProgress) => {
            const renderer = new AnimaticVideoRenderer();
            return await renderer.renderAnimaticVideo(
              this.sceneData!,
              undefined,
              options,
              onProgress,
              this.scene3,
              this.contentRoot,
            );
          },
          document.body,
        );
      });
    }

    if (this.onOpenCollab) {
      btn('👥 Collab', () => this.onOpenCollab?.());
    }

    if (this.onOpenProps) {
      btn('📦 Props', () => this.onOpenProps?.());
    }

    if (this.onOpenLiveLink) {
      btn('📡 LiveLink', () => this.onOpenLiveLink?.());
    }

    if (this.onOpenDmxBridge) {
      btn('💡 DMX', () => this.onOpenDmxBridge?.());
    }

    if (this.onOpenIcvfx) {
      btn('🎬 ICVFX', () => this.onOpenIcvfx?.());
    }

    if (this.onOpenAcoustics) {
      btn('🎙️ Audio', () => this.onOpenAcoustics?.());
    }

    if (this.onOpenSolar) {
      btn('☀️ Sun', () => this.onOpenSolar?.());
    }

    if (this.onOpenScreenplay) {
      btn('📜 Script', () => this.onOpenScreenplay?.());
    }

    if (this.onOpenWebXRProfiler) {
      btn('⚡ Profiler', () => this.onOpenWebXRProfiler?.());
    }

    if (this.onOpenVRComfort) {
      btn('🛡️ Comfort', () => this.onOpenVRComfort?.());
    }

    if (this.onOpenSetDressing) {
      btn('🎲 Dressing', () => this.onOpenSetDressing?.());
    }

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

  private exportDawStems(): void {
    if (!this.sceneData) return;
    const cues = this.sceneData.audioCues ?? [];
    const manifest = generateDawStemManifest(cues, this.keyframes.duration, this.sceneData.name, 24);

    // Download JSON Manifest
    const jsonBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement('a');
    jsonLink.href = jsonUrl;
    jsonLink.download = `${this.sceneData.name.replace(/\s+/g, '_')}_stem_manifest.json`;
    jsonLink.click();
    URL.revokeObjectURL(jsonUrl);

    // Download CSV EDL
    const edlBlob = new Blob([manifest.csvEdl], { type: 'text/csv' });
    const edlUrl = URL.createObjectURL(edlBlob);
    const edlLink = document.createElement('a');
    edlLink.href = edlUrl;
    edlLink.download = `${this.sceneData.name.replace(/\s+/g, '_')}_audio_edl.csv`;
    edlLink.click();
    URL.revokeObjectURL(edlUrl);
  }

  private syncBar(): void {
    if (!this.bar) return;
    if (this.playBtn) this.playBtn.textContent = this.keyframes.playing ? '⏸ Pause' : '▶ Play';
    if (this.loopBtn) {
      this.loopBtn.textContent = this.keyframes.isLooping ? '🔁 Loop [ON]' : '🔁 Loop';
      this.loopBtn.style.color = this.keyframes.isLooping ? '#38bdf8' : '';
    }
    if (this.rateBtn) {
      this.rateBtn.textContent = `⚡ ${this.keyframes.playbackRate}x`;
    }
    if (this.scrub && this.keyframes.duration > 0 && this.keyframes.playing) {
      this.scrub.value = String(Math.round(this.keyframes.normalizedT * 1000));
    }
    if (this.clock) {
      this.clock.textContent = `${this.keyframes.smpteTimecode} / ${this.keyframes.smpteDuration}`;
    }
    if ((this.lensIndex === null || this.lensIndex === -1) && this.letterbox) {
      this.letterbox[0].style.display = 'none';
      this.letterbox[1].style.display = 'none';
    }
  }

  /** Orbit → CAM A → CAM B → Video Village (if 2+ cams) → Orbit. */
  private cycleLens(): void {
    const s = this.sceneData;
    const n = s?.cameras.length ?? 0;
    if (!n) {
      this.lensIndex = null;
      if (this.lensBtn) this.lensBtn.textContent = 'View: Orbit (no cams)';
      return;
    }
    if (this.lensIndex === null) {
      this.lensIndex = 0;
    } else if (this.lensIndex >= 0 && this.lensIndex < n - 1) {
      this.lensIndex += 1;
    } else if (this.lensIndex === n - 1 && n > 1) {
      this.lensIndex = -1; // Video Village
    } else {
      this.lensIndex = null;
    }

    if (this.controls) this.controls.enabled = this.lensIndex === null;
    if (this.lensBtn) {
      if (this.lensIndex === null) {
        this.lensBtn.textContent = 'View: Orbit';
      } else if (this.lensIndex === -1) {
        this.lensBtn.textContent = `View: 🎬 Video Village (${n} Cams)`;
      } else {
        const d = s!.cameras[this.lensIndex];
        const focus = computeFocusDistance(d, s!.actors);
        const shot = classifyShotSize(d.lensFocalLength, d.aspect, d.formatId, focus);
        this.lensBtn.textContent = `View: ${d.name} · ${Math.round(d.lensFocalLength)}mm [${shot.shotSize}] · ${d.aspect}`;
      }
    }
  }

  private togglePlay(): void {
    if (this.keyframes.playing) this.keyframes.pause();
    else this.keyframes.play();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.close();
    } else if (e.key === ' ') {
      e.preventDefault();
      this.togglePlay();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.keyframes.stepFrames(e.shiftKey ? -10 : -1);
      this.syncBar();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.keyframes.stepFrames(e.shiftKey ? 10 : 1);
      this.syncBar();
    } else if (e.key === 'i' || e.key === 'I') {
      this.keyframes.setInPoint();
      this.syncBar();
    } else if (e.key === 'o' || e.key === 'O') {
      this.keyframes.setOutPoint();
      this.syncBar();
    } else if (e.key === 'l' || e.key === 'L') {
      this.keyframes.toggleLoop();
      this.syncBar();
    }
  }
}
