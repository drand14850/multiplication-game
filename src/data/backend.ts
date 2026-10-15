import type { Sender } from "./writeQueue";

// What the app needs from the server. SupabaseBackend is the real one; FakeBackend
// (tests only) keeps everything in memory.

export interface Session { userId: string; email: string }

export interface Child {
  id: string;
  name: string;
  avatar: string;     // a regular-animal collectible id: "cat", "fox", …
  hasPin: boolean;
}

export interface ParentSettings {
  timeZone: string;
  fluencyMs: number;
}

export type PinResult = "ok" | "wrong" | "locked";

/** What the server knows about a child's game. */
export interface ServerChildState {
  reviewPile: Record<string, number>;
  caught: Record<string, number>;          // collectible id -> times caught
  /** Mystery and Pick-a-Pet catches from the last two days, for the once-a-day rules. */
  recentDaily: { collectibleId: string; source: "mystery" | "pick"; createdAt: string }[];
}

export interface Backend {
  getSession(): Promise<Session | null>;
  onAuthChange(cb: (s: Session | null) => void): () => void;
  /** Returns needsConfirm = true when the project requires email confirmation first. */
  signUp(email: string, password: string, timeZone: string): Promise<{ needsConfirm: boolean }>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Parent gate: is this the signed-in parent's password? */
  checkPassword(password: string): Promise<boolean>;

  listChildren(): Promise<Child[]>;
  createChild(name: string, avatar: string, pin: string | null): Promise<Child>;
  updateChild(id: string, patch: { name?: string; avatar?: string }): Promise<void>;
  deleteChild(id: string): Promise<void>;
  setPin(id: string, pin: string | null): Promise<void>;
  verifyPin(id: string, pin: string): Promise<PinResult>;

  getSettings(): Promise<ParentSettings>;
  updateSettings(patch: Partial<ParentSettings>): Promise<void>;

  loadChildState(childId: string): Promise<ServerChildState>;
  /** Sends write-queue batches under the signed-in parent's account. */
  sender(): Sender;
}


/** Errors shown to the parent, in plain words. */
export class BackendError extends Error {}

export const AVATARS = ["cat", "dog", "bear", "bunny", "fox", "owl", "frog", "penguin", "whale", "turtle", "elephant", "pig", "panda"] as const;

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
