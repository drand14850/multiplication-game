// Phase 3: a child's game backed by the server. Loading merges what the server has with
// rows still waiting in this device's outbox; game effects become outbox rows.

import { BY_ID } from "../game/logic/collectibles";
import { today } from "../game/logic/day";
import type { Effect, Saved } from "../game/logic/engine";
import { cleanLoadedPile } from "../game/logic/reviewPile";
import type { ServerChildState } from "./backend";
import type { GameStore } from "./gameStore";
import type { OutboxItem, Row, WriteQueue } from "./writeQueue";

const CACHE_KEY = "times-tables-state:";

/** Last known state on this device, used when the server can't be reached. */
export function readCache(childId: string): Saved | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY + childId);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function writeCache(childId: string, s: Saved): void {
  try { localStorage.setItem(CACHE_KEY + childId, JSON.stringify(s)); } catch { /* storage full or blocked */ }
}

/**
 * The child's state as the game should start it.
 * Server reachable: server data plus this device's unsent rows (which the server hasn't seen).
 * Server unreachable: this device's cache, which already includes everything played here.
 */
export function mergeSaved(server: ServerChildState | null, cache: Saved | null, pending: OutboxItem[],
                           childId: string, timeZone: string | undefined, now = new Date()): Saved {
  if (!server) return cache ?? { weak: {}, caught: {}, rarePickDay: "", mysteryDay: "" };

  const mine = pending.filter((p) => p.row.child_id === childId);
  const caught = { ...server.caught };
  const daily: { id: string; source: string; at: string }[] =
    server.recentDaily.map((d) => ({ id: d.collectibleId, source: d.source, at: d.createdAt }));
  let weak = server.reviewPile;

  for (const p of mine) {
    if (p.table === "catches") {
      const id = p.row.collectible_id as string;
      caught[id] = (caught[id] || 0) + 1;
      daily.push({ id, source: p.row.source as string, at: p.row.created_at as string });
    } else if (p.table === "game_state") {
      weak = p.row.review_pile as Record<string, number>;     // pending is oldest first: the last one wins
    }
  }

  const day = today(timeZone, now);
  const isToday = (at: string) => today(timeZone, new Date(at)) === day;
  return {
    weak: cleanLoadedPile(weak),
    caught,
    mysteryDay: daily.some((d) => d.source === "mystery" && isToday(d.at)) ? day : "",
    rarePickDay: daily.some((d) => d.source === "pick" && BY_ID.get(d.id)?.group === "rare" && isToday(d.at)) ? day : "",
  };
}

/** Turns the engine's effects into outbox rows for one child. */
export class ServerStore implements GameStore {
  private runs = new Map<string, Row>();     // quest runs in progress: always sent as the whole row
  private initial: Saved;
  private childId: string;
  private queue: WriteQueue;
  private newId: () => string;

  constructor(childId: string, initial: Saved, queue: WriteQueue,
              newId: () => string = () => crypto.randomUUID()) {
    this.childId = childId;
    this.initial = initial;
    this.queue = queue;
    this.newId = newId;
    writeCache(childId, initial);
  }

  load(): Saved { return this.initial; }

  record(e: Effect): void {
    const child_id = this.childId;
    const now = new Date().toISOString();
    switch (e.type) {
      case "save":
        writeCache(child_id, e.snapshot);
        this.queue.enqueue("game_state", child_id, { child_id, review_pile: e.snapshot.weak, updated_at: now });
        break;
      case "attempt": {
        const id = this.newId();
        this.queue.enqueue("attempts", id, {
          id, child_id, a: e.a, b: e.b, given_answer: e.givenAnswer, correct: e.correct,
          response_ms: e.responseMs, mode: e.mode, quest_run_id: e.questRunId, was_review: e.wasReview, created_at: now,
        });
        break;
      }
      case "catch": {
        const id = this.newId();
        this.queue.enqueue("catches", id, {
          id, child_id, collectible_id: e.collectibleId, source: e.source, quest_run_id: e.questRunId, created_at: now,
        });
        break;
      }
      case "questStart":
        this.putRun(e.runId, { id: e.runId, child_id, quest_id: e.questId, length: e.length, reached: 0,
                               result: "quit", reward_id: null, started_at: now, ended_at: null });
        break;
      case "questProgress":
        this.putRun(e.runId, { reached: e.reached });
        break;
      case "questEnd":
        this.putRun(e.runId, { result: e.result, reached: e.reached, reward_id: e.rewardId, ended_at: now });
        break;
      case "questReward":
        this.putRun(e.runId, { reward_id: e.rewardId });
        break;
    }
  }

  private putRun(id: string, patch: Row): void {
    const row = { ...(this.runs.get(id) ?? {}), ...patch };
    if (!row.child_id) return;           // a run that started before this store existed
    this.runs.set(id, row);
    this.queue.enqueue("quest_runs", id, row);
  }
}
