import { COMMON } from "../art/animals";
import { REFERENCE_RARES } from "./animalBag";
import { COLLECTIBLES, isQuestGroup, type Caught, type Collectible, type Group } from "./collectibles";
import type { Rng } from "./rng";

/** The reference's Pick-a-Pet grid: 13 regulars + its 5 rares. */
const REFERENCE_PICKS = COMMON + REFERENCE_RARES;

/** Random animal of the quest's type, favoring ones he doesn't have yet. */
export function rollElement(key: Group, caught: Caught, rng: Rng): Collectible {
  const pool: Collectible[] = [], fresh: Collectible[] = [];
  COLLECTIBLES.forEach((c) => {
    if (c.group !== key) return;
    pool.push(c);
    if (!caught[c.id]) fresh.push(c);
  });
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(rng() * from.length)];
}

/** Mystery Box: any quest animal or creature (elements and Greek myths), no preference for new ones. */
export function rollMystery(rng: Rng): Collectible {
  const pool = COLLECTIBLES.filter((c) => isQuestGroup(c.group));
  return pool[Math.floor(rng() * pool.length)];
}

export interface PickOption {
  collectible: Collectible;
  rare: boolean;
  have: number;
  disabled: boolean;
  status: "new" | "have" | "wait";
}

/**
 * Pick-a-Pet: the 13 regulars and every rare (or, with classic, only the reference's 5).
 * Rares are disabled ("tomorrow") once one was picked today.
 */
export function pickOptions(caught: Caught, rareUsedToday: boolean, classic = false): PickOption[] {
  return COLLECTIBLES.filter((c) => c.group === "animals" || c.group === "rare")
    .slice(0, classic ? REFERENCE_PICKS : undefined)
    .map((c) => {
      const rare = c.group === "rare";
      const have = caught[c.id] || 0;
      const disabled = rare && rareUsedToday;
      return { collectible: c, rare, have, disabled, status: disabled ? "wait" : have ? "have" : "new" };
    });
}
