import type { Effect, Saved } from "../game/logic/engine";

/** Where the game's saved state comes from and where its effects go. */
export interface GameStore {
  load(): Partial<Saved> | null;
  /** Called for every data effect (save, attempt, catch, quest*). Must never block. */
  record(effect: Effect): void;
}

const STORE_KEY = "times-tables-state";

/**
 * Browser-only storage, same key and shape as the reference (minus `wins`).
 * With a child id, each child gets their own key. Replaced by the server store in Phase 3.
 */
export class LocalStore implements GameStore {
  private key: string;

  constructor(childId?: string) {
    this.key = childId ? STORE_KEY + ":" + childId : STORE_KEY;
  }

  load(): Partial<Saved> | null {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? (JSON.parse(raw) as Partial<Saved>) : null;
    } catch {
      return null;
    }
  }

  record(effect: Effect): void {
    if (effect.type !== "save") return;     // attempts/catches/quest runs are recorded from Phase 3
    try {
      localStorage.setItem(this.key, JSON.stringify(effect.snapshot));
    } catch { /* practice still works without saving */ }
  }
}
