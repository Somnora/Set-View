// ---------------------------------------------------------------------------
// SetView Camera Grip Rigs & Optical Lens Physics Simulation Engine
// Pure domain module - ZERO Three.js or DOM imports.
//
// Implements:
//   - Cinema Grip Rig physical dynamics: Tripod fluid heads, Handheld EasyRig,
//     Steadicam isolastic arms, Chapman curved track dollies, Technocrane
//     telescoping booms, Heavy-lift drones, Cable cams.
//   - Mechanical constraints: Boom reach envelopes, track projections,
//     mass-damping acceleration curves, operator gait footstep simulation.
//   - Cinema Lens Optical Physics: Anamorphic squeeze ratios, iris blade
//     diaphragm bokeh polygons, lens breathing focal racks, optical vignetting,
//     lateral chromatic aberration, and barrel distortion.
// ---------------------------------------------------------------------------

import type { Quat, Vec3 } from './model.ts';

export type GripRigType =
  | 'tripod_fluid_head'
  | 'handheld_rig'
  | 'steadicam'
  | 'dolly_curved_track'
  | 'jib_crane'
  | 'technocrane'
  | 'cable_cam'
  | 'drone_uav';

export interface GripRigConfig {
  type: GripRigType;
  damping: number;
  massKg: number;
  maxSpeedMps: number;
  armLengthM?: number;
  minElevationM?: number;
  maxElevationM?: number;
  trackRadiusM?: number;
  trackPoints?: Vec3[];
  springTension?: number;
  operatorFootstepSimulation?: boolean;
  turretBasePos?: Vec3;
}

export type LensSeriesType =
  | 'cooke_anamorphic_prime'
  | 'arri_master_prime'
  | 'canon_k35_vintage'
  | 'atlas_orion_anamorphic'
  | 'angenieux_optimo_zoom'
  | 'zeiss_supreme'
  | 'custom';

export interface LensOpticalProfile {
  series: LensSeriesType;
  anamorphicSqueeze: number;
  apertureBlades: number;
  anamorphicBokehOvalRatio: number;
  lensBreathingFactor: number;
  chromaticAberrationPx: number;
  barrelDistortionFactor: number;
  vignettingFactor: number;
  flareStreakColorHex: string;
  opticalFlawsEnabled: boolean;
}

export interface GripDynamicsResult {
  position: Vec3;
  rotation: Quat;
  linearVelocityMps: number;
  angularVelocityDegPerSec: number;
  isConstrained: boolean;
  constraintViolation?: string;
  boomExtensionM?: number;
  trackProgressNormalized?: number;
}

export const STOCK_GRIP_RIGS: Record<string, GripRigConfig> = {
  tripod_studio: {
    type: 'tripod_fluid_head',
    damping: 0.85,
    massKg: 18,
    maxSpeedMps: 0.6,
    minElevationM: 0.6,
    maxElevationM: 2.1,
    turretBasePos: { x: 0, y: 0, z: 0 },
    operatorFootstepSimulation: false,
  },
  handheld_easyrig: {
    type: 'handheld_rig',
    damping: 0.4,
    massKg: 12,
    maxSpeedMps: 2.5,
    minElevationM: 0.3,
    maxElevationM: 2.2,
    springTension: 0.7,
    operatorFootstepSimulation: true,
  },
  steadicam_m1: {
    type: 'steadicam',
    damping: 0.75,
    massKg: 28,
    maxSpeedMps: 3.5,
    minElevationM: 0.4,
    maxElevationM: 2.0,
    springTension: 0.85,
    operatorFootstepSimulation: true,
  },
  chapman_hybrid_dolly: {
    type: 'dolly_curved_track',
    damping: 0.9,
    massKg: 120,
    maxSpeedMps: 3.0,
    armLengthM: 1.5,
    minElevationM: 0.4,
    maxElevationM: 1.6,
    trackRadiusM: 5.0,
    turretBasePos: { x: 0, y: 0, z: 0 },
    operatorFootstepSimulation: false,
  },
  technocrane_30: {
    type: 'technocrane',
    damping: 0.8,
    massKg: 450,
    maxSpeedMps: 4.0,
    armLengthM: 9.14,
    minElevationM: -1.0,
    maxElevationM: 9.5,
    turretBasePos: { x: 0, y: 0, z: 0 },
    operatorFootstepSimulation: false,
  },
  heavy_lift_drone: {
    type: 'drone_uav',
    damping: 0.65,
    massKg: 15,
    maxSpeedMps: 18.0,
    minElevationM: 0.5,
    maxElevationM: 120.0,
    operatorFootstepSimulation: false,
  },
  cable_cam_highwire: {
    type: 'cable_cam',
    damping: 0.7,
    massKg: 35,
    maxSpeedMps: 12.0,
    armLengthM: 50.0,
    minElevationM: 1.5,
    maxElevationM: 25.0,
    operatorFootstepSimulation: false,
  },
};

export const STOCK_LENS_PROFILES: Record<LensSeriesType, LensOpticalProfile> = {
  cooke_anamorphic_prime: {
    series: 'cooke_anamorphic_prime',
    anamorphicSqueeze: 2.0,
    apertureBlades: 11,
    anamorphicBokehOvalRatio: 2.0,
    lensBreathingFactor: 0.045,
    chromaticAberrationPx: 2.2,
    barrelDistortionFactor: 0.035,
    vignettingFactor: 0.28,
    flareStreakColorHex: '#2563eb',
    opticalFlawsEnabled: true,
  },
  arri_master_prime: {
    series: 'arri_master_prime',
    anamorphicSqueeze: 1.0,
    apertureBlades: 9,
    anamorphicBokehOvalRatio: 1.0,
    lensBreathingFactor: 0.005,
    chromaticAberrationPx: 0.2,
    barrelDistortionFactor: 0.002,
    vignettingFactor: 0.08,
    flareStreakColorHex: '#94a3b8',
    opticalFlawsEnabled: true,
  },
  canon_k35_vintage: {
    series: 'canon_k35_vintage',
    anamorphicSqueeze: 1.0,
    apertureBlades: 8,
    anamorphicBokehOvalRatio: 1.0,
    lensBreathingFactor: 0.065,
    chromaticAberrationPx: 3.8,
    barrelDistortionFactor: 0.045,
    vignettingFactor: 0.42,
    flareStreakColorHex: '#f59e0b',
    opticalFlawsEnabled: true,
  },
  atlas_orion_anamorphic: {
    series: 'atlas_orion_anamorphic',
    anamorphicSqueeze: 2.0,
    apertureBlades: 14,
    anamorphicBokehOvalRatio: 1.85,
    lensBreathingFactor: 0.052,
    chromaticAberrationPx: 2.8,
    barrelDistortionFactor: 0.04,
    vignettingFactor: 0.32,
    flareStreakColorHex: '#0284c7',
    opticalFlawsEnabled: true,
  },
  angenieux_optimo_zoom: {
    series: 'angenieux_optimo_zoom',
    anamorphicSqueeze: 1.0,
    apertureBlades: 9,
    anamorphicBokehOvalRatio: 1.0,
    lensBreathingFactor: 0.038,
    chromaticAberrationPx: 1.4,
    barrelDistortionFactor: 0.018,
    vignettingFactor: 0.18,
    flareStreakColorHex: '#60a5fa',
    opticalFlawsEnabled: true,
  },
  zeiss_supreme: {
    series: 'zeiss_supreme',
    anamorphicSqueeze: 1.0,
    apertureBlades: 10,
    anamorphicBokehOvalRatio: 1.0,
    lensBreathingFactor: 0.008,
    chromaticAberrationPx: 0.4,
    barrelDistortionFactor: 0.005,
    vignettingFactor: 0.12,
    flareStreakColorHex: '#cbd5e1',
    opticalFlawsEnabled: true,
  },
  custom: {
    series: 'custom',
    anamorphicSqueeze: 1.0,
    apertureBlades: 9,
    anamorphicBokehOvalRatio: 1.0,
    lensBreathingFactor: 0.02,
    chromaticAberrationPx: 1.0,
    barrelDistortionFactor: 0.01,
    vignettingFactor: 0.15,
    flareStreakColorHex: '#3b82f6',
    opticalFlawsEnabled: true,
  },
};

const VALID_GRIP_RIG_TYPES: readonly GripRigType[] = [
  'tripod_fluid_head',
  'handheld_rig',
  'steadicam',
  'dolly_curved_track',
  'jib_crane',
  'technocrane',
  'cable_cam',
  'drone_uav',
];

const VALID_LENS_SERIES: readonly LensSeriesType[] = [
  'cooke_anamorphic_prime',
  'arri_master_prime',
  'canon_k35_vintage',
  'atlas_orion_anamorphic',
  'angenieux_optimo_zoom',
  'zeiss_supreme',
  'custom',
];

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function isVec3(v: unknown): v is Vec3 {
  const o = v as Vec3;
  return !!o && typeof o === 'object' && isFiniteNum(o.x) && isFiniteNum(o.y) && isFiniteNum(o.z);
}

export function isQuat(q: unknown): q is Quat {
  const o = q as Quat;
  return (
    !!o &&
    typeof o === 'object' &&
    isFiniteNum(o.x) &&
    isFiniteNum(o.y) &&
    isFiniteNum(o.z) &&
    isFiniteNum(o.w)
  );
}

export function createGripRigConfig(
  type: GripRigType = 'tripod_fluid_head',
  overrides?: Partial<GripRigConfig>,
): GripRigConfig {
  let base: GripRigConfig;
  switch (type) {
    case 'handheld_rig':
      base = { ...STOCK_GRIP_RIGS.handheld_easyrig };
      break;
    case 'steadicam':
      base = { ...STOCK_GRIP_RIGS.steadicam_m1 };
      break;
    case 'dolly_curved_track':
      base = { ...STOCK_GRIP_RIGS.chapman_hybrid_dolly };
      break;
    case 'jib_crane':
      base = {
        type: 'jib_crane',
        damping: 0.75,
        massKg: 85,
        maxSpeedMps: 2.5,
        armLengthM: 3.6,
        minElevationM: 0.2,
        maxElevationM: 4.5,
        turretBasePos: { x: 0, y: 0, z: 0 },
        operatorFootstepSimulation: false,
      };
      break;
    case 'technocrane':
      base = { ...STOCK_GRIP_RIGS.technocrane_30 };
      break;
    case 'cable_cam':
      base = { ...STOCK_GRIP_RIGS.cable_cam_highwire };
      break;
    case 'drone_uav':
      base = { ...STOCK_GRIP_RIGS.heavy_lift_drone };
      break;
    case 'tripod_fluid_head':
    default:
      base = { ...STOCK_GRIP_RIGS.tripod_studio };
      break;
  }

  if (overrides) {
    if (overrides.type !== undefined && VALID_GRIP_RIG_TYPES.includes(overrides.type)) {
      base.type = overrides.type;
    }
    if (isFiniteNum(overrides.damping)) {
      base.damping = Math.max(0.0, Math.min(1.0, overrides.damping));
    }
    if (isFiniteNum(overrides.massKg) && overrides.massKg > 0) {
      base.massKg = overrides.massKg;
    }
    if (isFiniteNum(overrides.maxSpeedMps) && overrides.maxSpeedMps > 0) {
      base.maxSpeedMps = overrides.maxSpeedMps;
    }
    if (isFiniteNum(overrides.armLengthM) && overrides.armLengthM > 0) {
      base.armLengthM = overrides.armLengthM;
    }
    if (isFiniteNum(overrides.minElevationM)) {
      base.minElevationM = overrides.minElevationM;
    }
    if (isFiniteNum(overrides.maxElevationM)) {
      base.maxElevationM = overrides.maxElevationM;
    }
    if (isFiniteNum(overrides.trackRadiusM) && overrides.trackRadiusM > 0) {
      base.trackRadiusM = overrides.trackRadiusM;
    }
    if (Array.isArray(overrides.trackPoints)) {
      base.trackPoints = overrides.trackPoints.filter(isVec3).map((p) => ({ ...p }));
    }
    if (isFiniteNum(overrides.springTension)) {
      base.springTension = Math.max(0.0, Math.min(1.0, overrides.springTension));
    }
    if (typeof overrides.operatorFootstepSimulation === 'boolean') {
      base.operatorFootstepSimulation = overrides.operatorFootstepSimulation;
    }
    if (overrides.turretBasePos && isVec3(overrides.turretBasePos)) {
      base.turretBasePos = { ...overrides.turretBasePos };
    }
  }

  return base;
}

export function isGripRigConfig(raw: unknown): raw is GripRigConfig {
  const g = raw as GripRigConfig;
  return (
    !!g &&
    typeof g === 'object' &&
    VALID_GRIP_RIG_TYPES.includes(g.type) &&
    isFiniteNum(g.damping) &&
    g.damping >= 0 &&
    g.damping <= 1 &&
    isFiniteNum(g.massKg) &&
    g.massKg > 0 &&
    isFiniteNum(g.maxSpeedMps) &&
    g.maxSpeedMps > 0 &&
    (g.armLengthM === undefined || (isFiniteNum(g.armLengthM) && g.armLengthM > 0)) &&
    (g.minElevationM === undefined || isFiniteNum(g.minElevationM)) &&
    (g.maxElevationM === undefined || isFiniteNum(g.maxElevationM)) &&
    (g.trackRadiusM === undefined || (isFiniteNum(g.trackRadiusM) && g.trackRadiusM > 0)) &&
    (g.trackPoints === undefined || (Array.isArray(g.trackPoints) && g.trackPoints.every(isVec3))) &&
    (g.springTension === undefined || (isFiniteNum(g.springTension) && g.springTension >= 0 && g.springTension <= 1)) &&
    (g.operatorFootstepSimulation === undefined || typeof g.operatorFootstepSimulation === 'boolean') &&
    (g.turretBasePos === undefined || isVec3(g.turretBasePos))
  );
}

export function normalizeGripRigConfig(raw: unknown): GripRigConfig {
  if (!raw || typeof raw !== 'object') {
    return createGripRigConfig('tripod_fluid_head');
  }
  const g = raw as Partial<GripRigConfig>;
  const type: GripRigType = VALID_GRIP_RIG_TYPES.includes(g.type as GripRigType)
    ? (g.type as GripRigType)
    : 'tripod_fluid_head';

  const damping = isFiniteNum(g.damping) ? Math.max(0.0, Math.min(1.0, g.damping)) : 0.8;
  const massKg = isFiniteNum(g.massKg) && g.massKg > 0 ? g.massKg : 18;
  const maxSpeedMps = isFiniteNum(g.maxSpeedMps) && g.maxSpeedMps > 0 ? g.maxSpeedMps : 2.0;

  const config: GripRigConfig = {
    type,
    damping,
    massKg,
    maxSpeedMps,
  };

  if (isFiniteNum(g.armLengthM) && g.armLengthM > 0) {
    config.armLengthM = g.armLengthM;
  }
  if (isFiniteNum(g.minElevationM)) {
    config.minElevationM = g.minElevationM;
  }
  if (isFiniteNum(g.maxElevationM)) {
    config.maxElevationM = g.maxElevationM;
  }
  if (isFiniteNum(g.trackRadiusM) && g.trackRadiusM > 0) {
    config.trackRadiusM = g.trackRadiusM;
  }
  if (Array.isArray(g.trackPoints) && g.trackPoints.length > 0) {
    config.trackPoints = g.trackPoints.filter(isVec3).map((p) => ({ x: p.x, y: p.y, z: p.z }));
  }
  if (isFiniteNum(g.springTension)) {
    config.springTension = Math.max(0.0, Math.min(1.0, g.springTension));
  }
  if (typeof g.operatorFootstepSimulation === 'boolean') {
    config.operatorFootstepSimulation = g.operatorFootstepSimulation;
  }
  if (g.turretBasePos && isVec3(g.turretBasePos)) {
    config.turretBasePos = { x: g.turretBasePos.x, y: g.turretBasePos.y, z: g.turretBasePos.z };
  }

  return config;
}

export function createLensProfile(
  series: LensSeriesType = 'cooke_anamorphic_prime',
  overrides?: Partial<LensOpticalProfile>,
): LensOpticalProfile {
  const stock = STOCK_LENS_PROFILES[series] ?? STOCK_LENS_PROFILES.cooke_anamorphic_prime;
  const profile: LensOpticalProfile = {
    ...stock,
  };

  if (overrides) {
    if (overrides.series !== undefined && VALID_LENS_SERIES.includes(overrides.series)) {
      profile.series = overrides.series;
    }
    if (isFiniteNum(overrides.anamorphicSqueeze) && overrides.anamorphicSqueeze >= 1.0) {
      profile.anamorphicSqueeze = overrides.anamorphicSqueeze;
    }
    if (isFiniteNum(overrides.apertureBlades) && overrides.apertureBlades >= 0) {
      profile.apertureBlades = Math.round(overrides.apertureBlades);
    }
    if (isFiniteNum(overrides.anamorphicBokehOvalRatio) && overrides.anamorphicBokehOvalRatio >= 1.0) {
      profile.anamorphicBokehOvalRatio = overrides.anamorphicBokehOvalRatio;
    }
    if (isFiniteNum(overrides.lensBreathingFactor)) {
      profile.lensBreathingFactor = Math.max(0.0, Math.min(0.25, overrides.lensBreathingFactor));
    }
    if (isFiniteNum(overrides.chromaticAberrationPx)) {
      profile.chromaticAberrationPx = Math.max(0.0, Math.min(10.0, overrides.chromaticAberrationPx));
    }
    if (isFiniteNum(overrides.barrelDistortionFactor)) {
      profile.barrelDistortionFactor = Math.max(-0.15, Math.min(0.15, overrides.barrelDistortionFactor));
    }
    if (isFiniteNum(overrides.vignettingFactor)) {
      profile.vignettingFactor = Math.max(0.0, Math.min(1.0, overrides.vignettingFactor));
    }
    if (typeof overrides.flareStreakColorHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(overrides.flareStreakColorHex)) {
      profile.flareStreakColorHex = overrides.flareStreakColorHex;
    }
    if (typeof overrides.opticalFlawsEnabled === 'boolean') {
      profile.opticalFlawsEnabled = overrides.opticalFlawsEnabled;
    }
  }

  return profile;
}

export function isLensProfile(raw: unknown): raw is LensOpticalProfile {
  const p = raw as LensOpticalProfile;
  return (
    !!p &&
    typeof p === 'object' &&
    VALID_LENS_SERIES.includes(p.series) &&
    isFiniteNum(p.anamorphicSqueeze) &&
    p.anamorphicSqueeze >= 1.0 &&
    isFiniteNum(p.apertureBlades) &&
    p.apertureBlades >= 0 &&
    isFiniteNum(p.anamorphicBokehOvalRatio) &&
    p.anamorphicBokehOvalRatio >= 1.0 &&
    isFiniteNum(p.lensBreathingFactor) &&
    p.lensBreathingFactor >= 0 &&
    isFiniteNum(p.chromaticAberrationPx) &&
    p.chromaticAberrationPx >= 0 &&
    isFiniteNum(p.barrelDistortionFactor) &&
    isFiniteNum(p.vignettingFactor) &&
    p.vignettingFactor >= 0 &&
    p.vignettingFactor <= 1 &&
    typeof p.flareStreakColorHex === 'string' &&
    typeof p.opticalFlawsEnabled === 'boolean'
  );
}

export function normalizeLensProfile(raw: unknown): LensOpticalProfile {
  if (!raw || typeof raw !== 'object') {
    return createLensProfile('cooke_anamorphic_prime');
  }
  const p = raw as Partial<LensOpticalProfile>;
  const series: LensSeriesType = VALID_LENS_SERIES.includes(p.series as LensSeriesType)
    ? (p.series as LensSeriesType)
    : 'cooke_anamorphic_prime';

  const stock = STOCK_LENS_PROFILES[series] ?? STOCK_LENS_PROFILES.cooke_anamorphic_prime;

  return {
    series,
    anamorphicSqueeze:
      isFiniteNum(p.anamorphicSqueeze)
        ? Math.max(1.0, Math.min(2.5, p.anamorphicSqueeze))
        : stock.anamorphicSqueeze,
    apertureBlades:
      isFiniteNum(p.apertureBlades)
        ? Math.max(0, Math.min(18, Math.round(p.apertureBlades)))
        : stock.apertureBlades,
    anamorphicBokehOvalRatio:
      isFiniteNum(p.anamorphicBokehOvalRatio)
        ? Math.max(0.4, Math.min(2.5, p.anamorphicBokehOvalRatio))
        : stock.anamorphicBokehOvalRatio,
    lensBreathingFactor:
      isFiniteNum(p.lensBreathingFactor)
        ? Math.max(0, Math.min(0.25, p.lensBreathingFactor))
        : stock.lensBreathingFactor,
    chromaticAberrationPx:
      isFiniteNum(p.chromaticAberrationPx)
        ? Math.max(0, Math.min(10.0, p.chromaticAberrationPx))
        : stock.chromaticAberrationPx,
    barrelDistortionFactor:
      isFiniteNum(p.barrelDistortionFactor)
        ? Math.max(-0.2, Math.min(0.2, p.barrelDistortionFactor))
        : stock.barrelDistortionFactor,
    vignettingFactor:
      isFiniteNum(p.vignettingFactor)
        ? Math.max(0, Math.min(0.95, p.vignettingFactor))
        : stock.vignettingFactor,
    flareStreakColorHex:
      typeof p.flareStreakColorHex === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.flareStreakColorHex)
        ? p.flareStreakColorHex
        : stock.flareStreakColorHex,
    opticalFlawsEnabled:
      typeof p.opticalFlawsEnabled === 'boolean' ? p.opticalFlawsEnabled : stock.opticalFlawsEnabled,
  };
}

// ---------------------------------------------------------------------------
// Pure Math Helpers (zero Three.js imports)
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function quatSlerp(qa: Quat, qb: Quat, t: number): Quat {
  let cosHalfTheta = qa.w * qb.w + qa.x * qb.x + qa.y * qb.y + qa.z * qb.z;

  let bx = qb.x;
  let by = qb.y;
  let bz = qb.z;
  let bw = qb.w;

  if (cosHalfTheta < 0) {
    cosHalfTheta = -cosHalfTheta;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }

  if (cosHalfTheta >= 1.0 - 1e-6) {
    const rx = qa.x + (bx - qa.x) * t;
    const ry = qa.y + (by - qa.y) * t;
    const rz = qa.z + (bz - qa.z) * t;
    const rw = qa.w + (bw - qa.w) * t;
    const len = Math.sqrt(rx * rx + ry * ry + rz * rz + rw * rw) || 1.0;
    return { x: rx / len, y: ry / len, z: rz / len, w: rw / len };
  }

  const halfTheta = Math.acos(cosHalfTheta);
  const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);

  if (Math.abs(sinHalfTheta) < 1e-6) {
    return { x: qa.x, y: qa.y, z: qa.z, w: qa.w };
  }

  const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

  const rx = qa.x * ratioA + bx * ratioB;
  const ry = qa.y * ratioA + by * ratioB;
  const rz = qa.z * ratioA + bz * ratioB;
  const rw = qa.w * ratioA + bw * ratioB;
  const len = Math.sqrt(rx * rx + ry * ry + rz * rz + rw * rw) || 1.0;
  return { x: rx / len, y: ry / len, z: rz / len, w: rw / len };
}

// ---------------------------------------------------------------------------
// Physical Grip Rig Dynamics Simulation
// ---------------------------------------------------------------------------

export function simulateGripRigDynamics(
  currentPos: Vec3,
  currentQuat: Quat,
  targetPos: Vec3,
  targetQuat: Quat,
  rig?: GripRigConfig,
  dt: number = 1 / 72,
  timeS: number = 0,
): GripDynamicsResult {
  if (!rig) {
    return {
      position: { x: targetPos.x, y: targetPos.y, z: targetPos.z },
      rotation: { x: targetQuat.x, y: targetQuat.y, z: targetQuat.z, w: targetQuat.w },
      linearVelocityMps: 0,
      angularVelocityDegPerSec: 0,
      isConstrained: false,
    };
  }

  const safeDt = isFiniteNum(dt) && dt > 0 ? clamp(dt, 0.001, 0.1) : 1 / 72;
  const safeTime = isFiniteNum(timeS) ? timeS : 0;

  // Mass-damping inertia calculation
  // Heavier rigs with higher damping accelerate slower and smooth out jitter
  const massRatio = clamp(rig.massKg, 1.0, 500.0);
  const dampingRatio = clamp(rig.damping, 0.0, 1.0);
  const responsiveness = 30.0 / (1.0 + massRatio * 0.04 + dampingRatio * 15.0);
  const smoothFactor = 1.0 - Math.exp(-responsiveness * safeDt);

  let stepX = (targetPos.x - currentPos.x) * smoothFactor;
  let stepY = (targetPos.y - currentPos.y) * smoothFactor;
  let stepZ = (targetPos.z - currentPos.z) * smoothFactor;

  const stepDist = Math.sqrt(stepX * stepX + stepY * stepY + stepZ * stepZ);
  const maxStep = rig.maxSpeedMps * safeDt;

  if (stepDist > maxStep && stepDist > 1e-6) {
    const scale = maxStep / stepDist;
    stepX *= scale;
    stepY *= scale;
    stepZ *= scale;
  }

  let posX = currentPos.x + stepX;
  let posY = currentPos.y + stepY;
  let posZ = currentPos.z + stepZ;

  let isConstrained = false;
  let constraintViolation: string | undefined;
  let boomExtensionM: number | undefined;
  let trackProgressNormalized: number | undefined;

  const basePos = rig.turretBasePos ?? { x: currentPos.x, y: 0, z: currentPos.z };

  switch (rig.type) {
    case 'tripod_fluid_head': {
      // Fixed base tripod: horizontal position locked to base
      if (Math.abs(posX - basePos.x) > 0.001 || Math.abs(posZ - basePos.z) > 0.001) {
        posX = basePos.x;
        posZ = basePos.z;
        isConstrained = true;
        constraintViolation = 'Tripod base is anchored to ground';
      }
      break;
    }

    case 'jib_crane':
    case 'technocrane': {
      const maxReach = isFiniteNum(rig.armLengthM) && rig.armLengthM > 0
        ? rig.armLengthM
        : rig.type === 'technocrane' ? 9.14 : 3.6;

      const dx = posX - basePos.x;
      const dy = posY - basePos.y;
      const dz = posZ - basePos.z;
      const distFromBase = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distFromBase > maxReach) {
        const factor = maxReach / (distFromBase || 1.0);
        posX = basePos.x + dx * factor;
        posY = basePos.y + dy * factor;
        posZ = basePos.z + dz * factor;
        isConstrained = true;
        constraintViolation = `Crane boom reach limit reached (${maxReach.toFixed(1)}m)`;
      }
      boomExtensionM = Math.min(distFromBase, maxReach);
      break;
    }

    case 'dolly_curved_track': {
      const radius = isFiniteNum(rig.trackRadiusM) && rig.trackRadiusM > 0 ? rig.trackRadiusM : 5.0;
      const dx = posX - basePos.x;
      const dz = posZ - basePos.z;
      const angle = Math.atan2(dz, dx);
      posX = basePos.x + radius * Math.cos(angle);
      posZ = basePos.z + radius * Math.sin(angle);

      // Track progress 0.0 to 1.0 along the circle
      trackProgressNormalized = ((angle + Math.PI) / (2 * Math.PI)) % 1.0;
      break;
    }

    case 'cable_cam': {
      const maxSpan = isFiniteNum(rig.armLengthM) && rig.armLengthM > 0 ? rig.armLengthM : 50.0;
      const dx = posX - basePos.x;
      const dz = posZ - basePos.z;
      const horizontalDist = Math.sqrt(dx * dx + dz * dz);
      if (horizontalDist > maxSpan) {
        const factor = maxSpan / (horizontalDist || 1.0);
        posX = basePos.x + dx * factor;
        posZ = basePos.z + dz * factor;
        isConstrained = true;
        constraintViolation = `Cable span travel limit reached (${maxSpan.toFixed(1)}m)`;
      }
      trackProgressNormalized = clamp(horizontalDist / maxSpan, 0.0, 1.0);
      break;
    }

    case 'handheld_rig':
    case 'steadicam':
    case 'drone_uav':
    default:
      break;
  }

  // Elevation boundary checks
  if (rig.minElevationM !== undefined && posY < rig.minElevationM) {
    posY = rig.minElevationM;
    isConstrained = true;
    constraintViolation = `Min elevation limit reached (${rig.minElevationM.toFixed(2)}m)`;
  }
  if (rig.maxElevationM !== undefined && posY > rig.maxElevationM) {
    posY = rig.maxElevationM;
    isConstrained = true;
    constraintViolation = `Max elevation limit reached (${rig.maxElevationM.toFixed(2)}m)`;
  }

  // Procedural operator footstep gait bounce for handheld / steadicam
  if (rig.operatorFootstepSimulation) {
    const horizontalVelocity = Math.sqrt(stepX * stepX + stepZ * stepZ) / safeDt;
    if (horizontalVelocity > 0.08) {
      const stepFreqHz = 1.8;
      const springFactor = 1.0 - (rig.springTension ?? 0.5) * 0.6;
      const bounceAmp = Math.min(0.035, 0.018 * (horizontalVelocity / 1.4)) * springFactor;
      const bounceY = Math.sin(safeTime * stepFreqHz * 2.0 * Math.PI) * bounceAmp;
      posY += bounceY;
    }
  }

  // Slerp orientation with rotational inertia
  const rotSmooth = 1.0 - Math.exp(-(25.0 / (1.0 + massRatio * 0.03 + dampingRatio * 10.0)) * safeDt);
  const outQuat = quatSlerp(currentQuat, targetQuat, rotSmooth);

  const actualDx = posX - currentPos.x;
  const actualDy = posY - currentPos.y;
  const actualDz = posZ - currentPos.z;
  const linearVelocityMps = Math.sqrt(actualDx * actualDx + actualDy * actualDy + actualDz * actualDz) / safeDt;

  let cosHalfAngle = currentQuat.w * outQuat.w + currentQuat.x * outQuat.x + currentQuat.y * outQuat.y + currentQuat.z * outQuat.z;
  cosHalfAngle = clamp(Math.abs(cosHalfAngle), -1.0, 1.0);
  const angularDistanceRad = 2.0 * Math.acos(cosHalfAngle);
  const angularVelocityDegPerSec = (angularDistanceRad * (180.0 / Math.PI)) / safeDt;

  return {
    position: { x: posX, y: posY, z: posZ },
    rotation: outQuat,
    linearVelocityMps,
    angularVelocityDegPerSec,
    isConstrained,
    ...(constraintViolation ? { constraintViolation } : {}),
    ...(boomExtensionM !== undefined ? { boomExtensionM } : {}),
    ...(trackProgressNormalized !== undefined ? { trackProgressNormalized } : {}),
  };
}

// ---------------------------------------------------------------------------
// Optical Physics Equations
// ---------------------------------------------------------------------------

/**
 * Calculates focal length shift caused by internal lens element displacement
 * when pulling focus (lens breathing).
 *
 * Near focus (0.5m) induces maximum breathing; infinity (>= 10m) has zero shift.
 */
export function calculateLensBreathingFocalLength(
  baseFocalLengthMm: number,
  focusDistanceM: number,
  breathingFactorOrProfile: number | LensOpticalProfile,
): number {
  if (!isFiniteNum(baseFocalLengthMm) || baseFocalLengthMm <= 0) return 35;
  const factor =
    typeof breathingFactorOrProfile === 'object' && breathingFactorOrProfile !== null
      ? breathingFactorOrProfile.lensBreathingFactor
      : breathingFactorOrProfile;
  if (!isFiniteNum(factor) || factor === 0) return baseFocalLengthMm;

  const dist = isFiniteNum(focusDistanceM) && focusDistanceM > 0 ? focusDistanceM : 10.0;
  const clampedDist = clamp(dist, 0.5, 10.0);
  // Rack factor: 0.0 at 10m (infinity), 1.0 at 0.5m (close focus)
  const rackFactor = (10.0 - clampedDist) / (10.0 - 0.5);
  const effectiveFocalLength = baseFocalLengthMm * (1.0 + factor * rackFactor);
  return Math.round(effectiveFocalLength * 100) / 100;
}

export interface BokehShapeResult {
  polygonPoints: { x: number; y: number }[];
  bladeVertices: { x: number; y: number }[];
  bladeCount: number;
  ovalRatio: number;
  ovalScaleY: number;
  isCircular: boolean;
}

/**
 * Calculates the polygon vertices of the aperture iris diaphragm
 * with anamorphic squeeze / oval scaling.
 */
export function calculateBokehShape(
  profileOrBlades: LensOpticalProfile | number,
  squeezeOrTStop: number,
  maybeTStop?: number,
): BokehShapeResult {
  let blades: number;
  let squeeze: number;
  let tStop: number;

  if (typeof profileOrBlades === 'object' && profileOrBlades !== null) {
    blades = profileOrBlades.apertureBlades;
    squeeze = profileOrBlades.anamorphicSqueeze;
    tStop = isFiniteNum(squeezeOrTStop) ? squeezeOrTStop : 2.8;
  } else {
    blades = profileOrBlades;
    squeeze = isFiniteNum(squeezeOrTStop) ? squeezeOrTStop : 1.0;
    tStop = maybeTStop !== undefined && isFiniteNum(maybeTStop) ? maybeTStop : 2.8;
  }

  const numBlades = Math.round(blades);
  const squeezeRatio = isFiniteNum(squeeze) && squeeze >= 1.0 ? squeeze : 1.0;
  const ovalRatio = 1.0 / squeezeRatio;
  const isCircular = numBlades < 3 || tStop <= 1.4;
  const count = isCircular ? 32 : numBlades;
  const angleOffset = -Math.PI / 2;

  const vertices: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const theta = angleOffset + (i * 2 * Math.PI) / count;
    vertices.push({
      x: Math.cos(theta),
      y: Math.sin(theta) * squeezeRatio,
    });
  }

  return {
    polygonPoints: vertices,
    bladeVertices: vertices,
    bladeCount: numBlades,
    ovalRatio,
    ovalScaleY: squeezeRatio,
    isCircular,
  };
}

/**
 * Computes optical light falloff (vignetting) at a normalized radial distance
 * from the optical axis (0.0 center, 1.0 sensor corner).
 *
 * Stopping down aperture reduces mechanical/optical vignetting.
 */
export function calculateOpticalVignetting(
  radiusNormalized: number,
  tStop: number,
  profileOrFactor: number | LensOpticalProfile,
): number {
  const r = clamp(isFiniteNum(radiusNormalized) ? radiusNormalized : 0.0, 0.0, 1.5);
  const base =
    typeof profileOrFactor === 'object' && profileOrFactor !== null
      ? profileOrFactor.vignettingFactor
      : clamp(isFiniteNum(profileOrFactor) ? profileOrFactor : 0.0, 0.0, 1.0);
  const stop = Math.max(0.7, isFiniteNum(tStop) ? tStop : 2.8);

  // Aperture stopping down reduces corner shading
  const apertureReduction = clamp(1.4 / Math.sqrt(stop * 1.4), 0.15, 1.0);
  const falloff = Math.pow(r, 2.2);
  const transmission = 1.0 - base * apertureReduction * falloff;
  return clamp(transmission, 0.0, 1.0);
}
