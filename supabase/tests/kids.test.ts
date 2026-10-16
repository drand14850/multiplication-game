// Kid accounts: family codes, sign-up, sign-in on any device, and what a kid's session may do.

import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { addAnon, addParent, asUser, failure, freshDb } from "./db";

const PARENT_A = "aaaaaaaa-0000-4000-8000-0000000000a1";
const PARENT_B = "bbbbbbbb-0000-4000-8000-0000000000b1";
let db: PGlite;
let codeA: string, codeB: string;
let n = 0;

const uuid = () => crypto.randomUUID();
/** A fresh device: a new anonymous session. */
async function device(): Promise<string> {
  const id = `dddddddd-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  await addAnon(db, id);
  return id;
}
const call = async <T = Record<string, string>>(uid: string, sql: string, params: unknown[] = []) =>
  (await asUser(db, uid, (tx) => tx.query<{ r: T }>(sql, params))).rows[0]?.r;
const signUp = (dev: string, code: string, user: string, pass: string, avatar = "fox") =>
  call<{ child_id?: string; error?: string }>(dev, "select kid_sign_up($1, $2, $3, $4) as r", [code, user, pass, avatar]);
const signIn = (dev: string, user: string, pass: string) =>
  call<{ child_id?: string; error?: string }>(dev, "select kid_sign_in($1, $2) as r", [user, pass]);
const attempt = (dev: string, child: string) => asUser(db, dev, (tx) => tx.query(
  "insert into attempts (id, child_id, a, b, given_answer, correct, response_ms, mode, created_at) values ($1, $2, 7, 8, 56, true, 1500, 'practice', now())",
  [uuid(), child]));

beforeAll(async () => {
  db = await freshDb();
  await addParent(db, PARENT_A, "America/Chicago");
  await addParent(db, PARENT_B, "UTC");
  codeA = (await db.query<{ c: string }>("select family_code c from parent_settings where parent_id = $1", [PARENT_A])).rows[0].c;
  codeB = (await db.query<{ c: string }>("select family_code c from parent_settings where parent_id = $1", [PARENT_B])).rows[0].c;
}, 60_000);

describe("family codes", () => {
  it("every parent gets one, like ABCD-2345, without look-alike letters", () => {
    expect(codeA).toMatch(/^[A-HJKMNP-Z]{4}-[2-9]{4}$/);
    expect(codeA).not.toBe(codeB);
  });

  it("anonymous device sessions never become parents", async () => {
    const dev = await device();
    const { rows } = await db.query("select 1 from parent_settings where parent_id = $1", [dev]);
    expect(rows).toEqual([]);
    expect(await failure(asUser(db, dev, (tx) => tx.query("insert into parent_settings (parent_id) values ($1)", [dev]))))
      .toMatch(/permission denied/);
    expect(await failure(asUser(db, dev, (tx) => tx.query("insert into children (parent_id, name, avatar) values ($1, 'x', 'cat')", [dev]))))
      .toMatch(/row-level security/);
  });

  it("a parent can make a new one, and the old one stops working", async () => {
    const p = "cccccccc-0000-4000-8000-0000000000c1";
    await addParent(db, p);
    const old = (await db.query<{ c: string }>("select family_code c from parent_settings where parent_id = $1", [p])).rows[0].c;
    const fresh = await call<string>(p, "select new_family_code() as r");
    expect(fresh).not.toBe(old);
    expect(await signUp(await device(), old, "late_kid", "abcd")).toEqual({ error: "bad_family_code" });
    expect((await signUp(await device(), fresh, "late_kid", "abcd")).child_id).toBeTruthy();
  });

  it("parents can't change the code directly", async () => {
    expect(await failure(asUser(db, PARENT_A, (tx) => tx.query("update parent_settings set family_code = 'AAAA-2222'"))))
      .toMatch(/permission denied/);
  });
});

describe("kid sign-up", () => {
  it("with the family code: a child on that family's dashboard, signed in on this device", async () => {
    const dev = await device();
    const r = await signUp(dev, codeA, "  Leo_7 ", "tiger", "owl");
    expect(r.child_id).toBeTruthy();
    const kid = (await db.query<{ parent_id: string; name: string; avatar: string }>("select parent_id, name, avatar from children where id = $1", [r.child_id])).rows[0];
    expect(kid).toEqual({ parent_id: PARENT_A, name: "leo_7", avatar: "owl" });
    const me = await asUser(db, dev, async (tx) => (await tx.query("select * from kid_me()")).rows[0]);
    expect(me).toMatchObject({ child_id: r.child_id, username: "leo_7", avatar: "owl", time_zone: "America/Chicago" });
  });

  it("the code is forgiving about case, spaces and the dash", async () => {
    const loose = codeA.toLowerCase().replace("-", " ");
    expect((await signUp(await device(), loose, "mia", "abcd")).child_id).toBeTruthy();
  });

  it("explains what's wrong", async () => {
    expect(await signUp(await device(), "ZZZZ-9999", "nope", "abcd")).toEqual({ error: "bad_family_code" });
    expect(await signUp(await device(), codeA, "leo_7", "abcd")).toEqual({ error: "username_taken" });
    expect(await signUp(await device(), codeA, "LEO_7", "abcd")).toEqual({ error: "username_taken" });   // usernames ignore case
    expect(await signUp(await device(), codeA, "a b", "abcd")).toEqual({ error: "bad_username" });
    expect(await signUp(await device(), codeA, "ok_name", "abc")).toEqual({ error: "password_too_short" });
    expect(await signUp(PARENT_A, codeA, "parent_kid", "abcd")).toEqual({ error: "parents_cannot_be_kids" });
  });

  it("stores only a bcrypt hash of the password", async () => {
    await signUp(await device(), codeA, "hash_check", "purple-dino");
    const { rows } = await db.query<{ pass_hash: string }>("select pass_hash from kid_logins where username = 'hash_check'");
    expect(rows[0].pass_hash).toMatch(/^\$2[aby]\$08\$/);
    expect(rows[0].pass_hash).not.toContain("purple-dino");
  });

  it("slows down someone guessing family codes", async () => {
    const dev = await device();
    for (let i = 0; i < 10; i++) expect(await signUp(dev, "QQQQ-2222", "g" + i + "xx", "abcd")).toEqual({ error: "bad_family_code" });
    expect(await signUp(dev, codeA, "guesser", "abcd")).toEqual({ error: "too_many_tries" });   // even with the right code now
  });
});

describe("kid sign-in on any device", () => {
  let leo: string;
  beforeAll(async () => {
    leo = (await signUp(await device(), codeA, "leo_school", "rocket")).child_id!;
  });

  it("username + password on a new device links it to the same child", async () => {
    const school = await device();
    expect(await signIn(school, "Leo_School", "rocket")).toEqual({ child_id: leo });
    await attempt(school, leo);
    const { rows } = await db.query<{ n: number }>("select count(*)::int n from attempts where child_id = $1", [leo]);
    expect(rows[0].n).toBe(1);
  });

  it("a wrong password is refused, and 5 in a row lock the account for a minute", async () => {
    const dev = await device();
    for (let i = 0; i < 4; i++) expect(await signIn(dev, "leo_school", "nope")).toEqual({ error: "wrong_username_or_password" });
    expect(await signIn(dev, "leo_school", "rocket")).toEqual({ child_id: leo });           // right one resets the count
    for (let i = 0; i < 5; i++) expect(await signIn(dev, "leo_school", "nope")).toEqual({ error: "wrong_username_or_password" });
    expect(await signIn(dev, "leo_school", "rocket")).toEqual({ error: "locked" });         // the lock stuck
    await db.query("update kid_logins set locked_until = now() - interval '1 second' where child_id = $1", [leo]);
    expect(await signIn(dev, "leo_school", "rocket")).toEqual({ child_id: leo });
  });

  it("an unknown username gives the same answer as a wrong password", async () => {
    expect(await signIn(await device(), "nobody_here", "x")).toEqual({ error: "wrong_username_or_password" });
  });

  it("signing out unlinks the device", async () => {
    const dev = await device();
    await signIn(dev, "leo_school", "rocket");
    await asUser(db, dev, (tx) => tx.query("select kid_sign_out()"));
    expect(await asUser(db, dev, async (tx) => (await tx.query("select * from kid_me()")).rows)).toEqual([]);
    expect(await failure(attempt(dev, leo))).toMatch(/row-level security/);
  });
});

describe("what a kid's device may do", () => {
  let kid: string, sibling: string, otherFamily: string, dev: string;
  beforeAll(async () => {
    dev = await device();
    kid = (await signUp(dev, codeA, "only_me", "abcd")).child_id!;
    sibling = (await signUp(await device(), codeA, "my_sister", "abcd")).child_id!;
    otherFamily = (await signUp(await device(), codeB, "stranger", "abcd")).child_id!;
  });

  it("plays and saves as itself: attempts, catches, quest runs, saved game", async () => {
    await attempt(dev, kid);
    await asUser(db, dev, async (tx) => {
      await tx.query("insert into catches (id, child_id, collectible_id, source, created_at) values ($1, $2, 'cat', 'practice', now())", [uuid(), kid]);
      await tx.query("insert into quest_runs (id, child_id, quest_id, length, started_at) values ($1, $2, 'water', 10, now())", [uuid(), kid]);
      await tx.query("insert into game_state (child_id, review_pile) values ($1, '{\"7x8\": 2}')", [kid]);
      expect((await tx.query("select * from backpack")).rows).toEqual([{ child_id: kid, collectible_id: "cat", n: 1 }]);
    });
  });

  it("can't touch a sibling's or another family's data", async () => {
    for (const other of [sibling, otherFamily]) {
      expect(await failure(attempt(dev, other))).toMatch(/row-level security/);
      const rows = await asUser(db, dev, async (tx) => (await tx.query("select * from children where id = $1", [other])).rows);
      expect(rows).toEqual([]);
    }
    const all = await asUser(db, dev, async (tx) => (await tx.query<{ id: string }>("select id from children")).rows);
    expect(all.map((r) => r.id)).toEqual([kid]);
  });

  it("can't see the family settings or other kids' usernames", async () => {
    expect(await asUser(db, dev, async (tx) => (await tx.query("select * from parent_settings")).rows)).toEqual([]);
    expect(await failure(asUser(db, dev, (tx) => tx.query("select * from kid_logins")))).toMatch(/permission denied/);
    expect(await asUser(db, dev, async (tx) => (await tx.query("select * from my_kid_logins()")).rows)).toEqual([]);
  });

  it("can't rename or delete itself, or use the grown-up functions", async () => {
    await asUser(db, dev, async (tx) => {
      await tx.query("update children set name = 'hacked' where id = $1", [kid]);
      await tx.query("delete from children where id = $1", [kid]);
    });
    expect((await db.query<{ name: string }>("select name from children where id = $1", [kid])).rows).toEqual([{ name: "only_me" }]);
    expect(await failure(asUser(db, dev, (tx) => tx.query("select set_kid_login($1, 'renamed', 'abcd')", [kid])))).toMatch(/not_found/);
    expect(await failure(asUser(db, dev, (tx) => tx.query("select new_family_code()")))).toMatch(/not_found/);
    expect(await failure(asUser(db, dev, (tx) => tx.query("select sign_out_kid_devices($1)", [kid])))).toMatch(/not_found/);
  });
});

describe("grown-up side", () => {
  it("gives an existing child (with progress) a username and password", async () => {
    const child = (await asUser(db, PARENT_A, (tx) => tx.query<{ id: string }>("insert into children (name, avatar) values ('Sam', 'bear') returning id"))).rows[0].id;
    await asUser(db, PARENT_A, (tx) => tx.query("select set_kid_login($1, 'sam_r', 'bananas')", [child]));
    const dev = await device();
    expect(await signIn(dev, "sam_r", "bananas")).toEqual({ child_id: child });
    // a username change keeps the password
    await asUser(db, PARENT_A, (tx) => tx.query("select set_kid_login($1, 'sammy', null)", [child]));
    expect(await signIn(await device(), "sammy", "bananas")).toEqual({ child_id: child });
    const logins = await asUser(db, PARENT_A, async (tx) => (await tx.query<{ username: string }>("select username from my_kid_logins() where child_id = $1", [child])).rows);
    expect(logins).toEqual([{ username: "sammy" }]);
  });

  it("can sign out all of a kid's devices", async () => {
    const dev = await device();
    const child = (await signUp(dev, codeA, "lost_tablet", "abcd")).child_id!;
    await asUser(db, PARENT_A, (tx) => tx.query("select sign_out_kid_devices($1)", [child]));
    expect(await failure(attempt(dev, child))).toMatch(/row-level security/);
  });

  it("only for their own kids", async () => {
    const theirs = (await signUp(await device(), codeB, "not_yours", "abcd")).child_id!;
    expect(await failure(asUser(db, PARENT_A, (tx) => tx.query("select set_kid_login($1, 'grab', 'abcd')", [theirs])))).toMatch(/not_found/);
  });

  it("deleting a child removes their sign-in and signs out their devices", async () => {
    const dev = await device();
    const child = (await signUp(dev, codeA, "gone_kid", "abcd")).child_id!;
    await asUser(db, PARENT_A, (tx) => tx.query("delete from children where id = $1", [child]));
    expect(await signIn(await device(), "gone_kid", "abcd")).toEqual({ error: "wrong_username_or_password" });
    expect((await db.query("select 1 from kid_sessions where child_id = $1", [child])).rows).toEqual([]);
  });
});

describe("progress carried over from playing without an account", () => {
  it("'import' catches skip the once-a-day rules", async () => {
    const dev = await device();
    const kid = (await signUp(dev, codeA, "was_a_guest", "abcd")).child_id!;
    await asUser(db, dev, async (tx) => {
      for (const id of ["fire-fox", "ice-owl", "axolotl", "snake"]) {
        await tx.query("insert into catches (id, child_id, collectible_id, source, created_at) values ($1, $2, $3, 'import', now())", [uuid(), kid, id]);
      }
    });
    const { rows } = await db.query<{ n: number }>("select count(*)::int n from catches where child_id = $1", [kid]);
    expect(rows[0].n).toBe(4);
  });
});
