import { RESPONSE_CAP_MS } from "./constants";

/** response_ms timer: runs from when a problem is shown, pauses while hidden or a panel is open, capped at 60 s. */
export class Stopwatch {
  private acc = 0;
  private since: number | null = null;
  private now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
  }

  start(): void { this.acc = 0; this.since = this.now(); }
  pause(): void { if (this.since !== null) { this.acc += this.now() - this.since; this.since = null; } }
  resume(): void { if (this.since === null) this.since = this.now(); }
  elapsed(): number {
    const ms = this.acc + (this.since !== null ? this.now() - this.since : 0);
    return Math.min(RESPONSE_CAP_MS, Math.max(0, Math.round(ms)));
  }
}
