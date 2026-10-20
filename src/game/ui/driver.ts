// Runs engine actions and carries out their effects: timers, fly-to-bag, store writes,
// and the response timer. Plain class, so React only has to render its state.

import type { GameStore } from "../../data/gameStore";
import { BY_ID } from "../logic/collectibles";
import { today } from "../logic/day";
import { GameEngine, type Effect } from "../logic/engine";
import { defaultRng } from "../logic/rng";
import { Stopwatch } from "../logic/stopwatch";
import { flyToBag } from "./flyToBag";

export class GameDriver {
  readonly engine: GameEngine;
  readonly watch = new Stopwatch();
  private bagBtn: HTMLElement | null = null;
  private store: GameStore;
  private cancels = new Set<() => void>();
  private listeners = new Set<() => void>();
  private version = 0;
  private seenSeq = -1;

  /** adaptive: lean toward weak facts, with this fluency threshold; null = the reference's uniform picking */
  constructor(store: GameStore, private timeZone?: string, adaptive: { fluencyMs: number } | null = null, classicRares = false) {
    this.store = store;
    this.engine = new GameEngine(
      { rng: defaultRng, today: () => this.today(), newId: () => crypto.randomUUID(), adaptive: adaptive ?? undefined, classicRares },
      store.load(),
    );
    this.engine.takeEffects();
    this.syncTimer();
  }

  today(): string { return today(this.timeZone); }

  setBagButton = (el: HTMLElement | null): void => { this.bagBtn = el; };

  /* ---------- useSyncExternalStore ---------- */

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = (): number => this.version;

  /* ---------- actions ---------- */

  run = (action: (e: GameEngine) => void): void => {
    action(this.engine);
    for (const f of this.engine.takeEffects()) this.handle(f);
    this.syncTimer();
    this.version++;
    this.listeners.forEach((fn) => fn());
  };

  /** Response time so far for the problem on screen. */
  elapsed = (): number => this.watch.elapsed();

  private handle(f: Effect): void {
    if (f.type === "schedule") {
      const t = setTimeout(() => { this.cancels.delete(cancel); this.run((e) => e.step(f.step)); }, f.ms);
      const cancel = () => clearTimeout(t);
      this.cancels.add(cancel);
    } else if (f.type === "fly") {
      const src = f.from === "bg" ? document.querySelector("#bg svg")
        : f.from === "prize" ? document.querySelector(".prize svg")
        : document.querySelector(`[data-pick="${f.from.slice(5)}"] svg`);
      const cancel = flyToBag(BY_ID.get(f.collectibleId)!.svg, src, this.bagBtn, () => {
        this.cancels.delete(cancel);
        this.run((e) => e.bagPopped());
      });
      this.cancels.add(cancel);
    } else {
      this.store.record(f);
    }
  }

  /* ---------- response timer: from problem shown to ✓/Enter, paused while hidden or a panel is open ---------- */

  syncTimer = (): void => {
    const s = this.engine.s;
    if (s.current.seq !== this.seenSeq) {
      this.seenSeq = s.current.seq;
      this.watch.start();
    }
    const paused = (typeof document !== "undefined" && document.hidden) || s.panel !== "none";
    if (paused) this.watch.pause(); else this.watch.resume();
  };

  /* ---------- physical keyboard ---------- */

  onKeyDown = (ev: KeyboardEvent): void => {
    this.run((e) => { if (e.keydown(ev.key, this.elapsed())) ev.preventDefault(); });
  };

  /** Hook up document listeners. Returns the teardown. */
  attach(): () => void {
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("visibilitychange", this.syncTimer);
    return () => {
      document.removeEventListener("keydown", this.onKeyDown);
      document.removeEventListener("visibilitychange", this.syncTimer);
      this.cancels.forEach((c) => c());
      this.cancels.clear();
    };
  }
}
