// @vitest-environment jsdom
// The app flow with an in-memory backend: sign-in, "Who's playing?", child PIN, and the parent gate.

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeBackend } from "../../data/fakeBackend";
import { App } from "../App";

const PASSWORD = "correct horse";
let backend: FakeBackend;

beforeEach(async () => {
  localStorage.clear();
  backend = new FakeBackend({ email: "parent@example.test", password: PASSWORD });
  await backend.signIn("parent@example.test", PASSWORD);      // already signed in on this device
  await backend.createChild("Ana", "fox", null);
  await backend.createChild("Ben", "owl", "4321");
});
afterEach(cleanup);

const dashboardShown = () => screen.queryByRole("heading", { name: "Grown-ups" }) !== null;

async function typePin(user: ReturnType<typeof userEvent.setup>, pin: string) {
  for (const d of pin) await user.click(screen.getByRole("button", { name: d }));
}

describe("kid mode", () => {
  it("opens to Who's playing? on a signed-in device", async () => {
    render(<App backend={backend} />);
    expect(await screen.findByRole("heading", { name: "Who's playing?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ana/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ben/ })).toBeTruthy();
    expect(dashboardShown()).toBe(false);
  });

  it("a child without a PIN goes straight into the game, and can switch back", async () => {
    const user = userEvent.setup();
    render(<App backend={backend} />);
    await user.click(await screen.findByRole("button", { name: /Ana/ }));
    expect(document.querySelector("#eq")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Switch player/ }));
    expect(await screen.findByRole("heading", { name: "Who's playing?" })).toBeTruthy();
  });

  it("a child with a PIN needs the right one", async () => {
    const user = userEvent.setup();
    render(<App backend={backend} />);
    await user.click(await screen.findByRole("button", { name: /Ben/ }));
    expect(screen.getByRole("heading", { name: "Hi Ben!" })).toBeTruthy();
    await typePin(user, "1111");
    expect(await screen.findByText("Not quite. Try again.")).toBeTruthy();
    expect(document.querySelector("#eq")).toBeNull();
    await typePin(user, "4321");
    await waitFor(() => expect(document.querySelector("#eq")).toBeTruthy());
  });

  it("each child keeps their own saved game", async () => {
    const user = userEvent.setup();
    render(<App backend={backend} />);
    await user.click(await screen.findByRole("button", { name: /Ana/ }));
    const eq = document.querySelector("#eq")!.textContent!;
    const [a, b] = eq.split("×").map((x) => parseInt(x));
    for (const d of String(a * b)) await user.keyboard(d);
    await user.keyboard("{Enter}");
    const keys = Object.keys(localStorage);
    expect(keys).toEqual(["times-tables-state:" + backend.children[0].id]);
  });
});

describe("parent gate", () => {
  it("a child can't reach the grown-up area without the parent's password", async () => {
    const user = userEvent.setup();
    render(<App backend={backend} />);
    await user.click(await screen.findByRole("button", { name: "Grown-ups" }));
    expect(screen.getByRole("heading", { name: "Grown-ups only" })).toBeTruthy();
    expect(dashboardShown()).toBe(false);

    await user.type(screen.getByLabelText("Password"), "letmein");
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "That's not the right password.");
    expect(dashboardShown()).toBe(false);

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Who's playing?" })).toBeTruthy();
    expect(dashboardShown()).toBe(false);
  });

  it("opens with the right password, and locks again after Done", async () => {
    const user = userEvent.setup();
    render(<App backend={backend} />);
    await user.click(await screen.findByRole("button", { name: "Grown-ups" }));
    await user.type(screen.getByLabelText("Password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByRole("heading", { name: "Grown-ups" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(await screen.findByRole("button", { name: "Grown-ups" }));
    expect(screen.getByRole("heading", { name: "Grown-ups only" })).toBeTruthy();
    expect(dashboardShown()).toBe(false);
  });

  it("is locked again after a child plays", async () => {
    const user = userEvent.setup();
    render(<App backend={backend} />);
    await user.click(await screen.findByRole("button", { name: "Grown-ups" }));
    await user.type(screen.getByLabelText("Password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await user.click(await screen.findByRole("button", { name: "Done" }));
    await user.click(await screen.findByRole("button", { name: /Ana/ }));
    await user.click(screen.getByRole("button", { name: /Switch player/ }));
    await user.click(await screen.findByRole("button", { name: "Grown-ups" }));
    expect(screen.getByRole("heading", { name: "Grown-ups only" })).toBeTruthy();
  });
});

describe("grown-up area", () => {
  async function openParent(user: ReturnType<typeof userEvent.setup>) {
    render(<App backend={backend} />);
    await user.click(await screen.findByRole("button", { name: "Grown-ups" }));
    await user.type(screen.getByLabelText("Password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("heading", { name: "Grown-ups" });
  }

  it("adds a child with a PIN, and the PIN is never kept in the browser", async () => {
    const user = userEvent.setup();
    await openParent(user);
    await user.click(screen.getByRole("button", { name: "Add a child" }));
    const form = screen.getByRole("form", { name: "New child" });
    await user.type(within(form).getByLabelText("Name"), "Cleo");
    await user.click(within(form).getByRole("button", { name: "panda" }));
    await user.type(within(form).getByLabelText(/PIN/), "8642");
    await user.click(within(form).getByRole("button", { name: "Add child" }));
    expect(await screen.findByText("Cleo")).toBeTruthy();
    expect(backend.children.find((c) => c.name === "Cleo")).toMatchObject({ avatar: "panda", hasPin: true });
    expect(JSON.stringify(localStorage)).not.toContain("8642");
    expect(JSON.stringify(sessionStorage)).not.toContain("8642");
  });

  it("deletes a child only after confirming", async () => {
    const user = userEvent.setup();
    await openParent(user);
    await user.click(screen.getByRole("button", { name: "Edit Ana" }));
    await user.click(screen.getByRole("button", { name: "Delete child" }));
    expect(backend.children.map((c) => c.name)).toContain("Ana");
    await user.click(screen.getByRole("button", { name: "Delete Ana" }));
    await waitFor(() => expect(backend.children.map((c) => c.name)).toEqual(["Ben"]));
  });

  it("resets and removes a PIN", async () => {
    const user = userEvent.setup();
    await openParent(user);
    await user.click(screen.getByRole("button", { name: "Edit Ben" }));
    await user.click(screen.getByRole("button", { name: "Remove PIN" }));
    await waitFor(() => expect(backend.children.find((c) => c.name === "Ben")!.hasPin).toBe(false));
  });
});

describe("signed out", () => {
  it("shows sign-in, then the grown-up area right after signing in", async () => {
    await backend.signOut();
    const user = userEvent.setup();
    render(<App backend={backend} />);
    await user.type(await screen.findByLabelText("Email"), "parent@example.test");
    await user.type(screen.getByLabelText("Password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Grown-ups" })).toBeTruthy();
  });
});
