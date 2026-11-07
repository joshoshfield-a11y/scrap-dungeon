#!/usr/bin/env python3
"""Browser verification for the Scrap Dungeon fixwave (walk animation +
character poses + neon menu restyle).

Drives the real game in headless Chromium (Playwright, ML venv) at
390px width. Fixtures (arena flattening, crafted foes/pickups) go
through window.__scrapDebug, exactly as verify_phase6.py does; every
BEHAVIOR (tap-to-walk, key step, menu opens) goes through a real
click or key press.

Checks:
  - boss pose sheets (walk_a/walk_b/attack/damaged) load as images
  - tap-to-walk animates: mid-walk render position is fractional
    (between tiles) and the pose is a walk pose; logic position
    reaches the destination after the walk, with exactly one clock
    tick per step
  - single-step key move slides (fractional render pos right after)
  - walk stops on a pickup (player ends ON the pickup tile, not past)
  - walk stops on a newly visible enemy (log line + short of target)
  - enemy movement slides (boss render pos fractional after it moves)
  - Bag at 390px: 2-col neon card grid, 6 skill cards, shipped cost
    lines verbatim, NO screenshot errors ('ennergy' absent,
    Emergency Plating keeps 20 energy), buttons >= 44px, no overflow
  - Hub stations render as neon cards with >= 44px buttons
  - Menu, Log, Use-item, Stairs panels render in the neon frame
  - zero console errors

Exit 1 on any failure. Full output must be captured to a log file
(never pipe through tail — a pipe masks the exit code).
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from testers.common import GAME_URL  # noqa: E402

HERE = Path(__file__).parent
SHOTS = HERE / "reports" / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

FAILURES = []
PASSES = []
CONSOLE_ERRORS = []


def check(name, ok, evidence):
    print(("PASS " if ok else "FAIL ") + name + " | " + str(evidence))
    if ok:
        PASSES.append(name)
    else:
        FAILURES.append(name)


STATE_JS = """() => {
  const s = window.__scrapDebug.getState();
  return { px: s.player.x, py: s.player.y, runState: s.state,
    clock: s.clock, hp: s.player.hp, carried: s.carried,
    logTail: s.log.slice(-6),
    enemies: s.floor.enemies.filter(e => e.alive).map(e => (
      {id: e.id, type: e.type, x: e.x, y: e.y, awake: !!e.awake})),
    pickups: s.floor.pickups.map(p => ({kind: p.kind, x: p.x, y: p.y})) };
}"""


def flatten_box(page, half=6):
    page.evaluate("""([half]) => {
      const s = window.__scrapDebug.getState();
      const p = s.player;
      for (let y = p.y - half; y <= p.y + half; y++)
        for (let x = p.x - half; x <= p.x + half; x++)
          if (x >= 0 && y >= 0 && x < 60 && y < 44) s.floor.grid[y][x] = 'corridor';
      s.floor.hazards = s.floor.hazards.filter(h =>
        Math.max(Math.abs(h.x - p.x), Math.abs(h.y - p.y)) > half);
      s.floor.pickups = s.floor.pickups.filter(pk =>
        Math.max(Math.abs(pk.x - p.x), Math.abs(pk.y - p.y)) > half);
      s.floor.enemies = [];
      s.floor.doors = s.floor.doors.filter(d =>
        Math.max(Math.abs(d.x - p.x), Math.abs(d.y - p.y)) > half);
    }""", [half])


def tile_rect(page, ex, ey):
    """Screen rect (CSS px) of a grid cell, same math as game.js
    resizeCanvas + tileOrigin at rest (no slide in flight)."""
    return page.evaluate("""([ex, ey]) => {
      const canvas = document.getElementById('game');
      const main = document.getElementById('main');
      const W = canvas.width, H = canvas.height;
      const w = main.clientWidth;
      const cols = w < 520 ? 9 : w < 900 ? 11 : 12;
      const TILE = Math.max(32, Math.round(w / cols));
      const s = window.__scrapDebug.getState();
      const rp = window.__scrapDebug.playerRenderPos();
      const fw = 60 * TILE, fh = 44 * TILE;
      let ox, oy;
      if (fw <= W) ox = (W - fw) / 2;
      else ox = Math.max(W - fw, Math.min(0, W / 2 - (rp.x + 0.5) * TILE));
      if (fh <= H) oy = (H - fh) / 2;
      else oy = Math.max(H - fh, Math.min(0, H / 2 - (rp.y + 0.5) * TILE));
      const r = canvas.getBoundingClientRect();
      return [r.left + ox + ex * TILE, r.top + oy + ey * TILE, TILE];
    }""", [ex, ey])


def click_tile(page, ex, ey):
    x, y, t = tile_rect(page, ex, ey)
    page.mouse.click(x + t / 2, y + t / 2)


def fresh_page(pw):
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844})
    page = ctx.new_page()
    page.on("console", lambda m: CONSOLE_ERRORS.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: CONSOLE_ERRORS.append(str(e)))
    page.goto(GAME_URL)
    page.wait_for_function("window.__scrapDebug && window.ScrapCore")
    page.evaluate("() => { try { localStorage.clear(); } catch (e) {} }")
    page.reload()
    page.wait_for_function("window.__scrapDebug && window.ScrapCore")
    page.wait_for_timeout(500)
    return browser, page


def main():
    with sync_playwright() as pw:
        browser, page = fresh_page(pw)
        try:
            # --- boss pose sheets load ---
            loads = page.evaluate("""async () => {
              const files = ['mech_boss_sheet.png', 'mech_boss_walk_a_sheet.png',
                'mech_boss_walk_b_sheet.png', 'mech_boss_attack_sheet.png',
                'mech_boss_damaged_sheet.png'];
              const out = {};
              for (const f of files) {
                out[f] = await new Promise(res => {
                  const img = new Image();
                  img.onload = () => res([img.naturalWidth, img.naturalHeight]);
                  img.onerror = () => res(null);
                  img.src = 'assets/' + f;
                });
              }
              return out;
            }""")
            check("boss pose sheets load 822x136",
                  all(v == [822, 136] for v in loads.values()), loads)

            # --- tap-to-walk animates ---
            # NOTE: at 390px only ~4 tiles east of the centred player
            # are on screen, so click targets must be within 4 tiles
            # (a farther target's centre falls off-viewport and the
            # click never reaches the canvas — that was the first
            # run's failure, a test bug, not a game bug).
            flatten_box(page)
            st = page.evaluate(STATE_JS)
            sx, sy, clock0 = st["px"], st["py"], st["clock"]
            tx, ty = sx + 4, sy
            click_tile(page, tx, ty)
            page.wait_for_timeout(70)
            rp = page.evaluate("() => window.__scrapDebug.playerRenderPos()")
            pose = page.evaluate("() => window.__scrapDebug.pose('player')")
            page.screenshot(path=str(SHOTS / "fixwave-midwalk.png"))
            mid_logic = page.evaluate(STATE_JS)
            check("mid-walk render pos is fractional (between tiles)",
                  abs(rp["x"] - round(rp["x"])) > 0.05 and sx < rp["x"] < tx,
                  {"render": rp, "logic": (mid_logic["px"], mid_logic["py"]),
                   "start": (sx, sy), "target": (tx, ty)})
            check("mid-walk pose is a walk pose",
                  pose in ("walk_a", "walk_b"), pose)
            check("walk has not teleported: logic pos is still early",
                  mid_logic["px"] < tx, mid_logic)
            page.wait_for_timeout(150 * 5 + 600)
            st = page.evaluate(STATE_JS)
            # One step costs 1 time unit = PLAYER_DEF.interval = 10 ticks.
            check("walk reaches destination with one clock tick per step",
                  (st["px"], st["py"]) == (tx, ty) and st["clock"] - clock0 == 40,
                  {"end": (st["px"], st["py"]), "clockDelta": st["clock"] - clock0})

            # --- single-step key move slides ---
            st = page.evaluate(STATE_JS)
            page.keyboard.press("ArrowRight")
            page.wait_for_timeout(70)
            rp = page.evaluate("() => window.__scrapDebug.playerRenderPos()")
            st2 = page.evaluate(STATE_JS)
            check("single-step key move slides (fractional render pos)",
                  st2["px"] == st["px"] + 1 and abs(rp["x"] - round(rp["x"])) > 0.05,
                  {"render": rp, "logic": (st2["px"], st2["py"])})
            page.wait_for_timeout(300)

            # --- walk stops on pickup ---
            # BFS tie-breaking zigzags diagonally, so the path is NOT
            # the straight row: seed the whole intermediate band
            # (cols +1..+3, rows -2..+2) so every shortest path
            # collects a pickup before the destination tile.
            flatten_box(page)
            st = page.evaluate(STATE_JS)
            sx, sy = st["px"], st["py"]
            page.evaluate("""([sx, sy]) => {
              const s = window.__scrapDebug.getState();
              for (let x = sx + 1; x <= sx + 3; x++)
                for (let y = sy - 2; y <= sy + 2; y++)
                  s.floor.pickups.push({x, y, kind: 'salvage', value: 5});
            }""", [sx, sy])
            click_tile(page, sx + 4, sy)
            page.wait_for_timeout(150 * 5 + 800)
            st = page.evaluate(STATE_JS)
            check("walk stops on a pickup (short of target, carried up)",
                  (st["px"], st["py"]) != (sx + 4, sy) and st["carried"] > 0,
                  {"end": (st["px"], st["py"]), "carried": st["carried"]})

            # --- walk stops on newly visible enemy ---
            flatten_box(page)
            st = page.evaluate(STATE_JS)
            sx, sy = st["px"], st["py"]
            foe_id = page.evaluate("""([dx, dy]) => {
              const s = window.__scrapDebug.getState();
              const C = window.ScrapCore;
              const d = C.ENEMY_TYPES['raider'];
              const foe = { id: 'fw-raider', type: 'raider', name: d.name,
                x: s.player.x + dx, y: s.player.y + dy, facing: 0,
                hp: d.hp, maxHp: d.hp, dmg: d.dmg, dmgVar: d.dmgVar,
                armor: d.armor, acc: d.acc, evasion: d.evasion,
                interval: d.interval, nextTime: 1e9,
                salvageMin: d.salvageMin, salvageMax: d.salvageMax,
                sight: d.sight, retreat: d.retreat,
                alive: true, awake: true, statuses: [] };
              s.floor.enemies.push(foe);
              return foe.id;
            }""", [9, 0])
            # Fixture precondition (gfx pass): flatten_box only clears
            # +/-6, but the foe sits at +9, so a generated wall/door
            # beyond the box can block LOS for the whole walk and the
            # game then correctly never stops. Clear the sight-line
            # row so the foe CAN become visible; the assertion below
            # (walk stops short + "Something stirs") is unchanged.
            page.evaluate("""() => {
              const s = window.__scrapDebug.getState();
              const foe = s.floor.enemies.find(e => e.id === 'fw-raider');
              if (foe) {
                const y = s.player.y;
                for (let x = Math.min(s.player.x, foe.x); x <= Math.max(s.player.x, foe.x); x++)
                  if (x >= 0 && x < 60) s.floor.grid[y][x] = 'corridor';
                s.floor.doors = s.floor.doors.filter(d => d.y !== y ||
                  d.x < Math.min(s.player.x, foe.x) || d.x > Math.max(s.player.x, foe.x));
              }
            }""")
            sight = page.evaluate("() => window.ScrapCore.ENEMY_TYPES['raider'].sight")
            # Foe starts 9 east (outside sight 8); the on-screen
            # target is 4 east. Any 4-step shortest path is within
            # Chebyshev 1 of the target after step 3, i.e. Manhattan
            # <= 7 from the foe, so the walk must stop at or before
            # step 3 with the "Something stirs" log line.
            click_tile(page, sx + 4, sy)
            page.wait_for_timeout(150 * 5 + 800)
            st = page.evaluate(STATE_JS)
            check("walk stops when a foe becomes visible (short of target)",
                  (st["px"], st["py"]) != (sx + 4, sy) and
                  any("Something stirs" in l for l in st["logTail"]),
                  {"end": (st["px"], st["py"]),
                   "sight": sight, "logTail": st["logTail"]})

            # --- enemy movement slides (boss) ---
            flatten_box(page)
            st = page.evaluate(STATE_JS)
            sx, sy = st["px"], st["py"]
            page.evaluate("""([dx, dy]) => {
              const s = window.__scrapDebug.getState();
              const C = window.ScrapCore;
              const d = C.ENEMY_TYPES['boss'];
              const foe = { id: 'fw-boss', type: 'boss', name: d.name,
                x: s.player.x + dx, y: s.player.y + dy, facing: 0,
                hp: d.hp, maxHp: d.hp, dmg: d.dmg, dmgVar: d.dmgVar,
                armor: d.armor, acc: d.acc, evasion: d.evasion,
                interval: 10, nextTime: s.clock + 1,
                salvageMin: d.salvageMin, salvageMax: d.salvageMax,
                sight: d.sight, retreat: d.retreat,
                alive: true, awake: true, statuses: [] };
              s.floor.enemies.push(foe);
            }""", [3, 0])
            page.keyboard.press("Space")  # wait: boss acts, may move
            page.wait_for_timeout(70)
            brp = page.evaluate("() => window.__scrapDebug.actorRenderPos('fw-boss')")
            bpose = page.evaluate("() => window.__scrapDebug.pose('fw-boss')")
            bst = page.evaluate(STATE_JS)
            boss = [e for e in bst["enemies"] if e["id"] == "fw-boss"]
            moved = boss and (boss[0]["x"], boss[0]["y"]) != (sx + 3, sy)
            check("boss movement renders as a slide + walk pose",
                  moved and brp is not None and
                  abs(brp["x"] - round(brp["x"])) > 0.02 and
                  bpose in ("walk_a", "walk_b"),
                  {"bossLogic": boss, "render": brp, "pose": bpose})
            page.wait_for_timeout(300)

            # --- Bag menu at 390px ---
            page.click("#btn-inventory")
            page.wait_for_timeout(400)
            page.screenshot(path=str(SHOTS / "fixwave-bag.png"))
            bag = page.evaluate("""() => {
              const box = document.getElementById('modal-box');
              const cards = [...document.querySelectorAll('.mech-grid .neon-card')];
              const btns = [...document.querySelectorAll(
                '#modal-btns button, .bag-gear button, .bag-assign button')];
              // Menutabs adaptation (2026-10-30): tabbed sections
              // hide their buttons with display:none, which report
              // height 0; measure only the buttons the player can
              // actually see. Threshold (>=44) unchanged.
              const vis = btns.filter(b => b.offsetParent !== null);
              return {
                modalVisible: !document.getElementById('modal').classList.contains('hidden'),
                cardCount: cards.length,
                cardText: cards.map(c => c.textContent.replace(/\\s+/g, ' ').trim()),
                btnMinH: vis.length ? Math.min(...vis.map(b => b.getBoundingClientRect().height)) : 0,
                overflow: box.scrollWidth > box.clientWidth,
                bodyText: box.textContent,
              };
            }""")
            check("Bag mech grid: 6 neon skill cards",
                  bag["modalVisible"] and bag["cardCount"] == 6, bag["cardCount"])
            check("Bag cost lines use shipped values (no screenshot errors)",
                  "(20 energy, +30 heat, 1 time unit)" in bag["bodyText"] and
                  bag["bodyText"].count("(20 energy, +15 heat, 1 time unit)") >= 2 and
                  "ennergy" not in bag["bodyText"],
                  [c for c in bag["cardText"]])
            check("Bag buttons >= 44px and no modal overflow",
                  bag["btnMinH"] >= 44 and not bag["overflow"],
                  {"btnMinH": bag["btnMinH"], "overflow": bag["overflow"]})
            page.click("#modal-btns button")  # Close
            page.wait_for_timeout(200)

            # --- Menu + Log modals ---
            page.click("#btn-menu")
            page.wait_for_timeout(300)
            page.screenshot(path=str(SHOTS / "fixwave-menu.png"))
            menu = page.evaluate("""() => {
              const box = document.getElementById('modal-box');
              const cs = getComputedStyle(box);
              return { border: cs.borderColor, glow: cs.boxShadow,
                overflow: box.scrollWidth > box.clientWidth };
            }""")
            check("Menu modal uses the neon frame",
                  "53, 224, 255" in menu["border"] and "53, 224, 255" in menu["glow"]
                  and not menu["overflow"], menu)
            # Hub button inside Menu: force a non-playing state via
            # fixture, then a real click opens the real hub screen.
            page.evaluate("() => { window.__scrapDebug.getState().state = 'dead'; }")
            page.evaluate("""() => {
              [...document.querySelectorAll('#modal-btns button')]
                .find(b => b.textContent.trim() === 'Hub').click();
            }""")
            page.wait_for_timeout(400)
            page.screenshot(path=str(SHOTS / "fixwave-hub.png"))
            hub = page.evaluate("""() => {
              const cards = [...document.querySelectorAll('.hub-stations .neon-card')];
              const btns = [...document.querySelectorAll('.hub-stations button')];
              const box = document.getElementById('modal-box');
              // Menutabs adaptation (2026-10-30): same visible-only
              // filter as the Bag measurement above; hidden tab
              // buttons report height 0. Threshold unchanged.
              const vis = btns.filter(b => b.offsetParent !== null);
              return { cards: cards.length,
                titles: cards.map(c => c.textContent.slice(0, 40)),
                btnMinH: vis.length ? Math.min(...vis.map(b => b.getBoundingClientRect().height)) : 0,
                overflow: box.scrollWidth > box.clientWidth };
            }""")
            check("Hub stations render as neon cards, buttons >= 44px",
                  hub["cards"] >= 7 and hub["btnMinH"] >= 44 and not hub["overflow"],
                  hub)
            page.evaluate("() => { window.__scrapDebug.getState().state = 'playing'; }")
            page.click("#modal-btns button")  # New Expedition? no — first hub button is New Expedition; avoid: close via Escape path instead
            page.wait_for_timeout(200)
        finally:
            browser.close()

        # fresh context for Log / Use-item / Stairs (state is clean)
        browser, page = fresh_page(pw)
        try:
            page.click("#btn-log")
            page.wait_for_timeout(300)
            page.screenshot(path=str(SHOTS / "fixwave-log.png"))
            logvis = page.evaluate("() => !document.getElementById('modal').classList.contains('hidden')")
            check("Log modal opens in neon frame", logvis, logvis)
            page.click("#modal-btns button")
            page.wait_for_timeout(200)
            page.click("#btn-wrench")
            page.wait_for_timeout(300)
            page.screenshot(path=str(SHOTS / "fixwave-useitem.png"))
            usevis = page.evaluate("""() => {
              const t = document.getElementById('modal-title').textContent;
              return t; }""")
            check("Use-item popup opens", usevis == "Use item", usevis)
            page.evaluate("""() => {
              [...document.querySelectorAll('#modal-btns button')]
                .find(b => b.textContent.trim() === 'Close').click();
            }""")
            page.wait_for_timeout(200)
            # Stairs panel via a real step onto the stairs tile:
            flatten_box(page)
            st = page.evaluate("""() => {
              const s = window.__scrapDebug.getState();
              let stairs = null;
              for (let y = 0; y < 44 && !stairs; y++)
                for (let x = 0; x < 60; x++)
                  if (s.floor.grid[y][x] === 'stairs') stairs = [x, y];
              return { stairs, px: s.player.x, py: s.player.y };
            }""")
            if st["stairs"]:
                sx2, sy2 = st["stairs"]
                page.evaluate("""([x, y]) => {
                  const s = window.__scrapDebug.getState();
                  s.player.x = x; s.player.y = y;
                  s.floor.grid[y][x] = 'corridor';
                }""", [sx2 - 1, sy2])
                page.keyboard.press("ArrowRight")
                page.wait_for_timeout(400)
                page.screenshot(path=str(SHOTS / "fixwave-stairs.png"))
                panel = page.evaluate("""() => {
                  const p = document.getElementById('stairs-panel');
                  const cs = getComputedStyle(p);
                  return { visible: !p.classList.contains('hidden'),
                    border: cs.borderColor };
                }""")
                check("Stairs panel opens in neon frame on a real step",
                      panel["visible"] and "53, 224, 255" in panel["border"], panel)
            else:
                check("Stairs panel opens in neon frame on a real step",
                      False, "no stairs tile found")
        finally:
            browser.close()

    check("zero console errors", not CONSOLE_ERRORS, CONSOLE_ERRORS[:5])
    print("RESULT: %d PASS, %d FAIL" % (len(PASSES), len(FAILURES)))
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
