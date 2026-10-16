// Top-level flow: which screen depends on who this browser is signed in as.
//
//   nobody (or a device not linked to a kid) → Landing: Play / Sign in / Make my account / Grown-ups
//       Play            → the game, saved in this browser only (nothing goes to the server)
//       Sign in         → kid username + password → their game
//       Make my account → family code + username + password (+ this browser's progress) → their game
//   a kid's device      → their game; tapping their animal → Keep playing / Sign out
//   a grown-up          → family code, kids, dashboard, settings

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Backend, Child, KidMe, ParentSettings, Session } from "../data/backend";
import { LocalStore } from "../data/gameStore";
import { WriteQueue } from "../data/writeQueue";
import { caughtCount } from "../game/logic/collectibles";
import type { Saved } from "../game/logic/engine";
import { Game } from "../game/ui/Game";
import { AuthScreen } from "./AuthScreen";
import { ChildGame } from "./ChildGame";
import { errorText } from "./common";
import { KidMenu, KidSignIn, KidSignUp, Landing } from "./Landing";
import { ParentHome } from "./ParentHome";

type Front = "home" | "guest" | "kidSignIn" | "kidSignUp" | "grownups";

const GUEST = "guest";
function guestSaved(): Saved {
  const s = new LocalStore(GUEST).load();
  return { weak: s?.weak ?? {}, caught: s?.caught ?? {}, rarePickDay: s?.rarePickDay ?? "", mysteryDay: s?.mysteryDay ?? "" };
}
function clearGuest(): void {
  try { localStorage.removeItem("times-tables-state:" + GUEST); } catch { /* storage blocked */ }
}

export function App({ backend }: { backend: Backend }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [front, setFront] = useState<Front>("home");
  const [kid, setKid] = useState<KidMe | null | undefined>(undefined);
  const [kidMenu, setKidMenu] = useState(false);
  const [kids, setKids] = useState<Child[]>([]);
  const [settings, setSettings] = useState<ParentSettings | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let live = true;
    backend.getSession().then((s) => { if (live) setSession(s); });
    const off = backend.onAuthChange((s) => setSession(s));
    return () => { live = false; off(); };
  }, [backend]);

  const userId = session?.userId;
  const isKidDevice = !!session?.anonymous;

  // One write queue per signed-in session. It also sends anything left over from last time.
  const queue = useMemo(() => (userId ? new WriteQueue({ sender: backend.sender(), owner: userId }) : null), [backend, userId]);
  useEffect(() => {
    if (!queue) return;
    queue.start();
    return () => queue.stop();
  }, [queue]);

  // a kid's device: who is it signed in as?
  const refreshKid = useCallback(async () => {
    try { setKid(await backend.kidMe()); } catch { setKid(null); }
    setKidMenu(false);
  }, [backend]);
  useEffect(() => {
    if (!userId || !isKidDevice) return;
    let live = true;
    backend.kidMe().then((k) => { if (live) setKid(k); }).catch(() => { if (live) setKid(null); });
    return () => { live = false; };
  }, [backend, userId, isKidDevice]);

  // a grown-up: their kids and settings
  const refresh = useCallback(async () => {
    try {
      const [k, st] = await Promise.all([backend.listChildren(), backend.getSettings()]);
      setKids(k); setSettings(st); setLoadError("");
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, [backend]);
  useEffect(() => {
    if (!userId || isKidDevice) return;
    let live = true;
    Promise.all([backend.listChildren(), backend.getSettings()]).then(([k, st]) => {
      if (live) { setKids(k); setSettings(st); setLoadError(""); setLoadedFor(userId); }
    }).catch((e) => { if (live) setLoadError(errorText(e)); });
    return () => { live = false; };
  }, [backend, userId, isKidDevice]);

  const signOut = async () => {
    if (queue) await Promise.race([queue.flush(), new Promise((r) => setTimeout(r, 3000))]);   // send what's left first
    await backend.signOut();
    setKid(undefined); setFront("home"); setLoadedFor(null);
  };

  if (session === undefined) return <div className="screen" aria-busy="true" />;

  /* ---------- a grown-up ---------- */
  if (session && !session.anonymous) {
    if (loadError && loadedFor !== session.userId) {
      return (
        <div className="screen">
          <h1>Hmm.</h1>
          <p className="center">{loadError}</p>
          <button className="btn" type="button" onClick={() => window.location.reload()}>Try again</button>
        </div>
      );
    }
    if (loadedFor !== session.userId) return <div className="screen" aria-busy="true" />;
    return <ParentHome backend={backend} kids={kids} settings={settings} onChanged={refresh} onSignOut={signOut} />;
  }

  /* ---------- a kid's device ---------- */
  // Opening the site on a kid's device: check who it's signed in as before showing the front page.
  // (Not on the sign-in forms: a failed try also starts a device session, and the form must stay put.)
  if (session?.anonymous && kid === undefined && front === "home") return <div className="screen" aria-busy="true" />;
  if (session?.anonymous && kid && queue) {
    if (kidMenu) return <KidMenu name={kid.name} avatar={kid.avatar} onPlay={() => setKidMenu(false)} onSignOut={signOut} />;
    return (
      <ChildGame key={kid.childId} backend={backend} queue={queue} child={{ id: kid.childId, name: kid.name, avatar: kid.avatar }}
                 timeZone={kid.timeZone} onSwitch={() => setKidMenu(true)} />
    );
  }

  /* ---------- nobody yet ---------- */
  const guestAnimals = caughtCount(guestSaved().caught);
  const home = () => setFront("home");
  switch (front) {
    case "guest":
      return <Game key="guest" store={new LocalStore(GUEST)} player={{ name: "Playing without an account", avatar: "fox", onSwitch: home }} />;
    case "kidSignIn":
      return <KidSignIn backend={backend} onDone={refreshKid} onBack={home} />;
    case "kidSignUp":
      return (
        <KidSignUp backend={backend} guestAnimals={guestAnimals} onBack={home} onDone={async (childId) => {
          const g = guestSaved();
          if (caughtCount(g.caught) > 0 || Object.keys(g.weak).length) {
            try { await backend.importGuest(childId, g); clearGuest(); } catch { /* keep it on this device; try again next time */ }
          }
          await refreshKid();
        }} />
      );
    case "grownups":
      return <AuthScreen backend={backend} onSignedIn={() => undefined} onBack={home} />;
    default:
      return <Landing guestAnimals={guestAnimals} onPlay={() => setFront("guest")} onKidSignIn={() => setFront("kidSignIn")}
                      onKidSignUp={() => setFront("kidSignUp")} onGrownUps={() => setFront("grownups")} />;
  }
}
