# Scrap Dungeon — Phase 2 (gear slots) build report

Built 2026-10-28 from `LOOT-SKILLS-DESIGN.md` §5 only (+ §3 what-is-true,
§11.3 save discipline). Phases 3–6 untouched. No push/merge/publish.

## What changed

**`game/core.js`** — gear system, all behind the Phase 1 patterns:

- `GEAR_DEFS`: 12 defs, 4 per slot (armor / shield / utility), mirroring
  `WEAPON_DEFS`. Armor: Scrap plating {armor 1, hp 0}, Alloy vest {2, 10},
  Ablative weave {3, 20}, Nano-lattice {4, 40}. Shield: Scrapper's ward
  {capacity 10}, Alloy aegis {16}, Ablative barrier {24}, Nano bastion {34}.
  Utility: Scope {range 1}, Sensor {sight 2}, Gyro-stabilizer {evasion 2},
  Power cell {powerBonus 40}. Depth bands: second tier from depth 2, top
  tier from depth 3, rest from depth 1.
- One scaling formula for all gear stats:
  `round(base × tierMult × (1 + 0.12 × upgrade))`, zero stays zero. Same
  shape as weapon damage scaling.
- `state.equipment = { weapon, armor, shield, utility }`,
  `state.carriedGear = []`, `state.shield` (pool), `state.shieldNextRecharge`.
  **`state.weapon` stays the authoritative equipped weapon** (Phase 1
  contract — the sim passes bare `{weapon: inst}` objects);
  `state.equipment.weapon` is a mirror kept in sync by `setEquipped` /
  `deserializeRun`, and `serializeRun` rebuilds it from `state.weapon`, so
  the two can never disagree after a load. `weaponStats` reads
  `state.weapon`, falling back to the mirror only when it is absent.
- Gear rolls the SAME tier + upgrade tables as weapons (depth-1 cap +1
  included) but NO properties — the property pool is weapon-shaped and
  properties on armor would be dead text. Tier/upgrade scaling carries
  the interest.
- `rollDropItem(rng, depth, gearWeight)`: ONE shared roll — gear with
  probability `gearWeight`, else a weapon via `rollItem` (which stays
  weapon-only). Weights: kill drops 0.4, loot-room cache 0.5,
  structure-room cache 0.7. Drop RATES unchanged (raider 12% / drone 10% /
  brute 30%; one cache per loot room; 50% per structure room).
- `derivedStats(state)` recomputes `{armor, maxHp, evasion, range, sight,
  shieldCapacity, powerBonus}` on every read from base + chassis tier
  (folded into `player.maxHp` at `newRun`) + equipped gear. NOTHING derived
  is stored. Phase 3 seam: optional `state.derivedMods` merges in; nothing
  writes it today.
- Shield: `applyShield` (armor reduction first, then shield, then hull, in
  BOTH `resolveAttack` branches and for spike-trap damage; log lines append
  "(shield absorbed N)"), `rechargeShield` (+1 per 20 ticks / 2 time units,
  called from `processScheduler`; a full pool never banks charge).
  Power-starvation drain BYPASSES the shield (internal drain, not damage).
- `equipCarried` / `unequip`: Bag-only, cost NO time and NO action. Swaps
  return the old piece to the carried list in place; nothing is ever
  destroyed. The weapon is swapped, never removed. A freshly equipped
  shield starts at pool 0 (no free full pool from swapping). HP clamps to
  the derived max when armor leaves.
- Pickups: `kind:'item'` pickups are now STOWED into `carriedGear` on
  step-over (weapons and gear alike). The Phase 1 `equippedThisStep` guard
  and swap-back drop are GONE — superseded per §5.3.
- Wrecks: `recordPlayerDeath` snapshots `gear` (the equipped set at death);
  `placeWreckOnFloor` copies it; recovery appends each piece to
  `carriedGear` intact (stowed, NOT auto-equipped). Unequipped carried gear
  is NOT wrecked — only the equipped set persists via the wreck, and a
  second death destroys it with the wreck (same one-wreck rule).
- Save/load: `serializeRun`/`deserializeRun` round-trip equipment +
  carried gear + shield pool. Legacy saves (no `equipment` field) default
  to empty gear slots with the Phase 1 weapon instance. Plain JSON only.
- Heal caps (`useHealthCell`/`useRepairKit`, Siphon) and power thresholds
  use derived max HP / `powerBonus` (identical behavior with no gear).
- Combat drone untouched (`released: false`, never drops, `fireWeapon`
  refuses honestly). "You misses X" grammar nit and Escape-modal nit
  untouched (out of scope).

**`game/game.js`** — UI only:

- Pickup rendering uses `C.itemDefFor` so gear letters render (ring already
  used the tier color generically; upgrade pips unchanged). No sprite
  files, no image generation.
- Bag modal gains an Equipment section: 4 slot rows in tier colors
  (Remove buttons for armor/shield/utility, none for the weapon), a
  derived-stats line incl. shield pool/capacity, and an Equip button per
  carried-gear row. Equip/Remove re-open the Bag after acting.
- Help text: "Weapon drops" paragraph replaced with the Bag model + gear
  paragraph (shield absorb/recharge, one utility slot, no-time swaps).
- HUD HP, Rest, player HP bar, and Bag HP line use derived max HP.
  Quickbar unchanged (FIRE/+HP/FOOD/KIT). `wreckStatusText` names wreck
  gear when present.

**`game/test.js`** — the Phase 1 auto-equip test rewritten to the Phase 2
model + 10 new Phase 2 tests (see Verification). **`game/README.md`** —
ammo/gear paragraphs updated to the stow + Bag model.

**`beta-testers/verify_phase2.py`** (new) — Playwright, real keys/clicks.

## Proposed-default decisions (recorded per the brief)

- Carried-gear model: stow on step-over, Bag-only swaps, no time cost,
  old piece returns to the list, nothing destroyed. (Doc §5.3 proposed
  default, adopted as built.)
- Gear def values above are playtest starting numbers, same status as the
  Phase 1 weapon numbers — not tuned beyond the sim regression.
- Shield numbers: capacity 10/16/24/34 by def, recharge 1 per 2 time
  units, absorb after armor, no banking, fresh shield starts empty.
- Gear is RUN-SCOPED: it rides only the wreck, never the hub. Extract
  discards it; there is no hub gear storage.
- Gear rolls no properties (see above).
- Power-starvation drain bypasses the shield; spike traps do not.
- HUD shield visibility is Bag row + absorb log lines + transient message
  only — no HUD shield segment (open polish, not Phase 2 scope).

## Verification

- **Node tests: 78/78 pass** (`node --test game/test.js`; was 68/68).
  New: gear def tables/lookups/scaling; `rollGearItem` tier/upgrade caps +
  no properties + slot filter; `rollDropItem` gear share 0.36–0.44 over
  20k rolls; `derivedStats` base/gear/chassis-tier composition + fresh
  object per call + nothing stored; equip/unequip round-trips incl. shield
  reset + HP clamp + no-time/no-action; shield absorb before hull in both
  `resolveAttack` branches + recharge 1-per-20-ticks + no banking + trap
  absorb; wreck-with-gear recovery intact + second death destroys it;
  save/load round-trip with equipped gear + carried list + shield pool +
  legacy-save migration + legacy wreck without gear; kill-drop rates held
  (raider/drone/brute bounds) with gear share 0.30–0.50 over 9,000 kills;
  200-floor sweep (gear drops; structure caches >50% gear); power-cell
  threshold push-out. Four test bugs found during the run were test-side
  only (bare index 0 re-equips the piece that just came off; the game
  behavior was correct in each case) — fixed with a defId-based equip
  helper, no core changes.
- **Sim regression: gates still green.** `node beta-testers/sim_ammo.js`
  re-run; results regenerated at `beta-testers/sim_ammo_results.json`.
  STK depth-1 blaster 3/3/6 vs limits 3/4/8; typical 3/4/8; sustainable
  ranged share d1 1.00, d2 0.90 vs floor 0.7; zero-item floors 0 across
  600 floors. Kill distributions and ammo demand/supply identical to the
  Phase 1 run; only item-tier shares shifted (sampling noise from the
  changed RNG consumption of the shared drop roll — same tables).
  The sim was NOT extended with gear in the damage pipeline (doc §11.2
  mentions it; the task's mandatory list was regression-only). Gap noted
  under Open issues.
- **Browser verify: 3 consecutive clean runs** (`verify_phase2.py`, ML-venv
  python). Each run: fresh Common +0 blaster / 16 ammo; real gear pickup
  stowed with weapon unchanged and tier+Bag log line; Bag Equipment
  section + Equip click fills the slot with the exact instance at zero
  time/action cost; shield starts empty, recharges ≥1 on 2 waits, and
  absorbs in a real fight (log lines e.g. `Drone hits You for 0 (raw 7,
  armor -2) (shield absorbed 4)`); zero console errors / failed assets.
  Screenshots: `reports/screenshots/phase2-item-ring.png`,
  `phase2-bag.png`, `phase2-shield.png`. First script version failed once
  (shield not found within 6 floors — long hunts die to power-starvation
  drain + attrition); fixed with in-hunt healing via health cells and a
  5-floor cap, then 3/3 clean. `verify_phase1.py` is now STALE (it expects
  auto-equip + swap-back drop) — left untouched per the task; it is
  superseded by `verify_phase2.py` and must not be run as a gate.
- **Full harness: 339 PASS, 0 FAIL, 2 NOTE** (`./beta-testers/run_all.sh`;
  report at `beta-testers/reports/REPORT.md`). The 2 NOTEs are the
  pre-existing ones (unreferenced `prop_salvage_sheet.png`; wall bumps
  give no feedback).

## Open issues / carried over

- `verify_phase1.py` stale (see above) — superseded, do not run as a gate.
- Sim not extended with gear in the damage pipeline (§11.2 gap); gear
  changes survivability, which the ammo sim does not price. Revisit when
  the sim is next touched, or in Phase 4/5 tuning.
- Depth-3 ranged share 0.39, typical-weapon brute tail p90 22, weapon/gear
  art missing (ring + letter fallback), "You misses X" grammar nit,
  Escape-closes-only-stairs-modal nit — all open from Phase 1, untouched.
- HUD shield segment is open polish (Bag + log only, by design for now).
- Starvation-bypasses-shield is decided by code inspection only —
  `notePlayerAction` is not exported, so no node test covers it.
- Design doc: §5.4 marked DONE + header status updated (surgical edits
  only). Phases 3–6 still draft.
