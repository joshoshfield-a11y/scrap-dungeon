# Reference sheets (user-supplied 2026-10-26, inspiration for Scrap Dungeon)

- `sheet-iron-eden-4-6-15.png` — IRON EDEN template sheet: 4 mechs
  (ARTILLERY_LONGSHOT, BULWARK_RAMPART, LANCER_JAVELIN, SCOUT_VESPID),
  6 XANDRIA characters, 15 shared weapons/terrain/vehicles/items.
  32x32 frames, 3x nearest neighbor.
- `sheet-iron-eden-full-roster.png` — full roster: same mechs + characters
  with IDLE / WALK / ATTACK / DAMAGED / DESTROYED rows, 12 enemies, 6
  structures, 12 FX, 12 items, 8 terrain tiles, 6 vehicles, 8 weapons.
- `sheet-sprite-grid-16.png` — 16 large clean sprites: the 8 workflow mechs
  plus reactor_core, sentry_turret, shield_generator, repair_drone,
  scrap_crate, explosive_barrel, medkit, energy_cell.

Style bar these set: chunky voxel, strong silhouettes, blue/white heroes,
red/dark enemies, cyan energy accents, readable at small size — and
animation states per actor (the rest-pose-only limit of batch 1 is the
next thing to close, after the roster fills out).

Note 2026-10-26: VM replacement between batch 3 and the anim pass wiped
PixelAOI's apt libs; reinstall libxkbcommon-x11-0, mesa-vulkan-drivers,
libvulkan1, libegl1 after any replacement before relaunching.
