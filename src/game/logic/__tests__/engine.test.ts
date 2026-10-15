import { describe, expect, it } from "vitest";
import { COLLECTIBLES } from "../collectibles";
import { GameEngine, type Effect, type EngineCtx } from "../engine";
import { QUESTS, type QuestId } from "../quests";
import { pickOptions, rollElement } from "../rewards";
import { seededRng } from "../rng";

function makeEngine(seed = 1, day = "2026-10-15") {
  let n = 0;
  const clock = { day };
  const ctx: EngineCtx = { rng: seededRng(seed), today: () => clock.day, newId: () => "run-" + ++n };
  const engine = new GameEngine(ctx);
  engine.takeEffects();
  return { engine, clock };
}

function answer(e: GameEngine, right: boolean): Effect[] {
  const ans = e.s.current.answer + (right ? 0 : 1);
  for (const d of String(ans)) e.type(d);
  e.check(1500);
  return e.takeEffects();
}

/** Answer right and run the scheduled follow-up step. */
function answerRightAndContinue(e: GameEngine): Effect[] {
  const fx = answer(e, true);
  const sched = fx.find((f) => f.type === "schedule");
  if (sched && sched.type === "schedule") e.step(sched.step);
  return [...fx, ...e.takeEffects()];
}

function winQuest(e: GameEngine, id: QuestId): Effect[] {
  e.startQuest(id);
  const fx: Effect[] = e.takeEffects();
  const len = QUESTS.find((q) => q.id === id)!.len;
  for (let i = 0; i < len; i++) fx.push(...answerRightAndContinue(e));
  return fx;
}

describe("practice", () => {
  it("right answer: score, streak, catch, note, then waits", () => {
    const { engine: e } = makeEngine();
    const shown = e.s.showing;
    const fx = answer(e, true);
    expect(e.s.score).toBe(1);
    expect(e.s.streak).toBe(1);
    expect(e.s.phase).toBe("wait");
    expect(e.s.entry).toBe("right");
    expect(fx).toContainEqual(expect.objectContaining({ type: "catch", collectibleId: COLLECTIBLES[shown].id, source: "practice" }));
    expect(fx).toContainEqual(expect.objectContaining({ type: "attempt", correct: true, mode: "practice", responseMs: 1500 }));
    // taps during the delay are ignored
    e.type("5"); e.check(100);
    expect(e.takeEffects()).toEqual([]);
    expect(e.s.score).toBe(1);
  });

  it("wrong answer: correction card, streak reset, review pile set to 2, nothing taken away", () => {
    const { engine: e } = makeEngine();
    answerRightAndContinue(e);
    const { a, b } = e.s.current;
    answer(e, false);
    expect(e.s.phase).toBe("correcting");
    expect(e.s.fixLead).toBe("The answer is:");
    expect(e.s.score).toBe(1);
    expect(e.s.streak).toBe(0);
    expect(e.s.weak[a + "x" + b]).toBe(2);
    e.gotIt();
    expect(e.s.phase).toBe("ask");
  });

  it("the score strip only updates when the next problem appears (reference render())", () => {
    const { engine: e } = makeEngine();
    answer(e, true);
    expect(e.s.score).toBe(1);
    expect(e.s.scoreShown).toBe(0);
    e.step("next");
    expect(e.s.scoreShown).toBe(1);
  });

  it("limits typing to 3 digits and ignores a leading 0", () => {
    const { engine: e } = makeEngine();
    e.type("0"); expect(e.s.typed).toBe("");
    e.type("1"); e.type("2"); e.type("3"); e.type("4");
    expect(e.s.typed).toBe("123");
    e.erase();
    expect(e.s.typed).toBe("12");
  });
});

describe("quests", () => {
  it("N right in a row wins; no per-problem catches during a quest", () => {
    const { engine: e } = makeEngine(2);
    const fx = winQuest(e, "water");
    expect(e.s.phase).toBe("reward");
    const practiceCatches = fx.filter((f) => f.type === "catch" && f.source === "practice");
    expect(practiceCatches).toHaveLength(0);
    expect(fx.filter((f) => f.type === "attempt")).toHaveLength(10);
    expect(fx).toContainEqual(expect.objectContaining({ type: "questEnd", result: "won", reached: 10 }));
    expect(e.s.showing).toBe(-1);
  });

  it("any miss fails the quest", () => {
    const { engine: e } = makeEngine(3);
    e.startQuest("fire");
    answerRightAndContinue(e);
    answerRightAndContinue(e);
    const fx = answer(e, false);
    expect(e.s.phase).toBe("correcting");
    expect(e.s.fixLead).toBe("Quest over. The answer is:");
    expect(e.s.quest!.missAt).toBe(2);
    expect(fx).toContainEqual(expect.objectContaining({ type: "questEnd", result: "failed", reached: 2 }));
    e.tryAgain();
    expect(e.s.quest!.done).toBe(0);
    expect(e.s.phase).toBe("ask");
  });

  it("quitting records a quit run", () => {
    const { engine: e } = makeEngine(4);
    e.startQuest("ice");
    answerRightAndContinue(e);
    e.quit();
    expect(e.s.quest).toBeNull();
    expect(e.takeEffects()).toContainEqual(expect.objectContaining({ type: "questEnd", result: "quit", reached: 1 }));
  });

  it("the element reward prefers animals not caught yet", () => {
    const caught: Record<string, number> = {};
    const fire = COLLECTIBLES.filter((c) => c.group === "fire");
    fire.slice(0, 7).forEach((c) => (caught[c.id] = 1));
    const rng = seededRng(5);
    for (let i = 0; i < 200; i++) expect(rollElement("fire", caught, rng).id).toBe(fire[7].id);
    fire.forEach((c) => (caught[c.id] = 1));
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(rollElement("fire", caught, rng).id);
    expect(seen.size).toBe(8);
  });

  it("element and Mystery rewards are recorded at win, and fly in on claim", () => {
    const { engine: e } = makeEngine(6);
    const fx = winQuest(e, "earth");
    const reward = e.s.reward!;
    expect(reward.kind).toBe("prize");
    const prizeId = reward.kind === "prize" ? reward.prizeId : "";
    expect(fx).toContainEqual(expect.objectContaining({ type: "catch", collectibleId: prizeId, source: "quest" }));
    expect(e.snapshot().caught[prizeId]).toBe(1);   // persisted even before the claim tap
    expect(e.s.caught[prizeId]).toBeUndefined();
    e.claim(prizeId);
    expect(e.s.phase).toBe("flying");
    expect(e.s.caught[prizeId]).toBe(1);
    const claimFx = e.takeEffects();
    expect(claimFx.filter((f) => f.type === "catch")).toHaveLength(0);   // not recorded twice
    expect(claimFx).toContainEqual({ type: "schedule", ms: 900, step: "endQuest" });
  });

  it("Mystery Box: once per day, used up only when won", () => {
    const { engine: e, clock } = makeEngine(7);
    e.startQuest("mystery");
    answer(e, false);
    expect(e.s.fixLead).toBe("Not quite. The answer is:");
    expect(e.s.mysteryDay).toBe("");
    e.tryAgain();
    answerRightAndContinue(e);
    expect(e.s.mysteryDay).toBe("2026-10-15");
    const r = e.s.reward!;
    expect(r.title).toBe("The Mystery Box opened!");
    e.claim(r.kind === "prize" ? r.prizeId : "");
    e.step("endQuest");
    e.startQuest("mystery");
    expect(e.s.quest).toBeNull();                   // can't open again today
    clock.day = "2026-10-16";
    e.startQuest("mystery");
    expect(e.s.quest?.def.id).toBe("mystery");
  });

  it("Pick-a-Pet offers exactly the 13 regular + 5 rare animals", () => {
    const opts = pickOptions({}, false);
    expect(opts).toHaveLength(18);
    expect(opts.filter((o) => o.rare)).toHaveLength(5);
    expect(opts.map((o) => o.collectible.id)).toEqual(COLLECTIBLES.slice(0, 18).map((c) => c.id));
  });

  it("after a rare pick, rares are unavailable until the next day", () => {
    const { engine: e, clock } = makeEngine(8);
    winQuest(e, "pick");
    expect(e.s.reward!.kind).toBe("pick");
    e.claim("axolotl");
    expect(e.s.rarePickDay).toBe("2026-10-15");
    e.step("endQuest");

    winQuest(e, "pick");
    const r = e.s.reward!;
    expect(r.kind === "pick" && r.rareUsed).toBe(true);
    expect(r.sub).toBe("Pick an animal. You already picked a rare one today.");
    expect(pickOptions(e.s.caught, true).filter((o) => o.disabled).map((o) => o.status)).toEqual(Array(5).fill("wait"));
    e.claim("snake");                                // refused
    expect(e.s.phase).toBe("reward");
    e.claim("cat");
    expect(e.s.phase).toBe("flying");
    e.step("endQuest");

    clock.day = "2026-10-16";
    winQuest(e, "pick");
    const r2 = e.s.reward!;
    expect(r2.kind === "pick" && r2.rareUsed).toBe(false);
  });

  it("Diamond is the longest quest", () => {
    const max = Math.max(...QUESTS.map((q) => q.len));
    expect(QUESTS.find((q) => q.id === "diamond")!.len).toBe(max);
  });
});

describe("keyboard", () => {
  it("is ignored while a panel is open", () => {
    const { engine: e } = makeEngine();
    e.togglePanel("bag");
    e.keydown("5", 0);
    expect(e.s.typed).toBe("");
    e.togglePanel("bag");
    e.keydown("5", 0);
    expect(e.s.typed).toBe("5");
  });
});
