# Dressing density + circuit block — Task 1 report (2026-10-27)

## Files changed

- `core.js` — dressing fill pass and `circuitBlock` in `generateFloor`; nothing else.
- `game.js` — `drawFloorTile` circuit-block override (industrial only).
- `test.js` — 4 new tests (39 total, was 35).
- New: `shots-dressing-2026-10-27/capture.py` + 5 screenshots (below), and this report.

No new art, no new sprites, no balance or rule change. Banking is
untouched (25/40/55% tiers in `core.js` were not edited), dressing is
still walkable decor, no ammo system, no vision 50% rule. No other
project was touched. Task 2 (no-loot-room fix / beta harness update)
was not started.

## What changed

### 1. Dressing density (`core.js`)

After the existing anchor placement (structure chest, loot barrel,
grates) and after pickups/enemies/hazards are placed, every room —
including the spawn room — gets a fill pass: free floor cells (grid
`'floor'`, not the spawn or stairs cell, holding no pickup, enemy,
hazard, or anchor dressing) are deterministically shuffled with the
floor rng and the first `round(candidates / 3)` per room receive
`debrisKind()` dressing only. Anchors are placed first and never
displaced. The fill uses the same seeded rng sequence as the rest of
the floor, so the same seed reproduces the same floor.

### 2. Circuit block (`core.js` + `game.js`)

`generateFloor` now returns `circuitBlock: {x, y, w, h}`, one
rectangle of 4x3 or 3x4 inside a single non-spawn room, on `'floor'`
cells only. Placement tries up to 30 rng draws, then falls back to a
deterministic scan for the first all-floor rectangle, so the block is
present even on an unlucky seed. It is stored on the floor object, so
save/load round-trips keep it (JSON copy of the floor) and old saves
without it still load (the renderer guards on a missing block).

In `game.js` `drawFloorTile`, a cell inside the block on an
`industrial` floor always draws `vision_floor_circuit`, overriding
the hash-scatter floor variants. Other themes keep their own floor
art; `neon` is already all-circuit. Rendering only — no rule.

## Tests

`node --test test.js` — **39 pass, 0 fail** (35 before + 4 new):

- dressing: every room dressed including spawn, never on actors or key cells
- dressing: minimum density per floor over seeds and depths
- circuit block: present, one rectangle, inside one non-spawn room, on floor cells
- circuit block and dressing: same seed reproduces the same floor including the block (plus save/load round-trip keeps the block)

Coherence checks still pass inside the existing suite (they run over
36 seed/depth combinations).

## Measured numbers (60 seeds x depths 1–3 = 180 floors, same seeds before/after)

Density = dressing count / `'floor'` grid cells. Before was measured
in this session on the pre-change generator; the grid/free-cell total
is identical (40,177), so the comparison is like-for-like.

| Measure | Before | After |
|---|---|---|
| Dressing / floor cells, overall | 2,090 / 40,177 = **0.052** | 13,902 / 40,177 = **0.346** |
| Per-floor ratio, min / median / max | — | **0.323 / 0.346 / 0.363** |
| Floors with dressing in the spawn room | 0 / 180 | **180 / 180** |
| Floors with a valid circuit block | — (none) | **180 / 180** |
| Dressing overlapping spawn/stairs/pickup/enemy/non-floor cell | 0 | **0** |

The after ratio sits slightly above 1/3 because the per-room fill
(`round(candidates/3)`) is measured against all floor cells while
anchor dressing (chest/barrel/grates plus the earlier sparse piles)
adds a few cells on top. The block was also checked on depths 1–12
(one seed): present on every theme (industrial, scrapyard, overgrown,
cavern, molten, frozen, toxic, neon), sizes 4x3 or 3x4 throughout.

## Screenshots (headless Chromium, ML venv Playwright, HTTP serve, zero console/page errors)

In `game/shots-dressing-2026-10-27/`:

- `01-desktop-spawn.png` (1280x800) — spawn room visibly dressed (12 dressing cells in this floor's spawn room, ratio 0.343).
- `02-desktop-moved.png` (1280x800) — after six moves; player and dressing both readable.
- `03-desktop-circuit-block-staged.png` (1280x800) — **staged camera
  position only**: the player was teleported via the existing
  `window.__scrapDebug` hook to the block centre so the block is on
  screen. No game code or rule was involved. The override was also
  verified pixel-by-pixel in a throwaway script: all 12 block cells
  sampled identical corner RGB (63,58,62), distinct from a plain
  neighbour cell (80,67,58); one scatter-circuit cell outside the
  block matched the block colour, as expected from the 1-in-5 variant.
- `04-mobile-spawn.png` (390x844) — ratio 0.350 on this floor.
- `05-mobile-moved.png` (390x844) — after three moves; player, enemies,
  and pickups remain distinguishable.

Capture script: `shots-dressing-2026-10-27/capture.py`. Density did
not obscure the player or enemies in any shot, so no density
reduction was made.

## Honest caveats

- **Dark void around rooms persists.** Floors are still irregular
  multi-room layouts with void between rooms; the player-centred
  camera shows dark space at the edges. This is pre-existing and
  untouched by this task.
- **Loot-lookalike dressing is denser too.** On industrial floors the
  renderer already varies `'debris'` dressing into the batch-2 loot
  sprites (gear, key, crate, crystal). At ~1-in-3 density there are
  more loot-looking sprites that are decor, not pickups. Real pickups
  keep their highlight rings and dressing does not; the ambiguity is
  pre-existing, amplified, not introduced here.
- **The circuit block is a patch, not a whole room.** The vision
  reference is a full room of circuit flooring; per the task spec the
  block is one 4x3/3x4 rectangle inside one room. The rest of an
  industrial floor still scatters circuit tiles by hash.
- **Block is data on all themes, visible as a block only on
  industrial.** On scrapyard/overgrown/molten/frozen/toxic the block
  exists on the floor object but draws the theme's own floor art.
- **Beta harness not re-run.** It is still stale against the current
  layout (Task 2). Nothing in this task depended on it; verification
  here is the Node suite plus the Playwright capture above.
