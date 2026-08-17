// ---------------------------------------------------------------------------
// Multi-User Collaboration & WebRTC Session Domain Engine
//
// Pure domain module for real-time multi-user VR/AR session synchronization:
//   - Room code generation and validation (SET-XXX)
//   - Peer presence, roles (Director, DP, Gaffer, Actor, Observer), and devices
//   - Scene patch delta operations and deterministic state reconciliation
//   - Multi-user entity locks (preventing dual-grab race conditions)
//   - Spatial 3D voice audio panning, distance attenuation, and stereo angle math
//   - Typed JSON network protocol serialization and deserialization
//
// Architecture rule: Zero Three.js or DOM imports so all logic runs
// seamlessly in Node.js unit tests and headless environments.
// ---------------------------------------------------------------------------

import {
  type ActorData,
  type ArchitecturalSet,
  type AspectName,
  type AtmosphereConfig,
  type AudioCueData,
  type CameraKeyframe,
  type CameraSetupData,
  createArchitecturalSet,
  type DmxBridgeConfig,
  type DmxPatchEntry,
  type FocalLength,
  type GaussianCloudData,
  type LedVolumeConfig,
  type LedVolumeWall,
  type LightData,
  createLedVolumeConfig,
  normalizeArchitecturalSet,
  normalizeAtmosphereConfig,
  normalizeDmxBridgeConfig,
  normalizeDmxPatchEntry,
  normalizeGaussianCloud,
  normalizeLedVolumeConfig,
  normalizeLedVolumeWall,
  normalizeWallData,
  type PropData,
  type Quat,
  type SceneData,
  type Vec3,
  type WallData,
  type AcousticsConfig,
  type BoomMicEntity,
  type LavalierMicEntity,
  type SolarEnvironmentConfig,
  type WeatherConditions,
  type ScreenplayConfig,
  type ShotCoverageRecommendation,
  type VRProfilerConfig,
  type VRComfortConfig,
  createAcousticsConfig,
  createSolarEnvironmentConfig,
  createScreenplayConfig,
  createVRProfilerConfig,
  createVRComfortConfig,
  normalizeAcousticsConfig,
  normalizeBoomMicEntity,
  normalizeLavalierMicEntity,
  normalizeSolarEnvironmentConfig,
  normalizeScreenplayConfig,
  normalizeVRProfilerConfig,
  normalizeVRComfortConfig,
  parseFountainScript,
  type SetDressingConfig,
  type ScatterTheme,
  type ScatterDensity,
  type GeminiAiSceneMutation,
  type SettledPropItem,
  createSetDressingConfig,
  normalizeSetDressingConfig,
  generateThemeScatter,
  detectSemanticRegions,
  applyAiMutationsToScene,
} from './model.ts';

import type { StanceId } from './pose.ts';

/** Supported multi-user production roles on a virtual set. */
export type CollabRole = 'director' | 'dp' | 'gaffer' | 'actor' | 'observer';

/** Client device type for telemetry and avatar rendering. */
export type DeviceType = 'quest' | 'desktop' | 'mobile' | 'visionpro';

/** Role display metadata and default theme colors. */
export interface RoleMetadata {
  id: CollabRole;
  title: string;
  badgeLabel: string;
  defaultColorHex: string;
}

export const COLLAB_ROLES: Record<CollabRole, RoleMetadata> = {
  director: {
    id: 'director',
    title: 'Director',
    badgeLabel: 'DIR',
    defaultColorHex: '#3b82f6', // Electric Blue
  },
  dp: {
    id: 'dp',
    title: 'Director of Photography',
    badgeLabel: 'DP',
    defaultColorHex: '#10b981', // Emerald Green
  },
  gaffer: {
    id: 'gaffer',
    title: 'Gaffer / Lighting',
    badgeLabel: 'GAFF',
    defaultColorHex: '#f59e0b', // Amber
  },
  actor: {
    id: 'actor',
    title: 'Virtual Actor / Talent',
    badgeLabel: 'ACT',
    defaultColorHex: '#ec4899', // Hot Pink
  },
  observer: {
    id: 'observer',
    title: 'Observer / Production Guest',
    badgeLabel: 'OBS',
    defaultColorHex: '#8b5cf6', // Violet
  },
};

/** High-frequency spatial presence of a single connected peer. */
export interface PeerPose {
  position: Vec3;
  rotation: Quat;
}

export interface PeerHandPose extends PeerPose {
  isPinching?: boolean;
  isPointing?: boolean;
}

export interface PeerPointerRay {
  origin: Vec3;
  direction: Vec3;
  hitPoint?: Vec3;
  targetEntityId?: string;
}

export interface PeerPresence {
  id: string;
  name: string;
  role: CollabRole;
  color: string;
  deviceType: DeviceType;
  headPose: PeerPose;
  handLeft?: PeerHandPose;
  handRight?: PeerHandPose;
  pointerRay?: PeerPointerRay;
  activeCameraId?: string | null;
  lockedEntityId?: string | null;
  isSpeaking: boolean;
  isMuted: boolean;
  audioVolume: number; // 0.0 to 1.0
  pingMs: number;
  joinedAtTs: number;
  lastSeenTs: number;
}

/** Multi-user entity lock to prevent concurrent conflicting edits. */
export interface EntityLock {
  entityId: string;
  entityType: 'actor' | 'camera' | 'light' | 'audioCue' | 'prop' | 'wall';
  lockedByPeerId: string;
  lockedByPeerName?: string;
  lockedAtTs: number;
  expiresAtTs: number;
}

/** Operational delta patch types for synchronizing scene mutations. */
export type CollabScenePatch =
  | {
      type: 'actor_move';
      actorId: string;
      position: Vec3;
      rotationY: number;
      stance?: StanceId;
    }
  | {
      type: 'actor_add';
      actor: ActorData;
    }
  | {
      type: 'actor_remove';
      actorId: string;
    }
  | {
      type: 'actor_stance';
      actorId: string;
      stance: StanceId;
    }
  | {
      type: 'actor_keyframe_add';
      actorId: string;
      markIndex: number;
      position: Vec3;
      rotationY: number;
      stance?: StanceId;
      holdSeconds?: number;
    }
  | {
      type: 'camera_move';
      cameraId: string;
      position: Vec3;
      rotation: Quat;
      lensFocalLength?: FocalLength;
      tStop?: number;
      formatId?: string;
      aspect?: AspectName;
      focusDistanceM?: number;
      focusTargetActorId?: string | null;
    }
  | {
      type: 'camera_add';
      camera: CameraSetupData;
    }
  | {
      type: 'camera_remove';
      cameraId: string;
    }
  | {
      type: 'camera_keyframe_add';
      cameraId: string;
      markIndex: number;
      keyframe: CameraKeyframe;
    }
  | {
      type: 'light_update';
      lightId: string;
      position: Vec3;
      intensity?: number;
      kelvin?: number;
      coneAngleDeg?: number;
      active?: boolean;
    }
  | {
      type: 'light_add';
      light: LightData;
    }
  | {
      type: 'light_remove';
      lightId: string;
    }
  | {
      type: 'audio_cue_update';
      cue: AudioCueData;
    }
  | {
      type: 'audio_cue_remove';
      cueId: string;
    }
  | {
      type: 'prop_add';
      prop: PropData;
    }
  | {
      type: 'prop_move';
      propId: string;
      position: Vec3;
      rotationY?: number;
      rotationX?: number;
      rotationZ?: number;
      scale?: Vec3;
    }
  | {
      type: 'prop_update';
      propId: string;
      updates: Partial<PropData>;
    }
  | {
      type: 'prop_remove';
      propId: string;
    }
  | {
      type: 'timeline_transport';
      isPlaying: boolean;
      currentTimeS: number;
      playbackRate: number;
      isLooping: boolean;
      syncSeq: number;
    }
  | {
      type: 'scene_metadata';
      name?: string;
      walkSpeed?: number;
    }
  | {
      type: 'atmosphere_update';
      atmosphere: AtmosphereConfig;
    }
  | {
      type: 'architecture_update';
      architecture: ArchitecturalSet;
    }
  | {
      type: 'architecture_patch';
      wall?: WallData;
      wallIdToRemove?: string;
    }
  | {
      type: 'splat_cloud_add';
      cloud: GaussianCloudData;
    }
  | {
      type: 'splat_cloud_update';
      cloudId: string;
      updates: Partial<GaussianCloudData>;
    }
  | {
      type: 'splat_cloud_remove';
      cloudId: string;
    }
  | {
      type: 'splat_cloud_active';
      cloudId?: string;
    }
  | {
      type: 'dmx_bridge_update';
      config: DmxBridgeConfig;
    }
  | {
      type: 'dmx_patch_add';
      patch: DmxPatchEntry;
    }
  | {
      type: 'dmx_patch_remove';
      patchId: string;
    }
  | {
      type: 'dmx_patch_update';
      patchId?: string;
      updates?: Partial<DmxPatchEntry>;
      patch?: DmxPatchEntry;
    }
  | {
      type: 'dmx_cue_trigger';
      cueId: string;
    }
  | {
      type: 'icvfx_update';
      config: LedVolumeConfig;
    }
  | {
      type: 'icvfx_wall_add';
      wall: LedVolumeWall;
    }
  | {
      type: 'icvfx_wall_remove';
      wallId: string;
    }
  | {
      type: 'icvfx_wall_update';
      wallId: string;
      updates: Partial<LedVolumeWall>;
    }
  | {
      type: 'acoustics_update';
      config: AcousticsConfig;
    }
  | {
      type: 'acoustics_boom_add';
      mic: BoomMicEntity;
    }
  | {
      type: 'acoustics_boom_remove';
      micId: string;
    }
  | {
      type: 'acoustics_boom_update';
      micId: string;
      updates: Partial<BoomMicEntity>;
    }
  | {
      type: 'acoustics_lav_add';
      mic: LavalierMicEntity;
    }
  | {
      type: 'acoustics_lav_remove';
      micId: string;
    }
  | {
      type: 'solar_update';
      config: SolarEnvironmentConfig;
    }
  | {
      type: 'solar_time_scrub';
      timeOfDayHours: number;
    }
  | {
      type: 'solar_weather_update';
      weather: Partial<WeatherConditions>;
    }
  | {
      type: 'screenplay_update';
      config: ScreenplayConfig;
    }
  | {
      type: 'screenplay_import_script';
      scriptText: string;
    }
  | {
      type: 'screenplay_apply_coverage';
      coverage: ShotCoverageRecommendation[];
    }
  | {
      type: 'profiler_update';
      config: VRProfilerConfig;
    }
  | {
      type: 'profiler_benchmark_run';
      scenarioId: string;
    }
  | {
      type: 'comfort_update';
      config: VRComfortConfig;
    }
  | {
      type: 'comfort_toggle_vignette';
      enabled?: boolean;
    }
  | {
      type: 'set_dressing_update';
      config: SetDressingConfig;
    }
  | {
      type: 'set_dressing_scatter';
      theme: ScatterTheme;
      density?: ScatterDensity;
      regionId?: string;
      items?: SettledPropItem[];
    }

  | {
      type: 'set_dressing_ai_mutate';
      mutations: GeminiAiSceneMutation[];
    }
  | {
      type: 'set_dressing_clear';
    };


/** Network protocol message envelope. */
export type CollabMessage =
  | {
      type: 'join';
      peerId: string;
      name: string;
      role: CollabRole;
      color: string;
      deviceType: DeviceType;
      clientVersion: string;
    }
  | {
      type: 'leave';
      peerId: string;
      reason?: string;
    }
  | {
      type: 'presence';
      peerId: string;
      presence: Partial<PeerPresence>;
    }
  | {
      type: 'snapshot_request';
      requesterId: string;
    }
  | {
      type: 'snapshot_response';
      sceneData: SceneData;
      roomCode: string;
      hostPeerId: string;
      locks: EntityLock[];
    }
  | {
      type: 'scene_patch';
      patchId: string;
      sourcePeerId: string;
      patch: CollabScenePatch;
      ts: number;
    }
  | {
      type: 'lock_request';
      entityId: string;
      entityType: 'actor' | 'camera' | 'light' | 'audioCue' | 'prop' | 'wall';
      peerId: string;
    }
  | {
      type: 'lock_granted';
      entityId: string;
      peerId: string;
      expiresAtTs: number;
    }
  | {
      type: 'lock_rejected';
      entityId: string;
      peerId: string;
      currentOwnerId: string;
    }
  | {
      type: 'lock_released';
      entityId: string;
      peerId: string;
    }
  | {
      type: 'laser_ping';
      peerId: string;
      origin: Vec3;
      hitPoint: Vec3;
      label?: string;
    }
  | {
      type: 'director_cue';
      peerId: string;
      cueText: string;
      targetActorId?: string;
      targetCameraId?: string;
    }
  | {
      type: 'ping';
      senderId: string;
      clientTs: number;
    }
  | {
      type: 'pong';
      senderId: string;
      originalClientTs: number;
      serverTs: number;
    };

/** Generates a human-friendly 6-character room code like SET-492. */
export function generateRoomCode(): string {
  const num = Math.floor(100 + Math.random() * 900);
  return `SET-${num}`;
}

/** Validates room code format (e.g. SET-123, SET-ABC, or 4-8 alphanumeric chars). */
export function isValidRoomCode(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const trimmed = code.trim().toUpperCase();
  return /^SET-[A-Z0-9]{3}$/.test(trimmed) || /^[A-Z0-9]{4,8}$/.test(trimmed);
}

/** Standardizes room code string to uppercase SET-XXX format when appropriate. */
export function normalizeRoomCode(code: string): string {
  if (!code || typeof code !== 'string') return '';
  const trimmed = code.trim().toUpperCase();
  if (/^SET-[A-Z0-9]{3,4}$/.test(trimmed)) return trimmed;
  if (/^[A-Z0-9]{3}$/.test(trimmed)) return `SET-${trimmed}`;
  if (/^[A-Z0-9]{4,8}$/.test(trimmed)) return trimmed;
  return '';
}

/** Generates a unique peer ID. */
export function generatePeerId(): string {
  const rand = Math.random().toString(36).substring(2, 9);
  return `peer-${Date.now().toString(36)}-${rand}`;
}

/** Generates a unique patch ID. */
export function generatePatchId(): string {
  return `patch-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
}

/** Factory for creating initial peer presence record. */
export function createPeerPresence(
  id: string,
  name: string,
  role: CollabRole = 'director',
  color?: string,
  deviceType: DeviceType = 'desktop',
): PeerPresence {
  const meta = COLLAB_ROLES[role] ?? COLLAB_ROLES.director;
  return {
    id,
    name: name.trim() || meta.title,
    role,
    color: color || meta.defaultColorHex,
    deviceType,
    headPose: {
      position: { x: 0, y: 1.6, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
    activeCameraId: null,
    lockedEntityId: null,
    isSpeaking: false,
    isMuted: false,
    audioVolume: 0,
    pingMs: 0,
    joinedAtTs: Date.now(),
    lastSeenTs: Date.now(),
  };
}

/**
 * Applies a CollabScenePatch to a SceneData object in-place.
 * Returns true if the patch was applied, false if target was missing.
 * Pure.
 */
export function applyScenePatch(scene: SceneData, patch: CollabScenePatch): boolean {
  switch (patch.type) {
    case 'actor_move': {
      const actor = scene.actors.find((a) => a.id === patch.actorId);
      if (!actor) return false;
      actor.position = { ...patch.position };
      actor.rotationY = patch.rotationY;
      if (patch.stance) actor.stance = patch.stance;
      return true;
    }
    case 'actor_add': {
      if (!scene.actors.some((a) => a.id === patch.actor.id)) {
        scene.actors.push(JSON.parse(JSON.stringify(patch.actor)));
      }
      return true;
    }
    case 'actor_remove': {
      const idx = scene.actors.findIndex((a) => a.id === patch.actorId);
      if (idx === -1) return false;
      scene.actors.splice(idx, 1);
      return true;
    }
    case 'actor_stance': {
      const actor = scene.actors.find((a) => a.id === patch.actorId);
      if (!actor) return false;
      actor.stance = patch.stance;
      return true;
    }
    case 'actor_keyframe_add': {
      const actor = scene.actors.find((a) => a.id === patch.actorId);
      if (!actor) return false;
      if (!actor.keyframes) actor.keyframes = [];
      actor.keyframes[patch.markIndex] = {
        position: { ...patch.position },
        rotationY: patch.rotationY,
        ...(patch.stance ? { stance: patch.stance } : {}),
      };
      return true;
    }
    case 'camera_move': {
      const cam = scene.cameras.find((c) => c.id === patch.cameraId);
      if (!cam) return false;
      cam.position = { ...patch.position };
      cam.rotation = { ...patch.rotation };
      if (patch.lensFocalLength !== undefined) cam.lensFocalLength = patch.lensFocalLength;
      if (patch.tStop !== undefined) cam.tStop = patch.tStop;
      if (patch.formatId !== undefined) cam.formatId = patch.formatId;
      if (patch.aspect !== undefined) cam.aspect = patch.aspect;
      if (patch.focusDistanceM !== undefined) cam.focusDistanceM = patch.focusDistanceM;
      if (patch.focusTargetActorId !== undefined) cam.focusTargetActorId = patch.focusTargetActorId || undefined;
      return true;
    }
    case 'camera_add': {
      if (!scene.cameras.some((c) => c.id === patch.camera.id)) {
        scene.cameras.push(JSON.parse(JSON.stringify(patch.camera)));
      }
      return true;
    }
    case 'camera_remove': {
      const idx = scene.cameras.findIndex((c) => c.id === patch.cameraId);
      if (idx === -1) return false;
      scene.cameras.splice(idx, 1);
      return true;
    }
    case 'camera_keyframe_add': {
      const cam = scene.cameras.find((c) => c.id === patch.cameraId);
      if (!cam) return false;
      if (!cam.keyframes) cam.keyframes = [];
      cam.keyframes[patch.markIndex] = JSON.parse(JSON.stringify(patch.keyframe));
      return true;
    }
    case 'light_update': {
      if (!scene.lights) scene.lights = [];
      const light = scene.lights.find((l) => l.id === patch.lightId);
      if (!light) return false;
      if (Array.isArray(patch.position)) {
        light.position = [patch.position[0], patch.position[1], patch.position[2]];
      } else if (patch.position && typeof patch.position === 'object') {
        light.position = [patch.position.x, patch.position.y, patch.position.z];
      }
      if (patch.intensity !== undefined) light.intensity = patch.intensity;
      if (patch.kelvin !== undefined) {
        light.colorKelvin = patch.kelvin;
        (light as unknown as { kelvin?: number }).kelvin = patch.kelvin;
      }
      if (patch.coneAngleDeg !== undefined) light.coneAngleDeg = patch.coneAngleDeg;
      return true;
    }
    case 'light_add': {
      if (!scene.lights) scene.lights = [];
      if (!scene.lights.some((l) => l.id === patch.light.id)) {
        scene.lights.push(JSON.parse(JSON.stringify(patch.light)));
      }
      return true;
    }
    case 'light_remove': {
      if (!scene.lights) return false;
      const idx = scene.lights.findIndex((l) => l.id === patch.lightId);
      if (idx === -1) return false;
      scene.lights.splice(idx, 1);
      return true;
    }
    case 'audio_cue_update': {
      if (!scene.audioCues) scene.audioCues = [];
      const idx = scene.audioCues.findIndex((c) => c.id === patch.cue.id);
      if (idx >= 0) {
        scene.audioCues[idx] = JSON.parse(JSON.stringify(patch.cue));
      } else {
        scene.audioCues.push(JSON.parse(JSON.stringify(patch.cue)));
      }
      return true;
    }
    case 'audio_cue_remove': {
      if (!scene.audioCues) return false;
      const idx = scene.audioCues.findIndex((c) => c.id === patch.cueId);
      if (idx === -1) return false;
      scene.audioCues.splice(idx, 1);
      return true;
    }
    case 'prop_add': {
      if (!scene.props) scene.props = [];
      if (!scene.props.some((p) => p.id === patch.prop.id)) {
        scene.props.push(JSON.parse(JSON.stringify(patch.prop)));
      }
      return true;
    }
    case 'prop_move': {
      if (!scene.props) return false;
      const prop = scene.props.find((p) => p.id === patch.propId);
      if (!prop) return false;
      prop.position = { ...patch.position };
      if (patch.rotationY !== undefined) prop.rotationY = patch.rotationY;
      if (patch.rotationX !== undefined) prop.rotationX = patch.rotationX;
      if (patch.rotationZ !== undefined) prop.rotationZ = patch.rotationZ;
      if (patch.scale) prop.scale = { ...patch.scale };
      return true;
    }
    case 'prop_update': {
      if (!scene.props) return false;
      const prop = scene.props.find((p) => p.id === patch.propId);
      if (!prop) return false;
      Object.assign(prop, JSON.parse(JSON.stringify(patch.updates)));
      return true;
    }
    case 'prop_remove': {
      if (!scene.props) return false;
      const idx = scene.props.findIndex((p) => p.id === patch.propId);
      if (idx === -1) return false;
      scene.props.splice(idx, 1);
      return true;
    }
    case 'timeline_transport': {
      // Scene timeline transport is handled by runtime KeyframeSystem
      return true;
    }
    case 'scene_metadata': {
      if (patch.name !== undefined) scene.name = patch.name;
      if (patch.walkSpeed !== undefined) scene.walkSpeed = patch.walkSpeed;
      return true;
    }
    case 'atmosphere_update': {
      scene.atmosphere = normalizeAtmosphereConfig(patch.atmosphere);
      return true;
    }
    case 'architecture_update': {
      scene.architecture = normalizeArchitecturalSet(patch.architecture);
      return true;
    }
    case 'architecture_patch': {
      if (!scene.architecture) {
        scene.architecture = createArchitecturalSet(scene.name ? `${scene.name} Architecture` : 'Set Architecture');
      }
      if (patch.wallIdToRemove) {
        const idx = scene.architecture.walls.findIndex((w) => w.id === patch.wallIdToRemove);
        if (idx !== -1) {
          scene.architecture.walls.splice(idx, 1);
        }
      }
      if (patch.wall) {
        const normWall = normalizeWallData(patch.wall);
        const idx = scene.architecture.walls.findIndex((w) => w.id === normWall.id);
        if (idx >= 0) {
          scene.architecture.walls[idx] = normWall;
        } else {
          scene.architecture.walls.push(normWall);
        }
      }
      return true;
    }
    case 'splat_cloud_add': {
      if (!scene.gaussianClouds) scene.gaussianClouds = [];
      const norm = normalizeGaussianCloud(patch.cloud);
      const idx = scene.gaussianClouds.findIndex((c) => c.id === norm.id);
      if (idx >= 0) {
        scene.gaussianClouds[idx] = norm;
      } else {
        scene.gaussianClouds.push(norm);
      }
      if (!scene.activeSplatCloudId) {
        scene.activeSplatCloudId = norm.id;
      }
      return true;
    }
    case 'splat_cloud_update': {
      if (!scene.gaussianClouds) return false;
      const cloud = scene.gaussianClouds.find((c) => c.id === patch.cloudId);
      if (!cloud) return false;
      Object.assign(cloud, JSON.parse(JSON.stringify(patch.updates)));
      return true;
    }
    case 'splat_cloud_remove': {
      if (!scene.gaussianClouds) return false;
      const idx = scene.gaussianClouds.findIndex((c) => c.id === patch.cloudId);
      if (idx === -1) return false;
      scene.gaussianClouds.splice(idx, 1);
      if (scene.activeSplatCloudId === patch.cloudId) {
        scene.activeSplatCloudId = scene.gaussianClouds.length > 0 ? scene.gaussianClouds[0].id : undefined;
      }
      return true;
    }
    case 'splat_cloud_active': {
      scene.activeSplatCloudId = patch.cloudId;
      return true;
    }
    case 'dmx_bridge_update': {
      scene.dmxBridge = normalizeDmxBridgeConfig(patch.config);
      return true;
    }
    case 'dmx_patch_add': {
      if (!scene.dmxPatches) scene.dmxPatches = [];
      const normalized = normalizeDmxPatchEntry(patch.patch);
      const existingIdx = scene.dmxPatches.findIndex((p) => p.patchId === normalized.patchId);
      if (existingIdx >= 0) {
        scene.dmxPatches[existingIdx] = normalized;
      } else {
        scene.dmxPatches.push(normalized);
      }
      return true;
    }
    case 'dmx_patch_remove': {
      if (!scene.dmxPatches) return false;
      const idx = scene.dmxPatches.findIndex((p) => p.patchId === patch.patchId);
      if (idx === -1) return false;
      scene.dmxPatches.splice(idx, 1);
      return true;
    }
    case 'dmx_patch_update': {
      if (!scene.dmxPatches) return false;
      const targetId = patch.patchId ?? patch.patch?.patchId;
      if (!targetId) return false;
      const existing = scene.dmxPatches.find((p) => p.patchId === targetId);
      if (!existing) return false;
      if (patch.patch) {
        Object.assign(existing, JSON.parse(JSON.stringify(patch.patch)));
      } else if (patch.updates) {
        Object.assign(existing, JSON.parse(JSON.stringify(patch.updates)));
      }
      return true;
    }
    case 'dmx_cue_trigger': {
      return true;
    }
    case 'icvfx_update': {
      scene.icvfx = normalizeLedVolumeConfig(patch.config);
      return true;
    }
    case 'icvfx_wall_add': {
      if (!scene.icvfx) scene.icvfx = createLedVolumeConfig();
      const normWall = normalizeLedVolumeWall(patch.wall);
      const existingIdx = scene.icvfx.walls.findIndex((w) => w.id === normWall.id);
      if (existingIdx >= 0) {
        scene.icvfx.walls[existingIdx] = normWall;
      } else {
        scene.icvfx.walls.push(normWall);
      }
      return true;
    }
    case 'icvfx_wall_remove': {
      if (!scene.icvfx) return false;
      const idx = scene.icvfx.walls.findIndex((w) => w.id === patch.wallId);
      if (idx === -1) return false;
      scene.icvfx.walls.splice(idx, 1);
      return true;
    }
    case 'icvfx_wall_update': {
      if (!scene.icvfx) return false;
      const wall = scene.icvfx.walls.find((w) => w.id === patch.wallId);
      if (!wall) return false;
      Object.assign(wall, JSON.parse(JSON.stringify(patch.updates)));
      return true;
    }
    case 'acoustics_update': {
      scene.acoustics = normalizeAcousticsConfig(patch.config);
      return true;
    }
    case 'acoustics_boom_add': {
      if (!scene.acoustics) scene.acoustics = createAcousticsConfig();
      const normBoom = normalizeBoomMicEntity(patch.mic);
      const existingIdx = scene.acoustics.boomMics.findIndex((b) => b.id === normBoom.id);
      if (existingIdx !== -1) {
        scene.acoustics.boomMics[existingIdx] = normBoom;
      } else {
        scene.acoustics.boomMics.push(normBoom);
      }
      return true;
    }
    case 'acoustics_boom_remove': {
      if (!scene.acoustics) return false;
      const idx = scene.acoustics.boomMics.findIndex((b) => b.id === patch.micId);
      if (idx === -1) return false;
      scene.acoustics.boomMics.splice(idx, 1);
      return true;
    }
    case 'acoustics_boom_update': {
      if (!scene.acoustics) return false;
      const boom = scene.acoustics.boomMics.find((b) => b.id === patch.micId);
      if (!boom) return false;
      Object.assign(boom, JSON.parse(JSON.stringify(patch.updates)));
      return true;
    }
    case 'acoustics_lav_add': {
      if (!scene.acoustics) scene.acoustics = createAcousticsConfig();
      const normLav = normalizeLavalierMicEntity(patch.mic);
      const existingIdx = scene.acoustics.lavalierMics.findIndex((l) => l.id === normLav.id);
      if (existingIdx !== -1) {
        scene.acoustics.lavalierMics[existingIdx] = normLav;
      } else {
        scene.acoustics.lavalierMics.push(normLav);
      }
      return true;
    }
    case 'acoustics_lav_remove': {
      if (!scene.acoustics) return false;
      const idx = scene.acoustics.lavalierMics.findIndex((l) => l.id === patch.micId);
      if (idx === -1) return false;
      scene.acoustics.lavalierMics.splice(idx, 1);
      return true;
    }
    case 'solar_update': {
      scene.solar = normalizeSolarEnvironmentConfig(patch.config);
      return true;
    }
    case 'solar_time_scrub': {
      if (!scene.solar) scene.solar = createSolarEnvironmentConfig();
      scene.solar.timeOfDayHours = Math.max(0, Math.min(24, patch.timeOfDayHours));
      return true;
    }
    case 'solar_weather_update': {
      if (!scene.solar) scene.solar = createSolarEnvironmentConfig();
      scene.solar.weather = { ...scene.solar.weather, ...patch.weather };
      scene.solar = normalizeSolarEnvironmentConfig(scene.solar);
      return true;
    }
    case 'screenplay_update': {
      scene.screenplay = normalizeScreenplayConfig(patch.config);
      return true;
    }
    case 'screenplay_import_script': {
      if (!scene.screenplay) scene.screenplay = createScreenplayConfig();
      scene.screenplay.scriptText = patch.scriptText;
      scene.screenplay.parsedScript = parseFountainScript(patch.scriptText);
      scene.screenplay.activeSceneIndex = 0;
      scene.screenplay = normalizeScreenplayConfig(scene.screenplay);
      return true;
    }
    case 'screenplay_apply_coverage': {
      if (!Array.isArray(patch.coverage) || patch.coverage.length === 0) return false;
      if (!Array.isArray(scene.cameras)) scene.cameras = [];
      for (const shot of patch.coverage) {
        const existingIdx = scene.cameras.findIndex((c) => c.name === shot.name || c.id === shot.shotId);
        const camData: CameraSetupData = {
          id: shot.shotId || `cam-cov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: shot.name,
          position: { ...shot.cameraPosition },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          lensFocalLength: (shot.suggestedFocalLengthMm as FocalLength) || 35,
          aspect: '16:9',
          tStop: 2.8,
          formatId: shot.suggestedSensorFormat || 'full_frame_35',
          lookAtTargetActorId: shot.primaryActorId,
          focusTargetActorId: shot.primaryActorId,
        };
        if (existingIdx >= 0) {
          scene.cameras[existingIdx] = camData;
        } else {
          scene.cameras.push(camData);
        }
      }
      return true;
    }
    case 'profiler_update': {
      scene.profiler = normalizeVRProfilerConfig(patch.config);
      return true;
    }
    case 'profiler_benchmark_run': {
      if (!scene.profiler) scene.profiler = createVRProfilerConfig();
      scene.profiler.activeScenarioId = patch.scenarioId;
      return true;
    }
    case 'comfort_update': {
      scene.comfort = normalizeVRComfortConfig(patch.config);
      return true;
    }
    case 'comfort_toggle_vignette': {
      if (!scene.comfort) scene.comfort = createVRComfortConfig();
      scene.comfort.vignette.enabled =
        patch.enabled !== undefined ? patch.enabled : !scene.comfort.vignette.enabled;
      return true;
    }
    case 'set_dressing_update': {
      scene.setDressing = normalizeSetDressingConfig(patch.config);
      return true;
    }
    case 'set_dressing_scatter': {
      if (!scene.setDressing) scene.setDressing = createSetDressingConfig();
      scene.setDressing.activeTheme = patch.theme;
      scene.setDressing.scatterConfig.theme = patch.theme;
      if (patch.density) scene.setDressing.scatterConfig.density = patch.density;
      if (patch.items) {
        scene.setDressing.settledItems = patch.items;
      } else {
        const regions = patch.regionId
          ? scene.setDressing.regions.filter((r) => r.id === patch.regionId)
          : detectSemanticRegions(scene);
        scene.setDressing.regions = regions;
        const newItems: SettledPropItem[] = [];
        for (const region of regions) {
          newItems.push(...generateThemeScatter(patch.theme, region, scene.setDressing.scatterConfig));
        }
        scene.setDressing.settledItems = newItems;
      }
      return true;
    }

    case 'set_dressing_ai_mutate': {
      if (!scene.setDressing) scene.setDressing = createSetDressingConfig();
      applyAiMutationsToScene(scene, patch.mutations);
      return true;
    }
    case 'set_dressing_clear': {
      if (scene.setDressing) {
        scene.setDressing.settledItems = [];
      }
      return true;
    }
    default:
      return false;
  }
}


/**
 * Entity Lock Manager to coordinate multi-user editing without race conditions.
 * Pure.
 */
export class EntityLockManager {
  private locks = new Map<string, EntityLock>();
  private readonly defaultLockDurationMs: number;

  constructor(defaultLockDurationMs = 8000) {
    this.defaultLockDurationMs = defaultLockDurationMs;
  }

  /** Attempts to acquire a lock for peerId. Returns true if granted. */
  acquire(
    entityId: string,
    entityType: 'actor' | 'camera' | 'light' | 'audioCue' | 'prop' | 'wall',
    peerId: string,
    nowTs: number = Date.now(),
  ): { granted: boolean; currentOwnerId?: string; expiresAtTs: number } {
    this.pruneExpired(nowTs);
    const existing = this.locks.get(entityId);
    if (existing && existing.lockedByPeerId !== peerId) {
      return {
        granted: false,
        currentOwnerId: existing.lockedByPeerId,
        expiresAtTs: existing.expiresAtTs,
      };
    }

    const expiresAtTs = nowTs + this.defaultLockDurationMs;
    const lock: EntityLock = {
      entityId,
      entityType,
      lockedByPeerId: peerId,
      lockedAtTs: nowTs,
      expiresAtTs,
    };
    this.locks.set(entityId, lock);
    return { granted: true, expiresAtTs };
  }

  /** Releases a lock if owned by peerId. */
  release(entityId: string, peerId: string): boolean {
    const existing = this.locks.get(entityId);
    if (existing && existing.lockedByPeerId === peerId) {
      this.locks.delete(entityId);
      return true;
    }
    return false;
  }

  /** Releases all locks held by a given peer (e.g. on disconnect). */
  releaseAllForPeer(peerId: string): number {
    let count = 0;
    for (const [id, lock] of this.locks.entries()) {
      if (lock.lockedByPeerId === peerId) {
        this.locks.delete(id);
        count++;
      }
    }
    return count;
  }

  /** Checks who holds a lock on an entity. */
  getLock(entityId: string, nowTs: number = Date.now()): EntityLock | null {
    this.pruneExpired(nowTs);
    return this.locks.get(entityId) ?? null;
  }

  /** Returns all active locks. */
  getAllLocks(nowTs: number = Date.now()): EntityLock[] {
    this.pruneExpired(nowTs);
    return Array.from(this.locks.values());
  }

  /** Sets initial lock snapshot from host. */
  setSnapshot(locks: EntityLock[], nowTs: number = Date.now()): void {
    this.locks.clear();
    for (const l of locks) {
      if (l.expiresAtTs > nowTs) {
        this.locks.set(l.entityId, { ...l });
      }
    }
  }

  acquireLock(
    entityId: string,
    entityType: EntityLock['entityType'],
    peerId: string,
    peerName?: string,
    leaseMs?: number,
    nowTs: number = Date.now(),
  ): EntityLock | null {
    this.pruneExpired(nowTs);
    const existing = this.locks.get(entityId);
    if (existing && existing.lockedByPeerId !== peerId) {
      return null;
    }
    const duration = leaseMs ?? this.defaultLockDurationMs;
    const expiresAtTs = nowTs + duration;
    const lock: EntityLock = {
      entityId,
      entityType,
      lockedByPeerId: peerId,
      lockedByPeerName: peerName,
      lockedAtTs: nowTs,
      expiresAtTs,
    };
    this.locks.set(entityId, lock);
    return lock;
  }

  releaseLock(entityId: string, peerId: string): boolean {
    return this.release(entityId, peerId);
  }

  releaseByPeer(peerId: string): string[] {
    const released: string[] = [];
    for (const [id, lock] of this.locks.entries()) {
      if (lock.lockedByPeerId === peerId) {
        this.locks.delete(id);
        released.push(id);
      }
    }
    return released;
  }

  isLockedByOther(entityId: string, peerId: string, nowTs: number = Date.now()): boolean {
    const lock = this.getLock(entityId, nowTs);
    return lock !== null && lock.lockedByPeerId !== peerId;
  }

  allLocks(nowTs: number = Date.now()): EntityLock[] {
    return this.getAllLocks(nowTs);
  }

  cleanExpired(nowTs: number = Date.now()): string[] {
    const expired: string[] = [];
    for (const [id, lock] of this.locks.entries()) {
      if (lock.expiresAtTs <= nowTs) {
        this.locks.delete(id);
        expired.push(id);
      }
    }
    return expired;
  }

  private pruneExpired(nowTs: number): void {
    for (const [id, lock] of this.locks.entries()) {
      if (lock.expiresAtTs <= nowTs) {
        this.locks.delete(id);
      }
    }
  }
}

/**
 * Peer Roster Manager tracking connected users and presence.
 * Pure.
 */
export class PeerRoster {
  private peers = new Map<string, PeerPresence>();
  private readonly timeoutMs: number;

  constructor(timeoutMs = 12000) {
    this.timeoutMs = timeoutMs;
  }

  /** Registers or updates a peer's presence. */
  updatePresence(presence: Partial<PeerPresence> & { id: string }, nowTs: number = Date.now()): PeerPresence {
    let peer = this.peers.get(presence.id);
    if (!peer) {
      peer = createPeerPresence(
        presence.id,
        presence.name || 'Anonymous',
        presence.role || 'observer',
        presence.color,
        presence.deviceType,
      );
      this.peers.set(presence.id, peer);
    }

    if (presence.name !== undefined) peer.name = presence.name;
    if (presence.role !== undefined) peer.role = presence.role;
    if (presence.color !== undefined) peer.color = presence.color;
    if (presence.deviceType !== undefined) peer.deviceType = presence.deviceType;
    if (presence.headPose !== undefined) peer.headPose = { ...presence.headPose };
    if (presence.handLeft !== undefined) peer.handLeft = { ...presence.handLeft };
    if (presence.handRight !== undefined) peer.handRight = { ...presence.handRight };
    if (presence.pointerRay !== undefined) peer.pointerRay = { ...presence.pointerRay };
    if (presence.activeCameraId !== undefined) peer.activeCameraId = presence.activeCameraId;
    if (presence.lockedEntityId !== undefined) peer.lockedEntityId = presence.lockedEntityId;
    if (presence.isSpeaking !== undefined) peer.isSpeaking = presence.isSpeaking;
    if (presence.isMuted !== undefined) peer.isMuted = presence.isMuted;
    if (presence.audioVolume !== undefined) peer.audioVolume = presence.audioVolume;
    if (presence.pingMs !== undefined) peer.pingMs = presence.pingMs;
    peer.lastSeenTs = nowTs;

    return peer;
  }

  addOrUpdatePeer(
    presence: Partial<PeerPresence> & { id?: string; peerId?: string; lastSeenMs?: number },
    nowTs: number = Date.now(),
  ): PeerPresence {
    const id = presence.id || presence.peerId || '';
    const lastSeen = presence.lastSeenTs ?? presence.lastSeenMs ?? nowTs;
    return this.updatePresence({ ...presence, id }, lastSeen);
  }

  /** Removes a peer explicitly. */
  removePeer(peerId: string): boolean {
    return this.peers.delete(peerId);
  }

  /** Gets a single peer presence. */
  getPeer(peerId: string): PeerPresence | null {
    return this.peers.get(peerId) ?? null;
  }

  /** Returns all active peers, optionally pruning timed out peers. */
  getActivePeers(nowTs: number = Date.now()): PeerPresence[] {
    this.prune(nowTs);
    return Array.from(this.peers.values());
  }

  allPeers(): PeerPresence[] {
    const peers = Array.from(this.peers.values());
    const roleWeight: Record<CollabRole, number> = {
      director: 1,
      dp: 2,
      gaffer: 3,
      actor: 4,
      observer: 5,
    };
    return peers.sort((a, b) => (roleWeight[a.role] ?? 99) - (roleWeight[b.role] ?? 99));
  }

  /** Count of active connected peers. */
  get count(): number {
    return this.peers.size;
  }

  /** Prunes peers that have not reported presence within timeoutMs. */
  prune(nowTs: number = Date.now()): string[] {
    const dropped: string[] = [];
    for (const [id, peer] of this.peers.entries()) {
      if (nowTs - peer.lastSeenTs > this.timeoutMs) {
        this.peers.delete(id);
        dropped.push(id);
      }
    }
    return dropped;
  }

  pruneStalePeers(nowTs: number = Date.now(), timeoutMs?: number): string[] {
    const threshold = timeoutMs ?? this.timeoutMs;
    const dropped: string[] = [];
    for (const [id, peer] of this.peers.entries()) {
      if (nowTs - peer.lastSeenTs > threshold) {
        this.peers.delete(id);
        dropped.push(id);
      }
    }
    return dropped;
  }

  clear(): void {
    this.peers.clear();
  }
}

/**
 * Calculates 3D Spatial Audio distance attenuation, stereo pan [-1, +1],
 * and angle metrics for WebRTC spatial voice.
 * Pure vector math.
 */
export function computeSpatialAudioGainAndPan(
  listenerPos: Vec3,
  listenerRot: Quat,
  speakerPos: Vec3,
  options: {
    refDistanceM?: number;
    maxDistanceM?: number;
    rolloffFactor?: number;
  } = {},
): {
  gain: number;
  stereoPan: number;
  distanceM: number;
  azimuthDeg: number;
} {
  const refDist = options.refDistanceM ?? 1.5;
  const maxDist = options.maxDistanceM ?? 25.0;
  const rolloff = options.rolloffFactor ?? 1.2;

  const dx = speakerPos.x - listenerPos.x;
  const dy = speakerPos.y - listenerPos.y;
  const dz = speakerPos.z - listenerPos.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (dist < 0.001) {
    return { gain: 1.0, stereoPan: 0.0, distanceM: 0.0, azimuthDeg: 0.0 };
  }

  // Inverse distance attenuation curve clamped between refDist and maxDist
  const clampedDist = Math.max(refDist, Math.min(dist, maxDist));
  const gain = Math.max(0, Math.min(1.0, Math.pow(refDist / clampedDist, rolloff)));

  // Transform speaker vector into listener local coordinate space (inverse quaternion rotation)
  // qConj = (-qx, -qy, -qz, qw)
  const qx = -listenerRot.x;
  const qy = -listenerRot.y;
  const qz = -listenerRot.z;
  const qw = listenerRot.w;

  // v' = qConj * v * q
  const ix = qw * dx + qy * dz - qz * dy;
  const iy = qw * dy + qz * dx - qx * dz;
  const iz = qw * dz + qx * dy - qy * dx;
  const iw = -qx * dx - qy * dy - qz * dz;

  const localX = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  const localZ = iz * qw + iw * -qz + ix * -qy - iy * -qx;

  // In local space, forward is -Z, right is +X
  // Pan is computed from normalized localX relative to planar distance
  const planarDist = Math.sqrt(localX * localX + localZ * localZ);
  let stereoPan = 0;
  let azimuthDeg = 0;

  if (planarDist > 0.001) {
    stereoPan = Math.max(-1.0, Math.min(1.0, localX / planarDist));
    // Azimuth: 0 deg = straight ahead (-Z), +90 = right (+X), -90 = left (-X), 180 = behind (+Z)
    azimuthDeg = (Math.atan2(localX, -localZ) * 180) / Math.PI;
  }

  return {
    gain,
    stereoPan,
    distanceM: dist,
    azimuthDeg,
  };
}

/** Serializes a CollabMessage to a JSON string. */
export function serializeCollabMessage(msg: CollabMessage): string {
  return JSON.stringify(msg);
}

/** Deserializes a string to a validated CollabMessage or null on parse error. */
export function deserializeCollabMessage(str: string): CollabMessage | null {
  try {
    const data = JSON.parse(str);
    if (!data || typeof data !== 'object' || !data.type) return null;
    return data as CollabMessage;
  } catch {
    return null;
  }
}
