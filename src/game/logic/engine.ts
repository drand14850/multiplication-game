// The game loop from reference/times-tables.html, ported to a pure state machine.
// No DOM, timers, React or network here: the engine mutates its own state and pushes
// Effects (schedule a step, fly an animal, record an attempt…) for the UI and data
// layer to carry out. Function names follow the reference so the two can be read side by side.

import { isRare, nextAnimal } from "./animalBag";
import { BY_ID, COLLECTIBLES, caughtCount, isElementGroup, type Caught } from "./collectibles";
import { DELAY, MAX_DIGITS } from "./constants";
import { factKey, newPicker, pickNextFact, type FactWeight, type PickerState } from "./facts";
import { addTry, cleanRecent, factWeight, type Recent } from "./mastery";
import { questById, type QuestDef, type QuestId } from "./quests";
import { cleanLoadedPile, onCorrect, onMiss, type ReviewPile } from "./reviewPile";
import { rollElement, rollMystery } from "./rewards";
import type { Rng } from "./rng";
import { NAMES } from "../art/animals";

export type Phase = "ask" | "wait" | "correcting" | "reward" | "flying";
export type Panel = "none" | "quests" | "bag";

/** What persists between visits (the reference's saved blob, minus `wins`). */
export interface Saved {
  weak: ReviewPile;
  caught: Caught;
  rarePickDay: string;
  mysteryDay: string;
  /** Last 5 tries per fact, for adaptive picking (not in the reference). */
  recent?: Recent;
}

export interface Problem { a: number; b: number; answer: number; wasReview: boolean; seq: number }

export type Background =
  | { kind: "animal"; index: number; v: number }
  | { kind: "emblem"; questId: QuestId; v: number };

export interface QuestRun {
  def: QuestDef;
  done: number;
  runId: string;
  missAt: number | null;
  ended: boolean;          // questEnd already recorded (failed or won)
}

export type Reward =
  | { kind: "prize"; title: string; sub: string; prizeId: string }
  | { kind: "pick"; title: string; sub: string; rareUsed: boolean };

export type ScheduledStep = "next" | "win" | "endQuest";
export type FlySource = "bg" | "prize" | `pick:${string}`;
export type CatchSource = "practice" | "quest" | "pick" | "mystery";

export type Effect =
  | { type: "schedule"; ms: number; step: ScheduledStep }
  | { type: "fly"; collectibleId: string; from: FlySource }
  | { type: "attempt"; a: number; b: number; givenAnswer: number; correct: boolean; responseMs: number;
      mode: "practice" | "quest"; questRunId: string | null; wasReview: boolean }
  | { type: "catch"; collectibleId: string; source: CatchSource; questRunId: string | null }
  | { type: "questStart"; runId: string; questId: QuestId; length: number }
  | { type: "questProgress"; runId: string; reached: number }
  | { type: "questEnd"; runId: string; result: "won" | "failed" | "quit"; reached: number; rewardId: string | null }
  | { type: "questReward"; runId: string; rewardId: string }
  | { type: "save"; snapshot: Saved };

export interface EngineCtx {
  rng: Rng;
  today: () => string;   // "YYYY-MM-DD" in the family's time zone
  newId: () => string;   // uuid for quest runs
  /** Adaptive picking: lean toward the facts this kid doesn't know yet. Absent: the reference's uniform picking. */
  adaptive?: { fluencyMs: number };
}

export interface EngineState extends Saved {
  recent: Recent;
  score: number;
  streak: number;
  scoreShown: number;     // the strip only updates when the next problem renders (reference render())
  streakShown: number;
  picker: PickerState;
  bag: number[];
  current: Problem;
  typed: string;
  phase: Phase;
  entry: "plain" | "right" | "wrong";
  note: { text: string; win: boolean };
  fixLead: string;
  showing: number;        // index of the animal on screen, -1 during a quest
  background: Background;
  quest: QuestRun | null;
  reward: Reward | null;
  pendingRewardId: string | null;  // rolled at win, flies in at claim
  panel: Panel;
  bagShown: number;       // the bag button count updates when the bag pops
  bagPops: number;
}

export class GameEngine {
  s: EngineState;
  private ctx: EngineCtx;
  private outbox: Effect[] = [];
  private seq = 0;
  private bgV = 0;

  constructor(ctx: EngineCtx, saved?: Partial<Saved> | null) {
    this.ctx = ctx;
    const caught: Caught = {};
    if (saved?.caught && typeof saved.caught === "object") {
      for (const [id, n] of Object.entries(saved.caught)) if (BY_ID.has(id) && typeof n === "number") caught[id] = n;
    }
    this.s = {
      weak: cleanLoadedPile(saved?.weak),
      recent: cleanRecent(saved?.recent),
      caught,
      rarePickDay: typeof saved?.rarePickDay === "string" ? saved.rarePickDay : "",
      mysteryDay: typeof saved?.mysteryDay === "string" ? saved.mysteryDay : "",
      score: 0,
      streak: 0,
      scoreShown: 0,
      streakShown: 0,
      picker: newPicker(),
      bag: [],
      current: { a: 7, b: 8, answer: 56, wasReview: false, seq: 0 },
      typed: "",
      phase: "ask",
      entry: "plain",
      note: { text: "", win: false },
      fixLead: "",
      showing: -1,
      background: { kind: "animal", index: 0, v: 0 },
      quest: null,
      reward: null,
      pendingRewardId: null,
      panel: "none",
      bagShown: caughtCount(caught),
      bagPops: 0,
    };
    this.nextQuestion();
  }

  /** Effects produced since the last call. */
  takeEffects(): Effect[] {
    const out = this.outbox;
    this.outbox = [];
    return out;
  }

  private emit(e: Effect): void { this.outbox.push(e); }

  /** What to persist. A rolled-but-unclaimed reward counts as caught (it's recorded at win). */
  snapshot(): Saved {
    const caught = { ...this.s.caught };
    if (this.s.pendingRewardId) caught[this.s.pendingRewardId] = (caught[this.s.pendingRewardId] || 0) + 1;
    const recent: Recent = {};
    for (const [k, v] of Object.entries(this.s.recent)) recent[k] = v.map((t) => [t[0], t[1]]);
    return { weak: { ...this.s.weak }, caught, rarePickDay: this.s.rarePickDay, mysteryDay: this.s.mysteryDay, recent };
  }

  private save(): void { this.emit({ type: "save", snapshot: this.snapshot() }); }

  /* ---------- question picking ---------- */

  nextQuestion(): void {
    const s = this.s;
    const { fact, wasReview } = pickNextFact(s.weak, s.picker, this.ctx.rng, this.weight());
    s.current = { a: fact.a, b: fact.b, answer: fact.a * fact.b, wasReview, seq: ++this.seq };
    s.typed = "";
    s.phase = "ask";
    s.entry = "plain";       // render() resets the entry; the note line is left alone
    s.scoreShown = s.score;
    s.streakShown = s.streak;
    this.swapAnimal();
  }

  /** Adaptive weights, once there's some history (with none, picking stays exactly the reference's). */
  private weight(): FactWeight | undefined {
    const ad = this.ctx.adaptive;
    if (!ad || !Object.keys(this.s.recent).length) return undefined;
    const recent = this.s.recent;
    return (a, b) => factWeight(recent, factKey(a, b), ad.fluencyMs);
  }

  private swapAnimal(): void {
    const s = this.s;
    if (s.quest) { s.showing = -1; return; }     // the quest emblem stays put
    s.showing = nextAnimal(s.bag, this.ctx.rng);
    s.background = { kind: "animal", index: s.showing, v: ++this.bgV };
  }

  /* ---------- answering ---------- */

  type(d: string): void {
    const s = this.s;
    if (s.phase !== "ask" || s.typed.length >= MAX_DIGITS) return;
    if (s.typed === "" && d === "0") return;
    s.typed += d;
    s.entry = "plain";
    s.note = { text: "", win: false };
  }

  erase(): void {
    const s = this.s;
    if (s.phase !== "ask") return;
    s.typed = s.typed.slice(0, -1);
    s.entry = "plain";
  }

  check(responseMs: number): void {
    const s = this.s;
    if (s.phase !== "ask" || s.typed === "") return;
    const cur = s.current;
    const k = factKey(cur.a, cur.b);
    const given = +s.typed;
    const correct = given === cur.answer;
    addTry(s.recent, k, correct, responseMs);

    this.emit({
      type: "attempt", a: cur.a, b: cur.b, givenAnswer: given, correct, responseMs,
      mode: s.quest ? "quest" : "practice", questRunId: s.quest ? s.quest.runId : null, wasReview: cur.wasReview,
    });

    if (correct) {
      s.score++;
      s.streak++;
      onCorrect(s.weak, k);
      s.phase = "wait";                  // no double-tapping ✓ while the next one loads

      if (s.quest) {
        s.quest.done++;
        this.emit({ type: "questProgress", runId: s.quest.runId, reached: s.quest.done });
        const left = s.quest.def.len - s.quest.done;
        s.entry = "right";
        s.note = { text: left === 0 ? "Quest beaten!" : left === 1 ? "One more!" : left + " to go", win: true };
        this.save();
        this.emit(left === 0
          ? { type: "schedule", ms: DELAY.winScreen, step: "win" }
          : { type: "schedule", ms: DELAY.nextInQuest, step: "next" });
        return;
      }

      const rare = isRare(s.showing);
      const isNew = this.collect(COLLECTIBLES[s.showing].id, "bg", "practice", null);
      s.entry = "right";
      s.note = {
        text: rare
          ? "You caught the " + NAMES[s.showing].toLowerCase() + "!"
          : isNew
            ? NAMES[s.showing] + " jumped in your backpack!"
            : (s.streak >= 5 ? s.streak + " in a row!" : "Yes!"),
        win: true,
      };
      this.save();
      this.emit({ type: "schedule", ms: rare ? DELAY.nextRare : isNew ? DELAY.nextNew : DELAY.nextRepeat, step: "next" });
    } else {
      s.streak = 0;
      s.streakShown = 0;               // the streak hides right away on a miss
      onMiss(s.weak, k);                 // he'll see this one twice more
      s.entry = "wrong";
      s.phase = "correcting";
      s.fixLead = !s.quest ? "The answer is:"
        : s.quest.def.id === "mystery" ? "Not quite. The answer is:" : "Quest over. The answer is:";
      if (s.quest) {
        s.quest.missAt = s.quest.done;
        s.quest.ended = true;
        this.emit({ type: "questEnd", runId: s.quest.runId, result: "failed", reached: s.quest.done, rewardId: null });
      }
      this.save();
    }
  }

  /** Put an animal in the backpack. Returns true if it's the first one of its kind. */
  private collect(id: string, from: FlySource, source: CatchSource | null, questRunId: string | null): boolean {
    const s = this.s;
    const isNew = !s.caught[id];
    s.caught[id] = (s.caught[id] || 0) + 1;
    if (source) this.emit({ type: "catch", collectibleId: id, source, questRunId });
    this.emit({ type: "fly", collectibleId: id, from });
    return isNew;
  }

  /** The fly-to-bag finished: the bag pops and its count catches up. */
  bagPopped(): void {
    this.s.bagShown = caughtCount(this.s.caught);
    this.s.bagPops++;
  }

  /** "Got it" after a practice miss. */
  gotIt(): void {
    if (this.s.phase !== "correcting" || this.s.quest) return;
    this.resetScreen();
    this.nextQuestion();
  }

  /* ---------- quest flow ---------- */

  private resetScreen(): void {
    this.s.reward = null;
    this.s.note = { text: "", win: false };
  }

  startQuest(id: QuestId): void {
    const s = this.s;
    const def = questById(id);
    if (def.id === "mystery" && s.mysteryDay === this.ctx.today()) return;   // the card is disabled
    s.quest = { def, done: 0, runId: this.ctx.newId(), missAt: null, ended: false };
    this.emit({ type: "questStart", runId: s.quest.runId, questId: def.id, length: def.len });
    s.panel = "none";
    s.background = { kind: "emblem", questId: def.id, v: ++this.bgV };
    this.resetScreen();
    this.nextQuestion();
  }

  /** "Try again" after a quest miss: the same quest from the start. */
  tryAgain(): void {
    const s = this.s;
    if (s.phase !== "correcting" || !s.quest) return;
    this.startQuest(s.quest.def.id);
  }

  /** "Stop" after a quest miss. */
  stop(): void {
    if (this.s.phase !== "correcting" || !this.s.quest) return;
    this.endQuest();
  }

  /** The Quit chip on the quest bar. */
  quit(): void {
    if (this.s.phase === "reward" || this.s.phase === "flying") return;
    if (!this.s.quest) return;
    this.endQuest();
  }

  endQuest(): void {
    const s = this.s;
    if (s.quest && !s.quest.ended) {
      this.emit({ type: "questEnd", runId: s.quest.runId, result: "quit", reached: s.quest.done, rewardId: null });
    }
    s.quest = null;
    this.resetScreen();
    this.nextQuestion();
  }

  winQuest(): void {
    const s = this.s;
    const q = s.quest;
    if (!q || q.done < q.def.len) return;     // quit during the 700 ms before the win screen
    const def = q.def;
    const today = this.ctx.today();

    s.phase = "reward";
    const title = def.id === "mystery" ? "The Mystery Box opened!" : def.name + " beaten!";
    q.ended = true;

    if (def.id === "mystery") {
      s.mysteryDay = today;
      const prize = rollMystery(this.ctx.rng);
      s.reward = { kind: "prize", title, sub: s.caught[prize.id] ? "You got another one!" : "You got a new animal!", prizeId: prize.id };
      s.pendingRewardId = prize.id;
      this.emit({ type: "catch", collectibleId: prize.id, source: "mystery", questRunId: q.runId });   // recorded at win
      this.emit({ type: "questEnd", runId: q.runId, result: "won", reached: q.done, rewardId: prize.id });
    } else if (def.id === "pick") {
      const rareUsed = s.rarePickDay === today;
      s.reward = {
        kind: "pick", title, rareUsed,
        sub: rareUsed ? "Pick an animal. You already picked a rare one today." : "Pick any animal. You can pick 1 rare animal a day.",
      };
      this.emit({ type: "questEnd", runId: q.runId, result: "won", reached: q.done, rewardId: null });
    } else if (isElementGroup(def.id)) {
      const prize = rollElement(def.id, s.caught, this.ctx.rng);
      s.reward = { kind: "prize", title, sub: s.caught[prize.id] ? "You won another one!" : "You won a new animal!", prizeId: prize.id };
      s.pendingRewardId = prize.id;
      this.emit({ type: "catch", collectibleId: prize.id, source: "quest", questRunId: q.runId });       // recorded at win
      this.emit({ type: "questEnd", runId: q.runId, result: "won", reached: q.done, rewardId: prize.id });
    }
    this.save();
  }

  /** "Put it in my backpack" (prize) or tapping an animal on the Pick-a-Pet grid. */
  claim(id: string): void {
    const s = this.s;
    if (s.phase !== "reward" || !s.reward || !s.quest) return;
    const runId = s.quest.runId;

    if (s.reward.kind === "prize") {
      if (id !== s.reward.prizeId) return;
      s.pendingRewardId = null;
      s.phase = "flying";
      this.collect(id, "prize", null, null);         // already recorded at win
    } else {
      const c = BY_ID.get(id);
      if (!c || (c.group !== "animals" && c.group !== "rare")) return;
      const rare = c.group === "rare";
      if (rare && s.reward.rareUsed) return;
      if (rare) s.rarePickDay = this.ctx.today();
      s.phase = "flying";
      this.collect(id, `pick:${id}`, "pick", runId);
      this.emit({ type: "questReward", runId, rewardId: id });
    }
    this.save();
    this.emit({ type: "schedule", ms: DELAY.endAfterClaim, step: "endQuest" });
  }

  /** A scheduled step fired (the UI owns the timers). */
  step(which: ScheduledStep): void {
    if (which === "next") this.nextQuestion();
    else if (which === "win") this.winQuest();
    else this.endQuest();
  }

  /* ---------- panels ---------- */

  togglePanel(which: "quests" | "bag"): void {
    this.s.panel = this.s.panel === which ? "none" : which;
  }

  /* ---------- physical keyboard ---------- */

  /** Returns true when the key was used and the default should be prevented. */
  keydown(key: string, responseMs: number): boolean {
    const s = this.s;
    if (s.panel !== "none") return false;
    if (s.phase === "correcting") {
      if (key === "Enter" || key === " ") {
        if (s.quest) this.tryAgain(); else this.gotIt();
        return true;
      }
      return false;
    }
    if (s.phase === "reward") {
      if (key === "Enter" && s.reward?.kind === "prize") { this.claim(s.reward.prizeId); return true; }
      return false;
    }
    if (key >= "0" && key <= "9" && key.length === 1) { this.type(key); return false; }
    if (key === "Backspace") { this.erase(); return true; }
    if (key === "Enter") { this.check(responseMs); return false; }
    return false;
  }
}
