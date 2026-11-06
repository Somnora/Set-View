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
// Map keeps the current session working and onError tells the user.
// ---------------------------------------------------------------------------

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

  private dbPromise: Promise<IDBDatabase | null> | null = null;
  /** Fallback when IndexedDB is unavailable (session lifetime only). */
  private memory = new Map<string, BlobRecord>();
  /**
   * Ids written by this page. The launch prune never deletes them: it decides
   * what is referenced from the scenes saved when it starts, so an original
   * imported while it is still running would otherwise be deleted before any
   * saved scene points at it (seen in the headed import smoke).
   */
  private writtenThisSession = new Set<string>();

  private open(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      try {
        // Watchdog: some environments never fire any event on the open request.
        const watchdog = setTimeout(() => resolve(null), 4000);
        const done = (db: IDBDatabase | null) => {
          clearTimeout(watchdog);
          resolve(db);
        };
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
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
      this.onError('original file kept in memory only (storage unavailable); it is lost on reload');
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
