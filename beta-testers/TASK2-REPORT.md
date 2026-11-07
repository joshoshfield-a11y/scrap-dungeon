# Scrap Dungeon — Task 2 Report (2026-10-27)

Reproduce + fix no-loot floors, and update the beta harness to the
current (vision-layout) game. No art, no balance change beyond the
no-loot fix, no dressing/circuit changes. Nothing merged, pushed,
published, or packaged.

## Part A — root cause: REPRODUCED, with evidence

The prior report was correct: 3 of 180 floors (60 seeds x depths 1-3)
had zero pickups. The cause was NOT `placePickup` retries — it was the
room-typing guarantee in `generateFloor` (`game/core.js`).

Reproduction (Node, before the fix, instrumented copy of the
generator with the two guarantee assignments logged):

- Failing floors, all underlying seed 21:
  - `runSeed 20, depth 1`, `runSeed 22, depth 3`, `runSeed 23, depth 2`
  - Room types in all three:
    `[spawn, empty, structure, empty, combat, combat, hazard, empty]`
    — zero `loot` rooms, zero pickups.
- Instrumented log for all three: `OVERWRITE-sole-loot` — the typing
  pass had produced exactly ONE loot room, at `rooms[2]`.
- Mechanism: the old guarantee ran two assignments in order:
  1. `if (no loot) rooms[1].type = 'loot'` — no-op here, loot existed.
  2. `if (no structure) rooms[2].type = 'structure'` — structure was
     also absent, so this overwrote `rooms[2]`, the floor's ONLY loot
     room, with `'structure'`.
- Pickups spawn ONLY in loot rooms (`rooms.forEach: if type !== 'loot'
  return`), so zero loot rooms ⇒ zero pickups, exactly as reported.
  The `rooms[1]` guarantee alone could not survive the second
  assignment. The `placePickup` retry loop never ran — there was no
  loot room to place into.

### Fix (`game/core.js`, typing pass only)

A `forceType(t)` helper replaces the two assignments. It converts the
first room that is neither spawn nor the SOLE instance of the other
guaranteed type, and consumes no RNG. `forceType('loot')` then
`forceType('structure')`. Room count is always 6-10, so a convertible
room always exists. Grid layout, corridor carving, and the RNG stream
are untouched; only room-type labels can differ from the old code, in
the narrow case where the two old assignments interacted.

### Second defect found by the wider sweep (also fixed, minimal)

Sweeping seeds 1-200 x depths 1-3, `generateFloor` THREW on floors
with no combat rooms AND no empty rooms:

- `TypeError: Cannot read properties of undefined (reading 'x')` at
  the enemy-placement loop (`combatRooms[e % 0]` is `undefined`).
- Examples: underlying seeds 96 and 386 (e.g. `runSeed 97, depth 1`,
  room types `[spawn, loot, structure, hazard, hazard, hazard]`).
- Fix: one added fallback line — if both filters are empty, enemies
  spread across any non-spawn room. It only executes on floors that
  previously threw, so floors that already generated are untouched.
  Enemy/pickup cell overlap in fallback rooms is pre-existing
  behaviour and was deliberately NOT changed (adding an overlap
  check would alter the RNG stream of working floors).

### Tests (`game/test.js`, +1 test)

New regression test `guarantees: every floor has a loot room, a
structure room, and pickups`: pins the three exact failing
seed/depth pairs, then sweeps seeds 1-200 x depths 1-3 (600 floors)
asserting >=1 loot room, >=1 structure room, >=1 pickup, and
`coherenceCheck` ok on every floor.

```
node --test test.js → 40 pass, 0 fail (39 previous + 1 new)
```

## Part B — beta harness updated to the current layout

Verified every selector against the live DOM in headless Chromium
(probe script, before rewriting) — including modal-overlay blocking,
Menu/Bag/Log/wrench flows, stairs-panel visibility and button text,
keyboard `1`/`2`/`Escape` on stairs, and the square-grid tap math.
Stale selectors replaced, tester intent kept:

| Before (stale) | Now (current layout) |
|---|---|
| `#modal-btns` Descend/Extract | Stairs side panel `#btn-stairs-descend` / `#btn-stairs-extract` (panel visible only on stairs; `#stairs-info` text logged) |
| `[data-slot]` quickslots | Wrench use-item popup (`#btn-wrench` → "Use health cell / food / repair kit"); heal-up leg likewise |
| `#btn-rest` | Rest inside the Menu modal (`#btn-menu` → Rest); bug-hunter Rest spam loops Menu → Rest |
| `[data-move]` D-pad | 60 rapid `ArrowRight` key presses (same input path) |
| `#log` display/collapse | `#btn-log` opens the Log modal (Close returns to play); latest line checked via the `#transient-msg` overlay |
| Empty-quickslot feedback | Unheld-item refusal via wrench popup (prefers a 0-held item; falls back to full-HP health cell); metric renamed `unheld_item_gave_feedback`, opinions rule updated to match |
| Iso tap math (mobile) | Tile centre computed from live `tileOrigin`/TILE values via `__scrapDebug` (square grid, player-centred camera) |
| Tap-target set (mobile) | Current dock only: Wait, Use item, Menu, Search, Bag, Recenter, Log |

Files changed (harness only): `testers/personas.py`,
`testers/common.py` (`get_state` now also returns `repairKits`),
`testers/opinions.py` (two rules follow the renamed metrics),
`run_all.py` (docstring wording). No game code was edited for the
harness except the Part A fix in `core.js`.

### Fresh run (`./run_all.sh`, ML venv Playwright)

```
182 PASS, 2 FAIL, 2 NOTE, 0 ENV — 0 Blockers, 2 Majors
```

- Pre-overhaul baseline: 156 PASS, 2 FAIL, 2 NOTE, 0 ENV. The total
  grew because the rewritten checks added coverage (transient/log
  modal, refusal paths, panel flows); counts are not directly
  comparable check-for-check.
- Known stale-harness failures are GONE: Descend banks exactly 25%
  (carried 6 → banked 1, depth 2) PASS; Extract keeps all (banked
  1 → 19, state extracted) PASS; a pickup collected on the first
  floor PASS.
- The 2 NOTEs are the same two as baseline: unreferenced sheet
  `prop_salvage_sheet.png` (graphics-qc) and wall bumps giving no
  feedback, 28 silent attempts (casual).
- The 2 FAILs are REAL layout measurements, not harness artifacts —
  see Caveats. Nothing was waived.

Outputs: `reports/REPORT.md`, `reports/results.json`,
`reports/screenshots/{graphics-load,mobile,completionist-extracted}.png`.
Game-file snapshot identical before/after the run (no mid-flight
edits).

## Caveats (honest)

1. **Two genuine Major FAILs — small side-stack tap targets.** At
   390px the Recenter and Log buttons measure 42x28px, below the
   harness's pre-existing ~44px bar (40px measured minimum). They are
   the two stacked buttons sharing one 48px dock row
   (`#side-stack button` in `style.css`). Fixing this is a game-layout
   decision, out of Task 2 scope (no game edits except Part A) — it
   needs Skit's word, not a harness waiver.
2. **Regression sweep is bounded.** The test pins seeds 1-200 x
   depths 1-3 (600 floors). The guarantee itself is structural — it
   runs on every floor — but depths 4+ and seeds above 200 were not
   swept in the test.
3. **Rest-spam death path not exercised this run.** The bug-hunter
   did not die during Wait/Rest spam (recorded as an opinions
   abstention); the death-modal recovery path in that section ran
   untriggered, as in the baseline.
4. **Opinions remain labelled critique, never failures.** The mobile
   persona abstained on the last-log-line suggestion this run
   because the transient overlay already shows it; the bug-hunter
   abstained on unheld-item feedback because the log already
   reports it.
5. **Probe teleport artifact (not a game bug).** While probing, a
   player teleported onto the stairs and then Descend-clicked read
   back `stairs` at the new depth. Re-probing with a real keyboard
   walk to the stairs showed the correct result (`playing`, depth
   +1). The harness never teleports; all its stairs legs are
   keyboard walks.
