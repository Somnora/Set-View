// ---------------------------------------------------------------------------
// Scan Room flow (P1.8). PURE: no three.js, no DOM, no WebXR.
//
// The per-frame decisions of a pending scan, as a reducer the render loop
// feeds and acts on:
//   realign    Scan Room re-aligned the set first; wait for that fade to apply.
//   waiting    reading the platform's room data; capture as soon as it exists
//              (Quest Scene Mesh), after the floor estimate has settled.
//   collecting planes-only devices (Android XR): detected planes build up as
//              the user looks around, until Scan Room is pressed again.
// It cancels when the view moves (a teleport or a view change would bake that
// transform into the geometry), holds its clock while system UI covers the
// session, hints once, and times out.
// ---------------------------------------------------------------------------

export type ScanSourceKind = 'meshes' | 'planes';
export type ScanPhase = 'realign' | 'waiting' | 'collecting';

/** Give the platform this long to surface room data before giving up. */
export const SCAN_TIMEOUT_MS = 30_000;
/** If nothing is tracked after this long, say what to do about it (once). */
export const SCAN_HINT_AFTER_MS = 5_000;
/** Longest a scan waits for the floor estimate to settle before capturing anyway. */
export const SCAN_FLOOR_WAIT_MS = 5_000;
/** Planes are re-read at most this often while collecting (review R12: never per frame). */
export const SCAN_COLLECT_INTERVAL_MS = 500;

export interface ScanFlowState {
  phase: ScanPhase;
  /** Clock start (loop time), or -1 to (re)start it on the next frame. */
  startedAt: number;
  sources: ScanSourceKind[];
  /** Planes-only capture: collect until pressed again, instead of a one-frame snapshot. */
  collect: boolean;
  floorHinted: boolean;
  hinted: boolean;
  /** Loop time of the last plane refresh while collecting. */
  lastCollectAt: number;
  /** Planes collected so far. */
  planes: number;
}

export interface ScanFrameInput {
  now: number;
  /** A view transition (realign, teleport) is still fading. */
  fading: boolean;
  viewFull: boolean;
  /** The set has been glided, teleported or turned away from registration. */
  shifted: boolean;
  /** Session visibilityState is 'visible' (or unknown). */
  visible: boolean;
  floorSettled: boolean;
  /** The platform has room data this frame (meshes, or planes when not collecting). */
  hasData: boolean;
}

export type ScanFrameAction =
  | { kind: 'wait' }
  | { kind: 'cancel'; reason: string }
  | { kind: 'floor-hint' }
  | { kind: 'capture' }
  | { kind: 'collect' }
  | { kind: 'hint' }
  | { kind: 'timeout' };

/**
 * State for a Scan Room press. Planes-only sources collect (Android XR);
 * anything with meshes snapshots (Quest).
 */
export function scanStart(sources: ScanSourceKind[], awaitingRealign: boolean): ScanFlowState {
  return {
    phase: awaitingRealign ? 'realign' : sources.includes('meshes') ? 'waiting' : 'collecting',
    startedAt: -1,
    sources: [...sources],
    collect: !sources.includes('meshes'),
    floorHinted: false,
    hinted: false,
    lastCollectAt: -Infinity,
    planes: 0,
  };
}

/** What a Scan Room press does now. */
export function scanPress(s: ScanFlowState | null): 'start' | 'finish' | 'cancel' {
  if (!s) return 'start';
  return s.phase === 'collecting' && s.planes > 0 ? 'finish' : 'cancel';
}

/** One frame of a pending scan. Returns the next state and what the caller should do. */
export function scanFrame(s: ScanFlowState, i: ScanFrameInput): { state: ScanFlowState; action: ScanFrameAction } {
  let st = s;
  if (st.phase === 'realign') {
    if (i.fading) return { state: st, action: { kind: 'wait' } };
    st = { ...st, phase: st.collect ? 'collecting' : 'waiting', startedAt: -1 };
  }
  if (!i.viewFull || i.shifted) {
    return { state: st, action: { kind: 'cancel', reason: 'scan cancelled: view moved (Re-align, then rescan)' } };
  }
  // The clock (re)starts on the first frame, after a realign, and while system
  // UI covers the session (no timing out mid Space Setup).
  if (st.startedAt < 0 || !i.visible) st = { ...st, startedAt: i.now };
  const waited = i.now - st.startedAt;
  if (!i.floorSettled && waited < SCAN_FLOOR_WAIT_MS) {
    if (!st.floorHinted) return { state: { ...st, floorHinted: true }, action: { kind: 'floor-hint' } };
    return { state: st, action: { kind: 'wait' } };
  }
  if (st.collect) {
    if (i.now - st.lastCollectAt >= SCAN_COLLECT_INTERVAL_MS) {
      return { state: { ...st, lastCollectAt: i.now }, action: { kind: 'collect' } };
    }
  } else if (i.hasData) {
    return { state: st, action: { kind: 'capture' } };
  }
  if (!st.hinted && waited > SCAN_HINT_AFTER_MS && (!st.collect || st.planes === 0)) {
    return { state: { ...st, hinted: true }, action: { kind: 'hint' } };
  }
  // Collecting with planes found never times out: the user finishes it.
  if (waited > SCAN_TIMEOUT_MS && (!st.collect || st.planes === 0)) return { state: st, action: { kind: 'timeout' } };
  return { state: st, action: { kind: 'wait' } };
}

/** Records how many planes the collector holds after a refresh. */
export function scanCollected(s: ScanFlowState, planes: number): ScanFlowState {
  return { ...s, planes };
}

/** Short wheel label for the Scan sector. */
export function scanSectorLabel(s: ScanFlowState | null): string {
  if (!s) return 'Scan\nRoom';
  if (s.phase === 'collecting') return s.planes > 0 ? `Finish\nScan (${s.planes})` : 'Scanning\n(cancel)';
  return 'Scanning\n(cancel)';
}
