# Phase 4 Report — Ammo Crafting 2.0 (LOOT-SKILLS-DESIGN.md §7 as amended by §7.6)

Date: 2026-10-29. Builder: Phase 4 implementation subagent. Working tree
only — no commits, pushes, merges, or publishing. No Phase 5/6 work. No new
art/sprites. Spec: §7.6 (settled FINAL, 3-exchange ChatGPT round 2026-10-29)
governs wherever it differs from §7.1–7.5. All §7.6 acceptance items are
covered by the node suite, the browser verify, or the sim; see Receipts.

## Pre-implementation verification (resolved from shipped code)

1. **Breakdown rank 1** (`PILOT_SKILLS.breakdown`, core.js): costs
   `[20, 40, 80]` banked salvage, `xpNeeded [0, 40, 120]`, `codexNeeded 1`,
   `unlocksPhase4: 'breakdown'`. `ammoSmith`: same costs/XP, `codexNeeded 1`,
   `unlocksPhase4: 'ammoRecipes'`. The shipped Breakdown description said
   "better yields per rank (Phase 4)" — overridden by §7.6.1; the description
   was updated in code to "Unlocks dismantling at rank 1; yields are fixed at
   every rank (Phase 4)."
2. **HP/armor** (`ENEMY_TYPES`, depth-1 values; generation scales HP by
   `1 + 0.1 × (depth − 1)`): Drone hp **16** / armor **0**; Raider hp **30** /
   armor **1**; Brute hp **60** / armor **4**. Burning total 9 HP is
   9/16 = **0.5625** of a Drone, 9/30 = **0.3** of a Raider, 9/60 = **0.15**
   of a Brute (§7.6.8 HP/armor subcheck).
3. **Keyboard bindings** (`game.js` keydown handler + `KEY_DIRS`): arrows/WASD
   move; **Q/q and Shift+Q = diagonal NW** (E/Z/C are the other diagonals);
   Space/. = wait; F = fire; 1/2 act ONLY in the `stairs` state
   (Descend/Extract); R/Enter act ONLY in dead/extracted states; 3/4 unbound
   while playing. Help text documented "Q / E / Z / C — diagonals".
   **Conflict check result: Q is taken.** Decision below.

## What shipped (game/core.js + game.js)

**Materials & core rolls.** Exactly `wire`, `coreThermal`, `coreShock`,
`coreCorrosive`. `rollCore(rng)` is one uniform 1/3 draw on the game's seeded
`mulberry32` stream (never `Math.random()`); N cores = N independent draws.
Corrosive cores drop and are Enhance-only on corrosive-tagged gear; no
corrosive ammo/status in Phase 4. Caps: hub materials 999 each.

**Breakdown** (hub Salvager only, gated on Breakdown rank ≥ 1). Fixed yields
at EVERY rank (ranks 2–3 purchasable, no yield effect): component 3 wire + 1
core; Common 2+0; Uncommon 4+1; Rare 6+2; Epic 10+3; Legendary 16+5. One
eligible owned item per action, irreversible (confirmation modal in the UI),
no salvage refund. Equipped items and unrecovered-wreck items are ineligible
by construction: `breakDownGear` accepts only `carriedGear` indices, and wreck
gear enters `carriedGear` only on recovery.

**Typed ammo.** Four pools in hub stockpile and run state:
`ammoStandard` / `ammoPiercing` / `ammoIncendiary` / `ammoShock`. Hub caps
999 each, run caps 99 each. Recipes (Armorer only, all output 6,
`requires.codex = null`, gates + ingredients checked before anything is
consumed, refusal consumes nothing with a specific reason): Standard 8
salvage → 6 (today's `ammoPack`, unchanged, no gate); Piercing 6 wire + 4
salvage → 6 (Ammo Smith rank 1); Incendiary 2 coreThermal + 4 wire → 6
(rank 2); Shock 2 coreShock + 4 wire → 6 (rank 3). Ammo Smith ranks are
cumulative. Piercing uses effective armor `armor − floor(armor/2)` on the
ignored portion (rail gun's full pierce is a separate weapon property and is
unchanged). Incendiary/Shock deal normal rolled damage PLUS the status on a
confirmed hit; statuses apply only when the activation consumed ammo
(`ammoCost > 0` — melee weapons get no ammo effect). The flamethrower's
intrinsic `burn` and Incendiary ammo converge into ONE `applyBurning` call
(single log line, refresh-no-stack).

**Loadout.** Player-chosen panel (new hub station, between Armorer and
Scout): steppers enforce ≤12/type, ≤16 total, never more than the hub owns;
preview via `computeLoadout`; "Reset to default (16 Standard)". Confirming
subtracts only the allocated part from the hub; the run is topped up to 16
with free Standard. Skip/empty allocation → 16 free Standard, hub untouched.
Invalid allocations fall back to the default with a log reason. Unused run
ammo does not auto-return on death — existing death/extraction rules are
authoritative. **This replaces** the old `STARTING_AMMO + up to 12 from
stockpile` behavior (see Judgment calls).

**Migration.** Legacy hub `stockpile.ammo` → `ammoStandard`, clamped to 999,
with a diagnostic in `hub.migrationNotes` naming any discarded excess
(1200 → 999, "excess 201 discarded"); legacy key deleted; idempotent.
Legacy run `ammo` → `ammoStandard` clamped to 99 with a diagnostic, migrated
separately, never copied into both hub and run. Verified cases 0/16/1200.

**Statuses (enemies only).** Enemies gain `statuses: []` + resistances
(`resist: {burning, jammed}` — Drone {0.5, 0.5}, Raider {0, 0}, Brute
{0.25, 0.25}). Burning: 3 HP per elapsed time unit × 3 (9 total before
resistance), refresh-no-stack, ticks once per elapsed time unit for ALL
alive enemies including dormant ones, BEFORE that unit's enemy activations
(scheduler restructured to whole-unit stepping; a tick-killed enemy never
activates, kills go through the ordinary `killEnemy` path exactly once).
Resistance rounding `max(1, floor(3 × (1 − r)))`: Drone 1/tick (3 total),
Raider 3/tick (9), Brute 2/tick (6). Jammed: skips exactly one scheduled
activation (checked first in `enemyAct`, including waking); reapplication
does not queue extra skips; removed after the skipped activation. Jam
resistance is rolled on the seeded stream ONLY after a confirmed hit +
damage resolved (a miss costs no resistance roll); each attempted Shock
application consumes one Shock round whether jammed or resisted; "Resisted"
in the combat log + brief cue. Burning + jammed coexist and expire
independently. Display: `B3/B2/B1` orange `#ff9a1f`, `J1` cyan `#35e0ff`
beneath the HP-bar position, drawn whenever a status is present (even at
full HP). Log lines cover burning damage, jam application, resistance,
expiration, auto-switches, and empty-ammo refusals.

**Switching.** T cycles Standard → Piercing → Incendiary → Shock → Standard;
Shift+T reverses; 1/2/3/4 select directly; Bag-adjacent clickable selector
(40px buttons, name + count + `●` marker); no time cost. Empty types are
selectable and show 0. FIRE on a pool that cannot cover the shot switches to
the next pool in cycle order with the exact message
`Switched to [Type] — [previous type] empty`, WITHOUT firing, consuming ammo,
or advancing time. All pools unable → `No ammunition` refusal, no time
advance. No silent Standard substitution. Q preserved as diagonal NW (see
Judgment calls). HUD shows the short type label + run count (`Std/Prc/Inc/
Shk` — full names in the Bag, help, and selector buttons); Bag shows all
four run counts; Armorer shows all four recipes + ingredient counts +
required rank + precise refusal reasons; Salvager lists eligible items +
tier + yield preview + irreversible-breakdown confirmation; Enhance rows
show target level, wire cost, matching core cost, and the refusal reason
when blocked.

**Enhance.** All four gear slots (weapon, armor, shield, utility). Data field
`element`: null / "thermal" / "shock" / "corrosive"; explicit data only,
never inferred; `element: null` default; invalid values rejected by
validation (`validElement`). Cost = 4 × target level + 1 matching core if
elemental (+0→+1: 4 wire … +4→+5: 20 wire; +0→+5 total = 60 wire + up to 5
cores). Absolute ceiling +5; never changes tier, affixes, or damage dice;
cannot fail randomly; hub-only, one instance, atomic (validate → deduct →
mutate; weapon mirror re-synced). See Judgment calls for the persistence
reconciliation.

**Crates/wrecks.** Crate pickup: +8 Standard, clamped to 99, excess discarded
with a log message. Wrecks snapshot `ammoPools`; recovery is per-pool
clamped to 99 with a discard log. `deserializeRun` migrates a legacy
`en.burn` field into the new burning status (ticks capped at 3).

**Exports.** All new constants/functions are exported for tests and debug:
`AMMO_TYPES`, caps, `rollCore`/`rollCores`, status functions,
`selectAmmoType`/`cycleAmmoType`, `computeLoadout`,
`breakDownComponent`/`breakDownGear`, `enhanceCost`/`enhanceItem`,
`validElement`, clamp/total helpers.

## Judgment calls / decisions (with rationale)

1. **Q → T for ammo cycling (binding conflict, §7.6.6).** Q/q and Shift+Q
   are diagonal NW in the shipped `KEY_DIRS` and in the help text. The spec
   required preserving the existing binding and never silently overriding it.
   T / Shift+T cycles, 1–4 select directly (3/4 were unbound while playing;
   1/2 already meant Descend/Extract ONLY in the stairs state, and the ammo
   handler runs only while playing, so no playing-state conflict). Documented
   in code comments and the help text (new Ammo section).
2. **Auto-switch generalized from "empty" to "cannot cover the shot."** The
   spec message says "[previous type] empty". A pool holding 1 round for a
   2-round weapon is not literally empty but cannot fire; refusing with "No
   ammunition" while other pools hold rounds would strand the player. The
   switch triggers whenever the selected pool holds fewer rounds than
   `ammoCost`, keeping the exact spec message wording. No fire, no ammo, no
   time — the observable contract is unchanged.
3. **Breakdown cap check runs AFTER the core roll.** The yield is random, so
   overflow is only knowable post-roll. On refusal the component/item stays
   and nothing is granted, but the RNG draws are consumed (unavoidable for a
   random yield; no ingredients, materials, or time are consumed). Crafting,
   by contrast, checks all gates before consuming anything (deterministic
   costs).
4. **Loadout replaces the old stockpile take (tension (a)).** Shipped code
   started runs at `STARTING_AMMO` (16) PLUS up to 12 from the stockpile.
   §7.6.4 fixes the starting load at 16 total / 12 per type with a
   player-chosen allocation drawn from the hub. The old take was removed;
   the 16-start baseline for the balance sim is preserved via the default
   loadout. `STARTING_LOAD.ammo` key removed.
5. **One deduction per activation (multi-target patterns).** `fireWeapon`
   deducts once per activation from the selected pool, including
   burst/spread/splash/cone activations that hit several foes. Status
   application is per confirmed hit; a resisted Shock application still
   consumes the round (no free retry). This is the shipped deduction model
   extended to typed pools, not a per-target ammo economy (which §7.6 does
   not specify).
6. **Enhance persistence (honest reconciliation).** Enhance edits the
   CURRENT run state's gear at the hub. Gear does not persist into a fresh
   expedition (`newExpedition` creates a fresh run; `extract()` banks only
   salvage/components/XP). Enhanced gear survives only by continuing the run
   (mid-run hub visits, where `autosave()` persists playing/stairs run
   saves) or via wreck recovery after death (equipped gear snapshots through
   normalize, element + upgrade thread). The hub UI warns about this
   plainly. No hub gear stash was invented — that would be outside Phase 4
   scope. Flagged as an open design question for a later phase (see Open
   flags).
7. **Def-level `element` / `ammoType` labels are inert.** `WEAPON_DEFS`
   entries carry `ammoType` and `element` fields (e.g. flamethrower
   `ammoType: 'incendiary'`, `element: 'thermal'`; scrapBlaster `element:
   'kinetic'`; laserEmitter `element: 'energy'`). `fireWeapon` consumption
   and `enhanceCost` read ONLY the instance `element` field, never def-level
   labels — the §7.6.7 position ("explicit data only, never inferred").
   Instances default to `element: null`, so a flamethrower instance is
   non-elemental until a catalog entry explicitly tags it. Flagged as a
   dormant reconciliation: if def-level tags are ever meant to be live, that
   is a separate catalog decision, not a Phase 4 inference.
8. **Weapon-intrinsic burn vs typed-ammo burn (tension (b)).** Unified:
   flamethrower `stats.burn` and Incendiary ammo converge into one
   `applyBurning` call (one record, one log line, refresh semantics). The
   old per-activation `en.burn` tick in `enemyAct` was removed; legacy saves
   migrate into the new manager.
9. **Cone geometry (fixture note).** Shipped Phase 1 cone covers 1 step
   ahead plus the two 2-ahead diagonal cells — a straight-ahead foe at
   distance 2 is NOT in the cone. The flamethrower/Incendiary convergence
   test uses a distance-1 fixture; this is shipped geometry, unchanged.
10. **Scheduler restructure.** `processScheduler` now steps whole time
    units so burning ticks land before each unit's activations (spec order).
    Shield recharge is called once with the final clock (its next-recharge
    scheduling makes this identical to per-unit calls); energy/heat
    regen/dissipate unchanged. All 92 prior node tests pass unmodified in
    behavior (12 updated only for the typed-pool state shape).

## Receipts

### Node suite — 111/111 PASS (baseline 92; 19 new Phase 4 tests)

`cd game && node test.js` — exit 0 (final run `/tmp/p4-test4.log`,
ephemeral). 12 prior tests updated to the typed-pool model (hub round-trip
shape; `state.ammo` → `ammoPools.standard`; empty-ammo refusal now
auto-switch/"No ammunition"; crate cap 99; save/load typed pools + legacy
migration; wreck `ammoPools`; normalize deep-equals now include
`element: null`; burst/spread typed deduction; flamethrower rewritten to
scheduler-tick semantics; Trigger Discipline typed deduction; sword test
uses all-zero pools). New coverage maps to the §7.6 contract:
P4-BREAKDOWN-YIELD (720 breakdowns: 40/kind × 6 kinds × ranks 1/2/3, same
seeded stream per rank, identical totals — rank-invariance proven),
P4-BREAKDOWN-CORES (seed **20261029**, 440 draws → thermal **140** / shock
**150** / corrosive **150**, all within 125–168, deterministic on replay),
P4-BREAKDOWN-RANKS, P4-BREAKDOWN-ATOMIC, P4-BREAKDOWN-ELIGIBILITY,
P4-AMMO-GATES, P4-AMMO-RECIPE, P4-AMMO-POOL, P4-AMMO-LOADOUT,
P4-AMMO-SWITCH, P4-AMMO-AUTO-SWITCH, P4-AMMO-OVERFLOW, P4-BURN-TICK,
P4-BURN-KILL (5-HP raider dies on the 2nd 3-HP tick; exactly one kill/drop;
no activation; player HP unchanged), P4-BURN-DORMANT, P4-BURN-REFRESH,
P4-JAM-SKIP, P4-STATUS-STACK, P4-STATUS-RESIST (below), P4-SHOCK-RESIST-COST
(deterministic fake-rng roll + seed-hunted resisted hit + miss case),
P4-AMMO-EFFECT (Piercing: 200 paired shots vs Brute armor 4 → exactly +2
every pair; 60 pairs vs Raider armor 1 → exactly +0; Incendiary/Shock
hit/miss), P4-ENHANCE-COST (incl. 60-wire +0→+5 total), P4-ENHANCE-CAP,
P4-ENHANCE-ATOMIC, P4-ELEMENT-TAGS (null default, valid preserved, invalid
rejected, never inferred — flamethrower instance `element: null` despite
def `element: 'thermal'`), P4-LEGACY-MIGRATION, P4-MIGRATION-IDEMPOTENT,
P4-SIM-AMMO, P4-NO-UNIVERSAL-DOMINANCE.

Six first-run failures were test bugs, fixed in-test (never by weakening
the implementation): materials-cap accumulation across breakdown batches;
migration-note expectation for a 16 migration; `cycleAmmoType` returns
`{ok, type}`; burn-kill foe activation timing (`nextTime` 0 → 15);
`equipCarried(state, 1)` for the sensor/utility slot; cone distance-2
fixture.

### Jam resistance statistics — P4-STATUS-RESIST

1,000 independent jam attempts per enemy type on the existing seeded RNG,
fixed seeds, fresh foe fixture per attempt, no reseeding between rolls
(verified before hardcoding; same-seed replay gives identical counts):

| Enemy | Seed | Attempts | Resisted | Observed | Expected ±5pp |
|---|---|---|---|---|---|
| Drone | 77001 | 1,000 | 497 | **49.7%** | 50% — pass |
| Raider | 77002 | 1,000 | 0 | **0.0%** | 0% — pass |
| Brute | 77003 | 1,000 | 250 | **25.0%** | 25% — pass |

Deterministic scripted tests verify the resistance table itself; the
statistical check is within ±5 percentage points for all three types.

### Balance sim — typed effects, all gates PASS

`beta-testers/sim_ammo.js` extended (faithful to the shipped manager:
Piercing effArmor = armor − floor(armor/2); Incendiary normal damage +
burning with refresh-no-stack, one tick per shot-unit after hit resolution,
tick can kill, resistance-rounded via `ENEMY_TYPES[].resist.burning`; Shock
STK ≡ Standard by construction — jam is defensive-only and cannot change
shots-to-kill, so the resulting tie counts as no dominance). Economy gate
stays on the Standard default loadout (typed-pool crafting supply depends on
player breakdown/salvage choices outside the sim's scope — noted in the sim
header). Run 2026-10-29, output `beta-testers/sim_ammo_results.json`, full
log `/tmp/p4-sim.log` (ephemeral).

- Phase 1 gates unchanged: stkBlaster 3/3/6 exact (pass); stkTypical 3/4/8
  (pass); ammoShare depth-1 median 1.0, depth-2 median 0.9 (floor 0.70,
  pass); p4AmmoBaseline 3/3/6 exact (pass).
- **P4-NO-UNIVERSAL-DOMINANCE: anyDominant false (pass).** Median STK:

| Depth | Enemy | Standard | Piercing | Incendiary | Shock |
|---|---|---|---|---|---|
| 1 | Drone | 3 | 3 | 2 | 3 |
| 1 | Raider | 3 | 3 | 2 | 3 |
| 1 | Brute | 6 | 5 | 5 | 6 |
| 2 | Drone | 3 | 3 | 3 | 3 |
| 2 | Raider | 3 | 3 | 3 | 3 |
| 2 | Brute | 7 | 6 | 6 | 7 |
| 3 | Drone | 3 | 3 | 3 | 3 |
| 3 | Raider | 4 | 4 | 3 | 4 |
| 3 | Brute | 8 | 7 | 6 | 8 |

**Near-miss (flagged):** Incendiary is strictly lower vs 2 of 3 enemies at
depths 1 and 3; only the tie (vs Brute depth 1, vs Drone depth 3) saves the
gate under the §7.6.8 definition (a type dominates only if strictly lower
than EVERY other available type against ALL THREE enemies; ties do not
count). The real-world balancer is the economy (Ammo Smith rank 2 gate +
thermal cores), not the STK table. If Incendiary crafting ever gets cheaper,
re-run the dominance check.

### Browser verify — verify_phase4.py, 20 PASS lines, 0 FAIL, exit 0

Full log `/tmp/p4-verify2.log` (first green run; re-run after the HUD-label
fix below, `/tmp/p4-verify3.log`, also 20 PASS / 0 FAIL / exit 0). 17
behavior checks + 3 aggregate checks. Real Playwright/Chromium,
ML-venv python, seeded hub generated from real `serializeHub`
(`beta-testers/p4-seed-hub.json`: banked 500, 20 components, Codex ×2,
Breakdown 1, Ammo Smith 3, typed stockpile, 100 wire + cores). Real keys
and clicks throughout; combat fixtures via `window.ScrapCore` in evaluate
(foe placement, pool counts) as the task allowed. Zero console errors, zero
failed assets. Checks: fresh run HUD "Standard 16" + hub untouched; T /
Shift+T cycle + 1/4 select with empty type showing 0 and no time cost;
Bag all four pools + selected marker; Bag-adjacent selector click switches
type and re-opens the Bag; FIRE on empty Shock auto-switches with the exact
message `Switched to Incendiary — Shock empty` with no fire/ammo/time, and
the next FIRE spends Incendiary; adjacent foe carries burning + jammed;
scripted deaths reach the hub; hub header materials + typed stockpile;
Loadout default preview + stepper click changes preview to 1 Piercing +
15 Standard; New Expedition applies the allocation (hub Piercing 12→11);
breakdown confirm modal; confirmed breakdown 1 component → 3 wire + 1
core (wire 100→103, thermal 6→7); Craft Piercing pack +6 for 6 wire + 4
salvage; Enhance weapon +1 for 4 wire, tier kept.

One script bug found and fixed during the run (not a game bug):
`page.keyboard.press("T")` synthesizes key `'T'` with `shiftKey: false` in
this Chromium/Playwright build, so the game correctly cycled forward; the
script now holds Shift explicitly (`keyboard.down("Shift")` + press "t"),
and the reverse was confirmed live in a key-event probe.

Screenshots (all read visually; `beta-testers/reports/screenshots/`):
- `phase4-status-letters.png` — B3 (orange) + J1 (cyan) under the HP-bar
  position of a 50/100 Raider; HUD "Ammo Inc 4" (short label, post-fix);
  log "Raider burns for 3!".
- `phase4-bag-ammo.png` — Bag typed-ammo line with `◀ selected`, hub
  stockpile + materials lines, clickable ammo selector buttons.
- `phase4-loadout.png` — Loadout station element capture: explainer,
  "Run starts with: 15 Standard, 1 Piercing, 0 Incendiary, 0 Shock",
  steppers with hub ownership, reset button. (First full-page capture
  caught only the top of the long hub modal; re-shot as an element
  capture via `beta-testers/reshoot_phase4_stations.py`, exit 0, no
  console errors.)
- `phase4-breakdown.png` — Salvager station element capture: exchange
  buttons, "Breakdown — materials held: 103 wire, 7 thermal, 6 shock, 4
  corrosive cores (cap 999 each)", fixed yield table, "Components held:
  19 — break down 1 component → 3 wire + 1 core roll."

### Prior-phase browser verifies

`verify_phase2.py` and `verify_phase3.py` needed two minimal state-shape
updates to keep reading the shipped debug state (documented in each file;
no Phase 2/3 behavior changed): `s.ammo` → typed-pool totals, and the
Phase 2 fresh-weapon deep-equal now includes `element: null`.

- **Phase 3** (`/tmp/p4-verify-p3c.log`): **23 PASS / 0 FAIL, failures [],
  exit 0**, completing on fresh-run attempt 4. All Phase 3 mechanics
  verified against the Phase 4 build, including the Respec check (buy rank
  1 for 20, second extract funds the respec, refund 25 → banked 6, skills
  `{}`). An earlier run (`/tmp/p4-verify-p3b.log`, 14.4 min) ended exit 1
  on the known hunt-RNG flake class: 5 attempt-level hunt deaths plus a
  second-expedition death that starved the respec funding gate
  (`respec: False`, all other flags true). The respec mechanic itself was
  verified at unit level against shipped code in the same session (buy 20
  → banked 80; respec 25 → banked 55, skills `{}`, Codex/XP kept; empty
  respec refuses) — the browser miss was funding/RNG, not a respec defect.
  The re-run's clean completion closes the gate.
- **Phase 2** (`/tmp/p4-verify-p2.log`): **17 PASS / 0 FAIL, failures [],
  exit 0.**

### Full harness

`bash beta-testers/run_all.sh` — final run `/tmp/p4-harness3.log`:
**338 PASS / 0 FAIL / 3 NOTE, exit 0 — exactly the baseline.** The 3 NOTEs
are the known baseline classes (dead-weight sheet, wall-bump feedback,
completionist died en route / BFS-death artifact).

**HUD regression found and fixed in this session.** The first harness run
after the Phase 4 build (`/tmp/p4-harness.log`) showed 338/1/2 with a Major
FAIL: `[mobile] HUD fits on one line at 390px` — `scrollWidth=409` vs
`clientWidth=378`. Cause: the HUD ammo segment grew from `Ammo 16` to
`Ammo Incendiary 4`. Fix (minimal, no layout redesign): the HUD segment now
uses the already-exported `AMMO_TYPE_SHORT` labels (`Std/Prc/Inc/Shk` —
full names stay everywhere else: Bag, help, selector buttons), and the
≤520px media query gap went 2px → 1px (`style.css`, comment updated with
the re-measurement note). Second harness run: 382 vs 378 (4px over); after
the gap change, third run: **338/0/3**. `verify_phase4.py` assertions were
updated to the short HUD labels (`Std 16`, `Prc 0`, …) and re-run green;
the Bag assertions still use full names. The saved screenshots were
regenerated by the post-fix verify re-run (short HUD labels throughout);
the Loadout/Breakdown element captures were re-shot after that re-run
overwrote them with full-page captures
(`beta-testers/reshoot_phase4_stations.py`, exit 0, no console errors).

## Dormant-rule reconciliations (honest branches)

- **Elite kills / Deep Pockets cap-half / Sensor Pulse scope / energy
  weapons** (carried from Phase 3): unchanged, still dormant; Phase 4 adds
  no new claims about them.
- **Def-level element/ammoType labels**: inert by design (Judgment call 7).
- **Enhance persistence**: hub-edit / run-local, with a plain UI warning
  (Judgment call 6). No hub gear stash invented.
- **Multi-target ammo deduction**: once per activation (Judgment call 5).
- **Breakdown RNG draws on refused overflow**: consumed, nothing else
  (Judgment call 3).
- **"You misses X" grammar nit**: pre-existing, untouched.
- **Escape-modal nit**: pre-existing, untouched.
- **Missing weapon/gear art, sim §11.2 gear-in-damage gap, depth-3 ranged
  share 0.39, brute tail p90 22**: carried over from prior phases, unchanged
  by Phase 4 (no new art per task scope).

## Open flags

1. **Incendiary near-dominance** (see sim section): economy-gated today;
   re-check dominance if crafting costs change.
2. **Enhance persistence question**: should enhanced gear survive into a
   fresh expedition (hub gear stash / extract-carry)? Needs a design call
   in a later phase; Phase 4 deliberately did not invent the system.
3. **Def-level tags**: if `WEAPON_DEFS` element/ammoType labels are ever
   meant to be live, that needs an explicit catalog decision.
4. **Phase 3 verify flake class**: `verify_phase3.py` hunt/RNG attempt
   failures (see below) — unchanged in kind from the parent re-run.
5. **Verify-script maintenance**: `verify_phase2.py` / `verify_phase3.py`
   state-shape updates noted above; `verify_phase1.py` remains stale
   (superseded by `verify_phase2.py`) and was not run as a gate.

## Files changed

- `game/core.js` — materials/caps/constants, core rolls, status manager +
  scheduler restructure, typed-pool fire/switching, breakdown, recipes +
  gates, loadout, migration, Enhance/element, crate/wreck typed pools,
  exports. `node --check` clean.
- `game.js` — HUD typed ammo, T/1–4 keys, Bag selector + typed lines, hub
  header, Salvager breakdown section + confirm modal, Armorer typed
  recipes + Enhance rows, Loadout station, status letters in render,
  wreck typed text, help text (Ammo section). `node --check` clean.
- `game/test.js` — 19 new Phase 4 tests; 12 prior tests updated to the
  typed-pool shape.
- `beta-testers/sim_ammo.js` + `sim_ammo_results.json` — typed effects,
  dominance check.
- `beta-testers/verify_phase4.py` (new), `beta-testers/p4-seed-hub.json`
  (new, generated from `serializeHub`), `beta-testers/reshoot_phase4_stations.py`
  (new, station element captures).
- `beta-testers/verify_phase2.py`, `beta-testers/verify_phase3.py` —
  state-shape maintenance edits only (see above).
- Screenshots: `beta-testers/reports/screenshots/phase4-{hud-ammo,bag-ammo,status-letters,loadout,breakdown}.png`.
