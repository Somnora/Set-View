// ---------------------------------------------------------------------------
// AI Shot Continuity & Storyboard Engine
//
// Pure domain module for screenplay beat breakdown, camera coverage analysis,
// 180-degree line audit, 30-degree jump-cut detection, eyeline match evaluation,
// screen direction tracking, and visual storyboard SVG/HTML rendering.
//
// Architecture rule: Keep pure (no Three.js or DOM imports) so it can run
// in Node.js test runners and CLI tools.
// ---------------------------------------------------------------------------

import {
  aspectValue,
  check180LineOfAction,
  sensorFormat,
  type CameraSetupData,
  type Quat,
  type SceneData,
  type Vec3,
} from './model.ts';
import {
  classifyShotSize,
  depthOfFieldFor,
  isPointInFrustum,
  quatInverseRotateVector,
  quatRotateVector,
  type ShotSize,
} from './lens.ts';
import { cameraYaw, nearestActorDistance } from './plan.ts';
import { secondsToSmpte } from './timecode.ts';

// ---------------------------------------------------------------------------
// Script Breakdown & Screenplay Beat Types
// ---------------------------------------------------------------------------

export type ScriptBeatType = 'dialogue' | 'action' | 'parenthetical' | 'sound' | 'heading';

export interface ScriptBeat {
  id: string;
  type: ScriptBeatType;
  characterName?: string;
  actorId?: string;
  content: string;
  parenthetical?: string;
  targetCameraId?: string;
  timestampS?: number;
  estimatedDurationS: number;
}

export interface ScriptBreakdown {
  title: string;
  sceneSlug: string;
  beats: ScriptBeat[];
  characters: string[];
  totalEstimatedDurationS: number;
}

// ---------------------------------------------------------------------------
// Continuity Audit Types & Rules
// ---------------------------------------------------------------------------

export type ContinuitySeverity = 'clean' | 'info' | 'warning' | 'critical';

export type ContinuityIssueType =
  | '180_degree_axis_crossing'
  | '30_degree_jump_cut'
  | 'eyeline_mismatch'
  | 'reverse_screen_direction'
  | 'shot_scale_jump'
  | 'lighting_imbalance'
  | 'camera_in_shot'
  | 'coverage_gap';

export interface ContinuityIssue {
  type: ContinuityIssueType;
  severity: ContinuitySeverity;
  cameraIds: string[];
  actorIds?: string[];
  title: string;
  description: string;
  recommendation: string;
}

export interface ShotPairAudit {
  fromCamId: string;
  fromCamName: string;
  toCamId: string;
  toCamName: string;
  angleDeltaDeg: number;
  focalLengthDeltaMm: number;
  fromShotSize: ShotSize;
  toShotSize: ShotSize;
  is30DegreeJumpCut: boolean;
  is180AxisCrossing: boolean;
  eyelineStatus: 'matching' | 'crossing' | 'neutral' | 'unaligned';
  issues: ContinuityIssue[];
}

export interface ContinuityAuditReport {
  sceneName: string;
  score: number; // 0 to 100
  overallStatus: ContinuitySeverity;
  totalIssues: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  issues: ContinuityIssue[];
  shotPairs: ShotPairAudit[];
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Storyboard Types
// ---------------------------------------------------------------------------

export interface StoryboardPanel {
  panelIndex: number;
  camera: CameraSetupData;
  shotSize: ShotSize;
  shotSizeLabel: string;
  subjectDistanceM: number | null;
  dofNearM: number | null;
  dofFarM: number | null;
  dialogueOrAction: string;
  directorNote: string;
  timecodeIn: string;
  timecodeOut: string;
  svgVisual: string;
  continuityFlags: string[];
}

export interface StoryboardSheet {
  sceneName: string;
  totalPanels: number;
  panels: StoryboardPanel[];
  svgDocument: string;
  htmlDocument: string;
}

// Shot scale ordering for scale progression jump detection
const SHOT_SCALE_RANK: Record<ShotSize, number> = {
  ECU: 0,
  CU: 1,
  MCU: 2,
  MS: 3,
  MLS: 4,
  WS: 5,
  EWS: 6,
};

const SHOT_SCALE_LABELS: Record<ShotSize, string> = {
  ECU: 'Extreme Close-Up (ECU)',
  CU: 'Close-Up (CU)',
  MCU: 'Medium Close-Up (MCU)',
  MS: 'Medium Shot (MS)',
  MLS: 'Medium Long Shot (MLS)',
  WS: 'Wide Shot (WS)',
  EWS: 'Extreme Wide Shot (EWS)',
};

// ---------------------------------------------------------------------------
// Pure Screenplay & Beat Parser
// ---------------------------------------------------------------------------

/**
 * Parses screenplay text (Fountain or formatted script text) into structured beats.
 * Pure.
 */
export function parseScreenplayText(scriptText: string, sceneSlugFallback = 'SCENE 1'): ScriptBreakdown {
  const lines = scriptText.split(/\r?\n/);
  const beats: ScriptBeat[] = [];
  const charactersSet = new Set<string>();

  let currentSlug = sceneSlugFallback;
  let currentCharacter: string | null = null;
  let currentParenthetical: string | null = null;
  let beatCount = 0;
  let accumulatedDialogue = '';

  function flushDialogue() {
    if (currentCharacter && accumulatedDialogue.trim()) {
      const line = accumulatedDialogue.trim();
      const estWords = line.split(/\s+/).length;
      // Average speech rate is ~2.5 words per second (150 wpm)
      const durationS = Math.max(1.0, +(estWords / 2.5).toFixed(2));
      beatCount++;
      beats.push({
        id: `beat-${beatCount}`,
        type: 'dialogue',
        characterName: currentCharacter,
        content: line,
        parenthetical: currentParenthetical ?? undefined,
        estimatedDurationS: durationS,
      });
      accumulatedDialogue = '';
      currentParenthetical = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushDialogue();
      currentCharacter = null;
      continue;
    }

    // Slugline (e.g. INT. WAREHOUSE - NIGHT or EXT. STREET - DAY)
    if (/^(INT\.|EXT\.|INT\/EXT\.|EXT\/INT\.)\s/i.test(trimmed)) {
      flushDialogue();
      currentCharacter = null;
      currentSlug = trimmed;
      beatCount++;
      beats.push({
        id: `beat-${beatCount}`,
        type: 'heading',
        content: trimmed,
        estimatedDurationS: 0,
      });
      continue;
    }

    // Sound effect cue header (e.g. SOUND: SIREN, SFX: GUNSHOT, (SFX: SIREN))
    const soundMatch = trimmed.match(/^\(?\s*(SOUND|SFX|AUDIO):\s*([^\)]+)\)?$/i);
    if (soundMatch) {
      flushDialogue();
      currentCharacter = null;
      beatCount++;
      beats.push({
        id: `beat-${beatCount}`,
        type: 'sound',
        content: soundMatch[2].trim(),
        estimatedDurationS: 1.5,
      });
      continue;
    }

    // Character Name (All uppercase, optional inline parenthetical like SARAH (whispering))
    const charHeaderMatch = trimmed.match(/^([A-Z0-9_\s\.'-]+?)(?:\s*\(([^\)]+)\))?$/);
    const isCharHeader =
      charHeaderMatch &&
      charHeaderMatch[1].trim().length > 0 &&
      charHeaderMatch[1].trim().length < 35 &&
      !trimmed.includes(':') &&
      !/^(INT\.|EXT\.|INT\/EXT\.|EXT\/INT\.|CUT TO|FADE IN|FADE OUT|DISSOLVE TO)/i.test(trimmed);

    if (isCharHeader && !accumulatedDialogue) {
      flushDialogue();
      const cleanChar = charHeaderMatch[1].trim();
      currentCharacter = cleanChar;
      charactersSet.add(cleanChar);
      if (charHeaderMatch[2]) {
        currentParenthetical = charHeaderMatch[2].trim();
      }
      continue;
    }

    // Parenthetical on separate line (e.g. (whispering) or (looking away))
    if (trimmed.startsWith('(') && trimmed.endsWith(')') && currentCharacter) {
      currentParenthetical = trimmed.slice(1, -1).trim();
      continue;
    }

    // Dialogue line under a character header
    if (currentCharacter) {
      accumulatedDialogue = accumulatedDialogue ? `${accumulatedDialogue} ${trimmed}` : trimmed;
      continue;
    }

    // Action line / Scene description
    flushDialogue();
    const estWords = trimmed.split(/\s+/).length;
    const durationS = Math.max(1.5, +(estWords / 3.0).toFixed(2));
    beatCount++;
    beats.push({
      id: `beat-${beatCount}`,
      type: 'action',
      content: trimmed,
      estimatedDurationS: durationS,
    });
  }

  flushDialogue();

  let totalDurationS = 0;
  for (const b of beats) {
    totalDurationS += b.estimatedDurationS;
  }

  return {
    title: currentSlug,
    sceneSlug: currentSlug,
    beats,
    characters: Array.from(charactersSet),
    totalEstimatedDurationS: +totalDurationS.toFixed(2),
  };
}

/**
 * Generates an automatic screenplay breakdown from scene actors, camera notes, and audio cues.
 * Pure.
 */
export function generateScriptBreakdownFromScene(scene: SceneData): ScriptBreakdown {
  const beats: ScriptBeat[] = [];
  let beatIndex = 1;

  // Scene heading
  beats.push({
    id: `beat-${beatIndex++}`,
    type: 'heading',
    content: `INT. ${scene.name.toUpperCase()} - CONTINUOUS`,
    estimatedDurationS: 0,
  });

  // Action notes from actors
  for (const actor of scene.actors) {
    if (actor.notes && actor.notes.length > 0) {
      for (const note of actor.notes) {
        beats.push({
          id: `beat-${beatIndex++}`,
          type: 'action',
          characterName: actor.name,
          actorId: actor.id,
          content: note.text,
          estimatedDurationS: 2.0,
        });
      }
    } else {
      beats.push({
        id: `beat-${beatIndex++}`,
        type: 'action',
        characterName: actor.name,
        actorId: actor.id,
        content: `${actor.name} holds ${actor.stance ?? 'standing'} mark.`,
        estimatedDurationS: 1.5,
      });
    }
  }

  // Dialogue beats from audio cues
  if (scene.audioCues && scene.audioCues.length > 0) {
    for (const cue of scene.audioCues) {
      if (cue.type === 'dialogue' && cue.transcript) {
        const actor = scene.actors.find((a) => a.id === cue.attachedActorId);
        beats.push({
          id: `beat-${beatIndex++}`,
          type: 'dialogue',
          characterName: actor ? actor.name : 'ACTOR',
          actorId: actor?.id,
          content: cue.transcript,
          timestampS: cue.timestampS,
          estimatedDurationS: cue.durationS,
        });
      } else if (cue.type === 'sfx' || cue.type === 'foley' || cue.type === 'ambience') {
        beats.push({
          id: `beat-${beatIndex++}`,
          type: 'sound',
          content: `${cue.name} (${cue.type.toUpperCase()})`,
          timestampS: cue.timestampS,
          estimatedDurationS: cue.durationS,
        });
      }
    }
  }

  let totalDurationS = 0;
  for (const b of beats) {
    totalDurationS += b.estimatedDurationS;
  }

  return {
    title: scene.name,
    sceneSlug: `INT. ${scene.name.toUpperCase()}`,
    beats,
    characters: scene.actors.map((a) => a.name),
    totalEstimatedDurationS: +totalDurationS.toFixed(2),
  };
}

// ---------------------------------------------------------------------------
// Pure Continuity Audit Algorithms
// ---------------------------------------------------------------------------

/**
 * Computes the optical axis orientation vector (pointing forward along -Z in camera space).
 */
export function getCameraForwardVector(rot: Quat): Vec3 {
  // In camera coordinates, looking forward is -Z (0, 0, -1)
  return quatRotateVector(rot, { x: 0, y: 0, z: -1 });
}

/**
 * Computes the angle in degrees between two camera optical axes.
 * Pure.
 */
export function computeCameraOpticalAxisDeltaDeg(cam1: CameraSetupData, cam2: CameraSetupData): number {
  const fwd1 = getCameraForwardVector(cam1.rotation);
  const fwd2 = getCameraForwardVector(cam2.rotation);

  const dot = fwd1.x * fwd2.x + fwd1.y * fwd2.y + fwd1.z * fwd2.z;
  const clampedDot = Math.max(-1.0, Math.min(1.0, dot));
  const rad = Math.acos(clampedDot);
  return (rad * 180) / Math.PI;
}

/**
 * Evaluates the 30-Degree Rule between two cameras.
 * If the camera position/angle changes by less than 30 degrees and the focal length is similar,
 * cutting between them creates a jarring jump cut.
 * Pure.
 */
export function check30DegreeRule(
  cam1: CameraSetupData,
  cam2: CameraSetupData,
): { isJumpCut: boolean; angleDeltaDeg: number; focalDeltaMm: number; focalDeltaPercent: number } {
  const angleDeltaDeg = computeCameraOpticalAxisDeltaDeg(cam1, cam2);
  const focalDeltaMm = Math.abs(cam1.lensFocalLength - cam2.lensFocalLength);
  const maxFocal = Math.max(cam1.lensFocalLength, cam2.lensFocalLength, 1);
  const focalDeltaPercent = (focalDeltaMm / maxFocal) * 100;

  // Jump cut condition: optical angle changed < 30 degrees AND lens changed < 20%
  const isJumpCut = angleDeltaDeg < 30.0 && focalDeltaPercent < 20.0;

  return {
    isJumpCut,
    angleDeltaDeg: +angleDeltaDeg.toFixed(1),
    focalDeltaMm: +focalDeltaMm.toFixed(1),
    focalDeltaPercent: +focalDeltaPercent.toFixed(1),
  };
}

/**
 * Evaluates Eyeline Match Continuity between two actors and two cameras.
 * In a standard shot-reverse-shot setup:
 * - When Actor A looks at Actor B in Camera 1, Actor A must look screen-right (or screen-left).
 * - When Actor B looks back at Actor A in Camera 2, Actor B must look the opposite screen direction (screen-left).
 * If both actors look in the same screen direction, their eyelines will not connect in the edit.
 * Pure.
 */
export function checkEyelineMatch(
  actor1Pos: Vec3,
  actor2Pos: Vec3,
  cam1: CameraSetupData,
  cam2: CameraSetupData,
): { status: 'matching' | 'crossing' | 'neutral' | 'unaligned'; actor1ScreenGaze: 'left' | 'right' | 'center'; actor2ScreenGaze: 'left' | 'right' | 'center' } {
  // Vector from Actor 1 to Actor 2
  const a1ToA2: Vec3 = {
    x: actor2Pos.x - actor1Pos.x,
    y: actor2Pos.y - actor1Pos.y,
    z: actor2Pos.z - actor1Pos.z,
  };

  // Vector from Actor 2 to Actor 1
  const a2ToA1: Vec3 = {
    x: actor1Pos.x - actor2Pos.x,
    y: actor1Pos.y - actor2Pos.y,
    z: actor1Pos.z - actor2Pos.z,
  };

  // Transform gaze vectors into local camera spaces
  const gaze1InCam1 = quatInverseRotateVector(cam1.rotation, a1ToA2);
  const gaze2InCam2 = quatInverseRotateVector(cam2.rotation, a2ToA1);

  const actor1ScreenGaze: 'left' | 'right' | 'center' =
    gaze1InCam1.x > 0.15 ? 'right' : gaze1InCam1.x < -0.15 ? 'left' : 'center';

  const actor2ScreenGaze: 'left' | 'right' | 'center' =
    gaze2InCam2.x > 0.15 ? 'right' : gaze2InCam2.x < -0.15 ? 'left' : 'center';

  if (actor1ScreenGaze === 'center' || actor2ScreenGaze === 'center') {
    return { status: 'neutral', actor1ScreenGaze, actor2ScreenGaze };
  }

  // Opposite screen directions mean eyelines connect properly (Left looks Right, Right looks Left)
  if (actor1ScreenGaze !== actor2ScreenGaze) {
    return { status: 'matching', actor1ScreenGaze, actor2ScreenGaze };
  }

  // If both are looking screen-right or screen-left, eyelines cross and fail
  return { status: 'crossing', actor1ScreenGaze, actor2ScreenGaze };
}

/**
 * Checks screen motion direction continuity of an actor moving between keyframes.
 * Pure.
 */
export function checkScreenDirectionContinuity(
  startPos: Vec3,
  endPos: Vec3,
  cam1: CameraSetupData,
  cam2: CameraSetupData,
): { isReversal: boolean; cam1Motion: 'left' | 'right' | 'neutral'; cam2Motion: 'left' | 'right' | 'neutral' } {
  const motionWorld: Vec3 = {
    x: endPos.x - startPos.x,
    y: endPos.y - startPos.y,
    z: endPos.z - startPos.z,
  };

  const motion1 = quatInverseRotateVector(cam1.rotation, motionWorld);
  const motion2 = quatInverseRotateVector(cam2.rotation, motionWorld);

  const cam1Motion: 'left' | 'right' | 'neutral' =
    motion1.x > 0.1 ? 'right' : motion1.x < -0.1 ? 'left' : 'neutral';

  const cam2Motion: 'left' | 'right' | 'neutral' =
    motion2.x > 0.1 ? 'right' : motion2.x < -0.1 ? 'left' : 'neutral';

  const isReversal =
    (cam1Motion === 'left' && cam2Motion === 'right') ||
    (cam1Motion === 'right' && cam2Motion === 'left');

  return { isReversal, cam1Motion, cam2Motion };
}

/**
 * Checks shot scale progression between two camera shots.
 * Returns scale jump info if a cut jumps across more than 3 scale steps (e.g. ECU to WS).
 * Pure.
 */
export function checkShotScaleProgression(
  fromSize: ShotSize,
  toSize: ShotSize,
): { isScaleJump: boolean; rankDiff: number; fromLabel: string; toLabel: string } {
  const rank1 = SHOT_SCALE_RANK[fromSize] ?? 3;
  const rank2 = SHOT_SCALE_RANK[toSize] ?? 3;
  const rankDiff = Math.abs(rank1 - rank2);

  // Jump across 4 or more scale ranks without transition
  const isScaleJump = rankDiff >= 4;

  return {
    isScaleJump,
    rankDiff,
    fromLabel: SHOT_SCALE_LABELS[fromSize],
    toLabel: SHOT_SCALE_LABELS[toSize],
  };
}

/**
 * Comprehensive Shot Continuity Audit Engine for SetView Scenes.
 * Evaluates:
 * 1. 180-Degree Line of Action between camera pairs.
 * 2. 30-Degree Jump Cut Rule between similar cameras.
 * 3. Eyeline Match Continuity across reverse-coverage shots.
 * 4. Screen Direction Motion tracking.
 * 5. Shot Scale Progression (ECU to EWS).
 * 6. Coverage Gaps (missing key character or action coverage).
 * 7. Camera Frustum Collisions (one camera in the frame of another).
 * Pure.
 */
export function auditSceneContinuity(scene: SceneData): ContinuityAuditReport {
  const issues: ContinuityIssue[] = [];
  const shotPairs: ShotPairAudit[] = [];
  const recommendations: string[] = [];

  const cameras = scene.cameras;
  const actors = scene.actors;

  // 1. Coverage Gap Checks
  if (cameras.length === 0) {
    issues.push({
      type: 'coverage_gap',
      severity: 'critical',
      cameraIds: [],
      title: 'No Cameras Defined in Scene',
      description: 'The scene contains no camera setups. Add at least a Master camera and primary coverage setups.',
      recommendation: 'Place a Master Camera (CAM A) covering the action.',
    });
  } else if (cameras.length === 1 && actors.length >= 2) {
    issues.push({
      type: 'coverage_gap',
      severity: 'warning',
      cameraIds: [cameras[0].id],
      title: 'Single Camera Coverage',
      description: `Only one camera (${cameras[0].name}) is defined for ${actors.length} actors. Reverse-angle coverage and close-ups are missing for editing.`,
      recommendation: 'Add cross-coverage cameras (CAM B, CAM C) for dialogue coverage.',
    });
  }

  // 2. Camera-in-Shot Frustum Collision Checks
  for (let i = 0; i < cameras.length; i++) {
    for (let j = 0; j < cameras.length; j++) {
      if (i === j) continue;
      const camA = cameras[i];
      const camB = cameras[j];

      const inside = isPointInFrustum(
        camB.position,
        camA.position,
        camA.rotation,
        camA.lensFocalLength,
        camA.aspect,
        camA.formatId,
      );

      if (inside) {
        issues.push({
          type: 'camera_in_shot',
          severity: 'warning',
          cameraIds: [camA.id, camB.id],
          title: `Camera Visible in Frame: ${camB.name} in ${camA.name}`,
          description: `${camB.name} is physically placed inside the viewing angle of ${camA.name} and will appear in the shot.`,
          recommendation: `Move ${camB.name} out of ${camA.name}'s field of view, or schedule them as non-concurrent setups.`,
        });
      }
    }
  }

  // 3. Pairwise Camera Continuity Audit
  for (let i = 0; i < cameras.length; i++) {
    for (let j = i + 1; j < cameras.length; j++) {
      const cam1 = cameras[i];
      const cam2 = cameras[j];

      const pairIssues: ContinuityIssue[] = [];

      // Shot Size Classification
      const dist1 = nearestActorDistance(cam1, scene) ?? 3.0;
      const dist2 = nearestActorDistance(cam2, scene) ?? 3.0;
      const shotSize1 = classifyShotSize(cam1.lensFocalLength, cam1.aspect, cam1.formatId, dist1).shotSize;
      const shotSize2 = classifyShotSize(cam2.lensFocalLength, cam2.aspect, cam2.formatId, dist2).shotSize;

      // A. 30-Degree Jump Cut Check
      const jumpCutCheck = check30DegreeRule(cam1, cam2);
      if (jumpCutCheck.isJumpCut) {
        const issue: ContinuityIssue = {
          type: '30_degree_jump_cut',
          severity: 'warning',
          cameraIds: [cam1.id, cam2.id],
          title: `30-Degree Jump Cut: ${cam1.name} & ${cam2.name}`,
          description: `Camera angle difference is only ${jumpCutCheck.angleDeltaDeg}° with a focal difference of ${jumpCutCheck.focalDeltaMm}mm (${jumpCutCheck.focalDeltaPercent}%). Cutting between these will look like a glitch.`,
          recommendation: 'Change angle by >30° or increase focal length difference to at least 2x (e.g. 35mm to 85mm).',
        };
        issues.push(issue);
        pairIssues.push(issue);
      }

      // B. 180-Degree Line of Action Check
      let is180Crossing = false;
      if (actors.length >= 2) {
        const lineResult = check180LineOfAction([cam1, cam2], actors[0].position, actors[1].position);
        if (lineResult.hasCrossing) {
          is180Crossing = true;
          const issue: ContinuityIssue = {
            type: '180_degree_axis_crossing',
            severity: 'critical',
            cameraIds: [cam1.id, cam2.id],
            actorIds: [actors[0].id, actors[1].id],
            title: `180-Degree Axis Crossing: ${cam1.name} to ${cam2.name}`,
            description: `${cam2.name} crosses the line of action between ${actors[0].name} and ${actors[1].name}. Spatial orientation will flip in the cut.`,
            recommendation: `Keep both cameras on the same side of the ${actors[0].name}-${actors[1].name} axis line.`,
          };
          issues.push(issue);
          pairIssues.push(issue);
        }
      }

      // C. Eyeline Match Check
      let eyelineStatus: 'matching' | 'crossing' | 'neutral' | 'unaligned' = 'neutral';
      if (actors.length >= 2) {
        const eyeResult = checkEyelineMatch(actors[0].position, actors[1].position, cam1, cam2);
        eyelineStatus = eyeResult.status;
        if (eyeResult.status === 'crossing') {
          const issue: ContinuityIssue = {
            type: 'eyeline_mismatch',
            severity: 'warning',
            cameraIds: [cam1.id, cam2.id],
            actorIds: [actors[0].id, actors[1].id],
            title: `Eyeline Direction Mismatch: ${cam1.name} & ${cam2.name}`,
            description: `Both actors appear looking screen-${eyeResult.actor1ScreenGaze}. Their gazes will not connect in the cut.`,
            recommendation: 'Adjust camera placement so reverse-shots have complementary screen-left and screen-right looks.',
          };
          issues.push(issue);
          pairIssues.push(issue);
        }
      }

      // D. Shot Scale Progression Check
      const scaleCheck = checkShotScaleProgression(shotSize1, shotSize2);
      if (scaleCheck.isScaleJump) {
        const issue: ContinuityIssue = {
          type: 'shot_scale_jump',
          severity: 'info',
          cameraIds: [cam1.id, cam2.id],
          title: `Dramatic Shot Scale Jump: ${scaleCheck.fromLabel} to ${scaleCheck.toLabel}`,
          description: `Cutting directly from ${scaleCheck.fromLabel} (${cam1.name}) to ${scaleCheck.toLabel} (${cam2.name}) is a wide jump.`,
          recommendation: 'Consider an intermediate medium shot (MS) setup to bridge the progression.',
        };
        issues.push(issue);
        pairIssues.push(issue);
      }

      shotPairs.push({
        fromCamId: cam1.id,
        fromCamName: cam1.name,
        toCamId: cam2.id,
        toCamName: cam2.name,
        angleDeltaDeg: jumpCutCheck.angleDeltaDeg,
        focalLengthDeltaMm: jumpCutCheck.focalDeltaMm,
        fromShotSize: shotSize1,
        toShotSize: shotSize2,
        is30DegreeJumpCut: jumpCutCheck.isJumpCut,
        is180AxisCrossing: is180Crossing,
        eyelineStatus,
        issues: pairIssues,
      });
    }
  }

  // 4. Screen Direction Motion Reversal Check for Moving Actors
  for (const actor of actors) {
    if (actor.keyframes.length >= 2 && cameras.length >= 2) {
      const startPos = actor.position;
      const endPos = actor.keyframes[actor.keyframes.length - 1].position;
      for (let i = 0; i < cameras.length - 1; i++) {
        const cam1 = cameras[i];
        const cam2 = cameras[i + 1];
        const dirCheck = checkScreenDirectionContinuity(startPos, endPos, cam1, cam2);
        if (dirCheck.isReversal) {
          issues.push({
            type: 'reverse_screen_direction',
            severity: 'warning',
            cameraIds: [cam1.id, cam2.id],
            actorIds: [actor.id],
            title: `Screen Motion Reversal for ${actor.name}`,
            description: `${actor.name} moves screen-${dirCheck.cam1Motion} in ${cam1.name} but screen-${dirCheck.cam2Motion} in ${cam2.name}.`,
            recommendation: `Align camera angles so ${actor.name}'s blocking maintains consistent screen motion direction.`,
          });
        }
      }
    }
  }

  // Calculate Scores & Severity
  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  let score = 100 - criticalCount * 30 - warningCount * 15 - infoCount * 5;
  score = Math.max(0, Math.min(100, score));

  const overallStatus: ContinuitySeverity =
    criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : infoCount > 0 ? 'info' : 'clean';

  if (overallStatus === 'clean') {
    recommendations.push('All camera setups maintain clean 180-degree axis, matching eyelines, and distinct camera angles.');
  } else {
    for (const issue of issues) {
      recommendations.push(`- ${issue.title}: ${issue.recommendation}`);
    }
  }

  return {
    sceneName: scene.name,
    score,
    overallStatus,
    totalIssues: issues.length,
    criticalCount,
    warningCount,
    infoCount,
    issues,
    shotPairs,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Visual Storyboard & SVG Generation
// ---------------------------------------------------------------------------

/**
 * Generates an SVG visual panel illustrating camera framing with rule-of-thirds,
 * subject silhouette, and optics metadata banner.
 * Pure.
 */
export function renderStoryboardPanelSvg(
  panel: {
    camera: CameraSetupData;
    shotSize: ShotSize;
    subjectDistanceM: number | null;
    widthPx?: number;
    heightPx?: number;
  },
): string {
  const w = panel.widthPx ?? 480;
  const h = panel.heightPx ?? 270;
  const cam = panel.camera;
  const fmt = sensorFormat(cam.formatId);
  const aspect = aspectValue(cam.aspect);

  // Calculate active frame area maintaining aspect ratio within w x h
  let frameW = w - 40;
  let frameH = frameW / aspect;
  if (frameH > h - 40) {
    frameH = h - 40;
    frameW = frameH * aspect;
  }
  const offsetX = (w - frameW) / 2;
  const offsetY = (h - frameH) / 2;

  const elements: string[] = [];

  // Background
  elements.push(`<rect width="${w}" height="${h}" fill="#0f1115" rx="8" />`);

  // Active viewfinder rect
  elements.push(
    `<rect x="${offsetX.toFixed(1)}" y="${offsetY.toFixed(1)}" width="${frameW.toFixed(1)}" height="${frameH.toFixed(1)}" fill="#181a20" stroke="#3e9bf0" stroke-width="2" rx="4" />`,
  );

  // Rule of thirds lines
  const x1 = offsetX + frameW / 3;
  const x2 = offsetX + (2 * frameW) / 3;
  const y1 = offsetY + frameH / 3;
  const y2 = offsetY + (2 * frameH) / 3;
  elements.push(
    `<line x1="${x1.toFixed(1)}" y1="${offsetY.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${(offsetY + frameH).toFixed(1)}" stroke="#ffffff" stroke-opacity="0.15" stroke-dasharray="3,3" />`,
  );
  elements.push(
    `<line x1="${x2.toFixed(1)}" y1="${offsetY.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${(offsetY + frameH).toFixed(1)}" stroke="#ffffff" stroke-opacity="0.15" stroke-dasharray="3,3" />`,
  );
  elements.push(
    `<line x1="${offsetX.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${(offsetX + frameW).toFixed(1)}" y2="${y1.toFixed(1)}" stroke="#ffffff" stroke-opacity="0.15" stroke-dasharray="3,3" />`,
  );
  elements.push(
    `<line x1="${offsetX.toFixed(1)}" y1="${y2.toFixed(1)}" x2="${(offsetX + frameW).toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#ffffff" stroke-opacity="0.15" stroke-dasharray="3,3" />`,
  );

  // Silhouette human figure scaled to shot size
  const centerX = offsetX + frameW / 2;
  const bottomY = offsetY + frameH - 10;

  // Scale figure height based on shot size
  let figureHeight = frameH * 0.75;
  let figureOffsetY = bottomY;

  switch (panel.shotSize) {
    case 'ECU':
      figureHeight = frameH * 2.8;
      figureOffsetY = offsetY + frameH * 1.8;
      break;
    case 'CU':
      figureHeight = frameH * 1.8;
      figureOffsetY = offsetY + frameH * 1.3;
      break;
    case 'MCU':
      figureHeight = frameH * 1.2;
      figureOffsetY = offsetY + frameH * 0.95;
      break;
    case 'MS':
      figureHeight = frameH * 0.85;
      figureOffsetY = bottomY;
      break;
    case 'MLS':
      figureHeight = frameH * 0.65;
      figureOffsetY = bottomY;
      break;
    case 'WS':
      figureHeight = frameH * 0.45;
      figureOffsetY = bottomY;
      break;
    case 'EWS':
      figureHeight = frameH * 0.25;
      figureOffsetY = bottomY;
      break;
  }

  const headRadius = figureHeight * 0.12;
  const headCenterY = figureOffsetY - figureHeight + headRadius;
  const bodyTopY = headCenterY + headRadius + 4;
  const bodyHeight = figureHeight - (headRadius * 2 + 4);
  const bodyWidth = headRadius * 2.2;

  // Clip path to frame bounds
  elements.push(`<g clip-path="url(#frameClip-${cam.id})">`);
  elements.push(`<defs><clipPath id="frameClip-${cam.id}"><rect x="${offsetX.toFixed(1)}" y="${offsetY.toFixed(1)}" width="${frameW.toFixed(1)}" height="${frameH.toFixed(1)}" rx="4"/></clipPath></defs>`);

  // Head
  elements.push(
    `<circle cx="${centerX.toFixed(1)}" cy="${headCenterY.toFixed(1)}" r="${headRadius.toFixed(1)}" fill="#e5484d" fill-opacity="0.85" stroke="#ffffff" stroke-width="1.5" />`,
  );
  // Torso / Shoulders
  elements.push(
    `<rect x="${(centerX - bodyWidth / 2).toFixed(1)}" y="${bodyTopY.toFixed(1)}" width="${bodyWidth.toFixed(1)}" height="${bodyHeight.toFixed(1)}" rx="${(bodyWidth / 3).toFixed(1)}" fill="#e5484d" fill-opacity="0.75" />`,
  );

  elements.push(`</g>`);

  // Framing Reticle Center Crosshair
  elements.push(
    `<line x1="${(centerX - 8).toFixed(1)}" y1="${(offsetY + frameH / 2).toFixed(1)}" x2="${(centerX + 8).toFixed(1)}" y2="${(offsetY + frameH / 2).toFixed(1)}" stroke="#ffffff" stroke-width="1.5" stroke-opacity="0.6" />`,
  );
  elements.push(
    `<line x1="${centerX.toFixed(1)}" y1="${(offsetY + frameH / 2 - 8).toFixed(1)}" x2="${centerX.toFixed(1)}" y2="${(offsetY + frameH / 2 + 8).toFixed(1)}" stroke="#ffffff" stroke-width="1.5" stroke-opacity="0.6" />`,
  );

  // Top Left Tag: Camera Name & Optics
  elements.push(
    `<text x="${(offsetX + 8).toFixed(1)}" y="${(offsetY + 16).toFixed(1)}" fill="#ffffff" font-size="11" font-weight="bold" font-family="sans-serif">${cam.name} • ${Math.round(cam.lensFocalLength)}mm T${cam.tStop}</text>`,
  );

  // Top Right Tag: Sensor & Aspect
  elements.push(
    `<text x="${(offsetX + frameW - 8).toFixed(1)}" y="${(offsetY + 16).toFixed(1)}" text-anchor="end" fill="#999999" font-size="10" font-family="sans-serif">${fmt.short} | ${cam.aspect}</text>`,
  );

  // Bottom Left Tag: Shot Size
  elements.push(
    `<text x="${(offsetX + 8).toFixed(1)}" y="${(offsetY + frameH - 8).toFixed(1)}" fill="#3e9bf0" font-size="11" font-weight="bold" font-family="sans-serif">${SHOT_SCALE_LABELS[panel.shotSize]}</text>`,
  );

  // Bottom Right Tag: Distance
  if (panel.subjectDistanceM !== null) {
    elements.push(
      `<text x="${(offsetX + frameW - 8).toFixed(1)}" y="${(offsetY + frameH - 8).toFixed(1)}" text-anchor="end" fill="#cccccc" font-size="10" font-family="sans-serif">Dist: ${panel.subjectDistanceM.toFixed(1)}m</text>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n${elements.join('\n')}\n</svg>`;
}

/**
 * Generates a full visual Storyboard Sheet with panel breakdowns and printable HTML.
 * Pure.
 */
export function generateStoryboard(scene: SceneData, breakdown?: ScriptBreakdown): StoryboardSheet {
  const script = breakdown ?? generateScriptBreakdownFromScene(scene);
  const audit = auditSceneContinuity(scene);
  const panels: StoryboardPanel[] = [];

  const cameras = scene.cameras;

  for (let i = 0; i < cameras.length; i++) {
    const cam = cameras[i];
    const dist = nearestActorDistance(cam, scene);
    const dof = dist !== null ? depthOfFieldFor(cam, dist) : null;
    const shotSize = classifyShotSize(cam.lensFocalLength, cam.aspect, cam.formatId, dist ?? 3.0).shotSize;

    const relatedBeats = script.beats.filter(
      (b) => b.targetCameraId === cam.id || b.type === 'dialogue' || b.type === 'action',
    );
    const beatSnippet = relatedBeats[i % Math.max(1, relatedBeats.length)]?.content ?? `${cam.name} coverage mark.`;

    const relatedFlags: string[] = [];
    for (const issue of audit.issues) {
      if (issue.cameraIds.includes(cam.id)) {
        relatedFlags.push(issue.title);
      }
    }

    const svgVisual = renderStoryboardPanelSvg({
      camera: cam,
      shotSize,
      subjectDistanceM: dist,
      widthPx: 480,
      heightPx: 270,
    });

    const timeIn = secondsToSmpte(i * 4.0, 24).formatted;
    const timeOut = secondsToSmpte((i + 1) * 4.0, 24).formatted;

    panels.push({
      panelIndex: i + 1,
      camera: cam,
      shotSize,
      shotSizeLabel: SHOT_SCALE_LABELS[shotSize],
      subjectDistanceM: dist !== null ? +dist.toFixed(1) : null,
      dofNearM: dof ? +dof.nearM.toFixed(2) : null,
      dofFarM: dof ? (Number.isFinite(dof.farM) ? +dof.farM.toFixed(2) : null) : null,
      dialogueOrAction: beatSnippet,
      directorNote: `Angle: ${((cameraYaw(cam.rotation) * 180) / Math.PI).toFixed(1)}° | Height: ${cam.position.y.toFixed(2)}m`,
      timecodeIn: timeIn,
      timecodeOut: timeOut,
      svgVisual,
      continuityFlags: relatedFlags,
    });
  }

  // Combined SVG Document containing multi-column panels
  const svgCols = 2;
  const panelW = 480;
  const panelH = 360;
  const totalCols = Math.min(svgCols, Math.max(1, panels.length));
  const totalRows = Math.ceil(panels.length / totalCols);
  const totalWidth = totalCols * (panelW + 20) + 40;
  const totalHeight = totalRows * (panelH + 20) + 80;

  const svgLines: string[] = [];
  svgLines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">`);
  svgLines.push(`<rect width="${totalWidth}" height="${totalHeight}" fill="#0a0c10" />`);
  svgLines.push(`<text x="30" y="45" fill="#ffffff" font-size="22" font-weight="bold" font-family="sans-serif">${scene.name} - Storyboard & Shot Breakdown</text>`);

  for (let idx = 0; idx < panels.length; idx++) {
    const p = panels[idx];
    const col = idx % totalCols;
    const row = Math.floor(idx / totalCols);
    const px = 30 + col * (panelW + 20);
    const py = 70 + row * (panelH + 20);

    svgLines.push(`<g transform="translate(${px}, ${py})">`);
    svgLines.push(p.svgVisual);
    svgLines.push(`<text x="10" y="295" fill="#ffffff" font-size="13" font-weight="bold" font-family="sans-serif">SHOT ${p.panelIndex}: ${p.camera.name} (${p.shotSizeLabel})</text>`);
    svgLines.push(`<text x="10" y="315" fill="#aaaaaa" font-size="11" font-family="sans-serif">${p.timecodeIn} - ${p.timecodeOut} | ${p.directorNote}</text>`);
    svgLines.push(`<text x="10" y="335" fill="#3e9bf0" font-size="11" font-style="italic" font-family="sans-serif">"${p.dialogueOrAction.slice(0, 60)}"</text>`);
    svgLines.push(`</g>`);
  }
  svgLines.push(`</svg>`);

  const svgDocument = svgLines.join('\n');
  const htmlDocument = renderStoryboardHtml(scene, audit, script, panels);

  return {
    sceneName: scene.name,
    totalPanels: panels.length,
    panels,
    svgDocument,
    htmlDocument,
  };
}

/**
 * Generates a clean, standalone, printable HTML Storyboard & Continuity binder page.
 * Pure.
 */
export function renderStoryboardHtml(
  scene: SceneData,
  audit: ContinuityAuditReport,
  script: ScriptBreakdown,
  panels: StoryboardPanel[],
): string {
  const auditClass =
    audit.overallStatus === 'clean'
      ? 'status-clean'
      : audit.overallStatus === 'critical'
      ? 'status-critical'
      : 'status-warning';

  const panelCards = panels
    .map(
      (p) => `
    <div class="storyboard-card">
      <div class="card-visual">
        ${p.svgVisual}
      </div>
      <div class="card-meta">
        <div class="card-header">
          <span class="shot-badge">SHOT ${p.panelIndex}</span>
          <span class="cam-title">${p.camera.name}</span>
          <span class="tc-badge">${p.timecodeIn} - ${p.timecodeOut}</span>
        </div>
        <div class="optics-row">
          <span><strong>Lens:</strong> ${Math.round(p.camera.lensFocalLength)}mm (T${p.camera.tStop})</span>
          <span><strong>Format:</strong> ${p.camera.formatId} (${p.camera.aspect})</span>
          <span><strong>Scale:</strong> ${p.shotSizeLabel}</span>
        </div>
        <div class="script-snippet">
          <div class="snippet-label">Script Action / Dialogue:</div>
          <div class="snippet-text">"${escapeXml(p.dialogueOrAction)}"</div>
        </div>
        <div class="director-notes">
          <span class="note-label">Notes:</span> ${escapeXml(p.directorNote)}
        </div>
        ${
          p.continuityFlags.length > 0
            ? `<div class="continuity-tags">${p.continuityFlags.map((f) => `<span class="flag-tag">⚠️ ${escapeXml(f)}</span>`).join('')}</div>`
            : '<div class="continuity-clean-tag">✓ Continuity Clean</div>'
        }
      </div>
    </div>
  `,
    )
    .join('');

  const issuesList =
    audit.issues.length > 0
      ? audit.issues
          .map(
            (iss) => `
        <li class="issue-item severity-${iss.severity}">
          <div class="issue-title"><strong>[${iss.severity.toUpperCase()}]</strong> ${escapeXml(iss.title)}</div>
          <div class="issue-desc">${escapeXml(iss.description)}</div>
          <div class="issue-rec"><em>Recommendation:</em> ${escapeXml(iss.recommendation)}</div>
        </li>
      `,
          )
          .join('')
      : '<li class="issue-none">No continuity issues found. All camera setups maintain 180° line, matching eyelines, and 30° separation.</li>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SetView Storyboard & Continuity Breakdown - ${escapeXml(scene.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0c0e12; color: #e1e4ea; padding: 32px; line-height: 1.5; }
    .header-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #282d38; padding-bottom: 20px; margin-bottom: 28px; }
    .header-title h1 { font-size: 28px; color: #ffffff; margin-bottom: 4px; }
    .header-title p { color: #8a92a6; font-size: 14px; }
    .audit-badge { padding: 8px 16px; border-radius: 6px; font-weight: bold; font-size: 14px; }
    .status-clean { background: #1a4d2e; color: #4ade80; border: 1px solid #22c55e; }
    .status-warning { background: #5c3e0a; color: #fbbf24; border: 1px solid #f59e0b; }
    .status-critical { background: #5c1414; color: #f87171; border: 1px solid #ef4444; }

    .audit-summary-section { background: #14171f; border: 1px solid #282d38; border-radius: 8px; padding: 20px; margin-bottom: 32px; }
    .audit-summary-section h2 { font-size: 18px; color: #ffffff; margin-bottom: 12px; }
    .audit-metrics { display: flex; gap: 24px; margin-bottom: 16px; }
    .metric-pill { background: #1e222d; padding: 8px 14px; border-radius: 6px; font-size: 13px; }
    .metric-pill strong { color: #ffffff; font-size: 16px; }
    .issue-list { list-style: none; display: flex; flex-direction: column; gap: 12px; }
    .issue-item { padding: 12px; border-radius: 6px; font-size: 13px; background: #191d26; border-left: 4px solid #8a92a6; }
    .issue-item.severity-critical { border-left-color: #ef4444; }
    .issue-item.severity-warning { border-left-color: #f59e0b; }
    .issue-item.severity-info { border-left-color: #3b82f6; }
    .issue-title { color: #ffffff; margin-bottom: 4px; }
    .issue-desc { color: #a0a6b8; margin-bottom: 4px; }
    .issue-rec { color: #60a5fa; }
    .issue-none { color: #4ade80; font-style: italic; }

    .storyboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(440px, 1fr)); gap: 24px; }
    .storyboard-card { background: #14171f; border: 1px solid #282d38; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; }
    .card-visual { background: #000000; width: 100%; display: flex; justify-content: center; align-items: center; }
    .card-visual svg { width: 100%; height: auto; max-height: 270px; display: block; }
    .card-meta { padding: 18px; display: flex; flex-direction: column; gap: 10px; }
    .card-header { display: flex; align-items: center; gap: 10px; }
    .shot-badge { background: #3e9bf0; color: #ffffff; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
    .cam-title { font-size: 16px; font-weight: bold; color: #ffffff; }
    .tc-badge { margin-left: auto; color: #8a92a6; font-size: 12px; font-family: monospace; }
    .optics-row { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: #8a92a6; border-bottom: 1px solid #232833; padding-bottom: 8px; }
    .optics-row strong { color: #c4c9d4; }
    .script-snippet { font-size: 13px; }
    .snippet-label { color: #6e7687; font-size: 11px; text-transform: uppercase; margin-bottom: 2px; }
    .snippet-text { color: #e2e8f0; font-style: italic; }
    .director-notes { font-size: 12px; color: #8a92a6; }
    .note-label { color: #6e7687; }
    .continuity-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .flag-tag { background: #3d2400; color: #f59e0b; padding: 2px 6px; border-radius: 4px; font-size: 11px; }
    .continuity-clean-tag { color: #4ade80; font-size: 11px; font-weight: 500; }

    @media print {
      body { background: #ffffff; color: #000000; padding: 10px; }
      .header-bar { border-bottom-color: #000000; }
      .audit-summary-section, .storyboard-card { background: #ffffff; border-color: #cccccc; color: #000000; break-inside: avoid; }
      .card-meta { color: #000000; }
      .cam-title, .issue-title, .header-title h1 { color: #000000; }
      .optics-row strong { color: #000000; }
      .snippet-text { color: #222222; }
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="header-title">
      <h1>${escapeXml(scene.name)}</h1>
      <p>SetView AI Storyboard & Multi-Camera Continuity Breakdown • ${script.sceneSlug}</p>
    </div>
    <div class="audit-badge ${auditClass}">
      Score: ${audit.score}/100 • ${audit.overallStatus.toUpperCase()}
    </div>
  </div>

  <div class="audit-summary-section">
    <h2>Automated Multi-Camera Continuity Audit</h2>
    <div class="audit-metrics">
      <div class="metric-pill">Cameras: <strong>${scene.cameras.length}</strong></div>
      <div class="metric-pill">Actors: <strong>${scene.actors.length}</strong></div>
      <div class="metric-pill">Issues: <strong>${audit.totalIssues}</strong></div>
      <div class="metric-pill">Critical (180° / Axis): <strong>${audit.criticalCount}</strong></div>
      <div class="metric-pill">Warnings (Jump Cuts / Eyelines): <strong>${audit.warningCount}</strong></div>
    </div>
    <ul class="issue-list">
      ${issuesList}
    </ul>
  </div>

  <div class="storyboard-grid">
    ${panelCards}
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// AI Prompt Package Generation
// ---------------------------------------------------------------------------

/**
 * Generates an advanced Markdown & JSON Prompt Package for AI Vision & Cinematography LLMs.
 * Pure.
 */
export function buildAiContinuityPromptPackage(scene: SceneData): string {
  const audit = auditSceneContinuity(scene);
  const script = generateScriptBreakdownFromScene(scene);
  const lines: string[] = [];

  lines.push('# SetView AI Cinematography, Continuity & Storyboard Prompt');
  lines.push('');
  lines.push('You are an expert Director of Photography (ASC/BSC) and Script Supervisor / Continuity Editor.');
  lines.push('Analyze the following 3D spatial blocking, camera lens optics, and automated continuity telemetry from SetView.');
  lines.push('');

  lines.push('## Scene Metadata');
  lines.push(`- **Scene Name**: ${scene.name}`);
  lines.push(`- **Slugline**: ${script.sceneSlug}`);
  lines.push(`- **Pace**: ${scene.walkSpeed.toFixed(1)} m/s`);
  lines.push(`- **Total Cameras**: ${scene.cameras.length}`);
  lines.push(`- **Total Actors**: ${scene.actors.length}`);
  lines.push(`- **Automated Continuity Score**: ${audit.score}/100 (${audit.overallStatus.toUpperCase()})`);
  lines.push('');

  lines.push('## Script Beats & Dialogue Breakdown');
  for (const b of script.beats) {
    if (b.type === 'heading') {
      lines.push(`\n### ${b.content}`);
    } else if (b.type === 'dialogue') {
      lines.push(`- **${b.characterName}**: "${b.content}" (Est. ${b.estimatedDurationS}s)`);
    } else if (b.type === 'action') {
      lines.push(`- _[Action]_ ${b.content}`);
    } else if (b.type === 'sound') {
      lines.push(`- 🎵 _[Sound Cue]_ ${b.content}`);
    }
  }
  lines.push('');

  lines.push('## Camera Setups & Optical Framing Telemetry');
  for (const c of scene.cameras) {
    const fmt = sensorFormat(c.formatId);
    const dist = nearestActorDistance(c, scene);
    const dof = dist !== null ? depthOfFieldFor(c, dist) : null;
    const shotSize = classifyShotSize(c.lensFocalLength, c.aspect, c.formatId, dist ?? 3.0).shotSize;
    const fwd = getCameraForwardVector(c.rotation);

    lines.push(`### ${c.name}`);
    lines.push(`- **Lens & Gate**: ${Math.round(c.lensFocalLength)}mm T${c.tStop} | ${fmt.name} (${fmt.gateWidthMm}mm gate, ${c.aspect})`);
    lines.push(`- **Spatial Pose**: Position (${c.position.x.toFixed(2)}, ${c.position.y.toFixed(2)}, ${c.position.z.toFixed(2)})m | Forward Vector (${fwd.x.toFixed(2)}, ${fwd.y.toFixed(2)}, ${fwd.z.toFixed(2)})`);
    lines.push(`- **Shot Classification**: ${SHOT_SCALE_LABELS[shotSize]}`);
    if (dist !== null) lines.push(`- **Subject Distance**: ${dist.toFixed(2)}m`);
    if (dof) lines.push(`- **Depth of Field**: Near ${dof.nearM.toFixed(2)}m to Far ${Number.isFinite(dof.farM) ? dof.farM.toFixed(2) + 'm' : 'Infinity'}`);
  }
  lines.push('');

  lines.push('## Automated Continuity Audit Findings');
  if (audit.issues.length === 0) {
    lines.push('- No automated continuity violations detected.');
  } else {
    for (const iss of audit.issues) {
      lines.push(`- **[${iss.severity.toUpperCase()}] ${iss.title}**: ${iss.description}`);
      lines.push(`  - _Fix_: ${iss.recommendation}`);
    }
  }
  lines.push('');

  lines.push('## Expected Deliverables');
  lines.push('1. **Coverage Assessment**: Evaluate coverage completeness, identifying any missing master, reverse OTS, or inserts.');
  lines.push('2. **Continuity & Line Fixes**: Specific camera relocations or lens adjustments to resolve any 180° line crossings, 30° jump cuts, or eyeline mismatches.');
  lines.push('3. **Lighting & Atmosphere Recommendations**: Suggest key/fill angles, color temperatures (Kelvin), and rim separation for each setup.');
  lines.push('4. **Editing Sequence Guide**: Propose an optimal cutting order and transition rhythm for the scene.');

  return lines.join('\n');
}

/**
 * Generates an instant, highly detailed simulated AI Continuity & Storyboard Director Feedback report.
 * Pure.
 */
export function simulateAiContinuityBreakdown(scene: SceneData): string {
  const audit = auditSceneContinuity(scene);
  const script = generateScriptBreakdownFromScene(scene);
  const lines: string[] = [];

  lines.push(`# AI Shot Continuity & Storyboard Analysis: ${scene.name}`);
  lines.push('');
  lines.push(`**Overall Continuity Score**: ${audit.score}/100 (${audit.overallStatus.toUpperCase()})`);
  lines.push(`**Scene Pacing & Duration**: ~${script.totalEstimatedDurationS}s across ${script.beats.length} beats.`);
  lines.push('');

  lines.push('### 1. Multi-Camera Coverage & Shot Scale Progression');
  if (scene.cameras.length === 0) {
    lines.push('- Critical: No cameras placed. Add a primary camera setup to evaluate framing.');
  } else if (scene.cameras.length === 1) {
    lines.push(`- Warning: Only 1 camera setup (${scene.cameras[0].name}) defined. Add reverse angles or tight inserts for dialogue coverage.`);
  } else {
    lines.push(`- Setup provides ${scene.cameras.length} camera angles: ${scene.cameras.map((c) => c.name).join(', ')}.`);
    for (const c of scene.cameras) {
      const dist = nearestActorDistance(c, scene) ?? 3.0;
      const size = classifyShotSize(c.lensFocalLength, c.aspect, c.formatId, dist).shotSize;
      lines.push(`  - **${c.name}**: ${SHOT_SCALE_LABELS[size]} (${Math.round(c.lensFocalLength)}mm T${c.tStop})`);
    }
  }
  lines.push('');

  lines.push('### 2. 180-Degree Line & Eyeline Match Audit');
  if (audit.criticalCount > 0) {
    const axisIssues = audit.issues.filter((i) => i.type === '180_degree_axis_crossing');
    for (const iss of axisIssues) {
      lines.push(`- ⚠️ **Axis Violation**: ${iss.description}`);
      lines.push(`  - *Action*: ${iss.recommendation}`);
    }
  } else if (scene.cameras.length >= 2 && scene.actors.length >= 2) {
    lines.push('- ✅ **180-Degree Line**: All camera setups maintain consistent line of action orientation.');
  } else {
    lines.push('- Line of action check requires at least 2 cameras and 2 actors.');
  }

  const eyeIssues = audit.issues.filter((i) => i.type === 'eyeline_mismatch');
  if (eyeIssues.length > 0) {
    for (const iss of eyeIssues) {
      lines.push(`- ⚠️ **Eyeline Match**: ${iss.description}`);
    }
  } else if (scene.cameras.length >= 2 && scene.actors.length >= 2) {
    lines.push('- ✅ **Eyeline Matching**: Complementary screen-left / screen-right gazes connect cleanly across coverage.');
  }
  lines.push('');

  lines.push('### 3. Jump Cut & 30-Degree Rule Verification');
  const jumpIssues = audit.issues.filter((i) => i.type === '30_degree_jump_cut');
  if (jumpIssues.length > 0) {
    for (const iss of jumpIssues) {
      lines.push(`- ⚠️ **Jump Cut Risk**: ${iss.description}`);
      lines.push(`  - *Action*: ${iss.recommendation}`);
    }
  } else if (scene.cameras.length >= 2) {
    lines.push('- ✅ **Angular Separation**: All camera pairs exceed 30° angular delta or provide sufficient lens contrast.');
  }
  lines.push('');

  lines.push('### 4. Lighting & Color Temperature Balance');
  if (scene.lights && scene.lights.length > 0) {
    lines.push(`- Scene contains ${scene.lights.length} physical light source(s). Key/fill ratios provide solid subject modeling.`);
  } else {
    lines.push('- Recommendation: Add dedicated Key and Fill light fixtures to establish 3:1 lighting contrast and rim hair separation.');
  }
  lines.push('');

  lines.push('### 5. Recommended Cutting Order & Transition Plan');
  if (scene.cameras.length >= 2) {
    lines.push(`1. **Master Establishing**: Open on ${scene.cameras[0].name} to set geography and actor positions.`);
    lines.push(`2. **Dialogue Exchange**: Cut between ${scene.cameras.slice(1).map((c) => c.name).join(' and ')} on line deliveries.`);
    lines.push(`3. **Pacing**: Cut on actor physical movement or head turns to conceal transitions.`);
  } else {
    lines.push('1. Add additional coverage cameras to establish a complete cutting sequence.');
  }

  return lines.join('\n');
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
