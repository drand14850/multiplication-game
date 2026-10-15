import type { ElementKey } from "../art/elements";
import { COLLECTIBLES, isElementGroup, type Caught, type Collectible } from "./collectibles";
import type { Rng } from "./rng";

/** Random animal of the quest's type, favoring ones he doesn't have yet. */
export function rollElement(key: ElementKey, caught: Caught, rng: Rng): Collectible {
  const pool: Collectible[] = [], fresh: Collectible[] = [];
  COLLECTIBLES.forEach((c) => {
    if (c.group !== key) return;
    pool.push(c);
    if (!caught[c.id]) fresh.push(c);
  });
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(rng() * from.length)];
}

/** Mystery Box: any of the 64 element animals, no preference for new ones. */
export function rollMystery(rng: Rng): Collectible {
  const pool = COLLECTIBLES.filter((c) => isElementGroup(c.group));
  return pool[Math.floor(rng() * pool.length)];
}

export interface PickOption {
  collectible: Collectible;
  rare: boolean;
  have: number;
  disabled: boolean;
  status: "new" | "have" | "wait";
}

/** Pick-a-Pet: the 13 regular + 5 rare. Rares are disabled ("tomorrow") once one was picked today. */
export function pickOptions(caught: Caught, rareUsedToday: boolean): PickOption[] {
  return COLLECTIBLES.filter((c) => c.group === "animals" || c.group === "rare").map((c) => {
    const rare = c.group === "rare";
    const have = caught[c.id] || 0;
    const disabled = rare && rareUsedToday;
    return { collectible: c, rare, have, disabled, status: disabled ? "wait" : have ? "have" : "new" };
  });
}
