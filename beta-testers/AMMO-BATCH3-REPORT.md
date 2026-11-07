# Scrap Dungeon — Ammo + Batch 3 Report (2026-10-27)

Two workstreams in one editing pass (same files), per Skit's word
2026-10-27 12:12 PDT (ammo function + item/weapon bar, Pixel
Dungeon style) and his 12:16 PDT tap (wire Batch 3, single-cell
tiles first). No wide-cell renderer, no Recenter/Log resize, no
balance decisions beyond playtest starting points. Nothing
merged, pushed, published, or packaged.

## Part A — Batch 3 single-cell wiring

Script: `new-art/batch3/wire_batch3.py` (re-runnable, idempotent,
verifies PNG format/size with Pillow; staging originals untouched).

- 75 files into `game/assets/`, 3,852,811 bytes total: 43
  full-bleed 256x256 tiles copied byte-for-byte, 31 keyed props
  (staging `-512` centred copies resized to 256x256 LANCZOS,
  suffix dropped), plus `sprites/items/item_ammo_crate_sheet.png`
  (822x136, 8-cell sheet geometry).
- Rendering (`game/game.js`): `SHEETS.pickup_ammo`; 74 `batch3_*`
  PLAIN keys; industrial floorVariants 15 / wallVariants 28;
  scrapyard 8 / 9; toxic + `batch3_s2_floor_sludge`; neon +
  circuit a/b/c; circuitBlock hash-picks among 4 circuit keys;
  `DRESSING_VARIANTS` (grate 8, barrel 12, pile_scrap 5,
  console 16) picked by `hash2`; structure rooms place one
  `console` dressing.
- Excluded (single-cell pick): doors x3, `wall_corner_L`,
  `stairs_down`, `ladder_platform`, hazard strips x2,
  `console_triple`, `console_wide_2/3`, `server_pair`,
  `server_top_pair`, monitors, pipe/cable runs, `exit_sign`,
  lights/lamps, hazard-marked floors, vent steam/hazard tiles.
  All need a wide-cell renderer that does not exist yet.
- HUD fix found by measurement, not assumed: the Ammo segment
  pushed the 390px HUD 6px over (scrollWidth 384 vs clientWidth
  378, Power clipped). Fix: HUD gap 4px -> 2px at <=520px.
  Re-measured: scrollWidth 378 = clientWidth, Power right edge
  366 < HUD right 384.

## Part B — Ammo + quickslot bar

Core (`game/core.js`): `WEAPONS.scrapBlaster {dmg 10, dmgVar 4,
range 5, ammoPerShot 1}`, `STARTING_AMMO 12`, `AMMO_CRATE_VALUE 6`.
`killEnemy` extracted verbatim from `playerAction` and shared by
melee and `fireWeapon` (same drop/component/wreck/pickup/log
order). `fireWeapon` refuses free with `'out of ammo'`, `'no
target in line of fire'`, `'not playing'`; on a shot it reuses
the PD acc/evasion rolls with weapon damage, no surprise bonus,
wakes sleeping targets, costs 1 time unit. Ammo in `newRun`,
`inventoryOf`, save/load (old saves default 12 / scrapBlaster),
wreck record + recovery, and one `placePickup(r, 'ammo', ...)`
per loot room. UI (`index.html`, `style.css`, `game.js`): HUD
`Ammo N` segment; `#quickbar` above the action row (FIRE + ammo
count, +HP, FOOD, KIT — 56x56 desktop, 48x48 at <=520px, all
clearing the 44px bar); `F` key; `doFire` mirroring `doMove`;
player HP bar above the player tile; Bag modal shows Ammo +
weapon; `wreckStatusText` appends ammo.

Numbers are playtest starting points only — NOT agreed balance.
No magazine, no weapon switching, no reload action.

## Part C — Verification (all measured, none waived)

Unit tests (`game/test.js`, 9 new): start state; fire hits first
in line only + spends ammo + costs time; wake without surprise
bonus; kill drops salvage + counts; four free refusals (no
target / wall-blocked / out of range / empty); crates in loot
rooms + pickup restores; save/load + old-save defaults; wreck
recovery; console dressing on floor cells in structure rooms.
Result: **49/49 pass** (`node --test`, 3.6s), `node --check`
clean on core.js/game.js.

Focused browser check (`beta-testers/verify_ammo_batch3.py`,
Playwright/Chromium): fresh runs start 12 ammo / scrapBlaster
with HUD + quickbar agreeing; crates >= 1 and consoles >= 1 per
depth-1 floor; walked to a firing position and fired in the
real game — ammo 12 -> 11, log `Drone wakes up!` / `You misses
Drone.`; HUD fit at 390px; all 4 quickbar slots 48x48; mobile
FIRE tap logs a refusal without error; zero console errors,
zero failed asset requests. **All checks passed.**

Full beta harness (`beta-testers/run_all.sh`): **337 PASS, 2
FAIL, 2 NOTE, 0 ENV, 0 Blockers.** The 2 FAILs are the known
Recenter/Log 42x28px tap targets from Task 2 — unchanged,
awaiting Skit's word, not waived. Harness now also measures
the 4 quickbar slots (all 48x48 PASS) and HUD fit (PASS,
scrollWidth=378 clientWidth=378). Screenshots:
`reports/screenshots/ammo-batch3-desktop.png`,
`ammo-batch3-mobile.png`, `ammo-batch3-fire.png`.

Open (unchanged, awaiting his pick): Novaboard choice;
Recenter/Log tap-target fix; Batch 3 wide-cell renderer scope;
ammo/weapon balance (starting ammo, crate value, weapon stats,
reload + Armorer crafting per MECHANICS-PLAN). Nit noticed, not
fixed: shared combat log says "You misses X" (pre-existing in
`resolveAttack`).
