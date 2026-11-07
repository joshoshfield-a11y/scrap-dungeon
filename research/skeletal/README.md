# Skeletal animation for SCRAP DUNGEON — research (separate from the main build)

## The alternative, in one paragraph

PixelAOI has no pose/keyframe tool, but it renders a model identically
regardless of box colours. So the scout is rendered once per body part
(torso, head, armL, armR, legL, legR) with every other part recoloured
pure black. Keying out exact black leaves precisely the pixels that part
contributes to the full render, and the parts' pixel sets are disjoint
(each screen pixel belongs to exactly one front-most part). Stacking the
part sprites with no transform reproduces the original sprite
**pixel-for-pixel in all 8 directions** (verified: 0 differing opaque
pixels, after the two fixes below). Rotating each part sprite about its
joint pivot — derived per direction as the part pixel closest to the
torso mask — gives real skeletal animation: bones, pivots, interpolated
keyframes. This is the Spine-style 2D rig technique, built from the
existing voxel art, and it runs in the game's plain Canvas 2D with no
new engine.

## Proof

- `rig.json` — parts, parents, per-direction pivots, per-direction pixel counts.
- `parts/<group>/<DIR>.png` — keyed part sprites (colours taken from the
  full render at mask positions, see fix 2).
- `test_renders/` — rest (must equal full render), walk S/E, attack S,
  damaged S. All read correctly; limbs stay attached at hips/shoulders.
- `demo.html` — self-contained demo (rig + sprites inlined): 8 direction
  buttons, idle / walk / attack / damaged states, play/pause, scrub
  slider, smoothstep-interpolated keyframes, nested canvas transforms
  (children inherit torso bob/lean).

## Two fixes that made rest-pose equality exact

1. **Key on exact black, not near-black.** A `<20` threshold ate
   deep-shadow part faces (e.g. shaded DK down to (14,15,17)). Black
   boxes shade to exactly (0,0,0) (0 x anything = 0), so exact-zero
   keying separates cleanly.
2. **Colours from the full render, not the variants.** The visor glow
   lights neighbouring faces in the full render but not in glow-less
   variants, leaving 36 slightly dark chest pixels. Attribution is by
   position (identical framing), so part sprites carry full-render
   colours and the rest pose matches exactly.
3. **Residual attribution (9 px, W only).** One 3x3 near-black block at
   an arm/torso seam appears in the full render but in no variant
   (renderer tie-break at coincident faces; renderer verified
   deterministic, so it is not noise). Each residual pixel is assigned
   to its nearest part mask. An interior-CY-voxel glow test did NOT
   restore them, which ruled out the glow-light theory.

## Known limits (honest)

- A part fully occluded in a direction (far leg in side views: legL in
  W, legR in E) has an empty sprite there; its pivot falls back to the
  torso centroid and nothing draws. Correct behaviour, not a bug.
- Rotating a flat part sprite is a 2D rotation: small angles (walk
  +/-22 deg, attack 55 deg) read well; extreme angles would reveal
  flatness. Keep pose angles modest.
- Per-direction pose tuning is still content work: the demo uses one
  angle set for all directions. A strike reads best in side views.
- Fully occluded parts can't be recovered from the sheet alone; a
  walk swing that should reveal the far leg will show it only where
  the render already had it. Acceptable at 32px.

## Route B (not built): true 3D skeletal in Blender

Blender 4.2.3 is installed. Convert the voxel boxes to a mesh (one cube
per voxel, or merged per part), assign each cube to a bone by part,
weight 1.0, build a bone chain (hips -> legs, spine -> arms/head),
animate bone rotations, render the same 8 directions to sheets. Real
3D deformation, no flatness limit — but it needs a mesh-conversion +
rigging pass per model and re-rendered sheets, and it does not run in
the Canvas 2D engine without that re-render step. The 2D rig above
ships in the existing engine as-is, so it is the recommended route.

## Rigging another model

Same `build_rig.py`, with the MODELS entry and the `group_of` map
changed for that model's part names. The script is resumable: if
`parts/` and `frames/` are complete on disk it skips renders.

## All 5 combatants rigged (2026-10-26 ~08:21 PDT)

`build_rig_all.py` generalizes the scout builder to raider, brute,
drone, and boss (per-model group maps, glow lists, and root; flat FK,
all children of the root). Rigs live under `rigs/<model>/`
(`frames/`, `parts/`, `rig.json`); the scout rig stays at the top
level untouched. Combined demo: `demo_all.html` (243,133 B,
self-contained); test poses: `test_poses_all.py`; QC grid:
`test_qc_all.png`.

**Verification: all 4 new rigs exact — 0 differing opaque pixels in
all 8 directions each (32 direction checks).** Residual attribution:
raider 9 px (SW, W), brute 18 px (S) + 9 px (W, E), boss 9 px (SW, W,
E, SE), drone none. Group maps: raider Blade split by x; brute
Fist/Claw into arms, Spike into torso; drone Arm split by x, rotor
pivot = centroid; boss Pauldron/Spike into torso, Fist into arms.

QC: all 5 rows read correctly in the grid (walk E is the clearest
read; raider blade slash, brute lumbering walk, boss side profile,
drone hover/attack spin). One fix made: drone damaged must tilt as
a rigid body — the demo already did (children nest inside the body
transform), the PIL test did not, so the test now rotates the whole
rest composite about the body pivot. Drone hover in the demo is a
true rigid bob (root translate moves all groups).

Still not rigged: tank_defender, heavy_assault, artillery,
spider_walker (the unlock chassis — tracks/cannon/6-leg body plans,
a different group-map pass each).

## All 14 rigged (2026-10-26 ~08:40 PDT) — rig-all pass 2

`build_rig_all2.py` rigs the remaining 9 articulated characters, on
the user's word "do it for all that would need it": the 4 unlock
chassis (tank, assault, artillery, spider) plus the 5 batch-2
enemies (turret, flyer, shielder, sniper, bomber). Shielder/bomber
are taken from the FIXED batch-2 models (cyan emblem, widened bay),
not the originals, so rest pose matches the shipped sheets. New in
this pass: shape kinds are preserved — turret Dome and bomber Bombs
are `ball` shapes, rebuilt as balls, not boxes. Test poses:
`test_poses_all2.py`; QC grid: `test_qc_all2.png`; combined demo for
all 14: `demo_all14.html` (630,617 B, self-contained, model switcher).

**Verification: all 9 new rigs exact — 0 differing opaque pixels in
all 8 directions each (72 direction checks).** Residual attribution:
assault 9 px (W) + 27 px (E), artillery 18 px (S) + 9 px (W, NW, NE,
E), turret 9 px (SW, N, SE), flyer 18 px (SW, SE), shielder 36 px
(S) + 18 px (E); tank, spider, sniper none. Group maps: assault
Shield -> armL, Gun -> armR; artillery Breech+Cannon -> separate
cannon group (aims up on attack); tank Hull root, Turret+Gun,
Tracks split, turret pivot = centroid; spider Body root, 6 legs
(side x front/mid/back); turret Base root, Dome (centroid pivot),
Barrel — scan rotates dome+barrel together so they stay aligned;
flyer Hull root, Rotor (centroid, tilts only — a flat plate rotated
in-plane is a tilt, not a spin), Gun; shielder Shield+Emblem as its
own group, Arm R only; sniper Rifle/Stock/Scope -> armR, Pack ->
torso; bomber Body root, Bomb/Fuse split by side into arms.

QC by eye, no fix pass needed: all 9 rows read (assault walk,
artillery side-profile twin barrels, tank turret scan, spider
alternating 6-leg walk, turret scan/attack, flyer hover/bank,
shielder shield swing — verified at full scale in E, where the
shield face is the model's own rendering, not a rig detachment —
sniper rifle slash, bomber bomb swing). Damaged for tank/turret/
flyer tilts as a rigid body, as with the drone.

What a rig is NOT: structures, tiles, props, items, FX, and weapons
are not articulated characters and were deliberately not rigged —
their animation is FX (explosion/debris/impact) or a static sprite.
That is the full "all that would need it" set: 14 articulated
characters, no more, no less.

## App-state lessons (earned the hard way this session)

- One Drive client per app launch for production runs. A throwaway
  probe client that clean-closes a doc can leave the next client
  failing with "No sprite is open" — recovery is a fresh app launch,
  then the real run as first client. (Closing a FAILED doc poisons
  later new_model calls; that rule still stands.)
- Never kill the app by grepping full command lines from a shell whose
  own command line contains the pattern — it kills your own shell.
  Kill by exact process name: `pgrep -x pixelaoi`.
- `model_colour` glow fails when the model contains no voxel of that
  colour — guard the call per variant (torso/legs have no CY).
- `close_document` after a render requires a `save_document` first
  ("unsaved changes"), or it errors.
