import { describe, expect, it } from "vitest";
import { classify } from "../../../dashboard/logic";
import { GameEngine, type EngineCtx } from "../engine";
import { factKey, newPicker, pickNextFact, randomFact, type Fact } from "../facts";
import { ADAPTIVE_WEIGHT, addTry, cleanRecent, factWeight, statusOf, type Recent, type Try } from "../mastery";
import { seededRng } from "../rng";

const T = 3000;
const fast: Try = [1, 1200], slowRight: Try = [1, 5000], wrong: Try = [0, 2000];

/** A kid who knows every fact except a few. */
function mostlyFluent(weak: string[]): Recent {
  const r: Recent = {};
  for (let a = 2; a <= 12; a++) for (let b = 2; b <= 12; b++) {
    const k = factKey(a, b);
    r[k] = weak.includes(k) ? [wrong, wrong, fast, wrong, fast] : [fast, fast, fast, fast, fast];
  }
  return r;
}

describe("fact history", () => {
  it("keeps the last 5 tries per fact", () => {
    const r: Recent = {};
    for (let i = 0; i < 8; i++) addTry(r, "7x8", i % 2 === 0, 1000 + i);
    expect(r["7x8"]).toHaveLength(5);
    expect(r["7x8"].map((t) => t[1])).toEqual([1003, 1004, 1005, 1006, 1007]);
  });

  it("uses exactly the dashboard's status rule", () => {
    const cases: Try[][] = [
      [], [fast], [fast, fast, fast], [fast, fast, fast, fast], [fast, fast, fast, fast, wrong],
      [slowRight, slowRight, slowRight, slowRight, slowRight], [wrong, fast, fast, fast, fast],
      [wrong, wrong, fast, fast, fast], [wrong], [fast, slowRight, fast, slowRight, fast],
    ];
    for (const tries of cases) {
      const right = tries.filter((t) => t[0]).map((t) => t[1]).sort((x, y) => x - y);
      const m = right.length ? (right[Math.floor((right.length - 1) / 2)] + right[Math.ceil((right.length - 1) / 2)]) / 2 : null;
      const asDashboard = tries.length ? classify({ a: 7, b: 8, total: tries.length, recent: tries.length, recentCorrect: right.length,
        medianCorrectMs: m, medianAllMs: null, lastSeen: "" }, T) : "unseen";
      expect(statusOf(tries, T)).toBe(asDashboard);
    }
  });

  it("weights: fluent 1/4, shaky 2.5x, slow and unseen 1.5x", () => {
    const r: Recent = { "2x2": [fast, fast, fast, fast, fast], "7x8": [wrong, wrong, fast], "9x9": [slowRight, slowRight, slowRight, slowRight] };
    expect(factWeight(r, "2x2", T)).toBe(0.25);
    expect(factWeight(r, "7x8", T)).toBe(2.5);
    expect(factWeight(r, "9x9", T)).toBe(1.5);
    expect(factWeight(r, "6x6", T)).toBe(1.5);
    expect(ADAPTIVE_WEIGHT.fluent).toBeGreaterThan(0);          // known facts never disappear
  });

  it("cleans junk from storage", () => {
    expect(cleanRecent({ "7x8": [[1, 900], [2, 5], "x"], "1x5": [[1, 500]], "13x2": [[1, 1]], bad: 3 })).toEqual({ "7x8": [[1, 900]] });
  });
});

describe("adaptive picking", () => {
  function draw(recent: Recent, n: number, seed: number): Map<string, number> {
    const rng = seededRng(seed);
    const picker = newPicker();
    const counts = new Map<string, number>();
    // history doesn't change during these draws, so work out each fact's weight once
    const cache = new Map<string, number>();
    const weight = (a: number, b: number) => {
      const k = factKey(a, b);
      if (!cache.has(k)) cache.set(k, factWeight(recent, k, T));
      return cache.get(k)!;
    };
    for (let i = 0; i < n; i++) {
      const { fact } = pickNextFact({}, picker, rng, weight);
      const k = factKey(fact.a, fact.b);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }

  it("shaky facts come up about 10x as often as fluent ones (2.5 / 0.25)", () => {
    const weak = ["7x8", "8x7", "6x7", "7x6", "8x8", "6x8"];
    const counts = draw(mostlyFluent(weak), 60_000, 1);
    const per = (keys: string[]) => keys.reduce((t, k) => t + (counts.get(k) ?? 0), 0) / keys.length;
    const fluentKeys = [...counts.keys()].filter((k) => !weak.includes(k));
    const ratio = per(weak) / per(fluentKeys);
    expect(ratio).toBeGreaterThan(8.5);
    expect(ratio).toBeLessThan(11.5);
  });

  it("still shows every fact, so every table 2–12 appears as both factors", () => {
    const counts = draw(mostlyFluent(["7x8"]), 20_000, 2);
    expect(counts.size).toBe(121);
  });

  it("never repeats the previous problem, and never makes a ×1", () => {
    const rng = seededRng(3);
    const picker = newPicker();
    const recent = mostlyFluent(["7x8"]);
    let last = "";
    for (let i = 0; i < 5000; i++) {
      const { fact } = pickNextFact({}, picker, rng, (a, b) => factWeight(recent, factKey(a, b), T));
      const k = factKey(fact.a, fact.b);
      expect(k).not.toBe(last);
      expect(Math.min(fact.a, fact.b)).toBeGreaterThanOrEqual(2);
      last = k;
    }
  });

  it("the review pile still works the same way on top", () => {
    const rng = seededRng(4);
    const picker = { sinceReview: 3, lastKey: "" };
    let reviews = 0;
    for (let i = 0; i < 4000; i++) {
      picker.sinceReview = 3;
      if (pickNextFact({ "9x3": 2 }, picker, rng, () => 1).wasReview) reviews++;
    }
    expect(reviews / 4000).toBeGreaterThan(0.52);
    expect(reviews / 4000).toBeLessThan(0.58);
  });
});

describe("in the game", () => {
  const ctx = (seed: number, adaptive?: { fluencyMs: number }): EngineCtx =>
    ({ rng: seededRng(seed), today: () => "2026-10-16", newId: () => "run", adaptive });

  it("with no history, picks exactly like the reference (same problems as uniform)", () => {
    const a = new GameEngine(ctx(9, { fluencyMs: T }));
    const b = new GameEngine(ctx(9));
    expect(a.s.current).toEqual(b.s.current);
  });

  it("records every answer and saves the history", () => {
    const e = new GameEngine(ctx(5, { fluencyMs: T }));
    const { a, b } = e.s.current;
    for (const d of String(a * b)) e.type(d);
    e.check(1800);
    expect(e.s.recent[factKey(a, b)]).toEqual([[1, 1800]]);
    expect(e.snapshot().recent).toEqual({ [factKey(a, b)]: [[1, 1800]] });
  });

  it("a kid who knows almost everything mostly gets the facts they don't (quests too)", () => {
    const weak = ["7x8", "8x7", "6x7", "7x6", "8x6", "6x8", "9x7", "7x9"];
    const e = new GameEngine(ctx(6, { fluencyMs: T }), { recent: mostlyFluent(weak) });
    e.startQuest("diamond");
    let hits = 0;
    const seen: Fact[] = [];
    for (let i = 0; i < 400; i++) {
      seen.push({ a: e.s.current.a, b: e.s.current.b });
      if (weak.includes(factKey(e.s.current.a, e.s.current.b))) hits++;
      e.nextQuestion();
    }
    // 8 weak facts of 121: about 7% if uniform; with the weights about 40%
    expect(hits / 400).toBeGreaterThan(0.3);
    expect(seen.length).toBe(400);
  });

  it("adaptive off ignores history entirely", () => {
    const recent = mostlyFluent(["7x8"]);
    const off = new GameEngine(ctx(7), { recent });
    const plain = randomFact(seededRng(7));
    expect({ a: off.s.current.a, b: off.s.current.b }).toEqual(plain);
  });
});
