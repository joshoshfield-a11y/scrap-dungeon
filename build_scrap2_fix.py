"""Batch 2 fix pass (from QC grid review 2026-10-26):
- mech_shielder: the shield's cyan stripe did not read from the front.
  Added a cyan emblem plate on the shield's front face + cyan top edge.
- mech_bomber: the bomb bay / hazard stripe read weakly from the front.
  Enlarged the bay to full belly width.
Everything else from batch 2 passed QC unchanged. Rebuilds overwrite
the same filenames (fix pass, not new versions).
"""
import sys
sys.path.insert(0, '/home/hatch/workspace/model-sprites/work')
sys.path.insert(0, '/home/hatch/workspace/scrap-dungeon')
from mcp_drive import box
from build_scrap1 import run_all

RD = '#c8352a'; RDK = '#7e231c'; DKG = '#26292f'; DK = '#22262b'
CY = '#35e0ff'; OR = '#ff7a1a'; HAZ = '#d8c020'
MT2 = '#2a3036'; ST = '#8a939e'

def shape(kind, f, t, c, part='Prop'):
    return ('model_shape', {'shape': kind, 'from': f, 'to': t, 'colour': c, 'part': part})

FIXES = [
    ('mech_shielder', [CY], [
        box([5, 0, 6], [8, 0, 12], DKG, 'Feet'), box([11, 0, 6], [14, 0, 12], DKG, 'Feet'),
        box([6, 1, 7], [8, 5, 11], RD, 'Leg L'), box([11, 1, 7], [13, 5, 11], RD, 'Leg R'),
        box([7, 3, 12], [7, 3, 12], ST, 'Knee'), box([12, 3, 12], [12, 3, 12], ST, 'Knee'),
        box([5, 6, 7], [14, 10, 12], RD, 'Torso'),
        box([8, 7, 13], [11, 9, 13], RDK, 'Chest'), box([9, 8, 13], [10, 8, 13], CY, 'Core'),
        box([4, 10, 7], [6, 12, 11], RDK, 'Pauldron L'), box([13, 10, 7], [15, 12, 11], RDK, 'Pauldron R'),
        box([5, 13, 8], [5, 13, 8], DKG, 'Spike'), box([14, 13, 8], [14, 13, 8], DKG, 'Spike'),
        box([2, 4, 6], [3, 12, 13], ST, 'Shield'),
        box([2, 13, 6], [3, 13, 13], MT2, 'Shield'),
        box([2, 7, 9], [2, 10, 10], CY, 'Shield'),
        box([2, 7, 14], [3, 10, 14], CY, 'Emblem'),
        box([2, 12, 14], [3, 12, 14], CY, 'Emblem'),
        box([15, 6, 8], [16, 10, 11], RD, 'Arm R'), box([15, 4, 7], [16, 6, 12], RD, 'Fist R'),
        box([8, 11, 8], [11, 12, 11], RDK, 'Head'), box([9, 12, 12], [10, 12, 12], CY, 'Visor'),
        box([9, 13, 9], [10, 13, 9], DKG, 'Crest')]),
    ('mech_bomber', [CY, OR], [
        box([6, 0, 6], [8, 0, 12], DKG, 'Feet'), box([11, 0, 6], [13, 0, 12], DKG, 'Feet'),
        box([6, 1, 7], [8, 3, 11], RD, 'Leg L'), box([11, 1, 7], [13, 3, 11], RD, 'Leg R'),
        box([5, 4, 6], [14, 9, 12], RD, 'Body'), box([7, 5, 13], [12, 8, 13], RDK, 'Belly'),
        box([7, 5, 13], [12, 7, 13], DK, 'Bay'), box([7, 8, 13], [12, 8, 13], HAZ, 'Bay'),
        box([9, 9, 13], [10, 9, 13], OR, 'Core'),
        box([4, 5, 8], [5, 8, 11], RD, 'Arm L'), box([14, 5, 8], [15, 8, 11], RD, 'Arm R'),
        shape('ball', [5, 9, 8], [7, 11, 10], DKG, 'Bomb'),
        shape('ball', [12, 9, 8], [14, 11, 10], DKG, 'Bomb'),
        box([6, 12, 9], [6, 12, 9], OR, 'Fuse'), box([13, 12, 9], [13, 12, 9], OR, 'Fuse'),
        box([8, 10, 8], [11, 11, 11], RDK, 'Head'), box([9, 11, 12], [10, 11, 12], CY, 'Visor'),
        box([8, 5, 5], [11, 8, 5], ST, 'Tank')]),
]

if __name__ == '__main__':
    run_all('/home/hatch/workspace/scrap-dungeon/sprites/enemies', FIXES)
    print('SCRAP DUNGEON BATCH 2 FIX DONE')
