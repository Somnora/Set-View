// ---------------------------------------------------------------------------
// Pure helpers for the XR capability probe (test/xr-probe.html, roadmap P0.0).
// No DOM, no three, no WebXR globals: everything here runs in plain Node so
// test/domain.test.ts covers it. Test-only: nothing in src/ imports this file,
// and it imports nothing from src/.
//
// The report shape defined here is the on-disk format of the JSON files in
// test/device-reports/ (documented in test/device-reports/README.md). Bump
// PROBE_VERSION if a field changes meaning.
// ---------------------------------------------------------------------------

export const PROBE_ID = 'setview-xr-probe';
export const PROBE_VERSION = 1;
export const PROBE_STORAGE_KEY = 'setview.xrProbe.report.v1';

export const MAX_FILES = 100;
export const MAX_SESSIONS = 20;
export const MAX_LOG = 400;
export const MAX_EVENTS = 300;
/** Per-second ticks kept per session (15 minutes at 1 Hz). */
export const MAX_TICKS = 900;
/** Geometry samples kept per session (one is stored only when the geometry changes). */
export const MAX_GEOMETRY = 300;
export const MAX_PER_ITEM = 64;
/** pushCapped keeps this many of the oldest entries so first observations survive. */
export const KEEP_HEAD = 30;
export const MAX_TYPED = 64;

export type Vec3T = [number, number, number];

export interface FileProbe {
  name: string;
  type: string;
  size: number;
  lastModified: number;
  /** null when File.arrayBuffer() failed. */
  byteLength: number | null;
  /** First 8 bytes as hex, e.g. "67 6c 54 46 02 00 00 00". */
  head: string | null;
  /** First 8 bytes as printable ASCII, '.' for anything else. */
  ascii: string | null;
  ms: number | null;
  /** "ErrorName: message" when the read failed. */
  error: string | null;
}

export interface PlaneSummary {
  count: number;
  labels: Record<string, number>;
  orientations: Record<string, number>;
  /** [raw semanticLabel, orientation, polygon point count], sorted, capped at MAX_PER_ITEM. */
  perPlane: Array<[string, string, number]>;
}

export interface MeshSummary {
  count: number;
  labels: Record<string, number>;
  /** Sum of vertices.length / 3 over every mesh. */
  totalVertices: number;
  /** Sum of indices.length over every mesh. */
  totalIndices: number;
  /** [raw semanticLabel, vertex count, index count], largest first, capped at MAX_PER_ITEM. */
  perMesh: Array<[string, number, number]>;
}

export interface GeometrySample {
  /** Milliseconds since the session started. */
  t: number;
  planes: PlaneSummary | null;
  meshes: MeshSummary | null;
}

export interface Tick {
  t: number;
  /** Frames rendered during the last second. */
  fps: number;
  /** Longest gap between two XR frames during the last second, in ms. */
  gapMaxMs: number;
  planes: number | null;
  meshes: number | null;
  /** Latest viewer (gaze) hit-test point in the session reference space, or null. */
  hit: Vec3T | null;
  head: Vec3T | null;
  /** 1 tracked, 0 not tracked, null no sentinel anchor. */
  anchor: 0 | 1 | null;
  vis: string;
}

export interface ProbeEvent {
  t: number;
  type: string;
  detail: string;
}

export interface AnchorState {
  tracked: boolean | null;
  pos: Vec3T | null;
}

export interface RoomCaptureRecord {
  calledAt: number;
  /** 'pending' | 'resolved' | 'missing' | a DOMException name | 'other:<name>'. */
  outcome: string;
  message: string | null;
  settledAt: number | null;
  anchorBefore: AnchorState | null;
  anchorAfter: AnchorState | null;
  /** About three seconds after the call settled. */
  anchorLater: AnchorState | null;
  anchorMovedM: number | null;
  maxFrameGapMs: number;
  resetsDuring: number;
  visibilityDuring: string[];
  planesBefore: number | null;
  planesAfter: number | null;
  meshesBefore: number | null;
  meshesAfter: number | null;
}

export interface KeyboardRecord {
  at: number;
  focusError: string | null;
  /** document.activeElement was the hidden input right after focus(). */
  activeIsInput: boolean;
  /** Session visibility states seen after focus(). */
  visibility: string[];
  inputEvents: number;
  typed: string;
  endedBy: string | null;
}

export interface SessionRecord {
  startedAt: string;
  endedAt: string | null;
  init: { requiredFeatures: string[]; optionalFeatures: string[] };
  requestError: string | null;
  /** null when the browser does not expose session.enabledFeatures. */
  enabledFeatures: string[] | null;
  /** 'attribute-missing', 'null', or the overlay type ('screen', 'floating', 'head-locked'). */
  domOverlayState: string;
  referenceSpace: string | null;
  environmentBlendMode: string | null;
  interactionMode: string | null;
  frameRate: number | null;
  supportedFrameRates: number[] | null;
  /** Read-only look at session.persistentAnchors; the probe never creates one. */
  persistentAnchors: { count: number; blank: number } | null;
  inputSources: string[];
  hitTest: { source: string; framesTested: number; framesWithHit: number; firstHitAt: number | null };
  planesError: string | null;
  meshesError: string | null;
  anchor: { created: boolean; error: string | null; createdAt: number | null };
  geometry: GeometrySample[];
  ticks: Tick[];
  events: ProbeEvent[];
  keyboard: KeyboardRecord | null;
  roomCapture: RoomCaptureRecord | null;
}

export interface ProbeEnv {
  xr: boolean;
  immersiveAR: boolean | null;
  immersiveVR: boolean | null;
  storage: { usage: number | null; quota: number | null } | null;
  storageError: string | null;
  persisted: boolean | null;
  /** Result of navigator.storage.persist(): true, false, null (not asked) or an error string. */
  persistRequest: boolean | string | null;
  /** typeof XRAnchor.prototype.requestPersistentHandle, or 'no XRAnchor'. */
  requestPersistentHandle: string;
  restorePersistentAnchor: string;
  initiateRoomCapture: string;
  detectedPlanes: boolean;
  detectedMeshes: boolean;
  webkitSpeechRecognition: boolean;
  speechRecognition: boolean;
}

export interface ProbeReport {
  probe: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  device: string;
  page: {
    url: string;
    userAgent: string;
    secureContext: boolean | null;
    hardwareConcurrency: number | null;
    deviceMemory: number | null;
    screen: string;
  };
  env: ProbeEnv;
  files: FileProbe[];
  sessions: SessionRecord[];
  /** Owner answers to OBSERVATIONS, keyed by id: 'yes' | 'no' | 'unsure' | ''. */
  observations: Record<string, string>;
  notes: string;
  /** [epoch ms, message]. */
  log: Array<[number, string]>;
}

/** Things only the person wearing the headset can see. Recorded by hand on the 2D page. */
export const OBSERVATIONS: ReadonlyArray<{ id: string; question: string }> = [
  { id: 'permissionPrompt', question: 'Did an extra permission prompt (spatial data, room scan) appear on Enter AR?' },
  { id: 'keyboardShown', question: 'Did the system keyboard appear after Keyboard test?' },
  { id: 'spaceSetupLaunched', question: 'Did Run room capture launch Space Setup or another OS flow?' },
  { id: 'sessionSurvived', question: 'Was the AR session still running after room capture?' },
];

export const OBSERVATION_ANSWERS: ReadonlyArray<string> = ['', 'yes', 'no', 'unsure'];

// --- small utilities ---------------------------------------------------------

/**
 * Appends `item`, dropping entries just after the first `keepHead` once the
 * list is full, so both the earliest observations and the newest survive.
 */
export function pushCapped<T>(list: T[], item: T, max: number, keepHead = KEEP_HEAD): void {
  if (max <= 0) return;
  const head = Math.max(0, Math.min(keepHead, max - 1));
  while (list.length >= max) list.splice(head, 1);
  list.push(item);
}

export function hexHead(bytes: ArrayLike<number>, n = 8): string {
  const out: string[] = [];
  const len = Math.min(n, bytes.length);
  for (let i = 0; i < len; i++) out.push((bytes[i] & 0xff).toString(16).padStart(2, '0'));
  return out.join(' ');
}

export function asciiHead(bytes: ArrayLike<number>, n = 8): string {
  let s = '';
  const len = Math.min(n, bytes.length);
  for (let i = 0; i < len; i++) {
    const b = bytes[i] & 0xff;
    s += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.';
  }
  return s;
}

/** Raw label as reported, with null/undefined/empty made visible instead of dropped. */
export function labelKey(label: unknown): string {
  if (label === undefined || label === null) return '(none)';
  if (typeof label !== 'string') return `(${typeof label})`;
  if (label === '') return '(empty)';
  return label;
}

export function errorName(e: unknown): string {
  if (e && typeof e === 'object' && 'name' in e) {
    const n = (e as { name: unknown }).name;
    if (typeof n === 'string' && n) return n;
  }
  return 'Error';
}

export function errorText(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message: unknown }).message;
    return `${errorName(e)}: ${typeof m === 'string' ? m : String(m)}`;
  }
  return `${errorName(e)}: ${String(e)}`;
}

const ROOM_CAPTURE_ERRORS = ['NotSupportedError', 'InvalidStateError', 'OperationError', 'SecurityError', 'NotAllowedError', 'AbortError'];

/** Outcome label for a rejected initiateRoomCapture() promise. */
export function classifyRejection(e: unknown): string {
  const n = errorName(e);
  return ROOM_CAPTURE_ERRORS.includes(n) ? n : `other:${n}`;
}

export function distance3(a: Vec3T | null, b: Vec3T | null): number | null {
  if (!a || !b) return null;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function fmtBytes(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return 'unknown';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** "wall x4, floor x1": highest count first, then alphabetical. */
export function formatCounts(counts: Record<string, number>): string {
  const keys = Object.keys(counts);
  if (!keys.length) return 'none';
  keys.sort((a, b) => counts[b] - counts[a] || (a < b ? -1 : a > b ? 1 : 0));
  return keys.map((k) => `${k} x${counts[k]}`).join(', ');
}

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

// --- geometry summaries -------------------------------------------------------

export interface PlaneLike {
  orientation?: unknown;
  semanticLabel?: unknown;
  polygon?: { length: number } | null;
}

export interface MeshLike {
  semanticLabel?: unknown;
  vertices?: { length: number } | null;
  indices?: { length: number } | null;
}

export function summarizePlanes(planes: Iterable<PlaneLike>): PlaneSummary {
  const s: PlaneSummary = { count: 0, labels: {}, orientations: {}, perPlane: [] };
  const all: Array<[string, string, number]> = [];
  for (const p of planes) {
    s.count++;
    const label = labelKey(p.semanticLabel);
    const orient = labelKey(p.orientation);
    bump(s.labels, label);
    bump(s.orientations, orient);
    all.push([label, orient, p.polygon ? p.polygon.length : -1]);
  }
  all.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : b[2] - a[2]));
  s.perPlane = all.slice(0, MAX_PER_ITEM);
  return s;
}

export function summarizeMeshes(meshes: Iterable<MeshLike>): MeshSummary {
  const s: MeshSummary = { count: 0, labels: {}, totalVertices: 0, totalIndices: 0, perMesh: [] };
  const all: Array<[string, number, number]> = [];
  for (const m of meshes) {
    s.count++;
    const label = labelKey(m.semanticLabel);
    const v = m.vertices ? Math.floor(m.vertices.length / 3) : 0;
    const i = m.indices ? m.indices.length : 0;
    bump(s.labels, label);
    s.totalVertices += v;
    s.totalIndices += i;
    all.push([label, v, i]);
  }
  all.sort((a, b) => b[1] - a[1] || b[2] - a[2] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  s.perMesh = all.slice(0, MAX_PER_ITEM);
  return s;
}

/** Changes whenever the detected geometry changes; ticks with the same signature are not re-stored. */
export function geometrySignature(planes: PlaneSummary | null, meshes: MeshSummary | null): string {
  return JSON.stringify([
    planes ? planes.count : null,
    planes ? planes.perPlane : null,
    meshes ? meshes.count : null,
    meshes ? meshes.perMesh : null,
  ]);
}

// --- user agent and file naming ----------------------------------------------

export interface UaInfo {
  browser: 'quest-browser' | 'samsung-internet' | 'chrome' | 'other';
  version: string | null;
  major: number | null;
  android: boolean;
  /** 'Quest 3', 'Quest 3S', 'Quest Pro', 'Quest 2' or 'Quest' when the UA says so. */
  model: string | null;
}

export function parseUserAgent(ua: string): UaInfo {
  const android = /\bAndroid\b/.test(ua);
  const modelMatch = /\bQuest(?: Pro| \d+S?)?\b/.exec(ua);
  const model = modelMatch ? modelMatch[0] : null;
  const pick = (re: RegExp): { version: string; major: number } | null => {
    const m = re.exec(ua);
    return m ? { version: m[1], major: parseInt(m[1], 10) } : null;
  };
  const tag = (browser: UaInfo['browser'], hit: { version: string; major: number } | null): UaInfo => ({
    browser,
    version: hit ? hit.version : null,
    major: hit && Number.isFinite(hit.major) ? hit.major : null,
    android,
    model,
  });
  // Quest Browser also carries SamsungBrowser/ and Chrome/ tokens, so test it first.
  const oculus = pick(/OculusBrowser\/([\d.]+)/);
  if (oculus) return tag('quest-browser', oculus);
  const samsung = pick(/SamsungBrowser\/([\d.]+)/);
  if (samsung) return tag('samsung-internet', samsung);
  const chrome = pick(/(?:Chrome|CriOS)\/([\d.]+)/);
  if (chrome) return tag('chrome', chrome);
  return tag('other', null);
}

export function slugify(label: string): string {
  const s = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return s || 'device';
}

/** Default device label, e.g. 'quest-3-browser-154' or 'android-chrome-147'. Editable on the page. */
export function suggestDeviceSlug(ua: string): string {
  const info = parseUserAgent(ua);
  const major = info.major === null ? 'x' : String(info.major);
  switch (info.browser) {
    case 'quest-browser':
      return slugify(`${info.model ?? 'quest'} browser ${major}`);
    case 'samsung-internet':
      return slugify(`${info.android ? 'android ' : ''}samsung internet ${major}`);
    case 'chrome':
      return slugify(`${info.android ? 'android ' : ''}chrome ${major}`);
    default:
      return 'unknown-browser';
  }
}

/** test/device-reports file name: 'YYYY-MM-DD-<device>.json', local date. */
export function reportFileName(device: string, date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}-${slugify(device)}.json`;
}

// --- report construction and restore -------------------------------------------

export function createEnv(): ProbeEnv {
  return {
    xr: false,
    immersiveAR: null,
    immersiveVR: null,
    storage: null,
    storageError: null,
    persisted: null,
    persistRequest: null,
    requestPersistentHandle: 'unknown',
    restorePersistentAnchor: 'unknown',
    initiateRoomCapture: 'unknown',
    detectedPlanes: false,
    detectedMeshes: false,
    webkitSpeechRecognition: false,
    speechRecognition: false,
  };
}

export function createReport(nowIso: string, userAgent: string, url: string): ProbeReport {
  const observations: Record<string, string> = {};
  for (const o of OBSERVATIONS) observations[o.id] = '';
  return {
    probe: PROBE_ID,
    version: PROBE_VERSION,
    createdAt: nowIso,
    updatedAt: nowIso,
    device: suggestDeviceSlug(userAgent),
    page: { url, userAgent, secureContext: null, hardwareConcurrency: null, deviceMemory: null, screen: '' },
    env: createEnv(),
    files: [],
    sessions: [],
    observations,
    notes: '',
    log: [],
  };
}

export function createSessionRecord(
  nowIso: string,
  init: { requiredFeatures: string[]; optionalFeatures: string[] },
): SessionRecord {
  return {
    startedAt: nowIso,
    endedAt: null,
    init: { requiredFeatures: init.requiredFeatures.slice(), optionalFeatures: init.optionalFeatures.slice() },
    requestError: null,
    enabledFeatures: null,
    domOverlayState: 'attribute-missing',
    referenceSpace: null,
    environmentBlendMode: null,
    interactionMode: null,
    frameRate: null,
    supportedFrameRates: null,
    persistentAnchors: null,
    inputSources: [],
    hitTest: { source: 'not requested', framesTested: 0, framesWithHit: 0, firstHitAt: null },
    planesError: null,
    meshesError: null,
    anchor: { created: false, error: null, createdAt: null },
    geometry: [],
    ticks: [],
    events: [],
    keyboard: null,
    roomCapture: null,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Restores a report saved by this probe version, or null for anything else
 * (missing, corrupt, another probe, another version). Missing optional fields
 * are filled in rather than rejected.
 */
export function parseStoredReport(text: string | null): ProbeReport | null {
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(raw) || raw.probe !== PROBE_ID || raw.version !== PROBE_VERSION) return null;
  if (!Array.isArray(raw.files) || !Array.isArray(raw.sessions) || !Array.isArray(raw.log)) return null;
  if (!isObj(raw.page) || !isObj(raw.env)) return null;
  const base = createReport(String(raw.createdAt ?? ''), String(raw.page.userAgent ?? ''), String(raw.page.url ?? ''));
  const observations = { ...base.observations };
  if (isObj(raw.observations)) {
    for (const [k, v] of Object.entries(raw.observations)) if (typeof v === 'string') observations[k] = v;
  }
  return {
    ...base,
    ...(raw as Partial<ProbeReport>),
    env: { ...base.env, ...(raw.env as Partial<ProbeEnv>) },
    page: { ...base.page, ...(raw.page as Partial<ProbeReport['page']>) },
    observations,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    device: typeof raw.device === 'string' && raw.device ? raw.device : base.device,
  };
}

/** The session the summary describes: the latest one that actually started. */
export function latestSession(report: ProbeReport): SessionRecord | null {
  for (let i = report.sessions.length - 1; i >= 0; i--) {
    if (!report.sessions[i].requestError) return report.sessions[i];
  }
  return report.sessions.length ? report.sessions[report.sessions.length - 1] : null;
}

// --- summaries ------------------------------------------------------------------

export interface SummaryRow {
  id: string;
  /** Roadmap spike this row answers (S1..S11), or '' when it is context. */
  spike: string;
  question: string;
  answer: string;
}

function yn(v: boolean | null | undefined): string {
  return v === true ? 'yes' : v === false ? 'no' : 'unknown';
}

function secs(ms: number | null): string {
  return ms === null ? 'n/a' : `${(ms / 1000).toFixed(1)} s`;
}

function maxLabelCounts(samples: GeometrySample[], kind: 'planes' | 'meshes'): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of samples) {
    const s = kind === 'planes' ? g.planes : g.meshes;
    if (!s) continue;
    for (const [k, n] of Object.entries(s.labels)) out[k] = Math.max(out[k] ?? 0, n);
  }
  return out;
}

/** Largest [vertices, indices] seen for meshes labelled exactly 'global mesh', or null. */
export function largestGlobalMesh(samples: GeometrySample[]): [number, number] | null {
  let best: [number, number] | null = null;
  for (const g of samples) {
    if (!g.meshes) continue;
    for (const [label, v, i] of g.meshes.perMesh) {
      if (label !== 'global mesh') continue;
      if (!best || v > best[0]) best = [v, i];
    }
  }
  return best;
}

function anchorWord(a: AnchorState | null): string {
  if (!a) return 'n/a';
  return a.tracked === null ? 'no anchor' : a.tracked ? 'tracked' : 'NOT tracked';
}

function observed(report: ProbeReport, id: string): string {
  const v = report.observations[id];
  return v ? v : 'not recorded';
}

export function describeRoomCapture(rc: RoomCaptureRecord | null): string {
  if (!rc) return 'not run';
  const parts = [`${rc.outcome}${rc.message ? ` (${rc.message})` : ''}`];
  if (rc.settledAt !== null) parts.push(`settled after ${secs(rc.settledAt - rc.calledAt)}`);
  parts.push(
    `anchor before ${anchorWord(rc.anchorBefore)}, after ${anchorWord(rc.anchorAfter)}, 3 s later ${anchorWord(rc.anchorLater)}`,
  );
  if (rc.anchorMovedM !== null) parts.push(`anchor moved ${rc.anchorMovedM.toFixed(3)} m`);
  parts.push(`max frame gap ${Math.round(rc.maxFrameGapMs)} ms`);
  parts.push(`resets ${rc.resetsDuring}`);
  if (rc.visibilityDuring.length) parts.push(`visibility ${rc.visibilityDuring.join(' > ')}`);
  parts.push(`planes ${rc.planesBefore ?? 'n/a'} > ${rc.planesAfter ?? 'n/a'}, meshes ${rc.meshesBefore ?? 'n/a'} > ${rc.meshesAfter ?? 'n/a'}`);
  return parts.join('; ');
}

export function describeKeyboard(kr: KeyboardRecord | null): string {
  if (!kr) return 'not run';
  if (kr.focusError) return `focus() threw ${kr.focusError}`;
  return (
    `focus ${kr.activeIsInput ? 'took' : 'did NOT take'}; typed ${kr.typed.length} chars in ${kr.inputEvents} input events; ` +
    `visibility ${kr.visibility.length ? kr.visibility.join(' > ') : 'unchanged'}; ended by ${kr.endedBy ?? 'n/a'}`
  );
}

/** One row per load-bearing question, answered from the report. */
export function summarizeReport(report: ProbeReport): SummaryRow[] {
  const rows: SummaryRow[] = [];
  const add = (id: string, spike: string, question: string, answer: string) => rows.push({ id, spike, question, answer });
  const ua = parseUserAgent(report.page.userAgent);
  const env = report.env;
  add('browser', '', 'Browser', `${ua.browser} ${ua.version ?? '?'}${ua.model ? ` on ${ua.model}` : ''}${ua.android ? ' (Android)' : ''}`);
  add('immersive-ar', '', "isSessionSupported('immersive-ar')", yn(env.immersiveAR));

  const ok = report.files.filter((f) => !f.error).length;
  const failed = report.files.filter((f) => f.error);
  add(
    'files',
    'S4',
    'File picker reads via File.arrayBuffer()',
    report.files.length
      ? `${ok}/${report.files.length} read OK` +
          (failed.length ? `; failed: ${failed.slice(0, 5).map((f) => `${f.name} (${f.error})`).join(', ')}` : '') +
          `; byteLength matched size for ${report.files.filter((f) => f.byteLength !== null && f.byteLength === f.size).length}`
      : 'no files picked',
  );
  add(
    'storage',
    'S7',
    'navigator.storage estimate / persisted / persist()',
    env.storageError
      ? env.storageError
      : `quota ${fmtBytes(env.storage?.quota ?? null)}, usage ${fmtBytes(env.storage?.usage ?? null)}, persisted ${yn(env.persisted)}, persist() ${
          env.persistRequest === null ? 'not asked' : String(env.persistRequest)
        }`,
  );
  add('persistent-anchors', 'S11', 'typeof XRAnchor.prototype.requestPersistentHandle', env.requestPersistentHandle);
  add('speech', '', "'webkitSpeechRecognition' in window", yn(env.webkitSpeechRecognition));

  const s = latestSession(report);
  if (!s) {
    add('session', '', 'AR session', 'no AR session yet');
    return rows;
  }
  if (s.requestError) {
    add('session', '', 'AR session', `requestSession failed: ${s.requestError}`);
    return rows;
  }
  const enabled = s.enabledFeatures;
  const has = (f: string) => (enabled ? yn(enabled.includes(f)) : 'unknown (enabledFeatures not exposed)');
  add('features', 'S1/S2', 'session.enabledFeatures', enabled ? enabled.join(', ') || '(empty)' : 'not exposed');
  add('plane-detection', 'S1/S2', 'plane-detection granted', has('plane-detection'));
  add('mesh-detection', 'S1', 'mesh-detection granted', has('mesh-detection'));
  add('permission-prompt', 'S1', 'Extra permission prompt on Enter AR (observed)', observed(report, 'permissionPrompt'));
  add('dom-overlay', 'S3', 'session.domOverlayState', s.domOverlayState);
  add('ref-space', '', 'Reference space', s.referenceSpace ?? 'n/a');
  add(
    'plane-labels',
    'S1/S2',
    'Plane semanticLabel strings (max count seen)',
    s.planesError ? s.planesError : formatCounts(maxLabelCounts(s.geometry, 'planes')),
  );
  add(
    'mesh-labels',
    'S1',
    'Mesh semanticLabel strings (max count seen)',
    s.meshesError ? s.meshesError : formatCounts(maxLabelCounts(s.geometry, 'meshes')),
  );
  const gm = largestGlobalMesh(s.geometry);
  add('global-mesh', 'S1', "'global mesh' size", gm ? `${gm[0]} vertices, ${gm[1]} indices (${Math.floor(gm[1] / 3)} triangles)` : 'not seen');
  const h = s.hitTest;
  add(
    'hit-test',
    'S2/S5',
    'Viewer hit-test results',
    h.source !== 'ok'
      ? `source ${h.source}`
      : `${h.framesWithHit}/${h.framesTested} frames had a hit; first hit after ${secs(h.firstHitAt)}`,
  );
  add('keyboard', 'S3', 'Focus a hidden <input> in AR', describeKeyboard(s.keyboard));
  add('keyboard-seen', 'S3', 'System keyboard appeared (observed)', observed(report, 'keyboardShown'));
  add('room-capture', 'S6', 'initiateRoomCapture()', describeRoomCapture(s.roomCapture));
  add('space-setup', 'S6', 'Space Setup launched (observed)', observed(report, 'spaceSetupLaunched'));
  add('session-survived', 'S6', 'Session survived room capture (observed)', observed(report, 'sessionSurvived'));
  const vis: string[] = [];
  let resets = 0;
  for (const e of s.events) {
    if (e.type === 'visibility' && !vis.includes(e.detail)) vis.push(e.detail);
    if (e.type === 'reset') resets++;
  }
  add('visibility', 'S3', 'Session visibility states seen', vis.length ? vis.join(', ') : 'visible only');
  add('resets', '', "Reference space 'reset' events", String(resets));
  add('inputs', '', 'Input sources', s.inputSources.length ? s.inputSources.join(' | ') : 'none recorded');
  return rows;
}

// --- AR panel layout -------------------------------------------------------------

export const PANEL_W = 1024;
export const PANEL_H = 640;

export interface PanelButton {
  id: 'keyboard' | 'room' | 'recenter' | 'exit';
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PANEL_BUTTONS: ReadonlyArray<PanelButton> = [
  { id: 'keyboard', label: 'Keyboard test', x: 16, y: 544, w: 236, h: 80 },
  { id: 'room', label: 'Run room capture', x: 268, y: 544, w: 236, h: 80 },
  { id: 'recenter', label: 'Recenter panel', x: 520, y: 544, w: 236, h: 80 },
  { id: 'exit', label: 'Exit AR', x: 772, y: 544, w: 236, h: 80 },
];

/** Panel canvas pixel (origin top-left) to the button under it, or null. */
export function buttonAt(buttons: ReadonlyArray<PanelButton>, x: number, y: number): PanelButton | null {
  for (const b of buttons) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  return null;
}

/** Three.js plane UV (origin bottom-left) to panel canvas pixels (origin top-left). */
export function uvToPanelPx(u: number, v: number): [number, number] {
  return [u * PANEL_W, (1 - v) * PANEL_H];
}

/** Text lines for the in-AR status panel. `t` is ms since the session started. */
export function panelLines(s: SessionRecord, t: number): string[] {
  const last = s.ticks.length ? s.ticks[s.ticks.length - 1] : null;
  const g = s.geometry.length ? s.geometry[s.geometry.length - 1] : null;
  const lines: string[] = [];
  lines.push(`t ${(t / 1000).toFixed(0)} s   fps ${last ? last.fps : '-'}   ref ${s.referenceSpace ?? '-'}   vis ${last ? last.vis : '-'}`);
  lines.push(`enabledFeatures: ${s.enabledFeatures ? s.enabledFeatures.join(', ') || '(empty)' : 'not exposed'}`);
  lines.push(`domOverlayState: ${s.domOverlayState}   blend: ${s.environmentBlendMode ?? '-'}   rate: ${s.frameRate ?? '-'}`);
  if (s.planesError) lines.push(`planes: ${s.planesError}`);
  else lines.push(`planes: ${g && g.planes ? `${g.planes.count}  ${formatCounts(g.planes.labels)}` : 'none yet'}`);
  if (s.meshesError) lines.push(`meshes: ${s.meshesError}`);
  else
    lines.push(
      `meshes: ${g && g.meshes ? `${g.meshes.count}  ${formatCounts(g.meshes.labels)}  v ${g.meshes.totalVertices} i ${g.meshes.totalIndices}` : 'none yet'}`,
    );
  const gm = largestGlobalMesh(s.geometry);
  lines.push(`global mesh: ${gm ? `${gm[0]} vertices, ${gm[1]} indices` : 'not seen'}`);
  const h = s.hitTest;
  lines.push(
    `viewer hit-test: ${h.source !== 'ok' ? h.source : `${h.framesWithHit}/${h.framesTested} frames, last ${last && last.hit ? last.hit.join(', ') : 'none'}`}`,
  );
  lines.push(
    `sentinel anchor: ${s.anchor.created ? (last && last.anchor === 1 ? 'tracked' : 'not tracked') : s.anchor.error ?? 'not created yet'}`,
  );
  lines.push(`keyboard: ${describeKeyboard(s.keyboard)}`);
  lines.push(`room capture: ${describeRoomCapture(s.roomCapture)}`);
  lines.push(`inputs: ${s.inputSources.length ? s.inputSources.join(' | ') : 'none'}`);
  const recent = s.events.slice(-3).map((e) => `${(e.t / 1000).toFixed(1)}s ${e.type} ${e.detail}`);
  for (const r of recent) lines.push(`event: ${r}`);
  return lines;
}
