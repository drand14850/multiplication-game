// Counting kids who play without an account, without recording anything about them.
// The browser remembers two things locally: whether it has said "a new browser started
// playing" yet, and how many answers it hasn't reported. It sends only those two numbers.

import type { Effect, Saved } from "../game/logic/engine";
import { LocalStore, type GameStore } from "./gameStore";

const KEY = "times-tables-guest-count";
const BATCH = 10;     // report every 10 answers (and when the page is hidden)
const MAX_PER_CALL = 50;

/** Sends one report; resolves true if the server took it. */
export type Tick = (newGuest: boolean, answers: number) => Promise<boolean>;

interface CountState { reported: boolean; pending: number }

function read(): CountState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as CountState | null;
    if (s && typeof s.reported === "boolean" && typeof s.pending === "number") return s;
  } catch { /* fall through */ }
  return { reported: false, pending: 0 };
}
function write(s: CountState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked: just don't count */ }
}

export class GuestCounter {
  private tick: Tick;
  private sending: Promise<void> | null = null;
  private onHide = () => { if (document.visibilityState === "hidden") void this.flush(); };

  constructor(tick: Tick) { this.tick = tick; }

  start(): void {
    document.addEventListener("visibilitychange", this.onHide);
    void this.flush();                                   // a new browser says so right away
  }
  stop(): void {
    document.removeEventListener("visibilitychange", this.onHide);
    void this.flush();
  }

  answered(): void {
    const s = read();
    s.pending++;
    write(s);
    if (s.pending >= BATCH) void this.flush();
  }

  /** Report what's unreported. Safe to call any time; failures just wait for next time. */
  flush(): Promise<void> {
    if (this.sending) return this.sending;
    this.sending = (async () => {
      for (;;) {
        const s = read();
        const n = Math.min(s.pending, MAX_PER_CALL);
        if (s.reported && n === 0) return;
        const ok = await this.tick(!s.reported, n).catch(() => false);
        if (!ok) return;
        const now = read();                              // answers may have come in meanwhile
        write({ reported: true, pending: Math.max(0, now.pending - n) });
      }
    })().finally(() => { this.sending = null; });
    return this.sending;
  }
}

/** The guest game's store: saves in this browser like before, and counts answers. */
export class GuestStore implements GameStore {
  private local: LocalStore;
  private counter: GuestCounter;
  constructor(counter: GuestCounter, key = "guest") {
    this.local = new LocalStore(key);
    this.counter = counter;
  }
  load(): Partial<Saved> | null { return this.local.load(); }
  record(e: Effect): void {
    if (e.type === "attempt") this.counter.answered();
    this.local.record(e);
  }
}
