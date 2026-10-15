// Kid mode: "Who's playing?" and the child's PIN. Big targets, short words.

import { useEffect, useState } from "react";
import type { Backend, Child } from "../data/backend";
import { AnimalSvg } from "./common";

export function WhoIsPlaying({ kids, onPick, onGrownUps }: {
  kids: Child[]; onPick: (c: Child) => void; onGrownUps: () => void;
}) {
  return (
    <div className="screen">
      <h1>Who's playing?</h1>
      {kids.length === 0 && <p className="center">No players yet. A grown-up can add you.</p>}
      <div className="kids">
        {kids.map((k) => (
          <button key={k.id} type="button" className="kid" onClick={() => onPick(k)}>
            <AnimalSvg id={k.avatar} />
            <span className="nm">{k.name}</span>
          </button>
        ))}
      </div>
      <div className="spacer" />
      <button type="button" className="btn quiet grownup-btn" onClick={onGrownUps}>Grown-ups</button>
    </div>
  );
}

export function PinEntry({ backend, child, onOk, onBack }: {
  backend: Backend; child: Child; onOk: () => void; onBack: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function check(pin: string) {
    setBusy(true);
    try {
      const r = await backend.verifyPin(child.id, pin);
      if (r === "ok") { onOk(); return; }
      setNote(r === "locked" ? "Too many tries. Wait a minute." : "Not quite. Try again.");
    } catch {
      setNote("Can't check right now. Try again.");
    }
    setTyped("");
    setBusy(false);
  }

  const press = (d: string) => {
    if (busy || typed.length >= 4) return;
    const next = typed + d;
    setNote("");
    setTyped(next);
    if (next.length === 4) check(next);
  };
  const erase = () => { if (!busy) setTyped((t) => t.slice(0, -1)); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9" && e.key.length === 1) press(e.key);
      else if (e.key === "Backspace") erase();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <div className="screen">
      <div className="pin-head">
        <AnimalSvg id={child.avatar} />
        <h1>Hi {child.name}!</h1>
        <p>Type your secret code.</p>
      </div>
      <div className="dots" aria-label={typed.length + " of 4 typed"}>
        {[0, 1, 2, 3].map((i) => <i key={i} className={i < typed.length ? "on" : ""} />)}
      </div>
      <div className="pin-note" role="status">{note}</div>
      <div className="pad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className="key" onClick={() => press(d)}>{d}</button>
        ))}
        <button type="button" className="key util" onClick={erase} aria-label="Delete">⌫</button>
        <button type="button" className="key" onClick={() => press("0")}>0</button>
        <button type="button" className="key util" onClick={onBack}>Back</button>
      </div>
    </div>
  );
}
