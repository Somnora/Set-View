// ---------------------------------------------------------------------------
// Prop & 3D Set Asset Blob Storage (IndexedDB + Session Memory Fallback)
//
// Manages binary 3D model files (GLB, GLTF, OBJ, USDZ) uploaded by directors:
//   - IndexedDB object store ('setview_props') with graceful in-memory fallback
//   - Blob URL lifecycle management and automatic cleanup
//   - Custom asset metadata registry (dimensions, vertex count, file size)
// ---------------------------------------------------------------------------

import type { PropCategory, PropDimensions } from './props.ts';

export interface CustomPropAsset {
  id: string;
  name: string;
  fileName: string;
  fileType: 'glb' | 'gltf' | 'obj' | 'usdz' | 'unknown';
  category: PropCategory;
  dimensions: PropDimensions;
  sizeBytes: number;
  uploadedAt: number;
  /** Binary buffer of the 3D model. */
  buffer: ArrayBuffer;
}

const DB_NAME = 'setview_assets';
const DB_VERSION = 1;
const STORE_NAME = 'custom_props';

export class PropStore {
  onError: (msg: string) => void = () => {};

  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private memory = new Map<string, CustomPropAsset>();
  private blobUrlCache = new Map<string, string>();

  private open(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      try {
        const watchdog = setTimeout(() => resolve(null), 4000);
        const done = (db: IDBDatabase | null) => {
          clearTimeout(watchdog);
          resolve(db);
        };
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE_NAME)) {
            req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => {
          req.result.onclose = () => {
            this.dbPromise = null;
          };
          done(req.result);
        };
        req.onerror = () => done(null);
        req.onblocked = () => done(null);
      } catch {
        resolve(null);
      }
    });
    return this.dbPromise;
  }

  /** Saves a custom 3D model asset. */
  async putAsset(asset: CustomPropAsset): Promise<boolean> {
    const db = await this.open();
    if (!db) {
      this.memory.set(asset.id, asset);
      this.onError('Prop kept in session memory only (IndexedDB storage unavailable)');
      return false;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(asset);
        tx.oncomplete = () => {
          this.memory.set(asset.id, asset);
          resolve(true);
        };
        tx.onerror = tx.onabort = () => {
          this.memory.set(asset.id, asset);
          this.onError('Failed saving prop to IndexedDB, fallback to memory');
          resolve(false);
        };
      } catch {
        this.memory.set(asset.id, asset);
        resolve(false);
      }
    });
  }

  /** Retrieves a custom 3D model asset by ID. */
  async getAsset(id: string): Promise<CustomPropAsset | null> {
    const mem = this.memory.get(id);
    if (mem) return mem;
    const db = await this.open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
        req.onsuccess = () => {
          if (req.result) {
            this.memory.set(id, req.result);
            resolve(req.result as CustomPropAsset);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /** Deletes a custom asset from storage. */
  async deleteAsset(id: string): Promise<void> {
    this.memory.delete(id);
    const cachedUrl = this.blobUrlCache.get(id);
    if (cachedUrl) {
      URL.revokeObjectURL(cachedUrl);
      this.blobUrlCache.delete(id);
    }
    const db = await this.open();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /** Lists all available custom assets. */
  async listAssets(): Promise<CustomPropAsset[]> {
    const db = await this.open();
    if (!db) return Array.from(this.memory.values());
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
        req.onsuccess = () => {
          const list = (req.result || []) as CustomPropAsset[];
          for (const a of list) this.memory.set(a.id, a);
          resolve(list);
        };
        req.onerror = () => resolve(Array.from(this.memory.values()));
      } catch {
        resolve(Array.from(this.memory.values()));
      }
    });
  }

  /** Creates or retrieves a temporary object URL for Three.js GLTFLoader/OBJLoader. */
  async getAssetBlobUrl(id: string): Promise<string | null> {
    if (this.blobUrlCache.has(id)) {
      return this.blobUrlCache.get(id)!;
    }
    const asset = await this.getAsset(id);
    if (!asset || !asset.buffer) return null;

    let mime = 'model/gltf-binary';
    if (asset.fileType === 'obj') mime = 'text/plain';
    else if (asset.fileType === 'gltf') mime = 'model/gltf+json';

    const blob = new Blob([asset.buffer], { type: mime });
    const url = URL.createObjectURL(blob);
    this.blobUrlCache.set(id, url);
    return url;
  }

  /** Saves an uploaded user File as a CustomPropAsset. */
  async saveAssetFromFile(file: File): Promise<CustomPropAsset | null> {
    try {
      const buffer = await file.arrayBuffer();
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      let fileType: 'glb' | 'gltf' | 'obj' | 'usdz' | 'unknown' = 'unknown';
      if (ext === 'glb') fileType = 'glb';
      else if (ext === 'gltf') fileType = 'gltf';
      else if (ext === 'obj') fileType = 'obj';
      else if (ext === 'usdz') fileType = 'usdz';

      const id = `custom-asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');

      const asset: CustomPropAsset = {
        id,
        name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
        fileName: file.name,
        fileType,
        category: 'custom',
        dimensions: { width: 1.0, height: 1.0, depth: 1.0 },
        sizeBytes: buffer.byteLength,
        uploadedAt: Date.now(),
        buffer,
      };

      await this.putAsset(asset);
      return asset;
    } catch {
      this.onError(`Failed to read 3D asset file: ${file.name}`);
      return null;
    }
  }

  /** Cleans up all cached blob URLs on teardown. */
  dispose(): void {
    for (const url of this.blobUrlCache.values()) {
      URL.revokeObjectURL(url);
    }
    this.blobUrlCache.clear();
    this.memory.clear();
  }
}

export const globalPropStore = new PropStore();
