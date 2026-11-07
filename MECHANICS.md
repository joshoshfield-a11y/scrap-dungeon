# Scrap Dungeon — mechanics plan (adapted)

Source of the starting sketch: a ChatGPT schema the user shared on
2026-10-26 (https://chatgpt.com/share/6adf8863-e3dc-83e8-ac3f-b563face9642).
This file is NOT a copy of it — it is our own adaptation of its
ideas to the game we are actually building. Where the sketch and
our DESIGN.md disagree, DESIGN.md wins, and the disagreement is
flagged below instead of silently resolved.

## What we are taking from the sketch

- **Data-driven content.** Items, skills, enemies, recipes, quests,
  and dialogue are data records with stable ids, types, tags,
  requirements, and effects — not one-off code per entry. New
  content should be addable without rewriting core systems.
- **Pilot vs mech, split.** Pilot progression (level, XP, skill
  points, traits, reputation) is persistent and personal. Mech
  capability (chassis, armor, hull, shields, energy, heat,
  hardpoints, mass) is the physical platform and its loadout.
  Derived stats are recomputed from base + modules + perks,
  never stored separately where they can go stale.
- **One skill executor.** Skills are definitions (category,
  targeting, range, energy/heat cost, cooldown, effects,
  upgrade tracks, requirements) run through a single pipeline:
  validate → pay costs → execute → apply effects → emit
  events → update HUD. Categories: combat, mobility,
  engineering, exploration.
- **Damage pipeline, in order.** Hit test → raw damage →
  resistances → armor → shields → hull → status effects →
  death/loot. Damage types: kinetic, explosive, energy, thermal,
  corrosive, EMP. Status effects with duration, stacking, and
  cleanup: burning, shocked, corroded, overheated, staggered,
  jammed, marked — one shared manager, not per-enemy logic.
- **Dungeon pipeline.** Seed → theme → room graph → room types
  → layouts → doors/corridors → enemies/loot/traps → validate
  reachability → deploy. Invalid maps regenerate, never ship.
  (This matches MAPS.md; MAPS.md is the concrete version.)
- **Loot and salvage.** Equipment, consumables, materials,
  components, blueprints, and relics are distinct categories.
  Instances carry their own affixes/durability/history;
  definitions stay clean. Dismantling returns materials.
- **Crafting gates.** A recipe only consumes inputs after
  recipe, ingredients, station, and requirements (blueprint,
  pilot skill) all validate. Upgrade paths: repair, refit,
  enhance, modify, salvage, overclock (power for heat risk),
  research (new recipes).
- **Dialogue as a graph.** Nodes with choices, conditions
  (quest state, trait/skill, reputation, inventory, flags,
  bosses defeated), and effects routed through validated
  commands — dialogue text never mutates state directly.
  Effects can start/complete quests, change reputation,
  grant/remove items, unlock recipes/services, open shops,
  reveal locations, or set flags.
- **Quests as objectives.** Collect/kill/reach objectives with
  an all/any completion rule, rewards (unlocks, currency),
  and a Locked → Available → Active → Completed state machine.
  Progress is tracked independently of dialogue text.
- **Run vs profile, split.** Run state (dungeon, room, run
  equipment, temporary perks, unbanked salvage, modifiers) dies
  with the run. Profile state (unlocked chassis, blueprints,
  pilot unlocks, banked resources, hub upgrades, story flags)
  survives. Death loses unbanked salvage and run-only upgrades.
- **Event bus.** Systems talk through typed events (run
  started, room entered, enemy killed, item collected/crafted,
  quest updated, boss defeated, run failed, etc.) with
  transaction guards so rewards cannot be granted twice.
- **Save discipline.** Content definitions separate from
  mutable state; a save version with migration; atomic writes;
  a backup before incompatible migrations.
- **Build order.** 1) Playable foundation, 2) combat + dungeon
  loop, 3) persistent progression, 4) narrative content,
  5) depth and polish. This matches our Slice 1/2/3 plan.

## Where the sketch does NOT match our game (decisions still open)

- **Real-time vs turn-based.** The sketch assumes real-time
  top-down action combat. Our DESIGN.md is turn-based and
  grid-based. Skills, cooldowns, and heat therefore need
  turn-based costs (actions/turns, not seconds) — that
  translation is a design decision, not a copy job.
- **Extraction vs stairs-down.** The sketch banks salvage on
  extraction and loses unbanked salvage on death. Our loop
  descends via stairs-down and dies permanently. Whether
  stairs-down banks salvage, or only hub return does, is
  undecided — it changes the whole risk curve.
- **Tower defense.** The sketch lists it as a supported
  system. It is not in our Slice 1–3 scope. Defer, do not
  build it into the foundation.
- **Hub NPCs.** The sketch assumes a hangar/hub with NPCs
  (a repair merchant, etc.). Our hub is not yet designed —
  dialogue and quests need a hub cast before they are real.
- **Numbers are placeholders.** Every stat, cost, and drop
  rate in the sketch is an example, not a balance decision.
  None of them are adopted here until playtested.

## ADOPTED 2026-10-26: Pixel Dungeon time system

This is not actually a pivot away from turn-based — it is the
specific turn-based system Pixel Dungeon uses, and it fits our
game better than strict alternating turns. User adopted it
2026-10-26; DESIGN.md updated to match:

- **Time only moves when the player acts.** Idle = frozen.
  No enemy moves, no status ticks, no trap timers while the
  player is thinking. That is the whole point: planning time
  is free, action time is not.
- **Every action has a time cost, not a turn count.** Move
  1 cell = 1 time unit. A heavy attack, a dash, a skill, or
  reloading might cost 2–3. Fast chassis / light weapons cost
  less; heavy chassis / big guns cost more.
- **Actors run on a time queue.** After the player spends
  time, every enemy whose next action time has arrived acts,
  in time order. A fast drone may act twice per player move;
  a slow brute may act every other move. Speed becomes a
  real stat, not just flavour.
- **Waiting is an action.** Resting, repairing in place, or
  just passing time costs time units and lets enemies act —
  so standing still to heal is a calculated risk, not a
  free reset. Same for searching a room or disarming a trap.
- **Effects tick in time, not turns.** Burning ticks per
  time unit, heat cools per time unit, energy regens per
  time unit. A skill that costs heat but saves time can be
  worth more than a cheap, slow one.
- **What this changes from strict turns:** no "my turn, your
  turn" alternation; no real-time pressure at all; enemy
  speed, action costs, and waiting become balance levers.
  It also resolves the open skill-cost question: skills cost
  energy + heat + TIME, and time is the shared currency.
- **What it does not change:** grid movement, bump combat,
  8-direction facing, stairs-down, permadeath, salvage.
  The map, tiles, and sprites are unaffected.

Adopted: DESIGN.md now reads Pixel Dungeon time system, and
the skill schema gains a `time_cost` field alongside energy
and heat. Still open: whether stairs-down banks salvage
(banking rule), and the hub NPC cast — both needed before
dialogue/quests are real.

## Full plan — MECHANICS-PLAN.md (2026-10-26)

The full plan now lives in MECHANICS-PLAN.md. It is OUR plan,
not the ChatGPT draft wholesale: the user has not read all of
that draft, so only ideas that fit this game were taken (see
its Section 8 for adopted / deferred / not-adopted).

Decided in that plan: (1) PD time costs are energy + heat +
time; (2) salvage banking = stairs-down banks 25% (upgradeable
to 40%/55%) on descend, extract returns to hub with all carried
salvage, death drops a one-at-a-time recoverable wreck, rare
finds are permanently recorded in the Codex; (3) hub NPC roles
proposed as options, names NOT canon (mechanic, salvager,
researcher, armorer, scout, radio operator).

Next: user picks/renames/cuts NPCs, then Phase 1 (scheduler +
one expedition loop) can be built against MECHANICS-PLAN.md +
MAPS.md + DESIGN.md.
