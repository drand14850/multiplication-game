// Site totals: only the site admin sees them; kids without an account are only daily counts.

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { addAnon, addParent, asAnon, asUser, failure, freshDb } from "./db";

const OWNER = "aaaaaaaa-0000-4000-8000-0000000000f1";
const OTHER = "bbbbbbbb-0000-4000-8000-0000000000f2";
let db: PGlite;

const totals = (uid: string) => asUser(db, uid, async (tx) => (await tx.query<Record<string, number | string>>("select * from site_totals()")).rows);
const tick = (newGuest: boolean, n: number) => asAnon(db, (tx) => tx.query("select guest_tick($1, $2)", [newGuest, n]));

beforeAll(async () => {
  db = await freshDb();
  await addParent(db, OWNER, "UTC");
  await addParent(db, OTHER, "UTC");
  await db.query("insert into site_admins (user_id) values ($1)", [OWNER]);
  // two kids on the other family, one with a sign-in, a few answers
  const kids = (await asUser(db, OTHER, (tx) => tx.query<{ id: string }>(
    "insert into children (name, avatar) values ('A', 'cat'), ('B', 'dog') returning id"))).rows;
  await asUser(db, OTHER, (tx) => tx.query("select set_kid_login($1, 'kid_a', 'abcd')", [kids[0].id]));
  await asUser(db, OTHER, async (tx) => {
    for (const [i, k] of [kids[0], kids[0], kids[1]].entries()) {
      await tx.query("insert into attempts (id, child_id, a, b, given_answer, correct, response_ms, mode, created_at) values ($1, $2, 3, 4, 12, true, 900, 'practice', now() - make_interval(days => $3))",
        [crypto.randomUUID(), k.id, i === 2 ? 10 : 0]);   // the third one is 10 days old
    }
  });
}, 60_000);

describe("kids playing without an account", () => {
  it("are counted as daily totals only", async () => {
    await tick(true, 0);
    await tick(false, 12);
    await tick(true, 5);
    const rows = (await db.query("select * from guest_counts")).rows;
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0] as object).sort()).toEqual(["answers", "day", "new_guests"]);   // nothing else is stored
    expect(rows[0]).toMatchObject({ new_guests: 2, answers: 17 });
  });

  it("files each day under the US Eastern date", async () => {
    const { rows } = await db.query<{ ok: boolean }>(
      "select bool_and(day = (now() at time zone 'America/New_York')::date) as ok from guest_counts");
    expect(rows[0].ok).toBe(true);
  });

  it("can't add more than 1 browser and 50 answers per call, or go negative", async () => {
    const before = (await db.query<{ g: number; a: number }>("select sum(new_guests)::int g, sum(answers)::int a from guest_counts")).rows[0];
    await tick(true, 100000);
    await tick(false, -40);
    const after = (await db.query<{ g: number; a: number }>("select sum(new_guests)::int g, sum(answers)::int a from guest_counts")).rows[0];
    expect(after.g - before.g).toBe(1);
    expect(after.a - before.a).toBe(50);
  });

  it("nobody can read the counts table directly", async () => {
    expect(await failure(asAnon(db, (tx) => tx.query("select * from guest_counts")))).toMatch(/permission denied/);
    expect(await failure(asUser(db, OWNER, (tx) => tx.query("select * from guest_counts")))).toMatch(/permission denied/);
  });
});

describe("site totals", () => {
  it("the admin sees every family, kid accounts, and answers with and without an account", async () => {
    const [t] = await totals(OWNER);
    expect(t).toMatchObject({ grownups: 2, kids: 2, kid_accounts: 1, active_kids_7d: 1 });
    expect(Number(t.questions)).toBe(3);
    expect(Number(t.questions_others)).toBe(3);        // all 3 are the other family's
    expect(Number(t.guests)).toBe(3);
    expect(Number(t.guest_questions)).toBe(67);
    expect(Number(t.questions_today)).toBe(2 + 67);
    expect(Number(t.questions_7d)).toBe(2 + 67);
  });

  it("the admin's own family's answers aren't counted as other families'", async () => {
    const mine = (await asUser(db, OWNER, (tx) => tx.query<{ id: string }>("insert into children (name, avatar) values ('Mine', 'fox') returning id"))).rows[0].id;
    await asUser(db, OWNER, (tx) => tx.query(
      "insert into attempts (id, child_id, a, b, given_answer, correct, response_ms, mode, created_at) values ($1, $2, 6, 7, 42, true, 900, 'practice', now())",
      [crypto.randomUUID(), mine]));
    const [t] = await totals(OWNER);
    expect(Number(t.questions)).toBe(4);
    expect(Number(t.questions_others)).toBe(3);
  });

  it("other parents and kids' devices get nothing", async () => {
    expect(await totals(OTHER)).toEqual([]);
    const dev = "dddddddd-0000-4000-8000-0000000000f3";
    await addAnon(db, dev);
    expect(await totals(dev)).toEqual([]);
    expect(await failure(asAnon(db, (tx) => tx.query("select * from site_totals()")))).toMatch(/permission denied/);
  });

  it("the admin list itself is closed", async () => {
    expect(await failure(asUser(db, OWNER, (tx) => tx.query("select * from site_admins")))).toMatch(/permission denied/);
    expect(await failure(asUser(db, OTHER, (tx) => tx.query("insert into site_admins (user_id) values ($1)", [OTHER])))).toMatch(/permission denied/);
  });
});
