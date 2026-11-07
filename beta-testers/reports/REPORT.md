# SCRAP DUNGEON — beta-tester report

Generated: 2026-10-30 11:01 UTC — game snapshot: {'core.js': '9ee43bd92cc0', 'game.js': 'c1602b99b6e7', 'index.html': 'c74a81983969', 'test.js': '4a3586431757', 'style.css': '4c4dc1ed1a63'}

Suite: `beta-testers/run_all.py` (see `beta-testers/README.md`). Testers READ the game only; nothing under `game/` was edited.

## Totals: 359 PASS, 0 FAIL, 2 NOTE, 0 ENV

Blocker failures: 0 — Major failures: 0

## Tester opinions and suggestions

These are the AUTOMATED tester personas' critique — not real human players. Opinions are an addition to the QC verdict above, never a replacement for it, and no opinion is a bug or a test failure. Every suggestion names the observation from this run that grounded it; where a run did not support a suggestion, the persona says so instead of inventing one.

### Consolidated, highest-impact first (11 items)

- [HIGH] (controls/feel) Give wall bumps some feedback — a thud, a tiny shake, or even just a log line. Right now bumping a wall feels like the game ignored my input. — agreed by: casual
  - grounded in: In my run, 20 move attempts changed nothing at all (position and clock both identical) — see the casual NOTE 'wall bumps give no feedback'.
- [MEDIUM] (graphics/visuals) Give each mech its own wreck. Killed raiders, drones and brutes all leave the same wreck pile, which flattens the moment of a kill — keep a hint of each silhouette in its wreck. — agreed by: graphics-qc
  - grounded in: All destroyed sheets measured identical opaque-pixel counts: [8541].
- [MEDIUM] (graphics/visuals) Exaggerate the walk cycle — bigger leg swing, more bob. The two walk frames are so close that movement reads as a slide, not a stride. — agreed by: graphics-qc
  - grounded in: Scout walk_a vs walk_b differ by only 6.7% in opaque pixels.
- [MEDIUM] (flow/pacing) Put an enemy — or at least a visible goal — closer to spawn. I wandered a whole session and never got into a fight, so I never learned what combat feels like. — agreed by: casual
  - grounded in: 120 random actions, final clock 630, kills 0.
- [MEDIUM] (flow/pacing) Drop a small salvage pile within a couple of steps of spawn. Early loot teaches the pickup loop before the player has to trek for it. — agreed by: completionist
  - grounded in: My first pickup was 24 steps away (kind: salvage).
- [MEDIUM] (controls/feel) Bump the smallest buttons up toward 56px. On a phone, a 40-something-pixel target is a thumb-miss waiting to happen, especially mid-combat. — agreed by: mobile
  - grounded in: Smallest tap target at 390px was 'Recenter' at 44x44px.
- [MEDIUM] (controls/feel) Touch taps work, but make the tap zone a touch more forgiving — a near-miss tap on a tile edge shouldn't feel like a miss. Fat-finger tolerance is the whole game on a phone. — agreed by: mobile
  - grounded in: My touchscreen tap on an adjacent walkable tile moved/attacked at 390px, but it had to land on the tile precisely.
- [LOW] (flow/pacing) Keep a small 'what am I doing' reminder on screen — stairs direction or current goal. After a long wander I forgot whether I was hunting loot or heading down. — agreed by: casual
  - grounded in: My run lasted 120 actions to clock 630 with hp 100.
- [LOW] (controls/feel) Modal blocking works — but make the way out obvious, like a big Close button. Blocking stray taps is correct; leaving me hunting for the exit is not. — agreed by: bug-hunter
  - grounded in: 3/3 dock clicks were blocked by the Bag modal overlay in my spam run, and state stayed sane.
- [LOW] (relatability/fun) The reload hub screen works cleanly — I'd love a one-line 'last run' summary on it (depth, kills, banked) so coming back feels like continuing a story, not just resuming a save. — agreed by: bug-hunter
  - grounded in: My save/load round-trip offered Continue and resumed the same run (hp/depth/clock matched before and after reload).
- [LOW] (flow/pacing) The phone layout fits with no sideways scroll, which is great — use that headroom to show a bit more of the room, so I can plan further ahead instead of scrolling the map in my head. — agreed by: mobile
  - grounded in: At 390px, horizontal overflow was 0px and the bottom dock was on screen.

### graphics-qc — in their own voice (an art reviewer staring at the sprites and the screen)

- [MEDIUM] (graphics/visuals) Give each mech its own wreck. Killed raiders, drones and brutes all leave the same wreck pile, which flattens the moment of a kill — keep a hint of each silhouette in its wreck.
  - grounded in: All destroyed sheets measured identical opaque-pixel counts: [8541].
- [MEDIUM] (graphics/visuals) Exaggerate the walk cycle — bigger leg swing, more bob. The two walk frames are so close that movement reads as a slide, not a stride.
  - grounded in: Scout walk_a vs walk_b differ by only 6.7% in opaque pixels.
- (no suggestion) distinct component art: no shared sheet this run
- (no suggestion) sprite contrast: screenshot already has enough bright samples

### casual — in their own voice (a new player mashing around, figuring the game out as I go)

- [HIGH] (controls/feel) Give wall bumps some feedback — a thud, a tiny shake, or even just a log line. Right now bumping a wall feels like the game ignored my input.
  - grounded in: In my run, 20 move attempts changed nothing at all (position and clock both identical) — see the casual NOTE 'wall bumps give no feedback'.
- [MEDIUM] (flow/pacing) Put an enemy — or at least a visible goal — closer to spawn. I wandered a whole session and never got into a fight, so I never learned what combat feels like.
  - grounded in: 120 random actions, final clock 630, kills 0.
- [LOW] (flow/pacing) Keep a small 'what am I doing' reminder on screen — stairs direction or current goal. After a long wander I forgot whether I was hunting loot or heading down.
  - grounded in: My run lasted 120 actions to clock 630 with hp 100.
- (no suggestion) wall/floor contrast: wall share was not high this run

### completionist — in their own voice (a player who wants to clear every floor properly)

- [MEDIUM] (flow/pacing) Drop a small salvage pile within a couple of steps of spawn. Early loot teaches the pickup loop before the player has to trek for it.
  - grounded in: My first pickup was 24 steps away (kind: salvage).
- (no suggestion) stairs-journey rewards: stairs leg was short or unmeasured
- (no suggestion) loot variety: floor already showed several pickup kinds
- (no suggestion) distinct component art: no shared pickup sheet this run

### bug-hunter — in their own voice (someone poking at every edge to see what breaks)

- [LOW] (controls/feel) Modal blocking works — but make the way out obvious, like a big Close button. Blocking stray taps is correct; leaving me hunting for the exit is not.
  - grounded in: 3/3 dock clicks were blocked by the Bag modal overlay in my spam run, and state stayed sane.
- [LOW] (relatability/fun) The reload hub screen works cleanly — I'd love a one-line 'last run' summary on it (depth, kills, banked) so coming back feels like continuing a story, not just resuming a save.
  - grounded in: My save/load round-trip offered Continue and resumed the same run (hp/depth/clock matched before and after reload).
- (no suggestion) unheld-item feedback: the log already reports unheld items
- (no suggestion) waiting danger signal: Wait spam did not kill me

### mobile — in their own voice (a phone-only player, thumb on the screen)

- [MEDIUM] (controls/feel) Bump the smallest buttons up toward 56px. On a phone, a 40-something-pixel target is a thumb-miss waiting to happen, especially mid-combat.
  - grounded in: Smallest tap target at 390px was 'Recenter' at 44x44px.
- [MEDIUM] (controls/feel) Touch taps work, but make the tap zone a touch more forgiving — a near-miss tap on a tile edge shouldn't feel like a miss. Fat-finger tolerance is the whole game on a phone.
  - grounded in: My touchscreen tap on an adjacent walkable tile moved/attacked at 390px, but it had to land on the tile precisely.
- [LOW] (flow/pacing) The phone layout fits with no sideways scroll, which is great — use that headroom to show a bit more of the room, so I can plan further ahead instead of scrolling the map in my head.
  - grounded in: At 390px, horizontal overflow was 0px and the bottom dock was on screen.
- (no suggestion) last log line: the transient overlay already shows it

## graphics-qc (319 PASS / 0 FAIL)

- [PASS] (Blocker) all referenced sheets exist on disk — all 169 referenced sheets present
- [NOTE] (Minor) unreferenced sheets in assets/ (dead weight, not a bug) — unreferenced: ['prop_salvage_sheet.png'] — safe to delete or wire in
- [PASS] (Major) tile asset batch3_s1_console_double.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_console_double.png — opaque=24414 nonblack-opaque=23146 bytes=45556
- [PASS] (Major) tile asset batch3_s1_console_single.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_console_single.png — opaque=20214 nonblack-opaque=19611 bytes=34453
- [PASS] (Major) tile asset batch3_s1_console_single_mid.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_console_single_mid.png — opaque=19518 nonblack-opaque=18447 bytes=35587
- [PASS] (Major) tile asset batch3_s1_console_tall.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_console_tall.png — opaque=12344 nonblack-opaque=11808 bytes=25245
- [PASS] (Major) tile asset batch3_s1_console_tall_small.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_console_tall_small.png — opaque=14341 nonblack-opaque=13602 bytes=28476
- [PASS] (Major) tile asset batch3_s1_debris_cans.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_debris_cans.png — opaque=7617 nonblack-opaque=6798 bytes=22206
- [PASS] (Major) tile asset batch3_s1_debris_shells.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_debris_shells.png — opaque=8245 nonblack-opaque=7356 bytes=28817
- [PASS] (Major) tile asset batch3_s1_fire_extinguisher.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_fire_extinguisher.png — opaque=14959 nonblack-opaque=13919 bytes=35450
- [PASS] (Major) tile asset batch3_s1_floor_grate_green.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_floor_grate_green.png — opaque=65536 nonblack-opaque=65369 bytes=51119
- [PASS] (Major) tile asset batch3_s1_floor_grate_round.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_floor_grate_round.png — opaque=65536 nonblack-opaque=65182 bytes=57760
- [PASS] (Major) tile asset batch3_s1_floor_grey_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_floor_grey_a.png — opaque=65536 nonblack-opaque=65536 bytes=44361
- [PASS] (Major) tile asset batch3_s1_floor_grey_b.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_floor_grey_b.png — opaque=65536 nonblack-opaque=65536 bytes=29979
- [PASS] (Major) tile asset batch3_s1_floor_grey_c.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_floor_grey_c.png — opaque=65536 nonblack-opaque=65257 bytes=40579
- [PASS] (Major) tile asset batch3_s1_panel_console_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_panel_console_a.png — opaque=65536 nonblack-opaque=65143 bytes=68097
- [PASS] (Major) tile asset batch3_s1_panel_pipes_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_panel_pipes_a.png — opaque=65536 nonblack-opaque=64678 bytes=59207
- [PASS] (Major) tile asset batch3_s1_panel_plain_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_panel_plain_a.png — opaque=65536 nonblack-opaque=64982 bytes=31512
- [PASS] (Major) tile asset batch3_s1_panel_vent.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_panel_vent.png — opaque=65536 nonblack-opaque=65132 bytes=45218
- [PASS] (Major) tile asset batch3_s1_prop_barrel_blue.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_prop_barrel_blue.png — opaque=24947 nonblack-opaque=23668 bytes=46714
- [PASS] (Major) tile asset batch3_s1_prop_barrel_grey.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_prop_barrel_grey.png — opaque=11207 nonblack-opaque=10078 bytes=27157
- [PASS] (Major) tile asset batch3_s1_prop_barrel_rust.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_prop_barrel_rust.png — opaque=14121 nonblack-opaque=13639 bytes=31349
- [PASS] (Major) tile asset batch3_s1_prop_crate_skull_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_prop_crate_skull_a.png — opaque=20538 nonblack-opaque=19701 bytes=34761
- [PASS] (Major) tile asset batch3_s1_prop_crate_skull_b.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_prop_crate_skull_b.png — opaque=27957 nonblack-opaque=26514 bytes=39750
- [PASS] (Major) tile asset batch3_s1_server_small.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_server_small.png — opaque=14732 nonblack-opaque=13853 bytes=26407
- [PASS] (Major) tile asset batch3_s1_server_tall_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_server_tall_a.png — opaque=19803 nonblack-opaque=18354 bytes=47933
- [PASS] (Major) tile asset batch3_s1_server_tall_b.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_server_tall_b.png — opaque=22357 nonblack-opaque=20756 bytes=54985
- [PASS] (Major) tile asset batch3_s1_server_tall_c.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_server_tall_c.png — opaque=18733 nonblack-opaque=17447 bytes=43569
- [PASS] (Major) tile asset batch3_s1_toolbox_grey.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_toolbox_grey.png — opaque=21233 nonblack-opaque=18944 bytes=43829
- [PASS] (Major) tile asset batch3_s1_toolbox_red.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_toolbox_red.png — opaque=25491 nonblack-opaque=23842 bytes=46220
- [PASS] (Major) tile asset batch3_s1_vent_slats_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_vent_slats_a.png — opaque=65536 nonblack-opaque=65534 bytes=67447
- [PASS] (Major) tile asset batch3_s1_vent_slats_b.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_vent_slats_b.png — opaque=65536 nonblack-opaque=65533 bytes=68068
- [PASS] (Major) tile asset batch3_s1_vent_slats_c.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s1_vent_slats_c.png — opaque=65536 nonblack-opaque=65533 bytes=67311
- [PASS] (Major) tile asset batch3_s2_armour_broken.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_armour_broken.png — opaque=24697 nonblack-opaque=22295 bytes=78299
- [PASS] (Major) tile asset batch3_s2_console_map.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_console_map.png — opaque=28195 nonblack-opaque=26945 bytes=52448
- [PASS] (Major) tile asset batch3_s2_console_term_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_console_term_a.png — opaque=29265 nonblack-opaque=27879 bytes=54499
- [PASS] (Major) tile asset batch3_s2_console_term_b.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_console_term_b.png — opaque=28000 nonblack-opaque=27115 bytes=53103
- [PASS] (Major) tile asset batch3_s2_console_term_blue.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_console_term_blue.png — opaque=26875 nonblack-opaque=25736 bytes=48637
- [PASS] (Major) tile asset batch3_s2_console_term_green.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_console_term_green.png — opaque=23591 nonblack-opaque=22197 bytes=38803
- [PASS] (Major) tile asset batch3_s2_crates_stack.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_crates_stack.png — opaque=24912 nonblack-opaque=23689 bytes=61378
- [PASS] (Major) tile asset batch3_s2_floor_circuit_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_floor_circuit_a.png — opaque=65536 nonblack-opaque=65016 bytes=64311
- [PASS] (Major) tile asset batch3_s2_floor_circuit_b.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_floor_circuit_b.png — opaque=65536 nonblack-opaque=65222 bytes=50799
- [PASS] (Major) tile asset batch3_s2_floor_circuit_c.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_floor_circuit_c.png — opaque=65536 nonblack-opaque=65045 bytes=52173
- [PASS] (Major) tile asset batch3_s2_floor_cracked_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_floor_cracked_a.png — opaque=65536 nonblack-opaque=65379 bytes=50599
- [PASS] (Major) tile asset batch3_s2_floor_cracked_b.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_floor_cracked_b.png — opaque=65536 nonblack-opaque=65400 bytes=61562
- [PASS] (Major) tile asset batch3_s2_floor_diamond.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_floor_diamond.png — opaque=65536 nonblack-opaque=65352 bytes=64653
- [PASS] (Major) tile asset batch3_s2_floor_mesh.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_floor_mesh.png — opaque=65536 nonblack-opaque=65099 bytes=61870
- [PASS] (Major) tile asset batch3_s2_floor_rusty_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_floor_rusty_a.png — opaque=65536 nonblack-opaque=65238 bytes=56874
- [PASS] (Major) tile asset batch3_s2_floor_rusty_b.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_floor_rusty_b.png — opaque=65536 nonblack-opaque=65375 bytes=57585
- [PASS] (Major) tile asset batch3_s2_floor_sludge.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_floor_sludge.png — opaque=65536 nonblack-opaque=65121 bytes=63050
- [PASS] (Major) tile asset batch3_s2_floor_tiles_grey.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_floor_tiles_grey.png — opaque=65536 nonblack-opaque=65139 bytes=57605
- [PASS] (Major) tile asset batch3_s2_keypad_small_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_keypad_small_a.png — opaque=24639 nonblack-opaque=23134 bytes=42913
- [PASS] (Major) tile asset batch3_s2_keypad_tall.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_keypad_tall.png — opaque=21074 nonblack-opaque=19952 bytes=39804
- [PASS] (Major) tile asset batch3_s2_scrap_debris.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_scrap_debris.png — opaque=20670 nonblack-opaque=19228 bytes=60476
- [PASS] (Major) tile asset batch3_s2_scrap_pile_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_scrap_pile_a.png — opaque=23785 nonblack-opaque=21617 bytes=73131
- [PASS] (Major) tile asset batch3_s2_scrap_pile_wires.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_scrap_pile_wires.png — opaque=17037 nonblack-opaque=15173 bytes=58132
- [PASS] (Major) tile asset batch3_s2_vent_grid.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_vent_grid.png — opaque=65536 nonblack-opaque=62195 bytes=47473
- [PASS] (Major) tile asset batch3_s2_vent_grid_hole.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_vent_grid_hole.png — opaque=65536 nonblack-opaque=63901 bytes=65108
- [PASS] (Major) tile asset batch3_s2_vent_hole_square.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_vent_hole_square.png — opaque=65536 nonblack-opaque=64135 bytes=62188
- [PASS] (Major) tile asset batch3_s2_vent_slats.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_vent_slats.png — opaque=65536 nonblack-opaque=63929 bytes=70724
- [PASS] (Major) tile asset batch3_s2_wall_corner_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_wall_corner_a.png — opaque=65536 nonblack-opaque=65037 bytes=60398
- [PASS] (Major) tile asset batch3_s2_wall_corner_b.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_wall_corner_b.png — opaque=65536 nonblack-opaque=64880 bytes=64586
- [PASS] (Major) tile asset batch3_s2_wall_door_closed_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_wall_door_closed_a.png — opaque=65536 nonblack-opaque=64838 bytes=57808
- [PASS] (Major) tile asset batch3_s2_wall_door_closed_b.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_wall_door_closed_b.png — opaque=65536 nonblack-opaque=64622 bytes=60445
- [PASS] (Major) tile asset batch3_s2_wall_door_open_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_wall_door_open_a.png — opaque=65536 nonblack-opaque=64086 bytes=56181
- [PASS] (Major) tile asset batch3_s2_wall_door_open_b.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_wall_door_open_b.png — opaque=65536 nonblack-opaque=64118 bytes=56681
- [PASS] (Major) tile asset batch3_s2_wall_door_open_c.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_wall_door_open_c.png — opaque=65536 nonblack-opaque=64064 bytes=54905
- [PASS] (Major) tile asset batch3_s2_wall_hole_cracked.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_wall_hole_cracked.png — opaque=65536 nonblack-opaque=63610 bytes=75911
- [PASS] (Major) tile asset batch3_s2_wall_hole_wires.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_wall_hole_wires.png — opaque=65536 nonblack-opaque=63956 bytes=63950
- [PASS] (Major) tile asset batch3_s2_wall_panel_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_wall_panel_a.png — opaque=65536 nonblack-opaque=65011 bytes=65617
- [PASS] (Major) tile asset batch3_s2_wall_panel_b.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_wall_panel_b.png — opaque=65536 nonblack-opaque=64840 bytes=70013
- [PASS] (Major) tile asset batch3_s2_wall_panel_c.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_wall_panel_c.png — opaque=65536 nonblack-opaque=64230 bytes=77000
- [PASS] (Major) tile asset batch3_s2_wall_panel_console.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_wall_panel_console.png — opaque=65536 nonblack-opaque=64916 bytes=62323
- [PASS] (Major) tile asset batch3_s2_wall_pipe_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_wall_pipe_a.png — opaque=65536 nonblack-opaque=64751 bytes=51451
- [PASS] (Major) tile asset batch3_s2_wall_pipe_b.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_wall_pipe_b.png — opaque=65536 nonblack-opaque=64824 bytes=47584
- [PASS] (Major) tile asset batch3_s2_wall_pipe_c.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content batch3_s2_wall_pipe_c.png — opaque=65536 nonblack-opaque=64942 bytes=47629
- [PASS] (Major) tile asset gen_floor_circuit.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_floor_circuit.png — opaque=65536 nonblack-opaque=62244 bytes=109175
- [PASS] (Major) tile asset gen_floor_dense_scrap.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_floor_dense_scrap.png — opaque=65536 nonblack-opaque=64792 bytes=173054
- [PASS] (Major) tile asset gen_floor_rusty_a.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_floor_rusty_a.png — opaque=65536 nonblack-opaque=65536 bytes=76875
- [PASS] (Major) tile asset gen_floor_rusty_b.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_floor_rusty_b.png — opaque=65536 nonblack-opaque=65534 bytes=58105
- [PASS] (Major) tile asset gen_frozen_detail.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_frozen_detail.png — opaque=10831 nonblack-opaque=10831 bytes=21795
- [PASS] (Major) tile asset gen_frozen_floor.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_frozen_floor.png — opaque=65536 nonblack-opaque=65536 bytes=144963
- [PASS] (Major) tile asset gen_frozen_pile.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_frozen_pile.png — opaque=19667 nonblack-opaque=19667 bytes=62718
- [PASS] (Major) tile asset gen_frozen_wall.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_frozen_wall.png — opaque=65536 nonblack-opaque=65536 bytes=139984
- [PASS] (Major) tile asset gen_molten_detail.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_molten_detail.png — opaque=14322 nonblack-opaque=8090 bytes=27992
- [PASS] (Major) tile asset gen_molten_floor.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_molten_floor.png — opaque=65536 nonblack-opaque=58880 bytes=90356
- [PASS] (Major) tile asset gen_molten_pile.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_molten_pile.png — opaque=11054 nonblack-opaque=11054 bytes=37059
- [PASS] (Major) tile asset gen_molten_wall.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_molten_wall.png — opaque=65536 nonblack-opaque=51568 bytes=95181
- [PASS] (Major) tile asset gen_overgrown_detail.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_overgrown_detail.png — opaque=17362 nonblack-opaque=13225 bytes=50557
- [PASS] (Major) tile asset gen_overgrown_floor.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_overgrown_floor.png — opaque=65536 nonblack-opaque=58865 bytes=146691
- [PASS] (Major) tile asset gen_overgrown_pile.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_overgrown_pile.png — opaque=21636 nonblack-opaque=16165 bytes=67592
- [PASS] (Major) tile asset gen_overgrown_wall.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_overgrown_wall.png — opaque=65536 nonblack-opaque=58286 bytes=133120
- [PASS] (Major) tile asset gen_pile_scrap.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_pile_scrap.png — opaque=34467 nonblack-opaque=27149 bytes=103985
- [PASS] (Major) tile asset gen_toxic_detail.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_toxic_detail.png — opaque=9094 nonblack-opaque=9053 bytes=22925
- [PASS] (Major) tile asset gen_toxic_floor.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_toxic_floor.png — opaque=65536 nonblack-opaque=59858 bytes=151577
- [PASS] (Major) tile asset gen_toxic_pile.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_toxic_pile.png — opaque=15874 nonblack-opaque=15339 bytes=56025
- [PASS] (Major) tile asset gen_toxic_wall.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_toxic_wall.png — opaque=65536 nonblack-opaque=61041 bytes=138375
- [PASS] (Major) tile asset gen_wall_dense_scrap.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_wall_dense_scrap.png — opaque=65536 nonblack-opaque=58480 bytes=114645
- [PASS] (Major) tile asset gen_wall_scrap.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content gen_wall_scrap.png — opaque=65536 nonblack-opaque=64790 bytes=150332
- [PASS] (Major) sheet geometry item_ammo_crate_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content item_ammo_crate_sheet.png — opaque=38520 nonblack-opaque=37602 bytes=3010 cells-opaque=[4320, 5292, 4356, 5292, 4320, 5292, 4356, 5292]
- [PASS] (Major) sheet geometry item_data_chip_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content item_data_chip_sheet.png — opaque=18621 nonblack-opaque=16749 bytes=3472 cells-opaque=[2340, 2358, 2124, 2403, 2376, 2421, 2214, 2385]
- [PASS] (Major) sheet geometry item_food_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content item_food_sheet.png — opaque=23508 nonblack-opaque=23418 bytes=3001 cells-opaque=[2718, 3195, 2646, 3195, 2718, 3195, 2646, 3195]
- [PASS] (Major) sheet geometry item_toolkit_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content item_toolkit_sheet.png — opaque=35370 nonblack-opaque=34119 bytes=3347 cells-opaque=[4122, 4797, 3951, 4815, 4122, 4815, 3951, 4797]
- [PASS] (Major) sheet geometry loot_crate_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content loot_crate_sheet.png — opaque=4772 nonblack-opaque=4759 bytes=17104 cells-opaque=[4772, 0, 0, 0, 0, 0, 0, 0]
- [PASS] (Major) sheet geometry loot_crystal_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content loot_crystal_sheet.png — opaque=1875 nonblack-opaque=1865 bytes=8122 cells-opaque=[1875, 0, 0, 0, 0, 0, 0, 0]
- [PASS] (Major) sheet geometry loot_gear_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content loot_gear_sheet.png — opaque=4974 nonblack-opaque=4715 bytes=21282 cells-opaque=[4974, 0, 0, 0, 0, 0, 0, 0]
- [PASS] (Major) sheet geometry loot_key_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content loot_key_sheet.png — opaque=1673 nonblack-opaque=1510 bytes=5600 cells-opaque=[1673, 0, 0, 0, 0, 0, 0, 0]
- [PASS] (Major) sheet geometry mech_bomber_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_bomber_sheet.png — opaque=11898 nonblack-opaque=10125 bytes=4724 cells-opaque=[1584, 1548, 1269, 1575, 1530, 1575, 1269, 1548]
- [PASS] (Major) sheet geometry mech_boss_attack_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_boss_attack_sheet.png — opaque=21204 nonblack-opaque=19341 bytes=6168 cells-opaque=[2961, 2691, 2025, 2907, 2889, 2655, 2070, 3006]
- [PASS] (Major) sheet geometry mech_boss_damaged_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_boss_damaged_sheet.png — opaque=20421 nonblack-opaque=17496 bytes=5421 cells-opaque=[2781, 2718, 1782, 2826, 2862, 2844, 1863, 2745]
- [PASS] (Major) sheet geometry mech_boss_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_boss_sheet.png — opaque=20592 nonblack-opaque=18540 bytes=5835 cells-opaque=[2808, 2736, 1854, 2862, 2880, 2862, 1854, 2736]
- [PASS] (Major) sheet geometry mech_boss_walk_a_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_boss_walk_a_sheet.png — opaque=21123 nonblack-opaque=19143 bytes=5832 cells-opaque=[2844, 2709, 2106, 2853, 2952, 2754, 2115, 2790]
- [PASS] (Major) sheet geometry mech_boss_walk_b_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_boss_walk_b_sheet.png — opaque=20097 nonblack-opaque=18126 bytes=5905 cells-opaque=[2754, 2673, 1854, 2799, 2826, 2772, 1773, 2646]
- [PASS] (Major) sheet geometry mech_flyer_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_flyer_sheet.png — opaque=23121 nonblack-opaque=20835 bytes=5075 cells-opaque=[3240, 3249, 2466, 2808, 2826, 2817, 2466, 3249]
- [PASS] (Major) sheet geometry mech_heavy_brute_attack_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_heavy_brute_attack_sheet.png — opaque=14625 nonblack-opaque=12942 bytes=5009 cells-opaque=[1944, 1944, 1539, 1854, 1863, 1926, 1629, 1926]
- [PASS] (Major) sheet geometry mech_heavy_brute_damaged_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_heavy_brute_damaged_sheet.png — opaque=14004 nonblack-opaque=11457 bytes=4531 cells-opaque=[1944, 1818, 1314, 1881, 1872, 1899, 1386, 1890]
- [PASS] (Major) sheet geometry mech_heavy_brute_destroyed_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_heavy_brute_destroyed_sheet.png — opaque=8541 nonblack-opaque=7353 bytes=3949 cells-opaque=[1071, 1053, 1017, 1134, 1116, 1089, 981, 1080]
- [PASS] (Major) sheet geometry mech_heavy_brute_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_heavy_brute_sheet.png — opaque=13932 nonblack-opaque=12357 bytes=4864 cells-opaque=[1944, 1854, 1368, 1845, 1854, 1845, 1368, 1854]
- [PASS] (Major) sheet geometry mech_heavy_brute_walk_a_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_heavy_brute_walk_a_sheet.png — opaque=14319 nonblack-opaque=12546 bytes=5028 cells-opaque=[1926, 1926, 1539, 1809, 1827, 1917, 1575, 1800]
- [PASS] (Major) sheet geometry mech_heavy_brute_walk_b_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_heavy_brute_walk_b_sheet.png — opaque=13554 nonblack-opaque=11970 bytes=4891 cells-opaque=[1890, 1836, 1368, 1809, 1800, 1773, 1287, 1791]
- [PASS] (Major) sheet geometry mech_light_scout_attack_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_light_scout_attack_sheet.png — opaque=10467 nonblack-opaque=9315 bytes=4965 cells-opaque=[1233, 1224, 1224, 1530, 1332, 1260, 1179, 1485]
- [PASS] (Major) sheet geometry mech_light_scout_damaged_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_light_scout_damaged_sheet.png — opaque=10080 nonblack-opaque=8082 bytes=4610 cells-opaque=[1341, 1278, 1116, 1368, 1269, 1269, 1071, 1368]
- [PASS] (Major) sheet geometry mech_light_scout_destroyed_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_light_scout_destroyed_sheet.png — opaque=8541 nonblack-opaque=7425 bytes=3946 cells-opaque=[1071, 1053, 1017, 1134, 1116, 1089, 981, 1080]
- [PASS] (Major) sheet geometry mech_light_scout_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_light_scout_sheet.png — opaque=9954 nonblack-opaque=8631 bytes=4671 cells-opaque=[1305, 1260, 1107, 1386, 1233, 1251, 1062, 1350]
- [PASS] (Major) sheet geometry mech_light_scout_walk_a_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_light_scout_walk_a_sheet.png — opaque=10449 nonblack-opaque=9171 bytes=4679 cells-opaque=[1260, 1395, 1251, 1341, 1296, 1368, 1215, 1323]
- [PASS] (Major) sheet geometry mech_light_scout_walk_b_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_light_scout_walk_b_sheet.png — opaque=9747 nonblack-opaque=8280 bytes=4712 cells-opaque=[1269, 1233, 1116, 1368, 1242, 1206, 1017, 1296]
- [PASS] (Major) sheet geometry mech_red_raider_attack_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_red_raider_attack_sheet.png — opaque=9405 nonblack-opaque=8433 bytes=4046 cells-opaque=[1062, 1098, 1098, 1404, 1188, 1161, 1080, 1314]
- [PASS] (Major) sheet geometry mech_red_raider_damaged_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_red_raider_damaged_sheet.png — opaque=9414 nonblack-opaque=7650 bytes=4085 cells-opaque=[1215, 1161, 990, 1296, 1179, 1233, 1017, 1323]
- [PASS] (Major) sheet geometry mech_red_raider_destroyed_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_red_raider_destroyed_sheet.png — opaque=8541 nonblack-opaque=7353 bytes=3949 cells-opaque=[1071, 1053, 1017, 1134, 1116, 1089, 981, 1080]
- [PASS] (Major) sheet geometry mech_red_raider_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_red_raider_sheet.png — opaque=8982 nonblack-opaque=7803 bytes=3878 cells-opaque=[1161, 1188, 900, 1242, 1152, 1197, 900, 1242]
- [PASS] (Major) sheet geometry mech_red_raider_walk_a_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_red_raider_walk_a_sheet.png — opaque=9288 nonblack-opaque=8091 bytes=4024 cells-opaque=[1062, 1251, 1044, 1197, 1179, 1305, 1080, 1170]
- [PASS] (Major) sheet geometry mech_red_raider_walk_b_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_red_raider_walk_b_sheet.png — opaque=8694 nonblack-opaque=7650 bytes=3964 cells-opaque=[1116, 1170, 900, 1224, 1116, 1134, 837, 1197]
- [PASS] (Major) sheet geometry mech_shielder_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_shielder_sheet.png — opaque=16704 nonblack-opaque=15129 bytes=5430 cells-opaque=[2223, 2232, 1746, 2250, 2367, 2223, 1521, 2142]
- [PASS] (Major) sheet geometry mech_small_drone_attack_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_small_drone_attack_sheet.png — opaque=16200 nonblack-opaque=14904 bytes=4635 cells-opaque=[2142, 2277, 1890, 1908, 1908, 1908, 1890, 2277]
- [PASS] (Major) sheet geometry mech_small_drone_damaged_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_small_drone_damaged_sheet.png — opaque=14742 nonblack-opaque=12051 bytes=4397 cells-opaque=[1908, 1998, 1674, 1827, 1836, 1827, 1674, 1998]
- [PASS] (Major) sheet geometry mech_small_drone_destroyed_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_small_drone_destroyed_sheet.png — opaque=8541 nonblack-opaque=7353 bytes=3949 cells-opaque=[1071, 1053, 1017, 1134, 1116, 1089, 981, 1080]
- [PASS] (Major) sheet geometry mech_small_drone_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_small_drone_sheet.png — opaque=14616 nonblack-opaque=13167 bytes=4273 cells-opaque=[1908, 1989, 1620, 1827, 1836, 1827, 1620, 1989]
- [PASS] (Major) sheet geometry mech_small_drone_walk_a_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_small_drone_walk_a_sheet.png — opaque=14616 nonblack-opaque=13167 bytes=4273 cells-opaque=[1908, 1989, 1620, 1827, 1836, 1827, 1620, 1989]
- [PASS] (Major) sheet geometry mech_small_drone_walk_b_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_small_drone_walk_b_sheet.png — opaque=14616 nonblack-opaque=13167 bytes=4273 cells-opaque=[1908, 1989, 1620, 1827, 1836, 1827, 1620, 1989]
- [PASS] (Major) sheet geometry mech_sniper_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_sniper_sheet.png — opaque=10143 nonblack-opaque=8829 bytes=4671 cells-opaque=[1170, 1224, 1269, 1440, 1260, 1206, 1179, 1395]
- [PASS] (Major) sheet geometry mech_turret_light_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content mech_turret_light_sheet.png — opaque=10359 nonblack-opaque=9396 bytes=4626 cells-opaque=[1206, 1260, 1314, 1395, 1251, 1350, 1305, 1278]
- [PASS] (Major) sheet geometry prop_component_gears_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content prop_component_gears_sheet.png — opaque=4245 nonblack-opaque=3986 bytes=20195 cells-opaque=[4245, 0, 0, 0, 0, 0, 0, 0]
- [PASS] (Major) sheet geometry prop_health_cell_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content prop_health_cell_sheet.png — opaque=20466 nonblack-opaque=19179 bytes=3062 cells-opaque=[2160, 2817, 2385, 2871, 2160, 2871, 2385, 2817]
- [PASS] (Major) sheet geometry prop_salvage_pile_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content prop_salvage_pile_sheet.png — opaque=3429 nonblack-opaque=3371 bytes=16706 cells-opaque=[3429, 0, 0, 0, 0, 0, 0, 0]
- [PASS] (Major) sheet geometry prop_salvage_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content prop_salvage_sheet.png — opaque=26928 nonblack-opaque=22464 bytes=4916 cells-opaque=[3258, 3663, 3168, 3474, 3078, 3501, 3186, 3600]
- [PASS] (Major) sheet geometry tile_barrel_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content tile_barrel_sheet.png — opaque=17568 nonblack-opaque=16596 bytes=3012 cells-opaque=[2106, 2286, 2106, 2286, 2106, 2286, 2106, 2286]
- [PASS] (Major) sheet geometry tile_chest_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content tile_chest_sheet.png — opaque=19080 nonblack-opaque=18369 bytes=2968 cells-opaque=[2250, 2520, 2250, 2520, 2250, 2520, 2250, 2520]
- [PASS] (Major) sheet geometry tile_debris_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content tile_debris_sheet.png — opaque=16929 nonblack-opaque=16164 bytes=3821 cells-opaque=[2106, 2160, 2106, 2133, 2070, 2124, 2097, 2133]
- [PASS] (Major) sheet geometry tile_door_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content tile_door_sheet.png — opaque=24120 nonblack-opaque=23085 bytes=3282 cells-opaque=[2934, 3159, 2808, 3159, 2934, 3159, 2808, 3159]
- [PASS] (Major) sheet geometry tile_grate_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content tile_grate_sheet.png — opaque=16776 nonblack-opaque=15552 bytes=2988 cells-opaque=[2070, 2124, 2070, 2124, 2070, 2124, 2070, 2124]
- [PASS] (Major) sheet geometry tile_metal_wall_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content tile_metal_wall_sheet.png — opaque=27108 nonblack-opaque=25830 bytes=3035 cells-opaque=[3186, 3582, 3204, 3582, 3186, 3582, 3204, 3582]
- [PASS] (Major) sheet geometry tile_spike_trap_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content tile_spike_trap_sheet.png — opaque=18450 nonblack-opaque=17946 bytes=4853 cells-opaque=[2178, 2466, 2178, 2430, 2178, 2412, 2178, 2430]
- [PASS] (Major) sheet geometry tile_stairs_down_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content tile_stairs_down_sheet.png — opaque=17910 nonblack-opaque=17253 bytes=4379 cells-opaque=[2304, 2484, 2097, 2268, 1908, 2268, 2097, 2484]
- [PASS] (Major) sheet geometry tile_stone_wall_sheet.png — size=822x136 (expected 822x136)
- [PASS] (Major) sheet has painted content tile_stone_wall_sheet.png — opaque=27126 nonblack-opaque=25668 bytes=3114 cells-opaque=[3186, 3582, 3204, 3582, 3186, 3582, 3222, 3582]
- [PASS] (Major) tile asset vision_floor_circuit.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content vision_floor_circuit.png — opaque=65536 nonblack-opaque=64974 bytes=56808
- [PASS] (Major) tile asset vision_floor_plain.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content vision_floor_plain.png — opaque=65536 nonblack-opaque=65536 bytes=21082
- [PASS] (Major) tile asset vision_wall_right.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content vision_wall_right.png — opaque=65536 nonblack-opaque=63888 bytes=82351
- [PASS] (Major) tile asset vision_wall_top.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content vision_wall_top.png — opaque=65536 nonblack-opaque=60681 bytes=91369
- [PASS] (Major) tile asset vision_wall_top2.png — tile size=256x256 (not an 8-direction sheet)
- [PASS] (Major) tile has painted content vision_wall_top2.png — opaque=65536 nonblack-opaque=64894 bytes=49255
- [PASS] (Blocker) zero console errors on load — errors: none
- [PASS] (Blocker) canvas renders sprite colour, not a blank screen — screenshot=/home/hatch/workspace/scrap-dungeon/beta-testers/reports/screenshots/graphics-load.png distinct-colours=70166 bright-samples=29343/72000
- [PASS] (Major) walk pose changes on movement — pose before=rest on move=walk_b after 600ms=rest player (6,13) -> (7,13)
- [PASS] (Minor) pose returns to rest after movement — pose after 600ms=rest (expected rest)

## casual (4 PASS / 0 FAIL)

- [PASS] (Blocker) casual play ends with sane numbers — hp=100 carried=0 banked=0
- [PASS] (Blocker) casual play never softlocked (state stayed playable) — final state=playing hp=100 clock=630
- [NOTE] (Minor) wall bumps give no feedback — 20 move attempts changed nothing at all (position and clock both identical) — a human notices a wall bump produces no log line, no sound, no shake. See game.js doMove blocked path (returns blocked without logging).
- [PASS] (Minor) bumping a wall does not move or corrupt state — moved=True before=(53, 21) after=(53,20) sane: hp=100 carried=0 banked=0
- [PASS] (Blocker) no uncaught console/page errors during casual — none

## completionist (6 PASS / 0 FAIL)

- [PASS] (Major) a pickup can be walked to and collected — attempt 1: target {'kind': 'salvage', 'x': 37, 'y': 39} path=24 pickups 13 -> 11 inventory (0, 0, 0, 0, 0, 0) -> (13, 1, 0, 2, 0, 0) pos=(37,38) state=playing
- [PASS] (Major) an enemy can be fought and killed — kills=2 hp=69 state=playing
- [PASS] (Blocker) Descend banks exactly 25% (floored) — carried was 13, banked 0 -> 3 (expected 3), depth=2
- [PASS] (Blocker) Extract keeps all carried salvage in banked total — carried was 10, banked 3 -> 13, state=extracted
- [PASS] (Blocker) completionist run ends with sane numbers — hp=69 carried=0 banked=13
- [PASS] (Blocker) no uncaught console/page errors during completionist — none

## bug-hunter (10 PASS / 0 FAIL)

- [PASS] (Blocker) 60 rapid move-key taps do not corrupt state — hp=100 carried=0 banked=0
- [PASS] (Major) clicking dock buttons while Bag modal is open is safe — modal was open=True, dock clicks blocked by overlay=3/3, still sane: hp=100 carried=0 banked=0
- [PASS] (Major) 30x Wait + Rest spam keeps sane state — died during spam=False recovered state=playing hp=100 carried=0 banked=0
- [PASS] (Minor) using an unheld item (or at full HP) gives feedback and costs nothing — used repair kit: hp 100 -> 100, cells (0, 0) -> (0, 0), log tail: ['You wait.', 'You wait.', 'You wait.', 'You wait.', 'Repair kit: no repair kits.']
- [PASS] (Minor) out-of-bounds canvas taps are harmless — hp=100 carried=0 banked=0
- [PASS] (Major) autosave wrote hub + run keys to localStorage — keys=['scrapdungeon.run.v1', 'scrapdungeon.hub.v1'] state=playing depth=1 hp=100 (run key expected=True)
- [PASS] (Major) reload shows the hub screen with a Continue option — modal visible=True buttons=[New Expedition | Continue] text=HUB — saved expedition found | Resumable run: depth 1, HP 100/100, carried 0Banked salvage: 0Stockpiled components: 0Materials: 0 wire, 0 thermal cores, 0 shock
- [PASS] (Blocker) Continue resumes the saved run — before reload hp=100 depth=1 clock=330 -> after Continue hp=100 depth=1 clock=330 state=playing
- [PASS] (Major) second reload mid-run yields a playable game — state after reload=playing hp=100
- [PASS] (Blocker) no uncaught console/page errors during bug-hunter — none

## mobile (20 PASS / 0 FAIL)

- [PASS] (Major) tap target >= ~44px: Wait — Wait: 48x48px
- [PASS] (Major) tap target >= ~44px: Use item — Use item: 48x48px
- [PASS] (Major) tap target >= ~44px: Menu — Menu: 48x48px
- [PASS] (Major) tap target >= ~44px: Search — Search: 48x48px
- [PASS] (Major) tap target >= ~44px: Bag — Bag: 48x48px
- [PASS] (Major) tap target >= ~44px: Recenter — Recenter: 44x44px
- [PASS] (Major) tap target >= ~44px: Log — Log: 44x44px
- [PASS] (Major) tap target >= ~44px: FIRE — FIRE: 48x48px
- [PASS] (Major) tap target >= ~44px: +HP slot — +HP slot: 48x48px
- [PASS] (Major) tap target >= ~44px: FOOD slot — FOOD slot: 48x48px
- [PASS] (Major) tap target >= ~44px: KIT slot — KIT slot: 48x48px
- [PASS] (Major) no horizontal overflow at 390px — scrollWidth=390 clientWidth=390
- [PASS] (Major) HUD fits on one line at 390px (all segments incl. Power visible) — hud scrollWidth=378 clientWidth=378 powerRight=373 hudRight=384 power='OK'
- [PASS] (Minor) latest log line shows as a transient overlay on phones — transient={'text': 'You wait.', 'shown': True} last log line='You wait.'
- [PASS] (Minor) Log button opens the full log as a modal — modal visible=True title='Log'
- [PASS] (Minor) Log modal closes back to play — modal visible after Close=False
- [PASS] (Minor) viewport meta disables double-tap zoom breakage — viewport meta: width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover
- [PASS] (Major) bottom dock is on screen at phone size — dock box={'x': 0, 'y': 679, 'width': 390, 'height': 165} viewport={'width': 390, 'height': 844}
- [PASS] (Major) touch tap on an adjacent tile moves or attacks — tap direction (0, -1): player (18,36) -> (18,35) clock 10 -> 20
- [PASS] (Blocker) no uncaught console/page errors during mobile — none

## graphics-qc — action log (first 60)

- 157 PNGs in game/assets/, 169 referenced in game.js

## graphics-qc — action log (first 60)

- loaded file:///home/hatch/workspace/scrap-dungeon/game/index.html

## casual — action log (first 60)

- start hp=100 at (54,19) depth=1
- rest -> hp=100 clock=0
- move (0,-1) -> (54,18) hp=100
- move (0,-1) -> (54,17) hp=100
- search -> clock=30
- move (1,-1) -> (54,17) hp=100
- move (0,-1) -> (54,17) hp=100
- rest -> hp=100 clock=30
- move (1,1) -> (55,18) hp=100
- wait -> clock=50
- move (-1,0) -> (54,18) hp=100
- search -> clock=70
- opened Log modal
- move (1,0) -> (55,18) hp=100
- move (1,1) -> (56,19) hp=100
- move (0,1) -> (56,20) hp=100
- move (0,-1) -> (56,19) hp=100
- move (0,1) -> (56,20) hp=100
- wait -> clock=130
- move (1,-1) -> (56,20) hp=100
- move (1,0) -> (56,20) hp=100
- move (0,-1) -> (56,19) hp=100
- rest -> hp=100 clock=140
- move (1,-1) -> (56,19) hp=100
- move (1,1) -> (56,19) hp=100
- search -> clock=150
- move (0,1) -> (56,20) hp=100
- wait -> clock=170
- move (1,0) -> (56,20) hp=100
- move (1,-1) -> (56,20) hp=100
- opened Bag
- rest -> hp=100 clock=170
- move (-1,-1) -> (55,19) hp=100
- move (-1,1) -> (54,20) hp=100
- move (0,-1) -> (54,19) hp=100
- move (-1,0) -> (53,19) hp=100
- move (-1,0) -> (52,19) hp=100
- opened Bag
- move (-1,1) -> (51,20) hp=100
- opened Bag
- move (1,1) -> (52,21) hp=100
- move (1,1) -> (52,21) hp=100
- wrench health cell -> hp=100 health=0
- wait -> clock=250
- move (1,1) -> (52,21) hp=100
- move (0,1) -> (52,21) hp=100
- opened Bag
- move (0,1) -> (52,21) hp=100
- rest -> hp=100 clock=250
- move (1,1) -> (52,21) hp=100
- move (-1,-1) -> (51,20) hp=100
- wait -> clock=270
- move (-1,0) -> (51,20) hp=100
- wait -> clock=280
- rest -> hp=100 clock=280
- rest -> hp=100 clock=280
- opened Log modal
- rest -> hp=100 clock=280
- move (1,1) -> (52,21) hp=100
- opened Bag

## completionist — action log (first 60)

- start depth=1 hp=100 at (34,10)
- step (0,1) -> (34,11) hp=100 state=playing
- step (0,1) -> (34,12) hp=100 state=playing
- step (0,1) -> (34,12) hp=100 state=playing
- step (0,1) -> (34,13) hp=100 state=playing
- step (0,1) -> (34,13) hp=100 state=playing
- step (0,1) -> (34,14) hp=100 state=playing
- step (0,1) -> (34,15) hp=93 state=playing
- stopped: enemy adjacent Raider at (34,16)
- attempt 0: target {'kind': 'salvage', 'x': 37, 'y': 39} path=29 pickups 12 -> 12 inventory (0, 0, 0, 0, 0, 0) -> (0, 0, 0, 0, 0, 0) pos=(34,15) state=playing
- attack Raider -> hp=85 state=playing
- attack Raider -> hp=85 state=playing
- attack Raider -> hp=78 state=playing
- attack Raider -> hp=69 state=playing
- attack Raider -> hp=69 state=playing
- attack Raider -> hp=69 state=playing
- step (0,1) -> (34,16) hp=69 state=playing
- step (0,1) -> (34,17) hp=69 state=playing
- step (0,1) -> (34,18) hp=69 state=playing
- step (0,1) -> (34,18) hp=69 state=playing
- step (0,1) -> (34,19) hp=69 state=playing
- step (0,1) -> (34,20) hp=69 state=playing
- step (0,1) -> (34,21) hp=69 state=playing
- step (0,1) -> (34,22) hp=69 state=playing
- step (0,1) -> (34,23) hp=69 state=playing
- step (0,1) -> (34,24) hp=69 state=playing
- step (0,1) -> (34,25) hp=69 state=playing
- step (0,1) -> (34,26) hp=69 state=playing
- step (0,1) -> (34,27) hp=69 state=playing
- step (0,1) -> (34,28) hp=69 state=playing
- step (0,1) -> (34,29) hp=69 state=playing
- step (0,1) -> (34,30) hp=69 state=playing
- step (0,1) -> (34,31) hp=69 state=playing
- step (0,1) -> (34,32) hp=69 state=playing
- step (0,1) -> (34,33) hp=69 state=playing
- step (0,1) -> (34,34) hp=69 state=playing
- step (0,1) -> (34,35) hp=69 state=playing
- step (1,1) -> (35,36) hp=69 state=playing
- step (1,1) -> (36,37) hp=69 state=playing
- step (1,1) -> (37,38) hp=69 state=playing
- attempt 1: target {'kind': 'salvage', 'x': 37, 'y': 39} path=24 pickups 13 -> 11 inventory (0, 0, 0, 0, 0, 0) -> (13, 1, 0, 2, 0, 0) pos=(37,38) state=playing
- collected salvage at (37,39)
- step (-1,0) -> (36,38) hp=69 state=playing
- step (-1,0) -> (35,38) hp=69 state=playing
- step (-1,0) -> (35,38) hp=69 state=playing
- step (-1,0) -> (34,38) hp=69 state=playing
- step (-1,0) -> (33,38) hp=69 state=playing
- step (-1,0) -> (32,38) hp=69 state=playing
- step (-1,0) -> (32,38) hp=69 state=playing
- step (-1,0) -> (31,38) hp=69 state=playing
- step (-1,0) -> (30,38) hp=69 state=playing
- step (-1,0) -> (29,38) hp=69 state=playing
- step (-1,0) -> (28,38) hp=69 state=stairs
- stairs panel: Depth 1 -> 2 | Carried 13 | Descending banks 3 | ‹ BANK 25% & DESCEND › | ‹ EXTRACT (KEEP ALL) › | Cancel
- step (-1,0) -> (46,14) hp=69 state=playing
- step (-1,0) -> (45,14) hp=69 state=playing
- step (-1,0) -> (44,14) hp=69 state=playing
- step (-1,0) -> (43,14) hp=69 state=playing
- step (-1,0) -> (43,14) hp=69 state=playing
- step (-1,0) -> (42,14) hp=69 state=playing

## bug-hunter — action log (first 60)

- start hp=100 clock=0

## mobile — action log (first 60)

- mobile screenshot: /home/hatch/workspace/scrap-dungeon/beta-testers/reports/screenshots/mobile.png
