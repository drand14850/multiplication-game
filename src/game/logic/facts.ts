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

/**
 * The reference nextQuestion() picking rule. Mutates `picker`.
 * Every few questions, bring back something he missed earlier. A review pick may
 * repeat the previous problem (known quirk, kept on purpose).
 */
export function pickNextFact(pile: ReviewPile, picker: PickerState, rng: Rng): { fact: Fact; wasReview: boolean } {
  let pick: Fact = { a: MIN, b: MIN };
  let wasReview = false;
  const weak = owedFacts(pile);

  if (weak.length && picker.sinceReview >= REVIEW_AFTER && rng() < REVIEW_CHANCE) {
    const k = weak[Math.floor(rng() * weak.length)];
    const parts = k.split("x");
    pick = { a: +parts[0], b: +parts[1] };
    picker.sinceReview = 0;
    wasReview = true;
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
