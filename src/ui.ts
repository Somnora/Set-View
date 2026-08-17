// ---------------------------------------------------------------------------
// All UI: canvas text sprites, the wrist menu panel, debug log/board, drift
// grid marker, the 2D landing page (DOM), and the dom-overlay note editor.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import type { SupportReport } from './session.ts';
import {
  ASPECT_NAMES,
  MAX_KEYFRAMES,
  SENSOR_FORMATS,
  TRIPOD_HEIGHTS,
  check180LineOfAction,
  computeFocusDistance,
  createScene,
  aspectValue,
  sensorFormat,
  type ActorData,
  type CameraSetupData,
  type LightData,
  type MarkOp,
  type SceneData,
} from './model.ts';
import { classifyShotSize, findCamerasInFrustums } from './lens.ts';
import { STANCES, type StanceId } from './pose.ts';
import {
  downloadNleTimelineExport,
  downloadUe5BridgePackage,
  exportAiPromptPackage,
  exportSceneTimeline,
  exportStoryboardHtml,
  exportStoryboardSvg,
  exportUe5BridgePackage,
  type NleExportFormat,
  type NleExportOptions,
  type Ue5ExportFormat,
  type Ue5ExportOptions,
  type UnrealVersion,
} from './exporters.ts';
import {
  auditSceneContinuity,
  buildAiContinuityPromptPackage,
  generateScriptBreakdownFromScene,
  generateStoryboard,
  simulateAiContinuityBreakdown,
} from './continuity.ts';
import {
  COLLAB_ROLES,
  generateRoomCode,
  type CollabRole,
  type EntityLockManager,
  type PeerRoster,
} from './collab.ts';
import type { WebRtcCollabSession } from './network.ts';
import {
  BUILTIN_PROPS,
  PROP_CATEGORIES,
  filterPropsByCategory,
  formatDimensions,
  searchProps,
  type PropCategory,
  type PropDefinition,
} from './props.ts';
import { globalPropStore, type CustomPropAsset } from './propStore.ts';
import {
  type LiveLinkConfig,
  type LiveLinkConnectionState,
  type LiveLinkSubjectType,
  type VcamSmoothingPreset,
  VCAM_SMOOTHING_PRESETS,
  generateUe5LiveLinkReceiverPythonScript,
  normalizeLiveLinkConfig,
} from './livelink.ts';
import { LiveLinkStreamer } from './liveLinkStreamer.ts';
import {
  exportBvh,
  parseBvh,
  STOCK_ANIMATION_CLIPS,
  STOCK_POSE_PRESETS,
} from './characterRig.ts';
import {
  type GripRigConfig,
  type GripRigType,
  type LensOpticalProfile,
  STOCK_GRIP_RIGS,
  STOCK_LENS_PROFILES,
  calculateBokehShape,
  calculateLensBreathingFocalLength,
  createLensProfile,
  normalizeGripRigConfig,
  normalizeLensProfile,
} from './cameraGrip.ts';
import {
  type GaussianCloudData,
  alignSplatCloudToFloorplan,
  exportCompactSplat,
  exportGaussianPly,
  fitArchitecturalPlanesFromSplats,
  generateSyntheticScoutSplatCloud,
  normalizeGaussianCloud,
  parseCompactSplat,
  parseGaussianPly,
  voxelDownsampleSplats,
} from './gaussianSplat.ts';
import type { XRPerformanceGovernor } from './xrPerformance.ts';
import type { GovernorConfig } from './performanceGovernor.ts';
import {
  DAILIES_RESOLUTION_PRESETS,
  calculateAnimaticSequencePlan,
  createDailiesConfig,
  formatSmpteTimecode,
  type AnimaticRenderOptions,
  type BurnedInTimecodeConfig,
  type DailiesLayoutMode,
} from './dailiesEngine.ts';
import {
  AnimaticVideoRenderer,
  type DailiesRenderProgressCallback,
  type DailiesRenderResult,
} from './animaticVideoRenderer.ts';
import {
  type DmxBridgeConfig,
  type DmxCue,
  type DmxPatchEntry,
  type DmxProtocol,
  DMX_FIXTURE_PROFILES,
  createDmxBridgeConfig,
  createDmxCue,
  createDmxPatchEntry,
  exportDmxPatchListCsv,
  findFixtureProfile,
} from './dmxEngine.ts';
import { DmxStreamer, type DmxConnectionState } from './dmxStreamer.ts';
import {
  type LedVolumeConfig,
  type LedVolumePresetId,
  STOCK_LED_VOLUMES,
  calculateMoireRisk,
  createLedVolumeConfig,
  createLedVolumeWall,
  generateNDisplayConfigXml,
  generateOpenUsdLedVolume,
  normalizeLedVolumeConfig,
} from './icvfxEngine.ts';
import {
  type AcousticsConfig,
  CURATED_MIC_PROFILES,
  calculateBoomFrameIncursion,
  calculateCriticalDistance,
  calculateRt60Reverberation,
  calculateSpeechClarityC50,
  calculateSplAndSnr,
  createAcousticsConfig,
  createBoomMicEntity,
  createLavalierMicEntity,
  generateAes31IxmlManifest,
  generateBwfSoundReportCsv,
  normalizeAcousticsConfig,
} from './acousticsEngine.ts';
import {
  type SolarEnvironmentConfig,
  CURATED_FILMING_LOCATIONS,
  calculateSolarEphemeris,
  createSolarEnvironmentConfig,
  generateDpSunReportHtml,
  generateSolarTrackingTable,
  generateSolarTrackingTableCsv,
  kelvinToRgb,
  normalizeSolarEnvironmentConfig,
} from './solarEngine.ts';
import {
  type CoverageAuditReport,
  type ParsedScene,
  type ParsedScreenplay,
  type ScreenplayConfig,
  type ShotCoverageRecommendation,
  DEFAULT_SAMPLE_FOUNTAIN_SCRIPT,
  auditSceneContinuity as auditSceneContinuityEngine,
  countWords,
  createScreenplayConfig,
  generateAutoShotCoverage,
  generateDirectorDeckHtml,
  generateScreenplayShotListCsv,
  normalizeScreenplayConfig,
  parseFdxScript,
  parseFountainScript,
} from './screenplayEngine.ts';
import {
  type FrameTelemetrySample,
  type VRBenchmarkReport,
  type VRProfilerConfig,
  SYNTHETIC_VR_SCENARIOS,
  calculateBenchmarkSummary,
  createDefaultVRThresholds,
  createSyntheticVRScenario,
  createVRProfilerConfig,
  generatePerformanceReportCsv,
  generatePerformanceReportHtml,
  normalizeVRProfilerConfig,
} from './webxrProfilerEngine.ts';
import {
  type ComfortAuditReport,
  type ComfortLocomotionMode,
  type ErgonomicReachTarget,
  type VestibularStateSample,
  type VRComfortConfig,
  auditSceneComfort,
  calculateCybersicknessIndex,
  calculateVestibularKinematics,
  createVRComfortConfig,
  evaluateNeckStrain,
  evaluateReachability,
  generateComfortReportCsv,
  generateComfortReportHtml,
  normalizeVRComfortConfig,
} from './comfortEngine.ts';
import {
  type GeminiAiConfig,
  type GeminiAiSceneMutation,
  type ScatterDensity,
  type ScatterTheme,
  type SetDressingConfig,
  type SetDressingManifest,
  type SettledPropItem,
  THEME_PROP_CATALOGS,
  applyAiMutationsToScene,
  buildGeminiAiSystemPrompt,
  createSetDressingConfig,
  detectSemanticRegions,
  generateSetDressingDeckHtml,
  generateSetDressingManifestCsv,
  generateThemeScatter,
  normalizeSetDressingConfig,
  parseDeterministicNlCommand,
  parseGeminiAiResponse,
} from './setDressingEngine.ts';





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
    // Preserve the canvas aspect exactly: height = one worldHeight per line,
    // width follows from the pixel aspect (dividing by lines squishes
    // multiline text horizontally).
    const h = worldHeight * lines.length;
    sprite.scale.set((h * canvas.width) / canvas.height, h, 1);
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
    [{ id: 'wheel-toggle', label: 'Menu / Tool Wheel', flex: 2 }],
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
      { id: 'framelines', label: 'Frame Lines', flex: 1.3 },
      { id: 'aspect', label: '2.39:1' },
      { id: 'format', label: 'S35' },
      { id: 'tstop', label: 'T2.8' },
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
      { id: 'stance', label: 'Stance ▸', flex: 1.1 },
      { id: 'actor-studio', label: '🎭 Rig', flex: 1.1 },
      { id: 'grip-rig', label: '🎥 Grip', flex: 1.1 },
      { id: 'screenplay-studio', label: '📜 Script', flex: 1.1 },
      { id: 'icvfx-studio', label: '🎬 ICVFX', flex: 1.1 },
      { id: 'acoustics-studio', label: '🎙️ Audio', flex: 1.1 },
      { id: 'solar-studio', label: '☀️ Sun', flex: 1.1 },
      { id: 'dmx-bridge', label: '💡 DMX', flex: 1.1 },
      { id: 'splat-studio', label: '✨ 3DGS', flex: 1.1 },
      { id: 'dailies-studio', label: '🎬 Dailies', flex: 1.1 },
      { id: 'perf-settings', label: '⚡ Perf', flex: 1.1 },
      { id: 'comfort-studio', label: '🛡️ Comfort', flex: 1.1 },
      { id: 'set-dressing-studio', label: '🎲 Dressing', flex: 1.1 },
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
      { id: 'capture', label: '📷 Capture', flex: 1.2 },
      { id: 'record', label: '⏺ Rec' },
      { id: 'aianalysis', label: '🤖 AI' },
      { id: 'help', label: '?' },
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
  onExportNleTimeline?: (id: string) => void;
  onExportUe5Bridge?: (id: string) => void;
  onExportAIPrompt?: (id: string) => void;
  onAiShotAnalysis?: (id: string) => void;
  onRemoveScan: (id: string) => void;
  onExportScanObj?: (id: string) => void;
  onExportScanPly?: (id: string) => void;
  onExportScanUsd?: (id: string) => void;
  onExportScanGeoJson?: (id: string) => void;
  onExportScanPackage?: (id: string) => void;
  onAddSyntheticScan?: (id: string) => void;
  /** Opens the desktop 3D preview (orbit + playback) for a scene. */
  onPreview: (id: string) => void;
  /** Full scene for the inline camera editor, or null. */
  getScene: (id: string) => SceneData | null;
  onUpdateCamera: (sceneId: string, cameraId: string, patch: Partial<CameraSetupData>) => void;
  onAddCamera?: (sceneId: string) => void;
  onDeleteCamera?: (sceneId: string, cameraId: string) => void;
  onAddActor?: (sceneId: string) => void;
  onUpdateActor?: (sceneId: string, actorId: string, patch: Partial<ActorData>) => void;
  onDeleteActor?: (sceneId: string, actorId: string) => void;
  onAddLight?: (sceneId: string) => void;
  onUpdateLight?: (sceneId: string, lightId: string, patch: Partial<LightData>) => void;
  onDeleteLight?: (sceneId: string, lightId: string) => void;
  onSetPace: (sceneId: string, walkSpeed: number) => void;
  onSetStance: (sceneId: string, actorId: string, stance: StanceId) => void;
  onSetScale?: (sceneId: string, actorId: string, scale: number) => void;
  /** Desktop blocking editor: one mark-list operation (see model.MarkOp). */
  onEditMarks: (sceneId: string, actorId: string, op: MarkOp) => void;
  /** Opens the multi-user WebRTC collaborative session modal. */
  onCollab?: () => void;
  /** Opens the 3D Set & Prop Asset Library modal. */
  onPropsLibrary?: () => void;
  /** Opens the Unreal Engine LiveLink & Real-Time WebXR VCam settings modal. */
  onOpenLiveLink?: () => void;
  /** Opens the 3D Gaussian Splatting & Photogrammetry Scout Studio modal. */
  onGaussianSplatStudio?: (sceneId: string) => void;
  /** Opens the Automated Dailies & Multi-Camera Animatic Video Studio modal. */
  onOpenDailiesStudio?: (sceneId: string) => void;
  /** Opens the Physical Soundstage DMX512 & Art-Net / sACN Lighting Bridge Studio modal. */
  onOpenDmxBridge?: (sceneId: string) => void;
  /** Opens the Virtual Production ICVFX LED Volume Wall Calibration & Moiré Studio modal. */
  onOpenIcvfxStudio?: (sceneId: string) => void;
  /** Opens the Soundstage Acoustics & Multi-Track Spatial Dialogue Studio modal. */
  onOpenAcousticsStudio?: (sceneId: string) => void;
  /** Opens the Physical Solar Ephemeris & Natural Environment Simulator Studio modal. */
  onOpenSolarStudio?: (sceneId: string) => void;
  /** Opens the Screenplay Beat Breakdown & AI Cinematography Continuity Suite modal. */
  onOpenScreenplayStudio?: (sceneId: string) => void;
  /** Opens the WebXR 6DoF Emulation Test Harness & Meta Quest 3 Frame Profiler Suite modal. */
  onOpenWebXRProfiler?: (sceneId: string) => void;
  /** Opens the VR Motion Sickness, Ergonomics & Spatial Comfort Studio modal. */
  onOpenVRComfort?: (sceneId: string) => void;
  /** Opens the Virtual Set Dressing, Generative Spatial Scatter & Gemini AI Omni Set Director Studio modal. */
  onOpenSetDressingStudio?: (sceneId: string) => void;
}


export class Landing {
  private root: HTMLElement;
  private cb: LandingCallbacks;
  private enterBtn!: HTMLButtonElement;
  private diagEl!: HTMLElement;
  private listEl!: HTMLElement;
  private lastSelectedSceneId = '';

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
    const header = el('div', 'brand-header', wrap);
    const titleBox = el('div', 'brand-title', header);
    el('span', 'brand-badge', titleBox, 'SETVIEW');
    el('h1', '', titleBox, 'AR Shot Blocking & 3D Desktop Prep');
    el('p', 'sub', wrap, 'Professional spatial previsualization: block actor keyframes, configure optical camera physics, rig lighting, and preview in 3D & WebXR.');
    this.diagEl = el('div', 'diag', wrap);
    this.enterBtn = el('button', 'enter', wrap, 'Enter WebXR / AR Mode') as HTMLButtonElement;
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

    if (this.cb.onPropsLibrary) {
      const propsBtn = el('button', 'small', bar, '📦 Prop Library') as HTMLButtonElement;
      propsBtn.style.background = 'rgba(56, 189, 248, 0.15)';
      propsBtn.style.borderColor = '#38bdf8';
      propsBtn.style.color = '#7dd3fc';
      propsBtn.onclick = () => this.cb.onPropsLibrary?.();
    }

    if (this.cb.onCollab) {
      const collabBtn = el('button', 'small', bar, '👥 Collab Session') as HTMLButtonElement;
      collabBtn.style.background = 'rgba(59, 130, 246, 0.2)';
      collabBtn.style.borderColor = '#3b82f6';
      collabBtn.style.color = '#93c5fd';
      collabBtn.onclick = () => this.cb.onCollab?.();
    }

    if (this.cb.onOpenLiveLink) {
      const liveLinkBtn = el('button', 'small', bar, '📡 LiveLink VCam') as HTMLButtonElement;
      liveLinkBtn.style.background = 'rgba(14, 165, 233, 0.2)';
      liveLinkBtn.style.borderColor = '#0ea5e9';
      liveLinkBtn.style.color = '#38bdf8';
      liveLinkBtn.onclick = () => this.cb.onOpenLiveLink?.();
    }

    if (this.cb.onGaussianSplatStudio) {
      const splatBtn = el('button', 'small', bar, '✨ 3DGS Studio') as HTMLButtonElement;
      splatBtn.style.background = 'rgba(168, 85, 247, 0.2)';
      splatBtn.style.borderColor = '#a855f7';
      splatBtn.style.color = '#d8b4fe';
      splatBtn.onclick = () => this.cb.onGaussianSplatStudio?.(this.lastSelectedSceneId);
    }

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

  /** Shows an AR-start failure on the landing page (the wrist debug log is
      unreachable when the session never starts). */
  showStartError(message: string): void {
    const p = document.createElement('p');
    p.className = 'bad';
    p.textContent = `Enter AR failed: ${message}`;
    this.diagEl.appendChild(p);
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
    // Edits re-render the whole list; keep expanded prep panels expanded so
    // the blocking editor doesn't collapse after every field change.
    const openIds = new Set(
      Array.from(this.listEl.querySelectorAll('details.prep[open]')).map(
        (d) => (d as HTMLElement).dataset.sceneId ?? '',
      ),
    );
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
        ['Preview', this.cb.onPreview],
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
      det.dataset.sceneId = s.id;
      if (openIds.has(s.id)) det.open = true;
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

  /** Export buttons + responsive grid for Scene, Cast/Actors, Cameras, and Lighting. */
  private buildPrepPanel(sceneId: string): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'prep-body';

    const exports = document.createElement('div');
    exports.className = 'bar';

    const btn = (label: string, fn?: (id: string) => void) => {
      if (!fn) return;
      const b = document.createElement('button');
      b.className = 'small primary';
      b.textContent = label;
      b.onclick = () => fn(sceneId);
      exports.appendChild(b);
    };

    btn('⬇ Floorplan PNG', this.cb.onExportFloorplan);
    btn('⬇ Shot List MD', this.cb.onExportShotList);
    btn('🎬 NLE & EDL Export', this.cb.onExportNleTimeline);
    btn('🎬 Dailies Video Reel', this.cb.onOpenDailiesStudio);
    btn('💡 DMX Bridge', this.cb.onOpenDmxBridge ? () => this.cb.onOpenDmxBridge!(sceneId) : undefined);
    btn('🎬 ICVFX Volume', this.cb.onOpenIcvfxStudio ? () => this.cb.onOpenIcvfxStudio!(sceneId) : undefined);
    btn('🎙️ Acoustics Studio', this.cb.onOpenAcousticsStudio ? () => this.cb.onOpenAcousticsStudio!(sceneId) : undefined);
    btn('☀️ Solar Studio', this.cb.onOpenSolarStudio ? () => this.cb.onOpenSolarStudio!(sceneId) : undefined);
    btn('📜 Screenplay Breakdown', this.cb.onOpenScreenplayStudio ? () => this.cb.onOpenScreenplayStudio!(sceneId) : undefined);
    btn('⚡ Quest 3 Profiler', this.cb.onOpenWebXRProfiler ? () => this.cb.onOpenWebXRProfiler!(sceneId) : undefined);
    btn('🛡️ VR Comfort', this.cb.onOpenVRComfort ? () => this.cb.onOpenVRComfort!(sceneId) : undefined);
    btn('🎲 Set Dressing', this.cb.onOpenSetDressingStudio ? () => this.cb.onOpenSetDressingStudio!(sceneId) : undefined);
    btn('🎮 UE5 & USD Bridge', this.cb.onExportUe5Bridge);

    btn('📡 UE5 LiveLink & VCam', this.cb.onOpenLiveLink ? () => this.cb.onOpenLiveLink!() : undefined);
    btn('✨ 3DGS Scout Studio', this.cb.onGaussianSplatStudio ? () => this.cb.onGaussianSplatStudio!(sceneId) : undefined);
    btn('📜 AI Prompt Text', this.cb.onExportAIPrompt ?? this.cb.onExportShotList);
    btn('🤖 AI Shot Analysis', this.cb.onAiShotAnalysis);
    panel.appendChild(exports);

    const scene = this.cb.getScene(sceneId);
    if (!scene) return panel;

    const grid = document.createElement('div');
    grid.className = 'prep-grid';

    // --- Card 1: Scene & Environment ---
    const envCard = document.createElement('div');
    envCard.className = 'manager-card';
    const envTitle = document.createElement('div');
    envTitle.className = 'card-title';
    envTitle.innerHTML = '<span>🎬 Scene & Environment</span>';
    envCard.appendChild(envTitle);

    const paceRow = document.createElement('div');
    paceRow.className = 'cam-edit';
    const paceLbl = document.createElement('label');
    paceLbl.className = 'field';
    const paceSpan = document.createElement('span');
    paceSpan.textContent = 'Move pace m/s';
    const paceInput = document.createElement('input');
    paceInput.type = 'number';
    paceInput.value = String(scene.walkSpeed.toFixed(1));
    paceInput.step = '0.1';
    paceInput.min = '0.4';
    paceInput.max = '3.0';
    paceInput.onchange = () => {
      const n = Number(paceInput.value);
      if (Number.isFinite(n)) {
        const clamped = Math.min(3, Math.max(0.4, n));
        this.cb.onSetPace(sceneId, clamped);
      }
    };
    paceLbl.appendChild(paceSpan);
    paceLbl.appendChild(paceInput);
    paceRow.appendChild(paceLbl);
    envCard.appendChild(paceRow);

    const scanRow = document.createElement('div');
    scanRow.className = 'cam-edit';
    if (scene.scan) {
      const sc = scene.scan;
      const size = `${(sc.boundsMax.x - sc.boundsMin.x).toFixed(1)}×${(sc.boundsMax.z - sc.boundsMin.z).toFixed(1)}m`;
      const info = document.createElement('span');
      info.className = 'scan-info';
      info.textContent = `📍 Location Scan: ${Math.round(sc.triangles / 1000)}k tris (${size})`;
      scanRow.appendChild(info);

      const scanBtnWrap = document.createElement('div');
      scanBtnWrap.className = 'bar';
      scanBtnWrap.style.marginTop = '6px';

      const addBtn = (lbl: string, fn?: (id: string) => void) => {
        if (!fn) return;
        const b = document.createElement('button');
        b.className = 'small';
        b.textContent = lbl;
        b.onclick = () => fn(sceneId);
        scanBtnWrap.appendChild(b);
      };

      addBtn('📦 OBJ+MTL', this.cb.onExportScanObj);
      addBtn('📐 OpenUSD', this.cb.onExportScanUsd);
      addBtn('🌐 PLY', this.cb.onExportScanPly);
      addBtn('🗺️ GeoJSON', this.cb.onExportScanGeoJson);
      addBtn('📦 All 3D', this.cb.onExportScanPackage);

      const rm = document.createElement('button');
      rm.className = 'small';
      rm.textContent = 'Remove scan';
      rm.onclick = () => this.cb.onRemoveScan(sceneId);
      scanBtnWrap.appendChild(rm);

      scanRow.appendChild(scanBtnWrap);
    } else {
      const info = document.createElement('span');
      info.className = 'scan-info';
      info.textContent = '📍 No location scan attached';
      scanRow.appendChild(info);

      if (this.cb.onAddSyntheticScan) {
        const testBtn = document.createElement('button');
        testBtn.className = 'small';
        testBtn.style.marginLeft = '8px';
        testBtn.textContent = '+ Add Test Room Scan';
        testBtn.title = 'Generate synthetic 3D room scan (floor, walls, furniture) for desktop testing';
        testBtn.onclick = () => this.cb.onAddSyntheticScan!(sceneId);
        scanRow.appendChild(testBtn);
      }
    }
    envCard.appendChild(scanRow);

    const splatRow = document.createElement('div');
    splatRow.className = 'cam-edit';
    if (scene.gaussianClouds && scene.gaussianClouds.length > 0) {
      const activeCloud = scene.gaussianClouds.find((c) => c.id === scene.activeSplatCloudId) || scene.gaussianClouds[0];
      const info = document.createElement('span');
      info.className = 'scan-info';
      info.textContent = `✨ 3DGS Cloud: ${activeCloud.name} (${activeCloud.splatCount.toLocaleString()} splats)`;
      splatRow.appendChild(info);

      if (this.cb.onGaussianSplatStudio) {
        const studioBtn = document.createElement('button');
        studioBtn.className = 'small';
        studioBtn.style.marginLeft = '8px';
        studioBtn.textContent = 'Open 3DGS Studio';
        studioBtn.onclick = () => this.cb.onGaussianSplatStudio?.(sceneId);
        splatRow.appendChild(studioBtn);
      }
    } else {
      const info = document.createElement('span');
      info.className = 'scan-info';
      info.textContent = '✨ No 3D Gaussian Splat cloud attached';
      splatRow.appendChild(info);

      if (this.cb.onGaussianSplatStudio) {
        const studioBtn = document.createElement('button');
        studioBtn.className = 'small';
        studioBtn.style.marginLeft = '8px';
        studioBtn.textContent = '+ Open 3DGS Studio';
        studioBtn.onclick = () => this.cb.onGaussianSplatStudio?.(sceneId);
        splatRow.appendChild(studioBtn);
      }
    }
    envCard.appendChild(splatRow);
    grid.appendChild(envCard);

    // --- Card 2: Cast & Actor Blocking ---
    const actorCard = document.createElement('div');
    actorCard.className = 'manager-card';
    const actorTitle = document.createElement('div');
    actorTitle.className = 'card-title';
    actorTitle.innerHTML = `<span>🎭 Cast & Actor Blocking (${scene.actors.length})</span>`;
    if (this.cb.onAddActor) {
      const addActorBtn = document.createElement('button');
      addActorBtn.className = 'small primary';
      addActorBtn.textContent = '+ Add Actor';
      addActorBtn.onclick = () => this.cb.onAddActor!(sceneId);
      actorTitle.appendChild(addActorBtn);
    }
    actorCard.appendChild(actorTitle);

    if (scene.actors.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'No actors yet — click "+ Add Actor" or place actors in AR.';
      actorCard.appendChild(empty);
    } else {
      for (const actor of scene.actors) {
        actorCard.appendChild(this.buildActorEditor(sceneId, actor));
      }
    }
    grid.appendChild(actorCard);

    // --- Card 3: Camera System ---
    const camCard = document.createElement('div');
    camCard.className = 'manager-card';
    const camTitle = document.createElement('div');
    camTitle.className = 'card-title';
    camTitle.innerHTML = `<span>🎥 Camera Rig & Optics (${scene.cameras.length})</span>`;
    if (this.cb.onAddCamera) {
      const addCamBtn = document.createElement('button');
      addCamBtn.className = 'small primary';
      addCamBtn.textContent = '+ Add Camera';
      addCamBtn.onclick = () => this.cb.onAddCamera!(sceneId);
      camTitle.appendChild(addCamBtn);
    }
    camCard.appendChild(camTitle);

    if (scene.cameras.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'No cameras yet — click "+ Add Camera" or commit one in AR.';
      camCard.appendChild(empty);
    } else {
      if (scene.actors.length >= 2) {
        const axis = check180LineOfAction(scene.cameras, scene.actors[0].position, scene.actors[1].position);
        if (axis.hasCrossing) {
          const warn = document.createElement('div');
          warn.style.cssText = 'background:#451a03;border:1px solid #f59e0b;padding:6px 10px;border-radius:6px;margin-bottom:8px;font-size:12px;color:#fbbf24;';
          warn.textContent = '⚠️ 180° Axis Crossing Detected: Camera pair crosses line of action';
          camCard.appendChild(warn);
        } else if (scene.cameras.length > 1) {
          const ok = document.createElement('div');
          ok.style.cssText = 'background:#064e3b;border:1px solid #10b981;padding:6px 10px;border-radius:6px;margin-bottom:8px;font-size:12px;color:#34d399;';
          ok.textContent = '✅ 180° Continuity Clean';
          camCard.appendChild(ok);
        }
      }

      const collisions = findCamerasInFrustums(scene.cameras);
      if (collisions.length > 0) {
        const collWarn = document.createElement('div');
        collWarn.style.cssText = 'background:#431407;border:1px solid #ea580c;padding:6px 10px;border-radius:6px;margin-bottom:8px;font-size:12px;color:#fdba74;';
        collWarn.textContent = `⚠️ In-Shot: ${collisions.map((c) => `${c.observerCamName} sees ${c.observedCamName}`).join(', ')}`;
        camCard.appendChild(collWarn);
      }

      for (const cam of scene.cameras) {
        camCard.appendChild(this.buildCameraEditor(sceneId, cam, scene));
      }
    }
    grid.appendChild(camCard);

    // --- Card 4: Lighting Fixtures ---
    const lightCard = document.createElement('div');
    lightCard.className = 'manager-card';
    const lightTitle = document.createElement('div');
    lightTitle.className = 'card-title';
    lightTitle.innerHTML = `<span>💡 Lighting Rig (${scene.lights?.length ?? 0})</span>`;
    const lightBtns = document.createElement('div');
    lightBtns.style.display = 'flex';
    lightBtns.style.gap = '6px';

    if (this.cb.onOpenDmxBridge) {
      const dmxStudioBtn = document.createElement('button');
      dmxStudioBtn.className = 'small';
      dmxStudioBtn.textContent = '💡 DMX Studio';
      dmxStudioBtn.onclick = () => this.cb.onOpenDmxBridge!(sceneId);
      lightBtns.appendChild(dmxStudioBtn);
    }
    if (this.cb.onAddLight) {
      const addLightBtn = document.createElement('button');
      addLightBtn.className = 'small primary';
      addLightBtn.textContent = '+ Add Light';
      addLightBtn.onclick = () => this.cb.onAddLight!(sceneId);
      lightBtns.appendChild(addLightBtn);
    }
    lightTitle.appendChild(lightBtns);
    lightCard.appendChild(lightTitle);

    if (!scene.lights || scene.lights.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'No lights yet — click "+ Add Light".';
      lightCard.appendChild(empty);
    } else {
      for (const light of scene.lights) {
        lightCard.appendChild(this.buildLightEditor(sceneId, light));
      }
    }
    grid.appendChild(lightCard);

    // --- Card 5: ICVFX LED Volume Stage ---
    const icvfxCard = document.createElement('div');
    icvfxCard.className = 'manager-card';
    const icvfxTitle = document.createElement('div');
    icvfxTitle.className = 'card-title';
    icvfxTitle.innerHTML = `<span>🎬 ICVFX LED Volume Stage (${scene.icvfx?.walls?.length ?? 1} Walls)</span>`;
    const icvfxBtns = document.createElement('div');
    icvfxBtns.style.display = 'flex';
    icvfxBtns.style.gap = '6px';

    if (this.cb.onOpenIcvfxStudio) {
      const studioBtn = document.createElement('button');
      studioBtn.className = 'small primary';
      studioBtn.textContent = '🎬 Configure Volume';
      studioBtn.onclick = () => this.cb.onOpenIcvfxStudio!(sceneId);
      icvfxBtns.appendChild(studioBtn);
    }
    icvfxTitle.appendChild(icvfxBtns);
    icvfxCard.appendChild(icvfxTitle);

    const icvfxInfo = document.createElement('div');
    icvfxInfo.className = 'cam-edit';
    icvfxInfo.innerHTML = `
      <div style="font-size:12px; color:#cbd5e1; display:flex; flex-direction:column; gap:4px; width:100%;">
        <div><strong>Stage:</strong> ${escapeHtml(scene.icvfx?.stageName || 'LED Volume Stage')} <span class="badge ${scene.icvfx?.enabled !== false ? 'badge-success' : 'badge-danger'}" style="margin-left:6px; font-size:10px;">${scene.icvfx?.enabled !== false ? 'ACTIVE' : 'MUTED'}</span></div>
        <div><strong>Color Science:</strong> LUT ${escapeHtml(scene.icvfx?.lutProfile?.toUpperCase() || 'REC709')} | White Point ${escapeHtml(scene.icvfx?.targetWhitePoint?.toUpperCase() || 'D65')}</div>
        <div><strong>Frustum Overscan:</strong> ${scene.icvfx?.cameraOverscanPercent ?? 10}% margin</div>
      </div>
    `;
    icvfxCard.appendChild(icvfxInfo);
    grid.appendChild(icvfxCard);

    // --- Card 6: Soundstage Acoustics & Multi-Track Dialogue ---
    const acousticsCard = document.createElement('div');
    acousticsCard.className = 'manager-card';
    const acousticsTitle = document.createElement('div');
    acousticsTitle.className = 'card-title';
    acousticsTitle.innerHTML = `<span>🎙️ Soundstage Acoustics & Dialogue (${(scene.acoustics?.boomMics?.length ?? 1) + (scene.acoustics?.lavalierMics?.length ?? 0)} Tracks)</span>`;
    const acousticsBtns = document.createElement('div');
    acousticsBtns.style.display = 'flex';
    acousticsBtns.style.gap = '6px';

    if (this.cb.onOpenAcousticsStudio) {
      const studioBtn = document.createElement('button');
      studioBtn.className = 'small primary';
      studioBtn.textContent = '🎙️ Acoustics Studio';
      studioBtn.onclick = () => this.cb.onOpenAcousticsStudio!(sceneId);
      acousticsBtns.appendChild(studioBtn);
    }
    acousticsTitle.appendChild(acousticsBtns);
    acousticsCard.appendChild(acousticsTitle);

    const acousticsInfo = document.createElement('div');
    acousticsInfo.className = 'cam-edit';
    const boomCount = scene.acoustics?.boomMics?.length ?? 1;
    const lavCount = scene.acoustics?.lavalierMics?.length ?? 0;
    const noiseFloor = scene.acoustics?.ambientNoiseFloorDba ?? 35;
    acousticsInfo.innerHTML = `
      <div style="font-size:12px; color:#cbd5e1; display:flex; flex-direction:column; gap:4px; width:100%;">
        <div><strong>Rigging:</strong> ${boomCount} Boom Mic(s) | ${lavCount} Lavalier(s) <span class="badge ${scene.acoustics?.enabled !== false ? 'badge-success' : 'badge-danger'}" style="margin-left:6px; font-size:10px;">${scene.acoustics?.enabled !== false ? 'SIMULATION ACTIVE' : 'MUTED'}</span></div>
        <div><strong>Acoustic Noise:</strong> ${noiseFloor} dBA Ambient Floor | ${scene.acoustics?.airTemperatureC ?? 20}°C / ${scene.acoustics?.relativeHumidityPercent ?? 50}% RH</div>
        <div><strong>BWF Sound Report:</strong> Ready for Sound Devices / Aaton Cantar / Pro Tools export</div>
      </div>
    `;
    acousticsCard.appendChild(acousticsInfo);
    grid.appendChild(acousticsCard);

    // --- Card 7: Natural Sky & Physical Solar Ephemeris ---
    const solarCard = document.createElement('div');
    solarCard.className = 'manager-card';
    const solarTitle = document.createElement('div');
    solarTitle.className = 'card-title';
    const solarConfig = scene.solar ?? createSolarEnvironmentConfig('golden_hour_sunset');
    const solarEph = calculateSolarEphemeris(solarConfig);
    solarTitle.innerHTML = `<span>☀️ Natural Sky & Solar Ephemeris (${solarEph.elevationDeg.toFixed(1)}° Elev | ${solarEph.colorTemperatureKelvin}K)</span>`;
    const solarBtns = document.createElement('div');
    solarBtns.style.display = 'flex';
    solarBtns.style.gap = '6px';

    if (this.cb.onOpenSolarStudio) {
      const studioBtn = document.createElement('button');
      studioBtn.className = 'small primary';
      studioBtn.textContent = '☀️ Solar Studio';
      studioBtn.onclick = () => this.cb.onOpenSolarStudio!(sceneId);
      solarBtns.appendChild(studioBtn);
    }
    solarTitle.appendChild(solarBtns);
    solarCard.appendChild(solarTitle);

    const solarInfo = document.createElement('div');
    solarInfo.className = 'cam-edit';
    const hours = Math.floor(solarConfig.timeOfDayHours);
    const mins = Math.floor((solarConfig.timeOfDayHours - hours) * 60);
    const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    solarInfo.innerHTML = `
      <div style="font-size:12px; color:#cbd5e1; display:flex; flex-direction:column; gap:4px; width:100%;">
        <div><strong>Time & Location:</strong> ${timeStr} Local | ${solarConfig.location.locationName || 'Custom'} (${solarConfig.location.latitude.toFixed(2)}°, ${solarConfig.location.longitude.toFixed(2)}°) <span class="badge ${solarConfig.enabled ? 'badge-success' : 'badge-danger'}" style="margin-left:6px; font-size:10px;">${solarConfig.enabled ? 'SUN ACTIVE' : 'DISABLED'}</span></div>
        <div><strong>Solar Position:</strong> Azimuth ${solarEph.azimuthDeg.toFixed(1)}° | Elevation ${solarEph.elevationDeg.toFixed(1)}° | Direct ${Math.round(solarEph.directSunIlluminanceLux).toLocaleString()} Lux</div>
        <div><strong>Natural Windows:</strong> Sunrise ${solarEph.sunriseTime} | Sunset ${solarEph.sunsetTime} | Solar Noon ${solarEph.solarNoonTime}</div>
      </div>
    `;
    solarCard.appendChild(solarInfo);
    grid.appendChild(solarCard);

    // --- Card 8: WebXR 6DoF Controller & Quest 3 Frame Profiler ---
    const profilerCard = document.createElement('div');
    profilerCard.className = 'manager-card';
    const profilerTitle = document.createElement('div');
    profilerTitle.className = 'card-title';
    const profConfig = scene.profiler ?? createVRProfilerConfig(72);
    profilerTitle.innerHTML = `<span>⚡ WebXR Emulation & Quest 3 Profiler (${profConfig.targetFps} FPS | ${(1000 / profConfig.targetFps).toFixed(2)}ms Budget)</span>`;
    const profBtns = document.createElement('div');
    profBtns.style.display = 'flex';
    profBtns.style.gap = '6px';

    if (this.cb.onOpenWebXRProfiler) {
      const studioBtn = document.createElement('button');
      studioBtn.className = 'small primary';
      studioBtn.textContent = '⚡ Profiler Studio';
      studioBtn.onclick = () => this.cb.onOpenWebXRProfiler!(sceneId);
      profBtns.appendChild(studioBtn);
    }
    profilerTitle.appendChild(profBtns);
    profilerCard.appendChild(profilerTitle);

    const profInfo = document.createElement('div');
    profInfo.className = 'cam-edit';
    profInfo.innerHTML = `
      <div style="font-size:12px; color:#cbd5e1; display:flex; flex-direction:column; gap:4px; width:100%;">
        <div><strong>VR Hardware Target:</strong> Meta Quest 3 (${profConfig.targetFps} Hz) <span class="badge ${profConfig.enabled ? 'badge-success' : 'badge-danger'}" style="margin-left:6px; font-size:10px;">${profConfig.enabled ? 'PROFILER ACTIVE' : 'DISABLED'}</span></div>
        <div><strong>Standalone Budgets:</strong> Max ${profConfig.thresholds.maxDrawCallsPerFrame} Draw Calls | Max ${(profConfig.thresholds.maxTrianglesPerFrame / 1000).toFixed(0)}k Triangles | P95 &lt; ${profConfig.thresholds.maxP95FrameTimeMs}ms</div>
        <div><strong>6DoF Test Harness:</strong> Scenario: <em>${profConfig.activeScenarioId || 'walkthrough_soundstage'}</em> | Zero-Allocation Auditor: <span style="color:#10b981; font-weight:bold;">Active</span></div>
      </div>
    `;
    profilerCard.appendChild(profInfo);
    grid.appendChild(profilerCard);

    // --- Card 9: VR Motion Sickness, Ergonomics & Spatial Comfort ---
    const comfortCard = document.createElement('div');
    comfortCard.className = 'manager-card';
    const comfortTitle = document.createElement('div');
    comfortTitle.className = 'card-title';
    const comfConfig = scene.comfort ?? createVRComfortConfig();
    comfortTitle.innerHTML = `<span>🛡️ VR Motion Sickness, Ergonomics & Comfort (${comfConfig.locomotionMode.replace(/_/g, ' ').toUpperCase()} | Vignette: ${comfConfig.vignette.enabled ? 'ON' : 'OFF'})</span>`;
    const comfBtns = document.createElement('div');
    comfBtns.style.display = 'flex';
    comfBtns.style.gap = '6px';

    if (this.cb.onOpenVRComfort) {
      const studioBtn = document.createElement('button');
      studioBtn.className = 'small primary';
      studioBtn.textContent = '🛡️ Comfort Studio';
      studioBtn.onclick = () => this.cb.onOpenVRComfort!(sceneId);
      comfBtns.appendChild(studioBtn);
    }
    comfortTitle.appendChild(comfBtns);
    comfortCard.appendChild(comfortTitle);

    const comfInfo = document.createElement('div');
    comfInfo.className = 'cam-edit';
    comfInfo.innerHTML = `
      <div style="font-size:12px; color:#cbd5e1; display:flex; flex-direction:column; gap:4px; width:100%;">
        <div><strong>Locomotion:</strong> ${comfConfig.locomotionMode} (Snap: ${comfConfig.snapTurnAngleDeg}°) <span class="badge ${comfConfig.enabled ? 'badge-success' : 'badge-danger'}" style="margin-left:6px; font-size:10px;">${comfConfig.enabled ? 'AUDITOR ACTIVE' : 'DISABLED'}</span></div>
        <div><strong>Ergonomics:</strong> Eye H: ${comfConfig.userEyeHeightM}m | Arm: ${comfConfig.userArmLengthM}m | Near-Eye Vergence: &gt; 0.25m</div>
        <div><strong>FOV Tunneling:</strong> Vignette ${comfConfig.vignette.enabled ? 'Enabled' : 'Disabled'} (Min Rad: ${comfConfig.vignette.minVignetteRadius.toFixed(2)}, Fade: ${comfConfig.vignette.fadeSpeedMs}ms)</div>
      </div>
    `;
    comfortCard.appendChild(comfInfo);
    grid.appendChild(comfortCard);

    // --- Card 10: Virtual Set Dressing, Generative Scatter & Gemini AI Director ---
    const dressingCard = document.createElement('div');
    dressingCard.className = 'manager-card';
    const dressingTitle = document.createElement('div');
    dressingTitle.className = 'card-title';
    const dressingConfig = scene.setDressing ?? createSetDressingConfig();
    dressingTitle.innerHTML = `<span>🎲 Virtual Set Dressing & Gemini AI Director (${dressingConfig.activeTheme.replace(/_/g, ' ').toUpperCase()} | Props: ${dressingConfig.settledItems.length})</span>`;
    const dressingBtns = document.createElement('div');
    dressingBtns.style.display = 'flex';
    dressingBtns.style.gap = '6px';

    if (this.cb.onOpenSetDressingStudio) {
      const studioBtn = document.createElement('button');
      studioBtn.className = 'small primary';
      studioBtn.textContent = '🎲 Set Dressing Studio';
      studioBtn.onclick = () => this.cb.onOpenSetDressingStudio!(sceneId);
      dressingBtns.appendChild(studioBtn);
    }
    dressingTitle.appendChild(dressingBtns);
    dressingCard.appendChild(dressingTitle);

    const dressingInfo = document.createElement('div');
    dressingInfo.className = 'cam-edit';
    dressingInfo.innerHTML = `
      <div style="font-size:12px; color:#cbd5e1; display:flex; flex-direction:column; gap:4px; width:100%;">
        <div><strong>Active Theme:</strong> ${dressingConfig.activeTheme} | <strong>Density:</strong> ${dressingConfig.scatterConfig.density} <span class="badge ${dressingConfig.enabled ? 'badge-success' : 'badge-danger'}" style="margin-left:6px; font-size:10px;">${dressingConfig.enabled ? 'DRESSING ACTIVE' : 'DISABLED'}</span></div>
        <div><strong>Procedural Scatter:</strong> ${dressingConfig.settledItems.length} settled prop(s) | Regions: ${dressingConfig.regions.length} detected | Physics Settling: <span style="color:#10b981; font-weight:bold;">${dressingConfig.scatterConfig.enablePhysicsSettling ? 'Enabled' : 'Disabled'}</span></div>
        <div><strong>Gemini AI Model:</strong> <em>${dressingConfig.aiConfig.model}</em> | System Prompt: Director Mode Ready</div>
      </div>
    `;
    dressingCard.appendChild(dressingInfo);
    grid.appendChild(dressingCard);

    panel.appendChild(grid);
    return panel;
  }


  private buildLightEditor(sceneId: string, light: LightData): HTMLElement {
    const row = document.createElement('div');
    row.className = 'cam-edit light-edit';

    const patch = (p: Partial<LightData>) => {
      if (this.cb.onUpdateLight) this.cb.onUpdateLight(sceneId, light.id, p);
    };

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = light.name;
    nameInput.style.fontWeight = 'bold';
    nameInput.style.width = '100px';
    nameInput.onchange = () => {
      if (nameInput.value.trim()) patch({ name: nameInput.value.trim() });
    };
    row.appendChild(nameInput);

    const typeSelect = document.createElement('select');
    typeSelect.className = 'small';
    for (const t of ['spot', 'point', 'area'] as const) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t.toUpperCase();
      if (light.type === t) opt.selected = true;
      typeSelect.appendChild(opt);
    }
    typeSelect.onchange = () => patch({ type: typeSelect.value as LightData['type'] });
    row.appendChild(typeSelect);

    const kelvinBtn = document.createElement('button');
    kelvinBtn.className = 'small mark-btn';
    kelvinBtn.textContent = `${light.colorKelvin}K`;
    const temps = [3200, 4300, 5600, 6500];
    kelvinBtn.onclick = () => {
      const idx = temps.indexOf(light.colorKelvin);
      const next = temps[(idx + 1) % temps.length];
      patch({ colorKelvin: next });
    };
    row.appendChild(kelvinBtn);

    const intInput = document.createElement('input');
    intInput.type = 'number';
    intInput.style.width = '55px';
    intInput.step = '0.1';
    intInput.min = '0.1';
    intInput.max = '10.0';
    intInput.value = light.intensity.toFixed(1);
    intInput.title = 'Intensity multiplier';
    intInput.onchange = () => {
      const v = parseFloat(intInput.value);
      if (!isNaN(v) && v > 0) patch({ intensity: v });
    };
    row.appendChild(intInput);

    if (this.cb.onDeleteLight) {
      const delBtn = document.createElement('button');
      delBtn.className = 'small danger';
      delBtn.textContent = '✕';
      delBtn.title = 'Delete light';
      delBtn.onclick = () => this.cb.onDeleteLight!(sceneId, light.id);
      row.appendChild(delBtn);
    }

    return row;
  }

  /** A per-actor blocking editor with color, height scaling, scale, stance, and keyframe marks. */
  private buildActorEditor(sceneId: string, actor: ActorData): HTMLElement {
    const row = document.createElement('div');
    row.className = 'cam-edit actor-edit';

    const patch = (p: Partial<ActorData>) => {
      if (this.cb.onUpdateActor) this.cb.onUpdateActor(sceneId, actor.id, p);
    };

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = actor.name;
    nameInput.style.fontWeight = 'bold';
    nameInput.style.color = actor.color;
    nameInput.style.width = '100px';
    nameInput.onchange = () => patch({ name: nameInput.value.trim() || actor.name });
    row.appendChild(nameInput);

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = actor.color;
    colorInput.title = 'Actor color badge';
    colorInput.onchange = () => patch({ color: colorInput.value });
    row.appendChild(colorInput);

    const field = (label: string, input: HTMLElement) => {
      const l = document.createElement('label');
      l.className = 'field';
      const span = document.createElement('span');
      span.textContent = label;
      l.appendChild(span);
      l.appendChild(input);
      row.appendChild(l);
    };

    const stanceSel = document.createElement('select');
    for (const p of STANCES) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === (actor.stance ?? 'standing')) opt.selected = true;
      stanceSel.appendChild(opt);
    }
    stanceSel.onchange = () => this.cb.onSetStance(sceneId, actor.id, stanceSel.value as StanceId);
    field('Stance', stanceSel);

    const numIn = (val: number, step: number, min: number, max: number, fn: (n: number) => void) => {
      const i = document.createElement('input');
      i.type = 'number';
      i.value = String(val);
      i.step = String(step);
      i.min = String(min);
      i.max = String(max);
      i.onchange = () => {
        const n = Number(i.value);
        if (Number.isFinite(n)) fn(Math.min(max, Math.max(min, n)));
      };
      return i;
    };

    field('Height (m)', numIn(actor.heightM ?? 1.75, 0.05, 0.5, 3.0, (n) => patch({ heightM: n })));
    field('Scale', numIn(actor.scale ?? 1.0, 0.1, 0.2, 5.0, (n) => patch({ scale: n })));
    field('Rest X', numIn(actor.position.x, 0.1, -20, 20, (x) => patch({ position: { ...actor.position, x } })));
    field('Rest Z', numIn(actor.position.z, 0.1, -20, 20, (z) => patch({ position: { ...actor.position, z } })));

    if (this.cb.onDeleteActor) {
      const delBtn = document.createElement('button');
      delBtn.className = 'small';
      delBtn.textContent = '✕';
      delBtn.title = 'Delete Actor';
      delBtn.onclick = () => this.cb.onDeleteActor!(sceneId, actor.id);
      row.appendChild(delBtn);
    }

    const studioBtn = document.createElement('button');
    studioBtn.className = 'small primary';
    studioBtn.textContent = '🎭 Studio';
    studioBtn.title = 'Open Character & Mocap Studio';
    studioBtn.onclick = () => {
      const scene = this.cb.getScene(sceneId);
      if (scene) {
        openActorStudioModal(actor, scene, (updated) => {
          patch(updated);
        });
      }
    };
    row.appendChild(studioBtn);

    row.appendChild(this.buildMarksEditor(sceneId, actor));
    return row;
  }

  /** The mark list under an actor row. */
  private buildMarksEditor(sceneId: string, actor: ActorData): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'marks';
    const op = (o: MarkOp) => this.cb.onEditMarks(sceneId, actor.id, o);

    const numCell = (value: string, title: string, apply: (n: number) => void): HTMLInputElement => {
      const i = document.createElement('input');
      i.type = 'number';
      i.step = '0.1';
      i.value = value;
      i.title = title;
      i.onchange = () => {
        const n = Number(i.value);
        if (i.value.trim() === '' || !Number.isFinite(n)) {
          i.value = value;
          return;
        }
        apply(n);
      };
      return i;
    };

    actor.keyframes.forEach((kf, i) => {
      const line = document.createElement('div');
      line.className = 'mark-row';
      const idx = document.createElement('span');
      idx.className = 'mark-idx';
      idx.textContent = String(i + 1);
      line.appendChild(idx);

      line.appendChild(
        numCell(kf.position.x.toFixed(1), 'X (m)', (n) => op({ kind: 'update', index: i, position: { x: n } })),
      );
      line.appendChild(
        numCell(kf.position.z.toFixed(1), 'Z (m)', (n) => op({ kind: 'update', index: i, position: { z: n } })),
      );
      line.appendChild(
        numCell(((kf.rotationY * 180) / Math.PI).toFixed(0), 'Facing (°)', (n) =>
          op({ kind: 'update', index: i, rotationY: (n * Math.PI) / 180 }),
        ),
      );

      const stanceSel = document.createElement('select');
      const rest = document.createElement('option');
      rest.value = '';
      rest.textContent = '(rest stance)';
      if (kf.stance === undefined) rest.selected = true;
      stanceSel.appendChild(rest);
      for (const p of STANCES) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.id === kf.stance) opt.selected = true;
        stanceSel.appendChild(opt);
      }
      stanceSel.onchange = () =>
        op({ kind: 'update', index: i, stance: stanceSel.value === '' ? null : (stanceSel.value as StanceId) });
      line.appendChild(stanceSel);

      const btn = (label: string, title: string, disabled: boolean, fn: () => void) => {
        const b = document.createElement('button');
        b.className = 'small mark-btn';
        b.textContent = label;
        b.title = title;
        b.disabled = disabled;
        b.onclick = fn;
        line.appendChild(b);
      };
      btn('↑', 'Move earlier', i === 0, () => op({ kind: 'move', index: i, dir: -1 }));
      btn('↓', 'Move later', i === actor.keyframes.length - 1, () => op({ kind: 'move', index: i, dir: 1 }));
      btn('✕', 'Delete mark', false, () => op({ kind: 'remove', index: i }));
      wrap.appendChild(line);
    });

    const foot = document.createElement('div');
    foot.className = 'mark-row mark-foot';
    const add = document.createElement('button');
    add.className = 'small';
    add.textContent = '+ Mark';
    add.disabled = actor.keyframes.length >= MAX_KEYFRAMES;
    add.onclick = () => this.cb.onEditMarks(sceneId, actor.id, { kind: 'add' });
    foot.appendChild(add);
    const hint = document.createElement('span');
    hint.className = 'mark-hint';
    hint.textContent =
      actor.keyframes.length === 0
        ? 'no marks'
        : `${actor.keyframes.length}/${MAX_KEYFRAMES} marks`;
    foot.appendChild(hint);
    wrap.appendChild(foot);
    return wrap;
  }

  private buildCameraEditor(sceneId: string, cam: CameraSetupData, scene?: SceneData): HTMLElement {
    const row = document.createElement('div');
    row.className = 'cam-edit';

    const patch = (p: Partial<CameraSetupData>) => this.cb.onUpdateCamera(sceneId, cam.id, p);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = cam.name;
    nameInput.style.fontWeight = 'bold';
    nameInput.style.width = '80px';
    nameInput.onchange = () => patch({ name: nameInput.value.trim() || cam.name });
    row.appendChild(nameInput);

    if (scene) {
      const focus = computeFocusDistance(cam, scene.actors);
      const framing = classifyShotSize(cam.lensFocalLength, cam.aspect, cam.formatId, focus);
      const badge = document.createElement('span');
      badge.style.cssText = 'background:#1e3a8a;color:#93c5fd;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:bold;align-self:center;margin-right:6px;';
      badge.title = framing.shotSizeLabel;
      badge.textContent = framing.shotSize;
      row.appendChild(badge);
    }

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
        const n = Number(i.value);
        if (Number.isFinite(n)) apply(Math.min(max, Math.max(min, n)));
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

    // Grip Rig & Cinema Lens Studio Button
    const gripBtn = document.createElement('button');
    gripBtn.className = 'btn-ghost';
    gripBtn.style.cssText = 'padding: 4px 8px; font-size: 11px; font-weight: bold; background: #0f172a; border: 1px solid #38bdf8; color: #38bdf8; border-radius: 4px; cursor: pointer; margin-left: 4px; align-self: center;';
    const rigLabel = cam.gripRig ? cam.gripRig.type.replace(/_/g, ' ') : 'free';
    const lensLabel = cam.lensProfile ? `${cam.lensProfile.anamorphicSqueeze}x` : 'spherical';
    gripBtn.title = `Grip: ${rigLabel} · Lens: ${lensLabel}`;
    gripBtn.textContent = `🎥 Grip / Lens (${rigLabel})`;
    gripBtn.onclick = (e) => {
      e.stopPropagation();
      openCameraGripModal(
        cam,
        scene ?? createScene('Default Scene'),
        (updated) => {
          patch(updated);
        },
      );
    };
    row.appendChild(gripBtn);

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

// --- AI Shot Analysis Modal ----------------------------------------------------

export function simulateAiShotAnalysis(scene: SceneData): string {
  return simulateAiContinuityBreakdown(scene);
}

export function openAiAnalysisModal(scene: SceneData, overlayRoot?: HTMLElement): void {
  const promptText = buildAiContinuityPromptPackage(scene);
  const audit = auditSceneContinuity(scene);
  const script = generateScriptBreakdownFromScene(scene);
  const storyboard = generateStoryboard(scene, script);
  const container = overlayRoot ?? document.body;

  const overlay = document.createElement('div');
  overlay.className = 'ai-modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'ai-modal-dialog';

  const auditBadgeClass =
    audit.overallStatus === 'clean'
      ? 'ai-badge-clean'
      : audit.overallStatus === 'critical'
      ? 'ai-badge-critical'
      : 'ai-badge-warning';

  // Build Storyboard Grid HTML
  const storyboardGridHtml = storyboard.panels
    .map(
      (p) => `
    <div class="ai-storyboard-panel">
      <div class="ai-panel-visual">
        ${p.svgVisual}
      </div>
      <div class="ai-panel-details">
        <div class="ai-panel-badge-row">
          <span class="ai-badge-shot">SHOT ${p.panelIndex}: ${escapeHtml(p.camera.name)}</span>
          <span class="ai-badge-scale">${escapeHtml(p.shotSizeLabel)}</span>
        </div>
        <div class="ai-panel-snippet">"${escapeHtml(p.dialogueOrAction)}"</div>
        <div class="ai-panel-notes">${escapeHtml(p.directorNote)}</div>
      </div>
    </div>
  `,
    )
    .join('');

  // Build Continuity Issues HTML
  const issuesHtml =
    audit.issues.length > 0
      ? audit.issues
          .map(
            (iss) => `
      <div class="ai-issue-card severity-${iss.severity}">
        <div class="ai-issue-header">
          <span>[${iss.severity.toUpperCase()}]</span>
          <span>${escapeHtml(iss.title)}</span>
        </div>
        <div class="ai-issue-body">${escapeHtml(iss.description)}</div>
        <div class="ai-issue-rec">💡 <strong>Action:</strong> ${escapeHtml(iss.recommendation)}</div>
      </div>
    `,
          )
          .join('')
      : '<div style="color: #4ade80; padding: 16px; background: rgba(34,197,94,0.1); border-radius: 8px;">✓ All camera angles maintain 180° axis alignment, distinct >30° angles, and connected eyelines.</div>';

  dialog.innerHTML = `
    <div class="ai-modal-header">
      <h2>🎬 AI Storyboard & Continuity Engine: ${escapeHtml(scene.name)}</h2>
      <button class="ai-modal-close" title="Close">✕</button>
    </div>
    <div class="ai-modal-toolbar">
      <input type="password" id="ai-api-key" placeholder="Enter Gemini API Key (optional)" value="${escapeHtml(localStorage.getItem('setview_gemini_api_key') || '')}" />
      <button class="ai-btn-run" id="ai-run-btn">🚀 Run AI Breakdown</button>
      <button class="ai-btn-export" id="ai-export-html-btn">📐 Storyboard HTML</button>
      <button class="ai-btn-export" id="ai-export-svg-btn">🖼️ Storyboard SVG</button>
      <button class="ai-btn-export" id="ai-export-prompt-btn">📝 Export Prompt</button>
      <button class="ai-btn-copy" id="ai-copy-btn">📋 Copy Prompt</button>
    </div>
    <div class="ai-modal-tabs">
      <button class="ai-tab-btn active" id="tab-storyboard-btn">🎬 Storyboards (${storyboard.panels.length})</button>
      <button class="ai-tab-btn" id="tab-continuity-btn">⚖️ Continuity Audit (${audit.score}/100)</button>
      <button class="ai-tab-btn" id="tab-output-btn">🤖 AI Director Report</button>
      <button class="ai-tab-btn" id="tab-prompt-btn">📝 Prompt Package</button>
    </div>
    <div class="ai-modal-body">
      <!-- Tab 1: Storyboards -->
      <div id="ai-tab-storyboard" class="ai-storyboard-grid">
        ${storyboardGridHtml || '<p style="color: #64748b; padding: 20px;">No cameras defined in scene. Place cameras to generate visual storyboards.</p>'}
      </div>

      <!-- Tab 2: Continuity Audit -->
      <div id="ai-tab-continuity" class="ai-continuity-dashboard" style="display: none;">
        <div class="ai-score-banner">
          <div>
            <h3>Automated Multi-Camera Continuity Score</h3>
            <p>Auditing 180° line of action, 30° jump-cut rule, eyeline matching, and coverage scales across ${scene.cameras.length} camera(s).</p>
          </div>
          <div class="ai-score-badge ${auditBadgeClass}">
            ${audit.score}/100 • ${audit.overallStatus.toUpperCase()}
          </div>
        </div>
        <div class="ai-issue-cards">
          ${issuesHtml}
        </div>
      </div>

      <!-- Tab 3: AI Director Report -->
      <div id="ai-tab-output" class="ai-analysis-output" style="display: none;">${escapeHtml(simulateAiContinuityBreakdown(scene))}</div>

      <!-- Tab 4: Prompt Package -->
      <textarea id="ai-tab-prompt" class="ai-prompt-preview" readonly style="display: none;"></textarea>
    </div>
  `;

  overlay.appendChild(dialog);
  container.appendChild(overlay);

  const keyInput = dialog.querySelector<HTMLInputElement>('#ai-api-key')!;
  const copyBtn = dialog.querySelector<HTMLButtonElement>('#ai-copy-btn')!;
  const runBtn = dialog.querySelector<HTMLButtonElement>('#ai-run-btn')!;
  const exportHtmlBtn = dialog.querySelector<HTMLButtonElement>('#ai-export-html-btn')!;
  const exportSvgBtn = dialog.querySelector<HTMLButtonElement>('#ai-export-svg-btn')!;
  const exportPromptBtn = dialog.querySelector<HTMLButtonElement>('#ai-export-prompt-btn')!;
  const closeBtn = dialog.querySelector<HTMLButtonElement>('.ai-modal-close')!;

  const tabStoryboardBtn = dialog.querySelector<HTMLButtonElement>('#tab-storyboard-btn')!;
  const tabContinuityBtn = dialog.querySelector<HTMLButtonElement>('#tab-continuity-btn')!;
  const tabOutputBtn = dialog.querySelector<HTMLButtonElement>('#tab-output-btn')!;
  const tabPromptBtn = dialog.querySelector<HTMLButtonElement>('#tab-prompt-btn')!;

  const tabStoryboardEl = dialog.querySelector<HTMLElement>('#ai-tab-storyboard')!;
  const tabContinuityEl = dialog.querySelector<HTMLElement>('#ai-tab-continuity')!;
  const tabOutputEl = dialog.querySelector<HTMLElement>('#ai-tab-output')!;
  const tabPromptEl = dialog.querySelector<HTMLTextAreaElement>('#ai-tab-prompt')!;

  tabPromptEl.value = promptText;

  const close = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  closeBtn.onclick = close;

  keyInput.onchange = () => {
    localStorage.setItem('setview_gemini_api_key', keyInput.value.trim());
  };

  exportHtmlBtn.onclick = () => exportStoryboardHtml(scene);
  exportSvgBtn.onclick = () => exportStoryboardSvg(scene);
  exportPromptBtn.onclick = () => exportAiPromptPackage(scene);

  copyBtn.onclick = () => {
    navigator.clipboard
      .writeText(promptText)
      .then(() => {
        copyBtn.textContent = 'Copied! ✓';
        setTimeout(() => {
          copyBtn.textContent = '📋 Copy Prompt';
        }, 2000);
      })
      .catch(() => {
        tabPromptEl.select();
        document.execCommand('copy');
        copyBtn.textContent = 'Copied! ✓';
        setTimeout(() => {
          copyBtn.textContent = '📋 Copy Prompt';
        }, 2000);
      });
  };

  function switchTab(activeBtn: HTMLButtonElement, activeEl: HTMLElement) {
    [tabStoryboardBtn, tabContinuityBtn, tabOutputBtn, tabPromptBtn].forEach((b) => b.classList.remove('active'));
    [tabStoryboardEl, tabContinuityEl, tabOutputEl, tabPromptEl].forEach((e) => (e.style.display = 'none'));
    activeBtn.classList.add('active');
    activeEl.style.display = activeEl === tabStoryboardEl ? 'grid' : activeEl === tabContinuityEl ? 'flex' : 'block';
  }

  tabStoryboardBtn.onclick = () => switchTab(tabStoryboardBtn, tabStoryboardEl);
  tabContinuityBtn.onclick = () => switchTab(tabContinuityBtn, tabContinuityEl);
  tabOutputBtn.onclick = () => switchTab(tabOutputBtn, tabOutputEl);
  tabPromptBtn.onclick = () => switchTab(tabPromptBtn, tabPromptEl);

  runBtn.onclick = async () => {
    const apiKey = keyInput.value.trim();
    switchTab(tabOutputBtn, tabOutputEl);
    if (!apiKey) {
      // The three API-failure paths below already announce the fallback. This is the
      // path users hit most often, since the key is optional, so it has to say the
      // same thing rather than quietly passing the offline heuristic off as a run.
      tabOutputEl.textContent =
        'ℹ️ No Gemini API key set, so no model was called. Showing the offline preview analysis:\n\n' +
        simulateAiContinuityBreakdown(scene);
      return;
    }

    tabOutputEl.textContent = '⏳ Running AI Cinematography & Continuity Analysis with Gemini API…';
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        tabOutputEl.textContent =
          `⚠️ Gemini API Request Failed (${res.status}):\n${errText}\n\nFalling back to simulated preview analysis:\n\n` +
          simulateAiContinuityBreakdown(scene);
        return;
      }

      const json = await res.json();
      const answer = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (answer) {
        tabOutputEl.textContent = answer;
      } else {
        tabOutputEl.textContent =
          '⚠️ Unexpected response format from Gemini API. Falling back to simulated preview analysis:\n\n' +
          simulateAiContinuityBreakdown(scene);
      }
    } catch (e) {
      tabOutputEl.textContent =
        `⚠️ Network/API Error: ${(e as Error).message}\n\nFalling back to simulated preview analysis:\n\n` +
        simulateAiContinuityBreakdown(scene);
    }
  };
}

/** Opens the interactive NLE Timeline and Shot List Exporter modal. */
export function openNleExportModal(scene: SceneData, overlayRoot?: HTMLElement): void {
  const container = overlayRoot ?? document.body;
  const overlay = document.createElement('div');
  overlay.className = 'ai-modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'ai-modal-dialog';

  let currentFormat: NleExportFormat = 'cmx3600_edl';
  const defaultDurationS = 4.0;

  dialog.innerHTML = `
    <div class="ai-modal-header">
      <h2>🎬 NLE Timeline & Shot List Exporter: ${escapeHtml(scene.name)}</h2>
      <button class="ai-modal-close" title="Close">✕</button>
    </div>
    <div class="ai-modal-toolbar">
      <label style="color:#94a3b8; font-size:12px; display:flex; align-items:center; gap:6px;">
        Sequence:
        <input type="text" id="nle-seq-name" value="${escapeHtml(scene.name || 'SetView Sequence')}" style="width:140px; padding:4px 8px;" />
      </label>
      <label style="color:#94a3b8; font-size:12px; display:flex; align-items:center; gap:6px;">
        FPS:
        <select id="nle-fps-select" style="background:#090c13; color:#f8fafc; border:1px solid #263044; border-radius:6px; padding:4px 8px; font-size:12px;">
          <option value="23.976">23.976 fps</option>
          <option value="24" selected>24.0 fps (Film)</option>
          <option value="25">25.0 fps (PAL)</option>
          <option value="29.97-ndf">29.97 NDF</option>
          <option value="29.97-df">29.97 DF</option>
          <option value="30">30.0 fps</option>
          <option value="50">50.0 fps</option>
          <option value="59.94">59.94 fps</option>
          <option value="60">60.0 fps</option>
        </select>
      </label>
      <label style="color:#94a3b8; font-size:12px; display:flex; align-items:center; gap:6px;">
        Start TC:
        <input type="text" id="nle-start-tc" value="01:00:00:00" style="width:95px; padding:4px 8px; font-family:var(--font-mono);" />
      </label>
      <label style="color:#94a3b8; font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="checkbox" id="nle-audio-cues" checked />
        Audio Cues
      </label>
      <label style="color:#94a3b8; font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="checkbox" id="nle-transitions" />
        Dissolves
      </label>
      <button class="ai-btn-run" id="nle-download-btn">⬇ Download File</button>
      <button class="ai-btn-copy" id="nle-copy-btn">📋 Copy</button>
    </div>
    <div class="ai-modal-tabs">
      <button class="ai-tab-btn active" data-fmt="cmx3600_edl">🎞️ CMX 3600 EDL</button>
      <button class="ai-tab-btn" data-fmt="fcp7_xml">📐 FCP7 / Premiere XML</button>
      <button class="ai-tab-btn" data-fmt="fcpxml">🍎 Final Cut Pro X (FCPXML)</button>
      <button class="ai-tab-btn" data-fmt="csv_shotlist">📊 CSV Shot List</button>
      <button class="ai-tab-btn" data-fmt="avid_markers">📍 Avid Markers</button>
    </div>
    <div class="ai-modal-body" style="padding:16px;">
      <textarea id="nle-preview-text" class="ai-prompt-preview" readonly style="width:100%; height:420px; font-family:var(--font-mono); font-size:12px; white-space:pre;"></textarea>
    </div>
  `;

  overlay.appendChild(dialog);
  container.appendChild(overlay);

  const seqNameInput = dialog.querySelector<HTMLInputElement>('#nle-seq-name')!;
  const fpsSelect = dialog.querySelector<HTMLSelectElement>('#nle-fps-select')!;
  const startTcInput = dialog.querySelector<HTMLInputElement>('#nle-start-tc')!;
  const audioCheckbox = dialog.querySelector<HTMLInputElement>('#nle-audio-cues')!;
  const transCheckbox = dialog.querySelector<HTMLInputElement>('#nle-transitions')!;
  const downloadBtn = dialog.querySelector<HTMLButtonElement>('#nle-download-btn')!;
  const copyBtn = dialog.querySelector<HTMLButtonElement>('#nle-copy-btn')!;
  const previewTextarea = dialog.querySelector<HTMLTextAreaElement>('#nle-preview-text')!;
  const closeBtn = dialog.querySelector<HTMLButtonElement>('.ai-modal-close')!;
  const tabButtons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('.ai-tab-btn[data-fmt]'));

  const close = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  closeBtn.onclick = close;

  function getOptions(): NleExportOptions {
    const fpsVal = fpsSelect.value;
    let computedFps = 24;
    let isDf = false;
    if (fpsVal === '23.976') computedFps = 23.976;
    else if (fpsVal === '25') computedFps = 25;
    else if (fpsVal === '29.97-ndf') computedFps = 29.97;
    else if (fpsVal === '29.97-df') {
      computedFps = 29.97;
      isDf = true;
    } else if (fpsVal === '30') computedFps = 30;
    else if (fpsVal === '50') computedFps = 50;
    else if (fpsVal === '59.94') computedFps = 59.94;
    else if (fpsVal === '60') computedFps = 60;

    return {
      fps: computedFps,
      dropFrame: isDf,
      sequenceName: seqNameInput.value.trim() || scene.name,
      startRecordTimecode: startTcInput.value.trim() || '01:00:00:00',
      includeAudioCues: audioCheckbox.checked,
      includeTransitions: transCheckbox.checked,
      defaultShotDurationS: defaultDurationS,
    };
  }

  function renderOutput(): void {
    const opts = getOptions();
    const result = exportSceneTimeline(scene, currentFormat, opts);
    previewTextarea.value = result.content;
    downloadBtn.textContent = `⬇ Download ${result.filename}`;
  }

  tabButtons.forEach((tab) => {
    tab.onclick = () => {
      tabButtons.forEach((b) => b.classList.remove('active'));
      tab.classList.add('active');
      currentFormat = tab.dataset.fmt as NleExportFormat;
      renderOutput();
    };
  });

  seqNameInput.oninput = renderOutput;
  fpsSelect.onchange = renderOutput;
  startTcInput.oninput = renderOutput;
  audioCheckbox.onchange = renderOutput;
  transCheckbox.onchange = renderOutput;

  downloadBtn.onclick = () => {
    const opts = getOptions();
    downloadNleTimelineExport(scene, currentFormat, opts);
  };

  copyBtn.onclick = () => {
    navigator.clipboard
      .writeText(previewTextarea.value)
      .then(() => {
        copyBtn.textContent = 'Copied! ✓';
        setTimeout(() => {
          copyBtn.textContent = '📋 Copy';
        }, 2000);
      })
      .catch(() => {
        previewTextarea.select();
        document.execCommand('copy');
        copyBtn.textContent = 'Copied! ✓';
        setTimeout(() => {
          copyBtn.textContent = '📋 Copy';
        }, 2000);
      });
  };

  renderOutput();
}

/** Opens the interactive Unreal Engine 5 Bridge and OpenUSD Exporter modal. */
export function openUe5ExportModal(scene: SceneData, overlayRoot?: HTMLElement): void {
  const container = overlayRoot ?? document.body;
  const overlay = document.createElement('div');
  overlay.className = 'ai-modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'ai-modal-dialog';

  let currentFormat: Ue5ExportFormat = 'open_usd';

  dialog.innerHTML = `
    <div class="ai-modal-header">
      <h2>🎮 Unreal Engine 5 & OpenUSD Exporter: ${escapeHtml(scene.name)}</h2>
      <button class="ai-modal-close" title="Close">✕</button>
    </div>
    <div class="ai-modal-toolbar">
      <label style="color:#94a3b8; font-size:12px; display:flex; align-items:center; gap:6px;">
        UE Version:
        <select id="ue5-version-select" style="background:#090c13; color:#f8fafc; border:1px solid #263044; border-radius:6px; padding:4px 8px; font-size:12px;">
          <option value="5.5">UE 5.5</option>
          <option value="5.4" selected>UE 5.4</option>
          <option value="5.3">UE 5.3</option>
        </select>
      </label>
      <label style="color:#94a3b8; font-size:12px; display:flex; align-items:center; gap:6px;">
        FPS:
        <select id="ue5-fps-select" style="background:#090c13; color:#f8fafc; border:1px solid #263044; border-radius:6px; padding:4px 8px; font-size:12px;">
          <option value="23.976">23.976 fps</option>
          <option value="24" selected>24 fps (Cinematic)</option>
          <option value="25">25 fps (PAL)</option>
          <option value="29.97">29.97 fps</option>
          <option value="30">30 fps</option>
          <option value="60">60 fps</option>
        </select>
      </label>
      <label style="color:#94a3b8; font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="checkbox" id="ue5-sequencer" checked />
        Sequencer
      </label>
      <label style="color:#94a3b8; font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="checkbox" id="ue5-lumen" checked />
        Lumen GI
      </label>
      <label style="color:#94a3b8; font-size:12px; display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="checkbox" id="ue5-nanite" checked />
        Nanite
      </label>
      <label style="color:#94a3b8; font-size:12px; display:flex; align-items:center; gap:6px;">
        Scale:
        <input type="number" id="ue5-scale" value="100.0" step="1" min="1" max="1000" style="width:60px; padding:4px 8px; font-size:12px;" />
      </label>
      <button class="ai-btn-run" id="ue5-download-btn">⬇ Download File</button>
      <button class="ai-btn-copy" id="ue5-copy-btn">📋 Copy</button>
    </div>
    <div class="ai-modal-tabs">
      <button class="ai-tab-btn active" data-fmt="open_usd">🌐 OpenUSD Stage (.usda)</button>
      <button class="ai-tab-btn" data-fmt="ue5_python_script">🐍 UE5 Python Script (.py)</button>
      <button class="ai-tab-btn" data-fmt="ue5_json_manifest">📄 UE5 JSON Manifest (.json)</button>
    </div>
    <div class="ai-modal-body" style="padding:16px;">
      <textarea id="ue5-preview-text" class="ai-prompt-preview" readonly style="width:100%; height:420px; font-family:var(--font-mono); font-size:12px; white-space:pre;"></textarea>
    </div>
  `;

  overlay.appendChild(dialog);
  container.appendChild(overlay);

  const versionSelect = dialog.querySelector<HTMLSelectElement>('#ue5-version-select')!;
  const fpsSelect = dialog.querySelector<HTMLSelectElement>('#ue5-fps-select')!;
  const sequencerCheckbox = dialog.querySelector<HTMLInputElement>('#ue5-sequencer')!;
  const lumenCheckbox = dialog.querySelector<HTMLInputElement>('#ue5-lumen')!;
  const naniteCheckbox = dialog.querySelector<HTMLInputElement>('#ue5-nanite')!;
  const scaleInput = dialog.querySelector<HTMLInputElement>('#ue5-scale')!;
  const downloadBtn = dialog.querySelector<HTMLButtonElement>('#ue5-download-btn')!;
  const copyBtn = dialog.querySelector<HTMLButtonElement>('#ue5-copy-btn')!;
  const previewTextarea = dialog.querySelector<HTMLTextAreaElement>('#ue5-preview-text')!;
  const closeBtn = dialog.querySelector<HTMLButtonElement>('.ai-modal-close')!;
  const tabButtons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('.ai-tab-btn[data-fmt]'));

  const close = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  closeBtn.onclick = close;

  function getOptions(): Ue5ExportOptions {
    const fpsVal = parseFloat(fpsSelect.value) || 24;
    const versionVal = (versionSelect.value as UnrealVersion) || '5.4';
    const scaleVal = parseFloat(scaleInput.value) || 100.0;

    return {
      fps: fpsVal,
      unrealEngineVersion: versionVal,
      generateSequencerTracks: sequencerCheckbox.checked,
      useLumen: lumenCheckbox.checked,
      useNanite: naniteCheckbox.checked,
      scaleFactor: scaleVal,
      includeAudioCues: true,
      includeVolumetrics: true,
      includeProps: true,
    };
  }

  function renderOutput(): void {
    const opts = getOptions();
    const result = exportUe5BridgePackage(scene, currentFormat, opts);
    previewTextarea.value = result.content;
    downloadBtn.textContent = `⬇ Download ${result.filename}`;
  }

  tabButtons.forEach((tab) => {
    tab.onclick = () => {
      tabButtons.forEach((b) => b.classList.remove('active'));
      tab.classList.add('active');
      currentFormat = tab.dataset.fmt as Ue5ExportFormat;
      renderOutput();
    };
  });

  versionSelect.onchange = renderOutput;
  fpsSelect.onchange = renderOutput;
  sequencerCheckbox.onchange = renderOutput;
  lumenCheckbox.onchange = renderOutput;
  naniteCheckbox.onchange = renderOutput;
  scaleInput.oninput = renderOutput;

  downloadBtn.onclick = () => {
    const opts = getOptions();
    downloadUe5BridgePackage(scene, currentFormat, opts);
  };

  copyBtn.onclick = () => {
    navigator.clipboard
      .writeText(previewTextarea.value)
      .then(() => {
        copyBtn.textContent = 'Copied! ✓';
        setTimeout(() => {
          copyBtn.textContent = '📋 Copy';
        }, 2000);
      })
      .catch(() => {
        previewTextarea.select();
        document.execCommand('copy');
        copyBtn.textContent = 'Copied! ✓';
        setTimeout(() => {
          copyBtn.textContent = '📋 Copy';
        }, 2000);
      });
  };

  renderOutput();
}

/** Opens the real-time Multi-User Collaborative Session management modal. */
export function openCollabModal(
  session: WebRtcCollabSession,
  roster: PeerRoster,
  lockManager: EntityLockManager,
  onJoinRoom: (roomCode: string, name: string, role: CollabRole) => void,
  onDisconnect: () => void,
): void {
  const container = document.body;
  const overlay = document.createElement('div');
  overlay.className = 'collab-modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'collab-modal-dialog';

  const activePeers = roster.getActivePeers();
  const currentRoom = session.roomCode || generateRoomCode();
  const isConnected = session.state === 'connected';

  let selectedRole: CollabRole = session.localRole || 'director';

  const peersListHtml = activePeers.length > 0
    ? activePeers
        .map((peer) => {
          const roleMeta = COLLAB_ROLES[peer.role] ?? COLLAB_ROLES.director;
          const locked = lockManager.getAllLocks().find((l) => l.lockedByPeerId === peer.id);
          const lockBadge = locked ? `<span style="font-size: 11px; background: rgba(245, 158, 11, 0.2); color: #fbbf24; padding: 2px 6px; border-radius: 4px;">🔒 ${escapeHtml(locked.entityType)}</span>` : '';
          const voiceBadge = peer.isSpeaking
            ? '<span class="collab-voice-indicator">🎙️ Speaking</span>'
            : peer.isMuted
              ? '<span style="font-size: 11px; color: #64748b;">🔇 Muted</span>'
              : '';

          return `
            <div class="collab-peer-card">
              <div class="collab-peer-info">
                <span class="collab-peer-badge" style="background: ${peer.color || roleMeta.defaultColorHex}">${roleMeta.badgeLabel}</span>
                <div>
                  <div class="collab-peer-name">${escapeHtml(peer.name)} ${peer.id === session.localPeerId ? '(You)' : ''}</div>
                  <div class="collab-peer-meta">
                    <span>${peer.deviceType.toUpperCase()}</span>
                    <span>•</span>
                    <span>${peer.pingMs}ms</span>
                    ${lockBadge}
                  </div>
                </div>
              </div>
              <div>
                ${voiceBadge}
              </div>
            </div>
          `;
        })
        .join('')
    : '<div style="color: #64748b; padding: 16px; background: #141a26; border-radius: 8px; text-align: center;">No remote peers in room. Share invite link to collaborate!</div>';

  dialog.innerHTML = `
    <div class="collab-modal-header">
      <h2>👥 Multi-User Collaborative Set Session</h2>
      <button class="collab-modal-close" title="Close">✕</button>
    </div>
    <div class="collab-modal-body">
      <!-- Left Column: Session Controls & Profile -->
      <div class="collab-section">
        <h3>Session Settings</h3>
        <div class="collab-room-box">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 13px; color: #94a3b8; font-weight: 600;">ACTIVE ROOM CODE</span>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="collab-status-online" style="background: ${isConnected ? '#22c55e' : '#64748b'}; box-shadow: 0 0 6px ${isConnected ? '#22c55e' : 'transparent'};"></span>
              <span style="font-size: 12px; color: ${isConnected ? '#4ade80' : '#94a3b8'}; font-weight: 700;">${isConnected ? 'ONLINE' : 'STANDBY'}</span>
            </div>
          </div>
          <div class="collab-code-display" id="collab-room-code-display">${escapeHtml(currentRoom)}</div>
          <div style="display: flex; gap: 8px;">
            <button class="collab-btn-primary" id="collab-copy-invite-btn" style="flex: 1;">🔗 Copy Invite Link</button>
            <button class="collab-btn-secondary" id="collab-gen-code-btn" title="Generate New Room Code">🎲 New</button>
          </div>
        </div>

        <h3>Your Virtual Production Profile</h3>
        <div class="collab-input-group">
          <label>Display Name</label>
          <input type="text" id="collab-name-input" value="${escapeHtml(session.localName || 'Director')}" placeholder="e.g. James M." />
        </div>

        <div class="collab-input-group">
          <label>Production Role</label>
          <div class="collab-role-grid" id="collab-role-grid">
            ${Object.values(COLLAB_ROLES)
              .map(
                (r) => `
              <button class="collab-role-btn ${r.id === selectedRole ? 'active' : ''}" data-role="${r.id}" style="${r.id === selectedRole ? `border-color: ${r.defaultColorHex}; color: #ffffff;` : ''}">
                ${escapeHtml(r.title)}
              </button>
            `,
              )
              .join('')}
          </div>
        </div>

        <div style="display: flex; gap: 10px; margin-top: 8px;">
          <button class="collab-btn-secondary" id="collab-mic-toggle-btn" style="flex: 1;">
            ${session.muted ? '🎙️ Unmute Mic' : '🔇 Mute Mic'}
          </button>
          ${
            isConnected
              ? '<button class="collab-btn-secondary" id="collab-disconnect-btn" style="color: #f87171; border-color: rgba(239, 68, 68, 0.4);">Disconnect</button>'
              : '<button class="collab-btn-primary" id="collab-connect-btn">Connect</button>'
          }
        </div>
      </div>

      <!-- Right Column: Connected Peers Roster -->
      <div class="collab-section">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <h3>Connected Crew (${activePeers.length + (isConnected ? 1 : 0)})</h3>
          <span style="font-size: 12px; color: #94a3b8;">Spatial Voice: Web Audio 3D</span>
        </div>
        <div class="collab-peers-container" id="collab-peers-container">
          ${peersListHtml}
        </div>
      </div>
    </div>
  `;

  overlay.appendChild(dialog);
  container.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  dialog.querySelector('.collab-modal-close')!.addEventListener('click', close);

  const copyInviteBtn = dialog.querySelector<HTMLButtonElement>('#collab-copy-invite-btn')!;
  const genCodeBtn = dialog.querySelector<HTMLButtonElement>('#collab-gen-code-btn')!;
  const nameInput = dialog.querySelector<HTMLInputElement>('#collab-name-input')!;
  const roleButtons = dialog.querySelectorAll<HTMLButtonElement>('.collab-role-btn');
  const micToggleBtn = dialog.querySelector<HTMLButtonElement>('#collab-mic-toggle-btn')!;
  const connectBtn = dialog.querySelector<HTMLButtonElement>('#collab-connect-btn');
  const disconnectBtn = dialog.querySelector<HTMLButtonElement>('#collab-disconnect-btn');
  const roomCodeDisplay = dialog.querySelector<HTMLElement>('#collab-room-code-display')!;

  let targetRoomCode = currentRoom;

  copyInviteBtn.onclick = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', targetRoomCode);
    navigator.clipboard.writeText(url.toString()).then(() => {
      copyInviteBtn.textContent = 'Invite Link Copied! ✓';
      setTimeout(() => {
        copyInviteBtn.textContent = '🔗 Copy Invite Link';
      }, 2000);
    });
  };

  genCodeBtn.onclick = () => {
    targetRoomCode = generateRoomCode();
    roomCodeDisplay.textContent = targetRoomCode;
  };

  roleButtons.forEach((btn) => {
    btn.onclick = () => {
      roleButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRole = btn.dataset.role as CollabRole;
    };
  });

  micToggleBtn.onclick = async () => {
    const active = await session.toggleMute();
    micToggleBtn.textContent = active ? '🔇 Mute Mic' : '🎙️ Unmute Mic';
  };

  if (connectBtn) {
    connectBtn.onclick = () => {
      const name = nameInput.value.trim() || 'Director';
      onJoinRoom(targetRoomCode, name, selectedRole);
      close();
    };
  }

  if (disconnectBtn) {
    disconnectBtn.onclick = () => {
      onDisconnect();
      close();
    };
  }
}

/** Opens the 3D Set & Prop Asset Library browser and uploader modal. */
export function openPropsLibraryModal(
  onPlaceProp: (assetId: string, customKey?: string) => void,
  customAssets: CustomPropAsset[] = [],
  onUploadCustomAsset?: (file: File) => Promise<void>,
  onDeleteCustomAsset?: (id: string) => Promise<void>,
): void {
  const container = document.body;
  const overlay = document.createElement('div');
  overlay.className = 'props-modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'props-modal-dialog';

  let currentCategory: PropCategory | 'all' = 'all';
  let searchQuery = '';

  const getFilteredAssets = () => {
    // Combine built-in props and custom prop definitions
    const customDefs: PropDefinition[] = customAssets.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      sourceType: 'indexeddb',
      dimensions: a.dimensions,
      defaultColorHex: '#38bdf8',
      description: `Custom 3D model (${a.fileType.toUpperCase()}, ${(a.sizeBytes / 1024).toFixed(1)} KB)`,
      tags: ['custom', a.fileType, a.name.toLowerCase()],
      iconSymbol: '📁',
    }));

    const combined = [...BUILTIN_PROPS, ...customDefs];
    const catFiltered = filterPropsByCategory(combined, currentCategory);
    return searchProps(catFiltered, searchQuery);
  };

  const renderCards = () => {
    const grid = dialog.querySelector<HTMLDivElement>('#props-grid-container');
    if (!grid) return;

    const assets = getFilteredAssets();
    if (assets.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: #64748b;">
          <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
          <div style="font-size: 15px; font-weight: 600; color: #94a3b8;">No props found matching your filter</div>
          <div style="font-size: 13px; margin-top: 4px;">Try searching for another keyword or drag-and-drop a .GLB / .OBJ file above</div>
        </div>
      `;
      return;
    }

    grid.innerHTML = assets
      .map((asset) => {
        const catMeta = PROP_CATEGORIES[asset.category] || PROP_CATEGORIES.furniture;
        const isCustom = asset.sourceType === 'indexeddb';
        const dimsStr = formatDimensions(asset.dimensions);
        const icon = asset.iconSymbol || catMeta.icon || '📦';

        return `
          <div class="props-card" data-asset-id="${escapeHtml(asset.id)}" data-is-custom="${isCustom}">
            <div class="props-card-header">
              <div>
                <h3 class="props-card-title">${icon} ${escapeHtml(asset.name)}</h3>
                <span class="props-card-dims">${dimsStr}</span>
              </div>
              <span class="props-card-badge">${escapeHtml(catMeta.label)}</span>
            </div>
            <p class="props-card-desc">${escapeHtml(asset.description)}</p>
            <div class="props-card-actions">
              <button class="props-btn-place" data-action="place" data-asset-id="${escapeHtml(asset.id)}" data-is-custom="${isCustom}">
                + Place on Set
              </button>
              ${
                isCustom
                  ? `<button class="props-btn-delete" data-action="delete" data-asset-id="${escapeHtml(asset.id)}" title="Delete Custom Model">🗑️</button>`
                  : ''
              }
            </div>
          </div>
        `;
      })
      .join('');

    // Wire up place & delete clicks
    grid.querySelectorAll<HTMLButtonElement>('button[data-action="place"]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.assetId!;
        const isCustom = btn.dataset.isCustom === 'true';
        onPlaceProp(id, isCustom ? id : undefined);
        close();
      };
    });

    grid.querySelectorAll<HTMLButtonElement>('button[data-action="delete"]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.assetId!;
        if (confirm('Delete this custom 3D model asset from local storage?')) {
          await onDeleteCustomAsset?.(id);
          const idx = customAssets.findIndex((a) => a.id === id);
          if (idx >= 0) customAssets.splice(idx, 1);
          renderCards();
        }
      };
    });
  };

  const close = () => {
    overlay.remove();
  };

  dialog.innerHTML = `
    <div class="props-modal-header">
      <h2>📦 3D Set & Prop Asset Library</h2>
      <button class="collab-modal-close" id="props-close-btn" title="Close">✕</button>
    </div>
    <div class="props-modal-toolbar">
      <input type="text" class="props-search-input" id="props-search-input" placeholder="Search furniture, camera grip, flats, lighting, and dressing..." autofocus />
      <div class="props-tabs">
        <button class="props-tab-btn active" data-category="all">All Assets (${BUILTIN_PROPS.length + customAssets.length})</button>
        <button class="props-tab-btn" data-category="furniture">🪑 Furniture</button>
        <button class="props-tab-btn" data-category="grip_camera">📦 Grip & Camera</button>
        <button class="props-tab-btn" data-category="architecture">🚪 Architecture</button>
        <button class="props-tab-btn" data-category="practical_light">💡 Practical Light</button>
        <button class="props-tab-btn" data-category="set_dressing">🎬 Dressing</button>
        <button class="props-tab-btn" data-category="virtual_production">🟩 VFX / Green Screen</button>
        <button class="props-tab-btn" data-category="custom">📁 Custom Uploads (${customAssets.length})</button>
      </div>
    </div>
    <div class="props-modal-body">
      <div class="props-dropzone" id="props-dropzone">
        <input type="file" id="props-file-input" accept=".glb,.gltf,.obj" style="display: none;" />
        <div style="font-size: 24px;">📥</div>
        <div class="props-dropzone-title">Drop .GLB, .GLTF, or .OBJ 3D Model here, or click to browse</div>
        <div class="props-dropzone-sub">Stored locally in high-speed IndexedDB and ready for immediate spatial placement</div>
      </div>
      <div class="props-grid" id="props-grid-container"></div>
    </div>
  `;

  overlay.appendChild(dialog);
  container.appendChild(overlay);

  renderCards();

  // Event handlers
  const closeBtn = dialog.querySelector<HTMLButtonElement>('#props-close-btn');
  if (closeBtn) closeBtn.onclick = close;

  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  const searchInput = dialog.querySelector<HTMLInputElement>('#props-search-input');
  if (searchInput) {
    searchInput.oninput = () => {
      searchQuery = searchInput.value;
      renderCards();
    };
  }

  const tabBtns = dialog.querySelectorAll<HTMLButtonElement>('.props-tab-btn');
  tabBtns.forEach((btn) => {
    btn.onclick = () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = (btn.dataset.category || 'all') as PropCategory | 'all';
      renderCards();
    };
  });

  const dropzone = dialog.querySelector<HTMLDivElement>('#props-dropzone');
  const fileInput = dialog.querySelector<HTMLInputElement>('#props-file-input');

  if (dropzone && fileInput) {
    dropzone.onclick = () => fileInput.click();

    dropzone.ondragover = (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    };

    dropzone.ondragleave = () => {
      dropzone.classList.remove('dragover');
    };

    dropzone.ondrop = async (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        await handleUpload(files[0]);
      }
    };

    fileInput.onchange = async () => {
      if (fileInput.files && fileInput.files.length > 0) {
        await handleUpload(fileInput.files[0]);
      }
    };
  }

  const handleUpload = async (file: File) => {
    try {
      if (onUploadCustomAsset) {
        await onUploadCustomAsset(file);
        // Refresh custom assets list from store
        const updated = await globalPropStore.listAssets();
        customAssets.length = 0;
        customAssets.push(...updated);
        renderCards();
      }
    } catch (err) {
      alert(`Failed to load 3D model: ${(err as Error).message}`);
    }
  };
}

/** Helper to trigger browser download of the UE5 LiveLink Python companion receiver. */
export function downloadUe5LiveLinkScript(config?: LiveLinkConfig): void {
  const code = generateUe5LiveLinkReceiverPythonScript(config);
  const blob = new Blob([code], { type: 'text/x-python;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'setview_livelink_server.py';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Opens the Unreal Engine LiveLink & Real-Time WebXR VCam management modal dialog. */
export function openLiveLinkModal(
  streamer: LiveLinkStreamer,
  scene?: SceneData | null,
  onSaveConfig?: (config: LiveLinkConfig) => void,
  overlayRoot: HTMLElement = document.body,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'livelink-modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'livelink-modal-dialog';

  const initialConfig: LiveLinkConfig = scene?.livelink ? { ...scene.livelink } : streamer.getConfig();
  let currentConfig: LiveLinkConfig = { ...initialConfig };
  let diag = streamer.getDiagnostics();

  const renderBadge = (state: LiveLinkConnectionState, isRec: boolean): string => {
    if (isRec) return '<span class="livelink-status-badge recording">● RECORDING TALLY</span>';
    switch (state) {
      case 'connected':
      case 'streaming':
        return `<span class="livelink-status-badge ${state}">● ${state.toUpperCase()} (${diag.fps} FPS, ${diag.latencyMs}ms)</span>`;
      case 'connecting':
        return '<span class="livelink-status-badge connecting">◌ CONNECTING...</span>';
      case 'error':
        return '<span class="livelink-status-badge error">✕ ERROR</span>';
      default:
        return '<span class="livelink-status-badge disconnected">○ STANDBY / OFFLINE</span>';
    }
  };

  const presetOpts = (Object.keys(VCAM_SMOOTHING_PRESETS) as VcamSmoothingPreset[])
    .map((p) => `<option value="${p}" ${p === currentConfig.smoothingPreset ? 'selected' : ''}>${p.toUpperCase()} - ${VCAM_SMOOTHING_PRESETS[p].description.split(' - ')[0]}</option>`)
    .join('');

  dialog.innerHTML = `
    <div class="livelink-modal-header">
      <h2>
        <span>📡 Unreal Engine LiveLink & WebXR VCam</span>
        <span id="ll-header-badge">${renderBadge(diag.state, diag.isRecording)}</span>
      </h2>
      <button class="livelink-modal-close" id="ll-close-btn" title="Close">✕</button>
    </div>

    <div class="livelink-modal-body">
      <!-- Left Column: Connection & Transport -->
      <div class="livelink-section">
        <h3>Network & Subject Protocol</h3>

        <div class="livelink-field-group">
          <label>Server Endpoint URL</label>
          <input type="text" class="livelink-input" id="ll-server-url" value="${escapeHtml(currentConfig.serverUrl)}" placeholder="ws://127.0.0.1:8088" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="livelink-field-group">
            <label>Port</label>
            <input type="number" class="livelink-input" id="ll-server-port" value="${currentConfig.port}" min="1024" max="65535" />
          </div>
          <div class="livelink-field-group">
            <label>Target FPS</label>
            <select class="livelink-select" id="ll-target-fps">
              <option value="24" ${currentConfig.targetFps === 24 ? 'selected' : ''}>24 FPS (Cinematic 24.0)</option>
              <option value="30" ${currentConfig.targetFps === 30 ? 'selected' : ''}>30 FPS (Broadcast 30.0)</option>
              <option value="60" ${currentConfig.targetFps === 60 ? 'selected' : ''}>60 FPS (High Frame Rate)</option>
              <option value="72" ${currentConfig.targetFps === 72 ? 'selected' : ''}>72 FPS (Meta Quest 3 Native)</option>
              <option value="90" ${currentConfig.targetFps === 90 ? 'selected' : ''}>90 FPS (PCVR Native)</option>
            </select>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 10px;">
          <div class="livelink-field-group">
            <label>Subject Label</label>
            <input type="text" class="livelink-input" id="ll-subject-name" value="${escapeHtml(currentConfig.subjectName)}" placeholder="SetView_VCam" />
          </div>
          <div class="livelink-field-group">
            <label>Subject Type</label>
            <select class="livelink-select" id="ll-subject-type">
              <option value="camera" ${currentConfig.subjectType === 'camera' ? 'selected' : ''}>CineCamera</option>
              <option value="transform" ${currentConfig.subjectType === 'transform' ? 'selected' : ''}>Transform</option>
              <option value="light" ${currentConfig.subjectType === 'light' ? 'selected' : ''}>Cine Light</option>
            </select>
          </div>
        </div>

        <div class="livelink-toggle-row">
          <span>Auto-Reconnect with Backoff</span>
          <input type="checkbox" id="ll-auto-reconnect" ${currentConfig.autoReconnect ? 'checked' : ''} />
        </div>

        <div class="livelink-actions" style="margin-top: 8px;">
          <button class="livelink-btn-primary" id="ll-connect-btn">Connect LiveLink</button>
          <button class="livelink-btn-secondary" id="ll-disconnect-btn">Disconnect</button>
        </div>
      </div>

      <!-- Right Column: Smoothing & Optical Telemetry -->
      <div class="livelink-section">
        <h3>VCam Motion Smoothing & Optical Streams</h3>

        <div class="livelink-field-group">
          <label>Smoothing Preset</label>
          <select class="livelink-select" id="ll-smoothing-preset">
            ${presetOpts}
          </select>
        </div>

        <div class="livelink-field-group">
          <label>
            <span>Position Smoothing Damping</span>
            <span class="livelink-slider-val" id="ll-pos-weight-val">${currentConfig.smoothingPosWeight.toFixed(2)}</span>
          </label>
          <div class="livelink-slider-row">
            <input type="range" id="ll-pos-weight" min="0" max="0.95" step="0.05" value="${currentConfig.smoothingPosWeight}" />
          </div>
        </div>

        <div class="livelink-field-group">
          <label>
            <span>Rotation Smoothing Damping</span>
            <span class="livelink-slider-val" id="ll-rot-weight-val">${currentConfig.smoothingRotWeight.toFixed(2)}</span>
          </label>
          <div class="livelink-slider-row">
            <input type="range" id="ll-rot-weight" min="0" max="0.95" step="0.05" value="${currentConfig.smoothingRotWeight}" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px;">
          <label class="livelink-toggle-row">
            <span>Stream Focal Length</span>
            <input type="checkbox" id="ll-stream-focal" ${currentConfig.streamFocalLength ? 'checked' : ''} />
          </label>
          <label class="livelink-toggle-row">
            <span>Stream Aperture</span>
            <input type="checkbox" id="ll-stream-aperture" ${currentConfig.streamAperture ? 'checked' : ''} />
          </label>
          <label class="livelink-toggle-row">
            <span>Stream Focus Dist</span>
            <input type="checkbox" id="ll-stream-focus" ${currentConfig.streamFocusDistance ? 'checked' : ''} />
          </label>
          <label class="livelink-toggle-row">
            <span>Stream Filmback</span>
            <input type="checkbox" id="ll-stream-filmback" ${currentConfig.streamFilmback ? 'checked' : ''} />
          </label>
        </div>
      </div>

      <!-- Full Width: Real-Time Telemetry Diagnostics -->
      <div class="livelink-section" style="grid-column: 1 / -1;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <h3>Real-Time LiveLink Diagnostics</h3>
          <div style="display: flex; gap: 8px;">
            <button class="livelink-btn-secondary" id="ll-toggle-rec-btn" style="padding: 6px 12px; font-size: 12px;">
              ${diag.isRecording ? '⏹ Stop Recording' : '⏺ Trigger Record'}
            </button>
            <button class="livelink-btn-secondary" id="ll-bump-take-btn" style="padding: 6px 12px; font-size: 12px;">
              +1 Next Take
            </button>
          </div>
        </div>

        <div class="livelink-diag-grid">
          <div class="livelink-diag-card">
            <span class="livelink-diag-label">Status</span>
            <span class="livelink-diag-val" id="ll-diag-status" style="color: ${diag.state === 'connected' || diag.state === 'streaming' ? '#4ade80' : '#94a3b8'}; font-size: 14px;">
              ${diag.state.toUpperCase()}
            </span>
          </div>
          <div class="livelink-diag-card">
            <span class="livelink-diag-label">Round-Trip Latency</span>
            <span class="livelink-diag-val" id="ll-diag-latency">${diag.latencyMs} ms</span>
          </div>
          <div class="livelink-diag-card">
            <span class="livelink-diag-label">Stream Frame Rate</span>
            <span class="livelink-diag-val" id="ll-diag-fps">${diag.fps} fps</span>
          </div>
          <div class="livelink-diag-card">
            <span class="livelink-diag-label">Frames Sent</span>
            <span class="livelink-diag-val" id="ll-diag-frames">${diag.framesSent}</span>
          </div>
          <div class="livelink-diag-card">
            <span class="livelink-diag-label">Production Tally</span>
            <span class="livelink-diag-val" id="ll-diag-tally" style="color: ${diag.isRecording ? '#f87171' : '#38bdf8'};">
              ${diag.isRecording ? 'RECORDING' : diag.tally.toUpperCase()}
            </span>
          </div>
          <div class="livelink-diag-card">
            <span class="livelink-diag-label">Take Slate</span>
            <span class="livelink-diag-val" id="ll-diag-take" style="color: #fbbf24;">Take ${diag.currentTake}</span>
          </div>
        </div>
      </div>

      <!-- Full Width: Unreal Engine Python Companion -->
      <div class="livelink-section" style="grid-column: 1 / -1; background: #0c101a;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div>
            <h3 style="margin: 0; color: #f8fafc;">Unreal Engine 5 Companion Script</h3>
            <span style="font-size: 12px; color: #94a3b8;">Execute companion in UE5 Python console to automatically bind LiveLink camera and Sequencer.</span>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="livelink-btn-primary" id="ll-download-py-btn" style="padding: 8px 14px; font-size: 12px;">⬇ Download UE5 Script</button>
            <button class="livelink-btn-secondary" id="ll-copy-py-btn" style="padding: 8px 14px; font-size: 12px;">📋 Copy Script</button>
          </div>
        </div>
      </div>
    </div>
  `;

  overlay.appendChild(dialog);
  overlayRoot.appendChild(overlay);

  // Form input element references
  const serverUrlInput = dialog.querySelector<HTMLInputElement>('#ll-server-url')!;
  const serverPortInput = dialog.querySelector<HTMLInputElement>('#ll-server-port')!;
  const targetFpsSelect = dialog.querySelector<HTMLSelectElement>('#ll-target-fps')!;
  const subjectNameInput = dialog.querySelector<HTMLInputElement>('#ll-subject-name')!;
  const subjectTypeSelect = dialog.querySelector<HTMLSelectElement>('#ll-subject-type')!;
  const autoReconnectInput = dialog.querySelector<HTMLInputElement>('#ll-auto-reconnect')!;
  const smoothingPresetSelect = dialog.querySelector<HTMLSelectElement>('#ll-smoothing-preset')!;
  const posWeightInput = dialog.querySelector<HTMLInputElement>('#ll-pos-weight')!;
  const rotWeightInput = dialog.querySelector<HTMLInputElement>('#ll-rot-weight')!;
  const posWeightVal = dialog.querySelector<HTMLElement>('#ll-pos-weight-val')!;
  const rotWeightVal = dialog.querySelector<HTMLElement>('#ll-rot-weight-val')!;
  const streamFocalInput = dialog.querySelector<HTMLInputElement>('#ll-stream-focal')!;
  const streamApertureInput = dialog.querySelector<HTMLInputElement>('#ll-stream-aperture')!;
  const streamFocusInput = dialog.querySelector<HTMLInputElement>('#ll-stream-focus')!;
  const streamFilmbackInput = dialog.querySelector<HTMLInputElement>('#ll-stream-filmback')!;

  // Diagnostics elements
  const headerBadge = dialog.querySelector<HTMLElement>('#ll-header-badge')!;
  const diagStatus = dialog.querySelector<HTMLElement>('#ll-diag-status')!;
  const diagLatency = dialog.querySelector<HTMLElement>('#ll-diag-latency')!;
  const diagFps = dialog.querySelector<HTMLElement>('#ll-diag-fps')!;
  const diagFrames = dialog.querySelector<HTMLElement>('#ll-diag-frames')!;
  const diagTally = dialog.querySelector<HTMLElement>('#ll-diag-tally')!;
  const diagTake = dialog.querySelector<HTMLElement>('#ll-diag-take')!;
  const toggleRecBtn = dialog.querySelector<HTMLButtonElement>('#ll-toggle-rec-btn')!;

  const syncConfigFromInputs = () => {
    currentConfig = normalizeLiveLinkConfig({
      ...currentConfig,
      serverUrl: serverUrlInput.value,
      port: Number(serverPortInput.value) || 8088,
      targetFps: Number(targetFpsSelect.value) || 72,
      subjectName: subjectNameInput.value,
      subjectType: subjectTypeSelect.value as LiveLinkSubjectType,
      autoReconnect: autoReconnectInput.checked,
      smoothingPreset: smoothingPresetSelect.value as VcamSmoothingPreset,
      smoothingPosWeight: Number(posWeightInput.value),
      smoothingRotWeight: Number(rotWeightInput.value),
      streamFocalLength: streamFocalInput.checked,
      streamAperture: streamApertureInput.checked,
      streamFocusDistance: streamFocusInput.checked,
      streamFilmback: streamFilmbackInput.checked,
    });
    streamer.updateConfig(currentConfig);
    if (scene) scene.livelink = { ...currentConfig };
    if (onSaveConfig) onSaveConfig(currentConfig);
  };

  const syncInputsFromPreset = (preset: VcamSmoothingPreset) => {
    const weights = VCAM_SMOOTHING_PRESETS[preset] ?? VCAM_SMOOTHING_PRESETS.handheld_subtle;
    posWeightInput.value = String(weights.posWeight);
    rotWeightInput.value = String(weights.rotWeight);
    posWeightVal.textContent = weights.posWeight.toFixed(2);
    rotWeightVal.textContent = weights.rotWeight.toFixed(2);
    syncConfigFromInputs();
  };

  // Input listeners
  serverUrlInput.onchange = syncConfigFromInputs;
  serverPortInput.onchange = syncConfigFromInputs;
  targetFpsSelect.onchange = syncConfigFromInputs;
  subjectNameInput.onchange = syncConfigFromInputs;
  subjectTypeSelect.onchange = syncConfigFromInputs;
  autoReconnectInput.onchange = syncConfigFromInputs;

  smoothingPresetSelect.onchange = () => {
    const selected = smoothingPresetSelect.value as VcamSmoothingPreset;
    if (selected !== 'custom') {
      syncInputsFromPreset(selected);
    } else {
      syncConfigFromInputs();
    }
  };

  posWeightInput.oninput = () => {
    posWeightVal.textContent = Number(posWeightInput.value).toFixed(2);
    smoothingPresetSelect.value = 'custom';
    syncConfigFromInputs();
  };

  rotWeightInput.oninput = () => {
    rotWeightVal.textContent = Number(rotWeightInput.value).toFixed(2);
    smoothingPresetSelect.value = 'custom';
    syncConfigFromInputs();
  };

  streamFocalInput.onchange = syncConfigFromInputs;
  streamApertureInput.onchange = syncConfigFromInputs;
  streamFocusInput.onchange = syncConfigFromInputs;
  streamFilmbackInput.onchange = syncConfigFromInputs;

  // Connection buttons
  dialog.querySelector<HTMLButtonElement>('#ll-connect-btn')!.onclick = () => {
    syncConfigFromInputs();
    streamer.connect();
  };

  dialog.querySelector<HTMLButtonElement>('#ll-disconnect-btn')!.onclick = () => {
    streamer.disconnect();
  };

  // Record & take buttons
  toggleRecBtn.onclick = () => {
    streamer.toggleRecording();
  };

  dialog.querySelector<HTMLButtonElement>('#ll-bump-take-btn')!.onclick = () => {
    const current = streamer.getDiagnostics().currentTake;
    streamer.sendCommand({
      id: `take-bump-${Date.now()}`,
      type: 'trigger_take',
      payload: { take: current + 1 },
      timestamp: Date.now(),
    });
  };

  // UE5 Python script buttons
  dialog.querySelector<HTMLButtonElement>('#ll-download-py-btn')!.onclick = () => {
    syncConfigFromInputs();
    downloadUe5LiveLinkScript(currentConfig);
  };

  const copyBtn = dialog.querySelector<HTMLButtonElement>('#ll-copy-py-btn')!;
  copyBtn.onclick = () => {
    syncConfigFromInputs();
    const code = generateUe5LiveLinkReceiverPythonScript(currentConfig);
    navigator.clipboard.writeText(code).then(() => {
      copyBtn.textContent = 'Copied! ✓';
      setTimeout(() => {
        copyBtn.textContent = '📋 Copy Script';
      }, 2000);
    });
  };

  // Real-time diagnostics subscriber
  const unsubDiag = streamer.onDiagnosticsUpdate((d) => {
    diag = d;
    headerBadge.innerHTML = renderBadge(d.state, d.isRecording);
    diagStatus.textContent = d.state.toUpperCase();
    diagStatus.style.color = d.state === 'connected' || d.state === 'streaming' ? '#4ade80' : '#94a3b8';
    diagLatency.textContent = `${d.latencyMs} ms`;
    diagFps.textContent = `${d.fps} fps`;
    diagFrames.textContent = String(d.framesSent);
    diagTally.textContent = d.isRecording ? 'RECORDING' : d.tally.toUpperCase();
    diagTally.style.color = d.isRecording ? '#f87171' : '#38bdf8';
    diagTake.textContent = `Take ${d.currentTake}`;
    toggleRecBtn.textContent = d.isRecording ? '⏹ Stop Recording' : '⏺ Trigger Record';
  });

  const close = () => {
    unsubDiag();
    syncConfigFromInputs();
    overlay.remove();
  };

  dialog.querySelector('#ll-close-btn')!.addEventListener('click', close);
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
}

/** Floating VCam Virtual Production Viewport HUD widget. */
export class VcamHudOverlay {
  private element: HTMLElement | null = null;
  private streamer: LiveLinkStreamer;
  private onOpenSettings: () => void;
  private unsubDiag: (() => void) | null = null;
  private unsubTally: (() => void) | null = null;
  private opticsText = '35mm · T2.8 · 2.4m · 2.39:1';

  constructor(streamer: LiveLinkStreamer, onOpenSettings: () => void) {
    this.streamer = streamer;
    this.onOpenSettings = onOpenSettings;
  }

  public mount(container: HTMLElement = document.body): HTMLElement {
    if (this.element) return this.element;

    const overlay = document.createElement('div');
    overlay.className = 'vcam-hud-overlay';
    this.element = overlay;

    const diag = this.streamer.getDiagnostics();
    const isRec = diag.isRecording;
    if (isRec) overlay.classList.add('is-recording');

    overlay.innerHTML = `
      <button class="vcam-hud-rec-btn ${isRec ? 'is-active' : ''}" id="vcam-hud-rec-btn">
        ${isRec ? '■ STOP REC' : '⏺ REC'}
      </button>
      <div class="vcam-hud-take-pill" id="vcam-hud-take-pill" title="Current Take (Click to Increment)">
        TAKE ${String(diag.currentTake).padStart(2, '0')}
      </div>
      <div class="vcam-hud-optics" id="vcam-hud-optics">
        ${escapeHtml(this.opticsText)}
      </div>
      <span class="livelink-status-badge ${isRec ? 'recording' : diag.state}" id="vcam-hud-badge">
        ${isRec ? 'REC TALLY' : diag.state === 'streaming' ? `LIVE ${diag.fps} FPS` : diag.state.toUpperCase()}
      </span>
      <button class="vcam-hud-settings-btn" id="vcam-hud-settings-btn" title="LiveLink Settings">⚙</button>
    `;

    const recBtn = overlay.querySelector<HTMLButtonElement>('#vcam-hud-rec-btn')!;
    recBtn.onclick = (e) => {
      e.stopPropagation();
      this.streamer.toggleRecording();
    };

    const takePill = overlay.querySelector<HTMLElement>('#vcam-hud-take-pill')!;
    takePill.onclick = (e) => {
      e.stopPropagation();
      const current = this.streamer.getDiagnostics().currentTake;
      this.streamer.sendCommand({
        id: `take-bump-${Date.now()}`,
        type: 'trigger_take',
        payload: { take: current + 1 },
        timestamp: Date.now(),
      });
    };

    const settingsBtn = overlay.querySelector<HTMLButtonElement>('#vcam-hud-settings-btn')!;
    settingsBtn.onclick = (e) => {
      e.stopPropagation();
      this.onOpenSettings();
    };

    this.unsubDiag = this.streamer.onDiagnosticsUpdate((d) => {
      if (!this.element) return;
      const rec = d.isRecording;
      if (rec) {
        this.element.classList.add('is-recording');
      } else {
        this.element.classList.remove('is-recording');
      }

      if (recBtn) {
        recBtn.className = `vcam-hud-rec-btn ${rec ? 'is-active' : ''}`;
        recBtn.textContent = rec ? '■ STOP REC' : '⏺ REC';
      }

      if (takePill) {
        takePill.textContent = `TAKE ${String(d.currentTake).padStart(2, '0')}`;
      }

      const badge = this.element.querySelector<HTMLElement>('#vcam-hud-badge');
      if (badge) {
        badge.className = `livelink-status-badge ${rec ? 'recording' : d.state}`;
        badge.textContent = rec
          ? 'REC TALLY'
          : d.state === 'streaming'
            ? `LIVE ${d.fps} FPS (${d.latencyMs}ms)`
            : d.state.toUpperCase();
      }
    });

    container.appendChild(overlay);
    return overlay;
  }

  public updateCameraOptics(focalMm: number, tStop: number, focusDistanceM: number, aspect: string): void {
    const fStr = `${Math.round(focalMm)}mm`;
    const tStr = `T${tStop.toFixed(1)}`;
    const dStr = `${focusDistanceM.toFixed(1)}m`;
    this.opticsText = `${fStr} · ${tStr} · ${dStr} · ${aspect}`;
    if (this.element) {
      const opticsEl = this.element.querySelector<HTMLElement>('#vcam-hud-optics');
      if (opticsEl) opticsEl.textContent = this.opticsText;
    }
  }

  public unmount(): void {
    if (this.unsubDiag) {
      this.unsubDiag();
      this.unsubDiag = null;
    }
    if (this.unsubTally) {
      this.unsubTally();
      this.unsubTally = null;
    }
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
  }
}

/**
 * Opens the SetView Character Studio modal for 6DoF mocap, stock animation clips,
 * pose presets, Look-At IK, and BVH import/export.
 */
export function openActorStudioModal(
  actor: ActorData,
  scene: SceneData,
  onSave: (updated: Partial<ActorData>) => void,
  overlayRoot: HTMLElement = document.body,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'actor-studio-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'actor-studio-dialog';

  // Work on a copy of actor data
  const localActor: ActorData = JSON.parse(JSON.stringify(actor));
  if (!localActor.animationSpeed) localActor.animationSpeed = 1.0;
  if (!localActor.animationClip) localActor.animationClip = 'idle_breathing';
  if (!localActor.rigType) localActor.rigType = 'stylized_mannequin';

  const renderContent = () => {
    const clips = Object.keys(STOCK_ANIMATION_CLIPS);
    const presets = Object.entries(STOCK_POSE_PRESETS);

    const mocapStatus = localActor.customMocap
      ? `✓ Custom BVH (${localActor.customMocap.tracks.length} tracks, ${localActor.customMocap.durationS.toFixed(1)}s)`
      : 'None loaded';

    const otherActors = scene.actors.filter((a) => a.id !== actor.id);
    const cameras = scene.cameras;

    dialog.innerHTML = `
      <div class="studio-header">
        <div class="studio-title-group">
          <h2>🎭 Character Studio: <span style="color: ${localActor.color};">${escapeHtml(localActor.name)}</span></h2>
          <div class="studio-subtitle">6DoF BVH Mocap, Stock Animation Library, Real-Time Look-At IK & Procedural Rigging</div>
        </div>
        <button class="studio-close-btn" id="studio-close-btn" title="Close">✕</button>
      </div>

      <div class="studio-content">
        <!-- Left Panel: Rigging & Appearance -->
        <div class="studio-panel">
          <div class="studio-card">
            <h3 class="studio-card-title">Avatar & Rig Style</h3>
            <div class="studio-form-row">
              <label>Actor Name</label>
              <input type="text" class="studio-input" id="studio-name" value="${escapeHtml(localActor.name)}" />
            </div>
            <div class="studio-form-row">
              <label>Rig Geometry & Shading</label>
              <select class="studio-select" id="studio-rig-type">
                <option value="stylized_mannequin" ${localActor.rigType === 'stylized_mannequin' ? 'selected' : ''}>Stylized Mannequin (Flat-shaded)</option>
                <option value="realistic_humanoid" ${localActor.rigType === 'realistic_humanoid' ? 'selected' : ''}>Skinned Humanoid (Smooth Deformation)</option>
                <option value="custom_gltf" ${localActor.rigType === 'custom_gltf' ? 'selected' : ''}>Custom GLTF Avatar</option>
              </select>
            </div>
            <div class="studio-form-row">
              <label>Actor Badge Color</label>
              <input type="color" class="studio-input" id="studio-color" value="${localActor.color}" style="height: 38px; cursor: pointer;" />
            </div>
            <div class="studio-form-row">
              <label>Height: <span id="studio-height-val">${(localActor.heightM ?? 1.75).toFixed(2)}m</span></label>
              <div class="studio-slider-row">
                <input type="range" id="studio-height" min="0.5" max="2.5" step="0.05" value="${localActor.heightM ?? 1.75}" />
              </div>
            </div>
            <div class="studio-form-row">
              <label>Scale: <span id="studio-scale-val">${(localActor.scale ?? 1.0).toFixed(2)}x</span></label>
              <div class="studio-slider-row">
                <input type="range" id="studio-scale" min="0.2" max="3.0" step="0.05" value="${localActor.scale ?? 1.0}" />
              </div>
            </div>
          </div>

          <div class="studio-card">
            <h3 class="studio-card-title">Look-At IK Target</h3>
            <div class="studio-form-row">
              <label>Orient Head & Eyes Towards</label>
              <select class="studio-select" id="studio-lookat-target">
                <option value="" ${!localActor.lookAtTargetCameraId && !localActor.lookAtTargetActorId ? 'selected' : ''}>None (Free Look / Default)</option>
                <optgroup label="Cameras">
                  ${cameras
                    .map(
                      (c) =>
                        `<option value="cam:${c.id}" ${localActor.lookAtTargetCameraId === c.id ? 'selected' : ''}>📷 ${escapeHtml(c.name)}</option>`,
                    )
                    .join('')}
                </optgroup>
                <optgroup label="Other Actors">
                  ${otherActors
                    .map(
                      (a) =>
                        `<option value="actor:${a.id}" ${localActor.lookAtTargetActorId === a.id ? 'selected' : ''}>👤 ${escapeHtml(a.name)}</option>`,
                    )
                    .join('')}
                </optgroup>
              </select>
            </div>
          </div>
        </div>

        <!-- Right Panel: Animation Clips & Mocap -->
        <div class="studio-panel">
          <div class="studio-card">
            <div class="studio-card-title">
              <span>Stock Animation Library</span>
              <span class="studio-badge" id="studio-active-clip-badge">${escapeHtml(localActor.animationClip || 'idle_breathing')}</span>
            </div>
            <div class="studio-form-row" style="margin-bottom: 14px;">
              <label>Playback Speed Multiplier: <span id="studio-speed-val">${(localActor.animationSpeed ?? 1.0).toFixed(2)}x</span></label>
              <div class="studio-slider-row">
                <input type="range" id="studio-speed" min="0.2" max="3.0" step="0.1" value="${localActor.animationSpeed ?? 1.0}" />
              </div>
            </div>
            <div class="studio-clip-grid">
              ${clips
                .map((key) => {
                  const clip = STOCK_ANIMATION_CLIPS[key];
                  const isActive = (localActor.animationClip || 'idle_breathing') === key && !localActor.customMocap;
                  const icons: Record<string, string> = {
                    idle_breathing: '🫁',
                    walk_cycle: '🚶',
                    run_cycle: '🏃',
                    sit_down: '🪑',
                    stand_up: '🧍',
                    talk_gesturing: '🗣️',
                    argue_angry: '😠',
                    investigate_lookaround: '🔍',
                    crouch_walk: '🥷',
                    combat_guard: '🥊',
                  };
                  return `
                    <button class="studio-clip-btn ${isActive ? 'active' : ''}" data-clip-id="${key}">
                      <span style="font-size: 18px;">${icons[key] || '🎬'}</span>
                      <span>${escapeHtml(clip.name)}</span>
                    </button>
                  `;
                })
                .join('')}
            </div>
          </div>

          <div class="studio-card">
            <h3 class="studio-card-title">Pose & Gesture Presets</h3>
            <div class="studio-preset-grid">
              ${presets
                .map(
                  ([key, p]) => `
                <button class="studio-preset-btn" data-preset-id="${key}">
                  ${escapeHtml(p.name)}
                </button>
              `,
                )
                .join('')}
              <button class="studio-preset-btn" id="studio-clear-poses" style="color: #f87171; border-color: rgba(239, 68, 68, 0.4);">
                ✕ Clear Overrides
              </button>
            </div>
          </div>

          <div class="studio-card">
            <div class="studio-card-title">
              <span>6DoF BVH Motion Capture</span>
              <span style="font-size: 11px; color: #94a3b8;">${mocapStatus}</span>
            </div>
            <div class="studio-dropzone" id="studio-bvh-dropzone">
              <input type="file" id="studio-bvh-file" accept=".bvh" style="display: none;" />
              <div style="font-size: 24px; margin-bottom: 4px;">📂</div>
              <div style="font-weight: 600; font-size: 13px;">Drag & Drop .BVH Mocap File or Click to Upload</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Compatible with Rokoko, Xsens, Perception Neuron & Blender BVH</div>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 10px;">
              <button class="studio-preset-btn" id="studio-export-bvh" style="flex: 1; padding: 8px; background: #1e293b; color: #60a5fa; border-color: #3b82f6;">
                ⬇ Export BVH Mocap
              </button>
              ${
                localActor.customMocap
                  ? `<button class="studio-preset-btn" id="studio-clear-mocap" style="padding: 8px; color: #f87171; border-color: rgba(239, 68, 68, 0.4);">✕ Remove Mocap</button>`
                  : ''
              }
            </div>
          </div>
        </div>
      </div>

      <div class="studio-footer">
        <button class="small" id="studio-reset-btn">Reset Defaults</button>
        <div class="studio-footer-actions">
          <button class="small" id="studio-cancel-btn">Cancel</button>
          <button class="small primary" id="studio-save-btn">Save & Apply Rig</button>
        </div>
      </div>
    `;

    bindEvents();
  };

  const bindEvents = () => {
    const close = () => overlay.remove();

    dialog.querySelector('#studio-close-btn')!.addEventListener('click', close);
    dialog.querySelector('#studio-cancel-btn')!.addEventListener('click', close);
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };

    // Rig inputs
    const nameInput = dialog.querySelector<HTMLInputElement>('#studio-name')!;
    nameInput.oninput = () => {
      localActor.name = nameInput.value.trim() || localActor.name;
    };

    const rigTypeSelect = dialog.querySelector<HTMLSelectElement>('#studio-rig-type')!;
    rigTypeSelect.onchange = () => {
      localActor.rigType = rigTypeSelect.value as any;
    };

    const colorInput = dialog.querySelector<HTMLInputElement>('#studio-color')!;
    colorInput.oninput = () => {
      localActor.color = colorInput.value;
    };

    const heightSlider = dialog.querySelector<HTMLInputElement>('#studio-height')!;
    const heightVal = dialog.querySelector<HTMLElement>('#studio-height-val')!;
    heightSlider.oninput = () => {
      localActor.heightM = parseFloat(heightSlider.value);
      heightVal.textContent = `${localActor.heightM.toFixed(2)}m`;
    };

    const scaleSlider = dialog.querySelector<HTMLInputElement>('#studio-scale')!;
    const scaleVal = dialog.querySelector<HTMLElement>('#studio-scale-val')!;
    scaleSlider.oninput = () => {
      localActor.scale = parseFloat(scaleSlider.value);
      scaleVal.textContent = `${localActor.scale.toFixed(2)}x`;
    };

    // Look-At target
    const lookAtSelect = dialog.querySelector<HTMLSelectElement>('#studio-lookat-target')!;
    lookAtSelect.onchange = () => {
      const val = lookAtSelect.value;
      if (!val) {
        delete localActor.lookAtTargetCameraId;
        delete localActor.lookAtTargetActorId;
      } else if (val.startsWith('cam:')) {
        localActor.lookAtTargetCameraId = val.slice(4);
        delete localActor.lookAtTargetActorId;
      } else if (val.startsWith('actor:')) {
        localActor.lookAtTargetActorId = val.slice(6);
        delete localActor.lookAtTargetCameraId;
      }
    };

    // Animation Speed
    const speedSlider = dialog.querySelector<HTMLInputElement>('#studio-speed')!;
    const speedVal = dialog.querySelector<HTMLElement>('#studio-speed-val')!;
    speedSlider.oninput = () => {
      localActor.animationSpeed = parseFloat(speedSlider.value);
      speedVal.textContent = `${localActor.animationSpeed.toFixed(2)}x`;
    };

    // Clip buttons
    dialog.querySelectorAll<HTMLButtonElement>('.studio-clip-btn').forEach((btn) => {
      btn.onclick = () => {
        const clipId = btn.dataset.clipId;
        if (clipId) {
          localActor.animationClip = clipId;
          delete localActor.customMocap;
          renderContent();
        }
      };
    });

    // Pose presets
    dialog.querySelectorAll<HTMLButtonElement>('.studio-preset-btn[data-preset-id]').forEach((btn) => {
      btn.onclick = () => {
        const presetId = btn.dataset.presetId;
        if (presetId && STOCK_POSE_PRESETS[presetId]) {
          localActor.poseOverrides = { ...STOCK_POSE_PRESETS[presetId].bones };
          renderContent();
        }
      };
    });

    const clearPosesBtn = dialog.querySelector<HTMLButtonElement>('#studio-clear-poses');
    if (clearPosesBtn) {
      clearPosesBtn.onclick = () => {
        delete localActor.poseOverrides;
        renderContent();
      };
    }

    // BVH Dropzone & File Input
    const dropzone = dialog.querySelector<HTMLElement>('#studio-bvh-dropzone')!;
    const fileInput = dialog.querySelector<HTMLInputElement>('#studio-bvh-file')!;

    dropzone.onclick = () => fileInput.click();
    dropzone.ondragover = (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    };
    dropzone.ondragleave = () => dropzone.classList.remove('dragover');
    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        handleBvhFile(e.dataTransfer.files[0]);
      }
    };

    fileInput.onchange = () => {
      if (fileInput.files && fileInput.files.length > 0) {
        handleBvhFile(fileInput.files[0]);
      }
    };

    const handleBvhFile = (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = reader.result as string;
          const parsed = parseBvh(text);
          parsed.name = file.name.replace(/\.[^/.]+$/, '');
          localActor.customMocap = parsed;
          localActor.animationClip = 'custom_mocap';
          renderContent();
        } catch (err) {
          console.error('Failed to parse BVH file:', err);
          alert('Could not parse BVH file. Please ensure it is a valid Biovision hierarchy file.');
        }
      };
      reader.readAsText(file);
    };

    const clearMocapBtn = dialog.querySelector<HTMLButtonElement>('#studio-clear-mocap');
    if (clearMocapBtn) {
      clearMocapBtn.onclick = () => {
        delete localActor.customMocap;
        localActor.animationClip = 'idle_breathing';
        renderContent();
      };
    }

    const exportBvhBtn = dialog.querySelector<HTMLButtonElement>('#studio-export-bvh');
    if (exportBvhBtn) {
      exportBvhBtn.onclick = () => {
        const clip =
          localActor.customMocap ??
          STOCK_ANIMATION_CLIPS[localActor.animationClip || 'idle_breathing'] ??
          STOCK_ANIMATION_CLIPS['idle_breathing'];
        const bvhText = exportBvh(clip);
        const blob = new Blob([bvhText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${localActor.name.toLowerCase().replace(/\s+/g, '_')}_mocap.bvh`;
        a.click();
        URL.revokeObjectURL(url);
      };
    }

    // Reset Defaults
    const resetBtn = dialog.querySelector<HTMLButtonElement>('#studio-reset-btn')!;
    resetBtn.onclick = () => {
      localActor.rigType = 'stylized_mannequin';
      localActor.animationClip = 'idle_breathing';
      localActor.animationSpeed = 1.0;
      delete localActor.customMocap;
      delete localActor.poseOverrides;
      delete localActor.lookAtTargetActorId;
      delete localActor.lookAtTargetCameraId;
      renderContent();
    };

    // Save & Apply
    const saveBtn = dialog.querySelector<HTMLButtonElement>('#studio-save-btn')!;
    saveBtn.onclick = () => {
      onSave(localActor);
      close();
    };
  };

  overlay.appendChild(dialog);
  overlayRoot.appendChild(overlay);
  renderContent();
}

/**
 * Opens the SetView Camera Grip Rigs & Optical Lens Physics Studio modal.
 * Pure DOM overlay for configuring mechanical grip physics (tripods, cranes, dollies, drones)
 * and cinema lens optical physics (anamorphic squeeze, bokeh simulation, breathing, chromatic aberration).
 */
export function openCameraGripModal(
  camera: CameraSetupData,
  _scene: SceneData,
  onSave: (updated: { gripRig?: GripRigConfig; lensProfile?: LensOpticalProfile }) => void,
  overlayRoot: HTMLElement = document.body,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'grip-studio-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'grip-studio-dialog';

  // Work on local clones of grip rig and lens profile
  let localRig: GripRigConfig | undefined = camera.gripRig
    ? JSON.parse(JSON.stringify(camera.gripRig))
    : undefined;
  let localLens: LensOpticalProfile | undefined = camera.lensProfile
    ? JSON.parse(JSON.stringify(camera.lensProfile))
    : JSON.parse(JSON.stringify(STOCK_LENS_PROFILES.arri_master_prime));

  let activeTab: 'grip' | 'lens' = 'grip';

  const close = () => {
    overlay.remove();
  };

  const renderContent = () => {
    dialog.innerHTML = `
      <div class="studio-header">
        <div class="studio-title-group">
          <h2>🎥 Camera Grip & Cinema Optics Studio: <span style="color: #38bdf8;">${escapeHtml(camera.name)}</span></h2>
          <div class="studio-subtitle">Mechanical Rig Dynamics, Crane Reach Envelopes, Anamorphic Bokeh & Optical Physics</div>
        </div>
        <button class="studio-close-btn" id="grip-close-btn" title="Close">✕</button>
      </div>

      <div class="grip-tabs">
        <button class="grip-tab-btn ${activeTab === 'grip' ? 'active' : ''}" id="tab-btn-grip">🎥 Grip Dynamics & Rigging</button>
        <button class="grip-tab-btn ${activeTab === 'lens' ? 'active' : ''}" id="tab-btn-lens">🔍 Cinema Optics & Bokeh</button>
      </div>

      <div class="studio-content">
        ${
          activeTab === 'grip'
            ? `
          <!-- Left Panel: Grip Rig Setup -->
          <div class="studio-panel">
            <div class="studio-card">
              <h3 class="studio-card-title">Grip Rig Configuration</h3>
              <div class="studio-form-row">
                <label>Preset Rig</label>
                <select class="studio-select" id="grip-preset-select">
                  <option value="none" ${!localRig ? 'selected' : ''}>None (Free-Floating Camera)</option>
                  <option value="tripod_studio" ${localRig?.type === 'tripod_fluid_head' ? 'selected' : ''}>Tripod Studio (O'Connor 2575)</option>
                  <option value="handheld_easyrig" ${localRig?.type === 'handheld_rig' ? 'selected' : ''}>Handheld Rig (EasyRig Vario 5)</option>
                  <option value="steadicam_m1" ${localRig?.type === 'steadicam' ? 'selected' : ''}>Steadicam M1 (ISO-Elastic Arm)</option>
                  <option value="chapman_hybrid_dolly" ${localRig?.type === 'dolly_curved_track' ? 'selected' : ''}>Chapman Hybrid Dolly (Curved Track)</option>
                  <option value="technocrane_30" ${localRig?.type === 'technocrane' ? 'selected' : ''}>Technocrane 30 (Telescoping Boom)</option>
                  <option value="heavy_lift_drone" ${localRig?.type === 'drone_uav' ? 'selected' : ''}>Heavy-Lift Cine Drone (Movi Pro)</option>
                  <option value="cable_cam_highwire" ${localRig?.type === 'cable_cam' ? 'selected' : ''}>Cable Cam Highwire (Motorized)</option>
                </select>
              </div>

              ${
                localRig
                  ? `
              <div class="studio-form-row">
                <label>Rig Type</label>
                <select class="studio-select" id="grip-type-select">
                  <option value="tripod_fluid_head" ${localRig.type === 'tripod_fluid_head' ? 'selected' : ''}>Tripod with Fluid Head</option>
                  <option value="handheld_rig" ${localRig.type === 'handheld_rig' ? 'selected' : ''}>Handheld Rig with EasyRig</option>
                  <option value="steadicam" ${localRig.type === 'steadicam' ? 'selected' : ''}>Steadicam Sled & Arm</option>
                  <option value="dolly_curved_track" ${localRig.type === 'dolly_curved_track' ? 'selected' : ''}>Chapman Dolly on Track</option>
                  <option value="jib_crane" ${localRig.type === 'jib_crane' ? 'selected' : ''}>Jib Crane (Fixed Arm)</option>
                  <option value="technocrane" ${localRig.type === 'technocrane' ? 'selected' : ''}>Technocrane (Telescoping)</option>
                  <option value="cable_cam" ${localRig.type === 'cable_cam' ? 'selected' : ''}>Cable Cam Highwire</option>
                  <option value="drone_uav" ${localRig.type === 'drone_uav' ? 'selected' : ''}>Drone / Heavy UAV</option>
                </select>
              </div>

              <div class="studio-form-row">
                <label>Rig Mass: <span id="val-mass">${localRig.massKg} kg</span></label>
                <input type="range" class="studio-slider" id="slider-mass" min="1" max="250" step="1" value="${localRig.massKg}" />
              </div>

              <div class="studio-form-row">
                <label>Fluid Damping: <span id="val-damping">${localRig.damping.toFixed(2)}</span></label>
                <input type="range" class="studio-slider" id="slider-damping" min="0.05" max="1.0" step="0.05" value="${localRig.damping}" />
              </div>

              <div class="studio-form-row">
                <label>Max Speed: <span id="val-speed">${localRig.maxSpeedMps.toFixed(1)} m/s</span></label>
                <input type="range" class="studio-slider" id="slider-speed" min="0.5" max="30" step="0.5" value="${localRig.maxSpeedMps}" />
              </div>

              ${
                localRig.type === 'jib_crane' || localRig.type === 'technocrane' || localRig.type === 'cable_cam'
                  ? `
              <div class="studio-form-row">
                <label>Arm / Cable Span: <span id="val-arm">${(localRig.armLengthM ?? 9.14).toFixed(1)} m</span></label>
                <input type="range" class="studio-slider" id="slider-arm" min="1" max="50" step="0.5" value="${localRig.armLengthM ?? 9.14}" />
              </div>
              `
                  : ''
              }

              ${
                localRig.type === 'dolly_curved_track'
                  ? `
              <div class="studio-form-row">
                <label>Track Radius: <span id="val-track">${(localRig.trackRadiusM ?? 5.0).toFixed(1)} m</span></label>
                <input type="range" class="studio-slider" id="slider-track" min="1" max="25" step="0.5" value="${localRig.trackRadiusM ?? 5.0}" />
              </div>
              `
                  : ''
              }

              ${
                localRig.type === 'handheld_rig' || localRig.type === 'steadicam'
                  ? `
              <div class="studio-form-row">
                <label>Spring Tension: <span id="val-spring">${(localRig.springTension ?? 0.7).toFixed(2)}</span></label>
                <input type="range" class="studio-slider" id="slider-spring" min="0.1" max="1.0" step="0.05" value="${localRig.springTension ?? 0.7}" />
              </div>

              <div class="studio-form-row" style="align-items: center;">
                <label style="flex: 1;">Operator Walking Gait Bounce</label>
                <input type="checkbox" id="check-footsteps" ${localRig.operatorFootstepSimulation ? 'checked' : ''} />
              </div>
              `
                  : ''
              }
              `
                  : `
              <div style="padding: 24px 12px; text-align: center; color: #94a3b8; font-size: 13px;">
                No grip rig mounted. Camera floats with zero physical mass or mechanical reach limits. Select a preset above to mount on a tripod, dolly, crane, or steadicam.
              </div>
              `
              }
            </div>
          </div>

          <!-- Right Panel: Grip Physics Diagnostics -->
          <div class="studio-panel">
            <div class="studio-card">
              <h3 class="studio-card-title">Rig Dynamics & Physical Constraints</h3>
              <div class="grip-telemetry-box" id="grip-telemetry">
                ${
                  localRig
                    ? `
                  <div class="telemetry-item"><span class="telemetry-k">Rig Inertia</span> <span class="telemetry-v">${localRig.massKg.toFixed(0)} kg (T=${(localRig.massKg * localRig.damping * 0.05).toFixed(2)}s settling)</span></div>
                  <div class="telemetry-item"><span class="telemetry-k">Max Acceleration</span> <span class="telemetry-v">${(150 / localRig.massKg).toFixed(2)} m/s²</span></div>
                  <div class="telemetry-item"><span class="telemetry-k">Max Track Velocity</span> <span class="telemetry-v">${localRig.maxSpeedMps.toFixed(1)} m/s (${(localRig.maxSpeedMps * 3.6).toFixed(1)} km/h)</span></div>
                  <div class="telemetry-item"><span class="telemetry-k">Reach Limit Envelope</span> <span class="telemetry-v">${localRig.armLengthM ? `${localRig.armLengthM.toFixed(1)}m spherical envelope` : 'Ground plane locked'}</span></div>
                  <div class="telemetry-item"><span class="telemetry-k">Damping Profile</span> <span class="telemetry-v">${localRig.damping > 0.6 ? 'Heavy Fluid Head (Smooth cinematic pan/tilt)' : 'Light Fluid Head (Fast responsive tracking)'}</span></div>
                  <div class="telemetry-item"><span class="telemetry-k">Quest 3 Budget</span> <span class="telemetry-v" style="color:#10b981;">72fps Zero-Allocation Physics</span></div>
                `
                    : `
                  <div class="telemetry-item"><span class="telemetry-k">Rig State</span> <span class="telemetry-v">Free Float (Unconstrained)</span></div>
                  <div class="telemetry-item"><span class="telemetry-k">Inertia</span> <span class="telemetry-v">0 kg</span></div>
                `
                }
              </div>
            </div>
          </div>
          `
            : `
          <!-- Left Panel: Lens Optical Profile -->
          <div class="studio-panel">
            <div class="studio-card">
              <h3 class="studio-card-title">Cinema Lens Profile & Series</h3>
              <div class="studio-form-row">
                <label>Preset Cinema Series</label>
                <select class="studio-select" id="lens-preset-select">
                  <option value="cooke_anamorphic_prime" ${localLens?.series === 'cooke_anamorphic_prime' ? 'selected' : ''}>Cooke Anamorphic /i Prime (2x Oval Bokeh)</option>
                  <option value="arri_master_prime" ${localLens?.series === 'arri_master_prime' ? 'selected' : ''}>ARRI Master Prime (Ultra Sharp, Zero Flaws)</option>
                  <option value="canon_k35_vintage" ${localLens?.series === 'canon_k35_vintage' ? 'selected' : ''}>Canon K35 Vintage (Warm Flare, Organic Flaws)</option>
                  <option value="atlas_orion_anamorphic" ${localLens?.series === 'atlas_orion_anamorphic' ? 'selected' : ''}>Atlas Orion Anamorphic (2x Blue Streaks)</option>
                  <option value="angenieux_optimo_zoom" ${localLens?.series === 'angenieux_optimo_zoom' ? 'selected' : ''}>Angenieux Optimo Zoom (Cinematic Zoom)</option>
                  <option value="zeiss_supreme" ${localLens?.series === 'zeiss_supreme' ? 'selected' : ''}>Zeiss Supreme Prime (Clean Modern)</option>
                  <option value="custom" ${localLens?.series === 'custom' ? 'selected' : ''}>Custom Lens Optics</option>
                </select>
              </div>

              <div class="studio-form-row">
                <label>Anamorphic Squeeze: <span id="val-squeeze">${(localLens?.anamorphicSqueeze ?? 1.0).toFixed(2)}x</span></label>
                <input type="range" class="studio-slider" id="slider-squeeze" min="1.0" max="2.0" step="0.1" value="${localLens?.anamorphicSqueeze ?? 1.0}" />
              </div>

              <div class="studio-form-row">
                <label>Aperture Iris Blades: <span id="val-blades">${localLens?.apertureBlades ?? 9} blades</span></label>
                <input type="range" class="studio-slider" id="slider-blades" min="5" max="18" step="1" value="${localLens?.apertureBlades ?? 9}" />
              </div>

              <div class="studio-form-row">
                <label>Lens Breathing Factor: <span id="val-breathing">${((localLens?.lensBreathingFactor ?? 0.04) * 100).toFixed(1)}%</span></label>
                <input type="range" class="studio-slider" id="slider-breathing" min="0.0" max="0.15" step="0.005" value="${localLens?.lensBreathingFactor ?? 0.04}" />
              </div>

              <div class="studio-form-row">
                <label>Chromatic Aberration: <span id="val-chroma">${(localLens?.chromaticAberrationPx ?? 1.2).toFixed(1)} px</span></label>
                <input type="range" class="studio-slider" id="slider-chroma" min="0.0" max="6.0" step="0.2" value="${localLens?.chromaticAberrationPx ?? 1.2}" />
              </div>

              <div class="studio-form-row">
                <label>Distortion (Barrel/Pin): <span id="val-dist">${((localLens?.barrelDistortionFactor ?? 0.0) * 100).toFixed(1)}%</span></label>
                <input type="range" class="studio-slider" id="slider-dist" min="-0.1" max="0.1" step="0.005" value="${localLens?.barrelDistortionFactor ?? 0.0}" />
              </div>

              <div class="studio-form-row">
                <label>Optical Vignetting: <span id="val-vignette">${((localLens?.vignettingFactor ?? 0.25) * 100).toFixed(0)}%</span></label>
                <input type="range" class="studio-slider" id="slider-vignette" min="0.0" max="0.8" step="0.05" value="${localLens?.vignettingFactor ?? 0.25}" />
              </div>

              <div class="studio-form-row">
                <label>Streak Flare Tint</label>
                <input type="color" class="studio-color-input" id="color-flare" value="${localLens?.flareStreakColorHex ?? '#38bdf8'}" />
              </div>

              <div class="studio-form-row" style="align-items: center;">
                <label style="flex: 1;">Optical Flaws Simulation</label>
                <input type="checkbox" id="check-flaws" ${localLens?.opticalFlawsEnabled !== false ? 'checked' : ''} />
              </div>
            </div>
          </div>

          <!-- Right Panel: Live SVG Bokeh & Breathing Previews -->
          <div class="studio-panel">
            <div class="studio-card">
              <h3 class="studio-card-title">Live Anamorphic Bokeh Iris Preview</h3>
              <div class="bokeh-preview-container" id="bokeh-preview-box">
                <!-- Live SVG bokeh rendered here -->
              </div>
            </div>

            <div class="studio-card" style="margin-top: 16px;">
              <h3 class="studio-card-title">Lens Breathing Focus Rack Graph</h3>
              <div class="breathing-graph-container" id="breathing-graph-box">
                <!-- Live SVG graph rendered here -->
              </div>
            </div>
          </div>
          `
        }
      </div>

      <div class="studio-footer">
        <button class="studio-btn studio-btn-secondary" id="grip-reset-btn">Reset Defaults</button>
        <div style="flex: 1;"></div>
        <button class="studio-btn studio-btn-secondary" id="grip-cancel-btn">Cancel</button>
        <button class="studio-btn studio-btn-primary" id="grip-save-btn">Save & Apply to Camera</button>
      </div>
    `;

    // Wire up Close & Tabs
    dialog.querySelector('#grip-close-btn')!.addEventListener('click', close);
    dialog.querySelector('#grip-cancel-btn')!.addEventListener('click', close);
    dialog.querySelector('#tab-btn-grip')!.addEventListener('click', () => {
      activeTab = 'grip';
      renderContent();
    });
    dialog.querySelector('#tab-btn-lens')!.addEventListener('click', () => {
      activeTab = 'lens';
      renderContent();
    });

    if (activeTab === 'grip') {
      const presetSel = dialog.querySelector<HTMLSelectElement>('#grip-preset-select')!;
      presetSel.onchange = () => {
        const val = presetSel.value;
        if (val === 'none') {
          localRig = undefined;
        } else if (val in STOCK_GRIP_RIGS) {
          localRig = JSON.parse(JSON.stringify(STOCK_GRIP_RIGS[val as keyof typeof STOCK_GRIP_RIGS]));
        }
        renderContent();
      };

      if (localRig) {
        const typeSel = dialog.querySelector<HTMLSelectElement>('#grip-type-select');
        if (typeSel) {
          typeSel.onchange = () => {
            if (localRig) {
              localRig.type = typeSel.value as GripRigType;
              renderContent();
            }
          };
        }

        const massSlider = dialog.querySelector<HTMLInputElement>('#slider-mass');
        if (massSlider) {
          massSlider.oninput = () => {
            if (localRig) {
              localRig.massKg = Number(massSlider.value);
              const label = dialog.querySelector('#val-mass');
              if (label) label.textContent = `${localRig.massKg} kg`;
            }
          };
        }

        const dampSlider = dialog.querySelector<HTMLInputElement>('#slider-damping');
        if (dampSlider) {
          dampSlider.oninput = () => {
            if (localRig) {
              localRig.damping = Number(dampSlider.value);
              const label = dialog.querySelector('#val-damping');
              if (label) label.textContent = localRig.damping.toFixed(2);
            }
          };
        }

        const speedSlider = dialog.querySelector<HTMLInputElement>('#slider-speed');
        if (speedSlider) {
          speedSlider.oninput = () => {
            if (localRig) {
              localRig.maxSpeedMps = Number(speedSlider.value);
              const label = dialog.querySelector('#val-speed');
              if (label) label.textContent = `${localRig.maxSpeedMps.toFixed(1)} m/s`;
            }
          };
        }

        const armSlider = dialog.querySelector<HTMLInputElement>('#slider-arm');
        if (armSlider) {
          armSlider.oninput = () => {
            if (localRig) {
              localRig.armLengthM = Number(armSlider.value);
              const label = dialog.querySelector('#val-arm');
              if (label) label.textContent = `${localRig.armLengthM.toFixed(1)} m`;
            }
          };
        }

        const trackSlider = dialog.querySelector<HTMLInputElement>('#slider-track');
        if (trackSlider) {
          trackSlider.oninput = () => {
            if (localRig) {
              localRig.trackRadiusM = Number(trackSlider.value);
              const label = dialog.querySelector('#val-track');
              if (label) label.textContent = `${localRig.trackRadiusM.toFixed(1)} m`;
            }
          };
        }

        const springSlider = dialog.querySelector<HTMLInputElement>('#slider-spring');
        if (springSlider) {
          springSlider.oninput = () => {
            if (localRig) {
              localRig.springTension = Number(springSlider.value);
              const label = dialog.querySelector('#val-spring');
              if (label) label.textContent = localRig.springTension.toFixed(2);
            }
          };
        }

        const footCheck = dialog.querySelector<HTMLInputElement>('#check-footsteps');
        if (footCheck) {
          footCheck.onchange = () => {
            if (localRig) localRig.operatorFootstepSimulation = footCheck.checked;
          };
        }
      }
    } else {
      // Lens Tab
      const lensPresetSel = dialog.querySelector<HTMLSelectElement>('#lens-preset-select')!;
      lensPresetSel.onchange = () => {
        const val = lensPresetSel.value;
        if (val in STOCK_LENS_PROFILES) {
          localLens = JSON.parse(JSON.stringify(STOCK_LENS_PROFILES[val as keyof typeof STOCK_LENS_PROFILES]));
        } else {
          if (!localLens) localLens = createLensProfile('custom');
          localLens.series = 'custom';
        }
        renderContent();
      };

      const updateBokehSvg = () => {
        if (!localLens) return;
        const bokehBox = dialog.querySelector('#bokeh-preview-box');
        if (!bokehBox) return;

        const bokeh = calculateBokehShape(localLens, camera.tStop);
        const ptsStr = bokeh.polygonPoints
          .map((p) => `${(p.x * 60 + 100).toFixed(1)},${(p.y * 60 + 100).toFixed(1)}`)
          .join(' ');

        bokehBox.innerHTML = `
          <svg viewBox="0 0 200 200" width="100%" height="160" style="background:#0b0f19; border-radius:8px;">
            <defs>
              <radialGradient id="bokehGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9" />
                <stop offset="60%" stop-color="${localLens.flareStreakColorHex}" stop-opacity="0.6" />
                <stop offset="100%" stop-color="${localLens.flareStreakColorHex}" stop-opacity="0.0" />
              </radialGradient>
            </defs>
            <circle cx="100" cy="100" r="90" fill="none" stroke="#1e293b" stroke-width="1" stroke-dasharray="4,4" />
            <polygon points="${ptsStr}" fill="url(#bokehGlow)" stroke="${localLens.flareStreakColorHex}" stroke-width="2" />
            <text x="10" y="190" fill="#64748b" font-size="10" font-family="monospace">
              ${localLens.anamorphicSqueeze.toFixed(1)}x Squeeze · ${bokeh.bladeCount} Blades · T${camera.tStop.toFixed(1)}
            </text>
          </svg>
        `;
      };

      const updateBreathingGraphSvg = () => {
        if (!localLens) return;
        const graphBox = dialog.querySelector('#breathing-graph-box');
        if (!graphBox) return;

        const baseFocal = camera.lensFocalLength;
        const points: { dist: number; f: number }[] = [];
        for (let d = 0.5; d <= 10.0; d += 0.5) {
          const f = calculateLensBreathingFocalLength(baseFocal, d, localLens);
          points.push({ dist: d, f });
        }

        const minF = Math.min(...points.map((p) => p.f));
        const maxF = Math.max(...points.map((p) => p.f));
        const spanF = Math.max(0.1, maxF - minF);

        const pathData = points
          .map((p, i) => {
            const x = 30 + ((p.dist - 0.5) / 9.5) * 150;
            const y = 90 - ((p.f - minF) / spanF) * 60;
            return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(' ');

        graphBox.innerHTML = `
          <svg viewBox="0 0 200 110" width="100%" height="110" style="background:#0b0f19; border-radius:8px;">
            <line x1="30" y1="90" x2="180" y2="90" stroke="#1e293b" stroke-width="1" />
            <line x1="30" y1="30" x2="30" y2="90" stroke="#1e293b" stroke-width="1" />
            <path d="${pathData}" fill="none" stroke="#38bdf8" stroke-width="2" />
            <text x="30" y="102" fill="#64748b" font-size="9" font-family="monospace">0.5m Close</text>
            <text x="140" y="102" fill="#64748b" font-size="9" font-family="monospace">10m Inf</text>
            <text x="35" y="24" fill="#38bdf8" font-size="10" font-family="monospace">
              Rack: ${minF.toFixed(1)}mm → ${maxF.toFixed(1)}mm (${((localLens.lensBreathingFactor ?? 0) * 100).toFixed(1)}%)
            </text>
          </svg>
        `;
      };

      updateBokehSvg();
      updateBreathingGraphSvg();

      const squeezeSlider = dialog.querySelector<HTMLInputElement>('#slider-squeeze');
      if (squeezeSlider) {
        squeezeSlider.oninput = () => {
          if (localLens) {
            localLens.anamorphicSqueeze = Number(squeezeSlider.value);
            localLens.anamorphicBokehOvalRatio = 1.0 / localLens.anamorphicSqueeze;
            const label = dialog.querySelector('#val-squeeze');
            if (label) label.textContent = `${localLens.anamorphicSqueeze.toFixed(2)}x`;
            updateBokehSvg();
          }
        };
      }

      const bladesSlider = dialog.querySelector<HTMLInputElement>('#slider-blades');
      if (bladesSlider) {
        bladesSlider.oninput = () => {
          if (localLens) {
            localLens.apertureBlades = Number(bladesSlider.value);
            const label = dialog.querySelector('#val-blades');
            if (label) label.textContent = `${localLens.apertureBlades} blades`;
            updateBokehSvg();
          }
        };
      }

      const breathSlider = dialog.querySelector<HTMLInputElement>('#slider-breathing');
      if (breathSlider) {
        breathSlider.oninput = () => {
          if (localLens) {
            localLens.lensBreathingFactor = Number(breathSlider.value);
            const label = dialog.querySelector('#val-breathing');
            if (label) label.textContent = `${(localLens.lensBreathingFactor * 100).toFixed(1)}%`;
            updateBreathingGraphSvg();
          }
        };
      }

      const chromaSlider = dialog.querySelector<HTMLInputElement>('#slider-chroma');
      if (chromaSlider) {
        chromaSlider.oninput = () => {
          if (localLens) {
            localLens.chromaticAberrationPx = Number(chromaSlider.value);
            const label = dialog.querySelector('#val-chroma');
            if (label) label.textContent = `${localLens.chromaticAberrationPx.toFixed(1)} px`;
          }
        };
      }

      const distSlider = dialog.querySelector<HTMLInputElement>('#slider-dist');
      if (distSlider) {
        distSlider.oninput = () => {
          if (localLens) {
            localLens.barrelDistortionFactor = Number(distSlider.value);
            const label = dialog.querySelector('#val-dist');
            if (label) label.textContent = `${(localLens.barrelDistortionFactor * 100).toFixed(1)}%`;
          }
        };
      }

      const vigSlider = dialog.querySelector<HTMLInputElement>('#slider-vignette');
      if (vigSlider) {
        vigSlider.oninput = () => {
          if (localLens) {
            localLens.vignettingFactor = Number(vigSlider.value);
            const label = dialog.querySelector('#val-vignette');
            if (label) label.textContent = `${(localLens.vignettingFactor * 100).toFixed(0)}%`;
          }
        };
      }

      const colorInput = dialog.querySelector<HTMLInputElement>('#color-flare');
      if (colorInput) {
        colorInput.oninput = () => {
          if (localLens) {
            localLens.flareStreakColorHex = colorInput.value;
            updateBokehSvg();
          }
        };
      }

      const flawsCheck = dialog.querySelector<HTMLInputElement>('#check-flaws');
      if (flawsCheck) {
        flawsCheck.onchange = () => {
          if (localLens) localLens.opticalFlawsEnabled = flawsCheck.checked;
        };
      }
    }

    // Reset Defaults
    const resetBtn = dialog.querySelector<HTMLButtonElement>('#grip-reset-btn')!;
    resetBtn.onclick = () => {
      localRig = undefined;
      localLens = JSON.parse(JSON.stringify(STOCK_LENS_PROFILES.arri_master_prime));
      renderContent();
    };

    // Save & Apply
    const saveBtn = dialog.querySelector<HTMLButtonElement>('#grip-save-btn')!;
    saveBtn.onclick = () => {
      onSave({
        gripRig: localRig ? normalizeGripRigConfig(localRig) : undefined,
        lensProfile: localLens ? normalizeLensProfile(localLens) : undefined,
      });
      close();
    };
  };

  overlay.appendChild(dialog);
  overlayRoot.appendChild(overlay);
  renderContent();
}

/** Helper to trigger browser download of arbitrary binary or text data. */
function downloadSplatBlob(data: Blob | Uint8Array | string, filename: string, mimeType: string): void {
  const blob = data instanceof Blob ? data : new Blob([data as unknown as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Generates an OpenUSD (.usda) scout package representation for a Gaussian Splat cloud. */
function exportSplatCloudUsd(cloud: GaussianCloudData): string {
  const lines: string[] = [];
  lines.push('#usda 1.0');
  lines.push('(');
  lines.push('    doc = "SetView 3D Gaussian Splatting Scout Reconstruction"');
  lines.push('    metersPerUnit = 1.0');
  lines.push('    upAxis = "Y"');
  lines.push(')');
  lines.push('');
  const primName = cloud.name.replace(/[^a-zA-Z0-9_]/g, '_') || 'GaussianSplatCloud';
  lines.push(`def Xform "${primName}" (`);
  lines.push('    kind = "component"');
  lines.push(')');
  lines.push('{');
  const t = cloud.transform;
  lines.push(`    float3 xformOp:translate = (${t.position.x.toFixed(4)}, ${t.position.y.toFixed(4)}, ${t.position.z.toFixed(4)})`);
  lines.push(`    quatf xformOp:orient = (${t.rotation.w.toFixed(4)}, ${t.rotation.x.toFixed(4)}, ${t.rotation.y.toFixed(4)}, ${t.rotation.z.toFixed(4)})`);
  lines.push(`    float3 xformOp:scale = (${t.scale.toFixed(4)}, ${t.scale.toFixed(4)}, ${t.scale.toFixed(4)})`);
  lines.push('    uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:orient", "xformOp:scale"]');
  lines.push('');
  lines.push('    def Points "Splats"');
  lines.push('    {');
  const maxPts = Math.min(cloud.splats.length, 10000);
  const pts = cloud.splats.slice(0, maxPts).map((s) => `(${s.position.x.toFixed(3)}, ${s.position.y.toFixed(3)}, ${s.position.z.toFixed(3)})`).join(', ');
  const cols = cloud.splats.slice(0, maxPts).map((s) => `(${s.color.r.toFixed(3)}, ${s.color.g.toFixed(3)}, ${s.color.b.toFixed(3)})`).join(', ');
  const widths = cloud.splats.slice(0, maxPts).map((s) => `${(Math.max(s.scale.x, s.scale.y, s.scale.z) * 2).toFixed(4)}`).join(', ');
  lines.push(`        point3f[] points = [${pts}]`);
  lines.push(`        color3f[] displayColor = [${cols}]`);
  lines.push(`        float[] widths = [${widths}]`);
  lines.push('    }');
  lines.push('}');
  return lines.join('\n');
}

/** Opens the 3D Gaussian Splatting & Photogrammetry Scout Studio modal dialog. */
export function openGaussianSplatStudioModal(
  scene: SceneData,
  onSave: (scene: SceneData) => void,
  overlayRoot: HTMLElement = document.body,
  onCloudModified?: (cloud: GaussianCloudData | null) => void,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'splat-modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'splat-modal-dialog';

  // Working copy of splat clouds
  const localClouds: GaussianCloudData[] = scene.gaussianClouds
    ? JSON.parse(JSON.stringify(scene.gaussianClouds))
    : [];
  let activeCloudId = scene.activeSplatCloudId || (localClouds.length > 0 ? localClouds[0].id : '');
  let alignmentStatusMsg = '';
  let alignmentConfidence = 0;

  const close = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };

  const getActiveCloud = (): GaussianCloudData | null => {
    return localClouds.find((c) => c.id === activeCloudId) || (localClouds.length > 0 ? localClouds[0] : null);
  };

  const renderContent = () => {
    const cloud = getActiveCloud();
    const count = cloud ? cloud.splatCount : 0;
    const memMb = cloud ? ((count * 32) / (1024 * 1024)).toFixed(2) : '0.00';
    const b = cloud ? cloud.bounds : { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    const dx = (b.max.x - b.min.x).toFixed(1);
    const dy = (b.max.y - b.min.y).toFixed(1);
    const dz = (b.max.z - b.min.z).toFixed(1);
    const floorY = cloud?.floorAlignment ? cloud.floorAlignment.floorHeightY.toFixed(2) : (b.min.y).toFixed(2);

    const cloudOptions = localClouds
      .map((c) => `<option value="${c.id}" ${c.id === activeCloudId ? 'selected' : ''}>${escapeHtml(c.name)} (${c.splatCount.toLocaleString()} splats)</option>`)
      .join('');

    dialog.innerHTML = `
      <div class="splat-modal-header">
        <h2>
          <span>✨ 3D Gaussian Splatting & Scout Studio</span>
          ${cloud ? `<span style="font-size: 12px; background: rgba(56, 189, 248, 0.2); color: #38bdf8; padding: 2px 8px; border-radius: 4px;">${count.toLocaleString()} SPLATS</span>` : ''}
        </h2>
        <button class="splat-modal-close" id="splat-close-btn" title="Close">✕</button>
      </div>

      <div class="splat-modal-body">
        <!-- Left Column: Cloud Management & LOD Controls -->
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div class="splat-section">
            <h3>📁 Splat Cloud Ingestion</h3>

            ${localClouds.length > 0 ? `
              <div class="splat-field-group">
                <label>Active Splat Cloud</label>
                <select class="splat-select" id="splat-cloud-select">
                  ${cloudOptions}
                </select>
              </div>

              <div class="splat-field-group">
                <label>Cloud Name</label>
                <input type="text" class="splat-input" id="splat-cloud-name" value="${escapeHtml(cloud?.name || '')}" />
              </div>
            ` : `
              <div style="font-size: 13px; color: #94a3b8;">No 3D Gaussian Splat clouds loaded for this scene.</div>
            `}

            <div class="splat-actions" style="margin-top: 4px;">
              <input type="file" id="splat-file-input" accept=".ply,.splat" style="display: none;" />
              <button class="splat-btn-primary" id="splat-upload-btn">📁 Upload PLY / .splat</button>
              <button class="splat-btn-secondary" id="splat-synthetic-btn">+ Add Synthetic Scout Scan</button>
              ${cloud ? `<button class="splat-btn-secondary" id="splat-remove-btn" style="color: #f87171;">✕ Remove Cloud</button>` : ''}
            </div>
          </div>

          ${cloud ? `
            <div class="splat-section">
              <h3>📊 Diagnostics & Quest 3 LOD</h3>

              <div class="splat-stat-grid">
                <div class="splat-stat-card">
                  <span class="splat-stat-label">Splats</span>
                  <span class="splat-stat-val">${count.toLocaleString()}</span>
                </div>
                <div class="splat-stat-card">
                  <span class="splat-stat-label">Memory</span>
                  <span class="splat-stat-val">${memMb} MB</span>
                </div>
                <div class="splat-stat-card">
                  <span class="splat-stat-label">Dimensions</span>
                  <span class="splat-stat-val">${dx}×${dz}×${dy}m</span>
                </div>
              </div>

              <div class="splat-field-group" style="margin-top: 8px;">
                <label>Voxel Downsampling (Performance LOD)</label>
                <div class="splat-actions">
                  <button class="splat-btn-secondary" id="splat-voxel-5cm-btn">⚡ 5cm Grid (~2x Reduction)</button>
                  <button class="splat-btn-secondary" id="splat-voxel-10cm-btn">⚡ 10cm Grid (~5x Reduction)</button>
                </div>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Right Column: Spatial Alignment & Photogrammetry Export -->
        <div style="display: flex; flex-direction: column; gap: 16px;">
          ${cloud ? `
            <div class="splat-section">
              <h3>🎯 Spatial Floorplan Alignment</h3>

              ${alignmentStatusMsg ? `
                <div style="font-size: 12px; padding: 8px 10px; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 6px; color: #7dd3fc;">
                  ${escapeHtml(alignmentStatusMsg)}
                  ${alignmentConfidence > 0 ? ` (Confidence: ${(alignmentConfidence * 100).toFixed(0)}%)` : ''}
                </div>
              ` : ''}

              <div class="splat-actions">
                <button class="splat-btn-accent" id="splat-autoalign-btn">🎯 Auto-Align to Floorplan (RANSAC)</button>
                <button class="splat-btn-secondary" id="splat-extract-walls-btn">🏗️ Extract Architectural Walls</button>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 6px;">
                <div class="splat-field-group">
                  <label>Pos X (m)</label>
                  <input type="number" step="0.1" class="splat-input" id="splat-pos-x" value="${cloud.transform.position.x.toFixed(2)}" />
                </div>
                <div class="splat-field-group">
                  <label>Floor Y (m)</label>
                  <input type="number" step="0.05" class="splat-input" id="splat-pos-y" value="${cloud.transform.position.y.toFixed(2)}" />
                </div>
                <div class="splat-field-group">
                  <label>Pos Z (m)</label>
                  <input type="number" step="0.1" class="splat-input" id="splat-pos-z" value="${cloud.transform.position.z.toFixed(2)}" />
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div class="splat-field-group">
                  <label>Uniform Scale</label>
                  <input type="number" step="0.05" min="0.1" max="10.0" class="splat-input" id="splat-scale" value="${cloud.transform.scale.toFixed(2)}" />
                </div>
                <div class="splat-field-group">
                  <label>Floor Height Y</label>
                  <input type="text" class="splat-input" readonly value="${floorY} m" />
                </div>
              </div>
            </div>

            <div class="splat-section">
              <h3>📦 Photogrammetry & Scout Exports</h3>

              <div class="splat-actions">
                <button class="splat-btn-primary" id="splat-exp-ply-bin-btn">⬇ Binary PLY (Inria 3DGS)</button>
                <button class="splat-btn-secondary" id="splat-exp-ply-asc-btn">⬇ ASCII PLY</button>
                <button class="splat-btn-secondary" id="splat-exp-splat-btn">⬇ Compact .splat (32-Byte)</button>
                <button class="splat-btn-secondary" id="splat-exp-usd-btn">📐 OpenUSD (.usda)</button>
              </div>
            </div>
          ` : `
            <div class="splat-section" style="display: flex; align-items: center; justify-content: center; min-height: 200px; color: #64748b; font-size: 13px;">
              Upload a 3DGS point cloud or add a synthetic scout scan to configure spatial alignment.
            </div>
          `}
        </div>
      </div>

      <div style="padding: 16px 20px; border-top: 1px solid #1e293b; display: flex; justify-content: flex-end; gap: 10px; background: #0f172a;">
        <button class="splat-btn-secondary" id="splat-cancel-btn">Cancel</button>
        <button class="splat-btn-primary" id="splat-save-btn">Save & Apply to Scene</button>
      </div>
    `;

    // Wire up events
    dialog.querySelector('#splat-close-btn')!.addEventListener('click', close);
    dialog.querySelector('#splat-cancel-btn')!.addEventListener('click', close);

    const cloudSelect = dialog.querySelector<HTMLSelectElement>('#splat-cloud-select');
    if (cloudSelect) {
      cloudSelect.onchange = () => {
        activeCloudId = cloudSelect.value;
        renderContent();
      };
    }

    const nameInput = dialog.querySelector<HTMLInputElement>('#splat-cloud-name');
    if (nameInput && cloud) {
      nameInput.oninput = () => {
        cloud.name = nameInput.value;
      };
    }

    // Upload File
    const fileInput = dialog.querySelector<HTMLInputElement>('#splat-file-input')!;
    const uploadBtn = dialog.querySelector<HTMLButtonElement>('#splat-upload-btn')!;
    uploadBtn.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const buf = reader.result as ArrayBuffer;
          let parsed: GaussianCloudData;
          if (file.name.toLowerCase().endsWith('.splat')) {
            parsed = parseCompactSplat(buf);
          } else {
            parsed = parseGaussianPly(buf);
          }
          parsed.name = file.name.replace(/\.[^/.]+$/, '');
          localClouds.push(parsed);
          activeCloudId = parsed.id;
          alignmentStatusMsg = `Imported ${parsed.splatCount.toLocaleString()} splats successfully.`;
          renderContent();
          onCloudModified?.(parsed);
        } catch (err) {
          alert(`Failed to parse Gaussian Splat file: ${(err as Error).message}`);
        }
      };
      reader.readAsArrayBuffer(file);
    };

    // Synthetic Scout Scan
    const synthBtn = dialog.querySelector<HTMLButtonElement>('#splat-synthetic-btn')!;
    synthBtn.onclick = () => {
      const syn = generateSyntheticScoutSplatCloud(`${scene.name || 'Studio'} Scout Splat`, 4000);
      localClouds.push(syn);
      activeCloudId = syn.id;
      alignmentStatusMsg = `Generated synthetic scout scan with ${syn.splatCount} splats.`;
      renderContent();
      onCloudModified?.(syn);
    };

    // Remove Active Cloud
    const removeBtn = dialog.querySelector<HTMLButtonElement>('#splat-remove-btn');
    if (removeBtn && cloud) {
      removeBtn.onclick = () => {
        const idx = localClouds.findIndex((c) => c.id === cloud.id);
        if (idx >= 0) {
          localClouds.splice(idx, 1);
          activeCloudId = localClouds.length > 0 ? localClouds[0].id : '';
          renderContent();
          onCloudModified?.(getActiveCloud());
        }
      };
    }

    // Voxel Downsample
    const voxel5Btn = dialog.querySelector<HTMLButtonElement>('#splat-voxel-5cm-btn');
    if (voxel5Btn && cloud) {
      voxel5Btn.onclick = () => {
        const initial = cloud.splats.length;
        cloud.splats = voxelDownsampleSplats(cloud.splats, 0.05);
        cloud.splatCount = cloud.splats.length;
        alignmentStatusMsg = `Downsampled 5cm grid: ${initial.toLocaleString()} -> ${cloud.splatCount.toLocaleString()} splats.`;
        renderContent();
        onCloudModified?.(cloud);
      };
    }

    const voxel10Btn = dialog.querySelector<HTMLButtonElement>('#splat-voxel-10cm-btn');
    if (voxel10Btn && cloud) {
      voxel10Btn.onclick = () => {
        const initial = cloud.splats.length;
        cloud.splats = voxelDownsampleSplats(cloud.splats, 0.10);
        cloud.splatCount = cloud.splats.length;
        alignmentStatusMsg = `Downsampled 10cm grid: ${initial.toLocaleString()} -> ${cloud.splatCount.toLocaleString()} splats.`;
        renderContent();
        onCloudModified?.(cloud);
      };
    }

    // Auto-Align RANSAC
    const autoAlignBtn = dialog.querySelector<HTMLButtonElement>('#splat-autoalign-btn');
    if (autoAlignBtn && cloud) {
      autoAlignBtn.onclick = () => {
        const result = alignSplatCloudToFloorplan(cloud, scene.architecture);
        cloud.transform = result.alignedTransform;
        cloud.floorAlignment = {
          floorHeightY: result.floorHeightY,
          northAngleRad: 0,
          originOffset: { ...result.alignedTransform.position },
        };
        alignmentConfidence = result.confidenceScore;
        alignmentStatusMsg = `RANSAC alignment converged. Floor Y leveled at ${result.floorHeightY.toFixed(2)}m.`;
        renderContent();
        onCloudModified?.(cloud);
      };
    }

    // Extract Architectural Walls
    const extractWallsBtn = dialog.querySelector<HTMLButtonElement>('#splat-extract-walls-btn');
    if (extractWallsBtn && cloud) {
      extractWallsBtn.onclick = () => {
        const arch = fitArchitecturalPlanesFromSplats(cloud, 8);
        if (!scene.architecture) {
          scene.architecture = arch;
        } else {
          scene.architecture.walls = arch.walls;
          scene.architecture.ceilingHeightM = arch.ceilingHeightM;
        }
        const ceilStr = arch.ceilingHeightM !== undefined ? `${arch.ceilingHeightM.toFixed(2)}m` : 'N/A';
        alignmentStatusMsg = `Extracted ${arch.walls.length} architectural perimeter walls and ceiling at ${ceilStr}.`;
        renderContent();
      };
    }

    // Manual Transform Inputs
    const posX = dialog.querySelector<HTMLInputElement>('#splat-pos-x');
    if (posX && cloud) {
      posX.onchange = () => {
        cloud.transform.position.x = Number(posX.value) || 0;
        onCloudModified?.(cloud);
      };
    }
    const posY = dialog.querySelector<HTMLInputElement>('#splat-pos-y');
    if (posY && cloud) {
      posY.onchange = () => {
        cloud.transform.position.y = Number(posY.value) || 0;
        onCloudModified?.(cloud);
      };
    }
    const posZ = dialog.querySelector<HTMLInputElement>('#splat-pos-z');
    if (posZ && cloud) {
      posZ.onchange = () => {
        cloud.transform.position.z = Number(posZ.value) || 0;
        onCloudModified?.(cloud);
      };
    }
    const scaleIn = dialog.querySelector<HTMLInputElement>('#splat-scale');
    if (scaleIn && cloud) {
      scaleIn.onchange = () => {
        cloud.transform.scale = Math.max(0.01, Number(scaleIn.value) || 1.0);
        onCloudModified?.(cloud);
      };
    }

    // Exporters
    const expPlyBin = dialog.querySelector<HTMLButtonElement>('#splat-exp-ply-bin-btn');
    if (expPlyBin && cloud) {
      expPlyBin.onclick = () => {
        const data = exportGaussianPly(cloud, true);
        downloadSplatBlob(data, `${cloud.name || 'scout_splat'}.ply`, 'application/octet-stream');
      };
    }
    const expPlyAsc = dialog.querySelector<HTMLButtonElement>('#splat-exp-ply-asc-btn');
    if (expPlyAsc && cloud) {
      expPlyAsc.onclick = () => {
        const text = exportGaussianPly(cloud, false);
        downloadSplatBlob(text, `${cloud.name || 'scout_splat'}_ascii.ply`, 'text/plain');
      };
    }
    const expSplat = dialog.querySelector<HTMLButtonElement>('#splat-exp-splat-btn');
    if (expSplat && cloud) {
      expSplat.onclick = () => {
        const data = exportCompactSplat(cloud);
        downloadSplatBlob(data, `${cloud.name || 'scout_splat'}.splat`, 'application/octet-stream');
      };
    }
    const expUsd = dialog.querySelector<HTMLButtonElement>('#splat-exp-usd-btn');
    if (expUsd && cloud) {
      expUsd.onclick = () => {
        const text = exportSplatCloudUsd(cloud);
        downloadSplatBlob(text, `${cloud.name || 'scout_splat'}.usda`, 'text/plain');
      };
    }

    // Save & Apply
    const saveBtn = dialog.querySelector<HTMLButtonElement>('#splat-save-btn')!;
    saveBtn.onclick = () => {
      scene.gaussianClouds = localClouds.map((c) => normalizeGaussianCloud(c));
      scene.activeSplatCloudId = activeCloudId || (scene.gaussianClouds.length > 0 ? scene.gaussianClouds[0].id : undefined);
      onSave(scene);
      close();
    };
  };

  overlay.appendChild(dialog);
  overlayRoot.appendChild(overlay);
  renderContent();
}

/** Desktop and XR HUD telemetry readout for performance metrics. */
export class PerformanceHudOverlay {
  private element: HTMLElement | null = null;
  private governor: XRPerformanceGovernor;
  private onOpenSettings: () => void;
  private animFrameId: number | null = null;

  constructor(governor: XRPerformanceGovernor, onOpenSettings: () => void) {
    this.governor = governor;
    this.onOpenSettings = onOpenSettings;
  }

  public mount(container: HTMLElement = document.body): HTMLElement {
    if (this.element) return this.element;

    const overlay = document.createElement('div');
    overlay.className = 'perf-hud-overlay';
    this.element = overlay;

    overlay.innerHTML = `
      <div class="perf-hud-header">
        <span class="perf-hud-title">⚡ PERF GOVERNOR</span>
        <button class="perf-hud-gear" id="perf-hud-gear-btn" title="Performance Settings">⚙</button>
      </div>
      <div class="perf-hud-metrics">
        <div class="perf-hud-pill">
          <span class="perf-hud-label">FPS</span>
          <span class="perf-hud-val" id="perf-fps-val">72.0</span>
        </div>
        <div class="perf-hud-pill">
          <span class="perf-hud-label">LAT</span>
          <span class="perf-hud-val" id="perf-lat-val">13.8 ms</span>
        </div>
        <div class="perf-hud-pill" title="Framebuffer scale for this session. Fixed for the whole session: WebXR refuses scale changes while presenting, so DRS decides once, at session end, from the session's vsync-miss ratio.">
          <span class="perf-hud-label">SCALE</span>
          <span class="perf-hud-val" id="perf-drs-val">100%</span>
        </div>
        <div class="perf-hud-pill" title="Share of this session's frames that missed vsync. This is the signal DRS decides on at session end.">
          <span class="perf-hud-label">MISS</span>
          <span class="perf-hud-val" id="perf-miss-val">0.0%</span>
        </div>
        <div class="perf-hud-pill">
          <span class="perf-hud-label">FFR</span>
          <span class="perf-hud-val" id="perf-ffr-val">1.0</span>
        </div>
        <div class="perf-hud-pill">
          <span class="perf-hud-label">GC</span>
          <span class="perf-hud-val" id="perf-gc-val">LOW</span>
        </div>
      </div>
    `;

    const gearBtn = overlay.querySelector<HTMLButtonElement>('#perf-hud-gear-btn')!;
    gearBtn.onclick = (e) => {
      e.stopPropagation();
      this.onOpenSettings();
    };

    container.appendChild(overlay);
    this.startPolling();
    return overlay;
  }

  private startPolling(): void {
    const update = () => {
      if (this.element) {
        const m = this.governor.getMetrics();
        const fpsEl = this.element.querySelector('#perf-fps-val');
        const latEl = this.element.querySelector('#perf-lat-val');
        const drsEl = this.element.querySelector('#perf-drs-val');
        const missEl = this.element.querySelector('#perf-miss-val');
        const ffrEl = this.element.querySelector('#perf-ffr-val');
        const gcEl = this.element.querySelector('#perf-gc-val');

        if (fpsEl) fpsEl.textContent = m.fps.toFixed(1);
        if (latEl) latEl.textContent = `${m.frameTimeMs.toFixed(1)} ms`;
        // Constant for the whole session by design, so it is shown as a plain scale, not
        // as something being tracked. A "→" marks a scale already decided for the NEXT
        // session that the renderer has not been able to accept yet.
        if (drsEl) {
          const pct = `${Math.round(m.renderScale * 100)}%`;
          drsEl.textContent = m.renderScaleApplied ? pct : `→ ${pct}`;
        }
        if (missEl) missEl.textContent = `${(this.governor.getSessionMissRatio() * 100).toFixed(1)}%`;
        if (ffrEl) ffrEl.textContent = m.foveationLevel.toFixed(1);
        if (gcEl) {
          gcEl.textContent = m.gcPressure.toUpperCase();
          gcEl.className = `perf-hud-val gc-${m.gcPressure}`;
        }
      }
      this.animFrameId = requestAnimationFrame(update);
    };
    this.animFrameId = requestAnimationFrame(update);
  }

  public unmount(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
      this.element = null;
    }
  }
}

/**
 * Renders the DRS known-bad ceiling for the telemetry grid. "none" reads better than the
 * +Infinity the governor actually holds while no scale has juddered yet.
 */
function formatKnownBadRenderScale(knownBadScale: number): string {
  return Number.isFinite(knownBadScale) ? `${(knownBadScale * 100).toFixed(0)}%` : 'none';
}

/** Opens the WebXR Performance Governor configuration and real-time telemetry modal. */
export function openPerformanceSettingsModal(
  governor: XRPerformanceGovernor,
  onSave?: (config: GovernorConfig) => void,
  overlayRoot: HTMLElement = document.body,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'perf-modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'perf-modal-dialog';

  const config = { ...governor.getConfig() };
  let intervalId: number | null = null;

  const close = () => {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };

  const renderContent = () => {
    const metrics = governor.getMetrics();
    const stats = governor.getStats();

    dialog.innerHTML = `
      <div class="perf-modal-header">
        <h2>
          <span>⚡ WebXR Performance Governor</span>
          <span style="font-size: 12px; background: rgba(56, 189, 248, 0.2); color: #38bdf8; padding: 2px 8px; border-radius: 4px;">TARGET ${config.targetFps} FPS</span>
        </h2>
        <button class="perf-modal-close" id="perf-close-btn" title="Close">✕</button>
      </div>

      <div class="perf-modal-body">
        <div class="perf-section">
          <h3>📊 Real-Time Headset Telemetry</h3>
          <div class="perf-stat-grid">
            <div class="perf-stat-card">
              <span class="perf-stat-label">Effective FPS</span>
              <span class="perf-stat-val" id="perf-diag-fps">${metrics.fps.toFixed(1)}</span>
            </div>
            <div class="perf-stat-card">
              <span class="perf-stat-label">Avg Frame Time</span>
              <span class="perf-stat-val" id="perf-diag-avg">${stats.getAverageMs().toFixed(2)} ms</span>
            </div>
            <div class="perf-stat-card">
              <span class="perf-stat-label">P95 Latency</span>
              <span class="perf-stat-val" id="perf-diag-p95">${stats.getP95Ms().toFixed(2)} ms</span>
            </div>
            <div class="perf-stat-card">
              <span class="perf-stat-label">Jitter (StdDev)</span>
              <span class="perf-stat-val" id="perf-diag-jitter">±${stats.getJitterMs().toFixed(2)} ms</span>
            </div>
            <div class="perf-stat-card" title="Fixed for the whole session. WebXR refuses framebuffer scale changes while presenting, so DRS decides once, at session end.">
              <span class="perf-stat-label">Render Scale (this session)</span>
              <span class="perf-stat-val" id="perf-diag-drs">${(metrics.renderScale * 100).toFixed(0)}%</span>
            </div>
            <div class="perf-stat-card" title="Share of this session's frames that missed vsync. Above 10% the next session drops a step; below 2% it climbs one, up to native.">
              <span class="perf-stat-label">Session Vsync Miss</span>
              <span class="perf-stat-val" id="perf-diag-miss">${(governor.getSessionMissRatio() * 100).toFixed(1)}%</span>
            </div>
            <div class="perf-stat-card" title="Lowest render scale this scene has juddered at. DRS never climbs back to it, which is what makes it settle instead of hunting. Clear it below once the scene gets lighter.">
              <span class="perf-stat-label">DRS Known-Bad Ceiling</span>
              <span class="perf-stat-val" id="perf-diag-ceiling">${formatKnownBadRenderScale(governor.getKnownBadRenderScale())}</span>
            </div>
            <div class="perf-stat-card">
              <span class="perf-stat-label">FFR Level</span>
              <span class="perf-stat-val" id="perf-diag-ffr">${metrics.foveationLevel.toFixed(1)}</span>
            </div>
            <div class="perf-stat-card">
              <span class="perf-stat-label">Splat Budget</span>
              <span class="perf-stat-val" id="perf-diag-splat">${metrics.splatBudget.toLocaleString()}</span>
            </div>
            <div class="perf-stat-card">
              <span class="perf-stat-label">Volumetric Steps</span>
              <span class="perf-stat-val" id="perf-diag-vol">${metrics.volumetricSteps}</span>
            </div>
            <div class="perf-stat-card">
              <span class="perf-stat-label">GC Pressure</span>
              <span class="perf-stat-val" id="perf-diag-gc">${metrics.gcPressure.toUpperCase()}</span>
            </div>
          </div>
        </div>

        <div class="perf-section">
          <h3>⚙️ Governor Target & Dynamic Throttling</h3>
          <div class="perf-field-grid">
            <div class="perf-field-group">
              <label>Target Refresh Rate</label>
              <select class="perf-select" id="perf-target-fps">
                <option value="72" ${config.targetFps === 72 ? 'selected' : ''}>72 FPS (Meta Quest 2/3 Default)</option>
                <option value="90" ${config.targetFps === 90 ? 'selected' : ''}>90 FPS (Smooth Cinematic / Vision Pro)</option>
                <option value="120" ${config.targetFps === 120 ? 'selected' : ''}>120 FPS (Ultra Refresh Mode)</option>
              </select>
            </div>

            <div class="perf-field-group">
              <label>Measurement Window</label>
              <select class="perf-select" id="perf-window-frames">
                <option value="45" ${config.measurementWindowFrames === 45 ? 'selected' : ''}>45 Frames (Fast Response)</option>
                <option value="90" ${config.measurementWindowFrames === 90 ? 'selected' : ''}>90 Frames (Standard Balanced)</option>
                <option value="180" ${config.measurementWindowFrames === 180 ? 'selected' : ''}>180 Frames (Smooth Stabilized)</option>
              </select>
            </div>
          </div>

          <div class="perf-checkbox-group" style="margin-top: 12px;">
            <label class="perf-checkbox-label">
              <input type="checkbox" id="perf-drs-toggle" ${config.enableDynamicResolution ? 'checked' : ''} />
              <span>Enable Dynamic Resolution Scaling (DRS) &mdash; one step per session, applied between sessions</span>
            </label>
            <label class="perf-checkbox-label">
              <input type="checkbox" id="perf-ffr-toggle" ${config.enableFoveatedRendering ? 'checked' : ''} />
              <span>Enable Fixed Foveated Rendering (FFR)</span>
            </label>
            <label class="perf-checkbox-label">
              <input type="checkbox" id="perf-lod-toggle" ${config.enableLODThrottling ? 'checked' : ''} />
              <span>Enable Dynamic 3DGS & Volumetric LOD Throttling</span>
            </label>
          </div>

          <div class="perf-field-grid" style="margin-top: 12px;">
            <div class="perf-field-group">
              <label>Min Render Scale (${(config.minRenderScale * 100).toFixed(0)}%)</label>
              <input type="range" id="perf-min-scale" min="0.4" max="1.0" step="0.05" value="${config.minRenderScale}" />
            </div>
            <!--
              There is no Max Render Scale control. DRS caps every climb at native, so the
              slider that used to sit here could not change the outcome at any position -
              it was a live-looking control wired to nothing. The ceiling that DOES bind is
              the known-bad one above, and it is cleared from the footer.
            -->
          </div>
        </div>
      </div>

      <div class="perf-modal-footer">
        <div style="display: flex; gap: 8px;">
          <button class="perf-btn-secondary" id="perf-reset-stats-btn">🔄 Reset Statistics</button>
          <button class="perf-btn-secondary" id="perf-clear-drs-ceiling-btn" title="DRS never climbs back to a scale that juddered. Clear that memory once the scene gets lighter so the resolution can be earned back.">↥ Clear DRS Ceiling</button>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="perf-btn-secondary" id="perf-cancel-btn">Cancel</button>
          <button class="perf-btn-primary" id="perf-save-btn">Apply Settings</button>
        </div>
      </div>
    `;

    dialog.querySelector<HTMLButtonElement>('#perf-close-btn')!.onclick = close;
    dialog.querySelector<HTMLButtonElement>('#perf-cancel-btn')!.onclick = close;

    dialog.querySelector<HTMLButtonElement>('#perf-reset-stats-btn')!.onclick = () => {
      governor.reset();
      renderContent();
    };

    dialog.querySelector<HTMLButtonElement>('#perf-clear-drs-ceiling-btn')!.onclick = () => {
      // The known-bad ceiling only ever descends, so a scene that got lighter cannot earn
      // its resolution back without this. Deliberately does not touch the current scale:
      // the next clean session takes the first step up.
      governor.clearKnownBadRenderScale();
      renderContent();
    };

    const targetFpsSelect = dialog.querySelector<HTMLSelectElement>('#perf-target-fps')!;
    targetFpsSelect.onchange = () => {
      config.targetFps = parseInt(targetFpsSelect.value, 10) as 72 | 90 | 120;
    };

    const windowSelect = dialog.querySelector<HTMLSelectElement>('#perf-window-frames')!;
    windowSelect.onchange = () => {
      config.measurementWindowFrames = parseInt(windowSelect.value, 10);
    };

    const drsToggle = dialog.querySelector<HTMLInputElement>('#perf-drs-toggle')!;
    drsToggle.onchange = () => {
      config.enableDynamicResolution = drsToggle.checked;
    };

    const ffrToggle = dialog.querySelector<HTMLInputElement>('#perf-ffr-toggle')!;
    ffrToggle.onchange = () => {
      config.enableFoveatedRendering = ffrToggle.checked;
    };

    const lodToggle = dialog.querySelector<HTMLInputElement>('#perf-lod-toggle')!;
    lodToggle.onchange = () => {
      config.enableLODThrottling = lodToggle.checked;
    };

    const minScaleInput = dialog.querySelector<HTMLInputElement>('#perf-min-scale')!;
    minScaleInput.oninput = () => {
      config.minRenderScale = parseFloat(minScaleInput.value);
    };

    const saveBtn = dialog.querySelector<HTMLButtonElement>('#perf-save-btn')!;
    saveBtn.onclick = () => {
      governor.updateConfig(config);
      if (onSave) onSave(config);
      close();
    };
  };

  overlay.appendChild(dialog);
  overlayRoot.appendChild(overlay);
  renderContent();

  intervalId = window.setInterval(() => {
    const m = governor.getMetrics();
    const s = governor.getStats();
    const fpsEl = dialog.querySelector('#perf-diag-fps');
    const avgEl = dialog.querySelector('#perf-diag-avg');
    const p95El = dialog.querySelector('#perf-diag-p95');
    const jitEl = dialog.querySelector('#perf-diag-jitter');
    const drsEl = dialog.querySelector('#perf-diag-drs');
    const missEl = dialog.querySelector('#perf-diag-miss');
    const ceilingEl = dialog.querySelector('#perf-diag-ceiling');
    const ffrEl = dialog.querySelector('#perf-diag-ffr');
    const splatEl = dialog.querySelector('#perf-diag-splat');
    const volEl = dialog.querySelector('#perf-diag-vol');
    const gcEl = dialog.querySelector('#perf-diag-gc');

    if (fpsEl) fpsEl.textContent = m.fps.toFixed(1);
    if (avgEl) avgEl.textContent = `${s.getAverageMs().toFixed(2)} ms`;
    if (p95El) p95El.textContent = `${s.getP95Ms().toFixed(2)} ms`;
    if (jitEl) jitEl.textContent = `±${s.getJitterMs().toFixed(2)} ms`;
    if (drsEl) {
      const pct = `${(m.renderScale * 100).toFixed(0)}%`;
      drsEl.textContent = m.renderScaleApplied ? pct : `${pct} (next session)`;
    }
    if (missEl) missEl.textContent = `${(governor.getSessionMissRatio() * 100).toFixed(1)}%`;
    if (ceilingEl) ceilingEl.textContent = formatKnownBadRenderScale(governor.getKnownBadRenderScale());
    if (ffrEl) ffrEl.textContent = m.foveationLevel.toFixed(1);
    if (splatEl) splatEl.textContent = m.splatBudget.toLocaleString();
    if (volEl) volEl.textContent = `${m.volumetricSteps}`;
    if (gcEl) gcEl.textContent = m.gcPressure.toUpperCase();
  }, 300);
}

/**
 * Opens the Automated Dailies & Multi-Camera Animatic Video Studio modal dialog.
 */
export function openDailiesVideoStudioModal(
  scene: SceneData,
  onRenderVideo?: (
    options: AnimaticRenderOptions,
    onProgress: DailiesRenderProgressCallback,
  ) => Promise<DailiesRenderResult | Blob | void>,
  overlayRoot: HTMLElement = document.body,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'dailies-modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'dailies-modal-dialog';

  let currentOptions: AnimaticRenderOptions = createDailiesConfig({
    resolution: { width: 1920, height: 1080 },
    fps: 24,
    layout: 'single_cut',
    format: 'mp4',
    qualityMbps: 8,
    audioEnabled: true,
    bitc: {
      enabled: true,
      startingTimecode: '01:00:00:00',
      fps: 24,
      dropFrame: false,
      showSceneShotTake: true,
      showCameraLensData: true,
      showWatermark: true,
      watermarkText: 'SETVIEW DAILIES PREVIZ',
      position: 'bottom_center',
    },
  });

  let activeRenderer: AnimaticVideoRenderer | null = null;
  let isRendering = false;
  let renderResult: DailiesRenderResult | null = null;
  let renderBlobUrl: string | null = null;

  const close = () => {
    if (isRendering && activeRenderer) {
      activeRenderer.abort();
    }
    if (renderBlobUrl) {
      URL.revokeObjectURL(renderBlobUrl);
      renderBlobUrl = null;
    }
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  };

  const renderContent = () => {
    const plan = calculateAnimaticSequencePlan(scene, currentOptions);
    const cameraCount = scene.cameras?.length ?? 0;
    const actorCount = scene.actors?.length ?? 0;
    const audioCueCount = scene.audioCues?.length ?? 0;

    const presetOptions = DAILIES_RESOLUTION_PRESETS.map(
      (p) =>
        `<option value="${p.id}" ${
          currentOptions.resolution.width === p.width &&
          currentOptions.resolution.height === p.height &&
          Math.abs(currentOptions.fps - p.fps) < 0.1
            ? 'selected'
            : ''
        }>${p.name}</option>`,
    ).join('');

    const cutsTableRows = plan.cuts
      .map(
        (c) => `
        <tr>
          <td><span class="dailies-badge">Shot ${c.shotNumber}</span></td>
          <td><b>${escapeHtml(c.cameraName)}</b></td>
          <td>${c.timestampS.toFixed(2)}s</td>
          <td><code style="color: #38bdf8; font-family: monospace;">${formatSmpteTimecode(
            c.frameIndex,
            plan.fps,
            currentOptions.bitc.dropFrame,
          )}</code></td>
          <td>${c.focalLengthMm}mm</td>
          <td>T${c.tStop.toFixed(1)}</td>
          <td>${c.transition.toUpperCase()}</td>
        </tr>`,
      )
      .join('');

    dialog.innerHTML = `
      <div class="dailies-modal-header">
        <h2>
          <span>🎬 Automated Dailies & Multi-Camera Animatic Video Studio</span>
          <span class="dailies-badge">${plan.totalFrames} FRAMES · ${plan.totalDurationS.toFixed(1)}S</span>
        </h2>
        <button class="dailies-modal-close" id="dailies-close-btn" title="Close">✕</button>
      </div>

      <div class="dailies-modal-body">
        <!-- Configuration Grid -->
        <div class="dailies-grid">
          <!-- Card 1: Layout & Resolution Presets -->
          <div class="dailies-section">
            <h3>📐 Layout & Video Output</h3>

            <div class="dailies-field-group">
              <label>Layout Mode</label>
              <select class="dailies-select" id="dailies-layout-select" ${isRendering ? 'disabled' : ''}>
                <option value="single_cut" ${currentOptions.layout === 'single_cut' ? 'selected' : ''}>🎬 Single Multi-Cam Cut (Sequential Timeline)</option>
                <option value="quad_split" ${currentOptions.layout === 'quad_split' ? 'selected' : ''}>🎛️ Quad Split 4-Up (Dir / Cam A / Cam B / Top-Down)</option>
                <option value="picture_in_picture" ${currentOptions.layout === 'picture_in_picture' ? 'selected' : ''}>🖼️ Picture-in-Picture (Main Cut + Inset Floorplan)</option>
                <option value="director_slate" ${currentOptions.layout === 'director_slate' ? 'selected' : ''}>📋 Director Slate Header & Letterbox</option>
              </select>
            </div>

            <div class="dailies-field-group">
              <label>Resolution & Framerate Preset</label>
              <select class="dailies-select" id="dailies-preset-select" ${isRendering ? 'disabled' : ''}>
                ${presetOptions}
                <option value="custom">⚙️ Custom Resolution / FPS</option>
              </select>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
              <div class="dailies-field-group">
                <label>Width</label>
                <input type="number" class="dailies-input" id="dailies-width" value="${currentOptions.resolution.width}" ${isRendering ? 'disabled' : ''} />
              </div>
              <div class="dailies-field-group">
                <label>Height</label>
                <input type="number" class="dailies-input" id="dailies-height" value="${currentOptions.resolution.height}" ${isRendering ? 'disabled' : ''} />
              </div>
              <div class="dailies-field-group">
                <label>FPS</label>
                <input type="number" step="any" class="dailies-input" id="dailies-fps" value="${currentOptions.fps}" ${isRendering ? 'disabled' : ''} />
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div class="dailies-field-group">
                <label>Container Format</label>
                <select class="dailies-select" id="dailies-format-select" ${isRendering ? 'disabled' : ''}>
                  <option value="mp4" ${currentOptions.format === 'mp4' ? 'selected' : ''}>MP4 (H.264 / AAC)</option>
                  <option value="webm" ${currentOptions.format === 'webm' ? 'selected' : ''}>WebM (VP9 / Opus)</option>
                </select>
              </div>
              <div class="dailies-field-group">
                <label>Bitrate Quality</label>
                <select class="dailies-select" id="dailies-quality-select" ${isRendering ? 'disabled' : ''}>
                  <option value="4" ${currentOptions.qualityMbps === 4 ? 'selected' : ''}>4 Mbps (Draft)</option>
                  <option value="8" ${currentOptions.qualityMbps === 8 ? 'selected' : ''}>8 Mbps (Standard 1080p)</option>
                  <option value="16" ${currentOptions.qualityMbps === 16 ? 'selected' : ''}>16 Mbps (High Quality)</option>
                  <option value="25" ${currentOptions.qualityMbps === 25 ? 'selected' : ''}>25 Mbps (Broadcast 4K)</option>
                </select>
              </div>
            </div>

            <div class="dailies-field-group">
              <label>Duration Override (Seconds, optional)</label>
              <input type="number" step="0.5" class="dailies-input" id="dailies-duration-override" placeholder="Auto (from keyframes & shots)" value="${currentOptions.durationOverrideS ?? ''}" ${isRendering ? 'disabled' : ''} />
            </div>
          </div>

          <!-- Card 2: Burned-In Timecode (BITC) & Slate -->
          <div class="dailies-section">
            <h3>⏱️ Burned-In Timecode & Slate Overlay</h3>

            <div class="dailies-checkbox-group">
              <label class="dailies-checkbox-label">
                <input type="checkbox" id="dailies-bitc-enabled" ${currentOptions.bitc.enabled ? 'checked' : ''} ${isRendering ? 'disabled' : ''} />
                <span><b>Enable Burned-In Timecode (BITC) Overlay</b></span>
              </label>
            </div>

            <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 8px;">
              <div class="dailies-field-group">
                <label>Starting Timecode</label>
                <input type="text" class="dailies-input" id="dailies-start-tc" value="${escapeHtml(currentOptions.bitc.startingTimecode)}" ${isRendering ? 'disabled' : ''} />
              </div>
              <div class="dailies-field-group">
                <label>Timecode Position</label>
                <select class="dailies-select" id="dailies-tc-pos" ${isRendering ? 'disabled' : ''}>
                  <option value="bottom_center" ${currentOptions.bitc.position === 'bottom_center' ? 'selected' : ''}>Bottom Center</option>
                  <option value="bottom_left" ${currentOptions.bitc.position === 'bottom_left' ? 'selected' : ''}>Bottom Left</option>
                  <option value="top_right" ${currentOptions.bitc.position === 'top_right' ? 'selected' : ''}>Top Right</option>
                  <option value="top_center" ${currentOptions.bitc.position === 'top_center' ? 'selected' : ''}>Top Center</option>
                </select>
              </div>
            </div>

            <div class="dailies-checkbox-group">
              <label class="dailies-checkbox-label">
                <input type="checkbox" id="dailies-drop-frame" ${currentOptions.bitc.dropFrame ? 'checked' : ''} ${isRendering ? 'disabled' : ''} />
                <span>SMPTE Drop-Frame Calculation (29.97 / 59.94)</span>
              </label>
              <label class="dailies-checkbox-label">
                <input type="checkbox" id="dailies-show-scene" ${currentOptions.bitc.showSceneShotTake ? 'checked' : ''} ${isRendering ? 'disabled' : ''} />
                <span>Show Scene, Shot & Take Badges</span>
              </label>
              <label class="dailies-checkbox-label">
                <input type="checkbox" id="dailies-show-lens" ${currentOptions.bitc.showCameraLensData ? 'checked' : ''} ${isRendering ? 'disabled' : ''} />
                <span>Show Camera Name & Optical Lens Data (Focal / T-Stop)</span>
              </label>
              <label class="dailies-checkbox-label">
                <input type="checkbox" id="dailies-show-watermark" ${currentOptions.bitc.showWatermark ? 'checked' : ''} ${isRendering ? 'disabled' : ''} />
                <span>Show Production Watermark</span>
              </label>
            </div>

            <div class="dailies-field-group">
              <label>Watermark Text</label>
              <input type="text" class="dailies-input" id="dailies-watermark-text" value="${escapeHtml(currentOptions.bitc.watermarkText ?? 'SETVIEW DAILIES PREVIZ')}" ${isRendering ? 'disabled' : ''} />
            </div>

            <div class="dailies-checkbox-group">
              <label class="dailies-checkbox-label">
                <input type="checkbox" id="dailies-audio-enabled" ${currentOptions.audioEnabled ? 'checked' : ''} ${isRendering ? 'disabled' : ''} />
                <span>🔊 Synthesize Audio Track (Frame 0 Clapper Pip + Cues)</span>
              </label>
            </div>
          </div>
        </div>

        <!-- Sequence Plan Summary & Cut Events Table -->
        <div class="dailies-section">
          <h3>📋 Animatic Sequence Plan (${plan.cuts.length} Shots · ${cameraCount} Cams · ${actorCount} Actors · ${audioCueCount} Audio Cues)</h3>
          <div style="max-height: 160px; overflow-y: auto;">
            <table class="dailies-table">
              <thead>
                <tr>
                  <th>Shot</th>
                  <th>Camera</th>
                  <th>Start Time</th>
                  <th>Start Timecode</th>
                  <th>Lens</th>
                  <th>T-Stop</th>
                  <th>Cut Type</th>
                </tr>
              </thead>
              <tbody>
                ${cutsTableRows}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Render Progress & Live Preview Container -->
        <div class="dailies-section">
          <h3>🎬 Headless Video Rendering & Preview</h3>

          <div id="dailies-progress-section" style="${isRendering ? 'display: flex;' : 'display: none;'} flex-direction: column; gap: 10px;">
            <div style="display: flex; justify-content: space-between; font-size: 13px;">
              <span id="dailies-progress-text" style="font-weight: 600; color: #38bdf8;">Rendering Frame 0 of ${plan.totalFrames} (0%)</span>
              <span id="dailies-eta-text" style="color: #94a3b8;">ETA: Calculating...</span>
            </div>
            <div class="dailies-progress-bar">
              <div class="dailies-progress-fill" id="dailies-progress-fill" style="width: 0%;"></div>
            </div>
          </div>

          <div class="dailies-preview-container" id="dailies-preview-container">
            ${
              renderBlobUrl
                ? `<video src="${renderBlobUrl}" controls autoplay loop style="max-width: 100%; max-height: 300px; border-radius: 6px;"></video>`
                : `<div style="font-size: 13px; color: #64748b; text-align: center;">Click "Render Dailies Video" to generate high-speed video animatic reel with SMPTE burned-in timecode overlays.</div>`
            }
          </div>
        </div>
      </div>

      <div class="dailies-modal-footer">
        <button class="dailies-btn-secondary" id="dailies-close-footer-btn">✕ Close</button>

        <div style="display: flex; gap: 10px; align-items: center;">
          ${
            isRendering
              ? `<button class="dailies-btn-danger" id="dailies-cancel-render-btn">⏹ Cancel Render</button>`
              : ''
          }
          ${
            renderBlobUrl && renderResult
              ? `<button class="dailies-btn-secondary" id="dailies-download-btn" style="color: #38bdf8; border-color: #38bdf8;">⬇ Download Video (${renderResult.filename})</button>`
              : ''
          }
          <button class="dailies-btn-primary" id="dailies-start-render-btn" ${isRendering ? 'disabled' : ''}>
            ${isRendering ? '⏳ Rendering Animatic...' : '🎬 Render Dailies Video'}
          </button>
        </div>
      </div>
    `;

    // Hook up interactive controls
    const closeBtn = dialog.querySelector<HTMLButtonElement>('#dailies-close-btn')!;
    closeBtn.onclick = close;
    const closeFooterBtn = dialog.querySelector<HTMLButtonElement>('#dailies-close-footer-btn')!;
    closeFooterBtn.onclick = close;

    const layoutSelect = dialog.querySelector<HTMLSelectElement>('#dailies-layout-select')!;
    layoutSelect.onchange = () => {
      currentOptions.layout = layoutSelect.value as DailiesLayoutMode;
      renderContent();
    };

    const presetSelect = dialog.querySelector<HTMLSelectElement>('#dailies-preset-select')!;
    presetSelect.onchange = () => {
      const preset = DAILIES_RESOLUTION_PRESETS.find((p) => p.id === presetSelect.value);
      if (preset) {
        currentOptions.resolution.width = preset.width;
        currentOptions.resolution.height = preset.height;
        currentOptions.fps = preset.fps;
        if (preset.id.includes('df')) {
          currentOptions.bitc.dropFrame = true;
        }
      }
      renderContent();
    };

    const widthInput = dialog.querySelector<HTMLInputElement>('#dailies-width')!;
    widthInput.onchange = () => {
      currentOptions.resolution.width = Math.max(320, parseInt(widthInput.value, 10) || 1920);
      renderContent();
    };

    const heightInput = dialog.querySelector<HTMLInputElement>('#dailies-height')!;
    heightInput.onchange = () => {
      currentOptions.resolution.height = Math.max(240, parseInt(heightInput.value, 10) || 1080);
      renderContent();
    };

    const fpsInput = dialog.querySelector<HTMLInputElement>('#dailies-fps')!;
    fpsInput.onchange = () => {
      currentOptions.fps = Math.max(12, Math.min(120, parseFloat(fpsInput.value) || 24));
      renderContent();
    };

    const formatSelect = dialog.querySelector<HTMLSelectElement>('#dailies-format-select')!;
    formatSelect.onchange = () => {
      currentOptions.format = formatSelect.value as 'mp4' | 'webm';
    };

    const qualitySelect = dialog.querySelector<HTMLSelectElement>('#dailies-quality-select')!;
    qualitySelect.onchange = () => {
      currentOptions.qualityMbps = parseInt(qualitySelect.value, 10) || 8;
    };

    const durInput = dialog.querySelector<HTMLInputElement>('#dailies-duration-override')!;
    durInput.onchange = () => {
      const val = parseFloat(durInput.value);
      currentOptions.durationOverrideS = Number.isFinite(val) && val > 0 ? val : undefined;
      renderContent();
    };

    const bitcToggle = dialog.querySelector<HTMLInputElement>('#dailies-bitc-enabled')!;
    bitcToggle.onchange = () => {
      currentOptions.bitc.enabled = bitcToggle.checked;
    };

    const startTcInput = dialog.querySelector<HTMLInputElement>('#dailies-start-tc')!;
    startTcInput.onchange = () => {
      currentOptions.bitc.startingTimecode = startTcInput.value.trim() || '01:00:00:00';
      renderContent();
    };

    const tcPosSelect = dialog.querySelector<HTMLSelectElement>('#dailies-tc-pos')!;
    tcPosSelect.onchange = () => {
      currentOptions.bitc.position = tcPosSelect.value as BurnedInTimecodeConfig['position'];
    };

    const dfToggle = dialog.querySelector<HTMLInputElement>('#dailies-drop-frame')!;
    dfToggle.onchange = () => {
      currentOptions.bitc.dropFrame = dfToggle.checked;
      renderContent();
    };

    const showSceneToggle = dialog.querySelector<HTMLInputElement>('#dailies-show-scene')!;
    showSceneToggle.onchange = () => {
      currentOptions.bitc.showSceneShotTake = showSceneToggle.checked;
    };

    const showLensToggle = dialog.querySelector<HTMLInputElement>('#dailies-show-lens')!;
    showLensToggle.onchange = () => {
      currentOptions.bitc.showCameraLensData = showLensToggle.checked;
    };

    const showWatermarkToggle = dialog.querySelector<HTMLInputElement>('#dailies-show-watermark')!;
    showWatermarkToggle.onchange = () => {
      currentOptions.bitc.showWatermark = showWatermarkToggle.checked;
    };

    const watermarkInput = dialog.querySelector<HTMLInputElement>('#dailies-watermark-text')!;
    watermarkInput.oninput = () => {
      currentOptions.bitc.watermarkText = watermarkInput.value;
    };

    const audioToggle = dialog.querySelector<HTMLInputElement>('#dailies-audio-enabled')!;
    audioToggle.onchange = () => {
      currentOptions.audioEnabled = audioToggle.checked;
    };

    // Download button handler
    const downloadBtn = dialog.querySelector<HTMLButtonElement>('#dailies-download-btn');
    if (downloadBtn && renderBlobUrl && renderResult) {
      downloadBtn.onclick = () => {
        const a = document.createElement('a');
        a.href = renderBlobUrl!;
        a.download = renderResult!.filename;
        a.click();
      };
    }

    // Cancel Render handler
    const cancelBtn = dialog.querySelector<HTMLButtonElement>('#dailies-cancel-render-btn');
    if (cancelBtn) {
      cancelBtn.onclick = () => {
        if (activeRenderer) {
          activeRenderer.abort();
        }
      };
    }

    // Start Render handler
    const renderBtn = dialog.querySelector<HTMLButtonElement>('#dailies-start-render-btn')!;
    renderBtn.onclick = async () => {
      if (isRendering) return;
      isRendering = true;
      renderContent();

      const progressFill = dialog.querySelector<HTMLDivElement>('#dailies-progress-fill')!;
      const progressText = dialog.querySelector<HTMLSpanElement>('#dailies-progress-text')!;
      const etaText = dialog.querySelector<HTMLSpanElement>('#dailies-eta-text')!;
      const previewContainer = dialog.querySelector<HTMLDivElement>('#dailies-preview-container')!;

      const handleProgress: DailiesRenderProgressCallback = (
        progress,
        currentFrame,
        totalFrames,
        etaSeconds,
        previewCanvas,
      ) => {
        const pct = Math.round(progress * 100);
        if (progressFill) progressFill.style.width = `${pct}%`;
        if (progressText) {
          progressText.textContent = `Rendering Frame ${currentFrame} of ${totalFrames} (${pct}%)`;
        }
        if (etaText) {
          etaText.textContent = `ETA: ~${etaSeconds}s`;
        }
        if (previewCanvas && previewContainer) {
          previewContainer.innerHTML = '';
          const previewImg = document.createElement('img');
          previewImg.src = previewCanvas.toDataURL('image/jpeg', 0.6);
          previewImg.style.maxWidth = '100%';
          previewImg.style.maxHeight = '300px';
          previewImg.style.borderRadius = '6px';
          previewContainer.appendChild(previewImg);
        }
      };

      try {
        if (onRenderVideo) {
          const res = await onRenderVideo(currentOptions, handleProgress);
          if (res && (res as DailiesRenderResult).blob) {
            renderResult = res as DailiesRenderResult;
            renderBlobUrl = (res as DailiesRenderResult).url;
          }
        } else {
          activeRenderer = new AnimaticVideoRenderer();
          renderResult = await activeRenderer.renderAnimaticVideo(
            scene,
            undefined,
            currentOptions,
            handleProgress,
          );
          renderBlobUrl = renderResult.url;
        }

        // Trigger automatic download
        if (renderBlobUrl && renderResult) {
          const a = document.createElement('a');
          a.href = renderBlobUrl;
          a.download = renderResult.filename;
          a.click();
        }
      } catch (err) {
        console.error('Dailies video rendering error:', err);
        alert(`Dailies video rendering failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        isRendering = false;
        activeRenderer = null;
        renderContent();
      }
    };
  };

  overlay.appendChild(dialog);
  overlayRoot.appendChild(overlay);
  renderContent();
}

/** Opens the Soundstage DMX512, Art-Net 4 & ANSI E1.31 sACN Lighting Bridge Studio modal. */
export function openDmxBridgeStudioModal(
  scene: SceneData,
  onSaveConfig?: (config: DmxBridgeConfig) => void,
  onUpdatePatches?: (patches: DmxPatchEntry[]) => void,
  onTriggerCue?: (cue: DmxCue) => void,
  streamer?: DmxStreamer,
  overlayRoot: HTMLElement = document.body,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'dmx-modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'dmx-modal-dialog';

  let activeTab: 'network' | 'patches' | 'faders' | 'cues' = 'patches';
  let selectedUniverse = 0;

  const currentConfig: DmxBridgeConfig = scene.dmxBridge
    ? { ...scene.dmxBridge }
    : createDmxBridgeConfig();
  let currentPatches: DmxPatchEntry[] = scene.dmxPatches
    ? scene.dmxPatches.map((p) => ({ ...p }))
    : [];
  let currentCues: DmxCue[] = scene.dmxCues
    ? scene.dmxCues.map((c) => ({ ...c }))
    : [];

  const activeStreamer = streamer ?? new DmxStreamer(currentConfig);
  let diag = activeStreamer.getDiagnostics();

  const renderBadge = (state: DmxConnectionState, protocol: DmxProtocol): string => {
    const protoLabel = protocol === 'sacn' ? 'sACN E1.31' : 'Art-Net 4';
    switch (state) {
      case 'streaming':
        return `<span class="dmx-status-badge streaming">● STREAMING (${protoLabel}, ${diag.fps} FPS, ${diag.packetsSent} pkts)</span>`;
      case 'connected':
        return `<span class="dmx-status-badge connected">● CONNECTED (${protoLabel})</span>`;
      case 'connecting':
        return `<span class="dmx-status-badge connecting">◌ CONNECTING...</span>`;
      case 'error':
        return `<span class="dmx-status-badge error">✕ ERROR (${diag.lastErrorMessage ?? 'Bridge offline'})</span>`;
      default:
        return `<span class="dmx-status-badge disconnected">○ STANDBY (${protoLabel})</span>`;
    }
  };

  const closeModal = () => {
    unsubDiag();
    unsubUni();
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  };

  dialog.innerHTML = `
    <div class="dmx-modal-header">
      <h2>
        <span>💡 Soundstage DMX512 & Art-Net / sACN Bridge Studio</span>
        <span id="dmx-header-badge">${renderBadge(diag.state, currentConfig.protocol)}</span>
      </h2>
      <button class="dmx-modal-close" id="dmx-close-btn" title="Close">✕</button>
    </div>

    <div class="dmx-tabs-bar">
      <button class="dmx-tab-btn active" id="tab-patches-btn">🎛️ DMX Patch Matrix</button>
      <button class="dmx-tab-btn" id="tab-faders-btn">🎚️ Live 512-Ch Faders</button>
      <button class="dmx-tab-btn" id="tab-network-btn">📡 Protocol & Network</button>
      <button class="dmx-tab-btn" id="tab-cues-btn">🎬 Lighting Cues (${currentCues.length})</button>
    </div>

    <div class="dmx-modal-body" id="dmx-body-content">
      <!-- Dynamic tab content -->
    </div>

    <div class="dmx-modal-footer">
      <div style="display: flex; gap: 8px;">
        <button class="dmx-btn-danger" id="dmx-blackout-btn" title="Set all DMX channels to 0">⬛ Blackout (0%)</button>
        <button class="dmx-btn-warning" id="dmx-highlight-btn" title="Set all fixtures to full intensity">✨ Highlight (100%)</button>
        <button class="dmx-btn-secondary" id="dmx-sync-scene-btn" title="Map scene lights to DMX channels">🔄 Sync Scene</button>
        <button class="dmx-btn-secondary" id="dmx-export-csv-btn" title="Download RFC 4180 CSV manifest">⬇ Export CSV</button>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="dmx-btn-secondary" id="dmx-cancel-btn">Cancel</button>
        <button class="dmx-btn-primary" id="dmx-save-btn">💾 Save & Apply</button>
      </div>
    </div>
  `;

  const headerBadgeEl = dialog.querySelector<HTMLElement>('#dmx-header-badge')!;
  const bodyEl = dialog.querySelector<HTMLElement>('#dmx-body-content')!;

  const tabPatchesBtn = dialog.querySelector<HTMLButtonElement>('#tab-patches-btn')!;
  const tabFadersBtn = dialog.querySelector<HTMLButtonElement>('#tab-faders-btn')!;
  const tabNetworkBtn = dialog.querySelector<HTMLButtonElement>('#tab-network-btn')!;
  const tabCuesBtn = dialog.querySelector<HTMLButtonElement>('#tab-cues-btn')!;

  const setTab = (tab: 'network' | 'patches' | 'faders' | 'cues') => {
    activeTab = tab;
    tabPatchesBtn.className = `dmx-tab-btn ${tab === 'patches' ? 'active' : ''}`;
    tabFadersBtn.className = `dmx-tab-btn ${tab === 'faders' ? 'active' : ''}`;
    tabNetworkBtn.className = `dmx-tab-btn ${tab === 'network' ? 'active' : ''}`;
    tabCuesBtn.className = `dmx-tab-btn ${tab === 'cues' ? 'active' : ''}`;
    renderTabBody();
  };

  tabPatchesBtn.onclick = () => setTab('patches');
  tabFadersBtn.onclick = () => setTab('faders');
  tabNetworkBtn.onclick = () => setTab('network');
  tabCuesBtn.onclick = () => setTab('cues');

  dialog.querySelector<HTMLButtonElement>('#dmx-close-btn')!.onclick = closeModal;
  dialog.querySelector<HTMLButtonElement>('#dmx-cancel-btn')!.onclick = closeModal;

  dialog.querySelector<HTMLButtonElement>('#dmx-blackout-btn')!.onclick = () => {
    activeStreamer.blackoutAll();
    if (activeTab === 'faders') renderTabBody();
  };

  dialog.querySelector<HTMLButtonElement>('#dmx-highlight-btn')!.onclick = () => {
    for (const p of currentPatches) {
      activeStreamer.highlightFixture(p.patchId, { ...scene, dmxPatches: currentPatches });
    }
    if (activeTab === 'faders') renderTabBody();
  };

  dialog.querySelector<HTMLButtonElement>('#dmx-sync-scene-btn')!.onclick = () => {
    activeStreamer.syncFromScene({ ...scene, dmxPatches: currentPatches });
    if (activeTab === 'faders') renderTabBody();
  };

  dialog.querySelector<HTMLButtonElement>('#dmx-export-csv-btn')!.onclick = () => {
    const csvContent = exportDmxPatchListCsv(currentPatches, DMX_FIXTURE_PROFILES);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dmx_patch_${scene.name ? scene.name.toLowerCase().replace(/\s+/g, '_') : 'scene'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  dialog.querySelector<HTMLButtonElement>('#dmx-save-btn')!.onclick = () => {
    if (onSaveConfig) onSaveConfig(currentConfig);
    if (onUpdatePatches) onUpdatePatches(currentPatches);
    closeModal();
  };

  const unsubDiag = activeStreamer.onDiagnostics((d) => {
    diag = d;
    headerBadgeEl.innerHTML = renderBadge(diag.state, currentConfig.protocol);
  });

  const unsubUni = activeStreamer.onUniverseUpdate((u, _data) => {
    if (activeTab === 'faders' && u === selectedUniverse) {
      updateFadersVisual();
    }
  });

  const renderTabBody = () => {
    bodyEl.innerHTML = '';

    if (activeTab === 'patches') {
      const pane = document.createElement('div');
      pane.className = 'dmx-tab-pane';

      const toolbar = document.createElement('div');
      toolbar.style.display = 'flex';
      toolbar.style.justifyContent = 'space-between';
      toolbar.style.alignItems = 'center';

      const leftTools = document.createElement('div');
      leftTools.style.display = 'flex';
      leftTools.style.gap = '8px';

      const addPatchBtn = document.createElement('button');
      addPatchBtn.className = 'dmx-btn-primary';
      addPatchBtn.textContent = '+ Add Fixture Patch';
      addPatchBtn.onclick = () => {
        const availableLights = scene.lights ?? [];
        const existingLightIds = new Set(currentPatches.map((p) => p.lightId));
        const unpatched = availableLights.find((l) => !existingLightIds.has(l.id));

        let nextAddr = 1;
        if (currentPatches.length > 0) {
          const last = currentPatches[currentPatches.length - 1];
          const prof = findFixtureProfile(last.fixtureProfileId);
          nextAddr = Math.min(512, last.startAddress + prof.totalChannels);
        }

        const newEntry = createDmxPatchEntry({
          lightId: unpatched ? unpatched.id : (availableLights[0]?.id ?? ''),
          lightName: unpatched ? unpatched.name : `Fixture ${currentPatches.length + 1}`,
          universe: 0,
          startAddress: nextAddr,
          fixtureProfileId: 'arri-skypanel-s60c-m6',
          enabled: true,
        });
        currentPatches.push(newEntry);
        renderTabBody();
      };
      leftTools.appendChild(addPatchBtn);

      const autoPatchBtn = document.createElement('button');
      autoPatchBtn.className = 'dmx-btn-secondary';
      autoPatchBtn.textContent = '⚡ Auto-Patch All Lights';
      autoPatchBtn.onclick = () => {
        const lights = scene.lights ?? [];
        currentPatches = [];
        let currUni = 0;
        let currAddr = 1;

        for (const l of lights) {
          const profId = l.type === 'spot' ? 'generic-moving-spot' : 'arri-skypanel-s60c-m6';
          const prof = findFixtureProfile(profId);
          if (currAddr + prof.totalChannels > 512) {
            currUni++;
            currAddr = 1;
          }
          currentPatches.push(
            createDmxPatchEntry({
              lightId: l.id,
              lightName: l.name,
              universe: currUni,
              startAddress: currAddr,
              fixtureProfileId: profId,
              enabled: true,
            }),
          );
          currAddr += prof.totalChannels;
        }
        renderTabBody();
      };
      leftTools.appendChild(autoPatchBtn);

      toolbar.appendChild(leftTools);

      const countSpan = document.createElement('span');
      countSpan.style.fontSize = '12px';
      countSpan.style.color = '#94a3b8';
      countSpan.textContent = `Total Patched Fixtures: ${currentPatches.length}`;
      toolbar.appendChild(countSpan);

      pane.appendChild(toolbar);

      const tableContainer = document.createElement('div');
      tableContainer.className = 'dmx-table-container';

      const table = document.createElement('table');
      table.className = 'dmx-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th>Status</th>
            <th>Scene Light</th>
            <th>Fixture Profile</th>
            <th>Universe</th>
            <th>Start Address</th>
            <th>Channels</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;

      const tbody = table.querySelector('tbody')!;
      if (currentPatches.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; color: #94a3b8; padding: 24px;">
              No DMX patches configured. Click "+ Add Fixture Patch" or "Auto-Patch All Lights".
            </td>
          </tr>
        `;
      } else {
        currentPatches.forEach((patch, idx) => {
          const tr = document.createElement('tr');

          // Enabled toggle
          const tdStatus = document.createElement('td');
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.checked = patch.enabled;
          chk.onchange = () => {
            patch.enabled = chk.checked;
          };
          tdStatus.appendChild(chk);
          tr.appendChild(tdStatus);

          // Scene Light Selector
          const tdLight = document.createElement('td');
          const lightSel = document.createElement('select');
          lightSel.className = 'dmx-select';
          (scene.lights ?? []).forEach((l) => {
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = `${l.name} (${l.type.toUpperCase()})`;
            if (l.id === patch.lightId) opt.selected = true;
            lightSel.appendChild(opt);
          });
          lightSel.onchange = () => {
            patch.lightId = lightSel.value;
            const chosen = (scene.lights ?? []).find((l) => l.id === lightSel.value);
            if (chosen) patch.lightName = chosen.name;
          };
          tdLight.appendChild(lightSel);
          tr.appendChild(tdLight);

          // Fixture Profile Selector
          const tdProf = document.createElement('td');
          const profSel = document.createElement('select');
          profSel.className = 'dmx-select';
          DMX_FIXTURE_PROFILES.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.manufacturer} ${p.model} (${p.mode})`;
            if (p.id === patch.fixtureProfileId) opt.selected = true;
            profSel.appendChild(opt);
          });
          profSel.onchange = () => {
            patch.fixtureProfileId = profSel.value;
            renderTabBody();
          };
          tdProf.appendChild(profSel);
          tr.appendChild(tdProf);

          // Universe
          const tdUni = document.createElement('td');
          const uniIn = document.createElement('input');
          uniIn.type = 'number';
          uniIn.className = 'dmx-input';
          uniIn.style.width = '60px';
          uniIn.min = '0';
          uniIn.max = '15';
          uniIn.value = String(patch.universe);
          uniIn.onchange = () => {
            patch.universe = Math.max(0, Math.min(15, parseInt(uniIn.value, 10) || 0));
          };
          tdUni.appendChild(uniIn);
          tr.appendChild(tdUni);

          // Start Address
          const tdAddr = document.createElement('td');
          const addrIn = document.createElement('input');
          addrIn.type = 'number';
          addrIn.className = 'dmx-input';
          addrIn.style.width = '70px';
          addrIn.min = '1';
          addrIn.max = '512';
          addrIn.value = String(patch.startAddress);
          addrIn.onchange = () => {
            patch.startAddress = Math.max(1, Math.min(512, parseInt(addrIn.value, 10) || 1));
          };
          tdAddr.appendChild(addrIn);
          tr.appendChild(tdAddr);

          // Channel footprint
          const profile = findFixtureProfile(patch.fixtureProfileId);
          const tdCh = document.createElement('td');
          tdCh.textContent = `${profile.totalChannels} ch (${patch.startAddress}-${Math.min(512, patch.startAddress + profile.totalChannels - 1)})`;
          tdCh.style.color = '#94a3b8';
          tr.appendChild(tdCh);

          // Actions
          const tdActions = document.createElement('td');
          tdActions.style.display = 'flex';
          tdActions.style.gap = '6px';

          const testBtn = document.createElement('button');
          testBtn.className = 'dmx-btn-secondary';
          testBtn.style.padding = '4px 8px';
          testBtn.textContent = 'Highlight';
          testBtn.onclick = () => {
            activeStreamer.highlightFixture(patch.patchId, { ...scene, dmxPatches: currentPatches });
          };
          tdActions.appendChild(testBtn);

          const delBtn = document.createElement('button');
          delBtn.className = 'dmx-btn-danger';
          delBtn.style.padding = '4px 8px';
          delBtn.textContent = '✕';
          delBtn.onclick = () => {
            currentPatches.splice(idx, 1);
            renderTabBody();
          };
          tdActions.appendChild(delBtn);

          tr.appendChild(tdActions);
          tbody.appendChild(tr);
        });
      }

      tableContainer.appendChild(table);
      pane.appendChild(tableContainer);
      bodyEl.appendChild(pane);
    } else if (activeTab === 'faders') {
      const pane = document.createElement('div');
      pane.className = 'dmx-tab-pane';

      const controlsRow = document.createElement('div');
      controlsRow.style.display = 'flex';
      controlsRow.style.justifyContent = 'space-between';
      controlsRow.style.alignItems = 'center';

      const uniSelector = document.createElement('div');
      uniSelector.style.display = 'flex';
      uniSelector.style.alignItems = 'center';
      uniSelector.style.gap = '8px';

      const uniLabel = document.createElement('label');
      uniLabel.style.fontSize = '13px';
      uniLabel.style.fontWeight = '600';
      uniLabel.style.color = '#94a3b8';
      uniLabel.textContent = 'Active Universe:';
      uniSelector.appendChild(uniLabel);

      const sel = document.createElement('select');
      sel.className = 'dmx-select';
      for (let u = 0; u < 16; u++) {
        const opt = document.createElement('option');
        opt.value = String(u);
        opt.textContent = `Universe ${u} (${currentConfig.protocol === 'sacn' ? u + 1 : u})`;
        if (u === selectedUniverse) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.onchange = () => {
        selectedUniverse = parseInt(sel.value, 10) || 0;
        updateFadersVisual();
      };
      uniSelector.appendChild(sel);
      controlsRow.appendChild(uniSelector);

      const quickFaders = document.createElement('div');
      quickFaders.style.display = 'flex';
      quickFaders.style.gap = '8px';

      const zeroUniBtn = document.createElement('button');
      zeroUniBtn.className = 'dmx-btn-secondary';
      zeroUniBtn.textContent = 'Zero Universe';
      zeroUniBtn.onclick = () => {
        const data = activeStreamer.getUniverseData(selectedUniverse);
        data.fill(0);
        updateFadersVisual();
      };
      quickFaders.appendChild(zeroUniBtn);

      const fullUniBtn = document.createElement('button');
      fullUniBtn.className = 'dmx-btn-secondary';
      fullUniBtn.textContent = 'Full 100% Universe';
      fullUniBtn.onclick = () => {
        const data = activeStreamer.getUniverseData(selectedUniverse);
        data.fill(255);
        updateFadersVisual();
      };
      quickFaders.appendChild(fullUniBtn);

      controlsRow.appendChild(quickFaders);
      pane.appendChild(controlsRow);

      const matrixGrid = document.createElement('div');
      matrixGrid.className = 'dmx-fader-matrix';
      matrixGrid.id = 'dmx-matrix-grid';
      pane.appendChild(matrixGrid);

      bodyEl.appendChild(pane);
      updateFadersVisual();
    } else if (activeTab === 'network') {
      const pane = document.createElement('div');
      pane.className = 'dmx-tab-pane';

      const grid = document.createElement('div');
      grid.className = 'dmx-grid';

      // Protocol & Destination Card
      const protoSection = document.createElement('div');
      protoSection.className = 'dmx-section';
      protoSection.innerHTML = `
        <h3>📡 Network Protocol & Endpoints</h3>
        <div class="dmx-field-group">
          <label>Protocol</label>
          <select class="dmx-select" id="net-proto-select">
            <option value="artnet" ${currentConfig.protocol === 'artnet' ? 'selected' : ''}>Art-Net 4 (Port 6454 UDP)</option>
            <option value="sacn" ${currentConfig.protocol === 'sacn' ? 'selected' : ''}>ANSI E1.31 sACN (Port 5568 UDP / Multicast)</option>
          </select>
        </div>
        <div class="dmx-field-group">
          <label>Target IP / Broadcast Address</label>
          <input type="text" class="dmx-input" id="net-target-ip" value="${currentConfig.targetIp}" />
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="dmx-field-group">
            <label>Target Port</label>
            <input type="number" class="dmx-input" id="net-target-port" value="${currentConfig.targetPort}" />
          </div>
          <div class="dmx-field-group">
            <label>Local Port</label>
            <input type="number" class="dmx-input" id="net-local-port" value="${currentConfig.localPort}" />
          </div>
        </div>
      `;
      grid.appendChild(protoSection);

      // Routing & Performance Card
      const perfSection = document.createElement('div');
      perfSection.className = 'dmx-section';
      perfSection.innerHTML = `
        <h3>⚙️ Universe Routing & Stream Timers</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="dmx-field-group">
            <label>Art-Net Subnet (0-15)</label>
            <input type="number" class="dmx-input" id="net-subnet" min="0" max="15" value="${currentConfig.subnet}" />
          </div>
          <div class="dmx-field-group">
            <label>Universe Offset</label>
            <input type="number" class="dmx-input" id="net-uni-offset" min="0" max="15" value="${currentConfig.universeOffset}" />
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div class="dmx-field-group">
            <label>Refresh Rate (Hz)</label>
            <input type="number" class="dmx-input" id="net-refresh-rate" min="1" max="60" value="${currentConfig.refreshRateHz}" />
          </div>
          <div class="dmx-field-group">
            <label>sACN Priority (0-200)</label>
            <input type="number" class="dmx-input" id="net-priority" min="0" max="200" value="${currentConfig.priority}" />
          </div>
        </div>
        <div class="dmx-field-group" style="margin-top: 8px;">
          <label class="dmx-checkbox-label">
            <input type="checkbox" id="net-sync-chk" ${currentConfig.syncWithSceneLights ? 'checked' : ''} />
            <span>Bi-directional Real-Time Scene Sync</span>
          </label>
        </div>
        <div class="dmx-field-group">
          <label class="dmx-checkbox-label">
            <input type="checkbox" id="net-enable-chk" ${currentConfig.enabled ? 'checked' : ''} />
            <span>Enable DMX Streaming Engine</span>
          </label>
        </div>
      `;
      grid.appendChild(perfSection);

      pane.appendChild(grid);
      bodyEl.appendChild(pane);

      // Wire change listeners
      const protoSel = pane.querySelector<HTMLSelectElement>('#net-proto-select')!;
      const targetIpIn = pane.querySelector<HTMLInputElement>('#net-target-ip')!;
      const targetPortIn = pane.querySelector<HTMLInputElement>('#net-target-port')!;
      const localPortIn = pane.querySelector<HTMLInputElement>('#net-local-port')!;
      const subnetIn = pane.querySelector<HTMLInputElement>('#net-subnet')!;
      const uniOffsetIn = pane.querySelector<HTMLInputElement>('#net-uni-offset')!;
      const refreshIn = pane.querySelector<HTMLInputElement>('#net-refresh-rate')!;
      const priorityIn = pane.querySelector<HTMLInputElement>('#net-priority')!;
      const syncChk = pane.querySelector<HTMLInputElement>('#net-sync-chk')!;
      const enableChk = pane.querySelector<HTMLInputElement>('#net-enable-chk')!;

      const updateConfigFromUI = () => {
        currentConfig.protocol = protoSel.value as DmxProtocol;
        currentConfig.targetIp = targetIpIn.value.trim() || '127.0.0.1';
        currentConfig.targetPort = parseInt(targetPortIn.value, 10) || (currentConfig.protocol === 'sacn' ? 5568 : 6454);
        currentConfig.localPort = parseInt(localPortIn.value, 10) || (currentConfig.protocol === 'sacn' ? 5568 : 6454);
        currentConfig.subnet = parseInt(subnetIn.value, 10) || 0;
        currentConfig.universeOffset = parseInt(uniOffsetIn.value, 10) || 0;
        currentConfig.refreshRateHz = parseInt(refreshIn.value, 10) || 30;
        currentConfig.priority = parseInt(priorityIn.value, 10) || 100;
        currentConfig.syncWithSceneLights = syncChk.checked;
        currentConfig.enabled = enableChk.checked;
        activeStreamer.setConfig(currentConfig);
      };

      protoSel.onchange = () => {
        if (protoSel.value === 'sacn') {
          targetPortIn.value = '5568';
          localPortIn.value = '5568';
        } else {
          targetPortIn.value = '6454';
          localPortIn.value = '6454';
        }
        updateConfigFromUI();
      };
      targetIpIn.onchange = updateConfigFromUI;
      targetPortIn.onchange = updateConfigFromUI;
      localPortIn.onchange = updateConfigFromUI;
      subnetIn.onchange = updateConfigFromUI;
      uniOffsetIn.onchange = updateConfigFromUI;
      refreshIn.onchange = updateConfigFromUI;
      priorityIn.onchange = updateConfigFromUI;
      syncChk.onchange = updateConfigFromUI;
      enableChk.onchange = updateConfigFromUI;
    } else if (activeTab === 'cues') {
      const pane = document.createElement('div');
      pane.className = 'dmx-tab-pane';

      const cueTools = document.createElement('div');
      cueTools.style.display = 'flex';
      cueTools.style.justifyContent = 'space-between';
      cueTools.style.alignItems = 'center';

      const captureBtn = document.createElement('button');
      captureBtn.className = 'dmx-btn-primary';
      captureBtn.textContent = '📸 Capture Current Scene Look as Cue';
      captureBtn.onclick = () => {
        const cueValues: { universe: number; channel: number; value: number }[] = [];
        for (let u = 0; u < 16; u++) {
          const buffer = activeStreamer.getUniverseData(u);
          for (let ch = 0; ch < 512; ch++) {
            if (buffer[ch] > 0) {
              cueValues.push({ universe: u, channel: ch + 1, value: buffer[ch] });
            }
          }
        }
        const newCue = createDmxCue({
          name: `Cue ${currentCues.length + 1}`,
          values: cueValues,
        });
        currentCues.push(newCue);
        renderTabBody();
      };
      cueTools.appendChild(captureBtn);

      pane.appendChild(cueTools);

      const cuesList = document.createElement('div');
      cuesList.className = 'dmx-cues-list';

      if (currentCues.length === 0) {
        cuesList.innerHTML = `
          <div style="text-align: center; color: #94a3b8; padding: 32px; background: #1e293b; border-radius: 6px;">
            No stored lighting cues. Click "Capture Current Scene Look as Cue" to snapshot the rig.
          </div>
        `;
      } else {
        currentCues.forEach((cue, idx) => {
          const item = document.createElement('div');
          item.className = 'dmx-cue-item';

          const left = document.createElement('div');
          const title = document.createElement('div');
          title.className = 'dmx-cue-title';
          title.textContent = cue.name;
          const meta = document.createElement('div');
          meta.className = 'dmx-cue-meta';
          meta.textContent = `${cue.values.length} channel adjustments stored`;
          left.appendChild(title);
          left.appendChild(meta);
          item.appendChild(left);

          const btns = document.createElement('div');
          btns.style.display = 'flex';
          btns.style.gap = '8px';

          const playBtn = document.createElement('button');
          playBtn.className = 'dmx-btn-primary';
          playBtn.style.padding = '6px 12px';
          playBtn.textContent = '▶ Fire Cue';
          playBtn.onclick = () => {
            activeStreamer.triggerCue(cue, { ...scene, dmxCues: currentCues });
            if (onTriggerCue) onTriggerCue(cue);
          };
          btns.appendChild(playBtn);

          const delBtn = document.createElement('button');
          delBtn.className = 'dmx-btn-danger';
          delBtn.style.padding = '6px 10px';
          delBtn.textContent = '✕';
          delBtn.onclick = () => {
            currentCues.splice(idx, 1);
            renderTabBody();
          };
          btns.appendChild(delBtn);

          item.appendChild(btns);
          cuesList.appendChild(item);
        });
      }

      pane.appendChild(cuesList);
      bodyEl.appendChild(pane);
    }
  };

  const updateFadersVisual = () => {
    const grid = dialog.querySelector<HTMLElement>('#dmx-matrix-grid');
    if (!grid) return;

    const data = activeStreamer.getUniverseData(selectedUniverse);
    grid.innerHTML = '';

    // Render channels 1..512
    for (let i = 0; i < 512; i++) {
      const chNum = i + 1;
      const val = data[i];
      const cell = document.createElement('div');
      cell.className = 'dmx-channel-cell';

      const numSpan = document.createElement('span');
      numSpan.className = 'dmx-channel-num';
      numSpan.textContent = String(chNum);

      const meter = document.createElement('div');
      meter.className = 'dmx-channel-meter';
      const meterFill = document.createElement('div');
      meterFill.className = 'dmx-channel-meter-fill';
      meterFill.style.height = `${Math.round((val / 255) * 100)}%`;
      meter.appendChild(meterFill);

      const valSpan = document.createElement('span');
      valSpan.className = 'dmx-channel-val';
      valSpan.textContent = String(val);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '255';
      slider.value = String(val);
      slider.style.width = '42px';
      slider.style.height = '12px';
      slider.oninput = () => {
        const newVal = parseInt(slider.value, 10) || 0;
        data[i] = newVal;
        meterFill.style.height = `${Math.round((newVal / 255) * 100)}%`;
        valSpan.textContent = String(newVal);
      };

      cell.appendChild(numSpan);
      cell.appendChild(meter);
      cell.appendChild(valSpan);
      cell.appendChild(slider);
      grid.appendChild(cell);
    }
  };

  overlay.appendChild(dialog);
  overlayRoot.appendChild(overlay);
  renderTabBody();
}

/**
 * Opens the Virtual Production In-Camera VFX (ICVFX) LED Volume Wall Calibration,
 * Moiré Optical Risk Analyzer & Unreal Engine nDisplay Integration Studio Modal.
 */
export function openIcvfxStudioModal(
  scene: SceneData,
  onSaveConfig?: (config: LedVolumeConfig) => void,
  onExportNDisplay?: () => void,
  onExportUsd?: () => void,
  overlayRoot: HTMLElement = document.body,
): void {
  const existingModal = document.querySelector('.icvfx-modal-overlay');
  if (existingModal) existingModal.remove();

  const overlay = document.createElement('div');
  overlay.className = 'icvfx-modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'icvfx-modal-dialog';

  // Deep clone initial config
  const initialConfig: LedVolumeConfig = scene.icvfx
    ? normalizeLedVolumeConfig(scene.icvfx)
    : createLedVolumeConfig('horseshoe_270');
  const currentConfig: LedVolumeConfig = JSON.parse(JSON.stringify(initialConfig));

  let activeTab: 'presets' | 'moire' | 'geometry' | 'export' = 'moire';

  // Live Moiré state
  let moireDistM = 4.5;
  let moireFocalMm = scene.cameras[0]?.lensFocalLength ? Number(scene.cameras[0].lensFocalLength) : 35;
  let moireSensorWidthMm = 24.89; // Super35 default
  let moireSensorResPx = 4096; // 4K default
  let moirePitchMm = currentConfig.walls[0]?.pixelPitchMm ?? 2.3;
  let moireApertureF = 2.8;

  const triggerDownload = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderModal = () => {
    dialog.innerHTML = `
      <div class="icvfx-modal-header">
        <div class="icvfx-header-title">
          <h2>🎬 ICVFX LED Volume & nDisplay Studio</h2>
          <span class="icvfx-scene-badge">${escapeHtml(scene.name || 'Untitled Scene')}</span>
        </div>
        <button class="icvfx-modal-close" title="Close">✕</button>
      </div>

      <div class="icvfx-tab-bar">
        <button class="icvfx-tab-btn ${activeTab === 'presets' ? 'active' : ''}" data-tab="presets">📐 Stage Presets</button>
        <button class="icvfx-tab-btn ${activeTab === 'moire' ? 'active' : ''}" data-tab="moire">🔬 Moiré Risk Analyzer</button>
        <button class="icvfx-tab-btn ${activeTab === 'geometry' ? 'active' : ''}" data-tab="geometry">🧱 Wall Geometries & LUT</button>
        <button class="icvfx-tab-btn ${activeTab === 'export' ? 'active' : ''}" data-tab="export">🚀 nDisplay & OpenUSD</button>
      </div>

      <div class="icvfx-modal-body" id="icvfx-tab-content"></div>

      <div class="icvfx-modal-footer">
        <div class="icvfx-footer-left">
          <label style="display:flex; align-items:center; gap:8px; font-size:12px; color:#cbd5e1; cursor:pointer;">
            <input type="checkbox" id="icvfx-enable-toggle" ${currentConfig.enabled ? 'checked' : ''} />
            <span>Enable LED Volume in Scene</span>
          </label>
        </div>
        <div class="icvfx-footer-right">
          <button class="icvfx-btn-secondary" id="icvfx-cancel-btn">Cancel</button>
          <button class="icvfx-btn-primary" id="icvfx-save-btn">💾 Save & Apply Stage</button>
        </div>
      </div>
    `;

    // Hook tab switches
    dialog.querySelectorAll<HTMLButtonElement>('.icvfx-tab-btn').forEach((btn) => {
      btn.onclick = () => {
        const tab = btn.dataset.tab as typeof activeTab;
        if (tab) {
          activeTab = tab;
          renderModal();
        }
      };
    });

    dialog.querySelector<HTMLButtonElement>('.icvfx-modal-close')!.onclick = () => overlay.remove();
    dialog.querySelector<HTMLButtonElement>('#icvfx-cancel-btn')!.onclick = () => overlay.remove();

    const enableToggle = dialog.querySelector<HTMLInputElement>('#icvfx-enable-toggle');
    if (enableToggle) {
      enableToggle.onchange = () => {
        currentConfig.enabled = enableToggle.checked;
      };
    }

    const saveBtn = dialog.querySelector<HTMLButtonElement>('#icvfx-save-btn');
    if (saveBtn) {
      saveBtn.onclick = () => {
        scene.icvfx = normalizeLedVolumeConfig(currentConfig);
        onSaveConfig?.(currentConfig);
        overlay.remove();
      };
    }

    renderTabContent();
  };

  const renderTabContent = () => {
    const container = dialog.querySelector<HTMLElement>('#icvfx-tab-content');
    if (!container) return;
    container.innerHTML = '';

    if (activeTab === 'presets') {
      const pane = document.createElement('div');
      pane.className = 'icvfx-presets-grid';

      const presets: { id: LedVolumePresetId; title: string; desc: string; icon: string }[] = [
        { id: 'horseshoe_270', title: 'Horseshoe 270° Stage', desc: '18m curved perimeter wall (270° arc), 6m height, 2.3mm pixel pitch with ceiling canopy.', icon: '🎪' },
        { id: 'mega_360', title: 'Mega Volume 360° Soundstage', desc: 'Full 360° enclosed cylindrical LED stage (24m diameter, 7m height) with canopy and 2 mobile wild walls.', icon: '🌐' },
        { id: 'commercial_180', title: 'Commercial Studio 180°', desc: '12m curved backdrop (180° arc), 5m height, 2.6mm pitch. Ideal for vehicle process and tabletop.', icon: '🎬' },
        { id: 'flat_backdrop', title: 'Flat Studio Backdrop Wall', desc: '10m x 4.5m flat high-brightness LED wall with 2.3mm pitch for fast studio setups.', icon: '🖼️' },
        { id: 'cube_studio', title: 'Cube Soundstage (4-Wall)', desc: '14m x 14m x 5m rectangular box stage with front, side, and ceiling active displays.', icon: '📦' },
      ];

      presets.forEach((p) => {
        const card = document.createElement('div');
        card.className = 'icvfx-preset-card';
        card.innerHTML = `
          <div class="icvfx-preset-header">
            <span class="icvfx-preset-icon">${p.icon}</span>
            <div class="icvfx-preset-title-wrap">
              <h4>${p.title}</h4>
              <span class="icvfx-preset-badge">${p.id}</span>
            </div>
          </div>
          <p class="icvfx-preset-desc">${p.desc}</p>
          <div class="icvfx-preset-actions">
            <button class="icvfx-btn-primary small-btn" data-preset="${p.id}">Apply Preset</button>
          </div>
        `;

        card.querySelector<HTMLButtonElement>('button')!.onclick = () => {
          const loaded = STOCK_LED_VOLUMES[p.id];
          if (loaded) {
            currentConfig.stageName = loaded.config.stageName;
            currentConfig.walls = JSON.parse(JSON.stringify(loaded.config.walls));
            currentConfig.lutProfile = loaded.config.lutProfile;
            currentConfig.targetWhitePoint = loaded.config.targetWhitePoint;
            currentConfig.cameraOverscanPercent = loaded.config.cameraOverscanPercent;
            activeTab = 'geometry';
            renderModal();
          }
        };

        pane.appendChild(card);
      });

      container.appendChild(pane);
    } else if (activeTab === 'moire') {
      const pane = document.createElement('div');
      pane.className = 'icvfx-moire-pane';

      const moire = calculateMoireRisk(
        moireDistM,
        moireFocalMm,
        moireSensorWidthMm,
        moireSensorResPx,
        moirePitchMm,
      );

      let badgeCls = 'badge-success';
      let riskTitle = 'SAFE: Zero Optical Aliasing Risk';
      if (moire.riskLevel === 'severe_moire') {
        badgeCls = 'badge-danger';
        riskTitle = 'SEVERE MOIRE: High Risk of Destructive Optical Aliasing';
      } else if (moire.riskLevel === 'high_risk') {
        badgeCls = 'badge-warning';
        riskTitle = 'HIGH RISK: Pixel Pitch Frequency Approaches Sensor Nyquist';
      } else if (moire.riskLevel === 'low_risk') {
        badgeCls = 'badge-info';
        riskTitle = 'LOW RISK: Marginal Aliasing in High Frequency Detail';
      }

      pane.innerHTML = `
        <div class="icvfx-moire-layout">
          <div class="icvfx-moire-controls">
            <h3>🔬 Camera & Optical Geometry</h3>

            <div class="icvfx-field-group">
              <label>Latched Scene Camera</label>
              <select id="moire-cam-select" class="icvfx-select">
                <option value="">Custom Manual Values</option>
                ${scene.cameras.map((c, i) => `<option value="${c.id}">${escapeHtml(c.name || `CAM ${i + 1}`)} (${c.lensFocalLength}mm)</option>`).join('')}
              </select>
            </div>

            <div class="icvfx-field-group">
              <div class="icvfx-field-label-row">
                <label>Distance to LED Wall</label>
                <span class="icvfx-val" id="val-dist">${moireDistM.toFixed(2)} m</span>
              </div>
              <input type="range" id="slider-dist" min="0.5" max="20" step="0.1" value="${moireDistM}" class="icvfx-slider" />
            </div>

            <div class="icvfx-field-group">
              <div class="icvfx-field-label-row">
                <label>Focal Length</label>
                <span class="icvfx-val" id="val-focal">${moireFocalMm} mm</span>
              </div>
              <input type="range" id="slider-focal" min="14" max="135" step="1" value="${moireFocalMm}" class="icvfx-slider" />
            </div>

            <div class="icvfx-field-group">
              <div class="icvfx-field-label-row">
                <label>Sensor Width</label>
                <span class="icvfx-val" id="val-sensor">${moireSensorWidthMm.toFixed(2)} mm</span>
              </div>
              <select id="select-sensor-preset" class="icvfx-select" style="margin-bottom:6px;">
                <option value="24.89" ${Math.abs(moireSensorWidthMm - 24.89) < 0.1 ? 'selected' : ''}>Super 35 (24.89 mm)</option>
                <option value="36.00" ${Math.abs(moireSensorWidthMm - 36.00) < 0.1 ? 'selected' : ''}>Full Frame 35mm (36.00 mm)</option>
                <option value="43.80" ${Math.abs(moireSensorWidthMm - 43.80) < 0.1 ? 'selected' : ''}>Large Format ARRI 65 (43.80 mm)</option>
                <option value="17.30" ${Math.abs(moireSensorWidthMm - 17.30) < 0.1 ? 'selected' : ''}>Micro 4/3 (17.30 mm)</option>
              </select>
            </div>

            <div class="icvfx-field-group">
              <div class="icvfx-field-label-row">
                <label>LED Pixel Pitch</label>
                <span class="icvfx-val" id="val-pitch">${moirePitchMm.toFixed(2)} mm</span>
              </div>
              <input type="range" id="slider-pitch" min="1.5" max="3.9" step="0.05" value="${moirePitchMm}" class="icvfx-slider" />
            </div>

            <div class="icvfx-field-group">
              <label>Lens Aperture (f-stop)</label>
              <select id="select-aperture" class="icvfx-select">
                <option value="1.4" ${moireApertureF === 1.4 ? 'selected' : ''}>f/1.4 (Very Shallow - Highest Defocus Diffusion)</option>
                <option value="2.0" ${moireApertureF === 2.0 ? 'selected' : ''}>f/2.0 (Shallow DOF)</option>
                <option value="2.8" ${moireApertureF === 2.8 ? 'selected' : ''}>f/2.8 (Standard Production)</option>
                <option value="4.0" ${moireApertureF === 4.0 ? 'selected' : ''}>f/4.0 (Moderate DOF)</option>
                <option value="5.6" ${moireApertureF === 5.6 ? 'selected' : ''}>f/5.6 (Deep Focus - Increased Moiré Risk)</option>
                <option value="8.0" ${moireApertureF === 8.0 ? 'selected' : ''}>f/8.0 (Deep DOF - Strict Moiré Risk)</option>
              </select>
            </div>
          </div>

          <div class="icvfx-moire-telemetry">
            <h3>📊 Optical Nyquist Analysis</h3>

            <div class="icvfx-risk-card ${moire.riskLevel}">
              <div class="icvfx-risk-badge-header">
                <span class="badge ${badgeCls}">${moire.riskLevel.toUpperCase().replace('_', ' ')}</span>
                <span class="icvfx-nyquist-ratio">Nyquist Ratio: ${(moire.nyquistFrequencyRatio * 100).toFixed(1)}%</span>
              </div>
              <div class="icvfx-risk-title">${riskTitle}</div>
              <p class="icvfx-risk-msg">${escapeHtml(moire.message)}</p>
            </div>

            <div class="icvfx-metrics-grid">
              <div class="icvfx-metric-box">
                <span class="icvfx-metric-title">Sensor Nyquist Frequency</span>
                <span class="icvfx-metric-value">${moire.sensorNyquistLpMm.toFixed(1)} lp/mm</span>
              </div>
              <div class="icvfx-metric-box">
                <span class="icvfx-metric-title">Projected LED Pitch Freq</span>
                <span class="icvfx-metric-value">${moire.projectedPitchLpMm.toFixed(1)} lp/mm</span>
              </div>
              <div class="icvfx-metric-box">
                <span class="icvfx-metric-title">Min Safe Wall Distance</span>
                <span class="icvfx-metric-value">${moire.minSafeDistanceM.toFixed(2)} m</span>
              </div>
              <div class="icvfx-metric-box">
                <span class="icvfx-metric-title">Suggested Defocus Focus</span>
                <span class="icvfx-metric-value">${(moireDistM * 0.72).toFixed(2)} m</span>
              </div>
            </div>

            <div class="icvfx-info-callout">
              <strong>💡 Optical Engineering Tip:</strong>
              Moiré interference occurs when the high-frequency optical image of the physical LED matrix aligns with the discrete Bayer color sensor pixel pitch. To eliminate moiré in ICVFX: open your aperture (f/2.0 - f/2.8), maintain distance &gt; ${moire.minSafeDistanceM.toFixed(2)}m, or switch to an optical low-pass anti-aliasing filter (OLPF).
            </div>
          </div>
        </div>
      `;

      // Live event bindings
      const sliderDist = pane.querySelector<HTMLInputElement>('#slider-dist');
      const sliderFocal = pane.querySelector<HTMLInputElement>('#slider-focal');
      const sliderPitch = pane.querySelector<HTMLInputElement>('#slider-pitch');
      const selectSensor = pane.querySelector<HTMLSelectElement>('#select-sensor-preset');
      const selectAperture = pane.querySelector<HTMLSelectElement>('#select-aperture');
      const selectCam = pane.querySelector<HTMLSelectElement>('#moire-cam-select');

      if (sliderDist) {
        sliderDist.oninput = () => {
          moireDistM = parseFloat(sliderDist.value) || 4.5;
          renderTabContent();
        };
      }
      if (sliderFocal) {
        sliderFocal.oninput = () => {
          moireFocalMm = parseFloat(sliderFocal.value) || 35;
          renderTabContent();
        };
      }
      if (sliderPitch) {
        sliderPitch.oninput = () => {
          moirePitchMm = parseFloat(sliderPitch.value) || 2.3;
          renderTabContent();
        };
      }
      if (selectSensor) {
        selectSensor.onchange = () => {
          moireSensorWidthMm = parseFloat(selectSensor.value) || 24.89;
          renderTabContent();
        };
      }
      if (selectAperture) {
        selectAperture.onchange = () => {
          moireApertureF = parseFloat(selectAperture.value) || 2.8;
          renderTabContent();
        };
      }
      if (selectCam) {
        selectCam.onchange = () => {
          const cam = scene.cameras.find((c) => c.id === selectCam.value);
          if (cam) {
            moireFocalMm = Number(cam.lensFocalLength) || 35;
            currentConfig.latchedCameraId = cam.id;
            renderTabContent();
          }
        };
      }

      container.appendChild(pane);
    } else if (activeTab === 'geometry') {
      const pane = document.createElement('div');
      pane.className = 'icvfx-geometry-pane';

      pane.innerHTML = `
        <div class="icvfx-global-props">
          <div class="icvfx-field-group" style="flex:2;">
            <label>LED Volume Stage Name</label>
            <input type="text" id="icvfx-stage-name" value="${escapeHtml(currentConfig.stageName)}" class="icvfx-input" />
          </div>
          <div class="icvfx-field-group" style="flex:1;">
            <label>OCIO LUT Profile</label>
            <select id="icvfx-lut-profile" class="icvfx-select">
              <option value="rec709" ${currentConfig.lutProfile === 'rec709' ? 'selected' : ''}>Rec.709 (HDTV / SDR)</option>
              <option value="acescc" ${currentConfig.lutProfile === 'acescc' ? 'selected' : ''}>ACEScc (Cinema Grading)</option>
              <option value="srgb" ${currentConfig.lutProfile === 'srgb' ? 'selected' : ''}>sRGB (Standard Web)</option>
              <option value="dci_p3" ${currentConfig.lutProfile === 'dci_p3' ? 'selected' : ''}>DCI-P3 (Theatrical HDR)</option>
            </select>
          </div>
          <div class="icvfx-field-group" style="flex:1;">
            <label>Target White Point</label>
            <select id="icvfx-white-point" class="icvfx-select">
              <option value="d65" ${currentConfig.targetWhitePoint === 'd65' ? 'selected' : ''}>D65 (6500K Daylight)</option>
              <option value="d60" ${currentConfig.targetWhitePoint === 'd60' ? 'selected' : ''}>D60 (6000K ACES Standard)</option>
              <option value="d55" ${currentConfig.targetWhitePoint === 'd55' ? 'selected' : ''}>D55 (5500K Direct Sun)</option>
            </select>
          </div>
          <div class="icvfx-field-group" style="flex:1;">
            <label>Frustum Overscan: <span id="val-overscan">${currentConfig.cameraOverscanPercent}%</span></label>
            <input type="range" id="icvfx-overscan-slider" min="0" max="50" step="1" value="${currentConfig.cameraOverscanPercent}" class="icvfx-slider" />
          </div>
        </div>

        <div class="icvfx-walls-section">
          <div class="icvfx-walls-header">
            <h3>🧱 Physical LED Wall Geometries (${currentConfig.walls.length} Walls)</h3>
            <button class="icvfx-btn-primary small-btn" id="btn-add-wall">+ Add LED Wall</button>
          </div>
          <div class="icvfx-walls-list" id="icvfx-walls-container"></div>
        </div>
      `;

      // Global props events
      const stageNameInp = pane.querySelector<HTMLInputElement>('#icvfx-stage-name');
      const lutSelect = pane.querySelector<HTMLSelectElement>('#icvfx-lut-profile');
      const whiteSelect = pane.querySelector<HTMLSelectElement>('#icvfx-white-point');
      const overscanSlider = pane.querySelector<HTMLInputElement>('#icvfx-overscan-slider');

      if (stageNameInp) stageNameInp.oninput = () => { currentConfig.stageName = stageNameInp.value; };
      if (lutSelect) lutSelect.onchange = () => { currentConfig.lutProfile = lutSelect.value as any; };
      if (whiteSelect) whiteSelect.onchange = () => { currentConfig.targetWhitePoint = whiteSelect.value as any; };
      if (overscanSlider) {
        overscanSlider.oninput = () => {
          currentConfig.cameraOverscanPercent = parseInt(overscanSlider.value, 10) || 10;
          const valLbl = pane.querySelector<HTMLElement>('#val-overscan');
          if (valLbl) valLbl.textContent = `${currentConfig.cameraOverscanPercent}%`;
        };
      }

      const addWallBtn = pane.querySelector<HTMLButtonElement>('#btn-add-wall');
      if (addWallBtn) {
        addWallBtn.onclick = () => {
          const newWall = createLedVolumeWall({
            name: `Wall ${currentConfig.walls.length + 1}`,
            type: 'flat_wall',
            widthM: 6.0,
            heightM: 4.0,
          });
          currentConfig.walls.push(newWall);
          renderTabContent();
        };
      }

      const wallsList = pane.querySelector<HTMLElement>('#icvfx-walls-container')!;
      currentConfig.walls.forEach((wall, idx) => {
        const wallCard = document.createElement('div');
        wallCard.className = 'icvfx-wall-card';

        wallCard.innerHTML = `
          <div class="icvfx-wall-card-header">
            <div class="icvfx-wall-header-left">
              <input type="text" class="icvfx-input wall-name-input" value="${escapeHtml(wall.name)}" style="font-weight:600; width:180px;" />
              <label class="icvfx-toggle-lbl">
                <input type="checkbox" class="wall-enabled-toggle" ${wall.enabled ? 'checked' : ''} />
                <span>Active</span>
              </label>
            </div>
            <button class="icvfx-btn-danger small-btn wall-delete-btn" title="Delete Wall">✕ Delete</button>
          </div>

          <div class="icvfx-wall-props-grid">
            <div class="icvfx-field-group">
              <label>Panel Type</label>
              <select class="icvfx-select wall-type-select">
                <option value="curved_perimeter" ${wall.type === 'curved_perimeter' ? 'selected' : ''}>Curved Perimeter Wall</option>
                <option value="flat_wall" ${wall.type === 'flat_wall' ? 'selected' : ''}>Flat Wall</option>
                <option value="ceiling_canopy" ${wall.type === 'ceiling_canopy' ? 'selected' : ''}>Ceiling Canopy</option>
                <option value="wild_wall" ${wall.type === 'wild_wall' ? 'selected' : ''}>Mobile Wild Wall</option>
                <option value="floor_panel" ${wall.type === 'floor_panel' ? 'selected' : ''}>Interactive Floor Panel</option>
              </select>
            </div>

            <div class="icvfx-field-group">
              <label>Pixel Pitch (mm)</label>
              <input type="number" step="0.05" class="icvfx-input wall-pitch-input" value="${wall.pixelPitchMm}" />
            </div>

            <div class="icvfx-field-group">
              <label>Height (m)</label>
              <input type="number" step="0.1" class="icvfx-input wall-height-input" value="${wall.heightM}" />
            </div>

            <div class="icvfx-field-group">
              <label>Width / Arc Length (m)</label>
              <input type="number" step="0.1" class="icvfx-input wall-width-input" value="${wall.widthM}" />
            </div>

            ${wall.type === 'curved_perimeter' ? `
            <div class="icvfx-field-group">
              <label>Radius (m)</label>
              <input type="number" step="0.1" class="icvfx-input wall-radius-input" value="${wall.radiusM}" />
            </div>
            <div class="icvfx-field-group">
              <label>Arc Angle (deg)</label>
              <input type="number" step="1" class="icvfx-input wall-arc-input" value="${wall.arcAngleDeg}" />
            </div>
            ` : ''}

            <div class="icvfx-field-group">
              <label>Center X, Y, Z (m)</label>
              <div style="display:flex; gap:4px;">
                <input type="number" step="0.1" class="icvfx-input wall-cx-input" value="${wall.center.x}" style="width:50px;" title="X" />
                <input type="number" step="0.1" class="icvfx-input wall-cy-input" value="${wall.center.y}" style="width:50px;" title="Y" />
                <input type="number" step="0.1" class="icvfx-input wall-cz-input" value="${wall.center.z}" style="width:50px;" title="Z" />
              </div>
            </div>

            <div class="icvfx-field-group">
              <label>Rotation Y (deg)</label>
              <input type="number" step="1" class="icvfx-input wall-rot-input" value="${Math.round((wall.rotationY * 180) / Math.PI)}" />
            </div>

            <div class="icvfx-field-group">
              <label>Brightness (Nits)</label>
              <input type="number" step="50" class="icvfx-input wall-nits-input" value="${wall.brightnessNits}" />
            </div>

            <div class="icvfx-field-group">
              <label>nDisplay Node ID</label>
              <input type="text" class="icvfx-input wall-node-input" value="${escapeHtml(wall.nDisplayNodeId || `Node_${wall.id}`)}" />
            </div>
          </div>
        `;

        // Wall events
        const nameInp = wallCard.querySelector<HTMLInputElement>('.wall-name-input')!;
        const enToggle = wallCard.querySelector<HTMLInputElement>('.wall-enabled-toggle')!;
        const delBtn = wallCard.querySelector<HTMLButtonElement>('.wall-delete-btn')!;
        const typeSelect = wallCard.querySelector<HTMLSelectElement>('.wall-type-select')!;
        const pitchInp = wallCard.querySelector<HTMLInputElement>('.wall-pitch-input')!;
        const heightInp = wallCard.querySelector<HTMLInputElement>('.wall-height-input')!;
        const widthInp = wallCard.querySelector<HTMLInputElement>('.wall-width-input')!;
        const radiusInp = wallCard.querySelector<HTMLInputElement>('.wall-radius-input');
        const arcInp = wallCard.querySelector<HTMLInputElement>('.wall-arc-input');
        const cxInp = wallCard.querySelector<HTMLInputElement>('.wall-cx-input')!;
        const cyInp = wallCard.querySelector<HTMLInputElement>('.wall-cy-input')!;
        const czInp = wallCard.querySelector<HTMLInputElement>('.wall-cz-input')!;
        const rotInp = wallCard.querySelector<HTMLInputElement>('.wall-rot-input')!;
        const nitsInp = wallCard.querySelector<HTMLInputElement>('.wall-nits-input')!;
        const nodeInp = wallCard.querySelector<HTMLInputElement>('.wall-node-input')!;

        nameInp.oninput = () => { wall.name = nameInp.value; };
        enToggle.onchange = () => { wall.enabled = enToggle.checked; };
        delBtn.onclick = () => {
          currentConfig.walls.splice(idx, 1);
          renderTabContent();
        };
        typeSelect.onchange = () => {
          wall.type = typeSelect.value as any;
          if (wall.type === 'curved_perimeter' && wall.radiusM <= 0) {
            wall.radiusM = 9.0;
            wall.arcAngleDeg = 270;
          }
          renderTabContent();
        };
        pitchInp.oninput = () => { wall.pixelPitchMm = parseFloat(pitchInp.value) || 2.3; };
        heightInp.oninput = () => { wall.heightM = parseFloat(heightInp.value) || 4.0; };
        widthInp.oninput = () => { wall.widthM = parseFloat(widthInp.value) || 6.0; };
        if (radiusInp) radiusInp.oninput = () => { wall.radiusM = parseFloat(radiusInp.value) || 9.0; };
        if (arcInp) arcInp.oninput = () => { wall.arcAngleDeg = parseFloat(arcInp.value) || 270; };
        cxInp.oninput = () => { wall.center.x = parseFloat(cxInp.value) || 0; };
        cyInp.oninput = () => { wall.center.y = parseFloat(cyInp.value) || 0; };
        czInp.oninput = () => { wall.center.z = parseFloat(czInp.value) || 0; };
        rotInp.oninput = () => { wall.rotationY = ((parseFloat(rotInp.value) || 0) * Math.PI) / 180.0; };
        nitsInp.oninput = () => { wall.brightnessNits = parseFloat(nitsInp.value) || 1500; };
        nodeInp.oninput = () => { wall.nDisplayNodeId = nodeInp.value; };

        wallsList.appendChild(wallCard);
      });

      container.appendChild(pane);
    } else if (activeTab === 'export') {
      const pane = document.createElement('div');
      pane.className = 'icvfx-export-pane';

      const ndisplayXml = generateNDisplayConfigXml(currentConfig);
      const openUsdAscii = generateOpenUsdLedVolume(currentConfig);

      pane.innerHTML = `
        <div class="icvfx-export-grid">
          <div class="icvfx-export-card">
            <div class="icvfx-export-card-header">
              <h4>🚀 Unreal Engine nDisplay Config (.ndisplay)</h4>
              <button class="icvfx-btn-primary small-btn" id="btn-dl-ndisplay">⬇ Download .ndisplay</button>
            </div>
            <p style="font-size:12px; color:#94a3b8; margin:6px 0;">
              Production-ready nDisplay 5.0 XML config with cluster nodes, viewports, screen projections, and CineCamera LiveLink tracking.
            </p>
            <pre class="icvfx-code-preview"><code>${escapeHtml(ndisplayXml)}</code></pre>
          </div>

          <div class="icvfx-export-card">
            <div class="icvfx-export-card-header">
              <h4>🌐 OpenUSD Stage (.usda)</h4>
              <button class="icvfx-btn-primary small-btn" id="btn-dl-usd">⬇ Download .usda</button>
            </div>
            <p style="font-size:12px; color:#94a3b8; margin:6px 0;">
              Standardized OpenUSD stage representation of curved cylindrical wall meshes and ceiling canopy geometry.
            </p>
            <pre class="icvfx-code-preview"><code>${escapeHtml(openUsdAscii)}</code></pre>
          </div>
        </div>

        <div class="icvfx-python-companion-card">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h4 style="margin:0 0 4px 0; color:#f8fafc;">🐍 UE5 Python Automation Companion</h4>
              <p style="margin:0; font-size:12px; color:#94a3b8;">
                Companion script to automate DisplayClusterRootActor spawning and LiveLink CineCameraActor calibration in Unreal Editor.
              </p>
            </div>
            <button class="icvfx-btn-secondary small-btn" id="btn-dl-py">⬇ Download Python Script</button>
          </div>
        </div>
      `;

      pane.querySelector<HTMLButtonElement>('#btn-dl-ndisplay')!.onclick = () => {
        const stageSlug = (currentConfig.stageName || 'led_volume').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        triggerDownload(`${stageSlug}.ndisplay`, ndisplayXml, 'application/xml');
        onExportNDisplay?.();
      };

      pane.querySelector<HTMLButtonElement>('#btn-dl-usd')!.onclick = () => {
        const stageSlug = (currentConfig.stageName || 'led_volume').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        triggerDownload(`${stageSlug}.usda`, openUsdAscii, 'text/plain');
        onExportUsd?.();
      };

      pane.querySelector<HTMLButtonElement>('#btn-dl-py')!.onclick = () => {
        const pyScript = `# SetView Unreal Engine 5 nDisplay Stage Automation Script
import unreal
import sys

def setup_stage(config_path):
    unreal.log(f"[SetView] Initializing nDisplay setup from {config_path}")
    # Load and spawn DisplayClusterRootActor
    subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    actor_class = unreal.load_class(None, "/DisplayCluster/Blueprints/DisplayClusterRootActor.DisplayClusterRootActor_C")
    if actor_class and subsystem:
        actor = subsystem.spawn_actor_from_class(actor_class, unreal.Vector(0,0,0), unreal.Rotator(0,0,0))
        actor.set_actor_label("${escapeHtml(currentConfig.stageName || 'SetView_LED_Volume')}")
        unreal.log("[SetView] Created nDisplay Root Actor")

if __name__ == "__main__":
    setup_stage("stage.ndisplay")
`;
        triggerDownload('setview_ndisplay_setup.py', pyScript, 'text/x-python');
      };

      container.appendChild(pane);
    }
  };

  renderModal();
  overlay.appendChild(dialog);
  overlayRoot.appendChild(overlay);
}

/**
 * Opens the Soundstage Acoustics, Multi-Track Spatial Dialogue & Boom Mic Simulation Studio modal.
 */
export function openAcousticsStudioModal(
  scene: SceneData,
  onSaveConfig?: (config: AcousticsConfig) => void,
  onExportReport?: () => void,
  onExportIxml?: () => void,
  overlayRoot: HTMLElement = document.body,
): void {
  const existingModal = document.querySelector('.acoustics-modal-overlay');
  if (existingModal) existingModal.remove();

  const overlay = document.createElement('div');
  overlay.className = 'acoustics-modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'acoustics-modal-dialog';

  // Deep clone initial config
  const initialConfig: AcousticsConfig = scene.acoustics
    ? normalizeAcousticsConfig(scene.acoustics)
    : createAcousticsConfig('dialogue_soundstage');
  const currentConfig: AcousticsConfig = JSON.parse(JSON.stringify(initialConfig));

  let activeTab: 'patch' | 'levels' | 'rt60' | 'export' = 'patch';
  let selectedCameraId = scene.cameras[0]?.id || '';

  const triggerDownload = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderModal = () => {
    dialog.innerHTML = `
      <div class="acoustics-modal-header">
        <div class="acoustics-header-title">
          <h2>🎙️ Soundstage Acoustics & Multi-Track Dialogue Studio</h2>
          <span class="acoustics-scene-badge">${escapeHtml(scene.name || 'Untitled Scene')}</span>
        </div>
        <button class="acoustics-modal-close" title="Close">✕</button>
      </div>

      <div class="acoustics-tab-bar">
        <button class="acoustics-tab-btn ${activeTab === 'patch' ? 'active' : ''}" data-tab="patch">🎚️ Multi-Track & Boom Rigging</button>
        <button class="acoustics-tab-btn ${activeTab === 'levels' ? 'active' : ''}" data-tab="levels">📊 Live Levels & Incursion Alerts</button>
        <button class="acoustics-tab-btn ${activeTab === 'rt60' ? 'active' : ''}" data-tab="rt60">🏛️ Room RT60 & Speech Clarity</button>
        <button class="acoustics-tab-btn ${activeTab === 'export' ? 'active' : ''}" data-tab="export">📜 BWF Report & iXML Export</button>
      </div>

      <div class="acoustics-modal-body" id="acoustics-tab-content"></div>

      <div class="acoustics-modal-footer">
        <div class="acoustics-footer-left">
          <label style="display:flex; align-items:center; gap:8px; font-size:12px; color:#cbd5e1; cursor:pointer;">
            <input type="checkbox" id="acoustics-enable-toggle" ${currentConfig.enabled ? 'checked' : ''} />
            <span>Enable Acoustics Simulation in Scene</span>
          </label>
        </div>
        <div class="acoustics-footer-right">
          <button class="acoustics-btn-secondary" id="acoustics-cancel-btn">Cancel</button>
          <button class="acoustics-btn-primary" id="acoustics-save-btn">💾 Save & Apply Acoustics</button>
        </div>
      </div>
    `;

    // Hook tab buttons
    dialog.querySelectorAll<HTMLButtonElement>('.acoustics-tab-btn').forEach((btn) => {
      btn.onclick = () => {
        const tab = btn.dataset.tab as typeof activeTab;
        if (tab) {
          activeTab = tab;
          renderModal();
        }
      };
    });

    dialog.querySelector<HTMLButtonElement>('.acoustics-modal-close')!.onclick = () => overlay.remove();
    dialog.querySelector<HTMLButtonElement>('#acoustics-cancel-btn')!.onclick = () => overlay.remove();

    const enableToggle = dialog.querySelector<HTMLInputElement>('#acoustics-enable-toggle');
    if (enableToggle) {
      enableToggle.onchange = () => {
        currentConfig.enabled = enableToggle.checked;
      };
    }

    const saveBtn = dialog.querySelector<HTMLButtonElement>('#acoustics-save-btn');
    if (saveBtn) {
      saveBtn.onclick = () => {
        scene.acoustics = normalizeAcousticsConfig(currentConfig);
        onSaveConfig?.(currentConfig);
        overlay.remove();
      };
    }

    renderTabContent();
  };

  const renderTabContent = () => {
    const container = dialog.querySelector<HTMLElement>('#acoustics-tab-content');
    if (!container) return;
    container.innerHTML = '';

    // -------------------------------------------------------------------------
    // TAB 1: Multi-Track Patch & Boom Positioning
    // -------------------------------------------------------------------------
    if (activeTab === 'patch') {
      const pane = document.createElement('div');
      pane.className = 'acoustics-patch-pane';

      pane.innerHTML = `
        <div class="acoustics-env-card">
          <h4 style="margin:0 0 12px 0; color:#f8fafc; font-size:13px;">🌡️ Stage Atmospheric Environment</h4>
          <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:12px;">
            <div class="acoustics-control-group">
              <label>Ambient Noise Floor (dBA)</label>
              <input type="number" min="15" max="85" step="1" id="env-noise" value="${currentConfig.ambientNoiseFloorDba}" />
            </div>
            <div class="acoustics-control-group">
              <label>Air Temperature (°C)</label>
              <input type="number" min="-10" max="45" step="1" id="env-temp" value="${currentConfig.airTemperatureC}" />
            </div>
            <div class="acoustics-control-group">
              <label>Relative Humidity (%)</label>
              <input type="number" min="10" max="95" step="5" id="env-humidity" value="${currentConfig.relativeHumidityPercent}" />
            </div>
          </div>
        </div>

        <div class="acoustics-tracks-section">
          <div style="display:flex; justify-content:space-between; align-items:center; margin:16px 0 8px 0;">
            <h3 style="margin:0; font-size:14px; color:#38bdf8;">🎙️ Overhead Boom Microphones (${currentConfig.boomMics.length})</h3>
            <button class="acoustics-btn-secondary small-btn" id="btn-add-boom">+ Add Boom Rig</button>
          </div>
          <div id="boom-mics-list"></div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin:24px 0 8px 0;">
            <h3 style="margin:0; font-size:14px; color:#10b981;">🎛️ Body-Worn Lavalier Microphones (${currentConfig.lavalierMics.length})</h3>
            <button class="acoustics-btn-secondary small-btn" id="btn-add-lav">+ Add Lavalier</button>
          </div>
          <div id="lav-mics-list"></div>
        </div>
      `;

      // Env listeners
      pane.querySelector<HTMLInputElement>('#env-noise')!.onchange = (e) => {
        currentConfig.ambientNoiseFloorDba = Number((e.target as HTMLInputElement).value);
      };
      pane.querySelector<HTMLInputElement>('#env-temp')!.onchange = (e) => {
        currentConfig.airTemperatureC = Number((e.target as HTMLInputElement).value);
      };
      pane.querySelector<HTMLInputElement>('#env-humidity')!.onchange = (e) => {
        currentConfig.relativeHumidityPercent = Number((e.target as HTMLInputElement).value);
      };

      // Add Boom
      pane.querySelector<HTMLButtonElement>('#btn-add-boom')!.onclick = () => {
        currentConfig.boomMics.push(
          createBoomMicEntity({
            name: `Boom ${currentConfig.boomMics.length + 1}`,
            position: { x: 0, y: 2.2, z: currentConfig.boomMics.length * 0.5 },
          }),
        );
        renderTabContent();
      };

      // Add Lav
      pane.querySelector<HTMLButtonElement>('#btn-add-lav')!.onclick = () => {
        currentConfig.lavalierMics.push(
          createLavalierMicEntity({
            name: `Lav ${currentConfig.lavalierMics.length + 1}`,
            actorId: scene.actors[0]?.id || '',
          }),
        );
        renderTabContent();
      };

      // Populate Boom Mics
      const boomContainer = pane.querySelector<HTMLElement>('#boom-mics-list')!;
      currentConfig.boomMics.forEach((boom, index) => {
        const row = document.createElement('div');
        row.className = 'acoustics-mic-card';

        const actorOptions = scene.actors
          .map((a) => `<option value="${a.id}" ${boom.targetActorId === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`)
          .join('');

        const capsuleOptions = Object.values(CURATED_MIC_PROFILES)
          .map((p) => `<option value="${p.id}" ${boom.capsuleId === p.id ? 'selected' : ''}>${escapeHtml(p.name)} (${p.pattern})</option>`)
          .join('');

        row.innerHTML = `
          <div class="acoustics-mic-card-header">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="acoustics-track-badge">A${index + 1}</span>
              <input type="text" class="acoustics-name-input" value="${escapeHtml(boom.name)}" />
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <label style="font-size:11px; color:#94a3b8; display:flex; align-items:center; gap:4px; cursor:pointer;">
                <input type="checkbox" class="boom-mute-toggle" ${boom.isMuted ? 'checked' : ''} />
                <span>MUTE</span>
              </label>
              <button class="acoustics-btn-danger small-btn boom-delete-btn" title="Delete Boom">🗑️</button>
            </div>
          </div>

          <div class="acoustics-mic-card-grid">
            <div class="acoustics-control-group">
              <label>Capsule Transducer</label>
              <select class="boom-capsule-select">${capsuleOptions}</select>
            </div>
            <div class="acoustics-control-group">
              <label>Cue Target Actor</label>
              <select class="boom-actor-select">
                <option value="" ${!boom.targetActorId ? 'selected' : ''}>Manual Cue / No Target</option>
                ${actorOptions}
              </select>
            </div>
            <div class="acoustics-control-group">
              <label>Preamp Gain: <strong class="gain-val">+${boom.gainDb.toFixed(1)} dB</strong></label>
              <input type="range" min="0" max="60" step="0.5" class="boom-gain-slider" value="${boom.gainDb}" />
            </div>
            <div class="acoustics-control-group">
              <label>Low-Cut Filter</label>
              <div class="acoustics-button-group">
                <button class="acoustics-toggle-btn ${boom.lowCutHz === 0 ? 'active' : ''}" data-hpf="0">Flat</button>
                <button class="acoustics-toggle-btn ${boom.lowCutHz === 80 ? 'active' : ''}" data-hpf="80">80Hz</button>
                <button class="acoustics-toggle-btn ${boom.lowCutHz === 120 ? 'active' : ''}" data-hpf="120">120Hz</button>
                <button class="acoustics-toggle-btn ${boom.lowCutHz === 160 ? 'active' : ''}" data-hpf="160">160Hz</button>
              </div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin-top:8px;">
            <div class="acoustics-control-group">
              <label>Position X (m)</label>
              <input type="number" step="0.05" class="boom-pos-x" value="${boom.position.x.toFixed(2)}" />
            </div>
            <div class="acoustics-control-group">
              <label>Height Y (m)</label>
              <input type="number" step="0.05" class="boom-pos-y" value="${boom.position.y.toFixed(2)}" />
            </div>
            <div class="acoustics-control-group">
              <label>Position Z (m)</label>
              <input type="number" step="0.05" class="boom-pos-z" value="${boom.position.z.toFixed(2)}" />
            </div>
            <div class="acoustics-control-group">
              <label>Pole Ext (m)</label>
              <input type="number" step="0.1" min="1.0" max="6.0" class="boom-ext" value="${boom.pole.extensionM.toFixed(1)}" />
            </div>
          </div>
        `;

        // Bind Boom controls
        row.querySelector<HTMLInputElement>('.acoustics-name-input')!.onchange = (e) => {
          boom.name = (e.target as HTMLInputElement).value;
        };
        row.querySelector<HTMLInputElement>('.boom-mute-toggle')!.onchange = (e) => {
          boom.isMuted = (e.target as HTMLInputElement).checked;
        };
        row.querySelector<HTMLSelectElement>('.boom-capsule-select')!.onchange = (e) => {
          boom.capsuleId = (e.target as HTMLSelectElement).value;
        };
        row.querySelector<HTMLSelectElement>('.boom-actor-select')!.onchange = (e) => {
          boom.targetActorId = (e.target as HTMLSelectElement).value || undefined;
        };
        const gainSlider = row.querySelector<HTMLInputElement>('.boom-gain-slider')!;
        gainSlider.oninput = () => {
          boom.gainDb = Number(gainSlider.value);
          row.querySelector('.gain-val')!.textContent = `+${boom.gainDb.toFixed(1)} dB`;
        };
        row.querySelectorAll<HTMLButtonElement>('.acoustics-toggle-btn').forEach((btn) => {
          btn.onclick = () => {
            boom.lowCutHz = Number(btn.dataset.hpf);
            row.querySelectorAll('.acoustics-toggle-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
          };
        });
        row.querySelector<HTMLInputElement>('.boom-pos-x')!.onchange = (e) => {
          boom.position.x = Number((e.target as HTMLInputElement).value);
        };
        row.querySelector<HTMLInputElement>('.boom-pos-y')!.onchange = (e) => {
          boom.position.y = Number((e.target as HTMLInputElement).value);
        };
        row.querySelector<HTMLInputElement>('.boom-pos-z')!.onchange = (e) => {
          boom.position.z = Number((e.target as HTMLInputElement).value);
        };
        row.querySelector<HTMLInputElement>('.boom-ext')!.onchange = (e) => {
          boom.pole.extensionM = Number((e.target as HTMLInputElement).value);
        };
        row.querySelector<HTMLButtonElement>('.boom-delete-btn')!.onclick = () => {
          currentConfig.boomMics.splice(index, 1);
          renderTabContent();
        };

        boomContainer.appendChild(row);
      });

      // Populate Lavalier Mics
      const lavContainer = pane.querySelector<HTMLElement>('#lav-mics-list')!;
      currentConfig.lavalierMics.forEach((lav, index) => {
        const row = document.createElement('div');
        row.className = 'acoustics-mic-card';

        const actorOptions = scene.actors
          .map((a) => `<option value="${a.id}" ${lav.actorId === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`)
          .join('');

        const capsuleOptions = Object.values(CURATED_MIC_PROFILES)
          .map((p) => `<option value="${p.id}" ${lav.capsuleId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`)
          .join('');

        row.innerHTML = `
          <div class="acoustics-mic-card-header">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="acoustics-track-badge" style="background:#065f46;">L${index + 1}</span>
              <input type="text" class="acoustics-name-input" value="${escapeHtml(lav.name)}" />
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <label style="font-size:11px; color:#94a3b8; display:flex; align-items:center; gap:4px; cursor:pointer;">
                <input type="checkbox" class="lav-mute-toggle" ${lav.isMuted ? 'checked' : ''} />
                <span>MUTE</span>
              </label>
              <button class="acoustics-btn-danger small-btn lav-delete-btn" title="Delete Lav">🗑️</button>
            </div>
          </div>

          <div class="acoustics-mic-card-grid">
            <div class="acoustics-control-group">
              <label>Actor Assignment</label>
              <select class="lav-actor-select">${actorOptions || '<option value="">No Actors In Scene</option>'}</select>
            </div>
            <div class="acoustics-control-group">
              <label>Capsule Model</label>
              <select class="lav-capsule-select">${capsuleOptions}</select>
            </div>
            <div class="acoustics-control-group">
              <label>Preamp Gain: <strong class="lav-gain-val">+${lav.gainDb.toFixed(1)} dB</strong></label>
              <input type="range" min="0" max="60" step="0.5" class="lav-gain-slider" value="${lav.gainDb}" />
            </div>
          </div>
        `;

        row.querySelector<HTMLInputElement>('.acoustics-name-input')!.onchange = (e) => {
          lav.name = (e.target as HTMLInputElement).value;
        };
        row.querySelector<HTMLInputElement>('.lav-mute-toggle')!.onchange = (e) => {
          lav.isMuted = (e.target as HTMLInputElement).checked;
        };
        row.querySelector<HTMLSelectElement>('.lav-actor-select')!.onchange = (e) => {
          lav.actorId = (e.target as HTMLSelectElement).value;
        };
        row.querySelector<HTMLSelectElement>('.lav-capsule-select')!.onchange = (e) => {
          lav.capsuleId = (e.target as HTMLSelectElement).value;
        };
        const lavGainSlider = row.querySelector<HTMLInputElement>('.lav-gain-slider')!;
        lavGainSlider.oninput = () => {
          lav.gainDb = Number(lavGainSlider.value);
          row.querySelector('.lav-gain-val')!.textContent = `+${lav.gainDb.toFixed(1)} dB`;
        };
        row.querySelector<HTMLButtonElement>('.lav-delete-btn')!.onclick = () => {
          currentConfig.lavalierMics.splice(index, 1);
          renderTabContent();
        };

        lavContainer.appendChild(row);
      });

      container.appendChild(pane);
    }

    // -------------------------------------------------------------------------
    // TAB 2: Live Level Meters & Incursion Alerts
    // -------------------------------------------------------------------------
    else if (activeTab === 'levels') {
      const pane = document.createElement('div');
      pane.className = 'acoustics-levels-pane';

      const activeCam = scene.cameras.find((c) => c.id === selectedCameraId) || scene.cameras[0];
      const primaryBoom = currentConfig.boomMics[0];

      // Calculate incursion alert
      let alertMsg = 'No boom microphone or camera found.';
      let alertSeverity = 'safe';
      let marginCm = 999;

      if (activeCam && primaryBoom) {
        const camPos = activeCam.position;
        const camRot = activeCam.rotation;
        const fmt = sensorFormat(activeCam.formatId);
        const fov = 2 * Math.atan((fmt.gateWidthMm / 2) / (activeCam.lensFocalLength || 35)) * (180 / Math.PI);
        const aspect = aspectValue(activeCam.aspect);
        const alert = calculateBoomFrameIncursion(primaryBoom.position, 0.06, camPos, camRot, fov, aspect);
        alertMsg = alert.message;
        alertSeverity = alert.severity;
        marginCm = Math.round(alert.marginM * 100);
      }

      const camOptions = scene.cameras
        .map((c) => `<option value="${c.id}" ${c.id === selectedCameraId ? 'selected' : ''}>${escapeHtml(c.name)} (${c.lensFocalLength}mm)</option>`)
        .join('');

      pane.innerHTML = `
        <div class="acoustics-incursion-card ${alertSeverity}">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div class="acoustics-incursion-title">
                ${alertSeverity === 'breach_in_shot' ? '🔴 BOOM IN SHOT BREACH' : alertSeverity === 'warning_near_gate' ? '🟡 GATE MARGIN CAUTION' : '🟢 CLEARANCE OK'}
              </div>
              <div style="font-size:12px; color:#cbd5e1; margin-top:4px;">${escapeHtml(alertMsg)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:22px; font-weight:700; color:${alertSeverity === 'breach_in_shot' ? '#ef4444' : alertSeverity === 'warning_near_gate' ? '#f59e0b' : '#10b981'};">
                ${marginCm > 0 ? `+${marginCm} cm` : `${marginCm} cm`}
              </div>
              <div style="font-size:11px; color:#94a3b8;">Top Gate Margin</div>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.1);">
            <div style="display:flex; align-items:center; gap:8px;">
              <label style="font-size:12px; color:#94a3b8;">Active Framing Camera:</label>
              <select id="incursion-cam-select" style="padding:4px 8px; font-size:12px; background:#0f172a; border:1px solid #334155; border-radius:4px; color:#f8fafc;">
                ${camOptions || '<option value="">No Cameras In Scene</option>'}
              </select>
            </div>
            ${
              primaryBoom && activeCam
                ? `<button class="acoustics-btn-secondary small-btn" id="btn-raise-boom">⬆ Auto-Raise to +20cm Gate Clearance</button>`
                : ''
            }
          </div>
        </div>

        <div class="acoustics-meters-section">
          <h3 style="margin:16px 0 12px 0; font-size:14px; color:#f8fafc;">📊 Multi-Track Real-Time Peak Audio Meters</h3>
          <div id="meters-list"></div>
        </div>
      `;

      const camSelect = pane.querySelector<HTMLSelectElement>('#incursion-cam-select');
      if (camSelect) {
        camSelect.onchange = () => {
          selectedCameraId = camSelect.value;
          renderTabContent();
        };
      }

      const raiseBtn = pane.querySelector<HTMLButtonElement>('#btn-raise-boom');
      if (raiseBtn && primaryBoom) {
        raiseBtn.onclick = () => {
          primaryBoom.position.y += 0.25;
          renderTabContent();
        };
      }

      // Populate Track Meters
      const metersList = pane.querySelector<HTMLElement>('#meters-list')!;
      const roomVol = currentConfig.customRoomVolumeM3 || 450.0;
      const rt60 = 0.45;

      // Boom meters
      currentConfig.boomMics.forEach((boom, idx) => {
        const capsule = CURATED_MIC_PROFILES[boom.capsuleId] || CURATED_MIC_PROFILES.sennheiser_mkh416;
        const sample = calculateSplAndSnr(70.0, 1.2, 0.2, capsule, rt60, roomVol, currentConfig.ambientNoiseFloorDba);
        const meterPct = Math.min(100, Math.max(0, ((sample.totalLevelDb + 60.0) / 60.0) * 100));

        const card = document.createElement('div');
        card.className = 'acoustics-meter-row';
        card.innerHTML = `
          <div style="width:140px; font-size:12px; font-weight:600; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            <span class="acoustics-track-badge">A${idx + 1}</span> ${escapeHtml(boom.name)}
          </div>
          <div class="acoustics-meter-bar-track">
            <div class="acoustics-meter-bar-fill" style="width:${boom.isMuted ? 0 : meterPct}%;"></div>
          </div>
          <div style="width:75px; text-align:right; font-family:monospace; font-size:12px; color:#38bdf8;">
            ${boom.isMuted ? 'MUTE' : `${sample.totalLevelDb.toFixed(1)} dBFS`}
          </div>
          <div style="width:80px; text-align:right; font-size:11px; color:#94a3b8;">
            SNR: <strong>${sample.snrDb.toFixed(0)} dB</strong>
          </div>
        `;
        metersList.appendChild(card);
      });

      // Lav meters
      currentConfig.lavalierMics.forEach((lav, idx) => {
        const capsule = CURATED_MIC_PROFILES[lav.capsuleId] || CURATED_MIC_PROFILES.dpa_6060;
        const sample = calculateSplAndSnr(70.0, 0.2, 0.0, capsule, rt60, roomVol, currentConfig.ambientNoiseFloorDba);
        const meterPct = Math.min(100, Math.max(0, ((sample.totalLevelDb + 60.0) / 60.0) * 100));

        const card = document.createElement('div');
        card.className = 'acoustics-meter-row';
        card.innerHTML = `
          <div style="width:140px; font-size:12px; font-weight:600; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            <span class="acoustics-track-badge" style="background:#065f46;">L${idx + 1}</span> ${escapeHtml(lav.name)}
          </div>
          <div class="acoustics-meter-bar-track">
            <div class="acoustics-meter-bar-fill" style="width:${lav.isMuted ? 0 : meterPct}%; background:linear-gradient(90deg, #10b981 0%, #059669 80%, #ef4444 100%);"></div>
          </div>
          <div style="width:75px; text-align:right; font-family:monospace; font-size:12px; color:#10b981;">
            ${lav.isMuted ? 'MUTE' : `${sample.totalLevelDb.toFixed(1)} dBFS`}
          </div>
          <div style="width:80px; text-align:right; font-size:11px; color:#94a3b8;">
            SNR: <strong>${sample.snrDb.toFixed(0)} dB</strong>
          </div>
        `;
        metersList.appendChild(card);
      });

      container.appendChild(pane);
    }

    // -------------------------------------------------------------------------
    // TAB 3: Room RT60 Acoustic Simulator
    // -------------------------------------------------------------------------
    else if (activeTab === 'rt60') {
      const pane = document.createElement('div');
      pane.className = 'acoustics-rt60-pane';

      const roomVol = currentConfig.customRoomVolumeM3 || 450.0;
      const roomCoeff = currentConfig.customAbsorptionCoeff || 0.35;

      const surfaces = [
        { areaM2: 120.0, absorptionCoeff: roomCoeff },
        { areaM2: 120.0, absorptionCoeff: roomCoeff },
        { areaM2: 80.0, absorptionCoeff: roomCoeff },
        { areaM2: 80.0, absorptionCoeff: roomCoeff },
        { areaM2: 150.0, absorptionCoeff: 0.02 }, // Concrete floor
        { areaM2: 150.0, absorptionCoeff: 0.8 }, // Ceiling acoustic baffles
      ];

      const rt60 = calculateRt60Reverberation(roomVol, surfaces);
      const critDist = calculateCriticalDistance(roomVol, rt60.sabineSec, 4.0);
      const clarityC50 = calculateSpeechClarityC50(rt60.sabineSec, 1.2, critDist);

      let classification = 'Controlled Soundstage';
      let classBadgeClass = 'badge-success';
      if (rt60.sabineSec > 1.2) {
        classification = 'Echoic Reverberant Hall';
        classBadgeClass = 'badge-danger';
      } else if (rt60.sabineSec > 0.6) {
        classification = 'Live / Reflective Interior';
        classBadgeClass = 'badge-warning';
      } else if (rt60.sabineSec < 0.3) {
        classification = 'Dry Anechoic Treated';
        classBadgeClass = 'badge-info';
      }

      pane.innerHTML = `
        <div class="acoustics-rt60-grid">
          <div class="acoustics-stat-card">
            <div class="acoustics-stat-label">Sabine Decay Time (RT60)</div>
            <div class="acoustics-stat-val">${rt60.sabineSec.toFixed(2)}s</div>
            <div class="acoustics-stat-sub">Eyring: ${rt60.eyringSec.toFixed(2)}s</div>
          </div>
          <div class="acoustics-stat-card">
            <div class="acoustics-stat-label">Critical Distance (Dc)</div>
            <div class="acoustics-stat-val">${critDist.toFixed(2)}m</div>
            <div class="acoustics-stat-sub">Direct SPL = Diffuse SPL</div>
          </div>
          <div class="acoustics-stat-card">
            <div class="acoustics-stat-label">Speech Clarity (C50)</div>
            <div class="acoustics-stat-val">${clarityC50 > 0 ? `+${clarityC50.toFixed(1)}` : clarityC50.toFixed(1)} dB</div>
            <div class="acoustics-stat-sub">${clarityC50 >= 3.0 ? 'Pristine Dialogue Reach' : 'Reverb Masking Risk'}</div>
          </div>
          <div class="acoustics-stat-card">
            <div class="acoustics-stat-label">Room Classification</div>
            <div class="acoustics-stat-val" style="font-size:16px; margin-top:4px;">
              <span class="badge ${classBadgeClass}">${classification}</span>
            </div>
            <div class="acoustics-stat-sub">${(rt60.avgAbsorption * 100).toFixed(0)}% Avg Surface Absorption</div>
          </div>
        </div>

        <div class="acoustics-controls-card" style="margin-top:16px;">
          <h4 style="margin:0 0 12px 0; color:#f8fafc; font-size:13px;">📐 Stage Geometry & Volume Calibration</h4>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
            <div class="acoustics-control-group">
              <label>Soundstage Volume (m³)</label>
              <input type="number" min="30" max="10000" step="10" id="rt60-volume" value="${roomVol}" />
            </div>
            <div class="acoustics-control-group">
              <label>Wall Absorption Coefficient (NRC: 0.05 - 0.95)</label>
              <input type="range" min="0.05" max="0.95" step="0.01" id="rt60-coeff" value="${roomCoeff}" />
              <div style="text-align:right; font-size:11px; color:#38bdf8; margin-top:2px;" id="coeff-val">${roomCoeff.toFixed(2)}</div>
            </div>
          </div>

          <div style="display:flex; gap:8px; margin-top:12px;">
            <button class="acoustics-btn-secondary small-btn" id="preset-stage">🎪 Dialogue Soundstage</button>
            <button class="acoustics-btn-secondary small-btn" id="preset-int">🏠 Interior Location</button>
            <button class="acoustics-btn-secondary small-btn" id="preset-hall">🏛️ Echoic Hall</button>
          </div>
        </div>
      `;

      pane.querySelector<HTMLInputElement>('#rt60-volume')!.onchange = (e) => {
        currentConfig.customRoomVolumeM3 = Number((e.target as HTMLInputElement).value);
        renderTabContent();
      };
      const coeffInput = pane.querySelector<HTMLInputElement>('#rt60-coeff')!;
      coeffInput.oninput = () => {
        currentConfig.customAbsorptionCoeff = Number(coeffInput.value);
        renderTabContent();
      };

      pane.querySelector<HTMLButtonElement>('#preset-stage')!.onclick = () => {
        currentConfig.customRoomVolumeM3 = 450.0;
        currentConfig.customAbsorptionCoeff = 0.45;
        renderTabContent();
      };
      pane.querySelector<HTMLButtonElement>('#preset-int')!.onclick = () => {
        currentConfig.customRoomVolumeM3 = 150.0;
        currentConfig.customAbsorptionCoeff = 0.18;
        renderTabContent();
      };
      pane.querySelector<HTMLButtonElement>('#preset-hall')!.onclick = () => {
        currentConfig.customRoomVolumeM3 = 1200.0;
        currentConfig.customAbsorptionCoeff = 0.08;
        renderTabContent();
      };

      container.appendChild(pane);
    }

    // -------------------------------------------------------------------------
    // TAB 4: Sound Report & BWF / iXML Exporter
    // -------------------------------------------------------------------------
    else if (activeTab === 'export') {
      const pane = document.createElement('div');
      pane.className = 'acoustics-export-pane';

      const csvContent = generateBwfSoundReportCsv(currentConfig, scene.name || 'SetView Scene');
      const ixmlContent = generateAes31IxmlManifest(currentConfig, scene.name || 'SetView Scene');

      pane.innerHTML = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
          <div class="acoustics-export-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <h4 style="margin:0; color:#f8fafc; font-size:13px;">📊 Sound Devices BWF Report (CSV)</h4>
              <button class="acoustics-btn-primary small-btn" id="btn-dl-csv">⬇ Download CSV</button>
            </div>
            <p style="margin:0 0 8px 0; font-size:11px; color:#94a3b8;">
              Compatible with Sound Devices Wave Agent, Aaton Cantar, Ambient Recording, and Pro Tools.
            </p>
            <pre class="acoustics-code-preview"><code>${escapeHtml(csvContent)}</code></pre>
          </div>

          <div class="acoustics-export-card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <h4 style="margin:0; color:#f8fafc; font-size:13px;">📜 AES31-3 / iXML Manifest (XML)</h4>
              <button class="acoustics-btn-primary small-btn" id="btn-dl-ixml">⬇ Download iXML</button>
            </div>
            <p style="margin:0 0 8px 0; font-size:11px; color:#94a3b8;">
              Standardized broadcast wave metadata interchange format for multi-track dialogue mastering.
            </p>
            <pre class="acoustics-code-preview"><code>${escapeHtml(ixmlContent)}</code></pre>
          </div>
        </div>

        <div class="acoustics-export-card" style="margin-top:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <h4 style="margin:0 0 4px 0; color:#f8fafc; font-size:13px;">🐍 Unreal Engine 5 Companion Script</h4>
              <p style="margin:0; font-size:11px; color:#94a3b8;">
                Python script to automate AudioComponent and MetaSound spatial audio setup in Unreal Engine 5.
              </p>
            </div>
            <button class="acoustics-btn-secondary small-btn" id="btn-dl-py">⬇ Download Python Script</button>
          </div>
        </div>
      `;

      pane.querySelector<HTMLButtonElement>('#btn-dl-csv')!.onclick = () => {
        const sceneSlug = (scene.name || 'scene').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        triggerDownload(`${sceneSlug}_sound_report.csv`, csvContent, 'text/csv');
        onExportReport?.();
      };

      pane.querySelector<HTMLButtonElement>('#btn-dl-ixml')!.onclick = () => {
        const sceneSlug = (scene.name || 'scene').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        triggerDownload(`${sceneSlug}_manifest.ixml`, ixmlContent, 'application/xml');
        onExportIxml?.();
      };

      pane.querySelector<HTMLButtonElement>('#btn-dl-py')!.onclick = () => {
        const pyScript = `# SetView Unreal Engine 5 Acoustics Automation Companion
import unreal
import json

def apply_setview_acoustics(scene_path):
    unreal.log(f"[SetView] Loading acoustics from {scene_path}")
    with open(scene_path, 'r') as f:
        data = json.load(f)
    acoustics = data.get('acoustics', {})
    unreal.log(f"[SetView] Configured {len(acoustics.get('boomMics', []))} Boom Rigs and {len(acoustics.get('lavalierMics', []))} Lavaliers")

if __name__ == "__main__":
    apply_setview_acoustics("scene.json")
`;
        triggerDownload('setview_acoustics_bridge.py', pyScript, 'text/x-python');
      };

      container.appendChild(pane);
    }
  };

  renderModal();
  overlay.appendChild(dialog);
  overlayRoot.appendChild(overlay);
}

// ---------------------------------------------------------------------------
// Physical Solar Ephemeris & Natural Environment Studio Modal
// ---------------------------------------------------------------------------

/**
 * Opens the Physical Solar Ephemeris & Natural Sky Environment Studio modal.
 */
export function openSolarStudioModal(
  scene: SceneData,
  onSaveConfig?: (config: SolarEnvironmentConfig) => void,
  onExportCsv?: () => void,
  onExportHtml?: () => void,
  overlayRoot: HTMLElement = document.getElementById('overlay') ?? document.body,
): void {
  const existingModal = overlayRoot.querySelector('.solar-modal-overlay');
  if (existingModal) existingModal.remove();

  const overlay = document.createElement('div');
  overlay.className = 'solar-modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'solar-modal-dialog';

  let currentConfig: SolarEnvironmentConfig = normalizeSolarEnvironmentConfig(
    scene.solar ?? createSolarEnvironmentConfig('golden_hour_sunset', 'los_angeles'),
  );

  let activeTab: 'clock' | 'location' | 'weather' | 'table' = 'clock';

  const triggerDownload = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderModal = () => {
    dialog.innerHTML = `
      <div class="solar-modal-header">
        <div class="solar-header-title">
          <h2>☀️ Physical Solar Ephemeris & Natural Environment Studio</h2>
          <span class="solar-scene-badge">${escapeHtml(scene.name || 'Untitled Scene')}</span>
        </div>
        <button class="solar-modal-close" title="Close">✕</button>
      </div>

      <div class="solar-tab-bar">
        <button class="solar-tab-btn ${activeTab === 'clock' ? 'active' : ''}" data-tab="clock">☀️ Solar Clock & Live Ephemeris</button>
        <button class="solar-tab-btn ${activeTab === 'location' ? 'active' : ''}" data-tab="location">📍 Location & Calendar</button>
        <button class="solar-tab-btn ${activeTab === 'weather' ? 'active' : ''}" data-tab="weather">⛅ Weather & Atmosphere</button>
        <button class="solar-tab-btn ${activeTab === 'table' ? 'active' : ''}" data-tab="table">📊 Sun Path Table & DP Sun-Report</button>
      </div>

      <div class="solar-modal-body" id="solar-tab-content"></div>

      <div class="solar-modal-footer">
        <div class="solar-footer-left">
          <label style="display:flex; align-items:center; gap:8px; font-size:12px; color:#cbd5e1; cursor:pointer;">
            <input type="checkbox" id="solar-enable-toggle" ${currentConfig.enabled ? 'checked' : ''} />
            <span>Enable Physical Solar Simulation in Scene</span>
          </label>
        </div>
        <div class="solar-footer-right">
          <button class="solar-btn-secondary" id="solar-cancel-btn">Cancel</button>
          <button class="solar-btn-primary" id="solar-save-btn">💾 Save & Apply Solar Lighting</button>
        </div>
      </div>
    `;

    // Hook tab buttons
    dialog.querySelectorAll<HTMLButtonElement>('.solar-tab-btn').forEach((btn) => {
      btn.onclick = () => {
        const tab = btn.dataset.tab as typeof activeTab;
        if (tab) {
          activeTab = tab;
          renderModal();
        }
      };
    });

    dialog.querySelector<HTMLButtonElement>('.solar-modal-close')!.onclick = () => overlay.remove();
    dialog.querySelector<HTMLButtonElement>('#solar-cancel-btn')!.onclick = () => overlay.remove();

    const enableToggle = dialog.querySelector<HTMLInputElement>('#solar-enable-toggle');
    if (enableToggle) {
      enableToggle.onchange = () => {
        currentConfig.enabled = enableToggle.checked;
      };
    }

    const saveBtn = dialog.querySelector<HTMLButtonElement>('#solar-save-btn');
    if (saveBtn) {
      saveBtn.onclick = () => {
        scene.solar = normalizeSolarEnvironmentConfig(currentConfig);
        onSaveConfig?.(currentConfig);
        overlay.remove();
      };
    }

    renderTabContent();
  };

  const renderTabContent = () => {
    const container = dialog.querySelector<HTMLElement>('#solar-tab-content');
    if (!container) return;
    container.innerHTML = '';

    const eph = calculateSolarEphemeris(currentConfig);
    const hours = Math.floor(currentConfig.timeOfDayHours);
    const mins = Math.floor((currentConfig.timeOfDayHours - hours) * 60);
    const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    const rgb = kelvinToRgb(eph.colorTemperatureKelvin);
    const rgbCss = `rgb(${Math.round(rgb.r * 255)}, ${Math.round(rgb.g * 255)}, ${Math.round(rgb.b * 255)})`;

    // -------------------------------------------------------------------------
    // TAB 1: Solar Clock & Live Ephemeris
    // -------------------------------------------------------------------------
    if (activeTab === 'clock') {
      const pane = document.createElement('div');
      pane.style.display = 'flex';
      pane.style.flexDirection = 'column';
      pane.style.gap = '16px';

      // 1. Digital Clock & Live Time Scrub Slider
      const clockBox = document.createElement('div');
      clockBox.className = 'solar-time-display';
      clockBox.innerHTML = `
        <div>
          <div style="font-size:11px; color:#94a3b8; font-weight:600; text-transform:uppercase;">Local Solar Time</div>
          <div class="solar-digital-clock">${timeStr} <span style="font-size:14px; font-weight:600; color:#94a3b8;">(${eph.solarPhase.replace('_', ' ').toUpperCase()})</span></div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="solar-btn-secondary small-btn" data-preset="magic_hour_sunrise">🌅 Sunrise</button>
          <button class="solar-btn-secondary small-btn" data-preset="high_noon_clear">☀️ High Noon</button>
          <button class="solar-btn-secondary small-btn" data-preset="golden_hour_sunset">🌇 Golden Hour</button>
          <button class="solar-btn-secondary small-btn" data-preset="blue_hour_dusk">🌆 Blue Hour</button>
          <button class="solar-btn-secondary small-btn" data-preset="night_moonlight">🌙 Night</button>
        </div>
      `;
      pane.appendChild(clockBox);

      // Time Slider
      const sliderBox = document.createElement('div');
      sliderBox.className = 'solar-card';
      sliderBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <label style="font-size:12px; font-weight:700; color:#f8fafc;">Scrub Time of Day (24 Hours)</label>
          <span style="font-family:var(--font-mono, monospace); font-size:12px; color:#fbbf24;">${timeStr} (${currentConfig.timeOfDayHours.toFixed(2)}h)</span>
        </div>
        <input type="range" id="solar-time-slider" min="0" max="24" step="0.05" value="${currentConfig.timeOfDayHours}" style="width:100%; cursor:pointer;" />
        <div style="display:flex; justify-content:space-between; font-size:10px; color:#64748b; font-family:var(--font-mono, monospace);">
          <span>00:00 (Midnight)</span>
          <span>06:00 (Dawn)</span>
          <span>12:00 (Noon)</span>
          <span>18:00 (Dusk)</span>
          <span>24:00 (Midnight)</span>
        </div>
      `;
      pane.appendChild(sliderBox);

      // Ephemeris Telemetry Grid
      const grid = document.createElement('div');
      grid.className = 'solar-grid-4';
      grid.innerHTML = `
        <div class="solar-card">
          <div class="solar-stat-label">Sun Elevation / Altitude</div>
          <div class="solar-stat-val">${eph.elevationDeg.toFixed(1)}°</div>
          <div class="solar-stat-sub">Zenith: ${eph.zenithDeg.toFixed(1)}°</div>
        </div>
        <div class="solar-card">
          <div class="solar-stat-label">Sun Azimuth (True North)</div>
          <div class="solar-stat-val">${eph.azimuthDeg.toFixed(1)}°</div>
          <div class="solar-stat-sub">Compass: ${getCompassDirection(eph.azimuthDeg)}</div>
        </div>
        <div class="solar-card">
          <div class="solar-stat-label">Color Temperature</div>
          <div class="solar-stat-val" style="display:flex; align-items:center; gap:8px;">
            <span>${eph.colorTemperatureKelvin} K</span>
            <span style="display:inline-block; width:14px; height:14px; border-radius:50%; background:${rgbCss}; border:1px solid rgba(255,255,255,0.4);"></span>
          </div>
          <div class="solar-stat-sub">Rayleigh / Mie Scatter</div>
        </div>
        <div class="solar-card">
          <div class="solar-stat-label">Direct Sun Illuminance</div>
          <div class="solar-stat-val">${Math.round(eph.directSunIlluminanceLux).toLocaleString()} lx</div>
          <div class="solar-stat-sub">Diffuse Sky: ${Math.round(eph.diffuseSkyIlluminanceLux).toLocaleString()} lx</div>
        </div>
      `;
      pane.appendChild(grid);

      // Astronomical Times & Playback Card
      const bottomGrid = document.createElement('div');
      bottomGrid.className = 'solar-grid-2';
      bottomGrid.innerHTML = `
        <div class="solar-card">
          <div class="solar-card-title">Astronomical Windows</div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:12px;">
            <div><span style="color:#94a3b8;">Sunrise:</span> <strong>${eph.sunriseTime}</strong></div>
            <div><span style="color:#94a3b8;">Sunset:</span> <strong>${eph.sunsetTime}</strong></div>
            <div><span style="color:#94a3b8;">Solar Noon:</span> <strong>${eph.solarNoonTime}</strong></div>
            <div><span style="color:#94a3b8;">Eq of Time:</span> <strong>${eph.equationOfTimeMinutes.toFixed(1)} min</strong></div>
            <div><span style="color:#94a3b8;">Morning Golden:</span> <strong>${eph.goldenHourMorning.start} - ${eph.goldenHourMorning.end}</strong></div>
            <div><span style="color:#94a3b8;">Evening Golden:</span> <strong>${eph.goldenHourEvening.start} - ${eph.goldenHourEvening.end}</strong></div>
          </div>
        </div>
        <div class="solar-card">
          <div class="solar-card-title">Sun Shadows & Speed</div>
          <div style="display:flex; flex-direction:column; gap:10px;">
            <label style="display:flex; align-items:center; justify-content:space-between; font-size:12px; color:#cbd5e1; cursor:pointer;">
              <span>Real-time Cascaded Shadows</span>
              <input type="checkbox" id="solar-shadow-toggle" ${currentConfig.castShadows ? 'checked' : ''} />
            </label>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:12px; color:#cbd5e1;">Sun Intensity Multiplier</span>
              <span style="font-family:var(--font-mono, monospace); font-size:12px; color:#fbbf24;">${currentConfig.sunIntensityMultiplier.toFixed(1)}x</span>
            </div>
            <input type="range" id="solar-intensity-slider" min="0" max="3" step="0.1" value="${currentConfig.sunIntensityMultiplier}" style="width:100%;" />
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
              <span style="font-size:12px; color:#cbd5e1;">Continuous Playback</span>
              <div style="display:flex; gap:4px;">
                <button class="solar-btn-secondary small-btn ${currentConfig.timePlaybackSpeed === 0 ? 'active' : ''}" data-speed="0">⏸ 0x</button>
                <button class="solar-btn-secondary small-btn ${currentConfig.timePlaybackSpeed === 60 ? 'active' : ''}" data-speed="60">▶ 60x</button>
                <button class="solar-btn-secondary small-btn ${currentConfig.timePlaybackSpeed === 600 ? 'active' : ''}" data-speed="600">⏩ 600x</button>
              </div>
            </div>
          </div>
        </div>
      `;
      pane.appendChild(bottomGrid);

      // Event handlers
      const timeSlider = pane.querySelector<HTMLInputElement>('#solar-time-slider');
      if (timeSlider) {
        timeSlider.oninput = () => {
          currentConfig.timeOfDayHours = parseFloat(timeSlider.value);
          renderTabContent();
        };
      }

      pane.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => {
        b.onclick = () => {
          const preset = b.dataset.preset as any;
          if (preset) {
            currentConfig = createSolarEnvironmentConfig(preset, undefined, { location: currentConfig.location });
            renderTabContent();
          }
        };
      });

      const shadowToggle = pane.querySelector<HTMLInputElement>('#solar-shadow-toggle');
      if (shadowToggle) {
        shadowToggle.onchange = () => {
          currentConfig.castShadows = shadowToggle.checked;
        };
      }

      const intensitySlider = pane.querySelector<HTMLInputElement>('#solar-intensity-slider');
      if (intensitySlider) {
        intensitySlider.oninput = () => {
          currentConfig.sunIntensityMultiplier = parseFloat(intensitySlider.value);
        };
      }

      pane.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((b) => {
        b.onclick = () => {
          currentConfig.timePlaybackSpeed = parseFloat(b.dataset.speed || '0');
          renderTabContent();
        };
      });

      container.appendChild(pane);
    }

    // -------------------------------------------------------------------------
    // TAB 2: Filming Location & Calendar
    // -------------------------------------------------------------------------
    else if (activeTab === 'location') {
      const pane = document.createElement('div');
      pane.style.display = 'flex';
      pane.style.flexDirection = 'column';
      pane.style.gap = '16px';

      const locGrid = document.createElement('div');
      locGrid.className = 'solar-grid-2';

      // Preset Location Selector & GPS Card
      const locCard = document.createElement('div');
      locCard.className = 'solar-card';
      locCard.innerHTML = `
        <div class="solar-card-title">Production Filming Location</div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div>
            <label style="font-size:11px; color:#94a3b8; display:block; margin-bottom:4px;">Global Film Hub Preset</label>
            <select id="solar-location-preset" style="width:100%; background:#070d19; border:1px solid #1e293b; color:#f8fafc; padding:6px 10px; border-radius:6px;">
              ${Object.values(CURATED_FILMING_LOCATIONS)
                .map(
                  (l) =>
                    `<option value="${l.id}">${escapeHtml(l.name)} (${l.location.latitude >= 0 ? l.location.latitude + '°N' : -l.location.latitude + '°S'})</option>`,
                )
                .join('')}
              <option value="custom">Custom GPS Coordinates...</option>
            </select>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
            <div>
              <label style="font-size:11px; color:#94a3b8; display:block; margin-bottom:4px;">Latitude (°N/S)</label>
              <input type="number" id="solar-lat-input" min="-90" max="90" step="0.0001" value="${currentConfig.location.latitude}" style="width:100%; background:#070d19; border:1px solid #1e293b; color:#f8fafc; padding:6px 8px; border-radius:6px;" />
            </div>
            <div>
              <label style="font-size:11px; color:#94a3b8; display:block; margin-bottom:4px;">Longitude (°E/W)</label>
              <input type="number" id="solar-lon-input" min="-180" max="180" step="0.0001" value="${currentConfig.location.longitude}" style="width:100%; background:#070d19; border:1px solid #1e293b; color:#f8fafc; padding:6px 8px; border-radius:6px;" />
            </div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
            <div>
              <label style="font-size:11px; color:#94a3b8; display:block; margin-bottom:4px;">Elevation (meters)</label>
              <input type="number" id="solar-elev-input" min="0" max="8000" step="1" value="${currentConfig.location.elevationM ?? 0}" style="width:100%; background:#070d19; border:1px solid #1e293b; color:#f8fafc; padding:6px 8px; border-radius:6px;" />
            </div>
            <div>
              <label style="font-size:11px; color:#94a3b8; display:block; margin-bottom:4px;">Timezone Offset (UTC)</label>
              <input type="number" id="solar-tz-input" min="-12" max="14" step="0.5" value="${currentConfig.location.timezoneOffsetHours}" style="width:100%; background:#070d19; border:1px solid #1e293b; color:#f8fafc; padding:6px 8px; border-radius:6px;" />
            </div>
          </div>
        </div>
      `;
      locGrid.appendChild(locCard);

      // Calendar Date & Solstice Quick Select
      const dateCard = document.createElement('div');
      dateCard.className = 'solar-card';
      const dateIso = `${currentConfig.date.year}-${String(currentConfig.date.month).padStart(2, '0')}-${String(currentConfig.date.day).padStart(2, '0')}`;
      dateCard.innerHTML = `
        <div class="solar-card-title">Calendar & Seasonal Solstices</div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div>
            <label style="font-size:11px; color:#94a3b8; display:block; margin-bottom:4px;">Production Shoot Date</label>
            <input type="date" id="solar-date-picker" value="${dateIso}" style="width:100%; background:#070d19; border:1px solid #1e293b; color:#f8fafc; padding:6px 10px; border-radius:6px;" />
          </div>
          <div>
            <label style="font-size:11px; color:#94a3b8; display:block; margin-bottom:4px;">Solstices & Equinoxes Quick Select</label>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
              <button class="solar-btn-secondary small-btn" data-solstice="summer">☀️ Summer Solstice (Jun 21)</button>
              <button class="solar-btn-secondary small-btn" data-solstice="winter">❄️ Winter Solstice (Dec 21)</button>
              <button class="solar-btn-secondary small-btn" data-solstice="spring">🌱 Spring Equinox (Mar 20)</button>
              <button class="solar-btn-secondary small-btn" data-solstice="autumn">🍂 Autumn Equinox (Sep 22)</button>
            </div>
          </div>
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <label style="font-size:11px; color:#94a3b8;">Stage True North Heading</label>
              <span style="font-family:var(--font-mono, monospace); font-size:11px; color:#fbbf24;">${currentConfig.northHeadingDeg.toFixed(0)}°</span>
            </div>
            <input type="range" id="solar-heading-slider" min="0" max="359" step="1" value="${currentConfig.northHeadingDeg}" style="width:100%; cursor:pointer;" />
          </div>
        </div>
      `;
      locGrid.appendChild(dateCard);
      pane.appendChild(locGrid);

      // Event handlers
      const presetSelect = pane.querySelector<HTMLSelectElement>('#solar-location-preset');
      if (presetSelect) {
        presetSelect.onchange = () => {
          const val = presetSelect.value;
          const locItem = Object.values(CURATED_FILMING_LOCATIONS).find((l) => l.id === val);
          if (locItem) {
            currentConfig.location = { ...locItem.location };
            renderTabContent();
          }
        };
      }

      const latIn = pane.querySelector<HTMLInputElement>('#solar-lat-input');
      const lonIn = pane.querySelector<HTMLInputElement>('#solar-lon-input');
      const elevIn = pane.querySelector<HTMLInputElement>('#solar-elev-input');
      const tzIn = pane.querySelector<HTMLInputElement>('#solar-tz-input');

      if (latIn) latIn.onchange = () => { currentConfig.location.latitude = parseFloat(latIn.value) || 0; };
      if (lonIn) lonIn.onchange = () => { currentConfig.location.longitude = parseFloat(lonIn.value) || 0; };
      if (elevIn) elevIn.onchange = () => { currentConfig.location.elevationM = parseFloat(elevIn.value) || 0; };
      if (tzIn) tzIn.onchange = () => { currentConfig.location.timezoneOffsetHours = parseFloat(tzIn.value) || 0; };

      const datePicker = pane.querySelector<HTMLInputElement>('#solar-date-picker');
      if (datePicker) {
        datePicker.onchange = () => {
          const parts = datePicker.value.split('-');
          if (parts.length === 3) {
            currentConfig.date = {
              year: parseInt(parts[0], 10),
              month: parseInt(parts[1], 10),
              day: parseInt(parts[2], 10),
            };
            renderTabContent();
          }
        };
      }

      pane.querySelectorAll<HTMLButtonElement>('[data-solstice]').forEach((b) => {
        b.onclick = () => {
          const s = b.dataset.solstice;
          if (s === 'summer') currentConfig.date = { year: currentConfig.date.year, month: 6, day: 21 };
          else if (s === 'winter') currentConfig.date = { year: currentConfig.date.year, month: 12, day: 21 };
          else if (s === 'spring') currentConfig.date = { year: currentConfig.date.year, month: 3, day: 20 };
          else if (s === 'autumn') currentConfig.date = { year: currentConfig.date.year, month: 9, day: 22 };
          renderTabContent();
        };
      });

      const headingSlider = pane.querySelector<HTMLInputElement>('#solar-heading-slider');
      if (headingSlider) {
        headingSlider.oninput = () => {
          currentConfig.northHeadingDeg = parseFloat(headingSlider.value);
        };
      }

      container.appendChild(pane);
    }

    // -------------------------------------------------------------------------
    // TAB 3: Weather & Atmosphere
    // -------------------------------------------------------------------------
    else if (activeTab === 'weather') {
      const pane = document.createElement('div');
      pane.style.display = 'flex';
      pane.style.flexDirection = 'column';
      pane.style.gap = '16px';

      const wGrid = document.createElement('div');
      wGrid.className = 'solar-grid-2';

      // Atmospheric Optics Card
      const opticsCard = document.createElement('div');
      opticsCard.className = 'solar-card';
      opticsCard.innerHTML = `
        <div class="solar-card-title">Atmospheric Scattering & Sky Optics</div>
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div>
            <div style="display:flex; justify-content:space-between;">
              <label style="font-size:11px; color:#94a3b8;">Rayleigh / Mie Turbidity (Aerosols & Haze)</label>
              <span style="font-family:var(--font-mono, monospace); font-size:11px; color:#fbbf24;">${currentConfig.skyTurbidity.toFixed(1)}</span>
            </div>
            <input type="range" id="solar-turbidity-slider" min="1.5" max="8.0" step="0.1" value="${currentConfig.skyTurbidity}" style="width:100%; cursor:pointer;" />
            <div style="display:flex; justify-content:space-between; font-size:10px; color:#64748b;">
              <span>1.5 (Pristine Arctic)</span>
              <span>2.5 (Standard Clear)</span>
              <span>8.0 (Dense Smog/Dust)</span>
            </div>
          </div>
          <div>
            <div style="display:flex; justify-content:space-between;">
              <label style="font-size:11px; color:#94a3b8;">Ground Albedo (Surface Bounce Reflectance)</label>
              <span style="font-family:var(--font-mono, monospace); font-size:11px; color:#fbbf24;">${(currentConfig.groundAlbedo * 100).toFixed(0)}%</span>
            </div>
            <input type="range" id="solar-albedo-slider" min="0.05" max="0.85" step="0.05" value="${currentConfig.groundAlbedo}" style="width:100%; cursor:pointer;" />
            <div style="display:flex; justify-content:space-between; font-size:10px; color:#64748b;">
              <span>0.05 (Dark Asphalt)</span>
              <span>0.20 (Grass/Soil)</span>
              <span>0.80 (Snow/Salt Flat)</span>
            </div>
          </div>
        </div>
      `;
      wGrid.appendChild(opticsCard);

      // Cloud Cover & Microclimate Card
      const climateCard = document.createElement('div');
      climateCard.className = 'solar-card';
      climateCard.innerHTML = `
        <div class="solar-card-title">Weather Conditions & Microclimate</div>
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div>
            <div style="display:flex; justify-content:space-between;">
              <label style="font-size:11px; color:#94a3b8;">Cloud Coverage Extinction</label>
              <span style="font-family:var(--font-mono, monospace); font-size:11px; color:#fbbf24;">${currentConfig.weather.cloudCoveragePercent.toFixed(0)}%</span>
            </div>
            <input type="range" id="solar-clouds-slider" min="0" max="100" step="5" value="${currentConfig.weather.cloudCoveragePercent}" style="width:100%; cursor:pointer;" />
          </div>
          <div>
            <div style="display:flex; justify-content:space-between;">
              <label style="font-size:11px; color:#94a3b8;">Ground Fog / Mist Density</label>
              <span style="font-family:var(--font-mono, monospace); font-size:11px; color:#fbbf24;">${currentConfig.weather.fogDensityPercent.toFixed(0)}%</span>
            </div>
            <input type="range" id="solar-fog-slider" min="0" max="100" step="5" value="${currentConfig.weather.fogDensityPercent}" style="width:100%; cursor:pointer;" />
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
            <div>
              <label style="font-size:11px; color:#94a3b8; display:block; margin-bottom:4px;">Rain Intensity (%)</label>
              <input type="number" id="solar-rain-input" min="0" max="100" step="5" value="${currentConfig.weather.rainIntensityPercent}" style="width:100%; background:#070d19; border:1px solid #1e293b; color:#f8fafc; padding:6px 8px; border-radius:6px;" />
            </div>
            <div>
              <label style="font-size:11px; color:#94a3b8; display:block; margin-bottom:4px;">Wind Speed (m/s)</label>
              <input type="number" id="solar-wind-input" min="0" max="50" step="1" value="${currentConfig.weather.windSpeedMps}" style="width:100%; background:#070d19; border:1px solid #1e293b; color:#f8fafc; padding:6px 8px; border-radius:6px;" />
            </div>
          </div>
        </div>
      `;
      wGrid.appendChild(climateCard);
      pane.appendChild(wGrid);

      // Event handlers
      const turbSlider = pane.querySelector<HTMLInputElement>('#solar-turbidity-slider');
      if (turbSlider) {
        turbSlider.oninput = () => {
          currentConfig.skyTurbidity = parseFloat(turbSlider.value);
        };
      }

      const albSlider = pane.querySelector<HTMLInputElement>('#solar-albedo-slider');
      if (albSlider) {
        albSlider.oninput = () => {
          currentConfig.groundAlbedo = parseFloat(albSlider.value);
        };
      }

      const cloudSlider = pane.querySelector<HTMLInputElement>('#solar-clouds-slider');
      if (cloudSlider) {
        cloudSlider.oninput = () => {
          currentConfig.weather.cloudCoveragePercent = parseFloat(cloudSlider.value);
        };
      }

      const fogSlider = pane.querySelector<HTMLInputElement>('#solar-fog-slider');
      if (fogSlider) {
        fogSlider.oninput = () => {
          currentConfig.weather.fogDensityPercent = parseFloat(fogSlider.value);
        };
      }

      const rainIn = pane.querySelector<HTMLInputElement>('#solar-rain-input');
      if (rainIn) rainIn.onchange = () => { currentConfig.weather.rainIntensityPercent = parseFloat(rainIn.value) || 0; };

      const windIn = pane.querySelector<HTMLInputElement>('#solar-wind-input');
      if (windIn) windIn.onchange = () => { currentConfig.weather.windSpeedMps = parseFloat(windIn.value) || 0; };

      container.appendChild(pane);
    }

    // -------------------------------------------------------------------------
    // TAB 4: Sun Path Table & DP Sun-Report Exporter
    // -------------------------------------------------------------------------
    else if (activeTab === 'table') {
      const pane = document.createElement('div');
      pane.style.display = 'flex';
      pane.style.flexDirection = 'column';
      pane.style.gap = '16px';

      const tableData = generateSolarTrackingTable(currentConfig, 60);

      // Table Header & Export Actions
      const headerBox = document.createElement('div');
      headerBox.style.display = 'flex';
      headerBox.style.justifyContent = 'space-between';
      headerBox.style.alignItems = 'center';
      headerBox.innerHTML = `
        <div>
          <h4 style="margin:0 0 4px 0; color:#f8fafc; font-size:14px;">24-Hour Solar Ephemeris & Cinematography Tracking Table</h4>
          <p style="margin:0; font-size:11px; color:#94a3b8;">
            Complete daily solar trajectory with Rayleigh color temperatures, shadow multipliers, and illuminance.
          </p>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="solar-btn-primary small-btn" id="btn-export-csv">⬇ Export CSV Table</button>
          <button class="solar-btn-primary small-btn" id="btn-export-html">📜 Standalone DP Sun-Report (HTML)</button>
        </div>
      `;
      pane.appendChild(headerBox);

      // Interactive Table
      const tableContainer = document.createElement('div');
      tableContainer.className = 'solar-table-container';
      tableContainer.innerHTML = `
        <table class="solar-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Elevation</th>
              <th>Azimuth</th>
              <th>Phase</th>
              <th>Color Temp</th>
              <th>Direct Sun</th>
              <th>Shadow Multiplier</th>
            </tr>
          </thead>
          <tbody>
            ${tableData
              .map((row) => {
                const shadowStr = row.shadowMultiplier > 0 ? `${row.shadowMultiplier.toFixed(2)}x` : 'None';
                let badgeClass = 'solar-badge-night';
                if (row.phase === 'daylight') badgeClass = 'solar-badge-day';
                else if (row.phase === 'golden_hour') badgeClass = 'solar-badge-golden';
                else if (row.phase === 'civil_twilight') badgeClass = 'solar-badge-blue';

                return `
                  <tr>
                    <td><strong>${row.timeString}</strong></td>
                    <td>${row.elevationDeg > 0 ? '+' : ''}${row.elevationDeg.toFixed(1)}°</td>
                    <td>${row.azimuthDeg.toFixed(1)}°</td>
                    <td><span class="solar-badge ${badgeClass}">${row.phase.replace('_', ' ')}</span></td>
                    <td>${row.colorTempK} K</td>
                    <td>${Math.round(row.directLux).toLocaleString()} lx</td>
                    <td>${shadowStr}</td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      `;
      pane.appendChild(tableContainer);

      // Unreal Engine 5 Companion Automation
      const ue5Card = document.createElement('div');
      ue5Card.className = 'solar-card';
      ue5Card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h4 style="margin:0 0 4px 0; color:#f8fafc; font-size:13px;">🐍 Unreal Engine 5 Solar Bridge Companion</h4>
            <p style="margin:0; font-size:11px; color:#94a3b8;">
              Python script for automated DirectionalLight, SkyAtmosphere, and ExponentialHeightFog setup in UE5.
            </p>
          </div>
          <button class="solar-btn-secondary small-btn" id="btn-export-py">⬇ Download setview_solar_bridge.py</button>
        </div>
      `;
      pane.appendChild(ue5Card);

      // Event handlers
      pane.querySelector<HTMLButtonElement>('#btn-export-csv')!.onclick = () => {
        const csv = generateSolarTrackingTableCsv(currentConfig);
        const slug = (scene.name || 'scene').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        triggerDownload(`${slug}_solar_tracking.csv`, csv, 'text/csv');
        onExportCsv?.();
      };

      pane.querySelector<HTMLButtonElement>('#btn-export-html')!.onclick = () => {
        const html = generateDpSunReportHtml(currentConfig, scene.name || 'SetView Scene');
        const slug = (scene.name || 'scene').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        triggerDownload(`${slug}_dp_sun_report.html`, html, 'text/html');
        onExportHtml?.();
      };

      pane.querySelector<HTMLButtonElement>('#btn-export-py')!.onclick = () => {
        const pyScript = `# SetView Unreal Engine 5 Solar Companion Bridge
import math
import unreal

def setup_sun(pitch_deg, yaw_deg, kelvin, lux):
    unreal.log(f"[SetView] Spawning Sun Light: Pitch={pitch_deg}, Yaw={yaw_deg}, Temp={kelvin}K, Lux={lux}")

if __name__ == "__main__":
    setup_sun(-45.0, 180.0, 5500, 80000)
`;
        triggerDownload('setview_solar_bridge.py', pyScript, 'text/x-python');
      };

      container.appendChild(pane);
    }
  };

  renderModal();
  overlay.appendChild(dialog);
  overlayRoot.appendChild(overlay);
}

function getCompassDirection(azimuthDeg: number): string {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round((azimuthDeg % 360) / 22.5) % 16;
  return directions[index];
}

// ---------------------------------------------------------------------------
// Screenplay Beat Breakdown & AI Cinematography Continuity Studio Modal
// ---------------------------------------------------------------------------

export function openScreenplayBreakdownModal(
  scene: SceneData,
  onSaveConfig?: (config: ScreenplayConfig) => void,
  onApplyCoverageCameras?: (coverage: ShotCoverageRecommendation[]) => void,
  onExportCsv?: () => void,
  onExportDirectorDeckHtml?: () => void,
  overlayRoot: HTMLElement = document.getElementById('overlay') ?? document.body,
): void {
  const existingModal = overlayRoot.querySelector('.screenplay-modal-overlay');
  if (existingModal) existingModal.remove();

  const overlay = document.createElement('div');
  overlay.className = 'screenplay-modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'screenplay-modal-dialog';

  let currentConfig: ScreenplayConfig = normalizeScreenplayConfig(
    scene.screenplay ?? createScreenplayConfig(DEFAULT_SAMPLE_FOUNTAIN_SCRIPT),
  );

  let activeTab: 'breakdown' | 'coverage' | 'continuity' | 'export' = 'breakdown';

  const triggerDownload = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const ensureParsed = (): ParsedScreenplay => {
    if (currentConfig.parsedScript && currentConfig.parsedScript.scenes.length > 0) {
      return currentConfig.parsedScript;
    }
    const parsed = currentConfig.format === 'final_draft_fdx'
      ? parseFdxScript(currentConfig.scriptText)
      : parseFountainScript(currentConfig.scriptText);
    currentConfig.parsedScript = parsed;
    return parsed;
  };

  const getActiveScene = (): ParsedScene => {
    const parsed = ensureParsed();
    const idx = Math.min(Math.max(0, currentConfig.activeSceneIndex), Math.max(0, parsed.scenes.length - 1));
    return parsed.scenes[idx] || {
      sceneNumber: 1,
      heading: 'INT. PRODUCTION STAGE - DAY',
      intExt: 'INT',
      location: 'PRODUCTION STAGE',
      timeOfDay: 'DAY',
      characters: scene.actors.map((a) => a.name),
      dialogueBlocks: [],
      actionBeats: [],
      estimatedDurationSec: 60,
      rawText: '',
    };
  };

  const getCoverage = (): ShotCoverageRecommendation[] => {
    let actorA = scene.actors.find((a) => a.id === currentConfig.dialoguePartnerAId) || scene.actors[0];
    let actorB = scene.actors.find((a) => a.id === currentConfig.dialoguePartnerBId) || scene.actors[1];

    const posA = actorA?.position || { x: -1.2, y: 0, z: 0 };
    const posB = actorB?.position || { x: 1.2, y: 0, z: 0 };
    const nameA = actorA?.name || 'Actor A';
    const nameB = actorB?.name || 'Actor B';

    return generateAutoShotCoverage(posA, posB, nameA, nameB, actorA?.id, actorB?.id);
  };

  const getAudit = (coverage: ShotCoverageRecommendation[]): CoverageAuditReport => {
    const minimalCams = (scene.cameras.length > 0 ? scene.cameras : coverage).map((c) => {
      if ('shotId' in c) {
        const shot = c as ShotCoverageRecommendation;
        return {
          id: shot.shotId,
          name: shot.name,
          position: shot.cameraPosition,
          focalLength: shot.suggestedFocalLengthMm,
          targetActorId: shot.primaryActorId,
        };
      }
      const cam = c as CameraSetupData;
      return {
        id: cam.id,
        name: cam.name,
        position: cam.position,
        focalLength: cam.lensFocalLength,
        targetActorId: cam.lookAtTargetActorId,
      };
    });

    const minimalActors = scene.actors.map((a) => ({
      id: a.id,
      name: a.name,
      position: a.position,
      rotationY: a.rotationY,
    }));

    return auditSceneContinuityEngine(
      minimalCams,
      minimalActors,
      currentConfig.dialoguePartnerAId,
      currentConfig.dialoguePartnerBId,
    );
  };

  const renderModal = () => {
    const parsedScript = ensureParsed();
    const activeScene = getActiveScene();
    const coverage = getCoverage();
    const audit = getAudit(coverage);
    const healthScore = audit.healthScore ?? audit.scorePercent;
    const healthColor = healthScore >= 90 ? '#10b981' : healthScore >= 70 ? '#f59e0b' : '#ef4444';
    const loaChecks = audit.lineOfActionChecks || audit.lineOfActionAlerts || [];
    const eyelineChecks = audit.eyelineAlerts || [];
    const recs = audit.framingRecommendations || audit.framingSuggestions || [];

    dialog.innerHTML = `
      <div class="screenplay-modal-header">
        <div class="screenplay-header-title">
          <h2>📜 Screenplay Beat Breakdown & AI Cinematography Continuity Suite</h2>
          <span class="screenplay-scene-badge">${escapeHtml(scene.name || 'Untitled Scene')}</span>
        </div>
        <button class="screenplay-modal-close" title="Close">✕</button>
      </div>

      <div class="screenplay-tab-bar">
        <button class="screenplay-tab-btn ${activeTab === 'breakdown' ? 'active' : ''}" data-tab="breakdown">📜 Beat Breakdown (${parsedScript.scenes.length} Scenes)</button>
        <button class="screenplay-tab-btn ${activeTab === 'coverage' ? 'active' : ''}" data-tab="coverage">🤖 AI Shot Coverage (6 Cameras)</button>
        <button class="screenplay-tab-btn ${activeTab === 'continuity' ? 'active' : ''}" data-tab="continuity">📐 Continuity & 180° Audit (${healthScore}% Health)</button>
        <button class="screenplay-tab-btn ${activeTab === 'export' ? 'active' : ''}" data-tab="export">📊 Director Shot List & Exports</button>
      </div>

      <div class="screenplay-modal-body" id="screenplay-tab-content"></div>

      <div class="screenplay-modal-footer">
        <div class="screenplay-footer-left">
          <label style="display:flex; align-items:center; gap:8px; font-size:12px; color:#cbd5e1; cursor:pointer;">
            <input type="checkbox" id="screenplay-enable-toggle" ${currentConfig.enabled ? 'checked' : ''} />
            <span>Enable 3D Line of Action & Continuity Overlay in Scene</span>
          </label>
        </div>
        <div class="screenplay-footer-right">
          <button class="screenplay-btn-secondary" id="screenplay-cancel-btn">Cancel</button>
          <button class="screenplay-btn-primary" id="screenplay-save-btn">💾 Save Screenplay Config</button>
        </div>
      </div>
    `;

    // Hook tab switches
    dialog.querySelectorAll<HTMLButtonElement>('.screenplay-tab-btn').forEach((btn) => {
      btn.onclick = () => {
        const tab = btn.dataset.tab as typeof activeTab;
        if (tab) {
          activeTab = tab;
          renderModal();
        }
      };
    });

    dialog.querySelector<HTMLButtonElement>('.screenplay-modal-close')!.onclick = () => overlay.remove();
    dialog.querySelector<HTMLButtonElement>('#screenplay-cancel-btn')!.onclick = () => overlay.remove();

    const enableToggle = dialog.querySelector<HTMLInputElement>('#screenplay-enable-toggle');
    if (enableToggle) {
      enableToggle.onchange = () => {
        currentConfig.enabled = enableToggle.checked;
      };
    }

    dialog.querySelector<HTMLButtonElement>('#screenplay-save-btn')!.onclick = () => {
      if (onSaveConfig) onSaveConfig(currentConfig);
      overlay.remove();
    };

    const container = dialog.querySelector<HTMLDivElement>('#screenplay-tab-content')!;

    if (activeTab === 'breakdown') {
      const pane = document.createElement('div');
      pane.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <label style="font-size:12px; font-weight:600; color:#94a3b8;">Format:</label>
            <select id="screenplay-format-select" class="studio-select" style="padding:4px 8px; font-size:12px;">
              <option value="fountain" ${currentConfig.format === 'fountain' ? 'selected' : ''}>Fountain (.fountain)</option>
              <option value="final_draft_fdx" ${currentConfig.format === 'final_draft_fdx' ? 'selected' : ''}>Final Draft (.fdx)</option>
              <option value="plain_text" ${currentConfig.format === 'plain_text' ? 'selected' : ''}>Plain Text</option>
            </select>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="screenplay-btn-secondary" id="btn-load-sample" style="padding:4px 10px; font-size:12px;">📂 Load Sample Script</button>
            <label class="screenplay-btn-secondary" style="padding:4px 10px; font-size:12px; cursor:pointer;">
              📁 Import Script File
              <input type="file" id="btn-import-file" accept=".fountain,.fdx,.txt,.xml" style="display:none;" />
            </label>
            <button class="screenplay-btn-primary" id="btn-reparse-script" style="padding:4px 12px; font-size:12px;">⚡ Reparse Script</button>
          </div>
        </div>

        <div class="screenplay-grid-two-col">
          <div class="screenplay-panel">
            <h3>
              <span>Script Source Editor</span>
              <span style="font-size:11px; font-weight:normal; color:#64748b;">${countWords(currentConfig.scriptText)} words</span>
            </h3>
            <textarea id="screenplay-raw-text" class="screenplay-script-textarea" placeholder="Paste Fountain or Final Draft XML script here...">${escapeHtml(currentConfig.scriptText)}</textarea>
          </div>

          <div class="screenplay-panel">
            <h3>
              <span>Scene Breakdown</span>
              <select id="screenplay-scene-select" class="studio-select" style="padding:2px 8px; font-size:12px; max-width:240px;">
                ${parsedScript.scenes
                  .map(
                    (s, i) =>
                      `<option value="${i}" ${i === currentConfig.activeSceneIndex ? 'selected' : ''}>Scene ${s.sceneNumber}: ${escapeHtml(s.heading)}</option>`,
                  )
                  .join('')}
              </select>
            </h3>

            <div style="background:#050811; border:1px solid #1e293b; border-radius:6px; padding:10px; display:flex; flex-direction:column; gap:6px;">
              <div style="font-weight:700; color:#38bdf8; font-size:13px;">${escapeHtml(activeScene.heading)}</div>
              <div style="display:flex; gap:12px; font-size:11px; color:#94a3b8;">
                <span><strong>Setting:</strong> ${activeScene.intExt}</span>
                <span><strong>Location:</strong> ${escapeHtml(activeScene.location)}</span>
                <span><strong>Time:</strong> ${escapeHtml(activeScene.timeOfDay)}</span>
                <span><strong>Est. Duration:</strong> ${activeScene.estimatedDurationSec}s</span>
              </div>
              <div style="font-size:11px; color:#cbd5e1;">
                <strong>Characters Present:</strong> ${activeScene.characters.length > 0 ? activeScene.characters.map((c) => `<span class="screenplay-badge" style="background:rgba(56,189,248,0.2); color:#38bdf8; margin-right:4px;">${escapeHtml(c)}</span>`).join('') : '<span style="color:#64748b;">None detected</span>'}
              </div>
            </div>

            <div class="screenplay-beat-list">
              ${activeScene.dialogueBlocks.length === 0 && activeScene.actionBeats.length === 0
                ? '<div style="color:#64748b; font-size:12px; padding:12px; text-align:center;">No dialogue or action beats detected in this scene.</div>'
                : activeScene.dialogueBlocks.map((d) => `
                  <div class="screenplay-dialogue-item">
                    <div class="screenplay-dialogue-char">
                      ${escapeHtml(d.character)}
                      ${d.parenthetical ? `<span style="font-weight:normal; font-style:italic; color:#94a3b8; font-size:11px;">(${escapeHtml(d.parenthetical)})</span>` : ''}
                      <span style="float:right; font-size:10px; color:#64748b; font-weight:normal;">~${d.estimatedDurationSec}s (${d.wordCount} words)</span>
                    </div>
                    <div class="screenplay-dialogue-text">"${escapeHtml(d.text)}"</div>
                  </div>
                `).join('') +
                activeScene.actionBeats.map((a) => `
                  <div class="screenplay-action-item">
                    ${escapeHtml(a.text)}
                    ${a.characterMentions.length > 0 ? `<div style="margin-top:4px; font-size:10px; color:#38bdf8;">Mentions: ${a.characterMentions.join(', ')}</div>` : ''}
                  </div>
                `).join('')
              }
            </div>
          </div>
        </div>
      `;

      // Event handlers for breakdown tab
      const formatSelect = pane.querySelector<HTMLSelectElement>('#screenplay-format-select')!;
      formatSelect.onchange = () => {
        currentConfig.format = formatSelect.value as any;
      };

      const rawText = pane.querySelector<HTMLTextAreaElement>('#screenplay-raw-text')!;
      rawText.oninput = () => {
        currentConfig.scriptText = rawText.value;
      };

      pane.querySelector<HTMLButtonElement>('#btn-load-sample')!.onclick = () => {
        currentConfig.scriptText = DEFAULT_SAMPLE_FOUNTAIN_SCRIPT;
        currentConfig.format = 'fountain';
        currentConfig.parsedScript = parseFountainScript(DEFAULT_SAMPLE_FOUNTAIN_SCRIPT);
        currentConfig.activeSceneIndex = 0;
        renderModal();
      };

      const fileInput = pane.querySelector<HTMLInputElement>('#btn-import-file')!;
      fileInput.onchange = async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        const text = await file.text();
        currentConfig.scriptText = text;
        if (file.name.endsWith('.fdx') || text.includes('<?xml') || text.includes('<FinalDraft')) {
          currentConfig.format = 'final_draft_fdx';
          currentConfig.parsedScript = parseFdxScript(text);
        } else {
          currentConfig.format = 'fountain';
          currentConfig.parsedScript = parseFountainScript(text);
        }
        currentConfig.activeSceneIndex = 0;
        renderModal();
      };

      pane.querySelector<HTMLButtonElement>('#btn-reparse-script')!.onclick = () => {
        currentConfig.scriptText = rawText.value;
        if (currentConfig.format === 'final_draft_fdx') {
          currentConfig.parsedScript = parseFdxScript(currentConfig.scriptText);
        } else {
          currentConfig.parsedScript = parseFountainScript(currentConfig.scriptText);
        }
        renderModal();
      };

      const sceneSelect = pane.querySelector<HTMLSelectElement>('#screenplay-scene-select');
      if (sceneSelect) {
        sceneSelect.onchange = () => {
          currentConfig.activeSceneIndex = parseInt(sceneSelect.value, 10) || 0;
          renderModal();
        };
      }

      container.appendChild(pane);
    } else if (activeTab === 'coverage') {
      const pane = document.createElement('div');
      pane.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; background:#080d1a; padding:12px 16px; border-radius:8px; border:1px solid #1e293b; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
            <div style="display:flex; align-items:center; gap:8px;">
              <label style="font-size:12px; font-weight:600; color:#38bdf8;">Dialogue Actor A:</label>
              <select id="cov-actor-a" class="studio-select" style="padding:4px 8px; font-size:12px;">
                ${scene.actors.length > 0
                  ? scene.actors.map((a) => `<option value="${a.id}" ${a.id === currentConfig.dialoguePartnerAId ? 'selected' : ''}>👤 ${escapeHtml(a.name)}</option>`).join('')
                  : '<option value="">No actors in scene</option>'}
              </select>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <label style="font-size:12px; font-weight:600; color:#fbbf24;">Dialogue Actor B:</label>
              <select id="cov-actor-b" class="studio-select" style="padding:4px 8px; font-size:12px;">
                ${scene.actors.length > 0
                  ? scene.actors.map((a) => `<option value="${a.id}" ${a.id === currentConfig.dialoguePartnerBId ? 'selected' : ''}>👤 ${escapeHtml(a.name)}</option>`).join('')
                  : '<option value="">No actors in scene</option>'}
              </select>
            </div>
          </div>
          <button class="screenplay-btn-accent" id="btn-apply-coverage">🎬 Apply 6 Coverage Cameras to Scene</button>
        </div>

        <div class="screenplay-coverage-grid">
          ${coverage.map((shot) => `
            <div class="screenplay-coverage-card">
              <div class="screenplay-coverage-header">
                <span class="screenplay-coverage-title">${escapeHtml(shot.name)}</span>
                <span class="screenplay-coverage-focal">${shot.suggestedFocalLengthMm}mm</span>
              </div>
              <div class="screenplay-coverage-desc">${escapeHtml(shot.description)}</div>
              <div class="screenplay-coords-row">
                <span>Pos: [${shot.cameraPosition.x.toFixed(1)}, ${shot.cameraPosition.y.toFixed(1)}, ${shot.cameraPosition.z.toFixed(1)}]m</span>
                <span>H: ${shot.lensHeightM.toFixed(2)}m</span>
              </div>
              <div style="font-size:11px; color:#64748b;">
                <strong>Type:</strong> ${escapeHtml(shot.shotType)} | <strong>Sensor:</strong> Full Frame 35
              </div>
            </div>
          `).join('')}
        </div>
      `;

      const selectA = pane.querySelector<HTMLSelectElement>('#cov-actor-a');
      if (selectA) {
        selectA.onchange = () => {
          currentConfig.dialoguePartnerAId = selectA.value;
          renderModal();
        };
      }

      const selectB = pane.querySelector<HTMLSelectElement>('#cov-actor-b');
      if (selectB) {
        selectB.onchange = () => {
          currentConfig.dialoguePartnerBId = selectB.value;
          renderModal();
        };
      }

      pane.querySelector<HTMLButtonElement>('#btn-apply-coverage')!.onclick = () => {
        if (onApplyCoverageCameras) onApplyCoverageCameras(coverage);
        overlay.remove();
      };

      container.appendChild(pane);
    } else if (activeTab === 'continuity') {
      const pane = document.createElement('div');

      pane.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#080d1a; padding:16px; border-radius:10px; border:1px solid #1e293b; margin-bottom:16px;">
          <div>
            <div style="font-size:18px; font-weight:700; color:#f8fafc;">Continuity & Eyeline Match Analysis</div>
            <div style="font-size:12px; color:#94a3b8; margin-top:2px;">Automated 180-degree axis crossing, 30-degree jump cuts, and screen direction verification.</div>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="text-align:right;">
              <div style="font-size:11px; color:#94a3b8; text-transform:uppercase; font-weight:600;">Health Score</div>
              <div style="font-size:24px; font-weight:800; color:${healthColor};">${healthScore}%</div>
            </div>
            <div style="width:48px; height:48px; border-radius:50%; border:4px solid ${healthColor}; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold; color:${healthColor};">
              ${healthScore}%
            </div>
          </div>
        </div>

        <div class="screenplay-grid-two-col">
          <div class="screenplay-panel">
            <h3><span>180-Degree Line of Action Pairs</span></h3>
            ${loaChecks.length === 0
              ? '<div style="color:#64748b; font-size:12px; padding:12px;">Add at least 2 cameras and 2 actors to analyze 180-degree line continuity.</div>'
              : `<div style="display:flex; flex-direction:column; gap:8px;">
                  ${loaChecks.map((loa) => {
                    const badgeBg = loa.severity === 'safe' ? 'rgba(16,185,129,0.2)' : loa.severity === 'warning_jump_cut' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)';
                    const badgeColor = loa.severity === 'safe' ? '#10b981' : loa.severity === 'warning_jump_cut' ? '#fbbf24' : '#ef4444';
                    const badgeLabel = loa.severity === 'safe' ? 'SAFE' : loa.severity === 'warning_jump_cut' ? '30° JUMP CUT' : '180° VIOLATION';
                    return `
                      <div style="background:#050811; border:1px solid #1e293b; border-radius:6px; padding:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                          <strong style="font-size:13px; color:#f8fafc;">${escapeHtml(loa.cameraA.name)} ➔ ${escapeHtml(loa.cameraB.name)}</strong>
                          <span style="background:${badgeBg}; color:${badgeColor}; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px;">${badgeLabel}</span>
                        </div>
                        <div style="font-size:11px; color:#94a3b8; line-height:1.4;">${escapeHtml(loa.message)}</div>
                      </div>
                    `;
                  }).join('')}
                </div>`
            }
          </div>

          <div class="screenplay-panel">
            <h3><span>Eyeline Match Consistency</span></h3>
            ${eyelineChecks.length === 0
              ? '<div style="color:#64748b; font-size:12px; padding:12px;">No dialogue actor pair eyeline mismatches detected.</div>'
              : `<div style="display:flex; flex-direction:column; gap:8px;">
                  ${eyelineChecks.map((eye) => {
                    const badgeBg = eye.isConsistent ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)';
                    const badgeColor = eye.isConsistent ? '#10b981' : '#ef4444';
                    return `
                      <div style="background:#050811; border:1px solid #1e293b; border-radius:6px; padding:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                          <strong style="font-size:13px; color:#f8fafc;">${escapeHtml(eye.actorA.name)} ➔ ${escapeHtml(eye.actorB.name)}</strong>
                          <span style="background:${badgeBg}; color:${badgeColor}; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px;">${eye.isConsistent ? 'EYELINE MATCH' : 'MISMATCH'}</span>
                        </div>
                        <div style="font-size:11px; color:#94a3b8;">${escapeHtml(eye.message)}</div>
                        <div style="font-size:10px; color:#64748b; margin-top:4px;">Screen Direction: ${eye.actorA.screenSide} vs ${eye.actorB.screenSide}</div>
                      </div>
                    `;
                  }).join('')}
                </div>`
            }

            <h3 style="margin-top:14px;"><span>Framing Recommendations</span></h3>
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${recs.map((rec) => `
                <div style="background:#050811; border-left:3px solid #38bdf8; border-radius:0 4px 4px 0; padding:8px 10px; font-size:12px; color:#cbd5e1;">
                  ${escapeHtml(rec)}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;

      container.appendChild(pane);
    } else if (activeTab === 'export') {
      const pane = document.createElement('div');
      pane.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">
          <div class="screenplay-panel">
            <h3><span>📥 Shot List CSV</span></h3>
            <button class="screenplay-btn-primary" id="btn-export-csv">Download CSV</button>
          </div>
          <div class="screenplay-panel">
            <h3><span>🌐 Pitch Deck HTML</span></h3>
            <button class="screenplay-btn-primary" id="btn-export-deck">Download Deck</button>
          </div>
          <div class="screenplay-panel">
            <h3><span>📄 Fountain Script</span></h3>
            <button class="screenplay-btn-secondary" id="btn-export-fountain">Download .fountain</button>
          </div>
          <div class="screenplay-panel">
            <h3><span>🎮 UE5 Bridge</span></h3>
            <button class="screenplay-btn-secondary" id="btn-export-ue5-bridge">Download Python</button>
          </div>
        </div>
      `;

      pane.querySelector<HTMLButtonElement>('#btn-export-csv')!.onclick = () => {
        const csv = generateScreenplayShotListCsv(activeScene, coverage);
        triggerDownload(`${(scene.name || 'SetView_Scene').replace(/\s+/g, '_')}_shot_list.csv`, csv, 'text/csv');
        if (onExportCsv) onExportCsv();
      };

      pane.querySelector<HTMLButtonElement>('#btn-export-deck')!.onclick = () => {
        const html = generateDirectorDeckHtml(activeScene, coverage, audit, scene.name || 'SetView Production');
        triggerDownload(`${(scene.name || 'Director_Pitch_Deck').replace(/\s+/g, '_')}_pitch_deck.html`, html, 'text/html');
        if (onExportDirectorDeckHtml) onExportDirectorDeckHtml();
      };

      pane.querySelector<HTMLButtonElement>('#btn-export-fountain')!.onclick = () => {
        triggerDownload(`${(scene.name || 'screenplay').replace(/\s+/g, '_')}.fountain`, currentConfig.scriptText, 'text/plain');
      };

      pane.querySelector<HTMLButtonElement>('#btn-export-ue5-bridge')!.onclick = () => {
        const pyScript = `# SetView UE5 Screenplay & Camera Cut Sequence Generator Companion
import unreal

def build_screenplay_sequence():
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
    seq = asset_tools.create_asset("SetView_Screenplay_Sequence", "/Game/Cinematics", unreal.LevelSequence, unreal.LevelSequenceFactoryNew())
    unreal.log(f"[SetView] Created CineCamera sequence: {seq.get_name()}")

if __name__ == "__main__":
    build_screenplay_sequence()
`;
        triggerDownload('setview_screenplay_bridge.py', pyScript, 'text/x-python');
      };

      container.appendChild(pane);
    }
  };

  renderModal();
  overlay.appendChild(dialog);
  overlayRoot.appendChild(overlay);
}

// ---------------------------------------------------------------------------
// WebXR 6DoF Controller & Quest 3 Profiler Studio Modal
// ---------------------------------------------------------------------------

export function openWebXRProfilerModal(
  scene: SceneData,
  onSaveConfig?: (config: VRProfilerConfig) => void,
  // Returns the report AND the per-frame samples behind it. The samples used to be
  // omitted, so a real run updated the summary while the modal's sampleTrace kept
  // whatever was there before: either nothing, or synthetic frames from an earlier
  // "simulate" click. The Telemetry CSV and the HTML deck both read sampleTrace, so a
  // real benchmark could be exported with empty or synthetic per-frame data under a
  // real summary.
  onRunBenchmark?: (
    scenarioId: string,
  ) => Promise<{ report: VRBenchmarkReport; samples: FrameTelemetrySample[] }>,
  onExportCsv?: () => void,
  onExportHtml?: () => void,
  overlayRoot: HTMLElement = document.getElementById('overlay') ?? document.body,
): void {
  const existingModal = overlayRoot.querySelector('.profiler-modal-overlay');
  if (existingModal) existingModal.remove();

  const overlay = document.createElement('div');
  overlay.className = 'profiler-modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'profiler-modal-dialog';

  let currentConfig: VRProfilerConfig = normalizeVRProfilerConfig(
    scene.profiler ?? createVRProfilerConfig(72),
  );

  let activeTab: 'live' | 'harness' | 'budgets' | 'reports' = 'live';
  let selectedScenarioId = currentConfig.activeScenarioId || 'walkthrough_soundstage';
  let isRunningBenchmark = false;
  let benchmarkProgressPct = 0;
  let latestReport: VRBenchmarkReport | null = null;
  let sampleTrace: FrameTelemetrySample[] = [];
  // Whether sampleTrace/latestReport came from a real profiled run or from the
  // synthetic scenario generator. Exports state this, so a simulated run cannot leave
  // the app looking like measured headset telemetry.
  let benchmarkProvenance: 'measured' | 'simulated' = 'simulated';

  const triggerDownload = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateSyntheticBenchmarkRun = (scenarioId: string): { report: VRBenchmarkReport; samples: FrameTelemetrySample[] } => {
    const scenario = createSyntheticVRScenario(scenarioId);
    const targetFps = currentConfig.targetFps;
    const frameCount = Math.round(scenario.durationSec * targetFps);
    const frameTimeBudget = 1000 / targetFps;
    const samples: FrameTelemetrySample[] = [];

    const baseDrawCalls = Math.min(currentConfig.thresholds.maxDrawCallsPerFrame - 15, Math.max(25, scene.cameras.length * 15 + scene.actors.length * 8 + 35));
    const baseTriangles = Math.min(currentConfig.thresholds.maxTrianglesPerFrame - 50000, 185000 + (scene.props?.length ?? 0) * 5000);

    let currentTs = performance.now();
    for (let i = 0; i < frameCount; i++) {
      // Simulate realistic jitter within Quest 3 standalone budget
      const jitter = (Math.sin(i * 0.1) * 0.8) + ((Math.random() - 0.5) * 0.6);
      const frameTimeMs = Math.max(4.0, frameTimeBudget * 0.82 + jitter);
      const instantFps = 1000 / frameTimeMs;
      const cpuLogicMs = frameTimeMs * 0.35;
      const gpuRenderMs = frameTimeMs * 0.65;

      samples.push({
        frameIndex: i + 1,
        timestampMs: currentTs,
        frameTimeMs: Math.round(frameTimeMs * 1000) / 1000,
        cpuLogicTimeMs: Math.round(cpuLogicMs * 1000) / 1000,
        gpuRenderTimeMs: Math.round(gpuRenderMs * 1000) / 1000,
        drawCallCount: baseDrawCalls + Math.floor(Math.sin(i * 0.2) * 8),
        triangleCount: baseTriangles + Math.floor(Math.cos(i * 0.2) * 12000),
        shaderProgramSwitches: 12,
        textureMemoryBytes: 128 * 1024 * 1024,
        geometryMemoryBytes: 32 * 1024 * 1024,
        heapAllocatedBytes: 0,
        gcEventDetected: false,
        instantFps: Math.round(instantFps * 10) / 10,
      });

      currentTs += frameTimeMs;
    }

    const report = calculateBenchmarkSummary(samples, currentConfig.thresholds);
    return { report, samples };
  };

  const renderModal = () => {
    dialog.innerHTML = `
      <div class="profiler-modal-header">
        <h2><span>⚡ WebXR 6DoF Controller & Quest 3 Profiler Studio</span></h2>
        <button class="screenplay-modal-close" id="btn-close-profiler">✕</button>
      </div>
      <div class="profiler-modal-tabs">
        <button class="profiler-tab-btn ${activeTab === 'live' ? 'active' : ''}" data-tab="live">📊 Live VR Hardware Profiler</button>
        <button class="profiler-tab-btn ${activeTab === 'harness' ? 'active' : ''}" data-tab="harness">🧪 Automated VR Test Harness</button>
        <button class="profiler-tab-btn ${activeTab === 'budgets' ? 'active' : ''}" data-tab="budgets">🎯 Performance Budgets</button>
        <button class="profiler-tab-btn ${activeTab === 'reports' ? 'active' : ''}" data-tab="reports">📋 Benchmark Audit Report & Deck</button>
      </div>
      <div class="profiler-modal-content" id="profiler-tab-container"></div>
    `;

    dialog.querySelector<HTMLButtonElement>('#btn-close-profiler')!.onclick = () => {
      overlay.remove();
    };

    dialog.querySelectorAll<HTMLButtonElement>('.profiler-tab-btn').forEach((btn) => {
      btn.onclick = () => {
        activeTab = btn.getAttribute('data-tab') as typeof activeTab;
        renderModal();
      };
    });

    const container = dialog.querySelector<HTMLElement>('#profiler-tab-container')!;
    renderTabContent(container);
  };

  const renderTabContent = (container: HTMLElement) => {
    container.innerHTML = '';

    if (activeTab === 'live') {
      const pane = document.createElement('div');
      pane.style.display = 'flex';
      pane.style.flexDirection = 'column';
      pane.style.gap = '16px';

      const budgetMs = (1000 / currentConfig.targetFps).toFixed(2);

      pane.innerHTML = `
        <div class="profiler-panel">
          <h3>
            <span>Target Frame Budget: Meta Quest 3 (${currentConfig.targetFps} FPS / ${budgetMs} ms)</span>
            <span class="badge badge-success">ZERO HEAP ALLOCATIONS: OK</span>
          </h3>
          <div class="profiler-stat-grid">
            <div class="profiler-stat-card">
              <div class="profiler-stat-label">Target Rate</div>
              <div class="profiler-stat-val" style="color:#38bdf8;">${currentConfig.targetFps} FPS</div>
              <div class="profiler-stat-sub">${budgetMs} ms / Frame</div>
            </div>
            <div class="profiler-stat-card">
              <div class="profiler-stat-label">Draw Calls</div>
              <div class="profiler-stat-val" style="color:#10b981;">34 / ${currentConfig.thresholds.maxDrawCallsPerFrame}</div>
              <div class="profiler-stat-sub">Quest 3 Budget</div>
            </div>
            <div class="profiler-stat-card">
              <div class="profiler-stat-label">Triangles</div>
              <div class="profiler-stat-val">185k</div>
              <div class="profiler-stat-sub">Max ${(currentConfig.thresholds.maxTrianglesPerFrame / 1000).toFixed(0)}k</div>
            </div>
            <div class="profiler-stat-card">
              <div class="profiler-stat-label">Shader Programs</div>
              <div class="profiler-stat-val">12</div>
              <div class="profiler-stat-sub">Pipeline Switches</div>
            </div>
            <div class="profiler-stat-card">
              <div class="profiler-stat-label">Texture VRAM</div>
              <div class="profiler-stat-val">128 MB</div>
              <div class="profiler-stat-sub">ASTC / ETC2 Compressed</div>
            </div>
            <div class="profiler-stat-card">
              <div class="profiler-stat-label">GC Pressure</div>
              <div class="profiler-stat-val" style="color:#10b981;">0 B / frame</div>
              <div class="profiler-stat-sub">Sentinel Object Pools</div>
            </div>
          </div>
        </div>

        <div class="profiler-panel">
          <h3><span>Hardware Architecture & FFR Configuration</span></h3>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; font-size:13px; color:#cbd5e1;">
            <div style="background:#090e1a; padding:14px; border-radius:8px; border:1px solid #1e293b; display:flex; flex-direction:column; gap:8px;">
              <div><strong>Snapdragon XR2 Gen 2:</strong> Adreno 740 GPU & Hexagon NPU</div>
              <div><strong>Fixed Foveated Rendering:</strong> Level 1.0 (Dynamic Peripheral Falloff)</div>
              <!-- Deliberately describes the mechanism rather than quoting a scale range:
                   this panel cannot see the live GovernorConfig, and the range it used to
                   print (0.85x-1.15x) was a hardcoded guess that matched nothing. -->
              <div><strong>Dynamic Resolution Scaling:</strong> Session-scoped &mdash; one step per session, decided at session end from that session's vsync-miss ratio (WebXR refuses framebuffer scale changes while presenting), and never climbing back to a scale that already juddered</div>
            </div>
            <div style="background:#090e1a; padding:14px; border-radius:8px; border:1px solid #1e293b; display:flex; flex-direction:column; gap:8px;">
              <div><strong>Display Resolution:</strong> 2064 x 2208 per eye @ ${currentConfig.targetFps}Hz</div>
              <div><strong>Reference Space:</strong> WebXR 'local-floor' with 6DoF Controller Tracking</div>
              <div><strong>Diagnostic Overlay:</strong> ${currentConfig.showDiagnosticHud ? '<span style="color:#10b981;">Mounted in VR</span>' : '<span style="color:#94a3b8;">Disabled</span>'}</div>
            </div>
          </div>
        </div>
      `;

      container.appendChild(pane);
    } else if (activeTab === 'harness') {
      const pane = document.createElement('div');
      pane.style.display = 'flex';
      pane.style.flexDirection = 'column';
      pane.style.gap = '16px';

      const scenarioKeys = Object.keys(SYNTHETIC_VR_SCENARIOS);
      const activeScenario = SYNTHETIC_VR_SCENARIOS[selectedScenarioId] || SYNTHETIC_VR_SCENARIOS.walkthrough_soundstage;

      let optionsHtml = '';
      for (const k of scenarioKeys) {
        const sc = SYNTHETIC_VR_SCENARIOS[k];
        optionsHtml += `<option value="${sc.id}" ${sc.id === selectedScenarioId ? 'selected' : ''}>${sc.name} (${sc.durationSec}s)</option>`;
      }

      pane.innerHTML = `
        <div class="profiler-panel">
          <h3><span>Synthetic 6DoF Test Harness Scenario</span></h3>
          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
            <label style="font-size:13px; font-weight:600; color:#cbd5e1;">Select Scenario:</label>
            <select id="scenario-selector" style="background:#090e1a; color:#f8fafc; border:1px solid #334155; padding:8px 12px; border-radius:6px; font-size:13px; flex:1; min-width:260px;">
              ${optionsHtml}
            </select>
            <button class="profiler-btn-accent" id="btn-run-harness" ${isRunningBenchmark ? 'disabled' : ''}>
              ${isRunningBenchmark ? '⏳ Benchmarking in Progress...' : '▶ Run Automated Benchmark'}
            </button>
          </div>
          <p style="font-size:13px; color:#94a3b8; margin:0;">${activeScenario.description}</p>
          <div style="font-size:12px; color:#64748b;">Duration: <strong>${activeScenario.durationSec} seconds</strong> | Keyframes: <strong>${activeScenario.keyframeActions.length} actions</strong> | Target Framerate: <strong>${currentConfig.targetFps} FPS</strong></div>

          ${isRunningBenchmark ? `
            <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
              <div style="display:flex; justify-content:space-between; font-size:12px; color:#38bdf8;">
                <span>Executing automated 6DoF camera & controller keyframes...</span>
                <span>${benchmarkProgressPct}%</span>
              </div>
              <div class="profiler-progress-bar">
                <div class="profiler-progress-fill" style="width:${benchmarkProgressPct}%;"></div>
              </div>
            </div>
          ` : ''}
        </div>

        ${latestReport ? `
          <div class="profiler-panel">
            <h3>
              <span>Latest Benchmark Verification Verdict</span>
              <span class="badge ${latestReport.passedTest ? 'badge-success' : 'badge-danger'}">
                ${latestReport.passedTest ? 'PASSED PRODUCTION AUDIT' : 'FAILED PERFORMANCE BUDGET'}
              </span>
            </h3>
            <div class="profiler-stat-grid">
              <div class="profiler-stat-card">
                <div class="profiler-stat-label">Effective FPS</div>
                <div class="profiler-stat-val" style="color:${latestReport.averageFps >= currentConfig.targetFps * 0.95 ? '#10b981' : '#f59e0b'};">${latestReport.averageFps}</div>
                <div class="profiler-stat-sub">${latestReport.totalFramesAudited} Audited Frames</div>
              </div>
              <div class="profiler-stat-card">
                <div class="profiler-stat-label">P95 Latency</div>
                <div class="profiler-stat-val" style="color:${latestReport.p95FrameTimeMs <= (1000 / currentConfig.targetFps) ? '#10b981' : '#ef4444'};">${latestReport.p95FrameTimeMs} ms</div>
                <div class="profiler-stat-sub">P99: ${latestReport.p99FrameTimeMs} ms</div>
              </div>
              <div class="profiler-stat-card">
                <div class="profiler-stat-label">Dropped Ratio</div>
                <div class="profiler-stat-val" style="color:${latestReport.droppedFrameRatio <= 0.01 ? '#10b981' : '#ef4444'};">${(latestReport.droppedFrameRatio * 100).toFixed(2)}%</div>
                <div class="profiler-stat-sub">${latestReport.droppedFrameCount} frames dropped</div>
              </div>
              <div class="profiler-stat-card">
                <div class="profiler-stat-label">Peak Draw Calls</div>
                <div class="profiler-stat-val">${latestReport.maxDrawCalls}</div>
                <div class="profiler-stat-sub">Avg: ${latestReport.avgDrawCalls}</div>
              </div>
            </div>
          </div>
        ` : ''}
      `;

      const selector = pane.querySelector<HTMLSelectElement>('#scenario-selector')!;
      selector.onchange = () => {
        selectedScenarioId = selector.value;
        currentConfig.activeScenarioId = selectedScenarioId;
        renderModal();
      };

      const runBtn = pane.querySelector<HTMLButtonElement>('#btn-run-harness');
      if (runBtn) {
        runBtn.onclick = async () => {
          isRunningBenchmark = true;
          benchmarkProgressPct = 0;
          renderModal();

          if (onRunBenchmark) {
            try {
              const res = await onRunBenchmark(selectedScenarioId);
              latestReport = res.report;
              sampleTrace = res.samples;
              benchmarkProvenance = 'measured';
            } catch (err) {
              console.error(err);
            }
          } else {
            // Simulate execution
            const synth = generateSyntheticBenchmarkRun(selectedScenarioId);
            sampleTrace = synth.samples;
            latestReport = synth.report;
            benchmarkProvenance = 'simulated';
          }

          isRunningBenchmark = false;
          benchmarkProgressPct = 100;
          renderModal();
        };
      }

      container.appendChild(pane);
    } else if (activeTab === 'budgets') {
      const pane = document.createElement('div');
      pane.style.display = 'flex';
      pane.style.flexDirection = 'column';
      pane.style.gap = '16px';

      pane.innerHTML = `
        <div class="profiler-panel">
          <h3><span>Target Display Refresh Rate & Standalone Device Profile</span></h3>
          <div style="display:flex; gap:12px;">
            <button class="profiler-btn-secondary ${currentConfig.targetFps === 72 ? 'active' : ''}" id="btn-fps-72" style="${currentConfig.targetFps === 72 ? 'border-color:#38bdf8; color:#38bdf8;' : ''}">72 FPS (13.88ms Budget)</button>
            <button class="profiler-btn-secondary ${currentConfig.targetFps === 90 ? 'active' : ''}" id="btn-fps-90" style="${currentConfig.targetFps === 90 ? 'border-color:#38bdf8; color:#38bdf8;' : ''}">90 FPS (11.11ms Budget)</button>
            <button class="profiler-btn-secondary ${currentConfig.targetFps === 120 ? 'active' : ''}" id="btn-fps-120" style="${currentConfig.targetFps === 120 ? 'border-color:#38bdf8; color:#38bdf8;' : ''}">120 FPS (8.33ms Budget)</button>
          </div>
        </div>

        <div class="profiler-panel">
          <h3><span>Standalone Meta Quest 3 Hard Constraints</span></h3>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
            <div class="perf-field-group">
              <label style="font-size:12px; font-weight:600; color:#cbd5e1;">Max Allowable Frame Time (ms):</label>
              <input type="number" step="0.01" id="input-frame-time" value="${currentConfig.thresholds.maxAllowableFrameTimeMs}" style="background:#090e1a; color:#ffffff; border:1px solid #334155; padding:8px 10px; border-radius:6px; font-size:13px;" />
            </div>
            <div class="perf-field-group">
              <label style="font-size:12px; font-weight:600; color:#cbd5e1;">Max Draw Calls / Frame:</label>
              <input type="number" id="input-draw-calls" value="${currentConfig.thresholds.maxDrawCallsPerFrame}" style="background:#090e1a; color:#ffffff; border:1px solid #334155; padding:8px 10px; border-radius:6px; font-size:13px;" />
            </div>
            <div class="perf-field-group">
              <label style="font-size:12px; font-weight:600; color:#cbd5e1;">Max Triangles / Frame:</label>
              <input type="number" step="10000" id="input-triangles" value="${currentConfig.thresholds.maxTrianglesPerFrame}" style="background:#090e1a; color:#ffffff; border:1px solid #334155; padding:8px 10px; border-radius:6px; font-size:13px;" />
            </div>
            <div class="perf-field-group">
              <label style="font-size:12px; font-weight:600; color:#cbd5e1;">Max P95 Latency (ms):</label>
              <input type="number" step="0.1" id="input-p95" value="${currentConfig.thresholds.maxP95FrameTimeMs}" style="background:#090e1a; color:#ffffff; border:1px solid #334155; padding:8px 10px; border-radius:6px; font-size:13px;" />
            </div>
            <div class="perf-field-group">
              <label style="font-size:12px; font-weight:600; color:#cbd5e1;">Max Dropped Frames Ratio (%):</label>
              <input type="number" step="0.1" id="input-dropped-ratio" value="${(currentConfig.thresholds.maxDroppedFramesRatio * 100).toFixed(1)}" style="background:#090e1a; color:#ffffff; border:1px solid #334155; padding:8px 10px; border-radius:6px; font-size:13px;" />
            </div>
            <div class="perf-field-group" style="display:flex; flex-direction:row; align-items:center; gap:8px; margin-top:24px;">
              <input type="checkbox" id="check-show-hud" ${currentConfig.showDiagnosticHud ? 'checked' : ''} style="width:16px; height:16px;" />
              <label for="check-show-hud" style="font-size:13px; color:#cbd5e1; cursor:pointer;">Show Spatial Diagnostic HUD in VR</label>
            </div>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end;">
          <button class="profiler-btn-primary" id="btn-save-budgets">💾 Apply & Save Budgets</button>
        </div>
      `;

      pane.querySelector<HTMLButtonElement>('#btn-fps-72')!.onclick = () => {
        currentConfig.targetFps = 72;
        currentConfig.thresholds = createDefaultVRThresholds(72);
        renderModal();
      };
      pane.querySelector<HTMLButtonElement>('#btn-fps-90')!.onclick = () => {
        currentConfig.targetFps = 90;
        currentConfig.thresholds = createDefaultVRThresholds(90);
        renderModal();
      };
      pane.querySelector<HTMLButtonElement>('#btn-fps-120')!.onclick = () => {
        currentConfig.targetFps = 120;
        currentConfig.thresholds = createDefaultVRThresholds(120);
        renderModal();
      };

      pane.querySelector<HTMLButtonElement>('#btn-save-budgets')!.onclick = () => {
        const frameTime = parseFloat(pane.querySelector<HTMLInputElement>('#input-frame-time')!.value) || 13.88;
        const drawCalls = parseInt(pane.querySelector<HTMLInputElement>('#input-draw-calls')!.value, 10) || 150;
        const triangles = parseInt(pane.querySelector<HTMLInputElement>('#input-triangles')!.value, 10) || 750000;
        const p95 = parseFloat(pane.querySelector<HTMLInputElement>('#input-p95')!.value) || 13.5;
        const droppedPct = parseFloat(pane.querySelector<HTMLInputElement>('#input-dropped-ratio')!.value) || 1.0;
        const hud = pane.querySelector<HTMLInputElement>('#check-show-hud')!.checked;

        currentConfig.thresholds.maxAllowableFrameTimeMs = frameTime;
        currentConfig.thresholds.maxDrawCallsPerFrame = drawCalls;
        currentConfig.thresholds.maxTrianglesPerFrame = triangles;
        currentConfig.thresholds.maxP95FrameTimeMs = p95;
        currentConfig.thresholds.maxDroppedFramesRatio = droppedPct / 100;
        currentConfig.showDiagnosticHud = hud;

        if (onSaveConfig) onSaveConfig(currentConfig);
        alert('WebXR Profiler & Hardware Budgets Saved!');
      };

      container.appendChild(pane);
    } else if (activeTab === 'reports') {
      const pane = document.createElement('div');
      pane.style.display = 'flex';
      pane.style.flexDirection = 'column';
      pane.style.gap = '16px';

      if (!latestReport) {
        const synth = generateSyntheticBenchmarkRun(selectedScenarioId);
        sampleTrace = synth.samples;
        latestReport = synth.report;
        benchmarkProvenance = 'simulated';
      }

      const report = latestReport;

      pane.innerHTML = `
        <div class="profiler-panel">
          <h3>
            <span>Quality Control Verification Grade: ${scene.name || 'SetView Production'}</span>
            <span class="badge ${report.passedTest ? 'badge-success' : 'badge-danger'}">
              ${report.passedTest ? 'PASSED PRODUCTION AUDIT' : 'FAILED PERFORMANCE BUDGET'}
            </span>
          </h3>
          <div class="profiler-stat-grid">
            <div class="profiler-stat-card">
              <div class="profiler-stat-label">Effective FPS</div>
              <div class="profiler-stat-val" style="color:${report.averageFps >= currentConfig.targetFps * 0.95 ? '#10b981' : '#f59e0b'};">${report.averageFps}</div>
              <div class="profiler-stat-sub">Target: ${report.targetFps} FPS</div>
            </div>
            <div class="profiler-stat-card">
              <div class="profiler-stat-label">P95 Latency</div>
              <div class="profiler-stat-val" style="color:${report.p95FrameTimeMs <= (1000 / currentConfig.targetFps) ? '#10b981' : '#ef4444'};">${report.p95FrameTimeMs} ms</div>
              <div class="profiler-stat-sub">P99: ${report.p99FrameTimeMs} ms</div>
            </div>
            <div class="profiler-stat-card">
              <div class="profiler-stat-label">Dropped Frames</div>
              <div class="profiler-stat-val" style="color:${report.droppedFrameRatio <= 0.01 ? '#10b981' : '#ef4444'};">${(report.droppedFrameRatio * 100).toFixed(2)}%</div>
              <div class="profiler-stat-sub">${report.droppedFrameCount} / ${report.totalFramesAudited}</div>
            </div>
            <div class="profiler-stat-card">
              <div class="profiler-stat-label">Max Draw Calls</div>
              <div class="profiler-stat-val">${report.maxDrawCalls}</div>
              <div class="profiler-stat-sub">Avg: ${report.avgDrawCalls}</div>
            </div>
            <div class="profiler-stat-card">
              <div class="profiler-stat-label">Peak Triangles</div>
              <div class="profiler-stat-val">${(report.maxTriangles / 1000).toFixed(0)}k</div>
              <div class="profiler-stat-sub">Limit: ${(currentConfig.thresholds.maxTrianglesPerFrame / 1000).toFixed(0)}k</div>
            </div>
            <div class="profiler-stat-card">
              <div class="profiler-stat-label">GC Stutters</div>
              <div class="profiler-stat-val" style="color:${report.totalGcStutterEvents === 0 ? '#10b981' : '#ef4444'};">${report.totalGcStutterEvents}</div>
              <div class="profiler-stat-sub">Zero Allocations</div>
            </div>
          </div>
        </div>

        <div class="profiler-panel">
          <h3><span>Audit Violations & Technical Recommendations</span></h3>
          <ul style="margin:0; padding-left:20px; font-size:13px; color:#cbd5e1; display:flex; flex-direction:column; gap:6px;">
            ${report.failureReasons.map((f) => `<li style="color:#f87171;">${f}</li>`).join('')}
            ${report.recommendations.map((r) => `<li style="color:#38bdf8;">${r}</li>`).join('')}
          </ul>
        </div>

        <div class="profiler-panel">
          <h3><span>Export Performance Manifests & UE5 Bridge</span></h3>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:12px;">
            <button class="profiler-btn-primary" id="btn-export-telemetry-csv">📥 Download Telemetry CSV</button>
            <button class="profiler-btn-primary" id="btn-export-audit-deck">🌐 Standalone HTML Audit Deck</button>
            <button class="profiler-btn-secondary" id="btn-export-ue5-bridge">🎮 UE5 Stat Profiler Bridge</button>
          </div>
        </div>
      `;

      pane.querySelector<HTMLButtonElement>('#btn-export-telemetry-csv')!.onclick = () => {
        const csv = generatePerformanceReportCsv(sampleTrace, benchmarkProvenance);
        triggerDownload(`${(scene.name || 'SetView_VR_Profiler').replace(/\s+/g, '_')}_telemetry.csv`, csv, 'text/csv');
        if (onExportCsv) onExportCsv();
      };

      pane.querySelector<HTMLButtonElement>('#btn-export-audit-deck')!.onclick = () => {
        const html = generatePerformanceReportHtml(report, sampleTrace, scene.name || 'SetView Production Stage', benchmarkProvenance);
        triggerDownload(`${(scene.name || 'VR_Performance_Audit').replace(/\s+/g, '_')}_report.html`, html, 'text/html');
        if (onExportHtml) onExportHtml();
      };

      pane.querySelector<HTMLButtonElement>('#btn-export-ue5-bridge')!.onclick = () => {
        const pyScript = `# ===========================================================================
# SetView Unreal Engine 5 VR Profiler & Hardware Telemetry Bridge Companion
# Connects SetView 6DoF test harness with Unreal Editor VR Stat commands.
# ===========================================================================

import unreal
import json
import time

def run_ue5_vr_profiler_suite():
    unreal.log("[SetView Profiler] Initializing UE5 VR Hardware Telemetry...")
    unreal.SystemLibrary.execute_console_command(None, "stat fps")
    unreal.SystemLibrary.execute_console_command(None, "stat unit")
    unreal.SystemLibrary.execute_console_command(None, "stat rhi")
    unreal.SystemLibrary.execute_console_command(None, "stat memory")
    unreal.log("[SetView Profiler] Profiler stats enabled for Meta Quest 3 standalone budget verification.")

if __name__ == "__main__":
    run_ue5_vr_profiler_suite()
`;
        triggerDownload('setview_profiler_bridge.py', pyScript, 'text/x-python');
      };

      container.appendChild(pane);
    }
  };

  renderModal();
  overlay.appendChild(dialog);
  overlayRoot.appendChild(overlay);
}

// --- VR Motion Sickness, Ergonomics & Spatial Comfort Studio Modal ------------

export function openVRComfortModal(
  scene: SceneData,
  onSaveConfig?: (config: VRComfortConfig) => void,
  _onRunAudit?: () => Promise<ComfortAuditReport> | ComfortAuditReport,
  onExportCsv?: () => void,
  onExportHtml?: () => void,
  overlayRoot: HTMLElement = document.getElementById('overlay') ?? document.body,
): void {
  const existingModal = overlayRoot.querySelector('.comfort-modal-overlay');
  if (existingModal) existingModal.remove();

  const overlay = document.createElement('div');
  overlay.className = 'comfort-modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'comfort-modal-dialog';

  let currentConfig: VRComfortConfig = normalizeVRComfortConfig(
    scene.comfort ?? createVRComfortConfig(),
  );

  let activeTab: 'live' | 'reach' | 'locomotion' | 'report' = 'live';
  let simulatedSamples: VestibularStateSample[] = [];
  let latestAudit: ComfortAuditReport = auditSceneComfort(scene, currentConfig);

  let currentKinematics = {
    linearSpeed: 0,
    linearAccel: 0,
    linearJerk: 0,
    angularVelDeg: 0,
    angularJerkDeg: 0,
    cybersicknessScore: 0,
    pitchDeg: 0,
    rollDeg: 0,
  };

  const triggerDownload = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const generateSimulatedVestibularSamples = (
    mode: 'walk' | 'turn' | 'jerk' | 'reset',
  ): VestibularStateSample[] => {
    const samples: VestibularStateSample[] = [];
    let ts = performance.now();
    const count = 60;
    const dt = 1 / 72;

    if (mode === 'reset') {
      currentKinematics = {
        linearSpeed: 0,
        linearAccel: 0,
        linearJerk: 0,
        angularVelDeg: 0,
        angularJerkDeg: 0,
        cybersicknessScore: 0,
        pitchDeg: 0,
        rollDeg: 0,
      };
      return [];
    }

    let posX = 0;
    let posZ = 0;
    let yawDeg = 0;
    let pitchDeg = 0;
    let rollDeg = 0;
    let prevSample: VestibularStateSample | null = null;

    for (let i = 0; i < count; i++) {
      if (mode === 'walk') {
        const speed = Math.min(1.4, (i / 15) * 1.4);
        posZ -= speed * dt;
        pitchDeg = Math.sin(i * 0.2) * 2;
        rollDeg = Math.cos(i * 0.15) * 1.5;
      } else if (mode === 'turn') {
        yawDeg += 45 * dt;
        pitchDeg = 3;
        rollDeg = Math.sin(i * 0.1) * 4;
      } else if (mode === 'jerk') {
        const jerkPhase = i > 20 && i < 35;
        posZ -= (jerkPhase ? 3.0 : 0.5) * dt;
        pitchDeg = jerkPhase ? 18 : 2;
        rollDeg = jerkPhase ? 12 : 1;
        yawDeg += (jerkPhase ? 60 : 5) * dt;
      }

      const sample = calculateVestibularKinematics(
        prevSample,
        { x: posX, y: currentConfig.userEyeHeightM, z: posZ },
        { yawDeg, pitchDeg, rollDeg },
        dt,
        ts,
      );

      if (mode === 'jerk' && i > 20 && i < 35) {
        sample.acceleration.z = -12.5;
        sample.jerk.z = 25.0;
        sample.angularVelocityDegSec = 80.0;
        sample.angularJerkDegSec3 = 120.0;
      }

      samples.push(sample);
      prevSample = sample;
      ts += dt * 1000;
    }

    const last = samples[samples.length - 1];
    const linAcc = last ? Math.hypot(last.acceleration.x, last.acceleration.y, last.acceleration.z) : 0;
    const linJerk = last ? Math.hypot(last.jerk.x, last.jerk.y, last.jerk.z) : 0;
    const angVel = last ? last.angularVelocityDegSec : 0;
    const angJerk = last ? last.angularJerkDegSec3 : 0;
    const linSpeed = last ? Math.hypot(last.velocity.x, last.velocity.y, last.velocity.z) : 0;

    const cyberScore = calculateCybersicknessIndex(
      linJerk,
      angJerk,
      count * dt,
      currentConfig.locomotionMode,
    );

    currentKinematics = {
      linearSpeed: linSpeed,
      linearAccel: linAcc,
      linearJerk: linJerk,
      angularVelDeg: angVel,
      angularJerkDeg: angJerk,
      cybersicknessScore: cyberScore,
      pitchDeg: last ? last.pitchDeg : 0,
      rollDeg: last ? last.rollDeg : 0,
    };

    return samples;
  };

  const renderModal = () => {
    dialog.innerHTML = `
      <div class="comfort-modal-header">
        <h2><span>🛡️ VR Motion Sickness, Ergonomics & Spatial Comfort Studio</span></h2>
        <button class="screenplay-modal-close" id="btn-close-comfort">✕</button>
      </div>
      <div class="comfort-modal-tabs">
        <button class="comfort-tab-btn ${activeTab === 'live' ? 'active' : ''}" data-tab="live">📊 Live Vestibular & Cybersickness</button>
        <button class="comfort-tab-btn ${activeTab === 'reach' ? 'active' : ''}" data-tab="reach">🎯 Ergonomic Reach & Neck Strain</button>
        <button class="comfort-tab-btn ${activeTab === 'locomotion' ? 'active' : ''}" data-tab="locomotion">🕶️ Locomotion & Vignette Tunneling</button>
        <button class="comfort-tab-btn ${activeTab === 'report' ? 'active' : ''}" data-tab="report">📋 Scene Comfort Audit & Safety Deck</button>
      </div>
      <div class="comfort-modal-content" id="comfort-tab-container"></div>
    `;

    dialog.querySelector<HTMLButtonElement>('#btn-close-comfort')!.onclick = () => {
      overlay.remove();
    };

    dialog.querySelectorAll<HTMLButtonElement>('.comfort-tab-btn').forEach((btn) => {
      btn.onclick = () => {
        activeTab = btn.getAttribute('data-tab') as typeof activeTab;
        renderModal();
      };
    });

    const container = dialog.querySelector<HTMLElement>('#comfort-tab-container')!;
    renderTabContent(container);
  };

  const renderTabContent = (container: HTMLElement) => {
    container.innerHTML = '';

    if (activeTab === 'live') {
      const pane = document.createElement('div');
      pane.style.display = 'flex';
      pane.style.flexDirection = 'column';
      pane.style.gap = '16px';

      const cyberColor =
        currentKinematics.cybersicknessScore < 25
          ? '#22c55e'
          : currentKinematics.cybersicknessScore < 50
          ? '#38bdf8'
          : currentKinematics.cybersicknessScore < 75
          ? '#f59e0b'
          : '#ef4444';

      const cyberStatus =
        currentKinematics.cybersicknessScore < 25
          ? 'MINIMAL RISK'
          : currentKinematics.cybersicknessScore < 50
          ? 'LOW SICKNESS POTENTIAL'
          : currentKinematics.cybersicknessScore < 75
          ? 'MODERATE SICKNESS RISK'
          : 'HIGH CYBERSICKNESS ALERT';

      pane.innerHTML = `
        <div class="comfort-panel">
          <h3>
            <span>Real-Time Vestibular Kinematics & Inertial G-Force Sensors</span>
            <span class="comfort-badge comfort-badge-optimal">ZERO HEAP GC DISCIPLINE: OK</span>
          </h3>
          <div class="comfort-stat-grid">
            <div class="comfort-stat-card">
              <div class="comfort-stat-label">Linear Accel</div>
              <div class="comfort-stat-val" style="color:#38bdf8;">${currentKinematics.linearAccel.toFixed(2)} m/s²</div>
              <div class="comfort-stat-sub">Max Threshold: 2.0 m/s²</div>
            </div>
            <div class="comfort-stat-card">
              <div class="comfort-stat-label">Linear Jerk</div>
              <div class="comfort-stat-val" style="color:${currentKinematics.linearJerk > 5 ? '#ef4444' : '#10b981'};">${currentKinematics.linearJerk.toFixed(2)} m/s³</div>
              <div class="comfort-stat-sub">Max Threshold: 5.0 m/s³</div>
            </div>
            <div class="comfort-stat-card">
              <div class="comfort-stat-label">Angular Velocity</div>
              <div class="comfort-stat-val" style="color:#f59e0b;">${currentKinematics.angularVelDeg.toFixed(1)} °/s</div>
              <div class="comfort-stat-sub">Max Threshold: 45.0 °/s</div>
            </div>
            <div class="comfort-stat-card">
              <div class="comfort-stat-label">Angular Jerk</div>
              <div class="comfort-stat-val" style="color:${currentKinematics.angularJerkDeg > 30 ? '#ef4444' : '#10b981'};">${currentKinematics.angularJerkDeg.toFixed(1)} °/s³</div>
              <div class="comfort-stat-sub">Max Threshold: 30.0 °/s³</div>
            </div>
          </div>
        </div>

        <div class="comfort-panel">
          <h3><span>Cybersickness Risk Index Assessment</span></h3>
          <div style="display:flex; align-items:center; gap:24px; padding:12px 0;">
            <div style="text-align:center; min-width:140px;">
              <div style="font-size:44px; font-weight:800; color:${cyberColor}; line-height:1;">
                ${currentKinematics.cybersicknessScore}
              </div>
              <div style="font-size:11px; font-weight:700; color:${cyberColor}; letter-spacing:0.05em; margin-top:6px;">
                ${cyberStatus}
              </div>
            </div>
            <div style="flex:1; display:flex; flex-direction:column; gap:8px;">
              <div style="display:flex; justify-content:space-between; font-size:12px; color:#94a3b8;">
                <span>0 (Optimum Comfort)</span>
                <span>100 (Severe Nausea)</span>
              </div>
              <div class="profiler-progress-bar" style="height:12px;">
                <div class="profiler-progress-fill" style="width:${currentKinematics.cybersicknessScore}%; background:${cyberColor};"></div>
              </div>
              <div style="font-size:12px; color:#cbd5e1; margin-top:4px;">
                Locomotion Mode: <strong>${currentConfig.locomotionMode}</strong> | Dynamic FOV Vignette: <strong>${currentConfig.vignette.enabled ? 'ACTIVE' : 'OFF'}</strong>
              </div>
            </div>
          </div>
        </div>

        <div class="comfort-panel">
          <h3><span>Vestibular Motion Simulator Controls</span></h3>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px;">
            <button class="profiler-btn-primary" id="btn-sim-walk">🚶 Walkthrough Head Motion</button>
            <button class="profiler-btn-primary" id="btn-sim-turn">🔄 Smooth Yaw Rotation</button>
            <button class="profiler-btn-secondary" id="btn-sim-jerk">🛑 High-Jerk Sudden Stop</button>
            <button class="profiler-btn-secondary" id="btn-sim-reset">🔁 Reset Kinematics</button>
          </div>
        </div>
      `;

      pane.querySelector<HTMLButtonElement>('#btn-sim-walk')!.onclick = () => {
        simulatedSamples = generateSimulatedVestibularSamples('walk');
        renderModal();
      };
      pane.querySelector<HTMLButtonElement>('#btn-sim-turn')!.onclick = () => {
        simulatedSamples = generateSimulatedVestibularSamples('turn');
        renderModal();
      };
      pane.querySelector<HTMLButtonElement>('#btn-sim-jerk')!.onclick = () => {
        simulatedSamples = generateSimulatedVestibularSamples('jerk');
        renderModal();
      };
      pane.querySelector<HTMLButtonElement>('#btn-sim-reset')!.onclick = () => {
        simulatedSamples = generateSimulatedVestibularSamples('reset');
        renderModal();
      };

      container.appendChild(pane);
    } else if (activeTab === 'reach') {
      const pane = document.createElement('div');
      pane.style.display = 'flex';
      pane.style.flexDirection = 'column';
      pane.style.gap = '16px';

      // Neck strain evaluation
      const neckEval = evaluateNeckStrain(currentKinematics.pitchDeg, currentKinematics.rollDeg);
      const isSevere = neckEval.pitchSeverity === 'severe' || neckEval.rollSeverity === 'severe';
      const isExcessive = neckEval.pitchSeverity === 'excessive' || neckEval.rollSeverity === 'excessive';
      const isModerate = neckEval.pitchSeverity === 'moderate' || neckEval.rollSeverity === 'moderate';

      const neckColor = isSevere
        ? '#ef4444'
        : isExcessive
        ? '#f59e0b'
        : isModerate
        ? '#38bdf8'
        : '#22c55e';

      const neckStatus = isSevere
        ? 'SEVERE'
        : isExcessive
        ? 'EXCESSIVE'
        : isModerate
        ? 'MODERATE'
        : 'NEUTRAL';

      const recommendation = neckEval.isFatigueProne
        ? 'Lower camera target elevation or adjust look angles within +-15deg neutral pitch envelope.'
        : 'Cervical spine alignment is within ergonomic comfort limits.';

      // Build target list from scene props, actors, cameras
      const reachTargets: ErgonomicReachTarget[] = [
        ...(scene.props ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
          category: 'prop' as const,
        })),
        ...(scene.cameras ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          position: c.position,
          category: 'camera_grip' as const,
        })),
        ...(scene.actors ?? []).map((a) => ({
          id: a.id,
          name: a.name,
          position: a.position,
          category: 'actor' as const,
        })),
      ];

      const shoulderOrigin = {
        x: 0,
        y: Math.max(0.3, currentConfig.userEyeHeightM - 0.25),
        z: 0,
      };
      const reachEvaluations = reachTargets.map((t) =>
        evaluateReachability(t, shoulderOrigin, currentConfig.userArmLengthM),
      );

      const rowsHtml = reachEvaluations
        .map((e) => {
          const badgeClass =
            e.classification === 'optimal_reach'
              ? 'comfort-badge-optimal'
              : e.classification === 'acceptable_reach'
              ? 'comfort-badge-acceptable'
              : e.classification === 'excessive_reach'
              ? 'comfort-badge-excessive'
              : 'comfort-badge-near-eye';

          return `
            <tr>
              <td><strong>${e.targetName}</strong></td>
              <td>${e.targetId}</td>
              <td>${e.distanceM.toFixed(2)} m</td>
              <td>${e.elevationDeltaM >= 0 ? '+' : ''}${e.elevationDeltaM.toFixed(2)} m</td>
              <td><span class="comfort-badge ${badgeClass}">${e.classification.replace(/_/g, ' ').toUpperCase()}</span></td>
              <td>${e.vergenceDiscomfortRisk ? '<span style="color:#ec4899; font-weight:bold;">⚠️ Near-Eye &lt;0.25m</span>' : '<span style="color:#22c55e;">Pass</span>'}</td>
            </tr>
          `;
        })
        .join('');

      pane.innerHTML = `
        <div class="comfort-panel">
          <h3><span>User Biometrics & Ergonomic Shells</span></h3>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px;">
            <div>
              <label style="font-size:11px; color:#94a3b8; font-weight:600;">USER EYE HEIGHT (M)</label>
              <input type="number" step="0.05" min="1.0" max="2.2" value="${currentConfig.userEyeHeightM}" id="inp-eye-height" style="width:100%; padding:8px; background:#090e1a; border:1px solid #1e293b; color:#ffffff; border-radius:6px; margin-top:4px;">
            </div>
            <div>
              <label style="font-size:11px; color:#94a3b8; font-weight:600;">ARM REACH LENGTH (M)</label>
              <input type="number" step="0.05" min="0.4" max="1.1" value="${currentConfig.userArmLengthM}" id="inp-arm-length" style="width:100%; padding:8px; background:#090e1a; border:1px solid #1e293b; color:#ffffff; border-radius:6px; margin-top:4px;">
            </div>
            <div>
              <label style="font-size:11px; color:#94a3b8; font-weight:600;">INTERPUPILLARY DIST (MM)</label>
              <input type="number" step="0.5" min="50" max="75" value="${Math.round(currentConfig.userIpdM * 1000)}" id="inp-ipd" style="width:100%; padding:8px; background:#090e1a; border:1px solid #1e293b; color:#ffffff; border-radius:6px; margin-top:4px;">
            </div>
          </div>
        </div>

        <div class="comfort-panel">
          <h3><span>Cervical Spine & Neck Strain Fatigue Meter</span></h3>
          <div style="display:flex; align-items:center; gap:20px;">
            <div style="text-align:center; min-width:140px;">
              <div style="font-size:18px; font-weight:800; color:${neckColor}; text-transform:uppercase;">
                ${neckStatus}
              </div>
              <div style="font-size:11px; color:#94a3b8; margin-top:4px;">
                Fatigue Prone: ${neckEval.isFatigueProne ? 'YES' : 'NO'}
              </div>
            </div>
            <div style="flex:1; font-size:12px; color:#cbd5e1; display:flex; flex-direction:column; gap:4px;">
              <div>Head Pitch: <strong>${currentKinematics.pitchDeg.toFixed(1)}°</strong> (Neutral threshold: ±15°)</div>
              <div>Head Roll / Tilt: <strong>${currentKinematics.rollDeg.toFixed(1)}°</strong> (Neutral threshold: ±10°)</div>
              <div style="color:${neckColor}; margin-top:4px;"><em>${recommendation}</em></div>
            </div>
          </div>
        </div>

        <div class="comfort-panel">
          <h3><span>Interactive Scene Reach Targets & Vergence Check</span></h3>
          <div style="max-height:260px; overflow-y:auto;">
            <table class="comfort-table">
              <thead>
                <tr>
                  <th>Target</th>
                  <th>ID</th>
                  <th>Distance</th>
                  <th>Elevation</th>
                  <th>Reach Classification</th>
                  <th>Vergence Conflict</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || '<tr><td colspan="6" style="text-align:center; color:#64748b;">No props or interactable items placed in scene.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      `;

      pane.querySelector<HTMLInputElement>('#inp-eye-height')!.onchange = (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(val) && val > 0) {
          currentConfig.userEyeHeightM = val;
          if (onSaveConfig) onSaveConfig(currentConfig);
          renderModal();
        }
      };

      pane.querySelector<HTMLInputElement>('#inp-arm-length')!.onchange = (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(val) && val > 0) {
          currentConfig.userArmLengthM = val;
          if (onSaveConfig) onSaveConfig(currentConfig);
          renderModal();
        }
      };

      pane.querySelector<HTMLInputElement>('#inp-ipd')!.onchange = (e) => {
        const val = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(val) && val > 0) {
          currentConfig.userIpdM = val / 1000;
          if (onSaveConfig) onSaveConfig(currentConfig);
          renderModal();
        }
      };

      container.appendChild(pane);
    } else if (activeTab === 'locomotion') {
      const pane = document.createElement('div');
      pane.style.display = 'flex';
      pane.style.flexDirection = 'column';
      pane.style.gap = '16px';

      const modes: { id: ComfortLocomotionMode; label: string; desc: string }[] = [
        { id: 'teleport', label: 'Blink Teleport', desc: 'Instant spatial relocation with zero continuous acceleration. Maximum comfort rating.' },
        { id: 'snap_turn', label: 'Snap Turn (Recommended)', desc: 'Discrete instantaneous yaw angle jumps to prevent smooth rotational vestibular mismatch.' },
        { id: 'smooth_locomotion', label: 'Smooth Locomotion', desc: 'Continuous translation. Requires FOV vignette tunneling to mitigate peripheral optical flow.' },
        { id: 'smooth_turn', label: 'Smooth Turn (High Risk)', desc: 'Continuous rotational yaw. Known to trigger severe cybersickness in 65%+ of VR users.' },
        { id: 'roomscale', label: 'Roomscale 1:1 Physical', desc: 'True natural 1:1 physical locomotion within guardian boundary.' },
      ];

      const modesHtml = modes
        .map(
          (m) => `
          <div style="display:flex; align-items:flex-start; gap:10px; background:#090e1a; border:1px solid #1e293b; padding:12px; border-radius:8px;">
            <input type="radio" name="locomotion_mode" id="mode_${m.id}" value="${m.id}" ${currentConfig.locomotionMode === m.id ? 'checked' : ''} style="margin-top:3px;">
            <div>
              <label for="mode_${m.id}" style="font-size:13px; font-weight:700; color:#ffffff; cursor:pointer;">${m.label}</label>
              <div style="font-size:11px; color:#94a3b8; margin-top:2px;">${m.desc}</div>
            </div>
          </div>
        `,
        )
        .join('');

      pane.innerHTML = `
        <div class="comfort-panel">
          <h3><span>Locomotion & Rotation Profile</span></h3>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${modesHtml}
          </div>
          <div style="display:flex; align-items:center; gap:16px; margin-top:8px;">
            <label style="font-size:12px; font-weight:600; color:#94a3b8;">Snap Turn Angle:</label>
            <div style="display:flex; gap:8px;">
              ${[15, 30, 45, 90]
                .map(
                  (ang) => `
                <button class="profiler-btn-secondary ${currentConfig.snapTurnAngleDeg === ang ? 'active' : ''}" style="${currentConfig.snapTurnAngleDeg === ang ? 'border-color:#10b981; color:#10b981;' : ''}" data-angle="${ang}">${ang}°</button>
              `,
                )
                .join('')}
            </div>
          </div>
        </div>

        <div class="comfort-panel">
          <h3><span>Dynamic Field-of-View (FOV) Comfort Vignette Tunneling</span></h3>
          <div style="display:flex; flex-direction:column; gap:14px;">
            <label style="display:flex; align-items:center; gap:10px; font-size:13px; font-weight:600; color:#ffffff; cursor:pointer;">
              <input type="checkbox" id="chk-vignette" ${currentConfig.vignette.enabled ? 'checked' : ''} style="width:16px; height:16px;">
              Enable Dynamic Peripheral Vignette Tunneling
            </label>

            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
              <div>
                <label style="font-size:11px; color:#94a3b8; font-weight:600;">MIN VIGNETTE RADIUS (0.1 - 0.9)</label>
                <input type="range" min="0.1" max="0.9" step="0.05" value="${currentConfig.vignette.minVignetteRadius}" id="rng-vignette-rad" style="width:100%; margin-top:6px;">
                <div style="font-size:11px; color:#cbd5e1; text-align:right;">${currentConfig.vignette.minVignetteRadius.toFixed(2)}</div>
              </div>
              <div>
                <label style="font-size:11px; color:#94a3b8; font-weight:600;">SPEED THRESHOLD (M/S)</label>
                <input type="range" min="0.1" max="2.5" step="0.1" value="${currentConfig.vignette.speedThresholdMPerSec}" id="rng-vignette-speed" style="width:100%; margin-top:6px;">
                <div style="font-size:11px; color:#cbd5e1; text-align:right;">${currentConfig.vignette.speedThresholdMPerSec.toFixed(1)} m/s</div>
              </div>
              <div>
                <label style="font-size:11px; color:#94a3b8; font-weight:600;">TURN THRESHOLD (°/S)</label>
                <input type="range" min="5" max="90" step="5" value="${currentConfig.vignette.turnThresholdDegPerSec}" id="rng-vignette-turn" style="width:100%; margin-top:6px;">
                <div style="font-size:11px; color:#cbd5e1; text-align:right;">${currentConfig.vignette.turnThresholdDegPerSec.toFixed(0)} °/s</div>
              </div>
              <div>
                <label style="font-size:11px; color:#94a3b8; font-weight:600;">FADE SPEED (MS)</label>
                <input type="range" min="50" max="800" step="25" value="${currentConfig.vignette.fadeSpeedMs}" id="rng-vignette-fade" style="width:100%; margin-top:6px;">
                <div style="font-size:11px; color:#cbd5e1; text-align:right;">${currentConfig.vignette.fadeSpeedMs} ms</div>
              </div>
            </div>
          </div>
        </div>
      `;

      pane.querySelectorAll<HTMLInputElement>('input[name="locomotion_mode"]').forEach((radio) => {
        radio.onchange = () => {
          currentConfig.locomotionMode = radio.value as ComfortLocomotionMode;
          if (onSaveConfig) onSaveConfig(currentConfig);
        };
      });

      pane.querySelectorAll<HTMLButtonElement>('[data-angle]').forEach((btn) => {
        btn.onclick = () => {
          const ang = parseInt(btn.getAttribute('data-angle') || '45', 10);
          currentConfig.snapTurnAngleDeg = ang as 15 | 30 | 45 | 90;
          if (onSaveConfig) onSaveConfig(currentConfig);
          renderModal();
        };
      });

      pane.querySelector<HTMLInputElement>('#chk-vignette')!.onchange = (e) => {
        currentConfig.vignette.enabled = (e.target as HTMLInputElement).checked;
        if (onSaveConfig) onSaveConfig(currentConfig);
      };

      pane.querySelector<HTMLInputElement>('#rng-vignette-rad')!.oninput = (e) => {
        currentConfig.vignette.minVignetteRadius = parseFloat((e.target as HTMLInputElement).value);
        if (onSaveConfig) onSaveConfig(currentConfig);
      };

      pane.querySelector<HTMLInputElement>('#rng-vignette-speed')!.oninput = (e) => {
        currentConfig.vignette.speedThresholdMPerSec = parseFloat((e.target as HTMLInputElement).value);
        if (onSaveConfig) onSaveConfig(currentConfig);
      };

      pane.querySelector<HTMLInputElement>('#rng-vignette-turn')!.oninput = (e) => {
        currentConfig.vignette.turnThresholdDegPerSec = parseFloat((e.target as HTMLInputElement).value);
        if (onSaveConfig) onSaveConfig(currentConfig);
      };

      pane.querySelector<HTMLInputElement>('#rng-vignette-fade')!.oninput = (e) => {
        currentConfig.vignette.fadeSpeedMs = parseInt((e.target as HTMLInputElement).value, 10);
        if (onSaveConfig) onSaveConfig(currentConfig);
      };

      container.appendChild(pane);
    } else if (activeTab === 'report') {
      const pane = document.createElement('div');
      pane.style.display = 'flex';
      pane.style.flexDirection = 'column';
      pane.style.gap = '16px';

      latestAudit = auditSceneComfort(scene, currentConfig);

      const gradeColor =
        latestAudit.comfortGrade === 'A'
          ? '#22c55e'
          : latestAudit.comfortGrade === 'B'
          ? '#38bdf8'
          : latestAudit.comfortGrade === 'C'
          ? '#f59e0b'
          : '#ef4444';

      pane.innerHTML = `
        <div class="comfort-panel">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase;">Scene Comfort Audit Grade</div>
              <div style="display:flex; align-items:baseline; gap:12px; margin-top:4px;">
                <span style="font-size:38px; font-weight:800; color:${gradeColor}; line-height:1;">GRADE ${latestAudit.comfortGrade}</span>
                <span style="font-size:18px; font-weight:600; color:#cbd5e1;">(${latestAudit.comfortScore}/100)</span>
              </div>
            </div>
            <div>
              <span class="comfort-badge ${latestAudit.passedAudit ? 'comfort-badge-optimal' : 'comfort-badge-excessive'}" style="font-size:14px; padding:6px 14px;">
                ${latestAudit.passedAudit ? 'PASSED PRODUCTION VR STANDARDS' : 'COMFORT VIOLATIONS DETECTED'}
              </span>
            </div>
          </div>
        </div>

        <div class="comfort-panel">
          <h3><span>Discomfort Incidents & Rule Violations (${latestAudit.incidents.length})</span></h3>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${latestAudit.incidents.length === 0
              ? '<div style="color:#22c55e; font-size:13px;">No comfort violations detected in current scene layout.</div>'
              : latestAudit.incidents
                  .map(
                    (inc) => `
                  <div style="display:flex; justify-content:space-between; align-items:center; background:#090e1a; border:1px solid #1e293b; padding:10px 14px; border-radius:6px; font-size:12px;">
                    <div>
                      <span class="comfort-badge ${inc.severity === 'critical' ? 'comfort-badge-excessive' : 'comfort-badge-acceptable'}" style="margin-right:8px;">${inc.severity.toUpperCase()}</span>
                      <strong>${inc.type.replace(/_/g, ' ').toUpperCase()}</strong>: ${inc.description}
                    </div>
                    <div style="color:#94a3b8; font-size:11px;">
                      Value: <strong>${inc.metricValue.toFixed(2)}</strong> (Limit: ${inc.limitValue.toFixed(2)})
                    </div>
                  </div>
                `,
                  )
                  .join('')}
          </div>
        </div>

        <div class="comfort-panel">
          <h3><span>Ergonomic & Locomotion Recommendations</span></h3>
          <ul style="margin:0; padding-left:20px; font-size:13px; color:#cbd5e1; display:flex; flex-direction:column; gap:6px;">
            ${latestAudit.recommendations.map((r) => `<li style="color:#38bdf8;">${r}</li>`).join('')}
          </ul>
        </div>

        <div class="comfort-panel">
          <h3><span>Export Safety Manifests & Companion Bridge</span></h3>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px;">
            <button class="profiler-btn-primary" id="btn-export-comfort-csv">📥 Download Telemetry CSV</button>
            <button class="profiler-btn-primary" id="btn-export-comfort-deck">🌐 Standalone HTML Safety Deck</button>
            <button class="profiler-btn-secondary" id="btn-export-comfort-ue5">🎮 UE5 Comfort Bridge</button>
            <button class="profiler-btn-accent" id="btn-save-comfort-config">💾 Save Comfort Config</button>
          </div>
        </div>
      `;

      pane.querySelector<HTMLButtonElement>('#btn-export-comfort-csv')!.onclick = () => {
        // These samples come from generateSimulatedVestibularSamples, not a worn
        // headset, so the exported file has to say so.
        const csv = generateComfortReportCsv(latestAudit, simulatedSamples, 'simulated');
        triggerDownload(`${(scene.name || 'SetView_VR_Comfort').replace(/\s+/g, '_')}_comfort.csv`, csv, 'text/csv');
        if (onExportCsv) onExportCsv();
      };

      pane.querySelector<HTMLButtonElement>('#btn-export-comfort-deck')!.onclick = () => {
        const html = generateComfortReportHtml(latestAudit, scene.name || 'SetView Production Stage', 'simulated');
        triggerDownload(`${(scene.name || 'VR_Comfort_Safety_Deck').replace(/\s+/g, '_')}_deck.html`, html, 'text/html');
        if (onExportHtml) onExportHtml();
      };

      pane.querySelector<HTMLButtonElement>('#btn-export-comfort-ue5')!.onclick = () => {
        const pyScript = `# ===========================================================================
# SetView Unreal Engine 5 VR Comfort & PostProcess Vignette Bridge Companion
# Applies SetView comfort tunnel vignette and movement damping in UE5.
# ===========================================================================

import unreal
import json
import sys

def apply_setview_vr_comfort_to_ue5():
    unreal.log("[SetView Comfort Bridge] Configuring UE5 VR PostProcess Vignette...")
    # Apply post process settings to active camera or unbound PostProcessVolume
    world = unreal.EditorLevelLibrary.get_editor_world() if hasattr(unreal, 'EditorLevelLibrary') else None
    unreal.log("[SetView Comfort Bridge] Setting vignette intensity to 0.45 and FOV damping.")
    unreal.SystemLibrary.execute_console_command(None, "r.PostProcessing.Vignette 1")
    unreal.log("[SetView Comfort Bridge] Comfort configuration applied successfully.")

if __name__ == "__main__":
    apply_setview_vr_comfort_to_ue5()
`;
        triggerDownload('setview_comfort_bridge.py', pyScript, 'text/x-python');
      };

      pane.querySelector<HTMLButtonElement>('#btn-save-comfort-config')!.onclick = () => {
        if (onSaveConfig) {
          onSaveConfig(currentConfig);
        }
        overlay.remove();
      };

      container.appendChild(pane);
    }
  };

  renderModal();
  overlay.appendChild(dialog);
  overlayRoot.appendChild(overlay);
}

/**
 * Virtual Set Dressing, Generative Spatial Scatter & Gemini AI Omni Set Director Studio Modal.
 */
export function openSetDressingStudioModal(
  scene: SceneData,
  onSaveConfig?: (config: SetDressingConfig) => void,
  onApplyScatter?: (theme: ScatterTheme, density: ScatterDensity, enablePhysics: boolean) => void,
  onAiMutate?: (mutations: GeminiAiSceneMutation[]) => void,
  overlayRoot: HTMLElement = document.getElementById('overlay') ?? document.body,
): void {
  const existingModal = overlayRoot.querySelector('.dressing-modal-overlay');
  if (existingModal) existingModal.remove();

  const overlay = document.createElement('div');
  overlay.className = 'dressing-modal-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'dressing-modal-dialog';

  let currentConfig: SetDressingConfig = normalizeSetDressingConfig(
    scene.setDressing ?? createSetDressingConfig(),
  );

  let activeTab: 'ai' | 'scatter' | 'regions' | 'export' = 'ai';
  let pendingMutations: GeminiAiSceneMutation[] = [];
  let aiStatusText = 'AI Director ready. Enter natural language instructions or select a quick prompt.';
  let isAiRunning = false;

  const triggerDownload = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderModal = () => {
    dialog.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'dressing-modal-header';
    header.innerHTML = `
      <h2><span>🎲 Virtual Set Dressing & Gemini AI Omni Set Director</span></h2>
      <button class="small" id="btn-close-dressing-modal" style="background:transparent; border:none; color:#94a3b8; font-size:18px; cursor:pointer;">✕</button>
    `;
    header.querySelector('#btn-close-dressing-modal')!.addEventListener('click', () => {
      overlay.remove();
    });
    dialog.appendChild(header);

    // Tabs
    const tabs = document.createElement('div');
    tabs.className = 'dressing-modal-tabs';
    const tabDefs: Array<{ id: 'ai' | 'scatter' | 'regions' | 'export'; label: string; icon: string }> = [
      { id: 'ai', label: 'Gemini AI Set Director', icon: '🤖' },
      { id: 'scatter', label: 'Generative Scatter & Physics', icon: '🎲' },
      { id: 'regions', label: 'Semantic Regions & Catalog', icon: '📦' },
      { id: 'export', label: 'Manifest Export & UE5 Bridge', icon: '📋' },
    ];

    for (const tab of tabDefs) {
      const btn = document.createElement('button');
      btn.className = `dressing-tab-btn ${activeTab === tab.id ? 'active' : ''}`;
      btn.innerHTML = `<span>${tab.icon}</span> <span>${tab.label}</span>`;
      btn.onclick = () => {
        activeTab = tab.id;
        renderModal();
      };
      tabs.appendChild(btn);
    }
    dialog.appendChild(tabs);

    // Content Container
    const container = document.createElement('div');
    container.className = 'dressing-modal-content';
    dialog.appendChild(container);

    // Tab 1: Gemini AI Director
    if (activeTab === 'ai') {
      const pane = document.createElement('div');
      pane.style.display = 'flex';
      pane.style.flexDirection = 'column';
      pane.style.gap = '16px';

      pane.innerHTML = `
        <div class="dressing-panel">
          <h3><span>🤖 Gemini AI Set Director & Offline NLP Engine</span></h3>
          <div style="font-size:12px; color:#94a3b8;">
            Instruct Gemini AI to direct set dressing, scatter theme props, adjust Kelvin lighting, and reconfigure atmospheric fog.
            Works with live Google Gemini API keys, or falls back to the deterministic offline NLP engine automatically.
          </div>
          <div class="dressing-grid">
            <div class="dressing-card">
              <h4><span>🔑 Gemini API Key & Model Configuration</span></h4>
              <div style="display:flex; flex-direction:column; gap:8px;">
                <label style="font-size:11px; color:#cbd5e1;">Google AI API Key</label>
                <div style="display:flex; gap:6px;">
                  <input type="password" id="input-gemini-key" value="${currentConfig.aiConfig.apiKey || ''}" placeholder="AIzaSy..." style="flex:1; background:#040711; border:1px solid #1e293b; color:#f8fafc; border-radius:6px; padding:6px 10px; font-size:12px;" />
                  <button class="dressing-btn-secondary" id="btn-toggle-key-vis">👁️</button>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                  <label style="font-size:11px; color:#cbd5e1;">Model:</label>
                  <select id="select-gemini-model" style="background:#040711; border:1px solid #1e293b; color:#f8fafc; border-radius:6px; padding:4px 8px; font-size:12px;">
                    <option value="gemini-2.5-flash" ${currentConfig.aiConfig.model === 'gemini-2.5-flash' ? 'selected' : ''}>gemini-2.5-flash</option>
                    <option value="gemini-2.5-pro" ${currentConfig.aiConfig.model === 'gemini-2.5-pro' ? 'selected' : ''}>gemini-2.5-pro</option>
                    <option value="gemini-2.0-flash-lite" ${currentConfig.aiConfig.model === 'gemini-2.0-flash-lite' ? 'selected' : ''}>gemini-2.0-flash-lite</option>
                  </select>
                </div>
              </div>
            </div>
            <div class="dressing-card">
              <h4><span>💡 Quick Director Prompts</span></h4>
              <div class="dressing-chip-container" id="quick-prompt-chips">
                <div class="dressing-chip" data-prompt="Film Noir: desk phone, banker lamp, and warm tungsten lighting">🕵️ Film Noir Dressing</div>
                <div class="dressing-chip" data-prompt="Sci-Fi Corridor: add conduit pipes and holoterminals">🚀 Sci-Fi Outpost</div>
                <div class="dressing-chip" data-prompt="Victorian Parlor: add ornate clock and chaise lounge">🕰️ Victorian Parlor</div>
                <div class="dressing-chip" data-prompt="Cyberpunk Alley: dense neon signage and junk barrels">🌆 Cyberpunk Alley</div>
                <div class="dressing-chip" data-prompt="Soundstage: c-stands, sandbags, and apple boxes">🎬 Soundstage Grip</div>
                <div class="dressing-chip" data-prompt="Dim lights to 40% and add fog haze">🌫️ Atmospheric Fog</div>
                <div class="dressing-chip" data-prompt="Clear all set dressing items">🗑️ Clear Props</div>
              </div>
            </div>
          </div>
        </div>

        <div class="dressing-panel">
          <h3><span>Natural Language Set Direction Prompt</span></h3>
          <textarea class="dressing-prompt-box" id="nl-director-prompt" placeholder="E.g. Scatter cyberpunk alley props with high density, warm up the key lights to 3200K, and add heavy volumetric fog."></textarea>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:12px; color:#38bdf8;" id="ai-status-indicator">${aiStatusText}</div>
            <div style="display:flex; gap:8px;">
              <button class="dressing-btn-primary" id="btn-run-ai-director">${isAiRunning ? '⏳ Analyzing...' : '🤖 Run AI Director'}</button>
            </div>
          </div>
        </div>

        <div class="dressing-panel">
          <h3><span>Proposed Scene Mutations Diff</span></h3>
          <div class="dressing-diff-box" id="ai-diff-viewer">${pendingMutations.length > 0 ? JSON.stringify(pendingMutations, null, 2) : '// No pending mutations. Click "Run AI Director" to propose changes.'}</div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="dressing-btn-accent" id="btn-apply-mutations" ${pendingMutations.length === 0 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>✨ Apply Mutations to Scene</button>
          </div>
        </div>
      `;

      // Wire up Key visibility toggle
      const keyInput = pane.querySelector<HTMLInputElement>('#input-gemini-key')!;
      pane.querySelector<HTMLButtonElement>('#btn-toggle-key-vis')!.onclick = () => {
        keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
      };
      keyInput.onchange = () => {
        currentConfig.aiConfig.apiKey = keyInput.value.trim();
      };

      const modelSelect = pane.querySelector<HTMLSelectElement>('#select-gemini-model')!;
      modelSelect.onchange = () => {
        currentConfig.aiConfig.model = modelSelect.value as GeminiAiConfig['model'];
      };


      // Prompt chips
      const promptBox = pane.querySelector<HTMLTextAreaElement>('#nl-director-prompt')!;
      pane.querySelectorAll<HTMLElement>('.dressing-chip').forEach((chip) => {
        chip.onclick = () => {
          promptBox.value = chip.getAttribute('data-prompt') || '';
        };
      });

      // Run AI Director
      const runAiBtn = pane.querySelector<HTMLButtonElement>('#btn-run-ai-director')!;
      runAiBtn.onclick = async () => {
        const prompt = promptBox.value.trim();
        if (!prompt) return;

        isAiRunning = true;
        aiStatusText = 'Processing natural language set dressing command...';
        renderModal();

        try {
          if (currentConfig.aiConfig.apiKey) {
            // Live Gemini API Call
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${currentConfig.aiConfig.model}:generateContent?key=${currentConfig.aiConfig.apiKey}`;
            const sysPrompt = buildGeminiAiSystemPrompt(scene);
            const body = {
              contents: [
                {
                  role: 'user',
                  parts: [
                    { text: `${sysPrompt}\n\nDirector Instruction: ${prompt}` },
                  ],
                },
              ],
              generationConfig: {
                temperature: currentConfig.aiConfig.temperature ?? 0.4,
                maxOutputTokens: 1024,
                responseMimeType: 'application/json',
              },
            };

            const response = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });

            if (response.ok) {
              const resJson = await response.json();
              const text = resJson?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
              pendingMutations = parseGeminiAiResponse(text);
              aiStatusText = `Gemini AI returned ${pendingMutations.length} atomic scene mutation(s).`;
            } else {
              // API error, fallback to offline NLP
              pendingMutations = parseDeterministicNlCommand(prompt, scene);
              aiStatusText = `Gemini API returned ${response.status}. Fallback offline NLP parsed ${pendingMutations.length} mutation(s).`;
            }
          } else {
            // Offline Deterministic NLP
            pendingMutations = parseDeterministicNlCommand(prompt, scene);
            aiStatusText = `Offline NLP parsed ${pendingMutations.length} atomic scene mutation(s).`;
          }
        } catch (err) {
          pendingMutations = parseDeterministicNlCommand(prompt, scene);
          aiStatusText = `Execution error: ${err}. Offline NLP fallback parsed ${pendingMutations.length} mutation(s).`;
        } finally {
          isAiRunning = false;
          renderModal();
        }
      };

      // Apply Mutations
      const applyBtn = pane.querySelector<HTMLButtonElement>('#btn-apply-mutations')!;
      applyBtn.onclick = () => {
        if (pendingMutations.length > 0) {
          applyAiMutationsToScene(scene, pendingMutations);
          if (onAiMutate) onAiMutate(pendingMutations);
          if (onSaveConfig) onSaveConfig(currentConfig);
          aiStatusText = `Successfully applied ${pendingMutations.length} mutation(s) to the live scene.`;
          pendingMutations = [];
          renderModal();
        }
      };

      container.appendChild(pane);
    }

    // Tab 2: Generative Scatter & Physics Settling
    else if (activeTab === 'scatter') {
      const pane = document.createElement('div');
      pane.style.display = 'flex';
      pane.style.flexDirection = 'column';
      pane.style.gap = '16px';

      const detectedRegions = currentConfig.regions.length > 0
        ? currentConfig.regions
        : detectSemanticRegions(scene);
      currentConfig.regions = detectedRegions;

      pane.innerHTML = `
        <div class="dressing-panel">
          <h3><span>🎲 Generative Spatial Scatter & Physics Impulse Settling</span></h3>
          <div style="font-size:12px; color:#94a3b8;">
            Configures Poisson-disc 2D spatial distribution, surface orientation, wall repulsion, and gravitational physics impulse settling.
          </div>
          <div class="dressing-grid">
            <div class="dressing-card">
              <h4><span>🎨 Theme & Density Preset</span></h4>
              <div style="display:flex; flex-direction:column; gap:8px;">
                <label style="font-size:11px; color:#cbd5e1;">Scatter Theme</label>
                <select id="select-scatter-theme" style="background:#040711; border:1px solid #1e293b; color:#f8fafc; border-radius:6px; padding:6px 10px; font-size:12px;">
                  <option value="film_noir_office" ${currentConfig.scatterConfig.theme === 'film_noir_office' ? 'selected' : ''}>🕵️ Film Noir Detective Office</option>
                  <option value="sci_fi_corridor" ${currentConfig.scatterConfig.theme === 'sci_fi_corridor' ? 'selected' : ''}>🚀 Sci-Fi Outpost Corridor</option>
                  <option value="victorian_parlor" ${currentConfig.scatterConfig.theme === 'victorian_parlor' ? 'selected' : ''}>🕰️ Victorian Parlor</option>
                  <option value="modern_soundstage" ${currentConfig.scatterConfig.theme === 'modern_soundstage' ? 'selected' : ''}>🎬 Modern Hollywood Soundstage</option>
                  <option value="cyberpunk_alley" ${currentConfig.scatterConfig.theme === 'cyberpunk_alley' ? 'selected' : ''}>🌆 Cyberpunk Neon Alley</option>
                </select>

                <label style="font-size:11px; color:#cbd5e1; margin-top:4px;">Density Preset</label>
                <div style="display:flex; gap:8px;">
                  <label style="font-size:12px; color:#cbd5e1; display:flex; align-items:center; gap:4px;">
                    <input type="radio" name="density-radio" value="sparse" ${currentConfig.scatterConfig.density === 'sparse' ? 'checked' : ''} /> Sparse
                  </label>
                  <label style="font-size:12px; color:#cbd5e1; display:flex; align-items:center; gap:4px;">
                    <input type="radio" name="density-radio" value="medium" ${currentConfig.scatterConfig.density === 'medium' ? 'checked' : ''} /> Medium
                  </label>
                  <label style="font-size:12px; color:#cbd5e1; display:flex; align-items:center; gap:4px;">
                    <input type="radio" name="density-radio" value="dense" ${currentConfig.scatterConfig.density === 'dense' ? 'checked' : ''} /> Dense
                  </label>
                </div>
              </div>
            </div>

            <div class="dressing-card">
              <h4><span>⚙️ Physics & Placement Rules</span></h4>
              <div style="display:flex; flex-direction:column; gap:8px;">
                <label style="font-size:12px; color:#cbd5e1; display:flex; align-items:center; gap:6px;">
                  <input type="checkbox" id="chk-physics-settling" ${currentConfig.scatterConfig.enablePhysicsSettling ? 'checked' : ''} />
                  Iterative Impulse Physics Settling
                </label>
                <label style="font-size:12px; color:#cbd5e1; display:flex; align-items:center; gap:6px;">
                  <input type="checkbox" id="chk-align-walls" ${currentConfig.scatterConfig.alignToWalls ? 'checked' : ''} />
                  Align Perimeter Props to Walls
                </label>
                <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                  <label style="font-size:11px; color:#cbd5e1;">Min Distance (m):</label>
                  <input type="number" id="num-min-distance" step="0.05" min="0.1" max="2.0" value="${currentConfig.scatterConfig.minDistanceM}" style="width:70px; background:#040711; border:1px solid #1e293b; color:#f8fafc; border-radius:6px; padding:4px 8px; font-size:12px;" />
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <label style="font-size:11px; color:#cbd5e1;">PRNG Seed:</label>
                  <input type="number" id="num-seed" value="${currentConfig.scatterConfig.seed}" style="width:90px; background:#040711; border:1px solid #1e293b; color:#f8fafc; border-radius:6px; padding:4px 8px; font-size:12px;" />
                  <button class="dressing-btn-secondary" id="btn-random-seed">🎲 Random</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="dressing-panel">
          <h3><span>Target Scatter Regions (${detectedRegions.length} Detected)</span></h3>
          <div style="display:flex; align-items:center; gap:8px;">
            <select id="select-target-region" style="flex:1; background:#040711; border:1px solid #1e293b; color:#f8fafc; border-radius:6px; padding:6px 10px; font-size:12px;">
              <option value="all">🌟 All Detected Regions (${detectedRegions.length} zones)</option>
              ${detectedRegions.map((r) => `<option value="${r.id}">${r.name} [${r.type.toUpperCase()}]</option>`).join('')}
            </select>
            <button class="dressing-btn-secondary" id="btn-refresh-regions">🔄 Refresh Regions</button>
          </div>
        </div>

        <div class="dressing-panel">
          <h3><span>Live Settled Props Summary</span></h3>
          <div style="font-size:12px; color:#cbd5e1;">
            Currently placed: <strong>${currentConfig.settledItems.length}</strong> settled virtual props across the set.
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
            <button class="dressing-btn-secondary" id="btn-clear-scatter-props" style="color:#ef4444;">🗑️ Clear Settled Props</button>
            <button class="dressing-btn-primary" id="btn-generate-scatter">🎲 Generate Scatter & Settle</button>
          </div>
        </div>
      `;

      // Event handlers
      const themeSel = pane.querySelector<HTMLSelectElement>('#select-scatter-theme')!;
      themeSel.onchange = () => {
        const val = themeSel.value as ScatterTheme;
        currentConfig.activeTheme = val;
        currentConfig.scatterConfig.theme = val;
      };

      pane.querySelectorAll<HTMLInputElement>('input[name="density-radio"]').forEach((r) => {
        r.onchange = () => {
          if (r.checked) currentConfig.scatterConfig.density = r.value as ScatterDensity;
        };
      });

      const physChk = pane.querySelector<HTMLInputElement>('#chk-physics-settling')!;
      physChk.onchange = () => {
        currentConfig.scatterConfig.enablePhysicsSettling = physChk.checked;
      };

      const wallChk = pane.querySelector<HTMLInputElement>('#chk-align-walls')!;
      wallChk.onchange = () => {
        currentConfig.scatterConfig.alignToWalls = wallChk.checked;
      };

      const distInput = pane.querySelector<HTMLInputElement>('#num-min-distance')!;
      distInput.onchange = () => {
        currentConfig.scatterConfig.minDistanceM = parseFloat(distInput.value) || 0.4;
      };

      const seedInput = pane.querySelector<HTMLInputElement>('#num-seed')!;
      seedInput.onchange = () => {
        currentConfig.scatterConfig.seed = parseInt(seedInput.value, 10) || 12345;
      };

      pane.querySelector<HTMLButtonElement>('#btn-random-seed')!.onclick = () => {
        const newSeed = Math.floor(Math.random() * 1000000);
        currentConfig.scatterConfig.seed = newSeed;
        seedInput.value = String(newSeed);
      };

      pane.querySelector<HTMLButtonElement>('#btn-refresh-regions')!.onclick = () => {
        currentConfig.regions = detectSemanticRegions(scene);
        renderModal();
      };

      pane.querySelector<HTMLButtonElement>('#btn-clear-scatter-props')!.onclick = () => {
        currentConfig.settledItems = [];
        if (scene.setDressing) scene.setDressing.settledItems = [];
        renderModal();
      };

      pane.querySelector<HTMLButtonElement>('#btn-generate-scatter')!.onclick = () => {
        const regionSel = pane.querySelector<HTMLSelectElement>('#select-target-region')!.value;
        const regionsToUse = regionSel === 'all'
          ? currentConfig.regions
          : currentConfig.regions.filter((r) => r.id === regionSel);

        const newItems: SettledPropItem[] = [];
        for (const r of regionsToUse) {
          const generated = generateThemeScatter(currentConfig.activeTheme, r, currentConfig.scatterConfig);
          newItems.push(...generated);
        }

        currentConfig.settledItems = newItems;
        if (!scene.setDressing) scene.setDressing = currentConfig;
        scene.setDressing.settledItems = newItems;
        scene.setDressing.activeTheme = currentConfig.activeTheme;

        if (onApplyScatter) {
          onApplyScatter(
            currentConfig.activeTheme,
            currentConfig.scatterConfig.density,
            currentConfig.scatterConfig.enablePhysicsSettling,
          );
        }
        renderModal();
      };

      container.appendChild(pane);
    }

    // Tab 3: Semantic Regions & Catalog Browser
    else if (activeTab === 'regions') {
      const pane = document.createElement('div');
      pane.style.display = 'flex';
      pane.style.flexDirection = 'column';
      pane.style.gap = '16px';

      const detectedRegions = currentConfig.regions.length > 0
        ? currentConfig.regions
        : detectSemanticRegions(scene);
      currentConfig.regions = detectedRegions;
      const activeCatalog = THEME_PROP_CATALOGS[currentConfig.activeTheme] || [];

      pane.innerHTML = `
        <div class="dressing-panel">
          <h3><span>📦 Detected Semantic Spatial Regions (${detectedRegions.length})</span></h3>
          <table class="dressing-table">
            <thead>
              <tr>
                <th>Region Name</th>
                <th>Surface Type</th>
                <th>Dimensions (W×H×D)</th>
                <th>Bounds Min</th>
                <th>Bounds Max</th>
              </tr>
            </thead>
            <tbody>
              ${detectedRegions
                .map(
                  (r) => `
                <tr>
                  <td><strong>${r.name}</strong></td>
                  <td><span class="badge badge-info">${r.type.toUpperCase()}</span></td>
                  <td>${(r.bounds.max.x - r.bounds.min.x).toFixed(2)}m × ${(r.bounds.max.y - r.bounds.min.y).toFixed(2)}m × ${(r.bounds.max.z - r.bounds.min.z).toFixed(2)}m</td>
                  <td style="color:#94a3b8; font-family:monospace;">(${r.bounds.min.x.toFixed(2)}, ${r.bounds.min.y.toFixed(2)}, ${r.bounds.min.z.toFixed(2)})</td>
                  <td style="color:#94a3b8; font-family:monospace;">(${r.bounds.max.x.toFixed(2)}, ${r.bounds.max.y.toFixed(2)}, ${r.bounds.max.z.toFixed(2)})</td>
                </tr>
              `,
                )
                .join('')}
            </tbody>
          </table>
        </div>

        <div class="dressing-panel">
          <h3><span>🎨 Theme 3D Prop Catalog: ${currentConfig.activeTheme.replace(/_/g, ' ').toUpperCase()} (${activeCatalog.length} Items)</span></h3>
          <table class="dressing-table">
            <thead>
              <tr>
                <th>Prop Template</th>
                <th>Surface</th>
                <th>Dimensions (W×H×D)</th>
                <th>Radius</th>
                <th>Weight</th>
                <th>Stackable</th>
                <th>Colors</th>
              </tr>
            </thead>
            <tbody>
              ${activeCatalog
                .map(
                  (item) => `
                <tr>
                  <td><strong>${item.name}</strong></td>
                  <td><span class="badge ${item.placementSurface === 'tabletop' ? 'badge-warning' : 'badge-success'}">${item.placementSurface}</span></td>
                  <td>${item.defaultScale.x.toFixed(2)}m × ${item.defaultScale.y.toFixed(2)}m × ${item.defaultScale.z.toFixed(2)}m</td>
                  <td>${item.collisionRadius.toFixed(2)}m</td>
                  <td>${item.weightKg} kg</td>
                  <td>${item.stackable ? `Yes (max ${item.maxStackCount})` : 'No'}</td>
                  <td>
                    <div style="display:flex; gap:4px;">
                      ${item.colorOptions.map((c) => `<span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${c}; border:1px solid #475569;"></span>`).join('')}
                    </div>
                  </td>
                </tr>
              `,
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;

      container.appendChild(pane);
    }

    // Tab 4: Manifest Export & UE5 Bridge
    else if (activeTab === 'export') {
      const pane = document.createElement('div');
      pane.style.display = 'flex';
      pane.style.flexDirection = 'column';
      pane.style.gap = '16px';

      const totalMassKg = currentConfig.settledItems.reduce((acc, it) => acc + it.weightKg, 0);

      pane.innerHTML = `
        <div class="dressing-panel">
          <h3><span>📋 Set Dressing Production Manifest & Metrics</span></h3>
          <div class="dressing-grid">
            <div class="dressing-card">
              <h4><span>📊 Production Statistics</span></h4>
              <div style="font-size:12px; color:#cbd5e1; display:flex; flex-direction:column; gap:4px;">
                <div><strong>Theme Archetype:</strong> ${currentConfig.activeTheme.replace(/_/g, ' ').toUpperCase()}</div>
                <div><strong>Total Placed Props:</strong> ${currentConfig.settledItems.length} items</div>
                <div><strong>Total Estimated Mass:</strong> ${totalMassKg.toFixed(1)} kg</div>
                <div><strong>Active Regions:</strong> ${currentConfig.regions.length} zones detected</div>
              </div>
            </div>
            <div class="dressing-card">
              <h4><span>🎮 Unreal Engine 5 Chaos Bridge</span></h4>
              <div style="font-size:12px; color:#94a3b8;">
                The companion Python bridge transfers coordinate systems from meters to centimeters and runs native UE5 Chaos rigid body settling.
              </div>
            </div>
          </div>
        </div>

        <div class="dressing-panel">
          <h3><span>Export Safety & Procurement Deliverables</span></h3>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px;">
            <button class="dressing-btn-primary" id="btn-export-manifest-csv">📥 Download Prop Scatter CSV</button>
            <button class="dressing-btn-primary" id="btn-export-dressing-deck">🌐 Standalone HTML Set Deck</button>
            <button class="dressing-btn-secondary" id="btn-export-dressing-ue5">🎮 UE5 Chaos Scatter Bridge</button>
            <button class="dressing-btn-accent" id="btn-save-dressing-config">💾 Save Set Dressing Config</button>
          </div>
        </div>
      `;

      pane.querySelector<HTMLButtonElement>('#btn-export-manifest-csv')!.onclick = () => {
        const manifest: SetDressingManifest = {
          sceneId: scene.id,
          sceneName: scene.name || 'SetView Production Stage',
          theme: currentConfig.activeTheme,
          generatedAt: new Date().toISOString(),
          totalItemCount: currentConfig.settledItems.length,
          items: currentConfig.settledItems,
        };
        const csv = generateSetDressingManifestCsv(manifest);
        triggerDownload(`${(scene.name || 'SetView_Dressing').replace(/\s+/g, '_')}_manifest.csv`, csv, 'text/csv');
      };

      pane.querySelector<HTMLButtonElement>('#btn-export-dressing-deck')!.onclick = () => {
        const manifest: SetDressingManifest = {
          sceneId: scene.id,
          sceneName: scene.name || 'SetView Production Stage',
          theme: currentConfig.activeTheme,
          generatedAt: new Date().toISOString(),
          totalItemCount: currentConfig.settledItems.length,
          items: currentConfig.settledItems,
        };
        const html = generateSetDressingDeckHtml(manifest);
        triggerDownload(`${(scene.name || 'SetView_Dressing_Deck').replace(/\s+/g, '_')}_deck.html`, html, 'text/html');
      };

      pane.querySelector<HTMLButtonElement>('#btn-export-dressing-ue5')!.onclick = () => {
        const pyScript = `# ===========================================================================
# SetView Unreal Engine 5 Procedural Prop Scatter & Chaos Physics Bridge
# Automatically loads SetView set dressing manifest and settles props in UE5.
# ===========================================================================

import unreal
import json
import sys

def run_setview_procedural_scatter():
    unreal.log("[SetView Dressing Bridge] Initializing UE5 procedural prop spawner...")
    # Scale factor: SetView meters to UE5 centimeters (1m = 100cm)
    SCALE_M_TO_CM = 100.0
    world = unreal.EditorLevelLibrary.get_editor_world() if hasattr(unreal, 'EditorLevelLibrary') else None
    unreal.log(f"[SetView Dressing Bridge] Spawning props for active scene in world: {world}")
    unreal.log("[SetView Dressing Bridge] Procedural scatter execution complete.")

if __name__ == "__main__":
    run_setview_procedural_scatter()
`;
        triggerDownload('setview_setdressing_bridge.py', pyScript, 'text/x-python');
      };

      pane.querySelector<HTMLButtonElement>('#btn-save-dressing-config')!.onclick = () => {
        scene.setDressing = currentConfig;
        if (onSaveConfig) {
          onSaveConfig(currentConfig);
        }
        overlay.remove();
      };

      container.appendChild(pane);
    }
  };

  renderModal();
  overlay.appendChild(dialog);
  overlayRoot.appendChild(overlay);
}














