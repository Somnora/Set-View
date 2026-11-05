// ---------------------------------------------------------------------------
// SetView XR capability probe (roadmap P0.0): page logic for test/xr-probe.html.
//
// Test-only. Nothing in src/ imports this file and it imports nothing from
// src/. The AR session setup deliberately copies SessionManager.start
// (src/session.ts): hit-test required; anchors, hand-tracking, dom-overlay,
// local-floor, mesh-detection and plane-detection optional; local-floor with a
// local fallback. That way the probe sees what the app would see.
//
// 2D part: file reads via File.arrayBuffer(), storage estimate/persist, API
// presence. AR part: granted features, detected planes and meshes (raw
// labels), viewer hit-test, visibility changes, a hidden-input keyboard test
// and a deliberate, two-press room-capture test. Everything lands in one JSON
// report (localStorage on every change, Download JSON after exit). Pure
// helpers and the report format live in test/xr-probe-core.ts.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import {
  MAX_EVENTS,
  MAX_FILES,
  MAX_GEOMETRY,
  MAX_LOG,
  MAX_SESSIONS,
  MAX_TICKS,
  MAX_TYPED,
  OBSERVATIONS,
  OBSERVATION_ANSWERS,
  PANEL_BUTTONS,
  PANEL_H,
  PANEL_W,
  PROBE_STORAGE_KEY,
  asciiHead,
  buttonAt,
  classifyRejection,
  createReport,
  createSessionRecord,
  distance3,
  errorText,
  fmtBytes,
  geometrySignature,
  hexHead,
  panelLines,
  parseStoredReport,
  pushCapped,
  reportFileName,
  round3,
  slugify,
  summarizeMeshes,
  summarizePlanes,
  summarizeReport,
  uvToPanelPx,
  type AnchorState,
  type FileProbe,
  type KeyboardRecord,
  type ProbeReport,
  type RoomCaptureRecord,
  type SessionRecord,
  type Vec3T,
} from './xr-probe-core.ts';

/** Panel width in meters and its distance from the head when placed. */
const PANEL_M_W = 0.96;
const PANEL_DIST_M = 1.2;
/** Second press of Run room capture must land within this window. */
const ROOM_CONFIRM_MS = 4000;
/** The room-capture follow-up looks at the sentinel anchor again this long after the call settles. */
const ROOM_LATER_MS = 3000;
/** How long visibility changes count toward the keyboard test, and how long after the input blurs. */
const KEYBOARD_OPEN_MS = 60_000;
const KEYBOARD_AFTER_MS = 5000;
/** Delay before the sentinel anchor is created, so tracking has settled. */
const ANCHOR_DELAY_MS = 1500;
/** endedAt marker for a session whose page died before its 'end' event (see device-reports/README.md). */
const UNCLEAN_END = 'not recorded (page closed or killed during AR)';

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`xr-probe.html is missing #${id}`);
  return e as T;
}

const deviceInput = el<HTMLInputElement>('device');
const fileNameOut = el<HTMLElement>('file-name');
const filesInput = el<HTMLInputElement>('files');
const filesTable = el<HTMLTableElement>('file-table');
const persistBtn = el<HTMLButtonElement>('persist');
const envOut = el<HTMLElement>('env');
const optPlanes = el<HTMLInputElement>('opt-planes');
const optMeshes = el<HTMLInputElement>('opt-meshes');
const enterBtn = el<HTMLButtonElement>('enter');
const arStatus = el<HTMLElement>('ar-status');
const obsHost = el<HTMLElement>('observations');
const notesEl = el<HTMLTextAreaElement>('notes');
const summaryTable = el<HTMLTableElement>('summary');
const downloadBtn = el<HTMLButtonElement>('download');
const copyBtn = el<HTMLButtonElement>('copy');
const showBtn = el<HTMLButtonElement>('show');
const resetBtn = el<HTMLButtonElement>('reset');
const jsonOut = el<HTMLTextAreaElement>('json');
const logOut = el<HTMLElement>('log');
const overlayRoot = el<HTMLElement>('xr-overlay');
const overlayStatus = el<HTMLElement>('overlay-status');
const overlayExit = el<HTMLButtonElement>('overlay-exit');
const kbdInput = el<HTMLInputElement>('kbd');

// --- report persistence -----------------------------------------------------

function loadReport(): ProbeReport {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(PROBE_STORAGE_KEY);
  } catch {
    /* storage blocked: start fresh, Download JSON still works */
  }
  return parseStoredReport(stored) ?? createReport(new Date().toISOString(), navigator.userAgent, location.href);
}

let report: ProbeReport = loadReport();
let saveFailed = false;

function save(): void {
  report.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(PROBE_STORAGE_KEY, JSON.stringify(report));
    saveFailed = false;
  } catch (e) {
    if (!saveFailed) {
      saveFailed = true;
      log(`localStorage save failed (${errorText(e)}); use Download JSON before closing the page`);
    }
  }
}

let logRenderQueued = false;
function log(msg: string): void {
  pushCapped(report.log, [Date.now(), msg], MAX_LOG);
  console.log(`[xr-probe] ${msg}`);
  if (!logRenderQueued) {
    logRenderQueued = true;
    setTimeout(() => {
      logRenderQueued = false;
      renderLog();
    }, 0);
  }
}

// --- 2D rendering ---------------------------------------------------------------

function cellRow(table: HTMLTableElement, cells: string[], header = false): void {
  const tr = document.createElement('tr');
  for (const c of cells) {
    const td = document.createElement(header ? 'th' : 'td');
    td.textContent = c;
    tr.append(td);
  }
  table.append(tr);
}

function renderLog(): void {
  const tail = report.log.slice(-80);
  logOut.textContent = tail
    .map(([ms, msg]) => `${new Date(ms).toLocaleTimeString()}  ${msg}`)
    .reverse()
    .join('\n');
}

function renderFiles(): void {
  filesTable.replaceChildren();
  cellRow(filesTable, ['name', 'type', 'size', 'byteLength', 'first 8 bytes', 'ascii', 'ms', 'error'], true);
  for (const f of report.files) {
    cellRow(filesTable, [
      f.name,
      f.type || '(none)',
      String(f.size),
      f.byteLength === null ? '-' : String(f.byteLength),
      f.head ?? '-',
      f.ascii ?? '-',
      f.ms === null ? '-' : String(f.ms),
      f.error ?? '',
    ]);
  }
}

function renderSummary(): void {
  summaryTable.replaceChildren();
  cellRow(summaryTable, ['spike', 'question', 'answer'], true);
  for (const r of summarizeReport(report)) cellRow(summaryTable, [r.spike, r.question, r.answer]);
}

const obsSelects = new Map<string, HTMLSelectElement>();

function buildObservations(): void {
  for (const o of OBSERVATIONS) {
    const row = document.createElement('label');
    row.className = 'obs';
    const q = document.createElement('span');
    q.textContent = o.question;
    const sel = document.createElement('select');
    for (const v of OBSERVATION_ANSWERS) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v || 'not recorded';
      sel.append(opt);
    }
    sel.addEventListener('change', () => {
      report.observations[o.id] = sel.value;
      save();
      renderSummary();
    });
    obsSelects.set(o.id, sel);
    row.append(q, sel);
    obsHost.append(row);
  }
}

function render(): void {
  try {
    if (document.activeElement !== deviceInput) deviceInput.value = report.device;
    fileNameOut.textContent = reportFileName(report.device, new Date());
    if (notesEl.value !== report.notes) notesEl.value = report.notes;
    for (const [id, sel] of obsSelects) sel.value = report.observations[id] ?? '';
    envOut.textContent = JSON.stringify({ page: report.page, env: report.env }, null, 2);
    renderFiles();
    renderSummary();
    renderLog();
    arStatus.textContent = ar
      ? 'AR session running.'
      : `${report.sessions.length} AR session(s) recorded. Report last saved ${report.updatedAt}.`;
  } catch (e) {
    console.error('[xr-probe] render failed', e);
  }
}

// --- 2D probes ----------------------------------------------------------------

function protoOf(name: string): Record<string, unknown> | null {
  const ctor = (window as unknown as Record<string, unknown>)[name];
  if (typeof ctor !== 'function') return null;
  return (ctor as { prototype: Record<string, unknown> }).prototype ?? null;
}

async function refreshStorage(): Promise<void> {
  const env = report.env;
  const storage = navigator.storage as StorageManager | undefined;
  if (!storage || typeof storage.estimate !== 'function') {
    env.storageError = 'navigator.storage.estimate is missing';
    return;
  }
  try {
    const est = await storage.estimate();
    env.storage = { usage: est.usage ?? null, quota: est.quota ?? null };
    env.storageError = null;
  } catch (e) {
    env.storageError = `estimate() ${errorText(e)}`;
  }
  try {
    env.persisted = typeof storage.persisted === 'function' ? await storage.persisted() : null;
  } catch (e) {
    env.persisted = null;
    log(`storage.persisted() ${errorText(e)}`);
  }
}

async function probeEnv(): Promise<void> {
  const env = report.env;
  const nav = navigator as Navigator & { deviceMemory?: number };
  report.page = {
    url: location.href,
    userAgent: navigator.userAgent,
    secureContext: window.isSecureContext,
    hardwareConcurrency: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    screen: `${screen.width}x${screen.height} @${devicePixelRatio}`,
  };
  env.xr = 'xr' in navigator && !!navigator.xr;
  if (navigator.xr) {
    const xr = navigator.xr;
    const supported = async (mode: XRSessionMode): Promise<boolean | null> => {
      try {
        return await xr.isSessionSupported(mode);
      } catch (e) {
        log(`isSessionSupported('${mode}') ${errorText(e)}`);
        return null;
      }
    };
    env.immersiveAR = await supported('immersive-ar');
    env.immersiveVR = await supported('immersive-vr');
  }
  // Methods are plain data properties on the prototype, so typeof is safe.
  // detectedPlanes/detectedMeshes are getters, so only test for presence.
  const anchorProto = protoOf('XRAnchor');
  env.requestPersistentHandle = anchorProto ? typeof anchorProto.requestPersistentHandle : 'no XRAnchor';
  const sessionProto = protoOf('XRSession');
  env.restorePersistentAnchor = sessionProto ? typeof sessionProto.restorePersistentAnchor : 'no XRSession';
  env.initiateRoomCapture = sessionProto ? typeof sessionProto.initiateRoomCapture : 'no XRSession';
  const frameProto = protoOf('XRFrame');
  env.detectedPlanes = !!frameProto && 'detectedPlanes' in frameProto;
  env.detectedMeshes = !!frameProto && 'detectedMeshes' in frameProto;
  env.webkitSpeechRecognition = 'webkitSpeechRecognition' in window;
  env.speechRecognition = 'SpeechRecognition' in window;
  await refreshStorage();
  log(
    `env: immersive-ar=${env.immersiveAR} quota=${fmtBytes(env.storage?.quota ?? null)} persisted=${env.persisted}` +
      ` requestPersistentHandle=${env.requestPersistentHandle} initiateRoomCapture=${env.initiateRoomCapture}`,
  );
  save();
  render();
}

async function readFiles(files: File[]): Promise<void> {
  for (const f of files) {
    const rec: FileProbe = {
      name: f.name,
      type: f.type,
      size: f.size,
      lastModified: f.lastModified,
      byteLength: null,
      head: null,
      ascii: null,
      ms: null,
      error: null,
    };
    const t0 = performance.now();
    try {
      const buf = await f.arrayBuffer();
      const head = new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
      rec.byteLength = buf.byteLength;
      rec.head = hexHead(head);
      rec.ascii = asciiHead(head);
    } catch (e) {
      rec.error = errorText(e);
    }
    rec.ms = Math.round(performance.now() - t0);
    pushCapped(report.files, rec, MAX_FILES);
    log(`file "${f.name}" (${f.size} B): ${rec.error ?? `byteLength ${rec.byteLength}, head ${rec.head}`}`);
    save();
    render();
  }
  filesInput.value = ''; // lets the same file be picked again
}

// --- AR runtime -------------------------------------------------------------------

interface ThreeRig {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  panel: THREE.Mesh;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  raycaster: THREE.Raycaster;
}

interface ArRuntime {
  session: XRSession;
  rec: SessionRecord;
  t0: number;
  viewerHitSource: XRHitTestSource | null;
  anchor: XRAnchor | null;
  anchorPending: boolean;
  lastAnchor: AnchorState;
  lastFrameAt: number;
  frames: number;
  gapMax: number;
  nextTickAt: number;
  ticksSinceSave: number;
  lastSig: string;
  lastPlanes: number | null;
  lastMeshes: number | null;
  hitThisSecond: Vec3T | null;
  hasHead: boolean;
  panelPlaced: boolean;
  roomArmedUntil: number;
  /** Visibility changes are attributed to the keyboard test until this time. */
  keyboardWindowUntil: number;
  flash: string;
  flashUntil: number;
  lastFrameError: string;
}

let rig: ThreeRig | null = null;
let ar: ArRuntime | null = null;

const headPos = new THREE.Vector3();
const headQuat = new THREE.Quaternion();
const fwd = new THREE.Vector3();
const rayMatrix = new THREE.Matrix4();
const rayOrigin = new THREE.Vector3();
const rayDir = new THREE.Vector3();

function ensureRig(): ThreeRig {
  if (rig) return rig;
  // Same renderer flags as the app (src/main.ts) so the layer path matches.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.xr.enabled = true;
  renderer.xr.setFoveation(1);
  renderer.domElement.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.01, 50);
  const canvas = document.createElement('canvas');
  canvas.width = PANEL_W;
  canvas.height = PANEL_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(PANEL_M_W, (PANEL_M_W * PANEL_H) / PANEL_W),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
  );
  panel.visible = false;
  scene.add(panel);

  // Visible pointer rays so the panel buttons can be aimed at.
  const rayGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -4)]);
  const rayMat = new THREE.LineBasicMaterial({ color: 0x8ab4ff });
  for (let i = 0; i < 2; i++) {
    const c = renderer.xr.getController(i);
    c.add(new THREE.Line(rayGeom, rayMat));
    scene.add(c);
  }

  rig = { renderer, scene, camera, panel, ctx, texture, raycaster: new THREE.Raycaster() };
  return rig;
}

function addEvent(type: string, detail: string): void {
  const a = ar;
  if (a) pushCapped(a.rec.events, { t: Math.round(performance.now() - a.t0), type, detail }, MAX_EVENTS);
  log(`[AR] ${type}${detail ? ` ${detail}` : ''}`);
}

function flash(a: ArRuntime, msg: string): void {
  a.flash = msg;
  a.flashUntil = performance.now() + 5000;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(`${text.slice(0, mid)}...`).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}...`;
}

/** Word-wraps a status line into at most `maxRows` rows; continuation rows are indented. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxRows: number): string[] {
  if (ctx.measureText(text).width <= maxW) return [text];
  const rows: string[] = [];
  let cur = '';
  for (const word of text.split(' ')) {
    const next = cur ? `${cur} ${word}` : word;
    if (!cur || ctx.measureText(next).width <= maxW) {
      cur = next;
    } else {
      rows.push(cur);
      cur = `  ${word}`;
    }
  }
  if (cur) rows.push(cur);
  if (rows.length > maxRows) {
    rows.length = maxRows;
    rows[maxRows - 1] += ' ...';
  }
  return rows.map((r) => fitText(ctx, r, maxW));
}

function drawPanel(a: ArRuntime): void {
  if (!rig) return;
  const { ctx, texture } = rig;
  const now = performance.now();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#0e1219';
  ctx.fillRect(0, 0, PANEL_W, PANEL_H);
  ctx.strokeStyle = '#3d4a63';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, PANEL_W - 4, PANEL_H - 4);
  ctx.fillStyle = '#8ab4ff';
  ctx.font = 'bold 30px system-ui, sans-serif';
  ctx.fillText(fitText(ctx, `SetView XR probe   ${report.device}`, PANEL_W - 40), 20, 14);
  ctx.fillStyle = '#e6e9ef';
  ctx.font = '20px ui-monospace, Menlo, monospace';
  let y = 56;
  for (const line of panelLines(a.rec, now - a.t0)) {
    for (const row of wrapText(ctx, line, PANEL_W - 40, 3)) {
      if (y > 470) break;
      ctx.fillText(row, 20, y);
      y += 26;
    }
  }
  if (a.flash && now < a.flashUntil) {
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(fitText(ctx, a.flash, PANEL_W - 40), 20, 504);
  }
  const armed = now < a.roomArmedUntil;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 24px system-ui, sans-serif';
  for (const b of PANEL_BUTTONS) {
    let label = b.label;
    if (b.id === 'room') label = a.rec.roomCapture ? 'Room capture done' : armed ? 'Press again to run' : b.label;
    ctx.fillStyle = b.id === 'room' && armed ? '#7a2e2e' : '#1f2a3d';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = '#8ab4ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
  }
  texture.needsUpdate = true;
}

function placePanel(): void {
  if (!rig) return;
  const panel = rig.panel;
  fwd.set(0, 0, -1).applyQuaternion(headQuat);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();
  panel.position.copy(headPos).addScaledVector(fwd, PANEL_DIST_M);
  panel.position.y = headPos.y - 0.15;
  panel.lookAt(headPos.x, panel.position.y, headPos.z); // PlaneGeometry faces +Z, toward the viewer
  panel.visible = true;
}

function anchorState(a: ArRuntime, frame: XRFrame, ref: XRReferenceSpace): AnchorState {
  if (!a.anchor) return { tracked: null, pos: null };
  try {
    const inSet = frame.trackedAnchors ? frame.trackedAnchors.has(a.anchor) : true;
    const pose = frame.getPose(a.anchor.anchorSpace, ref);
    const p = pose ? pose.transform.position : null;
    return { tracked: inSet && !!pose, pos: p ? [round3(p.x), round3(p.y), round3(p.z)] : null };
  } catch {
    return { tracked: false, pos: null };
  }
}

function readPlanes(rec: SessionRecord, frame: XRFrame): Iterable<XRPlane> | null {
  if (rec.planesError) return null;
  try {
    const set = frame.detectedPlanes;
    if (set) return set;
    rec.planesError = 'frame.detectedPlanes is undefined';
  } catch (e) {
    rec.planesError = `frame.detectedPlanes threw ${errorText(e)}`;
  }
  addEvent('planes', rec.planesError);
  return null;
}

function readMeshes(rec: SessionRecord, frame: XRFrame): Iterable<XRMesh> | null {
  if (rec.meshesError) return null;
  try {
    const set = frame.detectedMeshes;
    if (set) return set;
    rec.meshesError = 'frame.detectedMeshes is undefined';
  } catch (e) {
    rec.meshesError = `frame.detectedMeshes threw ${errorText(e)}`;
  }
  addEvent('meshes', rec.meshesError);
  return null;
}

function hasFeature(rec: SessionRecord, f: string): boolean {
  return rec.enabledFeatures ? rec.enabledFeatures.includes(f) : true; // optimistic when not exposed, like the app
}

function onFrame(a: ArRuntime, frame: XRFrame): void {
  if (!rig) return;
  const rec = a.rec;
  const now = performance.now();
  const t = now - a.t0;
  if (a.lastFrameAt > 0) {
    const gap = now - a.lastFrameAt;
    if (gap > a.gapMax) a.gapMax = gap;
    const rc = rec.roomCapture;
    if (rc && rc.anchorLater === null && gap > rc.maxFrameGapMs) rc.maxFrameGapMs = Math.round(gap);
  }
  a.lastFrameAt = now;
  a.frames++;

  const ref = rig.renderer.xr.getReferenceSpace();
  if (!ref) return;
  const viewer = frame.getViewerPose(ref);
  if (viewer) {
    const p = viewer.transform.position;
    const o = viewer.transform.orientation;
    headPos.set(p.x, p.y, p.z);
    headQuat.set(o.x, o.y, o.z, o.w);
    a.hasHead = true;
    if (!a.panelPlaced) {
      placePanel();
      a.panelPlaced = true;
      drawPanel(a);
    }
  }

  if (a.viewerHitSource) {
    rec.hitTest.framesTested++;
    const results = frame.getHitTestResults(a.viewerHitSource);
    const hp = results.length ? results[0].getPose(ref) : undefined;
    if (hp) {
      rec.hitTest.framesWithHit++;
      if (rec.hitTest.firstHitAt === null) rec.hitTest.firstHitAt = Math.round(t);
      const q = hp.transform.position;
      a.hitThisSecond = [round3(q.x), round3(q.y), round3(q.z)];
    }
  }

  // Sentinel anchor at the reference-space origin, used by the room-capture test.
  if (!a.anchor && !a.anchorPending && !rec.anchor.error && t > ANCHOR_DELAY_MS) {
    if (!hasFeature(rec, 'anchors')) {
      rec.anchor.error = 'anchors feature not granted';
      addEvent('anchor', rec.anchor.error);
    } else if (typeof frame.createAnchor !== 'function') {
      rec.anchor.error = 'frame.createAnchor is missing';
      addEvent('anchor', rec.anchor.error);
    } else {
      a.anchorPending = true;
      frame.createAnchor(new XRRigidTransform(), ref).then(
        (anchor) => {
          a.anchorPending = false;
          if (ar !== a) return;
          a.anchor = anchor;
          rec.anchor.created = true;
          rec.anchor.createdAt = Math.round(performance.now() - a.t0);
          addEvent('anchor', 'sentinel anchor created at the reference-space origin');
        },
        (e: unknown) => {
          a.anchorPending = false;
          rec.anchor.error = errorText(e);
          addEvent('anchor', `createAnchor failed: ${rec.anchor.error}`);
        },
      );
    }
  }

  // Room-capture follow-up: anchor and geometry on the first frame after the
  // call settles, then again a few seconds later.
  const rc = rec.roomCapture;
  if (rc && rc.settledAt !== null && rc.anchorLater === null) {
    if (!rc.anchorAfter) {
      rc.anchorAfter = anchorState(a, frame, ref);
      save();
    } else if (t - rc.settledAt >= ROOM_LATER_MS) {
      rc.anchorLater = anchorState(a, frame, ref);
      rc.anchorMovedM = rc.anchorBefore ? distance3(rc.anchorBefore.pos, rc.anchorLater.pos) : null;
      if (rc.anchorMovedM !== null) rc.anchorMovedM = round3(rc.anchorMovedM);
      rc.planesAfter = a.lastPlanes;
      rc.meshesAfter = a.lastMeshes;
      addEvent('room-capture', `follow-up: anchor ${rc.anchorLater.tracked === null ? 'none' : rc.anchorLater.tracked ? 'tracked' : 'NOT tracked'}`);
      save();
    }
  }

  if (now < a.nextTickAt) return;
  // Once per second: geometry, tick, panel redraw.
  a.nextTickAt = now + 1000;
  const planeSet = readPlanes(rec, frame);
  const meshSet = readMeshes(rec, frame);
  const planes = planeSet ? summarizePlanes(planeSet) : null;
  const meshes = meshSet ? summarizeMeshes(meshSet) : null;
  const sig = geometrySignature(planes, meshes);
  if (sig !== a.lastSig) {
    a.lastSig = sig;
    pushCapped(rec.geometry, { t: Math.round(t), planes, meshes }, MAX_GEOMETRY);
  }
  a.lastPlanes = planes ? planes.count : null;
  a.lastMeshes = meshes ? meshes.count : null;
  a.lastAnchor = anchorState(a, frame, ref);
  pushCapped(
    rec.ticks,
    {
      t: Math.round(t),
      fps: a.frames,
      gapMaxMs: Math.round(a.gapMax),
      planes: a.lastPlanes,
      meshes: a.lastMeshes,
      hit: a.hitThisSecond,
      head: a.hasHead ? [round3(headPos.x), round3(headPos.y), round3(headPos.z)] : null,
      anchor: a.lastAnchor.tracked === null ? null : a.lastAnchor.tracked ? 1 : 0,
      vis: a.session.visibilityState,
    },
    MAX_TICKS,
  );
  a.frames = 0;
  a.gapMax = 0;
  a.hitThisSecond = null;
  drawPanel(a);
  if (++a.ticksSinceSave >= 2) {
    a.ticksSinceSave = 0;
    save();
  }
}

function runKeyboardTest(a: ArRuntime): void {
  const kr: KeyboardRecord = {
    at: Math.round(performance.now() - a.t0),
    focusError: null,
    activeIsInput: false,
    visibility: [],
    inputEvents: 0,
    typed: '',
    endedBy: null,
  };
  a.rec.keyboard = kr;
  a.keyboardWindowUntil = performance.now() + KEYBOARD_OPEN_MS;
  kbdInput.value = '';
  try {
    kbdInput.focus();
  } catch (e) {
    kr.focusError = errorText(e);
  }
  kr.activeIsInput = document.activeElement === kbdInput;
  addEvent('keyboard', `focus() called, activeElement is the input: ${kr.activeIsInput}`);
  flash(a, 'Keyboard test: if a keyboard appeared, type ok and press Enter');
  save();
}

function pressRoomCapture(a: ArRuntime): void {
  const rec = a.rec;
  if (rec.roomCapture) {
    flash(a, 'initiateRoomCapture() was already called in this session (allowed once per session)');
    return;
  }
  const now = performance.now();
  if (now >= a.roomArmedUntil) {
    a.roomArmedUntil = now + ROOM_CONFIRM_MS;
    flash(a, 'This may launch Space Setup and can invalidate anchors. Press again within 4 s to run it.');
    return;
  }
  a.roomArmedUntil = 0;
  a.keyboardWindowUntil = 0; // visibility changes from here on belong to room capture
  const rc: RoomCaptureRecord = {
    calledAt: Math.round(now - a.t0),
    outcome: 'pending',
    message: null,
    settledAt: null,
    // From the last animation-frame tick: anchor tracking is only defined on
    // animation frames, not on the select event's frame.
    anchorBefore: a.lastAnchor,
    anchorAfter: null,
    anchorLater: null,
    anchorMovedM: null,
    maxFrameGapMs: 0,
    resetsDuring: 0,
    visibilityDuring: [],
    planesBefore: a.lastPlanes,
    planesAfter: null,
    meshesBefore: a.lastMeshes,
    meshesAfter: null,
  };
  rec.roomCapture = rc;
  addEvent('room-capture', 'calling initiateRoomCapture()');
  save(); // before the call: if the OS flow kills the page, the attempt is still on record
  const settle = (outcome: string, message: string | null) => {
    rc.outcome = outcome;
    rc.message = message;
    rc.settledAt = Math.round(performance.now() - a.t0);
    addEvent('room-capture', `${outcome}${message ? `: ${message}` : ''}`);
    save();
  };
  const session = a.session;
  if (typeof session.initiateRoomCapture !== 'function') {
    settle('missing', 'session.initiateRoomCapture is not a function');
    return;
  }
  let p: Promise<unknown>;
  try {
    p = session.initiateRoomCapture();
  } catch (e) {
    settle(classifyRejection(e), `threw synchronously: ${errorText(e)}`);
    return;
  }
  p.then(
    () => settle('resolved', null),
    (e: unknown) => settle(classifyRejection(e), errorText(e)),
  );
}

function onSelect(a: ArRuntime, ev: XRInputSourceEvent): void {
  if (!rig || !rig.panel.visible) return;
  const ref = rig.renderer.xr.getReferenceSpace();
  if (!ref) return;
  let pose: XRPose | undefined;
  try {
    pose = ev.frame.getPose(ev.inputSource.targetRaySpace, ref);
  } catch (e) {
    addEvent('select', `getPose threw ${errorText(e)}`);
    return;
  }
  if (!pose) return;
  rayMatrix.fromArray(pose.transform.matrix);
  rayOrigin.setFromMatrixPosition(rayMatrix);
  rayDir.set(0, 0, -1).transformDirection(rayMatrix);
  rig.raycaster.set(rayOrigin, rayDir);
  const hit = rig.raycaster.intersectObject(rig.panel, false)[0];
  if (!hit || !hit.uv) return; // a select away from the panel does nothing
  const [px, py] = uvToPanelPx(hit.uv.x, hit.uv.y);
  const b = buttonAt(PANEL_BUTTONS, px, py);
  if (!b) return;
  addEvent('select', `${b.id} via ${ev.inputSource.handedness} ${ev.inputSource.targetRayMode}`);
  switch (b.id) {
    case 'keyboard':
      runKeyboardTest(a);
      break;
    case 'room':
      pressRoomCapture(a);
      break;
    case 'recenter':
      if (a.hasHead) placePanel();
      break;
    case 'exit':
      a.session.end().catch(() => undefined);
      break;
  }
  drawPanel(a);
}

function describeInput(s: XRInputSource): string {
  return `${s.handedness} ${s.targetRayMode}${s.hand ? ' hand' : ''}${s.gamepad ? ' gamepad' : ''} [${Array.from(s.profiles).join(',')}]`;
}

function noteInputs(rec: SessionRecord, list: Iterable<XRInputSource>): void {
  for (const s of list) {
    const d = describeInput(s);
    if (!rec.inputSources.includes(d) && rec.inputSources.length < 20) rec.inputSources.push(d);
  }
}

function onEnd(a: ArRuntime): void {
  addEvent('end', `after ${((performance.now() - a.t0) / 1000).toFixed(1)} s`);
  a.rec.endedAt = new Date().toISOString();
  if (rig) {
    rig.renderer.setAnimationLoop(null);
    rig.panel.visible = false;
  }
  if (ar === a) ar = null;
  enterBtn.disabled = false;
  overlayStatus.textContent = 'DOM overlay root (shown in AR only when dom-overlay is granted)';
  if (document.activeElement === kbdInput) kbdInput.blur();
  save();
  render();
  arStatus.textContent = 'AR session ended. Record your observations below, then Download JSON.';
}

async function setupSession(a: ArRuntime, r: ThreeRig): Promise<void> {
  const { session, rec } = a;
  rec.enabledFeatures = session.enabledFeatures ? Array.from(session.enabledFeatures) : null;
  const dos = session.domOverlayState;
  rec.domOverlayState = dos === undefined ? 'attribute-missing' : dos === null ? 'null' : String(dos.type);
  rec.environmentBlendMode = session.environmentBlendMode ?? null;
  rec.interactionMode = session.interactionMode ?? null;
  rec.frameRate = typeof session.frameRate === 'number' ? session.frameRate : null;
  rec.supportedFrameRates = session.supportedFrameRates ? Array.from(session.supportedFrameRates) : null;
  try {
    const handles = session.persistentAnchors;
    rec.persistentAnchors = handles
      ? { count: handles.length, blank: Array.from(handles).filter((h) => !h).length }
      : null;
  } catch (e) {
    addEvent('persistent-anchors', `read threw ${errorText(e)}`);
  }

  session.addEventListener('end', () => onEnd(a));
  session.addEventListener('select', (ev: XRInputSourceEvent) => {
    if (ar === a) onSelect(a, ev);
  });
  session.addEventListener('visibilitychange', () => {
    const v = session.visibilityState;
    addEvent('visibility', v);
    const rc = rec.roomCapture;
    if (rc && rc.anchorLater === null) rc.visibilityDuring.push(v);
    const kr = rec.keyboard;
    if (kr && performance.now() < a.keyboardWindowUntil && kr.visibility.length < 20) kr.visibility.push(v);
    save();
  });
  session.addEventListener('inputsourceschange', (ev: XRInputSourcesChangeEvent) => {
    noteInputs(rec, ev.added);
    addEvent('inputs', `+${ev.added.length} -${ev.removed.length}`);
  });
  noteInputs(rec, session.inputSources);

  // Copied from SessionManager.start: local-floor first, local as fallback.
  r.renderer.xr.setReferenceSpaceType('local-floor');
  try {
    await r.renderer.xr.setSession(session);
    rec.referenceSpace = 'local-floor';
  } catch (e) {
    addEvent('ref-space', `local-floor failed (${errorText(e)}), falling back to local`);
    r.renderer.xr.setReferenceSpaceType('local');
    await r.renderer.xr.setSession(session);
    rec.referenceSpace = 'local';
  }
  const refSpace = r.renderer.xr.getReferenceSpace();
  refSpace?.addEventListener('reset', () => {
    addEvent('reset', 'reference space reset');
    const rc = rec.roomCapture;
    if (rc && rc.anchorLater === null) rc.resetsDuring++;
    save();
  });

  try {
    const viewerSpace = await session.requestReferenceSpace('viewer');
    const source = session.requestHitTestSource ? await session.requestHitTestSource({ space: viewerSpace }) : undefined;
    a.viewerHitSource = source ?? null;
    rec.hitTest.source = source ? 'ok' : 'requestHitTestSource is missing';
  } catch (e) {
    rec.hitTest.source = errorText(e);
  }

  if (ar !== a) return; // the session ended during setup
  r.renderer.setAnimationLoop((_time, frame) => {
    if (frame && ar === a) {
      try {
        onFrame(a, frame);
      } catch (e) {
        // Record each distinct failure once instead of flooding the log every frame.
        const msg = errorText(e);
        if (msg !== a.lastFrameError) {
          a.lastFrameError = msg;
          addEvent('error', `frame callback threw ${msg}`);
          save();
        }
      }
    }
    r.renderer.render(r.scene, r.camera);
  });
  addEvent(
    'start',
    `ref=${rec.referenceSpace} features=${rec.enabledFeatures ? rec.enabledFeatures.join(',') : 'not exposed'}` +
      ` overlay=${rec.domOverlayState} hit=${rec.hitTest.source}`,
  );
  save();
}

async function enterAr(): Promise<void> {
  if (ar) return;
  if (!navigator.xr) {
    log('navigator.xr is missing: this browser has no WebXR');
    return;
  }
  const optionalFeatures = ['anchors', 'hand-tracking', 'dom-overlay', 'local-floor'];
  if (optMeshes.checked) optionalFeatures.push('mesh-detection');
  if (optPlanes.checked) optionalFeatures.push('plane-detection');
  const requiredFeatures = ['hit-test'];
  const rec = createSessionRecord(new Date().toISOString(), { requiredFeatures, optionalFeatures });
  pushCapped(report.sessions, rec, MAX_SESSIONS, 1);
  enterBtn.disabled = true;
  overlayStatus.textContent = 'SetView XR probe: DOM overlay is active';
  let session: XRSession;
  try {
    // First await in the click handler, so the user activation still holds.
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures,
      optionalFeatures,
      domOverlay: { root: overlayRoot },
    });
  } catch (e) {
    rec.requestError = errorText(e);
    log(`requestSession failed: ${rec.requestError}`);
    enterBtn.disabled = false;
    save();
    render();
    return;
  }
  const a: ArRuntime = {
    session,
    rec,
    t0: performance.now(),
    viewerHitSource: null,
    anchor: null,
    anchorPending: false,
    lastAnchor: { tracked: null, pos: null },
    lastFrameAt: 0,
    frames: 0,
    gapMax: 0,
    nextTickAt: 0,
    ticksSinceSave: 0,
    lastSig: '',
    lastPlanes: null,
    lastMeshes: null,
    hitThisSecond: null,
    hasHead: false,
    panelPlaced: false,
    roomArmedUntil: 0,
    keyboardWindowUntil: 0,
    flash: '',
    flashUntil: 0,
    lastFrameError: '',
  };
  ar = a;
  arStatus.textContent = 'AR session running.';
  try {
    await setupSession(a, ensureRig());
  } catch (e) {
    addEvent('error', `session setup failed: ${errorText(e)}`);
    save();
    session.end().catch(() => undefined);
  }
}

// --- wiring ------------------------------------------------------------------------

buildObservations();

deviceInput.addEventListener('change', () => {
  report.device = slugify(deviceInput.value);
  save();
  render();
});
filesInput.addEventListener('change', () => {
  void readFiles(Array.from(filesInput.files ?? []));
});
persistBtn.addEventListener('click', () => {
  void (async () => {
    const storage = navigator.storage as StorageManager | undefined;
    if (!storage || typeof storage.persist !== 'function') {
      report.env.persistRequest = 'navigator.storage.persist is missing';
    } else {
      try {
        report.env.persistRequest = await storage.persist();
      } catch (e) {
        report.env.persistRequest = errorText(e);
      }
    }
    await refreshStorage();
    log(`storage.persist() -> ${String(report.env.persistRequest)}; persisted=${report.env.persisted}`);
    save();
    render();
  })();
});
enterBtn.addEventListener('click', () => {
  void enterAr();
});
overlayExit.addEventListener('click', () => {
  ar?.session.end().catch(() => undefined);
});
notesEl.addEventListener('input', () => {
  report.notes = notesEl.value;
});
notesEl.addEventListener('change', () => {
  report.notes = notesEl.value;
  save();
});

kbdInput.addEventListener('input', () => {
  const kr = ar?.rec.keyboard;
  if (!kr) return;
  kr.inputEvents++;
  kr.typed = kbdInput.value.slice(0, MAX_TYPED);
});
kbdInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key !== 'Enter') return;
  const kr = ar?.rec.keyboard;
  if (kr && !kr.endedBy) kr.endedBy = 'enter';
  kbdInput.blur();
});
kbdInput.addEventListener('blur', () => {
  const kr = ar?.rec.keyboard;
  if (!ar || !kr) return;
  // Keep listening briefly: the session returns to 'visible' after the keyboard closes.
  ar.keyboardWindowUntil = Math.min(ar.keyboardWindowUntil, performance.now() + KEYBOARD_AFTER_MS);
  if (!kr.endedBy) kr.endedBy = 'blur';
  addEvent('keyboard', `input blurred (${kr.endedBy}); typed "${kr.typed}"`);
  save();
});

downloadBtn.addEventListener('click', () => {
  report.notes = notesEl.value;
  save();
  const name = reportFileName(report.device, new Date());
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  log(`download started: ${name}`);
});
copyBtn.addEventListener('click', () => {
  report.notes = notesEl.value;
  save();
  const text = JSON.stringify(report, null, 2);
  const fallback = () => {
    jsonOut.hidden = false;
    jsonOut.value = text;
    jsonOut.select();
    log('clipboard unavailable: JSON shown below, selected for manual copy');
  };
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    fallback();
    return;
  }
  navigator.clipboard.writeText(text).then(
    () => log(`copied ${text.length} characters of JSON`),
    (e: unknown) => {
      log(`clipboard write failed: ${errorText(e)}`);
      fallback();
    },
  );
});
showBtn.addEventListener('click', () => {
  jsonOut.hidden = !jsonOut.hidden;
  if (!jsonOut.hidden) jsonOut.value = JSON.stringify(report, null, 2);
});
resetBtn.addEventListener('click', () => {
  if (ar) {
    log('exit AR before starting a new report');
    return;
  }
  if (!confirm('Discard the current report (sessions, files, notes) and start a new one?')) return;
  report = createReport(new Date().toISOString(), navigator.userAgent, location.href);
  jsonOut.hidden = true;
  log('started a new report');
  void probeEnv();
});

document.addEventListener('visibilitychange', () => {
  if (ar) addEvent('doc-visibility', document.visibilityState);
  save();
});
window.addEventListener('error', (e: ErrorEvent) => {
  log(`window error: ${e.message} at ${e.filename}:${e.lineno}`);
  save();
});
window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  log(`unhandled rejection: ${errorText(e.reason)}`);
  save();
});

if (report.sessions.length || report.files.length) {
  log(`restored report from ${report.createdAt}: ${report.sessions.length} session(s), ${report.files.length} file(s)`);
  for (const s of report.sessions) {
    if (!s.requestError && !s.endedAt) {
      s.endedAt = UNCLEAN_END;
      log(`session started ${s.startedAt} never recorded an end: the page was closed or killed during AR`);
      save();
    }
  }
}
render();
void probeEnv();
