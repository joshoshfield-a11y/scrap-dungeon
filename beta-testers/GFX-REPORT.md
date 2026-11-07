# Scrap Dungeon — Graphics Quality Pass Report

Date: 2026-10-30. Working tree only; no commits, pushes, merges, or publishing.
Scope: rendering only. `game/core.js` untouched — no rule, stat, drop,
economy, RNG, or time-cost change anywhere in this pass. No new sprite
sheets generated. Menus keep the neon-card system from the fix wave;
this pass extends it, it does not replace it.

## 1. Engine decision: STAY on Canvas 2D

Prototype: `beta-testers/graphics-proto/index.html` + `measure.py`,
screenshot `beta-testers/reports/screenshots/gfx-proto.png`,
log `beta-testers/reports/gfx-proto.log`.

The prototype renders the same scene (14x9 grid, TILE 64, mech sprite
sheet, dressing) two ways: (a) current Canvas 2D with pre-rendered
radial glow + `'lighter'` composite + AO strips; (b) raw WebGL (no
PixiJS/CDN — the sandbox page cannot fetch a CDN at test time),
vertex-coloured tile quads, per-pixel light falloff in the fragment
shader, additive glow quad.

Findings:

- Canvas 2D: 59.5 fps first run, ~31-47 fps on later noisy sandbox runs
  (both panels animate in one page, so numbers are comparative only).
- WebGL context works (WebGL 1.0, OpenGL ES 2.0 Chromium), but
  `texImage2D` from a `file://` `<img>` throws a cross-origin error, so
  the sprite path fails on the game's own test path (Canvas `drawImage`
  of the same image works). A fallback flat-coloured quad let the
  lighting render; WebGL fps 46 on the shared page.
- WebGL falloff as tuned rendered the scene near-black (dark base
  tiles x 0.25 floor) — tuning work, not a quality win.

Decision: **STAY on Canvas 2D**, per the brief's default (stay unless
WebGL is clearly, visibly better at comparable cost). WebGL was not
clearly better, and it adds a sprite-loading failure mode plus a
tuning burden for no visible gain. No migration plan is owed unless
this decision is overturned; any future swap must preserve `core.js`
rules, the node suite, and all `verify_*.py` gates. Sandbox fps numbers
are NOT phone evidence; the final call on any swap needs the S25 check.

## 2. Effects implemented (all rendering-only)

File changes: `game/game.js` 124,458 -> 135,513 B (134,739 after the
effect work, +774 for the fog-clip edit),
`game/style.css` 8,402 -> 9,632 B, `game/index.html` 5,300 -> 5,454 B.
`game/core.js` unchanged at 251,475 B.

1. **Player point-light glow.** One pre-rendered 256x256 radial-gradient
   canvas (cyan 0.55 -> 0), `'lighter'` composite, radius 3.5 tiles
   following the sliding render position, plus pulsing terminal/conduit
   glows (alpha `0.75 + 0.25*sin(Date.now()/300)`). NO per-frame
   `shadowBlur` anywhere (only comments mention it) — phone performance.
2. **Wall/floor depth.** `rgba(0,0,0,0.20)` strips, 10% of TILE, on
   floor edges adjacent to walls (not wall/door/void cells), so walls
   read taller than floors.
3. **Tile micro-animation.** Time-based alpha on existing dressing
   only: console/term/panel/circuit/keypad/server kinds flicker a cyan
   bar; vent/grate kinds vent two rising steam dots. Subtle by design.
4. **Combat FX**, via the existing floats pattern. `doFire` spawns a
   muzzle tracer + a tracer to the first hit, or on a miss to the first
   wall/void/closed-door cell along the facing line (max 12 steps,
   visual only; core already decided hit/miss/damage) + impact sparks
   (8 on hit, 4 on miss). `doForce` spawns sparks + a tracer on the
   faced door tile. No damage, timing, or time-unit change.
5. **Path visualizer.** `walkTo` builds absolute trail tiles from its
   BFS steps (`trailFrom`/`setPathTrail`/`refreshPathTrail`, rebuilt on
   door re-paths, cleared by `cancelWalk`, expires ~200 ms after the
   walk ends); `render()` draws 6px cyan dots, skipping black fog cells.
6. **HUD modernization, neon style.** HP bar fill width % (green >50%,
   amber >25%, red at/below; text numbers stay authoritative), ammo
   cartridge glyph `▰`, glass dock (`rgba(11,14,20,0.88)` +
   `blur(8px)`). Every button's function, order, and >=44px tap targets
   at 390px kept (quickbar measured 48x48). Narrow-screen fix: HUD font
   9px -> 8px and bar 56px -> 22px at <=520px (the first version
   overflowed one line at 390px: scrollWidth 422 vs clientWidth 378).
7. **Scanline/vignette: KEPT.** `#fx-overlay` (repeating-linear-gradient
   scanlines + radial vignette, `pointer-events: none`, z-index 3 below
   stairs panel/transient message), toggleable from the Menu via
   `toggleFxOverlay()` ("FX overlay: ON/OFF" button, `body.fx-off`
   hides it). Kept because screenshots stayed readable.

Debug: `window.__scrapDebug.fxState()` returns `{particles, tracers
(counts, NOT arrays), trail, fxOverlayOn}`.

### Fog-clip fix (real bug found by the Phase 6 gate, fixed in this pass)

The first glow implementation was unclipped and lit cells outside the
spawn room, failing P6-FOG ("only the spawn room renders", violations
at brightness 0.46-0.81, e.g. (14,20) 0.811). Fix: glow is clipped to
full-brightness cells only (`fogVisibility() === 'full'` path in
`render()`), terminal glows full-cells only. The rejected alternative
(re-applying the fog overlay after glow) would have pushed dim ratios
below the 0.30-0.65 band. Phase 6 re-ran green after the fix (see §3).

## 3. Verification (all logs under `beta-testers/reports/`, prefix `gfx-`)

Baselines from the fix wave: node 158/158, fixwave 18/18, P6 34/0,
P5 31/31, P4 20/20, P2 16/16, harness 356/1/3 (known completionist
locked-door persona FAIL — persona has no key/locked-door handling;
game door rules were NOT changed to pass it).

| Gate | Result | Log |
| --- | --- | --- |
| node `game/test.js` (post-clip) | 158 pass / 0 fail, exit 0 | `gfx-node2.log` |
| gfx verifier (17 checks) | 17/17, exit 0 | `gfx-verify11.log` |
| Phase 6 | exit 0, first attempt, failures [] | `gfx-verify6b.log` |
| Phase 5 | exit 0, first attempt, all sections True (see flake note) | `gfx-verify5b.log` |
| Phase 4 | exit 0, failures [], 20 PASS lines | `gfx-verify4.log` |
| Phase 2 | exit 0, failures [], 16/16 (see flake note) | `gfx-verify2b.log` |
| Fixwave | 18/18, exit 0 (see fixture fix) | `gfx-verify-fixwave6.log` |
| Full harness | 358 PASS / 1 FAIL / 2 NOTE (baseline 356/1/3) | `gfx-harness.log` |

Gfx verifier evidence (run 11, exit 0): HUD fill 100% -> 25%, ammo
glyph, dock glass, HUD fits one line at 390px, quickbar >=44px, no
horizontal overflow; FX toggle ON -> OFF -> ON; glow player-tile blue
104.8 vs far tile 25.3; AO edge 30.9 vs centre 117.0; flicker console
tile diff 1574/1849 pixels between frames; trail 2 tiles; FIRE 2 tracers
+ 8 sparks; FORCE 8 sparks + 1 tracer; zero console errors.
Screenshots visually read (run 11 + dedicated mid-walk shot
`gfx-trail-midwalk.png`): glow halo around the player, HP bar red at
25 / green at 72, tracer line + sparks + "-17" float on FIRE, trail
dots subtle 6px (fxState is the solid evidence; screenshots show them
only faintly).

### Failures seen during this pass — none waived, all dispositioned

- **P6-FOG (real game bug, fixed):** unclipped glow lit cells outside
  the spawn room. Fixed by clipping glow to full-brightness cells
  only; P6 green on re-run (`gfx-verify6b.log`).
- **P5 sniper telegraph (intermittent flake, NOT a gfx regression):**
  first gfx run exit 1, sniper section False (aim telegraph None after
  the first wait, shot landing outside the poll window). Re-run with
  zero changes: exit 0, sniper True, first attempt
  (`gfx-verify5b.log`). Same failure appeared in pre-gfx Phase 6
  regress runs and passed on the fixwave tree — it flips across runs
  on untouched `core.js` and untouched sniper/scheduler code.
  Mechanism still unexplained; it is a test-timing flake candidate,
  not evidence of a gfx regression.
- **P2 shield hunt (intermittent flake, NOT a gfx regression):** first
  gfx run exit 1 — the bot's run died (hp 0, depth 3, 437 actions)
  before finding a shield within 5 floors. Re-run with zero changes:
  exit 0, 16/16 (`gfx-verify2b.log`). Same flake class as the fixwave's
  P2 re-run (known hunt-RNG flake).
- **Fixwave walk checks (intermittent flakes + one fixture fix):**
  five gfx fixwave runs went 17/18 (foe LOS), 18/18, 17/18 (mid-walk
  timing at 70 ms), 16/18 (click/init under load — player never moved,
  logTail seed-only), 17/18 (foe LOS). The foe-LOS mode has a known
  mechanism: `flatten_box` clears doors only within +/-6, but the foe
  sits at +9, so a generated wall/door beyond the box blocks LOS for
  the whole walk and the game correctly never stops. Fixture fix
  applied to `beta-testers/verify_fixwave.py` (NOT game code): after
  placing the foe, the sight-line row between player and foe is set to
  corridor and doors on that segment are dropped, so the precondition
  (foe CAN become visible) holds; the assertion (walk stops short +
  "Something stirs") is unchanged. Re-run after the fix: 18/18, exit 0
  (`gfx-verify-fixwave6.log`). The mid-walk and click/init modes are
  timing/load races in fixed waits, not deterministic failures — full
  passes interleave with them on identical game code.

## 4. Performance notes and risks

- Glow uses one pre-rendered gradient + `'lighter'` composite; no
  per-frame `shadowBlur`; tracers/sparks reuse the existing
  short-lived particle/float pattern (bounded counts, expiring).
- Micro-animation is time-based alpha on existing dressing only; no
  new textures, no per-frame allocations of note.
- Sandbox fps numbers are comparative only and are NOT phone evidence.
  The S25 check remains the gate for real performance (and for the
  WebGL question, if it is ever reopened).
- Risk: the clipped glow means terminals/conduits in dim (explored)
  rooms do not glow — deliberate, to keep Phase 6 fog ratios intact.
  If that reads as too dark on the phone, the dim-cell glow level is
  the tuning knob, but any change must re-run the P6 fog gate.

## 5. Still missing / not done in this pass

- Phase 5 pose sheets for flyer/shielder/sniper/bomber/turret (slide +
  bob only; boss sheets wired in the fix wave). Carried from the fix wave.
- No weapon/armor/shield/utility sprite files exist anywhere (verified
  2026-10-28); this pass used existing dressing/mech art only.
- No renderer swap: Canvas 2D stays (see §1). A future WebGL/PixiJS
  swap needs the S25 check plus a migration plan preserving `core.js`,
  the node suite, and all `verify_*.py` gates.
- Sniper-telegraph test timing flake mechanism unexplained (see §3);
  worth a dedicated look if it recurs, but it is not a gfx regression.
- Harness: the single FAIL is the known completionist persona gap
  (this run: "an enemy can be fought and killed — kills=0 hp=100
  state=playing"; the persona has no key/locked-door handling and
  wanders without engaging). Same persona as the fix-wave baseline
  FAIL; PASS count is up 2 (358 vs 356), NOTEs down 1 (2 vs 3). No new
  failure mode. Game door rules were NOT changed to pass it.
