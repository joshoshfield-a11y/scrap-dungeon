#!/usr/bin/env python3
"""Wire Batch 3 single-cell slices into game/assets/ (2026-10-27).

Single-cell scope only, per the user's pick. Wide-cell pieces
(doors, wall_corner_L, stairs_down, ladder_platform, hazard strips,
wide consoles/servers, monitors, pipe/cable runs, lights/lamps,
exit sign, hazard-marked floors) are NOT copied here.

- Full-bleed 256x256 tiles: copied byte-for-byte from staging.
- Keyed props: the staging `-512` centred copies, resized to
  256x256 LANCZOS (the batch-2 plain-tile convention) and saved
  under the base name (suffix dropped: the file is no longer
  512px). Staging originals are untouched. Resize only: no
  re-crop, no re-key, no content change.
- The ammo-crate sheet (sprites/items/, built for this game)
  is copied byte-for-byte for the ammo pickup sprite.

Re-runnable and idempotent: overwrites the same outputs.
Verifies every output opens as a PNG with the expected size.
"""
import os
import shutil
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SLICED = os.path.join(HERE, "sliced")
ASSETS = os.path.join(HERE, "..", "..", "game", "assets")
AMMO_SRC = os.path.join(
    HERE, "..", "..", "sprites", "items", "item_ammo_crate_sheet.png")

TILES = [
    # sheet 2 floors
    "batch3_s2_floor_rusty_a", "batch3_s2_floor_rusty_b",
    "batch3_s2_floor_cracked_a", "batch3_s2_floor_cracked_b",
    "batch3_s2_floor_mesh", "batch3_s2_floor_diamond",
    "batch3_s2_floor_tiles_grey",
    "batch3_s2_floor_circuit_a", "batch3_s2_floor_circuit_b",
    "batch3_s2_floor_circuit_c",
    "batch3_s2_floor_sludge",
    # sheet 2 walls / vents
    "batch3_s2_wall_panel_a", "batch3_s2_wall_panel_b",
    "batch3_s2_wall_panel_c", "batch3_s2_wall_panel_console",
    "batch3_s2_wall_corner_a", "batch3_s2_wall_corner_b",
    "batch3_s2_wall_pipe_a", "batch3_s2_wall_pipe_b",
    "batch3_s2_wall_pipe_c",
    "batch3_s2_wall_door_closed_a", "batch3_s2_wall_door_closed_b",
    "batch3_s2_wall_door_open_a", "batch3_s2_wall_door_open_b",
    "batch3_s2_wall_door_open_c",
    "batch3_s2_wall_hole_cracked", "batch3_s2_wall_hole_wires",
    "batch3_s2_vent_slats", "batch3_s2_vent_grid",
    "batch3_s2_vent_grid_hole", "batch3_s2_vent_hole_square",
    # sheet 1 floors / grates
    "batch3_s1_floor_grey_a", "batch3_s1_floor_grey_b",
    "batch3_s1_floor_grey_c",
    "batch3_s1_floor_grate_round", "batch3_s1_floor_grate_green",
    # sheet 1 walls (sparingly: cool blue-grey palette)
    "batch3_s1_panel_plain_a", "batch3_s1_panel_pipes_a",
    "batch3_s1_panel_console_a", "batch3_s1_panel_vent",
    "batch3_s1_vent_slats_a", "batch3_s1_vent_slats_b",
    "batch3_s1_vent_slats_c",
]

# Keyed props: staging `-512` names, without the suffix here.
PROPS = [
    "batch3_s1_console_single", "batch3_s1_console_single_mid",
    "batch3_s1_console_double", "batch3_s1_console_tall",
    "batch3_s1_console_tall_small",
    "batch3_s1_server_small", "batch3_s1_server_tall_a",
    "batch3_s1_server_tall_b", "batch3_s1_server_tall_c",
    "batch3_s1_prop_barrel_grey", "batch3_s1_prop_barrel_rust",
    "batch3_s1_prop_barrel_blue",
    "batch3_s1_prop_crate_skull_a", "batch3_s1_prop_crate_skull_b",
    "batch3_s1_toolbox_red", "batch3_s1_toolbox_grey",
    "batch3_s1_fire_extinguisher",
    "batch3_s1_debris_shells", "batch3_s1_debris_cans",
    "batch3_s2_console_term_a", "batch3_s2_console_term_b",
    "batch3_s2_console_term_green", "batch3_s2_console_term_blue",
    "batch3_s2_console_map",
    "batch3_s2_keypad_small_a", "batch3_s2_keypad_tall",
    "batch3_s2_scrap_pile_a", "batch3_s2_scrap_pile_wires",
    "batch3_s2_armour_broken", "batch3_s2_scrap_debris",
    "batch3_s2_crates_stack",
]


def main():
    os.makedirs(ASSETS, exist_ok=True)
    total = 0

    def verify(path, expect_size):
        with Image.open(path) as im:
            im.load()
            assert im.format == "PNG", f"{path}: not PNG"
            if expect_size is not None:
                assert im.size == expect_size, (
                    f"{path}: size {im.size}, expected {expect_size}")
        return os.path.getsize(path)

    for name in TILES:
        src = os.path.join(SLICED, name + ".png")
        dst = os.path.join(ASSETS, name + ".png")
        shutil.copyfile(src, dst)
        total += verify(dst, (256, 256))

    for name in PROPS:
        src = os.path.join(SLICED, name + "-512.png")
        dst = os.path.join(ASSETS, name + ".png")
        with Image.open(src) as im:
            assert im.size == (512, 512), f"{src}: {im.size}"
            im = im.convert("RGBA")
            im.resize((256, 256), Image.LANCZOS).save(dst)
        total += verify(dst, (256, 256))

    dst = os.path.join(ASSETS, "item_ammo_crate_sheet.png")
    shutil.copyfile(AMMO_SRC, dst)
    total += verify(dst, (822, 136))

    print(f"copied {len(TILES)} tiles + {len(PROPS)} props + ammo sheet "
          f"= {len(TILES) + len(PROPS) + 1} files, {total} bytes total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
