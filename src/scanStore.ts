// ---------------------------------------------------------------------------
// Scan blob storage: IndexedDB keyed by scan id. Location scans are megabytes
// of Float32Array (far beyond the localStorage quota the scene JSON lives in),
// so geometry is stored here and SceneData carries only a ScanSummary.
//
// Everything degrades gracefully: if IndexedDB is unavailable (private mode,
// storage pressure) an in-memory Map keeps the current session working and
// the caller summary still round-trips through file export. When IndexedDB is
// only slow to open, the scans held in memory are written to it once it opens
// (idbOpen.ts), and callers can tell "storage not open" from "scan missing".
// ---------------------------------------------------------------------------

import { IdbConnection, type IdbState, type StoreOptions } from './idbOpen.ts';
import { isLocationScan, type LocationScan } from './scan.ts';

const DB_NAME = 'setview';
const DB_VERSION = 1;
const STORE = 'scans';

/** Calculates memory and disk footprint of a LocationScan in bytes. */
export function estimateScanSizeBytes(scan: LocationScan): number {
  let bytes = 64; // base object overhead
  for (const m of scan.meshes) {
    bytes += 32; // mesh descriptor overhead
    bytes += m.label.length * 2;
    bytes += m.positions.byteLength;
    bytes += m.indices.byteLength;
  }
  return bytes;
}

export class ScanStore {
  /** Notified on storage failures so the UI can warn (headsets have no console). */
  onError: (msg: string) => void = () => {};
  /** Notified when scans held in memory reach storage after a late open. */
  onNotice: (msg: string) => void = () => {};

  /** Fallback when IndexedDB is unavailable or not open yet. Everything in it is
   *  written to IndexedDB when the database opens, then dropped from here. */
  private memory = new Map<string, LocationScan>();
  /** Sizes already measured by putScan or getTotalStorageBytes. A blob never changes
   *  under its id (every capture, import and duplicate gets a fresh one), so a size
   *  stays valid. */
  private sizeCache = new Map<string, number>();

  private readonly conn: IdbConnection;

  constructor(opts: StoreOptions = {}) {
    this.conn = new IdbConnection({
      name: DB_NAME,
      version: DB_VERSION,
      upgrade: (db) => {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      },
      onOpen: (db) => this.saveHeld(db),
      timeoutMs: opts.openTimeoutMs,
      factory: opts.indexedDB,
    });
  }

  private open(): Promise<IDBDatabase | null> {
    return this.conn.get();
  }

  /** 'open' when scans can be read. Anything else means a null from getScan is
   *  not proof the scan is gone: storage is slow, failed, or absent. */
  get storageState(): IdbState {
    return this.conn.state;
  }

  /** Resolves true once storage opens (at once when open), false when it cannot. */
  whenStorageOpens(): Promise<boolean> {
    return this.conn.whenOpen();
  }

  /** Writes the scans held in memory once the database opens (late or reopened). */
  private saveHeld(db: IDBDatabase): void {
    const held = [...this.memory.values()];
    if (held.length === 0) return;
    let reported = false; // a failed request fires both onerror and onabort
    const failed = () => {
      if (reported) return;
      reported = true;
      this.onError('storage opened, but saving the scans held in memory failed (storage full?); Export the scene to keep them');
    };
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const scan of held) store.put(scan, scan.id);
      tx.oncomplete = () => {
        for (const scan of held) if (this.memory.get(scan.id) === scan) this.memory.delete(scan.id);
        const n = held.length;
        this.onNotice(`storage opened: ${n === 1 ? 'the scan' : `${n} scans`} held in memory ${n === 1 ? 'is' : 'are'} now saved on this device`);
      };
      tx.onerror = tx.onabort = failed;
    } catch {
      failed();
    }
  }

  /** Stores a scan under its id. Resolves false (and fires onError) on failure. */
  async putScan(scan: LocationScan): Promise<boolean> {
    // Measured now, while the scan is in hand, so getTotalStorageBytes never reads
    // a blob this page wrote back from IndexedDB just to size it (in AR that is a
    // full read and decode of a fresh capture). Valid on every path below: the
    // blob lands in IndexedDB or in the memory fallback under this same id.
    this.sizeCache.set(scan.id, estimateScanSizeBytes(scan));
    const db = await this.open();
    if (!db) {
      this.memory.set(scan.id, scan);
      this.onError(
        this.conn.state === 'waiting'
          ? 'storage is slow to open: the scan is held in memory and saved when it opens (Export the scene to be safe)'
          : 'scan kept in memory only (storage unavailable); Export the scene to keep it',
      );
      return false;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(scan, scan.id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = tx.onabort = () => {
          this.memory.set(scan.id, scan);
          this.onError('scan save failed (kept in memory); Export the scene to keep it');
          resolve(false);
        };
      } catch {
        this.memory.set(scan.id, scan);
        this.onError('scan save failed (kept in memory); Export the scene to keep it');
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

  /** Deletes a scan from both persistent storage and memory cache. */
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

  /** Returns approximate storage size of a specific scan in bytes. */
  async getScanSizeBytes(id: string): Promise<number> {
    const scan = await this.getScan(id);
    return scan ? estimateScanSizeBytes(scan) : 0;
  }

  /** Returns total approximate byte size of all scans in storage. A blob this page
   *  did not write is read once to measure it; later calls only list the ids. */
  async getTotalStorageBytes(): Promise<number> {
    const ids = await this.listScanIds();
    let total = 0;
    for (const id of ids) {
      let size = this.sizeCache.get(id);
      if (size === undefined) {
        size = await this.getScanSizeBytes(id);
        if (size > 0) this.sizeCache.set(id, size);
      }
      total += size;
    }
    return total;
  }

  /**
   * Deletes blobs not referenced by any scene. Run once at app start:
   * replaced or abandoned scans (e.g. re-scan then undo, deleted scenes) are left
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

  /** Clears all scans in both storage and memory cache. */
  async clearAllScans(): Promise<void> {
    this.memory.clear();
    const db = await this.open();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
