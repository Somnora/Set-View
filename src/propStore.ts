// ---------------------------------------------------------------------------
// Prop & 3D Set Asset Blob Storage (IndexedDB + Session Memory Fallback)
//
// Manages binary 3D model files (GLB, GLTF, OBJ, USDZ) uploaded by directors:
//   - IndexedDB object store ('setview_props') with graceful in-memory fallback
//   - Blob URL lifecycle management and automatic cleanup
//   - Custom asset metadata registry (dimensions, vertex count, file size)
// ---------------------------------------------------------------------------

import { IdbConnection, type IdbState, type StoreOptions } from './idbOpen.ts';
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

/** An asset without its model bytes, for listings. */
export type CustomPropAssetMeta = Omit<CustomPropAsset, 'buffer'>;

export function assetMeta(a: CustomPropAsset): CustomPropAssetMeta {
  return {
    id: a.id,
    name: a.name,
    fileName: a.fileName,
    fileType: a.fileType,
    category: a.category,
    dimensions: a.dimensions,
    sizeBytes: a.sizeBytes,
    uploadedAt: a.uploadedAt,
  };
}

const DB_NAME = 'setview_assets';
const DB_VERSION = 1;
const STORE_NAME = 'custom_props';

export class PropStore {
  onError: (msg: string) => void = () => {};
  /** Notified when props held in memory reach storage after a late open. */
  onNotice: (msg: string) => void = () => {};

  /** Session cache of assets, and the fallback when IndexedDB is not open. */
  private memory = new Map<string, CustomPropAsset>();
  /** Ids in `memory` that never reached IndexedDB; written when it opens. */
  private held = new Set<string>();
  private blobUrlCache = new Map<string, string>();
  private readonly conn: IdbConnection;

  constructor(opts: StoreOptions = {}) {
    this.conn = new IdbConnection({
      name: DB_NAME,
      version: DB_VERSION,
      upgrade: (db) => {
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      },
      onOpen: (db) => this.saveHeld(db),
      timeoutMs: opts.openTimeoutMs,
      factory: opts.indexedDB,
    });
  }

  /** 'open' when assets can be read; see ScanStore.storageState. */
  get storageState(): IdbState {
    return this.conn.state;
  }

  whenStorageOpens(): Promise<boolean> {
    return this.conn.whenOpen();
  }

  /** Writes the props held in memory once the database opens (late or reopened). */
  private saveHeld(db: IDBDatabase): void {
    const assets = [...this.held].map((id) => this.memory.get(id)).filter((a): a is CustomPropAsset => !!a);
    if (assets.length === 0) return;
    let reported = false; // a failed request fires both onerror and onabort
    const failed = () => {
      if (reported) return;
      reported = true;
      this.onError('storage opened, but saving the props held in memory failed (storage full?)');
    };
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const a of assets) store.put(a);
      tx.oncomplete = () => {
        for (const a of assets) if (this.memory.get(a.id) === a) this.held.delete(a.id);
        const n = assets.length;
        this.onNotice(`storage opened: ${n === 1 ? 'the custom prop' : `${n} custom props`} held in memory ${n === 1 ? 'is' : 'are'} now saved on this device`);
      };
      tx.onerror = tx.onabort = failed;
    } catch {
      failed();
    }
  }

  private open(): Promise<IDBDatabase | null> {
    return this.conn.get();
  }

  /** Saves a custom 3D model asset. */
  async putAsset(asset: CustomPropAsset): Promise<boolean> {
    const db = await this.open();
    if (!db) {
      this.memory.set(asset.id, asset);
      this.held.add(asset.id);
      this.onError(
        this.conn.state === 'waiting'
          ? 'storage is slow to open: the prop is held in memory and saved when it opens'
          : 'Prop kept in session memory only (IndexedDB storage unavailable)',
      );
      return false;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(asset);
        tx.oncomplete = () => {
          this.memory.set(asset.id, asset);
          this.held.delete(asset.id);
          resolve(true);
        };
        tx.onerror = tx.onabort = () => {
          this.memory.set(asset.id, asset);
          this.held.add(asset.id);
          this.onError('Failed saving prop to IndexedDB, fallback to memory');
          resolve(false);
        };
      } catch {
        this.memory.set(asset.id, asset);
        this.held.add(asset.id);
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
    this.held.delete(id);
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

  /**
   * Metadata of every custom asset, without keeping any model bytes. Walks a
   * cursor, so each record is read and dropped in turn: peak memory is one
   * asset, not all of them, and nothing is added to the session cache (unlike
   * listAssets, whose getAll holds every upload at once).
   */
  async listAssetMeta(): Promise<CustomPropAssetMeta[]> {
    const out = new Map<string, CustomPropAssetMeta>();
    for (const a of this.memory.values()) out.set(a.id, assetMeta(a));
    const db = await this.open();
    if (!db) return [...out.values()];
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) {
            resolve([...out.values()]);
            return;
          }
          const a = cur.value as CustomPropAsset;
          if (a && typeof a.id === 'string') out.set(a.id, assetMeta(a));
          cur.continue();
        };
        req.onerror = () => resolve([...out.values()]);
      } catch {
        resolve([...out.values()]);
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
    this.held.clear();
  }
}

export const globalPropStore = new PropStore();
