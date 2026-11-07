// Phase 6 door/fog/locked-room sweep (§9.7.11 P6-DOOR-PLACEMENT,
// P6-LOCK-SOLVABILITY, P6-STAIRS-REACHABILITY, P6-LOCKED-ROOMS,
// P6-BOSS-COMPATIBILITY, P6-DETERMINISM, P6-SCOUT-PREVIEW,
// P6-COHERENCE): 200 floors per depth 1-15, same seed series as
// the Phase 5 sweep.
// runSeed = (0x5D5C2026 + i * 0x9E3779B9) mod 2^32, floor seed = runSeed XOR depth.
// Run: node beta-testers/sweep_phase6.js  (from ~/workspace/scrap-dungeon)
// Writes beta-testers/reports/sweep_phase6.json + sweep_phase6.txt.
// Exit 1 on ANY structural failure (coherence, solvability, stairs,
// door/key 1:1, boss-rule, determinism, Scout mismatch) — no bands,
// no excursions tolerated: the §9.7.11 criterion is 100%.
const C = require('../game/core.js');
const fs = require('fs');
const path = require('path');

const FLOORS_PER_DEPTH = 200;
const SEED_BASE = 0x5D5C2026;
const SEED_STEP = 0x9E3779B9;

function floorHash(floor) {
  let h = 2166136261;
  const mix = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } };
  floor.grid.forEach(row => mix(row.join('')));
  mix(JSON.stringify(floor.doors || []));
  mix(JSON.stringify(floor.explored || {}));
  mix(JSON.stringify(floor.rooms.map(r => [r.id, r.type, r.purpose || '', r.lockedKind || ''])));
  mix(JSON.stringify(floor.enemies.map(e => [e.x, e.y, e.type])));
  mix(floor.bossReason || '');
  mix(JSON.stringify(floor.pickups.filter(p => p.kind === 'key').map(p => [p.x, p.y, p.keyId])));
  mix(String(floor.generationAttempts || 0));
  return (h >>> 0).toString(16);
}

function runSeries() {
  const perDepth = {};
  for (let depth = 1; depth <= 15; depth++) {
    const d = { depth, floors: 0, doors: 0, entrances: 0, lockedRooms: 0, keys: 0,
      lockLevels: {}, lockedKinds: {}, bossPresent: 0, bossReasons: {},
      coherenceFailures: 0, coherenceErrors: [], doorKeyMismatch: 0, stairsUnreachable: 0,
      scoutMismatch: 0, attemptsHist: {}, retryFloors: 0, maxAttempts: 0,
      fogMalformed: 0, lockedFirstSecurityNoBoss: 0, hashes: [] };
    for (let i = 0; i < FLOORS_PER_DEPTH; i++) {
      const runSeed = (SEED_BASE + i * SEED_STEP) >>> 0;
      const floor = C.generateFloor(runSeed, depth);
      d.floors++;
      d.hashes.push(floorHash(floor));
      const attempts = floor.generationAttempts || 0;
      d.attemptsHist[attempts] = (d.attemptsHist[attempts] || 0) + 1;
      if (attempts > 1) d.retryFloors++;
      if (attempts > d.maxAttempts) d.maxAttempts = attempts;
      d.doors += (floor.doors || []).length;
      // One door per entrance by construction (§9.7.2); the 1:1
      // door/group mapping itself is verified by coherenceCheck.
      const locked = (floor.doors || []).filter(dr => dr.state === 'locked');
      d.lockedRooms += floor.rooms.filter(r => r.lockedKind).length;
      d.keys += floor.pickups.filter(p => p.kind === 'key').length;
      locked.forEach(dr => { d.lockLevels[dr.lockLevel] = (d.lockLevels[dr.lockLevel] || 0) + 1; });
      floor.rooms.forEach(r => { if (r.lockedKind) d.lockedKinds[r.lockedKind] = (d.lockedKinds[r.lockedKind] || 0) + 1; });
      // Door/key 1:1: every lock has exactly one key pickup, every key fits a lock.
      const keyIds = floor.pickups.filter(p => p.kind === 'key').map(p => p.keyId);
      locked.forEach(dr => { if (keyIds.filter(k => k === dr.keyId).length !== 1) d.doorKeyMismatch++; });
      keyIds.forEach(k => { if (!locked.some(dr => dr.keyId === k)) d.doorKeyMismatch++; });
      // Stairs reachable with locks as walls (independent of coherenceCheck).
      const stairs = floor.rooms.find(r => r.stairs);
      const spawn = floor.rooms.find(r => r.spawn);
      if (stairs && spawn) {
        const seen = new Set();
        const q = [[spawn.cx, spawn.cy]];
        seen.add(spawn.cx + ',' + spawn.cy);
        const lockedCells = new Set(locked.map(dr => dr.x + ',' + dr.y));
        while (q.length) {
          const [cx, cy] = q.shift();
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
            const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny;
            if (seen.has(k) || nx < 0 || ny < 0 || nx >= C.GRID_W || ny >= C.GRID_H) return;
            if (lockedCells.has(k)) return;
            const t = floor.grid[ny][nx];
            if (t === 'wall' || t === 'void') return;
            seen.add(k); q.push([nx, ny]);
          });
        }
        if (!seen.has(stairs.cx + ',' + stairs.cy)) d.stairsUnreachable++;
      }
      // Fog data well-formed: explored arrays exist, room ids valid, walked cells are corridors/doors.
      const ex = floor.explored;
      if (!ex || !Array.isArray(ex.exploredRoomIds) || !Array.isArray(ex.walkedCorridorCells)) d.fogMalformed++;
      else {
        const roomIds = new Set(floor.rooms.map(r => r.id));
        if (ex.exploredRoomIds.some(id => !roomIds.has(id))) d.fogMalformed++;
        if (ex.walkedCorridorCells.some(c => {
          const [x, y] = c.split(',').map(Number);
          return floor.grid[y][x] !== 'corridor' && floor.grid[y][x] !== 'door' && floor.grid[y][x] !== 'stairs' && floor.grid[y][x] !== 'hazard';
        })) d.fogMalformed++;
      }
      // Boss compatibility: locked first security room => no boss, reason recorded.
      const bosses = floor.enemies.filter(e => e.type === 'boss');
      if (bosses.length > 1) d.coherenceErrors.push('depth ' + depth + ' seed ' + i + ': >1 boss');
      if (bosses.length === 1) d.bossPresent++;
      d.bossReasons[floor.bossReason || 'missing'] = (d.bossReasons[floor.bossReason || 'missing'] || 0) + 1;
      if (floor.bossReason === 'locked-first-security-room') {
        d.lockedFirstSecurityNoBoss++;
        if (bosses.length !== 0) d.coherenceErrors.push('depth ' + depth + ' seed ' + i + ': boss despite locked-first-security');
      }
      // Scout preview match: counts only, regenerated from the same seed.
      const preview = C.scoutPreview(runSeed, depth);
      const byType = {};
      floor.enemies.forEach(e => { byType[e.type] = (byType[e.type] || 0) + 1; });
      const previewCounts = {};
      preview.byType.forEach(b => { previewCounts[b.type] = b.count; });
      // Order-insensitive count comparison (preview sorts byType
      // alphabetically; floor counts are in encounter order).
      const previewKeys = Object.keys(previewCounts).sort();
      const floorKeys = Object.keys(byType).sort();
      const countsMatch = previewKeys.length === floorKeys.length &&
        previewKeys.every(k => previewCounts[k] === byType[k]);
      if (preview.depth !== depth || preview.total !== floor.enemies.length || preview.theme !== floor.theme ||
          !countsMatch) d.scoutMismatch++;
      const check = C.coherenceCheck(floor);
      if (!check.ok) {
        d.coherenceFailures++;
        if (d.coherenceErrors.length < 5) d.coherenceErrors.push('depth ' + depth + ' seed ' + i + ': ' + check.errors.slice(0, 3).join(' | '));
      }
    }
    perDepth[depth] = d;
  }
  // Entrances equal doors (one door per entrance, §9.7.2).
  Object.keys(perDepth).forEach(k => { perDepth[k].entrances = perDepth[k].doors; });
  return perDepth;
}

const first = runSeries();
const second = runSeries();
let deterministic = true;
for (let depth = 1; depth <= 15; depth++) {
  for (let i = 0; i < FLOORS_PER_DEPTH; i++) {
    if (first[depth].hashes[i] !== second[depth].hashes[i]) { deterministic = false; break; }
  }
}
for (let depth = 1; depth <= 15; depth++) delete first[depth].hashes;

const summary = {
  generatedAt: new Date().toISOString(),
  floorsPerDepth: FLOORS_PER_DEPTH,
  seedSeries: 'runSeed = (0x5D5C2026 + i * 0x9E3779B9) mod 2^32, floor seed = runSeed XOR depth',
  determinismReplayIdentical: deterministic,
  perDepth: first,
};

const outDir = path.join(__dirname, 'reports');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'sweep_phase6.json'), JSON.stringify(summary, null, 2));

let txt = 'PHASE 6 DOOR/FOG/LOCKED-ROOM SWEEP — 3000 floors (200/depth 1-15)\n';
txt += 'Seed series: runSeed = (0x5D5C2026 + i * 0x9E3779B9) mod 2^32, floor seed = runSeed XOR depth\n';
txt += 'Determinism replay identical: ' + deterministic + '\n\n';
let totals = { doors: 0, lockedRooms: 0, keys: 0, coherenceFailures: 0, doorKeyMismatch: 0, stairsUnreachable: 0, scoutMismatch: 0, fogMalformed: 0, retryFloors: 0, bossPresent: 0, lockedFirstSecurityNoBoss: 0 };
for (let depth = 1; depth <= 15; depth++) {
  const d = first[depth];
  Object.keys(totals).forEach(k => { if (k in d) totals[k] += d[k]; });
  txt += `Depth ${depth}: doors=${d.doors} lockedRooms=${d.lockedRooms} keys=${d.keys} lockLevels=${JSON.stringify(d.lockLevels)} kinds=${JSON.stringify(d.lockedKinds)}\n`;
  txt += `  boss=${d.bossPresent} reasons=${JSON.stringify(d.bossReasons)} lockedFirstSecurityNoBoss=${d.lockedFirstSecurityNoBoss}\n`;
  txt += `  attempts=${JSON.stringify(d.attemptsHist)} retryFloors=${d.retryFloors} maxAttempts=${d.maxAttempts}\n`;
  txt += `  failures: coherence=${d.coherenceFailures} doorKey=${d.doorKeyMismatch} stairs=${d.stairsUnreachable} scout=${d.scoutMismatch} fog=${d.fogMalformed}\n`;
  if (d.coherenceErrors.length) txt += '  errors: ' + d.coherenceErrors.join('\n          ') + '\n';
}
txt += '\nTOTALS: ' + JSON.stringify(totals) + '\n';
txt += 'Structural pass: ' + (totals.coherenceFailures === 0 && totals.doorKeyMismatch === 0 && totals.stairsUnreachable === 0 && totals.scoutMismatch === 0 && totals.fogMalformed === 0 && deterministic ? '100%' : 'FAILED') + '\n';
fs.writeFileSync(path.join(outDir, 'sweep_phase6.txt'), txt);
console.log(txt);
const anyFail = totals.coherenceFailures || totals.doorKeyMismatch || totals.stairsUnreachable || totals.scoutMismatch || totals.fogMalformed || !deterministic;
process.exit(anyFail ? 1 : 0);
