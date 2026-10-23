// The Quests and Backpack panels (reference renderQuests() / renderCollection()).

import type { CSSProperties } from "react";
import { ELEMENTS } from "../art/elements";
import { EMBLEMS } from "../art/emblems";
import { COLLECTIBLES, GROUPS, caughtCount, isElementGroup, type Caught } from "../logic/collectibles";
import { QUESTS, questLen, type QuestId } from "../logic/quests";

export function QuestsPanel({ open, caught, mysteryUsed, onStart, classic = false }: {
  open: boolean; caught: Caught; mysteryUsed: boolean; onStart: (id: QuestId) => void; classic?: boolean;
}) {
  return (
    <div className={"quests" + (open ? "" : " hidden")} id="quests">
      <h2>Quests</h2>
      <p className="qintro">Get every problem right to win. One wrong answer ends the quest.</p>
      <div id="questList">
        {open && QUESTS.map((q) => {
          let sub = q.blurb;
          if (isElementGroup(q.id)) {
            let total = 0, have = 0;
            COLLECTIBLES.forEach((c) => { if (c.group === q.id) { total++; if (caught[c.id]) have++; } });
            sub += " (" + have + " of " + total + " found)";
          }
          const used = q.id === "mystery" && mysteryUsed;
          if (used) sub = "Opened today. Come back tomorrow!";
          return (
            <button key={q.id} type="button" className="qcard" disabled={used}
                    style={{ "--qc": q.color } as CSSProperties}
                    onClick={() => { if (!used) onStart(q.id); }}>
              <svg viewBox="0 0 200 200" aria-hidden="true" dangerouslySetInnerHTML={{ __html: EMBLEMS[q.id] }} />
              <span className="mid"><span className="qt">{q.name}</span><span className="qs">{sub}</span></span>
              <span className="len"><b>{questLen(q, classic)}</b><small>{questLen(q, classic) === 1 ? "problem" : "in a row"}</small></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BackpackPanel({ open, caught }: { open: boolean; caught: Caught }) {
  const found = caughtCount(caught);
  return (
    <div className={"collection" + (open ? "" : " hidden")} id="collection">
      <div className="head">
        <h2>Backpack</h2>
        <span className="count" id="collCount">{open ? found + " of " + COLLECTIBLES.length + " found" : ""}</span>
      </div>
      <p className={"empty-note" + (found > 0 ? " hidden" : "")} id="collEmpty">Get an answer right and the animal hops in here.</p>
      <div className="slots" id="slots">
        {open && GROUPS.map((g) => {
          const E = isElementGroup(g.key) ? ELEMENTS[g.key] : null;
          return [
            <h3 key={g.key + "-h"} className="grp" style={E ? { color: E.color } : undefined}>{g.label}</h3>,
            <div key={g.key + "-g"} className="slots-grid">
              {COLLECTIBLES.filter((c) => c.group === g.key).map((c) => {
                const n = caught[c.id] || 0;
                const rare = c.group === "rare";
                const cls = "slot" + (n ? "" : " locked") + (rare ? " rare" : "") + (E ? " elem" : "");
                const tag = rare
                  ? <div className="star">★ {n > 1 ? "×" + n : "rare"}</div>
                  : <div className="ct">{n > 1 ? "×" + n : " "}</div>;
                return (
                  <div key={c.id} className={cls} style={E ? ({ "--ec": E.color } as CSSProperties) : undefined}>
                    {n
                      ? <><svg viewBox="0 0 200 200" dangerouslySetInnerHTML={{ __html: c.svg }} /><div className="nm">{c.label}</div>{tag}</>
                      : <><div className="q">?</div><div className="nm">{" "}</div>{tag}</>}
                  </div>
                );
              })}
            </div>,
          ];
        })}
      </div>
    </div>
  );
}
