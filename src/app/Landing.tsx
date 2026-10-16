// The front door. Kids: play right away, sign in, or make an account with a family code.
// Grown-ups: a small link to their own sign-in. Short words, big buttons.

import { useState, type FormEvent } from "react";
import { AVATARS, KID_ERROR_TEXT, type Backend } from "../data/backend";
import { AnimalSvg, errorText } from "./common";

export function Landing({ guestAnimals, onPlay, onKidSignIn, onKidSignUp, onGrownUps }: {
  guestAnimals: number; onPlay: () => void; onKidSignIn: () => void; onKidSignUp: () => void; onGrownUps: () => void;
}) {
  return (
    <div className="screen">
      <h1>Times Tables</h1>
      <div className="landing-art"><AnimalSvg id="fox" /><AnimalSvg id="owl" /><AnimalSvg id="panda" /></div>
      <button type="button" className="btn big" onClick={onPlay}>Play</button>
      <p className="center small">
        {guestAnimals > 0
          ? `Your ${guestAnimals} ${guestAnimals === 1 ? "animal is" : "animals are"} saved on this computer.`
          : "Your animals stay on this computer."}
        {" "}We only count how many problems get solved. Nothing about you is saved.
      </p>
      <div className="row">
        <button type="button" className="btn quiet grow" onClick={onKidSignIn}>Sign in</button>
        <button type="button" className="btn quiet grow" onClick={onKidSignUp}>Make my account</button>
      </div>
      <p className="center small">With an account, your animals come with you to any computer.</p>
      <div className="spacer" />
      <button type="button" className="link" onClick={onGrownUps}>Grown-ups</button>
    </div>
  );
}

export function KidSignIn({ backend, onDone, onBack }: { backend: Backend; onDone: () => void; onBack: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await backend.kidSignIn(username, password);
      if (r.ok) { onDone(); return; }
      setError(KID_ERROR_TEXT[r.error]);
      if (r.error === "wrong_username_or_password") setPassword("");
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  return (
    <div className="screen">
      <h1>Sign in</h1>
      <form className="card" onSubmit={submit} aria-label="Sign in">
        <label className="field">Your name
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username"
                 autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
        </label>
        <label className="field">Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn big" type="submit" disabled={busy}>Let's go</button>
      </form>
      <button type="button" className="link" onClick={onBack}>Back</button>
    </div>
  );
}

export function KidSignUp({ backend, guestAnimals, onDone, onBack }: {
  backend: Backend; guestAnimals: number; onDone: (childId: string) => Promise<void>; onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState("fox");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await backend.kidSignUp(code, username, password, avatar);
      if (r.ok) { await onDone(r.childId); return; }
      setError(KID_ERROR_TEXT[r.error]);
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  return (
    <div className="screen">
      <h1>Make my account</h1>
      {guestAnimals > 0 && <p className="center">Your {guestAnimals} {guestAnimals === 1 ? "animal comes" : "animals come"} with you.</p>}
      <form className="card" onSubmit={submit} aria-label="Make my account">
        <label className="field">Family code (ask a grown-up)
          <input value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" autoCorrect="off"
                 spellCheck={false} autoComplete="off" placeholder="ABCD-2345" required />
        </label>
        <label className="field">Pick a name (letters and numbers)
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username"
                 autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={20} required />
        </label>
        <label className="field">Pick a password (4 or more)
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </label>
        <div className="field">Pick your animal
          <div className="avatars" role="group" aria-label="Animal">
            {AVATARS.map((a) => (
              <button key={a} type="button" aria-pressed={a === avatar} aria-label={a} onClick={() => setAvatar(a)}>
                <AnimalSvg id={a} />
              </button>
            ))}
          </div>
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="btn big" type="submit" disabled={busy}>Make my account</button>
      </form>
      <p className="center small">No family code? Go back and tap Play. Your animals stay on this computer, and nothing about you is saved.</p>
      <button type="button" className="link" onClick={onBack}>Back</button>
    </div>
  );
}

/** What a signed-in kid sees when they tap their animal in the game. */
export function KidMenu({ name, avatar, onPlay, onSignOut }: { name: string; avatar: string; onPlay: () => void; onSignOut: () => void }) {
  return (
    <div className="screen">
      <div className="pin-head">
        <AnimalSvg id={avatar} />
        <h1>Hi {name}!</h1>
      </div>
      <button type="button" className="btn big" onClick={onPlay}>Keep playing</button>
      <div className="spacer" />
      <button type="button" className="btn quiet" onClick={onSignOut}>Sign out</button>
      <p className="center small">Sign out when you're done on a computer you share.</p>
    </div>
  );
}
