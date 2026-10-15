// The grown-ups' area needs the parent's password again, so a child on the same device can't open it.

import { useState, type FormEvent } from "react";
import type { Backend } from "../data/backend";
import { errorText } from "./common";

export function ParentGate({ backend, onUnlock, onBack }: { backend: Backend; onUnlock: () => void; onBack: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      if (await backend.checkPassword(password)) onUnlock();
      else { setError("That's not the right password."); setPassword(""); }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <h1>Grown-ups only</h1>
      <p className="center">Type your account password to open the grown-up area.</p>
      <form className="card" onSubmit={submit}>
        <label className="field">Password
          <input type="password" autoComplete="current-password" required autoFocus
                 value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn" type="submit" disabled={busy}>Open</button>
      </form>
      <button type="button" className="link" onClick={onBack}>Back</button>
    </div>
  );
}
