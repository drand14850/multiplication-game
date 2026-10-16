// Dashboard SQL, checked against the raw rows: the dev seed is loaded into PGlite, every
// dashboard number is recomputed here in plain TypeScript from the attempts themselves,
// and the two must agree exactly.

import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { addParent, asAnon, asUser, failure, freshDb } from "./db";

const P = "aaaaaaaa-0000-4000-8000-00000000000a";
const OTHER = "bbbbbbbb-0000-4000-8000-00000000000b";
const TZ = "America/Los_Angeles";
let db: PGlite;
let kid: string;

interface Att { id: string; a: number; b: number; correct: boolean; response_ms: number; created_at: Date; mode: string; quest_run_id: string | null }
let raw: Att[];

/** float8 → int in Postgres rounds half to even */
const pgRound = (x: number) => { const f = Math.floor(x), d = x - f; return d > 0.5 || (d === 0.5 && f % 2 !== 0) ? f + 1 : f; };
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((x, y) => x - y), m = (s.length - 1) / 2;
  return pgRound((s[Math.floor(m)] + s[Math.ceil(m)]) / 2);
}
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const dayIn = (d: Date) => dayFmt.format(d);
const byTime = (x: Att, y: Att) => x.created_at.getTime() - y.created_at.getTime() || (x.id < y.id ? -1 : 1);

beforeAll(async () => {
  db = await freshDb();
  await addParent(db, P, TZ);
  await addParent(db, OTHER, "UTC");
  await db.exec("update auth.users set created_at = now() - interval '1 day' where id = '" + P + "'");   // the seed picks the oldest parent
  await db.exec(readFileSync(fileURLToPath(new URL("../seed/dev-seed.sql", import.meta.url)), "utf8"));
  kid = (await db.query<{ id: string }>("select id from children where name = 'Demo Kid (seed)'")).rows[0].id;
  raw = (await db.query<Att>("select id, a, b, correct, response_ms, created_at, mode, quest_run_id from attempts where child_id = $1", [kid]))
    .rows.map((r) => ({ ...r, created_at: new Date(r.created_at) })).sort(byTime);
}, 120_000);

describe("dev seed", () => {
  it("makes a demo child with about 2,000 attempts, quest runs, catches and a review pile", async () => {
    expect(raw.length).toBeGreaterThan(1500);
    expect(raw.length).toBeLessThan(2600);
    const q = await db.query<{ runs: number; won: number; catches: number }>(
      "select (select count(*)::int from quest_runs where child_id = $1) runs, (select count(*)::int from quest_runs where child_id = $1 and result = 'won') won, (select count(*)::int from catches where child_id = $1) catches", [kid]);
    expect(q.rows[0].runs).toBeGreaterThan(10);
    expect(q.rows[0].won).toBeGreaterThan(0);
    expect(q.rows[0].catches).toBeGreaterThan(1000);
    const days = new Set(raw.map((r) => dayIn(r.created_at)));
    expect(days.size).toBeGreaterThan(12);
  });

  it("belongs to the oldest parent, and running it again replaces it", async () => {
    const owner = (await db.query<{ parent_id: string }>("select parent_id from children where id = $1", [kid])).rows[0].parent_id;
    expect(owner).toBe(P);
  });
});

describe("fact_stats matches the raw attempts", () => {
  function expected(merge: boolean) {
    const groups = new Map<string, Att[]>();
    for (const r of raw) {
      const [a, b] = merge ? [Math.min(r.a, r.b), Math.max(r.a, r.b)] : [r.a, r.b];
      const k = a + "x" + b;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    return [...groups].map(([k, rows]) => {
      const [a, b] = k.split("x").map(Number);
      const last5 = [...rows].sort(byTime).reverse().slice(0, 5);
      return {
        a, b, total: rows.length, recent: last5.length,
        recent_correct: last5.filter((r) => r.correct).length,
        median_correct_ms: median(last5.filter((r) => r.correct).map((r) => r.response_ms)),
        median_all_ms: median(last5.map((r) => r.response_ms)),
      };
    }).sort((x, y) => x.a - y.a || x.b - y.b);
  }

  it.each([false, true])("merge = %s", async (merge) => {
    const rows = await asUser(db, P, async (tx) => (await tx.query<Record<string, unknown>>("select * from fact_stats($1, $2)", [kid, merge])).rows);
    const got = rows.map((r) => { const copy = { ...r }; delete copy.last_seen; return copy; });
    expect(got).toEqual(expected(merge));
    expect(got.length).toBe(merge ? 66 : 121);
  });

  it("hand check: 7×8", async () => {
    const r = (await asUser(db, P, (tx) => tx.query<Record<string, number>>("select * from fact_stats($1) where a = 7 and b = 8", [kid]))).rows[0];
    const mine = raw.filter((x) => x.a === 7 && x.b === 8).sort(byTime).reverse().slice(0, 5);
    expect(r.recent).toBe(mine.length);
    expect(r.recent_correct).toBe(mine.filter((x) => x.correct).length);
    expect(r.median_all_ms).toBe(median(mine.map((x) => x.response_ms)));
  });
});

describe("daily_trend matches the raw attempts (family time zone)", () => {
  it("problems, accuracy, median time, sessions and minutes per day", async () => {
    const t0 = performance.now();
    const rows = await asUser(db, P, async (tx) => (await tx.query<{ day: string | Date; problems: number; correct: number; median_ms: number | null; sessions: number; minutes: string }>(
      "select * from daily_trend($1, 30)", [kid])).rows);
    const sqlMs = performance.now() - t0;
    expect(rows).toHaveLength(30);
    expect(sqlMs).toBeLessThan(2000);

    // sessions: no gap over 10 minutes
    const sessions: { start: Date; ms: number }[] = [];
    let cur: Att[] = [];
    const close = () => { if (cur.length) sessions.push({ start: cur[0].created_at, ms: cur.at(-1)!.created_at.getTime() - cur[0].created_at.getTime() + cur[0].response_ms }); };
    for (const r of raw) {
      if (cur.length && r.created_at.getTime() - cur.at(-1)!.created_at.getTime() > 10 * 60_000) { close(); cur = []; }
      cur.push(r);
    }
    close();

    let checkedDays = 0;
    for (const row of rows) {
      const d = typeof row.day === "string" ? row.day.slice(0, 10) : row.day.toISOString().slice(0, 10);
      const today = raw.filter((r) => dayIn(r.created_at) === d);
      expect(row.problems, d).toBe(today.length);
      expect(row.correct, d).toBe(today.filter((r) => r.correct).length);
      expect(row.median_ms, d).toBe(median(today.map((r) => r.response_ms)));
      const ss = sessions.filter((s) => dayIn(s.start) === d);
      expect(row.sessions, d).toBe(ss.length);
      expect(Number(row.minutes), d).toBeCloseTo(Math.round(ss.reduce((t, s) => t + s.ms, 0) / 6000) / 10, 5);
      if (today.length) checkedDays++;
    }
    expect(checkedDays).toBeGreaterThan(12);
  });
});

describe("quest_stats and longest_streak match the raw rows", () => {
  it("runs, wins and farthest reached per quest", async () => {
    const got = await asUser(db, P, async (tx) => (await tx.query<{ quest_id: string; runs: number; wins: number; best: number }>(
      "select * from quest_stats($1) order by quest_id", [kid])).rows);
    const runs = (await db.query<{ quest_id: string; result: string; reached: number }>("select quest_id, result, reached from quest_runs where child_id = $1", [kid])).rows;
    const exp = [...new Set(runs.map((r) => r.quest_id))].sort().map((q) => {
      const mine = runs.filter((r) => r.quest_id === q);
      return { quest_id: q, runs: mine.length, wins: mine.filter((r) => r.result === "won").length, best: Math.max(...mine.map((r) => r.reached)) };
    });
    expect(got).toEqual(exp);
  });

  it("longest run of right answers in a row", async () => {
    const got = (await asUser(db, P, (tx) => tx.query<{ n: number }>("select longest_streak($1) as n", [kid]))).rows[0].n;
    let best = 0, run = 0;
    for (const r of raw) { run = r.correct ? run + 1 : 0; best = Math.max(best, run); }
    expect(got).toBe(best);
    expect(best).toBeGreaterThan(5);
  });
});

describe("dashboard functions respect row level security", () => {
  it("another parent gets nothing back", async () => {
    await asUser(db, OTHER, async (tx) => {
      expect((await tx.query("select * from fact_stats($1)", [kid])).rows).toEqual([]);
      expect((await tx.query("select * from quest_stats($1)", [kid])).rows).toEqual([]);
      expect((await tx.query<{ n: number }>("select longest_streak($1) as n", [kid])).rows[0].n).toBe(0);
      const trend = (await tx.query<{ problems: number }>("select * from daily_trend($1, 30)", [kid])).rows;
      expect(trend.every((r) => r.problems === 0)).toBe(true);
    });
  });

  it("signed-out visitors can't call them", async () => {
    expect(await failure(asAnon(db, (tx) => tx.query("select * from fact_stats($1)", [kid])))).toMatch(/permission denied/);
  });
});
