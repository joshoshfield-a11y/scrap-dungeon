# Batch 1 prompts (2026-10-26) — style reference: templates/refs/gameplay-vision-1.jpg, original art only, not a copy/trace
1. floor_dense_scrap: top-down pixel-art floor tile, rusty brown metal plates densely covered edge to edge with scrap, bolts, wires, circuit etchings, gears, shards. Full-bleed square.
2. wall_scrap_border: top-down pixel-art wall tile, thick scrap-metal barrier, riveted plates, pipes, welded junk. Full-bleed square. RESULT: MISSED — generator returned a whole multi-tile room scene instead of one tile; regenerate next round with a simplified prompt.
3. pile_scrap_loot: one heap of salvage loot on pure solid black background, single object, no text.
4. pile_gears_bolts: one cluster of rusty gears, cogs, bolts, washers on pure solid black background, single object, no text.

## v2 wall retry + slicing notes (2026-10-26, processing pass)
- wall_scrap_border v2: "single square wall tile matching the reference's scrap wall borders as closely as possible, one tile only, no floor tiles, no room" — RESULT: still a whole room scene. Generator will not emit one wall tile in isolation.
- AUTHORIZATION UPDATE (user, 2026-10-26 ~19:51 PDT): the vision images are his own Google Gemini generations, not trademarked. Close matching, cropping, and slicing them are allowed; the "similar, not copied" hold is lifted for these images.
- Wall solution: sliced the v2 room's top scrap band (room bbox x 161..1439, y 153..1444; band y 153..433) stretched to 256x256 -> assets/gen_wall_dense_scrap.png. Square crops from the bands mostly missed (bottom/left/right crops were mostly floor); the stretched top band reads as dense scrap wall. 3x3 tiled preview shows a visible repeat — variant use only, mixed with the sheet wall.
- Direct vision slicing tried: vision-1.jpg is full-bleed 1024x1024, top 14% band = HUD bar; bands y 150..300 / 180..330 landed on the player mech area, not a clean wall strip. Abandoned in favour of the v2 band.
- Keying: piles keyed by border flood-fill through pixels with all channels < 50 (corners pure black 0,0,0); GaussianBlur 1.5 alpha falloff; salvage bbox (192,341)-(1401,1269), gears bbox (371,398)-(1230,1234) at 1600px. Sheets 822x136 with the keyed sprite scaled to 96x96 at cell 0 (x=6, y=34).
