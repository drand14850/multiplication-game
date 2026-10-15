// The write queue. Game writes (attempts, catches, quest runs, saved game) go into an
// IndexedDB outbox and are sent in batches in the background, so the game never waits on
// the network. The outbox survives a reload and retries with backoff until the server
// answers. Every row carries a client-generated id, so a retry can never double-count.
//
// Order is kept: rows are sent first-in first-out, in runs of the same table, so a quest
// run always reaches the server before the attempts that point at it.

export type Table = "quest_runs" | "attempts" | "catches" | "game_state";
export type Row = Record<string, unknown>;

export interface OutboxItem {
  seq?: number;
  owner: string;     // the signed-in parent; rows only ever go out under their account
  table: Table;
  key: string;       // dedupe key: the row id (or child_id for game_state)
  row: Row;
}

export type SendResult =
  | { ok: true }
  | { ok: false; retry: boolean; error: string };

export interface Sender {
  send(table: Table, rows: Row[]): Promise<SendResult>;
}

const DB_NAME = "times-tables";
const STORE = "outbox";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

function openDb(idb: IDBFactory): Promise<IDBDatabase> {
  const r = idb.open(DB_NAME, 1);
  r.onupgradeneeded = () => {
    const s = r.result.createObjectStore(STORE, { keyPath: "seq", autoIncrement: true });
    s.createIndex("owner", "owner");
  };
  return req(r);
}

export interface QueueOptions {
  sender: Sender;
  owner: string;
  idb?: IDBFactory;
  batchSize?: number;
  flushDelayMs?: number;      // how long to gather rows before sending
  maxBackoffMs?: number;
  onDrop?: (item: OutboxItem, error: string) => void;
}

export class WriteQueue {
  private db: Promise<IDBDatabase>;
  private opts: Required<Omit<QueueOptions, "idb" | "onDrop">> & Pick<QueueOptions, "onDrop">;
  private flushing: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private backoff = 0;
  private writes = new Set<Promise<unknown>>();
  private stopped = false;
  private holds = 0;
  private onOnline = () => { this.backoff = 0; this.schedule(0); };
  private onHide = () => { if (document.visibilityState === "hidden") void this.flush(); };

  constructor(o: QueueOptions) {
    this.db = openDb(o.idb ?? indexedDB);
    this.opts = {
      sender: o.sender, owner: o.owner,
      batchSize: o.batchSize ?? 50, flushDelayMs: o.flushDelayMs ?? 1500, maxBackoffMs: o.maxBackoffMs ?? 60_000,
      onDrop: o.onDrop,
    };
  }

  /** Listen for the device coming back online and send anything left from last time. */
  start(): void {
    this.stopped = false;
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.onOnline);
      document.addEventListener("visibilitychange", this.onHide);   // closing or switching away
    }
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.onOnline);
      document.removeEventListener("visibilitychange", this.onHide);
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Add a row. Returns at once; the row is persisted and sent in the background. */
  enqueue(table: Table, key: string, row: Row): void {
    const item: OutboxItem = { owner: this.opts.owner, table, key, row };
    const w = this.db.then((db) => req(db.transaction(STORE, "readwrite").objectStore(STORE).add(item)));
    this.writes.add(w);
    w.catch(() => { /* storage unavailable: nothing more we can do */ }).finally(() => this.writes.delete(w));
    this.schedule(this.opts.flushDelayMs);
  }

  /** Rows not yet accepted by the server, oldest first. */
  async pending(): Promise<OutboxItem[]> {
    await Promise.allSettled([...this.writes]);
    const db = await this.db;
    const all = await req(db.transaction(STORE).objectStore(STORE).index("owner").getAll(this.opts.owner) as IDBRequest<OutboxItem[]>);
    return all.sort((a, b) => a.seq! - b.seq!);
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    if (this.timer) {
      if (ms > 0) return;          // a send is already planned
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, ms);
  }

  /**
   * Run fn with no sends in flight or starting, so a read of the server plus a read of
   * pending() sees each row exactly once (never both delivered and pending).
   */
  async hold<T>(fn: () => Promise<T>): Promise<T> {
    this.holds++;
    try {
      if (this.flushing) await this.flushing;
      return await fn();
    } finally {
      this.holds--;
      if (!this.holds) this.schedule(0);
    }
  }

  /** Send everything that's waiting. Safe to call any time; only one send runs at once. */
  flush(): Promise<void> {
    if (this.holds) { this.again = true; return Promise.resolve(); }
    if (this.flushing) { this.again = true; return this.flushing; }
    this.flushing = this.run().finally(() => {
      this.flushing = null;
      if (this.again) { this.again = false; this.schedule(0); }
    });
    return this.flushing;
  }

  private async run(): Promise<void> {
    for (;;) {
      if (this.holds) return;               // someone is reading a consistent view; resume after
      const items = await this.pending();
      if (!items.length) { this.backoff = 0; return; }

      // the oldest run of rows for one table
      const table = items[0].table;
      const size = table === "catches" ? 1 : this.opts.batchSize;   // a catch can be refused on its own
      const run: OutboxItem[] = [];
      for (const it of items) { if (it.table !== table || run.length >= size) break; run.push(it); }

      const res = await this.sendRun(table, run);
      if (res === "retry") {
        this.backoff = Math.min(this.opts.maxBackoffMs, this.backoff ? this.backoff * 2 : 2000);
        this.schedule(this.backoff);
        return;
      }
    }
  }

  private async sendRun(table: Table, run: OutboxItem[]): Promise<"done" | "retry"> {
    // within one batch only the latest version of a row matters (and Postgres refuses
    // to upsert the same key twice in one statement)
    const latest = new Map<string, OutboxItem>();
    for (const it of run) latest.set(it.key, it);
    let res: SendResult;
    try {
      res = await this.opts.sender.send(table, [...latest.values()].map((i) => i.row));
    } catch (e) {
      res = { ok: false, retry: true, error: String(e) };
    }
    if (res.ok) { await this.remove(run); return "done"; }
    if (res.retry) return "retry";

    // Refused for good. Find the bad row(s) by sending one at a time; drop only those.
    if (latest.size > 1) {
      for (const it of latest.values()) {
        const r = await this.sendRun(table, run.filter((x) => x.key === it.key));
        if (r === "retry") return "retry";
      }
      return "done";
    }
    for (const it of run) this.opts.onDrop?.(it, res.error);
    await this.remove(run);
    return "done";
  }

  private async remove(items: OutboxItem[]): Promise<void> {
    const db = await this.db;
    const tx = db.transaction(STORE, "readwrite");
    for (const it of items) tx.objectStore(STORE).delete(it.seq!);
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  }
}
