// ---------------------------------------------------------------------------
// SetView Pure Domain VR Motion Sickness, Ergonomics & Spatial Comfort Engine
// PURE DOMAIN MODULE - ZERO Three.js or DOM imports.
// Suitable for direct execution in Node.js unit tests and headless runtimes.
// ---------------------------------------------------------------------------

export type ComfortLocomotionMode =
  | 'teleport'
  | 'snap_turn'
  | 'smooth_locomotion'
  | 'smooth_turn'
  | 'roomscale';

export type ReachZoneClassification =
  | 'optimal_reach'
  | 'acceptable_reach'
  | 'excessive_reach'
  | 'near_eye_strain';

export type NeckStrainSeverity =
  | 'neutral'
  | 'moderate'
  | 'excessive'
  | 'severe';

export interface VestibularStateSample {
  timestampMs: number;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  acceleration: { x: number; y: number; z: number };
  jerk: { x: number; y: number; z: number };
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  angularVelocityDegSec: number;
  angularJerkDegSec3: number;
}

export interface ErgonomicReachTarget {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  category: 'ui_panel' | 'prop' | 'camera_grip' | 'wrist_menu' | 'actor';
}

export interface ReachEvaluation {
  targetId: string;
  targetName: string;
  distanceM: number;
  elevationDeltaM: number;
  classification: ReachZoneClassification;
  isWithinArmSpan: boolean;
  vergenceDiscomfortRisk: boolean;
}

export interface NeckStrainEvaluation {
  pitchDeg: number;
  rollDeg: number;
  pitchSeverity: NeckStrainSeverity;
  rollSeverity: NeckStrainSeverity;
  isFatigueProne: boolean;
}

export interface FOVComfortVignetteConfig {
  enabled: boolean;
  maxVignetteRadius: number;
  minVignetteRadius: number;
  speedThresholdMPerSec: number;
  turnThresholdDegPerSec: number;
  fadeSpeedMs: number;
}

export interface VRComfortConfig {
  enabled: boolean;
  locomotionMode: ComfortLocomotionMode;
  snapTurnAngleDeg: 15 | 30 | 45 | 90;
  vignette: FOVComfortVignetteConfig;
  maxLinearAccelerationMPerSec2: number;
  maxLinearJerkMPerSec3: number;
  maxAngularVelocityDegPerSec: number;
  maxAngularJerkDegPerSec3: number;
  userEyeHeightM: number;
  userArmLengthM: number;
  userIpdM: number;
}

export interface ComfortDiscomfortIncident {
  timestampMs: number;
  type:
    | 'vestibular_jerk'
    | 'excessive_angular_accel'
    | 'reach_strain'
    | 'neck_strain'
    | 'vergence_strain'
    | 'scale_mismatch';
  severity: 'warning' | 'critical';
  description: string;
  metricValue: number;
  limitValue: number;
}

export interface ComfortAuditReport {
  totalDurationSec: number;
  comfortScore: number;
  comfortGrade: 'A' | 'B' | 'C' | 'F';
  locomotionMode: ComfortLocomotionMode;
  peakLinearAccelerationMPerSec2: number;
  peakLinearJerkMPerSec3: number;
  peakAngularVelocityDegPerSec: number;
  peakAngularJerkDegPerSec3: number;
  totalIncidentsCount: number;
  incidents: ComfortDiscomfortIncident[];
  reachEvaluations: ReachEvaluation[];
  neckEvaluation: NeckStrainEvaluation;
  passedAudit: boolean;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Helpers & Math Utilities
// ---------------------------------------------------------------------------

function normalizeAngleDiff(angleDeg: number, prevAngleDeg: number): number {
  let diff = (angleDeg - prevAngleDeg) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Factory & Normalization Functions
// ---------------------------------------------------------------------------

export function createDefaultVignetteConfig(
  partial?: Partial<FOVComfortVignetteConfig>,
): FOVComfortVignetteConfig {
  return {
    enabled: partial?.enabled ?? true,
    maxVignetteRadius:
      typeof partial?.maxVignetteRadius === 'number' && Number.isFinite(partial.maxVignetteRadius)
        ? clamp(partial.maxVignetteRadius, 0.1, 1.0)
        : 1.0,
    minVignetteRadius:
      typeof partial?.minVignetteRadius === 'number' && Number.isFinite(partial.minVignetteRadius)
        ? clamp(partial.minVignetteRadius, 0.1, 0.9)
        : 0.35,
    speedThresholdMPerSec:
      typeof partial?.speedThresholdMPerSec === 'number' && Number.isFinite(partial.speedThresholdMPerSec)
        ? Math.max(0.0, partial.speedThresholdMPerSec)
        : 0.8,
    turnThresholdDegPerSec:
      typeof partial?.turnThresholdDegPerSec === 'number' && Number.isFinite(partial.turnThresholdDegPerSec)
        ? Math.max(0.0, partial.turnThresholdDegPerSec)
        : 35.0,
    fadeSpeedMs:
      typeof partial?.fadeSpeedMs === 'number' && Number.isFinite(partial.fadeSpeedMs)
        ? Math.max(10, partial.fadeSpeedMs)
        : 120,
  };
}

export function createDefaultComfortConfig(
  partial?: Partial<VRComfortConfig>,
): VRComfortConfig {
  const rawSnap = partial?.snapTurnAngleDeg;
  const snapTurnAngleDeg: 15 | 30 | 45 | 90 =
    rawSnap === 15 || rawSnap === 30 || rawSnap === 45 || rawSnap === 90
      ? rawSnap
      : 45;

  const validModes: ComfortLocomotionMode[] = [
    'teleport',
    'snap_turn',
    'smooth_locomotion',
    'smooth_turn',
    'roomscale',
  ];
  const locomotionMode: ComfortLocomotionMode =
    partial?.locomotionMode && validModes.includes(partial.locomotionMode)
      ? partial.locomotionMode
      : 'snap_turn';

  return {
    enabled: partial?.enabled ?? true,
    locomotionMode,
    snapTurnAngleDeg,
    vignette: createDefaultVignetteConfig(partial?.vignette),
    maxLinearAccelerationMPerSec2:
      typeof partial?.maxLinearAccelerationMPerSec2 === 'number' && Number.isFinite(partial.maxLinearAccelerationMPerSec2)
        ? Math.max(0.1, partial.maxLinearAccelerationMPerSec2)
        : 3.0,
    maxLinearJerkMPerSec3:
      typeof partial?.maxLinearJerkMPerSec3 === 'number' && Number.isFinite(partial.maxLinearJerkMPerSec3)
        ? Math.max(0.1, partial.maxLinearJerkMPerSec3)
        : 6.0,
    maxAngularVelocityDegPerSec:
      typeof partial?.maxAngularVelocityDegPerSec === 'number' && Number.isFinite(partial.maxAngularVelocityDegPerSec)
        ? Math.max(1.0, partial.maxAngularVelocityDegPerSec)
        : 60.0,
    maxAngularJerkDegPerSec3:
      typeof partial?.maxAngularJerkDegPerSec3 === 'number' && Number.isFinite(partial.maxAngularJerkDegPerSec3)
        ? Math.max(1.0, partial.maxAngularJerkDegPerSec3)
        : 180.0,
    userEyeHeightM:
      typeof partial?.userEyeHeightM === 'number' && Number.isFinite(partial.userEyeHeightM)
        ? clamp(partial.userEyeHeightM, 0.5, 2.5)
        : 1.65,
    userArmLengthM:
      typeof partial?.userArmLengthM === 'number' && Number.isFinite(partial.userArmLengthM)
        ? clamp(partial.userArmLengthM, 0.3, 1.2)
        : 0.65,
    userIpdM:
      typeof partial?.userIpdM === 'number' && Number.isFinite(partial.userIpdM)
        ? clamp(partial.userIpdM, 0.045, 0.08)
        : 0.063,
  };
}

export function createVRComfortConfig(
  partial?: Partial<VRComfortConfig>,
): VRComfortConfig {
  return createDefaultComfortConfig(partial);
}

export function isVRComfortConfig(val: unknown): val is VRComfortConfig {
  if (!val || typeof val !== 'object') return false;
  const c = val as Record<string, unknown>;
  const validModes: ComfortLocomotionMode[] = [
    'teleport',
    'snap_turn',
    'smooth_locomotion',
    'smooth_turn',
    'roomscale',
  ];
  const validSnaps = [15, 30, 45, 90];

  return (
    typeof c.enabled === 'boolean' &&
    typeof c.locomotionMode === 'string' &&
    validModes.includes(c.locomotionMode as ComfortLocomotionMode) &&
    typeof c.snapTurnAngleDeg === 'number' &&
    validSnaps.includes(c.snapTurnAngleDeg) &&
    c.vignette !== null &&
    typeof c.vignette === 'object' &&
    typeof (c.vignette as Record<string, unknown>).enabled === 'boolean' &&
    typeof c.maxLinearAccelerationMPerSec2 === 'number' &&
    typeof c.maxLinearJerkMPerSec3 === 'number' &&
    typeof c.maxAngularVelocityDegPerSec === 'number' &&
    typeof c.maxAngularJerkDegPerSec3 === 'number' &&
    typeof c.userEyeHeightM === 'number' &&
    typeof c.userArmLengthM === 'number' &&
    typeof c.userIpdM === 'number'
  );
}

export function normalizeVRComfortConfig(val: unknown): VRComfortConfig {
  if (!val || typeof val !== 'object') {
    return createDefaultComfortConfig();
  }
  const raw = val as Partial<VRComfortConfig>;
  return createDefaultComfortConfig(raw);
}

// ---------------------------------------------------------------------------
// Kinematics & Motion Calculations
// ---------------------------------------------------------------------------

export function calculateVestibularKinematics(
  previousSample: VestibularStateSample | null,
  currentPos: { x: number; y: number; z: number },
  currentYawPitchRoll: { yawDeg: number; pitchDeg: number; rollDeg: number },
  dtSec: number,
  timestampMs?: number,
): VestibularStateSample {
  const effectiveDt = dtSec > 0.0001 ? dtSec : 1 / 72;
  const ts = typeof timestampMs === 'number' && Number.isFinite(timestampMs)
    ? timestampMs
    : (previousSample ? previousSample.timestampMs + effectiveDt * 1000 : 0);

  if (!previousSample) {
    return {
      timestampMs: ts,
      position: { x: currentPos.x, y: currentPos.y, z: currentPos.z },
      velocity: { x: 0, y: 0, z: 0 },
      acceleration: { x: 0, y: 0, z: 0 },
      jerk: { x: 0, y: 0, z: 0 },
      yawDeg: currentYawPitchRoll.yawDeg,
      pitchDeg: currentYawPitchRoll.pitchDeg,
      rollDeg: currentYawPitchRoll.rollDeg,
      angularVelocityDegSec: 0,
      angularJerkDegSec3: 0,
    };
  }

  // Linear velocity
  const vx = (currentPos.x - previousSample.position.x) / effectiveDt;
  const vy = (currentPos.y - previousSample.position.y) / effectiveDt;
  const vz = (currentPos.z - previousSample.position.z) / effectiveDt;

  // Linear acceleration
  const ax = (vx - previousSample.velocity.x) / effectiveDt;
  const ay = (vy - previousSample.velocity.y) / effectiveDt;
  const az = (vz - previousSample.velocity.z) / effectiveDt;

  // Linear jerk
  const jx = (ax - previousSample.acceleration.x) / effectiveDt;
  const jy = (ay - previousSample.acceleration.y) / effectiveDt;
  const jz = (az - previousSample.acceleration.z) / effectiveDt;

  // Angular velocity
  const dYaw = normalizeAngleDiff(currentYawPitchRoll.yawDeg, previousSample.yawDeg);
  const dPitch = normalizeAngleDiff(currentYawPitchRoll.pitchDeg, previousSample.pitchDeg);
  const dRoll = normalizeAngleDiff(currentYawPitchRoll.rollDeg, previousSample.rollDeg);

  const angularDist = Math.hypot(dYaw, dPitch, dRoll);
  const angularVelocity = angularDist / effectiveDt;

  // Angular jerk (rate of change in angular acceleration / velocity rate)
  const dAngularVel = Math.abs(angularVelocity - previousSample.angularVelocityDegSec);
  const angularJerk = dAngularVel / (effectiveDt * effectiveDt);

  return {
    timestampMs: ts,
    position: { x: currentPos.x, y: currentPos.y, z: currentPos.z },
    velocity: { x: vx, y: vy, z: vz },
    acceleration: { x: ax, y: ay, z: az },
    jerk: { x: jx, y: jy, z: jz },
    yawDeg: currentYawPitchRoll.yawDeg,
    pitchDeg: currentYawPitchRoll.pitchDeg,
    rollDeg: currentYawPitchRoll.rollDeg,
    angularVelocityDegSec: angularVelocity,
    angularJerkDegSec3: angularJerk,
  };
}

// ---------------------------------------------------------------------------
// Ergonomics: Reach & Neck Strain Evaluators
// ---------------------------------------------------------------------------

export function evaluateReachability(
  targetPosOrTarget: { x: number; y: number; z: number } | ErgonomicReachTarget,
  shoulderOrigin: { x: number; y: number; z: number },
  armLengthM: number,
  targetName?: string,
  targetId?: string,
): ReachEvaluation {
  const isTargetObj = 'category' in targetPosOrTarget;
  const targetPos = isTargetObj
    ? targetPosOrTarget.position
    : (targetPosOrTarget as { x: number; y: number; z: number });
  const id = isTargetObj ? targetPosOrTarget.id : (targetId ?? 'target');
  const name = isTargetObj ? targetPosOrTarget.name : (targetName ?? 'Target');

  const dx = targetPos.x - shoulderOrigin.x;
  const dy = targetPos.y - shoulderOrigin.y;
  const dz = targetPos.z - shoulderOrigin.z;
  const distanceM = Math.hypot(dx, dy, dz);
  const elevationDeltaM = dy;

  const effectiveArmLength = armLengthM > 0.1 ? armLengthM : 0.65;
  const isWithinArmSpan = distanceM <= effectiveArmLength;
  const vergenceDiscomfortRisk = distanceM < 0.25;

  let classification: ReachZoneClassification;
  if (vergenceDiscomfortRisk) {
    classification = 'near_eye_strain';
  } else if (distanceM >= 0.35 && distanceM <= 0.55) {
    classification = 'optimal_reach';
  } else if (distanceM <= effectiveArmLength) {
    classification = 'acceptable_reach';
  } else {
    classification = 'excessive_reach';
  }

  return {
    targetId: id,
    targetName: name,
    distanceM: Math.round(distanceM * 1000) / 1000,
    elevationDeltaM: Math.round(elevationDeltaM * 1000) / 1000,
    classification,
    isWithinArmSpan,
    vergenceDiscomfortRisk,
  };
}

export function evaluateNeckStrain(
  pitchDeg: number,
  rollDeg: number,
): NeckStrainEvaluation {
  const absPitch = Math.abs(pitchDeg);
  const absRoll = Math.abs(rollDeg);

  let pitchSeverity: NeckStrainSeverity;
  if (absPitch <= 15) {
    pitchSeverity = 'neutral';
  } else if (absPitch <= 30) {
    pitchSeverity = 'moderate';
  } else if (absPitch <= 45) {
    pitchSeverity = 'excessive';
  } else {
    pitchSeverity = 'severe';
  }

  let rollSeverity: NeckStrainSeverity;
  if (absRoll <= 10) {
    rollSeverity = 'neutral';
  } else if (absRoll <= 20) {
    rollSeverity = 'moderate';
  } else if (absRoll <= 30) {
    rollSeverity = 'excessive';
  } else {
    rollSeverity = 'severe';
  }

  const isFatigueProne =
    pitchSeverity === 'excessive' ||
    pitchSeverity === 'severe' ||
    rollSeverity === 'excessive' ||
    rollSeverity === 'severe' ||
    (absPitch > 25 && absRoll > 15);

  return {
    pitchDeg: Math.round(pitchDeg * 10) / 10,
    rollDeg: Math.round(rollDeg * 10) / 10,
    pitchSeverity,
    rollSeverity,
    isFatigueProne,
  };
}

// ---------------------------------------------------------------------------
// Dynamic Vignette & Cybersickness Index Math
// ---------------------------------------------------------------------------

export function calculateDynamicComfortVignetteRadius(
  linearSpeed: number,
  angularSpeedDegSec: number,
  config: FOVComfortVignetteConfig,
): number {
  if (!config.enabled) {
    return 1.0;
  }

  const maxR = config.maxVignetteRadius;
  const minR = config.minVignetteRadius;

  let linearFactor = 0;
  if (linearSpeed > config.speedThresholdMPerSec) {
    linearFactor = clamp((linearSpeed - config.speedThresholdMPerSec) / 2.0, 0, 1);
  }

  let angularFactor = 0;
  if (angularSpeedDegSec > config.turnThresholdDegPerSec) {
    angularFactor = clamp((angularSpeedDegSec - config.turnThresholdDegPerSec) / 60.0, 0, 1);
  }

  const combinedIntensity = Math.min(1.0, Math.max(linearFactor, angularFactor));
  const targetRadius = maxR - combinedIntensity * (maxR - minR);

  return clamp(targetRadius, minR, maxR);
}

export function calculateCybersicknessIndex(
  linearJerk: number,
  angularJerk: number,
  durationSec: number,
  locomotionMode: ComfortLocomotionMode,
): number {
  const modeWeights: Record<ComfortLocomotionMode, number> = {
    teleport: 0.15,
    snap_turn: 0.25,
    roomscale: 0.20,
    smooth_locomotion: 0.80,
    smooth_turn: 1.00,
  };

  const modeWeight = modeWeights[locomotionMode] ?? 0.50;
  const linearJerkScore = Math.min(50, (Math.max(0, linearJerk) / 6.0) * 45);
  const angularJerkScore = Math.min(50, (Math.max(0, angularJerk) / 180.0) * 55);

  const durationFactor = Math.min(
    1.5,
    0.8 + 0.2 * Math.log10(Math.max(1, durationSec)),
  );

  const rawIndex = (linearJerkScore + angularJerkScore) * modeWeight * durationFactor;
  return Math.round(clamp(rawIndex, 0, 100) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Scene Comfort Audit Solver
// ---------------------------------------------------------------------------

export function auditSceneComfort(
  sceneData: any,
  config: VRComfortConfig,
  samples?: VestibularStateSample[],
): ComfortAuditReport {
  const incidents: ComfortDiscomfortIncident[] = [];
  const recommendations: string[] = [];

  const effectiveEyeHeight = config.userEyeHeightM || 1.65;
  const shoulderOrigin = {
    x: 0,
    y: Math.max(0.3, effectiveEyeHeight - 0.25),
    z: 0,
  };

  // 1. Interactive Reach Evaluations
  const reachEvaluations: ReachEvaluation[] = [];

  if (Array.isArray(sceneData)) {
    for (const target of sceneData) {
      if (target && target.position) {
        const evalResult = evaluateReachability(
          target.position,
          shoulderOrigin,
          config.userArmLengthM,
          target.name || `Target ${target.id}`,
          target.id,
        );
        reachEvaluations.push(evalResult);

        if (evalResult.classification === 'near_eye_strain') {
          incidents.push({
            timestampMs: Date.now(),
            type: 'vergence_strain',
            severity: 'warning',
            description: `Target "${evalResult.targetName}" is placed closer than 0.25m from viewer, causing vergence-accommodation conflict.`,
            metricValue: evalResult.distanceM,
            limitValue: 0.25,
          });
        } else if (evalResult.classification === 'excessive_reach') {
          incidents.push({
            timestampMs: Date.now(),
            type: 'reach_strain',
            severity: 'warning',
            description: `Target "${evalResult.targetName}" is at ${evalResult.distanceM}m, outside comfortable arm reach (${config.userArmLengthM}m).`,
            metricValue: evalResult.distanceM,
            limitValue: config.userArmLengthM,
          });
        }
      }
    }
  }

  // Evaluate UI and props reachability
  if (sceneData?.props && Array.isArray(sceneData.props)) {
    for (const prop of sceneData.props) {
      if (prop.position) {
        const evalResult = evaluateReachability(
          prop.position,
          shoulderOrigin,
          config.userArmLengthM,
          prop.name || `Prop ${prop.id}`,
          prop.id,
        );
        reachEvaluations.push(evalResult);

        if (evalResult.classification === 'near_eye_strain') {
          incidents.push({
            timestampMs: Date.now(),
            type: 'vergence_strain',
            severity: 'warning',
            description: `Prop "${evalResult.targetName}" is placed closer than 0.25m from viewer, causing vergence-accommodation conflict.`,
            metricValue: evalResult.distanceM,
            limitValue: 0.25,
          });
        } else if (evalResult.classification === 'excessive_reach') {
          incidents.push({
            timestampMs: Date.now(),
            type: 'reach_strain',
            severity: 'warning',
            description: `Prop "${evalResult.targetName}" is at ${evalResult.distanceM}m, outside comfortable arm reach (${config.userArmLengthM}m).`,
            metricValue: evalResult.distanceM,
            limitValue: config.userArmLengthM,
          });
        }
      }
    }
  }

  // Evaluate camera viewpoints and look targets
  let maxPitch = 0;
  let maxRoll = 0;
  if (sceneData?.cameras && Array.isArray(sceneData.cameras)) {
    for (const cam of sceneData.cameras) {
      if (cam.position) {
        const evalResult = evaluateReachability(
          cam.position,
          shoulderOrigin,
          config.userArmLengthM,
          cam.name || `Camera ${cam.id}`,
          cam.id,
        );
        reachEvaluations.push(evalResult);
      }
      if (typeof cam.tiltDeg === 'number') {
        const pitch = Math.abs(cam.tiltDeg);
        if (pitch > maxPitch) maxPitch = pitch;
      }
      if (typeof cam.rollDeg === 'number') {
        const roll = Math.abs(cam.rollDeg);
        if (roll > maxRoll) maxRoll = roll;
      }
    }
  }

  const neckEvaluation = evaluateNeckStrain(maxPitch, maxRoll);
  if (neckEvaluation.pitchSeverity === 'severe' || neckEvaluation.pitchSeverity === 'excessive') {
    incidents.push({
      timestampMs: Date.now(),
      type: 'neck_strain',
      severity: neckEvaluation.pitchSeverity === 'severe' ? 'critical' : 'warning',
      description: `Camera tilt pitch of ${neckEvaluation.pitchDeg}deg exceeds ergonomic comfort limit (30deg).`,
      metricValue: Math.abs(neckEvaluation.pitchDeg),
      limitValue: 30.0,
    });
  }
  if (neckEvaluation.rollSeverity === 'severe' || neckEvaluation.rollSeverity === 'excessive') {
    incidents.push({
      timestampMs: Date.now(),
      type: 'neck_strain',
      severity: neckEvaluation.rollSeverity === 'severe' ? 'critical' : 'warning',
      description: `Camera roll of ${neckEvaluation.rollDeg}deg causes lateral cervical strain.`,
      metricValue: Math.abs(neckEvaluation.rollDeg),
      limitValue: 20.0,
    });
  }

  // 2. Vestibular Kinematics Analysis
  let peakLinearAcc = 0;
  let peakLinearJerk = 0;
  let peakAngVel = 0;
  let peakAngJerk = 0;
  let totalDurationSec = 0;

  if (samples && samples.length > 0) {
    const firstTs = samples[0].timestampMs;
    const lastTs = samples[samples.length - 1].timestampMs;
    totalDurationSec = Math.max(0.1, (lastTs - firstTs) / 1000);

    for (const s of samples) {
      const linAcc = Math.hypot(s.acceleration.x, s.acceleration.y, s.acceleration.z);
      const linJerk = Math.hypot(s.jerk.x, s.jerk.y, s.jerk.z);
      const angVel = s.angularVelocityDegSec;
      const angJerk = s.angularJerkDegSec3;

      if (linAcc > peakLinearAcc) peakLinearAcc = linAcc;
      if (linJerk > peakLinearJerk) peakLinearJerk = linJerk;
      if (angVel > peakAngVel) peakAngVel = angVel;
      if (angJerk > peakAngJerk) peakAngJerk = angJerk;

      if (linJerk > config.maxLinearJerkMPerSec3) {
        incidents.push({
          timestampMs: s.timestampMs,
          type: 'vestibular_jerk',
          severity: linJerk > config.maxLinearJerkMPerSec3 * 1.5 ? 'critical' : 'warning',
          description: `Linear jerk peak ${linJerk.toFixed(2)} m/s3 exceeds comfort threshold (${config.maxLinearJerkMPerSec3} m/s3).`,
          metricValue: linJerk,
          limitValue: config.maxLinearJerkMPerSec3,
        });
      }

      if (angVel > config.maxAngularVelocityDegPerSec) {
        incidents.push({
          timestampMs: s.timestampMs,
          type: 'excessive_angular_accel',
          severity: angVel > config.maxAngularVelocityDegPerSec * 1.5 ? 'critical' : 'warning',
          description: `Angular velocity ${angVel.toFixed(1)} deg/s exceeds comfort threshold (${config.maxAngularVelocityDegPerSec} deg/s).`,
          metricValue: angVel,
          limitValue: config.maxAngularVelocityDegPerSec,
        });
      }
    }
  }

  // 3. Locomotion Mode Specific Checks
  if (config.locomotionMode === 'smooth_turn' && !config.vignette.enabled) {
    incidents.push({
      timestampMs: Date.now(),
      type: 'excessive_angular_accel',
      severity: 'critical',
      description: 'Smooth yaw turning without FOV comfort vignette causes severe visual-vestibular mismatch.',
      metricValue: 1.0,
      limitValue: 0.0,
    });
    recommendations.push('Enable FOV Comfort Vignette or switch to Snap Turn (45deg increments) for smooth turning.');
  }

  if (config.locomotionMode === 'smooth_locomotion' && !config.vignette.enabled) {
    recommendations.push('Enable Dynamic Peripheral Tunneling Vignette during smooth translation.');
  }

  // Reach recommendations
  const outOfReachCount = reachEvaluations.filter((r) => r.classification === 'excessive_reach').length;
  if (outOfReachCount > 0) {
    recommendations.push(`Reposition ${outOfReachCount} interactive objects closer to the user to avoid excessive reaching fatigue.`);
  }

  const vergenceStrainCount = reachEvaluations.filter((r) => r.classification === 'near_eye_strain').length;
  if (vergenceStrainCount > 0) {
    recommendations.push(`Move ${vergenceStrainCount} objects outside 0.25m near-eye boundary to prevent vergence-accommodation eye strain.`);
  }

  if (neckEvaluation.isFatigueProne) {
    recommendations.push('Lower camera target elevation or adjust look angles within +-15deg neutral pitch envelope.');
  }

  if (recommendations.length === 0) {
    recommendations.push('Scene adheres strictly to spatial comfort and ergonomic guidelines.');
  }

  // 4. Comfort Score & Grade Calculation
  let baseScore = 100;
  for (const inc of incidents) {
    if (inc.severity === 'critical') {
      baseScore -= 20;
    } else {
      baseScore -= 6;
    }
  }

  // Locomotion penalty if unmitigated
  if (config.locomotionMode === 'smooth_turn' && !config.vignette.enabled) {
    baseScore -= 15;
  }

  const comfortScore = Math.max(0, Math.min(100, Math.round(baseScore)));
  let comfortGrade: 'A' | 'B' | 'C' | 'F';
  if (comfortScore >= 90) {
    comfortGrade = 'A';
  } else if (comfortScore >= 75) {
    comfortGrade = 'B';
  } else if (comfortScore >= 60) {
    comfortGrade = 'C';
  } else {
    comfortGrade = 'F';
  }

  const criticalCount = incidents.filter((i) => i.severity === 'critical').length;
  const passedAudit = comfortScore >= 75 && criticalCount === 0;

  return {
    totalDurationSec: Math.round(totalDurationSec * 10) / 10,
    comfortScore,
    comfortGrade,
    locomotionMode: config.locomotionMode,
    peakLinearAccelerationMPerSec2: Math.round(peakLinearAcc * 100) / 100,
    peakLinearJerkMPerSec3: Math.round(peakLinearJerk * 100) / 100,
    peakAngularVelocityDegPerSec: Math.round(peakAngVel * 10) / 10,
    peakAngularJerkDegPerSec3: Math.round(peakAngJerk * 10) / 10,
    totalIncidentsCount: incidents.length,
    incidents,
    reachEvaluations,
    neckEvaluation,
    passedAudit,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Exporters: RFC 4180 CSV & Standalone HTML Safety Deck
// ---------------------------------------------------------------------------

/**
 * Provenance of the vestibular samples behind a comfort report.
 *
 * `simulated` samples come from a synthetic motion profile, not from a worn headset.
 * The in-app panel labels this clearly, but the exported artifact used to carry no
 * marker at all, so a synthetic run left the app looking exactly like a measured
 * session. A safety report that cannot be told apart from real data is worse than
 * no report.
 */
export type ComfortSampleProvenance = 'measured' | 'simulated';

export function generateComfortReportCsv(
  reportOrSamples: ComfortAuditReport | VestibularStateSample[],
  samples?: VestibularStateSample[],
  provenance: ComfortSampleProvenance = 'measured',
): string {
  const provenanceLabel =
    provenance === 'simulated'
      ? 'SIMULATED (synthetic motion profile, NOT recorded from a headset)'
      : 'MEASURED (recorded headset motion)';

  if (Array.isArray(reportOrSamples)) {
    const lines: string[] = [];
    lines.push(`DataSource,${provenanceLabel}`);
    lines.push('TimestampMs,PosX,PosY,PosZ,VelX,VelY,VelZ,AccX,AccY,AccZ,JerkX,JerkY,JerkZ,YawDeg,PitchDeg,RollDeg,AngularVelocityDegSec,AngularJerkDegSec3');
    for (const s of reportOrSamples) {
      lines.push(
        `${s.timestampMs},${s.position.x.toFixed(3)},${s.position.y.toFixed(3)},${s.position.z.toFixed(3)},${s.velocity.x.toFixed(3)},${s.velocity.y.toFixed(3)},${s.velocity.z.toFixed(3)},${s.acceleration.x.toFixed(3)},${s.acceleration.y.toFixed(3)},${s.acceleration.z.toFixed(3)},${s.jerk.x.toFixed(3)},${s.jerk.y.toFixed(3)},${s.jerk.z.toFixed(3)},${s.yawDeg.toFixed(1)},${s.pitchDeg.toFixed(1)},${s.rollDeg.toFixed(1)},${s.angularVelocityDegSec.toFixed(1)},${s.angularJerkDegSec3.toFixed(1)}`,
      );
    }
    return lines.join('\n');
  }

  const report = reportOrSamples;
  const lines: string[] = [];

  lines.push('SetView VR Motion Sickness, Ergonomics & Spatial Comfort Audit Report');
  lines.push(`DataSource,${provenanceLabel}`);
  lines.push(`GeneratedAt,${new Date().toISOString()}`);
  lines.push(`ComfortScore,${report.comfortScore}/100`);
  lines.push(`ComfortGrade,${report.comfortGrade}`);
  lines.push(`AuditStatus,${report.passedAudit ? 'PASSED' : 'FAILED'}`);
  lines.push(`LocomotionMode,${report.locomotionMode}`);
  lines.push(`PeakLinearAcceleration_m_s2,${report.peakLinearAccelerationMPerSec2}`);
  lines.push(`PeakLinearJerk_m_s3,${report.peakLinearJerkMPerSec3}`);
  lines.push(`PeakAngularVelocity_deg_s,${report.peakAngularVelocityDegPerSec}`);
  lines.push(`PeakAngularJerk_deg_s3,${report.peakAngularJerkDegPerSec3}`);
  lines.push(`TotalIncidents,${report.totalIncidentsCount}`);
  lines.push('');

  // Incidents section
  lines.push('--- INCIDENTS ---');
  lines.push('TimestampMs,Type,Severity,MetricValue,LimitValue,Description');
  for (const inc of report.incidents) {
    const desc = `"${inc.description.replace(/"/g, '""')}"`;
    lines.push(`${inc.timestampMs},${inc.type},${inc.severity},${inc.metricValue.toFixed(2)},${inc.limitValue.toFixed(2)},${desc}`);
  }
  lines.push('');

  // Reach section
  lines.push('--- REACH EVALUATIONS ---');
  lines.push('TargetId,TargetName,DistanceM,ElevationDeltaM,Classification,WithinArmSpan,VergenceRisk');
  for (const r of report.reachEvaluations) {
    const name = `"${r.targetName.replace(/"/g, '""')}"`;
    lines.push(`${r.targetId},${name},${r.distanceM.toFixed(3)},${r.elevationDeltaM.toFixed(3)},${r.classification},${r.isWithinArmSpan},${r.vergenceDiscomfortRisk}`);
  }
  lines.push('');

  // Recommendations section
  lines.push('--- RECOMMENDATIONS ---');
  for (let i = 0; i < report.recommendations.length; i++) {
    const rec = `"${report.recommendations[i].replace(/"/g, '""')}"`;
    lines.push(`${i + 1},${rec}`);
  }
  lines.push('');

  // Kinematics Samples section if available
  if (samples && samples.length > 0) {
    lines.push('--- VESTIBULAR KINEMATICS TRACE ---');
    lines.push('TimestampMs,PosX,PosY,PosZ,VelX,VelY,VelZ,AccX,AccY,AccZ,JerkX,JerkY,JerkZ,YawDeg,PitchDeg,RollDeg,AngVelDegSec,AngJerkDegSec3');
    for (const s of samples) {
      lines.push(
        `${s.timestampMs},${s.position.x.toFixed(3)},${s.position.y.toFixed(3)},${s.position.z.toFixed(3)},` +
        `${s.velocity.x.toFixed(3)},${s.velocity.y.toFixed(3)},${s.velocity.z.toFixed(3)},` +
        `${s.acceleration.x.toFixed(3)},${s.acceleration.y.toFixed(3)},${s.acceleration.z.toFixed(3)},` +
        `${s.jerk.x.toFixed(3)},${s.jerk.y.toFixed(3)},${s.jerk.z.toFixed(3)},` +
        `${s.yawDeg.toFixed(1)},${s.pitchDeg.toFixed(1)},${s.rollDeg.toFixed(1)},` +
        `${s.angularVelocityDegSec.toFixed(1)},${s.angularJerkDegSec3.toFixed(1)}`,
      );
    }
  }

  return lines.join('\r\n');
}

export function generateComfortReportHtml(
  report: ComfortAuditReport,
  sceneName?: string,
): string {
  const name = sceneName || 'Untitled SetView Scene';
  const gradeColor =
    report.comfortGrade === 'A'
      ? '#22c55e'
      : report.comfortGrade === 'B'
        ? '#3b82f6'
        : report.comfortGrade === 'C'
          ? '#f59e0b'
          : '#ef4444';

  const incidentsRows = report.incidents.length > 0
    ? report.incidents
        .map(
          (inc) => `
        <tr class="incident-${inc.severity}">
          <td><code>${inc.type}</code></td>
          <td><span class="badge badge-${inc.severity}">${inc.severity.toUpperCase()}</span></td>
          <td>${inc.metricValue.toFixed(2)}</td>
          <td>${inc.limitValue.toFixed(2)}</td>
          <td>${inc.description}</td>
        </tr>`,
        )
        .join('')
    : '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">No comfort or ergonomic incidents detected.</td></tr>';

  const reachRows = report.reachEvaluations.length > 0
    ? report.reachEvaluations
        .map(
          (r) => `
        <tr>
          <td><strong>${r.targetName}</strong></td>
          <td>${r.distanceM.toFixed(2)}m</td>
          <td>${r.elevationDeltaM >= 0 ? '+' : ''}${r.elevationDeltaM.toFixed(2)}m</td>
          <td><span class="badge badge-${r.classification}">${r.classification.replace(/_/g, ' ')}</span></td>
          <td>${r.isWithinArmSpan ? '<span style="color:#22c55e;">Yes</span>' : '<span style="color:#ef4444;">No</span>'}</td>
        </tr>`,
        )
        .join('')
    : '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">No reach target objects registered.</td></tr>';

  const recList = report.recommendations
    .map((rec) => `<li>${rec}</li>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SetView VR Comfort & Ergonomics Report - ${name}</title>
  <style>
    :root {
      --bg: #0b0f17;
      --card-bg: #151d2a;
      --border: #243247;
      --text: #f1f5f9;
      --text-dim: #94a3b8;
      --accent: #0284c7;
      --grade-color: ${gradeColor};
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 32px;
    }
    .container { max-width: 1100px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 32px;
    }
    h1 { font-size: 24px; font-weight: 700; }
    .subtitle { color: var(--text-dim); font-size: 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    .card-title { font-size: 12px; text-transform: uppercase; color: var(--text-dim); margin-bottom: 8px; letter-spacing: 0.5px; }
    .card-value { font-size: 28px; font-weight: 800; }
    .grade-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: 12px;
      background: rgba(34, 197, 94, 0.15);
      color: var(--grade-color);
      font-size: 32px;
      font-weight: 900;
      border: 2px solid var(--grade-color);
    }
    section { margin-bottom: 32px; }
    h2 { font-size: 18px; margin-bottom: 16px; color: #38bdf8; }
    table { width: 100%; border-collapse: collapse; background: var(--card-bg); border-radius: 8px; overflow: hidden; }
    th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--border); font-size: 13px; }
    th { background: #1a2333; color: var(--text-dim); font-weight: 600; text-transform: uppercase; font-size: 11px; }
    tr:last-child td { border-bottom: none; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-critical { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .badge-warning { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
    .badge-optimal_reach { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
    .badge-acceptable_reach { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
    .badge-excessive_reach { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .badge-near_eye_strain { background: rgba(236, 72, 153, 0.2); color: #ec4899; }
    ul { list-style-position: inside; background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
    li { margin-bottom: 8px; color: #e2e8f0; font-size: 14px; }
    li:last-child { margin-bottom: 0; }
    footer { text-align: center; color: var(--text-dim); font-size: 12px; margin-top: 48px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>VR Spatial Comfort & Ergonomics Safety Deck</h1>
        <div class="subtitle">Scene: ${name} | Date: ${new Date().toLocaleDateString()}</div>
      </div>
      <div class="grade-badge">${report.comfortGrade}</div>
    </header>

    <div class="grid">
      <div class="card">
        <div class="card-title">Comfort Score</div>
        <div class="card-value" style="color:var(--grade-color);">${report.comfortScore} / 100</div>
      </div>
      <div class="card">
        <div class="card-title">Audit Status</div>
        <div class="card-value" style="color:${report.passedAudit ? '#22c55e' : '#ef4444'};">
          ${report.passedAudit ? 'PASSED' : 'NEEDS ACTION'}
        </div>
      </div>
      <div class="card">
        <div class="card-title">Peak Linear Jerk</div>
        <div class="card-value">${report.peakLinearJerkMPerSec3} <span style="font-size:14px;color:var(--text-dim);">m/s³</span></div>
      </div>
      <div class="card">
        <div class="card-title">Peak Angular Velocity</div>
        <div class="card-value">${report.peakAngularVelocityDegPerSec} <span style="font-size:14px;color:var(--text-dim);">deg/s</span></div>
      </div>
    </div>

    <section>
      <h2>Actionable Safety Recommendations</h2>
      <ul>${recList}</ul>
    </section>

    <section>
      <h2>Discomfort & Ergonomic Incidents (${report.totalIncidentsCount})</h2>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Severity</th>
            <th>Metric</th>
            <th>Limit</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          ${incidentsRows}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Spatial Reach & Ergonomic Zone Envelope</h2>
      <table>
        <thead>
          <tr>
            <th>Target Object</th>
            <th>Distance</th>
            <th>Elevation</th>
            <th>Classification</th>
            <th>Within Arm Span</th>
          </tr>
        </thead>
        <tbody>
          ${reachRows}
        </tbody>
      </table>
    </section>

    <footer>
      SetView Spatial Comfort Auditor &copy; 2026 SetView Inc.
    </footer>
  </div>
</body>
</html>`;
}
