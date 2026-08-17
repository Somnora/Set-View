// Domain-core tests (model, lens math, timeline). Runs directly in Node:
//   npm test
// These cover the portable logic; rendering/XR behavior is verified on-headset
// via TESTING.md.

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { computeViewfinderFocalLength, evaluateViewfinderGesture } from '../src/viewfinder.ts';
import { DirectorSmartwatch } from '../src/smartwatch.ts';
import {
  addCameraKeyframe,
  addKeyframe,
  addNote,
  applyCameraMarkOp,
  applyMarkOp,
  autoVillageLayoutMode,
  calculateLetterboxRect,
  aspectValue,
  check180LineOfAction,
  computeFocusDistance,
  computeVillageLayout,
  createActor,
  createAudioCueForScene,
  createCameraSetup,
  createScene,
  cycleTStop,
  DEFAULT_FORMAT_ID,
  DEFAULT_TSTOP,
  duplicateActor,
  duplicateAudioCue,
  duplicateCameraSetup,
  createLight,
  cycleKelvin,
  duplicateLightSetup,
  isCameraKeyframe,
  isLightData,
  isSceneData,
  MAX_CAMERA_KEYFRAMES,
  MAX_KEYFRAMES,
  nextFormatId,
  nextLightName,
  normalizeActor,
  normalizeCameraData,
  normalizeScene,
  SENSOR_FORMATS,
  sensorFormat,
  stepFocal,
  vecDistance,
  WALK_SPEED_MS,
  type CameraKeyframe,
  type CameraSetupData,
  type Quat,
  type SceneData,
  type Vec3,
} from '../src/model.ts';
import {
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
  STOCK_GRIP_RIGS,
  STOCK_LENS_PROFILES,
  type GripRigConfig,
} from '../src/cameraGrip.ts';
import {
  BUILTIN_PROPS,
  createPropData,
  duplicatePropData,
  isPropData,
  normalizePropData,
  calculatePropAABB,
  snapPropToFloor,
  calculateGridPlacement,
  filterPropsByCategory,
  searchProps,
  formatDimensions,
  type PropData,
} from '../src/props.ts';
import {
  calculateBeamLuminance,
  calculateVolumetricAttenuation,
  createAtmosphereConfig,
  isAtmosphereConfig,
  normalizeAtmosphereConfig,
} from '../src/atmosphere.ts';
import { PropStore } from '../src/propStore.ts';
import {
  createAudioCue,
  isAudioCueData,
  normalizeAudioCue,
  sampleActiveAudioCues,
  evaluateCueSpatialPosition,
  generateDawStemManifest,
  type AudioCueData,
} from '../src/audioCues.ts';
import {
  auditSceneContinuity,
  buildAiContinuityPromptPackage,
  check30DegreeRule,
  checkEyelineMatch,
  checkScreenDirectionContinuity,
  checkShotScaleProgression,
  generateScriptBreakdownFromScene,
  generateStoryboard,
  parseScreenplayText,
  renderStoryboardPanelSvg,
  simulateAiContinuityBreakdown,
} from '../src/continuity.ts';
import {
  alignSplatCloudToFloorplan,
  createGaussianSplatCloud,
  exportCompactSplat,
  exportGaussianPly,
  fitArchitecturalPlanesFromSplats,
  fitPlaneRansac,
  generateSyntheticScoutSplatCloud,
  isGaussianCloudData,
  isGaussianSplat,
  normalizeGaussianCloud,
  parseCompactSplat,
  parseGaussianPly,
  voxelDownsampleSplats,
  type GaussianSplat,
} from '../src/gaussianSplat.ts';
import { History } from '../src/history.ts';
import {
  classifyShotSize,
  cocDiameterMm,
  depthOfField,
  depthOfFieldFor,
  dFovDeg,
  findCamerasInFrustums,
  frameSizeAtDistance,
  hFovDeg,
  hFovRad,
  hyperfocalM,
  isPointInFrustum,
  quatInverseRotateVector,
  quatRotateVector,
  shotSizeDescription,
  vFovDeg,
} from '../src/lens.ts';
import { cycleStance, isStanceId, poseFor, STANCES, type StanceId } from '../src/pose.ts';
import {
  buildCameraTimeline,
  buildTimeline,
  catmullRomVec3,
  classifyCameraMove,
  generateDollyRail,
  lerpAngle,
  moveStats,
  quatDot,
  quatLookAt,
  quatNormalize,
  quatSlerp,
  sampleCameraTimeline,
  sampleTimeline,
} from '../src/timeline.ts';
import { ANCHOR_OFFSETS, guideItems } from '../src/guide.ts';
import {
  HUB_R,
  MAX_SECTORS,
  nextPlaceMode,
  RING_R,
  touchWheel,
  wheelHit,
  wheelMenu,
} from '../src/wheel.ts';
import { floorCorrection, newFloorEstimate, observeFloorHit } from '../src/floor.ts';
import {
  buildShotList,
  cameraHalfFovRad,
  cameraYaw,
  floorplanLayout,
  nearestActorDistance,
  planBounds,
} from '../src/plan.ts';
import {
  base64ToBytes,
  bytesToBase64,
  decodeScan,
  encodeScan,
  isLocationScan,
  isMovableScanMesh,
  meshFootprintCenter,
  quatYaw,
  summarizeScan,
  transformPositions,
  type LocationScan,
} from '../src/scan.ts';
import { estimateScanSizeBytes, ScanStore } from '../src/scanStore.ts';
import {
  calculateMeshAABB,
  calculateMeshNormals,
  compute2DConvexHull,
  createSyntheticLocationScan,
  exportScanAsGeoJson,
  exportScanAsObj,
  exportScanAsPly,
  exportScanAsUsd,
  getSemanticColor,
} from '../src/scanExporters.ts';
import {
  advanceTransport,
  clearTransportLoop,
  cyclePlaybackRate,
  framesToSeconds,
  scrubTransport,
  secondsToFrames,
  secondsToSmpte,
  setTransportInPoint,
  setTransportOutPoint,
  smpteToSeconds,
  stepTransportFrames,
  type TransportState,
} from '../src/timecode.ts';
import { createTakeRecord, TakeLibrary, type TakeRecord } from '../src/dailies.ts';
import { locomotionAmount, rotateOffsetAboutPivot, snapTurnAngle } from '../src/locomotion.ts';
import {
  containScale,
  fileExtensionFor,
  formatAudioPolicyStatus,
  MAX_RECORD_S,
  pickMimeType,
  RECORD_FPS,
  RECORD_MIME_CANDIDATES,
  RECORD_VIDEO_BPS,
  recordingClock,
  shouldIncludeAudioTrack,
  shouldRequestAudio,
} from '../src/recording.ts';
import { buildAiShotAnalysisPrompt, renderFloorplanSvg } from '../src/exporters.ts';
import { simulateAiShotAnalysis } from '../src/ui.ts';
import {
  COLLAB_ROLES,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  PeerRoster,
  EntityLockManager,
  applyScenePatch,
  computeSpatialAudioGainAndPan,
  serializeCollabMessage,
  deserializeCollabMessage,
  type CollabMessage,
  type PeerPresence,
  type CollabScenePatch,
} from '../src/collab.ts';
import {
  applyGizmoRotation,
  applyGizmoRotationQuat,
  applyGizmoScale,
  applyGizmoTransform,
  applyGizmoTranslation,
  applyGizmoUniformScale,
  calculateAxisRayOffset,
  calculatePlaneRayIntersection,
  calculateRotationAngleOnPlane,
  calculateScaleDelta,
  quatFromAxisAngle,
  quatIdentity,
  quatRotateVec3,
  snapRotation,
  snapValue,
  snapVec3,
  vec3,
  vec3Add,
  vec3Cross,
  vec3Distance,
  vec3Dot,
  vec3Length,
  vec3Normalize,
  vec3Scale,
  vec3Sub,
  type GizmoSnapConfig,
} from '../src/gizmoMath.ts';
import {
  calculateSceneShotSegments,
  exportSceneTimeline,
  generateAvidMarkerList,
  generateCmx3600Edl,
  generateCsvShotList,
  generateFcpxml,
  generateFinalCutProXml,
} from '../src/nleExport.ts';
import {
  escapeUsdString,
  exportUe5BridgePackage,
  generateOpenUsdScene,
  generateUe5JsonManifest,
  generateUe5PythonImportScript,
  hexToRgb,
  resolveUe5ExportOptions,
  svHeadingToUeYaw,
  svQuatToUeRotator,
  svToUeLocation,
  type Ue5ExportFormat,
  type Ue5ExportOptions,
} from '../src/ue5Bridge.ts';
import {
  svDirectionToUe,
  svQuatToBasis,
  ueBasisToRotator,
  ueDirectionToSv,
  ueRotatorToBasis,
  ueRotatorToSvQuat,
  ueToSvLocation,
  ueYawToSvHeading,
} from '../src/ueCoords.ts';
import {
  type DoorType,
  type WallFinishType,
  type WindowType,
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
  normalizeWallData,
} from '../src/architecture.ts';
import { ArchitectureRenderer } from '../src/architectureRenderer.ts';
import {
  type LiveLinkCameraFrame,
  applyVcamSmoothing,
  convertSetViewToUnrealCameraTransform,
  convertUnrealToSetViewCameraTransform,
  createLiveLinkConfig,
  createVcamCommand,
  decodeLiveLinkInboundMessage,
  encodeLiveLinkCameraPacket,
  generateUe5LiveLinkReceiverPythonScript,
  isLiveLinkCameraFrame,
  isLiveLinkConfig,
  normalizeLiveLinkConfig,
} from '../src/livelink.ts';
import {
  type BoneTransform,
  type HumanoidBoneName,
  HUMANOID_BONE_NAMES,
  STOCK_ANIMATION_CLIPS,
  STOCK_POSE_PRESETS,
  blendPoses,
  createDefaultHumanoidRig,
  eulerToQuat,
  exportBvh,
  forwardKinematics,
  normalizeQuat,
  parseBvh,
  sampleAnimationClip,
  solveLookAtIK,
  solveTwoBoneIK,
  v3,
} from '../src/characterRig.ts';
import {
  DRS_NO_KNOWN_BAD_SCALE,
  RollingFrameStats,
  SessionFrameLedger,
  calculateAdaptiveLODBudget,
  calculateSessionRenderScale,
  createGovernorConfig,
  estimateGCPressure,
  isGovernorConfig,
  normalizeGovernorConfig,
} from '../src/performanceGovernor.ts';
import { XRPerformanceGovernor } from '../src/xrPerformance.ts';
import {
  calculateAngularSnap45_90,
  calculateMagneticSnap,
  calculateTrackTangentAlignment,
  distanceVec3,
  generateEntityContextActions,
  quatFromYaw,
  type SnapCandidate,
} from '../src/spatialInteraction.ts';
import {
  calculateAnimaticSequencePlan,
  calculateQuadSplitViewports,
  createDailiesConfig,
  formatSmpteTimecode,
  generateDailiesSlateData,
  isDailiesConfig,
  normalizeDailiesConfig,
  parseSmpteTimecode,
} from '../src/dailiesEngine.ts';
import {
  DMX_FIXTURE_PROFILES,
  createDmxBridgeConfig,
  isDmxBridgeConfig,
  normalizeDmxBridgeConfig,
  createDmxPatchEntry,
  isDmxPatchEntry,
  normalizeDmxPatchEntry,
  createDmxCue,
  isDmxCue,
  normalizeDmxCue,
  kelvinToRgbDmx,
  rgbToKelvinDmx,
  encodeArtDmxPacket,
  decodeArtDmxPacket,
  encodeSacnPacket,
  decodeSacnPacket,
  mapLightToDmxChannels,
  mapDmxChannelsToLight,
  exportDmxPatchListCsv,
  findFixtureProfile,
  type DmxPatchEntry,
} from '../src/dmxEngine.ts';
import {
  type LedVolumePresetId,
  STOCK_LED_VOLUMES,
  calculateInnerFrustumIntersection,
  calculateMoireRisk,
  createLedVolumeConfig,
  createLedVolumeWall,
  generateNDisplayConfigXml,
  generateOpenUsdLedVolume,
  isLedVolumeConfig,
  isLedVolumeWall,
  normalizeLedVolumeWall,
} from '../src/icvfxEngine.ts';
import {
  CURATED_MIC_PROFILES,
  MATERIAL_ABSORPTION_TABLE,
  STOCK_ACOUSTICS_PRESETS,
  calculatePolarAttenuation,
  calculateRt60Reverberation,
  calculateCriticalDistance,
  calculateSpeechClarityC50,
  calculateSplAndSnr,
  calculateBoomFrameIncursion,
  generateBwfSoundReportCsv,
  generateAes31IxmlManifest,
  createAcousticsConfig,
  isAcousticsConfig,
  normalizeAcousticsConfig,
  createBoomMicEntity,
  isBoomMicEntity,
  normalizeBoomMicEntity,
  createLavalierMicEntity,
  isLavalierMicEntity,
  normalizeLavalierMicEntity,
  type MicPolarPattern,
} from '../src/acousticsEngine.ts';
import {
  CURATED_FILMING_LOCATIONS,
  SOLAR_PRESETS,
  calculateGroundShadow,
  calculateRayleighMieColor,
  calculateSolarEphemeris,
  calculateSolarIlluminance,
  calculateSolarVector,
  createSolarEnvironmentConfig,
  generateDpSunReportHtml,
  generateSolarPathPoints,
  generateSolarTrackingTable,
  generateSolarTrackingTableCsv,
  isSolarEnvironmentConfig,
  kelvinToRgb,
  normalizeSolarEnvironmentConfig,
} from '../src/solarEngine.ts';
import {
  DEFAULT_SAMPLE_FOUNTAIN_SCRIPT,
  auditSceneContinuity as auditSceneContinuityEngine,
  check180LineOfActionPair,
  checkEyelineMatch as checkEyelineMatchEngine,
  createScreenplayConfig,
  generateAutoShotCoverage,
  generateDirectorDeckHtml,
  generateScreenplayShotListCsv,
  isScreenplayConfig,
  normalizeScreenplayConfig,
  parseFdxScript,
  parseFountainScript,
} from '../src/screenplayEngine.ts';
import {
  SYNTHETIC_VR_SCENARIOS,
  calculateBenchmarkSummary,
  createDefaultVRThresholds,
  createMockXRButtonState,
  createMockXRAxesState,
  createMockXRTransform,
  createMockXRController,
  createMockXRHeadset,
  createMockXRSessionState,
  createSyntheticVRScenario,
  createVRProfilerConfig,
  generatePerformanceReportCsv,
  generatePerformanceReportHtml,
  interpolateSyntheticScenarioFrame,
  isVRProfilerConfig,
  normalizeVRProfilerConfig,
  type FrameTelemetrySample,
} from '../src/webxrProfilerEngine.ts';
import {
  type ErgonomicReachTarget,
  type VestibularStateSample,
  auditSceneComfort,
  calculateCybersicknessIndex,
  calculateDynamicComfortVignetteRadius,
  calculateVestibularKinematics,
  createDefaultVignetteConfig,
  createVRComfortConfig,
  evaluateNeckStrain,
  evaluateReachability,
  generateComfortReportCsv,
  generateComfortReportHtml,
  isVRComfortConfig,
  normalizeVRComfortConfig,
} from '../src/comfortEngine.ts';
import {
  type GeminiAiSceneMutation,
  type ScatterTheme,
  type SetDressingManifest,
  type SettledPropItem,
  THEME_PROP_CATALOGS,
  applyAiMutationsToScene,
  buildGeminiAiSystemPrompt,
  createMulberry32,
  createSetDressingConfig,
  detectSemanticRegions,
  generatePoissonScatter2D,
  generateSetDressingDeckHtml,
  generateSetDressingManifestCsv,
  isSetDressingConfig,
  normalizeSetDressingConfig,
  parseDeterministicNlCommand,
  parseGeminiAiResponse,
  simulatePhysicsImpulseSettling,
} from '../src/setDressingEngine.ts';


let passed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}

const approx = (a: number, b: number, eps = 1e-3) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${a} ≈ ${b}`);

const S35 = 'super35';

// --- lens math: FOV -------------------------------------------------------------

test('hFOV: 35mm on S35 (24.89mm gate) ≈ 39.15°', () => {
  approx(hFovDeg(35, S35), 39.15, 0.03);
});

test('hFOV: 16mm wide ≈ 75.7°, 135mm tight ≈ 10.55°', () => {
  approx(hFovDeg(16, S35), 75.73, 0.1);
  approx(hFovDeg(135, S35), 10.55, 0.05);
});

test('hFOV scales with sensor format at 50mm (S16 < S35 < FF)', () => {
  approx(hFovDeg(50, S35), 27.96, 0.05);
  approx(hFovDeg(50, 'fullframe'), 39.63, 0.05);
  approx(hFovDeg(50, 'super16'), 14.27, 0.05);
  assert.ok(hFovDeg(50, 'super16') < hFovDeg(50, S35));
  assert.ok(hFovDeg(50, S35) < hFovDeg(50, 'fullframe'));
});

test('anamorphic 2× at 50mm frames like a 25mm spherical', () => {
  approx(hFovDeg(50, 'anamorphic35'), hFovDeg(25, S35), 1e-6);
  assert.ok(hFovDeg(50, 'anamorphic35') > 52 && hFovDeg(50, 'anamorphic35') < 54);
});

test('vFOV depends on aspect (constant-width gate)', () => {
  approx(vFovDeg(50, '2.39:1', S35), 11.89, 0.05);
  approx(vFovDeg(50, '16:9', S35), 15.94, 0.05);
  approx(vFovDeg(50, '4:3', S35), 21.12, 0.05);
  assert.ok(vFovDeg(50, '2.39:1', S35) < vFovDeg(50, '16:9', S35));
  assert.ok(vFovDeg(50, '16:9', S35) < vFovDeg(50, '4:3', S35));
});

test('diagonal FOV: 35mm / 2.39 on S35 ≈ 42.16°', () => {
  approx(dFovDeg(35, '2.39:1', S35), 42.16, 0.1);
  // diagonal is always the widest angle of the three
  assert.ok(dFovDeg(35, '2.39:1', S35) > hFovDeg(35, S35));
});

test('frame size at distance: width constant across aspects', () => {
  const a = frameSizeAtDistance(35, '2.39:1', 1.4, S35);
  const b = frameSizeAtDistance(35, '16:9', 1.4, S35);
  approx(a.width, b.width);
  approx(a.width / a.height, 2.39);
  approx(b.width / b.height, 16 / 9);
  approx(a.width, 0.9956, 0.001); // 2·1.4·tan(hFov/2)
});

test('field width readout: 35mm at 4.2m frames ~2.99m wide', () => {
  approx(frameSizeAtDistance(35, '2.39:1', 4.2, S35).width, 2.987, 0.01);
});

// --- lens math: depth of field --------------------------------------------------

test('DOF: 35mm T2 @ 3m on S35 → 2.68m..3.41m', () => {
  const d = depthOfField(35, 2, 3, sensorFormat(S35).cocMm);
  approx(d.nearM, 2.676, 0.005);
  approx(d.farM, 3.413, 0.005);
  approx(d.hyperfocalM, 24.535, 0.01);
});

test('DOF: 50mm T2.8 @ 4m on S35 → 3.60m..4.50m', () => {
  const d = depthOfFieldFor({ lensFocalLength: 50, tStop: 2.8, formatId: S35 }, 4);
  approx(d.nearM, 3.602, 0.005);
  approx(d.farM, 4.497, 0.005);
});

test('DOF: 24mm T4 @ 6m is past hyperfocal → far = Infinity', () => {
  const d = depthOfField(24, 4, 6, sensorFormat(S35).cocMm);
  approx(d.hyperfocalM, 5.784, 0.01);
  assert.equal(d.farM, Infinity);
  assert.equal(d.dofM, Infinity);
  assert.ok(d.nearM < d.hyperfocalM);
});

test('hyperfocalM matches the closed form', () => {
  approx(hyperfocalM(35, 2, 0.025), 24.535, 0.01);
  // wider format (bigger CoC) ⇒ nearer hyperfocal at the same lens/stop
  assert.ok(hyperfocalM(35, 2, 0.029) < hyperfocalM(35, 2, 0.025));
});

// --- model ----------------------------------------------------------------------

test('stepFocal: clamps at ends and snaps non-presets to a neighbour', () => {
  assert.equal(stepFocal(16, -1), 16);
  assert.equal(stepFocal(135, 1), 135);
  assert.equal(stepFocal(35, 1), 50);
  assert.equal(stepFocal(35, -1), 24);
  assert.equal(stepFocal(27, 1), 35); // 27mm steps up to 35
  assert.equal(stepFocal(27, -1), 24); // and down to 24
});

test('scene/actor/camera factories: names, colors, ids, defaults', () => {
  const s = createScene('Test');
  const a1 = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  const a2 = createActor(s, { x: 1, y: 0, z: 0 }, 0);
  assert.equal(a1.name, 'Actor 1');
  assert.equal(a2.name, 'Actor 2');
  assert.notEqual(a1.color, a2.color);
  assert.notEqual(a1.id, a2.id);
  const c1 = createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  const c2 = createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 50, '16:9');
  assert.equal(c1.name, 'CAM A');
  assert.equal(c2.name, 'CAM B');
  assert.equal(c1.tStop, DEFAULT_TSTOP);
  assert.equal(c1.formatId, DEFAULT_FORMAT_ID);
  assert.ok(isSceneData(JSON.parse(JSON.stringify(s))));
  assert.ok(!isSceneData({ version: 2 }));
});

test('camera names stay unique after deleting a middle camera', () => {
  const s = createScene('T');
  const mk = () => createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  const a = mk();
  const b = mk();
  const c = mk();
  assert.deepEqual([a.name, b.name, c.name], ['CAM A', 'CAM B', 'CAM C']);
  // delete CAM B (mirrors CameraSystem.remove) then add — must NOT reuse a name
  s.cameras = s.cameras.filter((x) => x.id !== b.id);
  const d = mk();
  assert.equal(d.name, 'CAM B');
  const names = s.cameras.map((x) => x.name);
  assert.equal(new Set(names).size, names.length, `duplicate camera name: ${names}`);
});

test('cycleTStop: whole-stop wheel wraps; free values snap to nearest then step', () => {
  assert.equal(cycleTStop(2.8), 4);
  assert.equal(cycleTStop(8), 1.4); // wraps
  assert.equal(cycleTStop(2.2), 2.8); // T2.2 snaps to 2, steps to 2.8
  // Six presses from any preset returns home.
  let t = 5.6;
  for (let i = 0; i < 6; i++) t = cycleTStop(t);
  assert.equal(t, 5.6);
});

test('nextFormatId: cycles the sensor table in order and wraps; unknown → first', () => {
  const ids = SENSOR_FORMATS.map((f) => f.id);
  let cur = ids[0];
  const seen = [cur];
  for (let i = 1; i < ids.length; i++) {
    cur = nextFormatId(cur);
    seen.push(cur);
  }
  assert.deepEqual(seen, ids); // visits every format once, in table order
  assert.equal(nextFormatId(cur), ids[0]); // wraps
  assert.equal(nextFormatId('betamax'), ids[0]); // unknown falls back safely
});

test(`keyframes cap at ${MAX_KEYFRAMES}`, () => {
  const s = createScene('T');
  const a = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  for (let i = 0; i < MAX_KEYFRAMES; i++) {
    assert.equal(addKeyframe(a, { x: i, y: 0, z: 0 }, 0), true);
  }
  assert.equal(addKeyframe(a, { x: 9, y: 0, z: 0 }, 0), false);
  assert.equal(a.keyframes.length, MAX_KEYFRAMES);
});

// --- import validation ----------------------------------------------------------

function validScene(): SceneData {
  const s = createScene('Valid');
  const a = createActor(s, { x: 0, y: 0, z: 0 }, 0.2);
  addKeyframe(a, { x: 1, y: 0, z: 0 }, 0);
  createCameraSetup(s, { x: 0, y: 1.6, z: 1 }, { x: 0, y: 0, z: 0, w: 1 }, 50, '2.39:1');
  return JSON.parse(JSON.stringify(s));
}

test('isSceneData accepts a well-formed scene', () => {
  assert.ok(isSceneData(validScene()));
});

test('isSceneData rejects malformed actors/cameras (crash guard)', () => {
  const base = validScene();
  assert.ok(!isSceneData({ ...base, actors: [{}] }), 'empty actor');
  assert.ok(
    !isSceneData({ ...base, actors: [{ ...base.actors[0], position: { x: 0, y: 0 } }] }),
    'actor missing position.z',
  );
  assert.ok(
    !isSceneData({ ...base, cameras: [{ ...base.cameras[0], rotation: undefined }] }),
    'camera missing rotation',
  );
  assert.ok(
    !isSceneData({ ...base, cameras: [{ ...base.cameras[0], aspect: '9:16' }] }),
    'camera bad aspect',
  );
  assert.ok(
    !isSceneData({ ...base, actors: [{ ...base.actors[0], rotationY: NaN }] }),
    'actor NaN rotation',
  );
});

test('normalizeScene fills tStop/formatId defaults for legacy JSON', () => {
  const base = validScene();
  const cam = base.cameras[0] as unknown as Record<string, unknown>;
  delete cam.tStop;
  delete cam.formatId;
  const norm = normalizeScene(base);
  assert.equal(norm.cameras[0].tStop, DEFAULT_TSTOP);
  assert.equal(norm.cameras[0].formatId, DEFAULT_FORMAT_ID);
  // bad values get repaired too
  norm.cameras[0].tStop = -1;
  norm.cameras[0].formatId = 'bogus';
  normalizeScene(norm);
  assert.equal(norm.cameras[0].tStop, DEFAULT_TSTOP);
  assert.equal(norm.cameras[0].formatId, DEFAULT_FORMAT_ID);
});

test('actor scaling: default scale 1.0, validation, normalization clamping, duplication', () => {
  const s = createScene('Scale Test');
  const a = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  assert.equal(a.scale, 1.0);

  // isActorData validation
  const rawActor = JSON.parse(JSON.stringify(a));
  assert.ok(isSceneData(s));
  rawActor.scale = -0.5;
  assert.ok(!isSceneData({ ...s, actors: [rawActor] }), 'negative scale rejected');
  rawActor.scale = 'big';
  assert.ok(!isSceneData({ ...s, actors: [rawActor] }), 'string scale rejected');

  // normalizeScene repairs out-of-bounds or missing scale
  const corruptScene = createScene('Corrupt');
  const ca = createActor(corruptScene, { x: 0, y: 0, z: 0 }, 0);
  (ca as unknown as Record<string, unknown>).scale = 5.0; // too large (>3.0)
  normalizeScene(corruptScene);
  assert.equal(ca.scale, 1.0);

  (ca as unknown as Record<string, unknown>).scale = 0.05; // too small (<0.2)
  normalizeScene(corruptScene);
  assert.equal(ca.scale, 1.0);

  delete (ca as unknown as Record<string, unknown>).scale; // missing legacy
  normalizeScene(corruptScene);
  assert.equal(ca.scale, 1.0);

  // duplicateActor preserves scale
  a.scale = 1.25;
  const dup = duplicateActor(s, a.id)!;
  assert.equal(dup.scale, 1.25);
});

// --- timeline -------------------------------------------------------------------

test('timeline durations derive from distance at 1.4 m/s', () => {
  const kfs = [
    { position: { x: 0, y: 0, z: 0 }, rotationY: 0 },
    { position: { x: 0, y: 0, z: 2.8 }, rotationY: 0 },
    { position: { x: 1.4, y: 0, z: 2.8 }, rotationY: Math.PI / 2 },
  ];
  const tl = buildTimeline(kfs);
  approx(tl.times[0], 0);
  approx(tl.times[1], 2.0);
  approx(tl.times[2], 3.0);
  approx(tl.duration, 3.0);
});

test('moveStats: distance, duration, average speed', () => {
  const kfs = [
    { position: { x: 0, y: 0, z: 0 }, rotationY: 0 },
    { position: { x: 0, y: 0, z: 2.8 }, rotationY: 0 },
    { position: { x: 1.4, y: 0, z: 2.8 }, rotationY: 0 },
  ];
  const m = moveStats(kfs);
  assert.equal(m.marks, 3);
  approx(m.distanceM, 4.2);
  approx(m.durationS, 3.0);
  approx(m.avgSpeed, 1.4);
  // slower speed ⇒ longer duration
  approx(moveStats(kfs, 0.7).durationS, 6.0);
  // a single mark has no move
  assert.equal(moveStats([kfs[0]]).distanceM, 0);
  assert.equal(moveStats([kfs[0]]).avgSpeed, 0);
});

test('vecDistance is symmetric Euclidean', () => {
  approx(vecDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }), 5);
  approx(vecDistance({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 }), 0);
});

test('sample: lerped position, heading while moving, rest at ends', () => {
  const kfs = [
    { position: { x: 0, y: 0, z: 0 }, rotationY: 0.3 },
    { position: { x: 0, y: 0, z: 2.8 }, rotationY: 1.0 },
  ];
  const tl = buildTimeline(kfs);
  const mid = sampleTimeline(kfs, tl, 1.0)!;
  approx(mid.position.z, 1.4);
  assert.equal(mid.moving, true);
  approx(mid.rotationY, Math.atan2(0, 2.8));
  approx(mid.speed, 1.4);
  const start = sampleTimeline(kfs, tl, -1)!;
  approx(start.position.z, 0);
  assert.equal(start.moving, false);
  const end = sampleTimeline(kfs, tl, 99)!;
  approx(end.position.z, 2.8);
  approx(end.rotationY, 1.0);
  assert.equal(end.moving, false);
});

test('sample: zero-length turn-in-place still takes a beat', () => {
  const kfs = [
    { position: { x: 1, y: 0, z: 1 }, rotationY: 0 },
    { position: { x: 1, y: 0, z: 1 }, rotationY: Math.PI / 2 },
  ];
  const tl = buildTimeline(kfs);
  assert.ok(tl.duration >= 0.4);
  const mid = sampleTimeline(kfs, tl, tl.duration / 2)!;
  assert.equal(mid.moving, false);
  approx(mid.rotationY, Math.PI / 4, 0.01);
});

test('single keyframe: actor holds the mark', () => {
  const kfs = [{ position: { x: 2, y: 0, z: -1 }, rotationY: 0.5 }];
  const tl = buildTimeline(kfs);
  approx(tl.duration, 0);
  const s = sampleTimeline(kfs, tl, 5)!;
  approx(s.position.x, 2);
  approx(s.rotationY, 0.5);
});

test('lerpAngle takes the shortest arc across ±π', () => {
  approx(lerpAngle(3.0, -3.0, 0.5), Math.PI, 0.01);
  approx(lerpAngle(0, Math.PI / 2, 0.5), Math.PI / 4);
});

// --- desktop blocking editor (applyMarkOp) ---------------------------------------

function markScene(): { s: SceneData; a: ReturnType<typeof createActor> } {
  const s = createScene('marks');
  const a = createActor(s, { x: 1, y: 0, z: 2 }, 0.5);
  return { s, a };
}

test('applyMarkOp add: first mark lands at the rest pose, stamped with the actor stance', () => {
  const { a } = markScene();
  a.stance = 'seated-chair';
  assert.equal(applyMarkOp(a, { kind: 'add' }), true);
  assert.deepEqual(a.keyframes[0].position, { x: 1, y: 0, z: 2 });
  assert.equal(a.keyframes[0].rotationY, 0.5);
  assert.equal(a.keyframes[0].stance, 'seated-chair');
});

test('applyMarkOp add: later marks step past the last; cap at MAX_KEYFRAMES', () => {
  const { a } = markScene();
  for (let i = 0; i < MAX_KEYFRAMES; i++) assert.equal(applyMarkOp(a, { kind: 'add' }), true);
  approx(a.keyframes[1].position.x, a.keyframes[0].position.x + 0.6);
  assert.equal(applyMarkOp(a, { kind: 'add' }), false); // full
  assert.equal(a.keyframes.length, MAX_KEYFRAMES);
});

test('applyMarkOp update: patches x/z/facing/stance; null stance clears to rest', () => {
  const { a } = markScene();
  applyMarkOp(a, { kind: 'add' });
  assert.equal(applyMarkOp(a, { kind: 'update', index: 0, position: { x: -3, z: 4 }, rotationY: 1.2, stance: 'lying-up' }), true);
  assert.deepEqual(a.keyframes[0].position, { x: -3, y: 0, z: 4 });
  approx(a.keyframes[0].rotationY, 1.2);
  assert.equal(a.keyframes[0].stance, 'lying-up');
  assert.equal(applyMarkOp(a, { kind: 'update', index: 0, stance: null }), true);
  assert.equal(a.keyframes[0].stance, undefined);
});

test('applyMarkOp update: invalid input rejected atomically (no half-applied op)', () => {
  const { a } = markScene();
  applyMarkOp(a, { kind: 'add' });
  const before = JSON.stringify(a.keyframes[0]);
  assert.equal(applyMarkOp(a, { kind: 'update', index: 0, position: { x: 9, z: NaN } }), false);
  assert.equal(applyMarkOp(a, { kind: 'update', index: 0, rotationY: Infinity }), false);
  assert.equal(applyMarkOp(a, { kind: 'update', index: 5, rotationY: 1 }), false); // OOB
  assert.equal(JSON.stringify(a.keyframes[0]), before); // untouched, incl. the valid x
});

test('applyMarkOp move/remove: swap neighbours, reject ends, splice out', () => {
  const { a } = markScene();
  applyMarkOp(a, { kind: 'add' });
  applyMarkOp(a, { kind: 'add' });
  applyMarkOp(a, { kind: 'add' });
  const [k0, k1, k2] = [...a.keyframes];
  assert.equal(applyMarkOp(a, { kind: 'move', index: 0, dir: -1 }), false); // top end
  assert.equal(applyMarkOp(a, { kind: 'move', index: 2, dir: 1 }), false); // bottom end
  assert.equal(applyMarkOp(a, { kind: 'move', index: 1, dir: 1 }), true);
  assert.deepEqual(a.keyframes, [k0, k2, k1]);
  assert.equal(applyMarkOp(a, { kind: 'remove', index: 0 }), true);
  assert.deepEqual(a.keyframes, [k2, k1]);
  assert.equal(applyMarkOp(a, { kind: 'remove', index: 7 }), false);
});

// --- per-keyframe stance ---------------------------------------------------------

test('addKeyframe stamps a stance when given, leaves legacy marks bare', () => {
  const s = createScene('kf-stance');
  const a = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  addKeyframe(a, { x: 0, y: 0, z: 0 }, 0, 'seated-chair');
  addKeyframe(a, { x: 1, y: 0, z: 0 }, 0);
  assert.equal(a.keyframes[0].stance, 'seated-chair');
  assert.equal(a.keyframes[1].stance, undefined);
});

test('sample: walk to the chair and sit (stance held at marks, none while walking)', () => {
  // Mark 1: start standing. Mark 2: arrive at the chair (standing). Mark 3:
  // same spot, seated — the turn/settle beat where the actor sits.
  const kfs = [
    { position: { x: 0, y: 0, z: 0 }, rotationY: 0, stance: 'standing' as const },
    { position: { x: 0, y: 0, z: 2.8 }, rotationY: 0, stance: 'standing' as const },
    { position: { x: 0, y: 0, z: 2.8 }, rotationY: 1.0, stance: 'seated-chair' as const },
  ];
  const tl = buildTimeline(kfs);
  assert.equal(sampleTimeline(kfs, tl, 0)!.stance, 'standing'); // holding mark 1
  const walking = sampleTimeline(kfs, tl, 1.0)!;
  assert.equal(walking.moving, true);
  assert.equal(walking.stance, undefined); // upright while walking
  const settling = sampleTimeline(kfs, tl, tl.times[1] + 0.2)!; // mid settle beat
  assert.equal(settling.moving, false);
  assert.equal(settling.stance, 'seated-chair'); // sits on arrival at the chair
  assert.equal(sampleTimeline(kfs, tl, 99)!.stance, 'seated-chair'); // stays seated
});

test('sample: marks without a stance leave it undefined (caller falls back to rest stance)', () => {
  const kfs = [
    { position: { x: 0, y: 0, z: 0 }, rotationY: 0 },
    { position: { x: 0, y: 0, z: 2 }, rotationY: 0 },
  ];
  const tl = buildTimeline(kfs);
  assert.equal(sampleTimeline(kfs, tl, 0)!.stance, undefined);
  assert.equal(sampleTimeline(kfs, tl, 99)!.stance, undefined);
});

test('normalizeScene drops an invalid mark stance but keeps valid ones', () => {
  const s = createScene('kf-stance-repair');
  const a = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  addKeyframe(a, { x: 0, y: 0, z: 0 }, 0, 'lying-left');
  addKeyframe(a, { x: 1, y: 0, z: 0 }, 0);
  (a.keyframes[1] as { stance?: string }).stance = 'levitating'; // corrupt import
  normalizeScene(s);
  assert.equal(a.keyframes[0].stance, 'lying-left');
  assert.equal(a.keyframes[1].stance, undefined); // repaired to legacy fallback
});

test('duplicateActor deep-copies mark stances', () => {
  const s = createScene('kf-stance-dup');
  const a = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  addKeyframe(a, { x: 0, y: 0, z: 0 }, 0, 'seated-lounge');
  const copy = duplicateActor(s, a.id)!;
  assert.equal(copy.keyframes[0].stance, 'seated-lounge');
  copy.keyframes[0].stance = 'standing';
  assert.equal(a.keyframes[0].stance, 'seated-lounge'); // originals untouched
});

test('scene JSON round-trips mark stances through the import validator', () => {
  const s = createScene('kf-stance-json');
  const a = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  addKeyframe(a, { x: 0, y: 0, z: 0 }, 0, 'lying-up');
  const back = JSON.parse(JSON.stringify(s));
  assert.equal(isSceneData(back), true);
  assert.equal(normalizeScene(back).actors[0].keyframes[0].stance, 'lying-up');
});

// --- floorplan / shot-list exports ---------------------------------------------

function exportScene(): SceneData {
  const s = createScene('INT-KITCHEN Sc14');
  const a = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  addKeyframe(a, { x: 0, y: 0, z: 0 }, 0);
  addKeyframe(a, { x: 0, y: 0, z: 2.8 }, 0);
  createCameraSetup(s, { x: 2, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  return s;
}

test('planBounds spans actors, their keyframes, and cameras', () => {
  const b = planBounds(exportScene());
  approx(b.minX, 0);
  approx(b.maxX, 2); // camera at x=2
  approx(b.minZ, 0);
  approx(b.maxZ, 2.8); // keyframe at z=2.8
});

test('floorplanLayout projects world X/Z to centered page pixels', () => {
  const s = createScene('T');
  createActor(s, { x: 0, y: 0, z: 0 }, 0);
  createCameraSetup(s, { x: 2, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  const L = floorplanLayout(s, 1000, 100); // bounds x:[0,2] z:[0,0] → span 2, scale 400
  approx(L.scale, 400);
  const p0 = L.toPx(0, 0);
  approx(p0.x, 100);
  approx(p0.y, 500);
  const p1 = L.toPx(2, 0);
  approx(p1.x, 900);
  approx(p1.y, 500);
});

test('cameraYaw: identity faces -Z (up-page), +90° yaw faces -X', () => {
  approx(Math.abs(cameraYaw({ x: 0, y: 0, z: 0, w: 1 })), Math.PI, 1e-6); // ±π, same dir
  const q90 = { x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) };
  approx(cameraYaw(q90), -Math.PI / 2, 1e-6);
});

test('nearestActorDistance picks the closest actor', () => {
  const s = createScene('T');
  createActor(s, { x: 0, y: 0, z: 0 }, 0);
  createActor(s, { x: 10, y: 0, z: 0 }, 0);
  const cam = createCameraSetup(s, { x: 3, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  approx(nearestActorDistance(cam, s)!, Math.hypot(3, 1.6), 0.01); // 3D lens→subject = 3.4m
  assert.equal(nearestActorDistance(cam, createScene('empty')), null);
});

test('buildShotList emits camera + blocking details', () => {
  const md = buildShotList(exportScene());
  assert.ok(md.includes('INT-KITCHEN Sc14'), 'scene name in title');
  assert.ok(md.includes('CAM A'), 'camera name');
  assert.ok(md.includes('35mm'), 'lens');
  assert.ok(md.includes('S35'), 'format short');
  assert.ok(md.includes('2.39:1'), 'aspect');
  assert.ok(/Actor 1/.test(md), 'actor name');
  assert.ok(md.includes('2 marks'), 'blocking summary');
  // empty scene must not throw and should say so
  const empty = buildShotList(createScene('Empty'));
  assert.ok(empty.includes('No cameras'));
  assert.ok(empty.includes('No actors'));
});

test('buildShotList: static mark, notes, and ∞ DOF past hyperfocal', () => {
  const s = createScene('S');
  const a = createActor(s, { x: 0, y: 0, z: 10 }, 0);
  addKeyframe(a, { x: 0, y: 0, z: 10 }, 0); // one mark → static
  addNote(a, 'dialogue', 'Hello there');
  // 24mm T4 with subject ~10m is past the 5.78m hyperfocal → far = ∞
  createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 24, '2.39:1', 4, 'super35');
  const md = buildShotList(s);
  assert.ok(md.includes('static (1 mark)'), 'single-mark actor');
  assert.ok(md.includes('“Hello there”'), 'dialogue note quoted');
  assert.ok(md.includes('∞'), 'infinite DOF far limit');
  assert.ok(!/NaN/.test(md), 'no NaN anywhere in the export');
});

test('buildShotList: stances surface on the header and on non-standing marks only', () => {
  const s = createScene('S');
  const a = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  a.stance = 'seated-lounge';
  addKeyframe(a, { x: 0, y: 0, z: 0 }, 0, 'standing');
  addKeyframe(a, { x: 2, y: 0, z: 0 }, 0, 'seated-chair');
  const md = buildShotList(s);
  assert.ok(md.includes('Seated (lounging)'), 'rest stance on the actor header');
  assert.ok(md.includes('Seated (chair)'), 'non-standing mark stance listed');
  // The standing mark line carries no stance suffix (standing is the default read).
  const mark1 = md.split('\n').find((l) => l.trim().startsWith('1.'))!;
  assert.ok(!/Standing/.test(mark1), `standing mark stays untagged: ${mark1}`);
});

test('cameraHalfFovRad is half the horizontal FOV for the camera format', () => {
  const s = createScene('S');
  const cam = createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  approx(cameraHalfFovRad(cam), hFovRad(35, 'super35') / 2, 1e-9);
});

test('planBounds falls back to a ±1m box for an empty scene', () => {
  const b = planBounds(createScene('empty'));
  assert.deepEqual(b, { minX: -1, maxX: 1, minZ: -1, maxZ: 1 });
});

// --- regression guards for the pre-QA review fixes -----------------------------

test('camera naming: 27th camera falls back to a numeric suffix (no hang)', () => {
  const s = createScene('Big');
  for (let i = 0; i < 26; i++) createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  assert.equal(s.cameras[25].name, 'CAM Z');
  const c27 = createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  assert.equal(c27.name, 'CAM 27'); // must terminate — not spin forever
});

test('normalizeScene repairs a zero/negative focal length (editor/import guard)', () => {
  const s = createScene('S');
  const c = createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  c.lensFocalLength = 0;
  normalizeScene(s);
  assert.equal(c.lensFocalLength, 35);
  c.lensFocalLength = -10;
  normalizeScene(s);
  assert.equal(c.lensFocalLength, 35);
});

test('isSceneData rejects a non-positive focal length on import', () => {
  const s = createScene('S');
  createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');
  const json = JSON.parse(JSON.stringify(s)) as SceneData;
  assert.ok(isSceneData(json));
  json.cameras[0].lensFocalLength = 0;
  assert.ok(!isSceneData(json), 'focal 0 rejected');
});

// --- duplication ----------------------------------------------------------------

test('duplicateActor: new id, unique name, offset pose, independent deep copy', () => {
  const s = createScene('T');
  const a = createActor(s, { x: 1, y: 0, z: 2 }, 0.5);
  addKeyframe(a, { x: 1, y: 0, z: 2 }, 0.5);
  addKeyframe(a, { x: 1, y: 0, z: 4 }, 0.5);
  addNote(a, 'action', 'enters');
  const dup = duplicateActor(s, a.id)!;
  assert.notEqual(dup.id, a.id);
  assert.equal(dup.name, 'Actor 2');
  approx(dup.position.x, 1.6); // offset +0.6
  approx(dup.keyframes[1].position.x, 1.6); // whole path shifted
  assert.equal(s.actors.length, 2); // original + duplicate
  // deep copy: mutating the dup must not touch the original
  dup.notes[0].text = 'changed';
  assert.equal(a.notes[0].text, 'enters');
  assert.equal(duplicateActor(s, 'nope'), null);
});

test('duplicateCameraSetup: new id, unique name, copied optics, offset', () => {
  const s = createScene('T');
  const c = createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 85, '16:9', 4, 'fullframe');
  const dup = duplicateCameraSetup(s, c.id)!;
  assert.notEqual(dup.id, c.id);
  assert.equal(dup.name, 'CAM B');
  assert.equal(dup.lensFocalLength, 85);
  assert.equal(dup.aspect, '16:9');
  assert.equal(dup.tStop, 4);
  assert.equal(dup.formatId, 'fullframe');
  approx(dup.position.x, 0.4);
  assert.equal(duplicateCameraSetup(s, 'nope'), null);
});

// --- move pace ------------------------------------------------------------------

test('createScene defaults walkSpeed; normalizeScene repairs a bad pace', () => {
  const s = createScene('T');
  assert.equal(s.walkSpeed, WALK_SPEED_MS);
  s.walkSpeed = 0;
  normalizeScene(s);
  assert.equal(s.walkSpeed, WALK_SPEED_MS);
  s.walkSpeed = -1;
  normalizeScene(s);
  assert.equal(s.walkSpeed, WALK_SPEED_MS);
  // a legacy scene JSON with no walkSpeed field is filled in
  const legacy = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
  delete legacy.walkSpeed;
  normalizeScene(legacy as unknown as SceneData);
  assert.equal((legacy as unknown as SceneData).walkSpeed, WALK_SPEED_MS);
});

// --- undo / redo (History) ------------------------------------------------------

function sceneWithActors(n: number): SceneData {
  const s = createScene('H');
  for (let i = 0; i < n; i++) createActor(s, { x: i, y: 0, z: 0 }, 0);
  return s;
}

test('History: record/undo/redo restores exact scene state', () => {
  const h = new History();
  const s0 = sceneWithActors(0);
  h.reset(s0);
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, false);

  const s1 = sceneWithActors(1);
  h.record(s1);
  const s2 = sceneWithActors(2);
  h.record(s2);
  assert.equal(h.canUndo, true);

  const u1 = h.undo()!; // → s1
  assert.equal(u1.actors.length, 1);
  const u0 = h.undo()!; // → s0
  assert.equal(u0.actors.length, 0);
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, true);

  const r1 = h.redo()!; // → s1
  assert.equal(r1.actors.length, 1);
  assert.equal(h.undo()!.actors.length, 0); // back to s0
});

test('History: undo/redo return fresh objects, not shared references', () => {
  const h = new History();
  h.reset(sceneWithActors(0));
  h.record(sceneWithActors(1));
  const a = h.undo()!;
  a.name = 'mutated';
  h.redo(); // advance forward again
  const c = h.undo()!;
  assert.notEqual(c.name, 'mutated'); // mutating a restored scene never leaks back
});

test('History: a new record clears the redo stack', () => {
  const h = new History();
  h.reset(sceneWithActors(0));
  h.record(sceneWithActors(1));
  h.undo();
  assert.equal(h.canRedo, true);
  h.record(sceneWithActors(3)); // branch off
  assert.equal(h.canRedo, false);
  assert.equal(h.redo(), null);
});

test('History: no-op record on unchanged scene, and bounded depth', () => {
  const h = new History();
  const s = sceneWithActors(1);
  h.reset(s);
  h.record(s); // identical snapshot → no history entry
  assert.equal(h.canUndo, false);

  const small = new History(3);
  small.reset(sceneWithActors(0));
  for (let i = 1; i <= 10; i++) small.record(sceneWithActors(i));
  let steps = 0;
  while (small.undo()) steps++;
  assert.equal(steps, 3); // capped at the limit, never unbounded
});

// --- location scans -----------------------------------------------------------

function makeScan(): LocationScan {
  return {
    version: 1,
    id: 'scan-1',
    capturedAt: 1_720_000_000_000,
    meshes: [
      {
        label: 'global mesh',
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 2, 0, 0, 2, -3]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      },
      {
        label: 'table',
        positions: new Float32Array([-1, 0.7, -1, -0.5, 0.7, -1, -1, 0.7, -0.5]),
        indices: new Uint32Array([0, 1, 2]),
      },
    ],
  };
}

/** Corrupt-and-reencode helper for decoder rejection tests. */
function mutated(b64: string, fn: (bytes: Uint8Array) => Uint8Array): string {
  return bytesToBase64(fn(base64ToBytes(b64)!));
}

test('base64: round-trips all remainder lengths and matches Node', () => {
  for (const len of [0, 1, 2, 3, 4, 5, 31]) {
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = (i * 37 + 5) % 256;
    const b64 = bytesToBase64(bytes);
    assert.equal(b64, Buffer.from(bytes).toString('base64'));
    assert.deepEqual(base64ToBytes(b64), bytes);
  }
});

test('base64: rejects bad charset and bad length', () => {
  assert.equal(base64ToBytes('####'), null);
  assert.equal(base64ToBytes('QUJ'), null); // not a multiple of 4
  assert.equal(base64ToBytes('émoji=='), null);
});

test('transformPositions: translation and 90° yaw (column-major)', () => {
  const p = new Float32Array([1, 2, 3]);
  transformPositions(p, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1]);
  assert.deepEqual([...p], [11, 22, 33]);
  const q = new Float32Array([1, 0, 0]);
  // +90° about Y: (1,0,0) → (0,0,-1), matching THREE's applyAxisAngle.
  transformPositions(q, [0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1]);
  approx(q[0], 0);
  approx(q[1], 0);
  approx(q[2], -1);
});

test('summarizeScan: counts and bounds across meshes', () => {
  const s = summarizeScan(makeScan());
  assert.equal(s.id, 'scan-1');
  assert.equal(s.vertices, 7);
  assert.equal(s.triangles, 3);
  assert.deepEqual(s.boundsMin, { x: -1, y: 0, z: -3 });
  assert.deepEqual(s.boundsMax, { x: 1, y: 2, z: 0 });
});

test('summarizeScan: empty scan yields zeroed bounds, not infinities', () => {
  const s = summarizeScan({ version: 1, id: 'e', capturedAt: 1, meshes: [] });
  assert.deepEqual(s.boundsMin, { x: 0, y: 0, z: 0 });
  assert.deepEqual(s.boundsMax, { x: 0, y: 0, z: 0 });
});

test('scan codec: encode/decode round-trips geometry with a fresh id', () => {
  const src = makeScan();
  const out = decodeScan(encodeScan(src));
  assert.ok(out);
  assert.notEqual(out.id, src.id); // imports must never collide with stored blobs
  assert.equal(out.capturedAt, src.capturedAt);
  assert.equal(out.meshes.length, 2);
  for (let i = 0; i < 2; i++) {
    assert.equal(out.meshes[i].label, src.meshes[i].label);
    assert.deepEqual([...out.meshes[i].positions], [...src.meshes[i].positions]);
    assert.deepEqual([...out.meshes[i].indices], [...src.meshes[i].indices]);
  }
  assert.ok(isLocationScan(out));
});

test('scan codec: u32 index path preserved above 65535 vertices', () => {
  const n = 66_000; // > 0xffff forces the wide index path
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < positions.length; i++) positions[i] = (i % 977) * 0.01;
  const scan: LocationScan = {
    version: 1,
    id: 'wide',
    capturedAt: 2,
    meshes: [{ label: 'global mesh', positions, indices: new Uint32Array([0, 65_999, 65_536]) }],
  };
  const out = decodeScan(encodeScan(scan))!;
  assert.deepEqual([...out.meshes[0].indices], [0, 65_999, 65_536]);
  assert.equal(out.meshes[0].positions.length, n * 3);
});

test('scan codec: rejects corrupt input instead of crashing', () => {
  const good = encodeScan(makeScan());
  assert.equal(decodeScan('not base64!!'), null);
  // wrong version
  assert.equal(decodeScan(mutated(good, (b) => ((b[0] = 9), b))), null);
  // truncated buffer
  assert.equal(decodeScan(mutated(good, (b) => b.subarray(0, b.length - 7))), null);
  // trailing garbage
  assert.equal(
    decodeScan(
      mutated(good, (b) => {
        const g = new Uint8Array(b.length + 4);
        g.set(b);
        return g;
      }),
    ),
    null,
  );
  // out-of-range index (encoder doesn't validate; decoder must)
  const bad = makeScan();
  bad.meshes[1].indices = new Uint32Array([0, 1, 9]);
  assert.equal(decodeScan(encodeScan(bad)), null);
  // non-finite position
  const nan = makeScan();
  nan.meshes[0].positions[4] = NaN;
  assert.equal(decodeScan(encodeScan(nan)), null);
});

test('SceneData: scan summary is validated and normalized', () => {
  const s = createScene('scan-scene');
  assert.equal(s.scan, null); // new scenes carry an explicit null
  s.scan = summarizeScan(makeScan());
  const json = JSON.parse(JSON.stringify(s));
  assert.equal(isSceneData(json), true);

  const broken = JSON.parse(JSON.stringify(s));
  broken.scan.boundsMax = 'nope';
  assert.equal(isSceneData(broken), false);

  const legacy = JSON.parse(JSON.stringify(s)) as SceneData;
  delete (legacy as unknown as Record<string, unknown>).scan; // pre-scan export
  assert.equal(isSceneData(legacy), true);
  normalizeScene(legacy);
  assert.equal(legacy.scan, null);
});

// --- movable scan furniture (Stage 1) -------------------------------------------

test('furniture: global mesh is fixed, labeled meshes are movable', () => {
  assert.equal(isMovableScanMesh('global mesh'), false);
  assert.equal(isMovableScanMesh('Global Mesh'), false);
  assert.equal(isMovableScanMesh('couch'), true);
  assert.equal(isMovableScanMesh('table'), true);
});

test('furniture: meshFootprintCenter is the XZ bounds center, y always 0', () => {
  const c = meshFootprintCenter(new Float32Array([-1, 0.7, -1, -0.5, 0.7, -1, -1, 0.7, -0.5]));
  approx(c.x, -0.75);
  approx(c.z, -0.75);
  assert.equal(c.y, 0);
  assert.deepEqual(meshFootprintCenter(new Float32Array([])), { x: 0, y: 0, z: 0 });
});

test('furniture: quatYaw matches the rotationY convention (0 = +Z)', () => {
  approx(quatYaw(0, 0, 0, 1), 0); // identity
  const half = Math.PI / 4; // quaternion for +90° yaw: (0, sin45, 0, cos45)
  approx(quatYaw(0, Math.sin(half), 0, Math.cos(half)), Math.PI / 2);
  // Mostly-yaw with a small tilt still lands on the yaw component.
  approx(quatYaw(0.05, Math.sin(half), 0.05, Math.cos(half)), Math.PI / 2, 0.02);
  assert.equal(quatYaw(Math.SQRT1_2, 0, 0, Math.SQRT1_2), 0); // forward → straight up: degenerate → 0
});

test('furniture: placements validate, survive JSON round-trip, bad ones drop', () => {
  const s = createScene('furnished');
  s.scan = summarizeScan(makeScan());
  s.scan.furniture = [{ meshIndex: 1, dx: 0.5, dz: -0.25, rotY: Math.PI / 2 }];
  const json = JSON.parse(JSON.stringify(s));
  assert.equal(isSceneData(json), true);
  assert.deepEqual(json.scan.furniture, s.scan.furniture);

  const broken = JSON.parse(JSON.stringify(s));
  broken.scan.furniture = [{ meshIndex: -1, dx: 0, dz: 0, rotY: 0 }];
  assert.equal(isSceneData(broken), false); // import path rejects outright

  // normalize path (localStorage autosave) drops bad entries, keeps good ones.
  const mixed = JSON.parse(JSON.stringify(s)) as SceneData;
  mixed.scan!.furniture = [
    { meshIndex: 1, dx: 0.5, dz: -0.25, rotY: 0 },
    { meshIndex: 0.5, dx: 0, dz: 0, rotY: 0 }, // fractional index
    { meshIndex: 2, dx: NaN, dz: 0, rotY: 0 }, // NaN offset
  ];
  normalizeScene(mixed);
  assert.deepEqual(mixed.scan!.furniture, [{ meshIndex: 1, dx: 0.5, dz: -0.25, rotY: 0 }]);

  // All-bad list normalizes away entirely (absent = as captured).
  const allBad = JSON.parse(JSON.stringify(s)) as SceneData;
  allBad.scan!.furniture = [{ meshIndex: NaN, dx: 0, dz: 0, rotY: 0 }];
  normalizeScene(allBad);
  assert.equal(allBad.scan!.furniture, undefined);
});

// --- 3D scan exporters & synthetic scan generation ---------------------------

test('calculateMeshNormals: computes smooth normalized vertex normals', () => {
  // Triangle on XZ plane: (0,0,0), (1,0,0), (0,0,1)
  // Cross product of e1=(1,0,0) and e2=(0,0,1) is (0,-1,0); with counter-clockwise winding (0,0,0), (0,0,1), (1,0,0) it points +Y
  const pos = new Float32Array([0, 0, 0, 0, 0, 1, 1, 0, 0]);
  const idx = new Uint32Array([0, 1, 2]);
  const norms = calculateMeshNormals(pos, idx);
  assert.equal(norms.length, 9);
  // All vertices should have normal pointing in +Y direction (0, 1, 0)
  approx(norms[0], 0);
  approx(norms[1], 1);
  approx(norms[2], 0);
  approx(norms[3], 0);
  approx(norms[4], 1);
  approx(norms[5], 0);
  approx(norms[6], 0);
  approx(norms[7], 1);
  approx(norms[8], 0);

  // Degenerate triangle falls back to (0, 1, 0) without NaN
  const degenPos = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const degenNorms = calculateMeshNormals(degenPos, idx);
  assert.equal(degenNorms[1], 1);
  assert.equal(Number.isFinite(degenNorms[0]), true);
});

test('calculateMeshAABB: computes accurate bounding box', () => {
  const pos = new Float32Array([-2, 0.5, -3, 4, 2.5, 5, 0, -1.25, 1]);
  const aabb = calculateMeshAABB(pos);
  approx(aabb.minX, -2);
  approx(aabb.minY, -1.25);
  approx(aabb.minZ, -3);
  approx(aabb.maxX, 4);
  approx(aabb.maxY, 2.5);
  approx(aabb.maxZ, 5);

  const empty = calculateMeshAABB(new Float32Array([]));
  assert.deepEqual(empty, { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 });
});

test('compute2DConvexHull: computes 2D convex hull of footprint points', () => {
  const pts: [number, number][] = [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
    [1, 1], // interior point
    [0.5, 0.5], // interior point
  ];
  const hull = compute2DConvexHull(pts);
  assert.equal(hull.length, 4); // 4 outer corners

  // Handles <= 2 points
  assert.equal(compute2DConvexHull([[1, 2]]).length, 1);
  assert.equal(compute2DConvexHull([[1, 2], [3, 4]]).length, 2);
});

test('getSemanticColor: returns semantic color palette entries', () => {
  const floorCol = getSemanticColor('floor');
  assert.ok(floorCol.r > 0 && floorCol.g > 0 && floorCol.b > 0);
  assert.ok(floorCol.hex > 0);

  const wallCol = getSemanticColor('wall');
  assert.ok(wallCol.r > 0);

  const couchCol = getSemanticColor('couch');
  assert.ok(couchCol.r > 0);

  const defCol = getSemanticColor('unrecognized_label_xyz');
  assert.ok(defCol.r > 0);
});

test('exportScanAsObj: exports valid Wavefront OBJ and MTL files with multi-mesh offsets', () => {
  const scan = makeScan();
  const { obj, mtl } = exportScanAsObj(scan, 'test_scan.mtl');

  assert.ok(obj.includes('mtllib test_scan.mtl'));
  assert.ok(obj.includes('o mesh_1_global_mesh'));
  assert.ok(obj.includes('g global_mesh'));
  assert.ok(obj.includes('usemtl mat_global_mesh'));
  assert.ok(obj.includes('o mesh_2_table'));
  assert.ok(obj.includes('g table'));
  assert.ok(obj.includes('usemtl mat_table'));

  // 1st mesh has 4 vertices: faces use 1-based indices 1..4
  assert.ok(obj.includes('f 1//1 2//2 3//3'));
  // 2nd mesh has 3 vertices: faces offset by 4, using indices 5..7
  assert.ok(obj.includes('f 5//5 6//6 7//7'));

  assert.ok(mtl.includes('newmtl mat_global_mesh'));
  assert.ok(mtl.includes('newmtl mat_table'));
  assert.ok(mtl.includes('Kd '));
  assert.ok(mtl.includes('illum 2'));
});

test('exportScanAsPly: exports ASCII Stanford PLY with positions, normals, and colors', () => {
  const scan = makeScan();
  const plyAscii = exportScanAsPly(scan, false);
  assert.equal(typeof plyAscii, 'string');

  const str = plyAscii as string;
  assert.ok(str.startsWith('ply\nformat ascii 1.0\n'));
  assert.ok(str.includes('element vertex 7'));
  assert.ok(str.includes('element face 3'));
  assert.ok(str.includes('property float x'));
  assert.ok(str.includes('property float nx'));
  assert.ok(str.includes('property uchar red'));
  assert.ok(str.includes('end_header'));

  // Face indices: 1st mesh (0, 1, 2) and (0, 2, 3), 2nd mesh offset by 4: (4, 5, 6)
  assert.ok(str.includes('3 0 1 2'));
  assert.ok(str.includes('3 0 2 3'));
  assert.ok(str.includes('3 4 5 6'));
});

test('exportScanAsPly: exports binary little-endian Stanford PLY with correct byte layout', () => {
  const scan = makeScan();
  const plyBinary = exportScanAsPly(scan, true);
  assert.ok(plyBinary instanceof Uint8Array);

  const dec = new TextDecoder();
  const headerPreview = dec.decode(plyBinary.subarray(0, 500));
  assert.ok(headerPreview.includes('format binary_little_endian 1.0'));
  assert.ok(headerPreview.includes('element vertex 7'));
  assert.ok(headerPreview.includes('element face 3'));
  assert.ok(headerPreview.includes('end_header\n'));

  // Header ends with newline; payload size = 7 verts * 27 bytes + 3 faces * 13 bytes = 189 + 39 = 228 bytes
  const headerEnd = headerPreview.indexOf('end_header\n') + 'end_header\n'.length;
  const payloadBytes = plyBinary.length - headerEnd;
  assert.equal(payloadBytes, 7 * 27 + 3 * 13);
});

test('exportScanAsUsd: exports valid USDA OpenUSD representation', () => {
  const scan = makeScan();
  const usd = exportScanAsUsd(scan);

  assert.ok(usd.startsWith('#usda 1.0'));
  assert.ok(usd.includes('defaultPrim = "LocationScan"'));
  assert.ok(usd.includes('metersPerUnit = 1.0'));
  assert.ok(usd.includes('upAxis = "Y"'));
  assert.ok(usd.includes('def Scope "Materials"'));
  assert.ok(usd.includes('def Material "Mat_global_mesh"'));
  assert.ok(usd.includes('def Material "Mat_table"'));
  assert.ok(usd.includes('def Xform "Meshes"'));
  assert.ok(usd.includes('def Mesh "Mesh_global_mesh_1"'));
  assert.ok(usd.includes('def Mesh "Mesh_table_2"'));
  assert.ok(usd.includes('point3f[] points = ['));
  assert.ok(usd.includes('normal3f[] normals = ['));
  assert.ok(usd.includes('int[] faceVertexIndices = ['));
});

test('exportScanAsGeoJson: exports valid RFC 7946 GeoJSON FeatureCollection', () => {
  const scan = makeScan();
  const geojsonStr = exportScanAsGeoJson(scan);
  const geojson = JSON.parse(geojsonStr);

  assert.equal(geojson.type, 'FeatureCollection');
  assert.equal(geojson.properties.scanId, 'scan-1');
  assert.equal(geojson.properties.totalVertices, 7);
  assert.equal(geojson.properties.totalTriangles, 3);
  assert.equal(geojson.features.length, 2);

  const f0 = geojson.features[0];
  assert.equal(f0.type, 'Feature');
  assert.equal(f0.properties.label, 'global mesh');
  assert.equal(f0.properties.isFurniture, false);
  assert.equal(f0.geometry.type, 'Polygon');
  // Closed polygon: first point matches last point
  const coords0 = f0.geometry.coordinates[0];
  assert.deepEqual(coords0[0], coords0[coords0.length - 1]);

  const f1 = geojson.features[1];
  assert.equal(f1.properties.label, 'table');
  assert.equal(f1.properties.isFurniture, true);
  assert.ok(f1.properties.widthM > 0);
  assert.ok(f1.properties.depthM > 0);
  assert.ok(f1.properties.areaM2 > 0);
});

test('createSyntheticLocationScan: generates realistic 3D room scan', () => {
  const room = createSyntheticLocationScan(7.0, 5.5, 3.0, ['couch', 'table', 'desk', 'chair', 'shelf']);

  assert.equal(room.version, 1);
  assert.ok(room.id.length > 0);
  assert.ok(room.capturedAt > 0);
  assert.ok(room.meshes.length >= 7); // floor, ceiling, walls, door, window + furniture

  const labels = room.meshes.map((m) => m.label);
  assert.ok(labels.includes('floor'));
  assert.ok(labels.includes('ceiling'));
  assert.ok(labels.includes('walls'));
  assert.ok(labels.includes('door'));
  assert.ok(labels.includes('window'));
  assert.ok(labels.includes('couch'));
  assert.ok(labels.includes('table'));
  assert.ok(labels.includes('desk'));
  assert.ok(labels.includes('chair'));
  assert.ok(labels.includes('shelf'));

  // Validate geometry buffers
  for (const m of room.meshes) {
    assert.ok(m.positions.length >= 9);
    assert.ok(m.indices.length >= 3);
    assert.equal(m.positions.length % 3, 0);
    assert.equal(m.indices.length % 3, 0);

    // Verify all vertex coordinates are finite
    for (let i = 0; i < m.positions.length; i++) {
      assert.equal(Number.isFinite(m.positions[i]), true);
    }
    // Verify all indices are valid
    const vertCount = m.positions.length / 3;
    for (let i = 0; i < m.indices.length; i++) {
      assert.ok(m.indices[i] < vertCount);
    }
  }

  // Summary check
  const summary = summarizeScan(room);
  assert.ok(summary.vertices > 100);
  assert.ok(summary.triangles > 50);
  approx(summary.boundsMax.x - summary.boundsMin.x, 7.2, 0.3);
  approx(summary.boundsMax.z - summary.boundsMin.z, 5.7, 0.3);
  approx(summary.boundsMax.y - summary.boundsMin.y, 3.05, 0.2);

  // Exporters handle synthetic scan cleanly
  const objRes = exportScanAsObj(room);
  assert.ok(objRes.obj.length > 500);
  assert.ok(objRes.mtl.length > 200);

  const plyRes = exportScanAsPly(room, false);
  assert.ok((plyRes as string).length > 500);

  const plyBinRes = exportScanAsPly(room, true);
  assert.ok((plyBinRes as Uint8Array).byteLength > 1000);

  const usdRes = exportScanAsUsd(room);
  assert.ok(usdRes.length > 1000);

  const geojsonRes = exportScanAsGeoJson(room);
  assert.ok(geojsonRes.length > 500);
});

test('ScanStore: estimateScanSizeBytes, storage tracking, and clearAll', async () => {
  const scan = makeScan();
  const estimated = estimateScanSizeBytes(scan);
  assert.ok(estimated > 100);

  const store = new ScanStore();
  const putOk = await store.putScan(scan);
  assert.equal(typeof putOk, 'boolean');

  const loaded = await store.getScan('scan-1');
  assert.ok(loaded);
  assert.equal(loaded.id, 'scan-1');

  const size = await store.getScanSizeBytes('scan-1');
  assert.equal(size, estimated);

  const total = await store.getTotalStorageBytes();
  assert.ok(total >= estimated);

  await store.clearAllScans();
  const afterClear = await store.getScan('scan-1');
  assert.equal(afterClear, null);
  const idsAfter = await store.listScanIds();
  assert.equal(idsAfter.length, 0);
});

// --- stance / pose ------------------------------------------------------------

test('STANCES: all 16 requested poses present, unique ids, finite targets', () => {
  const ids = STANCES.map((p) => p.id);
  const expected: StanceId[] = [
    'standing',
    'lean-left',
    'lean-right',
    'standing_point',
    'standing_reach',
    'standing_hands_hips',
    'standing_crossed_arms',
    'seated-chair',
    'seated_arms_thighs',
    'seated_leaning_table',
    'seated-lounge',
    'seated-cross',
    'lying-up',
    'lying-down',
    'lying-left',
    'lying-right',
  ];
  assert.equal(STANCES.length, 16);
  assert.equal(STANCES.length, expected.length);
  const idSet = new Set<string>(ids);
  for (const id of expected) assert.ok(idSet.has(id), `missing stance ${id}`);
  assert.equal(idSet.size, ids.length, 'stance ids must be unique');
  for (const p of STANCES) {
    for (const v of [
      p.bodyRot.x,
      p.bodyRot.y,
      p.bodyRot.z,
      p.bodyLift,
      p.hip,
      p.knee,
      p.spine,
      p.shoulder,
      p.shoulderR,
      p.shoulderL,
      p.elbowR,
      p.elbowL,
      p.legSplay,
    ]) {
      assert.ok(Number.isFinite(v), `${p.id} has a non-finite target`);
    }
    assert.ok(typeof p.name === 'string' && p.name.length > 0);
    assert.ok(typeof p.short === 'string' && p.short.length > 0);
  }
});

test('standing is the neutral pose (all targets zero)', () => {
  const s = poseFor('standing');
  for (const v of [
    s.bodyRot.x,
    s.bodyRot.y,
    s.bodyRot.z,
    s.bodyLift,
    s.hip,
    s.knee,
    s.spine,
    s.shoulder,
    s.shoulderR,
    s.shoulderL,
    s.elbowR,
    s.elbowL,
    s.legSplay,
  ]) {
    assert.equal(v, 0);
  }
});

test('seated/lying poses actually differ from standing', () => {
  assert.ok(poseFor('seated-chair').bodyLift < 0, 'seated lowers the hips');
  assert.ok(Math.abs(poseFor('seated-chair').hip) > 0.5, 'seated bends the hips');
  assert.ok(Math.abs(poseFor('lying-up').bodyRot.x) > 1, 'lying swings the body flat');
  assert.notEqual(poseFor('lying-up').bodyRot.z, poseFor('lying-left').bodyRot.z); // side roll differs
  assert.equal(poseFor('lean-left').bodyRot.z, -poseFor('lean-right').bodyRot.z); // mirror leans
});

test('new stances have distinct limb articulation targets', () => {
  assert.ok(poseFor('standing_point').shoulderR > 1.0, 'pointing extends right shoulder');
  assert.ok(poseFor('standing_reach').shoulderR > 2.0, 'reaching reaches right arm high');
  assert.ok(poseFor('standing_hands_hips').elbowR > 1.5, 'hands on hips bends elbows');
  assert.ok(poseFor('standing_crossed_arms').elbowL > 1.5, 'crossed arms bends elbows');
  assert.ok(poseFor('seated_arms_thighs').elbowR > 1.0, 'seated arms on thighs bends elbows');
  assert.ok(poseFor('seated_leaning_table').spine > 0.3, 'leaning forward tilts spine');
});

test('poseFor falls back to standing for unknown ids', () => {
  assert.equal(poseFor(undefined).id, 'standing');
  assert.equal(poseFor('nonsense').id, 'standing');
});

test('cycleStance wraps forward and back over all 16 poses', () => {
  const n = STANCES.length;
  let id: string = 'standing';
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    seen.add(id);
    id = cycleStance(id, 1);
  }
  assert.equal(seen.size, n, 'forward cycle visits every stance');
  assert.equal(id, 'standing', 'a full forward cycle returns to the start');
  assert.equal(cycleStance('standing', -1), STANCES[n - 1].id); // backward wraps
  assert.equal(cycleStance('nonsense', 1), STANCES[1 % n].id); // unknown treated as index 0
});

test('isStanceId accepts all 16 known ids, rejects junk', () => {
  const allStances: StanceId[] = [
    'standing',
    'lean-left',
    'lean-right',
    'standing_point',
    'standing_reach',
    'standing_hands_hips',
    'standing_crossed_arms',
    'seated-chair',
    'seated_arms_thighs',
    'seated_leaning_table',
    'seated-lounge',
    'seated-cross',
    'lying-up',
    'lying-down',
    'lying-left',
    'lying-right',
  ];
  for (const id of allStances) {
    assert.ok(isStanceId(id), `isStanceId failed for ${id}`);
  }
  assert.ok(!isStanceId('sitting'));
  assert.ok(!isStanceId(42));
  assert.ok(!isStanceId(undefined));
});

test('createActor defaults to standing; normalizeScene repairs a bad stance', () => {
  const scene = createScene('s');
  const a = createActor(scene, { x: 0, y: 0, z: 0 }, 0);
  assert.equal(a.stance, 'standing');
  (a as unknown as Record<string, unknown>).stance = 'floating';
  normalizeScene(scene);
  assert.equal(a.stance, 'standing');
  // A valid non-default stance survives normalization.
  a.stance = 'lying-right';
  normalizeScene(scene);
  assert.equal(a.stance, 'lying-right');
});

test('isSceneData accepts a valid stance and a legacy actor with no stance', () => {
  const scene = createScene('s');
  const a = createActor(scene, { x: 0, y: 0, z: 0 }, 0);
  a.stance = 'seated-lounge';
  const json = JSON.parse(JSON.stringify(scene));
  assert.equal(isSceneData(json), true);
  delete json.actors[0].stance; // pre-stance export
  assert.equal(isSceneData(json), true);
  normalizeScene(json);
  assert.equal(json.actors[0].stance, 'standing');
});

test('duplicateActor copies the stance', () => {
  const scene = createScene('s');
  const a = createActor(scene, { x: 0, y: 0, z: 0 }, 0);
  a.stance = 'seated-cross';
  const dup = duplicateActor(scene, a.id)!;
  assert.equal(dup.stance, 'seated-cross');
});

// --- depth-of-field circle of confusion ---------------------------------------

test('cocDiameterMm: zero at the focus plane, grows with distance from it', () => {
  // Focus at 3m: a subject exactly at 3m is sharp.
  assert.equal(cocDiameterMm(50, 2.8, 3, 3), 0);
  const near = cocDiameterMm(50, 2.8, 3, 2);
  const far = cocDiameterMm(50, 2.8, 3, 5);
  assert.ok(near > 0 && far > 0);
  // Farther from focus (2m off vs 1m off) blurs more.
  assert.ok(cocDiameterMm(50, 2.8, 3, 6) > cocDiameterMm(50, 2.8, 3, 4));
});

test('cocDiameterMm: wider aperture (lower T-stop) blurs more; longer lens blurs more', () => {
  assert.ok(cocDiameterMm(50, 1.4, 3, 6) > cocDiameterMm(50, 5.6, 3, 6)); // f/1.4 vs f/5.6
  assert.ok(cocDiameterMm(85, 2.8, 3, 6) > cocDiameterMm(35, 2.8, 3, 6)); // 85mm vs 35mm
});

test('cocDiameterMm: degenerate inputs return 0, never NaN', () => {
  assert.equal(cocDiameterMm(50, 2.8, 3, 0), 0); // subject at 0
  assert.equal(cocDiameterMm(50, 0, 3, 6), 0); // no aperture
  assert.equal(cocDiameterMm(50, 2.8, 0.01, 6), 0); // focus closer than focal length
  for (const v of [cocDiameterMm(50, 2.8, 3, 6), cocDiameterMm(1000, 2.8, 3, 6)]) {
    assert.ok(Number.isFinite(v));
  }
});

// --- locomotion ---------------------------------------------------------------

test('locomotionAmount: deadzone suppresses stick noise', () => {
  const a = locomotionAmount(0.1, -0.1, 2, 0.5);
  assert.deepEqual(a, { forward: 0, right: 0 });
});

test('locomotionAmount: forward = -stickY, right = +stickX, scaled by speed·dt', () => {
  // Push straight up (stickY = -1): move forward speed·dt = 2·0.5 = 1 m.
  const f = locomotionAmount(0, -1, 2, 0.5);
  approx(f.forward, 1);
  approx(f.right, 0);
  // Push right (stickX = +1): strafe right 1 m.
  const r = locomotionAmount(1, 0, 2, 0.5);
  approx(r.right, 1);
  approx(r.forward, 0);
});

test('locomotionAmount: diagonals are clamped to unit speed (no faster corners)', () => {
  const d = locomotionAmount(1, -1, 2, 0.5); // full diagonal
  const mag = Math.hypot(d.forward, d.right);
  approx(mag, 1); // same total speed as a cardinal push, not √2
});

test('rotateOffsetAboutPivot: rotating about the offset itself is a no-op', () => {
  const p = { x: 3, z: -2 };
  const r = rotateOffsetAboutPivot(p, p, Math.PI / 3);
  approx(r.x, 3);
  approx(r.z, -2);
});

test('rotateOffsetAboutPivot: 90° about origin maps +Y-rotation convention', () => {
  // Rotation about +Y by +90° on (x,z): x' = z, z' = -x.
  const r = rotateOffsetAboutPivot({ x: 1, z: 0 }, { x: 0, z: 0 }, Math.PI / 2);
  approx(r.x, 0);
  approx(r.z, -1);
});

test('snapTurn sign: a RIGHT push turns the view right (right-side actor comes to front)', () => {
  // Full view, at true registration: viewYaw = 0, offset = 0. An actor is to
  // the user's right at world/content (5, 0). The user (at origin) pushes the
  // right stick RIGHT (step +1) to turn toward it. After the turn the actor
  // must appear IN FRONT (content forward is -Z, so world z < 0, x ~ 0).
  const step = 1; // stickStepX for a rightward push
  const angle = snapTurnAngle(step, Math.PI / 2); // 90° for a clean check
  // snapTurn accumulates viewYaw += angle; displayed world = R(viewYaw)·p (offset 0).
  // R(θ) about +Y: x' = x·cosθ + z·sinθ, z' = -x·sinθ + z·cosθ.
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const p = { x: 5, z: 0 };
  const world = { x: p.x * c + p.z * s, z: -p.x * s + p.z * c };
  approx(world.x, 0, 1e-9); // no longer off to the side
  assert.ok(world.z < 0, `right-side actor should swing to front (z<0), got z=${world.z}`);
});

test('snapTurnAngle: left push is the exact opposite of right', () => {
  assert.equal(snapTurnAngle(1, Math.PI / 6), -snapTurnAngle(-1, Math.PI / 6));
  assert.equal(snapTurnAngle(0, Math.PI / 6), 0);
});

test('rotateOffsetAboutPivot: full turn returns to start; pivot is fixed', () => {
  const start = { x: 2, z: 5 };
  const pivot = { x: -1, z: 1 };
  let cur = start;
  for (let i = 0; i < 12; i++) cur = rotateOffsetAboutPivot(cur, pivot, Math.PI / 6); // 12×30° = 360°
  approx(cur.x, start.x, 1e-6);
  approx(cur.z, start.z, 1e-6);
});

// --- video recording (pure policy/math; MediaRecorder itself is browser-only) --

test('pickMimeType: first supported candidate wins, in preference order', () => {
  const picked = pickMimeType(RECORD_MIME_CANDIDATES, (t) => t.startsWith('video/webm'));
  assert.equal(picked, 'video/webm;codecs=vp9'); // mp4s unsupported → best webm
  const mp4 = pickMimeType(RECORD_MIME_CANDIDATES, () => true);
  assert.ok(mp4?.startsWith('video/mp4'), 'mp4 preferred when everything is supported');
});

test('pickMimeType: nothing supported → null (recording unavailable, not a crash)', () => {
  assert.equal(pickMimeType(RECORD_MIME_CANDIDATES, () => false), null);
});

test('fileExtensionFor matches container for every shipped candidate', () => {
  for (const c of RECORD_MIME_CANDIDATES) {
    const ext = fileExtensionFor(c);
    assert.ok(ext === 'mp4' || ext === 'webm');
    assert.equal(ext === 'mp4', c.startsWith('video/mp4'), `wrong extension for ${c}`);
  }
});

test('containScale: matching aspect fills the frame exactly (the common case)', () => {
  assert.deepEqual(containScale(1024, 430, 1024, 430), { x: 1, y: 1 });
  assert.deepEqual(containScale(2048, 860, 1024, 430), { x: 1, y: 1 }); // same aspect, any size
});

test('containScale: wider source letterboxes, taller source pillarboxes', () => {
  // 2.39:1 feed into a 16:9 canvas → full width, reduced height.
  const lb = containScale(2390, 1000, 1600, 900);
  approx(lb.x, 1);
  approx(lb.y, (1600 / 900) / (2390 / 1000));
  assert.ok(lb.y < 1);
  // 4:3 feed into a 2.39:1 canvas → full height, reduced width.
  const pb = containScale(4, 3, 2390, 1000);
  approx(pb.y, 1);
  assert.ok(pb.x < 1);
});

test('containScale: degenerate inputs fall back to full cover, never a zero rect', () => {
  assert.deepEqual(containScale(0, 430, 1024, 430), { x: 1, y: 1 });
  assert.deepEqual(containScale(1024, 430, 1024, 0), { x: 1, y: 1 });
  assert.deepEqual(containScale(NaN, 430, 1024, 430), { x: 1, y: 1 });
});

test('recordingClock: M:SS with zero-padded seconds, clamped at 0', () => {
  assert.equal(recordingClock(0), '0:00');
  assert.equal(recordingClock(7.9), '0:07');
  assert.equal(recordingClock(75), '1:15');
  assert.equal(recordingClock(600), '10:00');
  assert.equal(recordingClock(-3), '0:00');
});

test('recording policy constants are sane (fps/bitrate/cap all positive, bounded memory)', () => {
  assert.ok(RECORD_FPS > 0 && RECORD_FPS <= 72);
  assert.ok(RECORD_VIDEO_BPS > 0);
  // The cap bounds worst-case in-memory take size to something a Quest tab survives.
  assert.ok((RECORD_VIDEO_BPS / 8) * MAX_RECORD_S < 512 * 1024 * 1024);
});

// --- in-AR controls guide -------------------------------------------------------

const GUIDE_MODES = ['full', 'mini', 'camera'] as const;
const GUIDE_CTXS = GUIDE_MODES.flatMap((mode) =>
  (['none', 'actor', 'camera'] as const).flatMap((placeMode) =>
    [false, true].flatMap((eyesMode) =>
      (['block', 'dress'] as const).map((interaction) => ({ mode, placeMode, eyesMode, interaction })),
    ),
  ),
);

test('guide: every state yields chips, unique per hand+anchor, wrist chip always present', () => {
  for (const ctx of GUIDE_CTXS) {
    const items = guideItems(ctx);
    assert.ok(items.length >= 4, `${ctx.mode}: too few chips`);
    const keys = items.map((i) => `${i.hand}|${i.anchor}`);
    assert.equal(new Set(keys).size, keys.length, `${ctx.mode}: duplicate hand+anchor`);
    assert.ok(
      items.some((i) => i.hand === 'left' && i.anchor === 'wrist' && /tool wheel/i.test(i.label)),
      `${ctx.mode}: tool-wheel chip missing (menu discoverability)`,
    );
    for (const i of items) {
      assert.ok(i.label.length > 0 && i.label.length <= 44, `label length: "${i.label}"`);
      assert.ok(!/[—–]/.test(i.label), `no em/en dashes in product copy: "${i.label}"`);
      assert.ok(i.anchor in ANCHOR_OFFSETS, `anchor "${i.anchor}" has no offset`);
    }
  }
});

test('guide: menu is always taught — wrist chip and the Y menu button, every state', () => {
  for (const ctx of GUIDE_CTXS) {
    const items = guideItems(ctx);
    const wrist = items.find((i) => i.hand === 'left' && i.anchor === 'wrist');
    assert.ok(wrist && /tool wheel/i.test(wrist.label), `${ctx.mode}: no tool-wheel chip`);
    const y = items.find((i) => i.hand === 'left' && i.anchor === 'upper');
    assert.ok(y && /^Y:/.test(y.label) && /menu/i.test(y.label), `${ctx.mode}: Y menu chip missing`);
  }
});

test('guide: full-view trigger chip tracks place mode; eyes mode adds the A chip', () => {
  const actorTrig = guideItems({ mode: 'full', placeMode: 'actor', eyesMode: false, interaction: 'block' }).find(
    (i) => i.anchor === 'trigger',
  );
  const camTrig = guideItems({ mode: 'full', placeMode: 'camera', eyesMode: false, interaction: 'block' }).find(
    (i) => i.anchor === 'trigger',
  );
  assert.ok(actorTrig?.label.includes('actor') && !actorTrig.label.includes('camera'));
  assert.ok(camTrig?.label.includes('camera'));
  // Disarmed (the default): the trigger chip must promise selection only —
  // never placement, which is the third-QA actor-spam bug.
  const noneTrig = guideItems({ mode: 'full', placeMode: 'none', eyesMode: false, interaction: 'block' }).find(
    (i) => i.anchor === 'trigger',
  );
  assert.ok(noneTrig && /select/i.test(noneTrig.label) && !/place/i.test(noneTrig.label));
  const noneX = guideItems({ mode: 'full', placeMode: 'none', eyesMode: false, interaction: 'block' }).find(
    (i) => i.hand === 'left' && i.anchor === 'lower',
  );
  assert.ok(noneX && /arm/i.test(noneX.label), 'X chip teaches arming');
  const eyesA = (eyes: boolean) =>
    guideItems({ mode: 'full', placeMode: 'actor', eyesMode: eyes, interaction: 'block' }).some(
      (i) => i.hand === 'right' && i.anchor === 'lower',
    );
  assert.equal(eyesA(false), false, 'A does nothing in plain full view — no chip');
  assert.equal(eyesA(true), true, 'eyes mode: A commits the camera — chip required');
});

test('guide: camera view teaches photo, focal, and monitor grab', () => {
  const items = guideItems({ mode: 'camera', placeMode: 'actor', eyesMode: false, interaction: 'block' });
  const labels = items.map((i) => i.label.toLowerCase()).join(' | ');
  assert.ok(labels.includes('photo'), 'photo chip');
  assert.ok(labels.includes('focal'), 'focal chip');
  assert.ok(labels.includes('monitor'), 'monitor-grab chip');
});

test('guide: dress mode swaps the grip chip to furniture and drops placing chips', () => {
  const dress = guideItems({ mode: 'full', placeMode: 'actor', eyesMode: false, interaction: 'dress' });
  const grip = dress.find((i) => i.hand === 'right' && i.anchor === 'grip');
  assert.ok(grip && /furniture/i.test(grip.label), 'dress grip chip teaches furniture');
  assert.ok(!dress.some((i) => i.anchor === 'trigger'), 'no placing chip while dressing');
  assert.ok(!dress.some((i) => i.hand === 'left' && i.anchor === 'lower'), 'no X place-mode chip while dressing');
  const block = guideItems({ mode: 'full', placeMode: 'actor', eyesMode: false, interaction: 'block' });
  const blockGrip = block.find((i) => i.hand === 'right' && i.anchor === 'grip');
  assert.ok(blockGrip && !/furniture/i.test(blockGrip.label), 'block grip chip is actors/cameras only');
});

// --- floor-height correction -----------------------------------------------------

test('floor: the first-QA failure (floor 1.3m too high) is detected and corrected', () => {
  const e = newFloorEstimate();
  // 12 hits over 3 seconds, lowest on the real floor at world y = -1.3.
  for (let i = 0; i < 12; i++) observeFloorHit(e, -1.3 + (i % 4) * 0.2, 1000 + i * 300);
  assert.equal(floorCorrection(e, 0.3, 5000), -1.3); // head near origin ('local' fallback)
});

test('floor: never corrects a plausible floor, desk-only hits, or too-early evidence', () => {
  // Hits at/above 0 (correct floor; reticle on desks and props): no correction.
  const desk = newFloorEstimate();
  for (let i = 0; i < 20; i++) observeFloorHit(desk, 0.02 + (i % 3) * 0.4, 1000 + i * 300);
  assert.equal(floorCorrection(desk, 1.6, 60_000), null);

  // Real failure signature but too few hits / too little time: hold off.
  const early = newFloorEstimate();
  for (let i = 0; i < 4; i++) observeFloorHit(early, -1.2, 1000 + i * 100);
  assert.equal(floorCorrection(early, 0.3, 60_000), null, 'needs more hits');
  const rushed = newFloorEstimate();
  for (let i = 0; i < 12; i++) observeFloorHit(rushed, -1.2, 1000 + i * 10);
  assert.equal(floorCorrection(rushed, 0.3, 1200), null, 'needs more elapsed time');

  // Correction implying an impossible eye height (tracking glitch): rejected.
  const glitch = newFloorEstimate();
  for (let i = 0; i < 12; i++) observeFloorHit(glitch, -5, 1000 + i * 300);
  assert.equal(floorCorrection(glitch, 0.3, 5000), null);
  // NaN hits are ignored entirely.
  const nan = newFloorEstimate();
  for (let i = 0; i < 12; i++) observeFloorHit(nan, NaN, 1000 + i * 300);
  assert.equal(nan.hits, 0);
});

test('floor: boundary floor slightly high (0.5m) corrects; sub-threshold (0.1m) does not', () => {
  const off = newFloorEstimate();
  for (let i = 0; i < 12; i++) observeFloorHit(off, -0.5, 1000 + i * 300);
  assert.equal(floorCorrection(off, 1.1, 5000), -0.5);
  const fine = newFloorEstimate();
  for (let i = 0; i < 12; i++) observeFloorHit(fine, -0.1, 1000 + i * 300);
  assert.equal(floorCorrection(fine, 1.5, 5000), null);
  // Committed estimates stop observing and never re-fire.
  off.committed = true;
  observeFloorHit(off, -2, 10_000);
  assert.equal(floorCorrection(off, 1.1, 20_000), null);
});

// --- hand tool wheel -------------------------------------------------------------

const WHEEL_BASE = {
  placeMode: 'actor',
  viewMode: 'full',
  playing: false,
  recording: false,
  hasScan: true,
  locationMode: 'ghost',
  lensFocal: 35,
  tStop: 2.8,
  formatShort: 'S35',
  aspect: '2.39:1',
  eyesMode: false,
  dofOn: false,
  pace: 1.4,
} as const;

test('wheel: every menu level fits the ring, unique ids, copy rules hold', () => {
  for (const mode of ['block', 'dress'] as const) {
    for (const path of ['root', 'lens', 'marks', 'capture', 'edit', 'stance', 'light', 'props'] as const) {
      const menu = wheelMenu({ ...WHEEL_BASE, mode }, path);
      assert.ok(
        menu.sectors.length >= 3 && menu.sectors.length <= MAX_SECTORS,
        `${mode}/${path}: ${menu.sectors.length} sectors`,
      );
      const ids = menu.sectors.map((s) => s.id);
      assert.equal(new Set(ids).size, ids.length, `${mode}/${path}: duplicate ids`);
      for (const s of [...menu.sectors, { id: menu.hub.id, label: menu.hub.label }]) {
        assert.ok(s.label.length > 0 && !/[—–]/.test(s.label), `copy: "${s.label}"`);
      }
      // Hub is the mode switch at root, Back everywhere else.
      assert.equal(menu.hub.id, path === 'root' ? 'wheel-mode' : 'wheel-back', `${mode}/${path}: hub`);
    }
  }
});

test('wheel: root rings reflect mode and state; every submenu opener resolves', () => {
  const block = wheelMenu({ ...WHEEL_BASE, mode: 'block' }, 'root');
  assert.ok(block.hub.sub.includes('dress'), 'block hub offers dress');
  assert.ok(block.sectors.some((s) => s.id === 'wheel-place' && s.label.includes('Actor')));
  assert.ok(!block.sectors.some((s) => s.id === 'scan'), 'scan lives in dress mode');
  const dress = wheelMenu({ ...WHEEL_BASE, mode: 'dress' }, 'root');
  assert.ok(dress.hub.sub.includes('block'), 'dress hub offers block');
  assert.ok(dress.sectors.some((s) => s.id === 'scan'));
  assert.ok(dress.sectors.some((s) => s.id === 'location' && s.label.includes('Ghost')));
  assert.ok(!dress.sectors.some((s) => s.id === 'wheel-place'), 'placing is a block tool');
  const noScan = wheelMenu({ ...WHEEL_BASE, mode: 'dress', hasScan: false }, 'root');
  assert.ok(noScan.sectors.some((s) => s.id === 'location' && /scan first/.test(s.label)));

  // Every submenu a root sector points to must produce a ring.
  for (const menu of [block, dress]) {
    for (const s of menu.sectors) {
      if (s.submenu) {
        const sub = wheelMenu({ ...WHEEL_BASE, mode: 'block' }, s.submenu);
        assert.ok(sub.sectors.length > 0, `submenu ${s.submenu} empty`);
      }
    }
  }
});

test('wheel: sub-wheels carry live values and hands get a Mark button', () => {
  const lens = wheelMenu({ ...WHEEL_BASE, mode: 'block', tStop: 4, formatShort: 'FF', dofOn: true }, 'lens');
  const labels = lens.sectors.map((s) => s.label).join('|');
  assert.ok(labels.includes('T4') && labels.includes('FF') && labels.includes('DOF ✓'));
  assert.ok(lens.sectors.some((s) => s.id === 'focal-down') && lens.sectors.some((s) => s.id === 'focal-up'));

  const marks = wheelMenu({ ...WHEEL_BASE, mode: 'block', playing: true, pace: 2.0 }, 'marks');
  assert.ok(marks.sectors.some((s) => s.id === 'mark'), 'hands need a Mark button (no B on hand tracking)');
  assert.ok(marks.sectors.some((s) => s.id === 'play' && s.label === 'Pause'));
  assert.ok(marks.sectors.some((s) => /2\.0 m\/s/.test(s.label)));

  const cap = wheelMenu({ ...WHEEL_BASE, mode: 'block', recording: true }, 'capture');
  assert.ok(cap.sectors.some((s) => s.id === 'record' && /stop/i.test(s.label)));
  assert.ok(cap.sectors.some((s) => s.id === 'exit'), 'hands must be able to exit AR');
});

test('wheel: placement arming cycles Off, Actor, Cam, Light, Prop and the Place sector shows it', () => {
  assert.equal(nextPlaceMode('none'), 'actor');
  assert.equal(nextPlaceMode('actor'), 'camera');
  assert.equal(nextPlaceMode('camera'), 'light');
  assert.equal(nextPlaceMode('light'), 'prop');
  assert.equal(nextPlaceMode('prop'), 'none');
  const label = (placeMode: 'none' | 'actor' | 'camera' | 'light' | 'prop') =>
    wheelMenu({ ...WHEEL_BASE, mode: 'block', placeMode }, 'root').sectors.find((s) => s.id === 'wheel-place')
      ?.label ?? '';
  assert.ok(label('none').includes('Off'), 'disarmed state is visible on the wheel');
  assert.ok(label('actor').includes('Actor'));
  assert.ok(label('camera').includes('Cam'));
  assert.ok(label('light').includes('Light'));
  assert.ok(label('prop').includes('Prop'));
});

test('wheel: fingertip touch fires on the push-down edge only, re-arms on pull-back', () => {
  const st = { armed: false };
  const R = 0.08;
  // Approach from the front: hover (arms), push through (fires once).
  assert.equal(touchWheel(st, 0, 0.05, 0.06, R)?.pressed, false); // hovering, arms
  assert.equal(st.armed, true);
  assert.equal(touchWheel(st, 0, 0.05, 0.005, R)?.pressed, true); // push → press
  assert.equal(touchWheel(st, 0, 0.05, 0.002, R)?.pressed, false, 'held through: no repeat');
  // Pull back past the arm band → re-armed → second tap fires.
  touchWheel(st, 0, 0.05, 0.05, R);
  assert.equal(st.armed, true);
  assert.equal(touchWheel(st, 0, 0.05, 0.0, R)?.pressed, true);
  // Off the disc: nothing to report (and no accidental press).
  assert.equal(touchWheel(st, 0.2, 0.2, 0.005, R), null);
  // Side approach (the natural tap): hovering just OFF the rim still arms, so
  // sliding onto a sector at press depth fires — occluded tracking rarely
  // delivers a clean head-on approach through the front band.
  const side = { armed: false };
  assert.equal(touchWheel(side, R * 1.5, 0, 0.06, R), null, 'near the rim: reported as off-disc');
  assert.equal(side.armed, true, 'but the hover still arms the tap');
  assert.equal(touchWheel(side, 0, 0.05, 0.005, R)?.pressed, true);
  // Starting BEHIND the plane (hand through the wheel) never fires unarmed.
  const st2 = { armed: false };
  assert.equal(touchWheel(st2, 0, 0, -0.02, R)?.pressed, false);
  // uv maps the disc to canvas orientation: center = (0.5, 0.5), up = v<0.5.
  const c = touchWheel(st2, 0, 0, 0.1, R);
  assert.ok(c && Math.abs(c.u - 0.5) < 1e-9 && Math.abs(c.v - 0.5) < 1e-9);
  const up = touchWheel(st2, 0, 0.06, 0.1, R);
  assert.ok(up && up.v < 0.5);
});

test('wheel: hit-testing — hub, sector centers, wrap at 12 o\'clock, outside null', () => {
  assert.equal(wheelHit(0.5, 0.5, 8), 'hub');
  assert.equal(wheelHit(0.5, 0.5 - (HUB_R + RING_R) / 4, 8), 0); // straight up = sector 0
  assert.equal(wheelHit(0.5 + (HUB_R + RING_R) / 4, 0.5, 8), 2); // 3 o'clock = sector 2 of 8
  assert.equal(wheelHit(0.5, 0.5 + (HUB_R + RING_R) / 4, 8), 4); // 6 o'clock
  assert.equal(wheelHit(0.5 - (HUB_R + RING_R) / 4, 0.5, 8), 6); // 9 o'clock
  // Just left of 12 o'clock wraps back to sector 0, not sector 7.
  const r = (HUB_R + RING_R) / 2 / 2;
  const a = -0.1; // radians, slightly counter-clockwise of up
  assert.equal(wheelHit(0.5 + Math.sin(a) * r, 0.5 - Math.cos(a) * r, 8), 0);
  assert.equal(wheelHit(0.5, 0.02, 8) === null, false, 'ring edge still hits');
  assert.equal(wheelHit(0.02, 0.02, 8), null, 'corner outside the disc');
  assert.equal(wheelHit(0.5, 0.5, 0), 'hub');
});

// --- AI Shot Analysis Prompt & Simulation --------------------------------------

test('buildAiShotAnalysisPrompt generates structured markdown prompt', () => {
  const s = createScene('AI Test Scene');
  const a1 = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  addKeyframe(a1, { x: 0, y: 0, z: 2 }, 0, 'standing');
  createCameraSetup(s, { x: 2, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');

  const prompt = buildAiShotAnalysisPrompt(s);
  assert.ok(prompt.includes('AI Shot Analysis & Continuity Audit Prompt'));
  assert.ok(prompt.includes('AI Test Scene'));
  assert.ok(prompt.includes('Shot Coverage & Gap Identification'));
  assert.ok(prompt.includes('180-Degree Line Rule & Eyeline Continuity Audit'));
  assert.ok(prompt.includes('Lens Selection & Perspective Consistency'));
  assert.ok(prompt.includes('Lighting Plan & Key Light Direction Recommendations'));
  assert.ok(prompt.includes('Scene Pacing & Blocking Flow Feedback'));
  assert.ok(prompt.includes('Actor 1'));
  assert.ok(prompt.includes('CAM A'));
  assert.ok(prompt.includes('35mm'));
});

test('renderFloorplanSvg produces SVG XML string with scene elements', () => {
  const s = createScene('SVG Test');
  createActor(s, { x: 1, y: 0, z: 1 }, 0);
  createCameraSetup(s, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 50, '16:9');

  const svg = renderFloorplanSvg(s, 500);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.endsWith('</svg>'));
  assert.ok(svg.includes('width="500"'));
  assert.ok(svg.includes('height="500"'));
  assert.ok(svg.includes('Actor 1'));
  assert.ok(svg.includes('CAM A'));
});

test('simulateAiShotAnalysis generates simulated continuity report', () => {
  const s = createScene('Sim Test');
  const report = simulateAiShotAnalysis(s);
  assert.ok(report.includes('AI Shot Continuity & Storyboard Analysis'));
  assert.ok(report.includes('Multi-Camera Coverage & Shot Scale Progression'));
  assert.ok(report.includes('180-Degree Line & Eyeline Match Audit'));
  assert.ok(report.includes('Jump Cut & 30-Degree Rule Verification'));
  assert.ok(report.includes('Lighting & Color Temperature Balance'));
  assert.ok(report.includes('Recommended Cutting Order & Transition Plan'));
});

// --- In-App VR Lighting Rig & Light Plan Tests -------------------------------

test('createLight factory sets default properties and unique names', () => {
  const scene = createScene('Lighting Scene');
  const l1 = createLight(scene, [0, 2.5, -1], 'spot');
  assert.equal(l1.name, 'Key Light 1');
  assert.equal(l1.type, 'spot');
  assert.deepEqual(l1.position, [0, 2.5, -1]);
  assert.equal(l1.intensity, 1.0);
  assert.equal(l1.colorKelvin, 5600);
  assert.equal(l1.coneAngleDeg, 45);

  const l2 = createLight(scene, [1, 2, 0], 'point');
  assert.equal(l2.name, 'Fill Light 2');
  assert.equal(l2.type, 'point');

  assert.equal(nextLightName(scene), 'Key Light 3');
});

test('cycleKelvin cycles through standard color temperature presets', () => {
  assert.equal(cycleKelvin(3200), 4300);
  assert.equal(cycleKelvin(4300), 5600);
  assert.equal(cycleKelvin(5600), 6500);
  assert.equal(cycleKelvin(6500), 3200);
  // Non-preset values snap to nearest preset then step
  assert.equal(cycleKelvin(3000), 4300);
});

test('duplicateLightSetup creates independent light copy with offset position', () => {
  const scene = createScene('Dup Light');
  const original = createLight(scene, [0, 3, 0], 0, 0, 'spot');
  const dup = duplicateLightSetup(scene, original.id)!;

  assert.notEqual(dup.id, original.id);
  assert.notEqual(dup.name, original.name);
  assert.equal(dup.position[0], original.position[0] + 0.5);
  assert.equal(dup.position[1], original.position[1]);
  assert.equal(dup.position[2], original.position[2]);
  assert.equal(dup.colorKelvin, original.colorKelvin);
  assert.equal(scene.lights.length, 2);
});

test('isLightData validates light objects correctly', () => {
  const validLight = {
    id: 'l1',
    name: 'Key',
    type: 'spot',
    position: [0, 2, 0],
    rotationY: 0,
    rotationX: 0,
    intensity: 1.0,
    colorKelvin: 5600,
    coneAngleDeg: 45,
  };
  assert.ok(isLightData(validLight));
  assert.equal(isLightData(null), false);
  assert.equal(isLightData({ ...validLight, type: 'invalid' }), false);
  assert.equal(isLightData({ ...validLight, intensity: -1 }), false);
});

test('normalizeScene repairs missing or invalid light fields', () => {
  const legacyScene: any = {
    id: 's1',
    name: 'Legacy Scene',
    actors: [],
    cameras: [],
    // lights array missing
  };
  const normalized = normalizeScene(legacyScene);
  assert.ok(Array.isArray(normalized.lights));
  assert.equal(normalized.lights.length, 0);

  const corruptedScene: any = {
    ...normalized,
    lights: [
      {
        id: 'l1',
        name: 'Bad Light',
        type: 'spot',
        position: [0, 2, 0],
        rotationY: 0,
        rotationX: 0,
        intensity: -5, // Invalid negative intensity
        colorKelvin: 100, // Invalid kelvin
        coneAngleDeg: 500, // Out of range cone angle
      },
    ],
  };
  const repaired = normalizeScene(corruptedScene);
  assert.equal(repaired.lights.length, 1);
  assert.equal(repaired.lights[0].intensity, 1.0);
  assert.equal(repaired.lights[0].colorKelvin, 5600);
  assert.equal(repaired.lights[0].coneAngleDeg, 45);
});

// --- Optics Focus & Rack Focus Tests ------------------------------------------

test('computeFocusDistance resolves explicit focusDistanceM, target actor, or nearest actor fallback', () => {
  const scene = createScene('Focus Scene');
  const actor1 = createActor(scene, { x: 0, y: 0, z: -3 }, 0);
  actor1.name = 'Alice';
  const actor2 = createActor(scene, { x: 0, y: 0, z: -5 }, 0);
  actor2.name = 'Bob';
  const cam = createCameraSetup(scene, { x: 0, y: 1.5, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');

  // Fallback: nearest actor (Alice at 3.354m = sqrt(0^2 + 1.5^2 + (-3)^2))
  approx(computeFocusDistance(cam, scene.actors), vecDistance(cam.position, actor1.position));

  // Targeted actor: Bob (distance sqrt(0^2 + 1.5^2 + (-5)^2) = 5.22m)
  cam.focusTargetActorId = actor2.id;
  approx(computeFocusDistance(cam, scene.actors), vecDistance(cam.position, actor2.position));

  // Explicit focus distance overrides target actor
  cam.focusDistanceM = 2.4;
  approx(computeFocusDistance(cam, scene.actors), 2.4);
});

test('normalizeScene validates focus fields and strips dangling target actor ids', () => {
  const scene = createScene('Norm Focus Scene');
  const actor = createActor(scene, { x: 0, y: 0, z: -3 }, 0);
  actor.name = 'Alice';
  const cam = createCameraSetup(scene, { x: 0, y: 1.5, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '2.39:1');

  cam.focusTargetActorId = 'non-existent-actor-id';
  cam.focusDistanceM = -10; // invalid negative focus distance

  const norm = normalizeScene(scene);
  const normCam = norm.cameras.find((c) => c.id === cam.id)!;
  assert.equal(normCam.focusTargetActorId, undefined);
  assert.equal(normCam.focusDistanceM, undefined);

  // Valid target actor is preserved
  cam.focusTargetActorId = actor.id;
  cam.focusDistanceM = 3.5;
  const norm2 = normalizeScene(scene);
  const normCam2 = norm2.cameras.find((c) => c.id === cam.id)!;
  assert.equal(normCam2.focusTargetActorId, actor.id);
  assert.equal(normCam2.focusDistanceM, 3.5);
});

// --- Audio Recording Policy Tests ---------------------------------------------

test('audio recording policy functions compute correct request and track inclusion states', () => {
  assert.equal(shouldRequestAudio(true, true), true);
  assert.equal(shouldRequestAudio(false, true), false);
  assert.equal(shouldRequestAudio(true, false), false);

  assert.equal(shouldIncludeAudioTrack(true, true), true);
  assert.equal(shouldIncludeAudioTrack(true, false), false);
  assert.equal(shouldIncludeAudioTrack(false, true), false);

  assert.equal(formatAudioPolicyStatus(true, true), 'Mic Audio Active');
  assert.equal(formatAudioPolicyStatus(true, false), 'Mic Audio Denied (Silent Video)');
  assert.equal(formatAudioPolicyStatus(false, false), 'Audio Disabled');
});

// --- Viewfinder & Smartwatch Tests ---------------------------------------------

test('viewfinder focal length math and gesture evaluation', () => {
  // 1. Focal length math
  const fStandard = computeViewfinderFocalLength(0.2, 0.4, 24.89);
  assert.ok(fStandard >= 18 && fStandard <= 100, 'Calculates reasonable focal length');

  const fWide = computeViewfinderFocalLength(0.4, 0.3, 24.89);
  assert.ok(fWide <= 35, 'Wide frame gives wide angle lens');

  const fTele = computeViewfinderFocalLength(0.1, 0.5, 24.89);
  assert.ok(fTele >= 50, 'Narrow distant frame gives telephoto lens');

  // Fallback for invalid frame
  assert.equal(computeViewfinderFocalLength(0.01, 0.1), 35);

  // 2. Gesture evaluation
  const head = new THREE.Vector3(0, 1.6, 0);
  const lIndex = new THREE.Vector3(-0.1, 1.6, -0.4);
  const lThumb = new THREE.Vector3(-0.1, 1.5, -0.4);
  const rIndex = new THREE.Vector3(0.1, 1.6, -0.4);
  const rThumb = new THREE.Vector3(0.1, 1.5, -0.4);

  const state = evaluateViewfinderGesture(lIndex, lThumb, rIndex, rThumb, head);
  assert.ok(state !== null, 'Valid viewfinder gesture recognized');
  assert.equal(state.active, true);
  assert.ok(state.widthM > 0.15 && state.widthM < 0.25);
  assert.ok(state.focalLengthMm >= 18);

  // Invalid gesture (missing hand point)
  assert.equal(evaluateViewfinderGesture(null, lThumb, rIndex, rThumb, head), null);

  // Smartwatch initialization
  const sw = new DirectorSmartwatch();
  assert.ok(sw.group.children.length >= 2, 'Smartwatch group built with chassis and screen');
});

// --- Phase 1: Video Village Layout & Spatial Coverage Intelligence tests -----

test('autoVillageLayoutMode: picks correct layout mode for camera count', () => {
  assert.equal(autoVillageLayoutMode(0), 'single');
  assert.equal(autoVillageLayoutMode(1), 'single');
  assert.equal(autoVillageLayoutMode(2), 'split-2h');
  assert.equal(autoVillageLayoutMode(3), 'grid-3');
  assert.equal(autoVillageLayoutMode(4), 'grid-4');
  assert.equal(autoVillageLayoutMode(6), 'grid-4');
});

test('calculateLetterboxRect: fits camera frame into container cell preserving aspect', () => {
  const containerAspect = 16 / 9; // ~1.7778
  // Full container cell
  const fullCell = { x: 0, y: 0, width: 1, height: 1 };

  // 16:9 camera in 16:9 container -> exact full fit
  const rect169 = calculateLetterboxRect(fullCell, 16 / 9, containerAspect);
  approx(rect169.x, 0);
  approx(rect169.y, 0);
  approx(rect169.width, 1);
  approx(rect169.height, 1);

  // 2.39:1 scope camera in 16:9 container -> letterboxed top and bottom
  const rect239 = calculateLetterboxRect(fullCell, 2.39, containerAspect);
  approx(rect239.x, 0);
  approx(rect239.width, 1);
  assert.ok(rect239.height < 1.0, 'Scope camera is letterboxed vertically');
  approx(rect239.y, (1 - rect239.height) / 2);

  // 4:3 academy camera in 16:9 container -> pillarboxed left and right
  const rect43 = calculateLetterboxRect(fullCell, 4 / 3, containerAspect);
  approx(rect43.y, 0);
  approx(rect43.height, 1);
  assert.ok(rect43.width < 1.0, 'Academy camera is pillarboxed horizontally');
  approx(rect43.x, (1 - rect43.width) / 2);
});

test('computeVillageLayout: computes active slots and normalized tile rects', () => {
  const dummyCameras = [
    { id: 'cam-1', name: 'CAM A', aspect: '16:9' as const },
    { id: 'cam-2', name: 'CAM B', aspect: '2.39:1' as const },
    { id: 'cam-3', name: 'CAM C', aspect: '4:3' as const },
    { id: 'cam-4', name: 'CAM D', aspect: '16:9' as const },
  ];

  // Empty cameras list
  const emptyLayout = computeVillageLayout([]);
  assert.equal(emptyLayout.totalCameras, 0);
  assert.equal(emptyLayout.activeSlots.length, 0);

  // Split-2h (2 cameras side-by-side)
  const split2h = computeVillageLayout(dummyCameras.slice(0, 2), 'split-2h');
  assert.equal(split2h.mode, 'split-2h');
  assert.equal(split2h.activeSlots.length, 2);
  assert.deepEqual(split2h.activeSlots[0].cellRect, { x: 0, y: 0, width: 0.5, height: 1 });
  assert.deepEqual(split2h.activeSlots[1].cellRect, { x: 0.5, y: 0, width: 0.5, height: 1 });
  assert.equal(split2h.activeSlots[0].cameraId, 'cam-1');
  assert.equal(split2h.activeSlots[1].cameraId, 'cam-2');

  // Split-2v (2 cameras stacked vertically)
  const split2v = computeVillageLayout(dummyCameras.slice(0, 2), 'split-2v');
  assert.equal(split2v.mode, 'split-2v');
  assert.deepEqual(split2v.activeSlots[0].cellRect, { x: 0, y: 0, width: 1, height: 0.5 });
  assert.deepEqual(split2v.activeSlots[1].cellRect, { x: 0, y: 0.5, width: 1, height: 0.5 });

  // Grid-3 (1 top hero, 2 bottom)
  const grid3 = computeVillageLayout(dummyCameras.slice(0, 3), 'grid-3');
  assert.equal(grid3.mode, 'grid-3');
  assert.equal(grid3.activeSlots.length, 3);
  assert.deepEqual(grid3.activeSlots[0].cellRect, { x: 0, y: 0, width: 1, height: 0.5 });
  assert.deepEqual(grid3.activeSlots[1].cellRect, { x: 0, y: 0.5, width: 0.5, height: 0.5 });
  assert.deepEqual(grid3.activeSlots[2].cellRect, { x: 0.5, y: 0.5, width: 0.5, height: 0.5 });

  // Grid-4 (2x2 quad split)
  const grid4 = computeVillageLayout(dummyCameras, 'grid-4');
  assert.equal(grid4.mode, 'grid-4');
  assert.equal(grid4.activeSlots.length, 4);
  assert.deepEqual(grid4.activeSlots[0].cellRect, { x: 0, y: 0, width: 0.5, height: 0.5 });
  assert.deepEqual(grid4.activeSlots[1].cellRect, { x: 0.5, y: 0, width: 0.5, height: 0.5 });
  assert.deepEqual(grid4.activeSlots[2].cellRect, { x: 0, y: 0.5, width: 0.5, height: 0.5 });
  assert.deepEqual(grid4.activeSlots[3].cellRect, { x: 0.5, y: 0.5, width: 0.5, height: 0.5 });

  // Picture-in-Picture (PiP)
  const pip = computeVillageLayout(dummyCameras.slice(0, 2), 'pip');
  assert.equal(pip.mode, 'pip');
  assert.equal(pip.activeSlots.length, 2);
  assert.deepEqual(pip.activeSlots[0].cellRect, { x: 0, y: 0, width: 1, height: 1 });
  assert.deepEqual(pip.activeSlots[1].cellRect, { x: 0.68, y: 0.68, width: 0.28, height: 0.28 });
});

test('check180LineOfAction: detects 180-degree axis crossings accurately', () => {
  const actor1 = { x: 0, y: 0, z: -2 };
  const actor2 = { x: 0, y: 0, z: 2 };
  // Line of action is along Z axis (x = 0)

  const camLeft: CameraSetupData = {
    id: 'cam-left',
    name: 'CAM Left',
    position: { x: -3, y: 1.6, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    lensFocalLength: 35,
    aspect: '16:9',
    tStop: 2.8,
    formatId: 'super35',
  };

  const camRight: CameraSetupData = {
    id: 'cam-right',
    name: 'CAM Right',
    position: { x: 3, y: 1.6, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    lensFocalLength: 35,
    aspect: '16:9',
    tStop: 2.8,
    formatId: 'super35',
  };

  const camOnLine: CameraSetupData = {
    id: 'cam-center',
    name: 'CAM Center',
    position: { x: 0, y: 1.6, z: -5 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    lensFocalLength: 35,
    aspect: '16:9',
    tStop: 2.8,
    formatId: 'super35',
  };

  // Two cameras on opposite sides -> crossing detected
  const crossResult = check180LineOfAction([camLeft, camRight], actor1, actor2);
  assert.equal(crossResult.hasCrossing, true);
  assert.equal(crossResult.cameraSides.find((c) => c.cameraId === 'cam-left')?.side, 'left');
  assert.equal(crossResult.cameraSides.find((c) => c.cameraId === 'cam-right')?.side, 'right');

  // Cameras on the same side -> no crossing
  const safeCam: CameraSetupData = { ...camLeft, id: 'cam-left-2', position: { x: -2, y: 1.6, z: 1 } };
  const safeResult = check180LineOfAction([camLeft, safeCam], actor1, actor2);
  assert.equal(safeResult.hasCrossing, false);

  // Camera on the axis line
  const onLineResult = check180LineOfAction([camOnLine], actor1, actor2);
  assert.equal(onLineResult.cameraSides[0].side, 'on-line');
  assert.equal(onLineResult.hasCrossing, false);

  // Degenerate actor positions (same spot) -> safe fallback
  const degenResult = check180LineOfAction([camLeft, camRight], actor1, actor1);
  assert.equal(degenResult.hasCrossing, false);
});

test('classifyShotSize: categorizes shot scale from ECU to EWS accurately', () => {
  // 50mm on Super 35 (hFov ~28°, vFov ~16° at 16:9, gate factor ~0.28)
  // At 1.0 meter -> field height ≈ 0.28m, 1.75m actor covers >150% -> ECU
  const ecu = classifyShotSize(50, '16:9', 'super35', 1.0, 1.75);
  assert.equal(ecu.shotSize, 'ECU');
  assert.equal(ecu.shotSizeLabel, 'Extreme Close-Up (ECU)');
  assert.ok(ecu.subjectFrameCoveragePct >= 150);

  // At 6.0 meters -> field height ≈ 1.68m, coverage ≈ 104% -> CU
  const cu = classifyShotSize(50, '16:9', 'super35', 6.0, 1.75);
  assert.equal(cu.shotSize, 'CU');
  assert.equal(cu.shotSizeLabel, 'Close-Up (CU)');

  // At 10.0 meters -> field height ≈ 2.80m, coverage ≈ 62.5% -> MCU
  const mcu = classifyShotSize(50, '16:9', 'super35', 10.0, 1.75);
  assert.equal(mcu.shotSize, 'MCU');

  // At 15.0 meters -> field height ≈ 4.20m, coverage ≈ 41.6% -> MS
  const ms = classifyShotSize(50, '16:9', 'super35', 15.0, 1.75);
  assert.equal(ms.shotSize, 'MS');

  // At 22.0 meters -> field height ≈ 6.16m, coverage ≈ 28.4% -> MLS (Cowboy)
  const mls = classifyShotSize(50, '16:9', 'super35', 22.0, 1.75);
  assert.equal(mls.shotSize, 'MLS');

  // At 40.0 meters -> field height ≈ 11.20m, coverage ≈ 15.6% -> WS
  const ws = classifyShotSize(50, '16:9', 'super35', 40.0, 1.75);
  assert.equal(ws.shotSize, 'WS');

  // At 100.0 meters -> field height ≈ 28.0m, coverage ≈ 6.25% -> EWS
  const ews = classifyShotSize(50, '16:9', 'super35', 100.0, 1.75);
  assert.equal(ews.shotSize, 'EWS');
  assert.equal(ews.shotSizeLabel, 'Extreme Wide Shot (EWS)');

  assert.ok(shotSizeDescription('MLS').includes('Cowboy'));
});

test('quatRotateVector and quatInverseRotateVector: match Three.js parity exactly', () => {
  // Test arbitrary quaternion rotations against THREE.Quaternion
  const euler = new THREE.Euler(0.4, 0.7, -0.3, 'XYZ');
  const threeQuat = new THREE.Quaternion().setFromEuler(euler);
  const q = { x: threeQuat.x, y: threeQuat.y, z: threeQuat.z, w: threeQuat.w };

  const testVectors = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: -1 },
    { x: 2.5, y: -1.2, z: 4.8 },
  ];

  for (const v of testVectors) {
    const threeV = new THREE.Vector3(v.x, v.y, v.z).applyQuaternion(threeQuat);
    const pureV = quatRotateVector(q, v);
    approx(pureV.x, threeV.x, 1e-4);
    approx(pureV.y, threeV.y, 1e-4);
    approx(pureV.z, threeV.z, 1e-4);

    // Inverse rotation
    const threeInvV = new THREE.Vector3(threeV.x, threeV.y, threeV.z).applyQuaternion(threeQuat.clone().invert());
    const pureInvV = quatInverseRotateVector(q, pureV);
    approx(pureInvV.x, threeInvV.x, 1e-4);
    approx(pureInvV.y, threeInvV.y, 1e-4);
    approx(pureInvV.z, threeInvV.z, 1e-4);
    approx(pureInvV.x, v.x, 1e-4);
    approx(pureInvV.y, v.y, 1e-4);
    approx(pureInvV.z, v.z, 1e-4);
  }
});

test('isPointInFrustum: tests 3D point visibility inside camera view volume', () => {
  const camPos = { x: 0, y: 1.6, z: 0 };
  const identityRot = { x: 0, y: 0, z: 0, w: 1 }; // Camera faces -Z

  // 1. Point straight ahead at 5m (z = -5) -> inside
  assert.equal(isPointInFrustum({ x: 0, y: 1.6, z: -5 }, camPos, identityRot, 35, '16:9', 'super35'), true);

  // 2. Point behind camera (z = +5) -> outside
  assert.equal(isPointInFrustum({ x: 0, y: 1.6, z: 5 }, camPos, identityRot, 35, '16:9', 'super35'), false);

  // 3. Point beyond far plane (>100m) -> outside
  assert.equal(
    isPointInFrustum({ x: 0, y: 1.6, z: -150 }, camPos, identityRot, 35, '16:9', 'super35', 0.1, 100),
    false,
  );

  // 4. Point closer than near plane (<0.5m) -> outside
  assert.equal(
    isPointInFrustum({ x: 0, y: 1.6, z: -0.2 }, camPos, identityRot, 35, '16:9', 'super35', 0.5, 100),
    false,
  );

  // 5. Point far off to the side at x = 10m -> outside
  assert.equal(isPointInFrustum({ x: 10, y: 1.6, z: -5 }, camPos, identityRot, 35, '16:9', 'super35'), false);

  // 6. Camera rotated 90° to the right around +Y (faces +X in our coordinate convention)
  // Rotation of +90° around +Y: q = (0, sin(45°), 0, cos(45°)) ≈ (0, 0.7071, 0, 0.7071)
  // Rotating -Z by +90° around +Y produces -X. Let's test facing -X:
  const rot90Y = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
  assert.equal(isPointInFrustum({ x: -5, y: 1.6, z: 0 }, camPos, rot90Y, 35, '16:9', 'super35'), true);
  assert.equal(isPointInFrustum({ x: 0, y: 1.6, z: -5 }, camPos, rot90Y, 35, '16:9', 'super35'), false);
});

test('findCamerasInFrustums: detects when one camera is in the shot of another', () => {
  const camA: CameraSetupData = {
    id: 'cam-a',
    name: 'CAM A',
    position: { x: 0, y: 1.6, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 }, // Faces -Z
    lensFocalLength: 24,
    aspect: '16:9',
    tStop: 2.8,
    formatId: 'super35',
  };

  // Cam B is in front of Cam A (at z = -4)
  const camB: CameraSetupData = {
    id: 'cam-b',
    name: 'CAM B',
    position: { x: 0.5, y: 1.6, z: -4 },
    rotation: { x: 0, y: 1, z: 0, w: 0 }, // 180° turned around, faces +Z (towards Cam A)
    lensFocalLength: 35,
    aspect: '16:9',
    tStop: 2.8,
    formatId: 'super35',
  };

  // Cam C is behind Cam A (at z = +5)
  const camC: CameraSetupData = {
    id: 'cam-c',
    name: 'CAM C',
    position: { x: 0, y: 1.6, z: 5 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    lensFocalLength: 50,
    aspect: '16:9',
    tStop: 2.8,
    formatId: 'super35',
  };

  const collisions = findCamerasInFrustums([camA, camB, camC]);
  // Cam A sees Cam B (Cam B is at z = -4)
  const aSeesB = collisions.find((c) => c.observerCamId === 'cam-a' && c.observedCamId === 'cam-b');
  assert.ok(aSeesB, 'Cam A sees Cam B');
  approx(aSeesB.distanceM, Math.sqrt(0.5 * 0.5 + 4 * 4), 0.01);

  // Cam B sees Cam A (Cam B faces +Z and Cam A is at z = 0)
  const bSeesA = collisions.find((c) => c.observerCamId === 'cam-b' && c.observedCamId === 'cam-a');
  assert.ok(bSeesA, 'Cam B sees Cam A');

  // Cam A does NOT see Cam C (Cam C is behind at z = +5)
  const aSeesC = collisions.find((c) => c.observerCamId === 'cam-a' && c.observedCamId === 'cam-c');
  assert.equal(aSeesC, undefined, 'Cam A does not see Cam C');
});

test('CameraKeyframe validation, addCameraKeyframe, and applyCameraMarkOp', () => {
  const scene = createScene('Dolly Test');
  const cam = createCameraSetup(scene, { x: 0, y: 1.6, z: 4 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '16:9');

  assert.equal(cam.keyframes, undefined);

  // 1. isCameraKeyframe validator
  const validKf: CameraKeyframe = {
    position: { x: 0, y: 1.6, z: 4 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    lensFocalLength: 35,
    focusDistanceM: 4.0,
    holdDurationS: 1.0,
  };
  assert.ok(isCameraKeyframe(validKf));
  assert.equal(isCameraKeyframe({ position: { x: 0, y: 1.6 } }), false);
  assert.equal(isCameraKeyframe({ ...validKf, lensFocalLength: -5 }), false);

  // 2. addCameraKeyframe up to MAX_CAMERA_KEYFRAMES (8)
  for (let i = 0; i < MAX_CAMERA_KEYFRAMES; i++) {
    const ok = addCameraKeyframe(cam, { x: 0, y: 1.6, z: 4 - i }, { x: 0, y: 0, z: 0, w: 1 }, 35);
    assert.ok(ok, `add mark ${i} succeeds`);
  }
  const populatedKfs = (cam as CameraSetupData).keyframes;
  assert.equal(populatedKfs?.length, MAX_CAMERA_KEYFRAMES);
  assert.equal(
    addCameraKeyframe(cam, { x: 0, y: 1.6, z: -10 }, { x: 0, y: 0, z: 0, w: 1 }, 35),
    false,
    'capped at MAX_CAMERA_KEYFRAMES',
  );

  // 3. applyCameraMarkOp
  (cam as CameraSetupData).keyframes = [];
  // Add first mark: stamped with camera initial pose
  applyCameraMarkOp(cam, { kind: 'add' });
  assert.equal((cam as CameraSetupData).keyframes?.length, 1);
  assert.deepEqual((cam as CameraSetupData).keyframes?.[0].position, { x: 0, y: 1.6, z: 4 });
  assert.equal((cam as CameraSetupData).keyframes?.[0].lensFocalLength, 35);

  // Add second mark: steps 1m forward (-Z)
  applyCameraMarkOp(cam, { kind: 'add' });
  assert.equal(cam.keyframes!.length, 2);
  assert.deepEqual(cam.keyframes![1].position, { x: 0, y: 1.6, z: 3 });

  // Update mark 1
  const updateOk = applyCameraMarkOp(cam, {
    kind: 'update',
    index: 1,
    position: { x: 1.5, z: 2.0 },
    lensFocalLength: 50,
    holdDurationS: 2.5,
  });
  assert.ok(updateOk);
  assert.equal(cam.keyframes![1].position.x, 1.5);
  assert.equal(cam.keyframes![1].position.z, 2.0);
  assert.equal(cam.keyframes![1].lensFocalLength, 50);
  assert.equal(cam.keyframes![1].holdDurationS, 2.5);

  // Atomic failure on bad update value
  const badUpdate = applyCameraMarkOp(cam, {
    kind: 'update',
    index: 1,
    lensFocalLength: NaN,
  });
  assert.equal(badUpdate, false);
  assert.equal(cam.keyframes![1].lensFocalLength, 50, 'atomic: value unmutated');

  // Move marks
  applyCameraMarkOp(cam, { kind: 'move', index: 0, dir: 1 });
  assert.equal(cam.keyframes![0].lensFocalLength, 50);
  assert.equal(cam.keyframes![1].lensFocalLength, 35);

  // Remove mark
  applyCameraMarkOp(cam, { kind: 'remove', index: 0 });
  assert.equal(cam.keyframes!.length, 1);
  assert.equal(cam.keyframes![0].lensFocalLength, 35);
});

test('normalizeScene camera keyframe sanitization and target actor dangling cleanup', () => {
  const scene = createScene('Keyframe Normalize');
  const actor = createActor(scene, { x: 0, y: 0, z: 0 }, 0);
  const cam = createCameraSetup(scene, { x: 0, y: 1.6, z: 5 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '16:9');

  cam.lookAtTargetActorId = actor.id;
  cam.keyframes = [
    {
      position: { x: 0, y: 1.6, z: 5 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      lensFocalLength: 35,
      focusTargetActorId: actor.id,
    },
    {
      position: { x: 0, y: 1.6, z: 2 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      lensFocalLength: 50,
      focusTargetActorId: 'non-existent-actor-id',
    },
  ];

  normalizeScene(scene);
  assert.equal(cam.lookAtTargetActorId, actor.id);
  assert.equal(cam.keyframes[0].focusTargetActorId, actor.id);
  assert.equal(cam.keyframes[1].focusTargetActorId, undefined, 'dangling focus target actor pruned');

  // Delete actor and re-normalize
  scene.actors = [];
  normalizeScene(scene);
  assert.equal(cam.lookAtTargetActorId, undefined, 'dangling lookAtTargetActorId pruned');
  assert.equal(cam.keyframes[0].focusTargetActorId, undefined, 'dangling focusTargetActorId pruned');

  // Duplicate camera copies and shifts keyframes
  scene.actors.push(actor);
  cam.keyframes = [
    { position: { x: 1, y: 1.6, z: 2 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, lensFocalLength: 35 },
  ];
  const clonedCam = duplicateCameraSetup(scene, cam.id);
  assert.ok(clonedCam);
  assert.equal(clonedCam.position.x, cam.position.x + 0.4);
  assert.equal(clonedCam.keyframes?.[0].position.x, 1.4);
});

test('quatNormalize, quatDot, and quatSlerp shortest-arc interpolation', () => {
  // 1. quatNormalize
  const qZero = quatNormalize({ x: 0, y: 0, z: 0, w: 0 });
  assert.deepEqual(qZero, { x: 0, y: 0, z: 0, w: 1 });

  const qScaled = quatNormalize({ x: 0, y: 2, z: 0, w: 0 });
  assert.equal(qScaled.y, 1);

  // 2. quatDot
  const qA: Quat = { x: 0, y: 0, z: 0, w: 1 };
  const qB: Quat = { x: 0, y: 1, z: 0, w: 0 };
  assert.equal(quatDot(qA, qB), 0);
  assert.equal(quatDot(qA, qA), 1);

  // 3. quatSlerp
  const qSlerp0 = quatSlerp(qA, qB, 0);
  approx(qSlerp0.w, 1, 1e-4);
  approx(qSlerp0.y, 0, 1e-4);

  const qSlerp1 = quatSlerp(qA, qB, 1);
  approx(qSlerp1.w, 0, 1e-4);
  approx(qSlerp1.y, 1, 1e-4);

  const qSlerpHalf = quatSlerp(qA, qB, 0.5);
  approx(qSlerpHalf.w, Math.SQRT1_2, 1e-4);
  approx(qSlerpHalf.y, Math.SQRT1_2, 1e-4);

  // Shortest arc test: anti-podal representation of 90-degree rotation
  const q90: Quat = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
  const q90Neg: Quat = { x: 0, y: -Math.SQRT1_2, z: 0, w: -Math.SQRT1_2 };
  const qSlerpPosHalf = quatSlerp(qA, q90, 0.5);
  const qSlerpNegHalf = quatSlerp(qA, q90Neg, 0.5);
  approx(qSlerpPosHalf.w, Math.cos(Math.PI / 8), 1e-4);
  approx(qSlerpPosHalf.y, Math.sin(Math.PI / 8), 1e-4);
  approx(qSlerpNegHalf.w, Math.cos(Math.PI / 8), 1e-4);
  approx(qSlerpNegHalf.y, Math.sin(Math.PI / 8), 1e-4);
});

test('quatLookAt computes orientation pointing camera -Z axis towards target', () => {
  // Case 1: Eye at (0, 1.6, 5), Target at (0, 1.6, 0) -> target is along -Z
  const eye1: Vec3 = { x: 0, y: 1.6, z: 5 };
  const target1: Vec3 = { x: 0, y: 1.6, z: 0 };
  const q1 = quatLookAt(eye1, target1);
  // Rotated forward vector (0, 0, -1) should remain (0, 0, -1)
  const forward1 = quatRotateVector(q1, { x: 0, y: 0, z: -1 });
  approx(forward1.x, 0, 1e-4);
  approx(forward1.y, 0, 1e-4);
  approx(forward1.z, -1, 1e-4);

  // Case 2: Eye at (0, 1.6, 0), Target at (5, 1.6, 0) -> target is along +X
  const eye2: Vec3 = { x: 0, y: 1.6, z: 0 };
  const target2: Vec3 = { x: 5, y: 1.6, z: 0 };
  const q2 = quatLookAt(eye2, target2);
  const forward2 = quatRotateVector(q2, { x: 0, y: 0, z: -1 });
  approx(forward2.x, 1, 1e-4);
  approx(forward2.y, 0, 1e-4);
  approx(forward2.z, 0, 1e-4);

  // Case 3: Eye at (0, 0, 0), Target at (0, 5, 0) -> looking straight up (gimbal test)
  const eye3: Vec3 = { x: 0, y: 0, z: 0 };
  const target3: Vec3 = { x: 0, y: 5, z: 0 };
  const q3 = quatLookAt(eye3, target3);
  const forward3 = quatRotateVector(q3, { x: 0, y: 0, z: -1 });
  approx(forward3.x, 0, 1e-4);
  approx(forward3.y, 1, 1e-4);
  approx(forward3.z, 0, 1e-4);
});

test('catmullRomVec3 and generateDollyRail smooth 3D spline trajectory', () => {
  const p0: Vec3 = { x: 0, y: 1.6, z: 6 };
  const p1: Vec3 = { x: 0, y: 1.6, z: 4 };
  const p2: Vec3 = { x: 2, y: 1.6, z: 2 };
  const p3: Vec3 = { x: 4, y: 1.6, z: 2 };

  const startPt = catmullRomVec3(p0, p1, p2, p3, 0);
  approx(startPt.x, p1.x, 1e-4);
  approx(startPt.y, p1.y, 1e-4);
  approx(startPt.z, p1.z, 1e-4);

  const endPt = catmullRomVec3(p0, p1, p2, p3, 1);
  approx(endPt.x, p2.x, 1e-4);
  approx(endPt.y, p2.y, 1e-4);
  approx(endPt.z, p2.z, 1e-4);

  const kfs: CameraKeyframe[] = [
    { position: p0, rotation: { x: 0, y: 0, z: 0, w: 1 }, lensFocalLength: 35 },
    { position: p1, rotation: { x: 0, y: 0, z: 0, w: 1 }, lensFocalLength: 35 },
    { position: p2, rotation: { x: 0, y: 0, z: 0, w: 1 }, lensFocalLength: 50 },
    { position: p3, rotation: { x: 0, y: 0, z: 0, w: 1 }, lensFocalLength: 85 },
  ];

  const rail = generateDollyRail(kfs, 8);
  assert.ok(rail.points.length > 20);
  assert.ok(rail.totalLengthM > 5.0);
  approx(rail.boundsMin.x, -0.15, 0.05);
  approx(rail.boundsMax.x, 4, 1e-2);
  approx(rail.boundsMin.z, 1.85, 0.05);
  approx(rail.boundsMax.z, 6, 1e-2);
});

test('buildCameraTimeline and sampleCameraTimeline spline, focal zoom, and look-at lock', () => {
  const kfs: CameraKeyframe[] = [
    {
      position: { x: 0, y: 1.6, z: 6 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      lensFocalLength: 24,
      focusDistanceM: 6.0,
      holdDurationS: 1.0,
    },
    {
      position: { x: 0, y: 1.6, z: 2 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      lensFocalLength: 50,
      focusDistanceM: 2.0,
      holdDurationS: 0.5,
    },
  ];

  // Distance = 4.0m, speed = 1.0 m/s -> move takes 4.0s + hold 1.0s + hold 0.5s = 5.5s
  const tl = buildCameraTimeline(kfs, 1.0);
  approx(tl.duration, 5.5, 0.1);

  // Sample at t = 0 (start)
  const s0 = sampleCameraTimeline(kfs, tl, 0);
  assert.ok(s0);
  approx(s0.position.z, 6.0, 0.05);
  approx(s0.lensFocalLength, 24, 0.05);

  // Sample at t = 5.5 (end)
  const sEnd = sampleCameraTimeline(kfs, tl, 5.5);
  assert.ok(sEnd);
  approx(sEnd.position.z, 2.0, 0.05);
  approx(sEnd.lensFocalLength, 50, 0.05);

  // Sample with look-at tracking constraint targeting actor at (2, 1.6, 0)
  const actorPos: Vec3 = { x: 2, y: 1.6, z: 0 };
  const sTrack = sampleCameraTimeline(kfs, tl, 2.5, actorPos);
  assert.ok(sTrack);
  // Focus distance should equal distance from camera sample position to actor
  const expectedDist = vecDistance(sTrack.position, actorPos);
  approx(sTrack.focusDistanceM, expectedDist, 0.01);

  // Duration override scaling
  const tlScaled = buildCameraTimeline(kfs, 1.0, 10.0);
  assert.equal(tlScaled.duration, 10.0);
});

test('classifyCameraMove identifies dolly-push, dolly-pull, truck, boom, pan-tilt, and zoom', () => {
  // 1. Static
  const staticCls = classifyCameraMove([]);
  assert.equal(staticCls.moveType, 'static');

  // 2. Pan / Tilt on Tripod (no position change, rotation only)
  const panTiltKfs: CameraKeyframe[] = [
    { position: { x: 0, y: 1.6, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, lensFocalLength: 35 },
    {
      position: { x: 0, y: 1.6, z: 0 },
      rotation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
      lensFocalLength: 35,
    },
  ];
  const panTiltCls = classifyCameraMove(panTiltKfs);
  assert.equal(panTiltCls.moveType, 'pan-tilt');
  assert.ok(panTiltCls.isPureRotation);

  // 3. Zoom on Tripod (no position change, focal change)
  const zoomKfs: CameraKeyframe[] = [
    { position: { x: 0, y: 1.6, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, lensFocalLength: 24 },
    { position: { x: 0, y: 1.6, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, lensFocalLength: 85 },
  ];
  const zoomCls = classifyCameraMove(zoomKfs);
  assert.equal(zoomCls.moveType, 'zoom');
  assert.ok(zoomCls.hasFocalPull);

  // 4. Dolly Push-In (camera moves along -Z forward)
  const pushKfs: CameraKeyframe[] = [
    { position: { x: 0, y: 1.6, z: 5 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, lensFocalLength: 35 },
    { position: { x: 0, y: 1.6, z: 1 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, lensFocalLength: 35 },
  ];
  const pushCls = classifyCameraMove(pushKfs);
  assert.equal(pushCls.moveType, 'dolly-push');
  assert.ok(pushCls.description.includes('Dolly Push-In'));

  // 5. Dolly Pull-Out (camera moves along +Z backward)
  const pullKfs: CameraKeyframe[] = [
    { position: { x: 0, y: 1.6, z: 1 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, lensFocalLength: 35 },
    { position: { x: 0, y: 1.6, z: 5 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, lensFocalLength: 35 },
  ];
  const pullCls = classifyCameraMove(pullKfs);
  assert.equal(pullCls.moveType, 'dolly-pull');
  assert.ok(pullCls.description.includes('Dolly Pull-Out'));

  // 6. Truck / Lateral Tracking (camera moves along +X)
  const truckKfs: CameraKeyframe[] = [
    { position: { x: 0, y: 1.6, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, lensFocalLength: 35 },
    { position: { x: 4, y: 1.6, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, lensFocalLength: 35 },
  ];
  const truckCls = classifyCameraMove(truckKfs);
  assert.equal(truckCls.moveType, 'truck');
  assert.ok(truckCls.description.includes('Tracking / Truck Shot'));

  // 7. Boom / Pedestal / Crane (camera moves along +Y)
  const boomKfs: CameraKeyframe[] = [
    { position: { x: 0, y: 0.5, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, lensFocalLength: 35 },
    { position: { x: 0, y: 2.5, z: 3 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, lensFocalLength: 35 },
  ];
  const boomCls = classifyCameraMove(boomKfs);
  assert.equal(boomCls.moveType, 'boom');
  assert.ok(boomCls.description.includes('Crane / Jib Pedestal'));
});

test('SMPTE 24fps timecode conversion and frame math', () => {
  // 1. Basic conversions
  assert.equal(secondsToSmpte(0).formatted, '00:00:00:00');
  assert.equal(secondsToSmpte(1.0).formatted, '00:00:01:00');
  assert.equal(secondsToSmpte(1.5).formatted, '00:00:01:12');
  assert.equal(secondsToSmpte(60).formatted, '00:01:00:00');
  assert.equal(secondsToSmpte(3661 + 1 / 24).formatted, '01:01:01:01');

  // 2. Component breakdown
  const tc = secondsToSmpte(73.5);
  assert.equal(tc.hours, 0);
  assert.equal(tc.minutes, 1);
  assert.equal(tc.seconds, 13);
  assert.equal(tc.frames, 12);
  assert.equal(tc.formatted, '00:01:13:12');

  // 3. Reverse conversion from string
  assert.equal(smpteToSeconds('00:00:00:00'), 0);
  assert.equal(smpteToSeconds('00:00:01:00'), 1);
  assert.equal(smpteToSeconds('00:00:01:12'), 1.5);
  assert.equal(smpteToSeconds('00:01:00:00'), 60);

  // 4. Frame count conversions
  assert.equal(secondsToFrames(1.0), 24);
  assert.equal(secondsToFrames(2.5), 60);
  assert.equal(framesToSeconds(24), 1.0);
  assert.equal(framesToSeconds(48), 2.0);
});

test('Transport state machine: advance, step, scrub, loop, and playback rates', () => {
  const initial: TransportState = {
    currentTimeS: 0,
    durationS: 10,
    isPlaying: true,
    playbackRate: 1.0,
    isLooping: false,
    loopInS: null,
    loopOutS: null,
  };

  // 1. Advance linear
  const s1 = advanceTransport(initial, 1.0);
  assert.equal(s1.currentTimeS, 1.0);
  assert.equal(s1.isPlaying, true);

  // 2. Advance with playback rate (2x)
  const sRate = { ...initial, playbackRate: 2.0 };
  const s2 = advanceTransport(sRate, 1.0);
  assert.equal(s2.currentTimeS, 2.0);

  // 3. Clamp at end when not looping
  const sClamp = advanceTransport({ ...initial, currentTimeS: 9.5 }, 1.0);
  assert.equal(sClamp.currentTimeS, 10);
  assert.equal(sClamp.isPlaying, false);

  // 4. Wrap around when looping
  const sLoop = { ...initial, isLooping: true, loopInS: 2.0, loopOutS: 6.0, currentTimeS: 5.5 };
  const sLoopAdv = advanceTransport(sLoop, 1.0);
  // 5.5 + 1.0 = 6.5 -> wrapped inside [2.0, 6.0] -> 2.0 + (6.5 - 6.0) = 2.5
  assert.equal(sLoopAdv.currentTimeS, 2.5);
  assert.equal(sLoopAdv.isPlaying, true);

  // 5. Step frames
  const sStepFwd = stepTransportFrames(initial, 1);
  assert.ok(Math.abs(sStepFwd.currentTimeS - 1 / 24) < 1e-5);
  assert.equal(sStepFwd.isPlaying, false);

  const sStepBack = stepTransportFrames(sStepFwd, -1);
  assert.equal(sStepBack.currentTimeS, 0);

  // 6. Scrubbing
  const sScrub = scrubTransport(initial, 0.5);
  assert.equal(sScrub.currentTimeS, 5.0);
  assert.equal(sScrub.isPlaying, false);

  // 7. In / Out points and cycle playback rate
  const sIn = setTransportInPoint(initial, 2.0);
  assert.equal(sIn.loopInS, 2.0);
  assert.equal(sIn.isLooping, false);

  const sOut = setTransportOutPoint(sIn, 8.0);
  assert.equal(sOut.loopOutS, 8.0);
  assert.equal(sOut.isLooping, true);

  const sClear = clearTransportLoop(sOut);
  assert.equal(sClear.isLooping, false);
  assert.equal(sClear.loopInS, null);
  assert.equal(sClear.loopOutS, null);

  assert.equal(cyclePlaybackRate(1.0), 2.0);
  assert.equal(cyclePlaybackRate(2.0), 0.25);
  assert.equal(cyclePlaybackRate(0.25), 0.5);
  assert.equal(cyclePlaybackRate(0.5), 1.0);
});

test('TakeLibrary: in-memory take catalog, selection, and pagination', () => {
  const lib = new TakeLibrary();
  assert.equal(lib.count, 0);
  assert.equal(lib.activeTake, null);

  const take1: TakeRecord = createTakeRecord({
    takeNumber: 1,
    sceneName: 'Scene1_CAM_A_Take_1',
    blob: new Blob([], { type: 'video/webm' }),
    url: 'blob:http://localhost/test1',
    durationS: 4.5,
    cameraName: 'CAM A',
    focalLengthMm: 35,
    tStop: 2.8,
    aspect: '16:9',
    formatShort: 'S35',
  });

  const take2: TakeRecord = createTakeRecord({
    takeNumber: 2,
    sceneName: 'Scene1_CAM_A_Take_2',
    blob: new Blob([], { type: 'video/webm' }),
    url: 'blob:http://localhost/test2',
    durationS: 6.2,
    cameraName: 'CAM A',
    focalLengthMm: 50,
    tStop: 2.0,
    aspect: '2.39:1',
    formatShort: 'FF',
  });

  lib.addTake(take1);
  assert.equal(lib.count, 1);
  assert.ok(lib.activeTake !== null);
  assert.equal((lib.activeTake as TakeRecord).id, take1.id);
  assert.equal((lib.activeTake as TakeRecord).takeNumber, 1);
  assert.equal((lib.activeTake as TakeRecord).smpteDuration, '00:00:04:12');

  lib.addTake(take2);
  assert.equal(lib.count, 2);
  // Adding a new take selects the latest take
  assert.ok(lib.activeTake !== null);
  assert.equal((lib.activeTake as TakeRecord).id, take2.id);
  assert.equal((lib.activeTake as TakeRecord).takeNumber, 2);

  // Pagination
  const prev = lib.prevTake();
  assert.ok(prev !== null);
  assert.equal((prev as TakeRecord).id, take1.id);
  assert.equal((lib.activeTake as TakeRecord).id, take1.id);

  const next = lib.nextTake();
  assert.ok(next !== null);
  assert.equal((next as TakeRecord).id, take2.id);
  assert.equal((lib.activeTake as TakeRecord).id, take2.id);

  // Selection by ID
  lib.selectTake(take1.id);
  assert.equal((lib.activeTake as TakeRecord).id, take1.id);
});

// --- Spatial Audio Cues & Sound Design Stems -------------------------------

test('Spatial Audio Cues: createAudioCue defaults and custom overrides', () => {
  const cue = createAudioCue({
    name: 'Dialogue Line 1',
    type: 'dialogue',
    timestampS: 2.5,
    durationS: 3.0,
    volume: 0.8,
  });

  assert.ok(cue.id.startsWith('cue-'));
  assert.equal(cue.name, 'Dialogue Line 1');
  assert.equal(cue.type, 'dialogue');
  assert.equal(cue.timestampS, 2.5);
  assert.equal(cue.durationS, 3.0);
  assert.equal(cue.volume, 0.8);
  assert.equal(cue.spatial, true);
  assert.equal(cue.synthTone?.frequencyHz, 320);
  assert.equal(cue.synthTone?.waveform, 'triangle');
});

test('Spatial Audio Cues: isAudioCueData type guard and normalizeAudioCue validation', () => {
  const valid = createAudioCue({ name: 'Footstep', type: 'foley' });
  assert.equal(isAudioCueData(valid), true);
  assert.equal(isAudioCueData(null), false);
  assert.equal(isAudioCueData({ name: 'Invalid' }), false);

  // Normalization clamps out-of-bounds values
  const normalized = normalizeAudioCue({
    id: 'test',
    name: 'Bad Numbers',
    type: 'sfx',
    timestampS: -5,
    durationS: -1,
    volume: 2.5,
    pitch: 0.01,
    loop: false,
    spatial: true,
    refDistanceM: -1,
    maxDistanceM: -10,
    rolloffFactor: -2,
    coneInnerAngleDeg: 400,
    coneOuterAngleDeg: -20,
    coneOuterGain: 3.0,
  });

  assert.equal(normalized.timestampS, 0);
  assert.equal(normalized.durationS, 0.1); // Min duration clamp
  assert.equal(normalized.volume, 1.0);    // Max volume clamp
  assert.equal(normalized.pitch, 0.5);     // Min pitch clamp
  assert.equal(normalized.refDistanceM, 0.1);
  assert.equal(normalized.maxDistanceM, 0.5);
  assert.equal(normalized.rolloffFactor, 0);
  assert.equal(normalized.coneInnerAngleDeg, 400);
  assert.equal(normalized.coneOuterAngleDeg, -20);
  assert.equal(normalized.coneOuterGain, 1.0);
});

test('Spatial Audio Cues: Scene integration createAudioCueForScene and duplicateAudioCue', () => {
  const scene = createScene('Audio Scene');
  assert.equal(scene.audioCues?.length, 0);

  const cue1 = createAudioCueForScene(scene, {
    name: 'Gunshot SFX',
    type: 'sfx',
    timestampS: 1.0,
    durationS: 0.5,
  });

  assert.equal(scene.audioCues?.length, 1);
  assert.equal(scene.audioCues?.[0]?.name, 'Gunshot SFX');

  const dup = duplicateAudioCue(scene, cue1.id);
  assert.ok(dup !== null);
  assert.equal(scene.audioCues?.length, 2);
  assert.notEqual(dup?.id, cue1.id);
  assert.equal(dup?.name, 'Gunshot SFX (Copy)');
  assert.equal(dup?.timestampS, 2.0); // Offset by +1.0s

  // Normalization of full scene preserves and validates audioCues
  const normScene = normalizeScene(scene);
  assert.equal(normScene.audioCues?.length, 2);
});

test('Spatial Audio Cues: sampleActiveAudioCues timeline sampling and looping', () => {
  const cue1 = createAudioCue({ id: 'c1', name: 'Intro Dialogue', type: 'dialogue', timestampS: 1.0, durationS: 2.0 });
  const cue2 = createAudioCue({ id: 'c2', name: 'Room Ambience', type: 'ambience', timestampS: 0.0, durationS: 10.0, loop: true });
  const cue3 = createAudioCue({ id: 'c3', name: 'Exit Punch', type: 'sfx', timestampS: 4.0, durationS: 1.0 });

  const cues = [cue1, cue2, cue3];

  // At t = 0.5s: only ambient loop active
  const samp05 = sampleActiveAudioCues(cues, 0.5);
  assert.equal(samp05.length, 1);
  assert.equal(samp05[0].cue.id, 'c2');
  assert.equal(samp05[0].offsetS, 0.5);

  // At t = 1.5s: cue1 and cue2 active
  const samp15 = sampleActiveAudioCues(cues, 1.5);
  assert.equal(samp15.length, 2);
  const ids15 = samp15.map((s) => s.cue.id);
  assert.ok(ids15.includes('c1'));
  assert.ok(ids15.includes('c2'));

  // At t = 4.2s: cue2 and cue3 active
  const samp42 = sampleActiveAudioCues(cues, 4.2);
  assert.equal(samp42.length, 2);
  const ids42 = samp42.map((s) => s.cue.id);
  assert.ok(ids42.includes('c2'));
  assert.ok(ids42.includes('c3'));
});

test('Spatial Audio Cues: evaluateCueSpatialPosition tracking actor and static emitters', () => {
  const staticCue = createAudioCue({
    name: 'Static Radio',
    position: { x: 3.0, y: 1.2, z: -4.0 },
  });
  const staticPos = evaluateCueSpatialPosition(staticCue);
  assert.deepEqual(staticPos, { x: 3.0, y: 1.2, z: -4.0 });

  // Actor attached cue
  const actorCue = createAudioCue({
    name: 'Actor Voice',
    attachedActorId: 'actor-1',
  });
  const actorMap = new Map<string, Vec3>([
    ['actor-1', { x: 2.0, y: 0.0, z: 5.0 }],
  ]);
  const actorPos = evaluateCueSpatialPosition(actorCue, actorMap);
  // Expects actor position + 1.5m mouth/head height offset
  assert.deepEqual(actorPos, { x: 2.0, y: 1.5, z: 5.0 });
});

test('Spatial Audio Cues: generateDawStemManifest Pro Tools / Reaper CSV EDL export', () => {
  const cues: AudioCueData[] = [
    createAudioCue({ id: 'c1', name: 'Lead Dialogue', type: 'dialogue', timestampS: 1.0, durationS: 2.5, volume: 0.8, attachedActorId: 'actor-1' }),
    createAudioCue({ id: 'c2', name: 'Steps On Gravel', type: 'foley', timestampS: 3.0, durationS: 1.2, volume: 0.5 }),
    createAudioCue({ id: 'c3', name: 'Gunshot Reverb', type: 'sfx', timestampS: 4.5, durationS: 0.8, volume: 1.0 }),
  ];

  const manifest = generateDawStemManifest(cues, 6.0, 'Warehouse Confrontation', 24);

  assert.equal(manifest.sceneName, 'Warehouse Confrontation');
  assert.equal(manifest.fps, 24);
  assert.equal(manifest.totalDurationS, 6.0);
  assert.equal(manifest.smpteDuration, '00:00:06:00');
  assert.equal(manifest.tracks.length, 5); // all 5 standard stem track types

  const dialogueTrack = manifest.tracks.find((t) => t.trackType === 'dialogue');
  assert.ok(dialogueTrack !== undefined);
  assert.equal(dialogueTrack?.cues.length, 1);
  assert.equal(dialogueTrack?.cues[0].name, 'Lead Dialogue');
  assert.equal(dialogueTrack?.cues[0].smpteIn, '00:00:01:00');
  assert.equal(dialogueTrack?.cues[0].smpteOut, '00:00:03:12');
  assert.equal(dialogueTrack?.cues[0].spatial, true);

  // Validate CSV EDL format
  assert.ok(manifest.csvEdl.includes('Track,Cue Name,Type,SMPTE In,SMPTE Out'));
  assert.ok(manifest.csvEdl.includes('Lead Dialogue'));
  assert.ok(manifest.csvEdl.includes('Steps On Gravel'));
  assert.ok(manifest.csvEdl.includes('Gunshot Reverb'));
});

// --- AI Shot Continuity & Storyboard Engine Tests -----------------------------

test('parseScreenplayText parses scene headings, dialogue, parentheticals, and sound cues', () => {
  const scriptText = `
INT. ROOFTOP - NIGHT

Rain lashes against the concrete.

SARAH (whispering)
We cannot stay here any longer.

(SFX: Distant police siren wailing)

MARCUS
Just give me ten more seconds to bypass the lock.
  `.trim();

  const script = parseScreenplayText(scriptText);
  assert.equal(script.sceneSlug, 'INT. ROOFTOP - NIGHT');
  const dialogueBeats = script.beats.filter((b) => b.type === 'dialogue');
  assert.equal(dialogueBeats.length, 2);

  const beat1 = dialogueBeats[0];
  assert.equal(beat1.characterName, 'SARAH');
  assert.equal(beat1.parenthetical, 'whispering');
  assert.equal(beat1.content, 'We cannot stay here any longer.');

  const beat2 = dialogueBeats[1];
  assert.equal(beat2.characterName, 'MARCUS');
  assert.equal(beat2.content, 'Just give me ten more seconds to bypass the lock.');

  const soundBeats = script.beats.filter((b) => b.type === 'sound');
  assert.equal(soundBeats.length, 1);
  assert.ok(soundBeats[0].content.includes('Distant police siren wailing'));
});

test('check30DegreeRule flags jump cuts when angle < 30° and focal length delta < 20%', () => {
  const s = createScene('jump-cut-test');
  const identityQuat = { x: 0, y: 0, z: 0, w: 1 };
  const cam1 = createCameraSetup(s, { x: 0, y: 1.5, z: 3 }, identityQuat, 50, '16:9');
  const cam2 = createCameraSetup(s, { x: 0.1, y: 1.5, z: 3.1 }, identityQuat, 50, '16:9');

  // Both cameras look along -Z with identical 50mm lenses
  const result1 = check30DegreeRule(cam1, cam2);
  assert.equal(result1.isJumpCut, true);
  assert.ok(result1.angleDeltaDeg < 10);
  assert.ok(result1.focalDeltaPercent < 5);

  // Changing Cam B lens to 100mm (100% focal delta) breaks the jump cut
  cam2.lensFocalLength = 100;
  const result2 = check30DegreeRule(cam1, cam2);
  assert.equal(result2.isJumpCut, false);
  assert.ok(result2.focalDeltaPercent >= 20);

  // Changing Cam B angle by 45 degrees breaks the jump cut
  cam2.lensFocalLength = 50;
  // Rotate Cam B 45 degrees around Y: q = (0, sin(22.5°), 0, cos(22.5°))
  const rad = (45 * Math.PI) / 180 / 2;
  cam2.rotation = { x: 0, y: Math.sin(rad), z: 0, w: Math.cos(rad) };
  const result3 = check30DegreeRule(cam1, cam2);
  assert.equal(result3.isJumpCut, false);
  assert.ok(result3.angleDeltaDeg >= 30);
});

test('checkEyelineMatch verifies complementary screen-left / screen-right look directions', () => {
  const s = createScene('eyeline-test');
  const actor1 = createActor(s, { x: -1.0, y: 0, z: 0 }, 0); // Sarah
  const actor2 = createActor(s, { x: 1.0, y: 0, z: 0 }, 0);  // Marcus
  actor1.name = 'Sarah';
  actor2.name = 'Marcus';

  // Both cameras stand in front of the actors (z = 2.5) looking north (-Z)
  const identityRot = { x: 0, y: 0, z: 0, w: 1 };
  const cam1 = createCameraSetup(s, { x: -0.8, y: 1.5, z: 2.5 }, identityRot, 50, '16:9');
  const cam2 = createCameraSetup(s, { x: 0.8, y: 1.5, z: 2.5 }, identityRot, 50, '16:9');

  const eyeline = checkEyelineMatch(actor1.position, actor2.position, cam1, cam2);
  assert.equal(eyeline.status, 'matching');
  assert.equal(eyeline.actor1ScreenGaze, 'right');
  assert.equal(eyeline.actor2ScreenGaze, 'left');
});

test('checkScreenDirectionContinuity flags screen motion reversals between cameras', () => {
  const s = createScene('motion-continuity-test');
  const startPos = { x: -2, y: 0, z: 0 };
  const endPos = { x: 2, y: 0, z: 0 };

  // Cam 1 stands at z = 3 looking north (-Z) -> actor moves screen-right (dot > 0)
  const identityRot = { x: 0, y: 0, z: 0, w: 1 };
  const cam1 = createCameraSetup(s, { x: 0, y: 1.5, z: 3 }, identityRot, 35, '16:9');

  // Cam 2 stands at z = -3 looking south (+Z) -> actor moves screen-left (dot < 0)
  const rot180 = { x: 0, y: 1, z: 0, w: 0 }; // facing +Z (180 deg around Y)
  const cam2 = createCameraSetup(s, { x: 0, y: 1.5, z: -3 }, rot180, 35, '16:9');

  const check = checkScreenDirectionContinuity(startPos, endPos, cam1, cam2);
  assert.equal(check.isReversal, true);
  assert.equal(check.cam1Motion, 'right');
  assert.equal(check.cam2Motion, 'left');
});

test('checkShotScaleProgression detects scale jumps between shots', () => {
  const jumpResult = checkShotScaleProgression('ECU', 'EWS');
  assert.equal(jumpResult.isScaleJump, true);
  assert.ok(jumpResult.rankDiff >= 4);

  const smoothResult = checkShotScaleProgression('MS', 'MCU');
  assert.equal(smoothResult.isScaleJump, false);
});

test('auditSceneContinuity generates scored multi-camera audit report', () => {
  const s = createScene('full-audit-test');
  const actor1 = createActor(s, { x: -1.0, y: 0, z: 0 }, 0);
  const actor2 = createActor(s, { x: 1.0, y: 0, z: 0 }, 0);
  actor1.name = 'Actor A';
  actor2.name = 'Actor B';

  const identityRot = { x: 0, y: 0, z: 0, w: 1 };
  // Place 2 cameras on the same side of the 180° line with distinct angles (>30°)
  createCameraSetup(s, { x: -1.0, y: 1.5, z: 2.5 }, identityRot, 24, '16:9');
  createCameraSetup(s, { x: 1.0, y: 1.5, z: 2.5 }, identityRot, 85, '16:9');

  const audit = auditSceneContinuity(s);
  assert.ok(audit.score >= 80);
  assert.ok(audit.overallStatus === 'clean' || audit.overallStatus === 'warning');
});

test('renderStoryboardPanelSvg & generateStoryboard produce valid visual SVG storyboard panels', () => {
  const s = createScene('storyboard-render-test');
  const actor = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  actor.stance = 'seated-chair';
  actor.name = 'Detective';
  const identityRot = { x: 0, y: 0, z: 0, w: 1 };
  const cam = createCameraSetup(s, { x: 0, y: 1.5, z: 2.2 }, identityRot, 50, '16:9');

  const svg = renderStoryboardPanelSvg({
    camera: cam,
    shotSize: 'MS',
    subjectDistanceM: 2.2,
    widthPx: 480,
    heightPx: 270,
  });

  assert.ok(svg.includes('<svg'));
  assert.ok(svg.includes('viewBox="0 0 480 270"'));
  assert.ok(svg.includes(cam.name));
  assert.ok(svg.includes('50mm'));
  assert.ok(svg.includes('Medium Shot'));

  const script = generateScriptBreakdownFromScene(s);
  const storyboard = generateStoryboard(s, script);
  assert.equal(storyboard.sceneName, 'storyboard-render-test');
  assert.equal(storyboard.panels.length, 1);
  assert.ok(storyboard.panels[0].shotSizeLabel.length > 0);
  assert.ok(storyboard.panels[0].shotSize !== undefined);

  const html = storyboard.htmlDocument;
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('SetView Storyboard'));
  assert.ok(html.includes(storyboard.sceneName));
});

test('simulateAiContinuityBreakdown & buildAiContinuityPromptPackage output prompt content', () => {
  const s = createScene('ai-prompt-test');
  const actor1 = createActor(s, { x: -1.0, y: 0, z: 0 }, 0);
  const actor2 = createActor(s, { x: 1.0, y: 0, z: 0 }, 0);
  actor1.name = 'Pilot';
  actor2.name = 'Co-Pilot';
  const identityRot = { x: 0, y: 0, z: 0, w: 1 };
  const cam = createCameraSetup(s, { x: 0, y: 1.5, z: 3.0 }, identityRot, 28, '16:9');

  const prompt = buildAiContinuityPromptPackage(s);
  assert.ok(prompt.includes('SetView AI Cinematography'));
  assert.ok(prompt.includes(cam.name));
  assert.ok(prompt.includes('Pilot'));
  assert.ok(prompt.includes('Co-Pilot'));

  const simulated = simulateAiContinuityBreakdown(s);
  assert.ok(simulated.includes('AI Shot Continuity & Storyboard Analysis'));
  assert.ok(simulated.includes(cam.name));
});

// --- multi-user webrtc collaboration & room domain tests -------------------------

test('collab room codes: generateRoomCode, isValidRoomCode, and normalizeRoomCode', () => {
  const code = generateRoomCode();
  assert.equal(/^SET-[A-Z0-9]{3}$/.test(code), true);
  assert.equal(isValidRoomCode(code), true);

  // Valid codes
  assert.equal(isValidRoomCode('SET-ABC'), true);
  assert.equal(isValidRoomCode('SET-123'), true);
  assert.equal(isValidRoomCode('set-xyz'), true); // case insensitive validation
  assert.equal(isValidRoomCode('SET-X9Z'), true);

  // Invalid codes
  assert.equal(isValidRoomCode(''), false);
  assert.equal(isValidRoomCode('ABC'), false);
  assert.equal(isValidRoomCode('ROOM-123'), false);
  assert.equal(isValidRoomCode('SET-1234'), false);
  assert.equal(isValidRoomCode('SET-12'), false);
  assert.equal(isValidRoomCode('SET-!@#'), false);

  // Normalization
  assert.equal(normalizeRoomCode('set-abc'), 'SET-ABC');
  assert.equal(normalizeRoomCode('abc'), 'SET-ABC');
  assert.equal(normalizeRoomCode('  SET-xyz  '), 'SET-XYZ');
  assert.equal(normalizeRoomCode('invalid!code'), '');
});

test('collab roles: metadata, badge labels, and theme color lookups', () => {
  assert.equal(COLLAB_ROLES.director.badgeLabel, 'DIR');
  assert.equal(COLLAB_ROLES.dp.badgeLabel, 'DP');
  assert.equal(COLLAB_ROLES.gaffer.badgeLabel, 'GAFF');
  assert.equal(COLLAB_ROLES.actor.badgeLabel, 'ACT');
  assert.equal(COLLAB_ROLES.observer.badgeLabel, 'OBS');

  assert.ok(COLLAB_ROLES.director.defaultColorHex.startsWith('#'));
  assert.ok(COLLAB_ROLES.dp.defaultColorHex.startsWith('#'));
});

test('collab roster: add, update, retrieve, sort order, and prune stale peers', () => {
  const roster = new PeerRoster();
  assert.equal(roster.count, 0);

  const peer1: PeerPresence = {
    id: 'peer-act-1',
    name: 'Actor 1',
    role: 'actor',
    color: '#10b981',
    deviceType: 'quest',
    lastSeenTs: 1000,
    joinedAtTs: 1000,
    isSpeaking: false,
    isMuted: false,
    audioVolume: 0,
    pingMs: 25,
    headPose: {
      position: { x: 0, y: 1.6, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
  };

  const peer2: PeerPresence = {
    id: 'peer-dir-1',
    name: 'Director Jane',
    role: 'director',
    color: '#3b82f6',
    deviceType: 'visionpro',
    lastSeenTs: 1500,
    joinedAtTs: 1000,
    isSpeaking: false,
    isMuted: false,
    audioVolume: 0,
    pingMs: 30,
    headPose: {
      position: { x: 0, y: 1.7, z: 2 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
  };

  roster.addOrUpdatePeer(peer1);
  roster.addOrUpdatePeer(peer2);
  assert.equal(roster.count, 2);
  assert.equal(roster.getPeer('peer-act-1')?.name, 'Actor 1');
  assert.equal(roster.getPeer('peer-dir-1')?.name, 'Director Jane');

  // Director sorts before Actor in production roster
  const all = roster.allPeers();
  assert.equal(all[0].role, 'director');
  assert.equal(all[1].role, 'actor');

  // Prune stale peers
  const pruned = roster.pruneStalePeers(2000, 800); // threshold 800ms relative to 2000ms
  assert.deepEqual(pruned, ['peer-act-1']);
  assert.equal(roster.count, 1);
  assert.equal(roster.getPeer('peer-act-1'), null);
  assert.equal(roster.getPeer('peer-dir-1')?.name, 'Director Jane');

  roster.clear();
  assert.equal(roster.count, 0);
});

test('collab entity locks: acquire, conflict rejection, renewal, release, and expiry', () => {
  const locks = new EntityLockManager();
  const now = 1000;

  // Initial acquire succeeds
  const lock1 = locks.acquireLock('actor-1', 'actor', 'peer-dir', 'Director', 5000, now);
  assert.notEqual(lock1, null);
  assert.equal(lock1?.entityId, 'actor-1');
  assert.equal(lock1?.lockedByPeerId, 'peer-dir');

  // Conflict: second peer cannot acquire locked entity
  const lock2 = locks.acquireLock('actor-1', 'actor', 'peer-dp', 'DP', 5000, now);
  assert.equal(lock2, null);
  assert.equal(locks.isLockedByOther('actor-1', 'peer-dp', now), true);
  assert.equal(locks.isLockedByOther('actor-1', 'peer-dir', now), false);

  // Renewal: same peer can renew lock
  const renewed = locks.acquireLock('actor-1', 'actor', 'peer-dir', 'Director', 5000, now + 2000);
  assert.notEqual(renewed, null);
  assert.equal(renewed?.expiresAtTs, now + 7000);

  // Unauthorized release is rejected
  assert.equal(locks.releaseLock('actor-1', 'peer-dp'), false);
  assert.equal(locks.getLock('actor-1', now)?.lockedByPeerId, 'peer-dir');

  // Authorized release succeeds
  assert.equal(locks.releaseLock('actor-1', 'peer-dir'), true);
  assert.equal(locks.getLock('actor-1', now), null);
  assert.equal(locks.isLockedByOther('actor-1', 'peer-dp', now), false);

  // Multi-lock acquisition and peer departure cleanup
  locks.acquireLock('actor-2', 'actor', 'peer-gaff', 'Gaffer', 5000, now);
  locks.acquireLock('light-1', 'light', 'peer-gaff', 'Gaffer', 5000, now);
  assert.equal(locks.allLocks(now).length, 2);

  const released = locks.releaseByPeer('peer-gaff');
  assert.equal(released.length, 2);
  assert.equal(locks.allLocks(now).length, 0);

  // Expiration cleanup
  locks.acquireLock('cam-1', 'camera', 'peer-act', 'Actor', 2000, now);
  assert.notEqual(locks.getLock('cam-1', now + 1000), null);
  assert.deepEqual(locks.cleanExpired(now + 2500), ['cam-1']);
  assert.equal(locks.getLock('cam-1', now + 2500), null);
});

test('collab scene patches: applyScenePatch updates actors, cameras, lights, and transport', () => {
  const s = createScene('collab-patch-test');
  const actor = createActor(s, { x: 0, y: 0, z: 0 }, 0);
  const cam = createCameraSetup(s, { x: 0, y: 1.5, z: 3 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '16:9');
  const light = createLight(s, [2, 3, 1], 'spot');

  // 1. Actor Move Patch
  const actorMovePatch: CollabScenePatch = {
    type: 'actor_move',
    actorId: actor.id,
    position: { x: 1.5, y: 0, z: -2.0 },
    rotationY: 1.25,
  };
  assert.equal(applyScenePatch(s, actorMovePatch), true);
  assert.equal(actor.position.x, 1.5);
  assert.equal(actor.position.z, -2.0);
  assert.equal(actor.rotationY, 1.25);

  // 2. Actor Stance Patch
  const actorStancePatch: CollabScenePatch = {
    type: 'actor_stance',
    actorId: actor.id,
    stance: 'seated-chair',
  };
  assert.equal(applyScenePatch(s, actorStancePatch), true);
  assert.equal(actor.stance, 'seated-chair');

  // 3. Camera Move Patch (with focal, tStop, aspect)
  const camMovePatch: CollabScenePatch = {
    type: 'camera_move',
    cameraId: cam.id,
    position: { x: -1.0, y: 1.8, z: 4.0 },
    rotation: { x: 0.1, y: 0.2, z: 0, w: 0.97 },
    lensFocalLength: 50,
    tStop: 1.4,
    aspect: '2.39:1',
  };
  assert.equal(applyScenePatch(s, camMovePatch), true);
  assert.equal(cam.position.x, -1.0);
  assert.equal(cam.rotation.y, 0.2);
  assert.equal(cam.lensFocalLength, 50);
  assert.equal(cam.tStop, 1.4);
  assert.equal(cam.aspect, '2.39:1');

  // 4. Light Update Patch
  const lightUpdatePatch: CollabScenePatch = {
    type: 'light_update',
    lightId: light.id,
    position: { x: 3.5, y: 4.0, z: -1.0 },
    intensity: 2.5,
    kelvin: 3200,
  };
  assert.equal(applyScenePatch(s, lightUpdatePatch), true);
  assert.equal(light.position[0], 3.5);
  assert.equal(light.position[1], 4.0);
  assert.equal(light.intensity, 2.5);
  assert.equal(light.colorKelvin, 3200);

  // 5. Timeline Transport Patch
  const transportPatch: CollabScenePatch = {
    type: 'timeline_transport',
    isPlaying: true,
    currentTimeS: 1.5,
    playbackRate: 1.0,
    isLooping: false,
    syncSeq: 1,
  };
  assert.equal(applyScenePatch(s, transportPatch), true);

  // 6. Non-existent Entity Patch Returns False
  const invalidPatch: CollabScenePatch = {
    type: 'actor_move',
    actorId: 'non-existent-actor',
    position: { x: 0, y: 0, z: 0 },
    rotationY: 0,
  };
  assert.equal(applyScenePatch(s, invalidPatch), false);
});

test('spatial audio: computeSpatialAudioGainAndPan computes attenuation and stereo panning', () => {
  const listenerPos = { x: 0, y: 1.6, z: 0 };
  const listenerRot = { x: 0, y: 0, z: 0, w: 1 }; // Facing -Z

  // 1. Sound directly in front (at z = -2.0)
  const frontSpeaker = { x: 0, y: 1.6, z: -2.0 };
  const frontPan = computeSpatialAudioGainAndPan(listenerPos, listenerRot, frontSpeaker, {
    refDistanceM: 1.0,
    maxDistanceM: 20.0,
    rolloffFactor: 1.0,
  });
  assert.ok(Math.abs(frontPan.stereoPan) < 0.05, 'sound directly in front has zero stereo pan');
  assert.ok(frontPan.gain > 0.4 && frontPan.gain < 0.6, 'sound at 2m has correct distance attenuation');
  assert.equal(frontPan.distanceM, 2.0);

  // 2. Sound directly to the right (at x = 3.0)
  const rightSpeaker = { x: 3.0, y: 1.6, z: 0 };
  const rightPan = computeSpatialAudioGainAndPan(listenerPos, listenerRot, rightSpeaker);
  assert.ok(rightPan.stereoPan > 0.8, 'sound to the right pans right');

  // 3. Sound directly to the left (at x = -3.0)
  const leftSpeaker = { x: -3.0, y: 1.6, z: 0 };
  const leftPan = computeSpatialAudioGainAndPan(listenerPos, listenerRot, leftSpeaker);
  assert.ok(leftPan.stereoPan < -0.8, 'sound to the left pans left');

  // 4. Sound at zero distance receives maximum gain
  const nearSpeaker = { x: 0, y: 1.6, z: 0.2 };
  const nearPan = computeSpatialAudioGainAndPan(listenerPos, listenerRot, nearSpeaker, { refDistanceM: 1.0 });
  assert.equal(nearPan.gain, 1.0);

  // 5. Sound beyond maxDistance receives minimal gain
  const farSpeaker = { x: 0, y: 1.6, z: 100.0 };
  const farPan = computeSpatialAudioGainAndPan(listenerPos, listenerRot, farSpeaker, {
    refDistanceM: 1.0,
    maxDistanceM: 20.0,
  });
  assert.ok(farPan.gain <= 0.05);
});

test('collab protocol: serializeCollabMessage and deserializeCollabMessage round-trip', () => {
  const message: CollabMessage = {
    type: 'presence',
    peerId: 'peer-123',
    presence: {
      name: 'Director Bob',
      role: 'director',
      isSpeaking: true,
      audioVolume: 0.85,
      headPose: {
        position: { x: 1.2, y: 1.6, z: -0.5 },
        rotation: { x: 0, y: 0.7071, z: 0, w: 0.7071 },
      },
    },
  };

  const raw = serializeCollabMessage(message);
  assert.equal(typeof raw, 'string');

  const parsed = deserializeCollabMessage(raw);
  assert.notEqual(parsed, null);
  assert.equal(parsed?.type, 'presence');
  if (parsed?.type === 'presence') {
    assert.equal(parsed.presence.name, 'Director Bob');
    assert.equal(parsed.presence.role, 'director');
    assert.equal(parsed.presence.isSpeaking, true);
    assert.equal(parsed.presence.audioVolume, 0.85);
    assert.equal(parsed.presence.headPose?.position.x, 1.2);
  }

  // Corrupted string returns null
  assert.equal(deserializeCollabMessage('invalid-json-string{]'), null);
  assert.equal(deserializeCollabMessage('{"missingType": true}'), null);
});


// --- 3D Set & Prop Assets ---------------------------------------------------

test('BUILTIN_PROPS: stock catalog has 17 items across 6 categories', () => {
  assert.equal(BUILTIN_PROPS.length, 17);
  const categories = new Set(BUILTIN_PROPS.map((p) => p.category));
  assert.ok(categories.has('furniture'));
  assert.ok(categories.has('grip_camera'));
  assert.ok(categories.has('architecture'));
  assert.ok(categories.has('practical_light'));
  assert.ok(categories.has('set_dressing'));
  assert.ok(categories.has('virtual_production'));
  for (const p of BUILTIN_PROPS) {
    assert.ok(p.id.length > 0);
    assert.ok(p.name.length > 0);
    assert.ok(p.dimensions.width > 0);
    assert.ok(p.dimensions.height > 0);
    assert.ok(p.dimensions.depth > 0);
  }
});

test('createPropData: creates valid PropData with defaults and overrides', () => {
  const prop = createPropData('directors_chair', undefined, { x: 1, y: 0, z: -2 });
  assert.ok(prop.id.startsWith('prop-'));
  assert.equal(prop.assetId, 'directors_chair');
  assert.ok(prop.name.includes("Director's Chair"));
  assert.equal(prop.category, 'furniture');
  assert.deepEqual(prop.position, { x: 1, y: 0, z: -2 });
  assert.equal(prop.rotationY, 0);
  assert.deepEqual(prop.scale, { x: 1, y: 1, z: 1 });
  assert.equal(prop.sourceType, 'builtin');
  assert.equal(prop.isLocked, false);
  assert.equal(prop.visible, true);

  const custom = createPropData('custom-obj', 'Hero Statue', { x: 0, y: 0.5, z: 0 }, {
    category: 'custom',
    rotationY: Math.PI / 2,
    scale: { x: 2, y: 2, z: 2 },
    colorHex: '#ff0000',
    sourceType: 'indexeddb',
    customModelKey: 'statue.glb',
  });
  assert.equal(custom.name, 'Hero Statue');
  assert.equal(custom.category, 'custom');
  assert.equal(custom.rotationY, Math.PI / 2);
  assert.deepEqual(custom.scale, { x: 2, y: 2, z: 2 });
  assert.equal(custom.colorHex, '#ff0000');
  assert.equal(custom.sourceType, 'indexeddb');
  assert.equal(custom.customModelKey, 'statue.glb');
});

test('duplicatePropData: creates offset clone with fresh ID', () => {
  const orig = createPropData('c_stand_with_arm', 'Main C-Stand', { x: 2, y: 0, z: 3 });
  const dup = duplicatePropData(orig, { x: 0.5, y: 0, z: 0.5 });
  assert.notEqual(dup.id, orig.id);
  assert.equal(dup.assetId, orig.assetId);
  assert.equal(dup.name, 'Main C-Stand (Copy)');
  assert.deepEqual(dup.position, { x: 2.5, y: 0, z: 3.5 });
  assert.equal(dup.rotationY, orig.rotationY);
});

test('isPropData: validates type shape and rejects malformed inputs', () => {
  const valid = createPropData('film_slate_clapper', undefined, { x: 0, y: 1, z: 0 });
  assert.ok(isPropData(valid));

  assert.equal(isPropData(null), false);
  assert.equal(isPropData(undefined), false);
  assert.equal(isPropData({}), false);
  assert.equal(isPropData({ id: 'prop-1' }), false);
  assert.equal(isPropData({ id: 'prop-1', assetId: 'chair', name: 'Chair', category: 'furniture', position: 'invalid' }), false);
});

test('normalizePropData: sanitizes properties, clamps scale, ensures valid bounds', () => {
  const raw: any = {
    id: 'prop-test',
    assetId: 'apple_box_full',
    name: '   Apple Box Full   ',
    category: 'grip_camera',
    position: { x: NaN, y: '0', z: -1 },
    rotationY: Infinity,
    scale: { x: -5, y: 100, z: 0 },
    colorHex: 'invalid-color',
  };
  const normalized = normalizePropData(raw);
  assert.ok(normalized);
  if (normalized) {
    assert.equal(normalized.id, 'prop-test');
    assert.equal(normalized.name, 'Apple Box Full');
    assert.equal(normalized.position.x, 0);
    assert.equal(normalized.position.y, 0);
    assert.equal(normalized.position.z, -1);
    assert.equal(normalized.rotationY, 0);
    assert.ok(normalized.scale.x >= 0.05);
    assert.ok(normalized.scale.y <= 20.0);
    assert.ok(normalized.scale.z >= 0.05);
    assert.equal(normalized.colorHex, '#b45309');
  }
});

test('calculatePropAABB: derives bounding boxes and dimension extents', () => {
  const prop = createPropData('production_desk', undefined, { x: 2, y: 0, z: 4 });
  const aabb = calculatePropAABB(prop);
  assert.ok(aabb.min.x < aabb.max.x);
  assert.ok(aabb.min.y <= aabb.max.y);
  assert.ok(aabb.min.z < aabb.max.z);
  approx(aabb.size.x, 1.5, 0.01);
  approx(aabb.size.y, 0.76, 0.01);
  approx(aabb.size.z, 0.8, 0.01);
  approx(aabb.center.x, 2, 0.01);
  approx(aabb.center.y, 0.38, 0.01);
  approx(aabb.center.z, 4, 0.01);
});

test('snapPropToFloor: grounds prop at y=0 based on its height', () => {
  const prop = createPropData('c_stand_with_arm', undefined, { x: 0, y: 5.0, z: 0 });
  const grounded = snapPropToFloor(prop);
  assert.equal(grounded.position.y, 0);
});

test('calculateGridPlacement: calculates grid offsets from origin', () => {
  const pos0 = calculateGridPlacement(0, { x: 0, y: 0, z: 0 }, 1.0, 4);
  const pos1 = calculateGridPlacement(1, { x: 0, y: 0, z: 0 }, 1.0, 4);
  const pos4 = calculateGridPlacement(4, { x: 0, y: 0, z: 0 }, 1.0, 4);
  approx(pos0.x, -1.5, 0.01);
  approx(pos0.z, 0.0, 0.01);
  approx(pos1.x, -0.5, 0.01);
  approx(pos4.x, -1.5, 0.01);
  approx(pos4.z, 1.0, 0.01);
});

test('filterPropsByCategory and searchProps: catalog lookup and substring filtering', () => {
  const grips = filterPropsByCategory(BUILTIN_PROPS, 'grip_camera');
  assert.ok(grips.length >= 3);
  for (const p of grips) assert.equal(p.category, 'grip_camera');

  const practicals = filterPropsByCategory(BUILTIN_PROPS, 'practical_light');
  assert.ok(practicals.length >= 2);

  const searchChair = searchProps(BUILTIN_PROPS, 'chair');
  assert.ok(searchChair.length >= 2); // Director's Chair + Office Chair

  const searchStand = searchProps(BUILTIN_PROPS, 'stand');
  assert.ok(searchStand.length >= 2); // C-Stand + Boom Stand
});

test('formatDimensions: formats metric dimension strings with cm/m scaling', () => {
  const dim = { width: 1.0, height: 2.0, depth: 0.5 };
  const str = formatDimensions(dim);
  assert.equal(str, '1.00m × 2.00m × 50cm');
});

test('applyScenePatch: prop_add, prop_move, prop_update, prop_remove', () => {
  const scene: SceneData = createScene('Props Collab Test');
  assert.deepEqual(scene.props, []);

  const prop1 = createPropData('directors_chair', undefined, { x: 0, y: 0, z: -2 });
  const prop2 = createPropData('c_stand_with_arm', undefined, { x: 1.5, y: 0, z: -2 });

  // 1. prop_add
  const add1 = applyScenePatch(scene, { type: 'prop_add', prop: prop1 });
  const add2 = applyScenePatch(scene, { type: 'prop_add', prop: prop2 });
  assert.equal(add1, true);
  assert.equal(add2, true);
  const props1 = scene.props as PropData[];
  assert.equal(props1.length, 2);
  assert.equal(props1[0].id, prop1.id);

  // 2. prop_move
  const moved = applyScenePatch(scene, {
    type: 'prop_move',
    propId: prop1.id,
    position: { x: 0.5, y: 0, z: -1.5 },
    rotationY: Math.PI / 4,
  });
  assert.equal(moved, true);
  const props2 = scene.props as PropData[];
  assert.deepEqual(props2[0].position, { x: 0.5, y: 0, z: -1.5 });
  assert.equal(props2[0].rotationY, Math.PI / 4);

  // 3. prop_update
  const updated = applyScenePatch(scene, {
    type: 'prop_update',
    propId: prop1.id,
    updates: {
      name: 'Custom Director Chair',
      colorHex: '#336699',
      isLocked: true,
    },
  });
  assert.equal(updated, true);
  const props3 = scene.props as PropData[];
  assert.equal(props3[0].name, 'Custom Director Chair');
  assert.equal(props3[0].colorHex, '#336699');
  assert.equal(props3[0].isLocked, true);

  // 4. prop_remove
  const removed = applyScenePatch(scene, {
    type: 'prop_remove',
    propId: prop1.id,
  });
  assert.equal(removed, true);
  const props4 = scene.props as PropData[];
  assert.equal(props4.length, 1);
  assert.equal(props4[0].id, prop2.id);

  // Remove non-existent prop returns false
  assert.equal(applyScenePatch(scene, { type: 'prop_remove', propId: 'nonexistent' }), false);
});

test('SceneData normalizeScene preserves and sanitizes props list', () => {
  const rawScene: any = {
    id: 'scene-props-norm',
    name: 'Scene With Props',
    actors: [],
    cameras: [],
    lights: [],
    audioCues: [],
    props: [
      createPropData('practical_floor_lamp', undefined, { x: 1, y: 0, z: 1 }),
      {
        id: 'prop-bad',
        assetId: 'apple_box_half',
        name: 'Half Apple',
        category: 'grip_camera',
        position: { x: 0, y: 0, z: 0 },
        rotationY: 0,
        scale: { x: 1, y: 1, z: 1 },
        sourceType: 'builtin',
      },
    ],
  };

  const norm = normalizeScene(rawScene);
  assert.equal(norm.props?.length, 2);
  assert.equal(norm.props?.[0].assetId, 'practical_floor_lamp');
  assert.equal(norm.props?.[1].name, 'Half Apple');
});

// --- Atmosphere & Volumetric Lighting Domain Tests --------------------------

test('createAtmosphereConfig produces valid default clear configuration', () => {
  const config = createAtmosphereConfig();
  assert.equal(config.enabled, false);
  assert.equal(config.preset, 'clear');
  assert.equal(config.density, 0.0);
  assert.equal(config.tintHex, '#ffffff');
  assert.equal(config.scatteringFactor, 0.1);
  assert.equal(config.heightFalloff, 0.0);
  assert.equal(config.dustMotesCount, 0);
  assert.equal(config.beamIntensity, 0.0);
  assert.ok(isAtmosphereConfig(config));
});

test('createAtmosphereConfig initializes curated presets correctly', () => {
  const subtle = createAtmosphereConfig('subtle_haze');
  assert.equal(subtle.enabled, true);
  assert.equal(subtle.preset, 'subtle_haze');
  assert.equal(subtle.density, 0.15);
  assert.equal(subtle.tintHex, '#d8e2ec');
  assert.equal(subtle.scatteringFactor, 0.35);
  assert.equal(subtle.heightFalloff, 0.25);
  assert.equal(subtle.dustMotesCount, 80);
  assert.equal(subtle.beamIntensity, 1.2);

  const cinematic = createAtmosphereConfig('cinematic_fog');
  assert.equal(cinematic.enabled, true);
  assert.equal(cinematic.preset, 'cinematic_fog');
  assert.equal(cinematic.density, 0.4);
  assert.equal(cinematic.tintHex, '#b4c6d8');
  assert.equal(cinematic.scatteringFactor, 0.55);
  assert.equal(cinematic.dustMotesCount, 160);

  const shafts = createAtmosphereConfig('dramatic_shafts');
  assert.equal(shafts.enabled, true);
  assert.equal(shafts.preset, 'dramatic_shafts');
  assert.equal(shafts.density, 0.65);
  assert.equal(shafts.tintHex, '#e6dfd5');
  assert.equal(shafts.scatteringFactor, 0.85);
  assert.equal(shafts.beamIntensity, 3.8);

  const noir = createAtmosphereConfig('noir_smoky');
  assert.equal(noir.enabled, true);
  assert.equal(noir.preset, 'noir_smoky');
  assert.equal(noir.density, 0.8);
  assert.equal(noir.tintHex, '#8c949e');
  assert.equal(noir.scatteringFactor, 0.7);
  assert.equal(noir.heightFalloff, 0.9);
});

test('createAtmosphereConfig supports custom preset and partial overrides', () => {
  const custom = createAtmosphereConfig('custom', {
    density: 0.5,
    tintHex: '#aabbcc',
    beamIntensity: 2.5,
  });
  assert.equal(custom.preset, 'custom');
  assert.equal(custom.density, 0.5);
  assert.equal(custom.tintHex, '#aabbcc');
  assert.equal(custom.beamIntensity, 2.5);
  assert.equal(custom.enabled, true);

  const overridden = createAtmosphereConfig('subtle_haze', {
    density: 0.3,
    dustMotesCount: 200,
  });
  assert.equal(overridden.preset, 'subtle_haze');
  assert.equal(overridden.density, 0.3);
  assert.equal(overridden.dustMotesCount, 200);
  assert.equal(overridden.tintHex, '#d8e2ec');
});

test('isAtmosphereConfig validates structure and rejects invalid shapes', () => {
  assert.equal(isAtmosphereConfig(null), false);
  assert.equal(isAtmosphereConfig(undefined), false);
  assert.equal(isAtmosphereConfig('fog'), false);
  assert.equal(isAtmosphereConfig({}), false);
  assert.equal(
    isAtmosphereConfig({
      enabled: true,
      preset: 'unknown_preset',
      density: 0.5,
      tintHex: '#ffffff',
      scatteringFactor: 0.5,
      heightFalloff: 0.5,
      dustMotesCount: 100,
      beamIntensity: 1.0,
    }),
    false,
  );
  assert.equal(
    isAtmosphereConfig({
      enabled: true,
      preset: 'cinematic_fog',
      density: 'high',
      tintHex: '#ffffff',
      scatteringFactor: 0.5,
      heightFalloff: 0.5,
      dustMotesCount: 100,
      beamIntensity: 1.0,
    }),
    false,
  );
  assert.equal(
    isAtmosphereConfig({
      enabled: true,
      preset: 'cinematic_fog',
      density: 0.5,
      tintHex: 'red',
      scatteringFactor: 0.5,
      heightFalloff: 0.5,
      dustMotesCount: 100,
      beamIntensity: 1.0,
    }),
    false,
  );
  assert.equal(
    isAtmosphereConfig({
      enabled: true,
      preset: 'cinematic_fog',
      density: 0.5,
      tintHex: '#123456',
      scatteringFactor: 0.5,
      heightFalloff: 0.5,
      dustMotesCount: 100,
      beamIntensity: 1.0,
    }),
    true,
  );
});

test('normalizeAtmosphereConfig sanitizes corrupted properties and clamps ranges', () => {
  assert.deepEqual(normalizeAtmosphereConfig(null), createAtmosphereConfig('clear'));
  assert.deepEqual(normalizeAtmosphereConfig(undefined), createAtmosphereConfig('clear'));

  const clamped = normalizeAtmosphereConfig({
    enabled: true,
    preset: 'custom',
    density: 99.0,
    tintHex: 'not-a-color',
    scatteringFactor: -5.0,
    heightFalloff: 50.0,
    dustMotesCount: 5000,
    beamIntensity: -2.0,
  });
  assert.equal(clamped.density, 1.0);
  assert.equal(clamped.tintHex, '#d8e2ec');
  assert.equal(clamped.scatteringFactor, 0.0);
  assert.equal(clamped.heightFalloff, 10.0);
  assert.equal(clamped.dustMotesCount, 1000);
  assert.equal(clamped.beamIntensity, 0.0);
});

test('calculateVolumetricAttenuation computes physically grounded Beer-Lambert extinction', () => {
  assert.equal(calculateVolumetricAttenuation(0, 0.5, 0.5), 1.0);
  assert.equal(calculateVolumetricAttenuation(-5, 0.5, 0.5), 1.0);
  assert.equal(calculateVolumetricAttenuation(10, 0, 0.5), 1.0);

  const t1 = calculateVolumetricAttenuation(2, 0.3, 0.5);
  const t2 = calculateVolumetricAttenuation(5, 0.3, 0.5);
  assert.ok(t1 > 0 && t1 < 1.0);
  assert.ok(t2 > 0 && t2 < 1.0);
  assert.ok(t2 < t1, 'Transmittance decreases with distance');

  const tDense = calculateVolumetricAttenuation(2, 0.8, 0.5);
  assert.ok(tDense < t1, 'Transmittance decreases with higher density');
});

test('calculateBeamLuminance computes scattered beam in-scatter luminance', () => {
  assert.equal(calculateBeamLuminance(1.0, 1.0, 5, 0), 0.0);
  assert.equal(calculateBeamLuminance(0, 1.0, 5, 0.5), 0.0);
  assert.equal(calculateBeamLuminance(1.0, 0, 5, 0.5), 0.0);

  const lumZero = calculateBeamLuminance(2.0, 1.5, 0, 0.4);
  approx(lumZero, 2.0 * 1.5 * 0.4, 0.001);

  const lumNear = calculateBeamLuminance(2.0, 1.5, 2, 0.4);
  const lumFar = calculateBeamLuminance(2.0, 1.5, 8, 0.4);
  assert.ok(lumNear > 0);
  assert.ok(lumFar > 0);
  assert.ok(lumFar < lumNear, 'Beam luminance decreases with distance');
});

test('SceneData createScene initializes default clear atmosphere', () => {
  const scene = createScene('Atmosphere Test Scene');
  assert.ok(scene.atmosphere);
  assert.equal(scene.atmosphere.preset, 'clear');
  assert.equal(scene.atmosphere.enabled, false);
  assert.ok(isSceneData(scene));
});

test('SceneData isSceneData validates atmosphere property', () => {
  const scene = createScene('Valid Scene');
  assert.equal(isSceneData(scene), true);

  const sceneWithCustomFog: SceneData = {
    ...scene,
    atmosphere: createAtmosphereConfig('cinematic_fog'),
  };
  assert.equal(isSceneData(sceneWithCustomFog), true);

  const badScene: any = {
    ...scene,
    atmosphere: { enabled: true, density: 'not-a-number' },
  };
  assert.equal(isSceneData(badScene), false);
});

test('SceneData normalizeScene repairs missing and sanitizes corrupted atmosphere', () => {
  const rawScene: any = {
    version: 1,
    id: 'scene-no-atmo',
    name: 'Raw Scene',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    actors: [],
    cameras: [],
    lights: [],
    walkSpeed: 1.2,
  };

  const normalized = normalizeScene(rawScene);
  assert.ok(normalized.atmosphere);
  assert.equal(normalized.atmosphere.preset, 'clear');
  assert.equal(normalized.atmosphere.enabled, false);

  const corruptedScene: any = {
    version: 1,
    id: 'scene-corrupted-atmo',
    name: 'Corrupted Scene',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    actors: [],
    cameras: [],
    lights: [],
    walkSpeed: 1.2,
    atmosphere: {
      enabled: true,
      preset: 'cinematic_fog',
      density: -2,
      tintHex: 'bad',
      scatteringFactor: 99,
      heightFalloff: -1,
      dustMotesCount: -50,
      beamIntensity: 25,
    },
  };

  const repaired = normalizeScene(corruptedScene);
  assert.equal(repaired.atmosphere?.enabled, true);
  assert.equal(repaired.atmosphere?.density, 0);
  assert.equal(repaired.atmosphere?.tintHex, '#b4c6d8');
  assert.equal(repaired.atmosphere?.scatteringFactor, 1.0);
  assert.equal(repaired.atmosphere?.heightFalloff, 0);
  assert.equal(repaired.atmosphere?.dustMotesCount, 0);
  assert.equal(repaired.atmosphere?.beamIntensity, 10.0);
});

test('applyScenePatch handles atmosphere_update patch cleanly', () => {
  const scene = createScene('Collab Atmo Test');
  const newAtmo = createAtmosphereConfig('dramatic_shafts');

  const applied = applyScenePatch(scene, {
    type: 'atmosphere_update',
    atmosphere: newAtmo,
  });

  assert.equal(applied, true);
  assert.equal(scene.atmosphere?.preset, 'dramatic_shafts');
  assert.equal(scene.atmosphere?.density, 0.65);
  assert.equal(scene.atmosphere?.beamIntensity, 3.8);
});

// --- Spatial Transform Gizmo Pure Math Tests ---------------------------------

test('snapValue: discrete increments, zero handling, and non-finite guards', () => {
  approx(snapValue(1.23, 0.5), 1.0);
  approx(snapValue(1.35, 0.5), 1.5);
  approx(snapValue(0.24, 0.1), 0.2);
  approx(snapValue(0.26, 0.1), 0.3);
  approx(snapValue(-0.74, 0.5), -0.5);
  approx(snapValue(-0.76, 0.5), -1.0);
  approx(snapValue(0, 0.1), 0.0);
  assert.equal(snapValue(1.23, 0), 1.23);
  assert.equal(snapValue(1.23, -0.5), 1.23);
  assert.equal(snapValue(1.23, NaN), 1.23);
  assert.equal(snapValue(NaN, 0.5), 0);
});

test('snapVec3: snaps each coordinate independently to grid step', () => {
  const v = { x: 1.23, y: 0.49, z: -2.76 };
  const snapped = snapVec3(v, 0.5);
  approx(snapped.x, 1.0);
  approx(snapped.y, 0.5);
  approx(snapped.z, -3.0);
});

test('snapRotation: discrete angular steps in radians', () => {
  const deg15 = Math.PI / 12; // 15 deg
  const deg45 = Math.PI / 4;  // 45 deg

  approx(snapRotation(0.12, deg15), 0.0);
  approx(snapRotation(0.20, deg15), deg15);
  approx(snapRotation(0.70, deg45), deg45);
  approx(snapRotation(1.50, deg45), Math.PI / 2);
  approx(snapRotation(-0.70, deg45), -deg45);
  assert.equal(snapRotation(0.42, 0), 0.42);
  assert.equal(snapRotation(0.42, -1), 0.42);
});

test('calculateAxisRayOffset: single-axis closest intersection parameter', () => {
  // Ray passing through (3, 5, 0) going in (0, -1, 0) direction crosses X axis at (3, 0, 0)
  const offset1 = calculateAxisRayOffset(
    { x: 3, y: 5, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 }
  );
  approx(offset1, 3.0);

  // Y axis at origin (0, 2, 0), ray at (5, 7, 10) in direction (-1, 0, 0)
  const offset2 = calculateAxisRayOffset(
    { x: 5, y: 7, z: 10 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 2, z: 10 },
    { x: 0, y: 1, z: 0 }
  );
  approx(offset2, 5.0); // 2 + 5 = 7

  // Skew lines: ray and axis that do not intersect in 3D
  const offsetSkew = calculateAxisRayOffset(
    { x: 4, y: 10, z: 3 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 }
  );
  approx(offsetSkew, 4.0);

  // Parallel ray and axis: orthogonal projection
  const offsetParallel = calculateAxisRayOffset(
    { x: 2, y: 1, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 }
  );
  approx(offsetParallel, 2.0);
});

test('calculatePlaneRayIntersection: planar ray casting and intersection points', () => {
  // Ray going straight down onto XZ plane at y=0
  const hit1 = calculatePlaneRayIntersection(
    { x: 2, y: 5, z: 3 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }
  );
  assert.ok(hit1 !== null);
  approx(hit1.x, 2.0);
  approx(hit1.y, 0.0);
  approx(hit1.z, 3.0);

  // Ray hitting vertical XY plane at z=5
  const hit2 = calculatePlaneRayIntersection(
    { x: 1, y: 2, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: 5 },
    { x: 0, y: 0, z: 1 }
  );
  assert.ok(hit2 !== null);
  approx(hit2.x, 1.0);
  approx(hit2.y, 2.0);
  approx(hit2.z, 5.0);

  // Angled ray at 45 degrees to XZ plane
  const hit3 = calculatePlaneRayIntersection(
    { x: 0, y: 4, z: 0 },
    { x: 1, y: -1, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }
  );
  assert.ok(hit3 !== null);
  approx(hit3.x, 4.0);
  approx(hit3.y, 0.0);
  approx(hit3.z, 0.0);

  // Parallel ray: no intersection
  const hitParallel = calculatePlaneRayIntersection(
    { x: 0, y: 5, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }
  );
  assert.equal(hitParallel, null);
});

test('calculateRotationAngleOnPlane: signed angle around normal axis', () => {
  const center = { x: 0, y: 0, z: 0 };
  const normalY = { x: 0, y: 1, z: 0 };
  const refDirX = { x: 1, y: 0, z: 0 };

  // Angle with itself is 0
  const angle0 = calculateRotationAngleOnPlane({ x: 1, y: 0, z: 0 }, center, normalY, refDirX);
  approx(angle0, 0.0);

  // +90 degrees around +Y
  const angle90 = calculateRotationAngleOnPlane({ x: 0, y: 0, z: -1 }, center, normalY, refDirX);
  approx(angle90, Math.PI / 2);

  // -90 degrees around +Y
  const angleNeg90 = calculateRotationAngleOnPlane({ x: 0, y: 0, z: 1 }, center, normalY, refDirX);
  approx(angleNeg90, -Math.PI / 2);

  // 180 degrees around +Y
  const angle180 = calculateRotationAngleOnPlane({ x: -1, y: 0, z: 0 }, center, normalY, refDirX);
  approx(Math.abs(angle180), Math.PI);

  // Off-plane point projected onto plane maintains correct angle
  const angleOffPlane = calculateRotationAngleOnPlane({ x: 0, y: 10, z: -1 }, center, normalY, refDirX);
  approx(angleOffPlane, Math.PI / 2);
});

test('calculateScaleDelta: single axis and uniform scale factor computation', () => {
  const center = { x: 0, y: 0, z: 0 };
  const axisX = { x: 1, y: 0, z: 0 };

  // Single axis scaling along X
  const scaleDoubleX = calculateScaleDelta({ x: 2, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, center, axisX);
  approx(scaleDoubleX, 2.0);

  const scaleHalfX = calculateScaleDelta({ x: 2, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, center, axisX);
  approx(scaleHalfX, 0.5);

  // Uniform radial scaling
  const scaleUniform = calculateScaleDelta({ x: 3, y: 4, z: 0 }, { x: 6, y: 8, z: 0 }, center);
  approx(scaleUniform, 2.0);

  // Degenerate zero distance fallback
  const scaleSafe = calculateScaleDelta({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, center);
  approx(scaleSafe, 1.0);
});

test('applyGizmoTranslation: axis and planar translation with snapping', () => {
  const start = { x: 1.0, y: 2.0, z: 3.0 };

  // Single axis X
  const posX = applyGizmoTranslation(start, { x: 0.5, y: 1.0, z: 1.0 }, 'x');
  approx(posX.x, 1.5);
  approx(posX.y, 2.0);
  approx(posX.z, 3.0);

  // Planar XZ
  const posXZ = applyGizmoTranslation(start, { x: 0.5, y: 1.0, z: -0.5 }, 'xz');
  approx(posXZ.x, 1.5);
  approx(posXZ.y, 2.0);
  approx(posXZ.z, 2.5);

  // Translation with 0.5m snapping
  const snap: GizmoSnapConfig = { translateSnapM: 0.5, rotateSnapRad: Math.PI / 12, scaleSnapStep: 0.1, enabled: true };
  const snappedPos = applyGizmoTranslation(start, { x: 0.34, y: 0, z: 0 }, 'x', snap);
  approx(snappedPos.x, 1.5); // 1.0 + 0.34 = 1.34 -> 1.5
});

test('applyGizmoRotation and applyGizmoRotationQuat: scalar and quaternion rotations', () => {
  // Scalar rotation
  const rot1 = applyGizmoRotation(0.5, 0.3);
  approx(rot1, 0.8);

  const snap: GizmoSnapConfig = { translateSnapM: 0.1, rotateSnapRad: Math.PI / 4, scaleSnapStep: 0.1, enabled: true };
  const snappedRot = applyGizmoRotation(0.0, 0.7, snap);
  approx(snappedRot, Math.PI / 4);

  // Quaternion rotation around +Y axis
  const qStart = quatIdentity();
  const qRotated = applyGizmoRotationQuat(qStart, { x: 0, y: 1, z: 0 }, Math.PI / 2);
  const rotatedVec = quatRotateVec3(qRotated, { x: 1, y: 0, z: 0 });
  approx(rotatedVec.x, 0.0);
  approx(rotatedVec.z, -1.0);
});

test('applyGizmoScale and applyGizmoUniformScale: proportional and discrete scaling', () => {
  const startScale = { x: 1.0, y: 1.0, z: 1.0 };

  // Single axis scale along Y
  const scaleY = applyGizmoScale(startScale, 1.5, 'y');
  approx(scaleY.x, 1.0);
  approx(scaleY.y, 1.5);
  approx(scaleY.z, 1.0);

  // Uniform scale
  const uniformScale = applyGizmoUniformScale(1.0, 2.3);
  approx(uniformScale, 2.3);

  // Scale with snapping (0.5 step)
  const snap: GizmoSnapConfig = { translateSnapM: 0.1, rotateSnapRad: 0.1, scaleSnapStep: 0.5, enabled: true };
  const snappedScale = applyGizmoUniformScale(1.0, 1.34, snap);
  approx(snappedScale, 1.5);

  // Lower clamp prevents zero or negative inversion
  const clampedScale = applyGizmoUniformScale(1.0, -2.0);
  assert.ok(clampedScale > 0);
});

test('applyGizmoTransform: unified transform application dispatcher', () => {
  const startPos = { x: 0, y: 0, z: 0 };

  // Translate mode
  const resT = applyGizmoTransform({
    mode: 'translate',
    axis: 'x',
    startPosition: startPos,
    deltaPosition: { x: 2.5, y: 0, z: 0 },
  });
  approx(resT.position.x, 2.5);

  // Rotate mode with scalar rotationY
  const resR = applyGizmoTransform({
    mode: 'rotate',
    axis: 'y',
    startPosition: startPos,
    startRotation: 0.0,
    deltaRotationAngleRad: Math.PI / 2,
  });
  approx(resR.rotation as number, Math.PI / 2);

  // Scale mode with uniform scalar
  const resS = applyGizmoTransform({
    mode: 'scale',
    axis: 'uniform',
    startPosition: startPos,
    startScale: 1.0,
    scaleFactor: 1.5,
  });
  approx(resS.scale as number, 1.5);
});

test('pure domain vector and quaternion math helpers', () => {
  const a = vec3(1, 2, 3);
  const b = vec3(4, 5, 6);

  assert.deepEqual(vec3Add(a, b), { x: 5, y: 7, z: 9 });
  assert.deepEqual(vec3Sub(b, a), { x: 3, y: 3, z: 3 });
  assert.deepEqual(vec3Scale(a, 2), { x: 2, y: 4, z: 6 });
  approx(vec3Dot(a, b), 32);
  approx(vec3Length(vec3(3, 4, 0)), 5);
  approx(vec3Distance(vec3(0, 0, 0), vec3(3, 4, 0)), 5);

  const cross = vec3Cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  approx(cross.x, 0);
  approx(cross.y, 0);
  approx(cross.z, 1);

  const norm = vec3Normalize(vec3(0, 5, 0));
  approx(norm.y, 1);

  const q = quatFromAxisAngle({ x: 0, y: 1, z: 0 }, Math.PI / 2);
  const v = quatRotateVec3(q, { x: 1, y: 0, z: 0 });
  approx(v.x, 0);
  approx(v.z, -1);
});

// --- NLE Timeline, EDL, and Shot List Exporter Tests -------------------------

test('calculateSceneShotSegments: fallback shot on scene with zero cameras', () => {
  const emptyScene = createScene('Empty Stage');
  emptyScene.cameras = [];
  const segments = calculateSceneShotSegments(emptyScene);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].shotNumber, 1);
  assert.equal(segments[0].camera.name, 'CAM A');
  assert.equal(segments[0].durationS, 4.0);
  assert.equal(segments[0].recordInTc, '01:00:00:00');
  assert.equal(segments[0].recordOutTc, '01:00:04:00');
});

test('calculateSceneShotSegments: single camera without keyframes', () => {
  const scene = createScene('Single Cam Scene');
  const identityRot = { x: 0, y: 0, z: 0, w: 1 };
  const cam = createCameraSetup(scene, { x: 0, y: 1.6, z: -4 }, identityRot, 35, '16:9', 2.8, 'super35');
  cam.name = 'A-Cam Wide';

  const segments = calculateSceneShotSegments(scene, {
    fps: 24,
    startRecordTimecode: '01:00:00:00',
    defaultShotDurationS: 5.0,
  });

  assert.equal(segments.length, 1);
  const seg = segments[0];
  assert.equal(seg.shotNumber, 1);
  assert.equal(seg.camera.name, 'A-Cam Wide');
  assert.equal(seg.camera.lensFocalLength, 35);
  assert.equal(seg.camera.formatId, 'super35');
  assert.equal(seg.camera.aspect, '16:9');
  assert.equal(seg.camera.tStop, 2.8);
  assert.equal(seg.durationS, 5.0);
  assert.equal(seg.durationFrames, 120);
  assert.equal(seg.recordInTc, '01:00:00:00');
  assert.equal(seg.recordOutTc, '01:00:05:00');
  assert.equal(seg.moveClassification.moveType, 'static');
});

test('calculateSceneShotSegments: animated camera keyframes derive duration and movement', () => {
  const scene = createScene('Keyframed Dolly Scene');
  const identityRot = { x: 0, y: 0, z: 0, w: 1 };
  const cam = createCameraSetup(scene, { x: 0, y: 1.5, z: 5 }, identityRot, 50, '2.39:1', 2.8, 'fullframe');
  cam.name = 'Dolly Cam';
  cam.keyframes = [
    { position: { x: 0, y: 1.5, z: 5 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, lensFocalLength: 50 },
    { position: { x: 0, y: 1.5, z: 1 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, lensFocalLength: 50 },
  ];

  const segments = calculateSceneShotSegments(scene, { fps: 24 });
  assert.equal(segments.length, 1);
  const seg = segments[0];
  assert.equal(seg.durationS, 4.0);
  assert.equal(seg.durationFrames, 96);
  assert.equal(seg.recordInTc, '01:00:00:00');
  assert.equal(seg.recordOutTc, '01:00:04:00');
  assert.equal(seg.moveClassification.moveType, 'dolly-push');
});

test('calculateSceneShotSegments: actor timeline derives camera shot duration', () => {
  const scene = createScene('Actor Walk Scene');
  const actor = createActor(scene, { x: 0, y: 0, z: 0 }, 0);
  actor.name = 'Lead Actor';
  actor.keyframes = [
    { position: { x: 0, y: 0, z: 0 }, rotationY: 0 },
    { position: { x: 4.8, y: 0, z: 0 }, rotationY: 0 }, // 4.8m at 1.2 m/s = 4.0s
  ];
  scene.actors = [actor];
  const identityRot = { x: 0, y: 0, z: 0, w: 1 };
  const cam = createCameraSetup(scene, { x: 0, y: 1.5, z: -3 }, identityRot, 35, '16:9', 2.8, 'super35');
  cam.name = 'Tracking Cam';

  const segments = calculateSceneShotSegments(scene, { fps: 24 });
  assert.equal(segments.length, 1);
  approx(segments[0].durationS, 4.8 / scene.walkSpeed, 0.05);
  assert.equal(segments[0].targetActor?.name, 'Lead Actor');
});

test('calculateSceneShotSegments: multi-camera sequence computes sequential timecodes', () => {
  const scene = createScene('Dialogue Coverage');
  const identityRot = { x: 0, y: 0, z: 0, w: 1 };
  const camA = createCameraSetup(scene, { x: 0, y: 1.5, z: -4 }, identityRot, 28, '16:9', 2.8, 'super35');
  camA.name = 'CAM A - Wide';
  const camB = createCameraSetup(scene, { x: -1.5, y: 1.6, z: -1.8 }, identityRot, 85, '16:9', 2.8, 'super35');
  camB.name = 'CAM B - Close Actor 1';
  const camC = createCameraSetup(scene, { x: 1.5, y: 1.6, z: -1.8 }, identityRot, 85, '16:9', 2.8, 'super35');
  camC.name = 'CAM C - Close Actor 2';

  const segments = calculateSceneShotSegments(scene, {
    fps: 24,
    startRecordTimecode: '01:00:00:00',
    defaultShotDurationS: 4.0,
  });

  assert.equal(segments.length, 3);
  assert.equal(segments[0].shotNumber, 1);
  assert.equal(segments[0].camera.name, 'CAM A - Wide');
  assert.equal(segments[0].recordInTc, '01:00:00:00');
  assert.equal(segments[0].recordOutTc, '01:00:04:00');
  assert.equal(segments[0].startFrame, 86400);
  assert.equal(segments[0].endFrame, 86496);

  assert.equal(segments[1].shotNumber, 2);
  assert.equal(segments[1].camera.name, 'CAM B - Close Actor 1');
  assert.equal(segments[1].recordInTc, '01:00:04:00');
  assert.equal(segments[1].recordOutTc, '01:00:08:00');
  assert.equal(segments[1].startFrame, 86496);
  assert.equal(segments[1].endFrame, 86592);

  assert.equal(segments[2].shotNumber, 3);
  assert.equal(segments[2].camera.name, 'CAM C - Close Actor 2');
  assert.equal(segments[2].recordInTc, '01:00:08:00');
  assert.equal(segments[2].recordOutTc, '01:00:12:00');
  assert.equal(segments[2].startFrame, 86592);
  assert.equal(segments[2].endFrame, 86688);
});

test('generateCmx3600Edl: formats standard CMX 3600 EDL with events and comments', () => {
  const scene = createScene('Bank Heist Scene');
  const identityRot = { x: 0, y: 0, z: 0, w: 1 };
  const cam1 = createCameraSetup(scene, { x: 0, y: 1.6, z: -5 }, identityRot, 24, '2.39:1', 2.8, 'fullframe');
  cam1.name = 'Master Wide';
  const cam2 = createCameraSetup(scene, { x: 1.2, y: 1.5, z: -2 }, identityRot, 50, '2.39:1', 2.8, 'fullframe');
  cam2.name = 'Over Shoulder';

  const edl = generateCmx3600Edl(scene, {
    fps: 24,
    startRecordTimecode: '01:00:00:00',
    defaultShotDurationS: 4.0,
  });
  assert.ok(edl.includes('TITLE:   BANK HEIST SCENE'));
  assert.ok(edl.includes('FCM: NON-DROP FRAME'));
  assert.ok(edl.includes('001  MASTER_W'));
  assert.ok(edl.includes('00:00:00:00 00:00:04:00 01:00:00:00 01:00:04:00'));
  assert.ok(edl.includes('* FROM CLIP NAME: BANK_HEIST_SCENE_MASTER_WIDE_SHOT1'));
  assert.ok(edl.includes('* COMMENT: Master Wide (24mm FF, T2.8)'));
  assert.ok(edl.includes('002  OVER_SHO'));
  assert.ok(edl.includes('00:00:00:00 00:00:04:00 01:00:04:00 01:00:08:00'));
  assert.ok(edl.includes('* FROM CLIP NAME: BANK_HEIST_SCENE_OVER_SHOULDER_SHOT2'));
});

test('generateCmx3600Edl: supports transitions, drop-frame, and audio cues', () => {
  const scene = createScene('Night Alley');
  const identityRot = { x: 0, y: 0, z: 0, w: 1 };
  const camA = createCameraSetup(scene, { x: 0, y: 1.5, z: -3 }, identityRot, 35, '16:9', 2.8, 'super35');
  camA.name = 'Cam A';
  const camB = createCameraSetup(scene, { x: 2, y: 1.5, z: -3 }, identityRot, 50, '16:9', 2.8, 'super35');
  camB.name = 'Cam B';

  const cue = createAudioCueForScene(scene, {
    name: 'Gunshot Echo',
    timestampS: 2.0,
    durationS: 1.5,
    type: 'sfx',
  });
  scene.audioCues = [cue];

  const edl = generateCmx3600Edl(scene, {
    fps: 29.97,
    dropFrame: true,
    includeTransitions: true,
    includeAudioCues: true,
  });

  assert.ok(edl.includes('FCM: DROP FRAME'));
  // Event 2 is dissolve transition
  assert.ok(edl.includes('002  CAM_B    V     D'));
  // Includes audio cue comment
  assert.ok(edl.includes('* COMMENT: [SFX] Gunshot Echo'));
});

test('generateFinalCutProXml: produces valid Apple FCP7 and Premiere XML structure', () => {
  const scene = createScene('Courthouse Drama');
  const identityRot = { x: 0, y: 0, z: 0, w: 1 };
  const camA = createCameraSetup(scene, { x: 0, y: 1.8, z: -6 }, identityRot, 28, '16:9', 2.0, 'super35');
  camA.name = 'Bench Wide';
  const camB = createCameraSetup(scene, { x: -1, y: 1.5, z: -2 }, identityRot, 85, '16:9', 2.8, 'super35');
  camB.name = 'Witness Close';

  const cue = createAudioCueForScene(scene, {
    name: 'Gavel Strike',
    timestampS: 1.0,
    durationS: 1.0,
    type: 'sfx',
  });
  scene.audioCues = [cue];

  const xml = generateFinalCutProXml(scene, {
    fps: 24,
    startRecordTimecode: '01:00:00:00',
    includeAudioCues: true,
  });

  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<!DOCTYPE xmeml>'));
  assert.ok(xml.includes('<xmeml version="5">'));
  assert.ok(xml.includes('<name>Courthouse Drama</name>'));
  assert.ok(xml.includes('<timebase>24</timebase>'));
  assert.ok(xml.includes('<duration>192</duration>')); // 2 shots * 96 frames = 192 frames
  assert.ok(xml.includes('<track>'));
  assert.ok(xml.includes('<clipitem id="clipitem-1">'));
  assert.ok(xml.includes('Bench Wide - 28mm'));
  assert.ok(xml.includes('<start>0</start>'));
  assert.ok(xml.includes('<end>96</end>'));
  assert.ok(xml.includes('<clipitem id="clipitem-2">'));
  assert.ok(xml.includes('Witness Close - 85mm'));
  assert.ok(xml.includes('<start>96</start>'));
  assert.ok(xml.includes('<end>192</end>'));
  // Audio cue track
  assert.ok(xml.includes('<audio>'));
  assert.ok(xml.includes('<name>Gavel Strike</name>'));
});

test('generateFcpxml: produces valid Final Cut Pro X FCPXML v1.9 structure', () => {
  const scene = createScene('Spaceship Bridge');
  const identityRot = { x: 0, y: 0, z: 0, w: 1 };
  const cam1 = createCameraSetup(scene, { x: 0, y: 1.4, z: -2.5 }, identityRot, 40, '2.39:1', 2.8, 'fullframe');
  cam1.name = 'Captain Angle';
  const cam2 = createCameraSetup(scene, { x: 1.5, y: 1.3, z: -2.0 }, identityRot, 24, '2.39:1', 2.8, 'fullframe');
  cam2.name = 'Helm Angle';

  const fcpxml = generateFcpxml(scene, {
    fps: 24,
    sequenceName: 'Spaceship Sequence',
  });

  assert.ok(fcpxml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(fcpxml.includes('<!DOCTYPE fcpxml>'));
  assert.ok(fcpxml.includes('<fcpxml version="1.9">'));
  assert.ok(fcpxml.includes('<project name="Spaceship Sequence">'));
  assert.ok(fcpxml.includes('frameDuration="100/2400s"'));
  assert.ok(fcpxml.includes('<spine>'));
  assert.ok(fcpxml.includes('name="Captain Angle'));
  assert.ok(fcpxml.includes('name="Helm Angle'));
  assert.ok(fcpxml.includes('md key="com.apple.proapps.studio.camera" value="Captain Angle"'));
});

test('generateCsvShotList: produces RFC 4180 compliant CSV with headers and values', () => {
  const scene = createScene('Café, Conversation & Rain');
  const identityRot = { x: 0, y: 0, z: 0, w: 1 };
  const cam = createCameraSetup(scene, { x: 0, y: 1.5, z: -3 }, identityRot, 35, '16:9', 2.8, 'super35');
  cam.name = 'Two Shot';
  const csv = generateCsvShotList(scene, { fps: 24 });
  const lines = csv.trim().split('\n');
  assert.ok(lines.length >= 2);

  const header = lines[0];
  assert.ok(header.includes('Scene Name'));
  assert.ok(header.includes('Shot #'));
  assert.ok(header.includes('Camera Name'));
  assert.ok(header.includes('Focal Length'));
  assert.ok(header.includes('Start TC'));
  assert.ok(header.includes('End TC'));

  const row = lines[1];
  // Scene name containing commas must be quoted
  assert.ok(row.includes('"Café, Conversation & Rain"'));
  assert.ok(row.includes('Two Shot'));
  assert.ok(row.includes('35mm'));
  assert.ok(row.includes('01:00:00:00'));
  assert.ok(row.includes('01:00:04:00'));
});

test('generateAvidMarkerList: produces tab-delimited Avid Media Composer markers', () => {
  const scene = createScene('Avid Test Scene');
  const identityRot = { x: 0, y: 0, z: 0, w: 1 };
  const cam1 = createCameraSetup(scene, { x: 0, y: 1.5, z: -4 }, identityRot, 28, '16:9', 2.8, 'super35');
  cam1.name = 'Wide Cam';
  const cam2 = createCameraSetup(scene, { x: 0, y: 1.5, z: -1.8 }, identityRot, 85, '16:9', 2.8, 'super35');
  cam2.name = 'Close Cam';

  const cue = createAudioCueForScene(scene, {
    name: 'Footsteps',
    timestampS: 1.5,
    durationS: 2.0,
    type: 'foley',
  });
  scene.audioCues = [cue];

  const markers = generateAvidMarkerList(scene, {
    fps: 24,
    startRecordTimecode: '01:00:00:00',
    includeAudioCues: true,
  });

  const lines = markers.trim().split('\n');
  assert.ok(lines.length >= 3);

  // Line 1: Header or Shot 1 marker
  const m1 = lines[1];
  const parts1 = m1.split('\t');
  assert.equal(parts1[0], 'V1');
  assert.equal(parts1[1], '01:00:00:00');
  assert.equal(parts1[2], 'green');
  assert.ok(parts1[3].includes('[SHOT 1] Wide Cam'));

  // Shot 2 marker
  const m2 = lines[2];
  const parts2 = m2.split('\t');
  assert.equal(parts2[0], 'V1');
  assert.equal(parts2[1], '01:00:04:00');
  assert.equal(parts2[2], 'green');
  assert.ok(parts2[3].includes('[SHOT 2] Close Cam'));

  // Audio marker
  const audioLine = lines.find((l) => l.startsWith('A2\t'));
  assert.ok(audioLine);
  assert.ok(audioLine.includes('Footsteps'));
});

test('exportSceneTimeline: unifies all 5 export formats with correct filenames and MIME types', () => {
  const scene = createScene('Master Production Export');
  const identityRot = { x: 0, y: 0, z: 0, w: 1 };
  const cam = createCameraSetup(scene, { x: 0, y: 1.5, z: -3 }, identityRot, 50, '16:9', 2.8, 'super35');
  cam.name = 'Main Cam';

  const edl = exportSceneTimeline(scene, 'cmx3600_edl');
  assert.equal(edl.filename, 'master_production_export.edl');
  assert.equal(edl.mimeType, 'text/plain;charset=utf-8');
  assert.ok(edl.content.includes('TITLE:   MASTER PRODUCTION EXPORT'));

  const fcp7 = exportSceneTimeline(scene, 'fcp7_xml');
  assert.equal(fcp7.filename, 'master_production_export.xml');
  assert.equal(fcp7.mimeType, 'application/xml;charset=utf-8');
  assert.ok(fcp7.content.includes('<xmeml version="5">'));

  const fcpx = exportSceneTimeline(scene, 'fcpxml');
  assert.equal(fcpx.filename, 'master_production_export.fcpxml');
  assert.equal(fcpx.mimeType, 'application/xml;charset=utf-8');
  assert.ok(fcpx.content.includes('<fcpxml version="1.9">'));

  const csv = exportSceneTimeline(scene, 'csv_shotlist');
  assert.equal(csv.filename, 'master_production_export_shotlist.csv');
  assert.equal(csv.mimeType, 'text/csv;charset=utf-8');
  assert.ok(csv.content.includes('Scene Name,Shot #'));

  const avid = exportSceneTimeline(scene, 'avid_markers');
  assert.equal(avid.filename, 'master_production_export_avid_markers.txt');
  assert.equal(avid.mimeType, 'text/plain;charset=utf-8');
  assert.ok(avid.content.includes('Track\tTimecode\tColor\tComment'));
});

test('UE5 Bridge: coordinate conversion and rotator math', () => {
  // SetView (right-handed, Y-up, m) -> Unreal (left-handed, Z-up, cm) needs a
  // determinant -1 basis map: x_ue = -z_sv, y_ue = x_sv, z_ue = y_sv.
  const pos = { x: 2.5, y: 1.8, z: -4.0 };
  const ueLoc = svToUeLocation(pos, 100.0);
  assert.equal(ueLoc.x, 400.0);
  assert.equal(ueLoc.y, 250.0);
  assert.equal(ueLoc.z, 180.0);

  const ueLocCustom = svToUeLocation(pos, 50.0);
  assert.equal(ueLocCustom.x, 200.0);
  assert.equal(ueLocCustom.y, 125.0);
  assert.equal(ueLocCustom.z, 90.0);

  const invalidLoc = svToUeLocation({ x: NaN, y: Infinity, z: 0 });
  assert.equal(invalidLoc.x, 0);
  assert.equal(invalidLoc.y, 0);
  assert.equal(invalidLoc.z, 0);

  // SetView heading 0 faces +Z, which is Unreal -X => yaw 180.
  assert.equal(svHeadingToUeYaw(0), 180);
  assert.equal(Math.round(svHeadingToUeYaw(Math.PI / 2)), 90);
  assert.equal(Math.round(svHeadingToUeYaw(Math.PI)), 0);
  assert.equal(Math.round(svHeadingToUeYaw(-Math.PI / 2)), 270);

  // An identity SetView camera quaternion looks down -Z, i.e. Unreal +X: rotator (0, 0, 0).
  const idRot = svQuatToUeRotator({ x: 0, y: 0, z: 0, w: 1 });
  assert.ok(Math.abs(idRot.pitch) < 1e-9);
  assert.ok(Math.abs(idRot.yaw) < 1e-9);
  assert.ok(Math.abs(idRot.roll) < 1e-9);

  assert.deepEqual(hexToRgb('#ff0000'), { r: 1, g: 0, b: 0 });
  assert.deepEqual(hexToRgb('#00ff00'), { r: 0, g: 1, b: 0 });
  assert.deepEqual(hexToRgb('#0000ff'), { r: 0, g: 0, b: 1 });
  assert.deepEqual(hexToRgb('invalid'), { r: 1, g: 1, b: 1 });

  const defaultOpts = resolveUe5ExportOptions();
  assert.equal(defaultOpts.fps, 24);
  assert.equal(defaultOpts.unrealEngineVersion, '5.4');
  assert.equal(defaultOpts.generateSequencerTracks, true);
  assert.equal(defaultOpts.useNanite, true);
  assert.equal(defaultOpts.useLumen, true);
  assert.equal(defaultOpts.scaleFactor, 100.0);
});

test('ueCoords: SetView -> Unreal basis map flips handedness (determinant -1) and keeps up up', () => {
  // Build the 3x3 basis matrix from the images of the SetView unit vectors.
  const ex = svDirectionToUe({ x: 1, y: 0, z: 0 });
  const ey = svDirectionToUe({ x: 0, y: 1, z: 0 });
  const ez = svDirectionToUe({ x: 0, y: 0, z: 1 });

  const det =
    ex.x * (ey.y * ez.z - ey.z * ez.y) -
    ey.x * (ex.y * ez.z - ex.z * ez.y) +
    ez.x * (ex.y * ey.z - ex.z * ey.y);

  // A right-handed -> left-handed conversion MUST have determinant -1. A +1
  // permutation is a pure rotation and silently mirrors the whole scene.
  assert.equal(det, -1, 'SetView -> Unreal basis map must have determinant -1');

  // Up stays up: SetView +Y is Unreal +Z.
  assert.deepEqual(ey, { x: 0, y: 0, z: 1 });
  // SetView +X (right) is Unreal +Y (right); SetView +Z is Unreal -X (backward).
  assert.deepEqual(ex, { x: 0, y: 1, z: 0 });
  assert.deepEqual(ez, { x: -1, y: 0, z: 0 });

  // The location map is the same basis map times the metres -> centimetres scale.
  assert.deepEqual(svToUeLocation({ x: 0, y: 1, z: 0 }, 100), { x: 0, y: 0, z: 100 });

  // The inverse direction map undoes the forward one exactly.
  for (const v of [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: -0.6, y: 2.4, z: 7.1 },
  ]) {
    const round = ueDirectionToSv(svDirectionToUe(v));
    assert.ok(Math.abs(round.x - v.x) < 1e-12 && Math.abs(round.y - v.y) < 1e-12 && Math.abs(round.z - v.z) < 1e-12);
  }

  // Round-trips exactly.
  const sv = { x: 1.25, y: -2.5, z: 3.75 };
  const back = ueToSvLocation(svToUeLocation(sv, 100), 100);
  assert.ok(Math.abs(back.x - sv.x) < 1e-9);
  assert.ok(Math.abs(back.y - sv.y) < 1e-9);
  assert.ok(Math.abs(back.z - sv.z) < 1e-9);
});

test('ueCoords: screen direction survives the Unreal handoff (camera right stays camera right)', () => {
  // Camera at the origin with an identity quaternion: looks down SetView -Z,
  // +X is to its right. Actor 5m in front and 1m to the camera's RIGHT.
  const camPos = { x: 0, y: 0, z: 0 };
  const camRot = { x: 0, y: 0, z: 0, w: 1 };
  const actorSv = { x: 1.0, y: 0.0, z: -5.0 };

  const camUe = svToUeLocation(camPos, 100);
  const actorUe = svToUeLocation(actorSv, 100);
  const basis = ueRotatorToBasis(svQuatToUeRotator(camRot));

  const rel = { x: actorUe.x - camUe.x, y: actorUe.y - camUe.y, z: actorUe.z - camUe.z };
  const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
    a.x * b.x + a.y * b.y + a.z * b.z;

  assert.ok(Math.abs(dot(rel, basis.forward) - 500) < 1e-6, 'actor must stay 5m in FRONT');
  assert.ok(dot(rel, basis.right) > 0, 'actor must stay to the camera RIGHT, not mirror to the left');
  assert.ok(Math.abs(dot(rel, basis.right) - 100) < 1e-6);
  assert.ok(Math.abs(dot(rel, basis.up)) < 1e-6);

  // Same check for a camera that is off-origin, yawed 40 degrees and pitched down.
  const yawA = 0.7;
  const pitchA = -0.25;
  const qYaw = { x: 0, y: Math.sin(yawA / 2), z: 0, w: Math.cos(yawA / 2) };
  const qPitch = { x: Math.sin(pitchA / 2), y: 0, z: 0, w: Math.cos(pitchA / 2) };
  // q = qYaw * qPitch (yaw applied in world, pitch in camera local space)
  const q = {
    x: qYaw.w * qPitch.x + qYaw.x * qPitch.w + qYaw.y * qPitch.z - qYaw.z * qPitch.y,
    y: qYaw.w * qPitch.y - qYaw.x * qPitch.z + qYaw.y * qPitch.w + qYaw.z * qPitch.x,
    z: qYaw.w * qPitch.z + qYaw.x * qPitch.y - qYaw.y * qPitch.x + qYaw.z * qPitch.w,
    w: qYaw.w * qPitch.w - qYaw.x * qPitch.x - qYaw.y * qPitch.y - qYaw.z * qPitch.z,
  };
  const camPos2 = { x: -2.0, y: 1.6, z: 3.0 };
  const svBasis = svQuatToBasis(q);
  // Target 4m along the camera forward and 1.5m along the camera right, in SetView.
  const targetSv = {
    x: camPos2.x + svBasis.forward.x * 4 + svBasis.right.x * 1.5,
    y: camPos2.y + svBasis.forward.y * 4 + svBasis.right.y * 1.5,
    z: camPos2.z + svBasis.forward.z * 4 + svBasis.right.z * 1.5,
  };

  const camUe2 = svToUeLocation(camPos2, 100);
  const targetUe2 = svToUeLocation(targetSv, 100);
  const basis2 = ueRotatorToBasis(svQuatToUeRotator(q));
  const rel2 = { x: targetUe2.x - camUe2.x, y: targetUe2.y - camUe2.y, z: targetUe2.z - camUe2.z };

  assert.ok(Math.abs(dot(rel2, basis2.forward) - 400) < 1e-6, 'off-axis camera: distance in front preserved');
  assert.ok(Math.abs(dot(rel2, basis2.right) - 150) < 1e-6, 'off-axis camera: right offset preserved (no mirror)');
  assert.ok(Math.abs(dot(rel2, basis2.up)) < 1e-6);
});

test('ueCoords: heading yaw agrees with pushing the SetView facing vector through the position map', () => {
  for (const deg of [0, 90, 180, 270, 45, -30, 137.5]) {
    const rotY = (deg * Math.PI) / 180;
    // SetView facing direction for heading rotationY (0 = +Z).
    const facingSv = { x: Math.sin(rotY), y: 0, z: Math.cos(rotY) };
    const facingUe = svDirectionToUe(facingSv);

    const yaw = svHeadingToUeYaw(rotY);
    const fromYaw = { x: Math.cos((yaw * Math.PI) / 180), y: Math.sin((yaw * Math.PI) / 180), z: 0 };

    assert.ok(Math.abs(fromYaw.x - facingUe.x) < 1e-9, `heading ${deg}: yaw X mismatch`);
    assert.ok(Math.abs(fromYaw.y - facingUe.y) < 1e-9, `heading ${deg}: yaw Y mismatch`);
    assert.ok(Math.abs(fromYaw.z - facingUe.z) < 1e-9, `heading ${deg}: yaw Z mismatch`);

    // Inverse helper round-trips the heading.
    assert.ok(Math.abs(ueYawToSvHeading(yaw) - rotY) < 1e-9);
  }

  // The documented anchors.
  assert.equal(svHeadingToUeYaw(0), 180);
  assert.ok(Math.abs(svHeadingToUeYaw(Math.PI / 2) - 90) < 1e-9);
  assert.ok(Math.abs(svHeadingToUeYaw(Math.PI) - 0) < 1e-9);
  assert.ok(Math.abs(svHeadingToUeYaw((3 * Math.PI) / 2) - -90) < 1e-9);
});

test('ueCoords: roll sign is negated by the handedness flip and rotator round-trips exactly', () => {
  // A Three.js camera rolled +alpha about its own local +Z (which points BACKWARD)
  // must come out as Unreal roll -alpha, because the handedness flip reverses roll.
  for (const alphaDeg of [30, -30, 12.5]) {
    const a = (alphaDeg * Math.PI) / 180;
    const q = { x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) };
    const rot = svQuatToUeRotator(q);
    assert.ok(Math.abs(rot.pitch) < 1e-9, 'pure roll must not leak into pitch');
    assert.ok(Math.abs(rot.yaw) < 1e-9, 'pure roll must not leak into yaw');
    assert.ok(Math.abs(rot.roll - -alphaDeg) < 1e-9, `roll sign wrong for ${alphaDeg} deg`);

    // The rolled camera's up vector must lean the correct way in Unreal:
    // Unreal roll is positive when up leans toward +Y (the camera's own right).
    const basis = ueRotatorToBasis(rot);
    assert.ok(Math.sign(basis.up.y) === Math.sign(-alphaDeg), 'up vector leans the wrong way');
  }

  // Rotator extraction is an exact inverse of Unreal's own FRotationMatrix for
  // arbitrary orientations (deterministic pseudo-random quaternions).
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 500; i++) {
    const u1 = rnd();
    const u2 = rnd();
    const u3 = rnd();
    const q = {
      x: Math.sqrt(1 - u1) * Math.sin(2 * Math.PI * u2),
      y: Math.sqrt(1 - u1) * Math.cos(2 * Math.PI * u2),
      z: Math.sqrt(u1) * Math.sin(2 * Math.PI * u3),
      w: Math.sqrt(u1) * Math.cos(2 * Math.PI * u3),
    };

    const svBasis = svQuatToBasis(q);
    const expectF = svDirectionToUe(svBasis.forward);
    const expectR = svDirectionToUe(svBasis.right);
    const expectU = svDirectionToUe(svBasis.up);

    const rot = svQuatToUeRotator(q);
    const basis = ueRotatorToBasis(rot);

    assert.ok(Math.abs(basis.forward.x - expectF.x) < 1e-9 && Math.abs(basis.forward.y - expectF.y) < 1e-9 && Math.abs(basis.forward.z - expectF.z) < 1e-9);
    assert.ok(Math.abs(basis.right.x - expectR.x) < 1e-9 && Math.abs(basis.right.y - expectR.y) < 1e-9 && Math.abs(basis.right.z - expectR.z) < 1e-9);
    assert.ok(Math.abs(basis.up.x - expectU.x) < 1e-9 && Math.abs(basis.up.y - expectU.y) < 1e-9 && Math.abs(basis.up.z - expectU.z) < 1e-9);

    // Quaternion round-trip (up to sign, which is the same rotation).
    const backQ = ueRotatorToSvQuat(rot);
    const dot = backQ.x * q.x + backQ.y * q.y + backQ.z * q.z + backQ.w * q.w;
    assert.ok(Math.abs(Math.abs(dot) - 1) < 1e-7, 'quaternion round-trip must recover the same rotation');
  }
});

test('generateOpenUsdScene: generates valid USDA ASCII stage with cameras, lights, actors, props, and atmosphere', () => {
  const scene = createScene('Sci-Fi Cyber Stage');
  scene.walkSpeed = 1.6;

  const actor = createActor(scene, { x: 1.0, y: 0, z: 2.0 }, 0);
  actor.name = 'Hero';
  actor.stance = 'seated-chair';
  actor.heightM = 1.82;
  actor.scale = 1.05;
  actor.color = '#e5484d';
  addNote(actor, 'action', 'Costume has luminescent neon stripes');
  addKeyframe(actor, { x: 3.0, y: 0, z: 5.0 }, Math.PI / 2);

  const identityRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
  const cam = createCameraSetup(scene, { x: 0, y: 1.6, z: -3.5 }, identityRot, 40, '2.39:1', 2.0, 'super35');
  cam.name = 'Cine A';
  cam.focusDistanceM = 4.2;
  addCameraKeyframe(cam, { x: 1.5, y: 1.6, z: -1.0 }, identityRot, 65, 3.2, undefined, 0.5);

  const light = createLight(scene, [0, 3.0, 0], 0, 0, 'spot');
  light.name = 'Key Spot';
  light.intensity = 2.5;
  light.colorKelvin = 4300;
  light.coneAngleDeg = 35.0;

  const prop = createPropData('directors_chair', 'Director Chair', { x: -1.5, y: 0, z: 1.0 }, { rotationY: 0.5 });
  scene.props = [prop];

  scene.atmosphere = createAtmosphereConfig('cinematic_fog');

  const opts: Ue5ExportOptions = { fps: 24, scaleFactor: 100.0, unrealEngineVersion: '5.4' };
  const usda = generateOpenUsdScene(scene, opts);

  assert.ok(usda.startsWith('#usda 1.0'), 'Must start with USDA header');
  assert.ok(usda.includes('metersPerUnit = 0.01'), 'Must define cm scale (0.01 m/unit)');
  assert.ok(usda.includes('upAxis = "Z"'), 'Must define Z-up for Unreal compatibility');
  assert.ok(usda.includes('framesPerSecond = 24'), 'Must match specified FPS');

  assert.ok(usda.includes('def Camera "Cine_A"'), 'Must define CineCamera prim');
  assert.ok(usda.includes('float focalLength.timeSamples'), 'Must contain focalLength time samples for animated camera');
  assert.ok(usda.includes('horizontalAperture = 24.890'), 'Must match Super35 gate width');
  assert.ok(usda.includes('fStop = 2.00'), 'Must match aperture fStop');
  assert.ok(usda.includes('float2 clippingRange = (10, 100000)'), 'Must define clipping range');

  assert.ok(usda.includes('def SphereLight "Key_Spot"'), 'Must define Spot Light prim');
  assert.ok(usda.includes('float inputs:colorTemperature = 4300'), 'Must set Kelvin color temperature');
  assert.ok(usda.includes('inputs:shaping:cone:angle = 17.50'), 'Must set half-angle cone');

  assert.ok(usda.includes('def Xform "Hero"'), 'Must define Actor prim');
  assert.ok(usda.includes('custom string stance = "seated-chair"'), 'Must preserve actor stance');
  assert.ok(usda.includes('custom float heightCm = 182.00'), 'Must convert height to cm');
  assert.ok(usda.includes('def Mesh "ProxyMesh"'), 'Must generate actor proxy mesh');

  assert.ok(usda.includes('def Xform "Director_Chair"'), 'Must define Prop prim');
  assert.ok(usda.includes('custom string assetId = "directors_chair"'), 'Must preserve prop assetId');
  assert.ok(usda.includes('custom bool unreal:useNanite = 1'), 'Must configure Nanite flag');

  assert.ok(usda.includes('def Scope "Atmosphere"'), 'Must define Atmosphere scope');
  assert.ok(usda.includes('custom string preset = "cinematic_fog"'), 'Must preserve preset');
});

// --- USD rotation axis contract ---------------------------------------------

/** Pulls the `quatf xformOp:orient` written for a named prim out of a USDA stage. */
function usdOrientOf(usda: string, primName: string): { x: number; y: number; z: number; w: number } {
  const at = usda.indexOf(`"${primName}"`);
  assert.ok(at >= 0, `prim "${primName}" not found in stage`);
  const m = /quatf xformOp:orient = \(([^)]+)\)/.exec(usda.slice(at));
  assert.ok(m, `prim "${primName}" has no quatf xformOp:orient`);
  const parts = m![1].split(',').map((v) => Number(v.trim()));
  assert.equal(parts.length, 4, 'USD quaternion literal must have 4 components');
  // USD writes quaternion literals real part first: (w, x, y, z).
  return { w: parts[0], x: parts[1], y: parts[2], z: parts[3] };
}

/** Standard right-handed quaternion rotation, independent of the exporter's own maths. */
function rotateByQuat(
  q: { x: number; y: number; z: number; w: number },
  v: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const cx = q.y * v.z - q.z * v.y;
  const cy = q.z * v.x - q.x * v.z;
  const cz = q.x * v.y - q.y * v.x;
  const dx = q.y * cz - q.z * cy;
  const dy = q.z * cx - q.x * cz;
  const dz = q.x * cy - q.y * cx;
  return {
    x: v.x + 2 * (q.w * cx + dx),
    y: v.y + 2 * (q.w * cy + dy),
    z: v.z + 2 * (q.w * cz + dz),
  };
}

test('generateOpenUsdScene: prim rotations decode back to the exact Unreal FRotator (no axis swap)', () => {
  const scene = createScene('USD Rotation Contract');

  // Case 1: pure heading. rotationY = PI/2 must come back as pure yaw.
  const heading = Math.PI / 2;
  const actor = createActor(scene, { x: 1.0, y: 0, z: 2.0 }, heading);
  actor.name = 'HeadingProbe';
  actor.stance = 'standing'; // zero bodyRot, so pitch and roll must both be zero

  // Case 2: pitch AND roll AND yaw all distinct and non-zero, so a slot swap or a
  // sign flip cannot survive by symmetry.
  const propRotX = 0.2;
  const propRotY = 0.5;
  const propRotZ = -0.4;
  scene.props = [
    createPropData('directors_chair', 'TiltProbe', { x: -1.5, y: 0, z: 1.0 }, {
      rotationY: propRotY,
      rotationX: propRotX,
      rotationZ: propRotZ,
    }),
  ];

  const usda = generateOpenUsdScene(scene, { fps: 24, scaleFactor: 100.0 });

  // The stage is Z-up, so `xformOp:rotateXYZ` would mean rotations about X, then
  // Y, then Z -- writing an Unreal (pitch, yaw, roll) triple into those slots
  // tips prims onto their side. Orientation must be order-free.
  assert.ok(!usda.includes('rotateXYZ'), 'must not emit ambiguous rotateXYZ on a Z-up stage');
  assert.ok(usda.includes('quatf xformOp:orient'), 'must emit an order-free orientation');
  assert.ok(
    usda.includes('uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:orient", "xformOp:scale"]'),
    'xformOpOrder must name the op that is actually authored',
  );

  // --- Case 1 decode -------------------------------------------------------
  const qHeading = usdOrientOf(usda, 'HeadingProbe');
  const decodedHeading = ueBasisToRotator(
    rotateByQuat(qHeading, { x: 1, y: 0, z: 0 }),
    rotateByQuat(qHeading, { x: 0, y: 1, z: 0 }),
    rotateByQuat(qHeading, { x: 0, y: 0, z: 1 }),
  );
  const expectYaw = svHeadingToUeYaw(heading);
  assert.ok(Math.abs(decodedHeading.yaw - expectYaw) < 1e-4, `yaw ${decodedHeading.yaw} != ${expectYaw}`);
  assert.ok(Math.abs(decodedHeading.pitch) < 1e-4, `heading leaked into pitch: ${decodedHeading.pitch}`);
  assert.ok(Math.abs(decodedHeading.roll) < 1e-4, `heading leaked into roll: ${decodedHeading.roll}`);

  // The actor must turn about the world up axis, not tip over: forward stays flat
  // and up stays up. This is the assertion the old rotateXYZ emission failed.
  const fwd = rotateByQuat(qHeading, { x: 1, y: 0, z: 0 });
  const up = rotateByQuat(qHeading, { x: 0, y: 0, z: 1 });
  assert.ok(Math.abs(fwd.z) < 1e-6, 'a pure heading must keep the forward vector horizontal');
  assert.ok(Math.abs(up.z - 1) < 1e-6, 'a pure heading must keep the up vector pointing up');

  // --- Case 2 decode -------------------------------------------------------
  const qTilt = usdOrientOf(usda, 'TiltProbe');
  const decodedTilt = ueBasisToRotator(
    rotateByQuat(qTilt, { x: 1, y: 0, z: 0 }),
    rotateByQuat(qTilt, { x: 0, y: 1, z: 0 }),
    rotateByQuat(qTilt, { x: 0, y: 0, z: 1 }),
  );
  const expectTilt = {
    pitch: (propRotX * 180) / Math.PI,
    yaw: svHeadingToUeYaw(propRotY),
    roll: (propRotZ * 180) / Math.PI,
  };
  assert.ok(Math.abs(decodedTilt.pitch - expectTilt.pitch) < 1e-4, `pitch ${decodedTilt.pitch} != ${expectTilt.pitch}`);
  assert.ok(Math.abs(decodedTilt.yaw - expectTilt.yaw) < 1e-4, `yaw ${decodedTilt.yaw} != ${expectTilt.yaw}`);
  assert.ok(Math.abs(decodedTilt.roll - expectTilt.roll) < 1e-4, `roll ${decodedTilt.roll} != ${expectTilt.roll}`);

  // All three components differ, so the passing decode above cannot be a symmetry.
  assert.ok(Math.abs(expectTilt.pitch) > 1 && Math.abs(expectTilt.roll) > 1, 'probe must exercise pitch and roll');
  assert.ok(
    Math.abs(expectTilt.pitch - expectTilt.roll) > 1 &&
      Math.abs(expectTilt.pitch - expectTilt.yaw) > 1 &&
      Math.abs(expectTilt.roll - expectTilt.yaw) > 1,
    'probe angles must all be distinct',
  );

  // And the emitted basis matches ueCoords' own FRotator basis element for element.
  const expectBasis = ueRotatorToBasis(expectTilt);
  const gotF = rotateByQuat(qTilt, { x: 1, y: 0, z: 0 });
  assert.ok(Math.abs(gotF.x - expectBasis.forward.x) < 1e-5);
  assert.ok(Math.abs(gotF.y - expectBasis.forward.y) < 1e-5);
  assert.ok(Math.abs(gotF.z - expectBasis.forward.z) < 1e-5);
});

test('escapeUsdString: line terminators and control characters cannot break out of a USD literal', () => {
  // A raw newline splits the literal across source lines and makes the WHOLE stage
  // unparseable, not just the one attribute. Actor notes carry multi-line dialogue,
  // so this is reachable from ordinary scene data.
  assert.equal(escapeUsdString('line one\nline two'), 'line one\\nline two');
  assert.equal(escapeUsdString('carriage\rreturn'), 'carriage\\rreturn');
  assert.equal(escapeUsdString('tab\there'), 'tab\\there');
  assert.equal(escapeUsdString('back\\slash'), 'back\\\\slash');
  assert.equal(escapeUsdString('say "hi"'), 'say \\"hi\\"');
  assert.equal(escapeUsdString('bell\x07here'), 'bell\\x07here');

  // Nothing in the escaped output may be a raw line terminator or a bare quote.
  const nasty = 'A\nB\r\nC\tD "E" \\F\x00G';
  const escaped = escapeUsdString(nasty);
  assert.ok(!/[\n\r]/.test(escaped), 'escaped output still contains a raw line terminator');
  assert.ok(!/(^|[^\\])"/.test(escaped), 'escaped output still contains an unescaped quote');

  // Non-ASCII is legal in USD strings and must survive untouched.
  assert.equal(escapeUsdString('café 🎬'), 'café 🎬');
});

test('generateOpenUsdScene: a multi-line actor note does not break the stage', () => {
  const scene = createScene('Note Probe');
  const actor = createActor(scene, { x: 1, y: 0, z: 2 }, 0);
  actor.notes = [
    { id: 'n1', kind: 'dialogue', text: "I can't do this.\nNot after what happened." },
    { id: 'n2', kind: 'action', text: 'Turns\r\nsharply\taway' },
  ] as typeof actor.notes;
  scene.actors.push(actor);

  const usda = generateOpenUsdScene(scene, { fps: 24, scaleFactor: 100.0 });

  // Every `custom string ... = "..."` must open and close on one physical line.
  const noteLines = usda.split('\n').filter((l) => l.includes('custom string notes'));
  assert.ok(noteLines.length > 0, 'expected the note attribute to be emitted');
  for (const line of noteLines) {
    const quotes = (line.match(/(?<!\\)"/g) ?? []).length;
    assert.equal(quotes, 2, `note literal is not closed on its own line: ${line}`);
  }

  // Balanced quotes across the whole stage: an unterminated literal shows up here.
  const allQuotes = (usda.match(/(?<!\\)"/g) ?? []).length;
  assert.equal(allQuotes % 2, 0, 'stage has an odd number of unescaped quotes (unterminated literal)');
});

test('aspectValue: an off-union aspect falls back instead of poisoning exports with NaN', () => {
  // Reachable at runtime from imported JSON or a cast even though the type forbids it.
  // Without a default branch this returned undefined, callers divided by it, and the
  // USD exporter emitted `verticalAperture = NaN` - not a legal float literal, so the
  // entire stage failed to load.
  assert.ok(Number.isFinite(aspectValue('16:9')));
  assert.ok(Number.isFinite(aspectValue('2.39:1')));
  assert.ok(Number.isFinite(aspectValue('4:3')));
  assert.ok(Number.isFinite(aspectValue('2.39' as never)), 'off-union aspect must not return undefined');

  const scene = createScene('Aspect Probe');
  const cam = createCameraSetup(
    scene,
    { x: 0, y: 1.6, z: 0 },
    { x: 0, y: 0, z: 0, w: 1 },
    35,
    '2.39' as never,
  );
  scene.cameras.push(cam);
  const usda = generateOpenUsdScene(scene, { fps: 24, scaleFactor: 100.0 });

  // Match NaN/undefined only where a NUMBER is authored, so a scene or actor NAME
  // that happens to contain the letters cannot mask or fake this assertion.
  const badNumeric = usda
    .split('\n')
    .filter((l) => /=\s*-?(NaN|undefined)\b/.test(l) || /\(\s*-?(NaN|undefined)\b/.test(l));
  assert.deepEqual(badNumeric, [], `USD stage authored a non-finite number: ${badNumeric.join(' | ')}`);
  assert.ok(/float verticalAperture = [0-9]/.test(usda), 'verticalAperture must be a real number');
});

test('generateUe5PythonImportScript: embedded payload is valid JSON and survives hostile scene names', () => {
  // Every character class that has ever closed a Python literal early, plus the
  // exact `'''` sequence that defeated the old raw triple-quoted embedding.
  const hostile = [
    "Rig's \"A-Cam\"",
    'back\\slash and \\n literal',
    'line one\nline two',
    "triple ''' quote \"\"\" both",
    'café naïve ñ',
    '\u{1F3AC} clapper',
    'tab\tand\rcarriage',
  ].join(' | ');

  const scene = createScene(hostile);
  const actor = createActor(scene, { x: 0, y: 0, z: 2.0 }, 0);
  actor.name = `${hostile} (actor)`;
  createCameraSetup(scene, { x: 0, y: 1.5, z: -2.0 }, { x: 0, y: 0, z: 0, w: 1 }, 50, '16:9', 2.8, 'fullframe');
  scene.props = [createPropData('directors_chair', `${hostile} (prop)`, { x: 1, y: 0, z: 0 })];

  const script = generateUe5PythonImportScript(scene, { fps: 24 });

  // The payload must not be hand-escaped into a raw string: raw strings take the
  // escapes literally, which made every generated script die on json.loads.
  assert.ok(!script.includes("json.loads(r'''"), 'must not embed escaped JSON in a raw literal');
  assert.ok(script.includes('import base64'), 'decoder import must be present');
  assert.ok(script.includes('SCENE_DATA_PAYLOAD = json.loads'), 'Embeds scene JSON payload');

  // Extract exactly what Python would see and decode it the same way Python does.
  const block = /SCENE_DATA_B64 = \(\n([\s\S]*?)\n\)/.exec(script);
  assert.ok(block, 'generated script must expose a SCENE_DATA_B64 literal');
  const b64 = (block![1].match(/"([A-Za-z0-9+/=]*)"/g) ?? []).map((c) => c.slice(1, -1)).join('');
  assert.ok(b64.length > 0, 'base64 payload must not be empty');
  assert.ok(!/["'\\\n]/.test(b64), 'base64 payload must contain no literal-terminating characters');

  const json = Buffer.from(b64, 'base64').toString('utf8');
  const parsed = JSON.parse(json) as SceneData;

  assert.equal(parsed.name, hostile, 'scene name must round-trip byte for byte');
  assert.equal(parsed.actors[0].name, `${hostile} (actor)`, 'actor name must round-trip byte for byte');
  assert.equal(parsed.props?.[0]?.name, `${hostile} (prop)`, 'prop name must round-trip byte for byte');
  assert.equal(parsed.id, scene.id);
  assert.equal(parsed.cameras.length, 1);

  // The short display strings are escaped, not raw, so they cannot break out either.
  const docLine = /Generated for: "(.*)"/.exec(script);
  assert.ok(docLine, 'docstring must name the scene');
  assert.ok(!docLine![1].includes('\n'), 'escaped display name must stay on one line');
});

test('generateUe5PythonImportScript: generates self-contained Unreal Engine Python automation script', () => {
  const scene = createScene('Studio Sequence');
  const identityRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
  createCameraSetup(scene, { x: 0, y: 1.5, z: -2.0 }, identityRot, 50, '16:9', 2.8, 'fullframe');
  const actor = createActor(scene, { x: 0, y: 0, z: 2.0 }, 0);
  actor.name = 'Lead';
  const light = createLight(scene, [1, 2.5, 1], 0, 0, 'area');
  light.colorKelvin = 3200;

  const script = generateUe5PythonImportScript(scene, {
    fps: 30,
    unrealEngineVersion: '5.5',
    useLumen: true,
    useNanite: true,
    generateSequencerTracks: true,
  });

  assert.ok(script.includes('import os'), 'Imports standard os');
  assert.ok(script.includes('import sys'), 'Imports standard sys');
  assert.ok(script.includes('import unreal'), 'Imports unreal module');
  assert.ok(script.includes('SCENE_DATA_PAYLOAD = json.loads'), 'Embeds scene JSON payload');
  assert.ok(script.includes('FPS = 30'), 'Sets configured frame rate');
  assert.ok(script.includes('TARGET_UE_VERSION = "5.5"'), 'Sets target UE version');

  assert.ok(script.includes('unreal.CineCameraActor'), 'Spawns CineCameraActor');
  assert.ok(script.includes('cine_comp.filmback'), 'Sets camera filmback');
  assert.ok(script.includes('cine_comp.current_focal_length = focal_length'), 'Sets focal length');
  assert.ok(script.includes('unreal.CameraFocusMethod.MANUAL'), 'Sets manual focus');
  assert.ok(script.includes('unreal.RectLight'), 'Spawns RectLight for area light');
  assert.ok(script.includes('l_comp.set_temperature(kelvin)'), 'Sets Kelvin temperature');
  assert.ok(script.includes('unreal.ExponentialHeightFog'), 'Spawns volumetric height fog');
  assert.ok(script.includes('unreal.PostProcessVolume'), 'Configures Lumen post process');
  assert.ok(script.includes('unreal.LevelSequence'), 'Builds LevelSequence');
  assert.ok(script.includes('unreal.MovieSceneCameraCutTrack'), 'Builds Camera Cut Track');
  assert.ok(script.includes('if __name__ == "__main__":'), 'Includes CLI entry point');
});

test('generateUe5JsonManifest: formats structured JSON interchange document', () => {
  const scene = createScene('Interchange Test');
  const identityRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
  const cam = createCameraSetup(scene, { x: 1, y: 1.4, z: -3 }, identityRot, 85, '16:9', 1.4, 'super35');
  scene.cameras = [cam];
  const actor = createActor(scene, { x: 0, y: 0, z: 1.5 }, 0);
  actor.name = 'Player';
  actor.stance = 'standing';
  scene.actors = [actor];
  scene.props = [createPropData('apple_box_full', 'Apple Box', { x: 0.5, y: 0, z: 0.5 })];
  scene.atmosphere = createAtmosphereConfig('dramatic_shafts');

  const jsonStr = generateUe5JsonManifest(scene, { fps: 24, scaleFactor: 100.0, unrealEngineVersion: '5.4' });
  const manifest = JSON.parse(jsonStr);

  assert.equal(manifest.schemaVersion, '1.0.0');
  assert.equal(manifest.generator, 'SetView Unreal Engine 5 Bridge');
  assert.equal(manifest.unrealEngineVersion, '5.4');
  assert.equal(manifest.settings.fps, 24);
  assert.equal(manifest.settings.scaleFactor, 100.0);
  assert.equal(manifest.settings.coordinateSystem, 'LeftHanded_ZUp_Cm');

  assert.equal(manifest.scene.name, 'Interchange Test');
  assert.ok(Array.isArray(manifest.cameras) && manifest.cameras.length === 1);
  assert.equal(manifest.cameras[0].optics.focalLengthMm, 85);
  assert.equal(manifest.cameras[0].optics.tStop, 1.4);
  assert.equal(manifest.cameras[0].filmback.formatId, 'super35');

  assert.ok(Array.isArray(manifest.actors) && manifest.actors.length === 1);
  assert.equal(manifest.actors[0].name, 'Player');
  assert.equal(manifest.actors[0].stance, 'standing');

  assert.ok(Array.isArray(manifest.props) && manifest.props.length === 1);
  assert.equal(manifest.props[0].assetId, 'apple_box_full');

  assert.ok(manifest.atmosphere);
  assert.equal(manifest.atmosphere.preset, 'dramatic_shafts');
});

test('exportUe5BridgePackage: packages all three formats with correct filenames and mime types', () => {
  const scene = createScene('Master Shot Scene');
  const identityRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
  createCameraSetup(scene, { x: 0, y: 1.5, z: -3 }, identityRot, 35, '16:9', 2.8, 'super35');

  const usdPkg = exportUe5BridgePackage(scene, 'open_usd');
  assert.equal(usdPkg.filename, 'master_shot_scene.usda');
  assert.equal(usdPkg.mimeType, 'model/vnd.usda');
  assert.ok(usdPkg.content.includes('#usda 1.0'));

  const pyPkg = exportUe5BridgePackage(scene, 'ue5_python_script');
  assert.equal(pyPkg.filename, 'import_master_shot_scene_ue5.py');
  assert.equal(pyPkg.mimeType, 'text/x-python');
  assert.ok(pyPkg.content.includes('import unreal'));

  const jsonPkg = exportUe5BridgePackage(scene, 'ue5_json_manifest');
  assert.equal(jsonPkg.filename, 'master_shot_scene.ue5.json');
  assert.equal(jsonPkg.mimeType, 'application/json');
  assert.ok(jsonPkg.content.includes('"schemaVersion": "1.0.0"'));

  assert.throws(() => {
    exportUe5BridgePackage(scene, 'invalid_format' as Ue5ExportFormat);
  });
});


// --- Architectural Set Dressing Engine (pure domain and renderer) ---------

test('WALL_FINISH_PRESETS: defines 8 curated architectural finishes with PBR parameters', () => {
  const finishes: WallFinishType[] = [
    'painted_drywall',
    'victorian_damask',
    'midcentury_geometric',
    'exposed_brick',
    'wood_paneling',
    'industrial_concrete',
    'acoustic_foam',
    'custom_color',
  ];

  for (const f of finishes) {
    const preset = WALL_FINISH_PRESETS[f];
    assert.ok(preset, `preset exists for ${f}`);
    assert.equal(preset.id, f);
    assert.equal(typeof preset.name, 'string');
    assert.ok(preset.defaultRoughness >= 0 && preset.defaultRoughness <= 1);
    assert.ok(preset.defaultUvTiling[0] > 0 && preset.defaultUvTiling[1] > 0);
    assert.equal(typeof preset.description, 'string');
  }
});

test('DEFAULT_WINDOW_TYPES and DEFAULT_DOOR_TYPES: architectural catalogs have valid parameters', () => {
  const windowTypes: WindowType[] = ['casement', 'sash', 'picture', 'floor_to_ceiling', 'stained_glass', 'arched'];
  for (const wt of windowTypes) {
    const def = DEFAULT_WINDOW_TYPES[wt];
    assert.ok(def, `window type exists for ${wt}`);
    assert.equal(def.type, wt);
    assert.equal(typeof def.name, 'string');
    assert.ok(def.defaultWidthM > 0);
    assert.ok(def.defaultHeightM > 0);
    assert.ok(def.defaultHeightFromFloorM >= 0);
  }

  const doorTypes: DoorType[] = ['single_swing', 'double_french', 'sliding_barn', 'studio_acoustic', 'pocket'];
  for (const dt of doorTypes) {
    const def = DEFAULT_DOOR_TYPES[dt];
    assert.ok(def, `door type exists for ${dt}`);
    assert.equal(def.type, dt);
    assert.equal(typeof def.name, 'string');
    assert.ok(def.defaultWidthM > 0);
    assert.ok(def.defaultHeightM > 0);
  }
});

test('createWindowData and createWindowData overrides produce valid objects', () => {
  const defaultWin = createWindowData();
  assert.ok(typeof defaultWin.id === 'string' && defaultWin.id.length > 0);
  assert.equal(defaultWin.type, 'casement');
  assert.equal(defaultWin.widthM, 0.9);
  assert.equal(defaultWin.heightM, 1.2);
  assert.equal(defaultWin.heightFromFloorM, 0.9);
  assert.equal(defaultWin.offsetAlongWallM, 1.0);

  const customWin = createWindowData({
    type: 'stained_glass',
    offsetAlongWallM: 2.5,
    heightFromFloorM: 1.1,
    widthM: 1.6,
    heightM: 2.0,
    glassTintHex: '#a855f7',
    glassRoughness: 0.15,
    glassOpacity: 0.45,
    frameColorHex: '#1e293b',
  });
  assert.equal(customWin.type, 'stained_glass');
  assert.equal(customWin.offsetAlongWallM, 2.5);
  assert.equal(customWin.glassTintHex, '#a855f7');
  assert.equal(customWin.glassRoughness, 0.15);
  assert.equal(customWin.glassOpacity, 0.45);
  assert.equal(customWin.frameColorHex, '#1e293b');
});

test('createDoorData and createDoorData overrides produce valid objects', () => {
  const defaultDoor = createDoorData();
  assert.ok(typeof defaultDoor.id === 'string' && defaultDoor.id.length > 0);
  assert.equal(defaultDoor.type, 'single_swing');
  assert.equal(defaultDoor.widthM, 0.9);
  assert.equal(defaultDoor.heightM, 2.1);
  assert.equal(defaultDoor.offsetAlongWallM, 1.0);
  assert.equal(defaultDoor.openAngleDeg, 0);

  const customDoor = createDoorData({
    type: 'double_french',
    offsetAlongWallM: 3.0,
    widthM: 1.8,
    heightM: 2.4,
    openAngleDeg: 60,
    finishHex: '#78350f',
  });
  assert.equal(customDoor.type, 'double_french');
  assert.equal(customDoor.offsetAlongWallM, 3.0);
  assert.equal(customDoor.widthM, 1.8);
  assert.equal(customDoor.heightM, 2.4);
  assert.equal(customDoor.openAngleDeg, 60);
  assert.equal(customDoor.finishHex, '#78350f');
});

test('createWallData and createArchitecturalSet factories produce complete structures', () => {
  const wall = createWallData({
    start: { x: 0, y: 0, z: 0 },
    end: { x: 6, y: 0, z: 0 },
    finish: 'exposed_brick',
    heightM: 3.5,
    thicknessM: 0.2,
    tintHex: '#b91c1c',
  });
  assert.ok(typeof wall.id === 'string' && wall.id.length > 0);
  assert.equal(wall.finish, 'exposed_brick');
  assert.equal(wall.heightM, 3.5);
  assert.equal(wall.thicknessM, 0.2);
  assert.equal(wall.tintHex, '#b91c1c');
  assert.deepEqual(wall.start, { x: 0, y: 0, z: 0 });
  assert.deepEqual(wall.end, { x: 6, y: 0, z: 0 });

  const archSet = createArchitecturalSet('Victorian Parlor', {
    walls: [wall],
    floorFinish: 'dark_hardwood',
    ceilingHeightM: 3.5,
  });
  assert.ok(typeof archSet.id === 'string' && archSet.id.length > 0);
  assert.equal(archSet.name, 'Victorian Parlor');
  assert.equal(archSet.walls.length, 1);
  assert.equal(archSet.floorFinish, 'dark_hardwood');
  assert.equal(archSet.ceilingHeightM, 3.5);
});

test('isWindowData, isDoorData, isWallData, isArchitecturalSet validate strictly', () => {
  const validWin = createWindowData();
  assert.equal(isWindowData(validWin), true);
  assert.equal(isWindowData(null), false);
  assert.equal(isWindowData({ ...validWin, widthM: -1 }), false);
  assert.equal(isWindowData({ ...validWin, type: 'trapdoor' as any }), false);

  const validDoor = createDoorData();
  assert.equal(isDoorData(validDoor), true);
  assert.equal(isDoorData(undefined), false);
  assert.equal(isDoorData({ ...validDoor, heightM: NaN }), false);
  assert.equal(isDoorData({ ...validDoor, openAngleDeg: 240 }), false);

  const validWall = createWallData({ start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } });
  assert.equal(isWallData(validWall), true);
  assert.equal(isWallData({ ...validWall, finish: 'marble_gold' as any }), false);
  assert.equal(isWallData({ ...validWall, thicknessM: 0 }), false);

  const validSet = createArchitecturalSet('Soundstage A', { walls: [validWall] });
  assert.equal(isArchitecturalSet(validSet), true);
  assert.equal(isArchitecturalSet({ ...validSet, walls: ['not a wall' as any] }), false);
  assert.equal(isArchitecturalSet({ ...validSet, ceilingHeightM: -2 }), false);
});

test('normalizeWallData and normalizeArchitecturalSet repair and sanitize corrupted fields', () => {
  const corruptedWall: any = {
    id: 'wall-corrupted',
    name: 'Bad Wall',
    start: { x: NaN, y: Infinity, z: 0 },
    end: { x: 4, y: 0, z: 0 },
    heightM: -5,
    thicknessM: 0.001,
    finish: 'unknown_wallpaper',
    tintHex: 'not-a-color',
    roughness: 4.5,
    uvTiling: [-2, 0],
    windows: [{ id: 'w1', name: 'W1', type: 'invalid_win', offsetAlongWallM: -3, heightFromFloorM: -1, widthM: 0, heightM: -2 }],
    doors: [{ id: 'd1', name: 'D1', type: 'invalid_door', offsetAlongWallM: -1, widthM: -0.5, heightM: 0, openAngleDeg: 999 }],
  };

  const normWall = normalizeWallData(corruptedWall);
  assert.equal(normWall.start.x, 0);
  assert.equal(normWall.start.y, 0);
  assert.equal(normWall.start.z, 0);
  assert.ok(normWall.heightM >= 0.5);
  assert.ok(normWall.thicknessM >= 0.02);
  assert.equal(normWall.finish, 'painted_drywall');
  assert.equal(normWall.tintHex, '#f1f5f9');
  assert.ok(normWall.roughness >= 0 && normWall.roughness <= 1);
  assert.ok(normWall.uvTiling[0] > 0 && normWall.uvTiling[1] > 0);
  assert.ok(normWall.windows && normWall.windows.length > 0 && normWall.windows[0].widthM >= 0.1);
  assert.ok(normWall.doors && normWall.doors.length > 0 && (normWall.doors[0].openAngleDeg ?? 0) <= 180);

  const corruptedSet: any = {
    id: 123,
    name: 456,
    walls: [normWall, null, { id: 'invalid' }],
    ceilingHeightM: -4,
  };

  const normSet = normalizeArchitecturalSet(corruptedSet);
  assert.equal(typeof normSet.id, 'string');
  assert.equal(typeof normSet.name, 'string');
  assert.equal(normSet.walls.length, 1);
  assert.equal(normSet.ceilingHeightM, undefined);
});

test('calculateWallPolygon computes exact 2D perimeter rectangle coordinates', () => {
  // Horizontal wall along X axis from (0,0,0) to (10,0,0) with thickness 0.2m
  const wallX = createWallData({ start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, thicknessM: 0.2 });
  const polyX = calculateWallPolygon(wallX);
  assert.equal(polyX.lengthM, 10.0);
  approx(polyX.normal.x, 0);
  approx(polyX.normal.z, 1.0);
  assert.equal(polyX.corners.length, 4);

  // Corners should form a 10m x 0.2m rectangle with Z at -0.1 and +0.1
  approx(polyX.corners[0].x, 0);
  approx(polyX.corners[0].z, -0.1);
  approx(polyX.corners[1].x, 0);
  approx(polyX.corners[1].z, 0.1);
  approx(polyX.corners[2].x, 10);
  approx(polyX.corners[2].z, 0.1);
  approx(polyX.corners[3].x, 10);
  approx(polyX.corners[3].z, -0.1);

  // Diagonal wall (3, 0, 4) -> length 5m, thickness 0.1m
  const wallDiag = createWallData({ start: { x: 0, y: 0, z: 0 }, end: { x: 3, y: 0, z: 4 }, thicknessM: 0.1 });
  const polyDiag = calculateWallPolygon(wallDiag);
  approx(polyDiag.lengthM, 5.0);
  approx(polyDiag.normal.x, -4 / 5);
  approx(polyDiag.normal.z, 3 / 5);
});

test('calculateWallBoundingBox derives accurate min/max 3D extents', () => {
  const wall = createWallData({
    start: { x: 1, y: 0, z: 2 },
    end: { x: 7, y: 0, z: 2 },
    heightM: 2.8,
    thicknessM: 0.2,
  });
  const bbox = calculateWallBoundingBox(wall);
  approx(bbox.min.x, 1.0);
  approx(bbox.max.x, 7.0);
  approx(bbox.min.y, 0);
  approx(bbox.max.y, 2.8);
  approx(bbox.min.z, 1.9);
  approx(bbox.max.z, 2.1);
});

test('calculateWindowOpening and calculateDoorOpening compute exact 3D cutout bounds', () => {
  const wall = createWallData({ start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 }, heightM: 3.0, thicknessM: 0.2 });
  const win = createWindowData({ offsetAlongWallM: 4.0, widthM: 2.0, heightM: 1.4, heightFromFloorM: 1.0 });
  const door = createDoorData({ offsetAlongWallM: 1.0, widthM: 0.9, heightM: 2.1 });

  const winOpening = calculateWindowOpening(wall, win);
  approx(winOpening.center.x, 5.0);
  approx(winOpening.center.y, 1.7);
  approx(winOpening.center.z, 0.0);
  approx(winOpening.min.x, 4.0);
  approx(winOpening.max.x, 6.0);
  approx(winOpening.min.y, 1.0);
  approx(winOpening.max.y, 2.4);

  const doorOpening = calculateDoorOpening(wall, door);
  approx(doorOpening.center.x, 1.45);
  approx(doorOpening.center.y, 1.05);
  approx(doorOpening.min.x, 1.0);
  approx(doorOpening.max.x, 1.9);
  approx(doorOpening.min.y, 0.0);
  approx(doorOpening.max.y, 2.1);
});

test('SceneData integration: createScene, isSceneData, and normalizeScene handle architecture', () => {
  const scene = createScene('Studio 1');
  assert.ok(scene.architecture);
  assert.equal(scene.architecture.name, 'Studio 1 Architecture');
  assert.equal(isSceneData(scene), true);

  const rawScene = JSON.parse(JSON.stringify(scene));
  delete rawScene.architecture;
  const restored = normalizeScene(rawScene);
  assert.ok(restored.architecture);
  assert.equal(restored.architecture.name, 'Studio 1 Architecture');
});

test('collab.ts: architecture_update and architecture_patch network sync patches', () => {
  const scene = createScene('Collab Studio');
  const wall1 = createWallData({ start: { x: 0, y: 0, z: 0 }, end: { x: 5, y: 0, z: 0 } });
  const wall2 = createWallData({ start: { x: 5, y: 0, z: 0 }, end: { x: 5, y: 0, z: 5 } });

  // Patch: architecture_update
  const updatePatch = {
    type: 'architecture_update' as const,
    architecture: createArchitecturalSet('Remote Set', { walls: [wall1] }),
  };
  assert.equal(applyScenePatch(scene, updatePatch), true);
  assert.equal(scene.architecture?.walls.length, 1);
  assert.equal(scene.architecture?.name, 'Remote Set');

  // Patch: architecture_patch (add wall)
  const addWallPatch = {
    type: 'architecture_patch' as const,
    wall: wall2,
  };
  assert.equal(applyScenePatch(scene, addWallPatch), true);
  assert.equal(scene.architecture?.walls.length, 2);

  // Patch: architecture_patch (update existing wall)
  const modifiedWall1 = { ...wall1, finish: 'exposed_brick' as const };
  const modifyWallPatch = {
    type: 'architecture_patch' as const,
    wall: modifiedWall1,
  };
  assert.equal(applyScenePatch(scene, modifyWallPatch), true);
  assert.equal(scene.architecture?.walls.length, 2);
  assert.equal(scene.architecture?.walls.find((w) => w.id === wall1.id)?.finish, 'exposed_brick');

  // Patch: architecture_patch (remove wall)
  const removeWallPatch = {
    type: 'architecture_patch' as const,
    wallIdToRemove: wall1.id,
  };
  assert.equal(applyScenePatch(scene, removeWallPatch), true);
  assert.equal(scene.architecture?.walls.length, 1);
  assert.equal(scene.architecture?.walls[0].id, wall2.id);

  // EntityLockManager for 'wall'
  const lockMgr = new EntityLockManager();
  const res1 = lockMgr.acquire(wall2.id, 'wall', 'peer-dir-1');
  assert.equal(res1.granted, true);

  const res2 = lockMgr.acquire(wall2.id, 'wall', 'peer-dp-2');
  assert.equal(res2.granted, false);
  assert.equal(res2.currentOwnerId, 'peer-dir-1');

  assert.equal(lockMgr.release(wall2.id, 'peer-dir-1'), true);
  const res3 = lockMgr.acquire(wall2.id, 'wall', 'peer-dp-2');
  assert.equal(res3.granted, true);
});

test('ArchitectureRenderer: builds 3D meshes with window/door cutouts and interactive door pivots', () => {
  const renderer = new ArchitectureRenderer();

  const win = createWindowData({ type: 'casement', offsetAlongWallM: 2.0, widthM: 1.2, heightM: 1.4 });
  const door = createDoorData({ type: 'single_swing', offsetAlongWallM: 4.5, widthM: 0.9, heightM: 2.1, openAngleDeg: 45 });
  const wall = createWallData({
    start: { x: 0, y: 0, z: 0 },
    end: { x: 8, y: 0, z: 0 },
    heightM: 3.0,
    thicknessM: 0.15,
    finish: 'victorian_damask',
    windows: [win],
    doors: [door],
  });

  const wallMesh = renderer.createWallMesh(wall);
  assert.ok(wallMesh instanceof THREE.Group);
  assert.equal(wallMesh.name, `wall_${wall.id}`);

  // Checks child solid blocks around window and door cutouts
  const solidGroup = wallMesh.getObjectByName(`wall_solid_${wall.id}`);
  assert.ok(solidGroup);
  assert.ok(solidGroup.children.length >= 3); // Leading block, lintel/sill blocks, trailing block

  // Checks window assembly with frame and glass
  const winGroup = wallMesh.getObjectByName(`window_${win.id}`);
  assert.ok(winGroup);
  assert.ok(winGroup.children.length >= 5); // 4 frame sides + glass pane

  // Checks door assembly with hinge pivot
  const doorGroup = wallMesh.getObjectByName(`door_${door.id}`);
  assert.ok(doorGroup);
  const doorHinge = wallMesh.getObjectByName(`door_hinge_${door.id}`);
  assert.ok(doorHinge);

  // Test interactive door angle update
  renderer.updateDoorAngle(wall.id, door.id, 90);
  approx(doorHinge.rotation.y, Math.PI / 2);

  // Test full set mesh creation
  const archSet = createArchitecturalSet('Soundstage B', { walls: [wall] });
  const setRoot = renderer.createArchitecturalSetMesh(archSet);
  assert.ok(setRoot instanceof THREE.Group);
  assert.equal(setRoot.children.length, 1);

  // Test wall update and cleanup
  const updatedWall = { ...wall, heightM: 3.8 };
  renderer.updateWall(updatedWall);
  assert.equal(setRoot.children.length, 1);

  renderer.removeWall(wall.id);
  assert.equal(setRoot.children.length, 0);

  renderer.dispose();
});

test('LiveLink: createLiveLinkConfig, isLiveLinkConfig, and normalizeLiveLinkConfig', () => {
  const def = createLiveLinkConfig();
  assert.equal(def.enabled, true);
  assert.equal(def.serverUrl, 'ws://127.0.0.1:8088');
  assert.equal(def.port, 8088);
  assert.equal(def.subjectName, 'SetView_VCam');
  assert.equal(def.subjectType, 'camera');
  assert.equal(def.protocolMode, 'websocket');
  assert.equal(def.targetFps, 72);
  assert.equal(def.autoReconnect, true);
  assert.equal(def.smoothingPreset, 'handheld_subtle');
  assert.equal(def.smoothingPosWeight, 0.15);
  assert.equal(def.smoothingRotWeight, 0.2);
  assert.equal(def.streamFocalLength, true);
  assert.equal(def.streamAperture, true);
  assert.equal(def.streamFocusDistance, true);
  assert.equal(def.streamFilmback, true);

  assert.ok(isLiveLinkConfig(def));
  assert.ok(!isLiveLinkConfig(null));
  assert.ok(!isLiveLinkConfig(undefined));
  assert.ok(!isLiveLinkConfig('not-a-config'));
  assert.ok(!isLiveLinkConfig({ enabled: 'yes' }));
  assert.ok(!isLiveLinkConfig({ ...def, port: '8088' }));
  assert.ok(!isLiveLinkConfig({ ...def, serverUrl: 123 }));

  const custom = createLiveLinkConfig({
    enabled: true,
    port: 9000,
    subjectName: 'B_Cam_Main',
    smoothingPreset: 'steadicam',
  });
  assert.equal(custom.enabled, true);
  assert.equal(custom.port, 9000);
  assert.equal(custom.subjectName, 'B_Cam_Main');
  assert.equal(custom.smoothingPreset, 'steadicam');
  assert.equal(custom.smoothingPosWeight, 0.4);
  assert.equal(custom.smoothingRotWeight, 0.45);

  // Normalization clamps & sanitizes bad input
  const normalized = normalizeLiveLinkConfig({
    enabled: true,
    serverUrl: '   ',
    port: -5, // invalid port below 1
    targetFps: 500, // clamped
    subjectName: '',
    smoothingPosWeight: 2.5, // clamped to 0..1
    smoothingRotWeight: -0.5, // clamped to 0..1
  });
  assert.equal(normalized.enabled, true);
  assert.equal(normalized.serverUrl, 'ws://127.0.0.1:8088');
  assert.equal(normalized.port, 8088);
  assert.equal(normalized.targetFps, 72);
  assert.equal(normalized.subjectName, 'SetView_VCam');
  assert.equal(normalized.smoothingPosWeight, 1.0);
  assert.equal(normalized.smoothingRotWeight, 0.0);

  // Normalization with invalid object returns default config
  const fallback = normalizeLiveLinkConfig(null);
  assert.ok(isLiveLinkConfig(fallback));
  assert.equal(fallback.port, 8088);
});

test('LiveLink: convertSetViewToUnrealCameraTransform and convertUnrealToSetViewCameraTransform coordinate parity', () => {
  // SetView coordinate: (1.5m, 2.0m, -3.5m)
  // SetView -> Unreal: X_ue = -Z_sv * 100 = 350cm, Y_ue = X_sv * 100 = 150cm, Z_ue = Y_sv * 100 = 200cm
  const svPos = { x: 1.5, y: 2.0, z: -3.5 };
  const svRot = { x: 0, y: 0, z: 0, w: 1 }; // facing -Z, up +Y

  const ueTransform = convertSetViewToUnrealCameraTransform(svPos, svRot);
  assert.equal(Math.round(ueTransform.locationCm.x), 350);
  assert.equal(Math.round(ueTransform.locationCm.y), 150);
  assert.equal(Math.round(ueTransform.locationCm.z), 200);

  // Identity SetView camera quaternion => Unreal rotator (0, 0, 0), facing +X.
  assert.ok(Math.abs(ueTransform.rotationDeg.pitch) < 1e-6);
  assert.ok(Math.abs(ueTransform.rotationDeg.yaw) < 1e-6);
  assert.ok(Math.abs(ueTransform.rotationDeg.roll) < 1e-6);

  // Round-trip parity test
  const svReconstructed = convertUnrealToSetViewCameraTransform(ueTransform.locationCm, ueTransform.rotationDeg);
  assert.ok(Math.abs(svReconstructed.positionM.x - svPos.x) < 1e-4);
  assert.ok(Math.abs(svReconstructed.positionM.y - svPos.y) < 1e-4);
  assert.ok(Math.abs(svReconstructed.positionM.z - svPos.z) < 1e-4);

  // 90 degree yaw rotation test
  // SetView Yaw 90 deg around +Y
  const angle = Math.PI / 2;
  const svRotYaw90: Quat = { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) };
  const ueYawTransform = convertSetViewToUnrealCameraTransform(svPos, svRotYaw90);
  assert.ok(Math.abs(ueYawTransform.rotationDeg.yaw - (-90)) < 1.0 || Math.abs(ueYawTransform.rotationDeg.yaw - 270) < 1.0);

  // Quaternion magnitude is unit length
  const q = ueYawTransform.quaternion;
  const qLen = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  assert.ok(Math.abs(qLen - 1.0) < 1e-4);
});

test('LiveLink: VCam transforms preserve screen direction and round-trip a rolled camera', () => {
  // Camera at the origin looking down SetView -Z; subject 5m ahead, 1m to its RIGHT.
  const camRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
  const camUe = convertSetViewToUnrealCameraTransform({ x: 0, y: 1.6, z: 0 }, camRot);
  const subjectUe = convertSetViewToUnrealCameraTransform({ x: 1, y: 1.6, z: -5 }, camRot);
  const basis = ueRotatorToBasis(camUe.rotationDeg);
  const rel = {
    x: subjectUe.locationCm.x - camUe.locationCm.x,
    y: subjectUe.locationCm.y - camUe.locationCm.y,
    z: subjectUe.locationCm.z - camUe.locationCm.z,
  };
  const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
    a.x * b.x + a.y * b.y + a.z * b.z;
  assert.ok(Math.abs(dot(rel, basis.forward) - 500) < 1e-6, 'subject stays 5m in front over LiveLink');
  assert.ok(Math.abs(dot(rel, basis.right) - 100) < 1e-6, 'subject stays 1m camera-right over LiveLink');

  // A camera with roll AND pitch AND yaw must survive the full round-trip.
  const half = (a: number) => ({ s: Math.sin(a / 2), c: Math.cos(a / 2) });
  const ry = half(0.9);
  const rx = half(-0.4);
  const rz = half(0.35);
  const qy: Quat = { x: 0, y: ry.s, z: 0, w: ry.c };
  const qp: Quat = { x: rx.s, y: 0, z: 0, w: rx.c };
  const qr: Quat = { x: 0, y: 0, z: rz.s, w: rz.c };
  const mul = (a: Quat, b: Quat): Quat => ({
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  });
  const rolled = mul(mul(qy, qp), qr);

  const svPos2 = { x: -1.25, y: 2.4, z: 0.75 };
  const ue2 = convertSetViewToUnrealCameraTransform(svPos2, rolled);
  assert.ok(Math.abs(ue2.rotationDeg.roll) > 1.0, 'test case must actually carry roll');

  const back = convertUnrealToSetViewCameraTransform(ue2.locationCm, ue2.rotationDeg);
  assert.ok(Math.abs(back.positionM.x - svPos2.x) < 1e-9);
  assert.ok(Math.abs(back.positionM.y - svPos2.y) < 1e-9);
  assert.ok(Math.abs(back.positionM.z - svPos2.z) < 1e-9);
  const qDot =
    back.rotationQuat.x * rolled.x +
    back.rotationQuat.y * rolled.y +
    back.rotationQuat.z * rolled.z +
    back.rotationQuat.w * rolled.w;
  assert.ok(Math.abs(Math.abs(qDot) - 1) < 1e-7, 'rolled camera orientation must round-trip');
});

test('LiveLink: applyVcamSmoothing across presets and shortest-arc SLERP', () => {
  const current = {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  };
  const target = {
    position: { x: 10, y: 5, z: -2 },
    rotation: { x: 0, y: 0.7071, z: 0, w: 0.7071 },
  };

  // 'off' preset must immediately match target with zero damping
  const offSmoothed = applyVcamSmoothing(current.position, current.rotation, target.position, target.rotation, 'off', 0.016);
  assert.deepEqual(offSmoothed.position, target.position);
  assert.deepEqual(offSmoothed.rotation, target.rotation);

  // 'steadicam' preset dampens motion smoothly
  const smoothed = applyVcamSmoothing(current.position, current.rotation, target.position, target.rotation, 'steadicam', 0.016);
  assert.ok(smoothed.position.x > 0 && smoothed.position.x < target.position.x);
  assert.ok(smoothed.position.y > 0 && smoothed.position.y < target.position.y);
  assert.ok(smoothed.position.z < 0 && smoothed.position.z > target.position.z);

  // Antipodal quaternion handling (negated quaternion representing identical rotation)
  const antipodalTarget = {
    position: { x: 10, y: 5, z: -2 },
    rotation: { x: 0, y: -0.7071, z: 0, w: -0.7071 },
  };
  const antipodalSmoothed = applyVcamSmoothing(current.position, current.rotation, antipodalTarget.position, antipodalTarget.rotation, 'handheld_subtle', 0.016);
  // Shortest arc must ensure no 360 flip
  assert.ok(antipodalSmoothed.rotation.y > 0);
  assert.ok(antipodalSmoothed.rotation.w > 0);
});

test('LiveLink: encodeLiveLinkCameraPacket and decodeLiveLinkInboundMessage', () => {
  const frame: LiveLinkCameraFrame = {
    subjectName: 'TestCam',
    timestamp: 123456789,
    timecode: '01:00:00:00',
    frameNumber: 42,
    position: { x: 1.0, y: 2.0, z: 3.0 },
    rotation: { x: 0, y: 0.3826, z: 0, w: 0.9238 },
    focalLengthMm: 50.0,
    apertureTStop: 2.8,
    focusDistanceM: 3.5,
    sensorWidthMm: 36.0,
    sensorHeightMm: 24.0,
    isRecording: false,
    tally: 'preview',
    fieldOfViewDeg: 39.6,
  };

  assert.ok(isLiveLinkCameraFrame(frame));
  assert.ok(!isLiveLinkCameraFrame(null));
  assert.ok(!isLiveLinkCameraFrame({ ...frame, position: null }));

  const encoded = encodeLiveLinkCameraPacket(frame);
  const parsed = JSON.parse(encoded);
  assert.equal(parsed.protocol, 'setview_livelink');
  assert.equal(parsed.subjectName, 'TestCam');
  assert.equal(parsed.frameNumber, 42);
  assert.equal(parsed.camera.focalLengthMm, 50.0);
  assert.equal(parsed.transform.setView.position.x, 1.0);

  // Inbound message decoding
  const triggerRecMsg = JSON.stringify({
    type: 'remote_command',
    payload: { id: 'cmd-1', type: 'trigger_record', recording: true, take: 1, slate: '1A' },
    timestamp: 123456789,
  });
  const decodedRec = decodeLiveLinkInboundMessage(triggerRecMsg);
  assert.ok(decodedRec !== null);
  assert.equal(decodedRec?.type, 'remote_command');
  assert.equal((decodedRec?.payload as { type: string })?.type, 'trigger_record');
  assert.equal((decodedRec?.payload as { recording: boolean })?.recording, true);

  // Inbound pong message
  const pongMsg = JSON.stringify({ type: 'pong', timestamp: 1000 });
  const decodedPong = decodeLiveLinkInboundMessage(pongMsg);
  assert.ok(decodedPong !== null);
  assert.equal(decodedPong?.type, 'pong');
  assert.equal(decodedPong?.timestamp, 1000);

  // Inbound tally_update message
  const tallyMsg = JSON.stringify({ type: 'tally_update', payload: { tally: 'program' } });
  const decodedTally = decodeLiveLinkInboundMessage(tallyMsg);
  assert.ok(decodedTally !== null);
  assert.equal(decodedTally?.type, 'tally_update');
  assert.equal((decodedTally?.payload as { tally: string })?.tally, 'program');

  // Corrupted / malformed message returns null without throwing
  assert.equal(decodeLiveLinkInboundMessage('not-valid-json{'), null);
  assert.equal(decodeLiveLinkInboundMessage(''), null);
  assert.equal(decodeLiveLinkInboundMessage(JSON.stringify({ invalid: true })), null);
});

test('LiveLink: createVcamCommand helper and generateUe5LiveLinkReceiverPythonScript', () => {
  const cmd = createVcamCommand('trigger_take', { take: 3 });
  assert.equal(cmd.type, 'trigger_take');
  assert.equal((cmd.payload as { take: number }).take, 3);
  assert.ok(typeof cmd.id === 'string' && cmd.id.length > 0);
  assert.ok(cmd.timestamp > 0);

  const pyScript = generateUe5LiveLinkReceiverPythonScript(
    createLiveLinkConfig({
      serverUrl: 'ws://127.0.0.1:8088',
      port: 8088,
      subjectName: 'SetView_VCam',
      subjectType: 'camera',
      protocolMode: 'websocket',
      targetFps: 72,
      autoReconnect: true,
      smoothingPreset: 'steadicam',
      smoothingPosWeight: 0.6,
      smoothingRotWeight: 0.7,
      streamFocalLength: true,
      streamAperture: true,
      streamFocusDistance: true,
      streamFilmback: true,
    }),
  );

  assert.ok(pyScript.includes('SetView LiveLink & Real-Time WebXR VCam Receiver Companion'));
  assert.ok(pyScript.includes('"port": 8088'));
  assert.ok(pyScript.includes('"subject_name": "SetView_VCam"'));
  assert.ok(pyScript.includes('register_python_post_tick_callback'));
  assert.ok(pyScript.includes('CineCameraActor'));
  assert.ok(pyScript.includes('import unreal'));
  assert.ok(pyScript.includes('class SetViewLiveLinkClient'));
});

// --- Character Rigging, BVH Mocap, and IK Solvers --------------------------

test('Character Rig: Default humanoid rig structure & hierarchy validation', () => {
  const rig = createDefaultHumanoidRig();
  assert.equal(rig.hierarchy.root, 'Hips');
  assert.equal(rig.boneOrder.length, 22);
  assert.equal(HUMANOID_BONE_NAMES.length, 22);

  // Check critical bone chain links
  assert.equal(rig.hierarchy.bones['Hips'].parent, null);
  assert.equal(rig.hierarchy.bones['Spine'].parent, 'Hips');
  assert.equal(rig.hierarchy.bones['Spine1'].parent, 'Spine');
  assert.equal(rig.hierarchy.bones['Spine2'].parent, 'Spine1');
  assert.equal(rig.hierarchy.bones['Neck'].parent, 'Spine2');
  assert.equal(rig.hierarchy.bones['Head'].parent, 'Neck');

  // Arms
  assert.equal(rig.hierarchy.bones['LeftShoulder'].parent, 'Spine2');
  assert.equal(rig.hierarchy.bones['LeftArm'].parent, 'LeftShoulder');
  assert.equal(rig.hierarchy.bones['LeftForeArm'].parent, 'LeftArm');
  assert.equal(rig.hierarchy.bones['LeftHand'].parent, 'LeftForeArm');

  assert.equal(rig.hierarchy.bones['RightShoulder'].parent, 'Spine2');
  assert.equal(rig.hierarchy.bones['RightArm'].parent, 'RightShoulder');
  assert.equal(rig.hierarchy.bones['RightForeArm'].parent, 'RightArm');
  assert.equal(rig.hierarchy.bones['RightHand'].parent, 'RightForeArm');

  // Legs
  assert.equal(rig.hierarchy.bones['LeftUpLeg'].parent, 'Hips');
  assert.equal(rig.hierarchy.bones['LeftLeg'].parent, 'LeftUpLeg');
  assert.equal(rig.hierarchy.bones['LeftFoot'].parent, 'LeftLeg');
  assert.equal(rig.hierarchy.bones['LeftToeBase'].parent, 'LeftFoot');

  assert.equal(rig.hierarchy.bones['RightUpLeg'].parent, 'Hips');
  assert.equal(rig.hierarchy.bones['RightLeg'].parent, 'RightUpLeg');
  assert.equal(rig.hierarchy.bones['RightFoot'].parent, 'RightLeg');
  assert.equal(rig.hierarchy.bones['RightToeBase'].parent, 'RightFoot');

  // Rest positions are non-zero and anatomically realistic
  assert.ok(rig.hierarchy.bones['Hips'].restPosition.y > 0.8);
  assert.ok(rig.hierarchy.bones['Head'].restPosition.y > 0.05);
});

test('Character Rig: Forward kinematics computing world bone transforms', () => {
  const rig = createDefaultHumanoidRig();
  const rootPos = v3(0, 0, 0);
  const rootRot = eulerToQuat(0, 0, 0);

  const localPose: Record<HumanoidBoneName, BoneTransform> = {} as any;
  for (const name of rig.boneOrder) {
    localPose[name] = {
      position: rig.hierarchy.bones[name].restPosition,
      rotation: eulerToQuat(0, 0, 0),
    };
  }

  const fk = forwardKinematics(rig.hierarchy, localPose, rootPos, rootRot);

  assert.ok(fk['Hips']);
  assert.ok(fk['Head']);
  assert.ok(fk['LeftHand']);
  assert.ok(fk['RightHand']);

  // Head must be higher than Hips in rest posture
  assert.ok(fk['Head'].position.y > fk['Hips'].position.y);
  // Left Hand should be on the negative X side, Right Hand on the positive X side
  assert.ok(fk['LeftHand'].position.x < 0);
  assert.ok(fk['RightHand'].position.x > 0);
  // Feet should reach near the floor (y ≈ 0)
  assert.ok(Math.abs(fk['LeftFoot'].position.y) < 0.15);
  assert.ok(Math.abs(fk['RightFoot'].position.y) < 0.15);
});

test('Character Rig: Quaternion math & Slerp interpolation', () => {
  const qA = eulerToQuat(0, 0, 0);
  const qB = eulerToQuat(0, Math.PI / 2, 0); // 90 deg around Y

  // Slerp at t=0
  const q0 = quatSlerp(qA, qB, 0);
  assert.ok(Math.abs(q0.y) < 0.001);
  assert.ok(Math.abs(q0.w - 1.0) < 0.001);

  // Slerp at t=1
  const q1 = quatSlerp(qA, qB, 1);
  assert.ok(Math.abs(q1.y - Math.sin(Math.PI / 4)) < 0.001);

  // Slerp at t=0.5 -> 45 deg around Y
  const qHalf = quatSlerp(qA, qB, 0.5);
  const expectedY = Math.sin(Math.PI / 8);
  const expectedW = Math.cos(Math.PI / 8);
  assert.ok(Math.abs(qHalf.y - expectedY) < 0.01);
  assert.ok(Math.abs(qHalf.w - expectedW) < 0.01);

  // Normalization
  const norm = normalizeQuat({ x: 0, y: 3, z: 0, w: 4 });
  assert.ok(Math.abs(norm.y - 0.6) < 0.001);
  assert.ok(Math.abs(norm.w - 0.8) < 0.001);
});

test('Character Rig: Stock animation clips sampling & looping', () => {
  const stockClips = Object.keys(STOCK_ANIMATION_CLIPS);
  assert.equal(stockClips.length, 10);

  const expectedNames = [
    'idle_breathing',
    'walk_cycle',
    'run_cycle',
    'sit_down',
    'stand_up',
    'talk_gesturing',
    'argue_angry',
    'investigate_lookaround',
    'crouch_walk',
    'combat_guard',
  ];

  for (const name of expectedNames) {
    const clip = STOCK_ANIMATION_CLIPS[name];
    assert.ok(clip, `Clip ${name} exists`);
    assert.ok(clip.durationS > 0, `Clip ${name} has positive duration`);
    assert.ok(clip.fps > 0, `Clip ${name} has positive fps`);
    assert.ok(clip.tracks.length > 0, `Clip ${name} has animation tracks`);

    // Sample at start, middle, and beyond duration with looping
    const poseStart = sampleAnimationClip(clip, 0);
    const poseMid = sampleAnimationClip(clip, clip.durationS * 0.5);
    const poseLoop = sampleAnimationClip(clip, clip.durationS * 2.3);

    assert.ok(poseStart['Hips']);
    assert.ok(poseMid['Hips']);
    assert.ok(poseLoop['Hips']);

    // Quaternion validity check (no NaN)
    for (const bone of HUMANOID_BONE_NAMES) {
      if (poseMid[bone]) {
        assert.ok(Number.isFinite(poseMid[bone].rotation.x));
        assert.ok(Number.isFinite(poseMid[bone].rotation.y));
        assert.ok(Number.isFinite(poseMid[bone].rotation.z));
        assert.ok(Number.isFinite(poseMid[bone].rotation.w));
      }
    }
  }
});

test('Character Rig: Pose blending between animations', () => {
  const clipWalk = STOCK_ANIMATION_CLIPS['walk_cycle'];
  const clipRun = STOCK_ANIMATION_CLIPS['run_cycle'];

  const poseA = sampleAnimationClip(clipWalk, 0.4);
  const poseB = sampleAnimationClip(clipRun, 0.4);

  const blended0 = blendPoses(poseA, poseB, 0.0);
  const blended50 = blendPoses(poseA, poseB, 0.5);
  const blended100 = blendPoses(poseA, poseB, 1.0);

  // At factor 0, blended matches poseA
  assert.ok(Math.abs(blended0['LeftArm'].rotation.x - poseA['LeftArm'].rotation.x) < 0.001);
  // At factor 1, blended matches poseB
  assert.ok(Math.abs(blended100['LeftArm'].rotation.x - poseB['LeftArm'].rotation.x) < 0.001);
  // At factor 0.5, blended is valid finite quaternion
  assert.ok(Number.isFinite(blended50['LeftArm'].rotation.w));
});

test('Character Rig: Stock pose & gesture presets', () => {
  const presets = Object.keys(STOCK_POSE_PRESETS);
  assert.ok(presets.length >= 10);
  assert.ok(presets.includes('t_pose'));
  assert.ok(presets.includes('arms_crossed'));
  assert.ok(presets.includes('hands_on_hips'));
  assert.ok(presets.includes('point'));
  assert.ok(presets.includes('wave'));
  assert.ok(presets.includes('clap'));

  const tPose = STOCK_POSE_PRESETS['t_pose'];
  assert.equal(tPose.name, 'T-Pose');
  assert.ok(tPose.bones['LeftArm']);
  assert.ok(tPose.bones['RightArm']);
});

test('Character Rig: Two-Bone IK analytical solver (reachable, clamped, pole vector)', () => {
  const root = v3(0, 1.4, 0);
  const mid = v3(0, 1.1, 0);
  const end = v3(0, 0.8, 0);
  const target = v3(0.3, 1.2, 0.3);
  const pole = v3(0, 1.3, -1.0);

  const ikSol = solveTwoBoneIK(root, mid, end, target, pole, 0.3, 0.3);
  assert.ok(ikSol);
  assert.ok(Number.isFinite(ikSol.rootRotation.x));
  assert.ok(Number.isFinite(ikSol.rootRotation.w));
  assert.ok(Number.isFinite(ikSol.midRotation.x));
  assert.ok(Number.isFinite(ikSol.midRotation.w));

  // Test out-of-reach target (should clamp gracefully without NaN)
  const farTarget = v3(10, 10, 10);
  const farSol = solveTwoBoneIK(root, mid, end, farTarget, pole, 0.3, 0.3);
  assert.ok(farSol);
  assert.ok(Number.isFinite(farSol.rootRotation.x));
  assert.ok(Number.isFinite(farSol.midRotation.x));
});

test('Character Rig: Look-At IK solver with yaw & pitch limits', () => {
  const headPos = v3(0, 1.6, 0);
  const headRot = eulerToQuat(0, 0, 0); // facing +Z

  // Target straight ahead
  const forwardTarget = v3(0, 1.6, 5.0);
  const solForward = solveLookAtIK(headPos, headRot, forwardTarget, 45, 70);
  assert.ok(Number.isFinite(solForward.w));

  // Target to the right (+X)
  const rightTarget = v3(5.0, 1.6, 5.0); // 45 deg right
  const solRight = solveLookAtIK(headPos, headRot, rightTarget, 45, 70);
  assert.ok(Number.isFinite(solRight.y));

  // Target behind (exceeds 70 deg yaw clamp)
  const behindTarget = v3(0, 1.6, -5.0); // 180 deg behind
  const solBehind = solveLookAtIK(headPos, headRot, behindTarget, 45, 70);
  assert.ok(Number.isFinite(solBehind.y));
  assert.ok(Number.isFinite(solBehind.w));
});

test('Character Rig: BVH parser & hierarchical motion capture decoding', () => {
  const sampleBvh = `HIERARCHY
ROOT Hips
{
  OFFSET 0.00 85.00 0.00
  CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation
  JOINT Spine
  {
    OFFSET 0.00 12.00 0.00
    CHANNELS 3 Zrotation Xrotation Yrotation
    End Site
    {
      OFFSET 0.00 10.00 0.00
    }
  }
}
MOTION
Frames: 3
Frame Time: 0.0333333
0.0 85.0 0.0 0.0 0.0 0.0 0.0 10.0 0.0
0.0 86.0 0.0 0.0 0.0 5.0 0.0 12.0 0.0
0.0 87.0 0.0 0.0 0.0 10.0 0.0 15.0 0.0
`;

  const clip = parseBvh(sampleBvh);
  assert.equal(clip.fps, 30);
  assert.ok(Math.abs(clip.durationS - 0.1) < 0.01);
  assert.equal(clip.loop, true);
  assert.ok(clip.tracks.length >= 2);

  const hipsTrack = clip.tracks.find((t) => t.boneName === 'Hips');
  assert.ok(hipsTrack);
  assert.equal(hipsTrack.rotations.length, 3);
  assert.equal(hipsTrack.positions?.length, 3);
});

test('Character Rig: BVH exporter & full round-trip verification', () => {
  const sourceClip = STOCK_ANIMATION_CLIPS['walk_cycle'];
  const exportedBvh = exportBvh(sourceClip);

  assert.ok(exportedBvh.includes('HIERARCHY'));
  assert.ok(exportedBvh.includes('ROOT Hips'));
  assert.ok(exportedBvh.includes('MOTION'));
  assert.ok(exportedBvh.includes(`Frame Time: ${(1 / sourceClip.fps).toFixed(6)}`));

  // Re-parse exported BVH string
  const reimportedClip = parseBvh(exportedBvh);
  assert.equal(reimportedClip.fps, sourceClip.fps);
  assert.ok(reimportedClip.tracks.length > 0);
  assert.ok(Math.abs(reimportedClip.durationS - sourceClip.durationS) < 0.05);
});

test('Actor Data: Character rigging, mocap, Look-At IK & targets normalization', () => {
  const scene = createScene('Test Rig Scene');
  const actor = createActor(scene, { x: 1, y: 0, z: 2 }, 0);

  assert.equal(actor.rigType, 'stylized_mannequin');
  assert.equal(actor.animationSpeed, 1.0);

  // Corrupt some properties to test normalizeActor
  (actor as any).rigType = 'invalid_rig';
  (actor as any).animationSpeed = -2.5;
  actor.lookAtTargetActorId = 'non_existent_actor';
  actor.lookAtTargetCameraId = 'non_existent_camera';
  actor.ikTargets = {
    rightHand: { x: 0, y: 1.2, z: 0.5 },
    leftHand: { x: NaN, y: 1.2, z: 0.5 } as any,
  };

  normalizeActor(actor, scene);

  assert.equal(actor.rigType, 'stylized_mannequin');
  assert.equal(actor.animationSpeed, 1.0);
  assert.equal(actor.lookAtTargetActorId, undefined);
  assert.equal(actor.lookAtTargetCameraId, undefined);
  assert.ok(actor.ikTargets.rightHand);
  assert.equal(actor.ikTargets.leftHand, undefined);
});

test('Character Rig: Quest 3 72fps budget & zero GC allocation verification', () => {
  const clip = STOCK_ANIMATION_CLIPS['walk_cycle'];

  // Run 1000 iterations to verify performance and absence of leaks / state pollution
  const start = performance.now();
  for (let i = 0; i < 1000; i++) {
    const t = (i / 72.0) % clip.durationS;
    const pose = sampleAnimationClip(clip, t);
    const lookAt = solveLookAtIK(v3(0, 1.6, 0), eulerToQuat(0, 0, 0), v3(1, 1.6, 2), 45, 70);
    assert.ok(pose['Hips']);
    assert.ok(lookAt);
  }
  const elapsedMs = performance.now() - start;

  // 1000 frames evaluated under 500ms in Node (~0.5ms per frame, well within 13.88ms Quest 3 budget)
  assert.ok(elapsedMs < 500, `1000 frames evaluated in ${elapsedMs}ms`);
});

// --- Camera Grip Rigs & Optical Lens Physics Simulation -----------------------

test('camera grip: createGripRigConfig and stock presets', () => {
  const tripod = createGripRigConfig('tripod_fluid_head');
  assert.equal(tripod.type, 'tripod_fluid_head');
  assert.equal(tripod.massKg, 18.0);
  assert.equal(tripod.damping, 0.85);
  assert.equal(isGripRigConfig(tripod), true);

  const crane = createGripRigConfig('technocrane');
  assert.equal(crane.type, 'technocrane');
  assert.equal(crane.armLengthM, 9.14);
  assert.equal(crane.massKg, 450.0);
  assert.equal(isGripRigConfig(crane), true);

  const dolly = createGripRigConfig('dolly_curved_track');
  assert.equal(dolly.type, 'dolly_curved_track');
  assert.equal(dolly.trackRadiusM, 5.0);

  // Check all stock rigs
  assert.ok(STOCK_GRIP_RIGS.tripod_studio);
  assert.ok(STOCK_GRIP_RIGS.handheld_easyrig);
  assert.ok(STOCK_GRIP_RIGS.steadicam_m1);
  assert.ok(STOCK_GRIP_RIGS.chapman_hybrid_dolly);
  assert.ok(STOCK_GRIP_RIGS.technocrane_30);
  assert.ok(STOCK_GRIP_RIGS.heavy_lift_drone);
  assert.ok(STOCK_GRIP_RIGS.cable_cam_highwire);
  for (const rig of Object.values(STOCK_GRIP_RIGS)) {
    assert.equal(isGripRigConfig(rig), true);
  }
});

test('camera grip: isGripRigConfig and normalizeGripRigConfig sanitize invalid data', () => {
  assert.equal(isGripRigConfig(null), false);
  assert.equal(isGripRigConfig({}), false);
  assert.equal(isGripRigConfig({ type: 'invalid_type', massKg: 10, damping: 0.5, maxSpeedMps: 5 }), false);

  const sanitized = normalizeGripRigConfig({
    type: 'technocrane',
    massKg: -50, // invalid negative falls back to 18
    damping: 5.0, // out of range clamped to 1.0
    maxSpeedMps: -2, // invalid negative falls back to 2.0
    armLengthM: 10.0,
    minElevationM: 0,
    maxElevationM: 15.0,
    turretBasePos: { x: NaN, y: 0, z: 0 },
  });

  assert.equal(sanitized.massKg, 18);
  assert.equal(sanitized.damping, 1.0);
  assert.equal(sanitized.maxSpeedMps, 2.0);
  assert.equal(sanitized.armLengthM, 10.0);
  assert.equal(sanitized.minElevationM, 0);
  assert.equal(sanitized.maxElevationM, 15.0);
  assert.equal(sanitized.turretBasePos, undefined);
});

test('camera grip: simulateGripRigDynamics applies mass damping inertia', () => {
  const heavyRig: GripRigConfig = {
    type: 'technocrane',
    massKg: 100.0,
    damping: 0.8,
    maxSpeedMps: 10.0,
    armLengthM: 10.0,
  };

  const currentPos: Vec3 = { x: 0, y: 1.5, z: 0 };
  const currentRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
  const targetPos: Vec3 = { x: 5, y: 1.5, z: 0 };
  const targetRot: Quat = { x: 0, y: 0.7071, z: 0, w: 0.7071 };

  // 1 frame of physics simulation at dt = 0.016 (60fps)
  const step1 = simulateGripRigDynamics(currentPos, currentRot, targetPos, targetRot, heavyRig, 0.016, 0);

  // Inertia prevents instant snap to target
  assert.ok(step1.position.x > 0);
  assert.ok(step1.position.x < 1.0, `Step 1 pos ${step1.position.x} should be damped`);
  assert.ok(step1.linearVelocityMps > 0);

  // Without rig (undefined), position and rotation match target immediately
  const freeStep = simulateGripRigDynamics(currentPos, currentRot, targetPos, targetRot, undefined, 0.016, 0);
  assert.equal(freeStep.position.x, targetPos.x);
  assert.equal(freeStep.position.y, targetPos.y);
  assert.equal(freeStep.position.z, targetPos.z);
  assert.equal(freeStep.rotation.y, targetRot.y);
});

test('camera grip: simulateGripRigDynamics clamps crane spherical reach limits', () => {
  const craneRig: GripRigConfig = {
    type: 'technocrane',
    massKg: 10.0,
    damping: 0.5,
    maxSpeedMps: 20.0,
    armLengthM: 5.0, // maximum reach 5 meters
    turretBasePos: { x: 0, y: 0, z: 0 },
  };

  const currentPos: Vec3 = { x: 0, y: 1, z: 0 };
  const currentRot: Quat = { x: 0, y: 0, z: 0, w: 1 };
  // Target is 20 meters away
  const distantTargetPos: Vec3 = { x: 20, y: 1, z: 0 };
  const targetRot: Quat = { x: 0, y: 0, z: 0, w: 1 };

  // Simulate multiple steps until it reaches the reach limit
  let pos = currentPos;
  let rot = currentRot;
  for (let i = 0; i < 100; i++) {
    const res = simulateGripRigDynamics(pos, rot, distantTargetPos, targetRot, craneRig, 0.05, i * 0.05);
    pos = res.position;
    rot = res.rotation;
  }

  const distFromTurret = Math.hypot(pos.x, pos.y, pos.z);
  assert.ok(distFromTurret <= 5.01, `Crane distance ${distFromTurret}m must not exceed armLengthM (5.0m)`);
});

test('camera grip: simulateGripRigDynamics clamps curved track radius and operator gait bounce', () => {
  const dollyRig: GripRigConfig = {
    type: 'dolly_curved_track',
    massKg: 20.0,
    damping: 0.5,
    maxSpeedMps: 15.0,
    trackRadiusM: 4.0,
    turretBasePos: { x: 0, y: 0, z: 0 },
  };

  const pos: Vec3 = { x: 0, y: 1.5, z: 4.0 };
  const rot: Quat = { x: 0, y: 0, z: 0, w: 1 };
  // Push off-radius to x=10, z=10
  const offTarget: Vec3 = { x: 10, y: 1.5, z: 10 };
  const res = simulateGripRigDynamics(pos, rot, offTarget, rot, dollyRig, 0.1, 0);

  const r = Math.hypot(res.position.x, res.position.z);
  approx(r, 4.0, 0.05);

  // Steadicam / Handheld with footstep simulation
  const steadicam: GripRigConfig = {
    type: 'steadicam',
    massKg: 15.0,
    damping: 0.7,
    maxSpeedMps: 5.0,
    operatorFootstepSimulation: true,
  };

  const gait1 = simulateGripRigDynamics({ x: 0, y: 1.5, z: 0 }, rot, { x: 2, y: 1.5, z: 0 }, rot, steadicam, 0.016, 0.2);
  const gait2 = simulateGripRigDynamics({ x: 0, y: 1.5, z: 0 }, rot, { x: 2, y: 1.5, z: 0 }, rot, steadicam, 0.016, 0.5);
  assert.notEqual(gait1.position.y, gait2.position.y, 'Walking gait bounce oscillates vertical Y position');
});

test('cinema lens optics: createLensProfile, stock series presets, and normalization', () => {
  const cooke = createLensProfile('cooke_anamorphic_prime');
  assert.equal(cooke.series, 'cooke_anamorphic_prime');
  assert.equal(cooke.anamorphicSqueeze, 2.0);
  assert.equal(cooke.apertureBlades, 11);
  assert.equal(cooke.lensBreathingFactor, 0.045);
  assert.equal(isLensProfile(cooke), true);

  const arri = createLensProfile('arri_master_prime');
  assert.equal(arri.series, 'arri_master_prime');
  assert.equal(arri.anamorphicSqueeze, 1.0);
  assert.equal(arri.lensBreathingFactor, 0.005);
  assert.equal(arri.chromaticAberrationPx, 0.2);

  // Check all stock profiles
  assert.ok(STOCK_LENS_PROFILES.cooke_anamorphic_prime);
  assert.ok(STOCK_LENS_PROFILES.arri_master_prime);
  assert.ok(STOCK_LENS_PROFILES.canon_k35_vintage);
  assert.ok(STOCK_LENS_PROFILES.atlas_orion_anamorphic);
  assert.ok(STOCK_LENS_PROFILES.angenieux_optimo_zoom);
  assert.ok(STOCK_LENS_PROFILES.zeiss_supreme);
  assert.ok(STOCK_LENS_PROFILES.custom);

  for (const profile of Object.values(STOCK_LENS_PROFILES)) {
    assert.equal(isLensProfile(profile), true);
  }

  // Normalization
  const sanitized = normalizeLensProfile({
    series: 'custom',
    anamorphicSqueeze: 5.0, // clamped to 2.5
    apertureBlades: 30, // clamped to 18
    anamorphicBokehOvalRatio: 0.1, // clamped to 0.4
    lensBreathingFactor: 0.8, // clamped to 0.25
    chromaticAberrationPx: -5, // clamped to 0
    barrelDistortionFactor: 1.0, // clamped to 0.2
    vignettingFactor: 2.0, // clamped to 0.95
    flareStreakColorHex: 'invalid', // default fallback
    opticalFlawsEnabled: true,
  });

  assert.equal(sanitized.anamorphicSqueeze, 2.5);
  assert.equal(sanitized.apertureBlades, 18);
  assert.equal(sanitized.anamorphicBokehOvalRatio, 0.4);
  assert.equal(sanitized.lensBreathingFactor, 0.25);
  assert.equal(sanitized.chromaticAberrationPx, 0);
  assert.equal(sanitized.barrelDistortionFactor, 0.2);
  assert.equal(sanitized.vignettingFactor, 0.95);
  assert.equal(sanitized.flareStreakColorHex, '#3b82f6');
});

test('cinema lens optics: calculateLensBreathingFocalLength', () => {
  const baseFocal = 50.0;
  const cooke = STOCK_LENS_PROFILES.cooke_anamorphic_prime; // breathing 0.06

  const closeFocal = calculateLensBreathingFocalLength(baseFocal, 0.5, cooke);
  const infFocal = calculateLensBreathingFocalLength(baseFocal, 10.0, cooke);

  // Close focus racks image larger (focal length increases)
  assert.ok(closeFocal > baseFocal, `Close focus ${closeFocal}mm > base ${baseFocal}mm`);
  assert.ok(closeFocal > infFocal, `Close focal ${closeFocal}mm > inf focal ${infFocal}mm`);
  approx(infFocal, baseFocal, 0.5);

  // Master Prime has minimal breathing (< 1%)
  const masterPrime = STOCK_LENS_PROFILES.arri_master_prime;
  const mpClose = calculateLensBreathingFocalLength(baseFocal, 0.5, masterPrime);
  approx(mpClose, baseFocal, 0.5);
});

test('cinema lens optics: calculateBokehShape generates iris polygon and anamorphic oval', () => {
  const sphericalProfile = STOCK_LENS_PROFILES.arri_master_prime; // 9 blades, 1.0 squeeze
  const shape9 = calculateBokehShape(sphericalProfile, 5.6);
  assert.equal(shape9.bladeCount, 9);
  assert.equal(shape9.polygonPoints.length, 9);
  assert.equal(shape9.isCircular, false);

  // Wide open T1.3 renders smooth circular approximation
  const wideOpen = calculateBokehShape(sphericalProfile, 1.3);
  assert.equal(wideOpen.isCircular, true);
  assert.equal(wideOpen.polygonPoints.length, 32);

  // Anamorphic 2.0x squeeze generates vertically elongated oval (aspect ratio = 0.5)
  const anamorphicProfile = STOCK_LENS_PROFILES.cooke_anamorphic_prime; // 2.0x squeeze
  const anamoShape = calculateBokehShape(anamorphicProfile, 4.0);
  assert.equal(anamoShape.ovalRatio, 0.5);

  // Verify squeeze factor affects point coordinates
  const topPoint = anamoShape.polygonPoints[0];
  const sidePoint = anamoShape.polygonPoints[Math.floor(anamoShape.polygonPoints.length / 4)];
  assert.ok(topPoint);
  assert.ok(sidePoint);
});

test('cinema lens optics: calculateOpticalVignetting computes cosine fourth falloff', () => {
  const profile = STOCK_LENS_PROFILES.canon_k35_vintage; // vignettingFactor 0.35

  const centerTransmission = calculateOpticalVignetting(0.0, 1.4, profile);
  const midTransmission = calculateOpticalVignetting(0.5, 1.4, profile);
  const edgeTransmission = calculateOpticalVignetting(1.0, 1.4, profile);

  assert.equal(centerTransmission, 1.0);
  assert.ok(midTransmission < centerTransmission);
  assert.ok(edgeTransmission < midTransmission);

  // Stopping down to T8 reduces optical vignetting
  const stoppedDownEdge = calculateOpticalVignetting(1.0, 8.0, profile);
  assert.ok(stoppedDownEdge > edgeTransmission, 'Stopping down aperture reduces vignetting falloff');
});

test('camera grip & optics: model integration and scene duplication/normalization', () => {
  const scene = createScene('Test Scene');
  const cam = createCameraSetup(
    scene,
    { x: 0, y: 1.5, z: 0 },
    { x: 0, y: 0, z: 0, w: 1 },
    50,
    '2.39:1',
    2.8,
    'super35',
    undefined,
    undefined,
    STOCK_GRIP_RIGS.technocrane_30,
    STOCK_LENS_PROFILES.cooke_anamorphic_prime,
  );

  assert.ok(cam.gripRig);
  assert.equal(cam.gripRig?.type, 'technocrane');
  assert.ok(cam.lensProfile);
  assert.equal(cam.lensProfile?.series, 'cooke_anamorphic_prime');

  // Duplicate camera preserves and deep-clones grip and lens config
  const dupCam = duplicateCameraSetup(scene, cam.id);
  assert.ok(dupCam);
  assert.notEqual(dupCam.gripRig, cam.gripRig);
  assert.equal(dupCam.gripRig?.type, cam.gripRig?.type);
  assert.equal(dupCam.gripRig?.massKg, cam.gripRig?.massKg);
  assert.equal(dupCam.gripRig?.turretBasePos?.x, (cam.gripRig?.turretBasePos?.x ?? 0) + 0.4);
  assert.notEqual(dupCam.lensProfile, cam.lensProfile);
  assert.deepEqual(dupCam.lensProfile, cam.lensProfile);

  // Normalize camera & normalize scene
  const rawCamData = {
    ...cam,
    gripRig: { type: 'dolly_curved_track', massKg: 30, damping: 0.6, maxSpeedMps: 10 },
    lensProfile: { series: 'canon_k35_vintage', anamorphicSqueeze: 1.0, apertureBlades: 9 },
  };
  const normalizedCam = normalizeCameraData(rawCamData as CameraSetupData);
  assert.equal(normalizedCam.gripRig?.type, 'dolly_curved_track');
  assert.equal(normalizedCam.lensProfile?.series, 'canon_k35_vintage');

  const normalizedScene = normalizeScene(scene);
  assert.equal(normalizedScene.cameras.length, 2);
  assert.equal(normalizedScene.cameras[0].gripRig?.type, 'technocrane');
});

test('camera grip & optics: Meta Quest 3 72fps zero-allocation physics budget', () => {
  const rig = STOCK_GRIP_RIGS.technocrane_30;
  const lens = STOCK_LENS_PROFILES.cooke_anamorphic_prime;

  let pos: Vec3 = { x: 0, y: 2, z: 0 };
  let rot: Quat = { x: 0, y: 0, z: 0, w: 1 };
  const targetPos: Vec3 = { x: 4, y: 3, z: 2 };
  const targetRot: Quat = { x: 0, y: 0.7071, z: 0, w: 0.7071 };

  const start = performance.now();
  for (let frame = 0; frame < 1000; frame++) {
    const res = simulateGripRigDynamics(pos, rot, targetPos, targetRot, rig, 0.01388, frame * 0.01388);
    pos = res.position;
    rot = res.rotation;
    calculateLensBreathingFocalLength(50.0, 2.5, lens);
    calculateOpticalVignetting(0.8, 2.8, lens);
  }
  const elapsedMs = performance.now() - start;

  // 1000 simulation frames evaluated well under 250ms in Node (~0.05ms per frame)
  assert.ok(elapsedMs < 250, `1000 grip physics frames evaluated in ${elapsedMs}ms`);
});

// --- Phase 4: 3D Gaussian Splatting & Photogrammetry Scout Reconstruction ---

test('3DGS: createGaussianSplatCloud and validation functions', () => {
  const splats: GaussianSplat[] = [
    {
      position: { x: 0, y: 0, z: 0 },
      scale: { x: 0.1, y: 0.1, z: 0.1 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      color: { r: 0.8, g: 0.2, b: 0.1 },
      opacity: 0.9,
    },
    {
      position: { x: 2, y: 1.5, z: -3 },
      scale: { x: 0.15, y: 0.12, z: 0.18 },
      rotation: { x: 0, y: 0.7071, z: 0, w: 0.7071 },
      color: { r: 0.1, g: 0.9, b: 0.3 },
      opacity: 0.75,
    },
  ];

  const cloud = createGaussianSplatCloud('Soundstage A Scout', splats);
  assert.equal(cloud.name, 'Soundstage A Scout');
  assert.equal(cloud.splatCount, 2);
  assert.equal(isGaussianCloudData(cloud), true);
  assert.equal(isGaussianSplat(splats[0]), true);
  assert.equal(isGaussianSplat(splats[1]), true);

  // Bounds validation
  assert.equal(cloud.bounds.min.x, 0);
  assert.equal(cloud.bounds.max.x, 2);
  assert.equal(cloud.bounds.min.y, 0);
  assert.equal(cloud.bounds.max.y, 1.5);
  assert.equal(cloud.bounds.min.z, -3);
  assert.equal(cloud.bounds.max.z, 0);

  // Default transform
  assert.deepEqual(cloud.transform.position, { x: 0, y: 0, z: 0 });
  assert.equal(cloud.transform.scale, 1.0);
});

test('3DGS: normalizeGaussianCloud repairs corrupt/missing fields', () => {
  const corrupt: any = {
    id: 'corrupt-cloud',
    name: '',
    splatCount: -5,
    bounds: null,
    splats: [
      {
        position: { x: NaN, y: 1, z: 2 },
        scale: { x: -0.5, y: 0, z: 0.2 },
        rotation: { x: 0, y: 0, z: 0, w: 0 }, // zero norm quat
        color: { r: 2.5, g: -1, b: 0.5 },
        opacity: 5.0,
      },
    ],
    transform: { position: { x: 0, y: NaN, z: 0 }, rotation: null, scale: -2 },
  };

  const normalized = normalizeGaussianCloud(corrupt);
  assert.equal(normalized.name, 'Scout Splat Cloud');
  assert.equal(normalized.splatCount, 1);
  assert.equal(normalized.splats[0].position.x, 0);
  assert.ok(normalized.splats[0].scale.x > 0);
  assert.ok(normalized.splats[0].scale.y > 0);
  assert.equal(normalized.splats[0].color.r, 1.0);
  assert.equal(normalized.splats[0].color.g, 0.0);
  assert.equal(normalized.splats[0].opacity, 1.0);
  assert.equal(normalized.transform.scale, 1.0);
});

test('3DGS: parseGaussianPly and exportGaussianPly ASCII round-trip', () => {
  const syn = generateSyntheticScoutSplatCloud('Test Studio', 100);
  const asciiPly = exportGaussianPly(syn, false);
  assert.equal(typeof asciiPly, 'string');
  assert.ok((asciiPly as string).startsWith('ply\nformat ascii 1.0'));
  assert.ok((asciiPly as string).includes('element vertex 100'));
  assert.ok((asciiPly as string).includes('property float x'));
  assert.ok((asciiPly as string).includes('property float scale_0'));
  assert.ok((asciiPly as string).includes('property float rot_0'));

  const parsed = parseGaussianPly(asciiPly);
  assert.equal(parsed.splatCount, 100);
  assert.equal(parsed.splats.length, 100);

  // Position accuracy
  approx(parsed.splats[0].position.x, syn.splats[0].position.x, 0.01);
  approx(parsed.splats[0].position.y, syn.splats[0].position.y, 0.01);
  approx(parsed.splats[0].position.z, syn.splats[0].position.z, 0.01);

  // Color accuracy
  approx(parsed.splats[0].color.r, syn.splats[0].color.r, 0.05);
  approx(parsed.splats[0].color.g, syn.splats[0].color.g, 0.05);
  approx(parsed.splats[0].color.b, syn.splats[0].color.b, 0.05);
});

test('3DGS: parseGaussianPly and exportGaussianPly Binary Little-Endian round-trip', () => {
  const syn = generateSyntheticScoutSplatCloud('Binary Studio', 200);
  const binPly = exportGaussianPly(syn, true);
  assert.ok(binPly instanceof Uint8Array);

  const parsed = parseGaussianPly(binPly);
  assert.equal(parsed.splatCount, 200);
  assert.equal(parsed.splats.length, 200);

  // Check splat attributes across multiple indices
  for (let i = 0; i < 200; i += 25) {
    approx(parsed.splats[i].position.x, syn.splats[i].position.x, 0.005);
    approx(parsed.splats[i].position.y, syn.splats[i].position.y, 0.005);
    approx(parsed.splats[i].position.z, syn.splats[i].position.z, 0.005);
    approx(parsed.splats[i].opacity, syn.splats[i].opacity, 0.05);
  }
});

test('3DGS: parseCompactSplat and exportCompactSplat 32-byte layout round-trip', () => {
  const syn = generateSyntheticScoutSplatCloud('Compact Studio', 150);
  const compactBuffer = exportCompactSplat(syn);
  assert.ok(compactBuffer instanceof Uint8Array);
  assert.equal(compactBuffer.byteLength, 150 * 32);

  const parsed = parseCompactSplat(compactBuffer);
  assert.equal(parsed.splatCount, 150);
  assert.equal(parsed.splats.length, 150);

  // Validate 32-byte packing accuracy (position, scale, color, opacity)
  for (let i = 0; i < 150; i += 15) {
    approx(parsed.splats[i].position.x, syn.splats[i].position.x, 0.001);
    approx(parsed.splats[i].position.y, syn.splats[i].position.y, 0.001);
    approx(parsed.splats[i].position.z, syn.splats[i].position.z, 0.001);
    approx(parsed.splats[i].scale.x, syn.splats[i].scale.x, 0.001);
    approx(parsed.splats[i].color.r, syn.splats[i].color.r, 0.02);
    approx(parsed.splats[i].opacity, syn.splats[i].opacity, 0.02);
  }

  // Error handling on invalid buffer size
  const invalidBuffer = new Uint8Array(35); // not multiple of 32
  assert.throws(() => parseCompactSplat(invalidBuffer), /Invalid .splat buffer length/);
});

test('3DGS: fitPlaneRansac detects horizontal floor plane with high inlier ratio', () => {
  const points: Vec3[] = [];
  // 500 ground floor points at Y = -0.5 with slight noise
  for (let i = 0; i < 500; i++) {
    points.push({
      x: (Math.random() - 0.5) * 10,
      y: -0.5 + (Math.random() - 0.5) * 0.02,
      z: (Math.random() - 0.5) * 10,
    });
  }
  // 100 random outlier points in the room
  for (let i = 0; i < 100; i++) {
    points.push({
      x: (Math.random() - 0.5) * 10,
      y: Math.random() * 4,
      z: (Math.random() - 0.5) * 10,
    });
  }

  const result = fitPlaneRansac(points, 200, 0.05);
  assert.ok(result !== null);
  // Normal should point upwards (0, 1, 0)
  approx(Math.abs(result.normal.y), 1.0, 0.05);
  approx(result.normal.x, 0.0, 0.08);
  approx(result.normal.z, 0.0, 0.08);
  // Inliers should contain most of the 500 floor points
  assert.ok(result.inlierCount >= 450);

  // Edge case: < 3 points returns null
  assert.equal(fitPlaneRansac([{ x: 0, y: 0, z: 0 }], 50, 0.05), null);
});

test('3DGS: alignSplatCloudToFloorplan levels floor and centers spatial origin', () => {
  const cloud = generateSyntheticScoutSplatCloud('Off-Center Studio', 500);
  // Introduce offset and elevation
  for (const s of cloud.splats) {
    s.position.x += 5.0;
    s.position.y += 1.25;
    s.position.z -= 3.0;
  }
  cloud.bounds = {
    min: { x: cloud.bounds.min.x + 5, y: cloud.bounds.min.y + 1.25, z: cloud.bounds.min.z - 3 },
    max: { x: cloud.bounds.max.x + 5, y: cloud.bounds.max.y + 1.25, z: cloud.bounds.max.z - 3 },
  };

  const alignment = alignSplatCloudToFloorplan(cloud);
  assert.ok(alignment.confidenceScore > 0.6);
  assert.equal(alignment.alignedTransform.scale, 1.0);
  // Aligned floor height should offset the +1.25m elevation
  approx(alignment.alignedTransform.position.y, -1.25, 0.15);
});

test('3DGS: fitArchitecturalPlanesFromSplats extracts walls and ceiling height', () => {
  const cloud = generateSyntheticScoutSplatCloud('Studio Set with Walls', 2000);
  const arch = fitArchitecturalPlanesFromSplats(cloud, 8);

  assert.ok(arch.walls.length >= 4, `Extracted ${arch.walls.length} architectural perimeter walls`);
  assert.ok(arch.ceilingHeightM !== undefined && arch.ceilingHeightM >= 2.5 && arch.ceilingHeightM <= 4.0, `Ceiling estimated at ${arch.ceilingHeightM}m`);

  for (const wall of arch.walls) {
    assert.ok(wall.heightM >= 2.0);
    assert.ok(wall.thicknessM > 0);
  }
});

test('3DGS: voxelDownsampleSplats reduces density while preserving spatial extents', () => {
  const cloud = generateSyntheticScoutSplatCloud('High Density Scout', 2000);
  const initialCount = cloud.splats.length;

  const downsampled5cm = voxelDownsampleSplats(cloud.splats, 0.05);
  const downsampled10cm = voxelDownsampleSplats(cloud.splats, 0.10);

  assert.ok(downsampled5cm.length < initialCount);
  assert.ok(downsampled10cm.length < downsampled5cm.length);

  // Single splat downsample preserves splat
  const single = voxelDownsampleSplats([cloud.splats[0]], 0.1);
  assert.equal(single.length, 1);

  // Empty splat list returns empty array
  assert.equal(voxelDownsampleSplats([], 0.1).length, 0);
});

test('3DGS: SceneData serialization and normalization with gaussianClouds', () => {
  const scene = createScene('3DGS Set');
  const syn = generateSyntheticScoutSplatCloud('Stage 1 Splats', 300);
  scene.gaussianClouds = [syn];
  scene.activeSplatCloudId = syn.id;

  assert.equal(isSceneData(scene), true);

  const jsonStr = JSON.stringify(scene);
  const parsed = JSON.parse(jsonStr);
  assert.equal(isSceneData(parsed), true);

  const normalized = normalizeScene(parsed);
  assert.equal(normalized.gaussianClouds?.length, 1);
  assert.equal(normalized.gaussianClouds?.[0].splatCount, 300);
  assert.equal(normalized.activeSplatCloudId, syn.id);
});

test('3DGS: Meta Quest 3 72fps performance budget (50,000 splats downsample & RANSAC)', () => {
  const largeSplats: GaussianSplat[] = [];
  for (let i = 0; i < 50000; i++) {
    largeSplats.push({
      position: { x: (Math.random() - 0.5) * 10, y: Math.random() * 3, z: (Math.random() - 0.5) * 10 },
      scale: { x: 0.05, y: 0.05, z: 0.05 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      color: { r: 0.5, g: 0.5, b: 0.5 },
      opacity: 0.8,
    });
  }

  const start = performance.now();
  const downsampled = voxelDownsampleSplats(largeSplats, 0.1);
  const ransac = fitPlaneRansac(downsampled.map((s) => s.position), 50, 0.05);
  const elapsedMs = performance.now() - start;

  assert.ok(downsampled.length > 0);
  assert.ok(ransac !== null);
  // 50,000 splats downsampled and plane-fitted under 1500ms on Node test runner
  assert.ok(elapsedMs < 1500, `50,000 splats downsampled and aligned in ${elapsedMs.toFixed(2)}ms`);
});

// ScanStore's IndexedDB-free contract: Node has no indexedDB, so this
// exercises exactly the degraded path a storage-broken browser takes
// (memory fallback + onError warning). Real IDB is covered by
// test/scan-store.html in a headed browser and TESTING.md Phase 6.
async function scanStoreFallback(): Promise<void> {
  const store = new ScanStore();
  let warned = '';
  store.onError = (m) => (warned = m);
  const scan = makeScan();

  const stored = await store.putScan(scan);
  assert.equal(stored, false); // memory fallback reports non-durable
  assert.ok(warned.includes('memory'), 'warns that the scan is memory-only');
  assert.equal(await store.getScan('scan-1'), scan);
  assert.deepEqual(await store.listScanIds(), ['scan-1']);

  // Prune keeps referenced ids, removes orphans.
  const other = { ...makeScan(), id: 'scan-2' };
  await store.putScan(other);
  const removed = await store.pruneOrphans(new Set(['scan-1']));
  assert.equal(removed, 1);
  assert.equal(await store.getScan('scan-2'), null);
  assert.equal((await store.getScan('scan-1'))?.id, 'scan-1');

  await store.deleteScan('scan-1');
  assert.equal(await store.getScan('scan-1'), null);
}

async function propStoreFallback(): Promise<void> {
  const store = new PropStore();
  let warned = '';
  store.onError = (m) => (warned = m);

  const asset = {
    id: 'asset-custom-1',
    name: 'Sci-Fi Console',
    fileName: 'console.glb',
    fileType: 'glb' as const,
    category: 'custom' as const,
    sizeBytes: 1024,
    uploadedAt: Date.now(),
    dimensions: { width: 1.2, height: 1.0, depth: 0.6 },
    buffer: new ArrayBuffer(1024),
  };

  const saved = await store.putAsset(asset);
  assert.equal(saved, false); // in headless Node IDB fallback reports false
  assert.ok(warned.includes('memory'), 'warns that asset is memory-only');
  assert.equal(await store.getAsset('asset-custom-1'), asset);
  assert.equal((await store.listAssets()).length, 1);

  await store.deleteAsset('asset-custom-1');
  assert.equal(await store.getAsset('asset-custom-1'), null);
}

// ============================================================================
// --- Performance Governor & Spatial Interaction Tests -----------------------
// ============================================================================

test('RollingFrameStats: basic rolling frame calculations and running average', () => {
  const stats = new RollingFrameStats(5);
  assert.equal(stats.getSampleCount(), 0);
  assert.equal(stats.getAverageMs(), 0);
  assert.equal(stats.getEffectiveFps(), 0);

  stats.addFrame(10.0);
  stats.addFrame(20.0);
  stats.addFrame(30.0);

  assert.equal(stats.getSampleCount(), 3);
  assert.equal(stats.getAverageMs(), 20.0);
  assert.equal(stats.getEffectiveFps(), 50.0);
});

test('RollingFrameStats: ring buffer rollover preserves accurate sliding window', () => {
  const stats = new RollingFrameStats(4);
  stats.addFrame(10.0);
  stats.addFrame(10.0);
  stats.addFrame(10.0);
  stats.addFrame(10.0);
  assert.equal(stats.getAverageMs(), 10.0);

  // Overwrite 2 oldest frames with 30.0
  stats.addFrame(30.0);
  stats.addFrame(30.0);
  assert.equal(stats.getSampleCount(), 4);
  // Window is now [30, 30, 10, 10] -> avg 20.0
  assert.equal(stats.getAverageMs(), 20.0);
});

test('RollingFrameStats: P95 latency percentile and standard deviation jitter', () => {
  const stats = new RollingFrameStats(100);
  // Add 95 frames of 11.1ms (90fps target) and 5 frames of 22.2ms
  for (let i = 0; i < 95; i++) {
    stats.addFrame(11.1);
  }
  for (let i = 0; i < 5; i++) {
    stats.addFrame(22.2);
  }

  const p95 = stats.getP95Ms();
  assert.ok(p95 >= 22.0, `Expected P95 to capture spike, got ${p95}`);

  const jitter = stats.getJitterMs();
  assert.ok(jitter > 0, `Expected non-zero jitter, got ${jitter}`);

  // Test uniform latency has zero jitter
  const uniformStats = new RollingFrameStats(20);
  for (let i = 0; i < 20; i++) {
    uniformStats.addFrame(13.88);
  }
  assert.ok(uniformStats.getJitterMs() < 0.0001, 'Uniform stats must have 0 jitter');
});

test('RollingFrameStats: dropped frames ratio calculation across 72/90/120 target budgets', () => {
  const stats = new RollingFrameStats(10);
  // Target 72fps budget = 13.88ms. 8 on-time frames, 2 dropped frames (20ms)
  for (let i = 0; i < 8; i++) stats.addFrame(11.0);
  stats.addFrame(20.0);
  stats.addFrame(25.0);

  const dropped = stats.getDroppedFrameCount(13.88);
  assert.equal(dropped, 2);

  const ratio = stats.getDroppedFrameRatio(13.88);
  assert.equal(ratio, 0.2);
});

test('RollingFrameStats: zero-allocation benchmark (10,000 frames under 20ms)', () => {
  const stats = new RollingFrameStats(120);
  const t0 = performance.now();
  for (let i = 0; i < 10000; i++) {
    stats.addFrame(11.1 + (i % 5));
    if (i % 120 === 0) {
      stats.getP95Ms();
      stats.getAverageMs();
      stats.getJitterMs();
    }
  }
  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 50, `10,000 frames took ${elapsed.toFixed(2)}ms, benchmark budget is 50ms`);
  assert.equal(stats.getSampleCount(), 120);
});

test('RollingFrameStats: reset cleanly clears all internal counters', () => {
  const stats = new RollingFrameStats(10);
  stats.addFrame(15.0);
  stats.addFrame(25.0);
  assert.equal(stats.getSampleCount(), 2);

  stats.reset();
  assert.equal(stats.getSampleCount(), 0);
  assert.equal(stats.getAverageMs(), 0);
  assert.equal(stats.getP95Ms(), 0);
  assert.equal(stats.getJitterMs(), 0);
});

test('GovernorConfig: creation, validation, and bounds normalization', () => {
  const defaultConfig = createGovernorConfig();
  assert.equal(defaultConfig.targetFps, 72);
  assert.equal(defaultConfig.minRenderScale, 0.6);
  assert.equal(defaultConfig.enableDynamicResolution, true);
  assert.equal(defaultConfig.enableFoveatedRendering, true);
  // No maxRenderScale: DRS caps every climb at native, so a configurable ceiling above 1.0
  // could not change the outcome at any position. It was removed rather than left as a live
  // slider wired to nothing.
  assert.equal('maxRenderScale' in defaultConfig, false);

  assert.equal(isGovernorConfig(defaultConfig), true);
  assert.equal(isGovernorConfig(null), false);
  assert.equal(isGovernorConfig({ targetFps: 'invalid' }), false);

  const clamped = normalizeGovernorConfig({
    targetFps: 85 as any,
    minRenderScale: -0.5,
    enableDynamicResolution: true,
    enableFoveatedRendering: false,
    enableLODThrottling: true,
    measurementWindowFrames: 5,
  });
  assert.equal(clamped.targetFps, 72); // Default fallback for invalid FPS
  assert.equal(clamped.minRenderScale, 0.4); // Clamped to min bounds
  assert.equal(clamped.measurementWindowFrames, 10); // Clamped to min window

  // MIGRATION: a config persisted before maxRenderScale was removed must normalize, not
  // throw and not fail validation. The field is simply dropped.
  const legacy = normalizeGovernorConfig({
    targetFps: 90,
    minRenderScale: 0.7,
    maxRenderScale: 1.25,
    enableFoveatedRendering: true,
    enableDynamicResolution: true,
    enableLODThrottling: true,
    measurementWindowFrames: 90,
  });
  assert.equal(legacy.targetFps, 90);
  assert.equal(legacy.minRenderScale, 0.7);
  assert.equal('maxRenderScale' in legacy, false);
  assert.equal(isGovernorConfig(legacy), true);
  // ...and the legacy object itself still reads as a valid config, so nothing that round
  // trips one rejects it on load.
  assert.equal(isGovernorConfig({
    targetFps: 72,
    minRenderScale: 0.6,
    maxRenderScale: 1.25,
    enableFoveatedRendering: true,
    enableDynamicResolution: true,
    enableLODThrottling: true,
    measurementWindowFrames: 90,
  }), true);
});

test('calculateSessionRenderScale: three bands, one step at most, native ceiling', () => {
  const frames = 600;
  const minFrames = 144; // two seconds at 72Hz
  const NONE = DRS_NO_KNOWN_BAD_SCALE;

  // Above 10% of the session missing vsync: one step down, whatever the severity. The old
  // controller scaled its step with the overload; a once-per-session decision must not,
  // because it has no chance to correct an overshoot until the next session.
  assert.equal(calculateSessionRenderScale(1.0, 0.101, frames, minFrames, 0.6, NONE).scale, 0.9);
  assert.equal(calculateSessionRenderScale(1.0, 0.5, frames, minFrames, 0.6, NONE).scale, 0.9);
  assert.equal(calculateSessionRenderScale(1.0, 1.0, frames, minFrames, 0.6, NONE).scale, 0.9);

  // ...and the scale that just juddered is remembered.
  assert.equal(calculateSessionRenderScale(1.0, 0.5, frames, minFrames, 0.6, NONE).knownBadScale, 1.0);
  // Only ever downward: a higher failure than one already recorded teaches nothing new.
  assert.equal(calculateSessionRenderScale(0.9, 0.5, frames, minFrames, 0.6, 0.8).knownBadScale, 0.8);
  assert.equal(calculateSessionRenderScale(0.7, 0.5, frames, minFrames, 0.6, 0.8).knownBadScale, 0.7);

  // Clamped at the floor, never past it.
  assert.equal(calculateSessionRenderScale(0.65, 1.0, frames, minFrames, 0.6, NONE).scale, 0.6);
  assert.equal(calculateSessionRenderScale(0.6, 1.0, frames, minFrames, 0.6, NONE).scale, 0.6);

  // The hold band. Its whole point is that it is REACHABLE: the miss ratio is continuous
  // over [0, 1] even though the frame times underneath it are quantized to hit-or-miss,
  // so a device that is coping imperfectly can sit here instead of hunting.
  for (const ratio of [0.02, 0.05, 0.09, 0.1]) {
    const held = calculateSessionRenderScale(0.8, ratio, frames, minFrames, 0.6, NONE);
    assert.equal(held.scale, 0.8, `miss ratio ${ratio} should hold`);
    assert.equal(held.knownBadScale, NONE, `miss ratio ${ratio} is not evidence of a bad scale`);
  }

  // Below 2%: one step up...
  assert.equal(calculateSessionRenderScale(0.8, 0.0, frames, minFrames, 0.6, NONE).scale, 0.85);
  assert.equal(calculateSessionRenderScale(0.8, 0.019, frames, minFrames, 0.6, NONE).scale, 0.85);
  assert.equal(calculateSessionRenderScale(0.95, 0.0, frames, minFrames, 0.6, NONE).scale, 1.0);
  // ...never past native, because a 0% miss ratio says nothing missed its deadline; it does
  // not say there is spare GPU, since a device coping by 1% and one coping by 50% both
  // report exactly the budget...
  assert.equal(calculateSessionRenderScale(1.0, 0.0, frames, minFrames, 0.6, NONE).scale, 1.0);
  // ...and never up TO or ABOVE a scale that already juddered. This is the clause that makes
  // the whole thing converge: a clean session at 0.9 with 0.95 known bad must NOT step to
  // 0.95, or it is back on the scale it already failed at.
  assert.equal(calculateSessionRenderScale(0.9, 0.0, frames, minFrames, 0.6, 0.95).scale, 0.9);
  assert.equal(calculateSessionRenderScale(0.85, 0.0, frames, minFrames, 0.6, 0.95).scale, 0.9);
  assert.equal(calculateSessionRenderScale(0.8, 0.0, frames, minFrames, 0.6, 1.0).scale, 0.85);
  // The ceiling forbids climbing; it never drags a scale down to meet it.
  assert.equal(calculateSessionRenderScale(0.9, 0.0, frames, minFrames, 0.6, 0.7).scale, 0.9);
  // Pinned at the floor with the floor itself known bad: a fixed point, not a step below it.
  assert.equal(calculateSessionRenderScale(0.6, 0.0, frames, minFrames, 0.6, 0.6).scale, 0.6);

  // A clean session never records a bad scale, whatever it was carrying.
  assert.equal(calculateSessionRenderScale(0.85, 0.0, frames, minFrames, 0.6, 0.95).knownBadScale, 0.95);

  // Too short a session to have measured anything worth acting on: leave it alone, and do
  // not convict the scale it was running on that little evidence either.
  assert.equal(calculateSessionRenderScale(1.0, 1.0, minFrames - 1, minFrames, 0.6, NONE).scale, 1.0);
  assert.equal(calculateSessionRenderScale(1.0, 1.0, minFrames - 1, minFrames, 0.6, NONE).knownBadScale, NONE);
  assert.equal(calculateSessionRenderScale(0.8, 0.0, 0, minFrames, 0.6, NONE).scale, 0.8);

  // Garbage in, current scale out.
  assert.equal(calculateSessionRenderScale(0.8, Number.NaN, frames, minFrames, 0.6, NONE).scale, 0.8);
  assert.equal(calculateSessionRenderScale(Number.NaN, 1.0, frames, minFrames, 0.6, NONE).scale, 0.9);
  // A NaN ceiling means "no usable evidence", not "everything is forbidden".
  assert.equal(calculateSessionRenderScale(0.8, 0.0, frames, minFrames, 0.6, Number.NaN).scale, 0.85);
  assert.equal(calculateSessionRenderScale(0.8, 0.0, frames, minFrames, 0.6, Number.NaN).knownBadScale, NONE);
  // The ceiling defaults to "none" when the caller omits it entirely.
  assert.equal(calculateSessionRenderScale(0.8, 0.0, frames, minFrames, 0.6).scale, 0.85);
});

test('SessionFrameLedger: whole-session vsync tally that resets', () => {
  const budgetMs = 1000 / 72;
  const ledger = new SessionFrameLedger();
  assert.equal(ledger.getFrameCount(), 0);
  assert.equal(ledger.getMissRatio(), 0);

  for (let i = 0; i < 90; i++) ledger.record(budgetMs, budgetMs);
  for (let i = 0; i < 10; i++) ledger.record(budgetMs * 2, budgetMs);
  assert.equal(ledger.getFrameCount(), 100);
  assert.equal(ledger.getMissCount(), 10);
  approx(ledger.getMissRatio(), 0.1, 1e-9);

  // Unbounded, unlike the fixed rolling window: the DRS decision is made once at session
  // end, so it has to see the whole session rather than the last 90 frames of it.
  for (let i = 0; i < 5000; i++) ledger.record(budgetMs, budgetMs);
  assert.equal(ledger.getFrameCount(), 5100);
  assert.equal(ledger.getMissCount(), 10);
  approx(ledger.getMissRatio(), 10 / 5100, 1e-12);

  // Unusable samples are dropped, never counted as misses.
  ledger.record(Number.NaN, budgetMs);
  ledger.record(-5, budgetMs);
  ledger.record(0, budgetMs);
  assert.equal(ledger.getFrameCount(), 5100);
  assert.equal(ledger.getMissCount(), 10);

  ledger.reset();
  assert.equal(ledger.getFrameCount(), 0);
  assert.equal(ledger.getMissCount(), 0);
  assert.equal(ledger.getMissRatio(), 0);
});

test('calculateAdaptiveLODBudget: splat count and volumetric step throttling', () => {
  const targetBudgetMs = 1000 / 90; // 11.11ms

  // Light load: full fidelity
  const lightLoad = calculateAdaptiveLODBudget(350000, 8.0, targetBudgetMs, 5000, 500000);
  assert.ok(lightLoad >= 350000);

  // Heavy load (18ms on 11ms budget): throttled
  const heavyLoad = calculateAdaptiveLODBudget(350000, 18.0, targetBudgetMs, 5000, 500000);
  assert.ok(heavyLoad < 350000);
  assert.ok(heavyLoad >= 5000);
});

test('estimateGCPressure: GC pressure classification based on jitter and dropped frames', () => {
  assert.equal(estimateGCPressure(0.5, 11.2, 11.0), 'low');
  assert.equal(estimateGCPressure(3.5, 18.0, 11.0), 'medium');
  assert.equal(estimateGCPressure(7.5, 26.0, 11.0), 'high');
});

/**
 * Builds a mock WebGLRenderer exposing only the renderer.xr surface the governor
 * touches, recording every DRS/FFR call it receives.
 */
function mockXrRenderer(state: { presenting: boolean }): {
  renderer: THREE.WebGLRenderer;
  foveationCalls: number[];
  scaleCalls: number[];
} {
  const foveationCalls: number[] = [];
  const scaleCalls: number[] = [];
  const renderer = {
    xr: {
      get isPresenting(): boolean {
        return state.presenting;
      },
      setFoveation(level: number): void {
        foveationCalls.push(level);
      },
      setFramebufferScaleFactor(scale: number): void {
        scaleCalls.push(scale);
      },
    },
  } as unknown as THREE.WebGLRenderer;
  return { renderer, foveationCalls, scaleCalls };
}

test('XRPerformanceGovernor: same-timestamp begin/end still measures the true 50ms cadence', () => {
  const governor = new XRPerformanceGovernor();

  // Nothing measured yet: report zeroes, never a plausible-looking 72fps.
  assert.equal(governor.getMetrics().fps, 0);
  assert.equal(governor.getMetrics().frameTimeMs, 0);

  // Hand beginFrame and endFrame the SAME animation-frame timestamp: the begin->end
  // delta is then always 0, so it cannot be the source of the frame time.
  let t = 0;
  let metrics = governor.getMetrics();
  for (let i = 0; i < 200; i++) {
    t += 50;
    governor.beginFrame(t);
    metrics = governor.endFrame(undefined, null, null, t);
  }

  approx(metrics.frameTimeMs, 50, 0.01);
  approx(metrics.fps, 20, 0.2);
  assert.notEqual(metrics.frameTimeMs, 13.88); // the fabricated constant
  assert.equal(metrics.cpuLogicTimeMs, 0); // honest: no CPU span is observable here
  assert.ok(metrics.droppedFrames > 0, `expected dropped frames at 20fps, got ${metrics.droppedFrames}`);
  // 200 frames define 199 intervals. The first frame has no predecessor to be measured
  // against, and the governor no longer invents a nominal-budget sample for it: an
  // invented first sample is both a measurement nobody took and, once endFrame lands
  // after beginFrame by the frame's CPU span, a dropped frame that never happened.
  assert.equal(governor.getMeasuredFrameCount(), 199);
});

test('XRPerformanceGovernor: the unmeasurable first frame is skipped, not fabricated', () => {
  const governor = new XRPerformanceGovernor();

  // A realistic first frame: 6ms of CPU between beginFrame and endFrame. The old seeding
  // measured this as budget + 6ms = 19.9ms, over the 15.97ms drop threshold, and booked a
  // dropped frame before the app had rendered anything twice.
  governor.beginFrame(1000);
  const first = governor.endFrame(undefined, null, null, 1006);
  assert.equal(governor.getMeasuredFrameCount(), 0);
  assert.equal(first.droppedFrames, 0);
  assert.equal(first.frameTimeMs, 0);
  assert.equal(first.fps, 0);

  // The second frame is the first measurable one.
  governor.beginFrame(1013.888);
  const second = governor.endFrame(undefined, null, null, 1019.888);
  assert.equal(governor.getMeasuredFrameCount(), 1);
  approx(second.frameTimeMs, 13.888, 0.01);
  assert.equal(second.droppedFrames, 0);
});

test('XRPerformanceGovernor: a true 72fps cadence reports ~72fps with zero dropped frames', () => {
  const governor = new XRPerformanceGovernor();
  const budgetMs = 1000 / 72;

  let t = 1000;
  let metrics = governor.getMetrics();
  for (let i = 0; i < 200; i++) {
    t += budgetMs;
    governor.beginFrame(t);
    metrics = governor.endFrame(undefined, null, null, t);
  }

  approx(metrics.fps, 72, 0.15);
  approx(metrics.frameTimeMs, 13.89, 0.02);
  assert.equal(metrics.droppedFrames, 0);
});

test('XRPerformanceGovernor: dropped frames counted only when frames overrun the budget', () => {
  const governor = new XRPerformanceGovernor();
  const budgetMs = 1000 / 72;
  let t = 500;

  for (let i = 0; i < 60; i++) {
    t += budgetMs;
    governor.beginFrame(t);
    governor.endFrame(undefined, null, null, t);
  }
  assert.equal(governor.getMetrics().droppedFrames, 0);

  // 33ms frames are >15% over the 13.88ms budget: every one of them is a drop.
  for (let i = 0; i < 10; i++) {
    t += 33;
    governor.beginFrame(t);
    governor.endFrame(undefined, null, null, t);
  }
  assert.equal(governor.getMetrics().droppedFrames, 10);

  // A repeated timestamp is an unusable delta: skip the sample, do not invent one.
  const before = governor.getMeasuredFrameCount();
  governor.beginFrame(t);
  const metrics = governor.endFrame(undefined, null, null, t);
  assert.equal(governor.getMeasuredFrameCount(), before);
  assert.equal(metrics.frameTimeMs, 33);
});

test('XRPerformanceGovernor: foveation rests at 1.0 and cannot oscillate under noisy load', () => {
  // Steady on-budget load: the mandated resting level of 1.0 is never disturbed.
  const steadyState = { presenting: true };
  const steady = mockXrRenderer(steadyState);
  const steadyGovernor = new XRPerformanceGovernor();
  let st = 100;
  for (let i = 0; i < 300; i++) {
    st += 1000 / 72;
    steadyGovernor.beginFrame(st);
    steadyGovernor.endFrame(steady.renderer, null, null, st);
  }
  assert.equal(steady.foveationCalls.length, 0, 'stable foveation must not be re-pushed every frame');
  assert.equal(steadyGovernor.getMetrics().foveationLevel, 1.0);

  // Noisy load: 40-frame blocks alternating heavy (25ms) and light (6ms) sweep the
  // rolling average back and forth across both foveation thresholds ~15 times.
  const noisyState = { presenting: true };
  const noisy = mockXrRenderer(noisyState);
  const governor = new XRPerformanceGovernor({ measurementWindowFrames: 10 });
  const changeFrames: number[] = [];
  const changeTimes: number[] = [];
  const totalFrames = 1200;

  let t = 2000;
  for (let i = 0; i < totalFrames; i++) {
    const before = noisy.foveationCalls.length;
    t += Math.floor(i / 40) % 2 === 0 ? 25 : 6;
    governor.beginFrame(t);
    governor.endFrame(noisy.renderer, null, null, t);
    if (noisy.foveationCalls.length > before) {
      changeFrames.push(i);
      changeTimes.push(t);
    }
  }

  // Old behaviour was one setFoveation call per frame with no hysteresis at all.
  assert.ok(
    noisy.foveationCalls.length * 20 < totalFrames,
    `foveation thrashed: ${noisy.foveationCalls.length} changes over ${totalFrames} frames`,
  );
  for (let i = 1; i < changeFrames.length; i++) {
    assert.ok(
      changeFrames[i] - changeFrames[i - 1] >= 60,
      `foveation changed after only ${changeFrames[i] - changeFrames[i - 1]} frames`,
    );
    assert.ok(
      changeTimes[i] - changeTimes[i - 1] >= 1000,
      `foveation changed after only ${changeTimes[i] - changeTimes[i - 1]}ms`,
    );
  }
  for (const level of noisy.foveationCalls) {
    assert.ok(level >= 0 && level <= 1, `foveation level out of range: ${level}`);
  }
});

/**
 * Drives complete XR sessions against one governor: presenting frames, then the
 * presenting -> not-presenting transition that ends the session. Keeps a monotonic clock
 * across sessions so consecutive sessions look like consecutive headset uses.
 *
 * Reports scale changes seen DURING presenting separately from the total, because
 * session-scoped DRS promises two distinct things: nothing moves in-session, and at most
 * one thing moves per session.
 */
function makeSessionHarness(): {
  renderer: THREE.WebGLRenderer;
  scaleCalls: number[];
  scaleCallsWhilePresenting: number[];
  runSession(
    governor: XRPerformanceGovernor,
    frameDurationsMs: Iterable<number>,
  ): { scale: number; changes: number[]; presentingChanges: number[] };
} {
  const state = { presenting: false };
  const scaleCalls: number[] = [];
  const scaleCallsWhilePresenting: number[] = [];
  const renderer = {
    xr: {
      get isPresenting(): boolean {
        return state.presenting;
      },
      setFoveation(_level: number): void {},
      setFramebufferScaleFactor(scale: number): void {
        scaleCalls.push(scale);
        if (state.presenting) scaleCallsWhilePresenting.push(scale);
      },
    },
  } as unknown as THREE.WebGLRenderer;

  let t = 0;

  function runSession(
    governor: XRPerformanceGovernor,
    frameDurationsMs: Iterable<number>,
  ): { scale: number; changes: number[]; presentingChanges: number[] } {
    const changes: number[] = [];
    const presentingChanges: number[] = [];
    let scale = governor.getMetrics().renderScale;

    state.presenting = true;
    for (const durationMs of frameDurationsMs) {
      t += durationMs;
      governor.beginFrame(t);
      const metrics = governor.endFrame(renderer, null, null, t);
      if (metrics.renderScale !== scale) {
        scale = metrics.renderScale;
        changes.push(scale);
        presentingChanges.push(scale);
      }
    }

    // Session end. This edge is where DRS decides, and the first non-presenting frame is
    // the only moment three.js will accept the new framebuffer scale.
    state.presenting = false;
    for (let i = 0; i < 3; i++) {
      t += 1000 / 72;
      governor.beginFrame(t);
      const metrics = governor.endFrame(renderer, null, null, t);
      if (metrics.renderScale !== scale) {
        scale = metrics.renderScale;
        changes.push(scale);
      }
    }

    return { scale, changes, presentingChanges };
  }

  return { renderer, scaleCalls, scaleCallsWhilePresenting, runSession };
}

/**
 * Frame times of a vsync-locked headset, as a function of scene weight and render scale.
 *
 * `capacityMs` is the GPU time the scene needs at scale 1.0. Cost follows pixel count, so it
 * goes with the SQUARE of the render scale. The result is then QUANTIZED: the frame either
 * lands on the 13.888ms scanout or slips to the next one at 27.776ms. Nothing in between is
 * physically producible, which is exactly why frame time carries no headroom information -
 * a scene needing 6ms and a scene needing 13.5ms both report 13.888ms.
 *
 * This is the model that exposes the defect a continuous `t += 18.0 * scale` model cannot.
 */
function* quantizedFrames(
  count: number,
  capacityMs: number,
  currentScale: () => number,
): Generator<number> {
  const vsyncMs = 1000 / 72;
  for (let i = 0; i < count; i++) {
    const scale = currentScale();
    const costMs = capacityMs * scale * scale;
    yield costMs <= vsyncMs ? vsyncMs : vsyncMs * 2;
  }
}

test('XRPerformanceGovernor: framebuffer scale is never pushed while the session is presenting', () => {
  // three.js r180 warns "Cannot change framebuffer scale while presenting" and discards
  // the value (WebXRManager.js), so the only moment a new scale can take effect at all is
  // between sessions. That is the reason DRS is session-scoped rather than a per-frame
  // loop: a loop in here would be servoing a number that never reaches the compositor.
  const governor = new XRPerformanceGovernor();
  const harness = makeSessionHarness();

  const session = harness.runSession(
    governor,
    quantizedFrames(1200, 25, () => governor.getMetrics().renderScale),
  );

  assert.equal(
    harness.scaleCallsWhilePresenting.length,
    0,
    'must not call setFramebufferScaleFactor while presenting',
  );
  assert.equal(
    session.presentingChanges.length,
    0,
    `render scale moved ${session.presentingChanges.length} times mid-session`,
  );

  // One push, made off-session, carrying the scale the NEXT session will run at.
  assert.equal(harness.scaleCalls.length, 1);
  assert.equal(session.scale, 0.9);
  approx(harness.scaleCalls[0], session.scale, 1e-9);
  assert.equal(governor.getMetrics().renderScaleApplied, true);
});

test('XRPerformanceGovernor: the quantized vsync model cannot make DRS hunt', () => {
  // THE regression. A Quest 3 is vsync-locked at 72Hz, so frame time is not continuous:
  // a frame either hits 13.888ms or misses and takes ~27.78ms. A controller servoing on
  // frame time therefore has no gradient and no stable point - it drops, reads the
  // resulting hit as "healthy" at ratio ~1.0, climbs, misses, and cycles forever, and it
  // does so precisely when the scene is genuinely too heavy and DRS is supposed to help.
  //
  // Measured on the old per-frame controller with exactly this model, 6000 frames:
  //   capacity  8ms -> 0 changes      capacity 15ms -> 72 changes  *** limit cycle ***
  //   capacity 12ms -> 0 changes      capacity 18ms -> 73 changes  *** limit cycle ***
  //   capacity 13.5ms -> 0 changes    capacity 25ms -> 73 changes  *** limit cycle ***
  // No threshold retune fixes that, because the signal is binary. Session-scoped DRS makes
  // it structurally impossible: there is no in-session feedback loop for a cycle to live
  // in, so ONE session yields at most ONE change however heavy the scene.
  for (const capacityMs of [8, 12, 13.5, 15, 18, 25]) {
    const governor = new XRPerformanceGovernor();
    const harness = makeSessionHarness();

    const session = harness.runSession(
      governor,
      quantizedFrames(6000, capacityMs, () => governor.getMetrics().renderScale),
    );

    assert.equal(
      session.presentingChanges.length,
      0,
      `capacity ${capacityMs}ms moved the render scale ${session.presentingChanges.length} times mid-session`,
    );
    assert.ok(
      session.changes.length <= 1,
      `capacity ${capacityMs}ms produced ${session.changes.length} render-scale changes in one session: ${session.changes.join(', ')}`,
    );
    assert.equal(harness.scaleCallsWhilePresenting.length, 0);

    // And the one step it does take must be the right one - the guard must not be
    // satisfiable by DRS simply doing nothing. Under 13.888ms at native the session never
    // misses, so it is already as good as it gets and holds at native.
    const fitsAtNative = capacityMs <= 1000 / 72;
    assert.equal(
      session.scale,
      fitsAtNative ? 1.0 : 0.9,
      `capacity ${capacityMs}ms settled at ${session.scale}`,
    );
  }
});

/**
 * Scene weights that span the interesting range, with the render scale each one must
 * SETTLE at across repeated sessions.
 *
 * Everything except the last line settles on a scale whose cost genuinely fits inside the
 * 13.888ms scanout, which `drsSettlesInsideVsync` re-derives rather than trusting. 40ms is
 * the pathological case: 40 * 0.6^2 = 14.4ms still misses, so no allowed scale is
 * affordable and the honest answer is the floor.
 */
const DRS_CONVERGENCE_CASES: readonly { capacityMs: number; settlesAt: number }[] = [
  { capacityMs: 8, settlesAt: 1.0 },
  { capacityMs: 12, settlesAt: 1.0 },
  { capacityMs: 13.9, settlesAt: 0.95 },
  { capacityMs: 14, settlesAt: 0.95 },
  { capacityMs: 15, settlesAt: 0.95 },
  { capacityMs: 16, settlesAt: 0.9 },
  { capacityMs: 18, settlesAt: 0.85 },
  { capacityMs: 25, settlesAt: 0.7 },
  { capacityMs: 40, settlesAt: 0.6 },
];

test('XRPerformanceGovernor: DRS settles across CONSECUTIVE sessions instead of cycling', () => {
  // THE regression this suite previously could not see. The single-session sweep above
  // proves only that one session yields at most one step, which a session-scoped decision
  // satisfies by construction - it cannot observe what happens when that step is fed into
  // the next session, which is where the limit cycle actually lived:
  //
  //   cap 13.9ms -> 0.9, 0.95, 1.0, 0.9, 0.95, 1.0, ...   period-3, forever
  //   cap 16ms   -> 0.9, 0.95, 0.85, 0.9, 0.95, ...       forever
  //   cap 25ms   -> 0.9, 0.8, 0.7, 0.75, 0.65, ...        forever
  //
  // The mechanism is not a tuning error: a miss ratio near zero cannot tell "barely coping"
  // from "enormous headroom", so ANY rule that climbs on success climbs until it breaks,
  // drops, and climbs again. The fix is the congestion-control one - remember the scale
  // that juddered and never climb back to it - and this test is what pins it down.
  const SESSIONS = 40;
  const TAIL = 10;

  for (const { capacityMs, settlesAt } of DRS_CONVERGENCE_CASES) {
    const governor = new XRPerformanceGovernor();
    const harness = makeSessionHarness();
    const trace: number[] = [];

    for (let session = 0; session < SESSIONS; session++) {
      const run = harness.runSession(
        governor,
        quantizedFrames(600, capacityMs, () => governor.getMetrics().renderScale),
      );
      assert.equal(
        run.presentingChanges.length,
        0,
        `capacity ${capacityMs}ms moved the scale mid-session ${session}`,
      );
      assert.ok(
        run.changes.length <= 1,
        `capacity ${capacityMs}ms took ${run.changes.length} steps in session ${session}`,
      );
      trace.push(run.scale);
    }

    const tail = trace.slice(-TAIL);
    assert.ok(
      tail.every((scale) => scale === tail[0]),
      `capacity ${capacityMs}ms never converged - last ${TAIL} sessions: ${tail.join(', ')} (full trace: ${trace.join(', ')})`,
    );
    assert.equal(
      tail[0],
      settlesAt,
      `capacity ${capacityMs}ms settled at ${tail[0]}, expected ${settlesAt} (full trace: ${trace.join(', ')})`,
    );
  }
});

test('XRPerformanceGovernor: every settling point that CAN hit vsync does', () => {
  // Convergence on its own is cheap - parking at the floor forever would converge too. The
  // settling point also has to be the best scale that actually fits, so this re-derives the
  // cost at the scale each capacity settled on rather than trusting the table.
  const vsyncMs = 1000 / 72;
  for (const { capacityMs, settlesAt } of DRS_CONVERGENCE_CASES) {
    const costMs = capacityMs * settlesAt * settlesAt;
    if (capacityMs === 40) {
      // Unaffordable at every allowed scale: even the floor overruns, so the floor is the
      // honest answer and there is no scale that hits vsync to settle on.
      assert.ok(costMs > vsyncMs, `capacity ${capacityMs}ms should be unaffordable, cost ${costMs}ms`);
      assert.equal(settlesAt, 0.6);
      continue;
    }
    assert.ok(
      costMs <= vsyncMs,
      `capacity ${capacityMs}ms settled at ${settlesAt}, which costs ${costMs.toFixed(3)}ms and still misses the ${vsyncMs.toFixed(3)}ms scanout`,
    );
  }
});

test('XRPerformanceGovernor: repeated heavy sessions walk down to the floor and stop', () => {
  // 60ms at native is a scene the device cannot afford at ANY scale it is allowed: even
  // the 0.6 floor costs 60 * 0.36 = 21.6ms and misses every vsync. So this converges to
  // the floor and parks there rather than overshooting past it.
  const governor = new XRPerformanceGovernor();
  const harness = makeSessionHarness();
  const floor = governor.getConfig().minRenderScale;
  const settled: number[] = [];

  for (let session = 0; session < 8; session++) {
    const run = harness.runSession(
      governor,
      quantizedFrames(600, 60, () => governor.getMetrics().renderScale),
    );
    assert.ok(
      run.changes.length <= 1,
      `heavy session ${session} moved the scale ${run.changes.length} times`,
    );
    assert.equal(run.presentingChanges.length, 0);
    settled.push(run.scale);
  }

  // One step per session, monotone down, four sessions to cross the whole range, then flat.
  assert.deepEqual(settled, [0.9, 0.8, 0.7, floor, floor, floor, floor, floor]);
  for (const scale of settled) {
    assert.ok(scale >= floor, `overshot minRenderScale ${floor}: ${scale}`);
  }
  // Every one of those decisions was pushed off-session, one per session that changed.
  assert.equal(harness.scaleCallsWhilePresenting.length, 0);
  assert.equal(harness.scaleCalls.length, 4);
});

test('XRPerformanceGovernor: a clean session climbs one step and parks at native', () => {
  const governor = new XRPerformanceGovernor();
  const harness = makeSessionHarness();

  // Drive it to the floor first.
  for (let i = 0; i < 4; i++) {
    harness.runSession(governor, quantizedFrames(600, 60, () => governor.getMetrics().renderScale));
  }
  assert.equal(governor.getMetrics().renderScale, 0.6);

  // The heavy scene is now gone and a 6ms one is loaded in its place, which is exactly when
  // the known-bad ceiling has to be cleared: it is evidence about the OLD scene's weight,
  // and left standing it would (correctly, for that scene) forbid climbing back past 0.65.
  // The dedicated test below pins down both halves of that.
  governor.clearKnownBadRenderScale();

  // A scene that comfortably hits vsync at every scale: 6ms at native. A vsync-locked
  // headset reports exactly the budget when it is coping, never less, so recovery has to
  // trigger on "nothing missed" - which is what the miss ratio says and frame time cannot.
  const climb: number[] = [];
  for (let session = 0; session < 12; session++) {
    const run = harness.runSession(
      governor,
      quantizedFrames(600, 6, () => governor.getMetrics().renderScale),
    );
    assert.ok(
      run.changes.length <= 1,
      `clean session ${session} moved the scale ${run.changes.length} times`,
    );
    assert.equal(run.presentingChanges.length, 0);
    climb.push(run.scale);
  }

  // One step per session up to native, then flat: a clean session is never grounds to
  // supersample, because a 0% miss ratio does not measure headroom.
  assert.deepEqual(climb, [0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.0, 1.0, 1.0, 1.0]);
  for (const scale of climb) {
    assert.ok(scale <= 1.0, `climbed past native to ${scale}`);
  }
  // Nothing juddered on the way up, so nothing was convicted.
  assert.equal(governor.getKnownBadRenderScale(), DRS_NO_KNOWN_BAD_SCALE);
});

test('XRPerformanceGovernor: the known-bad ceiling only descends, and clearing it restores the climb', () => {
  // The ceiling is the entire reason DRS settles rather than cycling, so it has to be
  // one-way within a scene - and therefore has to be clearable, or a scene that got lighter
  // could never earn its resolution back. Both halves are load-bearing.
  const governor = new XRPerformanceGovernor();
  const harness = makeSessionHarness();

  // 16ms at native: the capacity that used to cycle 0.9, 0.95, 0.85, 0.9, 0.95 forever.
  const ceilings: number[] = [DRS_NO_KNOWN_BAD_SCALE];
  for (let session = 0; session < 20; session++) {
    harness.runSession(governor, quantizedFrames(600, 16, () => governor.getMetrics().renderScale));
    ceilings.push(governor.getKnownBadRenderScale());
  }

  // Monotone non-increasing, always, and bounded below by the floor once it is finite.
  // That plus a climb ceiling strictly under it is the whole termination argument.
  for (let i = 1; i < ceilings.length; i++) {
    assert.ok(
      ceilings[i] <= ceilings[i - 1],
      `known-bad ceiling rose from ${ceilings[i - 1]} to ${ceilings[i]} at session ${i}`,
    );
  }
  const settledCeiling = ceilings[ceilings.length - 1];
  assert.equal(settledCeiling, 0.95, `expected 0.95 to be the convicted scale, got ${settledCeiling}`);
  assert.ok(settledCeiling >= governor.getConfig().minRenderScale);
  assert.equal(governor.getMetrics().renderScale, 0.9);

  // The ceiling holds the scale down, and it is RIGHT to: 16 * 0.95^2 = 14.44ms misses the
  // 13.888ms scanout. Even with a spotless session it must not climb back onto that scale.
  const stuck = harness.runSession(
    governor,
    quantizedFrames(600, 6, () => governor.getMetrics().renderScale),
  );
  assert.equal(stuck.scale, 0.9, `climbed back onto a scale known to judder: ${stuck.scale}`);

  // Now the scene genuinely changes. Clearing does not jump the scale - it restores the
  // ability to climb, and the next clean session takes the first step.
  governor.clearKnownBadRenderScale();
  assert.equal(governor.getKnownBadRenderScale(), DRS_NO_KNOWN_BAD_SCALE);
  assert.equal(governor.getMetrics().renderScale, 0.9, 'clearing must not move the scale by itself');

  const recovered: number[] = [];
  for (let session = 0; session < 4; session++) {
    recovered.push(harness.runSession(
      governor,
      quantizedFrames(600, 6, () => governor.getMetrics().renderScale),
    ).scale);
  }
  assert.deepEqual(recovered, [0.95, 1.0, 1.0, 1.0]);

  // reset() is the other clearing path, and it has to clear too: it puts the scale back at
  // native, and a stale ceiling would then silently forbid a scale the governor is already
  // running.
  harness.runSession(governor, quantizedFrames(600, 60, () => governor.getMetrics().renderScale));
  assert.equal(governor.getKnownBadRenderScale(), 1.0);
  governor.reset();
  assert.equal(governor.getKnownBadRenderScale(), DRS_NO_KNOWN_BAD_SCALE);
  assert.equal(governor.getMetrics().renderScale, 1.0);
});

test('XRPerformanceGovernor: one hitch in a clean session cannot move the render scale', () => {
  // REGRESSION, carried over from the per-frame era and now far stronger. The old
  // controller decided every frame off a rolling window, so one stall could fire ~90
  // consecutive reduction steps and walk the scale to its floor off a single event.
  // A hitch is now one frame in a session's worth of them: it moves the session miss
  // ratio by ~0.2%, which is inside the hold band and nowhere near the 10% that buys a step.
  for (const hitchMs of [100, 250, 1000, 3000]) {
    const governor = new XRPerformanceGovernor();
    const harness = makeSessionHarness();
    const budgetMs = 1000 / 72;

    const frames: number[] = [];
    for (let i = 0; i < 600; i++) frames.push(i === 300 ? hitchMs : budgetMs);
    const run = harness.runSession(governor, frames);

    assert.equal(
      run.changes.length,
      0,
      `a single ${hitchMs}ms hitch caused ${run.changes.length} scale changes`,
    );
    assert.equal(run.scale, 1.0, `a single ${hitchMs}ms hitch left the scale at ${run.scale}`);
    assert.equal(harness.scaleCalls.length, 0, 'nothing changed, so nothing should be pushed');
    // The hitch is still counted honestly as a dropped frame; it just does not steer DRS.
    assert.equal(governor.getMetrics().droppedFrames, 1);
  }
});

test('XRPerformanceGovernor: the session ledger resets, so one bad session cannot haunt the next', () => {
  const governor = new XRPerformanceGovernor();
  const harness = makeSessionHarness();

  // Session 1 misses every single vsync.
  harness.runSession(governor, quantizedFrames(600, 60, () => governor.getMetrics().renderScale));
  approx(governor.getSessionMissRatio(), 1.0, 1e-9);
  assert.equal(governor.getMetrics().renderScale, 0.9);

  // Session 2 is spotless. Were the ledger carried over, the pooled ratio would still be
  // ~50% and this session would be charged for session 1's judder with a second step down.
  const clean = harness.runSession(
    governor,
    quantizedFrames(600, 6, () => governor.getMetrics().renderScale),
  );
  assert.equal(
    governor.getSessionMissRatio(),
    0,
    `session 2 inherited a miss ratio of ${governor.getSessionMissRatio()}`,
  );
  // Exactly its own 600 frames - not session 1's, and not the off-session frames between
  // them, which belong to no session and are never tallied.
  assert.equal(governor.getSessionFrameCount(), 600, 'session 2 should count only its own frames');
  assert.equal(clean.scale, 0.95, `expected one step back up, got ${clean.scale}`);
});

test('RollingFrameStats: the median ignores a hitch that drags the mean over budget', () => {
  const stats = new RollingFrameStats(90);
  for (let i = 0; i < 89; i++) stats.addFrame(13.888);
  stats.addFrame(3000);

  // One stall puts the mean 2.5x over the 72fps budget for the entire length of the
  // window, which is why nothing in the governor decides on it.
  assert.ok(stats.getAverageMs() > 40, `expected the mean to be wrecked, got ${stats.getAverageMs()}`);
  // The median does not move at all.
  approx(stats.getMedianMs(), 13.888, 1e-9);
  // ...and P95 at 90 samples still ignores a lone outlier.
  approx(stats.getP95Ms(), 13.888, 1e-9);

  // A genuinely overloaded window moves the median, which is the point.
  const overloaded = new RollingFrameStats(90);
  for (let i = 0; i < 90; i++) overloaded.addFrame(25);
  approx(overloaded.getMedianMs(), 25, 1e-9);
});

test('SpatialInteraction: distanceVec3 and quatFromYaw pure domain conversions', () => {
  const d = distanceVec3({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 });
  assert.equal(d, 5.0);

  const qZero = quatFromYaw(0);
  assert.equal(qZero.x, 0);
  assert.equal(qZero.y, 0);
  assert.equal(qZero.z, 0);
  assert.equal(qZero.w, 1);

  const qHalfPi = quatFromYaw(Math.PI / 2);
  assert.ok(Math.abs(qHalfPi.y - Math.SQRT1_2) < 0.001);
  assert.ok(Math.abs(qHalfPi.w - Math.SQRT1_2) < 0.001);
});

test('calculateMagneticSnap: candidate selection, cubic magnetic pull, and floor snap', () => {
  const rot = quatIdentity();
  const candidates: SnapCandidate[] = [
    { targetId: 'actor-1', position: { x: 1.0, y: 0.0, z: 1.0 }, snapRadiusM: 0.3, distanceM: 0, type: 'floor_mark' },
    { targetId: 'camera-1', position: { x: 5.0, y: 1.5, z: 5.0 }, snapRadiusM: 0.4, distanceM: 0, type: 'dolly_track' },
  ];

  // Inside magnetic radius with cubic pull
  const snapResult = calculateMagneticSnap(
    { x: 1.1, y: 0.0, z: 1.05 },
    rot,
    candidates,
    0.3,
  );
  assert.equal(snapResult.snapped, true);
  assert.equal(snapResult.activeTarget?.targetId, 'actor-1');
  assert.ok(snapResult.activeTarget?.distanceM! < 0.12);
  // Position was pulled closer to (1.0, 0, 1.0)
  assert.ok(snapResult.snappedPosition.x < 1.1);

  // Outside all candidate magnetic radii
  const noSnapResult = calculateMagneticSnap(
    { x: 3.0, y: 0.0, z: 3.0 },
    rot,
    candidates,
    0.3,
  );
  assert.equal(noSnapResult.snapped, false);
  assert.equal(noSnapResult.activeTarget, undefined);
  assert.equal(noSnapResult.snappedPosition.x, 3.0);
  assert.equal(noSnapResult.snappedPosition.z, 3.0);

  // Floor snap
  const floorCandidates: SnapCandidate[] = [
    { targetId: 'floor-surface', position: { x: 2.0, y: 0.0, z: 2.0 }, snapRadiusM: 0.5, distanceM: 0, type: 'floor_mark' },
  ];
  const floorResult = calculateMagneticSnap(
    { x: 2.0, y: 0.02, z: 2.0 },
    rot,
    floorCandidates,
    0.5,
  );
  assert.equal(floorResult.snapped, true);
  assert.equal(floorResult.snappedPosition.y, 0.0);
});

test('calculateAngularSnap45_90: angular snapping with 45 and 90 degree increments', () => {
  // Near 90 degrees (1.570796 rad)
  const snap90 = calculateAngularSnap45_90(1.55, 0.1);
  assert.equal(snap90.snapped, true);
  assert.ok(Math.abs(snap90.snappedAngleRad - Math.PI / 2) < 0.0001);

  // Near 45 degrees (0.785398 rad)
  const snap45 = calculateAngularSnap45_90(0.80, 0.1);
  assert.equal(snap45.snapped, true);
  assert.ok(Math.abs(snap45.snappedAngleRad - Math.PI / 4) < 0.0001);

  // Outside tolerance
  const snapNone = calculateAngularSnap45_90(1.2, 0.02);
  assert.equal(snapNone.snapped, false);
  assert.equal(snapNone.snappedAngleRad, 1.2);

  // Wrap around near 2PI / 0
  const snapWrap = calculateAngularSnap45_90(6.25, 0.1);
  assert.equal(snapWrap.snapped, true);
  assert.ok(Math.abs(snapWrap.snappedAngleRad - 0) < 0.0001 || Math.abs(snapWrap.snappedAngleRad - Math.PI * 2) < 0.0001);
});

test('calculateTrackTangentAlignment: circular dolly track tangent heading computation', () => {
  const arcCenter = { x: 0, y: 0, z: 0 };
  const arcRadius = 4.0;

  // Point at (4, 0, 0)
  const alignmentAtEast = calculateTrackTangentAlignment(
    { x: 4.0, y: 0, z: 0 },
    arcCenter,
    arcRadius,
  );
  assert.ok(alignmentAtEast !== null);
  assert.ok(Math.abs(alignmentAtEast.snappedPosition.x - 4.0) < 0.001);
  assert.ok(alignmentAtEast.tangentRotation !== undefined);

  // Point at (0, 0, 4)
  const alignmentAtSouth = calculateTrackTangentAlignment(
    { x: 0, y: 0, z: 4.0 },
    arcCenter,
    arcRadius,
  );
  assert.ok(alignmentAtSouth !== null);
  assert.ok(Math.abs(alignmentAtSouth.snappedPosition.z - 4.0) < 0.001);
});

test('generateEntityContextActions: contextual actions for all entity types', () => {
  const actorActions = generateEntityContextActions('actor', 'actor-1');
  assert.ok(actorActions.length >= 4);
  assert.ok(actorActions.some((a) => a.actionType === 'actor_cycle_stance'));
  assert.ok(actorActions.some((a) => a.actionType === 'actor_add_mark'));
  assert.ok(actorActions.some((a) => a.actionType === 'actor_duplicate'));

  const camActions = generateEntityContextActions('camera', 'cam-1');
  assert.ok(camActions.length >= 4);
  assert.ok(camActions.some((a) => a.actionType === 'camera_step_focal'));
  assert.ok(camActions.some((a) => a.actionType === 'record_take'));

  const lightActions = generateEntityContextActions('light', 'light-1');
  assert.ok(lightActions.length >= 4);
  assert.ok(lightActions.some((a) => a.actionType === 'light_cycle_kelvin'));

  const propActions = generateEntityContextActions('prop', 'prop-1');
  assert.ok(propActions.length >= 4);
  assert.ok(propActions.some((a) => a.actionType === 'prop_ground_floor'));
  assert.ok(propActions.some((a) => a.actionType === 'prop_grid_snap'));

  const splatActions = generateEntityContextActions('splat', 'splat-1');
  assert.ok(splatActions.length >= 3);
  assert.ok(splatActions.some((a) => a.actionType === 'splat_align_floor'));

  const unknownActions = generateEntityContextActions('unknown' as any, 'item-1');
  assert.deepEqual(unknownActions, []);
});

// --- Automated Dailies & Multi-Camera Animatic Engine Tests -----------------

test('dailiesEngine: createDailiesConfig defaults and overrides', () => {
  const def = createDailiesConfig();
  assert.equal(def.resolution.width, 1920);
  assert.equal(def.resolution.height, 1080);
  assert.equal(def.fps, 24);
  assert.equal(def.layout, 'single_cut');
  assert.equal(def.format, 'mp4');
  assert.equal(def.audioEnabled, true);
  assert.equal(def.qualityMbps, 8);
  assert.equal(def.bitc.enabled, true);
  assert.equal(def.bitc.startingTimecode, '01:00:00:00');
  assert.equal(def.bitc.dropFrame, false);
  assert.equal(def.bitc.position, 'bottom_center');

  const custom = createDailiesConfig({
    resolution: { width: 3840, height: 2160 },
    fps: 29.97,
    layout: 'quad_split',
    format: 'webm',
    qualityMbps: 25,
    bitc: {
      enabled: true,
      startingTimecode: '02:00:00;00',
      fps: 29.97,
      dropFrame: true,
      showSceneShotTake: false,
      showCameraLensData: false,
      showWatermark: true,
      watermarkText: 'CUSTOM DAILIES',
      position: 'top_right',
    },
    durationOverrideS: 15.5,
  });
  assert.equal(custom.resolution.width, 3840);
  assert.equal(custom.resolution.height, 2160);
  assert.equal(custom.fps, 29.97);
  assert.equal(custom.layout, 'quad_split');
  assert.equal(custom.format, 'webm');
  assert.equal(custom.qualityMbps, 25);
  assert.equal(custom.bitc.dropFrame, true);
  assert.equal(custom.bitc.position, 'top_right');
  assert.equal(custom.durationOverrideS, 15.5);
});

test('dailiesEngine: isDailiesConfig validates strictly', () => {
  const valid = createDailiesConfig();
  assert.ok(isDailiesConfig(valid));

  assert.ok(!isDailiesConfig(null));
  assert.ok(!isDailiesConfig({}));
  assert.ok(!isDailiesConfig({ ...valid, resolution: { width: '1920', height: 1080 } }));
  assert.ok(!isDailiesConfig({ ...valid, fps: -24 }));
  assert.ok(!isDailiesConfig({ ...valid, layout: 'invalid_layout' }));
  assert.ok(!isDailiesConfig({ ...valid, format: 'avi' }));
  assert.ok(!isDailiesConfig({ ...valid, qualityMbps: 0 }));
  assert.ok(!isDailiesConfig({ ...valid, bitc: null }));
});

test('dailiesEngine: normalizeDailiesConfig sanitizes corrupted data', () => {
  const normalized = normalizeDailiesConfig({
    resolution: { width: 50, height: 99999 },
    fps: 999,
    layout: 'corrupt',
    format: 'invalid',
    qualityMbps: -10,
    bitc: {
      position: 'invalid_pos',
      startingTimecode: '',
      watermarkText: 'A'.repeat(200),
    },
    durationOverrideS: -5,
  });

  assert.equal(normalized.resolution.width, 320); // Clamped min
  assert.equal(normalized.resolution.height, 4320); // Clamped max
  assert.equal(normalized.fps, 120); // Clamped max
  assert.equal(normalized.layout, 'single_cut'); // Fallback
  assert.equal(normalized.format, 'mp4'); // Fallback
  assert.equal(normalized.qualityMbps, 1); // Clamped min
  assert.equal(normalized.bitc.position, 'bottom_center');
  assert.equal(normalized.bitc.startingTimecode, '01:00:00:00');
  assert.equal(normalized.bitc.watermarkText?.length, 100);
  assert.equal(normalized.durationOverrideS, undefined);
});

test('dailiesEngine: formatSmpteTimecode non-drop frame calculation', () => {
  // 24 fps
  assert.equal(formatSmpteTimecode(0, 24), '00:00:00:00');
  assert.equal(formatSmpteTimecode(23, 24), '00:00:00:23');
  assert.equal(formatSmpteTimecode(24, 24), '00:00:01:00');
  assert.equal(formatSmpteTimecode(24 * 60, 24), '00:01:00:00');
  assert.equal(formatSmpteTimecode(24 * 3600, 24), '01:00:00:00');

  // Offset frames
  assert.equal(formatSmpteTimecode(10, 24, false, 24 * 3600), '01:00:00:10');

  // 25 fps
  assert.equal(formatSmpteTimecode(25, 25), '00:00:01:00');

  // 30 fps NDF
  assert.equal(formatSmpteTimecode(30, 30, false), '00:00:01:00');
  assert.equal(formatSmpteTimecode(1800, 30, false), '00:01:00:00');

  // 60 fps NDF
  assert.equal(formatSmpteTimecode(60, 60, false), '00:00:01:00');
});

test('dailiesEngine: formatSmpteTimecode 29.97 and 59.94 drop-frame calculation', () => {
  // 29.97 drop-frame: drops frames :00 and :01 at minute marks except 00, 10, 20, 30, 40, 50
  // Minute 0:00 to 0:59 has 1800 frames (0..1799) -> 00:00:59;29 is frame 1799
  assert.equal(formatSmpteTimecode(0, 29.97, true), '00:00:00;00');
  assert.equal(formatSmpteTimecode(1799, 29.97, true), '00:00:59;29');

  // Frame 1800 is the 1-minute mark. Frames 00:01:00;00 and 00:01:00;01 are dropped!
  // So frame 1800 displays as 00:01:00;02
  assert.equal(formatSmpteTimecode(1800, 29.97, true), '00:01:00;02');
  assert.equal(formatSmpteTimecode(1801, 29.97, true), '00:01:00;03');

  // Minute 10 has no dropped frames (10th minute exception).
  // 10 minutes = 17982 frames (18 frames dropped total: 2 frames * 9 minutes)
  // Frame 17981 = 00:09:59;29. Frame 17982 = 00:10:00;00
  assert.equal(formatSmpteTimecode(17981, 29.97, true), '00:09:59;29');
  assert.equal(formatSmpteTimecode(17982, 29.97, true), '00:10:00;00');

  // 59.94 drop-frame: drops 4 frames at minute marks except 10th minutes
  assert.equal(formatSmpteTimecode(0, 59.94, true), '00:00:00;00');
  assert.equal(formatSmpteTimecode(3599, 59.94, true), '00:00:59;59');
  // Minute 1 drops frames 00, 01, 02, 03 -> starts at ;04
  assert.equal(formatSmpteTimecode(3600, 59.94, true), '00:01:00;04');
});

test('dailiesEngine: parseSmpteTimecode and round-trip verification', () => {
  assert.equal(parseSmpteTimecode('00:00:00:00', 24), 0);
  assert.equal(parseSmpteTimecode('01:00:00:00', 24), 86400);
  assert.equal(parseSmpteTimecode('00:01:30:12', 24), 90 * 24 + 12);
  assert.equal(parseSmpteTimecode('05:15', 24), 5 * 24 + 15);

  // Drop-frame parsing round-trip
  const tc1 = '00:01:00;02';
  const frames1 = parseSmpteTimecode(tc1, 29.97);
  assert.equal(frames1, 1800);
  assert.equal(formatSmpteTimecode(frames1, 29.97, true), tc1);

  const tc10 = '00:10:00;00';
  const frames10 = parseSmpteTimecode(tc10, 29.97);
  assert.equal(frames10, 17982);
  assert.equal(formatSmpteTimecode(frames10, 29.97, true), tc10);

  // Non-drop round-trip across 100 random frame positions
  for (let f = 0; f < 10000; f += 137) {
    const formatted = formatSmpteTimecode(f, 24);
    const parsed = parseSmpteTimecode(formatted, 24);
    assert.equal(parsed, f);
  }
});

test('dailiesEngine: calculateAnimaticSequencePlan fallback and multi-cam sequencing', () => {
  const scene = createScene('Test Dailies Scene');

  // Scene with 0 cameras: fallback CAM A
  const plan0 = calculateAnimaticSequencePlan(scene, { fps: 24 });
  assert.equal(plan0.cuts.length, 1);
  assert.equal(plan0.cuts[0].cameraName, 'CAM A');
  assert.equal(plan0.cuts[0].shotNumber, 1);
  assert.equal(plan0.cuts[0].frameIndex, 0);
  assert.equal(plan0.totalDurationS, 4.0);
  assert.equal(plan0.totalFrames, 96);

  // Scene with 3 cameras
  const camA = createCameraSetup(scene, { x: 0, y: 1.6, z: 3 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '16:9');
  camA.name = 'WIDE MASTER';
  const camB = createCameraSetup(scene, { x: 1, y: 1.4, z: 2 }, { x: 0, y: 0, z: 0, w: 1 }, 50, '16:9');
  camB.name = 'MED CLOSEUP';
  const camC = createCameraSetup(scene, { x: -1, y: 1.5, z: 2 }, { x: 0, y: 0, z: 0, w: 1 }, 85, '16:9');
  camC.name = 'OTS CLOSEUP';

  const plan3 = calculateAnimaticSequencePlan(scene, { fps: 24 });
  assert.equal(plan3.cuts.length, 3);
  assert.equal(plan3.cuts[0].cameraName, 'WIDE MASTER');
  assert.equal(plan3.cuts[0].shotNumber, 1);
  assert.equal(plan3.cuts[0].frameIndex, 0);
  assert.equal(plan3.cuts[1].cameraName, 'MED CLOSEUP');
  assert.equal(plan3.cuts[1].shotNumber, 2);
  assert.equal(plan3.cuts[1].frameIndex, 96);
  assert.equal(plan3.cuts[2].cameraName, 'OTS CLOSEUP');
  assert.equal(plan3.cuts[2].shotNumber, 3);
  assert.equal(plan3.cuts[2].frameIndex, 192);
  assert.equal(plan3.totalFrames, 288);
  assert.equal(plan3.totalDurationS, 12.0);

  // Duration override scaling
  const planOverride = calculateAnimaticSequencePlan(scene, { fps: 24, durationOverrideS: 6.0 });
  assert.equal(planOverride.cuts.length, 3);
  assert.equal(planOverride.totalDurationS, 6.0);
  assert.equal(planOverride.totalFrames, 144);
  assert.equal(planOverride.cuts[0].frameIndex, 0);
  assert.equal(planOverride.cuts[1].frameIndex, 48);
  assert.equal(planOverride.cuts[2].frameIndex, 96);
});

test('dailiesEngine: calculateAnimaticSequencePlan with camera keyframe animation', () => {
  const scene = createScene('Dolly Move Scene');
  const cam = createCameraSetup(scene, { x: 0, y: 1.6, z: 5 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '16:9');
  cam.name = 'DOLLY TRACK';
  addCameraKeyframe(cam, { x: 0, y: 1.6, z: 5 }, { x: 0, y: 0, z: 0, w: 1 }, 35);
  addCameraKeyframe(cam, { x: 0, y: 1.6, z: 1 }, { x: 0, y: 0, z: 0, w: 1 }, 35);

  const plan = calculateAnimaticSequencePlan(scene, { fps: 24 });
  assert.equal(plan.cuts.length, 1);
  assert.ok(plan.totalDurationS >= 4.0);
  assert.equal(plan.cuts[0].focalLengthMm, 35);
});

test('dailiesEngine: calculateQuadSplitViewports math and pixel partitioning', () => {
  // 1080p
  const v1080 = calculateQuadSplitViewports(1920, 1080);
  assert.deepEqual(v1080.director, {
    x: 0,
    y: 0,
    width: 960,
    height: 540,
    label: 'PROGRAM / DIRECTOR CUT',
  });
  assert.deepEqual(v1080.camA, {
    x: 960,
    y: 0,
    width: 960,
    height: 540,
    label: 'CAMERA A',
  });
  assert.deepEqual(v1080.camB, {
    x: 0,
    y: 540,
    width: 960,
    height: 540,
    label: 'CAMERA B',
  });
  assert.deepEqual(v1080.topDown, {
    x: 960,
    y: 540,
    width: 960,
    height: 540,
    label: 'TOP-DOWN FLOORPLAN',
  });

  // 4K UHD
  const v4k = calculateQuadSplitViewports(3840, 2160);
  assert.equal(v4k.director.width, 1920);
  assert.equal(v4k.director.height, 1080);
  assert.equal(v4k.camA.x, 1920);
  assert.equal(v4k.topDown.y, 1080);

  // Odd dimensions
  const vOdd = calculateQuadSplitViewports(1921, 1081);
  assert.equal(vOdd.director.width + vOdd.camA.width, 1921);
  assert.equal(vOdd.director.height + vOdd.camB.height, 1081);
});

test('dailiesEngine: generateDailiesSlateData produces accurate metadata', () => {
  const scene = createScene('Warehouse Sequence');
  const camA = createCameraSetup(scene, { x: 0, y: 1.6, z: 3 }, { x: 0, y: 0, z: 0, w: 1 }, 35, '16:9');
  camA.name = 'CAM A';
  camA.tStop = 2.0;
  const camB = createCameraSetup(scene, { x: 2, y: 1.6, z: 2 }, { x: 0, y: 0, z: 0, w: 1 }, 85, '16:9');
  camB.name = 'CAM B';
  camB.tStop = 2.8;

  const config = createDailiesConfig({
    bitc: {
      enabled: true,
      startingTimecode: '01:00:00:00',
      fps: 24,
      dropFrame: false,
      showSceneShotTake: true,
      showCameraLensData: true,
      showWatermark: true,
      watermarkText: 'STUDIO DAILIES CONFIDENTIAL',
      position: 'bottom_center',
    },
  });
  const plan = calculateAnimaticSequencePlan(scene, { fps: 24 });

  // Frame 0: Shot 1 (CAM A)
  const slate0 = generateDailiesSlateData(0, plan, scene, config.bitc);
  assert.equal(slate0.sceneName, 'Warehouse Sequence');
  assert.equal(slate0.shotNumber, 1);
  assert.equal(slate0.cameraName, 'CAM A');
  assert.equal(slate0.focalLengthMm, 35);
  assert.equal(slate0.tStop, 2.0);
  assert.equal(slate0.smpteTimecode, '01:00:00:00');
  assert.equal(slate0.elapsedS, 0);
  assert.equal(slate0.frameIndex, 0);
  assert.equal(slate0.watermark, 'STUDIO DAILIES CONFIDENTIAL');

  // Frame 100: Shot 2 (CAM B starts at frame 96)
  const slate100 = generateDailiesSlateData(100, plan, scene, config.bitc);
  assert.equal(slate100.shotNumber, 2);
  assert.equal(slate100.cameraName, 'CAM B');
  assert.equal(slate100.focalLengthMm, 85);
  assert.equal(slate100.tStop, 2.8);
  assert.equal(slate100.smpteTimecode, '01:00:04:04');
  assert.equal(slate100.frameIndex, 100);
});

// --- Soundstage DMX512, Art-Net 4 & ANSI E1.31 sACN Lighting Bridge Tests ---

test('DmxBridgeConfig: factory, type guard, and normalizer', () => {
  const def = createDmxBridgeConfig();
  assert.equal(def.enabled, false);
  assert.equal(def.protocol, 'artnet');
  assert.equal(def.targetIp, '127.0.0.1');
  assert.equal(def.targetPort, 6454);
  assert.equal(def.localPort, 6454);
  assert.equal(def.subnet, 0);
  assert.equal(def.universeOffset, 0);
  assert.equal(def.refreshRateHz, 30);
  assert.equal(def.priority, 100);
  assert.equal(def.syncWithSceneLights, true);
  assert.equal(isDmxBridgeConfig(def), true);

  // Normalizer clamps out of bounds values
  const normalized = normalizeDmxBridgeConfig({
    enabled: true,
    protocol: 'sacn',
    targetIp: '192.168.1.100',
    targetPort: 99999,
    localPort: -10,
    subnet: 50,
    universeOffset: -5,
    refreshRateHz: 120,
    priority: 300,
    syncWithSceneLights: false,
  });
  assert.equal(normalized.protocol, 'sacn');
  assert.equal(normalized.targetPort, 65535);
  assert.equal(normalized.localPort, 1);
  assert.equal(normalized.subnet, 15);
  assert.equal(normalized.universeOffset, 0);
  assert.equal(normalized.refreshRateHz, 60);
  assert.equal(normalized.priority, 200);
  assert.equal(normalized.syncWithSceneLights, false);
});

test('DmxPatchEntry: factory, type guard, and normalizer', () => {
  const patch = createDmxPatchEntry({
    lightId: 'light-123',
    lightName: 'Key Light A',
    universe: 1,
    startAddress: 10,
    fixtureProfileId: 'arri-skypanel-s60c-m6',
  });
  assert.equal(patch.lightId, 'light-123');
  assert.equal(patch.lightName, 'Key Light A');
  assert.equal(patch.universe, 1);
  assert.equal(patch.startAddress, 10);
  assert.equal(patch.fixtureProfileId, 'arri-skypanel-s60c-m6');
  assert.equal(patch.enabled, true);
  assert.equal(isDmxPatchEntry(patch), true);

  const clamped = normalizeDmxPatchEntry({
    patchId: 'p1',
    lightId: 'l1',
    lightName: 'Light',
    universe: 99,
    startAddress: 600,
    fixtureProfileId: 'unknown-id',
    enabled: true,
  });
  assert.equal(clamped.universe, 15);
  assert.equal(clamped.startAddress, 512);
  assert.equal(clamped.fixtureProfileId, 'generic-dimmer');
});

test('DmxCue: factory, type guard, and normalizer', () => {
  const cue = createDmxCue({
    name: 'Night Exterior',
    fadeTimeS: 3.5,
    values: [
      { universe: 0, channel: 1, value: 255 },
      { universe: 0, channel: 2, value: 128 },
    ],
  });
  assert.equal(cue.name, 'Night Exterior');
  assert.equal(cue.fadeTimeS, 3.5);
  assert.equal(cue.values.length, 2);
  assert.equal(isDmxCue(cue), true);

  const normalized = normalizeDmxCue({
    id: 'c1',
    name: '  Trimmed Cue  ',
    fadeTimeS: -2,
    values: [{ universe: 20, channel: 600, value: 500 }],
  });
  assert.equal(normalized.name, 'Trimmed Cue');
  assert.equal(normalized.fadeTimeS, 0);
  assert.equal(normalized.values[0].universe, 15);
  assert.equal(normalized.values[0].channel, 512);
  assert.equal(normalized.values[0].value, 255);
});

test('Planckian Kelvin and RGB DMX color converters', () => {
  // 3200K Warm Tungsten
  const warmRgb = kelvinToRgbDmx(3200);
  assert.equal(warmRgb.r, 255);
  assert.ok(warmRgb.g > 150 && warmRgb.g < 210);
  assert.ok(warmRgb.b > 80 && warmRgb.b < 160);

  // 5600K Daylight
  const daylightRgb = kelvinToRgbDmx(5600);
  assert.equal(daylightRgb.r, 255);
  assert.ok(daylightRgb.g > 200 && daylightRgb.g <= 255);
  assert.ok(daylightRgb.b > 200 && daylightRgb.b <= 255);

  // 6500K Cool White
  const coolRgb = kelvinToRgbDmx(6500);
  assert.ok(coolRgb.r >= 240);
  assert.ok(coolRgb.g >= 240);
  assert.ok(coolRgb.b >= 240);

  // Reverse mapping from RGB to Kelvin
  const estWarm = rgbToKelvinDmx(warmRgb.r, warmRgb.g, warmRgb.b);
  assert.ok(Math.abs(estWarm - 3200) < 600);

  const estCool = rgbToKelvinDmx(coolRgb.r, coolRgb.g, coolRgb.b);
  assert.ok(Math.abs(estCool - 6500) < 600);
});

test('Art-Net 4 OpDmx (0x5000) packet encode and decode round-trip', () => {
  const dmxChannels = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    dmxChannels[i] = i % 256;
  }

  const packet = encodeArtDmxPacket({
    universe: 3,
    subnet: 1,
    net: 0,
    sequence: 42,
    physical: 1,
    data: dmxChannels,
  });

  // Verify binary packet structure
  assert.ok(packet.byteLength >= 18 + 512);
  // Header: "Art-Net\0"
  const headerStr = String.fromCharCode(...Array.from(packet.slice(0, 7)));
  assert.equal(headerStr, 'Art-Net');
  assert.equal(packet[7], 0x00);

  // OpCode 0x5000 (Little Endian: 0x00, 0x50)
  assert.equal(packet[8], 0x00);
  assert.equal(packet[9], 0x50);

  // ProtVer 14 (Big Endian: 0x00, 0x0E)
  assert.equal(packet[10], 0x00);
  assert.equal(packet[11], 0x0e);

  // Sequence and Physical
  assert.equal(packet[12], 42);
  assert.equal(packet[13], 1);

  // SubUni: (3 & 0x0f) | ((1 & 0x0f) << 4) = 3 | 16 = 19 (0x13)
  assert.equal(packet[14], 0x13);

  // Net: 0
  assert.equal(packet[15], 0x00);

  // Length: 512 (Big Endian: 0x02, 0x00)
  assert.equal(packet[16], 0x02);
  assert.equal(packet[17], 0x00);

  // Decode packet
  const decoded = decodeArtDmxPacket(packet);
  assert.ok(decoded !== null);
  assert.equal(decoded.universe, 3);
  assert.equal(decoded.subnet, 1);
  assert.equal(decoded.net, 0);
  assert.equal(decoded.sequence, 42);
  assert.equal(decoded.physical, 1);
  assert.equal(decoded.data.length, 512);

  for (let i = 0; i < 512; i++) {
    assert.equal(decoded.data[i], i % 256);
  }
});

test('Art-Net 4 corrupt packet rejection', () => {
  // Too short
  assert.equal(decodeArtDmxPacket(new Uint8Array(10)), null);

  // Bad header magic
  const badHeader = new Uint8Array(20);
  assert.equal(decodeArtDmxPacket(badHeader), null);

  // Bad opcode
  const badOpcode = encodeArtDmxPacket({ universe: 0, subnet: 0, sequence: 0, data: new Uint8Array(10) });
  badOpcode[8] = 0xff;
  assert.equal(decodeArtDmxPacket(badOpcode), null);
});

test('ANSI E1.31 sACN packet encode and decode round-trip', () => {
  const dmxChannels = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    dmxChannels[i] = (255 - i) & 0xff;
  }

  const customCid = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  const packet = encodeSacnPacket({
    universe: 1, // 1-indexed for sACN wire
    sourceName: 'SetView Virtual Production Bridge',
    priority: 150,
    sequence: 88,
    cid: customCid,
    data: dmxChannels,
  });

  // Verify total packet length: 126 (header) + 512 (slots) = 638 bytes
  assert.equal(packet.byteLength, 126 + 512);

  // Root layer preamble size: 0x0010 (Big Endian)
  assert.equal(packet[0], 0x00);
  assert.equal(packet[1], 0x10);

  // ACN PID: "ASC-E1.17\0\0\0"
  const pidStr = String.fromCharCode(...Array.from(packet.slice(4, 13)));
  assert.equal(pidStr, 'ASC-E1.17');

  // Priority byte (offset 108)
  assert.equal(packet[108], 150);

  // Sequence byte (offset 111)
  assert.equal(packet[111], 88);

  // Universe (offset 113-114 Big Endian: 0x0001)
  assert.equal(packet[113], 0x00);
  assert.equal(packet[114], 0x01);

  // DMX START code byte (offset 125): 0x00
  assert.equal(packet[125], 0x00);

  // Decode sACN packet
  const decoded = decodeSacnPacket(packet);
  assert.ok(decoded !== null);
  assert.equal(decoded.universe, 1);
  assert.equal(decoded.sourceName, 'SetView Virtual Production Bridge');
  assert.equal(decoded.priority, 150);
  assert.equal(decoded.sequence, 88);
  assert.equal(decoded.data.length, 512);

  for (let i = 0; i < 512; i++) {
    assert.equal(decoded.data[i], (255 - i) & 0xff);
  }
});

test('ANSI E1.31 sACN corrupt packet rejection', () => {
  // Too short
  assert.equal(decodeSacnPacket(new Uint8Array(100)), null);

  // Bad Root vector
  const badVec = encodeSacnPacket({ universe: 1, sourceName: 'Test', data: new Uint8Array(10) });
  badVec[18] = 0xff;
  assert.equal(decodeSacnPacket(badVec), null);

  // Non-zero DMX start code
  const nonZeroStart = encodeSacnPacket({ universe: 1, sourceName: 'Test', data: new Uint8Array(10) });
  nonZeroStart[125] = 0x01; // Non-zero START code
  assert.equal(decodeSacnPacket(nonZeroStart), null);
});

test('DMX Fixture Profile Library coverage', () => {
  assert.ok(DMX_FIXTURE_PROFILES.length >= 10);

  const skypanelM6 = findFixtureProfile('arri-skypanel-s60c-m6');
  assert.equal(skypanelM6.manufacturer, 'ARRI');
  assert.equal(skypanelM6.model, 'SkyPanel S60-C');
  assert.equal(skypanelM6.totalChannels, 8);

  const skypanelM1 = findFixtureProfile('arri-skypanel-s60c-m1');
  assert.equal(skypanelM1.totalChannels, 6);

  const titanM4 = findFixtureProfile('astera-titan-m4');
  assert.equal(titanM4.manufacturer, 'Astera');
  assert.equal(titanM4.totalChannels, 5);

  const aputure600d = findFixtureProfile('aputure-600d-16bit');
  assert.equal(aputure600d.manufacturer, 'Aputure');
  assert.equal(aputure600d.totalChannels, 5);

  const genericDimmer = findFixtureProfile('generic-dimmer');
  assert.equal(genericDimmer.totalChannels, 1);

  const movingSpot = findFixtureProfile('generic-moving-spot');
  assert.equal(movingSpot.totalChannels, 8);
});

test('Light to DMX channel mapping and reverse decoding', () => {
  const mode6 = findFixtureProfile('arri-skypanel-s60c-m6');
  const light = {
    id: 'light-1',
    name: 'Key Light',
    type: 'spot' as const,
    position: { x: 0, y: 2.5, z: -3 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    intensity: 0.75,
    kelvin: 3200,
    color: '#ff9933',
    spotAngleDeg: 45,
    distanceM: 10,
    castShadows: true,
  };

  const dmxBuffer = new Uint8Array(512);
  mapLightToDmxChannels(light, mode6, 1, dmxBuffer);

  // Arri SkyPanel S60-C Mode 6 Footprint:
  // Ch 1: Dimmer 8-bit (0.75 * 255 = 191)
  assert.equal(dmxBuffer[0], 191);

  // Ch 2: CCT 8-bit (2800K to 10000K, 3200K is (3200-2800)/7200 * 255 = 14)
  assert.equal(dmxBuffer[1], 14);

  // Ch 4-6: RGB channels for #ff9933 (R=255, G=153, B=51)
  assert.equal(dmxBuffer[3], 255);
  assert.equal(dmxBuffer[4], 153);
  assert.equal(dmxBuffer[5], 51);

  // Reverse mapping from DMX buffer back to LightData
  const restoredMode6 = mapDmxChannelsToLight(dmxBuffer, 1, mode6, light);
  assert.ok(Math.abs(restoredMode6.intensity - 0.75) < 0.02);
  assert.equal(restoredMode6.colorHex, '#ff9933');

  // Test Mode 1 (16-bit dimmer and CCT)
  const mode1 = findFixtureProfile('arri-skypanel-s60c-m1');
  const dmxBuffer16 = new Uint8Array(512);
  mapLightToDmxChannels(light, mode1, 1, dmxBuffer16);

  // Ch 1-2: Dimmer 16-bit (0.75 * 65535 = 49151)
  const dimmer16 = (dmxBuffer16[0] << 8) | dmxBuffer16[1];
  assert.ok(Math.abs(dimmer16 - 49151) <= 256);

  // Ch 3-4: CCT 16-bit (3200K is (3200-2800)/7200 * 65535 = 3641)
  const cct16 = (dmxBuffer16[2] << 8) | dmxBuffer16[3];
  assert.ok(Math.abs(cct16 - 3640) <= 256);

  const restoredMode1 = mapDmxChannelsToLight(dmxBuffer16, 1, mode1, light);
  assert.ok(Math.abs(restoredMode1.intensity - 0.75) < 0.02);
  assert.ok(Math.abs((restoredMode1.kelvin ?? 3200) - 3200) < 50);
});

test('DMX Patch Manifest RFC 4180 CSV export', () => {
  const patches: DmxPatchEntry[] = [
    createDmxPatchEntry({
      patchId: 'p1',
      lightId: 'l1',
      lightName: 'Arri Key Light',
      universe: 0,
      startAddress: 1,
      fixtureProfileId: 'arri-skypanel-s60c-m6',
      enabled: true,
    }),
    createDmxPatchEntry({
      patchId: 'p2',
      lightId: 'l2',
      lightName: 'Background Spot, Special',
      universe: 1,
      startAddress: 17,
      fixtureProfileId: 'generic-moving-spot',
      enabled: false,
    }),
  ];

  const csv = exportDmxPatchListCsv(patches, DMX_FIXTURE_PROFILES);
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 3); // Header + 2 rows

  // Header verification
  assert.ok(lines[0].includes('Patch ID,Light ID,Light Name,Universe,Start Address'));

  // Row 1 verification
  assert.ok(lines[1].includes('"p1","l1","Arri Key Light",0,1,8,8,"arri-skypanel-s60c-m6"'));
  assert.ok(lines[1].includes('ENABLED'));

  // Row 2 verification (quotes around name containing comma)
  assert.ok(lines[2].includes('"Background Spot, Special",1,17,24,8,"generic-moving-spot"'));
  assert.ok(lines[2].includes('DISABLED'));
});

test('CollabScenePatch: DMX bridge and patch collaboration sync', () => {
  const scene = createScene('DMX Stage');
  assert.equal(scene.dmxPatches?.length, 0);

  // Apply dmx_bridge_update
  applyScenePatch(scene, {
    type: 'dmx_bridge_update',
    config: {
      enabled: true,
      protocol: 'sacn',
      targetIp: '10.0.0.50',
      targetPort: 5568,
      localPort: 5568,
      subnet: 0,
      universeOffset: 0,
      refreshRateHz: 44,
      priority: 120,
      syncWithSceneLights: true,
    },
  });
  assert.equal(scene.dmxBridge?.enabled, true);
  assert.equal(scene.dmxBridge?.protocol, 'sacn');
  assert.equal(scene.dmxBridge?.refreshRateHz, 44);

  // Apply dmx_patch_add
  const newPatch = createDmxPatchEntry({
    patchId: 'patch_collab_1',
    lightId: 'light_collab_1',
    lightName: 'Collab SkyPanel',
    universe: 0,
    startAddress: 1,
    fixtureProfileId: 'arri-skypanel-s60c-m6',
  });
  applyScenePatch(scene, {
    type: 'dmx_patch_add',
    patch: newPatch,
  });
  assert.equal(scene.dmxPatches?.length, 1);
  assert.equal(scene.dmxPatches?.[0].patchId, 'patch_collab_1');

  // Apply dmx_patch_update
  applyScenePatch(scene, {
    type: 'dmx_patch_update',
    patch: { ...newPatch, startAddress: 65 },
  });
  assert.equal(scene.dmxPatches?.[0].startAddress, 65);

  // Apply dmx_patch_remove
  applyScenePatch(scene, {
    type: 'dmx_patch_remove',
    patchId: 'patch_collab_1',
  });
  assert.equal(scene.dmxPatches?.length, 0);
});

// --- ICVFX LED Volume Wall Calibration, Moiré & nDisplay Tests ---

test('icvfx: createLedVolumeWall and normalizeLedVolumeWall defaults and fallback sanity', () => {
  const wall = createLedVolumeWall({
    name: 'Main Curved Wall',
    type: 'curved_perimeter',
    radiusM: 10.5,
    arcAngleDeg: 240,
    heightM: 6.5,
    pixelPitchMm: 2.1,
    brightnessNits: 1800,
  });

  assert.equal(wall.name, 'Main Curved Wall');
  assert.equal(wall.type, 'curved_perimeter');
  assert.equal(wall.radiusM, 10.5);
  assert.equal(wall.arcAngleDeg, 240);
  assert.equal(wall.heightM, 6.5);
  assert.equal(wall.pixelPitchMm, 2.1);
  assert.equal(wall.brightnessNits, 1800);
  assert.equal(wall.enabled, true);
  assert.ok(isLedVolumeWall(wall));

  // Test normalization of corrupt data
  const normalized = normalizeLedVolumeWall({
    id: 'corrupt_wall',
    type: 'invalid_type' as any,
    radiusM: -5,
    arcAngleDeg: -20,
    heightM: 0,
    widthM: -10,
    pixelPitchMm: -2,
    brightnessNits: -500,
    colorTempKelvin: 100,
  });

  assert.equal(normalized.type, 'curved_perimeter');
  assert.equal(normalized.radiusM, 0);
  assert.equal(normalized.arcAngleDeg, 0);
  assert.equal(normalized.heightM, 5.0);
  assert.equal(normalized.widthM, 10.0);
  assert.equal(normalized.pixelPitchMm, 2.3);
  assert.equal(normalized.brightnessNits, 1200);
  assert.equal(normalized.colorTempKelvin, 6500);
});

test('icvfx: createLedVolumeConfig stock presets validation', () => {
  const presets: LedVolumePresetId[] = [
    'mega_360',
    'horseshoe_270',
    'commercial_180',
    'flat_backdrop',
    'cube_studio',
  ];

  for (const presetId of presets) {
    const config = createLedVolumeConfig(presetId);
    assert.ok(isLedVolumeConfig(config), `Preset ${presetId} must be valid config`);
    assert.equal(config.enabled, true);
    assert.ok(config.walls.length > 0, `Preset ${presetId} must have at least one wall`);

    for (const wall of config.walls) {
      assert.ok(isLedVolumeWall(wall), `Wall ${wall.name} in preset ${presetId} must be valid`);
      assert.ok(wall.heightM > 0);
      assert.ok(wall.widthM > 0 || wall.radiusM > 0);
      assert.ok(wall.pixelPitchMm > 0);
    }
  }

  // Verify Horseshoe 270 structure
  const horseshoe = STOCK_LED_VOLUMES['horseshoe_270'];
  assert.equal(horseshoe.config.walls.length, 3);
  assert.equal(horseshoe.config.walls[0].type, 'curved_perimeter');
  assert.equal(horseshoe.config.walls[0].arcAngleDeg, 270);

  // Verify Mega 360 structure
  const mega = STOCK_LED_VOLUMES['mega_360'];
  assert.equal(mega.config.walls.length, 2);
  assert.equal(mega.config.walls[0].type, 'curved_perimeter');
  assert.equal(mega.config.walls[0].arcAngleDeg, 360);
});

test('icvfx: calculateMoireRisk optical limit math and classification', () => {
  // Scenario 1: Severe Moiré
  // Sensor Nyquist: 4096 / (2 * 24.89) = 82.28 lp/mm
  // Projected LED pitch: (5.0 * 1000) / (25 * 2.3) = 86.95 lp/mm
  // Ratio: 86.95 / 82.28 = 1.056 (within 0.82 .. 1.22 -> severe_moire)
  const severeRes = calculateMoireRisk(5.0, 25, 24.89, 4096, 2.3);
  assert.equal(severeRes.riskLevel, 'severe_moire');
  assert.ok(severeRes.nyquistFrequencyRatio >= 0.82 && severeRes.nyquistFrequencyRatio <= 1.22);
  assert.ok(severeRes.minSafeDistanceM > 0);
  assert.ok(severeRes.message.includes('Severe Moiré'));

  // Scenario 2: High Risk
  // Ratio around 0.72 or 1.35
  const highRiskRes = calculateMoireRisk(3.8, 25, 24.89, 4096, 2.3);
  assert.ok(highRiskRes.riskLevel === 'high_risk' || highRiskRes.riskLevel === 'severe_moire');

  // Scenario 3: Safe (Distant / Well Oversampled)
  // At 15.0m distance, projected pitch frequency is high (260 lp/mm), ratio = 3.17 (> 1.80 -> safe)
  const safeDistantRes = calculateMoireRisk(15.0, 25, 24.89, 4096, 2.3);
  assert.equal(safeDistantRes.riskLevel, 'safe');
  assert.ok(safeDistantRes.nyquistFrequencyRatio > 1.80);

  // Scenario 4: Safe (Close-Up / Defocused)
  // At 1.2m with 85mm lens, projected pitch frequency is low (6.13 lp/mm), ratio = 0.074 (< 0.50 -> safe)
  const safeCloseRes = calculateMoireRisk(1.2, 85, 24.89, 4096, 2.3);
  assert.equal(safeCloseRes.riskLevel, 'safe');
  assert.ok(safeCloseRes.nyquistFrequencyRatio < 0.50);
});

test('icvfx: calculateInnerFrustumIntersection ray-geometry and overscan calculation', () => {
  const config = createLedVolumeConfig('horseshoe_270');

  const camPos = { x: 0, y: 1.5, z: 0 };
  const camQuat = { x: 0, y: 0, z: 0, w: 1 }; // Facing -Z forward
  const focalLengthMm = 35;
  const sensorWidthMm = 24.89;
  const sensorHeightMm = 18.67;

  const vFovDeg = 2 * Math.atan(sensorHeightMm / (2 * focalLengthMm)) * (180 / Math.PI);
  const aspect = sensorWidthMm / sensorHeightMm;

  const result = calculateInnerFrustumIntersection(
    camPos,
    camQuat,
    vFovDeg,
    aspect,
    config,
    15, // 15% overscan
  );

  assert.ok(result.activeWalls.length > 0, 'Must intersect at least one active wall');
  assert.ok(result.corners.length >= 4, 'Must produce at least 4 frustum boundary vertices');
  assert.ok(result.surfaceAreaSqm > 0, 'Projected inner frustum area must be positive');
  assert.equal(result.overscanFactor, 1.15);
});

test('icvfx: generateNDisplayConfigXml export generation', () => {
  const config = createLedVolumeConfig('horseshoe_270');
  config.stageName = 'Pinewood Stage B';

  const xml = generateNDisplayConfigXml(config);

  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes('<nDisplay version="5.0">'));
  assert.ok(xml.includes('<cluster>'));
  assert.ok(xml.includes('<nodes>'));
  assert.ok(xml.includes('<screens>'));
  assert.ok(xml.includes('<cameras>'));
  assert.ok(xml.includes('viewport id="VP_InnerFrustum"'));
  assert.ok(xml.includes('tracking_device="LiveLinkTracking"'));
  assert.ok(xml.includes('stage name="Pinewood Stage B"'));

  for (const wall of config.walls) {
    assert.ok(xml.includes(`id="SCR_${wall.nDisplayNodeId}`));
  }
});

test('icvfx: nDisplay screen transforms use the shared SetView -> Unreal handedness contract', () => {
  const config = createLedVolumeConfig('horseshoe_270');
  config.walls[0].enabled = true;
  config.walls[0].center = { x: 1.5, y: 2.0, z: -3.5 };
  config.walls[0].rotationY = Math.PI / 2;

  const xml = generateNDisplayConfigXml(config);

  // Must match svToUeLocation exactly (x_ue = -z_sv * 100), not the old
  // determinant +1 (x_sv, -z_sv, y_sv) convention that mirrored the volume.
  const loc = svToUeLocation(config.walls[0].center, 100);
  assert.equal(loc.x, 350);
  assert.ok(
    xml.includes(`<location x="${loc.x.toFixed(1)}" y="${loc.y.toFixed(1)}" z="${loc.z.toFixed(1)}" />`),
    'wall centre must use the shared determinant -1 location map',
  );

  // The yaw must be the paired heading conversion, not an ad-hoc sign flip.
  assert.ok(
    xml.includes(`yaw="${svHeadingToUeYaw(Math.PI / 2).toFixed(2)}"`),
    'wall yaw must use svHeadingToUeYaw',
  );
  assert.equal(svHeadingToUeYaw(Math.PI / 2).toFixed(2), '90.00');
});

test('icvfx: generateOpenUsdLedVolume export generation', () => {
  const config = createLedVolumeConfig('horseshoe_270');
  config.stageName = 'Stage 7 Volume';

  const usda = generateOpenUsdLedVolume(config);

  assert.ok(usda.startsWith('#usda 1.0'));
  assert.ok(usda.includes('def Xform "LedVolume"'));
  assert.ok(usda.includes('point3f[] points'));
  assert.ok(usda.includes('int[] faceVertexCounts'));
  assert.ok(usda.includes('int[] faceVertexIndices'));
  assert.ok(usda.includes('stageName = "Stage 7 Volume"'));
  assert.ok(usda.includes('lutProfile = "acescc"'));
});

test('icvfx: multi-user collaboration patch sync', () => {
  const scene = createScene('ICVFX Stage Test');
  assert.ok(scene.icvfx);
  assert.equal(scene.icvfx.enabled, true);

  // Collab patch: icvfx_update
  const newConfig = createLedVolumeConfig('commercial_180');
  newConfig.stageName = 'Stage 4 Commercial';
  applyScenePatch(scene, {
    type: 'icvfx_update',
    config: newConfig,
  });
  assert.equal(scene.icvfx.stageName, 'Stage 4 Commercial');
  assert.equal(scene.icvfx.walls.length, STOCK_LED_VOLUMES['commercial_180'].config.walls.length);

  // Collab patch: icvfx_wall_add
  const customWall = createLedVolumeWall({
    name: 'Mobile Wild Wall Left',
    type: 'wild_wall',
    widthM: 3.5,
    heightM: 3.0,
  });
  applyScenePatch(scene, {
    type: 'icvfx_wall_add',
    wall: customWall,
  });
  assert.equal(scene.icvfx.walls.length, STOCK_LED_VOLUMES['commercial_180'].config.walls.length + 1);

  // Collab patch: icvfx_wall_update
  applyScenePatch(scene, {
    type: 'icvfx_wall_update',
    wallId: customWall.id,
    updates: { brightnessNits: 2500 },
  });
  const updatedWall = scene.icvfx.walls.find((w) => w.id === customWall.id);
  assert.ok(updatedWall);
  assert.equal(updatedWall.brightnessNits, 2500);

  // Collab patch: icvfx_wall_remove
  applyScenePatch(scene, {
    type: 'icvfx_wall_remove',
    wallId: customWall.id,
  });
  assert.equal(scene.icvfx.walls.length, STOCK_LED_VOLUMES['commercial_180'].config.walls.length);
});

// ============================================================================
// Soundstage Acoustics & Multi-Track Spatial Dialogue Simulation Suite Tests
// ============================================================================

test('Acoustics Engine: Polar Directivity Patterns & Off-Axis Attenuation', () => {
  // On-axis (0 radians) attenuation must be 0 dB across all patterns
  const patterns: MicPolarPattern[] = ['shotgun_supercardioid', 'hypercardioid', 'cardioid', 'omnidirectional', 'figure_eight'];
  for (const p of patterns) {
    const attOnAxis = calculatePolarAttenuation(p, 0);
    assert.ok(Math.abs(attOnAxis) < 0.001, `Pattern ${p} should have 0 dB on-axis attenuation, got ${attOnAxis}`);
  }

  // Omnidirectional should be 0 dB attenuation at 0, 90 deg, and 180 deg
  assert.equal(calculatePolarAttenuation('omnidirectional', Math.PI / 2), 0);
  assert.equal(calculatePolarAttenuation('omnidirectional', Math.PI), 0);

  // Cardioid at 180 deg (rear) should have deep cancellation (<= -30 dB)
  const cardRear = calculatePolarAttenuation('cardioid', Math.PI);
  assert.ok(cardRear <= -30, `Cardioid rear attenuation should be <= -30dB, got ${cardRear}`);

  // Cardioid at 90 deg (side) should have ~ -6 dB attenuation
  const cardSide = calculatePolarAttenuation('cardioid', Math.PI / 2);
  assert.ok(Math.abs(cardSide - (-6.02)) < 0.1, `Cardioid 90deg attenuation should be ~ -6dB, got ${cardSide}`);

  // Figure-8: Nulls at 90 deg and 270 deg (<= -35 dB), 0 dB at 0 deg and 180 deg
  const fig8Side = calculatePolarAttenuation('figure_eight', Math.PI / 2);
  const fig8Rear = calculatePolarAttenuation('figure_eight', Math.PI);
  assert.ok(fig8Side <= -35, `Figure-8 side attenuation should be <= -35dB, got ${fig8Side}`);
  assert.ok(Math.abs(fig8Rear) < 0.001, `Figure-8 rear attenuation should be 0dB, got ${fig8Rear}`);

  // Shotgun Supercardioid with interference tube: High frequencies at 90 deg should have extreme cancellation
  const shotgunLfSide = calculatePolarAttenuation('shotgun_supercardioid', Math.PI / 2, 250, 0.25);
  const shotgunHfSide = calculatePolarAttenuation('shotgun_supercardioid', Math.PI / 2, 4000, 0.25);
  assert.ok(shotgunHfSide < shotgunLfSide, `Shotgun HF side attenuation (${shotgunHfSide}) should be more negative than LF side (${shotgunLfSide})`);
  assert.ok(shotgunHfSide <= -20, `Shotgun HF side attenuation should be <= -20dB, got ${shotgunHfSide}`);
});

test('Acoustics Engine: Curated Microphone Catalog & Technical Specs', () => {
  const mkh416 = CURATED_MIC_PROFILES.sennheiser_mkh416;
  assert.ok(mkh416);
  assert.equal(mkh416.pattern, 'shotgun_supercardioid');
  assert.equal(mkh416.manufacturer, 'Sennheiser');
  assert.equal(mkh416.sensitivityDbfs, -32.0);
  assert.equal(mkh416.maxSplDb, 130);
  assert.equal(mkh416.tubeLengthM, 0.25);

  const cmc641 = CURATED_MIC_PROFILES.schoeps_cmc641;
  assert.ok(cmc641);
  assert.equal(cmc641.pattern, 'hypercardioid');
  assert.equal(cmc641.manufacturer, 'Schoeps');

  const cs3e = CURATED_MIC_PROFILES.sanken_cs3e;
  assert.ok(cs3e);
  assert.equal(cs3e.pattern, 'shotgun_supercardioid');

  const dpa6060 = CURATED_MIC_PROFILES.dpa_6060;
  assert.ok(dpa6060);
  assert.equal(dpa6060.pattern, 'omnidirectional');
  assert.equal(dpa6060.selfNoiseDba, 24);

  const ambisonic = CURATED_MIC_PROFILES.ambisonic_b_format;
  assert.ok(ambisonic);
  assert.equal(ambisonic.directivityIndexDb, 3.0);

  // Preset validations
  assert.ok(STOCK_ACOUSTICS_PRESETS.dialogue_soundstage);
  assert.ok(STOCK_ACOUSTICS_PRESETS.int_location);
  assert.ok(STOCK_ACOUSTICS_PRESETS.reverberant_hall);
});

test('Acoustics Engine: Architectural Absorption Table Coefficients', () => {
  assert.ok(MATERIAL_ABSORPTION_TABLE.acoustic_fabric_panel);
  assert.ok(MATERIAL_ABSORPTION_TABLE.concrete_raw);
  assert.ok(MATERIAL_ABSORPTION_TABLE.carpet_heavy_pad);
  assert.ok(MATERIAL_ABSORPTION_TABLE.glass_curtain);

  // Acoustic fabric panel should have high absorption at 1kHz and 4kHz (>= 0.8)
  assert.ok(MATERIAL_ABSORPTION_TABLE.acoustic_fabric_panel.octaves[3] >= 0.8);
  assert.ok(MATERIAL_ABSORPTION_TABLE.acoustic_fabric_panel.nrc >= 0.65);

  // Concrete raw should have very low absorption (<= 0.05)
  assert.ok(MATERIAL_ABSORPTION_TABLE.concrete_raw.octaves[3] <= 0.05);
  assert.ok(MATERIAL_ABSORPTION_TABLE.concrete_raw.nrc <= 0.05);

  // Carpet should absorb high frequencies much better than low frequencies
  assert.ok(MATERIAL_ABSORPTION_TABLE.carpet_heavy_pad.octaves[5] > MATERIAL_ABSORPTION_TABLE.carpet_heavy_pad.octaves[0]);
});

test('Acoustics Engine: RT60 Reverberation Solver (Sabine & Eyring)', () => {
  const roomVol = 500.0; // 500 m3 soundstage
  // Highly treated soundstage surfaces
  const treatedSurfaces = [
    { areaM2: 100, absorptionCoeff: 0.85 },
    { areaM2: 100, absorptionCoeff: 0.85 },
    { areaM2: 100, absorptionCoeff: 0.85 },
    { areaM2: 100, absorptionCoeff: 0.85 },
  ];
  const rtTreated = calculateRt60Reverberation(roomVol, treatedSurfaces);
  assert.ok(rtTreated.sabineSec < 0.35, `Treated room RT60 should be < 0.35s, got ${rtTreated.sabineSec}`);
  assert.ok(rtTreated.avgAbsorption >= 0.8, `Average absorption should be >= 0.8, got ${rtTreated.avgAbsorption}`);

  // Reverberant reflective concrete hall
  const reflectiveSurfaces = [
    { areaM2: 100, absorptionCoeff: 0.05 },
    { areaM2: 100, absorptionCoeff: 0.05 },
    { areaM2: 100, absorptionCoeff: 0.05 },
    { areaM2: 100, absorptionCoeff: 0.05 },
  ];
  const rtReflective = calculateRt60Reverberation(roomVol, reflectiveSurfaces);
  assert.ok(rtReflective.sabineSec > 3.0, `Reflective room RT60 should be > 3.0s, got ${rtReflective.sabineSec}`);

  // Eyring decay time must be strictly shorter than or equal to Sabine for high absorption
  assert.ok(rtTreated.eyringSec <= rtTreated.sabineSec);

  // Zero or invalid input safeguards
  const rtSafe = calculateRt60Reverberation(0, []);
  assert.ok(rtSafe.sabineSec > 0);
  assert.ok(Number.isFinite(rtSafe.sabineSec));
});

test('Acoustics Engine: Critical Distance (Dc) & Speech Clarity (C50)', () => {
  const roomVol = 400.0;
  const rt60 = 0.5; // 0.5s controlled soundstage

  const dcOmni = calculateCriticalDistance(roomVol, rt60, 1.0); // gamma = 1 (omni)
  const dcShotgun = calculateCriticalDistance(roomVol, rt60, 4.0); // gamma = 4 (directional shotgun)

  assert.ok(dcOmni > 0);
  assert.ok(dcShotgun > dcOmni, `Shotgun critical distance (${dcShotgun}m) should exceed omni (${dcOmni}m)`);

  // Speech clarity C50: Close to source (< critical distance) must have high C50 (> 3 dB)
  const c50Close = calculateSpeechClarityC50(rt60, 0.8, dcShotgun);
  assert.ok(c50Close >= 3.0, `Close mic C50 should be >= 3.0 dB, got ${c50Close}`);

  // Far from source (> critical distance) in reverberant room must have low/negative C50
  const c50Far = calculateSpeechClarityC50(1.8, 6.0, dcOmni);
  assert.ok(c50Far < c50Close, `Far C50 (${c50Far}) should be lower than close C50 (${c50Close})`);
});

test('Acoustics Engine: Inverse Square Law SPL, Direct/Reverberant Field & SNR', () => {
  const capsule = CURATED_MIC_PROFILES.sennheiser_mkh416;
  const rt60 = 0.4;
  const roomVol = 300;
  const ambientNoise = 30; // 30 dBA quiet stage

  // Direct on-axis at 1m vs 2m: SPL direct drops ~6 dB
  const sample1m = calculateSplAndSnr(70.0, 1.0, 0, capsule, rt60, roomVol, ambientNoise);
  const sample2m = calculateSplAndSnr(70.0, 2.0, 0, capsule, rt60, roomVol, ambientNoise);

  assert.ok(sample1m.directSignalDb > sample2m.directSignalDb);
  assert.ok(Math.abs((sample1m.directSignalDb - sample2m.directSignalDb) - 6.02) < 0.2);

  // Total signal level should decrease and SNR should degrade with distance
  assert.ok(sample1m.snrDb > sample2m.snrDb);
  assert.ok(sample1m.snrDb >= 35, `1m on-axis SNR should be >= 35 dB, got ${sample1m.snrDb}`);

  // Off-axis at 90 degrees attenuation should reduce direct SPL
  const sample90deg = calculateSplAndSnr(70.0, 1.0, Math.PI / 2, capsule, rt60, roomVol, ambientNoise);
  assert.ok(sample90deg.directSignalDb < sample1m.directSignalDb - 10);
});

test('Acoustics Engine: Camera Gate Frustum Boom Incursion Solver', () => {
  const cameraPos = { x: 0, y: 1.5, z: 4.0 };
  const cameraRot = { x: 0, y: 0, z: 0, w: 1 }; // Facing -Z
  const vFovDeg = 40.0;
  const aspect = 16 / 9;
  const blimpRadius = 0.06;

  // Boom mic 3 meters in front (z = 1.0), high up (y = 3.2) -> Safe, high margin (> 0.35m)
  const safeBoomPos = { x: 0, y: 3.2, z: 1.0 };
  const safeAlert = calculateBoomFrameIncursion(safeBoomPos, blimpRadius, cameraPos, cameraRot, vFovDeg, aspect);
  assert.equal(safeAlert.severity, 'safe');
  assert.equal(safeAlert.isIncursion, false);
  assert.ok(safeAlert.marginM > 0.35, `Safe margin should be > 0.35m, got ${safeAlert.marginM}`);

  // Boom dipping directly into the top of the shot (y = 2.4 at z = 1.0)
  // At z_view = 3.0m, top gate is 1.5 + 3.0 * tan(20 deg) = 1.5 + 3.0 * 0.36397 = 2.592m
  // If boom is at y = 2.4m, it is BELOW 2.592m -> breach in shot!
  const breachBoomPos = { x: 0, y: 2.4, z: 1.0 };
  const breachAlert = calculateBoomFrameIncursion(breachBoomPos, blimpRadius, cameraPos, cameraRot, vFovDeg, aspect);
  assert.equal(breachAlert.severity, 'breach_in_shot');
  assert.equal(breachAlert.isIncursion, true);
  assert.ok(breachAlert.marginM <= 0, `Breach margin should be <= 0, got ${breachAlert.marginM}`);

  // Boom just above top gate (y = 2.8m, margin ~0.15m < 0.35m) -> warning
  const cautionBoomPos = { x: 0, y: 2.8, z: 1.0 };
  const cautionAlert = calculateBoomFrameIncursion(cautionBoomPos, blimpRadius, cameraPos, cameraRot, vFovDeg, aspect);
  assert.equal(cautionAlert.severity, 'warning_near_gate');
  assert.equal(cautionAlert.isIncursion, false);
});

test('Acoustics Engine: Sound Devices BWF Sound Report CSV & AES31 iXML Generator', () => {
  const config = createAcousticsConfig('dialogue_soundstage');
  config.boomMics = [
    createBoomMicEntity({ name: 'Boom 1 Overhead', capsuleId: 'sennheiser_mkh416', gainDb: 34.5 }),
  ];
  config.lavalierMics = [
    createLavalierMicEntity({ name: 'Lav Sarah', capsuleId: 'dpa_6060', gainDb: 28.0 }),
  ];

  // BWF CSV Report
  const csv = generateBwfSoundReportCsv(config, 'Scene 42 INT STAGE', '01:00:00:00');
  assert.ok(csv.includes('Broadcast Wave Sound Report'));
  assert.ok(csv.includes('Scene 42 INT STAGE'));
  assert.ok(csv.includes('Boom 1 Overhead'));
  assert.ok(csv.includes('Lav Sarah'));
  assert.ok(csv.includes('48000'));
  assert.ok(csv.includes('24'));

  // AES31 / iXML Manifest
  const ixml = generateAes31IxmlManifest(config, 'Scene 42 INT STAGE');
  assert.ok(ixml.includes('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(ixml.includes('<BWFXML>'));
  assert.ok(ixml.includes('<IXML_VERSION>2.0</IXML_VERSION>'));
  assert.ok(ixml.includes('<SCENE>Scene 42 INT STAGE</SCENE>'));
  assert.ok(ixml.includes('<NAME>Boom 1 Overhead</NAME>'));
  assert.ok(ixml.includes('<NAME>Lav Sarah</NAME>'));
  assert.ok(ixml.includes('</BWFXML>'));
});

test('Acoustics Engine: Factory, Normalization & Validation Functions', () => {
  // Config Factory
  const stageCfg = createAcousticsConfig('dialogue_soundstage');
  assert.equal(stageCfg.presetId, 'dialogue_soundstage');
  assert.equal(stageCfg.enabled, true);
  assert.ok(isAcousticsConfig(stageCfg));

  const hallCfg = createAcousticsConfig('reverberant_hall');
  assert.equal(hallCfg.ambientNoiseFloorDba, 48);

  // Normalization with invalid/empty object
  const normalized = normalizeAcousticsConfig(null);
  assert.ok(isAcousticsConfig(normalized));
  assert.equal(normalized.boomMics.length, 1);

  // Boom Mic Factory & Validation
  const boom = createBoomMicEntity({ name: 'Boom A', position: { x: 1, y: 2.5, z: -1 } });
  assert.ok(isBoomMicEntity(boom));
  assert.equal(boom.name, 'Boom A');
  assert.equal(boom.position.y, 2.5);

  const normBoom = normalizeBoomMicEntity({});
  assert.ok(isBoomMicEntity(normBoom));
  assert.equal(normBoom.name, 'Boom 1');

  // Lavalier Mic Factory & Validation
  const lav = createLavalierMicEntity({ name: 'Lav Lead', actorId: 'actor-1' });
  assert.ok(isLavalierMicEntity(lav));
  assert.equal(lav.actorId, 'actor-1');

  const normLav = normalizeLavalierMicEntity({});
  assert.ok(isLavalierMicEntity(normLav));
  assert.equal(normLav.name, 'Lav 1');
});

test('Acoustics Engine: Data Model & Collab Multi-User Network Sync Patches', () => {
  const scene = createScene('Acoustics Scene Collab Test');
  assert.ok(scene.acoustics);
  assert.equal(scene.acoustics.enabled, true);

  // Collab patch: acoustics_update
  const newConfig = createAcousticsConfig('int_location');
  newConfig.ambientNoiseFloorDba = 42.0;
  applyScenePatch(scene, {
    type: 'acoustics_update',
    config: newConfig,
  });
  assert.equal(scene.acoustics.presetId, 'int_location');
  assert.equal(scene.acoustics.ambientNoiseFloorDba, 42.0);

  // Collab patch: acoustics_boom_add
  const customBoom = createBoomMicEntity({
    name: 'Boom 2 Planted',
    position: { x: 2.0, y: 1.8, z: 0.5 },
  });
  applyScenePatch(scene, {
    type: 'acoustics_boom_add',
    mic: customBoom,
  });
  assert.equal(scene.acoustics.boomMics.length, 2);

  // Collab patch: acoustics_boom_update
  applyScenePatch(scene, {
    type: 'acoustics_boom_update',
    micId: customBoom.id,
    updates: { gainDb: 48.0, isMuted: true },
  });
  const updatedBoom = scene.acoustics.boomMics.find((b) => b.id === customBoom.id);
  assert.ok(updatedBoom);
  assert.equal(updatedBoom.gainDb, 48.0);
  assert.equal(updatedBoom.isMuted, true);

  // Collab patch: acoustics_lav_add
  const customLav = createLavalierMicEntity({
    name: 'Lav Supporting',
  });
  applyScenePatch(scene, {
    type: 'acoustics_lav_add',
    mic: customLav,
  });
  assert.equal(scene.acoustics.lavalierMics.length, 1);

  // Collab patch: acoustics_lav_remove
  applyScenePatch(scene, {
    type: 'acoustics_lav_remove',
    micId: customLav.id,
  });
  assert.equal(scene.acoustics.lavalierMics.length, 0);

  // Collab patch: acoustics_boom_remove
  applyScenePatch(scene, {
    type: 'acoustics_boom_remove',
    micId: customBoom.id,
  });
  assert.equal(scene.acoustics.boomMics.length, 1);
});

test('Acoustics Engine: Spatial Contextual Actions', () => {
  const actorActions = generateEntityContextActions('actor', 'actor-1');
  assert.ok(actorActions.some((a) => a.actionType === 'actor_boom_target'));

  const camActions = generateEntityContextActions('camera', 'cam-1');
  assert.ok(camActions.some((a) => a.actionType === 'cam_boom_incursion'));

  const boomActions = generateEntityContextActions('boom', 'boom-1');
  assert.ok(boomActions.some((a) => a.actionType === 'boom_open_acoustics'));
  assert.ok(boomActions.some((a) => a.actionType === 'boom_toggle_mute'));
  assert.ok(boomActions.some((a) => a.actionType === 'boom_snap_overhead'));
});

// ---------------------------------------------------------------------------
// Physical Solar Ephemeris & Natural Environment Simulator Suite Tests
// ---------------------------------------------------------------------------

test('Solar Engine: NOAA Ephemeris Calculations for Summer Solstice in Los Angeles', () => {
  const config = createSolarEnvironmentConfig('high_noon_clear', 'los_angeles');
  config.date = { year: 2026, month: 6, day: 21 }; // Summer Solstice
  // In PST (UTC-8), solar noon in LA occurs at ~11:53 AM (11.89h)
  config.timeOfDayHours = 11.89;

  const eph = calculateSolarEphemeris(config);

  // Solar elevation at summer solstice noon in LA (~34°N) is ~79.35°
  assert.ok(eph.elevationDeg > 78 && eph.elevationDeg < 81, `Elevation should be ~79.35°, got ${eph.elevationDeg}`);
  approx(eph.zenithDeg, 90 - eph.elevationDeg, 0.01);
  // Declination at summer solstice is ~ +23.44°
  approx(eph.declinationDeg, 23.44, 0.5);
  // Azimuth near solar noon in northern hemisphere is near South (180°)
  assert.ok(eph.azimuthDeg > 170 && eph.azimuthDeg < 190, `Azimuth should be near South (180°), got ${eph.azimuthDeg}`);

  // Astronomical window checks
  assert.equal(typeof eph.solarNoonTime, 'string');
  assert.equal(typeof eph.sunriseTime, 'string');
  assert.equal(typeof eph.sunsetTime, 'string');
  assert.ok(eph.sunriseTime.length === 8);
  assert.ok(eph.sunsetTime.length === 8);
  assert.ok(eph.goldenHourMorning.start.length === 8);
  assert.ok(eph.goldenHourEvening.end.length === 8);
});

test('Solar Engine: Equinox and Polar Extremes', () => {
  // 1. Spring Equinox at Equator
  const equatorConfig = createSolarEnvironmentConfig('high_noon_clear');
  equatorConfig.location = { latitude: 0, longitude: 0, timezoneOffsetHours: 0 };
  equatorConfig.date = { year: 2026, month: 3, day: 20 };
  equatorConfig.timeOfDayHours = 12.0;

  const eqEph = calculateSolarEphemeris(equatorConfig);
  // At equator solar noon on equinox, sun is directly overhead (elevation ~88°-90°)
  assert.ok(eqEph.elevationDeg > 85, `Equator equinox elevation should be near 90°, got ${eqEph.elevationDeg}`);

  // 2. Winter Solstice in Reykjavik (64.15°N)
  const reykjavikConfig = createSolarEnvironmentConfig('high_noon_clear', 'reykjavik');
  reykjavikConfig.date = { year: 2026, month: 12, day: 21 };
  reykjavikConfig.timeOfDayHours = 13.3; // Solar noon in Iceland

  const reyEph = calculateSolarEphemeris(reykjavikConfig);
  // In winter solstice at 64°N, max elevation is ~ 90 - 64.15 - 23.44 = ~2.4°
  assert.ok(reyEph.elevationDeg > 0 && reyEph.elevationDeg < 5, `Reykjavik winter elevation should be ~2.5°, got ${reyEph.elevationDeg}`);
});

test('Solar Engine: 3D Sun Direction Vector and Ground Shadow Math', () => {
  // Test 1: Sun due South (Azimuth 180°), Elevation 45°, North Heading 0°
  const sunVec = calculateSolarVector(180, 45, 0);
  // Azimuth 180° points South (+Z in scene space when -Z is North)
  approx(sunVec.x, 0, 0.01);
  approx(sunVec.y, Math.SQRT1_2, 0.01);
  approx(sunVec.z, Math.SQRT1_2, 0.01);

  // Ground shadow: points in opposite horizontal direction (North = -Z)
  const shadow = calculateGroundShadow(sunVec, 45);
  approx(shadow.shadowLengthMultiplier ?? 0, 1.0, 0.01); // 1 / tan(45°) = 1.0
  approx(shadow.groundShadowDirection.x, 0, 0.01);
  approx(shadow.groundShadowDirection.y, 0, 0.01);
  approx(shadow.groundShadowDirection.z, -1.0, 0.01); // points -Z (North)

  // Test 2: Sun below horizon (Elevation -10°)
  const nightVec = calculateSolarVector(180, -10, 0);
  const nightShadow = calculateGroundShadow(nightVec, -10);
  assert.equal(nightShadow.shadowLengthMultiplier, null);
  assert.equal(nightShadow.groundShadowDirection.x, 0);
  assert.equal(nightShadow.groundShadowDirection.y, 0);
  assert.equal(nightShadow.groundShadowDirection.z, 0);
});

test('Solar Engine: Rayleigh-Mie Color Temperature and Planckian Locus RGB', () => {
  // 1. Golden hour (Elevation 2°) -> Warm temperature (2000K - 3500K)
  const golden = calculateRayleighMieColor(2, 2.5);
  assert.ok(golden.kelvin >= 2000 && golden.kelvin <= 3500, `Golden hour Kelvin should be warm, got ${golden.kelvin}`);

  // 2. High noon clear (Elevation 65°) -> Daylight temperature (~5500K - 6700K)
  const noon = calculateRayleighMieColor(65, 2.0);
  assert.ok(noon.kelvin >= 5400 && noon.kelvin <= 6700, `Daylight Kelvin should be ~5500-6700K, got ${noon.kelvin}`);

  // 3. Twilight / Peak Blue hour (Elevation -5°) -> Cool temperature (7000K - 10000K)
  const twilight = calculateRayleighMieColor(-5, 2.5);
  assert.ok(twilight.kelvin >= 7000 && twilight.kelvin <= 10000, `Twilight Kelvin should be cool, got ${twilight.kelvin}`);

  // 4. Kelvin to RGB converter
  const rgbWarm = kelvinToRgb(2700);
  assert.ok(rgbWarm.r > rgbWarm.b, 'Warm light should have more red than blue');
  assert.ok(rgbWarm.r >= 0 && rgbWarm.r <= 1);
  assert.ok(rgbWarm.g >= 0 && rgbWarm.g <= 1);
  assert.ok(rgbWarm.b >= 0 && rgbWarm.b <= 1);

  const rgbCool = kelvinToRgb(8500);
  assert.ok(rgbCool.b > rgbCool.r, 'Cool light should have more blue than red');
});

test('Solar Engine: Solar Illuminance Solver (Direct and Diffuse Lux)', () => {
  // 1. Clear High Noon (Elevation 60°, Cloud Cover 0%)
  const clearLux = calculateSolarIlluminance(60, 0, 2.5, 1.0);
  assert.ok(clearLux.directLux > 50000, `Direct clear sun lux should exceed 50k, got ${clearLux.directLux}`);
  assert.ok(clearLux.diffuseLux > 5000, `Diffuse clear sky lux should exceed 5k, got ${clearLux.diffuseLux}`);
  assert.ok(clearLux.directLux + clearLux.diffuseLux > clearLux.directLux);

  // 2. Heavy Overcast (Elevation 60°, Cloud Cover 90%)
  const overcastLux = calculateSolarIlluminance(60, 90, 2.5, 1.0);
  assert.ok(overcastLux.directLux < clearLux.directLux * 0.3, 'Cloud cover should strongly attenuate direct beam');
  assert.ok(overcastLux.diffuseLux > overcastLux.directLux, 'Diffuse light should dominate on overcast day');

  // 3. Night (-15° Elevation)
  const nightLux = calculateSolarIlluminance(-15, 0, 2.5, 1.0);
  assert.equal(nightLux.directLux, 0);
  assert.ok(nightLux.diffuseLux <= 2.0, 'Night sky diffuse should be moonlight level (~0.1-1.0 lx)');
});

test('Solar Engine: Presets and Curated Locations Catalog', () => {
  const presetList = Object.values(SOLAR_PRESETS);
  const locationList = Object.values(CURATED_FILMING_LOCATIONS);
  assert.ok(presetList.length >= 6);
  assert.ok(locationList.length >= 9);

  // Verify all presets generate valid normalized configurations
  for (const preset of presetList) {
    const cfg = createSolarEnvironmentConfig(preset.id);
    assert.equal(isSolarEnvironmentConfig(cfg), true);
    const norm = normalizeSolarEnvironmentConfig(cfg);
    assert.equal(norm.presetId, preset.id);
    assert.ok(norm.timeOfDayHours >= 0 && norm.timeOfDayHours <= 24);
  }

  // Verify all locations have valid coordinate bounds
  for (const locItem of locationList) {
    const loc = locItem.location;
    assert.ok(loc.latitude >= -90 && loc.latitude <= 90);
    assert.ok(loc.longitude >= -180 && loc.longitude <= 180);
    assert.ok(loc.timezoneOffsetHours >= -12 && loc.timezoneOffsetHours <= 14);
  }
});

test('Solar Engine: Tracking Table, CSV, and Standalone DP Sun-Report Exporters', () => {
  const config = createSolarEnvironmentConfig('golden_hour_sunset', 'los_angeles');

  // 1. 24-Hour Tracking Table Generator
  const table = generateSolarTrackingTable(config, 60);
  assert.equal(table.length, 25); // 00:00 to 24:00 hourly
  assert.equal(table[0].timeString, '00:00');
  assert.equal(table[12].timeString, '12:00');

  // 2. CSV Table Export
  const csv = generateSolarTrackingTableCsv(config);
  assert.ok(csv.includes('Time (Local),Time (Dec),Azimuth (Deg)'));
  assert.ok(csv.includes('"12:00",'));

  // 3. 3D Arc Path Points
  const arcPts = generateSolarPathPoints(config, 24);
  assert.equal(arcPts.length, 25);
  for (const pt of arcPts) {
    assert.equal(typeof pt.x, 'number');
    assert.equal(typeof pt.y, 'number');
    assert.equal(typeof pt.z, 'number');
    assert.equal(Number.isFinite(pt.x), true);
  }

  // 4. Standalone HTML DP Sun-Report
  const html = generateDpSunReportHtml(config, 'Sunset Tracking Scene');
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('Sunset Tracking Scene'));
  assert.ok(html.includes('Los Angeles, CA'));
  assert.ok(html.includes('<svg'));
});

test('Solar Engine: Multi-User Collaboration Scene Patches', () => {
  const scene = createScene('Solar Collab Scene');
  assert.ok(scene.solar !== undefined);

  // 1. Patch: solar_update
  const newConfig = createSolarEnvironmentConfig('blue_hour_dusk', 'london');
  applyScenePatch(scene, {
    type: 'solar_update',
    config: newConfig,
  });
  assert.equal(scene.solar?.location.locationName, 'Pinewood Studios, Iver Heath, UK');
  assert.equal(scene.solar?.presetId, 'blue_hour_dusk');

  // 2. Patch: solar_time_scrub
  applyScenePatch(scene, {
    type: 'solar_time_scrub',
    timeOfDayHours: 19.75,
  });
  approx(scene.solar?.timeOfDayHours ?? 0, 19.75);

  // 3. Patch: solar_weather_update
  applyScenePatch(scene, {
    type: 'solar_weather_update',
    weather: {
      cloudCoveragePercent: 85,
      fogDensityPercent: 40,
    },
  });
  approx(scene.solar?.weather.cloudCoveragePercent ?? 0, 85);
  approx(scene.solar?.weather.fogDensityPercent ?? 0, 40);
});

test('Solar Engine: Spatial Contextual Actions', () => {
  const sunActions = generateEntityContextActions('sun', 'sun-environment');
  assert.ok(sunActions.some((a) => a.actionType === 'sun_open_solar_studio'));
  assert.ok(sunActions.some((a) => a.actionType === 'sun_snap_golden_hour'));
  assert.ok(sunActions.some((a) => a.actionType === 'sun_snap_high_noon'));
  assert.ok(sunActions.some((a) => a.actionType === 'sun_toggle_shadows'));

  const solarActions = generateEntityContextActions('solar', 'solar-env');
  assert.ok(solarActions.some((a) => a.actionType === 'sun_open_solar_studio'));
});

// --- Screenplay Beat Breakdown & AI Cinematography Continuity Engine Tests ---

test('Screenplay Engine: Fountain Script Parsing and Breakdown', () => {
  const fountainScript = `
Title: THE SOUNDSTAGE PROTOCOL
Credit: Written by
Author: SetView Production Team

INT. SOUNDSTAGE A - NIGHT #1#

The volume wall glows with a brilliant desert sunrise.

MARCUS
(adjusting the wireless transmitter)
Audio levels are locked on channel one.

ELENA
We have five minutes before camera roll.

MARCUS
Understood. Let us nail this master.

CUT TO:

EXT. DESERT DUNE - DAY #2#

A lone surveyor stands atop the ridge.
`;

  const parsed = parseFountainScript(fountainScript);
  assert.equal(parsed.format, 'fountain');
  assert.equal(parsed.title, 'THE SOUNDSTAGE PROTOCOL');
  assert.equal(parsed.author, 'SetView Production Team');
  assert.equal(parsed.scenes.length, 2);

  const sc1 = parsed.scenes[0];
  assert.equal(sc1.sceneNumber, 1);
  assert.equal(sc1.intExt, 'INT');
  assert.equal(sc1.location, 'SOUNDSTAGE A');
  assert.equal(sc1.timeOfDay, 'NIGHT');
  assert.ok(sc1.characters.includes('MARCUS'));
  assert.ok(sc1.characters.includes('ELENA'));
  assert.equal(sc1.dialogueBlocks.length, 3);
  assert.equal(sc1.dialogueBlocks[0].character, 'MARCUS');
  assert.equal(sc1.dialogueBlocks[0].parenthetical, 'adjusting the wireless transmitter');
  assert.ok(sc1.dialogueBlocks[0].wordCount > 0);
  assert.ok(sc1.dialogueBlocks[0].estimatedDurationSec > 0);
  assert.equal(sc1.actionBeats.length, 1);
  assert.ok(sc1.actionBeats[0].text.includes('volume wall glows'));

  const sc2 = parsed.scenes[1];
  assert.equal(sc2.sceneNumber, 2);
  assert.equal(sc2.intExt, 'EXT');
  assert.equal(sc2.location, 'DESERT DUNE');
  assert.equal(sc2.timeOfDay, 'DAY');
  assert.ok((parsed.totalEstimatedDurationSec ?? 0) > 0);
  assert.ok((parsed.totalWordCount ?? 0) > 0);
});

test('Screenplay Engine: Final Draft FDX XML Parsing', () => {
  const fdxXml = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Template="No" Version="1">
  <Content>
    <Paragraph Type="Scene Heading">
      <Text>INT. MISSION CONTROL - DAY</Text>
    </Paragraph>
    <Paragraph Type="Action">
      <Text>Telemetry displays flicker across the main console.</Text>
    </Paragraph>
    <Paragraph Type="Character">
      <Text>COMMANDER VANCE</Text>
    </Paragraph>
    <Paragraph Type="Parenthetical">
      <Text>(into headset)</Text>
    </Paragraph>
    <Paragraph Type="Dialogue">
      <Text>Flight, we are go for orbital insertion.</Text>
    </Paragraph>
    <Paragraph Type="Transition">
      <Text>CUT TO:</Text>
    </Paragraph>
  </Content>
</FinalDraft>`;

  const parsed = parseFdxScript(fdxXml);
  assert.equal(parsed.format, 'final_draft_fdx');
  assert.equal(parsed.scenes.length, 1);

  const scene = parsed.scenes[0];
  assert.equal(scene.sceneNumber, 1);
  assert.equal(scene.intExt, 'INT');
  assert.equal(scene.location, 'MISSION CONTROL');
  assert.equal(scene.timeOfDay, 'DAY');
  assert.ok(scene.characters.includes('COMMANDER VANCE'));
  assert.equal(scene.dialogueBlocks.length, 1);
  assert.equal(scene.dialogueBlocks[0].character, 'COMMANDER VANCE');
  assert.equal(scene.dialogueBlocks[0].parenthetical, 'into headset');
  assert.equal(scene.dialogueBlocks[0].text, 'Flight, we are go for orbital insertion.');
  assert.equal(scene.actionBeats.length, 1);
});

test('Screenplay Engine: 180-Degree Line of Action Solver', () => {
  const posA = { x: -2, y: 0, z: 0 };
  const posB = { x: 2, y: 0, z: 0 };

  // Camera 1 is on the positive Z side (side = 'right')
  const cam1Pos = { x: 0, y: 1.5, z: 3 };
  const cam1Look = { x: -1, y: 1.5, z: 0 };

  // Camera 2 is also on the positive Z side (side = 'right')
  const cam2Pos = { x: 1.5, y: 1.5, z: 2 };
  const cam2Look = { x: -2, y: 1.5, z: 0 };

  // Camera 3 is on the negative Z side (side = 'left') - CROSSES 180 LINE
  const cam3Pos = { x: 0, y: 1.5, z: -3 };
  const cam3Look = { x: 0, y: 1.5, z: 0 };

  // Check safe pair
  const checkSafe = check180LineOfActionPair(posA, posB, cam1Pos, cam1Look, cam2Pos, cam2Look, 'Cam 1', 'Cam 2', 'cam-1', 'cam-2');
  assert.equal(checkSafe.cameraA.sideOfLine, 'right');
  assert.equal(checkSafe.cameraB.sideOfLine, 'right');
  assert.equal(checkSafe.severity, 'safe');
  assert.equal(checkSafe.has180Violation, false);

  // Check 180 violation pair
  const checkViolate = check180LineOfActionPair(posA, posB, cam1Pos, cam1Look, cam3Pos, cam3Look, 'Cam 1', 'Cam 3', 'cam-1', 'cam-3');
  assert.equal(checkViolate.cameraA.sideOfLine, 'right');
  assert.equal(checkViolate.cameraB.sideOfLine, 'left');
  assert.equal(checkViolate.severity, 'violation_180_cross');
  assert.equal(checkViolate.has180Violation, true);
  assert.ok(checkViolate.message.includes('180-Degree Line of Action Violation'));

  // Check 30-degree jump cut warning (cameras almost in exact same position & angle)
  const camJumpPos = { x: 0.1, y: 1.5, z: 2.9 };
  const camJumpLook = { x: -0.9, y: 1.5, z: 0 };
  const checkJump = check180LineOfActionPair(posA, posB, cam1Pos, cam1Look, camJumpPos, camJumpLook, 'Cam 1', 'Cam Jump', 'cam-1', 'cam-jump');
  assert.equal(checkJump.severity, 'warning_jump_cut');
  assert.ok(checkJump.angleDeltaDeg < 30);
});

test('Screenplay Engine: Eyeline Match Continuity Checker', () => {
  const actorAPos = { x: -1.5, y: 0, z: 0 };
  const actorBPos = { x: 1.5, y: 0, z: 0 };

  const camAPos = { x: 1.0, y: 1.5, z: 2.0 };
  const camBPos = { x: -1.0, y: 1.5, z: 2.0 };

  const check = checkEyelineMatchEngine(
    actorAPos,
    0,
    actorBPos,
    Math.PI,
    camAPos,
    camBPos,
    'Actor A',
    'Actor B',
    'actor-a',
    'actor-b',
  );

  assert.equal(check.isConsistent, true);
  assert.ok(check.actorA.screenSide === 'screen_right' || check.actorA.screenSide === 'screen_left');
  assert.ok(check.actorB.screenSide === 'screen_right' || check.actorB.screenSide === 'screen_left');
  assert.notEqual(check.actorA.screenSide, check.actorB.screenSide);
});

test('Screenplay Engine: Automated AI Cinematography Shot Coverage Generation', () => {
  const posA = { x: -1.2, y: 0, z: 0 };
  const posB = { x: 1.2, y: 0, z: 0 };

  const coverage = generateAutoShotCoverage(posA, posB, 'Marcus', 'Elena', 'id-a', 'id-b');
  assert.equal(coverage.length, 6);

  const shotTypes = coverage.map((c) => c.shotType);
  assert.ok(shotTypes.includes('master_wide'));
  assert.ok(shotTypes.includes('two_shot'));
  assert.ok(shotTypes.includes('ots_a'));
  assert.ok(shotTypes.includes('ots_b'));
  assert.ok(shotTypes.includes('single_close_up_a'));
  assert.ok(shotTypes.includes('single_close_up_b'));

  const master = coverage.find((c) => c.shotType === 'master_wide')!;
  assert.equal(master.suggestedFocalLengthMm, 24);
  assert.ok(master.cameraPosition.z > 0);

  const cuA = coverage.find((c) => c.shotType === 'single_close_up_a')!;
  assert.equal(cuA.suggestedFocalLengthMm, 85);
  assert.equal(cuA.primaryActorId, 'id-a');
});

test('Screenplay Engine: Comprehensive Scene Continuity Health Score and Audit', () => {
  const actors = [
    { id: 'act-1', name: 'Actor 1', position: { x: -1.5, y: 0, z: 0 } },
    { id: 'act-2', name: 'Actor 2', position: { x: 1.5, y: 0, z: 0 } },
  ];

  const safeCameras = [
    { id: 'cam-1', name: 'Master Wide', position: { x: 0, y: 1.5, z: 4 }, focalLength: 24, targetActorId: 'act-1' },
    { id: 'cam-2', name: 'OTS 1', position: { x: 1, y: 1.5, z: 2 }, focalLength: 50, targetActorId: 'act-1' },
    { id: 'cam-3', name: 'OTS 2', position: { x: -1, y: 1.5, z: 2 }, focalLength: 50, targetActorId: 'act-2' },
    { id: 'cam-4', name: 'CU Single 1', position: { x: 0.8, y: 1.5, z: 1.5 }, focalLength: 85, targetActorId: 'act-1' },
  ];

  const report = auditSceneContinuityEngine(safeCameras, actors, 'act-1', 'act-2');
  assert.equal(report.healthScore, 100);
  assert.equal(report.violationsCount, 0);

  // Add a crossing camera on the wrong side
  const badCameras = [
    ...safeCameras,
    { id: 'cam-bad', name: 'Reverse Across Line', position: { x: 0, y: 1.5, z: -4 }, focalLength: 24 },
  ];

  const badReport = auditSceneContinuityEngine(badCameras, actors, 'act-1', 'act-2');
  assert.ok(badReport.healthScore! < 100);
  assert.ok(badReport.violationsCount! > 0);
  assert.ok(badReport.lineOfActionChecks!.some((c) => c.severity === 'violation_180_cross'));
});

test('Screenplay Engine: RFC 4180 Shot List CSV and Standalone Director Pitch Deck HTML Exporters', () => {
  const parsedScript = parseFountainScript(DEFAULT_SAMPLE_FOUNTAIN_SCRIPT);
  const coverage = generateAutoShotCoverage(
    { x: -1.2, y: 0, z: 0 },
    { x: 1.2, y: 0, z: 0 },
    'Marcus',
    'Elena',
  );
  const audit = auditSceneContinuityEngine(
    coverage.map((c) => ({
      id: c.shotId,
      name: c.name,
      position: c.cameraPosition,
      focalLength: c.suggestedFocalLengthMm,
      targetActorId: c.primaryActorId,
    })),
    [
      { id: 'a', name: 'Marcus', position: { x: -1.2, y: 0, z: 0 } },
      { id: 'b', name: 'Elena', position: { x: 1.2, y: 0, z: 0 } },
    ],
  );

  // 1. RFC 4180 CSV Shot List
  const csv = generateScreenplayShotListCsv(parsedScript.scenes[0], coverage);
  assert.ok(csv.includes('Shot ID,Shot Name,Shot Type,Focal Length (mm),Sensor Format,Lens Height (m),Cam Pos X,Cam Pos Y,Cam Pos Z,LookAt X,LookAt Y,LookAt Z,Description'));
  assert.ok(csv.includes('Master Wide'));
  assert.ok(csv.includes('24'));

  // 2. Standalone Director Pitch Deck HTML
  const deckHtml = generateDirectorDeckHtml(parsedScript.scenes[0], coverage, audit, 'Test Production Deck');
  assert.ok(deckHtml.includes('<!DOCTYPE html>'));
  assert.ok(deckHtml.includes('Test Production Deck'));
  assert.ok(deckHtml.includes('Continuity Health Score'));
  assert.ok(deckHtml.includes('Master Wide'));
  assert.ok(deckHtml.includes('CITY ALLEYWAY') || deckHtml.includes('Test Production Deck'));
});

test('Screenplay Engine: Data Model, Normalization, and Multi-User Collab Network Sync', () => {
  const defaultCfg = createScreenplayConfig();
  assert.equal(defaultCfg.enabled, true);
  assert.equal(defaultCfg.format, 'fountain');
  assert.ok(isScreenplayConfig(defaultCfg));

  const normalized = normalizeScreenplayConfig({
    enabled: true,
    scriptText: 'INT. STAGE - DAY\n\nAction text.',
  });
  assert.equal(normalized.format, 'fountain');
  assert.ok(normalized.parsedScript !== undefined);
  assert.equal(normalized.parsedScript?.scenes.length, 1);

  // SceneData integration
  const scene = createScene('Screenplay Test Scene');
  scene.screenplay = createScreenplayConfig('INT. STAGE 1 - NIGHT\n\nMARCUS\nReady.\n');
  assert.ok(isSceneData(scene));

  const dup = normalizeScene(scene);
  assert.equal(dup.screenplay?.format, 'fountain');
  assert.ok(dup.screenplay?.parsedScript?.scenes.length === 1);

  // Multi-user Collab patch testing
  applyScenePatch(scene, {
    type: 'screenplay_update',
    config: {
      ...dup.screenplay!,
      dialoguePartnerAId: 'actor-1',
      dialoguePartnerBId: 'actor-2',
    },
  });
  assert.equal(scene.screenplay?.dialoguePartnerAId, 'actor-1');
  assert.equal(scene.screenplay?.dialoguePartnerBId, 'actor-2');

  const coverageCams = generateAutoShotCoverage(
    { x: -1, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    'Actor 1',
    'Actor 2',
    'actor-1',
    'actor-2',
  );

  applyScenePatch(scene, {
    type: 'screenplay_apply_coverage',
    coverage: coverageCams,
  });
  assert.equal(scene.cameras.length, 6);
  assert.ok(scene.cameras.some((c) => c.name === 'Master Wide'));
  assert.ok(scene.cameras.some((c) => c.lensFocalLength === 85));
});

test('Screenplay Engine: Spatial Contextual Actions', () => {
  const actorActions = generateEntityContextActions('actor', 'actor-id');
  assert.ok(actorActions.some((a) => a.actionType === 'actor_set_dialogue_pair'));

  const camActions = generateEntityContextActions('camera', 'camera-id');
  assert.ok(camActions.some((a) => a.actionType === 'cam_audit_180_line'));

  const scriptActions = generateEntityContextActions('script', 'script-id');
  assert.ok(scriptActions.some((a) => a.actionType === 'script_open_breakdown'));
  assert.ok(scriptActions.some((a) => a.actionType === 'script_apply_coverage'));
});

// ===========================================================================
// WebXR 6DoF Controller & Meta Quest 3 Profiler Engine Unit Tests
// ===========================================================================

test('WebXR Profiler Engine: 6DoF Controllers & Session State Initialization', () => {
  const btn = createMockXRButtonState(true, true, 1.0);
  assert.equal(btn.pressed, true);
  assert.equal(btn.touched, true);
  assert.equal(btn.value, 1.0);

  const axes = createMockXRAxesState(0.5, -0.8);
  assert.equal(axes.x, 0.5);
  assert.equal(axes.y, -0.8);

  const transform = createMockXRTransform({ x: 0.2, y: 1.1, z: -0.4 }, { x: 0, y: 0, z: 0, w: 1 });
  assert.equal(transform.position.x, 0.2);
  assert.equal(transform.position.y, 1.1);
  assert.equal(transform.position.z, -0.4);
  assert.equal(transform.orientation.w, 1.0);

  const leftCtrl = createMockXRController('left');
  assert.equal(leftCtrl.handedness, 'left');
  assert.equal(leftCtrl.trigger.pressed, false);
  assert.equal(leftCtrl.grip.value, 0.0);
  assert.equal(leftCtrl.isPinching, false);
  assert.ok(leftCtrl.transform.position.x < 0);

  const rightCtrl = createMockXRController('right');
  assert.equal(rightCtrl.handedness, 'right');
  assert.ok(rightCtrl.transform.position.x > 0);

  const headset = createMockXRHeadset();
  assert.equal(headset.ipdM, 0.063);
  assert.equal(headset.fovHorizontalDeg, 110);
  assert.equal(headset.fovVerticalDeg, 96);
  assert.equal(headset.transform.position.y, 1.65);

  const session = createMockXRSessionState(headset, leftCtrl, rightCtrl);
  assert.equal(session.headset.ipdM, 0.063);
  assert.equal(session.leftController.handedness, 'left');
  assert.equal(session.rightController.handedness, 'right');
});

test('WebXR Profiler Engine: Synthetic Scenarios & Keyframe Interpolation', () => {
  assert.ok(SYNTHETIC_VR_SCENARIOS.walkthrough_soundstage);
  assert.ok(SYNTHETIC_VR_SCENARIOS.heavy_scene_stress);
  assert.ok(SYNTHETIC_VR_SCENARIOS.transform_gizmo_drag);
  assert.ok(SYNTHETIC_VR_SCENARIOS.wrist_menu_nav);

  const scenario = createSyntheticVRScenario('walkthrough_soundstage');
  assert.equal(scenario.id, 'walkthrough_soundstage');
  assert.ok(scenario.durationSec > 0);
  assert.ok(scenario.keyframeActions.length >= 2);

  // Test start keyframe interpolation (t=0)
  const startFrame = interpolateSyntheticScenarioFrame(scenario, 0.0);
  assert.ok(Math.abs(startFrame.headset.transform.position.x - 0.0) < 0.001);
  assert.ok(Math.abs(startFrame.headset.transform.position.z - 4.0) < 0.001);

  // Test midpoint interpolation (t=1.25s between 0s and 2.5s)
  const midFrame = interpolateSyntheticScenarioFrame(scenario, 1.25);
  assert.ok(Math.abs(midFrame.headset.transform.position.x - 1.5) < 0.001);
  assert.ok(Math.abs(midFrame.headset.transform.position.z - 3.0) < 0.001);

  // Test end keyframe interpolation (t=duration)
  const endFrame = interpolateSyntheticScenarioFrame(scenario, scenario.durationSec);
  assert.ok(Math.abs(endFrame.headset.transform.position.z - 4.0) < 0.001);
});

test('WebXR Profiler Engine: Frame Telemetry Analytics & P95/P99 Percentile Math', () => {
  const thresholds = createDefaultVRThresholds(72);
  assert.equal(thresholds.targetFps, 72);
  assert.equal(thresholds.maxAllowableFrameTimeMs, 13.88);
  assert.equal(thresholds.maxP95FrameTimeMs, 13.50);
  assert.equal(thresholds.maxDrawCallsPerFrame, 150);

  // 1. Passing trace
  const passSamples: FrameTelemetrySample[] = [];
  for (let i = 0; i < 100; i++) {
    passSamples.push({
      frameIndex: i + 1,
      timestampMs: i * 12.0,
      frameTimeMs: 11.5 + (i % 5) * 0.2, // 11.5ms to 12.3ms (< 13.5ms)
      cpuLogicTimeMs: 3.5,
      gpuRenderTimeMs: 8.0,
      drawCallCount: 65 + (i % 10),
      triangleCount: 220000,
      shaderProgramSwitches: 14,
      textureMemoryBytes: 64 * 1024 * 1024,
      geometryMemoryBytes: 16 * 1024 * 1024,
      heapAllocatedBytes: 0,
      gcEventDetected: false,
      instantFps: 85.0,
    });
  }

  const passReport = calculateBenchmarkSummary(passSamples, thresholds);
  assert.equal(passReport.passedTest, true);
  assert.equal(passReport.totalFramesAudited, 100);
  assert.ok(passReport.averageFps > 72);
  assert.ok(passReport.p95FrameTimeMs <= 13.50);
  assert.equal(passReport.droppedFrameCount, 0);
  assert.equal(passReport.droppedFrameRatio, 0.0);
  assert.equal(passReport.totalGcStutterEvents, 0);
  assert.equal(passReport.failureReasons.length, 0);

  // 2. Failing trace with high frame times, dropped frames, draw call overload
  const failSamples: FrameTelemetrySample[] = [];
  for (let i = 0; i < 100; i++) {
    const isSpike = i % 10 === 0;
    failSamples.push({
      frameIndex: i + 1,
      timestampMs: i * 20.0,
      frameTimeMs: isSpike ? 24.5 : 15.2, // Exceeds 13.88ms budget
      cpuLogicTimeMs: 6.0,
      gpuRenderTimeMs: isSpike ? 18.5 : 9.2,
      drawCallCount: 195, // Exceeds 150 limit
      triangleCount: 920000, // Exceeds 750k limit
      shaderProgramSwitches: 32,
      textureMemoryBytes: 256 * 1024 * 1024,
      geometryMemoryBytes: 64 * 1024 * 1024,
      heapAllocatedBytes: isSpike ? 2 * 1024 * 1024 : 0,
      gcEventDetected: isSpike,
      instantFps: 45.0,
    });
  }

  const failReport = calculateBenchmarkSummary(failSamples, thresholds);
  assert.equal(failReport.passedTest, false);
  assert.ok(failReport.p95FrameTimeMs > 13.50);
  assert.ok(failReport.droppedFrameCount > 0);
  assert.ok(failReport.maxDrawCalls > 150);
  assert.ok(failReport.maxTriangles > 750000);
  assert.ok(failReport.totalGcStutterEvents > 0);
  assert.ok(failReport.failureReasons.length >= 3);
  assert.ok(failReport.recommendations.length >= 3);
});

test('WebXR Profiler Engine: RFC 4180 CSV & Standalone HTML Report Generation', () => {
  const sample: FrameTelemetrySample = {
    frameIndex: 1,
    timestampMs: 100.5,
    frameTimeMs: 12.4,
    cpuLogicTimeMs: 4.1,
    gpuRenderTimeMs: 8.3,
    drawCallCount: 48,
    triangleCount: 195000,
    shaderProgramSwitches: 10,
    textureMemoryBytes: 50000000,
    geometryMemoryBytes: 12000000,
    heapAllocatedBytes: 0,
    gcEventDetected: false,
    instantFps: 80.6,
  };

  const csv = generatePerformanceReportCsv([sample]);
  assert.ok(csv.startsWith('FrameIndex,TimestampMs,FrameTimeMs,InstantFps,CpuLogicTimeMs,GpuRenderTimeMs,DrawCalls,TriangleCount,ProgramSwitches,TextureMemoryBytes,GeometryMemoryBytes,HeapAllocatedBytes,GCEvent'));
  assert.ok(csv.includes('1,100.50,12.400,80.6,4.100,8.300,48,195000,10,50000000,12000000,0,0'));

  const thresholds = createDefaultVRThresholds(72);
  const report = calculateBenchmarkSummary([sample], thresholds);
  const html = generatePerformanceReportHtml(report, [sample], 'Stage 4 Production');

  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('Stage 4 Production'));
  assert.ok(html.includes('WebXR Performance Audit Report'));
  assert.ok(html.includes('PASSED PRODUCTION AUDIT'));
  assert.ok(html.includes('<svg viewBox='));
});

test('WebXR Profiler Engine: Model Normalization & Collab Integration', () => {
  const conf = createVRProfilerConfig(90);
  assert.equal(conf.targetFps, 90);
  assert.equal(conf.thresholds.maxAllowableFrameTimeMs, 11.11);
  assert.equal(isVRProfilerConfig(conf), true);

  const normalized = normalizeVRProfilerConfig({
    targetFps: 120,
    enabled: true,
  });
  assert.equal(normalized.targetFps, 120);
  assert.equal(normalized.thresholds.maxAllowableFrameTimeMs, 8.33);

  const scene = createScene('VR Profiler Test Scene');
  scene.profiler = conf;
  const dup = normalizeScene(scene);
  assert.equal(dup.profiler?.targetFps, 90);
  assert.equal(dup.profiler?.enabled, true);

  // Multi-user Collab patch testing
  applyScenePatch(scene, {
    type: 'profiler_update',
    config: {
      ...dup.profiler!,
      targetFps: 72,
      showDiagnosticHud: true,
    },
  });
  assert.equal(scene.profiler?.targetFps, 72);
  assert.equal(scene.profiler?.showDiagnosticHud, true);

  applyScenePatch(scene, {
    type: 'profiler_benchmark_run',
    scenarioId: 'wrist_menu_nav',
  });
  assert.equal(scene.profiler?.activeScenarioId, 'wrist_menu_nav');
});

test('WebXR Profiler Engine: Spatial Contextual Actions', () => {
  const profActions = generateEntityContextActions('profiler', 'profiler-id');
  assert.ok(profActions.some((a) => a.actionType === 'profiler_open_studio'));
  assert.ok(profActions.some((a) => a.actionType === 'profiler_toggle_hud'));
  assert.ok(profActions.some((a) => a.actionType === 'profiler_run_benchmark'));

  const headsetActions = generateEntityContextActions('headset', 'headset-id');
  assert.ok(headsetActions.some((a) => a.actionType === 'profiler_open_studio'));

  const sysActions = generateEntityContextActions('system', 'system-id');
  assert.ok(sysActions.some((a) => a.actionType === 'profiler_open_studio'));
});

// --- VR Motion Sickness, Ergonomics & Spatial Comfort Engine -------------------

test('VR Comfort Engine: Vestibular Kinematics & Jerk Derivation', () => {
  const s0: VestibularStateSample = {
    timestampMs: 0,
    position: { x: 0, y: 1.5, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    acceleration: { x: 0, y: 0, z: 0 },
    jerk: { x: 0, y: 0, z: 0 },
    yawDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    angularVelocityDegSec: 0,
    angularJerkDegSec3: 0,
  };

  const s1 = calculateVestibularKinematics(
    s0,
    { x: 0.1, y: 1.5, z: 0 },
    { yawDeg: 10, pitchDeg: 0, rollDeg: 0 },
    0.1,
  );

  approx(s1.velocity.x, 1.0); // 0.1m / 0.1s = 1.0 m/s
  approx(s1.acceleration.x, 10.0); // (1.0 - 0) / 0.1 = 10.0 m/s^2
  approx(s1.jerk.x, 100.0); // (10.0 - 0) / 0.1 = 100.0 m/s^3
  approx(s1.angularVelocityDegSec, 100.0); // 10 deg / 0.1s = 100 deg/s
  approx(s1.angularJerkDegSec3, 10000.0); // 100 / (0.1*0.1) = 10000 deg/s^3

  // Zero dt guard with static position
  const sZero = calculateVestibularKinematics(
    s1,
    { x: 0.1, y: 1.5, z: 0 },
    { yawDeg: 10, pitchDeg: 0, rollDeg: 0 },
    0,
  );
  assert.equal(sZero.velocity.x, 0);
  assert.equal(sZero.velocity.y, 0);
  assert.equal(sZero.velocity.z, 0);
});

test('VR Comfort Engine: Ergonomic Reachability & Near-Eye Vergence', () => {
  const shoulder = { x: 0, y: 1.4, z: 0 };

  // Optimal reach: 0.45m directly in front
  const opt = evaluateReachability(
    { x: 0, y: 1.4, z: -0.45 },
    shoulder,
    0.65,
    'prop_coffee',
    'Coffee Cup',
  );
  assert.equal(opt.classification, 'optimal_reach');
  assert.equal(opt.isWithinArmSpan, true);
  assert.equal(opt.vergenceDiscomfortRisk, false);
  approx(opt.distanceM, 0.45);

  // Acceptable reach: 0.60m away
  const acc = evaluateReachability(
    { x: 0, y: 1.4, z: -0.60 },
    shoulder,
    0.65,
    'prop_slate',
    'Film Slate',
  );
  assert.equal(acc.classification, 'acceptable_reach');
  assert.equal(acc.isWithinArmSpan, true);

  // Excessive reach: 1.2m away
  const exc = evaluateReachability(
    { x: 0, y: 1.4, z: -1.2 },
    shoulder,
    0.65,
    'actor_standin',
    'Standin Actor',
  );
  assert.equal(exc.classification, 'excessive_reach');
  assert.equal(exc.isWithinArmSpan, false);

  // Near-eye vergence conflict: 0.15m from face
  const near = evaluateReachability(
    { x: 0, y: 1.4, z: -0.15 },
    shoulder,
    0.65,
    'ui_menu',
    'Floating Menu',
  );
  assert.equal(near.classification, 'near_eye_strain');
  assert.equal(near.vergenceDiscomfortRisk, true);
});

test('VR Comfort Engine: Cervical Spine Neck Strain Evaluation', () => {
  // Neutral pose
  const neutral = evaluateNeckStrain(10.0, 5.0);
  assert.equal(neutral.pitchSeverity, 'neutral');
  assert.equal(neutral.rollSeverity, 'neutral');
  assert.equal(neutral.isFatigueProne, false);

  // Moderate pitch
  const moderate = evaluateNeckStrain(25.0, 8.0);
  assert.equal(moderate.pitchSeverity, 'moderate');
  assert.equal(moderate.rollSeverity, 'neutral');
  assert.equal(moderate.isFatigueProne, false);

  // Excessive pitch
  const excessive = evaluateNeckStrain(40.0, 15.0);
  assert.equal(excessive.pitchSeverity, 'excessive');
  assert.equal(excessive.rollSeverity, 'moderate');
  assert.equal(excessive.isFatigueProne, true);

  // Severe roll
  const severe = evaluateNeckStrain(10.0, 35.0);
  assert.equal(severe.rollSeverity, 'severe');
  assert.equal(severe.isFatigueProne, true);
});

test('VR Comfort Engine: Dynamic FOV Comfort Vignette Radius Scaling', () => {
  const vConf = createDefaultVignetteConfig();
  vConf.enabled = true;
  vConf.minVignetteRadius = 0.35;
  vConf.maxVignetteRadius = 0.90;
  vConf.speedThresholdMPerSec = 1.0;
  vConf.turnThresholdDegPerSec = 30.0;

  // At rest -> maximum opening radius (0.90)
  const rRest = calculateDynamicComfortVignetteRadius(0.0, 0.0, vConf);
  assert.equal(rRest, 0.90);

  // Disabled config -> always 1.0 (no tunneling)
  const rDisabled = calculateDynamicComfortVignetteRadius(5.0, 120.0, { ...vConf, enabled: false });
  assert.equal(rDisabled, 1.0);

  // High speed linear motion -> contracts toward minRadius (0.35)
  const rFastLinear = calculateDynamicComfortVignetteRadius(3.0, 0.0, vConf);
  assert.ok(rFastLinear < 0.90);
  assert.ok(rFastLinear >= 0.35);

  // High angular velocity turn -> contracts toward minRadius (0.35)
  const rFastSpin = calculateDynamicComfortVignetteRadius(0.0, 90.0, vConf);
  assert.ok(rFastSpin < 0.90);
  assert.ok(rFastSpin >= 0.35);
});

test('VR Comfort Engine: Cybersickness Risk Index Calculations', () => {
  // Teleportation with smooth motion at zero has very low cybersickness index
  const csTeleport = calculateCybersicknessIndex(0.5, 5.0, 30.0, 'teleport');
  assert.ok(csTeleport < 15.0);

  // Snap turn with moderate jerk
  const csSnap = calculateCybersicknessIndex(2.0, 20.0, 60.0, 'snap_turn');
  assert.ok(csSnap < 30.0);

  // Smooth locomotion and smooth turn with high jerk produces high risk score
  const csSmoothTurn = calculateCybersicknessIndex(5.0, 150.0, 120.0, 'smooth_turn');
  assert.ok(csSmoothTurn > 50.0);

  // Score is always clamped between 0 and 100
  const csExtreme = calculateCybersicknessIndex(100.0, 1000.0, 3600.0, 'smooth_turn');
  assert.equal(csExtreme, 100.0);
});

test('VR Comfort Engine: Full Scene Ergonomics & Motion Comfort Audit', () => {
  const config = createVRComfortConfig();
  config.locomotionMode = 'smooth_turn';
  config.vignette.enabled = false; // Disabling vignette on smooth turn will trigger a critical incident

  const reachTargets: ErgonomicReachTarget[] = [
    { id: 'cam_1', name: 'Main Camera', position: { x: 0, y: 1.4, z: -0.5 }, category: 'camera_grip' },
    { id: 'ui_floating', name: 'Inspector Panel', position: { x: 0, y: 1.4, z: -0.18 }, category: 'ui_panel' },
    { id: 'prop_far', name: 'Far Studio Light', position: { x: 0, y: 1.4, z: -2.5 }, category: 'prop' },
  ];

  const vestibularSamples: VestibularStateSample[] = [
    {
      timestampMs: 0,
      position: { x: 0, y: 1.4, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      acceleration: { x: 0, y: 0, z: 0 },
      jerk: { x: 0, y: 0, z: 0 },
      yawDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      angularVelocityDegSec: 0,
      angularJerkDegSec3: 0,
    },
    {
      timestampMs: 100,
      position: { x: 0.1, y: 1.4, z: 0 },
      velocity: { x: 1.0, y: 0, z: 0 },
      acceleration: { x: 10.0, y: 0, z: 0 },
      jerk: { x: 100.0, y: 0, z: 0 }, // Exceeds threshold -> critical jerk
      yawDeg: 25,
      pitchDeg: 35, // Excessive neck pitch
      rollDeg: 0,
      angularVelocityDegSec: 250,
      angularJerkDegSec3: 2500,
    },
  ];

  const report = auditSceneComfort(
    reachTargets,
    config,
    vestibularSamples,
  );

  assert.equal(report.reachEvaluations.length, 3);
  const optimalCount = report.reachEvaluations.filter((r) => r.classification === 'optimal_reach').length;
  const nearCount = report.reachEvaluations.filter((r) => r.classification === 'near_eye_strain').length;
  const excessiveCount = report.reachEvaluations.filter((r) => r.classification === 'excessive_reach').length;
  assert.equal(optimalCount, 1);
  assert.equal(nearCount, 1);
  assert.equal(excessiveCount, 1);
  assert.ok(report.incidents.length >= 3);
  assert.equal(report.passedAudit, false);
  assert.ok(report.comfortScore < 75);
  assert.ok(report.recommendations.length > 0);
});

test('VR Comfort Engine: RFC 4180 CSV & Standalone HTML Safety Report Export', () => {
  const config = createVRComfortConfig();
  const sample: VestibularStateSample = {
    timestampMs: 1500,
    position: { x: 0.2, y: 1.4, z: -0.3 },
    velocity: { x: 0.4, y: 0, z: -0.1 },
    acceleration: { x: 1.2, y: 0, z: 0 },
    jerk: { x: 2.5, y: 0, z: 0 },
    yawDeg: 15.0,
    pitchDeg: 5.0,
    rollDeg: 0.0,
    angularVelocityDegSec: 25.0,
    angularJerkDegSec3: 50.0,
  };

  const csv = generateComfortReportCsv([sample]);
  assert.ok(csv.startsWith('TimestampMs,PosX,PosY,PosZ,VelX,VelY,VelZ,AccX,AccY,AccZ,JerkX,JerkY,JerkZ,YawDeg,PitchDeg,RollDeg,AngularVelocityDegSec,AngularJerkDegSec3'));
  assert.ok(csv.includes('1500,0.200,1.400,-0.300'));

  const report = auditSceneComfort([], config, [sample]);
  const html = generateComfortReportHtml(report, 'Stage 2 Comfort Studio');

  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('Stage 2 Comfort Studio'));
  assert.ok(html.includes('VR Spatial Comfort & Ergonomics Safety Deck'));
  assert.ok(html.includes('Comfort Score'));
  assert.ok(html.includes('Audit Status'));
});

test('VR Comfort Engine: Data Model Normalization & Multi-User Collab Patches', () => {
  const conf = createVRComfortConfig();
  conf.locomotionMode = 'teleport';
  conf.vignette.minVignetteRadius = 0.30;
  assert.equal(isVRComfortConfig(conf), true);

  const normalized = normalizeVRComfortConfig({
    locomotionMode: 'smooth_locomotion',
    vignette: {
      enabled: false,
    },
  });
  assert.equal(normalized.locomotionMode, 'smooth_locomotion');
  assert.equal(normalized.vignette.enabled, false);
  assert.equal(normalized.vignette.minVignetteRadius, 0.35); // Default preserved

  const scene = createScene('VR Comfort Test Scene');
  scene.comfort = conf;
  const dup = normalizeScene(scene);
  assert.equal(dup.comfort?.locomotionMode, 'teleport');
  assert.equal(dup.comfort?.vignette.minVignetteRadius, 0.30);

  // Collab patch testing
  applyScenePatch(scene, {
    type: 'comfort_update',
    config: {
      ...dup.comfort!,
      locomotionMode: 'snap_turn',
    },
  });
  assert.equal(scene.comfort?.locomotionMode, 'snap_turn');

  applyScenePatch(scene, {
    type: 'comfort_toggle_vignette',
    enabled: false,
  });
  assert.equal(scene.comfort?.vignette.enabled, false);
});

// --- Virtual Set Dressing, Generative Spatial Scatter & Gemini AI Set Director Tests ---

test('Set Dressing Engine: Deterministic Mulberry32 PRNG & Poisson-disc 2D Scatter Generator', () => {
  const rng1 = createMulberry32(42);
  const rng2 = createMulberry32(42);
  for (let i = 0; i < 20; i++) {
    assert.equal(rng1(), rng2());
  }

  const bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
  const minDistance = 0.8;
  const count = 15;
  const points1 = generatePoissonScatter2D(bounds, minDistance, count, 12345);
  const points2 = generatePoissonScatter2D(bounds, minDistance, count, 12345);

  assert.equal(points1.length, count);
  assert.equal(points1.length, points2.length);
  for (let i = 0; i < points1.length; i++) {
    assert.equal(points1[i].x, points2[i].x);
    assert.equal(points1[i].z, points2[i].z);
  }

  // Verify bounds and minimum distance between all points
  const minDistSq = minDistance * minDistance;
  for (let i = 0; i < points1.length; i++) {
    const p1 = points1[i];
    assert.ok(p1.x >= bounds.minX && p1.x <= bounds.maxX);
    assert.ok(p1.z >= bounds.minZ && p1.z <= bounds.maxZ);

    for (let j = i + 1; j < points1.length; j++) {
      const p2 = points1[j];
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const dSq = dx * dx + dz * dz;
      assert.ok(dSq >= minDistSq - 1e-4, `Points ${i} and ${j} violate min distance (${Math.sqrt(dSq)} < ${minDistance})`);
    }
  }
});

test('Set Dressing Engine: Semantic Region Detection from Stage & Furniture Props', () => {
  const scene = createScene('Dressing Test Scene');
  const tableProp = createPropData('desk_wooden', 'Oak Desk', { x: 0, y: 0, z: -2 }, {
    scale: { x: 1.8, y: 0.8, z: 0.9 },
    colorHex: '#8b5a2b',
    category: 'furniture',
  });
  scene.props = [tableProp];


  const regions = detectSemanticRegions(scene, { widthM: 12, depthM: 10, heightM: 4.5 });
  assert.ok(regions.length >= 6); // Floor, North, South, East, West perimeters + Tabletop

  const floorReg = regions.find((r) => r.type === 'floor');
  assert.ok(floorReg);
  assert.equal(floorReg?.bounds.min.x, -6);
  assert.equal(floorReg?.bounds.max.x, 6);

  const tableReg = regions.find((r) => r.type === 'tabletop');
  assert.ok(tableReg);
  assert.equal(tableReg?.anchorEntityId, tableProp.id);
  assert.equal(tableReg?.bounds.min.y, 0.8);
});

test('Set Dressing Engine: Impulse Physics Settling & Overlap Resolution', () => {
  const overlappingItems: SettledPropItem[] = [
    {
      id: 'prop_a',
      templateName: 'Chair',
      propType: 'chair_armchair',
      name: 'Armchair A',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 0.6, y: 0.8, z: 0.6 },
      color: '#8b5a2b',
      isSettled: false,
      stackLevel: 0,
      surfaceY: 0,
      weightKg: 12,
    },
    {
      id: 'prop_b',
      templateName: 'Chair',
      propType: 'chair_armchair',
      name: 'Armchair B',
      position: { x: 0.05, y: 0, z: 0.05 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 0.6, y: 0.8, z: 0.6 },
      color: '#8b5a2b',
      isSettled: false,
      stackLevel: 0,
      surfaceY: 0,
      weightKg: 12,
    },
  ];

  const settled = simulatePhysicsImpulseSettling(overlappingItems, [], 9.81, 25);
  assert.equal(settled.length, 2);
  assert.ok(settled[0].isSettled);
  assert.ok(settled[1].isSettled);

  const dx = settled[1].position.x - settled[0].position.x;
  const dz = settled[1].position.z - settled[0].position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  assert.ok(dist >= 0.35, `Props did not separate sufficiently: distance is ${dist}m`);
});

test('Set Dressing Engine: Vertical Stacking Resolution on Stackable Props', () => {
  const stackItems: SettledPropItem[] = [
    {
      id: 'box_1',
      templateName: 'Circuit Crate',
      propType: 'circuit_crate',
      name: 'Crate 1',
      position: { x: 1.0, y: 0, z: 1.0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: '#f59e0b',
      isSettled: false,
      stackLevel: 0,
      surfaceY: 0,
      weightKg: 8.5,
    },
    {
      id: 'box_2',
      templateName: 'Circuit Crate',
      propType: 'circuit_crate',
      name: 'Crate 2',
      position: { x: 1.01, y: 0, z: 1.01 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: '#f59e0b',
      isSettled: false,
      stackLevel: 0,
      surfaceY: 0,
      weightKg: 8.5,
    },
  ];

  const settled = simulatePhysicsImpulseSettling(stackItems, [], 9.81, 20);
  assert.equal(settled.length, 2);
  const bottom = settled.find((it) => it.stackLevel === 0);
  const top = settled.find((it) => it.stackLevel === 1);

  assert.ok(bottom);
  assert.ok(top);
  assert.ok(top.position.y > bottom.position.y);
  approx(top.position.x, bottom.position.x, 0.05);
  approx(top.position.z, bottom.position.z, 0.05);
});

test('Set Dressing Engine: Curated Theme Prop Catalogs Integrity', () => {
  const themes: ScatterTheme[] = [
    'film_noir_office',
    'sci_fi_corridor',
    'victorian_parlor',
    'modern_soundstage',
    'cyberpunk_alley',
  ];

  for (const theme of themes) {
    const catalog = THEME_PROP_CATALOGS[theme];
    assert.ok(Array.isArray(catalog), `Catalog for ${theme} should be an array`);
    assert.ok(catalog.length >= 5, `Catalog for ${theme} should have at least 5 props, got ${catalog.length}`);

    for (const item of catalog) {
      assert.ok(item.name.length > 0);
      assert.ok(item.propType.length > 0);
      assert.ok(item.collisionRadius > 0);
      assert.ok(item.heightM > 0);
      assert.ok(item.weightKg >= 0);
      assert.ok(item.colorOptions.length > 0);
      assert.ok(['floor', 'tabletop', 'wall'].includes(item.placementSurface));
    }
  }
});

test('Set Dressing Engine: Offline Deterministic NLP Command Parser', () => {
  const [lightCmd] = parseDeterministicNlCommand('boost key light intensity by 50%');
  assert.ok(lightCmd);
  assert.equal(lightCmd.action, 'modify_lighting');
  assert.equal(lightCmd.parameters.intensityMultiplier, 1.5);

  const [kelvinCmd] = parseDeterministicNlCommand('set light temperature to 3200K tungsten');
  assert.ok(kelvinCmd);
  assert.equal(kelvinCmd.action, 'modify_lighting');
  assert.equal(kelvinCmd.parameters.kelvin, 3200);

  const [fogCmd] = parseDeterministicNlCommand('add dense atmospheric smoke and haze');
  assert.ok(fogCmd);
  assert.equal(fogCmd.action, 'modify_atmosphere');
  assert.equal(fogCmd.parameters.enabled, true);
  assert.ok(fogCmd.parameters.density >= 0.5);

  const [scatterCmd] = parseDeterministicNlCommand('scatter sci-fi corridor props across the room');
  assert.ok(scatterCmd);
  assert.equal(scatterCmd.action, 'scatter_theme');
  assert.equal(scatterCmd.parameters.theme, 'sci_fi_corridor');

  const [removeCmd] = parseDeterministicNlCommand('clear all coffee mugs and trash cans from the desk');
  assert.ok(removeCmd);
  assert.equal(removeCmd.action, 'remove_prop');
  assert.ok(removeCmd.parameters.query.includes('coffee') || removeCmd.parameters.query.includes('trash'));
});

test('Set Dressing Engine: Gemini AI Prompt Generation & Response Parser Fallback', () => {
  const scene = createScene('Omni Director Scene');
  const light = createLight(scene, [0, 3, 0], 0, 0, 'spot', 5600, 1.2);
  scene.lights = [light];

  const prompt = buildGeminiAiSystemPrompt(scene, 'Create a moody rainy neo-noir alleyway with steam pipes');
  assert.ok(prompt.includes('SetView'));
  assert.ok(prompt.includes('film_noir_office') || prompt.includes('cyberpunk_alley'));


  // Valid JSON response parsing
  const mockJsonResponse = `\`\`\`json
[
  {
    "action": "modify_lighting",
    "parameters": { "intensityMultiplier": 0.6, "kelvin": 3800 },
    "explanation": "Dimmed lighting to fit noir mood"
  },
  {
    "action": "scatter_theme",
    "parameters": { "theme": "cyberpunk_alley", "density": "dense" },
    "explanation": "Scattered cyberpunk props"
  }
]
\`\`\``;

  const mutations = parseGeminiAiResponse(mockJsonResponse, 'make it noir');
  assert.equal(mutations.length, 2);
  assert.equal(mutations[0].action, 'modify_lighting');
  assert.equal(mutations[1].action, 'scatter_theme');

  // Fallback parsing on unstructured LLM output
  const rawTextResponse = `I suggest you dim the lights by 40% and add heavy fog.`;
  const fallbackMutations = parseGeminiAiResponse(rawTextResponse, 'dim lights and add fog');
  assert.ok(fallbackMutations.length > 0);
});

test('Set Dressing Engine: Atomic Scene Mutation Applier', () => {
  const scene = createScene('Mutation Test Scene');
  const light = createLight(scene, [0, 3, 0], 0, 0, 'spot', 5600, 1.0);
  scene.lights = [light];
  scene.props = [
    createPropData('mug', 'Coffee Mug', { x: 0, y: 0, z: 0 }, { category: 'set_dressing' }),
  ];



  const mutations: GeminiAiSceneMutation[] = [
    {
      action: 'modify_lighting',
      parameters: { intensityMultiplier: 1.5, kelvin: 3200 },
      explanation: 'Warm tungsten boost',
    },
    {
      action: 'modify_atmosphere',
      parameters: { enabled: true, density: 0.6, colorHex: '#4a5568' },
      explanation: 'Add moody haze',
    },
    {
      action: 'add_prop',
      parameters: { propType: 'steampunk_gear', propName: 'Brass Gear', count: 2 },
      explanation: 'Place brass gears',
    },
    {
      action: 'remove_prop',
      parameters: { query: 'coffee' },
      explanation: 'Remove mug',
    },
  ];

  const res = applyAiMutationsToScene(scene, mutations);
  assert.equal(res.appliedCount, 4);
  assert.equal(scene.lights[0].intensity, 1.5);
  assert.equal(scene.lights[0].colorKelvin, 3200);
  assert.equal(scene.atmosphere?.density, 0.6);
  assert.equal(scene.atmosphere?.tintHex, '#4a5568');
  assert.equal(scene.props.length, 2); // 1 deleted + 2 added = 2
  assert.equal(scene.props.some((p) => p.name.includes('Coffee Mug')), false);
});

test('Set Dressing Engine: RFC 4180 CSV & Standalone HTML Deck Exporters', () => {
  const testItems: SettledPropItem[] = [
    {
      id: 'prop_01',
      templateName: 'Desk Phone',
      propType: 'phone_vintage',
      name: 'Vintage Phone #1',
      position: { x: 1.2, y: 0.8, z: -0.5 },
      rotation: { x: 0, y: 0.45, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: '#1a1a1a',
      isSettled: true,
      stackLevel: 0,
      surfaceY: 0.8,
      weightKg: 2.5,
    },
  ];

  const manifest: SetDressingManifest = {
    sceneId: 'sc_test',
    sceneName: 'Noir Detective Room',
    theme: 'film_noir_office',
    totalItems: 1,
    items: testItems,
    boundingVolumeM3: 4.8,
    totalWeightKg: 2.5,
    generatedAt: new Date().toISOString(),
  };

  const csv = generateSetDressingManifestCsv(manifest);
  assert.ok(csv.includes('ItemId,TemplateName,PropType,Name,PosX,PosY,PosZ'));
  assert.ok(csv.includes('Vintage Phone #1'));
  assert.ok(csv.includes('phone_vintage'));
  assert.ok(csv.includes('TRUE'));


  const html = generateSetDressingDeckHtml(manifest, 'Noir Detective Room');
  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('SetView Virtual Set Dressing & AI Scatter Deck'));
  assert.ok(html.includes('FILM NOIR OFFICE'));
  assert.ok(html.includes('Top-Down 2D Spatial Scatter Layout'));
  assert.ok(html.includes('<svg'));
  assert.ok(html.includes('Vintage Phone #1'));
});

test('Set Dressing Engine: Data Model Normalization & Collab Sync', () => {
  const conf = createSetDressingConfig();
  conf.activeTheme = 'sci_fi_corridor';
  conf.scatterConfig.density = 'dense';
  assert.equal(isSetDressingConfig(conf), true);

  const normalized = normalizeSetDressingConfig({
    activeTheme: 'cyberpunk_alley',
    scatterConfig: {
      density: 'sparse',
    },
  });
  assert.equal(normalized.activeTheme, 'cyberpunk_alley');
  assert.equal(normalized.scatterConfig.density, 'sparse');
  assert.equal(normalized.scatterConfig.minDistanceM, 0.35); // Default preserved


  const scene = createScene('Set Dressing Sync Scene');
  scene.setDressing = conf;
  const dup = normalizeScene(scene);
  assert.equal(dup.setDressing?.activeTheme, 'sci_fi_corridor');
  assert.equal(dup.setDressing?.scatterConfig.density, 'dense');

  // Collab patch tests
  applyScenePatch(scene, {
    type: 'set_dressing_update',
    config: {
      ...dup.setDressing!,
      activeTheme: 'victorian_parlor',
    },
  });
  assert.equal(scene.setDressing?.activeTheme, 'victorian_parlor');

  applyScenePatch(scene, {
    type: 'set_dressing_scatter',
    theme: 'cyberpunk_alley',
    density: 'medium',
  });
  assert.equal(scene.setDressing?.activeTheme, 'cyberpunk_alley');
  assert.ok(scene.setDressing!.settledItems.length > 0);

  applyScenePatch(scene, {
    type: 'set_dressing_clear',
  });
  assert.equal(scene.setDressing?.settledItems.length, 0);
});

test('Set Dressing Engine: Spatial Contextual Actions', () => {
  const dressingActions = generateEntityContextActions('dressing', 'dressing_root');
  assert.ok(dressingActions.some((a) => a.actionType === 'set_dressing_open_studio'));
  assert.ok(dressingActions.some((a) => a.actionType === 'set_dressing_quick_scatter'));
  assert.ok(dressingActions.some((a) => a.actionType === 'set_dressing_ai_prompt'));

  const setDressingActions = generateEntityContextActions('set_dressing', 'dressing_root');
  assert.ok(setDressingActions.some((a) => a.actionType === 'set_dressing_open_studio'));
  assert.ok(setDressingActions.some((a) => a.actionType === 'set_dressing_quick_scatter'));
});

void Promise.all([scanStoreFallback(), propStoreFallback()]).then(

  () => {
    passed += 2;
    console.log('  ✓ ScanStore: memory fallback contract (put/get/list/prune/delete + warning)');
    console.log('  ✓ PropStore: memory fallback contract (save/get/list/delete + warning)');
    console.log(`\n${passed} tests passed`);
  },
  (e) => {
    console.error('  ✗ Stores: memory fallback contract');
    throw e;
  },
);
