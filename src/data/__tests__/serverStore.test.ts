// @vitest-environment jsdom
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { GameEngine } from "../../game/logic/engine";
import { seededRng } from "../../game/logic/rng";
import { FakeBackend } from "../fakeBackend";
import { mergeSaved, readCache, ServerStore } from "../serverStore";
import { WriteQueue, type OutboxItem } from "../writeQueue";

beforeEach(() => localStorage.clear());

const empty = { weak: {}, caught: {}, rarePickDay: "", mysteryDay: "" };

describe("mergeSaved", () => {
  const now = new Date("2026-10-15T18:00:00Z");

  it("adds this device's unsent catches and latest review pile to the server's state", () => {
    const pending: OutboxItem[] = [
      { owner: "p", table: "catches", key: "1", row: { child_id: "c1", collectible_id: "cat", source: "practice", created_at: now.toISOString() } },
      { owner: "p", table: "catches", key: "2", row: { child_id: "c2", collectible_id: "dog", source: "practice", created_at: now.toISOString() } },
      { owner: "p", table: "game_state", key: "c1", row: { child_id: "c1", review_pile: { "7x8": 2 } } },
      { owner: "p", table: "game_state", key: "c1", row: { child_id: "c1", review_pile: { "7x8": 1 } } },
    ];
    const s = mergeSaved({ reviewPile: { "9x9": 2 }, caught: { cat: 2, owl: 1 }, recentDaily: [] }, null, pending, "c1", "UTC", now);
    expect(s.caught).toEqual({ cat: 3, owl: 1 });
    expect(s.weak).toEqual({ "7x8": 1 });
  });

  it("works out today's Mystery Box and rare pick in the family time zone", () => {
    const server = {
      reviewPile: {}, caught: {},
      recentDaily: [
        { collectibleId: "fire-fox", source: "mystery" as const, createdAt: "2026-10-15T06:00:00Z" },   // Oct 14, 11pm in LA
        { collectibleId: "axolotl", source: "pick" as const, createdAt: "2026-10-15T16:00:00Z" },       // Oct 15, 9am in LA
      ],
    };
    const la = mergeSaved(server, null, [], "c1", "America/Los_Angeles", now);
    expect(la.mysteryDay).toBe("");
    expect(la.rarePickDay).toBe("2026-10-15");
    const london = mergeSaved(server, null, [], "c1", "Europe/London", now);
    expect(london.mysteryDay).toBe("2026-10-15");
  });

  it("a regular Pick-a-Pet pick doesn't use up the rare pick", () => {
    const s = mergeSaved({ reviewPile: {}, caught: {}, recentDaily: [{ collectibleId: "cat", source: "pick", createdAt: now.toISOString() }] },
                         null, [], "c1", "UTC", now);
    expect(s.rarePickDay).toBe("");
  });

  it("uses the device cache when the server can't be reached", () => {
    const cache = { weak: { "3x4": 2 }, caught: { cat: 1 }, rarePickDay: "", mysteryDay: "2026-10-15" };
    expect(mergeSaved(null, cache, [], "c1", "UTC", now)).toEqual(cache);
    expect(mergeSaved(null, null, [], "c1", "UTC", now)).toEqual(empty);
  });
});

describe("ServerStore", () => {
  function play(childId: string, queue: WriteQueue, n: number, seed: number) {
    let id = 0;
    const store = new ServerStore(childId, empty, queue, () => childId + "-" + ++id);
    const e = new GameEngine({ rng: seededRng(seed), today: () => "2026-10-15", newId: () => crypto.randomUUID() }, store.load());
    e.takeEffects();
    for (let i = 0; i < n; i++) {
      for (const d of String(e.s.current.answer)) e.type(d);
      e.check(1234);
      e.takeEffects().forEach((f) => store.record(f));
      e.step("next");
    }
    return e;
  }

  it("turns answers into attempts, catches and saved game rows", async () => {
    const backend = new FakeBackend();
    const q = new WriteQueue({ sender: backend.sender(), owner: "p1", idb: new IDBFactory(), flushDelayMs: 10_000 });
    play("c1", q, 6, 1);
    await q.flush();
    expect(backend.rows.attempts.size).toBe(6);
    const a = [...backend.rows.attempts.values()][0];
    expect(a).toMatchObject({ child_id: "c1", correct: true, response_ms: 1234, mode: "practice", quest_run_id: null, was_review: false });
    expect(backend.rows.catches.size).toBe(6);
    expect(backend.rows.game_state.get("c1")).toMatchObject({ child_id: "c1", review_pile: {} });
    q.stop();
  });

  it("sends quest runs whole, with progress, result and reward", async () => {
    const backend = new FakeBackend();
    const q = new WriteQueue({ sender: backend.sender(), owner: "p1", idb: new IDBFactory(), flushDelayMs: 10_000 });
    const store = new ServerStore("c1", empty, q);
    const e = new GameEngine({ rng: seededRng(3), today: () => "2026-10-15", newId: () => "run-1" }, store.load());
    e.takeEffects();
    e.startQuest("water");
    e.takeEffects().forEach((f) => store.record(f));
    for (let i = 0; i < 10; i++) {
      for (const d of String(e.s.current.answer)) e.type(d);
      e.check(900);
      const fx = e.takeEffects();
      fx.forEach((f) => store.record(f));
      const s = fx.find((f) => f.type === "schedule");
      if (s && s.type === "schedule") { e.step(s.step); e.takeEffects().forEach((f) => store.record(f)); }
    }
    await q.flush();
    const run = backend.rows.quest_runs.get("run-1")!;
    expect(run).toMatchObject({ child_id: "c1", quest_id: "water", length: 10, reached: 10, result: "won" });
    expect(String(run.reward_id)).toMatch(/^water-/);
    expect([...backend.rows.attempts.values()].every((a) => a.quest_run_id === "run-1" && a.mode === "quest")).toBe(true);
    expect([...backend.rows.catches.values()]).toEqual([expect.objectContaining({ source: "quest", collectible_id: run.reward_id })]);
    q.stop();
  });

  it("two children on one device keep separate progress", async () => {
    const backend = new FakeBackend();
    const q = new WriteQueue({ sender: backend.sender(), owner: "p1", idb: new IDBFactory(), flushDelayMs: 10_000 });
    const ana = play("ana", q, 3, 10);
    const ben = play("ben", q, 5, 20);
    await q.flush();
    const by = (c: string) => [...backend.rows.attempts.values()].filter((r) => r.child_id === c).length;
    expect(by("ana")).toBe(3);
    expect(by("ben")).toBe(5);
    expect(readCache("ana")!.caught).toEqual(ana.snapshot().caught);
    expect(readCache("ben")!.caught).toEqual(ben.snapshot().caught);
    const anaServer = await backend.loadChildState("ana");
    expect(Object.values(anaServer.caught).reduce((x, y) => x + y, 0)).toBe(3);
    q.stop();
  });
});
