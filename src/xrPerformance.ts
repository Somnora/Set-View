// ---------------------------------------------------------------------------
// SetView Runtime WebXR Performance Governor & Memory Sentinel
// Manages Dynamic Resolution Scaling (DRS), Fixed Foveated Rendering (FFR),
// Gaussian Splat LOD throttling, Volumetric step regulation, and zero-GC pooling.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import {
  calculateAdaptiveLODBudget,
  calculateAdaptiveRenderScale,
  createGovernorConfig,
  estimateGCPressure,
  normalizeGovernorConfig,
  RollingFrameStats,
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

export class XRPerformanceGovernor {
  private config: GovernorConfig;
  private readonly stats: RollingFrameStats;

  private frameStartTimestampMs: number = 0;
  private currentRenderScale: number = 1.0;
  private currentFoveationLevel: number = 1.0;
  private baseSplatBudget: number = 100000;
  private currentSplatBudget: number = 100000;
  private baseVolumetricSteps: number = 32;
  private currentVolumetricSteps: number = 32;
  private latestMetrics: FrameMetrics;

  // Static Object Pools reference for easy access
  public static readonly Pools = MemorySentinel;

  constructor(initialConfig?: Partial<GovernorConfig>) {
    this.config = createGovernorConfig(initialConfig);
    this.stats = new RollingFrameStats(this.config.measurementWindowFrames);

    this.latestMetrics = {
      frameTimeMs: 13.88,
      fps: 72,
      droppedFrames: 0,
      renderScale: 1.0,
      foveationLevel: 1.0,
      splatBudget: this.baseSplatBudget,
      volumetricSteps: this.baseVolumetricSteps,
      gcPressure: 'low',
    };
  }

  /**
   * Marks the start of a frame render pass.
   */
  public beginFrame(nowMs?: number): void {
    this.frameStartTimestampMs = typeof nowMs === 'number' && Number.isFinite(nowMs)
      ? nowMs
      : (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }

  /**
   * Concludes the frame render pass, computes rolling statistics, and dynamically
   * adjusts DRS, FFR, splat budgets, and volumetric raymarch steps.
   */
  public endFrame(
    renderer?: THREE.WebGLRenderer,
    splatRenderer?: GaussianSplatRenderer | null,
    volumetricManager?: VolumetricManager | null,
    nowMs?: number,
  ): FrameMetrics {
    const endTimestamp = typeof nowMs === 'number' && Number.isFinite(nowMs)
      ? nowMs
      : (typeof performance !== 'undefined' ? performance.now() : Date.now());

    const rawDeltaMs = endTimestamp - this.frameStartTimestampMs;
    const frameTimeMs = Number.isFinite(rawDeltaMs) && rawDeltaMs > 0.05 ? rawDeltaMs : 13.88;

    this.stats.addFrame(frameTimeMs);

    const targetFrameTimeMs = 1000 / this.config.targetFps;
    const avgMs = this.stats.getAverageMs();
    const p95Ms = this.stats.getP95Ms();
    const jitterMs = this.stats.getJitterMs();
    const effectiveFps = this.stats.getEffectiveFps();

    // 1. Dynamic Resolution Scaling (DRS)
    if (this.config.enableDynamicResolution) {
      this.currentRenderScale = calculateAdaptiveRenderScale(
        this.currentRenderScale,
        avgMs,
        targetFrameTimeMs,
        this.config.minRenderScale,
        this.config.maxRenderScale,
      );

      if (renderer) {
        if (renderer.xr.isPresenting) {
          // In WebXR mode, set framebuffer scale factor if supported
          const xrRenderer = renderer.xr as unknown as { setFramebufferScaleFactor?: (scale: number) => void };
          if (typeof xrRenderer.setFramebufferScaleFactor === 'function') {
            try {
              xrRenderer.setFramebufferScaleFactor(this.currentRenderScale);
            } catch {
              // Ignore unsupported hardware scale adjustments
            }
          }
        }
      }
    } else {
      this.currentRenderScale = 1.0;
    }

    // 2. Fixed Foveated Rendering (FFR)
    if (this.config.enableFoveatedRendering && renderer && renderer.xr.isPresenting) {
      const loadRatio = avgMs / targetFrameTimeMs;
      if (loadRatio > 1.05) {
        // High load: maximum foveation (sharp center, blurred peripheral)
        this.currentFoveationLevel = 1.0;
      } else if (loadRatio > 0.85) {
        // Medium load
        this.currentFoveationLevel = 0.5;
      } else {
        // Low load: minimal foveation
        this.currentFoveationLevel = 0.0;
      }

      const xrRenderer = renderer.xr as unknown as { setFoveation?: (level: number) => void };
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

    this.latestMetrics = {
      frameTimeMs: Math.round(frameTimeMs * 100) / 100,
      fps: Math.round(effectiveFps * 10) / 10,
      droppedFrames: this.stats.getDroppedFrames(),
      renderScale: this.currentRenderScale,
      foveationLevel: this.currentFoveationLevel,
      splatBudget: this.currentSplatBudget,
      volumetricSteps: this.currentVolumetricSteps,
      gcPressure,
    };

    return this.latestMetrics;
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

  /** Resets stats and metrics. */
  public reset(): void {
    this.stats.reset();
    this.currentRenderScale = 1.0;
    this.currentFoveationLevel = 1.0;
  }
}
