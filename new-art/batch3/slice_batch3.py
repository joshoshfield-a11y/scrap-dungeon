#!/usr/bin/env python3
"""Batch 3 staging ONLY: slice the two user tilesets into new-art/batch3/sliced/.
Raws are never edited. No game files are touched. See NOTES.md for measurements/QC.
Tiles -> 256x256 opaque RGB (batch-2 convention). Props -> flood-fill keyed RGBA,
native trimmed size + 512x512 centred copy (batch-2 loot convention).
"""
import os
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

BASE = os.path.expanduser('~/workspace/scrap-dungeon/new-art/batch3')
RAW = os.path.join(BASE, 'raw')
OUT = os.path.join(BASE, 'sliced')
os.makedirs(OUT, exist_ok=True)

S1 = os.path.join(RAW, 'tileset-panels-hazard-consoles.jpg')
S2 = os.path.join(RAW, 'tileset-rusty-circuit-pipes-consoles.jpg')
BG = {'s1': np.array([36.0, 39.0, 44.0]), 's2': np.array([29.0, 31.0, 37.0])}


def save_tile(im, box, name):
    c = im.crop(box).resize((256, 256), Image.LANCZOS)
    c.save(os.path.join(OUT, name + '.png'))
    print('tile', name, box)


def key_prop(im, box, name, bg, thresh=32.0):
    """Flood-fill bg-like pixels from the crop edges, trim, save native + 512."""
    crop = im.crop(box).convert('RGB')
    a = np.asarray(crop).astype(float)
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
    bglike = dist < thresh
    h, w = bglike.shape
    filled = np.zeros_like(bglike)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bglike[y, x] and not filled[y, x]:
                filled[y, x] = True; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if bglike[y, x] and not filled[y, x]:
                filled[y, x] = True; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and bglike[ny, nx] and not filled[ny, nx]:
                filled[ny, nx] = True; q.append((nx, ny))
    alpha = Image.fromarray((~filled * 255).astype(np.uint8), 'L')
    alpha = alpha.filter(ImageFilter.GaussianBlur(1.2))
    out = crop.copy(); out.putalpha(alpha)
    # Trim to alpha bbox (threshold 16), 2px pad, keep at least 1px.
    aa = np.asarray(alpha)
    ys, xs = np.where(aa > 16)
    if len(xs) == 0:
        print('EMPTY key', name, box); return None
    x0, x1 = max(0, xs.min() - 2), min(w, xs.max() + 3)
    y0, y1 = max(0, ys.min() - 2), min(h, ys.max() + 3)
    out = out.crop((x0, y0, x1, y1))
    out.save(os.path.join(OUT, name + '.png'))
    s = max(out.size); pad = int(s * 0.06) + 8
    canvas = Image.new('RGBA', (s + 2 * pad, s + 2 * pad), (0, 0, 0, 0))
    canvas.paste(out, (pad + (s - out.size[0]) // 2, pad + (s - out.size[1]) // 2))
    canvas.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, name + '-512.png'))
    print('prop', name, box, '->', out.size)
    return out.size


def save_opaque(im, box, name):
    c = im.crop(box)
    c.save(os.path.join(OUT, name + '.png'))
    print('opaque', name, box, c.size)


def grid_tiles(im, xs, ys, names, prefix, inset=3):
    """names: dict (row, col) -> suffix. Cells are consecutive boundary pairs."""
    for (r, c), suffix in sorted(names.items()):
        x0, x1 = xs[c] + inset, xs[c + 1] - inset
        y0, y1 = ys[r] + inset, ys[r + 1] - inset
        save_tile(im, (x0, y0, x1, y1), prefix + suffix)


# ---------------- Sheet 1: panels / hazard ----------------
im1 = Image.open(S1).convert('RGB')
xsL = [20, 105, 189, 275, 359, 444, 529, 613, 713]
xsR = [713, 797, 882, 966, 1051, 1136, 1221, 1306, 1407]
ys1 = [17, 105, 194, 300]
grid_tiles(im1, xsL, ys1, {
    (0, 0): 'panel_plain_a', (0, 1): 'panel_plain_b', (0, 2): 'panel_plain_c',
    (0, 3): 'panel_plain_d', (0, 4): 'panel_plain_e', (0, 5): 'panel_pipes_a',
    (0, 6): 'panel_console_a', (0, 7): 'panel_console_b',
    (1, 0): 'panel_plain_f', (1, 1): 'panel_plain_g', (1, 2): 'panel_vent',
    (1, 3): 'panel_pipes_b', (1, 4): 'panel_pipes_c', (1, 5): 'panel_pipes_d',
    (1, 6): 'panel_console_c', (1, 7): 'panel_console_d',
    (2, 0): 'panel_plain_h', (2, 1): 'panel_plain_i', (2, 2): 'panel_console_e',
    (2, 3): 'panel_vent_shutters', (2, 4): 'panel_plain_j',
}, 'batch3_s1_')
grid_tiles(im1, xsR, ys1, {
    (0, 0): 'vent_slats_a', (0, 1): 'vent_slats_b', (0, 2): 'vent_slats_c',
    (0, 3): 'vent_slats_d', (0, 4): 'vent_slats_e', (0, 5): 'panel_plain_k',
    (0, 6): 'vent_slats_f', (0, 7): 'panel_plain_l',
    (1, 0): 'panel_plain_m', (1, 1): 'panel_plain_n',
    (1, 2): 'floor_hazard_check_a', (1, 3): 'floor_hazard_check_b',
    (1, 4): 'panel_plain_o', (1, 5): 'panel_plain_p',
    (1, 6): 'floor_grate_round', (1, 7): 'floor_grate_green',
    (2, 0): 'vent_slats_g', (2, 1): 'floor_grey_a', (2, 2): 'floor_grey_b',
    (2, 3): 'floor_grey_c', (2, 4): 'floor_hazard_scrape',
}, 'batch3_s1_')
# Hazard squares: top-left + bottom-left representatives (others are repeats).
save_tile(im1, (23, 313, 99, 392), 'batch3_s1_floor_hazard_a')
save_tile(im1, (23, 403, 99, 482), 'batch3_s1_floor_hazard_b')
save_tile(im1, (291, 313, 363, 395), 'batch3_s1_floor_hazard_corner')
save_opaque(im1, (396, 312, 432, 546), 'batch3_s1_hazard_strip_vertical')
save_opaque(im1, (20, 488, 362, 532), 'batch3_s1_hazard_strip_horizontal')
# Consoles / servers (keyed props)
for box, name in [
    ((568, 322, 630, 412), 'console_single'),
    ((642, 306, 718, 412), 'console_double'),
    ((728, 312, 788, 412), 'console_tall'),
    ((828, 328, 898, 382), 'monitor_map'),
    ((906, 328, 976, 382), 'monitor_text'),
    ((1012, 344, 1076, 412), 'server_small'),
    ((566, 434, 698, 550), 'console_triple'),
    ((722, 434, 776, 550), 'console_single_mid'),
    ((815, 424, 860, 524), 'console_tall_small'),
    ((1012, 420, 1076, 552), 'server_tall_a'),
    ((1088, 418, 1202, 552), 'server_pair'),
    ((1224, 420, 1298, 552), 'server_tall_b'),
    ((1312, 420, 1386, 552), 'server_tall_c'),
    ((1246, 340, 1386, 422), 'server_top_pair'),
]:
    key_prop(im1, box, 'batch3_s1_' + name, BG['s1'])
# Doors (keyed; black interior is enclosed so it stays opaque)
for box, name in [
    ((482, 592, 648, 752), 'door_closed'),
    ((692, 592, 884, 752), 'door_open'),
    ((912, 592, 1112, 752), 'door_broken'),
]:
    key_prop(im1, box, 'batch3_s1_' + name, BG['s1'])
# Lights / lamps (glow halos will be cut at the key threshold; QC will show it)
for box, name in [
    ((1150, 588, 1214, 680), 'light_green'),
    ((1248, 588, 1300, 680), 'light_orange'),
    ((1330, 588, 1390, 680), 'light_blue'),
    ((1150, 686, 1220, 758), 'lamp_hanging_a'),
    ((1244, 686, 1336, 758), 'lamp_hanging_b'),
    ((1336, 686, 1396, 758), 'lamp_hanging_c'),
]:
    key_prop(im1, box, 'batch3_s1_' + name, BG['s1'])
# Small props
for box, name in [
    ((16, 598, 112, 662), 'debris_shells'),
    ((128, 598, 204, 662), 'debris_cans'),
    ((232, 598, 282, 680), 'prop_barrel_grey'),
    ((296, 598, 362, 680), 'prop_crate_skull_a'),
    ((390, 598, 442, 678), 'prop_barrel_rust'),
    ((30, 686, 86, 758), 'prop_barrel_blue'),
    ((108, 686, 182, 758), 'prop_crate_skull_b'),
    ((218, 686, 262, 758), 'fire_extinguisher'),
    ((284, 690, 362, 756), 'toolbox_red'),
    ((378, 698, 446, 758), 'toolbox_grey'),
]:
    key_prop(im1, box, 'batch3_s1_' + name, BG['s1'])

# ---------------- Sheet 2: rusty / circuit ----------------
im2 = Image.open(S2).convert('RGB')
xs2 = [10, 110, 210, 309, 408, 508, 608, 707, 805, 905, 1004, 1103, 1202, 1302, 1407]
ys2 = [10, 123, 241, 345]
grid_tiles(im2, xs2, ys2, {
    (0, 0): 'floor_rusty_a', (0, 1): 'floor_rusty_b', (0, 2): 'floor_mesh',
    (0, 3): 'floor_diamond', (0, 4): 'floor_cracked_a',
    (0, 5): 'floor_circuit_a', (0, 6): 'floor_circuit_b', (0, 7): 'floor_circuit_c',
    (0, 8): 'floor_hazard_top_a', (0, 9): 'floor_hazard_top_b',
    (0, 10): 'floor_tiles_grey', (0, 11): 'floor_cracked_b',
    (1, 0): 'wall_panel_a', (1, 1): 'wall_panel_b', (1, 2): 'wall_panel_c',
    (1, 3): 'wall_corner_a', (1, 4): 'wall_corner_b',
    (1, 5): 'wall_pipe_a', (1, 6): 'wall_pipe_b', (1, 7): 'wall_pipe_c',
    (1, 8): 'wall_panel_console', (1, 9): 'wall_door_closed_a',
    (1, 10): 'wall_door_closed_b', (1, 11): 'wall_door_open_a',
    (1, 12): 'wall_door_open_b', (1, 13): 'wall_door_open_c',
    (2, 0): 'vent_slats', (2, 1): 'vent_grid', (2, 2): 'vent_hazard_a',
    (2, 3): 'vent_hazard_b', (2, 4): 'vent_hole_hazard', (2, 5): 'vent_grid_hole',
    (2, 6): 'vent_steam_a', (2, 7): 'vent_steam_b', (2, 8): 'wall_hole_wires',
    (2, 9): 'wall_hole_cracked', (2, 10): 'floor_sludge',
}, 'batch3_s2_')
# L-shaped corner wall: cols 12-13 of row 1 as one wide opaque slice.
save_opaque(im2, (1205, 13, 1394, 120), 'batch3_s2_wall_corner_L')
# Pipes / cables (keyed)
for box, name in [
    ((8, 366, 254, 440), 'pipe_run_elbow'),
    ((306, 368, 402, 434), 'pipe_tee_a'),
    ((446, 366, 514, 468), 'pipe_vertical_valve'),
    ((528, 378, 624, 468), 'pipe_tee_down'),
    ((636, 378, 726, 440), 'pipe_valve_box'),
    ((736, 374, 862, 468), 'cables_a'),
    ((864, 374, 1000, 468), 'cables_b'),
    ((1000, 350, 1075, 470), 'cable_drop'),
    ((1128, 396, 1214, 468), 'cable_junction_box'),
    ((1252, 384, 1358, 426), 'pipe_valve_red'),
]:
    key_prop(im2, box, 'batch3_s2_' + name, BG['s2'])
# Consoles (keyed)
for box, name in [
    ((24, 486, 94, 578), 'console_term_a'),
    ((126, 486, 196, 578), 'console_term_b'),
    ((234, 496, 282, 578), 'console_term_green'),
    ((320, 496, 382, 578), 'console_term_blue'),
    ((416, 542, 448, 576), 'keypad_small_a'),
    ((474, 496, 498, 522), 'keypad_small_b'),
    ((544, 496, 578, 546), 'keypad_tall'),
    ((622, 486, 688, 578), 'console_map'),
    ((714, 486, 862, 578), 'console_wide_2'),
    ((882, 486, 1096, 578), 'console_wide_3'),
]:
    key_prop(im2, box, 'batch3_s2_' + name, BG['s2'])
# Bottom row: scrap / crates (keyed), stairs + ladder (keyed AND opaque, QC decides)
for box, name in [
    ((18, 618, 196, 742), 'scrap_pile_a'),
    ((210, 618, 398, 736), 'scrap_pile_wires'),
    ((400, 614, 528, 742), 'armour_broken'),
    ((528, 614, 658, 742), 'scrap_debris'),
    ((662, 638, 766, 740), 'crates_stack'),
    ((1318, 622, 1386, 652), 'exit_sign'),
]:
    key_prop(im2, box, 'batch3_s2_' + name, BG['s2'])
for box, name in [
    ((872, 600, 1098, 762), 'stairs_down'),
    ((1110, 600, 1292, 758), 'ladder_platform'),
]:
    key_prop(im2, box, 'batch3_s2_' + name, BG['s2'])
    save_opaque(im2, box, 'batch3_s2_' + name + '_opaque')
print('done')
