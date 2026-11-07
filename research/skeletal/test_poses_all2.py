"""Test renders + QC grid for the 9 rigs in build_rig_all2.py.
Same convention as test_poses_all.py: screen degrees, clockwise positive,
PIL rotate = -deg. Rigid-body damaged poses (tank/turret/flyer) rotate
the whole rest composite about the root pivot, as with the drone."""
import json, os
from PIL import Image

ROOT = '/home/hatch/workspace/scrap-dungeon/research/skeletal'
MODELS = ['assault', 'artillery', 'tank', 'spider', 'turret', 'flyer',
          'shielder', 'sniper', 'bomber']
ORDERS = {
    'assault':   ['legL', 'legR', 'torso', 'head', 'armL', 'armR'],
    'artillery': ['legL', 'legR', 'torso', 'cannon', 'head'],
    'tank':      ['trackL', 'trackR', 'hull', 'turret'],
    'spider':    ['legLB', 'legLM', 'legLF', 'legRB', 'legRM', 'legRF', 'body'],
    'turret':    ['base', 'dome', 'barrel'],
    'flyer':     ['hull', 'gun', 'rotor'],
    'shielder':  ['legL', 'legR', 'torso', 'shield', 'head', 'armR'],
    'sniper':    ['legL', 'legR', 'torso', 'head', 'armL', 'armR'],
    'bomber':    ['legL', 'legR', 'body', 'head', 'armL', 'armR'],
}
ROOTS = {'assault': 'torso', 'artillery': 'torso', 'tank': 'hull', 'spider': 'body',
         'turret': 'base', 'flyer': 'hull', 'shielder': 'torso', 'sniper': 'torso',
         'bomber': 'body'}

def pose_frame(rig, parts, order, direction, angles, translate=None, scale=4):
    comp = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
    translate = translate or {}
    for g in order:
        spr = Image.open(os.path.join(parts, g, f'{direction}.png'))
        px, py = rig['groups'][g]['pivots'][direction]
        a = angles.get(g, 0)
        dx, dy = translate.get(g, (0, 0))
        if a:
            spr = spr.rotate(-a, resample=Image.NEAREST, center=(px, py))
        layer = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
        layer.alpha_composite(spr, (dx, dy))
        comp.alpha_composite(layer)
    return comp.resize((96 * scale, 96 * scale), Image.NEAREST)

def tilt_whole(rig, parts, order, root, direction, deg, dx=0, dy=0):
    rest = pose_frame(rig, parts, order, direction, {})
    bx, by = rig['groups'][root]['pivots'][direction]
    tilted = rest.rotate(deg, resample=Image.NEAREST, center=(bx * 4, by * 4))
    layer = Image.new('RGBA', tilted.size, (0, 0, 0, 0))
    layer.alpha_composite(tilted, (dx * 4, dy * 4))
    return layer

out = os.path.join(ROOT, 'test_renders_all2')
os.makedirs(out, exist_ok=True)
BIPED_WALK = {'legL': 20, 'legR': -20, 'armL': -16, 'armR': 16}
BIPED_ATTACK = {'armR': 55, 'armL': -10, 'torso': 4}
BIPED_DMG = {'torso': -8, 'head': -6, 'armL': 12, 'armR': -12}
for name in MODELS:
    rig = json.load(open(os.path.join(ROOT, 'rigs', name, 'rig.json')))
    parts = os.path.join(ROOT, 'rigs', name, 'parts')
    order, root = ORDERS[name], ROOTS[name]
    root_tr = {root: (0, -1)}
    if name in ('assault', 'sniper'):
        pose_frame(rig, parts, order, 'S', {}).save(f'{out}/{name}_rest_S.png')
        pose_frame(rig, parts, order, 'S', BIPED_WALK, root_tr).save(f'{out}/{name}_walk_S.png')
        pose_frame(rig, parts, order, 'E', BIPED_WALK, root_tr).save(f'{out}/{name}_walk_E.png')
        pose_frame(rig, parts, order, 'S', BIPED_ATTACK, {root: (0, 2)}).save(f'{out}/{name}_attack_S.png')
        pose_frame(rig, parts, order, 'S', BIPED_DMG, {root: (1, 0)}).save(f'{out}/{name}_damaged_S.png')
    elif name == 'shielder':
        pose_frame(rig, parts, order, 'S', {}).save(f'{out}/{name}_rest_S.png')
        pose_frame(rig, parts, order, 'S', {'legL': 20, 'legR': -20, 'shield': 8, 'armR': -16}, root_tr).save(f'{out}/{name}_walk_S.png')
        pose_frame(rig, parts, order, 'E', {'legL': 20, 'legR': -20, 'shield': 8, 'armR': -16}, root_tr).save(f'{out}/{name}_walk_E.png')
        pose_frame(rig, parts, order, 'S', {'armR': 55, 'shield': -10, 'torso': 4}, {root: (0, 2)}).save(f'{out}/{name}_attack_S.png')
        pose_frame(rig, parts, order, 'S', {'torso': -8, 'head': -6, 'shield': 15, 'armR': -12}, {root: (1, 0)}).save(f'{out}/{name}_damaged_S.png')
    elif name == 'bomber':
        pose_frame(rig, parts, order, 'S', {}).save(f'{out}/{name}_rest_S.png')
        pose_frame(rig, parts, order, 'S', {'legL': 20, 'legR': -20, 'armL': -16, 'armR': 16}, {root: (0, -1)}).save(f'{out}/{name}_walk_S.png')
        pose_frame(rig, parts, order, 'E', {'legL': 20, 'legR': -20, 'armL': -16, 'armR': 16}, {root: (0, -1)}).save(f'{out}/{name}_walk_E.png')
        pose_frame(rig, parts, order, 'S', {'armR': 55, 'armL': -10, 'body': 4}, {root: (0, 2)}).save(f'{out}/{name}_attack_S.png')
        pose_frame(rig, parts, order, 'S', {'body': -8, 'head': -6, 'armL': 12, 'armR': -12}, {root: (1, 0)}).save(f'{out}/{name}_damaged_S.png')
    elif name == 'artillery':
        pose_frame(rig, parts, order, 'S', {}).save(f'{out}/{name}_rest_S.png')
        pose_frame(rig, parts, order, 'S', {'legL': 20, 'legR': -20}, root_tr).save(f'{out}/{name}_walk_S.png')
        pose_frame(rig, parts, order, 'E', {'legL': 20, 'legR': -20}, root_tr).save(f'{out}/{name}_walk_E.png')
        pose_frame(rig, parts, order, 'S', {'cannon': -15, 'torso': 4}, {root: (0, 2)}).save(f'{out}/{name}_attack_S.png')
        pose_frame(rig, parts, order, 'S', {'torso': -8, 'head': -6, 'cannon': 10}, {root: (1, 0)}).save(f'{out}/{name}_damaged_S.png')
    elif name == 'tank':
        pose_frame(rig, parts, order, 'S', {}).save(f'{out}/{name}_rest_S.png')
        pose_frame(rig, parts, order, 'S', {'turret': 12}, {root: (0, -1)}).save(f'{out}/{name}_walk_S.png')
        pose_frame(rig, parts, order, 'E', {'turret': -12}, {root: (0, -1)}).save(f'{out}/{name}_walk_E.png')
        pose_frame(rig, parts, order, 'S', {'turret': 0}, {g: (0, 2) for g in order}).save(f'{out}/{name}_attack_S.png')
        tilt_whole(rig, parts, order, root, 'S', 10, 1, 0).save(f'{out}/{name}_damaged_S.png')
    elif name == 'spider':
        walk = {'legLF': 18, 'legLM': -18, 'legLB': 18, 'legRF': -18, 'legRM': 18, 'legRB': -18}
        pose_frame(rig, parts, order, 'S', {}).save(f'{out}/{name}_rest_S.png')
        pose_frame(rig, parts, order, 'S', walk, {root: (0, -1)}).save(f'{out}/{name}_walk_S.png')
        pose_frame(rig, parts, order, 'E', walk, {root: (0, -1)}).save(f'{out}/{name}_walk_E.png')
        pose_frame(rig, parts, order, 'S', {'legLF': 30, 'legRF': 30, 'body': 4}, {root: (0, 2)}).save(f'{out}/{name}_attack_S.png')
        pose_frame(rig, parts, order, 'S', {'body': -8, 'legLF': -10, 'legRF': -10}, {root: (1, 0)}).save(f'{out}/{name}_damaged_S.png')
    elif name == 'turret':
        pose_frame(rig, parts, order, 'S', {}).save(f'{out}/{name}_rest_S.png')
        pose_frame(rig, parts, order, 'S', {'dome': 15, 'barrel': 15}).save(f'{out}/{name}_walk_S.png')
        pose_frame(rig, parts, order, 'E', {'dome': -15, 'barrel': -15}).save(f'{out}/{name}_walk_E.png')
        pose_frame(rig, parts, order, 'S', {'barrel': -20}).save(f'{out}/{name}_attack_S.png')
        tilt_whole(rig, parts, order, root, 'S', 12, 1, 0).save(f'{out}/{name}_damaged_S.png')
    elif name == 'flyer':
        pose_frame(rig, parts, order, 'S', {}).save(f'{out}/{name}_rest_S.png')
        pose_frame(rig, parts, order, 'S', {}, {g: (0, -2) for g in order}).save(f'{out}/{name}_walk_S.png')
        pose_frame(rig, parts, order, 'E', {}, {g: (0, -2) for g in order}).save(f'{out}/{name}_walk_E.png')
        pose_frame(rig, parts, order, 'S', {'rotor': 20}, {g: (2, 0) for g in order}).save(f'{out}/{name}_attack_S.png')
        tilt_whole(rig, parts, order, root, 'S', 12, 1, 0).save(f'{out}/{name}_damaged_S.png')
    print(name, 'test renders done', flush=True)

# QC grid: rows = models, cols = rest, walk S, walk E, attack, damaged (scale 2)
cols = ['rest_S', 'walk_S', 'walk_E', 'attack_S', 'damaged_S']
cell = 192
grid = Image.new('RGBA', (cell * 5, cell * len(MODELS)), (24, 24, 32, 255))
for r, name in enumerate(MODELS):
    for c, col in enumerate(cols):
        im = Image.open(f'{out}/{name}_{col}.png').resize((cell, cell), Image.NEAREST)
        grid.alpha_composite(im, (c * cell, r * cell))
grid.save(os.path.join(ROOT, 'test_qc_all2.png'))
print('QC grid test_qc_all2.png written')
print('ALL2 TEST RENDERS DONE')
