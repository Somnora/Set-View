// ---------------------------------------------------------------------------
// Scene persistence: localStorage autosave + scene list, JSON export/import.
// No backend — everything stays on the device.
// ---------------------------------------------------------------------------

import { createScene, isSceneData, normalizeScene, uid, type SceneData } from './model.ts';
import { downloadFloorplan, downloadShotList } from './exporters.ts';
import { decodeScan, encodeScan, summarizeScan } from './scan.ts';
import { ScanStore } from './scanStore.ts';

/** Exported scene files optionally embed the scan geometry as base64. */
type SceneFile = SceneData & { scanData?: string };

const INDEX_KEY = 'setview.sceneIndex';
const CURRENT_KEY = 'setview.currentScene';
const SCENE_PREFIX = 'setview.scene.';

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
    localStorage.setItem(CURRENT_KEY, id);
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
      return true;
    } catch (e) {
      console.warn('[setview] save failed', e);
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

  async exportScene(id: string): Promise<void> {
    const scene = this.loadScene(id);
    if (!scene) return;
    const file: SceneFile = { ...scene };
    if (scene.scan) {
      const scan = await this.scans.getScan(scene.scan.id);
      if (scan) file.scanData = encodeScan(scan);
    }
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scene.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.setview.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
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

  async importScene(file: File): Promise<SceneData | null> {
    try {
      const data = JSON.parse(await file.text()) as SceneFile;
      if (!isSceneData(data)) return null;
      normalizeScene(data);
      // Fresh id so an import never clobbers an existing scene.
      data.id = uid();
      data.name = `${data.name} (imported)`;
      // Rehydrate embedded scan geometry into the store (fresh blob id from
      // decodeScan). A summary with no decodable blob is dropped rather than
      // imported dangling.
      const embedded = typeof data.scanData === 'string' ? decodeScan(data.scanData) : null;
      delete data.scanData; // never let megabytes of base64 hit localStorage
      if (embedded) {
        await this.scans.putScan(embedded);
        data.scan = summarizeScan(embedded);
      } else {
        if (data.scan) this.onError('imported scene had an unreadable scan — geometry dropped');
        data.scan = null;
      }
      this.saveNow(data);
      return data;
    } catch {
      return null;
    }
  }
}
