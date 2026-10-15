import { createClient, type SupabaseClient, type Session as SbSession } from "@supabase/supabase-js";
import { BackendError, type Backend, type Child, type ParentSettings, type PinResult, type Session } from "./backend";

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

  async updateSettings(patch: Partial<ParentSettings>): Promise<void> {
    const row: Record<string, string | number> = {};
    if (patch.timeZone !== undefined) row.time_zone = patch.timeZone;
    if (patch.fluencyMs !== undefined) row.fluency_ms = patch.fluencyMs;
    const { data } = await this.sb.auth.getSession();
    fail((await this.sb.from("parent_settings").update(row).eq("parent_id", data.session?.user.id ?? "")).error);
  }
}
