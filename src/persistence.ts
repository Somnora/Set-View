// ---------------------------------------------------------------------------
// Scene persistence: localStorage autosave + scene list, JSON export/import.
// No backend — everything stays on the device.
// ---------------------------------------------------------------------------

import { createScene, isSceneData, normalizeScene, uid, type SceneData } from './model.ts';
import {
  createSyntheticLocationScan,
  downloadFloorplan,
  downloadLocationScanPackage,
  downloadScanGeoJson,
  downloadScanObj,
  downloadScanPly,
  downloadScanUsd,
  downloadShotList,
} from './exporters.ts';
import { decodeScan, encodeScan, summarizeScan, type LocationScan } from './scan.ts';
import { ScanStore } from './scanStore.ts';

/** Exported scene files optionally embed the scan geometry as base64. */
export type SceneFile = SceneData & { scanData?: string };

const INDEX_KEY = 'setview.sceneIndex';
const CURRENT_KEY = 'setview.currentScene';
const SCENE_PREFIX = 'setview.scene.';

/** Imports at least this large (or carrying a scan) count as heavy: the first one
 *  asks the browser to make storage persistent. */
export const HEAVY_IMPORT_BYTES = 1024 * 1024;

/**
 * Builds the .setview.json payload: the scene plus, when its geometry blob is
 * available, the scan embedded as base64. Pure: the caller fetches the blob.
 */
export function buildSceneFile(scene: SceneData, scan: LocationScan | null): SceneFile {
  const file: SceneFile = { ...scene };
  if (scene.scan && scan) file.scanData = encodeScan(scan);
  return file;
}

/**
 * Decodes a picked file's bytes as UTF-8. Null when the read produced nothing:
 * a browser that refuses to hand over a file (or a picker that yields an empty
 * one) must be reported as such, not as a corrupt scene.
 */
export function decodeSceneFileBytes(buf: ArrayBuffer | null | undefined): string | null {
  if (!buf || buf.byteLength === 0) return null;
  try {
    return new TextDecoder('utf-8').decode(buf);
  } catch {
    return null;
  }
}

export interface ParsedSceneFile {
  /** Validated, normalized scene with a fresh id and an "(imported)" name. */
  scene: SceneData;
  /** Embedded scan geometry to store under scene.scan.id, or null. */
  scan: LocationScan | null;
  /** The file had a scan summary but no decodable geometry, so it was dropped. */
  scanDropped: boolean;
}

/**
 * Parses an exported scene file. Pure (no storage): null when the text is not a
 * SetView scene. The scene gets a fresh id so an import never clobbers an existing
 * scene. Embedded geometry is decoded under a fresh blob id; moved-furniture
 * placements are kept (they index the scan's meshes, and the codec preserves mesh
 * order), minus any that point past the decoded mesh list.
 */
export function parseSceneFile(text: string): ParsedSceneFile | null {
  let data: SceneFile;
  try {
    data = JSON.parse(text) as SceneFile;
  } catch {
    return null;
  }
  if (!isSceneData(data)) return null;
  normalizeScene(data);
  data.id = uid();
  data.name = `${data.name} (imported)`;
  const embedded = typeof data.scanData === 'string' ? decodeScan(data.scanData) : null;
  delete data.scanData; // never let megabytes of base64 hit localStorage
  let scanDropped = false;
  if (embedded) {
    const furniture = data.scan?.furniture?.filter((p) => p.meshIndex < embedded.meshes.length);
    data.scan = summarizeScan(embedded);
    if (furniture && furniture.length > 0) data.scan.furniture = furniture;
  } else {
    scanDropped = !!data.scan;
    data.scan = null;
  }
  return { scene: data, scan: embedded, scanDropped };
}

export type SceneImportResult =
  | {
      ok: true;
      scene: SceneData;
      /** False when the scene could not be written to storage (it is lost on reload). */
      saved: boolean;
      /** Large file or embedded scan: worth asking for persistent storage. */
      heavy: boolean;
    }
  | { ok: false; reason: 'blocked' | 'invalid'; message: string };

/** What the landing storage line reports. */
export interface StorageReport {
  /** Origin-wide usage and quota from navigator.storage.estimate(); null if unavailable. */
  usageBytes: number | null;
  quotaBytes: number | null;
  /** Whether the browser granted persistent storage; null if unknown. */
  persisted: boolean | null;
  /** SetView scene JSON held in localStorage (two bytes per UTF-16 code unit). */
  sceneBytes: number;
  /** Approximate stored scan geometry (ScanStore). */
  scanBytes: number;
}

/** "512 B", "3.4 KB", "12.0 MB", "1.95 GB". */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '?';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** One-line storage summary for the landing Scene card. */
export function formatStorageLine(r: StorageReport): string {
  let line = `Storage: scenes ${formatBytes(r.sceneBytes)}, scans ${formatBytes(r.scanBytes)}`;
  if (r.usageBytes !== null && r.quotaBytes !== null && r.quotaBytes > 0) {
    line += `; browser total ${formatBytes(r.usageBytes)} of ${formatBytes(r.quotaBytes)}`;
  }
  if (r.persisted !== null) line += r.persisted ? '; persistent' : '; not persistent (may be evicted)';
  return line;
}

export interface SceneIndexEntry {
  id: string;
  name: string;
  updatedAt: number;
  actors: number;
  cameras: number;
  hasScan?: boolean;
}

export class Persistence {
  /** Scan geometry blobs (IndexedDB) — scene JSON carries only the summary. */
  readonly scans = new ScanStore();

  private saveTimer: number | null = null;
  /** Notified when a save fails (e.g. storage full) so the UI can warn. */
  onError: (msg: string) => void = () => {};
  /** Scenes whose last save failed, so Export can still hand out what the user did
   *  (localStorage holds an older copy, or none at all). */
  private unsaved = new Map<string, SceneData>();
  private persistRequested = false;
  private storageReportCache: { at: number; report: Promise<StorageReport> } | null = null;

  constructor() {
    this.scans.onError = (m) => this.onError(m);
  }

  /**
   * Deletes scan blobs no scene references. Run once at app start: replaced
   * or abandoned scans are deliberately kept during a session (undo can bring
   * them back) and swept on the next launch.
   */
  async pruneOrphanScans(): Promise<void> {
    const referenced = new Set<string>();
    for (const e of this.listScenes()) {
      const s = this.loadScene(e.id);
      if (s?.scan) referenced.add(s.scan.id);
    }
    await this.scans.pruneOrphans(referenced);
  }

  listScenes(): SceneIndexEntry[] {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      const list = raw ? (JSON.parse(raw) as SceneIndexEntry[]) : [];
      return list.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  loadScene(id: string): SceneData | null {
    try {
      const raw = localStorage.getItem(SCENE_PREFIX + id);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return isSceneData(data) ? normalizeScene(data) : null;
    } catch {
      return null;
    }
  }

  /** Loads the current scene, or creates a fresh one. */
  loadCurrentOrCreate(): SceneData {
    const id = localStorage.getItem(CURRENT_KEY);
    if (id) {
      const scene = this.loadScene(id);
      if (scene) return scene;
    }
    const n = this.listScenes().length + 1;
    const scene = createScene(`Scene ${n}`);
    this.saveNow(scene);
    this.setCurrent(scene.id);
    return scene;
  }

  setCurrent(id: string): void {
    // A full quota must not throw out of loadScene halfway through switching
    // scenes (an import that did not fit is still opened, then reported).
    try {
      localStorage.setItem(CURRENT_KEY, id);
    } catch (e) {
      console.warn('[setview] could not record the current scene', e);
    }
  }

  currentId(): string | null {
    return localStorage.getItem(CURRENT_KEY);
  }

  /** Debounced autosave — call on every mutation. */
  markDirty(scene: SceneData): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      this.saveNow(scene);
    }, 800);
  }

  /** Persists a scene. Returns false on failure (e.g. storage full) and fires
   *  onError so the caller can warn the user — silent loss on a headset with no
   *  console is otherwise unrecoverable. */
  saveNow(scene: SceneData): boolean {
    // Cancel any pending debounced save: this write is authoritative, and a
    // stale timer could otherwise overwrite it with an older scene object
    // (e.g. an undo landing inside the 800ms window after a mutation).
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    scene.updatedAt = Date.now();
    try {
      localStorage.setItem(SCENE_PREFIX + scene.id, JSON.stringify(scene));
      const index = this.listScenes().filter((e) => e.id !== scene.id);
      index.push({
        id: scene.id,
        name: scene.name,
        updatedAt: scene.updatedAt,
        actors: scene.actors.length,
        cameras: scene.cameras.length,
        hasScan: !!scene.scan,
      });
      localStorage.setItem(INDEX_KEY, JSON.stringify(index));
      this.unsaved.delete(scene.id);
      return true;
    } catch (e) {
      console.warn('[setview] save failed', e);
      this.unsaved.set(scene.id, scene);
      this.onError('⚠ storage full — Export this scene to JSON to avoid losing it');
      return false;
    }
  }

  /** Renames a scene (updates the stored scene + index). */
  renameScene(id: string, name: string): boolean {
    const scene = this.loadScene(id);
    if (!scene) return false;
    scene.name = name.trim() || scene.name;
    return this.saveNow(scene);
  }

  /** Persists edits made to a scene outside a session (e.g. landing editor). */
  updateScene(scene: SceneData): boolean {
    return this.saveNow(normalizeScene(scene));
  }

  deleteScene(id: string): void {
    this.unsaved.delete(id);
    const scene = this.loadScene(id);
    if (scene?.scan) void this.scans.deleteScan(scene.scan.id);
    localStorage.removeItem(SCENE_PREFIX + id);
    localStorage.setItem(INDEX_KEY, JSON.stringify(this.listScenes().filter((e) => e.id !== id)));
    if (this.currentId() === id) localStorage.removeItem(CURRENT_KEY);
  }

  async duplicateScene(id: string): Promise<SceneData | null> {
    const src = this.loadScene(id);
    if (!src) return null;
    const copy: SceneData = JSON.parse(JSON.stringify(src));
    copy.id = uid();
    copy.name = `${src.name} copy`;
    copy.createdAt = Date.now();
    // New ids so duplicated scenes never share object identity.
    for (const a of copy.actors) a.id = uid();
    for (const c of copy.cameras) c.id = uid();
    if (copy.scan) {
      // Copy the geometry blob under a fresh id so deleting either scene
      // never strands the other's scan.
      const scan = await this.scans.getScan(copy.scan.id);
      if (scan) {
        const dup = { ...scan, id: uid() };
        await this.scans.putScan(dup);
        copy.scan = { ...copy.scan, id: dup.id };
      } else {
        copy.scan = null; // blob missing — don't carry a dangling reference
      }
    }
    this.saveNow(copy);
    return copy;
  }

  /**
   * The freshest copy of a scene to export: the live in-memory scene when it is
   * the one asked for, else a copy whose last save failed, else what localStorage
   * holds. Exporting from localStorage alone handed out a stale scene (or nothing)
   * exactly when the "storage full, Export this scene" warning told the user to.
   */
  sceneForExport(id: string, live?: SceneData | null): SceneData | null {
    if (live && live.id === id) return live;
    return this.unsaved.get(id) ?? this.loadScene(id);
  }

  /** Downloads a scene as .setview.json. Resolves false when there is nothing to export. */
  async exportScene(id: string, live?: SceneData | null): Promise<boolean> {
    const scene = this.sceneForExport(id, live);
    if (!scene) return false;
    const scan = scene.scan ? await this.scans.getScan(scene.scan.id) : null;
    const file = buildSceneFile(scene, scan);
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scene.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.setview.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  }

  /** Downloads a printable top-down blocking floorplan (PNG). */
  exportFloorplan(id: string): void {
    const scene = this.loadScene(id);
    if (scene) downloadFloorplan(scene);
  }

  /** Downloads a Markdown shot list (cameras + blocking). */
  exportShotList(id: string): void {
    const scene = this.loadScene(id);
    if (scene) downloadShotList(scene);
  }

  /** Downloads Wavefront OBJ + MTL 3D scan mesh files. */
  async exportScanObj(id: string): Promise<void> {
    const scene = this.loadScene(id);
    if (!scene?.scan) return;
    const scan = await this.scans.getScan(scene.scan.id);
    if (scan) downloadScanObj(scan, `${scene.name}_scan`);
  }

  /** Downloads Stanford PLY 3D mesh file. */
  async exportScanPly(id: string, binary = false): Promise<void> {
    const scene = this.loadScene(id);
    if (!scene?.scan) return;
    const scan = await this.scans.getScan(scene.scan.id);
    if (scan) downloadScanPly(scan, `${scene.name}_scan`, binary);
  }

  /** Downloads USDA OpenUSD 3D mesh representation. */
  async exportScanUsd(id: string): Promise<void> {
    const scene = this.loadScene(id);
    if (!scene?.scan) return;
    const scan = await this.scans.getScan(scene.scan.id);
    if (scan) downloadScanUsd(scan, `${scene.name}_scan`);
  }

  /** Downloads RFC 7946 2D architectural room and furniture GeoJSON. */
  async exportScanGeoJson(id: string): Promise<void> {
    const scene = this.loadScene(id);
    if (!scene?.scan) return;
    const scan = await this.scans.getScan(scene.scan.id);
    if (scan) downloadScanGeoJson(scan, `${scene.name}_footprint`);
  }

  /** Downloads comprehensive 3D scan deliverable package (OBJ, PLY, USD, GeoJSON). */
  async exportScanPackage(id: string): Promise<void> {
    const scene = this.loadScene(id);
    if (!scene?.scan) return;
    const scan = await this.scans.getScan(scene.scan.id);
    if (scan) downloadLocationScanPackage(scan, `${scene.name}_scan`);
  }

  /**
   * Attaches a synthetic 3D room scan to a scene for desktop scouting & testing.
   * Pass `live` (the in-memory current scene) to attach to that object itself, so
   * every manager bound to it sees the scan; otherwise the stored copy is loaded,
   * which for the current scene could be older than what is in memory.
   */
  async attachSyntheticScan(
    id: string,
    live?: SceneData | null,
    widthM = 6.0,
    depthM = 5.0,
    heightM = 2.8,
    furnitureLabels = ['couch', 'table', 'desk'],
  ): Promise<LocationScan | null> {
    const scan = createSyntheticLocationScan(widthM, depthM, heightM, furnitureLabels);
    await this.scans.putScan(scan);
    // Resolved after the blob write so an edit made meanwhile is not overwritten.
    const scene = live && live.id === id ? live : this.loadScene(id);
    if (!scene) return null;
    scene.scan = summarizeScan(scan);
    this.saveNow(scene);
    this.storageReportCache = null;
    return scan;
  }

  /**
   * Imports a .setview.json file as a new scene. The file is read with
   * arrayBuffer() so a browser that blocks the read (reported on Quest) is told
   * apart from a file that is not a scene. The result says whether the new scene
   * was saved: one that imported but did not fit in storage is lost on reload
   * unless it is exported.
   */
  async importScene(file: File): Promise<SceneImportResult> {
    let buf: ArrayBuffer | null = null;
    try {
      buf = await file.arrayBuffer();
    } catch (e) {
      console.warn('[setview] import read failed', e);
    }
    const text = decodeSceneFileBytes(buf);
    if (text === null) {
      return {
        ok: false,
        reason: 'blocked',
        message: `could not read "${file.name}": the browser returned no data (it blocked the read, or the file is empty)`,
      };
    }
    let parsed: ParsedSceneFile | null = null;
    try {
      parsed = parseSceneFile(text);
    } catch (e) {
      console.warn('[setview] import parse failed', e); // reported as not-a-scene below
    }
    if (!parsed) {
      return { ok: false, reason: 'invalid', message: `"${file.name}" is not a SetView scene file` };
    }
    if (parsed.scan) await this.scans.putScan(parsed.scan);
    if (parsed.scanDropped) this.onError('imported scene had an unreadable scan (geometry dropped)');
    const saved = this.saveNow(parsed.scene);
    this.storageReportCache = null;
    return {
      ok: true,
      scene: parsed.scene,
      saved,
      heavy: file.size >= HEAVY_IMPORT_BYTES || parsed.scan !== null,
    };
  }

  /**
   * Asks the browser once per page to make this origin's storage persistent, so
   * scans, props and scenes are not evicted under storage pressure. Resolves
   * 'already-asked' after the first call and 'unsupported' where the API is missing.
   */
  async requestPersistentStorage(): Promise<'granted' | 'denied' | 'unsupported' | 'already-asked'> {
    if (this.persistRequested) return 'already-asked';
    this.persistRequested = true;
    this.storageReportCache = null;
    try {
      const sm = typeof navigator !== 'undefined' ? navigator.storage : undefined;
      if (!sm || typeof sm.persist !== 'function') return 'unsupported';
      if (typeof sm.persisted === 'function' && (await sm.persisted())) return 'granted';
      return (await sm.persist()) ? 'granted' : 'denied';
    } catch {
      return 'unsupported';
    }
  }

  /** Bytes of SetView data in localStorage (keys and values, UTF-16). */
  localSceneBytes(): number {
    let bytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('setview.')) continue;
        bytes += (key.length + (localStorage.getItem(key)?.length ?? 0)) * 2;
      }
    } catch {
      // Storage access can throw (disabled or sandboxed); report what was counted.
    }
    return bytes;
  }

  /**
   * Storage usage for the landing page. Cached briefly: the landing re-renders on
   * every edit, and measuring reads every scene string and every scan blob size.
   */
  storageReport(maxAgeMs = 10_000): Promise<StorageReport> {
    const now = Date.now();
    if (this.storageReportCache && now - this.storageReportCache.at < maxAgeMs) {
      return this.storageReportCache.report;
    }
    const report = (async (): Promise<StorageReport> => {
      const sceneBytes = this.localSceneBytes();
      const scanBytes = await this.scans.getTotalStorageBytes().catch(() => 0);
      let usageBytes: number | null = null;
      let quotaBytes: number | null = null;
      let persisted: boolean | null = null;
      try {
        const sm = typeof navigator !== 'undefined' ? navigator.storage : undefined;
        if (sm && typeof sm.estimate === 'function') {
          const est = await sm.estimate();
          usageBytes = typeof est.usage === 'number' ? est.usage : null;
          quotaBytes = typeof est.quota === 'number' ? est.quota : null;
        }
        if (sm && typeof sm.persisted === 'function') persisted = await sm.persisted();
      } catch {
        // Estimates are informational; missing ones are simply not shown.
      }
      return { usageBytes, quotaBytes, persisted, sceneBytes, scanBytes };
    })();
    this.storageReportCache = { at: now, report };
    return report;
  }
}
