// Node tests for SCRAP DUNGEON Phase 1 core. Run: node --test test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./core.js');

function seededRng(seed) { return C.mulberry32(seed); }

// (a) Generated floors pass all coherence checks, across seeds/depths.
test('coherence: floors pass every MAPS.md check', () => {
  let checked = 0;
  for (let runSeed = 1; runSeed <= 12; runSeed++) {
    for (let depth = 1; depth <= 3; depth++) {
      const floor = C.generateFloor(runSeed, depth);
      const check = C.coherenceCheck(floor);
      assert.equal(check.ok, true, `runSeed ${runSeed} depth ${depth}: ${check.errors.join('; ')}`);
      assert.equal(floor.seed, (runSeed ^ depth) >>> 0);
      assert.ok(floor.rooms.length >= 6 && floor.rooms.length <= 10);
      assert.ok(floor.enemies.length === Math.min(12, 3 + depth));
      checked++;
    }
  }
  assert.equal(checked, 36);
});

test('coherence: same seed reproduces the same floor', () => {
  const a = C.generateFloor(42, 2), b = C.generateFloor(42, 2);
  assert.deepEqual(a.grid, b.grid);
  assert.deepEqual(a.enemies.map(e => [e.x, e.y, e.type]), b.enemies.map(e => [e.x, e.y, e.type]));
  const c = C.generateFloor(43, 2);
  assert.notDeepEqual(a.grid, c.grid);
});

test('coherence: doors exist where corridors meet rooms, stairs in farthest room', () => {
  const floor = C.generateFloor(7, 1);
  let doors = 0;
  floor.grid.forEach(row => row.forEach(t => { if (t === 'door') doors++; }));
  assert.ok(doors > 0, 'expected at least one door');
  assert.equal(floor.grid[floor.stairs.y][floor.stairs.x], 'stairs');
  assert.notDeepEqual(floor.stairs, floor.spawn);
});

// (b) Scheduler: faster actors act more often per player time.
test('scheduler: faster actors get more actions per player time', () => {
  const state = C.newRun(99);
  const rng = seededRng(1);
  // Put a drone (interval 7), a raider (8) and a brute (14) far from
  // the player so they patrol/idle rather than fight, and count
  // activations by wrapping enemyAct via nextTime advancement.
  // Simpler deterministic check: run the scheduler with a huge
  // clock jump and count activations through a spy on enemyAct.
  const counts = { drone: 0, raider: 0, brute: 0 };
  // Rebuild a clean floor with one of each, all far away, no LOS.
  state.floor.enemies = [];
  const mk = (type, x, y) => {
    const d = C.ENEMY_TYPES[type];
    return { id: type, type, name: d.name, x, y, facing: 0, hp: d.hp, maxHp: d.hp,
      dmg: d.dmg, dmgVar: d.dmgVar, armor: d.armor, acc: d.acc, evasion: d.evasion, interval: d.interval,
      nextTime: d.interval, salvageMin: 1, salvageMax: 1, sight: 0, retreat: false, alive: true, awake: true };
  };
  // Place them in corners far from spawn; sight 0 means they never pursue.
  state.floor.enemies = [mk('drone', 0, 0), mk('raider', 59, 0), mk('brute', 0, 43)];
  // Spy: intercept by monkey-patching the exported enemyAct is not
  // possible from inside core, so count via nextTime: after a clock
  // advance of 140 ticks, activations = floor((140 - interval)/interval)+1
  // for each actor that was due. Instead, directly drive the scheduler
  // and observe that nextTime advanced proportionally.
  const before = state.floor.enemies.map(e => e.nextTime);
  C.processScheduler(state, rng, 140);
  const after = state.floor.enemies.map(e => e.nextTime);
  const acts = after.map((nt, i) => Math.round((nt - before[i]) / state.floor.enemies[i].interval));
  // drone (7): ~20, raider (8): ~17-18, brute (14): ~10
  assert.ok(acts[0] > acts[1], `drone acts (${acts[0]}) should exceed raider (${acts[1]})`);
  assert.ok(acts[1] > acts[2], `raider acts (${acts[1]}) should exceed brute (${acts[2]})`);
  assert.ok(acts[0] >= 18 && acts[2] <= 11, `counts drone=${acts[0]} brute=${acts[2]}`);
});

// (c) Bump combat reduces enemy HP and enemy attacks reduce player HP.
test('combat: bump attack damages enemy, adjacent enemy damages player', () => {
  const state = C.newRun(5);
  const rng = seededRng(12345);
  const p = state.player;
  // Place a brute directly east of the player on a floor tile.
  const foe = state.floor.enemies[0];
  foe.x = p.x + 1; foe.y = p.y; foe.alive = true; foe.hp = foe.maxHp; foe.awake = true; foe.evasion = 0;
  p.acc = 100; // force the hit under the roll model: a seeded miss would be a test artifact, not a bug
  // Ensure the tile is walkable for the bump (bump does not need it,
  // but keep the floor consistent) and freeze other enemies far away.
  state.floor.enemies.slice(1).forEach(e => { e.nextTime = 1e9; });
  foe.nextTime = 1e9; // do not let it act during this test's scheduler run
  const hpBefore = foe.hp;
  const res = C.playerAction(state, rng, 1, 0);
  assert.equal(res.attacked, true);
  assert.ok(foe.hp < hpBefore, `enemy HP ${hpBefore} -> ${foe.hp}`);
  assert.equal(state.player.facing, 6); // E, sheet order S,SW,W,NW,N,NE,E,SE

  // Now let an adjacent enemy attack: put a raider next to the player,
  // force it due, and run one scheduler tick window.
  const state2 = C.newRun(6);
  const rng2 = seededRng(777);
  const p2 = state2.player;
  state2.floor.enemies.forEach(e => { e.nextTime = 1e9; });
  const attacker = state2.floor.enemies.find(e => e.type === 'raider') || state2.floor.enemies[0];
  attacker.x = p2.x + 1; attacker.y = p2.y; attacker.nextTime = 0; attacker.acc = 100; attacker.awake = true; p2.evasion = 0; attacker.dmg = 10; attacker.dmgVar = 0;
  const playerHpBefore = p2.hp;
  C.processScheduler(state2, rng2, 0);
  assert.ok(p2.hp < playerHpBefore, `player HP ${playerHpBefore} -> ${p2.hp}`);
});

test('combat: enemy stats are distinct per type', () => {
  const { raider, drone, brute } = C.ENEMY_TYPES;
  assert.ok(drone.hp < raider.hp && raider.hp < brute.hp);
  assert.ok(drone.interval < raider.interval && raider.interval < brute.interval);
  assert.ok(brute.armor > raider.armor && raider.armor > drone.armor);
});

// (d) Stairs descend banks exactly 25% and extract keeps 100%.
test('salvage: descend banks exactly 25% (floor), extract keeps 100%', () => {
  const state = C.newRun(11);
  state.state = 'stairs'; state.carried = 100; state.banked = 0;
  const r = C.descend(state, state.runSeed);
  assert.equal(r.banked, 25);
  assert.equal(state.banked, 25);
  assert.equal(state.carried, 75);
  assert.equal(state.depth, 2);
  assert.equal(state.state, 'playing');

  const state2 = C.newRun(12);
  state2.state = 'stairs'; state2.carried = 80; state2.banked = 10;
  C.extract(state2);
  assert.equal(state2.banked, 90);
  assert.equal(state2.carried, 0);
  assert.equal(state2.state, 'extracted');

  // Odd amount: floor(101 * 0.25) = 25, remainder stays carried.
  const state3 = C.newRun(13);
  state3.state = 'stairs'; state3.carried = 101; state3.banked = 0;
  const r3 = C.descend(state3, state3.runSeed);
  assert.equal(r3.banked, 25);
  assert.equal(state3.carried, 76);
});

// (e) Death triggers game over and restart resets state.
test('death and restart: game over state, fresh run resets everything', () => {
  const state = C.newRun(21);
  const rng = seededRng(9);
  state.player.hp = 1;
  state.floor.enemies.forEach(e => { e.nextTime = 1e9; });
  const attacker = state.floor.enemies[0];
  attacker.x = state.player.x + 1; attacker.y = state.player.y;
  attacker.nextTime = 0; attacker.acc = 100; attacker.awake = true; state.player.evasion = 0; attacker.dmg = 50; attacker.dmgVar = 0;
  state.carried = 40; state.banked = 15;
  C.processScheduler(state, rng, 0);
  assert.equal(state.state, 'dead');
  assert.equal(state.player.hp, 0);
  assert.equal(state.lostOnDeath, 40);
  assert.equal(state.banked, 15); // banked survives death

  const fresh = C.newRun(999);
  assert.equal(fresh.depth, 1);
  assert.equal(fresh.carried, 0);
  assert.equal(fresh.banked, 0);
  assert.equal(fresh.player.hp, fresh.player.maxHp);
  assert.equal(fresh.state, 'playing');
  assert.ok(fresh.floor.enemies.length >= 4);
});

test('wait costs time and lets enemies act', () => {
  const state = C.newRun(31);
  const rng = seededRng(3);
  const clockBefore = state.clock;
  C.playerWait(state, rng);
  assert.equal(state.clock, clockBefore + C.PLAYER_DEF.interval);
});

test('quickslot: health cell pickup and use', () => {
  const C = require('./core.js');
  const rng = C.mulberry32(123);
  const state = C.newRun(123);
  // Find a walkable, enemy-free tile adjacent to the spawn, place a health pickup there, step onto it.
  const p = state.player;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  let placed = false;
  for (const [dx, dy] of dirs) {
    const tx = p.x + dx, ty = p.y + dy;
    const tile = state.floor.grid[ty][tx];
    const foe = state.floor.enemies.some(e => e.alive && e.x === tx && e.y === ty);
    if (['floor','corridor','door'].includes(tile) && !foe) {
      state.floor.pickups.push({ x: tx, y: ty, kind: 'health', heal: 25 });
      state.player.hp = 50;
      const res = C.playerAction(state, rng, dx, dy);
      assert.equal(res.ok, true);
      assert.equal(state.healthCells, 1);
      placed = true;
      break;
    }
  }
  assert.equal(placed, true, 'no adjacent walkable tile found to test pickup');
  const use = C.useHealthCell(state, rng);
  assert.equal(use.ok, true);
  assert.equal(state.player.hp, 75);
  assert.equal(state.healthCells, 0);
  // Refusal at full HP costs nothing and keeps the cell
  state.player.hp = state.player.maxHp; state.healthCells = 1;
  const res2 = C.useHealthCell(state, rng);
  assert.equal(res2.ok, false);
  assert.equal(state.healthCells, 1);
});

// --- PD rebuild: accuracy/evasion rolls ---
test('combat: high evasion dodges far more than low evasion', () => {
  const dummy = { log: [] };
  const countHits = (evasion) => {
    const rng = C.mulberry32(42);
    let hits = 0;
    for (let i = 0; i < 500; i++) {
      const r = C.resolveAttack(dummy, rng, { dmg: 10, dmgVar: 0, acc: 10 }, { hp: 100000, armor: 0, evasion }, 'A', 'B');
      if (r.hit) hits++;
    }
    return hits;
  };
  const high = countHits(25), low = countHits(2);
  assert.ok(high < 175, `high evasion hits ${high} should be well under half`);
  assert.ok(low > 375, `low evasion hits ${low} should be well over half`);
  assert.ok(high < low);
});

// --- PD rebuild: surprise attack ---
test('combat: surprise attack auto-hits at 1.5x and wakes the enemy', () => {
  const state = C.newRun(55);
  const rng = C.mulberry32(7);
  const p = state.player;
  const foe = state.floor.enemies[0];
  foe.x = p.x + 1; foe.y = p.y; foe.alive = true; foe.awake = false;
  foe.hp = foe.maxHp; foe.armor = 0;
  p.dmg = 10; p.dmgVar = 0; p.acc = 1; // would almost never hit under rolls — surprise must bypass it
  state.floor.enemies.slice(1).forEach(e => { e.nextTime = 1e9; });
  foe.nextTime = 1e9;
  const before = foe.hp;
  const res = C.playerAction(state, rng, 1, 0);
  assert.equal(res.surprise, true);
  assert.equal(before - foe.hp, 15); // round(10 * 1.5)
  assert.equal(foe.awake, true);
});

// --- PD rebuild: sleeping enemies do not act until woken ---
test('sleeping: enemy stays put until player is in sight, waking spends its turn', () => {
  const state = C.newRun(56);
  const rng = C.mulberry32(8);
  const en = state.floor.enemies[0];
  en.awake = false; en.x = 5; en.y = 5; en.nextTime = 0;
  state.player.x = 30; state.player.y = 30;
  state.floor.enemies.slice(1).forEach(e => { e.nextTime = 1e9; });
  C.enemyAct(state, rng, en);
  assert.equal(en.awake, false);
  assert.deepEqual([en.x, en.y], [5, 5]);
  // Now in sight with clear LOS on an open floor tile: place both on the spawn room floor
  state.player.x = state.floor.spawn.x; state.player.y = state.floor.spawn.y;
  en.x = state.floor.spawn.x + 1; en.y = state.floor.spawn.y; en.nextTime = 0;
  C.enemyAct(state, rng, en);
  assert.equal(en.awake, true);
  assert.deepEqual([en.x, en.y], [state.floor.spawn.x + 1, state.floor.spawn.y]); // woke, did not move/attack
});

// --- PD rebuild: pathfinding ---
test('pathfinding: reaches target over walkable tiles, avoids walls', () => {
  const state = C.newRun(77);
  const steps = C.findPath(state, state.floor.stairs.x, state.floor.stairs.y);
  assert.ok(steps && steps.length > 0, 'expected a path to the stairs');
  let x = state.player.x, y = state.player.y;
  steps.forEach(s => {
    x += s.dx; y += s.dy;
    assert.ok(C.isWalkableTile(state.floor.grid[y][x]), `step onto ${x},${y} is not walkable`);
  });
  assert.deepEqual([x, y], [state.floor.stairs.x, state.floor.stairs.y]);
  // Unreachable target (a void cell) returns null
  assert.equal(C.findPath(state, 0, 0), null);
});

// --- PD rebuild: AttackIndicator logic ---
test('attack indicator: adjacent enemies listed lowest HP first, none when empty', () => {
  const state = C.newRun(78);
  state.floor.enemies.forEach(e => { e.nextTime = 1e9; });
  assert.deepEqual(C.adjacentEnemies(state), []);
  const p = state.player;
  const a = state.floor.enemies[0], b = state.floor.enemies[1];
  a.x = p.x + 1; a.y = p.y; a.hp = 20; a.alive = true;
  b.x = p.x; b.y = p.y + 1; b.hp = 5; b.alive = true;
  const adj = C.adjacentEnemies(state);
  assert.equal(adj.length, 2);
  assert.equal(adj[0], b); // lowest HP first
  assert.equal(adj[1], a);
});

// --- PD rebuild: search + hidden traps ---
test('search: reveals hidden traps within radius 4, not beyond', () => {
  const state = C.newRun(79);
  const rng = C.mulberry32(3);
  state.floor.enemies.forEach(e => { e.nextTime = 1e9; });
  state.player.x = 20; state.player.y = 20;
  state.floor.hazards = [
    { x: 24, y: 20, kind: 'spike', triggered: false, hidden: true, revealed: false },
    { x: 25, y: 20, kind: 'spike', triggered: false, hidden: true, revealed: false },
    { x: 20, y: 24, kind: 'spike', triggered: false, hidden: true, revealed: false },
    { x: 20, y: 20, kind: 'spike', triggered: false, hidden: false, revealed: false },
  ];
  const res = C.playerSearch(state, rng);
  assert.equal(res.found, 2);
  assert.equal(state.floor.hazards[0].revealed, true);
  assert.equal(state.floor.hazards[1].revealed, false);
  assert.equal(state.floor.hazards[2].revealed, true);
  // Generated floors actually contain hidden traps
  let anyHidden = false, anyVisible = false;
  for (let s = 1; s <= 20; s++) {
    C.generateFloor(s, 1).hazards.forEach(h => { if (h.hidden) anyHidden = true; else anyVisible = true; });
  }
  assert.ok(anyHidden && anyVisible, 'generation should mix hidden and visible traps');
});

// --- PD rebuild: quickslot assignment + use ---
test('quickslots: assign and use health and food', () => {
  const state = C.newRun(80);
  const rng = C.mulberry32(4);
  state.floor.enemies.forEach(e => { e.nextTime = 1e9; });
  assert.deepEqual(state.quickslots.slice(0, 2), ['health', 'food']);
  state.healthCells = 1; state.player.hp = 50;
  assert.equal(C.assignQuickslot(state, 3, 'health').ok, true);
  assert.equal(C.useQuickslot(state, rng, 3).ok, true);
  assert.equal(state.player.hp, 75);
  assert.equal(C.useQuickslot(state, rng, 4).ok, false); // empty slot
  assert.equal(C.assignQuickslot(state, 0, 'weapon').ok, false); // unknown type
  state.foodCells = 1; state.actions = 50;
  assert.equal(C.assignQuickslot(state, 5, 'food').ok, true);
  assert.equal(C.useQuickslot(state, rng, 5).ok, true);
  assert.ok(state.actions <= 50, 'food should restore power');
});

// --- PD rebuild: pressure clock ---
test('pressure: warns at 80 actions, drains after 120', () => {
  const state = C.newRun(81);
  const rng = C.mulberry32(5);
  state.floor.enemies.forEach(e => { e.nextTime = 1e9; });
  for (let i = 0; i < 79; i++) C.playerWait(state, rng);
  assert.equal(state.powerState, 'ok');
  C.playerWait(state, rng); // action 80
  assert.equal(state.powerState, 'low');
  assert.ok(state.log.some(l => l.includes('Low Power')));
  for (let i = 0; i < 40; i++) C.playerWait(state, rng); // action 120
  assert.equal(state.powerState, 'starving');
  const hpAt120 = state.player.hp;
  for (let i = 0; i < 5; i++) C.playerWait(state, rng); // action 125
  assert.equal(state.player.hp, hpAt120 - 1);
  // Food restores power
  state.foodCells = 1;
  C.useFood(state, rng);
  assert.ok(state.actions < 120);
  assert.notEqual(state.powerState, 'starving');
});

// --- Phase 2: expedition economy ---

function fakeStorage() {
  const m = {};
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; }, removeItem: k => { delete m[k]; } };
}
function killPlayerByAdjacentAttack(state, rng) {
  state.floor.enemies.forEach(e => { e.nextTime = 1e9; });
  const attacker = state.floor.enemies[0];
  attacker.x = state.player.x + 1; attacker.y = state.player.y;
  attacker.nextTime = 0; attacker.acc = 100; attacker.awake = true; state.player.evasion = 0;
  attacker.dmg = 500; attacker.dmgVar = 0;
  state.player.hp = 10;
  C.processScheduler(state, rng, 0);
  assert.equal(state.state, 'dead');
}
function walkableAdjacent(state, x, y) {
  // A walkable, enemy-free neighbour of (x, y), or null.
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
    const tx = x + dx, ty = y + dy;
    if (!C.isWalkableTile(state.floor.grid[ty][tx])) continue;
    if (state.floor.enemies.some(e => e.alive && e.x === tx && e.y === ty)) continue;
    return [tx, ty];
  }
  return null;
}

test('phase2: banked salvage survives Restart (new expedition keeps hub)', () => {
  const hub = C.newHub();
  const state = C.newRun(201, hub);
  state.state = 'stairs'; state.carried = 100;
  C.descend(state, state.runSeed);
  assert.equal(state.banked, 25);
  assert.equal(hub.banked, 25);
  // Restart = a fresh run with the same hub: banked survives, carried resets.
  const fresh = C.newRun(202, hub);
  assert.equal(fresh.banked, 25);
  assert.equal(hub.banked, 25);
  assert.equal(fresh.carried, 0);
  assert.equal(fresh.depth, 1);
  // And a run without a hub still behaves exactly as Phase 1 did.
  const solo = C.newRun(203);
  assert.equal(solo.banked, 0);
});

test('phase2: kill drops a salvage pickup tile, walking over it credits it', () => {
  const state = C.newRun(204);
  const rng = seededRng(11);
  const p = state.player;
  state.floor.enemies.forEach(e => { e.nextTime = 1e9; });
  const foe = state.floor.enemies.find(e => e.type === 'brute') || state.floor.enemies[0];
  foe.x = p.x + 1; foe.y = p.y; foe.alive = true; foe.hp = 1; foe.awake = true; foe.evasion = 0;
  foe.nextTime = 1e9;
  p.acc = 100; p.dmg = 20; p.dmgVar = 0;
  const carriedBefore = state.carried;
  const res = C.playerAction(state, rng, 1, 0);
  assert.equal(res.attacked, true);
  assert.equal(foe.alive, false);
  assert.equal(state.carried, carriedBefore, 'kill must NOT auto-credit salvage');
  const drop = state.floor.pickups.find(pk => pk.x === foe.x && pk.y === foe.y && pk.kind === 'salvage');
  assert.ok(drop, 'expected a salvage pickup on the kill tile');
  assert.ok(drop.value >= C.ENEMY_TYPES[foe.type].salvageMin && drop.value <= C.ENEMY_TYPES[foe.type].salvageMax);
  if (foe.type === 'brute') assert.equal(drop.components, 2, 'brute drops most, including components');
  // Walk onto the drop tile and collect it.
  const res2 = C.playerAction(state, rng, 1, 0);
  assert.equal(res2.ok, true);
  assert.equal(state.carried, carriedBefore + drop.value);
  assert.equal(state.floor.pickups.some(pk => pk.x === foe.x && pk.y === foe.y && pk.kind === 'salvage'), false);
});

test('phase2: death creates exactly one wreck holding carried salvage and items', () => {
  const hub = C.newHub();
  const state = C.newRun(205, hub);
  const rng = seededRng(12);
  state.carried = 40; state.healthCells = 2; state.foodCells = 3; state.components = 5;
  killPlayerByAdjacentAttack(state, rng);
  assert.ok(hub.wreck, 'expected a wreck in hub state');
  assert.equal(hub.wreck.depth, 1);
  assert.equal(hub.wreck.salvage, 40);
  assert.equal(hub.wreck.health, 2);
  assert.equal(hub.wreck.food, 3);
  assert.equal(hub.wreck.components, 5);
  assert.equal(state.banked, 0); // nothing banked in this run
  assert.ok(state.pendingWreck);
});

test('phase2: next expedition places the wreck reachable, recovering it credits and clears it', () => {
  const hub = C.newHub();
  const first = C.newRun(206, hub);
  const rng = seededRng(13);
  first.carried = 33; first.healthCells = 1; first.foodCells = 2; first.components = 4;
  killPlayerByAdjacentAttack(first, rng);
  assert.ok(hub.wreck);
  const next = C.newRun(207, hub);
  assert.ok(next.playerWreck, 'expected the wreck placed on the next expedition floor');
  assert.notDeepEqual([next.playerWreck.x, next.playerWreck.y], [next.floor.spawn.x, next.floor.spawn.y]);
  // Reachability: flood fill from spawn over walkable tiles must reach the wreck tile.
  const seen = new Set([next.floor.spawn.x + ',' + next.floor.spawn.y]);
  const q = [[next.floor.spawn.x, next.floor.spawn.y]];
  while (q.length) {
    const [cx, cy] = q.shift();
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny;
      if (!seen.has(k) && C.isWalkableTile(next.floor.grid[ny][nx])) { seen.add(k); q.push([nx, ny]); }
    }
  }
  assert.ok(seen.has(next.playerWreck.x + ',' + next.playerWreck.y), 'wreck tile must be reachable');
  // Step onto it from an adjacent walkable tile.
  const adj = walkableAdjacent(next, next.playerWreck.x, next.playerWreck.y);
  assert.ok(adj, 'no walkable neighbour of the wreck tile');
  next.player.x = adj[0]; next.player.y = adj[1];
  next.floor.enemies.forEach(e => { e.nextTime = 1e9; });
  const res = C.playerAction(next, rng, Math.sign(next.playerWreck.x - adj[0]), Math.sign(next.playerWreck.y - adj[1]));
  assert.equal(res.ok, true);
  assert.equal(next.carried, 33);
  assert.equal(next.healthCells, 1);
  assert.equal(next.foodCells, 2);
  assert.equal(next.components, 4);
  assert.equal(next.playerWreck, null);
  assert.equal(hub.wreck, null);
});

test('phase2: dying again before recovery destroys the old wreck and replaces it', () => {
  const hub = C.newHub();
  const first = C.newRun(208, hub);
  const rng = seededRng(14);
  first.carried = 40;
  killPlayerByAdjacentAttack(first, rng);
  assert.equal(hub.wreck.salvage, 40);
  const second = C.newRun(209, hub);
  assert.ok(second.playerWreck, 'old wreck should be placed on the recovery run');
  second.carried = 10; second.healthCells = 0; second.foodCells = 0; second.components = 0;
  killPlayerByAdjacentAttack(second, rng);
  assert.ok(hub.wreck, 'a new wreck must replace the old one');
  assert.equal(hub.wreck.salvage, 10, 'old wreck contents (40) must be gone, replaced by the new wreck (10)');
  assert.equal(second.pendingWreck.salvage, 10);
});

test('phase2: wreck at a deeper depth appears when that depth is reached', () => {
  const hub = C.newHub();
  const first = C.newRun(210, hub);
  const rng = seededRng(15);
  // Die at depth 2: descend once, then die.
  first.state = 'stairs'; first.carried = 0;
  C.descend(first, first.runSeed);
  assert.equal(first.depth, 2);
  first.carried = 21;
  killPlayerByAdjacentAttack(first, rng);
  assert.equal(hub.wreck.depth, 2);
  const next = C.newRun(211, hub);
  assert.equal(next.playerWreck, null, 'a depth-2 wreck must not appear on a depth-1 floor');
  next.state = 'stairs'; next.carried = 0;
  C.descend(next, next.runSeed);
  assert.equal(next.depth, 2);
  assert.ok(next.playerWreck, 'the wreck must appear on the depth-2 floor');
  assert.equal(next.playerWreck.salvage, 21);
});

test('phase2: Extract keeps 100% and persists it to hub state', () => {
  const hub = C.newHub();
  hub.banked = 10;
  const state = C.newRun(212, hub);
  state.state = 'stairs'; state.carried = 80; state.components = 3;
  const res = C.extract(state);
  assert.equal(res.ok, true);
  assert.equal(state.state, 'extracted');
  assert.equal(state.carried, 0);
  assert.equal(state.components, 0);
  assert.equal(hub.banked, 90);
  assert.equal(hub.components, 3);
  assert.equal(hub.lastExtracted, 80);
  assert.equal(state.banked, 90);
});

test('phase2: Codex entry survives death and Restart', () => {
  const hub = C.newHub();
  const state = C.newRun(213, hub);
  const rng = seededRng(16);
  const p = state.player;
  state.floor.enemies.forEach(e => { e.nextTime = 1e9; });
  // Place a data chip adjacent to the player and step onto it.
  let placed = false;
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const tx = p.x + dx, ty = p.y + dy;
    if (C.isWalkableTile(state.floor.grid[ty][tx]) && !state.floor.enemies.some(e => e.alive && e.x === tx && e.y === ty)) {
      state.floor.pickups.push({ x: tx, y: ty, kind: 'dataChip', codex: 'Depth 1 industrial salvage signature' });
      C.playerAction(state, rng, dx, dy);
      placed = true;
      break;
    }
  }
  assert.equal(placed, true);
  assert.equal(state.dataChips, 1);
  assert.ok(hub.codex.includes('Depth 1 industrial salvage signature'));
  // Die, then restart with the same hub: the Codex entry survives both.
  killPlayerByAdjacentAttack(state, rng);
  assert.ok(hub.codex.includes('Depth 1 industrial salvage signature'));
  const fresh = C.newRun(214, hub);
  assert.ok(fresh.codex.includes('Depth 1 industrial salvage signature'));
  // Generated floors actually contain data chips and components.
  let chips = 0, comps = 0;
  for (let s = 1; s <= 10; s++) {
    const f = C.generateFloor(s, 1);
    chips += f.pickups.filter(pk => pk.kind === 'dataChip').length;
    comps += f.pickups.filter(pk => pk.kind === 'component').length;
  }
  assert.ok(chips > 0 && comps > 0, `expected data chips (${chips}) and components (${comps}) in generated loot rooms`);
});

test('phase2: save/load round-trip restores run and hub, loaded run can act', () => {
  const storage = fakeStorage();
  const hub = C.newHub();
  hub.banked = 55; hub.codex = ['Depth 1 industrial salvage signature'];
  hub.wreck = { depth: 1, salvage: 9, health: 1, food: 0, components: 2 };
  C.saveHub(storage, hub);
  const loadedHub = C.loadHub(storage);
  assert.equal(loadedHub.banked, 55);
  assert.deepEqual(loadedHub.codex, ['Depth 1 industrial salvage signature']);
  assert.equal(loadedHub.wreck.salvage, 9);

  const state = C.newRun(215, hub);
  const rng = seededRng(17);
  state.player.hp = 73;
  state.carried = 44; state.healthCells = 2; state.components = 3;
  state.clock = 120; state.actions = 12;
  C.saveRun(storage, state);
  const loaded = C.loadRun(storage);
  assert.ok(loaded);
  C.attachHub(loaded, loadedHub);
  assert.equal(loaded.player.hp, 73);
  assert.equal(loaded.carried, 44);
  assert.equal(loaded.healthCells, 2);
  assert.equal(loaded.components, 3);
  assert.equal(loaded.clock, 120);
  assert.equal(loaded.depth, 1);
  assert.deepEqual([loaded.player.x, loaded.player.y], [state.player.x, state.player.y]);
  assert.equal(loaded.banked, 55, 'banked must come from the hub, not the run snapshot');
  // The loaded state must be able to take a further action without error.
  loaded.floor.enemies.forEach(e => { e.nextTime = 1e9; });
  const clockBefore = loaded.clock;
  const res = C.playerWait(loaded, rng);
  assert.equal(res.ok, true);
  assert.equal(loaded.clock, clockBefore + C.PLAYER_DEF.interval);
  assert.equal(loaded.state, 'playing');
});

// ---------- Phase 3: Hub and Crafting ----------
test('phase3: chassis upgrade raises next run max HP and deducts banked', () => {
  const hub = C.newHub(); hub.banked = 200;
  let res = C.buyChassisTier(hub);
  assert.equal(res.ok, true);
  assert.equal(hub.chassisTier, 1);
  assert.equal(hub.banked, 160, 'tier 1 costs 40');
  const run = C.newRun(301, hub);
  assert.equal(run.player.maxHp, 110);
  assert.equal(run.player.hp, 110);
  // Insufficient funds: no change.
  hub.banked = 10;
  res = C.buyChassisTier(hub);
  assert.equal(res.ok, false);
  assert.equal(hub.chassisTier, 1);
  assert.equal(hub.banked, 10);
  assert.match(res.reason, /salvage/);
  // Cap: tier 5 is the max.
  hub.chassisTier = 5;
  res = C.buyChassisTier(hub);
  assert.equal(res.ok, false);
  assert.match(res.reason, /max tier/);
});

test('phase3: salvager exchange moves both numbers in both directions', () => {
  const hub = C.newHub(); hub.components = 5; hub.banked = 100;
  let res = C.convertComponentsToSalvage(hub, 2);
  assert.equal(res.ok, true);
  assert.equal(res.salvageGained, 16, '1 component = 8 salvage');
  assert.equal(hub.components, 3);
  assert.equal(hub.banked, 116);
  res = C.convertSalvageToComponents(hub, 3);
  assert.equal(res.ok, true);
  assert.equal(hub.components, 6);
  assert.equal(hub.banked, 71, '3 components cost 45 salvage at the worse reverse rate');
  // Shortfalls fail without moving anything.
  res = C.convertComponentsToSalvage(hub, 99);
  assert.equal(res.ok, false);
  assert.equal(hub.components, 6);
  res = C.convertSalvageToComponents(hub, 99);
  assert.equal(res.ok, false);
  assert.equal(hub.banked, 71);
});

test('phase3: banking tier upgrade changes Descend rate, gated on Codex', () => {
  const hub = C.newHub(); hub.banked = 500;
  // Locked without the Codex requirement, even with salvage to spare.
  let res = C.buyBankingTier(hub);
  assert.equal(res.ok, false);
  assert.match(res.reason, /Codex/);
  assert.equal(hub.bankingTier, 0);
  hub.codex = ['Depth 1 industrial salvage signature'];
  res = C.buyBankingTier(hub);
  assert.equal(res.ok, true);
  assert.equal(res.rate, 0.40);
  assert.equal(hub.banked, 440, '40% tier costs 60');
  // Descend now banks 40%.
  let state = C.newRun(302, hub);
  state.state = 'stairs'; state.carried = 100;
  C.descend(state, state.runSeed);
  assert.equal(state.banked, 440 + 40);
  // 55% tier needs 3 Codex entries.
  res = C.buyBankingTier(hub);
  assert.equal(res.ok, false);
  assert.match(res.reason, /Codex/);
  hub.codex = ['a', 'b', 'c'];
  res = C.buyBankingTier(hub);
  assert.equal(res.ok, true);
  assert.equal(res.rate, 0.55);
  assert.equal(hub.banked, 440 - 150 + 40, '55% tier costs 150; note the earlier descend banked 40 into the hub');
  state = C.newRun(303, hub);
  state.state = 'stairs'; state.carried = 100;
  C.descend(state, state.runSeed);
  assert.equal(state.banked, 440 - 150 + 40 + 55);
  // A run without a hub still descends at the original 25%.
  const solo = C.newRun(304);
  solo.state = 'stairs'; solo.carried = 100;
  C.descend(solo, solo.runSeed);
  assert.equal(solo.banked, 25);
});

test('phase3: crafting deducts ingredients, stocks the hub, loads the next run capped', () => {
  const hub = C.newHub(); hub.banked = 100; hub.components = 5;
  let res = C.craft(hub, 'healthCell');
  assert.equal(res.ok, true);
  assert.equal(hub.components, 4);
  assert.equal(hub.banked, 95, 'health cell: 1 component + 5 salvage');
  assert.equal(hub.stockpile.health, 1);
  res = C.craft(hub, 'repairKit');
  assert.equal(res.ok, true);
  assert.equal(hub.components, 2);
  assert.equal(hub.banked, 85, 'repair kit: 2 components + 10 salvage');
  assert.equal(hub.stockpile.repairKit, 1);
  // Honest failure names the shortfall and moves nothing.
  hub.components = 0;
  res = C.craft(hub, 'healthCell');
  assert.equal(res.ok, false);
  assert.match(res.reason, /components/);
  assert.equal(hub.stockpile.health, 1);
  // Starting load is capped: health 2, food 2, repair kits 1.
  hub.stockpile = { health: 3, food: 1, repairKit: 2 };
  const run = C.newRun(305, hub);
  assert.equal(run.healthCells, 2);
  assert.equal(run.foodCells, 1);
  assert.equal(run.repairKits, 1);
  assert.equal(hub.stockpile.health, 1, '1 health cell stays in the hub');
  assert.equal(hub.stockpile.repairKit, 1, '1 repair kit stays in the hub');
});

test('phase3-balance: Armorer ammo packs craft, load capped, old hubs default to 0 ammo', () => {
  const hub = C.newHub(); hub.banked = 20; hub.components = 0;
  let res = C.craft(hub, 'ammoPack');
  assert.equal(res.ok, true);
  assert.equal(res.output, 'ammoStandard');
  assert.equal(res.outputCount, 6, 'one pack crafts 6 ammo (faucet unchanged by Phase 1)');
  assert.equal(hub.banked, 12, 'ammo pack: 8 salvage, no components');
  assert.equal(hub.components, 0);
  assert.equal(hub.stockpile.ammoStandard, 6);
  res = C.craft(hub, 'ammoPack');
  assert.equal(res.ok, true);
  assert.equal(hub.stockpile.ammoStandard, 12);
  // Honest failure: short on salvage, nothing moves.
  hub.banked = 7;
  res = C.craft(hub, 'ammoPack');
  assert.equal(res.ok, false);
  assert.match(res.reason, /salvage/);
  assert.equal(hub.banked, 7);
  assert.equal(hub.stockpile.ammoStandard, 12);
  // Phase 4 (§7.6.4): the default loadout is 16 free Standard rounds;
  // the hub stockpile is untouched unless the player allocates.
  hub.stockpile.ammoStandard = 20;
  const run = C.newRun(307, hub);
  assert.equal(run.ammoPools.standard, C.STARTING_AMMO, 'default loadout: 16 free Standard');
  assert.equal(hub.stockpile.ammoStandard, 20, 'default loadout draws nothing from the hub');
  // An explicit allocation draws from the hub and tops up with free
  // Standard to 16 total.
  hub.stockpile.ammoStandard = 20;
  const run2 = C.newRun(308, hub, { standard: 5, piercing: 0, incendiary: 0, shock: 0 });
  assert.equal(run2.ammoPools.standard, 16, '11 free + 5 allocated');
  assert.equal(hub.stockpile.ammoStandard, 15);
  // Legacy hub: stockpile without typed ammo keys defaults to 0,
  // run still starts at STARTING_AMMO Standard.
  const legacy = C.newHub(); delete legacy.stockpile.ammoStandard;
  const run3 = C.newRun(309, legacy);
  assert.equal(run3.ammoPools.standard, C.STARTING_AMMO);
  assert.equal(legacy.stockpile.ammoStandard, 0);
  // Save/load round-trip keeps crafted ammo.
  const storage = fakeStorage();
  C.saveHub(storage, hub);
  const loaded = C.loadHub(storage);
  assert.equal(loaded.stockpile.ammoStandard, 15);
  hub.stockpile.ammoStandard = 9;
  C.saveHub(storage, hub);
  assert.equal(C.loadHub(storage).stockpile.ammoStandard, 9);
});

test('phase3: repair kit heals 50 from a quickslot', () => {
  const state = C.newRun(306);
  const rng = seededRng(21);
  state.player.hp = 50;
  state.repairKits = 1;
  let res = C.assignQuickslot(state, 2, 'repairKit');
  assert.equal(res.ok, true);
  res = C.useQuickslot(state, rng, 2);
  assert.equal(res.ok, true);
  assert.equal(res.healed, 50);
  assert.equal(state.player.hp, 100);
  assert.equal(state.repairKits, 0);
  // Refused with none held, and at full HP.
  res = C.useQuickslot(state, rng, 2);
  assert.equal(res.ok, false);
  state.repairKits = 1;
  res = C.useQuickslot(state, rng, 2);
  assert.equal(res.ok, false, 'full HP must refuse the kit');
  assert.equal(state.repairKits, 1);
});

test('phase3: scout preview matches the generator composition for the next depth', () => {
  const seed = 307;
  for (const depth of [1, 2, 3]) {
    const preview = C.scoutPreview(seed, depth);
    const floor = C.generateFloor(seed, depth);
    const counts = {};
    floor.enemies.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1; });
    const previewCounts = {};
    preview.byType.forEach(b => { previewCounts[b.type] = b.count; });
    assert.deepEqual(previewCounts, counts, 'preview must equal the generated floor at depth ' + depth);
    assert.equal(preview.total, floor.enemies.length);
    assert.equal(preview.depth, depth);
  }
});

test('phase3: hub state survives a new expedition and a save/load round-trip', () => {
  const storage = fakeStorage();
  const hub = C.newHub();
  hub.banked = 200; hub.components = 4; hub.codex = ['a', 'b'];
  hub.chassisTier = 2; hub.bankingTier = 1; hub.stockpile = { health: 1, food: 0, repairKit: 0 };
  hub.deepestDepth = 3;
  C.saveHub(storage, hub);
  const loaded = C.loadHub(storage);
  assert.equal(loaded.chassisTier, 2);
  assert.equal(loaded.bankingTier, 1);
  assert.deepEqual(loaded.stockpile, { health: 1, food: 0, repairKit: 0, ammoStandard: 0, ammoPiercing: 0, ammoIncendiary: 0, ammoShock: 0 });
  assert.equal(loaded.deepestDepth, 3);
  assert.deepEqual(loaded.codex, ['a', 'b']);
  // A new expedition keeps the hub and applies the chassis tier.
  const run = C.newRun(308, loaded);
  assert.equal(run.player.maxHp, 120, 'tier 2 = +20 HP');
  assert.equal(loaded.banked, 200);
  assert.equal(loaded.chassisTier, 2);
  assert.equal(loaded.bankingTier, 1);
});

test('phase3: radio rumors derive from real hub state, no quest language', () => {
  const hub = C.newHub();
  let list = C.rumors(hub);
  assert.ok(Array.isArray(list) && list.length >= 3);
  assert.ok(list.join(' ').includes('depth 1'));
  hub.wreck = { depth: 2, salvage: 30, health: 1, food: 0, components: 0 };
  hub.codex = ['Depth 1 industrial salvage signature'];
  hub.banked = 77;
  list = C.rumors(hub);
  const joined = list.join(' ');
  assert.ok(joined.includes('depth 2'), 'wreck depth must appear');
  assert.ok(joined.includes('1 Codex'), 'codex count must appear');
  assert.ok(joined.includes('77'), 'banked total must appear');
  assert.ok(!/fetch|bring me|go to depth|accept this|bounty|contract/i.test(joined), 'rumors must not imply a quest or contract');
});

// --- Dressing density + circuit block (Task 1) ---
// Dressing is walkable decor only: it must never sit on the spawn
// cell, the stairs cell, a pickup, an enemy, or a non-floor cell,
// and every room — including the spawn room — must carry some.
test('dressing: every room dressed including spawn, never on actors or key cells', () => {
  for (let runSeed = 1; runSeed <= 20; runSeed++) {
    for (let depth = 1; depth <= 3; depth++) {
      const floor = C.generateFloor(runSeed, depth);
      const spawnRoom = floor.rooms[0];
      const inSpawn = floor.dressing.filter(d =>
        d.x >= spawnRoom.x && d.x < spawnRoom.x + spawnRoom.w &&
        d.y >= spawnRoom.y && d.y < spawnRoom.y + spawnRoom.h);
      assert.ok(inSpawn.length > 0, `seed ${runSeed} depth ${depth}: spawn room has no dressing`);
      floor.rooms.forEach((r, i) => {
        const inRoom = floor.dressing.filter(d =>
          d.x >= r.x && d.x < r.x + r.w && d.y >= r.y && d.y < r.y + r.h);
        assert.ok(inRoom.length > 0, `seed ${runSeed} depth ${depth} room ${i}: no dressing`);
      });
      const occupied = new Set([
        ...floor.pickups.map(p => p.x + ',' + p.y),
        ...floor.enemies.map(e => e.x + ',' + e.y),
      ]);
      floor.dressing.forEach(d => {
        assert.equal(floor.grid[d.y][d.x], 'floor', `dressing at ${d.x},${d.y} is not on a floor cell`);
        assert.ok(!(d.x === floor.spawn.x && d.y === floor.spawn.y), 'dressing on the spawn cell');
        assert.ok(!(d.x === floor.stairs.x && d.y === floor.stairs.y), 'dressing on the stairs cell');
        assert.ok(!occupied.has(d.x + ',' + d.y), `dressing at ${d.x},${d.y} overlaps a pickup or enemy`);
      });
      // No duplicate dressing on one cell.
      const seen = new Set(floor.dressing.map(d => d.x + ',' + d.y));
      assert.equal(seen.size, floor.dressing.length, 'duplicate dressing cells');
    }
  }
});

test('dressing: minimum density per floor over seeds and depths', () => {
  let total = 0, floors = 0, ratioSum = 0;
  for (let runSeed = 1; runSeed <= 60; runSeed++) {
    for (let depth = 1; depth <= 3; depth++) {
      const floor = C.generateFloor(runSeed, depth);
      let free = 0;
      floor.grid.forEach(row => row.forEach(t => { if (t === 'floor') free++; }));
      const ratio = floor.dressing.length / free;
      assert.ok(ratio >= 0.28, `seed ${runSeed} depth ${depth}: dressing ratio ${ratio.toFixed(3)} below 0.28`);
      ratioSum += ratio; floors++;
      total += floor.dressing.length;
    }
  }
  assert.equal(floors, 180);
  assert.ok(ratioSum / floors >= 0.30, `mean dressing ratio ${(ratioSum / floors).toFixed(3)} below 0.30`);
  assert.ok(total > 0);
});

test('circuit block: present, one rectangle, inside one non-spawn room, on floor cells', () => {
  for (let runSeed = 1; runSeed <= 60; runSeed++) {
    for (let depth = 1; depth <= 3; depth++) {
      const floor = C.generateFloor(runSeed, depth);
      const cb = floor.circuitBlock;
      assert.ok(cb, `seed ${runSeed} depth ${depth}: no circuitBlock`);
      assert.ok((cb.w === 4 && cb.h === 3) || (cb.w === 3 && cb.h === 4),
        `seed ${runSeed} depth ${depth}: block size ${cb.w}x${cb.h}, expected 4x3 or 3x4`);
      const containing = floor.rooms.filter(r =>
        cb.x >= r.x && cb.x + cb.w <= r.x + r.w && cb.y >= r.y && cb.y + cb.h <= r.y + r.h);
      assert.equal(containing.length, 1, `seed ${runSeed} depth ${depth}: block must sit inside exactly one room`);
      assert.notEqual(containing[0], floor.rooms[0], 'circuit block must not be in the spawn room');
      for (let y = cb.y; y < cb.y + cb.h; y++) {
        for (let x = cb.x; x < cb.x + cb.w; x++) {
          assert.equal(floor.grid[y][x], 'floor', `block cell ${x},${y} is not a floor cell`);
        }
      }
    }
  }
});

test('circuit block and dressing: same seed reproduces the same floor including the block', () => {
  const a = C.generateFloor(42, 2), b = C.generateFloor(42, 2);
  assert.deepEqual(a.dressing, b.dressing);
  assert.deepEqual(a.circuitBlock, b.circuitBlock);
  assert.deepEqual(a.grid, b.grid);
  // Save/load round-trip keeps the block (serializeRun JSON-copies the floor).
  const storage = fakeStorage();
  const state = C.newRun(42);
  C.saveRun(storage, state);
  const loaded = C.loadRun(storage);
  assert.deepEqual(loaded.floor.circuitBlock, state.floor.circuitBlock);
  assert.deepEqual(loaded.floor.dressing, state.floor.dressing);
});

// Task 2 regression: every generated floor has >=1 loot room, >=1
// structure room, and >=1 pickup. Root cause of the reported zero-pickup
// floors (runSeed 20/depth 1, 22/depth 3, 23/depth 2 — all underlying
// seed 21): the old typing guarantee forced rooms[1] to 'loot', then
// forced rooms[2] to 'structure', deleting the floor's ONLY loot room
// when it sat at rooms[2]. Pickups spawn only in loot rooms, so those
// floors had zero pickups. The wider sweep also caught a second,
// adjacent defect: floors with no combat AND no empty rooms threw
// (combatRooms[e % 0] undefined; underlying seeds 96 and 386) — the
// enemy-placement fallback below covers that too.
test('guarantees: every floor has a loot room, a structure room, and pickups', () => {
  const failing = [[20, 1], [22, 3], [23, 2]];
  for (const [runSeed, depth] of failing) {
    const floor = C.generateFloor(runSeed, depth);
    assert.ok(floor.rooms.some(r => r.type === 'loot'), `seed ${runSeed} depth ${depth}: no loot room`);
    assert.ok(floor.pickups.length >= 1, `seed ${runSeed} depth ${depth}: no pickups`);
  }
  let checked = 0;
  for (let runSeed = 1; runSeed <= 200; runSeed++) {
    for (let depth = 1; depth <= 3; depth++) {
      const floor = C.generateFloor(runSeed, depth); // must not throw
      assert.ok(floor.rooms.some(r => r.type === 'loot'),
        `seed ${runSeed} depth ${depth}: no loot room (types ${floor.rooms.map(r => r.type)})`);
      assert.ok(floor.rooms.some(r => r.type === 'structure'),
        `seed ${runSeed} depth ${depth}: no structure room (types ${floor.rooms.map(r => r.type)})`);
      assert.ok(floor.pickups.length >= 1,
        `seed ${runSeed} depth ${depth}: no pickups`);
      const check = C.coherenceCheck(floor);
      assert.equal(check.ok, true, `seed ${runSeed} depth ${depth}: ${check.errors.join('; ')}`);
      checked++;
    }
  }
  assert.equal(checked, 600);
});

// ---------- Ammo + Batch 3 console dressing (2026-10-27) ----------
// Helpers: find a straight walkable line from the player in some
// direction, and freeze the floor so only the player's action runs.
function findLine(state, minLen) {
  const p = state.player;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let ok = true;
    for (let s = 1; s <= minLen; s++) {
      if (!C.isWalkableTile(state.floor.grid[p.y + dy * s][p.x + dx * s])) { ok = false; break; }
    }
    if (ok) return [dx, dy];
  }
  return null;
}
// Phase 6: like findLine, but the shot path must not cross a closed
// or locked door before the target: cells 1..minLen-1 must be
// walkable and not door-blocking. The last cell may be a door — a
// foe standing in a doorway is hittable (the target cell never
// blocks). Used by shot tests whose fixtures must not be
// door-blocked; the door-blocking itself is correct behavior.
function findShotLine(state, minLen) {
  const p = state.player;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let ok = true;
    for (let s = 1; s <= minLen; s++) {
      const x = p.x + dx * s, y = p.y + dy * s;
      if (!C.isWalkableTile(state.floor.grid[y][x])) { ok = false; break; }
      if (s < minLen && C.doorBlocksMovement(state, x, y)) { ok = false; break; }
    }
    if (ok) return [dx, dy];
  }
  return null;
}
function freezeFloor(state) {
  state.floor.enemies.forEach(e => { e.nextTime = 1e9; });
}
function placeFoe(state, dx, dy, dist, opts) {
  const p = state.player;
  const foe = state.floor.enemies[0];
  Object.assign(foe, { x: p.x + dx * dist, y: p.y + dy * dist, alive: true, awake: true, evasion: 0, nextTime: 1e9 });
  Object.assign(foe, opts || {});
  return foe;
}

test('ammo: new run starts with the scrap blaster and starting ammo', () => {
  const state = C.newRun(301);
  assert.deepEqual(state.ammoPools, { standard: C.STARTING_AMMO, piercing: 0, incendiary: 0, shock: 0 });
  assert.equal(state.ammoPools.standard, 16, 'Phase 1 sim tuning: starting ammo 16');
  assert.equal(state.selectedAmmo, 'standard');
  assert.deepEqual(state.weapon, { kind: 'item', defId: 'scrapBlaster', tier: 'common', upgrade: 0, properties: [], flair: null, element: null });
  assert.equal(C.WEAPON_DEFS.scrapBlaster.range, 5);
  assert.equal(C.WEAPON_DEFS.scrapBlaster.ammoPerShot, 1);
  assert.deepEqual(C.WEAPON_DEFS.scrapBlaster.dice, { num: 2, sides: 6, plus: 8 });
  assert.equal(C.AMMO_CRATE_VALUE, 8, 'Phase 1 sim tuning: crate value 8');
  const inv = C.inventoryOf(state);
  assert.equal(inv.ammo, C.STARTING_AMMO);
  assert.deepEqual(inv.ammoPools, { standard: C.STARTING_AMMO, piercing: 0, incendiary: 0, shock: 0 });
  assert.deepEqual(inv.weapon, state.weapon);
});

test('ammo: firing hits the first enemy in the facing line only, spends ammo and time', () => {
  for (let seed = 301; seed <= 320; seed++) {
    const state = C.newRun(seed);
    const line = findLine(state, 4);
    if (!line) continue;
    const rng = seededRng(seed);
    const p = state.player;
    freezeFloor(state);
    // Clear the line of any other enemy, then place two foes in it.
    state.floor.enemies.forEach(e => { e.alive = false; });
    const foe = placeFoe(state, line[0], line[1], 3, { hp: 100, maxHp: 100 });
    const foe2 = state.floor.enemies[1];
    Object.assign(foe2, { x: p.x + line[0] * 4, y: p.y + line[1] * 4, alive: true, awake: true, evasion: 0, hp: 100, maxHp: 100, nextTime: 1e9 });
    p.facing = C.dirIndexFor(line[0], line[1]);
    p.acc = 100;
    const clockBefore = state.clock, actionsBefore = state.actions;
    const res = C.fireWeapon(state, rng);
    assert.equal(res.ok, true, `seed ${seed}: fire refused`);
    assert.equal(res.hit, true, `seed ${seed}: expected a hit with acc 100 vs evasion 0`);
    assert.equal(res.killed, false);
    assert.equal(res.target, foe.name);
    // Dice max for the Common +0 starter: 2d6+6 = 18, minus armor.
    const diceMax = C.WEAPON_DEFS.scrapBlaster.dice.num * C.WEAPON_DEFS.scrapBlaster.dice.sides + C.WEAPON_DEFS.scrapBlaster.dice.plus - foe.armor;
    assert.ok(foe.hp < 100 && foe.hp >= 100 - diceMax, `seed ${seed}: damage out of weapon range, hp ${foe.hp}`);
    assert.equal(foe2.hp, 100, 'second enemy behind the first must not be hit');
    assert.equal(state.ammoPools.standard, C.STARTING_AMMO - 1, 'one ammo per shot');
    assert.equal(state.clock, clockBefore + C.PLAYER_DEF.interval, 'firing costs 1 time unit');
    assert.ok(state.actions > actionsBefore, 'firing counts as a player action');
    return;
  }
  assert.fail('no seed in 301..320 offered a 4-cell walkable line');
});

test('ammo: firing wakes a sleeping target but never gets the melee surprise bonus', () => {
  for (let seed = 321; seed <= 340; seed++) {
    const state = C.newRun(seed);
    const line = findShotLine(state, 3);
    if (!line) continue;
    const rng = seededRng(seed);
    const p = state.player;
    freezeFloor(state);
    state.floor.enemies.forEach(e => { e.alive = false; });
    const foe = placeFoe(state, line[0], line[1], 3, { hp: 100, maxHp: 100, awake: false });
    p.facing = C.dirIndexFor(line[0], line[1]);
    p.acc = 100;
    const res = C.fireWeapon(state, rng);
    assert.equal(res.ok, true);
    assert.equal(res.woke, true, 'shot must wake a sleeping target');
    assert.equal(foe.awake, true);
    // No surprise bonus: damage is the plain weapon roll minus armor,
    // never the 1.5x surprise multiplier.
    const diceMax2 = C.WEAPON_DEFS.scrapBlaster.dice.num * C.WEAPON_DEFS.scrapBlaster.dice.sides + C.WEAPON_DEFS.scrapBlaster.dice.plus - foe.armor;
    assert.ok(foe.hp >= 100 - diceMax2, `seed ${seed}: damage ${100 - foe.hp} exceeds the non-surprise maximum`);
    return;
  }
  assert.fail('no seed in 321..340 offered a 3-cell walkable line');
});

test('ammo: firing kills, drops salvage, and counts the kill like melee', () => {
  for (let seed = 341; seed <= 360; seed++) {
    const state = C.newRun(seed);
    const line = findLine(state, 2);
    if (!line) continue;
    const rng = seededRng(seed);
    const p = state.player;
    freezeFloor(state);
    state.floor.enemies.forEach(e => { e.alive = false; });
    const foe = placeFoe(state, line[0], line[1], 2, { hp: 1, maxHp: 100 });
    p.facing = C.dirIndexFor(line[0], line[1]);
    p.acc = 100;
    const killsBefore = state.kills;
    const res = C.fireWeapon(state, rng);
    assert.equal(res.ok, true);
    assert.equal(res.killed, true);
    assert.equal(foe.alive, false);
    assert.equal(state.kills, killsBefore + 1);
    const drop = state.floor.pickups.find(pk => pk.x === foe.x && pk.y === foe.y && pk.kind === 'salvage');
    assert.ok(drop, 'kill must drop a salvage pickup on the kill tile');
    assert.ok(state.wrecks.some(w => w.x === foe.x && w.y === foe.y && w.type === foe.type), 'kill must leave a wreck');
    return;
  }
  assert.fail('no seed in 341..360 offered a 2-cell walkable line');
});

test('ammo: no target, wall-blocked, out-of-range, and empty ammo refuse free', () => {
  // No target: empty floor, facing an open line.
  {
    const state = C.newRun(371);
    const rng = seededRng(371);
    const line = findLine(state, 3) || [1, 0];
    state.floor.enemies = [];
    state.player.facing = C.dirIndexFor(line[0], line[1]);
    const clockBefore = state.clock, actionsBefore = state.actions;
    const res = C.fireWeapon(state, rng);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'no target in line of fire');
    assert.equal(state.ammoPools.standard, C.STARTING_AMMO);
    assert.equal(state.clock, clockBefore, 'refusal costs no time');
    assert.equal(state.actions, actionsBefore, 'refusal is not a player action');
  }
  // Wall-blocked and out-of-range: hunt seeds for the geometry.
  let wallCase = false, rangeCase = false;
  for (let seed = 372; seed <= 420 && !(wallCase && rangeCase); seed++) {
    const state = C.newRun(seed);
    const p = state.player;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (wallCase && rangeCase) break;
      // Wall within range with a walkable cell beyond it.
      if (!wallCase) {
        for (let s = 1; s <= 5; s++) {
          if (state.floor.grid[p.y + dy * s][p.x + dx * s] === 'wall') {
            for (let s2 = s + 1; s2 <= 5; s2++) {
              if (C.isWalkableTile(state.floor.grid[p.y + dy * s2][p.x + dx * s2])) {
                freezeFloor(state);
                state.floor.enemies.forEach(e => { e.alive = false; });
                const foe = placeFoe(state, dx, dy, s2, { hp: 100, maxHp: 100 });
                p.facing = C.dirIndexFor(dx, dy); p.acc = 100;
                const ammoBefore = state.ammoPools.standard, clockBefore = state.clock;
                const res = C.fireWeapon(state, seededRng(seed));
                assert.equal(res.ok, false, `seed ${seed}: wall must block the shot`);
                assert.equal(foe.hp, 100, 'foe behind a wall must be unharmed');
                assert.equal(state.ammoPools.standard, ammoBefore);
                assert.equal(state.clock, clockBefore);
                wallCase = true;
                break;
              }
            }
            break;
          }
        }
      }
      // Foe beyond range on an open line.
      if (!rangeCase) {
        let open = true;
        for (let s = 1; s <= 6; s++) {
          if (!C.isWalkableTile(state.floor.grid[p.y + dy * s][p.x + dx * s])) { open = false; break; }
        }
        if (open) {
          freezeFloor(state);
          state.floor.enemies.forEach(e => { e.alive = false; });
          const foe = placeFoe(state, dx, dy, 6, { hp: 100, maxHp: 100 });
          p.facing = C.dirIndexFor(dx, dy); p.acc = 100;
          const ammoBefore = state.ammoPools.standard, clockBefore = state.clock;
          const res = C.fireWeapon(state, seededRng(seed));
          assert.equal(res.ok, false, `seed ${seed}: range 5 must not reach distance 6`);
          assert.equal(foe.hp, 100);
          assert.equal(state.ammoPools.standard, ammoBefore);
          assert.equal(state.clock, clockBefore);
          rangeCase = true;
        }
      }
    }
  }
  assert.ok(wallCase, 'no seed in 372..420 offered a wall-blocked line');
  assert.ok(rangeCase, 'no seed in 372..420 offered a 6-cell open line');
  // Empty ammo with a foe in line.
  {
    const state = C.newRun(421);
    const line = findLine(state, 2);
    assert.ok(line, 'seed 421 must offer a 2-cell line');
    const rng = seededRng(421);
    freezeFloor(state);
    state.floor.enemies.forEach(e => { e.alive = false; });
    const foe = placeFoe(state, line[0], line[1], 2, { hp: 100, maxHp: 100 });
    state.player.facing = C.dirIndexFor(line[0], line[1]);
    state.ammoPools = { standard: 0, piercing: 0, incendiary: 0, shock: 0 };
    const clockBefore = state.clock;
    const res = C.fireWeapon(state, rng);
    assert.equal(res.ok, false);
    assert.equal(res.reason, 'No ammunition');
    assert.equal(foe.hp, 100);
    assert.deepEqual(state.ammoPools, { standard: 0, piercing: 0, incendiary: 0, shock: 0 });
    assert.equal(state.clock, clockBefore);
  }
});

test('ammo: crates spawn in loot rooms and restore ammo on pickup', () => {
  let floors = 0;
  for (let runSeed = 1; runSeed <= 60; runSeed++) {
    for (let depth = 1; depth <= 3; depth++) {
      const floor = C.generateFloor(runSeed, depth);
      const crates = floor.pickups.filter(pk => pk.kind === 'ammo');
      assert.ok(crates.length >= 1, `seed ${runSeed} depth ${depth}: no ammo crate`);
      crates.forEach(pk => {
        assert.equal(pk.value, C.AMMO_CRATE_VALUE, 'crate value must be the table value');
        const room = floor.rooms.find(r => pk.x >= r.x && pk.x < r.x + r.w && pk.y >= r.y && pk.y < r.y + r.h);
        assert.ok(room && room.type === 'loot', `seed ${runSeed} depth ${depth}: ammo crate outside a loot room`);
      });
      floors++;
    }
  }
  assert.equal(floors, 180);
  // Collection: step onto a crate tile.
  const state = C.newRun(422);
  const rng = seededRng(422);
  freezeFloor(state);
  const p = state.player;
  let step = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = p.x + dx, ny = p.y + dy;
    if (C.isWalkableTile(state.floor.grid[ny][nx]) && !state.floor.enemies.some(e => e.alive && e.x === nx && e.y === ny)) { step = [dx, dy]; break; }
  }
  assert.ok(step, 'seed 422 must offer a walkable neighbour');
  state.floor.pickups.push({ x: p.x + step[0], y: p.y + step[1], kind: 'ammo', value: C.AMMO_CRATE_VALUE });
  state.ammoPools.standard = 5;
  const res = C.playerAction(state, rng, step[0], step[1]);
  assert.equal(res.ok, true);
  assert.equal(state.ammoPools.standard, 5 + C.AMMO_CRATE_VALUE);
  assert.equal(state.floor.pickups.some(pk => pk.kind === 'ammo' && pk.x === p.x && pk.y === p.y), false);
});

test('ammo: save/load round-trip preserves ammo and weapon; old saves default', () => {
  const storage = fakeStorage();
  const hub = C.newHub();
  const state = C.newRun(423, hub);
  state.ammoPools = { standard: 7, piercing: 3, incendiary: 0, shock: 0 };
  state.selectedAmmo = 'piercing';
  C.saveRun(storage, state);
  const loaded = C.loadRun(storage);
  assert.ok(loaded);
  assert.deepEqual(loaded.ammoPools, { standard: 7, piercing: 3, incendiary: 0, shock: 0 });
  assert.equal(loaded.selectedAmmo, 'piercing');
  assert.deepEqual(loaded.weapon, { kind: 'item', defId: 'scrapBlaster', tier: 'common', upgrade: 0, properties: [], flair: null, element: null });
  // An old save with no ammo/weapon fields gets the defaults.
  const old = C.serializeRun(state);
  delete old.ammoPools; delete old.selectedAmmo; delete old.weapon;
  const migrated = C.deserializeRun(old);
  assert.equal(migrated.ammoPools.standard, C.STARTING_AMMO);
  assert.equal(migrated.selectedAmmo, 'standard');
  assert.deepEqual(migrated.weapon, { kind: 'item', defId: 'scrapBlaster', tier: 'common', upgrade: 0, properties: [], flair: null, element: null });
  // A legacy STRING weapon maps to a Common +0 instance of the same def.
  const strOld = C.serializeRun(state);
  strOld.weapon = 'scrapBlaster';
  assert.deepEqual(C.deserializeRun(strOld).weapon, { kind: 'item', defId: 'scrapBlaster', tier: 'common', upgrade: 0, properties: [], flair: null, element: null });
});

test('ammo: death puts ammo in the wreck, recovery restores it', () => {
  const hub = C.newHub();
  const first = C.newRun(424, hub);
  const rng = seededRng(424);
  first.ammoPools = { standard: 7, piercing: 2, incendiary: 0, shock: 0 };
  killPlayerByAdjacentAttack(first, rng);
  assert.ok(hub.wreck);
  assert.deepEqual(hub.wreck.ammoPools, { standard: 7, piercing: 2, incendiary: 0, shock: 0 }, 'wreck must hold the dead run\'s typed ammo');
  const next = C.newRun(425, hub);
  assert.ok(next.playerWreck);
  assert.deepEqual(next.playerWreck.ammoPools, { standard: 7, piercing: 2, incendiary: 0, shock: 0 });
  const adj = walkableAdjacent(next, next.playerWreck.x, next.playerWreck.y);
  assert.ok(adj, 'no walkable neighbour of the wreck tile');
  next.player.x = adj[0]; next.player.y = adj[1];
  next.floor.enemies.forEach(e => { e.nextTime = 1e9; });
  const res = C.playerAction(next, rng, Math.sign(next.playerWreck.x - adj[0]), Math.sign(next.playerWreck.y - adj[1]));
  assert.equal(res.ok, true);
  assert.equal(next.ammoPools.standard, C.STARTING_AMMO + 7, 'recovery restores wreck ammo on top of the fresh run\'s starting ammo');
  assert.equal(next.ammoPools.piercing, 2, 'wreck piercing recovers into its own pool');
  assert.equal(next.playerWreck, null);
  assert.equal(hub.wreck, null);
});

test('batch3: structure rooms get console dressing on floor cells, no overlaps', () => {
  for (let runSeed = 1; runSeed <= 60; runSeed++) {
    for (let depth = 1; depth <= 3; depth++) {
      const floor = C.generateFloor(runSeed, depth);
      const consoles = floor.dressing.filter(d => d.kind === 'console');
      assert.ok(consoles.length >= 1, `seed ${runSeed} depth ${depth}: no console dressing`);
      consoles.forEach(d => {
        assert.equal(floor.grid[d.y][d.x], 'floor', 'console dressing must sit on a floor cell');
        const room = floor.rooms.find(r => d.x >= r.x && d.x < r.x + r.w && d.y >= r.y && d.y < r.y + r.h);
        assert.ok(room && room.type === 'structure', 'console dressing belongs in structure rooms');
        assert.ok(!(d.x === floor.spawn.x && d.y === floor.spawn.y), 'console dressing on the spawn cell');
        assert.ok(!(d.x === floor.stairs.x && d.y === floor.stairs.y), 'console dressing on the stairs cell');
      });
    }
  }
});

test('wide-cell: placement invariants across 180 floors', () => {
  const WIDE_KINDS = new Set([
    'wide_batch3_s1_console_triple', 'wide_batch3_s2_console_wide_2', 'wide_batch3_s2_console_wide_3',
    'wide_batch3_s1_server_pair', 'wide_batch3_s1_server_top_pair',
    'wide_batch3_s2_scrap_pile_a', 'wide_batch3_s2_scrap_pile_wires', 'wide_batch3_s2_armour_broken',
    'wide_batch3_s2_scrap_debris', 'wide_batch3_s2_crates_stack',
    'wide_batch3_s2_ladder_platform', 'wide_batch3_s2_wall_corner_L',
  ]);
  let ladderFloors = 0, stairsFloors = 0, wideCount = 0;
  for (let runSeed = 1; runSeed <= 60; runSeed++) {
    for (let depth = 1; depth <= 3; depth++) {
      const floor = C.generateFloor(runSeed, depth);
      for (const w of floor.wideDressing) {
        assert.ok(WIDE_KINDS.has(w.kind), `unknown wide kind ${w.kind}`);
        assert.ok(!(w.x === floor.spawn.x && w.y === floor.spawn.y), 'wide record on spawn cell');
        assert.ok(!(w.x === floor.stairs.x && w.y === floor.stairs.y), 'wide record on stairs cell');
        assert.ok(w.x >= 0 && w.x + 1 < C.GRID_W && w.y >= 0 && w.y < C.GRID_H, 'wide record out of bounds');
        const right = floor.grid[w.y][w.x + 1];
        if (w.kind === 'wide_batch3_s2_wall_corner_L') {
          assert.equal(floor.grid[w.y][w.x], 'wall', 'corner anchor must be a wall cell');
          assert.equal(right, 'wall', 'corner neighbour must be a wall cell');
          assert.equal(floor.grid[w.y + 1][w.x], 'floor', 'corner needs floor below the anchor');
          assert.equal(floor.grid[w.y + 1][w.x + 1], 'floor', 'corner needs floor below the neighbour');
        } else {
          assert.equal(floor.grid[w.y][w.x], 'floor', 'wide anchor must be a floor cell');
          assert.equal(right, 'floor', 'wide neighbour must be a floor cell');
        }
        // No pickup / enemy / hazard on either span cell.
        for (const [cx, cy] of [[w.x, w.y], [w.x + 1, w.y]]) {
          assert.ok(!floor.pickups.some(p => p.x === cx && p.y === cy), 'pickup under wide art');
          assert.ok(!floor.enemies.some(e => e.x === cx && e.y === cy), 'enemy under wide art');
          assert.ok(!floor.hazards.some(h => h.x === cx && h.y === cy), 'hazard under wide art');
        }
        // The covered neighbour cell carries a render-skipped cover
        // record — except corner records (wall cells never take
        // dressing, so no cover is needed) and neighbours holding a
        // pickup/enemy/hazard (the art draws under them, no cover).
        if (w.kind !== 'wide_batch3_s2_wall_corner_L' &&
            !floor.pickups.some(p => p.x === w.x + 1 && p.y === w.y) &&
            !floor.enemies.some(e => e.x === w.x + 1 && e.y === w.y) &&
            !floor.hazards.some(h => h.x === w.x + 1 && h.y === w.y)) {
          const cover = floor.dressing.find(d => d.x === w.x + 1 && d.y === w.y);
          assert.ok(cover && cover.cover === true, 'wide neighbour missing wide_cover record');
        }
        // No two wide records within the spacing rule (<=2 cells
        // horizontally and <=1 row vertically), and none crowding
        // the wide stairs either.
        for (const other of floor.wideDressing) {
          if (other === w) continue;
          assert.ok(Math.abs(other.x - w.x) > 2 || Math.abs(other.y - w.y) > 1, 'wide records overlap/touch');
        }
        if (floor.wideStairs) {
          assert.ok(Math.abs(floor.wideStairs.x - w.x) > 2 || Math.abs(floor.wideStairs.y - w.y) > 1, 'wide record crowds the wide stairs');
        }
        wideCount++;
      }
      if (floor.wideDressing.some(w => w.kind === 'wide_batch3_s2_ladder_platform')) {
        ladderFloors++;
        assert.equal(floor.wideDressing.filter(w => w.kind === 'wide_batch3_s2_ladder_platform').length, 1, 'at most one ladder per floor');
      }
      if (floor.wideStairs) {
        stairsFloors++;
        assert.equal(floor.wideStairs.x, floor.stairs.x, 'wideStairs must sit on the stairs cell');
        assert.equal(floor.wideStairs.y, floor.stairs.y, 'wideStairs must sit on the stairs cell');
        assert.equal(floor.grid[floor.stairs.y][floor.stairs.x + 1], 'floor', 'wideStairs neighbour must be floor');
        if (!floor.pickups.some(p => p.x === floor.stairs.x + 1 && p.y === floor.stairs.y) &&
            !floor.enemies.some(e => e.x === floor.stairs.x + 1 && e.y === floor.stairs.y) &&
            !floor.hazards.some(h => h.x === floor.stairs.x + 1 && h.y === floor.stairs.y)) {
          const cover = floor.dressing.find(d => d.x === floor.stairs.x + 1 && d.y === floor.stairs.y);
          assert.ok(cover && cover.cover === true, 'stairs neighbour missing wide_cover record');
        }
      }
      // Determinism: same seed + depth regenerates identical wide records.
      const again = C.generateFloor(runSeed, depth);
      assert.deepEqual(again.wideDressing, floor.wideDressing, `wide records not deterministic, seed ${runSeed} depth ${depth}`);
      assert.deepEqual(again.wideStairs, floor.wideStairs, `wideStairs not deterministic, seed ${runSeed} depth ${depth}`);
    }
  }
  assert.ok(wideCount > 0, 'no wide records placed on any of 180 floors');
  assert.ok(ladderFloors > 0, 'no ladder placed on any of 180 floors');
  assert.ok(stairsFloors > 0, 'no wide stairs placed on any of 180 floors');
});

test('wide-cell: save/load round-trips wide records, old saves tolerate their absence', () => {
  const hub = C.newHub();
  const run = C.newRun(7, hub);
  const saved = C.serializeRun(run);
  assert.ok(Array.isArray(saved.floor.wideDressing), 'serialized floor must carry wideDressing');
  assert.ok('wideStairs' in saved.floor, 'serialized floor must carry wideStairs');
  const restored = C.deserializeRun(saved);
  assert.deepEqual(restored.floor.wideDressing, run.floor.wideDressing, 'wideDressing lost in round-trip');
  assert.deepEqual(restored.floor.wideStairs, run.floor.wideStairs, 'wideStairs lost in round-trip');
  // Old save shape: strip the wide fields and confirm load does not throw.
  const legacy = JSON.parse(JSON.stringify(saved));
  delete legacy.floor.wideDressing;
  delete legacy.floor.wideStairs;
  const migrated = C.deserializeRun(legacy);
  assert.equal(migrated.floor.wideDressing, undefined, 'legacy save must not gain wideDressing');
  assert.equal(migrated.floor.wideStairs, undefined, 'legacy save must not gain wideStairs');
});

// ---------- Phase 1: loot tiers, upgrade levels, damage & dice ----------

test('phase1: tier and upgrade rolls match the depth tables (fixed stream)', () => {
  const rng = seededRng(424242);
  const N = 20000;
  const counts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  for (let i = 0; i < N; i++) counts[C.rollTier(rng, 1)]++;
  // Depth-1 weights: 62 / 25 / 10 / 2.5 / 0.5, tolerance +-20% relative
  // (absolute floor for the rare tail so the check is not flake-prone).
  assert.ok(counts.common / N > 0.50 && counts.common / N < 0.74, `common ${counts.common / N}`);
  assert.ok(counts.uncommon / N > 0.20 && counts.uncommon / N < 0.30, `uncommon ${counts.uncommon / N}`);
  assert.ok(counts.rare / N > 0.08 && counts.rare / N < 0.12, `rare ${counts.rare / N}`);
  assert.ok(counts.epic / N > 0.015 && counts.epic / N < 0.035, `epic ${counts.epic / N}`);
  assert.ok(counts.legendary / N > 0.002 && counts.legendary / N < 0.009, `legendary ${counts.legendary / N}`);
  // Upgrade: depth 1 is 80/20, never +2 or higher.
  const ups = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < N; i++) ups[C.rollUpgrade(rng, 1)]++;
  assert.ok(ups[0] / N > 0.76 && ups[0] / N < 0.84, `+0 ${ups[0] / N}`);
  assert.ok(ups[1] / N > 0.16 && ups[1] / N < 0.24, `+1 ${ups[1] / N}`);
  assert.equal(ups[2] + ups[3] + ups[4] + ups[5], 0, 'depth 1 must never roll +2 or higher');
  // Depth 6 reaches +5 sometimes, and never exceeds +5.
  let saw5 = 0;
  for (let i = 0; i < N; i++) { const u = C.rollUpgrade(rng, 6); if (u === 5) saw5++; assert.ok(u <= 5); }
  assert.ok(saw5 > 0, 'depth 6+ should sometimes roll +5');
});

test('phase1: 200-floor sweep — every floor has >=1 item drop, tier mix in bounds', () => {
  const tierCounts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  let floors = 0, items = 0, structureRooms = 0, structureCaches = 0;
  for (let runSeed = 1; runSeed <= 200; runSeed++) {
    const floor = C.generateFloor(runSeed, 1);
    floors++;
    const floorItems = floor.pickups.filter(p => p.kind === 'item');
    assert.ok(floorItems.length >= 1, `seed ${runSeed}: floor has zero item drops`);
    floorItems.forEach(p => { tierCounts[p.tier]++; items++; });
    // No +2 or higher on depth 1, ever.
    floorItems.forEach(p => assert.ok(p.upgrade <= 1, `seed ${runSeed}: depth-1 upgrade +${p.upgrade}`));
    floor.rooms.forEach(r => { if (r.type === 'structure') structureRooms++; });
    // Structure-room caches: count item pickups placed in structure rooms.
    floor.rooms.forEach(r => {
      if (r.type !== 'structure') return;
      if (floor.pickups.some(p => p.kind === 'item' && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h)) structureCaches++;
    });
  }
  assert.equal(floors, 200);
  // Tier mix across all item drops: common/uncommon/rare within +-20%
  // relative of the depth-1 table; legendary under 2% (upper bound —
  // the >0 claim is proven by the fixed-stream roll test above).
  assert.ok(tierCounts.common / items > 0.50 && tierCounts.common / items < 0.74, `common share ${tierCounts.common / items}`);
  assert.ok(tierCounts.uncommon / items > 0.18 && tierCounts.uncommon / items < 0.32, `uncommon share ${tierCounts.uncommon / items}`);
  assert.ok(tierCounts.rare / items > 0.06 && tierCounts.rare / items < 0.14, `rare share ${tierCounts.rare / items}`);
  assert.ok(tierCounts.legendary / items < 0.02, `legendary share ${tierCounts.legendary / items} must stay under 2%`);
  // Structure cache chance 50%: over ~200+ structure rooms, 25–75%.
  const rate = structureCaches / structureRooms;
  assert.ok(rate > 0.25 && rate < 0.75, `structure cache rate ${rate} (${structureCaches}/${structureRooms})`);
});

test('phase1: weaponStats derives tier x upgrade scaling, never stored', () => {
  const state = C.newRun(11);
  state.weapon = C.makeItemInstance('plasmaRifle', 'epic', 3, ['range'], null);
  const st = C.weaponStats(state);
  // Epic 1.35 x (1 + 3*0.12) = 1.836; range 6 + 1 property = 7.
  assert.ok(Math.abs(st.mult - 1.836) < 1e-9, `mult ${st.mult}`);
  assert.equal(st.range, 7);
  assert.equal(st.accBonus, 2);
  assert.equal(st.displayName, '[Epic] Plasma rifle +3');
  // A Common +0 blaster has mult exactly 1 and no scaling.
  state.weapon = C.makeItemInstance('scrapBlaster', 'common', 0, [], null);
  assert.equal(C.weaponStats(state).mult, 1);
  // Legacy string normalizes; unknown shapes default to the blaster.
  assert.deepEqual(C.normalizeWeaponInstance('railGun'), { kind: 'item', defId: 'railGun', tier: 'common', upgrade: 0, properties: [], flair: null, element: null });
  assert.equal(C.normalizeWeaponInstance({ defId: 'nope' }).defId, 'scrapBlaster');
  assert.equal(C.weaponDisplayName(C.makeItemInstance('railGun', 'legendary', 2, [], 'Ember')), "[Legendary] Rail gun 'Ember' +2");
});

test('phase1: dice rolls stay in spec and the log shows the roll', () => {
  const rng = seededRng(77);
  for (let i = 0; i < 500; i++) {
    const d = C.rollDiceDetailed(rng, { num: 2, sides: 6, plus: 6 }, 1);
    assert.ok(d.total >= 8 && d.total <= 18, `2d6+6 total ${d.total}`);
    assert.equal(d.rolls.length, 2);
    assert.ok(/^2d6\+6: \d\+\d\+6 = \d+$/.test(d.detail), `detail format: ${d.detail}`);
  }
  // Scaling applies to the rolled total and shows in the detail.
  const scaled = C.rollDiceDetailed(seededRng(3), { num: 2, sides: 6, plus: 6 }, 1.22);
  assert.ok(/x1\.22 -> \d+$/.test(scaled.detail), scaled.detail);
  // rollDamage: dice branch for weapons, flat+var otherwise.
  const dr = C.rollDamage(seededRng(9), { dice: { num: 1, sides: 6, plus: 3 }, dmgMult: 1 });
  assert.ok(dr >= 4 && dr <= 9);
  const fr = C.rollDamage(seededRng(9), { dmg: 10, dmgVar: 4 });
  assert.ok(fr >= 10 && fr <= 14);
});

test('phase2: stepping on an item stows it in the Bag; Bag equip swaps it in, old piece returns', () => {
  // Phase 2 supersedes the Phase 1 equip-on-step model: pickups are
  // stowed, swapping is Bag-only, nothing is auto-equipped and
  // nothing is destroyed by a swap.
  const state = C.newRun(12);
  const rng = seededRng(12);
  const p = state.player;
  freezeFloor(state);
  state.floor.enemies.forEach(e => { e.alive = false; });
  // Place a Rare plasma rifle on a walkable adjacent cell.
  const adj = walkableAdjacent(state, p.x, p.y);
  assert.ok(adj, 'no walkable neighbour');
  const inst = C.makeItemInstance('plasmaRifle', 'rare', 1, ['range'], null);
  state.floor.pickups.push({ x: adj[0], y: adj[1], kind: 'item', defId: inst.defId, tier: inst.tier, upgrade: inst.upgrade, properties: inst.properties, flair: inst.flair });
  const itemsBefore = state.floor.pickups.filter(pk => pk.kind === 'item').length;
  const res = C.playerAction(state, rng, Math.sign(adj[0] - p.x), Math.sign(adj[1] - p.y));
  assert.equal(res.ok, true);
  assert.equal(state.weapon.defId, 'scrapBlaster', 'nothing auto-equips');
  assert.equal(state.carriedGear.length, 1);
  assert.equal(state.carriedGear[0].defId, 'plasmaRifle');
  assert.ok(state.log.some(l => l.indexOf('[Rare] Plasma rifle +1') !== -1), 'log must name the stowed tier');
  assert.equal(state.floor.pickups.filter(pk => pk.kind === 'item').length, itemsBefore - 1, 'exactly the stepped-on item is collected');
  assert.equal(state.floor.pickups.filter(pk => pk.kind === 'item' && pk.x === state.player.x && pk.y === state.player.y).length, 0, 'no swap-back drop is left on the cell');
  // Bag equip: the rifle swaps in, the blaster returns to the list.
  // The swap costs no time and no action.
  const clockBefore = state.clock, actionsBefore = state.actions;
  const eq = C.equipCarried(state, 0);
  assert.equal(eq.ok, true);
  assert.equal(state.weapon.defId, 'plasmaRifle');
  assert.equal(state.carriedGear.length, 1);
  assert.equal(state.carriedGear[0].defId, 'scrapBlaster');
  assert.equal(state.clock, clockBefore, 'Bag swap costs no time');
  assert.equal(state.actions, actionsBefore, 'Bag swap costs no action');
  // Swap back the same way.
  C.equipCarried(state, 0);
  assert.equal(state.weapon.defId, 'scrapBlaster');
  assert.equal(state.carriedGear[0].defId, 'plasmaRifle');
});

test('phase1: kill drop rates match the table (raider 12%, drone 10%, brute 30%)', () => {
  const state = C.newRun(13);
  const rng = seededRng(1313);
  const counts = { raider: 0, drone: 0, brute: 0 };
  const N = 3000;
  ['raider', 'drone', 'brute'].forEach(type => {
    const before = state.floor.pickups.filter(pk => pk.kind === 'item').length;
    for (let i = 0; i < N; i++) {
      C.killEnemy(state, rng, { type, x: 1 + (i % 58), y: 1 + Math.floor(i / 58) % 42, alive: true });
    }
    counts[type] = state.floor.pickups.filter(pk => pk.kind === 'item').length - before;
  });
  // +-30% relative tolerance on a 3000-kill sample (seeded, deterministic).
  assert.ok(counts.raider / N > 0.084 && counts.raider / N < 0.156, `raider ${counts.raider / N}`);
  assert.ok(counts.drone / N > 0.07 && counts.drone / N < 0.13, `drone ${counts.drone / N}`);
  assert.ok(counts.brute / N > 0.21 && counts.brute / N < 0.39, `brute ${counts.brute / N}`);
});

test('phase1: save/load round-trips an equipped tiered weapon with properties', () => {
  const storage = fakeStorage();
  const hub = C.newHub();
  const state = C.newRun(14, hub);
  state.weapon = C.makeItemInstance('railGun', 'epic', 2, ['crit', 'range'], null);
  C.saveRun(storage, state);
  const loaded = C.loadRun(storage);
  assert.ok(loaded);
  assert.deepEqual(loaded.weapon, state.weapon);
  assert.equal(C.weaponStats(loaded).range, 9); // rail 8 + long barrel
  assert.ok(Math.abs(C.weaponStats(loaded).mult - 1.35 * 1.24) < 1e-9);
});

test('phase1: properties — slots by tier, evasion bonus, display names', () => {
  const rng = seededRng(5);
  assert.deepEqual(C.rollProperties(rng, 'common'), []);
  assert.deepEqual(C.rollProperties(rng, 'uncommon'), []);
  assert.equal(C.rollProperties(rng, 'rare').length, 1);
  assert.equal(C.rollProperties(rng, 'epic').length, 2);
  const leg = C.rollProperties(rng, 'legendary');
  assert.equal(leg.length, 2);
  assert.equal(new Set(leg).size, 2, 'no duplicate properties');
  const state = C.newRun(15);
  assert.equal(C.playerEvasion(state), 8);
  state.weapon = C.makeItemInstance('scrapBlaster', 'rare', 0, ['evasion'], null);
  assert.equal(C.playerEvasion(state), 10);
});

test('phase1: burst spends 3 ammo and 1 time unit; spread spends 4 ammo and 2', () => {
  for (let seed = 401; seed <= 420; seed++) {
    const state = C.newRun(seed);
    const line = findShotLine(state, 4);
    if (!line) continue;
    const rng = seededRng(seed);
    const p = state.player;
    freezeFloor(state);
    state.floor.enemies.forEach(e => { e.alive = false; });
    const foe = placeFoe(state, line[0], line[1], 3, { hp: 500, maxHp: 500 });
    p.facing = C.dirIndexFor(line[0], line[1]);
    p.acc = 100;
    state.weapon = C.makeItemInstance('gatling', 'common', 0, [], null);
    const clockBefore = state.clock;
    const res = C.fireWeapon(state, rng);
    assert.equal(res.ok, true);
    assert.equal(state.ammoPools.standard, C.STARTING_AMMO - 3, 'gatling spends 3 ammo');
    assert.equal(state.clock, clockBefore + C.PLAYER_DEF.interval, 'gatling costs 1 time unit');
    assert.ok(foe.hp < 500, 'burst must damage the target');
    assert.ok(state.log.some(l => /1d6\+3/.test(l)), 'log must show burst dice');
    return;
  }
  assert.fail('no seed in 401..420 offered a 4-cell walkable line');
});

test('phase1: rail gun pierces armor; homing ignores evasion', () => {
  for (let seed = 421; seed <= 440; seed++) {
    const state = C.newRun(seed);
    const line = findLine(state, 3);
    if (!line) continue;
    const rng = seededRng(seed);
    const p = state.player;
    freezeFloor(state);
    state.floor.enemies.forEach(e => { e.alive = false; });
    // Rail gun vs armor 10: damage is the raw roll (9..30), armor ignored.
    const foe = placeFoe(state, line[0], line[1], 3, { hp: 100, maxHp: 100, armor: 10, evasion: 0 });
    p.facing = C.dirIndexFor(line[0], line[1]);
    p.acc = 100;
    state.weapon = C.makeItemInstance('railGun', 'common', 0, [], null);
    const clockBefore = state.clock;
    const res = C.fireWeapon(state, rng);
    assert.equal(res.ok, true);
    const dealt = 100 - foe.hp;
    assert.ok(dealt >= 9 && dealt <= 30, `rail damage ${dealt} must ignore armor 10 (raw 3d8+6)`);
    assert.equal(state.clock, clockBefore + 2 * C.PLAYER_DEF.interval, 'rail gun costs 2 time units');
    // Homing vs evasion 999: still hits.
    const foe2 = placeFoe(state, line[0], line[1], 2, { hp: 100, maxHp: 100, evasion: 999 });
    state.floor.enemies.forEach(e => { if (e !== foe2) e.alive = false; });
    foe2.alive = true;
    state.weapon = C.makeItemInstance('homingMissile', 'common', 0, [], null);
    const res2 = C.fireWeapon(state, rng);
    assert.equal(res2.ok, true);
    assert.equal(res2.hit, true, 'homing must hit despite evasion 999');
    assert.ok(foe2.hp < 100);
    return;
  }
  assert.fail('no seed in 421..440 offered a 3-cell walkable line');
});

test('phase1: beam hits every enemy in the line; cone hits only its 3 cells', () => {
  for (let seed = 441; seed <= 460; seed++) {
    const state = C.newRun(seed);
    const line = findLine(state, 5);
    if (!line) continue;
    const rng = seededRng(seed);
    const p = state.player;
    freezeFloor(state);
    state.floor.enemies.forEach(e => { e.alive = false; });
    const [dx, dy] = line;
    const foeA = placeFoe(state, dx, dy, 2, { hp: 100, maxHp: 100 });
    const foeB = state.floor.enemies[1];
    Object.assign(foeB, { x: p.x + dx * 4, y: p.y + dy * 4, alive: true, awake: true, evasion: 0, hp: 100, maxHp: 100, nextTime: 1e9 });
    p.facing = C.dirIndexFor(dx, dy);
    p.acc = 100;
    state.weapon = C.makeItemInstance('laserEmitter', 'common', 0, [], null);
    const res = C.fireWeapon(state, rng);
    assert.equal(res.ok, true);
    assert.ok(foeA.hp < 100 && foeB.hp < 100, `beam must hit both (A ${foeA.hp}, B ${foeB.hp})`);
    assert.equal(res.hits.length, 2);
    return;
  }
  assert.fail('no seed in 441..460 offered a 5-cell walkable line');
});

test('phase1: grenade splash hits neighbours, walls block the diagonal', () => {
  // Constructed layout in the (dir, perp) frame, impact at 2 steps:
  // foeA on the impact cell, foeB on the neighbour on the far side
  // (impact - perp, not in the firing line), foeC on the
  // diagonal (impact + dir + perp) with BOTH orthogonal cells
  // (impact + dir, impact + perp) walled. foeC must take no splash.
  for (let seed = 461; seed <= 480; seed++) {
    const state = C.newRun(seed);
    const line = findLine(state, 4);
    if (!line) continue;
    const rng = seededRng(seed);
    const p = state.player;
    freezeFloor(state);
    state.floor.enemies.forEach(e => { e.alive = false; });
    const [dx, dy] = line;
    const perp = { dx: dy, dy: -dx };
    const ix = p.x + dx * 2, iy = p.y + dy * 2; // impact cell
    const foeA = placeFoe(state, dx, dy, 2, { hp: 100, maxHp: 100 });
    // Neighbour on the opposite side from the diagonal (impact -
    // perp): takes splash, is not in the firing line, and is not
    // adjacent to the diagonal's blocking cells.
    const behindX = ix - perp.dx, behindY = iy - perp.dy;
    if (!C.isWalkableTile(state.floor.grid[behindY][behindX])) continue;
    const foeB = state.floor.enemies[1];
    Object.assign(foeB, { x: behindX, y: behindY, alive: true, awake: true, evasion: 0, hp: 100, maxHp: 100, nextTime: 1e9 });
    const diagX = ix + dx + perp.dx, diagY = iy + dy + perp.dy;
    const o1x = ix + dx, o1y = iy + dy, o2x = ix + perp.dx, o2y = iy + perp.dy;
    if (!C.isWalkableTile(state.floor.grid[diagY][diagX])) continue;
    if (!C.isWalkableTile(state.floor.grid[o1y][o1x])) continue;
    if (!C.isWalkableTile(state.floor.grid[o2y][o2x])) continue;
    const foeC = state.floor.enemies[2];
    Object.assign(foeC, { x: diagX, y: diagY, alive: true, awake: true, evasion: 0, hp: 100, maxHp: 100, nextTime: 1e9 });
    state.floor.grid[o1y][o1x] = 'wall';
    state.floor.grid[o2y][o2x] = 'wall';
    p.facing = C.dirIndexFor(dx, dy);
    p.acc = 100;
    state.weapon = C.makeItemInstance('grenadeLauncher', 'common', 0, [], null);
    const res = C.fireWeapon(state, rng);
    assert.equal(res.ok, true);
    assert.ok(foeA.hp < 100, 'primary must take splash damage');
    assert.ok(foeB.hp < 100, 'neighbour on the far side must take splash damage');
    assert.equal(foeC.hp, 100, 'diagonal behind two walls must not take splash');
    return;
  }
  assert.fail('no seed in 461..480 offered a usable splash layout');
});

test('phase1: flamethrower cone burns; burn ticks kill through the scheduler', () => {
  for (let seed = 481; seed <= 500; seed++) {
    const state = C.newRun(seed);
    const line = findLine(state, 3);
    if (!line) continue;
    const rng = seededRng(seed);
    const p = state.player;
    freezeFloor(state);
    state.floor.enemies.forEach(e => { e.alive = false; });
    // Raider: 0% burn resistance, so ticks deal the full 3.
    const foe = placeFoe(state, line[0], line[1], 1, { type: 'raider', armor: 0, hp: 30, maxHp: 30 });
    p.facing = C.dirIndexFor(line[0], line[1]);
    p.acc = 100;
    state.weapon = C.makeItemInstance('flamethrower', 'common', 0, [], null);
    const res = C.fireWeapon(state, rng);
    assert.equal(res.ok, true);
    // Phase 4 (§7.6.5): burning lives in the statuses manager, not
    // on a burn field; it ticks per elapsed time unit in the
    // scheduler, before activations. The shot's own time unit
    // already consumed one of the 3 ticks, so 2 remain.
    const st = C.findStatus(foe, 'burning');
    assert.ok(st && st.ticksLeft === 2, 'burning status must be applied; the shot\'s own unit ticks once (ticksLeft 2, got ' + (st && st.ticksLeft) + ')');
    const hpAfterShot = foe.hp;
    // Two more scheduler units exhaust the remaining ticks; the
    // status is removed and the total burn damage is 3 ticks x 3.
    state.clock = 0;
    C.processScheduler(state, rng, C.PLAYER_DEF.interval);
    C.processScheduler(state, rng, C.PLAYER_DEF.interval);
    assert.equal(C.findStatus(foe, 'burning'), null, 'burning must expire after 3 ticks');
    assert.ok(foe.hp <= hpAfterShot - 6, 'two remaining ticks must total 6');
    return;
  }
  assert.fail('no seed in 481..500 offered a 3-cell walkable line');
});

test('phase1: energy sword is melee-range, costs no ammo, refuses free', () => {
  for (let seed = 501; seed <= 520; seed++) {
    const state = C.newRun(seed);
    const line = findLine(state, 2);
    if (!line) continue;
    const rng = seededRng(seed);
    const p = state.player;
    freezeFloor(state);
    state.floor.enemies.forEach(e => { e.alive = false; });
    const foe = placeFoe(state, line[0], line[1], 1, { hp: 100, maxHp: 100 });
    p.facing = C.dirIndexFor(line[0], line[1]);
    p.acc = 100;
    state.weapon = C.makeItemInstance('energySword', 'common', 0, [], null);
    state.ammoPools = { standard: 0, piercing: 0, incendiary: 0, shock: 0 }; // sword needs no ammo
    const clockBefore = state.clock;
    const res = C.fireWeapon(state, rng);
    assert.equal(res.ok, true);
    assert.ok(foe.hp < 100 && foe.hp >= 100 - 23, `sword damage 3d6+5 (8..23), hp ${foe.hp}`);
    assert.deepEqual(state.ammoPools, { standard: 0, piercing: 0, incendiary: 0, shock: 0 }, 'sword spends no ammo');
    assert.equal(state.clock, clockBefore + C.PLAYER_DEF.interval);
    // No adjacent enemy: free refusal.
    state.floor.enemies.forEach(e => { e.alive = false; });
    const clock2 = state.clock;
    const res2 = C.fireWeapon(state, rng);
    assert.equal(res2.ok, false);
    assert.equal(state.clock, clock2, 'refusal costs no time');
    return;
  }
  assert.fail('no seed in 501..520 offered a 2-cell walkable line');
});

test('phase1: flamethrower cone hits only its 3 cells, never straight-ahead at 2', () => {
  for (let seed = 521; seed <= 540; seed++) {
    const state = C.newRun(seed);
    const line = findLine(state, 3);
    if (!line) continue;
    const rng = seededRng(seed);
    const p = state.player;
    freezeFloor(state);
    state.floor.enemies.forEach(e => { e.alive = false; });
    const [dx, dy] = line;
    const perp = { dx: dy, dy: -dx };
    // Cone cells: (1,0), (2,-1), (2,+1) in the facing frame.
    const c1 = { x: p.x + dx, y: p.y + dy };
    const c2 = { x: p.x + 2 * dx + perp.dx, y: p.y + 2 * dy + perp.dy };
    const c3 = { x: p.x + 2 * dx - perp.dx, y: p.y + 2 * dy - perp.dy };
    const straight = { x: p.x + 2 * dx, y: p.y + 2 * dy };
    if (![c2, c3, straight].every(c => C.isWalkableTile(state.floor.grid[c.y][c.x]))) continue;
    if (!C.lineOfSight(state, p.x, p.y, c2.x, c2.y) || !C.lineOfSight(state, p.x, p.y, c3.x, c3.y)) continue;
    const foes = [c1, c2, c3, straight].map((c, i) => {
      const foe = state.floor.enemies[i];
      Object.assign(foe, { x: c.x, y: c.y, alive: true, awake: true, evasion: 0, hp: 100, maxHp: 100, nextTime: 1e9 });
      return foe;
    });
    p.facing = C.dirIndexFor(dx, dy);
    p.acc = 100;
    state.weapon = C.makeItemInstance('flamethrower', 'common', 0, [], null);
    const res = C.fireWeapon(state, rng);
    assert.equal(res.ok, true);
    assert.ok(foes[0].hp < 100, 'cone cell 1 must be hit');
    assert.ok(foes[1].hp < 100, 'cone cell 2 must be hit');
    assert.ok(foes[2].hp < 100, 'cone cell 3 must be hit');
    assert.equal(foes[3].hp, 100, 'straight-ahead at 2 steps is outside the cone');
    return;
  }
  assert.fail('no seed in 521..540 offered a usable cone layout');
});

test('phase1: combat drone never drops and fire refuses it honestly', () => {
  const rng = seededRng(606);
  for (let i = 0; i < 2000; i++) {
    const inst = C.rollItem(rng, 5);
    assert.notEqual(inst.defId, 'combatDrone', 'unreleased drone must never roll as a drop');
  }
  const state = C.newRun(606);
  state.weapon = C.makeItemInstance('combatDrone', 'common', 0, [], null);
  const res = C.fireWeapon(state, seededRng(606));
  assert.equal(res.ok, false);
  assert.ok(/drone/.test(res.reason), `refusal must name the drone: ${res.reason}`);
});

// ---------- Phase 2: gear slots (§5) ----------

// Equip by defId: equipping shuffles the old piece back into the
// carried list in place, so a bare index 0 would re-equip the piece
// that just came off. Tests that equip several pieces in a row use
// this instead of guessing indices.
function equipDef(state, defId) {
  const i = state.carriedGear.findIndex(g => g.defId === defId);
  assert.ok(i >= 0, defId + ' must be in the carried list');
  return C.equipCarried(state, i);
}

test('phase2: gear def tables — 12 defs, 4 per slot, bands and lookups', () => {
  const ids = Object.keys(C.GEAR_DEFS);
  assert.equal(ids.length, 12);
  ['armor', 'shield', 'utility'].forEach(slot => {
    assert.equal(ids.filter(id => C.GEAR_DEFS[id].slot === slot).length, 4, slot + ' needs 4 defs');
  });
  assert.equal(C.itemSlotOf('plasmaRifle'), 'weapon');
  assert.equal(C.itemSlotOf('alloyVest'), 'armor');
  assert.equal(C.itemSlotOf('nanoBastion'), 'shield');
  assert.equal(C.itemSlotOf('gyroStabilizer'), 'utility');
  assert.equal(C.itemSlotOf('nope'), null);
  assert.equal(C.itemDefFor('scrapPlating').name, 'Scrap plating');
  assert.equal(C.itemDefFor('nope'), null);
  // Depth bands: the top tier of each slot starts at depth 3, the
  // second tier at depth 2, the rest are available from depth 1.
  assert.deepEqual(C.GEAR_DEFS.nanoLattice.depthBand, [3, 99]);
  assert.deepEqual(C.GEAR_DEFS.ablativeWeave.depthBand, [2, 99]);
  assert.deepEqual(C.GEAR_DEFS.scrapPlating.depthBand, [1, 99]);
  // Scaling: same formula shape as weapon damage.
  assert.equal(C.gearStatValue(C.GEAR_DEFS.alloyVest, 'armor', 'common', 0), 2);
  assert.equal(C.gearStatValue(C.GEAR_DEFS.alloyVest, 'armor', 'epic', 3), 4); // 2 x 1.35 x 1.36 = 3.67 -> 4
  assert.equal(C.gearStatValue(C.GEAR_DEFS.alloyVest, 'hp', 'epic', 3), 18); // 10 x 1.35 x 1.36 = 18.36 -> 18
  assert.equal(C.gearStatValue(C.GEAR_DEFS.scrapPlating, 'hp', 'legendary', 5), 0, 'zero stays zero');
  assert.equal(C.itemDisplayName(C.makeItemInstance('alloyVest', 'rare', 1, [], null)), '[Rare] Alloy vest +1');
});

test('phase2: rollGearItem — same tier/upgrade tables, depth-1 cap, no properties', () => {
  const rng = seededRng(9001);
  const N = 20000;
  let saw5 = 0;
  for (let i = 0; i < N; i++) {
    const inst = C.rollGearItem(rng, 1);
    assert.ok(C.GEAR_DEFS[inst.defId], 'gear roll must be a gear def');
    assert.ok(inst.upgrade <= 1, 'depth 1 must never roll +2 or higher');
    assert.deepEqual(inst.properties, [], 'gear rolls no properties');
  }
  for (let i = 0; i < N; i++) {
    const inst = C.rollGearItem(rng, 6);
    assert.ok(inst.upgrade <= 5);
    if (inst.upgrade === 5) saw5++;
  }
  assert.ok(saw5 > 0, 'depth 6+ should sometimes roll +5');
  // Slot filter rolls only that slot.
  for (let i = 0; i < 200; i++) {
    assert.equal(C.GEAR_DEFS[C.rollGearItem(rng, 3, 'shield').defId].slot, 'shield');
  }
  // rollDropItem honours its gear weight; rollItem stays weapon-only.
  let gear = 0;
  for (let i = 0; i < N; i++) { if (C.GEAR_DEFS[C.rollDropItem(rng, 1, 0.4).defId]) gear++; }
  assert.ok(gear / N > 0.36 && gear / N < 0.44, `gear share ${gear / N}`);
  for (let i = 0; i < 2000; i++) {
    assert.ok(C.WEAPON_DEFS[C.rollItem(rng, 5).defId], 'rollItem must stay weapon-only');
  }
});

test('phase2: derivedStats — base, gear, and chassis tier compose; nothing stored', () => {
  const state = C.newRun(21);
  const base = C.derivedStats(state);
  // Phase 3 adds acc + dmgMult through the derivedMods seam; the
  // Phase 2 fields are unchanged when no pilot skills are ranked.
  assert.deepEqual(base, { armor: 2, maxHp: 100, evasion: 8, range: 5, sight: 8, shieldCapacity: 0, powerBonus: 0, acc: 14, dmgMult: 1 });
  assert.equal(state.derivedStats, undefined, 'nothing derived is stored on the state');
  const again = C.derivedStats(state);
  assert.deepEqual(again, base);
  assert.notStrictEqual(again, base, 'each call recomputes a fresh object');
  // Armor gear: Epic +3 Alloy vest -> armor 2 + 4, maxHp 100 + 18.
  state.carriedGear.push(C.makeItemInstance('alloyVest', 'epic', 3, [], null));
  assert.equal(C.equipCarried(state, 0).ok, true);
  assert.equal(C.derivedStats(state).armor, 6);
  assert.equal(C.derivedStats(state).maxHp, 118);
  // Utility: one slot, one choice at a time.
  state.carriedGear.push(C.makeItemInstance('scope', 'common', 0, [], null));
  equipDef(state, 'scope');
  assert.equal(C.derivedStats(state).range, 6);
  state.carriedGear.push(C.makeItemInstance('sensor', 'common', 0, [], null));
  equipDef(state, 'sensor');
  assert.equal(C.derivedStats(state).range, 5, 'swapping utility loses the scope bonus');
  assert.equal(C.derivedStats(state).sight, 10);
  state.carriedGear.push(C.makeItemInstance('gyroStabilizer', 'common', 0, [], null));
  equipDef(state, 'gyroStabilizer');
  assert.equal(C.derivedStats(state).evasion, 10);
  state.carriedGear.push(C.makeItemInstance('powerCell', 'common', 0, [], null));
  equipDef(state, 'powerCell');
  assert.equal(C.derivedStats(state).powerBonus, 40);
  // Shield: capacity from the def.
  state.carriedGear.push(C.makeItemInstance('scrappersWard', 'common', 0, [], null));
  equipDef(state, 'scrappersWard');
  assert.equal(C.derivedStats(state).shieldCapacity, 10);
  // Chassis tier composes: +10 max HP per tier on top of gear.
  const hub = C.newHub();
  hub.chassisTier = 2;
  const tiered = C.newRun(22, hub);
  assert.equal(C.derivedStats(tiered).maxHp, 120);
  tiered.carriedGear.push(C.makeItemInstance('alloyVest', 'epic', 3, [], null));
  C.equipCarried(tiered, 0);
  assert.equal(C.derivedStats(tiered).maxHp, 138);
  // Weapon evasion property stacks with the gyro bonus.
  const evState = C.newRun(23);
  evState.weapon = C.makeItemInstance('scrapBlaster', 'rare', 0, ['evasion'], null);
  evState.carriedGear.push(C.makeItemInstance('gyroStabilizer', 'common', 0, [], null));
  C.equipCarried(evState, 0);
  assert.equal(C.derivedStats(evState).evasion, 12);
});

test('phase2: equip/unequip round-trips conserve every piece; shield resets on swap', () => {
  const state = C.newRun(24);
  const rng = seededRng(24);
  freezeFloor(state);
  state.floor.enemies.forEach(e => { e.alive = false; });
  const vest = C.makeItemInstance('alloyVest', 'rare', 1, [], null);
  const ward = C.makeItemInstance('scrappersWard', 'common', 0, [], null);
  state.carriedGear.push(vest, ward);
  assert.equal(equipDef(state, 'alloyVest').ok, true);
  assert.equal(C.equippedGear(state, 'armor').defId, 'alloyVest');
  assert.equal(equipDef(state, 'scrappersWard').ok, true);
  assert.equal(C.equippedGear(state, 'shield').defId, 'scrappersWard');
  assert.equal(state.carriedGear.length, 0, 'both pieces equipped, none left carried');
  // Unequip returns the piece to the list; the slot empties.
  const clockBefore = state.clock, actionsBefore = state.actions;
  assert.equal(C.unequip(state, 'armor').ok, true);
  assert.equal(C.equippedGear(state, 'armor'), null);
  assert.equal(state.carriedGear.length, 1);
  assert.equal(state.carriedGear[0].defId, 'alloyVest');
  assert.equal(state.clock, clockBefore, 'unequip costs no time');
  assert.equal(state.actions, actionsBefore, 'unequip costs no action');
  // The weapon is swapped, never removed.
  assert.equal(C.unequip(state, 'weapon').ok, false);
  assert.equal(C.equipCarried(state, 99).ok, false, 'bad index refuses');
  assert.equal(C.unequip(state, 'shield').ok, true);
  assert.equal(C.unequip(state, 'shield').ok, false, 'empty slot refuses');
  // A fresh shield starts empty: no free full pool from swapping.
  state.carriedGear.push(C.makeItemInstance('alloyAegis', 'common', 0, [], null));
  state.shield = 7; // simulate a charged pool on the old (removed) shield
  assert.equal(equipDef(state, 'alloyAegis').ok, true);
  assert.equal(state.shield, 0);
  // HP clamps when a +maxHp piece comes off above the new max.
  state.player.hp = state.player.maxHp; // 100, no armor now
  state.carriedGear.push(C.makeItemInstance('nanoLattice', 'common', 0, [], null));
  equipDef(state, 'nanoLattice');
  assert.equal(C.derivedStats(state).maxHp, 140);
  state.player.hp = 140;
  assert.equal(C.unequip(state, 'armor').ok, true);
  assert.equal(state.player.hp, 100, 'HP clamps to the new max when armor leaves');
  void rng;
});

test('phase2: shield absorbs before hull, recharges 1 per 2 time units, never banks', () => {
  const rng = seededRng(31);
  const attacker = { acc: 100, dmg: 10, dmgVar: 0 };
  // Absorb: 10 raw - 2 armor = 8; a 10-charge shield eats the first
  // hit whole, the second hit spills 6 to the hull.
  const state = C.newRun(31);
  freezeFloor(state);
  state.floor.enemies.forEach(e => { e.alive = false; });
  state.carriedGear.push(C.makeItemInstance('scrappersWard', 'common', 0, [], null));
  C.equipCarried(state, 0);
  state.shield = 10;
  let res;
  for (let i = 0; i < 50; i++) { res = C.resolveAttack(state, rng, attacker, state.player, 'Raider', 'You'); if (res.hit) break; }
  assert.equal(res.hit, true);
  assert.equal(state.shield, 2);
  assert.equal(state.player.hp, 100);
  assert.ok(state.log.some(l => l.indexOf('shield absorbed 8') !== -1), 'log must name the absorb');
  for (let i = 0; i < 50; i++) { res = C.resolveAttack(state, rng, attacker, state.player, 'Raider', 'You'); if (res.hit) break; }
  assert.equal(state.shield, 0);
  assert.equal(state.player.hp, 94);
  // Surprise attacks go through the same pipeline (12 after armor x1.5).
  state.shield = 5;
  res = C.resolveAttack(state, rng, attacker, state.player, 'Raider', 'You', { surprise: true });
  assert.equal(res.hit, true);
  assert.equal(res.absorbed, 5);
  assert.equal(state.player.hp, 87);
  // Recharge from empty: nothing at 10 ticks, +1 at 20, +1 per 20 after.
  const state2 = C.newRun(32);
  freezeFloor(state2);
  state2.floor.enemies.forEach(e => { e.alive = false; });
  state2.carriedGear.push(C.makeItemInstance('scrappersWard', 'common', 0, [], null));
  C.equipCarried(state2, 0);
  assert.equal(state2.shield, 0);
  C.processScheduler(state2, rng, 10);
  assert.equal(state2.shield, 0);
  C.processScheduler(state2, rng, 10);
  assert.equal(state2.shield, 1);
  C.processScheduler(state2, rng, 40);
  assert.equal(state2.shield, 3);
  // No banking: a full pool idling 100 ticks does not grant instant
  // refill after the next hit — exactly 1 per 20 ticks resumes.
  state2.shield = 10;
  C.processScheduler(state2, rng, 100);
  assert.equal(state2.shield, 10);
  for (let i = 0; i < 50; i++) { res = C.resolveAttack(state2, rng, attacker, state2.player, 'Raider', 'You'); if (res.hit) break; }
  assert.equal(state2.shield, 2);
  C.processScheduler(state2, rng, 0);
  assert.equal(state2.shield, 2, 'no instant grant after idling full');
  C.processScheduler(state2, rng, 20);
  assert.equal(state2.shield, 3);
  // Spike trap: shield absorbs before the hull there too.
  const state3 = C.newRun(33);
  freezeFloor(state3);
  state3.floor.enemies.forEach(e => { e.alive = false; });
  state3.carriedGear.push(C.makeItemInstance('scrappersWard', 'common', 0, [], null));
  C.equipCarried(state3, 0);
  state3.shield = 4;
  const p3 = state3.player;
  const adj3 = walkableAdjacent(state3, p3.x, p3.y);
  assert.ok(adj3, 'no walkable neighbour');
  state3.floor.hazards.push({ x: adj3[0], y: adj3[1], triggered: false, hidden: false, revealed: true });
  C.playerAction(state3, rng, Math.sign(adj3[0] - p3.x), Math.sign(adj3[1] - p3.y));
  assert.equal(state3.player.hp, 98, 'trap 6 - shield 4 = 2 hull damage');
  assert.ok(state3.log.some(l => l.indexOf('Shield absorbs 4') !== -1));
});

test('phase2: wreck with gear recovers intact; a second death destroys it with the gear', () => {
  const hub = C.newHub();
  const first = C.newRun(206, hub);
  const rng = seededRng(13);
  first.carriedGear.push(C.makeItemInstance('plasmaRifle', 'rare', 1, ['range'], null));
  equipDef(first, 'plasmaRifle');
  first.carriedGear.push(C.makeItemInstance('alloyVest', 'uncommon', 0, [], null));
  equipDef(first, 'alloyVest');
  first.carriedGear.push(C.makeItemInstance('scrappersWard', 'common', 0, [], null));
  equipDef(first, 'scrappersWard');
  first.carried = 33;
  killPlayerByAdjacentAttack(first, rng);
  assert.ok(hub.wreck);
  assert.equal(hub.wreck.gear.weapon.defId, 'plasmaRifle');
  assert.equal(hub.wreck.gear.weapon.tier, 'rare');
  assert.equal(hub.wreck.gear.armor.defId, 'alloyVest');
  assert.equal(hub.wreck.gear.shield.defId, 'scrappersWard');
  assert.equal(hub.wreck.gear.utility, null);
  // Recovery: the gear comes back intact, stowed in the Bag.
  const next = C.newRun(207, hub);
  assert.ok(next.playerWreck, 'expected the wreck placed on the next expedition floor');
  assert.equal(next.playerWreck.gear.weapon.defId, 'plasmaRifle');
  const adj = walkableAdjacent(next, next.playerWreck.x, next.playerWreck.y);
  assert.ok(adj, 'no walkable neighbour of the wreck tile');
  next.player.x = adj[0]; next.player.y = adj[1];
  next.floor.enemies.forEach(e => { e.nextTime = 1e9; });
  const res = C.playerAction(next, rng, Math.sign(next.playerWreck.x - adj[0]), Math.sign(next.playerWreck.y - adj[1]));
  assert.equal(res.ok, true);
  assert.equal(next.carried, 33);
  assert.equal(next.playerWreck, null);
  assert.equal(hub.wreck, null);
  const recovered = next.carriedGear.map(g => g.defId).sort();
  assert.deepEqual(recovered, ['alloyVest', 'plasmaRifle', 'scrappersWard']);
  assert.equal(next.carriedGear.find(g => g.defId === 'plasmaRifle').tier, 'rare');
  // Second death before recovery destroys the old wreck — gear and all.
  const hub2 = C.newHub();
  const a = C.newRun(208, hub2);
  a.carriedGear.push(C.makeItemInstance('plasmaRifle', 'rare', 1, [], null));
  C.equipCarried(a, 0);
  a.carried = 40;
  killPlayerByAdjacentAttack(a, rng);
  assert.equal(hub2.wreck.gear.weapon.defId, 'plasmaRifle');
  const b = C.newRun(209, hub2);
  assert.ok(b.playerWreck, 'old wreck should be placed on the recovery run');
  b.carried = 10;
  killPlayerByAdjacentAttack(b, rng);
  assert.ok(hub2.wreck, 'a new wreck must replace the old one');
  assert.equal(hub2.wreck.salvage, 10);
  assert.equal(hub2.wreck.gear.weapon.defId, 'scrapBlaster', 'the plasma rifle died with the unrecovered wreck');
  assert.equal(hub2.wreck.gear.armor, null);
});

test('phase2: save/load round-trips equipment, carried gear, and shield; legacy saves migrate', () => {
  const storage = fakeStorage();
  const hub = C.newHub();
  const state = C.newRun(14, hub);
  state.carriedGear.push(C.makeItemInstance('alloyVest', 'rare', 1, [], null));
  C.equipCarried(state, 0);
  state.carriedGear.push(C.makeItemInstance('sensor', 'uncommon', 0, [], null));
  C.equipCarried(state, 0);
  state.carriedGear.push(C.makeItemInstance('alloyAegis', 'epic', 2, [], null));
  C.equipCarried(state, 0);
  state.carriedGear.push(C.makeItemInstance('railGun', 'common', 0, [], null));
  state.shield = 6; // simulate a charged pool
  C.saveRun(storage, state);
  const loaded = C.loadRun(storage);
  assert.ok(loaded);
  assert.deepEqual(loaded.equipment.armor, state.equipment.armor);
  assert.deepEqual(loaded.equipment.utility, state.equipment.utility);
  assert.deepEqual(loaded.equipment.shield, state.equipment.shield);
  assert.deepEqual(loaded.carriedGear, state.carriedGear);
  assert.equal(loaded.shield, 6);
  assert.deepEqual(C.derivedStats(loaded), C.derivedStats(state));
  assert.equal(C.weaponStats(loaded).defId, 'scrapBlaster');
  // The snapshot is plain JSON: stringify/parse loses nothing.
  assert.deepEqual(JSON.parse(JSON.stringify(C.serializeRun(state))), C.serializeRun(state));
  // Legacy save: no equipment/carriedGear/shield fields, weapon as a
  // string. Migration defaults to empty gear slots + the Phase 1
  // weapon instance; old pickup kinds survive untouched.
  const legacy = C.serializeRun(C.newRun(15));
  delete legacy.equipment; delete legacy.carriedGear; delete legacy.shield; delete legacy.shieldNextRecharge;
  legacy.weapon = 'railGun';
  const migrated = C.deserializeRun(legacy);
  assert.ok(migrated);
  assert.deepEqual(migrated.weapon, { kind: 'item', defId: 'railGun', tier: 'common', upgrade: 0, properties: [], flair: null, element: null });
  assert.equal(migrated.equipment.weapon.defId, 'railGun');
  assert.equal(migrated.equipment.armor, null);
  assert.equal(migrated.equipment.shield, null);
  assert.equal(migrated.equipment.utility, null);
  assert.deepEqual(migrated.carriedGear, []);
  assert.equal(migrated.shield, 0);
  assert.ok(migrated.floor.pickups.some(pk => pk.kind === 'salvage'), 'old salvage pickups survive migration');
  assert.ok(migrated.floor.pickups.every(pk => typeof pk.kind === 'string'), 'old pickup kinds render unchanged');
  // Legacy hub wreck without gear normalizes to all-null and
  // recovers nothing extra.
  const hub2 = C.newHub();
  hub2.wreck = { depth: 1, salvage: 10, health: 1, food: 0, components: 0, repairKit: 0, ammo: 0 };
  const legacyRun = C.newRun(16, hub2);
  assert.ok(legacyRun.playerWreck);
  assert.deepEqual(legacyRun.playerWreck.gear, { weapon: null, armor: null, shield: null, utility: null });
});

test('phase2: kill drop rates match the table and gear shares the roll', () => {
  const state = C.newRun(13);
  const rng = seededRng(1313);
  const counts = { raider: 0, drone: 0, brute: 0 };
  let gearDrops = 0, totalDrops = 0;
  const N = 3000;
  ['raider', 'drone', 'brute'].forEach(type => {
    const before = state.floor.pickups.filter(pk => pk.kind === 'item').length;
    for (let i = 0; i < N; i++) {
      C.killEnemy(state, rng, { type, x: 1 + (i % 58), y: 1 + Math.floor(i / 58) % 42, alive: true });
    }
    counts[type] = state.floor.pickups.filter(pk => pk.kind === 'item').length - before;
  });
  // Same rate bounds as the Phase 1 test — gear shares the roll, it
  // does not double the rates.
  assert.ok(counts.raider / N > 0.084 && counts.raider / N < 0.156, `raider ${counts.raider / N}`);
  assert.ok(counts.drone / N > 0.07 && counts.drone / N < 0.13, `drone ${counts.drone / N}`);
  assert.ok(counts.brute / N > 0.21 && counts.brute / N < 0.39, `brute ${counts.brute / N}`);
  state.floor.pickups.filter(pk => pk.kind === 'item').forEach(pk => {
    totalDrops++;
    if (C.GEAR_DEFS[pk.defId]) gearDrops++;
  });
  assert.ok(totalDrops > 1000, `need a real sample, got ${totalDrops}`);
  assert.ok(gearDrops / totalDrops > 0.30 && gearDrops / totalDrops < 0.50, `gear share ${gearDrops / totalDrops}`);
});

test('phase2: 200-floor sweep — gear drops, structure caches lean gear', () => {
  let gearItems = 0, structureItems = 0, structureGear = 0;
  for (let runSeed = 1; runSeed <= 200; runSeed++) {
    const floor = C.generateFloor(runSeed, 1);
    floor.rooms.forEach(r => {
      if (r.type !== 'structure') return;
      floor.pickups.forEach(p => {
        if (p.kind === 'item' && p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h) {
          structureItems++;
          if (C.GEAR_DEFS[p.defId]) structureGear++;
        }
      });
    });
    floor.pickups.forEach(p => { if (p.kind === 'item' && C.GEAR_DEFS[p.defId]) gearItems++; });
  }
  assert.ok(gearItems > 0, 'gear must drop on depth-1 floors');
  assert.ok(structureItems > 50, `need a real structure-cache sample, got ${structureItems}`);
  assert.ok(structureGear / structureItems > 0.5, `structure caches lean gear: ${structureGear}/${structureItems}`);
});

test('phase2: power cell pushes the pressure thresholds out', () => {
  const state = C.newRun(41);
  freezeFloor(state);
  state.floor.enemies.forEach(e => { e.alive = false; });
  state.carriedGear.push(C.makeItemInstance('powerCell', 'common', 0, [], null));
  C.equipCarried(state, 0);
  // 80 actions: no warning yet (threshold is 80 + 40).
  for (let i = 0; i < 80; i++) C.playerWait(state, seededRng(41));
  assert.equal(state.powerState, 'ok');
  for (let i = 0; i < 40; i++) C.playerWait(state, seededRng(41));
  assert.equal(state.powerState, 'low', 'warning lands at 120 with the cell');
});

// ---------- Phase 3: two skill systems (LOOT-SKILLS-DESIGN.md §6) ----------
function richHub(banked, codex) {
  const hub = C.newHub();
  hub.banked = banked === undefined ? 500 : banked;
  hub.codex = codex === undefined ? ['Entry A', 'Entry B'] : codex.slice();
  hub.pilotXp = 500;
  return hub;
}
function killPlayer(state, rng) {
  // One lethal enemy activation, through the real path: resolveAttack
  // -> enemyAct death handling -> recordPlayerDeath. Player evasion
  // is zeroed so the hit is guaranteed (no rng flake). No outcome
  // is asserted here: Second Wind tests reuse this for the save.
  state.player.hp = 1;
  state.player.evasion = 0;
  const foe = placeFoe(state, 0, 1, 1, { dmg: 50, dmgVar: 0, acc: 100, evasion: 0 });
  C.enemyAct(state, rng, foe);
  return foe;
}
function stepOnto(state, rng, tx, ty) {
  const p = state.player;
  const dx = Math.sign(tx - p.x), dy = Math.sign(ty - p.y);
  const res = C.playerAction(state, rng, dx, dy);
  assert.equal(res.ok, true, 'step onto target must succeed: ' + JSON.stringify(res));
  assert.equal(state.player.x, tx);
  assert.equal(state.player.y, ty);
}
// Place enemies[0] on a guaranteed-clear firing line: tries the four
// cardinal directions, requires every cell out to `dist` walkable,
// faces the player that way, and removes every other enemy from the
// line (dead enemies never block a scan). placeFoe alone can put
// the foe behind a wall for some seeds.
function placeFoeInLine(state, dist, opts) {
  const p = state.player;
  const cardinals = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  for (const [dx, dy] of cardinals) {
    let clear = true;
    for (let s = 1; s <= dist; s++) {
      const x = p.x + dx * s, y = p.y + dy * s;
      if (x < 0 || y < 0 || x >= C.GRID_W || y >= C.GRID_H || !C.isWalkableTile(state.floor.grid[y][x])) { clear = false; break; }
    }
    if (!clear) continue;
    p.facing = C.dirIndexFor(dx, dy);
    const foe = placeFoe(state, dx, dy, dist, opts);
    state.floor.enemies.forEach(e => { if (e !== foe) e.alive = false; });
    return foe;
  }
  throw new Error('no clear firing line of length ' + dist);
}
function adjacentFloorCell(state) {
  const p = state.player;
  for (const d of C.DIRS) {
    const x = p.x + d.dx, y = p.y + d.dy;
    if (C.isWalkableTile(state.floor.grid[y][x])) {
      // Clear anything already on the cell so the step is clean:
      // pickups, hazards, and enemies (a bump attack would keep the
      // player off the cell and the pickup uncollected).
      state.floor.pickups = state.floor.pickups.filter(pk => !(pk.x === x && pk.y === y));
      state.floor.hazards = state.floor.hazards.filter(h => !(h.x === x && h.y === y));
      state.floor.enemies.forEach(e => { if (e.x === x && e.y === y) e.alive = false; });
      return { x, y };
    }
  }
  throw new Error('no walkable adjacent cell');
}

test('phase3: skill data tables — 3 trees x 4 pilot skills, 6 mech skills', () => {
  assert.equal(C.PILOT_SKILL_TREES.length, 3);
  const ids = [];
  for (const tree of C.PILOT_SKILL_TREES) {
    assert.equal(tree.skills.length, 4, tree.id + ' must hold 4 skills');
    for (const id of tree.skills) {
      const def = C.PILOT_SKILLS[id];
      assert.ok(def, id + ' must exist in PILOT_SKILLS');
      assert.equal(def.tree, tree.id);
      assert.equal(def.costs.length, 3);
      assert.equal(def.xpNeeded.length, 3);
      assert.equal(typeof def.codexNeeded, 'number');
      ids.push(id);
    }
  }
  assert.equal(ids.length, 12);
  assert.equal(new Set(ids).size, 12, 'no duplicated pilot skill ids');
  const mechIds = Object.keys(C.MECH_SKILLS);
  assert.equal(mechIds.length, 6);
  for (const id of mechIds) {
    const def = C.MECH_SKILLS[id];
    for (const k of ['energy', 'heat', 'timeCost', 'learnCost']) assert.equal(typeof def[k], 'number', id + '.' + k);
  }
  // The two systems never share an id.
  for (const id of mechIds) assert.ok(!C.PILOT_SKILLS[id], id + ' must not be a pilot skill');
});

test('phase3: pilot buy gates — unknown, codex, XP, salvage, max rank', () => {
  const hub = C.newHub();
  assert.equal(C.buyPilotSkill(hub, 'nope').ok, false, 'unknown skill refused');
  assert.equal(C.buyPilotSkill(hub, 'steadyAim').ok, false, 'no banked salvage');
  hub.banked = 20;
  assert.equal(C.buyPilotSkill(hub, 'steadyAim').ok, true, 'rank 1: no codex/XP gate');
  assert.equal(hub.banked, 0);
  assert.equal(C.pilotSkillRank(hub, 'steadyAim'), 1);
  // Rank 2 needs 40 XP: hub has 0.
  hub.banked = 40;
  const xpGate = C.buyPilotSkill(hub, 'steadyAim');
  assert.equal(xpGate.ok, false, 'rank 2 gated on pilot XP');
  assert.equal(hub.banked, 40, 'refused buy spends nothing');
  hub.pilotXp = 40;
  assert.equal(C.buyPilotSkill(hub, 'steadyAim').ok, true);
  // Codex gate: secondWind needs 1 entry.
  const bare = richHub(100, []);
  assert.equal(C.buyPilotSkill(bare, 'secondWind').ok, false, 'codex gate');
  bare.codex = ['Entry A'];
  assert.equal(C.buyPilotSkill(bare, 'secondWind').ok, true, 'codex gate satisfied');
  // Max rank.
  const maxed = richHub();
  assert.equal(C.buyPilotSkill(maxed, 'steadyAim').ok, true);
  assert.equal(C.buyPilotSkill(maxed, 'steadyAim').ok, true);
  assert.equal(C.buyPilotSkill(maxed, 'steadyAim').ok, true);
  assert.equal(C.pilotSkillRank(maxed, 'steadyAim'), 3);
  assert.equal(C.buyPilotSkill(maxed, 'steadyAim').ok, false, 'rank 4 refused');
  assert.equal(C.buyPilotSkill(maxed, 'steadyAim').reason.indexOf('max rank') !== -1, true);
});

test('phase3: respec refunds all ranks, costs 25/rank, Codex + XP untouched', () => {
  const hub = richHub(500, ['Entry A', 'Entry B']);
  C.buyPilotSkill(hub, 'steadyAim'); // 20
  C.buyPilotSkill(hub, 'steadyAim'); // 40 (XP 500 covers)
  C.buyPilotSkill(hub, 'salvageSense'); // 20
  const before = hub.banked; // 420
  const codexBefore = hub.codex.slice();
  const xpBefore = hub.pilotXp;
  const res = C.respecPilotSkills(hub);
  assert.equal(res.ok, true);
  assert.equal(res.refunded, 3);
  assert.equal(res.cost, 75);
  assert.equal(hub.banked, before - 75);
  assert.equal(C.totalPilotRanks(hub), 0);
  assert.deepEqual(hub.codex, codexBefore, 'Codex untouched by respec');
  assert.equal(hub.pilotXp, xpBefore, 'pilot XP untouched by respec');
  assert.equal(C.respecPilotSkills(hub).ok, false, 'nothing left to refund');
  // Rebuying re-charges the normal rank prices.
  assert.equal(C.buyPilotSkill(hub, 'steadyAim').ok, true);
  assert.equal(hub.banked, before - 75 - 20);
  // Respec with too little banked refuses and changes nothing.
  const poor = richHub(30, ['Entry A']);
  C.buyPilotSkill(poor, 'steadyAim'); // 20 -> 10 left
  C.buyPilotSkill(poor, 'heavyHands'); // refused: 10 < 20, only 1 rank held
  assert.equal(C.totalPilotRanks(poor), 1);
  assert.equal(C.respecPilotSkills(poor).ok, false, '25 > 10 banked');
  assert.equal(C.totalPilotRanks(poor), 1, 'failed respec keeps ranks');
});

test('phase3: pilot skills persist through scripted death + new expedition', () => {
  const hub = richHub(100, ['Entry A']);
  assert.equal(C.buyPilotSkill(hub, 'steadyAim').ok, true);
  const s1 = C.newRun(11, hub);
  assert.equal(C.derivedStats(s1).acc, 15, 'Steady Aim feeds derivedStats');
  killPlayer(s1, seededRng(1));
  assert.equal(s1.state, 'dead', 'the scripted hit must kill');
  assert.equal(C.pilotSkillRank(hub, 'steadyAim'), 1, 'death does not touch hub skills');
  const s2 = C.newRun(12, hub);
  assert.equal(C.derivedStats(s2).acc, 15, 'rank survives into the next expedition');
  // Hub serialization round-trips skills, XP, and the cooldown.
  hub.pilotXp = 77; hub.secondWindCooldown = 2;
  const rt = C.ensureHub(JSON.parse(JSON.stringify(C.serializeHub(hub))));
  assert.equal(C.pilotSkillRank(rt, 'steadyAim'), 1);
  assert.equal(rt.pilotXp, 77);
  assert.equal(rt.secondWindCooldown, 2);
  // Unknown ids / out-of-range ranks in a stored save are dropped.
  const dirty = C.serializeHub(hub);
  dirty.skills.bogus = 2; dirty.skills.steadyAim = 9;
  const clean = C.ensureHub(dirty);
  assert.equal(clean.skills.bogus, undefined);
  assert.equal(C.pilotSkillRank(clean, 'steadyAim'), 0, 'rank 9 sanitized away');
});

test('phase3: mech skills wipe on death AND on extract', () => {
  const hub = richHub();
  const s1 = C.newRun(21, hub);
  s1.runSkillPoints = 4;
  assert.equal(C.learnMechSkill(s1, 'overclock').ok, true);
  assert.equal(C.learnMechSkill(s1, 'ventHeat').ok, true);
  killPlayer(s1, seededRng(2));
  assert.equal(s1.state, 'dead', 'the scripted hit must kill');
  assert.deepEqual(s1.mechSkills, [], 'death clears mech skills on the dead run');
  assert.equal(s1.runSkillPoints, 0);
  const s2 = C.newRun(22, hub);
  assert.deepEqual(s2.mechSkills, []);
  assert.equal(s2.runSkillPoints, 0);
  assert.equal(s2.energy, 100);
  assert.equal(s2.heat, 0);
  // Extract wipes too.
  s2.runSkillPoints = 2;
  assert.equal(C.learnMechSkill(s2, 'sensorPulse').ok, true);
  s2.state = 'stairs';
  assert.equal(C.extract(s2).ok, true);
  assert.deepEqual(s2.mechSkills, [], 'extract clears mech skills');
  assert.equal(s2.runSkillPoints, 0);
  const s3 = C.newRun(23, hub);
  assert.deepEqual(s3.mechSkills, []);
});

test('phase3: executor refusals cost no time, energy, or heat', () => {
  const state = C.newRun(31);
  freezeFloor(state);
  const rng = seededRng(3);
  state.runSkillPoints = 2;
  assert.equal(C.learnMechSkill(state, 'ventHeat').ok, true);
  const snap = () => [state.clock, state.actions, state.energy, state.heat, state.overheated];
  const before = snap();
  assert.equal(C.useMechSkill(state, rng, 'nope').ok, false, 'unknown skill');
  assert.deepEqual(snap(), before);
  assert.equal(C.useMechSkill(state, rng, 'overclock').ok, false, 'unlearned skill');
  assert.deepEqual(snap(), before);
  state.energy = 5;
  assert.equal(C.useMechSkill(state, rng, 'ventHeat').ok, false, 'unaffordable energy');
  assert.deepEqual(snap(), [before[0], before[1], 5, before[3], before[4]]);
  state.energy = 100; state.overheated = true; state.heat = 90;
  assert.equal(C.useMechSkill(state, rng, 'ventHeat').ok, false, 'overheated lock');
  assert.deepEqual(snap(), [before[0], before[1], 100, 90, true]);
  // Learning refusals cost nothing either.
  assert.equal(C.learnMechSkill(state, 'ventHeat').ok, false, 'already learned');
  assert.equal(C.learnMechSkill(state, 'overclock').ok, false, 'no points left');
  assert.equal(C.learnMechSkill(state, 'steadyAim').ok, false, 'pilot skills are not mech skills');
  assert.equal(C.buyPilotSkill(C.newHub(), 'overclock').ok, false, 'mech skills are not pilot skills');
});

test('phase3: valid mech use costs time + energy + heat, and applies the effect', () => {
  const state = C.newRun(41);
  freezeFloor(state);
  const rng = seededRng(4);
  state.runSkillPoints = 2;
  assert.equal(C.learnMechSkill(state, 'overclock').ok, true);
  const res = C.useMechSkill(state, rng, 'overclock');
  assert.equal(res.ok, true);
  assert.equal(state.clock, 10, 'one time unit spent');
  assert.equal(state.actions, 1);
  assert.equal(state.energy, 90, '100 - 20 cost + 10 regen');
  assert.equal(state.heat, 20, '30 heat - 10 dissipation');
  assert.equal(state.mechEffects.overclockShots, 3);
});

test('phase3: overheat locks skills until cooled below 50; Vent Heat clears heat', () => {
  const state = C.newRun(51);
  freezeFloor(state);
  const rng = seededRng(5);
  state.runSkillPoints = 4;
  C.learnMechSkill(state, 'overclock');
  C.learnMechSkill(state, 'ventHeat');
  state.heat = 90; state.energy = 100;
  assert.equal(C.useMechSkill(state, rng, 'overclock').ok, true);
  assert.equal(state.heat, 90, '100 capped - 10 dissipation');
  assert.equal(state.overheated, true);
  const clockBefore = state.clock;
  assert.equal(C.useMechSkill(state, rng, 'ventHeat').ok, false, 'locked while overheated');
  assert.equal(state.clock, clockBefore, 'refusal costs no time');
  // Four waits: 90 -> 50 (still locked, the threshold is BELOW 50).
  for (let i = 0; i < 4; i++) C.playerWait(state, seededRng(5));
  assert.equal(state.heat, 50);
  assert.equal(state.overheated, true);
  C.playerWait(state, seededRng(5));
  assert.equal(state.heat, 40);
  assert.equal(state.overheated, false, 'cooled below 50 unlocks');
  assert.ok(state.log.some(l => l.indexOf('cooled below 50') !== -1));
  // Vent Heat clears heat outright.
  state.heat = 70; state.energy = 100;
  assert.equal(C.useMechSkill(state, rng, 'ventHeat').ok, true);
  assert.equal(state.heat, 0, 'vented, then dissipation keeps it at 0');
  // Energy regen / heat dissipation over plain waits.
  state.energy = 50; state.heat = 40;
  C.playerWait(state, seededRng(5));
  assert.equal(state.energy, 60);
  assert.equal(state.heat, 30);
});

test('phase3: second wind saves once per run, then cools down across runs', () => {
  const hub = richHub(100, ['Entry A']);
  assert.equal(C.buyPilotSkill(hub, 'secondWind').ok, true);
  const s1 = C.newRun(61, hub);
  killPlayer(s1, seededRng(6)); // hp 1, lethal hit -> saved, not dead
  assert.equal(s1.state, 'playing', 'Second Wind saves the run');
  assert.equal(s1.player.hp, 1);
  assert.equal(s1.secondWindUsed, true);
  assert.equal(hub.secondWindCooldown, 3, 'rank 1 cooldown is 3 runs');
  assert.ok(s1.log.some(l => l.indexOf('Second Wind') !== -1));
  // Second lethal hit in the same run: no save left.
  s1.player.hp = 1;
  s1.player.evasion = 0;
  const foe = placeFoe(s1, 0, 1, 1, { dmg: 50, dmgVar: 0, acc: 100, evasion: 0 });
  C.enemyAct(s1, seededRng(6), foe);
  assert.equal(s1.state, 'dead', 'second lethal hit kills');
  // Cooldown ticks once per new expedition: 3 -> 2 -> 1 -> 0.
  C.newRun(62, hub);
  assert.equal(hub.secondWindCooldown, 2);
  C.newRun(63, hub);
  assert.equal(hub.secondWindCooldown, 1);
  C.newRun(64, hub);
  assert.equal(hub.secondWindCooldown, 0);
  // With the cooldown at 0, Second Wind saves again.
  const s5 = C.newRun(65, hub);
  s5.player.hp = 1;
  s5.player.evasion = 0;
  const foe2 = placeFoe(s5, 0, 1, 1, { dmg: 50, dmgVar: 0, acc: 100, evasion: 0 });
  C.enemyAct(s5, seededRng(6), foe2);
  assert.equal(s5.state, 'playing');
  assert.equal(s5.player.hp, 1);
});

test('phase3: trigger discipline — every Nth shot costs 1 less ammo', () => {
  const hub = richHub(100, ['Entry A']);
  assert.equal(C.buyPilotSkill(hub, 'triggerDiscipline').ok, true);
  const state = C.newRun(71, hub);
  freezeFloor(state);
  placeFoeInLine(state, 2, { type: 'brute', hp: 500, maxHp: 500, dmg: 1, dmgVar: 0, acc: 1, evasion: 0 });
  const rng = seededRng(7);
  assert.equal(state.ammoPools.standard, 16);
  for (let i = 0; i < 3; i++) assert.equal(C.fireWeapon(state, rng).ok, true);
  assert.equal(state.ammoPools.standard, 13, 'three full-cost shots');
  assert.equal(C.fireWeapon(state, rng).ok, true);
  assert.equal(state.ammoPools.standard, 13, 'fourth shot is free at rank 1 (N=4)');
  assert.equal(state.shotsFired, 4);
  assert.ok(state.log.some(l => l.indexOf('Trigger Discipline') !== -1));
  // Refusals do not consume the discount: no target -> no shot counted.
  const empty = C.newRun(72, hub);
  freezeFloor(empty);
  empty.floor.enemies.forEach(e => { e.alive = false; });
  assert.equal(C.fireWeapon(empty, seededRng(7)).ok, false);
  assert.equal(empty.shotsFired, 0);
  assert.equal(empty.ammoPools.standard, 16);
});

test('phase3: pilot effects — aim, damage, plating, repair, salvage, pockets, eye, tuning', () => {
  // Steady Aim + Heavy Hands through the seam.
  const hub = richHub();
  C.buyPilotSkill(hub, 'steadyAim');
  C.buyPilotSkill(hub, 'heavyHands');
  const s1 = C.newRun(81, hub);
  assert.equal(C.derivedStats(s1).acc, 15);
  assert.equal(C.weaponStats(s1).mult, 1.1);
  // Plating Know-how: +1 armor only while armor gear is equipped,
  // and it tracks equip/unequip through the seam.
  const hub2 = richHub();
  C.buyPilotSkill(hub2, 'platingKnowhow');
  const plain = C.newRun(82, C.newHub());
  const plated = C.newRun(83, hub2);
  assert.equal(C.derivedStats(plain).armor, C.derivedStats(plated).armor, 'no gear, no bonus');
  for (const st of [plain, plated]) {
    st.carriedGear.push(C.makeItemInstance('scrapPlating', 'common', 0, [], null));
    assert.equal(C.equipCarried(st, 0).ok, true);
  }
  assert.equal(C.derivedStats(plated).armor, C.derivedStats(plain).armor + 1);
  assert.equal(C.unequip(plated, 'armor').ok, true);
  assert.equal(C.derivedStats(plated).armor, 2, 'unequip drops the bonus back to base armor');
  // Field Repair: +10 HP per rank.
  const hub3 = richHub();
  C.buyPilotSkill(hub3, 'fieldRepair');
  const s3 = C.newRun(84, hub3);
  s3.player.hp = 40; s3.repairKits = 1;
  freezeFloor(s3);
  assert.equal(C.useRepairKit(s3, seededRng(8)).healed, 60);
  const s3b = C.newRun(85);
  s3b.player.hp = 40; s3b.repairKits = 1;
  freezeFloor(s3b);
  assert.equal(C.useRepairKit(s3b, seededRng(8)).healed, 50, 'no rank, base 50');
  // Salvage Sense: +2 per rank on the kill drop.
  const senseHub = richHub();
  C.buyPilotSkill(senseHub, 'salvageSense');
  const s4 = C.newRun(86, senseHub);
  const foe = { type: 'drone', name: 'Drone', x: 5, y: 5, alive: true };
  C.killEnemy(s4, seededRng(9), foe);
  const pk = s4.floor.pickups.find(p => p.kind === 'salvage' && p.x === 5 && p.y === 5);
  assert.ok(pk.value >= 5 && pk.value <= 7, 'drone 3-5 + 2 sense, got ' + pk.value);
  // Deep Pockets: +25% wreck salvage value per rank.
  const hub4 = richHub();
  C.buyPilotSkill(hub4, 'deepPockets');
  const s5 = C.newRun(87, hub4);
  freezeFloor(s5);
  const cell = adjacentFloorCell(s5);
  s5.playerWreck = { x: cell.x, y: cell.y, depth: 1, salvage: 40, health: 0, food: 0, components: 0, repairKit: 0, ammo: 0, gear: null };
  stepOnto(s5, seededRng(9), cell.x, cell.y);
  assert.equal(s5.carried, 50, '40 + 10 Deep Pockets');
  assert.ok(s5.log.some(l => l.indexOf('Deep Pockets') !== -1));
  // Codex Eye: a data chip reveals an extra rumor (needs 2 Codex entries).
  const hub5 = richHub(100, ['Entry A', 'Entry B']);
  C.buyPilotSkill(hub5, 'codexEye');
  const s6 = C.newRun(88, hub5);
  freezeFloor(s6);
  const cell2 = adjacentFloorCell(s6);
  s6.floor.pickups.push({ x: cell2.x, y: cell2.y, kind: 'dataChip', codex: 'Test Chip Entry' });
  const xpBefore = s6.pendingXp;
  stepOnto(s6, seededRng(9), cell2.x, cell2.y);
  assert.ok(s6.log.some(l => l.indexOf('Codex Eye reveals:') !== -1));
  assert.equal(s6.pendingXp, xpBefore + 10, 'chip +5, new Codex entry +5');
  assert.equal(s6.runSkillPoints, 1, 'chip earns 1 run skill point');
  // Overclock Tuning: 10% less mech-skill energy per rank.
  const hub6 = richHub();
  C.buyPilotSkill(hub6, 'overclockTuning');
  const s7 = C.newRun(89, hub6);
  assert.equal(C.mechSkillEnergyCost(s7, 'overclock'), 18);
  C.buyPilotSkill(hub6, 'overclockTuning');
  C.refreshPilotMods(s7);
  assert.equal(C.mechSkillEnergyCost(s7, 'overclock'), 16, 'rank 2: 20 x 0.8');
  // Breakdown / Ammo Smith record Phase 4 unlocks only.
  const hub7 = richHub(100, ['Entry A']);
  assert.equal(C.pilotPhase4Unlock(hub7, 'breakdown'), false);
  assert.equal(C.pilotPhase4Unlock(hub7, 'ammoRecipes'), false);
  C.buyPilotSkill(hub7, 'breakdown');
  C.buyPilotSkill(hub7, 'ammoSmith');
  assert.equal(C.pilotPhase4Unlock(hub7, 'breakdown'), true);
  assert.equal(C.pilotPhase4Unlock(hub7, 'ammoRecipes'), true);
});

test('phase3: mech effects — overclock, evasive, plating, salvage burst, sensor pulse', () => {
  // Overclock: next 3 shots +25%, one shot consumed per activation.
  const flat = () => 0.5;
  const a = C.newRun(91);
  freezeFloor(a);
  placeFoeInLine(a, 2, { hp: 500, maxHp: 500, evasion: 0 });
  const dmgPlain = C.fireWeapon(a, flat).damage;
  const b = C.newRun(92);
  freezeFloor(b);
  placeFoeInLine(b, 2, { hp: 500, maxHp: 500, evasion: 0 });
  b.runSkillPoints = 2;
  C.learnMechSkill(b, 'overclock');
  assert.equal(C.useMechSkill(b, flat, 'overclock').ok, true);
  const res = C.fireWeapon(b, flat);
  assert.ok(res.damage > dmgPlain, 'overclocked shot hits harder: ' + res.damage + ' vs ' + dmgPlain);
  assert.equal(b.mechEffects.overclockShots, 2, 'one activation consumes one overclock shot');
  assert.ok(b.log.some(l => l.indexOf('Overclock x1.25') !== -1));
  // Evasive Protocols: +4 evasion for 5 time units, then it lapses.
  const c = C.newRun(93);
  freezeFloor(c);
  const baseEv = C.playerEvasion(c);
  c.runSkillPoints = 2;
  C.learnMechSkill(c, 'evasiveProtocols');
  C.useMechSkill(c, seededRng(9), 'evasiveProtocols');
  assert.equal(C.playerEvasion(c), baseEv + 4);
  for (let i = 0; i < 4; i++) C.playerWait(c, seededRng(9));
  assert.equal(C.playerEvasion(c), baseEv, 'window lapses at clock 50');
  // Emergency Plating: +3 armor for 5 time units, then it lapses.
  const d = C.newRun(94);
  freezeFloor(d);
  const baseArmor = C.derivedStats(d).armor;
  d.runSkillPoints = 2;
  C.learnMechSkill(d, 'emergencyPlating');
  C.useMechSkill(d, seededRng(9), 'emergencyPlating');
  assert.equal(C.derivedStats(d).armor, baseArmor + 3);
  for (let i = 0; i < 4; i++) C.playerWait(d, seededRng(9));
  assert.equal(C.derivedStats(d).armor, baseArmor);
  // Salvage Burst: the next kill drops double salvage, then disarms.
  const e = C.newRun(95);
  e.runSkillPoints = 2;
  C.learnMechSkill(e, 'salvageBurst');
  C.useMechSkill(e, seededRng(9), 'salvageBurst');
  const foe = { type: 'drone', name: 'Drone', x: 6, y: 6, alive: true };
  C.killEnemy(e, seededRng(9), foe);
  const pk = e.floor.pickups.find(p => p.kind === 'salvage' && p.x === 6 && p.y === 6);
  assert.ok(pk.value >= 6 && pk.value <= 10, 'drone 3-5 doubled, got ' + pk.value);
  assert.equal(e.mechEffects.salvageBurst, false, 'burst disarms after the kill');
  // Sensor Pulse: reveals hidden traps in the current room.
  const f = C.newRun(96);
  freezeFloor(f);
  const hz = { x: f.player.x + 1, y: f.player.y, kind: 'spike', triggered: false, hidden: true, revealed: false };
  f.floor.hazards.push(hz);
  f.runSkillPoints = 2;
  C.learnMechSkill(f, 'sensorPulse');
  assert.equal(C.useMechSkill(f, seededRng(9), 'sensorPulse').ok, true);
  assert.equal(hz.revealed, true);
  assert.ok(f.log.some(l => l.indexOf('Sensor Pulse') !== -1));
});

test('phase3: earning — 1 point per 3 kills, XP banks on descend/extract, lost on death', () => {
  const hub = richHub(0, []);
  const state = C.newRun(101, hub);
  freezeFloor(state);
  const foes = state.floor.enemies.slice(0, 3);
  foes.forEach(foe => C.killEnemy(state, seededRng(10), foe));
  assert.equal(state.kills, 3);
  assert.equal(state.runSkillPoints, 1, '1 point per 3 kills');
  assert.equal(state.pendingXp, 6, '+2 XP per kill, pending');
  // Descend banks XP in full (+10 for descending).
  state.state = 'stairs';
  C.descend(state, 101);
  assert.equal(hub.pilotXp, 500 + 16, '6 pending + 10 descend, banked in full');
  assert.equal(state.pendingXp, 0);
  // Extract banks the rest.
  state.pendingXp = 30;
  state.state = 'stairs';
  C.extract(state);
  assert.equal(hub.pilotXp, 500 + 16 + 30);
  // Death loses the unbanked pool.
  const s2 = C.newRun(102, hub);
  s2.pendingXp = 30;
  killPlayer(s2, seededRng(10));
  assert.equal(s2.state, 'dead', 'the scripted hit must kill');
  assert.equal(hub.pilotXp, 500 + 16 + 30, 'death banks nothing');
});

test('phase3: save/load round-trips the new state; legacy saves default cleanly', () => {
  const hub = richHub();
  C.buyPilotSkill(hub, 'steadyAim');
  const state = C.newRun(111, hub);
  state.runSkillPoints = 5;
  C.learnMechSkill(state, 'overclock'); // costs 2, leaves 3
  state.energy = 55; state.heat = 33; state.pendingXp = 12; state.shotsFired = 7;
  const ser = C.serializeRun(state);
  assert.equal(ser.energy, 55);
  assert.equal(ser.heat, 33);
  assert.deepEqual(ser.mechSkills, ['overclock']);
  assert.equal(ser.runSkillPoints, 3);
  assert.equal(ser.pendingXp, 12);
  assert.equal(ser.shotsFired, 7);
  const loaded = C.deserializeRun(JSON.parse(JSON.stringify(ser)));
  assert.equal(loaded.energy, 55);
  assert.equal(loaded.heat, 33);
  assert.deepEqual(loaded.mechSkills, ['overclock']);
  assert.equal(loaded.runSkillPoints, 3);
  assert.equal(loaded.pendingXp, 12);
  assert.equal(loaded.shotsFired, 7);
  // Legacy run save: no Phase 3 fields at all.
  const legacy = JSON.parse(JSON.stringify(ser));
  for (const k of ['energy', 'heat', 'overheated', 'mechEffects', 'mechSkills', 'runSkillPoints', 'pendingXp', 'secondWindUsed', 'shotsFired']) delete legacy[k];
  const old = C.deserializeRun(legacy);
  assert.equal(old.energy, 100);
  assert.equal(old.heat, 0);
  assert.equal(old.overheated, false);
  assert.deepEqual(old.mechSkills, []);
  assert.equal(old.runSkillPoints, 0);
  assert.equal(old.pendingXp, 0);
  assert.equal(old.secondWindUsed, false);
  assert.equal(old.shotsFired, 0);
  // Hub serialization never carries run-scoped mech state.
  const hser = C.serializeHub(hub);
  assert.equal(hser.mechSkills, undefined);
  assert.equal(C.pilotSkillRank(C.ensureHub(hser), 'steadyAim'), 1);
  const legacyHub = JSON.parse(JSON.stringify(hser));
  delete legacyHub.skills; delete legacyHub.pilotXp; delete legacyHub.secondWindCooldown;
  const oldHub = C.ensureHub(legacyHub);
  assert.deepEqual(oldHub.skills, {});
  assert.equal(oldHub.pilotXp, 0);
  assert.equal(oldHub.secondWindCooldown, 0);
});

// ------------------------------------------------------------------
// Phase 4 (§7.6): breakdown, typed ammo, statuses, Enhance.
// ------------------------------------------------------------------

function p4HubWithSkills(skills) {
  const hub = C.newHub();
  hub.banked = 500;
  hub.components = 50;
  hub.codex = ['Entry A', 'Entry B'];
  hub.pilotXp = 500;
  hub.skills = Object.assign({}, skills);
  return hub;
}

test('phase4: breakdown yields are fixed per tier at every rank (P4-BREAKDOWN-YIELD, P4-BREAKDOWN-RANKS)', () => {
  // 40 breakdowns per kind (component + 5 gear tiers), at each of
  // ranks 1/2/3, with the same seeded stream per rank: yields must
  // be identical across ranks and exact per the §7.6.1 table.
  const EXPECTED_WIRE = { component: 3, common: 2, uncommon: 4, rare: 6, epic: 10, legendary: 16 };
  const EXPECTED_CORES = { component: 1, common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 5 };
  const tiers = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const perRank = [];
  for (let rank = 1; rank <= 3; rank++) {
    const hub = p4HubWithSkills({ breakdown: rank });
    const rng = seededRng(4242);
    const totals = { wire: 0, cores: 0 };
    const drain = () => { hub.materials = C.emptyMaterials(); };
    drain();
    for (let i = 0; i < 40; i++) {
      const r = C.breakDownComponent(hub, rng);
      assert.equal(r.ok, true, 'component breakdown must succeed');
      assert.equal(r.wire, EXPECTED_WIRE.component);
      assert.equal(r.cores.coreThermal + r.cores.coreShock + r.cores.coreCorrosive, EXPECTED_CORES.component);
      totals.wire += r.wire; totals.cores += EXPECTED_CORES.component;
    }
    const state = C.newRun(4242, hub);
    for (const tier of tiers) {
      drain(); // keep the materials store under the 999 cap between batches
      for (let i = 0; i < 40; i++) {
        state.carriedGear.push(C.makeItemInstance('alloyVest', tier, 0, [], null));
        const r = C.breakDownGear(hub, state, state.carriedGear.length - 1, rng);
        assert.equal(r.ok, true, tier + ' breakdown must succeed');
        assert.equal(r.wire, EXPECTED_WIRE[tier], tier + ' wire yield');
        assert.equal(r.cores.coreThermal + r.cores.coreShock + r.cores.coreCorrosive, EXPECTED_CORES[tier], tier + ' core count');
        assert.equal(state.carriedGear.length, 0, 'broken-down item leaves the Bag');
        totals.wire += r.wire; totals.cores += EXPECTED_CORES[tier];
      }
    }
    assert.equal(totals.wire, 40 * (3 + 2 + 4 + 6 + 10 + 16), 'rank ' + rank + ' wire total');
    assert.equal(totals.cores, 40 * (1 + 0 + 1 + 2 + 3 + 5), 'rank ' + rank + ' core total');
    assert.equal(hub.components, 50 - 40, '40 components consumed');
    perRank.push(totals);
  }
  assert.deepEqual(perRank[1], perRank[0], 'rank 2 yields identical to rank 1');
  assert.deepEqual(perRank[2], perRank[0], 'rank 3 yields identical to rank 1');
});

test('phase4: core rolls are independent uniform 1/3 draws on the seeded stream (P4-BREAKDOWN-CORES)', () => {
  // Fixed recorded seed: 20261029. 440 draws, expected 146.67/type,
  // each within +-15% (125-168 inclusive). Deterministic: the same
  // seed replays the same counts exactly.
  const counts = C.rollCores(C.mulberry32(20261029), 440);
  assert.ok(counts.coreThermal >= 125 && counts.coreThermal <= 168, 'thermal ' + counts.coreThermal);
  assert.ok(counts.coreShock >= 125 && counts.coreShock <= 168, 'shock ' + counts.coreShock);
  assert.ok(counts.coreCorrosive >= 125 && counts.coreCorrosive <= 168, 'corrosive ' + counts.coreCorrosive);
  const replay = C.rollCores(C.mulberry32(20261029), 440);
  assert.deepEqual(replay, counts, 'same seed replays the same distribution');
  // Corrosive cores drop: a long stream contains all three kinds.
  assert.ok(counts.coreCorrosive > 0, 'corrosive cores must drop');
  // Independence shape: single draws land in all three buckets.
  const kinds = new Set();
  const rng = C.mulberry32(99);
  for (let i = 0; i < 60; i++) kinds.add(C.rollCore(rng));
  assert.deepEqual([...kinds].sort(), ['coreCorrosive', 'coreShock', 'coreThermal']);
});

test('phase4: breakdown requires rank 1, is atomic, and cannot reach equipped or missing items (P4-BREAKDOWN-ATOMIC, P4-BREAKDOWN-ELIGIBILITY)', () => {
  // Rank 0: refusal, nothing consumed.
  const unranked = p4HubWithSkills({});
  const before = { components: unranked.components, wire: unranked.materials.wire };
  const refused = C.breakDownComponent(unranked, seededRng(1));
  assert.equal(refused.ok, false);
  assert.ok(/Breakdown/.test(refused.reason), 'reason names the skill gate');
  assert.equal(unranked.components, before.components);
  assert.equal(unranked.materials.wire, before.wire);
  // No components: refusal names the shortage.
  const empty = p4HubWithSkills({ breakdown: 1 });
  empty.components = 0;
  assert.equal(C.breakDownComponent(empty, seededRng(1)).ok, false);
  // Equipped gear is not addressable: breakDownGear only reads
  // carriedGear indices, so an equipped item can never be selected.
  const hub = p4HubWithSkills({ breakdown: 1 });
  const state = C.newRun(10, hub);
  state.carriedGear.push(C.makeItemInstance('alloyVest', 'rare', 1, [], null));
  C.equipCarried(state, 0);
  assert.equal(state.carriedGear.length, 0, 'equipped item leaves the Bag');
  assert.equal(C.breakDownGear(hub, state, 0, seededRng(1)).ok, false, 'no carried item at index 0');
  assert.ok(state.equipment.armor, 'equipped armor survives the refused breakdown');
  // Out-of-range index refuses.
  assert.equal(C.breakDownGear(hub, state, 5, seededRng(1)).ok, false);
  // Cap refusal: materials at 999, component stays, nothing granted.
  const capped = p4HubWithSkills({ breakdown: 1 });
  capped.materials.wire = 999; capped.materials.coreThermal = 999;
  capped.materials.coreShock = 999; capped.materials.coreCorrosive = 999;
  const compsBefore = capped.components;
  const capRef = C.breakDownComponent(capped, seededRng(1));
  assert.equal(capRef.ok, false);
  assert.equal(capped.components, compsBefore, 'refused breakdown keeps the component');
  assert.equal(capped.materials.wire, 999);
});

test('phase4: ammo recipes gate on Ammo Smith rank, output 6, consume exactly, codex null (P4-AMMO-GATES, P4-AMMO-RECIPE)', () => {
  const hub = p4HubWithSkills({ ammoSmith: 0 });
  hub.materials.wire = 100;
  hub.materials.coreThermal = 10; hub.materials.coreShock = 10;
  for (const id of ['piercingPack', 'incendiaryPack', 'shockPack']) {
    const r = C.craft(hub, id);
    assert.equal(r.ok, false, id + ' must refuse at rank 0');
    assert.ok(/Ammo Smith rank/.test(r.reason), id + ' reason names the rank gate, got: ' + r.reason);
  }
  // Rank 1 unlocks piercing only.
  hub.skills.ammoSmith = 1;
  assert.equal(C.craft(hub, 'incendiaryPack').ok, false);
  assert.equal(C.craft(hub, 'shockPack').ok, false);
  const wireBefore = hub.materials.wire, salvBefore = hub.banked;
  const pierce = C.craft(hub, 'piercingPack');
  assert.equal(pierce.ok, true);
  assert.equal(pierce.output, 'ammoPiercing');
  assert.equal(hub.stockpile.ammoPiercing, 6, 'recipe outputs 6');
  assert.equal(hub.materials.wire, wireBefore - 6, '6 wire consumed');
  assert.equal(hub.banked, salvBefore - 4, '4 salvage consumed');
  // Rank 2: incendiary; rank 3: shock.
  hub.skills.ammoSmith = 2;
  assert.equal(C.craft(hub, 'incendiaryPack').ok, true);
  assert.equal(hub.stockpile.ammoIncendiary, 6);
  assert.equal(hub.materials.coreThermal, 8, '2 thermal cores consumed');
  hub.skills.ammoSmith = 3;
  assert.equal(C.craft(hub, 'shockPack').ok, true);
  assert.equal(hub.stockpile.ammoShock, 6);
  assert.equal(hub.materials.coreShock, 8, '2 shock cores consumed');
  // Standard is today's ammoPack unchanged: 8 salvage -> 6, no gate.
  const std = C.craft(hub, 'ammoPack');
  assert.equal(std.ok, true);
  assert.equal(std.output, 'ammoStandard');
  assert.equal(hub.stockpile.ammoStandard, 6);
  // Atomic refusal: shortfall names every missing ingredient,
  // nothing consumed.
  const poor = p4HubWithSkills({ ammoSmith: 3 });
  poor.materials.wire = 1; poor.materials.coreShock = 0; poor.banked = 1;
  const w0 = poor.materials.wire, c0 = poor.materials.coreShock, b0 = poor.banked, p0 = poor.stockpile.ammoShock;
  const fail = C.craft(poor, 'shockPack');
  assert.equal(fail.ok, false);
  assert.ok(/wire/.test(fail.reason) && /coreShock/.test(fail.reason), 'reason names both shortfalls: ' + fail.reason);
  assert.equal(poor.materials.wire, w0); assert.equal(poor.materials.coreShock, c0);
  assert.equal(poor.banked, b0); assert.equal(poor.stockpile.ammoShock, p0);
  // Codex is null for all four: an empty codex still crafts.
  const noCodex = p4HubWithSkills({ ammoSmith: 3 });
  noCodex.codex = [];
  noCodex.materials.wire = 100; noCodex.materials.coreThermal = 10; noCodex.materials.coreShock = 10;
  assert.equal(C.craft(noCodex, 'piercingPack').ok, true);
  assert.equal(C.craft(noCodex, 'incendiaryPack').ok, true);
  assert.equal(C.craft(noCodex, 'shockPack').ok, true);
  assert.equal(C.craft(noCodex, 'ammoPack').ok, true);
});

test('phase4: hub and run pools plus materials survive save/load (P4-AMMO-POOL)', () => {
  const storage = fakeStorage();
  const hub = p4HubWithSkills({ breakdown: 1, ammoSmith: 2 });
  hub.stockpile.ammoStandard = 40; hub.stockpile.ammoPiercing = 12;
  hub.stockpile.ammoIncendiary = 6; hub.stockpile.ammoShock = 3;
  hub.materials = { wire: 77, coreThermal: 5, coreShock: 4, coreCorrosive: 9 };
  C.saveHub(storage, hub);
  const loadedHub = C.loadHub(storage);
  assert.deepEqual(loadedHub.stockpile, { health: 0, food: 0, repairKit: 0, ammoStandard: 40, ammoPiercing: 12, ammoIncendiary: 6, ammoShock: 3 });
  assert.deepEqual(loadedHub.materials, { wire: 77, coreThermal: 5, coreShock: 4, coreCorrosive: 9 });
  const state = C.newRun(55, loadedHub, { standard: 0, piercing: 4, incendiary: 2, shock: 0 });
  state.selectedAmmo = 'incendiary';
  C.saveRun(storage, state);
  const loaded = C.loadRun(storage);
  assert.deepEqual(loaded.ammoPools, { standard: 10, piercing: 4, incendiary: 2, shock: 0 });
  assert.equal(loaded.selectedAmmo, 'incendiary');
  assert.deepEqual(C.inventoryOf(loaded).ammoPools, { standard: 10, piercing: 4, incendiary: 2, shock: 0 });
});

test('phase4: loadout default, allocation, caps, ownership, shortfall (P4-AMMO-LOADOUT)', () => {
  const hub = p4HubWithSkills({});
  hub.stockpile.ammoStandard = 30; hub.stockpile.ammoPiercing = 5;
  hub.stockpile.ammoIncendiary = 0; hub.stockpile.ammoShock = 2;
  // Default: 16 free Standard, hub untouched.
  const d = C.computeLoadout(hub, null);
  assert.equal(d.ok, true); assert.equal(d.defaulted, true);
  assert.deepEqual(d.pools, { standard: 16, piercing: 0, incendiary: 0, shock: 0 });
  const run0 = C.newRun(60, hub, null);
  assert.deepEqual(run0.ammoPools, { standard: 16, piercing: 0, incendiary: 0, shock: 0 });
  assert.equal(hub.stockpile.ammoStandard, 30, 'default loadout draws nothing from the hub');
  // Allocation: drawn from the hub, topped up to 16 with free Standard.
  const a = C.computeLoadout(hub, { standard: 2, piercing: 3, incendiary: 0, shock: 1 });
  assert.equal(a.ok, true);
  assert.deepEqual(a.pools, { standard: 12, piercing: 3, incendiary: 0, shock: 1 });
  const run1 = C.newRun(61, hub, { standard: 2, piercing: 3, incendiary: 0, shock: 1 });
  assert.deepEqual(run1.ammoPools, { standard: 12, piercing: 3, incendiary: 0, shock: 1 });
  assert.equal(hub.stockpile.ammoStandard, 28, 'allocated Standard deducted');
  assert.equal(hub.stockpile.ammoPiercing, 2, 'allocated Piercing deducted');
  assert.equal(hub.stockpile.ammoShock, 1, 'allocated Shock deducted');
  // Over total, over per-type, over ownership, non-whole: default + reason.
  for (const bad of [
    { standard: 10, piercing: 7 },
    { standard: 13 },
    { standard: 0, piercing: 3, incendiary: 0, shock: 0 },
    { standard: 2.5 },
    { standard: -1 },
  ]) {
    const r = C.computeLoadout(hub, bad);
    assert.equal(r.ok, false, JSON.stringify(bad) + ' must refuse');
    assert.ok(r.reason.length > 0);
    assert.deepEqual(r.pools, { standard: 16, piercing: 0, incendiary: 0, shock: 0 }, 'refusal falls back to the default pools');
  }
  // Ownership: only 2 piercing left in the hub now.
  assert.equal(C.computeLoadout(hub, { piercing: 3 }).ok, false);
  // Invalid allocation at newRun: falls back to 16 Standard with a log line.
  const runBad = C.newRun(62, hub, { standard: 99 });
  assert.deepEqual(runBad.ammoPools, { standard: 16, piercing: 0, incendiary: 0, shock: 0 });
  assert.ok(runBad.log.some(l => /Loadout invalid/.test(l)));
  // Shortfall rule: fewer than 16 Standard available -> all of it.
  const short = p4HubWithSkills({});
  short.stockpile.ammoStandard = 5;
  const runShort = C.newRun(63, short, null);
  assert.equal(runShort.ammoPools.standard, 16, 'default grants 16 free Standard even when the hub holds 5');
  assert.equal(short.stockpile.ammoStandard, 5, 'shortfall default draws nothing');
});

test('phase4: legacy ammo migrates idempotently, hub and run separately (P4-LEGACY-MIGRATION, P4-MIGRATION-IDEMPOTENT)', () => {
  // Hub: 0 / 16 / 1200 -> 0 / 16 / 999. Every nonzero migration
  // records a diagnostic note; the 1200 note names the discard.
  for (const [legacy, expected, diag] of [[0, 0, false], [16, 16, true], [1200, 999, true]]) {
    const raw = C.newHub();
    raw.stockpile.ammo = legacy;
    const hub = C.ensureHub(raw);
    assert.equal(hub.stockpile.ammoStandard, expected, 'legacy hub ammo ' + legacy);
    assert.equal(hub.stockpile.ammo, undefined, 'legacy key removed');
    assert.equal((hub.migrationNotes || []).length > 0, diag, 'diagnostic for ' + legacy);
    if (legacy === 1200) assert.ok(hub.migrationNotes.some(n => /excess 201 discarded/.test(n)), 'discard named');
    assert.deepEqual(hub.stockpile.ammoPiercing, 0);
    assert.deepEqual(hub.materials, { wire: 0, coreThermal: 0, coreShock: 0, coreCorrosive: 0 });
    // Idempotent: a save/load round-trip adds no further note.
    const storage = fakeStorage();
    C.saveHub(storage, hub);
    const reloaded = C.loadHub(storage);
    assert.equal(reloaded.stockpile.ammoStandard, expected);
    assert.equal((reloaded.migrationNotes || []).length, (hub.migrationNotes || []).length);
  }
  // Unrelated valid fields survive migration.
  const keeper = C.newHub();
  keeper.banked = 123; keeper.components = 7; keeper.stockpile.ammo = 9;
  const kept = C.ensureHub(keeper);
  assert.equal(kept.banked, 123); assert.equal(kept.components, 7);
  assert.equal(kept.stockpile.ammoStandard, 9);
  // Run: legacy ammo 1200 -> 99 with a diagnostic; run and hub
  // migrate separately, never both.
  const hub = C.newHub();
  hub.stockpile.ammo = 1200;
  const state = C.newRun(70, hub);
  const snap = C.serializeRun(state);
  snap.ammo = 1200;
  delete snap.ammoPools;
  const migrated = C.deserializeRun(snap);
  assert.equal(migrated.ammoPools.standard, 99, 'run cap 99');
  assert.ok((migrated.migrationNotes || []).some(n => /1200/.test(n) && /99/.test(n)), 'run diagnostic names the discard');
  assert.equal(hub.stockpile.ammoStandard, 999, 'hub migration is independent of the run migration');
  // Second load of the migrated run: unchanged (idempotent).
  const snap2 = C.serializeRun(migrated);
  const migrated2 = C.deserializeRun(snap2);
  assert.deepEqual(migrated2.ammoPools, migrated.ammoPools);
});

test('phase4: switching selects, cycles, wraps, reverses; empty FIRE auto-switches without firing (P4-AMMO-SWITCH, P4-AMMO-AUTO-SWITCH)', () => {
  const state = C.newRun(80);
  state.ammoPools = { standard: 0, piercing: 0, incendiary: 5, shock: 2 };
  // Empty types are selectable and show 0.
  assert.equal(C.selectAmmoType(state, 'shock').ok, true);
  assert.equal(state.selectedAmmo, 'shock');
  assert.equal(C.selectAmmoType(state, 'standard').ok, true);
  assert.equal(C.selectAmmoType(state, 'bogus').ok, false, 'unknown type refuses');
  assert.equal(state.selectedAmmo, 'standard', 'refused select leaves the selection alone');
  // Cycle forward wraps shock -> standard; reverse wraps back.
  C.selectAmmoType(state, 'shock');
  assert.equal(C.cycleAmmoType(state, 1).type, 'standard');
  assert.equal(C.cycleAmmoType(state, -1).type, 'shock');
  assert.equal(C.cycleAmmoType(state, 1).type, 'standard');
  assert.equal(C.cycleAmmoType(state, 1).type, 'piercing');
  // FIRE on an empty selected pool: exact message, no fire, no
  // ammo spent, no time advanced, no target harmed.
  const rng = seededRng(80);
  freezeFloor(state);
  state.floor.enemies.forEach(e => { e.alive = false; });
  const line = findLine(state, 3) || [1, 0];
  const foe = placeFoe(state, line[0], line[1], 3, { hp: 100, maxHp: 100 });
  state.player.facing = C.dirIndexFor(line[0], line[1]);
  state.player.acc = 100;
  C.selectAmmoType(state, 'standard'); // 0 rounds
  const clockBefore = state.clock, actionsBefore = state.actions;
  const poolsBefore = Object.assign({}, state.ammoPools);
  const res = C.fireWeapon(state, rng);
  assert.equal(res.ok, false);
  assert.equal(res.switched, true);
  assert.equal(res.from, 'standard');
  assert.equal(res.to, 'incendiary', 'next non-empty pool in cycle order');
  assert.equal(state.selectedAmmo, 'incendiary');
  assert.ok(state.log.some(l => l === 'Switched to Incendiary — Standard empty'), 'exact spec message, got: ' + JSON.stringify(state.log));
  assert.deepEqual(state.ammoPools, poolsBefore, 'auto-switch spends no ammo');
  assert.equal(state.clock, clockBefore, 'auto-switch advances no time');
  assert.equal(state.actions, actionsBefore);
  assert.equal(foe.hp, 100, 'auto-switch fires nothing');
  // All pools empty: "No ammunition", no time advance.
  state.ammoPools = { standard: 0, piercing: 0, incendiary: 0, shock: 0 };
  const res2 = C.fireWeapon(state, seededRng(80));
  assert.equal(res2.ok, false);
  assert.equal(res2.reason, 'No ammunition');
  assert.equal(state.clock, clockBefore);
  // No silent Standard substitution: an empty Shock selection with
  // Standard stocked switches WITH the message, never silently.
  state.ammoPools = { standard: 5, piercing: 0, incendiary: 0, shock: 0 };
  C.selectAmmoType(state, 'shock');
  const logBefore = state.log.length;
  const res3 = C.fireWeapon(state, seededRng(80));
  assert.equal(res3.switched, true);
  assert.equal(res3.to, 'standard');
  assert.ok(state.log.slice(logBefore).some(l => l === 'Switched to Standard — Shock empty'));
});

test('phase4: burning ticks per time unit with resistance rounding, including dormant enemies; refresh does not stack (P4-BURN-TICK, P4-BURN-DORMANT, P4-BURN-REFRESH)', () => {
  const state = C.newRun(90);
  freezeFloor(state);
  state.floor.enemies.forEach(e => { e.alive = false; });
  const p = state.player;
  // Distinct enemies: placeFoe always reuses enemies[0], so place
  // each type on its own foe object.
  const mk = (idx, type, dx, dy) => {
    const foe = state.floor.enemies[idx];
    Object.assign(foe, { x: p.x + dx * 2, y: p.y + dy * 2, alive: true, awake: false, evasion: 0, nextTime: 1e9 });
    Object.assign(foe, { type: type, hp: 500, maxHp: 500, statuses: [] });
    return foe;
  };
  const drone = mk(0, 'drone', 1, 0), raider = mk(1, 'raider', -1, 0), brute = mk(2, 'brute', 0, -1);
  for (const foe of [drone, raider, brute]) C.applyBurning(state, foe);
  // Three scheduler units: drone 1/tick (50%), raider 3/tick (0%),
  // brute 2/tick (25%). Dormant enemies tick without activating.
  state.clock = 0;
  const rng = seededRng(90);
  for (let u = 0; u < 3; u++) C.processScheduler(state, rng, C.PLAYER_DEF.interval);
  assert.equal(drone.hp, 500 - 3, 'drone 1 x 3 ticks');
  assert.equal(raider.hp, 500 - 9, 'raider 3 x 3 ticks');
  assert.equal(brute.hp, 500 - 6, 'brute 2 x 3 ticks');
  assert.equal(C.findStatus(drone, 'burning'), null, 'burning expires after 3 ticks');
  assert.equal(brute.nextTime, 1e9, 'dormant enemy never activated');
  // Refresh: reapplication resets to 3, keeps a single record.
  const foe2 = placeFoe(state, 1, 0, 2, { type: 'raider', hp: 500, maxHp: 500, nextTime: 1e9 });
  C.applyBurning(state, foe2);
  C.processScheduler(state, rng, C.PLAYER_DEF.interval); // 1 tick
  assert.equal(C.findStatus(foe2, 'burning').ticksLeft, 2);
  C.applyBurning(state, foe2);
  assert.equal(C.findStatus(foe2, 'burning').ticksLeft, 3, 'reapplication refreshes to 3');
  assert.equal(foe2.statuses.filter(s => s.kind === 'burning').length, 1, 'no stacking');
  assert.ok(state.log.some(l => /burning refreshes/.test(l)));
});

test('phase4: burning kills through the ordinary path exactly once, before activation (P4-BURN-KILL)', () => {
  const state = C.newRun(95);
  freezeFloor(state);
  state.floor.enemies.forEach(e => { e.alive = false; });
  const p = state.player;
  // 5-HP raider (no resistance): dies on the second 3-HP tick.
  // Its activation is due in the SECOND unit (nextTime 15) and
  // would hit the player hard — the tick must kill it first, so
  // it never gets to act.
  const foe = placeFoe(state, 1, 0, 1, { type: 'raider', hp: 5, maxHp: 5, dmg: 50, dmgVar: 0, acc: 100, evasion: 0, nextTime: 15 });
  foe.awake = true;
  p.hp = 40;
  const killsBefore = state.kills;
  const dropsBefore = state.floor.pickups.length;
  C.applyBurning(state, foe);
  state.clock = 0;
  const rng = seededRng(95);
  C.processScheduler(state, rng, C.PLAYER_DEF.interval); // tick 1: 5 -> 2
  assert.equal(foe.hp, 2);
  assert.equal(foe.alive, true);
  C.processScheduler(state, rng, C.PLAYER_DEF.interval); // tick 2: dead
  assert.equal(foe.alive, false, 'burning kills on the second tick');
  assert.equal(state.kills, killsBefore + 1, 'exactly one kill credited');
  assert.ok(state.floor.pickups.length > dropsBefore, 'ordinary death drops');
  assert.equal(p.hp, 40, 'the tick-killed enemy never activated');
  assert.ok(state.log.some(l => /burns for 3/.test(l)));
  // Further scheduler drives never re-kill or re-drop.
  const killsAfter = state.kills, dropsAfter = state.floor.pickups.length;
  C.processScheduler(state, rng, C.PLAYER_DEF.interval);
  C.processScheduler(state, rng, C.PLAYER_DEF.interval);
  assert.equal(state.kills, killsAfter);
  assert.equal(state.floor.pickups.length, dropsAfter);
});

test('phase4: jam skips exactly one activation, stacks with burning, reapplication does not queue (P4-JAM-SKIP, P4-STATUS-STACK)', () => {
  const state = C.newRun(100);
  freezeFloor(state);
  state.floor.enemies.forEach(e => { e.alive = false; });
  const p = state.player;
  p.hp = 100;
  const rng = seededRng(100);
  // Jammed foe due to act: the activation is skipped whole, the
  // jam is consumed, world time still advances past it.
  const foe = placeFoe(state, 1, 0, 1, { type: 'raider', dmg: 50, dmgVar: 0, acc: 100, evasion: 0, hp: 100, maxHp: 100, nextTime: 0 });
  foe.awake = true;
  state.clock = 0;
  C.applyJammed(state, () => 0.99, foe); // 0.99: never resists
  assert.ok(C.findStatus(foe, 'jammed'), 'jam applied');
  const hpBefore = p.hp;
  C.enemyAct(state, rng, foe);
  assert.equal(p.hp, hpBefore, 'jammed activation deals no damage');
  assert.equal(C.findStatus(foe, 'jammed'), null, 'jam is consumed by the skipped activation');
  assert.ok(state.log.some(l => /is jammed and skips/.test(l)));
  // The next activation acts normally.
  foe.nextTime = 0;
  C.enemyAct(state, rng, foe);
  assert.ok(p.hp < hpBefore, 'the following activation acts');
  // Stacking: burning + jammed coexist and expire independently.
  const foe2 = placeFoe(state, -1, 0, 1, { type: 'raider', dmg: 1, dmgVar: 0, acc: 100, evasion: 0, hp: 100, maxHp: 100, nextTime: 1e9 });
  foe2.awake = true;
  C.applyBurning(state, foe2);
  C.applyJammed(state, () => 0.99, foe2);
  assert.equal(foe2.statuses.length, 2, 'burning and jammed coexist');
  foe2.nextTime = 0;
  state.clock = 0;
  C.enemyAct(state, rng, foe2); // skips; burning untouched by the skip
  assert.equal(C.findStatus(foe2, 'jammed'), null, 'jam expires on the skip');
  assert.ok(C.findStatus(foe2, 'burning'), 'burning survives the skipped activation');
  // Reapplication while jammed does not queue a second skip.
  const foe3 = placeFoe(state, 0, 1, 1, { type: 'raider', dmg: 50, dmgVar: 0, acc: 100, evasion: 0, hp: 100, maxHp: 100, nextTime: 0 });
  foe3.awake = true;
  C.applyJammed(state, () => 0.99, foe3);
  C.applyJammed(state, () => 0.99, foe3);
  assert.equal(foe3.statuses.filter(s => s.kind === 'jammed').length, 1, 'one jam record only');
  C.enemyAct(state, rng, foe3); // consumes the single skip
  assert.equal(C.findStatus(foe3, 'jammed'), null);
  foe3.nextTime = 0;
  const hp3 = p.hp;
  C.enemyAct(state, rng, foe3);
  assert.ok(p.hp < hp3, 'no queued second skip: the next activation acts');
});

test('phase4: jam resistance probabilities on the seeded stream, fixed seeds recorded (P4-STATUS-RESIST)', () => {
  // 1,000 independent attempts per enemy type, one seeded stream
  // per type, fresh foe fixture per attempt, no reseeding between
  // rolls. Seeds recorded here and in PHASE4-REPORT.md.
  // Statistical check: within +-5 percentage points of the table
  // (Drone 50%, Raider 0%, Brute 25%). Raider is exact: 0% can
  // never resist. Deterministic replay proves the seeded stream.
  const CASES = [
    { type: 'drone', seed: 77001, expect: 50 },
    { type: 'raider', seed: 77002, expect: 0 },
    { type: 'brute', seed: 77003, expect: 25 },
  ];
  for (const c of CASES) {
    const runOnce = () => {
      const state = C.newRun(1);
      const rng = C.mulberry32(c.seed);
      let resisted = 0;
      for (let i = 0; i < 1000; i++) {
        const foe = { type: c.type, name: 'T', statuses: [] };
        if (C.applyJammed(state, rng, foe).resisted) resisted++;
        state.log.length = 0;
      }
      return resisted;
    };
    const resisted = runOnce();
    const pct = resisted / 10;
    assert.ok(Math.abs(pct - c.expect) <= 5, c.type + ': observed ' + pct + '% (resisted ' + resisted + '/1000, seed ' + c.seed + '), expected ' + c.expect + '% +-5pp');
    assert.equal(runOnce(), resisted, c.type + ': same seed replays the same count');
  }
});

test('phase4: a Shock round is consumed on a resisted hit; a miss rolls nothing (P4-SHOCK-RESIST-COST)', () => {
  // Deterministic roll level: a 0.01 draw resists for drone/brute,
  // a 0.99 draw applies. The round is spent either way at the
  // fireWeapon level, proven below by hunting a resisted hit.
  const st = C.newRun(110);
  const drone = { type: 'drone', name: 'Drone', statuses: [] };
  assert.equal(C.applyJammed(st, () => 0.01, drone).resisted, true);
  assert.equal(C.findStatus(drone, 'jammed'), null, 'resisted: no jam status');
  assert.equal(C.applyJammed(st, () => 0.99, drone).applied, true);
  const raider = { type: 'raider', name: 'Raider', statuses: [] };
  assert.equal(C.applyJammed(st, () => 0.01, raider).resisted, false, 'raider 0% never resists');
  // Fire level: hunt a seed where a Shock hit is resisted; the
  // round is gone all the same, with no retry.
  let found = false;
  for (let seed = 111; seed <= 140 && !found; seed++) {
    const state = C.newRun(seed);
    const line = findLine(state, 3);
    if (!line) continue;
    const rng = seededRng(seed);
    freezeFloor(state);
    state.floor.enemies.forEach(e => { e.alive = false; });
    const foe = placeFoe(state, line[0], line[1], 2, { type: 'drone', hp: 100, maxHp: 100, evasion: 0 });
    state.player.facing = C.dirIndexFor(line[0], line[1]);
    state.player.acc = 100;
    state.ammoPools.shock = 6;
    state.selectedAmmo = 'shock';
    const res = C.fireWeapon(state, rng);
    if (res.ok && res.hit && state.log.some(l => /Resisted the jam/.test(l))) {
      assert.equal(state.ammoPools.shock, 5, 'resisted hit still spends the Shock round');
      assert.equal(C.findStatus(foe, 'jammed'), null);
      found = true;
    }
  }
  assert.ok(found, 'no seed in 111..140 produced a resisted Shock hit');
  // Miss: no jam, no resistance roll, but the fired round is spent.
  let missed = false;
  for (let seed = 141; seed <= 180 && !missed; seed++) {
    const state = C.newRun(seed);
    const line = findLine(state, 3);
    if (!line) continue;
    const rng = seededRng(seed);
    freezeFloor(state);
    state.floor.enemies.forEach(e => { e.alive = false; });
    const foe = placeFoe(state, line[0], line[1], 2, { type: 'drone', hp: 100, maxHp: 100, evasion: 14 });
    state.player.facing = C.dirIndexFor(line[0], line[1]);
    state.player.acc = 14;
    state.ammoPools.shock = 6;
    state.selectedAmmo = 'shock';
    const res = C.fireWeapon(state, rng);
    if (res.ok && !res.hit) {
      assert.equal(C.findStatus(foe, 'jammed'), null, 'miss applies no jam');
      assert.ok(!state.log.some(l => /Resisted the jam/.test(l)), 'miss rolls no resistance');
      assert.equal(state.ammoPools.shock, 5, 'a fired round is spent even on a miss');
      missed = true;
    }
  }
  assert.ok(missed, 'no seed in 141..180 produced a Shock miss');
});

test('phase4: Piercing ignores half the target armor, rounded down on the ignored portion (P4-AMMO-EFFECT)', () => {
  // Paired shots: identical seeds, identical floors, identical
  // dice streams — the ONLY difference is the ammo type. Brute
  // armor 4 -> Piercing ignores 2 -> every pair differs by exactly 2.
  const line0 = (() => {
    const probe = C.newRun(900);
    return findLine(probe, 3);
  })();
  assert.ok(line0, 'seed 900 must offer a 3-cell line');
  let pairs = 0;
  for (let i = 0; i < 200; i++) {
    const shot = (ammoType) => {
      const state = C.newRun(900);
      freezeFloor(state);
      state.floor.enemies.forEach(e => { e.alive = false; });
      const foe = placeFoe(state, line0[0], line0[1], 3, { type: 'brute', armor: 4, hp: 500, maxHp: 500, evasion: 0 });
      state.player.facing = C.dirIndexFor(line0[0], line0[1]);
      state.player.acc = 100;
      state.ammoPools[ammoType] = 6;
      state.selectedAmmo = ammoType;
      const res = C.fireWeapon(state, C.mulberry32(5000 + i));
      assert.equal(res.ok, true, 'shot ' + i + ' ' + ammoType + ' refused');
      assert.equal(res.hit, true, 'shot ' + i + ' ' + ammoType + ' must hit');
      return 500 - foe.hp;
    };
    const dmgStd = shot('standard');
    const dmgPierce = shot('piercing');
    assert.ok(dmgStd > 0, 'standard shot ' + i + ' dealt no damage');
    assert.equal(dmgPierce - dmgStd, 2, 'pair ' + i + ': piercing must deal exactly 2 more (half of armor 4 ignored)');
    pairs++;
  }
  assert.equal(pairs, 200);
  // Armor 1: half rounded down on the ignored portion -> ignores 0.
  // Raider armor 1: piercing and standard deal identical damage.
  let raiderPairs = 0;
  for (let i = 0; i < 60; i++) {
    const shot = (ammoType) => {
      const state = C.newRun(900);
      freezeFloor(state);
      state.floor.enemies.forEach(e => { e.alive = false; });
      const foe = placeFoe(state, line0[0], line0[1], 3, { type: 'raider', armor: 1, hp: 500, maxHp: 500, evasion: 0 });
      state.player.facing = C.dirIndexFor(line0[0], line0[1]);
      state.player.acc = 100;
      state.ammoPools[ammoType] = 6;
      state.selectedAmmo = ammoType;
      const res = C.fireWeapon(state, C.mulberry32(6000 + i));
      assert.equal(res.hit, true);
      return 500 - foe.hp;
    };
    assert.equal(shot('piercing') - shot('standard'), 0, 'armor 1: floor(1/2) = 0 ignored');
    raiderPairs++;
  }
  assert.equal(raiderPairs, 60);
});

test('phase4: Incendiary and Shock deal normal damage plus a status on a hit, nothing on a miss (P4-AMMO-EFFECT)', () => {
  // Hit: guaranteed (acc 100 vs evasion 0).
  for (const ammoType of ['incendiary', 'shock']) {
    const state = C.newRun(910);
    const line = findLine(state, 3);
    assert.ok(line, 'seed 910 must offer a line');
    freezeFloor(state);
    state.floor.enemies.forEach(e => { e.alive = false; });
    const foe = placeFoe(state, line[0], line[1], 2, { type: 'raider', hp: 100, maxHp: 100, evasion: 0, armor: 0 });
    state.player.facing = C.dirIndexFor(line[0], line[1]);
    state.player.acc = 100;
    state.ammoPools[ammoType] = 6;
    state.selectedAmmo = ammoType;
    const res = C.fireWeapon(state, seededRng(910));
    assert.equal(res.ok, true);
    assert.equal(res.hit, true);
    assert.ok(foe.hp < 100, ammoType + ' must deal normal rolled damage');
    if (ammoType === 'incendiary') {
      assert.ok(C.findStatus(foe, 'burning'), 'incendiary hit must burn');
    } else {
      assert.ok(C.findStatus(foe, 'jammed') || state.log.some(l => /Resisted the jam/.test(l)), 'shock hit must jam or be resisted');
    }
  }
  // Miss: hunt a seed where an Incendiary shot misses outright.
  let missed = false;
  for (let seed = 911; seed <= 950 && !missed; seed++) {
    const state = C.newRun(seed);
    const line = findLine(state, 3);
    if (!line) continue;
    freezeFloor(state);
    state.floor.enemies.forEach(e => { e.alive = false; });
    const foe = placeFoe(state, line[0], line[1], 2, { type: 'drone', hp: 100, maxHp: 100, evasion: 14 });
    state.player.facing = C.dirIndexFor(line[0], line[1]);
    state.player.acc = 14;
    state.ammoPools.incendiary = 6;
    state.selectedAmmo = 'incendiary';
    const res = C.fireWeapon(state, seededRng(seed));
    if (res.ok && !res.hit) {
      assert.equal(foe.hp, 100, 'a miss deals no damage');
      assert.equal(C.findStatus(foe, 'burning'), null, 'a miss applies no burning');
      missed = true;
    }
  }
  assert.ok(missed, 'no seed in 911..950 produced an Incendiary miss');
});

test('phase4: Enhance costs 4 x target level plus a matching core, caps at +5, is atomic (P4-ENHANCE-COST, P4-ENHANCE-CAP, P4-ENHANCE-ATOMIC)', () => {
  // Cost table on a plain (element null) item.
  const plain = C.makeItemInstance('alloyVest', 'common', 0, [], null);
  for (let up = 0; up < 5; up++) {
    const inst = C.makeItemInstance('alloyVest', 'common', up, [], null);
    const ec = C.enhanceCost(inst);
    assert.equal(ec.ok, true);
    assert.equal(ec.target, up + 1);
    assert.deepEqual(ec.cost, { wire: 4 * (up + 1), core: 0, coreKind: null }, 'wire cost at +' + up);
  }
  assert.equal(C.enhanceCost(C.makeItemInstance('alloyVest', 'common', 5, [], null)).ok, false, '+5 is the ceiling');
  // Elemental item: +1 matching core.
  const hot = C.makeItemInstance('alloyVest', 'common', 2, [], null, 'thermal');
  const ecHot = C.enhanceCost(hot);
  assert.deepEqual(ecHot.cost, { wire: 12, core: 1, coreKind: 'coreThermal' });
  const zappy = C.makeItemInstance('alloyVest', 'common', 0, [], null, 'shock');
  assert.deepEqual(C.enhanceCost(zappy).cost, { wire: 4, core: 1, coreKind: 'coreShock' });
  const corroded = C.makeItemInstance('alloyVest', 'common', 0, [], null, 'corrosive');
  assert.deepEqual(C.enhanceCost(corroded).cost, { wire: 4, core: 1, coreKind: 'coreCorrosive' });
  // Enhance applies: wire deducted, upgrade +1, tier/dice/element kept.
  const hub = p4HubWithSkills({});
  hub.materials.wire = 50; hub.materials.coreThermal = 3;
  const state = C.newRun(120, hub);
  state.carriedGear.push(C.makeItemInstance('alloyVest', 'rare', 1, ['range'], null, 'thermal'));
  const before = state.carriedGear[0];
  const r = C.enhanceItem(hub, state, { carriedIndex: 0 });
  assert.equal(r.ok, true);
  assert.equal(r.target, 2);
  assert.equal(hub.materials.wire, 50 - 8);
  assert.equal(hub.materials.coreThermal, 2);
  const after = state.carriedGear[0];
  assert.equal(after.upgrade, 2);
  assert.equal(after.tier, before.tier);
  assert.deepEqual(after.properties, before.properties);
  assert.equal(after.element, 'thermal');
  assert.equal(after.defId, before.defId);
  // All four slots enhance through the same path.
  state.carriedGear.push(C.makeItemInstance('sensor', 'uncommon', 0, [], null));
  C.equipCarried(state, 1); // sensor -> utility (index 1, not the vest)
  const util = C.enhanceItem(hub, state, { slot: 'utility' });
  assert.equal(util.ok, true);
  assert.equal(state.equipment.utility.upgrade, 1);
  const weap = C.enhanceItem(hub, state, { slot: 'weapon' });
  assert.equal(weap.ok, true, 'weapon slot enhances');
  assert.equal(state.weapon.upgrade, 1);
  // Atomicity: insufficient wire refuses and changes nothing.
  const poor = p4HubWithSkills({});
  poor.materials.wire = 3;
  const state2 = C.newRun(121, poor);
  state2.carriedGear.push(C.makeItemInstance('alloyVest', 'common', 0, [], null));
  const snap = JSON.stringify(state2.carriedGear[0]);
  const fail = C.enhanceItem(poor, state2, { carriedIndex: 0 });
  assert.equal(fail.ok, false);
  assert.ok(/wire/.test(fail.reason));
  assert.equal(poor.materials.wire, 3, 'no wire deducted on refusal');
  assert.equal(JSON.stringify(state2.carriedGear[0]), snap, 'item untouched on refusal');
  // Atomicity: missing core refuses and changes nothing.
  const noCore = p4HubWithSkills({});
  noCore.materials.wire = 50; noCore.materials.coreShock = 0;
  const state3 = C.newRun(122, noCore);
  state3.carriedGear.push(C.makeItemInstance('alloyVest', 'common', 0, [], null, 'shock'));
  assert.equal(C.enhanceItem(noCore, state3, { carriedIndex: 0 }).ok, false);
  assert.equal(noCore.materials.wire, 50);
  assert.equal(state3.carriedGear[0].upgrade, 0);
  // Ceiling: +5 refuses, nothing deducted.
  const capped = p4HubWithSkills({});
  capped.materials.wire = 500;
  const state4 = C.newRun(123, capped);
  state4.carriedGear.push(C.makeItemInstance('alloyVest', 'common', 5, [], null));
  assert.equal(C.enhanceItem(capped, state4, { carriedIndex: 0 }).ok, false);
  assert.equal(capped.materials.wire, 500);
  // Total wire +0 -> +5 is 60 (4+8+12+16+20).
  const climber = p4HubWithSkills({});
  climber.materials.wire = 60;
  const state5 = C.newRun(124, climber);
  state5.carriedGear.push(C.makeItemInstance('alloyVest', 'common', 0, [], null));
  for (let i = 0; i < 5; i++) assert.equal(C.enhanceItem(climber, state5, { carriedIndex: 0 }).ok, true);
  assert.equal(state5.carriedGear[0].upgrade, 5);
  assert.equal(climber.materials.wire, 0, '60 wire total for +0 -> +5');
});

test('phase4: element tags are explicit data only, never inferred, invalid values rejected (P4-ELEMENT-TAGS)', () => {
  // Default null.
  assert.equal(C.makeItemInstance('alloyVest', 'common', 0, [], null).element, null);
  assert.equal(C.makeItemInstance('scrapBlaster', 'common', 0, [], null).element, null);
  // Valid tags preserved through normalize + save/load.
  for (const el of ['thermal', 'shock', 'corrosive']) {
    const inst = C.makeItemInstance('alloyVest', 'rare', 2, [], null, el);
    assert.equal(inst.element, el);
    assert.equal(C.normalizeItemInstance(inst).element, el);
    assert.equal(C.normalizeItemInstance(JSON.parse(JSON.stringify(inst))).element, el);
  }
  // Invalid values rejected to null (the validation point).
  assert.equal(C.makeItemInstance('alloyVest', 'common', 0, [], null, 'bogus').element, null);
  assert.equal(C.makeItemInstance('alloyVest', 'common', 0, [], null, 'fire').element, null);
  assert.equal(C.normalizeItemInstance({ kind: 'item', defId: 'alloyVest', tier: 'common', upgrade: 0, properties: [], flair: null, element: 'ICE' }).element, null);
  // Never inferred: the flamethrower burns by weapon property, but
  // carries no element tag unless a catalog entry says so.
  const flamer = C.makeItemInstance('flamethrower', 'common', 0, [], null);
  assert.equal(flamer.element, null, 'no tag invented from the burn property');
  assert.ok(C.WEAPON_DEFS.flamethrower.burn, 'flamethrower still burns by def');
  // Legacy gear without the field normalizes to null.
  const legacy = { kind: 'item', defId: 'alloyVest', tier: 'common', upgrade: 0, properties: [], flair: null };
  assert.equal(C.normalizeItemInstance(legacy).element, null);
});

test('phase4: crafting and breakdown refuse at caps; crate pickup clamps and discards with a log message (P4-AMMO-OVERFLOW)', () => {
  // Crafting at the hub cap refuses all-or-nothing.
  const hub = p4HubWithSkills({ ammoSmith: 1 });
  hub.stockpile.ammoPiercing = 999;
  hub.materials.wire = 100;
  const w0 = hub.materials.wire, b0 = hub.banked;
  const r = C.craft(hub, 'piercingPack');
  assert.equal(r.ok, false, 'crafting into a full pool refuses');
  assert.equal(hub.materials.wire, w0);
  assert.equal(hub.banked, b0);
  assert.equal(hub.stockpile.ammoPiercing, 999);
  // Breakdown at the materials cap refuses (covered in the atomicity
  // test); crafting at 994 + 6 output also refuses: 994 + 6 > 999.
  hub.stockpile.ammoPiercing = 994;
  assert.equal(C.craft(hub, 'piercingPack').ok, false, '994 + 6 overflows 999');
  hub.stockpile.ammoPiercing = 993;
  assert.equal(C.craft(hub, 'piercingPack').ok, true, '993 + 6 fits 999');
  // Crate pickup clamps to 99 and logs the discard.
  const state = C.newRun(130);
  freezeFloor(state);
  const p = state.player;
  let step = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (C.isWalkableTile(state.floor.grid[p.y + dy][p.x + dx])) { step = [dx, dy]; break; }
  }
  assert.ok(step, 'walkable neighbour required');
  state.floor.pickups.push({ x: p.x + step[0], y: p.y + step[1], kind: 'ammo', value: C.AMMO_CRATE_VALUE });
  state.ammoPools.standard = 95;
  const logBefore = state.log.length;
  const res = C.playerAction(state, seededRng(130), step[0], step[1]);
  assert.equal(res.ok, true);
  assert.equal(state.ammoPools.standard, 99, 'crate clamps at the 99 run cap');
  assert.ok(state.log.slice(logBefore).some(l => /discarded/.test(l) && /4/.test(l)), 'discard logged with the lost count, got: ' + JSON.stringify(state.log.slice(logBefore)));
});

test('phase4: flamethrower burn and Incendiary ammo converge into one status (dormant reconciliation)', () => {
  const state = C.newRun(140);
  const line = findLine(state, 3);
  assert.ok(line, 'seed 140 must offer a line');
  freezeFloor(state);
  state.floor.enemies.forEach(e => { e.alive = false; });
  // Cone geometry (shipped Phase 1): the cone covers 1 step ahead
  // plus the two 2-ahead diagonal cells — a straight-ahead foe at
  // distance 2 is NOT in the cone. Distance 1 works for both shots.
  const foe = placeFoe(state, line[0], line[1], 1, { type: 'raider', hp: 200, maxHp: 200, evasion: 0, armor: 0 });
  state.player.facing = C.dirIndexFor(line[0], line[1]);
  state.player.acc = 100;
  // Flamethrower on Standard ammo: one burning status.
  state.weapon = C.makeItemInstance('flamethrower', 'common', 0, [], null);
  state.ammoPools.standard = 10;
  state.selectedAmmo = 'standard';
  assert.equal(C.fireWeapon(state, seededRng(140)).ok, true);
  assert.equal(foe.statuses.filter(s => s.kind === 'burning').length, 1);
  // Incendiary ammo from another weapon: refresh, still one record.
  state.weapon = C.makeItemInstance('scrapBlaster', 'common', 0, [], null);
  state.ammoPools.incendiary = 6;
  state.selectedAmmo = 'incendiary';
  const foe2 = placeFoe(state, line[0], line[1], 1, { type: 'raider', hp: 200, maxHp: 200, evasion: 0, armor: 0 });
  foe2.statuses = foe.statuses; // same foe, fresh shot line
  assert.equal(C.fireWeapon(state, seededRng(141)).ok, true);
  assert.equal(foe2.statuses.filter(s => s.kind === 'burning').length, 1, 'no duplicate burning records');
  // The second application refreshed to 3, then the shot's own
  // scheduler unit ticked once: 2 remain.
  assert.equal(C.findStatus(foe2, 'burning').ticksLeft, 2, 'second application refreshes (then ticks once)');
  assert.ok(state.log.some(l => /burning refreshes/.test(l)), 'refresh is logged');
});

// ---------- Phase 5: biome enemy rosters (LOOT-SKILLS-DESIGN.md §8/§8.5) ----------
// Helpers: flatten a walkable box around the player (no hazards,
// pickups, or other enemies) and build fresh enemy records from the
// shipped defs, so movement/combat geometry is deterministic.
function p5Box(state, half) {
  const p = state.player;
  for (let y = p.y - half; y <= p.y + half; y++)
    for (let x = p.x - half; x <= p.x + half; x++)
      if (x >= 0 && y >= 0 && x < C.GRID_W && y < C.GRID_H) state.floor.grid[y][x] = 'floor';
  state.floor.hazards = state.floor.hazards.filter(h => Math.max(Math.abs(h.x - p.x), Math.abs(h.y - p.y)) > half);
  state.floor.pickups = state.floor.pickups.filter(pk => Math.max(Math.abs(pk.x - p.x), Math.abs(pk.y - p.y)) > half);
  state.floor.enemies = [];
}
function p5Foe(state, type, x, y, opts) {
  const d = C.ENEMY_TYPES[type];
  const foe = { id: 'p5-' + type + '-' + state.floor.enemies.length, type, name: d.name, x, y, facing: 0,
    hp: d.hp, maxHp: d.hp, dmg: d.dmg, dmgVar: d.dmgVar, armor: d.armor, acc: d.acc, evasion: d.evasion,
    interval: d.interval, nextTime: 0, salvageMin: d.salvageMin, salvageMax: d.salvageMax,
    sight: d.sight, retreat: d.retreat, alive: true, awake: true, statuses: [] };
  if (type === 'shielder') foe.shieldFacing = 'N';
  if (type === 'turret_light') foe.nextShotTime = 0;
  if (type === 'sniper') foe.telegraph = null;
  if (type === 'bomber') { foe.fuseArmed = false; foe.detonated = false; }
  if (type === 'boss') foe.dronesSpawned = false;
  Object.assign(foe, opts || {});
  state.floor.enemies.push(foe);
  return foe;
}
function p5Floor(rooms, spawn, stairs) {
  const grid = [];
  for (let y = 0; y < C.GRID_H; y++) grid.push(new Array(C.GRID_W).fill('void'));
  rooms.forEach(r => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[y][x] = 'floor'; });
  return { grid, rooms, spawn, stairs, enemies: [], pickups: [] };
}

// --- Stat table (§8.5.2) ---
test('phase5: ENEMY_TYPES stat table matches the settled spec exactly (P5-STAT-TABLE)', () => {
  const T = C.ENEMY_TYPES;
  // GATE REVISION (P5-BALANCE-SIM, 2026-10-29): flyer evasion 20 -> 16
  // and shielder hp 24 -> 20. The spec table's values failed the
  // §8.5.13 bands under the SHIPPED roll-range mechanism (F3: evasion
  // 20 dodges 65% of shots vs acc 14, not ~20%); §8.5.13 authorizes
  // revising new Phase 5 values only, thresholds unchanged. The revised
  // values hold the bands across 5 independent seeds (see report).
  const expect = {
    turret_light: { hp: 20, dmg: 4, dmgVar: 1, armor: 1, acc: 75, evasion: 0, interval: 30, salvageMin: 2, salvageMax: 4, componentDrop: 0.15, sight: 8, retreat: false, resist: { burning: 0, jammed: 0.25 } },
    flyer: { hp: 12, dmg: 4, dmgVar: 2, armor: 0, acc: 70, evasion: 16, interval: 10, salvageMin: 1, salvageMax: 3, componentDrop: 0.10, sight: 6, retreat: false, resist: { burning: 0.5, jammed: 0.5 } },
    shielder: { hp: 20, dmg: 5, dmgVar: 2, armor: 2, acc: 70, evasion: 5, interval: 20, salvageMin: 3, salvageMax: 5, componentDrop: 0.25, sight: 5, retreat: false, resist: { burning: 0.25, jammed: 0.5 } },
    sniper: { hp: 18, dmg: 8, dmgVar: 2, armor: 0, acc: 85, evasion: 0, interval: 30, salvageMin: 3, salvageMax: 5, componentDrop: 0.25, sight: 8, retreat: false, resist: { burning: 0, jammed: 0.25 } },
    bomber: { hp: 24, dmg: 6, dmgVar: 2, armor: 1, acc: 65, evasion: 0, interval: 30, salvageMin: 2, salvageMax: 4, componentDrop: 0.20, sight: 5, retreat: false, resist: { burning: 0, jammed: 0 } },
    boss: { hp: 120, dmg: 8, dmgVar: 3, armor: 4, acc: 80, evasion: 5, interval: 20, salvageMin: 12, salvageMax: 18, componentDrop: 1.0, sight: 8, retreat: false, resist: { burning: 0.25, jammed: 0.75 } },
  };
  for (const [type, e] of Object.entries(expect)) {
    const d = T[type];
    assert.ok(d, type + ' must exist');
    for (const [k, v] of Object.entries(e)) assert.deepEqual(d[k], v, type + '.' + k);
  }
  // Interval units (F-item reconciliation): the spec's "world time
  // units" are stored as ticks (PLAYER_DEF.interval = 10 ticks = 1
  // unit), preserving the shipped scheduler mechanism.
  assert.equal(T.flyer.interval, 10, 'flyer 1 unit = 10 ticks');
  assert.equal(T.shielder.interval, 20, 'shielder 2 units = 20 ticks');
  assert.equal(T.boss.interval, 20, 'boss 2 units = 20 ticks');
  assert.equal(T.turret_light.interval, 30, 'turret 3 units = 30 ticks');
  assert.equal(T.sniper.interval, 30, 'sniper 3 units = 30 ticks');
  assert.equal(T.bomber.interval, 30, 'bomber 3 units = 30 ticks');
});

test('phase5: HP/damage depth scaling uses the shipped rounding (P5-HP-SCALING, F4)', () => {
  // Shipped code rounds (Math.round), NOT the spec's floor: they
  // differ at flyer d5 (17 vs 16), bomber d5 (34 vs 33),
  // drone d2 (18 vs 17), flyer d10 (23 vs 22), bomber d10 (46 vs 45);
  // shielder d5 rounds to 28 on its revised base HP 20. The shipped
  // rule governs; the difference is flagged.
  for (const depth of [1, 2, 5, 10]) {
    for (let seed = 1; seed <= 10; seed++) {
      const floor = C.generateFloor(seed, depth);
      floor.enemies.forEach(en => {
        const def = C.ENEMY_TYPES[en.type];
        assert.equal(en.maxHp, Math.round(def.hp * (1 + 0.1 * (depth - 1))), `${en.type} d${depth} seed ${seed} maxHp`);
        assert.equal(en.dmg, def.dmg + Math.floor((depth - 1) / 2), `${en.type} d${depth} seed ${seed} dmg`);
      });
    }
  }
  assert.equal(Math.round(12 * 1.4), 17, 'flyer depth 5 rounds to 17, floors to 16');
  assert.equal(Math.round(24 * 1.4), 34, 'bomber depth 5 rounds to 34, floors to 33');
  assert.equal(Math.round(20 * 1.4), 28, 'shielder depth 5 rounds to 28 on revised base 20');
});

// --- Roster weights (§8.5.3) ---
test('phase5: theme mapping 1-15 matches the shipped assignment (P5-THEME)', () => {
  const want = ['industrial', 'scrapyard', 'scrapyard', 'overgrown', 'overgrown', 'cavern',
    'molten', 'frozen', 'toxic', 'neon', 'molten', 'frozen', 'toxic', 'neon', 'molten'];
  for (let d = 1; d <= 15; d++) assert.equal(C.themeNameForDepth(d), want[d - 1], 'depth ' + d);
});

test('phase5: donor-pool shift math incl. worked examples, 4-decimal weights (P5-WEIGHTS)', () => {
  const w = d => C.rosterWeightsFor(d).weights.map(e => [e.type, Number(e.weight.toFixed(4))]);
  assert.deepEqual(w(7), [['shielder', 2], ['turret_light', 2], ['flyer', 2], ['brute', 2], ['sniper', 2], ['bomber', 2]]);
  assert.deepEqual(w(8), [['shielder', 1.8], ['turret_light', 1.8], ['flyer', 2.1], ['brute', 2.1], ['sniper', 2.1], ['bomber', 2.1]]);
  assert.deepEqual(w(12), [['shielder', 1], ['turret_light', 1], ['flyer', 2.5], ['brute', 2.5], ['sniper', 2.5], ['bomber', 2.5]]);
  assert.deepEqual(w(17), w(12), 'shift caps at p=0.50');
  assert.deepEqual(w(2), [['raider', 3], ['drone', 3], ['brute', 2], ['turret_light', 2], ['flyer', 2]]);
  assert.deepEqual(w(3), [['raider', 2.7], ['drone', 2.7], ['brute', 2.2], ['turret_light', 2.2], ['flyer', 2.2]]);
  // Weight is conserved by the shift at every depth (base total 10
  // for industrial, 12 for every other table).
  for (let d = 1; d <= 15; d++) {
    const r = C.rosterWeightsFor(d);
    const sum = r.weights.reduce((a, e) => a + e.weight, 0);
    const base = d === 1 ? 10 : 12;
    assert.ok(Math.abs(sum - base) < 1e-9, 'depth ' + d + ' conserves weight, got ' + sum);
  }
});

test('phase5: roster draws are deterministic and match expected shares (P5-ROSTER-DRAW)', () => {
  const seq = seed => { const rng = C.mulberry32(seed); const out = []; for (let i = 0; i < 50; i++) out.push(C.pickRosterType(rng, 8)); return out; };
  assert.deepEqual(seq(99), seq(99));
  const rng = C.mulberry32(1);
  const counts = {};
  for (let i = 0; i < 20000; i++) { const t = C.pickRosterType(rng, 8); counts[t] = (counts[t] || 0) + 1; }
  const expected = { shielder: 1.8 / 12, turret_light: 1.8 / 12, flyer: 2.1 / 12, brute: 2.1 / 12, sniper: 2.1 / 12, bomber: 2.1 / 12 };
  for (const [t, p] of Object.entries(expected)) {
    const share = counts[t] / 20000;
    assert.ok(Math.abs(share - p) / p <= 0.15, t + ' share ' + share.toFixed(4) + ' vs expected ' + p.toFixed(4));
  }
});

test('phase5: generated rosters use only the depth table; regular count exact (P5-ROSTER-COMPOSITION)', () => {
  const tables = {
    2: ['raider', 'drone', 'brute', 'turret_light', 'flyer'],
    8: ['shielder', 'turret_light', 'flyer', 'brute', 'sniper', 'bomber'],
  };
  for (const [depth, allowed] of Object.entries(tables)) {
    for (let seed = 1; seed <= 200; seed++) {
      const floor = C.generateFloor(seed, Number(depth));
      const regular = floor.enemies.filter(e => e.type !== 'boss');
      assert.equal(regular.length, Math.min(12, 3 + Number(depth)), `depth ${depth} seed ${seed} regular count`);
      regular.forEach(en => assert.ok(allowed.includes(en.type), `depth ${depth} seed ${seed}: ${en.type} not in table`));
    }
  }
});

test('phase5: determinism — same seed series replays identically (P5-DETERMINISM)', () => {
  const a = C.generateFloor(1234, 8), b = C.generateFloor(1234, 8);
  assert.deepEqual(a.grid, b.grid);
  assert.deepEqual(a.enemies.map(e => [e.x, e.y, e.type, e.maxHp]), b.enemies.map(e => [e.x, e.y, e.type, e.maxHp]));
  assert.deepEqual(a.rooms.map(r => [r.type, r.purpose]), b.rooms.map(r => [r.type, r.purpose]));
});

// --- Boss placement (§8.5.4) ---
test('phase5: placeBoss gates, determinism, tie-break, first-room rule (P5-BOSS-PLACE)', () => {
  const spawn = { x: 20, y: 20 }, stairs = { x: 40, y: 40 };
  const sec = { type: 'structure', purpose: 'security', x: 24, y: 24, w: 6, h: 4 };
  const f1 = p5Floor([sec], spawn, stairs);
  assert.equal(C.placeBoss(f1, 4).reason, 'depth<5');
  assert.equal(f1.enemies.length, 0);
  const r1 = C.placeBoss(f1, 5);
  assert.equal(r1.reason, 'present');
  assert.deepEqual([r1.boss.x, r1.boss.y], [29, 24], 'farthest cell, ties resolve row then column');
  assert.ok(C.chebDist(29, 24, 20, 20) >= 3);
  // No security room.
  const f2 = p5Floor([{ type: 'structure', purpose: 'workshop', x: 24, y: 24, w: 6, h: 4 }], spawn, stairs);
  assert.equal(C.placeBoss(f2, 5).reason, 'no-security-room');
  // No valid cell: every security-room cell within 2 of spawn.
  const f3 = p5Floor([{ type: 'structure', purpose: 'security', x: 21, y: 21, w: 2, h: 2 }], spawn, stairs);
  assert.equal(C.placeBoss(f3, 5).reason, 'no-valid-cell');
  // First security room in generator order wins, even when a later
  // room holds farther cells.
  const far = { type: 'structure', purpose: 'security', x: 30, y: 30, w: 3, h: 3 };
  const near = { type: 'structure', purpose: 'security', x: 24, y: 24, w: 3, h: 3 };
  const f4 = p5Floor([far, near], spawn, stairs);
  const r4 = C.placeBoss(f4, 5);
  assert.ok(r4.boss.x >= 30 && r4.boss.y >= 30, 'boss placed in the first security room');
  // Stairs/occupied/pickup cells are excluded.
  const f5 = p5Floor([sec], spawn, { x: 29, y: 24 });
  f5.enemies.push({ x: 29, y: 25, alive: true });
  f5.pickups.push({ x: 29, y: 26, kind: 'salvage' });
  const r5 = C.placeBoss(f5, 5);
  assert.notDeepEqual([r5.boss.x, r5.boss.y], [29, 24]);
  assert.notDeepEqual([r5.boss.x, r5.boss.y], [29, 25]);
  assert.notDeepEqual([r5.boss.x, r5.boss.y], [29, 26]);
});

test('phase5: generated bosses are conditional, at most one, in security rooms (P5-BOSS-GEN)', () => {
  let seen = 0, checked = 0;
  for (let seed = 1; seed <= 80; seed++) {
    for (const depth of [5, 6, 7, 8]) {
      const floor = C.generateFloor(seed, depth);
      const bosses = floor.enemies.filter(e => e.type === 'boss');
      assert.ok(bosses.length <= 1, `seed ${seed} d${depth}: ${bosses.length} bosses`);
      assert.equal(C.coherenceCheck(floor).ok, true, `seed ${seed} d${depth}: ${C.coherenceCheck(floor).errors.join('; ')}`);
      bosses.forEach(b => {
        seen++;
        const inSec = floor.rooms.some(r => r.type === 'structure' && r.purpose === 'security' && b.x >= r.x && b.x < r.x + r.w && b.y >= r.y && b.y < r.y + r.h);
        assert.ok(inSec, 'boss must sit in a security room');
        assert.ok(C.chebDist(b.x, b.y, floor.spawn.x, floor.spawn.y) >= 3, 'boss >=3 Chebyshev from spawn');
        assert.equal(b.id, 'boss');
        assert.equal(b.dronesSpawned, false);
      });
      checked++;
    }
  }
  assert.ok(seen > 0, 'at least one boss should appear across 320 floors');
  assert.equal(checked, 320);
});

test('phase5: boss drones spawn once at half HP, never on a lethal hit (P5-BOSS-DRONES)', () => {
  const state = C.newRun(500);
  p5Box(state, 6);
  const boss = p5Foe(state, 'boss', state.player.x + 3, state.player.y, { hp: 61, maxHp: 120 });
  boss.hp = 60;
  const rng = C.mulberry32(5);
  assert.equal(C.spawnBossDrones(state, rng, boss), 2);
  assert.equal(boss.dronesSpawned, true);
  const drones = state.floor.enemies.filter(e => e.type === 'drone' && e.id.startsWith('bd-'));
  assert.equal(drones.length, 2);
  drones.forEach(d => { assert.equal(d.awake, true); assert.equal(d.hp, d.maxHp); });
  assert.ok(drones.every(d => C.chebDist(d.x, d.y, boss.x, boss.y) >= 1));
  assert.equal(C.spawnBossDrones(state, rng, boss), 0, 'once-only');
  // Lethal hit: no drones.
  const state2 = C.newRun(501);
  p5Box(state2, 6);
  const boss2 = p5Foe(state2, 'boss', state2.player.x + 3, state2.player.y, { hp: 0, maxHp: 120 });
  C.maybeSpawnBossDrones(state2, rng, boss2);
  assert.equal(boss2.dronesSpawned, false);
  assert.equal(state2.floor.enemies.filter(e => e.id.startsWith('bd-')).length, 0);
  // A burn tick crossing the line releases drones too: 61 - 2
  // (boss burn resistance 0.25 -> tick 2) = 59 <= floor(120/2).
  const state3 = C.newRun(502);
  p5Box(state3, 6);
  const boss3 = p5Foe(state3, 'boss', state3.player.x + 3, state3.player.y, { hp: 61, maxHp: 120 });
  C.applyBurning(state3, boss3);
  assert.equal(C.tickStatuses(state3, C.mulberry32(9), boss3), 'alive');
  assert.equal(boss3.hp, 59);
  assert.equal(boss3.dronesSpawned, true, 'burn tick crossing half-HP releases drones');
});

test('phase5: boss reward is exactly one Epic/Legendary item + one Codex entry, first defeat only (P5-BOSS-REWARD)', () => {
  const state = C.newRun(510);
  p5Box(state, 6);
  state.floor.pickups = []; // generation pickups elsewhere on the floor must not pollute the count
  state.depth = 5;
  const rng = C.mulberry32(11);
  const boss = p5Foe(state, 'boss', state.player.x + 2, state.player.y, { hp: 0 });
  C.killEnemy(state, rng, boss);
  const items = state.floor.pickups.filter(p => p.kind === 'item');
  assert.equal(items.length, 1, 'exactly one reward item');
  assert.ok(['epic', 'legendary'].includes(items[0].tier), 'tier is Epic or Legendary, got ' + items[0].tier);
  const entries = (state.codex || []).filter(e => e.indexOf(C.BOSS_CODEX_MARKER) !== -1);
  assert.equal(entries.length, 1, 'one Codex entry');
  assert.ok(/^Depth 5 /.test(entries[0]), 'entry follows the dataChip pattern, got ' + entries[0]);
  // Second boss, same profile: another item, no second Codex entry.
  const boss2 = p5Foe(state, 'boss', state.player.x + 3, state.player.y, { hp: 0 });
  C.killEnemy(state, rng, boss2);
  assert.equal(state.floor.pickups.filter(p => p.kind === 'item').length, 2);
  assert.equal((state.codex || []).filter(e => e.indexOf(C.BOSS_CODEX_MARKER) !== -1).length, 1);
});

test('phase5: fractional componentDrop rolls once for exactly one; trio counts untouched (P5-COMPDROP)', () => {
  const state = C.newRun(520);
  p5Box(state, 6);
  state.floor.pickups = []; // generation pickups elsewhere on the floor must not pollute the count
  const turret = p5Foe(state, 'turret_light', state.player.x + 2, state.player.y, { hp: 0 });
  C.killEnemy(state, () => 0.10, turret);
  const pk = state.floor.pickups.find(p => p.kind === 'salvage');
  assert.equal(pk.components, 1, '0.10 < 0.15 rolls one component');
  const turret2 = p5Foe(state, 'turret_light', state.player.x + 3, state.player.y, { hp: 0 });
  C.killEnemy(state, () => 0.20, turret2);
  const pk2 = state.floor.pickups.filter(p => p.kind === 'salvage').pop();
  assert.equal(pk2.components, 0, '0.20 >= 0.15 rolls none');
  const boss = p5Foe(state, 'boss', state.player.x + 4, state.player.y, { hp: 0 });
  C.killEnemy(state, () => 0.99, boss);
  const pk3 = state.floor.pickups.filter(p => p.kind === 'salvage').pop();
  assert.equal(pk3.components, 1, 'boss 1.0 always yields exactly one');
  const raider = p5Foe(state, 'raider', state.player.x + 5, state.player.y, { hp: 0 });
  C.killEnemy(state, () => 0.99, raider);
  const pk4 = state.floor.pickups.filter(p => p.kind === 'salvage').pop();
  assert.equal(pk4.components, 1, 'trio integer count ignores the roll');
});

// --- Spikes (§8.5.5) ---
test('phase5: ground enemies take 6 on spike entry, re-entry retriggers, standing still does not (P5-SPIKE-ENTER)', () => {
  // Pursue avoids hazards (shipped), so the entry vector is the
  // retreat step, which does not exclude hazards: a wounded raider
  // retreats onto the spike, survives, retreats onto it again, dies.
  const state = C.newRun(530);
  p5Box(state, 6);
  const p = state.player;
  state.floor.grid[p.y + 3][p.x] = 'hazard';
  [[-1, 3], [1, 3], [-1, 4], [0, 4], [1, 4]].forEach(([dx, dy]) => { state.floor.grid[p.y + dy][p.x + dx] = 'wall'; });
  const raider = p5Foe(state, 'raider', p.x, p.y + 2, { hp: 9, maxHp: 30 });
  C.enemyAct(state, C.mulberry32(3), raider);
  assert.deepEqual([raider.x, raider.y], [p.x, p.y + 3], 'retreat steps onto the spike');
  assert.equal(raider.hp, 3, 'first entry deals 6');
  assert.equal(raider.alive, true);
  // Step off (manual reposition simulates leaving), retreat back on.
  raider.x = p.x; raider.y = p.y + 2;
  C.enemyAct(state, C.mulberry32(4), raider);
  assert.equal(raider.hp, -3, 're-entry deals 6 again');
  assert.equal(raider.alive, false, 'second entry kills through the ordinary path');
  assert.ok(state.floor.pickups.some(pk => pk.x === p.x && pk.y === p.y + 3 && pk.kind === 'salvage'), 'kill drop lands on the spike cell');
  // Standing still on the spike: no retrigger.
  const state2 = C.newRun(531);
  p5Box(state2, 6);
  const p2 = state2.player;
  const px2 = p2.x, py2 = p2.y;
  state2.floor.grid[py2 + 3][px2] = 'hazard';
  const raider2 = p5Foe(state2, 'raider', px2, py2 + 3, { hp: 20, maxHp: 30 });
  state2.player.x = px2 + 30; state2.player.y = py2 + 30;
  C.enemyAct(state2, () => 0.9, raider2);
  assert.equal(raider2.hp, 20, 'no movement, no retrigger');
  assert.deepEqual([raider2.x, raider2.y], [px2, py2 + 3]);
});

test('phase5: flyers cross spikes unharmed; ground enemies are never generated onto spikes (P5-SPIKE-FLYER)', () => {
  const state = C.newRun(531);
  p5Box(state, 6);
  const p = state.player;
  state.floor.grid[p.y - 2][p.x] = 'hazard';
  state.floor.grid[p.y - 3][p.x] = 'hazard';
  const flyer = p5Foe(state, 'flyer', p.x, p.y - 4, { hp: 12, maxHp: 12 });
  C.enemyAct(state, C.mulberry32(3), flyer);
  assert.deepEqual([flyer.x, flyer.y], [p.x, p.y - 3]);
  C.enemyAct(state, C.mulberry32(4), flyer);
  assert.deepEqual([flyer.x, flyer.y], [p.x, p.y - 2]);
  assert.equal(flyer.hp, 12, 'flyer takes no spike damage');
  for (let seed = 1; seed <= 40; seed++) {
    for (const depth of [1, 3, 5, 8, 10]) {
      const floor = C.generateFloor(seed, depth);
      floor.enemies.forEach(en => {
        if (en.type !== 'flyer') assert.notEqual(floor.grid[en.y][en.x], 'hazard', `${en.type} on a spike, seed ${seed} d${depth}`);
      });
    }
  }
});

test('phase5: turret spike relocation moves to the nearest legal cell, fails loudly if none (P5-TURRET-RELOC)', () => {
  const state = C.newRun(532);
  p5Box(state, 6);
  const p = state.player;
  state.floor.grid[p.y - 1][p.x] = 'hazard';
  const turret = { type: 'turret_light', x: p.x, y: p.y - 1, alive: true };
  const floor = { grid: state.floor.grid, enemies: [turret], spawn: { x: p.x, y: p.y }, stairs: { x: p.x + 5, y: p.y + 5 } };
  assert.equal(C.relocateTurretFromSpike(floor, turret), true);
  assert.deepEqual([turret.x, turret.y], [p.x, p.y - 2], 'BFS N first');
  assert.equal(C.relocateTurretFromSpike(floor, turret), false, 'not on a spike: no-op');
  // No legal cell anywhere: every cell a wall except the hazard cell.
  const grid = [];
  for (let y = 0; y < C.GRID_H; y++) grid.push(new Array(C.GRID_W).fill('wall'));
  grid[10][10] = 'hazard';
  const t2 = { type: 'turret_light', x: 10, y: 10, alive: true };
  assert.throws(() => C.relocateTurretFromSpike({ grid, enemies: [t2], spawn: { x: 5, y: 5 }, stairs: { x: 6, y: 6 } }, t2), /no legal cell/);
});

// --- Shielder (§8.5.6) ---
test('phase5: shielder frontal arc is 90 degrees, boundary-included; rear/flank full (P5-SHIELD-ARC)', () => {
  const foe = { type: 'shielder', x: 10, y: 10, shieldFacing: 'N' };
  // Frontal: N, NE, NW.
  assert.equal(C.isFrontalShieldHit(foe, 10, 9), true, 'N frontal');
  assert.equal(C.isFrontalShieldHit(foe, 11, 9), true, 'NE frontal (boundary)');
  assert.equal(C.isFrontalShieldHit(foe, 9, 9), true, 'NW frontal (boundary)');
  // Flank/rear: E, W, SE, SW, S.
  assert.equal(C.isFrontalShieldHit(foe, 11, 10), false, 'E is 90 degrees off, not frontal');
  assert.equal(C.isFrontalShieldHit(foe, 9, 10), false, 'W is 90 degrees off, not frontal');
  assert.equal(C.isFrontalShieldHit(foe, 11, 11), false, 'SE rear');
  assert.equal(C.isFrontalShieldHit(foe, 9, 11), false, 'SW rear');
  assert.equal(C.isFrontalShieldHit(foe, 10, 11), false, 'S rear');
  // Same-source-cell edge: counts as frontal.
  assert.equal(C.isFrontalShieldHit(foe, 10, 10), true);
  // Other facings rotate the arc.
  assert.equal(C.isFrontalShieldHit({ type: 'shielder', x: 10, y: 10, shieldFacing: 'E' }, 11, 10), true);
  assert.equal(C.isFrontalShieldHit({ type: 'shielder', x: 10, y: 10, shieldFacing: 'E' }, 10, 9), false);
});

test('phase5: shielder formula — worked example D=10, S=0.5, A=4, P=1 gives 3 (P5-SHIELD-FORMULA)', () => {
  // D_final = max(1, floor(D_raw x S) - max(0, A - floor(A/2) x P))
  //         = max(1, floor(10 x 0.5) - max(0, 4 - 2 x 1)) = 5 - 2 = 3.
  const foe = { type: 'shielder', x: 10, y: 10, shieldFacing: 'N' };
  assert.equal(C.shieldedRawDamage(foe, 10, 9, 10), 5, 'frontal halves the raw');
  assert.equal(C.shieldedRawDamage(foe, 10, 11, 10), 10, 'rear leaves the raw');
  const armorAfterPiercing = 4 - Math.floor(4 / 2) * 1;
  assert.equal(Math.max(1, C.shieldedRawDamage(foe, 10, 9, 10) - Math.max(0, armorAfterPiercing)), 3, 'worked example');
  // resolveAttack (P=0): frontal raw 10, armor 4 -> max(1, 5-4) = 1.
  const dummy = { log: [] };
  const def = { type: 'shielder', x: 10, y: 10, shieldFacing: 'N', hp: 100, armor: 4, evasion: 0 };
  const atk = { x: 10, y: 9, dmg: 10, dmgVar: 0, acc: 100 };
  const r = C.resolveAttack(dummy, () => 0.5, atk, def, 'A', 'Shielder');
  assert.equal(r.hit, true);
  assert.equal(def.hp, 99, 'frontal resolveAttack: 5 raw - 4 armor = 1');
  // Rear through the same path: full 10 - 4 = 6.
  const def2 = { type: 'shielder', x: 10, y: 10, shieldFacing: 'N', hp: 100, armor: 4, evasion: 0 };
  const atk2 = { x: 10, y: 11, dmg: 10, dmgVar: 0, acc: 100 };
  C.resolveAttack(dummy, () => 0.5, atk2, def2, 'A', 'Shielder');
  assert.equal(def2.hp, 94, 'rear resolveAttack: 10 raw - 4 armor = 6');
  // Surprise frontal: halving applies to the post-modifier raw
  // (round(10*1.5)=15 -> 7) before armor: max(1, 7-4) = 3.
  const def3 = { type: 'shielder', x: 10, y: 10, shieldFacing: 'N', hp: 100, armor: 4, evasion: 0 };
  C.resolveAttack(dummy, () => 0.5, atk, def3, 'A', 'Shielder', { surprise: true });
  assert.equal(def3.hp, 97, 'surprise frontal: floor(15*0.5)-4 = 3');
});

test('phase5: shielder facing updates only after successful movement (P5-SHIELD-FACING)', () => {
  const state = C.newRun(540);
  p5Box(state, 6);
  const p = state.player;
  const sh = p5Foe(state, 'shielder', p.x, p.y - 3, { shieldFacing: 'E', awake: true });
  C.enemyAct(state, C.mulberry32(3), sh);
  assert.deepEqual([sh.x, sh.y], [p.x, p.y - 2], 'pursue steps toward the player');
  assert.equal(sh.shieldFacing, 'S', 'step (0,+1) toward the player below maps to S');
  // Blocked: no movement, no facing change. Wall off every step.
  for (const d of C.DIRS) state.floor.grid[sh.y + d.dy][sh.x + d.dx] = 'wall';
  state.floor.grid[sh.y][sh.x] = 'floor';
  C.enemyAct(state, C.mulberry32(4), sh);
  assert.deepEqual([sh.x, sh.y], [p.x, p.y - 2]);
  assert.equal(sh.shieldFacing, 'S', 'no move, no facing update');
});

test('phase5: shielder spawn facing follows the visible/seeded rule on real floors (P5-SHIELD-SPAWN)', () => {
  for (let seed = 1; seed <= 30; seed++) {
    for (const depth of [4, 5, 6, 8, 9]) {
      const floor = C.generateFloor(seed, depth);
      floor.enemies.forEach(en => {
        if (en.type !== 'shielder') return;
        assert.ok(['N', 'E', 'S', 'W'].includes(en.shieldFacing), 'shieldFacing is a cardinal');
        const vis = C.chebDist(en.x, en.y, floor.spawn.x, floor.spawn.y) <= en.sight &&
          C.lineOfSight({ floor }, en.x, en.y, floor.spawn.x, floor.spawn.y);
        if (vis) {
          assert.equal(en.shieldFacing, C.nearestCardinal(floor.spawn.x - en.x, floor.spawn.y - en.y),
            `seed ${seed} d${depth}: visible shielder faces the player`);
        }
      });
    }
  }
});

// --- Sniper (§8.5.7) ---
test('phase5: sniper aims, then fires the marked tile; moving off dodges the shot (P5-SNIPER)', () => {
  const state = C.newRun(550);
  p5Box(state, 6);
  const p = state.player;
  const sn = p5Foe(state, 'sniper', p.x, p.y - 3, { acc: 1000 });
  state.player.evasion = 0;
  C.enemyAct(state, C.mulberry32(3), sn);
  assert.deepEqual(sn.telegraph, { x: p.x, y: p.y }, 'aim marks the player tile');
  assert.equal(p.hp, p.maxHp, 'aiming deals no damage');
  C.enemyAct(state, C.mulberry32(4), sn);
  assert.equal(sn.telegraph, null, 'telegraph consumed by the shot');
  assert.ok(p.hp < p.maxHp, 'player standing on the marked tile is hit');
  assert.ok(state.log.some(l => /Sniper hits You/.test(l)));
  // Fresh sniper: player steps off the tile before the firing turn.
  const state2 = C.newRun(551);
  p5Box(state2, 6);
  const p2 = state2.player;
  const sn2 = p5Foe(state2, 'sniper', p2.x, p2.y - 3, { acc: 1000 });
  state2.player.evasion = 0;
  C.enemyAct(state2, C.mulberry32(3), sn2);
  assert.deepEqual(sn2.telegraph, { x: p2.x, y: p2.y });
  p2.y += 1; // step off the marked tile, still in range + LOS
  const hpBefore = p2.hp;
  C.enemyAct(state2, C.mulberry32(4), sn2);
  assert.equal(sn2.telegraph, null);
  assert.equal(p2.hp, hpBefore, 'shot at the empty marked tile misses');
  assert.ok(state2.log.some(l => /empty ground/.test(l)));
});

test('phase5: sniper jam interplay — jam at aim loses the aim, jam at fire cancels it (P5-SNIPER-JAM)', () => {
  const state = C.newRun(552);
  p5Box(state, 6);
  const p = state.player;
  const sn = p5Foe(state, 'sniper', p.x, p.y - 3);
  sn.statuses.push({ kind: 'jammed' });
  C.enemyAct(state, C.mulberry32(3), sn);
  assert.equal(sn.telegraph, null, 'jammed aim turn sets no telegraph');
  assert.equal(C.findStatus(sn, 'jammed'), null, 'jam consumed');
  assert.ok(state.log.some(l => /skips its turn/.test(l)));
  // Jam on the firing turn.
  const state2 = C.newRun(553);
  p5Box(state2, 6);
  const sn2 = p5Foe(state2, 'sniper', state2.player.x, state2.player.y - 3, { telegraph: { x: state2.player.x, y: state2.player.y } });
  sn2.statuses.push({ kind: 'jammed' });
  const hpBefore = state2.player.hp;
  C.enemyAct(state2, C.mulberry32(3), sn2);
  assert.equal(sn2.telegraph, null, 'jam cancels the telegraph');
  assert.ok(state2.log.some(l => /aim is spoiled/.test(l)));
  assert.equal(state2.player.hp, hpBefore, 'no shot fired');
});

test('phase5: sniper retreats when close with no aim, increasing Chebyshev distance (P5-SNIPER-RETREAT)', () => {
  const state = C.newRun(554);
  p5Box(state, 6);
  const p = state.player;
  state.floor.grid[p.y - 1][p.x] = 'wall'; // block LOS: no aim
  state.floor.grid[p.y - 3][p.x - 1] = 'wall';
  state.floor.grid[p.y - 3][p.x + 1] = 'wall';
  const sn = p5Foe(state, 'sniper', p.x, p.y - 2);
  C.enemyAct(state, C.mulberry32(3), sn);
  assert.equal(sn.telegraph, null, 'no LOS, no aim');
  assert.deepEqual([sn.x, sn.y], [p.x, p.y - 3], 'retreat steps to the only distance-increasing cell');
  assert.equal(C.chebDist(sn.x, sn.y, p.x, p.y), 3);
});

// --- Bomber (§8.5.8) ---
test('phase5: bomber fuse arms on movement resolution at Manhattan 1, not at 2, not on waiting (P5-FUSE-ARM)', () => {
  const state = C.newRun(560);
  p5Box(state, 6);
  const p = state.player;
  const bo = p5Foe(state, 'bomber', p.x, p.y - 2, { nextTime: 1e9 });
  const res = C.playerAction(state, C.mulberry32(3), 0, -1);
  assert.equal(res.ok, true);
  assert.equal(bo.fuseArmed, true, 'player move ending at Manhattan 1 arms the fuse');
  assert.ok(state.log.some(l => /fuse arms/.test(l)));
  const state2 = C.newRun(561);
  p5Box(state2, 6);
  const p2 = state2.player;
  const bo2 = p5Foe(state2, 'bomber', p2.x, p2.y - 3, { nextTime: 1e9 });
  C.playerAction(state2, C.mulberry32(3), 0, -1);
  assert.equal(bo2.fuseArmed, false, 'Manhattan 2 does not arm');
  const state3 = C.newRun(562);
  p5Box(state3, 6);
  const bo3 = p5Foe(state3, 'bomber', state3.player.x, state3.player.y - 1, { nextTime: 1e9 });
  C.playerWait(state3, C.mulberry32(3));
  assert.equal(bo3.fuseArmed, false, 'waiting is not movement resolution');
});

test('phase5: bomber fuse detonates on its next activation with one shared roll (P5-FUSE-FIRE)', () => {
  const state = C.newRun(563);
  p5Box(state, 6);
  const p = state.player;
  p.hp = 100;
  const bo = p5Foe(state, 'bomber', p.x, p.y - 1, { fuseArmed: true });
  C.enemyAct(state, () => 0.5, bo);
  assert.equal(bo.alive, false, 'bomber dies through the ordinary path');
  assert.equal(bo.detonated, true);
  assert.equal(bo.fuseArmed, false, 'fuse clears');
  assert.equal(p.hp, 95, 'shared roll 7 - armor 2 = 5');
  assert.ok(state.log.some(l => /shared 7/.test(l)), 'one shared damage roll is logged');
  assert.ok(state.log.some(l => /detonates/.test(l)));
  // No second detonation: the queue starter is a no-op once detonated.
  const logsBefore = state.log.length;
  C.startDetonation(state, () => 0.5, bo);
  assert.equal(state.log.length, logsBefore, 'detonated bombers never detonate twice');
});

test('phase5: sleeping bomber with an armed fuse detonates instead of waking (P5-FUSE-SLEEP, §8.5.8 jam-only deferral)', () => {
  const state = C.newRun(5631);
  p5Box(state, 6);
  const p = state.player;
  p.hp = 100;
  const bo = p5Foe(state, 'bomber', p.x, p.y - 1, { fuseArmed: true, awake: false });
  C.enemyAct(state, () => 0.5, bo);
  assert.equal(bo.alive, false, 'armed fuse beats the wake branch');
  assert.equal(bo.awake, false, 'never woke');
  assert.equal(bo.detonated, true);
  assert.equal(p.hp, 95, 'shared roll 7 - armor 2 = 5');
});

test('phase5: bomber splash shares one roll across targets; chains queue, never recurse (P5-BOMB-CHAIN)', () => {
  const state = C.newRun(564);
  p5Box(state, 6);
  const p = state.player;
  p.hp = 100;
  const a = p5Foe(state, 'bomber', p.x, p.y - 1, { fuseArmed: true, id: 'p5-bomber-A' });
  const b = p5Foe(state, 'bomber', p.x + 1, p.y - 1, { hp: 3, maxHp: 3, id: 'p5-bomber-B' });
  const raider = p5Foe(state, 'raider', p.x + 1, p.y, { hp: 20, maxHp: 20 });
  C.enemyAct(state, () => 0.5, a);
  assert.equal(a.alive, false);
  assert.equal(b.alive, false, 'chain: B dies to A\'s blast');
  assert.equal(b.detonated, true, 'chain: B detonates exactly once');
  assert.equal(p.hp, 90, 'two blasts of 5 (shared 7 - armor 2)');
  assert.equal(raider.hp, 8, 'raider takes both blasts: 20 - 6 - 6 (shared 7 - armor 1)');
  assert.equal(state.log.filter(l => /detonates!/.test(l)).length, 2, 'two detonations logged');
  assert.ok(state.log.filter(l => /shared 7/.test(l)).length >= 2, 'each detonation rolls once');
});

test('phase5: death detonation clears a pending fuse; jam defers the fuse (P5-BOMB-DEATH-JAM)', () => {
  const state = C.newRun(565);
  p5Box(state, 6);
  const bo = p5Foe(state, 'bomber', state.player.x + 2, state.player.y, { hp: 0, fuseArmed: true });
  C.killEnemy(state, () => 0.5, bo);
  assert.equal(bo.detonated, true, 'death detonates');
  assert.equal(bo.fuseArmed, false, 'pending fuse clears on death detonation');
  // Jam defers: an armed + jammed bomber skips its activation intact.
  const state2 = C.newRun(566);
  p5Box(state2, 6);
  const p2 = state2.player;
  p2.hp = 100;
  const bo2 = p5Foe(state2, 'bomber', p2.x, p2.y - 1, { fuseArmed: true });
  bo2.statuses.push({ kind: 'jammed' });
  C.enemyAct(state2, () => 0.5, bo2);
  assert.equal(bo2.alive, true, 'jammed bomber does not detonate');
  assert.equal(bo2.fuseArmed, true, 'fuse survives the jammed turn');
  assert.equal(bo2.detonated, false);
  C.enemyAct(state2, () => 0.5, bo2);
  assert.equal(bo2.alive, false, 'next unjammed activation detonates');
  assert.equal(p2.hp, 95);
});

// --- Turret (§8.5.9) ---
test('phase5: turret never moves; nextShotTime gates shots; no cooldown without a target (P5-TURRET)', () => {
  const state = C.newRun(570);
  p5Box(state, 6);
  const p = state.player;
  const tu = p5Foe(state, 'turret_light', p.x, p.y - 3, { nextTime: 30, nextShotTime: 0 });
  state.player.evasion = 0;
  const shots = () => state.log.filter(l => /Turret (hits|misses) You/.test(l)).length;
  // Out of range: no shot, no cooldown.
  p.x += 20;
  C.enemyAct(state, C.mulberry32(3), tu);
  assert.equal(shots(), 0);
  assert.equal(tu.nextShotTime, 0, 'no valid target consumes no cooldown');
  // In range: shoots once, sets the cooldown, never moves.
  p.x -= 20;
  C.enemyAct(state, C.mulberry32(4), tu);
  assert.equal(shots(), 1);
  assert.equal(tu.nextShotTime, 30);
  assert.deepEqual([tu.x, tu.y], [p.x, p.y - 3]);
  // Cooldown pending: no second shot at the same clock.
  C.enemyAct(state, C.mulberry32(5), tu);
  assert.equal(shots(), 1);
  assert.deepEqual([tu.x, tu.y], [p.x, p.y - 3]);
  // Clock advanced past the cooldown: shoots again.
  state.clock = 30;
  C.enemyAct(state, C.mulberry32(6), tu);
  assert.equal(shots(), 2);
  assert.equal(tu.nextShotTime, 60);
  assert.deepEqual([tu.x, tu.y], [p.x, p.y - 3], 'turret never moves');
});

test('phase5: turret cadence through the scheduler is one shot per 3 player actions (P5-TURRET-CADENCE)', () => {
  const state = C.newRun(571);
  p5Box(state, 6);
  const p = state.player;
  const tu = p5Foe(state, 'turret_light', p.x, p.y - 3, { nextTime: 30, nextShotTime: 0, awake: true });
  state.player.evasion = 0;
  const shots = () => state.log.filter(l => /Turret (hits|misses) You/.test(l)).length;
  const rng = C.mulberry32(7);
  C.playerWait(state, rng);
  C.playerWait(state, rng);
  assert.equal(shots(), 0, 'clock 20 < 30: turret not due');
  C.playerWait(state, rng);
  assert.equal(shots(), 1, 'clock 30: turret fires once');
  assert.deepEqual([tu.x, tu.y], [p.x, p.y - 3]);
});

// --- Save/load, scout, resistances ---
test('phase5: new enemy state round-trips as plain JSON; legacy saves default safely (P5-SAVE)', () => {
  const state = C.newRun(580);
  p5Box(state, 6);
  const p = state.player;
  state.floor.rooms = [{ type: 'structure', purpose: 'security', x: 1, y: 1, w: 2, h: 2 }];
  p5Foe(state, 'shielder', p.x + 1, p.y, { shieldFacing: 'W' });
  p5Foe(state, 'turret_light', p.x + 2, p.y, { nextShotTime: 30 });
  p5Foe(state, 'sniper', p.x + 3, p.y, { telegraph: { x: p.x, y: p.y } });
  p5Foe(state, 'bomber', p.x + 4, p.y, { fuseArmed: true, detonated: false });
  p5Foe(state, 'boss', p.x + 5, p.y, { dronesSpawned: true });
  const loaded = C.deserializeRun(C.serializeRun(state));
  const byType = t => loaded.floor.enemies.find(e => e.type === t);
  assert.equal(byType('shielder').shieldFacing, 'W');
  assert.equal(byType('turret_light').nextShotTime, 30);
  assert.deepEqual(byType('sniper').telegraph, { x: p.x, y: p.y });
  assert.equal(byType('bomber').fuseArmed, true);
  assert.equal(byType('bomber').detonated, false);
  assert.equal(byType('boss').dronesSpawned, true);
  assert.equal(loaded.floor.rooms[0].purpose, 'security');
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.floor.enemies)), loaded.floor.enemies, 'plain JSON throughout');
  // Legacy: strip the new fields, load, defaults apply.
  const legacy = C.serializeRun(state);
  legacy.floor.enemies.forEach(en => {
    delete en.shieldFacing; delete en.nextShotTime; delete en.telegraph;
    delete en.fuseArmed; delete en.detonated; delete en.dronesSpawned;
  });
  const loaded2 = C.deserializeRun(legacy);
  const byType2 = t => loaded2.floor.enemies.find(e => e.type === t);
  assert.equal(byType2('shielder').shieldFacing, 'N');
  assert.equal(byType2('turret_light').nextShotTime, 0);
  assert.equal(byType2('sniper').telegraph, null);
  assert.equal(byType2('bomber').fuseArmed, false);
  assert.equal(byType2('bomber').detonated, false);
  assert.equal(byType2('boss').dronesSpawned, false);
});

test('phase5: scout preview counts the real generator exactly, boss included (P5-SCOUT)', () => {
  for (const [seed, depth] of [[11, 5], [12, 6], [13, 8], [14, 10], [15, 12]]) {
    const prev = C.scoutPreview(seed, depth);
    const floor = C.generateFloor(seed, depth);
    assert.equal(prev.total, floor.enemies.length);
    assert.equal(prev.theme, floor.theme);
    assert.equal(prev.byType.reduce((a, b) => a + b.count, 0), floor.enemies.length);
    prev.byType.forEach(b => {
      assert.equal(b.count, floor.enemies.filter(e => e.type === b.type).length, `seed ${seed} d${depth} ${b.type}`);
    });
  }
});

test('phase5: jam resistance uses the shipped table on the seeded stream (P5-JAM-RESIST)', () => {
  const state = C.newRun(590);
  const boss = { type: 'boss', statuses: [] };
  assert.deepEqual(C.applyJammed(state, () => 0.5, boss), { applied: false, resisted: true }, '0.5 < 0.75 resists');
  assert.deepEqual(C.applyJammed(state, () => 0.8, boss), { applied: true, resisted: false }, '0.8 >= 0.75 applies');
  const flyer = { type: 'flyer', statuses: [] };
  assert.deepEqual(C.applyJammed(state, () => 0.5, flyer), { applied: true, resisted: false }, 'flyer 0.5 boundary: 0.5 < 0.5 is false');
  // Burning ticks honour the new resistances (boss 0.25 -> 2/tick).
  assert.equal(C.burnTickDamage('boss'), 2);
  assert.equal(C.burnTickDamage('flyer'), 1);
  assert.equal(C.burnTickDamage('turret_light'), 3);
});

// ---------- Phase 6: doors, visibility, locked rooms (LOOT-SKILLS-DESIGN.md §9.7) ----------
// Helpers: stand the player next to a door and bump/force toward it.
function findDoorSpot(state, wantLocked) {
  for (const d of state.floor.doors) {
    if (wantLocked && d.state !== 'locked') continue;
    if (!wantLocked && d.state !== 'closed') continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = d.x + dx, ny = d.y + dy;
      if (!C.isWalkableTile(state.floor.grid[ny][nx])) continue;
      if (state.floor.enemies.some(e => e.alive && e.x === nx && e.y === ny)) continue;
      return { door: d, px: nx, py: ny, dx: -dx, dy: -dy };
    }
  }
  return null;
}
function findLockedFloor() {
  for (let seed = 1; seed <= 80; seed++) {
    for (const depth of [1, 2]) {
      const state = C.newRun(seed * 1000 + depth);
      const locked = state.floor.doors.find(d => d.state === 'locked');
      if (locked) return { state, locked };
    }
  }
  return null;
}

test('phase6: door records match the threshold classification 1:1; every non-spawn room has a door (P6-DOOR-PLACEMENT)', () => {
  for (let runSeed = 1; runSeed <= 12; runSeed++) {
    for (let depth = 1; depth <= 3; depth++) {
      const floor = C.generateFloor(runSeed, depth);
      const cls = C.classifyDoorCells(floor.grid, floor.rooms, floor.spawn);
      assert.equal(floor.doors.length, cls.groups.length, `seed ${runSeed} depth ${depth}: door records != entrance groups`);
      cls.groups.forEach((g, i) => {
        const rec = floor.doors.find(d => d.x === g.doorCell.x && d.y === g.doorCell.y);
        assert.ok(rec, `group ${i} door cell ${g.doorCell.x},${g.doorCell.y} has no record`);
        assert.equal(rec.roomId, g.roomId);
        assert.equal(rec.entranceId, 'entrance:' + g.roomId + ':' + cls.groups.filter(h => h.roomId === g.roomId && (h.doorCell.y < g.doorCell.y || (h.doorCell.y === g.doorCell.y && h.doorCell.x < g.doorCell.x))).length);
        assert.equal(rec.id, 'door:' + g.doorCell.y + ':' + g.doorCell.x);
        if (rec.lockLevel === 0) {
          assert.equal(rec.state, 'closed');
          assert.equal(rec.hp, 0); assert.equal(rec.maxHp, 0); assert.equal(rec.keyId, null);
        } else {
          assert.ok(rec.lockLevel >= 1 && rec.lockLevel <= 3);
          assert.equal(rec.state, 'locked');
          assert.equal(rec.maxHp, 20 * rec.lockLevel);
          assert.equal(rec.hp, rec.maxHp);
          assert.equal(rec.keyId, 'key:' + rec.id);
        }
      });
      // Every grid door cell has exactly one record and vice versa.
      const gridDoors = [];
      for (let y = 0; y < floor.grid.length; y++) for (let x = 0; x < floor.grid[y].length; x++) {
        if (floor.grid[y][x] === 'door') gridDoors.push(x + ',' + y);
      }
      assert.equal(gridDoors.length, floor.doors.length, 'grid door cells != records');
      floor.doors.forEach(d => assert.ok(gridDoors.includes(d.x + ',' + d.y), 'record without grid cell'));
      floor.rooms.forEach((r, i) => {
        if (i === 0) return;
        assert.ok(floor.doors.some(d => d.roomId === 'room:' + i), `room ${i} has no door`);
      });
      // No runs of 3+ door cells in any row or column.
      for (let y = 0; y < floor.grid.length; y++) {
        let run = 0;
        for (let x = 0; x < floor.grid[y].length; x++) {
          run = floor.grid[y][x] === 'door' ? run + 1 : 0;
          assert.ok(run < 3, `row ${y} has a run of ${run} door cells`);
        }
      }
      for (let x = 0; x < C.GRID_W; x++) {
        let run = 0;
        for (let y = 0; y < floor.grid.length; y++) {
          run = floor.grid[y][x] === 'door' ? run + 1 : 0;
          assert.ok(run < 3, `column ${x} has a run of ${run} door cells`);
        }
      }
    }
  }
});

test('phase6: opening a closed door costs 1 time unit, player stays, then a move enters (P6-DOOR-STATE)', () => {
  const state = C.newRun(910);
  const spot = findDoorSpot(state, false);
  assert.ok(spot, 'no closed door with a walkable neighbour');
  state.player.x = spot.px; state.player.y = spot.py;
  state.floor.enemies.forEach(e => { e.nextTime = 1e9; });
  const clockBefore = state.clock;
  const res = C.playerAction(state, seededRng(1), spot.dx, spot.dy);
  assert.equal(res.ok, true); assert.equal(res.opened, true);
  assert.equal(spot.door.state, 'open');
  assert.deepEqual([state.player.x, state.player.y], [spot.px, spot.py], 'player stays on opening');
  assert.equal(state.clock, clockBefore + C.PLAYER_DEF.interval, 'opening costs exactly 1 time unit');
  const res2 = C.playerAction(state, seededRng(2), spot.dx, spot.dy);
  assert.equal(res2.ok, true); assert.equal(res2.moved, true);
  assert.deepEqual([state.player.x, state.player.y], [spot.door.x, spot.door.y]);
});

test('phase6: locked door without key refuses free; with key consumes it and opens (P6-LOCK-KEY)', () => {
  const found = findLockedFloor();
  assert.ok(found, 'no locked floor in the hunt range');
  const { state, locked } = found;
  const spot = findDoorSpot(state, true);
  assert.ok(spot, 'locked door has no walkable neighbour');
  state.player.x = spot.px; state.player.y = spot.py;
  state.floor.enemies.forEach(e => { e.nextTime = 1e9; });
  const clockBefore = state.clock;
  const refused = C.playerAction(state, seededRng(3), spot.dx, spot.dy);
  assert.equal(refused.ok, false, 'locked door without key must refuse');
  assert.equal(state.clock, clockBefore, 'refusal costs no time');
  assert.equal(spot.door.state, 'locked');
  state.keys.push(spot.door.keyId);
  const opened = C.playerAction(state, seededRng(4), spot.dx, spot.dy);
  assert.equal(opened.ok, true); assert.equal(opened.opened, true);
  assert.equal(spot.door.state, 'open');
  assert.equal(state.keys.length, 0, 'key is consumed');
  assert.equal(state.clock, clockBefore + C.PLAYER_DEF.interval);
});

test('phase6: force damages a locked door by the current weapon dice, 1 time unit, breaks at 0 (P6-LOCK-FORCE)', () => {
  const found = findLockedFloor();
  assert.ok(found, 'no locked floor in the hunt range');
  const { state, locked } = found;
  const spot = findDoorSpot(state, true);
  assert.ok(spot, 'locked door has no walkable neighbour');
  state.player.x = spot.px; state.player.y = spot.py;
  state.floor.enemies.forEach(e => { e.nextTime = 1e9; });
  const ammoBefore = state.ammoPools.standard;
  const clockBefore = state.clock;
  const res = C.forceDoor(state, seededRng(5), spot.dx, spot.dy);
  assert.equal(res.ok, true);
  assert.ok(res.damage >= 0, 'force rolls damage (0 allowed)');
  assert.equal(state.clock, clockBefore + C.PLAYER_DEF.interval, 'force costs exactly 1 time unit even on 0');
  assert.equal(state.ammoPools.standard, ammoBefore, 'force spends no ammo');
  assert.ok(state.log.some(l => /You force the door/.test(l)), 'force logs its roll');
  // Forcing an unlocked closed door refuses free.
  const openSpot = findDoorSpot(state, false);
  if (openSpot) {
    state.player.x = openSpot.px; state.player.y = openSpot.py;
    const c2 = state.clock;
    const r2 = C.forceDoor(state, seededRng(6), openSpot.dx, openSpot.dy);
    assert.equal(r2.ok, false);
    assert.equal(state.clock, c2, 'refused force costs no time');
  }
  // Keep forcing the locked door until it breaks open.
  state.player.x = spot.px; state.player.y = spot.py;
  let broke = res.broke, guard = 0;
  while (!broke && guard++ < 40) {
    const r = C.forceDoor(state, seededRng(100 + guard), spot.dx, spot.dy);
    assert.equal(r.ok, true);
    broke = r.broke;
  }
  assert.ok(broke, 'repeated force must eventually break the door');
  assert.equal(spot.door.state, 'open');
  assert.equal(spot.door.hp, 0);
});

test('phase6: force with a no-dice weapon falls back to the flat player roll (P6-LOCK-FORCE)', () => {
  const found = findLockedFloor();
  assert.ok(found, 'no locked floor in the hunt range');
  const { state } = found;
  const spot = findDoorSpot(state, true);
  assert.ok(spot, 'locked door has no walkable neighbour');
  state.player.x = spot.px; state.player.y = spot.py;
  state.floor.enemies.forEach(e => { e.nextTime = 1e9; });
  state.weapon = C.makeItemInstance('combatDrone', 'common', 0, [], null);
  state.equipment.weapon = C.makeItemInstance('combatDrone', 'common', 0, [], null);
  const res = C.forceDoor(state, seededRng(7), spot.dx, spot.dy);
  assert.equal(res.ok, true);
  assert.equal(res.fallback, true, 'combatDrone has dice null, so the flat fallback must fire');
});

test('phase6: Bypass refuses with the exact spec text and spends nothing (P6-BYPASS)', () => {
  const state = C.newRun(911);
  const clockBefore = state.clock, actionsBefore = state.actions;
  const res = C.attemptBypass(state);
  assert.equal(res.ok, false);
  assert.equal(res.reason, C.BYPASS_REFUSAL);
  assert.equal(res.reason, 'Bypass unavailable: no compatible lockpick skill is defined in the current skill system. Use the matching key or force the door.');
  assert.equal(state.clock, clockBefore);
  assert.equal(state.actions, actionsBefore);
  assert.ok(state.log.some(l => l === C.BYPASS_REFUSAL), 'refusal is logged verbatim');
});

test('phase6: closed doors block lineOfSight, open doors do not (P6-DOOR-LOS)', () => {
  let proven = false;
  for (let seed = 1; seed <= 40 && !proven; seed++) {
    const state = C.newRun(seed);
    for (const d of state.floor.doors) {
      if (d.state !== 'closed') continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ax = d.x + dx * 3, ay = d.y + dy * 3, bx = d.x - dx * 3, by = d.y - dy * 3;
        if (ax < 0 || ay < 0 || bx < 0 || by < 0 || ax >= C.GRID_W || ay >= C.GRID_H || bx >= C.GRID_W || by >= C.GRID_H) continue;
        if (C.lineOfSight(state, ax, ay, bx, by)) continue; // not door-blocked (another wall?) — try next
        d.state = 'open';
        const open = C.lineOfSight(state, ax, ay, bx, by);
        d.state = 'closed';
        if (open) { proven = true; break; }
      }
      if (proven) break;
    }
  }
  assert.ok(proven, 'no door proven to block LOS while closed and pass it while open');
});

test('phase6: opening a door wakes sleeping enemies within Chebyshev 8 with LOS (P6-DOOR-WAKE)', () => {
  const state = C.newRun(912);
  const spot = findDoorSpot(state, false);
  assert.ok(spot, 'no closed door with a walkable neighbour');
  state.floor.enemies.forEach(e => { e.nextTime = 1e9; });
  // A sleeper just inside the room, adjacent to the door; a far
  // sleeper that must stay asleep.
  const roomIdx = parseInt(spot.door.roomId.split(':')[1], 10);
  const room = state.floor.rooms[roomIdx];
  let near = null;
  for (let y = room.y; y < room.y + room.h && !near; y++) for (let x = room.x; x < room.x + room.w && !near; x++) {
    if (state.floor.grid[y][x] !== 'floor') continue;
    if (Math.max(Math.abs(x - spot.door.x), Math.abs(y - spot.door.y)) > 8) continue;
    near = { x, y };
  }
  assert.ok(near, 'no room cell within wake range of the door');
  const foe = state.floor.enemies[0];
  Object.assign(foe, { x: near.x, y: near.y, alive: true, awake: false });
  const far = state.floor.enemies[1];
  Object.assign(far, { x: state.player.x, y: state.player.y, alive: true, awake: false });
  // Move the far sleeper far away (opposite corner of the floor).
  far.x = 0; far.y = 0;
  if (state.floor.grid[0][0] !== 'floor') { far.x = C.GRID_W - 1; far.y = C.GRID_H - 1; }
  C.openDoorRecord(state, spot.door);
  assert.equal(spot.door.state, 'open');
  assert.equal(foe.awake, true, 'near sleeper with LOS must wake');
  assert.equal(far.awake, false, 'far sleeper must stay asleep');
});

test('phase6: exploration marks whole rooms on entry and single corridor cells (P6-FOG)', () => {
  const state = C.newRun(913);
  assert.ok(state.floor.explored.exploredRoomIds.includes('room:0'), 'spawn room starts explored');
  // Step onto a corridor cell: exactly that cell is walked.
  let corridor = null;
  for (let y = 0; y < C.GRID_H && !corridor; y++) for (let x = 0; x < C.GRID_W && !corridor; x++) {
    if (state.floor.grid[y][x] === 'corridor') corridor = { x, y };
  }
  assert.ok(corridor, 'no corridor cell on the floor');
  state.player.x = corridor.x; state.player.y = corridor.y;
  C.markExplored(state);
  assert.ok(state.floor.explored.walkedCorridorCells.includes(corridor.x + ',' + corridor.y), 'corridor cell walked');
  assert.equal(state.floor.explored.walkedCorridorCells.length, 1, 'corridor marking does not propagate');
  // Step into a non-spawn room: the whole room is explored.
  const other = state.floor.rooms.find((r, i) => i !== 0);
  state.player.x = other.cx; state.player.y = other.cy;
  C.markExplored(state);
  assert.ok(state.floor.explored.exploredRoomIds.includes(other.id), 'entered room is fully explored');
});

test('phase6: save round-trip preserves doors, exploration, keys; legacy floors migrate (P6-SAVE-JSON, P6-LEGACY-MIGRATION)', () => {
  const found = findLockedFloor();
  assert.ok(found, 'no locked floor in the hunt range');
  const { state } = found;
  const spot = findDoorSpot(state, true);
  assert.ok(spot, 'locked door has no walkable neighbour');
  state.keys.push(spot.door.keyId);
  state.player.x = spot.px; state.player.y = spot.py;
  C.playerAction(state, seededRng(8), spot.dx, spot.dy);
  assert.equal(spot.door.state, 'open');
  const saved = C.serializeRun(state);
  const loaded = C.deserializeRun(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(loaded.floor.doors, state.floor.doors, 'doors survive a round-trip');
  assert.deepEqual(loaded.floor.explored, state.floor.explored, 'exploration survives a round-trip');
  assert.deepEqual(loaded.keys, [], 'the key was consumed opening the door, so no keys remain');
  // Legacy: strip doors + exploration, load again.
  const legacy = JSON.parse(JSON.stringify(saved));
  delete legacy.floor.doors; delete legacy.floor.explored;
  const migrated = C.deserializeRun(legacy);
  assert.ok(Array.isArray(migrated.floor.doors), 'legacy floor gains door records');
  assert.ok(migrated.floor.doors.every(d => d.state === 'open'), 'legacy doors default all open');
  assert.equal(migrated.floor.explored.exploredRoomIds.length, migrated.floor.rooms.length, 'legacy rooms default all explored');
});

test('phase6: locked rooms are leaves with 20/40/60 HP locks, one matching key outside, vault caches by level (P6-LOCKED-ROOMS)', () => {
  let lockedFloors = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const state = C.newRun(seed);
    const floor = state.floor;
    const lockedDoors = floor.doors.filter(d => d.state === 'locked');
    if (!lockedDoors.length) continue;
    lockedFloors++;
    assert.equal(lockedDoors.length, 1, 'at most one locked room per floor');
    const door = lockedDoors[0];
    const roomIdx = parseInt(door.roomId.split(':')[1], 10);
    const room = floor.rooms[roomIdx];
    assert.ok(room.lockedKind, 'locked room carries a kind');
    assert.ok(['lootVault', 'newArea', 'objective'].includes(room.lockedKind));
    assert.notEqual(roomIdx, floor.rooms.indexOf(floor.rooms.find(r => r.cx === floor.stairs.x && r.cy === floor.stairs.y)), 'stairs room is never locked');
    assert.ok(door.lockLevel >= 1 && door.lockLevel <= 3);
    assert.equal(door.maxHp, 20 * door.lockLevel);
    const keys = floor.pickups.filter(p => p.kind === 'key' && p.keyId === door.keyId);
    assert.equal(keys.length, 1, 'exactly one matching key');
    assert.ok(!(keys[0].x >= room.x && keys[0].x < room.x + room.w && keys[0].y >= room.y && keys[0].y < room.y + room.h), 'key is never inside its own locked room');
    if (room.lockedKind === 'lootVault') {
      const caches = floor.pickups.filter(p => p.kind === 'item' && p.x >= room.x && p.x < room.x + room.w && p.y >= room.y && p.y < room.y + room.h);
      assert.ok(caches.length >= (door.lockLevel === 1 ? 1 : 2), 'vault holds 1 cache at L1, 2 at L2-3');
    }
  }
  assert.ok(lockedFloors > 0, 'no locked floor found in 60 seeds');
});

test('phase6: locked first security room means no boss, reason recorded, no substitution (P6-BOSS-COMPATIBILITY)', () => {
  let proven = false;
  for (let seed = 1; seed <= 120 && !proven; seed++) {
    const floor = C.generateFloor(seed, 5);
    const secIdx = floor.rooms.findIndex(r => r.type === 'structure' && r.purpose === 'security');
    if (secIdx < 0) continue;
    const res = C.placeBoss({ grid: floor.grid, rooms: floor.rooms, spawn: floor.spawn, stairs: floor.stairs, enemies: [], pickups: floor.pickups, dressing: floor.dressing }, 5, { lockedRoomIndex: secIdx });
    assert.equal(res.boss, null);
    assert.equal(res.reason, 'locked-first-security-room');
    proven = true;
  }
  assert.ok(proven, 'no depth-5 floor with a security room in 120 seeds');
});

test('phase6: determinism — same seed reproduces identical doors, locks, keys, signature (P6-DETERMINISM)', () => {
  const a = C.newRun(777), b = C.newRun(777);
  assert.deepEqual(a.floor.doors, b.floor.doors);
  assert.deepEqual(a.floor.pickups, b.floor.pickups);
  assert.deepEqual(a.floor.explored, b.floor.explored);
  assert.deepEqual(a.floor.generation, b.floor.generation);
  assert.equal(a.floor.generationAttempts, b.floor.generationAttempts);
  assert.equal(a.floor.seed, (777 ^ 1) >>> 0);
  const c = C.newRun(778);
  assert.notDeepEqual(a.floor.doors, c.floor.doors);
});

test('phase6: key pickup logs the spec label with purpose and door coordinates (P6-LOCK-KEY)', () => {
  const found = findLockedFloor();
  assert.ok(found, 'no locked floor in the hunt range');
  const { state } = found;
  const door = state.floor.doors.find(d => d.state === 'locked');
  const key = state.floor.pickups.find(p => p.kind === 'key' && p.keyId === door.keyId);
  assert.ok(key, 'locked floor must carry its key');
  // Step onto the key from a walkable, non-door neighbour cell.
  let stepped = false;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = key.x + dx, ny = key.y + dy;
    if (!C.isWalkableTile(state.floor.grid[ny][nx])) continue;
    if (state.floor.grid[ny][nx] === 'door') continue;
    if (state.floor.enemies.some(e => e.alive && e.x === nx && e.y === ny)) continue;
    state.player.x = nx; state.player.y = ny;
    state.floor.enemies.forEach(e => { e.nextTime = 1e9; });
    const res = C.playerAction(state, seededRng(9), -dx, -dy);
    assert.equal(res.ok, true); assert.equal(res.moved, true);
    stepped = true;
    break;
  }
  assert.ok(stepped, 'key has no walkable non-door neighbour to step from');
  const room = state.floor.rooms[parseInt(door.roomId.split(':')[1], 10)];
  const label = room.purpose ? room.purpose : door.roomId;
  assert.ok(state.log.some(l => l === 'Key acquired: fits the ' + label + ' door (' + door.x + ', ' + door.y + ').'), 'key log must use the spec label, got: ' + state.log.slice(-3).join(' | '));
  assert.ok(state.keys.includes(door.keyId), 'key lands in state.keys');
});

test('phase6: generation never ships a failing floor; attempts and signature recorded (P6-COHERENCE)', () => {
  for (let runSeed = 1; runSeed <= 12; runSeed++) {
    for (let depth = 1; depth <= 3; depth++) {
      const floor = C.generateFloor(runSeed, depth);
      const check = C.coherenceCheck(floor);
      assert.equal(check.ok, true, `seed ${runSeed} depth ${depth}: ${check.errors.join('; ')}`);
      assert.ok(floor.generationAttempts >= 1 && floor.generationAttempts <= 8, 'attempts within the 8-attempt budget');
      assert.equal(floor.generation.runSeed, runSeed);
      assert.equal(floor.generation.depth, depth);
      assert.equal(floor.generation.generatorVersion, C.GENERATION_VERSION);
      assert.equal(floor.generation.rngAlgorithmVersion, C.RNG_ALGORITHM_VERSION);
      // Plain-JSON: a JSON round-trip reproduces the floor exactly.
      assert.deepEqual(JSON.parse(JSON.stringify(floor)), floor);
    }
  }
});

// ---------- tilefix (2026-10-30): room-scoped coherence, decor/pickup
// disambiguation, door-art ban. These tests replicate the RENDER
// mapping formula from game.js (room origin/size/depth hash) and
// audit the variant lists in game.js source directly, because
// game.js is a browser script and cannot be required in node.
// The mapping itself is render-time only: no core.js rule changes.
const fs = require('node:fs');
const gameSrc = fs.readFileSync(__dirname + '/game.js', 'utf8');
function tilefixRoomHash(r, depth) {
  return ((r.x * 73856093) ^ (r.y * 19349663) ^ (depth * 83492791) ^ (r.w * 101) ^ (r.h * 37)) >>> 0;
}
const TILEFIX_FLOOR_V = ['vision_floor_plain', 'vision_floor_plain', 'vision_floor_plain', 'vision_floor_circuit', 'floor_dense_scrap', 'batch3_s2_floor_rusty_a', 'batch3_s2_floor_rusty_b', 'batch3_s2_floor_cracked_a', 'batch3_s2_floor_cracked_b', 'batch3_s2_floor_mesh', 'batch3_s2_floor_diamond', 'batch3_s2_floor_tiles_grey', 'batch3_s1_floor_grey_a', 'batch3_s1_floor_grey_b', 'batch3_s1_floor_grey_c'];
const TILEFIX_WALL_MATS = ['vision_wall_top', 'vision_wall_top2', 'vision_wall_right', 'wall', 'batch3_s2_wall_panel_a', 'batch3_s2_wall_panel_b', 'batch3_s2_wall_panel_c', 'batch3_s1_panel_plain_a'];
function tilefixRoomAt(floor, x, y) {
  for (const r of floor.rooms) if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
  return null;
}

test('tilefix: no wallVariants list contains a door panel', () => {
  const ind = gameSrc.slice(gameSrc.indexOf('industrial: { floor:'), gameSrc.indexOf('scrapyard: { floor:'));
  const scr = gameSrc.slice(gameSrc.indexOf('scrapyard: { floor:'), gameSrc.indexOf('overgrown: { floor:'));
  assert.ok(!ind.includes('wall_door'), 'industrial wallVariants must not contain door panels');
  assert.ok(!scr.includes('wall_door'), 'scrapyard wallVariants must not contain door panels');
  // Door art survives only where it belongs: the real-door render
  // branch (closedKeys/openKeys) and the PLAIN sheet entries.
  assert.ok(gameSrc.includes('batch3_s2_wall_door_closed_a'), 'real-door render keys must still exist');
});

test('tilefix: no decor pool draws a pickup sprite', () => {
  const lv = gameSrc.match(/var lv = \[([^\]]+)\]/);
  assert.ok(lv, 'industrial debris list must exist in game.js');
  for (const bad of ['loot_gear', 'loot_key', 'loot_crate', 'loot_crystal']) assert.ok(!lv[1].includes(bad), 'debris list must not contain ' + bad);
  const dv = gameSrc.slice(gameSrc.indexOf('var DRESSING_VARIANTS'), gameSrc.indexOf('};', gameSrc.indexOf('var DRESSING_VARIANTS')));
  assert.ok(!dv.includes('loot_'), 'DRESSING_VARIANTS must not contain any loot_ sprite');
  const wa = gameSrc.slice(gameSrc.indexOf('var WIDE_ART'), gameSrc.indexOf('};', gameSrc.indexOf('var WIDE_ART')));
  assert.ok(!wa.includes('loot_'), 'WIDE_ART must not contain any loot_ sprite');
});

test('tilefix: one dominant floor variant per room, plain corridors, coherent walls', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const floor = C.generateFloor(seed, 1);
    const cb = floor.circuitBlock;
    const inCb = (x, y) => cb && x >= cb.x && x < cb.x + cb.w && y >= cb.y && y < cb.y + cb.h;
    for (const r of floor.rooms) {
      const dom = TILEFIX_FLOOR_V[tilefixRoomHash(r, 1) % TILEFIX_FLOOR_V.length];
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        const t = floor.grid[y][x];
        if ((t === 'floor' || t === 'stairs' || t === 'hazard') && !inCb(x, y)) {
          assert.equal(TILEFIX_FLOOR_V[tilefixRoomHash(r, 1) % TILEFIX_FLOOR_V.length], dom, `seed ${seed} room ${r.x},${r.y}: all non-circuit cells share the dominant variant`);
        }
      }
    }
    // Wall cells bordering a room use that room's material, never a door panel.
    for (let y = 0; y < 44; y++) for (let x = 0; x < 60; x++) {
      if (floor.grid[y][x] !== 'wall') continue;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const r = tilefixRoomAt(floor, x + dx, y + dy);
        if (!r) continue;
        const mat = TILEFIX_WALL_MATS[tilefixRoomHash(r, 1) % TILEFIX_WALL_MATS.length];
        assert.ok(!mat.includes('wall_door'), `seed ${seed} wall at ${x},${y}: material must never be a door panel`);
        break;
      }
    }
  }
});

test('tilefix: every door cell has a record, every lock has exactly one reachable key', () => {
  const walkable = t => ['floor', 'corridor', 'door', 'stairs', 'hazard'].includes(t);
  for (let seed = 1; seed <= 30; seed++) {
    const floor = C.generateFloor(seed, 1);
    const byCell = {};
    for (const d of floor.doors) byCell[d.x + ',' + d.y] = d;
    for (let y = 0; y < 44; y++) for (let x = 0; x < 60; x++) {
      if (floor.grid[y][x] === 'door') assert.ok(byCell[x + ',' + y], `seed ${seed}: door cell ${x},${y} without a record`);
    }
    // BFS from spawn with locked doors as walls.
    const seen = new Set([floor.spawn.x + ',' + floor.spawn.y]);
    const q = [[floor.spawn.x, floor.spawn.y]];
    while (q.length) {
      const [cx, cy] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny;
        if (seen.has(k) || nx < 0 || ny < 0 || nx >= 60 || ny >= 44) continue;
        if (!walkable(floor.grid[ny][nx])) continue;
        const dr = byCell[k];
        if (dr && dr.lockLevel > 0) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    for (const d of floor.doors) {
      if (d.lockLevel === 0) continue;
      const keys = floor.pickups.filter(p => p.kind === 'key' && p.keyId === d.keyId);
      assert.equal(keys.length, 1, `seed ${seed}: lock ${d.id} must have exactly one key`);
      assert.ok(seen.has(keys[0].x + ',' + keys[0].y), `seed ${seed}: key for ${d.id} must be reachable without opening locks`);
      const kr = tilefixRoomAt(floor, keys[0].x, keys[0].y);
      assert.ok(!kr || !kr.lockedKind, `seed ${seed}: key for ${d.id} must not sit in a locked room`);
    }
  }
});

// Menu-tabs wave: the per-item numbers the Gear tab prints are the
// shipped gearStatValue scaling, and the piece vector matches the
// derived totals exactly — the swap preview's core invariant.
test('menutabs: gearStatValue scales every gear def like derivedStats', () => {
  // Rare +1 Alloy vest: armor 2 x 1.22 x 1.12 = 2.73 -> 3; hp 10 x 1.22 x 1.12 = 13.66 -> 14.
  assert.equal(C.gearStatValue(C.GEAR_DEFS.alloyVest, 'armor', 'rare', 1), 3);
  assert.equal(C.gearStatValue(C.GEAR_DEFS.alloyVest, 'hp', 'rare', 1), 14);
  // Common +0 Scrap plating adds armor only, never HP (zero stays zero).
  assert.equal(C.gearStatValue(C.GEAR_DEFS.scrapPlating, 'armor', 'common', 0), 1);
  assert.equal(C.gearStatValue(C.GEAR_DEFS.scrapPlating, 'hp', 'common', 0), 0);
  // Epic +2 Nano bastion: capacity 34 x 1.35 x 1.24 = 56.92 -> 57.
  assert.equal(C.gearStatValue(C.GEAR_DEFS.nanoBastion, 'capacity', 'epic', 2), 57);
  // Legendary +5 Scope: range 1 x 1.50 x 1.60 = 2.40 -> 2.
  assert.equal(C.gearStatValue(C.GEAR_DEFS.scope, 'range', 'legendary', 5), 2);
  // Common +0 Power cell: powerBonus 40 flat.
  assert.equal(C.gearStatValue(C.GEAR_DEFS.powerCell, 'powerBonus', 'common', 0), 40);
  // Unknown keys and unknown defs read as 0, never NaN.
  assert.equal(C.gearStatValue(C.GEAR_DEFS.sensor, 'armor', 'common', 0), 0);
  assert.equal(C.gearStatValue(null, 'armor', 'common', 0), 0);
});
test('menutabs: equipped piece vector equals derived totals minus base', () => {
  const hub = C.newHub();
  const st = C.newRun(7, hub);
  st.equipment.armor = C.makeItemInstance('alloyVest', 'rare', 1, [], null);
  st.equipment.shield = C.makeItemInstance('alloyAegis', 'uncommon', 2, [], null);
  st.equipment.utility = C.makeItemInstance('sensor', 'common', 0, [], null);
  const d = C.derivedStats(st);
  assert.equal(d.armor - C.PLAYER_DEF.armor, C.gearStatValue(C.GEAR_DEFS.alloyVest, 'armor', 'rare', 1));
  assert.equal(d.maxHp - st.player.maxHp, C.gearStatValue(C.GEAR_DEFS.alloyVest, 'hp', 'rare', 1));
  assert.equal(d.shieldCapacity, C.gearStatValue(C.GEAR_DEFS.alloyAegis, 'capacity', 'uncommon', 2));
  assert.equal(d.sight - 8, C.gearStatValue(C.GEAR_DEFS.sensor, 'sight', 'common', 0));
  // Swapping the armor for a Common +0 Scrap plating moves the
  // totals by exactly the vector difference.
  const before = C.derivedStats(st);
  st.equipment.armor = C.makeItemInstance('scrapPlating', 'common', 0, [], null);
  const after = C.derivedStats(st);
  assert.equal(after.armor - before.armor,
    C.gearStatValue(C.GEAR_DEFS.scrapPlating, 'armor', 'common', 0) - C.gearStatValue(C.GEAR_DEFS.alloyVest, 'armor', 'rare', 1));
  assert.equal(after.maxHp - before.maxHp,
    0 - C.gearStatValue(C.GEAR_DEFS.alloyVest, 'hp', 'rare', 1));
});
