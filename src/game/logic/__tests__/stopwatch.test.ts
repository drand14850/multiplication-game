import { describe, expect, it } from "vitest";
import { today } from "../day";
import { Stopwatch } from "../stopwatch";

describe("response timer", () => {
  it("pauses and caps at 60 s", () => {
    let t = 0;
    const w = new Stopwatch(() => t);
    w.start();
    t = 1000;
    w.pause();
    t = 50_000;                 // hidden tab / panel open
    w.resume();
    t = 51_500;
    expect(w.elapsed()).toBe(2500);
    t = 500_000;
    expect(w.elapsed()).toBe(60_000);
  });
});

describe("today()", () => {
  it("uses the family time zone when given", () => {
    const d = new Date("2026-10-15T03:30:00Z");
    expect(today("America/Los_Angeles", d)).toBe("2026-10-14");
    expect(today("Europe/London", d)).toBe("2026-10-15");
  });
});
