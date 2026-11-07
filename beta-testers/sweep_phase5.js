// Phase 5 roster sweep (§8.5.3): 200 floors per depth 1-15.
// runSeed = (0x5D5C2026 + i * 0x9E3779B9) mod 2^32, floor seed = runSeed XOR depth.
// Run: node beta-testers/sweep_phase5.js  (from ~/workspace/scrap-dungeon)
// Writes beta-testers/reports/sweep_phase5.json + sweep_phase5.txt.
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
  mix(JSON.stringify(floor.enemies.map(e => [e.x, e.y, e.type, e.maxHp, e.shieldFacing || ''])));
  mix(JSON.stringify(floor.rooms.map(r => [r.type, r.purpose || ''])));
  mix(floor.bossReason || '');
  return (h >>> 0).toString(16);
}

function runSeries() {
  const perDepth = {};
  for (let depth = 1; depth <= 15; depth++) {
    const d = { depth, floors: 0, regular: 0, counts: {}, bossPresent: 0, bossReasons: {}, hashes: [],
      coherenceFailures: 0, countMismatches: 0, unwiredTypes: 0, bossInNonSecurity: 0 };
    for (let i = 0; i < FLOORS_PER_DEPTH; i++) {
      const runSeed = (SEED_BASE + i * SEED_STEP) >>> 0;
      const floor = C.generateFloor(runSeed, depth);
      d.floors++;
      d.hashes.push(floorHash(floor));
      const bosses = floor.enemies.filter(e => e.type === 'boss');
      if (bosses.length > 1) d.countMismatches++;
      if (bosses.length === 1) {
        d.bossPresent++;
        const b = bosses[0];
        const inSec = floor.rooms.some(r => r.type === 'structure' && r.purpose === 'security' &&
          b.x >= r.x && b.x < r.x + r.w && b.y >= r.y && b.y < r.y + r.h);
        if (!inSec) d.bossInNonSecurity++;
      }
      d.bossReasons[floor.bossReason || 'missing'] = (d.bossReasons[floor.bossReason || 'missing'] || 0) + 1;
      const regular = floor.enemies.filter(e => e.type !== 'boss');
      if (regular.length !== Math.min(12, 3 + depth)) d.countMismatches++;
      regular.forEach(en => {
        d.regular++;
        if (!C.ENEMY_TYPES[en.type]) d.unwiredTypes++;
        d.counts[en.type] = (d.counts[en.type] || 0) + 1;
      });
      const check = C.coherenceCheck(floor);
      if (!check.ok) d.coherenceFailures++;
    }
    // Observed vs expected shares (regular enemies only).
    const w = C.rosterWeightsFor(depth).weights;
    const total = w.reduce((a, e) => a + e.weight, 0);
    d.expected = {};
    d.observed = {};
    d.shareCheck = {};
    w.forEach(e => {
      d.expected[e.type] = Number((e.weight / total).toFixed(4));
      const obs = (d.counts[e.type] || 0) / d.regular;
      d.observed[e.type] = Number(obs.toFixed(4));
      const rel = Math.abs(obs - e.weight / total) / (e.weight / total);
      d.shareCheck[e.type] = { within15pct: rel <= 0.15, relErr: Number(rel.toFixed(4)) };
    });
    d.bossShare = Number((d.bossPresent / d.floors).toFixed(4));
    perDepth[depth] = d;
  }
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
fs.writeFileSync(path.join(outDir, 'sweep_phase5.json'), JSON.stringify(summary, null, 2));

let txt = 'PHASE 5 ROSTER SWEEP — 3000 floors (200/depth 1-15)\n';
txt += 'Seed series: runSeed = (0x5D5C2026 + i * 0x9E3779B9) mod 2^32, floor seed = runSeed XOR depth\n';
txt += 'Determinism replay identical: ' + deterministic + '\n\n';
for (let depth = 1; depth <= 15; depth++) {
  const d = first[depth];
  txt += `Depth ${depth} (${C.themeNameForDepth(depth)}): regular=${d.regular} boss=${d.bossPresent} (${(d.bossShare * 100).toFixed(1)}%) reasons=${JSON.stringify(d.bossReasons)}\n`;
  txt += '  expected ' + JSON.stringify(d.expected) + '\n';
  txt += '  observed ' + JSON.stringify(d.observed) + '\n';
  const bad = Object.entries(d.shareCheck).filter(([, v]) => !v.within15pct);
  txt += '  share band: ' + (bad.length ? 'FAIL ' + JSON.stringify(bad) : 'all within ±15% relative') + '\n';
  txt += `  validation: coherenceFailures=${d.coherenceFailures} countMismatches=${d.countMismatches} unwiredTypes=${d.unwiredTypes} bossInNonSecurity=${d.bossInNonSecurity}\n`;
}
fs.writeFileSync(path.join(outDir, 'sweep_phase5.txt'), txt);
console.log(txt);
const anyFail = Object.values(first).some(d =>
  Object.values(d.shareCheck).some(v => !v.within15pct) ||
  d.coherenceFailures || d.countMismatches || d.unwiredTypes || d.bossInNonSecurity);
process.exit(anyFail || !deterministic ? 1 : 0);
