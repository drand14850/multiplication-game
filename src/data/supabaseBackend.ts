import { createClient, type SupabaseClient, type Session as SbSession } from "@supabase/supabase-js";
import type { FactStat } from "../dashboard/logic";
import { BackendError, type Backend, type Child, type HistoryRow, type ParentSettings, type PinResult, type QuestStat, type ServerChildState, type Session, type TrendDay } from "./backend";
import type { Row, Sender, SendResult, Table } from "./writeQueue";

interface ChildRow { id: string; name: string; avatar: string; has_pin: boolean }

const toSession = (s: SbSession | null): Session | null =>
  s ? { userId: s.user.id, email: s.user.email ?? "" } : null;
const toChild = (r: ChildRow): Child => ({ id: r.id, name: r.name, avatar: r.avatar, hasPin: r.has_pin });

function fail(e: { message: string } | null): void {
  if (e) throw new BackendError(e.message);
}

export class SupabaseBackend implements Backend {
  private sb: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  }

  async getSession(): Promise<Session | null> {
    const { data } = await this.sb.auth.getSession();
    return toSession(data.session);
  }

  onAuthChange(cb: (s: Session | null) => void): () => void {
    const { data } = this.sb.auth.onAuthStateChange((_event, s) => cb(toSession(s)));
    return () => data.subscription.unsubscribe();
  }

  async signUp(email: string, password: string, timeZone: string): Promise<{ needsConfirm: boolean }> {
    const { data, error } = await this.sb.auth.signUp({
      email, password,
      options: { data: { time_zone: timeZone }, emailRedirectTo: window.location.origin },
    });
    fail(error);
    return { needsConfirm: !data.session };
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new BackendError(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
  }

  async signOut(): Promise<void> {
    fail((await this.sb.auth.signOut()).error);
  }

  async checkPassword(password: string): Promise<boolean> {
    const { data } = await this.sb.auth.getSession();
    const email = data.session?.user.email;
    if (!email) return false;
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    return !error;
  }

  async listChildren(): Promise<Child[]> {
    const { data, error } = await this.sb.from("children").select("id, name, avatar, has_pin").order("created_at");
    fail(error);
    return (data as ChildRow[]).map(toChild);
  }

  async createChild(name: string, avatar: string, pin: string | null): Promise<Child> {
    const { data, error } = await this.sb.from("children").insert({ name: name.trim(), avatar }).select("id, name, avatar, has_pin").single();
    fail(error);
    const child = toChild(data as ChildRow);
    if (pin) {
      await this.setPin(child.id, pin);
      child.hasPin = true;
    }
    return child;
  }

  async updateChild(id: string, patch: { name?: string; avatar?: string }): Promise<void> {
    const row: Record<string, string> = {};
    if (patch.name !== undefined) row.name = patch.name.trim();
    if (patch.avatar !== undefined) row.avatar = patch.avatar;
    fail((await this.sb.from("children").update(row).eq("id", id)).error);
  }

  async deleteChild(id: string): Promise<void> {
    fail((await this.sb.from("children").delete().eq("id", id)).error);
  }

  async setPin(id: string, pin: string | null): Promise<void> {
    fail((await this.sb.rpc("set_child_pin", { p_child: id, p_pin: pin })).error);
  }

  async verifyPin(id: string, pin: string): Promise<PinResult> {
    const { data, error } = await this.sb.rpc("verify_child_pin", { p_child: id, p_pin: pin });
    if (error) {
      if (error.message.includes("pin_locked")) return "locked";
      throw new BackendError(error.message);
    }
    return data ? "ok" : "wrong";
  }

  async getSettings(): Promise<ParentSettings> {
    const { data, error } = await this.sb.from("parent_settings").select("time_zone, fluency_ms").single();
    fail(error);
    const r = data as { time_zone: string; fluency_ms: number };
    return { timeZone: r.time_zone, fluencyMs: r.fluency_ms };
  }

  async loadChildState(childId: string): Promise<ServerChildState> {
    const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const [gs, bp, daily] = await Promise.all([
      this.sb.from("game_state").select("review_pile").eq("child_id", childId).maybeSingle(),
      this.sb.from("backpack").select("collectible_id, n").eq("child_id", childId),
      this.sb.from("catches").select("collectible_id, source, created_at").eq("child_id", childId)
        .in("source", ["mystery", "pick"]).gte("created_at", since),
    ]);
    fail(gs.error); fail(bp.error); fail(daily.error);
    const caught: Record<string, number> = {};
    for (const r of (bp.data ?? []) as { collectible_id: string; n: number }[]) caught[r.collectible_id] = r.n;
    return {
      reviewPile: ((gs.data as { review_pile: Record<string, number> } | null)?.review_pile) ?? {},
      caught,
      recentDaily: ((daily.data ?? []) as { collectible_id: string; source: "mystery" | "pick"; created_at: string }[])
        .map((r) => ({ collectibleId: r.collectible_id, source: r.source, createdAt: r.created_at })),
    };
  }

  sender(): Sender {
    return {
      send: async (table: Table, rows: Row[]): Promise<SendResult> => {
        const res = table === "attempts" || table === "catches"
          ? await this.sb.from(table).upsert(rows, { onConflict: "id", ignoreDuplicates: true })
          : await this.sb.from(table).upsert(rows, { onConflict: table === "game_state" ? "child_id" : "id" });
        if (!res.error) return { ok: true };
        // network trouble, server trouble, expired session or rate limit: try again later.
        // Anything else (a once-a-day rule, a deleted child, bad data) will never succeed.
        const retry = !res.status || res.status >= 500 || res.status === 401 || res.status === 408 || res.status === 429;
        return { ok: false, retry, error: res.error.message };
      },
    };
  }

  /* ---------- dashboard ---------- */

  async factStats(childId: string, merge: boolean): Promise<FactStat[]> {
    const { data, error } = await this.sb.rpc("fact_stats", { p_child: childId, p_merge: merge });
    fail(error);
    return ((data ?? []) as { a: number; b: number; total: number; recent: number; recent_correct: number;
      median_correct_ms: number | null; median_all_ms: number | null; last_seen: string }[]).map((r) => ({
      a: r.a, b: r.b, total: r.total, recent: r.recent, recentCorrect: r.recent_correct,
      medianCorrectMs: r.median_correct_ms, medianAllMs: r.median_all_ms, lastSeen: r.last_seen,
    }));
  }

  async dailyTrend(childId: string, days: number): Promise<TrendDay[]> {
    const { data, error } = await this.sb.rpc("daily_trend", { p_child: childId, p_days: days });
    fail(error);
    return ((data ?? []) as { day: string; problems: number; correct: number; median_ms: number | null; sessions: number; minutes: number | string }[])
      .map((r) => ({ day: String(r.day).slice(0, 10), problems: r.problems, correct: r.correct, medianMs: r.median_ms, sessions: r.sessions, minutes: Number(r.minutes) }));
  }

  async questStats(childId: string): Promise<QuestStat[]> {
    const { data, error } = await this.sb.rpc("quest_stats", { p_child: childId });
    fail(error);
    return ((data ?? []) as { quest_id: string; runs: number; wins: number; best: number }[])
      .map((r) => ({ questId: r.quest_id, runs: r.runs, wins: r.wins, best: r.best }));
  }

  async longestStreak(childId: string): Promise<number> {
    const { data, error } = await this.sb.rpc("longest_streak", { p_child: childId });
    fail(error);
    return Number(data ?? 0);
  }

  async factHistory(childId: string, a: number, b: number, merge: boolean): Promise<HistoryRow[]> {
    let q = this.sb.from("attempts").select("a, b, given_answer, correct, response_ms, mode, created_at").eq("child_id", childId);
    q = merge && a !== b ? q.or(`and(a.eq.${a},b.eq.${b}),and(a.eq.${b},b.eq.${a})`) : q.eq("a", a).eq("b", b);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(30);
    fail(error);
    return ((data ?? []) as { a: number; b: number; given_answer: number; correct: boolean; response_ms: number; mode: string; created_at: string }[])
      .map((r) => ({ a: r.a, b: r.b, given: r.given_answer, correct: r.correct, ms: r.response_ms, mode: r.mode, at: r.created_at }));
  }

  async updateSettings(patch: Partial<ParentSettings>): Promise<void> {
    const row: Record<string, string | number> = {};
    if (patch.timeZone !== undefined) row.time_zone = patch.timeZone;
    if (patch.fluencyMs !== undefined) row.fluency_ms = patch.fluencyMs;
    const { data } = await this.sb.auth.getSession();
    fail((await this.sb.from("parent_settings").update(row).eq("parent_id", data.session?.user.id ?? "")).error);
  }
}
