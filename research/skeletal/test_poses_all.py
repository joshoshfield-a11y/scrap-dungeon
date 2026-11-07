"""Test renders for all 5 rigs (scout + raider/brute/drone/boss).
Flat poses, same convention as test_poses.py: screen degrees, positive =
clockwise, PIL rotate = -deg. Drone has no legs: its walk is a hover bob,
its attack is a lunge + rotor spin test, its damaged is a body tilt."""
import json, os
from PIL import Image

ROOT = '/home/hatch/workspace/scrap-dungeon/research/skeletal'
MODELS = {
    'scout':  (os.path.join(ROOT, 'rig.json'), os.path.join(ROOT, 'parts')),
    'raider': (os.path.join(ROOT, 'rigs', 'raider', 'rig.json'), os.path.join(ROOT, 'rigs', 'raider', 'parts')),
    'brute':  (os.path.join(ROOT, 'rigs', 'brute', 'rig.json'), os.path.join(ROOT, 'rigs', 'brute', 'parts')),
    'drone':  (os.path.join(ROOT, 'rigs', 'drone', 'rig.json'), os.path.join(ROOT, 'rigs', 'drone', 'parts')),
    'boss':   (os.path.join(ROOT, 'rigs', 'boss', 'rig.json'), os.path.join(ROOT, 'rigs', 'boss', 'parts')),
}
ORDERS = {
    'biped': ['legL', 'legR', 'torso', 'head', 'armL', 'armR'],
    'drone': ['skid', 'body', 'armL', 'armR', 'rotor'],
}

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

out = os.path.join(ROOT, 'test_renders_all')
os.makedirs(out, exist_ok=True)
for name, (rig_path, parts) in MODELS.items():
    rig = json.load(open(rig_path))
    kind = 'drone' if name == 'drone' else 'biped'
    order = ORDERS[kind]
    if kind == 'biped':
        pose_frame(rig, parts, order, 'S', {}).save(f'{out}/{name}_rest_S.png')
        pose_frame(rig, parts, order, 'S', {'legL': 20, 'legR': -20, 'armL': -16, 'armR': 16},
                   {'torso': (0, -1)}).save(f'{out}/{name}_walk_S.png')
        pose_frame(rig, parts, order, 'E', {'legL': 20, 'legR': -20, 'armL': -16, 'armR': 16},
                   {'torso': (0, -1)}).save(f'{out}/{name}_walk_E.png')
        pose_frame(rig, parts, order, 'S', {'armR': 55, 'armL': -10, 'torso': 4},
                   {'torso': (0, 2)}).save(f'{out}/{name}_attack_S.png')
        pose_frame(rig, parts, order, 'S', {'torso': -8, 'head': -6, 'armL': 12, 'armR': -12},
                   {'torso': (1, 0)}).save(f'{out}/{name}_damaged_S.png')
    else:
        allup = {g: (0, -2) for g in order}
        pose_frame(rig, parts, order, 'S', {}).save(f'{out}/{name}_rest_S.png')
        pose_frame(rig, parts, order, 'S', {}, allup).save(f'{out}/{name}_hover_S.png')
        pose_frame(rig, parts, order, 'E', {}, allup).save(f'{out}/{name}_hover_E.png')
        pose_frame(rig, parts, order, 'S', {'rotor': 45},
                   {g: (2, 0) for g in order}).save(f'{out}/{name}_attack_S.png')
        # Damaged drone tilts as a rigid body: the demo nests children
        # inside the body transform, so the honest PIL equivalent is to
        # rotate the whole rest composite about the body pivot, not to
        # rotate the body alone and leave the rotor/arms level.
        rest = pose_frame(rig, parts, order, 'S', {})
        bx, by = rig['groups']['body']['pivots']['S']
        tilted = rest.rotate(12, resample=Image.NEAREST, center=(bx * 4, by * 4))
        layer = Image.new('RGBA', tilted.size, (0, 0, 0, 0))
        layer.alpha_composite(tilted, (4, 4))
        layer.save(f'{out}/{name}_damaged_S.png')
    print(name, 'test renders done', flush=True)
print('ALL TEST RENDERS DONE')
