// Top-level flow. There are no URLs to type: every screen is app state, so the only way
// into the grown-up area is through the parent gate.
//
//   signed out → AuthScreen
//   signed in  → Who's playing? → (PIN) → Game
//                Who's playing? → Grown-ups → ParentGate → ParentHome

import { useCallback, useEffect, useState } from "react";
import type { Backend, Child, ParentSettings, Session } from "../data/backend";
import { LocalStore } from "../data/gameStore";
import { Game } from "../game/ui/Game";
import { AuthScreen } from "./AuthScreen";
import { errorText } from "./common";
import { ParentGate } from "./ParentGate";
import { ParentHome } from "./ParentHome";
import { PinEntry, WhoIsPlaying } from "./WhoIsPlaying";

type View =
  | { kind: "who" }
  | { kind: "pin"; child: Child }
  | { kind: "play"; child: Child }
  | { kind: "gate" }
  | { kind: "parent" };

export function App({ backend }: { backend: Backend }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [view, setView] = useState<View>({ kind: "who" });
  const [kids, setKids] = useState<Child[]>([]);
  const [settings, setSettings] = useState<ParentSettings | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);   // whose children are loaded
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let live = true;
    backend.getSession().then((s) => { if (live) setSession(s); });
    const off = backend.onAuthChange((s) => {
      setSession(s);
      if (!s) setView({ kind: "who" });
    });
    return () => { live = false; off(); };
  }, [backend]);

  const refresh = useCallback(async () => {
    try {
      const [k, st] = await Promise.all([backend.listChildren(), backend.getSettings()]);
      setKids(k);
      setSettings(st);
      setLoadError("");
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, [backend]);

  const userId = session?.userId;
  useEffect(() => {
    if (!userId) return;
    let live = true;
    Promise.all([backend.listChildren(), backend.getSettings()]).then(([k, st]) => {
      if (live) { setKids(k); setSettings(st); setLoadError(""); setLoadedFor(userId); }
    }).catch((e) => { if (live) setLoadError(errorText(e)); });
    return () => { live = false; };
  }, [backend, userId]);

  const pick = (c: Child) => setView(c.hasPin ? { kind: "pin", child: c } : { kind: "play", child: c });
  const toWho = () => setView({ kind: "who" });
  const onPinOk = useCallback(() => setView((v) => (v.kind === "pin" ? { kind: "play", child: v.child } : v)), []);

  if (session === undefined) return <div className="screen" aria-busy="true" />;

  if (!session) {
    // Signing in just proved the password, so the grown-up area opens straight away the first time.
    return <AuthScreen backend={backend} onSignedIn={() => setView({ kind: "parent" })} />;
  }

  if (loadError && view.kind !== "play" && loadedFor !== session.userId) {
    return (
      <div className="screen">
        <h1>Hmm.</h1>
        <p className="center">{loadError}</p>
        <button className="btn" type="button" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }

  if (loadedFor !== session.userId) return <div className="screen" aria-busy="true" />;

  if (loadError && view.kind !== "play") {
    return (
      <div className="screen">
        <h1>Hmm.</h1>
        <p className="center">{loadError}</p>
        <button className="btn" type="button" onClick={refresh}>Try again</button>
      </div>
    );
  }

  switch (view.kind) {
    case "who":
      return <WhoIsPlaying kids={kids} onPick={pick} onGrownUps={() => setView({ kind: "gate" })} />;
    case "pin":
      return <PinEntry key={view.child.id} backend={backend} child={view.child} onOk={onPinOk} onBack={toWho} />;
    case "play":
      return (
        <Game key={view.child.id} store={new LocalStore(view.child.id)} timeZone={settings?.timeZone}
              player={{ name: view.child.name, avatar: view.child.avatar, onSwitch: toWho }} />
      );
    case "gate":
      return <ParentGate backend={backend} onUnlock={() => setView({ kind: "parent" })} onBack={toWho} />;
    case "parent":
      // Leaving the grown-up area locks it again.
      return <ParentHome backend={backend} kids={kids} settings={settings} onChanged={refresh}
                         onDone={toWho} onSignOut={() => backend.signOut()} />;
  }
}
