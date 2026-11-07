# Fixwave report — walk animation + character animations + menu restyle

Date: 2026-10-30. Working tree only: no commits, no pushes, no merges,
no publishing. No APK built or presented by this wave (parent rebuilds).
`game/core.js` untouched (251,475 B, same as Phase 6) — no rules, stats,
drop tables, or RNG changed. All changes are in `game/game.js`,
`game/style.css`, plus four byte-copied boss pose sheets.

## What the user reported (S25 test of the 01:03 PDT test APK)

1. "No real character animations like the ones we created when we first
   started."
2. "You teleport across the map wherever you click, no walk animations
   or anything."
3. Then a reference screenshot of the Bag mech-skills panel as neon
   2-column cards, with: "Fix these, and then we need to update menus
   to resemble this."

## Stage A — walk animation + character animations

### Root cause (as briefed, confirmed in code)

`walkTo` looped `doMove()` over the whole BFS path synchronously inside
one pointerdown handler, so `requestAnimationFrame` only ran after the
player was already at the destination. The pose system (`anims` /
`setWalk` / `currentPose` / `drawActor`, walk_a/walk_b flip with a 320 ms
expiry) existed but never got a frame between steps.

### What changed — `game/game.js` (117,462 → 124,458 B)

- **Slide system (rendering only).** `WALK_STEP_MS = 150` (see timing
  below). `slides` map + `startSlide(id, fx, fy, tx, ty)` +
  `slidePos(id, tx, ty)` returning float tile coords and progress 0–1,
  deleting the slide at t ≥ 1. Logic tiles change instantly on `doMove`
  exactly as before; only `render()` and `tileOrigin()` read slides, so
  the camera glides with the walk and tap-to-tile math matches what is
  drawn mid-slide. No time unit, scheduler tick, or rule reads a slide.
- **`doMove` slides.** On `res.moved`, calls `setWalk('player')` +
  `startSlide('player', pxBefore, pyBefore, newX, newY)`. Single-step
  keyboard/adjacent-tap moves slide too; attacks and refusals (not
  moved) get no slide.
- **`applyEnemyAnims` slides enemies.** Whenever an enemy's logic tile
  moved, `startSlide(en.id, b.x, b.y, en.x, en.y)` is called with the
  same timing as the player step that triggered it. Combat timing is
  identical; only rendering moves.
- **`tileOrigin()`** centres on `slidePos('player', …)` instead of the
  logic tile.
- **`render()` drawables loop.** For `enemy`/`player` kinds the draw
  position comes from `slidePos` (logic tile still governs fog, LOS,
  and culling); a hop is added mid-slide:
  `cy -= sin(π × progress) × TILE × 0.08`. The hop is the visible
  motion for Phase 5 types without pose sheets; for actors with poses
  it complements the walk-pose flip.
- **`walkTo` rewritten as an async step machine** (same name, same
  entry behaviour: foe target → nearest adjacent tile with a path; no
  path → "No path there."). It cancels any in-flight walk first,
  captures `visibleBefore` once (as before), then takes ONE step via
  `doMove`, waits `WALK_STEP_MS` via `setTimeout`, and repeats. Stop
  conditions, in the old loop's order, checked after every single
  step: state change (stairs/death), door opened (re-path from the new
  position, player stays, repaths guard > 10), blocked step (`!mv.ok`),
  destination reached, damage taken (HP snapshot), pickup/wreck
  recovery (pickups/carried/healthCells/foodCells/components/dataChips/
  wreckRecovered snapshots), trap triggered (triggered-count snapshot),
  enemy adjacent (`C.adjacentEnemies`), newly visible enemy (vs the
  initial `visibleBefore` set, log "Something stirs — you stop.").
  Each step still costs exactly what `doMove`/`playerAction` costs; no
  extra time units, no movement through walls/closed doors, no skipped
  scheduler ticks.
- **Cancellation.** `walkToken` + `walkTimer` + `cancelWalk()` (bumps
  the token, clears the pending timer). Wired into every fresh-input
  entry point, never into the walk's own steps: canvas pointerdown
  top, keydown top, `doWait`, `doFire`, `doForce`, `doBypass`,
  `useItemAndReport`, `openUsePopup`, `doRest`, search-button click,
  `openBagModal`, `openMenuModal`, log-button click. A cancelled
  walk's pending step checks `myToken !== walkToken` and returns.
- **Debug hooks** added to the shipped `window.__scrapDebug` (test-only,
  no UI effect): `playerRenderPos()`, `actorRenderPos(id)`,
  `walkStepMs` (= 150).
- `node --check game/game.js` and `node --check game/core.js` pass.

### Animation timing: 150 ms per step — why

The walk-pose expiry is 320 ms, so a 150 ms step reads the pose flip
(pose changes every other step at most, never faster than the eye can
follow), while a 10-tile walk takes 1.5 s instead of feeling like a
cutscene. A 10-tick clock unit per step is unchanged (see verification:
4 steps = 40 clock ticks).

### Boss pose sheets wired (byte-copy, hash-verified)

Copied from `sprites/anim/` to `game/assets/` (identical SHA-256 to the
sources), all 822×136 — the same sheet geometry as every other sheet
(cells 96×96 at x=6+i×102, y=34), so the existing slicer works
unchanged. SHEETS entries added: `boss_walk_a`, `boss_walk_b`,
`boss_attack`, `boss_damaged`.

- `mech_boss_walk_a_sheet.png` — 5,832 B —
  `c30d49ccfb714dcd74d3aafc7abebaeb4ec4e948ce67e69a0e7609beb6eafd6a`
- `mech_boss_walk_b_sheet.png` — 5,905 B —
  `950459f413549cd5ce8faa9a79b4b0d3786c794c0c80334e2152cf9950e7633b`
- `mech_boss_attack_sheet.png` — 6,168 B —
  `a617b5a72743b5f766899f288f9920ace5254ad3d98ad0fc922dea0a382921af`
- `mech_boss_damaged_sheet.png` — 5,421 B —
  `ac1ecb2347ba62eddeb22ad2ba8579ae815213f99332a30f389c48d596c47728`

For flyer / shielder / sniper / bomber / turret, only destroyed sheets
exist in `sprites/anim/` — no walk/attack sheets were invented. Those
five animate via slide + hop only (see "Still missing").

### Stage A behaviour preserved

Single-step moves, bump attacks, fire, wait, and keyboard play work
exactly as before. The harness's keyboard-driven personas pass on this
tree except one Phase 6-era persona gap (see harness section).

## Stage B — menu restyle (reference screenshot's style)

### What changed — `game/style.css` (6,090 → 8,402 B) + `game/game.js`

- `.neon-card` (background `#0a2027`, 2 px solid `#35e0ff` border,
  inset + glow box-shadow, 10 px padding, 10 px top margin; bold text
  `#d8fbff`); `.neon-card-title` (flex, space-between, uppercase,
  letter-spacing, 14 px) with `.neon-icon` (cyan, 18 px, top-right);
  `.neon-card-desc` (13 px, pale cyan-white); `.neon-card-cost`
  (12 px); `.neon-card button` full-width with 8 px top margin;
  `.mech-grid` (2-column grid, 10 px gap).
- `#modal-box` restyled (background `#07181d`, 2 px cyan border, glow
  shadow; `h2` uppercase, letter-spaced, `#d8fbff`).
- Menu/hub/bag/stairs buttons restyled together
  (`#modal-btns button, .hub-stations button, .bag-assign button,
  .bag-gear button, #stairs-panel button`: background `#0a2a33`, 2 px
  cyan border, `#d8fbff` text, inset + glow shadow, min-height
  48 px; hover `#0f3a47`).
- `.menu-log, .full-log` now dark teal `#081820` with cyan border.
- `#stairs-panel` now dark teal `rgba(7,24,29,0.97)` with 2 px cyan
  border + glow (position/size rules unchanged; Descend/Extract keep
  their orange/red text colours via the higher-specificity id rules).
- JS: hub `station()` sections now `className = 'neon-card'`; hub
  `stationBtn` min-height 40 px → 48 px. Bag wraps now carry
  `neon-card` in addition to their existing classes: assign wrap
  (`bag-assign neon-card`), ammo wrap, gear wrap, key wrap, mech wrap
  (all `bag-gear neon-card`). All remaining inline
  `minHeight = '40px'` in `game.js` (hub breakdown/enhance/loadout
  buttons) changed to `'48px'` by a single sed pass; after it,
  `grep -c "minHeight = '48px'"` = 12 and `node --check` passes.
  Dock/quickbar/action-bar buttons were NOT restyled (not menus;
  already ≥ 44 px).

### Mech-skills grid

Restructured into the reference's 2-column card grid, keeping shipped
skill order (`Object.keys(C.MECH_SKILLS)`: overclock,
evasiveProtocols, emergencyPlating, sensorPulse, salvageBurst,
ventHeat — NOT the screenshot's order), shipped values, and shipped
button behaviour (Learn (N pts) / Use, same onclick handlers, same
refusals). Each card: title row (name uppercase via CSS + icon),
description, cost line in the shipped parenthesised format exactly
(`(20 energy, +30 heat, 1 time unit)` etc., via `mechSkillEnergyCost`
when present), full-width 48 px button. Icons: overclock ⚡,
evasiveProtocols 🛡, emergencyPlating 🛡, sensorPulse ◎,
salvageBurst ✋, ventHeat ✋; fallback ◆ for any unknown id.

### Reference screenshot's errors deliberately NOT copied

The screenshot spells "ennergy" (Evasive Protocols), drops Emergency
Plating's 20 energy cost, and formats cost lines inconsistently (some
missing parentheses). Shipped code is correct on all three; the
restyle copies the style, not the errors. Verified from
`game/core.js` MECH_SKILLS: overclock 20 energy / +30 heat;
evasiveProtocols 20 / +15; emergencyPlating 20 / +15; sensorPulse
15 / +10; salvageBurst 15 / +15; ventHeat 10 / +0; all 1 time unit,
all learn cost 2.

### Menus restyled (all options, order, behaviour unchanged)

Bag (equipment rows, ammo selector, keys, mech skills), hub stations
(Mechanic / Salvager / Researcher / Armorer / Scout / Radio /
Instructor / Loadout), Menu/Help modal, Log modal, Use-item popup,
stairs panel. Visually read at 390 px (see screenshots below). No
horizontal overflow anywhere; all menu buttons ≥ 44 px (48 px
measured).

## Verification

All logs under `beta-testers/reports/` with the `fixwave-` prefix.
Browser runs use Playwright from `~/workspace/venvs/ml-stack` with
`TMPDIR=~/workspace/.playwright-tmp`. Nothing was piped through tail.

### Node tests

- Baseline (before any fixwave change):
  `beta-testers/reports/fixwave-node-baseline.log` — 158 pass / 0 fail.
- After the wave: `beta-testers/reports/fixwave-node.log` —
  **158 pass / 0 fail, exit 0.** No animation state lives in `core.js`
  (browser-only), so no node-test extension was applicable; no
  assertion was weakened.

### Fixwave browser verifier (new)

`beta-testers/verify_fixwave.py` (19,871 B). Drives the real game in
headless Chromium at 390×844 via `file://`, fixtures through
`window.__scrapDebug` exactly like `verify_phase6.py`, real
clicks/keys for every behaviour.

- Run 3 (final): `beta-testers/reports/fixwave-verify3.log` —
  **18 PASS / 0 FAIL, exit 0, zero console errors.** Covers: boss
  pose sheets load 822×136; mid-walk render pos fractional between
  tiles (render x 41.53, progress 0.53) with walk_b pose and logic pos
  still early (no teleport); walk reaches destination with one clock
  tick per step (4 steps = 40 ticks — one time unit is
  PLAYER_DEF.interval = 10 ticks); single-step ArrowRight slides
  (fractional render pos); walk stops on a pickup short of target
  (carried 0 → 5); walk stops on a newly visible foe short of target
  with the "Something stirs — you stop." log line; boss movement
  renders as slide + walk pose; Bag 6 neon skill cards with shipped
  cost lines verbatim, "ennergy" absent, buttons 48 px, no modal
  overflow; Menu modal neon frame (border rgb(53,224,255)); Hub
  8 neon station cards, buttons 48 px; Log modal, Use-item popup,
  and Stairs panel (real step onto a stairs tile) in the neon frame.
- Verifier history (test bugs, not game bugs — both fixed in the
  script, game untouched): run 1 clicked targets 5–12 tiles away, but
  at 390 px only ~4 tiles east of the centred player are on screen,
  so those clicks fell off-viewport and never reached the canvas.
  Run 2 assumed a straight-line BFS path; BFS tie-breaking zigzags
  diagonally, so fixed-tile fixtures missed the path. Run 3 uses
  on-screen targets and path-agnostic fixtures (a pickup band covering
  every shortest path; a foe placed so every shortest path comes
  within sight before the destination step).
- Known verifier quirk: after the Hub checks it evaluates state back
  to 'playing' and clicks the first modal button (New Expedition) —
  harmless because the browser context is closed right after; do not
  mistake that for a game bug. The second context (Log/Use-item/
  Stairs) starts fresh and is unaffected.

### Screenshots (visually read, in `beta-testers/reports/screenshots/`)

- `fixwave-midwalk.png` — player sprite visibly between tile centres
  mid-walk (straddling the tile boundary, walk pose), not snapped to
  a tile; corroborates the fractional-render-pos measurement.
- `fixwave-bag.png` — Bag top in the neon frame, full-width cyan
  Close button, no overflow.
- `fixwave-bag-mech.png` — the mech grid itself: 2-column neon
  cards, caps titles + top-right icons, descriptions, parenthesised
  cost lines, full-width "Learn (2 pts)" buttons, all six shipped
  skills in shipped order with correct costs (Emergency Plating
  shows its 20 energy). Matches the reference style.
- `fixwave-menu.png` — Menu help text in the neon frame, readable,
  no overflow.
- `fixwave-hub.png` — Hub in the neon frame, station cards with
  cyan borders, 48 px buttons.
- `fixwave-log.png` — Log modal, neon frame, glow.
- `fixwave-useitem.png` — Use-item popup, cyan-bordered buttons,
  full-width Close.
- `fixwave-stairs.png` — Stairs panel, neon frame + glow, Descend /
  Extract keep their orange/red text.

### Phase regressions (vs Phase 5 parent baseline 350/0/3)

- `verify_phase6.py`: `beta-testers/reports/fixwave-verify6.log` —
  **34 PASS / 0 FAIL, exit 0**, all sections True (art, door, los,
  wake, force, key, bypass, placement, locked, boss, fog, foglos,
  saveload, legacy), failures []. Matches the builder's run 5.
- `verify_phase5.py`: `beta-testers/reports/fixwave-verify5.log` —
  **31 PASS / 0 FAIL, exit 0, first attempt**, failures []. **The
  Phase 5 sniper-telegraph failure does NOT reproduce on this tree:**
  "aim sets the telegraph on the player's tile" (telegraph
  (31,26)), "amber telegraph marker renders" (amberPx 216),
  "standing still takes the aimed shot, telegraph clears" (dmg 8),
  "moving off the marked tile dodges" — all PASS. Honest caveat: no
  sniper code was touched by this wave (only rendering, walk
  sequencing, menus, and boss art wiring), so no mechanism is claimed
  for why the earlier parent/builder regress runs failed it. Treat
  this as "sniper green on this tree today", with the earlier failure
  unexplained rather than root-caused — not as proof the wave fixed
  it. A re-run of the Phase 6 verification track against this tree
  should re-confirm it.
- `verify_phase4.py`: first run
  `beta-testers/reports/fixwave-verify4.log` — 19 PASS / 1 FAIL,
  exit 1. The single FAIL was a **script artifact of the restyle,
  not a game regression**: the check matched the rendered string
  "Break down — irreversible", but the restyle uppercases modal h2
  titles via CSS `text-transform`, so `innerText` renders "BREAK
  DOWN — IRREVERSIBLE". The DOM text and the confirm flow are
  unchanged — the very next check, "confirmed breakdown: 1 component
  -> 3 wire + 1 core", PASSED (components 20→19, wire 100→103,
  thermal core 6→7). Per the brief's rule (adjust the script, never
  the game rules, to pass a test), the script's comparison was made
  case-insensitive with a comment recording why. Re-run
  `beta-testers/reports/fixwave-verify4b.log` — **20 PASS / 0 FAIL,
  exit 0**, failures [].
- `verify_phase2.py`: first run
  `beta-testers/reports/fixwave-verify2.log` — exit 1 with the single
  failure "shield found within 5 floors" (attempt 1 hunt found no
  shield drop in 5 floors; attempt 2 found a [Rare] Alloy aegis and
  the shield recharge + absorb rollup PASSED — the script's failures
  list retains the attempt-1 hunt failure across attempts, the known
  hunt-RNG flake class from Phases 2–3). No drop table or gear code
  was touched (`core.js` untouched). Re-run
  `beta-testers/reports/fixwave-verify2b.log` — **exit 0, failures
  []**, shield found first attempt ([Common] Alloy aegis), all
  shield checks green.
- `verify_phase3.py` was NOT re-run in this wave (not in the brief's
  required set; its hunt-RNG flake class is already documented).
- Full harness (`beta-testers/run_all.sh`):
  `beta-testers/reports/fixwave-harness.log` — **356 PASS / 1 FAIL /
  3 NOTE** (harness script itself exits 0; its verdict is in the
  counts). The 3 NOTEs are the known ones (unreferenced
  `prop_salvage_sheet.png`, wall bumps no feedback, completionist
  stairs note — see below). The 1 FAIL is completionist combat:
  "an enemy can be fought and killed — kills=0 hp=100
  state=playing", plus the NOTE "did not reach the stairs menu —
  after walk: state=playing at (26,29) stairs=(47, 35)".

### Harness FAIL diagnosis — Phase 6-era persona gap, not a fixwave regression

Evidence:

- The harness persona (`beta-testers/testers/personas.py`
  `run_completionist` + `walk_path`) drives the game **purely by
  keyboard steps** (`step()` = one key press + 130 ms wait). It never
  tap-to-walks. Keyboard movement logic is unchanged by this wave:
  `doMove` is still synchronous; the pickup leg PASSED on this tree
  (path=2, collected at (17,12)); bug-hunter's "60 rapid move-key
  taps do not corrupt state" PASSED; casual PASSED.
- The persona's BFS (`beta-testers/testers/common.py`) treats
  `"door"` as walkable (`WALKABLE = {"floor", "corridor", "door",
  "stairs", "hazard"}`) with no open/closed/locked distinction, and
  the persona has **no key handling at all**. On the Phase 6 tree,
  a route through a locked door stalls: the game refuses the bump
  (locked without key, costs nothing, player stays), so the planned
  steps repeat against the same cell — visible in the action log as
  long runs of no-op steps (e.g. `(1,0) -> (28,23)` six times with no
  movement). Closed doors also cost one extra step each (open, then
  enter), shifting every later planned step off by one. The fight
  leg then finds no adjacent enemy (`attack_adjacent_until_dead`
  returns immediately, kills stay 0) and the stairs leg exhausts its
  8 re-plans short of the stairs.
- Pre-Phase 6, every door was open, so this leg passed (baseline
  350/0/3). The Phase 6 builder never ran the full harness, so this
  gap was never baselined on the Phase 6 tree. Nothing in this wave
  touches door logic, drop logic, or keyboard movement.
- Recommended follow-up (parent's call, not done here to avoid
  hiding a real gap behind a green run): extend the completionist
  persona with key pickup + locked-door routing, or accept the FAIL
  as a known persona limitation. Do NOT change game door rules to
  pass the harness.

## Still missing (honest list)

- **Phase 5 pose sheets** for flyer / shielder / sniper / bomber /
  turret: only destroyed sheets exist in `sprites/anim/` for these
  types. They animate via slide + hop only — no walk/attack/damaged
  poses. New sprite art (or a generation pass in the reference style)
  is needed for real poses; nothing was faked by reusing another
  enemy's sheets.
- **Dock / quickbar / action-bar buttons** intentionally NOT restyled
  (not menus; already ≥ 44 px). Everything else player-facing is
  restyled.
- **Harness completionist combat** FAILs on the Phase 6 tree for the
  persona door/key gap diagnosed above.
- **Phase 3 verifier** not re-run in this wave (hunt-RNG flake class
  already documented; re-run it in the verification track).
- **Sniper-telegraph earlier failure** unexplained (green on this
  tree; no mechanism claimed).
- The presented 01:03 PDT test APK predates this wave and is stale;
  the parent rebuilds before presenting.

## Files changed

- `game/game.js` — slide system, async `walkTo`, cancellation,
  boss SHEETS entries, neon-card classes on hub/bag wraps, 48 px
  button heights, debug hooks.
- `game/style.css` — neon-card system, modal/hub/bag/stairs/button
  restyle.
- `game/assets/mech_boss_walk_a_sheet.png`,
  `mech_boss_walk_b_sheet.png`, `mech_boss_attack_sheet.png`,
  `mech_boss_damaged_sheet.png` — byte-copies from `sprites/anim/`
  (hashes above).
- `beta-testers/verify_fixwave.py` — new, 18 checks.
- `beta-testers/verify_phase4.py` — one script-only change:
  breakdown-confirm title comparison made case-insensitive (restyle
  uppercases modal titles via CSS; DOM text and flow unchanged).
- `beta-testers/FIXWAVE-REPORT.md` — this file.
- `beta-testers/reports/fixwave-*.log`, `beta-testers/reports/
  screenshots/fixwave-*.png` — all verification evidence.
- NOT changed: `game/core.js`, `game/index.html`, `game/test.js`,
  any enemy stat, damage, economy, drop, or door rule. No commits,
  pushes, merges, or publishing.
