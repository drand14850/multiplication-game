// Phase 4: the dashboard with the dev seed's ~2,000 attempts, at phone and laptop widths.
// The app talks to a fake Supabase that answers from PGlite running the real migrations and
// seed, so the numbers on screen come from the real SQL. A few are cross-checked against
// direct counts. Screenshots: tests/parity-out/dashboard/.

import type { PGlite } from "@electric-sql/pglite";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { addParent, asUser, freshDb } from "../../supabase/tests/db";

const APP = "http://localhost:5174/";
const SUPA = "http://fake.supabase.test";
const OUT = fileURLToPath(new URL("../parity-out/dashboard/", import.meta.url));
const P = "aaaaaaaa-0000-4000-8000-00000000000a";

let db: PGlite;
let kid: string;

test.beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  db = await freshDb();
  await addParent(db, P, "America/Los_Angeles");
  await db.exec(readFileSync(fileURLToPath(new URL("../../supabase/seed/dev-seed.sql", import.meta.url)), "utf8"));
  kid = (await db.query<{ id: string }>("select id from children where name = 'Demo Kid (seed)'")).rows[0].id;
  // a second child with no play yet, for the switcher
  await asUser(db, P, (tx) => tx.query("insert into children (name, avatar) values ('Ana', 'fox')"));
});

// PGlite is one connection: run the fake server's queries one at a time.
let chain: Promise<unknown> = Promise.resolve();
const sql = <T,>(q: string, params: unknown[] = []): Promise<T[]> => {
  const run = chain.then(() => asUser(db, P, async (tx) => (await tx.query<T>(q, params)).rows));
  chain = run.catch(() => undefined);
  return run;
};

async function fakeSupabase(ctx: BrowserContext) {
  const user = { id: P, email: "parent@example.test", aud: "authenticated", role: "authenticated" };
  const session = { access_token: "x.y.z", refresh_token: "r", token_type: "bearer", expires_in: 3600,
                    expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  await ctx.addInitScript(`localStorage.setItem("sb-fake-auth-token", ${JSON.stringify(JSON.stringify(session))});`);
  await ctx.route(SUPA + "/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const wantsObject = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const reply = (rows: unknown) => {
      if (wantsObject && Array.isArray(rows)) {
        if (rows.length !== 1) return route.fulfill({ status: 406, contentType: "application/json", body: JSON.stringify({ code: "PGRST116", message: "0 rows" }) });
        rows = rows[0];
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
    };
    const eq = (k: string) => (url.searchParams.get(k) ?? "").replace(/^eq\./, "");

    if (path.startsWith("/rest/v1/rpc/")) {
      const fn = path.slice("/rest/v1/rpc/".length);
      const args = JSON.parse(req.postData() ?? "{}");
      if (fn === "fact_stats") return reply(await sql("select * from fact_stats($1, $2)", [args.p_child, args.p_merge]));
      if (fn === "daily_trend") return reply(await sql("select day::text as day, problems, correct, median_ms, sessions, minutes from daily_trend($1, $2)", [args.p_child, args.p_days]));
      if (fn === "quest_stats") return reply(await sql("select * from quest_stats($1)", [args.p_child]));
      if (fn === "my_kid_logins") return reply(await sql("select * from my_kid_logins()"));
      if (fn === "longest_streak") return reply((await sql<{ n: number }>("select longest_streak($1) as n", [args.p_child]))[0].n);
    }
    const table = path.replace("/rest/v1/", "");
    if (table === "children") return reply(await sql("select id, name, avatar from children order by created_at"));
    if (table === "parent_settings") return reply(await sql("select time_zone, fluency_ms, family_code from parent_settings"));
    if (table === "game_state") return reply(await sql("select review_pile from game_state where child_id = $1", [eq("child_id")]));
    if (table === "backpack") return reply(await sql("select collectible_id, n from backpack where child_id = $1", [eq("child_id")]));
    if (table === "catches") return reply([]);
    if (table === "attempts") {
      const or = url.searchParams.get("or");
      let a: number, b: number;
      if (or) [a, b] = (or.match(/a\.eq\.(\d+),b\.eq\.(\d+)/) ?? []).slice(1).map(Number);
      else [a, b] = [Number(eq("a")), Number(eq("b"))];
      return reply(await sql(
        "select a, b, given_answer, correct, response_ms, mode, created_at from attempts where child_id = $1 and ((a = $2 and b = $3) or ($4 and a = $3 and b = $2)) order by created_at desc limit 30",
        [eq("child_id"), a, b, !!or]));
    }
    return reply([]);
  });
}

async function openDashboard(page: Page) {
  await page.goto(APP);                              // a signed-in grown-up opens straight to their area
  await expect(page.getByRole("heading", { name: "Grown-ups" })).toBeVisible();
  await page.locator(".kid-switch").getByRole("button", { name: "Demo Kid (seed)" }).click();
  await expect(page.locator(".fgrid")).toBeVisible();
  await expect(page.locator(".dash-grid.busy")).toHaveCount(0);
}

const shot = async (page: Page, name: string, target = page.locator("#dash-h").locator("..")) => {
  await page.waitForTimeout(150);
  await target.screenshot({ path: OUT + name + ".png", animations: "disabled" });
};

test("dashboard at phone width (390)", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await fakeSupabase(ctx);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openDashboard(page);

  await shot(page, "phone-1-facts-status");
  await page.getByRole("button", { name: "Accuracy %" }).click();
  await shot(page, "phone-2-facts-accuracy");
  await page.getByRole("button", { name: "Median time" }).click();
  await shot(page, "phone-3-facts-time");
  await page.getByRole("button", { name: "Status" }).click();
  await page.getByRole("button", { name: /^7 × 8:/ }).click();
  await expect(page.getByText("latest tries")).toBeVisible();
  await expect(page.locator(".history tbody tr").first()).toBeVisible();
  await shot(page, "phone-4-fact-history");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByLabel("7×8 and 8×7 together").check();
  await expect(page.locator(".dash-grid.busy")).toHaveCount(0);
  await shot(page, "phone-5-facts-merged");
  await page.getByLabel("7×8 and 8×7 together").uncheck();
  await expect(page.locator(".dash-grid.busy")).toHaveCount(0);

  for (const [tab, name] of [["Trend", "phone-6-trend"], ["Needs work", "phone-7-needs-work"], ["Quests", "phone-8-quests"], ["Backpack", "phone-9-backpack"]] as const) {
    await page.getByRole("tab", { name: tab }).click();
    await shot(page, name);
  }
  expect(errors).toEqual([]);
  await ctx.close();
});

test("dashboard at laptop width (1280), with numbers hand-checked against raw rows", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await fakeSupabase(ctx);
  const page = await ctx.newPage();
  await openDashboard(page);
  await shot(page, "laptop-all-views");

  // hand checks: on-screen numbers vs direct SQL on the raw rows
  const raw = async (q: string) => Number((await db.query<{ n: number }>(q, [kid])).rows[0].n);
  const found = await raw("select count(distinct collectible_id)::int as n from catches where child_id = $1");
  const total = await raw("select count(*)::int as n from collectibles where $1::uuid is not null");
  await expect(page.locator(".hero")).toContainText(`${found} of ${total}`);
  const wins = await raw("select count(*)::int as n from quest_runs where child_id = $1 and result = 'won'");
  await expect(page.locator(".tile", { hasText: "Quests won" }).locator(".val")).toHaveText(String(wins));
  const inWindow = await raw(`select count(*)::int as n from attempts where child_id = $1
    and (created_at at time zone 'America/Los_Angeles')::date > (now() at time zone 'America/Los_Angeles')::date - 30`);
  await expect(page.locator(".tile", { hasText: "Problems" }).locator(".val")).toHaveText(inWindow.toLocaleString("en-US"));
  const fluent = await raw(`select count(*)::int as n from fact_stats($1) where recent_correct >= 4 and recent_correct::float / recent >= 0.8 and median_correct_ms < 3000`);
  await expect(page.locator(".dash .sub").first()).toContainText(`${fluent} fluent`);
  test.info().annotations.push({ type: "hand-check", description: `backpack ${found}/82, quest wins ${wins}, problems (30 days) ${inWindow}, fluent ${fluent}` });
  console.log(`hand-check: backpack ${found}/82, quest wins ${wins}, problems in 30 days ${inWindow}, fluent facts ${fluent}`);
  await ctx.close();
});
