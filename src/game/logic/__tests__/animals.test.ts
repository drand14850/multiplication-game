import { describe, expect, it } from "vitest";
import { COMMON } from "../../art/animals";
import { isRare, nextAnimal } from "../animalBag";
import { seededRng } from "../rng";

describe("background animals", () => {
  it("shows a rare animal about 5% of the time, split evenly across the 5", () => {
    const rng = seededRng(10);
    const bag: number[] = [];
    const N = 100_000;
    const rareCounts = [0, 0, 0, 0, 0];
    let rare = 0;
    for (let i = 0; i < N; i++) {
      const a = nextAnimal(bag, rng);
      if (isRare(a)) { rare++; rareCounts[a - COMMON]++; }
    }
    expect(rare / N).toBeGreaterThan(0.045);
    expect(rare / N).toBeLessThan(0.055);
    rareCounts.forEach((c) => expect(c / rare).toBeGreaterThan(0.17));
  });

  it("shows all 13 regular animals in every pass through the bag", () => {
    const rng = seededRng(11);
    const bag: number[] = [];
    let pass: number[] = [];
    let passes = 0;
    for (let i = 0; i < 13_000; i++) {
      const a = nextAnimal(bag, rng);
      if (isRare(a)) continue;              // rares don't use up the bag
      pass.push(a);
      if (pass.length === 13) {
        expect([...pass].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        pass = [];
        passes++;
      }
    }
    expect(passes).toBeGreaterThan(900);
  });
});
