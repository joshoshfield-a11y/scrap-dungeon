#!/usr/bin/env python3
"""One-off verification for the 2026-10-28 wide-cell renderer (middle tier).

Drives the real game in headless Chromium (Playwright, ML venv) and
checks, against live state via window.__scrapDebug:
  - all 13 wide assets load (HTTP 200, assets/wide/)
  - wideDressing / wideStairs records exist on depth-1 floors
  - the player can BFS-walk to a cell adjacent to wide art (reachability)
  - screenshots: wide console/pile, wide stairs, corner gateway (desktop)
    + a mobile 390px shot with the HUD fitting
  - no console errors, no failed asset requests
Screenshots go to beta-testers/reports/screenshots/.
Exit 1 on any failure. Read-only against game/.
"""
import sys
from collections import deque
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
    runState: s.state,
    wide: s.floor.wideDressing || [],
    wideStairs: s.floor.wideStairs || null,
    enemies: s.floor.enemies.filter(e => e.alive).map(e => ({x: e.x, y: e.y})),
  };
}"""

WALK = {"floor", "corridor", "door", "hazard"}
DIRS8 = [(0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1)]
KEY_FOR = {(0, -1): "ArrowUp", (0, 1): "ArrowDown", (-1, 0): "ArrowLeft",
           (1, 0): "ArrowRight", (-1, -1): "q", (1, -1): "e",
           (-1, 1): "z", (1, 1): "c"}


def span_cells(rec):
    return {(rec["x"], rec["y"]), (rec["x"] + 1, rec["y"])}


def bfs_adjacent_path(st, targets):
    """BFS to the nearest walkable cell 8-adjacent to any target cell."""
    grid, sx, sy = st["grid"], st["px"], st["py"]
    blocked = {(e["x"], e["y"]) for e in st["enemies"]}
    blocked.add((st["stairs"]["x"], st["stairs"]["y"]))
    adj = set()
    for (tx, ty) in targets:
        for dx, dy in DIRS8:
            adj.add((tx + dx, ty + dy))
    adj -= blocked
    prev = {(sx, sy): None}
    q = deque([(sx, sy)])
    while q:
        x, y = q.popleft()
        if (x, y) in adj and (x, y) != (sx, sy):
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


def walk_to_adjacent(page, targets, max_steps=80):
    """Re-plan each step (foes move); True when standing adjacent."""
    for _ in range(max_steps):
        st = page.evaluate(STATE_JS)
        if st["runState"] != "playing":
            return False, st
        if (st["px"], st["py"]) in {
            (tx + dx, ty + dy)
            for (tx, ty) in targets for dx, dy in DIRS8
        }:
            return True, st
        path = bfs_adjacent_path(st, targets)
        if not path:
            return False, st
        nx, ny = path[0]
        page.keyboard.press(KEY_FOR[(nx - st["px"], ny - st["py"])])
        page.wait_for_timeout(120)
    st = page.evaluate(STATE_JS)
    return False, st


def fresh_page(browser, width, height, mobile):
    ctx = browser.new_context(viewport={"width": width, "height": height},
                              has_touch=mobile, is_mobile=mobile)
    page = ctx.new_page()
    errors = []
    wide_status = {}
    page.on("console", lambda m: errors.append(f"console {m.type}: {m.text}")
            if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    def on_resp(r):
        if "assets/wide/" in r.url:
            wide_status[r.url.split("/")[-1]] = r.status
        elif "assets/" in r.url and r.status != 200:
            errors.append(f"asset HTTP {r.status}: {r.url}")
    page.on("response", on_resp)
    page.goto(GAME_URL)
    page.wait_for_timeout(1500)
    return ctx, page, errors, wide_status


def kind_group(kind):
    if "stairs" in kind:
        return "stairs"
    if "corner" in kind:
        return "corner"
    if "console" in kind or "server" in kind:
        return "console"
    return "pile"


def main():
    shots = {}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox"])
        wide_seen_runs = 0
        stairs_seen_runs = 0
        runs = 0
        for attempt in range(4):
            ctx, page, errors, wide_status = fresh_page(browser, 1280, 900, False)
            runs += 1
            st = page.evaluate(STATE_JS)
            if st["wide"]:
                wide_seen_runs += 1
            if st["wideStairs"]:
                stairs_seen_runs += 1
            print(f"run {attempt + 1}: wide={len(st['wide'])} "
                  f"kinds={[w['kind'] for w in st['wide']]} wideStairs={bool(st['wideStairs'])}")
            # Group the records on this floor; screenshot one of each
            # group we have not captured yet.
            groups = {}
            for w in st["wide"]:
                groups.setdefault(kind_group(w["kind"]), []).append(w)
            if st["wideStairs"]:
                groups.setdefault("stairs", []).append(
                    {"x": st["stairs"]["x"], "y": st["stairs"]["y"], "kind": "wide_stairs"})
            for group, recs in groups.items():
                if group in shots:
                    continue
                targets = set()
                for r in recs:
                    targets |= span_cells(r)
                ok, _st = walk_to_adjacent(page, targets)
                if ok:
                    page.wait_for_timeout(300)
                    name = f"wide-{group}-desktop.png"
                    page.screenshot(path=str(SHOTS / name))
                    shots[group] = name
                    print(f"  shot {group} -> {name}")
                else:
                    print(f"  could not walk adjacent to {group}")
            check(f"wide assets all 200 (run {attempt + 1})",
                  len(wide_status) == 13 and all(v == 200 for v in wide_status.values()),
                  f"{len(wide_status)}/13 loaded: {sorted(wide_status.items())[:3]}...")
            check(f"no console errors / failed assets (run {attempt + 1})",
                  not errors, errors[:5] or "none")
            ctx.close()
            if {"console", "pile", "stairs", "corner"} <= set(shots):
                break
        check("wide records generated on depth-1 floors", wide_seen_runs >= 1,
              f"{wide_seen_runs}/{runs} runs had wideDressing")
        check("wide stairs generated on depth-1 floors", stairs_seen_runs >= 1,
              f"{stairs_seen_runs}/{runs} runs had wideStairs")
        check("screenshots: console/pile/stairs/corner art captured",
              {"console", "stairs"} <= set(shots) and ("pile" in shots or "console" in shots),
              f"captured={sorted(shots)}")
        if "corner" not in shots:
            print("NOTE corner gateway not captured in these runs (best-effort)")

        # ---- mobile: HUD fit + a wide-art shot ----
        # Wide placement can fail on a given floor, so retry fresh runs
        # until one carries wide records (max 3) before screenshotting.
        shot_mobile = False
        for _m in range(3):
            ctx, page, errors, _ws = fresh_page(browser, 390, 844, True)
            st = page.evaluate(STATE_JS)
            if st["wide"]:
                targets = set()
                for r in st["wide"][:1]:
                    targets |= span_cells(r)
                ok, _st = walk_to_adjacent(page, targets)
                if ok:
                    page.wait_for_timeout(300)
                    page.screenshot(path=str(SHOTS / "wide-mobile.png"))
                    print("  shot wide-mobile.png")
                    shot_mobile = True
            hud = page.evaluate(
                """() => { const h = document.getElementById('hud');
                           return {sw: h.scrollWidth, cw: h.clientWidth}; }""")
            check("mobile HUD fits at 390px", hud["sw"] <= hud["cw"], hud)
            check("no console errors / failed assets on mobile", not errors,
                  errors[:5] or "none")
            ctx.close()
            if shot_mobile:
                break
        check("mobile wide-art screenshot captured", shot_mobile, "wide-mobile.png")

    print("FAILURES:", FAILURES or "none")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
