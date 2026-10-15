// Parent sign-in and sign-up. Only parents have accounts.

import { useState, type FormEvent } from "react";
import { browserTimeZone, type Backend } from "../data/backend";
import { errorText } from "./common";

export function AuthScreen({ backend, onSignedIn }: { backend: Backend; onSignedIn: () => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "in") {
        await backend.signIn(email.trim(), password);
        onSignedIn();
      } else {
        if (password.length < 8) throw new Error("Use at least 8 characters for the password.");
        const { needsConfirm } = await backend.signUp(email.trim(), password, browserTimeZone());
        if (needsConfirm) {
          setNotice("Check your email and click the link to confirm, then sign in here.");
          setMode("in");
        } else onSignedIn();
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <h1>Times Tables</h1>
      <p className="center">{mode === "in" ? "Grown-ups: sign in to set up your kids." : "Create a grown-up account."}</p>
      <form className="card" onSubmit={submit}>
        <label className="field">Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">Password
          <input type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} required
                 value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        {notice && <div className="ok" role="status">{notice}</div>}
        <button className="btn" type="submit" disabled={busy}>{mode === "in" ? "Sign in" : "Create account"}</button>
      </form>
      <button className="link" type="button" onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(""); }}>
        {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
      </button>
    </div>
  );
}
