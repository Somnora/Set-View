// ---------------------------------------------------------------------------
// SetView Runtime WebXR Performance Governor & Memory Sentinel
// Manages Dynamic Resolution Scaling (DRS), Fixed Foveated Rendering (FFR),
// Gaussian Splat LOD throttling, Volumetric step regulation, and zero-GC pooling.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import {
  calculateAdaptiveLODBudget,
  calculateSessionRenderScale,
  createGovernorConfig,
  DRS_NO_KNOWN_BAD_SCALE,
  DRS_SESSION_MIN_SECONDS,
  estimateGCPressure,
  normalizeGovernorConfig,
  RollingFrameStats,
  SessionFrameLedger,
  VSYNC_MISS_TOLERANCE,
  type FrameMetrics,
  type GovernorConfig,
} from './performanceGovernor.ts';
import type { GaussianSplatRenderer } from './gaussianRenderer.ts';
import type { VolumetricManager } from './volumetrics.ts';

/** Zero-allocation reusable object pool for high-frequency render loops. */
export class StaticObjectPool<T> {
  private readonly items: T[];
  private head = 0;

  constructor(factory: () => T, size: number = 32) {
    this.items = Array.from({ length: Math.max(4, size) }, factory);
  }

  /**
   * Acquires the next pre-allocated object from the ring pool.
   * Eliminates garbage collection pressure in animation and physics updates.
   */
  public acquire(): T {
    const item = this.items[this.head];
    this.head = (this.head + 1) % this.items.length;
    return item;
  }

  /** Returns total pool capacity. */
  public get size(): number {
    return this.items.length;
  }
}

/** Pre-allocated static object pools available application-wide. */
export const MemorySentinel = {
  vec3: new StaticObjectPool<THREE.Vector3>(() => new THREE.Vector3(), 64),
  quat: new StaticObjectPool<THREE.Quaternion>(() => new THREE.Quaternion(), 32),
  mat4: new StaticObjectPool<THREE.Matrix4>(() => new THREE.Matrix4(), 16),
  raycaster: new StaticObjectPool<THREE.Raycaster>(() => new THREE.Raycaster(), 8),
  color: new StaticObjectPool<THREE.Color>(() => new THREE.Color(), 16),
  box3: new StaticObjectPool<THREE.Box3>(() => new THREE.Box3(), 8),
};

/**
 * Foveation ladder, coarse to fine. Index 0 is maximum foveation, which is the
 * resting default the Quest 3 performance budget mandates.
 */
const FOVEATION_LADDER: readonly number[] = [1.0, 0.5, 0.0];

/** Rolling load ratio above which foveation steps back up toward the resting maximum. */
const FOVEATION_RAISE_RATIO = 0.95;

/** Rolling load ratio below which foveation is allowed to relax one step. */
const FOVEATION_LOWER_RATIO = 0.70;

/** Minimum frames that must elapse between two foveation transitions. */
const FOVEATION_MIN_DWELL_FRAMES = 60;

/** Minimum wall-clock milliseconds that must elapse between two foveation transitions. */
const FOVEATION_MIN_DWELL_MS = 1000;

/** Measured frames required before the governor is allowed to act on the rolling window. */
const GOVERNOR_WARMUP_FRAMES = 30;

/** Render scale changes below this are treated as no change at all. */
const RENDER_SCALE_EPSILON = 0.001;

/** Deltas at or below this are unusable as a frame time (duplicate or backwards clock). */
const MIN_USABLE_DELTA_MS = 0.05;

/** Resolves an optional caller-supplied timestamp against the best available clock. */
function resolveTimestampMs(nowMs?: number): number {
  if (typeof nowMs === 'number' && Number.isFinite(nowMs)) return nowMs;
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export class XRPerformanceGovernor {
  private config: GovernorConfig;
  private readonly stats: RollingFrameStats;
  /** Whole-session vsync tally. The sole input to the once-per-session DRS decision. */
  private readonly sessionLedger = new SessionFrameLedger();
  /** Previous frame's session state, so the two session edges can be detected. */
  private inXrSession: boolean = false;

  private frameStartTimestampMs: number = 0;
  /**
   * Timestamp of the previous endFrame(). Frame time is measured end-to-end so it
   * stays correct even when beginFrame()/endFrame() are handed the same
   * animation-frame timestamp, which yields a zero begin->end delta.
   */
  private lastEndTimestampMs: number = Number.NaN;
  private lastFrameTimeMs: number = 0;
  private lastCpuLogicTimeMs: number = 0;
  private measuredFrames: number = 0;
  private droppedFrameCount: number = 0;

  /**
   * Framebuffer scale for the current session. Its value is constant across a session, but
   * not because there is a single writer: concludeSessionRenderScale sets it on the
   * presenting -> not-presenting edge, and endFrame pins it to 1.0 on every frame while
   * dynamic resolution is disabled. The second write is idempotent, so the value still
   * cannot move mid-session either way.
   */
  private currentRenderScale: number = 1.0;
  /** Scale actually pushed into renderer.xr; WebXR rejects changes mid-session. */
  private appliedRenderScale: number = 1.0;
  /**
   * Lowest framebuffer scale this scene has been seen to judder at, or
   * DRS_NO_KNOWN_BAD_SCALE while none has. The whole memory of the DRS decision, and the
   * reason it converges instead of cycling across sessions; see
   * calculateSessionRenderScale. Scene-scoped, not app-scoped - clearKnownBadRenderScale.
   */
  private knownBadRenderScale: number = DRS_NO_KNOWN_BAD_SCALE;

  private foveationIndex: number = 0;
  private currentFoveationLevel: number = FOVEATION_LADDER[0];
  private appliedFoveationLevel: number = FOVEATION_LADDER[0];
  private framesSinceFoveationChange: number = 0;
  private lastFoveationChangeMs: number = Number.NaN;

  private baseSplatBudget: number = 100000;
  private currentSplatBudget: number = 100000;
  private baseVolumetricSteps: number = 32;
  private currentVolumetricSteps: number = 32;
  /** Reused every frame; endFrame() mutates it in place to stay allocation-free. */
  private readonly latestMetrics: FrameMetrics;

  // Static Object Pools reference for easy access
  public static readonly Pools = MemorySentinel;

  constructor(initialConfig?: Partial<GovernorConfig>) {
    this.config = createGovernorConfig(initialConfig);
    this.stats = new RollingFrameStats(this.config.measurementWindowFrames);

    // Zeroed, not seeded with a plausible-looking 72fps: nothing has been measured yet
    // and reporting an invented frame time is the defect this governor is built around.
    this.latestMetrics = {
      frameTimeMs: 0,
      cpuLogicTimeMs: 0,
      fps: 0,
      droppedFrames: 0,
      renderScale: 1.0,
      renderScaleApplied: true,
      foveationLevel: FOVEATION_LADDER[0],
      splatBudget: this.baseSplatBudget,
      volumetricSteps: this.baseVolumetricSteps,
      gcPressure: 'low',
    };
  }

  /**
   * Marks the start of a frame render pass.
   *
   * Deliberately does NOT seed the end-to-end clock. Frame time is an interval between two
   * endFrame() calls, so N frames yield N-1 measurements and the first one is simply not
   * measurable. Seeding it with a nominal budget invented a sample nobody observed, and
   * because endFrame lands later than beginFrame by the frame's CPU span, that invented
   * sample also over-ran the budget and booked a dropped frame that never happened.
   */
  public beginFrame(nowMs?: number): void {
    this.frameStartTimestampMs = resolveTimestampMs(nowMs);
  }

  /**
   * Concludes the frame render pass, computes rolling statistics, and dynamically
   * adjusts DRS, FFR, splat budgets, and volumetric raymarch steps.
   *
   * The returned FrameMetrics object is reused across frames; read the fields immediately
   * or copy them if you need to retain them.
   */
  public endFrame(
    renderer?: THREE.WebGLRenderer,
    splatRenderer?: GaussianSplatRenderer | null,
    volumetricManager?: VolumetricManager | null,
    nowMs?: number,
  ): FrameMetrics {
    const endTimestamp = resolveTimestampMs(nowMs);
    const targetFrameTimeMs = 1000 / this.config.targetFps;

    // CPU/logic span. NOT the frame time: a caller that hands beginFrame and endFrame
    // the same animation-frame timestamp gets an honest 0 here, not a stand-in value.
    const rawCpuMs = endTimestamp - this.frameStartTimestampMs;
    this.lastCpuLogicTimeMs = Number.isFinite(rawCpuMs) && rawCpuMs > 0 ? rawCpuMs : 0;

    // Frame time is measured end-to-end, previous endFrame -> this endFrame, so it
    // remains correct regardless of what beginFrame was given. An unusable delta
    // (no previous frame yet, duplicate call, clock stepped backwards) is skipped, never
    // back-filled with a stand-in constant - fabricated telemetry is worse than a
    // missing sample.
    const rawFrameTimeMs = endTimestamp - this.lastEndTimestampMs;
    const frameMeasured = Number.isFinite(rawFrameTimeMs) && rawFrameTimeMs > MIN_USABLE_DELTA_MS;
    if (frameMeasured) {
      this.stats.addFrame(rawFrameTimeMs);
      this.lastFrameTimeMs = rawFrameTimeMs;
      this.measuredFrames++;
      if (rawFrameTimeMs > targetFrameTimeMs * VSYNC_MISS_TOLERANCE) {
        this.droppedFrameCount++;
      }
    }
    // Re-anchor either way so one bad timestamp cannot poison every later frame.
    this.lastEndTimestampMs = endTimestamp;

    const avgMs = this.stats.getAverageMs();
    const p95Ms = this.stats.getP95Ms();
    const jitterMs = this.stats.getJitterMs();
    const effectiveFps = this.stats.getEffectiveFps();
    const presenting = !!renderer && renderer.xr.isPresenting === true;
    /**
     * Whether these frames belong to an XR session, for DRS accounting. A caller that
     * passes no renderer at all is driving a simulated session headlessly, so its frames
     * count - but it has no renderer to present on and therefore no session edge, so it
     * never reaches a decision, which is the honest outcome.
     */
    const inXrSession = renderer ? presenting : true;
    const warmedUp = this.measuredFrames >= GOVERNOR_WARMUP_FRAMES && avgMs > 0;

    // 1. Dynamic Resolution Scaling (DRS) - session-scoped, never a per-frame loop.
    //
    // While presenting the governor only WATCHES: it tallies vsync misses and changes
    // nothing. The single decision happens on the session-end edge below. See
    // calculateSessionRenderScale for why an in-session loop is both impossible (three.js
    // discards the scale while presenting) and ill-posed (a vsync-locked frame time is
    // quantized to hit-or-miss, so it carries no gradient to servo on).
    if (!this.config.enableDynamicResolution) {
      this.currentRenderScale = 1.0;
    }

    if (inXrSession) {
      if (!this.inXrSession) {
        // not-presenting -> presenting: last session's judder must not be charged to
        // this session's measurement.
        this.sessionLedger.reset();
      }
      if (frameMeasured) {
        this.sessionLedger.record(rawFrameTimeMs, targetFrameTimeMs);
      }
    } else if (this.inXrSession) {
      // presenting -> not-presenting: the one and only render-scale change this session
      // gets. One step at most, so a bad session cannot ratchet. The step DOES feed back,
      // into the next session - that cross-session loop is what knownBadRenderScale bounds.
      this.concludeSessionRenderScale();
    }
    this.inXrSession = inXrSession;

    // three.js refuses setFramebufferScaleFactor while a session is presenting: it
    // warns and discards the value (WebXRManager.js). Calling it every frame in-session
    // therefore achieved nothing except ~72 console warnings per second. Push the scale
    // only when it can actually take effect, and only when it really changed - which,
    // now that the scale only moves at session end, is at most once per session.
    if (renderer && !presenting && !this.isRenderScaleApplied()) {
      const xrRenderer = renderer.xr as unknown as { setFramebufferScaleFactor?: (scale: number) => void };
      if (typeof xrRenderer.setFramebufferScaleFactor === 'function') {
        try {
          xrRenderer.setFramebufferScaleFactor(this.currentRenderScale);
          this.appliedRenderScale = this.currentRenderScale;
        } catch {
          // Ignore unsupported hardware scale adjustments; stays reported as not applied.
        }
      }
    }

    // 2. Fixed Foveated Rendering (FFR)
    if (this.config.enableFoveatedRendering) {
      if (presenting && warmedUp) {
        this.evaluateFoveation(avgMs, targetFrameTimeMs, endTimestamp);
      }
    } else {
      this.foveationIndex = 0;
      this.currentFoveationLevel = FOVEATION_LADDER[0];
    }
    this.framesSinceFoveationChange++;

    // Only ever pushed on an actual level change, so a stable level is silent.
    if (renderer && presenting && this.currentFoveationLevel !== this.appliedFoveationLevel) {
      const xrRenderer = renderer.xr as unknown as { setFoveation?: (level: number) => void };
      this.appliedFoveationLevel = this.currentFoveationLevel;
      if (typeof xrRenderer.setFoveation === 'function') {
        try {
          xrRenderer.setFoveation(this.currentFoveationLevel);
        } catch {
          // Handled gracefully if headset does not support foveation
        }
      }
    }

    // 3. Gaussian Splat Budget LOD Throttling
    if (this.config.enableLODThrottling && splatRenderer) {
      this.currentSplatBudget = calculateAdaptiveLODBudget(
        this.baseSplatBudget,
        avgMs,
        targetFrameTimeMs,
        5000,
        350000,
      );
      splatRenderer.setSplatBudget(this.currentSplatBudget);
    }

    // 4. Volumetric Step Count Throttling
    if (this.config.enableLODThrottling && volumetricManager) {
      const loadRatio = avgMs / targetFrameTimeMs;
      if (loadRatio > 1.1) {
        this.currentVolumetricSteps = Math.max(12, Math.floor(this.baseVolumetricSteps * 0.6));
      } else if (loadRatio < 0.85) {
        this.currentVolumetricSteps = this.baseVolumetricSteps;
      }
    }

    // 5. Memory and GC Pressure Assessment
    const gcPressure = estimateGCPressure(jitterMs, p95Ms, avgMs);

    // Mutated in place rather than rebuilt: endFrame runs 72 times a second on a Quest 3.
    // The per-frame path constructs no object, array or typed-array view - the rolling stats
    // select over their own pre-allocated scratch buffer. The one exception is deliberate and
    // is not on this path: calculateSessionRenderScale returns a small decision object, and it
    // runs once per session on the session-end edge, not per frame.
    const metrics = this.latestMetrics;
    metrics.frameTimeMs = Math.round(this.lastFrameTimeMs * 100) / 100;
    metrics.cpuLogicTimeMs = Math.round(this.lastCpuLogicTimeMs * 100) / 100;
    metrics.fps = Math.round(effectiveFps * 10) / 10;
    metrics.droppedFrames = this.droppedFrameCount;
    metrics.renderScale = this.currentRenderScale;
    metrics.renderScaleApplied = this.isRenderScaleApplied();
    metrics.foveationLevel = this.currentFoveationLevel;
    metrics.splatBudget = this.currentSplatBudget;
    metrics.volumetricSteps = this.currentVolumetricSteps;
    metrics.gcPressure = gcPressure;

    return metrics;
  }

  /**
   * Settles the framebuffer scale for the NEXT session, once, on the session-end edge.
   *
   * Deliberately has no dwell, no window and no notion of "recently changed": it cannot be
   * reached twice within a session, so there is nothing to debounce.
   *
   * What the session scoping alone buys, and what it does NOT. It does make a single hitch
   * unable to ratchet the scale down: a hitch is one frame in a session's worth of them and
   * moves the miss ratio by ~0. It does NOT prevent a limit cycle - the scale chosen here IS
   * fed back, into the very next session, and a memoryless rule that climbs whenever a
   * session came out clean will climb until it breaks, drop, and climb again, cycling across
   * sessions forever. That is what `knownBadRenderScale` is for: it records the lowest scale
   * this scene has juddered at and caps every later climb strictly below it, so the reachable
   * set shrinks on each failure and cannot reopen. calculateSessionRenderScale carries the
   * full termination argument.
   */
  private concludeSessionRenderScale(): void {
    if (!this.config.enableDynamicResolution) return;

    // Two seconds of frames, in this session's own units: a 90Hz or 120Hz headset needs
    // proportionally more frames to buy the same confidence in the ratio.
    const minSessionFrames = Math.ceil(this.config.targetFps * DRS_SESSION_MIN_SECONDS);

    const decision = calculateSessionRenderScale(
      this.currentRenderScale,
      this.sessionLedger.getMissRatio(),
      this.sessionLedger.getFrameCount(),
      minSessionFrames,
      this.config.minRenderScale,
      this.knownBadRenderScale,
    );
    this.currentRenderScale = decision.scale;
    this.knownBadRenderScale = decision.knownBadScale;
  }

  /** True when the wanted render scale is the one the renderer is actually running. */
  private isRenderScaleApplied(): boolean {
    return Math.abs(this.currentRenderScale - this.appliedRenderScale) <= RENDER_SCALE_EPSILON;
  }

  /**
   * Steps the foveation ladder at most one notch, guarded by asymmetric raise/lower
   * thresholds plus a frame-count and wall-clock dwell. Foveation feeds back into the
   * very frame times that drive it, so without this it is a limit-cycle oscillator that
   * visibly pulses peripheral blur in the headset.
   */
  private evaluateFoveation(avgMs: number, targetFrameTimeMs: number, nowMs: number): void {
    if (this.framesSinceFoveationChange < FOVEATION_MIN_DWELL_FRAMES) return;
    if (Number.isFinite(this.lastFoveationChangeMs)
      && (nowMs - this.lastFoveationChangeMs) < FOVEATION_MIN_DWELL_MS) {
      return;
    }

    const loadRatio = avgMs / targetFrameTimeMs;
    let nextIndex = this.foveationIndex;
    if (loadRatio > FOVEATION_RAISE_RATIO) {
      // Under pressure: step back toward the mandated resting maximum (index 0).
      nextIndex = Math.max(0, this.foveationIndex - 1);
    } else if (loadRatio < FOVEATION_LOWER_RATIO) {
      // Sustained headroom: relax one notch. The gap between the two thresholds is
      // the hysteresis band.
      nextIndex = Math.min(FOVEATION_LADDER.length - 1, this.foveationIndex + 1);
    }

    if (nextIndex === this.foveationIndex) return;

    this.foveationIndex = nextIndex;
    this.currentFoveationLevel = FOVEATION_LADDER[nextIndex];
    this.framesSinceFoveationChange = 0;
    this.lastFoveationChangeMs = nowMs;
  }

  /** Returns latest computed frame metrics snapshot. */
  public getMetrics(): FrameMetrics {
    return this.latestMetrics;
  }

  /** Returns internal rolling frame statistics. */
  public getStats(): RollingFrameStats {
    return this.stats;
  }

  /** Returns active governor configuration. */
  public getConfig(): Readonly<GovernorConfig> {
    return this.config;
  }

  /** Updates governor configuration parameters. */
  public updateConfig(patch: Partial<GovernorConfig>): void {
    this.config = normalizeGovernorConfig({
      ...this.config,
      ...patch,
    });
  }

  /** Sets base target splat budget before adaptive scaling. */
  public setBaseSplatBudget(budget: number): void {
    this.baseSplatBudget = Math.max(1000, Math.min(500000, Math.floor(budget)));
  }

  /** Sets base volumetric steps before adaptive scaling. */
  public setBaseVolumetricSteps(steps: number): void {
    this.baseVolumetricSteps = Math.max(8, Math.min(128, Math.floor(steps)));
  }

  /** Number of frames whose duration was actually measured since the last reset. */
  public getMeasuredFrameCount(): number {
    return this.measuredFrames;
  }

  /**
   * Fraction of the current session's frames that missed vsync, in [0, 1]. This is the
   * signal DRS decides on at session end; after a session it reads as that session's score.
   */
  public getSessionMissRatio(): number {
    return this.sessionLedger.getMissRatio();
  }

  /** Frames measured in the current session, i.e. how much evidence the ratio rests on. */
  public getSessionFrameCount(): number {
    return this.sessionLedger.getFrameCount();
  }

  /**
   * Lowest render scale this scene has been seen to judder at, or DRS_NO_KNOWN_BAD_SCALE
   * (+Infinity) while none has. DRS will never climb back up to it.
   */
  public getKnownBadRenderScale(): number {
    return this.knownBadRenderScale;
  }

  /**
   * Forgets which scales juddered, so DRS may climb back toward native again.
   *
   * Required, not optional. The ceiling only ever descends, so without a way to clear it a
   * scene that legitimately got lighter - actors deleted, a heavy splat cloud unloaded, a
   * different scene loaded entirely - would be stuck at the resolution the heavy version
   * earned, forever. Call it when the content changes; the settings modal also exposes it.
   *
   * Leaves the current scale alone: this restores the ABILITY to climb, it does not jump.
   * The next clean session takes the first step, so a mistaken clear costs one session of
   * judder at most rather than an immediate snap back to native.
   */
  public clearKnownBadRenderScale(): void {
    this.knownBadRenderScale = DRS_NO_KNOWN_BAD_SCALE;
  }

  /** Resets stats and metrics. */
  public reset(): void {
    this.stats.reset();
    this.frameStartTimestampMs = 0;
    this.lastEndTimestampMs = Number.NaN;
    this.lastFrameTimeMs = 0;
    this.lastCpuLogicTimeMs = 0;
    this.measuredFrames = 0;
    this.droppedFrameCount = 0;

    this.currentRenderScale = 1.0;
    // NaN forces the next off-session frame to re-push the scale, since we can no
    // longer claim to know what the renderer is running.
    this.appliedRenderScale = Number.NaN;
    // A full reset discards the evidence too, otherwise the scale would sit back at native
    // while a stale ceiling silently forbade it from ever being re-earned.
    this.knownBadRenderScale = DRS_NO_KNOWN_BAD_SCALE;
    this.sessionLedger.reset();
    this.inXrSession = false;

    this.foveationIndex = 0;
    this.currentFoveationLevel = FOVEATION_LADDER[0];
    this.appliedFoveationLevel = Number.NaN;
    this.framesSinceFoveationChange = 0;
    this.lastFoveationChangeMs = Number.NaN;

    this.latestMetrics.frameTimeMs = 0;
    this.latestMetrics.cpuLogicTimeMs = 0;
    this.latestMetrics.fps = 0;
    this.latestMetrics.droppedFrames = 0;
    this.latestMetrics.renderScale = 1.0;
    this.latestMetrics.renderScaleApplied = false;
    this.latestMetrics.foveationLevel = FOVEATION_LADDER[0];
    this.latestMetrics.gcPressure = 'low';
  }
}
