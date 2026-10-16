// Dashboard rules, pure and tested. The server does the counting (fact_stats, daily_trend…);
// this decides what the numbers mean.

import { COLLECTIBLES, GROUPS, type Caught, type Group } from "../game/logic/collectibles";
import { MAX, MIN } from "../game/logic/constants";

export interface FactStat {
  a: number; b: number;
  total: number;
  recent: number;              // attempts counted: the last 5, or fewer
  recentCorrect: number;
  medianCorrectMs: number | null;
  medianAllMs: number | null;
  lastSeen: string;
}

export type Status = "fluent" | "slow" | "shaky" | "unseen";

export const STATUS_LABEL: Record<Status, string> = {
  fluent: "Fluent",
  slow: "Correct but slow",
  shaky: "Shaky",
  unseen: "Not seen yet",
};
export const STATUS_GLYPH: Record<Status, string> = { fluent: "✓", slow: "~", shaky: "!", unseen: "·" };

/** Share of the last (up to) 5 attempts that were right. */
export function accuracy(s: FactStat): number {
  return s.recent ? s.recentCorrect / s.recent : 0;
}

/**
 * Over a fact's last 5 attempts:
 *  - Shaky:  under 80% right.
 *  - Fluent: at least 4 right, and the right answers' median time under the threshold.
 *  - Correct but slow: everything else that's mostly right. That includes facts that
 *    are right and quick but have fewer than 4 tries so far: not fluent *yet*.
 */
export function classify(s: FactStat | undefined, thresholdMs: number): Status {
  if (!s || s.recent === 0) return "unseen";
  if (accuracy(s) < 0.8) return "shaky";
  if (s.recentCorrect >= 4 && s.medianCorrectMs !== null && s.medianCorrectMs < thresholdMs) return "fluent";
  return "slow";
}

export const FACTORS: readonly number[] = Array.from({ length: MAX - MIN + 1 }, (_, i) => MIN + i);

const key = (a: number, b: number) => a + "x" + b;

/** Stats by fact. With merge, 8×7 looks up 7×8. */
export function indexStats(stats: FactStat[]): (a: number, b: number, merge: boolean) => FactStat | undefined {
  const m = new Map(stats.map((s) => [key(s.a, s.b), s]));
  return (a, b, merge) => m.get(merge ? key(Math.min(a, b), Math.max(a, b)) : key(a, b));
}

export function statusCounts(stats: FactStat[], thresholdMs: number, merge: boolean): Record<Status, number> {
  const get = indexStats(stats);
  const out: Record<Status, number> = { fluent: 0, slow: 0, shaky: 0, unseen: 0 };
  for (const a of FACTORS) for (const b of FACTORS) {
    if (merge && b < a) continue;
    out[classify(get(a, b, merge), thresholdMs)]++;
  }
  return out;
}

/**
 * The weakest facts: shaky ones first (least accurate first), then slow ones (slowest
 * first). Fluent and unseen facts are left out.
 */
export function weakest(stats: FactStat[], thresholdMs: number, n = 10): (FactStat & { status: Status })[] {
  const rank: Record<Status, number> = { shaky: 0, slow: 1, fluent: 2, unseen: 3 };
  const time = (s: FactStat) => s.medianCorrectMs ?? s.medianAllMs ?? 0;
  return stats
    .map((s) => ({ ...s, status: classify(s, thresholdMs) }))
    .filter((s) => s.status === "shaky" || s.status === "slow")
    .sort((x, y) =>
      rank[x.status] - rank[y.status]
      || (x.status === "shaky"
        ? accuracy(x) - accuracy(y) || time(y) - time(x)       // shaky: least accurate first
        : time(y) - time(x) || accuracy(x) - accuracy(y))      // slow: slowest first
      || x.a - y.a || x.b - y.b)
    .slice(0, n);
}

/** Review pile, biggest debt first: [["7x8", 2], …] */
export function reviewList(pile: Record<string, number>): [string, number][] {
  return Object.entries(pile).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
}

export interface GroupProgress { key: Group; label: string; found: number; total: number }

export function backpackProgress(caught: Caught): { found: number; total: number; groups: GroupProgress[] } {
  const groups = GROUPS.map((g) => {
    const items = COLLECTIBLES.filter((c) => c.group === g.key);
    return { key: g.key, label: g.label, found: items.filter((c) => (caught[c.id] || 0) > 0).length, total: items.length };
  });
  return { found: groups.reduce((t, g) => t + g.found, 0), total: COLLECTIBLES.length, groups };
}

export function formatSeconds(ms: number | null): string {
  if (ms === null) return "–";
  return (ms / 1000).toFixed(ms < 10_000 ? 1 : 0) + " s";
}
