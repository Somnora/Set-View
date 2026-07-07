// ---------------------------------------------------------------------------
// All UI: canvas text sprites, the wrist menu panel, debug log/board, drift
// grid marker, the 2D landing page (DOM), and the dom-overlay note editor.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import type { SupportReport } from './session.ts';
import {
  ASPECT_NAMES,
  SENSOR_FORMATS,
  TRIPOD_HEIGHTS,
  type CameraSetupData,
  type SceneData,
} from './model.ts';
import { STANCES, type StanceId } from './pose.ts';

// --- shared helpers ---------------------------------------------------------

export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    // Sprites share a single module-level geometry in three.js — disposing it
    // would free the VBO out from under every other live sprite. Only their
    // per-instance material + texture are ours to release.
    if (mesh.geometry && !(o as unknown as { isSprite?: boolean }).isSprite) mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      const anyM = m as THREE.Material & { map?: THREE.Texture | null };
      anyM.map?.dispose();
      m.dispose();
    }
  });
}

/** Disposes a Sprite's material + texture (its geometry is shared — leave it). */
export function disposeSprite(sprite: THREE.Sprite): void {
  const mat = sprite.material as THREE.SpriteMaterial;
  mat.map?.dispose();
  mat.dispose();
}

export interface LabelStyle {
  fontPx?: number;
  fg?: string;
  bg?: string;
  mono?: boolean;
  /** wrap text at this pixel width (enables multiline) */
  maxWidthPx?: number;
}

export interface Label {
  sprite: THREE.Sprite;
  setText: (text: string, style?: LabelStyle) => void;
}

/**
 * Billboarded canvas-texture text sprite. `worldHeight` is the rendered
 * height in meters of a single line; multiline labels grow proportionally.
 */
export function makeLabel(text: string, worldHeight: number, style: LabelStyle = {}): Label {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 20;

  let currentStyle = style;
  const draw = (t: string, s: LabelStyle = currentStyle) => {
    currentStyle = s;
    const fontPx = s.fontPx ?? 44;
    const font = `600 ${fontPx}px ${s.mono ? 'ui-monospace, monospace' : 'system-ui, sans-serif'}`;
    const padX = fontPx * 0.5;
    const padY = fontPx * 0.3;
    ctx.font = font;
    const rawLines = t.split('\n');
    const lines: string[] = [];
    for (const raw of rawLines) {
      if (!s.maxWidthPx) {
        lines.push(raw);
        continue;
      }
      let line = '';
      for (const word of raw.split(' ')) {
        const probe = line ? `${line} ${word}` : word;
        if (ctx.measureText(probe).width > s.maxWidthPx && line) {
          lines.push(line);
          line = word;
        } else line = probe;
      }
      lines.push(line);
    }
    const lineH = fontPx * 1.25;
    const textW = Math.max(...lines.map((l) => ctx.measureText(l).width), 1);
    canvas.width = Math.ceil(textW + padX * 2);
    canvas.height = Math.ceil(lines.length * lineH + padY * 2);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (s.bg !== 'none') {
      ctx.fillStyle = s.bg ?? 'rgba(12, 14, 18, 0.82)';
      ctx.beginPath();
      ctx.roundRect(0, 0, canvas.width, canvas.height, fontPx * 0.35);
      ctx.fill();
    }
    ctx.font = font;
    ctx.fillStyle = s.fg ?? '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    lines.forEach((l, i) => ctx.fillText(l, padX, padY + lineH * (i + 0.5)));
    texture.needsUpdate = true;
    const h = worldHeight * lines.length;
    sprite.scale.set((h * canvas.width) / canvas.height / lines.length, h, 1);
  };
  draw(text, style);
  return { sprite, setText: draw };
}

// --- debug log ---------------------------------------------------------------

export class DebugLog {
  lines: string[] = [];
  fps = 0;
  private listeners: (() => void)[] = [];

  log(msg: string): void {
    const t = new Date();
    const stamp = `${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
    this.lines.push(`${stamp} ${msg}`);
    if (this.lines.length > 14) this.lines.shift();
    console.log(`[setview] ${msg}`);
    for (const l of this.listeners) l();
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  tail(n: number): string[] {
    return this.lines.slice(-n);
  }
}

/** 1 m grid marker + axes + floating debug readout, for the drift-loop test. */
export class DriftMarker {
  readonly group: THREE.Group;
  private board: Label;
  private debug: DebugLog;
  private lastDraw = 0;

  constructor(debug: DebugLog) {
    this.debug = debug;
    this.group = new THREE.Group();
    const grid = new THREE.GridHelper(1, 10, 0x00ffcc, 0x2a6f66);
    grid.position.y = 0.003;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.9;
    const axes = new THREE.AxesHelper(0.35);
    axes.position.y = 0.004;
    this.board = makeLabel('drift test', 0.032, { mono: true, fontPx: 30 });
    this.board.sprite.position.set(0, 1.35, 0);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 1.1, 6),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc }),
    );
    pole.position.y = 0.55;
    this.group.add(grid, axes, pole, this.board.sprite);
    this.group.visible = false;
  }

  /** Call each frame; redraws the readout at ~4 Hz. */
  update(time: number): void {
    if (!this.group.visible || time - this.lastDraw < 250) return;
    this.lastDraw = time;
    const lines = [
      'DRIFT TEST — walk a loop, watch this grid',
      `fps ${this.debug.fps.toFixed(0)}`,
      ...this.debug.tail(10),
    ];
    this.board.setText(lines.join('\n'), { mono: true, fontPx: 30 });
  }
}

// --- wrist panel --------------------------------------------------------------

interface PanelItem {
  id: string;
  label: string;
  flex?: number;
  slider?: boolean;
}

interface HitRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  item: PanelItem;
}

const PANEL_W = 480;
const ROW_H = 56;
const GAP = 10;
const PAD = 14;

export class UIPanel {
  readonly group: THREE.Group;
  onPress: (id: string) => void = () => {};
  onSlider: (id: string, v: number) => void = () => {};

  private mesh: THREE.Mesh;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private rows: PanelItem[][];
  private regions: HitRegion[] = [];
  private toggles = new Map<string, boolean>();
  private labels = new Map<string, string>();
  private sliders = new Map<string, number>();
  private hover: string | null = null;
  private sliderDrag: string | null = null;
  private status = '';
  private debugLines: string[] = [];
  private dirty = true;
  private raycastHits: THREE.Intersection[] = [];

  constructor(rows: PanelItem[][]) {
    this.rows = rows;
    for (const row of rows)
      for (const item of row) {
        this.labels.set(item.id, item.label);
        if (item.slider) this.sliders.set(item.id, 0);
      }
    const height = PAD + 40 + rows.length * (ROW_H + GAP) + 26 + 3 * 22 + PAD;
    this.canvas = document.createElement('canvas');
    this.canvas.width = PANEL_W;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const worldW = 0.17;
    const worldH = (worldW * height) / PANEL_W;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(worldW, worldH),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide, // readable at any wrist angle
      }),
    );
    this.mesh.renderOrder = 30;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.draw();
  }

  setToggle(id: string, on: boolean): void {
    if (this.toggles.get(id) !== on) {
      this.toggles.set(id, on);
      this.dirty = true;
    }
  }

  setLabel(id: string, label: string): void {
    if (this.labels.get(id) !== label) {
      this.labels.set(id, label);
      this.dirty = true;
    }
  }

  setSlider(id: string, v: number): void {
    const c = Math.min(1, Math.max(0, v));
    if (Math.abs((this.sliders.get(id) ?? 0) - c) > 0.002) {
      this.sliders.set(id, c);
      this.dirty = true;
    }
  }

  setStatus(s: string): void {
    if (this.status !== s) {
      this.status = s;
      this.dirty = true;
    }
  }

  setDebug(lines: string[]): void {
    const next = lines.slice(-3);
    if (next.join('|') !== this.debugLines.join('|')) {
      this.debugLines = next;
      this.dirty = true;
    }
  }

  /**
   * Per-frame pointer processing. Returns true when the pointer is engaged
   * with the panel (hovering or slider-dragging) so callers suppress world
   * interactions behind it.
   */
  update(ray: THREE.Raycaster | null, triggerHeld: boolean): boolean {
    let onPanel = false;
    let newHover: string | null = null;
    if (ray && this.group.visible) {
      this.raycastHits.length = 0;
      const hit = ray.intersectObject(this.mesh, false, this.raycastHits)[0];
      if (hit?.uv) {
        onPanel = true;
        const px = hit.uv.x * this.canvas.width;
        const py = (1 - hit.uv.y) * this.canvas.height;
        const region = this.regionAt(px, py);
        newHover = region?.item.id ?? null;
        if (this.sliderDrag && triggerHeld) {
          const r = this.regions.find((q) => q.item.id === this.sliderDrag);
          if (r) {
            const v = (px - r.x - 14) / (r.w - 28);
            this.setSlider(this.sliderDrag, v);
            this.onSlider(this.sliderDrag, Math.min(1, Math.max(0, v)));
          }
        }
      }
    }
    if (!triggerHeld) this.sliderDrag = null;
    if (newHover !== this.hover) {
      this.hover = newHover;
      this.dirty = true;
    }
    if (this.dirty) this.draw();
    return onPanel || this.sliderDrag !== null;
  }

  /** Route a trigger-down here first; returns true if the panel consumed it. */
  handleTriggerDown(): boolean {
    if (!this.hover || !this.group.visible) return false;
    const region = this.regions.find((r) => r.item.id === this.hover);
    if (!region) return false;
    if (region.item.slider) {
      this.sliderDrag = region.item.id;
    } else {
      this.onPress(region.item.id);
    }
    return true;
  }

  private regionAt(px: number, py: number): HitRegion | null {
    for (const r of this.regions) {
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r;
    }
    return null;
  }

  private draw(): void {
    this.dirty = false;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(13, 16, 22, 0.92)';
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, 22);
    ctx.fill();

    ctx.fillStyle = '#8ab4ff';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('SETVIEW', PAD, PAD + 16);
    ctx.fillStyle = '#9aa3b2';
    ctx.font = '500 19px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(this.status, canvas.width - PAD, PAD + 16);

    this.regions = [];
    let y = PAD + 40;
    for (const row of this.rows) {
      const totalFlex = row.reduce((s, item) => s + (item.flex ?? 1), 0);
      const avail = canvas.width - PAD * 2 - GAP * (row.length - 1);
      let x = PAD;
      for (const item of row) {
        const w = (avail * (item.flex ?? 1)) / totalFlex;
        this.regions.push({ x, y, w, h: ROW_H, item });
        if (item.slider) this.drawSlider(x, y, w, item);
        else this.drawButton(x, y, w, item);
        x += w + GAP;
      }
      y += ROW_H + GAP;
    }

    ctx.fillStyle = '#6b7484';
    ctx.font = '400 17px ui-monospace, monospace';
    ctx.textAlign = 'left';
    this.debugLines.forEach((l, i) => {
      ctx.fillText(l.slice(0, 46), PAD, y + 14 + i * 22);
    });
  }

  private drawButton(x: number, y: number, w: number, item: PanelItem): void {
    const { ctx } = this;
    const on = this.toggles.get(item.id) === true;
    const hovered = this.hover === item.id;
    ctx.fillStyle = on ? '#2e5bd7' : hovered ? '#3a4356' : '#232936';
    ctx.beginPath();
    ctx.roundRect(x, y, w, ROW_H, 12);
    ctx.fill();
    if (hovered) {
      ctx.strokeStyle = '#8ab4ff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = on ? '#ffffff' : '#d7dce4';
    ctx.font = '600 21px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.labels.get(item.id) ?? item.label, x + w / 2, y + ROW_H / 2);
  }

  private drawSlider(x: number, y: number, w: number, item: PanelItem): void {
    const { ctx } = this;
    const v = this.sliders.get(item.id) ?? 0;
    const trackY = y + ROW_H / 2;
    ctx.fillStyle = '#232936';
    ctx.beginPath();
    ctx.roundRect(x, y, w, ROW_H, 12);
    ctx.fill();
    ctx.strokeStyle = '#4a5468';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 14, trackY);
    ctx.lineTo(x + w - 14, trackY);
    ctx.stroke();
    const tx = x + 14 + (w - 28) * v;
    ctx.strokeStyle = '#2e5bd7';
    ctx.beginPath();
    ctx.moveTo(x + 14, trackY);
    ctx.lineTo(tx, trackY);
    ctx.stroke();
    ctx.fillStyle = this.hover === item.id ? '#8ab4ff' : '#d7dce4';
    ctx.beginPath();
    ctx.arc(tx, trackY, 14, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The standard SetView wrist menu layout. */
export function buildWristPanel(): UIPanel {
  return new UIPanel([
    [
      { id: 'mode-actor', label: 'Place: Actor' },
      { id: 'mode-camera', label: 'Place: Cam' },
    ],
    [
      { id: 'view-full', label: 'Full' },
      { id: 'view-mini', label: 'Mini' },
      { id: 'view-camera', label: 'Cam View' },
    ],
    [
      { id: 'scan', label: 'Scan Room', flex: 1.4 },
      { id: 'location', label: 'Loc: Hidden' },
    ],
    [
      { id: 'framelines', label: 'Frame Lines', flex: 1.4 },
      { id: 'aspect', label: '2.39:1' },
    ],
    [
      { id: 'play', label: '▶ Play' },
      { id: 'stop', label: '⏹ Stop' },
      { id: 'clearkf', label: 'Clear KF' },
    ],
    [{ id: 'scrub', label: '', slider: true }],
    [
      { id: 'pace-slow', label: 'Pace −' },
      { id: 'pace', label: '1.4 m/s' },
      { id: 'pace-fast', label: 'Pace +' },
    ],
    [
      { id: 'undo', label: '↶ Undo' },
      { id: 'redo', label: '↷ Redo' },
      { id: 'dup', label: '⧉ Dup' },
    ],
    [
      { id: 'stance', label: 'Stance ▸', flex: 1.6 },
      { id: 'dof', label: 'DOF' },
    ],
    [
      { id: 'addnote', label: '+ Note' },
      { id: 'notes', label: 'Notes' },
    ],
    [
      { id: 'delete', label: 'Delete' },
      { id: 'drift', label: 'Drift' },
      { id: 'resetview', label: 'Re-align' },
    ],
    [
      { id: 'capture', label: '📷 Capture', flex: 1.4 },
      { id: 'exit', label: 'Exit AR' },
    ],
  ]);
}

// --- landing page (2D DOM) ----------------------------------------------------

export interface SceneSummary {
  id: string;
  name: string;
  updatedAt: number;
  actors: number;
  cameras: number;
  hasScan?: boolean;
}

export interface LandingCallbacks {
  onEnter: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onImport: (file: File) => void;
  onRename: (id: string, name: string) => void;
  onExportFloorplan: (id: string) => void;
  onExportShotList: (id: string) => void;
  onRemoveScan: (id: string) => void;
  /** Full scene for the inline camera editor, or null. */
  getScene: (id: string) => SceneData | null;
  onUpdateCamera: (sceneId: string, cameraId: string, patch: Partial<CameraSetupData>) => void;
  onSetPace: (sceneId: string, walkSpeed: number) => void;
  onSetStance: (sceneId: string, actorId: string, stance: StanceId) => void;
}

export class Landing {
  private root: HTMLElement;
  private cb: LandingCallbacks;
  private enterBtn!: HTMLButtonElement;
  private diagEl!: HTMLElement;
  private listEl!: HTMLElement;

  constructor(root: HTMLElement, cb: LandingCallbacks) {
    this.root = root;
    this.cb = cb;
    this.build();
  }

  private build(): void {
    this.root.innerHTML = '';
    const el = (tag: string, cls: string, parent: HTMLElement, text = ''): HTMLElement => {
      const e = document.createElement(tag);
      e.className = cls;
      if (text) e.textContent = text;
      parent.appendChild(e);
      return e;
    };
    const wrap = el('div', 'wrap', this.root);
    el('h1', '', wrap, 'SetView');
    el('p', 'sub', wrap, 'AR previsualization & shot blocking — place actors, block moves, find your frame.');
    this.diagEl = el('div', 'diag', wrap);
    this.enterBtn = el('button', 'enter', wrap, 'Enter AR') as HTMLButtonElement;
    this.enterBtn.disabled = true;
    this.enterBtn.onclick = () => this.cb.onEnter();

    const bar = el('div', 'bar', wrap);
    const newBtn = el('button', 'small', bar, '+ New Scene') as HTMLButtonElement;
    newBtn.onclick = () => this.cb.onNew();
    const importBtn = el('button', 'small', bar, 'Import JSON') as HTMLButtonElement;
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'application/json,.json';
    file.hidden = true;
    bar.appendChild(file);
    importBtn.onclick = () => file.click();
    file.onchange = () => {
      if (file.files?.[0]) this.cb.onImport(file.files[0]);
      file.value = '';
    };

    this.listEl = el('div', 'scenes', wrap);

    const help = el('details', 'help', wrap);
    el('summary', '', help, 'Controls cheat-sheet');
    el('pre', '', help, CONTROLS_CHEATSHEET);

    // Keyboard shortcuts (desktop prep): Enter = Enter AR, N = new scene.
    window.addEventListener('keydown', (e) => {
      if (this.root.style.display === 'none') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return; // let Cmd/Ctrl+N etc. through
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable))
        return;
      if (e.key === 'Enter' && !this.enterBtn.disabled) {
        e.preventDefault();
        this.cb.onEnter();
      } else if (e.key.toLowerCase() === 'n') {
        this.cb.onNew();
      }
    });
  }

  setDiagnostics(report: SupportReport): void {
    this.enterBtn.disabled = !report.immersiveAR;
    if (report.immersiveAR) {
      this.diagEl.innerHTML = '<span class="ok">✓ immersive-ar supported — put on the headset and press Enter AR</span>';
    } else {
      this.diagEl.innerHTML =
        '<span class="bad">✗ WebXR immersive-ar unavailable</span><ul>' +
        report.messages.map((m) => `<li>${m}</li>`).join('') +
        '</ul><p>On desktop this page only manages scenes. Open it in the Meta Quest or Android XR browser to enter AR.</p>';
    }
  }

  refreshScenes(scenes: SceneSummary[], currentId: string | null): void {
    this.listEl.innerHTML = '';
    const h2 = document.createElement('h2');
    h2.textContent = 'Scenes';
    this.listEl.appendChild(h2);
    if (!scenes.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'No saved scenes yet — a scene is created automatically when you enter AR.';
      this.listEl.appendChild(p);
      return;
    }
    for (const s of scenes) {
      const row = document.createElement('div');
      row.className = 'scene' + (s.id === currentId ? ' current' : '');

      const head = document.createElement('div');
      head.className = 'scene-head';
      const info = document.createElement('button');
      info.className = 'load';
      info.innerHTML = `<b>${escapeHtml(s.name)}</b><span>${s.actors} actors · ${s.cameras} cams${
        s.hasScan ? ' · location scan' : ''
      } · ${new Date(s.updatedAt).toLocaleString()}</span>`;
      info.onclick = () => this.cb.onSelect(s.id);
      head.appendChild(info);
      for (const [label, fn] of [
        ['Rename', (id: string) => this.promptRename(id, s.name)],
        ['Dup', this.cb.onDuplicate],
        ['Export', this.cb.onExport],
        ['Del', this.cb.onDelete],
      ] as const) {
        const b = document.createElement('button');
        b.className = 'small';
        b.textContent = label;
        b.onclick = () => fn(s.id);
        head.appendChild(b);
      }
      row.appendChild(head);

      // Expandable prep panel: exports + inline camera editor.
      const det = document.createElement('details');
      det.className = 'prep';
      const sum = document.createElement('summary');
      sum.textContent = 'Shots & exports';
      det.appendChild(sum);
      det.appendChild(this.buildPrepPanel(s.id));
      row.appendChild(det);

      this.listEl.appendChild(row);
    }
  }

  private promptRename(id: string, current: string): void {
    const name = window.prompt('Scene name (used on slates and export filenames):', current);
    if (name !== null && name.trim()) this.cb.onRename(id, name.trim());
  }

  /** Export buttons + a per-camera editor (lens/format/aspect/T-stop/height). */
  private buildPrepPanel(sceneId: string): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'prep-body';

    const exports = document.createElement('div');
    exports.className = 'bar';
    for (const [label, fn] of [
      ['⬇ Floorplan PNG', this.cb.onExportFloorplan],
      ['⬇ Shot List', this.cb.onExportShotList],
    ] as const) {
      const b = document.createElement('button');
      b.className = 'small';
      b.textContent = label;
      b.onclick = () => fn(sceneId);
      exports.appendChild(b);
    }
    panel.appendChild(exports);

    const scene = this.cb.getScene(sceneId);
    if (scene) {
      const pace = document.createElement('div');
      pace.className = 'cam-edit';
      const b = document.createElement('b');
      b.textContent = 'Scene';
      pace.appendChild(b);
      const l = document.createElement('label');
      l.className = 'field';
      const span = document.createElement('span');
      span.textContent = 'Move pace m/s';
      const i = document.createElement('input');
      i.type = 'number';
      i.value = String(scene.walkSpeed.toFixed(1));
      i.step = '0.1';
      i.min = '0.4';
      i.max = '3';
      i.onchange = () => {
        if (i.value.trim() === '') {
          i.value = String(scene.walkSpeed.toFixed(1));
          return;
        }
        const n = Number(i.value);
        if (!Number.isFinite(n)) return;
        const clamped = Math.min(3, Math.max(0.4, n));
        i.value = String(clamped.toFixed(1));
        this.cb.onSetPace(sceneId, clamped);
      };
      l.appendChild(span);
      l.appendChild(i);
      pace.appendChild(l);
      panel.appendChild(pace);

      // Location scan status + remove.
      const scanRow = document.createElement('div');
      scanRow.className = 'cam-edit';
      const sb = document.createElement('b');
      sb.textContent = 'Location';
      scanRow.appendChild(sb);
      const info = document.createElement('span');
      info.className = 'scan-info';
      if (scene.scan) {
        const sc = scene.scan;
        const size = `${(sc.boundsMax.x - sc.boundsMin.x).toFixed(1)}×${(sc.boundsMax.z - sc.boundsMin.z).toFixed(1)} m`;
        info.textContent = `scan: ${Math.round(sc.triangles / 1000)}k tris · ${size} · ${new Date(
          sc.capturedAt,
        ).toLocaleDateString()}`;
        scanRow.appendChild(info);
        const rm = document.createElement('button');
        rm.className = 'small';
        rm.textContent = 'Remove scan';
        rm.onclick = () => this.cb.onRemoveScan(sceneId);
        scanRow.appendChild(rm);
      } else {
        info.textContent = 'no scan — use Scan Room on the wrist menu while on location';
        scanRow.appendChild(info);
      }
      panel.appendChild(scanRow);

      // Cast: per-actor stance (poses are placed in AR; stance is editable here).
      if (scene.actors.length) {
        for (const actor of scene.actors) panel.appendChild(this.buildActorEditor(sceneId, actor));
      }
    }
    if (!scene || scene.cameras.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'No cameras yet — commit one in AR to edit its lens here.';
      panel.appendChild(p);
      return panel;
    }
    for (const cam of scene.cameras) panel.appendChild(this.buildCameraEditor(sceneId, cam));
    return panel;
  }

  /** A per-actor row: name swatch + a stance dropdown. */
  private buildActorEditor(sceneId: string, actor: { id: string; name: string; color: string; stance?: StanceId }): HTMLElement {
    const row = document.createElement('div');
    row.className = 'cam-edit';
    const name = document.createElement('b');
    name.textContent = actor.name;
    name.style.color = actor.color;
    row.appendChild(name);

    const l = document.createElement('label');
    l.className = 'field';
    const span = document.createElement('span');
    span.textContent = 'Stance';
    const sel = document.createElement('select');
    for (const p of STANCES) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === (actor.stance ?? 'standing')) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.onchange = () => this.cb.onSetStance(sceneId, actor.id, sel.value as StanceId);
    l.appendChild(span);
    l.appendChild(sel);
    row.appendChild(l);
    return row;
  }

  private buildCameraEditor(sceneId: string, cam: CameraSetupData): HTMLElement {
    const row = document.createElement('div');
    row.className = 'cam-edit';
    const name = document.createElement('b');
    name.textContent = cam.name;
    row.appendChild(name);

    const patch = (p: Partial<CameraSetupData>) => this.cb.onUpdateCamera(sceneId, cam.id, p);

    const field = (label: string, input: HTMLElement) => {
      const l = document.createElement('label');
      l.className = 'field';
      const span = document.createElement('span');
      span.textContent = label;
      l.appendChild(span);
      l.appendChild(input);
      row.appendChild(l);
    };

    const num = (value: number, step: number, min: number, max: number, apply: (n: number) => void) => {
      const i = document.createElement('input');
      i.type = 'number';
      i.value = String(value);
      i.step = String(step);
      i.min = String(min);
      i.max = String(max);
      i.onchange = () => {
        if (i.value.trim() === '') {
          i.value = String(value); // cleared field — restore, don't apply 0
          return;
        }
        const n = Number(i.value);
        if (!Number.isFinite(n)) return;
        const clamped = Math.min(max, Math.max(min, n)); // min/max attrs don't clamp .value
        i.value = String(clamped);
        apply(clamped);
      };
      return i;
    };
    const select = (opts: readonly { value: string; label: string }[], value: string, apply: (v: string) => void) => {
      const sel = document.createElement('select');
      for (const o of opts) {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        if (o.value === value) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.onchange = () => apply(sel.value);
      return sel;
    };

    field('Lens mm', num(Math.round(cam.lensFocalLength), 1, 8, 400, (n) => patch({ lensFocalLength: n })));
    field(
      'Format',
      select(
        SENSOR_FORMATS.map((f) => ({ value: f.id, label: f.short })),
        cam.formatId,
        (v) => patch({ formatId: v }),
      ),
    );
    field(
      'Aspect',
      select(
        ASPECT_NAMES.map((a) => ({ value: a, label: a })),
        cam.aspect,
        (v) => patch({ aspect: v as CameraSetupData['aspect'] }),
      ),
    );
    field('T-stop', num(cam.tStop, 0.1, 0.7, 32, (n) => patch({ tStop: n })));
    field('Height m', num(Number(cam.position.y.toFixed(2)), 0.1, 0, 4, (n) => patch({ position: { ...cam.position, y: n } })));

    // Tripod-height presets.
    field(
      'Preset',
      select(
        [{ value: '', label: '—' }, ...TRIPOD_HEIGHTS.map((t) => ({ value: String(t.y), label: t.name }))],
        '',
        (v) => {
          if (v) patch({ position: { ...cam.position, y: Number(v) } });
        },
      ),
    );

    return row;
  }

  show(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export const CONTROLS_CHEATSHEET = `MOVING AROUND THE SET
  Walk ............ just walk — you're in passthrough, the set is registered
  LEFT stick ...... glide through the set (forward/back + strafe), full view
  RIGHT stick ← → . snap-turn the set 30° (full view, when not framing)
  RIGHT stick click teleport to the aimed floor point (full view)
  Wrist Re-align .. undo all glide/turn/teleport — back to true registration

RIGHT controller (pointer)
  Trigger ......... place actor/camera · select · click wrist menu
  Grip (hold) ..... grab actor/camera to move · grab miniature
  Stick ← → ....... rotate held actor · focal (Cam View / frame lines) · snap-turn
  Stick click ..... teleport to reticle (full-scale view)
  A ............... commit camera (frame lines on) · capture PNG (Cam View)
  B ............... store keyframe for selected actor (max 5)

LEFT controller
  Stick ........... glide through the set (full-scale view)
  X ............... toggle placement mode (actor / camera)
  Y ............... cycle view: full-scale → miniature → camera
  Wrist menu ...... point at the panel above your left wrist and pull trigger
  Undo / Redo ..... step back / forward through placement & keyframe edits
  Dup ............. clone the pointed-at (or selected) actor / camera
  Pace − / + ...... slow down / speed up blocking playback (per scene)
  Stance ▸ ........ cycle the selected actor's pose (stand/lean/sit/lie)
  DOF ............. toggle simulated depth of field on the camera monitor
  Scan Room ....... capture the room's Scene Mesh into this scene
  Loc: … .......... location display: Hidden → Ghost → Solid

Hands (no controllers): pinch = trigger (place/select). Menu needs controllers.

Desktop prep (no headset)
  Rename scenes · set each actor's stance · edit each camera's lens / format /
  aspect / T-stop / height · export a floorplan PNG or Markdown shot list
  Keys: Enter = Enter AR · N = New Scene`;

// --- note editor (dom-overlay) --------------------------------------------------

export class NoteEditor {
  private root: HTMLElement;
  private dialog: HTMLElement | null = null;

  constructor(overlayRoot: HTMLElement) {
    this.root = overlayRoot;
  }

  get isOpen(): boolean {
    return this.dialog !== null;
  }

  open(actorName: string, onDone: (kind: 'dialogue' | 'action', text: string) => void): void {
    this.close();
    const d = document.createElement('div');
    d.className = 'note-dialog';
    d.innerHTML = `
      <h3>Note for ${escapeHtml(actorName)}</h3>
      <div class="kinds">
        <label><input type="radio" name="kind" value="dialogue" checked> “Dialogue”</label>
        <label><input type="radio" name="kind" value="action"> Action beat</label>
      </div>
      <textarea rows="3" placeholder="Type the line or the beat…"></textarea>
      <div class="row"><button class="save">Save</button><button class="cancel">Cancel</button></div>`;
    this.root.appendChild(d);
    this.dialog = d;
    const ta = d.querySelector('textarea')!;
    setTimeout(() => ta.focus(), 50);
    d.querySelector<HTMLButtonElement>('.save')!.onclick = () => {
      const kind = d.querySelector<HTMLInputElement>('input[name=kind]:checked')!.value as
        | 'dialogue'
        | 'action';
      const text = ta.value.trim();
      this.close();
      if (text) onDone(kind, text);
    };
    d.querySelector<HTMLButtonElement>('.cancel')!.onclick = () => this.close();
  }

  close(): void {
    this.dialog?.remove();
    this.dialog = null;
  }
}
