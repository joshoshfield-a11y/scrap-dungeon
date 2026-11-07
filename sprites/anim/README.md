# Animation states (frame-based, built 2026-10-26)

PixelAOI has no pose/keyframe tool in its MCP bridge, so animation is
one model per frame, each rendered to the usual 8-direction sheet.
Builder: `build_scrap_anim.py` (variants derived from the base box
lists by transform, so frames stay on-model).

Per actor, the game cycles:

- idle — the existing rest sheet (workflow mechs / batch-1 boss)
- walk_a — stride apart (bipeds) / bob up (drone)
- walk_b — passing step, foot raised (bipeds) / bob down (drone)
- attack — weapon extended, muzzle flash on gun mechs, beam on drone
- damaged — leaned 1 voxel, darkened palette, spikes dropped, visor dimmed
- destroyed — wreckage pile, dead ember, no glow

Actors covered: mech_light_scout, mech_red_raider, mech_heavy_brute,
mech_small_drone, mech_boss. QC grids: `qc_<actor>.png`.

Honest limit: walk_b and the drone bob are 1-voxel differences — they
read in alternation (A -> B -> A), not as standalone images. That is
inherent to 32px voxel frames.
