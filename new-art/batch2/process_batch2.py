#!/usr/bin/env python3
"""Batch 2: slice vision-1 into tiles; flood-fill key generated loot on black.
Raws are never edited in place. Outputs: tiles/ (256px) and keyed loot (+ -512)."""
import glob, os
from collections import deque
from PIL import Image, ImageFilter

BASE = os.path.expanduser('~/workspace/scrap-dungeon/new-art/batch2')
RAW = os.path.join(BASE, 'raw')
TILES = os.path.join(BASE, 'tiles')
os.makedirs(TILES, exist_ok=True)
vis = Image.open(os.path.expanduser('~/workspace/scrap-dungeon/templates/refs/gameplay-vision-1.jpg')).convert('RGB')

CROPS = {
    'floor_plain': (369, 647, 455, 732),
    'floor_circuit': (271, 453, 357, 538),
    'wall_top': (170, 80, 370, 280),
    'wall_bottom': (170, 740, 370, 850),
    'wall_left': (45, 380, 195, 530),
    'wall_right': (765, 260, 945, 440),
}
for name, box in CROPS.items():
    c = vis.crop(box).resize((256, 256), Image.LANCZOS)
    c.save(os.path.join(TILES, f'{name}.png'))
    print('tile', name, box, '-> 256x256')


def key_image(path, out_prefix):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()
    # near-black mask
    dark = [[px[x, y][0] < 50 and px[x, y][1] < 50 and px[x, y][2] < 50
             for x in range(w)] for y in range(h)]
    # flood fill from borders through dark pixels
    filled = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if dark[y][x] and not filled[y][x]:
                filled[y][x] = True; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if dark[y][x] and not filled[y][x]:
                filled[y][x] = True; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x+1, y), (x-1, y), (x, y+1), (x, y-1)):
            if 0 <= nx < w and 0 <= ny < h and dark[ny][nx] and not filled[ny][nx]:
                filled[ny][nx] = True; q.append((nx, ny))
    alpha = Image.new('L', (w, h), 0)
    ap = alpha.load()
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if not filled[y][x]:
                ap[x, y] = 255
                minx = min(minx, x); maxx = max(maxx, x)
                miny = min(miny, y); maxy = max(maxy, y)
    if maxx < 0:
        raise SystemExit(f'nothing kept in {path}')
    alpha = alpha.filter(ImageFilter.GaussianBlur(1.2))
    out = im.copy(); out.putalpha(alpha)
    out = out.crop((minx, miny, maxx + 1, maxy + 1))
    # re-center on square canvas with padding
    s = max(out.size); pad = int(s * 0.06) + 8
    canvas = Image.new('RGBA', (s + 2 * pad, s + 2 * pad), (0, 0, 0, 0))
    canvas.paste(out, (pad + (s - out.size[0]) // 2, pad + (s - out.size[1]) // 2))
    canvas.save(f'{out_prefix}.png')
    canvas.resize((512, 512), Image.LANCZOS).save(f'{out_prefix}-512.png')
    print('keyed', path, 'bbox', (minx, miny, maxx, maxy))

LOOT = {
    'loot_gear_wire': 'media-generation-loot-gear-wire-0-*.png',
    'loot_gold_key': 'media-generation-loot-gold-key-0-*.png',
    'loot_crate': 'media-generation-loot-crate-0-*.png',
    'loot_crystal': 'media-generation-loot-crystal-0-*.png',
}
for name, pat in LOOT.items():
    hits = sorted(glob.glob(os.path.join(RAW, pat)))
    assert hits, pat
    key_image(hits[0], os.path.join(TILES, name))
print('done')
