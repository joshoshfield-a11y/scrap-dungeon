#!/usr/bin/env python3
"""Graphics-pass verifier for Scrap Dungeon (GFX-REPORT evidence).

Runs the real game in headless Chromium at 390px via file://, using
fixtures through window.__scrapDebug exactly like verify_phase6.py.
Checks, all rendering-only (no rule, stat, drop, economy, RNG, or
time-cost change is asserted here — those gates are the node suite
and the phase verifiers):

  GFX-GLOW   player point-light glow brightens tiles near the player
             (PIL blue-channel comparison, player tile vs far floor)
  GFX-AO     floor edge next to a wall is darker than the tile centre
  GFX-FLICKER a console-like dressing tile changes pixels between
             two frames 350 ms apart (time-based alpha)
  GFX-TRAIL  tap-to-walk sets a multi-tile path trail in fxState
  GFX-FIRE   FIRE spawns a tracer + impact sparks in fxState
  GFX-FORCE  FORCE spawns sparks + a tracer in fxState
  GFX-HUD    HP bar width follows HP (100% -> 25% after a wait),
             ammo cartridge glyph present, dock glass background,
             HUD fits one line at 390px, quickbar buttons >= 44px,
             no horizontal overflow
  GFX-FXTOGGLE Menu "FX overlay" button toggles body.fx-off and the
             overlay's display, and back again

Screenshots under beta-testers/reports/screenshots/gfx-*.png, all
visually read by the pass author. Exit 0 only when every check
passes; failures list printed at the end. Never pipe through tail.
"""
import sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from testers.common import GAME_URL

from playwright.sync_api import sync_playwright

REPORTS = Path(__file__).parent / "reports"
SHOTS = REPORTS / "screenshots"
FAILURES = []


def check(name, ok, evidence):
    print(("PASS " if ok else "FAIL ") + name + " | " + str(evidence), flush=True)
    if not ok:
        FAILURES.append(name)


def new_run(page):
    # A fresh page load auto-starts a playing run (as in
    # verify_phase5.py); reloading is the clean reset. A reload
    # restores the previous run behind a boot modal ("New
    # Expedition" / "Continue") — dismiss it with Continue so the
    # game underneath is clickable again.
    page.goto(GAME_URL)
    page.wait_for_timeout(1500)
    cont = page.evaluate(
        """() => {
          const m = document.getElementById('modal');
          if (getComputedStyle(m).display === 'none') return false;
          const b = [...document.querySelectorAll('#modal-btns button')]
            .find(x => x.textContent === 'Continue');
          if (b) { b.click(); return true; }
          return false;
        }""")
    if cont:
        page.wait_for_timeout(300)
    # The boot modal can render after the first dismiss on a slow
    # load; one retry keeps a late modal from swallowing the next
    # keypress (the run-3 FIRE 0/0 is suspected to be exactly that).
    page.wait_for_timeout(400)
    page.evaluate(
        """() => {
          const m = document.getElementById('modal');
          if (getComputedStyle(m).display === 'none') return;
          const b = [...document.querySelectorAll('#modal-btns button')]
            .find(x => x.textContent === 'Continue');
          if (b) b.click();
        }""")
    page.wait_for_timeout(200)


def flatten_box(page, half=6):
    # NOTE (run-9 root cause): reclassifying grid cells to 'floor'
    # is NOT enough — a stale Phase 6 door record on a flattened
    # cell still blocks shots (doorBlocksSight) and pathing, which
    # is exactly why runs 3 and 7 read FIRE 0/0 with "no target in
    # line of fire" while the foe stood 3 tiles east. The game was
    # correct; the fixture was incomplete. Door records inside the
    # box are removed too.
    page.evaluate(
        """([half]) => {
          const s = window.__scrapDebug.getState();
          const p = s.player;
          for (let y = p.y - half; y <= p.y + half; y++)
            for (let x = p.x - half; x <= p.x + half; x++)
              if (x >= 0 && y >= 0 && x < 60 && y < 44) s.floor.grid[y][x] = 'floor';
          s.floor.hazards = s.floor.hazards.filter(h =>
            Math.max(Math.abs(h.x - p.x), Math.abs(h.y - p.y)) > half);
          s.floor.pickups = s.floor.pickups.filter(pk =>
            Math.max(Math.abs(pk.x - p.x), Math.abs(pk.y - p.y)) > half);
          s.floor.doors = (s.floor.doors || []).filter(d =>
            Math.max(Math.abs(d.x - p.x), Math.abs(d.y - p.y)) > half);
          s.floor.enemies = [];
        }""", [half])


def craft_foe(page, foe_type, dx, dy):
    return page.evaluate(
        """([foeType, dx, dy]) => {
          const s = window.__scrapDebug.getState();
          const C = window.ScrapCore;
          const d = C.ENEMY_TYPES[foeType];
          const foe = {
            id: 'gfx-' + foeType + '-' + s.floor.enemies.length,
            type: foeType, name: d.name,
            x: s.player.x + dx, y: s.player.y + dy, facing: 0,
            hp: d.hp, maxHp: d.hp, dmg: d.dmg, dmgVar: d.dmgVar,
            armor: d.armor, acc: d.acc, evasion: d.evasion,
            interval: d.interval, nextTime: 0,
            salvageMin: d.salvageMin, salvageMax: d.salvageMax,
            sight: d.sight, retreat: d.retreat,
            alive: true, awake: true, statuses: [],
          };
          s.floor.enemies.push(foe);
          return foe.id;
        }""", [foe_type, dx, dy])


def face_toward(page, dx, dy):
    page.evaluate(
        """([dx, dy]) => {
          const s = window.__scrapDebug.getState();
          s.player.facing = window.ScrapCore.dirIndexFor(dx, dy);
        }""", [dx, dy])


def tile_rect(page, ex, ey):
    return page.evaluate(
        """([ex, ey]) => {
          const canvas = document.getElementById('game');
          const main = document.getElementById('main');
          const W = canvas.width, H = canvas.height;
          const w = main.clientWidth;
          const cols = w < 520 ? 9 : w < 900 ? 11 : 12;
          const TILE = Math.max(32, Math.round(w / cols));
          const s = window.__scrapDebug.getState();
          const fw = 60 * TILE, fh = 44 * TILE;
          let ox, oy;
          if (fw <= W) ox = (W - fw) / 2;
          else ox = Math.max(W - fw, Math.min(0, W / 2 - (s.player.x + 0.5) * TILE));
          if (fh <= H) oy = (H - fh) / 2;
          else oy = Math.max(H - fh, Math.min(0, H / 2 - (s.player.y + 0.5) * TILE));
          const r = canvas.getBoundingClientRect();
          return [r.left + ox + ex * TILE, r.top + oy + ey * TILE, TILE];
        }""", [ex, ey])


def main():
    from PIL import Image
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--use-gl=swiftshader", "--force-device-scale-factor=1"])
        page = browser.new_page(viewport={"width": 390, "height": 844})
        page.on("console", lambda m: print("CONSOLE:", m.type, m.text) if m.type == "error" else None)
        page.goto(GAME_URL)
        page.wait_for_timeout(800)

        # ---- HUD (fresh run, full HP) ----
        new_run(page)
        page.wait_for_timeout(500)
        hud = page.evaluate(
            """() => {
              const hud = document.getElementById('hud');
              const fill = document.getElementById('hud-hp-fill');
              const dock = document.getElementById('dock');
              const icon = document.querySelector('.hud-ammo-icon');
              const qb = [...document.querySelectorAll('#quickbar button')].map(
                b => [b.textContent.trim(), Math.round(b.getBoundingClientRect().width),
                      Math.round(b.getBoundingClientRect().height)]);
              return { fillW: fill ? fill.style.width : null,
                       dockBg: getComputedStyle(dock).backgroundColor,
                       icon: icon ? icon.textContent : null,
                       hudFit: hud.scrollWidth <= hud.clientWidth + 1,
                       qb: qb,
                       overflow: document.documentElement.scrollWidth <= 391 };
            }""")
        check("hud: hp fill 100% at full hp", hud["fillW"] == "100%", hud["fillW"])
        check("hud: ammo cartridge glyph", hud["icon"] == "▰", hud["icon"])
        check("hud: dock glass background", hud["dockBg"].startswith("rgba(11, 14, 20, 0.88)"), hud["dockBg"])
        check("hud: fits one line at 390px", hud["hudFit"], hud["hudFit"])
        check("hud: quickbar buttons >= 44px", all(w >= 44 and h >= 44 for _, w, h in hud["qb"]), hud["qb"])
        check("hud: no horizontal overflow", hud["overflow"], hud["overflow"])
        # HP bar follows HP: set 25, wait one turn (Space = wait), re-read.
        page.evaluate(
            """() => { window.__scrapDebug.getState().player.hp = 25; }""")
        page.keyboard.press(" ")
        page.wait_for_timeout(300)
        fill25 = page.evaluate("() => document.getElementById('hud-hp-fill').style.width")
        check("hud: hp fill 25% after hp set to 25", fill25 == "25%", fill25)

        # ---- FX overlay toggle ----
        page.click("#btn-menu")
        page.wait_for_timeout(300)
        tog = page.evaluate(
            """() => {
              const b = [...document.querySelectorAll('#modal-btns button')]
                .find(x => x.textContent.startsWith('FX overlay'));
              return b ? b.textContent : null;
            }""")
        check("fxtoggle: menu shows FX overlay ON", tog == "FX overlay: ON", tog)
        page.click("#modal-btns button:has-text('FX overlay: ON')")
        page.wait_for_timeout(300)
        off = page.evaluate(
            """() => ({
              cls: document.body.classList.contains('fx-off'),
              disp: getComputedStyle(document.getElementById('fx-overlay')).display,
              label: [...document.querySelectorAll('#modal-btns button')]
                .find(x => x.textContent.startsWith('FX overlay')).textContent })""")
        check("fxtoggle: OFF hides overlay", off["cls"] and off["disp"] == "none"
              and off["label"] == "FX overlay: OFF", off)
        page.click("#modal-btns button:has-text('FX overlay: OFF')")
        page.wait_for_timeout(300)
        on = page.evaluate(
            """() => ({
              cls: document.body.classList.contains('fx-off'),
              disp: getComputedStyle(document.getElementById('fx-overlay')).display })""")
        check("fxtoggle: ON restores overlay", (not on["cls"]) and on["disp"] != "none", on)
        page.click("#modal-btns button:has-text('Close')")
        page.wait_for_timeout(200)

        # ---- Glow (flattened arena, player centred) ----
        flatten_box(page, 6)
        page.wait_for_timeout(300)
        page.screenshot(path=str(SHOTS / "gfx-glow.png"))
        cells = page.evaluate(
            """() => {
              const s = window.__scrapDebug.getState();
              const p = s.player, g = s.floor.grid;
              let far = null;
              for (const [dx, dy] of [[5, 0], [-5, 0], [0, 5], [0, -5]]) {
                const x = p.x + dx, y = p.y + dy;
                if (x > 0 && y > 0 && x < 59 && y < 43 && g[y][x] === 'floor') { far = [x, y]; break; }
              }
              return { player: [p.x, p.y], far: far };
            }""")
        img = Image.open(SHOTS / "gfx-glow.png").convert("RGB")
        px, py = cells["player"]
        rx, ry, tile = [int(v) for v in tile_rect(page, px, py)]
        # Player tile centre vs far tile centre: glow adds cyan, so the
        # blue channel near the player should exceed the far tile's.
        # The far tile must be on-screen: pick the first candidate
        # whose rect centre lies inside the screenshot.
        def mean_blue(cx, cy, r):
            vals = []
            for yy in range(max(0, cy - r), min(img.height - 1, cy + r) + 1):
                for xx in range(max(0, cx - r), min(img.width - 1, cx + r) + 1):
                    vals.append(img.getpixel((xx, yy))[2])
            return sum(vals) / len(vals) if vals else 0
        near_b = mean_blue(rx + tile // 2, ry + tile // 2, 4)
        far_b = None
        for cdx, cdy in [(5, 0), (-5, 0), (0, 5), (0, -5)]:
            cx_, cy_ = px + cdx, py + cdy
            if not (0 <= cx_ < 60 and 0 <= cy_ < 44):
                continue
            frx, fry, _ = [int(v) for v in tile_rect(page, cx_, cy_)]
            ccx, ccy = frx + tile // 2, fry + tile // 2
            if 0 <= ccx < img.width and 0 <= ccy < img.height:
                far_b = mean_blue(ccx, ccy, 4)
                break
        if far_b is None:
            check("glow: far on-screen tile found", False, cells["far"])
            far_b = 0
        check("glow: player tile bluer than far floor tile",
              near_b > far_b + 5, f"near={near_b:.1f} far={far_b:.1f}")
        # ---- AO on the NATURAL floor (no flattening: the flattened
        # box has no walls inside it, which is why runs 1-5 reported
        # "no wall-adjacent floor cell"). Spawn rooms are enclosed,
        # so a floor-with-wall-above cell is near the player.
        page.evaluate("() => { localStorage.clear(); }")
        page.goto(GAME_URL)
        page.wait_for_timeout(1500)
        page.screenshot(path=str(SHOTS / "gfx-ao.png"))
        ao_img = Image.open(SHOTS / "gfx-ao.png").convert("RGB")
        ao_cell = page.evaluate(
            """() => {
              const s = window.__scrapDebug.getState();
              const p = s.player, g = s.floor.grid;
              for (let y = p.y - 4; y <= p.y + 4; y++)
                for (let x = p.x - 4; x <= p.x + 4; x++)
                  if (y > 0 && x > 0 && x < 59 && y < 43 &&
                      g[y][x] === 'floor' && g[y - 1][x] === 'wall') return [x, y];
              return null;
            }""")
        if ao_cell:
            ax, ay = ao_cell
            arx, ary, at = [int(v) for v in tile_rect(page, ax, ay)]
            def ao_lum(cx, cy, w, h):
                vals = []
                for yy in range(max(0, cy), min(ao_img.height, cy + h)):
                    for xx in range(max(0, cx), min(ao_img.width, cx + w)):
                        r_, g_, b_ = ao_img.getpixel((xx, yy))
                        vals.append(0.3 * r_ + 0.6 * g_ + 0.1 * b_)
                return sum(vals) / len(vals) if vals else 0
            top = ao_lum(arx + at // 4, ary + 1, at // 2, max(2, at // 12))
            mid = ao_lum(arx + at // 4, ary + at // 2, at // 2, max(2, at // 12))
            check("ao: wall-adjacent floor edge darker than centre",
                  top < mid, f"cell=({ax},{ay}) edge={top:.1f} centre={mid:.1f}")
        else:
            check("ao: wall-adjacent floor cell found", False, ao_cell)
        # Back to a flattened arena for the flicker search: scan
        # dressing near the player on this fresh seed.
        flatten_box(page, 6)
        page.wait_for_timeout(300)
        # ---- Flicker: a console-like dressing tile, two frames ----
        # Consoles spawn in STRUCTURE rooms (core.js placeDressing),
        # so a +/-4 search around the spawn room misses them — the
        # runs 1-6 failure mode. Search the whole floor, then move
        # the player beside the tile (fixture only, no action taken)
        # so it is on screen for the two-frame comparison.
        flick = page.evaluate(
            """() => {
              const s = window.__scrapDebug.getState();
              const d = (s.floor.dressing || []).find(x =>
                /console|term|panel|circuit|keypad|server/.test(x.kind));
              if (!d) return null;
              const g = s.floor.grid;
              const nx = d.x > 0 && g[d.y][d.x - 1] !== 'wall' ? d.x - 1 : d.x + 1;
              s.player.x = nx; s.player.y = d.y;
              return [d.x, d.y, d.kind];
            }""")
        if flick:
            page.wait_for_timeout(300)
        if flick:
            fx0, fy0, fkind = flick
            frx, fry, ft = [int(v) for v in tile_rect(page, fx0, fy0)]
            page.screenshot(path=str(SHOTS / "gfx-flicker-a.png"))
            page.wait_for_timeout(380)
            page.screenshot(path=str(SHOTS / "gfx-flicker-b.png"))
            a = Image.open(SHOTS / "gfx-flicker-a.png").convert("RGB")
            b = Image.open(SHOTS / "gfx-flicker-b.png").convert("RGB")
            diff = 0
            tot = 0
            for yy in range(fry, fry + ft):
                for xx in range(frx, frx + ft):
                    tot += 1
                    if a.getpixel((xx, yy)) != b.getpixel((xx, yy)):
                        diff += 1
            check("flicker: console dressing tile changes between frames",
                  diff > 0, f"{fkind} at ({fx0},{fy0}) diff={diff}/{tot}")
        else:
            check("flicker: console-like dressing found within 3 seeds",
                  False, "none near player on 3 seeds")

        # ---- Path trail: tap a distant on-screen tile ----
        new_run(page)
        flatten_box(page, 6)
        page.wait_for_timeout(300)
        tgt = page.evaluate(
            """() => {
              const s = window.__scrapDebug.getState();
              return [s.player.x + 3, s.player.y];
            }""")
        tx, ty, tt = [int(v) for v in tile_rect(page, tgt[0], tgt[1])]
        page.mouse.click(tx + tt // 2, ty + tt // 2)
        page.wait_for_timeout(80)
        trail = page.evaluate("() => window.__scrapDebug.fxState().trail")
        check("trail: tap-to-walk sets a multi-tile trail",
              trail is not None and len(trail) >= 2, trail)
        page.screenshot(path=str(SHOTS / "gfx-trail.png"))
        page.wait_for_timeout(1500)  # let the walk finish

        # ---- Combat FX: FIRE at a crafted foe, FORCE at a door ----
        new_run(page)
        flatten_box(page, 6)
        craft_foe(page, "raider", 3, 0)
        face_toward(page, 1, 0)
        page.wait_for_timeout(200)
        page.keyboard.press("f")
        page.wait_for_timeout(60)
        fx = page.evaluate("() => window.__scrapDebug.fxState()")
        # Diagnostics for the intermittent run-3/run-7 FIRE 0/0:
        # log tail tells refused vs fired, modal state tells
        # whether the keypress was swallowed by the boot modal.
        diag = page.evaluate(
            """() => {
              const s = window.__scrapDebug.getState();
              return { log: s.log.slice(-3), ammo: s.ammoPools,
                       modal: getComputedStyle(document.getElementById('modal')).display,
                       foes: s.floor.enemies.map(e => [e.id, e.x, e.y, e.hp, e.alive]),
                       player: [s.player.x, s.player.y, s.player.facing] };
            }""")
        print("FIRE-DIAG", diag, flush=True)
        # NOTE: fxState() returns COUNTS (ints), not arrays — an
        # earlier draft of this script called len() on them and
        # failed run 3 on 0 / crashed run 4 on a nonzero count.
        check("fire: tracer spawned on FIRE",
              fx["tracers"] >= 1, fx["tracers"])
        check("fire: impact sparks spawned on hit",
              fx["particles"] >= 1, fx["particles"])
        page.screenshot(path=str(SHOTS / "gfx-fire.png"))
        page.wait_for_timeout(600)
        # FORCE: face a closed door — make one by re-closing the door
        # the walk just used, or simply face any door cell; simplest
        # deterministic route: craft a door tile east of the player.
        page.evaluate(
            """() => {
              const s = window.__scrapDebug.getState();
              const p = s.player;
              s.floor.grid[p.y][p.x + 1] = 'door';
              s.floor.doors = s.floor.doors || [];
              s.floor.doors.push({ id: 'door:' + p.y + ':' + (p.x + 1),
                x: p.x + 1, y: p.y, state: 'locked', lockLevel: 2,
                keyId: 'key:gfx-force', hp: 40, maxHp: 40 });
            }""")
        face_toward(page, 1, 0)
        page.wait_for_timeout(100)
        page.keyboard.press("x")
        page.wait_for_timeout(60)
        fx2 = page.evaluate("() => window.__scrapDebug.fxState()")
        check("force: sparks + tracer spawned on FORCE",
              fx2["particles"] >= 1 and fx2["tracers"] >= 1, fx2)
        page.screenshot(path=str(SHOTS / "gfx-force.png"))

        # ---- HUD screenshot for the visual read ----
        page.screenshot(path=str(SHOTS / "gfx-hud.png"))
        browser.close()

    print("FAILURES:", FAILURES, flush=True)
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
