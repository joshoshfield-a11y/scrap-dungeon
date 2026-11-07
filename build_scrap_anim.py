"""Scrap Dungeon animation states: frame-based pose variants for the
slice-1 actors (player scout, 3 enemies, boss).

PixelAOI has no pose/keyframe tool in the MCP bridge, so animation is
done the honest voxel way: one model per frame, rendered to the usual
8-direction sheet. The game cycles them: idle (existing rest sheet) ->
walk_a -> walk_b -> walk_a ..., attack, damaged, destroyed.

Variants are derived from the base box lists by transform, so every
frame stays on-model: legs/arms move, weapons extend, damaged leans
and darkens, destroyed is a wreckage pile. 5 actors x 5 frames = 25.
"""
import sys, copy
sys.path.insert(0, '/home/hatch/workspace/model-sprites/work')
sys.path.insert(0, '/home/hatch/workspace/scrap-dungeon')
from mcp_drive import box
from build_scrap1 import run_all

PB = '#2f5fd0'; PL = '#5a8cff'; W = '#dde3ea'; DK = '#23262c'; CY = '#35e0ff'
ST = '#8a939e'; RD = '#c8352a'; RDK = '#7e231c'; DKG = '#26292f'; OR = '#ff7a1a'
YEL = '#ffd23f'

# ---- base lists, copied verbatim from build_wmechs.py / build_scrap1.py ----
SCOUT = [
    box([6, 0, 7], [8, 0, 11], DK, 'Feet'), box([11, 0, 7], [13, 0, 11], DK, 'Feet'),
    box([7, 1, 8], [8, 5, 10], PB, 'Leg L'), box([11, 1, 8], [12, 5, 10], PB, 'Leg R'),
    box([7, 6, 8], [12, 9, 11], PB, 'Torso'), box([9, 7, 12], [10, 8, 12], W, 'Torso'),
    box([6, 6, 8], [6, 9, 10], PB, 'Arm L'), box([13, 6, 8], [13, 9, 10], PB, 'Arm R'),
    box([5, 9, 8], [6, 10, 10], PL, 'Arm L'), box([13, 9, 8], [14, 10, 10], PL, 'Arm R'),
    box([8, 10, 8], [11, 11, 11], W, 'Head'), box([9, 11, 12], [10, 11, 12], CY, 'Head'),
    box([8, 12, 9], [8, 14, 9], DK, 'Antenna'),
    box([8, 7, 6], [10, 9, 6], PB, 'Pack'),
    box([13, 7, 11], [13, 7, 16], DK, 'Gun'), box([13, 8, 12], [13, 8, 13], CY, 'Gun')]
RAIDER = [
    box([6, 0, 7], [8, 0, 11], DKG, 'Feet'), box([11, 0, 7], [13, 0, 11], DKG, 'Feet'),
    box([7, 1, 8], [8, 5, 10], RD, 'Leg L'), box([11, 1, 8], [12, 5, 10], RD, 'Leg R'),
    box([7, 6, 8], [12, 9, 11], RD, 'Torso'), box([9, 7, 12], [10, 7, 12], DKG, 'Torso'),
    box([6, 6, 8], [6, 9, 10], RD, 'Arm L'), box([13, 6, 8], [13, 9, 10], RD, 'Arm R'),
    box([8, 10, 8], [11, 11, 11], RDK, 'Head'), box([9, 11, 12], [10, 11, 12], CY, 'Head'),
    box([13, 4, 12], [13, 9, 12], '#c8ccd2', 'Blade'), box([13, 4, 13], [13, 9, 13], CY, 'Blade'),
    box([6, 5, 12], [6, 7, 12], RD, 'Blade')]
BRUTE = [
    box([5, 0, 6], [8, 0, 12], DKG, 'Feet'), box([11, 0, 6], [14, 0, 12], DKG, 'Feet'),
    box([6, 1, 7], [8, 5, 11], RD, 'Leg L'), box([11, 1, 7], [13, 5, 11], RD, 'Leg R'),
    box([6, 6, 7], [13, 10, 12], RD, 'Torso'), box([9, 7, 13], [10, 7, 13], CY, 'Torso'),
    box([4, 10, 7], [6, 12, 11], RDK, 'Arm L'), box([13, 10, 7], [15, 12, 11], RDK, 'Arm R'),
    box([5, 13, 8], [5, 13, 8], DKG, 'Spike'), box([5, 13, 10], [5, 13, 10], DKG, 'Spike'),
    box([14, 13, 8], [14, 13, 8], DKG, 'Spike'), box([14, 13, 10], [14, 13, 10], DKG, 'Spike'),
    box([4, 5, 8], [6, 7, 11], RD, 'Fist L'), box([13, 5, 8], [15, 7, 11], RD, 'Fist R'),
    box([4, 4, 12], [4, 4, 12], DKG, 'Claw'), box([6, 4, 12], [6, 4, 12], DKG, 'Claw'),
    box([13, 4, 12], [13, 4, 12], DKG, 'Claw'), box([15, 4, 12], [15, 4, 12], DKG, 'Claw'),
    box([8, 11, 8], [11, 12, 11], RDK, 'Head'), box([9, 12, 12], [10, 12, 12], CY, 'Head')]
DRONE = [
    box([8, 4, 8], [11, 6, 11], RD, 'Body'), box([9, 5, 12], [10, 5, 12], CY, 'Body'),
    box([6, 5, 9], [7, 5, 9], DKG, 'Arm'), box([12, 5, 9], [13, 5, 9], DKG, 'Arm'),
    box([6, 5, 7], [7, 5, 7], DKG, 'Arm'), box([12, 5, 7], [13, 5, 7], DKG, 'Arm'),
    box([5, 6, 8], [7, 6, 10], DKG, 'Rotor'), box([12, 6, 8], [14, 6, 10], DKG, 'Rotor'),
    box([5, 6, 6], [7, 6, 6], DKG, 'Rotor'), box([12, 6, 6], [14, 6, 6], DKG, 'Rotor'),
    box([6, 6, 9], [6, 6, 9], CY, 'Rotor'), box([13, 6, 9], [13, 6, 9], CY, 'Rotor'),
    box([9, 3, 9], [10, 3, 10], DKG, 'Skid')]
BOSS = [
    box([4, 0, 5], [7, 0, 12], DKG, 'Feet'), box([12, 0, 5], [15, 0, 12], DKG, 'Feet'),
    box([5, 1, 6], [7, 6, 11], RD, 'Leg L'), box([12, 1, 6], [14, 6, 11], RD, 'Leg R'),
    box([6, 3, 12], [6, 3, 12], CY, 'Leg L'), box([13, 3, 12], [13, 3, 12], CY, 'Leg R'),
    box([4, 7, 6], [15, 12, 12], RD, 'Torso'), box([7, 8, 13], [12, 11, 13], RDK, 'Chest'),
    box([9, 9, 13], [10, 10, 13], OR, 'Core'), box([7, 12, 6], [12, 12, 12], DKG, 'Belt'),
    box([2, 11, 6], [5, 14, 12], RDK, 'Pauldron L'), box([14, 11, 6], [17, 14, 12], RDK, 'Pauldron R'),
    box([3, 15, 7], [3, 15, 7], DKG, 'Spike'), box([3, 15, 11], [3, 15, 11], DKG, 'Spike'),
    box([16, 15, 7], [16, 15, 7], DKG, 'Spike'), box([16, 15, 11], [16, 15, 11], DKG, 'Spike'),
    box([1, 13, 9], [1, 13, 9], DKG, 'Spike'), box([18, 13, 9], [18, 13, 9], DKG, 'Spike'),
    box([2, 7, 7], [4, 10, 11], RD, 'Arm L'), box([15, 7, 7], [17, 10, 11], RD, 'Arm R'),
    box([1, 4, 6], [4, 7, 11], RD, 'Fist L'), box([15, 4, 6], [18, 7, 11], RD, 'Fist R'),
    box([2, 5, 12], [2, 5, 12], CY, 'Fist L'), box([17, 5, 12], [17, 5, 12], CY, 'Fist R'),
    box([7, 13, 7], [12, 15, 11], RDK, 'Head'), box([8, 14, 12], [11, 14, 12], CY, 'Visor'),
    box([7, 16, 8], [7, 16, 8], DKG, 'Horn'), box([12, 16, 8], [12, 16, 8], DKG, 'Horn')]

# ---- transforms ----
def sh(b, dx=0, dy=0, dz=0):
    _, a = b
    a = copy.deepcopy(a)
    a['from'] = [a['from'][0] + dx, a['from'][1] + dy, a['from'][2] + dz]
    a['to'] = [a['to'][0] + dx, a['to'][1] + dy, a['to'][2] + dz]
    return ('model_shape', a)

def part(b):
    return b[1]['part']

def cx(b):
    return (b[1]['from'][0] + b[1]['to'][0]) / 2

def ymax(b):
    return b[1]['to'][1]

def is_left_leg(b):
    return part(b) == 'Leg L'

def is_right_leg(b):
    return part(b) == 'Leg R'

def is_left_foot(b):
    return part(b) == 'Feet' and cx(b) < 10

def is_right_foot(b):
    return part(b) == 'Feet' and cx(b) >= 10

def is_swing_arm(b, side):
    # full arms swing; high pauldrons stay with the torso
    return part(b) == f'Arm {side}' and ymax(b) <= 10

def is_fist(b, side):
    return part(b) == f'Fist {side}'

def walk_a(base):
    out = []
    for b in base:
        if is_left_leg(b) or is_left_foot(b):
            out.append(sh(b, dz=2))
        elif is_right_leg(b) or is_right_foot(b):
            out.append(sh(b, dz=-2))
        elif is_swing_arm(b, 'L') or is_fist(b, 'L'):
            out.append(sh(b, dz=-1))
        elif is_swing_arm(b, 'R') or is_fist(b, 'R'):
            out.append(sh(b, dz=1))
        else:
            out.append(b)
    return out

def walk_b(base):
    out = []
    for b in base:
        if is_left_leg(b):
            _, a = b
            a = copy.deepcopy(a)
            a['from'] = [a['from'][0], a['from'][1] + 1, a['from'][2]]
            out.append(('model_shape', a))
        elif is_left_foot(b):
            out.append(sh(b, dy=1))
        else:
            out.append(b)
    return out

def hover_bob(base, dy):
    return [sh(b, dy=dy) for b in base]

DARK = {PB: '#1d3566', PL: '#3a5a8a', W: '#9aa2ad', CY: '#1a5a66',
        ST: '#5a6168', DK: '#181a1e', DKG: '#1c1f24', RD: '#8a2a20',
        RDK: '#5e1d16', OR: '#8a4a10', '#c8ccd2': '#7a7e84'}
LEAN = {'Torso', 'Head', 'Arm L', 'Arm R', 'Fist L', 'Fist R', 'Chest',
        'Belt', 'Visor', 'Gun', 'Blade', 'Pauldron L', 'Pauldron R'}

def damaged(base, hover=False):
    out = []
    for b in base:
        if part(b) == 'Spike':
            continue
        _, a = b
        a = copy.deepcopy(a)
        a['colour'] = DARK.get(a['colour'], a['colour'])
        b = ('model_shape', a)
        if hover or part(b) in LEAN:
            b = sh(b, dx=1)
        out.append(b)
    return out

def destroyed(main_dark, head_dark):
    return [
        box([4, 0, 5], [15, 1, 12], DKG, 'Wreck'),
        box([6, 1, 6], [12, 2, 11], main_dark, 'Wreck'),
        box([14, 1, 7], [16, 2, 9], head_dark, 'Wreck'),
        box([2, 1, 8], [4, 2, 10], main_dark, 'Wreck'),
        box([12, 1, 13], [15, 1, 14], DKG, 'Wreck'),
        box([8, 1, 13], [8, 1, 13], '#5a1a10', 'Ember')]

def attack_biped(base, kind):
    out = []
    for b in base:
        p = part(b)
        if kind == 'scout':
            if is_swing_arm(b, 'R') or p == 'Gun':
                out.append(sh(b, dz=2))
            elif is_swing_arm(b, 'L'):
                out.append(sh(b, dz=-1))
            else:
                out.append(b)
        elif kind == 'raider':
            if is_swing_arm(b, 'R'):
                out.append(sh(b, dz=2))
            elif p == 'Blade':
                out.append(sh(b, dz=3) if cx(b) >= 10 else b)
            elif is_swing_arm(b, 'L'):
                out.append(sh(b, dz=-1))
            else:
                out.append(b)
        elif kind == 'brute':
            if is_fist(b, 'R'):
                out.append(sh(b, dz=3))
            elif is_fist(b, 'L'):
                out.append(sh(b, dz=1))
            elif p == 'Claw':
                out.append(sh(b, dz=3) if cx(b) >= 10 else sh(b, dz=1))
            elif is_left_leg(b) or is_left_foot(b):
                out.append(sh(b, dz=2))
            elif is_right_leg(b) or is_right_foot(b):
                out.append(sh(b, dz=-1))
            else:
                out.append(b)
        elif kind == 'boss':
            if is_fist(b, 'R'):
                out.append(sh(b, dz=3))
            elif p == 'Arm R':
                out.append(sh(b, dz=2))
            elif is_left_leg(b) or is_left_foot(b):
                out.append(sh(b, dz=2))
            else:
                out.append(b)
        else:
            out.append(b)
    if kind == 'scout':
        out.append(box([13, 7, 19], [13, 7, 19], YEL, 'Flash'))
    if kind == 'boss':
        out.append(box([17, 5, 16], [18, 5, 16], YEL, 'Flash'))
    return out

def attack_hover(base):
    out = [sh(b, dz=1) for b in base]
    out.append(box([9, 2, 9], [10, 2, 13], CY, 'Beam'))
    out.append(box([9, 2, 14], [10, 2, 14], '#9af2ff', 'Beam'))
    return out

ACTORS = [
    ('mech_light_scout', SCOUT, [CY], 'scout', '#1d3566', '#9aa2ad'),
    ('mech_red_raider', RAIDER, [CY], 'raider', '#8a2a20', '#5e1d16'),
    ('mech_heavy_brute', BRUTE, [CY], 'brute', '#8a2a20', '#5e1d16'),
    ('mech_small_drone', DRONE, [CY], 'hover', '#8a2a20', '#5e1d16'),
    ('mech_boss', BOSS, [CY, OR], 'boss', '#8a2a20', '#5e1d16'),
]

if __name__ == '__main__':
    models = []
    for name, base, glows, kind, md, hd in ACTORS:
        if kind == 'hover':
            wa = hover_bob(base, 1)
            wb = hover_bob(base, -1)
            atk = attack_hover(base)
            dmg = damaged(base, hover=True)
        else:
            wa = walk_a(base)
            wb = walk_b(base)
            atk = attack_biped(base, kind)
            dmg = damaged(base)
        models.append((f'{name}_walk_a', glows, wa))
        models.append((f'{name}_walk_b', glows, wb))
        models.append((f'{name}_attack', glows, atk))
        models.append((f'{name}_damaged', [], dmg))
        models.append((f'{name}_destroyed', [], destroyed(md, hd)))
    run_all('/home/hatch/workspace/scrap-dungeon/sprites/anim', models)
    print('SCRAP DUNGEON ANIM DONE')
