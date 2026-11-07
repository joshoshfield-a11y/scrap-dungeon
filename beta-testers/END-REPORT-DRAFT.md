# Scrap Dungeon — End Report (DRAFT, for sign-off)

DRAFT. Nothing in this report has been pushed, merged, or published. The game is working tree only.

Phase 6 parent verification is PENDING (see the verification section below). Do not treat Phase 6 as verified until that verdict is filled in.

## 1. What Scrap Dungeon is

Scrap Dungeon is a Pixel Dungeon-style web dungeon crawler. Each run generates a new seeded floor of rooms and corridors, the player fights enemies in a time system where time only advances on player action, and the hub between runs handles banking, crafting, and upgrades. Banking keeps 25% of carried salvage on descend (upgradable to 40% and 55%), extracting keeps everything carried, and dying leaves one recoverable wreck holding the run's salvage and equipped gear.

## 2. What shipped, phase by phase

### Phase 1 — Loot tiers, upgrade levels, damage and dice

Twelve weapons with dice specs, five tiers (Common, Uncommon, Rare, Epic, Legendary) with color rings and damage multipliers, and upgrade levels capped by depth (depth 1 only allows +0/+1, and a Legendary can appear on depth 1 but only at +0). Damage is shown as a dice roll in the combat log. Kill drop rates are raider 12%, drone 10%, brute 30%, with one guaranteed cache in the first loot room per floor. Tuning from the sim gate: starting ammo 16, ammo crates worth 8, scrap blaster at 2d6+8. The combat drone weapon was slipped to Phase 4 as the spec allowed. Numbers as claimed in the Phase 1 report: node tests 68/68, sim gates all pass (depth-1 median shots to kill 3/3/6, sustainable ranged share 1.00 on depth 1 and 0.90 on depth 2, zero floors with zero item drops across 600 floors), full harness 339 pass, 0 fail, 2 notes.

### Phase 2 — Gear slots

Twelve gear definitions across three slots: armor (Scrap plating, Alloy vest, Ablative weave, Nano-lattice), shield (Scrapper's ward, Alloy aegis, Ablative barrier, Nano bastion, capacities 10/16/24/34), and utility (Scope, Sensor, Gyro-stabilizer, Power cell). Stats are derived on every read from base plus gear plus chassis tier, and nothing derived is stored. Pickups are stowed into carried gear and swapped in the Bag at no time cost, with the old piece returned to the list and nothing destroyed. Shields absorb damage after armor and before hull, recharge 1 per 2 time units, start empty when newly equipped, and are bypassed by power-starvation drain. Gear is run-scoped: it rides only the wreck, never the hub. Numbers as claimed in the Phase 2 report: node tests 78/78, sim gates still green, full harness 339 pass, 0 fail, 2 notes. The Phase 1 browser script is stale under this model and is superseded by the Phase 2 script; it is not a gate.

### Phase 3 — Two skill systems

System A is permanent pilot skills: 12 skills in 3 trees (Combat, Scavenging, Engineering), up to rank 3, bought at the hub with banked salvage and gated by Codex entries and pilot XP. Pilot XP is banked in full on descend or extract and lost on death. Second Wind saves the pilot at 1 HP once per run, with a hub cooldown of 3/2/1 runs by rank. System B is per-run mech skills: 6 skills (Overclock, Evasive Protocols, Emergency Plating, Sensor Pulse, Salvage Burst, Vent Heat) learned with run skill points and spent with energy and heat meters; everything in System B is wiped on death and on extract. A new seventh hub station, "The Instructor", sells the pilot skills. Breakdown and Ammo Smith in this phase record their Phase 4 unlocks only; no dismantling or ammo recipes were built here. Numbers as claimed in the Phase 3 report: node tests 92/92, browser verification 34/34, full harness 338 pass, 0 fail, 3 notes (the one-check change from baseline is a completionist harness artifact, not a failure). Rank costs [20, 40, 80], XP gates [0, 40, 120], and the per-skill Codex gates were starting-point decisions recorded in the report, not tuned values.

### Phase 4 — Ammo crafting 2.0

Breakdown at the hub Salvager (gated on Breakdown rank 1) turns components and surplus gear into materials with fixed yields at every rank (component: 3 wire + 1 core; Common 2 wire, Uncommon 4 + 1 core, Rare 6 + 2, Epic 10 + 3, Legendary 16 + 5). Exactly four materials exist: wire, coreThermal, coreShock, coreCorrosive, each core an independent uniform 1/3 roll. Four separate ammo pools replace the single pool: Standard (8 salvage for 6, no gate), Piercing (6 wire + 4 salvage for 6, Ammo Smith rank 1, ignores half target armor rounded down), Incendiary (2 thermal cores + 4 wire for 6, rank 2, adds burning), Shock (2 shock cores + 4 wire for 6, rank 3, adds jam). A Loadout station lets the player choose the starting 16 rounds (at most 12 per type). Switching uses T / Shift+T and keys 1–4; Q stays diagonal northwest. Enemies gain Burning (3 HP per time unit, 3 ticks, resistance-rounded) and Jammed (skips exactly one activation) statuses. Enhance upgrades any gear slot to a +5 ceiling at 4 times target level in wire plus 1 matching core for elemental gear, never changing tier, affixes, or dice. Numbers as claimed in the Phase 4 report: node tests 111/111, browser verification 20 pass / 0 fail, jam resistance over 1,000 attempts per type within 5 points of expected (Drone 49.7%, Raider 0.0%, Brute 25.0%), balance sim gates pass with no universal ammo dominance, full harness 338 pass, 0 fail, 3 notes.

### Phase 5 — Biome enemy rosters

Six new enemy types join the raider, drone, and brute: turret_light, flyer, shielder, sniper, bomber, and boss. Rosters shift by theme with a donor-pool weight-shift formula: Molten at depth 7, Frozen at 8, Toxic at 9, Neon at 10, cycling after that. The boss appears only at depth 5 or deeper, only in the first security-purpose room, at most one per floor, with no fallback if no valid cell exists, and drops exactly one Epic-or-Legendary item plus one Codex entry on first defeat, with once-only half-HP drone spawns. Hazards are spike-only. The shielder has a cardinal facing and a 90-degree frontal arc with its own damage formula; the sniper aims with a fixed-tile telegraph before firing; the bomber arms a Manhattan-1 fuse and detonates with one shared damage roll; the turret is stationary with a next-shot time and no cooldown spent without a target. Distances use Chebyshev except the bomber fuse. Two gate revisions were authorized and recorded in the design doc: flyer evasion 20 to 16, shielder HP 24 to 20, because the spec bands were written under a percentage reading of accuracy/evasion while the shipped code uses roll-range mechanics. Numbers as claimed in the Phase 5 report: node tests 143/143, browser verification 31/31, balance sim gate pass at introduction depths with boss ordering holding at every depth 5–15, 3,000-floor sweep with determinism replay identical and all validations zero except a depth-4 share-band excursion independently replicated as sampling noise, full harness 351 pass, 0 fail, 2 notes.

### Phase 6 — Doors, visibility, locked rooms, tile coherence

Doors sit only at thresholds between a room floor and a corridor, one door per entrance, with plain-JSON door records (id, position, room, entrance, state, lock level, key id, HP). A closed door opens on bump for exactly 1 time unit with the player staying put, and a separate move enters; opening wakes sleeping enemies within Chebyshev 8 with door-aware line of sight. Locked doors use flat HP 20/40/60 for levels 1–3 with equal level weights, a matching key pickup in a different room that is never behind its own or an unresolved lock, brute force with one roll of the current equipped weapon's dice for 1 time unit even on a zero roll, and a Bypass stub that refuses with exact spec text at zero time, RNG, and noise cost (no lockpick skill exists among the Phase 3 pilot skills, so none was invented). Locked rooms are leaf branches only, selected from already-generated rooms with no extra rooms and no change to the 6–10 room count, in three equal kinds: loot vault, new area, and objective room. Fog of war is room-granular: the current room renders at full brightness, explored but unoccupied rooms dim to 45%, unexplored rooms render black, and the scheduler keeps ticking for unseen enemies. The extended coherence check (the §10 twelve-check list) now runs inside generation with up to 8 deterministic regeneration attempts, and no floor that fails a mandatory invariant is shipped. Builder claims only (see verification section): node tests 158/158, browser verification run 5 at 34 pass / 0 fail, 3,000-floor sweep with 0 failures in every category and determinism replay identical, 47,047 doors across the sweep (about 15.7 per floor), 2,774 locked rooms with exactly 2,774 keys, lock levels and locked kinds near equal thirds at every depth, boss present on 503 floors, and 61 natural locked-first-security-room floors with no boss.

## 3. Verification status

Phases 1–5 are parent-verified, with the counts recorded in their phase reports: Phase 1 node 68/68 and harness 339/0/2; Phase 2 node 78/78 and harness 339/0/2; Phase 3 node 92/92, browser 34/34, and harness 338/0/3; Phase 4 node 111/111, browser 20/20, and harness 338/0/3 as reported; Phase 5 node 143/143, browser 31/31, and harness 351/0/2 as reported.

Phase 6 parent verification: PENDING. The numbers in the Phase 6 section above are builder claims only, not parent-verified results. A separate verification agent is running; its verdict does not exist yet and has not been filled in here. The builder's own report also left its regressions and harness section pending at report-draft time, so no Phase 6 regression or harness claim is made in this draft.

Decisions settled along the way and recorded in the design doc: §14 item 4, per-type ammo pools (§7.6.3); §14 item 6, spike-only theme hazards (§8.5.5); §14 item 7, the boss spawn rule (§8.5.4); §14 item 8, room-granular fog (§9.7.6); §14 item 9, Phase 6 settled without ChatGPT under §9.7 at the user's word.

## 4. Carried flags and open decisions

- Incendiary near-dominance: economy-gated today (Ammo Smith rank 2 plus thermal cores); re-check dominance if crafting costs change.
- Enhance is hub-edit and run-local with a plain UI warning, and there is no hub gear stash; whether enhanced gear should survive into a fresh expedition is a design call still owed.
- Missing weapon and gear art: drops still use the tier ring plus letter marker fallback.
- The balance sim is not extended with gear in the damage pipeline.
- "You misses X" grammar nit in the shared combat log, pre-existing, untouched.
- Escape-modal nit: Escape closes only the stairs modal, not the Bag modal.
- Player spike damage is once-ever per hazard while enemy spike damage is per-entry; this divergence is deliberate in the code and a future unification decision, not a bug.
- Void does not block line of sight and diagonals cut corners; this is shipped Phase 5 behavior that the sniper telegraph and turret sight inherit.
- Phase 6 builder decision: at most 1 locked room per floor, drawn from eligible leaves when more than one qualifies.
- Gold key sprite also appears as a variant in the industrial-debris dressing cycle, so gold keys render as debris in ordinary rooms and are visually ambiguous with real key pickups; pre-existing, flagged only, not fixed.
- Doorless rooms drive generation retries (701 of 3,000 floors in the Phase 6 sweep); this is the spec mechanism under §9.7, not a bug, when a room's only connection is an alongside corridor whose opposite neighbor is a wall.

## 5. Tessarium 2.0 reminder

REMINDER (not a decision): on 2026-10-28 the user said to evaluate Tessarium 2.0 after Phase 6 for tile builds, and to adopt it only if it proves the quality of the builds. That evaluation is now owed. It is recorded in the design doc as §14 item 10, deferred per the user's word.
