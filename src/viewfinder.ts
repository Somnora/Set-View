// ---------------------------------------------------------------------------
// Two-Hand Viewfinder Gesture & Spatial Camera Stamping
//  - Detects when user forms a viewfinder box with both hands in front of eyes.
//  - Computes exact framing vector, width, and focal length (18mm-135mm).
//  - Displays 3D AR viewfinder brackets, aspect frame, and live optics readout.
//  - Stamps a new CineCameraActor upon steady 0.8s hold or pinch trigger.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { InputManager } from './input.ts';

export interface ViewfinderState {
  active: boolean;
  center: THREE.Vector3;
  direction: THREE.Vector3;
  widthM: number;
  heightM: number;
  focalLengthMm: number;
  progress: number; // 0.0 to 1.0 hold progress
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _head = new THREE.Vector3();

const STANDARD_PRIMES = [18, 24, 35, 50, 85, 100, 135];

/**
 * Computes estimated focal length (mm) for a Super35 sensor given hand frame width (m)
 * and distance from eye/head position (m).
 */
export function computeViewfinderFocalLength(
  frameWidthM: number,
  distanceFromEyeM: number,
  sensorWidthMm = 24.89
): number {
  if (frameWidthM <= 0.02 || distanceFromEyeM <= 0.1) return 35; // default fallback
  const halfFovRad = Math.atan((frameWidthM * 0.5) / distanceFromEyeM);
  if (halfFovRad <= 0.01) return 135;
  const f = sensorWidthMm / (2 * Math.tan(halfFovRad));
  // Snap near standard prime lenses if within 5%
  for (const prime of STANDARD_PRIMES) {
    if (Math.abs(f - prime) < prime * 0.08) return prime;
  }
  return Math.max(16, Math.min(135, Math.round(f)));
}

/**
 * Checks if two-hand joint positions form a valid viewfinder framing gesture in front of headset eyes.
 */
export function evaluateViewfinderGesture(
  leftIndexTip: THREE.Vector3 | null,
  leftThumbTip: THREE.Vector3 | null,
  rightIndexTip: THREE.Vector3 | null,
  rightThumbTip: THREE.Vector3 | null,
  headPos: THREE.Vector3
): ViewfinderState | null {
  if (!leftIndexTip || !leftThumbTip || !rightIndexTip || !rightThumbTip) return null;

  // Frame center is midpoint between left index and right index
  const center = new THREE.Vector3().addVectors(leftIndexTip, rightIndexTip).multiplyScalar(0.5);

  // Distance from head/eyes to frame center
  const distToHead = center.distanceTo(headPos);
  if (distToHead < 0.18 || distToHead > 0.85) return null; // must be comfortably in front of face

  // Check frame dimensions
  const widthM = leftIndexTip.distanceTo(rightIndexTip);
  const leftHandSpan = leftIndexTip.distanceTo(leftThumbTip);
  const rightHandSpan = rightIndexTip.distanceTo(rightThumbTip);

  if (widthM < 0.08 || widthM > 0.55) return null; // reasonable hand span
  if (leftHandSpan < 0.02 || rightHandSpan < 0.02) return null;

  // Direction vector from eyes through frame center
  _dir.subVectors(center, headPos).normalize();

  const heightM = (leftHandSpan + rightHandSpan) * 0.5;
  const focalLengthMm = computeViewfinderFocalLength(widthM, distToHead);

  return {
    active: true,
    center,
    direction: _dir.clone(),
    widthM,
    heightM,
    focalLengthMm,
    progress: 0,
  };
}

export class ViewfinderRig {
  readonly group = new THREE.Group();
  private brackets: THREE.LineSegments;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private hudMesh: THREE.Mesh;
  private hudTexture: THREE.CanvasTexture;

  private active = false;
  private holdTimer = 0;
  private lastState: ViewfinderState | null = null;

  get isGestureActive(): boolean { return this.active; }
  get state(): ViewfinderState | null { return this.lastState; }

  onStampCamera?: (pos: THREE.Vector3, dir: THREE.Vector3, focalMm: number) => void;

  constructor() {
    this.group.visible = false;

    // 1. Bracket geometry (corner reticles for 16:9 frame)
    const bracketGeo = new THREE.BufferGeometry();
    const positions: number[] = [];

    // Top-Left corner
    positions.push(-0.1, 0.06, 0, -0.06, 0.06, 0);
    positions.push(-0.1, 0.06, 0, -0.1, 0.02, 0);
    // Top-Right corner
    positions.push(0.1, 0.06, 0, 0.06, 0.06, 0);
    positions.push(0.1, 0.06, 0, 0.1, 0.02, 0);
    // Bottom-Left corner
    positions.push(-0.1, -0.06, 0, -0.06, -0.06, 0);
    positions.push(-0.1, -0.06, 0, -0.1, -0.02, 0);
    // Bottom-Right corner
    positions.push(0.1, -0.06, 0, 0.06, -0.06, 0);
    positions.push(0.1, -0.06, 0, 0.1, -0.02, 0);

    bracketGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 2, transparent: true, opacity: 0.9 });
    this.brackets = new THREE.LineSegments(bracketGeo, mat);
    this.group.add(this.brackets);

    // 2. HUD text canvas above the frame
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 512;
      this.canvas.height = 128;
      this.ctx = this.canvas.getContext('2d')!;
      this.hudTexture = new THREE.CanvasTexture(this.canvas);
      this.hudTexture.minFilter = THREE.LinearFilter;
    } else {
      this.canvas = {} as any;
      this.ctx = {} as any;
      this.hudTexture = new THREE.Texture() as unknown as THREE.CanvasTexture;
    }

    const hudGeo = new THREE.PlaneGeometry(0.24, 0.06);
    const hudMat = new THREE.MeshBasicMaterial({
      map: this.hudTexture,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    this.hudMesh = new THREE.Mesh(hudGeo, hudMat);
    this.hudMesh.position.set(0, 0.08, 0);
    this.group.add(this.hudMesh);
  }

  update(
    inputs: InputManager,
    camera: THREE.Camera,
    dt: number
  ): void {
    if (!inputs.isHand('left') || !inputs.isHand('right')) {
      this.active = false;
      this.group.visible = false;
      this.holdTimer = 0;
      return;
    }

    const lIndex = inputs.jointPosition('left', 'index-finger-tip', _v1);
    const lThumb = inputs.jointPosition('left', 'thumb-tip', _v2);
    const rIndex = inputs.jointPosition('right', 'index-finger-tip', _v3);
    const rThumb = inputs.jointPosition('right', 'thumb-tip', _v4);

    camera.getWorldPosition(_head);

    const state = evaluateViewfinderGesture(lIndex, lThumb, rIndex, rThumb, _head);

    if (!state) {
      this.active = false;
      this.group.visible = false;
      this.holdTimer = 0;
      return;
    }

    this.active = true;
    this.group.visible = true;
    this.lastState = state;

    // Position and orient 3D viewfinder reticle at frame center looking away from eyes
    this.group.position.copy(state.center);
    const lookTarget = _v1.copy(state.center).add(state.direction);
    this.group.lookAt(lookTarget);

    // Scale brackets to hand span width
    const s = Math.max(0.6, Math.min(2.5, state.widthM / 0.2));
    this.brackets.scale.set(s, s, 1);

    // Accumulate hold timer for auto-stamping
    this.holdTimer += dt;
    state.progress = Math.min(1.0, this.holdTimer / 0.8);

    this.drawHud(state);

    // Stamp camera upon full hold
    if (this.holdTimer >= 0.8) {
      this.onStampCamera?.(_head.clone(), state.direction.clone(), state.focalLengthMm);
      this.holdTimer = -0.5; // Cooldown beat
    }
  }

  private drawHud(st: ViewfinderState): void {
    if (typeof document === 'undefined' || !this.ctx || !this.ctx.clearRect) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 512, 128);

    // Dark pill background
    ctx.fillStyle = 'rgba(10, 15, 25, 0.85)';
    ctx.beginPath();
    ctx.roundRect(16, 8, 480, 112, 16);
    ctx.fill();

    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Text: Focal length & format
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`🎥 ${st.focalLengthMm}mm T2.0 (S35)`, 256, 52);

    // Progress bar or hold prompt
    if (st.progress > 0) {
      ctx.fillStyle = 'rgba(0, 240, 255, 0.3)';
      ctx.fillRect(40, 80, 432, 18);

      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(40, 80, 432 * st.progress, 18);
    } else {
      ctx.fillStyle = '#3b82f6';
      ctx.font = '22px sans-serif';
      ctx.fillText('HOLD STEADY TO STAMP CAMERA', 256, 92);
    }

    this.hudTexture.needsUpdate = true;
  }
}
