// ---------------------------------------------------------------------------
// SetView Automated Dailies & Multi-Camera Animatic Video Renderer
//
// Headless offscreen video rendering pipeline with deterministic frame-by-frame
// stepping, multi-camera switching, 4-up quad split scissor passes, burned-in
// SMPTE timecode (BITC) overlays, and synchronized Web Audio clapper slate synthesis.
//
// Zero-allocation memory budgeting inside the per-frame render loop.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import type { CameraSetupData, SceneData } from './model.ts';
import { vFovDeg } from './lens.ts';
import {
  calculateAnimaticSequencePlan,
  calculateQuadSplitViewports,
  generateDailiesSlateData,
  normalizeDailiesConfig,
  type AnimaticRenderOptions,
  type AnimaticSequencePlan,
  type DailiesSlateData,
  type QuadSplitRect,
} from './dailiesEngine.ts';
import {
  buildCameraTimeline,
  buildTimeline,
  sampleCameraTimeline,
  sampleTimeline,
  type CameraTimeline,
  type Timeline,
} from './timeline.ts';

export type DailiesRenderProgressCallback = (
  progress: number,
  currentFrame: number,
  totalFrames: number,
  etaSeconds: number,
  previewCanvas?: HTMLCanvasElement,
) => void;

export interface DailiesRenderResult {
  blob: Blob;
  url: string;
  filename: string;
  plan: AnimaticSequencePlan;
  width: number;
  height: number;
  fps: number;
  durationS: number;
}

export class AnimaticVideoRenderer {
  private aborted = false;

  // Pre-allocated reusable structures for zero-allocation render loop
  private readonly _camPos = new THREE.Vector3();
  private readonly _camQuat = new THREE.Quaternion();
  private readonly _clearColor = new THREE.Color(0x10131a);
  private readonly _prevClearColor = new THREE.Color();
  private readonly _topDownTarget = new THREE.Vector3();
  private readonly _boundsMin = new THREE.Vector3();
  private readonly _boundsMax = new THREE.Vector3();

  // Cameras
  private readonly _renderCam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 200);
  private readonly _orthoCam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);

  /**
   * Cancels any active rendering loop immediately.
   */
  abort(): void {
    this.aborted = true;
  }

  /**
   * Main entry point: renders a complete multi-camera dailies animatic video file.
   */
  async renderAnimaticVideo(
    scene: SceneData,
    existingRenderer?: THREE.WebGLRenderer,
    rawOptions?: Partial<AnimaticRenderOptions>,
    onProgress?: DailiesRenderProgressCallback,
    liveScene3?: THREE.Scene,
    liveContentRoot?: THREE.Group,
  ): Promise<DailiesRenderResult> {
    this.aborted = false;
    const options = normalizeDailiesConfig(rawOptions);
    const plan = calculateAnimaticSequencePlan(scene, options);

    const width = options.resolution.width;
    const height = options.resolution.height;
    const fps = options.fps;
    const totalFrames = plan.totalFrames;

    // Build timeline lookups for actors and cameras
    const actorTimelines = new Map<string, Timeline>();
    if (scene.actors) {
      for (const actor of scene.actors) {
        if (actor.keyframes && actor.keyframes.length >= 2) {
          actorTimelines.set(actor.id, buildTimeline(actor.keyframes, scene.walkSpeed));
        }
      }
    }

    const cameraTimelines = new Map<string, CameraTimeline>();
    if (scene.cameras) {
      for (const cam of scene.cameras) {
        if (cam.keyframes && cam.keyframes.length >= 2) {
          cameraTimelines.set(cam.id, buildCameraTimeline(cam.keyframes));
        }
      }
    }

    // Set up dedicated offscreen canvas and 2D overlay canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.width = width;
    overlayCanvas.height = height;
    const overlayCtx = overlayCanvas.getContext('2d', { alpha: true });
    if (!overlayCtx) {
      throw new Error('Failed to create 2D overlay canvas context for dailies rendering');
    }

    // Set up WebGL renderer
    const renderer =
      existingRenderer ??
      new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        preserveDrawingBuffer: true,
        alpha: false,
        powerPreference: 'high-performance',
      });

    renderer.setSize(width, height, false);
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    // Set up 3D Scene
    let scene3: THREE.Scene;
    let contentRoot: THREE.Group;
    let isStandaloneScene = false;

    if (liveScene3 && liveContentRoot) {
      scene3 = liveScene3;
      contentRoot = liveContentRoot;
    } else {
      isStandaloneScene = true;
      const created = this.buildStandaloneScene(scene);
      scene3 = created.scene3;
      contentRoot = created.contentRoot;
    }

    // Pre-calculate scene bounding center for top-down orthographic view
    this.calculateSceneBounds(scene, this._boundsMin, this._boundsMax, this._topDownTarget);
    const spanX = Math.max(8, (this._boundsMax.x - this._boundsMin.x) * 1.3);
    const spanZ = Math.max(8, (this._boundsMax.z - this._boundsMin.z) * 1.3);
    const orthoSize = Math.max(spanX, spanZ) / 2;
    this._orthoCam.left = -orthoSize;
    this._orthoCam.right = orthoSize;
    this._orthoCam.top = orthoSize;
    this._orthoCam.bottom = -orthoSize;
    this._orthoCam.position.set(this._topDownTarget.x, 20, this._topDownTarget.z);
    this._orthoCam.lookAt(this._topDownTarget.x, 0, this._topDownTarget.z);
    this._orthoCam.updateProjectionMatrix();

    // Set up Audio Synthesis & MediaStream
    const audioContext = options.audioEnabled ? this.createAudioContext() : null;
    const audioDest = audioContext ? audioContext.createMediaStreamDestination() : null;

    if (audioContext && audioDest) {
      this.synthesizeAudioTrack(audioContext, audioDest, plan);
    }

    // Create video capture stream
    const videoStream = canvas.captureStream ? canvas.captureStream(fps) : (canvas as any).mozCaptureStream(fps);
    const combinedTracks: MediaStreamTrack[] = [];
    if (videoStream) {
      const vTrack = videoStream.getVideoTracks()[0];
      if (vTrack) combinedTracks.push(vTrack);
    }
    if (audioDest && audioDest.stream) {
      const aTrack = audioDest.stream.getAudioTracks()[0];
      if (aTrack) combinedTracks.push(aTrack);
    }

    const outputStream = new MediaStream(combinedTracks);
    const mimeType = this.pickOptimalMimeType(options.format);
    const videoBps = options.qualityMbps * 1_000_000;

    const recordedChunks: Blob[] = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(outputStream, {
        mimeType,
        videoBitsPerSecond: videoBps,
      });
    } catch {
      recorder = new MediaRecorder(outputStream);
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    recorder.start(100);

    const quadViewports = calculateQuadSplitViewports(width, height);
    const startTimeMs = performance.now();

    try {
      // Deterministic render loop across all frames
      for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
        if (this.aborted) {
          throw new Error('Dailies rendering was cancelled by user');
        }

        const t = frameIdx / fps;

        // 1. Update actor positions and rotations at time t
        this.updateActorPoses(scene, contentRoot, actorTimelines, t);

        // 2. Clear canvas
        renderer.setViewport(0, 0, width, height);
        renderer.setScissor(0, 0, width, height);
        renderer.setScissorTest(false);
        renderer.getClearColor(this._prevClearColor);
        renderer.setClearColor(this._clearColor, 1);
        renderer.clear(true, true, true);

        // 3. Render 3D scene based on layout mode
        if (options.layout === 'quad_split') {
          this.renderQuadSplitFrame(
            scene,
            scene3,
            renderer,
            quadViewports,
            cameraTimelines,
            plan,
            frameIdx,
            t,
            height,
          );
        } else if (options.layout === 'picture_in_picture') {
          this.renderPipFrame(
            scene,
            scene3,
            renderer,
            cameraTimelines,
            plan,
            frameIdx,
            t,
            width,
            height,
          );
        } else {
          // 'single_cut' or 'director_slate'
          this.renderSingleCutFrame(
            scene,
            scene3,
            renderer,
            cameraTimelines,
            plan,
            frameIdx,
            t,
            width,
            height,
          );
        }

        // 4. Render 2D Burned-In Timecode (BITC) and Slate Overlays
        const slateData = generateDailiesSlateData(frameIdx, plan, scene, options.bitc);
        this.renderBitcOverlay(
          overlayCtx,
          slateData,
          options,
          width,
          height,
          quadViewports,
        );

        // 5. Fire progress callback
        const nowMs = performance.now();
        const elapsedMs = nowMs - startTimeMs;
        const progress = Math.min(1.0, (frameIdx + 1) / totalFrames);
        const framesDone = frameIdx + 1;
        const msPerFrame = elapsedMs / framesDone;
        const remainingFrames = totalFrames - framesDone;
        const etaSeconds = Math.max(0, Math.round((remainingFrames * msPerFrame) / 1000));

        if (onProgress) {
          onProgress(progress, frameIdx + 1, totalFrames, etaSeconds, canvas);
        }

        // Yield execution to allow UI update and prevent thread blocking
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      // Finalize recording
      recorder.stop();
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      const videoBlob = new Blob(recordedChunks, { type: mimeType });
      const videoUrl = URL.createObjectURL(videoBlob);
      const safeSceneName = (scene.name || 'scene').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const filename = `setview_dailies_${safeSceneName}_${width}x${height}_${fps}fps.${ext}`;

      return {
        blob: videoBlob,
        url: videoUrl,
        filename,
        plan,
        width,
        height,
        fps,
        durationS: plan.totalDurationS,
      };
    } finally {
      if (audioContext && audioContext.state !== 'closed') {
        try {
          await audioContext.close();
        } catch {
          // Ignore
        }
      }
      if (isStandaloneScene) {
        this.disposeStandaloneScene(scene3);
      }
    }
  }

  /**
   * Renders a Single Cut view from the active camera setup at time t.
   */
  private renderSingleCutFrame(
    scene: SceneData,
    scene3: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    cameraTimelines: Map<string, CameraTimeline>,
    plan: AnimaticSequencePlan,
    frameIndex: number,
    t: number,
    width: number,
    height: number,
  ): void {
    // Find active cut
    let activeCut = plan.cuts[0];
    for (let i = plan.cuts.length - 1; i >= 0; i--) {
      if (frameIndex >= plan.cuts[i].frameIndex) {
        activeCut = plan.cuts[i];
        break;
      }
    }

    const camData =
      scene.cameras?.find((c) => c.id === activeCut.cameraId) ??
      scene.cameras?.[0] ?? {
        id: 'fallback',
        name: 'CAM A',
        position: { x: 0, y: 1.6, z: 4 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        lensFocalLength: 35,
        aspect: '2.39:1',
        tStop: 2.8,
        formatId: 'super35',
      };

    this.configureCameraFromSetup(
      this._renderCam,
      camData,
      cameraTimelines.get(camData.id),
      t - activeCut.timestampS,
      width / height,
    );

    renderer.setViewport(0, 0, width, height);
    renderer.setScissor(0, 0, width, height);
    renderer.setScissorTest(false);
    renderer.render(scene3, this._renderCam);
  }

  /**
   * Renders 4-Up Quad Split viewports (Director, Cam A, Cam B, Top-Down Floorplan).
   */
  private renderQuadSplitFrame(
    scene: SceneData,
    scene3: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    viewports: Record<'director' | 'camA' | 'camB' | 'topDown', QuadSplitRect>,
    cameraTimelines: Map<string, CameraTimeline>,
    plan: AnimaticSequencePlan,
    frameIndex: number,
    t: number,
    height: number,
  ): void {
    renderer.setScissorTest(true);

    // 1. Director Cut Viewport (Top-Left in visual coords: y is inverted in WebGL viewport)
    let activeCut = plan.cuts[0];
    for (let i = plan.cuts.length - 1; i >= 0; i--) {
      if (frameIndex >= plan.cuts[i].frameIndex) {
        activeCut = plan.cuts[i];
        break;
      }
    }

    const activeCam =
      scene.cameras?.find((c) => c.id === activeCut.cameraId) ?? scene.cameras?.[0];
    if (activeCam) {
      this.configureCameraFromSetup(
        this._renderCam,
        activeCam,
        cameraTimelines.get(activeCam.id),
        t - activeCut.timestampS,
        viewports.director.width / viewports.director.height,
      );
      this.applyScissorViewport(renderer, viewports.director, height);
      renderer.render(scene3, this._renderCam);
    }

    // 2. Camera A Viewport (Top-Right)
    const camA = scene.cameras?.[0] ?? activeCam;
    if (camA) {
      this.configureCameraFromSetup(
        this._renderCam,
        camA,
        cameraTimelines.get(camA.id),
        t,
        viewports.camA.width / viewports.camA.height,
      );
      this.applyScissorViewport(renderer, viewports.camA, height);
      renderer.render(scene3, this._renderCam);
    }

    // 3. Camera B Viewport (Bottom-Left)
    const camB = scene.cameras?.[1] ?? scene.cameras?.[0] ?? activeCam;
    if (camB) {
      this.configureCameraFromSetup(
        this._renderCam,
        camB,
        cameraTimelines.get(camB.id),
        t,
        viewports.camB.width / viewports.camB.height,
      );
      this.applyScissorViewport(renderer, viewports.camB, height);
      renderer.render(scene3, this._renderCam);
    }

    // 4. Top-Down Orthographic Floorplan Viewport (Bottom-Right)
    this.applyScissorViewport(renderer, viewports.topDown, height);
    renderer.render(scene3, this._orthoCam);

    renderer.setScissorTest(false);
  }

  /**
   * Renders Picture-in-Picture layout (Main camera view with inset top-down floorplan).
   */
  private renderPipFrame(
    scene: SceneData,
    scene3: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    cameraTimelines: Map<string, CameraTimeline>,
    plan: AnimaticSequencePlan,
    frameIndex: number,
    t: number,
    width: number,
    height: number,
  ): void {
    // 1. Render main active camera full viewport
    this.renderSingleCutFrame(
      scene,
      scene3,
      renderer,
      cameraTimelines,
      plan,
      frameIndex,
      t,
      width,
      height,
    );

    // 2. Render PiP inset in bottom-right corner
    renderer.setScissorTest(true);
    const pipW = Math.round(width * 0.28);
    const pipH = Math.round(height * 0.28);
    const pipX = width - pipW - Math.round(width * 0.03);
    const pipY = Math.round(height * 0.05);

    const pipRect: QuadSplitRect = {
      x: pipX,
      y: pipY,
      width: pipW,
      height: pipH,
      label: 'TOP-DOWN FLOORPLAN',
    };

    this.applyScissorViewport(renderer, pipRect, height);
    renderer.render(scene3, this._orthoCam);
    renderer.setScissorTest(false);
  }

  /**
   * Helper to set WebGL viewport & scissor matching 2D screen coordinates.
   */
  private applyScissorViewport(
    renderer: THREE.WebGLRenderer,
    rect: QuadSplitRect,
    canvasHeight: number,
  ): void {
    const glY = canvasHeight - rect.y - rect.height;
    renderer.setViewport(rect.x, glY, rect.width, rect.height);
    renderer.setScissor(rect.x, glY, rect.width, rect.height);
  }

  /**
   * Configures camera position, rotation, and FOV from CameraSetupData and keyframes.
   */
  private configureCameraFromSetup(
    cam: THREE.PerspectiveCamera,
    setup: CameraSetupData,
    timeline: CameraTimeline | undefined,
    elapsedShotS: number,
    aspect: number,
  ): void {
    if (timeline && setup.keyframes && setup.keyframes.length >= 2) {
      const sample = sampleCameraTimeline(setup.keyframes, timeline, Math.max(0, elapsedShotS));
      if (sample) {
        this._camPos.set(sample.position.x, sample.position.y, sample.position.z);
        this._camQuat.set(
          sample.rotation.x,
          sample.rotation.y,
          sample.rotation.z,
          sample.rotation.w,
        );
        cam.position.copy(this._camPos);
        cam.quaternion.copy(this._camQuat);
      } else {
        cam.position.set(setup.position.x, setup.position.y, setup.position.z);
        cam.quaternion.set(
          setup.rotation.x,
          setup.rotation.y,
          setup.rotation.z,
          setup.rotation.w,
        );
      }
    } else {
      cam.position.set(setup.position.x, setup.position.y, setup.position.z);
      cam.quaternion.set(
        setup.rotation.x,
        setup.rotation.y,
        setup.rotation.z,
        setup.rotation.w,
      );
    }

    cam.fov = vFovDeg(
      setup.lensFocalLength || 35,
      setup.aspect || '16:9',
      setup.formatId || 'super35',
    );
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
  }

  /**
   * Interpolates actor positions & rotations along their blocking timelines.
   */
  private updateActorPoses(
    scene: SceneData,
    contentRoot: THREE.Group,
    timelines: Map<string, Timeline>,
    t: number,
  ): void {
    if (!scene.actors) return;
    for (const actor of scene.actors) {
      const actorGroup = contentRoot.getObjectByName(`actor-${actor.id}`);
      if (!actorGroup) continue;

      const tl = timelines.get(actor.id);
      if (tl && actor.keyframes && actor.keyframes.length >= 2) {
        const sample = sampleTimeline(actor.keyframes, tl, t);
        if (sample) {
          actorGroup.position.set(sample.position.x, sample.position.y, sample.position.z);
          actorGroup.rotation.y = sample.rotationY;
        } else {
          actorGroup.position.set(actor.position.x, actor.position.y, actor.position.z);
          actorGroup.rotation.y = actor.rotationY;
        }
      } else {
        actorGroup.position.set(actor.position.x, actor.position.y, actor.position.z);
        actorGroup.rotation.y = actor.rotationY;
      }
    }
  }

  /**
   * Draws Burned-In Timecode (BITC) and slate overlay text onto 2D canvas context.
   */
  private renderBitcOverlay(
    ctx: CanvasRenderingContext2D,
    slate: DailiesSlateData,
    options: AnimaticRenderOptions,
    width: number,
    height: number,
    quads: Record<'director' | 'camA' | 'camB' | 'topDown', QuadSplitRect>,
  ): void {
    ctx.clearRect(0, 0, width, height);

    const config = options.bitc;
    if (!config.enabled) return;

    const baseFontSize = Math.max(14, Math.round(height * 0.024));
    ctx.textBaseline = 'middle';

    // 1. Draw Quad Split divider grid and quadrant labels if quad_split mode
    if (options.layout === 'quad_split') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(quads.camA.x, 0);
      ctx.lineTo(quads.camA.x, height);
      ctx.moveTo(0, quads.camB.y);
      ctx.lineTo(width, quads.camB.y);
      ctx.stroke();

      // Quadrant labels
      ctx.font = `600 ${Math.round(baseFontSize * 0.8)}px "SF Pro", -apple-system, sans-serif`;
      for (const q of Object.values(quads)) {
        this.drawPillBadge(
          ctx,
          q.label,
          q.x + 16,
          q.y + 16,
          Math.round(baseFontSize * 0.75),
          'rgba(0, 0, 0, 0.75)',
          '#38bdf8',
        );
      }
    }

    // 2. Letterbox Bars (Aspect Masking)
    if (options.layout === 'single_cut' || options.layout === 'director_slate') {
      const barHeight = Math.round(height * 0.08);
      ctx.fillStyle = 'rgba(10, 13, 18, 0.85)';
      ctx.fillRect(0, 0, width, barHeight);
      ctx.fillRect(0, height - barHeight, width, barHeight);
    }

    // 3. Top Slate Header Bar (Scene name, Watermark, Layout mode)
    const headerY = Math.round(height * 0.04);
    if (config.showWatermark && slate.watermark) {
      ctx.font = `700 ${Math.round(baseFontSize * 0.9)}px "SF Pro", -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText(slate.watermark, width / 2, headerY);
    }

    // Scene / Take badge (Top-Left)
    if (config.showSceneShotTake) {
      ctx.font = `700 ${baseFontSize}px "SF Pro", -apple-system, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      const sceneLabel = `SCENE: ${slate.sceneName.toUpperCase()} · SHOT ${slate.shotNumber} · TK ${slate.takeNumber}`;
      this.drawPillBadge(
        ctx,
        sceneLabel,
        24,
        headerY - 14,
        baseFontSize,
        'rgba(0, 0, 0, 0.65)',
        '#f59e0b',
      );
    }

    // 4. Bottom BITC Bar (SMPTE Timecode + Camera Lens Data)
    const footerY = height - Math.round(height * 0.04);

    // Camera Lens Data (Bottom-Left)
    if (config.showCameraLensData) {
      ctx.font = `600 ${Math.round(baseFontSize * 0.85)}px "SF Pro", -apple-system, sans-serif`;
      ctx.textAlign = 'left';
      const lensText = `${slate.cameraName} · ${slate.focalLengthMm}mm · T${slate.tStop.toFixed(1)} · S35`;
      this.drawPillBadge(
        ctx,
        lensText,
        24,
        footerY - 14,
        Math.round(baseFontSize * 0.85),
        'rgba(0, 0, 0, 0.75)',
        '#60a5fa',
      );
    }

    // SMPTE Timecode Badge (Configurable Position, default Bottom-Center)
    const tcFontSize = Math.round(baseFontSize * 1.25);
    ctx.font = `700 ${tcFontSize}px "Courier New", Courier, monospace`;

    let tcX = width / 2;
    let tcY = footerY - 16;
    if (config.position === 'bottom_left') {
      tcX = 24;
    } else if (config.position === 'top_right') {
      tcX = width - 200;
      tcY = 24;
    } else if (config.position === 'top_center') {
      tcX = width / 2;
      tcY = 24;
    }

    this.drawTimecodeBox(
      ctx,
      slate.smpteTimecode,
      tcX,
      tcY,
      tcFontSize,
      config.dropFrame,
    );
  }

  /**
   * Draws a high-contrast pill badge with background box and colored text.
   */
  private drawPillBadge(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    fontSize: number,
    bgColor: string,
    textColor: string,
  ): void {
    ctx.font = `700 ${fontSize}px "SF Pro", -apple-system, sans-serif`;
    const metrics = ctx.measureText(text);
    const padX = Math.round(fontSize * 0.6);
    const padY = Math.round(fontSize * 0.35);
    const boxW = metrics.width + padX * 2;
    const boxH = fontSize + padY * 2;

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, 4);
    ctx.fill();

    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x + padX, y + padY);
  }

  /**
   * Draws a broadcast-grade SMPTE timecode readout box.
   */
  private drawTimecodeBox(
    ctx: CanvasRenderingContext2D,
    tc: string,
    centerX: number,
    topY: number,
    fontSize: number,
    isDropFrame: boolean,
  ): void {
    ctx.font = `700 ${fontSize}px "Courier New", Courier, monospace`;
    const metrics = ctx.measureText(tc);
    const padX = 16;
    const padY = 8;
    const boxW = metrics.width + padX * 2;
    const boxH = fontSize + padY * 2;
    const boxX = centerX - boxW / 2;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.strokeStyle = isDropFrame ? '#f59e0b' : '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(boxX, topY, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(tc, centerX, topY + padY);
  }

  /**
   * Synthesizes audio cues and Frame 0 acoustic clapper thump into Web Audio destination.
   */
  private synthesizeAudioTrack(
    audioCtx: AudioContext,
    dest: MediaStreamAudioDestinationNode,
    plan: AnimaticSequencePlan,
  ): void {
    // 1. Frame 0 Clapper Slate Pip & Transient Thump
    const t0 = audioCtx.currentTime;

    // 1kHz Sine pip
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, t0);
    oscGain.gain.setValueAtTime(0.7, t0);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
    osc.connect(oscGain);
    oscGain.connect(dest);
    osc.start(t0);
    osc.stop(t0 + 0.045);

    // 120Hz Sub Thump
    const thump = audioCtx.createOscillator();
    const thumpGain = audioCtx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(120, t0);
    thump.frequency.exponentialRampToValueAtTime(40, t0 + 0.06);
    thumpGain.gain.setValueAtTime(0.8, t0);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
    thump.connect(thumpGain);
    thumpGain.connect(dest);
    thump.start(t0);
    thump.stop(t0 + 0.065);

    // 2. Synthesize tone markers for audio cues
    if (plan.audioCues && plan.audioCues.length > 0) {
      for (const cue of plan.audioCues) {
        const cueT = t0 + cue.timestampS;
        const cueOsc = audioCtx.createOscillator();
        const cueGain = audioCtx.createGain();

        // Frequency based on cue type
        const freq =
          cue.type === 'dialogue'
            ? 440
            : cue.type === 'sfx'
            ? 880
            : cue.type === 'foley'
            ? 330
            : 550;

        cueOsc.type = 'triangle';
        cueOsc.frequency.setValueAtTime(freq, cueT);
        cueGain.gain.setValueAtTime(0.3 * (cue.volume ?? 1.0), cueT);
        cueGain.gain.exponentialRampToValueAtTime(0.0001, cueT + Math.min(0.2, cue.durationS));

        cueOsc.connect(cueGain);
        cueGain.connect(dest);
        cueOsc.start(cueT);
        cueOsc.stop(cueT + Math.min(0.25, cue.durationS));
      }
    }
  }

  /**
   * Helper to instantiate an AudioContext safely.
   */
  private createAudioContext(): AudioContext | null {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        return new AudioCtxClass();
      }
    } catch {
      // Ignore
    }
    return null;
  }

  /**
   * Selects the highest quality supported MediaRecorder MIME type.
   */
  private pickOptimalMimeType(preferredFormat: 'mp4' | 'webm'): string {
    if (typeof MediaRecorder === 'undefined') return 'video/webm';

    const candidates =
      preferredFormat === 'mp4'
        ? [
            'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
            'video/mp4;codecs=avc1.4d002a',
            'video/mp4',
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
          ]
        : [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4;codecs=avc1',
            'video/mp4',
          ];

    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) {
        return c;
      }
    }
    return 'video/webm';
  }

  /**
   * Calculates overall scene bounding box to frame the top-down floorplan view.
   */
  private calculateSceneBounds(
    scene: SceneData,
    outMin: THREE.Vector3,
    outMax: THREE.Vector3,
    outCenter: THREE.Vector3,
  ): void {
    outMin.set(-4, 0, -4);
    outMax.set(4, 2, 4);

    if (scene.actors) {
      for (const a of scene.actors) {
        outMin.x = Math.min(outMin.x, a.position.x - 1);
        outMax.x = Math.max(outMax.x, a.position.x + 1);
        outMin.z = Math.min(outMin.z, a.position.z - 1);
        outMax.z = Math.max(outMax.z, a.position.z + 1);
      }
    }

    if (scene.cameras) {
      for (const c of scene.cameras) {
        outMin.x = Math.min(outMin.x, c.position.x - 1);
        outMax.x = Math.max(outMax.x, c.position.x + 1);
        outMin.z = Math.min(outMin.z, c.position.z - 1);
        outMax.z = Math.max(outMax.z, c.position.z + 1);
      }
    }

    outCenter.set(
      (outMin.x + outMax.x) / 2,
      (outMin.y + outMax.y) / 2,
      (outMin.z + outMax.z) / 2,
    );
  }

  /**
   * Builds a self-contained standalone 3D scene when running outside live preview.
   */
  private buildStandaloneScene(scene: SceneData): {
    scene3: THREE.Scene;
    contentRoot: THREE.Group;
  } {
    const scene3 = new THREE.Scene();
    scene3.background = this._clearColor;

    const contentRoot = new THREE.Group();
    scene3.add(contentRoot);

    // Floor Grid
    const grid = new THREE.GridHelper(24, 24, 0x334155, 0x1e293b);
    grid.position.y = 0;
    scene3.add(grid);

    // Lighting
    const hemi = new THREE.HemisphereLight(0xffffff, 0x1e293b, 0.7);
    hemi.position.set(0, 10, 0);
    scene3.add(hemi);

    const dirLight = new THREE.DirectionalLight(0xfff5ea, 1.2);
    dirLight.position.set(5, 8, 4);
    scene3.add(dirLight);

    // Populate actors
    if (scene.actors) {
      for (const actor of scene.actors) {
        const actorGroup = new THREE.Group();
        actorGroup.name = `actor-${actor.id}`;
        actorGroup.position.set(actor.position.x, actor.position.y, actor.position.z);
        actorGroup.rotation.y = actor.rotationY;

        // Visual mannequin cylinder
        const bodyGeo = new THREE.CylinderGeometry(0.2, 0.25, 1.4, 16);
        const bodyMat = new THREE.MeshStandardMaterial({
          color: actor.color ? parseInt(actor.color.replace('#', '0x'), 16) : 0x38bdf8,
          roughness: 0.4,
        });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = 0.7;
        actorGroup.add(bodyMesh);

        // Head sphere
        const headGeo = new THREE.SphereGeometry(0.15, 16, 16);
        const headMesh = new THREE.Mesh(headGeo, bodyMat);
        headMesh.position.y = 1.55;
        actorGroup.add(headMesh);

        // Nose direction cone
        const noseGeo = new THREE.ConeGeometry(0.06, 0.15, 12);
        noseGeo.rotateX(Math.PI / 2);
        const noseMesh = new THREE.Mesh(
          noseGeo,
          new THREE.MeshStandardMaterial({ color: 0xf59e0b }),
        );
        noseMesh.position.set(0, 1.55, 0.18);
        actorGroup.add(noseMesh);

        contentRoot.add(actorGroup);
      }
    }

    // Populate cameras
    if (scene.cameras) {
      for (const cam of scene.cameras) {
        const camGroup = new THREE.Group();
        camGroup.name = `camera-${cam.id}`;
        camGroup.position.set(cam.position.x, cam.position.y, cam.position.z);
        camGroup.quaternion.set(
          cam.rotation.x,
          cam.rotation.y,
          cam.rotation.z,
          cam.rotation.w,
        );

        const camBox = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, 0.2, 0.35),
          new THREE.MeshStandardMaterial({ color: 0xef4444 }),
        );
        camGroup.add(camBox);
        contentRoot.add(camGroup);
      }
    }

    return { scene3, contentRoot };
  }

  /**
   * Cleanly disposes standalone scene objects.
   */
  private disposeStandaloneScene(scene3: THREE.Scene): void {
    scene3.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          for (const m of mesh.material) m.dispose();
        } else if (mesh.material) {
          mesh.material.dispose();
        }
      }
    });
    scene3.clear();
  }
}
