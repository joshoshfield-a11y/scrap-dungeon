#!/usr/bin/env python3
"""Browser verification for Scrap Dungeon Phase 1 (loot tiers / dice).

Drives the real game in headless Chromium (Playwright, ML venv) and
checks, against live state via window.__scrapDebug:
  - a fresh run starts with a Common +0 scrap blaster instance, 16 ammo
  - at least one item (weapon) pickup exists on depth 1
  - walking onto it equips it (state + log tier tag), the old weapon
    drops on the cell for swap-back
  - the Bag modal shows the equipped weapon in its tier color
  - FIRE spends 1 ammo and the log shows the dice roll + tier tag
  - zero console errors, zero failed asset requests
Screenshots go to beta-testers/reports/screenshots/.
Exit 1 on any failure. Read-only against game/.
"""
import json
import re
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


STATE_JS = """() => {
  const s = window.__scrapDebug.getState();
  return {
    grid: s.floor.grid, px: s.player.x, py: s.player.y,
    stairs: {x: s.floor.stairs.x, y: s.floor.stairs.y},
    ammo: s.ammo, weapon: s.weapon, runState: s.state,
    hudAmmo: document.getElementById('hud-ammo').textContent,
    qsAmmo: document.getElementById('qs-ammo-count').textContent,
    logTail: s.log.slice(-6),
    items: s.floor.pickups.filter(p => p.kind === 'item')
      .map(p => ({defId: p.defId, tier: p.tier, upgrade: p.upgrade, x: p.x, y: p.y})),
    enemies: s.floor.enemies.filter(e => e.alive).map(e => ({id: e.id, x: e.x, y: e.y, hp: e.hp})),
  };
}"""

WALK = {"floor", "corridor", "door", "hazard"}
DIRS8 = [(0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1)]
KEY_FOR = {(0, -1): "ArrowUp", (0, 1): "ArrowDown", (-1, 0): "ArrowLeft",
           (1, 0): "ArrowRight", (-1, -1): "q", (1, -1): "e",
           (-1, 1): "z", (1, 1): "c"}


def bfs_path(st, targets, blocked_extra=()):
    """BFS to the nearest cell in `targets`. Enemy/stairs cells blocked,
    EXCEPT a target cell itself: stepping onto it bumps the enemy
    standing there (melee), and the next re-plan finishes the walk."""
    from collections import deque
    grid, sx, sy = st["grid"], st["px"], st["py"]
    blocked = {(e["x"], e["y"]) for e in st["enemies"]}
    blocked.add((st["stairs"]["x"], st["stairs"]["y"]))
    blocked |= set(blocked_extra)
    target_set = set(targets)
    prev = {(sx, sy): None}
    q = deque([(sx, sy)])
    while q:
        x, y = q.popleft()
        if (x, y) in target_set:
            path = []
            while (x, y) != (sx, sy):
                path.append((x, y))
                x, y = prev[(x, y)]
            return path[::-1]
        for dx, dy in DIRS8:
            nx, ny = x + dx, y + dy
            if (nx, ny) in prev:
                continue
            if (nx, ny) in blocked and (nx, ny) not in target_set:
                continue
            if grid[ny][nx] not in WALK:
                continue
            prev[(nx, ny)] = (x, y)
            q.append((nx, ny))
    return None


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
    """BFS to the nearest cell with a firing line (reuses scan_from)."""
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


def walk_to(page, target, on_adjacent=None):
    """Walk to `target` with real key presses, re-planning BFS after
    every step (enemies move; a fixed path goes stale). When one step
    remains, call on_adjacent() once (e.g. screenshot the pickup ring)
    before taking the final step. Returns fresh state."""
    called = [False]
    for _ in range(80):
        st = page.evaluate(STATE_JS)
        if st["runState"] != "playing":
            return st
        if (st["px"], st["py"]) == target:
            return st
        path = bfs_path(st, [target])
        if not path:
            # No route (blockers everywhere): wait one turn so the
            # scheduler moves the enemies, then re-plan.
            page.keyboard.press(" ")
            page.wait_for_timeout(200)
            continue
        if len(path) == 1 and on_adjacent and not called[0]:
            called[0] = True
            on_adjacent()
        nx, ny = path[0]
        key = KEY_FOR[(nx - st["px"], ny - st["py"])]
        page.keyboard.press(key)
        page.wait_for_timeout(160)
    return page.evaluate(STATE_JS)


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox"])
        picked = False
        fired = False
        for attempt in range(4):
            ctx = browser.new_context(viewport={"width": 1280, "height": 900})
            page = ctx.new_page()
            errors = []
            page.on("console", lambda m: errors.append(f"console {m.type}: {m.text}")
                    if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            page.on("response", lambda r: errors.append(f"asset HTTP {r.status}: {r.url}")
                    if "assets/" in r.url and r.status != 200 else None)
            page.goto(GAME_URL)
            page.wait_for_timeout(1500)
            st = page.evaluate(STATE_JS)
            check(f"fresh run starts with Common +0 blaster instance, 16 ammo (attempt {attempt + 1})",
                  st["weapon"] == {"kind": "item", "defId": "scrapBlaster", "tier": "common",
                                   "upgrade": 0, "properties": [], "flair": None}
                  and st["ammo"] == 16 and st["hudAmmo"] == "16" and st["qsAmmo"] == "16",
                  {"weapon": st["weapon"], "ammo": st["ammo"]})
            check("item (weapon) pickup generated on depth 1",
                  len(st["items"]) >= 1, f"items={st['items']}")
            if not st["items"] or st["runState"] != "playing":
                ctx.close()
                continue
            target = st["items"][0]
            target_cell = (target["x"], target["y"])
            path = bfs_path(st, [target_cell])
            if not path:
                check("item pickup reachable", False, f"target={target}")
                ctx.close()
                continue
            # Walk to the pickup, screenshot the tier-colored ring +
            # letter marker while adjacent, then step on.
            def shot_ring():
                page.wait_for_timeout(300)
                page.screenshot(path=str(SHOTS / "phase1-item-ring.png"))
            st = walk_to(page, target_cell, on_adjacent=shot_ring)
            got = st["weapon"]
            check("stepping on a weapon drop equips that exact instance",
                  got["defId"] == target["defId"] and got["tier"] == target["tier"]
                  and got["upgrade"] == target["upgrade"],
                  f"target={target} equipped={got}")
            # Log must carry the tier tag for the pickup.
            tier_re = re.compile(r"\[(Common|Uncommon|Rare|Epic|Legendary)\]")
            check("pickup log line carries a tier tag",
                  any(tier_re.search(line) for line in st["logTail"]),
                  st["logTail"])
            # The old blaster must lie on the cell for swap-back.
            check("old weapon dropped on the pickup cell",
                  any(p["defId"] == "scrapBlaster" for p in
                      page.evaluate("() => window.__scrapDebug.getState().floor.pickups.filter(p => p.kind === 'item').map(p => ({defId: p.defId, x: p.x, y: p.y}))")
                      if (p["x"], p["y"]) == (st["px"], st["py"])),
                  f"at player cell {st['px']},{st['py']}")
            picked = True
            # Bag modal: tier-colored weapon line.
            page.locator("#btn-inventory").click()
            page.wait_for_timeout(400)
            bag = page.evaluate(
                "() => { const b = document.getElementById('modal-body');"
                " const colored = b.querySelector('b[style]');"
                " return {text: b.innerText, color: colored ? colored.getAttribute('style') : null}; }")
            check("Bag shows the equipped weapon with a tier color",
                  tier_re.search(bag["text"]) is not None and bag["color"] is not None
                  and "color:" in bag["color"],
                  bag)
            page.screenshot(path=str(SHOTS / "phase1-bag.png"))
            # Close via the modal's own Close button (Escape only
            # closes the stairs modal — pre-existing behavior).
            page.locator("#modal-btns button", has_text="Close").click()
            page.wait_for_timeout(200)
            # Cone/melee weapons do not resolve from a line-scan
            # firing position; swap back to the dropped blaster first
            # (which also verifies swap-back in the live game), then
            # fire the blaster down a line. The maneuver uses direct
            # key presses with bump-retry: BFS can stall when an
            # enemy sits on the step-off cell, and the PD clock only
            # advances on player actions, so waiting helps nothing.
            st = page.evaluate(STATE_JS)
            if st["weapon"]["defId"] in ("flamethrower", "energySword"):
                pickup_cell = (st["px"], st["py"])

                def step_toward(target):
                    """One direct key press toward target; True if arrived."""
                    cur = page.evaluate(STATE_JS)
                    d = (target[0] - cur["px"], target[1] - cur["py"])
                    if d == (0, 0):
                        return True
                    if d not in KEY_FOR:
                        return False
                    page.keyboard.press(KEY_FOR[d])
                    page.wait_for_timeout(160)
                    cur = page.evaluate(STATE_JS)
                    return (cur["px"], cur["py"]) == target

                moved_off = False
                for _try in range(12):
                    cur = page.evaluate(STATE_JS)
                    foes = {(e["x"], e["y"]) for e in cur["enemies"]}
                    stepped = False
                    for dx, dy in DIRS8:
                        nx, ny = cur["px"] + dx, cur["py"] + dy
                        if (nx, ny) in foes or (nx, ny) == (cur["stairs"]["x"], cur["stairs"]["y"]):
                            continue
                        if cur["grid"][ny][nx] not in WALK:
                            continue
                        if step_toward((nx, ny)):
                            moved_off = True
                            stepped = True
                            off_cell = (nx, ny)
                            break
                    if stepped:
                        break
                check("stepped off the pickup cell for swap-back", moved_off, "")
                if moved_off:
                    for _try in range(6):
                        if step_toward(pickup_cell):
                            break
                        # Bumped an enemy on the way back: step off again.
                        cur = page.evaluate(STATE_JS)
                        foes = {(e["x"], e["y"]) for e in cur["enemies"]}
                        for dx, dy in DIRS8:
                            nx, ny = cur["px"] + dx, cur["py"] + dy
                            if (nx, ny) in foes or (nx, ny) == pickup_cell:
                                continue
                            if cur["grid"][ny][nx] not in WALK:
                                continue
                            if step_toward((nx, ny)):
                                break
                    st = page.evaluate(STATE_JS)
                    check("swap-back re-equips the dropped blaster",
                          st["weapon"]["defId"] == "scrapBlaster",
                          f"equipped={st['weapon']}")
            # Walk to a firing position and fire the equipped weapon.
            st = page.evaluate(STATE_JS)
            aim = None
            for _step in range(60):
                st = page.evaluate(STATE_JS)
                if st["runState"] != "playing":
                    break
                aim = scan_from(st["grid"], st["enemies"], st["px"], st["py"])
                if aim:
                    break
                path = bfs_firing_path(st)
                if not path:
                    break
                nx, ny = path[0]
                page.keyboard.press(KEY_FOR[(nx - st["px"], ny - st["py"])])
                page.wait_for_timeout(160)
            if not aim or st["runState"] != "playing":
                check("reached a firing position", False, f"aim={aim}")
                ctx.close()
                continue
            ammo_before = st["ammo"]
            # Expected spend is the equipped def's ammoPerShot (burst 3,
            # spread 4, rail/grenade/homing 2, the rest 1).
            AMMO_PER_SHOT = {"scrapBlaster": 1, "plasmaRifle": 1, "railGun": 2,
                             "gatling": 3, "flamethrower": 2, "grenadeLauncher": 2,
                             "homingMissile": 2, "missilePod": 4, "shoulderRocket": 3,
                             "laserEmitter": 1, "energySword": 0}
            expect_spend = AMMO_PER_SHOT.get(st["weapon"]["defId"], 1)
            page.evaluate(f"window.__scrapDebug.getState().player.facing = {aim['facing']}")
            page.locator("#btn-fire").click()
            page.wait_for_timeout(400)
            after = page.evaluate(STATE_JS)
            dice_re = re.compile(r"\d+d\d+\+\d+:")
            check("FIRE spends the weapon's ammoPerShot, HUD/quickbar agree",
                  after["ammo"] == ammo_before - expect_spend
                  and after["hudAmmo"] == str(ammo_before - expect_spend)
                  and after["qsAmmo"] == str(ammo_before - expect_spend),
                  f"ammo {ammo_before} -> {after['ammo']} (expect -{expect_spend} for {st['weapon']['defId']})")
            check("combat log shows the dice roll and the tier tag",
                  any(dice_re.search(line) and tier_re.search(line) for line in after["logTail"]),
                  after["logTail"])
            page.screenshot(path=str(SHOTS / "phase1-fire.png"))
            check("no console errors / failed assets", not errors, errors[:5] or "none")
            fired = True
            ctx.close()
            break
        check("picked up a weapon drop and fired within 4 fresh runs", picked and fired, "")
        browser.close()

    print(json.dumps({"failures": FAILURES}, indent=1))
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
