// ---------------------------------------------------------------------------
// Spatial Audio Cues & Sound Design Stems — Pure domain core (no Three.js / DOM).
// Manages multi-track directional audio cues, scratch voice lines, spatial
// attenuation parameters, and DAW cue sheet / stem manifests.
// ---------------------------------------------------------------------------

import type { Vec3 } from './model.ts';
import { secondsToSmpte } from './timecode.ts';

export type AudioCueType = 'dialogue' | 'foley' | 'sfx' | 'ambience' | 'director_note';

export interface SynthToneConfig {
  frequencyHz: number;
  waveform: 'sine' | 'square' | 'triangle' | 'sawtooth' | 'beep' | 'noise';
}

export interface AudioCueData {
  id: string;
  name: string;
  type: AudioCueType;
  /** Timeline start offset in seconds (>= 0). */
  timestampS: number;
  /** Duration of the sound cue in seconds (> 0). */
  durationS: number;
  /** Normalized gain (0.0 to 1.0, default 1.0). */
  volume: number;
  /** Playback pitch multiplier (0.5 to 2.0, default 1.0). */
  pitch: number;
  /** Whether the audio loops continuously over its duration window. */
  loop: boolean;
  /** Whether spatial 3D panning and distance attenuation are applied. */
  spatial: boolean;
  /** Optional actor ID this sound emitter tracks in 3D space (e.g. dialogue from actor's mouth). */
  attachedActorId?: string;
  /** Optional camera ID if attached to camera microphone/operator. */
  attachedCameraId?: string;
  /** Static 3D position in scene space (meters) when not attached to an actor. */
  position?: Vec3;
  /** Distance in meters where attenuation starts (default 1.0m). */
  refDistanceM?: number;
  /** Maximum audible distance in meters (default 20.0m). */
  maxDistanceM?: number;
  /** Rolloff curve exponent (default 1.0). */
  rolloffFactor?: number;
  /** Directional cone inner angle in degrees (default 360 = omnidirectional). */
  coneInnerAngleDeg?: number;
  /** Directional cone outer angle in degrees (default 360). */
  coneOuterAngleDeg?: number;
  /** Gain multiplier outside the outer cone (0.0 to 1.0, default 0.0). */
  coneOuterGain?: number;
  /** Synthesizer preset for instant procedural playback without external files. */
  synthTone?: SynthToneConfig;
  /** Optional audio clip data URL or asset path. */
  audioUrl?: string;
  /** Text transcript or dialogue line content. */
  transcript?: string;
  /** Color badge hex code for visual timeline track display. */
  color?: string;
}

export const CUE_TYPE_COLORS: Record<AudioCueType, string> = {
  dialogue: '#46a758', // green
  foley: '#f5a524',    // amber
  sfx: '#e5484d',      // red
  ambience: '#3e9bf0', // blue
  director_note: '#8e4ec6', // purple
};

export const CUE_TYPE_LABELS: Record<AudioCueType, string> = {
  dialogue: 'Dialogue',
  foley: 'Foley & Props',
  sfx: 'Sound FX',
  ambience: 'Ambience',
  director_note: 'Director Note',
};

export const DEFAULT_SYNTH_PRESETS: Record<AudioCueType, SynthToneConfig> = {
  dialogue: { frequencyHz: 320, waveform: 'triangle' },
  foley: { frequencyHz: 180, waveform: 'noise' },
  sfx: { frequencyHz: 110, waveform: 'sawtooth' },
  ambience: { frequencyHz: 80, waveform: 'sine' },
  director_note: { frequencyHz: 440, waveform: 'beep' },
};

/** Creates a validated AudioCueData structure with defaults. Pure. */
export function createAudioCue(data: {
  id?: string;
  name: string;
  type?: AudioCueType;
  timestampS?: number;
  durationS?: number;
  volume?: number;
  pitch?: number;
  loop?: boolean;
  spatial?: boolean;
  attachedActorId?: string;
  attachedCameraId?: string;
  position?: Vec3;
  refDistanceM?: number;
  maxDistanceM?: number;
  rolloffFactor?: number;
  coneInnerAngleDeg?: number;
  coneOuterAngleDeg?: number;
  coneOuterGain?: number;
  synthTone?: SynthToneConfig;
  audioUrl?: string;
  transcript?: string;
  color?: string;
}): AudioCueData {
  const type = data.type ?? 'dialogue';
  const id = data.id ?? `cue-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const timestampS = Math.max(0, data.timestampS ?? 0);
  const durationS = Math.max(0.1, data.durationS ?? (type === 'ambience' ? 10.0 : 2.0));
  const volume = Math.max(0, Math.min(1, data.volume ?? 1.0));
  const pitch = Math.max(0.5, Math.min(2.0, data.pitch ?? 1.0));
  const isSpatial = data.spatial ?? (type !== 'director_note');

  return {
    id,
    name: data.name.trim() || `${CUE_TYPE_LABELS[type]} Cue`,
    type,
    timestampS,
    durationS,
    volume,
    pitch,
    loop: data.loop ?? (type === 'ambience'),
    spatial: isSpatial,
    attachedActorId: data.attachedActorId,
    attachedCameraId: data.attachedCameraId,
    position: data.position ? { x: data.position.x, y: data.position.y, z: data.position.z } : undefined,
    refDistanceM: Math.max(0.1, data.refDistanceM ?? 1.0),
    maxDistanceM: Math.max(0.5, data.maxDistanceM ?? 20.0),
    rolloffFactor: Math.max(0, data.rolloffFactor ?? 1.0),
    coneInnerAngleDeg: data.coneInnerAngleDeg ?? 360,
    coneOuterAngleDeg: data.coneOuterAngleDeg ?? 360,
    coneOuterGain: Math.max(0, Math.min(1, data.coneOuterGain ?? 0.0)),
    synthTone: data.synthTone ?? DEFAULT_SYNTH_PRESETS[type],
    audioUrl: data.audioUrl,
    transcript: data.transcript,
    color: data.color ?? CUE_TYPE_COLORS[type],
  };
}

/** Type guard to check if an unknown object is valid AudioCueData. Pure. */
export function isAudioCueData(v: unknown): v is AudioCueData {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  if (typeof c.id !== 'string' || !c.id) return false;
  if (typeof c.name !== 'string' || !c.name) return false;
  if (
    c.type !== 'dialogue' &&
    c.type !== 'foley' &&
    c.type !== 'sfx' &&
    c.type !== 'ambience' &&
    c.type !== 'director_note'
  ) {
    return false;
  }
  if (typeof c.timestampS !== 'number' || !isFinite(c.timestampS) || c.timestampS < 0) return false;
  if (typeof c.durationS !== 'number' || !isFinite(c.durationS) || c.durationS <= 0) return false;
  if (typeof c.volume !== 'number' || !isFinite(c.volume)) return false;
  return true;
}

/** Normalizes and repairs an AudioCueData instance, sanitizing numbers and bounds. Pure. */
export function normalizeAudioCue(
  cue: AudioCueData,
  validActorIds: ReadonlySet<string> = new Set(),
  validCameraIds: ReadonlySet<string> = new Set(),
): AudioCueData {
  const type: AudioCueType = (
    ['dialogue', 'foley', 'sfx', 'ambience', 'director_note'].includes(cue.type)
      ? cue.type
      : 'dialogue'
  ) as AudioCueType;

  const attachedActorId =
    cue.attachedActorId && validActorIds.has(cue.attachedActorId) ? cue.attachedActorId : undefined;
  const attachedCameraId =
    cue.attachedCameraId && validCameraIds.has(cue.attachedCameraId) ? cue.attachedCameraId : undefined;

  let pos: Vec3 | undefined = undefined;
  if (cue.position && isFinite(cue.position.x) && isFinite(cue.position.y) && isFinite(cue.position.z)) {
    pos = { x: cue.position.x, y: cue.position.y, z: cue.position.z };
  } else if (!attachedActorId && !attachedCameraId) {
    pos = { x: 0, y: 1.5, z: 0 };
  }

  return {
    id: cue.id || `cue-${Date.now()}`,
    name: (cue.name || `${CUE_TYPE_LABELS[type]} Cue`).trim(),
    type,
    timestampS: Math.max(0, isFinite(cue.timestampS) ? cue.timestampS : 0),
    durationS: Math.max(0.1, isFinite(cue.durationS) ? cue.durationS : 2.0),
    volume: Math.max(0, Math.min(1, isFinite(cue.volume) ? cue.volume : 1.0)),
    pitch: Math.max(0.5, Math.min(2.0, isFinite(cue.pitch) ? cue.pitch : 1.0)),
    loop: Boolean(cue.loop),
    spatial: cue.spatial !== undefined ? Boolean(cue.spatial) : type !== 'director_note',
    attachedActorId,
    attachedCameraId,
    position: pos,
    refDistanceM: Math.max(0.1, isFinite(cue.refDistanceM ?? 1) ? (cue.refDistanceM ?? 1) : 1.0),
    maxDistanceM: Math.max(0.5, isFinite(cue.maxDistanceM ?? 20) ? (cue.maxDistanceM ?? 20) : 20.0),
    rolloffFactor: Math.max(0, isFinite(cue.rolloffFactor ?? 1) ? (cue.rolloffFactor ?? 1) : 1.0),
    coneInnerAngleDeg: isFinite(cue.coneInnerAngleDeg ?? 360) ? (cue.coneInnerAngleDeg ?? 360) : 360,
    coneOuterAngleDeg: isFinite(cue.coneOuterAngleDeg ?? 360) ? (cue.coneOuterAngleDeg ?? 360) : 360,
    coneOuterGain: Math.max(0, Math.min(1, isFinite(cue.coneOuterGain ?? 0) ? (cue.coneOuterGain ?? 0) : 0.0)),
    synthTone: cue.synthTone ?? DEFAULT_SYNTH_PRESETS[type],
    audioUrl: cue.audioUrl,
    transcript: cue.transcript,
    color: cue.color || CUE_TYPE_COLORS[type],
  };
}

/**
 * Evaluates which cues are active and audible at the given timeline time `t` (seconds).
 * Pure.
 */
export function sampleActiveAudioCues(
  cues: readonly AudioCueData[],
  timeS: number,
): { cue: AudioCueData; offsetS: number; progress: number }[] {
  const active: { cue: AudioCueData; offsetS: number; progress: number }[] = [];
  for (const cue of cues) {
    const start = cue.timestampS;
    const end = start + cue.durationS;
    if (timeS >= start && (timeS < end || (cue.loop && timeS >= start))) {
      const totalElapsed = timeS - start;
      const offsetS = cue.loop ? totalElapsed % cue.durationS : totalElapsed;
      const progress = Math.min(1, Math.max(0, offsetS / cue.durationS));
      active.push({ cue, offsetS, progress });
    }
  }
  return active;
}

/**
 * Calculates the 3D scene-space world coordinates for an audio cue at time `t`.
 * If attached to an actor, it computes the actor's world position at time `t` plus
 * head height (1.5m). Pure.
 */
export function evaluateCueSpatialPosition(
  cue: AudioCueData,
  actorPositions: ReadonlyMap<string, Vec3> = new Map(),
  cameraPositions: ReadonlyMap<string, Vec3> = new Map(),
): Vec3 {
  if (cue.attachedActorId) {
    const actorPos = actorPositions.get(cue.attachedActorId);
    if (actorPos) {
      // Mouth / speech emitter height is ~1.5m above actor feet
      return {
        x: actorPos.x,
        y: actorPos.y + 1.5,
        z: actorPos.z,
      };
    }
  }

  if (cue.attachedCameraId) {
    const camPos = cameraPositions.get(cue.attachedCameraId);
    if (camPos) {
      return {
        x: camPos.x,
        y: camPos.y,
        z: camPos.z,
      };
    }
  }

  if (cue.position) {
    return {
      x: cue.position.x,
      y: cue.position.y,
      z: cue.position.z,
    };
  }

  return { x: 0, y: 1.5, z: 0 };
}

export interface DawStemTrack {
  trackName: string;
  trackType: AudioCueType;
  cueCount: number;
  cues: {
    id: string;
    name: string;
    smpteIn: string;
    smpteOut: string;
    startS: number;
    durationS: number;
    volumeDb: string;
    spatial: boolean;
    transcript?: string;
  }[];
}

export interface DawCueSheetManifest {
  sceneName: string;
  fps: number;
  totalDurationS: number;
  smpteDuration: string;
  tracks: DawStemTrack[];
  csvEdl: string;
}

/**
 * Generates an industry-standard DAW Cue Sheet & Stem Manifest for sound designers,
 * Pro Tools, Reaper, and Premiere. Pure.
 */
export function generateDawStemManifest(
  cues: readonly AudioCueData[],
  totalDurationS: number,
  sceneName = 'Scene 1',
  fps = 24,
): DawCueSheetManifest {
  const tracksMap = new Map<AudioCueType, DawStemTrack>();
  const types: AudioCueType[] = ['dialogue', 'foley', 'sfx', 'ambience', 'director_note'];

  for (const t of types) {
    tracksMap.set(t, {
      trackName: `${sceneName} - ${CUE_TYPE_LABELS[t].toUpperCase()} STEM`,
      trackType: t,
      cueCount: 0,
      cues: [],
    });
  }

  const sortedCues = [...cues].sort((a, b) => a.timestampS - b.timestampS);

  for (const cue of sortedCues) {
    const track = tracksMap.get(cue.type);
    if (!track) continue;

    const smpteIn = secondsToSmpte(cue.timestampS, fps).formatted;
    const smpteOut = secondsToSmpte(cue.timestampS + cue.durationS, fps).formatted;
    const volumeDb = cue.volume > 0 ? `${(20 * Math.log10(cue.volume)).toFixed(1)} dB` : '-inf dB';

    track.cues.push({
      id: cue.id,
      name: cue.name,
      smpteIn,
      smpteOut,
      startS: cue.timestampS,
      durationS: cue.durationS,
      volumeDb,
      spatial: cue.spatial,
      transcript: cue.transcript,
    });
    track.cueCount = track.cues.length;
  }

  // Generate standard CSV EDL
  let csv = 'Track,Cue Name,Type,SMPTE In,SMPTE Out,Start (s),Duration (s),Volume,Spatial,Transcript\n';
  for (const t of types) {
    const track = tracksMap.get(t);
    if (!track) continue;
    for (const c of track.cues) {
      const cleanName = `"${c.name.replace(/"/g, '""')}"`;
      const cleanTranscript = c.transcript ? `"${c.transcript.replace(/"/g, '""')}"` : '""';
      csv += `${track.trackName},${cleanName},${track.trackType},${c.smpteIn},${c.smpteOut},${c.startS.toFixed(2)},${c.durationS.toFixed(2)},${c.volumeDb},${c.spatial},${cleanTranscript}\n`;
    }
  }

  return {
    sceneName,
    fps,
    totalDurationS,
    smpteDuration: secondsToSmpte(totalDurationS, fps).formatted,
    tracks: Array.from(tracksMap.values()),
    csvEdl: csv,
  };
}
