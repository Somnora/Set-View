// ---------------------------------------------------------------------------
// Scan blob storage: IndexedDB keyed by scan id. Location scans are megabytes
// of Float32Array — far beyond the localStorage quota the scene JSON lives in,
// so geometry is stored here and SceneData carries only a ScanSummary.
//
// Everything degrades gracefully: if IndexedDB is unavailable (private mode,
// storage pressure) an in-memory Map keeps the current session working and
// the caller's summary still round-trips through file export.
// ---------------------------------------------------------------------------

import { isLocationScan, type LocationScan } from './scan.ts';

const DB_NAME = 'setview';
const DB_VERSION = 1;
const STORE = 'scans';

export class ScanStore {
  /** Notified on storage failures so the UI can warn (headsets have no console). */
  onError: (msg: string) => void = () => {};

  private dbPromise: Promise<IDBDatabase | null> | null = null;
  /** Fallback when IndexedDB is unavailable — session-lifetime only. */
  private memory = new Map<string, LocationScan>();

  private open(): Promise<IDBDatabase | null> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      try {
        // Watchdog: some environments (observed: headless Chrome on macOS)
        // never fire ANY event on the open request. A hung open must degrade
        // to the memory fallback, not wedge every scan load/save forever.
        const watchdog = setTimeout(() => resolve(null), 4000);
        const done = (db: IDBDatabase | null) => {
          clearTimeout(watchdog);
          resolve(db);
        };
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        };
        req.onsuccess = () => {
          // If the DB dies mid-session (eviction), fall back to memory.
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

  /** Stores a scan under its id. Resolves false (and fires onError) on failure. */
  async putScan(scan: LocationScan): Promise<boolean> {
    const db = await this.open();
    if (!db) {
      this.memory.set(scan.id, scan);
      this.onError('scan kept in memory only — storage unavailable; Export the scene to keep it');
      return false;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(scan, scan.id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = tx.onabort = () => {
          this.memory.set(scan.id, scan);
          this.onError('scan save failed — kept in memory; Export the scene to keep it');
          resolve(false);
        };
      } catch {
        this.memory.set(scan.id, scan);
        this.onError('scan save failed — kept in memory; Export the scene to keep it');
        resolve(false);
      }
    });
  }

  /** Loads a scan by id; null when missing or unreadable. */
  async getScan(id: string): Promise<LocationScan | null> {
    const mem = this.memory.get(id);
    if (mem) return mem;
    const db = await this.open();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
        req.onsuccess = () => resolve(isLocationScan(req.result) ? req.result : null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async deleteScan(id: string): Promise<void> {
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

  /** Ids of every stored scan blob. */
  async listScanIds(): Promise<string[]> {
    const ids = new Set<string>(this.memory.keys());
    const db = await this.open();
    if (!db) return [...ids];
    return new Promise((resolve) => {
      try {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
        req.onsuccess = () => {
          for (const k of req.result) if (typeof k === 'string') ids.add(k);
          resolve([...ids]);
        };
        req.onerror = () => resolve([...ids]);
      } catch {
        resolve([...ids]);
      }
    });
  }

  /**
   * Deletes blobs not referenced by any scene. Run once at app start —
   * replaced/abandoned scans (e.g. re-scan then undo, deleted scenes) are left
   * behind deliberately during the session so undo keeps working, and swept
   * here on the next launch.
   */
  async pruneOrphans(referencedIds: ReadonlySet<string>): Promise<number> {
    const ids = await this.listScanIds();
    let removed = 0;
    for (const id of ids) {
      if (!referencedIds.has(id)) {
        await this.deleteScan(id);
        removed++;
      }
    }
    return removed;
  }
}
