"""Scrap Dungeon batch 1: dungeon essentials, matched to the workflow-set templates.

Templates (image-generated first, per the standing rule):
  templates/media-generation-scrap-dungeon-props-template-*.webp
  templates/media-generation-scrap-dungeon-boss-template-*.webp
Patterns reused from build_wtiles.py / build_wmechs.py / build_wweapons.py.
Output: ~/workspace/scrap-dungeon/sprites/{tiles,props,mechs}/
Each model: <name>.glb + <name>_model.pxl + <name>_sheet.png (8 dirs) + <name>_sprites.pxl
"""
import sys; sys.path.insert(0, '/home/hatch/workspace/model-sprites/work')
from mcp_drive import Drive, build_static
from mcp_drive import box

def run_all(root, models):
    """Same as wrun.run_all, except a failed model never closes the doc:
    close_document poisons every later new_model ('No sprite is open')."""
    d = Drive()
    failed = []
    for name, glows, shapes in models:
        try:
            build_static(d, root, name, shapes, glows)
        except Exception as e:
            failed.append((name, str(e)[:200]))
            print('  FAILED', name, e, flush=True)
            try:
                d.call('save_document', {'path': f'{root}/{name}_partial.pxl'})
            except Exception:
                pass
    print('FAILED:', failed)
    d.close()

MT = '#3a4148'; MT2 = '#2a3036'; ST = '#777777'; ST2 = '#555555'
DT2 = '#4a3220'; DK = '#22262b'; DKG = '#26292f'; CY = '#35e0ff'
RD = '#c8352a'; RDK = '#7e231c'; RUST = '#7a4a2a'; WD = '#8a6a3f'
GOLD = '#d8a820'; HAZ = '#d8c020'; GRN = '#39ff7a'; BLU = '#2a4a8a'
OR = '#ff7a1a'; ROCK = '#5a5a5a'

def shape(kind, f, t, c, part='Prop'):
    return ('model_shape', {'shape': kind, 'from': f, 'to': t, 'colour': c, 'part': part})

def thick(top, side, extra=()):
    s = [box([2, 0, 2], [17, 1, 17], side, 'Base'), box([2, 2, 2], [17, 2, 17], top, 'Top')]
    s += list(extra)
    return s

TILES = [
    ('tile_stairs_down', [CY], thick(MT, MT2, [
        box([5, 3, 4], [14, 6, 6], ST, 'Step'), box([5, 3, 7], [14, 5, 9], ST, 'Step'),
        box([5, 3, 10], [14, 4, 12], ST, 'Step'), box([5, 3, 13], [14, 3, 15], ST, 'Step'),
        box([5, 7, 4], [14, 7, 4], CY, 'Edge'), box([5, 6, 7], [14, 6, 7], CY, 'Edge'),
        box([5, 5, 10], [14, 5, 10], CY, 'Edge'), box([5, 4, 13], [14, 4, 13], CY, 'Edge'),
        box([4, 3, 4], [4, 8, 4], RUST, 'Rail'), box([15, 3, 4], [15, 8, 4], RUST, 'Rail'),
        box([4, 7, 7], [4, 7, 7], RUST, 'Rail'), box([15, 7, 7], [15, 7, 7], RUST, 'Rail'),
        box([4, 5, 10], [4, 5, 10], RUST, 'Rail'), box([15, 5, 10], [15, 5, 10], RUST, 'Rail')])),
    ('tile_chest', [CY], thick(ST2, DT2, [
        box([6, 3, 6], [13, 7, 13], BLU, 'Body'), box([6, 8, 6], [13, 9, 13], '#1a3570', 'Lid'),
        box([6, 3, 6], [6, 7, 6], GOLD, 'Band'), box([13, 3, 6], [13, 7, 6], GOLD, 'Band'),
        box([6, 8, 6], [6, 9, 6], GOLD, 'Band'), box([13, 8, 6], [13, 9, 6], GOLD, 'Band'),
        box([9, 4, 14], [10, 6, 14], CY, 'Lock'), box([9, 3, 6], [10, 3, 6], GOLD, 'Trim'),
        box([9, 9, 6], [10, 9, 6], GOLD, 'Trim')])),
    ('tile_spike_trap', [], thick('#7a2a20', MT2, [
        box([2, 3, 2], [17, 3, 2], HAZ, 'Hazard'), box([2, 3, 17], [17, 3, 17], HAZ, 'Hazard'),
        box([2, 3, 2], [2, 3, 17], HAZ, 'Hazard'), box([17, 3, 2], [17, 3, 17], HAZ, 'Hazard'),
        shape('cone', [4, 3, 4], [6, 7, 6], '#8a8a8a', 'Spike'),
        shape('cone', [8, 3, 4], [10, 7, 6], '#8a8a8a', 'Spike'),
        shape('cone', [12, 3, 4], [14, 7, 6], '#8a8a8a', 'Spike'),
        shape('cone', [4, 3, 8], [6, 7, 10], '#8a8a8a', 'Spike'),
        shape('cone', [8, 3, 8], [10, 8, 10], '#9a9a9a', 'Spike'),
        shape('cone', [12, 3, 8], [14, 7, 10], '#8a8a8a', 'Spike'),
        shape('cone', [4, 3, 12], [6, 7, 14], '#8a8a8a', 'Spike'),
        shape('cone', [8, 3, 12], [10, 7, 14], '#8a8a8a', 'Spike'),
        shape('cone', [12, 3, 12], [14, 7, 14], '#8a8a8a', 'Spike')])),
    ('tile_barrel', [], thick(ST2, DT2, [
        box([7, 3, 7], [12, 8, 12], RUST, 'Barrel'),
        box([7, 4, 7], [12, 4, 12], ST, 'Band'), box([7, 7, 7], [12, 7, 12], ST, 'Band'),
        box([7, 5, 7], [12, 5, 12], HAZ, 'Hazard'), box([8, 5, 13], [8, 5, 13], DK, 'Hazard'),
        box([11, 5, 13], [11, 5, 13], DK, 'Hazard'), box([8, 9, 8], [11, 9, 11], '#5a3420', 'Top')])),
]

PROPS = [
    ('prop_salvage', [CY], [
        box([5, 0, 5], [14, 1, 14], DK, 'Plate'), box([6, 2, 6], [9, 3, 9], MT, 'Hull'),
        box([10, 2, 10], [13, 3, 12], RUST, 'Hull'), box([7, 4, 7], [7, 4, 7], CY, 'Glint'),
        box([11, 4, 11], [11, 4, 11], CY, 'Glint'), box([9, 4, 8], [9, 4, 8], OR, 'Glint'),
        box([8, 2, 11], [10, 2, 11], ST, 'Plate'), box([12, 2, 6], [12, 3, 6], ST, 'Shard')]),
    ('prop_health_cell', [GRN], [
        box([8, 0, 8], [11, 1, 11], DK, 'Base'), box([8, 1, 8], [11, 8, 11], BLU, 'Body'),
        box([9, 3, 12], [10, 6, 12], GRN, 'Core'), box([8, 9, 8], [11, 10, 11], ST, 'Cap'),
        box([8, 2, 7], [8, 2, 7], GRN, 'Light'), box([11, 2, 7], [11, 2, 7], GRN, 'Light'),
        box([8, 8, 12], [8, 8, 12], GRN, 'Light'), box([11, 8, 12], [11, 8, 12], GRN, 'Light')]),
    ('prop_energy_cell', [CY], [
        box([8, 0, 8], [11, 1, 11], DK, 'Base'), box([8, 1, 8], [11, 8, 11], BLU, 'Body'),
        box([9, 3, 12], [10, 6, 12], CY, 'Core'), box([8, 9, 8], [11, 10, 11], ST, 'Cap'),
        box([8, 2, 7], [8, 2, 7], CY, 'Light'), box([11, 2, 7], [11, 2, 7], CY, 'Light'),
        box([8, 8, 12], [8, 8, 12], CY, 'Light'), box([11, 8, 12], [11, 8, 12], CY, 'Light')]),
]

MECHS = [
    ('mech_boss', [CY, OR], [
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
        box([7, 16, 8], [7, 16, 8], DKG, 'Horn'), box([12, 16, 8], [12, 16, 8], DKG, 'Horn')]),
]

if __name__ == '__main__':
    run_all('/home/hatch/workspace/scrap-dungeon/sprites/tiles', TILES)
    run_all('/home/hatch/workspace/scrap-dungeon/sprites/props', PROPS)
    run_all('/home/hatch/workspace/scrap-dungeon/sprites/mechs', MECHS)
    print('SCRAP DUNGEON BATCH 1 DONE')
