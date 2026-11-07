# SCRAP DUNGEON — Loot Tiers, Skills, Biome Rosters, Doors & Visibility

**Status: APPROVED 2026-10-28 ~07:27 PDT (user's word, widget tap). Phase 1 DONE
2026-10-28 — report at `beta-testers/PHASE1-REPORT.md` (68/68 node tests, sim
gates green, harness 339 PASS / 0 FAIL; combat drone slipped to Phase 4).
Phase 2 DONE 2026-10-28 — report at `beta-testers/PHASE2-REPORT.md` (78/78 node
tests, verify_phase2.py 3 consecutive clean runs, harness 339 PASS / 0 FAIL).
Phases 3–6 remain draft until approved. §10 AMENDED 2026-10-28
(user's word, "yeah let's do it") per the ChatGPT co-planning rounds + grounding
doc; the amendment is a doc change for review, not a build order. No phase beyond Phase 1 is
built until the user approves it or says go.**
Written 2026-10-28 from the user's brief (2026-10-28 07:01 + 07:03 PDT, skill-model correction;
doors/visibility brief 2026-10-28 07:12 PDT) and grounded in the code as it stands
(`game/core.js`, `game/game.js`, `game/index.html`, `MECHANICS.md`, `MECHANICS-PLAN.md`,
`CONTENT.md`, `MAPS.md`, `DESIGN.md`). Where this doc and `MECHANICS.md` disagree,
`MECHANICS.md` wins on data-model rules and `DESIGN.md` wins on game identity, per their
own precedence notes. All numbers are **playtest starting points, not agreed balance** —
every phase carries a simulation or measurement gate before its numbers are called done.

Labels used throughout: **DECIDED** = the user's own words. **PROPOSED** = a default
for the user to confirm or change. **GROUNDED** = verified in the code on 2026-10-28.

## 1. Pitch

Scrap Dungeon is already a Pixel-Dungeon-style mech crawler: descend, fight, salvage,
bank, die, keep the Codex. This design adds the reason to keep descending: **every run
drops different gear, readable at a glance by color and upgrade marks, on top of two
separate skill systems — one that survives death and one that dies with the mech — and
floors whose enemies, doors, and darkness behave like the biome they belong to.**

## 2. Pillars

1. **Randomized, but balanced.** Drops are weighted tables with depth caps and a
   floor guarantee, never pure luck and never a fixed shopping list. A Legendary can
   appear on depth 1 (DECIDED) — but only at a low upgrade level, so it never breaks
   the early game.
2. **Rarity you can read at a glance.** Tier color shows in the pickup ring, the Bag,
   and the log tag. No inspecting a tooltip to know whether a drop matters.
3. **Death costs the mech, never the pilot.** The permanent skill system persists
   across runs after permadeath; the per-run mech skill system resets on death
   (DECIDED, corrected 2026-10-28 07:03 PDT — the two systems are separate and are
   never merged into one).
4. **The dungeon hides things on purpose.** Rooms stay black until entered, doors
   are real thresholds, and locked doors are decisions (key, muscle, or skill),
   not decoration.
5. **Coherence over confetti.** Variant art follows placement logic (per-room,
   per-wall-run, clustered dressing), so floors read as places, not noise.

## 3. What is already true — do not rebuild

- **Damage already rolls per shot (GROUNDED).** `rollDamage` (`core.js:897`) =
  `dmg + floor(rng() * (dmgVar + 1))`. Blaster 10–14, melee 14–20, armor subtracted
  after, min 1 (`resolveAttack`, `core.js:904`). The dice-roll system the user asked
  for exists as flat+var; Phase 1 changes its *expression* to dice notation and
  raises weapon damage, it does not invent rolling.
- **Maps are already freshly randomized every run (GROUNDED).** `generateFloor(runSeed,
  depth)` seeds `runSeed XOR depth`; 6–10 rooms, spanning-tree corridors + 1–2 loops,
  stairs in the farthest room, coherence checks (`coherenceCheck`, `core.js:526`).
- **Economy spine exists (GROUNDED).** Banking tiers 25/40/55% (`BANKING_TIERS`),
  one recoverable wreck, Codex entries that survive death, hub stations (Mechanic /
  Salvager / Researcher / Armorer / Scout / Radio Operator) rendering from data
  (`showHubScreen`, `game.js:533`), data-driven `RECIPES` + `craft()` with honest
  failure reasons (`core.js:615,768`), Salvager exchange rates, chassis tiers +10 HP.
- **Save discipline exists (GROUNDED).** Two versioned keys,
  `scrapdungeon.hub.v1` / `scrapdungeon.run.v1`; `serializeHub`/`serializeRun` are
  plain-JSON copies; `ensureHub`/`deserializeRun` default every missing field, so
  old saves tolerate new fields with no key bump (verified pattern from the ammo
  slice, 2026-10-28). `state.banked` is never trusted over the hub's.
- **Combat + time model exists (GROUNDED).** PD scheduler (`processScheduler`),
  acc/evasion rolls, surprise 1.5×, `fireWeapon` reusing the same rolls, refusals
  free, thinking free. Enemy scaling: HP ×(1 + 0.1×(depth−1)), dmg +floor((depth−1)/2).
- **Balance method exists (GROUNDED).** `beta-testers/sim_ammo.js` (Monte Carlo,
  20k kill trials, real generator) + chart; it stays the gate for every phase's
  numbers. No phase's numbers ship without a sim re-run.
- **Enemy art for Phases 1–5 exists (GROUNDED).** `sprites/enemies/` holds
  turret_light, flyer, shielder, sniper, bomber sheets (+ .glb/.pxl);
  `sprites/mechs/mech_boss_sheet.png` (+ walk anims) holds the boss. They need
  wiring into `game/assets/` + `SHEETS`, not new art.
- **Weapon/gear art does NOT exist (GROUNDED).** No weapon, armor, shield, or
  utility sprite files in `game/assets/` or `sprites/`. Per the standing sprite
  rule, Phase 1/2 pickup art is generated from templates first, never coded
  primitives. Until that art lands, drops render with the existing fallback
  pattern (tier-colored ring + letter marker, as `game.js:1209` does today).
- **Doors today are decoration (GROUNDED).** Every corridor cell touching a room
  rect becomes a `'door'` tile (`core.js:158`) — including long corridor stretches
  running alongside rooms, which is why doors appear in weird spots (e.g. four in
  a row). Doors are walkable, always open, sight-transparent (`lineOfSight` blocks
  only `'wall'`), and there is no fog of war: the render loop draws the whole floor
  and every enemy. `enemyVisible` gates only walk-to stopping, not rendering.

## 4. Phase 1 — Loot tiers, upgrade levels, damage & dice

### 4.1 Data model: definitions vs instances

Follow the `MECHANICS.md` data-driven rule: **definitions are data, instances carry
state, derived stats are recomputed, never stored.**

- `WEAPON_DEFS` / `GEAR_DEFS` tables in `core.js` (same shape as `ENEMY_TYPES` /
  `RECIPES`): id, name, pattern, dice, range, time cost, ammo type/cost, element,
  depth band, base stats, allowed tiers.
- An **instance** is plain JSON on a pickup or in equipment:
  `{ kind: 'item', defId, tier, upgrade, ... }`. Plain JSON keeps
  `serializeRun` working with no format change, the way `wideDressing` records do.
- `state.weapon` (today a string, `'scrapBlaster'`) becomes an instance
  `{ defId, tier, upgrade }`; `fireWeapon`/`resolveAttack` read derived stats from
  a `weaponStats(state)` helper. `deserializeRun` maps a legacy string weapon to a
  Common +0 instance of the same def.

### 4.2 Tiers (DECIDED: white → gold/orange; PROPOSED names/weights)

| Tier | Color (PROPOSED) | Stat mult (PROPOSED) | Special |
|---|---|---|---|
| Common | white `#c8c8c8` | ×1.00 | — |
| Uncommon | green `#35e05c` | ×1.10 | — |
| Rare | blue `#4aa8ff` | ×1.22 | 1 property slot |
| Epic | purple `#b46ae0` | ×1.35 | 2 property slots |
| Legendary | gold/orange `#ffb020` | ×1.50 | 2 slots + named flair |

Properties (PROPOSED pool, data-driven): +crit window, +range, lifesteal-on-kill,
salvage bonus, +evasion while equipped. Properties are what make a Rare+ drop
interesting beyond its multiplier; the pool stays small (5) in this phase.

Tier shows in three places: the pickup ring color (extends the existing ring
system at `game.js:1209`, which already colors health/dataChip/ammo rings),
the Bag row (inline tier color), and the log (`[Rare] Plasma rifle +12`).

### 4.3 Upgrade levels (DECIDED: depth-capped; Legendary possible at +0 on depth 1)

Upgrade +0…+5. Each +1: **+12% damage** (PROPOSED, rounded), gear stats scale
per type in Phase 2. Upgrade is rolled at drop time from a depth table
(PROPOSED starting weights):

| Depth | +0 | +1 | +2 | +3 | +4 | +5 |
|---|---|---|---|---|---|---|
| 1 | 80% | 20% | — | — | — | — |
| 2 | 55% | 35% | 10% | — | — | — |
| 3 | 40% | 35% | 20% | 5% | — | — |
| 4–5 | 30% | 30% | 25% | 12% | 3% | — |
| 6+ | 22% | 28% | 25% | 15% | 8% | 2% |

Rarity weights by depth (PROPOSED): depth 1 — Common 62 / Uncommon 25 / Rare 10 /
Epic 2.5 / Legendary 0.5; Legendary weight rises slowly with depth, never above
~3%. A depth-1 Legendary is therefore real but rare, and always +0 (or +1 at the
20% depth-1 upgrade roll — never higher).

### 4.4 Drop sources & the balance guarantee

- **Enemy kills:** drop chance by type (PROPOSED): raider 12%, drone 10%, brute
  30%, elites 40%+, boss 100%. Kill drops merge into the existing `killEnemy`
  salvage-drop behavior (walk-over to collect, `core.js:1138`); an item drop
  replaces the salvage pile's *visual* only when it lands on the same cell — both
  are collected on step.
- **Loot rooms:** today's fixed set (salvage ×2–3, health, food, component, ammo,
  dataChip) gains **one cache pickup per floor** placed in a loot room, tier
  rolled from the depth table. The cache is the guarantee: **no floor has zero
  item drops.** (PROPOSED — this is the "balanced" half of randomized-but-balanced.)
- **Structure rooms:** cache chance 50% (PROPOSED), weighted toward gear in
  Phase 2.
- **Wrecks:** a recovered player wreck returns carried items as today; equipped
  gear joins the wreck in Phase 2 (see §5.3).

### 4.5 Damage: raise it, show the dice (DECIDED)

Weapon defs carry dice specs `{ num, sides, plus }` instead of flat `dmg/dmgVar`
for *weapons only*; melee keeps flat+var until Phase 3 (smaller blast radius).
`rollDamage` gains a dice branch; the log shows the roll:
`You hit Drone for 15 (2d6+6: 4+5+6, armor −0)`. **PROPOSED starting numbers**
(the sim gate decides whether they stand):

| Weapon | Pattern | Dice | Range | Time | Ammo |
|---|---|---|---|---|---|
| Scrap blaster (starter) | standard shot | 2d6+8 (10–20) | 5 | 1 | 1 standard |
| Plasma rifle | standard, +acc | 2d6+8 (10–20) | 6 | 1 | 1 standard |
| Rail gun | long range, pierces armor | 3d8+6 (9–30) | 8 | 2 | 2 piercing |
| Gatling | 3-shot burst | 3×(1d6+3) | 4 | 1 | 3 standard |
| Flamethrower | 3-cell cone + burning | 2d4+4 (6–12) + burn | 3 cone | 1 | 2 incendiary |
| Grenade launcher | AoE splash, around corners | 2d8+4 splash | 5 | 2 | 2 explosive* |
| Homing missile | tracks, ignores evasion bonus | 3d6+8 (11–26) | 7 | 3 | 2 standard |
| Missile pod | 4-shot spread | 4×(1d6+2) | 5 | 2 | 4 standard |
| Shoulder rocket | single heavy | 4d6+10 (14–34) | 7 | 3 | 3 explosive* |
| Laser emitter | precise beam, line | 2d10+4 (6–24) | 8 | 1 | 1 energy* |
| Energy sword | melee, no ammo | 3d6+5 (8–23) | 1 | 1 | 0 |
| Combat drone | deployable helper | — | — | 2 deploy | 1 cell* |

`*` Explosive/energy ammo types and the combat drone are the most complex rows:
explosive + energy ammo arrive in Phase 4; the drone is a deployable actor and is
the last row built in this phase, with its own acceptance test. If the drone
slips, it slips to Phase 4 — it never holds the other eleven.

**Sim gate (DECIDED method):** extend `sim_ammo.js` to the new dice + tables and
re-run before calling Phase 1 done. Targets (PROPOSED): depth-1 ranged median
shots-to-kill ≤3 drone, ≤4 raider, ≤8 brute; ammo demand per floor stays within
the modeled supply (16 start + crates + Armorer faucet) at a ≥0.7 sustainable
ranged share on depths 1–2. If the sim says otherwise, the numbers move, not the
gate.

*Tuning record, Phase 1 build 2026-10-28:* the proposed numbers failed the
gate on first run (depth-2 ranged share 0.33). Moved per the gate procedure:
starting ammo 12 → 16, crate value 6 → 8, blaster 2d6+6 → 2d6+8. Final:
STK 3/3/6 (blaster), ranged share d1 1.00 / d2 0.90. Faucet and hub take
cap unchanged. Full record in `beta-testers/PHASE1-REPORT.md`.

### 4.6 Phase 1 acceptance

- [ ] 200-floor generation sweep: tier/upgrade distributions within ±20% of the
  tables; Legendary present on depth 1 at >0 and <2%; every floor has ≥1 item drop.
- [ ] Sim re-run with chart; targets met or numbers re-tuned and re-run.
- [ ] Save/load round-trip incl. an equipped tiered weapon; legacy saves load with
  a Common +0 blaster; old pickup kinds render unchanged.
- [ ] Browser verify: real pickup, real shot, log shows dice; zero console errors;
  full harness green.

## 5. Phase 2 — Gear slots

### 5.1 Slots (DECIDED shape from CONTENT.md; chassis swaps are NOT this phase)

Equipped set: `state.equipment = { weapon, armor, shield, utility }`. Chassis
remains the existing tier system (+10 max HP/tier, Mechanic); chassis *swaps*
(tank/assault/artillery/spider) are deferred past Phase 6 — the doc records them
as future, not forgotten.

- **Armor module:** +armor, +max HP. PROPOSED defs: Scrap plating, Alloy vest,
  Ablative weave, Nano-lattice (tiers scale the bonus).
- **Shield module:** an absorb pool that recharges per time unit (per
  `CONTENT.md`); PROPOSED: capacity 10/16/24/34 by tier class, recharge 1 per 2
  time units, damage hits shield before hull.
- **Utility module:** PROPOSED defs: Scope (+1 range), Sensor (+2 sight),
  Gyro-stabilizer (+evasion), Power cell (power drain slower). One utility slot
  forces a real choice.
- Gear uses the same tier + upgrade system as weapons (§4.2–4.3), same drop
  sources (§4.4), same ring/Bag/log presentation.

### 5.2 Derived stats

A `derivedStats(state)` helper recomputes armor, max HP, evasion, range, sight
from base + chassis tier + equipped gear + (Phase 3) skills, on equip/unequip,
load, and death. Nothing derived is stored — the `MECHANICS.md` rule that bit
the ammo slice (stockpile vs run counts) applies here with full force.

### 5.3 Wrecks, Bag, and the quickbar

- Wreck records gain `gear` (the equipped set at death); recovery returns it.
  If a wreck is destroyed unrecovered, its gear is lost with it — the same
  one-wreck rule as today, no exceptions.
- The Bag modal gains an equipment section: 4 rows, Equip/Swap actions, tier
  colors. Swapping via the Bag costs no time (thinking is free); swapping is
  Bag-only, never mid-step, so it can't become a free action in combat.
- The quickbar is unchanged (FIRE/+HP/FOOD/KIT, 4 fixed slots in `index.html`).
  FIRE fires the equipped weapon with its own dice/ammo; the FIRE label stays
  generic so it never lies about which weapon is equipped — the Bag and the log
  name the weapon.

### 5.4 Phase 2 acceptance

Same gates as Phase 1, plus: equip/unequip round-trip through save/load; wreck
with gear recovered intact; shield absorbs before hull in a scripted combat
check; full harness green.

**DONE 2026-10-28** — all four gates green; report at
`beta-testers/PHASE2-REPORT.md` (78/78 node tests incl. save/load round-trip,
wreck-with-gear recovery, and the scripted shield combat check; verify_phase2.py
3 consecutive clean runs; full harness 339 PASS / 0 FAIL).


## 6. Phase 3 — Skills, two separate systems

**DECIDED (user's correction, 2026-10-28 07:03 PDT):** a permanent skill system
that persists across runs after permadeath, AND a separate per-run mech skill
system that resets after death. Two systems, two stores, two currencies. The
earlier garbled phrasing ("permanent run mech skill system") is superseded and
must not reappear in code, UI, or docs.

### 6.1 System A — Permanent pilot skills (survive death)

- **Store:** the hub/profile. `serializeHub` gains `skills: { id: rank }` and
  `pilotXp`; `ensureHub` defaults both empty/0. Buying spends **banked salvage**,
  gated by **Codex entries** — the existing hub-growth rule (Researcher/banking
  tiers already work this way), never by run state.
- **Earning:** pilot XP from combat, exploration, and discoveries
  (`MECHANICS-PLAN.md` §5), banked at extract/descend like salvage. XP is a
  profile total; spending XP is not a thing — ranks are bought with salvage, XP
  unlocks *eligibility* for higher ranks. (PROPOSED split; keeps the two
  economies from collapsing into one number.)
- **Respecs:** cost banked salvage, never punish experimenting
  (`MECHANICS-PLAN.md` §5). PROPOSED: respec cost = 25 salvage × total ranks
  refunded, no Codex loss.
- **Trees (PROPOSED scope):** Phase 3 ships three trees — Combat, Scavenging,
  Engineering — 4 skills each, 3 ranks each. The other four trees from the
  `MECHANICS-PLAN.md` §5 draft (Piloting, Survival, Recon, Hacking) are
  **deferred, not cut**: Piloting/Hacking are explicitly gated to later content
  in the plan, and Recon/Survival fold into Phase 6 visibility work. Starting
  list (one line each; effects are starting points):
  - Combat: *Steady Aim* (+1 acc/rank), *Heavy Hands* (+10% weapon dmg/rank),
    *Second Wind* (once per run: survive a lethal hit at 1 HP; rank reduces
    cooldown across runs), *Trigger Discipline* (−1 ammo cost every Nth shot).
  - Scavenging: *Salvage Sense* (+salvage from kills/rank), *Breakdown* (unlocks
    Phase 4 dismantling at rank 1; better yields/rank), *Deep Pockets* (+carried
    cap — only meaningful if a cap is added; otherwise +wreck recovery value),
    *Codex Eye* (data chips reveal an extra rumor/clue).
  - Engineering: *Field Repair* (repair kits +10 HP/rank), *Ammo Smith* (unlocks
    Phase 4 ammo recipes, one type per rank), *Overclock Tuning* (mech skills
    cost less energy/rank), *Plating Know-how* (+armor from gear/rank).
- **UI:** a new hub station, "The Instructor" (PROPOSED name — the hub's seventh
  station; the six existing stations keep their names/roles). Pilot skills are
  bought and respecced only at the hub, never mid-run.

### 6.2 System B — Per-run mech skills (die with the mech)

- **Store:** run state only. `newRun` initializes `mechSkills: []` and
  `runSkillPoints: 0`; `serializeRun` carries them; `extract` and death drop
  them entirely — nothing about the mech survives except banked salvage, Codex,
  and the wreck. **Explicit rule: extracting does NOT preserve mech skills.**
- **Earning:** run skill points from kills and Codex finds during the run
  (PROPOSED: 1 point per 3 kills, 1 per data chip, 2 per elite kill). Points are
  spent mid-run from the Bag/skills panel; spending costs no time (thinking is
  free), using a skill costs time + energy (below).
- **Mech skill pool (PROPOSED, 6 to start):** *Overclock* (next 3 shots +25%
  dmg, heat cost), *Evasive Protocols* (+4 evasion for 5 time units),
  *Emergency Plating* (temp +3 armor, 5 time units), *Sensor Pulse* (reveal the
  current room fully, including hidden hazards), *Salvage Burst* (next kill
  drops double salvage), *Vent Heat* (clear all heat, 1 time unit). All are
  one-line effects with a single executor path (§6.3).
- **UI:** a "Mech" section in the Bag modal + a small active-effects line in the
  HUD (see §6.4 for the HUD-space problem). No new quickbar slots: mech skills
  are used from the Bag/skills panel, like items.

### 6.3 One skill executor, energy + heat (new meters)

Per `MECHANICS.md`: one executor — validate → pay costs → execute → apply →
events → HUD update. **Costs are time units + energy + heat**, matching the
plan's "energy cost + heat generation" shape. This phase introduces two meters
that do not exist today:

- **Energy:** pool (PROPOSED 100), spent by mech skills and energy weapons,
  regenerates per time unit. **Heat:** builds on skill/weapon use, dissipates per
  time unit; overheating (PROPOSED ≥100) locks mech skills until cooled below 50
  and applies the `overheated` status from `MECHANICS.md`.
- Both meters live on run state (`state.energy`, `state.heat`), reset per run,
  saved in `serializeRun`, defaulted in `deserializeRun`. Pilot skills never
  cost energy/heat — they are passive modifiers, which is what keeps the two
  systems conceptually clean.

### 6.4 HUD space — a real constraint, decided here

The HUD is one line at 390px and already fits exactly after the 2026-10-28
tap-target work. Two new meters do not fit as new segments. **PROPOSED:**
energy/heat show as a compact second HUD line only when either is non-full, in
the same monospace style, collapsing to nothing at full — or, if the user
prefers, inside the Bag only. This is Open Decision #3; the meters' *logic*
ships regardless, the *placement* follows his pick.

### 6.5 Phase 3 acceptance

- Pilot skills persist through a scripted death → new expedition (ranks intact,
  salvage spent stays spent); mech skills do not (points/skills gone, verified
  in state after death and after extract).
- Executor: invalid skill, unaffordable skill, and overheated skill all refuse
  honestly with reasons, costing no time; valid use costs time + energy + heat.
- Respec refunds ranks and re-charges the salvage cost; Codex untouched.
- Full harness green; hub station renders from the skill data table (no
  hand-written per-skill UI).

## 7. Phase 4 — Ammo crafting 2.0: breakdown, materials, elements, skill gates

This phase replaces nothing from the ammo slice (16 start, +8 crates, Armorer
`ammoPack` for 8 salvage). It adds the system the user described: **break
components down, build different ammo types with different components and
elements, unlockable through skill acquisition.**

### 7.1 Breakdown (dismantling)

- New Salvager action: **Break down** 1 component → materials (PROPOSED:
  3 wire + 1 element core of a random element, weighted by depth theme).
  Surplus gear (Phase 1/2 instances) breaks down into materials by tier
  (PROPOSED: Common 2 wire, Uncommon 4 wire + 1 core, Rare 6 wire + 2 cores,
  Epic 10 wire + 3 cores, Legendary 16 wire + 5 cores). Breakdown is the
  `MECHANICS.md` "dismantling returns materials" path, finally wired.
- **Materials (PROPOSED short list — kill list cuts the rest):** `wire`
  (from components/gear), `coreThermal`, `coreShock`, `coreCorrosive`.
  Banked salvage remains the generic currency; materials are the element
  currency. Four materials total, no more in this phase.

### 7.2 Ammo types & elements

Ammo becomes per-type pools: hub stockpile gains `ammoStandard`, `ammoPiercing`,
`ammoIncendiary`, `ammoShock`; run state mirrors them; the HUD shows the
**selected** type + count. FIRE uses the selected type; switching type is
Bag/quickbar-adjacent, costs no time. (Open Decision #4: per-type pools vs one
pool + type-as-mod — per-type pools are the PROPOSED default because crafting
produces typed outputs.)

| Ammo | Element / effect | Recipe (PROPOSED) | Gate (PROPOSED) |
|---|---|---|---|
| Standard | kinetic, no effect | today's `ammoPack` (8 salvage → 6) | none (always) |
| Piercing | kinetic, ignores half armor | 6 wire + 4 salvage → 6 | Ammo Smith rank 1 |
| Incendiary | thermal, applies `burning` (dmg per time unit) | 2 coreThermal + 4 wire → 6 | Ammo Smith rank 2 |
| Shock | EMP, applies `jammed` (enemy skips next action) | 2 coreShock + 4 wire → 6 | Ammo Smith rank 3 |
| Corrosive | corrosive, −armor over time | deferred | — |
| Explosive | AoE splash ammo for launcher/rocket | deferred to the weapons' own balance pass | — |

Recipes extend the existing `RECIPES` shape with a `requires` field
(`{ skill, codex }`); `craft()` already validates ingredients before consuming
them, so the gate check slots into the same honest-failure path. The Armorer
station renders new recipes automatically, as it does today.

### 7.3 Statuses, shared manager

`MECHANICS.md` already names the statuses (`burning`, `shocked`, `corroded`,
`overheated`, `staggered`, `jammed`, `marked`). Phase 4 ships a **shared status
manager**: enemies gain `statuses: []` + per-type resistances in their
`ENEMY_TYPES` extension; burning ticks damage per time unit through the
scheduler; jammed skips the enemy's next activation. **Player statuses are
deferred** (kill list) — enemies only, this phase. Statuses show as a letter
under the enemy HP bar (the same label row the game already draws).

### 7.4 Player-driven upgrades (enhance)

The Armorer gains **Enhance**: raise one instance's upgrade +1 for materials
(PROPOSED: cost = 4 wire × (target level) + 1 core of the item's element if
any; cap +5, same as drops). This is the player-driven counterpart to drop
upgrade levels — drops give you the level, enhancing lets you finish a favorite
item. Enhance never exceeds the drop cap and never changes tier.

### 7.5 Phase 4 acceptance

- Breakdown yields measured over 200 conversions, within ±15% of the table.
- Each ammo type craftable only after its gate, refused honestly before it;
  crafted ammo lands in the right pool, loads into the next run up to the
  starting-load cap, and fires with its effect in a scripted combat check
  (burning ticks, jammed skips).
- Sim re-run: ammo-type choice changes shots-to-kill distributions as modeled;
  no type dominates every matchup (piercing must not obsolete standard vs
  unarmored targets).
- Full harness green.


### 7.6 Settled spec — ChatGPT co-planning round, 2026-10-29 (FINAL)

Three exchanges in the "Generator Specification Details" thread
(chatgpt.com/c/6ae20835-3d68-83e8-a4bd-f8af4b5b0300); FINAL v2 plus two
Exchange-3 rulings, confirmed by ChatGPT as the FINAL Phase 4 spec. No
design decisions left open. Three pre-implementation verification items
(§7.6.8) are resolved from shipped code by the builder, not new choices.
This subsection overrides the PROPOSED items in §7.1–§7.5 where they
differ; §7.1–§7.5 text is kept for history.

**Invariants.** Phase 4 adds: (1) breakdown of components/surplus gear
into materials, (2) typed ammunition with recipes and Ammo Smith gates,
(3) enemy-only Burning/Jammed statuses, (4) Armorer Enhance. Banked
salvage stays the generic currency; materials are a separate persistent
hub resource, never an unbanked run resource. Pilot skills persist per
Phase 3 hub rules; mech run state is not retained on death/extraction.
Corrosive and Explosive ammo stay deferred (no recipe, pool, cost, or
unlock). Saves stay plain JSON — no classes, Sets, or Maps. Failed
operations consume no ingredients, materials, time, or ammunition. All
hub crafting/breakdown/Enhance actions are atomic and time-free; ammo
selection is time-free; firing follows the normal weapon action /
scheduler.

**7.6.1 Breakdown (hub Salvager only, SETTLED, no rank scaling).**
Breakdown is the Phase 3 permanent pilot skill, bought at the hub with
banked salvage under Phase 3 Codex/XP eligibility. Rank 1 unlocks
dismantling. Ranks 2–3 stay purchasable through the existing pilot-skill
system but have NO dismantling-yield effect and no replacement effect —
Phase 4 overrides/defers the §6.1 phrase "better yields/rank". Fixed
yield table, identical at every rank: Component 3 wire + 1 core; Common
2 wire + 0 cores; Uncommon 4 wire + 1 core; Rare 6 wire + 2 cores; Epic
10 wire + 3 cores; Legendary 16 wire + 5 cores. One eligible owned item
per action; irreversible; no salvage refund. Equipped items cannot be
broken down until unequipped; unrecovered wreck items cannot be broken
down; recovered wreck gear becomes eligible once recovered into hub
inventory.

**7.6.2 Materials and core rolls (SETTLED).** Exactly four materials:
`wire`, `coreThermal`, `coreShock`, `coreCorrosive`. Each core is an
independent uniform roll (1/3 each); depth/biome/theme do not change
weights (replaces §7.1's proposed depth-theme weighting). An N-core
yield makes N independent draws. Corrosive cores DO drop in Phase 4,
usable only for Enhance on gear explicitly tagged corrosive, never as
substitutes for thermal/shock cores. No corrosive ammo recipe or
corrosive status in Phase 4.

**7.6.3 Ammo pools, recipes, gates (SETTLED).** Four separate pools in
hub stockpile and run state: `ammoStandard`, `ammoPiercing`,
`ammoIncendiary`, `ammoShock`. Per-type pools win Open Decision #4
(§14 item 4, now resolved). All recipes output 6 rounds, craft at the
hub Armorer only, gate + ingredients checked before anything is
consumed; a refused recipe consumes nothing and reports the specific
reason. `requires.codex = null` for all four (no Codex discovery needed
to craft; the Codex-entry requirements for buying Ammo Smith ranks
stand).

| Ammo | Effect | Recipe | Gate |
|---|---|---|---|
| Standard | kinetic, no effect | 8 salvage → 6 (today's `ammoPack`, unchanged) | none |
| Piercing | ignores half target armor (rounded down on the ignored portion; remainder applies normally) | 6 wire + 4 salvage → 6 | Ammo Smith rank 1 |
| Incendiary | thermal, applies burning | 2 coreThermal + 4 wire → 6 | Ammo Smith rank 2 |
| Shock | EMP, applies jammed | 2 coreShock + 4 wire → 6 | Ammo Smith rank 3 |

Incendiary and Shock deal the weapon's normal rolled damage PLUS the
status on a hit. Ammo Smith ranks are cumulative.

**7.6.4 Caps, overflow, loadout, migration (SETTLED; §7 specified none
of these numbers).** Each hub material: 999. Each typed hub ammo pool:
999. Each typed run ammo pool: 99. Total starting load: 16 rounds.
Starting load per type: 12. Ammo crate: +8 Standard rounds. Overflow:
breakdown and crafting are all-or-nothing — if any output would exceed
a cap, refuse entirely, consume/grant nothing, item intact. Crate
pickup is clamp-and-discard — grant as many of the 8 as fit up to 99,
discard excess, show/log a message. Starting loadout: a player-chosen
Loadout panel before each run shows all four hub counts; allocate up to
16 total, max 12 per type, never more than the hub owns; confirming
subtracts from the hub and initializes the run's four pools. If the
player allocates nothing or skips the panel, default is 16 Standard if
at least 16 are available, else all available Standard and no other
types. Unallocated ammo stays in the hub. A run's unused ammo does not
automatically return to the hub on death; existing death/extraction
rules stay authoritative. Migration: legacy `ammo:N` →
`ammoStandard = min(max(N,0),999)` in the hub stockpile; other typed
pools and materials initialize to 0; N > 999 discards excess, emits a
migration diagnostic, converts nothing to salvage/materials;
idempotent; unrelated valid fields preserved; legacy run ammo migrated
separately, never copied into both hub and run. Verified cases: 0 → 0,
16 → 16, 1200 → 999 with diagnostic.

**7.6.5 Statuses (SETTLED).** Enemies gain `statuses: []` plus per-type
resistances; status records are JSON-safe objects. Player statuses stay
deferred. Burning: 3 HP per elapsed game time unit for 3 time units (9
total before resistance); no stacking; reapplication refreshes duration
to 3, no second stream; can kill, with death/drops resolving through the
ordinary path exactly once; ticks once per elapsed time unit regardless
of activations, including dormant enemies; the scheduler processes
burning ticks before that unit's enemy activation (a tick-killed enemy
does not activate). Resistance rounding: tick = max(1, floor(3 × (1 −
resistance))). Post-resistance table: Drone 50% → 1 HP/tick, 3 total;
Raider 0% → 3 HP/tick, 9 total; Brute 25% → 2 HP/tick, 6 total.
Jammed: skips exactly the next scheduled enemy activation; world time
still advances; reapplication does not queue extra skips; removed after
the skipped activation. Burning and jammed coexist in independent slots
and expire independently. Jam resistance is a probability on the game's
existing seeded RNG stream (never `Math.random()`, no new unseeded
generator): Drone 50% resist / 50% apply; Raider 0% / 100%; Brute 25% /
75%. No immunities for the initial three types. Each attempted Shock
application consumes one Shock round whether jammed or resisted;
resistance is checked only after the shot is confirmed to hit and
damage is resolved (a miss triggers no resistance roll); resistance
shows "Resisted" in the combat log plus a brief cue, no jam applied.
Display: a letter beneath the enemy HP bar — B orange with remaining
duration (B3/B2/B1), J cyan as J1. The log communicates burning damage,
jam application, resistance, status expiration, ammo auto-switches, and
empty-ammo refusals.

**7.6.6 Ammo switching / HUD / UX (SETTLED).** Q cycles forward
Standard → Piercing → Incendiary → Shock → Standard; Shift+Q reverses;
direct selection 1/2/3/4; Bag-adjacent selector clickable; switching
costs no time. These bindings are Phase 4 additions, NOT verified
against current bindings: the builder must check conflicts against
movement, FIRE, Bag, and skill controls; on conflict, preserve the
existing binding and use a documented non-conflicting alternative —
never silently override. An empty type may be manually selected (HUD
shows the type and 0). Pressing FIRE with the selected pool empty only
switches to the next non-empty pool in cycle order and displays
"Switched to [type] — [previous type] empty"; that FIRE input does NOT
fire a shot, consumes no ammunition, and advances no game time. If all
pools are empty, FIRE is refused with a visible "No ammunition" message,
no time advances, no ammo consumed. No silent substitution of Standard
for a selected specialized type. HUD shows selected type + current run
count; Bag shows all four run counts. Hub Armorer shows four recipes,
ingredient counts, required rank, precise refusal reasons. Hub Salvager
lists eligible components/gear, tier, yield preview, and an
irreversible-breakdown confirmation. Enhance display shows target
level, wire cost, matching core cost if applicable, and refusal reason
if blocked.

**7.6.7 Enhance (SETTLED).** Applies to all four gear slots: weapon,
armor, shield, utility. Data field is `element`, allowed values null,
"thermal", "shock", "corrosive"; explicit data only, never inferred from
names, dice, sprites, or descriptions; `element: null` is the default
until a specific item is tagged via a catalog entry; Phase 4 must not
retroactively invent tags; invalid values rejected by validation. Cost
per operation = 4 × target level (T = current + 1), plus 1 matching
core if elemental: +0→+1: 4 wire; +1→+2: 8; +2→+3: 12; +3→+4: 16;
+4→+5: 20; +5→+6 refused. Total +0→+5 = 60 wire + up to 5 cores.
Absolute ceiling +5 (a dropped +3 item may reach +5, not +8); never
changes tier, affixes, or damage dice; cannot fail randomly; hub-only,
one item instance, atomic (insufficient materials = no mutation).
Economy note: 60 wire = 30 Common / 15 Uncommon / 10 Rare / 6 Epic / 4
Legendary breakdowns; the same 60 wire alone crafts 10 Piercing batches
or 15 Incendiary/Shock batches (plus matching cores) — enhancement is
the long-term investment in one favorite item, ammo the consumable
alternative.

**7.6.8 Acceptance contract (SETTLED, precise) + pre-implementation
verification.** Breakdown: P4-BREAKDOWN-YIELD — exactly 200 gear
breakdowns (40 per tier), wire yields match §7.6.1 exactly;
P4-BREAKDOWN-CORES — 440 cores total, expected 146.67 per type, each
type within ±15% (125–168 inclusive), independent draws, RNG seed fixed
and recorded; P4-BREAKDOWN-RANKS — ranks 1/2/3 yield identical counts;
P4-BREAKDOWN-ATOMIC — over-cap breakdown refused, item/materials
unchanged; P4-BREAKDOWN-ELIGIBILITY — equipped/unrecovered-wreck items
cannot be dismantled. Ammo: P4-AMMO-GATES; P4-AMMO-RECIPE (exactly 6
rounds, correct pool, exact ingredients); P4-AMMO-POOL (save/load
preserves pools without duplication; new run receives exactly the
confirmed loadout); P4-AMMO-LOADOUT (≤16 total, ≤12/type, unallocated
stays in hub, empty-allocation default); P4-AMMO-SWITCH (Q, Shift+Q,
direct, mouse; no time cost; no key overrides); P4-AMMO-AUTO-SWITCH
(empty-pool FIRE switches, notice shown, no ammo/time consumed, no
shot); P4-AMMO-OVERFLOW (craft refused atomically; crates grant up to
room, discarded excess logged). Combat: P4-BURN-TICK; P4-BURN-KILL
(5-HP enemy, no resistance, dies on the second 3-HP tick, death/drops
exactly once, no activation); P4-BURN-DORMANT; P4-BURN-REFRESH;
P4-JAM-SKIP; P4-STATUS-STACK; P4-STATUS-RESIST (1,000 independent jam
attempts per enemy type on the existing seeded RNG with a fixed seed
recorded in the report; deterministic scripted tests verify the table;
statistical check within ±5 percentage points; fresh state per run,
reset only the test fixture between attempts, do NOT reseed before
every individual roll; report records seed, attempt count, resisted
count, observed percentage per enemy); P4-SHOCK-RESIST-COST (Shock round
consumed on a hit whether jammed or resisted; "Resisted", no jam);
P4-AMMO-EFFECT (normal damage + status; Piercing armor rule).
Enhancement/migration/harness: P4-ENHANCE-COST, P4-ENHANCE-CAP,
P4-ENHANCE-ATOMIC, P4-ELEMENT-TAGS, P4-LEGACY-MIGRATION (0/16/1200 →
0/16/999, diagnostic on the 1200 case), P4-MIGRATION-IDEMPOTENT,
P4-SIM-AMMO (re-run `sim_ammo.js` with typed effects; preserve the 3/3/6
depth-1 blaster baseline and ≥0.70 sustainable ranged share on depths
1–2), P4-NO-UNIVERSAL-DOMINANCE (a type dominates only if its median
shots-to-kill is strictly lower than every other available type against
all three enemies; ties do not count; Phase 4 fails if any type meets
that condition), P4-FULL-HARNESS (all tests pass, no new console
errors). Plus an HP/armor balance subcheck: the test report must read
Drone/Raider/Brute HP and armor directly from shipped definitions and
compute 9/HP before sign-off. Pre-implementation verification items
(builder resolves from shipped code, no new choices): (1) Breakdown
rank-1 salvage cost, Codex eligibility entry, and XP requirement
(`PILOT_SKILLS` in `core.js`); (2) shipped Drone/Raider/Brute HP and
armor (`ENEMY_TYPES`); (3) existing keyboard bindings vs. the §7.6.6
additions.

**7.6.9 What changed vs §7 as written.** Breakdown rank scaling
dropped/deferred (single fixed table; §6.1 phrase overridden, §7.6.1);
depth/theme core weighting replaced by uniform independent 1/3 rolls,
corrosive cores confirmed dropping, Enhance-only on corrosive-tagged
gear; Open Decision #4 resolved for per-type pools; caps (999/99/12)
and overflow rules added (§7 specified none); burning/jam numbers,
resistances, rounding, display, and combat-timing rules newly
specified; Enhance scope fixed to all four slots with the explicit
element-tag contract, +5 as absolute ceiling; `requires.codex = null`
for all recipes (skill-only recipe gating; skill-purchase Codex gates
retained); starting load changed to a player-chosen loadout panel with
the 16-Standard default; auto-switch refined so the FIRE press switches
but does not fire; acceptance criteria made measurable.

## 8. Phase 5 — Biome enemy rosters

**GROUNDED starting point:** theme is visual-only today (`core.js:215` comment;
`MAPS.md` §8). Every depth spawns the same cycle — raider, drone, brute —
`min(12, 3+depth)` enemies, same HP/dmg scaling. This phase makes the roster
follow the biome, using art that already exists.

### 8.1 Roster tables (PROPOSED weights; CONTENT.md depth order preserved)

| Theme (depths) | Roster (weights) |
|---|---|
| Industrial (1) | raider 5, drone 3, brute 2 |
| Scrapyard (2–3) | raider 3, drone 3, brute 2, turret_light 2, flyer 2 |
| Overgrown (4–5) | raider 2, drone 2, brute 2, turret_light 1, flyer 2, shielder 2, sniper 1 |
| Cavern (6) | brute 3, shielder 2, sniper 2, bomber 2, flyer 1, turret_light 2 |
| Molten / Frozen / Toxic / Neon (7–10, then cycling) | elite mix: sniper 2, bomber 2, shielder 2, turret_light 2, flyer 2, brute 2 — plus the boss rule below |

Composition scales within a theme: as depth rises, weights shift from the first
two entries toward the later ones (PROPOSED: +10% weight shift per depth past
the theme's first depth). Enemy count and HP/dmg scaling stay exactly as today.

### 8.2 New enemy mechanics (one per type; each is a small, testable branch)

- **Turret (light):** stationary — never moves, interval applies to its shots
  only; ranged attack, long sight. Art: `sprites/enemies/mech_turret_light_sheet.png`.
- **Flyer:** ignores hazards (flies over spikes), faster interval, lower HP.
  Art: `mech_flyer_sheet.png`.
- **Shielder:** frontal shield — attacks from the player's facing arc deal half
  damage (armor applies after the halving); attacks from behind bypass it.
  Art: `mech_shielder_sheet.png`.
- **Sniper:** long range (8), telegraphs: spends one activation aiming (visible
  marker), fires the next. Art: `mech_sniper_sheet.png`.
- **Bomber:** slow, AoE self-destruct on death or adjacent (splash to player +
  nearby enemies), telegraphed by a one-turn fuse marker. Art:
  `mech_bomber_sheet.png`.
- **Boss (depth 5+, structure rooms only, max 1 per floor):** big HP pool,
  spawns two drones on reaching half HP (PROPOSED), drops a guaranteed Epic+
  item + a Codex entry. Art: `sprites/mechs/mech_boss_sheet.png` (+ walk anims).

Each type gets an `ENEMY_TYPES` entry (stats, sight, retreat, salvage,
componentDrop) and an `enemyAct` branch; the Scout preview stays exact
automatically because it counts the real generator (`scoutPreview`).

### 8.3 Hazards decision (PROPOSED)

Theme hazards from `MAPS.md` (lava, water, spikes) stay **spike-only** in this
phase. The phase is about rosters; wiring lava/water mechanics is deferred to
keep the blast radius small. Biome *dressing* already varies by theme and is
unchanged. This is Open Decision #6.

### 8.4 Phase 5 acceptance

- 200-floor sweep per theme: roster composition within ±15% of the table; boss
  only in structure rooms, depth ≥5, ≤1/floor; no floor spawns an un-wired type.
- Scripted combat checks: turret never moves; flyer crosses a hazard unharmed;
  shielder halves frontal damage only; sniper telegraphs before firing; bomber
  splash hits the player and not through walls.
- All five enemy sheets + boss wired into `game/assets/` + `SHEETS` with poses;
  zero console errors; full harness green.

### 8.5 Settled spec — ChatGPT co-planning round, 2026-10-29 (FINAL)

Three exchanges in the "Generator Specification Details" thread
(chatgpt.com/c/6ae20835-3d68-83e8-a4bd-f8af4b5b0300); FINAL v2 plus two
Exchange-3 rulings, confirmed by ChatGPT as the FINAL Phase 5 spec. No
design decisions left open. Twelve pre-implementation verification items
(§8.5.13) are resolved from shipped code by the builder, not new choices.

**Attachment caveat (honest):** the three files granted for this round
were NOT attached — ChatGPT reported the upload quota exhausted by the
Phase 4 round ("wait 22 hours"). Exchange 1 pasted the shipped ground
truth and key Phase 4 facts and pointed ChatGPT at the design doc
attached earlier in the thread. ChatGPT reproduced §8.1–§8.4 from that
earlier attachment (54,975 bytes, may predate §8/§7.6) but could NOT
find the updated §7.6 in it, so it worked from the pasted Phase 4 facts.
The builder must check every FINAL-spec claim that touches §7/§7.6
against the current doc and shipped code via the §8.5.13 items.

**8.5.1 Binding constraints (preserved, not proposals).** Depth-1 trio:
Drone 16 HP / 0 armor, Raider 30 / 1, Brute 60 / 4. HP scales
1 + 0.1 × (depth − 1). Regular enemy count min(12, 3+depth). Grid 60×44;
floor seed runSeed XOR depth; 6–10 rooms; spanning-tree corridors plus
1–2 loops; room purposes workshop/reactor/storage/security/arena; room
rects are floor, walls are void cells adjacent to walkable cells. Single
seeded mulberry32 RNG stream with documented draw order; no unseeded
randomness; failed operations consume nothing; saves plain JSON only.
All distance checks use Chebyshev distance (max of absolute row/column
differences), pending shipped-code verification (§8.5.13 item 5). Phase 4
systems unchanged.

**8.5.2 Enemy stats (new; §8 gives no numeric stats).** dmgVar =
inclusive integer addition 0 through the listed value; acc/evasion are
percentages; interval is world time units between scheduled activations;
sight/range in tiles (Chebyshev).

| Type | HP | dmg | dmgVar | armor | acc | evasion | interval | sight | Retreat | Salvage | compDrop |
|---|---|---|---|---|---|---|---|---|---|---|---|
| turret_light | 20 | 4 | 1 | 1 | 75 | 0 | 3 | 8 | never / never moves | 2–4 | 15% |
| flyer | 12 | 4 | 2 | 0 | 70 | 20 | 1 | 6 | never / pursues | 1–3 | 10% |
| shielder | 24 | 5 | 2 | 2 | 70 | 5 | 2 | 5 | never / advances | 3–5 | 25% |
| sniper | 18 | 8 | 2 | 0 | 85 | 0 | 3 | 8 | within 3 tiles if a legal move increases distance | 3–5 | 25% |
| bomber | 24 | 6 | 2 | 1 | 65 | 0 | 3 | 5 | never / advances | 2–4 | 20% |
| boss | 120 | 8 | 3 | 4 | 80 | 5 | 2 | 8 | never / pursues | 12–18 | 100% |

Salvage is an inclusive integer rolled on death on the seeded RNG;
componentDrop is the percentage chance to drop exactly one component. No
new damage-scaling formula; use the shipped damage pipeline. HP is the
only stat with explicit depth scaling/rounding: maxHP = floor(baseHP ×
(1 + 0.1 × (depth − 1))), applied once, to every type including the trio
and boss; half-HP threshold is floor(maxHP/2) from the rounded integer.

**Gate revision (builder, 2026-10-29, per §8.5.13 revise-and-rerun):**
two table values failed P5-BALANCE-SIM under the shipped roll-range
mechanism and were revised — flyer evasion 20 → **16**, shielder HP
24 → **20**. The spec's bands were written under the percentage reading
of acc/evasion (F3); under the shipped mechanism evasion 20 dodges 65%
of shots vs acc 14, pushing the flyer median to 3 (band 1–2), and
shielder HP 24 + armor 2 + halving pushed the frontal median to 8 (band
4–6). Thresholds unchanged; all other table values as written. The
revised values hold the bands across five independent seeds. The
integer-HP examples above use the as-written HP 24 for the shielder
(d5 33 floor / 34 round); on the revised base 20 the shipped rounding
gives d5 28.
Integer HP at depths 1/2/5/10: turret_light 20/22/28/38; flyer
12/13/16/22; shielder 24/26/33/45; sniper 18/19/25/34; bomber
24/26/33/45; boss 120/132/168/228. Resistances (Phase 4 formula: burn
tick = max(1, floor(3 × (1 − r))), 3 ticks, refresh not stack, no
immunities): turret_light burn 0% → tick 3, total 9, jam-resist 25%;
flyer 50% → tick 1, total 3, jam 50%; shielder 25% → tick 2, total 6,
jam 50%; sniper 0% → tick 3, total 9, jam 25%; bomber 0% → tick 3,
total 9, jam 0%; boss 25% → tick 2, total 6, jam 75%. Boss key `boss`
and display name `Boss` are required interface values but remain
verification items (§8.5.13 item 6), not quoted §8 identifiers.

**8.5.3 Roster weights, shift, elite cycling.** Base tables accepted
exactly as written in §8.1 (relative weights, listed order preserved).
Theme assignment (new): 7 Molten, 8 Frozen, 9 Toxic, 10 Neon, 11 Molten,
12 Frozen, 13 Toxic, 14 Neon, 15 Molten; depths 16+ continue Frozen,
Toxic, Neon, Molten, and so on. SHIFT FORMULA — one formula for all
themes (Exchange 3 ruling, supersedes the v1 worked examples): k = depth
− first depth of that theme (Industrial 1, Scrapyard 2, Overgrown 4,
Cavern 6, elite cycle 7); p = min(0.10k, 0.50); donor pool = first two
entries, F = their original total weight; total shifted = F × p,
removed proportionally from donors and distributed proportionally to
recipients; report weights to four decimal places; normalize by the
adjusted sum for selection probabilities; do not round to integers; no
adjusted weight can go negative. Worked results: Scrapyard depth 3 (k=1,
p=0.10, F=6, shift 0.6) → [2.7000, 2.7000, 2.2000, 2.2000, 2.2000];
Overgrown depth 5 (k=1, p=0.10, F=4, shift 0.4) → [1.8000, 1.8000,
2.1000, 1.0500, 2.1000, 2.1000, 1.0500]; Elite order (Shielder, Turret,
Flyer, Brute, Sniper, Bomber): depth 7 all 2.0000; depth 8 (k=1)
[2.1000 ×4, 1.8000, 1.8000]; depth 9 (k=2) [2.2000 ×4, 1.6000, 1.6000];
depth 10 (k=3) [2.3000 ×4, 1.4000, 1.4000]; depth 11 (k=4) [2.4000 ×4,
1.2000, 1.2000]; depth 12 (k=5, capped) [2.5000 ×4, 1.0000, 1.0000];
depths 13–15 capped, same as depth 12. Sweep: 200 floors per depth 1–15
= 3,000 floors; seed series runSeed = (0x5D5C2026 + i×0x9E3779B9) mod
2^32, i=0…199, separately per depth; floor seed runSeed XOR depth;
record seed, depth, theme, regular counts by type, boss presence, boss
drones spawned, validation failures; exclude boss and boss drones from
regular counts, count both separately; each depth compared against its
own adjusted weights; observed share within ±15% relative of expected
share; zero-adjusted-weight types never spawn; expected count <20
supplemented by deterministic weight checks; report boss-presence share
per depth 5–15 as floors with boss / 200 including zero-boss floors and
the reason; every regular count must equal min(12, 3+depth).

**8.5.4 Boss.** "Structure room" = a room whose purpose is `security`
(new mapping; §8 does not define it). A security room is not guaranteed;
boss presence is conditional: depth ≥5 AND a qualifying security room
AND a qualifying spawn cell; no fallback to workshop/reactor/storage/
arena; max one per floor. Placement: first security room in generator
room order; only walkable, unoccupied cells in that room; valid cell at
least 3 Chebyshev tiles from player spawn; among valid cells choose the
greatest Chebyshev distance; tie-break ascending row, then ascending
column; if no cell qualifies, no boss, reason recorded in the sweep.
Half-HP event once, when boss HP first reaches or crosses
floor(maxHP/2): spawn exactly two drones if two legal cells are
available. If a single hit takes the boss from above half HP directly to
zero, no drones spawn. Healing/repeated crossings cannot retrigger. Boss
drones are ordinary `drone` enemies: shipped Drone stats, floor-depth HP
scaling and rounding, normal salvage/componentDrop, shipped Drone
burning/jam resistances; no boss stats or rewards. Boss and drones sit
OUTSIDE the regular cap; regular generation still creates exactly
min(12, 3+depth) enemies. Drone placement: deterministic BFS from the
boss cell, neighbor order N, E, S, W; search distance is shortest-path
length through walkable cells; exclude walls, void, spikes, occupied
cells, and the player's cell; choose the first two legal cells; if only
one or none fit, spawn as many as fit (0, 1, or 2) and log a diagnostic;
do not fail the floor. Rewards: exactly one guaranteed item, tier Epic or
Legendary, 50/50 seeded weighted roll, not an unrestricted normal drop.
One Codex entry on first defeat, at most once per profile; do not invent
a boss name or claim an existing Codex key — key/display name must be
reconciled against the shipped Codex registry (the v1 proposal
`codex_boss_core` / "Boss Core: First Contact" is dropped). Use the
existing boss sheet; no new art.

**8.5.5 Spikes.** Spike-only confirmed; lava/water deferred with no
damage/movement mechanics; shipped spike damage amount/path preserved,
no number invented. Player and ground enemies trigger spikes on entering
a spike tile; standing still does not retrigger; leaving and re-entering
triggers again. Flyer exempt from spike damage and spike-trigger events;
immunity does not extend to other hazards/statuses. Ground enemies must
not be placed on spike cells during normal generation (flyer exempt;
turret uses §8.5.9 relocation). If a ground enemy is somehow placed on a
spike by a malformed spawn/test setup, spawn placement is not "entering":
no spike damage until it leaves and re-enters. Spike damage killing an
enemy uses the ordinary death/drop path exactly once, including normal
salvage/componentDrop rolls. A bomber killed by spike damage detonates
through its normal death-detonation rule; spike entry alone never arms a
fuse. No doors or pressure plates in Phase 5.

**8.5.6 Shielder.** `facing` is a stored plain-JSON field holding exactly
one cardinal value N, E, S, or W. Spawn facing: "player visible" =
within shielder sight AND line of sight; if visible, face the cardinal
direction nearest the player's bearing; diagonal bearings choose the
cardinal with the smallest angular difference, exact ties resolve N, E,
S, W. If not visible, one seeded RNG draw at spawn, index floor(rng × 4)
from [N, E, S, W] in documented draw order. Update `facing` only after a
successful movement, to the move direction; never on being attacked;
persists across save/load. Frontal arc 90° total, ±45° around facing,
boundary included; a diagonal attacker against a cardinal facing is
exactly 45° and frontal (facing north, attacker northeast is frontal;
attacker directly east is 90° off and not frontal). Shield applies ONLY
to direct weapon attacks with a source position; never to burning ticks,
spike damage, or bomber splash. Order: (1) roll weapon damage, apply
normal modifiers; (2) if frontal, halve and floor; (3) effective armor —
Standard uses full armor, Piercing reduces armor by floor(armor/2); (4)
subtract effective armor; (5) clamp to at least 1 on a confirmed hit.
Formula: D_final = max(1, floor(D_raw × S) − max(0, A − floor(A/2) ×
P)), S=0.5 frontal else 1, A=armor, P=1 Piercing else 0. Worked example
armor 2, raw 15: Standard front 5; Standard rear 13; Piercing front 6;
Piercing rear 14. Piercing does not bypass the frontal shield; it only
reduces the armor subtraction.

**8.5.7 Sniper.** Attack range 8 and sight 8 Chebyshev tiles. When a
scheduled activation begins with a valid target in range and line of
sight, the sniper spends that activation aiming; aim consumes the
activation with no movement/damage. Telegraph state is stored
independently of rendering; the marker is rendered only when the player
has line of sight to the sniper's tile. The marker is drawn on the
player's tile as it was at aim time and does not track the player. At
the next scheduled activation, recheck target validity, range, and line
of sight: if the player remains in range and line of sight, the sniper
fires at the originally marked tile; if the player moved off it, the shot
resolves against that tile and can miss — it does not home in on the
player. If the player moved within 3 tiles after aiming, the sniper
still fires at the marked tile if the recheck passes; retreat does not
cancel an aimed shot. Cancel the telegraph if the player dies, the
sniper dies, the player is no longer in range, or line of sight is
blocked at the firing activation. If jammed at the aim activation, the
sniper loses that activation and creates no telegraph. If jammed at the
firing activation, jam skips the activation and the telegraph is
cancelled, not paused; the sniper must aim again. Burning ticks occur
before activations; a burn-kill clears the telegraph. A sniper never
retargets an existing telegraph.

**8.5.8 Bomber.** dmg 6, dmgVar 2, acc 65%, interval 3. Fuse marker on
the bomber's tile, visible only when the player has line of sight to the
bomber's tile; does not track the player. Fuse arming: check proximity
immediately after every successful player or bomber movement resolution;
if resulting Manhattan distance between player and a living bomber is
exactly 1, arm immediately. Spike entry alone never arms a fuse. Once
armed, the fuse detonates at the bomber's next scheduled activation even
if the player moved away. If that activation is skipped because the
bomber is jammed, the fuse remains armed and detonates at the next
non-skipped activation. If the bomber dies before the fuse activation,
its death detonation resolves immediately and the pending fuse is
cleared to prevent a second detonation. Splash: radius 1 Chebyshev tile,
3×3 area including the bomber's own tile; no distance falloff;
walls/void block line of effect, resolved independently per target;
every target processed at most once; chain detonations through a queue,
each bomber detonates at most once, already-dead/detonated bombers never
detonate twice. DAMAGE ROLL (Exchange 3 ruling, option (a)): ONE shared
damage roll per detonation — roll the bomber's configured damage range
once on the seeded RNG, apply that same base damage value to every
target, resolve each target's hit/evasion roll independently, then apply
that target's armor and other applicable resolution; a target that fails
its hit roll receives no damage, but the shared damage roll has already
been consumed; no per-target damage draws are made. Player damage uses
the existing player hit/evasion and armor/damage-resolution path (player
shield mechanics apply as in the existing path); enemy damage uses each
enemy's ordinary hit/evasion and armor pipeline; the shielder frontal arc
does not apply.

**8.5.9 Turret.** Stationary, no facing field. interval=3 governs shot
attempts only — not movement, rotation, target acquisition, status
ticks, jam duration, or hit resolution. A turret may shoot on its first
scheduled activation after spawn with a valid target; no initial 3-unit
wait. Store `nextShotTime`, initialized to the current world time at
spawn. An activation with no valid target (out of sight/range or LOS
blocked) does not start/consume the cooldown; the turret stays ready.
After an attempted shot against a valid target, nextShotTime =
currentWorldTime + interval. No other activation action, no rotation;
shoots in any direction. Sight and attack range 8 Chebyshev tiles;
walls/void block sight and shots. Burning ticks occur before activation;
a burn-kill prevents the shot; if jammed, it skips its next activation.
Spike relocation: if a generated turret occupies a spike tile, run BFS
from its placed cell, neighbor order N, E, S, W, select the nearest legal
cell that is walkable, unoccupied, and not a hazard; distance is
shortest-path distance through walkable cells; if no legal cell exists
anywhere on the floor, fail floor generation with a diagnostic; never
place the turret on a spike.

**8.5.10 Unified distance/LOS.** All stated tile distances use Chebyshev
distance (turret/sniper sight and range 8; flyer sight 6; shielder/
bomber sight 5; boss sight 8; sniper retreat within 3; boss placement
minimum 3; bomber splash radius 1; bomber fuse is the deliberate
exception — Manhattan distance 1, checked on movement resolution). Line
of sight uses the existing grid LOS function; walls/void block LOS; no
new LOS rule.

**8.5.11 Phase 4 interaction.** Unchanged for new enemies. On a confirmed
weapon hit: (1) resolve hit with the existing pipeline; (2) resolve
damage including armor and the §8.5.6 shielder rule; (3) apply damage;
(4) if the target survives and the ammo applies a status, roll
resistance on the existing seeded mulberry32 stream; (5) on resistance,
do not apply the status and display "Resisted"; on success, apply it;
(6) a Shock round is consumed on a hit whether jam succeeds or is
resisted; (7) misses follow existing Phase 4 ammo behavior and do not
roll status resistance; (8) burning and jammed can coexist; burning
ticks are not stopped by jam. Scheduler order fixed: burning ticks
before enemy activations every elapsed world time unit; a burning turret
can die before its shot; a burning sniper can die before firing; a
burning bomber can die and detonate before its scheduled activation with
no second fuse detonation; jam skips exactly the next scheduled
activation, does not pause world time or burning ticks; every death/drop
event resolves exactly once. No new unseeded RNG, separate status RNG,
or reordered resistance checks.

**8.5.12 Art wiring and data contract.** Exact §8.2 paths retained; do
NOT add `game/assets/` unless the shipped asset loader itself resolves
that prefix. Proposed SHEETS keys (wiring choices, must be reconciled
with existing SHEETS naming conventions): turret_light →
sprites/enemies/mech_turret_light_sheet.png; flyer →
mech_flyer_sheet.png; shielder → mech_shielder_sheet.png; sniper →
mech_sniper_sheet.png; bomber → mech_bomber_sheet.png; boss →
sprites/mechs/mech_boss_sheet.png. Every existing sheet must load, every
pose already present must resolve, no new poses/art. Enemy state —
facing, nextShotTime, sniper telegraph state and marked tile, bomber fuse
state, one-shot boss threshold state — must serialize as plain JSON.

**8.5.13 Acceptance contract + verification-only items.** Every check
required; failure blocks Phase 5: P5-ROSTER-SWEEP; P5-ROSTER-DETERMINISM;
P5-ROSTER-VALIDATION; P5-HP-SCALING (all six types, depths 1/2/5/10,
integer HP matches §8.5.2 floor rule); P5-STATUS-RESISTANCE;
P5-SHIELDER-ARC; P5-SNIPER-TELEGRAPH; P5-BOMBER-FUSE; P5-BOMBER-SPLASH
(valid Chebyshev radius-1 cells with line of effect only, per-target hit
rolls, no target hit twice, with the Exchange 3 shared damage roll);
P5-TURRET; P5-TURRET-SPIKE-PLACEMENT; P5-FLYER-SPIKE-IMMUNITY;
P5-SPIKE-DEATH; P5-BOSS-SPAWN; P5-BOSS-PRESENCE-SWEEP; P5-BOSS-DRONES;
P5-BOSS-REWARD; P5-ART-WIRING; P5-SAVE-JSON; P5-SCOUT-PREVIEW;
P5-HARNESS (run beta-testers/run_all.sh, zero failing tests); P5-CONSOLE
(zero new Phase 5 console errors). Balance gate P5-BALANCE-SIM
(mandatory): actual Phase 1 starter-blaster configuration and existing
hit/damage pipeline; ≥10,000 seeded combat trials per non-boss type
across its eligible depths (turret_light/flyer 2+, shielder/sniper 4+,
bomber 6+, boss 5+ subject to §8.5.4), plus diagnostics; record
p10/median/p90. Required median STK: Drone exactly 3, Raider exactly 3,
Brute exactly 6; turret_light 1–3; flyer 1–2; shielder attacker behind
2–3; shielder frontal arc 4–6; sniper 1–3; bomber 1–3; boss greater than
every non-boss median at the same depth. Hard failures: trio medians
differ from 3/3/6; any non-boss median outside its band; any non-boss
median STK >8 at any eligible depth (no mechanic exception); boss median
not higher than every non-boss median at the same depth. Incoming damage
recorded-only, not a gate. If the gate fails, Phase 5 is not approved;
revise only new Phase 5 values and rerun; do not change thresholds.
Phase 4 regressions (supplied IDs retained; v1 aliases are NOT contract
IDs): P4-BREAKDOWN-RANKS, P4-AMMO-GATES, P4-AMMO-RECIPE, P4-AMMO-POOL,
P4-AMMO-LOADOUT, P4-AMMO-SWITCH, P4-AMMO-AUTO-SWITCH, P4-STATUS-RESIST,
P4-ENHANCE-COST; also rerun the existing Phase 4 full harness and ammo
simulation under the same recorded seed/configuration. Implementation
order (no code authorized by the spec alone): (1) verify the items
below; (2) freeze stat table and HP rule after confirming compatibility
with shipped definitions; (3) roster weights and elite cycling, run
sweep/determinism/validation; (4) boss placement/threshold/drones/
rewards, run boss checks; (5) turret and flyer rules including
relocation; (6) shielder facing and single §8.5.6 formula; (7) sniper
telegraph and bomber fuse/splash state, save/load and event-queue tests;
(8) integrate all six types with Phase 4 status manager/scheduler, run
Phase 4 regressions immediately; (9) wire six existing art sheets,
confirm poses, create no art; (10) full sweep, balance sim, save/load,
browser console check, full harness; (11) update PHASE5-REPORT.md with
seeds, per-depth distributions, boss presence rates, STK distributions,
test outcomes, failures. Verification-only items (builder resolves from
shipped code, no new choices): (1) spike damage value and code path;
(2) boss Codex key collision and grant path; (3) dmg/dmgVar semantics
and damage scaling; (4) HP rounding — whether shipped code floors,
rounds, or ceils; (5) distance metric — verify the shipped sight/range
helper (Chebyshev is the explicit rule if the source establishes none);
(6) boss key/display name — whether the shipped registry expects `boss`
/ `Boss`; (7) shielder spawn-orientation source — whether a seeded rule
already exists, else use §8.5.6 [N,E,S,W] and document its RNG draw-order
position; (8) room-generation guarantee — whether the generator
guarantees a security room on any depth (spec assumes none); (9)
asset-loader path resolution and SHEETS keys — whether exact source
paths are relative to an asset root and whether proposed keys collide;
(10) Phase 4 contract labels — reconcile supplied P4-AMMO-*,
P4-STATUS-RESIST, P4-ENHANCE-COST IDs against the shipped Phase 4
report/harness; (11) starter-blaster definition — exact Phase 1 baseline
weapon configuration before P5-BALANCE-SIM; (12) line-of-sight helper —
diagonal corner blocking and void-cell treatment; spec requires a single
shared helper.

**8.5.14 What changed vs §8 as written.** (1) Roster weights: PROPOSED
tables accepted exactly; shift arithmetic, cap, rounding, elite-cycle
first depth 7, and theme assignment 7–15+ newly settled; the v1
total-weight shift formula and worked examples are superseded by the
Exchange 3 donor-pool formula for all themes. (2) Sweep expanded from
"200 floors per theme" to 200 per depth 1–15 (3,000 floors) with a fixed
seed series, per-depth adjusted-weight comparison, and boss-presence
counting. (3) ENEMY_TYPES stats, HP floor rounding, and burning/jam
resistances are entirely new — §8 supplied none. (4) "Structure rooms"
mapped to security purpose only (new mapping; §8 undefined), with
deterministic placement, conditional presence, no fallback, and
boss+drones outside the regular cap. (5) Half-HP drone spawn accepted but
made exact: once-only, no spawn on a lethal single hit, ordinary Drone
definitions, spawn-as-many-as-fit with diagnostic (replacing v1's "fail
the floor validation"). (6) Boss rewards newly specified: one
Epic-or-Legendary item, 50/50 seeded roll; Codex grant once per profile
with key unresolved; v1's proposed codex_boss_core / "Boss Core: First
Contact" dropped; no boss name invented. (7) Hazards: PROPOSED spike-only
confirmed; lava/water deferred; spike trigger, spawn-placement, and
spike-death rules newly specified; no spike damage number invented.
(8) Shielder: §8's "player's facing arc" wording corrected to the
shielder's stored facing; arc, facing determination, and damage order
newly specified. (9) Sniper, bomber, turret, flyer edge cases newly
specified in full (fixed marked tile, LOS-gated rendering, jam/burn
interplay; movement-resolution fuse, jam-deferred detonation, shared
damage roll; nextShotTime, first-activation readiness, BFS spike
relocation; spike-only flyer immunity). (10) Chebyshev distance metric
newly settled for all sight/range/retreat/placement/blast distances
(bomber fuse remains Manhattan adjacency). (11) Phase 4 interplay
contract newly specified, including Piercing/shield composition order.
(12) Acceptance contract expanded from the §8.4 outline into P5-* IDs
plus the mandatory P5-BALANCE-SIM gate and corrected Phase 4 regression
IDs. (13) Art: exact §8 paths retained; the v1 `game/assets/` prefix was
removed in v2; SHEETS keys are proposals requiring reconciliation, not
source facts.

## 9. Phase 6 — Doors, visibility, locked rooms

**DECIDED (user's brief, 2026-10-28 07:12 PDT):** doors are functional
thresholds; rooms are black until first entered, then visible-but-greyed when
the player is not inside; enemies behind closed doors are not visible until the
door opens; some doors are locked and need a key, brute-force strength, or a
high enough lockpick/technical skill; locked rooms gate new areas, loot, or
other interesting things.

### 9.1 Door placement fix (the "weird spots" bug)

Today every corridor cell touching a room rect becomes a door (`core.js:158`),
including corridors running *alongside* rooms — hence rows of doors. **PROPOSED
rule:** a corridor cell becomes a door only when it is a *threshold*: room floor
on one side (4-dir) and corridor on the opposite side, i.e. the cell where a
corridor crosses a room's boundary. Corridor cells merely adjacent to a room
stay corridor. One door per room entrance; a room with two corridor entrances
gets two doors. The fix is verified by a placement sweep: doors form only at
boundary crossings, never in runs of 3+.

### 9.2 Door states & opening

Doors gain state: `closed` (default) / `open` / `locked` (with `lockLevel` and
`keyId`). State lives on the floor (`floor.doors[]`, plain JSON) so saves carry
it; legacy saves default every door to `open` (current behavior, no surprise).

- **Closed doors** block movement and sight (`lineOfSight` treats closed/locked
  doors like walls). Moving into a closed door opens it and costs the move
  (Pixel Dungeon behavior). Opening is noisy: enemies within sight wake.
- **Rendering:** closed = the door sheet's closed frame; open = the open frame
  (batch-3 open/closed door art exists as plain keys); locked = closed frame +
  a red lock marker, drawn like the existing `z` sleeper indicator. No new art
  is required for states.
- **Enemies** cannot open doors; they path around them (existing `findPath`
  treats closed doors as blocked). An enemy that cannot reach the player waits
  — the current scheduler already handles unreachable targets by idling.

### 9.3 Locked doors: three keys to the same lock (DECIDED: key, strength, skill)

- **Key:** a `key` pickup kind, placed by the generator in a *different* room
  from its lock, never behind its own locked door (solvability rule, enforced
  by Pass 6 validation, §10). Keys are per-lock (`keyId`); picking one up logs
  which door it fits. Key art exists (`sprites/items/item_key_sheet.png`).
- **Brute force:** melee-attack a locked door: the door has HP = 20 × lockLevel
  (PROPOSED); each hit costs a time unit, makes noise (wakes the room beyond),
  and the door breaks open at 0 HP. Strength-gated in effect: low-damage builds
  take many loud hits, which is the cost.
- **Lockpick / technical skill:** a Phase 3 Engineering-tree skill
  (*Bypass*, PROPOSED): attempt vs lockLevel, rank-gated (rank ≥ lockLevel − 1);
  success opens silently; failure costs a time unit and makes noise. Until
  Phase 3 ships, the skill gate reads as "not yet available" — locked doors are
  still solvable by key or force, so Phase 6 never hard-requires Phase 3.

### 9.4 What locked rooms contain (DECIDED: new areas, loot, or interesting things)

Locked rooms are bonus branches, never the critical path: the stairs room is
never locked, and the spanning-tree path never requires a locked door. Contents
roll from three kinds (PROPOSED equal weights): a **loot vault** (cache + 2
caches at higher tiers), a **new area** (an extra room/branch reachable only
through the lock, with its own encounters), or an **objective room** (a Codex
cache / a guaranteed Rare+ drop / a lore console). The generator marks the
room's purpose at Pass 4 (§10) so its contents follow its identity.

### 9.5 Fog of war: black, then greyed (DECIDED, Pixel Dungeon style)

- `floor.explored` — a per-room set on run state (plain JSON, saved). Entering
  any cell of a room marks the whole room explored (room-granular, PD-style).
- **Unexplored rooms:** not drawn at all (black void), including their enemies,
  pickups, and dressing. The player sees only the room they are in, plus
  corridors/doors already traversed.
- **Explored, unoccupied rooms:** structure (floor/walls/dressing) drawn dimmed
  (PROPOSED: 45% brightness overlay); actors and pickups hidden unless the
  player is inside the room or has line of sight through an open door.
- **Current room:** full brightness, everything drawn as today.
- Corridors the player has walked stay visible dimmed like explored rooms;
  unwalked corridors stay black. The minimap question is out of scope (no
  minimap exists; the canvas *is* the map).
- Enemies in black rooms do not act on the player (they already only act
  within sight + scheduler range; closed doors block sight, so the fog and the
  AI agree). Waking rules unchanged.

### 9.6 Phase 6 acceptance

- Placement sweep: zero door runs of 3+; every door is a boundary threshold;
  every room has ≥1 door or is the spawn room.
- Scripted checks: closed door blocks sight and movement; opening costs a
  move and wakes the room; locked door opens by key, by force, and by skill
  (skill path stubbed until Phase 3, refused honestly); stairs never locked;
  no locked door guards the only path to stairs (flood-fill check with locks
  treated as walls).
- Fog sweep: a fresh run's first screenshot shows only the spawn room; after
  entering a second room, the first renders dimmed and the second full; no
  enemy is ever drawn in a black room.
- Save/load round-trip: door states + explored set survive; legacy saves load
  with all doors open and all rooms explored.
- Full harness green, with new fog/door personas added to `beta-testers/`.

### 9.7 FINAL Phase 6 spec — settled without ChatGPT (2026-10-29, user's word)

The Phase 6 ChatGPT round (2026-10-29 21:03–21:10 PDT) completed one exchange
and then paused on a usage limit until 11:04 PM PDT. ChatGPT's v1 draft settled
§9 proposals but stated it could not access the approved §10 text and refused
to call its §10 reconstruction the approved original. The user then directed
that Phase 6 be settled and built without ChatGPT. This section is that
settlement. It is authoritative for the Phase 6 build. §9.1–§9.6 and §10 stand
as written; where this section and §9/§10 appear to differ, this section
states the reading that governs, with the reason. ChatGPT's v1 draft
(saved at `PHASE6-V1-DRAFT-2026-10-29.md`) was used as a checklist only —
no v1 statement is adopted on ChatGPT's authority, and every adopted rule
below is grounded in §9, §10, or shipped code verified 2026-10-29. No new
design decisions are left open; only the numbered verification items in
§9.7.12 remain, and those are resolved from shipped code, never invented.

#### 9.7.1 Shipped-code facts that override contrary assumptions

Verified from `game/core.js` / `game/game.js` 2026-10-29 (builder re-verifies
each as an F item; follow shipped code over this section if a fact below is
wrong, and flag the discrepancy in the report):

- **F6-1 Rooms:** 6–10 rooms, 4×4 to 8×6, 1-cell separation, 2-tile map
  margin (placement: `x` in 2..`GRID_W-w-2`, same for y). The §10.5
  PROPOSED "2-tile margin / 1-tile clearance" IS the shipped rule. No change.
- **F6-2 Corridor carver:** L-shaped, `horizFirst` on one seeded draw per
  corridor, spanning tree to a random earlier room plus 1–2 loops. It is NOT
  Kruskal/Prim and NOT A*/Dijkstra. §10 Pass 2 describes a candidate-graph
  design; Phase 6 does NOT rewrite the carver. Pass 1/2 guarantees are
  verified against the shipped layout, and door classification is layered
  on top of it. No draw is added, removed, or reordered in room placement,
  typing, or corridor carving.
- **F6-3 Purpose:** only `structure` rooms draw a purpose, one uniform
  draw per structure room in room order, immediately after the
  `forceType` guarantees and before corridor carving
  (`ROOM_PURPOSES` = workshop/reactor/storage/security/arena). Non-structure
  rooms have no purpose. The purpose draw order is never moved for Phase 6.
- **F6-4 Coordinates:** `grid[y][x]`, `GRID_W = 60`, `GRID_H = 44`,
  rooms `{x, y, w, h, cx, cy, type, purpose}`. `x` is the column, `y` is the
  row. Room IDs are the room's index in the rooms array, rendered
  `room:<index>`; array order is placement order and rooms are never
  renumbered.
- **F6-5 LOS:** `lineOfSight` is Bresenham and ONLY `'wall'` blocks it;
  void does not block and diagonals cut corners (Phase 5 F12, kept).
  Door blocking is added inside that one helper only (see §9.7.4).
- **F6-6 Damage:** acc/evasion are roll-ranges, not percentages (Phase 5
  F3). Only ONE weapon def has `pattern: 'melee'` (energy sword, 3d6+5,
  range 1, no ammo); every other weapon has a dice spec under a different
  pattern. Door force therefore uses the CURRENT equipped weapon's dice
  roll (see §9.7.5), not a "melee weapon" that most builds do not carry.
- **F6-7 `coherenceCheck`** exists and checks: room count/size/overlap,
  loot + structure presence, walkable flood fill from spawn, stairs/spawn
  not in hazard, enemy count (`min(12, 3+depth)` plus boss), enemy in
  spawn room / adjacent to spawn, ground enemy on a hazard, boss inside a
  security structure room, dead-end corridors >4 cells without loot. It
  is called from tests, never inside generation. It does NOT check doors,
  locks, fog, room-graph BFS separately, content legality, encounter
  feasibility, or determinism. Phase 6 wires it into generation and
  EXTENDS it; existing checks stay verbatim.
- **F6-8 No Bypass skill exists.** The 12 shipped pilot skills are
  steadyAim, heavyHands, secondWind, triggerDiscipline (Combat);
  salvageSense, breakdown, deepPockets, codexEye (Scavenging); fieldRepair,
  ammoSmith, overclockTuning, platingKnowhow (Engineering). No lockpick /
  Bypass skill is defined in either skill system. §9.3's "until Phase 3
  ships" clause is therefore spent: Phase 3 shipped without one.
- **F6-9 No known-good template floor exists in shipped code.** §10's
  template fallback is PROPOSED and unverified. No template is invented;
  generation failure is a diagnostic failure (see §9.7.9).
- **F6-10 Art:** door open/closed art exists (`tile_door_sheet.png`,
  batch-3 wall-door open/closed keys in `SHEETS`); key art exists
  (`loot_key_sheet.png` / `sprites/items/item_key_sheet.png`). No new art
  in Phase 6. The lock marker and fog overlay are drawn, not sprited.

#### 9.7.2 Door placement (settles §9.1; resolves v1 gaps 2–3)

A grid cell is a door cell only when ALL of the following hold:

1. The cell's shipped kind is `'corridor'`.
2. Exactly one 4-dir neighbor is room floor belonging to one room R, and
   the OPPOSITE 4-dir neighbor is corridor floor outside every room rect.
   (This excludes corridors running alongside a room, and corner-only
   contact, which gets no door.)
3. The other two 4-dir neighbors do not themselves satisfy (2) for a
   different room. A cell qualifying for two rooms is not a door for
   either; the entrance must be resolved by the grouping rule below, never
   by silently assigning it to one room.
4. The cell belongs to the shipped corridor network: it lies on a carved
   corridor route (spanning-tree or loop route as carved), not on a
   decorative or disconnected walkable tile. Corridor cells produced only
   by room-floor adjacency are not doors.

Grouping: qualifying cells that are 4-dir adjacent to each other, for the
same room R, and connected through corridor cells of the same route,
form ONE entrance. Exactly one door per entrance. The door cell is the
first cell of the group in row-major order (lowest y, then lowest x) —
deterministic, no midpoint computation. A 2+-cell-wide entrance gets one
door. A corridor entering a room at two distinct boundary segments may
get two doors (one per entrance group). A door cell belongs to exactly
one entrance and one room. Every non-spawn room must have >=1 door; a
room with none is a generation failure under §9.7.9, never silently
patched by placing a door on an invalid cell. Door ID:
`door:<y>:<x>` (y = row, x = column), derived from coordinates and the
floor seed namespace only — no random IDs, no UUIDs.

Door record (plain JSON, on `floor.doors[]`, per §9.2):

```json
{"id": "door:<y>:<x>", "x": 0, "y": 0, "roomId": "room:<index>",
 "entranceId": "entrance:<roomId>:<n>", "state": "closed",
 "lockLevel": 0, "keyId": null, "hp": 0, "maxHp": 0}
```

`entranceId` numbers entrances per room in row-major door order, starting
at 0. `lockLevel` 0 = ordinary; 1–3 = locked. `hp`/`maxHp` are 0 for
ordinary doors and positive for locked doors (§9.7.5). `floor.doors[]`
is the authority for door state; the grid kind stays `'door'` for every
door cell regardless of state, and walkability/sight are decided from
`floor.doors[]`, never from the grid kind alone.

#### 9.7.3 Locked rooms are leaf branches (settles §9.4 structure)

Locked rooms are bonus branches, never the critical path (§9.4 DECIDED,
unchanged). Implementation reading, settled here: a locked room is a
LEAF room of the shipped layout — a room whose only corridor connection
is the locked entrance — selected from rooms already generated by the
shipped placer. Phase 6 generates NO extra rooms and changes the 6–10
room count. The stairs room is never locked, and no spanning-tree edge
needed to reach the stairs passes through a locked door (verified by
the flood-fill check in §9.7.8 with locks as walls). If no leaf room
qualifies on a floor, that floor has no locked rooms; locked rooms are
optional content, never a generation requirement.

Locked-room kind: equal weights 1/3 loot vault / 1/3 new area / 1/3
objective room, one seeded draw per locked room in stable room order.
Loot vault: 1 guaranteed cache at lock level 1, 2 guaranteed caches at
levels 2–3, placed per the shipped cache placement rules for loot rooms.
New area: the leaf room itself, populated with encounters from the same
roster/weights as the rest of the floor at that depth (regular enemy
cap rules unchanged; the room's encounters are part of the floor's
regular population, not extra). Objective room: one seeded uniform 1/3
draw among Codex cache, guaranteed Rare-or-better drop, lore console.
The lore console is console dressing plus a log line — no new mechanic
exists for lore in shipped code, and none is invented. The kind draw and
the objective draw sit in the draw order in §9.7.10, after the purpose
draws and before key placement.

`lockedRoomKind` is SEPARATE metadata on the room record
(`room.lockedKind`, null or one of the three kinds). It does not replace
or reorder the shipped purpose draw (§9.7.1 F6-3). A locked room keeps
whatever purpose it drew (including `security` — see §9.7.7 for the boss
consequence); §9.4's "purpose marked at Pass 4" is satisfied by this
metadata plus the shipped purpose field, and Pass 4/5 are the shipped
stages in §9.7.9, not a reordering of draws.

#### 9.7.4 Door states, LOS, wake, rendering (settles §9.2)

- States: `closed` (default for every door on a fresh floor, including
  ordinary doors), `open`, `locked`. Legacy saves default every door to
  `open` and every room explored (§9.2, §11.1).
- Opening an ordinary closed door: the player attempts to move into the
  door cell; the door becomes `open`; the player STAYS on the original
  cell; the attempt consumes exactly 1 time unit; the normal scheduler
  then runs (status ticks first, then eligible activations, per the
  shipped Phase 4/5 scheduler contract); a separate move is needed to
  enter the door cell. This is the §9.2 "costs the move" rule read as
  one time unit with no displacement, matching the v1 draft and Pixel
  Dungeon behavior. Enemies can act during the opening turn under the
  normal scheduler; newly awakened enemies get no retroactive or extra
  activation and no jam bypass.
- Wake on opening: sleeping, alive enemies within Chebyshev distance 8
  of the door cell, with door-aware LOS to the doorway, and not
  separated from the doorway by another closed/locked door, wake.
  Awake enemies are unaffected by the wake rule (they already act under
  the scheduler). Noise through an open door follows the same LOS rule;
  noise does not pass through walls or closed/locked doors.
- Closed/locked doors block player movement and enemy `findPath`
  (treated as blocked tiles). Enemies that cannot reach the player wait
  under the existing scheduler. Enemies never open, force, or pass
  through closed/locked doors. Open doors stay open for the floor.
- LOS: door blocking is added inside the shipped `lineOfSight` helper
  only. An intervening door cell blocks sight when its state is
  closed/locked; open doors do not block. The check applies only to
  door cells actually intersected by the Bresenham line, excluding the
  observer and target cells, and applies consistently to player
  visibility, sniper telegraphs, turret sight, and every other LOS-gated
  check. Void-does-not-block and diagonal corner-cutting are preserved
  unchanged.
- Rendering: closed = existing closed frame, open = existing open frame
  (batch-3 / `tile_door_sheet` keys, builder verifies the exact SHEETS
  keys), locked = closed frame + red lock marker drawn like the existing
  sleeper indicator. No new art.
- Door-cell visibility (settles v1 gap 7): a door cell is drawn when it
  is adjacent to a walked corridor cell or to an explored room, even if
  the room beyond is unexplored — the player sees the doorway, not the
  room. The unexplored room interior stays black.

#### 9.7.5 Locks: key, force, Bypass stub (settles §9.3)

- Lock levels 1, 2, 3, equal weights (one seeded draw per locked door in
  stable lock order). No depth-to-lock-level rule: a level-3 lock (60 HP)
  can appear on depth 1. Accepted deliberately — every lock is solvable
  by key or by force, so a deep lock early is a cost, not a soft-lock.
- Door HP: flat `20 × lockLevel` (20/40/60), NOT depth-scaled, per the
  §9.3 PROPOSED rule adopted here. `maxHp = hp` at generation.
- Key: a `key` pickup kind, one per lock, `keyId` matching its lock,
  placed in a DIFFERENT room from its lock, never behind its own lock
  and never behind any other lock whose key is not already reachable
  (no circular dependencies), only in rooms reachable without opening
  any locked door. Pickup log wording, settled: 
  `Key acquired: fits the <purpose> door (x, y).` where `<purpose>` is
  the locked room's shipped purpose if it has one, else its room ID,
  and `(x, y)` are the door cell coordinates — the label must
  distinguish doors on the floor. A non-matching key is never consumed:
  attempting to use the wrong key fails with no time, RNG, or noise cost.
  Key pickup schema is the shipped pickup record plus `keyId`; builder
  verifies the shipped pickup shape and adds nothing else.
- Brute force: a dedicated door-force action against a locked door.
  It auto-hits (doors have no evasion; no acc/evasion roll). Damage is
  ONE roll of the CURRENT equipped weapon's dice spec through the
  existing seeded damage-roll pipeline, with no armor, evasion, or
  surprise modifiers and no ammo consumed. (Correction to the v1 draft's
  "equipped melee weapon" wording: only one shipped weapon is
  melee-pattern, so the rule is the current weapon, any pattern. If the
  equipped weapon somehow has no dice spec, fall back to the shipped
  player flat damage roll and record the fallback in the report.)
  The action costs exactly 1 time unit even if the roll is 0. A
  damaging hit reduces HP by the rolled damage, clamped at 0; at 0 the
  door becomes `open` with `hp = 0`. Noise is emitted AFTER damage/state
  resolution, including on the breaking hit, and wakes under §9.7.4.
  Force never consumes RNG beyond the single damage roll.
- Bypass: STUB / REFUSE. No Bypass skill is defined (§9.7.1 F6-8), and
  Phase 6 invents none and wires none. Any Bypass attempt is refused
  with exactly: `Bypass unavailable: no compatible lockpick skill is
  defined in the current skill system. Use the matching key or force
  the door.` The refusal consumes no time, no RNG, and makes no noise.
  Keys and force must solve every lock without Bypass (enforced by the
  solvability check in §9.7.8). If a compatible skill is ever defined
  in a later phase, its ID, rank gate, cost, and success rule must be
  specified in that phase's spec before any wiring — no success
  probability, cost, or rank mapping is invented here. §9.6's "skill
  path stubbed, refused honestly" is satisfied by this rule.

#### 9.7.6 Fog of war (settles §9.5; resolves §14 #8 as room-granular)

Room-granular reveal, per §9.5 DECIDED, unchanged except for the
simulation clarification below. §14 item 8 is RESOLVED: room-granular.

- `floor.explored`: plain JSON on run state,
  `{"exploredRoomIds": ["room:<index>", ...],
    "walkedCorridorCells": ["<x>,<y>", ...]}` — arrays only, no Set/Map/
  class instances. Entering any cell of a room marks the whole room
  explored. Entering a corridor cell marks exactly that cell walked;
  corridor visibility does not propagate along the corridor.
- Current room (room rect containing the player; none when the player
  is in a corridor): full brightness, everything drawn as today.
  Explored, unoccupied rooms: structure (floor/walls/dressing) drawn
  dimmed at 45% brightness overlay (§9.5 PROPOSED value, adopted);
  actors and pickups hidden unless the player is inside the room or
  has door-aware LOS to the actor/pickup cell through an open door.
  Unexplored rooms: drawn as nothing, including walls, doors (except
  the door-cell rule in §9.7.4), actors, pickups, and dressing.
  Walked corridor cells: visible dimmed at 45% unless inside the
  current room's full-brightness rendering. Unwalked corridors: black.
  No minimap.
- Simulation clarification (reconciles §9.5 "enemies in black rooms do
  not act" with the Phase 5 scheduler contract): fog adds NO freeze
  rule. Enemies in black rooms do not act ON the player because closed
  doors block LOS and they are outside sight range under the shipped
  scheduler — the fog and the AI agree through LOS, not through a
  simulation pause. Burning ticks, jam skips, and all other scheduler
  rules continue for unseen enemies exactly as in Phase 5 (statuses
  tick before activations every time unit, including for dormant
  enemies). Fog is a rendering/sight rule only.
- Scout preview: the P5-SCOUT-PREVIEW contract stands unchanged.
  Preview and actual generation must agree on room/door topology and
  lock solvability because both use the same generator. Fog applies at
  render time only; the preview data path is unchanged, and no preview
  UI may reveal unexplored rooms during ordinary gameplay beyond what
  the shipped Scout preview already shows — builder verifies the
  shipped preview behavior and reports any leak it finds rather than
  inventing a new preview rule.

#### 9.7.7 Boss compatibility (Phase 5 contract, locked-room case)

The Phase 5 boss rule is unchanged: conditional, depth ≥5, first
security-purpose structure room in generator room order, ≥3 Chebyshev
from spawn, greatest distance, no fallback, max 1/floor, half-HP drones
outside the regular cap. Settled here: if that first security room is
locked (its entrance is a locked door), the floor has NO boss, and the
reason is recorded in the sweep/validation diagnostics. No later
security room is substituted — "first security room" stays
deterministic. A locked security room that is not first is unaffected.
Boss reward and Codex rules are the Phase 5 rules, unchanged.

#### 9.7.8 Pass 6 validation (settles §10 Pass 6 for Phase 6)

Pass 6 is the §10 twelve-check list, verbatim in content and fixed
order: (1) grid/bounds, (2) room geometry, (3) corridor integrity,
(4) room-graph BFS reachability, (5) tile-level flood fill, (6) door
validity, (7) stair placement, (8) locked-door solvability, (9) spawn
safety, (10) content legality, (11) encounter feasibility, (12)
deterministic result. Both connectivity tests run — graph BFS and tile
flood fill catch different bugs (§10). `coherenceCheck` is EXTENDED
with the checks it lacks; it is not replaced or duplicated, and its
existing checks stay verbatim (§9.7.1 F6-7).

Door validity (check 6) covers: every door cell satisfies §9.7.2,
exactly one door per entrance group, no runs of invalid thresholds,
every non-spawn room has ≥1 door, door records match grid door cells
1:1, lock levels/HP/keyIds consistent. Locked-door solvability
(check 8) is a state-space search (tile + collected keys), as §10
requires — tile-only BFS is insufficient: from spawn, with locks as
walls, the stairs must be reachable; every key must be reachable
without its own lock or any unresolved lock; every lock must be
force-reducible to 0 HP (damage rolls are not simulated — reducibility
means HP is finite and force is always available); every locked branch
must be bypassable for the critical path. Fog/metadata consistency is
folded into check 12 and the save/load checks: explored/door state
must serialize as plain JSON and round-trip exactly.

#### 9.7.9 Passes 1–5, metadata, repairs (settles §10 integration)

Passes 1–6 run in the §10 order with the shipped generator as the
implementation of Passes 1–2 (§9.7.1 F6-1/F6-2): Pass 1 room layout
(shipped placer, stable room IDs = array indices), Pass 2 connectivity
(shipped L-shaped carver, spanning tree + loops, connections recorded),
Pass 3 structural tiles (shipped wall model kept — walls generated
after connectivity on void cells adjacent to walkable cells; door
thresholds at recorded portals per §9.7.2), Pass 4 purpose/category +
locked-room eligibility (shipped purpose draw untouched; locked-room
kind metadata + leaf-branch eligibility added here, no draw reordered),
Pass 5 population/dressing/doors/locks/keys (doors, lock levels, kind
and objective draws, key placement, all per §9.7.10 order; eligibility
predicates per §10.3 — failure omits the optional content and records
a diagnostic, never breaks a structural invariant), Pass 6 validation
(§9.7.8).

Tile metadata is the §10.3 contract, verbatim shapes, EXTENDED only
with Phase 6 fields: each cell keeps
`{kind, roomId, corridorId, portalId, flags, structure, hazard,
dressing, pickup, occupant}` (plain JSON, no classes/Sets/Maps), plus
`doorId` (null or a `door:<y>:<x>` ID) on door cells. Room records keep
`{id, x, y, width, height, purpose, category, reservedCells}` with
`lockedKind` added (null or a kind). Door records are §9.7.2.
`walkable` is derived from kind + door state, never stored as a
separate truth. The §10.3 non-overlap assertions stand unchanged.

Repairs: §10's smallest-layer-first repair priority stands
(invalid dressing/pickup → spawn-blocking enemy/hazard →
route-blocking encounter → bad door → broken corridor → bad stairs →
lock deadlock → bad room geometry → reject the floor), with the §10
constraints: no fresh randomness for routine repairs, connectivity
repair recarves only the recorded edge, stair repair never moves the
exit room, lock repair never invents keys. On failure, regenerate
deterministically from `runSeed + attempt`, max 8 attempts (§10
PROPOSED, adopted). After 8 failures the floor FAILS generation with
a diagnostic — no known-good template floor is invented (§9.7.1
F6-9). Never ship a floor that fails a mandatory invariant (§10.6).
The builder documents the exact failure surface (how generation
reports failure in shipped code style) in its report.

#### 9.7.10 Determinism and draw order (settles §10.4 for Phase 6)

Single seeded `mulberry32` stream, `seed = runSeed XOR depth`, fixed
pass order and candidate iteration order, no unseeded randomness, no
random UUIDs/time seeds, generation signature (runSeed, depth,
generatorVersion, rulesetVersion, rngAlgorithmVersion,
tileCatalogVersion) recorded in save metadata, version bumped when a
rule changes. Golden-seed test: canonical JSON from the generator and
from Scout preview must match for the same signature.

Phase 6 draws follow ALL shipped draws in their shipped positions.
The only new draws, in this fixed order, are: (1) locked-room
candidate/eligibility selection in stable room order (seeded draw only
if multiple equally valid locked-room sets remain; otherwise the
deterministic leaf set is used with no draw), (2) locked-kind draw per
locked room in stable room order, (3) lock-level draw per locked door
in stable lock order, (4) objective-choice draw per objective room in
stable room order, (5) key-placement selection per lock in stable lock
order (seeded draw only when multiple equally valid placements remain).
Door/key identity assignment consumes no RNG. Boss eligibility/spawn
uses the shipped Phase 5 draws in their shipped position. Pass 6
validation consumes no RNG. Failed operations consume no RNG beyond
draws explicitly part of the attempt. Inserting a draw earlier in the
sequence cascades into unrelated output — the documented §10.4 trade,
accepted; seeds are not promised stable across versions (§13).

#### 9.7.11 Acceptance contract (P6-* IDs; failure blocks Phase 6)

Every check is required. §9.6's checks are included and expanded, not
replaced. P6-DOOR-PLACEMENT: 3,000-floor sweep, 200 seeds/depth,
depths 1–15, seed series `runSeed = (0x5D5C2026 + i×0x9E3779B9) mod
2^32`, `i = 0…199`, floor seed `runSeed XOR depth`; zero
corner-only/invalid-threshold doors, zero runs of 3+ door cells,
exactly one door per grouped entrance, every room ≥1 door or the
spawn room, 100% structural pass; record seed/depth/room/entrance/
door/lock/key/kind/stairs data. P6-DOOR-STATE, P6-DOOR-LOS,
P6-DOOR-WAKE, P6-LOCK-FORCE (HP 20/40/60, auto-hit, damage/time/noise/
break-open), P6-LOCK-KEY, P6-BYPASS (exact refusal text, zero
time/RNG/noise), P6-LOCK-SOLVABILITY, P6-STAIRS-REACHABILITY,
P6-LOCKED-ROOMS, P6-BOSS-COMPATIBILITY, P6-FOG, P6-FOG-LOS,
P6-SAVE-JSON, P6-LEGACY-MIGRATION, P6-DETERMINISM (same-seed replay
identical, Scout preview matches), P6-COHERENCE (extended
`coherenceCheck` green on the sweep), P6-SCOUT-PREVIEW, P6-ART-WIRING
(existing door/key art loads, poses resolve, no new art),
P6-HARNESS (`beta-testers/run_all.sh`, zero failures), P6-CONSOLE
(zero new Phase 6 console errors). Regressions, unchanged IDs, all
must remain green, none waived or renamed: P4-BREAKDOWN-RANKS,
P4-AMMO-GATES, P4-AMMO-RECIPE, P4-AMMO-POOL, P4-AMMO-LOADOUT,
P4-AMMO-SWITCH, P4-AMMO-AUTO-SWITCH, P4-STATUS-RESIST, P4-ENHANCE-COST;
P5-ROSTER-SWEEP, P5-BOSS-SPAWN, P5-SNIPER-TELEGRAPH, P5-TURRET,
P5-SAVE-JSON, P5-SCOUT-PREVIEW, P5-HARNESS, P5-BALANCE-SIM. No balance
sim gate is added in Phase 6: no enemy stats, damage, or economy
values change in this phase, and the Phase 5 sim gates are regression
checks only.

#### 9.7.12 Verification-only items (builder resolves from shipped code)

(1) Room/corridor representation: how shipped code distinguishes
room floor, corridor cells, and decorative/disconnected tiles, and
where corridor routes are recorded. (2) Door asset SHEETS/loader
keys, paths, and open/closed frame names for the exact keys the
renderer must use. (3) Key pickup schema: shipped pickup record
shape, minimal `keyId` addition. (4) Damage-roll pipeline: equipped
weapon dice roll entry point and seeded roll order for the force
action, including the no-dice fallback. (5) Purpose-draw ordering:
confirm F6-3 position in `generateFloor` before any Phase 6 draw is
placed. (6) Boss eligibility integration: how "first security room"
selection is implemented, and the locked-first-room exclusion point.
(7) Scheduler wake timing: shipped sleep/wake activation semantics
for opening/force noise, and the exact point status ticks run in the
opening turn. (8) LOS helper integration: door checks inside the
existing Bresenham helper, preserving void/corner behavior, and the
`tileAt`/`floor.doors` lookup path. (9) Save schema/migration:
run/floor serialization layout and door/exploration migration,
including legacy defaults. (10) `coherenceCheck` entry point: where
generation must call the extended check, and how its errors surface.
(11) Scout preview/renderer: preview data path and the actor/pickup
draw path where fog visibility is enforced. (12) `findPath`
blocked-tile treatment for closed/locked doors. (13) Corridor-route
recording: whether carved routes are recorded anywhere today, or
whether §9.7.2(4) must be satisfied from grid + rooms alone. (14)
Regression baseline: run the supplied Phase 4/5 IDs before and after
Phase 6. (15) §10.5 items, now settled as F6-1/F6-2/F6-7 above —
re-verify, do not re-decide. Follow shipped code over this section on
any verification-item conflict, and flag every discrepancy in the
report; a conflict never silently reopens a settled design decision.

#### 9.7.13 Implementation order

(1) Verify §9.7.12 items. (2) Freeze tile/room/door/key metadata +
deterministic IDs. (3) Threshold classification + entrance grouping.
(4) Door state/movement/LOS/pathfinding/wake. (5) Key placement /
force / lock levels / Bypass refusal. (6) Locked-room kinds + Phase 5
purpose/boss compatibility. (7) Exploration serialization + renderer
visibility. (8) Extend `coherenceCheck`; wire Pass 6 into generation.
(9) Placement/solvability/determinism/fog/save-load sweeps. (10) All
Phase 4/5 regressions + full harness. (11) `PHASE6-REPORT.md` with
seeds, distributions, presence counts, acceptance results, and every
failure/diagnostic. Working tree only; no commits or pushes; no new
art; no Phase 7 work; no enemy-stat, damage, or economy changes.



**AMENDED 2026-10-28 (user's word, "yeah let's do it").** Sources: the ChatGPT
share the user sent (chatgpt.com/share/6ae204b4… — principles only, no numbers
or code) plus two co-planning rounds in the signed-in ChatGPT chat "Generator
Specification Details" (chatgpt.com/c/6ae20835…), round 1 ~07:38 PDT and the
reconciliation round ~07:41 PDT. Paraphrased grounding notes live in
`GENERATOR-SPEC-GROUNDING.md`. Everything numeric in this section is PROPOSED
here, not quoted from ChatGPT. This section is the Phase 6 generator spec,
APPROVED 2026-10-28 ~07:51 PDT (user's word, "Perfect. Approved"). Phase 6
builds in sequence after Phases 1–5, on the user's word.

### 10.1 The decision order

The generator must answer, in this order — never "what tile goes in this cell?"
first: (1) what kind of space is this; (2) what connects to it; (3) what is
this room's purpose; (4) what must the player be able to reach; (5) which
objects logically belong here; (6) how can this room be varied without breaking
navigation or gameplay. Structure stays deterministic in its logic; layout,
loot, encounters, and detail stay randomized. Replayability without losing
spatial readability is the whole point.

### 10.2 Six passes with ownership

Numbering follows the ChatGPT spec (purpose assignment is Pass 4, population
is Pass 5). The earlier draft numbered identity as Pass 2 — that mapping is
superseded; §9 references in this doc use the numbering below.

| Pass | Owns | May modify | Must preserve |
|---|---|---|---|
| 1. Room layout | Room rectangles, IDs, spawn reservation | Room geometry during construction | Grid bounds, non-overlap |
| 2. Connectivity | Room graph, tree/loop edges, corridors, portals | Connectivity and corridor cells | Room interiors and boundaries |
| 3. Structural tiles | Walls, floor, door thresholds, stairs | Structural kinds in allocated cells | Room geometry, graph connectivity |
| 4. Purpose + category | Room purpose, category, population profile | Room metadata | Geometry, portals, connectivity |
| 5. Population + dressing | Enemies, pickups, hazards, dressing | Optional content layers | Structural kinds, reserved cells, required routes |
| 6. Validation | Validation results, approved repairs | Only the layer a violation implicates | All previously established guarantees |

A later pass must never silently break an earlier pass's guarantees:
decoration cannot block a corridor, loot cannot spawn inside a wall, a locked
door cannot make a required objective unreachable. The seam for build Phases
1–4: they place content through the existing placement functions
(`placePickup`, enemy placement loops); Phase 6 refactors those functions
behind the same signatures plus eligibility predicates (§10.3), so Phases 1–4
need no rework when the passes land — but floor layouts for a given seed may
change, which is acceptable per §13 (seeds are not promised stable across
versions; `scoutPreview` stays exact because it uses the same generator).

**Pass 1 — Room layout.** Exact order: (1) initialize all 2,640 cells to void,
empty room list, reservation grid, stable ID counter; (2) choose room count
6–10; (3) reserve room ID 0 as the spawn room and place it first — a
structural designation, not a room chosen after the fact; (4) place the rest
in ascending ID order, dimensions before positions, candidates tested in
deterministic shuffled order; (5) clearance: reject candidates outside the
legal margin, overlapping existing rects, or violating the separation rule
(PROPOSED: 2-tile map margin, 1 tile between outer rects — VERIFY against the
shipped placer before adopting, §10.5); (6) commit IDs immediately, never
renumber; (7) bounded fallback: enumerate remaining legal placements in
stable order (y, then x, then dimensions), shrink toward 6 rooms / smallest
size if needed, never below the minimum, never accept overlaps. Guarantees:
all rooms in bounds, unique stable IDs, no overlaps, dimensions in bounds,
defined interior/perimeter, spawn reserved, no corridor or decoration has
touched the layout. Pass 1 does not guarantee connectivity — that is Pass 2.

**Pass 2 — Connectivity and corridors.** Build a candidate graph over room
pairs with a deterministic cost (Manhattan distance between closest rectangle
points + a fixed awkward-routing penalty λ), edges sorted by (cost, idA,
idB) — tie-breakers must never depend on iteration order. Deterministic
Kruskal or Prim spanning tree (N−1 edges); then 1–2 loops, each a genuinely
new route (reachable rooms, reasonable length, no interior crossings, no
illegal wall/door crossings, no trivial one-tile detour; if no legal loop
exists, keep the tree). Carving order per edge: choose boundary portals
(perimeter cell with an interior neighbor, shortest valid route first, stable
directional tie-break); route with a fixed-tiebreak pathfinder (VERIFY what
the shipped carver is before choosing A*/Dijkstra, §10.5), treating unrelated
room interiors as obstacles; commit the path, merging into existing corridors
without overwriting room floors, walls, doors, stairs, or reserved cells; one
door per portal; record the connection (room IDs, type, portals, corridor
cells, route length). **Door rule (DECIDED shape, §9.1):** a door exists only
at a recorded portal where a corridor crosses a room boundary — normally two
thresholds per connection, portals reused rather than duplicated. Guarantees:
every room connected, tree route from spawn to every room, loops only add,
every corridor cell belongs to a recorded route or an intentional merge, door
positions equal recorded portals.

**Pass 3 — Structural tiles.** Walls are generated AFTER connectivity, on
void cells adjacent to walkable floor/corridor cells — the shipped wall model
is KEPT (reconciliation verdict; the perimeter-rectangle model was rejected
as an unnecessary rewrite). Floors fill room rects; door thresholds sit at
recorded portals; stairs go in the exit room. Walls are room edges only, never
arbitrary floor clutter.

**Pass 4 — Purpose and category.** Purpose (what the place was: workshop,
reactor, storage, security, arena, ordinary) is separate from category
(gameplay role: spawn/combat/loot/structure/hazard/empty); one purpose can
map to several categories. Assignment order: reserve the spawn room (spawn
category; workshop-like dressing only, never arena or mandatory hazard);
reserve the exit room (farthest by shortest-path distance in the room graph,
route length as tie-break; its purpose cannot block the stairs); shuffle
eligible rooms in stable ID order; apply composition rules (PROPOSED: at most
one arena per floor); weighted selection by depth and room size; derive
category + population profile; populate only after assignment. The profile is
plain JSON: purpose, category, enemy/loot/dressing/hazard tag arrays,
`minOpenCells`. Tags filter existing content only — no new mechanics (a
workshop does not repair the player; a reactor does not grant power control).
If a profile has no valid candidate, fall back to the category's general pool;
never place incompatible content to satisfy a tag; if fewer rooms than
purposes, some purposes are simply absent.

**Pass 5 — Population and dressing.** Enemies, loot, keys, consoles,
objectives, hazards, and dressing go through eligibility predicates (§10.3).
**Failure beats forced placement:** if no legal cell exists, omit the optional
content and record a diagnostic — never break a structural invariant to fill
a quota. Variant coherence rules (PROPOSED, the "less chaotic" rules):
floors use one dominant variant per room (at most 2 accent cells) and one per
corridor run; walls use one variant per contiguous wall run, corner art on
corners; dressing clusters in 2–3 cell groups against walls, consoles against
a wall edge facing inward, barrels in pairs near storage flavor, never in a
room's spawn→door traffic line (PROPOSED 1-cell clearance); loot-room caches
against walls, salvage anywhere walkable, keys on a pedestal cell, never under
dressing; enemies in combat rooms only, never within 1 cell of spawn, never
stacked on pickups, elites keep a clear 3-cell firing lane.

**Pass 6 — Validation and repair.** `coherenceCheck` exists today
(`core.js:526`) but is only called from tests, never inside generation
(GROUNDED). Phase 6 wires it in as this pass, extended to twelve checks in
fixed order: (1) grid/bounds, (2) room geometry, (3) corridor integrity,
(4) room-graph BFS reachability, (5) tile-level flood fill, (6) door
validity, (7) stair placement, (8) locked-door solvability, (9) spawn safety,
(10) content legality, (11) encounter feasibility, (12) deterministic result.
Both connectivity tests run — graph BFS and tile flood fill catch different
bugs. Locked-door solvability is a state-space search (tile + collected
keys); tile-only BFS is insufficient. Issues carry stable IDs and cells,
sorted by (severity, code, y, x, roomId) before repair. Repairs fix the
smallest offending layer first, in priority order: invalid dressing/pickup →
spawn-blocking enemy/hazard → route-blocking encounter → bad door → broken
corridor → bad stairs → lock deadlock → bad room geometry → reject the floor.
Relocation candidates in fixed order (same room, Manhattan distance, y, x).
No fresh randomness for routine repairs. Connectivity repair recarves only
the recorded edge; stair repair never moves the exit room; lock repair never
invents keys. On failure, regenerate deterministically from
`runSeed + attempt` (PROPOSED: max 8 attempts, then a known-good template
floor) — deterministic per (runSeed, depth) so `scoutPreview` stays exact.

### 10.3 Tile metadata contract (plain JSON)

Each cell is a structural kind plus independent content layers. Shapes are
plain JSON only — arrays, primitives, nulls — no classes, Sets, or Maps, so
everything survives `serializeRun` round-trips:

```json
{"kind": "floor", "roomId": 0, "corridorId": null, "portalId": null,
 "flags": [], "structure": null, "hazard": null, "dressing": [],
 "pickup": null, "occupant": null}
```

Rooms carry `{id, x, y, width, height, purpose, category, reservedCells: []}`
(center derived, not stored). Connections carry `{id, roomA, roomB, type,
portalA, portalB, corridorCells: [], routeLength}` with one fixed convention
for whether `corridorCells` includes the portal endpoints. Flags are string
arrays (e.g. `["PROTECTED_SPAWN"]`); entity references are IDs, never live
objects; the grid is a fixed 44×60 row-major array with a documented
coordinate convention; the schema is validated after load and after
generation.

| Kind | May host | May connect to | Must never |
|---|---|---|---|
| void | Nothing | Nothing | Hold a route, room, door, pickup, hazard, occupant |
| floor | Spawn, enemies, pickups, dressing, permitted hazards | Orthogonal floor, doors, stairs, corridor | Share a cell with a wall or another exclusive structure |
| corridor | Player/enemies when clear, pickups, limited dressing, permitted hazards | Other corridors, valid doors, floor at portals | Become a wall, stairs, or unrelated room interior |
| wall | Wall visual details only | Adjacent walls; a door at a designated portal | Be walkable, host a pickup, or be carved by decoration |
| door | Door structure + state visuals | The two designated portal sides, per door state | Appear at arbitrary corridor cells, overlap stairs, be untracked |
| stairs | Stair visual + exit interaction | Floor beneath, plus the walkable route | Block the only tile in a narrow corridor, overlap a blocking door/hazard |
| hazard | Hazard instance on a legal underlying cell | The underlying walkable network | Replace required connectivity, overlap protected spawn/exit |

Hazard is a content layer over floor/corridor, not a structural kind that
erases terrain info. Non-overlap assertions: void holds nothing; walls hold no
occupant/pickup/hazard; a door cell is never stairs or a pickup; a stair cell
holds no blocking structure, damaging hazard, or enemy; spawn overlaps no
enemy, blocking dressing, or hazard; two exclusive structures never share a
cell; a pickup and an enemy never share a cell unless the entity model
explicitly supports it; a corridor cell is never reclassified as room
interior by a later pass; no dressing/loot/encounter pass changes a
structural kind. Placement API: every placer receives an eligibility
predicate and returns success/failure (e.g. `canPlacePickup` requires kind in
{floor, corridor}, no existing pickup/occupant/structure, and no
PROTECTED_SPAWN / DOOR_THRESHOLD / STAIR_CELL / BLOCKED flag); exceptions for
loot-container anchors live in the content definition, not scattered across
the generator.

### 10.4 Determinism contract (single stream, kept)

**Verdict (reconciliation round): keep the single RNG stream.** Per-stream
isolation is deferred until stable layouts-despite-decoration-changes is
actually needed, and then only with a versioned RNG scheme. The contract:

1. One RNG state, passed explicitly through every generation function.
2. Fixed pass order and candidate iteration order.
3. Candidates sorted before any order-sensitive operation.
4. No unseeded randomness, runtime-dependent hashes, or unordered traversal
   in generation decisions.
5. Every added/removed random draw is a potential generation-version change.
6. Generation signature recorded in save metadata: runSeed, depth,
   generatorVersion, rulesetVersion, rngAlgorithmVersion, tileCatalogVersion.
   Bump a version when a rule changes instead of silently changing a seed's
   floor.
7. Golden-seed test: canonical JSON output from the game generator and Scout
   preview must match for the same signature.

One honest limit: a single stream reproduces the same floor for the same code
and draw order, but inserting a new draw earlier in the sequence cascades
into unrelated output. That is the documented trade, accepted until the
deferral trigger above is hit. Required regression tests: same-seed,
cross-preview, repair determinism, invariant sweep across seeds/depths,
fallback termination, locked-door reachable/unreachable keys, content-density
(cannot reduce reachability) — compared on canonical serialized data, never
screenshots.

### 10.5 Verify in code before the Phase 6 build

- Room margin from the grid edge and the exact clearance rule in the shipped
  placer (ChatGPT proposed 2-tile margin / 1-tile clearance — proposals, not
  facts about our code).
- What the shipped corridor carver actually is (directional/L-shaped vs
  pathfinder) before choosing fixed-tiebreak A*/Dijkstra.
- What `coherenceCheck` (`core.js:526`) already covers, so Pass 6 extends it
  rather than duplicating it.

### 10.6 Phase 6 build order (8 steps)

1. Portal-based doors (§9.1). 2. Stable room/corridor/portal IDs + immutable
topology records. 3. Pass 1 fallback (always terminates, 6–10 valid rooms or
a clear generation failure). 4. Pass 2 graph connectivity (tree, then loops).
5. Room-purpose profiles. 6. Metadata contract + eligibility predicates.
7. Pass 6 validation (bounds, geometry, graph + tile reachability, doors,
stairs, spawn safety first; lock-state validation with keys). 8. Deterministic
repairs + regression tests. Never ship a floor that fails a mandatory
invariant.

## 11. Cross-cutting

### 11.1 Save migration

No key bump. `ensureHub` / `deserializeRun` default every new field
(skills, mech skills, energy/heat, equipment instances, door states,
explored set, materials, per-type ammo). Legacy saves load with: empty
skills, Common +0 blaster, all doors open, all rooms explored, zero
materials, standard-ammo-only pools. A save written by a newer phase loads
in an older build only as far as JSON tolerates it — forward compatibility
is not promised; backward compatibility is, per the existing pattern.

### 11.2 Balance method (unchanged, extended per phase)

`sim_ammo.js` is extended, never replaced: Phase 1 (dice + drop tables),
Phase 2 (gear in the damage pipeline), Phase 4 (ammo types + statuses).
Every phase reports distributions (p10/median/p90), never averages alone,
with a chart. Playtest numbers stay labeled as starting points until a
playtest pass weighs in — the doc never calls balance "done" on sims alone.

### 11.3 Test plan (every phase)

Node tests in `test.js` (data tables, distributions over sweeps, save/load
round-trips, legacy defaults, executor refusals) + a browser verify script
per phase (real clicks, real shots, real screenshots, zero console errors)
+ the full harness (`beta-testers/run_all.sh`) green before delivery. No
waivers: a phase with a failing harness check does not ship, per the
standing rule from the tap-target fix.

### 11.4 UI surface inventory (what exists, what each phase touches)

HUD one-liner (`index.html`, fits at 390px — see §6.4) · quickbar 4 slots
(FIRE/+HP/FOOD/KIT) · bottom action bar (wait/wrench/menu/search/bag) ·
side-stack (Recenter/Log, 44px targets) · modal system (`showModal`) · Bag
modal · hub screen + 6 stations · stairs panel · combat log · canvas
render (grid pass + y-sorted drawables pass + floats). Phases touch: Bag
(1, 2, 3, 4), hub stations (3, 4), HUD (3, 4 — placement per §6.4), render
passes (1, 2, 5, 6). No new top-level screens; the hub gains one station
(Instructor, Phase 3) and the Salvager gains Breakdown (Phase 4).

### 11.5 Content & art budgets

- **Authored data (no art):** 12 weapon defs, ~12 gear defs (4 armor / 4
  shield / 4 utility), 12 pilot skills, 6 mech skills, 4 ammo types,
  5 status definitions, 6 enemy type entries, 1 boss entry, room flavor
  table (5 flavors), tier/upgrade tables. All data-driven; the doc's tables
  are the authoring checklist.
- **Art to generate (sprite rule: templates first):** 1 weapon icon set
  (12), 1 gear icon set (12), 1 key icon (exists — verify before generating),
  lock marker (drawn, not sprited), fog overlay (drawn, not sprited).
- **Art to wire only:** 5 enemy sheets + boss sheet + poses (exist in
  `sprites/`), door open/closed art (batch-3 keys exist), key sheet (exists).
- **No new art:** no new enemy models, no new chassis, no new biomes.

## 12. Kill list (explicitly NOT in these six phases)

Factions, contracts, authored quests (Radio Operator stays rumors-only) ·
vehicles in gameplay · hacking/security minigames · tower defense · multiplayer
or shared leaderboards · chassis swaps (tank/assault/artillery/spider) · player
status effects (enemies only, Phase 4) · corrosive/explosive ammo as craftables
· theme hazards beyond spikes · a minimap · real-time anything · new biomes
beyond the existing 10-theme cycle. Deferred is not deleted: each item keeps
its home (MECHANICS-PLAN §8 deferred list, or a line here) and returns only
by a new scope call.

## 13. Build order & acceptance summary

Phases build in order 1 → 6; each phase delivers only when its acceptance
section (§4.6, §5.4, §6.5, §7.5, §8.4, §9.6) is green, including its sim gate
where one exists. The wall backing fix (2026-10-28) and the door-placement
analysis are already done/grounded and do not wait for Phase 6. Seed
stability across versions is NOT promised: restructuring passes may change
which floor a seed produces; `scoutPreview` stays exact because it uses the
same generator as the game.

## 14. Open decisions for the user (proposed defaults in the text)

1. Tier names/colors — accept the §4.2 table, or rename/recolor?
2. Weapon/gear pickup art — generate a new icon set now (sprite rule), or ship
   Phase 1 with ring + letter markers and generate art in the Phase 2 pass?
3. Energy/heat HUD placement — collapsing second line when non-full, or
   Bag-only (§6.4)?
4. Ammo pools — RESOLVED 2026-10-29 (ChatGPT co-planning round, §7.6.3): per-type pools.
5. Phase 3 tree scope — 3 trees now, 4 deferred (proposed), or a different cut?
6. Theme hazards — RESOLVED 2026-10-29 (ChatGPT co-planning round, §8.5.5): spike-only in Phase 5; lava/water deferred.
7. Boss spawn rule — RESOLVED 2026-10-29 (ChatGPT co-planning round, §8.5.4): depth 5+, security-purpose rooms only, max 1/floor, conditional presence, no fallback.
8. Fog granularity — RESOLVED 2026-10-29 (§9.7.6): room-granular reveal.
9. Co-planning rounds — RESOLVED for Phase 6 2026-10-29 (user's word): settle without ChatGPT, §9.7; no further ChatGPT round before building.
10. Tessarium 2.0 (free tile editor, Linux build, Puppet Warp) — evaluate
    after Phase 6 for tile builds; adopt only if it proves the quality of
    our builds. Deferred per the user's word 2026-10-28; a reminder is owed
    after Phase 6.

