import type { Effect, Saved } from "../game/logic/engine";

/** Where the game's saved state comes from and where its effects go. */
export interface GameStore {
  load(): Partial<Saved> | null;
  /** Called for every data effect (save, attempt, catch, quest*). Must never block. */
  record(effect: Effect): void;
}

const STORE_KEY = "times-tables-state";

/** Phase 1: browser-only storage, same key and shape as the reference (minus `wins`). */
export class LocalStore implements GameStore {
  load(): Partial<Saved> | null {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? (JSON.parse(raw) as Partial<Saved>) : null;
    } catch {
      return null;
    }
  }

  record(effect: Effect): void {
    if (effect.type !== "save") return;     // attempts/catches/quest runs are recorded from Phase 3
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(effect.snapshot));
    } catch { /* practice still works without saving */ }
  }
}
