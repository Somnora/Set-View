// ---------------------------------------------------------------------------
// SetView Pure Domain WebXR 6DoF Controller & Headset Profiler Engine
// PURE DOMAIN MODULE - ZERO Three.js or DOM imports.
// Suitable for direct execution in Node.js unit tests and headless runtimes.
// ---------------------------------------------------------------------------

export type MockXRHandedness = 'left' | 'right' | 'none';

export interface MockXRButtonState {
  pressed: boolean;
  touched: boolean;
  value: number;
}

export interface MockXRAxesState {
  x: number;
  y: number;
}

export interface MockXRTransform {
  position: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number; w: number };
}

export interface MockXRController {
  handedness: MockXRHandedness;
  transform: MockXRTransform;
  trigger: MockXRButtonState;
  grip: MockXRButtonState;
  primaryButton: MockXRButtonState;
  secondaryButton: MockXRButtonState;
  thumbstick: {
    button: MockXRButtonState;
    axes: MockXRAxesState;
  };
  isPinching: boolean;
  pinchStrength: number;
}

export interface MockXRHeadset {
  transform: MockXRTransform;
  ipdM: number;
  fovHorizontalDeg: number;
  fovVerticalDeg: number;
}

export interface MockXRSessionState {
  headset: MockXRHeadset;
  leftController: MockXRController;
  rightController: MockXRController;
  activeReferenceSpace: 'local-floor' | 'local' | 'viewer';
  isPresenting: boolean;
}

export interface FrameTelemetrySample {
  frameIndex: number;
  timestampMs: number;
  frameTimeMs: number;
  cpuLogicTimeMs: number;
  gpuRenderTimeMs: number;
  drawCallCount: number;
  triangleCount: number;
  shaderProgramSwitches: number;
  textureMemoryBytes: number;
  geometryMemoryBytes: number;
  heapAllocatedBytes: number;
  gcEventDetected: boolean;
  instantFps: number;
}

export interface VRPerformanceThresholds {
  targetFps: 72 | 90 | 120;
  maxAllowableFrameTimeMs: number;
  maxDrawCallsPerFrame: number;
  maxTrianglesPerFrame: number;
  maxHeapAllocationsBytesPerFrame: number;
  maxP95FrameTimeMs: number;
  maxDroppedFramesRatio: number;
}

export interface VRBenchmarkReport {
  totalFramesAudited: number;
  testDurationSec: number;
  targetFps: number;
  averageFps: number;
  p95FrameTimeMs: number;
  p99FrameTimeMs: number;
  maxFrameTimeMs: number;
  droppedFrameCount: number;
  droppedFrameRatio: number;
  maxDrawCalls: number;
  avgDrawCalls: number;
  maxTriangles: number;
  totalGcStutterEvents: number;
  heapAllocationsDetected: boolean;
  passedTest: boolean;
  failureReasons: string[];
  recommendations: string[];
}

export interface SyntheticVRKeyframeAction {
  timeSec: number;
  headsetPos: { x: number; y: number; z: number };
  headsetYawDeg: number;
  leftHandPos?: { x: number; y: number; z: number };
  rightHandPos?: { x: number; y: number; z: number };
  rightTrigger?: number;
  rightGrip?: number;
  thumbstickAxes?: { x: number; y: number };
}

export interface SyntheticVRScenario {
  id: string;
  name: string;
  description: string;
  durationSec: number;
  keyframeActions: SyntheticVRKeyframeAction[];
}

export interface VRProfilerConfig {
  enabled: boolean;
  targetFps: 72 | 90 | 120;
  thresholds: VRPerformanceThresholds;
  showDiagnosticHud: boolean;
  recordTelemetry: boolean;
  activeScenarioId?: string;
}

// ---------------------------------------------------------------------------
// Pure Domain Math Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  t: number,
): { x: number; y: number; z: number } {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
  };
}

function normalizeAngleDeg(deg: number): number {
  let angle = deg % 360;
  if (angle > 180) angle -= 360;
  if (angle <= -180) angle += 360;
  return angle;
}

function lerpAngleDeg(aDeg: number, bDeg: number, t: number): number {
  const normA = normalizeAngleDeg(aDeg);
  const normB = normalizeAngleDeg(bDeg);
  let diff = normB - normA;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return normA + diff * t;
}

function quaternionFromYawDeg(yawDeg: number): { x: number; y: number; z: number; w: number } {
  const rad = (yawDeg * Math.PI) / 180;
  const half = rad * 0.5;
  return {
    x: 0,
    y: Math.sin(half),
    z: 0,
    w: Math.cos(half),
  };
}

// ---------------------------------------------------------------------------
// Curated Synthetic VR Scenarios
// ---------------------------------------------------------------------------

export const SYNTHETIC_VR_SCENARIOS: Record<string, SyntheticVRScenario> = {
  walkthrough_soundstage: {
    id: 'walkthrough_soundstage',
    name: 'Soundstage Perimeter Walkthrough',
    description: 'Standard 6DoF production walking inspection circling set geometry with natural head panning and hand presence.',
    durationSec: 10.0,
    keyframeActions: [
      {
        timeSec: 0.0,
        headsetPos: { x: 0.0, y: 1.65, z: 4.0 },
        headsetYawDeg: 0.0,
        leftHandPos: { x: -0.25, y: 1.1, z: 3.6 },
        rightHandPos: { x: 0.25, y: 1.1, z: 3.6 },
        rightTrigger: 0.0,
        rightGrip: 0.0,
        thumbstickAxes: { x: 0.0, y: 0.0 },
      },
      {
        timeSec: 2.5,
        headsetPos: { x: 3.0, y: 1.65, z: 2.0 },
        headsetYawDeg: -45.0,
        leftHandPos: { x: 2.7, y: 1.15, z: 1.6 },
        rightHandPos: { x: 3.2, y: 1.15, z: 1.6 },
        rightTrigger: 0.0,
        rightGrip: 0.0,
        thumbstickAxes: { x: 0.2, y: 0.8 },
      },
      {
        timeSec: 5.0,
        headsetPos: { x: 2.5, y: 1.65, z: -2.5 },
        headsetYawDeg: -120.0,
        leftHandPos: { x: 2.2, y: 1.1, z: -2.8 },
        rightHandPos: { x: 2.7, y: 1.1, z: -2.8 },
        rightTrigger: 0.0,
        rightGrip: 0.0,
        thumbstickAxes: { x: 0.0, y: 1.0 },
      },
      {
        timeSec: 7.5,
        headsetPos: { x: -2.5, y: 1.65, z: -2.0 },
        headsetYawDeg: -220.0,
        leftHandPos: { x: -2.8, y: 1.15, z: -1.7 },
        rightHandPos: { x: -2.3, y: 1.15, z: -1.7 },
        rightTrigger: 0.0,
        rightGrip: 0.0,
        thumbstickAxes: { x: -0.5, y: 0.5 },
      },
      {
        timeSec: 10.0,
        headsetPos: { x: 0.0, y: 1.65, z: 4.0 },
        headsetYawDeg: -360.0,
        leftHandPos: { x: -0.25, y: 1.1, z: 3.6 },
        rightHandPos: { x: 0.25, y: 1.1, z: 3.6 },
        rightTrigger: 0.0,
        rightGrip: 0.0,
        thumbstickAxes: { x: 0.0, y: 0.0 },
      },
    ],
  },
  heavy_scene_stress: {
    id: 'heavy_scene_stress',
    name: 'High-Stress Dynamic Culling & Interaction',
    description: 'Rapid head yaw rotations, intense locomotion, and simultaneous dual-trigger inputs testing occlusion culling and batching.',
    durationSec: 8.0,
    keyframeActions: [
      {
        timeSec: 0.0,
        headsetPos: { x: 0.0, y: 1.65, z: 0.0 },
        headsetYawDeg: 0.0,
        leftHandPos: { x: -0.3, y: 1.2, z: -0.4 },
        rightHandPos: { x: 0.3, y: 1.2, z: -0.4 },
        rightTrigger: 0.0,
        rightGrip: 0.0,
        thumbstickAxes: { x: 0.0, y: 0.0 },
      },
      {
        timeSec: 2.0,
        headsetPos: { x: 1.5, y: 1.4, z: -1.5 },
        headsetYawDeg: 180.0,
        leftHandPos: { x: 1.2, y: 1.5, z: -1.1 },
        rightHandPos: { x: 1.8, y: 1.5, z: -1.1 },
        rightTrigger: 1.0,
        rightGrip: 0.9,
        thumbstickAxes: { x: 1.0, y: 1.0 },
      },
      {
        timeSec: 4.0,
        headsetPos: { x: -2.0, y: 1.8, z: 2.0 },
        headsetYawDeg: 360.0,
        leftHandPos: { x: -2.4, y: 1.1, z: 1.6 },
        rightHandPos: { x: -1.6, y: 1.1, z: 1.6 },
        rightTrigger: 0.0,
        rightGrip: 1.0,
        thumbstickAxes: { x: -1.0, y: 0.8 },
      },
      {
        timeSec: 6.0,
        headsetPos: { x: 2.0, y: 1.2, z: 1.0 },
        headsetYawDeg: 540.0,
        leftHandPos: { x: 1.7, y: 1.3, z: 0.6 },
        rightHandPos: { x: 2.3, y: 1.3, z: 0.6 },
        rightTrigger: 1.0,
        rightGrip: 1.0,
        thumbstickAxes: { x: 0.8, y: -0.9 },
      },
      {
        timeSec: 8.0,
        headsetPos: { x: 0.0, y: 1.65, z: 0.0 },
        headsetYawDeg: 720.0,
        leftHandPos: { x: -0.3, y: 1.2, z: -0.4 },
        rightHandPos: { x: 0.3, y: 1.2, z: -0.4 },
        rightTrigger: 0.0,
        rightGrip: 0.0,
        thumbstickAxes: { x: 0.0, y: 0.0 },
      },
    ],
  },
  transform_gizmo_drag: {
    id: 'transform_gizmo_drag',
    name: 'Transform Gizmo 6DoF Drag & Manipulation',
    description: 'Precision 6DoF controller grabbing, moving virtual props, and maintaining zero-latency continuous spatial updates.',
    durationSec: 6.0,
    keyframeActions: [
      {
        timeSec: 0.0,
        headsetPos: { x: 0.0, y: 1.65, z: 1.2 },
        headsetYawDeg: 0.0,
        leftHandPos: { x: -0.3, y: 1.0, z: 0.8 },
        rightHandPos: { x: 0.2, y: 1.1, z: 0.9 },
        rightTrigger: 0.0,
        rightGrip: 0.0,
      },
      {
        timeSec: 1.5,
        headsetPos: { x: 0.0, y: 1.65, z: 1.2 },
        headsetYawDeg: 0.0,
        leftHandPos: { x: -0.3, y: 1.0, z: 0.8 },
        rightHandPos: { x: 0.0, y: 1.2, z: 0.6 },
        rightTrigger: 0.9,
        rightGrip: 1.0,
      },
      {
        timeSec: 3.5,
        headsetPos: { x: 0.2, y: 1.65, z: 1.2 },
        headsetYawDeg: 10.0,
        leftHandPos: { x: -0.3, y: 1.0, z: 0.8 },
        rightHandPos: { x: 0.8, y: 1.5, z: 0.4 },
        rightTrigger: 1.0,
        rightGrip: 1.0,
      },
      {
        timeSec: 4.5,
        headsetPos: { x: 0.0, y: 1.65, z: 1.2 },
        headsetYawDeg: 0.0,
        leftHandPos: { x: -0.3, y: 1.0, z: 0.8 },
        rightHandPos: { x: 0.4, y: 1.3, z: 0.5 },
        rightTrigger: 0.1,
        rightGrip: 0.0,
      },
      {
        timeSec: 6.0,
        headsetPos: { x: 0.0, y: 1.65, z: 1.2 },
        headsetYawDeg: 0.0,
        leftHandPos: { x: -0.3, y: 1.0, z: 0.8 },
        rightHandPos: { x: 0.2, y: 1.1, z: 0.9 },
        rightTrigger: 0.0,
        rightGrip: 0.0,
      },
    ],
  },
  wrist_menu_nav: {
    id: 'wrist_menu_nav',
    name: 'Spatial Wrist Menu & UI Raycast Interaction',
    description: 'Raising left wrist for interface activation, aiming right controller laser pointer, and selecting quick actions.',
    durationSec: 5.0,
    keyframeActions: [
      {
        timeSec: 0.0,
        headsetPos: { x: 0.0, y: 1.65, z: 0.0 },
        headsetYawDeg: 0.0,
        leftHandPos: { x: -0.3, y: 0.9, z: -0.3 },
        rightHandPos: { x: 0.3, y: 0.9, z: -0.3 },
        rightTrigger: 0.0,
        rightGrip: 0.0,
      },
      {
        timeSec: 1.2,
        headsetPos: { x: 0.0, y: 1.65, z: 0.0 },
        headsetYawDeg: -15.0,
        leftHandPos: { x: -0.15, y: 1.35, z: -0.35 },
        rightHandPos: { x: 0.15, y: 1.25, z: -0.25 },
        rightTrigger: 0.0,
        rightGrip: 0.0,
      },
      {
        timeSec: 2.5,
        headsetPos: { x: 0.0, y: 1.65, z: 0.0 },
        headsetYawDeg: -15.0,
        leftHandPos: { x: -0.15, y: 1.35, z: -0.35 },
        rightHandPos: { x: -0.05, y: 1.32, z: -0.32 },
        rightTrigger: 1.0,
        rightGrip: 0.0,
      },
      {
        timeSec: 3.5,
        headsetPos: { x: 0.0, y: 1.65, z: 0.0 },
        headsetYawDeg: -15.0,
        leftHandPos: { x: -0.15, y: 1.35, z: -0.35 },
        rightHandPos: { x: -0.02, y: 1.30, z: -0.32 },
        rightTrigger: 0.0,
        rightGrip: 0.0,
      },
      {
        timeSec: 5.0,
        headsetPos: { x: 0.0, y: 1.65, z: 0.0 },
        headsetYawDeg: 0.0,
        leftHandPos: { x: -0.3, y: 0.9, z: -0.3 },
        rightHandPos: { x: 0.3, y: 0.9, z: -0.3 },
        rightTrigger: 0.0,
        rightGrip: 0.0,
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Factory and Normalization Functions
// ---------------------------------------------------------------------------

export function createMockXRButtonState(pressed = false, touched = false, value = 0.0): MockXRButtonState {
  const numVal = typeof value === 'number' ? value : (pressed ? 1.0 : 0.0);
  return {
    pressed: Boolean(pressed),
    touched: Boolean(touched || pressed || numVal > 0.05),
    value: clamp(numVal, 0.0, 1.0),
  };
}

export function createMockXRAxesState(x = 0.0, y = 0.0): MockXRAxesState {
  return {
    x: clamp(x, -1.0, 1.0),
    y: clamp(y, -1.0, 1.0),
  };
}

export function createMockXRTransform(
  pos = { x: 0, y: 1.65, z: 0 },
  rot = { x: 0, y: 0, z: 0, w: 1 },
): MockXRTransform {
  return {
    position: { x: pos.x, y: pos.y, z: pos.z },
    orientation: { x: rot.x, y: rot.y, z: rot.z, w: rot.w },
  };
}

export function createMockXRController(handedness: MockXRHandedness = 'right'): MockXRController {
  const isLeft = handedness === 'left';
  const defaultX = isLeft ? -0.25 : 0.25;
  return {
    handedness,
    transform: createMockXRTransform({ x: defaultX, y: 1.2, z: -0.4 }),
    trigger: createMockXRButtonState(),
    grip: createMockXRButtonState(),
    primaryButton: createMockXRButtonState(),
    secondaryButton: createMockXRButtonState(),
    thumbstick: {
      button: createMockXRButtonState(),
      axes: createMockXRAxesState(),
    },
    isPinching: false,
    pinchStrength: 0.0,
  };
}

export function createMockXRHeadset(): MockXRHeadset {
  return {
    transform: createMockXRTransform({ x: 0, y: 1.65, z: 0 }),
    ipdM: 0.063, // Standard 63mm IPD
    fovHorizontalDeg: 110.0,
    fovVerticalDeg: 96.0,
  };
}

export function createMockXRSessionState(
  headset: MockXRHeadset = createMockXRHeadset(),
  leftController: MockXRController = createMockXRController('left'),
  rightController: MockXRController = createMockXRController('right'),
): MockXRSessionState {
  return {
    headset,
    leftController,
    rightController,
    activeReferenceSpace: 'local-floor',
    isPresenting: true,
  };
}

export function createDefaultVRThresholds(targetFps: 72 | 90 | 120 = 72): VRPerformanceThresholds {
  const frameBudgetMs = targetFps === 120 ? 8.33 : (targetFps === 90 ? 11.11 : 13.88);
  const p95LimitMs = targetFps === 120 ? 8.0 : (targetFps === 90 ? 10.8 : 13.5);
  const maxDrawCalls = targetFps === 120 ? 100 : (targetFps === 90 ? 125 : 150);
  const maxTriangles = targetFps === 120 ? 450000 : (targetFps === 90 ? 600000 : 750000);

  return {
    targetFps,
    maxAllowableFrameTimeMs: frameBudgetMs,
    maxDrawCallsPerFrame: maxDrawCalls,
    maxTrianglesPerFrame: maxTriangles,
    maxHeapAllocationsBytesPerFrame: 0,
    maxP95FrameTimeMs: p95LimitMs,
    maxDroppedFramesRatio: 0.01,
  };
}

export function createSyntheticVRScenario(presetId: string): SyntheticVRScenario {
  const scenario = SYNTHETIC_VR_SCENARIOS[presetId];
  if (scenario) {
    return JSON.parse(JSON.stringify(scenario));
  }
  return JSON.parse(JSON.stringify(SYNTHETIC_VR_SCENARIOS.walkthrough_soundstage));
}

export function createVRProfilerConfig(
  targetFps: 72 | 90 | 120 = 72,
  overrides?: Partial<VRProfilerConfig>,
): VRProfilerConfig {
  const thresholds = createDefaultVRThresholds(targetFps);
  const base: VRProfilerConfig = {
    enabled: true,
    targetFps,
    thresholds,
    showDiagnosticHud: false,
    recordTelemetry: false,
    activeScenarioId: 'walkthrough_soundstage',
  };

  if (!overrides) return base;
  return normalizeVRProfilerConfig({ ...base, ...overrides });
}

export function isVRProfilerConfig(obj: unknown): obj is VRProfilerConfig {
  if (!obj || typeof obj !== 'object') return false;
  const c = obj as Partial<VRProfilerConfig>;

  const validEnabled = typeof c.enabled === 'boolean';
  const validFps = c.targetFps === 72 || c.targetFps === 90 || c.targetFps === 120;
  const validHud = typeof c.showDiagnosticHud === 'boolean';
  const validTelemetry = typeof c.recordTelemetry === 'boolean';
  const validThresholds = typeof c.thresholds === 'object' && c.thresholds !== null;

  return validEnabled && validFps && validHud && validTelemetry && validThresholds;
}

export function normalizeVRProfilerConfig(raw: unknown): VRProfilerConfig {
  if (!raw || typeof raw !== 'object') {
    return createVRProfilerConfig(72);
  }

  const c = raw as Partial<VRProfilerConfig>;
  let targetFps: 72 | 90 | 120 = 72;
  if (c.targetFps === 120) targetFps = 120;
  else if (c.targetFps === 90) targetFps = 90;

  const defaultThresholds = createDefaultVRThresholds(targetFps);
  const t = c.thresholds || defaultThresholds;

  const thresholds: VRPerformanceThresholds = {
    targetFps,
    maxAllowableFrameTimeMs: typeof t.maxAllowableFrameTimeMs === 'number' && t.maxAllowableFrameTimeMs > 1.0
      ? t.maxAllowableFrameTimeMs
      : defaultThresholds.maxAllowableFrameTimeMs,
    maxDrawCallsPerFrame: typeof t.maxDrawCallsPerFrame === 'number' && t.maxDrawCallsPerFrame > 10
      ? Math.floor(t.maxDrawCallsPerFrame)
      : defaultThresholds.maxDrawCallsPerFrame,
    maxTrianglesPerFrame: typeof t.maxTrianglesPerFrame === 'number' && t.maxTrianglesPerFrame > 1000
      ? Math.floor(t.maxTrianglesPerFrame)
      : defaultThresholds.maxTrianglesPerFrame,
    maxHeapAllocationsBytesPerFrame: typeof t.maxHeapAllocationsBytesPerFrame === 'number' && t.maxHeapAllocationsBytesPerFrame >= 0
      ? Math.floor(t.maxHeapAllocationsBytesPerFrame)
      : 0,
    maxP95FrameTimeMs: typeof t.maxP95FrameTimeMs === 'number' && t.maxP95FrameTimeMs > 1.0
      ? t.maxP95FrameTimeMs
      : defaultThresholds.maxP95FrameTimeMs,
    maxDroppedFramesRatio: typeof t.maxDroppedFramesRatio === 'number' && t.maxDroppedFramesRatio >= 0.0 && t.maxDroppedFramesRatio <= 1.0
      ? t.maxDroppedFramesRatio
      : defaultThresholds.maxDroppedFramesRatio,
  };

  return {
    enabled: typeof c.enabled === 'boolean' ? c.enabled : true,
    targetFps,
    thresholds,
    showDiagnosticHud: typeof c.showDiagnosticHud === 'boolean' ? c.showDiagnosticHud : false,
    recordTelemetry: typeof c.recordTelemetry === 'boolean' ? c.recordTelemetry : false,
    activeScenarioId: typeof c.activeScenarioId === 'string' && c.activeScenarioId.length > 0
      ? c.activeScenarioId
      : 'walkthrough_soundstage',
  };
}

// ---------------------------------------------------------------------------
// Scenario Interpolation Engine
// ---------------------------------------------------------------------------

/**
 * Evaluates synthetic scenario frame at a given timestamp and returns 6DoF mock session state.
 */
export function interpolateSyntheticScenarioFrame(scenario: SyntheticVRScenario, timeSec: number): MockXRSessionState {
  const session = createMockXRSessionState();
  if (!scenario || !Array.isArray(scenario.keyframeActions) || scenario.keyframeActions.length === 0) {
    return session;
  }

  const duration = Math.max(0.1, scenario.durationSec);
  const clampedTime = clamp(timeSec, 0, duration);
  const actions = scenario.keyframeActions;

  // Single keyframe boundary
  if (actions.length === 1 || clampedTime <= actions[0].timeSec) {
    const kf = actions[0];
    session.headset.transform.position = { ...kf.headsetPos };
    session.headset.transform.orientation = quaternionFromYawDeg(kf.headsetYawDeg);
    if (kf.leftHandPos) session.leftController.transform.position = { ...kf.leftHandPos };
    if (kf.rightHandPos) session.rightController.transform.position = { ...kf.rightHandPos };
    if (kf.rightTrigger !== undefined) {
      session.rightController.trigger = createMockXRButtonState(kf.rightTrigger > 0.5, kf.rightTrigger > 0.05, kf.rightTrigger);
      session.rightController.isPinching = kf.rightTrigger > 0.7;
      session.rightController.pinchStrength = kf.rightTrigger;
    }
    if (kf.rightGrip !== undefined) {
      session.rightController.grip = createMockXRButtonState(kf.rightGrip > 0.5, kf.rightGrip > 0.05, kf.rightGrip);
    }
    if (kf.thumbstickAxes) {
      session.rightController.thumbstick.axes = { ...kf.thumbstickAxes };
    }
    return session;
  }

  if (clampedTime >= actions[actions.length - 1].timeSec) {
    const kf = actions[actions.length - 1];
    session.headset.transform.position = { ...kf.headsetPos };
    session.headset.transform.orientation = quaternionFromYawDeg(kf.headsetYawDeg);
    if (kf.leftHandPos) session.leftController.transform.position = { ...kf.leftHandPos };
    if (kf.rightHandPos) session.rightController.transform.position = { ...kf.rightHandPos };
    if (kf.rightTrigger !== undefined) {
      session.rightController.trigger = createMockXRButtonState(kf.rightTrigger > 0.5, kf.rightTrigger > 0.05, kf.rightTrigger);
      session.rightController.isPinching = kf.rightTrigger > 0.7;
      session.rightController.pinchStrength = kf.rightTrigger;
    }
    if (kf.rightGrip !== undefined) {
      session.rightController.grip = createMockXRButtonState(kf.rightGrip > 0.5, kf.rightGrip > 0.05, kf.rightGrip);
    }
    if (kf.thumbstickAxes) {
      session.rightController.thumbstick.axes = { ...kf.thumbstickAxes };
    }
    return session;
  }

  // Find adjacent keyframes
  let idx = 0;
  for (let i = 0; i < actions.length - 1; i++) {
    if (clampedTime >= actions[i].timeSec && clampedTime <= actions[i + 1].timeSec) {
      idx = i;
      break;
    }
  }

  const kf0 = actions[idx];
  const kf1 = actions[idx + 1];
  const segmentDuration = Math.max(0.0001, kf1.timeSec - kf0.timeSec);
  const t = clamp((clampedTime - kf0.timeSec) / segmentDuration, 0, 1);

  // Interpolate headset
  session.headset.transform.position = lerpVec3(kf0.headsetPos, kf1.headsetPos, t);
  const yaw = lerpAngleDeg(kf0.headsetYawDeg, kf1.headsetYawDeg, t);
  session.headset.transform.orientation = quaternionFromYawDeg(yaw);

  // Interpolate Left Hand
  const left0 = kf0.leftHandPos || { x: -0.25, y: 1.1, z: -0.4 };
  const left1 = kf1.leftHandPos || { x: -0.25, y: 1.1, z: -0.4 };
  session.leftController.transform.position = lerpVec3(left0, left1, t);
  session.leftController.transform.orientation = quaternionFromYawDeg(yaw);

  // Interpolate Right Hand
  const right0 = kf0.rightHandPos || { x: 0.25, y: 1.1, z: -0.4 };
  const right1 = kf1.rightHandPos || { x: 0.25, y: 1.1, z: -0.4 };
  session.rightController.transform.position = lerpVec3(right0, right1, t);
  session.rightController.transform.orientation = quaternionFromYawDeg(yaw);

  // Interpolate trigger and grip
  const trig0 = kf0.rightTrigger ?? 0.0;
  const trig1 = kf1.rightTrigger ?? 0.0;
  const currentTrig = lerp(trig0, trig1, t);
  session.rightController.trigger = createMockXRButtonState(currentTrig > 0.5, currentTrig > 0.05, currentTrig);
  session.rightController.isPinching = currentTrig > 0.7;
  session.rightController.pinchStrength = currentTrig;

  const grip0 = kf0.rightGrip ?? 0.0;
  const grip1 = kf1.rightGrip ?? 0.0;
  const currentGrip = lerp(grip0, grip1, t);
  session.rightController.grip = createMockXRButtonState(currentGrip > 0.5, currentGrip > 0.05, currentGrip);

  // Interpolate thumbstick
  const thumbX0 = kf0.thumbstickAxes?.x ?? 0.0;
  const thumbY0 = kf0.thumbstickAxes?.y ?? 0.0;
  const thumbX1 = kf1.thumbstickAxes?.x ?? 0.0;
  const thumbY1 = kf1.thumbstickAxes?.y ?? 0.0;
  session.rightController.thumbstick.axes = {
    x: lerp(thumbX0, thumbX1, t),
    y: lerp(thumbY0, thumbY1, t),
  };

  return session;
}

// ---------------------------------------------------------------------------
// Benchmark Analytics Engine
// ---------------------------------------------------------------------------

export function calculateBenchmarkSummary(
  samples: FrameTelemetrySample[],
  thresholds: VRPerformanceThresholds,
): VRBenchmarkReport {
  if (!samples || samples.length === 0) {
    return {
      totalFramesAudited: 0,
      testDurationSec: 0,
      targetFps: thresholds.targetFps,
      averageFps: 0,
      p95FrameTimeMs: 0,
      p99FrameTimeMs: 0,
      maxFrameTimeMs: 0,
      droppedFrameCount: 0,
      droppedFrameRatio: 0,
      maxDrawCalls: 0,
      avgDrawCalls: 0,
      maxTriangles: 0,
      totalGcStutterEvents: 0,
      heapAllocationsDetected: false,
      passedTest: false,
      failureReasons: ['No telemetry samples recorded during benchmark test run.'],
      recommendations: ['Ensure the benchmark runtime is active and recording frames.'],
    };
  }

  const n = samples.length;
  const frameTimes = new Float64Array(n);
  let totalFrameTimeSum = 0;
  let totalDrawCallsSum = 0;
  let maxDrawCalls = 0;
  let maxTriangles = 0;
  let maxFrameTimeMs = 0;
  let droppedFrameCount = 0;
  let totalGcStutterEvents = 0;
  let heapAllocationsDetected = false;

  const allowableFrameTimeMs = thresholds.maxAllowableFrameTimeMs;

  for (let i = 0; i < n; i++) {
    const s = samples[i];
    frameTimes[i] = s.frameTimeMs;
    totalFrameTimeSum += s.frameTimeMs;
    totalDrawCallsSum += s.drawCallCount;

    if (s.drawCallCount > maxDrawCalls) maxDrawCalls = s.drawCallCount;
    if (s.triangleCount > maxTriangles) maxTriangles = s.triangleCount;
    if (s.frameTimeMs > maxFrameTimeMs) maxFrameTimeMs = s.frameTimeMs;
    if (s.frameTimeMs > allowableFrameTimeMs * 1.05) droppedFrameCount++;
    if (s.gcEventDetected) totalGcStutterEvents++;
    if (s.heapAllocatedBytes > thresholds.maxHeapAllocationsBytesPerFrame) heapAllocationsDetected = true;
  }

  frameTimes.sort();

  const p95Index = Math.min(n - 1, Math.floor(n * 0.95));
  const p99Index = Math.min(n - 1, Math.floor(n * 0.99));
  const p95FrameTimeMs = frameTimes[p95Index];
  const p99FrameTimeMs = frameTimes[p99Index];

  const avgFrameTimeMs = totalFrameTimeSum / n;
  const averageFps = avgFrameTimeMs > 0.001 ? Math.min(240, 1000 / avgFrameTimeMs) : 0;
  const avgDrawCalls = Math.round(totalDrawCallsSum / n);
  const droppedFrameRatio = droppedFrameCount / n;

  const firstTs = samples[0].timestampMs;
  const lastTs = samples[n - 1].timestampMs;
  const durationFromTimestamps = (lastTs - firstTs) / 1000;
  const testDurationSec = durationFromTimestamps > 0.01 ? durationFromTimestamps : totalFrameTimeSum / 1000;

  // Failure and recommendation analysis
  const failureReasons: string[] = [];
  const recommendations: string[] = [];

  if (p95FrameTimeMs > thresholds.maxP95FrameTimeMs) {
    failureReasons.push(
      `P95 latency of ${p95FrameTimeMs.toFixed(2)}ms exceeded the ${thresholds.targetFps}fps limit of ${thresholds.maxP95FrameTimeMs.toFixed(2)}ms.`,
    );
    recommendations.push(
      'Enable Dynamic Resolution Scaling (DRS) or adjust scene LOD throttling to maintain frame pacing.',
    );
  }

  if (droppedFrameRatio > thresholds.maxDroppedFramesRatio) {
    failureReasons.push(
      `Dropped frame ratio of ${(droppedFrameRatio * 100).toFixed(2)}% exceeded allowable threshold of ${(thresholds.maxDroppedFramesRatio * 100).toFixed(2)}%.`,
    );
    recommendations.push(
      'Reduce per-frame CPU logic overhead or enable Fixed Foveated Rendering (FFR level 1.0) on Quest 3.',
    );
  }

  if (maxDrawCalls > thresholds.maxDrawCallsPerFrame) {
    failureReasons.push(
      `Peak draw call count (${maxDrawCalls}) exceeded standalone Quest 3 hardware budget (${thresholds.maxDrawCallsPerFrame}).`,
    );
    recommendations.push(
      'Batch static set geometry, merge meshes with shared materials, and utilize InstancedMesh for duplicate props.',
    );
  }

  if (maxTriangles > thresholds.maxTrianglesPerFrame) {
    failureReasons.push(
      `Peak triangle count (${maxTriangles.toLocaleString()}) exceeded allowable stage limit (${thresholds.maxTrianglesPerFrame.toLocaleString()}).`,
    );
    recommendations.push(
      'Voxel-downsample dense 3D Gaussian Splats and decimate high-polygon architectural set pieces.',
    );
  }

  if (heapAllocationsDetected) {
    failureReasons.push(
      'Active heap memory allocations detected during frame update loop (zero-allocation budget violated).',
    );
    recommendations.push(
      'Utilize StaticObjectPool / MemorySentinel for THREE.Vector3 and THREE.Quaternion in animation and physics updates.',
    );
  }

  if (totalGcStutterEvents > 0 && recommendations.length === 0) {
    recommendations.push(
      'Pre-allocate all transient math vectors and avoid closure allocations in requestAnimationFrame handlers.',
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      'Hardware performance complies with Meta Quest 3 standalone production standards.',
    );
  }

  const passedTest = failureReasons.length === 0;

  return {
    totalFramesAudited: n,
    testDurationSec: Math.round(testDurationSec * 100) / 100,
    targetFps: thresholds.targetFps,
    averageFps: Math.round(averageFps * 10) / 10,
    p95FrameTimeMs: Math.round(p95FrameTimeMs * 100) / 100,
    p99FrameTimeMs: Math.round(p99FrameTimeMs * 100) / 100,
    maxFrameTimeMs: Math.round(maxFrameTimeMs * 100) / 100,
    droppedFrameCount,
    droppedFrameRatio: Math.round(droppedFrameRatio * 10000) / 10000,
    maxDrawCalls,
    avgDrawCalls,
    maxTriangles,
    totalGcStutterEvents,
    heapAllocationsDetected,
    passedTest,
    failureReasons,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Telemetry Export Generators (CSV and Standalone HTML Deck)
// ---------------------------------------------------------------------------

/**
 * Provenance of the frame samples behind a performance report.
 *
 * `simulated` samples come from the synthetic scenario generator, not from frames a
 * headset actually rendered. Both feed the same exporters, so without this the two are
 * indistinguishable once the file leaves the app.
 */
export type BenchmarkSampleProvenance = 'measured' | 'simulated';

export function generatePerformanceReportCsv(
  samples: FrameTelemetrySample[],
  provenance: BenchmarkSampleProvenance = 'measured',
): string {
  const provenanceLabel =
    provenance === 'simulated'
      ? 'SIMULATED (synthetic benchmark scenario, NOT frames rendered on a headset)'
      : 'MEASURED (frames profiled from a real run)';
  const headers = [
    'FrameIndex',
    'TimestampMs',
    'FrameTimeMs',
    'InstantFps',
    'CpuLogicTimeMs',
    'GpuRenderTimeMs',
    'DrawCalls',
    'TriangleCount',
    'ProgramSwitches',
    'TextureMemoryBytes',
    'GeometryMemoryBytes',
    'HeapAllocatedBytes',
    'GCEvent',
  ];

  const lines = [`DataSource,${provenanceLabel}`, headers.join(',')];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const row = [
      s.frameIndex,
      s.timestampMs.toFixed(2),
      s.frameTimeMs.toFixed(3),
      s.instantFps.toFixed(1),
      s.cpuLogicTimeMs.toFixed(3),
      s.gpuRenderTimeMs.toFixed(3),
      s.drawCallCount,
      s.triangleCount,
      s.shaderProgramSwitches,
      s.textureMemoryBytes,
      s.geometryMemoryBytes,
      s.heapAllocatedBytes,
      s.gcEventDetected ? '1' : '0',
    ];
    lines.push(row.join(','));
  }

  return lines.join('\r\n');
}

export function generatePerformanceReportHtml(
  report: VRBenchmarkReport,
  samples: FrameTelemetrySample[],
  sceneName: string = 'SetView Production Stage',
): string {
  const statusColor = report.passedTest ? '#10b981' : '#ef4444';
  const statusBadge = report.passedTest ? 'PASSED PRODUCTION AUDIT' : 'FAILED PERFORMANCE BUDGET';
  const sampleCount = samples.length;

  // Generate SVG Sparkline for frame latency
  const svgWidth = 800;
  const svgHeight = 160;
  const maxTime = Math.max(25.0, report.maxFrameTimeMs * 1.1);

  let pathD = '';
  const stride = Math.max(1, Math.floor(sampleCount / 300));
  let pointCount = 0;

  for (let i = 0; i < sampleCount; i += stride) {
    const s = samples[i];
    const x = (i / (sampleCount - 1 || 1)) * svgWidth;
    const y = svgHeight - (s.frameTimeMs / maxTime) * svgHeight;
    if (pointCount === 0) {
      pathD += `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    } else {
      pathD += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    pointCount++;
  }

  const budgetY = (svgHeight - ((1000 / report.targetFps) / maxTime) * svgHeight).toFixed(1);

  const failureItemsHtml = report.failureReasons.length > 0
    ? report.failureReasons.map((r) => `<li class="failure-item">${r}</li>`).join('\n')
    : '<li class="success-item">All hardware performance metrics satisfied Meta Quest 3 standalone budgets.</li>';

  const recommendationItemsHtml = report.recommendations
    .map((r) => `<li class="rec-item">${r}</li>`)
    .join('\n');

  // Preview table rows
  const tableRowsHtml = samples.slice(0, 50).map((s) => `
    <tr>
      <td>${s.frameIndex}</td>
      <td>${s.frameTimeMs.toFixed(2)} ms</td>
      <td>${s.instantFps.toFixed(1)}</td>
      <td>${s.drawCallCount}</td>
      <td>${s.triangleCount.toLocaleString()}</td>
      <td>${s.gcEventDetected ? '<span class="gc-tag">GC SPIKE</span>' : '<span class="ok-tag">OK</span>'}</td>
    </tr>
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SetView WebXR Frame Performance Audit: ${sceneName}</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --card-border: #1f293d;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #38bdf8;
      --emerald: #10b981;
      --crimson: #ef4444;
      --amber: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 32px 20px;
      line-height: 1.5;
    }
    .container {
      max-width: 1040px;
      margin: 0 auto;
    }
    .header-card {
      background: linear-gradient(135deg, #131d31 0%, #0d1424 100%);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 28px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .title-area h1 {
      font-size: 24px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 6px;
    }
    .title-area p {
      font-size: 14px;
      color: var(--text-muted);
    }
    .status-badge {
      background: ${statusColor}22;
      border: 1px solid ${statusColor};
      color: ${statusColor};
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.05em;
      padding: 10px 18px;
      border-radius: 8px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 18px;
    }
    .metric-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .metric-value {
      font-size: 22px;
      font-weight: 700;
      color: #ffffff;
    }
    .metric-sub {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    .section-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .section-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .chart-container {
      width: 100%;
      background: #090e1a;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 16px;
      overflow-x: auto;
    }
    svg {
      display: block;
      width: 100%;
      height: 160px;
    }
    ul.item-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    li.failure-item {
      background: rgba(239, 68, 68, 0.1);
      border-left: 4px solid var(--crimson);
      padding: 10px 14px;
      border-radius: 4px;
      font-size: 14px;
      color: #fca5a5;
    }
    li.success-item {
      background: rgba(16, 185, 129, 0.1);
      border-left: 4px solid var(--emerald);
      padding: 10px 14px;
      border-radius: 4px;
      font-size: 14px;
      color: #6ee7b7;
    }
    li.rec-item {
      background: rgba(56, 189, 248, 0.1);
      border-left: 4px solid var(--accent);
      padding: 10px 14px;
      border-radius: 4px;
      font-size: 14px;
      color: #bae6fd;
    }
    table.telemetry-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      text-align: left;
    }
    table.telemetry-table th {
      padding: 10px 12px;
      background: #182235;
      color: var(--text-muted);
      border-bottom: 1px solid var(--card-border);
    }
    table.telemetry-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #1a2336;
      color: var(--text-main);
    }
    .gc-tag {
      background: rgba(245, 158, 11, 0.2);
      color: #fbbf24;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
    }
    .ok-tag {
      color: #10b981;
      font-size: 11px;
      font-weight: 600;
    }
    .footer {
      text-align: center;
      font-size: 12px;
      color: #6b7280;
      margin-top: 32px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-card">
      <div class="title-area">
        <h1>WebXR Performance Audit Report</h1>
        <p>Scene: <strong>${sceneName}</strong> | Standalone Meta Quest 3 Quality Assurance</p>
      </div>
      <div class="status-badge">${statusBadge}</div>
    </div>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Target Rate</div>
        <div class="metric-value">${report.targetFps} FPS</div>
        <div class="metric-sub">${(1000 / report.targetFps).toFixed(2)} ms Budget</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Effective FPS</div>
        <div class="metric-value" style="color: ${report.averageFps >= report.targetFps * 0.95 ? 'var(--emerald)' : 'var(--amber)'};">${report.averageFps}</div>
        <div class="metric-sub">${report.totalFramesAudited} frames</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">P95 Latency</div>
        <div class="metric-value" style="color: ${report.p95FrameTimeMs <= (1000 / report.targetFps) ? 'var(--emerald)' : 'var(--crimson)'};">${report.p95FrameTimeMs} ms</div>
        <div class="metric-sub">P99: ${report.p99FrameTimeMs} ms</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Dropped Frames</div>
        <div class="metric-value" style="color: ${report.droppedFrameRatio <= 0.01 ? 'var(--emerald)' : 'var(--crimson)'};">${(report.droppedFrameRatio * 100).toFixed(2)}%</div>
        <div class="metric-sub">${report.droppedFrameCount} dropped</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Max Draw Calls</div>
        <div class="metric-value">${report.maxDrawCalls}</div>
        <div class="metric-sub">Avg: ${report.avgDrawCalls}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Peak Triangles</div>
        <div class="metric-value">${report.maxTriangles.toLocaleString()}</div>
        <div class="metric-sub">Quest 3 Budget: 750k</div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-title">Frame Duration & Latency Sparkline</div>
      <div class="chart-container">
        <svg viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="none">
          <!-- Target budget line -->
          <line x1="0" y1="${budgetY}" x2="${svgWidth}" y2="${budgetY}" stroke="#38bdf8" stroke-dasharray="4,4" stroke-width="1.5" opacity="0.7" />
          <!-- Latency graph -->
          <path d="${pathD}" fill="none" stroke="${report.passedTest ? '#10b981' : '#ef4444'}" stroke-width="2" />
        </svg>
      </div>
    </div>

    <div class="section-card">
      <div class="section-title">Audit Violations & Failure Causes</div>
      <ul class="item-list">
        ${failureItemsHtml}
      </ul>
    </div>

    <div class="section-card">
      <div class="section-title">Technical Optimization Recommendations</div>
      <ul class="item-list">
        ${recommendationItemsHtml}
      </ul>
    </div>

    <div class="section-card">
      <div class="section-title">Sample Telemetry Trace (First 50 Frames)</div>
      <table class="telemetry-table">
        <thead>
          <tr>
            <th>Frame #</th>
            <th>Frame Time</th>
            <th>Instant FPS</th>
            <th>Draw Calls</th>
            <th>Triangles</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    </div>

    <div class="footer">
      Generated automatically by SetView WebXR Emulation Test Harness & Frame Profiler Suite
    </div>
  </div>
</body>
</html>`;
}
