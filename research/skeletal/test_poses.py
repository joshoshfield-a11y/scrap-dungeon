"""Test renders for the skeletal rig: rest (must equal full render),
walk, attack, damaged. Angles are screen degrees, positive = clockwise.
PIL rotate() is CCW-positive, so PIL angle = -deg."""
import json, os
import numpy as np
from PIL import Image

ROOT = '/home/hatch/workspace/scrap-dungeon/research/skeletal'
rig = json.load(open(os.path.join(ROOT, 'rig.json')))
PARTS = os.path.join(ROOT, 'parts')
DRAW_ORDER = ['legL', 'legR', 'torso', 'head', 'armL', 'armR']

def pose_frame(direction, angles, translate=None, scale=4):
    comp = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
    translate = translate or {}
    for g in DRAW_ORDER:
        spr = Image.open(os.path.join(PARTS, g, f'{direction}.png'))
        px, py = rig['groups'][g]['pivots'][direction]
        a = angles.get(g, 0)
        dx, dy = translate.get(g, (0, 0))
        if a:
            spr = spr.rotate(-a, resample=Image.NEAREST, center=(px, py))
        layer = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
        layer.alpha_composite(spr, (dx, dy))
        comp.alpha_composite(layer)
    return comp.resize((96 * scale, 96 * scale), Image.NEAREST)

out = os.path.join(ROOT, 'test_renders')
os.makedirs(out, exist_ok=True)
pose_frame('S', {}).save(f'{out}/test_rest_S.png')
pose_frame('S', {'legL': 20, 'legR': -20, 'armL': -16, 'armR': 16},
           {'torso': (0, -1)}).save(f'{out}/test_walk_S.png')
pose_frame('E', {'legL': 20, 'legR': -20, 'armL': -16, 'armR': 16},
           {'torso': (0, -1)}).save(f'{out}/test_walk_E.png')
pose_frame('S', {'armR': 55, 'armL': -10, 'torso': 4},
           {'torso': (0, 2)}).save(f'{out}/test_attack_S.png')
pose_frame('S', {'torso': -8, 'head': -6, 'armL': 12, 'armR': -12},
           {'torso': (1, 0)}).save(f'{out}/test_damaged_S.png')
print('test renders saved')
