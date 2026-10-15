import { ANIMALS, COMMON } from "../art/animals";
import { RARE_CHANCE } from "./constants";
import type { Rng } from "./rng";

export function isRare(i: number): boolean {
  return i >= COMMON;
}

/**
 * Background animal for the next practice problem (reference nextAnimal()).
 * 5% a random rare (doesn't use up the bag); otherwise the next of a shuffled bag
 * of the 13 regulars, reshuffled once every one has had a turn. Mutates `bag`.
 */
export function nextAnimal(bag: number[], rng: Rng): number {
  if (rng() < RARE_CHANCE) {
    return COMMON + Math.floor(rng() * (ANIMALS.length - COMMON));
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
