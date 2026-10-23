// Runs the reference file's own art/quest code and checks the port produces identical data.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EMBLEMS } from "../../art/emblems";
import { COLLECTIBLES, GROUPS } from "../collectibles";
import { QUESTS } from "../quests";

interface RefCollectible { name: string; label: string; svg: string; group: string }
interface Ref {
  COLLECTIBLES: RefCollectible[];
  EMBLEMS: Record<string, string>;
  QUESTS: { id: string; name: string; len: number; color: string; blurb: string }[];
  GROUPS: { key: string; label: string }[];
}

function loadReference(): Ref {
  const html = readFileSync(fileURLToPath(new URL("../../../../reference/times-tables.html", import.meta.url)), "utf8");
  const lines = html.split(/\r?\n/);
  // L456 ("/* ---------- animals") through L817 (end of QUESTS): pure JS, no DOM.
  const start = lines.findIndex((l) => l.includes("/* ---------- animals ---------- */"));
  const end = lines.findIndex((l, i) => i > start && l.trim() === "];" && lines[i - 1].includes('id: "diamond"'));
  const body = lines.slice(start, end + 1).join("\n");
  return new Function(body + "\nreturn { COLLECTIBLES: COLLECTIBLES, EMBLEMS: EMBLEMS, QUESTS: QUESTS, GROUPS: GROUPS };")() as Ref;
}

const ref = loadReference();

describe("port matches the reference file", () => {
  // Additions since the port (Tropical) only ever come after the reference's items, so
  // existing backpacks keep every animal they had.
  const ADDED_GROUPS = ["tropical", "myth"];

  it("keeps all 82 reference collectibles first, in order, with identical art", () => {
    expect(ref.COLLECTIBLES).toHaveLength(82);
    ref.COLLECTIBLES.forEach((r, i) => {
      const c = COLLECTIBLES[i];
      expect(c.name).toBe(r.name);
      expect(c.label).toBe(r.label);
      expect(c.group).toBe(r.group);
      expect(c.svg).toBe(r.svg);
    });
  });

  it("only adds Tropical, then the new rares, then the Greek myth creatures after them", () => {
    const added = COLLECTIBLES.slice(82);
    expect(added.map((c) => c.id)).toEqual(["tropical-frog", "tropical-turtle", "tropical-chameleon", "tropical-snake",
      "tropical-lizard", "tropical-elephant", "tropical-whale", "tropical-axolotl",
      "narwhal", "flamingo", "red-panda", "sloth", "peacock",
      "myth-hydra", "myth-pegasus", "myth-cerberus", "myth-minotaur", "myth-griffin", "myth-phoenix", "myth-centaur", "myth-medusa"]);
    added.slice(0, 8).forEach((c) => expect(c.group).toBe("tropical"));
    added.slice(8, 13).forEach((c) => expect(c.group).toBe("rare"));
    added.slice(13).forEach((c) => expect(c.group).toBe("myth"));
  });

  it("uses stable lowercase ids like fire-fox", () => {
    const ids = COLLECTIBLES.map((c) => c.id);
    expect(new Set(ids).size).toBe(COLLECTIBLES.length);
    expect(ids).toContain("cat");
    expect(ids).toContain("axolotl");
    expect(ids).toContain("fire-fox");
    expect(ids).toContain("golden-penguin");
    ids.forEach((id) => expect(id).toMatch(/^[a-z]+(-[a-z]+)?$/));
  });

  it("keeps the reference's emblems, quests and backpack groups, plus Tropical", () => {
    const { tropical, myth, ...emblems } = EMBLEMS;
    expect(emblems).toEqual(ref.EMBLEMS);
    expect(tropical).toBeTruthy();
    expect(myth).toBeTruthy();
    // same quests; lengths were shortened later, and refLen keeps the reference's
    expect(QUESTS.filter((q) => !ADDED_GROUPS.includes(q.id))
      .map(({ id, name, refLen, color, blurb }) => ({ id, name, len: refLen, color, blurb }))).toEqual(ref.QUESTS);
    expect(GROUPS.filter((g) => !ADDED_GROUPS.includes(g.key))).toEqual(ref.GROUPS);
    // quests stay in length order, and Diamond is still the longest
    expect(QUESTS.map((q) => q.len)).toEqual([...QUESTS.map((q) => q.len)].sort((x, y) => x - y));
    expect(QUESTS.at(-1)!.id).toBe("diamond");
  });
});
