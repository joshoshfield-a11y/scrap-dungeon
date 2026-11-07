#!/usr/bin/env python3
"""Scrap Dungeon new-art batch 1 processing.

Follows local_sprite_batch_qc: flood-fill key on black for piles (dark
interior detail survives because only border-connected near-black is
removed), soft edge falloff, trim, re-center on a transparent square,
full size + 512 game-size copy. Full-bleed tiles skip keying.
Raws are never edited in place.
"""
import glob
import os
from collections import deque

from PIL import Image, ImageDraw, ImageFilter

RAW = "/home/hatch/workspace/scrap-dungeon/new-art/batch1/raw"
OUT = "/home/hatch/workspace/scrap-dungeon/new-art/batch1"
GAME = "/home/hatch/workspace/scrap-dungeon/game/assets"
os.makedirs(OUT, exist_ok=True)


def find(pat):
    fs = sorted(glob.glob(os.path.join(RAW, pat)))
    assert fs, pat
    return fs[0]


def key_pile(src, name):
    im = Image.open(src).convert("RGB")
    w, h = im.size
    px = im.load()
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    print(name, "size", im.size, "corners", [px[x, y] for x, y in corners])
    near = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r < 50 and g < 50 and b < 50:
                near[y * w + x] = 1
    # Flood fill from all border pixels through near-black.
    removed = bytearray(w * h)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near[y * w + x] and not removed[y * w + x]:
                removed[y * w + x] = 1
                dq.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if near[y * w + x] and not removed[y * w + x]:
                removed[y * w + x] = 1
                dq.append((x, y))
    while dq:
        x, y = dq.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                i = ny * w + nx
                if near[i] and not removed[i]:
                    removed[i] = 1
                    dq.append((nx, ny))
    alpha = Image.new("L", (w, h), 0)
    ap = alpha.load()
    for y in range(h):
        for x in range(w):
            if not removed[y * w + x]:
                ap[x, y] = 255
    alpha = alpha.filter(ImageFilter.GaussianBlur(1.5))
    out = im.convert("RGBA")
    out.putalpha(alpha)
    bbox = out.getchannel("A").getbbox()
    print(name, "alpha bbox", bbox)
    out = out.crop(bbox)
    # Re-center on a transparent square canvas with even padding.
    pad = int(max(out.size) * 0.06) + 8
    side = max(out.size) + 2 * pad
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(out, ((side - out.width) // 2, (side - out.height) // 2))
    full = os.path.join(OUT, name + ".png")
    canvas.save(full)
    small = canvas.resize((512, 512), Image.LANCZOS)
    small_path = os.path.join(OUT, name + "-512.png")
    small.save(small_path)
    # Pickup sheet: 822x136, cell 0 (slicer crops x=6..102, y=34..130).
    sheet = Image.new("RGBA", (822, 136), (0, 0, 0, 0))
    cell = canvas.resize((96, 96), Image.LANCZOS)
    sheet.paste(cell, (6, 34), cell)
    sheet_path = os.path.join(GAME, name + "_sheet.png")
    sheet.save(sheet_path)
    print(name, "->", full, small_path, sheet_path)
    return small_path


def tile(src, name, size=256):
    im = Image.open(src).convert("RGBA")
    out = im.resize((size, size), Image.LANCZOS)
    p = os.path.join(GAME, name + ".png")
    out.save(p)
    print(name, "->", p)
    return p


# --- piles ---
key_pile(find("media-generation-pile-scrap-loot-*.png"), "prop_salvage_pile")
key_pile(find("media-generation-pile-gears-bolts-*.png"), "prop_component_gears")

# --- full-bleed floor tile: copy through, resize only ---
tile(find("media-generation-floor-dense-scrap-*.png"), "gen_floor_dense_scrap")

# --- wall candidates from v2 room bands (room bbox x 161..1439, y 153..1444) ---
v2 = Image.open(find("media-generation-wall-scrap-border-v2-*.png")).convert("RGBA")
cands = {}
cands["wall_v2_top_sq"] = v2.crop((660, 153, 940, 433))
cands["wall_v2_bottom_sq"] = v2.crop((660, 1164, 940, 1444))
cands["wall_v2_left_sq"] = v2.crop((161, 700, 401, 940))
cands["wall_v2_right_sq"] = v2.crop((1199, 700, 1439, 940))
cands["wall_v2_top_stretch"] = v2.crop((161, 153, 1439, 433)).resize((256, 256), Image.LANCZOS)
for name, img in cands.items():
    if img.size != (256, 256):
        img = img.resize((256, 256), Image.LANCZOS)
    img.save(os.path.join(OUT, name + ".png"))
    print(name, "->", os.path.join(OUT, name + ".png"))

# 3x3 tiled previews (seam check) for each wall candidate.
for name in cands:
    img = Image.open(os.path.join(OUT, name + ".png")).resize((128, 128), Image.LANCZOS)
    prev = Image.new("RGBA", (384, 384), (16, 19, 26, 255))
    for yy in range(3):
        for xx in range(3):
            prev.paste(img, (xx * 128, yy * 128))
    prev.save(os.path.join(OUT, name + "_tiled3x3.png"))

# --- contact sheet on a dark backdrop ---
from PIL import ImageFont

try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
    font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 16)
except Exception:
    font = ImageFont.load_default()
    font_small = font

items = [
    ("prop_salvage_pile-512", os.path.join(OUT, "prop_salvage_pile-512.png"), "salvage pickup (keyed)"),
    ("prop_component_gears-512", os.path.join(OUT, "prop_component_gears-512.png"), "component pickup (keyed)"),
    ("gen_floor_dense_scrap", os.path.join(GAME, "gen_floor_dense_scrap.png"), "industrial floor variant"),
]
for name in cands:
    items.append((name, os.path.join(OUT, name + ".png"), "wall candidate"))
CELL, LABEL = 512, 44
cols = 3
rows = (len(items) + cols - 1) // cols
sheet = Image.new("RGB", (cols * CELL, rows * (CELL + LABEL)), (16, 19, 26))
d = ImageDraw.Draw(sheet)
for i, (name, path, note) in enumerate(items):
    cx, cy = (i % cols) * CELL, (i // cols) * (CELL + LABEL)
    img = Image.open(path).convert("RGBA")
    bg = Image.new("RGBA", (CELL, CELL), (16, 19, 26, 255))
    bg.alpha_composite(img.resize((CELL, CELL), Image.LANCZOS) if img.size != (CELL, CELL) else img)
    sheet.paste(bg.convert("RGB"), (cx, cy))
    d.text((cx + 10, cy + CELL + 8), name + " — " + note, fill=(220, 225, 230), font=font_small)
sheet.save(os.path.join(OUT, "batch1-sheet.png"))
print("sheet ->", os.path.join(OUT, "batch1-sheet.png"))
