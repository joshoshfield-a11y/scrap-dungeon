# Phase 5 Report — Biome Enemy Rosters

Date: 2026-10-29 (evening PDT). Spec: `LOOT-SKILLS-DESIGN.md` §8 as amended by
§8.5 (settled FINAL spec, 3-exchange ChatGPT co-planning round 2026-10-29).
§8.5 governs wherever it differs from §8.1–§8.4. Working tree only — no
commits, pushes, merges, or publishing. No Phase 6 work. No new art/sprites.

## 1. Pre-implementation verification — F items (§8.5.13)

All twelve items were resolved from shipped code BEFORE the stat table was
frozen. Every value below was read from `game/core.js` / `game/game.js` /
`beta-testers/PHASE4-REPORT.md` / `beta-testers/sim_ammo.js` /
`beta-testers/verify_phase4.py`, plus sheet files via PIL. Where the spec and
shipped code conflicted, shipped code governed the mechanism and the
discrepancy is flagged here, not papered over.

- **F1 — spike damage/path.** Shipped player path: flat **6 damage**,
  once-ever per hazard record (`triggered` flag) in `afterPlayerStep`; shield
  absorbs before hull; no armor. NO enemy spike-damage path existed;
  `enemyAct` movement avoids `'hazard'` tiles. Decision: player path kept
  byte-identical; the per-entry rule for enemies was implemented separately.
  The player-once-ever vs enemy-per-entry divergence is flagged in §5.
- **F2 — Codex registry/keys.** NO registry or keys exist. Codex is a
  free-form string array; entries like `'Depth ' + depth + ' ' + theme +
  ' salvage signature'`; the grant path is `addCodex(state, entry)` (dedupes,
  mirrors to hub). Reconciliation: the boss entry follows the dataChip
  string pattern, names no individual, and is gated once-per-profile by
  checking whether any existing Codex entry contains the boss marker. No
  hub schema change. No `codex_boss_core` key was invented.
- **F3 — dmg/dmgVar semantics + damage scaling.** Flat+var roll
  `dmg + floor(rng()*(dmgVar+1))` (`rollDamage`); weapons use the dice
  branch. Damage scaling SHIPPED: spawn-time `dmg + floor((depth-1)/2)`.
  acc/evasion are ROLL-RANGE semantics, NOT percentages: attacker rolls
  `rng()*acc`, defender `rng()*evasion`, hit iff attacker roll ≥ defender
  roll. §8.5.2's "percentages" wording conflicts with the shipped
  mechanism; the shipped mechanism governs, the table values plug into the
  same fields. This is the root cause of the two gate revisions in §4.
- **F4 — HP rounding.** Shipped code uses **`Math.round(def.hp *
  (1 + 0.1*(depth-1)))`**, NOT floor. Floor-vs-round differ at: flyer d5
  17 vs 16, shielder/bomber d5 34 vs 33 (shielder now 28 on the revised
  base 20 — see §4), drone d2 18 vs 17, flyer d10 23 vs 22, shielder/bomber
  d10 46 vs 45. Decision per the build brief: follow shipped code (changing
  to floor would alter shipped trio HP). P5-HP-SCALING tests assert the
  shipped round rule.
- **F5 — distance metric.** Shipped code is MIXED, no single helper:
  movement/pursuit/retreat use Manhattan; spawn exclusion and adjacency use
  Chebyshev. Decision: new Phase 5 checks use Chebyshev per §8.5.10;
  existing movement stepping reuses shipped helpers.
- **F6 — boss key/display name.** No shipped registry expects `boss` /
  `Boss` (only a comment mention re elite/boss drop rates). New key `boss`,
  name `Boss`, no conflict.
- **F7 — shielder spawn orientation.** NO seeded facing rule exists.
  Enemies carry numeric `facing` (8-dir `dirIndexFor` index, overwritten
  every activation in `enemyAct`, consumed by the renderer as a sheet-cell
  index). Decision: shielder cardinal facing goes in a NEW separate
  plain-JSON field `shieldFacing` ('N'/'E'/'S'/'W'); numeric `facing` is
  untouched for rendering.
- **F8 — security-room guarantee.** NO purpose concept exists in code.
  Room types are spawn/combat/loot/structure/hazard/empty; `forceType`
  guarantees ≥1 loot + ≥1 structure. Decision: `purpose` is assigned to
  structure rooms from `['workshop','reactor','storage','security','arena']`
  (uniform 1/5 each) via one seeded draw each, in room order, immediately
  after the `forceType` guarantees (documented draw position; shifts the
  draw stream; no golden-layout tests exist — `test.js` asserts determinism
  same-seed/different-seed and property ranges only). The draw order was
  reordered during the build to the §8.5.1 listing order (only the
  draw-value→purpose mapping differs; no test pins it).
- **F9 — asset loader / SHEETS keys.** `SHEETS` values are `'assets/...'`
  paths resolved relative to the game page (`game.js`, `img.src =
  SHEETS[key]`); `drawActor` falls back to the base key when a pose key is
  missing, so new types need only base keys. Decision: the six PNGs were
  copied into `game/assets/` with source filenames, SHEETS keys = type
  names (`turret_light`, `flyer`, `shielder`, `sniper`, `bomber`, `boss`),
  following the trio convention — NOT a `game/assets/` path prefix, NOT the
  `sprites/...` source paths.
- **F10 — P4 contract labels.** The supplied P4 IDs (P4-BREAKDOWN-*,
  P4-AMMO-*, P4-STATUS-RESIST, P4-ENHANCE-COST, etc.) all appear in
  `beta-testers/PHASE4-REPORT.md`. Reconciled, no alias problem.
- **F11 — starter blaster.** `scrapBlaster` 2d6+8, range 5, timeCost 1,
  ammoPerShot 1, ammoType standard, element kinetic (`WEAPON_DEFS`);
  `STARTING_AMMO` 16, crate +8. The balance sim mirrors `sim_ammo.js`
  (uses `C.rollDamageDetailed` + explicit acc/evasion rolls replicating
  `weaponShot`).
- **F12 — LOS helper.** Single Bresenham `lineOfSight`; ONLY `'wall'`
  blocks; void does NOT block; diagonal corner-cutting present (no
  orthogonal-neighbor check). Decision: the existing helper is used
  everywhere (spec: single shared helper). §8.5.10's "walls/void block" is
  ChatGPT's incorrect claim about the existing function; void/corner
  behavior is shipped and flagged.

Additional shipped facts established before implementation: the scheduler
`processScheduler` ticks statuses BEFORE activations per unit and advances
`nextTime += interval` before `enemyAct`; the jam skip consumes the whole
activation at the top of `enemyAct`; sleep/wake spends an activation;
`killEnemy` componentDrop is a COUNT for the trio (raider 1, drone 0,
brute 2) while §8.5.2 defines new-type compDrop as a percentage chance of
exactly one; `killEnemy` kill-item `dropChance` is trio-only (0.12/0.10/
0.30, else 0); `coherenceCheck` expects exactly `min(12,3+depth)` enemies
and MUST be updated for boss-outside-cap; `scoutPreview` counts the real
generator (exact automatically, boss included); `serializeRun` serializes
`floor` wholesale via JSON (new enemy fields persist automatically);
`deserializeRun` normalizes enemies (statuses array, legacy burn);
`themeForDepth` already matches §8.5.3 (7 Molten, 8 Frozen, 9 Toxic,
10 Neon, 11+ cycles via `(depth-11)%4`); enemy placement requires
`get()==='floor'`, so turrets can never land on hazards in normal
generation (BFS relocation is a defensive helper + synthetic-floor test
path); `BURN_BASE_DMG` 3, `BURN_TICKS` 3; the player movement funnel is
`playerAction`; all `fireWeapon` patterns funnel through `weaponShot` —
single shielder hook point there plus `resolveAttack` (both branches; P=0
there, no ammo context; halving applied after normal modifiers incl.
surprise 1.5x/crit/overclock, before armor); `game.js` exposes
`window.__scrapDebug.getState()` and `window.ScrapCore`;
`verify_phase4.py` uses `testers/common.py` GAME_URL + real clicks/keys +
attempt loop with per-attempt FAILURES (never pipe through tail); status
records use `kind`, not `type` (`{kind:'burning'|'jammed'}`);
`applyShield` returns `{remaining, absorbed}`, NOT `{dmg}` — a detonation-code
bug from using the wrong shape was caught by node tests and fixed;
`playerEvasion(state)` reads `state.player.evasion` when numeric, else
`PLAYER_DEF.evasion`.

## 2. What shipped

`game/core.js` + `game/game.js`, working tree only.

**Stat table (§8.5.2, as gate-revised — see §4).** ENEMY_TYPES extended
with six entries plus a semantics-reconciliation comment. Shipped values
(hp/dmg/dmgVar/armor/acc/evasion/interval): turret_light 20/4/1/1/75/0/30,
flyer 12/4/2/0/70/16*/10, shielder 20*/5/2/2/70/5/20, sniper 18/8/2/0/85/0/30,
bomber 24/6/2/1/65/0/30, boss 120/8/3/4/80/5/20 (* = gate-revised values).
Salvage ranges, fractional componentDrop (0.15/0.10/0.25/0.25/0.20/1.0),
and burning/jam resistances per §8.5.2. HP depth scaling uses the shipped
`Math.round` rule (F4), applied once, all types including the trio and
boss; damage scaling uses the shipped spawn-time rule (F3).

**Roster/weights (§8.5.3).** `themeNameForDepth`, `THEME_CYCLE`,
`ROOM_PURPOSES`, `ROSTER_TABLES` (elite table order follows the §8.5.3
worked examples: donor pool = first two entries, Shielder/Turret),
`rosterWeightsFor` (k = depth − firstDepth, p = min(0.10k, 0.50), shift
F×p proportionally, full-precision floats, normalize by adjusted sum),
`pickRosterType`. Regular enemy count stays `min(12, 3+depth)`; boss and
boss drones sit OUTSIDE the cap. Theme assignment 7 Molten / 8 Frozen /
9 Toxic / 10 Neon, cycling (shipped `themeForDepth` already matched).

**Boss (§8.5.4).** Module-level `placeBoss` (depth<5 / no-security-room /
no-valid-cell / present; first security room in generator order; walkable
unoccupied `'floor'` cells only, ≥3 Chebyshev from spawn, greatest
distance, ties by y-then-x scan order, no RNG draws) with `bossReason`
stored on the floor. Half-HP once-only drone spawn: ordinary drones,
shipped stats/scaling, awake, `nextTime = clock + interval`, runtime BFS
over walkable non-hazard cells (4-dir N/E/S/W, excluding occupied/player
cells), spawn-as-many-as-fit with diagnostic, never on a lethal hit,
`dronesSpawned` once-only. Threshold helper is called after damage in the
bump + `registerHit` paths, `tickStatuses`, enemy spike damage, and bomber
splash. Rewards: exactly one Epic-or-Legendary item via a forced-tier roll
(50/50 seeded, plus a 0.4 gear-weight mirror of kill drops, via optional
forced-tier params on `rollItem`/`rollGearItem`) + one Codex entry on
first defeat (entry pattern `'Depth N <theme> boss signature'` via
`addCodex`, marker `BOSS_CODEX_MARKER = 'boss signature'`, F2
reconciliation). The boss is NOT marked elite (elite XP branch stays
dormant). The ordinary kill drop (salvage/components) still fires — it is
the shipped `killEnemy` path, separate from the guaranteed reward.

**Spikes (§8.5.5).** Spike-only confirmed. Enemy spike-entry rule: the
`enemyAct` wrapper records the pre-position, calls the step function, then
if a ground-type enemy moved onto a hazard cell (still alive) applies flat
6, wakes, and death goes through the ordinary `killEnemy` path once.
Re-entry retriggers; standing still never retriggers; spawn placement is
not entering. Flyers are exempt (pursue/patrol legality allows hazard
tiles for flyers only; flyers skip the spike check; flyers may be
generated onto spikes; ground enemies are never generated onto spikes).
`relocateTurretFromSpike` (BFS N/E/S/W through walkable cells, nearest
legal cell, throws only if none exists anywhere). Bomber spike-death
detonates via the death rule. `coherenceCheck` updated: expected =
regular cap + boss count; ground enemies never on hazards (flyers exempt);
boss must sit in a security room.

**Shielder (§8.5.6).** Stored plain-JSON `shieldFacing` (F7). Spawn
facing: visible → nearest cardinal via `nearestCardinal` (exact-diagonal
ties N/E/S/W); not visible → one seeded draw `floor(rng()*4)` over
[N,E,S,W] taken right after placement. Facing updates only after a
successful movement (wrapper, step delta through the same
nearest-cardinal function). 90-degree frontal arc, boundary-included
(`FRONTAL_DIRS`, `isFrontalShieldHit`, `shieldedRawDamage`); frontal =
attacker's 8-way step direction in the 3-direction set for the facing.
Formula `D_final = max(1, floor(D_raw × S) − max(0, A − floor(A/2) × P))`
applied in both `resolveAttack` branches and in `weaponShot` (after
overclock/crit, before armor; `(shield halved)` log marker; P=0 in
`resolveAttack`, no ammo context). Shield only for direct weapon attacks
with a source position. **Surprise special case (judgment call, §5):** for
a frontal surprise hit the shipped `(raw−armor)*1.5` shape is replaced by
the spec formula `max(1, floor(round(raw*1.5)*0.5) − effArmor)` for that
case only.

**Sniper (§8.5.7).** Aim-then-fire telegraph stored on the enemy
(`telegraph: {x,y}`); firing rechecks range ≤8 Chebyshev + LOS and fires
at the marked tile only if the player still occupies it, else an
"empty ground" miss. Jam at aim = no telegraph; jam at firing = telegraph
cancelled with an "aim is spoiled" log (jam branch cancels before
dispatch). `sniperAct` checks an existing telegraph BEFORE the ≤3 retreat
branch (retreat never cancels an aimed shot); retreat is Chebyshev ≤3 to
a distance-increasing legal step, else hold; falls through to generic
when out of range and not close. Marker rendering is LOS-gated via the
exported `C.lineOfSight`.

**Bomber (§8.5.8).** Manhattan-1 fuse arming on movement resolution
(`armBomberFuses`, from the `playerAction` move branch and the `enemyAct`
wrapper after any successful enemy move). Jam-deferred detonation: the
armed-fuse check sits immediately after the jam branch and BEFORE the
wake branch in `enemyActInner` (fuse-hoist fix, §5) — a sleeping bomber
with an armed fuse detonates instead of waking. Death detonation clears
the pending fuse (`detonated` set before splash, fuse cleared, ONE shared
`rollDamage` roll per detonation per the Exchange 3 ruling, per-target
hit/evasion mirroring `resolveAttack`, per-target armor, shielder arc NOT
applied). Radius-1 Chebyshev splash with per-target line of effect;
chain detonations via a queue (`_detonating`/`_detonationQueue` transient
flags); player damage via `playerEvasion`/derived armor/`applyShield`/
Second Wind with a state guard; enemy damage via ordinary evasion/armor.

**Turret (§8.5.9).** Stationary, `nextShotTime` initialized to spawn
world time (stored as ticks ×10, §5), no cooldown consumed without a
valid target, sight/range 8 Chebyshev + LOS. After a shot,
`nextShotTime = clock + interval`; no-target activations consume nothing.
Shipped wake-first behavior kept. BFS spike relocation per §8.5.9
(defensive + synthetic-floor path; normal generation can never place a
turret on a hazard, F1).

**Distances/LOS (§8.5.10).** Chebyshev everywhere except bomber fuse
(Manhattan 1); single existing grid LOS function; `chebDist` helper for
new checks. Shipped void/corner behavior kept (F12).

**Phase 4 interplay (§8.5.11).** Hit-pipeline order verified against
shipped code: `weaponShot` piercing order matches §8.5.6 exactly (halve
raw, then armor − floor(armor/2) for Piercing ammo; rail-gun weapon
pierce zeroes armor separately as shipped Phase 1 behavior);
`resolveAttack` order matches (modifiers → halve → armor → clamp ≥1).
Resistance rolls on the seeded mulberry32 stream only after confirmed
hits; Shock consumed on hit; burn-ticks-before-activations scheduler
order kept; every death/drop exactly once (the `if (!foe.alive) return;`
guard was added to `killEnemy`).

**Art (§8.5.12).** Six EXISTING sheets copied into `game/assets/` with
source filenames (turret_light 4,626 B, flyer 5,075 B, shielder 5,430 B,
sniper 4,671 B, bomber 4,724 B, boss 5,835 B; md5-verified identical to
sources for turret_light `9faf656e…` and boss `bd4b7bbb…`). SHEETS base
keys = type names; pose fallback covers the rest, no new art. Marker
rendering in `render()`: sniper telegraph amber crosshair rect on the
marked tile (LOS-gated), bomber fuse `!` marker — plain canvas shapes.
`node --check game.js` clean. All new enemy state serializes as plain
JSON; `deserializeRun` gained Phase 5 field defaults for old saves
(`shieldFacing` 'N', `nextShotTime` 0, `telegraph` null, `fuseArmed` /
`detonated` false, `dronesSpawned` false); room purposes round-trip via
JSON, absent stays absent. Exports added for the theme/roster/distance/
shield/`placeBoss`/relocation/drone/detonation/spike/boss-reward helpers
plus `BOSS_CODEX_MARKER`.

**Interval-units reconciliation.** Spec "world time units" are stored as
ticks (×10), preserving the shipped scheduler mechanism; tests assert
stored tick values + cadence.

## 3. Verification receipts

### Node tests — 143/143 green

`node --test game/test.js` (baseline 111 + 31 Phase 5 + 1 fuse-sleep).
Coverage: stat table exact + interval tick values; HP/damage scaling with
shipped `Math.round` (incl. flyer d5 17, shielder/bomber d5 34 on the
pre-revision base, shielder d5 28 on the revised base 20); theme mapping
1–15; weight-shift worked examples (d7 all 2; d8 donors 1.8/recipients
2.1; d12 donors 1.0/recipients 2.5; d17 = d12 cap; d2 base; d3 2.7/2.2)
+ weight conservation; roster draw determinism + shares within ±15%;
roster composition (200 floors × depths 2/8); determinism replay;
`placeBoss` gates/tie-break/first-room/exclusions; generated bosses
(80 seeds × depths 5–8, coherence ok, ≤1, in security room, ≥3
Chebyshev, at least one boss seen); boss drones (once-only, never lethal,
burn-tick crossing); boss reward (exactly one Epic/Legendary + one Codex
entry, second kill no second entry); fractional compDrop boundaries
(0.10→1, 0.20→0, boss 1.0→1, trio integer untouched); spike
entry/re-entry/standing-still via retreat geometry (pursue avoids hazards
— shipped behavior; retreat is the entry vector); flyer spike crossing +
no ground enemy generated onto spikes; turret relocation (BFS N-first,
no-op off-spike, throws when no legal cell); shielder arc (90°,
boundary-included, E/W at 90° not frontal); shielder formula worked
example (D=10, S=0.5, A=4, P=1 → 3; resolveAttack frontal/rear/surprise);
facing update only after movement; spawn-facing rule on real floors
(visible → nearest cardinal); sniper aim/fire, move-off dodge, jam at
aim/fire, retreat; bomber fuse arm (Manhattan 1 on move, not 2, not on
wait), fuse fire with one shared roll (shared 7 − armor 2 = 5), splash
shared roll + chain queue (two blasts, raider 20→8), death-detonation
fuse clearing + jam deferral; turret never-moves/nextShotTime/no-cooldown-
without-target + scheduler cadence (1 shot per 3 player actions); save/load
round-trip + legacy defaults; scout preview exactness; jam resistance on
seeded stream + burn tick values (boss 2, flyer 1, turret 3);
P5-FUSE-SLEEP (sleeping bomber with armed fuse detonates instead of
waking).

First run was 134/142: 3 test-setup bugs (weight-conservation base map
keyed by theme name missed Molten/Frozen/Toxic/Neon; generated pickups
outside the test box polluting reward/compDrop counts — fixed by clearing
`floor.pickups`), 1 real game bug (`applyShield` shape, fixed), 2
test-geometry errors (spike test used pursue which avoids hazards —
rewritten around retreat; shielder-facing test expected N for a southward
step — corrected to S), plus downstream detonation NaN failures from the
`applyShield` bug. Helpers added to `test.js`: `p5Box`, `p5Foe`,
`p5Floor`.

### Roster sweep — 3,000 floors, one documented noise excursion

`beta-testers/sweep_phase5.js` (200 floors/depth 1–15, seed series
`runSeed = (0x5D5C2026 + i × 0x9E3779B9) mod 2^32`, floor seed runSeed XOR
depth; per-depth observed-vs-expected shares ±15% relative; boss-presence
share + reasons from `floor.bossReason`; determinism replay via FNV hash
of grid+enemies+rooms+reason; validation incl. coherence failures/count
mismatches/unwired types/boss-in-non-security). Outputs:
`beta-testers/reports/sweep_phase5.json` + `sweep_phase5.txt`. The script
exits 1 on any failure. **Run result: exit 1 SOLELY on the depth-4 share
band.** Determinism replay identical: true. All validations zero
(coherenceFailures=0, countMismatches=0, unwiredTypes=0,
bossInNonSecurity=0) at every depth. Depth 4 (overgrown, 1400 regular):
brute expected 0.1667 observed 0.1400 (relErr 0.16), sniper expected
0.0833 observed 0.0664 (relErr 0.2029); all other depths 1–15 within
±15%. Boss presence (post-reorder re-run): d5 55/200 (27.5%), d6 54
(27.0%), d7 53 (26.5%), d8 66 (33.0%), d9 49 (24.5%), d10 61 (30.5%),
d11 50 (25.0%), d12 51 (25.5%), d13 49 (24.5%), d14 40 (20.0%), d15 46
(23.0%); dominant absence reason `no-security-room`, rest `present`;
depths 1–4 reason `depth<5`; no `no-valid-cell` reason appeared at any
depth. The re-run after the ROOM_PURPOSES reorder reproduced the
identical depth-4 FAIL (roster draws unaffected by purpose order) with
depth-5 boss presence moving 42→55/200.

**Depth-4 replication (noise vs bug):** three INDEPENDENT 1000-floor
depth-4 series (bases 0x12345678, 0xDEADBEEF, 0x5D5C2026; 7000 draws each)
all sit within ±8% relative on every type (worst relErr 0.0777, sniper on
the 0x5D5C2026 base). Verdict: the sweep excursion is consistent with
sampling noise at 1400 draws (brute −2.7σ, sniper −2.3σ across ~70 band
comparisons), not a weighting bug; the isolated roster-draw node test
(20,000 draws) also passes within band. Script kept for auditability:
`beta-testers/sweep_phase5_depth4_check.js`, output
`beta-testers/reports/sweep_phase5_depth4_check.txt`. The gate result
stands as recorded; no silent re-run with different seeds was used to
make it pass. Lesson re-learned during the run: piping through `tail`
masks the exit code — all outputs were captured to files and exit codes
read directly.

### Balance sim P5-BALANCE-SIM — GATE PASS (after 2 authorized revisions)

`beta-testers/sim_phase5.js` (20,000 seeded trials per type×depth×mode;
actual Phase 1 starter blaster Common +0 scrapBlaster 2d6+8 acc 14 through
the existing pipeline mirrored from `sim_ammo.js`; HP with shipped
`Math.round`; shielder frontal/rear modes; writes
`beta-testers/reports/sim_phase5.txt` + `sim_phase5.json` + durable stdout
`sim_phase5_stdout.log`). **Gate-scope reading (stated plainly):** bands
evaluated at each type's INTRODUCTION depth (trio d1; turret/flyer d2;
shielder/sniper d4; bomber d6), where the starter blaster is the honest
baseline (the Phase 1 gate's own scope was depths 1–2); full per-depth
tables recorded for diagnostics; boss-ordering evaluated at EVERY depth
5–15 (boss and trio HP scale identically); a literal all-depths >8 rule
with a starter weapon is unsatisfiable by construction (shipped brute
exceeds 8 from depth 5 with the starter blaster and is not a Phase 5
value), so late-depth >8 medians are a gear-progression diagnostic, not a
gate failure.

**First run: exit 1 — two genuine gate failures on new Phase 5 values.**
Flyer d2 median 3 (band 1–2); shielder frontal d4 median 8 (band 4–6; a
different seed gave 7, showing seed sensitivity at the boundary).
Everything else passed: trio exactly 3/3/6, turret d2 median 2, sniper d4
median 2, bomber d6 median 3, shielder rear d4 median 3, boss median
highest at every depth 5–15 (boss d5 median 19, d6 median 20). >8
diagnostic: brute d5–d15 medians 9–15, shielder-frontal d6–d15 medians
9–14 with the starter blaster.

**Candidate sweep + 5-seed robustness check**
(`beta-testers/sim_phase5_candidates.js`, kept for auditability): flyer
evasion 16 → median 2 on all 5 seeds (18 also 2 but thinner; 20 → 3).
Shielder base HP 20 (d4 HP 26) + armor 2 → frontal median 6, rear median
3 on all 5 seeds. **Revisions applied per §8.5.13 ("revise only new
Phase 5 values and rerun; do not change thresholds"):** flyer evasion
20→**16**, shielder HP 24→**20**, armor stays 2 (keeps the §8.5.6 worked
example with armor 2 valid; flyer 16 stays dodgier than drone's 14).
Rationale (F3): the spec's bands were written under the percentage
reading of acc/evasion; under the shipped roll-range mechanism evasion 20
dodges 65% of shots vs acc 14, and shielder HP 24 + armor 2 + halving
over-mitigates. Applied in `game/core.js` ENEMY_TYPES, `game/test.js`
stat-table expectation + HP-scaling assertions, and a dated "Gate
revision" note appended to §8.5.2 in LOOT-SKILLS-DESIGN.md (original
table text preserved). Thresholds unchanged.

**Re-run: exit 0, GATE PASS.** Introduction-depth medians (p10/median/
p90): raider d1 2/3/5, drone d1 1/3/6, brute d1 5/6/8, turret_light d2
2/2/2, flyer d2 1/2/5, shielder frontal d4 5/6/8, shielder rear d4
2/3/4, sniper d4 2/2/2, bomber d6 3/3/3, boss d5 16/19/22. Boss ordering
holds at all depths 5–15 (boss d10 23/26/29, d15 29/32/36).

### Browser verification — verify_phase5.py 31/31, exit 0

New `beta-testers/verify_phase5.py`: real Playwright via the ML venv
python (`~/workspace/venvs/ml-stack/bin/python`,
`TMPDIR=~/workspace/.playwright-tmp`), FULL output to
`beta-testers/reports/verify_phase5.log` (never piped through tail),
3-attempt loop with per-attempt FAILURES like `verify_phase4.py`, GAME_URL
from `testers/common.py` (file:// URI, no server). **Result: 31 PASS,
0 FAIL, exit 0, first attempt** (re-run after /tmp log reaping reproduced
31/31, exit 0, log saved durably). Zero console errors / failed assets.
Coverage: (1) all six sheets load at 822×136 via Image with the same
relative resolution; (2) each type renders — differential pixel check
(foe vs foe removed, same camera, tile rect recomputed from game.js
`resizeCanvas` + `tileOrigin` math, >3% differing pixels), screenshots
`phase5-render-<type>-with/without.png`; (3) turret — no cooldown without
a valid target (player teleported far, range 8), then fires, never moves,
sets nextShotTime; (4) flyer — crosses a spike tile unharmed (HP
unchanged, hazard tile entered, up to 10 waits, position trail recorded);
(5) shielder — frontal damage in [3,8] with "(shield halved)" log marker,
rear in [8,18] without it, via real F presses; (6) sniper — aim telegraph
on the player's tile, amber marker pixel count (>20) on the marked tile
in `phase5-sniper-telegraph.png`, standing-still shot damage 6–8 with
telegraph cleared, move-off dodge into "empty ground" (sniper interval 30
= 3 player actions: the checks poll up to 4 waits for the firing
activation — probe-verified cadence); (7) bomber — real move to Manhattan
1 arms the fuse, amber '!' marker pixels (>5) in
`phase5-bomber-fuse.png`, detonation with one shared roll 6–8, splash
player damage 4–6 + adjacent raider damage 5–7; (8) boss — generates
depth-5 floors over seeds 1–12 until a boss exists, asserts
security-room placement, threshold-crossing FIRE (HP set to
floor(maxHp/2)+3) releases drones, killing FIRE (HP set to 3, drones
cleared) drops exactly one Epic/Legendary kind='item' pickup + one 'boss
signature' Codex entry mirrored to hub, screenshot `phase5-boss.png`;
(9) save/load — Phase 5 foe state (shieldFacing 'W', nextShotTime 12345,
telegraph {x:1,y:1}, fuseArmed true, dronesSpawned true) serializes as
plain JSON in localStorage key `scrapdungeon.run.v1` after a real
wait/move, then reload + real Continue click restores it; (10) zero
console errors / failed assets. Fixtures via
`window.__scrapDebug.getState()` + `window.ScrapCore`; every behavior
through real keys/clicks.

Script bugs found and fixed across the first two runs (no game bugs):
foes crafted with `nextTime: 0` while the run clock was far ahead got a
scheduler catch-up burst (sniper aimed/fired/aimed in one wait, flyer
jumped cells) — fixtures now use `nextTime = clock`; the shielder fixture
facing computation was inverted (fixed to `dy // 2`); the boss-reward
check now filters `kind == 'item'` (the salvage pickup is the separate
ordinary kill drop, not a second reward).

**Screenshots visually read** (this session): `phase5-boss.png` (boss
sheet distinct from the trio, red mech with cyan visor),
`phase5-sniper-telegraph.png` (amber crosshair on the player's tile + "Sniper
takes aim at (22, 19)!" log line), `phase5-bomber-fuse.png` (amber `!`
over the armed bomber, "Bomber 24/24" tooltip, "Bomber's fuse arms!" log
line), `phase5-render-boss-with.png` (boss renders two tiles from the
player). Differential pixel checks are the quantitative evidence; the
reads confirm the markers are the intended ones.

### Phase 4 / 3 / 2 regressions

- **verify_phase4.py: 20/20, exit 0**, first attempt (re-run this
  session; raw log lost to /tmp reaping — count and exit code recorded
  from the run's own output).
- **Ammo sim re-run** (`beta-testers/sim_ammo.js`, same seeds/config):
  exit 0. The sim's hardcoded trio table CRASHED on the first re-run
  (`dist[type...]` undefined for turret_light/flyer on depth 2–3 floors)
  — a harness gap, not a game bug. Fix: `ENEMIES` is now derived from
  shipped `ENEMY_TYPES` (boss excluded — never appears at depths 1–3);
  trio keys keep identical values and identical per-key RNG seeds, so
  trio distributions are unchanged. Results: d1 demand median 16,
  rangedFrac median 1.00 (unchanged, trio-only); d2 demand median 19,
  rangedFrac median 1.00 / mean 0.89 (vs Phase 1 gate 0.90 — essentially
  unchanged; turret/flyer are cheap 2-shot kills); d3 rangedFrac median
  **0.57** (vs 0.39 at Phase 1 — IMPROVED, because the roster mix at d3
  dilutes expensive brutes with cheap 2-shot types at the same total
  count). Phase 4 gates all still pass: P4-NO-UNIVERSAL-DOMINANCE
  (anyDominant false), P4 ammo baseline 3/3/6 exact, ammoShare d1/d2
  median 1.00 ≥ 0.7, zero-item floors 0. Note: `sim_ammo_results.json`
  now reflects the Phase 5 roster; durable stdout at
  `beta-testers/reports/sim_ammo_stdout.log`.
- **verify_phase2.py: 16/16, exit 0** (re-run this session; raw log lost
  to /tmp reaping).
- **verify_phase3.py: exit 1 — known hunt-RNG flake class, NOT a new
  behavior failure.** 18 PASS lines across 6 attempts. Failures: 5× "hunt
  earns 4+ run skill points and 25+ carried salvage" (hunter died in 4,
  runState 'dead', kills 1–3, points 0 — death wipes run points; one run
  reached 26 carried before dying) and 1× "extract reaches the hub with
  20+ banked salvage" (Bag modal intercepted the extract click; banked 8,
  carried 26, HP 83/100 alive at depth 2). The aggregate "Instructor buy
  + death persistence + respec" check is downstream of those two flaky
  checks (hub/persist/respec all False because the hunt/extract legs
  never completed). These signatures match the Phase 3 parent re-run
  verbatim (documented in PHASE3-REPORT.md: 4 hunt failures + 1 scripted
  death across retries, same flake class as the Phase 2 shield-hunt
  flake). No deterministic Phase 3 behavior check failed. **Caveat
  stated plainly:** the hunt script is trio-era and unmaintained for the
  new roster — whether turrets/flyers make hunts deadlier was NOT
  measured; the flake predates Phase 5, but a roster effect on hunt
  lethality cannot be excluded from this evidence. `verify_phase3.py`
  was NOT "fixed" — out of Phase 5 scope.

### Full harness — 351 PASS, 0 FAIL, 2 NOTE

`bash beta-testers/run_all.sh`, exit 0. Baseline (parent-verified Phase 4):
339/0/2. Delta reconciled exactly: **+12 PASS = 6 new sheets × 2 static
checks** (geometry + painted content), all PASS (verified in
`results.json`). The 2 NOTEs are the same pre-existing pair as baseline:
unreferenced `prop_salvage_sheet.png`, and "wall bumps give no feedback".
Zero console/page errors across all personas; zero blockers/majors.
Report: `beta-testers/reports/REPORT.md`, `results.json`.

## 4. Judgment calls (all with rationale)

1. **Shipped `Math.round` over spec floor (F4).** Changing to floor
   would alter shipped trio HP. Flagged, tested, spec note not rewritten.
2. **Shipped roll-range acc/evasion over spec percentages (F3).** The
   table values plug into the same fields; the percentage reading was
   ChatGPT's misreading of the shipped mechanism. Root cause of the §4
   gate revisions.
3. **Gate revisions — flyer evasion 20→16, shielder HP 24→20.**
   Authorized by §8.5.13 (revise only new Phase 5 values, never
   thresholds); 5-seed robustness check; dated note appended to §8.5.2
   with original text preserved.
4. **Gate-scope reading.** Introduction-depth bands + boss ordering at
   every depth; late-depth >8 medians diagnostic-only (starter-weapon
   unsatisfiability argument, §3).
5. **Elite worked-example ordering.** §8.5.3's elite value lists, read in
   the stated elite order, would assign donors the increased weights,
   contradicting the donor-pool formula; the Overgrown/Scrapyard worked
   examples (unambiguous, in table order) match the formula exactly, and
   the value multisets match. Resolution: formula governs + stated elite
   order (Shielder, Turret donors) governs; worked lists treated as value
   multisets.
6. **Fuse-hoist.** §8.5.8 allows only the jam deferral for an armed fuse
   ("detonates at the bomber's next scheduled activation"), but the
   shipped wake rule made a sleeping bomber spend its activation waking
   before detonating. `enemyActInner` now checks an armed bomber fuse
   immediately after the jam branch and before the wake branch
   (status-like pending event, cf. §8.5.11 burning); `bomberAct`
   dispatch later remains as fallback. New node test P5-FUSE-SLEEP.
7. **Spike-vs-fuse reading.** "Spike entry alone never arms a fuse" read
   as the spike event itself not being a fuse trigger; a move ending at
   Manhattan 1 still arms via the proximity rule.
8. **Player spike once-ever vs enemy per-entry.** Shipped player
   semantics kept byte-identical (F1); enemies use the spec's per-entry
   rule. Deliberate, flagged divergence — the two paths are different
   code and the player path predates Phase 5.
9. **Shielder surprise-formula special case.** For a frontal surprise hit
   only, the shipped `(raw−armor)*1.5` shape is replaced by the
   spec-formula shape `max(1, floor(round(raw*1.5)*0.5) − effArmor)`.
10. **Purpose-draw reorder.** `ROOM_PURPOSES` reordered to the §8.5.1
    listing `['workshop','reactor','storage','security','arena']` for
    spec fidelity; uniform 1/5 each; only the draw-value mapping
    differs; sweep re-run reproduced the same depth-4 result.
11. **Interval units as ticks.** Spec "world time units" stored ×10 per
    the shipped scheduler; tests assert tick values + cadence.
12. **Boss reward + ordinary drop coexist.** The guaranteed item is
    exactly one Epic/Legendary; the salvage/components drop is the
    shipped ordinary `killEnemy` path firing once, not a second reward.
13. **`sim_ammo.js` roster extension.** Derived `ENEMIES` from shipped
    defs (see §3); trio distributions provably unchanged (identical
    values + seeds).
14. **Sweep gate stands as recorded.** One noise excursion, independently
    replicated as unbiased; no seed-shopping.

## 5. Dormant reconciliations

- **Elite XP branch:** boss is NOT marked elite; the elite-kill XP
  branch stays dormant, exactly as in Phase 3.
- **Dormant rules** (elite kills, carried cap, hidden hazards, energy
  weapons): untouched by Phase 5; no Phase 5 code reads or writes them.
- **Codex:** no registry existed and none was invented (F2). The boss
  entry uses the shipped free-form string + `addCodex` path; the "Codex
  key" question in §8.5 is answered: there is no key system to reconcile
  against.
- **Def-level `element` / `ammoType` labels:** inert by design (Phase 4
  flag, unchanged).
- **Phase 4 statuses:** Burning/Jammed interplay implemented exactly per
  §8.5.11 on the shipped status manager (`kind`-keyed records); no Phase
  4 behavior was rewritten to fit the spec.

## 6. Open flags (carried + new)

Carried from earlier phases (unchanged): Incendiary near-dominance
(economy-gated; the ammo sim re-run still shows no universal dominance,
but Incendiary is strictly lower on raider/drone/sniper at d1 and brute
at d3 — re-check if costs change); Enhance is hub-edit/run-local with a
UI warning, no hub gear stash invented (design call owed later); missing
weapon/gear art; sim not extended with gear in the damage pipeline;
"You misses X" grammar nit (pre-existing in `resolveAttack`); Escape-modal
nit; brute tail p90 22 (Phase 1 carryover — the Phase 5 sim shows brute
d1 p90 8, late-depth medians 9–15 as a gear-progression diagnostic, not
a gate failure).

New in Phase 5: (a) depth-4 sweep excursion — recorded as noise with
replication, not a bug, but the band is tight at 1400 draws; (b) player
spike once-ever vs enemy per-entry divergence (§4.8) — a future
unification decision, not a bug; (c) P3 hunt script is trio-era — hunt
lethality under the new roster unmeasured (§3); (d) shielder surprise
special case (§4.9) — spec-formula shape only for that case; (e) void
does not block LOS and diagonals cut corners (shipped, F12) — the
sniper telegraph and turret sight inherit it; (f) `sim_ammo_results.json`
now reflects the Phase 5 roster (trio distributions unchanged, d3 share
improved to 0.57 — see §3).

## 7. Files changed

- `game/core.js` — ENEMY_TYPES ×6, roster/theme/purpose code, `placeBoss`,
  `relocateTurretFromSpike`, boss/detonation/spike machinery, shielder
  hooks (`resolveAttack`, `weaponShot`), type dispatch (`turretAct`,
  `sniperAct`, `bomberAct`), `enemyAct` wrapper split, `killEnemy`
  fractional compDrop + boss reward + alive guard, `coherenceCheck`
  update, `deserializeRun` Phase 5 defaults, exports.
- `game/game.js` — six SHEETS base keys, sniper-telegraph + bomber-fuse
  marker rendering.
- `game/test.js` — 32 new tests (31 Phase 5 + P5-FUSE-SLEEP), helpers
  `p5Box`/`p5Foe`/`p5Floor`.
- `game/assets/mech_{turret_light,flyer,shielder,sniper,bomber,boss}_sheet.png`
  — copies of the six existing sheets, byte-identical to sources.
- `beta-testers/sweep_phase5.js`, `beta-testers/sweep_phase5_depth4_check.js`,
  `beta-testers/sim_phase5.js`, `beta-testers/sim_phase5_candidates.js`,
  `beta-testers/verify_phase5.py` — new.
- `beta-testers/sim_ammo.js` — ENEMIES derived from shipped defs (§3).
- `LOOT-SKILLS-DESIGN.md` — dated gate-revision note appended to §8.5.2
  only; no other doc edits.
- Reports/logs: `beta-testers/reports/sweep_phase5.{json,txt}`,
  `sweep_phase5_depth4_check.txt`, `sim_phase5.{json,txt}`,
  `sim_phase5_stdout.log`, `sim_ammo_stdout.log`,
  `verify_phase5.log`, `sim_ammo_results.json` (regenerated),
  `REPORT.md` + `results.json` (harness), screenshots
  `phase5-render-*.png`, `phase5-sniper-telegraph.png`,
  `phase5-bomber-fuse.png`, `phase5-boss.png`.

No commits, pushes, merges, or publishing. No Phase 6 work. Ready for
the Phase 5 report + Phase 6 co-planning round.
