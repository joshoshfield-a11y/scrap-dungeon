#!/usr/bin/env python3
"""One re-crop pass after QC contact-sheet review. See NOTES.md for reasons.
Re-crops overwrite the named slices; renames fix drifted row-3 labels;
discards delete the unclean slices (keyed stairs/ladder, mushy keypad, valve)."""
import os
from PIL import Image

BASE = os.path.expanduser('~/workspace/scrap-dungeon/new-art/batch3')
RAW = os.path.join(BASE, 'raw')
OUT = os.path.join(BASE, 'sliced')

import importlib.util
spec = importlib.util.spec_from_file_location('slice_batch3', os.path.join(BASE, 'slice_batch3.py'))
# Do not execute the whole slicing script; copy the keying helper by exec of its defs only.
src = open(os.path.join(BASE, 'slice_batch3.py')).read()
head = src.split('# ---------------- Sheet 1')[0]
ns = {}
exec(head, ns)
key_prop = ns['key_prop']; save_tile = ns['save_tile']; save_opaque = ns['save_opaque']
BG1 = ns['BG']['s1']; BG2 = ns['BG']['s2']

im1 = Image.open(os.path.join(RAW, 'tileset-panels-hazard-consoles.jpg')).convert('RGB')
im2 = Image.open(os.path.join(RAW, 'tileset-rusty-circuit-pipes-consoles.jpg')).convert('RGB')

# --- S1 tile re-crops: row-3 right block ends at y~282, not 300; hazard strip trim
for box, name in [
    ((716, 197, 794, 282), 'batch3_s1_vent_slats_g'),
    ((800, 197, 879, 282), 'batch3_s1_floor_grey_a'),
    ((885, 197, 963, 282), 'batch3_s1_floor_grey_b'),
    ((969, 197, 1048, 282), 'batch3_s1_floor_grey_c'),
    ((1054, 197, 1133, 282), 'batch3_s1_floor_hazard_scrape'),
    ((1139, 108, 1218, 186), 'batch3_s1_panel_plain_p'),
    ((23, 313, 99, 386), 'batch3_s1_floor_hazard_a'),
    ((23, 403, 99, 476), 'batch3_s1_floor_hazard_b'),
]:
    save_tile(im1, box, name)
save_opaque(im1, (20, 488, 362, 522), 'batch3_s1_hazard_strip_horizontal')

# --- S1 prop re-crops / tightens
for box, name, bg in [
    ((642, 306, 712, 412), 'batch3_s1_console_double', BG1),
    ((568, 322, 624, 412), 'batch3_s1_console_single', BG1),
    ((828, 328, 904, 382), 'batch3_s1_monitor_map', BG1),
    ((910, 328, 972, 382), 'batch3_s1_monitor_text', BG1),
    ((1012, 344, 1072, 412), 'batch3_s1_server_small', BG1),
    ((822, 422, 878, 528), 'batch3_s1_console_tall_small', BG1),
    ((1000, 418, 1080, 554), 'batch3_s1_server_tall_a', BG1),
    ((1224, 420, 1292, 552), 'batch3_s1_server_tall_b', BG1),
    ((1305, 420, 1400, 552), 'batch3_s1_server_tall_c', BG1),
    ((1240, 338, 1388, 432), 'batch3_s1_server_top_pair', BG1),
    ((136, 602, 206, 664), 'batch3_s1_debris_cans', BG1),
    ((232, 598, 288, 680), 'batch3_s1_prop_barrel_grey', BG1),
    ((1244, 686, 1328, 758), 'batch3_s1_lamp_hanging_b', BG1),
    ((1342, 686, 1396, 758), 'batch3_s1_lamp_hanging_c', BG1),
    ((382, 698, 446, 758), 'batch3_s1_toolbox_grey', BG1),
    ((284, 690, 358, 756), 'batch3_s1_toolbox_red', BG1),
]:
    key_prop(im1, box, name, bg)

# --- S1 row-3 left-block renames (grid drifts one cell in that row) ---
def ren(a, b):
    for suf in ('.png',):
        os.rename(os.path.join(OUT, a + suf), os.path.join(OUT, b + suf))
    print('rename', a, '->', b)
ren('batch3_s1_panel_console_e', 'batch3_s1_panel_plain_tmp')
ren('batch3_s1_panel_vent_shutters', 'batch3_s1_panel_console_e')
ren('batch3_s1_panel_plain_j', 'batch3_s1_panel_vent_shutters')
ren('batch3_s1_panel_plain_tmp', 'batch3_s1_panel_plain_j')

# --- S2 row-3 renames + new sludge tile ---
save_tile(im2, (1109, 244, 1196, 342), 'batch3_s2_floor_sludge_new')
ren('batch3_s2_vent_steam_a', 'batch3_s2_vent_hole_square')
ren('batch3_s2_vent_steam_b', 'batch3_s2_vent_steam_a')
ren('batch3_s2_wall_hole_wires', 'batch3_s2_vent_steam_b')
ren('batch3_s2_wall_hole_cracked', 'batch3_s2_wall_hole_wires')
ren('batch3_s2_floor_sludge', 'batch3_s2_wall_hole_cracked')
ren('batch3_s2_floor_sludge_new', 'batch3_s2_floor_sludge')

# --- S2 prop re-crops / tightens
for box, name, bg in [
    ((398, 612, 540, 744), 'batch3_s2_armour_broken', BG2),
    ((320, 496, 378, 578), 'batch3_s2_console_term_blue', BG2),
    ((660, 640, 768, 742), 'batch3_s2_crates_stack', BG2),
    ((640, 378, 720, 440), 'batch3_s2_pipe_valve_box', BG2),
    ((452, 366, 508, 468), 'batch3_s2_pipe_vertical_valve', BG2),
    ((528, 614, 650, 742), 'batch3_s2_scrap_debris', BG2),
]:
    key_prop(im2, box, name, bg)

# --- Discards: delete keyed stairs/ladder (opaque keepers win), mushy keypad, valve
for name in ['batch3_s2_keypad_small_b', 'batch3_s2_pipe_valve_red',
             'batch3_s2_stairs_down', 'batch3_s2_ladder_platform']:
    for suf in ('.png', '-512.png'):
        p = os.path.join(OUT, name + suf)
        if os.path.exists(p):
            os.remove(p); print('discard', name + suf)
# Promote opaque stairs/ladder to canonical names.
ren('batch3_s2_stairs_down_opaque', 'batch3_s2_stairs_down')
ren('batch3_s2_ladder_platform_opaque', 'batch3_s2_ladder_platform')
print('fix pass done')
