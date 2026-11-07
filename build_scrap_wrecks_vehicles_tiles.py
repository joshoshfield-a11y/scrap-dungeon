"""Scrap Dungeon — wrecks for the 9 new rigs, the 6 roster vehicles, and
the missing map tiles for coherent procedural (pixel-dungeon style)
maps. One process, three run_all calls, same proven pattern as
build_scrap1.py (a failed model never closes the doc).

WRECKS (sprites/anim/, <model>_destroyed, matching the existing anim
naming): the same wreck-pile template as build_scrap_anim.py's
destroyed() — dark slab, faction-tinted core, dark head chunk, ember —
plus ONE signature chunk per model so a wreck stays recognisable
(tank turret, spider leg stubs, turret dome ball, flyer rotor blade,
artillery barrels, shielder shield plate, sniper rifle, bomber bombs,
assault shield + gun). No glow: a wreck is dead, only the ember stays.

VEHICLES (sprites/vehicles/, roster sheet bottom row, blue faction):
hoverbike, hovertank, transport, airship, drone_carrier, lander.
Whole-sprite movers, not characters — no skeletal rigs.

MAP TILES (sprites/tiles/): door, grate, lava, debris, metal_wall,
stone_wall. These close the procedural-map kit (see MAPS.md): with the
existing floors/walls/props/structures, a seeded generator can now
fill rooms, corridors, doors, hazards, and dressing for every theme
without reusing a prop as a wall or a floor as a door.
"""
import sys
sys.path.insert(0, '/home/hatch/workspace/model-sprites/work')
sys.path.insert(0, '/home/hatch/workspace/scrap-dungeon')
from mcp_drive import box
from build_scrap1 import run_all

PB = '#2f5fd0'; PL = '#5a8cff'; W = '#dde3ea'; DK = '#23262c'; DKG = '#26292f'
CY = '#35e0ff'; RD = '#c8352a'; RDK = '#7e231c'; ST = '#8a939e'; ST2 = '#555555'
MT = '#3a4148'; MT2 = '#2a3036'; OR = '#ff7a1a'; EMB = '#5a1a10'
BLU_D = '#1d3566'; WHT_D = '#9aa2ad'; RED_D = '#8a2a20'; RED_HD = '#5e1d16'
ROCK = '#5a5a5a'; MOSS = '#3a7a3a'; LAVA_D = '#7a2a10'

def shape(kind, f, t, c, part='Prop'):
    return ('model_shape', {'shape': kind, 'from': f, 'to': t, 'colour': c, 'part': part})

def thick(top, side, extra=()):
    s = [box([2, 0, 2], [17, 1, 17], side, 'Base'), box([2, 2, 2], [17, 2, 17], top, 'Top')]
    s += list(extra)
    return s

def wreck(md, hd, chunk):
    return [
        box([4, 0, 5], [15, 1, 12], DKG, 'Wreck'),
        box([6, 1, 6], [12, 2, 11], md, 'Wreck'),
        box([14, 1, 7], [16, 2, 9], hd, 'Wreck'),
        box([2, 1, 8], [4, 2, 10], md, 'Wreck'),
        box([12, 1, 13], [15, 1, 14], DKG, 'Wreck'),
        box([8, 1, 13], [8, 1, 13], EMB, 'Ember'),
    ] + chunk

WRECKS = [
    ('mech_heavy_assault_destroyed', [], wreck(BLU_D, WHT_D, [
        box([2, 2, 6], [3, 5, 10], BLU_D, 'Shield'),
        box([13, 2, 11], [13, 2, 16], DK, 'Gun')])),
    ('mech_artillery_destroyed', [], wreck(BLU_D, WHT_D, [
        box([5, 2, 11], [5, 2, 16], DK, 'Cannon'),
        box([14, 2, 11], [14, 2, 16], DK, 'Cannon')])),
    ('mech_tank_defender_destroyed', [], wreck(BLU_D, WHT_D, [
        box([8, 2, 7], [11, 3, 10], BLU_D, 'Turret'),
        box([9, 3, 11], [10, 3, 15], DK, 'Gun')])),
    ('mech_spider_walker_destroyed', [], wreck(RED_D, RED_HD, [
        box([3, 2, 9], [5, 2, 10], RED_HD, 'Leg'),
        box([14, 2, 9], [16, 2, 10], RED_HD, 'Leg'),
        box([3, 2, 6], [5, 2, 7], RED_HD, 'Leg')])),
    ('mech_turret_light_destroyed', [], wreck(RED_D, RED_HD, [
        shape('ball', [8, 2, 8], [11, 4, 11], RED_HD, 'Dome'),
        box([8, 2, 12], [8, 2, 15], ST2, 'Barrel')])),
    ('mech_flyer_destroyed', [], wreck(RED_D, RED_HD, [
        box([4, 2, 8], [7, 2, 10], DKG, 'Rotor'),
        box([12, 2, 8], [15, 2, 10], DKG, 'Rotor')])),
    ('mech_shielder_destroyed', [], wreck(RED_D, RED_HD, [
        box([2, 2, 6], [3, 6, 11], ST2, 'Shield'),
        box([2, 4, 9], [2, 4, 9], '#1a3a44', 'Emblem')])),
    ('mech_sniper_destroyed', [], wreck(RED_D, RED_HD, [
        box([13, 2, 11], [13, 2, 17], ST2, 'Rifle'),
        box([13, 3, 13], [13, 3, 14], DK, 'Scope')])),
    ('mech_bomber_destroyed', [], wreck(RED_D, RED_HD, [
        shape('ball', [5, 2, 8], [7, 4, 10], DKG, 'Bomb'),
        shape('ball', [12, 2, 8], [14, 4, 10], DKG, 'Bomb')])),
]

VEHICLES = [
    ('veh_hoverbike', [CY], [
        box([5, 0, 5], [7, 1, 12], DK, 'Pad'), box([12, 0, 5], [14, 1, 12], DK, 'Pad'),
        box([7, 2, 6], [12, 4, 11], PB, 'Body'), box([8, 4, 6], [11, 5, 8], DK, 'Seat'),
        box([8, 3, 12], [11, 4, 14], PL, 'Fairing'), box([7, 5, 11], [12, 5, 12], DK, 'Bar'),
        box([8, 2, 5], [11, 2, 5], CY, 'Thruster'), box([9, 3, 14], [10, 3, 14], CY, 'Light')]),
    ('veh_hovertank', [CY], [
        box([4, 0, 4], [15, 1, 15], DK, 'Skirt'), box([4, 1, 4], [15, 4, 15], PB, 'Hull'),
        box([6, 5, 6], [13, 5, 13], W, 'Deck'), box([8, 5, 7], [11, 7, 11], PB, 'Turret'),
        box([8, 8, 8], [11, 8, 10], W, 'Top'), box([9, 6, 12], [10, 6, 17], DK, 'Cannon'),
        box([9, 6, 17], [10, 6, 17], CY, 'Muzzle'), box([5, 4, 15], [5, 4, 15], CY, 'Light'),
        box([14, 4, 15], [14, 4, 15], CY, 'Light')]),
    ('veh_transport', [CY], [
        box([4, 0, 5], [4, 2, 7], DK, 'Wheel'), box([15, 0, 5], [15, 2, 7], DK, 'Wheel'),
        box([4, 0, 10], [4, 2, 12], DK, 'Wheel'), box([15, 0, 10], [15, 2, 12], DK, 'Wheel'),
        box([4, 2, 4], [15, 6, 11], ST, 'Cargo'), box([5, 3, 5], [14, 3, 5], ST2, 'Stripe'),
        box([4, 3, 12], [15, 7, 15], PB, 'Cab'), box([5, 5, 15], [14, 6, 15], W, 'Glass'),
        box([5, 3, 16], [5, 3, 16], CY, 'Light'), box([14, 3, 16], [14, 3, 16], CY, 'Light')]),
    ('veh_airship', [CY], [
        shape('ball', [4, 9, 3], [15, 12, 16], PB, 'Envelope'),
        box([6, 10, 4], [13, 10, 15], PL, 'Stripe'),
        box([8, 5, 7], [11, 7, 12], MT, 'Gondola'), box([8, 6, 12], [11, 6, 12], CY, 'Window'),
        box([7, 6, 4], [8, 6, 4], CY, 'Thruster'), box([11, 6, 4], [12, 6, 4], CY, 'Thruster'),
        box([9, 13, 4], [10, 14, 7], RD, 'Fin'), box([9, 13, 12], [10, 14, 15], RD, 'Fin')]),
    ('veh_drone_carrier', [CY], [
        box([3, 1, 3], [16, 4, 16], PB, 'Hull'), box([4, 5, 4], [15, 5, 15], DK, 'Deck'),
        box([5, 6, 5], [7, 7, 7], W, 'Drone'), box([12, 6, 5], [14, 7, 7], W, 'Drone'),
        box([6, 8, 6], [6, 8, 6], CY, 'Eye'), box([13, 8, 6], [13, 8, 6], CY, 'Eye'),
        box([8, 5, 13], [11, 8, 15], PB, 'Bridge'), box([9, 9, 14], [9, 12, 14], DK, 'Antenna'),
        box([9, 12, 14], [9, 12, 14], CY, 'Tip')]),
    ('veh_lander', [CY], [
        box([5, 0, 5], [6, 3, 6], DK, 'Leg'), box([13, 0, 5], [14, 3, 6], DK, 'Leg'),
        box([5, 0, 13], [6, 3, 14], DK, 'Leg'), box([13, 0, 13], [14, 3, 14], DK, 'Leg'),
        box([6, 3, 6], [13, 7, 13], ST, 'Hull'), box([7, 4, 8], [12, 5, 11], PB, 'Cargo'),
        box([8, 5, 14], [11, 7, 15], W, 'Cockpit'), box([7, 1, 7], [8, 1, 7], CY, 'Thruster'),
        box([11, 1, 7], [12, 1, 7], CY, 'Thruster'), box([9, 8, 9], [10, 10, 9], DK, 'Antenna')]),
]

MAPTILES = [
    ('tile_door', [CY], thick(MT, MT2, [
        box([4, 3, 5], [15, 10, 14], MT, 'Frame'), box([4, 11, 5], [15, 12, 14], MT2, 'Lintel'),
        box([7, 3, 15], [12, 9, 15], ST2, 'Panel'), box([7, 10, 15], [12, 10, 15], CY, 'Strip'),
        box([11, 5, 15], [11, 5, 15], CY, 'Handle'), box([7, 3, 15], [7, 9, 15], ST, 'Edge'),
        box([12, 3, 15], [12, 9, 15], ST, 'Edge')])),
    ('tile_grate', [], thick(MT, MT2, [
        box([4, 3, 4], [15, 3, 6], DK, 'Bar'), box([4, 3, 8], [15, 3, 10], DK, 'Bar'),
        box([4, 3, 12], [15, 3, 14], DK, 'Bar'), box([4, 3, 4], [6, 3, 14], DK, 'Bar'),
        box([13, 3, 4], [15, 3, 14], DK, 'Bar'), box([9, 3, 7], [10, 3, 7], ST, 'Bolt')])),
    ('tile_lava', [OR], thick('#3a2a20', MT2, [
        box([3, 3, 3], [16, 3, 16], OR, 'Lava'), box([5, 3, 5], [8, 3, 8], LAVA_D, 'Crust'),
        box([11, 3, 11], [14, 3, 14], LAVA_D, 'Crust'), box([11, 3, 5], [13, 3, 6], LAVA_D, 'Crust'),
        box([9, 3, 9], [10, 3, 10], '#ffb020', 'Bubble')])),
    ('tile_debris', [], thick(MT, MT2, [
        box([4, 3, 4], [7, 4, 7], ST, 'Rubble'), box([10, 3, 10], [13, 5, 12], MT2, 'Rubble'),
        box([5, 3, 11], [8, 3, 13], DK, 'Rubble'), box([12, 3, 5], [12, 4, 5], ST, 'Shard'),
        box([8, 3, 8], [9, 3, 9], ST2, 'Shard')])),
    ('tile_metal_wall', [CY], [
        box([2, 0, 2], [17, 1, 17], MT2, 'Base'), box([3, 2, 3], [16, 12, 16], MT, 'Wall'),
        box([5, 3, 17], [8, 11, 17], ST, 'Panel'), box([11, 3, 17], [14, 11, 17], ST, 'Panel'),
        box([5, 12, 17], [14, 12, 17], CY, 'Strip'), box([3, 2, 3], [16, 2, 16], MT2, 'Trim')]),
    ('tile_stone_wall', [], [
        box([2, 0, 2], [17, 1, 17], MT2, 'Base'), box([3, 2, 3], [16, 11, 16], ROCK, 'Wall'),
        box([5, 4, 17], [7, 6, 17], MOSS, 'Moss'), box([12, 7, 17], [14, 8, 17], MOSS, 'Moss'),
        box([10, 3, 17], [10, 8, 17], DK, 'Crack'), box([3, 12, 3], [16, 12, 16], ST2, 'Cap')]),
]

if __name__ == '__main__':
    run_all('/home/hatch/workspace/scrap-dungeon/sprites/anim', WRECKS)
    run_all('/home/hatch/workspace/scrap-dungeon/sprites/vehicles', VEHICLES)
    run_all('/home/hatch/workspace/scrap-dungeon/sprites/tiles', MAPTILES)
    print('SCRAP DUNGEON WRECKS + VEHICLES + MAP TILES DONE')
