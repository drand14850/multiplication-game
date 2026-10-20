import { ANIMALS, NAMES } from "../art/animals";
import { EXTRA_RARES } from "../art/extraAnimals";
import { ELEMENTS, elementArt, type ElementKey } from "../art/elements";
import { animalId, isRare } from "./animalBag";

export type Group = "animals" | "rare" | ElementKey;

export interface Collectible {
  id: string;     // stable: "cat", "axolotl", "fire-fox"
  name: string;   // reference display name: "Cat", "Fire Fox"
  label: string;  // backpack label: "Fox"
  group: Group;
  svg: string;
}

/** Everything that can go in the backpack, in collection order: the reference's 82, then 8 Tropical, then 5 new rares. */
export const COLLECTIBLES: readonly Collectible[] = (() => {
  const out: Collectible[] = [];
  ANIMALS.forEach((art, i) => {
    out.push({ id: NAMES[i].toLowerCase(), name: NAMES[i], label: NAMES[i], svg: art, group: isRare(i) ? "rare" : "animals" });
  });
  (Object.keys(ELEMENTS) as ElementKey[]).forEach((k) => {
    ELEMENTS[k].animals.forEach((base) => {
      out.push({ id: k + "-" + base.toLowerCase(), name: ELEMENTS[k].label + " " + base, label: base, svg: elementArt(base, k), group: k });
    });
  });
  // rare animals added after the port: appended, so every earlier id and position stays put
  EXTRA_RARES.forEach((a, i) => {
    out.push({ id: animalId(ANIMALS.length + i), name: a.name, label: a.name, svg: a.svg, group: "rare" });
  });
  return out;
})();

export const BY_ID: ReadonlyMap<string, Collectible> = new Map(COLLECTIBLES.map((c) => [c.id, c]));

export const GROUPS: readonly { key: Group; label: string }[] = [
  { key: "animals", label: "Animals" },
  { key: "rare",    label: "Rare" },
  { key: "water",   label: "Water animals" },
  { key: "earth",   label: "Earth animals" },
  { key: "fire",    label: "Fire animals" },
  { key: "ice",     label: "Ice animals" },
  { key: "emerald", label: "Emerald animals" },
  { key: "ruby",    label: "Ruby animals" },
  { key: "golden",  label: "Golden animals" },
  { key: "diamond", label: "Diamond animals" },
  { key: "tropical", label: "Tropical animals" },   // added after the port
];

export function isElementGroup(g: Group | string): g is ElementKey {
  return g in ELEMENTS;
}

/** collectible id -> times caught */
export type Caught = Record<string, number>;

export function caughtCount(caught: Caught): number {
  return Object.keys(caught).filter((id) => caught[id] > 0).length;
}
