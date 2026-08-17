// ---------------------------------------------------------------------------
// Pure Domain Engine: Unreal Engine LiveLink & Real-Time WebXR VCam Pipeline
//
// Pure domain module with ZERO Three.js and ZERO DOM imports for 100% Node testability.
// Provides:
//   - LiveLink VCam protocol types, configuration schemas, and packet encoders
//   - Bi-directional coordinate and rotator conversions between SetView and UE5
//   - Cinematic camera smoothing filters (Handheld, Steadicam, Crane, Tripod)
//   - Inbound message decoding, remote command dispatch, and tally state management
//   - Self-contained Unreal Engine 5 Python receiver companion script generation
// ---------------------------------------------------------------------------

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export type LiveLinkSubjectType = 'camera' | 'transform' | 'light';

export type LiveLinkProtocolMode = 'websocket' | 'udp_relay' | 'osc';

export type LiveLinkConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'streaming';

export type TallyState = 'off' | 'preview' | 'program' | 'recording';

export type VcamSmoothingPreset =
  | 'off'
  | 'handheld_subtle'
  | 'steadicam'
  | 'crane'
  | 'tripod'
  | 'custom';

export interface VcamSmoothingCoefficients {
  posWeight: number;
  rotWeight: number;
  description: string;
}

export const VCAM_SMOOTHING_PRESETS: Record<VcamSmoothingPreset, VcamSmoothingCoefficients> = {
  off: {
    posWeight: 0.0,
    rotWeight: 0.0,
    description: 'Raw tracker output with zero latency filtering',
  },
  handheld_subtle: {
    posWeight: 0.15,
    rotWeight: 0.2,
    description: 'Subtle jitter reduction while maintaining organic handheld character',
  },
  steadicam: {
    posWeight: 0.4,
    rotWeight: 0.45,
    description: 'Medium stabilization mimicking a Steadicam mechanical sled',
  },
  crane: {
    posWeight: 0.65,
    rotWeight: 0.7,
    description: 'High inertia smoothing simulating a techno-crane or heavy jib arm',
  },
  tripod: {
    posWeight: 0.85,
    rotWeight: 0.9,
    description: 'Aggressive dampening locking down position and rotational pan-tilt',
  },
  custom: {
    posWeight: 0.25,
    rotWeight: 0.3,
    description: 'Custom user-specified smoothing coefficients',
  },
};

export interface LiveLinkConfig {
  enabled: boolean;
  serverUrl: string;
  port: number;
  subjectName: string;
  subjectType: LiveLinkSubjectType;
  protocolMode: LiveLinkProtocolMode;
  targetFps: number;
  smoothingPreset: VcamSmoothingPreset;
  smoothingPosWeight: number;
  smoothingRotWeight: number;
  autoReconnect: boolean;
  reconnectIntervalMs: number;
  timecodeSource: 'system' | 'smpte' | 'manual';
  streamFocalLength: boolean;
  streamAperture: boolean;
  streamFocusDistance: boolean;
  streamFilmback: boolean;
  customMetadata?: Record<string, string | number | boolean>;
}

export interface LiveLinkCameraFrame {
  timestamp: number;
  timecode: string;
  subjectName: string;
  frameNumber: number;
  position: Vec3;
  rotation: Quat;
  focalLengthMm: number;
  apertureTStop: number;
  focusDistanceM: number;
  sensorWidthMm: number;
  sensorHeightMm: number;
  isRecording: boolean;
  tally: TallyState;
  zoomNormalized?: number;
  fieldOfViewDeg?: number;
  trackingLoss?: boolean;
  batteryLevel?: number;
  extraProperties?: Record<string, string | number | boolean>;
}

export interface VcamCommand {
  id: string;
  type:
    | 'start_record'
    | 'stop_record'
    | 'set_focus'
    | 'set_focal_length'
    | 'set_tstop'
    | 'sync_timecode'
    | 'trigger_take'
    | 'set_lookat'
    | 'ping'
    | 'pong';
  payload?: unknown;
  timestamp: number;
}

export interface VcamInboundMessage {
  type:
    | 'pong'
    | 'status'
    | 'tally_update'
    | 'take_info'
    | 'remote_command'
    | 'timecode_sync'
    | 'error'
    | 'ack';
  payload?: unknown;
  timestamp: number;
}

export interface UnrealCameraTransform {
  locationCm: { x: number; y: number; z: number };
  rotationDeg: { pitch: number; yaw: number; roll: number };
  quaternion: { x: number; y: number; z: number; w: number };
}

export interface SetViewCameraTransform {
  positionM: Vec3;
  rotationQuat: Quat;
}

// --- Helper Utilities --------------------------------------------------------

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `vcam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function quatNormalize(q: Quat): Quat {
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (len < 1e-9) return { x: 0, y: 0, z: 0, w: 1 };
  const inv = 1 / len;
  return { x: q.x * inv, y: q.y * inv, z: q.z * inv, w: q.w * inv };
}

export function quatDot(a: Quat, b: Quat): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

export function quatSlerp(qa: Quat, qb: Quat, t: number): Quat {
  let cosHalfTheta = quatDot(qa, qb);
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

  if (cosHalfTheta >= 0.9995) {
    const x = qa.x + (bx - qa.x) * t;
    const y = qa.y + (by - qa.y) * t;
    const z = qa.z + (bz - qa.z) * t;
    const w = qa.w + (bw - qa.w) * t;
    return quatNormalize({ x, y, z, w });
  }

  const halfTheta = Math.acos(cosHalfTheta);
  const sinHalfTheta = Math.sqrt(1.0 - cosHalfTheta * cosHalfTheta);

  if (Math.abs(sinHalfTheta) < 1e-6) {
    return quatNormalize({
      x: qa.x * 0.5 + bx * 0.5,
      y: qa.y * 0.5 + by * 0.5,
      z: qa.z * 0.5 + bz * 0.5,
      w: qa.w * 0.5 + bw * 0.5,
    });
  }

  const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
  const ratioB = Math.sin(t * halfTheta) / sinHalfTheta;

  return {
    x: qa.x * ratioA + bx * ratioB,
    y: qa.y * ratioA + by * ratioB,
    z: qa.z * ratioA + bz * ratioB,
    w: qa.w * ratioA + bw * ratioB,
  };
}

// --- Configuration Factories and Guards --------------------------------------

export function createLiveLinkConfig(overrides?: Partial<LiveLinkConfig>): LiveLinkConfig {
  const preset: VcamSmoothingPreset = overrides?.smoothingPreset ?? 'handheld_subtle';
  const defaultWeights = VCAM_SMOOTHING_PRESETS[preset] ?? VCAM_SMOOTHING_PRESETS.handheld_subtle;

  return {
    enabled: overrides?.enabled ?? true,
    serverUrl: overrides?.serverUrl ?? 'ws://127.0.0.1:8088',
    port: overrides?.port ?? 8088,
    subjectName: overrides?.subjectName ?? 'SetView_VCam',
    subjectType: overrides?.subjectType ?? 'camera',
    protocolMode: overrides?.protocolMode ?? 'websocket',
    targetFps: overrides?.targetFps ?? 72,
    smoothingPreset: preset,
    smoothingPosWeight: overrides?.smoothingPosWeight ?? defaultWeights.posWeight,
    smoothingRotWeight: overrides?.smoothingRotWeight ?? defaultWeights.rotWeight,
    autoReconnect: overrides?.autoReconnect ?? true,
    reconnectIntervalMs: overrides?.reconnectIntervalMs ?? 2000,
    timecodeSource: overrides?.timecodeSource ?? 'system',
    streamFocalLength: overrides?.streamFocalLength ?? true,
    streamAperture: overrides?.streamAperture ?? true,
    streamFocusDistance: overrides?.streamFocusDistance ?? true,
    streamFilmback: overrides?.streamFilmback ?? true,
    ...(overrides?.customMetadata ? { customMetadata: { ...overrides.customMetadata } } : {}),
  };
}

export function isLiveLinkConfig(raw: unknown): raw is LiveLinkConfig {
  if (!raw || typeof raw !== 'object') return false;
  const c = raw as LiveLinkConfig;
  return (
    typeof c.enabled === 'boolean' &&
    typeof c.serverUrl === 'string' &&
    isFiniteNum(c.port) &&
    typeof c.subjectName === 'string' &&
    (c.subjectType === 'camera' || c.subjectType === 'transform' || c.subjectType === 'light') &&
    (c.protocolMode === 'websocket' || c.protocolMode === 'udp_relay' || c.protocolMode === 'osc') &&
    isFiniteNum(c.targetFps) &&
    typeof c.smoothingPreset === 'string' &&
    c.smoothingPreset in VCAM_SMOOTHING_PRESETS &&
    isFiniteNum(c.smoothingPosWeight) &&
    isFiniteNum(c.smoothingRotWeight) &&
    typeof c.autoReconnect === 'boolean' &&
    isFiniteNum(c.reconnectIntervalMs) &&
    (c.timecodeSource === 'system' || c.timecodeSource === 'smpte' || c.timecodeSource === 'manual') &&
    typeof c.streamFocalLength === 'boolean' &&
    typeof c.streamAperture === 'boolean' &&
    typeof c.streamFocusDistance === 'boolean' &&
    typeof c.streamFilmback === 'boolean'
  );
}

export function isLiveLinkCameraFrame(raw: unknown): raw is LiveLinkCameraFrame {
  if (!raw || typeof raw !== 'object') return false;
  const f = raw as LiveLinkCameraFrame;
  return (
    typeof f.subjectName === 'string' &&
    isFiniteNum(f.timestamp) &&
    typeof f.timecode === 'string' &&
    isFiniteNum(f.frameNumber) &&
    typeof f.position === 'object' &&
    f.position !== null &&
    isFiniteNum(f.position.x) &&
    isFiniteNum(f.position.y) &&
    isFiniteNum(f.position.z) &&
    typeof f.rotation === 'object' &&
    f.rotation !== null &&
    isFiniteNum(f.rotation.x) &&
    isFiniteNum(f.rotation.y) &&
    isFiniteNum(f.rotation.z) &&
    isFiniteNum(f.rotation.w) &&
    isFiniteNum(f.focalLengthMm) &&
    isFiniteNum(f.apertureTStop) &&
    isFiniteNum(f.focusDistanceM) &&
    isFiniteNum(f.sensorWidthMm) &&
    isFiniteNum(f.sensorHeightMm) &&
    typeof f.isRecording === 'boolean' &&
    typeof f.tally === 'string'
  );
}

export function normalizeLiveLinkConfig(raw: unknown): LiveLinkConfig {
  if (!raw || typeof raw !== 'object') return createLiveLinkConfig();
  const c = raw as Partial<LiveLinkConfig>;

  const preset: VcamSmoothingPreset =
    c.smoothingPreset && c.smoothingPreset in VCAM_SMOOTHING_PRESETS
      ? c.smoothingPreset
      : 'handheld_subtle';
  const defaultWeights = VCAM_SMOOTHING_PRESETS[preset];

  const posWeight = isFiniteNum(c.smoothingPosWeight)
    ? Math.max(0, Math.min(1, c.smoothingPosWeight))
    : defaultWeights.posWeight;
  const rotWeight = isFiniteNum(c.smoothingRotWeight)
    ? Math.max(0, Math.min(1, c.smoothingRotWeight))
    : defaultWeights.rotWeight;

  return {
    enabled: typeof c.enabled === 'boolean' ? c.enabled : true,
    serverUrl: typeof c.serverUrl === 'string' && c.serverUrl.trim() ? c.serverUrl.trim() : 'ws://127.0.0.1:8088',
    port: isFiniteNum(c.port) && c.port > 0 && c.port <= 65535 ? Math.round(c.port) : 8088,
    subjectName: typeof c.subjectName === 'string' && c.subjectName.trim() ? c.subjectName.trim() : 'SetView_VCam',
    subjectType: c.subjectType === 'transform' || c.subjectType === 'light' ? c.subjectType : 'camera',
    protocolMode: c.protocolMode === 'udp_relay' || c.protocolMode === 'osc' ? c.protocolMode : 'websocket',
    targetFps: isFiniteNum(c.targetFps) && c.targetFps >= 10 && c.targetFps <= 240 ? Math.round(c.targetFps) : 72,
    smoothingPreset: preset,
    smoothingPosWeight: posWeight,
    smoothingRotWeight: rotWeight,
    autoReconnect: typeof c.autoReconnect === 'boolean' ? c.autoReconnect : true,
    reconnectIntervalMs:
      isFiniteNum(c.reconnectIntervalMs) && c.reconnectIntervalMs >= 200 && c.reconnectIntervalMs <= 60000
        ? Math.round(c.reconnectIntervalMs)
        : 2000,
    timecodeSource: c.timecodeSource === 'smpte' || c.timecodeSource === 'manual' ? c.timecodeSource : 'system',
    streamFocalLength: typeof c.streamFocalLength === 'boolean' ? c.streamFocalLength : true,
    streamAperture: typeof c.streamAperture === 'boolean' ? c.streamAperture : true,
    streamFocusDistance: typeof c.streamFocusDistance === 'boolean' ? c.streamFocusDistance : true,
    streamFilmback: typeof c.streamFilmback === 'boolean' ? c.streamFilmback : true,
    ...(c.customMetadata && typeof c.customMetadata === 'object' ? { customMetadata: { ...c.customMetadata } } : {}),
  };
}

// --- Coordinate Transformations ----------------------------------------------

/**
 * Converts SetView Camera Transform (meters, Y-up, right-handed) to Unreal Engine 5 Camera Transform (cm, Z-up, left-handed).
 * SetView: +X right, +Y up, +Z towards viewer / south; camera looks along -Z.
 * Unreal:  +X forward (SetView +Z), +Y right (SetView +X), +Z up (SetView +Y); camera looks along +X.
 */
export function convertSetViewToUnrealCameraTransform(
  posM: Vec3,
  rotQuat: Quat,
): UnrealCameraTransform {
  const px = isFiniteNum(posM.x) ? posM.x : 0;
  const py = isFiniteNum(posM.y) ? posM.y : 0;
  const pz = isFiniteNum(posM.z) ? posM.z : 0;

  const locationCm = {
    x: pz * 100.0,
    y: px * 100.0,
    z: py * 100.0,
  };

  const q = quatNormalize(rotQuat);
  const qx = q.x;
  const qy = q.y;
  const qz = q.z;
  const qw = q.w;

  // Camera forward vector in SetView Three.js camera space: R * (0, 0, -1)
  const fx_sv = -2.0 * (qx * qz + qw * qy);
  const fy_sv = -2.0 * (qy * qz - qw * qx);
  const fz_sv = -(1.0 - 2.0 * (qx * qx + qy * qy));

  // Camera up vector in SetView Three.js camera space: R * (0, 1, 0)
  const ux_sv = 2.0 * (qx * qy - qw * qz);
  const uy_sv = 1.0 - 2.0 * (qx * qx + qz * qz);
  const uz_sv = 2.0 * (qy * qz + qw * qx);

  // Camera right vector in SetView Three.js camera space: R * (1, 0, 0)
  const rx_sv = 1.0 - 2.0 * (qy * qy + qz * qz);
  const rz_sv = 2.0 * (qx * qz - qw * qy);

  // Remap SetView basis (x=right, y=up, z=back) to Unreal basis (x=fwd, y=right, z=up)
  const fx_ue = fz_sv;
  const fy_ue = fx_sv;
  const fz_ue = fy_sv;

  const ux_ue = uz_sv;
  const uy_ue = ux_sv;
  const uz_ue = uy_sv;

  const rx_ue = rz_sv;
  const ry_ue = rx_sv;

  const yawDeg = (Math.atan2(fy_ue, fx_ue) * 180.0) / Math.PI;
  const horizDist = Math.sqrt(fx_ue * fx_ue + fy_ue * fy_ue);
  const pitchDeg = (Math.atan2(fz_ue, horizDist) * 180.0) / Math.PI;
  const rollDeg = (Math.atan2(ux_ue * ry_ue - uy_ue * rx_ue, uz_ue) * 180.0) / Math.PI;

  const rotationDeg = {
    pitch: isFiniteNum(pitchDeg) ? pitchDeg : 0,
    yaw: isFiniteNum(yawDeg) ? yawDeg : 0,
    roll: isFiniteNum(rollDeg) ? rollDeg : 0,
  };

  // Convert Euler Rotator (Pitch, Yaw, Roll) to Unreal left-handed Quaternion
  const deg2rad = Math.PI / 180.0;
  const p = rotationDeg.pitch * deg2rad * 0.5;
  const y = rotationDeg.yaw * deg2rad * 0.5;
  const r = rotationDeg.roll * deg2rad * 0.5;

  const sp = Math.sin(p);
  const cp = Math.cos(p);
  const sy = Math.sin(y);
  const cy = Math.cos(y);
  const sr = Math.sin(r);
  const cr = Math.cos(r);

  const ueqx = cr * sp * sy - sr * cp * cy;
  const ueqy = -cr * sp * cy - sr * cp * sy;
  const ueqz = cr * cp * sy - sr * sp * cy;
  const ueqw = cr * cp * cy + sr * sp * sy;

  const ueq = quatNormalize({ x: ueqx, y: ueqy, z: ueqz, w: ueqw });

  return {
    locationCm,
    rotationDeg,
    quaternion: ueq,
  };
}

/**
 * Converts Unreal Engine 5 Camera Transform (cm, Z-up, left-handed) back to SetView Transform (meters, Y-up, right-handed).
 */
export function convertUnrealToSetViewCameraTransform(
  locationCm: { x: number; y: number; z: number },
  rotationDeg: { pitch: number; yaw: number; roll: number },
): SetViewCameraTransform {
  const lx = isFiniteNum(locationCm.x) ? locationCm.x : 0;
  const ly = isFiniteNum(locationCm.y) ? locationCm.y : 0;
  const lz = isFiniteNum(locationCm.z) ? locationCm.z : 0;

  const positionM: Vec3 = {
    x: ly / 100.0,
    y: lz / 100.0,
    z: lx / 100.0,
  };

  const deg2rad = Math.PI / 180.0;
  const p = (isFiniteNum(rotationDeg.pitch) ? rotationDeg.pitch : 0) * deg2rad;
  const y = (isFiniteNum(rotationDeg.yaw) ? rotationDeg.yaw : 0) * deg2rad;
  const r = (isFiniteNum(rotationDeg.roll) ? rotationDeg.roll : 0) * deg2rad;

  // UE basis vectors from Euler angles
  const fx_ue = Math.cos(p) * Math.cos(y);
  const fy_ue = Math.cos(p) * Math.sin(y);
  const fz_ue = Math.sin(p);

  const ux_ue = Math.sin(y) * Math.sin(r) + Math.sin(p) * Math.cos(y) * Math.cos(r);
  const uy_ue = -Math.cos(y) * Math.sin(r) + Math.sin(p) * Math.sin(y) * Math.cos(r);
  const uz_ue = Math.cos(p) * Math.cos(r);

  // SetView basis vectors (x=ue_y, y=ue_z, z=ue_x)
  const f_sv: Vec3 = { x: fy_ue, y: fz_ue, z: fx_ue };
  const u_sv: Vec3 = { x: uy_ue, y: uz_ue, z: ux_ue };

  // In SetView camera space: camera looks down -Z.
  // Right vector = cross(f_sv, u_sv)
  const r_sv: Vec3 = {
    x: f_sv.y * u_sv.z - f_sv.z * u_sv.y,
    y: f_sv.z * u_sv.x - f_sv.x * u_sv.z,
    z: f_sv.x * u_sv.y - f_sv.y * u_sv.x,
  };

  // Rotation Matrix: Col 0 = right (+X), Col 1 = up (+Y), Col 2 = back (+Z = -f_sv)
  const m00 = r_sv.x;
  const m01 = u_sv.x;
  const m02 = -f_sv.x;

  const m10 = r_sv.y;
  const m11 = u_sv.y;
  const m12 = -f_sv.y;

  const m20 = r_sv.z;
  const m21 = u_sv.z;
  const m22 = -f_sv.z;

  const trace = m00 + m11 + m22;
  let qx = 0;
  let qy = 0;
  let qz = 0;
  let qw = 1;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    qw = 0.25 / s;
    qx = (m21 - m12) * s;
    qy = (m02 - m20) * s;
    qz = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m00 - m11 - m22);
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m00 - m22);
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m00 - m11);
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }

  const rotationQuat = quatNormalize({ x: qx, y: qy, z: qz, w: qw });

  return {
    positionM,
    rotationQuat,
  };
}

// --- Smoothing Filters -------------------------------------------------------

/**
 * Applies cinematic camera smoothing to position and orientation.
 * Calculates frame-rate independent exponential decay slerp.
 */
export function applyVcamSmoothing(
  currentPos: Vec3,
  currentRot: Quat,
  targetPos: Vec3,
  targetRot: Quat,
  smoothingPreset: VcamSmoothingPreset,
  dtSeconds: number,
  customWeights?: { posWeight: number; rotWeight: number },
): { position: Vec3; rotation: Quat } {
  if (smoothingPreset === 'off') {
    return {
      position: { ...targetPos },
      rotation: { ...targetRot },
    };
  }

  if (dtSeconds <= 0) {
    return {
      position: { ...currentPos },
      rotation: { ...currentRot },
    };
  }

  const weights =
    smoothingPreset === 'custom' && customWeights
      ? customWeights
      : VCAM_SMOOTHING_PRESETS[smoothingPreset] ?? VCAM_SMOOTHING_PRESETS.handheld_subtle;

  const posWeight = Math.max(0, Math.min(0.99, weights.posWeight));
  const rotWeight = Math.max(0, Math.min(0.99, weights.rotWeight));

  const posAlpha = posWeight <= 0 ? 1.0 : Math.max(0, Math.min(1.0, 1.0 - Math.pow(posWeight, dtSeconds * 30.0)));
  const rotAlpha = rotWeight <= 0 ? 1.0 : Math.max(0, Math.min(1.0, 1.0 - Math.pow(rotWeight, dtSeconds * 30.0)));

  const smoothPos: Vec3 = {
    x: currentPos.x + (targetPos.x - currentPos.x) * posAlpha,
    y: currentPos.y + (targetPos.y - currentPos.y) * posAlpha,
    z: currentPos.z + (targetPos.z - currentPos.z) * posAlpha,
  };

  const smoothRot = quatSlerp(currentRot, targetRot, rotAlpha);

  return {
    position: smoothPos,
    rotation: smoothRot,
  };
}

// --- Protocol Packet Serialization & Deserialization -------------------------

export function encodeLiveLinkCameraPacket(frame: LiveLinkCameraFrame): string {
  const ueTransform = convertSetViewToUnrealCameraTransform(frame.position, frame.rotation);

  const packet = {
    version: 1,
    protocol: 'setview_livelink',
    subjectName: frame.subjectName,
    subjectType: 'camera',
    timestamp: frame.timestamp,
    timecode: frame.timecode,
    frameNumber: frame.frameNumber,
    transform: {
      setView: {
        position: frame.position,
        rotation: frame.rotation,
      },
      unreal: {
        location: ueTransform.locationCm,
        rotation: ueTransform.rotationDeg,
        quaternion: ueTransform.quaternion,
      },
    },
    camera: {
      focalLengthMm: frame.focalLengthMm,
      apertureTStop: frame.apertureTStop,
      focusDistanceM: frame.focusDistanceM,
      focusDistanceCm: frame.focusDistanceM * 100.0,
      sensorWidthMm: frame.sensorWidthMm,
      sensorHeightMm: frame.sensorHeightMm,
      fieldOfViewDeg: frame.fieldOfViewDeg,
      zoomNormalized: frame.zoomNormalized,
    },
    status: {
      isRecording: frame.isRecording,
      tally: frame.tally,
      trackingLoss: !!frame.trackingLoss,
      batteryLevel: frame.batteryLevel,
    },
    metadata: frame.extraProperties || {},
  };

  return JSON.stringify(packet);
}

export function decodeLiveLinkInboundMessage(raw: string | ArrayBuffer): VcamInboundMessage | null {
  try {
    let text: string;
    if (typeof raw === 'string') {
      text = raw;
    } else if (raw instanceof ArrayBuffer) {
      text = new TextDecoder().decode(raw);
    } else {
      return null;
    }

    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;

    const validTypes = [
      'pong',
      'status',
      'tally_update',
      'take_info',
      'remote_command',
      'timecode_sync',
      'error',
      'ack',
    ];

    if (!validTypes.includes(parsed.type)) return null;

    return {
      type: parsed.type,
      payload: parsed.payload,
      timestamp: isFiniteNum(parsed.timestamp) ? parsed.timestamp : Date.now(),
    };
  } catch {
    return null;
  }
}

export function createVcamCommand(type: VcamCommand['type'], payload?: unknown): VcamCommand {
  return {
    id: uid(),
    type,
    payload,
    timestamp: Date.now(),
  };
}

// --- UE5 Python Companion Receiver Generator ---------------------------------

/**
 * Generates a self-contained Unreal Engine 5 Python companion script.
 * Can be run directly in the UE5 Python Console or configured in Unreal Editor startup scripts.
 */
export function generateUe5LiveLinkReceiverPythonScript(config?: LiveLinkConfig): string {
  const cfg = config ? normalizeLiveLinkConfig(config) : createLiveLinkConfig();
  const serverUrl = cfg.serverUrl;
  const port = cfg.port;
  const subjectName = cfg.subjectName;

  return `# -*- coding: utf-8 -*-
"""
SetView LiveLink & Real-Time WebXR VCam Receiver Companion for Unreal Engine 5
Generated by SetView LiveLink Engine

Usage:
  1. Open Unreal Engine 5.3, 5.4, or 5.5.
  2. Open Output Log -> Python console (or Run Script).
  3. Execute this script to establish real-time VCam synchronization.
  4. Drives active CineCameraActor in Level Viewport and binds to Sequencer.
"""

import sys
import json
import time
import socket
import threading
import queue

try:
    import unreal
    IN_UNREAL = True
except ImportError:
    IN_UNREAL = False
    print("[SetView LiveLink] Running in standalone Python mode (unreal module not found).")

CONFIG = {
    "server_url": "${serverUrl}",
    "port": ${port},
    "subject_name": "${subjectName}",
    "auto_spawn_cine_camera": True,
    "drive_viewport": True,
    "bind_sequencer_recording": True,
}

class SetViewLiveLinkClient:
    def __init__(self, config=None):
        self.config = config or CONFIG
        self.running = False
        self.connected = False
        self.thread = None
        self.message_queue = queue.Queue(maxsize=120)
        self.last_frame = None
        self.cine_camera_actor = None
        self.cine_camera_component = None
        self.tick_handle = None
        self.is_recording = False
        self.current_take = 1

    def start(self):
        if self.running:
            print("[SetView LiveLink] Client is already running.")
            return

        self.running = True
        self.thread = threading.Thread(target=self._network_worker, name="SetViewLiveLinkWorker", daemon=True)
        self.thread.start()

        if IN_UNREAL:
            self._setup_unreal_camera()
            self.tick_handle = unreal.register_python_post_tick_callback(self._on_unreal_tick)
            unreal.log(f"[SetView LiveLink] Receiver started for subject '{self.config['subject_name']}'.")
        else:
            print(f"[SetView LiveLink] Receiver started for subject '{self.config['subject_name']}'.")

    def stop(self):
        self.running = False
        if IN_UNREAL and self.tick_handle:
            try:
                unreal.unregister_python_post_tick_callback(self.tick_handle)
            except Exception as e:
                unreal.log_warning(f"[SetView LiveLink] Error unregistering tick callback: {e}")
            self.tick_handle = None

        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        print("[SetView LiveLink] Client stopped.")

    def _setup_unreal_camera(self):
        if not IN_UNREAL:
            return

        actor_name = self.config["subject_name"]
        editor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        all_actors = editor_subsystem.get_all_level_actors()

        for a in all_actors:
            if a.get_actor_label() == actor_name and isinstance(a, unreal.CineCameraActor):
                self.cine_camera_actor = a
                self.cine_camera_component = a.get_cine_camera_component()
                unreal.log(f"[SetView LiveLink] Bound to existing CineCameraActor: {actor_name}")
                return

        if self.config["auto_spawn_cine_camera"]:
            spawn_loc = unreal.Vector(0, 0, 160)
            spawn_rot = unreal.Rotator(0, 0, 0)
            self.cine_camera_actor = editor_subsystem.spawn_actor_from_class(
                unreal.CineCameraActor,
                spawn_loc,
                spawn_rot
            )
            if self.cine_camera_actor:
                self.cine_camera_actor.set_actor_label(actor_name)
                self.cine_camera_component = self.cine_camera_actor.get_cine_camera_component()
                unreal.log(f"[SetView LiveLink] Spawned new CineCameraActor: {actor_name}")

    def _network_worker(self):
        host = self.config["server_url"].replace("ws://", "").replace("http://", "").split(":")[0]
        port = int(self.config["port"])

        while self.running:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(3.0)
                sock.connect((host, port))
                self.connected = True
                print(f"[SetView LiveLink] Connected to {host}:{port}")

                buffer = ""
                while self.running:
                    try:
                        data = sock.recv(4096)
                        if not data:
                            break
                        buffer += data.decode("utf-8", errors="ignore")
                        lines = buffer.split("\\n")
                        buffer = lines.pop()

                        for line in lines:
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                packet = json.loads(line)
                                if self.message_queue.full():
                                    try:
                                        self.message_queue.get_nowait()
                                    except queue.Empty:
                                        pass
                                self.message_queue.put_nowait(packet)
                            except json.JSONDecodeError:
                                pass
                    except socket.timeout:
                        continue
                    except Exception as e:
                        print(f"[SetView LiveLink] Socket read error: {e}")
                        break

                sock.close()
                self.connected = False
            except Exception as e:
                self.connected = False
                time.sleep(2.0)

    def _on_unreal_tick(self, delta_seconds):
        if not IN_UNREAL:
            return

        latest_packet = None
        while not self.message_queue.empty():
            try:
                latest_packet = self.message_queue.get_nowait()
            except queue.Empty:
                break

        if not latest_packet:
            return

        self.last_frame = latest_packet
        self._apply_frame_to_unreal(latest_packet)

    def _apply_frame_to_unreal(self, packet):
        if not IN_UNREAL or not self.cine_camera_actor or not self.cine_camera_component:
            return

        transform_data = packet.get("transform", {}).get("unreal", {})
        loc = transform_data.get("location", {})
        rot = transform_data.get("rotation", {})

        if loc and rot:
            ue_loc = unreal.Vector(float(loc.get("x", 0)), float(loc.get("y", 0)), float(loc.get("z", 0)))
            ue_rot = unreal.Rotator(float(rot.get("pitch", 0)), float(rot.get("yaw", 0)), float(rot.get("roll", 0)))
            self.cine_camera_actor.set_actor_location_and_rotation(ue_loc, ue_rot, False, False)

        cam_data = packet.get("camera", {})
        if "focalLengthMm" in cam_data:
            self.cine_camera_component.set_editor_property("current_focal_length", float(cam_data["focalLengthMm"]))
        if "apertureTStop" in cam_data:
            self.cine_camera_component.set_editor_property("current_aperture", float(cam_data["apertureTStop"]))
        if "focusDistanceCm" in cam_data:
            focus_settings = self.cine_camera_component.get_editor_property("focus_settings")
            focus_settings.set_editor_property("manual_focus_distance", float(cam_data["focusDistanceCm"]))
            self.cine_camera_component.set_editor_property("focus_settings", focus_settings)

        status_data = packet.get("status", {})
        rec_state = status_data.get("isRecording", False)
        if rec_state != self.is_recording:
            self.is_recording = rec_state
            tally = status_data.get("tally", "off")
            if self.is_recording:
                unreal.log(f"[SetView LiveLink] TALLY RECORDING: Take {self.current_take} START")
            else:
                unreal.log(f"[SetView LiveLink] TALLY RECORDING: Take {self.current_take} STOP")
                self.current_take += 1

_global_livelink_instance = None

def run():
    global _global_livelink_instance
    if _global_livelink_instance:
        _global_livelink_instance.stop()
    _global_livelink_instance = SetViewLiveLinkClient()
    _global_livelink_instance.start()
    return _global_livelink_instance

def stop():
    global _global_livelink_instance
    if _global_livelink_instance:
        _global_livelink_instance.stop()
        _global_livelink_instance = None

if __name__ == "__main__":
    client = run()
`;
}
