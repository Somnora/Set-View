// ---------------------------------------------------------------------------
// Video-recording math and policy — PURE, portable, no DOM/media APIs.
// MonitorRecorder (recorder.ts) applies these against MediaRecorder and the
// renderer canvas; this module is the tested source of truth for container
// selection, letterbox fitting, and the take clock.
// ---------------------------------------------------------------------------

/**
 * Recorded frame-rate cap. The throttle snaps to the XR refresh, so the real
 * cadence is every 3rd loop frame: ~24 fps at 72 Hz, 30 fps at 90 Hz — both
 * fine (even, film-adjacent) for previz. Take duration is wall-clock either
 * way, since frames carry real capture timestamps.
 */
export const RECORD_FPS = 30;

/** Target encoder bitrate (bps) — generous for a 1024-wide monitor feed. */
export const RECORD_VIDEO_BPS = 5_000_000;

/** Hard cap per take, seconds — bounds in-memory chunk growth (~190 MB). */
export const MAX_RECORD_S = 300;

/**
 * Container/codec preference, most-shareable first: mp4/H.264 plays anywhere
 * (phones, editors, messengers); webm is the guaranteed Chromium fallback.
 */
export const RECORD_MIME_CANDIDATES: readonly string[] = [
  'video/mp4;codecs=avc1.42E01F',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

/** First candidate the platform supports, or null when none is (no recording). */
export function pickMimeType(
  candidates: readonly string[],
  isSupported: (type: string) => boolean,
): string | null {
  for (const c of candidates) if (isSupported(c)) return c;
  return null;
}

/** File extension for a chosen container mime type. */
export function fileExtensionFor(mime: string): 'mp4' | 'webm' {
  return mime.startsWith('video/mp4') ? 'mp4' : 'webm';
}

/**
 * Per-axis scale (0–1) that letterbox-fits a src rectangle inside a dst
 * rectangle preserving the src aspect — the blit quad's x/y scale. Equal
 * aspects give {1,1} (full cover, the common case: the recording canvas is
 * sized to the feed at start; bars only appear if aspect changes mid-take).
 * Degenerate inputs fall back to {1,1} rather than a zero rect.
 */
export function containScale(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { x: number; y: number } {
  if (!(srcW > 0) || !(srcH > 0) || !(dstW > 0) || !(dstH > 0)) return { x: 1, y: 1 };
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;
  return srcAspect >= dstAspect
    ? { x: 1, y: dstAspect / srcAspect }
    : { x: srcAspect / dstAspect, y: 1 };
}

/** Take clock, M:SS — shown on the wrist Record button while rolling. */
export function recordingClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
