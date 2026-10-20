import { describe, expect, it } from "vitest";
import { COMMON } from "../../art/animals";
import { ALL_RARES, animalId, animalName, animalSvg, isRare, nextAnimal, REFERENCE_RARES } from "../animalBag";
import { BY_ID } from "../collectibles";
import { seededRng } from "../rng";

describe("background animals", () => {
  it("shows a rare animal about 5% of the time, split evenly across all 10 rares", () => {
    const rng = seededRng(10);
    const bag: number[] = [];
    const N = 100_000;
    const rareCounts = Array<number>(ALL_RARES).fill(0);
    let rare = 0;
    for (let i = 0; i < N; i++) {
      const a = nextAnimal(bag, rng);
      if (isRare(a)) { rare++; rareCounts[a - COMMON]++; }
    }
    expect(rare / N).toBeGreaterThan(0.045);
    expect(rare / N).toBeLessThan(0.055);
    expect(ALL_RARES).toBe(10);
    rareCounts.forEach((c) => expect(c / rare).toBeGreaterThan(0.08));     // about 1/10 each
  });

  it("the parity check's classic mode only ever shows the reference's 5 rares", () => {
    const rng = seededRng(12);
    const bag: number[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < 50_000; i++) {
      const a = nextAnimal(bag, rng, REFERENCE_RARES);
      if (isRare(a)) seen.add(a);
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([13, 14, 15, 16, 17]);
  });

  it("new rares have their own names, art and collectible ids", () => {
    expect([18, 19, 20, 21, 22].map(animalName)).toEqual(["Narwhal", "Flamingo", "Red Panda", "Sloth", "Peacock"]);
    expect(animalId(20)).toBe("red-panda");
    for (let i = 0; i < 23; i++) expect(BY_ID.get(animalId(i))?.svg).toBe(animalSvg(i));
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
