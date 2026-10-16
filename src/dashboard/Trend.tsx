// Last 30 days as four small multiples (one measure each, one axis each), plus a table view.

import { useState } from "react";
import type { TrendDay } from "../data/backend";
import { formatSeconds } from "./logic";

const W = 320, H = 110, PAD_L = 30, PAD_R = 8, PAD_T = 8, AXIS = 18;
const dayFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const dayLabel = (d: string) => dayFmt.format(new Date(d + "T00:00:00Z"));

/** Clean top-of-axis value: 1, 2, 5 × 10^n at or above max. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  return ([1, 2, 5, 10].find((m) => m * p >= max) ?? 10) * p;
}

interface ChartProps {
  title: string;
  days: TrendDay[];
  value: (d: TrendDay) => number | null;
  format: (v: number) => string;
  kind: "col" | "line";
  fixedMax?: number;
}

function Chart({ title, days, value, format, kind, fixedMax }: ChartProps) {
  const [hi, setHi] = useState<number | null>(null);
  const vals = days.map(value);
  const present = vals.map((v, i) => [v, i] as const).filter(([v]) => v !== null) as [number, number][];
  const max = fixedMax ?? niceMax(Math.max(0, ...present.map(([v]) => v)));
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - AXIS;
  const band = plotW / Math.max(1, days.length);
  const x = (i: number) => PAD_L + band * i + band / 2;
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH;
  const barW = Math.min(24, Math.max(2, band - 2));             // ≤24px, 2px surface gap between bars
  const last = present.at(-1);
  const shown = hi ?? last?.[1] ?? null;
  const readout = shown === null ? "No practice yet"
    : vals[shown] === null ? `${dayLabel(days[shown].day)}: no practice` : `${dayLabel(days[shown].day)}: ${format(vals[shown]!)}`;

  // line: break across days with no practice
  const segments: [number, number][][] = [];
  if (kind === "line") {
    let cur: [number, number][] = [];
    vals.forEach((v, i) => { if (v === null) { if (cur.length) segments.push(cur); cur = []; } else cur.push([x(i), y(v)]); });
    if (cur.length) segments.push(cur);
  }

  return (
    <figure className="chart" style={{ margin: 0 }}>
      <h4>{title}</h4>
      <div className="readout" aria-live="polite"><b>{readout}</b></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, last ${days.length} days. Latest: ${readout}.`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(max * f)} y2={y(max * f)} stroke={f === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth="1" />
            <text className="tick" x={PAD_L - 4} y={y(max * f) + 3} textAnchor="end">{format(max * f)}</text>
          </g>
        ))}
        {days.length > 0 && (
          <>
            <text className="tick" x={x(0)} y={H - 4} textAnchor="start">{dayLabel(days[0].day)}</text>
            <text className="tick" x={x(days.length - 1)} y={H - 4} textAnchor="end">{dayLabel(days[days.length - 1].day)}</text>
          </>
        )}
        {kind === "col" && vals.map((v, i) => {
          if (v === null || v <= 0) return null;
          const top = y(v), bottom = y(0), r = Math.min(4, barW / 2, bottom - top);
          const l = x(i) - barW / 2;
          // 4px rounded data end, square at the baseline
          return <path key={i} fill="var(--series-1)" opacity={hi === null || hi === i ? 1 : 0.55}
            d={`M${l},${bottom} V${top + r} Q${l},${top} ${l + r},${top} H${l + barW - r} Q${l + barW},${top} ${l + barW},${top + r} V${bottom} Z`} />;
        })}
        {/* a day with no practice on either side gets a dot, or it would vanish */}
        {kind === "line" && segments.filter((seg) => seg.length === 1).map((seg, k) => (
          <circle key={"d" + k} cx={seg[0][0]} cy={seg[0][1]} r="4" fill="var(--series-1)" stroke="var(--panel)" strokeWidth="2" />
        ))}
        {kind === "line" && segments.map((seg, k) => (
          <polyline key={k} points={seg.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--series-1)"
                    strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {kind === "line" && shown !== null && vals[shown] !== null && (
          <circle cx={x(shown)} cy={y(vals[shown]!)} r="4" fill="var(--series-1)" stroke="var(--panel)" strokeWidth="2" />
        )}
        {hi !== null && <line x1={x(hi)} x2={x(hi)} y1={PAD_T} y2={y(0)} stroke="var(--axis)" strokeWidth="1" />}
        {/* hit targets: the whole day band, not just the painted mark */}
        {days.map((_, i) => (
          <rect key={i} x={PAD_L + band * i} y={0} width={band} height={H - AXIS} fill="transparent"
                onPointerEnter={() => setHi(i)} onPointerLeave={() => setHi(null)} onClick={() => setHi(i)} />
        ))}
      </svg>
    </figure>
  );
}

export function Trend({ days }: { days: TrendDay[] }) {
  const [asTable, setAsTable] = useState(false);
  const active = days.filter((d) => d.problems > 0);
  const total = active.reduce((t, d) => t + d.problems, 0);
  const minutes = days.reduce((t, d) => t + d.minutes, 0);

  return (
    <div className="card">
      <div className="row">
        <h3 className="grow">Last 30 days</h3>
        <label className="check"><input type="checkbox" checked={asTable} onChange={(e) => setAsTable(e.target.checked)} />Table</label>
      </div>
      <div className="tiles">
        <div className="tile"><div className="lbl">Days practiced</div><div className="val">{active.length}</div></div>
        <div className="tile"><div className="lbl">Problems</div><div className="val">{total.toLocaleString()}</div></div>
        <div className="tile"><div className="lbl">Minutes</div><div className="val">{Math.round(minutes)}</div></div>
      </div>
      {asTable ? (
        <div className="table-wrap">
          <table className="dtable">
            <thead><tr><th>Day</th><th className="num">Problems</th><th className="num">Right</th><th className="num">Median</th><th className="num">Minutes</th></tr></thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.day}>
                  <td>{dayLabel(d.day)}</td>
                  <td className="num">{d.problems}</td>
                  <td className="num">{d.problems ? Math.round((100 * d.correct) / d.problems) + "%" : "–"}</td>
                  <td className="num">{formatSeconds(d.medianMs)}</td>
                  <td className="num">{d.minutes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="charts">
          <Chart title="Problems answered" days={days} kind="col" value={(d) => d.problems} format={(v) => String(Math.round(v))} />
          <Chart title="Accuracy" days={days} kind="line" fixedMax={100}
                 value={(d) => (d.problems ? (100 * d.correct) / d.problems : null)} format={(v) => Math.round(v) + "%"} />
          <Chart title="Median answer time" days={days} kind="line"
                 value={(d) => (d.medianMs === null ? null : d.medianMs / 1000)} format={(v) => v.toFixed(1) + " s"} />
          <Chart title="Minutes practiced" days={days} kind="col" value={(d) => d.minutes} format={(v) => String(Math.round(v))} />
        </div>
      )}
      <p className="sub">A session is answers with no gap over 10 minutes. Days are in your family's time zone.</p>
    </div>
  );
}
