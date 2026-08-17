// ---------------------------------------------------------------------------
// SetView Soundstage Acoustics & Multi-Track Spatial Dialogue Simulation Engine
// PURE DOMAIN MODULE - ZERO Three.js or DOM imports.
// Suitable for direct execution in Node.js unit tests and headless runtimes.
// ---------------------------------------------------------------------------

import type { Quat, Vec3 } from './model.ts';

/** Supported microphone polar pick-up patterns. */
export type MicPolarPattern =
  | 'shotgun_supercardioid'
  | 'hypercardioid'
  | 'cardioid'
  | 'omnidirectional'
  | 'figure_eight';

/** Transducer capsule technical specifications and physical acoustic characteristics. */
export interface MicCapsuleProfile {
  id: string;
  name: string;
  manufacturer: string;
  pattern: MicPolarPattern;
  /** Sensitivity in dBFS referenced to 94 dB SPL (1 Pascal) at 1 kHz (e.g. -36 dBFS). */
  sensitivityDbfs: number;
  /** Maximum SPL handling before 0.5% THD acoustic distortion (dB SPL). */
  maxSplDb: number;
  /** A-weighted equivalent self-noise floor (dBA). */
  selfNoiseDba: number;
  /** Directivity Index in dB along main acoustic axis (0 dB for omni, ~6 dB for supercardioid, ~9 dB for shotgun). */
  directivityIndexDb: number;
  /** Front-to-back off-axis rejection ratio in dB at 180 degrees. */
  frontToBackRatioDb: number;
  /** Physical acoustic interference tube length in meters for shotgun microphones. */
  tubeLengthM?: number;
}

/** Boom pole physical mechanical rigging configuration. */
export interface BoomPoleConfig {
  /** Maximum physical boom pole length when fully extended (meters). */
  lengthM: number;
  /** Current active telescoping extension length (meters). */
  extensionM: number;
  /** Pivot point elevation height of boom operator hands/shoulders (meters). */
  pivotHeightM: number;
  /** World position of the boom operator standing footprint. */
  operatorPosition: Vec3;
  /** Target cue aiming point in world coordinates. */
  targetPoint: Vec3;
  /** Inertial mechanical damping factor for smooth cue panning (0.0 to 1.0). */
  dampingFactor: number;
}

/** Boom microphone entity positioned above speaking actors on set. */
export interface BoomMicEntity {
  id: string;
  name: string;
  capsuleId: string;
  pole: BoomPoleConfig;
  /** Capsule transducer acoustic center position in scene space (meters). */
  position: Vec3;
  /** Transducer capsule orientation quaternion pointing along the acoustic pick-up axis. */
  orientation: Quat;
  /** Optional target actor entity ID for automated spatial tracking and cueing. */
  targetActorId?: string;
  /** Preamp gain in dB (-12 dB to +60 dB). */
  gainDb: number;
  /** High-pass low-cut filter frequency in Hz (0 = flat, 80 Hz, 120 Hz, 160 Hz). */
  lowCutHz: number;
  isMuted: boolean;
}

/** Body-worn lavalier microphone entity attached to an actor rig. */
export interface LavalierMicEntity {
  id: string;
  actorId: string;
  name: string;
  capsuleId: string;
  /** Chest offset relative to actor origin (meters: x = lateral, y = sternum height, z = forward). */
  chestOffset: Vec3;
  /** Preamp gain in dB (-12 dB to +60 dB). */
  gainDb: number;
  isMuted: boolean;
}

/** Dialogue sound source entity (actor vocal tract or physical Foley emitter). */
export interface SoundSourceEntity {
  id: string;
  name: string;
  actorId?: string;
  position: Vec3;
  /** Sound Pressure Level in dB at 1 meter reference distance (dialogue: 65-72 dB SPL). */
  splDbAt1m: number;
  /** Acoustic radiation directivity pattern. */
  directivityPattern: 'spherical' | 'human_vocal';
}

/** Room physical acoustic metrics and RT60 reverberation profile. */
export interface RoomAcousticsMetrics {
  roomVolumeM3: number;
  totalSurfaceAreaM2: number;
  averageAbsorptionCoefficient: number;
  /** Sabine classic RT60 decay time in seconds (t60 = 0.161 * V / A). */
  rt60SabineSec: number;
  /** Norris-Eyring RT60 decay time in seconds for moderately treated soundstages. */
  rt60EyringSec: number;
  /** Critical distance in meters where direct dialogue SPL equals reverberant field SPL. */
  criticalDistanceM: number;
  /** Early-to-late energy ratio speech clarity metric in dB (C50 >= +3 dB indicates clean dialogue). */
  speechClarityC50Db: number;
  acousticClassification: 'dry_treated' | 'controlled_studio' | 'live_reflective' | 'echoic_hall';
}

/** Real-time microphone audio signal sample metrics. */
export interface MicSignalSample {
  directSignalDb: number;
  reverberantSignalDb: number;
  totalLevelDb: number;
  /** Signal-to-noise ratio in dB relative to ambient noise floor and capsule self-noise. */
  snrDb: number;
  /** Off-axis attenuation in dB relative to on-axis 0 degrees. */
  offAxisAttenuationDb: number;
  isClipping: boolean;
}

/** Boom microphone frame incursion warning alert for camera framing clearance. */
export interface BoomIncursionAlert {
  isIncursion: boolean;
  micId: string;
  cameraId: string;
  /** Physical distance clearance margin to camera frame boundary (meters; negative when dipping into shot). */
  marginM: number;
  /** Normalized Device Coordinates position in camera frustum (x: -1..1, y: -1..1, z: near..far). */
  ndcPosition: Vec3;
  /** Distance in meters from the top active framing gate line. */
  cameraTopEdgeDistM: number;
  severity: 'safe' | 'warning_near_gate' | 'breach_in_shot';
  message: string;
}

/** Master Soundstage Acoustics and Multi-Track Dialogue configuration. */
export interface AcousticsConfig {
  enabled: boolean;
  presetId?: string;
  /** Ambient soundstage noise floor in dBA (e.g. 30 dBA quiet, 45 dBA standard stage with air handling). */
  ambientNoiseFloorDba: number;
  /** Stage air temperature in degrees Celsius (default 20 C). */
  airTemperatureC: number;
  /** Relative humidity percentage (default 50 percent). */
  relativeHumidityPercent: number;
  boomMics: BoomMicEntity[];
  lavalierMics: LavalierMicEntity[];
  defaultCapsuleId: string;
  customRoomVolumeM3?: number;
  customAbsorptionCoeff?: number;
}

// ---------------------------------------------------------------------------
// Curated Transducer Capsule Profiles Catalog
// ---------------------------------------------------------------------------

export const CURATED_MIC_PROFILES: Record<string, MicCapsuleProfile> = {
  sennheiser_mkh416: {
    id: 'sennheiser_mkh416',
    name: 'Sennheiser MKH 416',
    manufacturer: 'Sennheiser',
    pattern: 'shotgun_supercardioid',
    sensitivityDbfs: -32.0,
    maxSplDb: 130.0,
    selfNoiseDba: 13.0,
    directivityIndexDb: 8.5,
    frontToBackRatioDb: 22.0,
    tubeLengthM: 0.25,
  },
  schoeps_cmc641: {
    id: 'schoeps_cmc641',
    name: 'Schoeps CMC641 (Colette MK41)',
    manufacturer: 'Schoeps',
    pattern: 'hypercardioid',
    sensitivityDbfs: -36.0,
    maxSplDb: 132.0,
    selfNoiseDba: 14.0,
    directivityIndexDb: 6.0,
    frontToBackRatioDb: 18.0,
    tubeLengthM: 0.05,
  },
  sanken_cs3e: {
    id: 'sanken_cs3e',
    name: 'Sanken CS-3e',
    manufacturer: 'Sanken',
    pattern: 'shotgun_supercardioid',
    sensitivityDbfs: -30.0,
    maxSplDb: 138.0,
    selfNoiseDba: 15.0,
    directivityIndexDb: 9.0,
    frontToBackRatioDb: 25.0,
    tubeLengthM: 0.27,
  },
  dpa_6060: {
    id: 'dpa_6060',
    name: 'DPA 6060 Subminiature Lav',
    manufacturer: 'DPA Microphones',
    pattern: 'omnidirectional',
    sensitivityDbfs: -34.0,
    maxSplDb: 134.0,
    selfNoiseDba: 24.0,
    directivityIndexDb: 0.0,
    frontToBackRatioDb: 0.0,
    tubeLengthM: 0.0,
  },
  sanken_cos11d: {
    id: 'sanken_cos11d',
    name: 'Sanken COS-11D Miniature Lav',
    manufacturer: 'Sanken',
    pattern: 'omnidirectional',
    sensitivityDbfs: -35.0,
    maxSplDb: 137.0,
    selfNoiseDba: 28.0,
    directivityIndexDb: 0.0,
    frontToBackRatioDb: 0.0,
    tubeLengthM: 0.0,
  },
  neumann_km184: {
    id: 'neumann_km184',
    name: 'Neumann KM 184',
    manufacturer: 'Neumann',
    pattern: 'cardioid',
    sensitivityDbfs: -33.0,
    maxSplDb: 138.0,
    selfNoiseDba: 13.0,
    directivityIndexDb: 4.8,
    frontToBackRatioDb: 25.0,
    tubeLengthM: 0.04,
  },
  ambisonic_b_format: {
    id: 'ambisonic_b_format',
    name: 'Ambisonic 1st-Order B-Format Array',
    manufacturer: 'Sennheiser / RODE',
    pattern: 'omnidirectional',
    sensitivityDbfs: -30.0,
    maxSplDb: 130.0,
    selfNoiseDba: 16.0,
    directivityIndexDb: 3.0,
    frontToBackRatioDb: 0.0,
    tubeLengthM: 0.08,
  },
};

// ---------------------------------------------------------------------------
// Architectural Material Acoustic Absorption Coefficients (125 Hz to 4 kHz)
// ---------------------------------------------------------------------------

export interface MaterialAcousticAbsorption {
  id: string;
  name: string;
  /** Octave band absorption coefficients: [125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz] */
  octaves: [number, number, number, number, number, number];
  /** Noise Reduction Coefficient (average of 250Hz, 500Hz, 1kHz, 2kHz). */
  nrc: number;
}

export const MATERIAL_ABSORPTION_TABLE: Record<string, MaterialAcousticAbsorption> = {
  painted_drywall: {
    id: 'painted_drywall',
    name: 'Painted Drywall / Gypsum Board',
    octaves: [0.29, 0.10, 0.05, 0.04, 0.07, 0.09],
    nrc: 0.065,
  },
  brick_exposed: {
    id: 'brick_exposed',
    name: 'Exposed Brickwork (Unpainted)',
    octaves: [0.03, 0.03, 0.03, 0.04, 0.05, 0.07],
    nrc: 0.04,
  },
  wood_slat_panel: {
    id: 'wood_slat_panel',
    name: 'Architectural Wood Slat Panel with Air Cavity',
    octaves: [0.35, 0.28, 0.22, 0.15, 0.10, 0.08],
    nrc: 0.19,
  },
  concrete_raw: {
    id: 'concrete_raw',
    name: 'Smooth Poured Concrete Wall',
    octaves: [0.01, 0.01, 0.015, 0.02, 0.02, 0.025],
    nrc: 0.02,
  },
  acoustic_fabric_panel: {
    id: 'acoustic_fabric_panel',
    name: 'Soundstage Acoustic Baffle / Mineral Wool Panel',
    octaves: [0.15, 0.35, 0.70, 0.85, 0.85, 0.80],
    nrc: 0.69,
  },
  subway_tile: {
    id: 'subway_tile',
    name: 'Glazed Ceramic Subway Tile',
    octaves: [0.01, 0.01, 0.01, 0.02, 0.02, 0.02],
    nrc: 0.015,
  },
  wallpaper_vintage: {
    id: 'wallpaper_vintage',
    name: 'Heavy Textured Wallpaper on Drywall',
    octaves: [0.04, 0.05, 0.06, 0.07, 0.08, 0.08],
    nrc: 0.065,
  },
  glass_curtain: {
    id: 'glass_curtain',
    name: 'Large Glass Window / Curtain Wall',
    octaves: [0.18, 0.06, 0.04, 0.03, 0.02, 0.02],
    nrc: 0.04,
  },
  ceiling_acoustic_tiles: {
    id: 'ceiling_acoustic_tiles',
    name: 'Acoustic Ceiling Tiles (Suspended Grid)',
    octaves: [0.40, 0.65, 0.80, 0.90, 0.90, 0.85],
    nrc: 0.81,
  },
  carpet_heavy_pad: {
    id: 'carpet_heavy_pad',
    name: 'Heavy Wool Carpet on Underlay Pad',
    octaves: [0.08, 0.25, 0.60, 0.70, 0.72, 0.75],
    nrc: 0.57,
  },
  hardwood_floor: {
    id: 'hardwood_floor',
    name: 'Hardwood Floor on Joists',
    octaves: [0.15, 0.11, 0.10, 0.07, 0.06, 0.07],
    nrc: 0.085,
  },
  concrete_floor: {
    id: 'concrete_floor',
    name: 'Soundstage Polished Concrete Stage Floor',
    octaves: [0.01, 0.01, 0.015, 0.02, 0.02, 0.02],
    nrc: 0.015,
  },
};

// ---------------------------------------------------------------------------
// Mathematical Solvers and Acoustics Formulation
// ---------------------------------------------------------------------------

/**
 * Calculates microphone polar directivity attenuation in decibels (dB <= 0)
 * at a given off-axis angle and frequency.
 */
export function calculatePolarAttenuation(
  pattern: MicPolarPattern,
  angleRad: number,
  frequencyHz: number = 1000,
  tubeLengthM: number = 0.25,
): number {
  const normAngle = Math.abs(angleRad) % (Math.PI * 2);
  const theta = normAngle > Math.PI ? Math.PI * 2 - normAngle : normAngle;
  const cosTheta = Math.cos(theta);

  let linearResponse = 1.0;

  switch (pattern) {
    case 'omnidirectional': {
      linearResponse = 1.0;
      break;
    }
    case 'cardioid': {
      linearResponse = Math.max(0.001, 0.5 + 0.5 * cosTheta);
      break;
    }
    case 'hypercardioid': {
      // Standard hypercardioid equation: 0.25 + 0.75 * cos(theta), nulls at ~109.5 degrees
      linearResponse = Math.max(0.001, Math.abs(0.25 + 0.75 * cosTheta));
      break;
    }
    case 'figure_eight': {
      linearResponse = Math.max(0.001, Math.abs(cosTheta));
      break;
    }
    case 'shotgun_supercardioid': {
      // Base supercardioid transducer response: 0.37 + 0.63 * cos(theta)
      const baseSupercardioid = Math.max(0.001, Math.abs(0.37 + 0.63 * cosTheta));

      // Phase interference cancellation through slotted acoustic tube:
      // cancellation index deltaPhase = (2 * pi * L * (1 - cos(theta))) / lambda
      const speedOfSound = 343.0; // m/s at 20 degrees C
      const wavelength = Math.max(0.01, speedOfSound / Math.max(20, frequencyHz));
      const tubeL = Math.max(0.05, tubeLengthM);

      const phaseDiff = (Math.PI * tubeL * (1.0 - cosTheta)) / wavelength;
      let tubeFactor = 1.0;
      if (Math.abs(phaseDiff) > 1e-4) {
        tubeFactor = Math.abs(Math.sin(phaseDiff) / phaseDiff);
      }
      linearResponse = Math.max(0.0005, baseSupercardioid * tubeFactor);
      break;
    }
  }

  const attenuationDb = 20.0 * Math.log10(Math.max(0.0001, linearResponse));
  return Math.min(0.0, attenuationDb);
}

/**
 * Computes soundstage room reverberation decay time (RT60) using Sabine and Norris-Eyring equations.
 */
export function calculateRt60Reverberation(
  roomVolumeM3: number,
  surfaces: { areaM2: number; absorptionCoeff: number }[],
): {
  sabineSec: number;
  eyringSec: number;
  avgAbsorption: number;
  totalAreaM2: number;
} {
  const safeVolume = Math.max(1.0, roomVolumeM3);

  let totalAreaM2 = 0;
  let totalAbsorptionA = 0;

  for (const surf of surfaces) {
    const area = Math.max(0.0, surf.areaM2);
    const coeff = Math.min(0.999, Math.max(0.001, surf.absorptionCoeff));
    totalAreaM2 += area;
    totalAbsorptionA += area * coeff;
  }

  if (totalAreaM2 < 0.01) {
    // Fallback default for studio box of 12m x 8m x 4.5m = 432 m3
    totalAreaM2 = 372.0;
    totalAbsorptionA = 372.0 * 0.25;
  }

  const avgAbsorption = Math.min(0.999, Math.max(0.001, totalAbsorptionA / totalAreaM2));

  // Sabine formula: RT60 = 0.161 * V / A
  const sabineSec = (0.161 * safeVolume) / Math.max(0.001, totalAbsorptionA);

  // Norris-Eyring formula: RT60 = 0.161 * V / (-S * ln(1 - avgAbsorption))
  const eyringDenominator = -totalAreaM2 * Math.log(1.0 - avgAbsorption);
  const eyringSec = (0.161 * safeVolume) / Math.max(0.001, eyringDenominator);

  return {
    sabineSec: Math.max(0.05, sabineSec),
    eyringSec: Math.max(0.05, eyringSec),
    avgAbsorption,
    totalAreaM2,
  };
}

/**
 * Calculates the acoustic critical distance where direct signal SPL equals reverberant field SPL.
 */
export function calculateCriticalDistance(
  roomVolumeM3: number,
  rt60Sec: number,
  directivityFactor: number = 2.0,
): number {
  const safeV = Math.max(1.0, roomVolumeM3);
  const safeRt60 = Math.max(0.05, rt60Sec);
  const safeQ = Math.max(1.0, directivityFactor);

  // Critical distance formula: rc = 0.057 * sqrt((Q * V) / RT60)
  const rc = 0.057 * Math.sqrt((safeQ * safeV) / safeRt60);
  return Math.max(0.1, rc);
}

/**
 * Calculates the speech clarity index (C50 in dB).
 * Early dialogue energy (0-50ms) compared to late diffuse reverberation energy.
 */
export function calculateSpeechClarityC50(
  rt60Sec: number,
  distanceM: number,
  criticalDistanceM: number,
): number {
  const safeRt60 = Math.max(0.05, rt60Sec);
  const safeDist = Math.max(0.1, distanceM);
  const safeRc = Math.max(0.1, criticalDistanceM);

  const directToReverbRatio = (safeRc * safeRc) / (safeDist * safeDist);
  const earlyReverbFactor = 1.0 - Math.exp(-1.1 / safeRt60);
  const lateReverbFactor = Math.exp(-1.1 / safeRt60);

  const clarityLinear = (directToReverbRatio + earlyReverbFactor) / Math.max(0.001, lateReverbFactor);
  return 10.0 * Math.log10(Math.max(0.001, clarityLinear));
}

/**
 * Evaluates real-time Sound Pressure Level, Signal-to-Noise ratio, and clipping for a microphone pick-up.
 */
export function calculateSplAndSnr(
  sourceSplAt1m: number,
  distanceM: number,
  offAxisAngleRad: number,
  capsule: MicCapsuleProfile,
  rt60Sec: number,
  roomVolumeM3: number,
  ambientNoiseDba: number = 35.0,
): MicSignalSample {
  const safeDist = Math.max(0.05, distanceM);
  const safeRt60 = Math.max(0.05, rt60Sec);
  const safeVol = Math.max(1.0, roomVolumeM3);

  // 1. Direct sound propagation with inverse-square law
  const distanceAttenuationDb = 20.0 * Math.log10(safeDist);
  const offAxisAttenuationDb = calculatePolarAttenuation(
    capsule.pattern,
    offAxisAngleRad,
    1000,
    capsule.tubeLengthM ?? 0.25,
  );
  const directSignalSpl = sourceSplAt1m - distanceAttenuationDb + offAxisAttenuationDb;

  // 2. Reverberant room diffuse field SPL
  // Diffuse energy level: SPL_rev = SPL_source + 10 * log10(4 * RT60 / (0.161 * V))
  const roomConstantFactor = (4.0 * safeRt60) / (0.161 * safeVol);
  const reverberantSignalSpl = sourceSplAt1m + 10.0 * Math.log10(Math.max(1e-6, roomConstantFactor));

  // 3. Total combined SPL
  const directLinear = Math.pow(10.0, directSignalSpl / 10.0);
  const revLinear = Math.pow(10.0, reverberantSignalSpl / 10.0);
  const totalSpl = 10.0 * Math.log10(Math.max(1e-4, directLinear + revLinear));

  // 4. SNR relative to noise floor
  const effectiveNoiseFloor = Math.max(ambientNoiseDba, capsule.selfNoiseDba);
  const snrDb = Math.max(0.0, totalSpl - effectiveNoiseFloor);

  // 5. Digital full-scale dBFS estimate
  // 94 dB SPL = 1 Pa -> produces capsule.sensitivityDbfs
  const totalLevelDbfs = capsule.sensitivityDbfs + (totalSpl - 94.0);
  const isClipping = totalSpl >= capsule.maxSplDb || totalLevelDbfs >= 0.0;

  return {
    directSignalDb: directSignalSpl,
    reverberantSignalDb: reverberantSignalSpl,
    totalLevelDb: totalLevelDbfs,
    snrDb,
    offAxisAttenuationDb,
    isClipping,
  };
}

/**
 * Calculates camera gate incursion clearance margin for a boom microphone.
 */
export function calculateBoomFrameIncursion(
  micCapsulePos: Vec3,
  micRadiusM: number,
  cameraPos: Vec3,
  cameraRot: Quat,
  cameraFovDeg: number,
  cameraAspect: number,
  nearClipM: number = 0.1,
  farClipM: number = 100.0,
): BoomIncursionAlert {
  // 1. Transform microphone position into camera view space
  const dx = micCapsulePos.x - cameraPos.x;
  const dy = micCapsulePos.y - cameraPos.y;
  const dz = micCapsulePos.z - cameraPos.z;

  // Inverse rotation by camera conjugate quaternion
  const qx = -cameraRot.x;
  const qy = -cameraRot.y;
  const qz = -cameraRot.z;
  const qw = cameraRot.w;

  // Quaternion multiply: q_conj * v * q
  const ix = qw * dx + qy * dz - qz * dy;
  const iy = qw * dy + qz * dx - qx * dz;
  const iz = qw * dz + qx * dy - qy * dx;
  const iw = -qx * dx - qy * dy - qz * dz;

  const viewX = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const viewY = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  const viewZ = -(iz * qw + iw * -qz + ix * -qy - iy * -qx); // -Z forward convention in camera coordinates

  // If mic is behind camera lens, it cannot be in shot
  if (viewZ <= nearClipM || viewZ > farClipM) {
    return {
      isIncursion: false,
      micId: 'boom_mic',
      cameraId: 'active_cam',
      marginM: 99.0,
      ndcPosition: { x: 0, y: 2.0, z: viewZ },
      cameraTopEdgeDistM: 99.0,
      severity: 'safe',
      message: 'Boom mic is safely outside camera view distance.',
    };
  }

  // 2. Compute camera vertical and horizontal half-angles
  const vFovRad = (cameraFovDeg * Math.PI) / 180.0;
  const halfV = Math.tan(vFovRad * 0.5);
  const halfH = halfV * cameraAspect;

  // 3. Project to Normalized Device Coordinates (-1..1)
  const ndcX = viewX / (viewZ * halfH);
  const ndcY = viewY / (viewZ * halfV);

  // 4. Frame boundary top edge distance in meters at camera depth viewZ
  const frameTopHeightM = viewZ * halfV;
  const micPhysicalTopEdgeDistM = viewY - frameTopHeightM; // Positive = above frame top, negative = dipping inside shot

  // 5. Clearance margin accounting for windscreen blimp physical radius
  const clearanceMarginM = micPhysicalTopEdgeDistM - micRadiusM;

  let severity: 'safe' | 'warning_near_gate' | 'breach_in_shot' = 'safe';
  let isIncursion = false;
  let message = 'Clearance OK: Boom is safely clear of camera framing gate.';

  if (clearanceMarginM <= 0.0 && Math.abs(ndcX) <= 1.05) {
    severity = 'breach_in_shot';
    isIncursion = true;
    message = `BOOM IN SHOT! Capsule breached top gate by ${Math.abs(clearanceMarginM).toFixed(2)}m.`;
  } else if (clearanceMarginM < 0.35 && Math.abs(ndcX) <= 1.15) {
    severity = 'warning_near_gate';
    isIncursion = false;
    message = `Frame Margin Warning: Boom is only ${(clearanceMarginM * 100).toFixed(0)}cm above gate.`;
  }

  return {
    isIncursion,
    micId: 'boom_mic',
    cameraId: 'active_cam',
    marginM: clearanceMarginM,
    ndcPosition: { x: ndcX, y: ndcY, z: viewZ },
    cameraTopEdgeDistM: clearanceMarginM,
    severity,
    message,
  };
}

// ---------------------------------------------------------------------------
// Sound Report and Metadata Exporters (BWF CSV and iXML Manifest)
// ---------------------------------------------------------------------------

/**
 * Generates an industry-standard Broadcast Wave Format (BWF) sound report CSV.
 * Compatible with Sound Devices Wave Agent, Aaton Cantar, and Pro Tools.
 */
export function generateBwfSoundReportCsv(
  config: AcousticsConfig,
  sceneName: string,
  timecode: string = '01:00:00:00',
): string {
  const lines: string[] = [];
  lines.push('Sound Devices / SetView Broadcast Wave Sound Report');
  lines.push(`Project: ${sceneName || 'SetView Virtual Production'}`);
  lines.push(`Date: ${new Date().toISOString().split('T')[0]}`);
  lines.push(`Start Timecode: ${timecode}`);
  lines.push(`Sample Rate: 48000 Hz, Bit Depth: 24-bit`);
  lines.push(`Ambient Noise: ${config.ambientNoiseFloorDba} dBA, Temp: ${config.airTemperatureC} C`);
  lines.push('');
  lines.push('Track,Track Name,Type,Capsule Model,Pattern,Gain (dB),Low Cut (Hz),Target Actor,Status');

  let trackIndex = 1;
  for (const boom of config.boomMics) {
    const profile = CURATED_MIC_PROFILES[boom.capsuleId] || CURATED_MIC_PROFILES.sennheiser_mkh416;
    lines.push(
      [
        `A${trackIndex++}`,
        `"${boom.name}"`,
        'Boom',
        `"${profile.name}"`,
        profile.pattern,
        `+${boom.gainDb.toFixed(1)}`,
        boom.lowCutHz > 0 ? `${boom.lowCutHz}Hz` : 'Flat',
        boom.targetActorId || 'General Set',
        boom.isMuted ? 'MUTED' : 'ACTIVE',
      ].join(','),
    );
  }

  for (const lav of config.lavalierMics) {
    const profile = CURATED_MIC_PROFILES[lav.capsuleId] || CURATED_MIC_PROFILES.dpa_6060;
    lines.push(
      [
        `A${trackIndex++}`,
        `"${lav.name}"`,
        'Lavalier',
        `"${profile.name}"`,
        profile.pattern,
        `+${lav.gainDb.toFixed(1)}`,
        '80Hz',
        lav.actorId || 'Talent',
        lav.isMuted ? 'MUTED' : 'ACTIVE',
      ].join(','),
    );
  }

  return lines.join('\r\n');
}

/**
 * Generates an AES31-3 / iXML Broadcast Wave metadata XML interchange manifest.
 */
export function generateAes31IxmlManifest(config: AcousticsConfig, sceneName: string): string {
  const safeScene = sceneName.replace(/[&<>"']/g, '_');
  const now = new Date().toISOString();

  let trackXml = '';
  let trackNum = 1;

  for (const boom of config.boomMics) {
    const profile = CURATED_MIC_PROFILES[boom.capsuleId] || CURATED_MIC_PROFILES.sennheiser_mkh416;
    trackXml += `    <TRACK>
      <CHANNEL_INDEX>${trackNum++}</CHANNEL_INDEX>
      <INTERLEAVE_INDEX>1</INTERLEAVE_INDEX>
      <NAME>${boom.name}</NAME>
      <FUNCTION>BOOM</FUNCTION>
      <TRANSDUCER_MODEL>${profile.name}</TRANSDUCER_MODEL>
      <POLAR_PATTERN>${profile.pattern}</POLAR_PATTERN>
      <GAIN_DB>${boom.gainDb.toFixed(1)}</GAIN_DB>
      <HPF_HZ>${boom.lowCutHz}</HPF_HZ>
      <MUTED>${boom.isMuted ? 'TRUE' : 'FALSE'}</MUTED>
    </TRACK>\n`;
  }

  for (const lav of config.lavalierMics) {
    const profile = CURATED_MIC_PROFILES[lav.capsuleId] || CURATED_MIC_PROFILES.dpa_6060;
    trackXml += `    <TRACK>
      <CHANNEL_INDEX>${trackNum++}</CHANNEL_INDEX>
      <INTERLEAVE_INDEX>1</INTERLEAVE_INDEX>
      <NAME>${lav.name}</NAME>
      <FUNCTION>LAVALIER</FUNCTION>
      <TRANSDUCER_MODEL>${profile.name}</TRANSDUCER_MODEL>
      <POLAR_PATTERN>${profile.pattern}</POLAR_PATTERN>
      <GAIN_DB>${lav.gainDb.toFixed(1)}</GAIN_DB>
      <HPF_HZ>80</HPF_HZ>
      <MUTED>${lav.isMuted ? 'TRUE' : 'FALSE'}</MUTED>
    </TRACK>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<BWFXML>
  <IXML_VERSION>2.0</IXML_VERSION>
  <PROJECT>${safeScene}</PROJECT>
  <SCENE>${safeScene}</SCENE>
  <TAKE>1</TAKE>
  <TAPE>SETVIEW_ROLL_001</TAPE>
  <DATE>${now.split('T')[0]}</DATE>
  <CIRCLED>TRUE</CIRCLED>
  <SPEED>
    <SAMPLE_RATE>48000</SAMPLE_RATE>
    <FRAME_RATE>24</FRAME_RATE>
  </SPEED>
  <AUDIO_METRICS>
    <AMBIENT_NOISE_DBA>${config.ambientNoiseFloorDba}</AMBIENT_NOISE_DBA>
    <AIR_TEMP_C>${config.airTemperatureC}</AIR_TEMP_C>
    <RELATIVE_HUMIDITY>${config.relativeHumidityPercent}</RELATIVE_HUMIDITY>
  </AUDIO_METRICS>
  <TRACK_LIST>
    <TRACK_COUNT>${config.boomMics.length + config.lavalierMics.length}</TRACK_COUNT>
${trackXml}  </TRACK_LIST>
</BWFXML>`;
}

// ---------------------------------------------------------------------------
// Factories, Type Guards, and Normalizers
// ---------------------------------------------------------------------------

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isVec3(v: unknown): v is Vec3 {
  const p = v as Vec3;
  return !!p && typeof p === 'object' && isFiniteNum(p.x) && isFiniteNum(p.y) && isFiniteNum(p.z);
}

function isQuat(v: unknown): v is Quat {
  const q = v as Quat;
  return (
    !!q &&
    typeof q === 'object' &&
    isFiniteNum(q.x) &&
    isFiniteNum(q.y) &&
    isFiniteNum(q.z) &&
    isFiniteNum(q.w)
  );
}

export function createBoomMicEntity(overrides?: Partial<BoomMicEntity>): BoomMicEntity {
  return {
    id: overrides?.id || `boom-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    name: overrides?.name || 'Boom 1 (Main Dialogue)',
    capsuleId: overrides?.capsuleId || 'sennheiser_mkh416',
    pole: {
      lengthM: overrides?.pole?.lengthM ?? 3.8,
      extensionM: overrides?.pole?.extensionM ?? 2.5,
      pivotHeightM: overrides?.pole?.pivotHeightM ?? 1.75,
      operatorPosition: overrides?.pole?.operatorPosition
        ? { ...overrides.pole.operatorPosition }
        : { x: 0, y: 0, z: 2.8 },
      targetPoint: overrides?.pole?.targetPoint
        ? { ...overrides.pole.targetPoint }
        : { x: 0, y: 1.65, z: 0 },
      dampingFactor: overrides?.pole?.dampingFactor ?? 0.85,
    },
    position: overrides?.position ? { ...overrides.position } : { x: 0, y: 2.2, z: 0.3 },
    orientation: overrides?.orientation
      ? { ...overrides.orientation }
      : { x: 0.3826834, y: 0, z: 0, w: 0.9238795 }, // Aimed down ~45 degrees
    targetActorId: overrides?.targetActorId,
    gainDb: overrides?.gainDb ?? 36.0,
    lowCutHz: overrides?.lowCutHz ?? 80,
    isMuted: overrides?.isMuted ?? false,
  };
}

export function isBoomMicEntity(v: unknown): v is BoomMicEntity {
  const b = v as BoomMicEntity;
  return (
    !!b &&
    typeof b === 'object' &&
    typeof b.id === 'string' &&
    typeof b.name === 'string' &&
    typeof b.capsuleId === 'string' &&
    isVec3(b.position) &&
    isQuat(b.orientation) &&
    !!b.pole &&
    typeof b.pole === 'object' &&
    isFiniteNum(b.pole.lengthM) &&
    isFiniteNum(b.pole.extensionM) &&
    isFiniteNum(b.pole.pivotHeightM) &&
    isVec3(b.pole.operatorPosition) &&
    isVec3(b.pole.targetPoint) &&
    isFiniteNum(b.gainDb) &&
    isFiniteNum(b.lowCutHz) &&
    typeof b.isMuted === 'boolean'
  );
}

export function normalizeBoomMicEntity(b: unknown): BoomMicEntity {
  if (!b || typeof b !== 'object') return createBoomMicEntity();
  const raw = b as Partial<BoomMicEntity>;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : `boom-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const name = typeof raw.name === 'string' && raw.name ? raw.name : 'Boom 1';
  const capsuleId = typeof raw.capsuleId === 'string' && CURATED_MIC_PROFILES[raw.capsuleId] ? raw.capsuleId : 'sennheiser_mkh416';
  const position = isVec3(raw.position) ? { ...raw.position } : { x: 0, y: 2.2, z: 0.3 };
  const orientation = isQuat(raw.orientation) ? { ...raw.orientation } : { x: 0.3826834, y: 0, z: 0, w: 0.9238795 };
  const targetActorId = typeof raw.targetActorId === 'string' ? raw.targetActorId : undefined;
  const gainDb = isFiniteNum(raw.gainDb) ? raw.gainDb : 36.0;
  const lowCutHz = isFiniteNum(raw.lowCutHz) && raw.lowCutHz >= 0 ? raw.lowCutHz : 80;
  const isMuted = typeof raw.isMuted === 'boolean' ? raw.isMuted : false;

  let pole: BoomPoleConfig;
  if (!raw.pole || typeof raw.pole !== 'object') {
    pole = {
      lengthM: 3.8,
      extensionM: 2.5,
      pivotHeightM: 1.75,
      operatorPosition: { x: 0, y: 0, z: 2.8 },
      targetPoint: { x: 0, y: 1.65, z: 0 },
      dampingFactor: 0.85,
    };
  } else {
    pole = {
      lengthM: isFiniteNum(raw.pole.lengthM) && raw.pole.lengthM > 0 ? raw.pole.lengthM : 3.8,
      extensionM: isFiniteNum(raw.pole.extensionM) && raw.pole.extensionM >= 0 ? raw.pole.extensionM : 2.5,
      pivotHeightM: isFiniteNum(raw.pole.pivotHeightM) && raw.pole.pivotHeightM >= 0 ? raw.pole.pivotHeightM : 1.75,
      operatorPosition: isVec3(raw.pole.operatorPosition) ? { ...raw.pole.operatorPosition } : { x: 0, y: 0, z: 2.8 },
      targetPoint: isVec3(raw.pole.targetPoint) ? { ...raw.pole.targetPoint } : { x: 0, y: 1.65, z: 0 },
      dampingFactor: isFiniteNum(raw.pole.dampingFactor) && raw.pole.dampingFactor >= 0 && raw.pole.dampingFactor <= 1 ? raw.pole.dampingFactor : 0.85,
    };
  }

  return {
    id,
    name,
    capsuleId,
    pole,
    position,
    orientation,
    targetActorId,
    gainDb,
    lowCutHz,
    isMuted,
  };
}

export function createLavalierMicEntity(overrides?: Partial<LavalierMicEntity>): LavalierMicEntity {
  return {
    id: overrides?.id || `lav-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    actorId: overrides?.actorId || '',
    name: overrides?.name || 'Lav 1',
    capsuleId: overrides?.capsuleId || 'dpa_6060',
    chestOffset: overrides?.chestOffset ? { ...overrides.chestOffset } : { x: 0, y: 1.35, z: 0.12 },
    gainDb: overrides?.gainDb ?? 30.0,
    isMuted: overrides?.isMuted ?? false,
  };
}

export function isLavalierMicEntity(v: unknown): v is LavalierMicEntity {
  const l = v as LavalierMicEntity;
  return (
    !!l &&
    typeof l === 'object' &&
    typeof l.id === 'string' &&
    typeof l.actorId === 'string' &&
    typeof l.name === 'string' &&
    typeof l.capsuleId === 'string' &&
    isVec3(l.chestOffset) &&
    isFiniteNum(l.gainDb) &&
    typeof l.isMuted === 'boolean'
  );
}

export function normalizeLavalierMicEntity(l: unknown): LavalierMicEntity {
  if (!l || typeof l !== 'object') return createLavalierMicEntity();
  const raw = l as Partial<LavalierMicEntity>;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `lav-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    actorId: typeof raw.actorId === 'string' ? raw.actorId : '',
    name: typeof raw.name === 'string' && raw.name ? raw.name : 'Lav 1',
    capsuleId: typeof raw.capsuleId === 'string' && CURATED_MIC_PROFILES[raw.capsuleId] ? raw.capsuleId : 'dpa_6060',
    chestOffset: isVec3(raw.chestOffset) ? { ...raw.chestOffset } : { x: 0, y: 1.35, z: 0.12 },
    gainDb: isFiniteNum(raw.gainDb) ? raw.gainDb : 30.0,
    isMuted: typeof raw.isMuted === 'boolean' ? raw.isMuted : false,
  };
}

export const STOCK_ACOUSTICS_PRESETS = {
  dialogue_soundstage: { id: 'dialogue_soundstage', name: 'Dialogue Soundstage', description: 'Treated soundstage with low ambient floor' },
  int_location: { id: 'int_location', name: 'Interior Location', description: 'Real interior apartment/office with moderate reflections' },
  reverberant_hall: { id: 'reverberant_hall', name: 'Reverberant Hall', description: 'Echoic acoustic environment with long RT60 decay' },
} as const;

export type StockAcousticsPresetId = keyof typeof STOCK_ACOUSTICS_PRESETS;

export function createAcousticsConfig(
  preset: StockAcousticsPresetId | 'dialogue_soundstage' | 'int_location' | 'reverberant_hall' = 'dialogue_soundstage',
): AcousticsConfig {
  switch (preset) {
    case 'int_location':
      return {
        enabled: true,
        presetId: 'int_location',
        ambientNoiseFloorDba: 42.0,
        airTemperatureC: 21.0,
        relativeHumidityPercent: 45.0,
        boomMics: [
          createBoomMicEntity({
            name: 'Boom 1 (Interior Shotgun)',
            capsuleId: 'schoeps_cmc641',
            position: { x: 0, y: 2.1, z: 0.4 },
          }),
        ],
        lavalierMics: [],
        defaultCapsuleId: 'schoeps_cmc641',
        customRoomVolumeM3: 150.0,
        customAbsorptionCoeff: 0.18,
      };
    case 'reverberant_hall':
      return {
        enabled: true,
        presetId: 'reverberant_hall',
        ambientNoiseFloorDba: 48.0,
        airTemperatureC: 18.0,
        relativeHumidityPercent: 60.0,
        boomMics: [
          createBoomMicEntity({
            name: 'Boom 1 (High-Rejection CS-3e)',
            capsuleId: 'sanken_cs3e',
            position: { x: 0, y: 2.3, z: 0.5 },
          }),
        ],
        lavalierMics: [],
        defaultCapsuleId: 'sanken_cs3e',
        customRoomVolumeM3: 1200.0,
        customAbsorptionCoeff: 0.08,
      };
    case 'dialogue_soundstage':
    default:
      return {
        enabled: true,
        presetId: 'dialogue_soundstage',
        ambientNoiseFloorDba: 35.0,
        airTemperatureC: 20.0,
        relativeHumidityPercent: 50.0,
        boomMics: [
          createBoomMicEntity({
            name: 'Boom 1 (MKH 416)',
            capsuleId: 'sennheiser_mkh416',
            position: { x: 0, y: 2.2, z: 0.3 },
          }),
        ],
        lavalierMics: [],
        defaultCapsuleId: 'sennheiser_mkh416',
        customRoomVolumeM3: 450.0,
        customAbsorptionCoeff: 0.45,
      };
  }
}

export function isAcousticsConfig(v: unknown): v is AcousticsConfig {
  const c = v as AcousticsConfig;
  return (
    !!c &&
    typeof c === 'object' &&
    typeof c.enabled === 'boolean' &&
    isFiniteNum(c.ambientNoiseFloorDba) &&
    isFiniteNum(c.airTemperatureC) &&
    isFiniteNum(c.relativeHumidityPercent) &&
    Array.isArray(c.boomMics) &&
    c.boomMics.every(isBoomMicEntity) &&
    Array.isArray(c.lavalierMics) &&
    c.lavalierMics.every(isLavalierMicEntity) &&
    typeof c.defaultCapsuleId === 'string'
  );
}

export function normalizeAcousticsConfig(c: unknown): AcousticsConfig {
  if (!c || typeof c !== 'object') return createAcousticsConfig();
  const cfg = { ...(c as AcousticsConfig) };
  if (typeof cfg.enabled !== 'boolean') cfg.enabled = true;
  if (!isFiniteNum(cfg.ambientNoiseFloorDba) || cfg.ambientNoiseFloorDba < 10) cfg.ambientNoiseFloorDba = 35.0;
  if (!isFiniteNum(cfg.airTemperatureC) || cfg.airTemperatureC < -20 || cfg.airTemperatureC > 50) cfg.airTemperatureC = 20.0;
  if (!isFiniteNum(cfg.relativeHumidityPercent) || cfg.relativeHumidityPercent < 0 || cfg.relativeHumidityPercent > 100) {
    cfg.relativeHumidityPercent = 50.0;
  }
  if (!Array.isArray(cfg.boomMics)) {
    cfg.boomMics = [createBoomMicEntity()];
  } else {
    cfg.boomMics = cfg.boomMics.filter(isBoomMicEntity).map(normalizeBoomMicEntity);
    if (cfg.boomMics.length === 0) cfg.boomMics.push(createBoomMicEntity());
  }
  if (!Array.isArray(cfg.lavalierMics)) {
    cfg.lavalierMics = [];
  } else {
    cfg.lavalierMics = cfg.lavalierMics.filter(isLavalierMicEntity).map(normalizeLavalierMicEntity);
  }
  if (typeof cfg.defaultCapsuleId !== 'string' || !CURATED_MIC_PROFILES[cfg.defaultCapsuleId]) {
    cfg.defaultCapsuleId = 'sennheiser_mkh416';
  }
  if (cfg.customRoomVolumeM3 !== undefined && (!isFiniteNum(cfg.customRoomVolumeM3) || cfg.customRoomVolumeM3 <= 0)) {
    delete cfg.customRoomVolumeM3;
  }
  if (
    cfg.customAbsorptionCoeff !== undefined &&
    (!isFiniteNum(cfg.customAbsorptionCoeff) || cfg.customAbsorptionCoeff <= 0 || cfg.customAbsorptionCoeff > 1.0)
  ) {
    delete cfg.customAbsorptionCoeff;
  }
  return cfg;
}
