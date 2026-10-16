# Architecture proposal (Phase 0)

## Stack

I'm keeping the stack in `INSTRUCTIONS.md` (Vite + React + TypeScript, Supabase, Vercel, Vitest, Playwright). Nothing is clearly better for this app. The only addition is **`idb`** (a tiny IndexedDB wrapper) for the Phase 3 write queue.

**How the port stays faithful under React:**
- The CSS is copied from the reference file as-is into `src/game/ui/game.css`. Class names stay the same, so the look can't drift.
- The SVG art strings are copied as-is into TypeScript constants and rendered with `dangerouslySetInnerHTML`. That's safe because they're static strings in our own code, never user input. `recolor()` and `DECOR` are ported line for line.
- The fly-to-bag, bag-pop and background fade animations are imperative in the reference (rAF + inline styles). They stay imperative in the port, called from a small `useFlyToBag` hook through refs, so the timing matches exactly.

## Folder structure

```
times-tables-port/
├─ reference/times-tables.html     # source of truth, never edited
├─ docs/
│  ├─ behavior-inventory.md
│  ├─ architecture.md               # this file
│  └─ schema-proposal.sql           # becomes supabase/migrations/ in Phase 2
├─ public/fonts/                    # self-hosted Fredoka (woff2)
├─ src/
│  ├─ game/
│  │  ├─ logic/                     # PURE TS: no React, no Supabase, no DOM
│  │  │  ├─ constants.ts            # MIN/MAX, RARE_CHANCE, REVIEW_*, all delays (ms)
│  │  │  ├─ rng.ts                  # Rng type; Math.random default; seeded rng for tests
│  │  │  ├─ facts.ts                # factKey, randomFact, pickNextFact
│  │  │  ├─ reviewPile.ts           # onMiss (set 2), onCorrect (−1), owedFacts, legacy ×1 cleanup
│  │  │  ├─ animalBag.ts            # shuffled bag of 13 + 5% rare roll
│  │  │  ├─ collectibles.ts         # 82 entries: stable id, name, label, group, isRare
│  │  │  ├─ quests.ts               # QUESTS table, quest progress, win/fail
│  │  │  ├─ rewards.ts              # rollElement (prefer uncaught), mystery pool, pick options
│  │  │  ├─ day.ts                  # today(tz) → "YYYY-MM-DD"; rare-pick / mystery availability
│  │  │  ├─ messages.ts             # every child-facing string, verbatim
│  │  │  ├─ engine.ts               # state machine: phases ask/wait/correcting/reward/flying,
│  │  │  │                          #   events in, state + effects out (catch, attempt, questRun)
│  │  │  ├─ timer.ts                # response_ms stopwatch with pause/resume, 60 s cap
│  │  │  └─ __tests__/*.test.ts
│  │  ├─ art/                       # pure TS too: SVG strings + recolor/DECOR/EMBLEMS
│  │  │  ├─ animals.ts
│  │  │  ├─ elements.ts             # ELEMENTS, lum, recolor, DECOR, elementArt
│  │  │  └─ emblems.ts
│  │  └─ ui/                        # React
│  │     ├─ Game.tsx                # wires engine ↔ components ↔ timers ↔ effects sink
│  │     ├─ Strip.tsx  QuestBar.tsx  Stage.tsx  FixCard.tsx  Keypad.tsx
│  │     ├─ QuestsPanel.tsx  BackpackPanel.tsx  Reward.tsx  Background.tsx
│  │     ├─ useFlyToBag.ts  useKeyboard.ts
│  │     └─ game.css                # copied verbatim from the reference
│  ├─ data/                         # Phase 2–3
│  │  ├─ supabase.ts                # client from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
│  │  ├─ gameStore.ts               # interface; LocalStore (Phase 1) and SupabaseStore (Phase 3)
│  │  └─ writeQueue.ts              # IndexedDB queue, batching, retry, client UUIDs
│  ├─ auth/                         # sign in/up, ParentGate
│  ├─ profiles/                     # WhoIsPlaying, ChildPin, ChildForm
│  ├─ dashboard/                    # FactGrid, Trend, NeedsWork, QuestStats, BackpackStats, Settings
│  ├─ App.tsx  main.tsx  routes.tsx
├─ supabase/
│  ├─ migrations/                   # Phase 2
│  ├─ seed/dev-seed.sql             # Phase 4, dev only
│  └─ tests/rls.test.ts             # two-parent isolation test
├─ tests/e2e/                       # Playwright: parity, offline sync, gate
├─ .env.example                     # placeholder keys (committed)
├─ .env.local                       # real keys (gitignored)
└─ CLAUDE.md  INSTRUCTIONS.md
```

## How the game logic splits

The rule: **`game/logic` and `game/art` never import React, Supabase or the DOM.** That lets every rule in the inventory be unit-tested with a seeded RNG.

- **`engine.ts`** is the heart. It's a reducer-style state machine with `dispatch(event) → { state, effects[] }`.
  - Events: `type(d)`, `erase`, `check`, `gotIt`, `tryAgain`, `stop`, `quit`, `startQuest(id)`, `claim(id)`, `nextProblem`, `openPanel(x)`.
  - Effects are plain data the UI or data layer acts on: `scheduleNext(ms)`, `flyToBag(collectibleId, from)`, `recordAttempt({...})`, `recordCatch({...})`, `questRunStarted/Ended({...})`, `saveGameState`.
  - The engine never sets timers or touches the network itself. Delays come out as effects, and the UI owns `setTimeout`, which keeps the "never wait on the network" rule structural.
- **`gameStore.ts`** is the interface between the game and persistence:
  - Phase 1: a `LocalStore` backed by `localStorage` (same shape as the reference's saved blob).
  - Phase 3: a `SupabaseStore` that loads `game_state` and backpack counts and pushes effects into `writeQueue`.
- **Collectible IDs.** The reference keys by display name. The port uses stable IDs: regulars and rares are lowercase (`cat`, `axolotl`), element animals are `{element}-{base}` (`fire-fox`, `golden-penguin`). The display name and label are derived from the ID.

## Supabase schema

See [`schema-proposal.sql`](schema-proposal.sql). Summary:

| Table | Purpose | Notes |
|---|---|---|
| `parent_settings` | 1 row per parent: `time_zone`, `fluency_ms` (default 3000) | Holds the family time zone the once-a-day rules use |
| `children` | `id, parent_id, name, avatar, created_at` | `avatar` is a regular-animal ID |
| `child_pins` | `child_id, pin_hash` (bcrypt via pgcrypto) | **No select policy.** Only reachable through `set_child_pin` / `verify_child_pin` RPCs, so the hash never reaches the browser |
| `collectibles` | 82 reference rows: `id, grp, base, is_rare` | Read-only to everyone signed in; lets the DB validate catch IDs and know which picks are rare |
| `game_state` | 1 row per child: `review_pile jsonb` | Score, streak and wins aren't stored (see inventory ⚠8–9) |
| `attempts` | every answer | Client UUID primary key → queue retries are idempotent |
| `quest_runs` | every quest attempt | Client UUID; inserted at start (`quit`, `reached` 0), updated on each step or end |
| `catches` | every animal caught | Client UUID; trigger enforces the Mystery and rare-pick daily limits in the family time zone |

**RLS:**
- One `security definer` helper, `is_my_child(child_id)`. Every child-scoped table has select/insert/update/delete policies through it, with `attempts` and `catches` insert/select only (append-only log).
- `children` checks `parent_id = auth.uid()` directly.
- Deleting a child cascades to all its rows.

**Dashboard:**
- Dashboard queries are `security invoker` views or RPCs (`fact_stats(child, window 5)`, `daily_trend(child, days 30)`, `quest_stats(child)`), so RLS still applies and the browser never downloads the whole log.

**Parent gate:**
- I propose **re-entering the parent's password** (a fresh `signInWithPassword` check, valid for 10 minutes) and no separate parent PIN for v1. That means one fewer secret to store. Easy to add a parent PIN later with the same `child_pins` pattern.

**PIN caveat:**
- A 4-digit PIN has only 10,000 values, so a hash slows down but can't stop a determined guesser who has the hash. That's why the hash stays server-side and `verify_child_pin` is rate-limited (5 tries, then 1-minute lockout). A child PIN is a "don't play as your sibling" lock, not real security. The parent gate is the real boundary.

## Decisions (approved at Checkpoint 0, 2026-10-15)

1. **Collectible IDs**: `fire-fox` style as above.
2. **Parent gate**: password re-entry, no separate parent PIN.
3. **Fluency threshold**: one per parent (`parent_settings.fluency_ms`).
4. **Inventory ⚠5 and ⚠6**: quest rewards are recorded at win time, and the client uses the family time zone for "today".
5. All other ⚠ items in the inventory: the reference file's behavior is kept.
6. **Superseded after Phase 5 (2026-10-16):** decision 2 (parent gate) and child PINs are replaced by kid accounts with family codes, so kids can sign in at school themselves. See the note at the end of INSTRUCTIONS.md and `supabase/migrations/20261016000005_kid_accounts.sql`.
