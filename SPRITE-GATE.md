# SCRAP DUNGEON — sprite gate checklist (2026-10-26)

The game build starts only when this gate is closed. Status at the
2026-10-26 rig-all pass (see research/skeletal/README.md).

## Character sprites — DONE (14 / 14)
- Workflow mechs (8): scout, raider, brute, drone, tank, assault, artillery, spider
- Batch-2 enemies (5): turret, flyer, shielder, sniper, bomber
- Batch-1 boss (1): mech_boss
- All 14 have a skeletal rig (research/skeletal/rigs/, scout top-level):
  rest pose pixel-exact in all 8 directions, 0 differing opaque pixels.

## Character animations — DONE for idle/walk/attack/damaged (14 / 14)
- Skeletal rigs drive idle, walk (hover/scan/drive per body plan),
  attack, and damaged for all 14 (demo_all14.html).
- Frame-based animation states (25 sheets, sprites/anim/) cover 5 actors
  only: scout, raider, brute, drone, boss — walk_a/walk_b/attack/damaged/
  destroyed each.

## Destroyed/wreck states — DONE (14 / 14)
- Frame-based destroyed for the first 5 (scout, raider, brute, drone,
  boss) from build_scrap_anim.py.
- Wrecks for the 9 new rigs built 2026-10-26 (build_scrap_wrecks_
  vehicles_tiles.py, sprites/anim/<model>_destroyed): same wreck-pile
  template as the first 5 (dark slab, faction-tinted core, ember,
  no glow) plus one signature chunk per model (assault shield+gun,
  artillery barrels, tank turret, spider leg stubs, turret dome ball,
  flyer rotor blades, shielder shield plate, sniper rifle, bomber
  bombs). QC grid sprites/qc_wrecks.png passed by eye, no fix pass.
  Note: shielder wreck's shield plate is prominent in S — that is
  its signature chunk, not a detachment.

## World sprites — DONE
- Workflow tiles (17): rusted industrial, crystal caverns, overgrown,
  flooded/shore themes, plus crate, wreckage, solar, turret props.
- Batch-1 tiles/props: stairs down, chest, spike trap, barrel, salvage,
  health cell, energy cell.
- Batch-2 structures: core reactor, shield generator, supply depot.
- Batch-3 FX (12): explosion, energy_burst, laser_beam, missile, smoke,
  shield, heal, spark, blood, teleport, debris, impact.
- Batch-3 items (11): health_pack, ammo_crate, key, credits, data_chip,
  food, book, scroll, gem, toolkit, misc.

## Destructibles — DONE as sprites, animation is FX
- Barrel (batch-1), crate and wreckage (workflow tiles) exist as sprites.
- Their "animation" is intact -> explosion/debris/impact FX, which is
  built. No separate crumbling frame sequence exists for props; that is
  the same FX fallback as the wreck gap above.

## Vehicles — DONE (6 / 6)
- Built 2026-10-26 (same builder, sprites/vehicles/): hoverbike,
  hovertank, transport, airship, drone_carrier, lander — blue
  faction, cyan thrusters/lights, 8-direction sheets. QC grid
  sprites/qc_vehicles.png passed by eye, no fix pass. Note: lander
  is the smallest/darkest of the set; it reads in the diagonals.
  Vehicles are surface/hub content, not dungeon cells — they do
  not appear on dungeon floors (see MAPS.md).

## Map tiles for coherent procedural maps — DONE
- New tiles built 2026-10-26 (same builder, sprites/tiles/):
  door (closed, cyan strip), grate, lava (orange glow hazard),
  debris (rubble scatter), metal_wall (cyan trim), stone_wall
  (moss + crack). QC grid sprites/qc_maptiles.png passed by eye.
- Full procedural spec in MAPS.md: seeded room graph + corridors,
  doors at room entrances, walls by theme (metal/rusted/mossy/
  stone), hazards, spawn/stairs placement, depth themes, and the
  coherence checks the game build must verify. Walls need no
  corner variants — they are 3D blocks, not 2D autotiles.

## Gate decision — CLOSED 2026-10-26
- Both open items the user named are built and QC-passed:
  9 wrecks, 6 vehicles, plus the 6 map tiles for coherent
  procedural maps. The sprite gate no longer blocks the game.
- Pixel Dungeon time system: ADOPTED 2026-10-26, DESIGN.md
  and MECHANICS.md updated. Mechanics planning continues from
  MECHANICS.md + MAPS.md + DESIGN.md. Still open: stairs-down
  banking rule, hub NPC cast.
