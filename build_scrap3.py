"""Scrap Dungeon batch 3: FX (12) + items (11) from the roster sheet
(templates/refs/sheet-iron-eden-full-roster.png).

FX are small bright voxel effects; items are readable props. Same
resilient runner as batches 1-2 (never closes the doc) and the same
4-file output pattern. ENERGY_CELL is skipped on purpose: batch 1
already has prop_energy_cell (cyan canister), same design.
"""
import sys
sys.path.insert(0, '/home/hatch/workspace/model-sprites/work')
sys.path.insert(0, '/home/hatch/workspace/scrap-dungeon')
from mcp_drive import box
from build_scrap1 import run_all

DKG = '#26292f'; DK = '#22262b'; MT = '#3a4148'; MT2 = '#2a3036'
ST = '#8a939e'; W = '#dde3ea'; CY = '#35e0ff'; CYL = '#9af2ff'
OR = '#ff7a1a'; YEL = '#ffd23f'; RED = '#e5382a'; RDK = '#7e231c'
GRN = '#3fd05a'; PUR = '#a04ad8'; PURL = '#d8a0ff'; GOLD = '#d8a820'
BLU = '#2a4a8a'; BRN = '#a34a2a'; PARCH = '#d8c9a0'; PARCH2 = '#b8a078'

def shape(kind, f, t, c, part='Prop'):
    return ('model_shape', {'shape': kind, 'from': f, 'to': t, 'colour': c, 'part': part})

FX = [
    ('fx_explosion', [OR, YEL], [
        shape('ball', [7, 3, 7], [10, 6, 10], OR, 'Core'),
        box([8, 7, 8], [9, 7, 9], YEL, 'Flame'),
        box([8, 2, 8], [9, 2, 9], YEL, 'Flame'),
        box([5, 4, 8], [5, 4, 9], RED, 'Lick'), box([11, 4, 8], [11, 4, 9], RED, 'Lick'),
        box([8, 4, 5], [9, 4, 5], RED, 'Lick'), box([8, 4, 11], [9, 4, 11], RED, 'Lick'),
        box([6, 6, 6], [6, 6, 6], YEL, 'Spark'), box([11, 6, 11], [11, 6, 11], YEL, 'Spark'),
        box([6, 2, 11], [6, 2, 11], YEL, 'Spark'), box([11, 2, 6], [11, 2, 6], YEL, 'Spark')]),
    ('fx_energy_burst', [CY], [
        shape('ball', [8, 3, 8], [11, 6, 11], CYL, 'Core'),
        box([9, 7, 9], [10, 7, 10], CY, 'Spike'), box([9, 1, 9], [10, 1, 10], CY, 'Spike'),
        box([6, 4, 9], [6, 4, 10], CY, 'Spike'), box([13, 4, 9], [13, 4, 10], CY, 'Spike'),
        box([9, 4, 6], [10, 4, 6], CY, 'Spike'), box([9, 4, 13], [10, 4, 13], CY, 'Spike'),
        box([7, 7, 7], [7, 7, 7], CYL, 'Tip'), box([12, 7, 12], [12, 7, 12], CYL, 'Tip')]),
    ('fx_laser_beam', [CY], [
        box([2, 5, 8], [17, 5, 9], CY, 'Beam'),
        box([2, 6, 8], [17, 6, 9], CY, 'Beam'),
        box([4, 5, 8], [15, 6, 9], CYL, 'Core'),
        box([1, 5, 8], [1, 6, 9], CYL, 'Tip'), box([18, 5, 8], [18, 6, 9], CYL, 'Tip')]),
    ('fx_missile', [CY], [
        box([8, 2, 8], [11, 7, 11], MT, 'Body'),
        box([9, 8, 9], [10, 8, 10], RED, 'Nose'),
        box([9, 9, 9], [10, 9, 10], RED, 'Nose'),
        box([7, 2, 8], [7, 4, 8], DKG, 'Fin'), box([12, 2, 8], [12, 4, 8], DKG, 'Fin'),
        box([7, 2, 11], [7, 4, 11], DKG, 'Fin'), box([12, 2, 11], [12, 4, 11], DKG, 'Fin'),
        box([9, 0, 9], [10, 0, 10], OR, 'Flame'), box([9, 1, 9], [10, 1, 10], YEL, 'Flame'),
        box([9, 4, 12], [10, 4, 12], CY, 'Window')]),
    ('fx_smoke', [], [
        shape('ball', [7, 1, 7], [10, 4, 10], ST, 'Puff'),
        shape('ball', [9, 4, 8], [12, 7, 11], MT, 'Puff'),
        shape('ball', [5, 4, 6], [8, 7, 9], ST, 'Puff'),
        box([10, 8, 9], [11, 8, 10], MT2, 'Wisp'), box([6, 8, 7], [7, 8, 8], MT2, 'Wisp')]),
    ('fx_shield', [CY], [
        shape('ball', [7, 2, 7], [12, 7, 12], CYL, 'Dome'),
        box([5, 1, 5], [14, 1, 14], ST, 'Ring'),
        box([5, 0, 5], [14, 0, 14], MT2, 'Ring'),
        box([9, 8, 9], [10, 8, 10], CY, 'Peak'),
        box([7, 2, 13], [7, 2, 13], CY, 'Glow'), box([12, 2, 13], [12, 2, 13], CY, 'Glow')]),
    ('fx_heal', [GRN], [
        box([9, 1, 8], [10, 8, 9], GRN, 'Cross'),
        box([7, 3, 8], [12, 4, 9], GRN, 'Cross'),
        box([9, 9, 8], [10, 9, 9], '#a0ffb0', 'Tip'),
        box([6, 3, 8], [6, 3, 8], '#a0ffb0', 'Tip'), box([13, 3, 8], [13, 3, 8], '#a0ffb0', 'Tip'),
        box([9, 0, 8], [10, 0, 9], '#1f7a30', 'Base')]),
    ('fx_spark', [CY, YEL], [
        box([9, 4, 8], [10, 4, 11], CY, 'Bolt'),
        box([7, 4, 9], [12, 4, 10], YEL, 'Bolt'),
        box([9, 2, 9], [10, 6, 10], CYL, 'Core'),
        box([8, 6, 9], [8, 6, 9], YEL, 'Tip'), box([11, 2, 9], [11, 2, 9], YEL, 'Tip')]),
    ('fx_blood', [], [
        box([6, 0, 6], [13, 0, 13], RDK, 'Pool'),
        box([8, 0, 8], [11, 0, 11], RED, 'Pool'),
        box([5, 0, 9], [5, 0, 9], RED, 'Drop'), box([14, 0, 8], [14, 0, 8], RED, 'Drop'),
        box([9, 0, 14], [9, 0, 14], RED, 'Drop'), box([10, 0, 5], [10, 0, 5], RED, 'Drop'),
        box([7, 1, 9], [7, 1, 9], RED, 'Drop')]),
    ('fx_teleport', [PUR, CY], [
        box([5, 1, 5], [14, 1, 14], PUR, 'Ring'),
        box([6, 3, 6], [13, 3, 13], PURL, 'Ring'),
        box([7, 5, 7], [12, 5, 12], PUR, 'Ring'),
        box([9, 2, 9], [10, 6, 10], CYL, 'Column'),
        box([9, 7, 9], [10, 7, 10], CY, 'Peak'),
        box([5, 0, 5], [5, 0, 5], PURL, 'Node'), box([14, 0, 5], [14, 0, 5], PURL, 'Node'),
        box([5, 0, 14], [5, 0, 14], PURL, 'Node'), box([14, 0, 14], [14, 0, 14], PURL, 'Node')]),
    ('fx_debris', [], [
        box([5, 0, 5], [7, 1, 7], MT, 'Chunk'), box([11, 0, 10], [13, 1, 12], ST, 'Chunk'),
        box([8, 0, 12], [9, 1, 13], DKG, 'Chunk'), box([12, 0, 5], [13, 0, 6], MT2, 'Chunk'),
        box([6, 0, 11], [7, 0, 12], '#6b4a2f', 'Chunk'),
        box([10, 2, 8], [11, 2, 9], ST, 'Shard'), box([7, 2, 10], [7, 2, 10], CY, 'Shard')]),
    ('fx_impact', [YEL, OR], [
        box([9, 0, 9], [10, 1, 10], YEL, 'Core'),
        box([9, 0, 6], [10, 0, 7], OR, 'Spike'), box([9, 0, 12], [10, 0, 13], OR, 'Spike'),
        box([6, 0, 9], [7, 0, 10], OR, 'Spike'), box([12, 0, 9], [13, 0, 10], OR, 'Spike'),
        box([7, 0, 7], [7, 0, 7], YEL, 'Tip'), box([12, 0, 12], [12, 0, 12], YEL, 'Tip'),
        box([7, 0, 12], [7, 0, 12], YEL, 'Tip'), box([12, 0, 7], [12, 0, 7], YEL, 'Tip')]),
]

ITEMS = [
    ('item_health_pack', [], [
        box([6, 0, 6], [13, 5, 12], RED, 'Box'),
        box([6, 6, 6], [13, 6, 12], RDK, 'Lid'),
        box([9, 1, 13], [10, 4, 13], W, 'Cross'),
        box([8, 2, 13], [11, 3, 13], W, 'Cross'),
        box([8, 0, 8], [11, 0, 10], RDK, 'Base')]),
    ('item_ammo_crate', [CY], [
        box([5, 0, 5], [14, 4, 14], BLU, 'Crate'),
        box([5, 5, 5], [14, 5, 14], MT, 'Lid'),
        box([5, 2, 5], [14, 2, 14], ST, 'Band'),
        box([9, 2, 15], [10, 2, 15], CY, 'Light'),
        box([5, 0, 5], [5, 0, 5], ST, 'Corner'), box([14, 0, 14], [14, 0, 14], ST, 'Corner')]),
    ('item_key', [GOLD], [
        box([9, 0, 8], [10, 8, 9], GOLD, 'Shaft'),
        box([8, 12, 8], [11, 12, 9], GOLD, 'Bow'),
        box([8, 9, 8], [8, 11, 9], GOLD, 'Bow'), box([11, 9, 8], [11, 11, 9], GOLD, 'Bow'),
        box([8, 9, 8], [11, 9, 9], GOLD, 'Bow'),
        box([10, 1, 8], [11, 1, 8], GOLD, 'Tooth'), box([10, 3, 8], [11, 3, 8], GOLD, 'Tooth')]),
    ('item_credits', [GOLD], [
        box([6, 0, 6], [9, 1, 9], GOLD, 'Coins'),
        box([10, 0, 10], [13, 1, 13], GOLD, 'Coins'),
        box([7, 2, 7], [10, 3, 10], GOLD, 'Coins'),
        box([8, 4, 8], [8, 4, 8], '#ffedb0', 'Glint'), box([11, 2, 11], [11, 2, 11], '#ffedb0', 'Glint')]),
    ('item_data_chip', [CY], [
        box([6, 0, 6], [13, 1, 13], DKG, 'Chip'),
        box([7, 2, 7], [12, 2, 12], MT, 'Die'),
        box([8, 3, 8], [8, 3, 12], CY, 'Trace'), box([10, 3, 8], [10, 3, 12], CY, 'Trace'),
        box([5, 0, 8], [5, 0, 8], ST, 'Pin'), box([14, 0, 8], [14, 0, 8], ST, 'Pin'),
        box([5, 0, 11], [5, 0, 11], ST, 'Pin'), box([14, 0, 11], [14, 0, 11], ST, 'Pin')]),
    ('item_food', [], [
        box([6, 0, 6], [13, 3, 12], RED, 'Pack'),
        box([6, 1, 6], [13, 1, 12], W, 'Band'),
        box([6, 4, 6], [13, 4, 12], RDK, 'Top'),
        box([9, 2, 13], [10, 2, 13], '#ffd23f', 'Label')]),
    ('item_book', [], [
        box([6, 0, 6], [7, 5, 11], DKG, 'Spine'),
        box([8, 0, 6], [12, 5, 11], BLU, 'Cover'),
        box([13, 1, 7], [13, 4, 10], W, 'Pages'),
        box([8, 2, 12], [12, 2, 12], GOLD, 'Band'),
        box([9, 5, 8], [9, 6, 8], RED, 'Mark')]),
    ('item_scroll', [], [
        box([5, 2, 7], [14, 3, 10], PARCH, 'Roll'),
        box([4, 1, 6], [5, 4, 11], PARCH2, 'End'), box([14, 1, 6], [15, 4, 11], PARCH2, 'End'),
        box([9, 4, 8], [10, 4, 9], RED, 'Seal'),
        box([6, 2, 7], [6, 3, 7], '#efe4c0', 'Edge'), box([13, 2, 10], [13, 3, 10], '#efe4c0', 'Edge')]),
    ('item_gem', [PUR], [
        box([7, 0, 7], [12, 3, 12], PUR, 'Base'),
        box([8, 4, 8], [11, 6, 11], PUR, 'Mid'),
        box([9, 7, 9], [10, 9, 10], PURL, 'Tip'),
        box([9, 1, 13], [10, 2, 13], PURL, 'Facet'), box([6, 1, 9], [6, 2, 10], PURL, 'Facet')]),
    ('item_toolkit', [CY], [
        box([5, 0, 5], [14, 4, 13], MT, 'Box'),
        box([5, 5, 5], [14, 5, 13], ST, 'Lid'),
        box([8, 6, 7], [11, 6, 11], DKG, 'Handle'),
        box([9, 2, 14], [10, 2, 14], CY, 'Light'),
        box([5, 2, 5], [5, 2, 5], RED, 'Latch'), box([14, 2, 5], [14, 2, 5], RED, 'Latch')]),
    ('item_misc', [CY], [
        box([8, 2, 8], [11, 5, 11], ST, 'Hub'),
        box([9, 2, 5], [10, 5, 6], ST, 'Tooth'), box([9, 2, 13], [10, 5, 14], ST, 'Tooth'),
        box([5, 2, 9], [6, 5, 10], ST, 'Tooth'), box([13, 2, 9], [14, 5, 10], ST, 'Tooth'),
        box([9, 3, 9], [10, 4, 10], CY, 'Core')]),
]

if __name__ == '__main__':
    run_all('/home/hatch/workspace/scrap-dungeon/sprites/fx', FX)
    run_all('/home/hatch/workspace/scrap-dungeon/sprites/items', ITEMS)
    print('SCRAP DUNGEON BATCH 3 DONE')
