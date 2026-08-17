// ---------------------------------------------------------------------------
// SetView Pure Domain Performance Governor Engine
// PURE DOMAIN MODULE - ZERO Three.js or DOM imports.
// Suitable for direct execution in Node.js unit tests and headless runtimes.
// ---------------------------------------------------------------------------

export type PerformanceLevel = 'low' | 'medium' | 'high' | 'ultra' | 'adaptive';

export interface FrameMetrics {
  frameTimeMs: number;
  fps: number;
  droppedFrames: number;
  renderScale: number;
  foveationLevel: number;
  splatBudget: number;
  volumetricSteps: number;
  gcPressure: 'low' | 'medium' | 'high';
}

export interface GovernorConfig {
  targetFps: 72 | 90 | 120;
  minRenderScale: number;
  maxRenderScale: number;
  enableFoveatedRendering: boolean;
  enableDynamicResolution: boolean;
  enableLODThrottling: boolean;
  measurementWindowFrames: number;
}

export const DEFAULT_GOVERNOR_CONFIG: Readonly<GovernorConfig> = {
  targetFps: 72,
  minRenderScale: 0.6,
  maxRenderScale: 1.25,
  enableFoveatedRendering: true,
  enableDynamicResolution: true,
  enableLODThrottling: true,
  measurementWindowFrames: 90,
};

/**
 * Pre-allocated ring buffer for tracking frame latencies, jitter, and dropped frames
 * with ZERO heap allocations during frame ingestion and analysis.
 */
export class RollingFrameStats {
  private readonly capacity: number;
  private readonly buffer: Float64Array;
  private readonly sortScratch: Float64Array;
  private head: number = 0;
  private count: number = 0;
  private runningSum: number = 0;
  private runningSqSum: number = 0;
  private droppedFrameCount: number = 0;

  constructor(capacity: number = 120) {
    this.capacity = Math.max(2, Math.floor(capacity));
    this.buffer = new Float64Array(this.capacity);
    this.sortScratch = new Float64Array(this.capacity);
  }

  /**
   * Records a frame duration in milliseconds into the pre-allocated ring buffer.
   * Performs zero object or array allocations.
   */
  public addFrame(durationMs: number): void {
    const sanitizedMs = Number.isFinite(durationMs) ? Math.max(0.1, durationMs) : 16.67;

    if (this.count < this.capacity) {
      this.buffer[this.head] = sanitizedMs;
      this.runningSum += sanitizedMs;
      this.runningSqSum += sanitizedMs * sanitizedMs;
      this.count++;
      this.head = (this.head + 1) % this.capacity;
    } else {
      const oldVal = this.buffer[this.head];
      this.runningSum = this.runningSum - oldVal + sanitizedMs;
      this.runningSqSum = this.runningSqSum - (oldVal * oldVal) + (sanitizedMs * sanitizedMs);
      this.buffer[this.head] = sanitizedMs;
      this.head = (this.head + 1) % this.capacity;
    }

    // High spike threshold (> 25ms or > 1.5x of 60fps) marks a hitch/drop
    if (sanitizedMs > 25.0) {
      this.droppedFrameCount++;
    }
  }

  /** Returns mean frame duration across the active window in milliseconds. */
  public getAverageMs(): number {
    if (this.count === 0) return 0;
    return this.runningSum / this.count;
  }

  /**
   * Computes P95 latency across the window.
   * In-place quickselect/sort in pre-allocated scratch buffer, zero garbage collection.
   */
  public getP95Ms(): number {
    if (this.count === 0) return 0;
    const n = this.count;

    // Copy ring buffer items to pre-allocated scratch buffer
    for (let i = 0; i < n; i++) {
      this.sortScratch[i] = this.buffer[i];
    }

    // In-place sort scratch slice
    const slice = this.sortScratch.subarray(0, n);
    slice.sort();

    const p95Index = Math.min(n - 1, Math.floor(n * 0.95));
    return slice[p95Index];
  }

  /**
   * Computes standard deviation frame time jitter in milliseconds.
   */
  public getJitterMs(): number {
    if (this.count <= 1) return 0;
    const mean = this.runningSum / this.count;
    const variance = Math.max(0, (this.runningSqSum / this.count) - (mean * mean));
    return Math.sqrt(variance);
  }

  /** Computes effective frames per second based on the rolling mean. */
  public getEffectiveFps(): number {
    const avg = this.getAverageMs();
    if (avg <= 0.001) return 0;
    return Math.min(240, 1000 / avg);
  }

  /**
   * Computes ratio of dropped frames relative to the target frame budget or target FPS.
   * A frame is considered dropped if its duration exceeds 115% of the target frame budget.
   */
  public getDroppedFrameRatio(targetFpsOrBudgetMs: number): number {
    if (this.count === 0) return 0;
    const budgetMs = targetFpsOrBudgetMs > 40 ? 1000 / targetFpsOrBudgetMs : (targetFpsOrBudgetMs > 0 ? targetFpsOrBudgetMs : 13.88);
    const thresholdMs = budgetMs * 1.15;

    let dropped = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.buffer[i] > thresholdMs) {
        dropped++;
      }
    }
    return dropped / this.count;
  }

  /** Returns count of dropped frames relative to target frame budget in current window. */
  public getDroppedFrameCount(budgetMsOrFps: number): number {
    if (this.count === 0) return 0;
    const budgetMs = budgetMsOrFps > 40 ? 1000 / budgetMsOrFps : budgetMsOrFps;
    const thresholdMs = budgetMs * 1.15;

    let dropped = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.buffer[i] > thresholdMs) {
        dropped++;
      }
    }
    return dropped;
  }

  /** Returns total dropped frames detected since inception or reset. */
  public getDroppedFrames(): number {
    return this.droppedFrameCount;
  }

  /** Returns number of recorded frames in current buffer window. */
  public getCount(): number {
    return this.count;
  }

  /** Returns number of recorded frames in current buffer window. */
  public getSampleCount(): number {
    return this.count;
  }

  /** Returns buffer capacity. */
  public getCapacity(): number {
    return this.capacity;
  }

  /** Resets the rolling statistics buffer. */
  public reset(): void {
    this.head = 0;
    this.count = 0;
    this.runningSum = 0;
    this.runningSqSum = 0;
    this.droppedFrameCount = 0;
    this.buffer.fill(0);
    this.sortScratch.fill(0);
  }
}

/**
 * Creates a validated GovernorConfig with default values and optional overrides.
 */
export function createGovernorConfig(overrides?: Partial<GovernorConfig>): GovernorConfig {
  const base: GovernorConfig = {
    targetFps: 72,
    minRenderScale: 0.6,
    maxRenderScale: 1.25,
    enableFoveatedRendering: true,
    enableDynamicResolution: true,
    enableLODThrottling: true,
    measurementWindowFrames: 90,
  };

  if (!overrides) return base;

  return normalizeGovernorConfig({
    ...base,
    ...overrides,
  });
}

/**
 * Type guard for GovernorConfig.
 */
export function isGovernorConfig(raw: unknown): raw is GovernorConfig {
  if (!raw || typeof raw !== 'object') return false;
  const c = raw as Partial<GovernorConfig>;

  const validFps = c.targetFps === 72 || c.targetFps === 90 || c.targetFps === 120;
  const validMinScale = typeof c.minRenderScale === 'number' && Number.isFinite(c.minRenderScale) && c.minRenderScale > 0.1 && c.minRenderScale <= 2.0;
  const validMaxScale = typeof c.maxRenderScale === 'number' && Number.isFinite(c.maxRenderScale) && c.maxRenderScale >= 0.5 && c.maxRenderScale <= 3.0;
  const validFfr = typeof c.enableFoveatedRendering === 'boolean';
  const validDrs = typeof c.enableDynamicResolution === 'boolean';
  const validLod = typeof c.enableLODThrottling === 'boolean';
  const validWindow = typeof c.measurementWindowFrames === 'number' && Number.isInteger(c.measurementWindowFrames) && c.measurementWindowFrames >= 10 && c.measurementWindowFrames <= 600;

  return validFps && validMinScale && validMaxScale && validFfr && validDrs && validLod && validWindow;
}

/**
 * Sanitizes and normalizes a raw GovernorConfig object, repairing out-of-range fields.
 */
export function normalizeGovernorConfig(raw: unknown): GovernorConfig {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_GOVERNOR_CONFIG };
  }

  const c = raw as Partial<GovernorConfig>;

  let targetFps: 72 | 90 | 120 = 72;
  if (c.targetFps === 120) targetFps = 120;
  else if (c.targetFps === 90) targetFps = 90;

  const minRenderScale = typeof c.minRenderScale === 'number' && Number.isFinite(c.minRenderScale)
    ? Math.max(0.4, Math.min(1.0, c.minRenderScale))
    : DEFAULT_GOVERNOR_CONFIG.minRenderScale;

  const maxRenderScale = typeof c.maxRenderScale === 'number' && Number.isFinite(c.maxRenderScale)
    ? Math.max(minRenderScale, Math.min(2.5, c.maxRenderScale))
    : DEFAULT_GOVERNOR_CONFIG.maxRenderScale;

  const enableFoveatedRendering = typeof c.enableFoveatedRendering === 'boolean'
    ? c.enableFoveatedRendering
    : DEFAULT_GOVERNOR_CONFIG.enableFoveatedRendering;

  const enableDynamicResolution = typeof c.enableDynamicResolution === 'boolean'
    ? c.enableDynamicResolution
    : DEFAULT_GOVERNOR_CONFIG.enableDynamicResolution;

  const enableLODThrottling = typeof c.enableLODThrottling === 'boolean'
    ? c.enableLODThrottling
    : DEFAULT_GOVERNOR_CONFIG.enableLODThrottling;

  const measurementWindowFrames = typeof c.measurementWindowFrames === 'number' && Number.isFinite(c.measurementWindowFrames)
    ? Math.max(10, Math.min(300, Math.floor(c.measurementWindowFrames)))
    : DEFAULT_GOVERNOR_CONFIG.measurementWindowFrames;

  return {
    targetFps,
    minRenderScale,
    maxRenderScale,
    enableFoveatedRendering,
    enableDynamicResolution,
    enableLODThrottling,
    measurementWindowFrames,
  };
}

/**
 * Calculates adaptive Dynamic Resolution Scaling (DRS) factor based on recent frame duration.
 * Uses asymmetric hysteresis: drops resolution quickly when over budget to prevent dropped frames,
 * and recovers resolution slowly when consistent headroom is available.
 */
export function calculateAdaptiveRenderScale(
  currentScale: number,
  avgFrameTimeMs: number,
  targetFrameTimeMs: number,
  minScale: number = 0.6,
  maxScale: number = 1.25,
): number {
  const safeCurrent = Number.isFinite(currentScale) ? currentScale : 1.0;
  const safeAvg = Number.isFinite(avgFrameTimeMs) && avgFrameTimeMs > 0.1 ? avgFrameTimeMs : targetFrameTimeMs;
  const safeTarget = Number.isFinite(targetFrameTimeMs) && targetFrameTimeMs > 0.1 ? targetFrameTimeMs : 13.88;
  const safeMin = Math.max(0.3, Math.min(1.0, minScale));
  const safeMax = Math.max(safeMin, Math.min(2.5, maxScale));

  const loadRatio = safeAvg / safeTarget;

  // Over budget threshold (5% above target)
  if (loadRatio > 1.05) {
    // Fast decay step proportional to overload
    const scaleDrop = Math.min(0.15, (loadRatio - 1.0) * 0.4);
    const newScale = Math.max(safeMin, safeCurrent - scaleDrop);
    return Math.round(newScale * 1000) / 1000;
  }

  // Under budget with significant headroom (15% below target)
  if (loadRatio < 0.85) {
    // Gentle recovery step
    const scaleBoost = Math.min(0.04, (0.85 - loadRatio) * 0.1);
    const newScale = Math.min(safeMax, safeCurrent + scaleBoost);
    return Math.round(newScale * 1000) / 1000;
  }

  // Inside deadband: keep steady to avoid render resolution oscillation
  return Math.round(Math.max(safeMin, Math.min(safeMax, safeCurrent)) * 1000) / 1000;
}

/**
 * Calculates adaptive Level-of-Detail (LOD) budget (e.g. Gaussian Splat count, mesh LOD)
 * based on performance headroom.
 */
export function calculateAdaptiveLODBudget(
  baseBudget: number,
  avgFrameTimeMs: number,
  targetFrameTimeMs: number,
  minBudget: number = 5000,
  maxBudget: number = 500000,
): number {
  const safeBase = Number.isFinite(baseBudget) && baseBudget > 0 ? baseBudget : 100000;
  const safeAvg = Number.isFinite(avgFrameTimeMs) && avgFrameTimeMs > 0.1 ? avgFrameTimeMs : targetFrameTimeMs;
  const safeTarget = Number.isFinite(targetFrameTimeMs) && targetFrameTimeMs > 0.1 ? targetFrameTimeMs : 13.88;
  const safeMin = Math.max(100, Math.floor(minBudget));
  const safeMax = Math.max(safeMin, Math.floor(maxBudget));

  const ratio = safeTarget / safeAvg;

  let scaledBudget: number;
  if (ratio < 0.95) {
    // Under-performing: scale down aggressively
    scaledBudget = safeBase * Math.pow(ratio, 1.5);
  } else if (ratio > 1.2) {
    // Headroom available: scale up smoothly
    scaledBudget = safeBase * Math.min(1.5, 1.0 + (ratio - 1.0) * 0.5);
  } else {
    // Within tolerance
    scaledBudget = safeBase;
  }

  return Math.max(safeMin, Math.min(safeMax, Math.round(scaledBudget)));
}

/**
 * Estimates Garbage Collection / memory pressure from frame time jitter and latency spikes.
 */
export function estimateGCPressure(
  jitterMs: number,
  p95Ms: number,
  avgMs: number,
): 'low' | 'medium' | 'high' {
  const spikeDelta = p95Ms - avgMs;

  if (spikeDelta > 12.0 || jitterMs > 6.0) {
    return 'high';
  }
  if (spikeDelta > 5.0 || jitterMs > 2.5) {
    return 'medium';
  }
  return 'low';
}
