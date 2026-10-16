// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { FakeBackend } from "../../data/fakeBackend";
import { FactGrid } from "../FactGrid";
import type { FactStat } from "../logic";

afterEach(cleanup);

const stat = (a: number, b: number): FactStat =>
  ({ a, b, total: 9, recent: 5, recentCorrect: 4, medianCorrectMs: 6000, medianAllMs: 6000, lastSeen: "2026-10-15T12:00:00Z" });

describe("FactGrid", () => {
  it("tapping a fact shows its attempt history", async () => {
    const backend = new FakeBackend();
    backend.dash.history = [{ a: 7, b: 8, given: 54, correct: false, ms: 6100, mode: "practice", at: "2026-10-15T12:00:00Z" }];
    const user = userEvent.setup();
    render(<FactGrid backend={backend} childId="c1" stats={[stat(7, 8)]} thresholdMs={3000} merge={false} onMerge={() => {}} />);
    const cell = screen.getByRole("button", { name: /^7 × 8:/ });
    await user.click(cell);
    expect(cell.getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByText(/latest tries/)).toBeTruthy();
    expect(await screen.findByText("✗ wrong")).toBeTruthy();
  });

  it("shows 121 cells, or 66 with commuted pairs merged", () => {
    const { rerender } = render(<FactGrid backend={new FakeBackend()} childId="c1" stats={[]} thresholdMs={3000} merge={false} onMerge={() => {}} />);
    expect(screen.getAllByRole("button", { name: /^\d+ × \d+/ })).toHaveLength(121);
    rerender(<FactGrid backend={new FakeBackend()} childId="c1" stats={[]} thresholdMs={3000} merge={true} onMerge={() => {}} />);
    expect(screen.getAllByRole("button", { name: /^\d+ × \d+/ })).toHaveLength(66);
  });
});
