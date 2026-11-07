// Ammo economy Monte Carlo — Scrap Dungeon balance sim (balance-simulator skill).
// Question as numbers: if a player kills every enemy at range, how many shots
// does a run demand vs ammo supplied, per depth? And what fraction of kills
// can be ranged before the pool runs dry?
// Parameters are extracted from shipped game/core.js (cited in the note).
// Phase 1 (2026-10-28): ranged damage uses the real weapon dice
// (WEAPON_DEFS + tier x upgrade scaling via weaponStats); a second
// 'rangedTypical' mode samples a freshly rolled depth-typical instance
// per trial (rollItem: tier + upgrade + def, melee defs re-rolled since
// a sword is not a ranged weapon) to reflect the real drop tables.
// The economy gate stays on the Common +0 starter blaster — the
// conservative case — so burst/splash/cone ammo economics cannot
// flatter the supply verdict.
// Re-run: node beta-testers/sim_ammo.js  (writes sim_ammo_results.json)
const C = require('../game/core.js');
const fs = require('fs');

const PLAYER = { dmg: 14, dmgVar: 6, acc: 14 };
const GUN = { dice: C.WEAPON_DEFS.scrapBlaster.dice, dmgMult: 1, acc: 14 };
const ENEMIES = {};
for (const [type, d] of Object.entries(C.ENEMY_TYPES)) {
  // Boss never appears at depths 1-3 (depth>=5 + security room), so it
  // has no dist entry; every other shipped type does.
  if (type === 'boss') continue;
  ENEMIES[type] = { hp: d.hp, armor: d.armor, evasion: d.evasion };
}
// Phase 5 (2026-10-29): derived from shipped ENEMY_TYPES instead of a
// hardcoded trio — turret_light/flyer join depths 2-3. Trio keys keep
// identical values and identical per-key RNG seeds (seed = f(depth,
// type.length)), so trio distributions are unchanged; new types get
// their own deterministic seeds. Shielder frontal halving is NOT
// modeled here (no shielder at depths 1-3; first depth 4).
const TRIALS = 20000;
const RUN_SEEDS = 200;

function weaponDamage(rng, weapon) {
  if (weapon.dice) return C.rollDamageDetailed(rng, { dice: weapon.dice, dmgMult: weapon.dmgMult || 1 }).total;
  return weapon.dmg + Math.floor(rng() * (weapon.dmgVar + 1));
}

function shotsToKill(rng, hp, armor, evasion, weapon, surpriseOpener) {
  let remaining = hp, shots = 0, first = true;
  const effArmor = weapon.pierceArmor ? 0 : armor;
  const acc = weapon.acc || 14;
  while (remaining > 0) {
    shots++;
    if (surpriseOpener && first) {
      first = false;
      const raw = weaponDamage(rng, weapon);
      remaining -= Math.max(1, Math.round((raw - effArmor) * 1.5));
      continue;
    }
    first = false;
    const aRoll = rng() * acc;
    const eRoll = rng() * evasion;
    if (aRoll < eRoll) continue;
    const raw = weaponDamage(rng, weapon);
    remaining -= Math.max(1, raw - effArmor);
  }
  return shots;
}

// A depth-typical rolled weapon instance (tier + upgrade + def from the
// real drop tables), resolved through weaponStats — the single source of
// truth for derived stats. Melee defs are re-rolled: this mode is ranged.
function typicalWeapon(rng, depth) {
  let inst = C.rollItem(rng, depth);
  while (C.WEAPON_DEFS[inst.defId].pattern === 'melee') inst = C.rollItem(rng, depth);
  const st = C.weaponStats({ weapon: inst });
  return { dice: st.dice, dmgMult: st.mult, acc: 14 + (st.accBonus || 0), pierceArmor: !!st.pierceArmor };
}

// Precompute shots-to-kill distributions per (type, depth, mode).
const dist = {};
for (const type of Object.keys(ENEMIES)) {
  for (let depth = 1; depth <= 3; depth++) {
    const hp = Math.round(ENEMIES[type].hp * (1 + 0.1 * (depth - 1)));
    for (const mode of ['ranged', 'rangedTypical', 'meleeSurprise', 'meleeAwake']) {
      const key = type + '|' + depth + '|' + mode;
      const arr = new Array(TRIALS);
      const rng = C.mulberry32(1234567 + depth * 100 + type.length);
      for (let i = 0; i < TRIALS; i++) {
        if (mode === 'ranged') arr[i] = shotsToKill(rng, hp, ENEMIES[type].armor, ENEMIES[type].evasion, GUN, false);
        else if (mode === 'rangedTypical') arr[i] = shotsToKill(rng, hp, ENEMIES[type].armor, ENEMIES[type].evasion, typicalWeapon(rng, depth), false);
        else arr[i] = shotsToKill(rng, hp, ENEMIES[type].armor, ENEMIES[type].evasion, PLAYER, mode === 'meleeSurprise');
      }
      arr.sort((a, b) => a - b);
      dist[key] = arr;
    }
  }
}
function pct(arr, q) { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }
function summarize(arr) {
  return { median: pct(arr, 0.5), p10: pct(arr, 0.1), p90: pct(arr, 0.9), mean: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) };
}

// Floor census from the real generator.
const floors = [];
for (let runSeed = 1; runSeed <= RUN_SEEDS; runSeed++) {
  for (let depth = 1; depth <= 3; depth++) {
    const f = C.generateFloor(runSeed, depth);
    const crates = f.pickups.filter(p => p.kind === 'ammo').length;
    const lootRooms = f.rooms.filter(r => r.type === 'loot').length;
    const items = f.pickups.filter(p => p.kind === 'item');
    const itemTiers = {};
    items.forEach(p => { itemTiers[p.tier] = (itemTiers[p.tier] || 0) + 1; });
    floors.push({ runSeed, depth, enemies: f.enemies.map(e => e.type), crates, lootRooms, itemCount: items.length, itemTiers });
  }
}

// Run-level economy: paired comparison across variants, same sampled demands.
const VARIANTS = {
  // 'current' tracks the shipped constants: tuning STARTING_AMMO or
  // AMMO_CRATE_VALUE in core.js moves this variant with it.
  current: { start: C.STARTING_AMMO, crate: C.AMMO_CRATE_VALUE, cap: Infinity },
  tighter: { start: 8, crate: 4, cap: Infinity },
  capped24: { start: 12, crate: 6, cap: 24 },
  generous: { start: 18, crate: 6, cap: Infinity },
  crafted12: { start: 24, crate: 6, cap: Infinity }, // 12 starting + 2 crafted packs (6 each) entering depth 1
};
const results = { killDists: {}, floors: {}, variants: {} };
for (const key of Object.keys(dist)) results.killDists[key] = summarize(dist[key]);
results.floors.crateDist = {};
for (let depth = 1; depth <= 3; depth++) {
  const cs = floors.filter(f => f.depth === depth).map(f => f.crates);
  const dFloors = floors.filter(f => f.depth === depth);
  const itemCounts = dFloors.map(f => f.itemCount);
  const tierTotals = {};
  let tierN = 0;
  dFloors.forEach(f => { for (const [t, n] of Object.entries(f.itemTiers)) { tierTotals[t] = (tierTotals[t] || 0) + n; tierN += n; } });
  const tierShares = {};
  for (const [t, n] of Object.entries(tierTotals)) tierShares[t] = +(n / tierN).toFixed(4);
  results.floors['depth' + depth] = {
    crates: summarize(cs),
    lootRooms: summarize(dFloors.map(f => f.lootRooms)),
    zeroCrateFloors: cs.filter(c => c === 0).length,
    n: cs.length,
    itemCaches: summarize(itemCounts),
    zeroItemFloors: itemCounts.filter(c => c === 0).length,
    itemTierShares: tierShares,
  };
}

for (const [vName, v] of Object.entries(VARIANTS)) {
  const rng = C.mulberry32(987654321);
  const perDepth = { 1: [], 2: [], 3: [] };
  const shortfall = { 1: [], 2: [], 3: [] };
  const rangedFrac = { 1: [], 2: [], 3: [] };
  const demand = { 1: [], 2: [], 3: [] };
  for (let runSeed = 1; runSeed <= RUN_SEEDS; runSeed++) {
    let balance = v.start;
    for (let depth = 1; depth <= 3; depth++) {
      const fl = floors.find(f => f.runSeed === runSeed && f.depth === depth);
      balance = Math.min(v.cap, balance + v.crate * fl.crates);
      const entering = balance;
      let dem = 0;
      for (const type of fl.enemies) {
        const arr = dist[type + '|' + depth + '|ranged'];
        dem += arr[Math.floor(rng() * arr.length)];
      }
      demand[depth].push(dem);
      rangedFrac[depth].push(dem === 0 ? 1 : Math.min(1, entering / dem));
      const sf = Math.max(0, dem - entering);
      shortfall[depth].push(sf);
      balance = Math.max(0, entering - dem);
      perDepth[depth].push(balance);
    }
  }
  results.variants[vName] = {};
  for (let depth = 1; depth <= 3; depth++) {
    results.variants[vName]['depth' + depth] = {
      demand: summarize(demand[depth]),
      endBalance: summarize(perDepth[depth]),
      shortfallRuns: shortfall[depth].filter(s => s > 0).length,
      shortfallMedian: summarize(shortfall[depth]).median,
      rangedFracSustainable: summarize(rangedFrac[depth]),
    };
  }
}

// Phase 4 (§7.6.8, P4-SIM-AMMO, P4-NO-UNIVERSAL-DOMINANCE):
// typed-ammo shots-to-kill with the same Common +0 starter blaster.
// Faithful to the shipped status manager: Piercing ignores half the
// armor (floor on the ignored portion); Incendiary deals normal
// damage PLUS burning (3 ticks, refresh-no-stack, one tick per
// elapsed time unit — the shot's own unit ticks once, after the
// hit resolves; a tick can kill); Shock deals normal damage plus a
// jam, which skips an enemy activation and therefore cannot change
// shots-to-kill — Shock STK is Standard STK by construction, and
// the dominance check treats the resulting tie as no dominance.
// The economy gate stays on the Standard default loadout (starting
// 16 + crates +8): typed-pool crafting supply depends on player
// breakdown/salvage choices outside this sim's scope.
function burnTickFor(type) {
  const r = (C.ENEMY_TYPES[type] && C.ENEMY_TYPES[type].resist && C.ENEMY_TYPES[type].resist.burning) || 0;
  return Math.max(1, Math.floor(3 * (1 - r)));
}
function shotsToKillAmmo(rng, hp, armor, evasion, weapon, type, ammo) {
  let remaining = hp, shots = 0, burnTicks = 0;
  const effArmor = ammo === 'piercing' ? armor - Math.floor(armor / 2) : armor;
  const acc = weapon.acc || 14;
  while (remaining > 0) {
    shots++;
    const aRoll = rng() * acc;
    const eRoll = rng() * evasion;
    if (aRoll >= eRoll) {
      const raw = weaponDamage(rng, weapon);
      remaining -= Math.max(1, raw - effArmor);
      if (remaining <= 0) break; // killed outright: no burn tick
      if (ammo === 'incendiary') burnTicks = 3; // refresh-no-stack
    }
    // The shot's own time unit elapses: one burn tick, if burning.
    if (burnTicks > 0) {
      remaining -= burnTickFor(type);
      burnTicks--;
    }
  }
  return shots;
}

const AMMO_TYPES_SIM = ['standard', 'piercing', 'incendiary', 'shock'];
const ammoDist = {};
for (const type of Object.keys(ENEMIES)) {
  for (let depth = 1; depth <= 3; depth++) {
    const hp = Math.round(ENEMIES[type].hp * (1 + 0.1 * (depth - 1)));
    for (const ammo of AMMO_TYPES_SIM) {
      const key = type + '|' + depth + '|' + ammo;
      const arr = new Array(TRIALS);
      const rng = C.mulberry32(1234567 + depth * 100 + type.length);
      for (let i = 0; i < TRIALS; i++) {
        arr[i] = shotsToKillAmmo(rng, hp, ENEMIES[type].armor, ENEMIES[type].evasion, GUN, type, ammo);
      }
      arr.sort((a, b) => a - b);
      ammoDist[key] = arr;
    }
  }
}
results.ammoKillDists = {};
for (const key of Object.keys(ammoDist)) results.ammoKillDists[key] = summarize(ammoDist[key]);

// P4-NO-UNIVERSAL-DOMINANCE, exactly as §7.6.8 defines it: a type
// dominates only if its median STK is STRICTLY lower than every
// other available type against ALL THREE enemies. Ties do not
// count. Phase 4 fails if any type meets that, at any depth.
const dominance = {};
for (let depth = 1; depth <= 3; depth++) {
  dominance['depth' + depth] = {};
  for (const ammo of AMMO_TYPES_SIM) {
    let dominates = true;
    const medians = {};
    for (const type of Object.keys(ENEMIES)) {
      const med = results.ammoKillDists[type + '|' + depth + '|' + ammo].median;
      medians[type] = med;
      for (const other of AMMO_TYPES_SIM) {
        if (other === ammo) continue;
        if (!(med < results.ammoKillDists[type + '|' + depth + '|' + other].median)) { dominates = false; }
      }
    }
    dominance['depth' + depth][ammo] = { medians, dominates };
  }
}
results.dominance = dominance;
const anyDominant = AMMO_TYPES_SIM.some(a => [1, 2, 3].some(d => dominance['depth' + d][a].dominates));
const gate = (key, limit) => ({ median: results.killDists[key].median, limit, pass: results.killDists[key].median <= limit });
results.gates = {
  stkBlaster: {
    drone: gate('drone|1|ranged', 3),
    raider: gate('raider|1|ranged', 4),
    brute: gate('brute|1|ranged', 8),
  },
  stkTypical: {
    drone: gate('drone|1|rangedTypical', 3),
    raider: gate('raider|1|rangedTypical', 4),
    brute: gate('brute|1|rangedTypical', 8),
  },
  ammoShare: {
    depth1: { median: results.variants.current.depth1.rangedFracSustainable.median, floor: 0.7, pass: results.variants.current.depth1.rangedFracSustainable.median >= 0.7 },
    depth2: { median: results.variants.current.depth2.rangedFracSustainable.median, floor: 0.7, pass: results.variants.current.depth2.rangedFracSustainable.median >= 0.7 },
  },
  zeroItemFloors: { depth1: results.floors.depth1.zeroItemFloors, depth2: results.floors.depth2.zeroItemFloors, depth3: results.floors.depth3.zeroItemFloors, pass: results.floors.depth1.zeroItemFloors === 0 && results.floors.depth2.zeroItemFloors === 0 && results.floors.depth3.zeroItemFloors === 0 },
  // Phase 4 gates (§7.6.8): the 3/3/6 depth-1 blaster baseline is
  // preserved under the typed-ammo model, and no typed ammo
  // dominates (strictly-lower median vs every other type against
  // all three enemies, at any depth; ties do not count).
  p4AmmoBaseline: {
    drone: { median: results.ammoKillDists['drone|1|standard'].median, expect: 3, pass: results.ammoKillDists['drone|1|standard'].median === 3 },
    raider: { median: results.ammoKillDists['raider|1|standard'].median, expect: 3, pass: results.ammoKillDists['raider|1|standard'].median === 3 },
    brute: { median: results.ammoKillDists['brute|1|standard'].median, expect: 6, pass: results.ammoKillDists['brute|1|standard'].median === 6 },
  },
  p4NoUniversalDominance: { anyDominant, pass: !anyDominant },
};

fs.writeFileSync(__dirname + '/sim_ammo_results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
