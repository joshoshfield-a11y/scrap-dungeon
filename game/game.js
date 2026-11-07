// SCRAP DUNGEON Phase 1 — browser rendering + input. Core logic is
// in core.js (window.ScrapCore). No build step, no external deps.
(function () {
  'use strict';
  var C = window.ScrapCore;
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var TILE = 96; var TILE_W = TILE, TILE_H = TILE; // square top-down tiles; size set by resizeCanvas (vision layout 2)
  // Vision layout: the canvas fills the viewport area between the HUD
  // and the bottom bar, and the tile size responds to viewport width
  // (44px on phones, 56px on tablets, 64px on desktop) so the map —
  // not black margins — is the screen. Camera always centres the
  // player, so Recenter is a re-assert of that centring.
  // Vision layout 2: player-centred LARGE-tile camera. Tile size is
  // chosen so ~12 tiles span a desktop viewport (~9 on phones),
  // replacing the old whole-floor-fit view whose dark voids around
  // irregular rooms were the biggest remaining vision gap. Rendering
  // only: grid, coordinates, movement, and pathfinding are unchanged.
  function resizeCanvas() {
    var mainEl = document.getElementById('main');
    if (!mainEl) return;
    var w = mainEl.clientWidth, h = mainEl.clientHeight;
    if (!w || !h) return;
    canvas.width = w; canvas.height = h;
    var cols = w < 520 ? 9 : w < 900 ? 11 : 12;
    TILE = Math.max(32, Math.round(w / cols));
    TILE_W = TILE; TILE_H = TILE;
  }
  window.addEventListener('resize', resizeCanvas);

  // ---------- run state + hub state (Phase 2) ----------
  // Hub survives everything; run is separate. On load, a saved run
  // offers Continue / New Expedition via the hub screen (shown at
  // the bottom of this file, once the modal helpers exist).
  var hub = C.loadHub(localStorage) || C.newHub();
  var savedRun = C.loadRun(localStorage);
  var runSeed, rng, state, pendingHubScreen = null, nextExpeditionSeed = null;
  // Phase 4 (§7.6.4): the player's chosen ammo loadout for the next
  // expedition, built with the hub Loadout station's steppers. Null
  // means the default (16 Standard). Consumed by newExpedition.
  var pendingLoadout = null;
  // Menu-tabs wave: the active Bag / hub tab persists across the
  // re-renders that station actions trigger, so buying at the
  // Armorer doesn't kick the player back to the first tab.
  var bagTab = 'Gear';
  var hubTab = 'Upgrades';
  function getNextExpeditionSeed() {
    if (!nextExpeditionSeed) nextExpeditionSeed = (Math.floor(Math.random() * 4294967296)) >>> 0;
    return nextExpeditionSeed;
  }
  if (savedRun && (savedRun.state === 'playing' || savedRun.state === 'stairs')) {
    state = savedRun;
    C.attachHub(state, hub);
    runSeed = state.runSeed;
    // RNG is re-seeded on load (the mulberry32 closure state is not
    // serializable), so future rolls differ from an uninterrupted
    // run but stay deterministic for this load. See README.
    rng = C.mulberry32((runSeed ^ 0x9e3779b9 ^ (state.actions || 0)) >>> 0);
    pendingHubScreen = 'load';
  } else {
    runSeed = (Math.floor(Math.random() * 4294967296)) >>> 0;
    rng = C.mulberry32(runSeed ^ 0x9e3779b9);
    state = C.newRun(runSeed, hub);
    C.logMsg(state, 'Run seed ' + runSeed + '. Depth 1, industrial. Good hunting.');
    if (savedRun) C.clearRun(localStorage); // dead/extracted saves are not resumable
  }

  // ---------- sprite sheets: slice 8 direction cells ----------
  // Sheet geometry (verified from the PNGs): 822x136, cells 96x96 at
  // x = 6 + i*102, y = 34. Direction order: S, SW, W, NW, N, NE, E, SE.
  // The sheets already carry alpha 0 on their black cell backgrounds,
  // so slicing is drawImage only — deliberately no getImageData, which
  // is blocked by canvas tainting when index.html is opened via file://.
  var SHEETS = {
    player: 'assets/mech_light_scout_sheet.png',
    raider: 'assets/mech_red_raider_sheet.png',
    brute: 'assets/mech_heavy_brute_sheet.png',
    drone: 'assets/mech_small_drone_sheet.png',
    // Phase 5: base keys only (one pose per sheet); drawActor falls
    // back to the base key when a pose key is missing. Files copied
    // byte-identical from sprites/enemies/ + sprites/mechs/.
    turret_light: 'assets/mech_turret_light_sheet.png',
    flyer: 'assets/mech_flyer_sheet.png',
    shielder: 'assets/mech_shielder_sheet.png',
    sniper: 'assets/mech_sniper_sheet.png',
    bomber: 'assets/mech_bomber_sheet.png',
    boss: 'assets/mech_boss_sheet.png',
    // Fixwave: boss pose sheets byte-copied from sprites/anim/
    // (same 822x136 geometry as every other sheet). Other Phase 5
    // types have no walk/attack sheets in sprites/anim/ — only
    // destroyed sheets — so they keep the base-pose fallback in
    // drawActor and animate via the slide + bob below, honestly.
    boss_walk_a: 'assets/mech_boss_walk_a_sheet.png',
    boss_walk_b: 'assets/mech_boss_walk_b_sheet.png',
    boss_attack: 'assets/mech_boss_attack_sheet.png',
    boss_damaged: 'assets/mech_boss_damaged_sheet.png',
    stairs: 'assets/tile_stairs_down_sheet.png',
    wreck_raider: 'assets/mech_red_raider_destroyed_sheet.png',
    wreck_brute: 'assets/mech_heavy_brute_destroyed_sheet.png',
    wreck_drone: 'assets/mech_small_drone_destroyed_sheet.png',
    // Animation poses (sprites/anim/): walk_a/walk_b alternate per step,
    // attack on bump attacks, damaged briefly on taking damage.
    player_walk_a: 'assets/mech_light_scout_walk_a_sheet.png',
    player_walk_b: 'assets/mech_light_scout_walk_b_sheet.png',
    player_attack: 'assets/mech_light_scout_attack_sheet.png',
    player_damaged: 'assets/mech_light_scout_damaged_sheet.png',
    raider_walk_a: 'assets/mech_red_raider_walk_a_sheet.png',
    raider_walk_b: 'assets/mech_red_raider_walk_b_sheet.png',
    raider_attack: 'assets/mech_red_raider_attack_sheet.png',
    raider_damaged: 'assets/mech_red_raider_damaged_sheet.png',
    brute_walk_a: 'assets/mech_heavy_brute_walk_a_sheet.png',
    brute_walk_b: 'assets/mech_heavy_brute_walk_b_sheet.png',
    brute_attack: 'assets/mech_heavy_brute_attack_sheet.png',
    brute_damaged: 'assets/mech_heavy_brute_damaged_sheet.png',
    drone_walk_a: 'assets/mech_small_drone_walk_a_sheet.png',
    drone_walk_b: 'assets/mech_small_drone_walk_b_sheet.png',
    drone_attack: 'assets/mech_small_drone_attack_sheet.png',
    drone_damaged: 'assets/mech_small_drone_damaged_sheet.png',
    // Tiles / dressing / pickups (sprites/tiles/, sprites/props/, sprites/items/).
    // Single-cell use: only cell 0 (S view) is ever drawn for these.
    wall: 'assets/tile_metal_wall_sheet.png',
    door: 'assets/tile_door_sheet.png',
    chest: 'assets/tile_chest_sheet.png',
    barrel: 'assets/tile_barrel_sheet.png',
    spike: 'assets/tile_spike_trap_sheet.png',
    debris: 'assets/tile_debris_sheet.png',
    grate: 'assets/tile_grate_sheet.png',
    pickup_salvage: 'assets/prop_salvage_pile_sheet.png',
    pickup_health: 'assets/prop_health_cell_sheet.png',
    pickup_food: 'assets/item_food_sheet.png',
    pickup_dataChip: 'assets/item_data_chip_sheet.png',
    pickup_component: 'assets/prop_component_gears_sheet.png',
    pickup_repair: 'assets/item_toolkit_sheet.png',
    pickup_ammo: 'assets/item_ammo_crate_sheet.png',
    // New art batch 2: loot dressing sprites (keyed, cell 0 only).
    loot_gear: 'assets/loot_gear_sheet.png',
    loot_key: 'assets/loot_key_sheet.png',
    loot_crate: 'assets/loot_crate_sheet.png',
    loot_crystal: 'assets/loot_crystal_sheet.png',
    wreck_player: 'assets/mech_light_scout_destroyed_sheet.png',
    stone_wall: 'assets/tile_stone_wall_sheet.png',
  };
  // Plain single-image tiles (image-generated environment art, NOT 8-cell
  // sheets — the sheet slicer above must never touch these). Key is the
  // dressing kind / biome texture name used below.
  var PLAIN = {
    floor_rusty_a: 'assets/gen_floor_rusty_a.png',
    floor_rusty_b: 'assets/gen_floor_rusty_b.png',
    floor_circuit: 'assets/gen_floor_circuit.png',
    floor_dense_scrap: 'assets/gen_floor_dense_scrap.png',
    // New art batch 2: tiles sliced from the user's vision image.
    vision_floor_plain: 'assets/vision_floor_plain.png',
    vision_floor_circuit: 'assets/vision_floor_circuit.png',
    vision_wall_top: 'assets/vision_wall_top.png',
    vision_wall_top2: 'assets/vision_wall_top2.png',
    vision_wall_right: 'assets/vision_wall_right.png',
    wall_dense_scrap: 'assets/gen_wall_dense_scrap.png',
    wall_scrap: 'assets/gen_wall_scrap.png',
    pile_scrap: 'assets/gen_pile_scrap.png',
    overgrown_floor: 'assets/gen_overgrown_floor.png',
    overgrown_wall: 'assets/gen_overgrown_wall.png',
    pile_overgrown: 'assets/gen_overgrown_pile.png',
    detail_overgrown: 'assets/gen_overgrown_detail.png',
    molten_floor: 'assets/gen_molten_floor.png',
    molten_wall: 'assets/gen_molten_wall.png',
    pile_molten: 'assets/gen_molten_pile.png',
    detail_molten: 'assets/gen_molten_detail.png',
    frozen_floor: 'assets/gen_frozen_floor.png',
    frozen_wall: 'assets/gen_frozen_wall.png',
    pile_frozen: 'assets/gen_frozen_pile.png',
    detail_frozen: 'assets/gen_frozen_detail.png',
    toxic_floor: 'assets/gen_toxic_floor.png',
    toxic_wall: 'assets/gen_toxic_wall.png',
    pile_toxic: 'assets/gen_toxic_pile.png',
    detail_toxic: 'assets/gen_toxic_detail.png',
    // New art batch 3 (2026-10-27): single-cell slices from the user's
    // two Gemini tilesets. Full-bleed 256x256 tiles copied as-is;
    // keyed props are the staging -512 centred copies resized to
    // 256x256 LANCZOS (no re-crop, no re-key; staging originals in
    // new-art/batch3/sliced/ untouched). Wide-cell pieces are NOT
    // here: doors, wall_corner_L, stairs/ladder, hazard strips,
    // wide consoles/servers, monitors, pipe/cable runs, lights,
    // lamps, exit sign, hazard-marked floors — they need the
    // wide-cell renderer that does not exist yet.
    batch3_s2_floor_rusty_a: 'assets/batch3_s2_floor_rusty_a.png',
    batch3_s2_floor_rusty_b: 'assets/batch3_s2_floor_rusty_b.png',
    batch3_s2_floor_cracked_a: 'assets/batch3_s2_floor_cracked_a.png',
    batch3_s2_floor_cracked_b: 'assets/batch3_s2_floor_cracked_b.png',
    batch3_s2_floor_mesh: 'assets/batch3_s2_floor_mesh.png',
    batch3_s2_floor_diamond: 'assets/batch3_s2_floor_diamond.png',
    batch3_s2_floor_tiles_grey: 'assets/batch3_s2_floor_tiles_grey.png',
    batch3_s2_floor_circuit_a: 'assets/batch3_s2_floor_circuit_a.png',
    batch3_s2_floor_circuit_b: 'assets/batch3_s2_floor_circuit_b.png',
    batch3_s2_floor_circuit_c: 'assets/batch3_s2_floor_circuit_c.png',
    batch3_s2_floor_sludge: 'assets/batch3_s2_floor_sludge.png',
    batch3_s2_wall_panel_a: 'assets/batch3_s2_wall_panel_a.png',
    batch3_s2_wall_panel_b: 'assets/batch3_s2_wall_panel_b.png',
    batch3_s2_wall_panel_c: 'assets/batch3_s2_wall_panel_c.png',
    batch3_s2_wall_panel_console: 'assets/batch3_s2_wall_panel_console.png',
    batch3_s2_wall_corner_a: 'assets/batch3_s2_wall_corner_a.png',
    batch3_s2_wall_corner_b: 'assets/batch3_s2_wall_corner_b.png',
    batch3_s2_wall_pipe_a: 'assets/batch3_s2_wall_pipe_a.png',
    batch3_s2_wall_pipe_b: 'assets/batch3_s2_wall_pipe_b.png',
    batch3_s2_wall_pipe_c: 'assets/batch3_s2_wall_pipe_c.png',
    batch3_s2_wall_door_closed_a: 'assets/batch3_s2_wall_door_closed_a.png',
    batch3_s2_wall_door_closed_b: 'assets/batch3_s2_wall_door_closed_b.png',
    batch3_s2_wall_door_open_a: 'assets/batch3_s2_wall_door_open_a.png',
    batch3_s2_wall_door_open_b: 'assets/batch3_s2_wall_door_open_b.png',
    batch3_s2_wall_door_open_c: 'assets/batch3_s2_wall_door_open_c.png',
    batch3_s2_wall_hole_cracked: 'assets/batch3_s2_wall_hole_cracked.png',
    batch3_s2_wall_hole_wires: 'assets/batch3_s2_wall_hole_wires.png',
    batch3_s2_vent_slats: 'assets/batch3_s2_vent_slats.png',
    batch3_s2_vent_grid: 'assets/batch3_s2_vent_grid.png',
    batch3_s2_vent_grid_hole: 'assets/batch3_s2_vent_grid_hole.png',
    batch3_s2_vent_hole_square: 'assets/batch3_s2_vent_hole_square.png',
    batch3_s1_floor_grey_a: 'assets/batch3_s1_floor_grey_a.png',
    batch3_s1_floor_grey_b: 'assets/batch3_s1_floor_grey_b.png',
    batch3_s1_floor_grey_c: 'assets/batch3_s1_floor_grey_c.png',
    batch3_s1_floor_grate_round: 'assets/batch3_s1_floor_grate_round.png',
    batch3_s1_floor_grate_green: 'assets/batch3_s1_floor_grate_green.png',
    batch3_s1_panel_plain_a: 'assets/batch3_s1_panel_plain_a.png',
    batch3_s1_panel_pipes_a: 'assets/batch3_s1_panel_pipes_a.png',
    batch3_s1_panel_console_a: 'assets/batch3_s1_panel_console_a.png',
    batch3_s1_panel_vent: 'assets/batch3_s1_panel_vent.png',
    batch3_s1_vent_slats_a: 'assets/batch3_s1_vent_slats_a.png',
    batch3_s1_vent_slats_b: 'assets/batch3_s1_vent_slats_b.png',
    batch3_s1_vent_slats_c: 'assets/batch3_s1_vent_slats_c.png',
    batch3_s1_console_single: 'assets/batch3_s1_console_single.png',
    batch3_s1_console_single_mid: 'assets/batch3_s1_console_single_mid.png',
    batch3_s1_console_double: 'assets/batch3_s1_console_double.png',
    batch3_s1_console_tall: 'assets/batch3_s1_console_tall.png',
    batch3_s1_console_tall_small: 'assets/batch3_s1_console_tall_small.png',
    batch3_s1_server_small: 'assets/batch3_s1_server_small.png',
    batch3_s1_server_tall_a: 'assets/batch3_s1_server_tall_a.png',
    batch3_s1_server_tall_b: 'assets/batch3_s1_server_tall_b.png',
    batch3_s1_server_tall_c: 'assets/batch3_s1_server_tall_c.png',
    batch3_s1_prop_barrel_grey: 'assets/batch3_s1_prop_barrel_grey.png',
    batch3_s1_prop_barrel_rust: 'assets/batch3_s1_prop_barrel_rust.png',
    batch3_s1_prop_barrel_blue: 'assets/batch3_s1_prop_barrel_blue.png',
    batch3_s1_prop_crate_skull_a: 'assets/batch3_s1_prop_crate_skull_a.png',
    batch3_s1_prop_crate_skull_b: 'assets/batch3_s1_prop_crate_skull_b.png',
    batch3_s1_toolbox_red: 'assets/batch3_s1_toolbox_red.png',
    batch3_s1_toolbox_grey: 'assets/batch3_s1_toolbox_grey.png',
    batch3_s1_fire_extinguisher: 'assets/batch3_s1_fire_extinguisher.png',
    batch3_s1_debris_shells: 'assets/batch3_s1_debris_shells.png',
    batch3_s1_debris_cans: 'assets/batch3_s1_debris_cans.png',
    batch3_s2_console_term_a: 'assets/batch3_s2_console_term_a.png',
    batch3_s2_console_term_b: 'assets/batch3_s2_console_term_b.png',
    batch3_s2_console_term_green: 'assets/batch3_s2_console_term_green.png',
    batch3_s2_console_term_blue: 'assets/batch3_s2_console_term_blue.png',
    batch3_s2_console_map: 'assets/batch3_s2_console_map.png',
    batch3_s2_keypad_small_a: 'assets/batch3_s2_keypad_small_a.png',
    batch3_s2_keypad_tall: 'assets/batch3_s2_keypad_tall.png',
    batch3_s2_scrap_pile_a: 'assets/batch3_s2_scrap_pile_a.png',
    batch3_s2_scrap_pile_wires: 'assets/batch3_s2_scrap_pile_wires.png',
    batch3_s2_armour_broken: 'assets/batch3_s2_armour_broken.png',
    batch3_s2_scrap_debris: 'assets/batch3_s2_scrap_debris.png',
    batch3_s2_crates_stack: 'assets/batch3_s2_crates_stack.png',
    // Wide-cell art (2026-10-28, middle tier): NATIVE-size files in
    // assets/wide/, keyed 'wide_<basename>' so they never collide
    // with the single-cell 256x256 square versions above (same
    // basenames, different files — the dressing-variant maps must
    // keep the square ones). Drawn aspect-preserving by drawWide;
    // the plain loader must never slice these (see WIDE_ART).
    wide_batch3_s1_console_triple: 'assets/wide/batch3_s1_console_triple.png',
    wide_batch3_s2_console_wide_2: 'assets/wide/batch3_s2_console_wide_2.png',
    wide_batch3_s2_console_wide_3: 'assets/wide/batch3_s2_console_wide_3.png',
    wide_batch3_s1_server_pair: 'assets/wide/batch3_s1_server_pair.png',
    wide_batch3_s1_server_top_pair: 'assets/wide/batch3_s1_server_top_pair.png',
    wide_batch3_s2_scrap_pile_a: 'assets/wide/batch3_s2_scrap_pile_a.png',
    wide_batch3_s2_scrap_pile_wires: 'assets/wide/batch3_s2_scrap_pile_wires.png',
    wide_batch3_s2_armour_broken: 'assets/wide/batch3_s2_armour_broken.png',
    wide_batch3_s2_scrap_debris: 'assets/wide/batch3_s2_scrap_debris.png',
    wide_batch3_s2_crates_stack: 'assets/wide/batch3_s2_crates_stack.png',
    wide_batch3_s2_ladder_platform: 'assets/wide/batch3_s2_ladder_platform.png',
    wide_batch3_s2_wall_corner_L: 'assets/wide/batch3_s2_wall_corner_L.png',
    wide_batch3_s2_stairs_down: 'assets/wide/batch3_s2_stairs_down.png',
  };
  // Biome -> { floor (plain key, or null for the drawn fallback),
  // wall (plain key, or sheet key 'wall'/'stone_wall') }.
  // industrial: rusty floor + project metal-wall sheet.
  // scrapyard: rusty variant floor + generated scrap wall + scrap pile.
  // overgrown/molten/frozen/toxic: fully generated floor + wall + piles.
  // cavern: generated scrap-rubble floor + project stone-wall sheet.
  // neon: generated circuit floor + project metal-wall sheet.
  var BIOMES = {
    industrial: { floor: 'vision_floor_plain', wall: 'vision_wall_top',
      floorVariants: ['vision_floor_plain', 'vision_floor_plain', 'vision_floor_plain', 'vision_floor_circuit', 'floor_dense_scrap',
        'batch3_s2_floor_rusty_a', 'batch3_s2_floor_rusty_b', 'batch3_s2_floor_cracked_a', 'batch3_s2_floor_cracked_b',
        'batch3_s2_floor_mesh', 'batch3_s2_floor_diamond', 'batch3_s2_floor_tiles_grey',
        'batch3_s1_floor_grey_a', 'batch3_s1_floor_grey_b', 'batch3_s1_floor_grey_c'],
      wallVariants: ['vision_wall_top', 'vision_wall_top2', 'vision_wall_right', 'vision_wall_top', 'vision_wall_top2', 'wall',
        'batch3_s2_wall_panel_a', 'batch3_s2_wall_panel_b', 'batch3_s2_wall_panel_c', 'batch3_s2_wall_panel_console',
        'batch3_s2_wall_corner_a', 'batch3_s2_wall_corner_b',
        'batch3_s2_wall_pipe_a', 'batch3_s2_wall_pipe_b', 'batch3_s2_wall_pipe_c',
        // Tilefix (2026-10-30): door panels are DELIBERATELY absent here.
        // Wall grid cells used to draw as doors (5 of 30 variants), and
        // those fake doors never opened, never pathed, and tapping one
        // printed "No path there". Door art belongs ONLY to real
        // 'door' grid cells with a floor.doors[] record (rendered
        // below from closedKeys/openKeys). Walls must never draw it.
        'batch3_s2_wall_hole_cracked', 'batch3_s2_wall_hole_wires',
        'batch3_s2_vent_slats', 'batch3_s2_vent_grid', 'batch3_s2_vent_grid_hole', 'batch3_s2_vent_hole_square',
        'batch3_s1_panel_plain_a', 'batch3_s1_panel_pipes_a', 'batch3_s1_panel_console_a', 'batch3_s1_panel_vent'] },
    scrapyard: { floor: 'floor_rusty_b', wall: 'wall_scrap',
      floorVariants: ['floor_rusty_b', 'batch3_s2_floor_rusty_a', 'batch3_s2_floor_rusty_b', 'batch3_s2_floor_cracked_a', 'batch3_s2_floor_cracked_b', 'batch3_s2_floor_mesh', 'batch3_s2_floor_diamond', 'batch3_s2_floor_tiles_grey'],
      wallVariants: ['wall_scrap', 'batch3_s2_wall_panel_a', 'batch3_s2_wall_panel_b', 'batch3_s2_wall_panel_c', 'batch3_s2_wall_corner_a', 'batch3_s2_wall_corner_b', 'batch3_s2_wall_pipe_a', 'batch3_s2_wall_pipe_b', 'batch3_s2_wall_pipe_c'] },
    overgrown: { floor: 'overgrown_floor', wall: 'overgrown_wall' },
    cavern: { floor: 'wall_scrap', wall: 'stone_wall' },
    molten: { floor: 'molten_floor', wall: 'molten_wall' },
    frozen: { floor: 'frozen_floor', wall: 'frozen_wall' },
    toxic: { floor: 'toxic_floor', wall: 'toxic_wall',
      floorVariants: ['toxic_floor', 'batch3_s2_floor_sludge'] },
    neon: { floor: 'floor_circuit', wall: 'wall',
      floorVariants: ['floor_circuit', 'batch3_s2_floor_circuit_a', 'batch3_s2_floor_circuit_b', 'batch3_s2_floor_circuit_c'] },
  };
  // Batch 3 dressing variants (rendering only): an existing dressing
  // kind deterministically varies into batch-3 single-cell props.
  // 'console' is the new core.js structure-room kind; wide consoles,
  // monitors, and wall-mounted pieces are excluded (wide-cell work).
  var DRESSING_VARIANTS = {
    grate: ['grate', 'batch3_s1_floor_grate_round', 'batch3_s1_floor_grate_green',
      'batch3_s1_vent_slats_a', 'batch3_s1_vent_slats_b', 'batch3_s1_vent_slats_c',
      'batch3_s2_vent_slats', 'batch3_s2_vent_grid'],
    barrel: ['barrel', 'batch3_s1_prop_barrel_grey', 'batch3_s1_prop_barrel_rust', 'batch3_s1_prop_barrel_blue',
      'batch3_s1_prop_crate_skull_a', 'batch3_s1_prop_crate_skull_b', 'batch3_s2_crates_stack',
      'batch3_s1_toolbox_red', 'batch3_s1_toolbox_grey', 'batch3_s1_fire_extinguisher',
      'batch3_s1_debris_shells', 'batch3_s1_debris_cans'],
    pile_scrap: ['pile_scrap', 'batch3_s2_scrap_pile_a', 'batch3_s2_scrap_pile_wires', 'batch3_s2_armour_broken', 'batch3_s2_scrap_debris'],
    console: ['batch3_s1_console_single', 'batch3_s1_console_single_mid', 'batch3_s1_console_double',
      'batch3_s1_console_tall', 'batch3_s1_console_tall_small',
      'batch3_s1_server_small', 'batch3_s1_server_tall_a', 'batch3_s1_server_tall_b', 'batch3_s1_server_tall_c',
      'batch3_s2_console_term_a', 'batch3_s2_console_term_b', 'batch3_s2_console_term_green', 'batch3_s2_console_term_blue',
      'batch3_s2_console_map', 'batch3_s2_keypad_small_a', 'batch3_s2_keypad_tall'],
  };
  // Wide-cell art (2026-10-28, middle tier): span in TILE units,
  // anchor 'bottom' (stands on the floor, extends up — tall furniture
  // reads correctly against the y-sorted drawables pass) or 'top'
  // (hangs down from the anchor row — stairs, ladder, wall crown),
  // backing draws a black rect under art with baked black voids so
  // it never composites over floor art as a grey smear. Drawn
  // aspect-preserving from the image's native size by drawWide —
  // never squashed square like single-cell dressing. Keys match the
  // 'wide_' PLAIN entries above and the core.js wideDressing kinds.
  var WIDE_ART = {
    wide_batch3_s1_console_triple: { span: 1.5, anchor: 'bottom', backing: false },
    wide_batch3_s2_console_wide_2: { span: 2, anchor: 'bottom', backing: false },
    wide_batch3_s2_console_wide_3: { span: 2, anchor: 'bottom', backing: false },
    wide_batch3_s1_server_pair: { span: 1.5, anchor: 'bottom', backing: false },
    wide_batch3_s1_server_top_pair: { span: 2, anchor: 'bottom', backing: false },
    wide_batch3_s2_scrap_pile_a: { span: 2, anchor: 'bottom', backing: false },
    wide_batch3_s2_scrap_pile_wires: { span: 2, anchor: 'bottom', backing: false },
    wide_batch3_s2_armour_broken: { span: 1.5, anchor: 'bottom', backing: false },
    wide_batch3_s2_scrap_debris: { span: 1.5, anchor: 'bottom', backing: false },
    wide_batch3_s2_crates_stack: { span: 1.5, anchor: 'bottom', backing: false },
    wide_batch3_s2_ladder_platform: { span: 2, anchor: 'top', backing: true },
    wide_batch3_s2_wall_corner_L: { span: 2, anchor: 'top', backing: true },
    wide_batch3_s2_stairs_down: { span: 2, anchor: 'top', backing: true },
  };
  var sprites = {}; // key -> { ok, cells: [canvas x8] } or { ok:false }
  var loadedCount = 0, totalSheets = Object.keys(SHEETS).length;
  Object.keys(SHEETS).forEach(function (key) {
    var img = new Image();
    img.onload = function () {
      var cells = [];
      for (var i = 0; i < 8; i++) {
        var c = document.createElement('canvas'); c.width = 96; c.height = 96;
        var g = c.getContext('2d');
        g.drawImage(img, 6 + i * 102, 34, 96, 96, 0, 0, 96, 96);
        cells.push(c);
      }
      sprites[key] = { ok: true, cells: cells };
      loadedCount++;
    };
    img.onerror = function () { sprites[key] = { ok: false }; loadedCount++; };
    img.src = SHEETS[key];
  });
  // Plain images load whole into sprites[key] = { ok, plain, img }.
  Object.keys(PLAIN).forEach(function (key) {
    var img = new Image();
    img.onload = function () { sprites[key] = { ok: true, plain: true, img: img }; loadedCount++; };
    img.onerror = function () { sprites[key] = { ok: false }; loadedCount++; };
    img.src = PLAIN[key];
  });
  totalSheets += Object.keys(PLAIN).length;

  // ---------- animation poses ----------
  // Per-actor pose state. Rest is the idle fallback. Poses expire by
  // time (render loop reads currentPose each frame), so a damaged or
  // attack frame shows briefly and then falls back to rest.
  var anims = {};
  function animFor(id) {
    if (!anims[id]) anims[id] = { pose: 'rest', until: 0, walkStep: 0 };
    return anims[id];
  }
  function currentPose(id) {
    var a = anims[id];
    if (!a) return 'rest';
    if (a.until && Date.now() > a.until) a.pose = 'rest';
    return a.pose;
  }
  function setPose(id, pose, ms) { var a = animFor(id); a.pose = pose; a.until = Date.now() + ms; }
  function setWalk(id) {
    var a = animFor(id);
    a.walkStep = (a.walkStep + 1) % 2;
    a.pose = a.walkStep ? 'walk_b' : 'walk_a';
    a.until = Date.now() + 320;
  }
  // ---------- movement slides (fixwave) ----------
  // Rendering-only interpolation: the LOGIC tile (state.player.x,
  // enemy x/y) changes instantly on doMove, exactly as before; the
  // DRAWN position lerps from the old tile centre to the new one
  // over WALK_STEP_MS. No time unit, scheduler tick, or rule reads
  // the slide — only render() and tileOrigin() (so the camera and
  // tap-to-tile math match what is on screen mid-slide).
  // 150ms per step: long enough to read the walk-pose flip (pose
  // expiry is 320ms) and the hop, short enough that a 10-tile walk
  // takes 1.5s instead of feeling like a cutscene.
  var WALK_STEP_MS = 150;
  var slides = {};
  function startSlide(id, fx, fy, tx, ty) {
    slides[id] = { fx: fx, fy: fy, tx: tx, ty: ty, start: Date.now(), dur: WALK_STEP_MS };
  }
  function slidePos(id, tx, ty) {
    var s = slides[id];
    if (!s) return { x: tx, y: ty, progress: 0 };
    var t = (Date.now() - s.start) / s.dur;
    if (t >= 1) { delete slides[id]; return { x: tx, y: ty, progress: 0 }; }
    if (t < 0) t = 0;
    return { x: s.fx + (s.tx - s.fx) * t, y: s.fy + (s.ty - s.fy) * t, progress: t };
  }
  // Walk cancellation: any fresh user input (tap, key, button)
  // retires the in-flight async walk by bumping the token; the
  // walk's own steps never call this, so a walk cannot cancel
  // itself. The pending timer is cleared so no stale step fires.
  var walkToken = 0, walkTimer = null;
  function cancelWalk() {
    walkToken++;
    if (walkTimer) { clearTimeout(walkTimer); walkTimer = null; }
    clearPathTrail(); // graphics pass: a cancelled walk drops its trail
  }
  function snapshotEnemies() {
    return state.floor.enemies.map(function (en) { return { id: en.id, x: en.x, y: en.y, hp: en.hp }; });
  }
  function applyEnemyAnims(before) {
    var hpBefore = state.player.hp; // captured by caller via closure below if needed
    before.forEach(function (b) {
      var en = state.floor.enemies.find(function (e) { return e.id === b.id; });
      if (!en || !en.alive) return;
      // Fixwave: enemies slide with the same timing as the player
      // step that triggered them (rendering only — their logic
      // tile already moved inside playerAction).
      if (en.x !== b.x || en.y !== b.y) { setWalk(en.id); startSlide(en.id, b.x, b.y, en.x, en.y); }
      else if (en.hp < b.hp) setPose(en.id, 'damaged', 300);
    });
    // An enemy adjacent to the player after the player lost HP attacked.
    if (state.player.hp < (applyEnemyAnims._hpBefore || 1e9)) {
      var adj = C.adjacentEnemies(state);
      if (adj.length) setPose(adj[0].id, 'attack', 350);
    }
  }

  // ---------- floating damage text ----------
  var floats = [];
  function addFloat(x, y, text, color) {
    floats.push({ x: x, y: y, text: text, color: color || '#fff', t: 0 });
  }

  // ---------- graphics pass: glow, particles, tracers, path trail ----------
  // Rendering ONLY. Nothing here is read by any rule, scheduler tick,
  // damage roll, or save: particles/tracers/trails/glow live and die
  // inside render() and the action hooks that spawn them. No
  // shadowBlur over the whole scene (phone performance): glows use
  // one pre-rendered radial-gradient canvas, drawn additively.
  var glowCanvas = null;
  function getGlowCanvas() {
    if (glowCanvas) return glowCanvas;
    glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 256;
    var g = glowCanvas.getContext('2d');
    var gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(53,224,255,0.55)');
    gr.addColorStop(0.4, 'rgba(53,224,255,0.22)');
    gr.addColorStop(1, 'rgba(53,224,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return glowCanvas;
  }
  var particles = []; // {x, y (float tile coords), vx, vy, t, life, color, size}
  var tracers = []; // {x0, y0, x1, y1 (float tile coords), start, dur, color}
  function spawnSparks(tx, ty, color, n) {
    for (var i = 0; i < (n || 6); i++) {
      var a = Math.random() * Math.PI * 2, sp = 0.02 + Math.random() * 0.06;
      particles.push({ x: tx + 0.5, y: ty + 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        t: 0, life: 18 + Math.floor(Math.random() * 14), color: color || '#ffb020', size: 3 });
    }
  }
  function spawnTracer(x0, y0, x1, y1, color) {
    tracers.push({ x0: x0, y0: y0, x1: x1, y1: y1, start: Date.now(), dur: 220, color: color || '#ffe08a' });
  }
  // Path trail: set by walkTo, read by render(). tiles = absolute
  // remaining-path tiles; idx = steps already taken; until = the
  // moment the trail stops drawing (refreshed each step, so it dies
  // ~200 ms after the walk ends, and cancelWalk clears it at once).
  var pathTrail = null;
  function setPathTrail(tiles) {
    pathTrail = { tiles: tiles, idx: 0, until: Date.now() + WALK_STEP_MS + 50 };
  }
  function refreshPathTrail(idx) {
    if (pathTrail) { pathTrail.idx = idx; pathTrail.until = Date.now() + WALK_STEP_MS + 50; }
  }
  function clearPathTrail() { pathTrail = null; }
  // FX overlay toggle (Menu button; default ON, see style.css).
  var fxOverlayOn = true;
  function toggleFxOverlay() {
    fxOverlayOn = !fxOverlayOn;
    document.body.classList.toggle('fx-off', !fxOverlayOn);
    openMenuModal('');
  }

  // ---------- HUD / modals ----------
  var hudHp = document.getElementById('hud-hp');
  var hudHpFill = document.getElementById('hud-hp-fill');
  var hudDepth = document.getElementById('hud-depth');
  var hudCarried = document.getElementById('hud-carried');
  var hudBanked = document.getElementById('hud-banked');
  var hudPower = document.getElementById('hud-power');
  var hudTurn = document.getElementById('hud-turn');
  var hudAmmo = document.getElementById('hud-ammo');
  var hudKeys = document.getElementById('hud-keys');
  var hudKeysWrap = document.getElementById('hud-keys-wrap');
  var hudMeters = document.getElementById('hud-meters');
  var stairsPanel = document.getElementById('stairs-panel');
  var stairsInfo = document.getElementById('stairs-info');
  var stairsDescendBtn = document.getElementById('btn-stairs-descend');
  var stairsExtractBtn = document.getElementById('btn-stairs-extract');
  var stairsCancelBtn = document.getElementById('btn-stairs-cancel');
  var transientMsgEl = document.getElementById('transient-msg');
  var transientTimer = null;
  var modal = document.getElementById('modal');
  var modalTitle = document.getElementById('modal-title');
  var modalBody = document.getElementById('modal-body');
  var modalBtns = document.getElementById('modal-btns');

  function showModal(title, body, buttons) {
    // Menu-tabs wave: a fresh modal never inherits stale appended
    // Bag/hub sections from the previous one, and the body is
    // visible again (the Bag hides it on non-Info tabs).
    Array.prototype.slice.call(document.querySelectorAll('.bag-tabs, .bag-assign, .bag-gear, .hub-stations')).forEach(function (el) { el.remove(); });
    modalTitle.textContent = title;
    modalBody.innerHTML = body;
    modalBody.style.display = '';
    modalBtns.innerHTML = '';
    buttons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.textContent = b.label;
      btn.onclick = b.onClick;
      modalBtns.appendChild(btn);
    });
    modal.classList.remove('hidden');
  }
  function hideModal() { modal.classList.add('hidden'); }
  // ---------- Menu tabs (menu-tabs wave) ----------
  // A row of >=48px buttons; the active tab glows. Visual only:
  // tabs show and hide sections that already exist, nothing about
  // rules, costs, or order changes underneath.
  function makeTabBar(tabs, current, onSelect) {
    var bar = document.createElement('div');
    bar.className = 'tab-bar';
    tabs.forEach(function (t) {
      var b = document.createElement('button');
      b.textContent = t;
      b.style.minHeight = '48px'; b.style.margin = '2px';
      b.setAttribute('data-tab', t);
      if (t === current) b.className = 'active';
      b.onclick = function () { onSelect(t); };
      bar.appendChild(b);
    });
    return bar;
  }
  function applyBagTab() {
    modalBody.style.display = (bagTab === 'Info') ? '' : 'none';
    Array.prototype.slice.call(document.querySelectorAll('[data-bag-tab]')).forEach(function (el) {
      el.style.display = (el.getAttribute('data-bag-tab') === bagTab) ? '' : 'none';
    });
    Array.prototype.slice.call(document.querySelectorAll('.bag-tabs button')).forEach(function (b) {
      b.className = (b.getAttribute('data-tab') === bagTab) ? 'active' : '';
    });
  }
  function applyHubTab() {
    Array.prototype.slice.call(document.querySelectorAll('[data-hub-tab]')).forEach(function (el) {
      el.style.display = (el.getAttribute('data-hub-tab') === hubTab) ? '' : 'none';
    });
    Array.prototype.slice.call(document.querySelectorAll('.hub-tabs button')).forEach(function (b) {
      b.className = (b.getAttribute('data-tab') === hubTab) ? 'active' : '';
    });
  }
  // Per-item gear effects, from the shipped GEAR_DEFS through the
  // same gearStatValue scaling derivedStats uses (tier mult x
  // 1.12^upgrade, rounded). Nothing here invents a number: keys
  // the def doesn't carry stay absent.
  var GEAR_EFFECT_KEYS = [['armor', 'Armor'], ['hp', 'Max HP'], ['capacity', 'Shield'], ['evasion', 'Evasion'], ['range', 'Range'], ['sight', 'Sight'], ['powerBonus', 'Power bonus']];
  function gearEffectVector(inst) {
    var out = {};
    if (!inst || !C.GEAR_DEFS || !C.gearStatValue) return out;
    var def = C.GEAR_DEFS[inst.defId];
    if (!def) return out;
    GEAR_EFFECT_KEYS.forEach(function (pair) {
      var v = C.gearStatValue(def, pair[0], inst.tier, inst.upgrade);
      if (v) out[pair[0]] = v;
    });
    return out;
  }
  function gearEffectText(inst) {
    var vec = gearEffectVector(inst);
    var bits = [];
    GEAR_EFFECT_KEYS.forEach(function (pair) { if (vec[pair[0]]) bits.push(pair[1] + ' +' + vec[pair[0]]); });
    return bits.length ? 'Adds: ' + bits.join(' · ') : 'No stat bonus';
  }
  function weaponEffectText(inst, isEquipped) {
    var def = C.WEAPON_DEFS ? C.WEAPON_DEFS[inst.defId] : null;
    if (!def) return '';
    var dice = def.dice ? (def.dice.num + 'd' + def.dice.sides + '+' + def.dice.plus) : '';
    var range = def.range;
    if (isEquipped && C.weaponStats) { try { range = C.weaponStats(state).range; } catch (e) {} }
    else if (inst.properties && inst.properties.indexOf('range') !== -1) range += 1;
    var bits = [];
    if (dice) bits.push('Damage ' + dice);
    bits.push('Range ' + range);
    if (def.ammoType) bits.push(C.AMMO_TYPE_NAMES ? C.AMMO_TYPE_NAMES[def.ammoType] : def.ammoType);
    if (def.element && def.element !== 'kinetic') bits.push(def.element);
    return bits.join(' · ');
  }
  // Swap preview: the candidate run through the REAL derivedStats
  // pipeline on a throwaway clone (never the live state), minus
  // the live totals. Exact by construction, including the weapon
  // range and any pilot mod — and pilot mods can't drop on a swap,
  // because armor replaces armor, so the stale derivedMods on the
  // clone is the right one. Shield swaps reset the pool to 0
  // (equipCarried); said plainly in the preview.
  function swapPreviewText(slot, inst) {
    if (!C.derivedStats) return '';
    try {
      var before = C.derivedStats(state);
      var clone = Object.assign({}, state);
      clone.equipment = Object.assign({}, state.equipment);
      if (slot === 'weapon') { clone.weapon = inst; clone.equipment.weapon = inst; }
      else clone.equipment[slot] = inst;
      clone.derivedMods = state.derivedMods;
      var after = C.derivedStats(clone);
      var keys = [['armor', 'Armor'], ['maxHp', 'Max HP'], ['evasion', 'Evasion'], ['range', 'Range'], ['sight', 'Sight'], ['shieldCapacity', 'Shield'], ['powerBonus', 'Power bonus']];
      var bits = [];
      keys.forEach(function (pair) {
        var d = (after[pair[0]] || 0) - (before[pair[0]] || 0);
        if (d) bits.push(pair[1] + ' ' + (d > 0 ? '+' : '−') + Math.abs(d));
      });
      var txt = bits.length ? 'Swap: ' + bits.join(' · ') : 'Swap: no stat change';
      if (slot === 'shield') txt += ' (shield pool resets to 0)';
      return txt;
    } catch (e) { return ''; }
  }
  // Stairs side panel (visual overhaul): the stairs choice lives in
  // a panel on the right of the map, not a centred modal. It shows
  // the REAL current banking tier, never the vision's 50%.
  function syncStairsPanel() {
    if (!stairsPanel) return;
    if (state.state === 'stairs') {
      var rate = C.bankingRateFor ? C.bankingRateFor(hub) : 0.25;
      if (stairsInfo) stairsInfo.textContent = 'Depth ' + state.depth + ' -> ' + (state.depth + 1) + ' | Carried ' + state.carried + ' | Descending banks ' + Math.floor(state.carried * rate);
      if (stairsDescendBtn) stairsDescendBtn.textContent = '‹ BANK ' + Math.round(rate * 100) + '% & DESCEND ›';
      stairsPanel.classList.remove('hidden');
    } else {
      stairsPanel.classList.add('hidden');
    }
  }
  if (stairsDescendBtn) stairsDescendBtn.addEventListener('click', function () { C.descend(state, runSeed); refreshHud(); });
  if (stairsExtractBtn) stairsExtractBtn.addEventListener('click', function () { C.extract(state); showHubScreen('extracted'); refreshHud(); });
  if (stairsCancelBtn) stairsCancelBtn.addEventListener('click', function () { C.cancelStairs(state, rng); refreshHud(); });

  // Phase 2 autosave: hub always, run only while it is resumable
  // (playing or on the stairs choice). Death/extract clear the run
  // save — the hub save is what survives. Cheap JSON snapshots, and
  // refreshHud runs after every action, so this is the autosave hook.
  function autosave() {
    try {
      C.saveHub(localStorage, hub);
      if (state.state === 'playing' || state.state === 'stairs') C.saveRun(localStorage, state);
      else C.clearRun(localStorage);
    } catch (e) { /* storage unavailable: the game still plays */ }
  }
  function refreshHud() {
    var p = state.player;
    var maxHp = C.derivedStats ? C.derivedStats(state).maxHp : p.maxHp;
    hudHp.textContent = p.hp + ' / ' + maxHp;
    // Graphics pass: icon HP bar (same numbers as the text, never a
    // replacement for them). Colour follows the fraction, not a
    // fixed palette: green > 50%, amber > 25%, red at or below.
    if (hudHpFill) {
      var frac = maxHp > 0 ? Math.max(0, Math.min(1, p.hp / maxHp)) : 0;
      hudHpFill.style.width = Math.round(frac * 100) + '%';
      hudHpFill.style.background = frac > 0.5 ? '#35e05c' : frac > 0.25 ? '#ffb020' : '#e0523d';
    }
    hudDepth.textContent = state.depth;
    hudCarried.textContent = state.carried;
    hudBanked.textContent = state.banked;
    if (hudAmmo) {
      var pools = state.ammoPools || { standard: 0, piercing: 0, incendiary: 0, shock: 0 };
      var sel = C.isAmmoType && C.isAmmoType(state.selectedAmmo) ? state.selectedAmmo : 'standard';
      hudAmmo.textContent = (C.AMMO_TYPE_SHORT ? C.AMMO_TYPE_SHORT[sel]
        : (C.AMMO_TYPE_NAMES ? C.AMMO_TYPE_NAMES[sel] : sel)) + ' ' + (pools[sel] || 0);
    }
    // Phase 6: keys segment — shown only while any key is carried
    // (the common empty case costs no HUD width at 390px).
    if (hudKeysWrap) {
      var nKeys = (state.keys && state.keys.length) || 0;
      hudKeysWrap.style.display = nKeys ? '' : 'none';
      if (hudKeys) hudKeys.textContent = nKeys;
    }
    syncQuickbar();
    if (hudPower) {
      hudPower.textContent = state.powerState === 'ok' ? 'OK' : state.powerState === 'low' ? 'LOW' : 'STARVING';
      hudPower.style.color = ''; // vision palette: pale text, no coloured segments
    }
    if (hudTurn) hudTurn.textContent = state.state === 'playing' ? 'PLAYER TURN' : state.state === 'stairs' ? 'STAIRS' : state.state === 'dead' ? 'DESTROYED' : state.state === 'extracted' ? 'EXTRACTED' : state.state;
    // Phase 3: meters line — energy, heat, active mech effects.
    // Collapses when energy is full, heat is 0, nothing is active,
    // and the run is not overheated (proposed default, §14 #3).
    if (hudMeters) {
      var e = (typeof state.energy === 'number') ? state.energy : 100;
      var h = (typeof state.heat === 'number') ? state.heat : 0;
      var effBits = [];
      if (state.mechEffects) {
        if (state.mechEffects.overclockShots > 0) effBits.push('Overclock x' + state.mechEffects.overclockShots);
        if (state.mechEffects.salvageBurst) effBits.push('Salvage Burst armed');
        if (typeof state.clock === 'number') {
          if (state.mechEffects.evasiveUntil > state.clock) effBits.push('Evasive ' + Math.ceil((state.mechEffects.evasiveUntil - state.clock) / 10) + 'u');
          if (state.mechEffects.platingUntil > state.clock) effBits.push('Plating ' + Math.ceil((state.mechEffects.platingUntil - state.clock) / 10) + 'u');
        }
      }
      var showMeters = e < 100 || h > 0 || state.overheated || effBits.length > 0;
      if (showMeters) {
        hudMeters.textContent = 'Energy ' + e + '/100 · Heat ' + h + '/100' +
          (state.overheated ? ' · OVERHEATED' : '') +
          (effBits.length ? ' · ' + effBits.join(' · ') : '') +
          ' · Skill pts ' + (state.runSkillPoints || 0);
        hudMeters.classList.remove('hidden');
      } else {
        hudMeters.textContent = '';
        hudMeters.classList.add('hidden');
      }
    }
    syncStairsPanel();
    // Vision layout 2: NO banner. Targeting feedback is the red
    // outline on the adjacent enemy plus a small name/HP label drawn
    // above its tile in render() (tapping the outlined enemy still
    // attacks, via the canvas pointer handler). No banner element
    // remains in the DOM.
    // Transient message: the latest log line fades over the bottom
    // edge of the map for a few seconds, then disappears. No
    // permanent message row; full history is in Menu / log overlay.
    if (transientMsgEl) {
      var line = state.log.length ? state.log[state.log.length - 1] : '';
      if (line) {
        transientMsgEl.textContent = line;
        transientMsgEl.classList.add('show');
        if (transientTimer) clearTimeout(transientTimer);
        transientTimer = setTimeout(function () { transientMsgEl.classList.remove('show'); }, 3500);
      } else {
        transientMsgEl.classList.remove('show');
      }
    }
    autosave();
  }

  // Quickslot bar (Pixel Dungeon style): weapon/FIRE slot + item
  // slots with live counts. Counts update in refreshHud; a zero
  // count dims the slot but stays tappable so the refusal is logged.
  function syncQuickbar() {
    var pools = state.ammoPools || { standard: 0, piercing: 0, incendiary: 0, shock: 0 };
    var sel = C.isAmmoType && C.isAmmoType(state.selectedAmmo) ? state.selectedAmmo : 'standard';
    var counts = [
      ['qs-ammo-count', pools[sel] || 0, 'btn-fire'],
      ['qs-health-count', state.healthCells || 0, 'qs-health'],
      ['qs-food-count', state.foodCells || 0, 'qs-food'],
      ['qs-repair-count', state.repairKits || 0, 'qs-repair'],
    ];
    counts.forEach(function (c) {
      var el = document.getElementById(c[0]);
      if (el) el.textContent = c[1];
      var btn = document.getElementById(c[2]);
      if (btn) btn.classList.toggle('empty', !(c[1] > 0));
    });
  }

  function wreckStatusText() {
    if (!hub.wreck) return 'No wreck waiting.';
    var w = hub.wreck;
    var gearBits = [];
    if (w.gear) {
      ['weapon', 'armor', 'shield', 'utility'].forEach(function (slot) {
        if (w.gear[slot] && C.itemDisplayName) gearBits.push(C.itemDisplayName(w.gear[slot]));
      });
    }
    var ammoBits = [];
    if (w.ammoPools) {
      C.AMMO_TYPES.forEach(function (t) { if (w.ammoPools[t]) ammoBits.push(w.ammoPools[t] + ' ' + C.AMMO_TYPE_NAMES[t]); });
    } else if (w.ammo) {
      ammoBits.push(w.ammo + ' Standard');
    }
    return 'Wreck waiting at depth ' + w.depth + ': ' + w.salvage + ' salvage, ' + w.health + ' health cells, ' + w.food + ' food, ' + w.components + ' components' + (w.repairKit ? ', ' + w.repairKit + ' repair kits' : '') + (ammoBits.length ? ', ' + ammoBits.join(', ') + ' ammo' : '') + (gearBits.length ? '. Gear: ' + gearBits.join(', ') : '') + '. Recover it before you die again — a second death destroys it.';
  }
  function codexListHtml() {
    if (!hub.codex || !hub.codex.length) return '<i>No Codex entries yet. Data chips in loot rooms record one the moment you find it.</i>';
    return hub.codex.map(function (e) { return '• ' + e; }).join('<br>');
  }
  // Hub screen (Phase 2 summary, Phase 3 stations): shown after
  // Extract, on load when a run save exists, and from the Hub button
  // when no run is in progress. Every station does something real
  // or says plainly that it is Phase 4 — no decorative buttons.
  // Role titles only: the draft names are placeholders, not canon,
  // and are never shown here.
  function showHubScreen(kind) {
    Array.prototype.slice.call(document.querySelectorAll('.hub-stations')).forEach(function (el) { el.remove(); });
    var title = kind === 'extracted' ? 'EXTRACTED — back at the hub' : kind === 'load' ? 'HUB — saved expedition found' : 'HUB';
    var extra = '';
    if (kind === 'extracted') {
      extra = 'Extracted salvage secured: <b>' + (state.lastExtracted || 0) + '</b><br>';
    } else if ((state.state === 'playing' || state.state === 'stairs') && kind === 'load') {
      extra = 'Resumable run: depth <b>' + state.depth + '</b>, HP <b>' + state.player.hp + '/' + state.player.maxHp + '</b>, carried <b>' + state.carried + '</b><br>';
    }
    var buttons = [{ label: 'New Expedition', onClick: newExpedition }];
    var hasRunSave = false;
    try { hasRunSave = !!C.loadRun(localStorage); } catch (e) { hasRunSave = false; }
    if (hasRunSave) {
      buttons.push({ label: 'Continue', onClick: function () {
        hideModal();
        if (state.state === 'stairs') openStairsModal();
        refreshHud();
      } });
    }
    showModal(title,
      extra +
      'Banked salvage: <b>' + hub.banked + '</b><br>' +
      'Stockpiled components: <b>' + (hub.components || 0) + '</b><br>' +
      'Materials: <b>' + (hub.materials ? hub.materials.wire : 0) + ' wire, ' + (hub.materials ? hub.materials.coreThermal : 0) + ' thermal cores, ' + (hub.materials ? hub.materials.coreShock : 0) + ' shock cores, ' + (hub.materials ? hub.materials.coreCorrosive : 0) + ' corrosive cores</b><br>' +
      'Ammo stockpile: <b>' + C.AMMO_TYPES.map(function (t) { return (hub.stockpile['ammo' + t[0].toUpperCase() + t.slice(1)] || 0) + ' ' + C.AMMO_TYPE_NAMES[t]; }).join(', ') + '</b><br>' +
      'Chassis tier: <b>' + (hub.chassisTier || 0) + '/5</b> (+' + ((hub.chassisTier || 0) * 10) + ' max HP) · Banking: <b>' + Math.round(C.bankingRateFor(hub) * 100) + '%</b><br>' +
      'Pilot XP: <b>' + (hub.pilotXp || 0) + '</b> · Pilot skill ranks: <b>' + C.totalPilotRanks(hub) + '</b> (see The Instructor on the Pilot tab)<br>' +
      'Kills this run: <b>' + state.kills + '</b><br><br>' +
      '<b>Wreck</b><br>' + wreckStatusText() + '<br><br>' +
      '<b>Codex</b><br>' + codexListHtml(),
      buttons);
    // ---- stations ----
    var wrap = document.createElement('div');
    wrap.className = 'hub-stations';
    wrap.style.marginTop = '12px';
    var msg = document.createElement('div');
    msg.style.marginBottom = '8px';
    wrap.appendChild(msg);
    function stationBtn(label, fn) {
      var b = document.createElement('button');
      b.textContent = label;
      b.style.minHeight = '48px'; b.style.margin = '2px';
      b.onclick = function () {
        var res = fn();
        // Keep the failure reason visible: showHubScreen rebuilds the
        // stations (and the msg div) below, which used to wipe it.
        var note = (res && !res.ok && res.reason) ? res.reason : '';
        refreshHud();
        showHubScreen(kind);
        if (note) {
          var m = document.querySelector('.hub-stations > div');
          if (m) m.textContent = note;
        }
      };
      return b;
    }
    function station(titleText, bodyText, btns, tab) {
      var sec = document.createElement('div');
      sec.className = 'neon-card';
      if (tab) sec.setAttribute('data-hub-tab', tab);
      var h = document.createElement('div');
      h.innerHTML = '<b>' + titleText + '</b><br>' + bodyText;
      sec.appendChild(h);
      (btns || []).forEach(function (b) { sec.appendChild(b); });
      wrap.appendChild(sec);
      return sec; // Phase 3: the Instructor appends data-driven rows.
    }
    // The Mechanic: chassis upgrades, +10 max HP per tier, cap 5.
    var nextChassisCost = (hub.chassisTier || 0) < 5 ? C.CHASSIS_TIER_COSTS[hub.chassisTier || 0] : null;
    station('The Mechanic — chassis upgrades',
      'Tier ' + (hub.chassisTier || 0) + '/5. Next tier: +' + ((hub.chassisTier || 0) + 1) * 10 + ' max HP total (from base 100).' +
      (nextChassisCost === null ? ' Max tier reached.' : ' Cost: ' + nextChassisCost + ' banked salvage.'),
      nextChassisCost === null ? [] : [stationBtn('Buy chassis tier (' + nextChassisCost + ' salvage)', function () { return C.buyChassisTier(hub); })], 'Upgrades');
    // The Salvager: components <-> salvage, worse rate on the way back.
    var salvSec = station('The Salvager — exchange',
      '1 component = 8 banked salvage. Reverse: 15 banked salvage = 1 component (deliberately worse).',
      [
        stationBtn('1 comp → 8 salvage', function () { return C.convertComponentsToSalvage(hub, 1); }),
        stationBtn('5 comp → 40 salvage', function () { return C.convertComponentsToSalvage(hub, 5); }),
        stationBtn('15 salvage → 1 comp', function () { return C.convertSalvageToComponents(hub, 1); }),
        stationBtn('75 salvage → 5 comp', function () { return C.convertSalvageToComponents(hub, 5); }),
      ], 'Salvage & Crafting');
    // Phase 4 (§7.6.1–7.6.2): breakdown. Fixed yields at every rank,
    // one item per action, irreversible — confirmed before it runs.
    // Equipped items are not offered (unequip first); unrecovered
    // wreck gear is not offered (recover it first).
    (function breakdownRows() {
      var head = document.createElement('div');
      head.style.marginTop = '8px';
      if (!C.pilotPhase4Unlock(hub, 'breakdown')) {
        head.innerHTML = '<b>Breakdown</b> — unlocks with the Breakdown pilot skill at rank 1 (see The Instructor). Yields are fixed at every rank.';
        salvSec.appendChild(head);
        return;
      }
      var mats = hub.materials || { wire: 0, coreThermal: 0, coreShock: 0, coreCorrosive: 0 };
      head.innerHTML = '<b>Breakdown</b> — materials held: ' + mats.wire + ' wire, ' + mats.coreThermal + ' thermal, ' + mats.coreShock + ' shock, ' + mats.coreCorrosive + ' corrosive cores (cap 999 each). Yields are fixed: component 3 wire + 1 core; Common 2+0; Uncommon 4+1; Rare 6+2; Epic 10+3; Legendary 16+5. Irreversible.';
      salvSec.appendChild(head);
      function confirmBreakdown(label, preview, fn) {
        showModal('Break down — irreversible',
          preview + '<br><br>This cannot be undone. The item is gone; only the materials remain.',
          [
            { label: 'Break it down', onClick: function () {
              var res = fn();
              refreshHud();
              showHubScreen(kind);
              var m = document.querySelector('.hub-stations > div');
              if (m) m.textContent = res.ok ? (label + ': +' + res.wire + ' wire' + (res.cores ? ', +' + (res.cores.coreThermal + res.cores.coreShock + res.cores.coreCorrosive) + ' core(s)' : '') + '.') : (res.reason || 'Breakdown failed.');
            } },
            { label: 'Cancel', onClick: function () { showHubScreen(kind); } },
          ]);
      }
      var compRow = document.createElement('div');
      compRow.style.marginTop = '4px';
      compRow.textContent = 'Components held: ' + (hub.components || 0) + ' — break down 1 component → 3 wire + 1 core roll. ';
      var compBtn = document.createElement('button');
      compBtn.textContent = 'Break down 1 component';
      compBtn.style.minHeight = '48px'; compBtn.style.margin = '2px';
      compBtn.onclick = function () { confirmBreakdown('Component', 'Break down 1 component into 3 wire + 1 core roll?', function () { return C.breakDownComponent(hub, rng); }); };
      compRow.appendChild(compBtn);
      salvSec.appendChild(compRow);
      (state.carriedGear || []).forEach(function (inst, idx) {
        var norm = C.normalizeItemInstance(inst);
        var y = C.BREAKDOWN_YIELDS[norm.tier];
        var row = document.createElement('div');
        row.style.marginTop = '4px';
        row.textContent = C.itemDisplayName(norm) + ' → ' + y.wire + ' wire + ' + y.cores + ' core roll(s). ';
        var b = document.createElement('button');
        b.textContent = 'Break down';
        b.style.minHeight = '48px'; b.style.margin = '2px';
        b.setAttribute('data-breakdown-index', String(idx));
        b.onclick = (function (i, name) {
          return function () { confirmBreakdown(name, 'Break down ' + name + ' into ' + y.wire + ' wire + ' + y.cores + ' core roll(s)?', function () { return C.breakDownGear(hub, state, i, rng); }); };
        })(idx, C.itemDisplayName(norm));
        row.appendChild(b);
        salvSec.appendChild(row);
      });
    })();
    // The Researcher: Codex viewer (in the body above) + banking tiers.
    var bt = C.BANKING_TIERS[hub.bankingTier || 0];
    var nextBt = (hub.bankingTier || 0) < C.BANKING_TIERS.length - 1 ? C.BANKING_TIERS[(hub.bankingTier || 0) + 1] : null;
    station('The Researcher — Codex and banking',
      'Banking rate now: ' + Math.round(bt.rate * 100) + '%.' +
      (nextBt ? ' Next tier: ' + Math.round(nextBt.rate * 100) + '% for ' + nextBt.cost + ' banked salvage, requires ' + nextBt.codexNeeded + ' Codex entries (you have ' + hub.codex.length + ').' : ' Max banking tier reached.') +
      ' Codex entries are listed above; hub growth follows recovered tech, not just salvage spent.',
      nextBt ? [stationBtn('Buy banking tier (' + nextBt.cost + ' salvage)', function () { return C.buyBankingTier(hub); })] : [], 'Upgrades');
    // The Armorer: data-driven recipes into the hub stockpile, plus
    // Enhance (Phase 4, §7.6.7). Typed recipes are gated on Ammo
    // Smith ranks and need no Codex entry; refusals name the reason.
    var armBtns = [];
    Object.keys(C.RECIPES).forEach(function (rid) {
      var r = C.RECIPES[rid];
      var ing = [];
      if (r.ingredients.components) ing.push(r.ingredients.components + ' comp');
      if (r.ingredients.salvage) ing.push(r.ingredients.salvage + ' salvage');
      if (r.ingredients.wire) ing.push(r.ingredients.wire + ' wire');
      if (r.ingredients.coreThermal) ing.push(r.ingredients.coreThermal + ' thermal core');
      if (r.ingredients.coreShock) ing.push(r.ingredients.coreShock + ' shock core');
      if (r.ingredients.coreCorrosive) ing.push(r.ingredients.coreCorrosive + ' corrosive core');
      var gate = r.requires ? ' — needs Ammo Smith rank ' + r.requires.rank : '';
      armBtns.push(stationBtn('Craft ' + r.name + ' (' + ing.join(' + ') + ' → ' + r.outputCount + ')' + gate, function () { return C.craft(hub, rid); }));
    });
    var sp = hub.stockpile || { health: 0, food: 0, repairKit: 0, ammoStandard: 0, ammoPiercing: 0, ammoIncendiary: 0, ammoShock: 0 };
    var spAmmo = C.AMMO_TYPES.map(function (t) { return (sp['ammo' + t[0].toUpperCase() + t.slice(1)] || 0) + ' ' + C.AMMO_TYPE_NAMES[t]; }).join(', ');
    var armSec = station('The Armorer — crafting',
      'Stockpile: ' + sp.health + ' health cells, ' + sp.food + ' food, ' + sp.repairKit + ' repair kits, ' + spAmmo + ' ammo. ' +
      'Crafted items wait in the hub; the next expedition takes up to 2 health cells, 2 food, 1 repair kit, and its ammo from the Loadout below. ' +
      'A repair kit restores 50 HP from the Bag or the wrench popup. Recipes fail honestly when ingredients are short or the 999 stockpile cap would be exceeded.',
      armBtns, 'Salvage & Crafting');
    // Enhance: hub-only, one instance at a time, atomic. It edits
    // THIS run's gear: a new expedition starts fresh, so enhanced
    // gear survives only by continuing this run or recovering it
    // from a wreck after death. Said plainly, not hidden.
    (function enhanceRows() {
      var head = document.createElement('div');
      head.style.marginTop = '8px';
      head.innerHTML = '<b>Enhance</b> — cost 4 wire × target level + 1 matching core for elemental items; ceiling +5; tier, affixes, and dice never change. Enhances this run\u2019s gear: a new expedition starts fresh — enhanced gear survives only by continuing this run or by wreck recovery.';
      armSec.appendChild(head);
      function enhanceRow(label, loc, inst) {
        var ec = C.enhanceCost(inst);
        var row = document.createElement('div');
        row.style.marginTop = '4px';
        var tag = inst.element ? ' [' + inst.element + ']' : '';
        if (!ec.ok) {
          row.textContent = label + tag + ' — ' + ec.reason;
          armSec.appendChild(row);
          return;
        }
        var costText = ec.cost.wire + ' wire' + (ec.cost.core ? ' + 1 ' + ec.cost.coreKind : '');
        row.textContent = label + tag + ' +' + inst.upgrade + ' → +' + ec.target + ' (' + costText + '). ';
        var b = document.createElement('button');
        b.textContent = 'Enhance';
        b.style.minHeight = '48px'; b.style.margin = '2px';
        b.setAttribute('data-enhance-slot', loc.slot || ('carried-' + loc.carriedIndex));
        b.onclick = function () {
          var res = C.enhanceItem(hub, state, loc);
          refreshHud();
          showHubScreen(kind);
          var m = document.querySelector('.hub-stations > div');
          if (m) m.textContent = res.ok ? (C.itemDisplayName(res.item) + ' enhanced to +' + res.target + '.') : (res.reason || 'Enhance failed.');
        };
        row.appendChild(b);
        armSec.appendChild(row);
      }
      if (state.weapon) enhanceRow(C.itemDisplayName(state.weapon) + ' (equipped weapon)', { slot: 'weapon' }, state.weapon);
      ['armor', 'shield', 'utility'].forEach(function (slot) {
        var inst = state.equipment ? state.equipment[slot] : null;
        if (inst) enhanceRow(C.itemDisplayName(inst) + ' (equipped ' + slot + ')', { slot: slot }, inst);
      });
      (state.carriedGear || []).forEach(function (inst, idx) {
        enhanceRow(C.itemDisplayName(inst) + ' (Bag)', { carriedIndex: idx }, inst);
      });
    })();
    // The Loadout: player-chosen starting ammo for the next
    // expedition (Phase 4, §7.6.4). The allocated part is drawn
    // from the hub stockpile when the expedition starts; the run is
    // topped up to 16 with free Standard rounds.
    (function loadoutStation() {
      var sec = station('Loadout — starting ammo',
        'Choose what the next expedition carries. Allocated rounds come from the hub stockpile; the run is topped up to 16 total with free Standard rounds. At most 12 of any one type, at most 16 total, never more than the hub owns. Skipping (all zero) starts with 16 free Standard.',
        [], 'Loadout');
      var preview = C.computeLoadout(hub, pendingLoadout);
      var totalLine = document.createElement('div');
      totalLine.style.marginTop = '4px';
      totalLine.innerHTML = 'Run starts with: <b>' + C.AMMO_TYPES.map(function (t) { return preview.pools[t] + ' ' + C.AMMO_TYPE_NAMES[t]; }).join(', ') + '</b>' + (preview.ok ? '' : ' — <i>invalid choice, default applies: ' + preview.reason + '</i>');
      sec.appendChild(totalLine);
      C.AMMO_TYPES.forEach(function (t) {
        var key = 'ammo' + t[0].toUpperCase() + t.slice(1);
        var owned = (hub.stockpile && hub.stockpile[key]) || 0;
        var cur = pendingLoadout ? (pendingLoadout[t] || 0) : 0;
        var row = document.createElement('div');
        row.style.marginTop = '4px';
        row.textContent = C.AMMO_TYPE_NAMES[t] + ' (hub owns ' + owned + '): ' + cur + ' ';
        var minus = document.createElement('button');
        minus.textContent = '−'; minus.style.minHeight = '48px'; minus.style.margin = '2px';
        minus.setAttribute('data-loadout-minus', t);
        minus.onclick = function () {
          if (!pendingLoadout) pendingLoadout = { standard: 0, piercing: 0, incendiary: 0, shock: 0 };
          pendingLoadout[t] = Math.max(0, pendingLoadout[t] - 1);
          showHubScreen(kind);
        };
        var plus = document.createElement('button');
        plus.textContent = '+'; plus.style.minHeight = '48px'; plus.style.margin = '2px';
        plus.setAttribute('data-loadout-plus', t);
        plus.onclick = function () {
          if (!pendingLoadout) pendingLoadout = { standard: 0, piercing: 0, incendiary: 0, shock: 0 };
          var total = C.AMMO_TYPES.reduce(function (n, k) { return n + pendingLoadout[k]; }, 0);
          if (pendingLoadout[t] < C.LOADOUT_TYPE_CAP && total < C.LOADOUT_TOTAL_CAP && pendingLoadout[t] < owned) pendingLoadout[t]++;
          showHubScreen(kind);
        };
        row.appendChild(minus);
        row.appendChild(plus);
        sec.appendChild(row);
      });
      var resetBtn = document.createElement('button');
      resetBtn.textContent = 'Reset to default (16 Standard)';
      resetBtn.style.minHeight = '48px'; resetBtn.style.margin = '2px';
      resetBtn.onclick = function () { pendingLoadout = null; showHubScreen(kind); };
      sec.appendChild(resetBtn);
    })();
    // The Scout: exact preview from the real generator.
    var preview, previewLabel;
    if ((state.state === 'playing' || state.state === 'stairs') && kind === 'load') {
      preview = C.scoutPreview(runSeed, state.depth + 1);
      previewLabel = 'Next floor of your saved expedition (depth ' + preview.depth + ', ' + preview.theme + '): ';
    } else {
      preview = C.scoutPreview(getNextExpeditionSeed(), 1);
      previewLabel = 'Next expedition, depth 1 (' + preview.theme + ') — this preview is exact, because the expedition seed is fixed when the hub opens: ';
    }
    station('The Scout — threat intel',
      previewLabel + preview.byType.map(function (b) { return b.count + '× ' + b.name; }).join(', ') + ' (' + preview.total + ' total). No invented enemies — counted from the floor generator itself.',
      [], 'Intel');
    // The Radio Operator: rumors only, no quests or contracts (Phase 4).
    station('The Radio Operator — rumors',
      C.rumors(hub).join('<br>') + '<br><i>These are rumors, not quests: nothing here asks you to go anywhere or accept a contract.</i>',
      [], 'Intel');
    // The Instructor — pilot skills (Phase 3, PROPOSED station name):
    // permanent ranks bought with banked salvage, gated by Codex
    // entries and pilot XP. Rendered from the PILOT_SKILLS data
    // table — no hand-written per-skill UI (§6.5). Buy and respec
    // happen here only, never mid-run. Pilot skills are passive:
    // they never cost energy or heat, and they survive death.
    var totalRanks = C.totalPilotRanks(hub);
    var instSec = station('The Instructor — pilot skills',
      'Pilot XP: <b>' + (hub.pilotXp || 0) + '</b> · Ranks held: <b>' + totalRanks + '</b>. ' +
      'Each rank costs banked salvage and needs the listed pilot XP and Codex entries. ' +
      'Respec refunds every rank at 25 salvage per rank; Codex entries and pilot XP are kept.',
      totalRanks ? [stationBtn('Respec all ranks (' + (C.RESPEC_COST_PER_RANK * totalRanks) + ' salvage)', function () { return C.respecPilotSkills(hub); })] : [], 'Pilot');
    C.PILOT_SKILL_TREES.forEach(function (tree) {
      var treeRow = document.createElement('div');
      treeRow.style.marginTop = '8px';
      treeRow.innerHTML = '<b>' + tree.name + '</b>';
      instSec.appendChild(treeRow);
      tree.skills.forEach(function (id) {
        var def = C.PILOT_SKILLS[id];
        var rank = C.pilotSkillRank(hub, id);
        var pips = '●'.repeat(rank) + '○'.repeat(3 - rank);
        var row = document.createElement('div');
        row.style.marginTop = '4px';
        var next = rank < 3
          ? 'Next rank: ' + def.costs[rank] + ' salvage, ' + def.xpNeeded[rank] + ' pilot XP, ' + def.codexNeeded + ' Codex entries.'
          : 'Max rank.';
        row.innerHTML = '<b>' + def.name + '</b> ' + pips + ' — ' + def.desc + '<br><span style="opacity:.8">' + next + '</span> ';
        if (rank < 3) {
          row.appendChild(stationBtn('Buy rank ' + (rank + 1) + ' (' + def.costs[rank] + ' salvage)', (function (sid) {
            return function () { return C.buyPilotSkill(hub, sid); };
          })(id)));
        }
        instSec.appendChild(row);
      });
    });
    // Menu-tabs wave: the tab bar sits after the msg line (which
    // station actions rewrite via '.hub-stations > div'), and only
    // the active group's stations show. Same stations, same order
    // inside each group, same buttons. The wrap must be in the
    // document BEFORE applyHubTab runs, or its query finds nothing
    // and every station shows until the first tab click.
    modalBtns.parentNode.appendChild(wrap);
    var hubBar = makeTabBar(['Upgrades', 'Salvage & Crafting', 'Loadout', 'Intel', 'Pilot'], hubTab, function (t) { hubTab = t; applyHubTab(); });
    hubBar.className = 'tab-bar hub-tabs';
    wrap.insertBefore(hubBar, msg.nextSibling);
    applyHubTab();
  }

  function openStairsModal() {
    // Visual overhaul: the panel is synced by refreshHud; this keeps
    // every existing call site (move, keyboard, hub Continue) working.
    syncStairsPanel();
  }
  function openDeadModal() {
    showModal('MECH DESTROYED', 'Depth reached: <b>' + state.depth + '</b><br>Banked salvage kept: <b>' + state.banked + '</b><br>Carried salvage lost to the wreck: <b>' + state.lostOnDeath + '</b><br>Kills: <b>' + state.kills + '</b><br><br><b>Wreck</b><br>' + wreckStatusText() + '<br><br><b>Codex</b><br>' + codexListHtml(),
      [{ label: 'Hub', onClick: function () { hideModal(); showHubScreen('hub'); } },
       { label: 'New Expedition (R)', onClick: newExpedition }]);
  }
  // New Expedition: a fresh run that KEEPS the hub (banked salvage,
  // components, Codex, wreck). This is the Phase 2 fix for the
  // Phase 1 behaviour where Restart reset banked salvage.
  function newExpedition() {
    try { C.clearRun(localStorage); } catch (e) {}
    if (nextExpeditionSeed) { runSeed = nextExpeditionSeed; nextExpeditionSeed = null; }
    else runSeed = (Math.floor(Math.random() * 4294967296)) >>> 0;
    rng = C.mulberry32(runSeed ^ 0x9e3779b9);
    state = C.newRun(runSeed, hub, pendingLoadout);
    pendingLoadout = null;
    floats = [];
    anims = {};
    hideModal();
    C.logMsg(state, 'New expedition, seed ' + runSeed + '. Depth 1.' + (hub.wreck ? ' A wreck waits at depth ' + hub.wreck.depth + '.' : ''));
    refreshHud();
  }

  // ---------- input ----------
  var KEY_DIRS = {
    ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
    ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
    ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
    ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
    q: [-1, -1], Q: [-1, -1],
    e: [1, -1], E: [1, -1],
    z: [-1, 1], Z: [-1, 1],
    c: [1, 1], C: [1, 1],
  };
  function doMove(dx, dy) {
    if (state.state === 'stairs' || state.state === 'dead' || state.state === 'extracted') return;
    var foe = null, foeHpBefore = 0, hpBefore = state.player.hp;
    applyEnemyAnims._hpBefore = hpBefore;
    var enemiesBefore = snapshotEnemies();
    var tx = state.player.x + dx, ty = state.player.y + dy;
    var target = state.floor.enemies.find(function (en) { return en.alive && en.x === tx && en.y === ty; });
    if (target) { foe = target; foeHpBefore = target.hp; }
    var pxBefore = state.player.x, pyBefore = state.player.y;
    var res = C.playerAction(state, rng, dx, dy);
    // Fixwave: single-step moves (keyboard, adjacent tap) slide too,
    // from the pre-move tile to the post-move tile. Attacks and
    // refusals do not move, so they get no slide.
    if (res && res.moved) { setWalk('player'); startSlide('player', pxBefore, pyBefore, state.player.x, state.player.y); }
    if (res && res.attacked) setPose('player', 'attack', 350);
    if (foe && foeHpBefore > foe.hp) { addFloat(foe.x, foe.y, '-' + (foeHpBefore - foe.hp), '#ff7a5c'); setPose(foe.id, 'damaged', 300); }
    if (state.player.hp < hpBefore) { addFloat(state.player.x, state.player.y, '-' + (hpBefore - state.player.hp), '#e0523d'); setPose('player', 'damaged', 300); }
    applyEnemyAnims(enemiesBefore);
    if (res && res.stairs) openStairsModal();
    if (state.state === 'dead') openDeadModal();
    refreshHud();
    return res;
  }
  function doWait() {
    if (state.state !== 'playing') return;
    cancelWalk(); // fixwave: a fresh input retires any in-flight walk
    var hpBefore = state.player.hp;
    applyEnemyAnims._hpBefore = hpBefore;
    var enemiesBefore = snapshotEnemies();
    C.playerWait(state, rng);
    if (state.player.hp < hpBefore) { addFloat(state.player.x, state.player.y, '-' + (hpBefore - state.player.hp), '#e0523d'); setPose('player', 'damaged', 300); }
    applyEnemyAnims(enemiesBefore);
    if (state.state === 'dead') openDeadModal();
    refreshHud();
  }
  // Fire the equipped weapon along the current facing (quickbar FIRE
  // slot or the F key). Refusals cost nothing and are logged so they
  // show in the transient overlay. Mirrors doMove's float/pose/death
  // handling; the shot itself is C.fireWeapon in core.js.
  function doFire() {
    if (state.state !== 'playing') return;
    cancelWalk(); // fixwave
    var hpBefore = state.player.hp;
    applyEnemyAnims._hpBefore = hpBefore;
    var enemiesBefore = snapshotEnemies();
    var res = C.fireWeapon(state, rng);
    // Phase 4: an auto-switch already logged its exact message in
    // fireWeapon — do not double-log a generic refusal line.
    if (!res.ok) { if (!res.switched) C.logMsg(state, 'Fire: ' + res.reason + '.'); refreshHud(); return; }
    setPose('player', 'attack', 350);
    // Graphics pass: muzzle flash + tracer + impact sparks. The
    // tracer ends on the first hit, or — on a miss — on the first
    // wall/void/closed-door cell along the facing line (visual
    // only; the core already decided hit/miss/damage).
    (function () {
      var dir = C.DIRS[state.player.facing] || C.DIRS[0];
      var px = state.player.x + 0.5, py = state.player.y + 0.5;
      spawnTracer(px, py, px + dir.dx * 0.7, py + dir.dy * 0.7, '#fff3c4');
      var ex, ey;
      if (res.targetX != null && res.targetY != null) { ex = res.targetX + 0.5; ey = res.targetY + 0.5; }
      else {
        ex = px; ey = py;
        for (var s = 0; s < 12; s++) {
          var nx = state.player.x + dir.dx * (s + 1), ny = state.player.y + dir.dy * (s + 1);
          if (nx < 0 || ny < 0 || nx >= C.GRID_W || ny >= C.GRID_H) break;
          var t = state.floor.grid[ny][nx];
          var dr = C.doorAt ? C.doorAt(state.floor, nx, ny) : null;
          if (t === 'wall' || t === 'void' || (dr && dr.state !== 'open')) break;
          ex = nx + 0.5; ey = ny + 0.5;
        }
      }
      spawnTracer(px, py, ex, ey, '#ffe08a');
      if (res.targetX != null) spawnSparks(res.targetX, res.targetY, '#ffb020', 8);
      else spawnSparks(Math.round(ex - 0.5), Math.round(ey - 0.5), '#ffb020', 4);
    })();
    // Multi-target patterns (beam/cone/splash) report every hit;
    // single-target patterns report the one hit, as before.
    var hitList = (res.hits && res.hits.length) ? res.hits : (res.hit ? [{ x: res.targetX, y: res.targetY, damage: res.damage }] : []);
    hitList.forEach(function (h) {
      addFloat(h.x, h.y, '-' + h.damage, '#ff7a5c');
      var foe = state.floor.enemies.find(function (en) { return en.alive && en.x === h.x && en.y === h.y; });
      if (foe) setPose(foe.id, 'damaged', 300);
    });
    if (state.player.hp < hpBefore) { addFloat(state.player.x, state.player.y, '-' + (hpBefore - state.player.hp), '#e0523d'); setPose('player', 'damaged', 300); }
    applyEnemyAnims(enemiesBefore);
    if (state.state === 'dead') openDeadModal();
    refreshHud();
  }
  var fireBtn = document.getElementById('btn-fire');
  if (fireBtn) fireBtn.addEventListener('click', doFire);
  // Phase 6 (§9.7.5): FORCE targets the locked door the player
  // faces; refusal text is the core's (no-door / not-locked).
  // Bypass always refuses with the spec-fixed text, logged by
  // the core itself — the button only refreshes the HUD.
  function doForce() {
    if (state.state !== 'playing') return;
    cancelWalk(); // fixwave
    var dir = C.DIRS[state.player.facing] || C.DIRS[0];
    var res = C.forceDoor(state, rng, dir.dx, dir.dy);
    if (!res.ok) C.logMsg(state, 'Force: ' + res.reason + '.');
    // Graphics pass: impact sparks on the faced door tile, hit or
    // refused — the core result above is unchanged.
    spawnSparks(state.player.x + dir.dx, state.player.y + dir.dy, '#ff9a1f', 8);
    spawnTracer(state.player.x + 0.5, state.player.y + 0.5,
      state.player.x + dir.dx + 0.5, state.player.y + dir.dy + 0.5, '#ffb020');
    if (state.state === 'dead') openDeadModal();
    refreshHud();
  }
  function doBypass() {
    if (state.state !== 'playing') return;
    cancelWalk(); // fixwave
    C.attemptBypass(state);
    refreshHud();
  }
  var forceBtn = document.getElementById('btn-force');
  if (forceBtn) forceBtn.addEventListener('click', doForce);
  var qsHealthBtn = document.getElementById('qs-health');
  if (qsHealthBtn) qsHealthBtn.addEventListener('click', function () { useItemAndReport(C.useHealthCell, 'Health cell'); });
  var qsFoodBtn = document.getElementById('qs-food');
  if (qsFoodBtn) qsFoodBtn.addEventListener('click', function () { useItemAndReport(C.useFood, 'Food'); });
  var qsRepairBtn = document.getElementById('qs-repair');
  if (qsRepairBtn) qsRepairBtn.addEventListener('click', function () { useItemAndReport(C.useRepairKit, 'Repair kit'); });
  document.addEventListener('keydown', function (ev) {
    cancelWalk(); // fixwave: a fresh key retires any in-flight walk
    if (state.state === 'stairs') {
      if (ev.key === '1') { hideModal(); C.descend(state, runSeed); refreshHud(); }
      else if (ev.key === '2') { hideModal(); C.extract(state); showHubScreen('extracted'); refreshHud(); }
      else if (ev.key === 'Escape') { hideModal(); C.cancelStairs(state, rng); refreshHud(); }
      return;
    }
    if (state.state === 'dead' || state.state === 'extracted') {
      if (ev.key === 'r' || ev.key === 'R' || ev.key === 'Enter') newExpedition();
      return;
    }
    if (ev.key === ' ' || ev.key === '.') { ev.preventDefault(); doWait(); return; }
    if (ev.key === 'f' || ev.key === 'F') { ev.preventDefault(); doFire(); return; }
    // Phase 6 (§9.7.5): X forces the locked door the player faces
    // (1 time unit even on 0 damage, noise after resolution); B
    // attempts Bypass, which always refuses with the spec-fixed
    // text at zero time/RNG/noise. X and B are unbound elsewhere
    // (verified 2026-10-29: Q/E/Z/C are diagonals, T cycles ammo).
    if (ev.key === 'x' || ev.key === 'X') { ev.preventDefault(); doForce(); return; }
    if (ev.key === 'b' || ev.key === 'B') { ev.preventDefault(); doBypass(); return; }
    // Phase 4 (§7.6.6): T cycles the selected ammo type (Shift+T
    // reverses), 1-4 select a type directly. Q stays a diagonal
    // (conflict check 2026-10-29: Q/q and Shift+Q are diagonal NW
    // in KEY_DIRS and the help text), so T is the cycle key. No
    // time cost; switching never fires.
    if (ev.key === 't' || ev.key === 'T') {
      ev.preventDefault();
      var cycled = C.cycleAmmoType(state, ev.shiftKey ? -1 : 1);
      C.logMsg(state, 'Ammo: ' + C.AMMO_TYPE_NAMES[cycled.type] + ' selected.');
      refreshHud(); return;
    }
    if (ev.key >= '1' && ev.key <= '4') {
      var type = C.AMMO_TYPES[Number(ev.key) - 1];
      ev.preventDefault();
      C.selectAmmoType(state, type);
      C.logMsg(state, 'Ammo: ' + C.AMMO_TYPE_NAMES[type] + ' selected.');
      refreshHud(); return;
    }
    var d = KEY_DIRS[ev.key];
    if (d) { ev.preventDefault(); doMove(d[0], d[1]); }
  });
  // (No D-pad in the vision layout: keyboard arrows/WASD and tap-to-move remain.
  // No AttackIndicator banner either: tapping a red-outlined adjacent enemy
  // attacks it directly through the canvas pointer handler below.)
  // Vision layout: the wrench opens a small Use-item popup listing
  // carried health cells / food / repair kits with counts. Tapping one
  // uses it exactly as the old quickslot use did (same cost, same
  // refusals, refusal logged so it shows in the transient overlay).
  function useItemAndReport(fn, label) {
    if (state.state !== 'playing') return;
    cancelWalk(); // fixwave
    var res = fn(state, rng);
    if (!res.ok) C.logMsg(state, label + ': ' + res.reason + '.');
    if (state.state === 'dead') openDeadModal();
    refreshHud();
  }
  function openUsePopup() {
    if (state.state !== 'playing') return;
    cancelWalk(); // fixwave
    showModal('Use item',
      'Health cells: <b>' + (state.healthCells || 0) + '</b> (+25 HP)<br>' +
      'Food: <b>' + (state.foodCells || 0) + '</b> (restores 40 actions of power)<br>' +
      'Repair kits: <b>' + (state.repairKits || 0) + '</b> (+50 HP)<br>' +
      'Each use costs 1 time unit. Full HP refuses a health cell or repair kit; no item held refuses.',
      [
        { label: 'Use health cell (' + (state.healthCells || 0) + ')', onClick: function () { hideModal(); useItemAndReport(C.useHealthCell, 'Health cell'); } },
        { label: 'Use food (' + (state.foodCells || 0) + ')', onClick: function () { hideModal(); useItemAndReport(C.useFood, 'Food'); } },
        { label: 'Use repair kit (' + (state.repairKits || 0) + ')', onClick: function () { hideModal(); useItemAndReport(C.useRepairKit, 'Repair kit'); } },
        { label: 'Close', onClick: hideModal },
      ]);
  }
  var wrenchBtn = document.getElementById('btn-wrench');
  if (wrenchBtn) wrenchBtn.addEventListener('click', openUsePopup);
  var waitBtn = document.getElementById('btn-wait');
  if (waitBtn) waitBtn.addEventListener('click', doWait);
  // Rest (now in the Menu modal): wait until full HP, an enemy gets
  // within 6 tiles, or 50 waits. Each wait is a real time action,
  // so enemies can interrupt it. Behaviour unchanged from the old
  // dock Rest button.
  function doRest() {
    if (state.state !== 'playing') return;
    cancelWalk(); // fixwave
    for (var i = 0; i < 50 && state.state === 'playing' && state.player.hp < (C.derivedStats ? C.derivedStats(state).maxHp : state.player.maxHp); i++) {
      var near = state.floor.enemies.some(function (en) {
        return en.alive && Math.max(Math.abs(en.x - state.player.x), Math.abs(en.y - state.player.y)) <= 6;
      });
      if (near) { C.logMsg(state, 'Rest interrupted: enemy nearby.'); break; }
      C.playerWait(state, rng);
    }
    if (state.state === 'dead') openDeadModal();
    refreshHud();
  }
  var searchBtn = document.getElementById('btn-search');
  if (searchBtn) searchBtn.addEventListener('click', function () {
    if (state.state !== 'playing') return;
    cancelWalk(); // fixwave
    var hpBefore = state.player.hp;
    applyEnemyAnims._hpBefore = hpBefore;
    var enemiesBefore = snapshotEnemies();
    C.playerSearch(state, rng);
    if (state.player.hp < hpBefore) { addFloat(state.player.x, state.player.y, '-' + (hpBefore - state.player.hp), '#e0523d'); setPose('player', 'damaged', 300); }
    applyEnemyAnims(enemiesBefore);
    if (state.state === 'dead') openDeadModal();
    refreshHud();
  });
  function openBagModal() {
    cancelWalk(); // fixwave: opening the Bag stops the walk
    Array.prototype.slice.call(document.querySelectorAll('.bag-tabs, .bag-assign, .bag-gear')).forEach(function (el) { el.remove(); });
    var inv = C.inventoryOf(state);
    var bagMaxHp = C.derivedStats ? C.derivedStats(state).maxHp : state.player.maxHp;
    // Phase 1: the equipped weapon is an instance; show its tier tag
    // in the tier color (same presentation as the pickup ring).
    var wLabel = 'Scrap blaster', wColor = '#c8c8c8';
    if (C.weaponDisplayName && inv.weapon) {
      wLabel = C.weaponDisplayName(inv.weapon);
      wColor = (C.TIERS && C.TIERS[inv.weapon.tier]) ? C.TIERS[inv.weapon.tier].color : '#c8c8c8';
    }
    showModal('Bag — inventory', 'HP: <b>' + state.player.hp + '/' + bagMaxHp + '</b><br>Depth: <b>' + state.depth + '</b><br>' +
      '<b>Inventory (this run)</b><br>' +
      'Salvage carried: <b>' + inv.salvage + '</b> · Components: <b>' + inv.components + '</b><br>' +
      'Health cells: <b>' + inv.health + '</b> · Food: <b>' + inv.food + '</b> · Repair kits: <b>' + inv.repairKit + '</b> · Data chips found: <b>' + inv.dataChips + '</b><br>' +
      'Ammo: <b>' + C.AMMO_TYPES.map(function (t) { return C.AMMO_TYPE_NAMES[t] + ' ' + (inv.ammoPools[t] || 0) + (inv.selectedAmmo === t ? ' ◀ selected' : ''); }).join(' · ') + '</b> · Weapon: <b style="color:' + wColor + '">' + wLabel + '</b><br>' +
      '<b>Hub (survives runs)</b><br>' +
      'Banked salvage: <b>' + inv.banked + '</b> · Stockpiled components: <b>' + inv.hubComponents + '</b><br>' +
      'Hub stockpile: <b>' + inv.hubStockpile.health + ' health, ' + inv.hubStockpile.food + ' food, ' + inv.hubStockpile.repairKit + ' repair kits, ' + C.AMMO_TYPES.map(function (t) { return (inv.hubStockpile['ammo' + t[0].toUpperCase() + t.slice(1)] || 0) + ' ' + C.AMMO_TYPE_NAMES[t]; }).join(', ') + ' ammo</b><br>' +
      'Hub materials: <b>' + inv.hubStockpile.materials.wire + ' wire, ' + inv.hubStockpile.materials.coreThermal + ' thermal cores, ' + inv.hubStockpile.materials.coreShock + ' shock cores, ' + inv.hubStockpile.materials.coreCorrosive + ' corrosive cores</b><br>' +
      'Chassis tier: <b>' + inv.chassisTier + '/5</b> · Banking: <b>' + Math.round(inv.bankingRate * 100) + '%</b> (visit the hub between runs to upgrade)<br>' +
      wreckStatusText() + '<br><br>' +
      '<b>Codex</b><br>' + codexListHtml() + '<br><br>' +
      'Actions: <b>' + (state.actions || 0) + '</b> · Clock: <b>' + state.clock + '</b> · Power: <b>' + state.powerState + '</b><br>Kills: <b>' + state.kills + '</b><br>Seed: <b>' + runSeed + '</b>',
      [{ label: 'Close', onClick: hideModal }]);
    // Vision layout: no quickslot assignment anymore. Usable items get
    // a Use button here (same costs/refusals as the wrench popup).
    var wrap = document.createElement('div');
    wrap.className = 'bag-assign neon-card';
    wrap.style.marginTop = '12px';
    [['health', 'Health cell', C.useHealthCell], ['food', 'Food', C.useFood], ['repairKit', 'Repair kit', C.useRepairKit]].forEach(function (triple) {
      var row = document.createElement('div');
      row.style.marginTop = '6px';
      var count = triple[0] === 'health' ? (state.healthCells || 0) : triple[0] === 'food' ? (state.foodCells || 0) : (state.repairKits || 0);
      row.textContent = triple[1] + ' (' + count + ' held): ';
      var b = document.createElement('button');
      b.textContent = 'Use';
      b.style.minHeight = '48px'; b.style.margin = '2px';
      b.onclick = function () { useItemAndReport(triple[2], triple[1]); if (state.state !== 'dead') openBagModal(); };
      row.appendChild(b);
      wrap.appendChild(row);
    });
    modalBtns.parentNode.appendChild(wrap);
    // Phase 4 (§7.6.6): Bag-adjacent ammo selector — one clickable
    // button per type, showing the run count. Selecting costs no
    // time; an empty type is selectable and shows 0.
    var ammoWrap = document.createElement('div');
    ammoWrap.className = 'bag-gear neon-card';
    ammoWrap.style.marginTop = '12px';
    var ammoTitle = document.createElement('div');
    ammoTitle.innerHTML = '<b>Ammo</b> — select the type to fire (no time cost; T cycles, 1–4 select directly).';
    ammoWrap.appendChild(ammoTitle);
    C.AMMO_TYPES.forEach(function (t, i) {
      var b = document.createElement('button');
      var cnt = (state.ammoPools && state.ammoPools[t]) || 0;
      b.textContent = (i + 1) + ': ' + C.AMMO_TYPE_NAMES[t] + ' (' + cnt + ')' + (state.selectedAmmo === t ? ' ●' : '');
      b.style.minHeight = '48px'; b.style.margin = '2px';
      b.setAttribute('data-ammo-type', t);
      b.onclick = function () { C.selectAmmoType(state, t); refreshHud(); if (state.state !== 'dead') openBagModal(); };
      ammoWrap.appendChild(b);
    });
    modalBtns.parentNode.appendChild(ammoWrap);
    // Phase 2: equipment section — 4 slots with tier-colored names,
    // Remove buttons (armor/shield/utility only), derived stats,
    // and Equip buttons for everything stowed in the Bag. Swapping
    // costs no time (equipCarried/unequip never advance the clock).
    var gearWrap = document.createElement('div');
    gearWrap.className = 'bag-gear neon-card';
    gearWrap.style.marginTop = '12px';
    var gearTitle = document.createElement('div');
    gearTitle.innerHTML = '<b>Equipment</b> — swapping costs no time; the old piece returns to the Bag.';
    gearWrap.appendChild(gearTitle);
    var derived = C.derivedStats ? C.derivedStats(state) : null;
    if (derived) {
      var dRow = document.createElement('div');
      dRow.textContent = 'Armor ' + derived.armor + ' · Max HP ' + derived.maxHp + ' · Evasion ' + derived.evasion + ' · Range ' + derived.range + ' · Sight ' + derived.sight + (derived.shieldCapacity ? ' · Shield ' + (state.shield || 0) + '/' + derived.shieldCapacity : '');
      gearWrap.appendChild(dRow);
    }
    [['weapon', 'Weapon'], ['armor', 'Armor'], ['shield', 'Shield'], ['utility', 'Utility']].forEach(function (pair) {
      var slot = pair[0];
      var row = document.createElement('div');
      row.style.marginTop = '6px';
      var eq = C.equippedGear ? C.equippedGear(state, slot) : null;
      var eqLabel = eq ? C.itemDisplayName(eq) : '— empty —';
      var eqColor = eq && C.TIERS && C.TIERS[eq.tier] ? C.TIERS[eq.tier].color : '#c8c8c8';
      row.innerHTML = pair[1] + ': <b style="color:' + eqColor + '">' + eqLabel + '</b> ';
      if (slot !== 'weapon' && eq) {
        var rb = document.createElement('button');
        rb.textContent = 'Remove';
        rb.style.minHeight = '48px'; rb.style.margin = '2px';
        rb.onclick = function () { C.unequip(state, slot); refreshHud(); if (state.state !== 'dead') openBagModal(); };
        row.appendChild(rb);
      }
      if (eq) {
        var eff = document.createElement('div');
        eff.className = 'gear-effect';
        eff.textContent = slot === 'weapon' ? weaponEffectText(eq, true) : gearEffectText(eq);
        row.appendChild(eff);
      }
      gearWrap.appendChild(row);
    });
    (state.carriedGear || []).forEach(function (inst, idx) {
      var row = document.createElement('div');
      row.style.marginTop = '6px';
      var gName = C.itemDisplayName ? C.itemDisplayName(inst) : inst.defId;
      var gColor = C.TIERS && C.TIERS[inst.tier] ? C.TIERS[inst.tier].color : '#c8c8c8';
      row.innerHTML = 'Bag: <b style="color:' + gColor + '">' + gName + '</b> ';
      var b = document.createElement('button');
      b.textContent = 'Equip';
      b.style.minHeight = '48px'; b.style.margin = '2px';
      b.onclick = function () { C.equipCarried(state, idx); refreshHud(); if (state.state !== 'dead') openBagModal(); };
      row.appendChild(b);
      var norm = C.normalizeItemInstance ? C.normalizeItemInstance(inst) : inst;
      var slotOf = C.itemSlotOf ? C.itemSlotOf(norm.defId) : null;
      var ceff = document.createElement('div');
      ceff.className = 'gear-effect';
      ceff.textContent = slotOf === 'weapon' ? weaponEffectText(norm, false) : gearEffectText(norm);
      row.appendChild(ceff);
      if (slotOf) {
        var prev = document.createElement('div');
        prev.className = 'gear-effect';
        prev.textContent = swapPreviewText(slotOf, norm);
        if (prev.textContent) row.appendChild(prev);
      }
      gearWrap.appendChild(row);
    });
    modalBtns.parentNode.appendChild(gearWrap);
    // Phase 6: keys carried this floor — each names the door it
    // fits (purpose if any, else room ID), matching the pickup log.
    var keyWrap = document.createElement('div');
    keyWrap.className = 'bag-gear neon-card';
    keyWrap.style.marginTop = '12px';
    var keyTitle = document.createElement('div');
    var nKeys = (state.keys && state.keys.length) || 0;
    keyTitle.innerHTML = '<b>Keys</b> — ' + (nKeys ? nKeys + ' carried (used automatically when you bump their door).' : 'none carried.');
    keyWrap.appendChild(keyTitle);
    (state.keys || []).forEach(function (kid) {
      var kd = null;
      (state.floor.doors || []).forEach(function (d) { if (d.keyId === kid) kd = d; });
      var row = document.createElement('div');
      row.style.marginTop = '6px';
      if (kd) {
        var kr = state.floor.rooms[parseInt(kd.roomId.split(':')[1], 10)];
        var kLabel = (kr && kr.purpose) ? kr.purpose : kd.roomId;
        row.textContent = 'Key — fits the ' + kLabel + ' door (' + kd.x + ', ' + kd.y + ')';
      } else {
        row.textContent = 'Key (' + kid + ')';
      }
      keyWrap.appendChild(row);
    });
    modalBtns.parentNode.appendChild(keyWrap);
    // Phase 3: mech skills — learned with run skill points (no time
    // cost), used with time + energy + heat through the one executor.
    // Run-scoped: they die with the run (death AND extract). Pilot
    // skills are hub-side; see The Instructor at the hub.
    var mechWrap = document.createElement('div');
    mechWrap.className = 'bag-gear neon-card';
    mechWrap.style.marginTop = '12px';
    var mechTitle = document.createElement('div');
    mechTitle.innerHTML = '<b>Mech skills</b> — run skill points: <b>' + (state.runSkillPoints || 0) + '</b> · Energy: <b>' + (typeof state.energy === 'number' ? state.energy : 100) + '/100</b> · Heat: <b>' + (typeof state.heat === 'number' ? state.heat : 0) + '/100</b>' +
      (state.overheated ? ' · <b>OVERHEATED</b> (locked until heat drops below 50)' : '') +
      '. Earn points: 1 per 3 kills, 1 per data chip. Learning costs no time; using costs time, energy, and heat.';
    mechWrap.appendChild(mechTitle);
    var effBits = [];
    if (state.mechEffects) {
      if (state.mechEffects.overclockShots > 0) effBits.push('Overclock: ' + state.mechEffects.overclockShots + ' shots left');
      if (state.mechEffects.salvageBurst) effBits.push('Salvage Burst armed');
      if (typeof state.clock === 'number') {
        if (state.mechEffects.evasiveUntil > state.clock) effBits.push('Evasive Protocols: ' + Math.ceil((state.mechEffects.evasiveUntil - state.clock) / 10) + ' time units left');
        if (state.mechEffects.platingUntil > state.clock) effBits.push('Emergency Plating: ' + Math.ceil((state.mechEffects.platingUntil - state.clock) / 10) + ' time units left');
      }
    }
    if (effBits.length) {
      var effRow = document.createElement('div');
      effRow.textContent = 'Active: ' + effBits.join(' · ');
      mechWrap.appendChild(effRow);
    }
    // Fixwave restyle: the reference shot's 2-column neon cards.
    // Same skills, same shipped order, same values, same buttons —
    // only the layout changes. Cost line keeps the shipped format
    // exactly (parenthesised, energy always present): the shot's
    // dropped Emergency Plating energy and missing parentheses are
    // its errors, not copied here.
    var MECH_ICONS = { overclock: '⚡', evasiveProtocols: '🛡', emergencyPlating: '🛡', sensorPulse: '◎', salvageBurst: '✋', ventHeat: '✋' };
    var mechGrid = document.createElement('div');
    mechGrid.className = 'mech-grid';
    Object.keys(C.MECH_SKILLS).forEach(function (id) {
      var def = C.MECH_SKILLS[id];
      var learned = (state.mechSkills || []).indexOf(id) !== -1;
      var card = document.createElement('div');
      card.className = 'neon-card';
      var cost = C.mechSkillEnergyCost ? C.mechSkillEnergyCost(state, id) : def.energy;
      var head = document.createElement('div');
      head.className = 'neon-card-title';
      var nameEl = document.createElement('span');
      nameEl.textContent = def.name;
      var iconEl = document.createElement('span');
      iconEl.className = 'neon-icon';
      iconEl.textContent = MECH_ICONS[id] || '◆';
      head.appendChild(nameEl); head.appendChild(iconEl);
      var descEl = document.createElement('div');
      descEl.className = 'neon-card-desc';
      descEl.textContent = def.desc;
      var costEl = document.createElement('div');
      costEl.className = 'neon-card-cost';
      costEl.textContent = '(' + cost + ' energy, +' + def.heat + ' heat, ' + def.timeCost + ' time unit)';
      var b = document.createElement('button');
      b.style.minHeight = '48px';
      if (learned) {
        b.textContent = 'Use';
        b.onclick = function () {
          var res = C.useMechSkill(state, rng, id);
          if (!res.ok && res.reason) C.logMsg(state, res.reason);
          refreshHud();
          if (state.state === 'dead') openDeadModal(); else openBagModal();
        };
      } else {
        b.textContent = 'Learn (' + def.learnCost + ' pts)';
        b.onclick = function () {
          var res = C.learnMechSkill(state, id);
          if (!res.ok && res.reason) C.logMsg(state, res.reason);
          refreshHud();
          openBagModal();
        };
      }
      card.appendChild(head); card.appendChild(descEl); card.appendChild(costEl); card.appendChild(b);
      mechGrid.appendChild(card);
    });
    mechWrap.appendChild(mechGrid);
    modalBtns.parentNode.appendChild(mechWrap);
    // Menu-tabs wave: the old single scroll becomes five tabs.
    // Info holds the summary body plus the Use-item rows; the
    // other four tabs hold exactly the sections they name.
    wrap.setAttribute('data-bag-tab', 'Info');
    ammoWrap.setAttribute('data-bag-tab', 'Ammo');
    gearWrap.setAttribute('data-bag-tab', 'Gear');
    keyWrap.setAttribute('data-bag-tab', 'Keys');
    mechWrap.setAttribute('data-bag-tab', 'Skills');
    var bagBar = makeTabBar(['Gear', 'Ammo', 'Skills', 'Keys', 'Info'], bagTab, function (t) { bagTab = t; applyBagTab(); });
    bagBar.className = 'tab-bar bag-tabs';
    // Tabs sit under the title, above every section — appending
    // them last would bury them below a long Gear list.
    modalBtns.parentNode.insertBefore(bagBar, modalBody);
    applyBagTab();
  }
  var invBtn = document.getElementById('btn-inventory');
  if (invBtn) invBtn.addEventListener('click', openBagModal);
  // Vision layout: Menu (gear) holds Help, the full log, Rest, and
  // Hub. Hub keeps its old rule: mid-run it refuses with a feedback
  // line (logged, and shown in the menu itself) instead of opening.
  function helpHtml() {
    return '<b>Touch first</b><br>Square top-down grid: tap a tile to move to it or attack it. ' +
      'Tap a farther tile to walk there (stops on danger). Tap yourself to wait.<br>' +
      '<b>Keyboard</b><br>Arrow keys / WASD — move (4 directions). Q / E / Z / C — diagonals (NW / NE / SW / SE). ' +
      'Space or . — wait (costs 1 time unit). F — fire the equipped weapon along your facing (costs ammo and time; most shots are blocked by walls). T — cycle ammo type (Shift+T reverses), 1–4 — select Standard / Piercing / Incendiary / Shock directly (no time cost). Bump into an enemy to attack.<br>' +
      '<b>Ammo</b><br>Four typed pools: Standard, Piercing (ignores half armor), Incendiary (sets enemies burning: 3 damage per time unit for 3 ticks, shown as B3/B2/B1), Shock (jams: the enemy skips its next turn, shown as J1; enemies can resist the jam). The Armorer crafts all four; the Salvager breaks components and gear down into wire and cores. Pick a starting loadout at the hub before each expedition (16 rounds max, topped up with free Standard). Firing with an empty selected type switches to the next type that can fire, without firing. The Bag has a clickable ammo selector.<br>' +
      '<b>Gear drops</b><br>Step on a weapon or gear drop to stow it in the Bag — nothing auto-equips. Open the Bag to equip or swap: weapon, armor, shield, and utility slots. The ring color is the tier: white Common, green Uncommon, blue Rare, purple Epic, gold Legendary; pips under the marker are upgrade levels, the letter is the item initial. A shield absorbs damage before the hull and recharges 1 per 2 time units. One utility slot, so a scope, sensor, gyro-stabilizer, or power cell is a real choice. Swapping in the Bag costs no time. The combat log shows every shot as dice, e.g. 2d6+8.<br>' +
      '<b>Bottom bar</b><br>👣 Wait · 🔧 Use item · ⚙ Menu · ✋ Search · 🎒 Bag. ' +
      'Quickslot bar above it: FIRE (weapon + ammo count), health cell, food, repair kit — tap a slot to fire or use it. ' +
      'Stacked at the right: ▦ recenter, 📋 full log.<br>' +
      '<b>Stairs</b> — step on the stairs and the floating panel opens: Descend banks your current banking rate ' +
      '(25% to start, up to 55% via the Researcher in the hub), Extract ends the run keeping everything, Cancel steps back (costs the step\'s time).<br>' +
      '<b>Hub</b> — between runs: the Mechanic (chassis HP), Salvager (exchange + breakdown into wire and cores), Researcher (Codex + banking tiers), ' +
      'Armorer (crafting + Enhance: 4 wire × target level, +1 matching core for elemental gear, ceiling +5), Scout (next-floor intel), Radio Operator (rumors, not quests), and the Instructor (permanent pilot skills bought with banked salvage, gated by Codex entries and pilot XP). Loadout (starting ammo) is picked at the hub before each expedition. Crafted stockpile loads into the next run (2 health, 2 food, 1 repair kit, plus the chosen loadout).<br>' +
      '<b>Skills</b> — two systems, never merged. Pilot skills are permanent: buy ranks at the Instructor in the hub; they are passive, never cost energy or heat, and survive death. ' +
      'Mech skills are per-run: earn run skill points (1 per 3 kills, 1 per data chip), learn them in the Bag (no time cost), use them with time + energy + heat. Energy refills over time; heat builds on use and dissipates over time. At 100 heat the mech overheats and skills lock until heat drops below 50. Mech skills die with the run, death or extract.<br>' +
      '<b>Death</b> — banked salvage survives; your mech becomes a wreck at that depth holding carried salvage and items. ' +
      'Recover it on a later expedition — die again first and it is destroyed. New Expedition keeps the hub.<br>' +
      '<b>Save</b> — the game autosaves after every action: hub (banked, Codex, wreck) and run separately. Reloading offers Continue or New Expedition.';
  }
  function logHtml() {
    return state.log.map(function (l) { return l.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }).join('<br>');
  }
  function openMenuModal(feedback) {
    cancelWalk(); // fixwave
    showModal('Menu', helpHtml() + '<div class="menu-log">' + logHtml() + '</div>' +
      (feedback ? '<div id="menu-msg">' + feedback + '</div>' : '<div id="menu-msg"></div>'),
      [
        { label: 'Rest', onClick: function () { hideModal(); doRest(); } },
        { label: 'Hub', onClick: function () {
            if (state.state === 'playing' || state.state === 'stairs') {
              C.logMsg(state, 'The hub is for between expeditions — finish this run first.');
              refreshHud();
              openMenuModal('The hub is for between expeditions — finish this run first.');
              return;
            }
            hideModal(); showHubScreen('hub');
          } },
        { label: 'FX overlay: ' + (fxOverlayOn ? 'ON' : 'OFF'), onClick: toggleFxOverlay },
        { label: 'Close', onClick: hideModal },
      ]);
  }
  var menuBtn = document.getElementById('btn-menu');
  if (menuBtn) menuBtn.addEventListener('click', function () { openMenuModal(''); });
  // Recenter: the camera always follows the player, so this re-asserts
  // that centring (and is a no-op if the view is already centred).
  var recenterBtn = document.getElementById('btn-recenter');
  if (recenterBtn) recenterBtn.addEventListener('click', function () { refreshHud(); });
  // Log overlay (stacked button): full history, hidden by default.
  var logBtn = document.getElementById('btn-log');
  if (logBtn) logBtn.addEventListener('click', function () {
    cancelWalk(); // fixwave
    showModal('Log', '<div class="full-log">' + logHtml() + '</div>', [{ label: 'Close', onClick: hideModal }]);
  });
  // ---------- touch: tap a tile -> PD pathfinding walk ----------
  // Tap adjacent = move/attack, tap self = wait, tap distant = BFS
  // walk, one time action per step, auto-stopping on: a NEW enemy
  // becoming visible, any enemy becoming adjacent, a pickup, a trap
  // triggering, damage taken, stairs, death, or reaching the target.
  // The path never goes through a wall or an enemy tile; tapping a
  // distant enemy walks to the nearest adjacent tile and stops
  // (it never auto-attacks from a distance).
  function snapshot() {
    return {
      hp: state.player.hp, carried: state.carried,
      healthCells: state.healthCells, foodCells: state.foodCells,
      components: state.components || 0, dataChips: state.dataChips || 0,
      wreckRecovered: !state.playerWreck,
      pickups: state.floor.pickups.length,
      triggered: state.floor.hazards.filter(function (h) { return h.triggered; }).length,
    };
  }
  // Fixwave: tap-to-move, animated. The OLD walkTo looped doMove()
  // over the whole BFS path synchronously inside one pointerdown,
  // so requestAnimationFrame only ran after the player was already
  // at the destination — the "teleport". This version takes ONE
  // step, lets the slide render over WALK_STEP_MS, then takes the
  // next step, and so on. Every stop condition below is the old
  // loop's, in the old order, checked after every single step:
  // state change (stairs/death), door opened (re-path, player
  // stays), blocked step, destination reached, damage taken,
  // pickup/wreck recovery, trap triggered, enemy adjacent, newly
  // visible enemy. Each step still costs exactly what doMove /
  // playerAction costs — only the pacing changed, never the rules.
  // A fresh input cancels the walk via the token (see cancelWalk).
  function walkTo(tx, ty) {
    if (state.state !== 'playing') return;
    cancelWalk();
    var myToken = walkToken;
    var foe = state.floor.enemies.find(function (en) { return en.alive && en.x === tx && en.y === ty; });
    var destX = tx, destY = ty;
    if (foe) {
      // Nearest adjacent walkable tile with a path.
      var best = null, bestLen = 1e9;
      C.DIRS.forEach(function (d) {
        var ax = tx + d.dx, ay = ty + d.dy;
        var path = C.findPath(state, ax, ay);
        if (path && path.length < bestLen) { bestLen = path.length; best = [ax, ay]; }
      });
      if (!best) { C.logMsg(state, 'No path to that enemy.'); refreshHud(); return; }
      destX = best[0]; destY = best[1];
    }
    var curPath = C.findPath(state, destX, destY);
    if (!curPath) { C.logMsg(state, 'No path there.'); refreshHud(); return; }
    // Graphics pass: absolute tiles of the planned path, for the
    // glowing trail render() draws while the walk is in flight.
    function trailFrom(path) {
      var tiles = [], ax = state.player.x, ay = state.player.y;
      path.forEach(function (s) { ax += s.dx; ay += s.dy; tiles.push({ x: ax, y: ay }); });
      return tiles;
    }
    setPathTrail(trailFrom(curPath));
    var visibleBefore = {};
    state.floor.enemies.forEach(function (en) { if (C.enemyVisible(state, en)) visibleBefore[en.id] = true; });
    var repaths = 0, pathIdx = 0;
    function scheduleNext() {
      walkTimer = setTimeout(step, WALK_STEP_MS);
    }
    function step() {
      if (myToken !== walkToken || state.state !== 'playing') return;
      if (pathIdx >= curPath.length) return;
      var before = snapshot();
      var mv = doMove(curPath[pathIdx].dx, curPath[pathIdx].dy);
      pathIdx++;
      refreshPathTrail(pathIdx); // graphics pass: trail follows the walk
      if (myToken !== walkToken || state.state !== 'playing') return;
      if (mv && mv.opened) { // door opened, player stays: re-path
        if (state.player.x === destX && state.player.y === destY) return;
        if (++repaths > 10) return; // doors stay open, so this is a guard, not a path
        var np = C.findPath(state, destX, destY);
        if (!np) { C.logMsg(state, 'No path there.'); refreshHud(); return; }
        curPath = np; pathIdx = 0;
        setPathTrail(trailFrom(curPath)); // graphics pass: trail re-plans too
        scheduleNext(); return;
      }
      if (mv && !mv.ok) return; // blocked step ends the walk
      if (state.player.x === destX && state.player.y === destY) return;
      var after = snapshot();
      if (after.hp < before.hp) return; // damage taken (trap or enemy)
      if (after.pickups !== before.pickups || after.carried !== before.carried ||
          after.healthCells !== before.healthCells || after.foodCells !== before.foodCells ||
          after.components !== before.components || after.dataChips !== before.dataChips ||
          after.wreckRecovered !== before.wreckRecovered) return; // pickup or wreck recovery
      if (after.triggered !== before.triggered) return; // trap
      if (C.adjacentEnemies(state).length) return; // enemy adjacent
      var newlyVisible = state.floor.enemies.some(function (en) {
        return !visibleBefore[en.id] && C.enemyVisible(state, en);
      });
      if (newlyVisible) { C.logMsg(state, 'Something stirs — you stop.'); refreshHud(); return; }
      if (pathIdx >= curPath.length) return; // path done
      scheduleNext();
    }
    step(); // first step now; later steps follow the slide timing
  }
  canvas.addEventListener('pointerdown', function (ev) {
    if (state.state !== 'playing') return;
    cancelWalk(); // fixwave: a fresh tap retires any in-flight walk
    ev.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var sx = (ev.clientX - rect.left) * (canvas.width / rect.width);
    var sy = (ev.clientY - rect.top) * (canvas.height / rect.height);
    // Square grid: tile (gx, gy) is the cell whose square contains the
    // click. No iso-inverse math anymore (visual overhaul).
    var org = tileOrigin();
    var gx = Math.floor((sx - org.ox) / TILE);
    var gy = Math.floor((sy - org.oy) / TILE);
    var p = state.player;
    var dx = gx - p.x, dy = gy - p.y;
    if (dx === 0 && dy === 0) { doWait(); return; }
    if (Math.max(Math.abs(dx), Math.abs(dy)) === 1) { doMove(dx, dy); return; }
    walkTo(gx, gy);
  });
  canvas.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });

  // ---------- square top-down rendering (visual overhaul) ----------
  // Logic grid is unchanged (same coordinates, movement, pathfinding,
  // LOS, tests). Only drawing changed: each cell is a square tile,
  // actors stand upright on their tile, camera centres the player.
  // Camera follows the player and is clamped to floor bounds, so
  // the view never slides into the void beyond the floor's edge.
  // When the floor is smaller than the viewport it is centred.
  function tileOrigin() {
    var W = canvas.width, H = canvas.height;
    var fw = C.GRID_W * TILE, fh = C.GRID_H * TILE;
    // Fixwave: centre on the DRAWN (sliding) player position, so
    // the camera glides with the walk instead of jumping tile to
    // tile. Tap-to-tile math uses the same origin, so taps land
    // where the tiles are drawn mid-slide.
    var pp = slidePos('player', state.player.x, state.player.y);
    var ox, oy;
    if (fw <= W) ox = (W - fw) / 2;
    else ox = Math.max(W - fw, Math.min(0, W / 2 - (pp.x + 0.5) * TILE));
    if (fh <= H) oy = (H - fh) / 2;
    else oy = Math.max(H - fh, Math.min(0, H / 2 - (pp.y + 0.5) * TILE));
    return { ox: ox, oy: oy };
  }
  function hash2(x, y, depth) {
    return ((x * 73856093) ^ (y * 19349663) ^ (depth * 83492791)) >>> 0;
  }
  // Tilefix (2026-10-30): room-scoped coherence. The old rule picked
  // a floor/wall variant PER CELL by hash (industrial: 15 floor /
  // 30 wall variants), so a room averaged 11.2 distinct floor tiles
  // and read as salt-and-pepper — dark cracked/diamond tiles next
  // to light plain ones, each outlined in black, plus AO strips:
  // the "weird shadow" in the user's screenshots. Now ONE dominant
  // variant per room, derived from the room's origin + size +
  // depth, so a floor renders identically every load and old saves
  // render too (rooms are on the floor record; no core.js change,
  // no RNG, no rule change). Corridors use the biome's plain
  // floor. Walls take their material from the room they border
  // (first adjacent room, deterministic order), so a wall run
  // reads as one material. Accents stay patch-scoped only: the
  // circuitBlock rule below (one circuit family, one block).
  function roomAt(x, y) {
    var rooms = state.floor && state.floor.rooms;
    if (!rooms) return null;
    for (var i = 0; i < rooms.length; i++) {
      var r = rooms[i];
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
    }
    return null;
  }
  function roomHash(r) {
    return ((r.x * 73856093) ^ (r.y * 19349663) ^ (state.depth * 83492791) ^ (r.w * 101) ^ (r.h * 37)) >>> 0;
  }
  // Wall materials only (pipes, holes, vents, consoles are accents,
  // not wall materials; door panels are banned outright — see the
  // wallVariants note above). Biomes without an entry here already
  // have a single wall material and need no treatment.
  var WALL_MATERIALS = {
    industrial: ['vision_wall_top', 'vision_wall_top2', 'vision_wall_right', 'wall',
      'batch3_s2_wall_panel_a', 'batch3_s2_wall_panel_b', 'batch3_s2_wall_panel_c', 'batch3_s1_panel_plain_a'],
    scrapyard: ['wall_scrap', 'batch3_s2_wall_panel_a', 'batch3_s2_wall_panel_b', 'batch3_s2_wall_panel_c',
      'batch3_s2_wall_corner_a', 'batch3_s2_wall_corner_b'],
  };
  function roomFloorKey(x, y, biome) {
    var r = roomAt(x, y);
    if (!r || !biome.floorVariants) return biome.floor;
    return biome.floorVariants[roomHash(r) % biome.floorVariants.length];
  }
  function roomWallKey(x, y, biome) {
    var theme = (state.floor && state.floor.theme) || 'industrial';
    var mats = WALL_MATERIALS[theme];
    if (!biome.wallVariants || !mats) return biome.wall;
    var dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (var i = 0; i < dirs.length; i++) {
      var r = roomAt(x + dirs[i][0], y + dirs[i][1]);
      if (r) return mats[roomHash(r) % mats.length];
    }
    return biome.wall;
  }
  // Floor: the current biome's generated texture (drawPlainFloor, with a
  // deterministic per-cell flip). If that texture failed to load, the
  // drawn rusty/circuit pattern below is the fallback — never a flat
  // coloured diamond, and never a missing floor.
  function drawFloorTile(g, x0, y0, x, y, isCorridor) {
    var h = hash2(x, y, state.depth);
    var biome = BIOMES[(state.floor && state.floor.theme) || 'industrial'] || BIOMES.industrial;
    var floorKey = biome.floor;
    // Circuit block (core.js): on industrial floors the block's cells
    // always draw the vision circuit tile, overriding the room
    // dominant. Other themes keep their own floor art; neon is
    // already all-circuit. Rendering only — no rule.
    var cb = state.floor && state.floor.circuitBlock;
    if (cb && state.floor.theme === 'industrial' && x >= cb.x && x < cb.x + cb.w && y >= cb.y && y < cb.y + cb.h) {
      var circuitKeys = ['vision_floor_circuit', 'batch3_s2_floor_circuit_a', 'batch3_s2_floor_circuit_b', 'batch3_s2_floor_circuit_c'];
      floorKey = circuitKeys[h % circuitKeys.length];
    }
    else if (biome.floorVariants) floorKey = roomFloorKey(x, y, biome);
    if (floorKey && drawPlainFloor(g, floorKey, x0, y0, x, y)) {
      // Tilefix: no per-cell black outline and no corridor darkening
      // overlay here. The old 0.65 stroke on EVERY floor tile, plus
      // AO strips, plus fog dim, stacked into the muddy shadow the
      // user circled. Now a floor tile gets at most one darkening:
      // AO in full-bright rooms (applied in the render loop, skipped
      // in dim rooms), fog dim in dim rooms, nothing else.
      return;
    }
    if (h % 5 === 0) {
      g.fillStyle = '#16282e'; g.fillRect(x0, y0, TILE, TILE);
      g.strokeStyle = 'rgba(53,224,255,0.45)'; g.lineWidth = 1;
      g.beginPath();
      if (h % 3 === 0) { g.moveTo(x0 + 8, y0 + 32); g.lineTo(x0 + 32, y0 + 32); g.lineTo(x0 + 32, y0 + 8); g.moveTo(x0 + 32, y0 + 32); g.lineTo(x0 + 56, y0 + 32); }
      else if (h % 3 === 1) { g.moveTo(x0 + 32, y0 + 8); g.lineTo(x0 + 32, y0 + 56); g.moveTo(x0 + 8, y0 + 56); g.lineTo(x0 + 32, y0 + 56); }
      else { g.moveTo(x0 + 8, y0 + 8); g.lineTo(x0 + 56, y0 + 8); g.moveTo(x0 + 56, y0 + 8); g.lineTo(x0 + 56, y0 + 56); }
      g.stroke(); g.lineWidth = 1;
    } else {
      var shades = ['#6b5340', '#63503c', '#75604a'];
      g.fillStyle = shades[h % 3]; g.fillRect(x0, y0, TILE, TILE);
      for (var i = 0; i < 5; i++) {
        var rx = (h + i * 37) % 56, ry = (h * 3 + i * 53) % 56;
        g.fillStyle = i % 2 ? 'rgba(0,0,0,0.18)' : 'rgba(255,180,90,0.10)';
        g.fillRect(x0 + rx, y0 + ry, 5, 4);
      }
      if (h % 7 === 0) { g.fillStyle = 'rgba(180,90,30,0.25)'; g.fillRect(x0 + 10, y0 + 40, 26, 10); }
    }
    if (isCorridor) { g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x0, y0, TILE, TILE); }
    g.strokeStyle = 'rgba(0,0,0,0.65)'; g.strokeRect(x0 + 0.5, y0 + 0.5, TILE - 1, TILE - 1);
  }
  function drawMarker(g, cx, cy, color, letter) {
    g.fillStyle = color;
    g.beginPath(); g.arc(cx, cy, 16, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 16px monospace'; g.textAlign = 'center';
    g.fillText(letter, cx, cy + 5);
  }
  function drawSprite(g, key, dirIndex, cx, cy, size) {
    var s = sprites[key];
    if (!s || !s.ok) { drawMarker(g, cx, cy, key === 'player' ? '#2f5fd0' : '#a03028', key === 'player' ? 'S' : 'E'); return; }
    g.imageSmoothingEnabled = false;
    if (s.plain) { g.drawImage(s.img, cx - size / 2, cy - size / 2, size, size); return; }
    g.drawImage(s.cells[dirIndex], cx - size / 2, cy - size / 2, size, size);
  }
  // Wide-cell art: draw the native-size image aspect-preserving at
  // span*TILE wide, anchored to the anchor cell's row. Returns false
  // when the sprite is not loaded (caller falls back to what the grid
  // loop already drew). Rect-culled against the viewport, since a
  // 2-cell piece anchored off-screen can still extend on-screen.
  function drawWide(g, key, x0, y0, art, W, H) {
    var s = sprites[key];
    if (!s || !s.ok || !s.plain || !s.img || !s.img.naturalWidth) return false;
    var w = Math.round(art.span * TILE);
    var h = Math.round(w * s.img.naturalHeight / s.img.naturalWidth);
    var dx = x0, dy = art.anchor === 'bottom' ? y0 + TILE - h : y0;
    if (dx + w < 0 || dx > W || dy + h < 0 || dy > H) return true; // culled, but "drawn"
    if (art.backing) { g.fillStyle = '#05070a'; g.fillRect(dx, dy, w, h); }
    g.imageSmoothingEnabled = false;
    g.drawImage(s.img, dx, dy, w, h);
    return true;
  }
  // The wide stairs art replaces the 1-cell stairs sheet only when
  // the floor carries the flag (right neighbour is plain floor) AND
  // the art actually loaded; otherwise the sheet stands.
  function wideStairsApplies() {
    var ws = state.floor && state.floor.wideStairs;
    var s = sprites['wide_batch3_s2_stairs_down'];
    return !!(ws && s && s.ok);
  }
  // Plain floor tile with a deterministic per-cell flip (hash % 4) so a
  // single texture does not read as a repeating stamp.
  function drawPlainFloor(g, key, x0, y0, x, y) {
    var s = sprites[key];
    if (!s || !s.ok || !s.plain) return false;
    var h = hash2(x, y, state.depth) % 4;
    g.imageSmoothingEnabled = false;
    g.save();
    g.translate(x0 + TILE / 2, y0 + TILE / 2);
    if (h === 1) g.scale(-1, 1);
    else if (h === 2) g.scale(1, -1);
    else if (h === 3) g.scale(-1, -1);
    g.drawImage(s.img, -TILE / 2, -TILE / 2, TILE, TILE);
    g.restore();
    return true;
  }
  function drawActor(g, baseKey, id, dirIndex, cx, cy, size) {
    var pose = currentPose(id);
    var key = pose === 'rest' ? baseKey : baseKey + '_' + pose;
    var s = sprites[key];
    if (!s || !s.ok) key = baseKey;
    drawSprite(g, key, dirIndex, cx, cy, size);
  }

  // Phase 6 (§9.7.6): fog of war — rendering/sight ONLY, never
  // rules (the scheduler and status ticks keep running for unseen
  // enemies exactly as Phase 5). Returns 'full' (current brightness),
  // 'dim' (explored/walked but not currently visible — the 45%
  // brightness overlay), or 'black' (draw nothing). Actors and
  // pickups draw only on 'full' cells; structure draws dimmed on
  // 'dim' cells. Door cells follow the §9.7.4 rule: drawn when
  // adjacent to a walked corridor cell or an explored room, even
  // when the room beyond is unexplored. LOS checks are bounded to
  // Chebyshev 12 for frame cost; beyond that, explored cells dim.
  function fogRoomAt(x, y) {
    var rooms = state.floor.rooms || [];
    for (var i = 0; i < rooms.length; i++) {
      var r = rooms[i];
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
    }
    return null;
  }
  function fogVisibility(x, y) {
    var floor = state.floor, p = state.player;
    if (!floor.doors) return 'full'; // pre-Phase-6 floor, no fog data
    var ex = floor.explored || { exploredRoomIds: [], walkedCorridorCells: [] };
    var t = floor.grid[y][x];
    if (t === 'door') {
      var known = false;
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var di = 0; di < dirs.length; di++) {
        var nx = x + dirs[di][0], ny = y + dirs[di][1];
        if (ex.walkedCorridorCells.indexOf(nx + ',' + ny) !== -1) known = true;
        var nr = fogRoomAt(nx, ny);
        if (nr && ex.exploredRoomIds.indexOf(nr.id) !== -1) known = true;
      }
      if (!known) return 'black';
      if (Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) <= 12 && C.lineOfSight(state, p.x, p.y, x, y)) return 'full';
      return 'dim';
    }
    var room = fogRoomAt(x, y);
    if (room) {
      var playerRoom = fogRoomAt(p.x, p.y);
      if (playerRoom && room.id === playerRoom.id) return 'full';
      if (ex.exploredRoomIds.indexOf(room.id) === -1) return 'black';
    } else if (t === 'corridor') {
      if (ex.walkedCorridorCells.indexOf(x + ',' + y) === -1) return 'black';
    } else if (t === 'wall') {
      // Wall framing: a wall renders only as the border of an
      // explored room (full for the current room, dim otherwise).
      // 8-dir adjacency so room frames have no black corner gaps.
      // Walls bounding only unexplored rooms/void stay black —
      // the old fallthrough lit any wall in LOS, which outlined
      // rooms never entered (a fog leak).
      var playerRoomW = fogRoomAt(p.x, p.y);
      var adjExplored = false, adjCurrent = false;
      for (var wy = -1; wy <= 1; wy++) for (var wx = -1; wx <= 1; wx++) {
        if (!wx && !wy) continue;
        var wr = fogRoomAt(x + wx, y + wy);
        if (wr && ex.exploredRoomIds.indexOf(wr.id) !== -1) {
          adjExplored = true;
          if (playerRoomW && wr.id === playerRoomW.id) adjCurrent = true;
        }
      }
      if (!adjExplored) return 'black';
      return adjCurrent ? 'full' : 'dim';
    } else {
      return 'black';
    }
    if (Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) <= 12 && C.lineOfSight(state, p.x, p.y, x, y)) return 'full';
    return 'dim';
  }
  function render() {
    var W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#10131a'; ctx.fillRect(0, 0, W, H);
    var p = state.player;
    var org = tileOrigin();
    var floor = state.floor;
    for (var y = 0; y < C.GRID_H; y++) for (var x = 0; x < C.GRID_W; x++) {
      var t = floor.grid[y][x];
      if (t === 'void') continue;
      var x0 = org.ox + x * TILE, y0 = org.oy + y * TILE;
      if (x0 < -TILE || x0 > W || y0 < -TILE || y0 > H) continue;
      var cx = x0 + TILE / 2, cy = y0 + TILE / 2;
      // Fog: black cells draw nothing at all.
      var fogVis = fogVisibility(x, y);
      if (fogVis === 'black') continue;
      if (t === 'wall') {
        var wb = BIOMES[(state.floor && state.floor.theme) || 'industrial'] || BIOMES.industrial;
        var wallKey = roomWallKey(x, y, wb);
        // Backing: sheet wall art (e.g. the 'wall' block) does not fill
        // its cell, so without a base the block floats on the void
        // background and reads as a pillar. Full-bleed panels cover
        // the base completely, so this changes nothing for them.
        ctx.fillStyle = '#262b33'; ctx.fillRect(x0, y0, TILE, TILE);
        if (sprites[wallKey] && sprites[wallKey].ok) drawSprite(ctx, wallKey, 0, cx, cy, TILE);
        else { ctx.fillStyle = '#3d4552'; ctx.fillRect(x0, y0, TILE, TILE); }
        // Thicker scrap border so walls read as heavy edges (vision).
        // Tilefix: skipped in dim rooms — fog dim already darkens
        // them, and stroke + dim stacked into the muddy patch.
        if (fogVis !== 'dim') {
          ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 3;
          ctx.strokeRect(x0 + 1.5, y0 + 1.5, TILE - 3, TILE - 3); ctx.lineWidth = 1;
        }
      } else if (t === 'door') {
        // Phase 6 (§9.7.4): closed/locked use the sealed batch-3
        // panel, open uses the open doorway panel; the door sheet's
        // cell 0 is the fallback for both. Locked adds a red lock
        // marker (level digit), like the sleeper 'z' indicator.
        var doorRec = C.doorAt ? C.doorAt(floor, x, y) : null;
        var doorState = doorRec ? doorRec.state : 'closed';
        var closedKeys = ['batch3_s2_wall_door_closed_a', 'batch3_s2_wall_door_closed_b'];
        var openKeys = ['batch3_s2_wall_door_open_a', 'batch3_s2_wall_door_open_b', 'batch3_s2_wall_door_open_c'];
        var frameKey = doorState === 'open' ? openKeys[hash2(x, y, state.depth) % openKeys.length]
          : closedKeys[hash2(x, y, state.depth) % closedKeys.length];
        if (sprites[frameKey] && sprites[frameKey].ok) drawSprite(ctx, frameKey, 0, cx, cy, TILE);
        else if (sprites.door && sprites.door.ok) drawSprite(ctx, 'door', 0, cx, cy, TILE);
        else if (doorState === 'open') { drawFloorTile(ctx, x0, y0, x, y, false); ctx.fillStyle = '#10131a'; ctx.fillRect(cx - 12, cy - 12, 24, 24); }
        else { ctx.fillStyle = '#2f4a55'; ctx.fillRect(x0, y0, TILE, TILE); }
        if (doorRec && doorRec.state === 'locked') {
          // Lock badge ON the door tile (top-right corner), not
          // floating above it like the sleeper 'z'.
          ctx.fillStyle = '#e0523d'; ctx.font = 'bold ' + Math.max(13, Math.round(TILE * 0.2)) + 'px monospace'; ctx.textAlign = 'center';
          ctx.fillText('L' + doorRec.lockLevel, cx + TILE * 0.28, cy - TILE * 0.25);
        }
      } else if (t === 'hazard') {
        var hz = floor.hazards.find(function (h) { return h.x === x && h.y === y; });
        if (hz && hz.hidden && !hz.revealed) {
          drawFloorTile(ctx, x0, y0, x, y, false); // hidden: looks like plain floor
        } else if (sprites.spike && sprites.spike.ok) {
          drawFloorTile(ctx, x0, y0, x, y, false);
          drawSprite(ctx, 'spike', 0, cx, cy, TILE);
        } else {
          drawFloorTile(ctx, x0, y0, x, y, false);
          ctx.fillStyle = '#e0523d'; ctx.fillRect(cx - 12, cy - 4, 24, 8);
        }
      } else if (t === 'stairs') {
        drawFloorTile(ctx, x0, y0, x, y, false);
        // Wide stairs art (drawables pass below) replaces the 1-cell
        // sheet when it applies and loaded; otherwise the sheet stands.
        if (!wideStairsApplies()) drawSprite(ctx, 'stairs', 0, cx, cy, TILE);
      } else {
        drawFloorTile(ctx, x0, y0, x, y, t === 'corridor');
      }
      // Graphics pass: ambient occlusion — a dark strip on floor
      // edges next to walls, so walls read taller than floors.
      // Rendering only; the grid and all rules are untouched.
      // Tilefix: full-bright rooms only. In dim rooms the fog dim
      // overlay (0.55) is the single darkening; AO + dim stacked
      // into the muddy shadow the user circled.
      if (fogVis === 'full' && t !== 'wall' && t !== 'door' && t !== 'void') {
        var gg = floor.grid;
        ctx.fillStyle = 'rgba(0,0,0,0.20)';
        var ao = Math.max(4, Math.round(TILE * 0.10));
        if (y > 0 && gg[y - 1][x] === 'wall') ctx.fillRect(x0, y0, TILE, ao);
        if (y + 1 < C.GRID_H && gg[y + 1][x] === 'wall') ctx.fillRect(x0, y0 + TILE - ao, TILE, ao);
        if (x > 0 && gg[y][x - 1] === 'wall') ctx.fillRect(x0, y0, ao, TILE);
        if (x + 1 < C.GRID_W && gg[y][x + 1] === 'wall') ctx.fillRect(x0 + TILE - ao, y0, ao, TILE);
      }
      if (floor.dressing) {
        var dr = floor.dressing.find(function (d) { return d.x === x && d.y === y; });
        // 'wide_cover' records reserve cells under wide art: nothing
        // draws here in the grid loop; the wide piece covers the cell
        // from the drawables pass.
        if (dr && !dr.cover) {
          // New art batch 2: on industrial floors, 'debris' dressing
          // deterministically varies into the vision-style loot sprites
          // (rendering only — dressing stays walkable decor, no rule).
          var dk = dr.kind;
          if (DRESSING_VARIANTS[dk]) dk = DRESSING_VARIANTS[dk][hash2(x, y, state.depth) % DRESSING_VARIANTS[dk].length];
          if (dk === 'debris' && state.floor && state.floor.theme === 'industrial') {
            // Tilefix (2026-10-30): decor must NEVER draw a pickup
            // sprite. The old list put loot_gear/loot_key/loot_crate/
            // loot_crystal on ~50% of debris cells, so gold keys and
            // crystals on the floor were inert decor — new players
            // chased pickups that did not exist (and loot_crystal /
            // loot_gear / loot_crate are not pickup kinds at all;
            // only the key is, and real keys keep their gold ring
            // in the drawables pass). Scrap-only replacements here.
            var lv = ['debris', 'debris', 'batch3_s2_scrap_pile_a', 'batch3_s2_scrap_debris', 'batch3_s2_scrap_pile_wires', 'batch3_s2_armour_broken'];
            dk = lv[hash2(x, y, state.depth) % lv.length];
          }
          if (sprites[dk] && sprites[dk].ok) drawSprite(ctx, dk, 0, cx, cy, Math.round(TILE * 0.85));
          else { ctx.fillStyle = '#8a7a4a'; ctx.fillRect(cx - 10, cy - 10, 20, 20); }
          // Graphics pass: tile micro-animation, time-based alpha
          // on existing dressing only. Terminals/consoles flicker
          // cyan; vents/grates vent two rising steam dots. Subtle
          // by design — it must never read as a pickup or a hazard.
          (function () {
            var now = Date.now(), ph = hash2(x, y, state.depth);
            if (/console|term|panel|circuit|keypad|server/.test(dk)) {
              var fl = 0.55 + 0.45 * Math.sin(now / 280 + ph);
              ctx.globalAlpha = 0.35 * fl;
              ctx.fillStyle = '#35e0ff';
              ctx.fillRect(cx - 8, cy - TILE * 0.30, 16, 4);
              ctx.globalAlpha = 1;
            } else if (/vent|grate/.test(dk)) {
              for (var vi = 0; vi < 2; vi++) {
                var pr = ((now / 900 + ph * 0.37 + vi * 0.5) % 1 + 1) % 1;
                ctx.globalAlpha = (1 - pr) * 0.45;
                ctx.fillStyle = '#cfe8ec';
                ctx.fillRect(cx - 6 + vi * 8, cy - TILE * 0.10 - pr * TILE * 0.35, 4, 4);
              }
              ctx.globalAlpha = 1;
            }
          })();
        }
      }
      // Fog: explored-but-not-visible cells get the 45%-brightness
      // overlay (black at 0.55 alpha) after their normal draw.
      if (fogVis === 'dim') { ctx.fillStyle = 'rgba(0,0,0,' + C.FOG_DIM_ALPHA + ')'; ctx.fillRect(x0, y0, TILE, TILE); }
    }
    // Graphics pass: point-light glow + path trail, drawn over the
    // floor and under actors. Player glow follows the sliding
    // render position; terminal glows pulse. Fog-safe by
    // construction: the glow is CLIPPED to full-brightness cells
    // only (the player's current room and LOS-lit cells), so it can
    // never light an unexplored (black) cell or brighten a dimmed
    // one — the Phase 6 dim-ratio band (0.30–0.65) is untouched.
    // A first version drew the player glow unclipped and was caught
    // by verify_phase6 P6-FOG lighting cells outside the spawn
    // room; a re-overlay fix was rejected because it would have
    // pushed dim ratios below the band. Additive composite, one
    // pre-rendered gradient — no per-frame shadowBlur.
    (function () {
      var glow = getGlowCanvas();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var sp = slidePos('player', p.x, p.y);
      ctx.beginPath();
      var R = 4;
      for (var yy = Math.max(0, Math.floor(sp.y) - R); yy <= Math.min(C.GRID_H - 1, Math.ceil(sp.y) + R); yy++) {
        for (var xx = Math.max(0, Math.floor(sp.x) - R); xx <= Math.min(C.GRID_W - 1, Math.ceil(sp.x) + R); xx++) {
          if (fogVisibility(xx, yy) === 'full') ctx.rect(org.ox + xx * TILE, org.oy + yy * TILE, TILE, TILE);
        }
      }
      ctx.clip();
      var pcx = org.ox + (sp.x + 0.5) * TILE, pcy = org.oy + (sp.y + 0.5) * TILE;
      var pr = TILE * 3.5;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(glow, pcx - pr, pcy - pr, pr * 2, pr * 2);
      var pulse = 0.75 + 0.25 * Math.sin(Date.now() / 300);
      (floor.dressing || []).forEach(function (d) {
        if (!/console|term|panel|circuit|keypad|server/.test(d.kind)) return;
        if (fogVisibility(d.x, d.y) !== 'full') return;
        var dcx = org.ox + (d.x + 0.5) * TILE, dcy = org.oy + (d.y + 0.5) * TILE;
        var dr2 = TILE * 1.2;
        ctx.globalAlpha = 0.5 * pulse;
        ctx.drawImage(glow, dcx - dr2, dcy - dr2, dr2 * 2, dr2 * 2);
      });
      ctx.restore();
      // Path trail: glowing dots on the remaining planned tiles.
      if (pathTrail && Date.now() < pathTrail.until) {
        ctx.save();
        ctx.fillStyle = '#35e0ff';
        pathTrail.tiles.slice(pathTrail.idx).forEach(function (tt) {
          if (fogVisibility(tt.x, tt.y) === 'black') return;
          var tcx = org.ox + (tt.x + 0.5) * TILE, tcy = org.oy + (tt.y + 0.5) * TILE;
          ctx.globalAlpha = 0.55;
          ctx.fillRect(tcx - 3, tcy - 3, 6, 6);
        });
        ctx.restore();
      }
    })();
    var drawables = [];
    // Wide-cell art draws FIRST in the y-sorted pass so pickups,
    // wrecks, enemies and the player — all pushed after — draw over
    // it at shared cells, and actors north of a tall piece sit behind
    // it. Old saves have no wide records; the guards below keep them
    // rendering exactly as before.
    (floor.wideDressing || []).forEach(function (w) {
      if (WIDE_ART[w.kind]) drawables.push({ x: w.x, y: w.y, kind: 'wide', w: w });
    });
    if (wideStairsApplies()) drawables.push({ x: floor.wideStairs.x, y: floor.wideStairs.y, kind: 'stairsWide' });
    floor.pickups.forEach(function (pk) { drawables.push({ x: pk.x, y: pk.y, kind: 'pickup', pk: pk }); });
    state.wrecks.forEach(function (w) { drawables.push({ x: w.x, y: w.y, kind: 'wreck', w: w }); });
    if (state.playerWreck) drawables.push({ x: state.playerWreck.x, y: state.playerWreck.y, kind: 'playerWreck' });
    floor.enemies.forEach(function (en) { if (en.alive) drawables.push({ x: en.x, y: en.y, kind: 'enemy', en: en }); });
    drawables.push({ x: p.x, y: p.y, kind: 'player' });
    drawables.sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); });
    drawables.forEach(function (d) {
      var x0 = org.ox + d.x * TILE, y0 = org.oy + d.y * TILE;
      var cx = x0 + TILE / 2, cy = y0 + TILE / 2;
      // Fixwave: sliding actors draw at their interpolated position
      // (logic tile d.x/d.y still governs fog, LOS, and culling
      // checks below). The hop lifts the sprite mid-slide — the
      // visible motion for actors whose pose sheets do not exist
      // (Phase 5 types without walk frames), and a complement to
      // the walk-pose flip for actors that have them.
      if (d.kind === 'enemy' || d.kind === 'player') {
        var sp = slidePos(d.kind === 'player' ? 'player' : d.en.id, d.x, d.y);
        x0 = org.ox + sp.x * TILE; y0 = org.oy + sp.y * TILE;
        cx = x0 + TILE / 2; cy = y0 + TILE / 2;
        if (sp.progress > 0) cy -= Math.sin(Math.PI * sp.progress) * TILE * 0.08;
      }
      // Phase 6 (§9.7.6): actors/pickups/wrecks draw when the player
      // is inside their room OR has door-aware LOS to their cell
      // (through an open door) — the spec's actor rule, which is
      // deliberately NOT the tile rule: a foe in an unwalked
      // corridor beyond an open door is visible, while its tiles
      // stay black. Wide structure follows the tile rule instead
      // (drawn dimmed on known cells, never on black ones). The
      // player cell is always visible (self-LOS), so no special
      // case is needed. LOS is bounded to Chebyshev 12, matching
      // the tile rule; on-screen cells are always within it.
      var dVis = d.kind === 'player' ? 'full' : fogVisibility(d.x, d.y);
      if (d.kind === 'pickup' || d.kind === 'wreck' || d.kind === 'playerWreck' || d.kind === 'enemy') {
        var pRoom = fogRoomAt(p.x, p.y), aRoom = fogRoomAt(d.x, d.y);
        var actorSeen = (pRoom && aRoom && pRoom.id === aRoom.id) ||
          (Math.max(Math.abs(d.x - p.x), Math.abs(d.y - p.y)) <= 12 && C.lineOfSight(state, p.x, p.y, d.x, d.y));
        if (!actorSeen) return;
      } else if (d.kind === 'wide' || d.kind === 'stairsWide') {
        if (dVis === 'black') return;
      }
      if (d.kind === 'wide') {
        drawWide(ctx, d.w.kind, x0, y0, WIDE_ART[d.w.kind], W, H);
        if (dVis === 'dim') {
          var wa = WIDE_ART[d.w.kind], ws = sprites[d.w.kind];
          var ww = Math.round(wa.span * TILE);
          var wh = (ws && ws.ok && ws.img && ws.img.naturalWidth) ? Math.round(ww * ws.img.naturalHeight / ws.img.naturalWidth) : TILE;
          ctx.fillStyle = 'rgba(0,0,0,' + C.FOG_DIM_ALPHA + ')';
          ctx.fillRect(x0, wa.anchor === 'bottom' ? y0 + TILE - wh : y0, ww, wh);
        }
        return;
      }
      if (d.kind === 'stairsWide') {
        drawWide(ctx, 'wide_batch3_s2_stairs_down', x0, y0, WIDE_ART['wide_batch3_s2_stairs_down'], W, H);
        if (dVis === 'dim') {
          var sa = WIDE_ART['wide_batch3_s2_stairs_down'], ss = sprites['wide_batch3_s2_stairs_down'];
          var sw = Math.round(sa.span * TILE);
          var sh = (ss && ss.ok && ss.img && ss.img.naturalWidth) ? Math.round(sw * ss.img.naturalHeight / ss.img.naturalWidth) : TILE;
          ctx.fillStyle = 'rgba(0,0,0,' + C.FOG_DIM_ALPHA + ')';
          ctx.fillRect(x0, sa.anchor === 'bottom' ? y0 + TILE - sh : y0, sw, sh);
        }
        return;
      }
      if (x0 < -TILE || x0 > W || y0 < -TILE || y0 > H) return;
      // Phase 6: key pickups — gold ring + the batch-3 key sprite
      // (cell 0), 'K' marker when the sprite is missing.
      if (d.kind === 'pickup' && d.pk.kind === 'key') {
        // Tilefix: key ring strengthened (0.65 -> 0.85 alpha, 2 -> 3px)
        // so a REAL key can never be mistaken for decor again. Decor
        // draws no ring at all, and no decor sprite duplicates a
        // pickup sprite anymore.
        ctx.strokeStyle = '#ffd76a'; ctx.globalAlpha = 0.85; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(cx, cy + TILE * 0.22, TILE * 0.4, TILE * 0.16, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = 1;
        if (sprites.loot_key && sprites.loot_key.ok) {
          ctx.imageSmoothingEnabled = false;
          var keySize = Math.round(TILE * 0.8);
          ctx.drawImage(sprites.loot_key.cells[0], cx - keySize / 2, cy - keySize / 2, keySize, keySize);
        } else drawMarker(ctx, cx, cy, '#ffd76a', 'K');
        return;
      }
      if (d.kind === 'pickup') {
        var pkKey = d.pk.kind === 'health' ? 'pickup_health' : d.pk.kind === 'food' ? 'pickup_food' : d.pk.kind === 'dataChip' ? 'pickup_dataChip' : d.pk.kind === 'component' ? 'pickup_component' : d.pk.kind === 'repairKit' ? 'pickup_repair' : d.pk.kind === 'ammo' ? 'pickup_ammo' : 'pickup_salvage';
        // Phase 1/2: item drops (weapons AND gear) render with the
        // tier-colored ring + letter marker (the existing fallback
        // pattern — no weapon/gear art exists yet, and no sprite is
        // invented here). The ring color is the tier color; the
        // letter is the item initial.
        var ring = d.pk.kind === 'health' ? '#35e05c' : d.pk.kind === 'dataChip' ? '#35e0ff' : d.pk.kind === 'ammo' ? '#4aa8ff' : '#ffd76a';
        var isItem = d.pk.kind === 'item';
        if (isItem) {
          ring = (C.TIERS && C.TIERS[d.pk.tier]) ? C.TIERS[d.pk.tier].color : '#c8c8c8';
        }
        ctx.strokeStyle = ring; ctx.globalAlpha = 0.8; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(cx, cy + TILE * 0.22, TILE * 0.4, TILE * 0.16, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = 1;
        if (isItem) {
          var def = C.itemDefFor ? C.itemDefFor(d.pk.defId) : null;
          var letter = def ? def.name.charAt(0) : 'W';
          drawMarker(ctx, cx, cy, ring, letter);
          // Upgrade pips under the marker, one per + level.
          if (d.pk.upgrade > 0) {
            ctx.fillStyle = ring;
            for (var pi = 0; pi < d.pk.upgrade; pi++) {
              ctx.fillRect(cx - 9 + pi * 7, cy + TILE * 0.3, 5, 4);
            }
          }
        } else if (sprites[pkKey] && sprites[pkKey].ok) {
          ctx.imageSmoothingEnabled = false;
          var pkSize = Math.round(TILE * 0.8); ctx.drawImage(sprites[pkKey].cells[0], cx - pkSize / 2, cy - pkSize / 2, pkSize, pkSize);
        } else if (d.pk.kind === 'health') drawMarker(ctx, cx, cy, '#35e05c', '+');
        else if (d.pk.kind === 'dataChip') drawMarker(ctx, cx, cy, '#35e0ff', '◈');
        else if (d.pk.kind === 'component') drawMarker(ctx, cx, cy, '#ffb020', 'C');
        else if (d.pk.kind === 'ammo') drawMarker(ctx, cx, cy, '#4aa8ff', 'A');
        else drawMarker(ctx, cx, cy, '#ffb020', '$');
      } else if (d.kind === 'wreck') {
        drawSprite(ctx, 'wreck_' + d.w.type, 0, cx, cy, Math.round(TILE * 1.05));
      } else if (d.kind === 'playerWreck') {
        ctx.strokeStyle = '#35e0ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(cx, cy + TILE * 0.22, TILE * 0.4, TILE * 0.16, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1;
        drawSprite(ctx, 'wreck_player', 0, cx, cy, Math.round(TILE * 1.05));
      } else if (d.kind === 'enemy') {
        var adjacent = Math.max(Math.abs(d.en.x - p.x), Math.abs(d.en.y - p.y)) === 1;
        if (adjacent) {
          ctx.strokeStyle = '#e0523d'; ctx.lineWidth = 3;
          ctx.strokeRect(x0 + 2, y0 + 2, TILE - 4, TILE - 4); ctx.lineWidth = 1;
          // Vision layout 2: no banner — a small name/HP label drawn
          // directly above the outlined enemy's tile.
          var label = d.en.name + ' ' + d.en.hp + '/' + d.en.maxHp;
          ctx.font = 'bold ' + Math.max(11, Math.round(TILE * 0.16)) + 'px monospace';
          var lw = ctx.measureText(label).width + 10;
          ctx.fillStyle = 'rgba(0,0,0,0.72)';
          ctx.fillRect(cx - lw / 2, y0 + 3, lw, Math.max(16, Math.round(TILE * 0.22)));
          ctx.fillStyle = '#ffd7d0'; ctx.textAlign = 'center';
          ctx.fillText(label, cx, y0 + 3 + Math.max(13, Math.round(TILE * 0.17)));
        }
        drawActor(ctx, d.en.type, d.en.id, d.en.facing, cx, cy, Math.round(TILE * 0.95));
        if (!d.en.awake) {
          ctx.fillStyle = '#9aa2ad'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
          ctx.fillText('z', cx + TILE * 0.28, cy - TILE * 0.7);
        }
        if (d.en.hp < d.en.maxHp) {
          var bw = TILE * 0.62;
          ctx.fillStyle = '#222'; ctx.fillRect(cx - bw / 2, cy - TILE * 0.85, bw, 6);
          ctx.fillStyle = '#e0523d'; ctx.fillRect(cx - bw / 2, cy - TILE * 0.85, bw * Math.max(0, d.en.hp / d.en.maxHp), 6);
        }
        // Phase 4 (§7.6.5): status letters beneath the HP bar —
        // B3/B2/B1 orange for burning (ticks left), J1 cyan for
        // jammed. Drawn whenever a status is present, at the bar's
        // position even at full HP (the bar itself only shows when
        // damaged).
        var sts = C.enemyStatuses ? C.enemyStatuses(d.en) : (d.en.statuses || []);
        if (sts.length) {
          var segs = [];
          sts.forEach(function (s) {
            if (s.kind === 'burning') segs.push({ text: 'B' + s.ticksLeft, color: '#ff9a1f' });
            else if (s.kind === 'jammed') segs.push({ text: 'J1', color: '#35e0ff' });
          });
          if (segs.length) {
            ctx.font = 'bold ' + Math.max(11, Math.round(TILE * 0.16)) + 'px monospace';
            var totalW = 0;
            segs.forEach(function (s) { totalW += ctx.measureText(s.text + ' ').width; });
            var sx = cx - totalW / 2;
            ctx.textAlign = 'left';
            segs.forEach(function (s) {
              ctx.fillStyle = s.color;
              ctx.fillText(s.text + ' ', sx, cy - TILE * 0.85 + 18);
              sx += ctx.measureText(s.text + ' ').width;
            });
            ctx.textAlign = 'center';
          }
        }
        // Phase 5: sniper telegraph + bomber fuse markers. The
        // telegraph renders only when the marked tile is in the
        // player's line of sight from the SNIPER (the shooter must
        // still see the tile); Phase 6 adds the fog gate — the
        // marked tile must not be black to the player. The fuse
        // marker renders on the bomber itself, which the fog
        // filter above already hides when its cell is not 'full'.
        if (d.en.type === 'sniper' && d.en.telegraph) {
          var tt = d.en.telegraph;
          if (fogVisibility(tt.x, tt.y) !== 'black' && C.lineOfSight && C.lineOfSight(state, d.en.x, d.en.y, tt.x, tt.y)) {
            var tx0 = org.ox + tt.x * TILE, ty0 = org.oy + tt.y * TILE;
            ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 3;
            ctx.strokeRect(tx0 + 3, ty0 + 3, TILE - 6, TILE - 6);
            ctx.beginPath();
            ctx.moveTo(tx0 + TILE / 2, ty0 + 6); ctx.lineTo(tx0 + TILE / 2, ty0 + TILE - 6);
            ctx.moveTo(tx0 + 6, ty0 + TILE / 2); ctx.lineTo(tx0 + TILE - 6, ty0 + TILE / 2);
            ctx.stroke(); ctx.lineWidth = 1;
          }
        }
        if (d.en.type === 'bomber' && d.en.fuseArmed) {
          ctx.fillStyle = '#ffb020'; ctx.font = 'bold ' + Math.max(13, Math.round(TILE * 0.2)) + 'px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('!', cx, cy - TILE * 0.85 + 34);
        }
      } else {
        ctx.strokeStyle = '#35e05c'; ctx.lineWidth = 3;
        ctx.strokeRect(x0 + 2, y0 + 2, TILE - 4, TILE - 4); ctx.lineWidth = 1;
        drawActor(ctx, 'player', 'player', p.facing, cx, cy, Math.round(TILE * 0.95));
        // Player HP bar, always shown (Pixel Dungeon style), above the tile.
        var pbw = TILE * 0.62;
        ctx.fillStyle = '#222'; ctx.fillRect(cx - pbw / 2, cy - TILE * 0.85, pbw, 6);
        ctx.fillStyle = '#35e05c'; ctx.fillRect(cx - pbw / 2, cy - TILE * 0.85, pbw * Math.max(0, p.hp / (C.derivedStats ? C.derivedStats(state).maxHp : p.maxHp)), 6);
      }
    });
    // Graphics pass: tracers (fading lines) and impact sparks
    // (short-lived drifting dots), both spawned by doFire/doForce.
    (function () {
      var now = Date.now();
      tracers = tracers.filter(function (tr) { return now - tr.start < tr.dur; });
      tracers.forEach(function (tr) {
        var a = 1 - (now - tr.start) / tr.dur;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = tr.color; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(org.ox + tr.x0 * TILE, org.oy + tr.y0 * TILE);
        ctx.lineTo(org.ox + tr.x1 * TILE, org.oy + tr.y1 * TILE);
        ctx.stroke();
        ctx.restore();
      });
      particles = particles.filter(function (pt) { return pt.t < pt.life; });
      particles.forEach(function (pt) {
        pt.x += pt.vx; pt.y += pt.vy; pt.t++;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - pt.t / pt.life);
        ctx.fillStyle = pt.color;
        ctx.fillRect(org.ox + pt.x * TILE - pt.size / 2, org.oy + pt.y * TILE - pt.size / 2, pt.size, pt.size);
        ctx.restore();
      });
    })();
    floats = floats.filter(function (f) { return f.t < 60; });
    floats.forEach(function (f) {
      var cx = org.ox + f.x * TILE + TILE / 2, cy = org.oy + f.y * TILE + TILE / 2 - TILE * 0.7 - f.t * 0.5;
      ctx.globalAlpha = 1 - f.t / 60;
      ctx.fillStyle = f.color; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
      ctx.fillText(f.text, cx, cy);
      ctx.globalAlpha = 1;
      f.t++;
    });
    requestAnimationFrame(render);
  }

  // Debug hook (no UI effect): lets a test page read live state and
  // pose state. getState() always returns the current run's state.
  // Fixwave: render-position hook so a verifier can prove a walk
  // is mid-slide (drawn position between tiles) rather than
  // trusting a screenshot alone. Logic state is unchanged.
  window.__scrapDebug = { getState: function () { return state; }, pose: currentPose, playerRenderPos: function () { return slidePos('player', state.player.x, state.player.y); }, actorRenderPos: function (id) { var en = null; state.floor.enemies.forEach(function (e) { if (e.id === id) en = e; }); if (!en) return null; return slidePos(id, en.x, en.y); }, walkStepMs: WALK_STEP_MS,
    fxState: function () { return { particles: particles.length, tracers: tracers.length, trail: pathTrail ? pathTrail.tiles.slice(pathTrail.idx) : null, fxOverlayOn: fxOverlayOn }; } };

  resizeCanvas();
  refreshHud();
  if (pendingHubScreen) showHubScreen(pendingHubScreen);
  requestAnimationFrame(render);
})();
