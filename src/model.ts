// ---------------------------------------------------------------------------
// SetView scene data model — PURE DATA, no three.js, no DOM.
// This file (with lens.ts and timeline.ts) is the portable domain core that
// maps 1:1 onto plain C# classes for the planned Unity port.
//
// Conventions:
//  - All positions are meters, in "scene space": the world space of the AR
//    reference space (local-floor) at authoring time. y = 0 is the floor.
//  - rotationY is a heading in radians around +Y; 0 faces +Z.
// ---------------------------------------------------------------------------

import { DEFAULT_STANCE, isStanceId, type StanceId } from './pose.ts';
import {
  type AudioCueData,
  createAudioCue,
  isAudioCueData,
  normalizeAudioCue,
} from './audioCues.ts';
import {
  type PropData,
  createPropData,
  duplicatePropData,
  isPropData,
  normalizePropData,
} from './props.ts';
import {
  type AtmosphereConfig,
  type AtmospherePreset,
  ATMOSPHERE_PRESETS,
  calculateBeamLuminance,
  calculateVolumetricAttenuation,
  createAtmosphereConfig,
  isAtmosphereConfig,
  normalizeAtmosphereConfig,
} from './atmosphere.ts';
import {
  type ArchitecturalSet,
  type DoorData,
  type DoorType,
  type WallBoundingBox,
  type WallData,
  type WallFinishPreset,
  type WallFinishType,
  type WallOpeningBounds,
  type WallPolygon,
  type WindowData,
  type WindowType,
  type WindowTypeDefinition,
  type DoorTypeDefinition,
  DEFAULT_DOOR_TYPES,
  DEFAULT_WINDOW_TYPES,
  WALL_FINISH_PRESETS,
  calculateDoorOpening,
  calculateWallBoundingBox,
  calculateWallPolygon,
  calculateWindowOpening,
  createArchitecturalSet,
  createDoorData,
  createWallData,
  createWindowData,
  isArchitecturalSet,
  isDoorData,
  isWallData,
  isWindowData,
  normalizeArchitecturalSet,
  normalizeDoorData,
  normalizeWallData,
  normalizeWindowData,
} from './architecture.ts';
import {
  type LiveLinkCameraFrame,
  type LiveLinkConfig,
  type LiveLinkConnectionState,
  type LiveLinkProtocolMode,
  type LiveLinkSubjectType,
  type TallyState,
  type VcamCommand,
  type VcamInboundMessage,
  type VcamSmoothingPreset,
  VCAM_SMOOTHING_PRESETS,
  createLiveLinkConfig,
  isLiveLinkCameraFrame,
  isLiveLinkConfig,
  normalizeLiveLinkConfig,
} from './livelink.ts';
import {
  type GripDynamicsResult,
  type GripRigConfig,
  type GripRigType,
  type LensOpticalProfile,
  type LensSeriesType,
  STOCK_GRIP_RIGS,
  STOCK_LENS_PROFILES,
  calculateBokehShape,
  calculateLensBreathingFocalLength,
  calculateOpticalVignetting,
  createGripRigConfig,
  createLensProfile,
  isGripRigConfig,
  isLensProfile,
  normalizeGripRigConfig,
  normalizeLensProfile,
  simulateGripRigDynamics,
} from './cameraGrip.ts';
import {
  type GaussianCloudData,
  type GaussianSplat,
  type PlaneRansacResult,
  type SplatAlignmentResult,
  alignSplatCloudToFloorplan,
  calculateCloudBoundingBox,
  createGaussianCloud,
  detectHorizontalPlanes,
  exportCompactSplat,
  exportGaussianPly,
  fitArchitecturalPlanesFromSplats,
  generateSyntheticScoutSplatCloud,
  isGaussianCloud,
  isGaussianSplat,
  normalizeGaussianCloud,
  parseCompactSplat,
  parseGaussianPly,
  voxelDownsampleSplats,
} from './gaussianSplat.ts';
import {
  type DmxBridgeConfig,
  type DmxChannelMapping,
  type DmxChannelParameter,
  type DmxCue,
  type DmxFixtureProfile,
  type DmxPatchEntry,
  type DmxProtocol,
  DMX_FIXTURE_PROFILES,
  createDmxBridgeConfig,
  createDmxCue,
  createDmxPatchEntry,
  decodeArtDmxPacket,
  decodeSacnPacket,
  encodeArtDmxPacket,
  encodeSacnPacket,
  exportDmxPatchListCsv,
  findFixtureProfile,
  hexToRgb,
  isDmxBridgeConfig,
  isDmxCue,
  isDmxPatchEntry,
  kelvinToRgbDmx,
  mapDmxChannelsToLight,
  mapLightToDmxChannels,
  normalizeDmxBridgeConfig,
  normalizeDmxCue,
  normalizeDmxPatchEntry,
  rgbToHex,
  rgbToKelvinDmx,
} from './dmxEngine.ts';
import {
  type InnerFrustumBounds,
  type LedPanelType,
  type LedVolumeConfig,
  type LedVolumePresetId,
  type LedVolumeWall,
  type MoireAnalysisResult,
  type MoireRiskLevel,
  STOCK_LED_VOLUMES,
  calculateInnerFrustumIntersection,
  calculateMoireRisk,
  createLedVolumeConfig,
  createLedVolumeWall,
  generateNDisplayConfigXml,
  generateOpenUsdLedVolume,
  isLedVolumeConfig,
  isLedVolumeWall,
  normalizeLedVolumeConfig,
  normalizeLedVolumeWall,
} from './icvfxEngine.ts';
import {
  type AcousticsConfig,
  type BoomIncursionAlert,
  type BoomMicEntity,
  type BoomPoleConfig,
  type LavalierMicEntity,
  type MaterialAcousticAbsorption,
  type MicCapsuleProfile,
  type MicPolarPattern,
  type MicSignalSample,
  type RoomAcousticsMetrics,
  type SoundSourceEntity,
  CURATED_MIC_PROFILES,
  MATERIAL_ABSORPTION_TABLE,
  STOCK_ACOUSTICS_PRESETS,
  type StockAcousticsPresetId,
  calculateBoomFrameIncursion,
  calculateCriticalDistance,
  calculatePolarAttenuation,
  calculateRt60Reverberation,
  calculateSpeechClarityC50,
  calculateSplAndSnr,
  createAcousticsConfig,
  createBoomMicEntity,
  createLavalierMicEntity,
  generateAes31IxmlManifest,
  generateBwfSoundReportCsv,
  isAcousticsConfig,
  isBoomMicEntity,
  isLavalierMicEntity,
  normalizeAcousticsConfig,
  normalizeBoomMicEntity,
  normalizeLavalierMicEntity,
} from './acousticsEngine.ts';
import {
  type CuratedFilmingLocation,
  type GeoLocation,
  type SolarDate,
  type SolarEnvironmentConfig,
  type SolarEphemerisResult,
  type SolarPhase,
  type SolarPreset,
  type SolarTrackingEntry,
  type WeatherConditions,
  CURATED_FILMING_LOCATIONS,
  SOLAR_PRESETS,
  calculateRayleighMieColor,
  calculateSolarEphemeris,
  calculateSolarIlluminance,
  createSolarEnvironmentConfig,
  generateDpSunReportHtml,
  generateSolarPathPoints,
  generateSolarTrackingTable,
  generateSolarTrackingTableCsv,
  isSolarEnvironmentConfig,
  kelvinToRgb,
  normalizeSolarEnvironmentConfig,
} from './solarEngine.ts';
import {
  type ActionBeat,
  type CameraAxisSide,
  type CoverageAuditReport,
  type DialogueBlock,
  type EyelineMatchAnalysis,
  type LineOfActionAnalysis,
  type MinimalActorEntity,
  type MinimalCameraEntity,
  type ParsedScene,
  type ParsedScreenplay,
  type ScreenplayConfig,
  type ScriptElement,
  type ScriptElementType,
  type ScriptFormat,
  type ShotCoverageRecommendation,
  type ShotType,
  DEFAULT_SAMPLE_FOUNTAIN_SCRIPT,
  auditSceneContinuity,
  calculateSignedDistanceToLine,
  calculateWordCountAndDuration,
  check180LineOfActionPair,
  checkEyelineMatch,
  countWords,
  createScreenplayConfig,
  generateAutoShotCoverage,
  generateDirectorDeckHtml,
  generateScreenplayShotListCsv,
  isScreenplayConfig,
  normalizeScreenplayConfig,
  parseFdxScript,
  parseFountainScript,
} from './screenplayEngine.ts';
import {
  type FrameTelemetrySample,
  type MockXRAxesState,
  type MockXRButtonState,
  type MockXRController,
  type MockXRHandedness,
  type MockXRHeadset,
  type MockXRSessionState,
  type MockXRTransform,
  type SyntheticVRKeyframeAction,
  type SyntheticVRScenario,
  type VRBenchmarkReport,
  type VRPerformanceThresholds,
  type VRProfilerConfig,
  SYNTHETIC_VR_SCENARIOS,
  calculateBenchmarkSummary,
  createDefaultVRThresholds,
  createMockXRButtonState,
  createMockXRController,
  createMockXRHeadset,
  createMockXRSessionState,
  createMockXRTransform,
  createSyntheticVRScenario,
  createVRProfilerConfig,
  generatePerformanceReportCsv,
  generatePerformanceReportHtml,
  interpolateSyntheticScenarioFrame,
  isVRProfilerConfig,
  normalizeVRProfilerConfig,
} from './webxrProfilerEngine.ts';
import {
  type ComfortAuditReport,
  type ComfortDiscomfortIncident,
  type ComfortLocomotionMode,
  type ErgonomicReachTarget,
  type FOVComfortVignetteConfig,
  type NeckStrainEvaluation,
  type NeckStrainSeverity,
  type ReachEvaluation,
  type ReachZoneClassification,
  type VestibularStateSample,
  type VRComfortConfig,
  auditSceneComfort,
  calculateCybersicknessIndex,
  calculateDynamicComfortVignetteRadius,
  calculateVestibularKinematics,
  createDefaultComfortConfig,
  createDefaultVignetteConfig,
  createVRComfortConfig,
  evaluateNeckStrain,
  evaluateReachability,
  generateComfortReportCsv,
  generateComfortReportHtml,
  isVRComfortConfig,
  normalizeVRComfortConfig,
} from './comfortEngine.ts';
import {
  type BoundingBox3D,
  type GeminiAiConfig,
  type GeminiAiSceneMutation,
  type GenerativeScatterConfig,
  type ScatterDensity,
  type ScatterItemTemplate,
  type ScatterRegion,
  type ScatterSurfaceType,
  type ScatterTheme,
  type SetDressingConfig,
  type SetDressingManifest,
  type SettledPropItem,
  THEME_PROP_CATALOGS,
  applyAiMutationsToScene,
  buildGeminiAiSystemPrompt,
  createDefaultAiConfig,
  createDefaultScatterConfig,
  createMulberry32,
  createSetDressingConfig,
  detectSemanticRegions,
  generatePoissonScatter2D,
  generateSetDressingDeckHtml,
  generateSetDressingManifestCsv,
  generateThemeScatter,
  isSetDressingConfig,
  normalizeSetDressingConfig,
  parseDeterministicNlCommand,
  parseGeminiAiResponse,
  simulatePhysicsImpulseSettling,
} from './setDressingEngine.ts';

export {
  type ComfortAuditReport,
  type ComfortDiscomfortIncident,
  type ComfortLocomotionMode,
  type ErgonomicReachTarget,
  type FOVComfortVignetteConfig,
  type NeckStrainEvaluation,
  type NeckStrainSeverity,
  type ReachEvaluation,
  type ReachZoneClassification,
  type VestibularStateSample,
  type VRComfortConfig,
  auditSceneComfort,
  calculateCybersicknessIndex,
  calculateDynamicComfortVignetteRadius,
  calculateVestibularKinematics,
  createDefaultComfortConfig,
  createDefaultVignetteConfig,
  createVRComfortConfig,
  evaluateNeckStrain,
  evaluateReachability,
  generateComfortReportCsv,
  generateComfortReportHtml,
  isVRComfortConfig,
  normalizeVRComfortConfig,
};

export {
  type BoundingBox3D,
  type GeminiAiConfig,
  type GeminiAiSceneMutation,
  type GenerativeScatterConfig,
  type ScatterDensity,
  type ScatterItemTemplate,
  type ScatterRegion,
  type ScatterSurfaceType,
  type ScatterTheme,
  type SetDressingConfig,
  type SetDressingManifest,
  type SettledPropItem,
  THEME_PROP_CATALOGS,
  applyAiMutationsToScene,
  buildGeminiAiSystemPrompt,
  createDefaultAiConfig,
  createDefaultScatterConfig,
  createMulberry32,
  createSetDressingConfig,
  detectSemanticRegions,
  generatePoissonScatter2D,
  generateSetDressingDeckHtml,
  generateSetDressingManifestCsv,
  generateThemeScatter,
  isSetDressingConfig,
  normalizeSetDressingConfig,
  parseDeterministicNlCommand,
  parseGeminiAiResponse,
  simulatePhysicsImpulseSettling,
};


export {
  type FrameTelemetrySample,
  type MockXRAxesState,
  type MockXRButtonState,
  type MockXRController,
  type MockXRHandedness,
  type MockXRHeadset,
  type MockXRSessionState,
  type MockXRTransform,
  type SyntheticVRKeyframeAction,
  type SyntheticVRScenario,
  type VRBenchmarkReport,
  type VRPerformanceThresholds,
  type VRProfilerConfig,
  SYNTHETIC_VR_SCENARIOS,
  calculateBenchmarkSummary,
  createDefaultVRThresholds,
  createMockXRButtonState,
  createMockXRController,
  createMockXRHeadset,
  createMockXRSessionState,
  createMockXRTransform,
  createSyntheticVRScenario,
  createVRProfilerConfig,
  generatePerformanceReportCsv,
  generatePerformanceReportHtml,
  interpolateSyntheticScenarioFrame,
  isVRProfilerConfig,
  normalizeVRProfilerConfig,
};
export {
  type ActionBeat,
  type CameraAxisSide,
  type CoverageAuditReport,
  type DialogueBlock,
  type EyelineMatchAnalysis,
  type LineOfActionAnalysis,
  type MinimalActorEntity,
  type MinimalCameraEntity,
  type ParsedScene,
  type ParsedScreenplay,
  type ScreenplayConfig,
  type ScriptElement,
  type ScriptElementType,
  type ScriptFormat,
  type ShotCoverageRecommendation,
  type ShotType,
  DEFAULT_SAMPLE_FOUNTAIN_SCRIPT,
  auditSceneContinuity,
  calculateSignedDistanceToLine,
  calculateWordCountAndDuration,
  check180LineOfActionPair,
  checkEyelineMatch,
  countWords,
  createScreenplayConfig,
  generateAutoShotCoverage,
  generateDirectorDeckHtml,
  generateScreenplayShotListCsv,
  isScreenplayConfig,
  normalizeScreenplayConfig,
  parseFdxScript,
  parseFountainScript,
};
export {
  type CuratedFilmingLocation,
  type GeoLocation,
  type SolarDate,
  type SolarEnvironmentConfig,
  type SolarEphemerisResult,
  type SolarPhase,
  type SolarPreset,
  type SolarTrackingEntry,
  type WeatherConditions,
  CURATED_FILMING_LOCATIONS,
  SOLAR_PRESETS,
  calculateRayleighMieColor,
  calculateSolarEphemeris,
  calculateSolarIlluminance,
  createSolarEnvironmentConfig,
  generateDpSunReportHtml,
  generateSolarPathPoints,
  generateSolarTrackingTable,
  generateSolarTrackingTableCsv,
  isSolarEnvironmentConfig,
  kelvinToRgb,
  normalizeSolarEnvironmentConfig,
};
export {
  type AcousticsConfig,
  type BoomIncursionAlert,
  type BoomMicEntity,
  type BoomPoleConfig,
  type LavalierMicEntity,
  type MaterialAcousticAbsorption,
  type MicCapsuleProfile,
  type MicPolarPattern,
  type MicSignalSample,
  type RoomAcousticsMetrics,
  type SoundSourceEntity,
  CURATED_MIC_PROFILES,
  MATERIAL_ABSORPTION_TABLE,
  STOCK_ACOUSTICS_PRESETS,
  type StockAcousticsPresetId,
  calculateBoomFrameIncursion,
  calculateCriticalDistance,
  calculatePolarAttenuation,
  calculateRt60Reverberation,
  calculateSpeechClarityC50,
  calculateSplAndSnr,
  createAcousticsConfig,
  createBoomMicEntity,
  createLavalierMicEntity,
  generateAes31IxmlManifest,
  generateBwfSoundReportCsv,
  isAcousticsConfig,
  isBoomMicEntity,
  isLavalierMicEntity,
  normalizeAcousticsConfig,
  normalizeBoomMicEntity,
  normalizeLavalierMicEntity,
  type AudioCueData,
  createAudioCue,
  isAudioCueData,
  normalizeAudioCue,
  type PropData,
  createPropData,
  duplicatePropData,
  isPropData,
  normalizePropData,
  type AtmosphereConfig,
  type AtmospherePreset,
  ATMOSPHERE_PRESETS,
  calculateBeamLuminance,
  calculateVolumetricAttenuation,
  createAtmosphereConfig,
  isAtmosphereConfig,
  normalizeAtmosphereConfig,
  type ArchitecturalSet,
  type DoorData,
  type DoorType,
  type WallBoundingBox,
  type WallData,
  type WallFinishPreset,
  type WallFinishType,
  type WallOpeningBounds,
  type WallPolygon,
  type WindowData,
  type WindowType,
  type WindowTypeDefinition,
  type DoorTypeDefinition,
  DEFAULT_DOOR_TYPES,
  DEFAULT_WINDOW_TYPES,
  WALL_FINISH_PRESETS,
  calculateDoorOpening,
  calculateWallBoundingBox,
  calculateWallPolygon,
  calculateWindowOpening,
  createArchitecturalSet,
  createDoorData,
  createWallData,
  createWindowData,
  isArchitecturalSet,
  isDoorData,
  isWallData,
  isWindowData,
  normalizeArchitecturalSet,
  normalizeDoorData,
  normalizeWallData,
  normalizeWindowData,
  type LiveLinkCameraFrame,
  type LiveLinkConfig,
  type LiveLinkConnectionState,
  type LiveLinkProtocolMode,
  type LiveLinkSubjectType,
  type TallyState,
  type VcamCommand,
  type VcamInboundMessage,
  type VcamSmoothingPreset,
  VCAM_SMOOTHING_PRESETS,
  createLiveLinkConfig,
  isLiveLinkCameraFrame,
  isLiveLinkConfig,
  normalizeLiveLinkConfig,
  type GripDynamicsResult,
  type GripRigConfig,
  type GripRigType,
  type LensOpticalProfile,
  type LensSeriesType,
  STOCK_GRIP_RIGS,
  STOCK_LENS_PROFILES,
  calculateBokehShape,
  calculateLensBreathingFocalLength,
  calculateOpticalVignetting,
  createGripRigConfig,
  createLensProfile,
  isGripRigConfig,
  isLensProfile,
  normalizeGripRigConfig,
  normalizeLensProfile,
  simulateGripRigDynamics,
  type GaussianCloudData,
  type GaussianSplat,
  type PlaneRansacResult,
  type SplatAlignmentResult,
  alignSplatCloudToFloorplan,
  calculateCloudBoundingBox,
  createGaussianCloud,
  detectHorizontalPlanes,
  exportCompactSplat,
  exportGaussianPly,
  fitArchitecturalPlanesFromSplats,
  generateSyntheticScoutSplatCloud,
  isGaussianCloud,
  isGaussianSplat,
  normalizeGaussianCloud,
  parseCompactSplat,
  parseGaussianPly,
  voxelDownsampleSplats,
  type DmxBridgeConfig,
  type DmxChannelMapping,
  type DmxChannelParameter,
  type DmxCue,
  type DmxFixtureProfile,
  type DmxPatchEntry,
  type DmxProtocol,
  DMX_FIXTURE_PROFILES,
  createDmxBridgeConfig,
  createDmxCue,
  createDmxPatchEntry,
  decodeArtDmxPacket,
  decodeSacnPacket,
  encodeArtDmxPacket,
  encodeSacnPacket,
  exportDmxPatchListCsv,
  findFixtureProfile,
  hexToRgb,
  isDmxBridgeConfig,
  isDmxCue,
  isDmxPatchEntry,
  kelvinToRgbDmx,
  mapDmxChannelsToLight,
  mapLightToDmxChannels,
  normalizeDmxBridgeConfig,
  normalizeDmxCue,
  normalizeDmxPatchEntry,
  rgbToHex,
  rgbToKelvinDmx,
  type InnerFrustumBounds,
  type LedPanelType,
  type LedVolumeConfig,
  type LedVolumePresetId,
  type LedVolumeWall,
  type MoireAnalysisResult,
  type MoireRiskLevel,
  STOCK_LED_VOLUMES,
  calculateInnerFrustumIntersection,
  calculateMoireRisk,
  createLedVolumeConfig,
  createLedVolumeWall,
  generateNDisplayConfigXml,
  generateOpenUsdLedVolume,
  isLedVolumeConfig,
  isLedVolumeWall,
  normalizeLedVolumeConfig,
  normalizeLedVolumeWall,
};

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** One stored blocking mark for an actor. */
export interface TransformKeyframe {
  /** Feet point on the floor, scene space, meters. */
  position: Vec3;
  /** Facing at this mark, radians around +Y. */
  rotationY: number;
  /**
   * Pose held AT this mark (stamped from the actor's stance at capture).
   * Absent (legacy marks) = fall back to the actor's rest stance. The actor
   * always walks upright between marks regardless.
   */
  stance?: StanceId;
}

export type NoteKind = 'dialogue' | 'action';

export interface ActorNote {
  id: string;
  kind: NoteKind;
  text: string;
  createdAt: number;
}

export type ActorRigType = 'stylized_mannequin' | 'realistic_humanoid' | 'custom_gltf';

export interface ActorData {
  id: string;
  name: string;
  /** '#rrggbb' */
  color: string;
  /** Current (rest) position — feet on floor. */
  position: Vec3;
  rotationY: number;
  keyframes: TransformKeyframe[];
  notes: ActorNote[];
  /** Body pose held at rest (see pose.ts). Absent = 'standing'. */
  stance?: StanceId;
  /** Height in meters (e.g. 1.75m). */
  heightM?: number;
  /** Overall mesh scale multiplier (default 1.0, range 0.2 to 3.0). */
  scale: number;
  /** Rig aesthetic & geometry type */
  rigType?: ActorRigType;
  /** Active stock animation clip name (e.g. 'idle_breathing', 'walk_cycle') */
  animationClip?: string;
  /** Animation playback rate multiplier (default 1.0, range 0.1 to 5.0) */
  animationSpeed?: number;
  /** Custom BVH motion capture clip data */
  customMocap?: import('./characterRig.ts').AnimationClipData;
  /** Entity ID of target actor to look towards with Look-At IK */
  lookAtTargetActorId?: string;
  /** Entity ID of target camera to look towards with Look-At IK */
  lookAtTargetCameraId?: string;
  /** Per-bone quaternion orientation overrides */
  poseOverrides?: Partial<Record<import('./characterRig.ts').HumanoidBoneName, Quat>>;
  /** Spatial IK end-effector targets in content space */
  ikTargets?: {
    leftHand?: Vec3;
    rightHand?: Vec3;
    leftFoot?: Vec3;
    rightFoot?: Vec3;
  };
}

export const MAX_KEYFRAMES = 5;

/** Default playback speed used to derive segment durations. */
export const WALK_SPEED_MS = 1.4;

export const ASPECT_NAMES = ['2.39:1', '16:9', '4:3'] as const;
export type AspectName = (typeof ASPECT_NAMES)[number];

export function aspectValue(a: AspectName): number {
  switch (a) {
    case '2.39:1':
      return 2.39;
    case '16:9':
      return 16 / 9;
    case '4:3':
      return 4 / 3;
  }
}

/** Convenient stepping presets. Focal length itself is a free mm value so a
 *  DP can store real primes (18/27/40/65/100) or a zoom setting. */
export const FOCAL_LENGTHS = [16, 24, 35, 50, 85, 135] as const;
/** A focal length in millimeters. Free value; FOCAL_LENGTHS is only for steps. */
export type FocalLength = number;

/**
 * Snaps to the nearest preset, then steps one preset in `dir`. A stored
 * non-preset value (e.g. 27mm) steps to the sensible neighbour (24 or 35).
 */
export function stepFocal(f: number, dir: 1 | -1): number {
  const p = FOCAL_LENGTHS;
  let i = 0;
  for (let k = 1; k < p.length; k++) {
    if (Math.abs(p[k] - f) < Math.abs(p[i] - f)) i = k;
  }
  if (Math.abs(p[i] - f) < 1e-6) {
    i = Math.min(p.length - 1, Math.max(0, i + dir));
  } else if (dir > 0 && p[i] < f) {
    i = Math.min(p.length - 1, i + 1);
  } else if (dir < 0 && p[i] > f) {
    i = Math.max(0, i - 1);
  }
  return p[i];
}

/**
 * A capture format. Horizontal angle of view depends on the physical gate
 * width and the anamorphic squeeze (2x anamorphic on a 50mm frames like a 25mm
 * spherical). cocMm is the circle of confusion used for depth-of-field.
 */
export interface SensorFormat {
  id: string;
  name: string;
  /** Compact label for slates/readouts. */
  short: string;
  /** Horizontal gate width in mm. */
  gateWidthMm: number;
  /** Circle of confusion in mm (DOF). */
  cocMm: number;
  /** Anamorphic squeeze (1 = spherical, 2 = 2x anamorphic). */
  squeeze: number;
}

export const SENSOR_FORMATS: readonly SensorFormat[] = [
  { id: 'super35', name: 'Super 35', short: 'S35', gateWidthMm: 24.89, cocMm: 0.025, squeeze: 1 },
  { id: 'fullframe', name: 'Full Frame / VV', short: 'FF', gateWidthMm: 36.0, cocMm: 0.029, squeeze: 1 },
  { id: 'super16', name: 'Super 16', short: 'S16', gateWidthMm: 12.52, cocMm: 0.015, squeeze: 1 },
  { id: 'anamorphic35', name: 'S35 Anamorphic 2×', short: 'ANA2×', gateWidthMm: 24.89, cocMm: 0.025, squeeze: 2 },
];

export const DEFAULT_FORMAT_ID = 'super35';
export const DEFAULT_TSTOP = 2.8;

/** Whole-stop presets the wrist T-stop button cycles through. */
export const TSTOP_PRESETS = [1.4, 2, 2.8, 4, 5.6, 8] as const;

/**
 * Snaps to the nearest preset stop, then advances one (wrapping). A free
 * value typed on the prep page (e.g. T2.2) cycles from its nearest neighbour.
 */
export function cycleTStop(t: number): number {
  const p = TSTOP_PRESETS;
  let i = 0;
  for (let k = 1; k < p.length; k++) {
    if (Math.abs(p[k] - t) < Math.abs(p[i] - t)) i = k;
  }
  return p[(i + 1) % p.length];
}

/** The next sensor format in table order, wrapping (unknown id → first). */
export function nextFormatId(id: string): string {
  const i = SENSOR_FORMATS.findIndex((f) => f.id === id);
  return SENSOR_FORMATS[(i + 1) % SENSOR_FORMATS.length].id;
}

export function sensorFormat(id: string): SensorFormat {
  return SENSOR_FORMATS.find((f) => f.id === id) ?? SENSOR_FORMATS[0];
}

/** Tripod-height presets (meters) so a DP can author low/high/overhead shots. */
export interface TripodHeight {
  name: string;
  y: number;
}
export const TRIPOD_HEIGHTS: readonly TripodHeight[] = [
  { name: 'Low hat', y: 0.3 },
  { name: 'Low', y: 0.6 },
  { name: 'Waist', y: 1.1 },
  { name: 'Eye', y: 1.6 },
  { name: 'High', y: 2.4 },
];

export const MAX_CAMERA_KEYFRAMES = 8;
export const DEFAULT_DOLLY_SPEED_MS = 1.0;

export type CameraMoveType =
  | 'static'
  | 'pan-tilt'
  | 'dolly-push'
  | 'dolly-pull'
  | 'truck'
  | 'boom'
  | 'arc'
  | 'compound'
  | 'zoom';

/** One stored camera blocking mark along a dynamic camera move (dolly, crane, tracking). */
export interface CameraKeyframe {
  /** Eye / lens position, scene space, meters. */
  position: Vec3;
  /** Camera orientation quaternion. */
  rotation: Quat;
  /** Lens focal length in mm (supports animated zoom / rack zoom). */
  lensFocalLength: FocalLength;
  /** Optional focus distance in meters at this mark. */
  focusDistanceM?: number;
  /** Optional focus/tracking target actor ID at this mark. */
  focusTargetActorId?: string;
  /** Optional hold / pause duration at this mark (seconds). */
  holdDurationS?: number;
}

export interface CameraSetupData {
  id: string;
  name: string; // 'CAM A', 'CAM B', ...
  /** Lens/eye point, scene space, meters. */
  position: Vec3;
  /** Full orientation (cameras are not floor-locked). */
  rotation: Quat;
  /** Focal length in mm (free value). */
  lensFocalLength: FocalLength;
  aspect: AspectName;
  /** Aperture as a T-stop (≈ f-number for DOF). */
  tStop: number;
  /** SensorFormat id (see SENSOR_FORMATS). */
  formatId: string;
  /** Optional focus target actor ID. */
  focusTargetActorId?: string;
  /** Optional focus distance in meters. */
  focusDistanceM?: number;
  /** Optional keyframe motion path (empty or undefined = static camera). */
  keyframes?: CameraKeyframe[];
  /** Optional look-at tracking target actor ID. */
  lookAtTargetActorId?: string;
  /** Optional physical camera grip rig configuration (tripod, dolly, technocrane, steadicam, etc.). */
  gripRig?: GripRigConfig;
  /** Optional cinema lens optical physics profile (anamorphic squeeze, bokeh, breathing, distortion). */
  lensProfile?: LensOpticalProfile;
}

export type CameraSetup = CameraSetupData;

/**
 * Where a labeled furniture mesh from the scan has been moved to, relative to
 * its captured pose: an XZ offset plus a yaw about the mesh's own footprint
 * center. The scan geometry blob itself is immutable — placements ride in the
 * scene JSON so moving a couch never rewrites megabytes of mesh data.
 */
export interface FurniturePlacement {
  /** Index into the scan's mesh list (codec order is stable). */
  meshIndex: number;
  /** Offset from the captured position, scene-space meters. */
  dx: number;
  dz: number;
  /** Yaw about the footprint center, radians. */
  rotY: number;
}

export function isFurniturePlacement(v: unknown): v is FurniturePlacement {
  const p = v as FurniturePlacement;
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNum(p.meshIndex) &&
    Number.isInteger(p.meshIndex) &&
    p.meshIndex >= 0 &&
    isFiniteNum(p.dx) &&
    isFiniteNum(p.dz) &&
    isFiniteNum(p.rotY)
  );
}

/**
 * Compact description of a captured location scan. The heavy geometry blob
 * lives outside the scene JSON (IndexedDB, keyed by `id` — see scanStore.ts);
 * this summary is what localStorage autosave carries.
 */
export interface ScanSummary {
  /** Key of the geometry blob in the scan store. */
  id: string;
  /** Epoch ms at capture. */
  capturedAt: number;
  vertices: number;
  triangles: number;
  /** Axis-aligned bounds in scene space (meters). */
  boundsMin: Vec3;
  boundsMax: Vec3;
  /** Moved furniture (labeled scan meshes). Absent = everything as captured. */
  furniture?: FurniturePlacement[];
}

export type LightType = 'spot' | 'point' | 'area';

export interface LightData {
  id: string;
  name: string;
  type: LightType;
  /** Position in meters, scene space [x, y, z]. */
  position: [number, number, number];
  /** Heading around +Y, radians. */
  rotationY: number;
  /** Pitch angle, radians. */
  rotationX: number;
  /** Intensity relative 0.1 to 10.0, default 1.0. */
  intensity: number;
  /** Color temperature in Kelvin (3200 Warm, 4300 Neutral-Warm, 5600 Daylight, 6500 Cool, default 5600). */
  colorKelvin: number;
  /** Spot light cone angle in degrees (default 45). */
  coneAngleDeg: number;
}

export const KELVIN_PRESETS = [3200, 4300, 5600, 6500] as const;

export function cycleKelvin(k: number): number {
  const p = KELVIN_PRESETS;
  let i = 0;
  for (let idx = 1; idx < p.length; idx++) {
    if (Math.abs(p[idx] - k) < Math.abs(p[i] - k)) i = idx;
  }
  return p[(i + 1) % p.length];
}

export interface SceneData {
  version: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  actors: ActorData[];
  cameras: CameraSetupData[];
  lights: LightData[];
  /** Multi-track spatial audio cues and sound design marks. */
  audioCues?: AudioCueData[];
  /** 3D set pieces, furniture, camera/grip support, and custom props. */
  props?: PropData[];
  /** Volumetric set fog and atmospheric lighting simulation parameters. */
  atmosphere?: AtmosphereConfig;
  /** Architectural set structure (walls, wallpapers, windows, and doors). */
  architecture?: ArchitecturalSet;
  /** Bi-directional Unreal Engine LiveLink & WebXR VCam streaming configuration. */
  livelink?: LiveLinkConfig;
  /** 3D Gaussian Splatting and photogrammetry scout reconstructions. */
  gaussianClouds?: GaussianCloudData[];
  /** Active Gaussian Splat Cloud ID in scene. */
  activeSplatCloudId?: string;
  /** Physical soundstage DMX512, Art-Net 4, and ANSI E1.31 sACN lighting bridge configuration. */
  dmxBridge?: DmxBridgeConfig;
  /** DMX patch assignments mapping scene lights to physical fixture profiles and addresses. */
  dmxPatches?: DmxPatchEntry[];
  /** Stored DMX lighting cues and dynamic scene looks. */
  dmxCues?: DmxCue[];
  /** Virtual Production ICVFX LED Volume stage configuration and wall geometries. */
  icvfx?: LedVolumeConfig;
  /** Multi-track spatial dialogue, boom microphone rigging, and soundstage room RT60 acoustics. */
  acoustics?: AcousticsConfig;
  /** Physical solar ephemeris, time of day, and natural environmental lighting. */
  solar?: SolarEnvironmentConfig;
  /** Screenplay beat breakdown, Fountain/FDX scripts, and AI shot coverage continuity suite. */
  screenplay?: ScreenplayConfig;
  /** WebXR 6DoF emulation test harness and Quest 3 frame budget profiler configuration. */
  profiler?: VRProfilerConfig;
  /** VR motion sickness prevention, reach ergonomics envelope, and spatial comfort auditor. */
  comfort?: VRComfortConfig;
  /** Procedural set dressing, spatial Poisson scatter, physics settling, and Gemini AI director. */
  setDressing?: SetDressingConfig;
  /** Playback pace for blocking moves (m/s); drives segment timing. */
  walkSpeed: number;
  /** Captured location scan, if any. Absent/null = no scan. */
  scan?: ScanSummary | null;
}

// --- factories --------------------------------------------------------------

export const ACTOR_PALETTE = [
  '#e5484d', // red
  '#3e9bf0', // blue
  '#46a758', // green
  '#f5a524', // amber
  '#8e4ec6', // purple
  '#12a594', // teal
  '#e93d82', // pink
  '#f76b15', // orange
  '#7ce2fe', // sky
  '#bdee63', // lime
] as const;

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createScene(name: string): SceneData {
  const now = Date.now();
  return {
    version: 1,
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    actors: [],
    cameras: [],
    lights: [],
    audioCues: [],
    props: [],
    atmosphere: createAtmosphereConfig('clear'),
    architecture: createArchitecturalSet(name ? `${name} Architecture` : 'Set Architecture'),
    livelink: createLiveLinkConfig(),
    gaussianClouds: [],
    activeSplatCloudId: undefined,
    dmxBridge: createDmxBridgeConfig(),
    dmxPatches: [],
    dmxCues: [],
    icvfx: createLedVolumeConfig(),
    acoustics: createAcousticsConfig('dialogue_soundstage'),
    solar: createSolarEnvironmentConfig('golden_hour_sunset', 'los_angeles'),
    screenplay: createScreenplayConfig(),
    profiler: createVRProfilerConfig(72),
    comfort: createVRComfortConfig(),
    setDressing: createSetDressingConfig(),
    walkSpeed: WALK_SPEED_MS,
    scan: null,
  };
}


/** First unused "Actor N" name for a scene. */
export function nextActorName(scene: SceneData): string {
  let n = scene.actors.length + 1;
  while (scene.actors.some((a) => a.name === `Actor ${n}`)) n++;
  return `Actor ${n}`;
}

/** First unused "CAM X" name (letters A–Z, then a numeric suffix). */
export function nextCameraName(scene: SceneData): string {
  let i = 0;
  while (i < 26 && scene.cameras.some((c) => c.name === `CAM ${String.fromCharCode(65 + i)}`)) i++;
  return i < 26 ? `CAM ${String.fromCharCode(65 + i)}` : `CAM ${scene.cameras.length + 1}`;
}

/** Creates an actor with a unique name and the next palette color. */
export function createActor(scene: SceneData, position: Vec3, rotationY: number): ActorData {
  const actor: ActorData = {
    id: uid(),
    name: nextActorName(scene),
    color: ACTOR_PALETTE[scene.actors.length % ACTOR_PALETTE.length],
    position: { ...position },
    rotationY,
    keyframes: [],
    notes: [],
    stance: DEFAULT_STANCE,
    scale: 1.0,
    rigType: 'stylized_mannequin',
    animationSpeed: 1.0,
  };
  scene.actors.push(actor);
  return actor;
}

/** Normalizes an actor, ensuring valid fields, fallback defaults, and referential integrity. */
export function normalizeActor(a: ActorData, scene?: SceneData): ActorData {
  if (!isStanceId(a.stance)) a.stance = DEFAULT_STANCE;
  if (!isFiniteNum(a.heightM) || a.heightM <= 0) a.heightM = 1.75;
  if (!isFiniteNum(a.scale) || a.scale < 0.2 || a.scale > 3.0) a.scale = 1.0;
  if (a.rigType !== 'stylized_mannequin' && a.rigType !== 'realistic_humanoid' && a.rigType !== 'custom_gltf') {
    a.rigType = 'stylized_mannequin';
  }
  if (!isFiniteNum(a.animationSpeed) || a.animationSpeed <= 0) {
    a.animationSpeed = 1.0;
  }
  if (scene) {
    if (a.lookAtTargetActorId !== undefined) {
      if (
        typeof a.lookAtTargetActorId !== 'string' ||
        !scene.actors.some((other) => other.id === a.lookAtTargetActorId) ||
        a.lookAtTargetActorId === a.id
      ) {
        delete a.lookAtTargetActorId;
      }
    }
    if (a.lookAtTargetCameraId !== undefined) {
      if (typeof a.lookAtTargetCameraId !== 'string' || !scene.cameras.some((cam) => cam.id === a.lookAtTargetCameraId)) {
        delete a.lookAtTargetCameraId;
      }
    }
  }
  if (a.ikTargets) {
    if (a.ikTargets.leftHand && !isVec3(a.ikTargets.leftHand)) delete a.ikTargets.leftHand;
    if (a.ikTargets.rightHand && !isVec3(a.ikTargets.rightHand)) delete a.ikTargets.rightHand;
    if (a.ikTargets.leftFoot && !isVec3(a.ikTargets.leftFoot)) delete a.ikTargets.leftFoot;
    if (a.ikTargets.rightFoot && !isVec3(a.ikTargets.rightFoot)) delete a.ikTargets.rightFoot;
  }
  for (const k of a.keyframes) {
    if (k.stance !== undefined && !isStanceId(k.stance)) delete k.stance;
  }
  return a;
}

/** Deep-clones an actor into the scene: new id, unique name, offset pose. */
export function duplicateActor(scene: SceneData, id: string): ActorData | null {
  const src = scene.actors.find((a) => a.id === id);
  if (!src) return null;
  const copy: ActorData = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.color = ACTOR_PALETTE[scene.actors.length % ACTOR_PALETTE.length];
  copy.position = { x: src.position.x + 0.6, y: src.position.y, z: src.position.z };
  for (const k of copy.keyframes) k.position.x += 0.6; // shift the whole path
  copy.name = nextActorName(scene);
  scene.actors.push(copy);
  return copy;
}

/** Deep-clones a camera into the scene: new id, unique name, offset position. */
export function duplicateCameraSetup(scene: SceneData, id: string): CameraSetupData | null {
  const src = scene.cameras.find((c) => c.id === id);
  if (!src) return null;
  const copy: CameraSetupData = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.position = { x: src.position.x + 0.4, y: src.position.y, z: src.position.z };
  if (copy.keyframes) {
    for (const k of copy.keyframes) k.position.x += 0.4;
  }
  if (copy.gripRig?.turretBasePos) {
    copy.gripRig.turretBasePos.x += 0.4;
  }
  copy.name = nextCameraName(scene);
  scene.cameras.push(copy);
  return copy;
}

/** First unused "Key Light N" / "Fill Light N" / "Light N" name for a scene. */
export function nextLightName(scene: SceneData, type: LightType = 'spot'): string {
  const prefix = type === 'spot' ? 'Key Light' : type === 'point' ? 'Fill Light' : 'Light';
  let n = (scene.lights?.length ?? 0) + 1;
  while (scene.lights?.some((l) => l.name === `${prefix} ${n}`)) n++;
  return `${prefix} ${n}`;
}

/** Creates a light setup with unique name and defaults. */
export function createLight(
  scene: SceneData,
  position: [number, number, number],
  rotationYOrType: number | LightType = 0,
  rotationX = 0,
  type: LightType = 'spot',
  colorKelvin = 5600,
  intensity = 1.0,
  coneAngleDeg = 45,
): LightData {
  let rotY = 0;
  let lightType: LightType = 'spot';
  if (typeof rotationYOrType === 'string') {
    lightType = rotationYOrType;
  } else {
    rotY = rotationYOrType;
    lightType = type;
  }

  const light: LightData = {
    id: uid(),
    name: nextLightName(scene, lightType),
    type: lightType,
    position: [...position],
    rotationY: rotY,
    rotationX,
    intensity,
    colorKelvin,
    coneAngleDeg,
  };
  if (!scene.lights) scene.lights = [];
  scene.lights.push(light);
  return light;
}

/** Deep-clones a light into the scene: new id, unique name, offset position. */
export function duplicateLightSetup(scene: SceneData, idOrLight: string | LightData): LightData | null {
  if (!scene.lights) return null;
  const targetId = typeof idOrLight === 'string' ? idOrLight : idOrLight.id;
  const src = scene.lights.find((l) => l.id === targetId);
  if (!src) return null;
  const copy: LightData = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.position = [src.position[0] + 0.5, src.position[1], src.position[2]];
  copy.name = nextLightName(scene, copy.type);
  scene.lights.push(copy);
  return copy;
}

/** Creates and adds an audio cue to the scene. */
export function createAudioCueForScene(
  scene: SceneData,
  params: Parameters<typeof createAudioCue>[0],
): AudioCueData {
  if (!scene.audioCues) scene.audioCues = [];
  const cue = createAudioCue(params);
  scene.audioCues.push(cue);
  return cue;
}

/** Deep-clones an audio cue into the scene: new id, unique name, offset timestamp. */
export function duplicateAudioCue(scene: SceneData, id: string): AudioCueData | null {
  if (!scene.audioCues) return null;
  const src = scene.audioCues.find((c) => c.id === id);
  if (!src) return null;
  const copy: AudioCueData = JSON.parse(JSON.stringify(src));
  copy.id = uid();
  copy.name = `${src.name} (Copy)`;
  copy.timestampS = src.timestampS + 1.0;
  if (copy.position) copy.position.x += 0.5;
  scene.audioCues.push(copy);
  return copy;
}

export function createCameraSetup(
  scene: SceneData,
  position: Vec3,
  rotation: Quat,
  lensFocalLength: FocalLength,
  aspect: AspectName,
  tStop: number = DEFAULT_TSTOP,
  formatId: string = DEFAULT_FORMAT_ID,
  focusTargetActorId?: string,
  focusDistanceM?: number,
  gripRig?: GripRigConfig,
  lensProfile?: LensOpticalProfile,
): CameraSetupData {
  // First unused letter (A, B, C...) so deleting a middle camera never yields
  // a duplicate name on the next add. Past 26 cameras, fall back to a numeric
  // suffix (bounded — never spin looking for a free letter that can't exist).
  let i = 0;
  while (i < 26 && scene.cameras.some((c) => c.name === `CAM ${String.fromCharCode(65 + i)}`)) i++;
  const name = i < 26 ? `CAM ${String.fromCharCode(65 + i)}` : `CAM ${scene.cameras.length + 1}`;
  const cam: CameraSetupData = {
    id: uid(),
    name,
    position: { ...position },
    rotation: { ...rotation },
    lensFocalLength,
    aspect,
    tStop,
    formatId,
    ...(focusTargetActorId ? { focusTargetActorId } : {}),
    ...(focusDistanceM !== undefined && isFiniteNum(focusDistanceM) && focusDistanceM > 0 ? { focusDistanceM } : {}),
    ...(gripRig ? { gripRig: normalizeGripRigConfig(gripRig) } : {}),
    ...(lensProfile ? { lensProfile: normalizeLensProfile(lensProfile) } : {}),
  };
  scene.cameras.push(cam);
  return cam;
}

export function addNote(actor: ActorData, kind: NoteKind, text: string): ActorNote {
  const note: ActorNote = { id: uid(), kind, text, createdAt: Date.now() };
  actor.notes.push(note);
  return note;
}

/** Returns false (and does nothing) when the actor is at MAX_KEYFRAMES. */
export function addKeyframe(
  actor: ActorData,
  position: Vec3,
  rotationY: number,
  stance?: StanceId,
): boolean {
  if (actor.keyframes.length >= MAX_KEYFRAMES) return false;
  const kf: TransformKeyframe = { position: { ...position }, rotationY };
  if (stance !== undefined) kf.stance = stance;
  actor.keyframes.push(kf);
  return true;
}

/**
 * One desktop blocking-editor operation on an actor's mark list. Kept as a
 * discriminated union so the whole editor funnels through one pure, tested
 * function (applyMarkOp) instead of scattering list surgery through the UI.
 */
export type MarkOp =
  | {
      kind: 'update';
      index: number;
      position?: Partial<Pick<Vec3, 'x' | 'z'>>;
      rotationY?: number;
      /** A StanceId sets the mark's pose; null clears it (→ rest stance). */
      stance?: StanceId | null;
    }
  | { kind: 'remove'; index: number }
  | { kind: 'move'; index: number; dir: 1 | -1 }
  | { kind: 'add' };

/**
 * Applies a mark operation. Returns false (mutating nothing) when the op is
 * invalid: index out of range, add at MAX_KEYFRAMES, move past an end, or a
 * non-finite number. 'add' mirrors AR capture: the new mark lands a step past
 * the last mark (or at the actor's rest position) stamped with the actor's
 * current stance.
 */
export function applyMarkOp(actor: ActorData, op: MarkOp): boolean {
  const kfs = actor.keyframes;
  switch (op.kind) {
    case 'add': {
      if (kfs.length >= MAX_KEYFRAMES) return false;
      const last = kfs[kfs.length - 1];
      const base = last ?? { position: actor.position, rotationY: actor.rotationY };
      return addKeyframe(
        actor,
        { x: base.position.x + (last ? 0.6 : 0), y: base.position.y, z: base.position.z },
        base.rotationY,
        actor.stance,
      );
    }
    case 'remove':
      if (!(op.index >= 0 && op.index < kfs.length)) return false;
      kfs.splice(op.index, 1);
      return true;
    case 'move': {
      const j = op.index + op.dir;
      if (!(op.index >= 0 && op.index < kfs.length) || j < 0 || j >= kfs.length) return false;
      [kfs[op.index], kfs[j]] = [kfs[j], kfs[op.index]];
      return true;
    }
    case 'update': {
      const k = kfs[op.index];
      if (!k) return false;
      // Validate everything BEFORE mutating so a bad op can't half-apply.
      if (op.position?.x !== undefined && !isFiniteNum(op.position.x)) return false;
      if (op.position?.z !== undefined && !isFiniteNum(op.position.z)) return false;
      if (op.rotationY !== undefined && !isFiniteNum(op.rotationY)) return false;
      if (op.stance !== undefined && op.stance !== null && !isStanceId(op.stance)) return false;
      if (op.position?.x !== undefined) k.position.x = op.position.x;
      if (op.position?.z !== undefined) k.position.z = op.position.z;
      if (op.rotationY !== undefined) k.rotationY = op.rotationY;
      if (op.stance === null) delete k.stance;
      else if (op.stance !== undefined) k.stance = op.stance;
      return true;
    }
  }
}

export function isCameraKeyframe(v: unknown): v is CameraKeyframe {
  const k = v as CameraKeyframe;
  return (
    !!k &&
    typeof k === 'object' &&
    isVec3(k.position) &&
    isQuat(k.rotation) &&
    isFiniteNum(k.lensFocalLength) &&
    k.lensFocalLength > 0 &&
    (k.focusDistanceM === undefined || (isFiniteNum(k.focusDistanceM) && k.focusDistanceM > 0)) &&
    (k.focusTargetActorId === undefined || typeof k.focusTargetActorId === 'string') &&
    (k.holdDurationS === undefined || (isFiniteNum(k.holdDurationS) && k.holdDurationS >= 0))
  );
}

/** Returns false (and does nothing) when the camera is at MAX_CAMERA_KEYFRAMES. */
export function addCameraKeyframe(
  cam: CameraSetupData,
  position: Vec3,
  rotation: Quat,
  lensFocalLength?: FocalLength,
  focusDistanceM?: number,
  focusTargetActorId?: string,
  holdDurationS?: number,
): boolean {
  if (!cam.keyframes) cam.keyframes = [];
  if (cam.keyframes.length >= MAX_CAMERA_KEYFRAMES) return false;
  const kf: CameraKeyframe = {
    position: { ...position },
    rotation: { ...rotation },
    lensFocalLength: lensFocalLength ?? cam.lensFocalLength,
    ...(focusDistanceM !== undefined && isFiniteNum(focusDistanceM) && focusDistanceM > 0 ? { focusDistanceM } : {}),
    ...(focusTargetActorId ? { focusTargetActorId } : {}),
    ...(holdDurationS !== undefined && isFiniteNum(holdDurationS) && holdDurationS > 0 ? { holdDurationS } : {}),
  };
  cam.keyframes.push(kf);
  return true;
}

/**
 * One desktop blocking-editor operation on a camera's motion path.
 */
export type CameraMarkOp =
  | {
      kind: 'update';
      index: number;
      position?: Partial<Vec3>;
      rotation?: Partial<Quat>;
      lensFocalLength?: number;
      focusDistanceM?: number;
      focusTargetActorId?: string | null;
      holdDurationS?: number;
    }
  | { kind: 'remove'; index: number }
  | { kind: 'move'; index: number; dir: 1 | -1 }
  | { kind: 'add' };

/**
 * Applies a camera mark operation. Returns false when the op is invalid.
 */
export function applyCameraMarkOp(cam: CameraSetupData, op: CameraMarkOp): boolean {
  if (!cam.keyframes) cam.keyframes = [];
  const list = cam.keyframes;
  switch (op.kind) {
    case 'add': {
      if (list.length >= MAX_CAMERA_KEYFRAMES) return false;
      if (list.length === 0) {
        return addCameraKeyframe(
          cam,
          cam.position,
          cam.rotation,
          cam.lensFocalLength,
          cam.focusDistanceM,
          cam.focusTargetActorId,
        );
      }
      const last = list[list.length - 1];
      return addCameraKeyframe(
        cam,
        { x: last.position.x, y: last.position.y, z: last.position.z - 1.0 },
        last.rotation,
        last.lensFocalLength,
        last.focusDistanceM,
        last.focusTargetActorId,
      );
    }
    case 'remove': {
      if (!(op.index >= 0 && op.index < list.length)) return false;
      list.splice(op.index, 1);
      return true;
    }
    case 'move': {
      const j = op.index + op.dir;
      if (!(op.index >= 0 && op.index < list.length) || j < 0 || j >= list.length) return false;
      [list[op.index], list[j]] = [list[j], list[op.index]];
      return true;
    }
    case 'update': {
      const cur = list[op.index];
      if (!cur) return false;
      if (op.position) {
        if (op.position.x !== undefined && !isFiniteNum(op.position.x)) return false;
        if (op.position.y !== undefined && !isFiniteNum(op.position.y)) return false;
        if (op.position.z !== undefined && !isFiniteNum(op.position.z)) return false;
      }
      if (op.rotation) {
        if (op.rotation.x !== undefined && !isFiniteNum(op.rotation.x)) return false;
        if (op.rotation.y !== undefined && !isFiniteNum(op.rotation.y)) return false;
        if (op.rotation.z !== undefined && !isFiniteNum(op.rotation.z)) return false;
        if (op.rotation.w !== undefined && !isFiniteNum(op.rotation.w)) return false;
      }
      if (op.lensFocalLength !== undefined && (!isFiniteNum(op.lensFocalLength) || op.lensFocalLength <= 0)) {
        return false;
      }
      if (op.focusDistanceM !== undefined && (!isFiniteNum(op.focusDistanceM) || op.focusDistanceM <= 0)) {
        return false;
      }
      if (op.holdDurationS !== undefined && (!isFiniteNum(op.holdDurationS) || op.holdDurationS < 0)) {
        return false;
      }

      if (op.position) {
        if (op.position.x !== undefined) cur.position.x = op.position.x;
        if (op.position.y !== undefined) cur.position.y = op.position.y;
        if (op.position.z !== undefined) cur.position.z = op.position.z;
      }
      if (op.rotation) {
        if (op.rotation.x !== undefined) cur.rotation.x = op.rotation.x;
        if (op.rotation.y !== undefined) cur.rotation.y = op.rotation.y;
        if (op.rotation.z !== undefined) cur.rotation.z = op.rotation.z;
        if (op.rotation.w !== undefined) cur.rotation.w = op.rotation.w;
      }
      if (op.lensFocalLength !== undefined) cur.lensFocalLength = op.lensFocalLength;
      if (op.focusDistanceM !== undefined) cur.focusDistanceM = op.focusDistanceM;
      if (op.focusTargetActorId !== undefined) {
        if (op.focusTargetActorId === null) delete cur.focusTargetActorId;
        else cur.focusTargetActorId = op.focusTargetActorId;
      }
      if (op.holdDurationS !== undefined) {
        if (op.holdDurationS === 0) delete cur.holdDurationS;
        else cur.holdDurationS = op.holdDurationS;
      }
      return true;
    }
  }
}

/** Euclidean distance between two scene-space points (meters). Pure. */
export function vecDistance(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}
function isVec3(v: unknown): v is Vec3 {
  const p = v as Vec3;
  return !!p && typeof p === 'object' && isFiniteNum(p.x) && isFiniteNum(p.y) && isFiniteNum(p.z);
}
function isQuat(v: unknown): v is Quat {
  const q = v as Quat;
  return (
    !!q && typeof q === 'object' && isFiniteNum(q.x) && isFiniteNum(q.y) && isFiniteNum(q.z) && isFiniteNum(q.w)
  );
}
function isActorData(v: unknown): boolean {
  const a = v as ActorData;
  return (
    !!a &&
    typeof a === 'object' &&
    typeof a.id === 'string' &&
    typeof a.name === 'string' &&
    typeof a.color === 'string' &&
    isVec3(a.position) &&
    isFiniteNum(a.rotationY) &&
    Array.isArray(a.keyframes) &&
    a.keyframes.every(
      (k) => isVec3((k as TransformKeyframe)?.position) && isFiniteNum((k as TransformKeyframe)?.rotationY),
    ) &&
    Array.isArray(a.notes) &&
    (a.scale === undefined || (isFiniteNum(a.scale) && a.scale > 0)) &&
    (a.rigType === undefined ||
      a.rigType === 'stylized_mannequin' ||
      a.rigType === 'realistic_humanoid' ||
      a.rigType === 'custom_gltf') &&
    (a.animationClip === undefined || typeof a.animationClip === 'string') &&
    (a.animationSpeed === undefined || (isFiniteNum(a.animationSpeed) && a.animationSpeed > 0)) &&
    (a.lookAtTargetActorId === undefined || typeof a.lookAtTargetActorId === 'string') &&
    (a.lookAtTargetCameraId === undefined || typeof a.lookAtTargetCameraId === 'string') &&
    (a.ikTargets === undefined ||
      (typeof a.ikTargets === 'object' &&
        (a.ikTargets.leftHand === undefined || isVec3(a.ikTargets.leftHand)) &&
        (a.ikTargets.rightHand === undefined || isVec3(a.ikTargets.rightHand)) &&
        (a.ikTargets.leftFoot === undefined || isVec3(a.ikTargets.leftFoot)) &&
        (a.ikTargets.rightFoot === undefined || isVec3(a.ikTargets.rightFoot))))
  );
}
export function isCameraData(v: unknown): boolean {
  const c = v as CameraSetupData;
  return (
    !!c &&
    typeof c === 'object' &&
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    isVec3(c.position) &&
    isQuat(c.rotation) &&
    isFiniteNum(c.lensFocalLength) &&
    c.lensFocalLength > 0 &&
    (ASPECT_NAMES as readonly string[]).includes(c.aspect) &&
    (c.focusTargetActorId === undefined || typeof c.focusTargetActorId === 'string') &&
    (c.focusDistanceM === undefined || (isFiniteNum(c.focusDistanceM) && c.focusDistanceM > 0)) &&
    (c.lookAtTargetActorId === undefined || typeof c.lookAtTargetActorId === 'string') &&
    (c.gripRig === undefined || isGripRigConfig(c.gripRig)) &&
    (c.lensProfile === undefined || isLensProfile(c.lensProfile)) &&
    (c.keyframes === undefined || (Array.isArray(c.keyframes) && c.keyframes.every(isCameraKeyframe)))
  );
}

export function normalizeCameraData(c: CameraSetupData, validActorIds?: Set<string>): CameraSetupData {
  if (!isFiniteNum(c.lensFocalLength) || c.lensFocalLength <= 0) c.lensFocalLength = 35;
  if (!isFiniteNum(c.tStop) || c.tStop <= 0) c.tStop = DEFAULT_TSTOP;
  if (typeof c.formatId !== 'string' || !SENSOR_FORMATS.some((f) => f.id === c.formatId)) {
    c.formatId = DEFAULT_FORMAT_ID;
  }
  if (c.focusTargetActorId !== undefined) {
    if (typeof c.focusTargetActorId !== 'string' || (validActorIds && !validActorIds.has(c.focusTargetActorId))) {
      delete c.focusTargetActorId;
    }
  }
  if (c.focusDistanceM !== undefined) {
    if (!isFiniteNum(c.focusDistanceM) || c.focusDistanceM <= 0) {
      delete c.focusDistanceM;
    }
  }
  if (c.lookAtTargetActorId !== undefined) {
    if (typeof c.lookAtTargetActorId !== 'string' || (validActorIds && !validActorIds.has(c.lookAtTargetActorId))) {
      delete c.lookAtTargetActorId;
    }
  }
  if (c.gripRig !== undefined) {
    c.gripRig = normalizeGripRigConfig(c.gripRig);
  }
  if (c.lensProfile !== undefined) {
    c.lensProfile = normalizeLensProfile(c.lensProfile);
  }
  if (c.keyframes !== undefined) {
    if (!Array.isArray(c.keyframes)) {
      c.keyframes = [];
    } else {
      c.keyframes = c.keyframes.filter(isCameraKeyframe);
      for (const kf of c.keyframes) {
        if (kf.focusTargetActorId !== undefined) {
          if (typeof kf.focusTargetActorId !== 'string' || (validActorIds && !validActorIds.has(kf.focusTargetActorId))) {
            delete kf.focusTargetActorId;
          }
        }
      }
    }
  }
  return c;
}

/**
 * Calculates the active focus distance (meters) for a camera.
 * Precedence:
 * 1. Explicit `focusDistanceM` if valid and positive.
 * 2. Distance to `focusTargetActorId` if set and actor exists.
 * 3. Distance to the nearest actor in `actors`.
 * 4. Fallback default of 3.0 meters.
 */
export function computeFocusDistance(cam: CameraSetupData, actors: ActorData[]): number {
  if (cam.focusDistanceM !== undefined && isFiniteNum(cam.focusDistanceM) && cam.focusDistanceM > 0) {
    return cam.focusDistanceM;
  }
  if (cam.focusTargetActorId) {
    const target = actors.find((a) => a.id === cam.focusTargetActorId);
    if (target) return vecDistance(cam.position, target.position);
  }
  let closest: number | null = null;
  for (const actor of actors) {
    const d = vecDistance(cam.position, actor.position);
    if (closest === null || d < closest) closest = d;
  }
  return closest ?? 3.0;
}

export function isLightData(v: unknown): v is LightData {
  const l = v as LightData;
  return (
    !!l &&
    typeof l === 'object' &&
    typeof l.id === 'string' &&
    typeof l.name === 'string' &&
    (l.type === 'spot' || l.type === 'point' || l.type === 'area') &&
    Array.isArray(l.position) &&
    l.position.length === 3 &&
    l.position.every(isFiniteNum) &&
    isFiniteNum(l.rotationY) &&
    isFiniteNum(l.rotationX) &&
    isFiniteNum(l.intensity) &&
    l.intensity >= 0 &&
    isFiniteNum(l.colorKelvin) &&
    isFiniteNum(l.coneAngleDeg)
  );
}

function isScanSummary(v: unknown): v is ScanSummary {
  const s = v as ScanSummary;
  return (
    !!s &&
    typeof s === 'object' &&
    typeof s.id === 'string' &&
    isFiniteNum(s.capturedAt) &&
    isFiniteNum(s.vertices) &&
    isFiniteNum(s.triangles) &&
    isVec3(s.boundsMin) &&
    isVec3(s.boundsMax) &&
    (s.furniture === undefined || (Array.isArray(s.furniture) && s.furniture.every(isFurniturePlacement)))
  );
}

/**
 * Deep shape check used when importing scene JSON from disk — validates every
 * actor and camera so a malformed file can't crash the renderer on load.
 * Note: tStop/formatId are intentionally NOT required (older exports lack
 * them); normalizeScene() fills their defaults.
 */
export function isSceneData(v: unknown): v is SceneData {
  const s = v as SceneData;
  return (
    !!s &&
    typeof s === 'object' &&
    s.version === 1 &&
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    Array.isArray(s.actors) &&
    s.actors.every(isActorData) &&
    Array.isArray(s.cameras) &&
    s.cameras.every(isCameraData) &&
    (s.lights === undefined || (Array.isArray(s.lights) && s.lights.every(isLightData))) &&
    (s.audioCues === undefined || (Array.isArray(s.audioCues) && s.audioCues.every(isAudioCueData))) &&
    (s.props === undefined || (Array.isArray(s.props) && s.props.every(isPropData))) &&
    (s.atmosphere === undefined || isAtmosphereConfig(s.atmosphere)) &&
    (s.architecture === undefined || isArchitecturalSet(s.architecture)) &&
    (s.livelink === undefined || isLiveLinkConfig(s.livelink)) &&
    (s.gaussianClouds === undefined || (Array.isArray(s.gaussianClouds) && s.gaussianClouds.every(isGaussianCloud))) &&
    (s.activeSplatCloudId === undefined || typeof s.activeSplatCloudId === 'string') &&
    (s.dmxBridge === undefined || isDmxBridgeConfig(s.dmxBridge)) &&
    (s.dmxPatches === undefined || (Array.isArray(s.dmxPatches) && s.dmxPatches.every(isDmxPatchEntry))) &&
    (s.dmxCues === undefined || (Array.isArray(s.dmxCues) && s.dmxCues.every(isDmxCue))) &&
    (s.icvfx === undefined || isLedVolumeConfig(s.icvfx)) &&
    (s.acoustics === undefined || isAcousticsConfig(s.acoustics)) &&
    (s.solar === undefined || isSolarEnvironmentConfig(s.solar)) &&
    (s.screenplay === undefined || isScreenplayConfig(s.screenplay)) &&
    (s.profiler === undefined || isVRProfilerConfig(s.profiler)) &&
    (s.comfort === undefined || isVRComfortConfig(s.comfort)) &&
    (s.setDressing === undefined || isSetDressingConfig(s.setDressing)) &&
    (s.scan == null || isScanSummary(s.scan))
  );
}

/** Fills defaults for fields absent from older scene JSON. Mutates + returns. */
export function normalizeScene(s: SceneData): SceneData {
  if (!isFiniteNum(s.walkSpeed) || s.walkSpeed <= 0) s.walkSpeed = WALK_SPEED_MS;
  if (s.scan === undefined) s.scan = null;
  if (s.scan?.furniture !== undefined) {
    // Drop malformed placements (a bad one would fling a couch to NaN);
    // an empty list is equivalent to "as captured".
    s.scan.furniture = s.scan.furniture.filter(isFurniturePlacement);
    if (s.scan.furniture.length === 0) delete s.scan.furniture;
  }
  if (!Array.isArray(s.lights)) {
    s.lights = [];
  } else {
    for (const l of s.lights) {
      if (l.type !== 'spot' && l.type !== 'point' && l.type !== 'area') l.type = 'spot';
      if (!isFiniteNum(l.rotationY)) l.rotationY = 0;
      if (!isFiniteNum(l.rotationX)) l.rotationX = 0;
      if (!isFiniteNum(l.intensity) || l.intensity <= 0) l.intensity = 1.0;
      if (!isFiniteNum(l.colorKelvin) || l.colorKelvin < 1000 || l.colorKelvin > 12000) l.colorKelvin = 5600;
      if (!isFiniteNum(l.coneAngleDeg) || l.coneAngleDeg < 5 || l.coneAngleDeg > 170) l.coneAngleDeg = 45;
    }
  }
  for (const a of s.actors) {
    normalizeActor(a, s);
  }
  const validActorIds = new Set(s.actors.map((a) => a.id));
  for (const c of s.cameras) {
    normalizeCameraData(c, validActorIds);
  }
  if (!Array.isArray(s.audioCues)) {
    s.audioCues = [];
  } else {
    const validActorIds = new Set(s.actors.map((a) => a.id));
    const validCamIds = new Set(s.cameras.map((c) => c.id));
    s.audioCues = s.audioCues
      .filter(isAudioCueData)
      .map((cue) => normalizeAudioCue(cue, validActorIds, validCamIds));
  }
  if (!Array.isArray(s.props)) {
    s.props = [];
  } else {
    s.props = s.props
      .filter(isPropData)
      .map((p) => normalizePropData(p))
      .filter((p): p is PropData => p !== null);
  }
  if (s.atmosphere === undefined) {
    s.atmosphere = createAtmosphereConfig('clear');
  } else {
    s.atmosphere = normalizeAtmosphereConfig(s.atmosphere);
  }
  if (s.architecture === undefined) {
    s.architecture = createArchitecturalSet(s.name ? `${s.name} Architecture` : 'Set Architecture');
  } else {
    s.architecture = normalizeArchitecturalSet(s.architecture);
  }
  if (s.livelink === undefined) {
    s.livelink = createLiveLinkConfig();
  } else {
    s.livelink = normalizeLiveLinkConfig(s.livelink);
  }
  if (!Array.isArray(s.gaussianClouds)) {
    s.gaussianClouds = [];
  } else {
    s.gaussianClouds = s.gaussianClouds
      .filter(isGaussianCloud)
      .map(normalizeGaussianCloud);
  }
  if (typeof s.activeSplatCloudId !== 'string' || !s.gaussianClouds.some((c) => c.id === s.activeSplatCloudId)) {
    s.activeSplatCloudId = s.gaussianClouds.length > 0 ? s.gaussianClouds[0].id : undefined;
  }
  if (s.dmxBridge === undefined) {
    s.dmxBridge = createDmxBridgeConfig();
  } else {
    s.dmxBridge = normalizeDmxBridgeConfig(s.dmxBridge);
  }
  if (!Array.isArray(s.dmxPatches)) {
    s.dmxPatches = [];
  } else {
    s.dmxPatches = s.dmxPatches.filter(isDmxPatchEntry).map(normalizeDmxPatchEntry);
  }
  if (!Array.isArray(s.dmxCues)) {
    s.dmxCues = [];
  } else {
    s.dmxCues = s.dmxCues.filter(isDmxCue).map(normalizeDmxCue);
  }
  if (s.icvfx === undefined) {
    s.icvfx = createLedVolumeConfig();
  } else {
    s.icvfx = normalizeLedVolumeConfig(s.icvfx);
  }
  if (s.acoustics === undefined) {
    s.acoustics = createAcousticsConfig('dialogue_soundstage');
  } else {
    s.acoustics = normalizeAcousticsConfig(s.acoustics);
  }
  if (s.solar === undefined) {
    s.solar = createSolarEnvironmentConfig('golden_hour_sunset', 'los_angeles');
  } else {
    s.solar = normalizeSolarEnvironmentConfig(s.solar);
  }
  if (s.screenplay === undefined) {
    s.screenplay = createScreenplayConfig();
  } else {
    s.screenplay = normalizeScreenplayConfig(s.screenplay);
  }
  if (s.profiler === undefined) {
    s.profiler = createVRProfilerConfig(72);
  } else {
    s.profiler = normalizeVRProfilerConfig(s.profiler);
  }
  if (s.comfort === undefined) {
    s.comfort = createVRComfortConfig();
  } else {
    s.comfort = normalizeVRComfortConfig(s.comfort);
  }
  if (s.setDressing === undefined) {
    s.setDressing = createSetDressingConfig();
  } else {
    s.setDressing = normalizeSetDressingConfig(s.setDressing);
  }
  return s;
}


// --- Video Village multi-camera layout matrix (pure domain) -----------------

export type VideoVillageLayoutMode = 'single' | 'split-2h' | 'split-2v' | 'grid-3' | 'grid-4' | 'pip';

export interface ViewportRect {
  /** Normalized X offset [0, 1] from top-left. */
  x: number;
  /** Normalized Y offset [0, 1] from top-left. */
  y: number;
  /** Normalized width [0, 1]. */
  width: number;
  /** Normalized height [0, 1]. */
  height: number;
}

export interface VideoVillageSlot {
  cameraIndex: number;
  cameraId: string;
  cameraName: string;
  /** Cell boundary within the master monitor viewport (normalized 0..1). */
  cellRect: ViewportRect;
  /** Active camera frame rectangle within the cell fitted to aspect ratio (normalized 0..1). */
  frameRect: ViewportRect;
  aspect: AspectName;
}

export interface VideoVillageLayout {
  mode: VideoVillageLayoutMode;
  totalCameras: number;
  activeSlots: VideoVillageSlot[];
}

/**
 * Automatically selects the recommended Video Village layout mode for a given camera count.
 */
export function autoVillageLayoutMode(cameraCount: number): VideoVillageLayoutMode {
  if (cameraCount <= 1) return 'single';
  if (cameraCount === 2) return 'split-2h';
  if (cameraCount === 3) return 'grid-3';
  return 'grid-4';
}

/**
 * Calculates letterbox or pillarbox frame rectangle within a container cell,
 * preserving the target camera aspect ratio.
 */
export function calculateLetterboxRect(
  containerRect: ViewportRect,
  targetAspect: number,
  containerAspect: number = 16 / 9,
): ViewportRect {
  const cellPhysicalAspect =
    (containerRect.width * containerAspect) / (containerRect.height > 0 ? containerRect.height : 1);
  if (targetAspect >= cellPhysicalAspect) {
    // Camera is wider than container cell: fit width, letterbox top/bottom
    const frameHeight = (containerRect.width * containerAspect) / targetAspect;
    const frameY = containerRect.y + (containerRect.height - frameHeight) / 2;
    return {
      x: containerRect.x,
      y: frameY,
      width: containerRect.width,
      height: Math.max(0, frameHeight),
    };
  } else {
    // Camera is taller than container cell: fit height, pillarbox left/right
    const frameWidth = (containerRect.height * targetAspect) / containerAspect;
    const frameX = containerRect.x + (containerRect.width - frameWidth) / 2;
    return {
      x: frameX,
      y: containerRect.y,
      width: Math.max(0, frameWidth),
      height: containerRect.height,
    };
  }
}

/**
 * Computes multi-camera Video Village tile layout coordinates and aspect-fitted frame rects.
 */
export function computeVillageLayout(
  cameras: Array<{ id: string; name: string; aspect: AspectName }>,
  mode?: VideoVillageLayoutMode,
  containerAspect: number = 16 / 9,
): VideoVillageLayout {
  const totalCameras = cameras.length;
  const effectiveMode = mode ?? autoVillageLayoutMode(totalCameras);
  const activeSlots: VideoVillageSlot[] = [];

  if (totalCameras === 0) {
    return { mode: effectiveMode, totalCameras: 0, activeSlots: [] };
  }

  const getCellRect = (index: number, m: VideoVillageLayoutMode): ViewportRect => {
    switch (m) {
      case 'single':
        return { x: 0, y: 0, width: 1, height: 1 };
      case 'split-2h':
        return index === 0
          ? { x: 0, y: 0, width: 0.5, height: 1 }
          : { x: 0.5, y: 0, width: 0.5, height: 1 };
      case 'split-2v':
        return index === 0
          ? { x: 0, y: 0, width: 1, height: 0.5 }
          : { x: 0, y: 0.5, width: 1, height: 0.5 };
      case 'grid-3':
        if (index === 0) return { x: 0, y: 0, width: 1, height: 0.5 };
        if (index === 1) return { x: 0, y: 0.5, width: 0.5, height: 0.5 };
        return { x: 0.5, y: 0.5, width: 0.5, height: 0.5 };
      case 'grid-4': {
        const col = index % 2;
        const row = Math.floor(index / 2);
        return { x: col * 0.5, y: row * 0.5, width: 0.5, height: 0.5 };
      }
      case 'pip':
        if (index === 0) return { x: 0, y: 0, width: 1, height: 1 };
        return { x: 0.68, y: 0.68, width: 0.28, height: 0.28 };
    }
  };

  const slotCount =
    effectiveMode === 'single'
      ? 1
      : effectiveMode === 'split-2h' || effectiveMode === 'split-2v' || effectiveMode === 'pip'
      ? 2
      : effectiveMode === 'grid-3'
      ? 3
      : 4;

  const count = Math.min(totalCameras, slotCount);
  for (let i = 0; i < count; i++) {
    const cam = cameras[i];
    const cellRect = getCellRect(i, effectiveMode);
    const targetAspect = aspectValue(cam.aspect);
    const frameRect = calculateLetterboxRect(cellRect, targetAspect, containerAspect);
    activeSlots.push({
      cameraIndex: i,
      cameraId: cam.id,
      cameraName: cam.name,
      cellRect,
      frameRect,
      aspect: cam.aspect,
    });
  }

  return {
    mode: effectiveMode,
    totalCameras,
    activeSlots,
  };
}

// --- 180-degree line of action analysis --------------------------------------

export type LineOfActionSide = 'left' | 'right' | 'on-line' | 'on_line';

/**
 * Evaluates the 180-degree line of action between two scene subjects (or keyframe marks).
 * Detects if camera placements cross the axis, warning of potential visual continuity jumps.
 */
export function check180LineOfAction(
  cameras: CameraSetupData[],
  actor1Pos: Vec3,
  actor2Pos: Vec3,
): LineOfActionAnalysis {
  const dx = actor2Pos.x - actor1Pos.x;
  const dz = actor2Pos.z - actor1Pos.z;
  const len = Math.sqrt(dx * dx + dz * dz);

  const cameraSides: CameraAxisSide[] = [];
  if (len < 0.05) {
    // Actors are too close to define a stable axis
    for (const cam of cameras) {
      cameraSides.push({
        cameraId: cam.id,
        cameraName: cam.name,
        side: 'on-line',
        signedDistance: 0,
      });
    }
    return {
      has180Violation: false,
      hasCrossing: false,
      lineVector: {
        start: { x: actor1Pos.x, y: actor1Pos.y, z: actor1Pos.z },
        end: { x: actor2Pos.x, y: actor2Pos.y, z: actor2Pos.z },
      },
      axisStart: actor1Pos,
      axisEnd: actor2Pos,
      cameraSides,
      cameraA: {
        id: cameras[0]?.id || 'cam-0',
        name: cameras[0]?.name || 'Camera',
        sideOfLine: 'on_line',
      },
      cameraB: {
        id: cameras[1]?.id || cameras[0]?.id || 'cam-0',
        name: cameras[1]?.name || 'Camera',
        sideOfLine: 'on_line',
      },
      severity: 'safe',
      message: 'Actors too close to establish line of action.',
      angleDeltaDeg: 0,
    };
  }

  for (const cam of cameras) {
    const cx = cam.position.x - actor1Pos.x;
    const cz = cam.position.z - actor1Pos.z;
    // 2D cross product in XZ plane
    const cross = dx * cz - dz * cx;
    const signedDist = cross / len;
    let side: LineOfActionSide = 'on-line';
    if (signedDist > 0.05) side = 'left';
    else if (signedDist < -0.05) side = 'right';

    cameraSides.push({
      cameraId: cam.id,
      cameraName: cam.name,
      side,
      signedDistance: signedDist,
    });
  }

  const hasLeft = cameraSides.some((c) => c.side === 'left');
  const hasRight = cameraSides.some((c) => c.side === 'right');
  const hasCrossing = hasLeft && hasRight;

  return {
    has180Violation: hasCrossing,
    hasCrossing,
    lineVector: {
      start: { x: actor1Pos.x, y: actor1Pos.y, z: actor1Pos.z },
      end: { x: actor2Pos.x, y: actor2Pos.y, z: actor2Pos.z },
    },
    axisStart: actor1Pos,
    axisEnd: actor2Pos,
    cameraSides,
    cameraA: {
      id: cameras[0]?.id || 'cam-0',
      name: cameras[0]?.name || 'Camera 1',
      sideOfLine: cameraSides[0]?.side === 'left' ? 'left' : cameraSides[0]?.side === 'right' ? 'right' : 'on_line',
    },
    cameraB: {
      id: cameras[1]?.id || cameras[0]?.id || 'cam-0',
      name: cameras[1]?.name || 'Camera 2',
      sideOfLine: cameraSides[1]?.side === 'left' ? 'left' : cameraSides[1]?.side === 'right' ? 'right' : 'on_line',
    },
    severity: hasCrossing ? 'violation_180_cross' : 'safe',
    message: hasCrossing ? '180-degree axis crossing detected across cameras.' : 'All cameras positioned safely on one side of line.',
    angleDeltaDeg: 0,
  };
}
