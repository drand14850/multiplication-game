// Offline play and sync, and kid sign-in, end to end in a real browser.
// The app runs against a fake Supabase (http://fake.supabase.test) that this test answers,
// recording every row the app sends. Kid devices use anonymous sessions, as in production.

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const APP = "http://localhost:5174/";
const SUPA = "http://fake.supabase.test";

const kids = [
  { id: "c-ana", name: "Ana", avatar: "fox", username: "ana", password: "apple" },
  { id: "c-ben", name: "Ben", avatar: "owl", username: "ben", password: "bear" },
];

type Row = Record<string, unknown>;

/** Fake Supabase: auth for kid devices, the kid RPCs, and the game tables. */
async function fakeSupabase(ctx: BrowserContext, signedInAs: string | null) {
  // up = false: the server can't be reached (also set while the browser is offline, because
  // Playwright's request interception would otherwise still answer)
  const server = {
    up: true,
    linked: signedInAs as string | null,         // which kid this device is signed in as
    rows: { attempts: [] as Row[], catches: [] as Row[], quest_runs: [] as Row[], game_state: [] as Row[] },
  };
  let devices = 0;
  const sessionFor = (id: string) => ({
    access_token: "x.y.z", refresh_token: "r", token_type: "bearer", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id, aud: "authenticated", role: "authenticated", is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  });
  if (signedInAs) {
    await ctx.addInitScript(`if (!localStorage.getItem("sb-fake-auth-token")) localStorage.setItem("sb-fake-auth-token", ${JSON.stringify(JSON.stringify(sessionFor("device-0")))});`);
  }
  await ctx.route(SUPA + "/**", async (route) => {
    if (!server.up) return route.abort("connectionrefused");
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

    if (path === "/auth/v1/signup") return json(sessionFor("device-" + ++devices));        // signInAnonymously
    if (path === "/auth/v1/logout") return route.fulfill({ status: 204, body: "" });
    if (path.startsWith("/rest/v1/rpc/")) {
      const fn = path.slice("/rest/v1/rpc/".length);
      const args = JSON.parse(req.postData() || "{}");
      const k = kids.find((x) => x.id === server.linked);
      if (fn === "kid_me") return json(k ? [{ child_id: k.id, name: k.name, avatar: k.avatar, username: k.username, time_zone: "UTC" }] : []);
      if (fn === "kid_sign_out") { server.linked = null; return json(null); }
      if (fn === "kid_sign_in") {
        const m = kids.find((x) => x.username === args.p_username && x.password === args.p_password);
        if (!m) return json({ error: "wrong_username_or_password" });
        server.linked = m.id;
        return json({ child_id: m.id });
      }
      return json(null);
    }

    const table = path.replace("/rest/v1/", "") as keyof typeof server.rows;
    if (req.method() === "POST" && table in server.rows) {
      const body = JSON.parse(req.postData() || "[]");
      server.rows[table].push(...(Array.isArray(body) ? body : [body]));
      return route.fulfill({ status: 201, body: "" });
    }
    // reads answered from the rows received so far, like the real tables
    const child = (url.searchParams.get("child_id") ?? "").replace(/^eq\./, "");
    const mine = (t: keyof typeof server.rows) => server.rows[t].filter((r) => r.child_id === child);
    if (table === ("backpack" as string)) {
      const n = new Map<string, number>();
      for (const r of mine("catches")) n.set(String(r.collectible_id), (n.get(String(r.collectible_id)) ?? 0) + 1);
      return json([...n].map(([collectible_id, count]) => ({ collectible_id, n: count })));
    }
    if (table === "game_state") {
      const last = mine("game_state").at(-1);
      return json(last ? [{ review_pile: last.review_pile }] : []);
    }
    if (table === "catches") return json(mine("catches").filter((r) => r.source === "mystery" || r.source === "pick"));
    return json([]);
  });
  return server;
}

async function inGame(page: Page) {
  await expect(page.locator("#eq")).toBeVisible();
}

async function kidSignIn(page: Page, username: string, password: string) {
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Your name").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Let's go" }).click();
  await inGame(page);
}

/** Answer n problems right, waiting for each next problem like a child would. */
async function play(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    const [a, b] = ((await page.locator("#eq").textContent()) ?? "").split("×").map((x) => parseInt(x));
    await page.keyboard.type(String(a * b));
    await page.keyboard.press("Enter");
    await expect(page.locator("#entry")).toHaveClass(/right/);
    await expect(page.locator("#entry")).toHaveClass(/empty/, { timeout: 3000 });   // next problem is up
  }
}

const unique = (rows: Row[]) => new Set(rows.map((r) => r.id)).size;

test.describe("kid sign-in on a school computer", () => {
  test("username + password, play, and the answers reach the server", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
    const server = await fakeSupabase(ctx, null);          // a fresh computer: nobody signed in
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(APP);
    await kidSignIn(page, "ben", "bear");
    await play(page, 4);
    await expect.poll(() => server.rows.attempts.length, { timeout: 15_000 }).toBe(4);
    expect(server.rows.attempts.every((r) => r.child_id === "c-ben")).toBe(true);
    // next day, same computer: straight back into his game
    await page.reload();
    await inGame(page);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

test.describe("offline play and sync", () => {
  test("20 problems with the network off arrive exactly once when it comes back", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
    const server = await fakeSupabase(ctx, "c-ana");
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto(APP);
    await inGame(page);
    await ctx.setOffline(true);
    server.up = false;
    const t0 = Date.now();
    await play(page, 20);
    const perProblem = (Date.now() - t0) / 20;
    expect(server.rows.attempts).toHaveLength(0);          // nothing got out while offline
    expect(perProblem).toBeLessThan(1500);                 // and the game never waited on the network

    server.up = true;
    await ctx.setOffline(false);                           // the browser fires "online"; the queue sends
    await expect.poll(() => server.rows.attempts.length, { timeout: 15_000 }).toBe(20);
    await page.waitForTimeout(3000);                       // nothing extra trickles in
    expect(server.rows.attempts).toHaveLength(20);
    expect(unique(server.rows.attempts)).toBe(20);
    expect(server.rows.attempts.every((r) => r.child_id === "c-ana" && r.correct === true)).toBe(true);
    expect(unique(server.rows.catches)).toBe(server.rows.catches.length);
    expect(server.rows.catches).toHaveLength(20);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test("the queue survives a reload while the server is unreachable", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
    const server = await fakeSupabase(ctx, "c-ana");
    const page = await ctx.newPage();
    await page.goto(APP);
    await inGame(page);

    server.up = false;
    await play(page, 5);
    const bag = await page.locator("#bagCount").textContent();
    server.up = true;
    await page.reload();                                    // pending rows are only in IndexedDB now
    await inGame(page);
    await expect.poll(() => server.rows.attempts.length, { timeout: 15_000 }).toBe(5);
    await page.waitForTimeout(3000);
    expect(server.rows.attempts).toHaveLength(5);
    expect(unique(server.rows.attempts)).toBe(5);
    // the backpack came back too (server rows + anything still unsent)
    expect(await page.locator("#bagCount").textContent()).toBe(bag);
    await ctx.close();
  });

  test("two kids on the same computer keep separate progress", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
    const server = await fakeSupabase(ctx, "c-ana");
    const page = await ctx.newPage();
    await page.goto(APP);

    await inGame(page);
    await play(page, 3);
    const anaBag = await page.locator("#bagCount").textContent();
    await page.getByRole("button", { name: /Switch player/ }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await kidSignIn(page, "ben", "bear");
    expect(await page.locator("#bagCount").textContent()).toBe("0/82");     // Ben starts with his own empty backpack
    await play(page, 2);
    await page.getByRole("button", { name: /Switch player/ }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await kidSignIn(page, "ana", "apple");
    expect(await page.locator("#bagCount").textContent()).toBe(anaBag);

    await expect.poll(() => server.rows.attempts.length, { timeout: 15_000 }).toBe(5);
    const by = (c: string) => server.rows.attempts.filter((r) => r.child_id === c).length;
    expect(by("c-ana")).toBe(3);
    expect(by("c-ben")).toBe(2);
    expect(server.rows.catches.filter((r) => r.child_id === "c-ben")).toHaveLength(2);
    await ctx.close();
  });
});
