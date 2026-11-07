# Batch 3 — STAGING ONLY (sliced + QC, no game wiring) — 2026-10-27

Two user tilesets (the user's own Google Gemini generations; slicing/copying
explicitly allowed). Staging only: nothing in `game/` or `beta-testers/` was
touched. Raws in `raw/` are untouched. Scripts: `slice_batch3.py` (first pass),
`fix_batch3.py` (the one allowed re-crop/rename pass after QC).

QC target added mid-task: `templates/refs/graphics-goal-2026-10-27.jpg`
(1376x768) — dense varied metal floors with cracks/rust/grates, debris on
nearly every tile, large multi-tile scrap piles, pipes along walls, thick rust
wall borders with black door openings, single-line top HUD. No ammo system
exists in the game; nothing here fakes one.

## Inputs

- `raw/tileset-panels-hazard-consoles.jpg` — 1408x768 RGB (sheet 1, "s1")
- `raw/tileset-rusty-circuit-pipes-consoles.jpg` — 1408x768 RGB (sheet 2, "s2")
- Sheet background (flood-fill key sample): s1 ≈ (36,39,44), s2 ≈ (29,31,37).
  Keying: flood-fill from crop edges through pixels within Euclidean distance
  32 of the sheet background, 1.2px alpha blur, trim to alpha bbox + 2px pad
  (same method as batch 2).

## Grid measurements (verified on red-line overlays + contact sheets)

These are Gemini-generated images, not exact grids — boundaries drift a few px.
All tile crops are inset 3px inside the cell boundaries below, then resized to
256x256 LANCZOS (batch-2 plain-tile convention), opaque RGB.

Sheet 1 (s1) — two blocks, pitch x ≈ 85, pitch y ≈ 88, cell ≈ 82x84:
- Left block x boundaries: [20, 105, 189, 275, 359, 444, 529, 613, 713]
- Right block x boundaries: [713, 797, 882, 966, 1051, 1136, 1221, 1306, 1407]
- Row y boundaries: [17, 105, 194, 300]; row 3 actually ends at y ≈ 280, so
  row-3 right-block tiles were re-cropped with y1 = 282 in the fix pass.
- Row 3 of the left block drifts ~1 cell: the small console sits in col 3 and
  the shutters in col 4, not cols 2/3 as rows 1-2 suggest. Files were renamed
  to match content (see inventory); the drift is recorded, not papered over.
- Row 3 right block cols 5-7 are empty dark background: no tiles there.

Sheet 2 (s2) — one block, pitch x ≈ 99-100, cell ≈ 91 wide; rows are
taller than columns (cell ≈ 91x101, gutter ≈ 13-14):
- x boundaries: [10, 110, 210, 309, 408, 508, 608, 707, 805, 905, 1004, 1103, 1202, 1302, 1407]
- Row y boundaries: [10, 123, 241, 345]. Below y = 345 the sheet is freeform
  (pipes, consoles, scrap, stairs).
- Row 1 cols 12-13 are ONE L-shaped corner wall piece, not two tiles: sliced
  as one wide opaque slice `batch3_s2_wall_corner_L`.
- Row 3 cols 11-13 are empty dark background except the sludge tile at col 11,
  which was found one cell right of its first assumed position (see renames).

## Output conventions

- Full-bleed tiles: 256x256, opaque RGB, filename `batch3_s1_*.png` /
  `batch3_s2_*.png`.
- Keyed props: native trimmed size, RGBA, plus a 512x512 centred copy with
  `-512` suffix (batch-2 loot convention). 57 `-512` copies.
- Wide/opaque multi-cell pieces (`hazard_strip_*`, `wall_corner_L`,
  `stairs_down`, `ladder_platform`): native size, opaque RGB, NOT square.
  They need a wide-cell renderer at wiring time (see caveats).
- Every filename carries the `batch3_` prefix. Checked read-only against
  `game/assets/`: no filename collides with an existing asset file, and no
  proposed key below collides with an existing `SHEETS`/`PLAIN`/`BIOMES` key
  in `game/game.js` (read-only inspection only).

## Counts

- Kept slices: 145 total — sheet 1: 80 (45 grid tiles + 3 hazard tiles +
  2 hazard strips + 30 keyed props), sheet 2: 65 (39 grid/wide tiles +
  26 props incl. 2 opaque wide pieces).
- Files on disk: 202 (145 slices + 57 `-512` copies).
- Discarded: 4 slices deleted (see Discards). Un-sliced repeats are listed
  under Discards, not shipped as duplicates.

## Inventory — sheet 1 (s1), 80 slices

Grid tiles (256x256; cell = row, col in the block grids above, inset 3px):
`panel_plain_a` L(0,0), `panel_plain_b` L(0,1), `panel_plain_c` L(0,2),
`panel_plain_d` L(0,3), `panel_plain_e` L(0,4), `panel_pipes_a` L(0,5),
`panel_console_a` L(0,6), `panel_console_b` L(0,7),
`panel_plain_f` L(1,0), `panel_plain_g` L(1,1), `panel_vent` L(1,2),
`panel_pipes_b` L(1,3), `panel_pipes_c` L(1,4), `panel_pipes_d` L(1,5),
`panel_console_c` L(1,6), `panel_console_d` L(1,7),
`panel_plain_h` L(2,0), `panel_plain_i` L(2,1), `panel_plain_j` L(2,2, plain —
renamed, was mislabelled console_e), `panel_console_e` L(2,3, small console —
renamed, was mislabelled vent_shutters), `panel_vent_shutters` L(2,4 — renamed,
was mislabelled plain_j). (L(2,5)-(2,7) do not exist on the sheet.)
`vent_slats_a` R(0,0), `vent_slats_b` R(0,1), `vent_slats_c` R(0,2),
`vent_slats_d` R(0,3), `vent_slats_e` R(0,4), `panel_plain_k` R(0,5),
`vent_slats_f` R(0,6), `panel_plain_l` R(0,7),
`panel_plain_m` R(1,0), `panel_plain_n` R(1,1),
`floor_hazard_check_a` R(1,2), `floor_hazard_check_b` R(1,3),
`panel_plain_o` R(1,4), `panel_plain_p` R(1,5, re-cropped y1=186 to drop
hazard bleed), `floor_grate_round` R(1,6), `floor_grate_green` R(1,7),
`vent_slats_g` R(2,0, re-cropped y1=282), `floor_grey_a` R(2,1, y1=282),
`floor_grey_b` R(2,2, y1=282), `floor_grey_c` R(2,3, y1=282),
`floor_hazard_scrape` R(2,4, y1=282).

Hazard tiles/strips: `floor_hazard_a` (23,313,99,386) 256x256,
`floor_hazard_b` (23,403,99,476) 256x256,
`floor_hazard_corner` (291,313,363,395) 256x256 (diagonal-cut corner piece),
`hazard_strip_vertical` (396,312,432,546) 36x234 opaque,
`hazard_strip_horizontal` (20,488,362,522) 342x34 opaque.

Keyed props (source box -> trimmed size):
`console_single` (568,322,624,412) -> 49x86;
`console_double` (642,306,712,412) -> 70x106;
`console_tall` (728,312,788,412) -> 33x100 (narrow unit, as drawn);
`monitor_map` (828,328,904,382) -> 76x54;
`monitor_text` (910,328,972,382) -> 49x54, CAVEAT: right frame edge clipped
~8px by keying (dark frame close to sheet background); kept, see caveats;
`server_small` (1012,344,1072,412) -> 60x68;
`console_triple` (566,434,698,550) -> 132x116;
`console_single_mid` (722,434,776,550) -> 54x116;
`console_tall_small` (822,422,878,528) -> 41x104;
`server_tall_a` (1000,418,1080,554) -> 80x136;
`server_pair` (1088,418,1202,552) -> 114x134;
`server_tall_b` (1224,420,1292,552) -> 68x132;
`server_tall_c` (1305,420,1400,552) -> 83x132;
`server_top_pair` (1240,338,1388,432) -> 148x94 (cabled rack pair);
`door_closed` (482,592,648,752) -> 166x160 (2-cell wide, black interior kept);
`door_open` (692,592,884,752) -> 180x160 (2-cell wide);
`door_broken` (912,592,1112,752) -> 200x160 (2-cell wide, cracked door);
`light_green` (1150,588,1214,680) -> 60x86; `light_orange` (1248,588,1300,680)
-> 52x83; `light_blue` (1330,588,1390,680) -> 60x86 (baked radial glow halos
kept as soft discs — read as glow on dark, soft disc on light);
`lamp_hanging_a` (1150,686,1220,758) -> 61x72;
`lamp_hanging_b` (1244,686,1328,758) -> 84x72;
`lamp_hanging_c` (1342,686,1396,758) -> 54x72;
`debris_shells` (16,598,112,662) -> 82x64 (scattered casings);
`debris_cans` (136,602,206,664) -> 57x62, CAVEAT: sparse scatter (jar + cans),
kept as-is after the one re-crop pass;
`prop_barrel_grey` (232,598,288,680) -> 56x82;
`prop_crate_skull_a` (296,598,362,680) -> 66x82;
`prop_barrel_rust` (390,598,442,678) -> 52x78;
`prop_barrel_blue` (30,686,86,758) -> 52x65;
`prop_crate_skull_b` (108,686,182,758) -> 74x72;
`fire_extinguisher` (218,686,262,758) -> 34x64;
`toolbox_red` (284,690,358,756) -> 74x66;
`toolbox_grey` (382,698,446,758) -> 64x60.

## Inventory — sheet 2 (s2), 65 slices

Grid tiles (256x256; cell = row, col in the grid above, inset 3px):
`floor_rusty_a` (0,0), `floor_rusty_b` (0,1), `floor_mesh` (0,2),
`floor_diamond` (0,3), `floor_cracked_a` (0,4), `floor_circuit_a` (0,5, cross),
`floor_circuit_b` (0,6, T), `floor_circuit_c` (0,7, lines),
`floor_hazard_top_a` (0,8), `floor_hazard_top_b` (0,9),
`floor_tiles_grey` (0,10), `floor_cracked_b` (0,11, cracked + hazard edges),
`wall_panel_a` (1,0), `wall_panel_b` (1,1), `wall_panel_c` (1,2),
`wall_corner_a` (1,3), `wall_corner_b` (1,4), `wall_pipe_a` (1,5),
`wall_pipe_b` (1,6), `wall_pipe_c` (1,7), `wall_panel_console` (1,8),
`wall_door_closed_a` (1,9), `wall_door_closed_b` (1,10),
`wall_door_open_a` (1,11), `wall_door_open_b` (1,12),
`wall_door_open_c` (1,13),
`vent_slats` (2,0), `vent_grid` (2,1), `vent_hazard_a` (2,2),
`vent_hazard_b` (2,3), `vent_hole_hazard` (2,4), `vent_grid_hole` (2,5),
`vent_hole_square` (2,6, vent + square hole, no steam — renamed from
vent_steam_a), `vent_steam_a` (2,7 — renamed from vent_steam_b),
`vent_steam_b` (2,8 — renamed from wall_hole_wires),
`wall_hole_wires` (2,9 — renamed from wall_hole_cracked),
`wall_hole_cracked` (2,10 — renamed from floor_sludge),
`floor_sludge` (1109,244,1196,342) 256x256 (green sludge pool; found at
col 11, not col 10).
Wide tile: `wall_corner_L` (1205,13,1394,120) 189x107 opaque (L-shaped
corner wall, black void baked underneath).

Keyed props (source box -> trimmed size):
`pipe_run_elbow` (8,366,254,440) -> 246x74 (horizontal run + down elbow);
`pipe_tee_a` (306,368,402,434) -> 96x66;
`pipe_vertical_valve` (452,366,508,468) -> 41x85;
`pipe_tee_down` (528,378,624,468) -> 96x72;
`pipe_valve_box` (640,378,720,440) -> 80x62;
`cables_a` (736,374,862,468) -> 126x70;
`cables_b` (864,374,1000,468) -> 136x94;
`cable_drop` (1000,350,1075,470) -> 75x120 (cables dropping from above);
`cable_junction_box` (1128,396,1214,468) -> 86x54 (lightning-symbol box);
`console_term_a` (24,486,94,578) -> 70x92;
`console_term_b` (126,486,196,578) -> 70x92;
`console_term_green` (234,496,282,578) -> 48x82;
`console_term_blue` (320,496,378,578) -> 58x82;
`keypad_small_a` (416,542,448,576) -> 32x34 (JPEG-soft, small);
`keypad_tall` (544,496,578,546) -> 34x50;
`console_map` (622,486,688,578) -> 66x92;
`console_wide_2` (714,486,862,578) -> 142x92;
`console_wide_3` (882,486,1096,578) -> 211x92;
`scrap_pile_a` (18,618,196,742) -> 178x124 (goal-like corner pile);
`scrap_pile_wires` (210,618,398,736) -> 188x118;
`armour_broken` (398,612,540,744) -> 142x132 (broken armour + loose parts);
`scrap_debris` (528,614,650,742) -> 122x128;
`crates_stack` (660,640,768,742) -> 108x101;
`exit_sign` (1318,622,1386,652) -> 68x30.
Opaque wide pieces (native size, RGB, black void baked in):
`stairs_down` (872,600,1098,762) 226x162;
`ladder_platform` (1110,600,1292,758) 182x158.

## QC

Contact sheets (viewed by eye; props on a light/dark checker, tiles on dark):
- `qc/qc_s1_tiles.png` (45 tiles), `qc/qc_s1_props.png` (35 props)
- `qc/qc_s2_tiles.png` (39 tiles), `qc/qc_s2_props.png` (26 props)
- `qc/qc_fixcheck.png` (18 re-cropped/renamed items, incl. sludge tile,
  opaque stairs/ladder, renamed row-3 tiles)
Checks: cut-off edges, neighbour bleed, JPEG artefacts, keying on both
backgrounds. The fix pass re-cropped 24 items and renamed 7 (row-3 drift in
both sheets). Per the brief, misses were re-cropped once, then stopped:
`debris_cans` (sparse) and `monitor_text` (clipped right frame) are kept
with caveats above rather than re-cut a second time.

## Discards (deleted, not shipped)

- `batch3_s2_keypad_small_b` — second small keypad; JPEG mush, unreadable
  as a keypad at tile scale. `keypad_small_a` + `keypad_tall` kept.
- `batch3_s2_pipe_valve_red` — red-wheel valve assembly could not be
  isolated cleanly from the cable bundle behind it; the cut was mostly
  neighbour cables. No clean valve slice exists in this batch.
- `batch3_s2_stairs_down` (keyed version) — flood-fill ate the baked black
  void under the stairs and left edge slivers; the opaque version is the
  keeper. Same for `batch3_s2_ladder_platform` (keyed version deleted;
  opaque keeper).
- Not sliced (repeats / empty): the other 4 hazard squares on s1 (same art
  as the 2 kept), the second vertical hazard strip (identical to the kept
  one), the 3 remaining horizontal-strip segments (kept as one full row),
  s1 row-3 right-block empty cells, s2 row-3 cols 12-13 (empty background).

## Wiring proposal (PROPOSAL ONLY — no game edits made)

All proposed keys use the `batch3_` prefix. Existing keys referenced are
from `game/game.js` as inspected read-only.

- Floors (PLAIN, 256x256, drop-in variants): `batch3_floor_rusty_a/b`,
  `batch3_floor_cracked_a/b`, `batch3_floor_mesh`, `batch3_floor_diamond`,
  `batch3_floor_tiles_grey` -> candidates for `industrial`/`scrapyard`
  `floorVariants` alongside `vision_floor_plain` / `floor_rusty_b`.
  `batch3_floor_circuit_a/b/c` -> candidates for `neon` floor and the
  industrial `circuitBlock` art (replacing/augmenting `vision_floor_circuit`).
  `batch3_floor_sludge` -> candidate `toxic` floor variant.
  `batch3_floor_hazard_*`, `batch3_floor_grate_*`, `batch3_floor_grey_*` ->
  dressing/detail floor variants; hazard-check tiles read as floor markings,
  not walkable-path art — place as dressing, not as the base floor.
- Walls (PLAIN, 256x256, drop-in variants): `batch3_panel_*` (s1, blue-grey)
  and `batch3_wall_panel_*`, `batch3_wall_corner_*`, `batch3_wall_pipe_*`
  (s2, rusty) -> candidates for `industrial`/`scrapyard` `wallVariants`
  alongside `vision_wall_top/top2/right` / `wall_scrap`. Note goal-fit:
  the goal frame is warm rust/grey; the s2 rusty set matches it best and the
  s1 blue-grey set matches least — use s1 panels sparingly (cool variant).
  `batch3_wall_door_*` are single-cell wall tiles with a door front drawn
  in; they are NOT the door object (`tile_door_sheet` / `door` key) and
  should only dress wall cells, never the stairs/door cell.
  `batch3_wall_pipe_a/b/c` have open pipe ends at the bottom edge (the
  pipes continue below the cell on the sheet): place only as top-of-wall
  art, or accept a cut pipe end.
- Vents/grates (PLAIN): `batch3_vent_*`, `batch3_floor_grate_*` -> proposed
  new detail keys (e.g. `batch3_detail_vent`) for the existing dressing
  system; `vent_steam_*` steam is baked and static — do not animate.
- Scrap piles (keyed props): `batch3_scrap_pile_a`, `batch3_scrap_pile_wires`,
  `batch3_armour_broken`, `batch3_scrap_debris` -> proposed new pile keys
  (e.g. `batch3_pile_scrap_a`) for the existing pile/dressing slots. The
  goal frame's corner piles are multi-tile; these are single-cell props —
  grouping 2x2 at wiring time is the honest way to echo the goal, not
  stretching one prop over 2 cells.
- Consoles/servers/monitors (keyed props): `batch3_console_*`,
  `batch3_server_*`, `batch3_monitor_*`, `batch3_keypad_*` -> proposed NEW
  dressing kind (e.g. `console`), which needs a `core.js` dressing kind +
  renderer entry; there is no existing console slot. Wide consoles
  (`console_triple`, `console_wide_2/3`, `server_pair`, `server_top_pair`)
  span ~1.5-2 cells wide and need wide-cell placement, not single-cell
  dressing. Monitors are wall-mounted: they need wall-row placement.
- Doors (keyed, 2 cells wide): `batch3_door_closed/open/broken` -> proposed
  new 2-cell door art; the current door rendering is a 1-cell sheet, so
  these need a wide-cell renderer. The black interior is part of the art
  (enclosed, survived keying) — do not re-key it transparent.
- Stairs/ladder (opaque, wide): `batch3_stairs_down` (226x162),
  `batch3_ladder_platform` (182x158) -> proposed stairs art; both carry a
  baked black void that will NOT composite over floor tiles. Wide-cell
  renderer + a dark backing cell required; the ladder piece is a platform,
  not a stairs-down replacement — do not wire it as stairs.
- Pipes/cables (keyed): `batch3_pipe_*`, `batch3_cables_*`,
  `batch3_cable_drop`, `batch3_cable_junction_box` -> proposed wall-top /
  wall-row dressing; horizontal runs touch both side edges of their boxes,
  so they only read correctly as continuous runs, not isolated props.
- Small props (keyed): `batch3_prop_barrel_*`, `batch3_prop_crate_skull_*`,
  `batch3_toolbox_*`, `batch3_fire_extinguisher`, `batch3_debris_*`,
  `batch3_crates_stack`, `batch3_exit_sign`, `batch3_light_*`,
  `batch3_lamp_hanging_*` -> proposed dressing/prop keys reusing the
  existing dressing slots (`debris` kind etc.). `exit_sign` is a wall-hung
  sign: wall-row placement, not floor dressing. Lights/lamps carry baked
  glow halos and hang from the top edge (lamps) — place accordingly.

## Honest caveats

1. Nothing here is seamless: these are crops of generated images (same as
   batch 2). Wire them as mixed variants, never as a seamless tiled field,
   or repeats will read as wallpaper.
2. JPEG softness: small items (`keypad_*`, screen text) are soft at tile
   scale; screen text is illegible by design (green-text texture, not
   readable copy) — that matches the game's existing console art.
3. Baked backgrounds: `stairs_down`, `ladder_platform`, `wall_corner_L`
   contain baked black voids; `hazard_strip_*` contain baked sheet
   background at their edges; lights contain baked glow. None of these
   composite cleanly over arbitrary floor tiles without a backing cell.
4. Multi-cell props need a wide-cell renderer that does not exist yet:
   doors (2 cells), wide consoles/servers (~2 cells), stairs/ladder
   (~2 cells), corner-L (2 cells). Single-cell wiring would crop them.
5. Decor/pickup ambiguity (standing Task-1 caveat): industrial `debris`
   dressing already renders as loot sprites (crystal/key/crate/gear). The
   new barrels/crates/scrap props, if wired as dressing, will amplify
   that ambiguity unless dressing gets a distinct treatment (no highlight
   ring is the current tell for real pickups — keep it that way).
6. Colour fit vs the goal frame: s2 rusty/circuit is the closest match;
   s1 blue-grey panels + cyan circuit floors are cooler than the goal's
   warm rust palette. The cyan circuit floors fit the existing neon biome
   better than the goal frame.
7. No balance, mechanics, HUD, or ammo changes are proposed or implied by
   this staging. The goal frame's "Ammo: 12/15" is not a feature of this
   game and was not built.
