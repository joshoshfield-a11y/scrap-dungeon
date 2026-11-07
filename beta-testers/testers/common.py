"""Shared helpers for the SCRAP DUNGEON beta-tester personas.

These testers READ the game only. They never write under game/ --
no core.js / game.js / index.html / test.js / assets changes.
They drive the real game in a headless Chromium (Playwright) and
read live state through the game's own window.__scrapDebug hook,
which the game ships for exactly this purpose.
"""
import hashlib
import json
import math
import os
import re
from pathlib import Path

GAME_DIR = Path.home() / "workspace" / "scrap-dungeon" / "game"
GAME_URL = GAME_DIR.joinpath("index.html").as_uri()
ASSETS_DIR = GAME_DIR / "assets"
WALKABLE = {"floor", "corridor", "door", "stairs", "hazard"}

# direction -> keyboard key the game listens for (see game.js KEY_DIRS)
KEY_FOR = {
    (0, -1): "ArrowUp", (0, 1): "ArrowDown",
    (-1, 0): "ArrowLeft", (1, 0): "ArrowRight",
    (-1, -1): "q", (1, -1): "e", (-1, 1): "z", (1, 1): "c",
}
DIRS8 = list(KEY_FOR.keys())


class Check:
    """One human-triageable finding, the way a beta tester writes it."""

    def __init__(self, persona, name, status, severity, evidence):
        # status: PASS / FAIL / NOTE / ENV (could not verify: environment)
        # severity: Blocker / Major / Minor / Note
        self.persona = persona
        self.name = name
        self.status = status
        self.severity = severity
        self.evidence = evidence

    def as_dict(self):
        return {"persona": self.persona, "check": self.name,
                "status": self.status, "severity": self.severity,
                "evidence": self.evidence}


class Recorder:
    def __init__(self, persona):
        self.persona = persona
        self.checks = []
        self.actions = []
        self.console_errors = []
        # Grounded measurements for the opinions layer (testers/opinions.py).
        # Every opinion must cite one of these, a check's evidence, or a
        # screenshot measurement — never an invented observation.
        self.metrics = {}

    def observe(self, key, value):
        self.metrics[key] = value

    def log(self, text):
        self.actions.append(text)

    def check(self, name, ok, severity, evidence):
        self.checks.append(Check(self.persona, name,
                                 "PASS" if ok else "FAIL", severity, evidence))

    def note(self, name, severity, evidence):
        self.checks.append(Check(self.persona, name, "NOTE", severity, evidence))

    def env(self, name, evidence):
        self.checks.append(Check(self.persona, name, "ENV", "Note", evidence))


def game_snapshot(game_dir=GAME_DIR):
    """Hashes of the game files, so a mid-flight Phase 2 edit is visible."""
    out = {}
    for name in ("core.js", "game.js", "index.html", "test.js", "style.css"):
        p = game_dir / name
        if p.exists():
            out[name] = hashlib.sha256(p.read_bytes()).hexdigest()[:12]
    return out


def get_state(page):
    """Simplified live state via window.__scrapDebug (no game edits)."""
    return page.evaluate("""() => {
      const s = window.__scrapDebug.getState();
      return {
        hp: s.player.hp, maxHp: s.player.maxHp,
        x: s.player.x, y: s.player.y, facing: s.player.facing,
        depth: s.depth, clock: s.clock, actions: s.actions || 0,
        carried: s.carried, banked: s.banked, kills: s.kills,
        healthCells: s.healthCells || 0, foodCells: s.foodCells || 0,
        repairKits: s.repairKits || 0,
        components: s.components || 0, dataChips: s.dataChips || 0,
        codex: (s.codex || []).slice(),
        hubBanked: s.hub ? s.hub.banked : null,
        hubWreck: s.hub ? s.hub.wreck : null,
        powerState: s.powerState, runState: s.state,
        quickslots: s.quickslots || [],
        enemies: s.floor.enemies.filter(e => e.alive).map(e => (
          {id: e.id, type: e.type, name: e.name, x: e.x, y: e.y,
           hp: e.hp, maxHp: e.maxHp, awake: !!e.awake})),
        pickups: s.floor.pickups.map(p => ({kind: p.kind, x: p.x, y: p.y})),
        grid: s.floor.grid,
        logTail: s.log.slice(-5),
      };
    }""")


def bfs_path(grid, start, goal, blocked):
    """8-direction BFS over walkable tiles. blocked = set of (x,y) to avoid
    (enemies), except the goal itself. Returns list of (dx,dy) steps."""
    h, w = len(grid), len(grid[0]) if grid else 0
    gx, gy = goal
    if not (0 <= gx < w and 0 <= gy < h):
        return None
    from collections import deque
    seen = {start: None}
    q = deque([start])
    while q:
        x, y = q.popleft()
        if (x, y) == goal:
            path = []
            while seen[(x, y)] is not None:
                px, py = seen[(x, y)]
                path.append((x - px, y - py))
                x, y = px, py
            return list(reversed(path))
        for dx, dy in DIRS8:
            nx, ny = x + dx, y + dy
            if (nx, ny) in seen or not (0 <= nx < w and 0 <= ny < h):
                continue
            if grid[ny][nx] not in WALKABLE:
                continue
            if (nx, ny) in blocked and (nx, ny) != goal:
                continue
            seen[(nx, ny)] = (x, y)
            q.append((nx, ny))
    return None


def grid_counts(grid):
    """Count tile kinds in a floor grid — dressing/space measurements
    for the opinions layer (e.g. how much of a floor is wall vs floor)."""
    counts = {}
    for row in grid or []:
        for tile in row:
            counts[tile] = counts.get(tile, 0) + 1
    return counts


def find_stairs(state):
    for y, row in enumerate(state["grid"]):
        for x, t in enumerate(row):
            if t == "stairs":
                return (x, y)
    return None


def step(page, dx, dy, wait_ms=130):
    """One human-speed move/attack via keyboard. Returns state after."""
    page.keyboard.press(KEY_FOR[(dx, dy)])
    page.wait_for_timeout(wait_ms)
    return get_state(page)


def walk_path(page, path, rec, stop_on_adjacent_enemy=True):
    """Follow BFS steps. Stops early on death, stairs, or adjacency."""
    for dx, dy in path:
        st = step(page, dx, dy)
        rec.log(f"step ({dx},{dy}) -> ({st['x']},{st['y']}) hp={st['hp']} state={st['runState']}")
        if st["runState"] != "playing":
            return st
        if stop_on_adjacent_enemy:
            px, py = st["x"], st["y"]
            for e in st["enemies"]:
                if max(abs(e["x"] - px), abs(e["y"] - py)) == 1:
                    rec.log(f"stopped: enemy adjacent {e['name']} at ({e['x']},{e['y']})")
                    return st
    return get_state(page)


def attack_adjacent_until_dead(page, rec, max_hits=40):
    """Bump-attack the nearest adjacent enemy until it dies or we die."""
    for _ in range(max_hits):
        st = get_state(page)
        if st["runState"] != "playing":
            return st
        px, py = st["x"], st["y"]
        adj = [e for e in st["enemies"]
               if max(abs(e["x"] - px), abs(e["y"] - py)) == 1]
        if not adj:
            return st
        e = adj[0]
        st = step(page, (e["x"] - px) and (1 if e["x"] > px else -1),
                  (e["y"] - py) and (1 if e["y"] > py else -1))
        rec.log(f"attack {e['name']} -> hp={st['hp']} state={st['runState']}")
        if st["runState"] != "playing":
            return st
    return get_state(page)


def click_button(page, selector, timeout=3000):
    page.locator(selector).first.click(timeout=timeout)
    page.wait_for_timeout(200)


def modal_visible(page):
    return page.evaluate(
        "() => !document.getElementById('modal').classList.contains('hidden')")


def modal_text(page):
    return page.evaluate(
        "() => document.getElementById('modal-title').textContent + ' | ' + "
        "document.getElementById('modal-body').textContent")


def sane_numbers(state):
    """Human sanity: no NaN, no negative HP/salvage, HP bounded."""
    vals = [state["hp"], state["carried"], state["banked"], state["kills"],
            state["healthCells"], state["foodCells"], state["clock"],
            state.get("components", 0), state.get("dataChips", 0)]
    if any(v is None or (isinstance(v, float) and math.isnan(v)) for v in vals):
        return False, f"NaN/None in {vals}"
    if state["hp"] < 0 or state["carried"] < 0 or state["banked"] < 0 \
            or state.get("components", 0) < 0 or state.get("dataChips", 0) < 0:
        return False, (f"negative value hp={state['hp']} carried={state['carried']} "
                       f"banked={state['banked']} components={state.get('components')} "
                       f"dataChips={state.get('dataChips')}")
    if state["hp"] > state["maxHp"]:
        return False, f"hp {state['hp']} above max {state['maxHp']}"
    return True, f"hp={state['hp']} carried={state['carried']} banked={state['banked']}"
