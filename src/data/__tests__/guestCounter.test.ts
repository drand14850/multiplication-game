// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { GuestCounter } from "../guestCounter";

beforeEach(() => localStorage.clear());

function server(up = true) {
  const calls: [boolean, number][] = [];
  const state = { up };
  const tick = async (g: boolean, n: number) => { if (!state.up) return false; calls.push([g, n]); return true; };
  return { calls, state, tick };
}

describe("counting kids who play without an account", () => {
  it("a new browser says so once, then reports answers in tens", async () => {
    const s = server();
    const c = new GuestCounter(s.tick);
    await c.flush();
    expect(s.calls).toEqual([[true, 0]]);
    for (let i = 0; i < 23; i++) c.answered();
    await c.flush();
    expect(s.calls.slice(1).reduce((t, [, n]) => t + n, 0)).toBe(23);
    expect(s.calls.slice(1).every(([g]) => g === false)).toBe(true);
    await c.flush();
    expect(s.calls.slice(1).reduce((t, [, n]) => t + n, 0)).toBe(23);       // nothing counted twice
  });

  it("keeps counting offline and reports it all later", async () => {
    const s = server(false);
    const c = new GuestCounter(s.tick);
    for (let i = 0; i < 7; i++) c.answered();
    await c.flush();
    expect(s.calls).toEqual([]);
    s.state.up = true;
    await c.flush();
    expect(s.calls).toEqual([[true, 7]]);
  });

  it("the same browser is only ever one new guest, even after a reload", async () => {
    const s = server();
    await new GuestCounter(s.tick).flush();
    await new GuestCounter(s.tick).flush();         // a new page load
    expect(s.calls.filter(([g]) => g)).toHaveLength(1);
  });

  it("sends at most 50 answers per report", async () => {
    const s = server();
    const c = new GuestCounter(s.tick);
    for (let i = 0; i < 120; i++) c.answered();
    await c.flush();
    expect(Math.max(...s.calls.map(([, n]) => n))).toBeLessThanOrEqual(50);
    expect(s.calls.reduce((t, [, n]) => t + n, 0)).toBe(120);
  });

  it("stores nothing but a yes/no and a number", () => {
    const c = new GuestCounter(server(false).tick);
    c.answered();
    expect(JSON.parse(localStorage.getItem("times-tables-guest-count")!)).toEqual({ reported: false, pending: 1 });
  });
});
