// ---------------------------------------------------------------------------
// SetView Pure Domain Spatial Smart-Snapping & Contextual Interaction Math
// PURE DOMAIN MODULE - ZERO Three.js or DOM imports.
// Suitable for direct execution in Node.js unit tests and headless runtimes.
// ---------------------------------------------------------------------------

import type { Quat, Vec3 } from './model.ts';

export type SnapTargetType =
  | 'floor_mark'
  | 'dolly_track'
  | 'grid_truss'
  | 'wall_perpendicular'
  | 'actor_gaze';

export interface SnapCandidate {
  targetId: string;
  type: SnapTargetType;
  position: Vec3;
  rotation?: Quat;
  distanceM: number;
  snapRadiusM: number;
}

export interface SnapResult {
  snapped: boolean;
  snappedPosition: Vec3;
  snappedRotation?: Quat;
  activeTarget?: SnapCandidate;
}

export interface ContextQuickAction {
  id: string;
  label: string;
  icon: string;
  category: string;
  actionType: string;
}

/** Pure domain distance calculation between two 3D vectors. */
export function distanceVec3(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.hypot(dx, dy, dz);
}

/** Pure domain identity quaternion. */
export function quatIdentity(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 };
}

/** Pure domain quaternion from yaw rotation around +Y axis. */
export function quatFromYaw(yawRad: number): Quat {
  const half = yawRad * 0.5;
  return {
    x: 0,
    y: Math.sin(half),
    z: 0,
    w: Math.cos(half),
  };
}

/**
 * Calculates magnetic snapping against a list of candidate snap targets.
 * Evaluates candidate thresholds and applies smart magnetic attraction.
 */
export function calculateMagneticSnap(
  position: Vec3,
  rotation: Quat,
  candidates: SnapCandidate[],
  thresholdRadiusM?: number,
): SnapResult {
  if (!candidates || candidates.length === 0) {
    return {
      snapped: false,
      snappedPosition: { x: position.x, y: position.y, z: position.z },
      snappedRotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
    };
  }

  let bestCandidate: SnapCandidate | null = null;
  let minDistance = Infinity;

  for (const candidate of candidates) {
    const dist = distanceVec3(position, candidate.position);
    const maxRadius = thresholdRadiusM !== undefined
      ? Math.min(thresholdRadiusM, candidate.snapRadiusM)
      : candidate.snapRadiusM;

    if (dist <= maxRadius && dist < minDistance) {
      minDistance = dist;
      bestCandidate = candidate;
    }
  }

  if (!bestCandidate) {
    return {
      snapped: false,
      snappedPosition: { x: position.x, y: position.y, z: position.z },
      snappedRotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
    };
  }

  // If very close (< 25% of snap radius or < 0.04m), perform hard snap.
  // Otherwise, apply smooth cubic magnetic pull.
  const snapThreshold = Math.max(0.04, bestCandidate.snapRadiusM * 0.25);
  let finalPos: Vec3;

  if (minDistance <= snapThreshold) {
    finalPos = {
      x: bestCandidate.position.x,
      y: bestCandidate.position.y,
      z: bestCandidate.position.z,
    };
  } else {
    // Cubic magnetic attraction interpolation
    const t = 1.0 - (minDistance - snapThreshold) / (bestCandidate.snapRadiusM - snapThreshold);
    const smoothT = t * t * (3 - 2 * t);
    finalPos = {
      x: position.x + (bestCandidate.position.x - position.x) * smoothT,
      y: position.y + (bestCandidate.position.y - position.y) * smoothT,
      z: position.z + (bestCandidate.position.z - position.z) * smoothT,
    };
  }

  const finalRot = bestCandidate.rotation
    ? {
        x: bestCandidate.rotation.x,
        y: bestCandidate.rotation.y,
        z: bestCandidate.rotation.z,
        w: bestCandidate.rotation.w,
      }
    : { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w };

  return {
    snapped: true,
    snappedPosition: finalPos,
    snappedRotation: finalRot,
    activeTarget: {
      ...bestCandidate,
      distanceM: minDistance,
    },
  };
}

/**
 * Snaps an angle in radians to the nearest 45-degree or 90-degree step if within tolerance.
 */
export function calculateAngularSnap45_90(
  angleRad: number,
  toleranceRad: number = 0.0872665, // ~5 degrees in radians
): { snapped: boolean; snappedAngleRad: number } {
  const step = Math.PI / 4; // 45 degrees
  const twoPi = Math.PI * 2;

  // Normalize angle to [0, 2*PI)
  let norm = angleRad % twoPi;
  if (norm < 0) norm += twoPi;

  const nearestStepIndex = Math.round(norm / step);
  const targetAngle = nearestStepIndex * step;
  const diff = Math.abs(norm - targetAngle);

  if (diff <= toleranceRad || Math.abs(diff - twoPi) <= toleranceRad) {
    const finalAngle = (targetAngle % twoPi + twoPi) % twoPi;
    return {
      snapped: true,
      snappedAngleRad: finalAngle,
    };
  }

  return {
    snapped: false,
    snappedAngleRad: angleRad,
  };
}

/**
 * Calculates radial projection and tangent orientation for curved/circular camera dolly tracks.
 */
export function calculateTrackTangentAlignment(
  position: Vec3,
  trackCenter: Vec3,
  trackRadiusM: number,
): { snappedPosition: Vec3; tangentRotation: Quat } {
  const dx = position.x - trackCenter.x;
  const dz = position.z - trackCenter.z;
  const currentR = Math.hypot(dx, dz);

  const safeRadius = Math.max(0.1, trackRadiusM);
  let nx = 1;
  let nz = 0;

  if (currentR > 0.0001) {
    nx = dx / currentR;
    nz = dz / currentR;
  }

  const snappedPosition: Vec3 = {
    x: trackCenter.x + nx * safeRadius,
    y: position.y,
    z: trackCenter.z + nz * safeRadius,
  };

  // Tangent vector on XZ plane (counter-clockwise perpendicular: (-nz, nx))
  const tx = -nz;
  const tz = nx;

  // Derive yaw rotation where forward faces along the tangent
  const yaw = Math.atan2(tx, tz);
  const tangentRotation = quatFromYaw(yaw);

  return {
    snappedPosition,
    tangentRotation,
  };
}

/**
 * Generates contextual quick-action items based on selected entity type and properties.
 */
export function generateEntityContextActions(
  entityType:
    | 'camera'
    | 'actor'
    | 'light'
    | 'prop'
    | 'wall'
    | 'splat'
    | 'boom'
    | 'sun'
    | 'solar'
    | 'script'
    | 'screenplay'
    | 'profiler'
    | 'headset'
    | 'system'
    | 'comfort'
    | 'dressing'
    | 'set_dressing',
  entityId: string,
  metadata?: Record<string, unknown>,
): ContextQuickAction[] {

  switch (entityType) {
    case 'camera': {
      return [
        {
          id: `${entityId}_focal_step`,
          label: 'Step Lens',
          icon: '🔍',
          category: 'optics',
          actionType: 'camera_step_focal',
        },
        {
          id: `${entityId}_grip_rig`,
          label: 'Grip Rig',
          icon: '🎥',
          category: 'rig',
          actionType: 'camera_grip_config',
        },
        {
          id: `${entityId}_look_at`,
          label: 'Aim at Target',
          icon: '🎯',
          category: 'optics',
          actionType: 'camera_look_at',
        },
        {
          id: `${entityId}_audit_180`,
          label: '180° Axis Audit',
          icon: '📐',
          category: 'continuity',
          actionType: 'cam_audit_180_line',
        },
        {
          id: `${entityId}_apply_coverage`,
          label: 'AI Coverage',
          icon: '🎬',
          category: 'script',
          actionType: 'script_apply_coverage',
        },
        {
          id: `${entityId}_icvfx_moire`,
          label: 'ICVFX Moiré',
          icon: '🎬',
          category: 'icvfx',
          actionType: 'cam_icvfx_moire',
        },
        {
          id: `${entityId}_boom_incursion`,
          label: 'Boom Clearance',
          icon: '🎙️',
          category: 'acoustics',
          actionType: 'cam_boom_incursion',
        },
        {
          id: `${entityId}_record`,
          label: 'Record Take',
          icon: '🔴',
          category: 'capture',
          actionType: 'record_take',
        },
        {
          id: `${entityId}_duplicate`,
          label: 'Duplicate',
          icon: '📋',
          category: 'transform',
          actionType: 'camera_duplicate',
        },
      ];
    }

    case 'actor': {
      const isLocked = metadata?.locked === true;
      return [
        {
          id: `${entityId}_dialogue_pair`,
          label: 'Set Dialogue Pair',
          icon: '💬',
          category: 'script',
          actionType: 'actor_set_dialogue_pair',
        },
        {
          id: `${entityId}_script_breakdown`,
          label: 'Script Breakdown',
          icon: '📜',
          category: 'script',
          actionType: 'script_open_breakdown',
        },
        {
          id: `${entityId}_stance`,
          label: 'Cycle Stance',
          icon: '🧍',
          category: 'pose',
          actionType: 'actor_cycle_stance',
        },
        {
          id: `${entityId}_add_mark`,
          label: 'Drop Mark',
          icon: '📍',
          category: 'blocking',
          actionType: 'actor_add_mark',
        },
        {
          id: `${entityId}_boom_target`,
          label: 'Aim Boom Cue',
          icon: '🎙️',
          category: 'acoustics',
          actionType: 'actor_boom_target',
        },
        {
          id: `${entityId}_look_at_ik`,
          label: 'Look-At IK',
          icon: '👀',
          category: 'ik',
          actionType: 'actor_toggle_look_ik',
        },
        {
          id: `${entityId}_duplicate`,
          label: 'Duplicate',
          icon: '📋',
          category: 'transform',
          actionType: 'actor_duplicate',
        },
        {
          id: `${entityId}_lock`,
          label: isLocked ? 'Unlock' : 'Lock',
          icon: isLocked ? '🔓' : '🔒',
          category: 'state',
          actionType: 'entity_toggle_lock',
        },
      ];
    }

    case 'light': {
      return [
        {
          id: `${entityId}_kelvin`,
          label: 'Cycle Kelvin',
          icon: '💡',
          category: 'lighting',
          actionType: 'light_cycle_kelvin',
        },
        {
          id: `${entityId}_intensity`,
          label: 'Intensity',
          icon: '☀️',
          category: 'lighting',
          actionType: 'light_step_intensity',
        },
        {
          id: `${entityId}_dmx`,
          label: 'DMX Bridge',
          icon: '🎛️',
          category: 'lighting',
          actionType: 'light_open_dmx',
        },
        {
          id: `${entityId}_volumetric`,
          label: 'Volumetric Beam',
          icon: '✨',
          category: 'atmosphere',
          actionType: 'light_toggle_beam',
        },
        {
          id: `${entityId}_duplicate`,
          label: 'Duplicate',
          icon: '📋',
          category: 'transform',
          actionType: 'light_duplicate',
        },
      ];
    }

    case 'prop': {
      return [
        {
          id: `${entityId}_ground`,
          label: 'Snap to Floor',
          icon: '⬇️',
          category: 'transform',
          actionType: 'prop_ground_floor',
        },
        {
          id: `${entityId}_grid_snap`,
          label: 'Snap to Grid',
          icon: '🔲',
          category: 'transform',
          actionType: 'prop_grid_snap',
        },
        {
          id: `${entityId}_duplicate`,
          label: 'Duplicate',
          icon: '📋',
          category: 'transform',
          actionType: 'prop_duplicate',
        },
        {
          id: `${entityId}_delete`,
          label: 'Delete',
          icon: '🗑️',
          category: 'edit',
          actionType: 'prop_delete',
        },
      ];
    }

    case 'wall': {
      return [
        {
          id: `${entityId}_add_door`,
          label: 'Add Door',
          icon: '🚪',
          category: 'architecture',
          actionType: 'wall_add_door',
        },
        {
          id: `${entityId}_add_window`,
          label: 'Add Window',
          icon: '🪟',
          category: 'architecture',
          actionType: 'wall_add_window',
        },
        {
          id: `${entityId}_finish`,
          label: 'Cycle Finish',
          icon: '🎨',
          category: 'architecture',
          actionType: 'wall_cycle_finish',
        },
        {
          id: `${entityId}_delete`,
          label: 'Delete Wall',
          icon: '🗑️',
          category: 'architecture',
          actionType: 'wall_delete',
        },
      ];
    }

    case 'splat': {
      return [
        {
          id: `${entityId}_align`,
          label: 'Align to Set',
          icon: '📐',
          category: 'splat',
          actionType: 'splat_align_floor',
        },
        {
          id: `${entityId}_downsample`,
          label: 'Voxel Downsample',
          icon: '📉',
          category: 'splat',
          actionType: 'splat_downsample',
        },
        {
          id: `${entityId}_wireframe`,
          label: 'Bounds Wireframe',
          icon: '📦',
          category: 'splat',
          actionType: 'splat_toggle_bounds',
        },
        {
          id: `${entityId}_delete`,
          label: 'Delete Cloud',
          icon: '🗑️',
          category: 'splat',
          actionType: 'splat_delete',
        },
      ];
    }

    case 'boom': {
      return [
        {
          id: `${entityId}_open_acoustics`,
          label: 'Acoustics Studio',
          icon: '🎙️',
          category: 'acoustics',
          actionType: 'boom_open_acoustics',
        },
        {
          id: `${entityId}_toggle_mute`,
          label: 'Mute / Solo',
          icon: '🔇',
          category: 'acoustics',
          actionType: 'boom_toggle_mute',
        },
        {
          id: `${entityId}_snap_actor`,
          label: 'Snap to Overhead',
          icon: '🎯',
          category: 'rig',
          actionType: 'boom_snap_overhead',
        },
      ];
    }

    case 'sun':
    case 'solar': {
      return [
        {
          id: `${entityId}_open_solar`,
          label: 'Solar Studio',
          icon: '☀️',
          category: 'solar',
          actionType: 'sun_open_solar_studio',
        },
        {
          id: `${entityId}_golden_hour`,
          label: 'Golden Hour',
          icon: '🌅',
          category: 'solar',
          actionType: 'sun_snap_golden_hour',
        },
        {
          id: `${entityId}_high_noon`,
          label: 'High Noon',
          icon: '☀️',
          category: 'solar',
          actionType: 'sun_snap_high_noon',
        },
        {
          id: `${entityId}_toggle_shadows`,
          label: 'Toggle Shadows',
          icon: '🌗',
          category: 'solar',
          actionType: 'sun_toggle_shadows',
        },
      ];
    }

    case 'script':
    case 'screenplay': {
      return [
        {
          id: `${entityId}_open_breakdown`,
          label: 'Script Breakdown',
          icon: '📜',
          category: 'script',
          actionType: 'script_open_breakdown',
        },
        {
          id: `${entityId}_apply_coverage`,
          label: 'Apply AI Coverage',
          icon: '🎬',
          category: 'script',
          actionType: 'script_apply_coverage',
        },
        {
          id: `${entityId}_audit_180`,
          label: '180° Axis Audit',
          icon: '📐',
          category: 'continuity',
          actionType: 'cam_audit_180_line',
        },
      ];
    }

    case 'profiler':
    case 'headset':
    case 'system': {
      return [
        {
          id: `${entityId}_open_studio`,
          label: 'Profiler Studio',
          icon: '⚡',
          category: 'profiler',
          actionType: 'profiler_open_studio',
        },
        {
          id: `${entityId}_toggle_hud`,
          label: 'Toggle HUD',
          icon: '📊',
          category: 'profiler',
          actionType: 'profiler_toggle_hud',
        },
        {
          id: `${entityId}_run_benchmark`,
          label: 'Run Test Harness',
          icon: '🧪',
          category: 'profiler',
          actionType: 'profiler_run_benchmark',
        },
      ];
    }

    case 'comfort': {
      return [
        {
          id: `${entityId}_open_comfort`,
          label: 'Comfort Studio',
          icon: '🛡️',
          category: 'comfort',
          actionType: 'comfort_open_studio',
        },
        {
          id: `${entityId}_toggle_reach`,
          label: 'Reach Zones',
          icon: '🌐',
          category: 'comfort',
          actionType: 'comfort_toggle_reach_zones',
        },
        {
          id: `${entityId}_toggle_vignette`,
          label: 'Toggle Vignette',
          icon: '🕶️',
          category: 'comfort',
          actionType: 'comfort_toggle_vignette',
        },
      ];
    }

    case 'dressing':
    case 'set_dressing': {
      return [
        {
          id: `${entityId}_open_studio`,
          label: 'Set Dressing Studio',
          icon: '🎲',
          category: 'dressing',
          actionType: 'set_dressing_open_studio',
        },
        {
          id: `${entityId}_quick_scatter`,
          label: 'Quick Scatter',
          icon: '✨',
          category: 'dressing',
          actionType: 'set_dressing_quick_scatter',
        },
        {
          id: `${entityId}_ai_prompt`,
          label: 'AI Director Prompt',
          icon: '🤖',
          category: 'ai',
          actionType: 'set_dressing_ai_prompt',
        },
      ];
    }

    default:
      return [];
  }
}

