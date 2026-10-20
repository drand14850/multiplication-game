// Game screen pieces. Markup, ids and class names mirror reference/times-tables.html
// so game.css (copied verbatim) applies unchanged.

import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { EMBLEMS } from "../art/emblems";
import { animalSvg, isRare } from "../logic/animalBag";
import { BY_ID, COLLECTIBLES } from "../logic/collectibles";
import type { EngineState } from "../logic/engine";
import { pickOptions } from "../logic/rewards";

const qc = (color: string) => ({ "--qc": color }) as CSSProperties;

function Svg({ inner, className }: { inner: string; className?: string }) {
  return <svg viewBox="0 0 200 200" className={className} dangerouslySetInnerHTML={{ __html: inner }} />;
}

/* ---- the animal behind everything ---- */

export function Background({ s }: { s: EngineState }) {
  const bg = s.background;
  const rare = bg.kind === "animal" && isRare(bg.index);
  const inner = bg.kind === "animal" ? animalSvg(bg.index) : EMBLEMS[bg.questId];
  return (
    <div id="bg" aria-hidden="true" className={rare ? "rare" : ""}>
      <FadeInSvg key={bg.v} inner={inner} />
    </div>
  );
}

/** New art starts at .enter (opacity 0) and fades in two frames later, like setBackground(). */
function FadeInSvg({ inner }: { inner: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => ref.current?.classList.remove("enter"));
    });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, []);
  return <svg ref={ref} className="enter" viewBox="0 0 200 200" dangerouslySetInnerHTML={{ __html: inner }} />;
}

/* ---- score strip ---- */

const BAG_ICON =
  '<path d="M8 7.5V6.5a4 4 0 0 1 8 0v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
  '<rect x="3" y="7" width="18" height="14" rx="4.5" fill="currentColor"/>' +
  '<path d="M3.6 14h16.8" stroke="var(--panel)" stroke-width="2"/>' +
  '<rect x="9.6" y="15.4" width="4.8" height="4" rx="1.3" fill="var(--panel)"/>';

/** Who's playing, and the way back to "Who's playing?" (app only; not in the reference). */
export interface Player { name: string; avatar: string; onSwitch: () => void }

export function Strip({ s, onQuests, onBag, bagRef, player }: {
  s: EngineState; onQuests: () => void; onBag: () => void; bagRef: React.Ref<HTMLButtonElement>; player?: Player;
}) {
  return (
    <div className="strip">
      {player && (
        <button className="chip-btn player-btn" aria-label={"Switch player (now " + player.name + ")"} onClick={player.onSwitch}>
          <svg viewBox="0 0 200 200" aria-hidden="true" dangerouslySetInnerHTML={{ __html: BY_ID.get(player.avatar)?.svg ?? "" }} />
        </button>
      )}
      <span><b id="score">{s.scoreShown}</b> right</span>
      <span id="streakWrap" className={s.streakShown < 3 ? "hidden" : ""}>· <b id="streak">{s.streakShown}</b> in a row</span>
      <span className="spacer"></span>
      <button className={"chip-btn" + (s.quest ? " hidden" : "")} id="questsBtn" onClick={onQuests}>
        {s.panel === "quests" ? "Done" : "Quests"}
      </button>
      <button className="bag" id="bagBtn" aria-label="Open backpack" onClick={onBag} ref={bagRef}>
        <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: BAG_ICON }} />
        <span id="bagCount">{s.bagShown + "/" + COLLECTIBLES.length}</span>
      </button>
    </div>
  );
}

/* ---- quests ---- */

export function QuestBar({ s, onQuit }: { s: EngineState; onQuit: () => void }) {
  const q = s.quest;
  if (!q) return <div className="questbar hidden" id="questbar"></div>;
  const len = q.def.len;
  const quitHidden = s.phase === "reward" || s.phase === "flying";
  return (
    <div className="questbar" id="questbar" style={qc(q.def.color)}>
      <div className="qb-top">
        <span id="qbIcon"><svg viewBox="0 0 200 200" aria-hidden="true" dangerouslySetInnerHTML={{ __html: EMBLEMS[q.def.id] }} /></span>
        <span id="qbName">{q.def.name}</span>
        <span className="qb-count" id="qbCount">{q.done + "/" + len}</span>
        <span className="spacer"></span>
        <button className={"chip-btn" + (quitHidden ? " hidden" : "")} id="qbQuit" onClick={onQuit}>Quit</button>
      </div>
      <div className="track" id="track">
        {Array.from({ length: len }, (_, j) => (
          <i key={j} className={j === q.missAt ? "miss" : j < q.done ? "on" : ""} />
        ))}
      </div>
    </div>
  );
}

export function RewardView({ s, onClaim }: { s: EngineState; onClaim: (id: string) => void }) {
  const r = s.reward;
  if (!r) {
    return (
      <div className="reward hidden" id="reward">
        <h2 id="rewardTitle"></h2><p id="rewardSub"></p><div id="rewardBody" style={{ width: "100%" }}></div>
      </div>
    );
  }
  let body;
  if (r.kind === "prize") {
    const c = BY_ID.get(r.prizeId)!;
    body = (
      <>
        <div className="prize">
          <Svg inner={c.svg} />
          <div className="pn">{c.name}</div>
        </div>
        <button type="button" className="key go claim" onClick={() => onClaim(c.id)}>Put it in my backpack</button>
      </>
    );
  } else {
    body = (
      <div className="pickgrid">
        {pickOptions(s.caught, r.rareUsed, s.classicRares).map((o) => (
          <button key={o.collectible.id} type="button" data-pick={o.collectible.id}
                  className={o.rare ? "rare" : undefined} disabled={o.disabled}
                  onClick={() => { if (!o.disabled) onClaim(o.collectible.id); }}>
            <Svg inner={o.collectible.svg} />
            <div className="nm">{o.collectible.label}</div>
            {o.status === "wait" ? <div className="st wait">tomorrow</div>
              : o.status === "have" ? <div className="st">have ×{o.have}</div>
              : <div className="st new">new!</div>}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="reward" id="reward">
      <h2 id="rewardTitle">{r.title}</h2>
      <p id="rewardSub">{r.sub}</p>
      <div id="rewardBody" style={{ width: "100%" }}>{body}</div>
    </div>
  );
}

/* ---- the equation ---- */

export function Stage({ s }: { s: EngineState }) {
  const hidden = s.phase === "correcting" || !!s.reward;
  const rare = s.background.kind === "animal" && isRare(s.background.index);
  const entryCls = "entry" + (s.entry === "right" ? " right" : s.entry === "wrong" ? " wrong" : s.typed === "" ? " empty" : "");
  return (
    <div className={"stage" + (hidden ? " hidden" : "")} id="stage">
      <div className={"rarity" + (rare ? "" : " hidden")} id="rarity">★ rare animal</div>
      <div className="eq" id="eq">{s.current.a} <span className="op">×</span> {s.current.b}</div>
      <div className={entryCls} id="entry">{s.typed === "" ? "?" : s.typed}</div>
      <div className={"note" + (s.note.win ? " win" : "")} id="note">{s.note.text}</div>
    </div>
  );
}

export function FixCard({ s }: { s: EngineState }) {
  const on = s.phase === "correcting";
  return (
    <div className={"fix" + (on ? "" : " hidden")} id="fix">
      <div className="lead" id="fixLead">{on ? s.fixLead : "Not quite."}</div>
      <div className="answer" id="fixAnswer">
        {on && <>{s.current.a} <span className="op">×</span> {s.current.b} = <span className="val">{s.current.answer}</span></>}
      </div>
    </div>
  );
}

export function Keypad({ s, onDigit, onErase, onCheck, onGotIt, onTryAgain, onStop }: {
  s: EngineState; onDigit: (d: string) => void; onErase: () => void; onCheck: () => void;
  onGotIt: () => void; onTryAgain: () => void; onStop: () => void;
}) {
  const hidden = !!s.reward;
  let keys;
  if (s.phase === "correcting") {
    keys = s.quest
      ? <>
          <button type="button" className="key go span2" onClick={onTryAgain}>Try again</button>
          <button type="button" className="key util span1" onClick={onStop}>Stop</button>
        </>
      : <button type="button" className="key go wide" onClick={onGotIt}>Got it</button>;
  } else {
    keys = <>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button key={d} type="button" className="key" onClick={() => onDigit(d)}>{d}</button>
      ))}
      <button type="button" className="key util" onClick={onErase}>⌫</button>
      <button type="button" className="key" onClick={() => onDigit("0")}>0</button>
      <button type="button" className="key go" onClick={onCheck}>✓</button>
    </>;
  }
  return <div className={"pad" + (hidden ? " hidden" : "")} id="pad">{keys}</div>;
}
