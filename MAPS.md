# Scrap Dungeon — procedural maps

Pixel-dungeon style: **every run is a different map**. Same generator,
different seed, different floor. No hand-built levels, no repeated
layout. This file is the spec the game build will implement; the tile
kit below is what makes it possible.

## The tile kit (all sprites exist, 8-direction sheets)

Roles are what the generator uses, not decoration labels. A cell is
one grid square; the sprite placed on it is the whole cell.

### Floors (walkable, no block)
- `tile_metal_floor` — industrial theme ground
- `tile_dirt_path` — scrapyard / overgrown ground
- `tile_grass` — overgrown ground
- `tile_metal_platform` — raised walkway ground
- `tile_grate` — vented floor, walkable, dressing (new)
- `tile_debris` — rubble scatter, walkable, dressing (new)
- `tile_water` — shallow, walkable at a cost (see hazards)
- `tile_shoreline` — water edge, walkable

### Walls (block movement AND sight)
- `tile_rusted_wall` — scrapyard wall
- `tile_metal_wall` — industrial wall, cyan trim (new)
- `tile_stone_wall` — cavern wall, moss + crack (new)
- `tile_mossy_stone` — overgrown wall
- `tile_mesa` — rock outcrop wall (cavern theme)

Walls are 3D blocks, not 2D autotiles: a wall cell reads as a wall
from any side, so **no corner/edge variants are needed**. The
generator places a wall block on every non-room, non-corridor cell
that borders a room or corridor — that is the whole wall rule.

### Doors and exits (the only wall cells you pass through)
- `tile_metal_gate` — large gate, room entrances / vault doors
- `tile_door` — standard dungeon door, closed, cyan strip (new)
- `tile_stairs_down` — the exit. One per floor, always in the
  farthest room from spawn. Descending increments depth and
  re-seeds the generator. There is no stairs-up: runs go down.

### Hazards (walkable, but they hurt or cost)
- `tile_spike_trap` — hidden until stepped on or revealed, then
  visible; damage on entry
- `tile_lava` — molten floor, damage per turn standing on it (new)
- `tile_water` — slow: costs an extra turn to cross (not damage)

### Props and structures (placed inside rooms, not on the grid edge)
- Destructibles: `tile_barrel` (explodes), `tile_crate` (loot),
  workflow `tile_wreckage` (salvage)
- Loot: `tile_chest` (closed, opens to an item)
- Structures: `struct_core_reactor`, `struct_shield_generator`,
  `struct_supply_depot` — room centrepieces, interactable
- Dressing: `tile_crystal_cluster`, `tile_pine`, `tile_pine_cluster`,
  `tile_solar`, workflow `tile_turret` (decorative turret prop)
- Drops: `prop_salvage`, `prop_health_cell`, `prop_energy_cell`,
  batch-3 items (health_pack, ammo_crate, key, credits, data_chip,
  food, book, scroll, gem, toolkit, misc)

### What is NOT in the kit, and why it is fine
- Stairs-up: runs descend only, permadeath, no backtracking up.
- Vehicles: `veh_*` are surface / hub dressing and later-game
  content, not dungeon cells. They do not appear on dungeon floors.
- Wrecks: `*_destroyed` sheets are actor states, placed on the
  cell where an actor died, then replaced by a salvage drop.

## Generation (seeded, one floor at a time)

1. **Seed.** `seed = run_seed XOR depth`. Same run + same depth
   reproduces the same floor (debugging, sharing seeds). Different
   runs never share a seed.
2. **Rooms.** Place 6–10 rectangular rooms on a grid, non-overlapping,
   sizes 4×4 to 8×6. Room types: combat (enemies), loot (chest +
   crate), structure (one structure centrepiece), hazard (spike /
   lava / water floor), empty (dressing only). At least one loot
   room and one structure room per floor.
3. **Corridors.** Connect rooms in a spanning tree (every room
   reachable), plus 1–2 extra loops so the map is never a single
   line. Corridors are 1 cell wide, L-shaped.
4. **Doors.** Where a corridor meets a room, place `tile_door`.
   Vault rooms (structure + loot combined) get `tile_metal_gate`
   instead, and stay locked until the room's enemies are dead or
   a key is spent (key item exists in batch 3).
5. **Walls.** Every cell that is not floor/corridor/door/stairs
   and touches a floor cell becomes a wall, using the floor's
   theme wall (industrial → metal, scrapyard → rusted,
   overgrown → mossy, cavern → stone).
6. **Hazards and dressing.** Inside rooms, scatter: spike traps
   (hidden), lava pools in cavern floors, water in overgrown
   floors, debris/grate dressing on industrial floors. Never on
   the spawn cell, never blocking the only path to the stairs.
7. **Spawn and stairs.** Player spawns in the first room.
   Stairs-down go in the room farthest (by corridor distance)
   from spawn. Enemies spawn in combat rooms, never in the
   spawn room, and never adjacent to the spawn cell.
8. **Depth scaling.** Depth 1 = industrial. Depth 2–3 = scrapyard.
   Depth 4–5 = overgrown. Depth 6 = cavern. Depth 7 = molten
   foundry, 8 = frozen scrap, 9 = toxic/flooded ruins, 10 = neon
   market; depth 11+ cycles molten, frozen, toxic, neon. The
   four post-cavern biomes are a VISUAL/theme layer only (visual
   overhaul 2026-10-26/27): they change floor/wall/dressing
   sprites, never enemies, hazards, mechanics, or balance
   numbers — molten's glowing cracks are look only, there is
   no lava mechanic, and the same holds for water/ice/poison/
   shop implications of the other new looks. Theme picks the
   floor/wall/dressing set; the generator rules never change.

## Coherence checks (the game build must verify these)
- Every room reachable from spawn (flood fill on floor cells).
- Stairs reachable, not walled off, not inside a hazard pool.
- No room with zero exits. No 1-wide dead-end corridor longer
  than 4 cells without a loot cell at its end.
- Enemy count per floor = 3 + depth, capped at 12, spread
  across combat rooms, never all in one room.
