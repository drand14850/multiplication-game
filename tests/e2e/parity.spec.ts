// Parity check: drive reference/times-tables.html and the port through the same states
// at 390×780 with the same seeded Math.random, screenshot both and pixel-diff them.
// Output: tests/parity-out/ (gitignored) — {state}-ref.png, {state}-port.png, {state}-diff.png, results.json, index.html

import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const OUT = fileURLToPath(new URL("../parity-out/", import.meta.url));
// Served over http (not file://) so the seeded Math.random init script runs before its inline script.
const REF_PATH = "/__reference/times-tables.html";
const REF_HTML = readFileSync(fileURLToPath(new URL("../../reference/times-tables.html", import.meta.url)), "utf8");

const SEED = 20261015;
// React DOM draws Math.random() twice at module load (internal keys) before the game's first
// draw; the reference draws none. Skipping 2 on the reference lines the two games' streams up.
// If React changes this, the "same problems" assertion below fails.
const REACT_DRAWS_AT_LOAD = 2;
const seedScript = (skip: number) => `(() => { let s = ${SEED} >>> 0; Math.random = function () {
  s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < ${skip}; i++) Math.random(); })();`;

const STATES = [
  "practice", "right-answer", "wrong-answer", "quest-list", "mid-quest",
  "quest-failed", "element-reward", "pick-a-pet-reward", "backpack",
] as const;
type State = (typeof STATES)[number];

async function problem(page: Page): Promise<{ a: number; b: number; text: string }> {
  const text = (await page.locator("#eq").textContent()) ?? "";
  const [a, b] = text.split("×").map((x) => parseInt(x.trim(), 10));
  return { a, b, text };
}

async function answer(page: Page, right: boolean): Promise<string> {
  const p = await problem(page);
  const n = p.a * p.b + (right ? 0 : 1);
  await page.keyboard.type(String(n));
  await page.keyboard.press("Enter");
  return p.text;
}

/** Plays the scripted session, calling snap() at each state. Returns the problems seen, in order. */
async function play(page: Page, snap: (s: State) => Promise<void>): Promise<string[]> {
  const seen: string[] = [];
  const right = async (wait: number) => { seen.push(await answer(page, true)); await page.waitForTimeout(wait); };

  await page.waitForTimeout(800);
  await snap("practice");

  seen.push(await answer(page, true));
  await page.waitForTimeout(650);
  await snap("right-answer");
  await page.waitForTimeout(700);

  seen.push(await answer(page, false));
  await page.waitForTimeout(300);
  await snap("wrong-answer");
  await page.getByRole("button", { name: "Got it" }).click();
  await page.waitForTimeout(800);

  await page.locator("#questsBtn").click();
  await page.waitForTimeout(300);
  await snap("quest-list");

  await page.locator(".qcard", { hasText: "Water Quest" }).click();
  await page.waitForTimeout(500);
  for (let i = 0; i < 3; i++) await right(800);
  await snap("mid-quest");

  seen.push(await answer(page, false));
  await page.waitForTimeout(300);
  await snap("quest-failed");

  await page.getByRole("button", { name: "Try again" }).click();
  await page.waitForTimeout(500);
  for (let i = 0; i < 10; i++) await right(i === 9 ? 1100 : 800);
  await snap("element-reward");
  await page.getByRole("button", { name: "Put it in my backpack" }).click();
  await page.waitForTimeout(1500);

  await page.locator("#questsBtn").click();
  await page.waitForTimeout(300);
  await page.locator(".qcard", { hasText: "Pick-a-Pet Quest" }).click();
  await page.waitForTimeout(500);
  for (let i = 0; i < 8; i++) await right(i === 7 ? 1100 : 800);
  await snap("pick-a-pet-reward");
  await page.locator(".pickgrid button", { hasText: "Panda" }).click();
  await page.waitForTimeout(1500);

  await page.locator("#bagBtn").click();
  await page.waitForTimeout(400);
  await snap("backpack");
  return seen;
}

async function session(page: Page, url: string, tag: "ref" | "port", skip: number) {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.addInitScript(seedScript(skip));
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  const seen = await play(page, async (s) => {
    await page.screenshot({ path: OUT + `${s}-${tag}.png`, animations: "disabled" });
  });
  return { seen, errors };
}

test("port matches the reference at 390×780", async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });

  const refCtx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const portCtx = await browser.newContext({ viewport: { width: 390, height: 780 }, baseURL: "http://localhost:4173" });
  await refCtx.route("**" + REF_PATH, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: REF_HTML }));
  const ref = await session(await refCtx.newPage(), "http://localhost:4173" + REF_PATH, "ref", REACT_DRAWS_AT_LOAD);
  const port = await session(await portCtx.newPage(), "/", "port", 0);

  const results = STATES.map((s) => {
    const a = PNG.sync.read(readFileSync(OUT + `${s}-ref.png`));
    const b = PNG.sync.read(readFileSync(OUT + `${s}-port.png`));
    const diff = new PNG({ width: a.width, height: a.height });
    const px = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
    writeFileSync(OUT + `${s}-diff.png`, PNG.sync.write(diff));
    return { state: s, diffPixels: px, diffPct: +(100 * px / (a.width * a.height)).toFixed(3) };
  });

  writeFileSync(OUT + "results.json", JSON.stringify({ seed: SEED, results, refErrors: ref.errors, portErrors: port.errors,
    sameProblems: JSON.stringify(ref.seen) === JSON.stringify(port.seen), problems: port.seen }, null, 2));

  // side-by-side contact sheet: index.html, plus sheet.png rendered from it
  const cells = results.map((r) =>
    `<figure><figcaption><b>${r.state}</b> · ${r.diffPixels} px differ</figcaption>` +
    `<div><img src="${r.state}-ref.png"><img src="${r.state}-port.png"></div><small>reference · port</small></figure>`).join("");
  writeFileSync(OUT + "index.html", `<!doctype html><meta charset="utf-8"><title>Parity</title>
<style>body{font:15px system-ui;background:#f2f0f5;margin:16px;display:grid;grid-template-columns:repeat(3,auto);gap:18px 22px;justify-content:start}
figure{margin:0}figcaption{margin-bottom:6px}div{display:flex;gap:6px}img{width:195px;border:1px solid #aaa}small{color:#666}</style>${cells}`);
  const sheet = await refCtx.newPage();
  await sheet.setViewportSize({ width: 1290, height: 800 });
  await sheet.goto(pathToFileURL(OUT + "index.html").href);
  await sheet.screenshot({ path: OUT + "sheet.png", fullPage: true });

  expect(port.errors, "console errors in the port").toEqual([]);
  expect(port.seen).toEqual(ref.seen);
});
