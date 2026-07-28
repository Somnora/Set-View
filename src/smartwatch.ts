// ---------------------------------------------------------------------------
// Director's Smartwatch Slate (3D Wrist HUD & Quick-Actions Slate)
//  - Attached directly to left wrist/grip space.
//  - Displays live scene stats, active camera specs, take recording clock.
//  - Features interactive 1-tap touch slate buttons:
//      [🎥 Cam] [🔴 Rec] [🎯 Focus] [⚙️ Wheel] [🎬 AI]
//  - Accepts direct right index fingertip taps or right controller pointer.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { InputManager } from './input.ts';

export interface SmartwatchState {
  sceneName: string;
  activeCamName: string;
  focalLengthMm: number;
  tStop: number;
  formatShort: string;
  focusDistanceM: number;
  focusTargetName?: string;
  recording: boolean;
  recordingClock: string;
  audioActive: boolean;
  takeCount: number;
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

const BUTTONS: SmartwatchButton[] = [
  { id: 'cam', label: '🎥 Cam', color: '#1e3a8a', x: 16, y: 380, w: 90, h: 100 },
  { id: 'rec', label: '🔴 Rec', color: '#831843', x: 114, y: 380, w: 90, h: 100 },
  { id: 'focus', label: '🎯 Focus', color: '#14532d', x: 212, y: 380, w: 90, h: 100 },
  { id: 'wheel', label: '⚙️ Wheel', color: '#312e81', x: 310, y: 380, w: 90, h: 100 },
  { id: 'ai', label: '🎬 AI', color: '#701a75', x: 408, y: 380, w: 88, h: 100 },
];

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

  onPress?: (buttonId: string) => void;

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

          for (const btn of BUTTONS) {
            if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
              this.hoverButtonId = btn.id;
              if (now - this.lastTouchTime > 0.35) {
                this.lastTouchTime = now;
                this.onPress?.(btn.id);
              }
              break;
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
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 512, 512);

    // Dark smartwatch glass background
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, 512, 512);

    // Top Status Bar
    ctx.fillStyle = st.recording ? '#831843' : '#121824';
    ctx.fillRect(0, 0, 512, 64);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`🎬 ${st.sceneName}`, 16, 42);

    ctx.textAlign = 'right';
    ctx.fillStyle = st.recording ? '#f43f5e' : '#10b981';
    ctx.fillText(st.recording ? `⏺ ${st.recordingClock}` : 'READY', 496, 42);

    // Active Camera Display Card
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(16, 80, 480, 150, 16);
    ctx.fill();

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`🎥 ${st.activeCamName}`, 32, 116);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '22px sans-serif';
    ctx.fillText(`Format: ${st.formatShort} · ${st.focalLengthMm}mm T${st.tStop.toFixed(1)}`, 32, 152);

    const focusText = st.focusTargetName ? `Focus: ${st.focusTargetName} (${st.focusDistanceM.toFixed(1)}m)` : `Focus: ${st.focusDistanceM.toFixed(1)}m`;
    ctx.fillText(focusText, 32, 188);

    // Secondary Info Bar
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(16, 246, 480, 116, 12);
    ctx.fill();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px sans-serif';
    ctx.fillText(`Mic Audio: ${st.audioActive ? '🟢 Active' : '🔇 Off'}`, 32, 282);
    ctx.fillText(`Takes Recorded: ${st.takeCount}`, 32, 320);

    // Quick-Actions Touch Slate Grid
    for (const btn of BUTTONS) {
      const isHover = this.hoverButtonId === btn.id;
      ctx.fillStyle = isHover ? '#2563eb' : btn.color;
      ctx.beginPath();
      ctx.roundRect(btn.x, btn.y, btn.w, btn.h, 12);
      ctx.fill();

      ctx.strokeStyle = isHover ? '#ffffff' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = isHover ? 3 : 1;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(btn.label, btn.x + btn.w * 0.5, btn.y + btn.h * 0.5 + 7);
    }

    this.texture.needsUpdate = true;
  }
}
