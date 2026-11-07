#!/usr/bin/env python3
"""One-off verification for the 2026-10-27 ammo + Batch 3 slice.

Drives the real game in headless Chromium (Playwright, ML venv) and
checks, against live state via window.__scrapDebug:
  - fresh run starts with 16 ammo / scrap blaster instance; HUD + quickbar show it
  - an ammo-crate pickup and console dressing exist on the floor
  - aiming along the facing and clicking FIRE spends 1 ammo and
    hits/misses the first enemy in line (log + ammo + HUD agree)
  - at 390px the HUD fits on one line and the quickbar slots are >=44px
  - no console errors, no failed asset requests
Screenshots go to beta-testers/reports/screenshots/.
Exit 1 on any failure. Read-only against game/.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from testers.common import GAME_URL  # noqa: E402

HERE = Path(__file__).parent
SHOTS = HERE / "reports" / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

FAILURES = []


def check(name, ok, evidence):
    print(("PASS " if ok else "FAIL ") + name + " | " + str(evidence))
    if not ok:
        FAILURES.append(name)


FIRE_STATE_JS = """() => {
  const s = window.__scrapDebug.getState();
  return {
    grid: s.floor.grid, px: s.player.x, py: s.player.y,
    stairs: {x: s.floor.stairs.x, y: s.floor.stairs.y},
    ammo: s.ammo, weapon: s.weapon, runState: s.state,
    hudAmmo: document.getElementById('hud-ammo').textContent,
    qsAmmo: document.getElementById('qs-ammo-count').textContent,
    logTail: s.log.slice(-3),
    ammoPickups: s.floor.pickups.filter(p => p.kind === 'ammo').length,
    consoles: s.floor.dressing.filter(d => d.kind === 'console').length,
    enemies: s.floor.enemies.filter(e => e.alive).map(e => ({id: e.id, x: e.x, y: e.y, hp: e.hp})),
  };
}"""

WALK = {"floor", "corridor", "door", "hazard"}
DIRS8 = [(0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1)]
KEY_FOR = {(0, -1): "ArrowUp", (0, 1): "ArrowDown", (-1, 0): "ArrowLeft",
           (1, 0): "ArrowRight", (-1, -1): "q", (1, -1): "e",
           (-1, 1): "z", (1, 1): "c"}


def scan_from(grid, enemies, x, y):
    """First enemy in line within range 5 along any facing, or None."""
    foe_at = {(e["x"], e["y"]): e for e in enemies}
    for i, (dx, dy) in enumerate(DIRS8):
        for step in range(1, 6):
            nx, ny = x + dx * step, y + dy * step
            t = grid[ny][nx]
            if t in ("wall", "void"):
                break
            if (nx, ny) in foe_at:
                return {"facing": i, "foe": foe_at[(nx, ny)], "dist": step}
    return None


def bfs_firing_path(st):
    """BFS from the player to the nearest cell with a firing line.

    Enemy cells and the stairs cell are blocked (bumping an enemy is a
    melee attack, stepping on stairs opens the modal). Returns a list
    of cells to walk, or None if no firing cell is reachable.
    """
    from collections import deque
    grid, sx, sy = st["grid"], st["px"], st["py"]
    blocked = {(e["x"], e["y"]) for e in st["enemies"]}
    blocked.add((st["stairs"]["x"], st["stairs"]["y"]))
    prev = {(sx, sy): None}
    q = deque([(sx, sy)])
    while q:
        x, y = q.popleft()
        if scan_from(grid, st["enemies"], x, y):
            path = []
            while (x, y) != (sx, sy):
                path.append((x, y))
                x, y = prev[(x, y)]
            return path[::-1]
        for dx, dy in DIRS8:
            nx, ny = x + dx, y + dy
            if (nx, ny) in prev or (nx, ny) in blocked:
                continue
            if grid[ny][nx] not in WALK:
                continue
            prev[(nx, ny)] = (x, y)
            q.append((nx, ny))
    return None


STATE_JS = """() => {
  const s = window.__scrapDebug.getState();
  return {
    ammo: s.ammo, weapon: s.weapon, runState: s.state,
    hudAmmo: document.getElementById('hud-ammo').textContent,
    qsAmmo: document.getElementById('qs-ammo-count').textContent,
    logTail: s.log.slice(-3),
    ammoPickups: s.floor.pickups.filter(p => p.kind === 'ammo').length,
    consoles: s.floor.dressing.filter(d => d.kind === 'console').length,
    enemies: s.floor.enemies.filter(e => e.alive).map(e => ({id: e.id, hp: e.hp})),
  };
}"""


def fresh_page(browser, width, height, mobile):
    ctx = browser.new_context(viewport={"width": width, "height": height},
                              has_touch=mobile, is_mobile=mobile)
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(f"console {m.type}: {m.text}")
            if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("response", lambda r: errors.append(f"asset HTTP {r.status}: {r.url}")
            if "assets/" in r.url and r.status != 200 else None)
    page.goto(GAME_URL)
    page.wait_for_timeout(1500)
    return ctx, page, errors


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox"])
        # ---- desktop: state + fire ----
        # Enemies almost never sit in a firing line from the spawn cell
        # (rooms are separated by wall/void), so walk to the nearest
        # cell that has one, re-planning after each step as foes move.
        fired = False
        for attempt in range(4):
            ctx, page, errors = fresh_page(browser, 1280, 900, False)
            st = page.evaluate(FIRE_STATE_JS)
            check(f"fresh run ammo/weapon/HUD (attempt {attempt + 1})",
                  st["ammo"] == 16 and st["weapon"] == {"kind": "item", "defId": "scrapBlaster",
                  "tier": "common", "upgrade": 0, "properties": [], "flair": None}
                  and st["hudAmmo"] == "16" and st["qsAmmo"] == "16",
                  {k: st[k] for k in ("ammo", "weapon", "hudAmmo", "qsAmmo")})
            check("ammo-crate pickup generated on depth 1",
                  st["ammoPickups"] >= 1, f"crates={st['ammoPickups']}")
            check("console dressing generated on depth 1",
                  st["consoles"] >= 1, f"consoles={st['consoles']}")
            aim = None
            for _step in range(60):
                st = page.evaluate(FIRE_STATE_JS)
                if st["runState"] != "playing":
                    break
                aim = scan_from(st["grid"], st["enemies"], st["px"], st["py"])
                if aim:
                    break
                path = bfs_firing_path(st)
                if not path:
                    break
                nx, ny = path[0]
                key = KEY_FOR[(nx - st["px"], ny - st["py"])]
                page.keyboard.press(key)
                page.wait_for_timeout(160)
            if not aim or st["runState"] != "playing":
                check("reached a firing position", False,
                      f"runState={st['runState']} aim={aim}")
                ctx.close()
                continue
            foe_hp_before = aim["foe"]["hp"]
            ammo_before = st["ammo"]  # walking may have picked up a crate
            page.evaluate(f"window.__scrapDebug.getState().player.facing = {aim['facing']}")
            page.locator("#btn-fire").click()
            page.wait_for_timeout(400)
            after = page.evaluate(FIRE_STATE_JS)
            foe_after = [e for e in after["enemies"] if e["id"] == aim["foe"]["id"]]
            hit_or_miss = any("misses" in line or " for " in line or "wakes up" in line
                              for line in after["logTail"])
            check("FIRE spends 1 ammo, HUD/quickbar agree",
                  after["ammo"] == ammo_before - 1
                  and after["hudAmmo"] == str(ammo_before - 1)
                  and after["qsAmmo"] == str(ammo_before - 1),
                  f"ammo {ammo_before} -> {after['ammo']}, log={after['logTail']}")
            check("FIRE resolves against the first enemy in line",
                  hit_or_miss and (not foe_after or foe_after[0]["hp"] <= foe_hp_before),
                  f"aim={aim} foeAfter={foe_after} log={after['logTail']}")
            page.screenshot(path=str(SHOTS / "ammo-batch3-fire.png"))
            page.screenshot(path=str(SHOTS / "ammo-batch3-desktop.png"))
            check("no console errors / failed assets on desktop",
                  not errors, errors[:5] or "none")
            fired = True
            ctx.close()
            break
        check("walked to a firing position and fired within 4 fresh runs", fired, "")

        # ---- mobile: HUD fit + quickbar sizes ----
        ctx, page, errors = fresh_page(browser, 390, 844, True)
        hud = page.evaluate(
            "() => { const h = document.getElementById('hud');"
            " const p = document.getElementById('hud-power');"
            " const hr = h.getBoundingClientRect(), pr = p.getBoundingClientRect();"
            " return {scroll: h.scrollWidth, client: h.clientWidth,"
            " hudRight: hr.right, powerRight: pr.right,"
            " ammo: document.getElementById('hud-ammo').textContent}; }")
        check("HUD fits on one line at 390px with Ammo segment",
              hud["scroll"] <= hud["client"] + 1 and hud["powerRight"] <= hud["hudRight"] + 1,
              hud)
        for name, sel in [("FIRE", "#btn-fire"), ("+HP", "#qs-health"),
                          ("FOOD", "#qs-food"), ("KIT", "#qs-repair")]:
            box = page.locator(sel).first.bounding_box()
            check(f"quickbar tap target >=44px at 390px: {name}",
                  box and box["width"] >= 44 and box["height"] >= 44,
                  f"{box['width']:.0f}x{box['height']:.0f}" if box else "no box")
        # Tapping FIRE on mobile must not crash (refusal or shot, both logged).
        page.locator("#btn-fire").tap()
        page.wait_for_timeout(300)
        st = page.evaluate(STATE_JS)
        check("mobile FIRE tap resolves without error",
              st["runState"] in ("playing", "stairs", "dead", "extracted"),
              f"state={st['runState']} ammo={st['ammo']} log={st['logTail']}")
        page.screenshot(path=str(SHOTS / "ammo-batch3-mobile.png"))
        check("no console errors / failed assets on mobile",
              not errors, errors[:5] or "none")
        ctx.close()
        browser.close()

    print(json.dumps({"failures": FAILURES}, indent=1))
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
