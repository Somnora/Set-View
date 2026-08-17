// ---------------------------------------------------------------------------
// SetView Automated Dailies & Multi-Camera Animatic Engine
//
// Pure domain module for generating multi-camera animatic sequence plans,
// SMPTE drop-frame / non-drop-frame timecodes, 4-up quad split viewport math,
// and burned-in timecode (BITC) slate metadata.
//
// Architecture rule: ZERO Three.js or DOM imports. 100% pure Node.js compatible.
// ---------------------------------------------------------------------------

import type { AudioCueData, CameraSetupData, SceneData } from './model.ts';
import { buildCameraTimeline, moveStats } from './timeline.ts';

export type DailiesLayoutMode =
  | 'single_cut'
  | 'quad_split'
  | 'picture_in_picture'
  | 'director_slate';

export interface BurnedInTimecodeConfig {
  enabled: boolean;
  startingTimecode: string;
  fps: number;
  dropFrame: boolean;
  showSceneShotTake: boolean;
  showCameraLensData: boolean;
  showWatermark: boolean;
  watermarkText?: string;
  position: 'bottom_center' | 'bottom_left' | 'top_right' | 'top_center';
}

export interface AnimaticRenderOptions {
  resolution: { width: number; height: number };
  fps: number;
  layout: DailiesLayoutMode;
  bitc: BurnedInTimecodeConfig;
  format: 'mp4' | 'webm';
  audioEnabled: boolean;
  qualityMbps: number;
  durationOverrideS?: number;
}

export interface AnimaticCutEvent {
  timestampS: number;
  frameIndex: number;
  cameraId: string;
  cameraName: string;
  shotNumber: number;
  transition: 'cut' | 'dissolve' | 'fade_black';
  focalLengthMm: number;
  tStop: number;
}

export interface AnimaticSequencePlan {
  totalDurationS: number;
  totalFrames: number;
  fps: number;
  cuts: AnimaticCutEvent[];
  layout: DailiesLayoutMode;
  audioCues: AudioCueData[];
}

export interface DailiesSlateData {
  sceneName: string;
  shotNumber: number;
  takeNumber: number;
  cameraName: string;
  focalLengthMm: number;
  tStop: number;
  smpteTimecode: string;
  elapsedS: number;
  frameIndex: number;
  watermark?: string;
}

export interface QuadSplitRect {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  cameraId?: string;
}

export interface ResolutionPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
}

export const DAILIES_RESOLUTION_PRESETS: readonly ResolutionPreset[] = [
  { id: '1080p_24', name: '1080p 24fps Cinema', width: 1920, height: 1080, fps: 24 },
  { id: '1080p_30', name: '1080p 30fps TV', width: 1920, height: 1080, fps: 30 },
  { id: '4k_24', name: '4K UHD 24fps Cinema', width: 3840, height: 2160, fps: 24 },
  { id: '720p_24', name: '720p 24fps Previz', width: 1280, height: 720, fps: 24 },
  { id: '1080p_2997_df', name: '1080p 29.97fps Drop-Frame', width: 1920, height: 1080, fps: 29.97 },
];

export const DEFAULT_DAILIES_FPS = 24;
export const DEFAULT_START_TIMECODE = '01:00:00:00';
export const DEFAULT_BITC_WATERMARK = 'SETVIEW DAILIES PREVIZ';

function pad2(n: number): string {
  return Math.floor(Math.max(0, n)).toString().padStart(2, '0');
}

/**
 * Creates default AnimaticRenderOptions with optional partial overrides. Pure.
 */
export function createDailiesConfig(
  overrides?: Partial<AnimaticRenderOptions>,
): AnimaticRenderOptions {
  const fps = overrides?.fps ?? DEFAULT_DAILIES_FPS;
  const isDrop =
    overrides?.bitc?.dropFrame ??
    (Math.abs(fps - 29.97) < 0.05 || Math.abs(fps - 59.94) < 0.05);

  const defaultBitc: BurnedInTimecodeConfig = {
    enabled: true,
    startingTimecode: DEFAULT_START_TIMECODE,
    fps,
    dropFrame: isDrop,
    showSceneShotTake: true,
    showCameraLensData: true,
    showWatermark: true,
    watermarkText: DEFAULT_BITC_WATERMARK,
    position: 'bottom_center',
  };

  return {
    resolution: {
      width: overrides?.resolution?.width ?? 1920,
      height: overrides?.resolution?.height ?? 1080,
    },
    fps,
    layout: overrides?.layout ?? 'single_cut',
    bitc: {
      ...defaultBitc,
      ...(overrides?.bitc ?? {}),
    },
    format: overrides?.format ?? 'mp4',
    audioEnabled: overrides?.audioEnabled ?? true,
    qualityMbps: overrides?.qualityMbps ?? 8,
    durationOverrideS: overrides?.durationOverrideS,
  };
}

/**
 * Type guard for AnimaticRenderOptions. Pure.
 */
export function isDailiesConfig(raw: unknown): raw is AnimaticRenderOptions {
  if (!raw || typeof raw !== 'object') return false;
  const c = raw as Record<string, unknown>;
  if (!c.resolution || typeof c.resolution !== 'object') return false;
  const res = c.resolution as Record<string, unknown>;
  if (typeof res.width !== 'number' || typeof res.height !== 'number') return false;
  if (typeof c.fps !== 'number' || !Number.isFinite(c.fps) || c.fps <= 0) return false;
  const validLayouts = ['single_cut', 'quad_split', 'picture_in_picture', 'director_slate'];
  if (typeof c.layout !== 'string' || !validLayouts.includes(c.layout)) return false;
  if (!c.bitc || typeof c.bitc !== 'object') return false;
  const bitc = c.bitc as Record<string, unknown>;
  if (typeof bitc.enabled !== 'boolean') return false;
  if (typeof bitc.startingTimecode !== 'string') return false;
  if (typeof bitc.fps !== 'number' || typeof bitc.dropFrame !== 'boolean') return false;
  const validPositions = ['bottom_center', 'bottom_left', 'top_right', 'top_center'];
  if (typeof bitc.position !== 'string' || !validPositions.includes(bitc.position)) return false;
  if (c.format !== 'mp4' && c.format !== 'webm') return false;
  if (typeof c.audioEnabled !== 'boolean') return false;
  if (typeof c.qualityMbps !== 'number' || !Number.isFinite(c.qualityMbps) || c.qualityMbps <= 0) return false;
  return true;
}

/**
 * Normalizes and sanitizes raw dailies configuration input. Pure.
 */
export function normalizeDailiesConfig(raw: unknown): AnimaticRenderOptions {
  if (!raw || typeof raw !== 'object') {
    return createDailiesConfig();
  }
  const c = raw as Partial<AnimaticRenderOptions>;
  const rawRes = c.resolution;
  const width = typeof rawRes?.width === 'number' && Number.isFinite(rawRes.width)
    ? Math.max(320, Math.min(7680, Math.round(rawRes.width)))
    : 1920;
  const height = typeof rawRes?.height === 'number' && Number.isFinite(rawRes.height)
    ? Math.max(240, Math.min(4320, Math.round(rawRes.height)))
    : 1080;

  const fps = typeof c.fps === 'number' && Number.isFinite(c.fps) && c.fps > 0
    ? Math.max(12, Math.min(120, c.fps))
    : DEFAULT_DAILIES_FPS;

  const validLayouts: DailiesLayoutMode[] = ['single_cut', 'quad_split', 'picture_in_picture', 'director_slate'];
  const layout: DailiesLayoutMode = validLayouts.includes(c.layout as DailiesLayoutMode)
    ? (c.layout as DailiesLayoutMode)
    : 'single_cut';

  const rawBitc = c.bitc;
  const validPositions: BurnedInTimecodeConfig['position'][] = [
    'bottom_center',
    'bottom_left',
    'top_right',
    'top_center',
  ];
  const position = validPositions.includes(rawBitc?.position as BurnedInTimecodeConfig['position'])
    ? (rawBitc?.position as BurnedInTimecodeConfig['position'])
    : 'bottom_center';

  const isNtsc = Math.abs(fps - 29.97) < 0.05 || Math.abs(fps - 59.94) < 0.05;
  const dropFrame = typeof rawBitc?.dropFrame === 'boolean' ? rawBitc.dropFrame : isNtsc;

  const bitc: BurnedInTimecodeConfig = {
    enabled: typeof rawBitc?.enabled === 'boolean' ? rawBitc.enabled : true,
    startingTimecode: typeof rawBitc?.startingTimecode === 'string' && rawBitc.startingTimecode.trim()
      ? rawBitc.startingTimecode.trim()
      : DEFAULT_START_TIMECODE,
    fps: typeof rawBitc?.fps === 'number' && Number.isFinite(rawBitc.fps) && rawBitc.fps > 0
      ? rawBitc.fps
      : fps,
    dropFrame,
    showSceneShotTake: typeof rawBitc?.showSceneShotTake === 'boolean' ? rawBitc.showSceneShotTake : true,
    showCameraLensData: typeof rawBitc?.showCameraLensData === 'boolean' ? rawBitc.showCameraLensData : true,
    showWatermark: typeof rawBitc?.showWatermark === 'boolean' ? rawBitc.showWatermark : true,
    watermarkText: typeof rawBitc?.watermarkText === 'string'
      ? rawBitc.watermarkText.slice(0, 100)
      : DEFAULT_BITC_WATERMARK,
    position,
  };

  const format: 'mp4' | 'webm' = c.format === 'webm' ? 'webm' : 'mp4';
  const audioEnabled = typeof c.audioEnabled === 'boolean' ? c.audioEnabled : true;
  const qualityMbps = typeof c.qualityMbps === 'number' && Number.isFinite(c.qualityMbps)
    ? Math.max(1, Math.min(100, c.qualityMbps))
    : 8;

  const durationOverrideS =
    typeof c.durationOverrideS === 'number' && Number.isFinite(c.durationOverrideS) && c.durationOverrideS > 0
      ? Math.max(0.1, Math.min(3600, c.durationOverrideS))
      : undefined;

  return {
    resolution: { width, height },
    fps,
    layout,
    bitc,
    format,
    audioEnabled,
    qualityMbps,
    durationOverrideS,
  };
}

/**
 * Formats a discrete frame index into a standard SMPTE timecode string (HH:MM:SS:FF or HH:MM:SS;FF).
 * Supports standard integer framerates (24, 25, 30, 48, 50, 60 fps) and drop-frame calculation
 * for 29.97 and 59.94 fps SMPTE 12M compliance. Pure.
 */
export function formatSmpteTimecode(
  frameIndex: number,
  fps: number,
  dropFrame = false,
  startOffsetFrames = 0,
): string {
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_DAILIES_FPS;
  const totalFrames = Math.max(0, Math.floor(frameIndex + startOffsetFrames));
  const roundedFps = Math.round(safeFps);

  const is2997 = Math.abs(safeFps - 29.97) < 0.05 || (dropFrame && roundedFps === 30);
  const is5994 = Math.abs(safeFps - 59.94) < 0.05 || (dropFrame && roundedFps === 60);

  if (dropFrame && is2997) {
    // 29.97 drop-frame: drops 2 frames at the start of each minute, except minutes 00, 10, 20, 30, 40, 50
    const dropFrames = 2;
    const framesPerMinute = 1800 - dropFrames; // 1798
    const framesPer10Minutes = 17980 + dropFrames; // 17982

    const d = Math.floor(totalFrames / framesPer10Minutes);
    const m = totalFrames % framesPer10Minutes;

    let adjustedFrames = totalFrames + 18 * d;
    if (m > dropFrames) {
      adjustedFrames += dropFrames * Math.floor((m - dropFrames) / framesPerMinute);
    }

    const ff = adjustedFrames % 30;
    const ss = Math.floor(adjustedFrames / 30) % 60;
    const mm = Math.floor(adjustedFrames / 1800) % 60;
    const hh = Math.floor(adjustedFrames / 108000);

    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)};${pad2(ff)}`;
  }

  if (dropFrame && is5994) {
    // 59.94 drop-frame: drops 4 frames at the start of each minute, except minutes 00, 10, 20, 30, 40, 50
    const dropFrames = 4;
    const framesPerMinute = 3600 - dropFrames; // 3596
    const framesPer10Minutes = 35960 + dropFrames; // 35964

    const d = Math.floor(totalFrames / framesPer10Minutes);
    const m = totalFrames % framesPer10Minutes;

    let adjustedFrames = totalFrames + 36 * d;
    if (m > dropFrames) {
      adjustedFrames += dropFrames * Math.floor((m - dropFrames) / framesPerMinute);
    }

    const ff = adjustedFrames % 60;
    const ss = Math.floor(adjustedFrames / 60) % 60;
    const mm = Math.floor(adjustedFrames / 3600) % 60;
    const hh = Math.floor(adjustedFrames / 216000);

    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)};${pad2(ff)}`;
  }

  // Non-drop frame calculation
  const ff = totalFrames % roundedFps;
  const totalSeconds = Math.floor(totalFrames / roundedFps);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);
  const sep = dropFrame ? ';' : ':';

  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}${sep}${pad2(ff)}`;
}

/**
 * Parses an SMPTE timecode string ("HH:MM:SS:FF" or "HH:MM:SS;FF" or "MM:SS:FF" or "SS:FF")
 * into total discrete frame count. Pure.
 */
export function parseSmpteTimecode(tc: string, fps: number): number {
  if (!tc || typeof tc !== 'string') return 0;
  const clean = tc.trim();
  const isDrop = clean.includes(';');
  const parts = clean.split(/[:;]/).map((p) => parseInt(p, 10));
  if (parts.some((n) => isNaN(n) || n < 0)) return 0;

  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_DAILIES_FPS;
  const roundedFps = Math.round(safeFps);

  let hh = 0;
  let mm = 0;
  let ss = 0;
  let ff = 0;

  if (parts.length === 4) {
    [hh, mm, ss, ff] = parts;
  } else if (parts.length === 3) {
    [mm, ss, ff] = parts;
  } else if (parts.length === 2) {
    [ss, ff] = parts;
  } else if (parts.length === 1) {
    ff = parts[0];
  } else {
    return 0;
  }

  const is2997 = isDrop || Math.abs(safeFps - 29.97) < 0.05;
  const is5994 = isDrop && (Math.abs(safeFps - 59.94) < 0.05 || roundedFps === 60);

  if (isDrop && is2997 && roundedFps === 30) {
    const totalMinutes = hh * 60 + mm;
    const dropAdjust = 2 * (totalMinutes - Math.floor(totalMinutes / 10));
    return hh * 108000 + mm * 1800 + ss * 30 + ff - dropAdjust;
  }

  if (isDrop && is5994 && roundedFps === 60) {
    const totalMinutes = hh * 60 + mm;
    const dropAdjust = 4 * (totalMinutes - Math.floor(totalMinutes / 10));
    return hh * 216000 + mm * 3600 + ss * 60 + ff - dropAdjust;
  }

  const clampedF = Math.min(roundedFps - 1, ff);
  return hh * 3600 * roundedFps + mm * 60 * roundedFps + ss * roundedFps + clampedF;
}

/**
 * Derives a deterministic multi-camera animatic cut sequence plan from scene data.
 * Pure.
 */
export function calculateAnimaticSequencePlan(
  scene: SceneData,
  options?: Partial<AnimaticRenderOptions>,
): AnimaticSequencePlan {
  const fps = options?.fps ?? DEFAULT_DAILIES_FPS;
  const layout = options?.layout ?? 'single_cut';

  let maxActorDurationS = 0;
  if (scene.actors && scene.actors.length > 0) {
    for (const actor of scene.actors) {
      if (actor.keyframes && actor.keyframes.length >= 2) {
        const stats = moveStats(actor.keyframes, scene.walkSpeed);
        if (stats.durationS > maxActorDurationS) {
          maxActorDurationS = stats.durationS;
        }
      }
    }
  }

  const cameras: CameraSetupData[] =
    scene.cameras && scene.cameras.length > 0
      ? scene.cameras
      : [
          {
            id: 'cam-master-fallback',
            name: 'CAM A',
            position: { x: 0, y: 1.6, z: 3 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            lensFocalLength: 35,
            aspect: '2.39:1',
            tStop: 2.8,
            formatId: 'super35',
          },
        ];

  const defaultDurationS = 4.0;
  const rawDurations: number[] = [];

  for (let i = 0; i < cameras.length; i++) {
    const cam = cameras[i];
    let shotDurS = defaultDurationS;

    if (cam.keyframes && cam.keyframes.length >= 2) {
      const tl = buildCameraTimeline(cam.keyframes);
      shotDurS = Math.max(1.0, tl.duration);
    } else if (maxActorDurationS > 0 && cameras.length === 1) {
      shotDurS = maxActorDurationS;
    }
    rawDurations.push(shotDurS);
  }

  const totalRawDurationS = rawDurations.reduce((acc, d) => acc + d, 0);

  // Apply duration override scaling if specified
  const targetTotalDurationS =
    typeof options?.durationOverrideS === 'number' && options.durationOverrideS > 0
      ? options.durationOverrideS
      : totalRawDurationS;

  const durationScale = totalRawDurationS > 0 ? targetTotalDurationS / totalRawDurationS : 1.0;

  const cuts: AnimaticCutEvent[] = [];
  let currentS = 0;
  let currentFrame = 0;

  for (let i = 0; i < cameras.length; i++) {
    const cam = cameras[i];
    const scaledDurationS = rawDurations[i] * durationScale;
    const shotDurationFrames = Math.max(1, Math.round(scaledDurationS * fps));

    cuts.push({
      timestampS: currentS,
      frameIndex: currentFrame,
      cameraId: cam.id,
      cameraName: cam.name,
      shotNumber: i + 1,
      transition: 'cut',
      focalLengthMm: cam.lensFocalLength,
      tStop: cam.tStop,
    });

    currentFrame += shotDurationFrames;
    currentS = currentFrame / fps;
  }

  const totalFrames = currentFrame;
  const totalDurationS = totalFrames / fps;
  const audioCues = scene.audioCues ? [...scene.audioCues] : [];

  return {
    totalDurationS,
    totalFrames,
    fps,
    cuts,
    layout,
    audioCues,
  };
}

/**
 * Calculates 4-up quad split viewport rectangles for offscreen rendering and composite display.
 * Pure.
 */
export function calculateQuadSplitViewports(
  canvasWidth: number,
  canvasHeight: number,
): Record<'director' | 'camA' | 'camB' | 'topDown', QuadSplitRect> {
  const safeW = Math.max(2, Math.floor(canvasWidth));
  const safeH = Math.max(2, Math.floor(canvasHeight));

  const halfW = Math.floor(safeW / 2);
  const halfH = Math.floor(safeH / 2);
  const remW = safeW - halfW;
  const remH = safeH - halfH;

  return {
    director: {
      x: 0,
      y: 0,
      width: halfW,
      height: halfH,
      label: 'PROGRAM / DIRECTOR CUT',
    },
    camA: {
      x: halfW,
      y: 0,
      width: remW,
      height: halfH,
      label: 'CAMERA A',
    },
    camB: {
      x: 0,
      y: halfH,
      width: halfW,
      height: remH,
      label: 'CAMERA B',
    },
    topDown: {
      x: halfW,
      y: halfH,
      width: remW,
      height: remH,
      label: 'TOP-DOWN FLOORPLAN',
    },
  };
}

/**
 * Generates frame-accurate slate and burned-in timecode metadata for a specific frame index.
 * Pure.
 */
export function generateDailiesSlateData(
  frameIndex: number,
  plan: AnimaticSequencePlan,
  scene: SceneData,
  config: BurnedInTimecodeConfig,
): DailiesSlateData {
  const clampedFrame = Math.max(0, Math.min(plan.totalFrames - 1, Math.floor(frameIndex)));
  const fps = plan.fps > 0 ? plan.fps : DEFAULT_DAILIES_FPS;
  const elapsedS = clampedFrame / fps;

  // Find active cut at this frame
  let activeCut = plan.cuts[0];
  for (let i = plan.cuts.length - 1; i >= 0; i--) {
    if (clampedFrame >= plan.cuts[i].frameIndex) {
      activeCut = plan.cuts[i];
      break;
    }
  }

  const startOffsetFrames = parseSmpteTimecode(config.startingTimecode, fps);
  const smpteTimecode = formatSmpteTimecode(clampedFrame, fps, config.dropFrame, startOffsetFrames);

  const watermark = config.showWatermark
    ? (config.watermarkText?.trim() || DEFAULT_BITC_WATERMARK)
    : undefined;

  return {
    sceneName: scene.name || 'Scene 1',
    shotNumber: activeCut.shotNumber,
    takeNumber: 1,
    cameraName: activeCut.cameraName,
    focalLengthMm: activeCut.focalLengthMm,
    tStop: activeCut.tStop,
    smpteTimecode,
    elapsedS,
    frameIndex: clampedFrame,
    watermark,
  };
}
