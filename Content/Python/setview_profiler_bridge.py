# -*- coding: utf-8 -*-
"""
SetView WebXR 6DoF & Standalone VR Hardware Profiler Bridge for Unreal Engine 5
-------------------------------------------------------------------------------
Automates VR performance profiling, console stats capturing, fixed foveated
rendering configuration, and hardware budget audits inside Unreal Engine 5.

Features:
  - Automates UE5 VR runtime profiling commands (stat fps, stat unit, stat rhi, stat memory).
  - Standalone telemetry evaluator: computes P95/P99 frame time percentiles,
    dropped frames ratio, draw call budgets, and heap allocation health.
  - Provides Meta Quest 3 standalone budget preset verification.
  - Dual-mode execution: runs inside UE5 Python environment or standalone via CLI.

Usage in Unreal Engine 5 (Output Log -> Python console):
    import Content.Python.setview_profiler_bridge as profiler_bridge
    profiler_bridge.enable_vr_profiling()
    profiler_bridge.audit_scene_budgets(target_fps=72)

Usage via Command Line / Standalone Mode:
    python3 Content/Python/setview_profiler_bridge.py [--verify] [--samples sample_data.json]
"""

import os
import sys
import math
import json
import argparse
from typing import Dict, Any, List, Optional, Tuple

try:
    import unreal  # type: ignore
    IN_UNREAL = True
except ImportError:
    unreal = None
    IN_UNREAL = False


# Meta Quest 3 Hardware Budget Defaults
DEFAULT_VR_BUDGETS = {
    72: {
        "max_frame_time_ms": 13.88,
        "max_p95_frame_time_ms": 13.50,
        "max_draw_calls": 150,
        "max_triangles": 750000,
        "max_dropped_ratio": 0.01,
    },
    90: {
        "max_frame_time_ms": 11.11,
        "max_p95_frame_time_ms": 10.80,
        "max_draw_calls": 125,
        "max_triangles": 600000,
        "max_dropped_ratio": 0.01,
    },
    120: {
        "max_frame_time_ms": 8.33,
        "max_p95_frame_time_ms": 8.10,
        "max_draw_calls": 100,
        "max_triangles": 450000,
        "max_dropped_ratio": 0.01,
    },
}


def calculate_percentile(sorted_values: List[float], percentile: float) -> float:
    """Computes nearest-rank percentile for a sorted list of numeric values."""
    if not sorted_values:
        return 0.0
    idx = int(math.ceil((percentile / 100.0) * len(sorted_values))) - 1
    clamped_idx = max(0, min(idx, len(sorted_values) - 1))
    return sorted_values[clamped_idx]


def evaluate_frame_telemetry(
    samples: List[Dict[str, Any]],
    target_fps: int = 72,
    custom_thresholds: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Analyzes a sequence of VR frame telemetry samples against standalone budgets."""
    if not samples:
        return {
            "total_frames": 0,
            "target_fps": target_fps,
            "passed": False,
            "failure_reasons": ["Telemetry sample buffer is empty."],
            "recommendations": ["Ensure VR profiling session is active and recording."],
        }

    thresholds = DEFAULT_VR_BUDGETS.get(target_fps, DEFAULT_VR_BUDGETS[72])
    if custom_thresholds:
        thresholds.update(custom_thresholds)

    frame_time_budget = 1000.0 / float(target_fps)
    frame_times = [float(s.get("frameTimeMs", s.get("frame_time_ms", 0.0))) for s in samples]
    draw_calls = [int(s.get("drawCallCount", s.get("draw_calls", 0))) for s in samples]
    triangles = [int(s.get("triangleCount", s.get("triangles", 0))) for s in samples]
    gc_events = [s for s in samples if s.get("gcEventDetected", False) or s.get("heapAllocatedBytes", 0) > 1024 * 1024]

    sorted_times = sorted(frame_times)
    total_time = sum(frame_times)
    avg_frame_time = total_time / len(frame_times) if frame_times else 0.0
    avg_fps = (1000.0 / avg_frame_time) if avg_frame_time > 0.0 else 0.0

    p95 = calculate_percentile(sorted_times, 95.0)
    p99 = calculate_percentile(sorted_times, 99.0)
    max_frame_time = sorted_times[-1] if sorted_times else 0.0

    dropped_frames = sum(1 for ft in frame_times if ft > frame_time_budget * 1.05)
    dropped_ratio = dropped_frames / len(frame_times) if frame_times else 0.0

    max_dc = max(draw_calls) if draw_calls else 0
    avg_dc = sum(draw_calls) / len(draw_calls) if draw_calls else 0.0

    max_tri = max(triangles) if triangles else 0
    avg_tri = sum(triangles) / len(triangles) if triangles else 0.0

    failure_reasons = []
    recommendations = []

    if p95 > thresholds["max_p95_frame_time_ms"]:
        failure_reasons.append(
            f"P95 frame time ({p95:.2f}ms) exceeded threshold ({thresholds['max_p95_frame_time_ms']:.2f}ms)."
        )
        recommendations.append("Reduce shadow cascade count or enable Fixed Foveated Rendering level 2.")

    if dropped_ratio > thresholds["max_dropped_ratio"]:
        failure_reasons.append(
            f"Dropped frame ratio ({dropped_ratio * 100.0:.2f}%) exceeded limit ({thresholds['max_dropped_ratio'] * 100.0:.2f}%)."
        )
        recommendations.append("Investigate GPU shader complexity and optimize draw call batching.")

    if max_dc > thresholds["max_draw_calls"]:
        failure_reasons.append(
            f"Peak draw calls ({max_dc}) exceeded Quest 3 budget ({thresholds['max_draw_calls']})."
        )
        recommendations.append("Merge static meshes and use Instanced Static Mesh components.")

    if max_tri > thresholds["max_triangles"]:
        failure_reasons.append(
            f"Peak triangle count ({max_tri:,}) exceeded budget ({thresholds['max_triangles']:,})."
        )
        recommendations.append("Generate aggressive LODs for background props and character rigs.")

    if len(gc_events) > 0:
        failure_reasons.append(
            f"Detected {len(gc_events)} GC stutter or large heap allocation events."
        )
        recommendations.append("Preallocate object pools and eliminate per-frame temporary allocations.")

    passed = len(failure_reasons) == 0

    return {
        "total_frames": len(samples),
        "target_fps": target_fps,
        "average_fps": round(avg_fps, 2),
        "average_frame_time_ms": round(avg_frame_time, 3),
        "p95_frame_time_ms": round(p95, 3),
        "p99_frame_time_ms": round(p99, 3),
        "max_frame_time_ms": round(max_frame_time, 3),
        "dropped_frame_count": dropped_frames,
        "dropped_frame_ratio": round(dropped_ratio, 4),
        "max_draw_calls": max_dc,
        "average_draw_calls": round(avg_dc, 1),
        "max_triangles": max_tri,
        "average_triangles": round(avg_tri, 1),
        "gc_stutter_events": len(gc_events),
        "passed": passed,
        "failure_reasons": failure_reasons,
        "recommendations": recommendations,
    }


def enable_vr_profiling():
    """Enables Unreal Engine 5 VR performance telemetry overlays in viewport."""
    if not IN_UNREAL:
        print("[SetView Profiler] Warning: Unreal Engine Python API not available. Running in standalone mode.")
        return

    commands = [
        "stat fps",
        "stat unit",
        "stat rhi",
        "stat memory",
        "stat scenerendering",
    ]
    for cmd in commands:
        unreal.SystemLibrary.execute_console_command(None, cmd)
    unreal.log("[SetView Profiler] VR Hardware profiling HUD overlays activated in UE5.")


def configure_quest3_vr_settings(foveation_level: int = 1, dynamic_resolution: bool = True):
    """Applies optimal Meta Quest 3 standalone rendering CVars in Unreal Engine 5."""
    if not IN_UNREAL:
        print(f"[SetView Profiler] Configured simulated Quest 3 settings: FFR={foveation_level}, DRS={dynamic_resolution}")
        return

    cvars = [
        f"vr.FoveatedRenderingMethod {foveation_level}",
        f"r.DynamicRes.OperationMode {1 if dynamic_resolution else 0}",
        "r.MobileContentScaleFactor 1.0",
        "r.AntiAliasingMethod 2",  # Temporal Anti-Aliasing
        "r.SeparateTranslucency 0",
        "r.Shadow.DistanceField 0",
    ]
    for cvar in cvars:
        unreal.SystemLibrary.execute_console_command(None, cvar)
    unreal.log(f"[SetView Profiler] Quest 3 VR CVars applied (FFR level {foveation_level}).")


def run_synthetic_benchmark(target_fps: int = 72, duration_sec: float = 5.0) -> Dict[str, Any]:
    """Generates synthetic telemetry to verify profiler math and threshold compliance."""
    frame_count = int(duration_sec * target_fps)
    frame_budget_ms = 1000.0 / float(target_fps)
    samples = []

    current_ts = 0.0
    for i in range(frame_count):
        jitter = (math.sin(i * 0.1) * 0.7) + (math.cos(i * 0.3) * 0.4)
        ft = max(4.0, (frame_budget_ms * 0.82) + jitter)
        samples.append({
            "frameIndex": i + 1,
            "timestampMs": current_ts,
            "frameTimeMs": round(ft, 3),
            "cpuLogicTimeMs": round(ft * 0.35, 3),
            "gpuRenderTimeMs": round(ft * 0.65, 3),
            "drawCallCount": 42 + int(math.sin(i * 0.2) * 8),
            "triangleCount": 210000 + int(math.cos(i * 0.2) * 15000),
            "shaderProgramSwitches": 14,
            "heapAllocatedBytes": 0,
            "gcEventDetected": False,
        })
        current_ts += ft

    return evaluate_frame_telemetry(samples, target_fps)


def main():
    parser = argparse.ArgumentParser(description="SetView VR Profiler Bridge for UE5")
    parser.add_argument("--verify", action="store_true", help="Run self-verification benchmark")
    parser.add_argument("--target-fps", type=int, default=72, choices=[72, 90, 120], help="Target VR framerate")
    parser.add_argument("--samples", type=str, help="Path to JSON file containing frame samples")
    args = parser.parse_args()

    if args.verify or not args.samples:
        print(f"[SetView Profiler] Running self-verification benchmark ({args.target_fps} FPS)...")
        results = run_synthetic_benchmark(args.target_fps, duration_sec=6.0)
        print(json.dumps(results, indent=2))
        if results["passed"]:
            print("[SetView Profiler] PASS: Synthetic VR benchmark satisfied Quest 3 standalone budgets.")
            sys.exit(0)
        else:
            print("[SetView Profiler] FAIL: Quality control verification violations detected.")
            sys.exit(1)
    else:
        if not os.path.exists(args.samples):
            print(f"Error: Sample file '{args.samples}' not found.")
            sys.exit(1)
        with open(args.samples, "r", encoding="utf-8") as f:
            data = json.load(f)
        samples = data.get("samples", data) if isinstance(data, dict) else data
        results = evaluate_frame_telemetry(samples, args.target_fps)
        print(json.dumps(results, indent=2))
        sys.exit(0 if results["passed"] else 1)


if __name__ == "__main__":
    main()
