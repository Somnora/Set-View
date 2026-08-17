// ---------------------------------------------------------------------------
// SetView NLE Multi-Camera Timeline & Shot List Exporter
//
// Pure domain module for generating industry standard NLE interchange formats:
//  - CMX 3600 EDL (with camera cut events, reel labels, source/record timecodes)
//  - Apple Final Cut Pro 7 / Adobe Premiere Pro / DaVinci Resolve XML (xmeml v5)
//  - Final Cut Pro X FCPXML v1.9+ (with camera metadata, clips, and markers)
//  - Production CSV Shot List (RFC 4180 compliant with optics & blocking specs)
//  - Avid Media Composer Marker / Locator List (tab-delimited with color tags)
//
// Architecture rule: ZERO Three.js or DOM imports. 100% pure Node.js compatible.
// ---------------------------------------------------------------------------

import {
  sensorFormat,
  type ActorData,
  type CameraSetupData,
  type SceneData,
} from './model.ts';
import { classifyShotSize, depthOfFieldFor, type ShotSize } from './lens.ts';
import { cameraYaw, nearestActorDistance } from './plan.ts';
import {
  buildCameraTimeline,
  classifyCameraMove,
  moveStats,
  type CameraMoveClassification,
} from './timeline.ts';

export type NleExportFormat =
  | 'cmx3600_edl'
  | 'fcpxml'
  | 'fcp7_xml'
  | 'csv_shotlist'
  | 'avid_markers';

export interface NleExportOptions {
  /** Target sequence frame rate (default 24 fps). */
  fps?: number;
  /** Sequence or timeline title (defaults to scene name). */
  sequenceName?: string;
  /** Drop frame timecode mode (for 29.97 / 59.94 fps). */
  dropFrame?: boolean;
  /** Whether to include audio cues / scratch dialogue tracks in timeline. */
  includeAudioCues?: boolean;
  /** Whether to generate dissolve transitions instead of hard cuts. */
  includeTransitions?: boolean;
  /** Default duration in seconds for static camera setups (default 4.0s). */
  defaultShotDurationS?: number;
  /** Sequence master start timecode (default "01:00:00:00"). */
  startRecordTimecode?: string;
  /** Clip source start timecode (default "00:00:00:00"). */
  startSourceTimecode?: string;
  /** Audio sample rate in Hz (default 48000). */
  sampleRate?: number;
  /** Video frame width in pixels (default 1920). */
  width?: number;
  /** Video frame height in pixels (default 1080). */
  height?: number;
}

export type ShotSegment = NleShotSegment;

export interface NleShotSegment {
  shotNumber: number;
  camera: CameraSetupData;
  startTimeS: number;
  durationS: number;
  endTimeS: number;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  sourceStartFrame: number;
  sourceEndFrame: number;
  recordInTc: string;
  recordOutTc: string;
  sourceInTc: string;
  sourceOutTc: string;
  shotSize: ShotSize;
  shotSizeLabel: string;
  targetActor?: ActorData;
  subjectDistanceM: number | null;
  dofNearM: number | null;
  dofFarM: number | null;
  moveClassification: CameraMoveClassification;
  description: string;
  notes: string;
}

export interface NleExportResult {
  filename: string;
  mimeType: string;
  content: string;
}

// --- Timecode & Math Utilities (Pure) ---------------------------------------

export function sanitizeSlug(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'setview_scene';
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeCsvField(field: string | number): string {
  const str = String(field);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function pad2(n: number): string {
  return Math.floor(Math.max(0, n)).toString().padStart(2, '0');
}

function pad3(n: number): string {
  return Math.floor(Math.max(0, n)).toString().padStart(3, '0');
}

/** Parses timecode string "HH:MM:SS:FF" or "HH:MM:SS;FF" to total discrete frame count. */
export function timecodeToFrames(tc: string, fps: number): number {
  if (!tc || typeof tc !== 'string') return 0;
  const parts = tc.trim().split(/[:;]/).map((p) => parseInt(p, 10));
  if (parts.length < 4 || parts.some((n) => isNaN(n) || n < 0)) return 0;
  const [h, m, s, f] = parts;
  const roundedFps = Math.round(fps);
  const clampedF = Math.min(roundedFps - 1, f);
  return h * 3600 * roundedFps + m * 60 * roundedFps + s * roundedFps + clampedF;
}

/** Formats discrete frame count into SMPTE timecode string. */
export function framesToTimecode(totalFrames: number, fps: number, dropFrame = false): string {
  const roundedFps = Math.round(fps);
  const safeFrames = Math.max(0, Math.floor(totalFrames));

  if (dropFrame && (roundedFps === 30 || Math.abs(fps - 29.97) < 0.05)) {
    // 29.97 drop frame calculation (drops 2 frames every minute except 10th minute)
    const dropFrames = 2;
    const framesPerMinute = 1800 - dropFrames; // 1798
    const framesPer10Minutes = 17980 + dropFrames; // 17990 + 10

    const d = Math.floor(safeFrames / framesPer10Minutes);
    const m = safeFrames % framesPer10Minutes;

    let adjustedFrames = safeFrames;
    if (m > dropFrames) {
      adjustedFrames += dropFrames * 9 * d + dropFrames * Math.floor((m - dropFrames) / framesPerMinute);
    } else {
      adjustedFrames += dropFrames * 9 * d;
    }

    const ff = adjustedFrames % 30;
    const ss = Math.floor(adjustedFrames / 30) % 60;
    const mm = Math.floor(adjustedFrames / 1800) % 60;
    const hh = Math.floor(adjustedFrames / 108000);
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)};${pad2(ff)}`;
  }

  const ff = safeFrames % roundedFps;
  const totalSeconds = Math.floor(safeFrames / roundedFps);
  const ss = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mm = totalMinutes % 60;
  const hh = Math.floor(totalMinutes / 60);
  const sep = dropFrame ? ';' : ':';

  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}${sep}${pad2(ff)}`;
}

// --- Multi-Camera Timeline Segment Builder ----------------------------------

/**
 * Derives discrete shot segments across the scene camera setups and blocking timelines.
 * Pure and deterministic.
 */
export function calculateSceneShotSegments(
  scene: SceneData,
  options?: NleExportOptions,
): NleShotSegment[] {
  const fps = options?.fps ?? 24;
  const dropFrame = options?.dropFrame ?? false;
  const defaultDurationS = Math.max(1.0, options?.defaultShotDurationS ?? 4.0);
  const startRecFrames = timecodeToFrames(options?.startRecordTimecode ?? '01:00:00:00', fps);
  const startSrcFrames = timecodeToFrames(options?.startSourceTimecode ?? '00:00:00:00', fps);

  // Compute actor movement maximum duration as baseline
  let maxActorDurationS = 0;
  if (scene.actors && scene.actors.length > 0) {
    for (const actor of scene.actors) {
      if (actor.keyframes && actor.keyframes.length >= 2) {
        const stats = moveStats(actor.keyframes, scene.walkSpeed);
        if (stats.durationS > maxActorDurationS) {
          maxActorDurationS = stats.durationS;
        }
      }
    }
  }

  const cameras: CameraSetupData[] =
    scene.cameras && scene.cameras.length > 0
      ? scene.cameras
      : [
          {
            id: 'cam-master-fallback',
            name: 'CAM A',
            position: { x: 0, y: 1.6, z: 3 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            lensFocalLength: 35,
            aspect: '2.39:1',
            tStop: 2.8,
            formatId: 'super35',
          },
        ];

  const segments: NleShotSegment[] = [];
  let currentRecFrame = startRecFrames;
  let cumulativeTimeS = 0;

  for (let i = 0; i < cameras.length; i++) {
    const cam = cameras[i];
    const shotNumber = i + 1;

    // Determine shot duration
    let shotDurationS = defaultDurationS;
    if (cam.keyframes && cam.keyframes.length >= 2) {
      const camTl = buildCameraTimeline(cam.keyframes);
      shotDurationS = Math.max(1.0, camTl.duration);
    } else if (maxActorDurationS > 0 && cameras.length === 1) {
      shotDurationS = maxActorDurationS;
    }

    const durationFrames = Math.max(1, Math.round(shotDurationS * fps));
    const startFrame = currentRecFrame;
    const endFrame = startFrame + durationFrames;

    const sourceStartFrame = startSrcFrames;
    const sourceEndFrame = startSrcFrames + durationFrames;

    const dist = nearestActorDistance(cam, scene);
    const dof = dist !== null ? depthOfFieldFor(cam, dist) : null;
    const fmt = sensorFormat(cam.formatId);
    const shotFraming = classifyShotSize(cam.lensFocalLength, cam.aspect, cam.formatId, dist ?? 3.0);
    const move = cam.keyframes ? classifyCameraMove(cam.keyframes) : {
      moveType: 'static' as const,
      description: 'Static Lock-off Tripod',
      totalDistanceM: 0,
      durationS: shotDurationS,
      avgSpeedMs: 0,
      peakSpeedMs: 0,
      hasFocalPull: false,
      focalMinMm: cam.lensFocalLength,
      focalMaxMm: cam.lensFocalLength,
      isPureRotation: false,
    };

    let targetActor: ActorData | undefined = undefined;
    if (cam.focusTargetActorId) {
      targetActor = scene.actors?.find((a) => a.id === cam.focusTargetActorId);
    } else if (cam.lookAtTargetActorId) {
      targetActor = scene.actors?.find((a) => a.id === cam.lookAtTargetActorId);
    } else if (scene.actors && scene.actors.length > 0) {
      targetActor = scene.actors[0];
    }

    const yawDeg = ((cameraYaw(cam.rotation) * 180) / Math.PI).toFixed(1);
    const heightStr = cam.position.y.toFixed(2);
    const distStr = dist !== null ? `${dist.toFixed(1)}m` : 'N/A';
    const dofNear = dof ? +dof.nearM.toFixed(2) : null;
    const dofFar = dof ? (Number.isFinite(dof.farM) ? +dof.farM.toFixed(2) : null) : null;

    const descParts = [
      `${cam.name} (${Math.round(cam.lensFocalLength)}mm ${fmt.short}, T${cam.tStop.toFixed(1)})`,
      shotFraming.shotSizeLabel,
      move.description,
    ];
    if (targetActor) {
      descParts.push(`Subject: ${targetActor.name}`);
    }

    const noteParts = [
      `Aspect: ${cam.aspect}`,
      `Angle: ${yawDeg} deg`,
      `Height: ${heightStr}m`,
      `Subject Dist: ${distStr}`,
    ];
    if (dofNear !== null) {
      noteParts.push(`DOF: ${dofNear}m - ${dofFar !== null ? dofFar + 'm' : 'inf'}`);
    }

    segments.push({
      shotNumber,
      camera: cam,
      startTimeS: cumulativeTimeS,
      durationS: shotDurationS,
      endTimeS: cumulativeTimeS + shotDurationS,
      startFrame,
      endFrame,
      durationFrames,
      sourceStartFrame,
      sourceEndFrame,
      recordInTc: framesToTimecode(startFrame, fps, dropFrame),
      recordOutTc: framesToTimecode(endFrame, fps, dropFrame),
      sourceInTc: framesToTimecode(sourceStartFrame, fps, dropFrame),
      sourceOutTc: framesToTimecode(sourceEndFrame, fps, dropFrame),
      shotSize: shotFraming.shotSize,
      shotSizeLabel: shotFraming.shotSizeLabel,
      targetActor,
      subjectDistanceM: dist !== null ? +dist.toFixed(2) : null,
      dofNearM: dofNear,
      dofFarM: dofFar,
      moveClassification: move,
      description: descParts.join(' - '),
      notes: noteParts.join(' | '),
    });

    currentRecFrame = endFrame;
    cumulativeTimeS += shotDurationS;
  }

  return segments;
}

// ---------------------------------------------------------------------------
// 1. CMX 3600 EDL Generator
// ---------------------------------------------------------------------------

/**
 * Generates standard CMX 3600 EDL formatted timeline text with camera cut events,
 * reel names, timecode IN/OUT, and FROM CLIP NAME comments. Pure.
 */
export function generateCmx3600Edl(scene: SceneData, options?: NleExportOptions): string {
  const fps = options?.fps ?? 24;
  const dropFrame = options?.dropFrame ?? false;
  const sequenceName = options?.sequenceName || scene.name || 'SetView Sequence';
  const includeAudio = options?.includeAudioCues ?? true;
  const includeTrans = options?.includeTransitions ?? false;

  const segments = calculateSceneShotSegments(scene, options);
  const lines: string[] = [];

  lines.push(`TITLE:   ${sequenceName.toUpperCase().slice(0, 60)}`);
  lines.push(`FCM: ${dropFrame ? 'DROP FRAME' : 'NON-DROP FRAME'}`);
  lines.push('');

  let eventCounter = 1;

  for (const shot of segments) {
    const eventNumStr = pad3(eventCounter);
    // Sanitize reel name to max 8 alphanumeric characters
    const reelRaw = shot.camera.name.replace(/[^A-Za-z0-9]/g, '_').toUpperCase();
    const reel = (reelRaw.length > 8 ? reelRaw.slice(0, 8) : reelRaw).padEnd(8, ' ');
    const track = 'V    ';
    const trans = includeTrans && eventCounter > 1 ? `D   ${pad3(Math.round(fps * 0.5))}  ` : 'C        ';

    // Format: 001  CAM_A    V     C        00:00:00:00 00:00:04:00 01:00:00:00 01:00:04:00
    lines.push(
      `${eventNumStr}  ${reel} ${track} ${trans} ${shot.sourceInTc} ${shot.sourceOutTc} ${shot.recordInTc} ${shot.recordOutTc}`,
    );

    const clipName = `${sanitizeSlug(scene.name)}_${sanitizeSlug(shot.camera.name)}_shot${shot.shotNumber}`;
    lines.push(`* FROM CLIP NAME: ${clipName.toUpperCase()}`);
    lines.push(`* COMMENT: ${shot.description} | ${shot.notes}`);
    lines.push('');

    eventCounter++;
  }

  // Audio cue events if requested
  if (includeAudio && scene.audioCues && scene.audioCues.length > 0) {
    const startRecFrames = timecodeToFrames(options?.startRecordTimecode ?? '01:00:00:00', fps);
    const sortedCues = [...scene.audioCues].sort((a, b) => a.timestampS - b.timestampS);

    for (const cue of sortedCues) {
      const eventNumStr = pad3(eventCounter);
      const reel = 'AUDIO   ';
      const track = 'A    ';
      const trans = 'C        ';

      const cueInFrames = startRecFrames + Math.round(cue.timestampS * fps);
      const cueDurFrames = Math.max(1, Math.round(cue.durationS * fps));
      const cueOutFrames = cueInFrames + cueDurFrames;

      const srcInTc = framesToTimecode(0, fps, dropFrame);
      const srcOutTc = framesToTimecode(cueDurFrames, fps, dropFrame);
      const recInTc = framesToTimecode(cueInFrames, fps, dropFrame);
      const recOutTc = framesToTimecode(cueOutFrames, fps, dropFrame);

      lines.push(
        `${eventNumStr}  ${reel} ${track} ${trans} ${srcInTc} ${srcOutTc} ${recInTc} ${recOutTc}`,
      );
      lines.push(`* FROM CLIP NAME: ${sanitizeSlug(cue.name).toUpperCase()}`);
      lines.push(`* COMMENT: [${cue.type.toUpperCase()}] ${cue.transcript ? `"${cue.transcript}"` : cue.name}`);
      lines.push('');

      eventCounter++;
    }
  }

  return lines.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// 2. Apple Final Cut Pro 7 / Adobe Premiere Pro XML (xmeml v5) Generator
// ---------------------------------------------------------------------------

/**
 * Generates Apple Final Cut Pro 7 / Premiere Pro XML format (xmeml v5) compatible
 * with Adobe Premiere Pro and DaVinci Resolve import. Pure.
 */
export function generateFinalCutProXml(scene: SceneData, options?: NleExportOptions): string {
  const fps = options?.fps ?? 24;
  const isNtsc = Math.abs(fps - 29.97) < 0.05 || Math.abs(fps - 59.94) < 0.05 || Math.abs(fps - 23.976) < 0.05;
  const dropFrame = options?.dropFrame ?? false;
  const sequenceName = options?.sequenceName || scene.name || 'SetView Sequence';
  const width = options?.width ?? 1920;
  const height = options?.height ?? 1080;
  const sampleRate = options?.sampleRate ?? 48000;
  const includeAudio = options?.includeAudioCues ?? true;

  const segments = calculateSceneShotSegments(scene, options);
  const totalDurationFrames = segments.reduce((acc, s) => acc + s.durationFrames, 0);
  const startRecFrames = timecodeToFrames(options?.startRecordTimecode ?? '01:00:00:00', fps);

  const xml: string[] = [];
  xml.push('<?xml version="1.0" encoding="UTF-8"?>');
  xml.push('<!DOCTYPE xmeml>');
  xml.push('<xmeml version="5">');
  xml.push(`  <sequence id="sequence-1">`);
  xml.push(`    <name>${escapeXml(sequenceName)}</name>`);
  xml.push(`    <duration>${totalDurationFrames}</duration>`);
  xml.push(`    <rate>`);
  xml.push(`      <timebase>${Math.round(fps)}</timebase>`);
  xml.push(`      <ntsc>${isNtsc ? 'TRUE' : 'FALSE'}</ntsc>`);
  xml.push(`    </rate>`);
  xml.push(`    <timecode>`);
  xml.push(`      <rate>`);
  xml.push(`        <timebase>${Math.round(fps)}</timebase>`);
  xml.push(`        <ntsc>${isNtsc ? 'TRUE' : 'FALSE'}</ntsc>`);
  xml.push(`      </rate>`);
  xml.push(`      <string>${framesToTimecode(startRecFrames, fps, dropFrame)}</string>`);
  xml.push(`      <frame>${startRecFrames}</frame>`);
  xml.push(`      <displayformat>${dropFrame ? 'DF' : 'NDF'}</displayformat>`);
  xml.push(`    </timecode>`);
  xml.push(`    <media>`);
  xml.push(`      <video>`);
  xml.push(`        <format>`);
  xml.push(`          <samplecharacteristics>`);
  xml.push(`            <width>${width}</width>`);
  xml.push(`            <height>${height}</height>`);
  xml.push(`            <pixelaspectratio>square</pixelaspectratio>`);
  xml.push(`            <rate>`);
  xml.push(`              <timebase>${Math.round(fps)}</timebase>`);
  xml.push(`              <ntsc>${isNtsc ? 'TRUE' : 'FALSE'}</ntsc>`);
  xml.push(`            </rate>`);
  xml.push(`          </samplecharacteristics>`);
  xml.push(`        </format>`);
  xml.push(`        <track>`);

  let trackOffsetFrames = 0;

  for (const shot of segments) {
    const clipId = `clipitem-${shot.shotNumber}`;
    const fileId = `file-${shot.shotNumber}`;
    const clipName = `${shot.camera.name} - ${Math.round(shot.camera.lensFocalLength)}mm (${shot.shotSize})`;
    const fileName = `${sanitizeSlug(scene.name)}_${sanitizeSlug(shot.camera.name)}.mov`;

    xml.push(`          <clipitem id="${clipId}">`);
    xml.push(`            <name>${escapeXml(clipName)}</name>`);
    xml.push(`            <duration>${shot.durationFrames}</duration>`);
    xml.push(`            <rate>`);
    xml.push(`              <timebase>${Math.round(fps)}</timebase>`);
    xml.push(`              <ntsc>${isNtsc ? 'TRUE' : 'FALSE'}</ntsc>`);
    xml.push(`            </rate>`);
    xml.push(`            <start>${trackOffsetFrames}</start>`);
    xml.push(`            <end>${trackOffsetFrames + shot.durationFrames}</end>`);
    xml.push(`            <in>0</in>`);
    xml.push(`            <out>${shot.durationFrames}</out>`);
    xml.push(`            <file id="${fileId}">`);
    xml.push(`              <name>${escapeXml(fileName)}</name>`);
    xml.push(`              <pathurl>file://localhost/${escapeXml(fileName)}</pathurl>`);
    xml.push(`              <rate>`);
    xml.push(`                <timebase>${Math.round(fps)}</timebase>`);
    xml.push(`                <ntsc>${isNtsc ? 'TRUE' : 'FALSE'}</ntsc>`);
    xml.push(`              </rate>`);
    xml.push(`              <duration>${shot.durationFrames}</duration>`);
    xml.push(`              <media>`);
    xml.push(`                <video>`);
    xml.push(`                  <samplecharacteristics>`);
    xml.push(`                    <width>${width}</width>`);
    xml.push(`                    <height>${height}</height>`);
    xml.push(`                  </samplecharacteristics>`);
    xml.push(`                </video>`);
    xml.push(`              </media>`);
    xml.push(`            </file>`);
    xml.push(`            <labels>`);
    xml.push(`              <label2>Iris</label2>`);
    xml.push(`            </labels>`);
    xml.push(`            <comments>`);
    xml.push(`              <mastercomment1>${escapeXml(shot.description)}</mastercomment1>`);
    xml.push(`              <mastercomment2>${escapeXml(shot.notes)}</mastercomment2>`);
    xml.push(`              <mastercomment3>Target Actor: ${escapeXml(shot.targetActor?.name ?? 'None')}</mastercomment3>`);
    xml.push(`              <mastercomment4>Timecode Record: ${shot.recordInTc} to ${shot.recordOutTc}</mastercomment4>`);
    xml.push(`            </comments>`);
    xml.push(`          </clipitem>`);

    trackOffsetFrames += shot.durationFrames;
  }

  xml.push(`        </track>`);
  xml.push(`      </video>`);

  // Audio track
  xml.push(`      <audio>`);
  xml.push(`        <numOutputChannels>2</numOutputChannels>`);
  xml.push(`        <format>`);
  xml.push(`          <samplecharacteristics>`);
  xml.push(`            <depth>24</depth>`);
  xml.push(`            <samplerate>${sampleRate}</samplerate>`);
  xml.push(`          </samplecharacteristics>`);
  xml.push(`        </format>`);

  if (includeAudio && scene.audioCues && scene.audioCues.length > 0) {
    xml.push(`        <track>`);
    let audioCounter = 1;
    for (const cue of scene.audioCues) {
      const cueStartFrames = Math.round(cue.timestampS * fps);
      const cueDurFrames = Math.max(1, Math.round(cue.durationS * fps));
      const clipId = `audio-clipitem-${audioCounter}`;
      const fileId = `audio-file-${audioCounter}`;
      const fileName = `${sanitizeSlug(cue.name)}.wav`;

      xml.push(`          <clipitem id="${clipId}">`);
      xml.push(`            <name>${escapeXml(cue.name)}</name>`);
      xml.push(`            <duration>${cueDurFrames}</duration>`);
      xml.push(`            <rate>`);
      xml.push(`              <timebase>${Math.round(fps)}</timebase>`);
      xml.push(`              <ntsc>${isNtsc ? 'TRUE' : 'FALSE'}</ntsc>`);
      xml.push(`            </rate>`);
      xml.push(`            <start>${cueStartFrames}</start>`);
      xml.push(`            <end>${cueStartFrames + cueDurFrames}</end>`);
      xml.push(`            <in>0</in>`);
      xml.push(`            <out>${cueDurFrames}</out>`);
      xml.push(`            <file id="${fileId}">`);
      xml.push(`              <name>${escapeXml(fileName)}</name>`);
      xml.push(`              <pathurl>file://localhost/${escapeXml(fileName)}</pathurl>`);
      xml.push(`              <rate>`);
      xml.push(`                <timebase>${Math.round(fps)}</timebase>`);
      xml.push(`                <ntsc>${isNtsc ? 'TRUE' : 'FALSE'}</ntsc>`);
      xml.push(`              </rate>`);
      xml.push(`              <duration>${cueDurFrames}</duration>`);
      xml.push(`              <media>`);
      xml.push(`                <audio>`);
      xml.push(`                  <samplecharacteristics>`);
      xml.push(`                    <depth>24</depth>`);
      xml.push(`                    <samplerate>${sampleRate}</samplerate>`);
      xml.push(`                  </samplecharacteristics>`);
      xml.push(`                  <channelcount>2</channelcount>`);
      xml.push(`                </audio>`);
      xml.push(`              </media>`);
      xml.push(`            </file>`);
      xml.push(`            <comments>`);
      xml.push(`              <mastercomment1>[${cue.type.toUpperCase()}] ${escapeXml(cue.transcript ?? cue.name)}</mastercomment1>`);
      xml.push(`            </comments>`);
      xml.push(`          </clipitem>`);

      audioCounter++;
    }
    xml.push(`        </track>`);
  }

  xml.push(`      </audio>`);
  xml.push(`    </media>`);
  xml.push(`  </sequence>`);
  xml.push(`</xmeml>`);

  return xml.join('\n');
}

// ---------------------------------------------------------------------------
// 3. Final Cut Pro X FCPXML v1.9+ Generator
// ---------------------------------------------------------------------------

/**
 * Generates FCPXML v1.9 format for Apple Final Cut Pro X. Pure.
 */
export function generateFcpxml(scene: SceneData, options?: NleExportOptions): string {
  const fps = options?.fps ?? 24;
  const sequenceName = options?.sequenceName || scene.name || 'SetView Sequence';
  const width = options?.width ?? 1920;
  const height = options?.height ?? 1080;
  const includeAudio = options?.includeAudioCues ?? true;

  const segments = calculateSceneShotSegments(scene, options);
  const totalDurationFrames = segments.reduce((acc, s) => acc + s.durationFrames, 0);

  // Format frame duration string in seconds (e.g. "1/24s" or "100/2400s")
  const frameDurStr = `${Math.round(100)}/${Math.round(fps * 100)}s`;
  const totalSeqDurationStr = `${totalDurationFrames * 100}/${Math.round(fps * 100)}s`;

  const xml: string[] = [];
  xml.push('<?xml version="1.0" encoding="UTF-8"?>');
  xml.push('<!DOCTYPE fcpxml>');
  xml.push('<fcpxml version="1.9">');
  xml.push('  <resources>');
  xml.push(`    <format id="r1" name="FFVideoFormat1080p${Math.round(fps)}" frameDuration="${frameDurStr}" width="${width}" height="${height}"/>`);
  xml.push('  </resources>');
  xml.push('  <library>');
  xml.push(`    <event name="${escapeXml(sequenceName)}">`);
  xml.push(`      <project name="${escapeXml(sequenceName)}">`);
  xml.push(`        <sequence format="r1" duration="${totalSeqDurationStr}" tcStart="0s" tcFormat="NDF">`);
  xml.push('          <spine>');

  let cumulativeOffsetFrames = 0;

  for (const shot of segments) {
    const offsetStr = `${cumulativeOffsetFrames * 100}/${Math.round(fps * 100)}s`;
    const durStr = `${shot.durationFrames * 100}/${Math.round(fps * 100)}s`;
    const clipName = `${shot.camera.name} (${Math.round(shot.camera.lensFocalLength)}mm ${sensorFormat(shot.camera.formatId).short})`;

    xml.push(`            <clip name="${escapeXml(clipName)}" offset="${offsetStr}" duration="${durStr}" start="0s" format="r1">`);
    xml.push('              <metadata>');
    xml.push(`                <md key="com.apple.proapps.studio.camera" value="${escapeXml(shot.camera.name)}"/>`);
    xml.push(`                <md key="com.apple.proapps.studio.focalLength" value="${Math.round(shot.camera.lensFocalLength)}mm"/>`);
    xml.push(`                <md key="com.apple.proapps.studio.shotSize" value="${escapeXml(shot.shotSize)}"/>`);
    xml.push(`                <md key="com.apple.proapps.studio.aperture" value="T${shot.camera.tStop.toFixed(1)}"/>`);
    xml.push(`                <md key="com.apple.proapps.studio.notes" value="${escapeXml(shot.notes)}"/>`);
    xml.push('              </metadata>');
    xml.push(`              <marker start="0s" duration="${frameDurStr}" value="Shot ${shot.shotNumber}: ${escapeXml(shot.camera.name)}" note="${escapeXml(shot.description)}" posterOffset="0s"/>`);

    // Audio cues falling inside this shot segment
    if (includeAudio && scene.audioCues) {
      for (const cue of scene.audioCues) {
        if (cue.timestampS >= shot.startTimeS && cue.timestampS < shot.endTimeS) {
          const cueRelOffsetS = cue.timestampS - shot.startTimeS;
          const cueRelOffsetStr = `${Math.round(cueRelOffsetS * fps * 100)}/${Math.round(fps * 100)}s`;
          const markerNote = `[${cue.type.toUpperCase()}] ${cue.transcript ?? cue.name}`;
          xml.push(`              <marker start="${cueRelOffsetStr}" duration="${frameDurStr}" value="${escapeXml(cue.name)}" note="${escapeXml(markerNote)}" posterOffset="0s"/>`);
        }
      }
    }

    xml.push('            </clip>');

    cumulativeOffsetFrames += shot.durationFrames;
  }

  xml.push('          </spine>');
  xml.push('        </sequence>');
  xml.push('      </project>');
  xml.push('    </event>');
  xml.push('  </library>');
  xml.push('</fcpxml>');

  return xml.join('\n');
}

// ---------------------------------------------------------------------------
// 4. Production CSV Shot List Generator
// ---------------------------------------------------------------------------

/**
 * Generates RFC 4180 compliant CSV shot list with headers:
 * Scene Name,Shot #,Camera ID,Camera Name,Focal Length,Sensor Format,Aspect Ratio,T-Stop,Shot Size,Start TC,End TC,Duration Frames,Target Actor,Description,Notes
 * Pure.
 */
export function generateCsvShotList(scene: SceneData, options?: NleExportOptions): string {
  const segments = calculateSceneShotSegments(scene, options);
  const rows: string[] = [];

  const headers = [
    'Scene Name',
    'Shot #',
    'Camera ID',
    'Camera Name',
    'Focal Length',
    'Sensor Format',
    'Aspect Ratio',
    'T-Stop',
    'Shot Size',
    'Start TC',
    'End TC',
    'Duration Frames',
    'Target Actor',
    'Description',
    'Notes',
  ];
  rows.push(headers.map(escapeCsvField).join(','));

  for (const s of segments) {
    const fmt = sensorFormat(s.camera.formatId);
    const row = [
      scene.name,
      s.shotNumber,
      s.camera.id,
      s.camera.name,
      `${Math.round(s.camera.lensFocalLength)}mm`,
      fmt.name,
      s.camera.aspect,
      `T${s.camera.tStop.toFixed(1)}`,
      s.shotSize,
      s.recordInTc,
      s.recordOutTc,
      s.durationFrames,
      s.targetActor?.name ?? 'None',
      s.description,
      s.notes,
    ];
    rows.push(row.map(escapeCsvField).join(','));
  }

  return rows.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// 5. Avid Media Composer Marker List Generator
// ---------------------------------------------------------------------------

/**
 * Generates Avid Media Composer tab-separated marker list.
 * Columns: Track\tTimecode\tColor\tComment
 * Pure.
 */
export function generateAvidMarkerList(scene: SceneData, options?: NleExportOptions): string {
  const fps = options?.fps ?? 24;
  const dropFrame = options?.dropFrame ?? false;
  const includeAudio = options?.includeAudioCues ?? true;
  const segments = calculateSceneShotSegments(scene, options);

  const lines: string[] = [];
  lines.push(['Track', 'Timecode', 'Color', 'Comment'].join('\t'));

  for (const shot of segments) {
    const color = shot.moveClassification.moveType === 'static' ? 'green' : 'cyan';
    const comment = `[SHOT ${shot.shotNumber}] ${shot.camera.name} (${Math.round(shot.camera.lensFocalLength)}mm ${sensorFormat(shot.camera.formatId).short}, T${shot.camera.tStop.toFixed(1)}) - ${shot.shotSize} | ${shot.moveClassification.description}`;
    lines.push(['V1', shot.recordInTc, color, comment].join('\t'));
  }

  if (includeAudio && scene.audioCues && scene.audioCues.length > 0) {
    const startRecFrames = timecodeToFrames(options?.startRecordTimecode ?? '01:00:00:00', fps);
    const sortedCues = [...scene.audioCues].sort((a, b) => a.timestampS - b.timestampS);

    for (const cue of sortedCues) {
      const cueFrame = startRecFrames + Math.round(cue.timestampS * fps);
      const cueTc = framesToTimecode(cueFrame, fps, dropFrame);
      const color = cue.type === 'dialogue' ? 'magenta' : cue.type === 'director_note' ? 'red' : 'yellow';
      const track = cue.type === 'dialogue' ? 'A1' : 'A2';
      const comment = `[${cue.type.toUpperCase()}] ${cue.name}: ${cue.transcript ? `"${cue.transcript}"` : ''}`;
      lines.push([track, cueTc, color, comment].join('\t'));
    }
  }

  return lines.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// 6. Unified Timeline Exporter Router
// ---------------------------------------------------------------------------

/**
 * Main export dispatcher for all NLE formats.
 * Returns sanitized filename, standard MIME type, and string content. Pure.
 */
export function exportSceneTimeline(
  scene: SceneData,
  format: NleExportFormat,
  options?: NleExportOptions,
): NleExportResult {
  const slug = sanitizeSlug(options?.sequenceName || scene.name || 'scene');

  switch (format) {
    case 'cmx3600_edl': {
      return {
        filename: `${slug}.edl`,
        mimeType: 'text/plain;charset=utf-8',
        content: generateCmx3600Edl(scene, options),
      };
    }
    case 'fcp7_xml': {
      return {
        filename: `${slug}.xml`,
        mimeType: 'application/xml;charset=utf-8',
        content: generateFinalCutProXml(scene, options),
      };
    }
    case 'fcpxml': {
      return {
        filename: `${slug}.fcpxml`,
        mimeType: 'application/xml;charset=utf-8',
        content: generateFcpxml(scene, options),
      };
    }
    case 'csv_shotlist': {
      return {
        filename: `${slug}_shotlist.csv`,
        mimeType: 'text/csv;charset=utf-8',
        content: generateCsvShotList(scene, options),
      };
    }
    case 'avid_markers': {
      return {
        filename: `${slug}_avid_markers.txt`,
        mimeType: 'text/plain;charset=utf-8',
        content: generateAvidMarkerList(scene, options),
      };
    }
  }
}
