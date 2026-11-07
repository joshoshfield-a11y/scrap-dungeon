# SCRAP DUNGEON — full mechanics plan (2026-10-26, APPROVED by user 2026-10-26: "That sounds golden")

Status: approved as the plan. NPC names remain placeholders, not canon.
Phase 1 build starts only on the user's explicit go.

This is OUR plan, built from DESIGN.md, MAPS.md, MECHANICS.md, and the
sprites that actually exist. A ChatGPT draft the user shared was used
only as an idea source, and only where it fits this game. The user
has not read all of that draft, and this plan does NOT adopt it
wholesale. Section 8 lists what was taken, deferred, and rejected,
so nothing from it sneaks in as canon by accident.

## 0. The game in one paragraph

Isometric, grid-based dungeon crawler starring mechs. You descend
procedural floors, fight on the Pixel Dungeon time system (time
advances only when you act), salvage everything you can, and die.
Death is a setback, not a full reset: what you banked stays banked,
your chassis and weapon unlocks stay unlocked, and your wreck waits
to be recovered. The hub grows as you survive deeper and bring back
deeper technology. High risk, tactical time, salvage economy.

## 1. DECISION 1 — Salvage banking (decided 2026-10-26, numbers are
##    playtest starting points, not final balance)

Salvage exists in two states, and the distinction is the whole loop:

- **Carried salvage (at risk).** Raw scrap, components, and
  unprocessed materials you are holding right now, on this floor.
  It is lost on death, except for the wreck rule below.
- **Banked salvage (safe).** Salvage secured in the hub vault.
  It persists permanently across runs and death, and it is what
  you spend on repairs, crafting, and hub upgrades.

At every stairs-down, you face the same choice, and it is the
game's central decision:

- **Descend.** A portion of your carried salvage is automatically
  banked before you go deeper. Starting value: **25%**, upgradeable
  through hub progress to 40%, then 55%. The remaining 75% (or
  less, after upgrades) stays carried and at risk on the next,
  harder floor. Deeper floors pay better, so descending is how
  you get rich — and how you lose what you are holding.
- **Extract.** End the expedition and return to the hub alive,
  keeping **all** carried salvage intact. You give up the deeper
  floors and their better loot. Extracting is the safe play;
  descending is the gamble. Neither is free.

On death:

- Your mech becomes a wreck on the floor where you died, using
  the wreck models already built for all 14 characters. The
  wreck holds your equipped gear and your unbanked salvage.
- Your next expedition can recover that wreck — but only one
  wreck exists at a time. If you die again before recovering
  it, the old wreck is destroyed and its contents are gone.
  This is deliberately harsh: it makes the recovery run tense
  instead of a chore.
- **Codex rule.** Rare, unique discoveries are permanently
  recorded in the Codex the moment you find them, even if the
  physical item is later lost. Knowledge survives death; stuff
  does not always.

Why this fits: it uses the wreck sprites we already built, it
makes stairs-down a decision instead of a corridor, and it
keeps permadeath meaningful without making a death erase an
evening of progress. The percentages are the first thing to
playtest, not a promise.

## 2. DECISION 2 — Hub NPCs (roles proposed, names NOT canon)

The hub needs people who each unlock a system, not decoration.
The six roles below come from the ChatGPT draft, but their names
are that draft's placeholders and are NOT adopted as final — the
user has not approved them. Treat this as an options list for
the roster, with each role's system attached so the user can
keep, rename, merge, or cut any of them.

1. **The Mechanic (draft name: RUST).** Repairs mech frames,
   restores wrecks, upgrades chassis, unlocks vehicle
   modifications. System: mechs and equipment.
2. **The Salvager (draft name: MOTH).** Buys and sells scrap,
   identifies recovered components, offers salvage contracts.
   System: economy and loot.
3. **The Researcher (draft name: HEX).** Studies dungeon
   artifacts, unlocks the technology tree, analyses enemy
   weaknesses, develops experimental modules. System: research
   and discovery (Codex).
4. **The Armorer (draft name: GEARBOX).** Crafts weapons,
   ammunition, armor, attachments, combat consumables.
   System: crafting and combat builds.
5. **The Scout (draft name: VEIL).** Reveals dungeon
   intelligence, maps discovered sectors, identifies threats,
   offers exploration missions. System: exploration and recon.
6. **The Radio Operator (draft name: DEAD AIR).** Connects you
   to factions, bounties, procedural contracts, rumors, and
   branching dialogue quests. System: quests, factions, story.

Hub growth rule: an NPC's services expand as you bring back
deeper technology and Codex entries, not just as you spend
salvage. A deeper floor should unlock a new service, a new
contract type, or a new dialogue branch — not just a bigger
number. Factions and authored quest chains are later content,
not Slice 1.

## 3. Pixel Dungeon time system (already adopted)

- The world is frozen while you think. Menus, inventory, and
  target selection cost no time.
- Moving, attacking, reloading, using an item, interacting
  with a mechanism, and driving a vehicle cost time units.
  Move one cell = 1 unit; heavier actions cost more.
- One central scheduler, not per-enemy turn loops. Every
  actor (player, enemy, hazard, timed mechanism) has a next
  action time; after the player spends time, every actor
  whose time has arrived acts, in time order.
- Faster actors can act more than once per player action;
  slower ones less often. Speed is a real stat.
- Skills carry three costs: energy, heat, and time. Time is
  the shared currency that makes a fast, hot skill different
  from a slow, cheap one.
- Action pipeline, shared by everything: validate, calculate
  cost, resolve, advance clock, process eligible events,
  update state.

## 4. Combat and enemies — OUR roster, not the draft's

Slice 1 uses the enemies that already exist and are already
rigged, not new archetypes invented by the draft:

- **Raider (chaser).** Fast melee pressure, punishes bad
  positioning.
- **Drone (swarmer).** Small, fast, weak alone, dangerous in
  numbers.
- **Brute (bruiser).** Slow, armored, forces you to spend
  resources or disengage.

Later floors add the rest of the built roster in depth order:
turret, flyer, shielder, sniper, bomber, then the boss. No new
enemy sprites are needed for any of this.

Combat basics: move to an empty tile, bump to attack,
8-direction facing, line of sight, range, armor, accuracy,
damage. Telegraphs for heavy enemy attacks come after Slice 1
is playable. Enemy AI uses one shared behavior framework:
idle, patrol, investigate, pursue, attack, retreat — with
per-type priorities, not per-type code.

## 5. Skills and progression (deferred detail, not Slice 1)

The draft's seven skill trees (scavenging, engineering,
combat, piloting, survival, recon, hacking) are a reasonable
shape for later, but they are NOT locked in. Slice 1 needs
only: experience from combat, exploration, and discoveries;
chassis and weapon unlocks as meta-progression; and
equipment-defined abilities that make builds differ.

Rules that are decided now: skills improve through use as
well as level choices; milestones unlock new abilities, not
just bigger numbers; respecs cost resources, they do not
permanently punish experimenting. Piloting matters when
vehicles matter (surface/hub content, later); hacking matters
when locked doors and security systems matter (later floors).
Neither is a Slice 1 system.

## 6. Crafting and equipment (data-driven, later)

One recipe system for everything: ingredients, quantities,
station requirement, output, unlock condition. Categories:
weapons and mods, armor and defensive modules, healing and
utility consumables, repair kits and components, chassis
upgrades, vehicle modules, keys and tools. Three material
tiers: common scrap, specialized components, rare deep
technology. Crafting is Phase 3 in the build order below,
not Slice 1.

## 7. Dungeon generation and floors

MAPS.md is the source of truth and is unchanged: seeded
room graph, corridors, doors at room entrances, theme walls,
hazards (lava, traps, grates, debris), loot, enemies, points
of interest, stairs-down in the farthest reachable room, and
the coherence checks (flood-fill reachability, no exit-less
rooms, no dead-end corridor over 4 cells without loot,
enemies spread across combat rooms, never in or next to the
spawn room). Difficulty scales by enemy composition, terrain,
and resource scarcity as well as numbers — not just inflated
health.

## 8. What was taken from the ChatGPT draft, and what was not

ADOPTED (fits our game, uses our assets):
- Stairs-down partial banking + extract-vs-descend choice.
- Death wreck recovery, one wreck at a time, second death
  destroys it.
- Codex permanent recording of rare finds.
- Central time scheduler, action pipeline, and the rule that
  thinking costs no time.
- Functional hub NPC roles (mechanic, salvager, researcher,
  armorer, scout, radio operator) as an options list.
- Data-driven recipes, hub growth tied to recovered tech.

DEFERRED (reasonable later, not now):
- Seven skill trees in full, factions, authored quest
  chains, procedural contracts, vehicles in gameplay,
  hacking/security systems, telegraphed heavy attacks.

NOT ADOPTED (does not fit our concept or our assets):
- The draft's enemy archetypes (Scrap Rat, Sentry Drone,
  and a separate Scrap Brute as new designs). Our raider,
  drone, and brute already fill those roles and are built.
- Anything real-time. Our combat is time-based, full stop.
- Tower defense, which appeared in an earlier draft schema
  and is out of scope.
- NPC names as canon. RUST, MOTH, HEX, GEARBOX, VEIL, and
  DEAD AIR are placeholders until the user picks or renames
  them.
- Any numbers in the draft as final balance. All numbers in
  this plan are playtest starting points.

## 9. Build order (unchanged from the plan's spine)

- Phase 1 — Dungeon simulation: one seeded floor, movement,
  bump combat, central time scheduler, raider/drone/brute,
  stairs-down with the descend/extract choice.
- Phase 2 — Expedition economy: inventory, salvage drops,
  banking, death wrecks, extraction, save/load with run
  state kept separate from hub state.
- Phase 3 — Hub and crafting: NPC interactions, basic
  recipes, repairs, equipment, persistent upgrades.
- Phase 4 — Progression and content: skill trees, multiple
  floors, contracts, branching dialogue, vehicles, advanced
  combat.

Slice 1 acceptance: a player can enter a generated floor,
explore, fight all three Slice 1 enemies, collect salvage,
reach the stairs, choose descend or extract, die, and
restart without breaking the simulation or the save.

The immediate priority, when the user says go, is Phase 1:
the action scheduler and one complete expedition loop.
Everything else builds on that tested foundation.
