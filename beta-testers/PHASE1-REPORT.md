# Scrap Dungeon — Phase 1 Report: loot tiers, upgrade levels, damage & dice

Date: 2026-10-28. Spec: `LOOT-SKILLS-DESIGN.md` §4 (approved 2026-10-28 ~07:27 PDT).
Scope: Phase 1 ONLY. Phases 2–6 untouched. No banking/hub/wreck/enemy-stat
changes. No git push/merge/publish — local files only.

## What shipped

**Data tables (`game/core.js`)**

- `WEAPON_DEFS` (core.js:63) replaces the old `WEAPONS` literal; `WEAPONS` is
  kept as a back-compat alias. All 12 weapons with dice `{num, sides, plus}`,
  pattern, range, timeCost, ammoPerShot, ammoType, element, depthBand.
  `ammoType` is recorded on every def; consumption still draws from the
  SINGLE existing ammo pool — per-type pools are Phase 4.
- `TIERS` (core.js:87): Common `#c8c8c8` ×1.00 / Uncommon `#35e05c` ×1.10 /
  Rare `#4aa8ff` ×1.22 + 1 slot / Epic `#b46ae0` ×1.35 + 2 slots /
  Legendary `#ffb020` ×1.50 + 2 slots + named flair (8 names, `FLAIR_NAMES`).
- `PROPERTIES`: exactly 5, data-driven — crit (+10% chance, double damage),
  range (+1), lifesteal-on-kill (heal 5), salvage bonus (+2 on kill drops),
  evasion (+2 while equipped).
- Rarity weights by depth (`RARITY_WEIGHTS`): depth 1 is 62/25/10/2.5/0.5 as
  specified; depths 2+ taper (d2 55/27/13/4/1, d3 48/28/16/6/2, d4–5
  42/28/18/9/3, d6+ 38/27/20/12/3) with Legendary capped at 3%.
- Upgrade weights (`UPGRADE_WEIGHTS`) exactly per the §4.3 table;
  `UPGRADE_DMG_PER_LEVEL = 0.12`. Depth-1 upgrades are +0/+1 only.

**Instance model**

- An item instance is plain JSON `{kind:'item', defId, tier, upgrade,
  properties, flair}` on pickups and in equipment. `state.weapon` is an
  instance (was the string `'scrapBlaster'`).
- `weaponStats(state)` (core.js:220) derives everything (dice, range,
  mult, display name) and recomputes every call — nothing derived is
  stored. `normalizeWeaponInstance` (core.js:199) maps legacy string
  weapons to Common +0 instances of the same def; unknown shapes get the
  blaster default. `deserializeRun` (core.js:1826) and `inventoryOf`
  (core.js:1098) both normalize. `serializeRun` stays plain JSON.
- Display: `[Rare] Plasma rifle +1`; Legendary adds `'Flair'`.

**Drops**

- Kill drops in `killEnemy` (core.js:1432): raider 12%, drone 10%, brute
  30%. The item lands on the kill cell beside the salvage drop; both are
  collected on step-over via the existing `afterPlayerStep` loop
  (core.js:1361), extended to collect every pickup on the cell.
- Cache guarantee in `generateFloor` (core.js:466–484): ONE cache in the
  first loot room per floor (placed by fallback scan, never RNG luck),
  plus a 50% cache chance per structure room. 200-floor sweep: zero
  floors with zero item drops.
- Equip-on-pickup (proposed default, see below): stepping on a weapon
  drop equips it; the replaced weapon drops on the cell. The
  `equippedThisStep` guard (core.js:1361) leaves the dropped weapon on
  the floor this step, so the player can step off and back on to swap —
  no weapon is ever destroyed by a pickup.

**Dice & patterns (`fireWeapon` rewrite, core.js:1461)**

- `rollDamage` (core.js:1134) gains a dice branch for weapons ONLY
  (`rollDamageDetailed`, core.js:260); melee keeps flat+var untouched.
- Log shows the roll: `You hit Raider for 15 ([Common] Scrap blaster +0:
  2d6+8: 5+3+8 = 16, armor -1).` (real line from the browser verify run).
- Patterns: standard (first in line, walls block); burst/gatling 3 shots,
  re-scanned per projectile; spread/missile-pod 4 projectiles; beam/laser
  hits every enemy in the line; splash/grenade arcs over walls, 3×3 AoE,
  diagonal blocked only when BOTH orthogonal intermediates are walls;
  cone/flamethrower hits exactly 3 widening cells + burn; rail gun
  pierces armor; homing ignores evasion; energy sword is adjacent-only,
  no ammo. Time cost = `timeCost × PLAYER_DEF.interval`, so the blaster
  still costs 1 unit and existing clock assertions hold. Refusals (no
  target, out of ammo) cost no time and spend no ammo. Shots wake
  targets; ranged never gets the surprise bonus.
- Burn is self-contained in `enemyAct` (core.js:1254): 3 damage/activation
  ignoring armor for 3 ticks, then clears. No other status exists.

**UI (`game/game.js`, `game/index.html`)**

- Pickup rendering (game.js:1231): `kind:'item'` draws the tier-colored
  ring + letter marker (first letter of the weapon name, tier color) +
  upgrade pips; the salvage sprite is never drawn for items. No art
  generated, no sprite files invented — the doc-sanctioned fallback.
- Bag modal (game.js:833): weapon line shows the tier tag in the tier
  color. Help text (game.js:880) documents equip-on-pickup, tier colors,
  pips, and dice in the log. `doFire` floats every hit (game.js:733) for
  multi-target patterns. FIRE button title updated (index.html:42).

## Sim gate — all green, after tuning (see below)

Extended `beta-testers/sim_ammo.js` (20k kill trials; 200 run-seeds ×
depths 1–3; `ranged` = Common +0 blaster, `rangedTypical` = a freshly
rolled depth-typical instance per trial via `rollItem` + `weaponStats`;
economy stays on the conservative blaster dist). Full numbers in
`beta-testers/sim_ammo_results.json`; chart in
`beta-testers/reports/phase1-chart.png` (regenerated by
`beta-testers/chart_phase1.py`).

| Gate (§4.5) | Target | Blaster | Typical | Verdict |
|---|---|---|---|---|
| Depth-1 median STK, drone | ≤3 | 3 | 3 | PASS |
| Depth-1 median STK, raider | ≤4 | 3 | 4 | PASS |
| Depth-1 median STK, brute | ≤8 | 6 | 8 | PASS |
| Ammo demand vs supply, sustainable ranged share, depths 1–2 | ≥0.7 | d1 1.00, d2 0.90 | — | PASS |
| Floors with zero item drops (600 floors) | 0 | 0 | — | PASS |

Depth-1 tier shares across the 600-floor census: Common 60.1% /
Uncommon 26.7% / Rare 11.0% / Epic 1.9% / Legendary 0.3% — inside the
table. Depth-3 ranged share is 0.39; the gate covers depths 1–2 only,
and depth 3 is below it by design (melee carries the rest).

### Tuning (numbers moved, never the gate)

First run with the doc's proposed numbers: STK passed exactly at the
limits (3/4/8) but depth-2 ranged share was **0.33** — the gate failed.
Two tuning moves, both inside Phase 1 scope (no enemy/banking/hub
changes):

1. `STARTING_AMMO` 12 → **16**, `AMMO_CRATE_VALUE` 6 → **8**
   (core.js:83–84). Depth-2 share rose to 0.67 — still short.
2. Scrap blaster dice 2d6+6 → **2d6+8** (core.js:64). Depth-2 share
   0.90 (mean 0.83), STK 3/3/6. Gate green with margin.

The Armorer faucet (6 ammo / 8 salvage) and the hub stockpile take cap
(`STARTING_LOAD.ammo` = 12) are UNCHANGED. The doc's §4.5 blaster row
was updated to 2d6+8 with this note; the crate/start values in §4.5
text were updated likewise. Four pre-existing tests that hard-coded 12
ammo / 6-per-crate were updated to the constants (test.js:736, 741,
746, 982, 987, 989).

## Tests

`node --test game/test.js`: **68/68 pass** (52 pre-existing + 16 new
Phase 1 tests, test.js:1368–1770). New coverage: tier/upgrade roll
distributions on a fixed stream; the 200-floor sweep (tier mix within
±20%, Legendary <2%, every floor ≥1 item drop, depth-1 upgrades ≤+1,
structure-cache rate 25–75%); `weaponStats` scaling; dice bounds and
detail format; equip-on-pickup + swap-back; kill-drop rates
(raider/drone/brute, 3000 kills each, ±30%); save/load round-trip with
an equipped Epic +2 weapon; legacy string-weapon migration; property
slots/evasion/display names; burst/spread ammo+time costs; rail pierce;
homing vs evasion 999; beam multi-hit; cone 3-cell geometry; splash
wall-blocked diagonal; burn ticks; sword no-ammo + free refusal;
combat-drone exclusion.

Browser verify: `beta-testers/verify_phase1.py` (Playwright, real
clicks/keys, no state mutation except the documented facing set used by
the older ammo script too). Proves a real pickup (exact instance
equipped), tier tag in the log, swap-back (old weapon on the cell),
Bag tier color, a real shot with dice + tier tag in the log, zero
console errors, zero failed assets. Run 6 consecutive times: all green
(10 checks, 12 when the cone/melee swap-back path runs). Screenshots:
`beta-testers/reports/screenshots/phase1-item-ring.png` (tier ring +
letter marker visible), `phase1-bag.png`, `phase1-fire.png`.
One wart: per-attempt failures persist in the tally when an attempt is
abandoned for a fresh run (same convention as `verify_ammo_batch3.py`);
the summary check is the authority.

Full harness: `./beta-testers/run_all.sh` → **339 PASS, 0 FAIL, 2 NOTE,
0 Blockers** — identical to the pre-Phase-1 baseline; the 2 NOTEs are
the known pre-existing ones (unreferenced `prop_salvage_sheet.png`;
wall bumps give no feedback). `verify_ammo_batch3.py` and
`verify_ammo_craft.py` were updated to the instance weapon shape and
16 starting ammo (crafted-load expectation 18 → 22).

## Slipped

- **Combat drone: slipped to Phase 4, as the spec allows.** `WEAPON_DEFS`
  carries the row with `released: false`; it never rolls as a drop
  (2000-roll test), and `fireWeapon` refuses it honestly
  ("combat drone not yet implemented"). The other 11 weapons are green.
  No drone actor, movement, or marker code was written.

## Proposed-default decisions (for the record)

- Equip-on-pickup with swap-back (Phase 1 has no weapon inventory;
  Phase 2's Bag equipment section supersedes it). No weapon is ever
  destroyed by a pickup.
- Property mechanics: crit 10% / double damage, logged `(CRIT!)`;
  range +1 in `weaponStats`; lifesteal heals 5 on kill; salvage +2 on
  kill drops; evasion +2 derived in `playerEvasion` (core.js:239) and
  used by `resolveAttack` for the player only.
- Depth bands (doc names the field, not the values): 1+ blaster /
  plasma / gatling / flamethrower / grenade / sword; 2+ rail gun /
  missile pod; 3+ homing / shoulder rocket; 4+ laser / drone.
- Depth 2+ rarity weights and plasma `accBonus: 2`, flamethrower burn
  `{dmg: 3, ticks: 3}`: proposed numbers (doc gives no values).
- `rollItem` picks uniformly among released in-band defs; flair only
  for Legendary; properties are drawn without duplicates.

## Conflicts / notes found

- Pre-existing nit, NOT fixed (out of scope, shared log path): melee
  and ranged both log "You misses X" — the grammar bug lives in
  `resolveAttack` and predates Phase 1.
- Pre-existing: Escape closes only the stairs modal, not the Bag modal
  (the Bag has its own Close button). The verify script closes via the
  button; no game change made.
- `coherenceCheck` is still test-only (never called inside generation)
  — unchanged, noted for the Phase 6 tile-coherence work.
- The §10 amendment work happening in parallel (ChatGPT generator-spec
  rounds, grounding doc) was NOT incorporated: it is doc-only, awaits
  review, and is not a build order. Phase 1 implements the approved §4
  only.

## Open issues

- Depth-3 sustainable ranged share 0.39 (gate is depths 1–2; melee
  covers the rest — watch in playtest, do not tune blind).
- Typical-weapon brute distribution has a long tail (p90 22): weak
  single-roll defs (gatling/flamethrower) drag rolled-weapon trials.
  Medians pass; the tail is a sim-approximation note (burst/splash
  economics are not modeled per-action), not a balance verdict.
- Weapon art still does not exist; drops use the tier ring + letter
  marker until art lands (doc-sanctioned).
