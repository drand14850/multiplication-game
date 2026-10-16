// The 11 × 11 fact grid: status, accuracy or median time per fact, over its last 5 attempts.
// Every cell carries a glyph or number, so color never carries meaning alone; a list view
// shows the same numbers as a table.

import { useEffect, useState } from "react";
import type { Backend, HistoryRow } from "../data/backend";
import {
  accuracy, classify, FACTORS, formatSeconds, indexStats, STATUS_GLYPH, STATUS_LABEL, statusCounts,
  type FactStat, type Status,
} from "./logic";

export type GridMode = "status" | "accuracy" | "time";

/** 5 bins, darkest (worst) to lightest (best). */
function accuracyBin(acc: number): number {
  return acc >= 1 ? 4 : acc >= 0.8 ? 3 : acc >= 0.6 ? 2 : acc >= 0.4 ? 1 : 0;
}
function timeBin(ms: number, t: number): number {
  return ms < t * 0.5 ? 4 : ms < t ? 3 : ms < t * 1.5 ? 2 : ms < t * 2 ? 1 : 0;
}

function describe(a: number, b: number, s: FactStat | undefined, status: Status, merge: boolean): string {
  const name = merge && a !== b ? `${a} × ${b} and ${b} × ${a}` : `${a} × ${b}`;
  if (!s) return `${name}: not seen yet`;
  return `${name}: ${STATUS_LABEL[status]}. ${s.recentCorrect} of last ${s.recent} right, ` +
    `median ${formatSeconds(s.medianCorrectMs ?? s.medianAllMs)}. ${s.total} tries in all.`;
}

export function FactGrid({ backend, childId, stats, thresholdMs, merge, onMerge }: {
  backend: Backend; childId: string; stats: FactStat[]; thresholdMs: number; merge: boolean; onMerge: (m: boolean) => void;
}) {
  const [mode, setMode] = useState<GridMode>("status");
  const [asList, setAsList] = useState(false);
  const [hover, setHover] = useState<string>("");
  const [picked, setPicked] = useState<{ a: number; b: number } | null>(null);
  const get = indexStats(stats);
  const counts = statusCounts(stats, thresholdMs, merge);
  const t = thresholdMs;

  function cell(a: number, b: number) {
    if (merge && b < a) return <span key={b} className="fcell blank" aria-hidden="true" />;
    const s = get(a, b, merge);
    const status = classify(s, t);
    const label = describe(a, b, s, status, merge);
    let cls: string = status, text: string = STATUS_GLYPH[status];
    if (mode === "accuracy" && s) { cls = "q" + accuracyBin(accuracy(s)); text = String(Math.round(accuracy(s) * 100)); }
    if (mode === "time" && s) {
      const ms = s.medianCorrectMs ?? s.medianAllMs;
      if (ms !== null) { cls = "q" + timeBin(ms, t); text = (ms / 1000).toFixed(ms < 9950 ? 1 : 0); }
    }
    if (mode !== "status" && !s) { cls = "unseen"; text = "·"; }
    const isPicked = picked?.a === a && picked?.b === b;
    return (
      <button key={b} type="button" className={"fcell " + cls} aria-label={label} aria-pressed={isPicked}
              onPointerEnter={() => setHover(label)} onPointerLeave={() => setHover("")}
              onFocus={() => setHover(label)} onBlur={() => setHover("")}
              onClick={() => setPicked(isPicked ? null : { a, b })}>
        {text}
      </button>
    );
  }

  return (
    <div className="card">
      <h3>Which facts are known</h3>
      <p className="sub">
        Each fact's last 5 tries. Fluent = at least 4 right, faster than {formatSeconds(t)}.
        {" "}{counts.fluent} fluent · {counts.slow} correct but slow · {counts.shaky} shaky · {counts.unseen} not seen yet.
      </p>
      <div className="row">
        <div className="seg" role="group" aria-label="Show">
          {(["status", "accuracy", "time"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === "status" ? "Status" : m === "accuracy" ? "Accuracy %" : "Median time"}
            </button>
          ))}
        </div>
        <label className="check"><input type="checkbox" checked={merge} onChange={(e) => onMerge(e.target.checked)} />7×8 and 8×7 together</label>
        <label className="check"><input type="checkbox" checked={asList} onChange={(e) => setAsList(e.target.checked)} />List</label>
      </div>

      {asList ? <FactTable stats={stats} thresholdMs={t} /> : (
        <>
          <div className="readout fact" aria-live="polite">{hover || "Hover or tap a fact for details."}</div>
          <div className="fgrid" role="group" aria-label="Fact grid: first number down the side, second across the top">
            <span className="hd corner" aria-hidden="true">×</span>
            {FACTORS.map((b) => <span key={"h" + b} className="hd" aria-hidden="true">{b}</span>)}
            {FACTORS.map((a) => [
              <span key={"r" + a} className="hd" aria-hidden="true">{a}</span>,
              ...FACTORS.map((b) => cell(a, b)),
            ])}
          </div>
          <Legend mode={mode} thresholdMs={t} />
        </>
      )}

      {picked && <FactHistory backend={backend} childId={childId} a={picked.a} b={picked.b} merge={merge} onClose={() => setPicked(null)} />}
    </div>
  );
}

function Legend({ mode, thresholdMs }: { mode: GridMode; thresholdMs: number }) {
  if (mode === "status") {
    return (
      <div className="legend" aria-label="Legend">
        {(["fluent", "slow", "shaky", "unseen"] as const).map((s) => (
          <span key={s}><i className={"glyph " + s}>{STATUS_GLYPH[s]}</i>{STATUS_LABEL[s]}</span>
        ))}
      </div>
    );
  }
  const T = thresholdMs / 1000;
  const bins = mode === "accuracy"
    ? ["under 40%", "40–59%", "60–79%", "80–99%", "100%"]
    : [`${2 * T} s or more`, `${1.5 * T}–${2 * T} s`, `${T}–${1.5 * T} s`, `${T / 2}–${T} s`, `under ${T / 2} s`];
  return (
    <div className="legend" aria-label="Legend">
      {bins.map((l, i) => <span key={l}><i style={{ background: `var(--seq-${i})` }} />{l}</span>)}
      <span><i className="glyph unseen">·</i>not seen yet</span>
    </div>
  );
}

function FactTable({ stats, thresholdMs }: { stats: FactStat[]; thresholdMs: number }) {
  return (
    <div className="table-wrap">
      <table className="dtable">
        <thead><tr><th>Fact</th><th>Status</th><th className="num">Last 5</th><th className="num">Median</th><th className="num">Tries</th></tr></thead>
        <tbody>
          {stats.map((s) => {
            const st = classify(s, thresholdMs);
            return (
              <tr key={s.a + "x" + s.b}>
                <td>{s.a} × {s.b}</td>
                <td><span className="row" style={{ gap: 6 }}><span className={"glyph " + st}>{STATUS_GLYPH[st]}</span>{STATUS_LABEL[st]}</span></td>
                <td className="num">{s.recentCorrect}/{s.recent}</td>
                <td className="num">{formatSeconds(s.medianCorrectMs ?? s.medianAllMs)}</td>
                <td className="num">{s.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FactHistory({ backend, childId, a, b, merge, onClose }: {
  backend: Backend; childId: string; a: number; b: number; merge: boolean; onClose: () => void;
}) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  useEffect(() => {
    let live = true;
    backend.factHistory(childId, a, b, merge).then((r) => { if (live) setRows(r); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [backend, childId, a, b, merge]);
  const when = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="history" aria-live="polite">
      <div className="row">
        <h3 className="grow">{a} × {b} = {a * b}{merge && a !== b ? ` (and ${b} × ${a})` : ""}: latest tries</h3>
        <button type="button" className="link" onClick={onClose}>Close</button>
      </div>
      {!rows ? <p className="sub">Loading…</p> : rows.length === 0 ? <p className="sub">No tries yet.</p> : (
        <div className="table-wrap">
          <table className="dtable">
            <thead><tr><th>When</th><th>Fact</th><th className="num">Answer</th><th>Right?</th><th className="num">Time</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{when.format(new Date(r.at))}{r.mode === "quest" ? " · quest" : ""}</td>
                  <td>{r.a} × {r.b}</td>
                  <td className="num">{r.given}</td>
                  <td>{r.correct ? "✓ right" : "✗ wrong"}</td>
                  <td className="num">{formatSeconds(r.ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
