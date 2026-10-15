// Migrations + row level security, run against in-memory Postgres (PGlite) with a Supabase shim.

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { COLLECTIBLES } from "../../src/game/logic/collectibles";
import { addParent, asAnon, asUser, failure, freshDb } from "./db";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
let db: PGlite;
let childA: string, childB: string, runB: string;

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

async function seedFamily(parent: string, name: string) {
  return asUser(db, parent, async (tx) => {
    const c = (await tx.query<{ id: string }>("insert into children (name, avatar) values ($1, 'fox') returning id", [name])).rows[0].id;
    const run = uuid();
    await tx.query("insert into quest_runs (id, child_id, quest_id, length, started_at) values ($1, $2, 'water', 10, now())", [run, c]);
    await tx.query("insert into attempts (id, child_id, a, b, given_answer, correct, response_ms, mode, created_at) values ($1, $2, 7, 8, 56, true, 1800, 'practice', now())", [uuid(), c]);
    await tx.query("insert into catches (id, child_id, collectible_id, source, created_at) values ($1, $2, 'cat', 'practice', now())", [uuid(), c]);
    await tx.query("insert into game_state (child_id, review_pile) values ($1, '{\"7x8\": 2}')", [c]);
    return { c, run };
  });
}

beforeAll(async () => {
  db = await freshDb();
  await addParent(db, A, "America/Los_Angeles");
  await addParent(db, B, "Europe/London");
  childA = (await seedFamily(A, "Ana")).c;
  const b = await seedFamily(B, "Ben");
  childB = b.c;
  runB = b.run;
}, 60_000);

describe("migrations", () => {
  it("enable RLS on every public table", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname");
    expect(rows.length).toBe(8);
    rows.forEach((r) => expect(r.relrowsecurity, r.relname).toBe(true));
  });

  it("seed the same 82 collectibles as the game, in order", async () => {
    const { rows } = await db.query<{ id: string; grp: string }>("select id, grp from collectibles order by sort");
    expect(rows.map((r) => r.id)).toEqual(COLLECTIBLES.map((c) => c.id));
    expect(rows.map((r) => r.grp)).toEqual(COLLECTIBLES.map((c) => c.group));
  });

  it("create parent settings at sign-up with the browser's time zone", async () => {
    const { rows } = await db.query<{ parent_id: string; time_zone: string; fluency_ms: number }>(
      "select parent_id, time_zone, fluency_ms from parent_settings order by time_zone");
    expect(rows).toEqual([
      { parent_id: A, time_zone: "America/Los_Angeles", fluency_ms: 3000 },
      { parent_id: B, time_zone: "Europe/London", fluency_ms: 3000 },
    ]);
  });
});

describe("RLS: parent A can't see or touch parent B's family", () => {
  const tables = ["children", "attempts", "catches", "game_state", "quest_runs", "parent_settings", "backpack"];

  it.each(tables)("A sees only their own rows in %s", async (t) => {
    const rows = await asUser(db, A, async (tx) => (await tx.query<Record<string, string>>(`select * from ${t}`)).rows);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      if (t === "children") expect(r.parent_id).toBe(A);
      else if (t === "parent_settings") expect(r.parent_id).toBe(A);
      else expect(r.child_id).toBe(childA);
    }
  });

  it("A can't read B's child even by id", async () => {
    const rows = await asUser(db, A, async (tx) => (await tx.query("select * from children where id = $1", [childB])).rows);
    expect(rows).toEqual([]);
  });

  it("A can't add attempts, catches, quest runs or game state for B's child", async () => {
    const tries = [
      ["insert into attempts (id, child_id, a, b, given_answer, correct, response_ms, mode, created_at) values ($1, $2, 3, 4, 12, true, 900, 'practice', now())", [uuid(), childB]],
      ["insert into catches (id, child_id, collectible_id, source, created_at) values ($1, $2, 'dog', 'practice', now())", [uuid(), childB]],
      ["insert into quest_runs (id, child_id, quest_id, length, started_at) values ($1, $2, 'fire', 14, now())", [uuid(), childB]],
      ["insert into game_state (child_id) values ($1)", [childB]],
    ] as const;
    for (const [sql, params] of tries) {
      expect(await failure(asUser(db, A, (tx) => tx.query(sql, [...params])))).toMatch(/row-level security|duplicate key/);
    }
  });

  it("A can't move a child to B, or create a child under B", async () => {
    expect(await failure(asUser(db, A, (tx) => tx.query("insert into children (parent_id, name, avatar) values ($1, 'Sneaky', 'cat')", [B]))))
      .toMatch(/row-level security/);
    expect(await failure(asUser(db, A, (tx) => tx.query("update children set parent_id = $1 where id = $2", [B, childA]))))
      .toMatch(/permission denied/);
  });

  it("A's updates and deletes don't reach B's rows", async () => {
    await asUser(db, A, async (tx) => {
      await tx.query("update children set name = 'Hacked' where id = $1", [childB]);
      await tx.query("update quest_runs set result = 'won' where id = $1", [runB]);
      await tx.query("delete from children where id = $1", [childB]);
    });
    const ben = await asUser(db, B, async (tx) => (await tx.query<{ name: string }>("select name from children where id = $1", [childB])).rows);
    expect(ben).toEqual([{ name: "Ben" }]);
    const run = await asUser(db, B, async (tx) => (await tx.query<{ result: string }>("select result from quest_runs where id = $1", [runB])).rows);
    expect(run).toEqual([{ result: "quit" }]);
  });

  it("signed-out (anon) can't read anything", async () => {
    for (const t of [...tables, "collectibles"]) {
      expect(await failure(asAnon(db, (tx) => tx.query(`select * from ${t}`))), t).toMatch(/permission denied/);
    }
  });

  it("attempts and catches are append-only", async () => {
    expect(await failure(asUser(db, A, (tx) => tx.query("update attempts set correct = false")))).toMatch(/permission denied/);
    expect(await failure(asUser(db, A, (tx) => tx.query("delete from catches")))).toMatch(/permission denied/);
  });

  it("deleting a child deletes all their data", async () => {
    const { c } = await seedFamily(A, "Temp");
    await asUser(db, A, (tx) => tx.query("select set_child_pin($1, '1111')", [c]));
    await asUser(db, A, (tx) => tx.query("delete from children where id = $1", [c]));
    for (const t of ["attempts", "catches", "game_state", "quest_runs", "child_pins"]) {
      const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from ${t} where child_id = $1`, [c]);
      expect(rows[0].n, t).toBe(0);
    }
  });
});

describe("child PINs", () => {
  it("are stored only as a bcrypt hash, never the PIN itself", async () => {
    await asUser(db, A, (tx) => tx.query("select set_child_pin($1, '4321')", [childA]));
    const { rows } = await db.query<{ pin_hash: string }>("select pin_hash from child_pins where child_id = $1", [childA]);
    expect(rows[0].pin_hash).toMatch(/^\$2[aby]\$08\$/);
    expect(rows[0].pin_hash).not.toContain("4321");
    // the PIN appears nowhere else in the database either
    const dump = await db.query<{ t: string }>(
      "select row_to_json(c)::text as t from children c union all select row_to_json(s)::text from parent_settings s");
    dump.rows.forEach((r) => expect(r.t).not.toContain("4321"));
    const kid = await asUser(db, A, async (tx) => (await tx.query<{ has_pin: boolean }>("select has_pin from children where id = $1", [childA])).rows[0]);
    expect(kid.has_pin).toBe(true);
  });

  it("can't be read by the browser, even by the child's own parent", async () => {
    expect(await failure(asUser(db, A, (tx) => tx.query("select * from child_pins")))).toMatch(/permission denied/);
    expect(await failure(asUser(db, A, (tx) => tx.query("update children set has_pin = false where id = $1", [childA])))).toMatch(/permission denied/);
  });

  it("verify the right PIN, reject a wrong one, and lock after 5 wrong tries", async () => {
    const verify = (pin: string) => asUser(db, A, async (tx) =>
      (await tx.query<{ ok: boolean }>("select verify_child_pin($1, $2) as ok", [childA, pin])).rows[0].ok);
    expect(await verify("4321")).toBe(true);
    for (let i = 0; i < 4; i++) expect(await verify("0000")).toBe(false);
    expect(await verify("4321")).toBe(true);           // a right answer resets the count
    for (let i = 0; i < 5; i++) expect(await verify("0000")).toBe(false);
    expect(await failure(verify("4321"))).toMatch(/pin_locked/);
  });

  it("must be 4 digits, and only the child's parent can set or check it", async () => {
    expect(await failure(asUser(db, A, (tx) => tx.query("select set_child_pin($1, '12a4')", [childA])))).toMatch(/pin_must_be_4_digits/);
    expect(await failure(asUser(db, B, (tx) => tx.query("select set_child_pin($1, '9999')", [childA])))).toMatch(/not_found/);
    expect(await failure(asUser(db, B, (tx) => tx.query("select verify_child_pin($1, '4321')", [childA])))).toMatch(/not_found/);
    expect(await failure(asAnon(db, (tx) => tx.query("select verify_child_pin($1, '4321')", [childA])))).toMatch(/permission denied/);
  });

  it("can be removed", async () => {
    const { c } = await seedFamily(A, "NoPin");
    await asUser(db, A, (tx) => tx.query("select set_child_pin($1, '2222')", [c]));
    await asUser(db, A, (tx) => tx.query("select set_child_pin($1, null)", [c]));
    const ok = await asUser(db, A, async (tx) => (await tx.query<{ ok: boolean }>("select verify_child_pin($1, '') as ok", [c])).rows[0].ok);
    expect(ok).toBe(true);
  });
});

describe("once-a-day rules are enforced by the server", () => {
  const catchAt = (child: string, parent: string, id: string, source: string, at: string, cid = uuid()) =>
    asUser(db, parent, (tx) => tx.query(
      "insert into catches (id, child_id, collectible_id, source, created_at) values ($1, $2, $3, $4, $5) on conflict (id) do nothing",
      [cid, child, id, source, at]));

  it("Mystery Box: one per family-local day", async () => {
    const { c } = await seedFamily(A, "Mia");          // family in America/Los_Angeles
    await catchAt(c, A, "fire-fox", "mystery", "2026-10-14T20:00:00Z");     // Oct 14, 1pm LA
    expect(await failure(catchAt(c, A, "ice-owl", "mystery", "2026-10-15T05:00:00Z")))   // Oct 14, 10pm LA
      .toMatch(/mystery_already_opened_today/);
    await catchAt(c, A, "ice-owl", "mystery", "2026-10-15T08:00:00Z");      // Oct 15, 1am LA: new day
  });

  it("Pick-a-Pet: one rare pick per day; regular picks are unlimited", async () => {
    const { c } = await seedFamily(A, "Pip");
    const t = "2026-10-14T18:00:00Z";
    await catchAt(c, A, "axolotl", "pick", t);
    expect(await failure(catchAt(c, A, "snake", "pick", t))).toMatch(/rare_pick_already_used_today/);
    await catchAt(c, A, "cat", "pick", t);
    await catchAt(c, A, "dog", "pick", t);
    await catchAt(c, A, "axolotl", "practice", t);     // a rare caught in practice doesn't count
  });

  it("a queue retry of the same row is ignored, not rejected", async () => {
    const { c } = await seedFamily(A, "Rex");
    const id = uuid();
    await catchAt(c, A, "golden-cat", "mystery", now(), id);
    await catchAt(c, A, "golden-cat", "mystery", now(), id);   // same id again
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from catches where child_id = $1 and source = 'mystery'", [c]);
    expect(rows[0].n).toBe(1);
  });

  it("the catch source has to fit the animal", async () => {
    expect(await failure(catchAt(childA, A, "fire-fox", "practice", now()))).toMatch(/catch_source_mismatch/);
    expect(await failure(catchAt(childA, A, "cat", "mystery", now()))).toMatch(/catch_source_mismatch/);
  });
});

describe("parent settings", () => {
  it("reject an unknown time zone", async () => {
    expect(await failure(asUser(db, A, (tx) => tx.query("update parent_settings set time_zone = 'Mars/Olympus'")))).toMatch(/invalid_time_zone/);
  });
});
