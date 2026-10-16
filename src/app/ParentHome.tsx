// The grown-up area: family code, kids and their sign-ins, the progress dashboard, settings.

import { useState, type FormEvent } from "react";
import { AVATARS, type Backend, type Child, type ParentSettings, type SiteTotals } from "../data/backend";
import { Dashboard } from "../dashboard/Dashboard";
import { AnimalSvg, errorText } from "./common";

export function ParentHome({ backend, kids, settings, totals, onChanged, onSignOut }: {
  backend: Backend; kids: Child[]; settings: ParentSettings | null; totals?: SiteTotals | null;
  onChanged: () => Promise<void>; onSignOut: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="screen wide">
      <div className="row">
        <h1 className="grow" style={{ textAlign: "left" }}>Grown-ups</h1>
        <button type="button" className="btn quiet" onClick={onSignOut}>Sign out</button>
      </div>

      {totals && <SiteTotalsCard t={totals} />}

      {settings && <FamilyCode backend={backend} code={settings.familyCode} onChanged={onChanged} />}

      <section className="card" aria-labelledby="kids-h">
        <h2 id="kids-h">Kids</h2>
        {kids.length === 0 && <p>No kids yet. They can make their own account with your family code, or you can add one here.</p>}
        {kids.map((k) => editing === k.id
          ? <ChildEditor key={k.id} backend={backend} child={k} onDone={async () => { setEditing(null); await onChanged(); }} />
          : (
            <div key={k.id} className="child-row">
              <AnimalSvg id={k.avatar} />
              <div className="who">
                <b>{k.name}</b>
                <small>{k.username ? `Signs in as ${k.username}` : "No sign-in yet"}{k.devices ? ` · on ${k.devices} ${k.devices === 1 ? "device" : "devices"}` : ""}</small>
              </div>
              <button type="button" className="btn quiet" onClick={() => setEditing(k.id)} aria-label={"Edit " + k.name}>Edit</button>
            </div>
          ))}
        {adding
          ? <ChildForm backend={backend} onDone={async (made) => { setAdding(false); if (made) await onChanged(); }} />
          : <button type="button" className="btn quiet" onClick={() => setAdding(true)}>Add a kid</button>}
      </section>

      <section className="card" aria-labelledby="dash-h">
        <h2 id="dash-h">Progress</h2>
        <Dashboard backend={backend} kids={kids} thresholdMs={settings?.fluencyMs ?? 3000} />
      </section>

      {settings && <SettingsCard backend={backend} settings={settings} onChanged={onChanged} />}
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString();

/** Only the site admin's account ever gets totals, so only they see this card. */
function SiteTotalsCard({ t }: { t: SiteTotals }) {
  const tile = (label: string, value: number, sub?: string) => (
    <div className="tile"><div className="lbl">{label}</div><div className="val">{fmt(value)}</div>{sub && <div className="lbl">{sub}</div>}</div>
  );
  return (
    <section className="card dash" aria-labelledby="totals-h">
      <h2 id="totals-h">Site totals</h2>
      <p className="sub">Only you see this. Every family, plus kids playing without an account (counted as browsers, nothing else recorded).</p>
      <div className="tiles">
        {tile("Problems answered", t.questions + t.guestQuestions, `${fmt(t.guestQuestions)} without an account`)}
        {tile("Today", t.questionsToday)}
        {tile("Last 7 days", t.questions7d)}
      </div>
      <div className="tiles">
        {tile("Grown-up accounts", t.grownups)}
        {tile("Kids on a family", t.kids, `${fmt(t.kidAccounts)} with a sign-in`)}
        {tile("Kids active this week", t.activeKids7d)}
        {tile("Browsers without an account", t.guests)}
      </div>
    </section>
  );
}

function FamilyCode({ backend, code, onChanged }: { backend: Backend; code: string; onChanged: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  async function renew() {
    try {
      await backend.newFamilyCode();
      setConfirm(false);
      await onChanged();
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <section className="card" aria-labelledby="code-h">
      <h2 id="code-h">Family code</h2>
      <div className="family-code" aria-label={"Family code " + code}>{code}</div>
      <p>Kids type this when they make their account, and then they show up here. Only share it with your kids.</p>
      {error && <div className="error" role="alert">{error}</div>}
      {confirm ? (
        <div className="row">
          <p className="grow">Make a new code? The old one stops working for new accounts. Kids who already have accounts keep them.</p>
          <button type="button" className="btn" onClick={renew}>New code</button>
          <button type="button" className="btn quiet" onClick={() => setConfirm(false)}>Keep this one</button>
        </div>
      ) : <button type="button" className="link" style={{ alignSelf: "flex-start" }} onClick={() => setConfirm(true)}>Make a new code</button>}
    </section>
  );
}

function AvatarPicker({ value, onChange }: { value: string; onChange: (a: string) => void }) {
  return (
    <div className="avatars" role="group" aria-label="Animal">
      {AVATARS.map((a) => (
        <button key={a} type="button" aria-pressed={a === value} aria-label={a} onClick={() => onChange(a)}>
          <AnimalSvg id={a} />
        </button>
      ))}
    </div>
  );
}

const usernameInput = (value: string, set: (v: string) => void, label: string) => (
  <label className="field">{label}
    <input value={value} maxLength={20} onChange={(e) => set(e.target.value)} autoComplete="off"
           autoCapitalize="none" autoCorrect="off" spellCheck={false} />
  </label>
);

function ChildForm({ backend, onDone }: { backend: Backend; onDone: (made: boolean) => void }) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string>("fox");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Type a name.");
    setBusy(true); setError("");
    try {
      await backend.createChild(name, avatar, username, password);
      onDone(true);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ background: "var(--panel2)" }} onSubmit={submit} aria-label="New kid">
      <label className="field">Name (shown on the dashboard)
        <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </label>
      <div className="field">Animal<AvatarPicker value={avatar} onChange={setAvatar} /></div>
      {usernameInput(username, setUsername, "Username they sign in with (3 to 20 letters, numbers or _)")}
      <label className="field">Password (4 or more characters)
        <input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </label>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="row">
        <button className="btn grow" type="submit" disabled={busy}>Add kid</button>
        <button className="btn quiet" type="button" onClick={() => onDone(false)}>Cancel</button>
      </div>
    </form>
  );
}

function ChildEditor({ backend, child, onDone }: { backend: Backend; child: Child; onDone: () => Promise<void> }) {
  const [name, setName] = useState(child.name);
  const [avatar, setAvatar] = useState(child.avatar);
  const [username, setUsername] = useState(child.username ?? "");
  const [password, setPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function act(fn: () => Promise<void>, close = true) {
    setBusy(true); setError(""); setNote("");
    try {
      await fn();
      if (close) await onDone(); else setBusy(false);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Type a name.");
    act(async () => {
      await backend.updateChild(child.id, { name, avatar });
      const loginChanged = username.trim() !== (child.username ?? "") || password !== "";
      if (loginChanged && (username.trim() || password)) await backend.setKidLogin(child.id, username, password || null);
    });
  };

  return (
    <form className="card" style={{ background: "var(--panel2)" }} onSubmit={save} aria-label={"Edit " + child.name}>
      <label className="field">Name
        <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </label>
      <div className="field">Animal<AvatarPicker value={avatar} onChange={setAvatar} /></div>
      {usernameInput(username, setUsername, child.username ? "Username" : "Username (to let them sign in on any device)")}
      <label className="field">{child.username ? "New password (leave empty to keep it)" : "Password (4 or more characters)"}
        <input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      </label>
      {error && <div className="error" role="alert">{error}</div>}
      {note && <div className="ok" role="status">{note}</div>}
      <div className="row">
        <button className="btn grow" type="submit" disabled={busy}>Save</button>
        <button className="btn quiet" type="button" disabled={busy} onClick={() => onDone()}>Cancel</button>
      </div>
      <div className="row">
        {child.devices > 0 && (
          <button className="btn quiet" type="button" disabled={busy}
                  onClick={() => act(async () => { await backend.signOutKidDevices(child.id); setNote("Signed out on every device."); }, false)}>
            Sign out on all devices
          </button>
        )}
        {!confirmDelete && <button className="btn quiet" type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete kid</button>}
      </div>
      {confirmDelete && (
        <div className="card" role="alertdialog" aria-label="Confirm delete" style={{ background: "var(--deep)" }}>
          <p>Delete {child.name}, their sign-in, and all of their progress and animals? This can't be undone.</p>
          <div className="row">
            <button className="btn danger grow" type="button" disabled={busy} onClick={() => act(() => backend.deleteChild(child.id))}>Delete {child.name}</button>
            <button className="btn quiet" type="button" onClick={() => setConfirmDelete(false)}>Keep</button>
          </div>
        </div>
      )}
    </form>
  );
}

function SettingsCard({ backend, settings, onChanged }: { backend: Backend; settings: ParentSettings; onChanged: () => Promise<void> }) {
  const [seconds, setSeconds] = useState(String(settings.fluencyMs / 1000));
  const [tz, setTz] = useState(settings.timeZone);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const zones = timeZones(settings.timeZone);

  async function save(e: FormEvent) {
    e.preventDefault();
    const s = Number(seconds);
    if (!(s >= 0.5 && s <= 30)) return setMsg({ ok: false, text: "Pick a time between 0.5 and 30 seconds." });
    try {
      await backend.updateSettings({ fluencyMs: Math.round(s * 1000), timeZone: tz });
      await onChanged();
      setMsg({ ok: true, text: "Saved." });
    } catch (err) {
      setMsg({ ok: false, text: errorText(err) });
    }
  }

  return (
    <form className="card" onSubmit={save} aria-labelledby="set-h">
      <h2 id="set-h">Settings</h2>
      <label className="field">Fast enough to count as "knows it" (seconds)
        <input type="number" min={0.5} max={30} step={0.5} value={seconds} onChange={(e) => setSeconds(e.target.value)} />
      </label>
      <label className="field">Time zone (when "today" starts for the daily Mystery Box and rare pick)
        <select value={tz} onChange={(e) => setTz(e.target.value)}>
          {zones.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
      </label>
      {msg && <div className={msg.ok ? "ok" : "error"} role="status">{msg.text}</div>}
      <button className="btn" type="submit">Save settings</button>
    </form>
  );
}

function timeZones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
  } catch { /* old browser */ }
  if (!zones.includes(current)) zones = [current, ...zones];
  if (!zones.includes("UTC")) zones = [...zones, "UTC"];
  return zones;
}
