// ---------------------------------------------------------------------------
// Virtual-camera video recorder. While rolling, each frame the monitor feed
// texture is blitted (letterboxed) into the renderer canvas's backbuffer —
// which sits unused during an XR session (XR frames go to the compositor's
// own framebuffer) — and pushed into a canvas.captureStream + MediaRecorder.
// Stopping finalizes the take and downloads it as a video file, the same
// on-device path as photo capture. Virtual content only: WebXR never exposes
// passthrough pixels; mixed-reality takes are the Quest's built-in recorder.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import {
  containScale,
  fileExtensionFor,
  MAX_RECORD_S,
  pickMimeType,
  RECORD_FPS,
  RECORD_MIME_CANDIDATES,
  RECORD_VIDEO_BPS,
} from './recording.ts';

export class MonitorRecorder {
  /** Fired once per take after it finalizes: saved filename, or null if discarded. */
  onStopped: (savedFilename: string | null) => void = () => {};

  private media: MediaRecorder | null = null;
  private track: CanvasCaptureMediaStreamTrack | null = null;
  private canvas: HTMLCanvasElement | null = null;
  /** Ends the current take (bound per-take in start; carries the save flag). */
  private stopRequest: ((save: boolean) => void) | null = null;
  private prevCanvasW = 0;
  private prevCanvasH = 0;
  private startedAtMs = 0;
  private lastFrameMs = -Infinity;

  // Fullscreen blit quad (mirrors the DofPass pattern).
  private blitScene = new THREE.Scene();
  private blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private blitMat = new THREE.MeshBasicMaterial({
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });
  private quad: THREE.Mesh;
  private prevViewport = new THREE.Vector4();
  private prevClear = new THREE.Color();

  constructor() {
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blitMat);
    this.blitScene.add(this.quad);
  }

  get recording(): boolean {
    return this.media !== null;
  }

  /** Seconds since the take started (0 when not rolling). */
  elapsedS(nowMs: number): number {
    return this.media ? (nowMs - this.startedAtMs) / 1000 : 0;
  }

  /**
   * Starts a take at exactly `videoW`×`videoH` (the feed RT size — pixel-for-
   * pixel, no rescale). Returns the filename the take will save as, or null
   * when video capture isn't available. The canvas backbuffer is resized for
   * the duration of the take and restored on stop; its CSS size is untouched
   * and XR presentation never reads it.
   */
  start(
    renderer: THREE.WebGLRenderer,
    videoW: number,
    videoH: number,
    baseName: string,
    nowMs: number,
  ): string | null {
    if (this.media) return null;
    const canvas = renderer.domElement;
    if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
      return null;
    }
    const mime = pickMimeType(RECORD_MIME_CANDIDATES, (t) => MediaRecorder.isTypeSupported(t));
    if (!mime) return null;

    const prevW = canvas.width;
    const prevH = canvas.height;
    let stream: MediaStream;
    let track: CanvasCaptureMediaStreamTrack | null = null;
    let media: MediaRecorder;
    try {
      canvas.width = videoW;
      canvas.height = videoH;
      // frameRequestRate 0 = manual frames: requestFrame after each blit keeps
      // capture correct even when the hidden 2D page isn't being composited.
      stream = canvas.captureStream(0);
      const t0: MediaStreamTrack | undefined = stream.getVideoTracks()[0];
      if (t0 && 'requestFrame' in t0) {
        track = t0 as CanvasCaptureMediaStreamTrack;
      } else {
        // No manual control on this platform — sample canvas updates instead.
        for (const t of stream.getTracks()) t.stop();
        stream = canvas.captureStream(RECORD_FPS);
      }
      media = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: RECORD_VIDEO_BPS });
    } catch {
      canvas.width = prevW;
      canvas.height = prevH;
      return null;
    }

    const filename = `${baseName}.${fileExtensionFor(mime)}`;
    const chunks: Blob[] = [];
    let saveOnStop = true;
    let finalized = false;
    const finalize = () => {
      if (finalized) return;
      finalized = true;
      for (const t of stream.getTracks()) t.stop();
      // Platform-initiated stop (track died, OS pressure): we didn't go
      // through stop(), so the canvas is still hijacked — detach now.
      if (this.media === media) this.detach();
      if (saveOnStop && chunks.length > 0) {
        const blob = new Blob(chunks, { type: media.mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        this.onStopped(filename);
      } else {
        this.onStopped(null);
      }
    };
    media.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    media.onstop = finalize;
    media.onerror = () => {
      // Fatal encoder error — end the take, keep whatever already flushed.
      if (this.media === media) this.stop(true);
    };
    this.stopRequest = (save: boolean) => {
      saveOnStop = save;
      if (media.state !== 'inactive') {
        try {
          media.stop(); // flushes a final dataavailable, then fires onstop
          return;
        } catch {
          /* raced to inactive — finalize directly */
        }
      }
      finalize();
    };

    this.media = media;
    this.track = track;
    this.canvas = canvas;
    this.prevCanvasW = prevW;
    this.prevCanvasH = prevH;
    this.startedAtMs = nowMs;
    this.lastFrameMs = -Infinity;
    try {
      media.start(1000); // 1 s chunks so long takes flush incrementally
    } catch {
      this.detach(); // restores the canvas; fields were just set above
      for (const t of stream.getTracks()) t.stop();
      return null;
    }
    return filename;
  }

  /**
   * Feeds one frame while rolling: letterbox-blits `texture` (srcW×srcH) into
   * the canvas backbuffer and pushes it to the stream. Throttled to
   * RECORD_FPS; auto-stops (saving) at the MAX_RECORD_S cap.
   */
  captureFrame(
    renderer: THREE.WebGLRenderer,
    texture: THREE.Texture,
    srcW: number,
    srcH: number,
    nowMs: number,
  ): void {
    const canvas = this.canvas;
    if (!this.media || !canvas) return;
    if (nowMs - this.startedAtMs >= MAX_RECORD_S * 1000) {
      this.stop(true);
      return;
    }
    if (nowMs - this.lastFrameMs < 1000 / RECORD_FPS - 0.5) return;
    this.lastFrameMs = nowMs;

    if (this.blitMat.map !== texture) {
      this.blitMat.map = texture;
      this.blitMat.needsUpdate = true;
    }
    const s = containScale(srcW, srcH, canvas.width, canvas.height);
    this.quad.scale.set(s.x, s.y, 1);

    const prevXr = renderer.xr.enabled;
    const prevTarget = renderer.getRenderTarget();
    renderer.getViewport(this.prevViewport);
    renderer.getClearColor(this.prevClear);
    const prevAlpha = renderer.getClearAlpha();
    // try/finally so a throw can never leave xr.enabled=false — that would
    // black/freeze the headset (mirrors DofPass.render / cameraView.renderPass).
    try {
      renderer.xr.enabled = false;
      renderer.setRenderTarget(null);
      // setViewport takes pre-pixel-ratio units; divide so the device viewport
      // covers the full backbuffer (flooring can undershoot by 1 px — the
      // clear below paints any such edge black rather than leaving garbage).
      const pr = renderer.getPixelRatio();
      renderer.setViewport(0, 0, canvas.width / pr, canvas.height / pr);
      renderer.setClearColor(0x000000, 1);
      renderer.render(this.blitScene, this.blitCamera);
    } finally {
      renderer.setClearColor(this.prevClear, prevAlpha);
      renderer.setViewport(this.prevViewport);
      renderer.setRenderTarget(prevTarget);
      renderer.xr.enabled = prevXr;
    }
    this.track?.requestFrame();
  }

  /**
   * Ends the take. `save: true` finalizes and downloads the file; false
   * discards it. Safe to call when not recording. onStopped fires either way
   * once the encoder flushes.
   */
  stop(save: boolean): void {
    if (!this.media) return;
    const req = this.stopRequest;
    this.detach();
    req?.(save);
  }

  /** Restores the canvas backbuffer and clears per-take state. */
  private detach(): void {
    if (this.canvas) {
      this.canvas.width = this.prevCanvasW;
      this.canvas.height = this.prevCanvasH;
    }
    this.canvas = null;
    this.media = null;
    this.track = null;
    this.stopRequest = null;
  }

  dispose(): void {
    this.stop(false);
    this.quad.geometry.dispose();
    this.blitMat.dispose();
  }
}
