import { MAX, MIN, NO_REPEAT_TRIES, REVIEW_AFTER, REVIEW_CHANCE } from "./constants";
import { owedFacts, type ReviewPile } from "./reviewPile";
import type { Rng } from "./rng";

export interface Fact { a: number; b: number }

export function factKey(a: number, b: number): string {
  return a + "x" + b;
}

/** Always all tables, 2–12. */
export function randomFact(rng: Rng): Fact {
  const a = MIN + Math.floor(rng() * (MAX - MIN + 1));
  const b = MIN + Math.floor(rng() * (MAX - MIN + 1));
  return { a, b };
}

export interface PickerState {
  sinceReview: number;
  lastKey: string;
}

export function newPicker(): PickerState {
  return { sinceReview: 0, lastKey: "" };
}

/** Relative chance of each fact on a random pick (adaptive picking). */
export type FactWeight = (a: number, b: number) => number;

/** One weighted draw over all 121 facts, never the previous problem. One rng() call. */
export function weightedFact(rng: Rng, weight: FactWeight, lastKey: string): Fact {
  const facts: [Fact, number][] = [];
  let total = 0;
  for (let a = MIN; a <= MAX; a++) {
    for (let b = MIN; b <= MAX; b++) {
      const w = factKey(a, b) === lastKey ? 0 : Math.max(0, weight(a, b));
      if (w > 0) { facts.push([{ a, b }, w]); total += w; }
    }
  }
  let r = rng() * total;
  for (const [f, w] of facts) {
    if ((r -= w) < 0) return f;
  }
  return facts[facts.length - 1][0];
}

/**
 * The reference nextQuestion() picking rule. Mutates `picker`.
 * Every few questions, bring back something he missed earlier. A review pick may
 * repeat the previous problem (known quirk, kept on purpose).
 * With `weight`, the random (non-review) pick leans toward weaker facts; without it,
 * picking is exactly the reference's.
 */
export function pickNextFact(pile: ReviewPile, picker: PickerState, rng: Rng, weight?: FactWeight): { fact: Fact; wasReview: boolean } {
  let pick: Fact = { a: MIN, b: MIN };
  let wasReview = false;
  const weak = owedFacts(pile);

  if (weak.length && picker.sinceReview >= REVIEW_AFTER && rng() < REVIEW_CHANCE) {
    const k = weak[Math.floor(rng() * weak.length)];
    const parts = k.split("x");
    pick = { a: +parts[0], b: +parts[1] };
    picker.sinceReview = 0;
    wasReview = true;
  } else if (weight) {
    pick = weightedFact(rng, weight, picker.lastKey);
    picker.sinceReview++;
  } else {
    for (let i = 0; i < NO_REPEAT_TRIES; i++) {
      pick = randomFact(rng);
      if (factKey(pick.a, pick.b) !== picker.lastKey) break;
    }
    picker.sinceReview++;
  }

  picker.lastKey = factKey(pick.a, pick.b);
  return { fact: pick, wasReview };
}
