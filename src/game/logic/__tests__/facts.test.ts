import { describe, expect, it } from "vitest";
import { factKey, newPicker, pickNextFact, randomFact } from "../facts";
import { cleanLoadedPile, onCorrect, onMiss, owedFacts, type ReviewPile } from "../reviewPile";
import { seededRng } from "../rng";

describe("problem generation", () => {
  it("never makes a ×1 problem in 10,000 and stays within 2–12", () => {
    const rng = seededRng(1);
    const picker = newPicker();
    for (let i = 0; i < 10_000; i++) {
      const { fact } = pickNextFact({}, picker, rng);
      expect(fact.a).toBeGreaterThanOrEqual(2);
      expect(fact.b).toBeGreaterThanOrEqual(2);
      expect(fact.a).toBeLessThanOrEqual(12);
      expect(fact.b).toBeLessThanOrEqual(12);
    }
  });

  it("uses every table 2–12 as both first and second factor", () => {
    const rng = seededRng(2);
    const firsts = new Set<number>(), seconds = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      const f = randomFact(rng);
      firsts.add(f.a);
      seconds.add(f.b);
    }
    const all = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    expect([...firsts].sort((x, y) => x - y)).toEqual(all);
    expect([...seconds].sort((x, y) => x - y)).toEqual(all);
  });

  it("never repeats the previous problem on a random pick", () => {
    const rng = seededRng(3);
    const picker = newPicker();
    let last = "";
    for (let i = 0; i < 10_000; i++) {
      const { fact, wasReview } = pickNextFact({}, picker, rng);
      expect(wasReview).toBe(false);
      const k = factKey(fact.a, fact.b);
      expect(k).not.toBe(last);
      last = k;
    }
  });
});

describe("review pile", () => {
  it("a miss sets the fact to owe 2 (sets, not adds — reference behavior)", () => {
    const pile: ReviewPile = {};
    onMiss(pile, "7x8");
    expect(pile["7x8"]).toBe(2);
    onCorrect(pile, "7x8");
    expect(pile["7x8"]).toBe(1);
    onMiss(pile, "7x8");
    expect(pile["7x8"]).toBe(2);
  });

  it("right answers pay it down and the fact leaves at 0", () => {
    const pile: ReviewPile = { "7x8": 2 };
    onCorrect(pile, "7x8");
    onCorrect(pile, "7x8");
    expect("7x8" in pile).toBe(false);
    onCorrect(pile, "7x8");          // not in the pile: no-op
    expect(pile).toEqual({});
  });

  it("keeps 7x8 and 8x7 separate", () => {
    const pile: ReviewPile = {};
    onMiss(pile, "7x8");
    expect(owedFacts(pile)).toEqual(["7x8"]);
  });

  it("never reviews before 3 problems have passed since the last review", () => {
    const rng = seededRng(4);
    const picker = newPicker();
    const pile: ReviewPile = { "7x8": 2, "9x6": 2 };
    let since = 0;
    for (let i = 0; i < 5_000; i++) {
      const { wasReview } = pickNextFact(pile, picker, rng);
      if (wasReview) {
        expect(since).toBeGreaterThanOrEqual(3);
        since = 0;
      } else since++;
      pile["7x8"] = 2; pile["9x6"] = 2;            // keep the pile non-empty
    }
  });

  it("reviews about 55% of the time once eligible", () => {
    const rng = seededRng(5);
    let eligible = 0, reviews = 0;
    for (let i = 0; i < 20_000; i++) {
      const picker = { sinceReview: 3, lastKey: "" };
      const { wasReview } = pickNextFact({ "7x8": 2 }, picker, rng);
      eligible++;
      if (wasReview) reviews++;
    }
    expect(reviews / eligible).toBeGreaterThan(0.53);
    expect(reviews / eligible).toBeLessThan(0.57);
  });

  it("a review pick can repeat the previous problem (known quirk, kept)", () => {
    const picker = { sinceReview: 3, lastKey: "7x8" };
    const { fact, wasReview } = pickNextFact({ "7x8": 2 }, picker, () => 0);
    expect(wasReview).toBe(true);
    expect(factKey(fact.a, fact.b)).toBe("7x8");
  });

  it("drops old ×1 facts when loading", () => {
    expect(cleanLoadedPile({ "1x5": 2, "5x1": 1, "7x8": 2 })).toEqual({ "7x8": 2 });
    expect(cleanLoadedPile(null)).toEqual({});
  });
});
