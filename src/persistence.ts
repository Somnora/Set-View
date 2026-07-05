// ---------------------------------------------------------------------------
// Scene persistence: localStorage autosave + scene list, JSON export/import.
// No backend — everything stays on the device.
// ---------------------------------------------------------------------------

import { createScene, isSceneData, uid, type SceneData } from './model.ts';

const INDEX_KEY = 'setview.sceneIndex';
const CURRENT_KEY = 'setview.currentScene';
const SCENE_PREFIX = 'setview.scene.';

export interface SceneIndexEntry {
  id: string;
  name: string;
  updatedAt: number;
  actors: number;
  cameras: number;
}

export class Persistence {
  private saveTimer: number | null = null;

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
      return isSceneData(data) ? data : null;
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

  saveNow(scene: SceneData): void {
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
      });
      localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch (e) {
      console.warn('[setview] save failed', e);
    }
  }

  deleteScene(id: string): void {
    localStorage.removeItem(SCENE_PREFIX + id);
    localStorage.setItem(INDEX_KEY, JSON.stringify(this.listScenes().filter((e) => e.id !== id)));
    if (this.currentId() === id) localStorage.removeItem(CURRENT_KEY);
  }

  duplicateScene(id: string): SceneData | null {
    const src = this.loadScene(id);
    if (!src) return null;
    const copy: SceneData = JSON.parse(JSON.stringify(src));
    copy.id = uid();
    copy.name = `${src.name} copy`;
    copy.createdAt = Date.now();
    // New ids so duplicated scenes never share object identity.
    for (const a of copy.actors) a.id = uid();
    for (const c of copy.cameras) c.id = uid();
    this.saveNow(copy);
    return copy;
  }

  exportScene(id: string): void {
    const scene = this.loadScene(id);
    if (!scene) return;
    const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scene.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.setview.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async importScene(file: File): Promise<SceneData | null> {
    try {
      const data = JSON.parse(await file.text());
      if (!isSceneData(data)) return null;
      // Fresh id so an import never clobbers an existing scene.
      data.id = uid();
      data.name = `${data.name} (imported)`;
      this.saveNow(data);
      return data;
    } catch {
      return null;
    }
  }
}
