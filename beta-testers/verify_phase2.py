#!/usr/bin/env python3
"""Browser verification for Scrap Dungeon Phase 2 (gear slots).

Drives the real game in headless Chromium (Playwright, ML venv) and
checks, against live state via window.__scrapDebug:
  - a fresh run starts with a Common +0 scrap blaster instance, 16 ammo
  - a gear pickup on some depth is stowed into the Bag on step-over
    (equipped weapon unchanged, no auto-equip, log names the tier)
  - the Bag modal shows an Equipment section (4 slots, derived
    stats, shield pool) and an Equip button for the carried gear
  - clicking Equip fills the slot, returns the old piece to the Bag,
    and costs no time / no action
  - a shield, once equipped, starts empty, recharges on waits, and
    absorbs damage before the hull in a real fight (log line)
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

GEAR_IDS = {"scrapPlating", "alloyVest", "ablativeWeave", "nanoLattice",
            "scrappersWard", "alloyAegis", "ablativeBarrier", "nanoBastion",
            "scope", "sensor", "gyroStabilizer", "powerCell"}
SHIELD_IDS = {"scrappersWard", "alloyAegis", "ablativeBarrier", "nanoBastion"}
SLOT_OF = {"scrapPlating": "armor", "alloyVest": "armor",
           "ablativeWeave": "armor", "nanoLattice": "armor",
           "scrappersWard": "shield", "alloyAegis": "shield",
           "ablativeBarrier": "shield", "nanoBastion": "shield",
           "scope": "utility", "sensor": "utility",
           "gyroStabilizer": "utility", "powerCell": "utility"}
DISPLAY_NAME = {"scrapPlating": "Scrap plating", "alloyVest": "Alloy vest",
                "ablativeWeave": "Ablative weave", "nanoLattice": "Nano-lattice",
                "scrappersWard": "Scrapper's ward", "alloyAegis": "Alloy aegis",
                "ablativeBarrier": "Ablative barrier", "nanoBastion": "Nano bastion",
                "scope": "Scope", "sensor": "Sensor",
                "gyroStabilizer": "Gyro-stabilizer", "powerCell": "Power cell"}


def check(name, ok, evidence):
    print(("PASS " if ok else "FAIL ") + name + " | " + str(evidence))
    if not ok:
        FAILURES.append(name)


STATE_JS = """() => {
  const s = window.__scrapDebug.getState();
  return {
    grid: s.floor.grid, px: s.player.x, py: s.player.y,
    stairs: {x: s.floor.stairs.x, y: s.floor.stairs.y},
    // Phase 4 (2026-10-29): s.ammo became typed pools; the fresh
    // run default loadout is 16 Standard, so standard count keeps
    // this check's meaning. Weapon instances gained element: null.
    ammo: s.ammoPools ? s.ammoPools.standard : 0, weapon: s.weapon, runState: s.state, depth: s.depth,
    hp: s.player.hp, clock: s.clock, actions: s.actions,
    healthCells: s.healthCells,
    equipment: s.equipment, carriedGear: s.carriedGear || [],
    shield: s.shield, hudHp: document.getElementById('hud-hp').textContent,
    logTail: s.log.slice(-8),
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
    EXCEPT a target cell itself."""
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


def walk_to(page, target, on_adjacent=None):
    """Walk to `target` with real key presses, re-planning BFS after
    every step. Returns fresh state."""
    called = [False]
    for _ in range(80):
        st = page.evaluate(STATE_JS)
        if st["runState"] != "playing":
            return st
        if (st["px"], st["py"]) == target:
            return st
        path = bfs_path(st, [target])
        if not path:
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


def maybe_heal(page):
    """Long hunts cross the power-starvation threshold (120 actions)
    and take enemy hits: top up with health cells (heal 25) whenever
    HP is low, so the hunt tests the shield, not attrition."""
    for _ in range(4):
        st = page.evaluate(STATE_JS)
        if st["runState"] != "playing" or st["hp"] > 55 or not st["healthCells"]:
            return
        page.locator("#qs-health").click()
        page.wait_for_timeout(250)


def descend(page):
    """Walk adjacent to the stairs, step on, press 1 to descend.
    Returns fresh state (or the pre-descend state on failure)."""
    st = page.evaluate(STATE_JS)
    depth_before = st["depth"]
    sx, sy = st["stairs"]["x"], st["stairs"]["y"]
    adj = [(sx + dx, sy + dy) for dx, dy in DIRS8
           if st["grid"][sy + dy][sx + dx] in WALK]
    st = walk_to(page, adj[0]) if adj else st
    if st["runState"] != "playing":
        return st
    # Re-plan to the nearest adjacent cell (walk_to took the first).
    st = page.evaluate(STATE_JS)
    if (st["px"], st["py"]) not in adj:
        path = bfs_path(st, adj)
        if path:
            st = walk_to(page, path[-1])
    st = page.evaluate(STATE_JS)
    if st["runState"] != "playing" or (st["px"], st["py"]) not in adj:
        return st
    key = KEY_FOR[(sx - st["px"], sy - st["py"])]
    page.keyboard.press(key)
    page.wait_for_timeout(300)
    st = page.evaluate(STATE_JS)
    if st["runState"] != "stairs":
        return st
    page.keyboard.press("1")
    page.wait_for_timeout(400)
    st = page.evaluate(STATE_JS)
    check(f"descended depth {depth_before} -> {depth_before + 1}",
          st["depth"] == depth_before + 1 and st["runState"] == "playing",
          {"depth": st["depth"], "runState": st["runState"]})
    return st


def equip_in_bag(page, def_id):
    """Open the Bag, click the Equip button on the carried row naming
    def_id's display name. Returns (bag_text, clicked)."""
    page.locator("#btn-inventory").click()
    page.wait_for_timeout(400)
    # The equipment section is appended to the modal box, outside
    # #modal-body, so read the whole modal's text.
    bag_text = page.evaluate(
        "() => document.getElementById('modal').innerText")
    name = DISPLAY_NAME[def_id]
    clicked = page.evaluate(
        """(name) => {
          const btns = Array.from(document.querySelectorAll('button'));
          for (const b of btns) {
            if (b.textContent.trim() !== 'Equip') continue;
            const row = b.parentElement;
            if (row && row.innerText.includes(name)) { b.click(); return true; }
          }
          return false;
        }""", name)
    page.wait_for_timeout(300)
    return bag_text, clicked


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox"])
        phase_a_done = False
        shield_done = False
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
                                   "upgrade": 0, "properties": [], "flair": None,
                                   "element": None}
                  and st["ammo"] == 16,
                  {"weapon": st["weapon"], "ammo": st["ammo"]})
            # ---- Phase A: gear pickup -> stow -> Bag equip (floors 1..4)
            gear_target = None
            for _floor in range(4):
                st = page.evaluate(STATE_JS)
                if st["runState"] != "playing":
                    break
                gear_items = [p for p in st["items"] if p["defId"] in GEAR_IDS]
                if gear_items:
                    gear_target = gear_items[0]
                    break
                st = descend(page)
                if st["runState"] != "playing":
                    break
            if not gear_target:
                check("gear pickup found within 4 floors", False, "none seen")
                ctx.close()
                continue
            target_cell = (gear_target["x"], gear_target["y"])

            def shot_ring():
                page.wait_for_timeout(300)
                page.screenshot(path=str(SHOTS / "phase2-item-ring.png"))

            st = walk_to(page, target_cell, on_adjacent=shot_ring)
            if st["runState"] != "playing":
                check("reached the gear pickup alive", False, st["runState"])
                ctx.close()
                continue
            tier_re = re.compile(r"\[(Common|Uncommon|Rare|Epic|Legendary)\]")
            check("stepping on a gear drop stows it in the Bag (weapon unchanged)",
                  any(p["defId"] == gear_target["defId"] for p in st["carriedGear"])
                  and st["weapon"]["defId"] == "scrapBlaster",
                  {"carried": st["carriedGear"], "weapon": st["weapon"]})
            check("stow log line names the tier and the Bag",
                  any(tier_re.search(line) and "Bag" in line for line in st["logTail"]),
                  st["logTail"])
            # ---- Bag equip: slot fills, old piece returns, no time cost
            clock_before, actions_before = st["clock"], st["actions"]
            slot = SLOT_OF[gear_target["defId"]]
            old_piece = st["equipment"][slot]
            bag_text, clicked = equip_in_bag(page, gear_target["defId"])
            check("Bag shows an Equipment section with the carried gear row",
                  "Equipment" in bag_text
                  and DISPLAY_NAME[gear_target["defId"]] in bag_text,
                  bag_text[:300])
            check("Equip button clicked for the carried row", clicked, "")
            st = page.evaluate(STATE_JS)
            check("Bag Equip fills the slot with the exact instance",
                  st["equipment"][slot] is not None
                  and st["equipment"][slot]["defId"] == gear_target["defId"]
                  and st["equipment"][slot]["tier"] == gear_target["tier"],
                  {"slot": slot, "equipped": st["equipment"][slot]})
            check("Bag swap costs no time and no action",
                  st["clock"] == clock_before and st["actions"] == actions_before,
                  {"clock": (clock_before, st["clock"]),
                   "actions": (actions_before, st["actions"])})
            if old_piece:
                check("replaced piece returns to the carried list",
                      any(p["defId"] == old_piece["defId"] for p in st["carriedGear"]),
                      st["carriedGear"])
            else:
                check("equipped piece leaves the carried list",
                      not any(p["defId"] == gear_target["defId"] for p in st["carriedGear"]),
                      st["carriedGear"])
            page.screenshot(path=str(SHOTS / "phase2-bag.png"))
            # Close via the modal's own Close button.
            page.locator("#modal-btns button", has_text="Close").click()
            page.wait_for_timeout(200)
            phase_a_done = True
            # ---- Phase B: shield hunt (collect items, descend as needed)
            shield_id = None
            for _floor in range(5):
                st = page.evaluate(STATE_JS)
                if st["runState"] != "playing":
                    break
                carried = [p["defId"] for p in st["carriedGear"]]
                equipped = st["equipment"].get("shield")
                if equipped and equipped["defId"] in SHIELD_IDS:
                    shield_id = equipped["defId"]
                    break
                shield_carried = [d for d in carried if d in SHIELD_IDS]
                if shield_carried:
                    shield_id = shield_carried[0]
                    break
                # Collect item pickups on this floor (up to 3), then descend.
                for _pick in range(3):
                    st = page.evaluate(STATE_JS)
                    if st["runState"] != "playing":
                        break
                    if not st["items"]:
                        break
                    nxt = st["items"][0]
                    st = walk_to(page, (nxt["x"], nxt["y"]))
                    maybe_heal(page)
                    if st["runState"] != "playing":
                        break
                    if any(p["defId"] in SHIELD_IDS for p in st["carriedGear"]):
                        shield_id = [p["defId"] for p in st["carriedGear"]
                                     if p["defId"] in SHIELD_IDS][0]
                        break
                if shield_id or st["runState"] != "playing":
                    break
                st = descend(page)
                maybe_heal(page)
            if not shield_id:
                st = page.evaluate(STATE_JS)
                check("shield found within 5 floors", False,
                      {"runState": st["runState"], "hp": st["hp"],
                       "depth": st["depth"], "actions": st["actions"]})
                ctx.close()
                continue
            # Equip the shield from the Bag if it is not already worn.
            st = page.evaluate(STATE_JS)
            if not (st["equipment"].get("shield")
                    and st["equipment"]["shield"]["defId"] == shield_id):
                bag_text, clicked = equip_in_bag(page, shield_id)
                check("Bag Equip clicked for the shield", clicked, "")
                page.locator("#modal-btns button", has_text="Close").click()
                page.wait_for_timeout(200)
                st = page.evaluate(STATE_JS)
            check("shield equipped in the shield slot",
                  st["equipment"].get("shield") is not None
                  and st["equipment"]["shield"]["defId"] == shield_id,
                  st["equipment"])
            check("freshly equipped shield starts empty",
                  st["shield"] == 0, {"shield": st["shield"]})
            # Recharge: two waits (2 time units) must grant >= 1 charge.
            page.keyboard.press(" ")
            page.wait_for_timeout(200)
            page.keyboard.press(" ")
            page.wait_for_timeout(200)
            st = page.evaluate(STATE_JS)
            check("shield recharges on waits (pool >= 1 after 2 waits)",
                  st["shield"] >= 1, {"shield": st["shield"]})
            # Real fight: walk adjacent to a living enemy, bump once to
            # wake it, then wait; some hit must land on the shield.
            absorbed = False
            for _try in range(12):
                st = page.evaluate(STATE_JS)
                if st["runState"] != "playing":
                    break
                if any("shield absorbed" in line for line in st["logTail"]):
                    absorbed = True
                    break
                maybe_heal(page)
                if not st["enemies"]:
                    break
                foe = min(st["enemies"], key=lambda e: e["hp"])
                adj = [(foe["x"] + dx, foe["y"] + dy) for dx, dy in DIRS8
                       if st["grid"][foe["y"] + dy][foe["x"] + dx] in WALK]
                if not adj:
                    break
                st = walk_to(page, adj[0])
                if st["runState"] != "playing":
                    break
                st = page.evaluate(STATE_JS)
                if (st["px"], st["py"]) not in adj:
                    path = bfs_path(st, adj)
                    if path:
                        st = walk_to(page, path[-1])
                    st = page.evaluate(STATE_JS)
                    if (st["px"], st["py"]) not in adj:
                        continue
                # Bump toward the enemy (wakes it + melee), then wait.
                # The foe may have moved since the last read: only bump
                # when it is exactly one step away.
                delta = (foe["x"] - st["px"], foe["y"] - st["py"])
                if delta not in KEY_FOR:
                    continue
                key = KEY_FOR[delta]
                page.keyboard.press(key)
                page.wait_for_timeout(250)
                st = page.evaluate(STATE_JS)
                if any("shield absorbed" in line for line in st["logTail"]):
                    absorbed = True
                    break
                page.keyboard.press(" ")
                page.wait_for_timeout(250)
            st = page.evaluate(STATE_JS)
            check("shield absorb visible in a real fight (log line)",
                  absorbed and st["runState"] == "playing",
                  {"absorbed": absorbed, "runState": st["runState"],
                   "shield": st["shield"], "hp": st["hp"],
                   "logTail": st["logTail"]})
            if absorbed:
                page.screenshot(path=str(SHOTS / "phase2-shield.png"))
            check("no console errors / failed assets", not errors, errors[:5] or "none")
            shield_done = absorbed
            ctx.close()
            break
        check("gear stow + Bag equip verified within 4 fresh runs", phase_a_done, "")
        check("shield recharge + absorb verified within 4 fresh runs", shield_done, "")
        browser.close()

    print(json.dumps({"failures": FAILURES}, indent=1))
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
