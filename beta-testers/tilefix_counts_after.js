// Post-fix counts, same 200-seed sweep as tilefix_diag.js, but under
// the NEW render mapping: room-scoped floor/wall, scrap-only debris,
// door panels removed from wallVariants. Expect wallDoor=0,
// fakePickup=0, exactly 1 distinct non-circuit floor variant/room.
const C = require('../game/core.js');
function roomHash(r, depth) { return ((r.x * 73856093) ^ (r.y * 19349663) ^ (depth * 83492791) ^ (r.w * 101) ^ (r.h * 37)) >>> 0; }
const FLOOR_V = ['vision_floor_plain','vision_floor_plain','vision_floor_plain','vision_floor_circuit','floor_dense_scrap','batch3_s2_floor_rusty_a','batch3_s2_floor_rusty_b','batch3_s2_floor_cracked_a','batch3_s2_floor_cracked_b','batch3_s2_floor_mesh','batch3_s2_floor_diamond','batch3_s2_floor_tiles_grey','batch3_s1_floor_grey_a','batch3_s1_floor_grey_b','batch3_s1_floor_grey_c'];
const WALL_MATS = ['vision_wall_top','vision_wall_top2','vision_wall_right','wall','batch3_s2_wall_panel_a','batch3_s2_wall_panel_b','batch3_s2_wall_panel_c','batch3_s1_panel_plain_a'];
const DEBRIS_LV = ['debris','debris','batch3_s2_scrap_pile_a','batch3_s2_scrap_debris','batch3_s2_scrap_pile_wires','batch3_s2_armour_broken'];
function hash2(x, y, depth) { return ((x * 73856093) ^ (y * 19349663) ^ (depth * 83492791)) >>> 0; }
function roomAt(f, x, y) { for (const r of f.rooms) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r; return null; }
let floors = 0, wallCells = 0, wallDoorCells = 0, roomCount = 0, badRooms = 0, maxVariants = 0;
let debrisCells = 0, fakePickupCells = 0, doorCells = 0, doorNoRecord = 0, lockedNoKey = 0, coherenceFail = 0;
for (let seed = 1; seed <= 200; seed++) {
  const f = C.generateFloor(seed, 1); floors++;
  if (!C.coherenceCheck(f).ok) coherenceFail++;
  const rec = {}; (f.doors || []).forEach(d => { rec[d.x + ',' + d.y] = d; });
  f.grid.forEach((row, y) => row.forEach((t, x) => {
    if (t === 'wall') {
      wallCells++;
      for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const r = roomAt(f, x + dx, y + dy);
        if (!r) continue;
        const m = WALL_MATS[roomHash(r, 1) % WALL_MATS.length];
        if (m.indexOf('wall_door') !== -1) wallDoorCells++;
        break;
      }
    }
    if (t === 'door') { doorCells++; if (!rec[x + ',' + y]) doorNoRecord++; }
  }));
  const cb = f.circuitBlock;
  f.rooms.forEach(r => {
    const vs = new Set();
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      const t = f.grid[y][x];
      if ((t === 'floor' || t === 'stairs' || t === 'hazard') && !(cb && x >= cb.x && x < cb.x + cb.w && y >= cb.y && y < cb.y + cb.h)) vs.add(FLOOR_V[roomHash(r, 1) % FLOOR_V.length]);
    }
    roomCount++; if (vs.size > maxVariants) maxVariants = vs.size; if (vs.size !== 1) badRooms++;
  });
  (f.dressing || []).forEach(d => {
    if (d.kind === 'debris') {
      debrisCells++;
      const k = DEBRIS_LV[hash2(d.x, d.y, 1) % DEBRIS_LV.length];
      if (k.indexOf('loot_') === 0) fakePickupCells++;
    }
  });
  (f.doors || []).filter(d => d.state === 'locked').forEach(d => {
    if (!(f.pickups || []).some(p => p.kind === 'key' && p.keyId === d.keyId)) lockedNoKey++;
  });
}
console.log(JSON.stringify({ floors, coherenceFail, wallCells, wallDoorCells, roomCount, badRooms, maxDistinctFloorVariantsPerRoom: maxVariants, debrisCells, fakePickupCells, doorCells, doorNoRecord, lockedNoKey }, null, 2));
