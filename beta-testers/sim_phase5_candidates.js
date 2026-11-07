// One-off candidate sweep for the two P5-BALANCE-SIM failures (flyer d2,
// shielder frontal d4). Same pipeline as sim_phase5.js; varies ONLY the
// candidate values. Kept for auditability; the chosen values go into
// ENEMY_TYPES and the full sim is re-run as the gate.
const C = require('../game/core.js');
const BLASTER = { dice: C.WEAPON_DEFS.scrapBlaster.dice, dmgMult: 1, acc: 14 };
const TRIALS = 20000;

function stk(rng, hp, armor, evasion, frontal) {
  let remaining = hp, shots = 0;
  while (remaining > 0) {
    shots++;
    if (rng() * BLASTER.acc < rng() * evasion) continue;
    let raw = C.rollDamageDetailed(rng, { dice: BLASTER.dice, dmgMult: 1 }).total;
    if (frontal) raw = Math.floor(raw * 0.5);
    remaining -= Math.max(1, raw - armor);
  }
  return shots;
}
function medianFor(hp, armor, evasion, frontal, seed) {
  const rng = C.mulberry32(seed);
  const arr = new Array(TRIALS);
  for (let i = 0; i < TRIALS; i++) arr[i] = stk(rng, hp, armor, evasion, frontal);
  arr.sort((a, b) => a - b);
  return { median: arr[Math.floor(0.5 * (TRIALS - 1))], p10: arr[Math.floor(0.1 * (TRIALS - 1))], p90: arr[Math.floor(0.9 * (TRIALS - 1))] };
}
console.log('flyer d2 (hp 13): evasion -> median/p10/p90');
for (const ev of [20, 18, 16, 14, 12, 10]) {
  const r = medianFor(13, 0, ev, false, 0xF1);
  console.log('  evasion ' + ev + ': ' + r.median + ' / ' + r.p10 + ' / ' + r.p90 + (r.median <= 2 ? '  IN BAND 1-2' : ''));
}
console.log('shielder d4 frontal/rear: (hp, armor) -> frontal median / rear median');
for (const hp of [31, 29, 26, 23]) {
  for (const ar of [2, 1]) {
    const f = medianFor(hp, ar, 5, true, 0x51);
    const r = medianFor(hp, ar, 5, false, 0x52);
    console.log('  hp ' + hp + ' armor ' + ar + ': frontal ' + f.median + ' (' + f.p10 + '/' + f.p90 + ')' +
      (f.median >= 4 && f.median <= 6 ? ' IN 4-6' : '') + '  rear ' + r.median +
      (r.median >= 2 && r.median <= 3 ? ' IN 2-3' : ''));
  }
}
