// ---------------------------------------------------------------------------
// SetView Pure Domain Screenplay Beat Breakdown & AI Cinematography Continuity Engine
// PURE DOMAIN MODULE - ZERO Three.js or DOM imports.
// Suitable for direct execution in Node.js unit tests and headless runtimes.
// ---------------------------------------------------------------------------

export type ScriptFormat = 'fountain' | 'final_draft_fdx' | 'plain_text';

export type ScriptElementType =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'shot'
  | 'note';

export interface ScriptElement {
  type: ScriptElementType;
  text: string;
  characterName?: string;
  sceneNumber?: number;
  intExt?: 'INT' | 'EXT' | 'INT_EXT';
  location?: string;
  timeOfDay?: string;
}

export interface DialogueBlock {
  character: string;
  parenthetical?: string;
  text: string;
  wordCount: number;
  estimatedDurationSec: number;
}

export interface ActionBeat {
  text: string;
  characterMentions: string[];
  blockingAction?: string;
}

export interface ParsedScene {
  sceneNumber: number;
  heading: string;
  intExt: 'INT' | 'EXT' | 'INT_EXT';
  location: string;
  timeOfDay: string;
  characters: string[];
  dialogueBlocks: DialogueBlock[];
  actionBeats: ActionBeat[];
  estimatedDurationSec: number;
  rawText: string;
}

export interface ParsedScreenplay {
  title: string;
  author?: string;
  format?: ScriptFormat;
  scenes: ParsedScene[];
  totalEstimatedDurationSec?: number;
  totalWordCount?: number;
  rawText: string;
}

export type ShotType =
  | 'master_wide'
  | 'two_shot'
  | 'ots_a'
  | 'ots_b'
  | 'single_close_up_a'
  | 'single_close_up_b'
  | 'insert'
  | 'high_angle'
  | 'dutch_angle';

export interface ShotCoverageRecommendation {
  shotId: string;
  name: string;
  shotType: ShotType;
  primaryActorId?: string;
  secondaryActorId?: string;
  suggestedFocalLengthMm: number;
  suggestedSensorFormat: string;
  cameraPosition: { x: number; y: number; z: number };
  cameraLookAt: { x: number; y: number; z: number };
  lensHeightM: number;
  description: string;
}

export interface CameraAxisSide {
  cameraId: string;
  cameraName: string;
  side: 'left' | 'right' | 'on-line' | 'on_line';
  signedDistance: number;
}

export interface LineOfActionAnalysis {
  has180Violation: boolean;
  hasCrossing: boolean;
  lineVector: {
    start: { x: number; y: number; z: number };
    end: { x: number; y: number; z: number };
  };
  cameraA: {
    id: string;
    name: string;
    sideOfLine: 'left' | 'right' | 'on_line';
  };
  cameraB: {
    id: string;
    name: string;
    sideOfLine: 'left' | 'right' | 'on_line';
  };
  severity: 'safe' | 'warning_jump_cut' | 'violation_180_cross';
  message: string;
  angleDeltaDeg: number;
  /** Backward compatibility with legacy multi-camera line check */
  axisStart?: { x: number; y: number; z: number };
  axisEnd?: { x: number; y: number; z: number };
  cameraSides: CameraAxisSide[];
}

export interface EyelineMatchAnalysis {
  actorA: {
    id: string;
    name: string;
    lookingAngleDeg: number;
    screenSide: 'screen_left' | 'screen_right';
  };
  actorB: {
    id: string;
    name: string;
    lookingAngleDeg: number;
    screenSide: 'screen_left' | 'screen_right';
  };
  isConsistent: boolean;
  mismatchDeg: number;
  message: string;
}

export interface CoverageAuditReport {
  scorePercent: number;
  healthScore?: number;
  violationsCount?: number;
  masterWideCount: number;
  mediumShotCount: number;
  closeUpCount: number;
  totalShots: number;
  coverageBalance:
    | 'well_balanced'
    | 'under_covered_closeups'
    | 'missing_master_wide'
    | 'excessive_jump_cuts';
  lineOfActionAlerts: LineOfActionAnalysis[];
  lineOfActionChecks?: LineOfActionAnalysis[];
  eyelineAlerts: EyelineMatchAnalysis[];
  framingSuggestions: string[];
  framingRecommendations?: string[];
}

export interface ScreenplayConfig {
  enabled: boolean;
  scriptText: string;
  format?: ScriptFormat;
  activeSceneIndex: number;
  parsedScript?: ParsedScreenplay;
  autoSyncCameraCoverage: boolean;
  autoEnforce180Line: boolean;
  dialoguePartnerAId?: string;
  dialoguePartnerBId?: string;
}

export interface MinimalActorEntity {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  rotationY?: number;
}

export interface MinimalCameraEntity {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  rotationY?: number;
  focalLength?: number;
  lookAt?: { x: number; y: number; z: number };
  targetActorId?: string | null;
}

// ---------------------------------------------------------------------------
// Curated Default Sample Screenplay (Fountain Format)
// ---------------------------------------------------------------------------

export const DEFAULT_SAMPLE_FOUNTAIN_SCRIPT = `Title: THE MIDNIGHT ENCOUNTER
Credit: Written by
Author: Arthur Pendelton
Draft date: 2026-08-16

EXT. CITY ALLEYWAY - NIGHT #1#

Rain slicks the cobblestones. Steam curls from a manhole cover.

DETECTIVE MILLER (40s, drenched trench coat) steps out from the shadows, flicking an unlit match against the brick wall.

MILLER
(under his breath)
Late. She is never late.

A silhouette emerges from behind an iron fire escape. MAYA (30s, leather jacket, observant eyes) steps forward into the amber streetlight.

MAYA
Footsteps echoed three blocks back. You were followed, Miller.

MILLER
(turning sharply)
Nobody follows me unless I want them to. Where is the ledger?

Maya pulls a slim microdrive from her coat pocket, keeping it close to her chest.

MAYA
Safe. But it comes with a price.

MILLER
We had an agreement, Maya. The volume wall at dawn.

MAYA
(stepping closer)
The deal changed when they tapped your comms. Look up.

A red drone beacon blinks silently above the rooftop cornice.

CUT TO:

INT. WAREHOUSE SAFE HOUSE - NIGHT #2#

Rain patters against the corrugated zinc ceiling.`;

// ---------------------------------------------------------------------------
// Pure Domain String & Token Utilities
// ---------------------------------------------------------------------------

const DIALOGUE_WORDS_PER_SEC = 3.0; // ~180 WPM normal conversational rate
const ACTION_WORDS_PER_SEC = 2.5; // ~150 WPM descriptive pace
const PARENTHETICAL_PAUSE_SEC = 0.8;
const SCENE_HEADING_BASE_PAUSE_SEC = 2.0;

/** Counts words in a string cleanly. */
export function countWords(text: string): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/** Calculates word count and speech duration based on words per minute. */
export function calculateWordCountAndDuration(
  text: string,
  wordsPerMinute = 130,
): { wordCount: number; durationSec: number } {
  const words = countWords(text);
  return {
    wordCount: words,
    durationSec: Math.max(1, (words / wordsPerMinute) * 60),
  };
}

/** Calculates 2D cross-product signed distance from a point to a line. */
export function calculateSignedDistanceToLine(
  point: { x: number; z: number },
  lineStart: { x: number; z: number },
  lineEnd: { x: number; z: number },
): number {
  const dx = lineEnd.x - lineStart.x;
  const dz = lineEnd.z - lineStart.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return 0;
  return (dx * (point.z - lineStart.z) - dz * (point.x - lineStart.x)) / len;
}

// ---------------------------------------------------------------------------
// Fountain Script Parser
// Pure domain Fountain format parsing adhering to fountain.io specifications.
// ---------------------------------------------------------------------------

const SCENE_HEADING_REGEX = /^(?:(\.[A-Z0-9_]+.*)|((?:INT|EXT|INT\.?\/EXT\.?|EXT\.?\/INT\.?|I\/E\.?)\b.*))$/i;
const TRANSITION_REGEX = /^(?:(>[^<]+<)|((?:FADE IN:|FADE OUT\.|CUT TO:|SMASH CUT TO:|DISSOLVE TO:|MATCH CUT TO:|JUMP CUT TO:)|[A-Z\s0-9_]+ TO:))$/;

interface FountainTitlePageData {
  title: string;
  author?: string;
  remainingLines: string[];
}

function parseFountainTitlePage(lines: string[]): FountainTitlePageData {
  let title = 'Untitled Screenplay';
  let author: string | undefined = undefined;
  let inTitlePage = true;
  let idx = 0;

  for (; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (inTitlePage) {
      if (line === '') {
        continue;
      }
      const matchKey = line.match(/^([A-Za-z\s]+):\s*(.*)$/);
      if (matchKey) {
        const key = matchKey[1].trim().toLowerCase();
        const val = matchKey[2].trim();
        if (key === 'title') title = val;
        else if (key === 'author' || key === 'authors' || key === 'written by') author = val;
      } else {
        inTitlePage = false;
        break;
      }
    }
  }

  return {
    title,
    author,
    remainingLines: lines.slice(idx),
  };
}

export function parseFountainScript(text: string): ParsedScreenplay {
  const rawText = text || '';
  const allLines = rawText.split(/\r?\n/);
  const { title, author, remainingLines } = parseFountainTitlePage(allLines);

  const scenes: ParsedScene[] = [];
  let activeScene: ParsedScene | null = null;
  let currentCharacter: string | null = null;
  let currentParenthetical: string | undefined = undefined;
  let dialogueBuffer: string[] = [];

  const flushDialogue = () => {
    if (currentCharacter && activeScene) {
      const dialogueText = dialogueBuffer.join(' ').trim();
      const wordCnt = countWords(dialogueText);
      let durationSec = Math.max(1.0, wordCnt / DIALOGUE_WORDS_PER_SEC);
      if (currentParenthetical) {
        durationSec += PARENTHETICAL_PAUSE_SEC;
      }

      const dialogueBlock: DialogueBlock = {
        character: currentCharacter,
        parenthetical: currentParenthetical,
        text: dialogueText,
        wordCount: wordCnt,
        estimatedDurationSec: parseFloat(durationSec.toFixed(1)),
      };

      activeScene.dialogueBlocks.push(dialogueBlock);
      activeScene.estimatedDurationSec += dialogueBlock.estimatedDurationSec;

      if (!activeScene.characters.includes(currentCharacter)) {
        activeScene.characters.push(currentCharacter);
      }
    }
    currentCharacter = null;
    currentParenthetical = undefined;
    dialogueBuffer = [];
  };

  for (let i = 0; i < remainingLines.length; i++) {
    const rawLine = remainingLines[i];
    const line = rawLine.trim();

    if (line === '') {
      flushDialogue();
      continue;
    }

    if (SCENE_HEADING_REGEX.test(line)) {
      flushDialogue();

      let headingText = line.startsWith('.') ? line.slice(1).trim() : line;
      let sceneNum = scenes.length + 1;

      const numMatch = headingText.match(/#([0-9A-Za-z_-]+)#\s*$/);
      if (numMatch) {
        const parsedNum = parseInt(numMatch[1], 10);
        if (!isNaN(parsedNum)) sceneNum = parsedNum;
        headingText = headingText.replace(/#([0-9A-Za-z_-]+)#\s*$/, '').trim();
      }

      let intExt: 'INT' | 'EXT' | 'INT_EXT' = 'INT';
      const upper = headingText.toUpperCase();
      if (upper.startsWith('INT.') || upper.startsWith('INT ')) intExt = 'INT';
      else if (upper.startsWith('EXT.') || upper.startsWith('EXT ')) intExt = 'EXT';
      else if (upper.startsWith('INT/EXT') || upper.startsWith('I/E')) intExt = 'INT_EXT';

      let location = 'SCENE SETTING';
      let timeOfDay = 'DAY';
      const parts = headingText.split(/\s+-\s+|\s+--\s+/);
      if (parts.length > 1) {
        location = parts[0].replace(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|INT|EXT)\s*/i, '').trim();
        timeOfDay = parts[parts.length - 1].trim().toUpperCase();
      } else {
        location = headingText.replace(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|INT|EXT)\s*/i, '').trim();
      }

      activeScene = {
        sceneNumber: sceneNum,
        heading: line,
        intExt,
        location: location || 'UNKNOWN LOCATION',
        timeOfDay: timeOfDay || 'DAY',
        characters: [],
        dialogueBlocks: [],
        actionBeats: [],
        estimatedDurationSec: SCENE_HEADING_BASE_PAUSE_SEC,
        rawText: line,
      };
      scenes.push(activeScene);
      continue;
    }

    if (!activeScene) {
      activeScene = {
        sceneNumber: 1,
        heading: 'INT. PRODUCTION STAGE - DAY #1#',
        intExt: 'INT',
        location: 'PRODUCTION STAGE',
        timeOfDay: 'DAY',
        characters: [],
        dialogueBlocks: [],
        actionBeats: [],
        estimatedDurationSec: SCENE_HEADING_BASE_PAUSE_SEC,
        rawText: line,
      };
      scenes.push(activeScene);
    }

    if (TRANSITION_REGEX.test(line)) {
      flushDialogue();
      activeScene.estimatedDurationSec += 1.0;
      continue;
    }

    if (currentCharacter && line.startsWith('(') && line.endsWith(')')) {
      currentParenthetical = line.slice(1, -1).trim();
      continue;
    }

    const isCharacterCue =
      line === line.toUpperCase() &&
      !line.endsWith(':') &&
      !TRANSITION_REGEX.test(line) &&
      /^[A-Z0-9_\s.'\-()]+$/.test(line) &&
      line.length < 40;

    if (isCharacterCue && !currentCharacter) {
      flushDialogue();
      currentCharacter = line.replace(/\s*\([^)]*\)/g, '').trim();
      continue;
    }

    if (currentCharacter) {
      dialogueBuffer.push(line);
      continue;
    }

    flushDialogue();
    const wordCnt = countWords(line);
    const beatDuration = Math.max(1.0, wordCnt / ACTION_WORDS_PER_SEC);
    activeScene.estimatedDurationSec += parseFloat(beatDuration.toFixed(1));

    const mentions: string[] = [];
    for (const charName of activeScene.characters) {
      const regex = new RegExp(`\\b${charName}\\b`, 'i');
      if (regex.test(line) && !mentions.includes(charName)) {
        mentions.push(charName);
      }
    }

    activeScene.actionBeats.push({
      text: line,
      characterMentions: mentions,
    });
  }

  flushDialogue();

  return {
    title,
    author,
    format: 'fountain',
    scenes,
    totalEstimatedDurationSec: parseFloat(scenes.reduce((sum, s) => sum + s.estimatedDurationSec, 0).toFixed(1)),
    totalWordCount: scenes.reduce((sum, s) => sum + s.dialogueBlocks.reduce((ds, d) => ds + d.wordCount, 0) + s.actionBeats.reduce((as, a) => as + countWords(a.text), 0), 0),
    rawText,
  };
}

// ---------------------------------------------------------------------------
// Final Draft FDX XML Script Parser
// ---------------------------------------------------------------------------

export function parseFdxScript(xmlText: string): ParsedScreenplay {
  const rawText = xmlText || '';
  let title = 'Final Draft Screenplay';
  let author: string | undefined = undefined;

  const scenes: ParsedScene[] = [];
  let currentScene: ParsedScene | null = null;
  let currentCharacter: string | null = null;
  let currentParenthetical: string | undefined = undefined;
  let dialogueBuffer: string[] = [];

  const flushDialogue = () => {
    if (currentCharacter && currentScene) {
      const dialogueText = dialogueBuffer.join(' ').trim();
      const wordCnt = countWords(dialogueText);
      let durationSec = Math.max(1.0, wordCnt / DIALOGUE_WORDS_PER_SEC);
      if (currentParenthetical) {
        durationSec += PARENTHETICAL_PAUSE_SEC;
      }

      currentScene.dialogueBlocks.push({
        character: currentCharacter,
        parenthetical: currentParenthetical,
        text: dialogueText,
        wordCount: wordCnt,
        estimatedDurationSec: parseFloat(durationSec.toFixed(1)),
      });
      currentScene.estimatedDurationSec += durationSec;
      if (!currentScene.characters.includes(currentCharacter)) currentScene.characters.push(currentCharacter);
    }
    currentCharacter = null;
    currentParenthetical = undefined;
    dialogueBuffer = [];
  };

  const paragraphRegex = /<Paragraph(?:\s+Number="([^"]*)")?\s+Type="([^"]+)">([\s\S]*?)<\/Paragraph>/gi;
  let pMatch: RegExpExecArray | null;

  while ((pMatch = paragraphRegex.exec(rawText)) !== null) {
    const explicitNumber = pMatch[1];
    const pType = (pMatch[2] || '').trim();
    const pBody = pMatch[3] || '';
    const cleanText = pBody.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim();

    if (!cleanText) continue;

    if (pType.toLowerCase() === 'scene heading') {
      flushDialogue();
      let sceneNum = scenes.length + 1;
      if (explicitNumber) {
        const num = parseInt(explicitNumber, 10);
        if (!isNaN(num)) sceneNum = num;
      }

      let intExt: 'INT' | 'EXT' | 'INT_EXT' = 'INT';
      const upper = cleanText.toUpperCase();
      if (upper.startsWith('INT.') || upper.startsWith('INT ')) intExt = 'INT';
      else if (upper.startsWith('EXT.') || upper.startsWith('EXT ')) intExt = 'EXT';
      else if (upper.startsWith('INT/EXT') || upper.startsWith('I/E')) intExt = 'INT_EXT';

      let location = 'SCENE SETTING';
      let timeOfDay = 'DAY';
      const parts = cleanText.split(/\s+-\s+|\s+--\s+/);
      if (parts.length > 1) {
        location = parts[0].replace(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|INT|EXT)\s*/i, '').trim();
        timeOfDay = parts[parts.length - 1].trim().toUpperCase();
      } else {
        location = cleanText.replace(/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|INT|EXT)\s*/i, '').trim();
      }

      currentScene = {
        sceneNumber: sceneNum,
        heading: cleanText,
        intExt,
        location: location || 'UNKNOWN LOCATION',
        timeOfDay: timeOfDay || 'DAY',
        characters: [],
        dialogueBlocks: [],
        actionBeats: [],
        estimatedDurationSec: SCENE_HEADING_BASE_PAUSE_SEC,
        rawText: cleanText,
      };
      scenes.push(currentScene);
      continue;
    }

    if (!currentScene) {
      currentScene = {
        sceneNumber: 1,
        heading: 'INT. STAGE - DAY #1#',
        intExt: 'INT',
        location: 'STAGE',
        timeOfDay: 'DAY',
        characters: [],
        dialogueBlocks: [],
        actionBeats: [],
        estimatedDurationSec: SCENE_HEADING_BASE_PAUSE_SEC,
        rawText: '',
      };
      scenes.push(currentScene);
    }

    const typeLower = pType.toLowerCase();

    if (typeLower === 'character') {
      flushDialogue();
      currentCharacter = cleanText.replace(/\s*\([^)]*\)/g, '').trim();
    } else if (typeLower === 'parenthetical') {
      currentParenthetical = cleanText.replace(/^\(|\)$/g, '').trim();
    } else if (typeLower === 'dialogue') {
      if (currentCharacter) {
        dialogueBuffer.push(cleanText);
      }
    } else if (typeLower === 'transition') {
      flushDialogue();
      currentScene.estimatedDurationSec += 1.0;
    } else {
      flushDialogue();
      const wordCnt = countWords(cleanText);
      const beatDuration = Math.max(1.0, wordCnt / ACTION_WORDS_PER_SEC);
      currentScene.estimatedDurationSec += parseFloat(beatDuration.toFixed(1));

      const mentions: string[] = [];
      for (const charName of currentScene.characters) {
        const regex = new RegExp(`\\b${charName}\\b`, 'i');
        if (regex.test(cleanText) && !mentions.includes(charName)) {
          mentions.push(charName);
        }
      }

      currentScene.actionBeats.push({
        text: cleanText,
        characterMentions: mentions,
      });
    }
  }

  flushDialogue();

  return {
    title,
    author,
    format: 'final_draft_fdx',
    scenes,
    totalEstimatedDurationSec: parseFloat(scenes.reduce((sum, s) => sum + s.estimatedDurationSec, 0).toFixed(1)),
    totalWordCount: scenes.reduce((sum, s) => sum + s.dialogueBlocks.reduce((ds, d) => ds + d.wordCount, 0) + s.actionBeats.reduce((as, a) => as + countWords(a.text), 0), 0),
    rawText,
  };
}

// ---------------------------------------------------------------------------
// AI Cinematography Shot Coverage Solver
// ---------------------------------------------------------------------------

export function generateAutoShotCoverage(
  actorAPos: { x: number; y: number; z: number },
  actorBPos: { x: number; y: number; z: number },
  actorAName: string = 'Actor A',
  actorBName: string = 'Actor B',
  primaryActorId?: string,
  secondaryActorId?: string,
): ShotCoverageRecommendation[] {
  const recommendations: ShotCoverageRecommendation[] = [];

  const midX = (actorAPos.x + actorBPos.x) * 0.5;
  const midY = (actorAPos.y + actorBPos.y) * 0.5;
  const midZ = (actorAPos.z + actorBPos.z) * 0.5;

  const dx = actorBPos.x - actorAPos.x;
  const dz = actorBPos.z - actorAPos.z;
  const dist = Math.hypot(dx, dz) || 2.0;

  const normX = -dz / dist;
  const normZ = dx / dist;

  const masterDist = Math.max(3.5, dist * 2.2);
  recommendations.push({
    shotId: 'shot-master-wide',
    name: 'Master Wide',
    shotType: 'master_wide',
    primaryActorId,
    secondaryActorId,
    suggestedFocalLengthMm: 24,
    suggestedSensorFormat: 'full_frame_35',
    cameraPosition: {
      x: parseFloat((midX + normX * masterDist).toFixed(2)),
      y: parseFloat((midY + 1.5).toFixed(2)),
      z: parseFloat((midZ + normZ * masterDist).toFixed(2)),
    },
    cameraLookAt: {
      x: parseFloat(midX.toFixed(2)),
      y: parseFloat((midY + 1.4).toFixed(2)),
      z: parseFloat(midZ.toFixed(2)),
    },
    lensHeightM: 1.5,
    description: `Master Establishing Wide covering both ${actorAName} and ${actorBName} with environment context.`,
  });

  const twoShotDist = Math.max(2.4, dist * 1.5);
  recommendations.push({
    shotId: 'shot-two-shot',
    name: 'Two-Shot 50/50',
    shotType: 'two_shot',
    primaryActorId,
    secondaryActorId,
    suggestedFocalLengthMm: 35,
    suggestedSensorFormat: 'super35',
    cameraPosition: {
      x: parseFloat((midX + normX * twoShotDist).toFixed(2)),
      y: parseFloat((midY + 1.45).toFixed(2)),
      z: parseFloat((midZ + normZ * twoShotDist).toFixed(2)),
    },
    cameraLookAt: {
      x: parseFloat(midX.toFixed(2)),
      y: parseFloat((midY + 1.4).toFixed(2)),
      z: parseFloat(midZ.toFixed(2)),
    },
    lensHeightM: 1.45,
    description: `Balanced 50/50 Two-Shot maintaining spatial relationship between ${actorAName} and ${actorBName}.`,
  });

  const otsOffsetB = 0.45;
  recommendations.push({
    shotId: 'shot-ots-a',
    name: `OTS ${actorAName}`,
    shotType: 'ots_a',
    primaryActorId,
    secondaryActorId,
    suggestedFocalLengthMm: 50,
    suggestedSensorFormat: 'super35',
    cameraPosition: {
      x: parseFloat((actorBPos.x + normX * otsOffsetB + (actorBPos.x - actorAPos.x) * 0.25).toFixed(2)),
      y: parseFloat((actorBPos.y + 1.48).toFixed(2)),
      z: parseFloat((actorBPos.z + normZ * otsOffsetB + (actorBPos.z - actorAPos.z) * 0.25).toFixed(2)),
    },
    cameraLookAt: {
      x: parseFloat(actorAPos.x.toFixed(2)),
      y: parseFloat((actorAPos.y + 1.45).toFixed(2)),
      z: parseFloat(actorAPos.z.toFixed(2)),
    },
    lensHeightM: 1.48,
    description: `Over-the-shoulder framing looking past ${actorBName} to capture ${actorAName}'s reactions.`,
  });

  const otsOffsetA = 0.45;
  recommendations.push({
    shotId: 'shot-ots-b',
    name: `OTS ${actorBName}`,
    shotType: 'ots_b',
    primaryActorId: secondaryActorId,
    secondaryActorId: primaryActorId,
    suggestedFocalLengthMm: 50,
    suggestedSensorFormat: 'super35',
    cameraPosition: {
      x: parseFloat((actorAPos.x + normX * otsOffsetA + (actorAPos.x - actorBPos.x) * 0.25).toFixed(2)),
      y: parseFloat((actorAPos.y + 1.48).toFixed(2)),
      z: parseFloat((actorAPos.z + normZ * otsOffsetA + (actorAPos.z - actorBPos.z) * 0.25).toFixed(2)),
    },
    cameraLookAt: {
      x: parseFloat(actorBPos.x.toFixed(2)),
      y: parseFloat((actorBPos.y + 1.45).toFixed(2)),
      z: parseFloat(actorBPos.z.toFixed(2)),
    },
    lensHeightM: 1.48,
    description: `Over-the-shoulder framing looking past ${actorAName} to capture ${actorBName}'s reactions.`,
  });

  const cuDistA = 2.4;
  recommendations.push({
    shotId: 'shot-cu-a',
    name: `Close-Up ${actorAName}`,
    shotType: 'single_close_up_a',
    primaryActorId,
    suggestedFocalLengthMm: 85,
    suggestedSensorFormat: 'full_frame_35',
    cameraPosition: {
      x: parseFloat((actorAPos.x + normX * cuDistA).toFixed(2)),
      y: parseFloat((actorAPos.y + 1.5).toFixed(2)),
      z: parseFloat((actorAPos.z + normZ * cuDistA).toFixed(2)),
    },
    cameraLookAt: {
      x: parseFloat(actorAPos.x.toFixed(2)),
      y: parseFloat((actorAPos.y + 1.48).toFixed(2)),
      z: parseFloat(actorAPos.z.toFixed(2)),
    },
    lensHeightM: 1.5,
    description: `Hero Single Close-Up isolating ${actorAName} with matched focal length and depth of field.`,
  });

  const cuDistB = 2.4;
  recommendations.push({
    shotId: 'shot-cu-b',
    name: `Close-Up ${actorBName}`,
    shotType: 'single_close_up_b',
    primaryActorId: secondaryActorId,
    suggestedFocalLengthMm: 85,
    suggestedSensorFormat: 'full_frame_35',
    cameraPosition: {
      x: parseFloat((actorBPos.x + normX * cuDistB).toFixed(2)),
      y: parseFloat((actorBPos.y + 1.5).toFixed(2)),
      z: parseFloat((actorBPos.z + normZ * cuDistB).toFixed(2)),
    },
    cameraLookAt: {
      x: parseFloat(actorBPos.x.toFixed(2)),
      y: parseFloat((actorBPos.y + 1.48).toFixed(2)),
      z: parseFloat(actorBPos.z.toFixed(2)),
    },
    lensHeightM: 1.5,
    description: `Hero Single Close-Up isolating ${actorBName} with matched focal length and depth of field.`,
  });

  return recommendations;
}

// ---------------------------------------------------------------------------
// 180-Degree Line of Action & 30-Degree Jump Cut Solver
// ---------------------------------------------------------------------------

export function check180LineOfActionPair(
  actorAPos: { x: number; y: number; z: number },
  actorBPos: { x: number; y: number; z: number },
  camAPos: { x: number; y: number; z: number },
  camALookAt: { x: number; y: number; z: number },
  camBPos: { x: number; y: number; z: number },
  camBLookAt: { x: number; y: number; z: number },
  camAName: string = 'Camera A',
  camBName: string = 'Camera B',
  camAId: string = 'cam-a',
  camBId: string = 'cam-b',
): LineOfActionAnalysis {
  const lineDx = actorBPos.x - actorAPos.x;
  const lineDz = actorBPos.z - actorAPos.z;
  const lineLen = Math.hypot(lineDx, lineDz) || 0.001;

  const crossA = lineDx * (camAPos.z - actorAPos.z) - lineDz * (camAPos.x - actorAPos.x);
  const crossB = lineDx * (camBPos.z - actorAPos.z) - lineDz * (camBPos.x - actorAPos.x);

  const sideA: 'left' | 'right' | 'on_line' = Math.abs(crossA) < 0.01 ? 'on_line' : crossA > 0 ? 'right' : 'left';
  const sideB: 'left' | 'right' | 'on_line' = Math.abs(crossB) < 0.01 ? 'on_line' : crossB > 0 ? 'right' : 'left';

  const lookAVec = { x: camALookAt.x - camAPos.x, z: camALookAt.z - camAPos.z };
  const lookBVec = { x: camBLookAt.x - camBPos.x, z: camBLookAt.z - camBPos.z };

  const lenA = Math.hypot(lookAVec.x, lookAVec.z) || 1.0;
  const lenB = Math.hypot(lookBVec.x, lookBVec.z) || 1.0;

  const dot = (lookAVec.x * lookBVec.x + lookAVec.z * lookBVec.z) / (lenA * lenB);
  const clampedDot = Math.max(-1.0, Math.min(1.0, dot));
  const angleDeltaDeg = parseFloat((Math.acos(clampedDot) * (180 / Math.PI)).toFixed(1));

  let has180Violation = false;
  if (sideA !== 'on_line' && sideB !== 'on_line' && sideA !== sideB) {
    has180Violation = true;
  }

  let severity: 'safe' | 'warning_jump_cut' | 'violation_180_cross' = 'safe';
  let message = `Axis Continuity Maintained: Both ${camAName} and ${camBName} reside on the ${sideA === 'right' ? 'right' : 'left'} side of the 180-degree dialogue line.`;

  if (has180Violation) {
    severity = 'violation_180_cross';
    message = `180-Degree Line of Action Violation: ${camAName} (${sideA}) and ${camBName} (${sideB}) are on opposite sides of the dialogue axis. Eyelines will disorient viewers on cut.`;
  } else if (angleDeltaDeg < 30.0 && angleDeltaDeg > 0.5) {
    severity = 'warning_jump_cut';
    message = `30-Degree Rule Warning: Angle between ${camAName} and ${camBName} is only ${angleDeltaDeg} degrees. Cut may result in a jarring spatial jump-cut.`;
  }

  return {
    has180Violation,
    hasCrossing: has180Violation,
    lineVector: { start: actorAPos, end: actorBPos },
    cameraA: { id: camAId, name: camAName, sideOfLine: sideA },
    cameraB: { id: camBId, name: camBName, sideOfLine: sideB },
    severity,
    message,
    angleDeltaDeg,
    cameraSides: [
      { cameraId: camAId, cameraName: camAName, side: sideA === 'on_line' ? 'on-line' : sideA, signedDistance: crossA / lineLen },
      { cameraId: camBId, cameraName: camBName, side: sideB === 'on_line' ? 'on-line' : sideB, signedDistance: crossB / lineLen }
    ]
  };
}

// ---------------------------------------------------------------------------
// Eyeline Match Continuity Solver
// ---------------------------------------------------------------------------

export function checkEyelineMatch(
  actorAPos: { x: number; y: number; z: number },
  actorAYawRad: number,
  actorBPos: { x: number; y: number; z: number },
  actorBYawRad: number,
  camAPos: { x: number; y: number; z: number },
  camBPos: { x: number; y: number; z: number },
  actorAName: string = 'Actor A',
  actorBName: string = 'Actor B',
  actorAId: string = 'actor-a',
  actorBId: string = 'actor-b',
): EyelineMatchAnalysis {
  void actorAYawRad;
  void actorBYawRad;

  const camToA = { x: actorAPos.x - camAPos.x, z: actorAPos.z - camAPos.z };
  const camAHeading = Math.atan2(camToA.x, camToA.z);
  const gazeA = { x: actorBPos.x - actorAPos.x, z: actorBPos.z - actorAPos.z };
  const gazeAHeading = Math.atan2(gazeA.x, gazeA.z);
  let relA = gazeAHeading - camAHeading;
  while (relA > Math.PI) relA -= Math.PI * 2;
  while (relA < -Math.PI) relA += Math.PI * 2;
  const screenSideA: 'screen_left' | 'screen_right' = relA > 0 ? 'screen_right' : 'screen_left';

  const camToB = { x: actorBPos.x - camBPos.x, z: actorBPos.z - camBPos.z };
  const camBHeading = Math.atan2(camToB.x, camToB.z);
  const gazeB = { x: actorAPos.x - actorBPos.x, z: actorAPos.z - actorBPos.z };
  const gazeBHeading = Math.atan2(gazeB.x, gazeB.z);
  let relB = gazeBHeading - camBHeading;
  while (relB > Math.PI) relB -= Math.PI * 2;
  while (relB < -Math.PI) relB += Math.PI * 2;
  const screenSideB: 'screen_left' | 'screen_right' = relB > 0 ? 'screen_right' : 'screen_left';

  const isConsistent = screenSideA !== screenSideB;

  return {
    actorA: { id: actorAId, name: actorAName, lookingAngleDeg: 0, screenSide: screenSideA },
    actorB: { id: actorBId, name: actorBName, lookingAngleDeg: 0, screenSide: screenSideB },
    isConsistent,
    mismatchDeg: 0,
    message: isConsistent ? 'Consistent' : 'Broken'
  };
}

// ---------------------------------------------------------------------------
// Scene Cinematography Continuity Audit Solver
// ---------------------------------------------------------------------------

export function auditSceneContinuity(
  sceneCameras: MinimalCameraEntity[],
  actors: MinimalActorEntity[],
  dialoguePairAId?: string,
  dialoguePairBId?: string,
): CoverageAuditReport {
  const lineOfActionAlerts: LineOfActionAnalysis[] = [];
  const eyelineAlerts: EyelineMatchAnalysis[] = [];
  const framingSuggestions: string[] = [];

  let actorA = actors.find((a) => a.id === dialoguePairAId) || actors[0];
  let actorB = actors.find((a) => a.id === dialoguePairBId) || actors[1];

  let masterWideCount = 0;
  let mediumShotCount = 0;
  let closeUpCount = 0;

  for (const cam of sceneCameras) {
    const focal = cam.focalLength || 35;
    if (focal <= 28) masterWideCount++;
    else if (focal >= 70) closeUpCount++;
    else mediumShotCount++;
  }

  if (actorA && actorB && actorA.id !== actorB.id && sceneCameras.length >= 2) {
    for (let i = 0; i < sceneCameras.length; i++) {
      for (let j = i + 1; j < sceneCameras.length; j++) {
        const camA = sceneCameras[i];
        const camB = sceneCameras[j];

        const lookAtA = camA.lookAt || actorAPos(actorA);
        const lookAtB = camB.lookAt || actorAPos(actorB);

        const analysis = check180LineOfActionPair(
          actorA.position,
          actorB.position,
          camA.position,
          lookAtA,
          camB.position,
          lookAtB,
          camA.name,
          camB.name,
          camA.id,
          camB.id,
        );

        if (analysis.severity !== 'safe') {
          lineOfActionAlerts.push(analysis);
        }
      }
    }

    const camForA = sceneCameras.find((c) => c.targetActorId === actorA.id) || sceneCameras[0];
    const camForB = sceneCameras.find((c) => c.targetActorId === actorB.id) || sceneCameras[1] || sceneCameras[0];

    if (camForA && camForB && camForA.id !== camForB.id) {
      const eyeline = checkEyelineMatch(
        actorA.position,
        actorA.rotationY || 0,
        actorB.position,
        actorB.rotationY || 0,
        camForA.position,
        camForB.position,
        actorA.name,
        actorB.name,
        actorA.id,
        actorB.id,
      );
      if (!eyeline.isConsistent) {
        eyelineAlerts.push(eyeline);
      }
    }
  }

  const violations180 = lineOfActionAlerts.filter((a) => a.severity === 'violation_180_cross').length;
  const jumpCuts = lineOfActionAlerts.filter((a) => a.severity === 'warning_jump_cut').length;
  const eyelineViolations = eyelineAlerts.length;

  let penalty = 0;
  penalty += violations180 * 30;
  penalty += jumpCuts * 15;
  penalty += eyelineViolations * 20;

  if (masterWideCount === 0 && sceneCameras.length > 0) {
    penalty += 15;
    framingSuggestions.push('Missing master wide shot (24mm-28mm) for scene spatial geography.');
  }
  if (closeUpCount === 0 && sceneCameras.length > 0) {
    penalty += 10;
    framingSuggestions.push('Missing close-up coverage (70mm+) for emotional intensity.');
  }

  const scorePercent = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  const violationsCount = violations180 + eyelineViolations;

  let coverageBalance: 'well_balanced' | 'under_covered_closeups' | 'missing_master_wide' | 'excessive_jump_cuts' = 'well_balanced';
  if (jumpCuts > 1) {
    coverageBalance = 'excessive_jump_cuts';
  } else if (masterWideCount === 0 && sceneCameras.length > 0) {
    coverageBalance = 'missing_master_wide';
  } else if (closeUpCount === 0 && sceneCameras.length > 0) {
    coverageBalance = 'under_covered_closeups';
  }

  return {
    scorePercent,
    healthScore: scorePercent,
    violationsCount,
    masterWideCount,
    mediumShotCount,
    closeUpCount,
    totalShots: sceneCameras.length,
    coverageBalance,
    lineOfActionAlerts,
    lineOfActionChecks: lineOfActionAlerts,
    eyelineAlerts,
    framingSuggestions,
    framingRecommendations: framingSuggestions,
  };
}

function actorAPos(actor: MinimalActorEntity): { x: number; y: number; z: number } {
  return actor.position || { x: 0, y: 0, z: 0 };
}

// ---------------------------------------------------------------------------
// Standardized Shot List CSV Generator (RFC 4180 Compliant)
// ---------------------------------------------------------------------------

export function generateScreenplayShotListCsv(
  scene: ParsedScene,
  coverage: ShotCoverageRecommendation[],
): string {
  void scene;
  const escapeCsv = (val: string | number | undefined): string => {
    if (val === undefined || val === null) return '""';
    const s = String(val);
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return `"${s}"`;
  };

  const headers = [
    'Shot ID',
    'Shot Name',
    'Shot Type',
    'Focal Length (mm)',
    'Sensor Format',
    'Lens Height (m)',
    'Cam Pos X',
    'Cam Pos Y',
    'Cam Pos Z',
    'LookAt X',
    'LookAt Y',
    'LookAt Z',
    'Description',
  ];

  const rows: string[] = [headers.join(',')];

  coverage.forEach((shot) => {
    const row = [
      escapeCsv(shot.shotId),
      escapeCsv(shot.name),
      escapeCsv(shot.shotType),
      escapeCsv(shot.suggestedFocalLengthMm),
      escapeCsv(shot.suggestedSensorFormat),
      escapeCsv(shot.lensHeightM),
      escapeCsv(shot.cameraPosition.x.toFixed(2)),
      escapeCsv(shot.cameraPosition.y.toFixed(2)),
      escapeCsv(shot.cameraPosition.z.toFixed(2)),
      escapeCsv(shot.cameraLookAt.x.toFixed(2)),
      escapeCsv(shot.cameraLookAt.y.toFixed(2)),
      escapeCsv(shot.cameraLookAt.z.toFixed(2)),
      escapeCsv(shot.description),
    ];
    rows.push(row.join(','));
  });

  return rows.join('\r\n');
}

// ---------------------------------------------------------------------------
// Standalone Director Pitch Deck HTML Generator
// ---------------------------------------------------------------------------

export function generateDirectorDeckHtml(
  scene: ParsedScene,
  coverage: ShotCoverageRecommendation[],
  audit: CoverageAuditReport,
  scriptTitle: string = 'SetView Cinematography Breakdown',
): string {
  const safeTitle = scriptTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeHeading = scene.heading.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeTimeOfDay = scene.timeOfDay.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const score = audit.healthScore ?? audit.scorePercent;
  const durationStr = `${Math.floor(scene.estimatedDurationSec / 60)}m ${Math.round(scene.estimatedDurationSec % 60)}s`;
  const scoreColor = score < 60 ? '#ef4444' : score < 85 ? '#f59e0b' : '#10b981';

  const suggestions = audit.framingRecommendations || audit.framingSuggestions;
  const suggestionsHtml = suggestions.length > 0
    ? suggestions.map((s) => `<li>${s.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`).join('')
    : '<li>All line-of-action and eyeline continuity checks verified.</li>';

  const dialogueBeatsHtml = scene.dialogueBlocks.length > 0
    ? scene.dialogueBlocks
        .map(
          (d) => `
      <div class="dialogue-card">
        <div class="dialogue-header">
          <span class="char-name">${d.character}</span>
          ${d.parenthetical ? `<span class="parenthetical">(${d.parenthetical})</span>` : ''}
          <span class="beat-duration">${d.estimatedDurationSec.toFixed(1)}s</span>
        </div>
        <div class="dialogue-body">${d.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      </div>
    `,
        )
        .join('')
    : '<p class="muted">No dialogue in this scene.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} - Director Cinematography Deck</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #131b2e;
      --border: #1e293b;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --amber: #fbbf24;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 32px 24px;
      line-height: 1.5;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
    }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 16px;
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      color: #fff;
      letter-spacing: -0.5px;
    }
    .meta-badges {
      display: flex;
      gap: 10px;
      margin-top: 10px;
      flex-wrap: wrap;
    }
    .badge {
      background: #1e293b;
      color: #38bdf8;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 24px;
      margin-bottom: 32px;
    }
    @media (max-width: 800px) {
      .grid { grid-template-columns: 1fr; }
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
    }
    h2 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
      color: #e2e8f0;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      color: var(--muted);
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      vertical-align: top;
    }
    .score-circle {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: 700;
      background: rgba(16, 185, 129, 0.15);
      color: ${scoreColor};
      border: 2px solid ${scoreColor};
      margin-bottom: 16px;
    }
    ul.suggestions {
      list-style-type: none;
      font-size: 13px;
      color: #94a3b8;
    }
    ul.suggestions li {
      margin-bottom: 8px;
      position: relative;
      padding-left: 16px;
    }
    ul.suggestions li::before {
      content: "•";
      color: var(--amber);
      position: absolute;
      left: 0;
      font-size: 18px;
      line-height: 1;
    }
    .dialogue-card {
      background: #0f172a;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 12px;
    }
    .dialogue-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }
    .char-name {
      font-weight: 700;
      font-size: 14px;
      color: #38bdf8;
    }
    .parenthetical {
      font-style: italic;
      color: #94a3b8;
      font-size: 12px;
    }
    .beat-duration {
      margin-left: auto;
      font-size: 11px;
      font-family: monospace;
      color: #64748b;
    }
    .dialogue-body {
      font-size: 14px;
      color: #e2e8f0;
      line-height: 1.4;
    }
    .footer {
      text-align: center;
      font-size: 12px;
      color: #475569;
      margin-top: 40px;
      border-top: 1px solid var(--border);
      padding-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="title-row">
        <div>
          <h1>${safeTitle}</h1>
          <div class="meta-badges">
            <span class="badge">Scene #${scene.sceneNumber}</span>
            <span class="badge">${safeHeading}</span>
            <span class="badge">${safeTimeOfDay}</span>
            <span class="badge">Est. Runtime: ${durationStr}</span>
          </div>
        </div>
      </div>
    </header>

    <div class="grid">
      <div class="card">
        <h2>AI Cinematography Shot Coverage</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Shot Name</th>
              <th>Type</th>
              <th>Focal</th>
            </tr>
          </thead>
          <tbody>
            ${coverage.map((s, i) => `<tr><td>${i+1}</td><td>${s.name}</td><td>${s.shotType}</td><td>${s.suggestedFocalLengthMm}mm</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="card">
        <h2>Continuity Health Score</h2>
        <div class="score-circle">${score}%</div>
        <ul class="suggestions">${suggestionsHtml}</ul>
      </div>
    </div>

    <div class="card">
      <h2>Dialogue</h2>
      ${dialogueBeatsHtml}
    </div>

    <div class="footer">
      Generated by SetView Cinematography Suite
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Schema Helpers: Factory, Validator, Normalizer
// ---------------------------------------------------------------------------

export function createScreenplayConfig(
  presetScript: string = DEFAULT_SAMPLE_FOUNTAIN_SCRIPT,
  overrides?: Partial<ScreenplayConfig>,
): ScreenplayConfig {
  const parsed = parseFountainScript(presetScript);
  return {
    enabled: overrides?.enabled ?? true,
    scriptText: overrides?.scriptText ?? presetScript,
    format: overrides?.format ?? 'fountain',
    activeSceneIndex: overrides?.activeSceneIndex ?? 0,
    parsedScript: overrides?.parsedScript ?? parsed,
    autoSyncCameraCoverage: overrides?.autoSyncCameraCoverage ?? false,
    autoEnforce180Line: overrides?.autoEnforce180Line ?? true,
    dialoguePartnerAId: overrides?.dialoguePartnerAId,
    dialoguePartnerBId: overrides?.dialoguePartnerBId,
  };
}

export function isScreenplayConfig(obj: unknown): obj is ScreenplayConfig {
  if (!obj || typeof obj !== 'object') return false;
  const c = obj as Partial<ScreenplayConfig>;
  return (
    typeof c.enabled === 'boolean' &&
    typeof c.scriptText === 'string' &&
    (c.format === undefined || c.format === 'fountain' || c.format === 'final_draft_fdx' || c.format === 'plain_text') &&
    typeof c.activeSceneIndex === 'number' &&
    (c.parsedScript === undefined || (typeof c.parsedScript === 'object' && c.parsedScript !== null && Array.isArray(c.parsedScript.scenes))) &&
    typeof c.autoSyncCameraCoverage === 'boolean' &&
    typeof c.autoEnforce180Line === 'boolean'
  );
}

export function normalizeScreenplayConfig(raw: unknown): ScreenplayConfig {
  if (!raw || typeof raw !== 'object') {
    return createScreenplayConfig();
  }

  const r = raw as Partial<ScreenplayConfig>;
  const scriptText = typeof r.scriptText === 'string' && r.scriptText.trim().length > 0
    ? r.scriptText
    : DEFAULT_SAMPLE_FOUNTAIN_SCRIPT;

  let activeIdx = typeof r.activeSceneIndex === 'number' && !isNaN(r.activeSceneIndex)
    ? Math.max(0, Math.floor(r.activeSceneIndex))
    : 0;

  const parsed = r.parsedScript && Array.isArray(r.parsedScript.scenes) && r.parsedScript.scenes.length > 0
    ? r.parsedScript
    : parseFountainScript(scriptText);

  if (activeIdx >= parsed.scenes.length) {
    activeIdx = Math.max(0, parsed.scenes.length - 1);
  }

  const format: ScriptFormat =
    r.format === 'final_draft_fdx' || r.format === 'plain_text' || r.format === 'fountain'
      ? r.format
      : 'fountain';

  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : true,
    scriptText,
    format,
    activeSceneIndex: activeIdx,
    parsedScript: parsed,
    autoSyncCameraCoverage: typeof r.autoSyncCameraCoverage === 'boolean' ? r.autoSyncCameraCoverage : false,
    autoEnforce180Line: typeof r.autoEnforce180Line === 'boolean' ? r.autoEnforce180Line : true,
    dialoguePartnerAId: typeof r.dialoguePartnerAId === 'string' ? r.dialoguePartnerAId : undefined,
    dialoguePartnerBId: typeof r.dialoguePartnerBId === 'string' ? r.dialoguePartnerBId : undefined,
  };
}
