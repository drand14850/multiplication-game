// The game screen. All behavior lives in the engine; GameDriver runs it.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { GameStore } from "../../data/gameStore";
import type { QuestId } from "../logic/quests";
import { GameDriver } from "./driver";
import { Background, FixCard, Keypad, QuestBar, RewardView, Stage, Strip, type Player } from "./parts";
import { BackpackPanel, QuestsPanel } from "./panels";

/**
 * adaptive (default on): problems lean toward facts this kid doesn't know yet, using
 * fluencyMs as the "knows it" threshold. Off for the parity check against the reference.
 */
export function Game({ store, timeZone, player, adaptive = true, fluencyMs = 3000, classicRares = false }: {
  store: GameStore; timeZone?: string; player?: Player; adaptive?: boolean; fluencyMs?: number;
  /** only the reference's 5 rare animals (for the parity check) */
  classicRares?: boolean;
}) {
  const [driver] = useState(() => new GameDriver(store, timeZone, adaptive ? { fluencyMs } : null, classicRares));
  useSyncExternalStore(driver.subscribe, driver.getVersion);
  useEffect(() => driver.attach(), [driver]);
  const bagRef = driver.setBagButton;

  const { run, elapsed } = driver;
  const s = driver.engine.s;

  return (
    <>
      <Background s={s} />
      <div id="app" className={s.panel !== "none" ? "panel-open" : undefined}>
        <Strip s={s} bagRef={bagRef} player={player}
               onQuests={() => run((e) => e.togglePanel("quests"))}
               onBag={() => run((e) => e.togglePanel("bag"))} />
        <QuestBar s={s} onQuit={() => run((e) => e.quit())} />
        <RewardView s={s} onClaim={(id) => run((e) => e.claim(id))} />
        <Stage s={s} />
        <FixCard s={s} />
        <Keypad s={s}
                onDigit={(d) => run((e) => e.type(d))}
                onErase={() => run((e) => e.erase())}
                onCheck={() => run((e) => e.check(elapsed()))}
                onGotIt={() => run((e) => e.gotIt())}
                onTryAgain={() => run((e) => e.tryAgain())}
                onStop={() => run((e) => e.stop())} />
        <QuestsPanel open={s.panel === "quests"} caught={s.caught} mysteryUsed={s.mysteryDay === driver.today()}
                     onStart={(id: QuestId) => run((e) => e.startQuest(id))} />
        <BackpackPanel open={s.panel === "bag"} caught={s.caught} />
      </div>
    </>
  );
}
