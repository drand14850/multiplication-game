# Behavior inventory — `reference/times-tables.html`

Everything the reference file does, read end to end (1,337 lines). Line numbers point into the reference file. Section **⚠ Conflicts and gaps** at the bottom lists where `INSTRUCTIONS.md` and the file disagree, or where the file is silent on something the port needs. Per `CLAUDE.md`, the file wins on every conflict unless the parent says otherwise.

---

## 1. Page shell

- Single HTML file, no framework, one IIFE in `"use strict"` mode (L403–1336).
- Viewport: `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no` (L2). Pinch-zoom is disabled.
- `<title>Times Tables</title>`.
- Font: Fredoka 400/500/600/700 from Google Fonts with preconnects (L4–6). Fallback stack `ui-rounded, "Trebuchet MS", system-ui, sans-serif`. Body weight 500.
- Only external dependency is the font. **Port note:** self-host Fredoka so the kids' app makes no third-party requests.

## 2. Palette and tokens (L8–18)

| Token | Value | Used for |
|---|---|---|
| `--deep` | `#2B1D45` | page background, text on amber buttons |
| `--panel` | `#3D2A5F` | keys, panels, bag button |
| `--panel2` | `#4B3573` | utility keys, quest cards, slots, pick buttons |
| `--amber` | `#FFC145` | × sign, ✓ key, bag count, rare accents, reward title |
| `--mint` | `#6DE0A6` | right answer, focus rings, "new!", answer value in correction |
| `--coral` | `#FF7F6E` | wrong answer, correction border, failed track segment |
| `--cream` | `#FFF4E2` | main text |
| `--dim` | `rgba(255,244,226,.55)` | secondary text |
| rare bg | `#5A4327` | rare slot / rare pick button background |

## 3. Layout

- `#app`: centered column, `max-width: 460px`, `height: 100%`, padding `14px 16px 18px`, gap 12px, flex column. `overscroll-behavior: none` on html/body.
- Top to bottom: score strip → quest bar (quests only) → reward (quest wins only) → stage (equation) → correction card → keypad → quests panel → backpack panel.
- `#bg`: fixed full-screen layer behind `#app`, animal SVG centered horizontally at `padding-top: 11vh`, `width: min(74vw, 330px)`, opacity `.24`, `pointer-events: none`, `aria-hidden`.
- `@media (max-width: 420px)`: the streak counter is hidden entirely (L325–327).
- All art uses `viewBox="0 0 200 200"`.

## 4. Score strip (L340–354)

- Left: `<b>N</b> right` (score).
- `· <b>N</b> in a row`: shown only when streak ≥ 3, and never at widths ≤ 420px.
- Right: **Quests** chip button (text becomes **Done** while the Quests panel is open), then the **backpack** button: bag icon + `found/82`, `aria-label="Open backpack"`.
- Score and streak are **session only**: never saved, reset to 0 on reload.

## 5. Problems

### Generation (L950–988)
- `MIN = 2, MAX = 12`. `a` and `b` are each uniform over 2–12 (121 ordered facts). Comment: "no ×1 problems: too easy".
- Fact key is `"{a}x{b}"`, so `7x8` and `8x7` are **different** facts everywhere (review pile, no-repeat check).
- **Review pick:** if the pile has any facts owed > 0 **and** `sinceReview >= 3` **and** `Math.random() < 0.55`, pick a uniform-random fact from the pile and set `sinceReview = 0`.
- **Otherwise random pick:** try up to 12 times to draw a fact whose key ≠ the previous problem's key; then `sinceReview++`. (After 12 failures it would accept a repeat; probability ≈ (1/121)¹¹, effectively never.)
- A review pick does **not** check the previous key, so it can repeat the last problem immediately (known quirk, keep).
- `sinceReview` starts at 0, so the first 3 problems of a page load are never reviews. It is not saved.
- `lastKey` is updated for every problem, review or random.
- Initial markup shows `7 × 8` but `nextQuestion()` replaces it before first paint.

### Display
- Equation: `a × b` with the × in amber. Font `clamp(50px, 17vw, 78px)`, weight 600.
- Entry box below: shows `?` dimmed (`.empty`) when nothing typed. Font `clamp(46px, 15vw, 70px)`, weight 700, 5px bottom border.
- Note line below the entry (17px, dim; mint when `.win`).
- Above the equation, `★ rare animal` (amber, 15px) only while a rare animal is in the background.

### Typing (L1038–1053)
- Max **3 digits**. A leading `0` is ignored. Typing clears the note line.
- ⌫ removes the last digit; back to `?` when empty.
- ✓ with nothing typed does nothing.
- Input is accepted only in phase `ask`.

### Keypad (L1002–1034)
- 3-column grid, gap 9px: `1 2 3 / 4 5 6 / 7 8 9 / ⌫ 0 ✓`.
- Keys: 30px weight 600, `--panel` background, radius 16px, padding 14px 0. `:active` scales to .94.
- ⌫ is `.util` (24px, `--panel2`, dim). ✓ is `.go` (amber background, deep text).
- In phase `correcting` the keypad is replaced by:
  - Practice: one full-width **Got it** (`.go .wide`, 22px).
  - Quest (including Mystery Box): **Try again** (`.go .span2`, 21px) and **Stop** (`.util .span1`, 18px).

### Physical keyboard (L1299–1313)
- Ignored entirely while a panel is open (`#app.panel-open`).
- Phase `correcting`: **Enter or Space** clicks the first pad button (Got it / Try again).
- Phase `reward`: Enter clicks the `.claim` button if there is one (element and Mystery rewards; Pick-a-Pet has none).
- Otherwise: digits type, Backspace erases (default prevented), Enter checks.

## 6. Answering (L1055–1107)

### Right answer
- `score++`, `streak++` (in quests too).
- If the fact is in the review pile, owed count −1; delete at 0.
- Phase becomes `wait`: all input ignored until the next problem (no double-counting).
- Entry turns mint (`.entry.right`).
- **Practice:**
  - The background animal is caught (`collect`) and flies to the backpack.
  - Note (mint), first match wins:
    1. Rare animal: `You caught the {name lowercase}!` (e.g. "You caught the axolotl!"), **even if already caught before**.
    2. First catch of a regular animal: `{Name} jumped in your backpack!` (e.g. "Fox jumped in your backpack!").
    3. Streak ≥ 5: `{streak} in a row!`
    4. Otherwise: `Yes!`
  - Next problem after **1100 ms** (rare) / **820 ms** (new) / **660 ms** (otherwise).
- **Quest:**
  - `done++`, track segment fills.
  - Note: `Quest beaten!` (0 left) / `One more!` (1 left) / `{n} to go`.
  - Nothing is caught.
  - Next problem after **520 ms**, or the win screen after **700 ms**.

### Wrong answer
- `streak = 0` (score is untouched).
- Review pile: `weak[fact] = 2`. **Sets** to 2, does not add (a fact owing 1 that is missed again owes 2, not 3).
- Entry turns coral (`.entry.wrong`).
- Stage hides; the correction card shows:
  - Lead: practice `The answer is:` · Mystery Box `Not quite. The answer is:` · other quests `Quest over. The answer is:`
  - Body: `a × b = answer`, × in amber, answer in mint. Font `clamp(36px, 12vw, 52px)`.
  - Card: `--panel`, 2px coral border, radius 20px. (Markup default lead "Not quite." is always overwritten.)
- In a quest, the track segment at the failed position turns coral.
- The streak counter is hidden immediately.
- The background animal is **not** caught. On "Got it" it is replaced (it consumed its bag slot).
- **Got it** → reset screen → next problem.
- **Try again** → restarts the **same quest from 0** (fresh track). Unlimited retries, Mystery Box included (it isn't used up until won).
- **Stop** → ends the quest, back to practice.

## 7. Animals

### Regular and rare (L458–634)
- 18 SVG strings in order: Cat, Dog, Bear, Bunny, Fox, Owl, Frog, Penguin, Whale, Turtle, Elephant, Pig, Panda (indices 0–12, `COMMON = 13`), then Axolotl, Salamander, Chameleon, Lizard, Snake (rare).
- **Background picker (`nextAnimal`)**, practice only:
  1. 5% (`RARE_CHANCE = 0.05`): a uniform-random rare. This does **not** take a regular from the bag.
  2. Otherwise pop from a shuffled bag of the 13 regulars (Fisher–Yates). Refill and reshuffle when empty. A reshuffle can put the last animal of one pass first in the next, so back-to-back repeats are possible across a reshuffle.
- The bag is not saved; it restarts each page load.
- A new animal is picked for **every** problem in practice, including after a miss.
- **During a quest:** no animal is picked (`showing = -1`), and the bag is untouched. The quest emblem is the background.
- Background swap: new SVG starts at opacity 0 (`.enter`), and two rAFs later it fades to `.24` over 0.3s.
- **Rare glow:** `drop-shadow(0 0 20px rgba(255,193,69,.6))`, plus `rareglow` 2.6s infinite opacity .26↔.44.

### Element (quest) animals (L636–754)
- 8 elements, each with a label, accent `color`, `dark` color, 4-step `ramp` and 8 animals:

| key | color | animals |
|---|---|---|
| water | `#5FC6E8` | Whale, Frog, Turtle, Penguin, Axolotl, Salamander, Snake, Dog |
| earth | `#7CC46A` | Bunny, Elephant, Pig, Bear, Dog, Lizard, Fox, Panda |
| fire | `#FF8A3D` | Fox, Dog, Cat, Bear, Owl, Lizard, Snake, Pig |
| ice | `#BDE3F7` | Penguin, Bunny, Bear, Owl, Whale, Fox, Cat, Elephant |
| emerald | `#3DD68C` | Frog, Turtle, Salamander, Cat, Panda, Chameleon, Snake, Owl |
| ruby | `#FF4F7B` | Axolotl, Fox, Pig, Bunny, Dog, Chameleon, Lizard, Bear |
| golden | `#FFCC33` | Bear, Elephant, Penguin, Cat, Owl, Dog, Panda, Snake |
| diamond | `#A8F0F5` | Panda, Owl, Elephant, Whale, Fox, Axolotl, Bunny, Chameleon |

- **`recolor(svg, E)`:** collects the unique hex colors in the base SVG. Colors with relative luminance ≥ 0.26 are sorted dark→light and spread evenly across the element's 4-color ramp (a single light color maps to `ramp[2]`). Every color below 0.26 (eyes, outlines) becomes `E.dark`.
- **`DECOR`:** per-element `back` (drawn behind) and `front` (drawn on top) overlays: fire = three flames behind; water = bubble rings; earth = sprout behind, pebbles and leaves in front; ice = 4 snowflakes; emerald / ruby / diamond = sparkles in different tints; golden = small crown on top plus sparkles.
- Element art = `back + recolor(base) + front`, generated at load. The port must reuse this code, not pre-render or redraw.

### Collectibles (L745–767)
- Order: 13 regular (group `animals`), 5 rare (group `rare`), then 8 groups × 8 element animals, in the order above. **Total 82.**
- Internal identity is the **display name**: `"Cat"`, `"Axolotl"`, `"Fire Fox"`. The backpack slot label is the base name (`"Fox"`). Reward screens show the full name (`"Fire Fox"`).
- Backpack section headings: `Animals`, `Rare`, `Water animals`, `Earth animals`, `Fire animals`, `Ice animals`, `Emerald animals`, `Ruby animals`, `Golden animals`, `Diamond animals`. Element headings are tinted with the element color.

## 8. Backpack

### Button
- Shows `found/82`, where found = number of distinct collectibles caught at least once.
- **Catch animation (`flyToBag`, L863–895):** a fixed-position copy of the animal's SVG is placed exactly over the source element, starting at the source's computed opacity; the source is hidden (`visibility: hidden`). Two rAFs later it moves to the bag's center with `scale(.08)` and fades to 0 over 0.55s using `cubic-bezier(.5,-0.12,.55,1)`. At 560 ms the copy is removed and the bag "pops" (`bagpop` 0.5s: scale 1→1.28/−6°→1.05/4°→1) and the count updates.
- Source is the background animal (practice) or the reward art (quest rewards).
- Counts update in the bag only when the pop happens. If the backpack panel is open, it re-renders immediately on catch.

### Panel (L914–948)
- Title `Backpack`, count `{n} of 82 found` (amber).
- Empty note when nothing is found: `Get an answer right and the animal hops in here.`
- Each section: 4-column grid, gap 9px.
- Caught slot: art + base name + tag. Locked slot: big `?` at opacity .35, blank name, same tag.
- Tags: rare slots always show `★ rare`, or `★ ×N` when N > 1 (shown on locked rare slots too). Other slots show `×N` only when N > 1, otherwise blank.
- Rare slots: `#5A4327` background with a 2px amber inset ring. Element slots: 2px inset ring in the element color.
- **Opening/closing:** the bag button toggles the panel. There is **no Done button** for the backpack; you close it by tapping the bag again (or by tapping Quests, which switches panels).
- The bag button stays clickable during a quest and on the reward screen.

## 9. Panels

- At most one of Quests / Backpack is open. `#app.panel-open` hides stage, keypad, correction card and reward; the open panel fills the remaining height and scrolls.
- Keyboard input is ignored while a panel is open. **Timers are not paused:** if a panel is opened during the 520–1100 ms "next problem" delay, the next problem still loads behind it.
- Closed size limits (not normally seen): quests `max-height 56vh`, collection `40vh`.

## 10. Quests

### List (L805–817, L1120–1144)
- Title `Quests`, intro `Get every problem right to win. One wrong answer ends the quest.`

| id | name | len | color | blurb |
|---|---|---|---|---|
| mystery | Mystery Box | 1 | `#B48CFF` | 1 problem, a surprise quest animal. Once a day! |
| pick | Pick-a-Pet Quest | 8 | `#FFC145` | You pick the animal |
| water | Water Quest | 10 | `#5FC6E8` | Win a water animal |
| earth | Earth Quest | 12 | `#7CC46A` | Win an earth animal |
| fire | Fire Quest | 14 | `#FF8A3D` | Win a fire animal |
| ice | Ice Quest | 18 | `#BDE3F7` | Win an ice animal |
| emerald | Emerald Quest | 19 | `#3DD68C` | Win an emerald animal |
| ruby | Ruby Quest | 21 | `#FF4F7B` | Win a ruby animal |
| golden | Golden Quest | 23 | `#FFCC33` | Win a golden animal |
| diamond | Diamond Quest | 25 | `#A8F0F5` | Win a diamond animal |

- Card: emblem (44px) · name (17px/600) · subline (13px, dim) · big length number in the quest color with `problem` (len 1) or `in a row` under it.
- Element quests append ` ({have} of 8 found)` to the blurb.
- Mystery Box, if already won today: subline `Opened today. Come back tomorrow!`, card disabled (opacity .45).
- **Emblems** (`EMBLEMS`, L771–803): gift box with "?" marks, gold star, water drop, globe, flame, snowflake, emerald, ruby, crown, diamond.

### Running a quest (L1146–1177)
- Starting closes the panel, hides the Quests button, and shows the quest bar: emblem (22px) · name · `done/len` in the quest color · **Quit** chip.
- Track: one 10px-tall segment per problem, gap 3px. Unfilled `rgba(255,244,226,.14)`, done = quest color, miss = coral.
- Background becomes the quest emblem (not rare, no glow).
- Same problem generator as practice, **including the review pile and the 3-problem / 55% rule**. `sinceReview` carries over between practice and quests.
- Ending a quest (Quit, Stop, or after claiming a reward) hides the bar, shows the Quests button again, and loads a fresh practice problem.
- **Quit** is ignored during the reward screen and the fly-away (phases `reward` / `flying`), and is hidden on the reward screen.

### Winning (L1205–1271)
- `wins[questId]++` (saved, but **never shown** anywhere in the UI).
- Quest bar stays visible with a full track. Stage and keypad hide, and the reward screen shows.
- Title: `The Mystery Box opened!` for Mystery Box, otherwise `{Quest name} beaten!` (e.g. "Fire Quest beaten!"). Title is 26px/700 amber.
- **Mystery Box:**
  - `mysteryDay = today()` is set **at win time**, before the claim.
  - Prize: uniform random over all 64 element animals (no preference for new).
  - Sub: `You got a new animal!` / `You got another one!`
  - Prize art (`min(58vw, 230px)`) + full name (24px) + **Put it in my backpack** button.
- **Pick-a-Pet:**
  - Sub: `Pick any animal. You can pick 1 rare animal a day.`, or `Pick an animal. You already picked a rare one today.` if a rare was already picked today.
  - 4-column grid of all 13 regular + 5 rare. Each shows art, name, and `new!` (mint) or `have ×N` (amber).
  - Rare buttons have the rare styling. If a rare pick was already used today, they're disabled (opacity .38) and labeled `tomorrow`.
  - Tapping an animal claims it straight away. There's no confirm button. A rare pick sets `rarePickDay = today()`.
- **Element quests:**
  - Prize: random animal from that element, **only from uncaught ones if any remain**, otherwise from all 8.
  - Sub: `You won a new animal!` / `You won another one!`
  - Prize art + full name + **Put it in my backpack**.
- **Claim:** allowed only in phase `reward`. Sets phase `flying`, catches the animal (it flies from the prize art to the bag), saves, then ends the quest **900 ms** later.
- The reward panel scrolls if it overflows.

### Daily rules
- `today()` = **device-local** calendar date `YYYY-MM-DD`.
- Mystery Box: unavailable once `mysteryDay === today()`.
- Rare pick: rare buttons disabled once `rarePickDay === today()`. Rare animals caught in **practice** don't count toward this limit.

## 11. Saving (L435–454, L1320–1335)

- Uses `window.storage.get/set(key, value, false)`, the Claude-artifact storage API. Missing outside Claude, so the file saves nothing when hosted as-is.
- Key `times-tables-state`. Saved: `weak`, `caught`, `wins`, `rarePickDay`, `mysteryDay`. Not saved: score, streak, sinceReview, lastKey, animal bag, an in-progress quest.
- Saved after every answer, quest win, mystery open and claim.
- On load, which is **async after** the first problem is already showing: drop any `weak` keys with a factor < 2 (legacy ×1 cleanup), then restore the rest and refresh the bag count.
- Every storage call is wrapped in try/catch: "practice still works without saving".

## 12. Accessibility and motion

- Focus rings: 3px mint outline (offset 2px) on keys, bag button, quest cards and pick buttons.
- `#bg` and emblems are `aria-hidden`. The bag button has an aria-label. Tap highlight is disabled.
- `prefers-reduced-motion: reduce`: no key press scale, no bag pop, no rare glow animation (rare art held at opacity .4), and **all transitions off** (`* { transition: none !important }`). So the fly-to-bag copy jumps rather than glides, and the background swaps without fading.

## 13. Timings summary

| Event | Delay |
|---|---|
| Next problem after right answer (practice, repeat catch) | 660 ms |
| … new regular animal | 820 ms |
| … rare animal | 1100 ms |
| Next problem in a quest | 520 ms |
| Win screen after last quest answer | 700 ms |
| Fly-to-bag transition | 550 ms (copy removed at 560 ms) |
| Bag pop | 500 ms |
| End quest after claim | 900 ms |
| Background fade-in | 300 ms |
| Rare glow cycle | 2.6 s |

---

## ⚠ Conflicts and gaps

Places where `INSTRUCTIONS.md` and the reference disagree, or where the port needs a decision. **The reference wins on each one unless you say otherwise.**

1. **"A miss adds 2" (Phase 1 test list) vs. the file, which *sets* owed to 2.** A fact owing 1 that's missed again owes 2, not 3. I'll port and test "sets to 2".
2. **Streak is invisible on phones.** The spec says the streak goes up. The file does count it, but hides the counter at ≤ 420px, which includes the 390px parity width. The "N in a row!" note (streak ≥ 5) still shows. Keep as-is.
3. **The spec says "Nothing is taken away for a miss."** Score is kept, but the **streak resets to 0**. Keep.
4. **Backpack section names.** The spec lists "Water, Earth, …". The file says "Water animals", "Earth animals", …. Keep the file's text.
5. **Mystery Box is used up at win, not at claim.** If the page reloads between the win screen and "Put it in my backpack", the day's box is spent but nothing is caught. With the server enforcing once a day, I propose recording the Mystery catch **when the win happens** (the prize is already rolled then), with the claim tap only playing the animation. This keeps the reference's behavior that the box is spent at win, and it closes the gap. Same for element rewards: record at win.
6. **Day boundary.** The file uses the **device's** local date. The spec wants the server to enforce once a day in the **family's** time zone. If they differ (a travelling tablet, or a wrong device clock), the UI and server could disagree. Proposal: the client computes "today" in the family's time zone (stored in parent settings, defaulting to the parent's browser zone at sign-up), so both sides use the same day.
7. **Server enforcement plus offline queue.** If a Mystery catch made offline is later rejected (say, a second device already used today's box), the child saw a catch the server refuses. Proposal: the server rejects it, the queue drops that row instead of retrying forever, and the backpack corrects on the next load. That's rare, but worth knowing about.
8. **`wins` isn't shown in the game.** It's derivable from `quest_runs`, so I won't store it in `game_state`.
9. **Score and streak are per page load in the file.** The port keeps them per session (reset when a child is picked). The dashboard's "longest run of correct answers" comes from `attempts`.
10. **Response timer and panels.** The spec says to pause `response_ms` while a panel is open. The file doesn't pause the game's own timers in that case, which is fine since they're display delays. Only the new measurement timer pauses.
11. **Bag stays tappable mid-quest and on the reward screen.** That opens the backpack over the quest. Keep it; keyboard input pauses as the spec says.
12. **Mystery retries are unlimited until won.** This matches the spec ("used up only when won"), and is noted for the dashboard: several `quest_runs` rows per day for `mystery` are expected.
13. **Quest abandoned by closing the tab.** The file just loses it. For `quest_runs` I'll record it as `quit` with the `reached` count from the last answer, as soon as a quest starts.
14. **Fredoka loaded from Google.** Self-host it, per the kids' app rule of no external requests. It looks identical.

### Found during Phase 1 (parity check)

15. **The score strip updates late.** The reference only redraws "N right" and the streak in `render()`, which runs when the next problem appears. So the score still shows the old number during the right-answer pause and on the reward screen. Ported as-is (`scoreShown` / `streakShown` in the engine).
16. **The reference renders in quirks mode** (no `<!doctype>`). The port uses standards mode. The only visible effect was the quest card's "problem / in a row" label sitting about 2.5px lower. Fixed with one port-only CSS rule at the bottom of `game.css`.
17. **Pick-a-Pet double tap (deviation, approved at Checkpoint 1).** In the reference, tapping a regular animal and then a rare one within 900 ms sets "rare picked today" even though the second tap is ignored. That burns the day's rare pick for nothing. The port checks the phase first, so the second tap does nothing at all.
18. **Winning screen after Quit.** If Quit is tapped in the 700 ms between the last right answer and the win screen, the reference throws a script error (`quest` is null). The port ignores the late win step instead.
19. **Adaptive problem picking (deviation, requested by the parent 2026-10-16).** The reference picks every random problem uniformly from the 121 facts. The port weights each random pick by how well the kid knows the fact, from its last 5 tries and the dashboard's own status rule: fluent ×0.5, slow ×1.25, shaky ×1.5, not seen yet ×1.25 ("gentle", since 2026-10-19; the first version, ×0.25 / ×1.5 / ×2.5 / ×1.5, felt too hard). This applies in practice and in quests. Unchanged: no ×1, no immediate repeat, the review pile (3 problems, 55%), and every fact can still come up. With no history the picking is exactly the reference's, and the parity check runs with adaptive picking off. See `src/game/logic/mastery.ts`.
20. **Tropical quest (addition, 2026-10-17).** A new element made the same way as the others (recolor ramp plus decor overlays), 16 in a row, sitting between Fire (14) and Ice (18); Diamond stays the longest. Its 8 animals are appended after the reference's 82 (90 in all), so every existing backpack keeps everything and just gains empty slots.
21. **Mystery Box asks the hardest fact (deviation, 2026-10-17).** Instead of a random problem it asks the fact the kid has struggled with most (shaky first, least accurate; then slowest). Each "Try again" moves to the next-hardest, so the answer shown on the correction card can't simply be typed back. With no history, or adaptive picking off, it picks at random like the reference.
22. **Five more rare animals (addition, 2026-10-19).** Narwhal, Flamingo, Red Panda, Sloth and Peacock, drawn in the reference's style. They come after everything else (95 collectibles), so every backpack keeps everything. Rare backgrounds stay at 5% of practice problems overall, now shared among 10 rares, and Pick-a-Pet offers all 10. The parity check uses only the reference's 5 rares, for both backgrounds and Pick-a-Pet.
23. **Shorter quests (deviation, 2026-10-23).** Quests now take 5–10 in a row instead of the reference's 8–25, keeping the order: Pick-a-Pet 5, Water 5, Earth 6, Fire 6, Tropical 7, Ice 7, Emerald 8, Ruby 8, Golden 9, Diamond 10 (still the longest); Mystery Box stays 1. One miss still ends a quest. Each quest keeps its reference length (`refLen`), which the parity check uses. The dashboard caps "farthest" at the new length for runs from before the change.
24. **Greek Myths quest (addition, 2026-10-23).** 9 in a row (alongside Golden; Diamond stays the longest at 10), with a Greek temple emblem. Its 8 creatures (Hydra, Pegasus, Cerberus, Minotaur, Griffin, Phoenix, Centaur, Medusa, drawn friendly) are new art, not recolors, in a "Greek Myth creatures" backpack section appended after everything else (103 in all), so every backpack keeps everything. Like the element quests, the reward prefers creatures the kid doesn't have yet. The Mystery Box can now give a myth creature too.
