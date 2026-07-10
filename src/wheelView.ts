// ---------------------------------------------------------------------------
// Hand tool wheel renderer: a round canvas-texture panel above the left
// wrist, drawing wheel.ts sectors as wedges with a mode hub. Same interaction
// contract as UIPanel (ray hover + trigger press); main.ts summons it by
// gaze (wheel.ts gazeEngaged) and routes presses.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { HUB_R, RING_R, sectorAngle, wheelHit, type WheelContext, wheelSectors } from './wheel.ts';

const CANVAS_PX = 480;
const WORLD_D = 0.16; // meters — wheel diameter at the wrist

export class WheelPanel {
  readonly group = new THREE.Group();
  onPress: (id: string) => void = () => {};

  private mesh: THREE.Mesh;
  private canvas: HTMLCanvasElement;
  private ctx2d: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private sectors = wheelSectors({
    mode: 'block',
    placeMode: 'actor',
    viewMode: 'full',
    playing: false,
    recording: false,
    hasScan: false,
    locationMode: 'hidden',
  });
  private hubLabel = 'BLOCK';
  private hover: number | 'hub' | null = null;
  private dirty = true;
  private raycastHits: THREE.Intersection[] = [];

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_PX;
    this.canvas.height = CANVAS_PX;
    this.ctx2d = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_D, WORLD_D),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.renderOrder = 31; // over the detail panel when both show
    this.group.add(this.mesh);
    this.draw();
  }

  /** Re-derives sectors + hub from app state; redraws only on change. */
  setContext(ctx: WheelContext): void {
    const next = wheelSectors(ctx);
    const hub = ctx.mode.toUpperCase();
    if (
      hub !== this.hubLabel ||
      next.length !== this.sectors.length ||
      next.some((s, i) => s.id !== this.sectors[i].id || s.label !== this.sectors[i].label)
    ) {
      this.sectors = next;
      this.hubLabel = hub;
      this.dirty = true;
    }
  }

  /** Per-frame hover; returns true while the pointer engages the wheel. */
  update(ray: THREE.Raycaster | null): boolean {
    let newHover: number | 'hub' | null = null;
    let onWheel = false;
    if (ray && this.group.visible) {
      this.raycastHits.length = 0;
      const hit = ray.intersectObject(this.mesh, false, this.raycastHits)[0];
      if (hit?.uv) {
        newHover = wheelHit(hit.uv.x, 1 - hit.uv.y, this.sectors.length);
        onWheel = newHover !== null;
      }
    }
    if (newHover !== this.hover) {
      this.hover = newHover;
      this.dirty = true;
    }
    if (this.dirty) this.draw();
    return onWheel;
  }

  /** Trigger-down routing; true when the wheel consumed the press. */
  handleTriggerDown(): boolean {
    if (this.hover === null || !this.group.visible) return false;
    if (this.hover === 'hub') this.onPress('wheel-mode');
    else this.onPress(this.sectors[this.hover].id);
    return true;
  }

  private draw(): void {
    this.dirty = false;
    const ctx = this.ctx2d;
    const S = CANVAS_PX;
    const c = S / 2;
    const ringR = (RING_R * S) / 2;
    const hubR = (HUB_R * S) / 2;
    ctx.clearRect(0, 0, S, S);

    const n = this.sectors.length;
    const step = (Math.PI * 2) / Math.max(1, n);
    this.sectors.forEach((sector, i) => {
      // Canvas arcs measure from 3 o'clock CCW-negative; our sector centers
      // are from 12 o'clock clockwise → canvas angle = center - π/2.
      const a0 = sectorAngle(i, n) - Math.PI / 2 - step / 2;
      const hovered = this.hover === i;
      ctx.beginPath();
      ctx.arc(c, c, ringR - 2, a0, a0 + step);
      ctx.arc(c, c, hubR + 6, a0 + step, a0, true);
      ctx.closePath();
      ctx.fillStyle = hovered ? '#2e5bd7' : 'rgba(13, 16, 22, 0.92)';
      ctx.fill();
      ctx.strokeStyle = hovered ? '#8ab4ff' : '#2a3140';
      ctx.lineWidth = hovered ? 3 : 2;
      ctx.stroke();

      const mid = sectorAngle(i, n);
      const lr = (ringR + hubR) / 2 + 4;
      const lx = c + Math.sin(mid) * lr;
      const ly = c - Math.cos(mid) * lr;
      ctx.fillStyle = hovered ? '#ffffff' : '#d7dce4';
      ctx.font = '600 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = sector.label.split('\n');
      lines.forEach((l, li) => {
        ctx.fillText(l, lx, ly + (li - (lines.length - 1) / 2) * 24);
      });
    });

    // Hub: current mode; pressing it (or sector 0) switches.
    ctx.beginPath();
    ctx.arc(c, c, hubR, 0, Math.PI * 2);
    ctx.fillStyle = this.hover === 'hub' ? '#2e5bd7' : '#141821';
    ctx.fill();
    ctx.strokeStyle = this.hover === 'hub' ? '#8ab4ff' : '#39415a';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#8ab4ff';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.hubLabel, c, c - 8);
    ctx.fillStyle = '#9aa3b2';
    ctx.font = '500 15px system-ui, sans-serif';
    ctx.fillText('mode', c, c + 16);

    this.texture.needsUpdate = true;
  }
}
