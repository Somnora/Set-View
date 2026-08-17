// ---------------------------------------------------------------------------
// Director's Smartwatch Slate (3D Wrist HUD & Transport / Quick-Actions Slate)
//  - Attached directly to left wrist/grip space.
//  - Displays live scene stats, active camera specs, 24fps SMPTE timecode.
//  - Features interactive 1-tap touch slate buttons & scrub slider:
//      [🎥 Cam] [📍 Mark] [⏯️ Play] [🔴 Rec] [🎞️ Take] [⚙️ Menu]
//      [ |< -1F ] [ +1F >| ] [ 🔁 Loop ] [ ⚡ Speed ]
//  - Accepts direct right index fingertip taps or right controller pointer.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { InputManager } from './input.ts';
import type { VideoVillageLayoutMode } from './model.ts';
import type { ShotSize } from './lens.ts';

export interface SmartwatchState {
  sceneName: string;
  activeCamName: string;
  focalLengthMm: number;
  tStop: number;
  formatShort: string;
  focusDistanceM: number;
  focusTargetName?: string;
  shotSize?: ShotSize | string;
  shotSizeLabel?: string;
  cameraMoveType?: string;
  cameraMarksCount?: number;
  cameraMoveProgress?: number;
  lookAtTargetName?: string;
  lineOfActionCrossing?: boolean;
  jumpCutWarning?: boolean;
  eyelineMismatchWarning?: boolean;
  cameraInShotWarning?: string | null;
  villageMode?: VideoVillageLayoutMode;
  recording: boolean;
  recordingClock: string;
  audioActive: boolean;
  takeCount: number;

  // Transport & Timecode
  smpteTimecode?: string;
  smpteDuration?: string;
  isPlaying?: boolean;
  playbackRate?: number;
  isLooping?: boolean;
  normalizedT?: number;
  dailiesActive?: boolean;
  dailiesTakeNumber?: number;
  dailiesTakeCount?: number;

  // Spatial Audio Cues
  audioCueCount?: number;
  activeAudioCueName?: string;
  activeAudioCueType?: string;
  isRecordingScratch?: boolean;
  audioCueMarkers?: { normTime: number; color: string }[];

  // Multi-User Collaboration
  collabPeerCount?: number;
  collabRoomCode?: string;
  collabIsConnected?: boolean;

  // Set Dressing & 3D Props
  propCount?: number;
}

export interface SmartwatchButton {
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const QUICK_BUTTONS: SmartwatchButton[] = [
  { id: 'cam', label: '🎥 Cam', color: '#1e3a8a', x: 10, y: 382, w: 76, h: 98 },
  { id: 'mark', label: '📍 Mark', color: '#0369a1', x: 92, y: 382, w: 76, h: 98 },
  { id: 'play', label: '⏯️ Play', color: '#047857', x: 174, y: 382, w: 76, h: 98 },
  { id: 'rec', label: '🔴 Rec', color: '#831843', x: 256, y: 382, w: 76, h: 98 },
  { id: 'dailies', label: '🎞️ Take', color: '#6d28d9', x: 338, y: 382, w: 76, h: 98 },
  { id: 'wheel', label: '⚙️ Menu', color: '#312e81', x: 420, y: 382, w: 82, h: 98 },
];

const TRANSPORT_BUTTONS: SmartwatchButton[] = [
  { id: 'step-back', label: '|< -1F', color: '#1e293b', x: 32, y: 260, w: 98, h: 42 },
  { id: 'step-fwd', label: '+1F >|', color: '#1e293b', x: 138, y: 260, w: 98, h: 42 },
  { id: 'loop-toggle', label: '🔁 Loop', color: '#1e293b', x: 244, y: 260, w: 108, h: 42 },
  { id: 'rate-cycle', label: '1.0x', color: '#1e293b', x: 360, y: 260, w: 120, h: 42 },
];

const SCRUB_BAR_RECT = { x: 32, y: 322, w: 448, h: 26 };

const _vTip = new THREE.Vector3();
const _localTip = new THREE.Vector3();

export class DirectorSmartwatch {
  readonly group = new THREE.Group();
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private screenMesh: THREE.Mesh;

  private lastTouchTime = 0;
  private hoverButtonId: string | null = null;
  /** Signature of the last painted face; see renderCanvas for why this exists. */
  private lastRenderSignature = '';

  onPress?: (buttonId: string, value?: number) => void;
  onScrub?: (normalizedRatio: number) => void;

  constructor() {
    // 1. Chassis geometry (sleek curved smartwatch frame)
    const chassisGeo = new THREE.BoxGeometry(0.12, 0.12, 0.015);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.8,
      roughness: 0.2,
    });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    this.group.add(chassis);

    // Bezel outline
    const bevelGeo = new THREE.BoxGeometry(0.116, 0.116, 0.017);
    const bevelMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      metalness: 0.9,
      roughness: 0.1,
    });
    const bevel = new THREE.Mesh(bevelGeo, bevelMat);
    this.group.add(bevel);

    // 2. High-res screen canvas
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 512;
      this.canvas.height = 512;
      this.ctx = this.canvas.getContext('2d')!;

      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.minFilter = THREE.LinearFilter;
    } else {
      this.canvas = {} as any;
      this.ctx = {} as any;
      this.texture = new THREE.Texture() as unknown as THREE.CanvasTexture;
    }

    const screenGeo = new THREE.PlaneGeometry(0.11, 0.11);
    const screenMat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
    });
    this.screenMesh = new THREE.Mesh(screenGeo, screenMat);
    this.screenMesh.position.z = 0.009;
    this.group.add(this.screenMesh);

    // Default position relative to left grip space
    this.group.position.set(0.0, 0.04, 0.08);
    this.group.rotation.x = -Math.PI * 0.35;
  }

  update(
    st: SmartwatchState,
    inputs: InputManager,
    now: number
  ): void {
    this.renderCanvas(st);

    // Touch interaction checking (right index fingertip against screen mesh plane)
    if (inputs.isHand('right')) {
      const tip = inputs.jointPosition('right', 'index-finger-tip', _vTip);
      if (tip) {
        // Transform tip into smartwatch local coordinates
        _localTip.copy(tip);
        this.screenMesh.worldToLocal(_localTip);

        // Screen is 0.11m x 0.11m; local bounds are x ∈ [-0.055, 0.055], y ∈ [-0.055, 0.055], z near 0
        if (Math.abs(_localTip.z) < 0.02 && Math.abs(_localTip.x) < 0.055 && Math.abs(_localTip.y) < 0.055) {
          // Convert local x,y (-0.055..0.055) to canvas pixel coordinates (0..512)
          const px = ((_localTip.x + 0.055) / 0.11) * 512;
          const py = ((0.055 - _localTip.y) / 0.11) * 512;

          // Check Scrub Bar
          if (
            px >= SCRUB_BAR_RECT.x &&
            px <= SCRUB_BAR_RECT.x + SCRUB_BAR_RECT.w &&
            py >= SCRUB_BAR_RECT.y - 10 &&
            py <= SCRUB_BAR_RECT.y + SCRUB_BAR_RECT.h + 10
          ) {
            const ratio = (px - SCRUB_BAR_RECT.x) / SCRUB_BAR_RECT.w;
            this.hoverButtonId = 'scrub';
            this.onScrub?.(Math.max(0, Math.min(1, ratio)));
            return;
          }

          // Check Transport Buttons
          for (const btn of TRANSPORT_BUTTONS) {
            if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
              this.hoverButtonId = btn.id;
              if (now - this.lastTouchTime > 0.28) {
                this.lastTouchTime = now;
                this.onPress?.(btn.id);
              }
              return;
            }
          }

          // Check Quick Action Buttons
          for (const btn of QUICK_BUTTONS) {
            if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
              this.hoverButtonId = btn.id;
              if (now - this.lastTouchTime > 0.35) {
                this.lastTouchTime = now;
                this.onPress?.(btn.id);
              }
              return;
            }
          }
        } else {
          this.hoverButtonId = null;
        }
      }
    }
  }

  private renderCanvas(st: SmartwatchState): void {
    if (typeof document === 'undefined' || !this.ctx || !this.ctx.clearRect) return;

    // Repaint only when the face actually changes. This used to clear and redraw the
    // whole 512x512 canvas and set texture.needsUpdate on EVERY frame, which forces a
    // 1 MB RGBA re-upload to the GPU 72 times a second (~75 MB/s) for a watch face
    // that is usually identical frame to frame. Nothing gates it: the group is mounted
    // to the wrist permanently and its visibility is never toggled.
    //
    // The whole drawn output is a function of `st` plus `hoverButtonId` and nothing
    // else, so serialising those two is a complete signature. Serialising is used
    // rather than a hand-picked field list because a missed field would show a stale
    // face, which is a worse failure than the cost this avoids.
    const signature = `${this.hoverButtonId}|${JSON.stringify(st)}`;
    if (signature === this.lastRenderSignature) return;
    this.lastRenderSignature = signature;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, 512, 512);

    // Dark smartwatch glass background
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, 512, 512);

    // Top Status Bar
    ctx.fillStyle = st.recording ? '#831843' : '#121824';
    ctx.fillRect(0, 0, 512, 54);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`🎬 ${st.sceneName}`, 16, 36);

    ctx.textAlign = 'right';
    if (st.collabIsConnected) {
      ctx.fillStyle = '#60a5fa';
      ctx.fillText(`👥 ${st.collabPeerCount ?? 0} CREW`, 496, 36);
    } else {
      ctx.fillStyle = st.recording ? '#f43f5e' : (st.dailiesActive ? '#a855f7' : '#10b981');
      const statusText = st.recording
        ? `⏺ ${st.recordingClock}`
        : st.dailiesActive
          ? `DAILIES #${st.dailiesTakeNumber ?? 1}`
          : 'READY';
      ctx.fillText(statusText, 496, 36);
    }

    // Card 1: Active Camera Optics & Move (y: 62..192)
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(16, 62, 480, 130, 12);
    ctx.fill();

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`🎥 ${st.activeCamName}`, 32, 92);

    // Shot size framing badge
    if (st.shotSize) {
      const badgeText = `${st.shotSize}`;
      ctx.font = 'bold 16px monospace';
      const textW = ctx.measureText(badgeText).width;
      const bx = 464 - textW - 20;
      const by = 74;
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.roundRect(bx, by, textW + 20, 26, 8);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, bx + (textW + 20) / 2, by + 18);
    }

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Format: ${st.formatShort} · ${st.focalLengthMm}mm T${st.tStop.toFixed(1)}`, 32, 122);

    const focusText = st.focusTargetName
      ? `Focus: ${st.focusTargetName} (${st.focusDistanceM.toFixed(1)}m)`
      : `Focus: ${st.focusDistanceM.toFixed(1)}m`;
    ctx.fillText(focusText, 32, 150);

    // Continuity Warning Banner or Camera Move Tag
    const continuityWarn = st.lineOfActionCrossing
      ? '⚠️ 180° AXIS CROSS'
      : st.jumpCutWarning
      ? '⚠️ 30° JUMP CUT'
      : st.eyelineMismatchWarning
      ? '⚠️ EYELINE MISMATCH'
      : st.cameraInShotWarning
      ? '⚠️ IN FRUSTUM'
      : null;

    if (continuityWarn) {
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(continuityWarn, 32, 178);
    } else if (st.cameraMoveType || (st.cameraMarksCount && st.cameraMarksCount > 0)) {
      const moveStr = st.cameraMoveType ? st.cameraMoveType.toUpperCase() : 'STATIC';
      const moveTag = `🛤️ [${moveStr}] · ${st.cameraMarksCount ?? 0} Marks${st.lookAtTargetName ? ` · Lock: ${st.lookAtTargetName}` : ''}`;
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(moveTag, 32, 178);
    }

    // Card 2: 24fps SMPTE Timecode & Transport Slate (y: 200..366)
    ctx.fillStyle = st.isPlaying ? '#064e3b' : '#0f172a';
    ctx.beginPath();
    ctx.roundRect(16, 200, 480, 166, 12);
    ctx.fill();

    ctx.strokeStyle = st.isPlaying ? '#10b981' : '#334155';
    ctx.lineWidth = st.isPlaying ? 2 : 1;
    ctx.stroke();

    // SMPTE Timecode Display
    const tcNow = st.smpteTimecode ?? '00:00:00:00';
    const tcDur = st.smpteDuration ?? '00:00:00:00';
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 21px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`⏱️ ${tcNow} / ${tcDur}`, 32, 234);

    ctx.textAlign = 'right';
    ctx.fillStyle = st.isPlaying ? '#34d399' : '#94a3b8';
    ctx.font = 'bold 17px sans-serif';
    const playStatusLabel = st.isPlaying
      ? `▶ PLAY (${st.playbackRate ?? 1.0}x)`
      : `⏸ PAUSED`;
    ctx.fillText(playStatusLabel, 476, 234);

    // Transport Sub-Buttons [ |< -1F ] [ +1F >| ] [ 🔁 Loop ] [ 1.0x ]
    for (const btn of TRANSPORT_BUTTONS) {
      let label = btn.label;
      let btnColor = btn.color;
      if (btn.id === 'loop-toggle') {
        label = st.isLooping ? '🔁 Loop [ON]' : '🔁 Loop';
        btnColor = st.isLooping ? '#0f766e' : '#1e293b';
      } else if (btn.id === 'rate-cycle') {
        label = `⚡ ${st.playbackRate ?? 1.0}x`;
      }

      const isHover = this.hoverButtonId === btn.id;
      ctx.fillStyle = isHover ? '#3b82f6' : btnColor;
      ctx.beginPath();
      ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 8);
      ctx.fill();

      ctx.strokeStyle = isHover ? '#ffffff' : '#475569';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, btn.x + btn.w * 0.5, btn.y + btn.h * 0.5 + 5);
    }

    // Transport Scrub Slider Bar (y: 322..348)
    const norm = Math.max(0, Math.min(1, st.normalizedT ?? 0));
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(SCRUB_BAR_RECT.x, SCRUB_BAR_RECT.y, SCRUB_BAR_RECT.w, SCRUB_BAR_RECT.h, 6);
    ctx.fill();

    // Progress fill
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.roundRect(SCRUB_BAR_RECT.x, SCRUB_BAR_RECT.y, SCRUB_BAR_RECT.w * norm, SCRUB_BAR_RECT.h, 6);
    ctx.fill();

    // Draw Audio Cue markers along the scrub track
    if (st.audioCueMarkers && st.audioCueMarkers.length > 0) {
      for (const marker of st.audioCueMarkers) {
        const mx = SCRUB_BAR_RECT.x + SCRUB_BAR_RECT.w * Math.max(0, Math.min(1, marker.normTime));
        ctx.fillStyle = marker.color || '#46a758';
        ctx.fillRect(mx - 2, SCRUB_BAR_RECT.y - 4, 4, SCRUB_BAR_RECT.h + 8);
      }
    }

    // Playhead thumb
    const thumbX = SCRUB_BAR_RECT.x + SCRUB_BAR_RECT.w * norm;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(thumbX, SCRUB_BAR_RECT.y + SCRUB_BAR_RECT.h * 0.5, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Active Audio Cue or Mic Record Overlay Tag (y: 356)
    if (st.isRecordingScratch) {
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('🎙️ REC SCRATCH CUE...', 32, 368);
    } else if (st.activeAudioCueName) {
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`🔊 ${st.activeAudioCueName}`, 32, 368);
    } else if (st.audioCueCount && st.audioCueCount > 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`🎵 ${st.audioCueCount} Spatial Sound Cues`, 32, 368);
    }

    // Quick-Actions Touch Slate Grid (y: 382..480)
    for (const btn of QUICK_BUTTONS) {
      let label = btn.label;
      let btnColor = btn.color;
      if (btn.id === 'play') {
        label = st.isPlaying ? '⏸️ Pause' : '⏯️ Play';
        btnColor = st.isPlaying ? '#059669' : '#047857';
      } else if (btn.id === 'dailies') {
        label = st.dailiesActive ? '🎬 Live' : '🎞️ Take';
        btnColor = st.dailiesActive ? '#7c3aed' : '#6d28d9';
      }

      const isHover = this.hoverButtonId === btn.id;
      ctx.fillStyle = isHover ? '#2563eb' : btnColor;
      ctx.beginPath();
      ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 12);
      ctx.fill();

      ctx.strokeStyle = isHover ? '#ffffff' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = isHover ? 3 : 1;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, btn.x + btn.w * 0.5, btn.y + btn.h * 0.5 + 6);
    }

    this.texture.needsUpdate = true;
  }
}
