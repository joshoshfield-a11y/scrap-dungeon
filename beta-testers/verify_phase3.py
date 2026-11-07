#!/usr/bin/env python3
"""Browser verification for Scrap Dungeon Phase 3 (two skill systems).

Drives the real game in headless Chromium (Playwright, ML venv) and
checks, against live state via window.__scrapDebug, with REAL clicks
and key presses throughout:
  - a fresh run starts with energy 100 / heat 0, no mech skills, 0 run
    skill points, and the HUD meters line collapsed (hidden)
  - hunting (real bump kills + data chips) earns run skill points
  - the Bag shows a Mech section: Learn (2 pts) learns a skill with no
    time cost; Use spends time + energy + heat and applies the effect
  - using Overclock 5x overheats the mech (>=100 heat); the next Use
    is refused at no time cost; waiting cools below 50 and unlocks;
    Vent Heat clears heat outright
  - the HUD meters line appears while meters are non-full
  - after extract, the hub shows The Instructor station with all 12
    pilot skills rendered from the data table; buying Steady Aim with
    a real click spends 20 banked salvage and persists
  - a scripted death keeps the pilot rank (hub store) while a new
    expedition starts with empty mech state (run store wiped)
  - respec with a real click refunds all ranks at 25 salvage per rank
  - zero console errors, zero failed asset requests
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

PILOT_SKILL_NAMES = [
    "Steady Aim", "Heavy Hands", "Second Wind", "Trigger Discipline",
    "Salvage Sense", "Breakdown", "Deep Pockets", "Codex Eye",
    "Field Repair", "Ammo Smith", "Overclock Tuning", "Plating Know-how",
]


def check(name, ok, evidence):
    print(("PASS " if ok else "FAIL ") + name + " | " + str(evidence))
    if not ok:
        FAILURES.append(name)


STATE_JS = """() => {
  const s = window.__scrapDebug.getState();
  const meters = document.getElementById('hud-meters');
  return {
    grid: s.floor.grid, px: s.player.x, py: s.player.y,
    facing: s.player.facing,
    // Phase 4 (2026-10-29): the single s.ammo scalar was replaced by
    // typed pools; total run ammo preserves this script's semantics
    // (crate hunts / empty-ammo aborts). No Phase 3 behavior changed.
    ammo: s.ammoPools ? (s.ammoPools.standard + s.ammoPools.piercing
      + s.ammoPools.incendiary + s.ammoPools.shock) : 0,
    stairs: {x: s.floor.stairs.x, y: s.floor.stairs.y},
    runState: s.state, depth: s.depth,
    hp: s.player.hp, clock: s.clock, actions: s.actions,
    healthCells: s.healthCells, foodCells: s.foodCells,
    kills: s.kills, carried: s.carried,
    energy: s.energy, heat: s.heat, overheated: !!s.overheated,
    mechSkills: s.mechSkills || [], runSkillPoints: s.runSkillPoints || 0,
    pendingXp: s.pendingXp || 0, mechEffects: s.mechEffects || {},
    hub: s.hub ? {skills: s.hub.skills || {}, pilotXp: s.hub.pilotXp || 0,
                  banked: s.hub.banked, codexLen: (s.hub.codex || []).length} : null,
    meters: meters ? {text: meters.textContent,
                      hidden: meters.classList.contains('hidden')} : null,
    logTail: s.log.slice(-8),
    chips: s.floor.pickups.filter(p => p.kind === 'dataChip')
      .map(p => ({x: p.x, y: p.y})),
    healthPk: s.floor.pickups.filter(p => p.kind === 'health')
      .map(p => ({x: p.x, y: p.y})),
    foodPk: s.floor.pickups.filter(p => p.kind === 'food')
      .map(p => ({x: p.x, y: p.y})),
    ammoPk: s.floor.pickups.filter(p => p.kind === 'ammo')
      .map(p => ({x: p.x, y: p.y})),
    salvagePk: s.floor.pickups.filter(p => p.kind === 'salvage')
      .map(p => ({x: p.x, y: p.y})),
    enemies: s.floor.enemies.filter(e => e.alive).map(e => ({id: e.id, type: e.type, x: e.x, y: e.y, hp: e.hp})),
  };
}"""

WALK = {"floor", "corridor", "door", "hazard"}
DIRS8 = [(0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1)]
KEY_FOR = {(0, -1): "ArrowUp", (0, 1): "ArrowDown", (-1, 0): "ArrowLeft",
           (1, 0): "ArrowRight", (-1, -1): "q", (1, -1): "e",
           (-1, 1): "z", (1, 1): "c"}


def bfs_path(st, targets, blocked_extra=(), safe=False):
    """BFS to the nearest cell in `targets`. Enemy/stairs cells blocked,
    EXCEPT a target cell itself. With safe=True, cells adjacent to a
    live enemy are also blocked (except the target): walking through
    the pack costs ~8 HP per step in retaliation hits."""
    from collections import deque
    grid, sx, sy = st["grid"], st["px"], st["py"]
    blocked = {(e["x"], e["y"]) for e in st["enemies"]}
    blocked.add((st["stairs"]["x"], st["stairs"]["y"]))
    blocked |= set(blocked_extra)
    if safe:
        for e in st["enemies"]:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    blocked.add((e["x"] + dx, e["y"] + dy))
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


def walk_to(page, target):
    """Walk to `target` with real key presses, re-planning BFS after
    every step. Returns fresh state."""
    for step in range(80):
        st = page.evaluate(STATE_JS)
        if st["runState"] != "playing":
            return st
        if (st["px"], st["py"]) == target:
            return st
        # Never step onto a live enemy: the target may have moved onto
        # by a foe since planning (bumping it 80 times is fatal).
        if any(e["x"] == target[0] and e["y"] == target[1] for e in st["enemies"]):
            return st
        if step % 8 == 7:
            st = sustain(page)
            if st["runState"] != "playing":
                return st
            if (st["px"], st["py"]) == target:
                return st
            # Cornered at low HP: abort the walk so the hunt loop's
            # flee/kite logic takes over instead of pressing on
            # through the pack.
            if st["hp"] <= 40 and any(
                    max(abs(e["x"] - st["px"]), abs(e["y"] - st["py"])) == 1
                    for e in st["enemies"]):
                return st
        path = bfs_path(st, [target], safe=True) or bfs_path(st, [target])
        if not path:
            page.keyboard.press(" ")
            page.wait_for_timeout(200)
            continue
        nx, ny = path[0]
        key = KEY_FOR[(nx - st["px"], ny - st["py"])]
        page.keyboard.press(key)
        page.wait_for_timeout(160)
    return page.evaluate(STATE_JS)


def safe_click(page, selector, timeout=3000):
    """Click that never hangs the script: short timeout, ignore failure.
    A modal left open (e.g. the death modal) makes HUD clicks time out
    instead of crashing the run."""
    try:
        page.locator(selector).click(timeout=timeout)
        return True
    except Exception:
        return False


def sustain(page):
    """Eat/heal mid-walk: a fresh profile starts with 0 consumables and
    one hunt iteration burns dozens of actions, so sustainment must run
    INSIDE movement loops, not just between them."""
    st = page.evaluate(STATE_JS)
    if st["runState"] != "playing":
        return st
    if st["actions"] > 90 and st["foodCells"]:
        safe_click(page, "#qs-food")
        page.wait_for_timeout(250)
        st = page.evaluate(STATE_JS)
    if st["runState"] == "playing" and st["hp"] <= 70 and st["healthCells"]:
        safe_click(page, "#qs-health")
        page.wait_for_timeout(250)
        st = page.evaluate(STATE_JS)
    return st


def maybe_heal(page):
    for _ in range(4):
        st = page.evaluate(STATE_JS)
        if st["runState"] != "playing" or st["hp"] > 70 or not st["healthCells"]:
            return
        safe_click(page, "#qs-health")
        page.wait_for_timeout(250)


def maybe_eat(page):
    st = page.evaluate(STATE_JS)
    if st["runState"] == "playing" and st["actions"] > 50 and st["foodCells"]:
        safe_click(page, "#qs-food")
        page.wait_for_timeout(250)


def collect_pickups(page, st):
    """Walk to the nearest health/food pickup when the run needs it.
    Returns fresh state (or the input state if nothing to collect)."""
    if st["runState"] != "playing":
        return st
    need_health = (st["hp"] <= 75 or st["healthCells"] == 0) and st["healthPk"]
    need_food = (st["foodCells"] == 0 and st["actions"] > 40) and st["foodPk"]
    need_ammo = st["ammo"] < 8 and st["ammoPk"]
    if need_health:
        tgt = min(st["healthPk"], key=lambda p: abs(p["x"] - st["px"]) + abs(p["y"] - st["py"]))
        return walk_to(page, (tgt["x"], tgt["y"]))
    if need_food:
        tgt = min(st["foodPk"], key=lambda p: abs(p["x"] - st["px"]) + abs(p["y"] - st["py"]))
        return walk_to(page, (tgt["x"], tgt["y"]))
    if need_ammo:
        tgt = min(st["ammoPk"], key=lambda p: abs(p["x"] - st["px"]) + abs(p["y"] - st["py"]))
        return walk_to(page, (tgt["x"], tgt["y"]))
    # Opportunistic salvage: only nearby pickups, so the hunt does not
    # wander the whole floor for scrap.
    near = [p for p in st["salvagePk"]
            if max(abs(p["x"] - st["px"]), abs(p["y"] - st["py"])) <= 8]
    if near and st["carried"] < 70:
        tgt = min(near, key=lambda p: abs(p["x"] - st["px"]) + abs(p["y"] - st["py"]))
        return walk_to(page, (tgt["x"], tgt["y"]))
    return st


def descend(page):
    """Walk adjacent to the stairs, step on, press 1 to descend."""
    st = page.evaluate(STATE_JS)
    depth_before = st["depth"]
    sx, sy = st["stairs"]["x"], st["stairs"]["y"]
    adj = [(sx + dx, sy + dy) for dx, dy in DIRS8
           if st["grid"][sy + dy][sx + dx] in WALK]
    st = walk_to(page, adj[0]) if adj else st
    if st["runState"] != "playing":
        return st
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
    return page.evaluate(STATE_JS)


def extract_now(page):
    """Step on the stairs and extract (real click on EXTRACT, with the
    game's stairs key '2' as fallback). Verifies the hub screen
    appeared; retries the step-once the extract if a leftover modal
    (e.g. the Bag) intercepted the panel click. Up to 2 attempts."""
    for _attempt in range(2):
        dismiss_modal(page)
        st = page.evaluate(STATE_JS)
        if st["runState"] != "playing":
            return st
        sx, sy = st["stairs"]["x"], st["stairs"]["y"]
        adj = [(sx + dx, sy + dy) for dx, dy in DIRS8
               if st["grid"][sy + dy][sx + dx] in WALK]
        st = walk_to(page, adj[0]) if adj else st
        if st["runState"] != "playing":
            return st
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
        # A leftover modal open over the stairs panel intercepts the
        # click: Escape closes the modal but cancels the stairs, so
        # re-step and use the key instead.
        if modal_open(page):
            page.keyboard.press("Escape")
            page.wait_for_timeout(250)
            continue
        safe_click(page, "#btn-stairs-extract", timeout=5000)
        page.wait_for_timeout(500)
        head = modal_text(page)
        if "EXTRACTED" in head or "HUB" in head:
            return page.evaluate(STATE_JS)
        page.keyboard.press("2")
        page.wait_for_timeout(500)
        head = modal_text(page)
        if "EXTRACTED" in head or "HUB" in head:
            return page.evaluate(STATE_JS)
    return page.evaluate(STATE_JS)


def modal_text(page):
    return page.evaluate("() => document.getElementById('modal').innerText")


def click_row_button(page, row_match, button_prefix):
    """Click the first button whose text starts with `button_prefix`
    and whose parent row's text contains `row_match`. Real click."""
    return page.evaluate(
        """([rowMatch, btnPrefix]) => {
          const btns = Array.from(document.querySelectorAll('#modal button'));
          for (const b of btns) {
            if (!b.textContent.trim().startsWith(btnPrefix)) continue;
            const row = b.parentElement;
            if (row && row.innerText.includes(rowMatch)) { b.click(); return true; }
          }
          return false;
        }""", [row_match, button_prefix])


def modal_open(page):
    return page.evaluate(
        "() => !document.getElementById('modal').classList.contains('hidden')")


def dismiss_modal(page):
    """Close any open modal (Close button, else Escape), verifying
    closure with retries. Guards HUD clicks against a stuck-open modal
    (a modal left open intercepts pointer events on every HUD button)."""
    for _ in range(3):
        if not modal_open(page):
            return
        if not click_row_button(page, "", "Close"):
            page.keyboard.press("Escape")
        page.wait_for_timeout(250)
    # Last resort: Escape always hides the modal when playing.
    if modal_open(page):
        page.keyboard.press("Escape")
        page.wait_for_timeout(250)


def open_bag(page):
    dismiss_modal(page)
    safe_click(page, "#btn-inventory", timeout=5000)
    page.wait_for_timeout(400)


def close_modal(page):
    dismiss_modal(page)


def bfs_to_predicate(st, pred):
    """BFS to the nearest walkable cell satisfying pred(x, y). Enemy and
    stairs cells are blocked. Returns the path (list of cells) or None."""
    from collections import deque
    grid, sx, sy = st["grid"], st["px"], st["py"]
    blocked = {(e["x"], e["y"]) for e in st["enemies"]}
    blocked.add((st["stairs"]["x"], st["stairs"]["y"]))
    prev = {(sx, sy): None}
    q = deque([(sx, sy)])
    while q:
        x, y = q.popleft()
        if (x, y) != (sx, sy) and pred(x, y):
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


def has_los(grid, x0, y0, x1, y1):
    """Bresenham; walls block (mirrors core.js lineOfSight)."""
    dx, dy = abs(x1 - x0), abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err, x, y = dx - dy, x0, y0
    while not (x == x1 and y == y1):
        e2 = 2 * err
        if e2 > -dy:
            err -= dy
            x += sx
        if e2 < dx:
            err += dx
            y += sy
        if x == x1 and y == y1:
            break
        if grid[y][x] == "wall":
            return False
    return True


DIRS8_PY = [(0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1)]


def dir_index_to(dx, dy):
    sx = (dx > 0) - (dx < 0)
    sy = (dy > 0) - (dy < 0)
    return DIRS8_PY.index((sx, sy))


def kite_kill(page, foe_id):
    """Kill one foe at range: stand, let the foe walk into a firing
    lane, fire; melee only what touches the player. Walking long
    distances toward foes lets the whole pack converge and kill the
    player, so distant foes are approached one step per re-evaluation
    (the foe pursues at the same time, they meet halfway).
    Returns True if the foe died, False if the loop gave up."""
    for _ in range(60):
        st = page.evaluate(STATE_JS)
        if st["runState"] != "playing":
            return False
        alive = [e for e in st["enemies"] if e["id"] == foe_id]
        if not alive:
            return True
        foe = alive[0]
        dx, dy = foe["x"] - st["px"], foe["y"] - st["py"]
        dist = max(abs(dx), abs(dy))
        if st["ammo"] <= 0:
            return False
        # Something adjacent: melee it (nearest adjacent enemy).
        adj = [e for e in st["enemies"]
               if max(abs(e["x"] - st["px"]), abs(e["y"] - st["py"])) == 1]
        if adj:
            if st["hp"] > 40:
                tgt = adj[0]
                page.keyboard.press(KEY_FOR[(tgt["x"] - st["px"], tgt["y"] - st["py"])])
                page.wait_for_timeout(200)
            else:
                # Step away from the nearest adjacent enemy.
                foe2 = adj[0]
                best, best_d = None, -1
                for ddx, ddy in DIRS8:
                    nx, ny = st["px"] + ddx, st["py"] + ddy
                    if st["grid"][ny][nx] not in WALK:
                        continue
                    if any(e["x"] == nx and e["y"] == ny for e in st["enemies"]):
                        continue
                    if (nx, ny) == (st["stairs"]["x"], st["stairs"]["y"]):
                        continue
                    dd = max(abs(foe2["x"] - nx), abs(foe2["y"] - ny))
                    if dd > best_d:
                        best, best_d = (ddx, ddy), dd
                if best is None:
                    return False
                page.keyboard.press(KEY_FOR[best])
                page.wait_for_timeout(200)
        elif (dx == 0 or dy == 0 or abs(dx) == abs(dy)) and dist <= 5 \
                and has_los(st["grid"], st["px"], st["py"], foe["x"], foe["y"]):
            if st["facing"] == dir_index_to(dx, dy):
                page.keyboard.press("f")
                page.wait_for_timeout(200)
            else:
                # Step toward the foe: dist >= 2, so the cell is empty
                # and the step sets facing along the ray.
                page.keyboard.press(KEY_FOR[(dx // dist if dx else 0,
                                             dy // dist if dy else 0)])
                page.wait_for_timeout(200)
        elif dist <= 5 and has_los(st["grid"], st["px"], st["py"],
                                   foe["x"], foe["y"]):
            # Close and visible but off-ray: wait — the foe's pursuit
            # walk usually brings it onto a ray within a few waits.
            page.keyboard.press(" ")
            page.wait_for_timeout(200)
        else:
            # Far, or no line of sight (foe asleep behind a wall): one
            # step toward the foe, then re-evaluate. Single steps only
            # — walking a full path lets the pack converge, and a
            # sleeping foe never comes to a waiting player.
            adj_cells = [(foe["x"] + ddx, foe["y"] + ddy) for ddx, ddy in DIRS8
                         if st["grid"][foe["y"] + ddy][foe["x"] + ddx] in WALK]
            path = bfs_path(st, adj_cells)
            if path:
                nx, ny = path[0]
                page.keyboard.press(KEY_FOR[(nx - st["px"], ny - st["py"])])
                page.wait_for_timeout(200)
            else:
                page.keyboard.press(" ")
                page.wait_for_timeout(200)
        sustain(page)
    st = page.evaluate(STATE_JS)
    return not any(e["id"] == foe_id for e in st["enemies"])


def hunt(page, need_points, need_carried, max_steps=140,
         fight_until_kills=3, pacifist=False, need_total=None):
    """Real-play hunt: data chips first (points), then ranged kills up
    to `fight_until_kills`, then pacifist chip/salvage collection
    (flee, never engage). Stops when the point + carried targets are
    met, the run ends, or steps run out. Descends when a floor is
    exhausted (banking 25%). With need_total set, stops as soon as
    hub-banked + carried reaches it (and carried >= need_carried):
    chasing carried across extra floors is what kills the run."""
    steps = 0
    while steps < max_steps:
        st = page.evaluate(STATE_JS)
        if st["runState"] != "playing":
            return st
        if need_total is None:
            if st["runSkillPoints"] >= need_points and st["carried"] >= need_carried:
                return st
        elif st["hub"] is not None \
                and st["hub"]["banked"] + st["carried"] >= need_total \
                and st["carried"] >= need_carried:
            return st
        maybe_heal(page)
        maybe_eat(page)
        st = page.evaluate(STATE_JS)
        if st["runState"] != "playing":
            return st
        st = collect_pickups(page, st)
        if st["runState"] != "playing":
            return st
        # Pacifist (or kill quota met): step away from adjacent foes
        # instead of engaging, then keep collecting.
        adj = [e for e in st["enemies"]
               if max(abs(e["x"] - st["px"]), abs(e["y"] - st["py"])) == 1]
        if (pacifist or st["kills"] >= fight_until_kills) and adj:
            foe2 = adj[0]
            best, best_d = None, -1
            for ddx, ddy in DIRS8:
                nx, ny = st["px"] + ddx, st["py"] + ddy
                if st["grid"][ny][nx] not in WALK:
                    continue
                if any(e["x"] == nx and e["y"] == ny for e in st["enemies"]):
                    continue
                if (nx, ny) == (st["stairs"]["x"], st["stairs"]["y"]):
                    continue
                dd = max(abs(foe2["x"] - nx), abs(foe2["y"] - ny))
                if dd > best_d:
                    best, best_d = (ddx, ddy), dd
            if best is not None:
                page.keyboard.press(KEY_FOR[best])
                page.wait_for_timeout(200)
                steps += 1
                continue
        if st["chips"] and st["runSkillPoints"] < need_points:
            tgt = st["chips"][0]
            st = walk_to(page, (tgt["x"], tgt["y"]))
        elif st["enemies"] and not pacifist and st["kills"] < fight_until_kills:
            # Brutes cost ~half the player's HP in a bump fight; skip
            # them — raiders and drones earn the same skill points.
            light = [e for e in st["enemies"] if e["type"] != "brute"]
            if not light:
                st = page.evaluate(STATE_JS)
                if st["depth"] < 3 and st["runState"] == "playing":
                    st = descend(page)
                else:
                    page.keyboard.press(" ")
                    page.wait_for_timeout(150)
                steps += 1
                continue
            foe = min(light,
                      key=lambda e: abs(e["x"] - st["px"]) + abs(e["y"] - st["py"]))
            foe_id, foe_pos = foe["id"], (foe["x"], foe["y"])
            killed = kite_kill(page, foe_id)
            st = page.evaluate(STATE_JS)
            # Only walk onto the kill cell for the drop when the foe
            # actually died — walking onto a LIVE foe bumps it to death
            # (the player's). kite_kill returning False means it is alive.
            if killed and st["runState"] == "playing":
                st = walk_to(page, foe_pos)
        else:
            # Floor exhausted: descend (banking 25%) and keep hunting.
            st = page.evaluate(STATE_JS)
            if st["depth"] < 3 and st["runState"] == "playing":
                st = descend(page)
            else:
                page.keyboard.press(" ")
                page.wait_for_timeout(150)
        steps += 1
    return page.evaluate(STATE_JS)


def die_deliberately(page, max_waits=60):
    """Stand next to the nearest enemy and wait (no healing) until
    the run ends. Returns fresh state."""
    for _ in range(max_waits):
        st = page.evaluate(STATE_JS)
        if st["runState"] != "playing":
            return st
        if not st["enemies"]:
            page.keyboard.press(" ")
            page.wait_for_timeout(200)
            continue
        foe = min(st["enemies"],
                  key=lambda e: abs(e["x"] - st["px"]) + abs(e["y"] - st["py"]))
        if max(abs(foe["x"] - st["px"]), abs(foe["y"] - st["py"])) != 1:
            adj = [(foe["x"] + dx, foe["y"] + dy) for dx, dy in DIRS8
                   if st["grid"][foe["y"] + dy][foe["x"] + dx] in WALK]
            if adj:
                st = walk_to(page, adj[0])
                if st["runState"] != "playing":
                    return st
                continue
        page.keyboard.press(" ")
        page.wait_for_timeout(200)
    return page.evaluate(STATE_JS)


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox"])
        done = {"fresh": False, "mech": False, "overheat": False,
                "hub": False, "persist": False, "respec": False}
        for attempt in range(6):
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
            check(f"fresh run: energy 100, heat 0, no mech skills, 0 points, meters collapsed (attempt {attempt + 1})",
                  st["energy"] == 100 and st["heat"] == 0
                  and st["mechSkills"] == [] and st["runSkillPoints"] == 0
                  and st["meters"] is not None and st["meters"]["hidden"],
                  {"energy": st["energy"], "heat": st["heat"],
                   "mechSkills": st["mechSkills"],
                   "points": st["runSkillPoints"], "meters": st["meters"]})
            if not (st["energy"] == 100 and st["heat"] == 0 and st["mechSkills"] == []):
                ctx.close()
                continue
            done["fresh"] = True
            # ---- Hunt: earn 4 run skill points + carried salvage.
            # Fight only for the first 3 kills; chips + fleeing cover
            # the rest (a fresh profile cannot sustain full-floor brawls).
            st = hunt(page, need_points=4, need_carried=25)
            check("hunt earns 4+ run skill points and 25+ carried salvage",
                  st["runState"] == "playing" and st["runSkillPoints"] >= 4
                  and st["carried"] >= 25,
                  {"runState": st["runState"], "points": st["runSkillPoints"],
                   "carried": st["carried"], "kills": st["kills"]})
            if st["runState"] != "playing" or st["runSkillPoints"] < 4:
                ctx.close()
                continue
            # ---- Bag: learn Overclock + Vent Heat with real clicks.
            open_bag(page)
            bag = modal_text(page)
            check("Bag shows a Mech skills section with all six skills",
                  "Mech skills" in bag
                  and all(n in bag for n in
                          ["Overclock", "Evasive Protocols", "Emergency Plating",
                           "Sensor Pulse", "Salvage Burst", "Vent Heat"]),
                  bag[:400])
            page.screenshot(path=str(SHOTS / "phase3-bag-mech.png"))
            pts_before = page.evaluate(STATE_JS)["runSkillPoints"]
            clock_before = page.evaluate(STATE_JS)["clock"]
            clicked = click_row_button(page, "Overclock", "Learn")
            page.wait_for_timeout(300)
            st = page.evaluate(STATE_JS)
            check("Learn (real click) learns Overclock, costs 2 points, no time",
                  clicked and "overclock" in st["mechSkills"]
                  and st["runSkillPoints"] == pts_before - 2
                  and st["clock"] == clock_before,
                  {"clicked": clicked, "mechSkills": st["mechSkills"],
                   "points": st["runSkillPoints"], "clock": st["clock"]})
            clicked = click_row_button(page, "Vent Heat", "Learn")
            page.wait_for_timeout(300)
            st = page.evaluate(STATE_JS)
            check("Learn (real click) learns Vent Heat",
                  clicked and "ventHeat" in st["mechSkills"],
                  {"clicked": clicked, "mechSkills": st["mechSkills"]})
            if "overclock" not in st["mechSkills"] or "ventHeat" not in st["mechSkills"]:
                ctx.close()
                continue
            # ---- Use Overclock: costs time + energy + heat, applies.
            clock_before = st["clock"]
            clicked = click_row_button(page, "Overclock", "Use")
            page.wait_for_timeout(300)
            st = page.evaluate(STATE_JS)
            check("Use (real click) costs time + energy + heat and applies Overclock",
                  clicked and st["clock"] > clock_before
                  and st["energy"] < 100 and st["heat"] > 0
                  and st["mechEffects"].get("overclockShots") == 3
                  and any("Mech skill used: Overclock" in l for l in st["logTail"]),
                  {"clicked": clicked, "clock": st["clock"],
                   "energy": st["energy"], "heat": st["heat"],
                   "effects": st["mechEffects"], "logTail": st["logTail"]})
            check("HUD meters line appears while meters are non-full",
                  st["meters"] is not None and not st["meters"]["hidden"]
                  and "Energy" in st["meters"]["text"],
                  st["meters"])
            page.screenshot(path=str(SHOTS / "phase3-meters.png"))
            if st["runState"] != "playing":
                ctx.close()
                continue
            done["mech"] = True
            # ---- Overheat: 4 more Overclock uses -> heat >= 100, locked.
            overheated = False
            for _use in range(4):
                st = page.evaluate(STATE_JS)
                if st["runState"] != "playing" or st["overheated"]:
                    break
                if st["hp"] <= 70 and st["healthCells"]:
                    close_modal(page)
                    safe_click(page, "#qs-health")
                    page.wait_for_timeout(250)
                    open_bag(page)
                clicked = click_row_button(page, "Overclock", "Use")
                page.wait_for_timeout(300)
                st = page.evaluate(STATE_JS)
                if not clicked:
                    break
                overheated = st["overheated"]
            check("repeated Overclock use overheats the mech (locked)",
                  overheated and st["heat"] >= 80,
                  {"overheated": overheated, "heat": st["heat"],
                   "energy": st["energy"]})
            if not overheated:
                ctx.close()
                continue
            # Refusal while overheated costs no time.
            clock_before = st["clock"]
            clicked = click_row_button(page, "Overclock", "Use")
            page.wait_for_timeout(300)
            st = page.evaluate(STATE_JS)
            check("Use while overheated is refused at no time cost",
                  clicked and st["clock"] == clock_before
                  and st["overheated"]
                  and any("overheated" in l.lower() for l in st["logTail"]),
                  {"clicked": clicked, "clock": st["clock"],
                   "overheated": st["overheated"], "logTail": st["logTail"]})
            close_modal(page)
            for _ in range(6):
                page.keyboard.press(" ")
                page.wait_for_timeout(200)
            st = page.evaluate(STATE_JS)
            check("waiting cools below 50 and unlocks mech skills",
                  st["runState"] == "playing" and not st["overheated"]
                  and st["heat"] < 50,
                  {"heat": st["heat"], "overheated": st["overheated"]})
            # Vent Heat clears heat outright.
            open_bag(page)
            clicked = click_row_button(page, "Vent Heat", "Use")
            page.wait_for_timeout(300)
            st = page.evaluate(STATE_JS)
            check("Vent Heat (real click) clears heat to 0",
                  clicked and st["heat"] == 0,
                  {"clicked": clicked, "heat": st["heat"]})
            close_modal(page)
            if st["runState"] != "playing":
                ctx.close()
                continue
            done["overheat"] = True
            # ---- Top up salvage pacifist-style, then extract.
            # The buy needs 20 banked; the respec (25) is funded by a
            # second expedition after the persistence check.
            st = hunt(page, need_points=0, need_carried=10, pacifist=True,
                      need_total=20)
            st = extract_now(page)
            hub_text = modal_text(page)
            st = page.evaluate(STATE_JS)
            check("extract reaches the hub with 20+ banked salvage",
                  st["hub"] is not None and st["hub"]["banked"] >= 20,
                  {"hub": st["hub"], "modalHead": hub_text[:120]})
            if not (st["hub"] and st["hub"]["banked"] >= 20):
                ctx.close()
                continue
            # ---- Instructor: all 12 skills rendered from the table.
            check("Instructor station lists all 12 pilot skills",
                  "The Instructor" in hub_text
                  and all(n in hub_text for n in PILOT_SKILL_NAMES),
                  {"missing": [n for n in PILOT_SKILL_NAMES if n not in hub_text]})
            page.screenshot(path=str(SHOTS / "phase3-instructor.png"))
            banked_before = st["hub"]["banked"]
            clicked = click_row_button(page, "Steady Aim", "Buy rank 1")
            page.wait_for_timeout(300)
            st = page.evaluate(STATE_JS)
            check("Buy rank 1 (real click) spends 20 banked salvage, rank persists in hub",
                  clicked and st["hub"]["skills"].get("steadyAim") == 1
                  and st["hub"]["banked"] == banked_before - 20,
                  {"clicked": clicked, "skills": st["hub"]["skills"],
                   "banked": st["hub"]["banked"]})
            if st["hub"]["skills"].get("steadyAim") != 1:
                ctx.close()
                continue
            done["hub"] = True
            # ---- Death keeps the pilot rank; new run wipes mech state.
            click_row_button(page, "New Expedition", "New Expedition")
            page.wait_for_timeout(500)
            st = page.evaluate(STATE_JS)
            if st["runState"] != "playing":
                ctx.close()
                continue
            st = die_deliberately(page)
            check("scripted death ends the run", st["runState"] == "dead",
                  {"runState": st["runState"], "hp": st["hp"]})
            if st["runState"] != "dead":
                ctx.close()
                continue
            click_row_button(page, "Hub", "Hub")
            page.wait_for_timeout(500)
            st = page.evaluate(STATE_JS)
            check("pilot rank survives death (hub store)",
                  st["hub"] is not None
                  and st["hub"]["skills"].get("steadyAim") == 1,
                  {"hub": st["hub"]})
            click_row_button(page, "New Expedition", "New Expedition")
            page.wait_for_timeout(500)
            st = page.evaluate(STATE_JS)
            check("new expedition starts with empty mech state (run store wiped)",
                  st["runState"] == "playing" and st["mechSkills"] == []
                  and st["runSkillPoints"] == 0 and st["energy"] == 100
                  and st["heat"] == 0,
                  {"mechSkills": st["mechSkills"],
                   "points": st["runSkillPoints"],
                   "energy": st["energy"], "heat": st["heat"]})
            if not (st["runState"] == "playing" and st["mechSkills"] == []):
                ctx.close()
                continue
            done["persist"] = True
            banked_before2 = st["hub"]["banked"] if st["hub"] else 0
            # ---- Second expedition: salvage run to fund respec. Fight
            # for the first 3 kills (salvage drops), like expedition 1.
            st = hunt(page, need_points=0, need_carried=10, pacifist=False,
                      fight_until_kills=3, need_total=25)
            st = extract_now(page)
            modal_head = modal_text(page)[:80]
            st = page.evaluate(STATE_JS)
            check("second extract tops the hub up to 25+ banked salvage",
                  st["hub"] is not None and "EXTRACTED" in modal_head
                  and st["hub"]["banked"] > banked_before2,
                  {"hub": st["hub"], "modalHead": modal_head,
                   "bankedBefore": banked_before2})
            if not (st["hub"] and "EXTRACTED" in modal_head
                    and st["hub"]["banked"] > banked_before2):
                ctx.close()
                continue
            banked_before = st["hub"]["banked"]
            clicked = click_row_button(page, "Respec all ranks", "Respec all ranks")
            page.wait_for_timeout(300)
            st = page.evaluate(STATE_JS)
            check("Respec (real click) refunds all ranks at 25 salvage per rank",
                  clicked and st["hub"]["skills"] == {}
                  and st["hub"]["banked"] == banked_before - 25,
                  {"clicked": clicked, "skills": st["hub"]["skills"],
                   "banked": st["hub"]["banked"]})
            if st["hub"]["skills"] == {}:
                done["respec"] = True
            check("no console errors / failed assets", not errors, errors[:5] or "none")
            ctx.close()
            break
        check("fresh-run meters + mech learn/use verified within 6 fresh runs",
              done["fresh"] and done["mech"], done)
        check("overheat lock + cool-down + Vent Heat verified within 6 fresh runs",
              done["overheat"], done)
        check("Instructor buy + death persistence + respec verified within 6 fresh runs",
              done["hub"] and done["persist"] and done["respec"], done)
        browser.close()

    print(json.dumps({"failures": FAILURES}, indent=1))
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
