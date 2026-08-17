// ---------------------------------------------------------------------------
// SMPTE 24fps Timecode, Frame Calculation, & Transport State Machine
// Pure, portable, zero Three.js/DOM imports. Tested in test/domain.test.ts.
// ---------------------------------------------------------------------------

export const DEFAULT_TIMECODE_FPS = 24;

export interface SmpteTimecode {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
  formatted: string;
}

export interface TransportState {
  currentTimeS: number;
  durationS: number;
  isPlaying: boolean;
  playbackRate: number; // e.g. -1.0, 0.25, 0.5, 1.0, 2.0
  loopInS: number | null;
  loopOutS: number | null;
  isLooping: boolean;
}

/** Converts seconds to 24fps (or specified fps) SMPTE timecode HH:MM:SS:FF. Pure. */
export function secondsToSmpte(totalSeconds: number, fps = DEFAULT_TIMECODE_FPS): SmpteTimecode {
  const safeSec = Math.max(0, isFinite(totalSeconds) ? totalSeconds : 0);
  const totalFrames = Math.floor(safeSec * fps + 1e-4);
  
  const frames = totalFrames % fps;
  const totalSecInt = Math.floor(totalFrames / fps);
  const seconds = totalSecInt % 60;
  const totalMinInt = Math.floor(totalSecInt / 60);
  const minutes = totalMinInt % 60;
  const hours = Math.floor(totalMinInt / 60);

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const ff = String(frames).padStart(2, '0');

  return {
    hours,
    minutes,
    seconds,
    frames,
    formatted: `${hh}:${mm}:${ss}:${ff}`,
  };
}

/** Converts an SMPTE timecode string (HH:MM:SS:FF or MM:SS:FF) into seconds. Pure. */
export function smpteToSeconds(timecode: string, fps = DEFAULT_TIMECODE_FPS): number {
  if (!timecode || typeof timecode !== 'string') return 0;
  const parts = timecode.trim().split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => isNaN(p) || p < 0)) return 0;

  if (parts.length === 4) {
    const [h, m, s, f] = parts;
    const clampedFrames = Math.min(fps - 1, f);
    return h * 3600 + m * 60 + s + clampedFrames / fps;
  } else if (parts.length === 3) {
    const [m, s, f] = parts;
    const clampedFrames = Math.min(fps - 1, f);
    return m * 60 + s + clampedFrames / fps;
  } else if (parts.length === 2) {
    const [s, f] = parts;
    const clampedFrames = Math.min(fps - 1, f);
    return s + clampedFrames / fps;
  }
  return 0;
}

/** Converts seconds to total discrete frames. Pure. */
export function secondsToFrames(seconds: number, fps = DEFAULT_TIMECODE_FPS): number {
  const safeSec = Math.max(0, isFinite(seconds) ? seconds : 0);
  return Math.floor(safeSec * fps + 1e-5);
}

/** Converts total discrete frames to seconds. Pure. */
export function framesToSeconds(frames: number, fps = DEFAULT_TIMECODE_FPS): number {
  const safeFrames = Math.max(0, isFinite(frames) ? frames : 0);
  return safeFrames / fps;
}

/** Creates a default initial transport state. Pure. */
export function createTransportState(durationS = 0): TransportState {
  return {
    currentTimeS: 0,
    durationS: Math.max(0, isFinite(durationS) ? durationS : 0),
    isPlaying: false,
    playbackRate: 1.0,
    loopInS: null,
    loopOutS: null,
    isLooping: false,
  };
}

/**
 * Advances transport state by delta time (dt in seconds), respecting playbackRate,
 * loop bounds, and end-of-timeline boundaries. Pure.
 */
export function advanceTransport(
  state: TransportState,
  dt: number,
): TransportState {
  if (!state.isPlaying || dt === 0 || state.durationS <= 0) {
    return state;
  }

  const delta = dt * state.playbackRate;
  let nextTime = state.currentTimeS + delta;

  const inBound = state.loopInS !== null ? Math.max(0, state.loopInS) : 0;
  const outBound = state.loopOutS !== null ? Math.min(state.durationS, state.loopOutS) : state.durationS;
  const effectiveIn = Math.min(inBound, outBound);
  const effectiveOut = Math.max(inBound, outBound);

  if (state.isLooping && effectiveOut > effectiveIn) {
    const loopSpan = effectiveOut - effectiveIn;
    if (nextTime > effectiveOut) {
      nextTime = effectiveIn + ((nextTime - effectiveIn) % loopSpan);
    } else if (nextTime < effectiveIn) {
      nextTime = effectiveOut - ((effectiveIn - nextTime) % loopSpan);
    }
  } else {
    // Non-looping playback
    if (nextTime >= state.durationS) {
      nextTime = state.durationS;
      return {
        ...state,
        currentTimeS: nextTime,
        isPlaying: false,
      };
    } else if (nextTime <= 0) {
      nextTime = 0;
      if (state.playbackRate < 0) {
        return {
          ...state,
          currentTimeS: 0,
          isPlaying: false,
        };
      }
    }
  }

  return {
    ...state,
    currentTimeS: Math.max(0, Math.min(state.durationS, nextTime)),
  };
}

/**
 * Steps the playhead by discrete frame increments (e.g. +1 frame, -1 frame),
 * pausing playback. Pure.
 */
export function stepTransportFrames(
  state: TransportState,
  frameDelta: number,
  fps = DEFAULT_TIMECODE_FPS,
): TransportState {
  if (state.durationS <= 0) return state;

  const currentFrame = secondsToFrames(state.currentTimeS, fps);
  const maxFrame = secondsToFrames(state.durationS, fps);
  const targetFrame = Math.max(0, Math.min(maxFrame, currentFrame + frameDelta));
  const targetTime = framesToSeconds(targetFrame, fps);

  return {
    ...state,
    currentTimeS: targetTime,
    isPlaying: false,
  };
}

/**
 * Scrubs the transport playhead to a normalized ratio 0..1, pausing playback. Pure.
 */
export function scrubTransport(state: TransportState, normalizedRatio: number): TransportState {
  if (state.durationS <= 0) return state;
  const clampedRatio = Math.max(0, Math.min(1, isFinite(normalizedRatio) ? normalizedRatio : 0));
  const targetTime = clampedRatio * state.durationS;

  return {
    ...state,
    currentTimeS: targetTime,
    isPlaying: false,
  };
}

/** Sets or updates the In-Point (loop start) mark. Pure. */
export function setTransportInPoint(state: TransportState, timeS?: number): TransportState {
  const inTime = timeS !== undefined ? timeS : state.currentTimeS;
  const safeIn = Math.max(0, Math.min(state.durationS, inTime));
  
  let safeOut = state.loopOutS;
  if (safeOut !== null && safeOut < safeIn) {
    safeOut = null; // Clear out point if now earlier than in point
  }

  return {
    ...state,
    loopInS: safeIn,
    loopOutS: safeOut,
    isLooping: safeOut !== null,
  };
}

/** Sets or updates the Out-Point (loop end) mark. Pure. */
export function setTransportOutPoint(state: TransportState, timeS?: number): TransportState {
  const outTime = timeS !== undefined ? timeS : state.currentTimeS;
  const safeOut = Math.max(0, Math.min(state.durationS, outTime));

  let safeIn = state.loopInS;
  if (safeIn !== null && safeIn > safeOut) {
    safeIn = null; // Clear in point if now later than out point
  }

  return {
    ...state,
    loopInS: safeIn,
    loopOutS: safeOut,
    isLooping: safeIn !== null,
  };
}

/** Clears In/Out loop marks. Pure. */
export function clearTransportLoop(state: TransportState): TransportState {
  return {
    ...state,
    loopInS: null,
    loopOutS: null,
    isLooping: false,
  };
}

/** Toggles or sets loop playback mode. Pure. */
export function toggleTransportLoop(state: TransportState, enable?: boolean): TransportState {
  const nextLoop = enable !== undefined ? enable : !state.isLooping;
  return {
    ...state,
    isLooping: nextLoop,
  };
}

/** Cycles through standard playback speeds (0.25x, 0.5x, 1x, 2x). Pure. */
export function cyclePlaybackRate(currentRate: number, reverse = false): number {
  const rates = [0.25, 0.5, 1.0, 2.0];
  if (reverse) {
    return currentRate === -1.0 ? 1.0 : -1.0;
  }
  const positiveRate = Math.abs(currentRate);
  const idx = rates.findIndex((r) => Math.abs(r - positiveRate) < 0.05);
  const nextIdx = idx === -1 ? 2 : (idx + 1) % rates.length;
  return currentRate < 0 ? -rates[nextIdx] : rates[nextIdx];
}
