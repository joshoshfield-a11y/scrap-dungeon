# Phase 3 Report — Two Skill Systems

Date: 2026-10-29/30. Spec: `LOOT-SKILLS-DESIGN.md` §6 (§6.1–§6.5).
Build scope: Phase 3 ONLY. No Phase 4/5/6 work, no new art/sprites, no
git commits/pushes/merges/publishing (working tree only).

## What shipped

### System A — permanent pilot skills (hub store)

- `serializeHub` gains `skills: {id: rank}`, `pilotXp`, and
  `secondWindCooldown`. `ensureHub` defaults them (empty / 0 / 0) and
  sanitizes on load (unknown ids and out-of-range ranks dropped).
- 12 skills in 3 trees × 4 (`PILOT_SKILLS`, `PILOT_SKILL_TREES`):
  Combat (Steady Aim, Heavy Hands, Second Wind, Trigger Discipline),
  Scavenging (Salvage Sense, Breakdown, Deep Pockets, Codex Eye),
  Engineering (Field Repair, Ammo Smith, Overclock Tuning, Plating Know-how).
- Ranks bought with **banked salvage** at the hub only, never mid-run.
  Eligibility is gated by **Codex entries + pilot XP**; XP unlocks
  eligibility, salvage buys the rank. Max rank 3.
- Pilot XP: +2 per kill, +5 per data chip, +5 per new Codex entry,
  +10 per descend. Banked in full at descend/extract; **lost on death**
  (pending XP never banks).
- Respec: costs 25 salvage × total ranks held, clears all ranks
  (un-spending them), Codex and pilot XP untouched; rebuying re-charges.
  Costs no time (hub-only). Verified: 39 → 14 banked for 1 rank.
- Pilot skills are passive modifiers; they never cost energy/heat.
  Effects feed through the Phase 2 `state.derivedMods` seam into
  `derivedStats`: Steady Aim → accuracy, Heavy Hands → damage multiplier
  (via `weaponStats`), Plating Know-how → armor **only while armor gear
  is equipped** (unequip removes it). `refreshPilotMods` runs in
  `attachHub`, `equipCarried`, and `unequip`.
- Second Wind: once per run, a lethal hit leaves the pilot at 1 HP.
  Hub cooldown 3/2/1 runs by rank, ticking once per `newRun`. Hooked in
  `resolveAttack` (both branches), spike-trap death, and starvation
  death in `notePlayerAction`.
- Breakdown / Ammo Smith record their **Phase 4 unlocks only**. No
  dismantling, ammo recipes, ammo types, or new statuses were built.
- New 7th hub station **"The Instructor"** (PROPOSED name — see flags).
  Rendered entirely from the skill data tables (tree headers, rank pips,
  next-rank cost/gates, Buy buttons, Respec button when ranks are held)
  via the existing `stationBtn` failure-reason pattern. No hand-written
  per-skill UI.

### System B — per-run mech skills (run store only)

- `newRun` initializes `mechSkills: []`, `runSkillPoints: 0`,
  `energy: 100`, `heat: 0`, `overheated: false`, `mechEffects`,
  `pendingXp: 0`, `secondWindUsed: false`, `shotsFired: 0`.
  `serializeRun`/`deserializeRun` carry them with legacy defaults
  (energy 100, heat 0, empty mech state, unknown mech ids filtered).
- **Extract AND death drop them entirely.** Verified: nothing survives
  except banked salvage, Codex, and the wreck-on-death.
- Earning: 1 point per 3 kills, 1 per data chip, 2 per elite kill
  (elite branch dormant — see reconciliations).
- Six skills (`MECH_SKILLS`): Overclock, Evasive Protocols, Emergency
  Plating, Sensor Pulse, Salvage Burst, Vent Heat. Learning spends run
  points from the Bag and costs no time. **Using** a skill costs time +
  energy + heat. No new quickbar slots; a "Mech" section in the Bag
  modal + an active-effects line in the HUD.

### Executor + meters (§6.3)

- One executor path: `useMechSkill` validate → pay → execute → apply →
  events → HUD. Refusals (unknown, unlearned, overheated, insufficient
  energy) are checked before any mutation and cost no time/energy/heat.
- Energy pool 100, regenerates +10 per time unit; heat builds on use,
  dissipates −10 per time unit (`processScheduler`, while playing).
  Overheat latches at heat ≥ 100 and locks mech skills until heat drops
  below 50, with a log line on latch and on clear. `overheated` is the
  only new status.
- HUD meters line (`#hud-meters`, below `#hud`): Energy / Heat /
  OVERHEATED / active effects / skill points. It **collapses when
  energy is full, heat is 0, no effects are active, and the mech is not
  overheated** — the §14 #3 PROPOSED default (see flags).

### Effects wired

- Overclock: next 3 `fireWeapon` activations +25% damage (one activation
  = one call, all projectiles boosted, log line).
- Evasive Protocols +4 evasion / Emergency Plating +3 armor for 5 time
  units, via clock-bound `mechEffectActive` in `playerEvasion` /
  `derivedStats`.
- Salvage Burst doubles the next kill drop; Salvage Sense +2 salvage per
  kill per rank; Deep Pockets +25% wreck salvage value per rank;
  Codex Eye reveals an extra rumor per data chip; Field Repair +10 HP
  per rank; Overclock Tuning −10% energy cost per rank (min 1);
  Trigger Discipline: every Nth shot is free, N = 5 − rank (4/3/2),
  discount computed from the next shot number and committed only when
  a shot fires.
- Shield interaction unchanged from Phase 2: starvation drain bypasses
  the shield; shield still absorbs after armor before hull.

## Decisions (starting points / proposed defaults — all need his eye)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Rank costs [20, 40, 80] salvage | Doc leaves costs open; simple doubling ladder, rank 1 reachable after one decent extraction (~20 banked) |
| 2 | XP gates [0, 40, 120] | Doc leaves gates open; rank 1 immediately eligible, later ranks need sustained play |
| 3 | Codex gates: 0 for Steady Aim / Heavy Hands / Salvage Sense / Field Repair; 1 for Second Wind / Trigger Discipline / Breakdown / Deep Pockets / Ammo Smith; 2 for Codex Eye / Overclock Tuning / Plating Know-how | Doc names Codex gating but not per-skill counts; utility/knowledge skills gated higher |
| 4 | Respec 25 salvage × total ranks (cost; ranks cleared) | Doc §6.1 + MECHANICS-PLAN §5 state the rule; 25 = rank-1 cost + 5, cheap enough to experiment |
| 5 | XP awards: kill 2, data chip 5, new Codex 5, descend 10 | MECHANICS-PLAN §5 sources; numbers are the doc's own starting points |
| 6 | Trigger Discipline N = 5 − rank (free 4th/3rd/2nd shot) | Doc leaves N open; rank 3 = every other shot free is strong but costs 140 salvage + gates |
| 7 | Second Wind cooldown 3/2/1 runs by rank | Doc leaves cooldown open; one save per run is already strong, cooldown keeps death meaningful |
| 8 | Overclock 3 shots, +25% | Doc §6.2 table value; kept as written |
| 9 | Evasive / Plating windows 5 time units | Doc leaves duration open; 5 units ≈ one short engagement |
| 10 | Learn cost 2 points per mech skill | Doc leaves cost open; 4-point hunt (this verification) learns exactly 2 skills |
| 11 | Energy/heat costs per §6.2 table (Overclock 20/30, Evasive 20/15, Plating 20/15, Sensor Pulse 15/10, Salvage Burst 15/15, Vent Heat 10/0, all timeCost 1) | Doc table; kept as written |
| 12 | Hub station name "The Instructor" | PROPOSED — no name in the doc; rename is a one-string change |
| 13 | HUD meters collapse when idle | §14 #3 PROPOSED default (collapsing second line); unanswered by the user |
| 14 | 3 trees now, 4th deferred | §14 #5 PROPOSED default; unanswered by the user |
| 15 | Pilot XP banks in full at descend/extract, lost on death | Mirrors the salvage banking rule; doc says "banked like salvage" |

## Honest reconciliations (doc references a system that does not exist)

1. **Elite kills (2 points).** No elite enemy type exists; `foe.elite`
   is never set by generation. The earning branch exists and is tested
   at the unit level with a synthetic elite flag, but it can never fire
   in real play until Phase 5 adds elite enemies. No enemy type invented.
2. **Deep Pockets carried cap.** No carried-salvage cap exists, so the
   cap-raising half of the skill is dormant. Only the +25%/rank wreck
   value half is live.
3. **Sensor Pulse hidden hazards.** No hidden-hazard system exists
   beyond search/step reveal. Implemented as: reveals hidden hazards in
   the player's current room, falling back to radius 4 in corridors,
   plus a log line. No fake visual added.
4. **Energy weapons.** No energy-cost hook exists for weapons; the ammo
   pool is unchanged. Mech skills spend energy; weapons do not (yet).
   Flagged, not faked.

## Verification receipts

### Unit tests — 92/92 green, 3 consecutive runs

- Baseline 78/78 re-verified before changes. One existing Phase 2 test
  updated: `derivedStats` deep-equal expectation now includes the
  additive seam fields `acc: 14, dmgMult: 1` (all Phase 2 fields
  unchanged).
- 14 new Phase 3 tests: data tables; buy gates; respec; pilot
  persistence through scripted death + new expedition + hub round-trip /
  sanitization; mech wipe on death AND extract; executor refusals cost
  nothing; valid use costs time+energy+heat; overheat lock/cool/Vent
  Heat/regen; Second Wind save + once-per-run + cooldown ticks; Trigger
  Discipline free 4th shot + refusal accounting; pilot effects (aim,
  damage, plating gear-gating + unequip, repair, salvage sense, deep
  pockets, codex eye, tuning, Phase 4 unlock records); mech effects
  (overclock damage, evasive/plating windows, salvage burst, sensor
  pulse); earning + XP banking/loss; save/load round-trip + legacy
  defaults. `node test.js`: pass 92, fail 0. `node --check` clean on
  `core.js` and `game.js`.

### Browser verification — `beta-testers/verify_phase3.py`, 34/34, exit 0

- Real Playwright run (ML venv, fresh context): two full expeditions
  with real key presses and real clicks — Bag Mech section, Learn
  Overclock + Vent Heat, Use Overclock (energy 90, heat 20,
  overclockShots 3, log line), HUD meters line, overheat lock after
  repeated use, refusal at no time cost, 6 waits to cool below 50,
  Vent Heat clearing heat to 0, extract (banked 45), Instructor listing
  all 12 pilot skills, Buy Steady Aim rank 1 (20 banked, 45 → 25),
  scripted death, rank persistence, new expedition with wiped mech
  state, second extract (banked 25 → 39, EXTRACTED modal, 14 secured),
  Respec (39 → 14, exactly 25/rank). **Zero console errors.**
- Screenshots: `beta-testers/reports/screenshots/phase3-bag-mech.png`,
  `phase3-meters.png`, `phase3-instructor.png`.
- Harness hardening history (script-side, not game bugs): ranged
  kiting is the survivable pattern (bump-fighting whole floors kills
  the run); `walk_to` guards against walking onto live foes and aborts
  when cornered at low HP; modal handling hardened (`dismiss_modal`
  with verified close + retries, `extract_now` with a verify-and-retry
  loop and the game's stairs key '2' as fallback — a stuck-open Bag
  modal intercepts the stairs-panel click); overheat check asserts
  `overheated` + heat ≥ 80 (the triggering use's own dissipation
  leaves heat at 90 on read — game-correct latch behavior). The
  second-extract check was tightened mid-session after catching a
  vacuous pass (banked already ≥ 25 before the run); the final green
  run proves a real banked increase with the EXTRACTED modal.
- Green log: `beta-testers/p3run7.log` (attempt 1 of 6).

### Phase 2 regression — still green

- `verify_phase2.py`: first re-run failed on the RNG shield hunt
  ("shield found within 5 floors", run died on floor 4); re-run exit 0,
  failures []. Hunt retries are known script behavior, not a
  regression. `verify_phase1.py` NOT run (stale since Phase 2).

### Full harness — 338 PASS, 0 FAIL, 3 NOTE

- `bash beta-testers/run_all.sh` (log: `beta-testers/harness_p3.log`),
  exit 0. Baseline was 339 PASS, 0 FAIL, 2 NOTE. The one-check delta
  is a NOTE, not a failure: one completionist-persona BFS run died en
  route to the stairs ("did not reach the stairs menu", known harness
  artifact class, same as the Phase 1 report). The other NOTEs are
  pre-existing: unreferenced `prop_salvage_sheet.png` (dead weight),
  wall bumps giving no feedback. Zero FAILs.

## Open flags needing his eye

1. Proposed defaults #12–#14 above (Instructor name, collapsing HUD
   meters line, 3 trees) — awaiting his word per §14 #3/#5.
2. Rank tables #1–#11 — starting points, not tuned values; no
   playtest has weighed in yet.
3. Dormant reconciliations 1–4 — elite rule, Deep Pockets cap half,
   Sensor Pulse scope, energy weapons.
4. Carried over from Phase 2: depth-3 ranged share 0.39, brute tail
   p90 22, missing weapon/gear art, sim not extended with gear in the
   damage pipeline (§11.2 gap), "You misses X" grammar nit, Escape-modal
   nit. `verify_phase1.py` remains stale — do not run as a gate.
5. Tessarium 2.0 evaluation + reminder owed after Phase 6 (his words
   2026-10-28) — unchanged.

## Files changed

- `game/core.js` — skill tables, hub/run stores, executor, meters,
  effects, Second Wind hooks, `derivedMods` seam feed.
- `game/test.js` — 14 new tests, 1 updated Phase 2 expectation.
- `game/game.js`, `game/index.html`, `game/style.css` — meters line,
  Instructor station, Bag Mech section, help text.
- `beta-testers/verify_phase3.py` — new browser verification script.
- This report. No other phases touched; no commits, pushes, or
  publishing.
