// ---------------------------------------------------------------------------
// SetView In-Camera VFX (ICVFX) Pure Domain Engine
// Pure domain module for LED Volume Stage Calibration, Moiré Risk Analysis,
// Dynamic Inner Frustum Intersections, nDisplay XML & OpenUSD Stage Generation.
//
// Architecture rule: ZERO Three.js or DOM imports so this module runs
// seamlessly in pure Node.js unit tests and headless worker runtimes.
// ---------------------------------------------------------------------------

export type LedPanelType =
  | 'curved_perimeter'
  | 'flat_wall'
  | 'ceiling_canopy'
  | 'wild_wall'
  | 'floor_panel';

export type LedVolumePresetId =
  | 'mega_360'
  | 'horseshoe_270'
  | 'commercial_180'
  | 'flat_backdrop'
  | 'cube_studio';

export type MoireRiskLevel = 'safe' | 'low_risk' | 'high_risk' | 'severe_moire';

export interface LedVolumeWall {
  id: string;
  name: string;
  type: LedPanelType;
  radiusM: number;
  arcAngleDeg: number;
  heightM: number;
  widthM: number;
  center: { x: number; y: number; z: number };
  rotationY: number;
  pixelPitchMm: number;
  brightnessNits: number;
  colorTempKelvin: number;
  nDisplayNodeId?: string;
  enabled: boolean;
}

export interface LedVolumeConfig {
  enabled: boolean;
  stageName: string;
  walls: LedVolumeWall[];
  lutProfile: 'rec709' | 'acescc' | 'srgb' | 'dci_p3';
  targetWhitePoint: 'd55' | 'd60' | 'd65';
  cameraOverscanPercent: number;
  latchedCameraId?: string;
}

export interface MoireAnalysisResult {
  riskLevel: MoireRiskLevel;
  nyquistFrequencyRatio: number;
  sensorNyquistLpMm: number;
  projectedPitchLpMm: number;
  pixelPitchMm: number;
  cameraDistanceM: number;
  focalLengthMm: number;
  sensorWidthMm: number;
  minSafeDistanceM: number;
  recommendedFocusDistanceM?: number;
  message: string;
}

export interface InnerFrustumBounds {
  corners: { x: number; y: number; z: number }[];
  activeWalls: string[];
  surfaceAreaSqm: number;
  overscanFactor: number;
}

// --- Curated Stock LED Volumes ----------------------------------------------

export const STOCK_LED_VOLUMES: Record<LedVolumePresetId, { name: string; description: string; config: LedVolumeConfig }> = {
  mega_360: {
    name: 'Mega Volume 360° Stage',
    description: '24m diameter full-surround 360° volume with motorized overhead ceiling canopy for feature film production.',
    config: {
      enabled: true,
      stageName: 'Mega Volume 360 Stage',
      lutProfile: 'acescc',
      targetWhitePoint: 'd65',
      cameraOverscanPercent: 15,
      walls: [
        {
          id: 'wall_mega_360_curve',
          name: 'Main Perimeter 360° Wall',
          type: 'curved_perimeter',
          radiusM: 12.0,
          arcAngleDeg: 360.0,
          heightM: 7.0,
          widthM: +(2 * Math.PI * 12.0).toFixed(2),
          center: { x: 0, y: 3.5, z: 0 },
          rotationY: 0,
          pixelPitchMm: 1.95,
          brightnessNits: 1500,
          colorTempKelvin: 6500,
          nDisplayNodeId: 'node_mega_curve_01',
          enabled: true,
        },
        {
          id: 'wall_mega_360_ceiling',
          name: 'Overhead Ceiling Canopy',
          type: 'ceiling_canopy',
          radiusM: 12.0,
          arcAngleDeg: 360.0,
          heightM: 0.2,
          widthM: 24.0,
          center: { x: 0, y: 7.0, z: 0 },
          rotationY: 0,
          pixelPitchMm: 3.9,
          brightnessNits: 5000,
          colorTempKelvin: 6500,
          nDisplayNodeId: 'node_ceiling_01',
          enabled: true,
        },
      ],
    },
  },

  horseshoe_270: {
    name: 'Horseshoe 270° Volume',
    description: '18m diameter 270° horseshoe wrap with 2 mobile wild walls for driving sequences and episodic television.',
    config: {
      enabled: true,
      stageName: 'Horseshoe 270 Volume Stage',
      lutProfile: 'acescc',
      targetWhitePoint: 'd65',
      cameraOverscanPercent: 10,
      walls: [
        {
          id: 'wall_horse_270_main',
          name: 'Horseshoe 270° Curve',
          type: 'curved_perimeter',
          radiusM: 9.0,
          arcAngleDeg: 270.0,
          heightM: 6.0,
          widthM: +(2 * Math.PI * 9.0 * (270 / 360)).toFixed(2),
          center: { x: 0, y: 3.0, z: 0 },
          rotationY: 0,
          pixelPitchMm: 2.3,
          brightnessNits: 1200,
          colorTempKelvin: 6500,
          nDisplayNodeId: 'node_horseshoe_main',
          enabled: true,
        },
        {
          id: 'wall_horse_wild_left',
          name: 'Mobile Wild Wall Left',
          type: 'wild_wall',
          radiusM: 0,
          arcAngleDeg: 0,
          heightM: 4.5,
          widthM: 4.0,
          center: { x: -6.0, y: 2.25, z: 6.0 },
          rotationY: -0.5236,
          pixelPitchMm: 2.3,
          brightnessNits: 1200,
          colorTempKelvin: 6500,
          nDisplayNodeId: 'node_wild_left',
          enabled: true,
        },
        {
          id: 'wall_horse_wild_right',
          name: 'Mobile Wild Wall Right',
          type: 'wild_wall',
          radiusM: 0,
          arcAngleDeg: 0,
          heightM: 4.5,
          widthM: 4.0,
          center: { x: 6.0, y: 2.25, z: 6.0 },
          rotationY: 0.5236,
          pixelPitchMm: 2.3,
          brightnessNits: 1200,
          colorTempKelvin: 6500,
          nDisplayNodeId: 'node_wild_right',
          enabled: true,
        },
      ],
    },
  },

  commercial_180: {
    name: 'Commercial Studio 180° Curved',
    description: '10m diameter 180° curved stage tailored for automotive, product commercials, and tabletop shoots.',
    config: {
      enabled: true,
      stageName: 'Commercial Studio 180 Stage',
      lutProfile: 'rec709',
      targetWhitePoint: 'd60',
      cameraOverscanPercent: 10,
      walls: [
        {
          id: 'wall_comm_180_curve',
          name: 'Commercial 180° Curved Wall',
          type: 'curved_perimeter',
          radiusM: 5.0,
          arcAngleDeg: 180.0,
          heightM: 4.5,
          widthM: +(Math.PI * 5.0).toFixed(2),
          center: { x: 0, y: 2.25, z: 0 },
          rotationY: 0,
          pixelPitchMm: 2.84,
          brightnessNits: 1000,
          colorTempKelvin: 6000,
          nDisplayNodeId: 'node_comm_curve',
          enabled: true,
        },
      ],
    },
  },

  flat_backdrop: {
    name: 'Flat Backdrop Wall',
    description: '12m x 4.5m ultra fine-pitch flat backdrop wall ideal for virtual broadcast studios and corporate stages.',
    config: {
      enabled: true,
      stageName: 'Broadcast Flat Backdrop Stage',
      lutProfile: 'srgb',
      targetWhitePoint: 'd65',
      cameraOverscanPercent: 10,
      walls: [
        {
          id: 'wall_flat_backdrop',
          name: 'Primary Flat LED Wall',
          type: 'flat_wall',
          radiusM: 0,
          arcAngleDeg: 0,
          heightM: 4.5,
          widthM: 12.0,
          center: { x: 0, y: 2.25, z: -4.0 },
          rotationY: 0,
          pixelPitchMm: 1.95,
          brightnessNits: 1200,
          colorTempKelvin: 5600,
          nDisplayNodeId: 'node_backdrop_main',
          enabled: true,
        },
      ],
    },
  },

  cube_studio: {
    name: 'Cube Soundstage',
    description: '10m x 10m soundstage enclosed on 3 sides with overhead ceiling canopy for 3D environment immersiveness.',
    config: {
      enabled: true,
      stageName: 'Cube Soundstage',
      lutProfile: 'acescc',
      targetWhitePoint: 'd65',
      cameraOverscanPercent: 12,
      walls: [
        {
          id: 'wall_cube_back',
          name: 'Cube Back Wall',
          type: 'flat_wall',
          radiusM: 0,
          arcAngleDeg: 0,
          heightM: 4.0,
          widthM: 10.0,
          center: { x: 0, y: 2.0, z: -5.0 },
          rotationY: 0,
          pixelPitchMm: 2.6,
          brightnessNits: 1200,
          colorTempKelvin: 6500,
          nDisplayNodeId: 'node_cube_back',
          enabled: true,
        },
        {
          id: 'wall_cube_left',
          name: 'Cube Left Wall',
          type: 'flat_wall',
          radiusM: 0,
          arcAngleDeg: 0,
          heightM: 4.0,
          widthM: 10.0,
          center: { x: -5.0, y: 2.0, z: 0 },
          rotationY: Math.PI / 2,
          pixelPitchMm: 2.6,
          brightnessNits: 1200,
          colorTempKelvin: 6500,
          nDisplayNodeId: 'node_cube_left',
          enabled: true,
        },
        {
          id: 'wall_cube_right',
          name: 'Cube Right Wall',
          type: 'flat_wall',
          radiusM: 0,
          arcAngleDeg: 0,
          heightM: 4.0,
          widthM: 10.0,
          center: { x: 5.0, y: 2.0, z: 0 },
          rotationY: -Math.PI / 2,
          pixelPitchMm: 2.6,
          brightnessNits: 1200,
          colorTempKelvin: 6500,
          nDisplayNodeId: 'node_cube_right',
          enabled: true,
        },
        {
          id: 'wall_cube_ceiling',
          name: 'Cube Ceiling Canopy',
          type: 'ceiling_canopy',
          radiusM: 0,
          arcAngleDeg: 0,
          heightM: 0.1,
          widthM: 10.0,
          center: { x: 0, y: 4.0, z: 0 },
          rotationY: 0,
          pixelPitchMm: 3.9,
          brightnessNits: 3500,
          colorTempKelvin: 6500,
          nDisplayNodeId: 'node_cube_ceiling',
          enabled: true,
        },
      ],
    },
  },
};

// --- Helper UID Generator ---------------------------------------------------

function generateIcvfxId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// --- Factories, Type Guards & Normalizers -----------------------------------

export function createLedVolumeWall(overrides?: Partial<LedVolumeWall>): LedVolumeWall {
  const isCurved = overrides?.type === 'curved_perimeter' || overrides?.radiusM !== undefined && (overrides.radiusM ?? 0) > 0;
  const radiusM = overrides?.radiusM ?? (isCurved ? 9.0 : 0);
  const arcAngleDeg = overrides?.arcAngleDeg ?? (isCurved ? 270.0 : 0);
  const widthM = overrides?.widthM ?? (isCurved ? +(2 * Math.PI * radiusM * (arcAngleDeg / 360.0)).toFixed(2) : 10.0);

  return {
    id: overrides?.id ?? generateIcvfxId('wall'),
    name: overrides?.name ?? (isCurved ? 'Curved Perimeter Wall' : 'LED Wall Panel'),
    type: overrides?.type ?? (isCurved ? 'curved_perimeter' : 'flat_wall'),
    radiusM,
    arcAngleDeg,
    heightM: overrides?.heightM ?? 5.0,
    widthM,
    center: {
      x: overrides?.center?.x ?? 0,
      y: overrides?.center?.y ?? 2.5,
      z: overrides?.center?.z ?? 0,
    },
    rotationY: overrides?.rotationY ?? 0,
    pixelPitchMm: overrides?.pixelPitchMm ?? 2.3,
    brightnessNits: overrides?.brightnessNits ?? 1200,
    colorTempKelvin: overrides?.colorTempKelvin ?? 6500,
    nDisplayNodeId: overrides?.nDisplayNodeId ?? 'node_display_01',
    enabled: overrides?.enabled ?? true,
  };
}

export function isLedVolumeWall(raw: unknown): raw is LedVolumeWall {
  if (!raw || typeof raw !== 'object') return false;
  const w = raw as Record<string, unknown>;
  return (
    typeof w.id === 'string' &&
    typeof w.name === 'string' &&
    typeof w.type === 'string' &&
    ['curved_perimeter', 'flat_wall', 'ceiling_canopy', 'wild_wall', 'floor_panel'].includes(w.type) &&
    typeof w.radiusM === 'number' &&
    typeof w.arcAngleDeg === 'number' &&
    typeof w.heightM === 'number' &&
    typeof w.widthM === 'number' &&
    w.center !== null &&
    typeof w.center === 'object' &&
    typeof (w.center as Record<string, unknown>).x === 'number' &&
    typeof (w.center as Record<string, unknown>).y === 'number' &&
    typeof (w.center as Record<string, unknown>).z === 'number' &&
    typeof w.rotationY === 'number' &&
    typeof w.pixelPitchMm === 'number' &&
    typeof w.brightnessNits === 'number' &&
    typeof w.colorTempKelvin === 'number' &&
    (w.nDisplayNodeId === undefined || typeof w.nDisplayNodeId === 'string') &&
    typeof w.enabled === 'boolean'
  );
}

export function normalizeLedVolumeWall(raw: unknown): LedVolumeWall {
  if (!raw || typeof raw !== 'object') {
    return createLedVolumeWall();
  }
  const w = raw as Record<string, unknown>;
  const rawType = typeof w.type === 'string' ? w.type : 'curved_perimeter';
  const type: LedPanelType = ['curved_perimeter', 'flat_wall', 'ceiling_canopy', 'wild_wall', 'floor_panel'].includes(rawType)
    ? (rawType as LedPanelType)
    : 'curved_perimeter';

  const radiusM = typeof w.radiusM === 'number' && isFinite(w.radiusM) ? Math.max(0, w.radiusM) : (type === 'curved_perimeter' ? 9.0 : 0);
  const arcAngleDeg = typeof w.arcAngleDeg === 'number' && isFinite(w.arcAngleDeg) ? Math.max(0, Math.min(360, w.arcAngleDeg)) : (type === 'curved_perimeter' ? 270.0 : 0);
  const heightM = typeof w.heightM === 'number' && isFinite(w.heightM) && w.heightM > 0 ? w.heightM : 5.0;
  const widthM = typeof w.widthM === 'number' && isFinite(w.widthM) && w.widthM > 0
    ? w.widthM
    : (radiusM > 0 && arcAngleDeg > 0 ? +(2 * Math.PI * radiusM * (arcAngleDeg / 360.0)).toFixed(2) : 10.0);

  const centerRaw = w.center && typeof w.center === 'object' ? (w.center as Record<string, unknown>) : {};
  const center = {
    x: typeof centerRaw.x === 'number' && isFinite(centerRaw.x) ? centerRaw.x : 0,
    y: typeof centerRaw.y === 'number' && isFinite(centerRaw.y) ? centerRaw.y : heightM * 0.5,
    z: typeof centerRaw.z === 'number' && isFinite(centerRaw.z) ? centerRaw.z : 0,
  };

  const rotationY = typeof w.rotationY === 'number' && isFinite(w.rotationY) ? w.rotationY : 0;
  const pixelPitchMm = typeof w.pixelPitchMm === 'number' && isFinite(w.pixelPitchMm) && w.pixelPitchMm > 0 ? w.pixelPitchMm : 2.3;
  const brightnessNits = typeof w.brightnessNits === 'number' && isFinite(w.brightnessNits) && w.brightnessNits > 0 ? w.brightnessNits : 1200;
  const colorTempKelvin = typeof w.colorTempKelvin === 'number' && isFinite(w.colorTempKelvin) && w.colorTempKelvin >= 1000 ? w.colorTempKelvin : 6500;
  const nDisplayNodeId = typeof w.nDisplayNodeId === 'string' && w.nDisplayNodeId.length > 0 ? w.nDisplayNodeId : undefined;
  const enabled = typeof w.enabled === 'boolean' ? w.enabled : true;

  return {
    id: typeof w.id === 'string' && w.id.length > 0 ? w.id : generateIcvfxId('wall'),
    name: typeof w.name === 'string' && w.name.length > 0 ? w.name : 'LED Wall',
    type,
    radiusM,
    arcAngleDeg,
    heightM,
    widthM,
    center,
    rotationY,
    pixelPitchMm,
    brightnessNits,
    colorTempKelvin,
    nDisplayNodeId,
    enabled,
  };
}

export function createLedVolumeConfig(presetId: LedVolumePresetId = 'horseshoe_270', overrides?: Partial<LedVolumeConfig>): LedVolumeConfig {
  const stock = STOCK_LED_VOLUMES[presetId] ?? STOCK_LED_VOLUMES.horseshoe_270;
  const base: LedVolumeConfig = JSON.parse(JSON.stringify(stock.config));

  if (!overrides) return base;

  return {
    enabled: overrides.enabled ?? base.enabled,
    stageName: overrides.stageName ?? base.stageName,
    walls: overrides.walls ? overrides.walls.map((w) => normalizeLedVolumeWall(w)) : base.walls,
    lutProfile: overrides.lutProfile ?? base.lutProfile,
    targetWhitePoint: overrides.targetWhitePoint ?? base.targetWhitePoint,
    cameraOverscanPercent: overrides.cameraOverscanPercent ?? base.cameraOverscanPercent,
    latchedCameraId: overrides.latchedCameraId ?? base.latchedCameraId,
  };
}

export function isLedVolumeConfig(raw: unknown): raw is LedVolumeConfig {
  if (!raw || typeof raw !== 'object') return false;
  const c = raw as Record<string, unknown>;
  return (
    typeof c.enabled === 'boolean' &&
    typeof c.stageName === 'string' &&
    Array.isArray(c.walls) &&
    c.walls.every(isLedVolumeWall) &&
    typeof c.lutProfile === 'string' &&
    ['rec709', 'acescc', 'srgb', 'dci_p3'].includes(c.lutProfile) &&
    typeof c.targetWhitePoint === 'string' &&
    ['d55', 'd60', 'd65'].includes(c.targetWhitePoint) &&
    typeof c.cameraOverscanPercent === 'number' &&
    (c.latchedCameraId === undefined || typeof c.latchedCameraId === 'string')
  );
}

export function normalizeLedVolumeConfig(raw: unknown): LedVolumeConfig {
  if (!raw || typeof raw !== 'object') {
    return createLedVolumeConfig();
  }
  const c = raw as Record<string, unknown>;
  const enabled = typeof c.enabled === 'boolean' ? c.enabled : true;
  const stageName = typeof c.stageName === 'string' && c.stageName.length > 0 ? c.stageName : 'Virtual Production LED Volume';

  const walls: LedVolumeWall[] = Array.isArray(c.walls)
    ? c.walls.map(normalizeLedVolumeWall)
    : createLedVolumeConfig().walls;

  const rawLut = typeof c.lutProfile === 'string' ? c.lutProfile : 'acescc';
  const lutProfile: LedVolumeConfig['lutProfile'] = ['rec709', 'acescc', 'srgb', 'dci_p3'].includes(rawLut)
    ? (rawLut as LedVolumeConfig['lutProfile'])
    : 'acescc';

  const rawWp = typeof c.targetWhitePoint === 'string' ? c.targetWhitePoint : 'd65';
  const targetWhitePoint: LedVolumeConfig['targetWhitePoint'] = ['d55', 'd60', 'd65'].includes(rawWp)
    ? (rawWp as LedVolumeConfig['targetWhitePoint'])
    : 'd65';

  const cameraOverscanPercent = typeof c.cameraOverscanPercent === 'number' && isFinite(c.cameraOverscanPercent)
    ? Math.max(0, Math.min(100, c.cameraOverscanPercent))
    : 10;

  const latchedCameraId = typeof c.latchedCameraId === 'string' && c.latchedCameraId.length > 0 ? c.latchedCameraId : undefined;

  return {
    enabled,
    stageName,
    walls,
    lutProfile,
    targetWhitePoint,
    cameraOverscanPercent,
    latchedCameraId,
  };
}

// --- Optical Moiré Spatial Frequency Analyzer --------------------------------

/**
 * Calculates optical spatial frequency aliasing risk (Moiré) between camera sensor
 * Nyquist frequency limit and the projected LED pixel pitch on the sensor plane.
 *
 * Mathematical derivation:
 *   f_sensor = sensorResolutionPx / (2 * sensorWidthMm)
 *   f_projected_led = (cameraDistanceM * 1000) / (focalLengthMm * pixelPitchMm)
 *   ratio = f_projected_led / f_sensor
 *
 * Risk classification:
 *   - severe_moire: 0.82 <= ratio <= 1.22 (destructive beat pattern)
 *   - high_risk:    0.68 <= ratio <= 1.45 (optical aliasing bands)
 *   - low_risk:     0.50 <= ratio <= 1.80 (marginal harmonic risk)
 *   - safe:         ratio < 0.50 (diffused / high oversampling) or ratio > 1.80 (optical cutoff)
 */
export function calculateMoireRisk(
  cameraDistanceM: number,
  focalLengthMm: number,
  sensorWidthMm: number,
  sensorResolutionPx: number,
  pixelPitchMm: number,
  apertureFStop: number = 2.8,
): MoireAnalysisResult {
  const safeDistanceM = Math.max(0.1, cameraDistanceM);
  const safeFocalLength = Math.max(1, focalLengthMm);
  const safeSensorWidth = Math.max(1, sensorWidthMm);
  const safeSensorRes = Math.max(100, sensorResolutionPx);
  const safePitch = Math.max(0.1, pixelPitchMm);

  // Sensor Nyquist limit in line pairs per mm (lp/mm)
  const sensorNyquistLpMm = safeSensorRes / (2 * safeSensorWidth);

  // Projected LED pitch spatial frequency on camera sensor (lp/mm)
  const projectedPitchLpMm = (safeDistanceM * 1000) / (safeFocalLength * safePitch);

  // Spatial frequency ratio (f_projected / f_sensor)
  const nyquistFrequencyRatio = projectedPitchLpMm / sensorNyquistLpMm;

  // Minimum safe camera distance boundary to prevent destructive aliasing:
  // Push ratio safely below 0.50 or beyond 1.80
  const minSafeDistanceM = +( (0.50 * sensorNyquistLpMm * safeFocalLength * safePitch) / 1000 ).toFixed(2);
  const minFarSafeDistanceM = +( (1.80 * sensorNyquistLpMm * safeFocalLength * safePitch) / 1000 ).toFixed(2);

  // Recommended focus distance (focusing slightly in front of the wall to leverage depth of field blur)
  const defocusOffsetM = Math.max(0.5, safeDistanceM * 0.25 * (2.8 / Math.max(1.0, apertureFStop)));
  const recommendedFocusDistanceM = +(Math.max(0.5, safeDistanceM - defocusOffsetM)).toFixed(2);

  let riskLevel: MoireRiskLevel = 'safe';
  let message = 'Safe zone: LED pixel pitch is well diffused or optically oversampled with no moiré aliasing.';

  if (nyquistFrequencyRatio >= 0.82 && nyquistFrequencyRatio <= 1.22) {
    riskLevel = 'severe_moire';
    message = `Severe Moiré Risk (Ratio ${nyquistFrequencyRatio.toFixed(2)}): Projected LED pitch matches sensor Nyquist frequency. Move camera closer than ${minSafeDistanceM}m or further than ${minFarSafeDistanceM}m, or open aperture to f/${apertureFStop.toFixed(1)} and focus at ${recommendedFocusDistanceM}m.`;
  } else if (nyquistFrequencyRatio >= 0.68 && nyquistFrequencyRatio <= 1.45) {
    riskLevel = 'high_risk';
    message = `High Moiré Risk (Ratio ${nyquistFrequencyRatio.toFixed(2)}): Potential optical aliasing bands visible on high-contrast edges. Adjust camera distance or soften LED panel focus.`;
  } else if (nyquistFrequencyRatio >= 0.50 && nyquistFrequencyRatio <= 1.80) {
    riskLevel = 'low_risk';
    message = `Low Moiré Risk (Ratio ${nyquistFrequencyRatio.toFixed(2)}): Minor harmonic interference possible. Monitor live camera monitor closely.`;
  }

  return {
    riskLevel,
    nyquistFrequencyRatio: +nyquistFrequencyRatio.toFixed(3),
    sensorNyquistLpMm: +sensorNyquistLpMm.toFixed(2),
    projectedPitchLpMm: +projectedPitchLpMm.toFixed(2),
    pixelPitchMm: safePitch,
    cameraDistanceM: safeDistanceM,
    focalLengthMm: safeFocalLength,
    sensorWidthMm: safeSensorWidth,
    minSafeDistanceM,
    recommendedFocusDistanceM,
    message,
  };
}

// --- Inner Frustum Geometric Intersection -----------------------------------

interface Vec3D {
  x: number;
  y: number;
  z: number;
}

interface Quat4D {
  x: number;
  y: number;
  z: number;
  w: number;
}

function rotateVectorByQuat(v: Vec3D, q: Quat4D): Vec3D {
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  const ix = qw * v.x + qy * v.z - qz * v.y;
  const iy = qw * v.y + qz * v.x - qx * v.z;
  const iz = qw * v.z + qx * v.y - qy * v.x;
  const iw = -qx * v.x - qy * v.y - qz * v.z;

  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
}

function normalizeVec3D(v: Vec3D): Vec3D {
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < 1e-6) return { x: 0, y: 0, z: -1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Computes the 3D surface intersection bounds of the camera's inner frustum
 * against active LED volume walls (curved cylinders, flat backdrops, ceilings).
 */
export function calculateInnerFrustumIntersection(
  cameraPos: Vec3D,
  cameraRot: Quat4D,
  cameraFovDeg: number,
  cameraAspect: number,
  wallsOrConfig: LedVolumeWall[] | LedVolumeConfig,
  overscanPercent: number = 10,
): InnerFrustumBounds {
  const overscanFactor = 1.0 + Math.max(0, overscanPercent) / 100.0;
  const halfFovRad = (cameraFovDeg * 0.5 * Math.PI) / 180.0;
  const tanHalfFovY = Math.tan(halfFovRad) * overscanFactor;
  const tanHalfFovX = tanHalfFovY * cameraAspect;

  // 4 corner ray directions in camera local space (-Z forward)
  const localRays: Vec3D[] = [
    normalizeVec3D({ x: -tanHalfFovX, y: tanHalfFovY, z: -1.0 }),  // Top-Left
    normalizeVec3D({ x: tanHalfFovX, y: tanHalfFovY, z: -1.0 }),   // Top-Right
    normalizeVec3D({ x: tanHalfFovX, y: -tanHalfFovY, z: -1.0 }),  // Bottom-Right
    normalizeVec3D({ x: -tanHalfFovX, y: -tanHalfFovY, z: -1.0 }), // Bottom-Left
  ];

  // Rotate rays to world space
  const worldRays = localRays.map((r) => rotateVectorByQuat(r, cameraRot));

  const activeWallsSet = new Set<string>();
  const wallsList = Array.isArray(wallsOrConfig) ? wallsOrConfig : (wallsOrConfig?.walls ?? []);
  const enabledWalls = wallsList.filter((w) => w.enabled);
  const corners: Vec3D[] = [];

  for (const ray of worldRays) {
    let closestT = Infinity;
    let hitWallId: string | null = null;
    let hitPoint: Vec3D | null = null;

    for (const wall of enabledWalls) {
      if (wall.type === 'curved_perimeter' && wall.radiusM > 0) {
        // Ray-Cylinder intersection in XZ plane centered at wall.center
        const ox = cameraPos.x - wall.center.x;
        const oz = cameraPos.z - wall.center.z;
        const dx = ray.x;
        const dz = ray.z;

        const a = dx * dx + dz * dz;
        const b = 2 * (ox * dx + oz * dz);
        const c = ox * ox + oz * oz - wall.radiusM * wall.radiusM;

        const disc = b * b - 4 * a * c;
        if (disc >= 0 && a > 1e-6) {
          const sqrtDisc = Math.sqrt(disc);
          const t1 = (-b - sqrtDisc) / (2 * a);
          const t2 = (-b + sqrtDisc) / (2 * a);

          const candidateTs = [t1, t2].filter((t) => t > 0.05);
          for (const t of candidateTs) {
            const hitY = cameraPos.y + t * ray.y;
            const minY = wall.center.y - wall.heightM * 0.5;
            const maxY = wall.center.y + wall.heightM * 0.5;

            if (hitY >= minY && hitY <= maxY) {
              // Check arc angle constraint
              const hx = ox + t * dx;
              const hz = oz + t * dz;
              const hitAngle = Math.atan2(hx, hz) - wall.rotationY;
              const normAngleDeg = ((hitAngle * 180.0) / Math.PI + 360.0) % 360.0;

              if (wall.arcAngleDeg >= 360 || normAngleDeg <= wall.arcAngleDeg) {
                if (t < closestT) {
                  closestT = t;
                  hitWallId = wall.id;
                  hitPoint = {
                    x: +(cameraPos.x + t * ray.x).toFixed(3),
                    y: +(hitY).toFixed(3),
                    z: +(cameraPos.z + t * ray.z).toFixed(3),
                  };
                }
              }
            }
          }
        }
      } else if (wall.type === 'ceiling_canopy') {
        // Horizontal plane at wall.center.y
        if (Math.abs(ray.y) > 1e-5) {
          const t = (wall.center.y - cameraPos.y) / ray.y;
          if (t > 0.05 && t < closestT) {
            const hx = cameraPos.x + t * ray.x;
            const hz = cameraPos.z + t * ray.z;
            const distFromCenter = Math.hypot(hx - wall.center.x, hz - wall.center.z);

            if (wall.radiusM > 0 ? distFromCenter <= wall.radiusM : (Math.abs(hx - wall.center.x) <= wall.widthM * 0.5 && Math.abs(hz - wall.center.z) <= wall.widthM * 0.5)) {
              closestT = t;
              hitWallId = wall.id;
              hitPoint = {
                x: +(hx).toFixed(3),
                y: +(wall.center.y).toFixed(3),
                z: +(hz).toFixed(3),
              };
            }
          }
        }
      } else {
        // Flat wall / Wild wall / Floor panel plane intersection
        // Normal vector derived from rotationY (wall faces along normal)
        const cosY = Math.cos(wall.rotationY);
        const sinY = Math.sin(wall.rotationY);
        const normal = { x: sinY, y: 0, z: cosY };

        const denom = ray.x * normal.x + ray.y * normal.y + ray.z * normal.z;
        if (Math.abs(denom) > 1e-5) {
          const t = ((wall.center.x - cameraPos.x) * normal.x +
                     (wall.center.y - cameraPos.y) * normal.y +
                     (wall.center.z - cameraPos.z) * normal.z) / denom;

          if (t > 0.05 && t < closestT) {
            const hx = cameraPos.x + t * ray.x;
            const hy = cameraPos.y + t * ray.y;
            const hz = cameraPos.z + t * ray.z;

            // Check within width and height bounds
            const localX = (hx - wall.center.x) * cosY - (hz - wall.center.z) * sinY;
            const localY = hy - wall.center.y;

            if (Math.abs(localX) <= wall.widthM * 0.5 && Math.abs(localY) <= wall.heightM * 0.5) {
              closestT = t;
              hitWallId = wall.id;
              hitPoint = {
                x: +(hx).toFixed(3),
                y: +(hy).toFixed(3),
                z: +(hz).toFixed(3),
              };
            }
          }
        }
      }
    }

    if (hitPoint && hitWallId) {
      corners.push(hitPoint);
      activeWallsSet.add(hitWallId);
    } else {
      // Fallback projection at nominal distance (10m)
      const fallbackDist = 10.0;
      corners.push({
        x: +(cameraPos.x + ray.x * fallbackDist).toFixed(3),
        y: +(cameraPos.y + ray.y * fallbackDist).toFixed(3),
        z: +(cameraPos.z + ray.z * fallbackDist).toFixed(3),
      });
    }
  }

  // Calculate projected polygon surface area in square meters
  let surfaceAreaSqm = 0;
  if (corners.length >= 4) {
    const p0 = corners[0], p1 = corners[1], p2 = corners[2], p3 = corners[3];
    // Triangle 1: p0, p1, p2
    const v1 = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z };
    const v2 = { x: p2.x - p0.x, y: p2.y - p0.y, z: p2.z - p0.z };
    const cross1 = {
      x: v1.y * v2.z - v1.z * v2.y,
      y: v1.z * v2.x - v1.x * v2.z,
      z: v1.x * v2.y - v1.y * v2.x,
    };
    const area1 = 0.5 * Math.hypot(cross1.x, cross1.y, cross1.z);

    // Triangle 2: p0, p2, p3
    const v3 = { x: p3.x - p0.x, y: p3.y - p0.y, z: p3.z - p0.z };
    const cross2 = {
      x: v2.y * v3.z - v2.z * v3.y,
      y: v2.z * v3.x - v2.x * v3.z,
      z: v2.x * v3.y - v2.y * v3.x,
    };
    const area2 = 0.5 * Math.hypot(cross2.x, cross2.y, cross2.z);

    surfaceAreaSqm = +(area1 + area2).toFixed(2);
  }

  return {
    corners,
    activeWalls: Array.from(activeWallsSet),
    surfaceAreaSqm,
    overscanFactor,
  };
}

// --- Unreal Engine nDisplay Configuration XML Exporter -----------------------

/**
 * Generates an Unreal Engine standard nDisplay XML config document (.ndisplay)
 * fully describing the cluster nodes, viewports, screens/meshes, and camera tracking.
 */
export function generateNDisplayConfigXml(
  config: LedVolumeConfig,
  cameras?: { id: string; name: string; position: Vec3D; focalLength: number }[],
): string {
  const norm = normalizeLedVolumeConfig(config);
  const enabledWalls = norm.walls.filter((w) => w.enabled);

  const screensXml = enabledWalls
    .map((w, idx) => {
      const isCurved = w.type === 'curved_perimeter';
      const screenId = `SCR_${w.nDisplayNodeId ?? `Wall_${idx + 1}`}`;
      const pxWidth = Math.round((w.widthM * 1000) / w.pixelPitchMm);
      const pxHeight = Math.round((w.heightM * 1000) / w.pixelPitchMm);

      return `      <screen id="${screenId}" name="${escapeXml(w.name)}">
        <size width="${(w.widthM * 100).toFixed(1)}" height="${(w.heightM * 100).toFixed(1)}" />
        <resolution width="${pxWidth}" height="${pxHeight}" />
        <location x="${(w.center.x * 100).toFixed(1)}" y="${(-w.center.z * 100).toFixed(1)}" z="${(w.center.y * 100).toFixed(1)}" />
        <rotation pitch="0" yaw="${((-w.rotationY * 180) / Math.PI).toFixed(2)}" roll="0" />
        <geometry type="${isCurved ? 'cylinder' : 'flat'}" radius="${(w.radiusM * 100).toFixed(1)}" arc="${w.arcAngleDeg.toFixed(1)}" pitch_mm="${w.pixelPitchMm.toFixed(2)}" nits="${w.brightnessNits}" />
      </screen>`;
    })
    .join('\n');

  const viewportsXml = enabledWalls
    .map((w, idx) => {
      const screenId = `SCR_${w.nDisplayNodeId ?? `Wall_${idx + 1}`}`;
      const vpId = `VP_${w.nDisplayNodeId ?? `Wall_${idx + 1}`}`;
      const pxWidth = Math.round((w.widthM * 1000) / w.pixelPitchMm);
      const pxHeight = Math.round((w.heightM * 1000) / w.pixelPitchMm);

      return `        <viewport id="${vpId}" screen="${screenId}" x="0" y="0" width="${pxWidth}" height="${pxHeight}" projection="proj_${vpId}" />`;
    })
    .join('\n');

  const projectionsXml = enabledWalls
    .map((w, idx) => {
      const screenId = `SCR_${w.nDisplayNodeId ?? `Wall_${idx + 1}`}`;
      const vpId = `VP_${w.nDisplayNodeId ?? `Wall_${idx + 1}`}`;
      return `    <policy id="proj_${vpId}" type="mpcdi" screen="${screenId}" />`;
    })
    .join('\n');

  const activeCam = cameras && cameras.length > 0 ? cameras[0] : { id: 'CineCam_01', name: 'Primary CineCamera', position: { x: 0, y: 1.6, z: 4.0 }, focalLength: 35 };

  return `<?xml version="1.0" encoding="UTF-8"?>
<nDisplay version="5.0">
  <info version="2.0" generator="SetView Virtual Production ICVFX Suite" date="${new Date().toISOString()}" />
  <cluster>
    <nodes>
      <node id="node_master" name="Primary Render Node" address="127.0.0.1" port="41000" master="true">
        <window id="Win_Master" fullscreen="false" win_x="0" win_y="0" res_x="3840" res_y="2160">
          <viewport id="VP_InnerFrustum" x="0" y="0" width="3840" height="2160" projection="proj_inner_frustum" camera="${activeCam.id}" />
${viewportsXml}
        </window>
      </node>
    </nodes>
  </cluster>
  <scene>
    <screens>
${screensXml}
    </screens>
    <cameras>
      <camera id="${activeCam.id}" name="${escapeXml(activeCam.name)}" tracking_device="LiveLinkTracking" tracking_entity="CineCameraActor" focal_length="${activeCam.focalLength}" />
    </cameras>
  </scene>
  <projection>
    <policy id="proj_inner_frustum" type="camera" camera="${activeCam.id}" overscan="${norm.cameraOverscanPercent}" />
${projectionsXml}
  </projection>
  <icvfx>
    <stage name="${escapeXml(norm.stageName)}" enabled="${norm.enabled}" lut="${norm.lutProfile}" white_point="${norm.targetWhitePoint}" overscan_percent="${norm.cameraOverscanPercent}" />
  </icvfx>
</nDisplay>
`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// --- OpenUSD (.usda) Stage Exporter ------------------------------------------

/**
 * Generates an OpenUSD USDA ASCII stage file representing the 3D geometry of the LED Volume.
 */
export function generateOpenUsdLedVolume(config: LedVolumeConfig): string {
  const norm = normalizeLedVolumeConfig(config);
  const enabledWalls = norm.walls.filter((w) => w.enabled);

  const wallPrims = enabledWalls
    .map((w, idx) => {
      const safeId = `Wall_${idx + 1}_${w.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      const isCurved = w.type === 'curved_perimeter';

      if (isCurved && w.radiusM > 0) {
        // Procedural cylindrical mesh points (16 segments along arc)
        const segs = 16;
        const halfH = w.heightM * 0.5;
        const totalRad = (w.arcAngleDeg * Math.PI) / 180.0;
        const startRad = -totalRad * 0.5 + w.rotationY;

        const points: string[] = [];
        const faceVertexCounts: number[] = [];
        const faceVertexIndices: number[] = [];

        for (let i = 0; i <= segs; i++) {
          const angle = startRad + (i / segs) * totalRad;
          const x = +(w.center.x + Math.sin(angle) * w.radiusM).toFixed(4);
          const z = +(w.center.z + Math.cos(angle) * w.radiusM).toFixed(4);
          const yBot = +(w.center.y - halfH).toFixed(4);
          const yTop = +(w.center.y + halfH).toFixed(4);

          points.push(`(${x}, ${yBot}, ${z})`, `(${x}, ${yTop}, ${z})`);
        }

        for (let i = 0; i < segs; i++) {
          const i0 = i * 2;
          const i1 = i * 2 + 1;
          const i2 = (i + 1) * 2 + 1;
          const i3 = (i + 1) * 2;

          faceVertexCounts.push(4);
          faceVertexIndices.push(i0, i1, i2, i3);
        }

        return `    def Mesh "${safeId}" (
        prepend apiSchemas = ["MaterialBindingAPI"]
    )
    {
        uniform bool doubleSided = 1
        int[] faceVertexCounts = [${faceVertexCounts.join(', ')}]
        int[] faceVertexIndices = [${faceVertexIndices.join(', ')}]
        point3f[] points = [${points.join(', ')}]
        uniform string customData:icvfx:type = "${w.type}"
        uniform float customData:icvfx:pixelPitchMm = ${w.pixelPitchMm}
        uniform float customData:icvfx:brightnessNits = ${w.brightnessNits}
        uniform float customData:icvfx:colorTempKelvin = ${w.colorTempKelvin}
    }`;
      } else {
        // Flat quad mesh
        const halfW = w.widthM * 0.5;
        const halfH = w.heightM * 0.5;
        const cosY = Math.cos(w.rotationY);
        const sinY = Math.sin(w.rotationY);

        const cornersLocal = [
          { x: -halfW, y: -halfH },
          { x: -halfW, y: halfH },
          { x: halfW, y: halfH },
          { x: halfW, y: -halfH },
        ];

        const points = cornersLocal.map((c) => {
          const x = +(w.center.x + c.x * cosY).toFixed(4);
          const y = +(w.center.y + c.y).toFixed(4);
          const z = +(w.center.z - c.x * sinY).toFixed(4);
          return `(${x}, ${y}, ${z})`;
        });

        return `    def Mesh "${safeId}" (
        prepend apiSchemas = ["MaterialBindingAPI"]
    )
    {
        uniform bool doubleSided = 1
        int[] faceVertexCounts = [4]
        int[] faceVertexIndices = [0, 1, 2, 3]
        point3f[] points = [${points.join(', ')}]
        uniform string customData:icvfx:type = "${w.type}"
        uniform float customData:icvfx:pixelPitchMm = ${w.pixelPitchMm}
        uniform float customData:icvfx:brightnessNits = ${w.brightnessNits}
        uniform float customData:icvfx:colorTempKelvin = ${w.colorTempKelvin}
    }`;
      }
    })
    .join('\n\n');

  return `#usda 1.0
(
    defaultPrim = "LedVolume"
    metersPerUnit = 1.0
    upAxis = "Y"
    doc = "Generated by SetView Virtual Production ICVFX Suite"
)

def Xform "LedVolume" (
    kind = "assembly"
)
{
    uniform string stageName = "${escapeXml(norm.stageName)}"
    uniform string lutProfile = "${norm.lutProfile}"
    uniform string targetWhitePoint = "${norm.targetWhitePoint}"
    uniform float cameraOverscanPercent = ${norm.cameraOverscanPercent}

${wallPrims}
}
`;
}
