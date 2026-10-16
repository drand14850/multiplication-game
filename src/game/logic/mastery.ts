// How well a kid knows each fact, from their last 5 tries at it, and how often each fact
// should come up because of that (adaptive problem picking).
//
// Not in the reference file: added at the parent's request (2026-10-16). With no history,
// picking is exactly the reference's uniform picking.

/** One try: [1 = right / 0 = wrong, response ms]. */
export type Try = [0 | 1, number];
/** Fact key ("7x8") -> last tries, oldest first, at most RECENT_N. */
export type Recent = Record<string, Try[]>;

export const RECENT_N = 5;

export type FactStatus = "fluent" | "slow" | "shaky" | "unseen";

/**
 * The dashboard's rule, shared so the game and the dashboard always agree:
 *  - shaky:  under 80% right
 *  - fluent: at least 4 right, median time of the right answers under the threshold
 *  - slow:   everything else that's mostly right (including right-and-quick but fewer than 4 tries)
 */
export function statusFrom(tries: number, right: number, medianRightMs: number | null, thresholdMs: number): FactStatus {
  if (tries === 0) return "unseen";
  if (right / tries < 0.8) return "shaky";
  if (right >= 4 && medianRightMs !== null && medianRightMs < thresholdMs) return "fluent";
  return "slow";
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = (s.length - 1) / 2;
  return (s[Math.floor(m)] + s[Math.ceil(m)]) / 2;
}

export function statusOf(tries: Try[] | undefined, thresholdMs: number): FactStatus {
  if (!tries || !tries.length) return "unseen";
  const right = tries.filter((t) => t[0] === 1);
  return statusFrom(tries.length, right.length, median(right.map((t) => t[1])), thresholdMs);
}

/** Record a try, keeping only the last RECENT_N. Mutates `recent`. */
export function addTry(recent: Recent, key: string, correct: boolean, ms: number): void {
  const list = recent[key] ?? (recent[key] = []);
  list.push([correct ? 1 : 0, ms]);
  if (list.length > RECENT_N) list.splice(0, list.length - RECENT_N);
}

/**
 * How likely each fact is to be picked, relative to the others ("medium" strength).
 * Against a fact at weight 1: a fluent fact comes up 1/4 as often, a shaky one 2.5x as often.
 * Fluent facts never drop to zero, so they stay fresh.
 */
export const ADAPTIVE_WEIGHT: Readonly<Record<FactStatus, number>> = {
  fluent: 0.25,
  slow: 1.5,
  shaky: 2.5,
  unseen: 1.5,
};

export function factWeight(recent: Recent, key: string, thresholdMs: number): number {
  return ADAPTIVE_WEIGHT[statusOf(recent[key], thresholdMs)];
}

/** Drop anything that isn't a 2–12 fact with sane tries (from storage or the server). */
export function cleanRecent(saved: unknown): Recent {
  const out: Recent = {};
  if (!saved || typeof saved !== "object") return out;
  for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
    const p = k.split("x").map(Number);
    if (p.length !== 2 || !(p[0] >= 2 && p[0] <= 12 && p[1] >= 2 && p[1] <= 12) || !Array.isArray(v)) continue;
    const tries = v.filter((t): t is Try => Array.isArray(t) && (t[0] === 0 || t[0] === 1) && typeof t[1] === "number");
    if (tries.length) out[k] = tries.slice(-RECENT_N);
  }
  return out;
}
