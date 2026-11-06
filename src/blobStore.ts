// ---------------------------------------------------------------------------
// Original-file storage: the bytes of imported locations (and later splats),
// kept so Photo mode can draw the textured model and a later package can carry
// it. Scene JSON, undo snapshots and collab patches carry only the blob id.
//
// A separate IndexedDB database ('setview_blobs'), so the shared 'setview'
// database that scanStore.ts opens never needs a version bump. Records hold a
// Blob, not an ArrayBuffer, so the browser can keep the bytes on disk and a
// listing does not pull hundreds of megabytes into memory.
//
// Degrades like ScanStore: with IndexedDB unavailable or hung, an in-memory
// Map keeps the current session working and onError tells the user. When
// IndexedDB is only slow to open, what was held in memory is written to it
// once it opens (idbOpen.ts).
// ---------------------------------------------------------------------------

import { IdbConnection, type IdbState, type StoreOptions } from './idbOpen.ts';

const DB_NAME = 'setview_blobs';
const DB_VERSION = 1;
const STORE = 'blobs';

export interface BlobRecord {
  id: string;
  data: Blob;
  /** Detected file kind, e.g. 'glb'. */
  format: string;
  /** Original file name, for the UI. */
  name: string;
  size: number;
  createdAt: number;
}

export type BlobMeta = Omit<BlobRecord, 'data'>;

export function newBlobId(): string {
  return `blob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isBlobRecord(v: unknown): v is BlobRecord {
  const r = v as BlobRecord;
  return (
    !!r &&
    typeof r === 'object' &&
    typeof r.id === 'string' &&
    typeof Blob !== 'undefined' &&
    r.data instanceof Blob &&
    typeof r.format === 'string' &&
    typeof r.size === 'number'
  );
}

const metaOf = (r: BlobRecord): BlobMeta => ({
  id: r.id,
  format: r.format,
  name: r.name,
  size: r.size,
  createdAt: r.createdAt,
});

export class BlobStore {
  /** Notified on storage failures so the UI can warn (headsets have no console). */
  onError: (msg: string) => void = () => {};
  /** Notified when originals held in memory reach storage after a late open. */
  onNotice: (msg: string) => void = () => {};

  /** Fallback when IndexedDB is unavailable or not open yet. Everything in it is
   *  written to IndexedDB when the database opens, then dropped from here. */
  private memory = new Map<string, BlobRecord>();
  /**
   * Ids written by this page. The launch prune never deletes them: it decides
   * what is referenced from the scenes saved when it starts, so an original
   * imported while it is still running would otherwise be deleted before any
   * saved scene points at it (seen in the headed import smoke).
   */
  private writtenThisSession = new Set<string>();

  private readonly conn: IdbConnection;

  constructor(opts: StoreOptions = {}) {
    this.conn = new IdbConnection({
      name: DB_NAME,
      version: DB_VERSION,
      upgrade: (db) => {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      },
      onOpen: (db) => this.saveHeld(db),
      timeoutMs: opts.openTimeoutMs,
      factory: opts.indexedDB,
    });
  }

  private open(): Promise<IDBDatabase | null> {
    return this.conn.get();
  }

  /** 'open' when originals can be read; see ScanStore.storageState. */
  get storageState(): IdbState {
    return this.conn.state;
  }

  whenStorageOpens(): Promise<boolean> {
    return this.conn.whenOpen();
  }

  /** Writes the originals held in memory once the database opens (late or reopened). */
  private saveHeld(db: IDBDatabase): void {
    const held = [...this.memory.values()];
    if (held.length === 0) return;
    let reported = false; // a failed request fires both onerror and onabort
    const failed = () => {
      if (reported) return;
      reported = true;
      this.onError('storage opened, but saving the original files held in memory failed (storage full?); they are lost on reload');
    };
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const rec of held) store.put(rec);
      tx.oncomplete = () => {
        for (const rec of held) if (this.memory.get(rec.id) === rec) this.memory.delete(rec.id);
        const n = held.length;
        this.onNotice(`storage opened: ${n === 1 ? 'the original file' : `${n} original files`} held in memory ${n === 1 ? 'is' : 'are'} now saved on this device`);
      };
      tx.onerror = tx.onabort = failed;
    } catch {
      failed();
    }
  }

  /**
   * Stores bytes under a new id (or the given one). Resolves the record's id and
   * whether it reached persistent storage; when it did not, the bytes are kept
   * in memory for this session and onError fires.
   */
  async putBlob(input: {
    id?: string;
    data: Blob | ArrayBuffer | Uint8Array;
    format: string;
    name?: string;
  }): Promise<{ id: string; saved: boolean }> {
    const data = input.data instanceof Blob ? input.data : new Blob([input.data as BlobPart]);
    const rec: BlobRecord = {
      id: input.id ?? newBlobId(),
      data,
      format: input.format,
      name: input.name ?? '',
      size: data.size,
      createdAt: Date.now(),
    };
    this.writtenThisSession.add(rec.id);
    const db = await this.open();
    if (!db) {
      this.memory.set(rec.id, rec);
      this.onError(
        this.conn.state === 'waiting'
          ? 'storage is slow to open: the original file is held in memory and saved when it opens'
          : 'original file kept in memory only (storage unavailable); it is lost on reload',
      );
      return { id: rec.id, saved: false };
    }
    return new Promise((resolve) => {
      const fail = () => {
        this.memory.set(rec.id, rec);
        this.onError('saving the original file failed (storage full?); it is kept in memory until reload');
        resolve({ id: rec.id, saved: false });
      };
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(rec);
        tx.oncomplete = () => resolve({ id: rec.id, saved: true });
        tx.onerror = tx.onabort = fail;
      } catch {
        fail();
      }
    });
  }

  /** The record (with its Blob), or null when missing or unreadable. */
  async getBlob(id: string): Promise<BlobRecord | null> {
    const mem = this.memory.get(id);
    if (mem) return mem;
    const db = await this.open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
        req.onsuccess = () => resolve(isBlobRecord(req.result) ? req.result : null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  /** The stored bytes, or null. Reads the Blob into memory, so call it only to parse. */
  async getBytes(id: string): Promise<ArrayBuffer | null> {
    const rec = await this.getBlob(id);
    if (!rec) return null;
    try {
      return await rec.data.arrayBuffer();
    } catch (e) {
      console.warn('[setview] reading a stored original failed', e);
      return null;
    }
  }

  async hasBlob(id: string): Promise<boolean> {
    return (await this.getBlob(id)) !== null;
  }

  async deleteBlob(id: string): Promise<void> {
    this.memory.delete(id);
    const db = await this.open();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Metadata of every stored blob. Walks a cursor: each record's Blob is a
   * handle, so this does not read the bytes.
   */
  async listMeta(): Promise<BlobMeta[]> {
    const out = new Map<string, BlobMeta>();
    for (const r of this.memory.values()) out.set(r.id, metaOf(r));
    const db = await this.open();
    if (!db) return [...out.values()];
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) {
            resolve([...out.values()]);
            return;
          }
          if (isBlobRecord(cur.value)) out.set(cur.value.id, metaOf(cur.value));
          cur.continue();
        };
        req.onerror = () => resolve([...out.values()]);
      } catch {
        resolve([...out.values()]);
      }
    });
  }

  async getTotalBytes(): Promise<number> {
    let total = 0;
    for (const m of await this.listMeta()) total += m.size;
    return total;
  }

  /**
   * Deletes blobs no scene references. Run once at app start, never mid-session:
   * undo can bring back a scene state that references a replaced original.
   * Blobs written during this session are never pruned (see writtenThisSession).
   */
  async pruneOrphans(referencedIds: ReadonlySet<string>): Promise<number> {
    let removed = 0;
    for (const m of await this.listMeta()) {
      if (!referencedIds.has(m.id) && !this.writtenThisSession.has(m.id)) {
        await this.deleteBlob(m.id);
        removed++;
      }
    }
    return removed;
  }
}
