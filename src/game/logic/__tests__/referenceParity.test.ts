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
  it("has the same 82 collectibles, in order, with identical art", () => {
    expect(COLLECTIBLES).toHaveLength(82);
    expect(ref.COLLECTIBLES).toHaveLength(82);
    COLLECTIBLES.forEach((c, i) => {
      const r = ref.COLLECTIBLES[i];
      expect(c.name).toBe(r.name);
      expect(c.label).toBe(r.label);
      expect(c.group).toBe(r.group);
      expect(c.svg).toBe(r.svg);
    });
  });

  it("uses stable lowercase ids like fire-fox", () => {
    const ids = COLLECTIBLES.map((c) => c.id);
    expect(new Set(ids).size).toBe(82);
    expect(ids).toContain("cat");
    expect(ids).toContain("axolotl");
    expect(ids).toContain("fire-fox");
    expect(ids).toContain("golden-penguin");
    ids.forEach((id) => expect(id).toMatch(/^[a-z]+(-[a-z]+)?$/));
  });

  it("has identical emblems, quests and backpack groups", () => {
    expect(EMBLEMS).toEqual(ref.EMBLEMS);
    expect(QUESTS).toEqual(ref.QUESTS);
    expect(GROUPS).toEqual(ref.GROUPS);
  });
});
