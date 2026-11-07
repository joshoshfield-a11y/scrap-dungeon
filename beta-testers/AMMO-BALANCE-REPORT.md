# Ammo balance — simulation + Armorer faucet slice (2026-10-28)

## Question, stated as numbers

1. If a player kills **every** enemy at range, how many shots does a run
   demand per depth, vs ammo supplied (12 starting + 6 per crate)?
2. What share of a floor's kills can the ammo pool afford at range
   (median, p10/p90), per depth, under current numbers vs alternatives?
3. Which change is the logical first slice: retune constants, or add the
   missing faucet?

## Parameter sources (shipped code, `game/core.js`)

- Player: hp 100, melee dmg 14+0–6, acc 14, evasion 8 (`PLAYER_DEF`, L47).
- Scrap blaster: dmg 10+0–4, range 5, 1 ammo/shot (`WEAPONS`, L53–55).
- `STARTING_AMMO = 12`, `AMMO_CRATE_VALUE = 6` (L56–57).
- Enemies: raider hp 30/armor 1/ev 6, drone hp 16/armor 0/ev 14,
  brute hp 60/armor 4/ev 3 (`ENEMY_TYPES`, L42–45). HP scales
  `×(1 + 0.1 × (depth − 1))`, dmg `+ floor((depth − 1) / 2)` (L272–274).
- Enemy count `min(12, 3 + depth)`, types cycle raider/drone/brute (L259–263).
- Hit rule: `rng() × acc >= rng() × evasion`; surprise melee auto-hits at
  1.5× after armor (`resolveAttack`, L900+). Damage roll:
  `dmg + floor(rng() × (dmgVar + 1))` (L893–894).
- Crates: exactly 1 ammo pickup per loot room; loot rooms guaranteed ≥1
  (`forceType`, L96–116). Measured over 600 generated floors: mean
  1.35 crates/floor at every depth 1–3, zero floors with no crate.
- Sim script: `beta-testers/sim_ammo.js` (seeded, re-runnable; writes
  `sim_ammo_results.json`). Kill distributions: 20,000 trials per
  (type × depth × mode). Run economy: 200 run-seeds × depths 1–3, floors
  from the real generator, demands sampled from the kill distributions,
  variants compared paired on the same streams.

## Results

### Shots/hits to kill one enemy (median, p10–p90)

| Enemy (depth 1) | Ranged shots | Melee hits, surprise opener | Melee hits, awake |
|---|---|---|---|
| Raider (30 hp) | 4 (3–5) | 2 (2–3) | 3 (2–4) |
| Drone (16 hp) | 4 (2–7) | 1 (1–1) | 2 (1–5) |
| Brute (60 hp) | 9 (8–11) | 5 (4–6) | — |

The gun's worst matchup is the weakest enemy: drone evasion 14 halves
hit chance, so a drone eats a median 4 shots (p90 7), while a surprise
melee hit one-shots it. Melee is stronger per action than the gun
against every type, and free. The gun's value is distance, which this
sim does not price — see Limits.

### Ranged-only demand vs supply, per floor

| Depth | Enemies | Demand median (p90) | Supply/floor (mean) |
|---|---|---|---|
| 1 | 4 | 21 (25) | 12 start + ~8 crates |
| 2 | 5 | 26 (31) | ~8 crates |
| 3 | 6 | 38 (45) | ~8 crates |

Supply is flat (~8/floor) while demand grows (+1 enemy and +10% HP per
depth). No constant retune closes that gap: see variants.

### Variants — median sustainable ranged-kill share

| Variant | Depth 1 | Depth 2 | Depth 3 |
|---|---|---|---|
| Current (12 / +6) | 0.90 (shortfall 121/200 runs, median 2) | 0.27 | 0.17 |
| Tighter (8 / +4) | 0.60 | 0.17 | 0.11 |
| Cap 24 | 0.90 — no effect, stockpile never reaches it | 0.27 | 0.17 |
| Generous (18 / +6) | 1.00 | 0.48 | 0.17 |
| **Crafted +12 (24 start)** | **1.00 (shortfall 0/200)** | **0.71** | 0.17 |

Chart: `reports/ammo-balance-chart.png`.

## Recommendation

**Keep 12 / +6. Do not retune the constants.** Depth 1 is close to
right (median shortfall 2 shots under kill-everything-at-range, a
profile no real player follows). The deeper starvation is structural:
flat supply vs growing demand, and only a faucet fixes a faucet
problem. The faucet already exists in the design — MECHANICS-PLAN:
"the Armorer crafts ammunition" — but no ammo recipe shipped. So the
slice is: **Armorer ammo pack recipe** (6 ammo = one crate, 8 banked
salvage, no components), stockpiled in the hub, up to 12 loaded into
each new expedition. Modeled as "crafted +12": depth 1 fully
ranged-clearable, depth 2 at 0.71, depth 3 still hybrid (0.17) — the
recipe is a per-run faucet, not a per-floor one. Depth 3+ supply is a
separate future scope call (crate scaling or enemy drops), not smuggled
into this slice.

Price rationale: 8 salvage sits between food (4) and a health cell
(1 component + 5 salvage); salvage-only so it competes with
chassis/banking savings, the real economy tension. 6 ammo per pack
keeps one pack = one crate in the player's head.

## What shipped in this slice (2026-10-28)

- `core.js`: `RECIPES.ammoPack`; stockpile gains `ammo` (newHub,
  ensureHub defaults, serializeHub, inventoryOf); `STARTING_LOAD.ammo = 12`;
  `newRun` takes up to 12 crafted ammo into the run.
- `game.js`: Armorer station shows the recipe automatically (renders
  from `RECIPES`) + ammo stockpile/loadout text; Bag modal hub stockpile
  line + help text include ammo.
- Tests: 52/52 (`node --test`), incl. a new ammo-craft/loadout/legacy-hub
  test; one pre-existing deepEqual expectation updated for the new
  stockpile key. Old saves (hub without `ammo`) default to 0 via
  `ensureHub` — verified by test.
- Browser verification (`verify_ammo_craft.py`, real clicks, legacy hub
  save with no ammo key): recipe renders from `RECIPES`; craft deducts 8
  salvage and stocks 6 ammo; second craft fails honestly with the
  shortfall named and nothing moved; New Expedition starts at 18 ammo
  (12 + 6); 8/8 checks, zero console errors, zero failed requests.
  Screenshots: `reports/screenshots/ammo-craft-hub.png`,
  `ammo-craft-run.png`. Full harness after the slice: 339 PASS, 0 FAIL,
  2 NOTE, 0 ENV, 0 Blockers, 0 Majors.
- Drive-by fix found by that verification: hub station failure reasons
  were wiped — the station button re-rendered the hub screen after
  setting the message, destroying the msg div. The reason is now
  re-applied after the re-render, so all stations (not just the
  Armorer) show honest failures. No behavior change otherwise.
- Not changed: starting ammo, crate value, weapon stats, enemy stats.
  No reload mechanic, no magazine, no new weapons — those stay future
  scope calls.

## Limits (read before arguing with the numbers)

- The sim models ammo demand only. It does not model movement, line of
  sight, the scheduler, or damage taken — so it cannot price the gun's
  safety value, and it cannot say whether melee's dominance on paper
  survives contact with real play. A playtest pass is still owed before
  anyone calls the balance done.
- Profiles modeled: ranged-only (upper bound on demand) and the
  sustainable-fraction derived from it. Speedrunners, exploiters, and
  players who skip enemies are not modeled.
- The crafted+12 variant assumes the player actually spends 16 salvage
  on two packs every run. If they spend it on chassis instead, the
  economy reverts to the current column — which is the intended choice,
  not a sim failure.
- Prediction to check later: with the recipe live, depth-1 runs should
  rarely feel ammo-starved for a player who crafts; depth-3 runs should
  still force mostly melee. Score this against playtest, honestly.
