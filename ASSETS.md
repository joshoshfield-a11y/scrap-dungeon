# SCRAP DUNGEON — asset manifest

Source of truth: `~/workspace/model-sprites/iron-eden-workflow/`
(37 models, each `<name>.glb` + `<name>_model.pxl` + `<name>_sheet.png`
(8 directions) + `<name>_sprites.pxl`). Nothing is copied into this
project; the game reads the sheets from the workflow dir.

## Player chassis (mechs/)

| File | Role |
|---|---|
| mech_light_scout | Starter — fast, fragile |
| mech_tank_defender | Unlock — tank |
| mech_heavy_assault | Unlock — brawler |
| mech_artillery | Unlock — long-range |
| mech_spider_walker | Unlock — all-terrain |

## Enemies (mechs/)

| File | Role |
|---|---|
| mech_red_raider | Chaser |
| mech_heavy_brute | Bruiser |
| mech_small_drone | Swarmer |

## Weapons as loot (weapons/)

plasma_rifle, rail_gun, gatling, flamethrower, grenade_launcher,
missile_pod, homing_missile, energy_sword, laser_emitter,
shield_module, combat_drone (+1 catalogued weapon — see workflow README).

## Dungeon tiles (tiles/)

- Rusted industrial: tile_rusted_wall, tile_metal_floor,
  tile_metal_platform, tile_metal_gate
- Crystal caverns: tile_crystal_cluster, tile_mesa, tile_dirt_path
- Overgrown: tile_mossy_stone, tile_grass, tile_pine, tile_pine_cluster
- Flooded/shore: tile_water, tile_shoreline
- Props/loot: tile_crate, tile_wreckage, tile_solar, tile_turret
  (turret doubles as an enemy emplacement)

## Earlier passes (sediment, not this game's art)

- `~/workspace/model-sprites/iron-eden/` (wave 1, invented designs)
- `~/workspace/model-sprites/iron-eden-templates/` (wave 2, coded primitives)
Neither is referenced by this project unless the user says so.

## Batch 1 — dungeon essentials (built 2026-10-26, this project's own dir)

Source: `~/workspace/scrap-dungeon/sprites/` (same 4-file pattern per
model). Templates image-generated first, workflow-set style:
`~/workspace/scrap-dungeon/templates/`. QC grid:
`sprites/qc_batch1.png` — all 8 pass (models render small in-cell,
same known limit as the workflow set; a 64x64 re-render pass stays queued).

| File | Role |
|---|---|
| tiles/tile_stairs_down | Floor exit, cyan-edged steps |
| tiles/tile_chest | Loot container, gold bands + cyan lock |
| tiles/tile_spike_trap | Hazard tile, 3x3 spikes, hazard trim |
| tiles/tile_barrel | Destructible prop, hazard band |
| props/prop_salvage | Salvage pickup, cyan/orange glints |
| props/prop_health_cell | Health pickup, green core |
| props/prop_energy_cell | Energy pickup, cyan core |
| mechs/mech_boss | Depth boss — scaled brute, spiked pauldrons, orange core, cyan visor |

## Batch 2 — roster expansion (built 2026-10-26, from user-supplied refs)

Source: `~/workspace/scrap-dungeon/sprites/` (same 4-file pattern).
Inspiration: `templates/refs/` (3 sheets). QC grid: `sprites/qc_batch2.png`.
Fix pass applied: shielder got a cyan front emblem (stripe alone didn't
read); bomber bay widened to full belly width. Both verified on the
final grid. Builders: `build_scrap2.py`, `build_scrap2_fix.py`.

| File | Role |
|---|---|
| enemies/mech_turret_light | Static emplacement, dome + twin barrels + cyan eye |
| enemies/mech_flyer | Hover enemy, rotor discs + cyan thrusters |
| enemies/mech_shielder | Bulky enemy, huge wall shield with cyan emblem |
| enemies/mech_sniper | Lean enemy, long rifle + cyan scope |
| enemies/mech_bomber | Round enemy, shoulder bombs + orange fuses + bomb bay |
| structures/struct_core_reactor | Objective structure, blue column + cyan core + trim ring |
| structures/struct_shield_generator | Glowing cyan dome on pylon base |
| structures/struct_supply_depot | Loot structure, cyan strip + roof crate + door |

## Batch 3 — FX + items (built 2026-10-26, from the roster sheet)

Source: `~/workspace/scrap-dungeon/sprites/` (same 4-file pattern).
QC grids: `sprites/qc_batch3_fx.png`, `sprites/qc_batch3_items.png`.
**No fix pass needed — all 23 passed first look.** Builder: `build_scrap3.py`.
Deliberate skip: roster-sheet ENERGY_CELL (same cyan canister as batch 1
prop_energy_cell).

| File | Role |
|---|---|
| fx/fx_explosion | Orange/yellow/red burst |
| fx/fx_energy_burst | Cyan star burst |
| fx/fx_laser_beam | Horizontal cyan beam with bright core |
| fx/fx_missile | Grey rocket, red nose, cyan window, flame |
| fx/fx_smoke | Grey puff cluster |
| fx/fx_shield | Cyan dome on grey ring |
| fx/fx_heal | Green cross with light tips |
| fx/fx_spark | Cyan/yellow cross burst |
| fx/fx_blood | Flat red ground pool |
| fx/fx_teleport | Purple rings + cyan column |
| fx/fx_debris | Grey/brown chunks + cyan shard |
| fx/fx_impact | Yellow/orange ground starburst |
| items/item_health_pack | Red box, white cross |
| items/item_ammo_crate | Blue crate, grey lid, cyan light |
| items/item_key | Gold key, bow + shaft + teeth |
| items/item_credits | Gold coin stacks |
| items/item_data_chip | Dark chip, cyan circuit traces |
| items/item_food | Red ration pack, white band, yellow label |
| items/item_book | Blue book, page edge, gold band, red bookmark |
| items/item_scroll | Parchment roll, red seal |
| items/item_gem | Tiered purple crystal |
| items/item_toolkit | Grey box, dark handle, cyan light |
| items/item_misc | Grey gear, cyan hub |

## Animation states (built 2026-10-26, after a VM-replacement recovery)

Source: `~/workspace/scrap-dungeon/sprites/anim/` (same 4-file pattern).
Builder: `build_scrap_anim.py`. QC grids: `sprites/anim/qc_<actor>.png`.
**All 25 frames passed first look — no fix pass needed.**
First attempt failed 25/25 (PixelAOI dead: VM replacement had wiped its
apt libs); reinstalled libxkbcommon-x11-0 + mesa-vulkan-drivers +
libvulkan1 + libegl1, relaunched, rerun clean. Note: the dead
mirror.cogentco.com URI is back in ubuntu.sources after the replacement,
but this update still fetched fine (33.9 MB in 36 s).

| Actor | Frames |
|---|---|
| mech_light_scout | walk_a, walk_b, attack, damaged, destroyed |
| mech_red_raider | walk_a, walk_b, attack, damaged, destroyed |
| mech_heavy_brute | walk_a, walk_b, attack, damaged, destroyed |
| mech_small_drone | walk_a/b = hover bob, attack = beam, damaged, destroyed |
| mech_boss | walk_a, walk_b, attack, damaged, destroyed |

Idle = the existing rest sheets. See `sprites/anim/README.md` for the
cycle and the honest 1-voxel limit on walk_b / drone bob.

Destroyed now covers all 14: the 9 new rigs got wreck models
2026-10-26 (`sprites/anim/<model>_destroyed`, builder
`build_scrap_wrecks_vehicles_tiles.py`, QC `sprites/qc_wrecks.png`).

## Vehicles and map tiles (2026-10-26, same builder)
- Vehicles (`sprites/vehicles/`, QC `sprites/qc_vehicles.png`):
  hoverbike, hovertank, transport, airship, drone_carrier, lander.
- Map tiles (`sprites/tiles/`, QC `sprites/qc_maptiles.png`):
  door, grate, lava, debris, metal_wall, stone_wall.
- Procedural map spec: `MAPS.md`. Mechanics plan: `MECHANICS.md`.
  Sprite gate: `SPRITE-GATE.md` — CLOSED 2026-10-26.

## Skeletal rigs (research track, separate from the main build)

Same Spine-style 2D rig as the scout, now for all 14 articulated
characters. Builders: `research/skeletal/build_rig_all.py` (first 4)
and `build_rig_all2.py` (remaining 9, 2026-10-26). Test poses:
`research/skeletal/test_poses_all2.py`, QC grid
`research/skeletal/test_qc_all2.png`. Combined demo for all 14:
`research/skeletal/demo_all14.html` (model switcher, 8 directions,
idle/walk/attack/damaged, scrub slider — self-contained).

**All 9 new rigs verified exact: rest-pose composite = full render,
0 differing opaque pixels in all 8 directions, per model (72 checks).**
Residual attribution (renderer tie-break at coincident faces, same as
the scout): raider 9 px (SW, W), brute 18 px (S) + 9 px (W, E),
boss 9 px (SW, W, E, SE), drone none. Fully occluded parts are
correct behaviour, not bugs: boss armL 0 px in W / armR 0 px in E,
drone skid 0 px in cardinal directions (visible in diagonals),
drone armL/armR 0 px in some diagonals.

| Model | Root | Groups | Notes |
|---|---|---|---|
| mech_light_scout | torso | torso/head/armL/armR/legL/legR | Original rig, `research/skeletal/` |
| mech_red_raider | torso | torso/head/armL/armR/legL/legR | Blade split by x into armL/armR |
| mech_heavy_brute | torso | torso/head/armL/armR/legL/legR | Fist/Claw into arms, Spike into torso |
| mech_small_drone | body | body/armL/armR/rotor/skid | Arm split by x; rotor pivot = centroid (spins) |
| mech_boss | torso | torso/head/armL/armR/legL/legR | Pauldron/Spike into torso, Fist into arms |
| mech_heavy_assault | torso | torso/head/armL/armR/legL/legR | Shield -> armL, Gun -> armR |
| mech_artillery | torso | torso/head/legL/legR/cannon | Breech+Cannon -> cannon group, aims up |
| mech_tank_defender | hull | hull/turret/trackL/trackR | Turret+Gun, turret pivot = centroid |
| mech_spider_walker | body | body/legLF/legLM/legLB/legRF/legRM/legRB | 6 legs, side x front/mid/back |
| mech_turret_light | base | base/dome/barrel | Dome centroid; scan moves dome+barrel together |
| mech_flyer | hull | hull/rotor/gun | Rotor tilts only, does not spin in-plane |
| mech_shielder | torso | torso/head/legL/legR/shield/armR | Shield+Emblem own group, Arm R only |
| mech_sniper | torso | torso/head/armL/armR/legL/legR | Rifle/Stock/Scope -> armR, Pack -> torso |
| mech_bomber | body | body/head/armL/armR/legL/legR | Bomb/Fuse split by side into arms |

One QC fix: the drone's damaged pose must tilt as a rigid body
(rotating the body alone left the rotor level). Fixed in
`test_poses_all.py` by rotating the whole rest composite about the
body pivot; the demo already nests children inside the body
transform, so it was correct there. Nothing articulated is left
unrigged: structures, tiles, props, items, FX, and weapons are not
articulated characters and were deliberately not rigged — their
animation is FX, not skeletal. Sprite gate checklist:
`~/workspace/scrap-dungeon/SPRITE-GATE.md`.
