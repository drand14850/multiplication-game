// In-memory Backend for UI tests. Mirrors the server rules that matter to the UI:
// a family code to sign up, usernames unique and case-free, one child per device session,
// 5 wrong passwords lock a kid's sign-in. Never imported by the app.

import type { FactStat } from "../dashboard/logic";
import type { Saved } from "../game/logic/engine";
import {
  BackendError, normUsername, type Backend, type Child, type HistoryRow, type KidMe, type KidResult,
  type ParentSettings, type QuestStat, type ServerChildState, type Session, type TrendDay,
} from "./backend";
import type { Row, Sender, SendResult, Table } from "./writeQueue";

interface KidLogin { childId: string; password: string; fails: number; locked: boolean }

export class FakeBackend implements Backend {
  session: Session | null = null;
  /** the child the current (anonymous) session is signed in as */
  private linked: string | null = null;
  children: (Child & { parentId: string })[] = [];
  settings: ParentSettings = { timeZone: "UTC", fluencyMs: 3000, familyCode: "RAND-4821" };
  logins = new Map<string, KidLogin>();          // username -> login
  /** false: anonymous sign-ins switched off in the project */
  anonymousAllowed = true;
  private listeners = new Set<(s: Session | null) => void>();
  private n = 0;
  private account: { email: string; password: string };

  constructor(account = { email: "parent@example.test", password: "correct horse" }) {
    this.account = account;
  }

  private emit() { this.listeners.forEach((cb) => cb(this.session)); }
  private parentId = "parent-1";

  async getSession() { return this.session; }
  onAuthChange(cb: (s: Session | null) => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }

  /* ---------- grown-ups ---------- */

  async signUp(email: string, password: string) {
    this.account = { email, password };
    return { needsConfirm: true };
  }

  async signIn(email: string, password: string) {
    if (email !== this.account.email || password !== this.account.password) throw new BackendError("That email and password don't match.");
    this.linked = null;
    this.session = { userId: this.parentId, email, anonymous: false };
    this.emit();
  }

  async signOut() { this.session = null; this.linked = null; this.emit(); }

  /* ---------- kids ---------- */

  private anonymous(): KidResult | null {
    if (this.session && !this.session.anonymous) return { ok: false, error: "parents_cannot_be_kids" };
    if (!this.session) {
      if (!this.anonymousAllowed) return { ok: false, error: "kid_sign_in_off" };
      this.session = { userId: "device-" + ++this.n, email: "", anonymous: true };
      this.emit();
    }
    return null;
  }

  async kidSignUp(code: string, username: string, password: string, avatar: string): Promise<KidResult> {
    const no = this.anonymous();
    if (no) return no;
    const u = normUsername(username);
    if (code.toUpperCase().replace(/[^A-Z0-9]/g, "") !== this.settings.familyCode.replace("-", "")) return { ok: false, error: "bad_family_code" };
    if (!/^[a-z0-9_]{3,20}$/.test(u)) return { ok: false, error: "bad_username" };
    if (password.length < 4) return { ok: false, error: "password_too_short" };
    if (this.logins.has(u)) return { ok: false, error: "username_taken" };
    const id = "child-" + ++this.n;
    this.children.push({ id, name: u, avatar, username: u, devices: 1, parentId: this.parentId });
    this.logins.set(u, { childId: id, password, fails: 0, locked: false });
    this.linked = id;
    return { ok: true, childId: id };
  }

  async kidSignIn(username: string, password: string): Promise<KidResult> {
    const no = this.anonymous();
    if (no) return no;
    const l = this.logins.get(normUsername(username));
    if (!l) return { ok: false, error: "wrong_username_or_password" };
    if (l.locked) return { ok: false, error: "locked" };
    if (l.password !== password) {
      if (++l.fails >= 5) { l.fails = 0; l.locked = true; }
      return { ok: false, error: "wrong_username_or_password" };
    }
    l.fails = 0;
    this.linked = l.childId;
    return { ok: true, childId: l.childId };
  }

  async kidMe(): Promise<KidMe | null> {
    const c = this.children.find((k) => k.id === this.linked);
    return c && this.session?.anonymous
      ? { childId: c.id, name: c.name, avatar: c.avatar, username: c.username ?? "", timeZone: this.settings.timeZone }
      : null;
  }

  imported: { childId: string; saved: Saved }[] = [];
  async importGuest(childId: string, saved: Saved) {
    this.imported.push({ childId, saved });
    for (const [id, n] of Object.entries(saved.caught)) {
      for (let i = 0; i < n; i++) {
        const key = "import-" + ++this.n;
        this.rows.catches.set(key, { id: key, child_id: childId, collectible_id: id, source: "import", created_at: new Date().toISOString() });
      }
    }
    this.rows.game_state.set(childId, { child_id: childId, review_pile: saved.weak });
  }

  /* ---------- a parent's kids ---------- */

  async listChildren(): Promise<Child[]> {
    return this.children.map((c) => {
      const login = [...this.logins.entries()].find(([, l]) => l.childId === c.id);
      return { id: c.id, name: c.name, avatar: c.avatar, devices: c.devices, username: login?.[0] ?? null };
    });
  }

  async createChild(name: string, avatar: string, username: string, password: string) {
    const id = "child-" + ++this.n;
    this.children.push({ id, name: name.trim(), avatar, username: null, devices: 0, parentId: this.parentId });
    try {
      await this.setKidLogin(id, username, password);
    } catch (e) {
      this.children = this.children.filter((c) => c.id !== id);
      throw e;
    }
  }

  async updateChild(id: string, patch: { name?: string; avatar?: string }) {
    const c = this.children.find((x) => x.id === id);
    if (c) Object.assign(c, patch.name !== undefined ? { name: patch.name.trim() } : {}, patch.avatar ? { avatar: patch.avatar } : {});
  }

  async deleteChild(id: string) {
    this.children = this.children.filter((c) => c.id !== id);
    for (const [u, l] of this.logins) if (l.childId === id) this.logins.delete(u);
  }

  async setKidLogin(id: string, username: string, password: string | null) {
    const u = normUsername(username);
    if (!/^[a-z0-9_]{3,20}$/.test(u)) throw new BackendError("Usernames are 3 to 20 letters, numbers or _ (no spaces).");
    const taken = this.logins.get(u);
    if (taken && taken.childId !== id) throw new BackendError("Someone already has that username. Try another one.");
    if (password !== null && password.length < 4) throw new BackendError("Passwords need at least 4 characters.");
    const old = [...this.logins.entries()].find(([, l]) => l.childId === id);
    if (!old && password === null) throw new BackendError("Passwords need at least 4 characters.");
    if (old) this.logins.delete(old[0]);
    this.logins.set(u, { childId: id, password: password ?? old![1].password, fails: 0, locked: false });
  }

  signedOutDevices: string[] = [];
  async signOutKidDevices(id: string) { this.signedOutDevices.push(id); }

  async newFamilyCode() {
    this.settings.familyCode = "NEWC-" + String(2000 + ++this.n);
    return this.settings.familyCode;
  }

  async getSettings() { return { ...this.settings }; }
  async updateSettings(patch: Partial<Pick<ParentSettings, "timeZone" | "fluencyMs">>) { Object.assign(this.settings, patch); }

  /* ---------- game data: an in-memory stand-in for the four tables ---------- */

  rows: Record<Table, Map<string, Row>> = { quest_runs: new Map(), attempts: new Map(), catches: new Map(), game_state: new Map() };
  /** When false, sends fail as if the network were down. */
  online = true;

  async loadChildState(childId: string): Promise<ServerChildState> {
    if (!this.online) throw new BackendError("Failed to fetch");
    const caught: Record<string, number> = {};
    const recentDaily: ServerChildState["recentDaily"] = [];
    for (const r of this.rows.catches.values()) {
      if (r.child_id !== childId) continue;
      const id = r.collectible_id as string;
      caught[id] = (caught[id] || 0) + 1;
      if (r.source === "mystery" || r.source === "pick") recentDaily.push({ collectibleId: id, source: r.source, createdAt: r.created_at as string });
    }
    const gs = this.rows.game_state.get(childId);
    return { reviewPile: (gs?.review_pile as Record<string, number>) ?? {}, caught, recentDaily };
  }

  sender(): Sender {
    return {
      send: async (table: Table, rows: Row[]): Promise<SendResult> => {
        if (!this.online) return { ok: false, retry: true, error: "Failed to fetch" };
        for (const r of rows) {
          const key = String(table === "game_state" ? r.child_id : r.id);
          const ignoreDup = table === "attempts" || table === "catches";
          if (ignoreDup && this.rows[table].has(key)) continue;
          this.rows[table].set(key, { ...r });
        }
        return { ok: true };
      },
    };
  }

  /* ---------- dashboard: canned answers tests can set ---------- */

  dash: { facts: FactStat[]; trend: TrendDay[]; quests: QuestStat[]; streak: number; history: HistoryRow[] } =
    { facts: [], trend: [], quests: [], streak: 0, history: [] };
  async factStats() { return this.dash.facts; }
  async dailyTrend() { return this.dash.trend; }
  async questStats() { return this.dash.quests; }
  async longestStreak() { return this.dash.streak; }
  async factHistory() { return this.dash.history; }
}
