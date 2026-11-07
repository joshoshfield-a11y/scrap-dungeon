# SCRAP DUNGEON — beta testers

Automated testers that play like humans and triage like humans.
They drive the real game in headless Chromium and read live state
through the game's own `window.__scrapDebug` hook. **They never edit
`game/`** — no core.js, game.js, index.html, test.js, or assets
changes. All tester code, docs, and reports live in this directory.

## Run it

```bash
./run_all.sh
```

That uses the ML venv's Playwright (`~/workspace/venvs/ml-stack/bin/python`)
and its downloaded Chromium. Plain `python3 run_all.py` also works if
your Python has Playwright + Chromium.

Exit code is 1 if any **Blocker** check fails, else 0.
Outputs land in `reports/`:

- `reports/REPORT.md` — human-readable report: what each tester did,
  PASS/FAIL per check with exact evidence (file, state, console
  message, screenshot path), severity per failure.
- `reports/results.json` — the same checks, machine-readable.
- `reports/screenshots/*.png` — load, mobile, and extracted screens.

## The five testers

| Tester | Plays like | Looks for |
|---|---|---|
| graphics-qc | an art reviewer | every sheet 822x136, alpha, real painted content (opaque pixels only — black backgrounds key to alpha 0 here, so "all black" is judged on opaque pixels), referenced by the game, zero console errors, canvas actually renders sprite colour, walk pose changes and returns to rest. Tile-sized assets (not 8-direction sheets) are checked as tiles instead — size and whole-image painted content — so a new tile never crashes the suite or fails a sheet-geometry check it was never meant to meet |
| casual | a new player mashing around | uncaught errors, actions that do nothing with no feedback, softlocks, unresponsive UI |
| completionist | a player finishing floors | pickups collectable, enemies killable, stairs reachable, Descend banks exactly 25% floored, Extract keeps everything, run summary sane |
| bug-hunter | someone trying to break it | rapid taps, modal spam, Wait/Rest spam, item refusals, out-of-bounds taps, reload mid-run, save/load presence |
| mobile | a phone-only player | tap targets ~44px+, no horizontal overflow at 390px, collapsible log, double-tap-zoom guard, dock on screen, touch taps move/attack |

## Tester opinions and suggestions (the critique layer)

Beyond PASS/FAIL/NOTE, every run also produces human-style
opinions — see `testers/opinions.py`. This is an **addition** to
QC, never a replacement: opinions are never reported as bugs or
test failures, and the report labels them honestly as the
**automated tester personas' critique, NOT real human players**.

How it works:

- Each persona (casual, completionist, bug-hunter, mobile,
  graphics-qc) produces 2-4 concrete suggestions in its own
  first-person voice, covering graphics/visuals, flow/pacing,
  readability/clarity, controls/feel, and relatability/fun.
- Every suggestion is **grounded** in something that persona
  actually observed in that run: a `Recorder` metric in
  `testers/common.py` (state values, counted behaviour, grid
  counts, tap-target sizes, screenshot colour/brightness, sheet
  opaque-pixel measurements) or a check's evidence — and each
  suggestion names its observation in the report. No generic
  filler, no suggestion contradicting an observed fact.
- If a run does not support a suggestion, that persona says so
  (listed as "(no suggestion)" in the report) instead of
  inventing one. A rule whose metric is missing simply does not
  fire.
- `run_all.py` consolidates all personas' suggestions into a
  "Tester opinions and suggestions" section in `reports/REPORT.md`
  and a structured `opinions` block in `reports/results.json`
  (persona, category, suggestion, observation, priority), ranked
  highest-impact first, with duplicates merged and the agreeing
  personas listed. The per-persona voices follow underneath.

## Severity, the way a human beta tester triages

- **Blocker** — cannot play, crashes, corrupts state, or a core
  system (movement, combat, banking) is wrong.
- **Major** — a real feature is broken or a human would get stuck,
  but the game still runs.
- **Minor** — cosmetic, feedback, or small annoyance (e.g. a wall
  bump with no log line).
- **Note** — observation, not a defect (e.g. an unreferenced sheet).

## Phase 2 note

Phase 2 (expedition economy: salvage drop pickups, save/load, hub
state) landed in `game/` during this suite's development, and the
suite was updated for it: the bug-hunter now tests the real
`scrapdungeon.hub.v1` / `scrapdungeon.run.v1` autosave + hub-screen
Continue round-trip, and the completionist's pickup check credits
any inventory field (salvage, health, food, components, dataChip /
Codex), since different pickup kinds credit different fields.

One flake, recorded honestly: during development, one completionist
run against the Phase 2 game died with a pageerror
(`Cannot read properties of undefined (reading 'x')`) and a
subsequent `__scrapDebug` lookup failing. It did not reproduce in a
focused re-run against the Phase 2 game, and it did not recur in
later full runs — treat it as an unreproduced flake to watch for,
not as a verified game bug, and re-open it if it ever appears
twice. Checks that depend on a not-yet-landed feature are recorded
as **ENV** ("could not verify yet") — never invented as PASS. The suite also
hashes `game/` files before and after a run; if a file changed
mid-run, that is recorded and the cheap static checks re-run once.

## Adding a new tester persona

1. Add a `run_<name>(page, rec, ...)` function in
   `testers/personas.py` (or a new module under `testers/`).
   It gets a fresh Playwright page and a `Recorder`; every finding
   goes through `rec.check(name, ok, severity, evidence)` so it
   lands in REPORT.md with its evidence attached.
2. Wire it into `run_all.py`'s persona list with its viewport
   (desktop 1280x900, or a phone viewport with `mobile=True`).
3. Drive the real UI (keyboard, buttons, canvas taps) and read
   state only via `window.__scrapDebug` / `testers/common.py`
   helpers (`get_state`, `bfs_path`, `step`, `walk_path`,
   `sane_numbers`). Never add hooks to `game/` yourself, and never
   edit anything under `game/` from a tester.
4. Re-run `./run_all.sh` and check your persona's section in
   `reports/REPORT.md`.
