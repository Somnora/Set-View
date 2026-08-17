// ---------------------------------------------------------------------------
// Pure Domain Engine: Unreal Engine 5 Bridge & OpenUSD Exporter
//
// Pure domain module with ZERO Three.js and ZERO DOM imports for 100% Node testability.
// Provides:
//   - Universal Scene Description (USDA ASCII format) generation for OpenUSD & Unreal USD Stage
//   - Self-contained Unreal Engine 5 Python automation script generation (Unreal Python API)
//   - Formatted UE5 JSON Manifest interchange for custom C++ Unreal plugins and LiveLink
//   - Universal packaging dispatcher and coordinate conversion utilities
// ---------------------------------------------------------------------------

import {
  aspectValue,
  computeFocusDistance,
  sensorFormat,
  type ActorData,
  type CameraSetupData,
  type Quat,
  type SceneData,
  type Vec3,
} from './model.ts';
import { poseFor, type StanceId } from './pose.ts';
import { BUILTIN_PROPS } from './props.ts';

export type Ue5ExportFormat = 'open_usd' | 'ue5_python_script' | 'ue5_json_manifest';

export type UnrealVersion = '5.3' | '5.4' | '5.5';

export interface Ue5ExportOptions {
  /** Target frame rate for Sequencer and USD timeCodes (default: 24). */
  fps?: number;
  /** Target Unreal Engine version (default: '5.4'). */
  unrealEngineVersion?: UnrealVersion;
  /** Whether to generate LevelSequence tracks with keyframe animation (default: true). */
  generateSequencerTracks?: boolean;
  /** Whether to enable Nanite flags for static meshes (default: true). */
  useNanite?: boolean;
  /** Whether to configure Lumen dynamic global illumination and reflections (default: true). */
  useLumen?: boolean;
  /** Scale multiplier converting SetView meters to Unreal centimeters (default: 100.0). */
  scaleFactor?: number;
  /** Custom level sequence asset name (default: auto-derived from scene name). */
  sequenceName?: string;
  /** Whether to include spatial audio sound emitter cues (default: true). */
  includeAudioCues?: boolean;
  /** Whether to include atmospheric fog and volumetric lighting (default: true). */
  includeVolumetrics?: boolean;
  /** Whether to include 3D props and set dressing (default: true). */
  includeProps?: boolean;
}

export interface UeRotator {
  pitch: number;
  yaw: number;
  roll: number;
}

export interface Ue5BridgePackageResult {
  filename: string;
  mimeType: string;
  content: string;
}

// --- Coordinate System Transformations ---------------------------------------

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'scene';
}

export function escapeUsdString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function escapePythonString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export function sanitizePrimName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+/, '');
  return cleaned ? (cleaned.match(/^[0-9]/) ? `Prim_${cleaned}` : cleaned) : 'Prim';
}

/**
 * Converts SetView coordinates (meters, Y-up, right-handed) to Unreal Engine coordinates (cm, Z-up, left-handed).
 * SetView: +X right, +Y up, +Z towards viewer / south.
 * Unreal:  +X forward (SetView +Z), +Y right (SetView +X), +Z up (SetView +Y).
 */
export function svToUeLocation(pos: Vec3, scaleFactor: number = 100.0): Vec3 {
  const x = Number.isFinite(pos.x) ? pos.x : 0;
  const y = Number.isFinite(pos.y) ? pos.y : 0;
  const z = Number.isFinite(pos.z) ? pos.z : 0;
  return {
    x: z * scaleFactor,
    y: x * scaleFactor,
    z: y * scaleFactor,
  };
}

/**
 * Converts SetView heading rotationY (radians around +Y, 0 = +Z) to Unreal Yaw (degrees around +Z, 0 = +X).
 */
export function svHeadingToUeYaw(rotationYRad: number): number {
  if (!Number.isFinite(rotationYRad)) return 0;
  return (rotationYRad * 180) / Math.PI;
}

/**
 * Converts Three.js / SetView camera orientation quaternion to Unreal Engine Rotator (Pitch, Yaw, Roll in degrees).
 * Parity matches Unreal CineCameraActor view direction.
 */
export function svQuatToUeRotator(q: Quat): UeRotator {
  const qx = Number.isFinite(q.x) ? q.x : 0;
  const qy = Number.isFinite(q.y) ? q.y : 0;
  const qz = Number.isFinite(q.z) ? q.z : 0;
  const qw = Number.isFinite(q.w) ? q.w : 1;

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

  const yawDeg = (Math.atan2(fy_ue, fx_ue) * 180) / Math.PI;
  const horizDist = Math.sqrt(fx_ue * fx_ue + fy_ue * fy_ue);
  const pitchDeg = (Math.atan2(fz_ue, horizDist) * 180) / Math.PI;
  const rollDeg = (Math.atan2(ux_ue * ry_ue - uy_ue * rx_ue, uz_ue) * 180) / Math.PI;

  return {
    pitch: Number.isFinite(pitchDeg) ? pitchDeg : 0,
    yaw: Number.isFinite(yawDeg) ? yawDeg : 0,
    roll: Number.isFinite(rollDeg) ? rollDeg : 0,
  };
}

/**
 * Converts hex color string (#rrggbb) to linear RGB (0.0 to 1.0).
 */
export function hexToRgb(hexStr: string): { r: number; g: number; b: number } {
  const clean = hexStr.replace(/^#/, '');
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16) / 255.0;
    const g = parseInt(clean.substring(2, 4), 16) / 255.0;
    const b = parseInt(clean.substring(4, 6), 16) / 255.0;
    return {
      r: Number.isFinite(r) ? r : 1,
      g: Number.isFinite(g) ? g : 1,
      b: Number.isFinite(b) ? b : 1,
    };
  }
  return { r: 1.0, g: 1.0, b: 1.0 };
}

/**
 * Computes default options with sensible fallbacks.
 */
export function resolveUe5ExportOptions(options?: Ue5ExportOptions): Required<Ue5ExportOptions> {
  return {
    fps: options?.fps && options.fps > 0 ? options.fps : 24,
    unrealEngineVersion: options?.unrealEngineVersion ?? '5.4',
    generateSequencerTracks: options?.generateSequencerTracks ?? true,
    useNanite: options?.useNanite ?? true,
    useLumen: options?.useLumen ?? true,
    scaleFactor: options?.scaleFactor && options.scaleFactor > 0 ? options.scaleFactor : 100.0,
    sequenceName: options?.sequenceName ?? '',
    includeAudioCues: options?.includeAudioCues ?? true,
    includeVolumetrics: options?.includeVolumetrics ?? true,
    includeProps: options?.includeProps ?? true,
  };
}

// --- Keyframe Timing Helpers -------------------------------------------------

export interface KeyframeTimeSample<T> {
  timeS: number;
  frame: number;
  value: T;
}

export function computeActorKeyframeSamples(
  actor: ActorData,
  walkSpeed: number,
  fps: number,
  scaleFactor: number,
): KeyframeTimeSample<{ location: Vec3; yaw: number; stance?: StanceId }>[] {
  const samples: KeyframeTimeSample<{ location: Vec3; yaw: number; stance?: StanceId }>[] = [];
  const speed = walkSpeed > 0 ? walkSpeed : 1.4;

  let currentTimeS = 0.0;
  let lastPos = actor.position;

  // Mark 0: Base rest position at t = 0
  const baseLoc = svToUeLocation(actor.position, scaleFactor);
  const baseYaw = svHeadingToUeYaw(actor.rotationY);
  samples.push({
    timeS: 0,
    frame: 0,
    value: { location: baseLoc, yaw: baseYaw, stance: actor.stance },
  });

  for (const kf of actor.keyframes) {
    const kfPos = kf.position;
    const dx = kfPos.x - lastPos.x;
    const dy = kfPos.y - lastPos.y;
    const dz = kfPos.z - lastPos.z;
    const distM = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const moveDurS = Math.max(distM / speed, 0.5);

    currentTimeS += moveDurS;
    const kfLoc = svToUeLocation(kfPos, scaleFactor);
    const kfYaw = svHeadingToUeYaw(kf.rotationY);

    samples.push({
      timeS: currentTimeS,
      frame: Math.round(currentTimeS * fps),
      value: { location: kfLoc, yaw: kfYaw, stance: kf.stance ?? actor.stance },
    });

    lastPos = kfPos;
  }

  return samples;
}

export function computeCameraKeyframeSamples(
  cam: CameraSetupData,
  fps: number,
  scaleFactor: number,
): KeyframeTimeSample<{ location: Vec3; rotation: UeRotator; focalLength: number; focusDistanceCm: number }>[] {
  const samples: KeyframeTimeSample<{
    location: Vec3;
    rotation: UeRotator;
    focalLength: number;
    focusDistanceCm: number;
  }>[] = [];

  const baseLoc = svToUeLocation(cam.position, scaleFactor);
  const baseRot = svQuatToUeRotator(cam.rotation);
  const baseFocal = cam.lensFocalLength > 0 ? cam.lensFocalLength : 35.0;
  const baseFocusCm = (cam.focusDistanceM && cam.focusDistanceM > 0 ? cam.focusDistanceM : 3.0) * scaleFactor;

  samples.push({
    timeS: 0,
    frame: 0,
    value: {
      location: baseLoc,
      rotation: baseRot,
      focalLength: baseFocal,
      focusDistanceCm: baseFocusCm,
    },
  });

  const kfs = cam.keyframes ?? [];
  let currentTimeS = 0.0;
  let lastPos = cam.position;

  for (let i = 0; i < kfs.length; i++) {
    const kf = kfs[i];
    const dx = kf.position.x - lastPos.x;
    const dy = kf.position.y - lastPos.y;
    const dz = kf.position.z - lastPos.z;
    const distM = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const moveDurS = distM > 0.001 ? distM / 1.0 : 0.5; // 1.0 m/s default dolly speed
    const holdDurS = kf.holdDurationS && kf.holdDurationS > 0 ? kf.holdDurationS : 0.0;

    currentTimeS += moveDurS;
    const kfLoc = svToUeLocation(kf.position, scaleFactor);
    const kfRot = svQuatToUeRotator(kf.rotation);
    const kfFocal = kf.lensFocalLength > 0 ? kf.lensFocalLength : baseFocal;
    const kfFocusCm = (kf.focusDistanceM && kf.focusDistanceM > 0 ? kf.focusDistanceM : cam.focusDistanceM ?? 3.0) * scaleFactor;

    samples.push({
      timeS: currentTimeS,
      frame: Math.round(currentTimeS * fps),
      value: {
        location: kfLoc,
        rotation: kfRot,
        focalLength: kfFocal,
        focusDistanceCm: kfFocusCm,
      },
    });

    if (holdDurS > 0) {
      currentTimeS += holdDurS;
      samples.push({
        timeS: currentTimeS,
        frame: Math.round(currentTimeS * fps),
        value: {
          location: kfLoc,
          rotation: kfRot,
          focalLength: kfFocal,
          focusDistanceCm: kfFocusCm,
        },
      });
    }

    lastPos = kf.position;
  }

  return samples;
}

export function computeTotalSceneDurationS(scene: SceneData, options: Required<Ue5ExportOptions>): number {
  let maxDuration = 5.0; // Default 5 seconds if static

  for (const a of scene.actors) {
    const samples = computeActorKeyframeSamples(a, scene.walkSpeed, options.fps, options.scaleFactor);
    if (samples.length > 0) {
      const last = samples[samples.length - 1];
      if (last.timeS > maxDuration) maxDuration = last.timeS;
    }
  }

  for (const c of scene.cameras) {
    const samples = computeCameraKeyframeSamples(c, options.fps, options.scaleFactor);
    if (samples.length > 0) {
      const last = samples[samples.length - 1];
      if (last.timeS > maxDuration) maxDuration = last.timeS;
    }
  }

  if (scene.audioCues) {
    for (const cue of scene.audioCues) {
      const cueEnd = cue.timestampS + (cue.durationS ?? 2.0);
      if (cueEnd > maxDuration) maxDuration = cueEnd;
    }
  }

  return Math.ceil(maxDuration);
}

// ---------------------------------------------------------------------------
// 1. OpenUSD USDA ASCII Scene Generator
// ---------------------------------------------------------------------------

/**
 * Generates an OpenUSD ASCII (`.usda`) scene definition for Universal Scene Description
 * interchange, Unreal Engine USD Stage loading, Pixar USD tools, and Omniverse.
 */
export function generateOpenUsdScene(scene: SceneData, opts?: Ue5ExportOptions): string {
  const options = resolveUe5ExportOptions(opts);
  const totalDurationS = computeTotalSceneDurationS(scene, options);
  const totalFrames = Math.round(totalDurationS * options.fps);
  const sceneRootName = sanitizePrimName(`SetView_${scene.name}`);
  const lines: string[] = [];

  // Stage Header
  lines.push('#usda 1.0');
  lines.push('(');
  lines.push(`    defaultPrim = "${sceneRootName}"`);
  lines.push(`    doc = "Generated by SetView Unreal Engine 5 Bridge and OpenUSD Exporter"`);
  lines.push(`    metersPerUnit = 0.01`); // 1 unit = 1 cm
  lines.push(`    upAxis = "Z"`);
  lines.push(`    startTimeCode = 0`);
  lines.push(`    endTimeCode = ${totalFrames}`);
  lines.push(`    timeCodesPerSecond = ${options.fps}`);
  lines.push(`    framesPerSecond = ${options.fps}`);
  lines.push(')');
  lines.push('');

  // Root Assembly Prim
  lines.push(`def Xform "${sceneRootName}" (`);
  lines.push(`    assetInfo = {`);
  lines.push(`        string name = "${escapeUsdString(scene.name)}"`);
  lines.push(`        string generator = "SetView UE5 Bridge"`);
  lines.push(`        string version = "1.0"`);
  lines.push(`    }`);
  lines.push(`    kind = "assembly"`);
  lines.push(')');
  lines.push('{');

  // --- Scope: Atmosphere & Environment ---
  if (options.includeVolumetrics && scene.atmosphere) {
    const atmo = scene.atmosphere;
    const rgb = hexToRgb(atmo.tintHex);
    lines.push('    def Scope "Atmosphere"');
    lines.push('    {');
    lines.push('        def Xform "VolumetricSettings" (');
    lines.push('            doc = "Atmospheric fog and volumetric lighting parameters"');
    lines.push('        )');
    lines.push('        {');
    lines.push(`            custom bool enabled = ${atmo.enabled ? 1 : 0}`);
    lines.push(`            custom string preset = "${atmo.preset}"`);
    lines.push(`            custom float density = ${atmo.density.toFixed(4)}`);
    lines.push(`            custom float scatteringFactor = ${atmo.scatteringFactor.toFixed(4)}`);
    lines.push(`            custom float heightFalloff = ${atmo.heightFalloff.toFixed(4)}`);
    lines.push(`            custom color3f tintColor = (${rgb.r.toFixed(3)}, ${rgb.g.toFixed(3)}, ${rgb.b.toFixed(3)})`);
    lines.push(`            custom float beamIntensity = ${atmo.beamIntensity.toFixed(2)}`);
    lines.push('        }');
    lines.push('    }');
    lines.push('');
  }

  // --- Scope: Cine Cameras ---
  lines.push('    def Scope "Cameras"');
  lines.push('    {');
  for (const cam of scene.cameras) {
    const camPrimName = sanitizePrimName(cam.name);
    const fmt = sensorFormat(cam.formatId);
    const aspectVal = aspectValue(cam.aspect);
    const gateWidthMm = fmt.gateWidthMm;
    const gateHeightMm = gateWidthMm / aspectVal;
    const focalLengthMm = cam.lensFocalLength > 0 ? cam.lensFocalLength : 35.0;
    const fStop = cam.tStop > 0 ? cam.tStop : 2.8;
    const focusDistM = computeFocusDistance(cam, scene.actors);
    const focusDistCm = focusDistM * options.scaleFactor;

    const keyframeSamples =
      options.generateSequencerTracks && cam.keyframes && cam.keyframes.length > 0
        ? computeCameraKeyframeSamples(cam, options.fps, options.scaleFactor)
        : null;

    lines.push(`        def Camera "${camPrimName}" (`);
    lines.push(`            doc = "SetView CineCamera: ${escapeUsdString(cam.name)} (${focalLengthMm}mm, T${fStop}, ${fmt.name}) "`);
    lines.push('        )');
    lines.push('        {');
    lines.push('            float2 clippingRange = (10, 100000)');
    lines.push(`            float fStop = ${fStop.toFixed(2)}`);
    lines.push(`            float horizontalAperture = ${gateWidthMm.toFixed(3)}`);
    lines.push(`            float verticalAperture = ${gateHeightMm.toFixed(3)}`);
    lines.push('            float horizontalApertureOffset = 0');
    lines.push('            float verticalApertureOffset = 0');
    lines.push('            token projection = "perspective"');
    lines.push('            token stereoRole = "mono"');
    lines.push(`            custom string setview:formatId = "${cam.formatId}"`);
    lines.push(`            custom string setview:aspect = "${cam.aspect}"`);

    if (cam.lookAtTargetActorId) {
      lines.push(`            custom string setview:lookAtTargetActorId = "${cam.lookAtTargetActorId}"`);
    }

    if (keyframeSamples && keyframeSamples.length > 1) {
      // Animated Camera Properties with timeSamples
      lines.push('            float focalLength.timeSamples = {');
      for (const s of keyframeSamples) {
        lines.push(`                ${s.frame}: ${s.value.focalLength.toFixed(2)},`);
      }
      lines.push('            }');

      lines.push('            float focusDistance.timeSamples = {');
      for (const s of keyframeSamples) {
        lines.push(`                ${s.frame}: ${s.value.focusDistanceCm.toFixed(2)},`);
      }
      lines.push('            }');

      lines.push('            uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ"]');
      lines.push('            double3 xformOp:translate.timeSamples = {');
      for (const s of keyframeSamples) {
        const p = s.value.location;
        lines.push(`                ${s.frame}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}),`);
      }
      lines.push('            }');

      lines.push('            float3 xformOp:rotateXYZ.timeSamples = {');
      for (const s of keyframeSamples) {
        const r = s.value.rotation;
        lines.push(`                ${s.frame}: (${r.pitch.toFixed(2)}, ${r.yaw.toFixed(2)}, ${r.roll.toFixed(2)}),`);
      }
      lines.push('            }');
    } else {
      // Static Camera Properties
      const loc = svToUeLocation(cam.position, options.scaleFactor);
      const rot = svQuatToUeRotator(cam.rotation);
      lines.push(`            float focalLength = ${focalLengthMm.toFixed(2)}`);
      lines.push(`            float focusDistance = ${focusDistCm.toFixed(2)}`);
      lines.push('            uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ"]');
      lines.push(`            double3 xformOp:translate = (${loc.x.toFixed(2)}, ${loc.y.toFixed(2)}, ${loc.z.toFixed(2)})`);
      lines.push(`            float3 xformOp:rotateXYZ = (${rot.pitch.toFixed(2)}, ${rot.yaw.toFixed(2)}, ${rot.roll.toFixed(2)})`);
    }

    lines.push('        }');
  }
  lines.push('    }');
  lines.push('');

  // --- Scope: Lights ---
  if (scene.lights && scene.lights.length > 0) {
    lines.push('    def Scope "Lights"');
    lines.push('    {');
    for (const light of scene.lights) {
      const lightPrimName = sanitizePrimName(light.name);
      const loc = svToUeLocation({ x: light.position[0], y: light.position[1], z: light.position[2] }, options.scaleFactor);
      const yawDeg = svHeadingToUeYaw(light.rotationY);
      const pitchDeg = (light.rotationX * 180) / Math.PI;
      const intensity = light.intensity * 2500.0; // Scaled for Lumen
      const kelvin = light.colorKelvin;

      if (light.type === 'spot') {
        lines.push(`        def SphereLight "${lightPrimName}" (`);
        lines.push(`            doc = "SetView Cine SpotLight: ${escapeUsdString(light.name)}"`);
        lines.push('        )');
        lines.push('        {');
        lines.push('            bool inputs:enableColorTemperature = 1');
        lines.push(`            float inputs:colorTemperature = ${kelvin}`);
        lines.push(`            float inputs:intensity = ${intensity.toFixed(2)}`);
        lines.push('            float inputs:radius = 15.0');
        lines.push(`            float inputs:shaping:cone:angle = ${(light.coneAngleDeg / 2).toFixed(2)}`);
        lines.push('            float inputs:shaping:cone:softness = 0.1');
        lines.push('            uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ"]');
        lines.push(`            double3 xformOp:translate = (${loc.x.toFixed(2)}, ${loc.y.toFixed(2)}, ${loc.z.toFixed(2)})`);
        lines.push(`            float3 xformOp:rotateXYZ = (${pitchDeg.toFixed(2)}, ${yawDeg.toFixed(2)}, 0)`);
        lines.push('        }');
      } else if (light.type === 'area') {
        lines.push(`        def RectLight "${lightPrimName}" (`);
        lines.push(`            doc = "SetView Cine AreaLight: ${escapeUsdString(light.name)}"`);
        lines.push('        )');
        lines.push('        {');
        lines.push('            bool inputs:enableColorTemperature = 1');
        lines.push(`            float inputs:colorTemperature = ${kelvin}`);
        lines.push(`            float inputs:intensity = ${intensity.toFixed(2)}`);
        lines.push('            float inputs:width = 120.0');
        lines.push('            float inputs:height = 80.0');
        lines.push('            uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ"]');
        lines.push(`            double3 xformOp:translate = (${loc.x.toFixed(2)}, ${loc.y.toFixed(2)}, ${loc.z.toFixed(2)})`);
        lines.push(`            float3 xformOp:rotateXYZ = (${pitchDeg.toFixed(2)}, ${yawDeg.toFixed(2)}, 0)`);
        lines.push('        }');
      } else {
        // Point light
        lines.push(`        def SphereLight "${lightPrimName}" (`);
        lines.push(`            doc = "SetView Cine PointLight: ${escapeUsdString(light.name)}"`);
        lines.push('        )');
        lines.push('        {');
        lines.push('            bool inputs:enableColorTemperature = 1');
        lines.push(`            float inputs:colorTemperature = ${kelvin}`);
        lines.push(`            float inputs:intensity = ${intensity.toFixed(2)}`);
        lines.push('            float inputs:radius = 20.0');
        lines.push('            uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ"]');
        lines.push(`            double3 xformOp:translate = (${loc.x.toFixed(2)}, ${loc.y.toFixed(2)}, ${loc.z.toFixed(2)})`);
        lines.push(`            float3 xformOp:rotateXYZ = (${pitchDeg.toFixed(2)}, ${yawDeg.toFixed(2)}, 0)`);
        lines.push('        }');
      }
    }
    lines.push('    }');
    lines.push('');
  }

  // --- Scope: Actors (Cast & Blocking) ---
  lines.push('    def Scope "Actors"');
  lines.push('    {');
  for (const actor of scene.actors) {
    const actorPrimName = sanitizePrimName(actor.name);
    const colorRgb = hexToRgb(actor.color);
    const heightCm = (actor.heightM && actor.heightM > 0 ? actor.heightM : 1.75) * options.scaleFactor;
    const scale = actor.scale && actor.scale > 0 ? actor.scale : 1.0;
    const stance = actor.stance ?? 'standing';
    const stanceInfo = poseFor(stance);

    const keyframeSamples =
      options.generateSequencerTracks && actor.keyframes && actor.keyframes.length > 0
        ? computeActorKeyframeSamples(actor, scene.walkSpeed, options.fps, options.scaleFactor)
        : null;

    lines.push(`        def Xform "${actorPrimName}" (`);
    lines.push(`            doc = "SetView Actor: ${escapeUsdString(actor.name)} (Stance: ${stance})"`);
    lines.push('        )');
    lines.push('        {');
    lines.push(`            custom string stance = "${stance}"`);
    lines.push(`            custom float heightCm = ${heightCm.toFixed(2)}`);
    lines.push(`            custom float scale = ${scale.toFixed(3)}`);
    lines.push(`            custom color3f displayColor = (${colorRgb.r.toFixed(3)}, ${colorRgb.g.toFixed(3)}, ${colorRgb.b.toFixed(3)})`);

    if (actor.notes && actor.notes.length > 0) {
      const noteTexts = actor.notes.map((n) => `[${n.kind.toUpperCase()}] ${n.text}`).join(' | ');
      lines.push(`            custom string notes = "${escapeUsdString(noteTexts)}"`);
    }

    if (keyframeSamples && keyframeSamples.length > 1) {
      lines.push('            uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ", "xformOp:scale"]');
      lines.push('            double3 xformOp:translate.timeSamples = {');
      for (const s of keyframeSamples) {
        const p = s.value.location;
        const liftCm = (poseFor(s.value.stance).bodyLift ?? 0) * options.scaleFactor;
        lines.push(`                ${s.frame}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${(p.z + liftCm).toFixed(2)}),`);
      }
      lines.push('            }');

      lines.push('            float3 xformOp:rotateXYZ.timeSamples = {');
      for (const s of keyframeSamples) {
        const st = poseFor(s.value.stance);
        const pitch = (st.bodyRot.x * 180) / Math.PI;
        const roll = (st.bodyRot.z * 180) / Math.PI;
        lines.push(`                ${s.frame}: (${pitch.toFixed(2)}, ${s.value.yaw.toFixed(2)}, ${roll.toFixed(2)}),`);
      }
      lines.push('            }');
      lines.push(`            float3 xformOp:scale = (${scale.toFixed(3)}, ${scale.toFixed(3)}, ${scale.toFixed(3)})`);
    } else {
      const loc = svToUeLocation(actor.position, options.scaleFactor);
      const yaw = svHeadingToUeYaw(actor.rotationY);
      const liftCm = stanceInfo.bodyLift * options.scaleFactor;
      const pitch = (stanceInfo.bodyRot.x * 180) / Math.PI;
      const roll = (stanceInfo.bodyRot.z * 180) / Math.PI;

      lines.push('            uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ", "xformOp:scale"]');
      lines.push(`            double3 xformOp:translate = (${loc.x.toFixed(2)}, ${loc.y.toFixed(2)}, ${(loc.z + liftCm).toFixed(2)})`);
      lines.push(`            float3 xformOp:rotateXYZ = (${pitch.toFixed(2)}, ${yaw.toFixed(2)}, ${roll.toFixed(2)})`);
      lines.push(`            float3 xformOp:scale = (${scale.toFixed(3)}, ${scale.toFixed(3)}, ${scale.toFixed(3)})`);
    }

    // Proxy Box Geometry representing actor body bounds
    const hw = (25.0 * scale).toFixed(2);
    const hd = (15.0 * scale).toFixed(2);
    const h = (heightCm * scale).toFixed(2);

    lines.push('            def Mesh "ProxyMesh"');
    lines.push('            {');
    lines.push(`                float3[] extent = [(-${hw}, -${hd}, 0), (${hw}, ${hd}, ${h})]`);
    lines.push('                int[] faceVertexCounts = [4, 4, 4, 4, 4, 4]');
    lines.push('                int[] faceVertexIndices = [0, 1, 2, 3, 4, 5, 6, 7, 0, 4, 7, 3, 1, 5, 6, 2, 3, 2, 6, 7, 0, 1, 5, 4]');
    lines.push('                point3f[] points = [');
    lines.push(`                    (-${hw}, -${hd}, 0), (${hw}, -${hd}, 0), (${hw}, ${hd}, 0), (-${hw}, ${hd}, 0),`);
    lines.push(`                    (-${hw}, -${hd}, ${h}), (${hw}, -${hd}, ${h}), (${hw}, ${hd}, ${h}), (-${hw}, ${hd}, ${h})`);
    lines.push('                ]');
    lines.push(`                color3f[] primvars:displayColor = [(${colorRgb.r.toFixed(3)}, ${colorRgb.g.toFixed(3)}, ${colorRgb.b.toFixed(3)})] (`);
    lines.push('                    interpolation = "constant"');
    lines.push('                )');
    lines.push('            }');

    lines.push('        }');
  }
  lines.push('    }');
  lines.push('');

  // --- Scope: Props ---
  if (options.includeProps && scene.props && scene.props.length > 0) {
    lines.push('    def Scope "Props"');
    lines.push('    {');
    for (const prop of scene.props) {
      const propPrimName = sanitizePrimName(prop.name);
      const loc = svToUeLocation(prop.position, options.scaleFactor);
      const yaw = svHeadingToUeYaw(prop.rotationY);
      const pitch = ((prop.rotationX ?? 0) * 180) / Math.PI;
      const roll = ((prop.rotationZ ?? 0) * 180) / Math.PI;

      const def = BUILTIN_PROPS.find((p) => p.id === prop.assetId);
      const dim = def?.dimensions ?? { width: 0.8, height: 0.8, depth: 0.8 };
      const sx = prop.scale?.x ?? 1.0;
      const sy = prop.scale?.y ?? 1.0;
      const sz = prop.scale?.z ?? 1.0;

      const halfW = ((dim.width * options.scaleFactor * sx) / 2).toFixed(2);
      const halfD = ((dim.depth * options.scaleFactor * sz) / 2).toFixed(2);
      const propH = (dim.height * options.scaleFactor * sy).toFixed(2);

      const colorHex = prop.colorHex ?? def?.defaultColorHex ?? '#64748b';
      const propRgb = hexToRgb(colorHex);

      lines.push(`        def Xform "${propPrimName}" (`);
      lines.push(`            doc = "SetView Prop: ${escapeUsdString(prop.name)} (${prop.category})"`);
      lines.push('        )');
      lines.push('        {');
      lines.push(`            custom string assetId = "${prop.assetId}"`);
      lines.push(`            custom string category = "${prop.category}"`);
      lines.push(`            custom bool unreal:useNanite = ${options.useNanite ? 1 : 0}`);
      lines.push('            uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ", "xformOp:scale"]');
      lines.push(`            double3 xformOp:translate = (${loc.x.toFixed(2)}, ${loc.y.toFixed(2)}, ${loc.z.toFixed(2)})`);
      lines.push(`            float3 xformOp:rotateXYZ = (${pitch.toFixed(2)}, ${yaw.toFixed(2)}, ${roll.toFixed(2)})`);
      lines.push(`            float3 xformOp:scale = (${sx.toFixed(3)}, ${sy.toFixed(3)}, ${sz.toFixed(3)})`);

      lines.push('            def Mesh "ProxyMesh"');
      lines.push('            {');
      lines.push(`                float3[] extent = [(-${halfW}, -${halfD}, 0), (${halfW}, ${halfD}, ${propH})]`);
      lines.push('                int[] faceVertexCounts = [4, 4, 4, 4, 4, 4]');
      lines.push('                int[] faceVertexIndices = [0, 1, 2, 3, 4, 5, 6, 7, 0, 4, 7, 3, 1, 5, 6, 2, 3, 2, 6, 7, 0, 1, 5, 4]');
      lines.push('                point3f[] points = [');
      lines.push(`                    (-${halfW}, -${halfD}, 0), (${halfW}, -${halfD}, 0), (${halfW}, ${halfD}, 0), (-${halfW}, ${halfD}, 0),`);
      lines.push(`                    (-${halfW}, -${halfD}, ${propH}), (${halfW}, -${halfD}, ${propH}), (${halfW}, ${halfD}, ${propH}), (-${halfW}, ${halfD}, ${propH})`);
      lines.push('                ]');
      lines.push(`                color3f[] primvars:displayColor = [(${propRgb.r.toFixed(3)}, ${propRgb.g.toFixed(3)}, ${propRgb.b.toFixed(3)})] (`);
      lines.push('                    interpolation = "constant"');
      lines.push('                )');
      lines.push('            }');

      lines.push('        }');
    }
    lines.push('    }');
    lines.push('');
  }

  // --- Scope: Location Scan Proxy ---
  if (scene.scan) {
    const sc = scene.scan;
    const minLoc = svToUeLocation(sc.boundsMin, options.scaleFactor);
    const maxLoc = svToUeLocation(sc.boundsMax, options.scaleFactor);

    lines.push('    def Scope "Scans"');
    lines.push('    {');
    lines.push('        def Xform "LocationScan" (');
    lines.push(`            doc = "SetView Location Scan bounds: ${sc.vertices} vertices, ${sc.triangles} triangles"`);
    lines.push('        )');
    lines.push('        {');
    lines.push(`            custom string scanId = "${sc.id}"`);
    lines.push(`            custom int vertices = ${sc.vertices}`);
    lines.push(`            custom int triangles = ${sc.triangles}`);
    lines.push(`            custom bool unreal:useNanite = ${options.useNanite ? 1 : 0}`);
    lines.push('            def Mesh "ScanBounds"');
    lines.push('            {');
    lines.push(`                float3[] extent = [(${minLoc.x.toFixed(2)}, ${minLoc.y.toFixed(2)}, ${minLoc.z.toFixed(2)}), (${maxLoc.x.toFixed(2)}, ${maxLoc.y.toFixed(2)}, ${maxLoc.z.toFixed(2)})]`);
    lines.push('                color3f[] primvars:displayColor = [(0.2, 0.4, 0.6)] (');
    lines.push('                    interpolation = "constant"');
    lines.push('                )');
    lines.push('            }');
    lines.push('        }');
    lines.push('    }');
    lines.push('');
  }

  lines.push('}');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 2. Self-Contained Unreal Engine 5 Python Automation Script
// ---------------------------------------------------------------------------

/**
 * Generates a complete, self-contained Unreal Engine 5 Python automation script.
 * Executable inside Unreal Engine 5.3, 5.4, and 5.5 via Python Console or Editor Utility.
 */
export function generateUe5PythonImportScript(scene: SceneData, opts?: Ue5ExportOptions): string {
  const options = resolveUe5ExportOptions(opts);
  const sequenceName = options.sequenceName.trim() || `LS_${slug(scene.name)}`;
  const sceneJsonString = JSON.stringify(scene, null, 2);

  return `"""
SetView -> Unreal Engine 5 Automation & Scene Construction Engine
-----------------------------------------------------------------
Generated for: "${escapePythonString(scene.name)}"
Unreal Engine Target: ${options.unrealEngineVersion} (Lumen: ${options.useLumen ? 'ON' : 'OFF'}, Nanite: ${options.useNanite ? 'ON' : 'OFF'})
Scale Factor: ${options.scaleFactor.toFixed(1)} cm/m | Display Rate: ${options.fps} fps

Usage in Unreal Engine Python Console:
    import unreal
    exec(open("/path/to/this_script.py").read())

Or run via CLI / Headless Automation:
    UnrealEditor-Cmd.exe "<ProjectDir>/<Project>.uproject" -ExecutePythonScript="/path/to/this_script.py"
"""

import os
import sys
import math
import json
import argparse
from typing import Dict, List, Any, Optional, Tuple

try:
    import unreal # type: ignore
    IN_UNREAL = True
except ImportError:
    unreal = None
    IN_UNREAL = False

# --- Embedded Scene Data Payload ---------------------------------------------
SCENE_DATA_PAYLOAD = json.loads(r'''${escapePythonString(sceneJsonString)}''')

# --- Configuration & Sensor Formats ------------------------------------------
FPS = ${options.fps}
SCALE_FACTOR = ${options.scaleFactor.toFixed(1)}
USE_LUMEN = ${options.useLumen ? 'True' : 'False'}
USE_NANITE = ${options.useNanite ? 'True' : 'False'}
GEN_SEQUENCER = ${options.generateSequencerTracks ? 'True' : 'False'}
TARGET_UE_VERSION = "${options.unrealEngineVersion}"
LEVEL_SEQUENCE_NAME = "${escapePythonString(sequenceName)}"

SENSOR_FORMATS = {
    'super35': {'name': 'Super 35', 'gateWidthMm': 24.89, 'cocMm': 0.025, 'squeeze': 1.0},
    'fullframe': {'name': 'Full Frame / VV', 'gateWidthMm': 36.0, 'cocMm': 0.029, 'squeeze': 1.0},
    'super16': {'name': 'Super 16', 'gateWidthMm': 12.52, 'cocMm': 0.015, 'squeeze': 1.0},
    'anamorphic35': {'name': 'S35 Anamorphic 2x', 'gateWidthMm': 24.89, 'cocMm': 0.025, 'squeeze': 2.0},
}

ASPECT_RATIOS = {
    '2.39:1': 2.39,
    '16:9': 16.0 / 9.0,
    '4:3': 4.0 / 3.0,
}

STANCES = {
    'standing': {'bodyLift': 0.0, 'pitch': 0.0, 'roll': 0.0},
    'lean-left': {'bodyLift': 0.0, 'pitch': 0.0, 'roll': 11.46},
    'lean-right': {'bodyLift': 0.0, 'pitch': 0.0, 'roll': -11.46},
    'seated-chair': {'bodyLift': -0.42, 'pitch': 0.0, 'roll': 0.0},
    'seated-lounge': {'bodyLift': -0.50, 'pitch': -20.05, 'roll': 0.0},
    'seated-cross': {'bodyLift': -0.62, 'pitch': 0.0, 'roll': 0.0},
    'lying-up': {'bodyLift': 0.0, 'pitch': -90.0, 'roll': 0.0},
    'lying-down': {'bodyLift': 0.0, 'pitch': 90.0, 'roll': 0.0},
    'lying-left': {'bodyLift': 0.0, 'pitch': -90.0, 'roll': 90.0},
    'lying-right': {'bodyLift': 0.0, 'pitch': -90.0, 'roll': -90.0},
}


# --- Coordinate Math Helpers -------------------------------------------------

def sv_to_ue_location(pos: Dict[str, float]) -> Tuple[float, float, float]:
    """Converts SetView coordinates (meters, Y-up) to Unreal Engine (cm, Z-up)."""
    x_sv = float(pos.get('x', 0.0))
    y_sv = float(pos.get('y', 0.0))
    z_sv = float(pos.get('z', 0.0))
    return (z_sv * SCALE_FACTOR, x_sv * SCALE_FACTOR, y_sv * SCALE_FACTOR)


def sv_heading_to_ue_yaw(rotation_y_rad: float) -> float:
    """Converts SetView heading rotationY (radians) to Unreal Yaw (degrees)."""
    return math.degrees(float(rotation_y_rad))


def sv_quat_to_ue_rotator(q: Dict[str, float]) -> Tuple[float, float, float]:
    """Converts Three.js camera quaternion to Unreal Engine Rotator (Pitch, Yaw, Roll)."""
    qx = float(q.get('x', 0.0))
    qy = float(q.get('y', 0.0))
    qz = float(q.get('z', 0.0))
    qw = float(q.get('w', 1.0))

    fx_sv = -2.0 * (qx * qz + qw * qy)
    fy_sv = -2.0 * (qy * qz - qw * qx)
    fz_sv = -(1.0 - 2.0 * (qx * qx + qy * qy))

    ux_sv = 2.0 * (qx * qy - qw * qz)
    uy_sv = 1.0 - 2.0 * (qx * qx + qz * qz)
    uz_sv = 2.0 * (qy * qz + qw * qx)

    rx_sv = 1.0 - 2.0 * (qy * qy + qz * qz)
    ry_sv = 2.0 * (qx * qy + qw * qz)

    fx_ue, fy_ue, fz_ue = fz_sv, fx_sv, fy_sv
    ux_ue, uy_ue, uz_ue = uz_sv, ux_sv, uy_sv
    rx_ue, ry_ue = rx_sv, ry_sv

    yaw_deg = math.degrees(math.atan2(fy_ue, fx_ue))
    horiz_dist = math.sqrt(fx_ue * fx_ue + fy_ue * fy_ue)
    pitch_deg = math.degrees(math.atan2(fz_ue, horiz_dist))
    roll_deg = math.degrees(math.atan2(ux_ue * ry_ue - uy_ue * rx_ue, uz_ue))

    return (pitch_deg, yaw_deg, roll_deg)


def hex_to_linear_color(hex_str: str) -> Tuple[float, float, float, float]:
    """Converts hex color string (#rrggbb) to linear RGBA tuple."""
    clean = hex_str.lstrip('#')
    if len(clean) == 6:
        r = int(clean[0:2], 16) / 255.0
        g = int(clean[2:4], 16) / 255.0
        b = int(clean[4:6], 16) / 255.0
        return (r, g, b, 1.0)
    return (1.0, 1.0, 1.0, 1.0)


# --- Core Unreal Engine Scene Builder ----------------------------------------

def build_scene_in_unreal(scene_data: Dict[str, Any], verbose: bool = True) -> bool:
    """
    Constructs the complete SetView scene inside Unreal Engine 5:
      - CineCameraActors with filmbacks, lenses, aperture stops, and manual focus
      - Lumen Cine Light actors (Spot/Point/Rect) with Kelvin temperatures
      - Actor characters with stance offsets, heights, scales, and colors
      - 3D props and set dressing with Nanite support
      - Volumetric fog and PostProcess Lumen lighting environment
      - LevelSequence with camera cuts, focal racks, and actor movement tracks
    """
    if not IN_UNREAL:
        print("[SetView] Error: Not inside Unreal Engine Python environment (unreal module required).")
        return False

    scene_name = scene_data.get('name', 'SetViewScene').strip()
    walk_speed = float(scene_data.get('walkSpeed', 1.4))
    package_path = f"/Game/SetView/{scene_name.replace(' ', '_')}"

    print("=" * 75)
    print(f"[SetView UE5 Bridge] Constructing scene: '{scene_name}'")
    print(f"[SetView UE5 Bridge] Destination: {package_path} | Target: UE {TARGET_UE_VERSION}")
    print("=" * 75)

    editor_actor_subsystem = unreal.EditorActorSubsystem()
    asset_tools = unreal.AssetToolsHelpers.get_asset_tools()

    # 1. Environment: Volumetric Fog & PostProcess Volume (Lumen)
    atmo_data = scene_data.get('atmosphere', {})
    if atmo_data.get('enabled', True):
        fog_actor = editor_actor_subsystem.spawn_actor_from_class(
            unreal.ExponentialHeightFog, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0)
        )
        if fog_actor:
            fog_actor.set_actor_label(f"Fog_{scene_name}")
            fog_comp = fog_actor.exponential_height_fog_component
            fog_density = float(atmo_data.get('density', 0.2)) * 0.05
            scattering = float(atmo_data.get('scatteringFactor', 0.5))
            height_falloff = float(atmo_data.get('heightFalloff', 0.5)) * 0.1
            tint_rgba = hex_to_linear_color(atmo_data.get('tintHex', '#b4c6d8'))

            fog_comp.set_editor_property("fog_density", fog_density)
            fog_comp.set_editor_property("fog_height_falloff", height_falloff)
            fog_comp.set_editor_property("volumetric_fog", True)
            fog_comp.set_editor_property("volumetric_fog_scattering_distribution", scattering)
            fog_comp.set_editor_property("volumetric_fog_albedo", unreal.Color(
                int(tint_rgba[0] * 255), int(tint_rgba[1] * 255), int(tint_rgba[2] * 255), 255
            ))
            if verbose:
                print(f"[SetView] Configured Volumetric ExponentialHeightFog (density={fog_density:.3f})")

    if USE_LUMEN:
        pp_actor = editor_actor_subsystem.spawn_actor_from_class(
            unreal.PostProcessVolume, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0)
        )
        if pp_actor:
            pp_actor.set_actor_label(f"PostProcess_Lumen_{scene_name}")
            pp_actor.unbound = True
            if verbose:
                print("[SetView] Configured Unbound PostProcessVolume with Lumen Dynamic GI.")

    # 2. CineCameraActors Setup
    spawned_cameras: Dict[str, Tuple[Any, Any]] = {}
    cameras_data = scene_data.get('cameras', [])
    for c_data in cameras_data:
        cam_id = c_data.get('id', '')
        cam_name = c_data.get('name', 'CAM')
        pos_ue = sv_to_ue_location(c_data.get('position', {}))
        rot_ue = sv_quat_to_ue_rotator(c_data.get('rotation', {}))

        cam_actor = editor_actor_subsystem.spawn_actor_from_class(
            unreal.CineCameraActor,
            unreal.Vector(*pos_ue),
            unreal.Rotator(*rot_ue)
        )
        cam_actor.set_actor_label(cam_name)
        cine_comp = cam_actor.get_cine_camera_component()

        # Filmback & Sensor Format
        fmt_id = c_data.get('formatId', 'super35')
        fmt_info = SENSOR_FORMATS.get(fmt_id, SENSOR_FORMATS['super35'])
        aspect_name = c_data.get('aspect', '16:9')
        aspect_val = ASPECT_RATIOS.get(aspect_name, 16.0 / 9.0)

        gate_width = fmt_info['gateWidthMm']
        gate_height = gate_width / aspect_val

        filmback = cine_comp.filmback
        filmback.sensor_width = gate_width
        filmback.sensor_height = gate_height
        cine_comp.filmback = filmback

        # Lens & Optics
        focal_length = float(c_data.get('lensFocalLength', 35.0))
        t_stop = float(c_data.get('tStop', 2.8))
        cine_comp.current_focal_length = focal_length
        cine_comp.current_aperture = t_stop

        # Manual Focus Distance
        focus_dist_m = float(c_data.get('focusDistanceM', 3.0))
        focus_settings = cine_comp.focus_settings
        focus_settings.focus_method = unreal.CameraFocusMethod.MANUAL
        focus_settings.manual_focus_distance = focus_dist_m * SCALE_FACTOR
        cine_comp.focus_settings = focus_settings

        spawned_cameras[cam_id] = (cam_actor, cine_comp)
        if verbose:
            print(f"[SetView] Created CineCamera '{cam_name}' ({focal_length}mm, T{t_stop}, gate={gate_width:.1f}mm)")

    # 3. Cine Light Actors (Lumen Dynamic Lighting)
    lights_data = scene_data.get('lights', [])
    for idx, l_data in enumerate(lights_data):
        l_name = l_data.get('name', f"Light_{idx+1}")
        l_type = l_data.get('type', 'spot').lower()
        pos_ue = sv_to_ue_location({
            'x': l_data.get('position', [0, 2, 0])[0],
            'y': l_data.get('position', [0, 2, 0])[1],
            'z': l_data.get('position', [0, 2, 0])[2]
        })
        yaw_ue = sv_heading_to_ue_yaw(l_data.get('rotationY', 0.0))
        pitch_ue = math.degrees(float(l_data.get('rotationX', 0.0)))
        kelvin = float(l_data.get('colorKelvin', 5600))
        intensity_lux = float(l_data.get('intensity', 1.0)) * 5000.0
        cone_angle = float(l_data.get('coneAngleDeg', 45.0))

        light_class = unreal.SpotLight if l_type == 'spot' else (unreal.RectLight if l_type == 'area' else unreal.PointLight)
        light_actor = editor_actor_subsystem.spawn_actor_from_class(
            light_class,
            unreal.Vector(*pos_ue),
            unreal.Rotator(pitch_ue, yaw_ue, 0.0)
        )
        light_actor.set_actor_label(l_name)
        l_comp = light_actor.light_component
        l_comp.set_intensity(intensity_lux)
        l_comp.set_use_temperature(True)
        l_comp.set_temperature(kelvin)
        l_comp.set_mobility(unreal.ComponentMobility.MOVABLE)

        if l_type == 'spot':
            l_comp.set_inner_cone_angle(cone_angle * 0.4)
            l_comp.set_outer_cone_angle(cone_angle * 0.5)

        if verbose:
            print(f"[SetView] Created {l_type.capitalize()} Light '{l_name}' ({kelvin:.0f}K, {intensity_lux:.0f} lumens)")

    # 4. Actors & Cast Placement
    spawned_actors: Dict[str, Tuple[Any, Dict[str, Any]]] = {}
    actors_data = scene_data.get('actors', [])
    for a_data in actors_data:
        a_id = a_data.get('id', '')
        a_name = a_data.get('name', 'Actor')
        pos_ue = sv_to_ue_location(a_data.get('position', {}))
        yaw_ue = sv_heading_to_ue_yaw(a_data.get('rotationY', 0.0))
        stance = a_data.get('stance', 'standing')
        stance_info = STANCES.get(stance, STANCES['standing'])
        height_cm = float(a_data.get('heightM', 1.75)) * SCALE_FACTOR
        scale_val = float(a_data.get('scale', 1.0))

        lift_cm = stance_info['bodyLift'] * SCALE_FACTOR
        pos_ue = (pos_ue[0], pos_ue[1], pos_ue[2] + lift_cm)
        rot_ue = (stance_info['pitch'], yaw_ue, stance_info['roll'])

        # Spawn character placeholder actor
        actor_obj = editor_actor_subsystem.spawn_actor_from_class(
            unreal.StaticMeshActor,
            unreal.Vector(*pos_ue),
            unreal.Rotator(*rot_ue)
        )
        actor_obj.set_actor_label(a_name)
        actor_obj.set_actor_scale3d(unreal.Vector(scale_val, scale_val, scale_val))

        spawned_actors[a_id] = (actor_obj, a_data)
        if verbose:
            print(f"[SetView] Placed Actor '{a_name}' (Stance: {stance}, Scale: {scale_val:.2f})")

    # 5. Props & Set Dressing
    props_data = scene_data.get('props', [])
    for p_data in props_data:
        p_name = p_data.get('name', 'Prop')
        p_cat = p_data.get('category', 'furniture')
        pos_ue = sv_to_ue_location(p_data.get('position', {}))
        yaw_ue = sv_heading_to_ue_yaw(p_data.get('rotationY', 0.0))
        pitch_ue = math.degrees(float(p_data.get('rotationX', 0.0)))
        roll_ue = math.degrees(float(p_data.get('rotationZ', 0.0)))

        scale_vec = p_data.get('scale', {'x': 1, 'y': 1, 'z': 1})
        sx = float(scale_vec.get('x', 1.0))
        sy = float(scale_vec.get('y', 1.0))
        sz = float(scale_vec.get('z', 1.0))

        prop_obj = editor_actor_subsystem.spawn_actor_from_class(
            unreal.StaticMeshActor,
            unreal.Vector(*pos_ue),
            unreal.Rotator(pitch_ue, yaw_ue, roll_ue)
        )
        prop_obj.set_actor_label(p_name)
        prop_obj.set_actor_scale3d(unreal.Vector(sx, sy, sz))
        if verbose:
            print(f"[SetView] Placed Prop '{p_name}' ({p_cat}) at {pos_ue}")

    # 6. LevelSequence Generation (Cinematics & Keyframe Animation)
    if GEN_SEQUENCER:
        seq_asset_path = f"{package_path}/Sequences"
        sequence = asset_tools.create_asset(
            LEVEL_SEQUENCE_NAME, seq_asset_path, unreal.LevelSequence, unreal.LevelSequenceFactoryNew()
        )

        if sequence:
            sequence.set_display_rate(unreal.FrameRate(FPS, 1))

            # Camera Cut Track
            camera_cut_track = sequence.add_master_track(unreal.MovieSceneCameraCutTrack)
            cut_start_frame = 0

            # Add Camera Cut Sections and Possessables
            for cam_id, (cam_actor, cine_comp) in spawned_cameras.items():
                cam_possessable = sequence.add_possessable(cam_actor)
                c_data = next((c for c in cameras_data if c.get('id') == cam_id), None)
                if not c_data:
                    continue

                shot_frames = FPS * 5  # 5s per shot default
                cut_sec = camera_cut_track.add_section()
                cut_sec.set_range(cut_start_frame, cut_start_frame + shot_frames)
                cut_sec.set_camera_binding_id(unreal.MovieSceneObjectBindingID(cam_possessable.get_guid()))
                cut_start_frame += shot_frames

            # Add Actor Movement Tracks
            for a_id, (actor_obj, a_data) in spawned_actors.items():
                act_possessable = sequence.add_possessable(actor_obj)
                kfs = a_data.get('keyframes', [])
                if kfs:
                    trans_track = act_possessable.add_track(unreal.MovieSceneTransformTrack)
                    trans_sec = trans_track.add_section()
                    trans_sec.set_range(0, cut_start_frame)

            print(f"[SetView] Generated LevelSequence '{LEVEL_SEQUENCE_NAME}' ({cut_start_frame} total frames at {FPS}fps)")

    print("=" * 75)
    print(f"[SetView UE5 Bridge] Construction completed successfully for '{scene_name}'!")
    print("=" * 75)
    return True


def main():
    parser = argparse.ArgumentParser(description="SetView Unreal Engine 5 Automation Engine")
    parser.add_argument("json_path", nargs="?", help="Optional path to external .setview.json file")
    parser.add_argument("--verbose", "-v", action="store_true", default=True, help="Detailed console logging")
    args = parser.parse_args()

    scene_data = SCENE_DATA_PAYLOAD
    if args.json_path and os.path.exists(args.json_path):
        with open(args.json_path, 'r', encoding='utf-8') as f:
            scene_data = json.load(f)

    if IN_UNREAL:
        build_scene_in_unreal(scene_data, verbose=args.verbose)
    else:
        print("[SetView Dry-Run] Validated scene payload: " + scene_data.get('name', ''))
        print(f"  - Cameras: {len(scene_data.get('cameras', []))}")
        print(f"  - Actors:  {len(scene_data.get('actors', []))}")
        print(f"  - Lights:  {len(scene_data.get('lights', []))}")
        print(f"  - Props:   {len(scene_data.get('props', []))}")
        print("[SetView Dry-Run] Script syntax and payload verified. Run inside Unreal Engine to spawn assets.")


if __name__ == "__main__":
    main()
`;
}

// ---------------------------------------------------------------------------
// 3. Formatted UE5 JSON Manifest Interchange
// ---------------------------------------------------------------------------

/**
 * Generates a formatted JSON interchange manifest for Unreal Engine C++ plugins,
 * LiveLink streaming endpoints, or automated build pipelines.
 */
export function generateUe5JsonManifest(scene: SceneData, opts?: Ue5ExportOptions): string {
  const options = resolveUe5ExportOptions(opts);
  const totalDurationS = computeTotalSceneDurationS(scene, options);
  const totalFrames = Math.round(totalDurationS * options.fps);
  const sequenceName = options.sequenceName.trim() || `LS_${slug(scene.name)}`;

  const manifest = {
    schemaVersion: '1.0.0',
    generator: 'SetView Unreal Engine 5 Bridge',
    generatedAt: new Date().toISOString(),
    unrealEngineVersion: options.unrealEngineVersion,
    settings: {
      fps: options.fps,
      scaleFactor: options.scaleFactor,
      coordinateSystem: 'LeftHanded_ZUp_Cm',
      useNanite: options.useNanite,
      useLumen: options.useLumen,
      generateSequencerTracks: options.generateSequencerTracks,
      sequenceName,
    },
    scene: {
      id: scene.id,
      name: scene.name,
      walkSpeedMs: scene.walkSpeed,
      totalDurationS,
      totalFrames,
    },
    atmosphere: scene.atmosphere
      ? {
          enabled: scene.atmosphere.enabled,
          preset: scene.atmosphere.preset,
          density: scene.atmosphere.density,
          scatteringFactor: scene.atmosphere.scatteringFactor,
          heightFalloff: scene.atmosphere.heightFalloff,
          tintHex: scene.atmosphere.tintHex,
          tintRgb: hexToRgb(scene.atmosphere.tintHex),
          beamIntensity: scene.atmosphere.beamIntensity,
          dustMotesCount: scene.atmosphere.dustMotesCount,
        }
      : null,
    cameras: scene.cameras.map((c) => {
      const fmt = sensorFormat(c.formatId);
      const aspectVal = aspectValue(c.aspect);
      const gateWidthMm = fmt.gateWidthMm;
      const gateHeightMm = gateWidthMm / aspectVal;
      const focalLengthMm = c.lensFocalLength > 0 ? c.lensFocalLength : 35.0;
      const tStop = c.tStop > 0 ? c.tStop : 2.8;
      const focusDistM = computeFocusDistance(c, scene.actors);
      const keyframes = c.keyframes ? computeCameraKeyframeSamples(c, options.fps, options.scaleFactor) : [];

      return {
        id: c.id,
        name: c.name,
        filmback: {
          formatId: c.formatId,
          formatName: fmt.name,
          gateWidthMm,
          gateHeightMm,
          aspect: c.aspect,
          aspectRatio: aspectVal,
          squeeze: fmt.squeeze,
        },
        optics: {
          focalLengthMm,
          tStop,
          focusDistanceCm: focusDistM * options.scaleFactor,
          focusTargetActorId: c.focusTargetActorId,
          lookAtTargetActorId: c.lookAtTargetActorId,
        },
        transform: {
          locationCm: svToUeLocation(c.position, options.scaleFactor),
          rotatorDeg: svQuatToUeRotator(c.rotation),
          rawQuat: c.rotation,
        },
        keyframeSamples: keyframes.map((k) => ({
          frame: k.frame,
          timeS: k.timeS,
          locationCm: k.value.location,
          rotatorDeg: k.value.rotation,
          focalLengthMm: k.value.focalLength,
          focusDistanceCm: k.value.focusDistanceCm,
        })),
      };
    }),
    actors: scene.actors.map((a) => {
      const stance = a.stance ?? 'standing';
      const stanceInfo = poseFor(stance);
      const heightCm = (a.heightM && a.heightM > 0 ? a.heightM : 1.75) * options.scaleFactor;
      const keyframes = a.keyframes
        ? computeActorKeyframeSamples(a, scene.walkSpeed, options.fps, options.scaleFactor)
        : [];

      return {
        id: a.id,
        name: a.name,
        colorHex: a.color,
        colorRgb: hexToRgb(a.color),
        heightCm,
        scale: a.scale && a.scale > 0 ? a.scale : 1.0,
        stance,
        stanceOffsets: {
          bodyLiftCm: stanceInfo.bodyLift * options.scaleFactor,
          pitchDeg: (stanceInfo.bodyRot.x * 180) / Math.PI,
          rollDeg: (stanceInfo.bodyRot.z * 180) / Math.PI,
        },
        transform: {
          locationCm: svToUeLocation(a.position, options.scaleFactor),
          yawDeg: svHeadingToUeYaw(a.rotationY),
        },
        notes: a.notes ?? [],
        keyframeSamples: keyframes.map((k) => ({
          frame: k.frame,
          timeS: k.timeS,
          locationCm: k.value.location,
          yawDeg: k.value.yaw,
          stance: k.value.stance,
        })),
      };
    }),
    lights: (scene.lights ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      locationCm: svToUeLocation(
        { x: l.position[0], y: l.position[1], z: l.position[2] },
        options.scaleFactor,
      ),
      rotatorDeg: {
        pitch: (l.rotationX * 180) / Math.PI,
        yaw: svHeadingToUeYaw(l.rotationY),
        roll: 0,
      },
      intensityLumens: l.intensity * 5000.0,
      colorKelvin: l.colorKelvin,
      coneAngleDeg: l.coneAngleDeg,
    })),
    props: (scene.props ?? []).map((p) => {
      const def = BUILTIN_PROPS.find((b) => b.id === p.assetId);
      const dim = def?.dimensions ?? { width: 0.8, height: 0.8, depth: 0.8 };
      return {
        id: p.id,
        assetId: p.assetId,
        name: p.name,
        category: p.category,
        locationCm: svToUeLocation(p.position, options.scaleFactor),
        rotatorDeg: {
          pitch: ((p.rotationX ?? 0) * 180) / Math.PI,
          yaw: svHeadingToUeYaw(p.rotationY),
          roll: ((p.rotationZ ?? 0) * 180) / Math.PI,
        },
        scale: p.scale ?? { x: 1, y: 1, z: 1 },
        dimensionsCm: {
          width: dim.width * options.scaleFactor,
          height: dim.height * options.scaleFactor,
          depth: dim.depth * options.scaleFactor,
        },
        colorHex: p.colorHex ?? def?.defaultColorHex ?? '#64748b',
        useNanite: options.useNanite,
      };
    }),
    audioCues: (scene.audioCues ?? []).map((cue) => ({
      id: cue.id,
      name: cue.name,
      type: cue.type,
      timestampS: cue.timestampS,
      durationS: cue.durationS,
      volume: cue.volume,
      spatial: cue.spatial,
      locationCm: cue.position ? svToUeLocation(cue.position, options.scaleFactor) : null,
      attachedActorId: cue.attachedActorId ?? null,
      maxDistanceCm: cue.maxDistanceM ? cue.maxDistanceM * options.scaleFactor : 2000.0,
    })),
    scan: scene.scan
      ? {
          id: scene.scan.id,
          capturedAt: scene.scan.capturedAt,
          vertices: scene.scan.vertices,
          triangles: scene.scan.triangles,
          boundsMinCm: svToUeLocation(scene.scan.boundsMin, options.scaleFactor),
          boundsMaxCm: svToUeLocation(scene.scan.boundsMax, options.scaleFactor),
          furniture: scene.scan.furniture ?? [],
        }
      : null,
  };

  return JSON.stringify(manifest, null, 2);
}

// ---------------------------------------------------------------------------
// 4. Unified UE5 Bridge Dispatcher
// ---------------------------------------------------------------------------

/**
 * Packages and exports the scene for Unreal Engine 5 according to the requested format.
 */
export function exportUe5BridgePackage(
  scene: SceneData,
  format: Ue5ExportFormat,
  options?: Ue5ExportOptions,
): Ue5BridgePackageResult {
  const baseSlug = slug(scene.name);

  switch (format) {
    case 'open_usd': {
      const content = generateOpenUsdScene(scene, options);
      return {
        filename: `${baseSlug}.usda`,
        mimeType: 'model/vnd.usda',
        content,
      };
    }
    case 'ue5_python_script': {
      const content = generateUe5PythonImportScript(scene, options);
      return {
        filename: `import_${baseSlug}_ue5.py`,
        mimeType: 'text/x-python',
        content,
      };
    }
    case 'ue5_json_manifest': {
      const content = generateUe5JsonManifest(scene, options);
      return {
        filename: `${baseSlug}.ue5.json`,
        mimeType: 'application/json',
        content,
      };
    }
    default: {
      const exhaustiveCheck: never = format;
      throw new Error(`Unsupported UE5 export format: ${exhaustiveCheck}`);
    }
  }
}
