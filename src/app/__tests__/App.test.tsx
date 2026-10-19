// @vitest-environment jsdom
import "fake-indexeddb/auto";
// The app flow with an in-memory backend: playing without an account, kid accounts with a
// family code, kid sign-in on any device, and the grown-up area.

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeBackend } from "../../data/fakeBackend";
import { App } from "../App";

const PASSWORD = "correct horse";
let backend: FakeBackend;
type User = ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  localStorage.clear();
  backend = new FakeBackend({ email: "parent@example.test", password: PASSWORD });
});
afterEach(cleanup);

/** Answer the problem on screen right, with the keyboard. */
async function answerOne(user: User) {
  const [a, b] = document.querySelector("#eq")!.textContent!.split("×").map((x) => parseInt(x));
  await user.keyboard(String(a * b));
  await user.keyboard("{Enter}");
}

async function signUpKid(user: User, code: string, name: string, password = "tiger") {
  await user.click(await screen.findByRole("button", { name: "Make my account" }));
  const form = screen.getByRole("form", { name: "Make my account" });
  await user.type(within(form).getByLabelText(/Family code/), code);
  await user.type(within(form).getByLabelText(/Pick a name/), name);
  await user.type(within(form).getByLabelText(/Pick a password/), password);
  await user.click(within(form).getByRole("button", { name: "Make my account" }));
}

describe("front page", () => {
  it("offers Play, Sign in, Make my account, and a Grown-ups link", async () => {
    render(<App backend={backend} />);
    expect(await screen.findByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Make my account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Grown-ups" })).toBeTruthy();
  });
});

describe("playing without an account", () => {
  it("saves in this browser only; nothing goes to the server", async () => {
    const user = userEvent.setup();
    render(<App backend={backend} />);
    await user.click(await screen.findByRole("button", { name: "Play" }));
    expect(document.querySelector("#eq")).toBeTruthy();
    await answerOne(user);
    expect(Object.keys(localStorage).sort()).toEqual(["times-tables-guest-count", "times-tables-state:guest"]);
    expect(backend.session).toBeNull();
    expect([...Object.values(backend.rows)].every((m) => m.size === 0)).toBe(true);
    // only counts go to the server: "a new browser" and how many answers
    await waitFor(() => expect(backend.ticks[0]).toEqual({ newGuest: true, answers: 0 }));
    await user.click(screen.getByRole("button", { name: /Switch player/ }));
    expect(await screen.findByText(/Your 1 animal is saved on this computer/)).toBeTruthy();
    expect(screen.getByText(/Nothing about you is saved/)).toBeTruthy();
    // leaving the game reports the answer
    await waitFor(() => expect(backend.ticks.reduce((t, k) => t + k.answers, 0)).toBe(1));
    expect(backend.ticks.every((k) => Object.keys(k).sort().join() === "answers,newGuest")).toBe(true);
  });
});

describe("kid accounts", () => {
  it("need the family code", async () => {
    const user = userEvent.setup();
    render(<App backend={backend} />);
    await signUpKid(user, "WRONG-1234", "leo");
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "That family code doesn't match. Ask a grown-up to check it.");
    expect(document.querySelector("#eq")).toBeNull();
  });

  it("with the code: straight into the game, on the family's dashboard", async () => {
    const user = userEvent.setup();
    render(<App backend={backend} />);
    await signUpKid(user, "rand 4821", "Leo");
    await waitFor(() => expect(document.querySelector("#eq")).toBeTruthy());
    expect(backend.children).toEqual([expect.objectContaining({ name: "leo", parentId: "parent-1" })]);
  });

  it("bring this browser's animals along, then the browser copy is cleared", async () => {
    const user = userEvent.setup();
    render(<App backend={backend} />);
    await user.click(await screen.findByRole("button", { name: "Play" }));
    await answerOne(user);
    await user.click(screen.getByRole("button", { name: /Switch player/ }));
    await signUpKid(user, "RAND-4821", "mia");
    await waitFor(() => expect(document.querySelector("#eq")).toBeTruthy());
    expect(backend.imported).toHaveLength(1);
    expect(Object.values(backend.imported[0].saved.caught).reduce((a, b) => a + b, 0)).toBe(1);
    expect(localStorage.getItem("times-tables-state:guest")).toBeNull();
  });

  it("sign in on another device with username and password, and sign out", async () => {
    await backend.createChild("Leo", "owl", "leo_r", "rocket");
    const user = userEvent.setup();
    render(<App backend={backend} />);
    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    await user.type(screen.getByLabelText("Your name"), "LEO_R");
    await user.type(screen.getByLabelText("Password"), "nope");
    await user.click(screen.getByRole("button", { name: "Let's go" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "That name and password don't match.");
    await user.type(screen.getByLabelText("Password"), "rocket");
    await user.click(screen.getByRole("button", { name: "Let's go" }));
    await waitFor(() => expect(document.querySelector("#eq")).toBeTruthy());

    await user.click(screen.getByRole("button", { name: /Switch player/ }));
    expect(screen.getByRole("heading", { name: "Hi Leo!" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("button", { name: "Play" })).toBeTruthy();
    expect(backend.session).toBeNull();
  });

  it("lock for a minute after 5 wrong passwords", async () => {
    await backend.createChild("Leo", "owl", "leo_r", "rocket");
    const user = userEvent.setup();
    render(<App backend={backend} />);
    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    await user.type(screen.getByLabelText("Your name"), "leo_r");
    for (let i = 0; i < 5; i++) {
      await user.type(screen.getByLabelText("Password"), "nope");
      await user.click(screen.getByRole("button", { name: "Let's go" }));
      await screen.findByRole("alert");
    }
    await user.type(screen.getByLabelText("Password"), "rocket");
    await user.click(screen.getByRole("button", { name: "Let's go" }));
    expect(await screen.findByText("Too many tries. Wait a minute, then try again.")).toBeTruthy();
  });

  it("say so when kid sign-in isn't switched on in Supabase", async () => {
    backend.anonymousAllowed = false;
    const user = userEvent.setup();
    render(<App backend={backend} />);
    await signUpKid(user, "RAND-4821", "leo");
    expect(await screen.findByText("Kid sign-in isn't switched on yet. Ask a grown-up.")).toBeTruthy();
  });

  it("a kid's device never shows the grown-up area", async () => {
    const user = userEvent.setup();
    render(<App backend={backend} />);
    await signUpKid(user, "RAND-4821", "leo");
    await waitFor(() => expect(document.querySelector("#eq")).toBeTruthy());
    expect(screen.queryByRole("heading", { name: "Grown-ups" })).toBeNull();
    expect(screen.queryByText("RAND-4821")).toBeNull();
  });

  it("each kid keeps their own saved game", async () => {
    await backend.createChild("Ana", "fox", "ana", "abcd");
    const user = userEvent.setup();
    render(<App backend={backend} />);
    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    await user.type(screen.getByLabelText("Your name"), "ana");
    await user.type(screen.getByLabelText("Password"), "abcd");
    await user.click(screen.getByRole("button", { name: "Let's go" }));
    await waitFor(() => expect(document.querySelector("#eq")).toBeTruthy());
    await answerOne(user);
    expect(Object.keys(localStorage)).toEqual(["times-tables-state:" + backend.children[0].id]);
  });
});

describe("grown-up area", () => {
  async function signInParent(user: User) {
    render(<App backend={backend} />);
    await user.click(await screen.findByRole("button", { name: "Grown-ups" }));
    await user.type(screen.getByLabelText("Email"), "parent@example.test");
    await user.type(screen.getByLabelText("Password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByRole("heading", { name: "Grown-ups" });
  }

  it("shows site totals only to the site admin", async () => {
    const user = userEvent.setup();
    await signInParent(user);
    expect(screen.queryByRole("heading", { name: "Site totals" })).toBeNull();
    cleanup();
    await backend.signOut();
    backend.totals = { grownups: 3, kids: 5, kidAccounts: 4, guests: 12, questions: 1500, questionsOthers: 610, guestQuestions: 234,
                       questionsToday: 40, questions7d: 600, activeKids7d: 2 };
    await signInParent(user);
    expect(screen.getByRole("heading", { name: "Site totals" })).toBeTruthy();
    expect(screen.getByText("1,734")).toBeTruthy();                 // 1,500 + 234
    expect(screen.getByText("234 without an account")).toBeTruthy();
    expect(screen.getByText("610 from other families")).toBeTruthy();
  });

  it("shows the family code and can make a new one", async () => {
    const user = userEvent.setup();
    await signInParent(user);
    expect(screen.getByText("RAND-4821")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Make a new code" }));
    await user.click(screen.getByRole("button", { name: "New code" }));
    expect(await screen.findByText(/^NEWC-/)).toBeTruthy();
  });

  it("adds a kid with a username and password", async () => {
    const user = userEvent.setup();
    await signInParent(user);
    await user.click(screen.getByRole("button", { name: "Add a kid" }));
    const form = screen.getByRole("form", { name: "New kid" });
    await user.type(within(form).getByLabelText(/Name/), "Cleo");
    await user.click(within(form).getByRole("button", { name: "panda" }));
    await user.type(within(form).getByLabelText(/Username/), "cleo_r");
    await user.type(within(form).getByLabelText(/Password/), "moonbeam");
    await user.click(within(form).getByRole("button", { name: "Add kid" }));
    expect(await screen.findByText("Signs in as cleo_r")).toBeTruthy();
    expect(backend.logins.get("cleo_r")).toMatchObject({ password: "moonbeam" });
  });

  it("gives an existing kid a sign-in", async () => {
    backend.children.push({ id: "child-old", name: "Sam", avatar: "bear", username: null, devices: 0, parentId: "parent-1" });
    const user = userEvent.setup();
    await signInParent(user);
    expect(screen.getByText("No sign-in yet")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Edit Sam" }));
    await user.type(screen.getByLabelText(/Username/), "sam_r");
    await user.type(screen.getByLabelText(/Password/), "bananas");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Signs in as sam_r")).toBeTruthy();
  });

  it("deletes a kid only after confirming", async () => {
    await backend.createChild("Ana", "fox", "ana", "abcd");
    const user = userEvent.setup();
    await signInParent(user);
    await user.click(screen.getByRole("button", { name: "Edit Ana" }));
    await user.click(screen.getByRole("button", { name: "Delete kid" }));
    expect(backend.children).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Delete Ana" }));
    await waitFor(() => expect(backend.children).toHaveLength(0));
  });
});
