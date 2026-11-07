"""Scrap Dungeon batch 2: roster expansion, built carefully from the
user-supplied reference sheets (templates/refs/, 2026-10-26).

Each model gets a full part list — feet, jointed legs, torso plate + trim,
pauldrons, arms, head with visor + crest, weapon, glow accents — instead
of the minimum silhouette. Enemies stay red/dark + cyan; structures stay
blue/white/metal + cyan. Same 4-file output pattern as batch 1.
Runner is the resilient one from build_scrap1 (never closes the doc).
"""
import sys
sys.path.insert(0, '/home/hatch/workspace/model-sprites/work')
sys.path.insert(0, '/home/hatch/workspace/scrap-dungeon')
from mcp_drive import box
from build_scrap1 import run_all

RD = '#c8352a'; RDK = '#7e231c'; DKG = '#26292f'; DK = '#22262b'
CY = '#35e0ff'; CYL = '#9af2ff'; OR = '#ff7a1a'; HAZ = '#d8c020'
MT = '#3a4148'; MT2 = '#2a3036'; ST = '#8a939e'; W = '#dde3ea'
BLU = '#2a4a8a'; WD = '#8a6a3f'

def shape(kind, f, t, c, part='Prop'):
    return ('model_shape', {'shape': kind, 'from': f, 'to': t, 'colour': c, 'part': part})

ENEMIES = [
    ('mech_turret_light', [CY], [
        box([5, 0, 5], [14, 0, 14], MT2, 'Base'),
        box([5, 1, 5], [5, 1, 5], HAZ, 'Bolt'), box([14, 1, 5], [14, 1, 5], HAZ, 'Bolt'),
        box([5, 1, 14], [5, 1, 14], HAZ, 'Bolt'), box([14, 1, 14], [14, 1, 14], HAZ, 'Bolt'),
        box([7, 1, 7], [12, 3, 12], MT, 'Pedestal'),
        box([7, 4, 7], [12, 4, 12], ST, 'Collar'),
        shape('ball', [8, 5, 8], [11, 8, 11], RD, 'Dome'),
        box([9, 6, 12], [10, 6, 12], CY, 'Eye'),
        box([8, 6, 12], [8, 6, 16], ST, 'Barrel'), box([11, 6, 12], [11, 6, 16], ST, 'Barrel'),
        box([8, 6, 17], [8, 6, 17], CY, 'Muzzle'), box([11, 6, 17], [11, 6, 17], CY, 'Muzzle'),
        box([7, 6, 9], [7, 6, 9], DKG, 'Vent'), box([12, 6, 9], [12, 6, 9], DKG, 'Vent'),
        box([9, 9, 9], [9, 11, 9], DK, 'Antenna'), box([9, 12, 9], [9, 12, 9], CY, 'Antenna')]),
    ('mech_flyer', [CY], [
        box([7, 6, 7], [12, 9, 12], RD, 'Hull'),
        box([9, 7, 13], [10, 7, 13], CY, 'Eye'),
        box([4, 10, 7], [7, 10, 11], DKG, 'Rotor'), box([12, 10, 7], [15, 10, 11], DKG, 'Rotor'),
        box([4, 10, 9], [4, 10, 9], CY, 'Rotor'), box([15, 10, 9], [15, 10, 9], CY, 'Rotor'),
        box([8, 5, 8], [8, 5, 8], CY, 'Thruster'), box([11, 5, 8], [11, 5, 8], CY, 'Thruster'),
        box([8, 5, 11], [8, 5, 11], CY, 'Thruster'), box([11, 5, 11], [11, 5, 11], CY, 'Thruster'),
        box([6, 7, 9], [6, 8, 10], RDK, 'Pod'), box([13, 7, 9], [13, 8, 10], RDK, 'Pod'),
        box([9, 10, 6], [10, 12, 6], DKG, 'Fin'),
        box([9, 5, 9], [10, 5, 10], DK, 'Gun'), box([9, 5, 13], [10, 5, 13], CY, 'Muzzle'),
        box([9, 10, 9], [9, 12, 9], DK, 'Antenna')]),
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
        box([15, 6, 8], [16, 10, 11], RD, 'Arm R'), box([15, 4, 7], [16, 6, 12], RD, 'Fist R'),
        box([8, 11, 8], [11, 12, 11], RDK, 'Head'), box([9, 12, 12], [10, 12, 12], CY, 'Visor'),
        box([9, 13, 9], [10, 13, 9], DKG, 'Crest')]),
    ('mech_sniper', [CY], [
        box([6, 0, 7], [8, 0, 11], DKG, 'Feet'), box([11, 0, 7], [13, 0, 11], DKG, 'Feet'),
        box([7, 1, 8], [8, 5, 10], RDK, 'Leg L'), box([11, 1, 8], [12, 5, 10], RDK, 'Leg R'),
        box([7, 6, 8], [12, 9, 11], RD, 'Torso'), box([9, 7, 12], [10, 8, 12], DKG, 'Vest'),
        box([6, 6, 8], [6, 9, 10], RD, 'Arm L'), box([13, 6, 8], [13, 9, 10], RD, 'Arm R'),
        box([13, 7, 11], [13, 7, 12], DK, 'Stock'),
        box([13, 7, 12], [13, 7, 18], ST, 'Rifle'), box([13, 7, 19], [13, 7, 19], CY, 'Muzzle'),
        box([13, 9, 13], [13, 9, 14], DK, 'Scope'), box([13, 9, 15], [13, 9, 15], CY, 'Scope'),
        box([8, 10, 8], [11, 11, 11], RDK, 'Head'), box([9, 11, 12], [10, 11, 12], CY, 'Visor'),
        box([8, 12, 8], [11, 12, 11], DKG, 'Hood'),
        box([8, 13, 9], [8, 15, 9], DK, 'Antenna'),
        box([8, 7, 6], [10, 9, 6], DKG, 'Pack')]),
    ('mech_bomber', [CY, OR], [
        box([6, 0, 6], [8, 0, 12], DKG, 'Feet'), box([11, 0, 6], [13, 0, 12], DKG, 'Feet'),
        box([6, 1, 7], [8, 3, 11], RD, 'Leg L'), box([11, 1, 7], [13, 3, 11], RD, 'Leg R'),
        box([5, 4, 6], [14, 9, 12], RD, 'Body'), box([7, 5, 13], [12, 8, 13], RDK, 'Belly'),
        box([8, 6, 13], [11, 7, 13], DK, 'Bay'), box([8, 8, 13], [11, 8, 13], HAZ, 'Bay'),
        box([9, 9, 13], [10, 9, 13], OR, 'Core'),
        box([4, 5, 8], [5, 8, 11], RD, 'Arm L'), box([14, 5, 8], [15, 8, 11], RD, 'Arm R'),
        shape('ball', [5, 9, 8], [7, 11, 10], DKG, 'Bomb'),
        shape('ball', [12, 9, 8], [14, 11, 10], DKG, 'Bomb'),
        box([6, 12, 9], [6, 12, 9], OR, 'Fuse'), box([13, 12, 9], [13, 12, 9], OR, 'Fuse'),
        box([8, 10, 8], [11, 11, 11], RDK, 'Head'), box([9, 11, 12], [10, 11, 12], CY, 'Visor'),
        box([8, 5, 5], [11, 8, 5], ST, 'Tank')]),
]

STRUCTURES = [
    ('struct_core_reactor', [CY], [
        box([4, 0, 4], [15, 1, 15], MT2, 'Base'),
        box([4, 2, 4], [15, 2, 4], CY, 'Trim'), box([4, 2, 15], [15, 2, 15], CY, 'Trim'),
        box([4, 2, 4], [4, 2, 15], CY, 'Trim'), box([15, 2, 4], [15, 2, 15], CY, 'Trim'),
        box([7, 2, 7], [12, 11, 12], BLU, 'Column'),
        box([9, 3, 13], [10, 9, 13], CY, 'Core'),
        box([6, 5, 9], [6, 8, 10], CY, 'Core'), box([13, 5, 9], [13, 8, 10], CY, 'Core'),
        box([5, 3, 8], [5, 9, 8], ST, 'Pipe'), box([14, 3, 8], [14, 9, 8], ST, 'Pipe'),
        box([5, 3, 11], [5, 9, 11], ST, 'Pipe'), box([14, 3, 11], [14, 9, 11], ST, 'Pipe'),
        box([6, 12, 6], [13, 12, 13], ST, 'Cap'),
        box([9, 13, 9], [10, 13, 9], DK, 'Antenna'), box([9, 14, 9], [9, 14, 9], CY, 'Antenna'),
        box([4, 1, 4], [4, 1, 4], HAZ, 'Foot'), box([15, 1, 4], [15, 1, 4], HAZ, 'Foot'),
        box([4, 1, 15], [4, 1, 15], HAZ, 'Foot'), box([15, 1, 15], [15, 1, 15], HAZ, 'Foot')]),
    ('struct_shield_generator', [CY], [
        box([5, 0, 5], [14, 1, 14], MT2, 'Base'), box([6, 2, 6], [13, 2, 13], MT, 'Deck'),
        box([5, 2, 5], [6, 5, 5], ST, 'Pylon'), box([13, 2, 5], [14, 5, 5], ST, 'Pylon'),
        box([5, 2, 14], [6, 5, 14], ST, 'Pylon'), box([13, 2, 14], [14, 5, 14], ST, 'Pylon'),
        box([5, 6, 5], [5, 6, 5], CY, 'Tip'), box([13, 6, 5], [13, 6, 5], CY, 'Tip'),
        box([5, 6, 14], [5, 6, 14], CY, 'Tip'), box([13, 6, 14], [13, 6, 14], CY, 'Tip'),
        box([9, 2, 9], [10, 3, 10], ST, 'Core'),
        shape('ball', [7, 3, 7], [12, 8, 12], CYL, 'Dome'),
        box([6, 2, 13], [13, 2, 13], CY, 'Trim')]),
    ('struct_supply_depot', [CY], [
        box([4, 0, 4], [15, 1, 15], MT2, 'Base'),
        box([5, 2, 5], [14, 7, 14], MT, 'Block'),
        box([6, 3, 15], [8, 6, 15], ST, 'Panel'), box([11, 3, 15], [13, 6, 15], ST, 'Panel'),
        box([5, 8, 15], [14, 8, 15], CY, 'Strip'),
        box([4, 8, 4], [15, 8, 15], ST, 'Roof'),
        box([5, 2, 5], [5, 2, 5], HAZ, 'Corner'), box([14, 2, 5], [14, 2, 5], HAZ, 'Corner'),
        box([5, 2, 14], [5, 2, 14], HAZ, 'Corner'), box([14, 2, 14], [14, 2, 14], HAZ, 'Corner'),
        box([7, 9, 7], [10, 11, 10], WD, 'Crate'), box([7, 12, 7], [10, 12, 10], '#6b4a2f', 'Lid'),
        box([4, 4, 8], [4, 5, 11], DKG, 'Vent'), box([15, 4, 8], [15, 5, 11], DKG, 'Vent'),
        box([9, 2, 15], [10, 6, 15], DK, 'Door'), box([9, 5, 15], [9, 5, 15], CY, 'Door')]),
]

if __name__ == '__main__':
    run_all('/home/hatch/workspace/scrap-dungeon/sprites/enemies', ENEMIES)
    run_all('/home/hatch/workspace/scrap-dungeon/sprites/structures', STRUCTURES)
    print('SCRAP DUNGEON BATCH 2 DONE')
