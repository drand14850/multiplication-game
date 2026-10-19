import type { FactStat } from "../dashboard/logic";
import type { Saved } from "../game/logic/engine";
import type { Sender } from "./writeQueue";

// What the app needs from the server. SupabaseBackend is the real one; FakeBackend
// (tests only) keeps everything in memory.
//
// Two kinds of signed-in session:
//  - a parent: email + password, sees the dashboard for every kid on their family code
//  - a kid's device: an anonymous session linked to one child by kid_sign_in / kid_sign_up

export interface Session { userId: string; email: string; anonymous: boolean }

export interface Child {
  id: string;
  name: string;
  avatar: string;            // a regular-animal collectible id: "cat", "fox", …
  username: string | null;   // null: no kid sign-in set up yet
  devices: number;           // devices currently signed in as this kid
}

export interface ParentSettings {
  timeZone: string;
  fluencyMs: number;
  familyCode: string;
}

/** The kid a device is signed in as. */
export interface KidMe { childId: string; name: string; avatar: string; username: string; timeZone: string; fluencyMs: number }

export type KidError =
  | "bad_family_code" | "username_taken" | "bad_username" | "password_too_short"
  | "wrong_username_or_password" | "locked" | "too_many_tries"
  | "parents_cannot_be_kids" | "not_signed_in" | "kid_sign_in_off" | "offline";
export type KidResult = { ok: true; childId: string } | { ok: false; error: KidError };

/** What the server knows about a child's game. */
export interface ServerChildState {
  reviewPile: Record<string, number>;
  caught: Record<string, number>;          // collectible id -> times caught
  /** Mystery and Pick-a-Pet catches from the last two days, for the once-a-day rules. */
  recentDaily: { collectibleId: string; source: "mystery" | "pick"; createdAt: string }[];
  /** Each fact's last 5 tries, oldest first, for adaptive problem picking. */
  recentTries: { a: number; b: number; correct: boolean; ms: number; at: string }[];
}

export interface TrendDay { day: string; problems: number; correct: number; medianMs: number | null; sessions: number; minutes: number }
export interface QuestStat { questId: string; runs: number; wins: number; best: number }
export interface HistoryRow { a: number; b: number; given: number; correct: boolean; ms: number; mode: string; at: string }

/** Site-wide numbers, for the site admin only. */
export interface SiteTotals {
  grownups: number;
  kids: number;
  kidAccounts: number;
  guests: number;            // browsers that played without an account
  questions: number;         // answers by kids on a family
  questionsOthers: number;   // of those, by kids on families other than the admin's
  guestQuestions: number;    // answers without an account
  questionsToday: number;    // all answers today
  questions7d: number;       // all answers in the last 7 days
  activeKids7d: number;
}

export interface Backend {
  getSession(): Promise<Session | null>;
  onAuthChange(cb: (s: Session | null) => void): () => void;

  /* grown-ups */
  /** Returns needsConfirm = true when the project requires email confirmation first. */
  signUp(email: string, password: string, timeZone: string): Promise<{ needsConfirm: boolean }>;
  signIn(email: string, password: string): Promise<void>;
  /** Signs out whoever is signed in (a kid's device is unlinked first). */
  signOut(): Promise<void>;

  /* kids */
  kidMe(): Promise<KidMe | null>;
  kidSignUp(familyCode: string, username: string, password: string, avatar: string): Promise<KidResult>;
  kidSignIn(username: string, password: string): Promise<KidResult>;
  /** Carries progress from playing without an account into a new account (signed in as that kid). */
  importGuest(childId: string, saved: Saved): Promise<void>;

  /* a parent's kids */
  listChildren(): Promise<Child[]>;
  createChild(name: string, avatar: string, username: string, password: string): Promise<void>;
  updateChild(id: string, patch: { name?: string; avatar?: string }): Promise<void>;
  deleteChild(id: string): Promise<void>;
  /** Give a kid a sign-in, or change it. password null keeps the current one. */
  setKidLogin(id: string, username: string, password: string | null): Promise<void>;
  signOutKidDevices(id: string): Promise<void>;
  newFamilyCode(): Promise<string>;

  getSettings(): Promise<ParentSettings>;
  updateSettings(patch: Partial<Pick<ParentSettings, "timeZone" | "fluencyMs">>): Promise<void>;

  loadChildState(childId: string): Promise<ServerChildState>;
  /** Sends write-queue batches under whoever is signed in. */
  sender(): Sender;

  /** Kids playing without an account: "a new browser started" and/or "n more answers". No identifiers. */
  guestTick(newGuest: boolean, answers: number): Promise<boolean>;
  /** Totals across the whole site; null unless the signed-in grown-up is the site admin. */
  siteTotals(): Promise<SiteTotals | null>;

  /* dashboard */
  factStats(childId: string, merge: boolean): Promise<FactStat[]>;
  dailyTrend(childId: string, days: number): Promise<TrendDay[]>;
  questStats(childId: string): Promise<QuestStat[]>;
  longestStreak(childId: string): Promise<number>;
  /** The latest attempts at one fact (both orders when merged), newest first. */
  factHistory(childId: string, a: number, b: number, merge: boolean): Promise<HistoryRow[]>;
}

/** Errors shown to the parent, in plain words. */
export class BackendError extends Error {}

export const AVATARS = ["cat", "dog", "bear", "bunny", "fox", "owl", "frog", "penguin", "whale", "turtle", "elephant", "pig", "panda"] as const;

/** Kid-friendly words for each kid sign-in problem. */
export const KID_ERROR_TEXT: Record<KidError, string> = {
  bad_family_code: "That family code doesn't match. Ask a grown-up to check it.",
  username_taken: "Someone already has that name. Try another one.",
  bad_username: "Use 3 to 20 letters or numbers, no spaces.",
  password_too_short: "Make your password at least 4 letters or numbers.",
  wrong_username_or_password: "That name and password don't match.",
  locked: "Too many tries. Wait a minute, then try again.",
  too_many_tries: "Too many tries. Wait a few minutes, then try again.",
  parents_cannot_be_kids: "A grown-up is signed in here. Sign out first.",
  not_signed_in: "Something went wrong. Try again.",
  kid_sign_in_off: "Kid sign-in isn't switched on yet. Ask a grown-up.",
  offline: "Can't reach the internet. Check the connection and try again.",
};

/** Usernames are lowercase letters, numbers and _, 3–20 long. */
export function normUsername(u: string): string {
  return u.trim().toLowerCase();
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
