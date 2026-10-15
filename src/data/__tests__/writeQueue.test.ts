import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { WriteQueue, type Row, type Sender, type SendResult, type Table } from "../writeQueue";

/** A server stand-in that records what it accepted and can be switched off. */
function fakeServer() {
  const got: { table: Table; rows: Row[] }[] = [];
  const store: Record<Table, Map<string, Row>> = { quest_runs: new Map(), attempts: new Map(), catches: new Map(), game_state: new Map() };
  const state = { online: true, refuse: new Set<string>(), calls: 0 };
  const sender: Sender = {
    async send(table, rows): Promise<SendResult> {
      state.calls++;
      if (!state.online) return { ok: false, retry: true, error: "Failed to fetch" };
      if (rows.some((r) => state.refuse.has(String(r.id)))) return { ok: false, retry: false, error: "mystery_already_opened_today" };
      if (table === "attempts") {
        for (const r of rows) if (r.quest_run_id && !store.quest_runs.has(String(r.quest_run_id))) return { ok: false, retry: false, error: "fk violation" };
      }
      got.push({ table, rows });
      for (const r of rows) {
        const key = String(table === "game_state" ? r.child_id : r.id);
        if ((table === "attempts" || table === "catches") && store[table].has(key)) continue;
        store[table].set(key, r);
      }
      return { ok: true };
    },
  };
  return { sender, got, store, state };
}

const attempt = (i: number, extra: Row = {}): Row => ({ id: "att-" + i, child_id: "c1", a: 7, b: 8, ...extra });

describe("write queue", () => {
  it("sends queued rows in batches without the caller waiting", async () => {
    const srv = fakeServer();
    const q = new WriteQueue({ sender: srv.sender, owner: "p1", idb: new IDBFactory(), flushDelayMs: 10_000, batchSize: 50 });
    for (let i = 0; i < 120; i++) q.enqueue("attempts", "att-" + i, attempt(i));   // returns immediately
    expect(srv.state.calls).toBe(0);
    await q.flush();
    expect(srv.store.attempts.size).toBe(120);
    expect(srv.got.map((g) => g.rows.length)).toEqual([50, 50, 20]);
    expect(await q.pending()).toEqual([]);
    q.stop();
  });

  it("keeps rows while offline and sends each exactly once when back", async () => {
    const srv = fakeServer();
    const q = new WriteQueue({ sender: srv.sender, owner: "p1", idb: new IDBFactory(), flushDelayMs: 10_000 });
    srv.state.online = false;
    for (let i = 0; i < 20; i++) q.enqueue("attempts", "att-" + i, attempt(i));
    await q.flush();
    await q.flush();
    expect(srv.store.attempts.size).toBe(0);
    expect(await q.pending()).toHaveLength(20);
    srv.state.online = true;
    await q.flush();
    expect(srv.store.attempts.size).toBe(20);
    expect(srv.got.flatMap((g) => g.rows)).toHaveLength(20);
    q.stop();
  });

  it("survives a reload: a new queue on the same storage sends what the old one left", async () => {
    const idb = new IDBFactory();
    const srv = fakeServer();
    srv.state.online = false;
    const before = new WriteQueue({ sender: srv.sender, owner: "p1", idb, flushDelayMs: 10_000 });
    for (let i = 0; i < 5; i++) before.enqueue("attempts", "att-" + i, attempt(i));
    await before.pending();         // writes have landed
    before.stop();                  // the page goes away

    srv.state.online = true;
    const after = new WriteQueue({ sender: srv.sender, owner: "p1", idb, flushDelayMs: 10_000 });
    await after.flush();
    expect([...srv.store.attempts.keys()].sort()).toEqual(["att-0", "att-1", "att-2", "att-3", "att-4"]);
    after.stop();
  });

  it("keeps order, so a quest run arrives before its attempts", async () => {
    const srv = fakeServer();
    const q = new WriteQueue({ sender: srv.sender, owner: "p1", idb: new IDBFactory(), flushDelayMs: 10_000 });
    q.enqueue("quest_runs", "run-1", { id: "run-1", child_id: "c1", reached: 0 });
    q.enqueue("attempts", "att-1", attempt(1, { quest_run_id: "run-1" }));
    q.enqueue("quest_runs", "run-1", { id: "run-1", child_id: "c1", reached: 1 });
    q.enqueue("attempts", "att-2", attempt(2, { quest_run_id: "run-1" }));
    await q.flush();
    expect(srv.got.map((g) => g.table)).toEqual(["quest_runs", "attempts", "quest_runs", "attempts"]);
    expect(srv.store.attempts.size).toBe(2);
    expect(srv.store.quest_runs.get("run-1")!.reached).toBe(1);
    q.stop();
  });

  it("sends only the latest version of a row within a batch", async () => {
    const srv = fakeServer();
    const q = new WriteQueue({ sender: srv.sender, owner: "p1", idb: new IDBFactory(), flushDelayMs: 10_000 });
    for (let i = 1; i <= 5; i++) q.enqueue("game_state", "c1", { child_id: "c1", review_pile: { "7x8": i } });
    await q.flush();
    expect(srv.got).toHaveLength(1);
    expect(srv.got[0].rows).toEqual([{ child_id: "c1", review_pile: { "7x8": 5 } }]);
    q.stop();
  });

  it("drops a row the server refuses for good (e.g. a second Mystery Box) and keeps going", async () => {
    const srv = fakeServer();
    const dropped: string[] = [];
    const q = new WriteQueue({ sender: srv.sender, owner: "p1", idb: new IDBFactory(), flushDelayMs: 10_000,
                               onDrop: (it, err) => dropped.push(it.key + ": " + err) });
    srv.state.refuse.add("cat-2");
    q.enqueue("catches", "cat-1", { id: "cat-1", child_id: "c1" });
    q.enqueue("catches", "cat-2", { id: "cat-2", child_id: "c1" });
    q.enqueue("catches", "cat-3", { id: "cat-3", child_id: "c1" });
    await q.flush();
    expect([...srv.store.catches.keys()]).toEqual(["cat-1", "cat-3"]);
    expect(dropped).toEqual(["cat-2: mystery_already_opened_today"]);
    expect(await q.pending()).toEqual([]);
    q.stop();
  });

  it("isolates one bad row in a batch instead of losing the batch", async () => {
    const srv = fakeServer();
    const q = new WriteQueue({ sender: srv.sender, owner: "p1", idb: new IDBFactory(), flushDelayMs: 10_000 });
    srv.state.refuse.add("att-3");
    for (let i = 0; i < 6; i++) q.enqueue("attempts", "att-" + i, attempt(i));
    await q.flush();
    expect([...srv.store.attempts.keys()].sort()).toEqual(["att-0", "att-1", "att-2", "att-4", "att-5"]);
    q.stop();
  });

  it("only sends a parent's own rows", async () => {
    const idb = new IDBFactory();
    const srv = fakeServer();
    srv.state.online = false;
    const a = new WriteQueue({ sender: srv.sender, owner: "parent-a", idb, flushDelayMs: 10_000 });
    a.enqueue("attempts", "att-a", attempt(1));
    await a.pending();
    a.stop();
    srv.state.online = true;
    const b = new WriteQueue({ sender: srv.sender, owner: "parent-b", idb, flushDelayMs: 10_000 });
    await b.flush();
    expect(srv.store.attempts.size).toBe(0);
    b.stop();
  });

  it("sends nothing while held, then catches up", async () => {
    const srv = fakeServer();
    const q = new WriteQueue({ sender: srv.sender, owner: "p1", idb: new IDBFactory(), flushDelayMs: 10_000, batchSize: 2 });
    for (let i = 0; i < 4; i++) q.enqueue("attempts", "att-" + i, attempt(i));
    const seen = await q.hold(async () => {
      await q.flush();                                  // asked to send while held: waits
      return { sent: srv.store.attempts.size, pending: (await q.pending()).length };
    });
    expect(seen).toEqual({ sent: 0, pending: 4 });
    await new Promise((r) => setTimeout(r, 50));
    await q.flush();
    expect(srv.store.attempts.size).toBe(4);
    q.stop();
  });

  it("a retried row that already arrived is not counted twice", async () => {
    const srv = fakeServer();
    const q = new WriteQueue({ sender: srv.sender, owner: "p1", idb: new IDBFactory(), flushDelayMs: 10_000 });
    q.enqueue("attempts", "att-1", attempt(1));
    q.enqueue("attempts", "att-1", attempt(1));       // same client id twice
    await q.flush();
    expect(srv.store.attempts.size).toBe(1);
    q.stop();
  });
});
