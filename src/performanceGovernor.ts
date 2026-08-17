// ---------------------------------------------------------------------------
// SetView Pure Domain Performance Governor Engine
// PURE DOMAIN MODULE - ZERO Three.js or DOM imports.
// Suitable for direct execution in Node.js unit tests and headless runtimes.
// ---------------------------------------------------------------------------

export type PerformanceLevel = 'low' | 'medium' | 'high' | 'ultra' | 'adaptive';

export interface FrameMetrics {
  /** Measured wall-clock duration of the last completed frame, end-to-end. */
  frameTimeMs: number;
  /**
   * Measured span between beginFrame() and endFrame(). This is CPU/logic time, not
   * frame time; it is legitimately 0 when the caller hands both calls the same
   * animation-frame timestamp.
   */
  cpuLogicTimeMs: number;
  fps: number;
  droppedFrames: number;
  /**
   * Framebuffer scale in effect for this session, or - between a session ending and the
   * next non-presenting frame pushing it - the scale the NEXT session will run at.
   *
   * This is NOT servoed during a session and does not track load frame by frame. WebXR
   * refuses framebuffer scale changes while presenting, so DRS makes exactly one decision
   * per session, at the presenting -> not-presenting transition, from that session's
   * vsync-miss ratio. Within a session this value is a constant.
   */
  renderScale: number;
  /**
   * Whether `renderScale` is the value the renderer is actually running. A scale decided
   * at session end stays pending until a non-presenting frame can push it, which is the
   * only moment three.js accepts it.
   */
  renderScaleApplied: boolean;
  foveationLevel: number;
  splatBudget: number;
  volumetricSteps: number;
  gcPressure: 'low' | 'medium' | 'high';
}

export interface GovernorConfig {
  targetFps: 72 | 90 | 120;
  minRenderScale: number;
  enableFoveatedRendering: boolean;
  enableDynamicResolution: boolean;
  enableLODThrottling: boolean;
  measurementWindowFrames: number;
}

/**
 * There is deliberately no `maxRenderScale`. DRS caps every climb at native (see
 * DRS_NATIVE_SCALE), so a configurable ceiling above 1.0 could not change the outcome at any
 * position it was set to - it was a live control wired to nothing, and the settings modal
 * showed it as if it worked. An old persisted config carrying the field is simply ignored by
 * normalizeGovernorConfig rather than rejected.
 */
export const DEFAULT_GOVERNOR_CONFIG: Readonly<GovernorConfig> = {
  targetFps: 72,
  minRenderScale: 0.6,
  enableFoveatedRendering: true,
  enableDynamicResolution: true,
  enableLODThrottling: true,
  measurementWindowFrames: 90,
};

/**
 * A frame longer than the target budget times this tolerance missed its vsync.
 *
 * On a vsync-locked headset there is nothing in between: a 72Hz Quest 3 either lands on
 * the 13.888ms scanout or slips to the next one at ~27.78ms. The tolerance only absorbs
 * timer noise around the budget, it is not a soft band - anything that misses lands far
 * above it.
 */
export const VSYNC_MISS_TOLERANCE = 1.15;

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
   * In-place quickselect in the pre-allocated scratch buffer, zero garbage collection.
   */
  public getP95Ms(): number {
    if (this.count === 0) return 0;
    const n = this.count;

    // Copy ring buffer items to pre-allocated scratch buffer
    for (let i = 0; i < n; i++) {
      this.sortScratch[i] = this.buffer[i];
    }

    return this.selectKth(n, Math.min(n - 1, Math.floor(n * 0.95)));
  }

  /**
   * Computes the median frame duration across the window (upper median on even windows).
   * In-place quickselect in the pre-allocated scratch buffer, zero garbage collection.
   *
   * An outlier-robust "how long does a typical recent frame take": one 3-second hitch drags
   * the mean over budget for the whole length of the window, while the median does not move
   * for it at all. Reported for diagnostics; note that on a vsync-locked headset it is
   * quantized like every other frame-time statistic and so cannot be used to judge headroom.
   */
  public getMedianMs(): number {
    if (this.count === 0) return 0;
    const n = this.count;

    for (let i = 0; i < n; i++) {
      this.sortScratch[i] = this.buffer[i];
    }

    return this.selectKth(n, n >> 1);
  }

  /**
   * Returns the k-th smallest (0-indexed) of the first n scratch entries, partitioning the
   * scratch buffer in place. Three-way partitioning keeps a window of identical frame times
   * - the normal case on a vsync-locked display - linear rather than quadratic, and a
   * median-of-three pivot does the same for an already ordered window.
   *
   * Allocation-free by construction: no subarray view, no closure, no comparator.
   */
  private selectKth(n: number, k: number): number {
    const a = this.sortScratch;
    let lo = 0;
    let hi = n - 1;

    while (lo < hi) {
      const mid = lo + ((hi - lo) >> 1);
      if (a[mid] < a[lo]) { const t = a[mid]; a[mid] = a[lo]; a[lo] = t; }
      if (a[hi] < a[lo]) { const t = a[hi]; a[hi] = a[lo]; a[lo] = t; }
      if (a[hi] < a[mid]) { const t = a[hi]; a[hi] = a[mid]; a[mid] = t; }
      const pivot = a[mid];

      // Dutch-national-flag partition: [lo, lt) < pivot, [lt, gt] == pivot, (gt, hi] > pivot
      let lt = lo;
      let gt = hi;
      let i = lo;
      while (i <= gt) {
        const v = a[i];
        if (v < pivot) {
          a[i] = a[lt];
          a[lt] = v;
          lt++;
          i++;
        } else if (v > pivot) {
          a[i] = a[gt];
          a[gt] = v;
          gt--;
        } else {
          i++;
        }
      }

      if (k < lt) hi = lt - 1;
      else if (k > gt) lo = gt + 1;
      else return pivot;
    }

    return a[lo];
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
    const thresholdMs = budgetMs * VSYNC_MISS_TOLERANCE;

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
    const thresholdMs = budgetMs * VSYNC_MISS_TOLERANCE;

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
 * Whole-session tally of frames rendered and vsync deadlines missed.
 *
 * Separate from RollingFrameStats on purpose. That is a fixed-capacity ring with a
 * ~90-frame horizon, which is the right lens for FFR, LOD and GC pressure - decisions taken
 * many times a second off recent load. The DRS decision is taken ONCE, at session end, so
 * it wants the whole session, and a ring cannot supply that at any capacity worth keeping.
 *
 * The miss ratio is the one control signal a vsync-locked headset actually offers. Frame
 * time cannot say how much headroom exists - it is quantized to "hit 13.888ms" or "missed,
 * so ~27.78ms" and reads exactly at budget whenever the device is coping, whether it is
 * coping by 1% or by 50%. The FRACTION of frames that missed is not quantized: it moves
 * continuously from 0 to 1 and states plainly how much of the session juddered.
 *
 * It is not a headroom meter, though. Near zero it is blind in one direction - "barely
 * coping" and "enormous headroom" both read as 0% missed - which is why the decision that
 * consumes it needs memory of what already failed. See calculateSessionRenderScale.
 *
 * Two integers, no buffer: a session is unbounded in length and must not be.
 */
export class SessionFrameLedger {
  private frames: number = 0;
  private misses: number = 0;

  /** Records one measured frame against the target frame budget. */
  public record(frameTimeMs: number, budgetMs: number): void {
    if (!Number.isFinite(frameTimeMs) || frameTimeMs <= 0) return;
    const safeBudget = Number.isFinite(budgetMs) && budgetMs > 0.1 ? budgetMs : 13.888;
    this.frames++;
    if (frameTimeMs > safeBudget * VSYNC_MISS_TOLERANCE) {
      this.misses++;
    }
  }

  /** Frames measured so far this session. */
  public getFrameCount(): number {
    return this.frames;
  }

  /** Frames that missed their vsync deadline so far this session. */
  public getMissCount(): number {
    return this.misses;
  }

  /** Fraction of this session's frames that missed vsync, in [0, 1]. */
  public getMissRatio(): number {
    if (this.frames === 0) return 0;
    return this.misses / this.frames;
  }

  /** Clears the tally so a new session is judged only on its own frames. */
  public reset(): void {
    this.frames = 0;
    this.misses = 0;
  }
}

/**
 * Creates a validated GovernorConfig with default values and optional overrides.
 */
export function createGovernorConfig(overrides?: Partial<GovernorConfig>): GovernorConfig {
  const base: GovernorConfig = {
    targetFps: 72,
    minRenderScale: 0.6,
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
  const validFfr = typeof c.enableFoveatedRendering === 'boolean';
  const validDrs = typeof c.enableDynamicResolution === 'boolean';
  const validLod = typeof c.enableLODThrottling === 'boolean';
  const validWindow = typeof c.measurementWindowFrames === 'number' && Number.isInteger(c.measurementWindowFrames) && c.measurementWindowFrames >= 10 && c.measurementWindowFrames <= 600;

  return validFps && validMinScale && validFfr && validDrs && validLod && validWindow;
}

/**
 * Sanitizes and normalizes a raw GovernorConfig object, repairing out-of-range fields.
 *
 * Unknown fields are dropped, not rejected: a config persisted before `maxRenderScale` was
 * removed still normalizes cleanly, it just loses a field that could no longer do anything.
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
    enableFoveatedRendering,
    enableDynamicResolution,
    enableLODThrottling,
    measurementWindowFrames,
  };
}

/**
 * Session vsync-miss ratio above which the next session drops a step.
 *
 * At 72Hz a 10% miss ratio is roughly seven dropped frames every second, sustained for the
 * whole session: continuous, unmistakable judder, not an artefact. Below it the misses are
 * sparse enough to be events (a GC pause, an asset decode, a tracking blip) rather than a
 * scene the device cannot afford.
 */
const DRS_SESSION_MISS_HIGH = 0.10;

/**
 * Session vsync-miss ratio below which the next session may climb a step.
 *
 * ~1.4 dropped frames per second at 72Hz. A real headset never reaches a clean zero across
 * a whole session, so demanding zero would make recovery unreachable in exactly the way the
 * old load-ratio recovery gate was; 2% is "the misses that remain are incidental".
 */
const DRS_SESSION_MISS_LOW = 0.02;

/**
 * Scale removed by one downward step.
 *
 * GPU cost follows pixel count, i.e. scale squared, so a 0.1 LINEAR step is a roughly
 * constant ~20% cut in fragment work everywhere in the useful range (1.00 -> 0.81 -> 0.64
 * -> 0.49 -> 0.36 of native pixels). Four such steps span the default 0.6 floor to native,
 * so even a hopelessly heavy scene reaches the floor in four sessions.
 */
const DRS_SESSION_STEP_DOWN = 0.10;

/**
 * Scale returned by one upward step: half the downward step, on purpose.
 *
 * The two errors do not cost the same. Sitting one step lower than necessary costs slightly
 * softer pixels, which nobody takes the headset off over; sitting one step too high costs a
 * whole session of judder, which they do. Climbing at half the rate also damps the
 * two-session ping-pong that equal steps would allow right at a capacity boundary: after a
 * drop the climb lands on the scale BETWEEN the two, which equal steps would skip straight
 * over and back onto the one that just failed.
 *
 * It doubles as the margin under `knownBadScale`: a climb stops one up-step short of the
 * lowest scale ever seen to judder, so the ceiling is always strictly below it.
 */
const DRS_SESSION_STEP_UP = 0.05;

/**
 * Native (unscaled) framebuffer, and the hard ceiling on any climb.
 *
 * The miss ratio cannot justify going past it. A 0% miss ratio on a vsync-locked display
 * says "nothing missed its deadline" - it does not say there is spare GPU, because a device
 * coping by 1% and a device coping by 50% both report exactly the budget. Supersampling on
 * that evidence would be inventing headroom nobody measured.
 */
const DRS_NATIVE_SCALE = 1.0;

/**
 * Seconds of presenting frames a session must contain before its miss ratio is trusted.
 *
 * The decision has to separate 2% from 10%, so the sampling noise has to be small against
 * that 8-point gap. For a ratio near the middle of the band the standard error is
 * sqrt(p(1-p)/n); at 72Hz two seconds is 144 frames, giving ~2%, so each band edge sits
 * about two standard errors from the centre. Shorter sessions - put the headset on, look
 * around, take it off - are left alone entirely rather than judged on noise.
 */
export const DRS_SESSION_MIN_SECONDS = 2;

/** Render scales are quantized to 3 decimals so equality comparisons are exact. */
function roundRenderScale(scale: number): number {
  return Math.round(scale * 1000) / 1000;
}

/**
 * "Nothing has juddered yet", the starting value of the known-bad ceiling.
 *
 * Infinity rather than 1.0 on purpose: it means "no evidence", and it composes - the climb
 * ceiling is min(native, knownBad - step), which reduces to native while no scale has failed.
 */
export const DRS_NO_KNOWN_BAD_SCALE = Number.POSITIVE_INFINITY;

/** The outcome of one session-end DRS decision: the next scale, and the memory behind it. */
export interface SessionRenderScaleDecision {
  /** Framebuffer scale the NEXT session should run at. */
  scale: number;
  /**
   * Lowest render scale observed to judder so far, or DRS_NO_KNOWN_BAD_SCALE if none has.
   * Feed it back into the next call; it is the entire memory of the controller.
   */
  knownBadScale: number;
}

/**
 * Decides the framebuffer scale for the NEXT session from the session that just ended.
 *
 * Called exactly once per session, at the presenting -> not-presenting transition. There is
 * deliberately no per-frame counterpart, because in-session feedback is both impossible and
 * ill-posed here.
 *
 * Impossible: three.js refuses setFramebufferScaleFactor while presenting (WebXRManager
 * warns and discards it), so nothing decided mid-session ever reaches the compositor.
 *
 * Ill-posed: a 72Hz headset quantizes frame time to a hit at 13.888ms or a miss at ~27.78ms.
 * There is no reading in between, so frame time carries no gradient to servo on.
 *
 * THE SIGNAL'S REMAINING BLIND SPOT, and why this function has memory. The miss ratio is
 * continuous over [0, 1], which is what makes the hold band reachable - but near zero it is
 * still blind in one direction: "barely coping" and "enormous headroom" both read as 0%
 * missed. So a memoryless rule that climbs on success climbs until it breaks, drops, climbs
 * again, and cycles ACROSS sessions forever. That is not a threshold to retune; no threshold
 * avoids it. Measured on the memoryless version, one step per session, 40 sessions:
 *
 *   capacity 13.9ms -> 0.9, 0.95, 1.0, 0.9, 0.95, 1.0, ...   period-3, forever
 *   capacity 16ms   -> 0.9, 0.95, 0.85, 0.9, 0.95, ...       forever
 *   capacity 25ms   -> 0.9, 0.8, 0.7, 0.75, 0.65, ...        forever
 *
 * The fix is the congestion-control one: REMEMBER THE SCALE THAT FAILED AND NEVER CLIMB BACK
 * TO IT. `knownBadScale` is the lowest scale ever seen to judder; climbing is capped one
 * up-step below it.
 *
 * Three bands, one step at most:
 *   ratio > 10%   too much of the session juddered  -> one step down, and this scale is now
 *                                                      known bad
 *   2% .. 10%     as good as this device gets       -> hold
 *   ratio < 2%    misses are incidental             -> one step up, never past native and
 *                                                      never up to a known-bad scale
 *
 * WHY IT TERMINATES (the argument a reader should be able to check, not take on trust):
 *   1. `knownBadScale` is non-increasing - its only write is min(knownBadScale, held).
 *   2. It is bounded below by `minScale`, because `held` is clamped to [minScale, native].
 *   3. After the first failure the scale is strictly below `knownBadScale`: the drop lands a
 *      full step-down under it, and every later climb is capped at knownBadScale - stepUp.
 *      So each further failure writes a STRICTLY smaller `knownBadScale` - by at least one
 *      up-step - unless the scale is already pinned at `minScale`, which is a fixed point
 *      (down clamps to minScale, up cannot exceed it).
 *   4. (1)+(2)+(3): only finitely many failures are possible. After the last one the ceiling
 *      never moves again, and the scale can only hold or climb by a fixed step toward a fixed
 *      ceiling, so it reaches it in finitely many sessions and stays there.
 *
 * The reachable set therefore shrinks every time a scale fails and never reopens on its own.
 * That is also why it must be resettable from outside - see clearKnownBadRenderScale: a scene
 * that genuinely got lighter would otherwise never recover its resolution.
 *
 * KNOWN LIMITATION, measured rather than assumed. The miss ratio cannot tell "the render scale
 * is too high" apart from "something transient blew out frames" - a hitching asset load, a GC
 * pause, thermal throttling, a passthrough stall. So judder that has nothing to do with
 * resolution still convicts the current scale and ratchets the ceiling down for good. A scene
 * that costs ~6ms at native (well inside the budget) but spikes on ~15% of its frames will be
 * walked down needlessly. The termination argument above is exactly what makes this
 * irreversible on its own, so the reset paths are the mitigation, not a nicety: a scene change
 * clears the ceiling automatically, and the perf modal exposes a manual clear. Distinguishing
 * the two causes properly needs a real headroom signal - GPU timer queries - not frame timing.
 *
 * Returns `currentScale` unchanged when the session was too short to have measured anything
 * worth acting on.
 */
export function calculateSessionRenderScale(
  currentScale: number,
  sessionMissRatio: number,
  sessionFrameCount: number,
  minSessionFrames: number,
  minScale: number = 0.6,
  knownBadScale: number = DRS_NO_KNOWN_BAD_SCALE,
): SessionRenderScaleDecision {
  const safeCurrent = Number.isFinite(currentScale) ? currentScale : DRS_NATIVE_SCALE;
  const safeMin = Math.max(0.3, Math.min(DRS_NATIVE_SCALE, minScale));
  const held = roundRenderScale(Math.max(safeMin, Math.min(DRS_NATIVE_SCALE, safeCurrent)));
  // NaN and +/-Infinity all mean "no usable evidence of a bad scale".
  const knownBad = Number.isFinite(knownBadScale) ? knownBadScale : DRS_NO_KNOWN_BAD_SCALE;

  const frames = Number.isFinite(sessionFrameCount) ? sessionFrameCount : 0;
  const required = Number.isFinite(minSessionFrames) ? Math.max(1, minSessionFrames) : 1;
  if (frames < required) return { scale: held, knownBadScale: knownBad };
  if (!Number.isFinite(sessionMissRatio)) return { scale: held, knownBadScale: knownBad };

  if (sessionMissRatio > DRS_SESSION_MISS_HIGH) {
    return {
      scale: roundRenderScale(Math.max(safeMin, held - DRS_SESSION_STEP_DOWN)),
      knownBadScale: Math.min(knownBad, held),
    };
  }

  if (sessionMissRatio < DRS_SESSION_MISS_LOW) {
    // One up-step clear of the lowest scale that ever juddered, and never past native.
    const ceiling = Math.min(DRS_NATIVE_SCALE, roundRenderScale(knownBad - DRS_SESSION_STEP_UP));
    const climbed = Math.min(roundRenderScale(held + DRS_SESSION_STEP_UP), ceiling);
    // max(held, ...): the ceiling only forbids climbing, it never drags the scale down.
    return { scale: roundRenderScale(Math.max(held, climbed)), knownBadScale: knownBad };
  }

  // The band between the two thresholds, and anything already parked at native: hold.
  return { scale: held, knownBadScale: knownBad };
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
