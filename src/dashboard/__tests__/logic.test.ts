import { describe, expect, it } from "vitest";
import { backpackProgress, classify, indexStats, reviewList, statusCounts, weakest, type FactStat } from "../logic";

const fact = (a: number, b: number, recent: number, recentCorrect: number, medianCorrectMs: number | null, total = recent): FactStat =>
  ({ a, b, total, recent, recentCorrect, medianCorrectMs, medianAllMs: medianCorrectMs, lastSeen: "2026-10-15T12:00:00Z" });

describe("fact status", () => {
  const T = 3000;
  it("not seen yet", () => expect(classify(undefined, T)).toBe("unseen"));
  it("fluent: at least 4 of the last 5 right, median under the threshold", () => {
    expect(classify(fact(7, 8, 5, 4, 2900), T)).toBe("fluent");
    expect(classify(fact(7, 8, 5, 5, 1200), T)).toBe("fluent");
  });
  it("correct but slow: mostly right, but over the threshold", () => {
    expect(classify(fact(7, 8, 5, 5, 3000), T)).toBe("slow");      // exactly the threshold is not under it
    expect(classify(fact(7, 8, 5, 4, 4100), T)).toBe("slow");
  });
  it("right and quick but fewer than 4 tries is not fluent yet", () => {
    expect(classify(fact(7, 8, 3, 3, 1000), T)).toBe("slow");
  });
  it("shaky: under 80% right", () => {
    expect(classify(fact(7, 8, 5, 3, 1000), T)).toBe("shaky");
    expect(classify(fact(7, 8, 1, 0, null), T)).toBe("shaky");
  });
  it("follows the threshold setting", () => {
    expect(classify(fact(7, 8, 5, 5, 4000), 5000)).toBe("fluent");
  });
});

describe("grid", () => {
  it("counts all 121 cells, or 66 with commuted pairs merged", () => {
    const stats = [fact(7, 8, 5, 5, 1000), fact(2, 2, 5, 5, 900)];
    const c = statusCounts(stats, 3000, false);
    expect(c.fluent + c.slow + c.shaky + c.unseen).toBe(121);
    expect(c.fluent).toBe(2);
    const m = statusCounts([fact(7, 8, 5, 5, 1000)], 3000, true);
    expect(m.fluent + m.slow + m.shaky + m.unseen).toBe(66);
  });
  it("merged lookups find 7×8 from 8×7", () => {
    const get = indexStats([fact(7, 8, 5, 5, 1000)]);
    expect(get(8, 7, true)?.a).toBe(7);
    expect(get(8, 7, false)).toBeUndefined();
  });
});

describe("needs work", () => {
  it("lists shaky facts first (least accurate first), then the slowest; never fluent or unseen", () => {
    const stats = [
      fact(2, 3, 5, 5, 900),           // fluent
      fact(7, 8, 5, 2, 4000),          // shaky 40%
      fact(6, 7, 5, 3, 3000),          // shaky 60%
      fact(9, 9, 5, 5, 6000),          // slow
      fact(12, 7, 5, 4, 3500),         // slow
    ];
    expect(weakest(stats, 3000).map((s) => s.a + "x" + s.b)).toEqual(["7x8", "6x7", "9x9", "12x7"]);
    const many = Array.from({ length: 30 }, (_, i) => fact(2 + (i % 11), 2 + Math.floor(i / 11), 5, 1, 2000));
    expect(weakest(many, 3000)).toHaveLength(10);
  });
  it("shows the review pile, biggest debt first", () => {
    expect(reviewList({ "7x8": 1, "6x7": 2, "9x3": 0 })).toEqual([["6x7", 2], ["7x8", 1]]);
  });
});

describe("backpack", () => {
  it("counts found out of all 103 and per group", () => {
    const p = backpackProgress({ cat: 3, axolotl: 1, "fire-fox": 1, "water-whale": 0 });
    expect(p).toMatchObject({ found: 3, total: 103 });
    expect(p.groups.find((g) => g.key === "myth")).toMatchObject({ found: 0, total: 8 });
    expect(p.groups.find((g) => g.key === "rare")).toMatchObject({ found: 1, total: 10 });
    expect(p.groups.find((g) => g.key === "fire")).toMatchObject({ found: 1, total: 8 });
    expect(p.groups.find((g) => g.key === "water")).toMatchObject({ found: 0, total: 8 });
    expect(p.groups).toHaveLength(12);
  });
});
