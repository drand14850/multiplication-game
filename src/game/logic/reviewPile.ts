import { MIN, MISS_OWED } from "./constants";

/** Fact key ("7x8") -> correct answers still owed. 7x8 and 8x7 are separate facts. */
export type ReviewPile = Record<string, number>;

export function owedFacts(pile: ReviewPile): string[] {
  return Object.keys(pile).filter((k) => pile[k] > 0);
}

/** A miss sets the fact to owe MISS_OWED. It does not add to what's already owed. */
export function onMiss(pile: ReviewPile, key: string): void {
  pile[key] = MISS_OWED;
}

/** A right answer pays one off; the fact leaves the pile at 0. */
export function onCorrect(pile: ReviewPile, key: string): void {
  if (pile[key]) {
    pile[key]--;
    if (pile[key] <= 0) delete pile[key];
  }
}

/** Drop any old ×1 facts left over from before (reference load()). */
export function cleanLoadedPile(saved: unknown): ReviewPile {
  const out: ReviewPile = {};
  if (!saved || typeof saved !== "object") return out;
  for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
    const p = k.split("x");
    if (+p[0] >= MIN && +p[1] >= MIN && typeof v === "number") out[k] = v;
  }
  return out;
}
