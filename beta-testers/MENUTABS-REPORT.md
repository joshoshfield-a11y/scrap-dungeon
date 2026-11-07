# Menu-tabs wave — report (2026-10-30)

Working tree only. No commits, no pushes, no APK. The wave is visual/UX
only: same stations, same options, same order, same behavior. No rule,
stat, drop, economy, RNG, or time-cost change. `core.js` untouched.

## What changed

### Bag: one scrolling modal → 5 tabs (Gear, Ammo, Skills, Keys, Info)

Tab bar sits under the title, above every section (first cut appended it
after the sections, which buried it below a long Gear list — moved).
Tab choice persists across re-renders AND across closes/re-opens
(`bagTab` module var). `showModal` clears stale appended Bag sections
and resets `modalBody` display, so no tab content leaks into other modals.

| Old Bag section | New tab |
|---|---|
| Equipment (4 slots + carried list + derived-totals line) | Gear |
| Ammo assign selector + T/1–4 behavior | Ammo |
| Mech skill cards + energy/heat | Skills |
| Carried keys + door labels | Keys |
| Inventory summary, hub summary, Codex, actions/clock/power/kills/seed, Use-item rows | Info |

### Gear tab: per-item effects (the core gap this wave closes)

Every equipped and carried piece now shows an `Adds:` line with exactly
what that piece contributes, computed from the shipped tables — never
invented numbers:

- Source: `C.gearStatValue(C.GEAR_DEFS[defId], key, tier, upgrade)` —
  the exact scaling `derivedStats` uses (tier multiplier × 1.12^upgrade,
  rounded). New node tests pin this: the equipped-piece vector equals
  derived totals minus base, and `gearStatValue` matches `derivedStats`
  for every def/key.
- Slots and the keys they report: armor → Armor, Max HP; shield →
  Shield capacity; utility → Evasion, Range, Sight, Power bonus (only
  keys the def actually defines; a key a def lacks reads 0 and is
  omitted, never shown as +0).
- Examples verified in the browser at 390px: Rare +1 Alloy vest
  → Armor +3 · Max HP +14; Uncommon +2 Alloy aegis → Shield +22;
  Epic +2 Nano bastion → Shield +57; Common +0 Sensor → Sight +2;
  Common +0 Power cell → Power bonus +40.
- Swap preview: each carried piece shows a `Swap:` delta line —
  candidate minus currently equipped piece in the same slot, run through
  the real `derivedStats` on a throwaway clone (live state never
  touched). Examples: Rare Ablative weave vs equipped vest →
  Armor +1 · Max HP +10; Uncommon Scope vs equipped Sensor →
  Range +1 · Sight −2. Shield swaps note the pool resets to 0 (that is
  the shipped `equipCarried` behavior, now stated in the preview).
- Pilot mods cannot drop on a swap, because armor replaces armor — the
  preview is per-slot, so cross-slot drops never arise.

### Hub: 8 station cards → 5 tabs (same stations, same order inside each group)

| Station | New tab |
|---|---|
| The Mechanic — chassis upgrades | Upgrades |
| The Researcher — Codex and banking | Upgrades |
| The Salvager — exchange (incl. Breakdown) | Salvage & Crafting |
| The Armorer — crafting (incl. Enhance) | Salvage & Crafting |
| Loadout — starting ammo | Loadout |
| The Scout — threat intel | Intel |
| The Radio Operator — rumors | Intel |
| The Instructor — pilot skills | Pilot |

Tab choice persists across re-renders and station actions
(`hubTab` module var); a station action never resets the tab.
One stale wording fixed along the way: the hub header said "see The
Instructor below" — now "see The Instructor on the Pilot tab".

### Not tabbed (out of scope, unchanged)

Menu/Help, Log, stairs, and use-item popups remain single modals.

### Style

Same neon-card style. Tab buttons are the same neon button treatment
(active tab gets the hover background + glow so it reads as selected).
All tab buttons 48px tall at 390px (bar: 44px). No horizontal overflow
in any tab at 390px. Modal back/close behavior preserved (Close
buttons, Hub button, Cancel paths, Escape).

## Bugs found and fixed during verification (not waived)

1. **Hub tabs did nothing on first open (real bug).** The tab bar was
   built while the hub wrap was still detached from the document, so
   `applyHubTab`'s document query found nothing and every station
   showed until the first tab click. Fix: append the wrap to the
   document BEFORE building the tab bar and applying the tab filter.
   The verifier caught this (Upgrades tab showed the Salvager).
2. **My own verifier check was wrong, not the game.** "Reopening the
   Bag lands on the Gear tab again" assumed a forced reset; the
   implementation deliberately persists the last-used tab, so reopening
   on Info after closing on Info is correct. The check now asserts
   persistence (Info persists) and then re-selects Gear.
3. **Bag tab bar placement.** First cut appended the bar after the
   sections (below the fold on Gear). Moved under the title.

## Verification

Browser: Playwright from `~/workspace/venvs/ml-stack`,
`TMPDIR=~/workspace/.playwright-tmp`, viewport 390px. Screenshots
visually read by the verifier author (see below).

| Check | Result | Log |
|---|---|---|
| Node tests (162 baseline + 2 new menutabs tests) | 164 pass, exit 0 | `beta-testers/reports/menutabs-node.log` |
| Menu-tabs browser verifier (28 checks: every tab reachable, per-item effects match GEAR_DEFS/derived values, swap deltas, ≥44px buttons, no overflow, zero console errors) | 28/28, exit 0 | `beta-testers/reports/menutabs-verify.log` |
| Tile-coherence regression | exit 0 (15/15) | `beta-testers/reports/menutabs-verify-tilefix.log` |
| Phase 6 regression | exit 0 (34/0) | `beta-testers/reports/menutabs-verify-phase6.log` |
| Phase 5 regression | exit 0 (31/31) | `beta-testers/reports/menutabs-verify-phase5.log` |
| Phase 4 regression, unadapted scripts | exit 1 — 4 tab-visibility artifacts (see below) | `beta-testers/reports/menutabs-verify-phase4.log` |
| Phase 4 regression, tab-adapted scripts | exit 0 | `beta-testers/reports/menutabs-adapt-phase4.log` |
| Phase 2 regression | exit 0 (16/16) | `beta-testers/reports/menutabs-verify-phase2.log` |
| Fix-wave regression, unadapted scripts | exit 1 — 2 tab-measurement artifacts + 1 boss-slide timing flake (see below) | `beta-testers/reports/menutabs-verify-fixwave.log` |
| Fix-wave regression, tab-adapted scripts | 18/18, exit 0 | `beta-testers/reports/menutabs-adapt-fixwave.log` |
| Graphics verifier | 17 PASS, FAILURES [], exit 0 — its two known fixture issues (AO check on circuit art; FIRE fixture foe out of bounds) did NOT trigger this run; the fixtures themselves are unchanged and still fragile | `beta-testers/reports/menutabs-verify-gfx.log` |
| Full harness | 359 PASS, 0 FAIL, 2 NOTE, exit 0 (baseline 358/1/2) | `beta-testers/reports/menutabs-harness.log` |

### Screenshots (390px, visually read)

- `beta-testers/reports/screenshots/menutabs-bag-gear.png` — Gear tab:
  tabs on top, Gear active, equipped pieces with Adds lines, carried
  pieces with Adds + Swap delta lines.
- `beta-testers/reports/screenshots/menutabs-bag-info.png` — Info tab:
  summary body, Codex, actions/clock/power/kills/seed, Use-item rows.
- `beta-testers/reports/screenshots/menutabs-hub-upgrades.png` —
  Upgrades tab: Mechanic + Researcher only, Salvager hidden.
- `beta-testers/reports/screenshots/menutabs-hub-pilot.png` — Pilot tab:
  Instructor only.

### Legacy-verifier adaptations (disclosed, not hidden)

Tabs break two legacy-verifier assumptions: `modal.innerText`
excludes `display:none` sections, and `getBoundingClientRect().height`
is 0 for hidden buttons. The unadapted runs above prove exactly which
checks those assumptions break — and that the underlying game state
was correct in every case (e.g. phase 4 evidence: selector clicked,
`selected='piercing'`, HUD `Prc 0`, stepper clicked — only the
`innerText` read missed it). The adaptations below navigate the new UI
the way a player must; **no assertion and no threshold was changed**:

- `beta-testers/verify_phase4.py`: click the Info tab before reading
  the Bag pools line (pools live in the modal body = Info tab); click
  the Loadout tab before reading the Loadout preview/stepper lines.
  Both edits are commented "Menutabs adaptation (2026-10-30)".
- `beta-testers/verify_fixwave.py`: Bag and hub button-height
  measurements filter to visible buttons (`offsetParent !== null`);
  the ≥44px threshold is unchanged. Also commented as above.
- Not adapted (did not need it): tilefix, phase 6, phase 5, phase 2,
  gfx verifiers all pass unadapted.

### Flakes observed (mechanism unexplained, not claimed fixed)

- Fix-wave boss-slide check failed once (boss sampled at spawn,
  pose rest, progress 0), then passed 18/18 on the adapted re-run with
  nothing in the boss section changed. Timing/sample race, same class
  as the documented walk-test races.
- Phase 4 adapted run: attempt 1 failed one F-press check (pools
  unspent, clock 0 — the press did not register); attempt 2 fully clean.
- Harness: 359/0/2 vs baseline 358/1/2. The known completionist-persona
  FAIL did **not** reproduce this run; no completionist code was
  touched, so this is **not** claimed fixed — the persona key/door gap
  decision (extend persona vs accept the FAIL) is still the user's call.
  The 2 NOTEs are the known minors: unreferenced
  `prop_salvage_sheet.png`, and wall bumps giving no feedback.

## Still missing / carried flags

- Menu/Help, Log, stairs, use-item popups are still single modals
  (out of scope for this wave, not a regression).
- No weapon/armor/shield/utility sprite files exist anywhere; the Gear
  tab is text lines, not art. Pose sheets still missing for
  flyer/shielder/sniper/bomber/turret (slide + bob only).
- Carried flags from earlier waves, unchanged: Incendiary
  near-dominance; Enhance hub-edit/run-local persistence question; sim
  not extended with gear; "You misses X" nit; Escape-modal nit;
  player/enemy spike divergence; void does not block LOS (F12);
  gold-key debris ambiguity (tile-fix may have resolved it);
  doorless-room retry driver (701/3,000 floors); at-most-1-locked-room-
  per-floor builder decision; §9.7.2(2) alongside-corridor ambiguity;
  sniper-telegraph flake (green on this tree, mechanism unexplained).
