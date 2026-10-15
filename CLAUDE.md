# CLAUDE.md — Times Tables web app

Standing instructions for every session in this repo. The build plan is in `INSTRUCTIONS.md`.

## Baseline conventions

- **Run before claiming.** Never say something works until you have run it: the dev server, the test suite, the build, or a browser check. If you didn't run it, say so.
- **Fix errors before presenting.** Don't hand back work with failing tests, type errors, lint errors, or console errors. Fix them first, or stop and explain exactly what is blocking you.
- **Modular phases.** Work one phase of `INSTRUCTIONS.md` at a time. Don't start the next phase until the current one's checkpoint is done.
- **Mandatory checkpoints (🔲).** Each phase ends with a 🔲 checkpoint. Stop there, report what you verified and how, and wait for approval. Tick the box (✅) in `INSTRUCTIONS.md` only after approval.
- **The uploaded file is authoritative.** `reference/times-tables.html` is the source of truth for game behavior, art, wording and feel. Port it. Don't redesign it, "improve" it, or regenerate the art from scratch. If the spec and the reference file disagree, the reference file wins. Flag the conflict instead of picking silently.

## Project rules

- This is a kids' app. The child-facing side stays simple: big touch targets, no ads, no external links, and no text a 7-year-old can't read.
- Never commit secrets. Supabase keys go in `.env.local`, which is gitignored. Commit an `.env.example` with placeholder values.
- Every Supabase table gets Row Level Security, enabled with policies, before any data goes into it.
- Game logic (question picking, review pile, quests, rewards) lives in pure TypeScript modules with unit tests and no React or Supabase imports, so it can be tested on its own.
- The game must never wait on the network to show the next question. Network writes go through a queue (see INSTRUCTIONS.md, Phase 3).
