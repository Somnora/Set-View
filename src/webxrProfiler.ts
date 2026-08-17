// ---------------------------------------------------------------------------
// SetView WebXR In-Engine Profiler Runtime & Diagnostic HUD
// Real-time telemetry ingestion, Three.js draw call auditing,
// Quest 3 standalone budget verification, and automated 6DoF test harness.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import {
  calculateBenchmarkSummary,
  createDefaultVRThresholds,
  createMockXRSessionState,
  createSyntheticVRScenario,
  createVRProfilerConfig,
  generatePerformanceReportCsv,
  generatePerformanceReportHtml,
  interpolateSyntheticScenarioFrame,
  normalizeVRProfilerConfig,
  type FrameTelemetrySample,
  type MockXRSessionState,
  type SyntheticVRScenario,
  type VRBenchmarkReport,
  type VRProfilerConfig,
} from './webxrProfilerEngine.ts';

export class WebXRProfilerRuntime {
  private config: VRProfilerConfig;
  private readonly telemetryHistory: FrameTelemetrySample[] = [];
  private readonly maxHistoryCapacity: number = 720; // 10 seconds rolling window at 72fps

  private frameIndex: number = 0;
  private frameStartTimestampMs: number = 0;
  private lastEndTimestampMs: number = 0;
  private lastHeapBytes: number = 0;
  private latestSample: FrameTelemetrySample | null = null;

  // Automated Test Harness State
  private isBenchmarking: boolean = false;
  private benchmarkScenario: SyntheticVRScenario | null = null;
  private benchmarkTimeElapsedSec: number = 0;
  private benchmarkSamples: FrameTelemetrySample[] = [];
  private benchmarkResolve: ((report: VRBenchmarkReport) => void) | null = null;

  // Current Mock XR 6DoF Pose
  private mockSessionState: MockXRSessionState = createMockXRSessionState();

  // Diagnostic HUD DOM Overlay
  private hudRoot: HTMLElement | null = null;
  private hudFpsSpan: HTMLElement | null = null;
  private hudFrameTimeSpan: HTMLElement | null = null;
  private hudCallsSpan: HTMLElement | null = null;
  private hudTrianglesSpan: HTMLElement | null = null;
  private hudBudgetStatusSpan: HTMLElement | null = null;

  constructor(initialConfig?: Partial<VRProfilerConfig>) {
    this.config = createVRProfilerConfig(72, initialConfig);
  }

  public getConfig(): Readonly<VRProfilerConfig> {
    return this.config;
  }

  public updateConfig(patch: Partial<VRProfilerConfig>): void {
    this.config = normalizeVRProfilerConfig({
      ...this.config,
      ...patch,
    });
    if (this.config.showDiagnosticHud && !this.hudRoot) {
      this.mountDiagnosticHud();
    } else if (!this.config.showDiagnosticHud && this.hudRoot) {
      this.unmountDiagnosticHud();
    }
  }

  public setTargetFps(targetFps: 72 | 90 | 120): void {
    this.config.targetFps = targetFps;
    this.config.thresholds = createDefaultVRThresholds(targetFps);
  }

  /**
   * Marks the start of a frame logic and render pass.
   */
  public beginFrame(nowMs?: number): void {
    const ts = typeof nowMs === 'number' && Number.isFinite(nowMs)
      ? nowMs
      : (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.frameStartTimestampMs = ts;
    if (this.lastEndTimestampMs === 0) {
      this.lastEndTimestampMs = ts - (1000 / this.config.targetFps);
    }
  }

  /**
   * Concludes the frame, measures GPU/CPU duration and Three.js renderer stats,
   * evaluates Quest 3 thresholds, updates the rolling history, and steps the automated test harness.
   */
  public endFrame(
    renderer?: THREE.WebGLRenderer,
    nowMs?: number,
  ): FrameTelemetrySample {
    const endTimestamp = typeof nowMs === 'number' && Number.isFinite(nowMs)
      ? nowMs
      : (typeof performance !== 'undefined' ? performance.now() : Date.now());

    const cpuLogicTimeMs = Math.max(0.01, endTimestamp - this.frameStartTimestampMs);
    const rawFrameTimeMs = endTimestamp - this.lastEndTimestampMs;
    const frameTimeMs = Number.isFinite(rawFrameTimeMs) && rawFrameTimeMs > 0.05
      ? rawFrameTimeMs
      : (1000 / this.config.targetFps);
    this.lastEndTimestampMs = endTimestamp;

    this.frameIndex++;

    // Collect Three.js renderer info
    let drawCallCount = 0;
    let triangleCount = 0;
    let shaderProgramSwitches = 0;
    let geometryMemoryBytes = 0;
    let textureMemoryBytes = 0;

    if (renderer && renderer.info) {
      drawCallCount = renderer.info.render.calls || 0;
      triangleCount = renderer.info.render.triangles || 0;
      geometryMemoryBytes = (renderer.info.memory.geometries || 0) * 1024;
      textureMemoryBytes = (renderer.info.memory.textures || 0) * 1024 * 512;
      shaderProgramSwitches = renderer.info.programs?.length || 0;
    }

    // Heap allocation tracking
    let currentHeapBytes = 0;
    let heapDeltaBytes = 0;
    const perfObj = typeof performance !== 'undefined' ? (performance as unknown as { memory?: { usedJSHeapSize?: number } }) : null;
    if (perfObj?.memory?.usedJSHeapSize) {
      currentHeapBytes = perfObj.memory.usedJSHeapSize;
      if (this.lastHeapBytes > 0 && currentHeapBytes > this.lastHeapBytes) {
        heapDeltaBytes = currentHeapBytes - this.lastHeapBytes;
      }
      this.lastHeapBytes = currentHeapBytes;
    }

    // Detect garbage collection spike
    const targetBudgetMs = 1000 / this.config.targetFps;
    const gcEventDetected = frameTimeMs > targetBudgetMs * 1.8;
    const instantFps = frameTimeMs > 0.001 ? Math.min(240, 1000 / frameTimeMs) : this.config.targetFps;
    const gpuRenderTimeMs = Math.max(0.01, frameTimeMs - cpuLogicTimeMs);

    const sample: FrameTelemetrySample = {
      frameIndex: this.frameIndex,
      timestampMs: endTimestamp,
      frameTimeMs: Math.round(frameTimeMs * 1000) / 1000,
      cpuLogicTimeMs: Math.round(cpuLogicTimeMs * 1000) / 1000,
      gpuRenderTimeMs: Math.round(gpuRenderTimeMs * 1000) / 1000,
      drawCallCount,
      triangleCount,
      shaderProgramSwitches,
      textureMemoryBytes,
      geometryMemoryBytes,
      heapAllocatedBytes: heapDeltaBytes,
      gcEventDetected,
      instantFps: Math.round(instantFps * 10) / 10,
    };

    this.latestSample = sample;

    // Rolling history
    if (this.telemetryHistory.length >= this.maxHistoryCapacity) {
      this.telemetryHistory.shift();
    }
    this.telemetryHistory.push(sample);

    // Step automated test harness if running
    if (this.isBenchmarking && this.benchmarkScenario) {
      this.benchmarkSamples.push(sample);
      const deltaSec = frameTimeMs / 1000;
      this.benchmarkTimeElapsedSec += deltaSec;

      this.mockSessionState = interpolateSyntheticScenarioFrame(
        this.benchmarkScenario,
        this.benchmarkTimeElapsedSec,
      );

      if (this.benchmarkTimeElapsedSec >= this.benchmarkScenario.durationSec) {
        this.concludeBenchmark();
      }
    }

    // Update HUD if active
    if (this.config.showDiagnosticHud) {
      this.updateDiagnosticHud(sample);
    }

    return sample;
  }

  /**
   * Initiates an automated synthetic VR benchmark test scenario.
   */
  public startBenchmark(scenarioId = 'walkthrough_soundstage'): Promise<VRBenchmarkReport> {
    this.isBenchmarking = true;
    this.benchmarkScenario = createSyntheticVRScenario(scenarioId);
    this.benchmarkTimeElapsedSec = 0;
    this.benchmarkSamples = [];

    return new Promise<VRBenchmarkReport>((resolve) => {
      this.benchmarkResolve = resolve;
    });
  }

  /**
   * Forces early conclusion of the active benchmark test run.
   */
  public stopBenchmark(): VRBenchmarkReport {
    return this.concludeBenchmark();
  }

  private concludeBenchmark(): VRBenchmarkReport {
    this.isBenchmarking = false;
    const report = calculateBenchmarkSummary(this.benchmarkSamples, this.config.thresholds);

    if (this.benchmarkResolve) {
      const resolver = this.benchmarkResolve;
      this.benchmarkResolve = null;
      resolver(report);
    }

    this.benchmarkScenario = null;
    return report;
  }

  public isBenchmarkActive(): boolean {
    return this.isBenchmarking;
  }

  public getBenchmarkProgress(): {
    elapsedSec: number;
    totalSec: number;
    progress01: number;
    sampleCount: number;
  } {
    const total = this.benchmarkScenario ? this.benchmarkScenario.durationSec : 1.0;
    const elapsed = this.benchmarkTimeElapsedSec;
    return {
      elapsedSec: Math.min(total, elapsed),
      totalSec: total,
      progress01: Math.max(0, Math.min(1, elapsed / total)),
      sampleCount: this.benchmarkSamples.length,
    };
  }

  public getMockSessionState(): MockXRSessionState {
    return this.mockSessionState;
  }

  public getLatestSample(): FrameTelemetrySample | null {
    return this.latestSample;
  }

  public getTelemetryHistory(): FrameTelemetrySample[] {
    return this.telemetryHistory;
  }

  public exportCurrentCsv(): string {
    const samples = this.benchmarkSamples.length > 0 ? this.benchmarkSamples : this.telemetryHistory;
    return generatePerformanceReportCsv(samples);
  }

  public exportCurrentHtml(sceneName = 'Production Scene'): string {
    const samples = this.benchmarkSamples.length > 0 ? this.benchmarkSamples : this.telemetryHistory;
    const report = calculateBenchmarkSummary(samples, this.config.thresholds);
    return generatePerformanceReportHtml(report, samples, sceneName);
  }

  // -------------------------------------------------------------------------
  // Minimalist Spatial / DOM Diagnostic HUD Overlay
  // -------------------------------------------------------------------------

  public mountDiagnosticHud(parent: HTMLElement = document.body): HTMLElement {
    if (this.hudRoot && this.hudRoot.parentNode) {
      this.hudRoot.parentNode.removeChild(this.hudRoot);
    }

    const hud = document.createElement('div');
    hud.className = 'setview-profiler-hud';
    hud.innerHTML = `
      <div class="hud-header">
        <span class="hud-title">⚡ QUEST 3 PROFILER</span>
        <span class="hud-target">${this.config.targetFps} FPS</span>
      </div>
      <div class="hud-row">
        <span>FPS:</span>
        <strong id="hud-fps">0.0</strong>
      </div>
      <div class="hud-row">
        <span>Latency:</span>
        <strong id="hud-time">0.00 ms</strong>
      </div>
      <div class="hud-row">
        <span>Draw Calls:</span>
        <strong id="hud-calls">0</strong>
      </div>
      <div class="hud-row">
        <span>Triangles:</span>
        <strong id="hud-triangles">0</strong>
      </div>
      <div class="hud-badge" id="hud-status">CHECKING</div>
    `;

    parent.appendChild(hud);
    this.hudRoot = hud;
    this.hudFpsSpan = hud.querySelector('#hud-fps');
    this.hudFrameTimeSpan = hud.querySelector('#hud-time');
    this.hudCallsSpan = hud.querySelector('#hud-calls');
    this.hudTrianglesSpan = hud.querySelector('#hud-triangles');
    this.hudBudgetStatusSpan = hud.querySelector('#hud-status');

    return hud;
  }

  public unmountDiagnosticHud(): void {
    if (this.hudRoot && this.hudRoot.parentNode) {
      this.hudRoot.parentNode.removeChild(this.hudRoot);
    }
    this.hudRoot = null;
    this.hudFpsSpan = null;
    this.hudFrameTimeSpan = null;
    this.hudCallsSpan = null;
    this.hudTrianglesSpan = null;
    this.hudBudgetStatusSpan = null;
  }

  public updateDiagnosticHud(sample?: FrameTelemetrySample): void {
    const s = sample || this.latestSample;
    if (!s || !this.hudRoot) return;

    if (this.hudFpsSpan) {
      this.hudFpsSpan.textContent = s.instantFps.toFixed(1);
      this.hudFpsSpan.style.color = s.instantFps >= this.config.targetFps * 0.95 ? '#10b981' : '#f59e0b';
    }

    if (this.hudFrameTimeSpan) {
      this.hudFrameTimeSpan.textContent = `${s.frameTimeMs.toFixed(2)} ms`;
      this.hudFrameTimeSpan.style.color = s.frameTimeMs <= (1000 / this.config.targetFps) ? '#10b981' : '#ef4444';
    }

    if (this.hudCallsSpan) {
      this.hudCallsSpan.textContent = String(s.drawCallCount);
      this.hudCallsSpan.style.color = s.drawCallCount <= this.config.thresholds.maxDrawCallsPerFrame ? '#38bdf8' : '#ef4444';
    }

    if (this.hudTrianglesSpan) {
      this.hudTrianglesSpan.textContent = s.triangleCount > 1000 ? `${(s.triangleCount / 1000).toFixed(0)}k` : String(s.triangleCount);
    }

    if (this.hudBudgetStatusSpan) {
      const budgetMs = 1000 / this.config.targetFps;
      const pass = s.frameTimeMs <= budgetMs && s.drawCallCount <= this.config.thresholds.maxDrawCallsPerFrame;
      this.hudBudgetStatusSpan.textContent = pass ? 'BUDGET: PASS' : 'BUDGET: OVERLOAD';
      this.hudBudgetStatusSpan.className = `hud-badge ${pass ? 'badge-pass' : 'badge-fail'}`;
    }
  }
}
