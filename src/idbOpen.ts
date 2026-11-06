// ---------------------------------------------------------------------------
// One IndexedDB connection whose time limit is not final.
//
// Opening IndexedDB can take seconds on a busy first page load, and some
// environments never answer at all (headless Chrome on macOS). So a caller
// waits at most `timeoutMs` (4 s), then gets null and uses its store's memory
// fallback. That null used to be final for the session: an open that finished
// late was ignored, scans saved earlier could not be read, and every new one
// stayed in memory and was lost on reload.
//
// Now the open request keeps running. Callers that arrive after the limit get
// null at once (they never wait twice). When the database does open, every
// later call gets it and `onOpen` runs, so a store can write what it held in
// memory. A failed open, or a connection the browser closes (eviction), is
// tried again on the next call.
//
// No three, no DOM: tests pass a fake IndexedDB (test/fake-indexeddb.ts).
// ---------------------------------------------------------------------------

export type IdbState =
  /** Not opened yet, or the last open failed or the browser closed it: the next call opens. */
  | 'closed'
  /** An open is running and callers wait for it, up to the time limit. */
  | 'opening'
  /** An open is running past the limit (or is blocked by another tab): callers get null at once. */
  | 'waiting'
  | 'open'
  /** This browser has no IndexedDB. */
  | 'unavailable';

export const IDB_OPEN_TIMEOUT_MS = 4000;

export interface IdbOpenOptions {
  name: string;
  version: number;
  /** Creates the object stores (runs in onupgradeneeded). */
  upgrade: (db: IDBDatabase) => void;
  /** Runs each time the database opens, including after callers were told it was unavailable. */
  onOpen?: (db: IDBDatabase) => void;
  /** How long callers wait for an open before falling back. Default IDB_OPEN_TIMEOUT_MS. */
  timeoutMs?: number;
  /** IndexedDB itself. Omitted: the global, read when an open starts. null: none. */
  factory?: IDBFactory | null;
}

/** Constructor options of the stores built on a connection (scan, blob, prop). */
export interface StoreOptions {
  /** IndexedDB itself; defaults to the browser's. Tests pass a fake. */
  indexedDB?: IDBFactory | null;
  /** How long the first callers wait for IndexedDB to open (default 4 s). */
  openTimeoutMs?: number;
}

export class IdbConnection {
  private readonly opts: IdbOpenOptions;
  private stateValue: IdbState = 'closed';
  private db: IDBDatabase | null = null;
  /** The running open; settles with the database (or null on failure) when the request does. */
  private request: Promise<IDBDatabase | null> | null = null;
  /** What callers wait on: the running open or the time limit, whichever comes first. */
  private bounded: Promise<IDBDatabase | null> | null = null;

  constructor(opts: IdbOpenOptions) {
    this.opts = opts;
  }

  get state(): IdbState {
    return this.stateValue;
  }

  /**
   * The database, or null when it is not open. Waits for an open in progress
   * until the time limit; past it, answers null at once while the open keeps
   * running.
   */
  get(): Promise<IDBDatabase | null> {
    if (this.db) return Promise.resolve(this.db);
    if (!this.request) this.start();
    if (this.stateValue === 'waiting' || !this.bounded) return Promise.resolve(null);
    return this.bounded;
  }

  /**
   * Resolves true once the database opens (at once if it is open), false when
   * the open fails or there is no IndexedDB. No time limit: in a browser that
   * never answers it stays pending.
   */
  whenOpen(): Promise<boolean> {
    if (this.db) return Promise.resolve(true);
    if (!this.request) this.start();
    return this.request ? this.request.then((db) => db !== null) : Promise.resolve(false);
  }

  private start(): void {
    const factory =
      this.opts.factory !== undefined ? this.opts.factory : typeof indexedDB === 'undefined' ? null : indexedDB;
    if (!factory) {
      this.stateValue = 'unavailable';
      return;
    }
    this.stateValue = 'opening';
    let settleRequest!: (db: IDBDatabase | null) => void;
    let settleBounded!: (db: IDBDatabase | null) => void;
    const request = new Promise<IDBDatabase | null>((r) => (settleRequest = r));
    this.request = request;
    this.bounded = new Promise<IDBDatabase | null>((r) => (settleBounded = r));

    // Past the limit, or blocked by another tab holding an older version open:
    // callers fall back now, and the request is left to finish.
    const giveUpForNow = (): void => {
      if (this.request !== request || this.stateValue !== 'opening') return;
      this.stateValue = 'waiting';
      settleBounded(null);
    };
    const timer = setTimeout(giveUpForNow, this.opts.timeoutMs ?? IDB_OPEN_TIMEOUT_MS);

    const finish = (db: IDBDatabase | null): void => {
      clearTimeout(timer);
      if (this.request !== request) return;
      if (db) {
        this.db = db;
        this.stateValue = 'open';
        db.onclose = () => {
          if (this.db !== db) return;
          this.db = null;
          this.request = null;
          this.bounded = null;
          this.stateValue = 'closed';
        };
        try {
          this.opts.onOpen?.(db);
        } catch (e) {
          console.warn('[setview] IndexedDB onOpen failed', e);
        }
      } else {
        this.request = null;
        this.bounded = null;
        this.stateValue = 'closed';
      }
      settleBounded(db); // no effect when the limit already answered null
      settleRequest(db);
    };

    try {
      const req = factory.open(this.opts.name, this.opts.version);
      req.onupgradeneeded = () => this.opts.upgrade(req.result);
      req.onsuccess = () => finish(req.result);
      req.onerror = () => finish(null);
      req.onblocked = giveUpForNow;
    } catch {
      finish(null);
    }
  }
}
