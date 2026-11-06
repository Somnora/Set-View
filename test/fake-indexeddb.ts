// A small in-memory IndexedDB for Node tests of the on-device stores
// (scanStore.ts, blobStore.ts, propStore.ts, idbOpen.ts). It covers what they
// call: open with an upgrade, transactions, put/get/delete/clear, getAll,
// getAllKeys and openCursor. Every request answers on a later task, as in a
// browser. Values are copied with structuredClone, as IndexedDB copies them.
//
// Open can be held back to act out a slow or hung IndexedDB: hold(), then
// release() (the open succeeds), fail() (it errors) or block() (another tab
// holds an older version; the open stays pending). Data survives across
// connections, so a second store on the same fake is a later session.

type Handler = ((ev: unknown) => void) | null;

interface FakeRequest {
  result: unknown;
  error: unknown;
  onsuccess: Handler;
  onerror: Handler;
}

interface FakeOpenRequest extends FakeRequest {
  onblocked: Handler;
  onupgradeneeded: Handler;
}

interface StoreData {
  keyPath: string | null;
  rows: Map<string, unknown>;
}

interface DbData {
  version: number;
  stores: Map<string, StoreData>;
}

const later = (fn: () => void): void => {
  setTimeout(fn, 0);
};

const newRequest = (): FakeRequest => ({ result: undefined, error: null, onsuccess: null, onerror: null });

class FakeTransaction {
  oncomplete: Handler = null;
  onerror: Handler = null;
  onabort: Handler = null;
  pending = 0;
  private finished = false;
  private readonly conn: FakeConnection;

  constructor(conn: FakeConnection) {
    this.conn = conn;
    this.settle(); // a transaction with no requests still completes
  }

  objectStore(name: string): FakeObjectStore {
    const data = this.conn.data.stores.get(name);
    if (!data) throw new Error(`NotFoundError: no object store "${name}"`);
    return new FakeObjectStore(this, data);
  }

  /** Runs one request on a later task, then completes the transaction once nothing is pending. */
  run(op: () => unknown): FakeRequest {
    const req = newRequest();
    this.pending++;
    later(() => {
      req.result = op();
      this.pending--;
      req.onsuccess?.({ target: req });
      this.settle();
    });
    return req;
  }

  settle(): void {
    later(() => {
      if (this.finished || this.pending > 0) return;
      this.finished = true;
      this.oncomplete?.({});
    });
  }
}

class FakeObjectStore {
  private readonly tx: FakeTransaction;
  private readonly data: StoreData;

  constructor(tx: FakeTransaction, data: StoreData) {
    this.tx = tx;
    this.data = data;
  }

  put(value: unknown, key?: string): FakeRequest {
    const k = key ?? (this.data.keyPath ? String((value as Record<string, unknown>)[this.data.keyPath]) : '');
    const copy = structuredClone(value);
    return this.tx.run(() => {
      this.data.rows.set(k, copy);
      return k;
    });
  }

  get(key: string): FakeRequest {
    return this.tx.run(() => (this.data.rows.has(key) ? structuredClone(this.data.rows.get(key)) : undefined));
  }

  delete(key: string): FakeRequest {
    return this.tx.run(() => {
      this.data.rows.delete(key);
      return undefined;
    });
  }

  clear(): FakeRequest {
    return this.tx.run(() => {
      this.data.rows.clear();
      return undefined;
    });
  }

  getAll(): FakeRequest {
    return this.tx.run(() => [...this.data.rows.values()].map((v) => structuredClone(v)));
  }

  getAllKeys(): FakeRequest {
    return this.tx.run(() => [...this.data.rows.keys()]);
  }

  openCursor(): FakeRequest {
    const rows = [...this.data.rows.entries()];
    const req = newRequest();
    const tx = this.tx;
    let i = 0;
    tx.pending++;
    const step = (): void =>
      later(() => {
        if (i < rows.length) {
          const [key, value] = rows[i++];
          req.result = { key, value: structuredClone(value), continue: step };
          req.onsuccess?.({ target: req });
        } else {
          req.result = null;
          tx.pending--;
          req.onsuccess?.({ target: req });
          tx.settle();
        }
      });
    step();
    return req;
  }
}

class FakeConnection {
  onclose: Handler = null;
  closed = false;
  readonly data: DbData;
  readonly objectStoreNames: { contains(name: string): boolean };

  constructor(data: DbData) {
    this.data = data;
    this.objectStoreNames = { contains: (name: string) => data.stores.has(name) };
  }

  createObjectStore(name: string, opts?: { keyPath?: string }): object {
    this.data.stores.set(name, { keyPath: opts?.keyPath ?? null, rows: new Map() });
    return {};
  }

  transaction(_names: string | string[], _mode?: string): FakeTransaction {
    if (this.closed) throw new Error('InvalidStateError: the connection is closed');
    return new FakeTransaction(this);
  }

  close(): void {
    this.closed = true;
  }
}

export class FakeIndexedDb {
  /** How many open requests were made. */
  opens = 0;
  private readonly dbs = new Map<string, DbData>();
  private readonly connections: FakeConnection[] = [];
  private holding = false;
  private held: Array<{ ok: () => void; fail: () => void; block: () => void }> = [];

  /** Holds back every open from now on, until release() or fail(). */
  hold(): void {
    this.holding = true;
  }

  /** Lets the held opens succeed; later opens answer at once. */
  release(): void {
    this.holding = false;
    for (const h of this.held.splice(0)) later(h.ok);
  }

  /** Makes the held opens fail; later opens answer at once. */
  fail(): void {
    this.holding = false;
    for (const h of this.held.splice(0)) later(h.fail);
  }

  /** Fires onblocked on the held opens. They stay pending, as in a browser. */
  block(): void {
    for (const h of this.held) later(h.block);
  }

  /** Closes every connection the way a browser does when it evicts the data: onclose fires. */
  evict(): void {
    for (const c of this.connections.splice(0)) {
      c.closed = true;
      c.onclose?.({});
    }
  }

  /** The rows of one object store, for assertions (empty when it does not exist). */
  rows(db: string, store: string): Map<string, unknown> {
    return this.dbs.get(db)?.stores.get(store)?.rows ?? new Map();
  }

  open(name: string, version: number): FakeOpenRequest {
    this.opens++;
    const req: FakeOpenRequest = { ...newRequest(), onblocked: null, onupgradeneeded: null };
    const ok = (): void => {
      let data = this.dbs.get(name);
      const upgrade = !data || data.version < version;
      if (!data) {
        data = { version, stores: new Map() };
        this.dbs.set(name, data);
      }
      const conn = new FakeConnection(data);
      this.connections.push(conn);
      req.result = conn;
      if (upgrade) {
        data.version = version;
        req.onupgradeneeded?.({ target: req });
      }
      req.onsuccess?.({ target: req });
    };
    const fail = (): void => {
      req.error = new Error('UnknownError: the open failed');
      req.onerror?.({ target: req });
    };
    const block = (): void => req.onblocked?.({ target: req });
    if (this.holding) this.held.push({ ok, fail, block });
    else later(ok);
    return req;
  }
}

/** The fake, typed as the browser's factory for the stores' constructors. */
export function asFactory(fake: FakeIndexedDb): IDBFactory {
  return fake as unknown as IDBFactory;
}
