# Scrap Dungeon — Wide-Cell Renderer Report (2026-10-28)

Middle tier, per Skit's word 2026-10-28 03:04 PDT ("Whatever keeps
the quality decent, then shoot me some screenshots"). Sequence step
2 of 3 (tap-target fix done 2026-10-28 ~02:55 PDT; ammo/weapon
balance still open). Nothing merged, pushed, published, or
packaged. Numbers from the ammo slice are unchanged playtest
starting points, NOT agreed balance.

## Scope (middle tier)

Wired: wide consoles/servers (5), wide scrap piles (5),
`stairs_down`, `wall_corner_L`, `ladder_platform` — 13 pieces.
Still excluded, deferred to a possible later pass: doors x3,
hazard strips x2, pipe/cable runs, monitors, `exit_sign`,
lights/lamps, hazard-marked floors, vent steam/hazard tiles.
Those carry the most placement-logic and glitch risk (cut pipes,
doors over floor, baked voids over wrong backgrounds).

## Wiring

Script: `new-art/batch3/wire_wide.py` (re-runnable, idempotent,
Pillow-verified dimensions from `new-art/batch3/NOTES.md`).

- 13 files into `game/assets/wide/`, 434,623 bytes total, copied
  byte-for-byte at native size (no re-crop, no re-key, no resize).
  The `-512` square copies were NOT used.
- Separate subfolder + `wide_` key prefix is load-bearing, not
  cosmetic: 5 basenames (`scrap_pile_a`, `scrap_pile_wires`,
  `armour_broken`, `scrap_debris`, `crates_stack`) already exist
  as single-cell 256x256 square versions in `game/assets/`, used
  by the dressing-variant maps. The first run of the script
  overwrote those 5 root files; caught before any verification
  ran, root files restored by re-running `wire_batch3.py`
  (256x256 confirmed), strays removed, wide files moved to
  `assets/wide/`. No single-cell rendering changed.
- `core.js` kinds and `game.js` PLAIN keys are the `wide_`
  names; the square versions keep the bare basenames.

## core.js — placement

New floor fields, plain JSON (saves round-trip with no format
change; old saves have no wide fields and render as before):

- `floor.wideDressing`: `[{x, y, kind, span}]` — anchor + right
  neighbour. `floor.wideStairs`: `{x, y}` when the cell right of
  the stairs cell is plain floor at generation end.
- Placement runs after hazards/pickups/enemies, before the
  anchor dressing loop and the dressing fill, so cover records
  reserve cells: the covered neighbour (and the two cells below
  for stairs/ladder overhang) get `{kind: 'wide_cover',
  cover: true}` dressing records, which the grid loop skips and
  the fill/anchor passes will not overwrite.
- One wide console per structure room, one wide pile per loot
  room, ladder in the first structure room with room for its
  overhang, up to 2 corner pairs. Corner pairs: two adjacent
  wall cells with floor below both (a wall row crowning a room).
- Guards, all verified by the 180-floor sweep: both span cells
  free of pickups/enemies/hazards/dressing and not spawn/stairs;
  spacing rule (no two wide records within 2 cells horizontally
  and 1 row vertically, including the wide stairs) so tall
  bottom-anchored art and hanging top-anchored art never visibly
  collide — the sweep caught a console-below-corner collision
  and a cover-record-over-pickup case during development; both
  fixed in placement, not waived. Stairs-neighbour cover is
  conditional on the cell being free (a pickup there still draws
  over the art). All visual-only, walkable, no rule changes.
- Determinism: same seed + depth regenerates identical wide
  records (`deepEqual` in the sweep).

## game.js — rendering

- 13 `wide_` PLAIN keys. `WIDE_ART` table: span in TILE units
  (1.5–2), anchor `bottom` (consoles/piles stand on the floor,
  extend up) or `top` (stairs/ladder/corner hang down), backing
  flag true for the three opaque RGB pieces (stairs, ladder,
  corner) so baked black voids never composite over floor art.
- `drawWide`: aspect-preserving from `img.naturalWidth/
  naturalHeight`, `imageSmoothingEnabled = false`, rect-culled
  against the viewport (a 2-cell piece anchored off-screen can
  still extend on-screen).
- Wide pieces draw FIRST in the y-sorted drawables pass, so
  pickups/wrecks/enemies/player draw over them at shared cells
  and actors north of a tall piece sit behind it.
- Stairs grid cell draws floor-only when wide stairs applies AND
  the art loaded; otherwise the existing 1-cell sheet stands
  (old saves, failed loads). `wide_cover` records draw nothing.

## Verification (measured, none waived)

- `node --test`: 51/51 (49 prior + 2 new: 180-floor placement
  invariants + save/load round-trip incl. legacy-save tolerance).
  Two real placement defects found by the sweep and fixed (see
  above); the dressing-overlap test caught the third.
- `node --check` clean on `core.js` / `game.js`.
- `beta-testers/verify_wide.py` (Playwright/Chromium, BFS walk
  to cells adjacent to the art — real movement, re-planned per
  step as foes move): 13/13 wide assets HTTP 200, zero console
  errors, zero failed asset requests, desktop + mobile. Wide
  records on 2/2 sampled depth-1 floors, wide stairs on 2/2.
- Screenshots viewed (all in `beta-testers/reports/screenshots/`):
  `wide-stairs-desktop.png` (staircase spans 2 cells, shaft void
  below reads as a stairwell), `wide-console-desktop.png`
  (server rack + ladder platform read clearly),
  `wide-pile-desktop.png` (crate stack reads as one big prop),
  `wide-corner-desktop.png` (L-panel gateway crowns the wall row),
  `wide-mobile.png` (390px: HUD fits one line, stairs art visible
  at the right edge, buttons full size).
- Full harness `./run_all.sh` (2026-10-28 03:18 PDT): **338 PASS,
  0 FAIL, 3 NOTE, 0 ENV, 0 Blockers, 0 Majors** — the wide
  verification above ran green independently of it.

## Still open

- Wide-cell full tier (doors, hazard strips, pipes/cables,
  monitors, exit sign, lights/lamps) — needs its own scope call.
- Ammo/weapon balance (sequence step 3): starting ammo, crate
  value, weapon stats, reload + Armorer crafting per
  MECHANICS-PLAN. Current numbers are playtest starting points.
- The `game.js` dressing-variant maps still use the square
  versions of the 5 shared basenames for single-cell dressing —
  intended; the two uses are deliberately different files.
