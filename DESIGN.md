# SCRAP DUNGEON

Isometric, grid-based dungeon-crawler RPG starring mechs, on the
Pixel Dungeon time system (adopted 2026-10-26): time advances only
when the player acts; idle = frozen; every action costs time units;
actors run on a time queue ordered by speed.
Born from the IRON EDEN workflow sprite set, built as its own game because
that set has its own look and does not match IRON EDEN's in-game graphics.
Separate project, separate dir; the IRON EDEN loop is untouched.

## Why isometric, not top-down

The art dictates it. The sheets are 8-direction, three-quarter views, and
the tiles are three-quarter, not diamond-grid top-down. A pixel-dungeon
heart with an isometric presentation is the honest shape: grid movement,
Pixel Dungeon time-system combat, dungeon floors — rendered in
the art's own angle.

## Core loop

Descend → fight → salvage → gear up → descend deeper → die →
unlock new chassis/weapons → go again.

- Permadeath runs with meta-progression (unlocks persist, runs don't).
- Salvage is the currency: stripped from wrecked enemies and floor loot.
- Depth = difficulty: deeper floors, tougher factions, richer loot.

## Kit mapping (source of truth: ~/workspace/model-sprites/iron-eden-workflow/)

Player chassis (blue/white faction):
- Starter: mech_light_scout (fast, fragile)
- Unlocks: mech_tank_defender, mech_heavy_assault, mech_artillery,
  mech_spider_walker

Enemies (red/dark faction):
- mech_red_raider (chaser), mech_heavy_brute (bruiser),
  mech_small_drone (swarmer)

Weapons as loot (12): plasma_rifle, rail_gun, gatling, flamethrower,
grenade_launcher, missile_pod, homing_missile, energy_sword,
laser_emitter, shield_module, combat_drone (+1 in catalog).
Each with distinct range/pattern: line, cone, blast, chain, melee, deploy.

Dungeon dressing by floor theme (17 tiles):
- Rusted industrial: rusted_wall, metal_floor, metal_platform, metal_gate
- Crystal caverns: crystal_cluster, mesa, dirt_path
- Overgrown: mossy_stone, grass, pine, pine_cluster
- Flooded/shore: water, shoreline
- Loot/props: crate, wreckage, solar, turret (turret = enemy emplacement)

## Systems (in order)

1. Grid movement + 8-direction facing + bump combat (Pixel Dungeon
   time system: move = 1 time unit, heavier actions cost more).
2. Weapons with distinct patterns; salvage drops; stairs down.
3. Procedural floors per theme; enemy scaling by depth.
4. Permadeath + meta unlocks (chassis, weapons).
5. Juice later: attack lunges, hit flashes, particles — no walk cycle
   needed for slice 1 (see constraints).

## Tech

- Web-first, Canvas 2D, using the `_sheet.png` sprites directly.
  Same proven phone path as STARFALL later (WebView APK shell).
- The `.glb` files are held for a future 3D pass; slice 1 does not need them.
- Assets are REFERENCED from the workflow dir, not copied — one source
  of truth. The `.pxl` files stay as the animation source later.

## Constraints, honored not hidden

- Rest-pose only: no walk/attack animation exists yet. Slice 1 uses
  bump attacks, lunges, flashes, particles. Full animation comes from
  the `.pxl` files in PixelAOI when we want it.
- Sheets render small at 32x32: render at 2x/3x with crisp pixels.
  A 64x64 re-render pass is queued as an option, not a blocker.
- Tiles are three-quarter: the dungeon is drawn in that angle throughout.

## Milestones

- Slice 1: one floor, scout mech, move/bump combat, 3 enemy types, stairs.
- Slice 2: weapon loot + salvage economy.
- Slice 3: procedural floors, depth scaling, permadeath + unlocks.
- Then: phone APK via the WebView shell.
