# SCRAP DUNGEON — content expansion catalog (2026-10-26)

Phase 1 stays locked to its 3-enemy slice while it is being built:
raider, drone, brute. That slice has to prove the loop before
content floods it. This catalog is the content wave that lands
AFTER Phase 1 tests pass, in depth order. Almost everything
below already exists as a sprite — what is missing is stats,
loot tables, recipes, and unlock costs, which are playtest
numbers, not art. Nothing here needs a new sprite batch.

## Enemies — all 14 built, in depth order

Depth 1 (Phase 1, already in build):
- Raider — chaser, fast melee pressure.
- Drone — swarmer, weak alone, dangerous in numbers.
- Brute — bruiser, slow, armored, high HP.

Depth 2:
- Turret (light) — stationary ranged emplacement, guards rooms
  and corridors. Forces cover and positioning, not trading blows.
- Flyer — fast ranged skirmisher, hit-and-run, low HP.

Depth 3:
- Shielder — front-shielded tank, weak from behind. Teaches
  flanking on the grid.
- Sniper — long-range, telegraphed heavy shot. Punishes
  standing in the open.

Depth 4:
- Bomber — AoE / self-destruct pressure, forces spacing and
  kiting. Its bombs are already modeled.

Depth 5+ / floor boss:
- Boss — the batch-1 boss mech, reserved for deep floors and
  structure rooms, not random spawns.

Player chassis are the same pool in reverse (see Gear below):
tank, assault, artillery, and spider are unlockable player
mechs, not just enemy art — their rigs and wrecks are built.

## Weapons — all 12 built (workflow set)

Each weapon is a loot drop with a distinct pattern, not just a
damage number. Starting stats are to be playtested; patterns
are the design:

- Plasma rifle — standard ranged, reliable, medium time cost.
- Rail gun — long range, piercing, high damage, high time cost.
- Gatling — multi-shot burst, eats ammo, short-medium range.
- Flamethrower — cone, short range, damage over time.
- Grenade launcher — AoE splash, damages around corners.
- Homing missile — tracks, slow, high damage, high time cost.
- Missile pod — volley, spread damage over an area.
- Shoulder rocket — single heavy rocket, long reload time.
- Laser emitter — precise beam, line damage.
- Energy sword — melee, no ammo, low time cost, high risk.
- Combat drone — deployable helper, draws fire, limited life.
- Shield module — defensive gear, not a gun: absorbs damage,
  recharges over time (time units, not seconds).

Weapon loot follows depth: common weapons early, specialized
mid-depth, rare/experimental deep. A weapon's time cost is as
important as its damage — a slow rail gun and a fast sword
play differently under the time scheduler.

## Items, loot, and consumables — built

Loot tiers (from MECHANICS-PLAN.md):
- Common scrap — basic repairs, starter gear.
- Specialized components — better weapons, armor, utility.
- Rare deep technology — experimental modules, deep upgrades.

Items already sprited:
- Salvage (currency pickup), credits, gem, data chip (Codex),
  key (locked doors / vault rooms), toolkit (repair),
  health pack, health cell, energy cell, ammo crate, food,
  book / scroll (lore and Codex entries), misc.

Consumables in play:
- Health pack / health cell — restore hull.
- Energy cell — restore energy for skills.
- Ammo crate — restock ranged weapons.
- Food — small heal + hazard resistance, cheap and common.
- Toolkit — field repair, also a crafting ingredient.
- Key — opens a locked door or vault room, consumed on use.

Drops: every enemy drops salvage; brutes and above drop
components; structures (reactor, shield generator, supply
depot) drop specialized loot; chests drop items; rare finds
go to the Codex even if the item is lost (see MECHANICS-PLAN).

## Gear and mechs — built, to be unlocked

Starter: light scout (fast, fragile, cheap actions).
Unlocks, in order, by depth survived and Codex/tech recovered:
- Tank defender — slow, armored, high HP, shield-leaning.
- Heavy assault — balanced brawler, shield + gun.
- Artillery — long-range, heavy weapons, slow, fragile.
- Spider walker — mobile, multi-leg, terrain-leaning.

Gear slots (Phase 3+): chassis, weapon, armor module, shield
module, utility module. A chassis changes speed, HP, armor,
and action costs — it is a build choice, not a skin. Vehicle
modules (hoverbike, hovertank, transport, airship, drone
carrier, lander) are surface/hub content for later phases,
not dungeon loot.

## Structures, props, and FX — built

Structures: core reactor, shield generator, supply depot
(loot and objective rooms). Props: barrel (destructible),
chest, spike trap, salvage, health/energy cells, stairs.
FX (12): explosion, energy burst, laser beam, missile,
smoke, shield, heal, spark, blood, teleport, debris, impact.
These cover death, hits, healing, and destruction without
new art.

## What still needs designing (not sprites)

- Enemy stats: HP, armor, damage, speed (time cost), sight
  range, per type, per depth tier.
- Weapon stats: damage, range, pattern, ammo, time cost.
- Loot tables: drop rates per enemy, chest, and structure,
  per depth theme (industrial, scrapyard, overgrown, cavern).
- Crafting recipes: ingredient lists per weapon/armor/
  consumable, station requirements, unlock conditions.
- Unlock costs: salvage cost per chassis, hub upgrade, and
  banking percentage upgrade (25% -> 40% -> 55%).
- Faction / contract content: later, after the core loop
  and the first content wave are playtested.

## Order of work

1. Phase 1 proves the loop (in flight, 3 enemies).
2. Content wave 1: Depth 2-3 enemies (turret, flyer,
   shielder, sniper) + first weapon drops + consumables.
3. Content wave 2: Depth 4+ (bomber, boss), full weapon
   roster, gear slots, crafting recipes.
4. Content wave 3: vehicles in gameplay, factions,
   contracts, authored quests.

No content wave starts until the previous wave's tests pass.
