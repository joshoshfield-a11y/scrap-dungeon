# Batch 2 — NOTES (measured, 2026-10-26)

## Vision images
- Both 1024x1024 RGB. Vision-1 = base room; vision-2 = same room + loot layer.
- HUD bar: y 0–~68. Bottom icon bar: y ~900–1024. Stairs panel floats right, x ~640–990, y ~410–600 (vision-1).
- Map room spans roughly x 45–990, y 70–860, but the room shape is IRREGULAR (niches, not a rectangle).

## Measured grid (vision-1)
- Vertical grid lines (dark runs found by pixel scan, confirmed on overlay): x ≈ 69, 167, 265, 363, 461, 559, 657, 755, 853, 951 → pitch ≈ 98 px.
- Horizontal lines are LESS regular: candidate overlay (origin y=59, pitch 97) aligns well in the upper/middle room but drifts ~10 px in the lower rows.
- CONCLUSION: this is a Gemini-generated image, not a screenshot of a real grid game — grid lines drift. Exact cell slicing is impossible; crops below use the vertical lines + visual row bands, inset ~6 px inside lines, and are verified by eye on a contact sheet. Do NOT reuse the batch-1 failure mode of guessing bands blind (it landed on HUD/player): every crop here was checked against the overlay image /tmp/gridA.png and the crop sheet.
- Overlay check: vertical lines track tile edges closely (player cell, circuit-block columns). Horizontal drift is worst below y≈740.

## Crops (vision-1, before resize to 256x256)
- floor_plain: (369, 356, 455, 441) — empty brown floor cell, col 363–461, row 350–447. FIRST attempt (369,647,455,732) landed on a metal-plate loot item, not empty floor — caught on the contact sheet and re-cropped from the lowest-variance cell found by programmatic scan (score 9.6).
- floor_circuit: (271, 453, 357, 538) — one circuit-pattern cell, col 265–363, row 447–544.
- wall_top: (170, 80, 370, 280) — top junk band, left portion (pipes, plates, machinery).
- wall_top2: (570, 80, 770, 280) — top junk band, right portion.
- wall_right: (765, 260, 945, 440) — right junk niche machinery.
- DROPPED: wall_bottom first attempt (170,740,370,850) was plain floor, not junk — the true bottom band sits at y≈830–900 and is only ~70 px tall; a stretch of it read as floor, so it is NOT wired. wall_left first attempt (45,380,195,530) caught the red enemy mech, not a border — the vision's left border is a thin column, not a tile; replaced by wall_top2.
- Tiling note: these are crops of a generated image, not seamless tiles. They are wired as dominant variants mixed with the old sheet, not as a seamless field, so repeats read as variation rather than a wallpaper seam.

## Loot (generated, 4 calls, each single object on pure black, vision-2 as style reference)
- gear-and-wire bundle, gold key, metal crate with glowing blue lid, purple crystal.
- Keyed exactly as batch 1: border flood-fill through all-channels<50, ~1.5 px alpha falloff, trim to bbox, re-center with padding, full size + 512px LANCZOS copies (-512 suffix).

## Wiring intent (game.js only, rendering/art)
- Industrial: plain vision floor dominant (3/5 cells); circuit tile 1/5; batch-1 dense tile demoted to 1/5. Vision scrap walls dominant (5/6 cells across top/top2/right bands), old cyan-slit sheet demoted to 1/6 (reverse of batch 1's 1-in-3 ratio).
- Loot: new sprites reuse existing pickup slots (salvage/component/health/food) and extra art as floor dressing; no new item types, no behavior/size/highlight changes. BANK stays at real 25/40/55% — the vision's 50% is NOT copied.
- Dressing density caveat (verified): industrial 'debris' dressing varies deterministically into loot sprites, but dressing is sparse near spawn (spawn rooms get no dressing in core.js, untouched) — 8 fresh runs found no debris within 10 tiles of spawn. Loot dressing is proven in-game (walked 20 tiles to a debris cell; gear bundle rendered beside the player, see newart-batch2-loot.png), but it is NOT yet as dense as the vision's loot-covered floors. Raising dressing density needs a core.js change and is NOT done here.
