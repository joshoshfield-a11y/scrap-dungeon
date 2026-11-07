# TILEFIX REPORT — Scrap Dungeon tile coherence (2026-10-30)

Working tree only. No commits, no pushes, no merges, no publishing, no
APK built or presented by this wave. `game/core.js` untouched
(251,475 B before and after); all changes are render-time in
`game/game.js` plus tests/verifiers. No rule, stat, drop, economy,
RNG-stream, or time-cost change anywhere.

## 0. User feedback this wave answers

2026-10-30 ~02:56 PDT, two screenshots of a LEVEL 1 industrial floor
("No path there." visible at the bottom):

1. Circled tiles carry a weird shadow that makes the floor look
   inconsistent; the map looks chaotic.
2. Some doors render that don't open or aren't accessible.
3. Giant keys and crystals render as decor — confusing to new
   players. They should be pickups only, never decor.

## 1. Diagnosis per circled class (all verified in code, not assumed)

### 1a. The shadow / inconsistency — stacked darkening + hash scatter

Four independent darkening mechanisms stacked on the same tiles:

- **Per-cell hash scatter (the main cause).** `drawFloorTile` picked
  an industrial floor variant per CELL from 15 `floorVariants`
  entries via `hash2(x,y,depth)`, and walls per cell from 30
  `wallVariants`. Measured on 200 generated depth-1 industrial
  floors (diagnosis script, `reports/tilefix-diag.log`): **mean
  11.21 distinct floor variants per room (max 13)**. Dark cracked /
  diamond / mesh tiles sat next to light plain tiles, so single
  dark cells read as shadows.
- **Per-cell black outline.** Every floor tile got a 0.65-alpha
  black `strokeRect`; walls got a 3px 0.55 stroke. Outlines on
  every tile edge made each variant change a hard shadow line.
- **Graphics-pass AO strips.** 20% black, 10% of TILE, on every
  wall-adjacent floor edge — in every room, including dim ones.
- **Phase 6 fog dim.** 0.55 black overlay on explored-but-not-
  current rooms. In dim rooms AO + dim stacked into a muddy patch,
  and the dim banding across room boundaries made the patch look
  like a shadow cast by nothing.

### 1b. Doors that don't open — wall art, not real doors

`BIOMES.industrial.wallVariants` (30 entries) contained 5 door
panels: `batch3_s2_wall_door_closed_a/b` and
`batch3_s2_wall_door_open_a/b/c`. Measured: **12,384 of 73,553
wall cells (16.84%) drew as doors.** A wall cell is not walkable,
has no `floor.doors[]` record, and `doorAt` finds nothing there,
so it never opened, never pathed, and tapping it printed
"No path there" — exactly the message visible in the user's
screenshot. Real doors are `'door'` grid cells with records only.

The door GENERATOR was audited and is clean (see §4): 0 door cells
without records and 0 locked doors without keys over the same
200 floors, and `coherenceCheck` already enforces door 1:1,
no 3+ door runs, every non-spawn room ≥ 1 door, room-graph BFS,
stairs never locked, and per-lock solvability. No `core.js`
change was needed for doors. Note for the record: a locked door
that has not yet yielded its key is *supposed* to refuse entry
until the key or FORCE — that is the shipped Phase 6 rule, not
a bug, and it now only ever appears on a real door tile.

### 1c. Keys and crystals as decor — the industrial debris list

In the render loop, dressing kind `'debris'` on industrial
floors was re-rolled into
`['debris','loot_gear','loot_key','loot_crate','loot_crystal',
'debris','batch3_s2_scrap_pile_a','batch3_s2_scrap_debris']`.
`loot_key`, `loot_crystal`, `loot_gear`, `loot_crate` are the
real pickup sprites. Measured: **6,947 of 13,996 debris cells
(49.64%) drew a pickup sprite** — 1,736 fake keys, 1,829 fake
crystals over 200 floors. A gold key or crystal on the floor
was a coin flip between a real pickup and inert decor. This is
the same gold-key ambiguity the Phase 6 report flagged as
pre-existing. Note: `loot_crystal`, `loot_gear`, `loot_crate`
are not pickup kinds anywhere else in `game.js`/`core.js`
(real pickup kinds: salvage, health, food, component, ammo,
dataChip, item, key) — only the key was a real pickup being
duplicated. The fix is therefore removal, not a new crystal
pickup mechanic (out of scope: no new mechanics).

Other pools audited clean: `DRESSING_VARIANTS` (grate, barrel,
pile_scrap, console — no `loot_*`), `debrisKind()` (pile/detail
sprites only), `WIDE_ART` (consoles/servers/piles/crates_stack/
ladder/corner/stairs — no pickup sprites; `crates_stack` is
dressing art, distinct from the ammo pickup's
`item_ammo_crate_sheet`).

## 2. Files changed and why

### `game/game.js` (only game file changed)

1. **Industrial `wallVariants`: 5 door panels removed** (with a
   comment stating the ban). The door sheet keys stay in PLAIN
   and in the real-door branch (`closedKeys`/`openKeys`), which
   is the only place door art may now appear. Walls can never
   draw as doors.
2. **Industrial debris list replaced with scrap-only variants:**
   `['debris','debris','batch3_s2_scrap_pile_a',
   'batch3_s2_scrap_debris','batch3_s2_scrap_pile_wires',
   'batch3_s2_armour_broken']` — all pre-existing PLAIN keys,
   no new art. Fake-key/fake-crystal rate goes to zero by
   construction.
3. **Room-scoped floor mapping (new helpers `roomAt`,
   `roomHash`, `roomFloorKey`).** One dominant floor variant
   per room, derived from room origin + size + depth. A floor
   renders identically every load; old saves render because
   rooms are on the floor record. Corridor cells (not inside a
   room) use the biome's plain floor, so corridors read
   distinct from rooms. The `circuitBlock` override is kept
   first and unchanged: it is a single patch of one circuit
   family, i.e. a coherent patch, not scatter.
4. **Room-scoped wall mapping (new `roomWallKey` +
   `WALL_MATERIALS`).** A wall takes its material from the
   first adjacent room (N/S/W/E order), so a wall run reads as
   one material. Industrial materials: vision_wall_top/top2/
   right, `wall`, batch3 panels a/b/c, s1 panel_plain_a.
   Scrapyard: wall_scrap, batch3 panels a/b/c, batch3 corners
   a/b. Biomes without an entry already have a single wall
   material and are untouched. Non-room-adjacent walls use the
   biome's plain wall.
5. **Shadow de-stacking (the "at most one darkening" rule).**
   - Removed the per-cell floor `strokeRect` (0.65) and the
     corridor 0.15 overlay from `drawFloorTile`.
   - AO strips now apply only when `fogVis === 'full'`; dim
     rooms get fog dim only.
   - Wall 3px stroke now skipped in dim rooms; fog dim is the
     single darkening there.
   - Fog dim itself is unchanged and stays honest: current
     room full, explored-unoccupied dim (0.55), unexplored
     black. The P6 fog gate re-ran green (see §5).
6. **Pickup rings strengthened (rendering only).** Real key
   ring: alpha 0.65 → 0.85, width 2 → 3px. Generic pickup
   rings: alpha 0.65 → 0.8. Decor draws no ring at all, so a
   real key is now unmistakable next to scrap (screenshot
   `tilefix-key-vs-decor.png`, visually read: gold key + gold
   ring beside a ringless scrap pile).

### `game/test.js` (+4 tests, 158 → 162)

- No wallVariants list contains a door panel (industrial +
  scrapyard blocks of `game.js` source).
- No decor pool draws a pickup sprite (debris list,
  `DRESSING_VARIANTS`, `WIDE_ART` source audit).
- One dominant floor variant per room + coherent wall
  materials (replicates the render mapping formula over 40
  generated depth-1 floors; circuitBlock cells excluded).
- Every door cell has a record; every lock has exactly one
  key, reachable with locked doors as walls, not inside a
  locked room (30 generated depth-1 floors, own BFS).

No assertion was weakened. `core.js` generation, RNG stream,
save/load, and `coherenceCheck` are untouched.

### New scripts (not shipped in the game bundle)

- `beta-testers/tilefix_counts_after.js` — post-fix 200-floor
  count sweep under the new mapping.
- `beta-testers/verify_tilefix.py` — browser verifier: lists
  parsed from shipped `game.js` source (never a copy), live
  depth-1 floor audits, 390px screenshots, real bump + real
  tap-to-door.

## 3. Decor / pickup audit table

| Pool | Before | After |
|---|---|---|
| Industrial debris list | loot_gear, loot_key, loot_crate, loot_crystal on 4/8 entries | scrap-only (debris ×2, scrap piles, wires, broken armour) |
| DRESSING_VARIANTS | clean (no loot_) | unchanged, clean |
| debrisKind() | clean (pile/detail only) | unchanged, clean |
| WIDE_ART | clean (no loot_) | unchanged, clean |
| Industrial wallVariants | 5 door panels / 30 | 0 door panels |
| Scrapyard wallVariants | 0 door panels | unchanged, clean |
| Real key pickup | gold ring 0.65 / 2px | gold ring 0.85 / 3px |
| Other real pickups | ring 0.65 / 2px | ring 0.8 / 2px |

## 4. Door audit result

- Generator: clean. `coherenceCheck` §10 checks (door 1:1
  grid-vs-record, no 3+ runs, ≥1 door per non-spawn room,
  room-graph BFS, stairs never locked, per-lock solvability)
  pass on all generated floors; 200-floor sweep: doorNoRecord
  0, lockedNoKey 0, coherenceFail 0 (before and after — the
  door bug was render art, not generation).
- Render: fixed by §2 item 1. After the fix, 0 of 73,553 wall
  cells draw a door panel (same 200-seed sweep).
- Interaction (browser, real keys/click): bump opens a closed
  door with the player staying; second bump enters; tapping a
  closed door 3 tiles away paths and opens it (player ends on
  the door tile). Locked-door key + FORCE flows are unchanged
  `core.js` and re-proven by the Phase 6 re-run (§5).

## 5. Verification

All logs under `beta-testers/reports/` with the `tilefix-`
prefix. No log was piped through tail; no log lives in /tmp.

### Before / after (200 generated depth-1 industrial floors)

| Metric | Before | After |
|---|---|---|
| Wall cells drawing as doors | 12,384 / 73,553 (16.84%) | 0 / 73,553 |
| Mean distinct floor variants / room | 11.21 (max 13) | exactly 1 (badRooms 0) |
| Debris cells drawing a pickup sprite | 6,947 / 13,996 (49.64%) | 0 / 13,996 |
| Door cells without a record | 0 / 3,067 | 0 / 3,067 |
| Locked doors without a key | 0 | 0 |
| coherenceCheck failures | 0 | 0 |

Before: `reports/tilefix-diag.log` (diagnosis run).
After: `reports/tilefix-diag-after.log`
(`beta-testers/tilefix_counts_after.js`).

### Node tests

`reports/tilefix-node.log`: **162/162, exit 0** (baseline
158/158 + 4 new tilefix tests).

### Browser verifier (new)

`reports/tilefix-verify.log`: **15/15, exit 0, first attempt,
zero console errors.** 390px viewport. Includes: lists parsed
from shipped source; live-floor wall/debris/door audits
(0 bad in each; 62 debris cells on the live floor); spawn
screenshot; key-vs-decor fixture screenshot with gold-ring
pixel count 8 (thin but positive — the ring is a 3px line and
the sampled band is narrow; the screenshot itself, visually
read, shows the gold key + ring unmistakably beside a
ringless scrap pile); bump-open + enter; tap-to-door opens
and the player ends on the door tile.
Screenshots: `reports/screenshots/tilefix-after-spawn.png`
(240,500 B) and `reports/screenshots/tilefix-key-vs-decor.png`
(236,455 B), both visually read by this wave.

Visual read of `tilefix-after-spawn.png`: the spawn room
reads as ONE grey-mesh material wall to wall, walls as one
panel material, debris as scrap piles only, no door panels in
any wall row. This is the before/after the user asked for;
the old look is the salt-and-pepper floor in their own
screenshots (no saved pre-fix screenshot exists on disk —
the verifier screenshots are post-fix only, stated honestly).

### Regressions (all re-run on the tilefix tree)

| Suite | Baseline | This wave | Log |
|---|---|---|---|
| fixwave | 18/18 | 18/18, exit 0 | tilefix-verify-fixwave.log |
| Phase 6 | 34/0 | 34/0, exit 0 | tilefix-verify-phase6.log |
| Phase 5 | 31/31 | 31/31, exit 0 (sniper telegraph green) | tilefix-verify-phase5.log |
| Phase 4 | 20/20 | 20/20, exit 0 | tilefix-verify-phase4.log |
| Phase 2 | 16/16 | exit 0, failures [] on re-run (first run exit 1, see below) | tilefix-verify-phase2.log, tilefix-verify-phase2b.log |
| GFX | 17/17 | NOT green: run 1 16/17, run 2 14/17 — both adjudicated as check/fixture limits, not game regressions (see below); `verify_gfx.py` was NOT edited to force green | tilefix-verify-gfx.log, tilefix-verify-gfx2.log |
| Full harness | 358/1/2 | 358/1/2, exit 0 — exactly baseline, same completionist persona FAIL | tilefix-harness.log |

### Phase 2 first-run failure (hunt flake, re-run green)

First run exit 1: "shield absorb visible in a real fight"
failed in all 4 fresh runs. The evidence exonerates the
shield: the bot had equipped a Scrapper's ward +1, shield
pool 11 (fully recharged), HP 100, runState playing — it
simply never took an enemy hit inside the attempt budget
(no combat in the log tail at all). Shield absorb lives in
untouched `core.js` combat, and real fights log damage
normally on this tree (Phase 5 re-run: turret/sniper hits).
Re-run: exit 0, failures [], shield absorb verified. Same
hunt-RNG flake class as the graphics pass's shield-hunt
flake. Not waived: both logs are on disk.

### GFX failures (check/fixture limits, game code exonerated)

Run 1 (16/17): "ao: wall-adjacent floor cell found" —
the verifier's ±4 search around the player found no floor
cell with a wall above on that seed's fresh spawn floor.
Spawn rooms are up to 6 tall, so the top floor row can sit
5 away from a bottom-spawned player: the search window is
too small for tall rooms. The verifier's own comment notes
the same fragility for the flattened box in runs 1–5.

Run 2 (14/17): three FAILs, two mechanisms, neither a game
regression (AO in full rooms, FIRE, LOS, and particles are
all untouched by this wave):

- "ao: wall-adjacent floor edge darker than centre",
  cell (53,25), edge 73.3 vs centre 47.8. The AO strip
  still renders in full rooms (only dim rooms lost it, by
  design). The check does not control for the underlying
  art or for `drawPlainFloor`'s per-cell vertical flip.
  Measured directly from the shipped PNGs (PIL, top/mid/
  bottom bands): `vision_floor_circuit` FAILS the check's
  inequality even with the AO strip applied
  (0.8 × top 65.0 = 52.0 > mid 47.9). Any room dominated
  by circuit art fails this check with AO working
  perfectly. Under the old per-cell scatter the same check
  failed only when the sampled cell happened to be an
  unflipped circuit tile; room-dominant mapping makes it
  fail deterministically for a circuit room instead. The
  check needs an art control (exclude circuit art, or
  compare the same cell with AO on/off) — that is a check
  fix for a future wave, not a game fix, and it was NOT
  made here to force green.
- "fire: tracer spawned on FIRE" 0 and "fire: impact
  sparks spawned on hit" 0, with log "Fire: no target in
  line of fire" and diag foe at (61,27), player at
  (58,27). The grid is 60 wide (x 0–59): the crafted foe
  was placed OUT OF BOUNDS (58 + 3 = 61), so the shot scan
  correctly found nothing and no tracer/sparks spawned.
  The verifier documents the same symptom class for runs
  3/7 (there: stale door records; here: out-of-bounds
  placement, proved by the diag coordinates). Fixture
  placement bug, not a FIRE/LOS regression — FORCE sparks
  + tracer passed in the same run, and Phase 5 combat
  logging is green on this tree.

Deltas vs baseline: none in game behavior. The Phase 5
sniper telegraph is green on this tree (it was also green
in the fixwave and graphics runs; the pre-fixwave
parent-run failure remains mechanism-unexplained, but it
is not reproducing on any post-fixwave tree).

## 6. What is still missing / known limits

- **No pre-fix browser screenshot exists on disk** to put
  beside the post-fix one; the before/after comparison is
  quantitative (the 200-floor counts above) plus the user's
  own screenshots as the "before".
- **Phase 5 pose sheets still missing** for flyer, shielder,
  sniper, bomber, turret (slide + hop only) — carried over,
  untouched by this wave (no new sprite art, per scope).
- **No weapon/armor/shield/utility sprites anywhere** —
  carried over.
- **Harness completionist persona gap** — carried over,
  not a tilefix regression; the persona was not changed to
  pass anything. This run's instance: pickup at (55,31),
  persona stalled at (55,29) with pickups unchanged.
- **GFX verifier not green on this tree** (see §5): the AO
  check needs an art control and the FIRE fixture needs a
  bounds guard on crafted-foe placement. Both are verifier
  fixes, deliberately NOT made in this wave; the parent
  decides whether to accept the adjudication or order the
  check fixes. No game behavior is implicated by either.
- **Gold-ring pixel count is thin (8px)** in the automated
  check because the sampled band is narrow; the visual
  screenshot evidence is stronger than the pixel count.
  A wider ring-band sample would firm the number up if a
  future wave wants it.
- **Dim explored rooms still get fog dim only** (AO skipped
  there by design, protecting the P6 fog ratios). If dim
  rooms read too dark on the phone, that is the tuning knob —
  any change must re-run the P6 fog gate.
- **A locked door with its key still uncollected refuses
  entry by design** (Phase 6 rule). After this fix such a
  door only ever appears as a real door tile with a red lock
  marker, never as a wall panel, so the refusal is no longer
  confused with a fake door.
- `core.js` generation changes were NOT needed; if a future
  audit finds a real-door gap, it is a generator fix, not a
  render fix, and this report's door audit is the baseline.
