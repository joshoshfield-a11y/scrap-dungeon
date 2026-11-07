// SCRAP DUNGEON Phase 1 — core logic (no DOM here).
// Works in a browser as a classic script (window.ScrapCore) and in
// Node (module.exports). Rendering lives in game.js; tests in test.js
// exercise this file only.
(function (root) {
  'use strict';

  // ---------- seeded RNG (mulberry32) ----------
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randInt(rng, min, max) { // inclusive
    return min + Math.floor(rng() * (max - min + 1));
  }

  // ---------- directions (order matches sheets: S,SW,W,NW,N,NE,E,SE) ----------
  var DIRS = [
    { dx: 0, dy: 1, name: 'S' }, { dx: -1, dy: 1, name: 'SW' },
    { dx: -1, dy: 0, name: 'W' }, { dx: -1, dy: -1, name: 'NW' },
    { dx: 0, dy: -1, name: 'N' }, { dx: 1, dy: -1, name: 'NE' },
    { dx: 1, dy: 0, name: 'E' }, { dx: 1, dy: 1, name: 'SE' },
  ];
  function dirIndexFor(dx, dy) {
    for (var i = 0; i < DIRS.length; i++) {
      if (DIRS[i].dx === dx && DIRS[i].dy === dy) return i;
    }
    return 0;
  }

  // ---------- enemy definitions (Slice 1 only) ----------
  // PD-style combat stats: accuracy and evasion are roll ranges, NOT
  // percentages. Attacker rolls 0..accuracy, defender rolls 0..evasion,
  // hit if attacker's roll >= defender's. Drone is hard to hit (eva 14),
  // brute is easy to hit (eva 3), scout sits in the middle (eva 8).
  var ENEMY_TYPES = {
    raider: { name: 'Raider', hp: 30, dmg: 8, dmgVar: 3, armor: 1, acc: 12, evasion: 6, interval: 8, salvageMin: 5, salvageMax: 8, componentDrop: 1, sight: 8, retreat: true, color: '#e0523d', resist: { burning: 0, jammed: 0 } },
    drone: { name: 'Drone', hp: 16, dmg: 5, dmgVar: 2, armor: 0, acc: 10, evasion: 14, interval: 7, salvageMin: 3, salvageMax: 5, componentDrop: 0, sight: 8, retreat: true, color: '#ff7a5c', resist: { burning: 0.5, jammed: 0.5 } },
    brute: { name: 'Brute', hp: 60, dmg: 14, dmgVar: 4, armor: 4, acc: 11, evasion: 3, interval: 14, salvageMin: 10, salvageMax: 14, componentDrop: 2, sight: 7, retreat: false, color: '#a03028', resist: { burning: 0.25, jammed: 0.25 } },
    // Phase 5 (LOOT-SKILLS-DESIGN.md §8.5.2): stats exactly as tabled.
    // SEMANTICS RECONCILIATION (F items 3/5): the spec's table preamble
    // calls acc/evasion "percentages" and interval "world time units",
    // but the shipped pipeline is roll-range (attacker rolls
    // rng()*acc vs defender rng()*evasion in resolveAttack/weaponShot)
    // and tick-based (scheduler advances nextTime by `interval`
    // ticks; PLAYER_DEF.interval = 10 ticks = 1 time unit). The table
    // values plug into the SAME fields the trio uses, so the shipped
    // mechanism is preserved: acc/evasion keep roll-range semantics,
    // and the new intervals are stored in TICKS as spec-units x 10
    // (flyer 1 unit = 10 ticks, shielder/boss 2 units = 20,
    // turret/sniper/bomber 3 units = 30). Storing the raw 1/2/3 as
    // ticks would make a flyer act ~10x per player action. Flagged
    // in PHASE5-REPORT.md; the balance sim uses the same pipeline.
    // componentDrop for the new types is a FRACTION (chance of exactly
    // one component); the trio's integers keep count semantics — see
    // killEnemy. Colors are new (no shipped palette existed).
    turret_light: { name: 'Turret', hp: 20, dmg: 4, dmgVar: 1, armor: 1, acc: 75, evasion: 0, interval: 30, salvageMin: 2, salvageMax: 4, componentDrop: 0.15, sight: 8, retreat: false, color: '#8f9bb0', resist: { burning: 0, jammed: 0.25 } },
    flyer: { name: 'Flyer', hp: 12, dmg: 4, dmgVar: 2, armor: 0, acc: 70, evasion: 16, interval: 10, salvageMin: 1, salvageMax: 3, componentDrop: 0.10, sight: 6, retreat: false, color: '#7fd4ff', resist: { burning: 0.5, jammed: 0.5 } },
    shielder: { name: 'Shielder', hp: 20, dmg: 5, dmgVar: 2, armor: 2, acc: 70, evasion: 5, interval: 20, salvageMin: 3, salvageMax: 5, componentDrop: 0.25, sight: 5, retreat: false, color: '#4aa8ff', resist: { burning: 0.25, jammed: 0.5 } },
    sniper: { name: 'Sniper', hp: 18, dmg: 8, dmgVar: 2, armor: 0, acc: 85, evasion: 0, interval: 30, salvageMin: 3, salvageMax: 5, componentDrop: 0.25, sight: 8, retreat: false, color: '#e0b46a', resist: { burning: 0, jammed: 0.25 } },
    bomber: { name: 'Bomber', hp: 24, dmg: 6, dmgVar: 2, armor: 1, acc: 65, evasion: 0, interval: 30, salvageMin: 2, salvageMax: 4, componentDrop: 0.20, sight: 5, retreat: false, color: '#ff5c39', resist: { burning: 0, jammed: 0 } },
    boss: { name: 'Boss', hp: 120, dmg: 8, dmgVar: 3, armor: 4, acc: 80, evasion: 5, interval: 20, salvageMin: 12, salvageMax: 18, componentDrop: 1.0, sight: 8, retreat: false, color: '#c93df0', resist: { burning: 0.25, jammed: 0.75 } },
  };
  var PLAYER_DEF = { name: 'Scout', hp: 100, dmg: 14, dmgVar: 6, armor: 2, acc: 14, evasion: 8, interval: 10 };
  // Ranged combat (ammo slice, 2026-10-27): one starter weapon, one
  // ammo pool. Firing costs 1 time unit like a bump attack; ranged
  // shots never get the melee surprise bonus, but they wake the
  // target. No magazine and no ammo cap in this slice — playtest
  // numbers, not a balance claim.
  //
  // Phase 1 (LOOT-SKILLS-DESIGN.md §4): weapon DEFINITIONS are data
  // (same shape as ENEMY_TYPES/RECIPES). An equipped weapon is an
  // INSTANCE {kind:'item', defId, tier, upgrade, properties, flair};
  // derived stats are recomputed by weaponStats(), never stored.
  // ammoType is recorded on every def, but consumption always draws
  // from the SINGLE existing ammo pool (STARTING_AMMO 16, crates +8,
  // Armorer faucet) — per-type pools are Phase 4. Explosive/energy
  // ammo types are likewise Phase 4: defs carrying them still fire
  // from the single pool in this phase.
  var WEAPON_DEFS = {
    scrapBlaster: { name: 'Scrap blaster', pattern: 'standard', dice: { num: 2, sides: 6, plus: 8 }, range: 5, timeCost: 1, ammoPerShot: 1, ammoType: 'standard', element: 'kinetic', depthBand: [1, 99] },
    plasmaRifle: { name: 'Plasma rifle', pattern: 'standard', dice: { num: 2, sides: 6, plus: 8 }, range: 6, timeCost: 1, ammoPerShot: 1, ammoType: 'standard', element: 'energy', depthBand: [1, 99], accBonus: 2 },
    railGun: { name: 'Rail gun', pattern: 'standard', dice: { num: 3, sides: 8, plus: 6 }, range: 8, timeCost: 2, ammoPerShot: 2, ammoType: 'piercing', element: 'kinetic', depthBand: [2, 99], pierceArmor: true },
    gatling: { name: 'Gatling', pattern: 'burst', shots: 3, dice: { num: 1, sides: 6, plus: 3 }, range: 4, timeCost: 1, ammoPerShot: 3, ammoType: 'standard', element: 'kinetic', depthBand: [1, 99] },
    flamethrower: { name: 'Flamethrower', pattern: 'cone', dice: { num: 2, sides: 4, plus: 4 }, range: 3, timeCost: 1, ammoPerShot: 2, ammoType: 'incendiary', element: 'thermal', depthBand: [1, 99], burn: { dmg: 3, ticks: 3 } },
    grenadeLauncher: { name: 'Grenade launcher', pattern: 'splash', dice: { num: 2, sides: 8, plus: 4 }, range: 5, timeCost: 2, ammoPerShot: 2, ammoType: 'explosive', element: 'explosive', depthBand: [1, 99], arc: true },
    homingMissile: { name: 'Homing missile', pattern: 'homing', dice: { num: 3, sides: 6, plus: 8 }, range: 7, timeCost: 3, ammoPerShot: 2, ammoType: 'standard', element: 'explosive', depthBand: [3, 99] },
    missilePod: { name: 'Missile pod', pattern: 'spread', shots: 4, dice: { num: 1, sides: 6, plus: 2 }, range: 5, timeCost: 2, ammoPerShot: 4, ammoType: 'standard', element: 'explosive', depthBand: [2, 99] },
    shoulderRocket: { name: 'Shoulder rocket', pattern: 'standard', dice: { num: 4, sides: 6, plus: 10 }, range: 7, timeCost: 3, ammoPerShot: 3, ammoType: 'explosive', element: 'explosive', depthBand: [3, 99] },
    laserEmitter: { name: 'Laser emitter', pattern: 'beam', dice: { num: 2, sides: 10, plus: 4 }, range: 8, timeCost: 1, ammoPerShot: 1, ammoType: 'energy', element: 'energy', depthBand: [4, 99] },
    energySword: { name: 'Energy sword', pattern: 'melee', dice: { num: 3, sides: 6, plus: 5 }, range: 1, timeCost: 1, ammoPerShot: 0, ammoType: null, element: 'energy', depthBand: [1, 99] },
    // Combat drone: deployable helper. Built LAST in Phase 1; until
    // its actor code lands it stays released:false so rollItem never
    // offers it and fireWeapon refuses it honestly.
    combatDrone: { name: 'Combat drone', pattern: 'deploy', dice: null, range: 5, timeCost: 2, ammoPerShot: 1, ammoType: 'cell', element: null, depthBand: [4, 99], released: false },
  };
  // Back-compat alias: older readers (and the pre-Phase-1 tests) used
  // C.WEAPONS. New code uses WEAPON_DEFS.
  // ---------- Phase 2: gear slots (LOOT-SKILLS-DESIGN.md §5) ----------
  // Gear defs mirror the WEAPON_DEFS pattern: same tier + upgrade
  // system (§4.2–4.3), same drop sources (§4.4), same ring +
  // letter-marker + tier-color presentation, no sprite files.
  // Three slots; one utility slot forces a real choice. Numeric
  // bonuses scale exactly like weapon damage: tier multiplier x
  // (1 + 12% per upgrade level), rounded — see gearStatValue.
  // Proposed defaults (playtest numbers, not gospel):
  //   armor: bonus armor + bonus max HP.
  //   shield: absorb pool, capacity by def; recharge 1 per 2 time
  //     units (SHIELD_RECHARGE_TICKS); damage hits shield before hull.
  //   utility: Scope +range, Sensor +sight, Gyro-stabilizer +evasion,
  //     Power cell +actions before the power warnings (see
  //     notePlayerAction). Chassis swaps stay deferred past Phase 6.
  var GEAR_DEFS = {
    scrapPlating: { slot: 'armor', name: 'Scrap plating', armor: 1, hp: 0, depthBand: [1, 99] },
    alloyVest: { slot: 'armor', name: 'Alloy vest', armor: 2, hp: 10, depthBand: [1, 99] },
    ablativeWeave: { slot: 'armor', name: 'Ablative weave', armor: 3, hp: 20, depthBand: [2, 99] },
    nanoLattice: { slot: 'armor', name: 'Nano-lattice', armor: 4, hp: 40, depthBand: [3, 99] },
    scrappersWard: { slot: 'shield', name: "Scrapper's ward", capacity: 10, depthBand: [1, 99] },
    alloyAegis: { slot: 'shield', name: 'Alloy aegis', capacity: 16, depthBand: [1, 99] },
    ablativeBarrier: { slot: 'shield', name: 'Ablative barrier', capacity: 24, depthBand: [2, 99] },
    nanoBastion: { slot: 'shield', name: 'Nano bastion', capacity: 34, depthBand: [3, 99] },
    scope: { slot: 'utility', name: 'Scope', range: 1, depthBand: [1, 99] },
    sensor: { slot: 'utility', name: 'Sensor', sight: 2, depthBand: [1, 99] },
    gyroStabilizer: { slot: 'utility', name: 'Gyro-stabilizer', evasion: 2, depthBand: [2, 99] },
    powerCell: { slot: 'utility', name: 'Power cell', powerBonus: 40, depthBand: [1, 99] },
  };
  // One shield charge per 2 time units (a time unit is
  // PLAYER_DEF.interval = 10 ticks).
  var SHIELD_RECHARGE_TICKS = 2 * PLAYER_DEF.interval;
  // The def (weapon or gear) for an id, or null. Single lookup for
  // every item-shaped value in the game.
  function itemDefFor(defId) { return WEAPON_DEFS[defId] || GEAR_DEFS[defId] || null; }
  function itemSlotOf(defId) {
    var def = itemDefFor(defId);
    if (!def) return null;
    return def.slot || 'weapon';
  }
  // Scaled value of one numeric gear stat: base x tier mult x
  // (1 + 12% per upgrade), rounded. Same formula shape as weapon
  // damage scaling, so a Rare +1 Alloy vest and a Rare +1 plasma
  // rifle scale alike. Zero stays zero (Scrap plating adds no HP).
  function gearStatValue(def, key, tier, upgrade) {
    var base = (def && typeof def[key] === 'number') ? def[key] : 0;
    if (!base) return 0;
    var mult = (TIERS[tier] || TIERS.common).mult * (1 + UPGRADE_DMG_PER_LEVEL * (upgrade || 0));
    return Math.max(0, Math.round(base * mult));
  }
  // Roll a fresh gear instance for a drop at this depth. Same tier +
  // upgrade rolls as weapons; gear rolls no properties (the property
  // pool is weapon-shaped: crit/range/lifesteal/salvage/evasion on
  // armor would be dead text — the tier/upgrade scaling carries the
  // interest). slot may force one slot (tests); otherwise uniform
  // among defs whose depth band covers this depth.
  // forcedTier (Phase 5 boss reward) pins the tier instead of rolling it.
  function rollGearItem(rng, depth, slot, forcedTier) {
    var eligible = Object.keys(GEAR_DEFS).filter(function (id) {
      var d = GEAR_DEFS[id];
      if (slot && d.slot !== slot) return false;
      return depth >= d.depthBand[0] && depth <= d.depthBand[1];
    });
    var defId = eligible[Math.floor(rng() * eligible.length)];
    var tier = forcedTier || rollTier(rng, depth);
    var upgrade = rollUpgrade(rng, depth);
    var flair = TIERS[tier].flair ? FLAIR_NAMES[Math.floor(rng() * FLAIR_NAMES.length)] : null;
    return makeItemInstance(defId, tier, upgrade, [], flair);
  }
  // One shared item-drop roll (Phase 2 §5.1): gear and weapon drops
  // share the roll, they do not double the drop rates. gearWeight is
  // the chance this drop is gear: kills 0.4, floor cache 0.5,
  // structure-room cache 0.7 (weighted toward gear, per §4.4).
  function rollDropItem(rng, depth, gearWeight) {
    if (rng() < gearWeight) return rollGearItem(rng, depth);
    return rollItem(rng, depth);
  }
  var WEAPONS = WEAPON_DEFS;
  // ---------- Phase 3: skill systems (LOOT-SKILLS-DESIGN.md §6) ----------
  // Two systems, two stores, two currencies — never merged. Pilot
  // skills live on the hub (banked salvage + Codex + pilot XP) and
  // survive death; mech skills live on the run (run skill points)
  // and die with the run. Every number below is a playtest starting
  // point, not a balance claim; rank-table picks are flagged in
  // beta-testers/PHASE3-REPORT.md.
  var PILOT_SKILLS = {
    steadyAim: { tree: 'combat', name: 'Steady Aim', desc: '+1 accuracy per rank.', costs: [20, 40, 80], xpNeeded: [0, 40, 120], codexNeeded: 0 },
    heavyHands: { tree: 'combat', name: 'Heavy Hands', desc: '+10% weapon damage per rank.', costs: [20, 40, 80], xpNeeded: [0, 40, 120], codexNeeded: 0 },
    secondWind: { tree: 'combat', name: 'Second Wind', desc: 'Once per run, survive a lethal hit at 1 HP. Higher ranks shorten the cooldown across runs (3/2/1 runs).', costs: [20, 40, 80], xpNeeded: [0, 40, 120], codexNeeded: 1 },
    triggerDiscipline: { tree: 'combat', name: 'Trigger Discipline', desc: 'Every Nth shot costs 1 less ammo (N = 5 - rank: 4/3/2).', costs: [20, 40, 80], xpNeeded: [0, 40, 120], codexNeeded: 1 },
    salvageSense: { tree: 'scavenging', name: 'Salvage Sense', desc: '+2 salvage from kills per rank.', costs: [20, 40, 80], xpNeeded: [0, 40, 120], codexNeeded: 0 },
    breakdown: { tree: 'scavenging', name: 'Breakdown', desc: 'Unlocks dismantling at rank 1; yields are fixed at every rank (Phase 4).', costs: [20, 40, 80], xpNeeded: [0, 40, 120], codexNeeded: 1, unlocksPhase4: 'breakdown' },
    deepPockets: { tree: 'scavenging', name: 'Deep Pockets', desc: '+25% wreck salvage recovery value per rank. (No carried cap exists, so the cap half of the spec is dormant.)', costs: [20, 40, 80], xpNeeded: [0, 40, 120], codexNeeded: 1 },
    codexEye: { tree: 'scavenging', name: 'Codex Eye', desc: 'Data chips reveal an extra rumor/clue.', costs: [20, 40, 80], xpNeeded: [0, 40, 120], codexNeeded: 2 },
    fieldRepair: { tree: 'engineering', name: 'Field Repair', desc: 'Repair kits restore +10 HP per rank.', costs: [20, 40, 80], xpNeeded: [0, 40, 120], codexNeeded: 0 },
    ammoSmith: { tree: 'engineering', name: 'Ammo Smith', desc: 'Unlocks Phase 4 ammo recipes, one type per rank (Phase 4).', costs: [20, 40, 80], xpNeeded: [0, 40, 120], codexNeeded: 1, unlocksPhase4: 'ammoRecipes' },
    overclockTuning: { tree: 'engineering', name: 'Overclock Tuning', desc: 'Mech skills cost 10% less energy per rank.', costs: [20, 40, 80], xpNeeded: [0, 40, 120], codexNeeded: 2 },
    platingKnowhow: { tree: 'engineering', name: 'Plating Know-how', desc: '+1 armor per rank while armor gear is equipped.', costs: [20, 40, 80], xpNeeded: [0, 40, 120], codexNeeded: 2 },
  };
  var PILOT_SKILL_TREES = [
    { id: 'combat', name: 'Combat', skills: ['steadyAim', 'heavyHands', 'secondWind', 'triggerDiscipline'] },
    { id: 'scavenging', name: 'Scavenging', skills: ['salvageSense', 'breakdown', 'deepPockets', 'codexEye'] },
    { id: 'engineering', name: 'Engineering', skills: ['fieldRepair', 'ammoSmith', 'overclockTuning', 'platingKnowhow'] },
  ];
  var RESPEC_COST_PER_RANK = 25;
  // Pilot XP awards (PROPOSED starting points, §6.1): kills +2, data
  // chip +5 (+5 more for a new Codex entry), descending +10. XP is
  // a pending run pool until banked in full at descend/extract;
  // death loses the unbanked pool, like unbanked salvage.
  var PILOT_XP_PER_KILL = 2;
  var PILOT_XP_PER_DATACHIP = 5;
  var PILOT_XP_NEW_CODEX = 5;
  var PILOT_XP_PER_DESCEND = 10;
  // Mech skills: learned with run skill points, used with time +
  // energy + heat. Energy 100, heat 0-100, overheat at >=100 locks
  // skills until cooled below 50. Learn cost is per skill.
  var ENERGY_MAX = 100;
  var ENERGY_REGEN_PER_UNIT = 10;
  var HEAT_MAX = 100;
  var HEAT_DISSIPATE_PER_UNIT = 10;
  var HEAT_OVERHEAT = 100;
  var HEAT_COOL_BELOW = 50;
  var MECH_SKILLS = {
    overclock: { name: 'Overclock', desc: 'Next 3 shots deal +25% damage.', energy: 20, heat: 30, timeCost: 1, learnCost: 2 },
    evasiveProtocols: { name: 'Evasive Protocols', desc: '+4 evasion for 5 time units.', energy: 20, heat: 15, timeCost: 1, learnCost: 2 },
    emergencyPlating: { name: 'Emergency Plating', desc: '+3 armor for 5 time units.', energy: 20, heat: 15, timeCost: 1, learnCost: 2 },
    sensorPulse: { name: 'Sensor Pulse', desc: 'Reveal the current room, including hidden traps.', energy: 15, heat: 10, timeCost: 1, learnCost: 2 },
    salvageBurst: { name: 'Salvage Burst', desc: 'The next kill drops double salvage.', energy: 15, heat: 15, timeCost: 1, learnCost: 2 },
    ventHeat: { name: 'Vent Heat', desc: 'Clear all heat.', energy: 10, heat: 0, timeCost: 1, learnCost: 2 },
  };
  var STARTING_AMMO = 16; // Phase 1 tuning (sim gate 4.5): 12 left depth-2 ranged share at 0.33; 16 + 8/crate clears 0.7
  var AMMO_CRATE_VALUE = 8; // Phase 1 tuning (sim gate 4.5): was 6

  // ---------- typed ammo, materials, statuses (Phase 4, §7.6) ----------
  // Four typed pools replace the single ammo pool. The single-pool
  // STARTING_AMMO/AMMO_CRATE_VALUE numbers are preserved: the default
  // loadout is 16 Standard, crates add 8 Standard.
  var AMMO_TYPES = ['standard', 'piercing', 'incendiary', 'shock'];
  var AMMO_TYPE_NAMES = { standard: 'Standard', piercing: 'Piercing', incendiary: 'Incendiary', shock: 'Shock' };
  var AMMO_TYPE_SHORT = { standard: 'Std', piercing: 'Prc', incendiary: 'Inc', shock: 'Shk' };
  var HUB_MATERIAL_CAP = 999;
  var HUB_AMMO_CAP = 999;
  var RUN_AMMO_CAP = 99;
  var LOADOUT_TOTAL_CAP = 16;
  var LOADOUT_TYPE_CAP = 12;
  var MATERIAL_KEYS = ['wire', 'coreThermal', 'coreShock', 'coreCorrosive'];
  var CORE_KEYS = ['coreThermal', 'coreShock', 'coreCorrosive'];
  var ELEMENT_VALUES = [null, 'thermal', 'shock', 'corrosive'];
  // Breakdown yields are FIXED at every Breakdown rank (§7.6.1).
  // `cores` is the number of independent uniform 1/3 core rolls.
  var BREAKDOWN_YIELDS = {
    component: { wire: 3, cores: 1 },
    common: { wire: 2, cores: 0 },
    uncommon: { wire: 4, cores: 1 },
    rare: { wire: 6, cores: 2 },
    epic: { wire: 10, cores: 3 },
    legendary: { wire: 16, cores: 5 },
  };
  var BURN_BASE_DMG = 3;
  var BURN_TICKS = 3;
  var ENHANCE_MAX_UPGRADE = 5;
  var ENHANCE_WIRE_PER_LEVEL = 4; // wire cost = 4 x target level
  function emptyAmmoPools() { return { standard: 0, piercing: 0, incendiary: 0, shock: 0 }; }
  function emptyMaterials() { return { wire: 0, coreThermal: 0, coreShock: 0, coreCorrosive: 0 }; }
  function isAmmoType(t) { return AMMO_TYPES.indexOf(t) >= 0; }
  function clampPools(pools, cap) {
    var out = emptyAmmoPools();
    AMMO_TYPES.forEach(function (t) {
      var v = pools && pools[t];
      out[t] = typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(cap, Math.floor(v))) : 0;
    });
    return out;
  }
  function clampMaterials(m) {
    var out = emptyMaterials();
    MATERIAL_KEYS.forEach(function (k) {
      var v = m && m[k];
      out[k] = typeof v === 'number' && isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
    });
    return out;
  }
  function totalAmmo(pools) {
    var n = 0;
    AMMO_TYPES.forEach(function (t) { n += (pools && pools[t]) || 0; });
    return n;
  }
  // One core roll: a uniform 1/3 draw on the game's seeded stream.
  // Never Math.random() — the stream is the determinism contract.
  function rollCore(rng) {
    var r = rng();
    return r < 1 / 3 ? 'coreThermal' : (r < 2 / 3 ? 'coreShock' : 'coreCorrosive');
  }
  function rollCores(rng, n) {
    var counts = { coreThermal: 0, coreShock: 0, coreCorrosive: 0 };
    for (var i = 0; i < n; i++) counts[rollCore(rng)]++;
    return counts;
  }
  // Status resistance, read from the ENEMY_TYPES extension (§7.6.5).
  // Unknown types default to 0 resistance.
  function statusResist(type, kind) {
    var def = ENEMY_TYPES[type];
    var r = def && def.resist && def.resist[kind];
    return typeof r === 'number' ? r : 0;
  }
  function burnTickDamage(type) {
    return Math.max(1, Math.floor(BURN_BASE_DMG * (1 - statusResist(type, 'burning'))));
  }
  function enemyStatuses(foe) {
    if (!Array.isArray(foe.statuses)) foe.statuses = [];
    return foe.statuses;
  }
  function findStatus(foe, kind) {
    var list = enemyStatuses(foe);
    for (var i = 0; i < list.length; i++) if (list[i].kind === kind) return list[i];
    return null;
  }
  // Burning: 3 HP per elapsed time unit x 3 ticks, refresh-no-stack.
  // Returns the status record. Does not roll resistance here — the
  // resistance is baked into burnTickDamage at tick time.
  function applyBurning(state, foe) {
    var st = findStatus(foe, 'burning');
    if (st) {
      st.ticksLeft = BURN_TICKS;
      logMsg(state, foe.name + "'s burning refreshes.");
    } else {
      st = { kind: 'burning', ticksLeft: BURN_TICKS };
      enemyStatuses(foe).push(st);
      logMsg(state, foe.name + ' is burning!');
    }
    return st;
  }
  // Jammed: skips exactly the next scheduled activation. The
  // resistance roll happens here, on the seeded stream, and only
  // after a confirmed hit (callers guarantee that ordering).
  function applyJammed(state, rng, foe) {
    var r = statusResist(foe.type, 'jammed');
    if (r > 0 && rng() < r) {
      logMsg(state, foe.name + ' Resisted the jam!');
      return { applied: false, resisted: true };
    }
    var st = findStatus(foe, 'jammed');
    if (st) {
      logMsg(state, foe.name + ' is jammed again.');
    } else {
      enemyStatuses(foe).push({ kind: 'jammed' });
      logMsg(state, foe.name + ' is jammed!');
    }
    return { applied: true, resisted: false };
  }
  // Tick all statuses for one elapsed time unit. Burning ticks once
  // per unit regardless of activation; a tick-killed enemy dies
  // through the ordinary path exactly once. Returns 'dead' when the
  // tick killed the enemy, else 'alive'.
  function tickStatuses(state, rng, foe) {
    var st = findStatus(foe, 'burning');
    if (!st) return 'alive';
    var dmg = burnTickDamage(foe.type);
    foe.hp -= dmg;
    foe.awake = true;
    logMsg(state, foe.name + ' burns for ' + dmg + '!');
    st.ticksLeft -= 1;
    if (st.ticksLeft <= 0) {
      var list = enemyStatuses(foe);
      list.splice(list.indexOf(st), 1);
      logMsg(state, 'The burning on ' + foe.name + ' burns out.');
    }
    if (foe.hp <= 0) {
      killEnemy(state, rng, foe);
      return 'dead';
    }
    // Phase 5: a burn tick that crosses the half-HP line releases
    // the boss drones (lethal ticks do not — see maybeSpawnBossDrones).
    maybeSpawnBossDrones(state, rng, foe);
    return 'alive';
  }

  // ---------- loot tiers, upgrade levels, properties (Phase 1, §4.2–4.3) ----------
  var TIERS = {
    common: { name: 'Common', color: '#c8c8c8', mult: 1.00, slots: 0 },
    uncommon: { name: 'Uncommon', color: '#35e05c', mult: 1.10, slots: 0 },
    rare: { name: 'Rare', color: '#4aa8ff', mult: 1.22, slots: 1 },
    epic: { name: 'Epic', color: '#b46ae0', mult: 1.35, slots: 2 },
    legendary: { name: 'Legendary', color: '#ffb020', mult: 1.50, slots: 2, flair: true },
  };
  var TIER_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  // Rarity weights by depth (PROPOSED, §4.3). Legendary never above ~3%.
  var RARITY_WEIGHTS = {
    1: { common: 62, uncommon: 25, rare: 10, epic: 2.5, legendary: 0.5 },
    2: { common: 55, uncommon: 27, rare: 13, epic: 4, legendary: 1 },
    3: { common: 48, uncommon: 28, rare: 16, epic: 6, legendary: 2 },
    4: { common: 42, uncommon: 28, rare: 18, epic: 9, legendary: 3 },
    6: { common: 38, uncommon: 27, rare: 20, epic: 12, legendary: 3 },
  };
  // Upgrade weights by depth band (PROPOSED, §4.3). Depth 1 caps at +1,
  // so a depth-1 Legendary is always +0 or +1, never higher.
  var UPGRADE_WEIGHTS = {
    1: [80, 20, 0, 0, 0, 0],
    2: [55, 35, 10, 0, 0, 0],
    3: [40, 35, 20, 5, 0, 0],
    4: [30, 30, 25, 12, 3, 0],
    6: [22, 28, 25, 15, 8, 2],
  };
  var UPGRADE_DMG_PER_LEVEL = 0.12;
  // Property pool (PROPOSED, §4.2): exactly 5, data-driven. Slots come
  // from the tier table; properties are rolled without duplicates.
  var PROPERTIES = {
    crit: { name: 'Crit window', desc: '10% crit chance; crits deal double damage' },
    range: { name: 'Long barrel', desc: '+1 range' },
    lifesteal: { name: 'Siphon', desc: 'Heal 5 HP on a kill while equipped' },
    salvage: { name: 'Scavenger', desc: '+2 salvage on kill drops while equipped' },
    evasion: { name: 'Agile frame', desc: '+2 evasion while equipped' },
  };
  var FLAIR_NAMES = ['Ember', 'Widowmaker', 'Last Word', 'Rust Saint', 'Quiet Thunder', 'Motherlode', 'Long Night', 'Scrap Saint'];
  function tierColor(tier) { return (TIERS[tier] || TIERS.common).color; }
  function rarityWeightsFor(depth) {
    if (depth <= 1) return RARITY_WEIGHTS[1];
    if (depth === 2) return RARITY_WEIGHTS[2];
    if (depth === 3) return RARITY_WEIGHTS[3];
    if (depth <= 5) return RARITY_WEIGHTS[4];
    return RARITY_WEIGHTS[6];
  }
  function upgradeWeightsFor(depth) {
    if (depth <= 1) return UPGRADE_WEIGHTS[1];
    if (depth === 2) return UPGRADE_WEIGHTS[2];
    if (depth === 3) return UPGRADE_WEIGHTS[3];
    if (depth <= 5) return UPGRADE_WEIGHTS[4];
    return UPGRADE_WEIGHTS[6];
  }
  function rollTier(rng, depth) {
    var w = rarityWeightsFor(depth);
    var total = 0, i;
    for (i = 0; i < TIER_ORDER.length; i++) total += w[TIER_ORDER[i]];
    var roll = rng() * total;
    for (i = 0; i < TIER_ORDER.length; i++) {
      roll -= w[TIER_ORDER[i]];
      if (roll <= 0) return TIER_ORDER[i];
    }
    return 'common';
  }
  function rollUpgrade(rng, depth) {
    var w = upgradeWeightsFor(depth);
    var total = 0, i;
    for (i = 0; i < w.length; i++) total += w[i];
    var roll = rng() * total;
    for (i = 0; i < w.length; i++) {
      roll -= w[i];
      if (roll <= 0) return i;
    }
    return 0;
  }
  function rollProperties(rng, tier) {
    var slots = (TIERS[tier] || TIERS.common).slots || 0;
    if (!slots) return [];
    var pool = Object.keys(PROPERTIES);
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    return pool.slice(0, slots);
  }
  // Element tag (Phase 4, §7.6.7): explicit data only, never
  // inferred. Valid values: null (default), 'thermal', 'shock',
  // 'corrosive'. Any other value is rejected to null by validation.
  function validElement(el) {
    return el === 'thermal' || el === 'shock' || el === 'corrosive' ? el : null;
  }
  function makeItemInstance(defId, tier, upgrade, properties, flair, element) {
    if (!WEAPON_DEFS[defId] && !GEAR_DEFS[defId]) defId = 'scrapBlaster';
    if (!TIERS[tier]) tier = 'common';
    upgrade = Math.max(0, Math.min(5, Math.floor(upgrade) || 0));
    return { kind: 'item', defId: defId, tier: tier, upgrade: upgrade,
      properties: Array.isArray(properties) ? properties.slice() : [],
      flair: (TIERS[tier].flair && typeof flair === 'string') ? flair : null,
      element: validElement(element) };
  }
  // Roll a fresh item instance for a drop at this depth. defId may be
  // forced (tests); otherwise uniform among released defs whose depth
  // band covers this depth.
  // forcedTier (Phase 5 boss reward) pins the tier instead of rolling it.
  function rollItem(rng, depth, defId, forcedTier) {
    var eligible = Object.keys(WEAPON_DEFS).filter(function (id) {
      var d = WEAPON_DEFS[id];
      if (d.released === false) return false;
      return depth >= d.depthBand[0] && depth <= d.depthBand[1];
    });
    if (!defId || eligible.indexOf(defId) === -1) {
      defId = eligible[Math.floor(rng() * eligible.length)];
    }
    var tier = forcedTier || rollTier(rng, depth);
    var upgrade = rollUpgrade(rng, depth);
    var props = rollProperties(rng, tier);
    var flair = TIERS[tier].flair ? FLAIR_NAMES[Math.floor(rng() * FLAIR_NAMES.length)] : null;
    return makeItemInstance(defId, tier, upgrade, props, flair);
  }
  // Normalize any weapon value (legacy string, partial object, null)
  // into a valid instance. Never throws; unknown shapes become a
  // Common +0 scrap blaster.
  function normalizeWeaponInstance(w) {
    if (typeof w === 'string') return makeItemInstance(w, 'common', 0, [], null);
    if (w && typeof w === 'object' && WEAPON_DEFS[w.defId]) {
      return makeItemInstance(w.defId, w.tier, w.upgrade, w.properties, w.flair, w.element);
    }
    return makeItemInstance('scrapBlaster', 'common', 0, [], null);
  }
  // Normalize any item value (weapon or gear def) into a valid
  // instance. Never throws; unknown shapes become a Common +0
  // scrap blaster, the same default as normalizeWeaponInstance.
  function normalizeItemInstance(w) {
    if (typeof w === 'string') return makeItemInstance(w, 'common', 0, [], null);
    if (w && typeof w === 'object' && itemDefFor(w.defId)) {
      return makeItemInstance(w.defId, w.tier, w.upgrade, w.properties, w.flair, w.element);
    }
    return makeItemInstance('scrapBlaster', 'common', 0, [], null);
  }
  // Display name for any item: "[Rare] Alloy vest +1" /
  // "[Legendary] Rail gun 'Ember' +2". Same format as
  // weaponDisplayName, which stays the weapon-only entry point.
  function itemDisplayName(inst) {
    var w = normalizeItemInstance(inst);
    var def = itemDefFor(w.defId);
    var tierName = TIERS[w.tier].name;
    var s = '[' + tierName + '] ' + def.name;
    if (w.flair) s += " '" + w.flair + "'";
    s += ' +' + w.upgrade;
    return s;
  }
  // Display name: "[Rare] Plasma rifle +1" / "[Legendary] Rail gun 'Ember' +2".
  function weaponDisplayName(inst) {
    var w = normalizeWeaponInstance(inst);
    var def = WEAPON_DEFS[w.defId];
    var tierName = TIERS[w.tier].name;
    var s = '[' + tierName + '] ' + def.name;
    if (w.flair) s += " '" + w.flair + "'";
    s += ' +' + w.upgrade;
    return s;
  }
  // Derived stats for the equipped weapon: def values scaled by tier
  // multiplier and +12% damage per upgrade level (rounded, applied to
  // the rolled total — see rollDamageDetailed). Recomputed on every
  // read; nothing derived is stored.
  function weaponStats(state) {
    // state.weapon is the authority (Phase 1 contract, and the shape
    // the sim passes: { weapon: inst }). equipment.weapon is a
    // mirror kept in sync by setEquipped/deserializeRun; it is only
    // read when state.weapon is absent.
    var w = normalizeWeaponInstance(state && (state.weapon || (state.equipment && state.equipment.weapon)));
    var def = WEAPON_DEFS[w.defId];
    var tier = TIERS[w.tier];
    // Phase 3: Heavy Hands (pilot skill) scales weapon damage through
    // the derivedMods seam. Bare states (sim, legacy) carry no seam
    // value, so the multiplier stays 1 there.
    var pilotMult = 1 + ((state && state.derivedMods && typeof state.derivedMods.dmgMult === 'number') ? state.derivedMods.dmgMult : 0);
    var mult = tier.mult * (1 + UPGRADE_DMG_PER_LEVEL * w.upgrade) * pilotMult;
    var range = def.range + (w.properties.indexOf('range') !== -1 ? 1 : 0);
    return { def: def, defId: w.defId, tier: w.tier, upgrade: w.upgrade,
      properties: w.properties.slice(), flair: w.flair,
      dice: def.dice ? { num: def.dice.num, sides: def.dice.sides, plus: def.dice.plus } : null,
      pattern: def.pattern, shots: def.shots || 1, range: range,
      timeCost: def.timeCost, ammoPerShot: def.ammoPerShot, ammoType: def.ammoType,
      element: def.element, accBonus: def.accBonus || 0,
      pierceArmor: !!def.pierceArmor, arc: !!def.arc, burn: def.burn || null,
      mult: mult, displayName: weaponDisplayName(w) };
  }
  function weaponHasProperty(state, prop) {
    var w = normalizeWeaponInstance(state && state.weapon);
    return w.properties.indexOf(prop) !== -1;
  }
  function playerEvasion(state) {
    var base = (state && state.player && typeof state.player.evasion === 'number')
      ? state.player.evasion : PLAYER_DEF.evasion;
    var bonus = weaponHasProperty(state, 'evasion') ? 2 : 0;
    // Gyro-stabilizer (utility gear) stacks with the weapon property.
    var util = equippedGear(state, 'utility');
    if (util) bonus += gearStatValue(GEAR_DEFS[util.defId], 'evasion', util.tier, util.upgrade);
    // Phase 3: Evasive Protocols, +4 evasion while the window runs.
    if (mechEffectActive(state, 'evasiveUntil')) bonus += 4;
    return base + bonus;
  }
  // ---------- Phase 2: derived stats, shield, Bag equip ----------
  // The equipped piece in one slot, normalized, or null. The weapon
  // slot is never empty (it defaults to the starter blaster); gear
  // slots are null when empty. A defId in the wrong slot is corrupt
  // data and reads as empty rather than crashing.
  function equippedGear(state, slot) {
    if (slot === 'weapon') {
      return normalizeWeaponInstance(state && (state.weapon || (state.equipment && state.equipment.weapon)));
    }
    var eq = state && state.equipment;
    var inst = eq ? eq[slot] : null;
    if (!inst || !GEAR_DEFS[inst.defId] || GEAR_DEFS[inst.defId].slot !== slot) return null;
    return normalizeItemInstance(inst);
  }
  // A wreck's gear, or any loose gear value, normalized into the
  // 4-slot shape. Missing/legacy values become all-null (nothing to
  // recover); the weapon slot keeps null here so a legacy wreck
  // never invents a weapon it never held.
  function normalizeGearSet(gear) {
    var out = { weapon: null, armor: null, shield: null, utility: null };
    if (!gear || typeof gear !== 'object') return out;
    if (gear.weapon) out.weapon = normalizeWeaponInstance(gear.weapon);
    ['armor', 'shield', 'utility'].forEach(function (slot) {
      var inst = gear[slot];
      if (inst && GEAR_DEFS[inst.defId] && GEAR_DEFS[inst.defId].slot === slot) {
        out[slot] = normalizeItemInstance(inst);
      }
    });
    return out;
  }
  // Derived stats: base + chassis tier (already folded into
  // player.maxHp at newRun) + equipped gear. Recomputed on every
  // read; NOTHING derived is stored. Phase 3 seam: skill systems
  // write state.derivedMods ({armor,maxHp,evasion,range,sight,
  // shieldCapacity,powerBonus}, all numbers, all optional); nothing
  // writes it today, so it contributes zero.
  // Phase 3: mech effects are clock-bound state (mechEffects on the
  // run). True only while the run clock is inside the effect window.
  function mechEffectActive(state, untilKey) {
    return !!(state && state.mechEffects && typeof state.clock === 'number'
      && typeof state.mechEffects[untilKey] === 'number'
      && state.clock < state.mechEffects[untilKey]);
  }
  function derivedStats(state) {
    var mods = (state && state.derivedMods) || {};
    function mod(key) { return typeof mods[key] === 'number' ? mods[key] : 0; }
    var armor = equippedGear(state, 'armor');
    var shield = equippedGear(state, 'shield');
    var util = equippedGear(state, 'utility');
    var baseMaxHp = (state && state.player && typeof state.player.maxHp === 'number')
      ? state.player.maxHp : PLAYER_DEF.hp;
    var range = weaponStats(state).range;
    var sight = 8;
    var powerBonus = 0;
    if (util) {
      var udef = GEAR_DEFS[util.defId];
      range += gearStatValue(udef, 'range', util.tier, util.upgrade);
      sight += gearStatValue(udef, 'sight', util.tier, util.upgrade);
      powerBonus += gearStatValue(udef, 'powerBonus', util.tier, util.upgrade);
    }
    return {
      armor: PLAYER_DEF.armor + (armor ? gearStatValue(GEAR_DEFS[armor.defId], 'armor', armor.tier, armor.upgrade) : 0) + mod('armor') + (mechEffectActive(state, 'platingUntil') ? 3 : 0),
      maxHp: baseMaxHp + (armor ? gearStatValue(GEAR_DEFS[armor.defId], 'hp', armor.tier, armor.upgrade) : 0) + mod('maxHp'),
      evasion: playerEvasion(state) + mod('evasion'),
      range: range + mod('range'),
      sight: sight + mod('sight'),
      shieldCapacity: (shield ? gearStatValue(GEAR_DEFS[shield.defId], 'capacity', shield.tier, shield.upgrade) : 0) + mod('shieldCapacity'),
      powerBonus: powerBonus + mod('powerBonus'),
      // Phase 3: pilot-skill modifiers arrive through the derivedMods
      // seam only; defaults keep Phase 1/2 behavior identical.
      acc: PLAYER_DEF.acc + mod('acc'),
      dmgMult: 1 + mod('dmgMult'),
    };
  }
  // Shield absorb: damage hits the shield pool before the hull, after
  // armor (the caller applies armor first). Returns {absorbed,
  // remaining}; mutates state.shield only. No logging here — callers
  // own their log lines. No shield equipped, or an empty pool,
  // absorbs nothing.
  function applyShield(state, dmg) {
    var pool = (state && typeof state.shield === 'number') ? state.shield : 0;
    if (!(pool > 0) || !(dmg > 0)) return { absorbed: 0, remaining: dmg };
    var absorbed = Math.min(pool, dmg);
    state.shield = pool - absorbed;
    return { absorbed: absorbed, remaining: dmg - absorbed };
  }
  // Shield recharge, called from the scheduler after the clock
  // advances: 1 charge per SHIELD_RECHARGE_TICKS while below
  // capacity. A full pool never banks charge (the next due time is
  // re-anchored every pass while full), so taking a hit after idling
  // at full does not instantly refill. Swapping shields (or losing
  // the slot) resets the pool — see equipCarried/unequip.
  function rechargeShield(state) {
    if (!state || !equippedGear(state, 'shield')) { if (state) state.shield = 0; return; }
    var cap = derivedStats(state).shieldCapacity;
    if (typeof state.shield !== 'number' || state.shield < 0) state.shield = 0;
    if (state.shield > cap) state.shield = cap;
    if (typeof state.shieldNextRecharge !== 'number') state.shieldNextRecharge = state.clock + SHIELD_RECHARGE_TICKS;
    if (state.shield >= cap) {
      state.shieldNextRecharge = state.clock + SHIELD_RECHARGE_TICKS;
      return;
    }
    while (state.shield < cap && state.clock >= state.shieldNextRecharge) {
      state.shield++;
      state.shieldNextRecharge += SHIELD_RECHARGE_TICKS;
    }
  }
  // Clamp current HP to the derived max (armor gear removed or
  // swapped down). Max HP going UP never heals.
  function clampHpToMax(state) {
    if (!state || !state.player) return;
    var max = derivedStats(state).maxHp;
    if (state.player.hp > max) state.player.hp = max;
  }
  // Low-level equip sync: writes the slot and, for the weapon, the
  // state.weapon mirror. Gameplay swaps go through equipCarried /
  // unequip (shield reset, HP clamp, log); loading goes through
  // deserializeRun (which must NOT reset the shield pool).
  function setEquipped(state, slot, inst) {
    if (!state.equipment || typeof state.equipment !== 'object') {
      state.equipment = { weapon: null, armor: null, shield: null, utility: null };
    }
    if (slot === 'weapon') {
      state.equipment.weapon = normalizeWeaponInstance(inst);
      state.weapon = state.equipment.weapon;
    } else {
      state.equipment[slot] = inst ? normalizeItemInstance(inst) : null;
    }
  }
  // Bag-only equip/swap (Phase 2 §5.3): costs no time — no clock
  // advance, no scheduler pass, no action counted. The replaced
  // piece returns to the carried list; nothing is ever destroyed by
  // a swap. A freshly equipped shield starts empty (it charges up);
  // swapping shields for a free full pool is not a thing.
  function equipCarried(state, index) {
    if (state.state !== 'playing' && state.state !== 'stairs') return { ok: false, reason: 'not playing' };
    if (!Array.isArray(state.carriedGear)) state.carriedGear = [];
    if (index < 0 || index >= state.carriedGear.length) return { ok: false, reason: 'no carried item there' };
    var inst = normalizeItemInstance(state.carriedGear[index]);
    var slot = itemSlotOf(inst.defId);
    if (!slot) return { ok: false, reason: 'not an item' };
    var old = equippedGear(state, slot);
    setEquipped(state, slot, inst);
    if (old) state.carriedGear[index] = old;
    else state.carriedGear.splice(index, 1);
    if (slot === 'shield') {
      state.shield = 0;
      state.shieldNextRecharge = state.clock + SHIELD_RECHARGE_TICKS;
    }
    clampHpToMax(state);
    refreshPilotMods(state); // Plating Know-how keys off armor gear.
    logMsg(state, old ? 'Equipped ' + itemDisplayName(inst) + ' (' + itemDisplayName(old) + ' stowed in the Bag).'
      : 'Equipped ' + itemDisplayName(inst) + '.');
    return { ok: true, equipped: inst, stowed: old || null };
  }
  // Bag-only unequip (armor/shield/utility only — the weapon is
  // swapped, never removed; an empty weapon slot would just fall
  // back to the starter blaster). Costs no time, like equipCarried.
  function unequip(state, slot) {
    if (state.state !== 'playing' && state.state !== 'stairs') return { ok: false, reason: 'not playing' };
    if (slot === 'weapon') return { ok: false, reason: 'Swap the weapon from the Bag instead of removing it.' };
    if (slot !== 'armor' && slot !== 'shield' && slot !== 'utility') return { ok: false, reason: 'unknown slot' };
    var old = equippedGear(state, slot);
    if (!old) return { ok: false, reason: 'nothing equipped there' };
    if (!Array.isArray(state.carriedGear)) state.carriedGear = [];
    setEquipped(state, slot, null);
    state.carriedGear.push(old);
    if (slot === 'shield') state.shield = 0;
    clampHpToMax(state);
    refreshPilotMods(state); // Plating Know-how keys off armor gear.
    logMsg(state, 'Removed ' + itemDisplayName(old) + ' to the Bag.');
    return { ok: true, removed: old };
  }
  // Dice rolls: rollDiceDetailed returns the rolls, the subtotal, the
  // scaled total, and a log-ready detail string. rollDamage keeps its
  // old numeric contract; the dice branch fires when the attacker
  // carries a dice spec (weapons only — melee/enemies keep flat+var).
  function rollDiceDetailed(rng, diceSpec, dmgMult) {
    var rolls = [], subtotal = diceSpec.plus || 0, i;
    for (i = 0; i < diceSpec.num; i++) {
      var r = 1 + Math.floor(rng() * diceSpec.sides);
      rolls.push(r); subtotal += r;
    }
    var total = (dmgMult && dmgMult !== 1) ? Math.max(1, Math.round(subtotal * dmgMult)) : subtotal;
    var detail = diceSpec.num + 'd' + diceSpec.sides + '+' + (diceSpec.plus || 0) + ': ' +
      rolls.join('+') + '+' + (diceSpec.plus || 0) + ' = ' + subtotal;
    if (dmgMult && dmgMult !== 1) detail += ' x' + dmgMult.toFixed(2) + ' -> ' + total;
    return { rolls: rolls, subtotal: subtotal, total: total, detail: detail };
  }
  function rollDamageDetailed(rng, attacker) {
    if (attacker.dice) {
      return rollDiceDetailed(rng, attacker.dice, attacker.dmgMult || 1);
    }
    var total = attacker.dmg + Math.floor(rng() * (attacker.dmgVar + 1));
    return { rolls: [], subtotal: total, total: total, detail: String(total) };
  }
  // Player interval 10 = 1 time unit. Enemy intervals are in the same
  // ticks: smaller = faster. Raider 8 and drone 7 act more often than
  // the player per unit; brute 14 acts less often. This is the whole
  // Pixel Dungeon time system in one table.

  // ---------- Phase 5: biome rosters, themes, room purposes ----------
  // Theme mapping, shared by generation and roster math. Identical to
  // the mapping generateFloor used inline before Phase 5 (verified
  // against the shipped depths 1-15+ assignment).
  var THEME_CYCLE = ['molten', 'frozen', 'toxic', 'neon'];
  function themeNameForDepth(depth) {
    if (depth === 1) return 'industrial';
    if (depth <= 3) return 'scrapyard';
    if (depth <= 5) return 'overgrown';
    if (depth === 6) return 'cavern';
    if (depth <= 10) return THEME_CYCLE[depth - 7];
    return THEME_CYCLE[(depth - 11) % 4];
  }
  // Room purposes (Phase 5, §8.5.4): only 'structure' rooms draw a
  // purpose. A security room is NOT guaranteed — each structure room
  // draws uniformly from the five purposes on the floor RNG, in room
  // order, immediately after the forceType guarantees (documented
  // draw position; the spec is silent on the distribution).
  // Purpose draw order follows the §8.5.1 listing (uniform 1/5 each;
  // only the draw-value mapping differs from any other order).
  var ROOM_PURPOSES = ['workshop', 'reactor', 'storage', 'security', 'arena'];
  // Roster tables (§8.1 base weights, listed order preserved), except
  // the elite table, whose order follows the §8.5.3 worked examples:
  // the donor pool is the first two entries (Shielder, Turret).
  var ROSTER_TABLES = {
    industrial: { firstDepth: 1, entries: [['raider', 5], ['drone', 3], ['brute', 2]] },
    scrapyard: { firstDepth: 2, entries: [['raider', 3], ['drone', 3], ['brute', 2], ['turret_light', 2], ['flyer', 2]] },
    overgrown: { firstDepth: 4, entries: [['raider', 2], ['drone', 2], ['brute', 2], ['turret_light', 1], ['flyer', 2], ['shielder', 2], ['sniper', 1]] },
    cavern: { firstDepth: 6, entries: [['brute', 3], ['shielder', 2], ['sniper', 2], ['bomber', 2], ['flyer', 1], ['turret_light', 2]] },
    elite: { firstDepth: 7, entries: [['shielder', 2], ['turret_light', 2], ['flyer', 2], ['brute', 2], ['sniper', 2], ['bomber', 2]] },
  };
  function rosterTableForDepth(depth) {
    var theme = themeNameForDepth(depth);
    if (theme === 'industrial') return ROSTER_TABLES.industrial;
    if (theme === 'scrapyard') return ROSTER_TABLES.scrapyard;
    if (theme === 'overgrown') return ROSTER_TABLES.overgrown;
    if (theme === 'cavern') return ROSTER_TABLES.cavern;
    return ROSTER_TABLES.elite;
  }
  // Donor-pool shift (§8.5.3, Exchange 3 formula): k = depth - first
  // depth of the theme; p = min(0.10k, 0.50); F = the first two
  // entries' original total weight; shift F*p out of the donors
  // proportionally and into the recipients proportionally. Weights
  // stay full-precision floats; callers format to 4 decimals for
  // reporting. Selection normalizes by the adjusted sum (which
  // equals the original total — the shift conserves weight).
  function rosterWeightsFor(depth) {
    var table = rosterTableForDepth(depth);
    var k = depth - table.firstDepth;
    var p = Math.min(0.10 * k, 0.50);
    var entries = table.entries.map(function (e) { return { type: e[0], weight: e[1] }; });
    if (p > 0 && entries.length > 2) {
      var donorTotal = entries[0].weight + entries[1].weight;
      var recipTotal = 0, i;
      for (i = 2; i < entries.length; i++) recipTotal += entries[i].weight;
      var shift = donorTotal * p;
      for (i = 0; i < 2; i++) entries[i].weight -= shift * (entries[i].weight / donorTotal);
      for (i = 2; i < entries.length; i++) entries[i].weight += shift * (entries[i].weight / recipTotal);
    }
    return { theme: themeNameForDepth(depth), weights: entries };
  }
  function pickRosterType(rng, depth) {
    var w = rosterWeightsFor(depth).weights;
    var total = 0, i;
    for (i = 0; i < w.length; i++) total += w[i].weight;
    var roll = rng() * total;
    for (i = 0; i < w.length; i++) {
      roll -= w[i].weight;
      if (roll < 0) return w[i].type;
    }
    return w[w.length - 1].type;
  }
  // Chebyshev distance — the §8.5.10 metric for every stated tile
  // distance except the bomber fuse (Manhattan 1). Shipped code mixes
  // metrics (movement steps use Manhattan, spawn exclusion uses
  // Chebyshev); new Phase 5 checks use this helper.
  function chebDist(x0, y0, x1, y1) {
    return Math.max(Math.abs(x0 - x1), Math.abs(y0 - y1));
  }
  // Nearest cardinal of a bearing (dx, dy), ties resolve N, E, S, W
  // (§8.5.6 spawn-facing rule; also used for diagonal move steps).
  function nearestCardinal(dx, dy) {
    var ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax === 0 && ay === 0) return 'N';
    if (ax > ay) return dx > 0 ? 'E' : 'W';
    if (ay > ax) return dy > 0 ? 'S' : 'N';
    // Exact diagonal: tie order N, E, S, W.
    if (dx > 0 && dy < 0) return 'N'; // NE -> N
    if (dx > 0 && dy > 0) return 'E'; // SE -> E
    if (dx < 0 && dy > 0) return 'S'; // SW -> S
    return 'N'; // NW -> N
  }
  // Shielder frontal arc (§8.5.6): 90 degrees total around the stored
  // cardinal facing, boundary included. The attacker direction is
  // classified into the 8 compass points from the shielder; frontal
  // is the facing point plus its two diagonal neighbours.
  var FRONTAL_DIRS = {
    N: [[0, -1], [1, -1], [-1, -1]],
    E: [[1, 0], [1, -1], [1, 1]],
    S: [[0, 1], [1, 1], [-1, 1]],
    W: [[-1, 0], [-1, -1], [-1, 1]],
  };
  function shieldFacingOf(foe) {
    return (foe && typeof foe.shieldFacing === 'string' && FRONTAL_DIRS[foe.shieldFacing]) ? foe.shieldFacing : 'N';
  }
  function isFrontalShieldHit(foe, sx, sy) {
    var step = [Math.sign(sx - foe.x), Math.sign(sy - foe.y)];
    if (step[0] === 0 && step[1] === 0) return true;
    var dirs = FRONTAL_DIRS[shieldFacingOf(foe)];
    for (var i = 0; i < dirs.length; i++) if (dirs[i][0] === step[0] && dirs[i][1] === step[1]) return true;
    return false;
  }
  function shieldedRawDamage(foe, sx, sy, raw) {
    return isFrontalShieldHit(foe, sx, sy) ? Math.floor(raw * 0.5) : raw;
  }
  // Boss placement (§8.5.4): first security room in generator order;
  // walkable unoccupied 'floor' cells only; >=3 Chebyshev from spawn;
  // greatest distance wins, ties resolve by scan order (row, then
  // column ascending). No fallback to other room types; no RNG draws.
  // Returns {boss, reason}; pushes the boss record when present.
  // ---------- Phase 6: doors, visibility, locked rooms (LOOT-SKILLS-DESIGN.md §9/§9.7) ----------
  // Generation signature versions (§9.7.10): bumped when a rule
  // changes; the golden-seed test keys on the whole signature.
  var GENERATION_VERSION = 6;
  var RULESET_VERSION = 1;
  var RNG_ALGORITHM_VERSION = 1;
  var TILE_CATALOG_VERSION = 1;
  var GENERATION_MAX_ATTEMPTS = 8;
  var DOOR_WAKE_RANGE = 8; // Chebyshev, §9.7.4
  var FOG_DIM_ALPHA = 0.55; // explored-but-not-current renders at 45% brightness, §9.7.6
  var LOCK_HP_PER_LEVEL = 20; // flat 20/40/60, §9.7.5
  var LOCKED_KINDS = ['lootVault', 'newArea', 'objective'];
  var OBJECTIVE_CHOICES = ['codex', 'drop', 'lore'];
  var BYPASS_REFUSAL = 'Bypass unavailable: no compatible lockpick skill is defined in the current skill system. Use the matching key or force the door.';
  // Lore-console lines: original text, no quotation from any work.
  var LORE_LINES = [
    'The terminal flickers: "They sealed this wing when the lights learned to watch back."',
    'The terminal flickers: "Do not trust the quiet rooms. The quiet ones are listening."',
    'The terminal flickers: "The last crew left the doors shut for a reason. We open them anyway."',
    'The terminal flickers: "Salvage is just history that has not finished happening yet."',
  ];
  function doorIdFor(x, y) { return 'door:' + y + ':' + x; } // y=row, x=column
  function roomIdFor(idx) { return 'room:' + idx; }
  function roomIndexAt(rooms, x, y) {
    for (var i = 0; i < rooms.length; i++) {
      var r = rooms[i];
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
    }
    return -1;
  }
  function doorAt(floor, x, y) {
    if (!floor || !Array.isArray(floor.doors)) return null;
    for (var i = 0; i < floor.doors.length; i++) {
      if (floor.doors[i].x === x && floor.doors[i].y === y) return floor.doors[i];
    }
    return null;
  }
  function doorBlocksSight(state, x, y) {
    if (!state || !state.floor) return false;
    var d = doorAt(state.floor, x, y);
    return !!d && d.state !== 'open';
  }
  function doorBlocksMovement(state, x, y) {
    if (!state || !state.floor) return false;
    var d = doorAt(state.floor, x, y);
    return !!d && d.state !== 'open';
  }
  // Threshold classification (§9.7.2). Operates on grid + rooms
  // alone: corridor routes are NOT recorded on the floor (the
  // `connections` array is local to generateFloor), so condition (4)
  // — the cell lies on a carved corridor route — is satisfied from
  // the walkable component reachable from spawn. A cell qualifies
  // for a room when, along one axis, one neighbour is that room's
  // floor and the opposite neighbour is corridor outside every room
  // rect; a cell qualifying for two rooms is a door for neither.
  // Grouping is 4-dir adjacency among one room's candidates: a
  // contiguous mouth segment is ONE entrance; distinct boundary
  // segments keep distinct doors. No RNG is consumed.
  function classifyDoorCells(grid, rooms, spawn) {
    function kindAt(x, y) {
      if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return 'void';
      var t = grid[y][x];
      return t === 'door' ? 'corridor' : t;
    }
    var comp = {};
    var q = [[spawn.x, spawn.y]];
    comp[spawn.x + ',' + spawn.y] = true;
    while (q.length) {
      var c = q.shift();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = c[0] + d[0], ny = c[1] + d[1], k = nx + ',' + ny;
        if (comp[k]) return;
        var t = kindAt(nx, ny);
        if (t === 'floor' || t === 'corridor') { comp[k] = true; q.push([nx, ny]); }
      });
    }
    var DIRS4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    var candidates = {};
    var multiRoom = 0;
    for (var y = 0; y < GRID_H; y++) for (var x = 0; x < GRID_W; x++) {
      if (kindAt(x, y) !== 'corridor') continue;
      if (!comp[x + ',' + y]) continue;
      var found = {};
      DIRS4.forEach(function (d) {
        var ri = roomIndexAt(rooms, x + d[0], y + d[1]);
        if (ri < 0) return;
        var ox = x - d[0], oy = y - d[1];
        if (kindAt(ox, oy) === 'corridor' && roomIndexAt(rooms, ox, oy) < 0) found[ri] = true;
      });
      var keys = Object.keys(found);
      if (keys.length > 1) { multiRoom++; continue; }
      if (keys.length === 1) candidates[x + ',' + y] = { x: x, y: y, room: Number(keys[0]) };
    }
    var groups = [];
    var seen = {};
    Object.keys(candidates).forEach(function (k) {
      if (seen[k]) return;
      var first = candidates[k];
      var stack = [first], cells = [];
      seen[k] = true;
      while (stack.length) {
        var cur = stack.pop(); cells.push(cur);
        DIRS4.forEach(function (d) {
          var nk = (cur.x + d[0]) + ',' + (cur.y + d[1]);
          if (candidates[nk] && candidates[nk].room === first.room && !seen[nk]) { seen[nk] = true; stack.push(candidates[nk]); }
        });
      }
      cells.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      groups.push({ room: first.room, roomId: roomIdFor(first.room), cells: cells, doorCell: cells[0] });
    });
    groups.sort(function (a, b) { return a.room - b.room || a.doorCell.y - b.doorCell.y || a.doorCell.x - b.doorCell.x; });
    return { groups: groups, candidateCells: Object.keys(candidates).length, multiRoomCells: multiRoom };
  }
  // Exploration state (§9.7.6): arrays only, plain JSON, on the
  // floor record. Whole rooms explore at once; corridor cells
  // explore one cell at a time. Fog is rendering/sight only — the
  // scheduler never consults this state.
  function ensureExplored(floor) {
    if (!floor.explored || typeof floor.explored !== 'object' || Array.isArray(floor.explored)) {
      floor.explored = { exploredRoomIds: [], walkedCorridorCells: [] };
    }
    if (!Array.isArray(floor.explored.exploredRoomIds)) floor.explored.exploredRoomIds = [];
    if (!Array.isArray(floor.explored.walkedCorridorCells)) floor.explored.walkedCorridorCells = [];
    return floor.explored;
  }
  function markExplored(state) {
    var floor = state.floor;
    var ex = ensureExplored(floor);
    var p = state.player;
    var ri = roomIndexAt(floor.rooms, p.x, p.y);
    if (ri >= 0) {
      var roomId = roomIdFor(ri);
      if (ex.exploredRoomIds.indexOf(roomId) === -1) {
        ex.exploredRoomIds.push(roomId);
        // Lore consoles speak once, when their room is first entered.
        (floor.dressing || []).forEach(function (d) {
          if (d.lore && roomIndexAt(floor.rooms, d.x, d.y) === ri) logMsg(state, d.lore);
        });
      }
    } else {
      var key = p.x + ',' + p.y;
      if (ex.walkedCorridorCells.indexOf(key) === -1) ex.walkedCorridorCells.push(key);
    }
    return ex;
  }
  // Legacy migration (§9.7.6): floors saved before Phase 6 have grid
  // 'door' cells but no door records and no exploration state. All
  // doors default OPEN, all rooms explored. Thresholds are
  // re-derived from grid + rooms (the shipped door cells were
  // decorative), so the migrated floor satisfies the same door
  // validity rules as a fresh floor; nothing is invented.
  function migrateFloorDoors(floor) {
    if (Array.isArray(floor.doors) && floor.explored) return floor;
    var cls = classifyDoorCells(floor.grid, floor.rooms, floor.spawn);
    var doors = [];
    cls.groups.forEach(function (g) {
      var dc = g.doorCell;
      doors.push({ id: doorIdFor(dc.x, dc.y), x: dc.x, y: dc.y, roomId: g.roomId,
        entranceId: 'entrance:' + g.roomId + ':0', state: 'open',
        lockLevel: 0, keyId: null, hp: 0, maxHp: 0 });
    });
    // Renumber entranceIds per room in row-major door order.
    var perRoom = {};
    doors.sort(function (a, b) { return a.y - b.y || a.x - b.x; }).forEach(function (d) {
      var n = perRoom[d.roomId] || 0;
      d.entranceId = 'entrance:' + d.roomId + ':' + n;
      perRoom[d.roomId] = n + 1;
    });
    floor.grid.forEach(function (row, y) {
      row.forEach(function (t, x) {
        if (t === 'door' && !doorAt({ doors: doors }, x, y)) floor.grid[y][x] = 'corridor';
      });
    });
    floor.doors = doors;
    var ex = ensureExplored(floor);
    floor.rooms.forEach(function (r, i) {
      var id = roomIdFor(i);
      if (ex.exploredRoomIds.indexOf(id) === -1) ex.exploredRoomIds.push(id);
    });
    for (var y = 0; y < GRID_H; y++) for (var x = 0; x < GRID_W; x++) {
      var t = floor.grid[y][x];
      if ((t === 'corridor' || t === 'door' || t === 'stairs' || t === 'hazard') && roomIndexAt(floor.rooms, x, y) < 0) {
        var k = x + ',' + y;
        if (ex.walkedCorridorCells.indexOf(k) === -1) ex.walkedCorridorCells.push(k);
      }
    }
    return floor;
  }
  // Door noise (§9.7.4): sleeping, alive enemies within Chebyshev 8
  // of the doorway with door-aware LOS to it wake immediately (no
  // retroactive activation; the scheduler decides their next turn).
  function wakeEnemiesNearDoor(state, door) {
    var woke = 0;
    state.floor.enemies.forEach(function (en) {
      if (!en.alive || en.awake) return;
      if (chebDist(en.x, en.y, door.x, door.y) > DOOR_WAKE_RANGE) return;
      if (!lineOfSight(state, door.x, door.y, en.x, en.y)) return;
      en.awake = true; woke++;
      logMsg(state, en.name + ' wakes up!');
    });
    return woke;
  }
  function openDoorRecord(state, door) {
    door.state = 'open';
    logMsg(state, 'The door opens.');
    wakeEnemiesNearDoor(state, door);
    return door;
  }
  // Bypass (§9.7.5): STUB/REFUSE. No skill exists, so every attempt
  // is refused with the spec's exact text and consumes nothing.
  function attemptBypass(state) {
    logMsg(state, BYPASS_REFUSAL);
    return { ok: false, reason: BYPASS_REFUSAL };
  }
  // Force (§9.7.5): dedicated action against the locked door in the
  // facing-adjacent cell. Auto-hits: one roll of the CURRENT
  // equipped weapon's dice through the seeded pipeline — no
  // acc/evasion roll, no armor, no ammo, any pattern. A weapon with
  // no dice spec falls back to the shipped flat player damage roll
  // (the fallback is recorded in the return value). Costs exactly
  // 1 time unit even on a 0 roll; noise sounds AFTER damage/state
  // resolution, including on the breaking hit. Consumes no RNG
  // beyond the single damage roll.
  function forceDoor(state, rng, dx, dy) {
    if (state.state !== 'playing') return { ok: false, reason: 'Not playing.' };
    var p = state.player;
    var nx = p.x + dx, ny = p.y + dy;
    var door = doorAt(state.floor, nx, ny);
    if (!door) return { ok: false, reason: 'No door in that direction.' };
    if (door.state === 'open') return { ok: false, reason: 'That door is already open.' };
    if (door.state !== 'locked') return { ok: false, reason: 'That door is not locked. Walk into it to open it.' };
    var stats = weaponStats(state);
    var roll, fallback = false;
    if (stats.dice) {
      roll = rollDamageDetailed(rng, { dice: stats.dice, dmgMult: stats.mult });
    } else {
      fallback = true;
      roll = rollDamageDetailed(rng, { dmg: PLAYER_DEF.dmg, dmgVar: PLAYER_DEF.dmgVar, dmgMult: 1 });
    }
    var dmg = Math.max(0, roll.total);
    door.hp = Math.max(0, door.hp - dmg);
    var broke = door.hp <= 0;
    logMsg(state, 'You force the door for ' + dmg + ' (' + stats.displayName + ': ' + roll.detail + ')' +
      (broke ? ' — it breaks open!' : ' (' + door.hp + '/' + door.maxHp + ' HP left).'));
    if (broke) {
      door.state = 'open'; door.hp = 0;
    }
    notePlayerAction(state);
    processScheduler(state, rng, PLAYER_DEF.interval);
    wakeEnemiesNearDoor(state, door);
    return { ok: true, damage: dmg, broke: broke, door: door, fallback: fallback, detail: roll.detail };
  }

  function placeBoss(floor, depth, opts) {
    opts = opts || {};
    if (depth < 5) return { boss: null, reason: 'depth<5' };
    var secRoom = null, secIndex = -1;
    for (var i = 0; i < floor.rooms.length; i++) {
      if (floor.rooms[i].type === 'structure' && floor.rooms[i].purpose === 'security') { secRoom = floor.rooms[i]; secIndex = i; break; }
    }
    if (!secRoom) return { boss: null, reason: 'no-security-room' };
    // Phase 6 (§9.7.7): a locked first security room hosts no boss,
    // and no later security room is substituted.
    if (typeof opts.lockedRoomIndex === 'number' && opts.lockedRoomIndex >= 0 && secIndex === opts.lockedRoomIndex) {
      return { boss: null, reason: 'locked-first-security-room' };
    }
    var best = null, bestD = -1;
    for (var y = secRoom.y; y < secRoom.y + secRoom.h; y++) {
      for (var x = secRoom.x; x < secRoom.x + secRoom.w; x++) {
        if (floor.grid[y][x] !== 'floor') continue;
        if (x === floor.stairs.x && y === floor.stairs.y) continue;
        if (x === floor.spawn.x && y === floor.spawn.y) continue;
        if (floor.enemies.some(function (o) { return o.x === x && o.y === y; })) continue;
        if (floor.pickups.some(function (p) { return p.x === x && p.y === y; })) continue;
        if (floor.dressing && floor.dressing.some(function (dr) { return dr.x === x && dr.y === y; })) continue;
        var d = chebDist(x, y, floor.spawn.x, floor.spawn.y);
        if (d < 3) continue;
        if (d > bestD) { bestD = d; best = { x: x, y: y }; }
      }
    }
    if (!best) return { boss: null, reason: 'no-valid-cell' };
    var def = ENEMY_TYPES.boss;
    var hp = Math.round(def.hp * (1 + 0.1 * (depth - 1)));
    var boss = {
      id: 'boss', type: 'boss', name: def.name, x: best.x, y: best.y, facing: 0,
      hp: hp, maxHp: hp, dmg: def.dmg + Math.floor((depth - 1) / 2),
      dmgVar: def.dmgVar, armor: def.armor, acc: def.acc, evasion: def.evasion,
      interval: def.interval, nextTime: def.interval,
      salvageMin: def.salvageMin, salvageMax: def.salvageMax,
      sight: def.sight, retreat: def.retreat, alive: true, awake: false,
      statuses: [], dronesSpawned: false,
    };
    floor.enemies.push(boss);
    return { boss: boss, reason: 'present' };
  }
  // Turret spike relocation (§8.5.9): BFS from the placed cell,
  // neighbour order N, E, S, W; nearest legal cell (walkable,
  // unoccupied, not a hazard, not spawn/stairs); distance is
  // shortest-path through walkable cells (hazards are traversable
  // but never selectable). Fails loudly only when no legal cell
  // exists anywhere — unreachable on a real floor.
  function relocateTurretFromSpike(floor, turret) {
    function get(x, y) {
      return (x >= 0 && y >= 0 && x < GRID_W && y < GRID_H) ? floor.grid[y][x] : 'void';
    }
    if (get(turret.x, turret.y) !== 'hazard') return false;
    var key = function (x, y) { return x + ',' + y; };
    var prev = {}; var q = [[turret.x, turret.y]]; prev[key(turret.x, turret.y)] = null;
    while (q.length) {
      var c = q.shift();
      if (!(c[0] === turret.x && c[1] === turret.y)) {
        var t = get(c[0], c[1]);
        var occupied = floor.enemies.some(function (o) { return o.alive && o.x === c[0] && o.y === c[1]; });
        if (t === 'floor' && !occupied && !(c[0] === floor.spawn.x && c[1] === floor.spawn.y) && !(c[0] === floor.stairs.x && c[1] === floor.stairs.y)) {
          turret.x = c[0]; turret.y = c[1];
          return true;
        }
      }
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(function (d) {
        var nx = c[0] + d[0], ny = c[1] + d[1], k = key(nx, ny);
        if (k in prev) return;
        if (!isWalkableTile(get(nx, ny))) return;
        prev[k] = c; q.push([nx, ny]);
      });
    }
    throw new Error('Phase 5: turret spike relocation found no legal cell');
  }

  var GRID_W = 60, GRID_H = 44;

  // ---------- floor generation (MAPS.md) ----------
  // Pass 6 (§9.7.8/§10) is wired into generation: every candidate
  // floor must pass the extended coherenceCheck. Up to 8 attempts,
  // each deterministically seeded from runSeed + attempt; after 8
  // failures generation FAILS with a diagnostic — no template floor
  // is ever invented, and no failing floor is ever shipped.
  function generateFloor(runSeed, depth) {
    var baseSeed = (runSeed ^ depth) >>> 0;
    var lastErrors = ['no attempt ran'];
    for (var attempt = 0; attempt < GENERATION_MAX_ATTEMPTS; attempt++) {
      var attemptSeed = attempt === 0 ? baseSeed : ((baseSeed ^ Math.imul(attempt, 0x85EBCA6B)) >>> 0);
      var floor = generateFloorOnce(attemptSeed, depth, attempt, runSeed);
      var check = coherenceCheck(floor);
      if (check.ok) return floor;
      lastErrors = check.errors;
    }
    throw new Error('generateFloor: no valid floor after ' + GENERATION_MAX_ATTEMPTS +
      ' attempts (runSeed ' + runSeed + ', depth ' + depth + '): ' + lastErrors.join('; '));
  }
  function generateFloorOnce(floorSeed, depth, attemptIndex, runSeed) {
    var seed = floorSeed >>> 0;
    var rng = mulberry32(seed);
    var grid = []; // grid[y][x]: 'void'|'floor'|'corridor'|'door'|'wall'|'stairs'|'hazard'
    for (var y = 0; y < GRID_H; y++) { grid.push(new Array(GRID_W).fill('void')); }
    function inBounds(x, yy) { return x >= 0 && yy >= 0 && x < GRID_W && yy < GRID_H; }
    function set(x, yy, t) { if (inBounds(x, yy)) grid[yy][x] = t; }
    function get(x, yy) { return inBounds(x, yy) ? grid[yy][x] : 'void'; }

    // Rooms: 6-10, non-overlapping (1-cell gap), 4x4 to 8x6.
    var roomCount = randInt(rng, 6, 10);
    var rooms = [];
    var attempts = 0;
    while (rooms.length < roomCount && attempts < 600) {
      attempts++;
      var w = randInt(rng, 4, 8), h = randInt(rng, 4, 6);
      var x = randInt(rng, 2, GRID_W - w - 2), yy = randInt(rng, 2, GRID_H - h - 2);
      var overlap = rooms.some(function (r) {
        return x < r.x + r.w + 1 && x + w + 1 > r.x && yy < r.y + r.h + 1 && yy + h + 1 > r.y;
      });
      if (overlap) continue;
      rooms.push({ x: x, y: yy, w: w, h: h, cx: Math.floor(x + w / 2), cy: Math.floor(yy + h / 2) });
    }
    // Typing: room 0 = spawn. Guarantee >=1 loot and >=1 structure.
    // Typing: room 0 = spawn. Guarantee >=1 loot and >=1 structure.
    var typePool = ['combat', 'combat', 'loot', 'structure', 'hazard', 'empty', 'combat'];
    rooms.forEach(function (r, i) {
      if (i === 0) { r.type = 'spawn'; return; }
      r.type = typePool[randInt(rng, 0, typePool.length - 1)];
    });
    // forceType never lets one guarantee overwrite the other's sole
    // instance: the old code forced rooms[1] to 'loot', then forced
    // rooms[2] to 'structure' — when rooms[2] was the ONLY loot room,
    // the second assignment deleted the floor's only loot room (and
    // pickups spawn only in loot rooms, so the floor had zero
    // pickups). forceType instead converts a room that is neither
    // spawn nor the sole instance of the other guaranteed type.
    // No extra RNG is consumed; room count is always >= 6, so a
    // convertible room always exists.
    function forceType(t) {
      if (rooms.some(function (r) { return r.type === t; })) return;
      var other = t === 'loot' ? 'structure' : 'loot';
      var otherCount = rooms.reduce(function (n, r) { return n + (r.type === other ? 1 : 0); }, 0);
      for (var i = 1; i < rooms.length; i++) {
        if (rooms[i].type === other && otherCount <= 1) continue;
        rooms[i].type = t;
        return;
      }
    }
    forceType('loot');
    forceType('structure');
    // Phase 5 (§8.5.4): structure rooms draw a purpose on the floor
    // RNG, in room order, one draw per structure room. Only a
    // 'security' room can host the boss; no purpose is guaranteed.
    rooms.forEach(function (r) {
      if (r.type === 'structure') r.purpose = ROOM_PURPOSES[Math.floor(rng() * ROOM_PURPOSES.length)];
    });
    rooms.forEach(function (r) {
      for (var yy = r.y; yy < r.y + r.h; yy++)
        for (var xx = r.x; xx < r.x + r.w; xx++) set(xx, yy, 'floor');
    });

    // Corridors: spanning tree (each room to a random earlier room),
    // plus 1-2 loops. L-shaped, 1 cell wide.
    function carveCorridor(ax, ay, bx, by) {
      var cx = ax, cy = ay;
      var horizFirst = rng() < 0.5;
      function stepTo(tx, ty) {
        while (cx !== tx || cy !== ty) {
          if (horizFirst ? cx !== tx : cy === ty) cx += Math.sign(tx - cx);
          else cy += Math.sign(ty - cy);
          if (get(cx, cy) === 'void') set(cx, cy, 'corridor');
        }
      }
      if (horizFirst) { stepTo(bx, ay); stepTo(bx, by); }
      else { stepTo(ax, by); stepTo(bx, by); }
    }
    var connections = [];
    for (var i = 1; i < rooms.length; i++) {
      var j = randInt(rng, 0, i - 1);
      connections.push([i, j]);
      carveCorridor(rooms[i].cx, rooms[i].cy, rooms[j].cx, rooms[j].cy);
    }
    var loops = randInt(rng, 1, 2);
    for (var l = 0; l < loops; l++) {
      var a = randInt(rng, 0, rooms.length - 1), b = randInt(rng, 0, rooms.length - 1);
      if (a !== b) { connections.push([a, b]); carveCorridor(rooms[a].cx, rooms[a].cy, rooms[b].cx, rooms[b].cy); }
    }

    // Doors (§9.7.2): threshold classification + entrance grouping
    // replaces the shipped "every corridor cell touching a room is a
    // door" rule (which put doors in weird spots). Exactly one door
    // per entrance, at the group's row-major first cell; the other
    // cells of a multi-cell group become 'wall' so the single door
    // cannot be bypassed through an adjacent open cell. Door
    // records (state/lock/key) are built in the Phase 6 stage below.
    var doorClass = classifyDoorCells(grid, rooms, { x: rooms[0].cx, y: rooms[0].cy });
    var doorGroups = doorClass.groups;
    doorGroups.forEach(function (g) {
      g.cells.forEach(function (c) {
        grid[c.y][c.x] = (c.x === g.doorCell.x && c.y === g.doorCell.y) ? 'door' : 'wall';
      });
    });

    // Walls: every void cell touching a floor/corridor/door/stairs cell.
    var walkable = function (t) { return t === 'floor' || t === 'corridor' || t === 'door' || t === 'stairs' || t === 'hazard'; };
    for (var yy2 = 0; yy2 < GRID_H; yy2++) for (var xx2 = 0; xx2 < GRID_W; xx2++) {
      if (grid[yy2][xx2] !== 'void') continue;
      var touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (d) {
        return walkable(get(xx2 + d[0], yy2 + d[1]));
      });
      if (touches) grid[yy2][xx2] = 'wall';
    }

    // Spawn: centre of first room. Stairs: farthest room by BFS distance.
    var spawn = { x: rooms[0].cx, y: rooms[0].cy };
    function bfsDistances(sx, sy) {
      var dist = {}; var q = [[sx, sy]]; dist[sx + ',' + sy] = 0;
      while (q.length) {
        var c = q.shift(); var d = dist[c[0] + ',' + c[1]];
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (dd) {
          var nx = c[0] + dd[0], ny = c[1] + dd[1], k = nx + ',' + ny;
          if (inBounds(nx, ny) && !(k in dist) && walkable(get(nx, ny))) { dist[k] = d + 1; q.push([nx, ny]); }
        });
      }
      return dist;
    }
    var dists = bfsDistances(spawn.x, spawn.y);
    var stairsRoom = rooms[1] || rooms[0]; var best = -1;
    rooms.forEach(function (r, idx) {
      if (idx === 0) return;
      var d = dists[r.cx + ',' + r.cy];
      if (d !== undefined && d > best) { best = d; stairsRoom = r; }
    });
    stairsRoom.type = stairsRoom.type === 'spawn' ? stairsRoom.type : stairsRoom.type; // type kept; stairs cell is separate
    var stairs = { x: stairsRoom.cx, y: stairsRoom.cy };
    set(stairs.x, stairs.y, 'stairs');

    // Hazards: spike traps in hazard rooms only, never spawn/stairs
    // room, never on spawn/stairs cells. Walkable, so they cannot
    // block a path; reachability is still re-verified below.
    var hazards = [];
    rooms.forEach(function (r) {
      if (r.type !== 'hazard') return;
      var n = randInt(rng, 2, 4);
      for (var k = 0; k < n; k++) {
        var hx = randInt(rng, r.x, r.x + r.w - 1), hy = randInt(rng, r.y, r.y + r.h - 1);
        if ((hx === spawn.x && hy === spawn.y) || (hx === stairs.x && hy === stairs.y)) continue;
        if (get(hx, hy) === 'floor') { set(hx, hy, 'hazard'); hazards.push({ x: hx, y: hy, kind: 'spike', triggered: false, hidden: rng() < 0.5, revealed: false }); }
      }
    });

    // Salvage pickups in loot rooms (auto-collect on step), plus one
    // health cell, one food, one salvage component, and one data
    // chip per loot room. The chip's Codex entry is named by depth
    // and theme; duplicate entries on one floor are deduped in the
    // Codex (see addCodex), so several chips on a floor still count
    // as run inventory but only one new Codex entry.
    // Biome mapping (visual/theme layer only — no rule, enemy, hazard or
    // balance change rides on it). Depths 1-6 keep the original MAPS.md
    // mapping; depths 7-10 add four new biomes; 11+ cycles the four new
    // ones so deep runs keep varying.
    var themeForDepth = themeNameForDepth(depth);
    var pickups = [];
    // Phase 6 placement guards. dressing and wideDressing are
    // declared later in this scope (hoisted vars): shipped pickup
    // calls run before either exists, so the guards read empty and
    // change nothing for them; Phase 6 calls run after dressing
    // and wide art exist, so keys/vault caches/objective drops
    // never land on a dressing cell or under wide art (both are
    // shipped test invariants).
    function dressingAt(x, y) {
      if (typeof dressing === 'undefined' || !dressing) return false;
      return dressing.some(function (d) { return d.x === x && d.y === y; });
    }
    function wideSpanAt(x, y) {
      if (typeof wideDressing === 'undefined' || !wideDressing) return false;
      return wideDressing.some(function (w) { return (x === w.x && y === w.y) || (x === w.x + 1 && y === w.y); });
    }
    function placePickup(room, kind, make) {
      for (var t = 0; t < 20; t++) {
        var qx = randInt(rng, room.x, room.x + room.w - 1), qy = randInt(rng, room.y, room.y + room.h - 1);
        if (get(qx, qy) === 'floor' && !(qx === spawn.x && qy === spawn.y) &&
            !pickups.some(function (p) { return p.x === qx && p.y === qy; }) &&
            !dressingAt(qx, qy) && !wideSpanAt(qx, qy)) {
          var pk = make(); pk.x = qx; pk.y = qy; pk.kind = kind;
          pickups.push(pk);
          return true;
        }
      }
      return false;
    }
    rooms.forEach(function (r) {
      if (r.type !== 'loot') return;
      var n = randInt(rng, 2, 3);
      for (var k = 0; k < n; k++) {
        var px = randInt(rng, r.x, r.x + r.w - 1), py = randInt(rng, r.y, r.y + r.h - 1);
        if (get(px, py) === 'floor' && !(px === spawn.x && py === spawn.y)) {
          pickups.push({ x: px, y: py, kind: 'salvage', value: randInt(rng, 3, 8) + depth });
        }
      }
      placePickup(r, 'health', function () { return { heal: 25 }; });
      placePickup(r, 'food', function () { return { power: 40 }; });
      placePickup(r, 'component', function () { return { value: 1 }; });
      placePickup(r, 'ammo', function () { return { value: AMMO_CRATE_VALUE }; });
      placePickup(r, 'dataChip', function () { return { codex: 'Depth ' + depth + ' ' + themeForDepth + ' salvage signature' }; });
    });

    // Phase 1 (§4.4) — item caches: ONE cache pickup per floor in a
    // loot room (the guarantee: no floor has zero item drops), plus a
    // 50% cache chance per structure room. Tier/upgrade roll from the
    // depth tables; the def rolls from the depth band. placePickup
    // can fail after 20 tries on a crowded room, so the fallback
    // scans the room for the first free floor cell — the guarantee
    // must not depend on RNG luck.
    // Phase 2 (§5.1): caches roll from the shared drop table —
    // gearWeight 0.5 in a loot room, 0.7 in a structure room
    // (weighted toward gear). The guarantee (one cache per floor)
    // and the 50% structure chance are unchanged.
    function placeItemCache(room, gearWeight) {
      if (placePickup(room, 'item', function () { return rollDropItem(rng, depth, gearWeight); })) return true;
      for (var yy = room.y; yy < room.y + room.h; yy++) {
        for (var xx = room.x; xx < room.x + room.w; xx++) {
          if (get(xx, yy) !== 'floor') continue;
          if (xx === spawn.x && yy === spawn.y) continue;
          if (pickups.some(function (p) { return p.x === xx && p.y === yy; })) continue;
          if (dressingAt(xx, yy) || wideSpanAt(xx, yy)) continue;
          var inst = rollDropItem(rng, depth, gearWeight);
          inst.x = xx; inst.y = yy; inst.kind = 'item';
          pickups.push(inst);
          return true;
        }
      }
      return false;
    }
    var lootRooms = rooms.filter(function (r) { return r.type === 'loot'; });
    if (lootRooms.length) placeItemCache(lootRooms[0], 0.5);
    rooms.forEach(function (r) {
      if (r.type === 'structure' && rng() < 0.5) placeItemCache(r, 0.7);
    });

    // Enemies: 3+depth, capped 12, spread across combat rooms.
    var combatRooms = rooms.filter(function (r) { return r.type === 'combat'; });
    if (combatRooms.length === 0) combatRooms = rooms.filter(function (r) { return r.type === 'empty'; });
    // Last resort: a floor with neither combat nor empty rooms (e.g. only
    // loot/structure/hazard rooms) used to throw here — combatRooms[e % 0]
    // is undefined. Fall back to any non-spawn room; floors that already
    // generated are untouched, since this line only runs when both
    // filters above came back empty.
    if (combatRooms.length === 0) combatRooms = rooms.filter(function (r) { return r.type !== 'spawn'; });
    var enemyCount = Math.min(12, 3 + depth);
    var enemies = [];
    // Phase 5 (§8.5.3): roster weights replace the fixed trio cycle.
    // One seeded draw per enemy; the boss (placeBoss, below) sits
    // outside this cap. Local LOS mirrors lineOfSight on the grid
    // being built (walls block; void does not — shipped F12 rule).
    function losGrid(x0, y0, x1, y1) {
      var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
      var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
      var x = x0, y = y0;
      while (!(x === x1 && y === y1)) {
        var e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
        if (x === x1 && y === y1) break;
        if (get(x, y) === 'wall') return false;
      }
      return true;
    }
    for (var e = 0; e < enemyCount; e++) {
      var room = combatRooms[e % combatRooms.length];
      var type = pickRosterType(rng, depth);
      var def = ENEMY_TYPES[type];
      var placed = false;
      for (var t = 0; t < 40 && !placed; t++) {
        var ex = randInt(rng, room.x, room.x + room.w - 1), ey = randInt(rng, room.y, room.y + room.h - 1);
        if (get(ex, ey) !== 'floor') continue;
        if (Math.max(Math.abs(ex - spawn.x), Math.abs(ey - spawn.y)) <= 1) continue;
        if (enemies.some(function (o) { return o.x === ex && o.y === ey; })) continue;
        // HP scaling keeps the shipped rounding (F item 4): Math.round,
        // NOT the spec's floor — round and floor differ at some depths
        // (flyer/shielder/bomber depth 5: 17/34/34 vs 16/33/33).
        var hp = Math.round(def.hp * (1 + 0.1 * (depth - 1)));
        var rec = {
          id: 'e' + e, type: type, name: def.name, x: ex, y: ey, facing: 0,
          hp: hp, maxHp: hp, dmg: def.dmg + Math.floor((depth - 1) / 2),
          dmgVar: def.dmgVar, armor: def.armor, acc: def.acc, evasion: def.evasion,
          interval: def.interval, nextTime: def.interval,
          salvageMin: def.salvageMin, salvageMax: def.salvageMax,
          sight: def.sight, retreat: def.retreat, alive: true, awake: false,
          statuses: [],
        };
        if (type === 'shielder') {
          // Spawn facing (§8.5.6): visible -> nearest cardinal to the
          // player bearing; else one seeded draw from [N,E,S,W],
          // taken here — the first draw after this placement.
          var vis = chebDist(ex, ey, spawn.x, spawn.y) <= def.sight && losGrid(ex, ey, spawn.x, spawn.y);
          rec.shieldFacing = vis ? nearestCardinal(spawn.x - ex, spawn.y - ey)
            : ['N', 'E', 'S', 'W'][Math.floor(rng() * 4)];
        }
        if (type === 'turret_light') rec.nextShotTime = 0;
        if (type === 'sniper') rec.telegraph = null;
        if (type === 'bomber') { rec.fuseArmed = false; rec.detonated = false; }
        enemies.push(rec);
        placed = true;
      }
    }
    // Turret spike relocation (§8.5.9 safety net): placement already
    // requires 'floor', so this is normally a no-op; it fires only
    // for a malformed floor or a future placement change.
    enemies.forEach(function (en) {
      if (en.type === 'turret_light') relocateTurretFromSpike({ grid: grid, enemies: enemies, spawn: spawn, stairs: stairs }, en);
    });
    // Boss placement is deferred to the Phase 6 stage below: the
    // locked-room choice (draws appended after all shipped draws)
    // must precede the locked-first-security-room exclusion, and
    // placeBoss consumes no RNG, so the shipped draw stream is
    // preserved either way.
    var bossReason = null;
    // If a combat room was too small to place every enemy, the count
    // is what it is; coherenceCheck reports it rather than faking it.

    // Dressing: walkable decor only, never blocks movement.
    // Visual overhaul: denser, scrappier floors — structure rooms
    // get a chest plus two debris piles, loot rooms a barrel plus
    // debris, combat and empty rooms a debris pile each, and two
    // grates. All dressing is walkable and changes no rule.
    var dressing = [];
    function placeDressing(kind, room) {
      for (var t = 0; t < 30; t++) {
        var dx = randInt(rng, room.x, room.x + room.w - 1), dy = randInt(rng, room.y, room.y + room.h - 1);
        if (get(dx, dy) !== 'floor') continue;
        if ((dx === spawn.x && dy === spawn.y) || (dx === stairs.x && dy === stairs.y)) continue;
        if (pickups.some(function (p) { return p.x === dx && p.y === dy; })) continue;
        if (enemies.some(function (e) { return e.x === dx && e.y === dy; })) continue;
        if (dressing.some(function (d) { return d.x === dx && d.y === dy; })) continue;
        dressing.push({ x: dx, y: dy, kind: kind });
        return true;
      }
      return false;
    }
    // Biome dressing: the generic debris pile becomes the biome's own
    // generated pile/detail sprite where one exists (scrapyard,
    // overgrown, molten, frozen, toxic). Chest/barrel/grate dressing is
    // unchanged everywhere. Still walkable, still no rule.
    function debrisKind() {
      if (themeForDepth === 'scrapyard') return 'pile_scrap';
      if (themeForDepth === 'overgrown') return randInt(rng, 0, 1) ? 'pile_overgrown' : 'detail_overgrown';
      if (themeForDepth === 'molten') return randInt(rng, 0, 1) ? 'pile_molten' : 'detail_molten';
      if (themeForDepth === 'frozen') return randInt(rng, 0, 1) ? 'pile_frozen' : 'detail_frozen';
      if (themeForDepth === 'toxic') return randInt(rng, 0, 1) ? 'pile_toxic' : 'detail_toxic';
      return 'debris';
    }
    // Wide-cell dressing (2026-10-28, middle tier): art that spans
    // ~1.5-2 cells, drawn aspect-preserving by the renderer in the
    // y-sorted drawables pass. Visual only, walkable, no rule — the
    // same contract as all dressing. A wide record reserves its
    // anchor cell plus the cell to its right: the covered cell gets a
    // 'wide_cover' dressing record (render-skipped) so the anchor
    // loop and the fill pass below never place dressing on it, and
    // pickups/enemies (placed earlier) draw over the art via the
    // y-sorted pass. Stairs/ladder art overhangs into the row below,
    // so the two cells below the span are covered the same way when
    // they are plain floor. All records are plain JSON, so saves
    // carry them with no format change; old saves simply have no
    // wide records and render as before.
    var wideDressing = [];
    var wideStairs = null;
    var WIDE_CONSOLES = ['wide_batch3_s1_console_triple', 'wide_batch3_s2_console_wide_2', 'wide_batch3_s2_console_wide_3', 'wide_batch3_s1_server_pair', 'wide_batch3_s1_server_top_pair'];
    var WIDE_PILES = ['wide_batch3_s2_scrap_pile_a', 'wide_batch3_s2_scrap_pile_wires', 'wide_batch3_s2_armour_broken', 'wide_batch3_s2_scrap_debris', 'wide_batch3_s2_crates_stack'];
    function wideCellsFree(cells, needType) {
      for (var i = 0; i < cells.length; i++) {
        var cx = cells[i].x, cy = cells[i].y;
        if (get(cx, cy) !== needType) return false;
        if ((cx === spawn.x && cy === spawn.y) || (cx === stairs.x && cy === stairs.y)) return false;
        if (pickups.some(function (p) { return p.x === cx && p.y === cy; })) return false;
        if (enemies.some(function (e) { return e.x === cx && e.y === cy; })) return false;
        if (hazards.some(function (h) { return h.x === cx && h.y === cy; })) return false;
        if (dressing.some(function (d) { return d.x === cx && d.y === cy; })) return false;
      }
      return true;
    }
    function coverCell(cx, cy) {
      if (!dressing.some(function (d) { return d.x === cx && d.y === cy; }))
        dressing.push({ x: cx, y: cy, kind: 'wide_cover', cover: true });
    }
    // Spacing: a new wide span must not sit within one row of an
    // existing wide record or the wide stairs (spans are 2 cells
    // wide; bottom-anchored art extends ~0.8 TILE up and top-anchored
    // art ~0.4 TILE down, so a one-row gap would visibly collide).
    // A horizontal gap of 3+ cells is always safe.
    function wideSpacingFree(ax, ay) {
      for (var i = 0; i < wideDressing.length; i++) {
        var w = wideDressing[i];
        if (Math.abs(w.x - ax) <= 2 && Math.abs(w.y - ay) <= 1) return false;
      }
      if (wideStairs && Math.abs(wideStairs.x - ax) <= 2 && Math.abs(wideStairs.y - ay) <= 1) return false;
      return true;
    }
    // Try to place one wide piece in a room: anchor + right neighbour
    // both free floor cells. overhangBelow: also require the two cells
    // below the span to be free plain floor, and cover them (the art
    // hangs down over them).
    function placeWide(kind, room, overhangBelow) {
      for (var t = 0; t < 30; t++) {
        var ax = randInt(rng, room.x, room.x + room.w - 2), ay = randInt(rng, room.y, room.y + room.h - 1);
        var span = [{ x: ax, y: ay }, { x: ax + 1, y: ay }];
        if (!wideCellsFree(span, 'floor')) continue;
        if (!wideSpacingFree(ax, ay)) continue;
        if (overhangBelow && !wideCellsFree([{ x: ax, y: ay + 1 }, { x: ax + 1, y: ay + 1 }], 'floor')) continue;
        wideDressing.push({ x: ax, y: ay, kind: kind });
        coverCell(ax + 1, ay);
        if (overhangBelow) { coverCell(ax, ay + 1); coverCell(ax + 1, ay + 1); }
        return true;
      }
      return false;
    }
    // Wide stairs art: only when the cell right of the stairs cell is
    // plain floor at generation end (hazards already placed, so a
    // 'hazard' neighbour excludes it). The neighbour cell is covered
    // so no dressing lands under the art; the two cells below are
    // covered best-effort (the stairs cell itself is fixed, so no
    // retry is possible).
    if (get(stairs.x + 1, stairs.y) === 'floor') {
      wideStairs = { x: stairs.x, y: stairs.y };
      // Cover the neighbour only when it is free: a cover record on a
      // pickup/enemy/hazard cell would break the dressing-overlap
      // invariant. The pickup still draws over the art either way.
      if (wideCellsFree([{ x: stairs.x + 1, y: stairs.y }], 'floor')) coverCell(stairs.x + 1, stairs.y);
      [{ x: stairs.x, y: stairs.y + 1 }, { x: stairs.x + 1, y: stairs.y + 1 }].forEach(function (c) {
        if (wideCellsFree([c], 'floor')) coverCell(c.x, c.y);
      });
    }
    // Corner-L gateway: two adjacent wall cells with floor directly
    // below both (a wall row crowning a room). At most two per floor;
    // pairs never touch each other. The art's black middle-bottom void
    // hangs ~13px over the floor row below as a doorway shadow.
    (function () {
      var pairs = [];
      for (var yy = 0; yy < GRID_H - 1; yy++) for (var xx = 0; xx < GRID_W - 1; xx++) {
        if (get(xx, yy) !== 'wall' || get(xx + 1, yy) !== 'wall') continue;
        if (get(xx, yy + 1) !== 'floor' || get(xx + 1, yy + 1) !== 'floor') continue;
        pairs.push({ x: xx, y: yy });
      }
      for (var i = pairs.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var tmp = pairs[i]; pairs[i] = pairs[j]; pairs[j] = tmp;
      }
      var placed = 0;
      for (var k = 0; k < pairs.length && placed < 2; k++) {
        var pr = pairs[k];
        if (wideDressing.some(function (w) { return Math.abs(w.x - pr.x) <= 2 && Math.abs(w.y - pr.y) <= 1; })) continue;
        wideDressing.push({ x: pr.x, y: pr.y, kind: 'wide_batch3_s2_wall_corner_L' });
        placed++;
      }
    })();
    // One wide console per structure room (ladder in the first one
    // with room for its overhang), one wide pile per loot room.
    var ladderDone = false;
    rooms.forEach(function (r) {
      if (r.type === 'structure') {
        if (!ladderDone) ladderDone = placeWide('wide_batch3_s2_ladder_platform', r, true);
        placeWide(WIDE_CONSOLES[randInt(rng, 0, WIDE_CONSOLES.length - 1)], r, false);
      }
      if (r.type === 'loot') {
        placeWide(WIDE_PILES[randInt(rng, 0, WIDE_PILES.length - 1)], r, false);
      }
    });
    rooms.forEach(function (r) {
      if (r.type === 'structure') { placeDressing('chest', r); placeDressing('console', r); placeDressing(debrisKind(), r); placeDressing(debrisKind(), r); }
      if (r.type === 'loot') { placeDressing('barrel', r); placeDressing(debrisKind(), r); }
      if (r.type === 'combat' || r.type === 'empty') placeDressing(debrisKind(), r);
    });
    if (rooms.length > 1) {
      placeDressing('grate', rooms[randInt(rng, 1, rooms.length - 1)]);
      placeDressing('grate', rooms[randInt(rng, 1, rooms.length - 1)]);
    }
    // Dressing fill: every room, including the spawn room, gets
    // debrisKind() dressing on roughly 1 in 3 of its free floor
    // cells. Free = a 'floor' cell that is not the spawn/stairs
    // cell and holds no pickup, enemy, hazard, or anchor dressing.
    // Anchors above are placed first and are never displaced.
    // Dressing stays walkable decor; no rule changes.
    rooms.forEach(function (r) {
      var candidates = [];
      for (var yy = r.y; yy < r.y + r.h; yy++) {
        for (var xx = r.x; xx < r.x + r.w; xx++) {
          if (get(xx, yy) !== 'floor') continue;
          if ((xx === spawn.x && yy === spawn.y) || (xx === stairs.x && yy === stairs.y)) continue;
          if (pickups.some(function (p) { return p.x === xx && p.y === yy; })) continue;
          if (enemies.some(function (e) { return e.x === xx && e.y === yy; })) continue;
          if (hazards.some(function (h) { return h.x === xx && h.y === yy; })) continue;
          if (dressing.some(function (d) { return d.x === xx && d.y === yy; })) continue;
          candidates.push({ x: xx, y: yy });
        }
      }
      // Deterministic shuffle from the floor rng.
      for (var i = candidates.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
      }
      var target = Math.round(candidates.length / 3);
      for (var k = 0; k < target; k++) {
        dressing.push({ x: candidates[k].x, y: candidates[k].y, kind: debrisKind() });
      }
    });

    // Circuit block: one deterministic contiguous rectangle (~4x3
    // or 3x4) inside a single non-spawn room, on 'floor' cells only.
    // Stored on the floor so rendering (industrial only, see
    // game.js) and saves both see the same block, and the same seed
    // reproduces the same block.
    var circuitBlock = null;
    if (rooms.length > 1) {
      (function () {
        var sizes = [[4, 3], [3, 4]];
        function allFloor(bx, by, bw, bh) {
          for (var yy = by; yy < by + bh; yy++)
            for (var xx = bx; xx < bx + bw; xx++)
              if (get(xx, yy) !== 'floor') return false;
          return true;
        }
        for (var attempt = 0; attempt < 30 && !circuitBlock; attempt++) {
          var room = rooms[randInt(rng, 1, rooms.length - 1)];
          var sz = sizes[randInt(rng, 0, 1)];
          var bx = randInt(rng, room.x, room.x + room.w - sz[0]);
          var by = randInt(rng, room.y, room.y + room.h - sz[1]);
          if (allFloor(bx, by, sz[0], sz[1])) circuitBlock = { x: bx, y: by, w: sz[0], h: sz[1] };
        }
        if (!circuitBlock) {
          // Deterministic fallback scan: first all-floor rectangle in
          // any non-spawn room. Rooms are mostly open floor, so this
          // virtually always finds one; it keeps the block present
          // even on an unlucky seed instead of silently dropping it.
          for (var ri = 1; ri < rooms.length && !circuitBlock; ri++) {
            var rm = rooms[ri];
            for (var si = 0; si < sizes.length && !circuitBlock; si++) {
              var bw = sizes[si][0], bh = sizes[si][1];
              for (var yy2 = rm.y; yy2 + bh <= rm.y + rm.h && !circuitBlock; yy2++)
                for (var xx2 = rm.x; xx2 + bw <= rm.x + rm.w; xx2++)
                  if (allFloor(xx2, yy2, bw, bh)) { circuitBlock = { x: xx2, y: yy2, w: bw, h: bh }; break; }
            }
          }
        }
      })();
    }

    // ---------- Phase 6 stage (§9.7.3/§9.7.5/§9.7.7/§9.7.10) ----------
    // Runs AFTER every shipped draw, so no draw is added, removed,
    // or reordered in the room/typing/purpose/corridor stages. New
    // draws appear only in the §9.7.10 order: (1) locked-room
    // selection among eligible leaves, (2) locked kind, (3) lock
    // level, (4) objective choice, (5) key placement. At most ONE
    // locked room per floor (builder decision: §9.7.3 selects "from
    // already-generated rooms" and §9.7.10 anticipates a choice
    // among candidates; a count is never stated).
    rooms.forEach(function (r, i) { r.id = roomIdFor(i); r.lockedKind = null; });
    var stairsRoomIdx = rooms.indexOf(stairsRoom);
    var eligibleLeaves = [];
    doorGroups.forEach(function (g) {
      if (g.room === 0 || g.room === stairsRoomIdx) return;
      var groupCount = doorGroups.filter(function (h) { return h.room === g.room; }).length;
      if (groupCount === 1) eligibleLeaves.push(g.room);
    });
    var lockedRoomIdx = -1, lockedKind = null, lockLevel = 0, objectiveChoice = null;
    if (eligibleLeaves.length) {
      lockedRoomIdx = eligibleLeaves.length === 1 ? eligibleLeaves[0]
        : eligibleLeaves[Math.floor(rng() * eligibleLeaves.length)];
      lockedKind = LOCKED_KINDS[Math.floor(rng() * LOCKED_KINDS.length)];
      lockLevel = 1 + Math.floor(rng() * 3);
      if (lockedKind === 'objective') objectiveChoice = OBJECTIVE_CHOICES[Math.floor(rng() * OBJECTIVE_CHOICES.length)];
      rooms[lockedRoomIdx].lockedKind = lockedKind;
    }
    // Door records (§9.7.2): entranceIds numbered per room in
    // row-major door order. The locked room's single door carries
    // the lock; every other door starts closed, unlocked.
    var doors = [];
    var perRoomDoorNo = {};
    doorGroups.forEach(function (g) {
      var dc = g.doorCell;
      var n = perRoomDoorNo[g.roomId] || 0;
      perRoomDoorNo[g.roomId] = n + 1;
      var isLocked = g.room === lockedRoomIdx;
      doors.push({
        id: doorIdFor(dc.x, dc.y), x: dc.x, y: dc.y, roomId: g.roomId,
        entranceId: 'entrance:' + g.roomId + ':' + n,
        state: isLocked ? 'locked' : 'closed',
        lockLevel: isLocked ? lockLevel : 0,
        keyId: isLocked ? 'key:' + doorIdFor(dc.x, dc.y) : null,
        hp: isLocked ? LOCK_HP_PER_LEVEL * lockLevel : 0,
        maxHp: isLocked ? LOCK_HP_PER_LEVEL * lockLevel : 0,
      });
    });
    var lockedDoor = lockedRoomIdx >= 0 ? doors.filter(function (d) { return d.roomId === roomIdFor(lockedRoomIdx); })[0] : null;
    // Key placement (draw 5): free floor cells in rooms reachable
    // without opening any locked door — every room except the locked
    // room itself. Row-major candidate order; the draw picks one.
    if (lockedDoor) {
      var keyCandidates = [];
      rooms.forEach(function (r, ri) {
        if (ri === lockedRoomIdx) return;
        for (var ky = r.y; ky < r.y + r.h; ky++) for (var kx = r.x; kx < r.x + r.w; kx++) {
          if (get(kx, ky) !== 'floor') continue;
          if (kx === spawn.x && ky === spawn.y) continue;
          if (pickups.some(function (p) { return p.x === kx && p.y === ky; })) continue;
          if (enemies.some(function (e) { return e.x === kx && e.y === ky; })) continue;
          if (hazards.some(function (h) { return h.x === kx && h.y === ky; })) continue;
          if (dressingAt(kx, ky) || wideSpanAt(kx, ky)) continue;
          keyCandidates.push({ x: kx, y: ky });
        }
      });
      if (keyCandidates.length) {
        var kc = keyCandidates[Math.floor(rng() * keyCandidates.length)];
        pickups.push({ x: kc.x, y: kc.y, kind: 'key', keyId: lockedDoor.keyId });
      }
    }
    // Locked-room contents (content rolls follow the five ordered
    // draws; they are not among them).
    if (lockedRoomIdx >= 0) {
      var lr = rooms[lockedRoomIdx];
      if (lockedKind === 'lootVault') {
        var vaultCaches = lockLevel === 1 ? 1 : 2;
        for (var vi = 0; vi < vaultCaches; vi++) placeItemCache(lr, 0.5);
      } else if (lockedKind === 'objective') {
        if (objectiveChoice === 'codex') {
          placePickup(lr, 'dataChip', function () {
            return { codex: 'Locked vault archive — depth ' + depth + ', ' + themeForDepth + '.' };
          });
        } else if (objectiveChoice === 'drop') {
          var rareTiers = ['rare', 'epic', 'legendary'];
          var tierDraw = rareTiers[Math.floor(rng() * rareTiers.length)];
          placePickup(lr, 'item', function () {
            return rng() < 0.5 ? rollGearItem(rng, depth, null, tierDraw) : rollItem(rng, depth, null, tierDraw);
          });
        } else {
          // Lore console: dressing + log line only, no new mechanic.
          // Its own kind ('loreConsole') so the shipped invariant
          // "console dressing belongs in structure rooms" keeps
          // meaning the shipped consoles; the renderer draws a lore
          // console with the same console art. Never on an existing
          // dressing cell (the duplicate-cell invariant), under wide
          // art, or on a pickup/enemy/hazard.
          outer: for (var ly = lr.y; ly < lr.y + lr.h; ly++) for (var lx = lr.x; lx < lr.x + lr.w; lx++) {
            if (get(lx, ly) !== 'floor') continue;
            if (lx === spawn.x && ly === spawn.y) continue;
            if (pickups.some(function (p) { return p.x === lx && p.y === ly; })) continue;
            if (enemies.some(function (e) { return e.x === lx && e.y === ly; })) continue;
            if (hazards.some(function (h) { return h.x === lx && h.y === ly; })) continue;
            if (dressingAt(lx, ly) || wideSpanAt(lx, ly)) continue;
            dressing.push({ x: lx, y: ly, kind: 'loreConsole', lore: LORE_LINES[(lx * 7 + ly * 13 + depth) % LORE_LINES.length] });
            break outer;
          }
        }
      }
      // 'newArea' needs no content: the leaf room itself is the
      // area, and its encounters are part of the regular population.
    }
    // Boss (§8.5.4 as amended by §9.7.7): placed last, after the
    // lock selection, so the locked-first-security-room exclusion
    // can be applied. placeBoss consumes no RNG.
    var bossResult = placeBoss(
      { grid: grid, rooms: rooms, spawn: spawn, stairs: stairs, enemies: enemies, pickups: pickups, dressing: dressing },
      depth, { lockedRoomIndex: lockedRoomIdx });
    bossReason = bossResult.reason;

    return {
      // The recorded seed is the canonical runSeed XOR depth, even
      // when a retry regenerates from runSeed + attempt: the attempt
      // sequence is deterministic, so the same (runSeed, depth)
      // always reproduces the same floor, and the shipped
      // floor.seed === runSeed ^ depth invariant holds.
      seed: (runSeed ^ depth) >>> 0, depth: depth, grid: grid, rooms: rooms, spawn: spawn,
      stairs: stairs, hazards: hazards, pickups: pickups, enemies: enemies, dressing: dressing,
      wideDressing: wideDressing, wideStairs: wideStairs,
      circuitBlock: circuitBlock,
      theme: themeForDepth,
      bossReason: bossReason,
      doors: doors,
      explored: { exploredRoomIds: [], walkedCorridorCells: [] },
      generation: {
        runSeed: runSeed, depth: depth,
        generatorVersion: GENERATION_VERSION, rulesetVersion: RULESET_VERSION,
        rngAlgorithmVersion: RNG_ALGORITHM_VERSION, tileCatalogVersion: TILE_CATALOG_VERSION,
      },
      generationAttempts: attemptIndex + 1,
    };
  }

  function isWalkableTile(t) {
    return t === 'floor' || t === 'corridor' || t === 'door' || t === 'stairs' || t === 'hazard';
  }

  // ---------- coherence checks (MAPS.md) ----------
  function coherenceCheck(floor) {
    var errors = [];
    var grid = floor.grid;
    function get(x, y) { return (x >= 0 && y >= 0 && x < GRID_W && y < GRID_H) ? grid[y][x] : 'void'; }
    if (floor.rooms.length < 6 || floor.rooms.length > 10) errors.push('room count ' + floor.rooms.length);
    floor.rooms.forEach(function (r) {
      if (r.w < 4 || r.w > 8 || r.h < 4 || r.h > 6) errors.push('room size out of range');
    });
    for (var i = 0; i < floor.rooms.length; i++) for (var j = i + 1; j < floor.rooms.length; j++) {
      var a = floor.rooms[i], b = floor.rooms[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) errors.push('rooms overlap');
    }
    if (!floor.rooms.some(function (r) { return r.type === 'loot'; })) errors.push('no loot room');
    if (!floor.rooms.some(function (r) { return r.type === 'structure'; })) errors.push('no structure room');
    // Flood fill from spawn over walkable tiles.
    var seen = {}; var q = [[floor.spawn.x, floor.spawn.y]]; seen[floor.spawn.x + ',' + floor.spawn.y] = true;
    while (q.length) {
      var c = q.shift();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = c[0] + d[0], ny = c[1] + d[1], k = nx + ',' + ny;
        if (!seen[k] && isWalkableTile(get(nx, ny))) { seen[k] = true; q.push([nx, ny]); }
      });
    }
    floor.rooms.forEach(function (r, idx) {
      var reached = false;
      for (var yy = r.y; yy < r.y + r.h && !reached; yy++)
        for (var xx = r.x; xx < r.x + r.w; xx++) if (seen[xx + ',' + yy]) reached = true;
      if (!reached) errors.push('room ' + idx + ' unreachable');
    });
    if (!seen[floor.stairs.x + ',' + floor.stairs.y]) errors.push('stairs unreachable');
    if (get(floor.stairs.x, floor.stairs.y) === 'hazard') errors.push('stairs in hazard');
    if (get(floor.spawn.x, floor.spawn.y) === 'hazard') errors.push('spawn in hazard');
    var expected = Math.min(12, 3 + floor.depth) + floor.enemies.filter(function (e) { return e.type === 'boss'; }).length;
    if (floor.enemies.length !== expected) errors.push('enemy count ' + floor.enemies.length + ' != ' + expected);
    var spawnRoom = floor.rooms[0];
    floor.enemies.forEach(function (en) {
      if (en.x >= spawnRoom.x && en.x < spawnRoom.x + spawnRoom.w && en.y >= spawnRoom.y && en.y < spawnRoom.y + spawnRoom.h) errors.push('enemy in spawn room');
      if (Math.max(Math.abs(en.x - floor.spawn.x), Math.abs(en.y - floor.spawn.y)) <= 1) errors.push('enemy adjacent to spawn');
      // Phase 5: ground enemies are never generated onto spikes;
      // flyers are exempt. Bosses sit in security rooms only.
      if (en.type !== 'flyer' && get(en.x, en.y) === 'hazard') errors.push(en.type + ' on a hazard cell');
      if (en.type === 'boss') {
        var inSec = floor.rooms.some(function (r) { return r.type === 'structure' && r.purpose === 'security' && en.x >= r.x && en.x < r.x + r.w && en.y >= r.y && en.y < r.y + r.h; });
        if (!inSec) errors.push('boss outside a security room');
      }
    });
    // Dead-end corridor chains: corridor-only cells of degree 1.
    var deg = function (x, y) {
      return [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(function (d) { return isWalkableTile(get(x + d[0], y + d[1])); }).length;
    };
    for (var yy = 0; yy < GRID_H; yy++) for (var xx = 0; xx < GRID_W; xx++) {
      if (grid[yy][xx] !== 'corridor' || deg(xx, yy) !== 1) continue;
      // Walk the chain of corridor cells.
      var len = 1, px = xx, py = yy, prev = null;
      while (true) {
        var next = null;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var nx = px + d[0], ny = py + d[1];
          if (grid[ny] && grid[ny][nx] === 'corridor' && !(prev && nx === prev[0] && ny === prev[1])) next = [nx, ny];
        });
        if (!next) break;
        prev = [px, py]; px = next[0]; py = next[1]; len++;
        if (len > 10) break;
      }
      if (len > 4) {
        var nearLoot = floor.pickups.some(function (p) { return Math.abs(p.x - px) <= 1 && Math.abs(p.y - py) <= 1; });
        if (!nearLoot) errors.push('dead-end corridor longer than 4 without loot');
      }
    }
    // ---------- Phase 6 / Pass 6 (§9.7.8, §10 twelve checks) ----------
    // Existing checks above cover, verbatim: (2) room geometry,
    // (5) tile flood fill, (7a) stairs reachability, (9) spawn
    // safety, (11a) encounter count. The new checks below add (1)
    // grid/bounds, (3) corridor integrity, (4) room-graph BFS,
    // (6) door validity, (7b) stairs never locked, (8) lock
    // solvability, (10) content legality, (11b) boss consistency,
    // (12) determinism/metadata. Door/fog checks apply only when
    // floor.doors is an array (legacy floors without door records
    // skip them, soft pass); the JSON/plumbing checks apply always.
    // (1) Grid and bounds.
    if (!Array.isArray(grid) || grid.length !== GRID_H) errors.push('grid height ' + (grid && grid.length));
    grid.forEach(function (row, yy) {
      if (!Array.isArray(row) || row.length !== GRID_W) { errors.push('grid row ' + yy + ' width ' + (row && row.length)); return; }
      row.forEach(function (t) {
        if (['void', 'floor', 'corridor', 'door', 'wall', 'stairs', 'hazard'].indexOf(t) === -1) errors.push('unknown grid kind ' + t);
      });
    });
    if (floor.spawn.x < 0 || floor.spawn.x >= GRID_W || floor.spawn.y < 0 || floor.spawn.y >= GRID_H) errors.push('spawn out of bounds');
    if (floor.stairs.x < 0 || floor.stairs.x >= GRID_W || floor.stairs.y < 0 || floor.stairs.y >= GRID_H) errors.push('stairs out of bounds');
    floor.rooms.forEach(function (r, idx) {
      if (r.x < 0 || r.y < 0 || r.x + r.w > GRID_W || r.y + r.h > GRID_H) errors.push('room ' + idx + ' out of bounds');
    });
    // (3) Corridor integrity: every corridor/door cell reachable
    // from spawn over walkable cells (doors passable).
    for (var cy = 0; cy < GRID_H; cy++) for (var cx = 0; cx < GRID_W; cx++) {
      if ((grid[cy][cx] === 'corridor' || grid[cy][cx] === 'door') && !seen[cx + ',' + cy]) errors.push('corridor cell unreachable at ' + cx + ',' + cy);
    }
    if (Array.isArray(floor.doors) && floor.spawn) {
      // (6) Door validity: recompute the classification and compare
      // 1:1 — same chosen cells, same rooms, same entrance
      // grouping, row-major first cells, no 3+ door runs, every
      // non-spawn room has >=1 door, lock records consistent.
      var cls = classifyDoorCells(grid, floor.rooms, floor.spawn);
      if (floor.doors.length !== cls.groups.length) errors.push('door count ' + floor.doors.length + ' != classified groups ' + cls.groups.length);
      var byCell = {};
      floor.doors.forEach(function (d) {
        if (byCell[d.x + ',' + d.y]) errors.push('duplicate door record at ' + d.x + ',' + d.y);
        byCell[d.x + ',' + d.y] = d;
        if (d.id !== doorIdFor(d.x, d.y)) errors.push('door id mismatch at ' + d.x + ',' + d.y);
        if (['closed', 'open', 'locked'].indexOf(d.state) === -1) errors.push('door state invalid at ' + d.x + ',' + d.y);
        if (d.lockLevel < 0 || d.lockLevel > 3) errors.push('door lockLevel out of range at ' + d.x + ',' + d.y);
        if (d.lockLevel === 0) {
          if (d.hp !== 0 || d.maxHp !== 0 || d.keyId !== null) errors.push('unlocked door carries lock data at ' + d.x + ',' + d.y);
        } else {
          if (d.maxHp !== LOCK_HP_PER_LEVEL * d.lockLevel) errors.push('locked door maxHp wrong at ' + d.x + ',' + d.y);
          if (d.hp < 0 || d.hp > d.maxHp) errors.push('locked door hp out of range at ' + d.x + ',' + d.y);
          if (d.keyId !== 'key:' + d.id) errors.push('locked door keyId mismatch at ' + d.x + ',' + d.y);
        }
        if (d.state === 'locked' && (d.lockLevel === 0 || d.hp <= 0)) errors.push('door locked with no lock at ' + d.x + ',' + d.y);
      });
      var perRoomGroups = {};
      cls.groups.forEach(function (g) {
        var d = byCell[g.doorCell.x + ',' + g.doorCell.y];
        if (!d) { errors.push('classified door missing a record at ' + g.doorCell.x + ',' + g.doorCell.y); return; }
        if (d.roomId !== g.roomId) errors.push('door roomId mismatch at ' + d.x + ',' + d.y);
        var n = perRoomGroups[g.roomId] || 0;
        if (d.entranceId !== 'entrance:' + g.roomId + ':' + n) errors.push('door entranceId mismatch at ' + d.x + ',' + d.y);
        perRoomGroups[g.roomId] = n + 1;
      });
      // Grid door cells must match records 1:1.
      for (var gy = 0; gy < GRID_H; gy++) for (var gx = 0; gx < GRID_W; gx++) {
        if (grid[gy][gx] === 'door' && !byCell[gx + ',' + gy]) errors.push('grid door cell without a record at ' + gx + ',' + gy);
      }
      // No runs of 3+ door cells in any row or column.
      function doorRun(axis) {
        for (var a = 0; a < (axis === 'row' ? GRID_H : GRID_W); a++) {
          var run = 0;
          for (var b = 0; b < (axis === 'row' ? GRID_W : GRID_H); b++) {
            var t = axis === 'row' ? grid[a][b] : grid[b][a];
            run = t === 'door' ? run + 1 : 0;
            if (run >= 3) return true;
          }
        }
        return false;
      }
      if (doorRun('row') || doorRun('col')) errors.push('run of 3+ door cells');
      floor.rooms.forEach(function (r, idx) {
        if (idx === 0) return;
        var hasDoor = floor.doors.some(function (d) { return d.roomId === roomIdFor(idx); });
        if (!hasDoor) errors.push('room ' + idx + ' has no door');
      });
      // (4) Room-graph BFS: rooms connect through corridor+door
      // components; every room must be reachable from the spawn room.
      var compId = {}, nextComp = 0;
      for (var vy = 0; vy < GRID_H; vy++) for (var vx = 0; vx < GRID_W; vx++) {
        var vt = grid[vy][vx];
        if (vt !== 'corridor' && vt !== 'door') continue;
        var vk = vx + ',' + vy;
        if (compId[vk] !== undefined) continue;
        var cid = nextComp++, cq = [[vx, vy]];
        compId[vk] = cid;
        while (cq.length) {
          var cc = cq.shift();
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (dd) {
            var nx2 = cc[0] + dd[0], ny2 = cc[1] + dd[1], nk = nx2 + ',' + ny2;
            if (compId[nk] !== undefined) return;
            var nt = get(nx2, ny2);
            if (nt === 'corridor' || nt === 'door') { compId[nk] = cid; cq.push([nx2, ny2]); }
          });
        }
      }
      var roomComps = floor.rooms.map(function () { return []; });
      floor.doors.forEach(function (d) {
        var ri = parseInt(d.roomId.split(':')[1], 10);
        var c = compId[d.x + ',' + d.y];
        if (c !== undefined && roomComps[ri].indexOf(c) === -1) roomComps[ri].push(c);
      });
      var reachedRooms = { 0: true };
      var rq = [0];
      while (rq.length) {
        var cur = rq.shift();
        roomComps[cur].forEach(function (c) {
          floor.doors.forEach(function (d) {
            if (compId[d.x + ',' + d.y] !== c) return;
            var ri = parseInt(d.roomId.split(':')[1], 10);
            if (!reachedRooms[ri]) { reachedRooms[ri] = true; rq.push(ri); }
          });
        });
      }
      floor.rooms.forEach(function (r, idx) {
        if (!reachedRooms[idx]) errors.push('room ' + idx + ' unreachable in room graph');
      });
      // (7b) Stairs room is never locked.
      var stairsRoomIdx = roomIndexAt(floor.rooms, floor.stairs.x, floor.stairs.y);
      if (stairsRoomIdx >= 0) {
        var sr = floor.rooms[stairsRoomIdx];
        if (sr.lockedKind) errors.push('stairs room is locked');
        if (floor.doors.some(function (d) { return d.roomId === roomIdFor(stairsRoomIdx) && d.lockLevel > 0; })) errors.push('stairs room door is locked');
      }
      // (8) Lock solvability: state-space essentials. Stairs
      // reachable with locked doors as walls; every key reachable
      // with ALL locked doors as walls, inside no locked room, and
      // matching exactly one lock; every lock force-reducible
      // (finite positive HP, force always available).
      function bfsReach(blockLocked) {
        var rs = {}; var rq2 = [[floor.spawn.x, floor.spawn.y]]; rs[floor.spawn.x + ',' + floor.spawn.y] = true;
        while (rq2.length) {
          var c2 = rq2.shift();
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (dd) {
            var nx3 = c2[0] + dd[0], ny3 = c2[1] + dd[1], k3 = nx3 + ',' + ny3;
            if (rs[k3]) return;
            var t3 = get(nx3, ny3);
            if (!isWalkableTile(t3)) return;
            var dr = byCell[k3];
            if (dr && dr.lockLevel > 0 && blockLocked) return;
            rs[k3] = true; rq2.push([nx3, ny3]);
          });
        }
        return rs;
      }
      var reachOpen = bfsReach(false);
      if (!reachOpen[floor.stairs.x + ',' + floor.stairs.y]) errors.push('stairs unreachable with locks as walls');
      var reachNoLocks = bfsReach(true);
      floor.doors.forEach(function (d) {
        if (d.lockLevel === 0) return;
        var keys = floor.pickups.filter(function (p) { return p.kind === 'key' && p.keyId === d.keyId; });
        if (keys.length !== 1) { errors.push('lock ' + d.id + ' has ' + keys.length + ' keys'); return; }
        var key = keys[0];
        if (!reachNoLocks[key.x + ',' + key.y]) errors.push('key for ' + d.id + ' unreachable without opening locks');
        var keyRoom = roomIndexAt(floor.rooms, key.x, key.y);
        if (keyRoom >= 0 && floor.rooms[keyRoom].lockedKind) errors.push('key for ' + d.id + ' is inside a locked room');
        if (keyRoom === parseInt(d.roomId.split(':')[1], 10)) errors.push('key for ' + d.id + ' is in its own locked room');
      });
      // (10) Content legality: pickups on walkable, non-door,
      // non-stairs cells; locked-room contents present.
      floor.pickups.forEach(function (p) {
        var pt = get(p.x, p.y);
        if (!isWalkableTile(pt) || pt === 'door' || pt === 'stairs') errors.push('pickup ' + p.kind + ' on illegal cell ' + pt + ' at ' + p.x + ',' + p.y);
      });
      floor.rooms.forEach(function (r, idx) {
        if (!r.lockedKind) return;
        var inRoom = floor.pickups.filter(function (p) {
          return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
        });
        var doorRec = floor.doors.filter(function (d) { return d.roomId === roomIdFor(idx); })[0];
        if (r.lockedKind === 'lootVault') {
          var expected = doorRec && doorRec.lockLevel === 1 ? 1 : 2;
          var caches = inRoom.filter(function (p) { return p.kind === 'item'; }).length;
          if (caches < expected) errors.push('loot vault room ' + idx + ' has ' + caches + ' caches, expected >= ' + expected);
        } else if (r.lockedKind === 'objective') {
          var hasCodex = inRoom.some(function (p) { return p.kind === 'dataChip' && p.codex && p.codex.indexOf('Locked vault archive') === 0; });
          var hasDrop = inRoom.some(function (p) { return p.kind === 'item'; });
          var hasLore = (floor.dressing || []).some(function (dr) {
            return dr.lore && dr.x >= r.x && dr.x < r.x + r.w && dr.y >= r.y && dr.y < r.y + r.h;
          });
          if (!hasCodex && !hasDrop && !hasLore) errors.push('objective room ' + idx + ' has no objective content');
        }
      });
      // (11b) Boss/reason consistency.
      var bossCount = floor.enemies.filter(function (e) { return e.type === 'boss'; }).length;
      if (bossCount > 1) errors.push('more than one boss');
      if (typeof floor.bossReason === 'string') {
        if (floor.bossReason === 'present' && bossCount !== 1) errors.push('bossReason present but no boss');
        if (floor.bossReason !== 'present' && bossCount !== 0) errors.push('boss present with reason ' + floor.bossReason);
      }
      // (12) Generation signature + exploration shape.
      var sig = floor.generation;
      if (!sig || typeof sig.runSeed !== 'number' || typeof sig.depth !== 'number' ||
          typeof sig.generatorVersion !== 'number' || typeof sig.rulesetVersion !== 'number' ||
          typeof sig.rngAlgorithmVersion !== 'number' || typeof sig.tileCatalogVersion !== 'number') {
        errors.push('generation signature missing or incomplete');
      }
      if (sig && sig.depth !== floor.depth) errors.push('generation signature depth mismatch');
      if (!floor.explored || !Array.isArray(floor.explored.exploredRoomIds) || !Array.isArray(floor.explored.walkedCorridorCells)) {
        errors.push('explored state missing or malformed');
      } else {
        floor.explored.exploredRoomIds.forEach(function (id) {
          if (typeof id !== 'string' || !/^room:\d+$/.test(id)) errors.push('explored room id malformed: ' + id);
        });
        floor.explored.walkedCorridorCells.forEach(function (k) {
          var parts = String(k).split(',');
          if (parts.length !== 2 || isNaN(+parts[0]) || isNaN(+parts[1])) errors.push('walked corridor cell malformed: ' + k);
        });
      }
    }
    // (12) JSON round-trip + plain-data walk: no functions,
    // no non-finite numbers anywhere on the floor record.
    var badValue = null;
    (function walk(v) {
      if (badValue) return;
      if (typeof v === 'function') { badValue = 'function value'; return; }
      if (typeof v === 'number' && !isFinite(v)) { badValue = 'non-finite number'; return; }
      if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { walk(v[k]); });
    })(floor);
    if (badValue) errors.push('floor contains ' + badValue);
    try {
      var rt = JSON.parse(JSON.stringify(floor));
      if (JSON.stringify(rt) !== JSON.stringify(floor)) errors.push('floor does not survive a JSON round-trip identically');
    } catch (e) {
      errors.push('floor is not JSON-serializable: ' + e.message);
    }
    return { ok: errors.length === 0, errors: errors };
  }

  // ---------- hub state (Phase 2) ----------
  // Hub state is everything that survives a run: banked salvage,
  // stockpiled components, Codex entries, and at most one wreck.
  // Run state is everything that dies with a run. The two are
  // persisted under separate localStorage keys (see save/load).
  // ---------- Phase 3 hub systems (all playtest starting points) ----------
  // Chassis tiers: +10 max HP per tier, 5 tiers max (base 100 -> 150).
  // Banking tiers: Descend banks 25% -> 40% -> 55%, gated on Codex
  // entries (hub growth tied to recovered tech, per MECHANICS-PLAN).
  // Stockpile: crafted items waiting in the hub; a capped amount is
  // taken into each new expedition (see STARTING_LOAD).
  var CHASSIS_TIER_COSTS = [40, 80, 160, 300, 500];
  var CHASSIS_HP_PER_TIER = 10;
  var CHASSIS_MAX_TIER = 5;
  var BANKING_TIERS = [
    { rate: 0.25, cost: 0, codexNeeded: 0 },
    { rate: 0.40, cost: 60, codexNeeded: 1 },
    { rate: 0.55, cost: 150, codexNeeded: 3 },
  ];
  var COMPONENT_TO_SALVAGE = 8;   // 1 component -> 8 banked salvage
  var SALVAGE_PER_COMPONENT = 15; // 15 banked salvage -> 1 component (worse rate, by design)
  var STARTING_LOAD = { health: 2, food: 2, repairKit: 1 }; // Phase 4: ammo moved to the loadout (computeLoadout), not the stockpile take.
  // Data-driven recipes: ingredients are hub banked salvage and/or
  // stockpiled components; output goes to the hub stockpile.
  var RECIPES = {
    healthCell: { name: 'Health cell', output: 'health', outputCount: 1, ingredients: { components: 1, salvage: 5 } },
    food: { name: 'Food', output: 'food', outputCount: 1, ingredients: { components: 0, salvage: 4 } },
    repairKit: { name: 'Repair kit', output: 'repairKit', outputCount: 1, ingredients: { components: 2, salvage: 10 } },
    // Ammo faucet (balance slice, 2026-10-28): 6 ammo = one crate, salvage-only
    // so it competes with chassis/banking savings. Sized by sim_ammo.js.
    // Phase 4 (§7.6.3): the Standard recipe is unchanged (8 salvage -> 6
    // Standard rounds); the three typed recipes output 6 rounds each,
    // are gated on Ammo Smith ranks, and require no Codex entry.
    // Ingredient keys may be components, salvage, or material keys
    // (wire / coreThermal / coreShock / coreCorrosive).
    ammoPack: { name: 'Ammo pack', output: 'ammoStandard', outputCount: 6, ingredients: { components: 0, salvage: 8 } },
    piercingPack: { name: 'Piercing pack', output: 'ammoPiercing', outputCount: 6, ingredients: { wire: 6, salvage: 4 }, requires: { skill: 'ammoSmith', rank: 1, codex: null } },
    incendiaryPack: { name: 'Incendiary pack', output: 'ammoIncendiary', outputCount: 6, ingredients: { coreThermal: 2, wire: 4 }, requires: { skill: 'ammoSmith', rank: 2, codex: null } },
    shockPack: { name: 'Shock pack', output: 'ammoShock', outputCount: 6, ingredients: { coreShock: 2, wire: 4 }, requires: { skill: 'ammoSmith', rank: 3, codex: null } },
  };
  function newHub() {
    return { banked: 0, components: 0, codex: [], wreck: null, lastExtracted: 0,
      chassisTier: 0, bankingTier: 0, stockpile: { health: 0, food: 0, repairKit: 0, ammoStandard: 0, ammoPiercing: 0, ammoIncendiary: 0, ammoShock: 0 },
      materials: emptyMaterials(), deepestDepth: 1,
      // Phase 3: permanent pilot skills (hub store) + pilot XP pool.
      skills: {}, pilotXp: 0, secondWindCooldown: 0 };
  }
  function ensureHub(hub) {
    if (!hub) return newHub();
    if (typeof hub.banked !== 'number') hub.banked = 0;
    if (typeof hub.components !== 'number') hub.components = 0;
    if (!Array.isArray(hub.codex)) hub.codex = [];
    if (!('wreck' in hub)) hub.wreck = null;
    if (typeof hub.lastExtracted !== 'number') hub.lastExtracted = 0;
    if (typeof hub.chassisTier !== 'number' || hub.chassisTier < 0) hub.chassisTier = 0;
    if (hub.chassisTier > CHASSIS_MAX_TIER) hub.chassisTier = CHASSIS_MAX_TIER;
    if (typeof hub.bankingTier !== 'number' || hub.bankingTier < 0) hub.bankingTier = 0;
    if (hub.bankingTier >= BANKING_TIERS.length) hub.bankingTier = BANKING_TIERS.length - 1;
    if (!hub.stockpile || typeof hub.stockpile !== 'object') hub.stockpile = { health: 0, food: 0, repairKit: 0, ammoStandard: 0, ammoPiercing: 0, ammoIncendiary: 0, ammoShock: 0 };
    ['health', 'food', 'repairKit'].forEach(function (k) { if (typeof hub.stockpile[k] !== 'number' || hub.stockpile[k] < 0) hub.stockpile[k] = 0; });
    // Phase 4 (§7.6.4): legacy single-pool `ammo` migrates to
    // ammoStandard, clamped to the 999 hub cap, with a diagnostic
    // recorded once per migration (idempotent: the legacy key is
    // dropped, so a second pass finds nothing to migrate).
    if (typeof hub.stockpile.ammo === 'number' && hub.stockpile.ammo !== 0) {
      var legacy = Math.max(0, Math.floor(hub.stockpile.ammo));
      var clamped = Math.min(legacy, HUB_AMMO_CAP);
      hub.stockpile.ammoStandard = Math.min(HUB_AMMO_CAP, (typeof hub.stockpile.ammoStandard === 'number' ? Math.max(0, Math.floor(hub.stockpile.ammoStandard)) : 0) + clamped);
      if (!Array.isArray(hub.migrationNotes)) hub.migrationNotes = [];
      hub.migrationNotes.push('Legacy ammo ' + legacy + ' migrated to ammoStandard ' + clamped + (legacy > HUB_AMMO_CAP ? ' (excess ' + (legacy - HUB_AMMO_CAP) + ' discarded, cap ' + HUB_AMMO_CAP + ')' : '') + '.');
      delete hub.stockpile.ammo;
    } else if ('ammo' in hub.stockpile) {
      delete hub.stockpile.ammo;
    }
    AMMO_TYPES.forEach(function (t) {
      var k = 'ammo' + t[0].toUpperCase() + t.slice(1);
      if (typeof hub.stockpile[k] !== 'number' || hub.stockpile[k] < 0) hub.stockpile[k] = 0;
      else hub.stockpile[k] = Math.floor(hub.stockpile[k]);
    });
    // Phase 4: materials store. Absent in old saves -> all zero.
    hub.materials = clampMaterials(hub.materials);
    if (typeof hub.deepestDepth !== 'number' || hub.deepestDepth < 1) hub.deepestDepth = 1;
    // Phase 3: pilot skills + XP. Unknown ids and out-of-range ranks
    // are dropped, never trusted from a stored save.
    if (!hub.skills || typeof hub.skills !== 'object' || Array.isArray(hub.skills)) hub.skills = {};
    Object.keys(hub.skills).forEach(function (id) {
      var r = hub.skills[id];
      if (!PILOT_SKILLS[id] || typeof r !== 'number' || r < 1 || r > 3) delete hub.skills[id];
      else hub.skills[id] = Math.floor(r);
    });
    if (typeof hub.pilotXp !== 'number' || hub.pilotXp < 0) hub.pilotXp = 0; else hub.pilotXp = Math.floor(hub.pilotXp);
    if (typeof hub.secondWindCooldown !== 'number' || hub.secondWindCooldown < 0) hub.secondWindCooldown = 0; else hub.secondWindCooldown = Math.floor(hub.secondWindCooldown);
    return hub;
  }
  // Codex: a discovery is recorded the moment it is found, even if
  // the run is then lost. Entries are deduped by name.
  function addCodex(state, entry) {
    if (!state.codex) state.codex = [];
    if (state.codex.indexOf(entry) === -1) state.codex.push(entry);
    if (state.hub) {
      state.hub.codex = state.codex;
    }
    return state.codex.indexOf(entry) !== -1;
  }
  // Attach a hub to a run (new or loaded). The run's banked total
  // and Codex become the hub's; the run's carried inventory is
  // untouched. If the hub holds a wreck for this depth and no wreck
  // is already placed on this floor, place it.
  function attachHub(state, hub) {
    state.hub = ensureHub(hub);
    state.banked = state.hub.banked;
    state.codex = state.hub.codex;
    if (state.hub.wreck && state.hub.wreck.depth === state.depth && !state.playerWreck) {
      placeWreckOnFloor(state, state.hub.wreck);
    }
    // Phase 3: pilot skills are passive modifiers; refresh the seam
    // so every derivedStats read sees the hub's current ranks.
    refreshPilotMods(state);
    return state;
  }
  // ---------- Phase 3: pilot skills (hub store, LOOT-SKILLS-DESIGN.md §6.1) ----------
  // Read-only rank lookup: never normalizes, never mutates — safe in
  // hot paths (resolveAttack, killEnemy).
  function pilotSkillRank(hub, id) {
    if (!hub || !hub.skills) return 0;
    var r = hub.skills[id];
    if (typeof r !== 'number' || r < 1 || r > 3) return 0;
    return Math.floor(r);
  }
  function pilotRank(state, id) {
    return (state && state.hub) ? pilotSkillRank(state.hub, id) : 0;
  }
  function totalPilotRanks(hub) {
    var total = 0;
    Object.keys(PILOT_SKILLS).forEach(function (id) { total += pilotSkillRank(hub, id); });
    return total;
  }
  // Pilot skills feed derivedStats through the Phase 2 derivedMods
  // seam: steadyAim -> acc, heavyHands -> dmgMult, platingKnowhow ->
  // armor (only while armor gear is equipped).
  function computePilotMods(hub, state) {
    var mods = {};
    var steady = pilotSkillRank(hub, 'steadyAim');
    if (steady) mods.acc = steady;
    var heavy = pilotSkillRank(hub, 'heavyHands');
    if (heavy) mods.dmgMult = 0.10 * heavy;
    var plating = pilotSkillRank(hub, 'platingKnowhow');
    if (plating && equippedGear(state, 'armor')) mods.armor = plating;
    return mods;
  }
  function refreshPilotMods(state) {
    if (!state) return {};
    state.derivedMods = state.hub ? computePilotMods(state.hub, state) : {};
    return state.derivedMods;
  }
  // Buy the next rank of a pilot skill with banked salvage. Gates:
  // Codex entries and pilot XP unlock eligibility; salvage pays.
  // Hub-only: the UI never calls this mid-run.
  function buyPilotSkill(hub, skillId) {
    var h = ensureHub(hub);
    var def = PILOT_SKILLS[skillId];
    if (!def) return { ok: false, reason: 'Unknown pilot skill: ' + skillId + '.' };
    var cur = pilotSkillRank(h, skillId);
    if (cur >= 3) return { ok: false, reason: def.name + ' is already at max rank (3).' };
    var next = cur + 1;
    if (h.codex.length < def.codexNeeded) return { ok: false, reason: def.name + ' needs ' + def.codexNeeded + ' Codex entries, have ' + h.codex.length + '.' };
    if (h.pilotXp < def.xpNeeded[next - 1]) return { ok: false, reason: def.name + ' rank ' + next + ' needs ' + def.xpNeeded[next - 1] + ' pilot XP, have ' + h.pilotXp + '.' };
    var cost = def.costs[next - 1];
    if (h.banked < cost) return { ok: false, reason: 'Needs ' + cost + ' banked salvage, have ' + h.banked + '.' };
    h.banked -= cost;
    h.skills[skillId] = next;
    return { ok: true, skill: skillId, rank: next, cost: cost };
  }
  // Respec refunds ALL ranks at 25 salvage per rank refunded. Codex
  // entries and pilot XP are untouched; rebuying re-charges the
  // normal rank prices.
  function respecPilotSkills(hub) {
    var h = ensureHub(hub);
    var total = totalPilotRanks(h);
    if (!total) return { ok: false, reason: 'No pilot skill ranks to refund.' };
    var cost = RESPEC_COST_PER_RANK * total;
    if (h.banked < cost) return { ok: false, reason: 'Respec needs ' + cost + ' banked salvage, have ' + h.banked + '.' };
    h.banked -= cost;
    h.skills = {};
    return { ok: true, refunded: total, cost: cost };
  }
  // Phase 4 unlock records only (LOOT-SKILLS-DESIGN.md §6.1): the
  // rank-1 gate for Breakdown/Ammo Smith. Nothing dismantles or
  // crafts in Phase 3.
  function pilotPhase4Unlock(hub, key) {
    var h = ensureHub(hub);
    return Object.keys(PILOT_SKILLS).some(function (id) {
      return PILOT_SKILLS[id].unlocksPhase4 === key && pilotSkillRank(h, id) >= 1;
    });
  }
  // Second Wind: once per run, a lethal hit leaves the player at
  // 1 HP instead of dead, then starts a cooldown counted in runs
  // (3/2/1 runs by rank) on the hub. Returns true when it saved.
  function checkSecondWind(state) {
    if (!state || !state.player || state.player.hp > 0) return false;
    if (state.secondWindUsed) return false;
    var rank = pilotRank(state, 'secondWind');
    if (!rank) return false;
    if (state.hub && (state.hub.secondWindCooldown || 0) > 0) return false;
    state.player.hp = 1;
    state.secondWindUsed = true;
    if (state.hub) state.hub.secondWindCooldown = Math.max(0, 4 - rank);
    logMsg(state, 'Second Wind! You survive the lethal hit at 1 HP.');
    return true;
  }
  // Wreck placement: a walkable, flood-fill-reachable floor cell,
  // never the spawn tile, never stairs, never an enemy/pickup/
  // hazard/dressing cell. Deterministic for a given runSeed+depth
  // so a loaded run and a fresh run agree on placement.
  function placeWreckOnFloor(state, wreckRecord) {
    var floor = state.floor;
    function walkableAt(x, y) {
      return isWalkableTile(floor.grid[y][x]);
    }
    // Flood fill from spawn (4-dir, walkable tiles only).
    var seen = {}; var q = [[floor.spawn.x, floor.spawn.y]]; seen[floor.spawn.x + ',' + floor.spawn.y] = true;
    while (q.length) {
      var c = q.shift();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = c[0] + d[0], ny = c[1] + d[1], k = nx + ',' + ny;
        if (!seen[k] && nx >= 0 && ny >= 0 && nx < GRID_W && ny < GRID_H && walkableAt(nx, ny)) { seen[k] = true; q.push([nx, ny]); }
      });
    }
    var candidates = [];
    for (var y = 0; y < GRID_H; y++) for (var x = 0; x < GRID_W; x++) {
      if (!seen[x + ',' + y]) continue;
      if (x === floor.spawn.x && y === floor.spawn.y) continue;
      if (x === floor.stairs.x && y === floor.stairs.y) continue;
      if (floor.enemies.some(function (e) { return e.alive && e.x === x && e.y === y; })) continue;
      if (floor.pickups.some(function (p) { return p.x === x && p.y === y; })) continue;
      if (floor.hazards.some(function (h) { return h.x === x && h.y === y; })) continue;
      if (floor.dressing && floor.dressing.some(function (d) { return d.x === x && d.y === y; })) continue;
      candidates.push({ x: x, y: y });
    }
    if (!candidates.length) return false;
    var rng = mulberry32(((state.runSeed ^ state.depth ^ 0x5eed) >>> 0));
    var pick = candidates[Math.floor(rng() * candidates.length)];
    state.playerWreck = {
      x: pick.x, y: pick.y, depth: wreckRecord.depth,
      salvage: wreckRecord.salvage || 0, health: wreckRecord.health || 0,
      food: wreckRecord.food || 0, components: wreckRecord.components || 0,
      repairKit: wreckRecord.repairKit || 0,
      // Phase 4: typed ammo pools. Legacy records carry a single
      // `ammo` count, which is read as Standard.
      ammoPools: wreckRecord.ammoPools && typeof wreckRecord.ammoPools === 'object' ? clampPools(wreckRecord.ammoPools, RUN_AMMO_CAP)
        : (function () { var p = emptyAmmoPools(); p.standard = Math.max(0, Math.floor(wreckRecord.ammo || 0)); return p; })(),
      // Phase 2: the wreck carries the equipped set at death.
      // Gearless (legacy) wrecks normalize to all-null: nothing to
      // recover, and nothing invented.
      gear: normalizeGearSet(wreckRecord.gear),
    };
    return true;
  }
  // Death -> wreck, exactly once per death. The wreck holds the
  // unbanked carried salvage and carried items (health, food,
  // components, ammo). Banked salvage and Codex entries are NOT in the
  // wreck and are never lost this way. If a wreck already waited,
  // it is destroyed and replaced — only one wreck at a time.
  function recordPlayerDeath(state) {
    if (state.state !== 'dead' || state.deathRecorded) return null;
    state.deathRecorded = true;
    // Phase 3: mech skills die with the run. Pending pilot XP is
    // NOT banked — it is lost, like unbanked salvage.
    state.mechSkills = []; state.runSkillPoints = 0;
    state.mechEffects = { overclockShots: 0, evasiveUntil: -1, platingUntil: -1, salvageBurst: false };
    state.overheated = false;
    var wreck = {
      depth: state.depth, salvage: state.carried || 0,
      health: state.healthCells || 0, food: state.foodCells || 0,
      components: state.components || 0, repairKit: state.repairKits || 0,
      // Phase 4: the wreck snapshots the typed ammo pools. The
      // single `ammo` total is kept for readers of old records.
      ammoPools: clampPools(state.ammoPools, RUN_AMMO_CAP),
      ammo: totalAmmo(state.ammoPools),
      // Phase 2: the equipped set at death rides in the wreck and
      // comes back intact on recovery. Unequipped carried gear does
      // not: only the equipped set is wrecked. An unrecovered wreck
      // destroyed by a second death loses its gear with it — the
      // same one-wreck rule as the salvage.
      gear: normalizeGearSet({
        weapon: state.weapon,
        armor: state.equipment ? state.equipment.armor : null,
        shield: state.equipment ? state.equipment.shield : null,
        utility: state.equipment ? state.equipment.utility : null,
      }),
    };
    if (state.hub && state.depth > state.hub.deepestDepth) state.hub.deepestDepth = state.depth;
    var destroyedOld = !!(state.hub && state.hub.wreck);
    if (state.hub) state.hub.wreck = wreck;
    state.pendingWreck = wreck;
    if (destroyedOld) logMsg(state, 'Your old wreck was destroyed before you could recover it.');
    logMsg(state, 'Your mech is a wreck at depth ' + wreck.depth + ' holding ' + wreck.salvage + ' salvage.');
    return wreck;
  }

  // ---------- Phase 3 hub functions (pure logic, hub object only) ----------
  function bankingRateFor(hub) {
    var h = ensureHub(hub);
    return BANKING_TIERS[h.bankingTier].rate;
  }
  function buyChassisTier(hub) {
    var h = ensureHub(hub);
    if (h.chassisTier >= CHASSIS_MAX_TIER) return { ok: false, reason: 'Chassis already at max tier (' + CHASSIS_MAX_TIER + ').' };
    var cost = CHASSIS_TIER_COSTS[h.chassisTier];
    if (h.banked < cost) return { ok: false, reason: 'Needs ' + cost + ' banked salvage, have ' + h.banked + '.' };
    h.banked -= cost; h.chassisTier++;
    return { ok: true, tier: h.chassisTier, maxHpBonus: h.chassisTier * CHASSIS_HP_PER_TIER };
  }
  function buyBankingTier(hub) {
    var h = ensureHub(hub);
    if (h.bankingTier >= BANKING_TIERS.length - 1) return { ok: false, reason: 'Banking already at max tier (55%).' };
    var next = BANKING_TIERS[h.bankingTier + 1];
    if (h.codex.length < next.codexNeeded) return { ok: false, reason: 'Needs ' + next.codexNeeded + ' Codex entries, have ' + h.codex.length + '.' };
    if (h.banked < next.cost) return { ok: false, reason: 'Needs ' + next.cost + ' banked salvage, have ' + h.banked + '.' };
    h.banked -= next.cost; h.bankingTier++;
    return { ok: true, tier: h.bankingTier, rate: next.rate };
  }
  function convertComponentsToSalvage(hub, count) {
    var h = ensureHub(hub);
    count = Math.floor(count);
    if (!(count > 0)) return { ok: false, reason: 'Convert a positive number of components.' };
    if (h.components < count) return { ok: false, reason: 'Needs ' + count + ' components, have ' + h.components + '.' };
    h.components -= count; h.banked += count * COMPONENT_TO_SALVAGE;
    return { ok: true, salvageGained: count * COMPONENT_TO_SALVAGE };
  }
  function convertSalvageToComponents(hub, count) {
    var h = ensureHub(hub);
    count = Math.floor(count);
    if (!(count > 0)) return { ok: false, reason: 'Convert to a positive number of components.' };
    var cost = count * SALVAGE_PER_COMPONENT;
    if (h.banked < cost) return { ok: false, reason: 'Needs ' + cost + ' banked salvage, have ' + h.banked + '.' };
    h.banked -= cost; h.components += count;
    return { ok: true, componentsGained: count };
  }
  // ---------- Phase 4: ammo switching, breakdown, Enhance (§7.6) ----------
  // Switching costs no time and never touches the pools. The game
  // layer binds these to keys / the Bag selector.
  function selectAmmoType(state, type) {
    if (!isAmmoType(type)) return { ok: false, reason: 'Unknown ammo type: ' + type + '.' };
    state.selectedAmmo = type;
    return { ok: true, type: type };
  }
  function cycleAmmoType(state, dir) {
    var cur = isAmmoType(state.selectedAmmo) ? state.selectedAmmo : 'standard';
    var idx = AMMO_TYPES.indexOf(cur);
    var next = AMMO_TYPES[(idx + (dir < 0 ? -1 : 1) + AMMO_TYPES.length) % AMMO_TYPES.length];
    state.selectedAmmo = next;
    return { ok: true, type: next };
  }
  // Breakdown (§7.6.1–7.6.2): hub Salvager only, rank-1 gate, fixed
  // yields at every rank, one item per action, irreversible. Core
  // yields are independent uniform 1/3 rolls on the seeded stream.
  // Equipped items are ineligible until unequipped (the UI only
  // offers carried gear); unrecovered-wreck items are ineligible
  // because they are not in the run's carried gear until recovered.
  function breakdownCapCheck(h, wire, cores) {
    var overflow = [];
    if (h.materials.wire + wire > HUB_MATERIAL_CAP) overflow.push('wire');
    CORE_KEYS.forEach(function (k) { if (h.materials[k] + cores[k] > HUB_MATERIAL_CAP) overflow.push(k); });
    if (overflow.length) return { ok: false, reason: 'Breakdown would exceed the ' + HUB_MATERIAL_CAP + ' materials cap (' + overflow.join(', ') + ').' };
    return { ok: true };
  }
  function breakDownComponent(hub, rng) {
    var h = ensureHub(hub);
    if (!pilotPhase4Unlock(h, 'breakdown')) return { ok: false, reason: 'Breakdown needs the Breakdown pilot skill at rank 1.' };
    if (!(h.components > 0)) return { ok: false, reason: 'No components to break down.' };
    var y = BREAKDOWN_YIELDS.component;
    var cores = rollCores(rng, y.cores);
    // All-or-nothing: the yield is random, so overflow is only
    // knowable after the roll. On refusal the component stays and
    // nothing is granted (the RNG draws are consumed — unavoidable
    // for a random yield; no ingredients, materials, or time are).
    var check = breakdownCapCheck(h, y.wire, cores);
    if (!check.ok) return check;
    h.components -= 1;
    h.materials.wire += y.wire;
    CORE_KEYS.forEach(function (k) { h.materials[k] += cores[k]; });
    return { ok: true, source: 'component', wire: y.wire, cores: cores };
  }
  function breakDownGear(hub, state, index, rng) {
    var h = ensureHub(hub);
    if (!pilotPhase4Unlock(h, 'breakdown')) return { ok: false, reason: 'Breakdown needs the Breakdown pilot skill at rank 1.' };
    if (!state || !Array.isArray(state.carriedGear)) return { ok: false, reason: 'No carried gear.' };
    var inst = state.carriedGear[index];
    if (!inst) return { ok: false, reason: 'No item in that Bag slot.' };
    var norm = normalizeItemInstance(inst);
    var y = BREAKDOWN_YIELDS[norm.tier];
    var cores = rollCores(rng, y.cores);
    var check = breakdownCapCheck(h, y.wire, cores);
    if (!check.ok) return check;
    state.carriedGear.splice(index, 1);
    h.materials.wire += y.wire;
    CORE_KEYS.forEach(function (k) { h.materials[k] += cores[k]; });
    return { ok: true, source: 'gear', wire: y.wire, cores: cores, item: itemDisplayName(norm), tier: norm.tier };
  }
  // Enhance (§7.6.7): hub Armorer only, all four gear slots, one
  // instance, atomic. Cost = 4 x target level in wire + 1 matching
  // core when the item carries an element tag. Absolute ceiling +5.
  // Tier, affixes, damage dice, and the element tag never change.
  function enhanceCost(inst) {
    var w = normalizeItemInstance(inst);
    if (w.upgrade >= ENHANCE_MAX_UPGRADE) return { ok: false, reason: itemDisplayName(w) + ' is already at +' + ENHANCE_MAX_UPGRADE + ' (the absolute ceiling).' };
    var target = w.upgrade + 1;
    var cost = { wire: ENHANCE_WIRE_PER_LEVEL * target, core: 0, coreKind: null };
    if (w.element === 'thermal') { cost.core = 1; cost.coreKind = 'coreThermal'; }
    else if (w.element === 'shock') { cost.core = 1; cost.coreKind = 'coreShock'; }
    else if (w.element === 'corrosive') { cost.core = 1; cost.coreKind = 'coreCorrosive'; }
    return { ok: true, cost: cost, target: target, item: w };
  }
  function enhanceItem(hub, state, loc) {
    var h = ensureHub(hub);
    var inst = null;
    if (loc && loc.slot) {
      if (loc.slot === 'weapon') inst = state.weapon;
      else if (state.equipment) inst = state.equipment[loc.slot];
      if (!inst) return { ok: false, reason: 'No ' + loc.slot + ' equipped.' };
      if (loc.slot !== 'weapon' && loc.slot !== 'armor' && loc.slot !== 'shield' && loc.slot !== 'utility') {
        return { ok: false, reason: 'Unknown gear slot: ' + loc.slot + '.' };
      }
    } else if (loc && typeof loc.carriedIndex === 'number') {
      if (!state.carriedGear) return { ok: false, reason: 'No carried gear.' };
      inst = state.carriedGear[loc.carriedIndex];
      if (!inst) return { ok: false, reason: 'No item in that Bag slot.' };
    } else {
      return { ok: false, reason: 'Enhance needs a gear slot or a Bag index.' };
    }
    var ec = enhanceCost(inst);
    if (!ec.ok) return ec;
    var cost = ec.cost;
    if (h.materials.wire < cost.wire) return { ok: false, reason: 'Enhance needs ' + cost.wire + ' wire, have ' + h.materials.wire + '.' };
    if (cost.core > 0 && h.materials[cost.coreKind] < cost.core) return { ok: false, reason: 'Enhance needs 1 ' + cost.coreKind + ', have ' + h.materials[cost.coreKind] + '.' };
    h.materials.wire -= cost.wire;
    if (cost.core > 0) h.materials[cost.coreKind] -= cost.core;
    var norm = normalizeItemInstance(inst);
    norm.upgrade = ec.target;
    if (loc.slot === 'weapon') {
      state.weapon = norm;
      if (state.equipment) state.equipment.weapon = normalizeWeaponInstance(norm);
    } else if (loc.slot) {
      state.equipment[loc.slot] = norm;
    } else {
      state.carriedGear[loc.carriedIndex] = norm;
    }
    return { ok: true, item: norm, cost: cost, target: ec.target };
  }
  function craft(hub, recipeId, count) {
    var h = ensureHub(hub);
    var recipe = RECIPES[recipeId];
    if (!recipe) return { ok: false, reason: 'Unknown recipe: ' + recipeId + '.' };
    count = count || 1;
    if (!(count > 0)) return { ok: false, reason: 'Craft a positive amount.' };
    // Phase 4 (§7.6.3): skill gate + Codex gate are checked BEFORE
    // anything is consumed, with a specific reason on refusal.
    if (recipe.requires) {
      if (recipe.requires.skill && pilotSkillRank(h, recipe.requires.skill) < recipe.requires.rank) {
        return { ok: false, reason: recipe.name + ' needs ' + PILOT_SKILLS[recipe.requires.skill].name + ' rank ' + recipe.requires.rank + ', have rank ' + pilotSkillRank(h, recipe.requires.skill) + '.' };
      }
      if (typeof recipe.requires.codex === 'number' && h.codex.length < recipe.requires.codex) {
        return { ok: false, reason: recipe.name + ' needs ' + recipe.requires.codex + ' Codex entries, have ' + h.codex.length + '.' };
      }
    }
    var needComp = (recipe.ingredients.components || 0) * count;
    var needSalv = (recipe.ingredients.salvage || 0) * count;
    var shortfall = [];
    if (h.components < needComp) shortfall.push('needs ' + needComp + ' components, have ' + h.components);
    if (h.banked < needSalv) shortfall.push('needs ' + needSalv + ' banked salvage, have ' + h.banked);
    MATERIAL_KEYS.forEach(function (k) {
      var need = (recipe.ingredients[k] || 0) * count;
      if (need > 0 && h.materials[k] < need) shortfall.push('needs ' + need + ' ' + k + ', have ' + h.materials[k]);
    });
    if (shortfall.length) return { ok: false, reason: 'Short on ingredients: ' + shortfall.join('; ') + '.', shortfall: shortfall };
    // Phase 4 (§7.6.4): crafting overflow is an all-or-nothing
    // refusal — checked before anything is consumed.
    var outCount = recipe.outputCount * count;
    var isTypedAmmo = AMMO_TYPES.some(function (t) { return recipe.output === 'ammo' + t[0].toUpperCase() + t.slice(1); });
    if (isTypedAmmo && h.stockpile[recipe.output] + outCount > HUB_AMMO_CAP) {
      return { ok: false, reason: recipe.name + ' would exceed the ' + HUB_AMMO_CAP + ' stockpile cap (' + h.stockpile[recipe.output] + ' + ' + outCount + ').' };
    }
    h.components -= needComp; h.banked -= needSalv;
    MATERIAL_KEYS.forEach(function (k) {
      var need = (recipe.ingredients[k] || 0) * count;
      if (need > 0) h.materials[k] -= need;
    });
    h.stockpile[recipe.output] = (h.stockpile[recipe.output] || 0) + outCount;
    return { ok: true, output: recipe.output, outputCount: outCount };
  }
  // Scout preview: the next floor's enemy composition, counted from
  // the SAME generator that will build that floor. For a given
  // runSeed + depth the generator is deterministic, so this preview
  // is exact for the floor the player is about to enter — no
  // invented enemies, no invented counts.
  function scoutPreview(runSeed, depth) {
    var floor = generateFloor(runSeed, depth);
    var byType = {};
    floor.enemies.forEach(function (en) {
      if (!byType[en.type]) byType[en.type] = { type: en.type, name: en.name, count: 0 };
      byType[en.type].count++;
    });
    var list = Object.keys(byType).map(function (k) { return byType[k]; });
    list.sort(function (a, b) { return a.type < b.type ? -1 : 1; });
    return { depth: depth, total: floor.enemies.length, theme: floor.theme, byType: list };
  }
  // Radio rumors: procedural, observational only — derived from real
  // hub state (deepest depth, Codex count, wreck, vault totals).
  // Deliberately no quest language: nothing here asks the player to
  // go somewhere, fetch something, or accept a contract. Those are
  // Phase 4 (factions, contracts, authored quests).
  function rumors(hub) {
    var h = ensureHub(hub);
    var out = [];
    out.push('Deepest floor reached so far: depth ' + h.deepestDepth + '.');
    if (h.wreck) out.push('A wreck waits at depth ' + h.wreck.depth + ' holding ' + h.wreck.salvage + ' salvage. Salvage left in a wreck does not wait forever.');
    else out.push('No wreck waits in the dungeon right now.');
    if (!h.codex.length) out.push('No Codex entries recovered yet — the deep floors are keeping their secrets.');
    else out.push(h.codex.length + ' Codex entries recovered. The deeper signatures keep changing as more are found.');
    out.push('The vault holds ' + h.banked + ' banked salvage and ' + h.components + ' stockpiled components.');
    if (h.deepestDepth >= 3) out.push('Chatter from the deep floors mentions heavier plating below depth 3.');
    return out;
  }

  // ---------- game state + scheduler ----------
  // ---------- loadout (Phase 4, §7.6.4) ----------
  // The player chooses a starting ammo loadout before each run.
  // The loadout ALLOCATION is what the player takes from the hub
  // stockpile; the run is topped up to LOADOUT_TOTAL_CAP (16) with
  // free Standard rounds, so an allocation of {standard: 5} starts
  // the run with 16 Standard (11 free + 5 from the hub) and the
  // hub loses only the 5 allocated. An empty / skipped allocation
  // starts with 16 Standard if available — always, as free rounds,
  // never drawn from the hub. Allocations are validated against the
  // per-type cap (12), the total cap (16), and hub ownership; an
  // invalid allocation falls back to the default with a reason.
  function computeLoadout(hub, allocation) {
    var def = emptyAmmoPools();
    def.standard = STARTING_AMMO;
    var empty = emptyAmmoPools();
    if (!allocation) return { ok: true, pools: def, allocation: empty, defaulted: true, reason: '' };
    var alloc = emptyAmmoPools();
    var total = 0;
    for (var i = 0; i < AMMO_TYPES.length; i++) {
      var t = AMMO_TYPES[i];
      var v = allocation[t];
      if (v === undefined || v === null) v = 0;
      if (typeof v !== 'number' || !isFinite(v) || Math.floor(v) !== v || v < 0) {
        return { ok: false, pools: def, allocation: empty, reason: 'Loadout: ' + t + ' must be a whole number >= 0.' };
      }
      if (v > LOADOUT_TYPE_CAP) {
        return { ok: false, pools: def, allocation: empty, reason: 'Loadout: at most ' + LOADOUT_TYPE_CAP + ' ' + AMMO_TYPE_NAMES[t] + ' per run.' };
      }
      alloc[t] = v;
      total += v;
    }
    if (total > LOADOUT_TOTAL_CAP) {
      return { ok: false, pools: def, allocation: empty, reason: 'Loadout: at most ' + LOADOUT_TOTAL_CAP + ' rounds total, asked ' + total + '.' };
    }
    if (hub) {
      var sp = ensureHub(hub).stockpile;
      for (var j = 0; j < AMMO_TYPES.length; j++) {
        var t2 = AMMO_TYPES[j];
        var key = 'ammo' + t2[0].toUpperCase() + t2.slice(1);
        if (alloc[t2] > sp[key]) {
          return { ok: false, pools: def, allocation: empty, reason: 'Loadout: only ' + sp[key] + ' ' + AMMO_TYPE_NAMES[t2] + ' in the hub stockpile.' };
        }
      }
    } else if (total > 0) {
      return { ok: false, pools: def, allocation: empty, reason: 'Loadout: no hub stockpile to draw from.' };
    }
    var pools = emptyAmmoPools();
    pools.standard = (LOADOUT_TOTAL_CAP - total) + alloc.standard;
    pools.piercing = alloc.piercing;
    pools.incendiary = alloc.incendiary;
    pools.shock = alloc.shock;
    return { ok: true, pools: pools, allocation: alloc, defaulted: false, reason: '' };
  }
  function newRun(runSeed, hub, loadout) {
    var floor = generateFloor(runSeed, 1);
    var maxHp = PLAYER_DEF.hp + (hub ? (ensureHub(hub).chassisTier || 0) * CHASSIS_HP_PER_TIER : 0);
    var state = {
      runSeed: runSeed, depth: 1, floor: floor,
      player: {
        x: floor.spawn.x, y: floor.spawn.y, facing: 0,
        hp: maxHp, maxHp: maxHp,
        dmg: PLAYER_DEF.dmg, dmgVar: PLAYER_DEF.dmgVar,
        armor: PLAYER_DEF.armor, acc: PLAYER_DEF.acc, evasion: PLAYER_DEF.evasion,
      },
      clock: 0, carried: 0, banked: 0, state: 'playing', // playing|stairs|dead|extracted
      log: [], wrecks: [], kills: 0, lastBankedAmount: 0, lostOnDeath: 0, lastExtracted: 0,
      healthCells: 0, foodCells: 0, components: 0, dataChips: 0, repairKits: 0,
      // Phase 4: typed ammo pools + selected type. The default loadout
      // (16 Standard) is applied by computeLoadout below.
      ammoPools: emptyAmmoPools(), selectedAmmo: 'standard',
      weapon: makeItemInstance('scrapBlaster', 'common', 0, [], null),
      // Phase 2: the equipped set. equipment.weapon mirrors
      // state.weapon (the authority — see weaponStats); gear slots
      // start empty. carriedGear is the Bag's stowed items: pickups
      // land here, swapping is Bag-only. shield is the current
      // absorb pool (0 until it charges); shieldNextRecharge is the
      // clock time of the next +1.
      equipment: { weapon: makeItemInstance('scrapBlaster', 'common', 0, [], null), armor: null, shield: null, utility: null },
      carriedGear: [], shield: 0, shieldNextRecharge: SHIELD_RECHARGE_TICKS,
      codex: [], hub: null, playerWreck: null, pendingWreck: null, deathRecorded: false,
      actions: 0, powerState: 'ok', // ok | low | starving (see notePlayerAction)
      quickslots: ['health', 'food', null, null, null, null],
      // Phase 3: run-scoped skill state. Mech skills + run skill
      // points die with the run (death AND extract); energy/heat
      // reset every run; pendingXp is banked at descend/extract and
      // lost on death. secondWindUsed resets every run; the cooldown
      // lives on the hub and ticks in newRun below.
      energy: ENERGY_MAX, heat: 0, overheated: false,
      mechEffects: { overclockShots: 0, evasiveUntil: -1, platingUntil: -1, salvageBurst: false },
      mechSkills: [], runSkillPoints: 0, pendingXp: 0,
      secondWindUsed: false, shotsFired: 0,
      // Phase 6: keys carried this floor (keyId strings). Floor-
      // scoped: cleared on descend, never banked, never in wrecks.
      keys: [],
    };
    // Phase 6 (§9.7.6): the spawn room starts explored.
    markExplored(state);
    if (hub) {
      attachHub(state, hub);
      // Phase 3: the Second Wind cooldown ticks once per new
      // expedition (runs, not time units).
      if (state.hub.secondWindCooldown > 0) state.hub.secondWindCooldown--;
      // Starting load: a capped amount of crafted stockpile is taken
      // into the run (health 2, food 2, repair kits 1). The rest stays
      // in the hub for later expeditions. A fresh hub has an empty
      // stockpile, so this is a no-op for existing saves.
      var sp = hub.stockpile;
      var takeHealth = Math.min(sp.health, STARTING_LOAD.health);
      var takeFood = Math.min(sp.food, STARTING_LOAD.food);
      var takeKit = Math.min(sp.repairKit, STARTING_LOAD.repairKit);
      sp.health -= takeHealth; sp.food -= takeFood; sp.repairKit -= takeKit;
      state.healthCells += takeHealth; state.foodCells += takeFood; state.repairKits += takeKit;
      // Phase 4: the ammo loadout. The allocated part is drawn from
      // the hub stockpile; the free Standard remainder is granted.
      var ld = computeLoadout(hub, loadout);
      state.ammoPools = ld.pools;
      state.selectedAmmo = 'standard';
      if (!ld.ok) logMsg(state, 'Loadout invalid (' + ld.reason + ') — starting with 16 Standard.');
      AMMO_TYPES.forEach(function (t) {
        var key = 'ammo' + t[0].toUpperCase() + t.slice(1);
        sp[key] -= ld.allocation[t];
      });
    } else {
      var ld0 = computeLoadout(null, loadout);
      state.ammoPools = ld0.pools;
      state.selectedAmmo = 'standard';
    }
    return state;
  }
  // Full inventory view for the Bag: every count the run carries,
  // plus the hub totals it sits on top of. No count lives anywhere
  // else — pickups write these fields, uses read them.
  function inventoryOf(state) {
    return {
      health: state.healthCells || 0, food: state.foodCells || 0,
      repairKit: state.repairKits || 0,
      // Phase 4: typed ammo pools + selected type. `ammo` is kept as
      // the total for any reader that still expects a single count.
      ammoPools: clampPools(state.ammoPools, RUN_AMMO_CAP),
      ammo: totalAmmo(state.ammoPools),
      selectedAmmo: isAmmoType(state.selectedAmmo) ? state.selectedAmmo : 'standard',
      // Phase 6: keys carried (keyId strings) for the Bag/HUD.
      keys: Array.isArray(state.keys) ? state.keys.slice() : [],
      weapon: normalizeWeaponInstance(state.weapon),
      // Phase 2: the equipped set (weapon mirrors state.weapon), the
      // carried gear list, the derived stats, and the shield pool —
      // everything the Bag's equipment section renders.
      equipment: {
        weapon: normalizeWeaponInstance(state.weapon),
        armor: equippedGear(state, 'armor'),
        shield: equippedGear(state, 'shield'),
        utility: equippedGear(state, 'utility'),
      },
      carriedGear: Array.isArray(state.carriedGear) ? state.carriedGear.map(normalizeItemInstance) : [],
      derived: derivedStats(state),
      shield: (typeof state.shield === 'number' ? state.shield : 0),
      salvage: state.carried || 0, components: state.components || 0,
      dataChips: state.dataChips || 0,
      banked: state.banked || 0,
      hubComponents: state.hub ? (state.hub.components || 0) : 0,
      hubStockpile: state.hub && state.hub.stockpile ? { health: state.hub.stockpile.health || 0, food: state.hub.stockpile.food || 0, repairKit: state.hub.stockpile.repairKit || 0,
        ammoStandard: state.hub.stockpile.ammoStandard || 0, ammoPiercing: state.hub.stockpile.ammoPiercing || 0,
        ammoIncendiary: state.hub.stockpile.ammoIncendiary || 0, ammoShock: state.hub.stockpile.ammoShock || 0,
        materials: clampMaterials(state.hub.materials) } : { health: 0, food: 0, repairKit: 0, ammoStandard: 0, ammoPiercing: 0, ammoIncendiary: 0, ammoShock: 0, materials: emptyMaterials() },
      chassisTier: state.hub ? (state.hub.chassisTier || 0) : 0,
      bankingTier: state.hub ? (state.hub.bankingTier || 0) : 0,
      bankingRate: state.hub ? bankingRateFor(state.hub) : 0.25,
      codex: state.codex ? state.codex.slice() : [],
    };
  }

  function logMsg(state, msg) { state.log.push(msg); if (state.log.length > 200) state.log.shift(); }

  function tileAt(state, x, y) {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return 'void';
    return state.floor.grid[y][x];
  }
  function enemyAt(state, x, y) {
    return state.floor.enemies.find(function (e) { return e.alive && e.x === x && e.y === y; });
  }
  function lineOfSight(state, x0, y0, x1, y1) {
    // Bresenham; walls block sight, everything else does not.
    // Phase 6 (§9.7.4): a closed/locked door cell on the line also
    // blocks sight (open doors do not). Only cells the line actually
    // intersects block, excluding the observer/target cells. Void
    // never blocks and diagonals cut corners (Phase 5 F12, kept).
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
    var x = x0, y = y0;
    while (!(x === x1 && y === y1)) {
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      if (x === x1 && y === y1) break;
      if (tileAt(state, x, y) === 'wall') return false;
      if (doorBlocksSight(state, x, y)) return false;
    }
    return true;
  }
  function rollDamage(rng, attacker) {
    // Dice branch (Phase 1, weapons only): an attacker carrying a dice
    // spec rolls it; scaling lives on attacker.dmgMult. Everything
    // else keeps the flat+var roll, unchanged.
    if (attacker.dice) return rollDamageDetailed(rng, attacker).total;
    return attacker.dmg + Math.floor(rng() * (attacker.dmgVar + 1));
  }
  // PD-style combat: attacker rolls 0..accuracy, defender rolls
  // 0..evasion, hit iff attacker's roll >= defender's. Surprise
  // attacks (unaware target) auto-hit at 1.5x damage after armor,
  // rounded, minimum 1. Armor is flat reduction after a hit.
  function resolveAttack(state, rng, attacker, defender, attackerName, defenderName, opts) {
    var surprise = !!(opts && opts.surprise);
    var hit, raw;
    // The player defender's armor is derived: base + equipped armor
    // gear (derivedStats recomputes it; nothing derived is stored).
    // Enemies keep their flat armor field. A shield, when equipped
    // and charged, absorbs damage after armor, before the hull.
    var effArmor = (state && state.player && defender === state.player)
      ? derivedStats(state).armor : (defender.armor || 0);
    function applyPlayerShield(dmg) {
      if (!(state && state.player && defender === state.player)) return { dmg: dmg, absorbed: 0 };
      var res = applyShield(state, dmg);
      return { dmg: res.remaining, absorbed: res.absorbed };
    }
    // Phase 3: Heavy Hands (pilot skill) scales the player's raw
    // damage through derivedStats; enemies keep their flat rolls.
    function scalePlayerDamage(raw) {
      if (state && state.player && attacker === state.player) {
        return Math.max(1, Math.round(raw * derivedStats(state).dmgMult));
      }
      return raw;
    }
    if (surprise) {
      hit = true;
      raw = scalePlayerDamage(rollDamage(rng, attacker));
      var dmg;
      if (defender.type === 'shielder' && attacker && typeof attacker.x === 'number' && isFrontalShieldHit(defender, attacker.x, attacker.y)) {
        // Phase 5 spec formula (§8.5.6): halving applies to the
        // post-modifier raw, before armor. The shipped surprise
        // shape (raw-armor)*1.5 is replaced for this case only —
        // flagged in beta-testers/PHASE5-REPORT.md.
        dmg = Math.max(1, Math.floor(Math.round(raw * 1.5) * 0.5) - effArmor);
      } else {
        dmg = Math.max(1, Math.round((raw - effArmor) * 1.5));
      }
      var sh = applyPlayerShield(dmg);
      defender.hp -= sh.dmg;
      logMsg(state, attackerName + ' surprise-attacks ' + defenderName + ' for ' + sh.dmg + '!' +
        (sh.absorbed ? ' (shield absorbed ' + sh.absorbed + ')' : ''));
      if (defender === state.player) checkSecondWind(state);
      return { hit: true, damage: sh.dmg, surprise: true, absorbed: sh.absorbed };
    }
    // Phase 3: Steady Aim (pilot skill) feeds the player's accuracy
    // through derivedStats; enemies keep their flat acc field.
    var attAcc = (state && state.player && attacker === state.player) ? derivedStats(state).acc : (attacker.acc || 0);
    var aRoll = rng() * attAcc;
    // The player defender's evasion is derived: base + the equipped
    // weapon's evasion property, if any (weaponStats recomputes it;
    // nothing derived is stored on the player object).
    var defEvasion = (state && state.player && defender === state.player)
      ? playerEvasion(state) : (defender.evasion || 0);
    var eRoll = rng() * defEvasion;
    if (aRoll < eRoll) {
      logMsg(state, attackerName + ' misses ' + defenderName + '.');
      return { hit: false, damage: 0 };
    }
    raw = scalePlayerDamage(rollDamage(rng, attacker));
    // Phase 5 shielder (§8.5.6): frontal weapon hits halve the raw
    // damage (after modifiers, before armor); rear/flank hits are
    // unaffected. Only direct attacks with a source position qualify
    // (attacker.x present); turret shots and melee both pass through
    // here with a positioned attacker.
    if (defender.type === 'shielder' && attacker && typeof attacker.x === 'number') {
      raw = shieldedRawDamage(defender, attacker.x, attacker.y, raw);
    }
    var dmg2 = Math.max(1, raw - effArmor);
    var sh2 = applyPlayerShield(dmg2);
    defender.hp -= sh2.dmg;
    logMsg(state, attackerName + ' hits ' + defenderName + ' for ' + sh2.dmg + ' (raw ' + raw + ', armor -' + effArmor + ')' +
      (sh2.absorbed ? ' (shield absorbed ' + sh2.absorbed + ')' : ''));
    if (defender === state.player) checkSecondWind(state);
    return { hit: true, damage: sh2.dmg, absorbed: sh2.absorbed };
  }

  // Pressure clock (PD hunger, adapted — see README for numbers).
  // Counts only successful player actions (moves, attacks, waits,
  // searches, item uses). At 80 actions: Low Power warning. At 120:
  // Starving Power. After 120, every 5 further actions drain 1 HP.
  // Phase 2: a Power cell (utility gear) pushes both thresholds out
  // by its bonus — derived, like everything else.
  function powerThresholds(state) {
    var bonus = derivedStats(state).powerBonus;
    return { warn: 80 + bonus, starve: 120 + bonus };
  }
  function notePlayerAction(state) {
    state.actions = (state.actions || 0) + 1;
    var th = powerThresholds(state);
    if (state.actions === th.warn && state.powerState === 'ok') {
      state.powerState = 'low';
      logMsg(state, 'Low Power! Find food soon, or power will start draining your hull.');
    } else if (state.actions === th.starve && state.powerState !== 'starving') {
      state.powerState = 'starving';
      logMsg(state, 'Starving Power! Your hull is draining — eat food now.');
    }
    if (state.actions > th.starve && (state.actions - th.starve) % 5 === 0 && state.state === 'playing') {
      state.player.hp -= 1;
      logMsg(state, 'Starving Power drains 1 HP (' + state.player.hp + '/' + derivedStats(state).maxHp + ').');
      if (state.player.hp <= 0 && !checkSecondWind(state)) {
        state.player.hp = 0; state.state = 'dead'; state.lostOnDeath = state.carried;
        logMsg(state, 'Your mech is destroyed by power starvation.');
        recordPlayerDeath(state);
      }
    }
  }
  function recomputePowerState(state) {
    var th = powerThresholds(state);
    if (state.actions < th.warn) state.powerState = 'ok';
    else if (state.actions < th.starve) state.powerState = 'low';
    else state.powerState = 'starving';
  }

  // Adjacent alive enemies, lowest HP first — AttackIndicator logic.
  function adjacentEnemies(state) {
    var p = state.player;
    return state.floor.enemies.filter(function (e) {
      return e.alive && Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) === 1;
    }).sort(function (a, b) { return a.hp - b.hp; });
  }

  // BFS path (8 directions) over walkable tiles, never through an
  // enemy tile or a wall. Returns a list of {dx,dy} steps, or null.
  function findPath(state, tx, ty) {
    var p = state.player;
    if (p.x === tx && p.y === ty) return [];
    var key = function (x, y) { return x + ',' + y; };
    var prev = {}; var q = [[p.x, p.y]]; prev[key(p.x, p.y)] = null;
    while (q.length) {
      var c = q.shift();
      if (c[0] === tx && c[1] === ty) break;
      DIRS.forEach(function (d) {
        var nx = c[0] + d.dx, ny = c[1] + d.dy, k = key(nx, ny);
        if (k in prev) return;
        var t = tileAt(state, nx, ny);
        if (!isWalkableTile(t)) return;
        // Phase 6: findPath is the PLAYER tap-to-move pathfinder, so
        // door cells stay traversable here — stepping onto a closed
        // door opens it via playerAction (1 unit, player stays) and
        // walkTo re-paths from the new position. Enemies never call
        // findPath: their step filters in enemyActInner and the
        // boss-drone BFS both block closed/locked doors directly.
        if (enemyAt(state, nx, ny)) return;
        prev[k] = c; q.push([nx, ny]);
      });
    }
    if (!(key(tx, ty) in prev)) return null;
    var steps = []; var cur = [tx, ty];
    while (prev[key(cur[0], cur[1])]) {
      var pr = prev[key(cur[0], cur[1])];
      steps.unshift({ dx: cur[0] - pr[0], dy: cur[1] - pr[1] });
      cur = pr;
    }
    return steps;
  }

  // Enemy visibility for walk auto-stop: within sight AND line of sight.
  function enemyVisible(state, en) {
    var p = state.player;
    var dist = Math.abs(en.x - p.x) + Math.abs(en.y - p.y);
    return en.alive && dist <= en.sight && lineOfSight(state, en.x, en.y, p.x, p.y);
  }

  // One enemy activation, through the shared AI framework.
  // Phase 5 wrapper: enemyActInner moves/acts; this wrapper applies
  // the on-movement consequences — spike entry damage, fuse arming,
  // and the shielder facing update — exactly once per move, after a
  // successful move, never for standing still.
  function enemyAct(state, rng, en) {
    var ox = en.x, oy = en.y;
    enemyActInner(state, rng, en);
    if (!en.alive || state.state !== 'playing') return;
    if (en.x === ox && en.y === oy) return;
    if (en.type === 'shielder') en.shieldFacing = nearestCardinal(en.x - ox, en.y - oy);
    if (tileAt(state, en.x, en.y) === 'hazard') {
      enemySpikeDamage(state, rng, en);
      if (!en.alive) return;
    }
    armBomberFuses(state);
  }
  // ---------- Phase 5 enemy behaviours (turret/sniper/bomber) ---------
  // Turret (§8.5.9): stationary; shoots on its activation when the
  // player is a valid target (range 8 Chebyshev + LOS) and the
  // cooldown has elapsed. No target, no cooldown consumed. A shot is
  // one resolveAttack; the player-death handling mirrors the melee
  // branch. The scheduler still advances nextTime per activation.
  function turretAct(state, rng, en) {
    var p = state.player;
    if (chebDist(en.x, en.y, p.x, p.y) > en.sight || !lineOfSight(state, en.x, en.y, p.x, p.y)) return;
    if (state.clock < (en.nextShotTime || 0)) return;
    en.nextShotTime = state.clock + en.interval;
    resolveAttack(state, rng, en, p, en.name, 'You');
    if (p.hp <= 0 && state.state === 'playing') {
      p.hp = 0; state.state = 'dead'; state.lostOnDeath = state.carried;
      logMsg(state, 'Your mech is destroyed. Banked salvage: ' + state.banked + '. Lost: ' + state.carried + '.');
      recordPlayerDeath(state);
    }
  }
  // Sniper (§8.5.7): aim-then-fire. Aim marks the player's CURRENT
  // tile (fixed — it does not track). The firing activation rechecks
  // range + LOS and fires only if the player still occupies the
  // marked tile; otherwise the shot misses the empty tile. Close
  // range (Chebyshev <= 3) with no aim: retreat to increase distance.
  // Returns true when the activation is consumed.
  function sniperAct(state, rng, en) {
    var p = state.player;
    if (en.telegraph) {
      var t = en.telegraph;
      en.telegraph = null;
      var ok = chebDist(en.x, en.y, p.x, p.y) <= en.sight && lineOfSight(state, en.x, en.y, p.x, p.y) && p.x === t.x && p.y === t.y;
      if (!ok) {
        logMsg(state, en.name + ' fires at (' + t.x + ', ' + t.y + ') — empty ground!');
        return true;
      }
      resolveAttack(state, rng, en, p, en.name, 'You');
      if (p.hp <= 0 && state.state === 'playing') {
        p.hp = 0; state.state = 'dead'; state.lostOnDeath = state.carried;
        logMsg(state, 'Your mech is destroyed. Banked salvage: ' + state.banked + '. Lost: ' + state.carried + '.');
        recordPlayerDeath(state);
      }
      return true;
    }
    if (chebDist(en.x, en.y, p.x, p.y) <= en.sight && lineOfSight(state, en.x, en.y, p.x, p.y)) {
      en.telegraph = { x: p.x, y: p.y };
      logMsg(state, en.name + ' takes aim at (' + p.x + ', ' + p.y + ')!');
      return true;
    }
    if (chebDist(en.x, en.y, p.x, p.y) <= 3) {
      var best = null, bestD = chebDist(en.x, en.y, p.x, p.y);
      DIRS.forEach(function (d) {
        var nx = en.x + d.dx, ny = en.y + d.dy;
        var t2 = tileAt(state, nx, ny);
        if (!isWalkableTile(t2) || t2 === 'hazard' || doorBlocksMovement(state, nx, ny) || enemyAt(state, nx, ny) || (nx === p.x && ny === p.y)) return;
        var nd = chebDist(nx, ny, p.x, p.y);
        if (nd > bestD) { bestD = nd; best = [nx, ny]; }
      });
      if (best) { en.x = best[0]; en.y = best[1]; }
      return true;
    }
    return false;
  }
  // Bomber (§8.5.8): an armed fuse detonates on the next activation
  // (jam-deferred: a jammed activation is consumed by the skip, so
  // the fuse waits). Detonation resolves through the queue, then the
  // bomber dies through the ordinary path exactly once.
  // Returns true when the activation is consumed.
  function bomberAct(state, rng, en) {
    if (!en.fuseArmed) return false;
    en.fuseArmed = false;
    startDetonation(state, rng, en);
    if (en.alive) killEnemy(state, rng, en);
    return true;
  }

  function enemyActInner(state, rng, en) {
    var p = state.player;
    if (!en.alive || state.state !== 'playing') return;
    // Phase 4 (§7.6.5): a jammed enemy skips exactly its next
    // scheduled activation — the whole activation, including waking.
    // The jam is consumed by the skip; reapplication does not queue
    // extra skips (the manager holds at most one jammed record).
    // Burning no longer ticks here: it ticks per elapsed time unit
    // in processScheduler, before activations (see tickStatuses).
    var jam = findStatus(en, 'jammed');
    if (jam) {
      var list = enemyStatuses(en);
      list.splice(list.indexOf(jam), 1);
      // Phase 5 sniper: a jammed aim is lost with its telegraph —
      // the enemy never fires a shot it did not aim this turn.
      if (en.type === 'sniper' && en.telegraph) {
        en.telegraph = null;
        logMsg(state, en.name + "'s aim is spoiled!");
      }
      logMsg(state, en.name + ' is jammed and skips its turn!');
      return;
    }
    // Phase 5 bomber (§8.5.8): an armed fuse detonates at the next
    // scheduled activation; jam is the only stated deferral, so the
    // fuse resolves before the wake branch — a sleeping bomber with
    // an armed fuse detonates instead of spending the activation
    // waking (status-like pending event, cf. §8.5.11 burning).
    if (en.type === 'bomber' && en.fuseArmed) {
      if (bomberAct(state, rng, en)) return;
    }
    if (!en.awake) {
      // Sleeping: wakes only when the player is in sight + LOS, and
      // waking spends this whole activation (no move, no attack).
      // Until then the enemy stays put — this is what makes a
      // surprise attack possible before its next activation.
      var d0 = Math.abs(en.x - p.x) + Math.abs(en.y - p.y);
      if (d0 <= en.sight && lineOfSight(state, en.x, en.y, p.x, p.y)) {
        en.awake = true;
        logMsg(state, en.name + ' wakes up!');
      }
      return;
    }
    var dist = Math.abs(en.x - p.x) + Math.abs(en.y - p.y);
    var adjacent = Math.max(Math.abs(en.x - p.x), Math.abs(en.y - p.y)) === 1;
    en.facing = dirIndexFor(Math.sign(p.x - en.x), Math.sign(p.y - en.y));
    // Phase 5 type dispatch: turrets, snipers, and bombers resolve
    // their special behaviour before the generic melee/pursue path.
    // A handler returning true consumed the activation.
    if (en.type === 'turret_light') { turretAct(state, rng, en); return; }
    if (en.type === 'sniper' && sniperAct(state, rng, en)) return;
    if (en.type === 'bomber' && bomberAct(state, rng, en)) return;
    if (adjacent) {
      resolveAttack(state, rng, en, p, en.name, 'You');
      if (p.hp <= 0) {
        p.hp = 0; state.state = 'dead'; state.lostOnDeath = state.carried;
        logMsg(state, 'Your mech is destroyed. Banked salvage: ' + state.banked + '. Lost: ' + state.carried + '.');
        recordPlayerDeath(state);
      }
      return;
    }
    var inSight = dist <= en.sight && lineOfSight(state, en.x, en.y, p.x, p.y);
    if (en.retreat && en.hp <= Math.ceil(en.maxHp * 0.3) && dist <= 6) {
      // Retreat: step away from the player.
      var best = null, bestD = dist;
      DIRS.forEach(function (d) {
        var nx = en.x + d.dx, ny = en.y + d.dy;
        if (!isWalkableTile(tileAt(state, nx, ny)) || doorBlocksMovement(state, nx, ny) || enemyAt(state, nx, ny) || (nx === p.x && ny === p.y)) return;
        var nd = Math.abs(nx - p.x) + Math.abs(ny - p.y);
        if (nd > bestD) { bestD = nd; best = [nx, ny]; }
      });
      if (best) { en.x = best[0]; en.y = best[1]; }
      return;
    }
    if (inSight) {
      // Pursue: greedy step that reduces Manhattan distance, avoiding
      // walls, hazards, other actors, and the player's cell.
      var best2 = null, bestD2 = dist;
      DIRS.forEach(function (d) {
        var nx = en.x + d.dx, ny = en.y + d.dy;
        var t = tileAt(state, nx, ny);
        // Phase 5: flyers cross spikes unharmed; ground types avoid
        // them here (the wrapper still damages a ground enemy that
        // steps onto one via retreat or a forced move).
        if (!isWalkableTile(t) || (t === 'hazard' && en.type !== 'flyer') || doorBlocksMovement(state, nx, ny) || enemyAt(state, nx, ny) || (nx === p.x && ny === p.y)) return;
        var nd = Math.abs(nx - p.x) + Math.abs(ny - p.y);
        if (nd < bestD2) { bestD2 = nd; best2 = [nx, ny]; }
      });
      if (best2) { en.x = best2[0]; en.y = best2[1]; }
      return;
    }
    // Idle/patrol: occasional random step, otherwise hold position.
    if (rng() < 0.3) {
      var d = DIRS[Math.floor(rng() * DIRS.length)];
      var nx = en.x + d.dx, ny = en.y + d.dy;
      var t = tileAt(state, nx, ny);
      if (isWalkableTile(t) && (t !== 'hazard' || en.type === 'flyer') && !doorBlocksMovement(state, nx, ny) && !enemyAt(state, nx, ny) && !(nx === p.x && ny === p.y)) {
        en.x = nx; en.y = ny;
      }
    }
  }

  // Central scheduler: after the player spends `costTicks`, every
  // actor whose nextTime has arrived acts, in nextTime order.
  // No per-enemy turn loops exist anywhere else.
  function processScheduler(state, rng, costTicks) {
    var startClock = state.clock;
    state.clock += costTicks;
    // Phase 2: the shield pool recharges with passing time.
    rechargeShield(state);
    if (state.state !== 'playing') return;
    // Phase 3: energy regenerates and heat dissipates with passing
    // time, one unit per player-action tick (PLAYER_DEF.interval).
    // Overheat clears once heat drops below the cool threshold.
    var units = Math.max(1, Math.round(costTicks / PLAYER_DEF.interval));
    if (typeof state.energy === 'number') state.energy = Math.min(ENERGY_MAX, state.energy + ENERGY_REGEN_PER_UNIT * units);
    if (typeof state.heat === 'number') state.heat = Math.max(0, state.heat - HEAT_DISSIPATE_PER_UNIT * units);
    if (state.overheated && state.heat < HEAT_COOL_BELOW) {
      state.overheated = false;
      logMsg(state, 'Systems cooled below ' + HEAT_COOL_BELOW + ' heat. Mech skills are online again.');
    }
    // Phase 4 (§7.6.5): time advances in whole units. For EACH unit,
    // status ticks run BEFORE that unit's enemy activations, and
    // only enemies due within the unit activate in it. A tick-killed
    // enemy never activates; dormant enemies still tick.
    var step = costTicks / units;
    var guard = 0;
    for (var u = 0; u < units; u++) {
      var unitClock = (u === units - 1) ? state.clock : startClock + step * (u + 1);
      var snapshot = state.floor.enemies.slice();
      for (var i = 0; i < snapshot.length; i++) {
        if (snapshot[i].alive) tickStatuses(state, rng, snapshot[i]);
      }
      if (state.state !== 'playing') break;
      while (guard++ < 10000) {
        var due = state.floor.enemies.filter(function (e) { return e.alive && e.nextTime <= unitClock; });
        if (!due.length || state.state !== 'playing') break;
        due.sort(function (a, b) { return a.nextTime - b.nextTime || (a.id < b.id ? -1 : 1); });
        var en = due[0];
        en.nextTime += en.interval;
        enemyAct(state, rng, en);
      }
    }
  }

  function afterPlayerStep(state, rng) {
    var p = state.player;
    // Player wreck recovery first: stepping on your own wreck
    // returns everything it held and clears it (hub and run).
    // Phase 2: the wreck's gear comes back intact, stowed in the
    // Bag's carried list for re-equipping (swapping stays Bag-only).
    if (state.playerWreck && state.playerWreck.x === p.x && state.playerWreck.y === p.y) {
      var w = state.playerWreck;
      // Phase 3: Deep Pockets adds +25% wreck salvage value per rank.
      var pocketBonus = Math.floor((w.salvage || 0) * 0.25 * pilotRank(state, 'deepPockets'));
      state.carried += w.salvage + pocketBonus; state.healthCells += w.health;
      state.foodCells += w.food; state.components += w.components;
      state.repairKits = (state.repairKits || 0) + (w.repairKit || 0);
      // Phase 4: wreck ammo recovers per typed pool, clamped to the
      // run cap with the excess discarded. Legacy wrecks carry a
      // single `ammo` count, which recovers as Standard.
      var wPools = w.ammoPools && typeof w.ammoPools === 'object' ? clampPools(w.ammoPools, RUN_AMMO_CAP)
        : (function () { var p = emptyAmmoPools(); p.standard = Math.max(0, Math.floor(w.ammo || 0)); return p; })();
      var discarded = 0;
      AMMO_TYPES.forEach(function (t) {
        var room = RUN_AMMO_CAP - (state.ammoPools[t] || 0);
        var gain = Math.min(room, wPools[t]);
        state.ammoPools[t] = (state.ammoPools[t] || 0) + gain;
        discarded += wPools[t] - gain;
      });
      if (discarded > 0) logMsg(state, 'Wreck ammo recovered; ' + discarded + ' rounds discarded (pool cap ' + RUN_AMMO_CAP + ').');
      var gearNames = [];
      var wreckGear = normalizeGearSet(w.gear);
      ['weapon', 'armor', 'shield', 'utility'].forEach(function (slot) {
        if (wreckGear[slot]) {
          if (!Array.isArray(state.carriedGear)) state.carriedGear = [];
          state.carriedGear.push(wreckGear[slot]);
          gearNames.push(itemDisplayName(wreckGear[slot]));
        }
      });
      state.playerWreck = null;
      if (state.hub) state.hub.wreck = null;
      logMsg(state, 'Wreck recovered! +' + w.salvage + ' salvage' + (pocketBonus ? ' (+' + pocketBonus + ' Deep Pockets)' : '') + ', ' + w.health + ' health cells, ' + w.food + ' food, ' + w.components + ' components' + (w.repairKit ? ', ' + w.repairKit + ' repair kits' : '') + (w.ammo ? ', +' + w.ammo + ' ammo' : '') + (gearNames.length ? ', gear: ' + gearNames.join(', ') + ' (stowed in the Bag)' : '') + '.');
    }
    // Pickups auto-collect on step, into the inventory fields.
    // Phase 2 (§5.3): a cell can hold several pickups at once (a kill
    // drops salvage AND an item on the same cell), so collect every
    // pickup on the cell, not just the first. Item pickups are
    // STOWED in the carried gear list — equipping is Bag-only now
    // (the Phase 1 equip-on-step + swap-back drop is superseded);
    // nothing is auto-equipped and nothing is destroyed.
    var guard = 0;
    while (guard++ < 12) {
      var idx = state.floor.pickups.findIndex(function (pk) {
        return pk.x === p.x && pk.y === p.y;
      });
      if (idx < 0) break;
      var pk = state.floor.pickups.splice(idx, 1)[0];
      if (pk.kind === 'health') {
        state.healthCells++;
        logMsg(state, 'Picked up a health cell (quickslot: ' + state.healthCells + ').');
      } else if (pk.kind === 'food') {
        state.foodCells++;
        logMsg(state, 'Picked up food (quickslot: ' + state.foodCells + '). Eat it to restore 40 actions of power.');
      } else if (pk.kind === 'component') {
        state.components++;
        logMsg(state, 'Picked up a salvage component (components: ' + state.components + ').');
      } else if (pk.kind === 'dataChip') {
        state.dataChips++;
        var isNew = state.codex.indexOf(pk.codex) === -1;
        addCodex(state, pk.codex);
        // Phase 3: data chips earn pilot XP (+5, +5 more for a new
        // Codex entry) and 1 run skill point.
        state.pendingXp = (state.pendingXp || 0) + PILOT_XP_PER_DATACHIP + (isNew ? PILOT_XP_NEW_CODEX : 0);
        state.runSkillPoints = (state.runSkillPoints || 0) + 1;
        logMsg(state, isNew ? 'Data chip recovered — Codex entry recorded: ' + pk.codex + '.' : 'Data chip recovered (already in the Codex).');
        logMsg(state, 'Pilot XP +' + (PILOT_XP_PER_DATACHIP + (isNew ? PILOT_XP_NEW_CODEX : 0)) + ' (pending, banks on descend/extract) · run skill point +1.');
        // Phase 3: Codex Eye reveals an extra rumor/clue per chip.
        if (pilotRank(state, 'codexEye') && state.hub) {
          var rs = rumors(state.hub);
          if (rs.length) logMsg(state, 'Codex Eye reveals: ' + rs[(pilotRank(state, 'codexEye') - 1) % rs.length]);
        }
      } else if (pk.kind === 'ammo') {
        // Phase 4 (§7.6.4): crates add Standard rounds, clamped to
        // the run cap; the excess is discarded with a log message.
        var before = state.ammoPools.standard || 0;
        var gain = Math.min(RUN_AMMO_CAP - before, pk.value || 0);
        state.ammoPools.standard = before + gain;
        var lost = (pk.value || 0) - gain;
        logMsg(state, 'Picked up an ammo crate (+' + gain + ' Standard ammo, total ' + state.ammoPools.standard + ')' + (lost > 0 ? ' — ' + lost + ' discarded (pool cap ' + RUN_AMMO_CAP + ')' : '') + '.');
      } else if (pk.kind === 'key') {
        // Phase 6 (§9.7.5): a key pickup carries keyId; it is never
        // consumed by a wrong lock, and a non-matching key is never
        // consumed at all (the bump refusal in playerAction keeps it).
        if (!Array.isArray(state.keys)) state.keys = [];
        if (state.keys.indexOf(pk.keyId) === -1) state.keys.push(pk.keyId);
        var keyDoorRec = null;
        state.floor.doors.forEach(function (d) { if (d.keyId === pk.keyId) keyDoorRec = d; });
        var keyLabel = 'a locked door';
        if (keyDoorRec) {
          var kr = state.floor.rooms[parseInt(keyDoorRec.roomId.split(':')[1], 10)];
          keyLabel = 'the ' + (kr && kr.purpose ? kr.purpose : keyDoorRec.roomId) + ' door (' + keyDoorRec.x + ', ' + keyDoorRec.y + ')';
        }
        logMsg(state, 'Key acquired: fits ' + keyLabel + '.');
      } else if (pk.kind === 'item') {
        var inst = normalizeItemInstance(pk);
        if (!Array.isArray(state.carriedGear)) state.carriedGear = [];
        state.carriedGear.push(inst);
        logMsg(state, 'Picked up ' + itemDisplayName(inst) + ' — stowed in the Bag. Equip it from the Bag (no time cost).');
      } else {
        state.carried += pk.value;
        if (pk.components) state.components += pk.components;
        logMsg(state, 'Salvaged +' + pk.value + ' scrap' + (pk.components ? ' and +' + pk.components + ' components' : '') + ' (carried: ' + state.carried + ').');
      }
    }
    // Spike trap: damage once on entry, then inert. A charged shield
    // absorbs before the hull, like any other damage.
    var hz = state.floor.hazards.find(function (h) { return h.x === p.x && h.y === p.y && !h.triggered; });
    if (hz) {
      hz.triggered = true;
      var trap = applyShield(state, 6);
      p.hp -= trap.remaining;
      logMsg(state, 'Spike trap! ' + (trap.absorbed ? 'Shield absorbs ' + trap.absorbed + ', you take ' + trap.remaining + ' damage.' : 'You take 6 damage.'));
      if (p.hp <= 0 && !checkSecondWind(state)) { p.hp = 0; state.state = 'dead'; state.lostOnDeath = state.carried; recordPlayerDeath(state); }
    }
    // Phase 6 (§9.7.6): every successful step updates exploration
    // (whole room, or the single corridor cell). Fog never affects
    // the scheduler; this is a render/sight record only.
    markExplored(state);
  }

  // ---------- Phase 5: boss drones, bomber detonation, spike damage ----
  // Boss Codex reconciliation (F item 2): no Codex registry exists —
  // entries are free-form strings in an array, granted via addCodex
  // (data chips use 'Depth N <theme> salvage signature'). The boss
  // entry follows that pattern and names no individual; the marker
  // substring is the once-per-profile gate (addCodex mirrors to the
  // hub, so the gate survives across runs).
  var BOSS_CODEX_MARKER = 'boss signature';
  function bossRewardRoll(rng, depth) {
    var tier = rng() < 0.5 ? 'epic' : 'legendary';
    if (rng() < 0.4) return rollGearItem(rng, depth, null, tier);
    return rollItem(rng, depth, null, tier);
  }
  // Runtime BFS from (sx, sy) over walkable tiles, 4 directions,
  // neighbour order N, E, S, W. Returns candidate cells in visit
  // order (start cell excluded). Traversal passes through walkable
  // tiles including hazards; SELECTION (in spawnBossDrones) excludes
  // hazards, occupied cells, and the player's cell.
  function bfsCellsFrom(state, sx, sy) {
    var key = function (x, y) { return x + ',' + y; };
    var prev = {}; var q = [[sx, sy]]; prev[key(sx, sy)] = null;
    var out = [];
    while (q.length) {
      var c = q.shift();
      if (!(c[0] === sx && c[1] === sy)) out.push({ x: c[0], y: c[1] });
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(function (d) {
        var nx = c[0] + d[0], ny = c[1] + d[1], k = key(nx, ny);
        if (k in prev) return;
        if (!isWalkableTile(tileAt(state, nx, ny))) return;
        if (doorBlocksMovement(state, nx, ny)) return;
        prev[k] = c; q.push([nx, ny]);
      });
    }
    return out;
  }
  // Half-HP drone spawn (§8.5.4): exactly two ordinary drones, once,
  // spawn-as-many-as-fit with a diagnostic. Drones use shipped Drone
  // stats, floor-depth scaling/rounding, and resistances; they wake
  // alerted (the boss just screamed).
  function spawnBossDrones(state, rng, boss) {
    if (boss.dronesSpawned) return 0;
    boss.dronesSpawned = true;
    var def = ENEMY_TYPES.drone;
    var depth = state.depth;
    var spawned = 0;
    var cells = bfsCellsFrom(state, boss.x, boss.y);
    for (var i = 0; i < cells.length && spawned < 2; i++) {
      var c = cells[i];
      if (tileAt(state, c.x, c.y) === 'hazard') continue;
      if (enemyAt(state, c.x, c.y)) continue;
      if (c.x === state.player.x && c.y === state.player.y) continue;
      var hp = Math.round(def.hp * (1 + 0.1 * (depth - 1)));
      state.floor.enemies.push({
        id: 'bd-' + boss.id + '-' + spawned, type: 'drone', name: def.name, x: c.x, y: c.y, facing: 0,
        hp: hp, maxHp: hp, dmg: def.dmg + Math.floor((depth - 1) / 2),
        dmgVar: def.dmgVar, armor: def.armor, acc: def.acc, evasion: def.evasion,
        interval: def.interval, nextTime: state.clock + def.interval,
        salvageMin: def.salvageMin, salvageMax: def.salvageMax,
        sight: def.sight, retreat: def.retreat, alive: true, awake: true,
        statuses: [],
      });
      spawned++;
    }
    if (spawned < 2) logMsg(state, 'The Boss tries to release drones, but only ' + spawned + ' find room!');
    else logMsg(state, 'The Boss releases two drones!');
    return spawned;
  }
  function maybeSpawnBossDrones(state, rng, foe) {
    if (!foe || foe.type !== 'boss' || !foe.alive || foe.hp <= 0) return;
    if (foe.dronesSpawned) return;
    if (foe.hp <= Math.floor(foe.maxHp / 2)) spawnBossDrones(state, rng, foe);
  }
  // Bomber detonation (§8.5.8): ONE shared damage roll per detonation
  // (Exchange 3 ruling), per-target hit/evasion rolls, per-target
  // armor. Shielder frontal arc does NOT apply. Chain detonations run
  // through startDetonation's queue; each bomber detonates at most
  // once (detonated flag set before the splash resolves).
  function detonateBomber(state, rng, foe) {
    if (foe.detonated) return;
    foe.detonated = true;
    foe.fuseArmed = false;
    var shared = rollDamage(rng, foe);
    logMsg(state, foe.name + ' detonates!');
    var targets = [];
    var p = state.player;
    if (chebDist(foe.x, foe.y, p.x, p.y) <= 1 && lineOfSight(state, foe.x, foe.y, p.x, p.y)) targets.push(p);
    state.floor.enemies.forEach(function (e) {
      if (e.alive && e !== foe && chebDist(foe.x, foe.y, e.x, e.y) <= 1 && lineOfSight(state, foe.x, foe.y, e.x, e.y)) targets.push(e);
    });
    targets.forEach(function (target) {
      var isPlayer = target === p;
      var defEvasion = isPlayer ? playerEvasion(state) : (target.evasion || 0);
      var aRoll = rng() * (foe.acc || 0);
      var eRoll = rng() * defEvasion;
      if (aRoll < eRoll) {
        logMsg(state, foe.name + "'s blast misses " + (isPlayer ? 'you' : target.name) + '.');
        return;
      }
      var effArmor = isPlayer ? derivedStats(state).armor : (target.armor || 0);
      var dmg = Math.max(1, shared - effArmor);
      if (isPlayer) {
        // applyShield returns {remaining, absorbed} (see
        // resolveAttack's applyPlayerShield wrapper).
        var sh = applyShield(state, dmg);
        target.hp -= sh.remaining;
        logMsg(state, foe.name + "'s blast hits you for " + sh.remaining + ' (shared ' + shared + ', armor -' + effArmor + ')' +
          (sh.absorbed ? ' (shield absorbed ' + sh.absorbed + ')' : ''));
        if (target.hp <= 0 && state.state === 'playing') checkSecondWind(state);
        if (target.hp <= 0 && state.state === 'playing') {
          target.hp = 0; state.state = 'dead'; state.lostOnDeath = state.carried;
          logMsg(state, 'Your mech is destroyed by the blast. Banked salvage: ' + state.banked + '. Lost: ' + state.carried + '.');
          recordPlayerDeath(state);
        }
      } else {
        target.hp -= dmg;
        target.awake = true;
        logMsg(state, foe.name + "'s blast hits " + target.name + ' for ' + dmg + ' (shared ' + shared + ', armor -' + effArmor + ').');
        if (target.hp <= 0) { killEnemy(state, rng, target); return; }
        maybeSpawnBossDrones(state, rng, target);
      }
    });
  }
  // Queue starter: chains process breadth-first; reentrant bomber
  // deaths during a splash enqueue instead of recursing.
  function startDetonation(state, rng, foe) {
    if (foe.detonated) return;
    if (state._detonating) { state._detonationQueue.push(foe); return; }
    state._detonating = true;
    state._detonationQueue = [foe];
    while (state._detonationQueue.length) {
      detonateBomber(state, rng, state._detonationQueue.shift());
    }
    state._detonating = false;
    state._detonationQueue = [];
  }
  // Fuse arming (§8.5.8): after a successful player or bomber move,
  // any living unarmed bomber at exactly Manhattan 1 arms at once.
  // Spike entry alone never arms — callers run this only on movement.
  function armBomberFuses(state) {
    var p = state.player;
    state.floor.enemies.forEach(function (en) {
      if (en.alive && en.type === 'bomber' && !en.fuseArmed && !en.detonated) {
        if (Math.abs(en.x - p.x) + Math.abs(en.y - p.y) === 1) {
          en.fuseArmed = true;
          logMsg(state, en.name + "'s fuse arms!");
        }
      }
    });
  }
  // Enemy spike damage (§8.5.5): flat 6 on entering a spike tile, no
  // armor/evasion (mirrors the player's 6 in afterPlayerStep, minus
  // the shield pool enemies do not have). Deaths use the ordinary
  // path exactly once; a spike-killed bomber detonates via killEnemy.
  function enemySpikeDamage(state, rng, foe) {
    if (!foe.alive || foe.type === 'flyer') return;
    foe.hp -= 6;
    foe.awake = true;
    logMsg(state, foe.name + ' triggers a spike trap for 6 damage!');
    if (foe.hp <= 0) { killEnemy(state, rng, foe); return; }
    maybeSpawnBossDrones(state, rng, foe);
  }

  // Shared kill handling for melee and ranged kills: wreck + salvage
  // pickup on the kill cell (merged with any salvage already there),
  // kill count, log. Kills do NOT auto-credit; the player walks over
  // the drop to collect it.
  function killEnemy(state, rng, foe) {
    if (!foe.alive) return;
    foe.alive = false;
    var def = ENEMY_TYPES[foe.type];
    var drop = randInt(rng, def.salvageMin, def.salvageMax);
    // Scavenger property: +2 salvage on kill drops while equipped.
    if (weaponHasProperty(state, 'salvage')) drop += 2;
    // Phase 3: Salvage Sense (+2/rank) and Salvage Burst (double).
    drop += pilotRank(state, 'salvageSense') * 2;
    if (state.mechEffects && state.mechEffects.salvageBurst) {
      drop *= 2;
      state.mechEffects.salvageBurst = false;
      logMsg(state, 'Salvage Burst doubles the drop!');
    }
    // Trio: integer componentDrop = count. Phase 5 new types:
    // fractional componentDrop = one roll for exactly one component.
    var comp = 0;
    if (typeof def.componentDrop === 'number') {
      comp = def.componentDrop < 1 ? (rng() < def.componentDrop ? 1 : 0) : def.componentDrop;
    }
    state.kills++;
    // Phase 3: kills earn pilot XP (pending until banked) and run
    // skill points — 1 per 3 kills, 2 per elite kill. No elite
    // enemy type exists yet (Phase 5), so the elite branch is
    // dormant; foe.elite is never set by generation today.
    state.pendingXp = (state.pendingXp || 0) + PILOT_XP_PER_KILL;
    if (state.kills % 3 === 0) {
      state.runSkillPoints = (state.runSkillPoints || 0) + 1;
      logMsg(state, 'Run skill point earned (' + state.runSkillPoints + ' total).');
    }
    if (foe.elite) {
      state.runSkillPoints = (state.runSkillPoints || 0) + 2;
      logMsg(state, 'Elite kill! +2 run skill points.');
    }
    state.wrecks.push({ x: foe.x, y: foe.y, type: foe.type });
    var existing = state.floor.pickups.find(function (pk) { return pk.x === foe.x && pk.y === foe.y && pk.kind === 'salvage'; });
    if (existing) { existing.value += drop; existing.components = (existing.components || 0) + comp; }
    else state.floor.pickups.push({ x: foe.x, y: foe.y, kind: 'salvage', value: drop, components: comp });
    logMsg(state, foe.name + ' destroyed! Wreck left behind. Salvage drop: +' + drop + (comp ? ' and +' + comp + ' components' : '') + ' — walk over it to collect.');
    // Phase 1 (§4.4) + Phase 2 (§5.1): kill item drops — raider
    // 12%, drone 10%, brute 30%. The item lands on the same cell as
    // the salvage; both are collected on step-over (afterPlayerStep
    // collects every pickup on the cell). One shared roll: gear or
    // weapon, never both, never a doubled rate. Elites/boss rates
    // are Phase 5.
    var dropChance = foe.type === 'raider' ? 0.12 : foe.type === 'drone' ? 0.10 : foe.type === 'brute' ? 0.30 : 0;
    if (dropChance > 0 && rng() < dropChance) {
      var inst = rollDropItem(rng, state.depth, 0.4);
      inst.x = foe.x; inst.y = foe.y; inst.kind = 'item';
      state.floor.pickups.push(inst);
      logMsg(state, 'An item drops: ' + itemDisplayName(inst) + ' — walk over it to stow it in the Bag.');
    }
    // Phase 5 boss reward (§8.5.4): exactly one Epic-or-Legendary
    // item (50/50 tier, 0.4 gear weight mirroring kill drops) plus
    // one Codex entry on first defeat — no boss name is invented;
    // the entry follows the dataChip pattern (F item 2).
    if (foe.type === 'boss') {
      var reward = bossRewardRoll(rng, state.depth);
      reward.x = foe.x; reward.y = foe.y; reward.kind = 'item';
      state.floor.pickups.push(reward);
      logMsg(state, 'The Boss drops a ' + TIERS[reward.tier].name + ' ' + (GEAR_DEFS[reward.defId] ? GEAR_DEFS[reward.defId].name : WEAPON_DEFS[reward.defId].name) + '!');
      var codex = state.codex || [];
      var already = codex.some(function (e) { return e.indexOf(BOSS_CODEX_MARKER) !== -1; });
      if (!already) {
        var entry = 'Depth ' + state.depth + ' ' + (state.floor.theme || 'unknown') + ' ' + BOSS_CODEX_MARKER;
        addCodex(state, entry);
        logMsg(state, 'Codex entry recorded: ' + entry + '.');
      }
    }
    // Phase 5: a dead bomber detonates exactly once, via the queue
    // (chains from other detonations enqueue, never recurse).
    if (foe.type === 'bomber') startDetonation(state, rng, foe);
    // Siphon property: heal 5 HP on a kill while equipped.
    if (weaponHasProperty(state, 'lifesteal') && state.player.hp < derivedStats(state).maxHp) {
      var healed = Math.min(5, derivedStats(state).maxHp - state.player.hp);
      state.player.hp += healed;
      logMsg(state, 'Siphon restores +' + healed + ' HP.');
    }
  }

  // Fire the equipped weapon along the player's facing. Patterns
  // (Phase 1, §4.5): standard (first enemy in line), burst (3 shots,
  // re-scanned per projectile), spread (4 projectiles, line
  // re-scanned each time), beam (every enemy in the line), splash
  // (lobbed over walls, AoE around the impact, diagonal splash
  // blocked when both orthogonal cells between are walls), cone
  // (3 cells widening from the facing), homing (ignores evasion),
  // rail gun (pierces armor), melee (adjacent cell only, no ammo).
  // Refusals (no target, no ammo) cost no time and spend no ammo.
  // A hit costs the def's timeCost in time units, reuses the PD
  // acc/evasion rolls with the weapon's dice, and never gets the
  // melee surprise bonus — but shots wake their targets. The log
  // shows the dice roll, e.g. "You hit Drone for 15 ([Common] Scrap
  // blaster +0: 2d6+6: 4+5+6, armor -0)".
  function fireWeapon(state, rng) {
    if (state.state !== 'playing') return { ok: false, reason: 'not playing' };
    var p = state.player;
    var stats = weaponStats(state);
    if (stats.pattern === 'deploy') return { ok: false, reason: 'combat drone not yet implemented' };
    // Phase 3: Trigger Discipline — every Nth shot (N = 5 - rank)
    // costs 1 less ammo. The discount is computed from the NEXT shot
    // number before the sufficiency check, but only committed when a
    // shot is actually fired; refusals spend nothing.
    var discN = 0;
    var discRank = pilotRank(state, 'triggerDiscipline');
    if (discRank) discN = 5 - discRank;
    var nextShotNo = (state.shotsFired || 0) + 1;
    var disciplined = discN > 0 && stats.ammoPerShot > 0 && nextShotNo % discN === 0;
    var ammoCost = disciplined ? stats.ammoPerShot - 1 : stats.ammoPerShot;
    // Phase 4 (§7.6.6): firing draws from the SELECTED typed pool.
    // A selected pool that cannot cover the shot switches to the next
    // pool (in cycle order) that can, with the spec's exact message,
    // WITHOUT firing, consuming ammo, or advancing time. All pools
    // unable to cover the shot = a "No ammunition" refusal.
    var ammoType = isAmmoType(state.selectedAmmo) ? state.selectedAmmo : 'standard';
    state.selectedAmmo = ammoType;
    if (!state.ammoPools || typeof state.ammoPools !== 'object') state.ammoPools = emptyAmmoPools();
    if (ammoCost > 0 && (state.ammoPools[ammoType] || 0) < ammoCost) {
      var startIdx = AMMO_TYPES.indexOf(ammoType);
      var switched = null;
      for (var k = 1; k <= AMMO_TYPES.length; k++) {
        var cand = AMMO_TYPES[(startIdx + k) % AMMO_TYPES.length];
        if ((state.ammoPools[cand] || 0) >= ammoCost) { switched = cand; break; }
      }
      if (switched) {
        state.selectedAmmo = switched;
        logMsg(state, 'Switched to ' + AMMO_TYPE_NAMES[switched] + ' — ' + AMMO_TYPE_NAMES[ammoType] + ' empty');
        return { ok: false, reason: 'switched', switched: true, from: ammoType, to: switched };
      }
      return { ok: false, reason: 'No ammunition' };
    }
    // Phase 3: Overclock — one activation's shots deal +25% damage
    // and consume one overclock shot. Read once per activation.
    var overclockActive = !!(state.mechEffects && state.mechEffects.overclockShots > 0);
    var dir = DIRS[p.facing] || DIRS[0];
    // Line scan: first enemy in the facing line within range. Walls
    // and the grid edge block the shot — unless arc (grenade), which
    // lobs over them. Returns {foe, x, y} or null.
    function scanLine(ignoreWalls) {
      var x = p.x, y = p.y;
      for (var step = 1; step <= stats.range; step++) {
        x += dir.dx; y += dir.dy;
        var t = tileAt(state, x, y);
        // Phase 6 (§9.7.4): a closed/locked door cell blocks a shot
        // exactly like a wall, except for arc shots, which lob over.
        // The target cell itself never blocks: a foe standing in a
        // doorway is hittable, a foe behind the door is not.
        var foe = enemyAt(state, x, y);
        if (foe) return { foe: foe, x: x, y: y };
        if (!ignoreWalls && (t === 'wall' || t === 'void' || doorBlocksSight(state, x, y))) break;
        if (t === 'void') break;
      }
      return null;
    }
    // One weapon shot against one target: acc/evasion roll, dice
    // damage scaled by tier/upgrade, crit property, armor (unless
    // pierced), burn application. Returns {hit, damage, crit}.
    function weaponShot(target, opts) {
      opts = opts || {};
      // Phase 3: Steady Aim feeds accuracy through derivedStats.
      var acc = derivedStats(state).acc + (stats.accBonus || 0);
      if (!opts.ignoreEvasion) {
        var aRoll = rng() * acc;
        var eRoll = rng() * (target.evasion || 0);
        if (aRoll < eRoll) {
          logMsg(state, 'You miss ' + target.name + ' (' + stats.displayName + ').');
          return { hit: false, damage: 0, crit: false };
        }
      }
      var roll = rollDamageDetailed(rng, { dice: stats.dice, dmgMult: stats.mult });
      var total = roll.total;
      if (overclockActive) total = Math.round(total * 1.25);
      var crit = false;
      if (stats.properties.indexOf('crit') !== -1 && rng() < 0.10) { total *= 2; crit = true; }
      // Phase 5 shielder (§8.5.6): frontal weapon hits halve the raw
      // damage after modifiers (overclock/crit) and before armor;
      // the player's position is the source position.
      var shieldHalved = false;
      if (target.type === 'shielder') {
        var shTotal = shieldedRawDamage(target, p.x, p.y, total);
        shieldHalved = shTotal < total;
        total = shTotal;
      }
      var armor = (opts.pierceArmor || stats.pierceArmor) ? 0 : (target.armor || 0);
      // Phase 4 (§7.6.3): Piercing ammo ignores half the target's
      // armor, rounded down on the ignored portion (4 -> 2, 1 -> 0
      // ignored). Full weapon pierce (rail gun) still ignores all.
      if (!(opts.pierceArmor || stats.pierceArmor) && ammoType === 'piercing') {
        armor = armor - Math.floor(armor / 2);
      }
      var dmg = Math.max(1, total - armor);
      target.hp -= dmg;
      if (!target.awake) { target.awake = true; woke = true; logMsg(state, target.name + ' wakes up!'); }
      logMsg(state, 'You hit ' + target.name + ' for ' + dmg + ' (' + stats.displayName + ': ' + roll.detail + (overclockActive ? ' Overclock x1.25' : '') + (crit ? ' CRIT' : '') + (shieldHalved ? ' (shield halved)' : '') + ', armor -' + armor + ').');
      // Phase 4 (§7.6.5): statuses apply on a confirmed hit, only
      // when the activation consumed ammo. Incendiary ammo and the
      // flamethrower's weapon burn share the one burning manager
      // (refresh, no stacking) — a single application, one log line.
      if (ammoCost > 0) {
        if (ammoType === 'incendiary') {
          applyBurning(state, target);
        } else if (stats.burn) {
          applyBurning(state, target);
        }
        if (ammoType === 'shock') {
          applyJammed(state, rng, target);
        }
      } else if (stats.burn) {
        applyBurning(state, target);
      }
      return { hit: true, damage: dmg, crit: crit };
    }
    var hits = []; // {x, y, damage} per target hit, for floats + return
    var killed = false, kills = 0, woke = false;
    function registerHit(target, shot) {
      if (shot.hit) {
        hits.push({ x: target.x, y: target.y, damage: shot.damage, name: target.name });
        if (target.hp <= 0 && target.alive) { killEnemy(state, rng, target); killed = true; kills++; }
        // Phase 5: non-lethal ranged hits crossing the boss half-HP
        // line release the drones.
        else if (target.type === 'boss') maybeSpawnBossDrones(state, rng, target);
      }
    }
    var fired = false;
    if (stats.pattern === 'melee') {
      var adj = enemyAt(state, p.x + dir.dx, p.y + dir.dy);
      if (!adj) return { ok: false, reason: 'no adjacent enemy' };
      fired = true;
      registerHit(adj, weaponShot(adj, {}));
    } else if (stats.pattern === 'beam') {
      var x = p.x, y = p.y, anyTarget = false;
      for (var step = 1; step <= stats.range; step++) {
        x += dir.dx; y += dir.dy;
        var t = tileAt(state, x, y);
        // Target cell never blocks (see scanLine above).
        var foe = enemyAt(state, x, y);
        if (foe) { anyTarget = true; fired = true; registerHit(foe, weaponShot(foe, {})); continue; }
        if (t === 'wall' || t === 'void' || doorBlocksSight(state, x, y)) break;
      }
      if (!anyTarget) return { ok: false, reason: 'no target in line of fire' };
    } else if (stats.pattern === 'cone') {
      // 3 cells: one step ahead, and the two cells one step further
      // out and one step sideways (the widening). Walls block via
      // line of sight from the player.
      var perp = { dx: dir.dy, dy: -dir.dx };
      var cells = [
        { x: p.x + dir.dx, y: p.y + dir.dy },
        { x: p.x + 2 * dir.dx + perp.dx, y: p.y + 2 * dir.dy + perp.dy },
        { x: p.x + 2 * dir.dx - perp.dx, y: p.y + 2 * dir.dy - perp.dy },
      ];
      var coneHit = false;
      cells.forEach(function (c) {
        if (!lineOfSight(state, p.x, p.y, c.x, c.y)) return;
        var foe = enemyAt(state, c.x, c.y);
        if (foe) { coneHit = true; fired = true; registerHit(foe, weaponShot(foe, {})); }
      });
      if (!coneHit) return { ok: false, reason: 'no target in the cone' };
    } else if (stats.pattern === 'splash') {
      var impact = scanLine(true); // arc: lobs over walls
      if (!impact) return { ok: false, reason: 'no target in line of fire' };
      fired = true;
      // Primary target takes the direct hit; every enemy in the 3x3
      // around the impact takes splash. Diagonal splash is blocked
      // when both orthogonal cells between impact and target are walls.
      state.floor.enemies.forEach(function (en) {
        if (!en.alive) return;
        var dx = en.x - impact.x, dy = en.y - impact.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 1) return;
        if (dx !== 0 && dy !== 0) {
          var o1 = tileAt(state, impact.x + dx, impact.y);
          var o2 = tileAt(state, impact.x, impact.y + dy);
          if (o1 === 'wall' && o2 === 'wall') return;
        }
        registerHit(en, weaponShot(en, {}));
      });
    } else {
      // standard / burst / spread / homing: one target acquisition
      // per projectile (burst and spread re-scan, so later shots can
      // hit the next enemy in line after the first dies).
      var shots = stats.pattern === 'burst' || stats.pattern === 'spread' ? stats.shots : 1;
      var anyTarget = false;
      for (var s = 0; s < shots; s++) {
        var found = scanLine(false);
        if (!found) break;
        anyTarget = true; fired = true;
        var opts = {};
        if (stats.pattern === 'homing') opts.ignoreEvasion = true;
        if (stats.pierceArmor) opts.pierceArmor = true;
        registerHit(found.foe, weaponShot(found.foe, opts));
        if (found.foe.hp <= 0) { /* next projectile re-scans the line */ }
      }
      if (!anyTarget) return { ok: false, reason: 'no target in line of fire' };
    }
    if (!fired) return { ok: false, reason: 'no target in line of fire' };
    // Phase 4: one activation deducts once from the selected pool,
    // covering every application in the activation (burst/spread/
    // splash/cone). A resisted Shock application still consumes the
    // round — there is no free retry.
    if (ammoCost > 0) state.ammoPools[ammoType] -= ammoCost;
    state.shotsFired = nextShotNo;
    if (disciplined) logMsg(state, 'Trigger Discipline: this shot cost 1 less ammo.');
    if (overclockActive && state.mechEffects) {
      state.mechEffects.overclockShots--;
      if (state.mechEffects.overclockShots <= 0) logMsg(state, 'Overclock fades.');
    }
    var totalDamage = hits.reduce(function (n, h) { return n + h.damage; }, 0);
    var first = hits[0];
    notePlayerAction(state);
    processScheduler(state, rng, stats.timeCost * PLAYER_DEF.interval);
    return { ok: true, hit: hits.length > 0, damage: totalDamage, killed: killed, kills: kills,
      target: first ? first.name : null, targetX: first ? first.x : null, targetY: first ? first.y : null,
      woke: woke, hits: hits, pattern: stats.pattern };
  }

  // Action pipeline: validate -> cost -> resolve -> advance clock ->
  // process eligible events -> update state.
  // Returns { ok, blocked, message, stairs }.
  function playerAction(state, rng, dx, dy) {
    if (state.state !== 'playing') return { ok: false, blocked: true, message: 'Not playing.' };
    var p = state.player;
    p.facing = dirIndexFor(dx, dy);
    var nx = p.x + dx, ny = p.y + dy;
    var t = tileAt(state, nx, ny);
    var foe = enemyAt(state, nx, ny);
    if (foe) {
      // Bump to attack. Cost 1 time unit (10 ticks). An unaware
      // (sleeping) foe takes a surprise attack and wakes.
      var surprise = !foe.awake;
      if (surprise) foe.awake = true;
      var res = resolveAttack(state, rng, p, foe, 'You', foe.name, surprise ? { surprise: true } : null);
      if (foe.hp <= 0) killEnemy(state, rng, foe);
      // Phase 5: a non-lethal hit that crosses the boss half-HP line
      // releases the drones (lethal hits never do).
      else maybeSpawnBossDrones(state, rng, foe);
      notePlayerAction(state);
      processScheduler(state, rng, PLAYER_DEF.interval);
      return { ok: true, attacked: true, damage: res.damage, surprise: !!res.surprise };
    }
    if (!isWalkableTile(t)) return { ok: false, blocked: true, message: 'Blocked by a wall.' };
    // Phase 6 (§9.7.4): doors. An open door is an ordinary step.
    // Bumping a closed door opens it: the player STAYS, exactly 1
    // time unit passes, the scheduler runs (enemies may act), and a
    // separate move is needed to enter. A locked door opens only
    // with its matching key (consumed); without the key the bump is
    // a refusal that costs nothing.
    var door = doorAt(state.floor, nx, ny);
    if (door && door.state !== 'open') {
      if (door.state === 'locked') {
        if (!state.keys || state.keys.indexOf(door.keyId) === -1) {
          return { ok: false, blocked: true, message: 'Locked. It needs a key, or force.' };
        }
        state.keys.splice(state.keys.indexOf(door.keyId), 1);
        logMsg(state, 'The key fits. The door opens.');
      }
      openDoorRecord(state, door);
      notePlayerAction(state);
      processScheduler(state, rng, PLAYER_DEF.interval);
      return { ok: true, opened: true, door: door };
    }
    // Move. Cost 1 time unit.
    p.x = nx; p.y = ny;
    afterPlayerStep(state, rng);
    notePlayerAction(state);
    if (state.state === 'dead') return { ok: true, moved: true };
    // Phase 5: a successful move arms any adjacent bomber fuse.
    armBomberFuses(state);
    if (t === 'stairs') {
      // Stepping on stairs freezes the world: the choice menu is
      // thinking, and thinking costs no time, so no scheduler run.
      state.state = 'stairs';
      logMsg(state, 'Stairs down. Descend (bank 25%), extract, or step back?');
      return { ok: true, moved: true, stairs: true };
    }
    processScheduler(state, rng, PLAYER_DEF.interval);
    return { ok: true, moved: true };
  }

  function playerWait(state, rng) {
    if (state.state !== 'playing') return { ok: false };
    logMsg(state, 'You wait.');
    notePlayerAction(state);
    processScheduler(state, rng, PLAYER_DEF.interval);
    return { ok: true };
  }

  // Search: reveals hidden traps within Chebyshev radius 4. Costs
  // 1 time unit, like any other action.
  function playerSearch(state, rng) {
    if (state.state !== 'playing') return { ok: false };
    var p = state.player; var found = 0;
    state.floor.hazards.forEach(function (h) {
      if (h.hidden && !h.revealed && !h.triggered &&
          Math.max(Math.abs(h.x - p.x), Math.abs(h.y - p.y)) <= 4) {
        h.revealed = true; found++;
      }
    });
    logMsg(state, found ? 'Search reveals ' + found + ' hidden trap' + (found > 1 ? 's.' : '.') : 'Search finds nothing nearby.');
    notePlayerAction(state);
    processScheduler(state, rng, PLAYER_DEF.interval);
    return { ok: true, found: found };
  }

  function descend(state, runSeed) {
    if (state.state !== 'stairs') return { ok: false };
    var rate = state.hub ? bankingRateFor(state.hub) : 0.25;
    var banked = Math.floor(state.carried * rate);
    // Phase 3: pilot XP banks in full on descend (+10 for
    // descending). Without a hub there is nowhere to bank, so the
    // pool keeps accumulating on the run.
    state.pendingXp = (state.pendingXp || 0) + PILOT_XP_PER_DESCEND;
    var xpBanked = state.pendingXp;
    if (state.hub) { state.hub.pilotXp = (state.hub.pilotXp || 0) + xpBanked; state.pendingXp = 0; }
    if (state.hub) state.hub.banked += banked;
    else state.banked += banked;
    state.carried -= banked; state.lastBankedAmount = banked;
    if (state.hub) state.banked = state.hub.banked;
    state.depth++;
    if (state.hub && state.depth > state.hub.deepestDepth) state.hub.deepestDepth = state.depth;
    state.floor = generateFloor(runSeed, state.depth);
    // New floor, same clock: anchor enemy timers to the current clock,
    // otherwise every enemy would be overdue and act many times at once.
    state.floor.enemies.forEach(function (en) { en.nextTime = state.clock + en.interval; });
    state.player.x = state.floor.spawn.x; state.player.y = state.floor.spawn.y; state.player.facing = 0;
    // Phase 6: keys are floor-scoped — the old floor's locks are
    // gone, so carried keys do not follow. The spawn room of the
    // new floor starts explored.
    state.keys = [];
    markExplored(state);
    state.wrecks = []; state.playerWreck = null; state.deathRecorded = false; state.state = 'playing';
    // A wreck waiting at this depth (from an earlier death) appears
    // on this floor. Descending past an unrecovered wreck on an
    // earlier floor does not destroy it — it stays in the hub and
    // will appear again on a later expedition at its depth, since
    // there is no way back up within a run.
    if (state.hub && state.hub.wreck && state.hub.wreck.depth === state.depth) {
      placeWreckOnFloor(state, state.hub.wreck);
    }
    logMsg(state, 'Descended to depth ' + state.depth + '. Banked ' + banked + ' salvage at ' + Math.round(rate * 100) + '% (banked total: ' + state.banked + ', carried: ' + state.carried + ').');
    if (state.hub) logMsg(state, 'Pilot XP banked: +' + xpBanked + ' (total ' + state.hub.pilotXp + ').');
    return { ok: true, banked: banked };
  }

  function extract(state) {
    if (state.state !== 'stairs') return { ok: false };
    if (state.hub && state.depth > state.hub.deepestDepth) state.hub.deepestDepth = state.depth;
    state.lastExtracted = state.carried;
    var keptComponents = state.components || 0;
    if (state.hub) {
      state.hub.banked += state.carried;
      state.hub.components += keptComponents;
      state.hub.lastExtracted = state.lastExtracted;
      // Phase 3: pending pilot XP banks in full on extract.
      state.hub.pilotXp = (state.hub.pilotXp || 0) + (state.pendingXp || 0);
      state.banked = state.hub.banked;
    } else {
      state.banked += state.carried;
    }
    state.pendingXp = 0;
    state.carried = 0; state.components = 0; state.state = 'extracted';
    // Phase 3: mech skills die with the run — extract included.
    // Nothing survives except banked salvage, Codex, and the wreck
    // (death only); the fresh run starts with empty mech state.
    state.mechSkills = []; state.runSkillPoints = 0;
    state.mechEffects = { overclockShots: 0, evasiveUntil: -1, platingUntil: -1, salvageBurst: false };
    state.overheated = false;
    logMsg(state, 'Extracted. All carried salvage secured. Banked total: ' + state.banked + '.');
    return { ok: true };
  }

  function cancelStairs(state, rng) {
    if (state.state !== 'stairs') return { ok: false };
    // The choice itself cost no time, but the step onto the stairs
    // did: pay it now, so cancelling is not a free move.
    state.state = 'playing';
    logMsg(state, 'You step back from the stairs.');
    if (rng) processScheduler(state, rng, PLAYER_DEF.interval);
    return { ok: true };
  }

  // Quickslot item: use a health cell. Costs one time unit (enemies
  // act), like any other action. Refused at full HP or with none held,
  // and a refusal costs no time.
  function useHealthCell(state, rng) {
    if (state.state !== 'playing') return { ok: false, reason: 'not playing' };
    if (!state.healthCells) return { ok: false, reason: 'no health cells' };
    var maxHp = derivedStats(state).maxHp;
    if (state.player.hp >= maxHp) return { ok: false, reason: 'already full HP' };
    state.healthCells--;
    var healed = Math.min(25, maxHp - state.player.hp);
    state.player.hp += healed;
    logMsg(state, 'Health cell used: +' + healed + ' HP (' + state.player.hp + '/' + maxHp + ').');
    notePlayerAction(state);
    processScheduler(state, rng, PLAYER_DEF.interval);
    if (state.state === 'dead') logMsg(state, 'You died while using the cell.');
    return { ok: true, healed: healed };
  }

  // Food: restores 40 actions of power (net 39 after the use itself
  // costs 1 action). Refused with none held.
  function useFood(state, rng) {
    if (state.state !== 'playing') return { ok: false, reason: 'not playing' };
    if (!state.foodCells) return { ok: false, reason: 'no food' };
    state.foodCells--;
    state.actions = Math.max(0, (state.actions || 0) - 40);
    recomputePowerState(state);
    logMsg(state, 'You eat. Power restored by 40 actions (actions used: ' + state.actions + ', power: ' + state.powerState + ').');
    notePlayerAction(state);
    processScheduler(state, rng, PLAYER_DEF.interval);
    return { ok: true };
  }

  // Repair kit: restores 50 HP (vs a health cell's 25), costs one
  // time unit, refused at full HP or with none held, refusal free.
  function useRepairKit(state, rng) {
    if (state.state !== 'playing') return { ok: false, reason: 'not playing' };
    if (!state.repairKits) return { ok: false, reason: 'no repair kits' };
    var maxHp = derivedStats(state).maxHp;
    if (state.player.hp >= maxHp) return { ok: false, reason: 'already full HP' };
    state.repairKits--;
    // Phase 3: Field Repair restores +10 HP per rank.
    var healed = Math.min(50 + 10 * pilotRank(state, 'fieldRepair'), maxHp - state.player.hp);
    state.player.hp += healed;
    logMsg(state, 'Repair kit used: +' + healed + ' HP (' + state.player.hp + '/' + maxHp + ').');
    notePlayerAction(state);
    processScheduler(state, rng, PLAYER_DEF.interval);
    if (state.state === 'dead') logMsg(state, 'You died while using the kit.');
    return { ok: true, healed: healed };
  }

  // ---------- Phase 3: mech skills (run store, LOOT-SKILLS-DESIGN.md §6.2-6.3) ----------
  // Learning spends run skill points and costs no time. Using a
  // skill goes through ONE executor: validate -> pay -> execute ->
  // apply -> events -> HUD. Every refusal is checked before any
  // mutation and costs no time, no energy, no heat.
  function mechSkillEnergyCost(state, skillId) {
    var def = MECH_SKILLS[skillId];
    if (!def) return 0;
    var rank = pilotRank(state, 'overclockTuning');
    var cost = Math.round(def.energy * (1 - 0.10 * rank));
    return Math.max(1, cost);
  }
  function learnMechSkill(state, skillId) {
    if (state.state !== 'playing' && state.state !== 'stairs') return { ok: false, reason: 'not playing' };
    var def = MECH_SKILLS[skillId];
    if (!def) return { ok: false, reason: 'Unknown mech skill: ' + skillId + '.' };
    if (!Array.isArray(state.mechSkills)) state.mechSkills = [];
    if (state.mechSkills.indexOf(skillId) !== -1) return { ok: false, reason: def.name + ' is already learned.' };
    if ((state.runSkillPoints || 0) < def.learnCost) return { ok: false, reason: 'Needs ' + def.learnCost + ' run skill points, have ' + (state.runSkillPoints || 0) + '.' };
    state.runSkillPoints -= def.learnCost;
    state.mechSkills.push(skillId);
    logMsg(state, 'Mech skill learned: ' + def.name + ' (' + def.desc + ')');
    return { ok: true, skill: skillId };
  }
  function useMechSkill(state, rng, skillId) {
    // Validate (nothing mutates before this block passes).
    if (state.state !== 'playing') return { ok: false, reason: 'not playing' };
    var def = MECH_SKILLS[skillId];
    if (!def) return { ok: false, reason: 'Unknown mech skill: ' + skillId + '.' };
    if (!Array.isArray(state.mechSkills) || state.mechSkills.indexOf(skillId) === -1) {
      return { ok: false, reason: def.name + ' is not learned — spend run skill points in the Bag first.' };
    }
    if (state.overheated) {
      return { ok: false, reason: 'Systems overheated — mech skills are locked until heat drops below ' + HEAT_COOL_BELOW + '.' };
    }
    var energyCost = mechSkillEnergyCost(state, skillId);
    if ((typeof state.energy === 'number' ? state.energy : ENERGY_MAX) < energyCost) {
      return { ok: false, reason: 'Not enough energy (' + energyCost + ' needed).' };
    }
    // Pay.
    state.energy = (typeof state.energy === 'number' ? state.energy : ENERGY_MAX) - energyCost;
    state.heat = Math.min(HEAT_MAX, (typeof state.heat === 'number' ? state.heat : 0) + def.heat);
    if (state.heat >= HEAT_OVERHEAT) {
      state.overheated = true;
      logMsg(state, 'OVERHEAT! Mech skills are locked until heat drops below ' + HEAT_COOL_BELOW + '.');
    }
    // Execute + apply.
    if (!state.mechEffects) state.mechEffects = { overclockShots: 0, evasiveUntil: -1, platingUntil: -1, salvageBurst: false };
    if (skillId === 'overclock') {
      state.mechEffects.overclockShots = 3;
    } else if (skillId === 'evasiveProtocols') {
      state.mechEffects.evasiveUntil = state.clock + 5 * PLAYER_DEF.interval;
    } else if (skillId === 'emergencyPlating') {
      state.mechEffects.platingUntil = state.clock + 5 * PLAYER_DEF.interval;
    } else if (skillId === 'sensorPulse') {
      // Reveal the current room, including hidden hazards. The room
      // is the generator room containing the player; in a corridor
      // (no room) the pulse falls back to the search radius.
      // Dormant: no hidden-hazard system exists yet — hazards are
      // revealed by search or by stepping on them, so the pulse
      // reveals every untriggered hazard in the room (the honest
      // nearest version of "including hidden traps").
      var room = null;
      state.floor.rooms.forEach(function (r) {
        if (state.player.x >= r.x && state.player.x < r.x + r.w && state.player.y >= r.y && state.player.y < r.y + r.h) room = r;
      });
      var revealed = 0;
      state.floor.hazards.forEach(function (h) {
        var inRoom = room && h.x >= room.x && h.x < room.x + room.w && h.y >= room.y && h.y < room.y + room.h;
        var near = !room && Math.max(Math.abs(h.x - state.player.x), Math.abs(h.y - state.player.y)) <= 4;
        if ((inRoom || near) && h.hidden && !h.triggered && !h.revealed) { h.revealed = true; revealed++; }
      });
      logMsg(state, 'Sensor Pulse: ' + (revealed ? revealed + ' trap' + (revealed > 1 ? 's' : '') + ' revealed in this room.' : 'no traps in this room.'));
    } else if (skillId === 'salvageBurst') {
      state.mechEffects.salvageBurst = true;
    } else if (skillId === 'ventHeat') {
      state.heat = 0;
      state.overheated = false;
    }
    logMsg(state, 'Mech skill used: ' + def.name + ' (-' + energyCost + ' energy, +' + def.heat + ' heat).');
    // Events: the use costs time like any other action.
    notePlayerAction(state);
    processScheduler(state, rng, def.timeCost * PLAYER_DEF.interval);
    if (state.state === 'dead') logMsg(state, 'You died while using the skill.');
    return { ok: true, skill: skillId, energyCost: energyCost, heat: def.heat };
  }

  function assignQuickslot(state, idx, type) {
    if (idx < 0 || idx >= 6) return { ok: false, reason: 'bad slot' };
    if (type !== null && type !== 'health' && type !== 'food' && type !== 'repairKit') return { ok: false, reason: 'unknown item type' };
    state.quickslots[idx] = type;
    return { ok: true };
  }
  function useQuickslot(state, rng, idx) {
    if (state.state !== 'playing') return { ok: false, reason: 'not playing' };
    var type = state.quickslots ? state.quickslots[idx] : null;
    if (!type) return { ok: false, reason: 'empty slot' };
    if (type === 'health') return useHealthCell(state, rng);
    if (type === 'food') return useFood(state, rng);
    if (type === 'repairKit') return useRepairKit(state, rng);
    return { ok: false, reason: 'unknown item type' };
  }

  // ---------- save / load: run state kept separate from hub state ----------
  // Two localStorage keys, both versioned: hub survives everything,
  // run is cleared on death/extract and replaced on New Expedition.
  // A storage-like object {getItem,setItem,removeItem} is accepted so
  // Node tests can pass a fake; the browser passes localStorage.
  var HUB_KEY = 'scrapdungeon.hub.v1';
  var RUN_KEY = 'scrapdungeon.run.v1';
  function serializeHub(hub) {
    var h = ensureHub(hub);
    return { banked: h.banked, components: h.components, codex: h.codex.slice(), wreck: h.wreck ? JSON.parse(JSON.stringify(h.wreck)) : null, lastExtracted: h.lastExtracted,
      chassisTier: h.chassisTier || 0, bankingTier: h.bankingTier || 0,
      stockpile: { health: h.stockpile.health || 0, food: h.stockpile.food || 0, repairKit: h.stockpile.repairKit || 0,
        ammoStandard: h.stockpile.ammoStandard || 0, ammoPiercing: h.stockpile.ammoPiercing || 0,
        ammoIncendiary: h.stockpile.ammoIncendiary || 0, ammoShock: h.stockpile.ammoShock || 0 },
      materials: clampMaterials(h.materials),
      migrationNotes: Array.isArray(h.migrationNotes) ? h.migrationNotes.slice() : [],
      deepestDepth: h.deepestDepth || 1,
      // Phase 3: pilot skills + pilot XP + Second Wind cooldown.
      skills: JSON.parse(JSON.stringify(h.skills || {})),
      pilotXp: h.pilotXp || 0, secondWindCooldown: h.secondWindCooldown || 0 };
  }
  function serializeRun(state) {
    // Plain-data snapshot only: the hub reference is stripped (it is
    // persisted separately), and everything else is JSON-safe.
    var copy = JSON.parse(JSON.stringify({
      runSeed: state.runSeed, depth: state.depth, floor: state.floor,
      player: state.player, clock: state.clock, carried: state.carried,
      state: state.state, log: state.log, wrecks: state.wrecks,
      kills: state.kills, lastBankedAmount: state.lastBankedAmount,
      lostOnDeath: state.lostOnDeath, lastExtracted: state.lastExtracted || 0,
      healthCells: state.healthCells, foodCells: state.foodCells, repairKits: state.repairKits || 0,
      components: state.components || 0, dataChips: state.dataChips || 0,
      ammoPools: clampPools(state.ammoPools, RUN_AMMO_CAP),
      selectedAmmo: isAmmoType(state.selectedAmmo) ? state.selectedAmmo : 'standard',
      weapon: state.weapon,
      // Phase 2: equipment (built from the authorities, never from
      // a possibly stale mirror), carried gear, shield pool + clock.
      equipment: {
        weapon: normalizeWeaponInstance(state.weapon),
        armor: equippedGear(state, 'armor'),
        shield: equippedGear(state, 'shield'),
        utility: equippedGear(state, 'utility'),
      },
      carriedGear: Array.isArray(state.carriedGear) ? state.carriedGear.map(normalizeItemInstance) : [],
      shield: (typeof state.shield === 'number' ? state.shield : 0),
      shieldNextRecharge: (typeof state.shieldNextRecharge === 'number' ? state.shieldNextRecharge : (state.clock || 0) + SHIELD_RECHARGE_TICKS),
      playerWreck: state.playerWreck || null,
      actions: state.actions || 0, powerState: state.powerState || 'ok',
      quickslots: state.quickslots || ['health', 'food', null, null, null, null],
      // Phase 3: energy/heat meters, mech skills + points, pending
      // pilot XP, Second Wind use flag, shot counter. derivedMods
      // is NOT persisted — it is recomputed by attachHub.
      energy: (typeof state.energy === 'number' ? state.energy : ENERGY_MAX),
      heat: (typeof state.heat === 'number' ? state.heat : 0),
      overheated: !!state.overheated,
      mechEffects: state.mechEffects ? JSON.parse(JSON.stringify(state.mechEffects)) : { overclockShots: 0, evasiveUntil: -1, platingUntil: -1, salvageBurst: false },
      mechSkills: Array.isArray(state.mechSkills) ? state.mechSkills.slice() : [],
      runSkillPoints: state.runSkillPoints || 0,
      pendingXp: state.pendingXp || 0,
      secondWindUsed: !!state.secondWindUsed,
      shotsFired: state.shotsFired || 0,
      // Phase 6: keys carried this floor (keyId strings). Doors and
      // exploration ride inside `floor` (plain JSON, deep-copied).
      keys: Array.isArray(state.keys) ? state.keys.slice() : [],
      // Phase 4: migration diagnostics (hub-side notes live in
      // serializeHub; run-side notes persist here).
      migrationNotes: Array.isArray(state.migrationNotes) ? state.migrationNotes.slice() : [],
    }));
    return copy;
  }
  function deserializeRun(obj) {
    if (!obj || typeof obj !== 'object' || !obj.floor || !obj.player) return null;
    var state = JSON.parse(JSON.stringify(obj));
    if (typeof state.healthCells !== 'number') state.healthCells = 0;
    if (typeof state.foodCells !== 'number') state.foodCells = 0;
    if (typeof state.repairKits !== 'number') state.repairKits = 0;
    if (typeof state.components !== 'number') state.components = 0;
    if (typeof state.dataChips !== 'number') state.dataChips = 0;
    // Phase 4 (§7.6.4): legacy single-pool `ammo` migrates to
    // ammoStandard, clamped to the 99 run cap, with a diagnostic.
    // Run ammo is migrated separately from hub ammo — never copied
    // into both. Idempotent: the legacy key is dropped, so a second
    // load finds typed pools and leaves them untouched.
    if (!state.ammoPools || typeof state.ammoPools !== 'object' || Array.isArray(state.ammoPools)) {
      var legacyAmmo = typeof state.ammo === 'number' ? Math.max(0, Math.floor(state.ammo)) : STARTING_AMMO;
      var clampedAmmo = Math.min(legacyAmmo, RUN_AMMO_CAP);
      state.ammoPools = emptyAmmoPools();
      state.ammoPools.standard = clampedAmmo;
      if (!Array.isArray(state.migrationNotes)) state.migrationNotes = [];
      if (typeof state.ammo === 'number') {
        state.migrationNotes.push('Legacy run ammo ' + legacyAmmo + ' migrated to ammoStandard ' + clampedAmmo + (legacyAmmo > RUN_AMMO_CAP ? ' (excess ' + (legacyAmmo - RUN_AMMO_CAP) + ' discarded, cap ' + RUN_AMMO_CAP + ')' : '') + '.');
      }
    } else {
      state.ammoPools = clampPools(state.ammoPools, RUN_AMMO_CAP);
    }
    delete state.ammo;
    if (!isAmmoType(state.selectedAmmo)) state.selectedAmmo = 'standard';
    if (!Array.isArray(state.migrationNotes)) state.migrationNotes = [];
    // Enemies always carry a statuses array; a legacy `burn` field
    // migrates to a burning status with its remaining ticks.
    // Phase 5: new enemy fields default when absent (old saves):
    // shielder shieldFacing 'N', turret nextShotTime 0, sniper
    // telegraph null, bomber fuse/detonated false, boss
    // dronesSpawned false. Status records keep `kind` (not `type`).
    if (state.floor && Array.isArray(state.floor.enemies)) {
      state.floor.enemies.forEach(function (en) {
        if (!Array.isArray(en.statuses)) en.statuses = [];
        if (en.burn && typeof en.burn.ticks === 'number' && en.burn.ticks > 0 && !findStatus(en, 'burning')) {
          en.statuses.push({ kind: 'burning', ticksLeft: Math.min(BURN_TICKS, Math.max(1, Math.floor(en.burn.ticks))) });
        }
        delete en.burn;
        if (en.type === 'shielder' && typeof en.shieldFacing !== 'string') en.shieldFacing = 'N';
        if (en.type === 'turret_light' && typeof en.nextShotTime !== 'number') en.nextShotTime = 0;
        if (en.type === 'sniper' && !('telegraph' in en)) en.telegraph = null;
        if (en.type === 'bomber') {
          if (typeof en.fuseArmed !== 'boolean') en.fuseArmed = false;
          if (typeof en.detonated !== 'boolean') en.detonated = false;
        }
        if (en.type === 'boss' && typeof en.dronesSpawned !== 'boolean') en.dronesSpawned = false;
      });
    }
    // Phase 6: keys default to an empty list; non-string entries
    // are dropped. A floor saved before Phase 6 has grid door cells
    // but no door records — migrate it (all doors open, all rooms
    // explored) instead of inventing locks.
    if (!Array.isArray(state.keys)) state.keys = [];
    state.keys = state.keys.filter(function (k) { return typeof k === 'string'; });
    if (state.floor) migrateFloorDoors(state.floor);
    // Phase 5: room purposes survive a save round-trip via plain
    // JSON; a floor saved before purposes existed keeps them
    // absent (boss placement then finds no security room — honest,
    // no invention).
    // Phase 1: weapon is an instance. Legacy saves carry the string
    // ('scrapBlaster') — map it to a Common +0 instance of the same
    // def. Missing/unknown shapes get the same default.
    state.weapon = normalizeWeaponInstance(state.weapon);
    // Phase 2: equipment + carried gear + shield pool. Legacy saves
    // (no equipment field) default to empty gear slots with the
    // Phase 1 weapon instance; the weapon mirror is rebuilt from
    // state.weapon so the two can never disagree after a load.
    var eq = (state.equipment && typeof state.equipment === 'object') ? state.equipment : null;
    state.equipment = {
      weapon: normalizeWeaponInstance(state.weapon),
      armor: eq ? equippedGear({ equipment: eq }, 'armor') : null,
      shield: eq ? equippedGear({ equipment: eq }, 'shield') : null,
      utility: eq ? equippedGear({ equipment: eq }, 'utility') : null,
    };
    state.carriedGear = Array.isArray(state.carriedGear) ? state.carriedGear.map(normalizeItemInstance) : [];
    if (typeof state.shield !== 'number' || state.shield < 0) state.shield = 0;
    if (typeof state.shieldNextRecharge !== 'number') state.shieldNextRecharge = (state.clock || 0) + SHIELD_RECHARGE_TICKS;
    if (state.shield > derivedStats(state).shieldCapacity) state.shield = derivedStats(state).shieldCapacity;
    if (!Array.isArray(state.wrecks)) state.wrecks = [];
    if (!Array.isArray(state.log)) state.log = [];
    if (!Array.isArray(state.quickslots)) state.quickslots = ['health', 'food', null, null, null, null];
    if (typeof state.actions !== 'number') state.actions = 0;
    if (!state.powerState) state.powerState = 'ok';
    // Phase 3: energy/heat meters + mech state. Legacy saves (no
    // Phase 3 fields) default to a fresh run's meters and empty
    // mech state; nothing is invented for them.
    if (typeof state.energy !== 'number') state.energy = ENERGY_MAX;
    if (typeof state.heat !== 'number') state.heat = 0;
    if (typeof state.overheated !== 'boolean') state.overheated = false;
    if (!state.mechEffects || typeof state.mechEffects !== 'object') state.mechEffects = { overclockShots: 0, evasiveUntil: -1, platingUntil: -1, salvageBurst: false };
    if (typeof state.mechEffects.overclockShots !== 'number') state.mechEffects.overclockShots = 0;
    if (typeof state.mechEffects.evasiveUntil !== 'number') state.mechEffects.evasiveUntil = -1;
    if (typeof state.mechEffects.platingUntil !== 'number') state.mechEffects.platingUntil = -1;
    if (typeof state.mechEffects.salvageBurst !== 'boolean') state.mechEffects.salvageBurst = false;
    if (!Array.isArray(state.mechSkills)) state.mechSkills = [];
    state.mechSkills = state.mechSkills.filter(function (id) { return !!MECH_SKILLS[id]; });
    if (typeof state.runSkillPoints !== 'number' || state.runSkillPoints < 0) state.runSkillPoints = 0;
    if (typeof state.pendingXp !== 'number' || state.pendingXp < 0) state.pendingXp = 0;
    if (typeof state.secondWindUsed !== 'boolean') state.secondWindUsed = false;
    if (typeof state.shotsFired !== 'number' || state.shotsFired < 0) state.shotsFired = 0;
    state.hub = null; state.codex = []; state.pendingWreck = null; state.deathRecorded = false;
    state.banked = 0; // overwritten by attachHub; never trust a saved banked total over the hub's
    return state;
  }
  function saveHub(storage, hub) {
    if (!storage) return false;
    try { storage.setItem(HUB_KEY, JSON.stringify(serializeHub(hub))); return true; } catch (e) { return false; }
  }
  function loadHub(storage) {
    if (!storage) return null;
    try {
      var raw = storage.getItem(HUB_KEY);
      if (!raw) return null;
      return ensureHub(JSON.parse(raw));
    } catch (e) { return null; }
  }
  function saveRun(storage, state) {
    if (!storage) return false;
    try { storage.setItem(RUN_KEY, JSON.stringify(serializeRun(state))); return true; } catch (e) { return false; }
  }
  function loadRun(storage) {
    if (!storage) return null;
    try {
      var raw = storage.getItem(RUN_KEY);
      if (!raw) return null;
      return deserializeRun(JSON.parse(raw));
    } catch (e) { return null; }
  }
  function clearRun(storage) {
    if (!storage) return false;
    try { storage.removeItem(RUN_KEY); return true; } catch (e) { return false; }
  }

  var api = {
    mulberry32: mulberry32, randInt: randInt, DIRS: DIRS, dirIndexFor: dirIndexFor,
    ENEMY_TYPES: ENEMY_TYPES, PLAYER_DEF: PLAYER_DEF, GRID_W: GRID_W, GRID_H: GRID_H,
    generateFloor: generateFloor, coherenceCheck: coherenceCheck, isWalkableTile: isWalkableTile,
    newRun: newRun, newHub: newHub, ensureHub: ensureHub, attachHub: attachHub,
    CHASSIS_TIER_COSTS: CHASSIS_TIER_COSTS, CHASSIS_HP_PER_TIER: CHASSIS_HP_PER_TIER, CHASSIS_MAX_TIER: CHASSIS_MAX_TIER,
    BANKING_TIERS: BANKING_TIERS, COMPONENT_TO_SALVAGE: COMPONENT_TO_SALVAGE, SALVAGE_PER_COMPONENT: SALVAGE_PER_COMPONENT,
    STARTING_LOAD: STARTING_LOAD, RECIPES: RECIPES,
    WEAPONS: WEAPONS, WEAPON_DEFS: WEAPON_DEFS, GEAR_DEFS: GEAR_DEFS,
    SHIELD_RECHARGE_TICKS: SHIELD_RECHARGE_TICKS, TIERS: TIERS, TIER_ORDER: TIER_ORDER,
    PROPERTIES: PROPERTIES, RARITY_WEIGHTS: RARITY_WEIGHTS, UPGRADE_WEIGHTS: UPGRADE_WEIGHTS,
    UPGRADE_DMG_PER_LEVEL: UPGRADE_DMG_PER_LEVEL, FLAIR_NAMES: FLAIR_NAMES,
    tierColor: tierColor, rollTier: rollTier, rollUpgrade: rollUpgrade,
    rollProperties: rollProperties, rollItem: rollItem, rollGearItem: rollGearItem,
    rollDropItem: rollDropItem, makeItemInstance: makeItemInstance,
    itemDefFor: itemDefFor, itemSlotOf: itemSlotOf, gearStatValue: gearStatValue,
    normalizeWeaponInstance: normalizeWeaponInstance, normalizeItemInstance: normalizeItemInstance,
    weaponStats: weaponStats, weaponDisplayName: weaponDisplayName, itemDisplayName: itemDisplayName,
    weaponHasProperty: weaponHasProperty, derivedStats: derivedStats,
    equippedGear: equippedGear, normalizeGearSet: normalizeGearSet,
    applyShield: applyShield, rechargeShield: rechargeShield,
    equipCarried: equipCarried, unequip: unequip, clampHpToMax: clampHpToMax,
    playerEvasion: playerEvasion, rollDiceDetailed: rollDiceDetailed,
    rollDamageDetailed: rollDamageDetailed, rollDamage: rollDamage,
    STARTING_AMMO: STARTING_AMMO, AMMO_CRATE_VALUE: AMMO_CRATE_VALUE,
    // Phase 4: typed ammo, materials, statuses, breakdown, Enhance.
    AMMO_TYPES: AMMO_TYPES, AMMO_TYPE_NAMES: AMMO_TYPE_NAMES, AMMO_TYPE_SHORT: AMMO_TYPE_SHORT,
    HUB_MATERIAL_CAP: HUB_MATERIAL_CAP, HUB_AMMO_CAP: HUB_AMMO_CAP, RUN_AMMO_CAP: RUN_AMMO_CAP,
    LOADOUT_TOTAL_CAP: LOADOUT_TOTAL_CAP, LOADOUT_TYPE_CAP: LOADOUT_TYPE_CAP,
    MATERIAL_KEYS: MATERIAL_KEYS, CORE_KEYS: CORE_KEYS, ELEMENT_VALUES: ELEMENT_VALUES,
    BREAKDOWN_YIELDS: BREAKDOWN_YIELDS, BURN_BASE_DMG: BURN_BASE_DMG, BURN_TICKS: BURN_TICKS,
    ENHANCE_MAX_UPGRADE: ENHANCE_MAX_UPGRADE, ENHANCE_WIRE_PER_LEVEL: ENHANCE_WIRE_PER_LEVEL,
    emptyAmmoPools: emptyAmmoPools, emptyMaterials: emptyMaterials, isAmmoType: isAmmoType,
    clampPools: clampPools, clampMaterials: clampMaterials, totalAmmo: totalAmmo,
    rollCore: rollCore, rollCores: rollCores, statusResist: statusResist, burnTickDamage: burnTickDamage,
    // Phase 5: biome rosters, boss placement, detonation/spike rules.
    themeNameForDepth: themeNameForDepth, rosterWeightsFor: rosterWeightsFor, pickRosterType: pickRosterType,
    chebDist: chebDist, nearestCardinal: nearestCardinal, isFrontalShieldHit: isFrontalShieldHit,
    shieldedRawDamage: shieldedRawDamage, placeBoss: placeBoss, relocateTurretFromSpike: relocateTurretFromSpike,
    spawnBossDrones: spawnBossDrones, maybeSpawnBossDrones: maybeSpawnBossDrones,
    detonateBomber: detonateBomber, startDetonation: startDetonation, armBomberFuses: armBomberFuses,
    enemySpikeDamage: enemySpikeDamage, bossRewardRoll: bossRewardRoll, BOSS_CODEX_MARKER: BOSS_CODEX_MARKER,
    enemyStatuses: enemyStatuses, findStatus: findStatus, applyBurning: applyBurning,
    applyJammed: applyJammed, tickStatuses: tickStatuses,
    selectAmmoType: selectAmmoType, cycleAmmoType: cycleAmmoType,
    computeLoadout: computeLoadout,
    breakDownComponent: breakDownComponent, breakDownGear: breakDownGear,
    enhanceCost: enhanceCost, enhanceItem: enhanceItem, validElement: validElement,
    // Phase 6: doors, visibility, locked rooms.
    forceDoor: forceDoor, attemptBypass: attemptBypass, openDoorRecord: openDoorRecord,
    wakeEnemiesNearDoor: wakeEnemiesNearDoor, doorAt: doorAt, doorIdFor: doorIdFor,
    roomIdFor: roomIdFor, roomIndexAt: roomIndexAt, classifyDoorCells: classifyDoorCells,
    doorBlocksSight: doorBlocksSight, doorBlocksMovement: doorBlocksMovement,
    markExplored: markExplored, ensureExplored: ensureExplored, migrateFloorDoors: migrateFloorDoors,
    BYPASS_REFUSAL: BYPASS_REFUSAL, LOCK_HP_PER_LEVEL: LOCK_HP_PER_LEVEL,
    DOOR_WAKE_RANGE: DOOR_WAKE_RANGE, FOG_DIM_ALPHA: FOG_DIM_ALPHA,
    GENERATION_VERSION: GENERATION_VERSION, RULESET_VERSION: RULESET_VERSION,
    RNG_ALGORITHM_VERSION: RNG_ALGORITHM_VERSION, TILE_CATALOG_VERSION: TILE_CATALOG_VERSION,
    GENERATION_MAX_ATTEMPTS: GENERATION_MAX_ATTEMPTS, generateFloorOnce: generateFloorOnce,
    // Phase 3: skill systems.
    PILOT_SKILLS: PILOT_SKILLS, PILOT_SKILL_TREES: PILOT_SKILL_TREES,
    MECH_SKILLS: MECH_SKILLS, RESPEC_COST_PER_RANK: RESPEC_COST_PER_RANK,
    ENERGY_MAX: ENERGY_MAX, ENERGY_REGEN_PER_UNIT: ENERGY_REGEN_PER_UNIT,
    HEAT_MAX: HEAT_MAX, HEAT_DISSIPATE_PER_UNIT: HEAT_DISSIPATE_PER_UNIT,
    HEAT_OVERHEAT: HEAT_OVERHEAT, HEAT_COOL_BELOW: HEAT_COOL_BELOW,
    PILOT_XP_PER_KILL: PILOT_XP_PER_KILL, PILOT_XP_PER_DATACHIP: PILOT_XP_PER_DATACHIP,
    PILOT_XP_NEW_CODEX: PILOT_XP_NEW_CODEX, PILOT_XP_PER_DESCEND: PILOT_XP_PER_DESCEND,
    pilotSkillRank: pilotSkillRank, pilotRank: pilotRank, totalPilotRanks: totalPilotRanks,
    computePilotMods: computePilotMods, refreshPilotMods: refreshPilotMods,
    buyPilotSkill: buyPilotSkill, respecPilotSkills: respecPilotSkills,
    pilotPhase4Unlock: pilotPhase4Unlock, checkSecondWind: checkSecondWind,
    mechSkillEnergyCost: mechSkillEnergyCost, learnMechSkill: learnMechSkill,
    useMechSkill: useMechSkill,
    bankingRateFor: bankingRateFor, buyChassisTier: buyChassisTier, buyBankingTier: buyBankingTier,
    convertComponentsToSalvage: convertComponentsToSalvage, convertSalvageToComponents: convertSalvageToComponents,
    craft: craft, scoutPreview: scoutPreview, rumors: rumors,
    inventoryOf: inventoryOf, addCodex: addCodex, recordPlayerDeath: recordPlayerDeath,
    placeWreckOnFloor: placeWreckOnFloor,
    playerAction: playerAction, playerWait: playerWait, playerSearch: playerSearch,
    fireWeapon: fireWeapon, killEnemy: killEnemy,
    useHealthCell: useHealthCell, useFood: useFood, useRepairKit: useRepairKit, assignQuickslot: assignQuickslot, useQuickslot: useQuickslot,
    adjacentEnemies: adjacentEnemies, findPath: findPath, enemyVisible: enemyVisible,
    descend: descend, extract: extract, cancelStairs: cancelStairs,
    processScheduler: processScheduler, enemyAct: enemyAct, lineOfSight: lineOfSight,
    resolveAttack: resolveAttack, logMsg: logMsg,
    HUB_KEY: HUB_KEY, RUN_KEY: RUN_KEY,
    serializeHub: serializeHub, serializeRun: serializeRun, deserializeRun: deserializeRun,
    saveHub: saveHub, loadHub: loadHub, saveRun: saveRun, loadRun: loadRun, clearRun: clearRun,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ScrapCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
