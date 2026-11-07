// Tile-coherence diagnosis (pre-fix): replicates the OLD render-time
// hash-scatter rules from game.js against real generated depth-1
// industrial floors, to quantify each circled class from the user's
// 2026-10-30 screenshots. Node only; writes no game state.
const C = require('../game/core.js');
function hash2(x, y, depth) { return ((x * 73856093) ^ (y * 19349663) ^ (depth * 83492791)) >>> 0; }
const FLOOR_V = ['vision_floor_plain','vision_floor_plain','vision_floor_plain','vision_floor_circuit','floor_dense_scrap','batch3_s2_floor_rusty_a','batch3_s2_floor_rusty_b','batch3_s2_floor_cracked_a','batch3_s2_floor_cracked_b','batch3_s2_floor_mesh','batch3_s2_floor_diamond','batch3_s2_floor_tiles_grey','batch3_s1_floor_grey_a','batch3_s1_floor_grey_b','batch3_s1_floor_grey_c'];
const WALL_V = ['vision_wall_top','vision_wall_top2','vision_wall_right','vision_wall_top','vision_wall_top2','wall','batch3_s2_wall_panel_a','batch3_s2_wall_panel_b','batch3_s2_wall_panel_c','batch3_s2_wall_panel_console','batch3_s2_wall_corner_a','batch3_s2_wall_corner_b','batch3_s2_wall_pipe_a','batch3_s2_wall_pipe_b','batch3_s2_wall_pipe_c','batch3_s2_wall_door_closed_a','batch3_s2_wall_door_closed_b','batch3_s2_wall_door_open_a','batch3_s2_wall_door_open_b','batch3_s2_wall_door_open_c','batch3_s2_wall_hole_cracked','batch3_s2_wall_hole_wires','batch3_s2_vent_slats','batch3_s2_vent_grid','batch3_s2_vent_grid_hole','batch3_s2_vent_hole_square','batch3_s1_panel_plain_a','batch3_s1_panel_pipes_a','batch3_s1_panel_console_a','batch3_s1_panel_vent'];
const DOOR_KEYS = WALL_V.filter(k => k.indexOf('wall_door') !== -1);
const DEBRIS_LV = ['debris','loot_gear','loot_key','loot_crate','loot_crystal','debris','batch3_s2_scrap_pile_a','batch3_s2_scrap_debris'];
let floors = 0, wallCells = 0, wallDoorCells = 0, floorCells = 0;
let roomVariantSum = 0, roomCount = 0, maxVariantsInRoom = 0;
let debrisCells = 0, fakePickupCells = 0, fakeKey = 0, fakeCrystal = 0;
let doorCells = 0, doorNoRecord = 0, lockedFloors = 0, lockedNoKey = 0, coherenceFail = 0;
for (let seed = 1; seed <= 200; seed++) {
  const f = C.generateFloor(seed, 1);
  floors++;
  const chk = C.coherenceCheck(f); if (!chk.ok) coherenceFail++;
  const rec = {}; (f.doors || []).forEach(d => { rec[d.x + ',' + d.y] = d; });
  f.grid.forEach((row, y) => row.forEach((t, x) => {
    if (t === 'wall') { wallCells++; if (DOOR_KEYS.indexOf(WALL_V[hash2(x, y, 1) % WALL_V.length]) !== -1) wallDoorCells++; }
    if (t === 'floor') floorCells++;
    if (t === 'door') { doorCells++; if (!rec[x + ',' + y]) doorNoRecord++; }
  }));
  f.rooms.forEach(r => {
    const vs = new Set();
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (f.grid[y][x] === 'floor' || f.grid[y][x] === 'stairs' || f.grid[y][x] === 'hazard') vs.add(FLOOR_V[hash2(x, y, 1) % FLOOR_V.length]);
    }
    roomVariantSum += vs.size; roomCount++; if (vs.size > maxVariantsInRoom) maxVariantsInRoom = vs.size;
  });
  (f.dressing || []).forEach(d => {
    if (d.kind === 'debris') {
      debrisCells++;
      const k = DEBRIS_LV[hash2(d.x, d.y, 1) % DEBRIS_LV.length];
      if (k === 'loot_key' || k === 'loot_crystal' || k === 'loot_gear' || k === 'loot_crate') fakePickupCells++;
      if (k === 'loot_key') fakeKey++;
      if (k === 'loot_crystal') fakeCrystal++;
    }
  });
  const locked = (f.doors || []).filter(d => d.state === 'locked');
  if (locked.length) { lockedFloors++; locked.forEach(d => { if (!(f.pickups || []).some(p => p.kind === 'key' && p.keyId === d.keyId)) lockedNoKey++; }); }
}
console.log(JSON.stringify({
  floors, coherenceFail, wallCells, wallDoorCells,
  wallDoorPct: +(100 * wallDoorCells / wallCells).toFixed(2),
  floorCells, meanDistinctFloorVariantsPerRoom: +(roomVariantSum / roomCount).toFixed(2),
  maxVariantsInRoom, debrisCells, fakePickupCells,
  fakePickupPct: debrisCells ? +(100 * fakePickupCells / debrisCells).toFixed(2) : 0,
  fakeKey, fakeCrystal, doorCells, doorNoRecord, lockedFloors, lockedNoKey
}, null, 2));
