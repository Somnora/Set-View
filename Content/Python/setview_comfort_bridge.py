# -*- coding: utf-8 -*-
"""
SetView VR Motion Sickness, Ergonomics & Spatial Comfort Bridge for Unreal Engine 5
-----------------------------------------------------------------------------------
Automates VR peripheral FOV vignette tunneling, movement damping, ergonomic reach
audits, and vestibular cybersickness evaluation inside Unreal Engine 5.

Features:
  - Automates UE5 PostProcessVolume peripheral vignette tunneling setup.
  - Standalone ergonomic reachability solver and near-eye vergence checker.
  - Evaluates vestibular kinematics, linear/angular jerk, and cybersickness index.
  - Dual-mode execution: runs inside UE5 Python environment or standalone via CLI.

Usage in Unreal Engine 5 (Output Log -> Python console):
    import Content.Python.setview_comfort_bridge as comfort_bridge
    comfort_bridge.configure_postprocess_vignette(enabled=True, min_radius=0.35)
    comfort_bridge.audit_scene_comfort()

Usage via Command Line / Standalone Mode:
    python3 Content/Python/setview_comfort_bridge.py [--verify] [--scene scene_comfort.json]
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


# VR Comfort Threshold Defaults
DEFAULT_COMFORT_THRESHOLDS = {
    "max_linear_acceleration": 3.0,     # m/s^2
    "max_linear_jerk": 6.0,             # m/s^3
    "max_angular_velocity": 60.0,       # deg/s
    "max_angular_jerk": 180.0,          # deg/s^3
    "near_eye_vergence_limit_m": 0.25,  # m (25 cm)
    "optimal_reach_min_m": 0.35,        # m
    "optimal_reach_max_m": 0.55,        # m
    "max_neutral_head_pitch_deg": 15.0, # deg
    "max_neutral_head_roll_deg": 10.0,  # deg
}


def clamp(val: float, min_val: float, max_val: float) -> float:
    """Clamps a floating point value to a range."""
    return max(min_val, min(max_val, val))


def evaluate_reachability(
    target_position: Dict[str, float],
    shoulder_origin: Dict[str, float],
    arm_length_m: float = 0.65,
    target_id: str = "target",
    target_name: str = "Target",
) -> Dict[str, Any]:
    """Evaluates ergonomic reachability and near-eye vergence conflict for an object."""
    dx = target_position.get("x", 0.0) - shoulder_origin.get("x", 0.0)
    dy = target_position.get("y", 0.0) - shoulder_origin.get("y", 0.0)
    dz = target_position.get("z", 0.0) - shoulder_origin.get("z", 0.0)
    distance_m = math.hypot(dx, dy, dz)
    elevation_delta_m = dy

    effective_arm_length = arm_length_m if arm_length_m > 0.1 else 0.65
    is_within_arm_span = distance_m <= effective_arm_length
    vergence_discomfort_risk = distance_m < DEFAULT_COMFORT_THRESHOLDS["near_eye_vergence_limit_m"]

    if vergence_discomfort_risk:
        classification = "near_eye_strain"
    elif 0.35 <= distance_m <= 0.55:
        classification = "optimal_reach"
    elif distance_m <= effective_arm_length:
        classification = "acceptable_reach"
    else:
        classification = "excessive_reach"

    return {
        "target_id": target_id,
        "target_name": target_name,
        "distance_m": round(distance_m, 3),
        "elevation_delta_m": round(elevation_delta_m, 3),
        "classification": classification,
        "is_within_arm_span": is_within_arm_span,
        "vergence_discomfort_risk": vergence_discomfort_risk,
    }


def evaluate_neck_strain(pitch_deg: float, roll_deg: float) -> Dict[str, Any]:
    """Evaluates cervical spine alignment and neck fatigue severity."""
    abs_pitch = abs(pitch_deg)
    abs_roll = abs(roll_deg)

    if abs_pitch <= 15.0:
        pitch_severity = "neutral"
    elif abs_pitch <= 30.0:
        pitch_severity = "moderate"
    elif abs_pitch <= 45.0:
        pitch_severity = "excessive"
    else:
        pitch_severity = "severe"

    if abs_roll <= 10.0:
        roll_severity = "neutral"
    elif abs_roll <= 20.0:
        roll_severity = "moderate"
    elif abs_roll <= 30.0:
        roll_severity = "excessive"
    else:
        roll_severity = "severe"

    is_fatigue_prone = (
        pitch_severity in ("excessive", "severe")
        or roll_severity in ("excessive", "severe")
        or (abs_pitch > 25.0 and abs_roll > 15.0)
    )

    return {
        "pitch_deg": round(pitch_deg, 1),
        "roll_deg": round(roll_deg, 1),
        "pitch_severity": pitch_severity,
        "roll_severity": roll_severity,
        "is_fatigue_prone": is_fatigue_prone,
    }


def calculate_cybersickness_index(
    linear_jerk: float,
    angular_jerk: float,
    duration_sec: float,
    locomotion_mode: str = "snap_turn",
) -> float:
    """Computes Cybersickness Risk Index on a 0 to 100 scale."""
    mode_weights = {
        "teleport": 0.15,
        "snap_turn": 0.25,
        "roomscale": 0.20,
        "smooth_locomotion": 0.80,
        "smooth_turn": 1.00,
    }
    mode_weight = mode_weights.get(locomotion_mode, 0.50)
    linear_score = min(50.0, (max(0.0, linear_jerk) / 6.0) * 45.0)
    angular_score = min(50.0, (max(0.0, angular_jerk) / 180.0) * 55.0)

    duration_factor = min(1.5, 0.8 + 0.2 * math.log10(max(1.0, duration_sec)))
    raw_index = (linear_score + angular_score) * mode_weight * duration_factor
    return round(clamp(raw_index, 0.0, 100.0), 1)


def audit_trajectory_comfort(
    samples: List[Dict[str, Any]],
    locomotion_mode: str = "snap_turn",
    vignette_enabled: bool = True,
) -> Dict[str, Any]:
    """Evaluates a sequence of vestibular samples against comfort standards."""
    incidents = []
    recommendations = []

    if not samples:
        return {
            "total_duration_sec": 0.0,
            "comfort_score": 100,
            "comfort_grade": "A",
            "passed_audit": True,
            "incidents": [],
            "recommendations": ["No telemetry recorded."],
        }

    peak_linear_acc = 0.0
    peak_linear_jerk = 0.0
    peak_ang_vel = 0.0
    peak_ang_jerk = 0.0

    first_ts = samples[0].get("timestampMs", 0)
    last_ts = samples[-1].get("timestampMs", 0)
    duration_sec = max(0.1, (last_ts - first_ts) / 1000.0)

    for s in samples:
        acc = s.get("acceleration", {})
        jrk = s.get("jerk", {})
        lin_acc = math.hypot(acc.get("x", 0.0), acc.get("y", 0.0), acc.get("z", 0.0))
        lin_jerk = math.hypot(jrk.get("x", 0.0), jrk.get("y", 0.0), jrk.get("z", 0.0))
        ang_vel = abs(s.get("angularVelocityDegSec", 0.0))
        ang_jerk = abs(s.get("angularJerkDegSec3", 0.0))

        if lin_acc > peak_linear_acc:
            peak_linear_acc = lin_acc
        if lin_jerk > peak_linear_jerk:
            peak_linear_jerk = lin_jerk
        if ang_vel > peak_ang_vel:
            peak_ang_vel = ang_vel
        if ang_jerk > peak_ang_jerk:
            peak_ang_jerk = ang_jerk

        if lin_jerk > DEFAULT_COMFORT_THRESHOLDS["max_linear_jerk"]:
            incidents.append({
                "type": "vestibular_jerk",
                "severity": "critical" if lin_jerk > 10.0 else "warning",
                "description": f"Linear jerk {lin_jerk:.2f} m/s3 exceeds comfort threshold.",
                "metric_value": lin_jerk,
                "limit_value": DEFAULT_COMFORT_THRESHOLDS["max_linear_jerk"],
            })

    if locomotion_mode == "smooth_turn" and not vignette_enabled:
        incidents.append({
            "type": "excessive_angular_accel",
            "severity": "critical",
            "description": "Smooth yaw rotation without FOV comfort vignette.",
            "metric_value": 1.0,
            "limit_value": 0.0,
        })
        recommendations.append("Enable FOV Comfort Vignette or switch to Snap Turn mode.")

    base_score = 100
    for inc in incidents:
        if inc["severity"] == "critical":
            base_score -= 20
        else:
            base_score -= 6

    comfort_score = max(0, min(100, base_score))
    if comfort_score >= 90:
        grade = "A"
    elif comfort_score >= 75:
        grade = "B"
    elif comfort_score >= 60:
        grade = "C"
    else:
        grade = "F"

    critical_count = sum(1 for i in incidents if i["severity"] == "critical")
    passed = comfort_score >= 75 and critical_count == 0

    return {
        "total_duration_sec": round(duration_sec, 2),
        "comfort_score": comfort_score,
        "comfort_grade": grade,
        "peak_linear_acc_m_s2": round(peak_linear_acc, 2),
        "peak_linear_jerk_m_s3": round(peak_linear_jerk, 2),
        "peak_angular_vel_deg_s": round(peak_ang_vel, 1),
        "peak_angular_jerk_deg_s3": round(peak_ang_jerk, 1),
        "incidents_count": len(incidents),
        "incidents": incidents,
        "passed_audit": passed,
        "recommendations": recommendations,
    }


def configure_ue5_vr_comfort(
    vignette_intensity: float = 0.45,
    min_radius: float = 0.35,
    enable_vignette: bool = True,
) -> bool:
    """Configures Unreal Engine 5 VR PostProcess volume and console settings."""
    if not IN_UNREAL:
        print("[SetView Comfort Bridge] Unreal Engine Python API not detected. Operating in standalone simulation mode.")
        return True

    unreal.log("[SetView Comfort Bridge] Configuring UE5 VR PostProcess Vignette...")
    try:
        if enable_vignette:
            unreal.SystemLibrary.execute_console_command(None, "r.PostProcessing.Vignette 1")
            unreal.SystemLibrary.execute_console_command(None, f"r.PostProcessing.Vignette.Intensity {vignette_intensity}")
            unreal.log(f"[SetView Comfort Bridge] Set vignette intensity to {vignette_intensity}")
        else:
            unreal.SystemLibrary.execute_console_command(None, "r.PostProcessing.Vignette 0")
            unreal.log("[SetView Comfort Bridge] Disabled peripheral vignette.")
        return True
    except Exception as ex:
        unreal.log_error(f"[SetView Comfort Bridge] Failed to execute console commands: {ex}")
        return False


def run_standalone_verification() -> bool:
    """Performs unit verification of the comfort evaluator algorithms."""
    print("=================================================================")
    print("SetView VR Motion Sickness & Comfort Bridge - Self-Verification")
    print("=================================================================")

    # Test 1: Reachability
    reach = evaluate_reachability(
        target_position={"x": 0.0, "y": 1.4, "z": -0.45},
        shoulder_origin={"x": 0.0, "y": 1.4, "z": 0.0},
        arm_length_m=0.65,
    )
    assert reach["classification"] == "optimal_reach", f"Expected optimal_reach, got {reach['classification']}"
    assert reach["is_within_arm_span"] is True
    assert reach["vergence_discomfort_risk"] is False
    print("✓ Test 1 Passed: Optimal Reachability Classification")

    # Test 2: Near-Eye Vergence
    near = evaluate_reachability(
        target_position={"x": 0.0, "y": 1.4, "z": -0.15},
        shoulder_origin={"x": 0.0, "y": 1.4, "z": 0.0},
        arm_length_m=0.65,
    )
    assert near["classification"] == "near_eye_strain"
    assert near["vergence_discomfort_risk"] is True
    print("✓ Test 2 Passed: Near-Eye Strain & Vergence Detection")

    # Test 3: Neck Strain
    neck_neutral = evaluate_neck_strain(10.0, 5.0)
    assert neck_neutral["pitch_severity"] == "neutral"
    assert neck_neutral["roll_severity"] == "neutral"
    assert neck_neutral["is_fatigue_prone"] is False

    neck_severe = evaluate_neck_strain(50.0, 35.0)
    assert neck_severe["pitch_severity"] == "severe"
    assert neck_severe["roll_severity"] == "severe"
    assert neck_severe["is_fatigue_prone"] is True
    print("✓ Test 3 Passed: Neck Strain & Cervical Fatigue Evaluation")

    # Test 4: Cybersickness Index
    cs_snap = calculate_cybersickness_index(1.0, 5.0, 60.0, "snap_turn")
    cs_smooth = calculate_cybersickness_index(10.0, 150.0, 60.0, "smooth_turn")
    assert cs_snap < cs_smooth
    assert cs_snap < 30.0
    assert cs_smooth > 50.0
    print("✓ Test 4 Passed: Cybersickness Risk Index Calculations")

    # Test 5: Trajectory Audit
    sim_samples = [
        {
            "timestampMs": i * 14,
            "acceleration": {"x": 0, "y": 0, "z": 0.5},
            "jerk": {"x": 0, "y": 0, "z": 1.0},
            "angularVelocityDegSec": 10.0,
            "angularJerkDegSec3": 5.0,
        }
        for i in range(100)
    ]
    audit = audit_trajectory_comfort(sim_samples, locomotion_mode="snap_turn", vignette_enabled=True)
    assert audit["passed_audit"] is True
    assert audit["comfort_grade"] in ("A", "B")
    print("✓ Test 5 Passed: Trajectory Audit Solver")

    print("\nAll SetView VR Comfort Bridge verification checks PASSED successfully.")
    return True


def main():
    parser = argparse.ArgumentParser(description="SetView VR Motion Sickness & Comfort Bridge for UE5")
    parser.add_argument("--verify", action="store_true", help="Run standalone mathematical verification suite")
    parser.add_argument("--scene", type=str, default="", help="Path to scene comfort JSON manifest")
    parser.add_argument("--vignette", action="store_true", help="Configure UE5 post-processing vignette")
    args = parser.parse_args()

    if args.verify or (not IN_UNREAL and not args.scene and not args.vignette):
        success = run_standalone_verification()
        sys.exit(0 if success else 1)

    if args.vignette:
        configure_ue5_vr_comfort(enable_vignette=True)

    if args.scene:
        if not os.path.exists(args.scene):
            print(f"Error: Manifest file not found: {args.scene}")
            sys.exit(1)
        with open(args.scene, "r", encoding="utf-8") as f:
            data = json.load(f)
        print(f"Loaded comfort manifest with {len(data.get('incidents', []))} incidents.")


if __name__ == "__main__":
    main()
