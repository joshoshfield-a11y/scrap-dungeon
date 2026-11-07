# SCRAP DUNGEON — Phase 3: Hub and Crafting (+ Phase 2 + Phase 1 + Pixel Dungeon rebuild)

A playable web game. No build step, no server, no external
dependencies. Open `index.html` in any modern browser (double-click
it, or drag it into a browser window) and play.

## How to open it

```
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

Everything the game needs is in this folder: `core.js` (rules),
`game.js` (rendering + input), `index.html`, `style.css`, and
`assets/` (the sprite sheets actually used, copied — the source
folders are untouched). If you move the folder, move it whole so
the relative `assets/` paths keep working.

## Controls

- Arrow keys / WASD — move (4 directions)
- Q / E / Z / C — diagonals (NW / NE / SW / SE)
- Space or `.` — wait (costs 1 time unit)
- Bump into an enemy to attack it
- Tap a distant tile to walk there (BFS path, one time action per
  step, auto-stops on danger — see below); tap yourself to wait
- Search button — reveal hidden traps within radius 4 (costs 1
  time unit)
- AttackIndicator — when an enemy is adjacent, a banner above the
  action bar shows its name + HP; tapping it attacks (lowest HP
  first if several are adjacent)
- 6 quickslots, assignable in the Bag (Health / Food); tapping a
  slot uses that item. Empty slots show Empty, not fake items
- On-screen pad (bottom right of the sidebar) does the same, for
  mouse/touch play
- Stairs menu: `1` Descend, `2` Extract, `Esc` Cancel
- Death / extracted screens: `R` (or Enter) to restart

## What Phase 1 includes

- **Seeded procedural floors** per `../MAPS.md`: seed = run_seed
  XOR depth, 6–10 non-overlapping rooms (4×4 to 8×6), typed
  rooms, spanning-tree corridors + 1–2 loops, doors where
  corridors meet rooms, walls on every floor-touching cell,
  spawn in the first room, stairs-down in the farthest room.
  Every generated floor is checked at generation time:
  flood-fill reachability, stairs reachable, enemies never in
  or adjacent to the spawn room, hazards never on spawn, and
  no long loot-less dead-end corridor.
- **Pixel Dungeon time system** per `../MECHANICS-PLAN.md`
  §3: the world is frozen while you think. Move = 1 time
  unit. Every actor has a next-action time; after you spend
  time, all actors whose time has arrived act in time order
  through one central scheduler. Drone (interval 7) and
  raider (8) act more often than you (10); brute (14) acts
  less often. One scheduler, no per-enemy turn loops.
- **Player**: the scout mech, 8-direction facing, HP 100.
- **Enemies (Slice 1 only)**: raider (chaser, fast melee),
  drone (swarmer, weak, fast), brute (bruiser, slow, armored,
  high HP). Shared AI: idle/patrol, pursue in sight range,
  attack when adjacent, retreat at low HP (raider/drone only).
- **Combat**: accuracy rolls, armor reduction, damage numbers
  in the log and as floating text. A killed enemy leaves its
  wreck sprite on its tile (the real `*_destroyed` sheet).
- **Salvage**: loot-room pickups add carried salvage; kills
  now drop a salvage pickup tile you must walk over to
  collect (Phase 2, below — Phase 1 auto-credit is gone).
  Stepping on stairs offers Descend (bank exactly
  25% of carried, floored to an integer, go one depth deeper),
  Extract (end the run, keep 100% of carried), or Cancel.
- **Death**: game-over screen with depth reached, banked vs
  lost salvage, and kills. Restart starts a fresh run with a
  new random seed.
- **Sprites**: the real `_sheet.png` files, 8 directions in
  order S, SW, W, NW, N, NE, E, SE, drawn upright on isometric
  diamond tiles. If a sheet ever fails to load, that actor
  falls back to a coloured marker instead of breaking the game.

## What this build deliberately does NOT include

No skill trees, no factions, no authored quest chains, no
procedural contracts, no vehicles in gameplay, no telegraphed
heavy attacks (Phase 4), no weapons beyond the scout's bump
attack, no later enemies (turret, flyer, shielder, sniper,
bomber, boss — they arrive in depth order in later phases).
Hub stations and crafting ARE in now (Phase 3, below); the
Radio Operator is rumors only, deliberately, because quests
and contracts are Phase 4. Fog of war and identification
are not — those are later work, not silently dropped. Ranged
targeting arrived
2026-10-27 as one weapon (the scrap blaster) plus an ammo pool;
see the Ammo + Batch 3 slice at the end of this file.

## Phase 3 — Hub and Crafting (2026-10-26)

Per `../MECHANICS-PLAN.md` §9, Phase 3 only. No Phase 4
systems and no Content Wave 1 (no new enemies or weapons)
were started. All hub figures below are playtest starting
points, not final balance. NPCs are shown by role title only
(The Mechanic, The Salvager, and so on); the draft names in
the plan are placeholders, NOT canon, and appear nowhere in
the game.

- **Where the hub lives**: the hub summary after Extract is
  now the full hub screen, with all six stations. It also
  opens from the Hub button in the action bar whenever no
  run is in progress (dead or extracted), and from the Hub
  button on the death screen. Mid-run the Hub button refuses
  with a log line — the hub is for between expeditions.
  Every station does something real; there are no decorative
  buttons. Hub spending persists in the same
  `scrapdungeon.hub.v1` save as Phase 2, and New Expedition
  never wipes hub state.
- **The Mechanic (chassis upgrades)**: +10 max HP per tier,
  5 tiers max (base 100 → 150). Costs rise per tier: 40, 80,
  160, 300, 500 banked salvage. Buying deducts banked
  salvage, persists in hub state, and the next run starts
  at the new max HP (`core.buyChassisTier`).
- **The Salvager (exchange)**: 1 stockpiled component → 8
  banked salvage. Reverse: 15 banked salvage → 1 component
  (deliberately worse). Both directions move the numbers
  immediately and persist (`core.convertComponentsToSalvage`,
  `core.convertSalvageToComponents`).
- **The Researcher (Codex + banking tiers)**: the Codex
  viewer lists every entry found. Banking tiers upgrade
  Descend's banked fraction: 25% → 40% → 55%. The 40% tier
  costs 60 banked salvage and requires 1 Codex entry; the
  55% tier costs 150 and requires 3. Both requirements are
  enforced and shown when locked. The new rate is what
  Descend actually uses on the next run, and the stairs
  menu shows the current rate (`core.buyBankingTier`,
  `core.bankingRateFor`). Hub growth follows recovered tech,
  not just salvage spent, per the plan.
- **The Armorer (crafting)**: data-driven recipes in
  `core.RECIPES` (ingredients → output, all in hub banked
  salvage and/or stockpiled components): health cell = 1
  component + 5 salvage; food = 4 salvage; repair kit = 2
  components + 10 salvage. Crafting deducts ingredients
  and adds to the hub stockpile. Recipes fail honestly
  when ingredients are short, naming the shortfall
  (e.g. "needs 2 components, have 1"). A repair kit
  restores 50 HP (vs a health cell's 25), costs one time
  unit, is refused at full HP or with none held, and is
  usable from a quickslot like health cells (assign
  "Repair kit" in the Bag; its icon is the project's own
  toolkit sheet, newly copied into `assets/`).
- **Starting load**: crafted stockpile loads into the next
  run capped at 2 health cells, 2 food, and 1 repair kit;
  the rest stays in the hub for later expeditions. A fresh
  hub has an empty stockpile, so this is a no-op for
  existing saves until something is crafted.
- **The Scout (threat intel)**: the next floor's enemy
  composition (types and counts) counted from the SAME
  generator that builds that floor
  (`core.scoutPreview(runSeed, depth)`), so the preview is
  exact, not invented. On the hub before a new expedition
  it previews depth 1 — and it is exact because the
  expedition seed is fixed when the hub screen opens and
  reused by New Expedition, not rerolled at start. On load
  with a resumable run it previews that run's next depth.
- **The Radio Operator (rumors only)**: a rumors board
  generated procedurally from real hub state — deepest
  depth reached, Codex count, wreck status, vault totals
  (`core.rumors`). No quest language, no "go fetch", no
  contracts: those are Phase 4 and are not smuggled in as
  rumors. Deepest depth is tracked in hub state (updated on
  descend, extract, and death).
- **Death wrecks, extended**: a wreck now also holds
  carried repair kits, and recovering it returns them.
  Everything else about wrecks is unchanged from Phase 2.
- **Tests changed by a Phase 3 rule itself**: none of the
  27 Phase 1 / rebuild / Phase 2 tests were weakened. The
  Descend banking fraction is now tier-dependent, but a
  fresh hub is tier 0 (25%), so the old 25% tests still
  pass unchanged, and a no-hub run still descends at 25%.
  Eight new Phase 3 tests were added (35 total), plus a
  headless-browser smoke check of the hub UI itself: all
  six stations render, the Hub button refuses mid-run,
  buying a chassis tier re-renders at tier 1, and crafting
  a health cell stocks it — zero console errors.
- **New asset**: `assets/item_toolkit_sheet.png` (the
  project's own toolkit sheet) for the repair-kit quickslot
  icon. Total assets: 37 PNGs.

## Phase 2 — Expedition Economy (2026-10-26)

Per `../MECHANICS-PLAN.md` §9, Phase 2 only. No Phase 3
systems (NPCs, crafting, repairs, upgrades) and no Content
Wave 1 (no new enemies or weapons) were started.

- **Inventory (Bag)**: the Bag now shows the full inventory,
  not a bare counter: health cells, food, carried salvage,
  salvage components, data chips found this run, banked
  salvage, stockpiled hub components, Codex entries, wreck
  status, depth, HP, kills, actions/power, seed, quickslots.
  `core.inventoryOf(state)` is the single view; pickups write
  these fields, item uses read them.
- **Salvage drops**: kills no longer auto-credit. A kill drops
  a salvage pickup tile on the enemy's cell (the real
  `prop_salvage` sheet) that the player must walk over to
  collect; if a salvage pickup is already there, the drop
  merges into it. Amounts vary by type (brute most, drone
  least, per `ENEMY_TYPES.salvageMin/Max`); components ride
  with the drop (brute 2, raider 1, drone 0). Loot-room
  salvage pickups are unchanged. A drop left behind on a
  floor is lost when you descend — that is the risk, not a
  bug.
- **Banking persistence (Phase 1 bug fixed)**: banked salvage
  is hub state and survives Restart and death. Restart is now
  New Expedition: a fresh run that keeps the hub. Descend
  still banks exactly 25% (floored); Extract keeps 100% of
  carried. A run created without a hub (Node tests only)
  behaves exactly as Phase 1 did.
- **Death wrecks (Decision 1)**: on death, the mech becomes a
  wreck holding the unbanked carried salvage and carried
  items (health cells, food, components) — never banked
  salvage, never Codex entries. Exactly one wreck exists at
  a time: dying again before recovery destroys the old wreck
  and replaces it with the new one. On a later expedition,
  the wreck tile (scout destroyed sheet, cyan ring) appears
  on a floor at the depth where the player died — on the
  first floor if that was depth 1, otherwise when the player
  descends to that depth again. Placement is a walkable,
  flood-fill-reachable cell, never the spawn tile, never
  stairs, never an enemy/pickup/hazard/dressing cell.
  Stepping on it recovers everything and clears the wreck.
  Descending past an unrecovered wreck on an earlier floor
  does not destroy it (there is no way back up in a run); it
  stays in the hub and will appear again on a later
  expedition at its depth.
- **Extraction to hub**: Extract ends the run and shows a hub
  summary screen, not a vanishing modal: banked total,
  extracted salvage secured, stockpiled components, kills,
  wreck status, and the Codex list, with New Expedition and
  (when a saved run exists) Continue. Descend continues the
  run as before.
- **Codex**: one data chip pickup per loot room (real
  `item_data_chip` sheet, copied into `assets/`). Picking one
  up records its Codex entry — named by depth and theme,
  e.g. "Depth 1 industrial salvage signature" — in hub state
  the moment it is found, even if the run is then lost.
  Duplicate entries on one floor are deduped; later chips
  still count as run inventory. The Codex list is shown in
  the hub summary and in the Bag.
- **Save/load, run/hub split**: two versioned localStorage
  keys — `scrapdungeon.hub.v1` (banked, components, Codex,
  wreck, last extracted) and `scrapdungeon.run.v1` (player
  HP/position, floor, carried inventory, clock, actions,
  depth, seed, enemies, player wreck). Autosave after every
  player action (cheap JSON snapshot, via `refreshHud`);
  also on stairs/death/extract through the same hook. On
  death/extract the run save is cleared (it is not
  resumable); the hub save is what survives. On load, if a
  resumable run save exists (playing or on the stairs
  choice), the hub screen offers Continue (resumes the exact
  run) and New Expedition (clears run state only, keeps hub
  state). New Expedition never wipes hub state.
- **Everything from the PD rebuild is intact**: tap-
  pathfinding with auto-stop, AttackIndicator, accuracy/
  evasion + surprise, sleeping enemies, Search + hidden
  traps, 6 assignable quickslots, pressure clock, real
  sprite rendering, walk_a/walk_b/attack/damaged sheets.
  The walk auto-stop snapshot now also breaks on component/
  data-chip changes and on wreck recovery.
- **New asset**: `assets/mech_light_scout_destroyed_sheet.png`
  (previously deliberately not copied — player death was a
  modal; now the scout wreck is a map tile, so it is used).
  Component pickups reuse the salvage sheet; their fallback
  marker is an amber "C", data-chip fallback a cyan diamond.

## Phase 2 deviations and honest notes

- **RNG on load is re-seeded, not continued**: the mulberry32
  closure state is not serializable, so a loaded run re-seeds
  from runSeed + action count. Future random rolls therefore
  differ from an uninterrupted run, but stay deterministic
  for that load. HP, position, carried inventory, depth,
  clock, floor, and enemies are restored exactly.
- **Hub components are a stockpile, not a currency yet**:
  Extract moves carried components into the hub. Nothing
  spends them until Phase 3 crafting — that is the next
  phase's job, not a missing Phase 2 feature.
- **Wreck depth rule**: a wreck is recovered by re-descending
  to its depth, not by finding it on depth 1 regardless of
  where you died. This is the literal MECHANICS-PLAN.md rule
  ("a wreck on the floor where you died"); the depth-1
  shortcut would have made deep deaths trivially recoverable.
- **Tests changed by a Phase 2 rule itself**: none of the 18
  Phase 1 / rebuild tests were weakened. The kill behaviour
  changed (drop tile instead of auto-credit), but no existing
  test asserted auto-credit, so all 18 still pass unchanged.
  Nine new Phase 2 tests were added (27 total).

## Tests

```sh
node --test test.js
```

Tests prove: (a) generated floors pass all coherence checks
across 36 seed/depth combinations, and the same seed reproduces
the same floor; (b) the scheduler gives faster actors more
actions per player time; (c) bump combat reduces enemy HP and
adjacent enemies reduce player HP; (d) descend banks exactly
25% and extract keeps 100%; (e) death triggers game over and
restart resets state. Also covered: distinct per-type stats,
doors exist, wait costs time. Rebuild tests add: (f) BFS
pathfinding reaches the stairs over walkable tiles only and
returns null for a void target; (g) AttackIndicator logic
(adjacent enemies, lowest HP first, none when empty);
(h) accuracy/evasion rolls — a high-evasion defender (25)
dodges far more than a low-evasion one (2) over 500 seeded
rolls; (i) surprise attacks auto-hit at 1.5x and wake the
enemy; (j) sleeping enemies stay put until in sight + LOS,
and waking spends their activation; (k) Search reveals hidden
traps within radius 4 and not beyond, and generated floors mix
hidden and visible traps; (l) quickslot assignment + use for
health and food, empty slots refused; (m) the pressure clock
warns at 80 actions, starves at 120, drains 1 HP per 5 further
actions, and food restores power.

## Known notes / deviations

- **Sheet transparency**: the `_sheet.png` files already carry
  alpha 0 on their black cell backgrounds. The renderer slices
  cells with `drawImage` only and deliberately never calls
  `getImageData`, which browsers block (canvas tainting) when
  `index.html` is opened via `file://`. An earlier version did
  black-keying in the browser and broke under `file://`; this
  was caught by a headless-browser screenshot check and fixed.
- **Hazards**: hazards are spike traps in hazard rooms only.
  They are walkable (damage once on entry, then inert), so
  they cannot block the only path to the stairs; the
  reachability check is still run after placement. Since the
  rebuild, about half of them are hidden (plain-floor look,
  still trigger) and Search reveals them within radius 4.
  Lava and water-slow tiles are later work, not silently
  dropped: they are in MAPS.md for later phases.
- **Cancel on stairs**: stepping onto the stairs freezes the
  world for the choice; cancelling pays the 1-unit cost of
  that step, so it is not a free move.
- **Depth themes**: depth 1 is industrial; deeper floors cycle
  scrapyard (2–3), overgrown (4–5), cavern (6+), per MAPS.md.
  Superseded by the visual overhaul below: every depth now
  renders its own biome floor/wall/dressing.
- **Sprite size**: sheet sprite content is small inside its
  96px cell, so actors are drawn at 92–96px on 64×32 tiles.
  They overlap neighbouring tiles slightly, which is correct
  for three-quarter upright sprites.

## Pixel Dungeon rebuild — Phase 1: mechanics + layout (2026-10-26)

Mechanics/layout inspiration only. No Pixel Dungeon code, art,
or text was copied; all code and art here are original to
Scrap Dungeon. Salvage banking, stairs descend/extract,
permadeath, and the time scheduler are unchanged from Phase 1.

- **Tap-pathfinding**: tapping a distant tile runs a BFS path
  (8 directions, walkable tiles only, never through a wall or
  an enemy tile) and walks it step by step, one time action
  per step through the existing scheduler. The walk stops on:
  a NEW enemy becoming visible (within sight + line of sight),
  any enemy becoming adjacent, picking up an item, a trap
  triggering, taking damage, reaching stairs, death, or
  reaching the target. Tapping a distant enemy walks to the
  nearest adjacent tile and stops — it never auto-attacks
  from a distance. Tapping an adjacent tile still moves or
  attacks; tapping yourself still waits.
- **AttackIndicator**: when an adjacent enemy exists, a banner
  above the action bar shows its name + HP; tapping it attacks
  that enemy (lowest HP first if several are adjacent). It
  hides when no adjacent enemy exists.
- **Accuracy/evasion combat**: the old flat accuracy % is
  gone. Attacker rolls 0..accuracy, defender rolls 0..evasion,
  hit iff the attacker's roll >= the defender's. Scout:
  accuracy 14, evasion 8. Raider: accuracy 12, evasion 6.
  Drone: accuracy 10, evasion 14 (hard to hit). Brute:
  accuracy 11, evasion 3 (easy to hit). Armor is still flat
  damage reduction after a hit, minimum 1 damage on a hit.
  Existing tests that forced hits were updated to the new
  model (attacker accuracy 100, defender evasion 0) — the
  combat code was not weakened to fit the tests.
- **Sleeping + surprise attacks**: enemies start unaware
  (SLEEPING, shown with a small `z` above them). A sleeping
  enemy does nothing until the player is within its sight +
  line of sight on its own activation, or until damaged.
  Waking spends that activation (no move, no attack), which
  is what leaves a window for a surprise attack: attacking an
  unaware enemy auto-hits at 1.5x damage after armor, rounded
  (e.g. 10 raw -> 15), and wakes it. Awake enemies use the
  existing patrol/pursue/attack/retreat states.
- **Search + hidden traps**: at generation, about half of spike
  traps are hidden — they render as plain floor, are not shown
  as hazards, and still trigger on step. The Search button
  (1 time unit) reveals hidden traps within Chebyshev radius
  4 of the player. Visible traps stay visible.
- **Six assignable quickslots**: the item bar is now 6 slots.
  Defaults: slot 1 = Health, slot 2 = Food, the rest Empty.
  The Bag lists held items and lets the player assign Health
  or Food to any slot, or clear a slot. Tapping a slot uses
  that item. Empty slots are refused with a log line, not
  filled with fake items. No locked-for-later slots remain:
  every slot is assignable to an item type that exists now.
- **Pressure clock (Pixel Dungeon hunger, adapted)**: PD's
  300/450-turn hunger would never fire on these small floors,
  so the numbers are adapted and documented as adapted:
  after **80 player actions** the player is Low Power (warning
  in log + HUD), after **120 actions** Starving Power drains
  **1 HP per 5 further actions**. Only successful player
  actions count (moves, attacks, waits, searches, item uses).
  Food pickups (1 per loot room, like health cells) restore
  **40 actions** of power (net 39 after the use itself costs
  1 action) and are a usable quickslot item. This is the clock
  that stops infinite resting/exploring. The action count
  carries across depths within a run (like PD hunger across
  floors) and resets on Restart.
- **Layout**: PD shape kept — status bar on top (HP bar,
  depth, carried/banked, clock, power state, seed), map
  centre, toolbar at bottom (Wait, Search, Rest, Bag, Log) +
  6 quickslots + D-pad. Mobile-first stays: large tap
  targets, sticky bottom dock, log collapsible on phones,
  double-tap zoom disabled, desktop (900px+) side-by-side.

## Pixel Dungeon rebuild — sprites pass (2026-10-26; not to be confused with Expedition Economy Phase 2 above)

Every remaining coloured-marker placeholder in rendering is
replaced with a real sheet from this project's own library.
Only `_sheet.png` files actually used were copied into
`assets/`; source folders are untouched; no `.glb`/`.pxl`.

- Walls: `tile_metal_wall_sheet.png` (industrial depth) —
  drawn instead of the old raised block. Note: the task brief
  listed these under `sprites/mechs/`; the files actually live
  in `sprites/tiles/` — that is where they were copied from.
- Door, chest, barrel, spike trap (visible), debris, grate:
  `tile_door_sheet.png`, `tile_chest_sheet.png`,
  `tile_barrel_sheet.png`, `tile_spike_trap_sheet.png`,
  `tile_debris_sheet.png`, `tile_grate_sheet.png` — all from
  `sprites/tiles/`. Chest/barrel/debris/grate are placed as
  walkable dressing at generation: one chest + one debris per
  structure room, one barrel per loot room, one grate on a
  room floor. Dressing never blocks movement and is drawn
  under actors.
- Pickups: salvage = `sprites/props/prop_salvage_sheet.png`,
  health = `sprites/props/prop_health_cell_sheet.png`, food =
  `sprites/items/item_food_sheet.png` — drawn instead of the
  old `$` / `+` markers.
- Quickslot icons: the same item sprite crops (cell 0 of each
  sheet) painted into the slot buttons for health and food.
- Actor and wreck sheets unchanged (see Animation below).
- **Floors stay as coloured diamonds**: no floor sprite exists
  in the library, so none was invented. Superseded by the
  visual overhaul below: floor textures are now image-
  generated tiles (see "Visual overhaul" section).
- **Coloured-marker fallback remains ONLY for load failure**:
  if a sheet image fails to load, that tile/actor falls back
  to the old marker instead of breaking the game.
- Honest note on wreck sheets: in the source `sprites/anim/`
  library, the raider, brute, and drone `*_destroyed_sheet.png`
  files are byte-identical (a generic wreck-pile template), so
  those three wrecks render identically in-game. The scout's
  destroyed sheet is different. This is the source library's
  content, not a rendering bug, and it was not papered over
  with invented per-enemy wreck art.

## Animation sheets in use (2026-10-26)

The `sprites/anim/` pose sheets are wired into rendering for
the player and all three Slice 1 enemies — not just the rest
sheets. Rest sheets remain the idle fallback.

- `*_walk_a_sheet.png` / `*_walk_b_sheet.png`: alternate on
  each movement step (player and enemies, tracked per actor).
- `*_attack_sheet.png`: shown on a bump attack (player and
  enemies that attack the player).
- `*_damaged_sheet.png`: shown briefly (~300 ms) when an actor
  takes damage.
- `*_destroyed_sheet.png`: wrecks, already in use before this
  rebuild. The scout's destroyed sheet is NOT copied into
  `assets/` because player death is a modal, not a wreck on
  the map — only sheets actually used were copied.
- Poses expire by time (~320 ms walk, ~350 ms attack, ~300 ms
  damaged) and fall back to rest; the render loop runs every
  animation frame, so the expiry is visible in-game.
- Verified live in a headless browser (see Tests): movement
  alternates walk_a/walk_b, attack shows the attack pose, and
  poses expire back to rest. A debug hook,
  `window.__scrapDebug` (`getState()` + `pose(id)`), exists
  for that verification; it has no UI effect.
- Honest caveat carried over from the animation build: walk_b
  and the drone's bob are 1-voxel-scale differences — they
  read in alternation, not standalone. That is unchanged.

## Mobile-first (2026-10-26, updated by the rebuild)
Touch is the primary input: tap an adjacent tile to move/attack,
tap a farther tile to walk there (BFS, auto-stops on danger),
tap yourself to wait. One tap = one time action for adjacent
actions; a walk is one time action per step. The D-pad is sticky
at the bottom of the screen with 56px tap targets, the log is
collapsible on phones, double-tap zoom is disabled, and desktop
(900px+) restores the side-by-side layout. Keyboard still works
as before.

## Pixel-Dungeon-inspired UI (2026-10-26, superseded by the rebuild)
The earlier layout-shape pass (status bar on top, map centre,
bottom dock, 4-slot quickslot bar, Wait / Rest / Bag / Log) is
superseded by the rebuild above: 6 assignable quickslots, a
Search button, an AttackIndicator, and a power state in the
status bar. Rest still waits until full HP, an enemy gets
within 6 tiles, or 50 waits, whichever comes first.

## Visual overhaul + generated tiles + biomes (2026-10-26/27)

Look and layout follow the user's gameplay-vision screenshots
(study reference only — no art was copied, traced, or
reproduced from them, and no new game system was invented).
Rendering only: the logic grid, coordinates, movement,
pathfinding, line of sight, and every rule, cost, rate, and
balance number are unchanged, and `test.js` is untouched
(35/35, see Tests).

- **Square top-down grid**: each cell is now a 64px square
  tile with actors drawn upright on it. The old isometric
  diamonds and the `iso()` / `drawDiamond` code are gone.
  Tap/click mapping is the cell square containing the click
  (camera centred on the player); no iso-inverse math remains.
- **Top HUD bar**: one dark bar — LEVEL (depth), turn
  indicator (PLAYER TURN / STAIRS / DESTROYED / EXTRACTED),
  heart + HP + HP bar, gear + carried salvage, Banked,
  Power state, Clock, Seed (small). Honest deviation: the
  scheduler resolves enemies synchronously after the player's
  action, so the bar shows PLAYER TURN while awaiting input;
  there is no visible ENEMY TURN phase, and none was faked.
- **Ammo substitution**: the vision shows a bullets counter
  (12/15). Scrap Dungeon had no ammo system then and none was
  invented for that pass. (Superseded 2026-10-27: a real ammo
  system now exists — see the Ammo + Batch 3 slice at the end
  of this file.) The second resource counter in our bar was
  Power
  (the pressure clock: OK / Low / Starving) alongside Banked
  salvage — the game's real second resource, not ammunition.
- **Bottom icon bar**: the text action buttons are replaced
  with 7 large icon buttons — Wait (footstep), Search (hand),
  Rest (sleep), wrench (use repair kit first, else a health
  cell, else a log refusal — no new item), Bag (backpack),
  Hub (gear), Log (list) — plus the 6 assignable quickslots
  and the D-pad, all in a sticky dock with >=44px targets
  (56px rows). Log stays reachable via its icon button.
- **Stairs panel**: when the player steps on stairs, a panel
  on the right side offers BANK <real tier>% & DESCEND and
  EXTRACT (KEEP ALL), plus Cancel. The tier is the game's
  real banking rate (25% to start, 40% / 55% via the
  Researcher in the hub) — NOT the vision's 50%. Cancel
  still costs the step's time, as before. The old centred
  stairs modal now only opens this panel; all call sites
  (move, keyboard, hub Continue) still work.
- **Denser, scrappier floors**: dressing density went up at
  generation (visual only, walkable, never blocks): structure
  rooms get chest + 2 debris, loot rooms barrel + debris,
  combat/empty rooms 1 debris each, 2 grates per floor.
  Dressing is drawn from real sheets / generated tiles, never
  coloured markers.
- **Loot visibility**: pickups are drawn at 52px (up from
  before) with a subtle highlight ring — salvage, health,
  food, data chip, and component each with their own sheet
  icon. No new item types: the vision's keys/gems/syringes
  are its loot, ours are salvage/health/food/chips/components.
- **Actor markers**: green outline on the player, red outline
  on adjacent/targeted enemies, AttackIndicator banner,
  sleeping `z` marker, and walk_a/walk_b/attack/damaged sheets
  all unchanged.

### Image-generated tiles (new in this pass)

Generated from text-only style descriptions in the vision's
pixel style (dense scrap, rusty brown floors, dark
circuit-teal tiles, scrap-pile walls) — similar in style and
mood, NOT copies or traces of the vision images. No text or
UI elements are baked into any tile. Sources live in
`../gen-tiles/`; the game draws only the 256x256 RGBA crops
in `assets/` (single-image tiles loaded whole, NOT through
the 8-cell sheet slicer):

- Rusty floor sheet (1600x1600, itself a 3x3 plate grid):
  `gen_floor_rusty_a.png` (top-left plate),
  `gen_floor_rusty_b.png` (bottom-right plate, darker).
- Circuit floor (centre crop): `gen_floor_circuit.png`.
- Scrap wall (whole image): `gen_wall_scrap.png`.
- Scrap pile (dark background keyed to transparent):
  `gen_pile_scrap.png`.
- Four biome tile sets, each generated as one 2x2 panel image
  (floor / wall / pile / detail) and cropped the same way:
  overgrown, molten, frozen, toxic — 16 crops named
  `gen_<biome>_floor|wall|pile|detail.png`.
- Molten detail note: the first background key (threshold 34)
  destroyed the slag heap — its near-black rocks fell inside
  the threshold, leaving only ember and specks. Re-keyed at
  threshold 14; the heap is preserved in the shipped crop.
- Floor textures are drawn full-tile with a deterministic
  per-cell flip (hash of x, y, depth, 4 variants) so one
  texture does not read as a repeating stamp. If a texture
  fails to load, the old drawn rusty/circuit pattern is the
  fallback — never a flat coloured diamond.

### Pre-existing project sheets (unchanged, reused)

All mech/item/wall/door/chest/barrel/spike/debris/grate/
stairs sheets are the project's own library sheets already in
`assets/` (see earlier sections). Two reuse cases are called
out honestly: industrial and neon walls use the project
metal-wall sheet (`tile_metal_wall_sheet.png` — small dark
blocks with a cyan slit), and cavern walls use the project
stone-wall sheet (`tile_stone_wall_sheet.png`). Neon and
cavern have no biome-exclusive generated art; they differ by
combination (see table).

### Biomes (visual/theme layer only)

Depth-to-biome mapping (exact; `core.js` `themeForDepth`,
depths 1-6 unchanged from MAPS.md, depths 7-10 new, 11+ cycles
the four new ones):

| Depth | Biome | Floor | Wall | Dressing |
| 1 | industrial | rusty_a (generated) | metal-wall sheet | debris (sheet) |
| 2-3 | scrapyard | rusty_b (generated) | scrap wall (generated) | scrap pile (generated) |
| 4-5 | overgrown | overgrown floor (generated) | overgrown wall (generated) | overgrown pile / fern detail (generated, 50/50) |
| 6 | cavern | scrap texture as rubble floor (generated) | stone-wall sheet | debris (sheet) |
| 7 | molten | molten floor (generated) | molten wall (generated) | molten pile / slag detail (generated, 50/50) |
| 8 | frozen | frozen floor (generated) | frozen wall (generated) | frozen pile / snowdrift detail (generated, 50/50) |
| 9 | toxic | toxic floor (generated) | toxic wall (generated) | toxic pile / puddle detail (generated, 50/50) |
| 10 | neon | circuit floor (generated) | metal-wall sheet | debris (sheet) |
| 11+ | cycles molten, frozen, toxic, neon | as above | as above | as above |

Rules that did NOT change for biomes: no new enemies, no new
hazards, no new mechanics, no balance numbers. Molten's
glowing cracks are look only — there is no lava mechanic
(existing spike traps are the only hazards, unchanged).
Overgrown has no water mechanic; frozen has no slow mechanic;
toxic has no poison mechanic; neon has no shop mechanic.
Dressing kinds resolve per depth (verified for depths 1-12:
every floor theme and dressing kind maps to a sheet or plain
tile, none unresolved). Dressing placement consumes RNG in a
different order than before, but floors stay deterministic
per seed (tests check self-consistency, not golden values).

### Screenshots (headless Playwright/Chromium, zero console errors)

- `visual-overhaul-desktop.png` (full page, depth 1
  industrial): dark top HUD bar, square grid with generated
  rusty floor, metal-wall blocks, player green outline,
  quickslots, icon bar, D-pad.
- `visual-overhaul-mobile.png` (390px, depth 1 industrial):
  HUD wrapping to two lines, square grid, dock with
  quickslots + icon bar + D-pad, all tappable.
- `visual-overhaul-scrapyard.png` (full page, depth 2
  scrapyard): generated scrap-wall texture as the wall/edge
  material, rusty_b floor, scrap-pile dressing, player green
  outline, red outlines on adjacent enemies, AttackIndicator
  banner ("Drone 1/18 — tap to attack").
- `visual-overhaul-depth7.png` (full page, depth 7 molten,
  reached by a real bot run: 408 D-pad/click actions through
  depths 1-6, zero console errors): molten floor texture
  (dark basalt + glowing orange cracks) and molten furnace-
  brick wall texture rendering in-game, player green outline,
  HUD LEVEL 7, carried 18, Banked 22, log line "Descended to
  depth 7. Banked 6 salvage at 25%". The bot died walking to
  the depth-7 stairs afterwards, so the stairs panel was
  captured separately (next shot) rather than faked.
- `visual-overhaul-stairs.png` (full page, depth 1, state
  STAIRS): the right-side stairs panel with the REAL tier —
  "Depth 1 -> 2 | Carried 18 | Descending banks 4",
  "BANK 25% & DESCEND", "EXTRACT (KEEP ALL)", "Cancel" —
  turn indicator reading STAIRS, player on the stairs tile.

## Vision layout pass (2026-10-27)

The previous overhaul's chrome (side help/log panel, 6
quickslots, 7 icon buttons, D-pad) was rejected by the user:
the end result must look like the vision screenshots. This
pass removes that chrome from the main view and relocates
every function into modals. No mechanics, balance, costs,
rates, enemies, hazards, biomes, tiles, or `test.js` changed
(35/35, see Tests).

- **Full-screen map**: the canvas fills the viewport area
  between the HUD and the bottom bar (`100dvh` flex layout,
  no max-width, no side panel). Tile size responds to
  viewport width (44px phones, 56px tablets, 64px desktop)
  and the camera always centres the player. Black areas in
  screenshots are void tiles of the dungeon itself, not page
  margins.
- **Top HUD, one line, never wraps**: LEVEL (depth) |
  PLAYER TURN (or STAIRS / DESTROYED / EXTRACTED) | heart +
  HP/max | gear + carried salvage | Banked | Power state.
  The HP bar, Clock, and Seed left the bar; Clock and Seed
  are in the Bag modal instead. Font/spacing shrink under
  520px so the bar stays on one line at 390px too.
- **Bottom bar, vision style**: exactly 5 square icon
  buttons, no text labels — footstep = Wait (1 time unit),
  wrench = Use item, gear = Menu, hand = Search (1 time
  unit), backpack = Bag. Plus 2 small stacked buttons at
  the right: grid = recenter (the camera already follows
  the player, so this re-asserts centring), log-list = full
  log overlay (hidden by default).
- **Where each removed element's function moved**:
  - Help text and the full log → Menu modal (gear).
  - Rest → Menu modal, same behaviour (until full HP,
    enemy within 6, or 50 waits).
  - Hub access → Menu modal, same rule (refuses mid-run
    with a feedback line, logged and shown in the menu).
  - Quickslot assignment is gone with the quickslot row.
    Items are used from the wrench popup (lists carried
    health cells / food / repair kits with counts; tapping
    one uses it, same cost and refusals) and from a Use
    button per usable item in the Bag modal.
  - Persistent log panel → one transient last-message line
    floating just above the bottom bar (most recent log
    line; long lines ellipsize on phones, full history in
    the log overlay and the Menu modal).
  - D-pad → gone. Keyboard movement (arrows / WASD /
    diagonals) still works; touch players tap tiles, as
    before.
- **Stairs panel**: unchanged in behaviour, still floating
  over the map on the right and visible ONLY while standing
  on stairs: BANK <real tier>% & DESCEND, EXTRACT (KEEP
  ALL), Cancel, same costs. Note a pre-existing nuance
  found while smoke-testing: Cancel leaves the player
  standing on the stairs tile with state 'playing' — you
  step off and back on to be prompted again.
- **Non-copies, restated**: still no ammo/bullets counter
  at that time (no ammo system invented; Power + Banked were
  the real second counters); still the real banking tier in the
  stairs panel, never the vision's 50%; still no visible
  ENEMY TURN phase (enemies resolve synchronously).
  (Superseded 2026-10-27: an Ammo counter now sits in the HUD
  alongside Power + Banked — see the Ammo + Batch 3 slice.)
- **Beta-tester harness note**: the beta suite in
  `../beta-testers/` still addresses the old chrome
  (`#modal-btns` Descend, `[data-slot]` quickslots, `#pad`,
  `#btn-rest`, `#btn-log` as a toggle) and will fail
  against this layout until it is updated — that is a
  harness update, not a game regression. The game itself
  was smoke-tested through the browser (see below).

### Screenshots (headless Playwright/Chromium, zero console errors)

- `vision-layout-desktop.png` (1280x800, depth 2, mid-
  combat): one-line HUD, map filling the screen, Attack-
  Indicator banner, transient last-message line, 5 icon
  buttons + 2 stacked buttons, no side panel, no D-pad,
  no quickslots.
- `vision-layout-mobile.png` (390x844, depth 1): same
  layout, HUD on one line at 11px, map filling the screen.
- `vision-layout-stairs.png` (1280x800, depth 1, state
  STAIRS): floating stairs panel, "BANK 25% & DESCEND",
  "EXTRACT (KEEP ALL)", "Cancel", HUD reading STAIRS.

### Browser smoke test (vision layout pass)

Playwright/Chromium, zero console/page errors, all steps
driving the real UI: tap-move on canvas (position changed),
Wait via footstep (last line "You wait."), Search via hand
("Search finds nothing nearby."), wrench popup listing
counts, health-cell use 50 → 75 HP (count 2 → 1), Bag Use
button 75 → 100 HP, Menu modal (Help + full log + Rest /
Hub / Close), Hub refusal mid-run shown in the menu,
log overlay, recenter click, stairs reached by keyboard
pathfinding (panel text "BANK 25% & DESCEND"), Cancel
(state back to playing), step off and back on, Descend
(depth 1 → 2), AttackIndicator tap (combat round, enemy
counterattack logged), and a second run's Extract click
(modal "EXTRACTED — back at the hub"). Setup note: the
smoke run seeded a hub stockpile (2 health, 2 food, 1
repair kit) and set player HP to 50 via the debug hook so
a successful item use could be exercised; no game code
was changed for the test.

## Vision layout pass 2 (2026-10-27)

Second iteration toward the user's gameplay-vision screenshots
(the previous pass's chrome was still not close enough). Only
`index.html`, `style.css`, `game.js`, and this README changed.
No mechanics, balance, costs, rates, enemies, hazards, biomes,
tile assets, `core.js`, or `test.js` changed (35/35, see Tests).

- **Monochrome line icons**: the colorful emoji buttons are
  gone. All 7 buttons are inline-SVG line glyphs in the
  vision's pale mint-grey (footstep, wrench, gear, hand,
  backpack, grid, log), drawn with stroke only. The bottom bar
  is square buttons WITH GAPS between them, clustered left,
  with the 2 stacked buttons at the right — not a continuous
  strip.
- **HUD restyle, vision palette**: pale text throughout with
  pipe separators, a red heart glyph, a gear glyph for carried
  salvage. No cyan/blue highlighted turn text, no bold
  coloured segments. Same real counters (LEVEL = depth, turn
  state, HP/max, carried salvage, Ammo, Banked, Power). No 50%
  banking anywhere. On 390px phones the HUD shrinks to 9px with
  a 2px gap so every segment including "Ammo 12" and "Power OK"
  fits on one line (re-verified 2026-10-27 with the Ammo
  segment: scrollWidth equals client width, and by eye).
- **No banner**: the full-width red AttackIndicator banner is
  DELETED from the DOM. Targeting feedback is the red outline
  on the adjacent enemy plus a small "Name HP/maxHp" label
  drawn directly above that enemy's tile. Tapping the outlined
  enemy still attacks, exactly as before (canvas pointer
  handler, unchanged logic).
- **No permanent message line**: the last-message row is gone
  from the layout. The latest log line shows only as a
  transient overlay fading over the bottom edge of the map
  (3.5 s after an event, then gone). Full history stays in
  the Menu modal and the log overlay.
- **Player-centred large-tile camera (rendering only)**: tile
  size is now viewport-derived — ~12 tiles across on desktop
  (~107px at 1280px), ~11 on tablets, ~9 on phones — and the
  camera follows the player, clamped to floor bounds (a floor
  smaller than the viewport is centred; the view never slides
  past the floor's edge). Tap/click mapping uses the same
  clamped origin, so taps land on the tile they appear to.
  Grid, coordinates, movement, and pathfinding are unchanged.
  Actor, pickup, dressing, wreck, and float sizes scale with
  tile size so sprites fill their tiles at the new scale.
- **Tile polish within existing assets**: faint dark grid
  outlines on every tile, and wall cells get an extra thick
  dark border so they read as heavy scrap edges. Wall sheet
  itself is unchanged (still drawn at full tile size); no new
  wall art was invented.
- **Stairs panel restyle, vision style**: dark floating panel
  with chevron glyphs, orange "‹ BANK <real tier>% &
  DESCEND ›" and orange-red "‹ EXTRACT (KEEP ALL) ›" lines,
  Cancel below. Same behavior, costs, and real tier as before
  (25% start, 40%/55% via the Researcher — never the vision's
  50% unless a player's actual tier were 50%, which it never
  is).

### Screenshots (vision layout pass 2, viewed by eye)

- `vision-layout2-desktop.png` (1280x800, depth 1, mid-combat):
  pale one-line HUD with red heart, large tiles filling the
  frame width, "Raider 9/30" label above the red-outlined
  enemy, green player outline, monochrome gapped icon buttons,
  transient "Raider wakes up!" overlay at the map's bottom
  edge, no banner, no message row.
- `vision-layout2-mobile.png` (390x844, depth 1): same layout,
  HUD on one line including "Power OK", 9 tiles across.
- `vision-layout2-stairs.png` (1280x800, depth 1, state STAIRS):
  floating dark stairs panel with chevrons and orange
  "‹ BANK 25% & DESCEND ›" / "‹ EXTRACT (KEEP ALL) ›",
  HUD reading STAIRS.

### Browser smoke test (vision layout pass 2)

Playwright/Chromium, zero console/page errors, all steps
driving the real UI on desktop AND mobile: tap-move to a
visible adjacent tile (position changed), bump attack by
clicking the red-outlined enemy (enemy HP 30 → 9 desktop /
30 → 4 mobile, no banner element in the DOM), Wait via
footstep, Search via hand, wrench popup use (health cells
2 → 1, HP up, any adjacent-enemy counterattack during the
time unit accounted for), Bag, Menu (Help + full log + Rest /
Hub buttons), distant visible tile tap (player moved toward
it under the new camera), stairs panel (real 25% tier, no
50%), Cancel, step off and back on, Descend (depth 1 → 2),
Extract on the next floor (modal "EXTRACTED — back at the
hub"). Setup note: the smoke run set player HP and item
counts via the debug hook to exercise a successful use; no
game code was changed for the test. Two early smoke
assertions were test-script errors, not game bugs (a
fixed 75-HP expectation that ignored a legal counterattack,
and a Menu check that looked in the modal body instead of
the modal buttons); both were corrected in the script and
the full run then passed.

### What remains different from the vision, and why

- **Dungeon rooms vs the vision's single room**: the vision
  shows one wall-to-wall room. This game generates irregular
  multi-room floors (60x44 grid), so dark void still appears
  around/below rooms where no floor exists — now as void
  inside the camera view rather than page margins. Closing
  that gap would mean changing room generation, which this
  pass deliberately did not do.
- **HUD carries two counters the vision doesn't**: Banked and
  Power have no vision equivalent, but both are real game
  state the player needs (banked salvage, pressure clock);
  the vision's bullets slot is now a real Ammo counter
  (added 2026-10-27 — see the Ammo + Batch 3 slice).
- **No visible ENEMY TURN phase**: enemies still resolve
  synchronously after the player's action, so the bar shows
  PLAYER TURN while awaiting input. Not faked.

## New art batch 1 (2026-10-26, image-generation to sprite flow)

Sources: four generated images in `new-art/batch1/raw/` (1600x1600),
processed by `new-art/batch1/process_batch1.py` per the sprite-batch QC
skill; contact sheet `new-art/batch1/batch1-sheet.png`, reviewed by eye
on a dark backdrop. The user confirmed the vision images he sent are
his own Gemini generations, not trademarked, so close matching and
slicing from them are allowed.

- **Dense scrap floor** (`assets/gen_floor_dense_scrap.png`, 256px,
  full-bleed, no keying): the generated floor tile, verified good by
  eye. Wired as an industrial-biome floor variant: one third of floor
  cells (deterministic per-cell hash) use it, the rest keep the old
  rusty tile. Floor logic unchanged.
- **Salvage pickup** (`assets/prop_salvage_pile_sheet.png`): scrap heap
  keyed from pure black by border flood-fill (dark interior detail
  survives), soft edge falloff, trimmed, re-centered, 512px copy plus
  an 822x136 sheet whose cell 0 the existing pickup renderer draws.
  Replaces the old generic salvage sprite.
- **Component pickup** (`assets/prop_component_gears_sheet.png`): same
  keying pipeline for the gears/bolts cluster. Components finally have
  their own art, distinct from salvage (a standing beta opinion).
  Pickup sizes, highlight rings, and behavior unchanged.
- **Scrap wall** (`assets/gen_wall_dense_scrap.png`, 256px): the
  generator would not produce a single wall tile — both v1 and v2
  returned whole multi-tile room scenes. Sliced instead: the full
  top scrap band of the v2 room, stretched to a square. Wired as an
  industrial wall variant on one third of wall cells, mixed with the
  old metal-wall sheet. Honest seam note: tiled 3x3, the band shows a
  visible repeat (same pipes recurring), so it is a mixed-in variant,
  not a seamless field texture. Direct slicing of the original vision
  image was also tried and abandoned: blind bands landed on its HUD
  bar and on the player mech, not on a clean wall strip, while the
  v2 band (itself generated from the vision) gave a clean strip.

Remaining gaps: no single-tile wall generation yet (sliced band is
the workaround); other biomes still use their older generated tiles.

## New art batch 2 (2026-10-26, slice the vision itself)

Goal: push the industrial look until it matches the user's vision
image. Measured first (`new-art/batch2/NOTES.md`): vision images are
1024x1024; vertical grid lines at x ≈ 69, 167, 265, 363, 461, 559,
657, 755, 853, 951 (pitch ≈ 98 px), HUD y 0–68, bottom bar y ≈ 900+.
Horizontal lines drift ~10 px in the lower rows — the vision is a
Gemini-generated image, not a real grid screenshot, so crops were
verified on a contact sheet, not trusted from coordinates alone.
Two first-attempt crops were caught and fixed on the sheet: the
plain-floor crop landed on a metal-plate loot item, and the
left-wall crop caught the red enemy mech; both were re-cropped
(the floor from the lowest-variance cell found by scan, the wall
from a second top-band strip). A bottom-band crop was dropped
(it was plain floor — the true bottom band is only ~70 px tall).

- **Vision floors** (`assets/vision_floor_plain.png`,
  `vision_floor_circuit.png`, 256px, sliced from vision-1): plain
  muted brown floor is now dominant on industrial floors (3/5
  cells), circuit tile 1/5, batch-1 dense tile demoted to 1/5.
  Floors are now plain like the vision, not noisy.
- **Vision walls** (`assets/vision_wall_top.png`,
  `vision_wall_top2.png`, `vision_wall_right.png`, 256px, sliced
  from the vision's junk bands/niche): dominant on industrial
  walls (5/6 cells), old cyan-slit sheet demoted to 1/6 — the
  reverse of batch 1's ratio. Bands are not position-aware
  (top/top2/right mix by per-cell hash), and crops of a
  generated image are not seamless tiles, so they are mixed
  variants, not a seamless field.
- **Loot dressing** (`assets/loot_gear_sheet.png`,
  `loot_key_sheet.png`, `loot_crate_sheet.png`,
  `loot_crystal_sheet.png`, 822x136 cell-0 sheets): four sprites
  generated on pure black (vision-2 as style reference, 4 calls
  total), flood-fill keyed exactly as batch 1. On industrial
  floors, 'debris' dressing deterministically varies into these
  (rendering only — dressing stays walkable decor, no rule, no
  new item types, pickup slots/behavior unchanged). Verified
  in-game: walked 20 tiles to a debris cell; the gear bundle
  renders beside the player (`newart-batch2-loot.png`).
- **Density caveat:** loot dressing is sparse near spawn — spawn
  rooms get no dressing in core.js (untouched), and 8 fresh runs
  found no debris within 10 tiles of spawn. The vision's
  loot-covered floors are not yet matched in density; raising
  dressing density needs a core.js change, not done here.
- **Not copied:** the vision's "BANK 50%" is not in the
  game — banking stays at the real 25/40/55% tiers. (An ammo
  system was added later, 2026-10-27 — see the Ammo + Batch 3
  slice; the vision's 50% banking was never copied.) The
  vision's single-room
  layout is also not faked: our floors are still multi-room
  procedural dungeons, so dark void between rooms remains.
- Screenshots: `newart-batch2-desktop.png`,
  `newart-batch2-mobile.png`, `newart-batch2-loot.png`,
  comparison `newart-batch2-compare.png` (vision vs game).
  Tests 35/35, syntax clean, zero browser console errors,
  smoke test (move, pickup, bump-attack incl. a drone kill,
  Descend, Extract) all passed.

## Ammo + Batch 3 single-cell wiring (2026-10-27)

Per Skit's word 2026-10-27 12:12 PDT ("We can add an ammo function
and item/weapon bar... pixel dungeon style") and his tap 12:16 PDT
("Wire Batch 3 now, single-cell tiles first"). The earlier "no ammo
system" statements in this file are superseded by this slice; the
vision's 50% banking was never copied.

**Ammo (playtest starting points, NOT agreed balance):** one ammo
pool, one starter weapon — the scrap blaster (2d6+8 dice, range 5,
1 ammo per shot, 1 time unit; other weapons vary — see
LOOT-SKILLS-DESIGN.md §4). Firing (`F` key, FIRE quickslot, or tapping the
FIRE slot) shoots along the facing: first enemy in line, walls and
void block, PD acc/evasion rolls, no surprise bonus, wakes sleeping
targets, costs 1 time unit. Refusals (no target, wall-blocked, out
of range, empty) are free. Ammo crates (+8) spawn one per loot room.
Ammo persists through save/load (old saves default to 16 ammo and a
Common +0 scrap blaster instance) and rides the death wreck to
recovery. Weapons are tiered instances (Common..Legendary, +0..+5,
dice damage shown in the log). Phase 2 adds gear slots (weapon,
armor, shield, utility) on the same tier + upgrade system: stepping
on a weapon or gear drop stows it in the Bag — nothing auto-equips.
The Bag modal has an Equipment section (4 slots, derived stats,
shield pool) with Equip/Remove buttons; swapping costs no time and
returns the old piece to the Bag. A shield absorbs damage before
the hull and recharges 1 per 2 time units. No magazine, no
reload action yet — MECHANICS-PLAN says reloading costs time and the
Armorer crafts ammunition; that is
still to be designed.

**UI:** HUD gains an `Ammo N` segment; a Pixel-Dungeon-style
quickslot strip sits above the action row (FIRE + ammo count,
+HP, FOOD, KIT slots with counts, tap to fire/use); the Bag modal
shows Ammo + weapon + the Equipment section; the player tile carries an HP bar like
enemies. At 390px the HUD gap drops 4px to 2px so all segments
including Ammo and Power OK fit on one line (measured:
scrollWidth equals clientWidth).

**Batch 3, single-cell only:** 75 files into `game/assets/` (43
full-bleed 256x256 tiles byte-for-byte + 31 keyed props resized
256x256, suffix dropped + the ammo-crate sheet). Industrial floors
gain 15 variants, walls 28; scrapyard, toxic, and neon variants
extended; the circuit block hash-picks among 4 circuit keys;
dressing gains variant maps (grate 8, barrel 12, pile 5,
console 16 — structure rooms now also place one `console`
dressing). Excluded, awaiting a wide-cell renderer: doors,
corner-L, stairs/ladder, hazard strips, wide consoles/servers,
monitors, pipe/cable runs, exit sign, lights/lamps,
hazard-marked floors.

- Screenshots: `../beta-testers/reports/screenshots/ammo-batch3-desktop.png`,
  `ammo-batch3-mobile.png`, `ammo-batch3-fire.png`.
- Tests 49/49 (40 prior + 9 new: start state, fire hits first in
  line only, wake without surprise bonus, kill drops/counts,
  four free refusals, crate spawn + pickup, save/load + old-save
  defaults, wreck recovery, console dressing). Syntax clean.
- Beta harness: 337 PASS, 2 FAIL, 2 NOTE, 0 ENV, 0 Blockers.
  The 2 FAILs are the known Recenter/Log 42x28px tap targets
  from Task 2 — unchanged, still awaiting his word, not waived.
  Full slice verification: `../beta-testers/AMMO-BATCH3-REPORT.md`.
- Nit noticed, not fixed here: the shared combat log says
  "You misses X" (pre-existing phrasing in `resolveAttack`,
  melee and ranged alike).

## Ammo balance slice (2026-10-28)

Monte Carlo over the real generator (`../beta-testers/sim_ammo.js`,
20,000 kill trials per type/depth/mode, 200 run-seeds x depths 1-3):
ranged-only demand is 21 shots (depth 1), 26 (depth 2), 38 (depth 3)
against flat supply of ~8/floor from crates, so no constant retune
closes the gap — the missing faucet does. The Armorer now crafts ammo
packs (6 ammo = one crate, 8 banked salvage, no components); up to 12
crafted ammo loads into each new expedition. Starting ammo, crate
value, weapon and enemy stats unchanged. Modeled effect: depth 1 fully
ranged-clearable, depth 2 at 0.71 sustainable ranged share, depth 3
still hybrid. Full numbers, chart, and limits:
`../beta-testers/AMMO-BALANCE-REPORT.md`. Drive-by fix from browser
verification: hub station failure reasons were wiped by the screen
re-render; they now survive it. Tests 52/52.
