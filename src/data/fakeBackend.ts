// In-memory Backend for UI tests. Mirrors the server rules that matter to the UI
// (password check, PIN lockout after 5 wrong tries). Never imported by the app.

import type { FactStat } from "../dashboard/logic";
import { BackendError, type Backend, type Child, type HistoryRow, type ParentSettings, type PinResult, type QuestStat, type ServerChildState, type Session, type TrendDay } from "./backend";
import type { Row, Sender, SendResult, Table } from "./writeQueue";

export class FakeBackend implements Backend {
  session: Session | null = null;
  children: Child[] = [];
  settings: ParentSettings = { timeZone: "UTC", fluencyMs: 3000 };
  private pins = new Map<string, { pin: string; fails: number; locked: boolean }>();
  private listeners = new Set<(s: Session | null) => void>();
  private n = 0;

  constructor(private account = { email: "parent@example.test", password: "correct horse" }) {}

  private emit() { this.listeners.forEach((cb) => cb(this.session)); }

  async getSession() { return this.session; }
  onAuthChange(cb: (s: Session | null) => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }

  async signUp(email: string, password: string, timeZone: string) {
    this.account = { email, password };
    this.settings.timeZone = timeZone;
    return { needsConfirm: true };
  }

  async signIn(email: string, password: string) {
    if (email !== this.account.email || password !== this.account.password) throw new BackendError("That email and password don't match.");
    this.session = { userId: "parent-1", email };
    this.emit();
  }

  async signOut() { this.session = null; this.emit(); }
  async checkPassword(password: string) { return !!this.session && password === this.account.password; }

  async listChildren() { return this.children.map((c) => ({ ...c })); }

  async createChild(name: string, avatar: string, pin: string | null) {
    const c: Child = { id: "child-" + ++this.n, name: name.trim(), avatar, hasPin: false };
    this.children.push(c);
    if (pin) await this.setPin(c.id, pin);
    return { ...c, hasPin: !!pin };
  }

  async updateChild(id: string, patch: { name?: string; avatar?: string }) {
    const c = this.children.find((x) => x.id === id);
    if (c) Object.assign(c, patch.name !== undefined ? { name: patch.name.trim() } : {}, patch.avatar ? { avatar: patch.avatar } : {});
  }

  async deleteChild(id: string) { this.children = this.children.filter((c) => c.id !== id); this.pins.delete(id); }

  async setPin(id: string, pin: string | null) {
    const c = this.children.find((x) => x.id === id);
    if (!c) throw new BackendError("not_found");
    if (pin === null) { this.pins.delete(id); c.hasPin = false; return; }
    if (!/^[0-9]{4}$/.test(pin)) throw new BackendError("pin_must_be_4_digits");
    this.pins.set(id, { pin, fails: 0, locked: false });
    c.hasPin = true;
  }

  async verifyPin(id: string, pin: string): Promise<PinResult> {
    const p = this.pins.get(id);
    if (!p) return "ok";
    if (p.locked) return "locked";
    if (p.pin === pin) { p.fails = 0; return "ok"; }
    if (++p.fails >= 5) { p.fails = 0; p.locked = true; }
    return "wrong";
  }

  async getSettings() { return { ...this.settings }; }
  async updateSettings(patch: Partial<ParentSettings>) { Object.assign(this.settings, patch); }

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
