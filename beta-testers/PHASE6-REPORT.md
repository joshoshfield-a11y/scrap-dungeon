# Scrap Dungeon — Phase 6 Report: Doors, Visibility, Locked Rooms + Tile Coherence

**Spec source:** `LOOT-SKILLS-DESIGN.md` §9 as amended by §9.7 (settled 2026-10-29
at the user's word, without ChatGPT), plus §10 (six passes, §10.3 metadata,
§10.4 determinism) and §11. ChatGPT's v1 draft (`PHASE6-V1-DRAFT-2026-10-29.md`)
was used as a checklist only; where it conflicted with §9.7, §9.7 won
(force = current equipped weapon's dice, any pattern; Pass 6 = the §10
twelve-check list; locked rooms are leaf branches, no extra rooms generated).

**Scope limits honored:** working tree only — no commits, no pushes, no merges.
No new art. No Phase 7 work. No enemy-stat, damage, or economy changes.

**Files changed:**
- `game/core.js` — Phase 6 constants, door classification/grouping, door
  state/movement/LOS/pathfinding/wake, keys/force/lock levels/Bypass refusal,
  locked-room selection + contents, exploration marking, `placeBoss`
  locked-room exclusion, generation attempt loop, extended `coherenceCheck`
  (§10 twelve checks), save migration, new exports.
- `game/game.js` — fog renderer (`fogRoomAt`/`fogVisibility`), door/key art
  wiring, HUD keys segment, `X` force + `B` Bypass bindings, FORCE quickbar
  button, `walkTo` re-path on door open, Bag Keys section.
- `game/index.html` — `hud-keys` / `hud-keys-wrap` span (Banked–Power gap).
- `game/test.js` — 15 new Phase 6 node tests (baseline 143 → 158).
- `beta-testers/sweep_phase6.js` — 3,000-floor sweep (new).
- `beta-testers/verify_phase6.py` — browser verifier (new).
- `beta-testers/verify_phase6.py` also carries the run-5 verifier fixes
  (transient-overlay exclusion, section-11 clean-state reset) — see
  "Failures and diagnostics" below. These are verifier fixes, not game changes.

## 1. §9.7.12 verification resolutions (from shipped code)

1. **Room/corridor representation.** Room floor = cells inside a room rect;
   corridor = carved route cells; `grid[y][x]` with `GRID_W=60, GRID_H=44`.
   Decorative/disconnected tiles are dressing/wide art, not grid kinds.
2. **Door asset SHEETS/loader keys.** `door: 'assets/tile_door_sheet.png'`
   (8-direction sheet, all closed-door views; renderer uses cell 0).
   Batch-3 plain keys: `batch3_s2_wall_door_closed_a/b` (sealed metal door),
   `batch3_s2_wall_door_open_a/b/c` (open doorway). No open frame exists in
   the door sheet itself. Key: `loot_key: 'assets/loot_key_sheet.png'`
   (gold key, cell 0).
3. **Key pickup schema.** No `key` pickup kind existed. Shipped pickup
   record + minimal `keyId` addition; new kind `'key'`; pickup handling in
   `afterPlayerStep`, key branch before the generic salvage branch.
4. **Damage-roll pipeline (force).** `rollDamageDetailed(rng, {dice:
   stats.dice, dmgMult: stats.mult})` via `weaponStats(state)` — one roll
   of the current equipped weapon's dice, any pattern. No-dice fallback =
   shipped player flat roll (`PLAYER_DEF.dmg` 14, `dmgVar` 6). `rollItem` /
   `rollGearItem` accept `forcedTier`. `TIER_ORDER = ['common','uncommon',
   'rare','epic','legendary']`.
5. **Purpose-draw ordering (F6-3).** Confirmed: after `forceType`
   guarantees, before room painting and corridor carving, one `rng()` draw
   per structure room in room order. Never moved.
6. **Boss eligibility integration.** `placeBoss` scans rooms in order for the
   first `type==='structure' && purpose==='security'`, row-major cells
   keeping the strictly-greatest Chebyshev distance ≥3 from spawn (ties keep
   first), returns `{boss, reason}`. Locked-first-room exclusion point =
   pass locked room ids into `placeBoss`, reason `'locked-first-security-room'`.
   `placeBoss` moved to end of generation (after dressing/wide/circuitBlock
   and the Phase 6 stage) so the locked-room choice precedes the exclusion;
   consumes no RNG; boss cell scan additionally skips dressing cells.
7. **Scheduler wake timing.** Jam skip at the top of `enemyActInner`, before
   the wake branch. `processScheduler` ticks statuses before that unit's
   activations, once per time unit, including dormant enemies. Wake branch:
   sleeping enemy wakes (spending activation) when Manhattan distance ≤
   sight AND LOS. Door-noise wake = immediate `awake=true` + log, acts in
   the opening turn's scheduler pass per `nextTime`, no retroactive
   activation. Door-opening turn: status ticks first, then activations.
8. **LOS helper integration.** Single Bresenham `lineOfSight(state,x0,y0,
   x1,y1)`: only intermediate cells equal to `'wall'` block; start/target
   never checked; void never blocks; diagonals cut corners (Phase 5 F12,
   kept); reads `tileAt` (out of bounds = `'void'`). Door-blocking added
   inside the helper only (intervening closed/locked door blocks, open does
   not; observer/target cells exempt), via `state.floor.doors` lookup,
   guarded for legacy floors.
9. **Save schema / migration.** `serializeRun` deep-copies the whole floor
   via JSON (doors/explored/keys ride along). `deserializeRun` had no
   door/explored handling — migration added (`migrateFloorDoors`:
   re-derives thresholds, all doors open, entranceIds renumbered per room
   row-major, non-record grid door cells → corridor, all rooms explored +
   all corridor/door/stairs/hazard cells walked). `state.keys` default
   added in `newRun`/`deserializeRun`. Legacy saves default all doors open
   + all rooms explored.
10. **coherenceCheck entry point.** Pure `coherenceCheck(floor)` returning
    `{ok, errors}`; test-only before Phase 6. Wiring point = attempt loop
    inside `generateFloor` calling inner `generateFloorOnce`; after 8
    failures it throws an Error with diagnostic. Never ships a floor
    failing a mandatory invariant; never invents a template floor or keys.
11. **Scout preview / renderer.** Preview returns counts only
    (`{depth, total, theme, byType}`). Renderer `render()` in `game.js`
    drew everything unconditionally before Phase 6. Fog enforced in the
    grid loop + drawables pass + markers. Debug hook only
    `window.__scrapDebug = {getState, pose}`.
12. **findPath blocked-tile treatment.** `findPath` is 8-dir BFS over
    walkable tiles, never through enemy tiles. It is the player tap-to-move
    pathfinder, so door cells stay traversable there (stepping onto a
    closed door opens it via `playerAction`; `walkTo` re-paths). Enemies
    never call `findPath`: their step filters in `enemyActInner` and
    `bfsCellsFrom` block closed/locked doors directly. `bfsCellsFrom`
    (boss drones) traverses walkable including hazards; drone selection
    excludes hazards/occupied/player cell.
13. **Corridor-route recording.** Routes are NOT recorded — `connections`
    is local to `generateFloor` only. §9.7.2(4) ("cell lies on a carved
    corridor route") is satisfied from grid + rooms via a spawn-component
    flood check, not from stored routes.
14. **Regression baseline.** Parent-verified 2026-10-29: verify_phase5
    31/31, verify_phase4 20/20, verify_phase2 16/16; verify_phase3
    hunt-RNG flake class; verify_phase1 stale (not a gate). Post-Phase-6
    reruns in §6 below.
15. **§10.5 items (F6-1/F6-2/F6-7, re-verified).** Room placement
    `randInt(rng, 2, GRID_W-w-2)`, 1-cell separation via +1 overlap test;
    L-shaped carver with one `horizFirst` draw per corridor, spanning tree
    to a random earlier room + `randInt(rng,1,2)` loops. Carver NOT rewritten
    to Kruskal/A*.

**Discrepancies flagged (shipped code over spec, settled decisions NOT reopened):**
- §9.7.2(2)'s parenthetical "excludes alongside corridors" is ambiguous
  against the rule's letter. The implementation follows the conditions
  literally (matching the validated prototype: a cell qualifies only when
  exactly one 4-dir neighbor is room floor of one room R and the opposite
  neighbor is corridor outside every room rect). An alongside corridor
  whose opposite neighbor is a wall therefore yields no door, and the
  room becomes doorless → generation failure → retry. This is the retry
  driver in the sweep (701/3,000 floors retried), not a bug.
- The gold key sprite (`loot_key`) also appears as a variant in the
  industrial-debris dressing cycle, so gold keys render as debris in
  ordinary rooms. Pre-existing, not a Phase 6 change; visually ambiguous
  with real key pickups. Flagged only, not fixed unasked.

## 2. What was built (§9.7.13 order)

1. Verification items (§1 above).
2. Metadata frozen: room id `room:<index>`, door id `door:<y>:<x>`
   (y=row, x=column), entrance id `entrance:<roomId>:<n>` numbered per room
   in row-major door order from 0. Door record `{id, x, y, roomId,
   entranceId, state, lockLevel, keyId, hp, maxHp}`; grid kind stays
   `'door'` regardless of state. `floor.doors[]` is authority.
3. Threshold classification + entrance grouping per §9.7.2: 4-dir-adjacent
   qualifying cells, same room, connected through corridor cells of the
   same route = one entrance; exactly one door per entrance, the first
   cell in row-major order; non-chosen group cells become `'wall'` (so the
   single door cannot be bypassed through an adjacent open cell;
   flood-fill failures become retries). Every non-spawn room ≥1 door;
   none = generation failure, never silently patched.
4. Door state/movement/LOS/pathfinding/wake: closed (fresh default), open,
   locked. Ordinary closed door: bump → opens, player stays, exactly 1
   time unit (scheduler runs, status ticks first, then activations);
   separate move to enter. Wake: sleeping, alive enemies within Chebyshev
   8 of the door cell, door-aware LOS to the doorway, not separated by
   another closed/locked door; no retroactive/extra activation.
5. Keys/force/locks/Bypass: lock levels 1–3 equal weights, flat HP
   20×level (20/40/60), one seeded draw per locked door in stable lock
   order; level-3 can appear on depth 1 deliberately. Key: `key` pickup,
   one per lock, `keyId` matching, different room from the lock, never
   behind its own lock or any lock whose key is not already reachable;
   log label exactly `Key acquired: fits the <purpose> door (x, y).`
   (purpose if any, else room ID). Non-matching key never consumed;
   wrong-key attempt fails with no time/RNG/noise. Force: dedicated
   action (key `X` + FORCE quickbar button, facing-adjacent door),
   auto-hits, one current-weapon dice roll, no acc/evasion/armor/surprise,
   no ammo, exactly 1 time unit even on 0, damage clamped at 0, at 0 the
   door becomes open, noise after damage/state resolution including the
   breaking hit. Bypass: STUB/REFUSE with the exact §9.7.5 text, zero
   time/RNG/noise (key `B`; core `attemptBypass` logs the text itself).
6. Locked rooms: leaf branches only (room whose only corridor connection
   is the locked entrance), selected from already-generated rooms; no
   extra rooms, 6–10 count unchanged; stairs room never locked; no
   spanning-tree edge needed for stairs passes through a locked door; no
   qualifying leaf = no locked rooms that floor. Builder decision: at most
   1 locked room per floor (seeded draw among eligible leaves in stable
   room order, only if >1 eligible). Kinds equal 1/3 loot vault / new area
   / objective, one seeded draw per locked room in stable room order.
   Loot vault: 1 guaranteed cache L1, 2 caches L2–3, per shipped cache
   rules. New area: the leaf room itself, same roster/weights, regular cap
   unchanged. Objective: one seeded uniform 1/3 draw among Codex cache
   (`dataChip` pickup with codex string) / guaranteed Rare-or-better drop
   (tier uniform from [rare, epic, legendary], then `rollGearItem` /
   `rollItem` with forcedTier at 50/50) / lore console (dressing kind
   `'loreConsole'` + `lore` field — not `'console'`, preserving "console
   dressing belongs in structure rooms" — logged once on first exploration
   of its room, text from 4 canned original `LORE_LINES` by hash, no RNG).
   `room.lockedKind` is separate metadata; a locked room keeps its purpose
   including `security`. Boss compatibility (§9.7.7): Phase 5 rule
   unchanged; if the first security room is locked, the floor has no boss,
   reason `'locked-first-security-room'`, no substitution.
7. Exploration + renderer visibility: `floor.explored` plain-JSON arrays
   only (`{exploredRoomIds, walkedCorridorCells}`). Entering any cell of a
   room marks the whole room; a corridor cell marks exactly that cell.
   Current room full brightness; explored-unoccupied dimmed 45% (black
   overlay at `FOG_DIM_ALPHA = 0.55`); walked corridors dimmed, unwalked
   black; unexplored draws nothing except the §9.7.4 door-cell rule (door
   drawn when adjacent to a walked corridor cell or an explored room,
   even if the room beyond is unexplored; full if the player has
   door-aware LOS, else dim if known, else black). Actors/pickups/wrecks
   draw when the player is inside their room OR has door-aware LOS to
   their cell (through an open door) — NOT by tile visibility, so a foe in
   an unwalked corridor beyond an open door renders while its tiles stay
   black. Fog is rendering/sight only; scheduler/status ticks continue
   for unseen enemies exactly as Phase 5. Scout preview contract
   unchanged (counts only). LOS checks bounded to Chebyshev 12 for frame
   cost; beyond that, explored cells dim. No minimap.
8. `coherenceCheck` extended (existing checks verbatim) with the §10
   twelve checks in fixed order — grid/bounds, room geometry, corridor
   integrity, room-graph BFS, tile flood fill, door validity (including
   recomputed classification, record/grid 1:1, lock/HP/keyId consistency,
   per-room row-major entranceIds, no 3+ door runs, every non-spawn room
   ≥1 door), stair placement (incl. stairs room not locked), locked-door
   solvability (state-space search: tile + collected keys; stairs
   reachable with locks as walls; every key reachable without its own /
   unresolved lock; every lock force-reducible), spawn safety, content
   legality (incl. vault cache counts, objective content), encounter
   feasibility (incl. boss count ≤1 and `bossReason` consistency),
   deterministic result (signature fields + depth match + explored arrays
   well-formed + whole-floor plain-data walk + JSON round-trip identity).
   Both connectivity tests run. Door/fog checks apply only when
   `floor.doors` is an array; legacy floors soft-pass. Wired into
   generation via the attempt loop (max 8; attempt 0 seed = runSeed XOR
   depth; attempts >0 seed = `(baseSeed ^ Math.imul(attempt,
   0x85EBCA6B)) >>> 0`; field `generationAttempts`; `floor.seed` stays
   `(runSeed ^ depth) >>> 0` even on retry).
9. Sweeps (§3). 10. Regressions + harness (§6). 11. This report.

**Determinism (non-negotiable, honored):** single mulberry32 stream, seed =
runSeed XOR depth, fixed pass/draw order, no `Math.random()` anywhere in
generation, plain-JSON state only, failed operations consume no RNG beyond
their explicit draws, no draw added/removed/reordered in shipped
room/typing/purpose/corridor stages. New draws only in §9.7.10 order:
(1) locked-room selection (seeded draw only if >1 eligible), (2)
locked-kind, (3) lock-level, (4) objective-choice, (5) key-placement
(seeded draw only when multiple equally valid placements remain).
Generation signature in save metadata: `{runSeed, depth,
generatorVersion: 6, rulesetVersion: 1, rngAlgorithmVersion: 1,
tileCatalogVersion: 1}`. Seeds not promised stable across versions (§13).

## 3. 3,000-floor sweep — 100% structural pass

Script `beta-testers/sweep_phase6.js`. Same seed series as Phase 5: 200
seeds/depth, depths 1–15, runSeed = `(0x5D5C2026 + i×0x9E3779B9) mod 2^32`,
i=0..199, floor seed = runSeed XOR depth. Per depth it records floors,
doors (= entrances, 1:1 verified by coherenceCheck), locked rooms, keys,
lock-level and locked-kind distributions, boss presence + reasons,
coherence failures + error samples, door/key 1:1 mismatches, stairs
reachability via an independent BFS with locked doors as walls,
fog-data well-formedness, Scout preview match, attempt histogram / retry
floors / max attempts, floor hashes for determinism replay. Exit 1 on any
structural failure.

**Run 2 (valid run, exit 0): 3,000 floors, 0 failures in every category**
(coherence, door/key, stairs, Scout, fog). Determinism replay identical:
true. Totals: 47,047 doors (~15.7/floor); 2,774 locked rooms (92.5% of
floors) with exactly 2,774 keys; lock levels near equal thirds at every
depth (e.g. depth 1: L1 54 / L2 62 / L3 64; depth 15: L1 61 / L2 69 / L3 51);
locked kinds near equal thirds (e.g. depth 1: lootVault 58 / objective 63
/ newArea 59; depth 15: newArea 62 / objective 53 / lootVault 66); boss
present 503; 61 natural `locked-first-security-room` floors; retry floors
701; max attempts distribution: 2 depths max 3, 8 depths max 4, 5 depths
max 5 (under the 8 cap). Per-depth lines in
`beta-testers/reports/sweep_phase6.txt` (run 2 overwrote the txt/json).

**Run 1 failure was a sweep bug, not a game bug:** scoutMismatch
2,836/3,000, exit 1. Cause: `JSON.stringify(previewCounts) !==
JSON.stringify(byType)` is key-order-sensitive — the preview sorts
`byType` alphabetically while floor counts are in encounter order. Fixed
to an order-insensitive key-by-key comparison. Run 1 vs run 2 per-depth
lines are otherwise identical — generation is deterministic across runs.
Logs: `beta-testers/reports/sweep_phase6_run1.log`,
`sweep_phase6_run2.log`, `sweep_phase6.txt` / `.json`.

**Classification prototype (pre-build, 3,000 floors, shipped `'door'` cells
as pre-conversion corridors):** 49,936 candidate cells, 0 multi-room cells,
0 strict-vs-per-direction differences; 46,350 groups; sizes 1: 43,199, 2:
2,915, 3: 131, 4: 55, 5: 25, 6: 11, 7: 9, 8: 5; rooms with zero doors
497/24,032 (2.07%), including 32 spawn rooms (spawn exempt); walling
non-first group cells breaks room reachability in 4/3,000 floors and
stairs reachability in 1/3,000 — retries handle both; ~15.45
entrances/floor average. In the 36-floor node sample, 10/36 floors needed
retries (max 4 attempts) — driver is doorless rooms whose only connection
is an alongside corridor (e.g. seed 3 depth 1 room 8 at (50,30) 4×6,
corridor at x=54 alongside the east edge, opposite neighbor wall, so no
threshold); per §9.7.2 this is a generation failure and retry is the
spec's mechanism, not a bug.

## 4. Node tests — 158 pass, 0 fail, exit 0

`game/test.js`: baseline 143 + 15 new Phase 6 tests. Log
`beta-testers/reports/p6-node-run3.log` (run2 log `p6-node-run2.log` also
158/158). An earlier run piped through `tail -3` masked the counts and was
discarded; the counted rerun used a direct log file and exit-code check.
No new node tests were needed for the renderer (browser-only; node tests
load core only).

## 5. Browser verifier — verify_phase6.py run 5: exit 0, 34 PASS, 0 FAIL

Modelled on `verify_phase5.py` (same `testers.common.GAME_URL` file://
pattern, attempt loop of up to 3 fresh contexts, full log, exit code from
the completing attempt only). Covers every P6-* ID: art wiring (door/key/
batch-3 sheets load; closed-vs-open tile differential; red lock pixels),
door state (real bump: opens, player stays, exactly 1 time unit measured
against a wait baseline, then second bump enters), door LOS (core
`lineOfSight` false through closed / true once open; real FIRE through a
closed door does not hit), door wake (near LOS foe wakes, foe behind a
second closed door does not), force (real X damages, 1 time unit, no ammo
spent, repeated X breaks open; X at a non-door refuses free), key (exact
spec label `Key acquired: fits the <purpose> door (x, y).`; matching bump
consumes + opens; wrong-key bump refuses free and keeps the key), Bypass
(real B, exact refusal text, clock/keys/door unchanged), placement +
coherence + determinism on the live floor, locked rooms (scan seeds 1–120
× depths 1–15; kind legality + vault caches ≥ expected / objective
content), boss compatibility (natural scan seeds 1–200 × depths 5–15 for
`locked-first-security-room` with no boss, else the shipped `placeBoss`
exclusion point called directly with `lockedRoomIndex` = first security
index, looping seeds 1–50 at depth 6 until a security room exists), fog
screenshots (see below), fog LOS (foe beyond closed door differential <
0.01, then real bump opens the door and foe renders with differential >
0.03), save/load round-trip (door state + key + explored through
autosave + reload + Continue real click), legacy migration (save stripped
of `doors`/`explored`/`keys`, reload + Continue → all doors open, all
rooms explored), zero console errors / failed assets.

**Run 5 (exit 0, first attempt, all sections true):** fog-1 violations [];
dim ratios [0.447, 0.446, 0.445]; second room full on arrival; black-room
foe frac 0.0 at (9,37); fog-LOS closed 0.0 / open 0.1141 with foe present;
save restores door `door:23:15` open + key `key:fixture-save` + explored,
runState `playing`; legacy restores 16 doors, 8/8 rooms explored; console
none. Log: `beta-testers/reports/verify_phase6_run5.log`.

### Acceptance results per P6-* ID (§9.7.11)

| ID | Result | Evidence |
|---|---|---|
| P6-DOOR-PLACEMENT | PASS | Browser: every non-spawn room ≥1 door; sweep: 47,047 doors = entrances, 1:1 via coherenceCheck, 0 mismatches |
| P6-DOOR-STATE | PASS | Real bump opens, player stays, exactly 1 time unit; second bump enters |
| P6-DOOR-LOS | PASS | Core LOS false through closed / true once open; real FIRE through closed door does not hit |
| P6-DOOR-WAKE | PASS | Near LOS foe wakes; foe behind a 2nd closed door does not |
| P6-LOCK-FORCE | PASS | Real X damages, 1 time unit, no ammo; repeated X breaks open; X at non-door refuses free |
| P6-LOCK-KEY | PASS | Exact spec label; matching bump consumes + opens; wrong-key bump refuses free, key kept |
| P6-BYPASS | PASS | Real B, exact refusal text, clock/keys/door unchanged |
| P6-LOCK-SOLVABILITY | PASS | Sweep check 8 (state-space search) 0 failures on 3,000 floors; every lock key-or-force solvable |
| P6-STAIRS-REACHABILITY | PASS | Sweep independent BFS with locked doors as walls: 0 unreachable on 3,000 floors |
| P6-LOCKED-ROOMS | PASS | Scan seeds 1–120 × depths 1–15: legal kinds, vault caches ≥ expected, objective content present |
| P6-BOSS-COMPATIBILITY | PASS | Natural scan (61 `locked-first-security-room` floors, no boss) + direct `placeBoss` exclusion unit |
| P6-FOG | PASS | Fog-1 only spawn room; leaving dims ~45% ([0.447, 0.446, 0.445]); second room full; black-room foe hidden |
| P6-FOG-LOS | PASS | Closed differential 0.0; real bump opens door, foe renders (0.1141) |
| P6-SAVE-JSON | PASS | Autosave + reload + Continue restores door state + key + explored, runState `playing` |
| P6-LEGACY-MIGRATION | PASS | Stripped save → Continue: all doors open, all rooms explored (16 doors, 8/8 rooms) |
| P6-DETERMINISM | PASS | Same seed twice → identical floor JSON; sweep determinism replay identical |
| P6-COHERENCE | PASS | Live generated floor passes extended `coherenceCheck`; sweep 0 coherence failures |
| P6-SCOUT-PREVIEW | PASS | Sweep Scout preview match on all 3,000 floors (0 mismatches, after the run-1 comparison fix) |
| P6-ART-WIRING | PASS | Door/key/batch-3 sheets load; closed-vs-open tiles differ; red lock marker pixels present |
| P6-HARNESS | PENDING | §6 — harness run outstanding at report-draft time |
| P6-CONSOLE | PASS | No console errors / failed assets |

**Screenshots visually read (run 5, under
`beta-testers/reports/screenshots/`):**
- `phase6-fog-spawn.png` — only the spawn room renders full; everything
  else on-screen black. (Gold key visible inside the room is the known
  debris-variant sprite, not a key pickup.)
- `phase6-fog-left-spawn.png` — player in the corridor, spawn room visibly
  dimmed, open doorway with green strip, transient "The door opens."
- `phase6-fog-second-room.png` — second room full on arrival, spawn room
  dimmed, unexplored black; stairs panel open because the player stands
  on the stairs cell (that room's center is the stairs cell on this floor)
  — legitimate live state, not a fixture artifact.
- `phase6-fog-hidden-foe-with.png` — player alone on black; no foe renders
  in the unexplored room.
- `phase6-fog-los-closed.png` — no foe beyond the closed door. (Stairs
  panel visible here is STALE UI: section 10 ended on the stairs, and the
  HUD/panel sync only on actions, not on the rAF render — the live state
  was `playing` per the reset, which is why the subsequent real bump
  worked. Cosmetic fixture artifact, no check impact; the checks read
  state, not HUD.)
- `phase6-fog-los-open.png` — red raider renders on black tiles through
  the open door, transient "The door opens."
- `phase6-door-closed.png` — sealed blue bulkhead door; open shows the
  doorway with green strip (`phase6-door-open.png`); locked shows the
  sealed frame + red `L2` marker INSIDE the door tile, top-right corner
  (`phase6-door-locked.png`) — the run-1 floating-marker bug, fixed.

### Failures and diagnostics (verifier runs 1–5)

- **Run 1 (exit 1):** only 2 failures — locked-door red lock marker 0 px
  (sampled 5,625 px), and fog setup (no generated floor with an on-screen
  2nd room). Marker root cause: the lock badge was drawn above the door
  tile (sleeper-`z` position), overlapping the tile above. Fix (game.js):
  badge moved onto the door tile (top-right corner, `cy - TILE*0.25`
  instead of `cy - TILE*0.55`). Art passes from run 2 onward.
- **Run 2 (exit 1):** art fixed; only failure was fog setup (no seed in
  1..60 with a 2nd-room center within Chebyshev 9).
- **Runs 1–2 fog-setup root cause (found 2026-10-30):** the setup looked
  for `r.spawn` on rooms, but rooms carry `type === 'spawn'` for room 0 —
  no boolean flag exists. The setup returned null for every seed in both
  runs, so the earlier "on-screen" / "center within 9" diagnoses were
  wrong; the geometry was never tested. Measured distributions (node,
  seeds 1–200, depth 1) after fixing the lookup: nearest-center distances
  (floored) 5:5, 6:22, 7:38, 8:31, 9:21, 10:23, 11:18, 12:8, 13:4, 14:8,
  15:6, 16:4, 17:4, 18:1, 19:2, 20:1, 21:1, 23:1, 24:2 (center ≤9: 105/200);
  window-criterion on closest room: 14/200; any-room window criterion:
  17/200. This motivated the no-lottery fog redesign: fog-1 at spawn
  (only spawn room renders; all other on-screen tiles black except
  §9.7.4 known doors and spawn-room wall framing); real key-walk out of
  the spawn room's first door (never locked — locked rooms are non-spawn
  leaves; outward step derived from the door's room-floor neighbor) 2
  cells into the corridor, then dim check on LOS-blocked spawn cells only
  (cells visible through the open door stay full by design), sampled
  with canvas-clipped identical sub-boxes; real key-walk into the
  closest other room, center must render full; black-room foe via
  teleport fixture (teleporting never marks explored), corridor cell on
  the same row as an unexplored room's center with a wall/closed door on
  the line so LOS is blocked orthogonally (no corner-cutting leak).
- **Run 3 (exit 1):** fog section now runs. Failures: (a) fog-1 violations
  at (7,18),(8,18),(9,18),(10,18),(12,18) — diagnosed as HUD text, not game
  rendering: seed 1's spawn room is (9,19) 4×4 with north door at (11,18);
  the row-18 tiles sit partly above the canvas (canvas rect
  [0,35,1280,686], tile tops y=3.5, TILE 107), so the sampler read HUD
  pixels. Fixed with `clip_to_canvas` + region samplers; tiles fully
  off-canvas are skipped. (b) Dim check returned no ratios (6 LOS-blocked
  spawn cells exist, none fully in-canvas). Fixed with distance-sorting
  + identical tile-relative sub-box sampling (≥50% canvas overlap
  required). (c) Downstream cascade: fog-LOS open frac 0.0 with foePresent
  True; save door None, keys []; load runState `'stairs'`; legacy fails
  identically — sections 11–13 inherited section 10's teleported live
  state. Fix attempted: section 11 fresh-floor reset (seed 7). Run 3
  passes: second room full on arrival, black-room foe hidden (frac 0.0,
  cell (9,37)), fog-LOS closed hidden.
- **Run 4 (exit 1):** dim check now passes with textbook ratios
  [0.447, 0.446, 0.445]; second room and black-room foe still pass; but
  fog-1 violations moved to wall cells (9,18) 0.313, (10,18) 0.57,
  (12,18) 0.229, (8,19) 0.283, (13,19) 0.185 — the spawn room's north wall
  row and side walls rendering via the `fogVisibility` LOS fallthrough.
  **Game fix (wall-fog leak):** the old fallthrough returned `'full'` for
  any wall in LOS, which outlined rooms never entered. New rule: a wall
  cell renders only as framing of an explored room — 8-dir adjacency so
  room frames have no black corner gaps; full for the current room, dim
  otherwise, black everywhere else. Any other non-room/non-corridor/
  non-door kind returns black. Rationale: a wall bounding an explored
  room carries no information beyond that room's known rect; a wall
  bounding only unexplored rooms/void stays black. The verifier's fog-1
  check was updated to match: skip wall cells 8-adjacent to the spawn
  room rect (in addition to door cells). Sections 11–13 failed identically
  to run 3 despite the section-11 reset, proving the cascade theory
  incomplete.
- **Isolation debug (`/tmp/dbg1113.py`, passing):** replicating sections
  11–12 exactly (reset seed 7 → flatten → craft door at (15,23) → bump →
  section-12 craft/bump/key-walk/Space) works perfectly: player (14,23),
  door (15,23) closed → open on bump with player staying, key
  `key:fixture-save` picked up, Space autosave contains the door open +
  key + state `playing`. Conclusion: the run 4 failures come from residue
  of sections 0–10 that the section-11 reset does not clear, not from
  the section 11–12 steps themselves.
- **Debug copy (`/tmp/v6dbg.py`, dumps at section-11 entry, after
  section-11 bump, after section-12 Space):** the smoking gun —
  `sec11-enter: {px: 13, py: 37, runState: 'stairs', ...}`. Section 11 was
  entered with runState ALREADY `'stairs'`, and the reset did not clear
  it, so the bump did nothing (in `'stairs'` state arrow keys neither
  move nor open doors) and section 12 inherited `'stairs'` (Space did
  not autosave a playing run). Root cause of the `'stairs'` state: the
  section-10 fog-3 walk ends ON the stairs cell, because on the seed-1
  floor the closest other room (room:4, (8,10) 7×5, center (11,12)) has
  its center exactly on the stairs cell (stairs at (11,12)). Stepping
  onto stairs correctly enters `'stairs'` state — correct game behavior,
  verifier fixture gap. **Fix (verifier):** the section-11 reset now also
  sets `s.state = 'playing'; s.keys = [];`.
- **Run 4 fog-1 holdout (8,24) at 0.948 — transient overlay artifact, not
  a game leak.** The debug run's only fog-1 violation was tile (8,24)
  (wall, not spawn-framing, so checked) at 0.948. Pixel analysis: bright
  rows at y=645 (the (8,23) wall's bottom edge) and y=700–712 (a
  text-pattern band spanning the screen width, including void cells).
  Visual read of the strip: the `#transient-msg` overlay
  ("Bypass unavailable: no compatible lockpick skill…", from section 7,
  still inside its 3.5s window) sits on the canvas's bottom edge
  (`position: absolute; bottom: 8px` inside `#canvas-wrap`) and overlaps
  the bottom tile row. The tile itself renders black correctly.
  **Fixes (verifier):** `geom()` now reports the transient rect when
  showing; the fog-1 sampler shrinks sampled boxes to exclude the strip
  (skipping tiles with <50% remaining); plus a 3.6s wait before the
  fog-1 screenshot so the overlay has faded for visual reading too.
- **Run 5 (exit 0):** all of the above resolved; first attempt green.

## 6. Regressions + harness

PENDING — regression runs in progress at report-draft time; numbers to be
filled in before delivery.
