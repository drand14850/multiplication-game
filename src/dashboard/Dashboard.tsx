// The parent dashboard: one child at a time. Tabs on a phone, everything at once on a laptop.

import { useEffect, useState } from "react";
import { AnimalSvg } from "../app/common";
import type { Backend, Child, QuestStat, ServerChildState, TrendDay } from "../data/backend";
import { QUESTS } from "../game/logic/quests";
import { FactGrid } from "./FactGrid";
import { backpackProgress, formatSeconds, reviewList, STATUS_GLYPH, STATUS_LABEL, statusCounts, weakest, type FactStat } from "./logic";
import { Trend } from "./Trend";
import "./dash.css";

type Tab = "facts" | "trend" | "work" | "quests" | "bag";
const TABS: [Tab, string][] = [["facts", "Facts"], ["trend", "Trend"], ["work", "Needs work"], ["quests", "Quests"], ["bag", "Backpack"]];

interface Data {
  childId: string;
  facts: FactStat[];
  merge: boolean;
  trend: TrendDay[];
  quests: QuestStat[];
  streak: number;
  state: ServerChildState;
}

export function Dashboard({ backend, kids, thresholdMs }: { backend: Backend; kids: Child[]; thresholdMs: number }) {
  const [childId, setChildId] = useState(kids[0]?.id ?? "");
  const [merge, setMerge] = useState(false);
  const [tab, setTab] = useState<Tab>("facts");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const id = kids.some((k) => k.id === childId) ? childId : kids[0]?.id ?? "";

  useEffect(() => {
    if (!id) return;
    let live = true;
    Promise.all([
      backend.factStats(id, merge), backend.dailyTrend(id, 30), backend.questStats(id),
      backend.longestStreak(id), backend.loadChildState(id),
    ]).then(([facts, trend, quests, streak, state]) => {
      if (live) { setData({ childId: id, facts, merge, trend, quests, streak, state }); setError(""); }
    }).catch(() => { if (live) setError("Couldn't load progress. Check the connection and try again."); });
    return () => { live = false; };
  }, [backend, id, merge]);

  if (!kids.length) return <p>Add a child to see their progress here.</p>;
  // Refetch keeps the frame: the previous numbers stay, dimmed, until the new ones arrive.
  const busy = !data || data.childId !== id || data.merge !== merge;

  return (
    <div className="dash">
      {kids.length > 1 && (
        <div className="kid-switch" role="group" aria-label="Child">
          {kids.map((k) => (
            <button key={k.id} type="button" aria-pressed={k.id === id} onClick={() => setChildId(k.id)}>
              <AnimalSvg id={k.avatar} />{k.name}
            </button>
          ))}
        </div>
      )}
      {data && <Summary data={data} thresholdMs={thresholdMs} busy={busy} />}
      <div className="dash-tabs" role="tablist" aria-label="Progress views">
        {TABS.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {!data ? <p className="sub" aria-busy="true">Loading progress…</p> : (
        <div className={"dash-grid" + (busy ? " busy" : "")}>
          <section className="dash-panel" data-active={tab === "facts" || undefined} aria-label="Facts">
            <FactGrid backend={backend} childId={data.childId} stats={data.facts} thresholdMs={thresholdMs} merge={merge} onMerge={setMerge} />
          </section>
          <section className="dash-panel" data-active={tab === "work" || undefined} aria-label="Needs work">
            <NeedsWork facts={data.facts} thresholdMs={thresholdMs} pile={data.state.reviewPile} merged={data.merge} />
          </section>
          <section className="dash-panel span2" data-active={tab === "trend" || undefined} aria-label="Trend">
            <Trend days={data.trend} />
          </section>
          <section className="dash-panel" data-active={tab === "quests" || undefined} aria-label="Quests">
            <Quests stats={data.quests} streak={data.streak} />
          </section>
          <section className="dash-panel" data-active={tab === "bag" || undefined} aria-label="Backpack">
            <Backpack caught={data.state.caught} />
          </section>
        </div>
      )}
    </div>
  );
}

/** The headline numbers, always visible above the views (so a phone sees them without opening tabs). */
function Summary({ data, thresholdMs, busy }: { data: Data; thresholdMs: number; busy: boolean }) {
  const practiced = data.trend.filter((d) => d.problems > 0);
  const problems = data.trend.reduce((t, d) => t + d.problems, 0);
  const minutes = Math.round(data.trend.reduce((t, d) => t + d.minutes, 0));
  const fluent = statusCounts(data.facts, thresholdMs, data.merge).fluent;
  const bag = backpackProgress(data.state.caught);
  const wins = data.quests.reduce((t, q) => t + q.wins, 0);
  const tile = (label: string, value: string) => (
    <div className="tile"><div className="lbl">{label}</div><div className="val">{value}</div></div>
  );
  return (
    <div className={"tiles summary" + (busy ? " busy" : "")} aria-label="At a glance">
      {tile("Problems, last 30 days", problems.toLocaleString())}
      {tile("Days practiced", String(practiced.length))}
      {tile("Minutes", minutes.toLocaleString())}
      {tile("Fluent facts", `${fluent} of ${data.merge ? 66 : 121}`)}
      {tile("Animals found", `${bag.found} of ${bag.total}`)}
      {tile("Quests won", String(wins))}
      {tile("Longest run right", String(data.streak))}
    </div>
  );
}

function NeedsWork({ facts, thresholdMs, pile, merged }: { facts: FactStat[]; thresholdMs: number; pile: Record<string, number>; merged: boolean }) {
  const weak = weakest(facts, thresholdMs, 10);
  const review = reviewList(pile);
  return (
    <div className="card">
      <h3>Needs work</h3>
      <p className="sub">The 10 weakest facts{merged ? " (7×8 and 8×7 together)" : ""}: shaky ones first, then the slowest.</p>
      {weak.length === 0 ? <p className="sub">Nothing shaky or slow right now.</p> : (
        <table className="dtable">
          <thead><tr><th>Fact</th><th>Status</th><th className="num">Last 5</th><th className="num">Median</th></tr></thead>
          <tbody>
            {weak.map((s) => (
              <tr key={s.a + "x" + s.b}>
                <td>{s.a} × {s.b} = {s.a * s.b}</td>
                <td><span className="row" style={{ gap: 6 }}><span className={"glyph " + s.status}>{STATUS_GLYPH[s.status]}</span>{STATUS_LABEL[s.status]}</span></td>
                <td className="num">{s.recentCorrect}/{s.recent}</td>
                <td className="num">{formatSeconds(s.medianCorrectMs ?? s.medianAllMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3>In the review pile</h3>
      <p className="sub">Facts missed recently. Each one comes back until it's answered right this many more times.</p>
      {review.length === 0 ? <p className="sub">Empty.</p> : (
        <div className="chips">
          {review.map(([k, n]) => <span key={k} className="chip">{k.replace("x", " × ")} · {n} more</span>)}
        </div>
      )}
    </div>
  );
}

function Quests({ stats, streak }: { stats: QuestStat[]; streak: number }) {
  const by = new Map(stats.map((s) => [s.questId, s]));
  const wins = stats.reduce((t, s) => t + s.wins, 0);
  return (
    <div className="card">
      <h3>Quests</h3>
      <div className="tiles">
        <div className="tile"><div className="lbl">Longest run right in a row</div><div className="val">{streak}</div></div>
        <div className="tile"><div className="lbl">Quests won</div><div className="val">{wins}</div></div>
      </div>
      <table className="dtable">
        <thead><tr><th>Quest</th><th className="num">Tries</th><th className="num">Wins</th><th>Farthest</th></tr></thead>
        <tbody>
          {QUESTS.map((q) => {
            const s = by.get(q.id);
            const best = s?.best ?? 0;
            return (
              <tr key={q.id}>
                <td>{q.name}</td>
                <td className="num">{s?.runs ?? 0}</td>
                <td className="num">{s?.wins ?? 0}</td>
                <td>
                  <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                    <div className="meter grow" role="img" aria-label={`${best} of ${q.len}`}><i style={{ width: (100 * best) / q.len + "%" }} /></div>
                    <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{best}/{q.len}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Backpack({ caught }: { caught: Record<string, number> }) {
  const p = backpackProgress(caught);
  const open = p.groups.filter((g) => g.found < g.total);
  return (
    <div className="card">
      <h3>Backpack</h3>
      <div className="hero">{p.found} <small>of {p.total} animals found</small></div>
      <table className="dtable">
        <thead><tr><th>Group</th><th>Found</th><th className="num"></th></tr></thead>
        <tbody>
          {p.groups.map((g) => (
            <tr key={g.key}>
              <td>{g.label}</td>
              <td style={{ width: "45%" }}>
                <div className="meter" role="img" aria-label={`${g.found} of ${g.total}`}><i style={{ width: (100 * g.found) / g.total + "%" }} /></div>
              </td>
              <td className="num" style={{ whiteSpace: "nowrap" }}>{g.found === g.total ? "✓ all " + g.total : `${g.found}/${g.total}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sub">{open.length === 0 ? "Every group is complete!" : `Still to finish: ${open.map((g) => g.label.replace(" animals", "")).join(", ")}.`}</p>
    </div>
  );
}
