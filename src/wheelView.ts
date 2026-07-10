// ---------------------------------------------------------------------------
// Palm tool wheel renderer: a round canvas-texture disc in the left palm,
// drawing the current wheel.ts menu (root ring or a sub-wheel, hub = mode /
// Back). Two input paths share the same hover + press pipeline:
//   controllers — point at it and pull the trigger (like the wrist panel);
//   hands       — tap a sector with the RIGHT index fingertip (touchAt).
// main.ts owns the menu path, summons the wheel by gaze, and routes presses.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { sectorAngle, touchWheel, type TouchState, wheelHit, type WheelMenu } from './wheel.ts';

const CANVAS_PX = 480;
const WORLD_D = 0.16; // meters — wheel diameter in the palm

const _local = new THREE.Vector3();

export class WheelPanel {
  readonly group = new THREE.Group();
  onPress: (id: string) => void = () => {};

  private mesh: THREE.Mesh;
  private canvas: HTMLCanvasElement;
  private ctx2d: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private menu: WheelMenu = { hub: { id: 'wheel-mode', label: 'BLOCK', sub: '' }, sectors: [] };
  private hover: number | 'hub' | null = null;
  private dirty = true;
  private raycastHits: THREE.Intersection[] = [];
  private touchState: TouchState = { armed: false };

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

  /** Swaps the displayed menu (root or sub-wheel); redraws only on change. */
  setMenu(menu: WheelMenu): void {
    const a = this.menu;
    if (
      a.hub.id !== menu.hub.id ||
      a.hub.label !== menu.hub.label ||
      a.hub.sub !== menu.hub.sub ||
      a.sectors.length !== menu.sectors.length ||
      menu.sectors.some((s, i) => s.id !== a.sectors[i].id || s.label !== a.sectors[i].label)
    ) {
      this.menu = menu;
      this.hover = null;
      this.dirty = true;
    }
  }

  /** Per-frame ray hover (controllers); true while the pointer engages it. */
  update(ray: THREE.Raycaster | null): boolean {
    let newHover: number | 'hub' | null = null;
    let onWheel = false;
    if (ray && this.group.visible) {
      this.raycastHits.length = 0;
      const hit = ray.intersectObject(this.mesh, false, this.raycastHits)[0];
      if (hit?.uv) {
        newHover = wheelHit(hit.uv.x, 1 - hit.uv.y, this.menu.sectors.length);
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

  /**
   * Fingertip interaction (hands): feed the RIGHT index tip world position;
   * hovers the touched sector and fires onPress on the push-down edge.
   * Returns true while the tip is over the disc (callers suppress pinch
   * placement behind the wheel). Call INSTEAD of update() when a tip exists.
   */
  touchAt(tipWorld: THREE.Vector3 | null): boolean {
    if (!this.group.visible || !tipWorld) return this.update(null);
    this.mesh.updateMatrixWorld();
    _local.copy(tipWorld);
    this.mesh.worldToLocal(_local);
    const sample = touchWheel(this.touchState, _local.x, _local.y, _local.z, WORLD_D / 2);
    let newHover: number | 'hub' | null = null;
    if (sample) {
      newHover = wheelHit(sample.u, sample.v, this.menu.sectors.length);
      if (sample.pressed && newHover !== null) this.pressAt(newHover);
    }
    if (newHover !== this.hover) {
      this.hover = newHover;
      this.dirty = true;
    }
    if (this.dirty) this.draw();
    return sample !== null;
  }

  /** Trigger-down routing (controllers); true when the wheel consumed it. */
  handleTriggerDown(): boolean {
    if (this.hover === null || !this.group.visible) return false;
    this.pressAt(this.hover);
    return true;
  }

  private pressAt(target: number | 'hub'): void {
    if (target === 'hub') this.onPress(this.menu.hub.id);
    else if (this.menu.sectors[target]) this.onPress(this.menu.sectors[target].id);
  }

  private draw(): void {
    this.dirty = false;
    const ctx = this.ctx2d;
    const S = CANVAS_PX;
    const c = S / 2;
    const ringR = 0.98 * c;
    const hubR = 0.3 * c;
    ctx.clearRect(0, 0, S, S);

    const n = this.menu.sectors.length;
    const step = (Math.PI * 2) / Math.max(1, n);
    this.menu.sectors.forEach((sector, i) => {
      // Canvas arcs measure from 3 o'clock; our centers from 12, clockwise.
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

    // Hub: mode at root (tap to switch), Back inside a sub-wheel.
    ctx.beginPath();
    ctx.arc(c, c, hubR, 0, Math.PI * 2);
    ctx.fillStyle = this.hover === 'hub' ? '#2e5bd7' : '#141821';
    ctx.fill();
    ctx.strokeStyle = this.hover === 'hub' ? '#8ab4ff' : '#39415a';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#8ab4ff';
    ctx.font = '700 24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.menu.hub.label, c, c - 9);
    ctx.fillStyle = '#9aa3b2';
    ctx.font = '500 14px system-ui, sans-serif';
    ctx.fillText(this.menu.hub.sub, c, c + 15);

    this.texture.needsUpdate = true;
  }
}
