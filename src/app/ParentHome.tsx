// The grown-up area (behind the parent gate): children, PINs, settings.
// The dashboard views arrive in Phase 4.

import { useState, type FormEvent } from "react";
import { AVATARS, type Backend, type Child, type ParentSettings } from "../data/backend";
import { AnimalSvg, errorText } from "./common";

const PIN_RE = /^[0-9]{4}$/;

export function ParentHome({ backend, kids, settings, onChanged, onDone, onSignOut }: {
  backend: Backend; kids: Child[]; settings: ParentSettings | null;
  onChanged: () => Promise<void>; onDone: () => void; onSignOut: () => void;
}) {
  const [adding, setAdding] = useState(kids.length === 0);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="screen">
      <h1>Grown-ups</h1>

      <section className="card" aria-labelledby="kids-h">
        <h2 id="kids-h">Children</h2>
        {kids.length === 0 && <p>Add a child to get started.</p>}
        {kids.map((k) => editing === k.id
          ? <ChildEditor key={k.id} backend={backend} child={k} onDone={async () => { setEditing(null); await onChanged(); }} />
          : (
            <div key={k.id} className="child-row">
              <AnimalSvg id={k.avatar} />
              <div className="who"><b>{k.name}</b><small>{k.hasPin ? "Has a PIN" : "No PIN"}</small></div>
              <button type="button" className="btn quiet" onClick={() => setEditing(k.id)} aria-label={"Edit " + k.name}>Edit</button>
            </div>
          ))}
        {adding
          ? <ChildForm backend={backend} onDone={async (made) => { setAdding(false); if (made) await onChanged(); }} canCancel={kids.length > 0} />
          : <button type="button" className="btn quiet" onClick={() => setAdding(true)}>Add a child</button>}
      </section>

      <section className="card" aria-labelledby="dash-h">
        <h2 id="dash-h">Progress</h2>
        <p>The progress dashboard is coming soon. Every answer is already being saved for it.</p>
      </section>

      {settings && <SettingsCard backend={backend} settings={settings} onChanged={onChanged} />}

      <div className="row">
        <button type="button" className="btn grow" onClick={onDone}>Done</button>
        <button type="button" className="btn quiet" onClick={onSignOut}>Sign out</button>
      </div>
    </div>
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

function ChildForm({ backend, onDone, canCancel }: { backend: Backend; onDone: (made: boolean) => void; canCancel: boolean }) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string>("fox");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Type a name.");
    if (pin && !PIN_RE.test(pin)) return setError("A PIN is 4 numbers, or leave it empty.");
    setBusy(true); setError("");
    try {
      await backend.createChild(name, avatar, pin || null);
      onDone(true);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form className="card" style={{ background: "var(--panel2)" }} onSubmit={submit} aria-label="New child">
      <label className="field">Name
        <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </label>
      <div className="field">Animal<AvatarPicker value={avatar} onChange={setAvatar} /></div>
      <label className="field">PIN (optional, 4 numbers)
        <input value={pin} inputMode="numeric" maxLength={4} autoComplete="off" onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
      </label>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="row">
        <button className="btn grow" type="submit" disabled={busy}>Add child</button>
        {canCancel && <button className="btn quiet" type="button" onClick={() => onDone(false)}>Cancel</button>}
      </div>
    </form>
  );
}

function ChildEditor({ backend, child, onDone }: { backend: Backend; child: Child; onDone: () => Promise<void> }) {
  const [name, setName] = useState(child.name);
  const [avatar, setAvatar] = useState(child.avatar);
  const [pin, setPin] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); await onDone(); } catch (err) { setError(errorText(err)); setBusy(false); }
  }

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Type a name.");
    if (pin && !PIN_RE.test(pin)) return setError("A PIN is 4 numbers.");
    act(async () => {
      await backend.updateChild(child.id, { name, avatar });
      if (pin) await backend.setPin(child.id, pin);
    });
  };

  return (
    <form className="card" style={{ background: "var(--panel2)" }} onSubmit={save} aria-label={"Edit " + child.name}>
      <label className="field">Name
        <input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      </label>
      <div className="field">Animal<AvatarPicker value={avatar} onChange={setAvatar} /></div>
      <label className="field">{child.hasPin ? "New PIN (leave empty to keep the old one)" : "PIN (optional, 4 numbers)"}
        <input value={pin} inputMode="numeric" maxLength={4} autoComplete="off" onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
      </label>
      {error && <div className="error" role="alert">{error}</div>}
      <div className="row">
        <button className="btn grow" type="submit" disabled={busy}>Save</button>
        <button className="btn quiet" type="button" disabled={busy} onClick={() => onDone()}>Cancel</button>
      </div>
      <div className="row">
        {child.hasPin && <button className="btn quiet" type="button" disabled={busy} onClick={() => act(() => backend.setPin(child.id, null))}>Remove PIN</button>}
        {!confirmDelete && <button className="btn quiet" type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete child</button>}
      </div>
      {confirmDelete && (
        <div className="card" role="alertdialog" aria-label="Confirm delete" style={{ background: "var(--deep)" }}>
          <p>Delete {child.name} and all of {child.name}'s progress and animals? This can't be undone.</p>
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
