import { ANIMALS, COMMON, NAMES } from "../art/animals";
import { EXTRA_RARES } from "../art/extraAnimals";
import { RARE_CHANCE } from "./constants";
import type { Rng } from "./rng";

// Background animals by index: the reference's 18 (13 regular, 5 rare), then the rare
// animals added since. Index order never changes, so saved games stay valid.
const BG_NAMES: readonly string[] = [...NAMES, ...EXTRA_RARES.map((a) => a.name)];
const BG_SVGS: readonly string[] = [...ANIMALS, ...EXTRA_RARES.map((a) => a.svg)];

/** The reference's 5 rares (used by the parity check); every rare since then is on top. */
export const REFERENCE_RARES = ANIMALS.length - COMMON;
export const ALL_RARES = BG_NAMES.length - COMMON;

export function isRare(i: number): boolean {
  return i >= COMMON;
}
export function animalName(i: number): string { return BG_NAMES[i]; }
export function animalSvg(i: number): string { return BG_SVGS[i]; }
/** Stable collectible id: "cat", "axolotl", "red-panda". */
export function animalId(i: number): string { return BG_NAMES[i].toLowerCase().replace(/ /g, "-"); }
export const BACKGROUND_ANIMAL_COUNT = BG_NAMES.length;

/**
 * Background animal for the next practice problem (reference nextAnimal()).
 * 5% a random rare (doesn't use up the bag), shared evenly among `rares` rare animals;
 * otherwise the next of a shuffled bag of the 13 regulars, reshuffled once every one has
 * had a turn. Mutates `bag`.
 */
export function nextAnimal(bag: number[], rng: Rng, rares: number = ALL_RARES): number {
  if (rng() < RARE_CHANCE) {
    return COMMON + Math.floor(rng() * rares);
  }
  if (!bag.length) {
    for (let i = 0; i < COMMON; i++) bag.push(i);
    for (let k = bag.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      const t = bag[k]; bag[k] = bag[j]; bag[j] = t;
    }
  }
  return bag.pop()!;
}
