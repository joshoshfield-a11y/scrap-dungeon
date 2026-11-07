#!/usr/bin/env python3
"""Wire Batch 3 wide-cell art into game/assets/ (middle tier, 2026-10-28).

Copies the NATIVE-size staging slices byte-for-byte (no re-crop, no
re-key, no resize) into game/assets/wide/ under their staging
basenames: the wide-cell renderer draws them aspect-preserving
from their native dimensions, so the -512 square copies must NOT be
used here, and the single-cell 256x256 square versions in
game/assets/ (same basenames, used by the dressing-variant maps)
must NOT be overwritten — the two uses need different files, so
wide art lives in its own subfolder and is keyed 'wide_<basename>'
in game.js. Staging originals in new-art/batch3/sliced/ are
untouched. Idempotent: re-running copies the same bytes again.
Verifies PNG format + expected dimensions (from
new-art/batch3/NOTES.md) with Pillow and refuses to copy anything
unexpected.

Middle tier only (user's word 2026-10-28: whatever keeps quality
decent): wide consoles/servers, wide scrap piles, ladder platform,
wall corner-L, stairs-down. NOT wired: doors, hazard strips, pipe/
cable runs, monitors, lights/lamps, exit sign (full-set tier).
"""
import os
import shutil
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
STAGED = os.path.join(HERE, "sliced")
DEST = os.path.join(HERE, "..", "..", "game", "assets", "wide")

# filename -> (expected width, height), from NOTES.md inventory.
WIDE = {
    "batch3_s1_console_triple.png": (132, 116),
    "batch3_s2_console_wide_2.png": (142, 92),
    "batch3_s2_console_wide_3.png": (211, 92),
    "batch3_s1_server_pair.png": (114, 134),
    "batch3_s1_server_top_pair.png": (148, 94),
    "batch3_s2_scrap_pile_a.png": (178, 124),
    "batch3_s2_scrap_pile_wires.png": (188, 118),
    "batch3_s2_armour_broken.png": (142, 132),
    "batch3_s2_scrap_debris.png": (122, 128),
    "batch3_s2_crates_stack.png": (108, 101),
    "batch3_s2_ladder_platform.png": (182, 158),
    "batch3_s2_wall_corner_L.png": (189, 107),
    "batch3_s2_stairs_down.png": (226, 162),
}


def main():
    os.makedirs(DEST, exist_ok=True)
    total = 0
    for name, (ew, eh) in sorted(WIDE.items()):
        src = os.path.join(STAGED, name)
        if not os.path.exists(src):
            print(f"MISSING staging file: {name}", file=sys.stderr)
            return 1
        with Image.open(src) as im:
            if im.format != "PNG":
                print(f"NOT PNG: {name} ({im.format})", file=sys.stderr)
                return 1
            if im.size != (ew, eh):
                print(f"SIZE MISMATCH: {name} is {im.size}, NOTES says {(ew, eh)}",
                      file=sys.stderr)
                return 1
        dst = os.path.join(DEST, name)
        shutil.copyfile(src, dst)
        total += os.path.getsize(dst)
        print(f"{name} {ew}x{eh} -> game/assets/wide/ ({os.path.getsize(dst)} bytes)")
    print(f"{len(WIDE)} files, {total} bytes total")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
