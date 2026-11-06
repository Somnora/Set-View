// ---------------------------------------------------------------------------
// LAN drop box rules. PURE: no three, no DOM, no Node APIs. Shared by the dev
// server plugin (vite.plugins.ts), the phone upload page and the landing panel.
//
// The drop box is a folder (./drop, gitignored) on the computer running
// `npm run dev`. A phone or laptop on the same network uploads to it; the
// Quest's landing page lists it and imports a file with one tap, with no file
// picker involved. It exists only on the dev server, never in a static build.
// ---------------------------------------------------------------------------

import { LOCATION_MESH_KINDS, SPLAT_KINDS, type SceneFileKind } from './sceneImport.ts';

/** Largest upload the dev server accepts (1 GiB). Room-scale scans are 10 to 300 MB. */
export const DROP_MAX_BYTES = 1024 * 1024 * 1024;
/** Longest stored file name, in characters. */
export const DROP_MAX_NAME = 120;

export interface DropEntry {
  name: string;
  size: number;
  /** Last modified, epoch ms. */
  mtime: number;
}

/**
 * Reduces an uploaded file name to a safe basename for the drop folder, or
 * null when nothing usable is left. Drops any directory part (both slash
 * kinds), control characters and characters that are reserved on common file
 * systems, leading dots (no hidden files, no '.' or '..'), and trailing dots
 * and spaces; keeps letters from any script; caps the length while keeping
 * the extension.
 */
export function sanitizeDropName(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  let name = raw.normalize('NFC');
  const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  if (slash >= 0) name = name.slice(slash + 1);
  name = name.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_');
  name = name.replace(/\s+/g, ' ').trim();
  name = name.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
  if (!name) return null;
  if (name.length > DROP_MAX_NAME) {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 && name.length - dot <= 12 ? name.slice(dot) : '';
    name = name.slice(0, DROP_MAX_NAME - ext.length).replace(/[.\s]+$/, '') + ext;
  }
  return name || null;
}

/** `name`, or `name (2).ext`, `name (3).ext`... so an upload never overwrites a file. */
export function uniqueDropName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${stem} (${Date.now()})${ext}`;
}

/** File name for a scene sent to the drop box. */
export function sceneDropName(sceneName: string): string {
  const base = sanitizeDropName(sceneName.replace(/\.setview\.json$/i, '')) ?? 'scene';
  return `${base}.setview.json`;
}

export type DropAction = 'location' | 'scene' | 'prop';

/** What the landing panel offers for a file, by its sniffed content. */
export function dropActionsFor(kind: SceneFileKind): DropAction[] {
  if (kind === 'setview-json') return ['scene'];
  if (kind === 'glb' || kind === 'obj') return ['location', 'prop'];
  if (LOCATION_MESH_KINDS.has(kind)) return ['location'];
  return [];
}

/** Why a file has no action, for the panel; null when it has one. */
export function dropRefusal(kind: SceneFileKind): string | null {
  if (dropActionsFor(kind).length) return null;
  if (SPLAT_KINDS.has(kind)) return 'Gaussian splat: not supported as a location yet';
  if (kind === 'ply-points') return 'point cloud with no faces';
  if (kind === 'gltf-json') return 'separate-file glTF: export a single .glb';
  return 'not a scene or mesh SetView can import';
}

/** Extension a prop upload needs (the Prop Library still types uploads by name). */
export function propExtensionFor(kind: SceneFileKind): string | null {
  return kind === 'glb' ? '.glb' : kind === 'obj' ? '.obj' : null;
}

/** Parses a `bytes=a-b` / `bytes=a-` / `bytes=-n` Range header against a size. */
export function parseByteRange(header: string | undefined, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '') || size <= 0) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    const n = Number(m[2]);
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end };
}

/**
 * Same-origin check for state-changing requests (upload, delete): a page on
 * another site must not be able to write to the drop box from the user's
 * browser. Requests without an Origin header (curl, older clients) pass.
 */
export function isSameOriginRequest(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
