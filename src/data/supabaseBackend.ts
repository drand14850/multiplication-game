import { createClient, type SupabaseClient, type Session as SbSession } from "@supabase/supabase-js";
import type { FactStat } from "../dashboard/logic";
import type { Saved } from "../game/logic/engine";
import {
  BackendError, normUsername, type Backend, type Child, type HistoryRow, type KidError, type KidMe, type KidResult,
  type ParentSettings, type QuestStat, type ServerChildState, type Session, type SiteTotals, type TrendDay,
} from "./backend";
import type { Row, Sender, SendResult, Table } from "./writeQueue";

const toSession = (s: SbSession | null): Session | null =>
  s ? { userId: s.user.id, email: s.user.email ?? "", anonymous: !!s.user.is_anonymous } : null;

function fail(e: { message: string } | null): void {
  if (e) throw new BackendError(e.message);
}

const isNetwork = (m: string) => /fetch|network|load failed/i.test(m);

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

  /* ---------- grown-ups ---------- */

  async signUp(email: string, password: string, timeZone: string): Promise<{ needsConfirm: boolean }> {
    const { data, error } = await this.sb.auth.signUp({
      email, password,
      options: { data: { time_zone: timeZone }, emailRedirectTo: window.location.origin },
    });
    fail(error);
    return { needsConfirm: !data.session };
  }

  async signIn(email: string, password: string): Promise<void> {
    // a kid's device that a grown-up signs in on: unlink the kid first
    const { data } = await this.sb.auth.getSession();
    if (data.session?.user.is_anonymous) await this.signOut();
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new BackendError(error.message === "Invalid login credentials" ? "That email and password don't match." : error.message);
  }

  async signOut(): Promise<void> {
    const { data } = await this.sb.auth.getSession();
    if (data.session?.user.is_anonymous) await this.sb.rpc("kid_sign_out");   // unlink this device first
    fail((await this.sb.auth.signOut()).error);
  }

  /* ---------- kids ---------- */

  /** Kid sign-in runs on an anonymous session; make one if there's none. */
  private async kidSession(): Promise<KidError | null> {
    const { data } = await this.sb.auth.getSession();
    if (data.session) return data.session.user.is_anonymous ? null : "parents_cannot_be_kids";
    const { error } = await this.sb.auth.signInAnonymously();
    if (!error) return null;
    if (isNetwork(error.message)) return "offline";
    if (/anonymous/i.test(error.message)) return "kid_sign_in_off";
    throw new BackendError(error.message);
  }

  private async kidRpc(fn: string, args: Record<string, string>): Promise<KidResult> {
    const problem = await this.kidSession();
    if (problem) return { ok: false, error: problem };
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) {
      if (isNetwork(error.message)) return { ok: false, error: "offline" };
      throw new BackendError(error.message);
    }
    const r = data as { child_id?: string; error?: KidError };
    return r.child_id ? { ok: true, childId: r.child_id } : { ok: false, error: r.error ?? "not_signed_in" };
  }

  kidSignUp(familyCode: string, username: string, password: string, avatar: string): Promise<KidResult> {
    return this.kidRpc("kid_sign_up", { p_code: familyCode, p_username: normUsername(username), p_password: password, p_avatar: avatar });
  }

  kidSignIn(username: string, password: string): Promise<KidResult> {
    return this.kidRpc("kid_sign_in", { p_username: normUsername(username), p_password: password });
  }

  async kidMe(): Promise<KidMe | null> {
    const { data, error } = await this.sb.rpc("kid_me");
    fail(error);
    const r = ((data ?? []) as { child_id: string; name: string; avatar: string; username: string; time_zone: string; fluency_ms: number }[])[0];
    return r ? { childId: r.child_id, name: r.name, avatar: r.avatar, username: r.username, timeZone: r.time_zone, fluencyMs: r.fluency_ms ?? 3000 } : null;
  }

  async importGuest(childId: string, saved: Saved): Promise<void> {
    const at = new Date().toISOString();
    const catches: Row[] = [];
    for (const [id, n] of Object.entries(saved.caught)) {
      for (let i = 0; i < n; i++) catches.push({ id: crypto.randomUUID(), child_id: childId, collectible_id: id, source: "import", created_at: at });
    }
    if (catches.length) fail((await this.sb.from("catches").insert(catches)).error);
    fail((await this.sb.from("game_state").upsert({ child_id: childId, review_pile: saved.weak, updated_at: at }, { onConflict: "child_id" })).error);
  }

  /* ---------- a parent's kids ---------- */

  async listChildren(): Promise<Child[]> {
    const [kids, logins] = await Promise.all([
      this.sb.from("children").select("id, name, avatar").order("created_at"),
      this.sb.rpc("my_kid_logins"),
    ]);
    fail(kids.error); fail(logins.error);
    const by = new Map(((logins.data ?? []) as { child_id: string; username: string; devices: number }[]).map((l) => [l.child_id, l]));
    return ((kids.data ?? []) as { id: string; name: string; avatar: string }[]).map((k) => ({
      id: k.id, name: k.name, avatar: k.avatar, username: by.get(k.id)?.username ?? null, devices: by.get(k.id)?.devices ?? 0,
    }));
  }

  async createChild(name: string, avatar: string, username: string, password: string): Promise<void> {
    const { data, error } = await this.sb.from("children").insert({ name: name.trim(), avatar }).select("id").single();
    fail(error);
    const id = (data as { id: string }).id;
    try {
      await this.setKidLogin(id, username, password);
    } catch (e) {
      await this.sb.from("children").delete().eq("id", id);     // no half-made kid left behind
      throw e;
    }
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

  async setKidLogin(id: string, username: string, password: string | null): Promise<void> {
    const { error } = await this.sb.rpc("set_kid_login", { p_child: id, p_username: normUsername(username), p_password: password });
    if (!error) return;
    const words: Record<string, string> = {
      username_taken: "Someone already has that username. Try another one.",
      bad_username: "Usernames are 3 to 20 letters, numbers or _ (no spaces).",
      password_too_short: "Passwords need at least 4 characters.",
    };
    const key = Object.keys(words).find((k) => error.message.includes(k));
    throw new BackendError(key ? words[key] : error.message);
  }

  async signOutKidDevices(id: string): Promise<void> {
    fail((await this.sb.rpc("sign_out_kid_devices", { p_child: id })).error);
  }

  async newFamilyCode(): Promise<string> {
    const { data, error } = await this.sb.rpc("new_family_code");
    fail(error);
    return data as string;
  }

  async getSettings(): Promise<ParentSettings> {
    const { data, error } = await this.sb.from("parent_settings").select("time_zone, fluency_ms, family_code").single();
    fail(error);
    const r = data as { time_zone: string; fluency_ms: number; family_code: string };
    return { timeZone: r.time_zone, fluencyMs: r.fluency_ms, familyCode: r.family_code };
  }

  async updateSettings(patch: Partial<Pick<ParentSettings, "timeZone" | "fluencyMs">>): Promise<void> {
    const row: Record<string, string | number> = {};
    if (patch.timeZone !== undefined) row.time_zone = patch.timeZone;
    if (patch.fluencyMs !== undefined) row.fluency_ms = patch.fluencyMs;
    const { data } = await this.sb.auth.getSession();
    fail((await this.sb.from("parent_settings").update(row).eq("parent_id", data.session?.user.id ?? "")).error);
  }

  /* ---------- game data ---------- */

  async loadChildState(childId: string): Promise<ServerChildState> {
    const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const [gs, bp, daily, tries] = await Promise.all([
      this.sb.from("game_state").select("review_pile").eq("child_id", childId).maybeSingle(),
      this.sb.from("backpack").select("collectible_id, n").eq("child_id", childId),
      this.sb.from("catches").select("collectible_id, source, created_at").eq("child_id", childId)
        .in("source", ["mystery", "pick"]).gte("created_at", since),
      this.sb.rpc("fact_recent", { p_child: childId }),
    ]);
    fail(gs.error); fail(bp.error); fail(daily.error); fail(tries.error);
    const caught: Record<string, number> = {};
    for (const r of (bp.data ?? []) as { collectible_id: string; n: number }[]) caught[r.collectible_id] = r.n;
    return {
      reviewPile: ((gs.data as { review_pile: Record<string, number> } | null)?.review_pile) ?? {},
      caught,
      recentDaily: ((daily.data ?? []) as { collectible_id: string; source: "mystery" | "pick"; created_at: string }[])
        .map((r) => ({ collectibleId: r.collectible_id, source: r.source, createdAt: r.created_at })),
      recentTries: ((tries.data ?? []) as { a: number; b: number; correct: boolean; response_ms: number; created_at: string }[])
        .map((r) => ({ a: r.a, b: r.b, correct: r.correct, ms: r.response_ms, at: r.created_at })),
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

  /* ---------- site totals ---------- */

  async guestTick(newGuest: boolean, answers: number): Promise<boolean> {
    const { error } = await this.sb.rpc("guest_tick", { p_new_guest: newGuest, p_answers: answers });
    return !error;
  }

  async siteTotals(): Promise<SiteTotals | null> {
    const { data, error } = await this.sb.rpc("site_totals");
    if (error) return null;                        // not set up yet, or offline: just don't show it
    const r = ((data ?? []) as Record<string, number | string>[])[0];
    if (!r) return null;
    const n = (k: string) => Number(r[k] ?? 0);
    return {
      grownups: n("grownups"), kids: n("kids"), kidAccounts: n("kid_accounts"), guests: n("guests"),
      questions: n("questions"), questionsOthers: n("questions_others"), guestQuestions: n("guest_questions"), questionsToday: n("questions_today"),
      questions7d: n("questions_7d"), activeKids7d: n("active_kids_7d"),
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
}
