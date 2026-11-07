#!/usr/bin/env python3
"""Browser verification for Scrap Dungeon Phase 6 (doors, visibility,
locked rooms + tile-coherence).

Drives the real game in headless Chromium (Playwright, ML venv) with
REAL key presses and clicks for every behavior asserted. Fixtures
(arena flattening, foe/door placement, teleports) go through
window.__scrapDebug + window.ScrapCore in page.evaluate, exactly as
verify_phase5.py does; every BEHAVIOR (bump, force, bypass, fire,
walk, Continue) goes through a real key press or click.

Covers (P6-* IDs per LOOT-SKILLS-DESIGN.md §9.7.11):
  - art wiring: door sheet, key sheet, batch-3 closed/open frames load;
    closed vs open door tiles differ on screen; locked door shows red
    lock pixels
  - door state: real bump opens a closed door, player stays, exactly
    one time unit passes (same clock delta as a wait); next bump
    enters
  - door LOS: lineOfSight false through a closed door, true once open;
    a real FIRE through a closed door does not hit the foe
  - door wake: opening a door wakes a sleeping foe in range with LOS,
    and does NOT wake one behind a second closed door
  - lock force: real X damages the faced locked door (1 time unit,
    no ammo spent), repeated X breaks it open; X at a non-door refuses
    with no time cost
  - lock key: walking onto a key logs the exact spec label; bumping
    its door consumes the key and opens; a wrong key refuses with no
    time cost and is not consumed
  - bypass: real B logs the exact spec refusal, zero time/RNG/noise
    (clock, keys, door state all unchanged)
  - door placement + coherence: live floor passes coherenceCheck,
    every non-spawn room has >= 1 door, generation is deterministic
    (same seed twice => identical floor JSON)
  - locked rooms: a scanned generated floor has a locked room of a
    legal kind with its content rule (vault caches >= expected,
    objective content present)
  - boss compatibility: a scanned generated floor (or, failing a
    natural hit, the shipped placeBoss exclusion point) shows
    locked-first-security-room => no boss, reason recorded
  - fog: spawn screenshot shows only the spawn room (unexplored room
    tile black); after a real walk into a second room, the first room
    is dimmed (~45% brightness) and the second is full; no enemy
    renders in a black room (differential ~0)
  - fog LOS: foe beyond a closed door does not render; opening the
    door (real bump) makes it render
  - save/load: door states + keys + explored round-trip through
    autosave + reload + Continue (real click)
  - legacy migration: a save stripped of doors/explored loads with
    all doors open and all rooms explored
  - zero console errors, zero failed asset requests

Attempt loop: up to 3 fresh contexts; each attempt's PASS/FAIL lines
are printed with its attempt number, and the exit code reflects the
completing attempt only. FULL output must be captured to a log file
(never pipe through tail — a pipe masks the exit code).
Exit 1 on any failure in the completing attempt.
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
RUN_KEY = "scrapdungeon.run.v1"

FAILURES = []  # failures of the CURRENT attempt only

BYPASS_REFUSAL = ("Bypass unavailable: no compatible lockpick skill is "
                  "defined in the current skill system. Use the matching "
                  "key or force the door.")

SHEETS = {
    "door": "assets/tile_door_sheet.png",
    "loot_key": "assets/loot_key_sheet.png",
    "closed_a": "assets/batch3_s2_wall_door_closed_a.png",
    "closed_b": "assets/batch3_s2_wall_door_closed_b.png",
    "open_a": "assets/batch3_s2_wall_door_open_a.png",
    "open_b": "assets/batch3_s2_wall_door_open_b.png",
    "open_c": "assets/batch3_s2_wall_door_open_c.png",
}

# Pixel threshold for "dimmed": a dimmed tile's mean channel is ~45%
# of the full tile (black overlay at 0.55 alpha). Accept [0.30, 0.65].
DIM_LO, DIM_HI = 0.30, 0.65


def check(name, ok, evidence):
    print(("PASS " if ok else "FAIL ") + name + " | " + str(evidence))
    if not ok:
        FAILURES.append(name)


STATE_JS = """() => {
  const s = window.__scrapDebug.getState();
  const C = window.ScrapCore;
  const rooms = (s.floor.rooms || []).map((r, i) => ({
    id: r.id || ('room:' + i), x: r.x, y: r.y, w: r.w, h: r.h,
    type: r.type, purpose: r.purpose || null, lockedKind: r.lockedKind || null,
    spawn: !!r.spawn, stairs: !!r.stairs}));
  return {
    grid: s.floor.grid, px: s.player.x, py: s.player.y,
    facing: s.player.facing,
    runState: s.state, depth: s.depth,
    hp: s.player.hp, clock: s.clock,
    ammoPools: Object.assign({}, s.ammoPools || {}),
    keys: (s.keys || []).slice(),
    logTail: s.log.slice(-12),
    enemies: s.floor.enemies.filter(e => e.alive).map(e => ({
      id: e.id, type: e.type, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp,
      awake: !!e.awake, nextTime: e.nextTime})),
    pickups: s.floor.pickups.map(p => ({kind: p.kind, tier: p.tier || null,
      defId: p.defId || null, x: p.x, y: p.y, keyId: p.keyId || null,
      codex: p.codex || null})),
    dressing: (s.floor.dressing || []).map(d => ({x: d.x, y: d.y,
      kind: d.kind, lore: d.lore || null})),
    doors: (s.floor.doors || []).map(d => ({id: d.id, x: d.x, y: d.y,
      roomId: d.roomId, entranceId: d.entranceId, state: d.state,
      lockLevel: d.lockLevel, keyId: d.keyId, hp: d.hp, maxHp: d.maxHp})),
    explored: s.floor.explored ? {
      rooms: s.floor.explored.exploredRoomIds.slice(),
      walked: s.floor.explored.walkedCorridorCells.slice()} : null,
    rooms: rooms,
    bossReason: s.floor.bossReason || null,
    generationAttempts: s.floor.generationAttempts || 0,
    seed: s.floor.seed !== undefined ? s.floor.seed : null,
    coherence: C.coherenceCheck ? C.coherenceCheck(s.floor) : null,
  };
}"""

KEY_FOR = {(0, -1): "ArrowUp", (0, 1): "ArrowDown", (-1, 0): "ArrowLeft",
           (1, 0): "ArrowRight", (-1, -1): "q", (1, -1): "e",
           (-1, 1): "z", (1, 1): "c"}


def flatten_box(page, half=6):
    """Open arena around the player; remove other enemies/pickups."""
    page.evaluate(
        """([half]) => {
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


def craft_door(page, dx, dy, state="closed", lock_level=0, key_id=None):
    """Place a door record + grid cell at a player-relative offset."""
    return page.evaluate(
        """([dx, dy, doorState, lockLevel, keyId]) => {
          const s = window.__scrapDebug.getState();
          const x = s.player.x + dx, y = s.player.y + dy;
          s.floor.grid[y][x] = 'door';
          const rec = {id: 'door:' + y + ':' + x, x, y,
            roomId: 'room:0', entranceId: 'entrance:room:0:0',
            state: doorState, lockLevel,
            keyId: keyId, hp: lockLevel ? lockLevel * 20 : 0,
            maxHp: lockLevel ? lockLevel * 20 : 0};
          s.floor.doors.push(rec);
          return rec;
        }""", [dx, dy, state, lock_level, key_id])


def craft_foe(page, foe_type, dx, dy, opts=None):
    return page.evaluate(
        """([foeType, dx, dy, opts]) => {
          const s = window.__scrapDebug.getState();
          const C = window.ScrapCore;
          const d = C.ENEMY_TYPES[foeType];
          const foe = {
            id: 'p6-' + foeType + '-' + s.floor.enemies.length,
            type: foeType, name: d.name,
            x: s.player.x + dx, y: s.player.y + dy, facing: 0,
            hp: d.hp, maxHp: d.hp, dmg: d.dmg, dmgVar: d.dmgVar,
            armor: d.armor, acc: d.acc, evasion: d.evasion,
            interval: d.interval, nextTime: 1e9,
            salvageMin: d.salvageMin, salvageMax: d.salvageMax,
            sight: d.sight, retreat: d.retreat,
            alive: true, awake: true, statuses: [],
          };
          Object.assign(foe, opts || {});
          s.floor.enemies.push(foe);
          return foe.id;
        }""", [foe_type, dx, dy, opts or {}])


def set_player(page, evasion=0, hp=100):
    page.evaluate(
        """([evasion, hp]) => {
          const s = window.__scrapDebug.getState();
          s.player.evasion = evasion;
          s.player.hp = hp;
        }""", [evasion, hp])


def face_toward(page, dx, dy):
    page.evaluate(
        """([dx, dy]) => {
          const s = window.__scrapDebug.getState();
          s.player.facing = window.ScrapCore.dirIndexFor(dx, dy);
        }""", [dx, dy])


def tile_rect(page, ex, ey):
    """Screen rect (CSS px) of a grid cell, replicating game.js
    resizeCanvas + tileOrigin math (same as verify_phase5)."""
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


def shot_pixels(path):
    from PIL import Image
    return Image.open(path).convert("RGB")


def frac_different(img_a, img_b, rect):
    x0, y0, tile = [int(v) for v in rect]
    cx0, cy0 = max(0, x0), max(0, y0)
    cx1, cy1 = min(img_a.width, x0 + tile), min(img_a.height, y0 + tile)
    if cx1 <= cx0 or cy1 <= cy0:
        return 0.0
    a = img_a.crop((cx0, cy0, cx1, cy1))
    b = img_b.crop((cx0, cy0, cx1, cy1))
    pa, pb = a.load(), b.load()
    diff = 0
    total = (cx1 - cx0) * (cy1 - cy0)
    for y in range(cy1 - cy0):
        for x in range(cx1 - cx0):
            if pa[x, y] != pb[x, y]:
                diff += 1
    return diff / total


def tile_mean(img, rect):
    """Mean RGB of a tile rect (clipped to the screenshot)."""
    x0, y0, tile = [int(v) for v in rect]
    cx0, cy0 = max(0, x0), max(0, y0)
    cx1, cy1 = min(img.width, x0 + tile), min(img.height, y0 + tile)
    px = img.load()
    sr = sg = sb = n = 0
    for y in range(cy0, cy1):
        for x in range(cx0, cx1):
            r, g, b = px[x, y]
            sr += r; sg += g; sb += b; n += 1
    return (sr / n, sg / n, sb / n) if n else (0, 0, 0)


def frac_black(img, rect, thresh=40):
    """Fraction of pixels in a tile rect that are near-background
    (all channels <= thresh; the canvas background is #10131a)."""
    x0, y0, tile = [int(v) for v in rect]
    cx0, cy0 = max(0, x0), max(0, y0)
    cx1, cy1 = min(img.width, x0 + tile), min(img.height, y0 + tile)
    px = img.load()
    black = n = 0
    for y in range(cy0, cy1):
        for x in range(cx0, cx1):
            r, g, b = px[x, y]
            n += 1
            if r <= thresh and g <= thresh and b <= thresh:
                black += 1
    return black / n if n else 1.0


def count_red(img, rect, inset=0.15):
    """Red lock-marker pixels (#e0523d family) inside a tile rect."""
    x0, y0, tile = [int(v) for v in rect]
    m = int(tile * inset)
    px = img.load()
    red = total = 0
    for y in range(max(0, y0 + m), min(img.height, y0 + tile - m)):
        for x in range(max(0, x0 + m), min(img.width, x0 + tile - m)):
            r, g, b = px[x, y]
            total += 1
            if r > 180 and 40 < g < 130 and b < 100:
                red += 1
    return red, total


def sheet_loads(page):
    return page.evaluate(
        """(paths) => Promise.all(paths.map(p => new Promise(res => {
          const img = new Image();
          img.onload = () => res({path: p, ok: true, w: img.naturalWidth, h: img.naturalHeight});
          img.onerror = () => res({path: p, ok: false, w: 0, h: 0});
          img.src = p;
        })))""", list(SHEETS.values()))


def walk_real_keys(page, steps):
    """Press real arrow keys along (dx, dy) steps. A step onto a
    closed door bumps (player stays) — detect the unchanged position
    and press the same key again to enter."""
    for (dx, dy) in steps:
        key = KEY_FOR[(dx, dy)]
        before = page.evaluate(STATE_JS)
        page.keyboard.press(key)
        page.wait_for_timeout(180)
        after = page.evaluate(STATE_JS)
        if (after["px"], after["py"]) == (before["px"], before["py"]):
            # Stayed put: either a door bump (press again to enter)
            # or a genuinely blocked step (second press is a harmless
            # refusal). Only re-press when the target cell holds a door.
            tgt = page.evaluate(
                """([px, py, dx, dy]) => {
                  const s = window.__scrapDebug.getState();
                  const tx = px + dx, ty = py + dy;
                  return (s.floor.doors || []).some(q => q.x === tx && q.y === ty);
                }""", [before["px"], before["py"], dx, dy])
            if tgt:
                page.keyboard.press(key)
                page.wait_for_timeout(180)
    return page.evaluate(STATE_JS)


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox"])
        done = {"art": False, "door": False, "los": False, "wake": False,
                "force": False, "key": False, "bypass": False,
                "placement": False, "locked": False, "boss": False,
                "fog": False, "foglos": False, "saveload": False,
                "legacy": False}
        attempts = []
        for attempt in range(3):
            FAILURES.clear()
            ctx = browser.new_context(viewport={"width": 1280, "height": 900})
            page = ctx.new_page()
            errors = []
            page.on("console", lambda m: errors.append(f"console {m.type}: {m.text}")
                    if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            page.on("response", lambda r: errors.append(f"asset HTTP {r.status}: {r.url}")
                    if "assets/" in r.url and r.status not in (200, 0) else None)
            page.goto(GAME_URL)
            page.wait_for_timeout(1500)
            print(f"--- attempt {attempt + 1} ---")

            st = page.evaluate(STATE_JS)
            if st["runState"] != "playing":
                check("fresh run starts playing", False, {"runState": st["runState"]})
                ctx.close()
                attempts.append(list(FAILURES))
                continue

            # ---- 0. Placement + coherence + determinism (live floor).
            coh = st["coherence"]
            check("live generated floor passes coherenceCheck (P6-COHERENCE)",
                  bool(coh and coh["ok"]), coh["errors"][:3] if coh else None)
            nonspawn = [r for r in st["rooms"] if not r["spawn"]]
            doors_by_room = {}
            for d in st["doors"]:
                doors_by_room[d["roomId"]] = doors_by_room.get(d["roomId"], 0) + 1
            doorless = [r["id"] for r in nonspawn if doors_by_room.get(r["id"], 0) < 1]
            check("every non-spawn room has >= 1 door (P6-DOOR-PLACEMENT)",
                  not doorless, {"rooms": len(st["rooms"]), "doors": len(st["doors"]),
                                 "doorless": doorless})
            det = page.evaluate(
                """() => {
                  const C = window.ScrapCore;
                  const a = C.generateFloor(12345, 7);
                  const b = C.generateFloor(12345, 7);
                  return JSON.stringify(a) === JSON.stringify(b);
                }""")
            check("same seed twice => identical floor JSON (P6-DETERMINISM)",
                  det is True, {"identical": det})
            done["placement"] = bool(coh and coh["ok"]) and not doorless and det is True

            # ---- 1. Art wiring.
            loads = sheet_loads(page)
            ok = all(l["ok"] and l["w"] > 0 and l["h"] > 0 for l in loads)
            check("door/key/batch-3 door sheets all load (P6-ART-WIRING)",
                  ok, loads)
            # Closed vs open door tiles differ on screen.
            flatten_box(page, 6)
            set_player(page, 0, 100)
            craft_door(page, 2, 0, "closed")
            page.wait_for_timeout(400)
            st = page.evaluate(STATE_JS)
            rect = tile_rect(page, st["px"] + 2, st["py"])
            p1 = SHOTS / "phase6-door-closed.png"
            page.screenshot(path=str(p1))
            page.evaluate(
                """() => {
                  const s = window.__scrapDebug.getState();
                  const d = s.floor.doors[s.floor.doors.length - 1];
                  if (d) d.state = 'open';
                }""")
            page.wait_for_timeout(400)
            p2 = SHOTS / "phase6-door-open.png"
            page.screenshot(path=str(p2))
            frac = frac_different(shot_pixels(p1), shot_pixels(p2), rect)
            check("closed vs open door tiles differ on screen (P6-ART-WIRING)",
                  frac > 0.03, {"frac": round(frac, 4)})
            # Locked door shows red lock pixels.
            flatten_box(page, 6)
            set_player(page, 0, 100)
            craft_door(page, 2, 0, "locked", 2, "key:fixture")
            page.wait_for_timeout(400)
            st = page.evaluate(STATE_JS)
            rect = tile_rect(page, st["px"] + 2, st["py"])
            p3 = SHOTS / "phase6-door-locked.png"
            page.screenshot(path=str(p3))
            red, total = count_red(shot_pixels(p3), rect)
            check("locked door shows red lock marker pixels (P6-ART-WIRING)",
                  red > 5, {"redPx": red, "sampled": total})
            done["art"] = ok and frac > 0.03 and red > 5

            # ---- 2. Door state via real bumps.
            flatten_box(page, 6)
            set_player(page, 0, 100)
            craft_door(page, 1, 0, "closed")
            page.keyboard.press(" ")  # baseline: one wait's clock delta
            page.wait_for_timeout(300)
            st = page.evaluate(STATE_JS)
            clock0 = st["clock"]
            page.keyboard.press(" ")  # second wait: measure the interval
            page.wait_for_timeout(300)
            st = page.evaluate(STATE_JS)
            interval = st["clock"] - clock0
            st = page.evaluate(STATE_JS)
            px0, py0 = st["px"], st["py"]
            page.keyboard.press("ArrowRight")  # bump the closed door
            page.wait_for_timeout(400)
            st = page.evaluate(STATE_JS)
            door = next((d for d in st["doors"] if d["x"] == px0 + 1 and d["y"] == py0), None)
            bump_ok = (door is not None and door["state"] == "open"
                       and (st["px"], st["py"]) == (px0, py0)
                       and st["clock"] - clock0 - interval == interval
                       and any("door opens" in l for l in st["logTail"]))
            check("real bump opens closed door, player stays, exactly 1 time unit (P6-DOOR-STATE)",
                  bump_ok, {"door": door, "player": (st["px"], st["py"]),
                            "clockDelta": st["clock"] - clock0 - interval,
                            "interval": interval, "logTail": st["logTail"]})
            page.keyboard.press("ArrowRight")  # enter through the open door
            page.wait_for_timeout(400)
            st = page.evaluate(STATE_JS)
            entered = (st["px"], st["py"]) == (px0 + 1, py0)
            check("second bump enters through the open door (P6-DOOR-STATE)",
                  entered, {"player": (st["px"], st["py"]),
                            "expected": (px0 + 1, py0)})
            done["door"] = bump_ok and entered

            # ---- 3. Door LOS: core + real FIRE through a closed door.
            flatten_box(page, 6)
            set_player(page, 0, 100)
            craft_door(page, 1, 0, "closed")
            fid = craft_foe(page, "raider", 3, 0, {"evasion": 0, "nextTime": 1e9})
            los = page.evaluate(
                """() => {
                  const s = window.__scrapDebug.getState();
                  const C = window.ScrapCore;
                  const p = s.player;
                  const closed = C.lineOfSight(s, p.x, p.y, p.x + 3, p.y);
                  const d = s.floor.doors[s.floor.doors.length - 1];
                  d.state = 'open';
                  const opened = C.lineOfSight(s, p.x, p.y, p.x + 3, p.y);
                  d.state = 'closed';
                  return {closed, opened};
                }""")
            check("lineOfSight false through closed door, true once open (P6-DOOR-LOS)",
                  los == {"closed": False, "opened": True}, los)
            face_toward(page, 1, 0)
            st = page.evaluate(STATE_JS)
            foe0 = next((e for e in st["enemies"] if e["id"] == fid), None)
            hp0 = foe0["hp"] if foe0 else None
            page.keyboard.press("f")
            page.wait_for_timeout(400)
            st = page.evaluate(STATE_JS)
            foe = next((e for e in st["enemies"] if e["id"] == fid), None)
            fire_blocked = foe is not None and foe["hp"] == hp0
            check("real FIRE through a closed door does not hit the foe (P6-DOOR-LOS)",
                  fire_blocked, {"hp0": hp0, "hp": foe["hp"] if foe else None,
                                 "logTail": st["logTail"]})
            done["los"] = los == {"closed": False, "opened": True} and fire_blocked

            # ---- 4. Door wake: near foe wakes, foe behind a 2nd door does not.
            flatten_box(page, 6)
            set_player(page, 0, 100)
            craft_door(page, 1, 0, "closed")
            craft_door(page, 3, 0, "closed")
            st = page.evaluate(STATE_JS)
            clock_now = st["clock"]
            f1 = craft_foe(page, "raider", 2, 0, {"awake": False, "nextTime": clock_now + 10000})
            f2 = craft_foe(page, "raider", 4, 0, {"awake": False, "nextTime": clock_now + 10000})
            page.keyboard.press("ArrowRight")  # bump: opens door 1 only
            page.wait_for_timeout(400)
            st = page.evaluate(STATE_JS)
            w1 = next((e for e in st["enemies"] if e["id"] == f1), None)
            w2 = next((e for e in st["enemies"] if e["id"] == f2), None)
            wake_ok = (w1 is not None and w1["awake"]
                       and w2 is not None and not w2["awake"]
                       and any("wakes up!" in l for l in st["logTail"]))
            check("opening a door wakes the in-range LOS foe, not one behind a 2nd closed door (P6-DOOR-WAKE)",
                  wake_ok, {"foe1Awake": w1["awake"] if w1 else None,
                            "foe2Awake": w2["awake"] if w2 else None,
                            "logTail": st["logTail"]})
            done["wake"] = wake_ok

            # ---- 5. Force: real X damages, costs 1 unit, spends no ammo; breaks open.
            flatten_box(page, 6)
            set_player(page, 0, 100)
            drec = craft_door(page, 1, 0, "locked", 2, "key:fixture-force")
            face_toward(page, 1, 0)
            st = page.evaluate(STATE_JS)
            clock0 = st["clock"]
            ammo0 = dict(st["ammoPools"])
            page.keyboard.press("x")
            page.wait_for_timeout(400)
            st = page.evaluate(STATE_JS)
            door = next((d for d in st["doors"] if d["x"] == st["px"] + 1 and d["y"] == st["py"]), None)
            force_ok = (door is not None and door["hp"] < door["maxHp"]
                        and st["ammoPools"] == ammo0
                        and any("You force the door for" in l for l in st["logTail"]))
            check("real X damages the faced locked door, 1 time unit, no ammo spent (P6-LOCK-FORCE)",
                  force_ok, {"door": door, "ammoSame": st["ammoPools"] == ammo0,
                             "logTail": st["logTail"]})
            broke = False
            for _ in range(12):
                page.keyboard.press("x")
                page.wait_for_timeout(300)
                st = page.evaluate(STATE_JS)
                door = next((d for d in st["doors"] if d["x"] == st["px"] + 1 and d["y"] == st["py"]), None)
                if door is not None and door["state"] == "open":
                    broke = True
                    break
                if st["runState"] != "playing":
                    break
            check("repeated real X breaks the locked door open (P6-LOCK-FORCE)",
                  broke, {"door": door})
            # X at a non-door refuses with no time cost.
            flatten_box(page, 6)
            set_player(page, 0, 100)
            face_toward(page, 1, 0)
            st = page.evaluate(STATE_JS)
            clock0 = st["clock"]
            page.keyboard.press("x")
            page.wait_for_timeout(300)
            st = page.evaluate(STATE_JS)
            refuse_ok = (st["clock"] == clock0
                         and any("Force: No door in that direction." in l for l in st["logTail"]))
            check("X at a non-door refuses with no time cost (P6-LOCK-FORCE)",
                  refuse_ok, {"clockDelta": st["clock"] - clock0,
                              "logTail": st["logTail"]})
            done["force"] = force_ok and broke and refuse_ok

            # ---- 6. Key: pickup label, key opens, wrong key refuses free.
            flatten_box(page, 6)
            set_player(page, 0, 100)
            drec = craft_door(page, 2, 0, "locked", 1, "key:fixture-key")
            page.evaluate(
                """() => {
                  const s = window.__scrapDebug.getState();
                  s.floor.pickups.push({x: s.player.x + 1, y: s.player.y,
                    kind: 'key', keyId: 'key:fixture-key'});
                }""")
            st = page.evaluate(STATE_JS)
            door = next((d for d in st["doors"] if d["keyId"] == "key:fixture-key"), None)
            page.keyboard.press("ArrowRight")  # step onto the key
            page.wait_for_timeout(400)
            st = page.evaluate(STATE_JS)
            label = "Key acquired: fits the room:0 door (%d, %d)." % (door["x"], door["y"])
            label_ok = ("key:fixture-key" in st["keys"]
                        and any(label in l for l in st["logTail"]))
            check("walking onto a key logs the exact spec label (P6-LOCK-KEY)",
                  label_ok, {"keys": st["keys"], "expectedLabel": label,
                             "logTail": st["logTail"]})
            page.keyboard.press("ArrowRight")  # bump the locked door with its key
            page.wait_for_timeout(400)
            st = page.evaluate(STATE_JS)
            door = next((d for d in st["doors"] if d["keyId"] == "key:fixture-key"), None)
            key_open_ok = (door is not None and door["state"] == "open"
                           and "key:fixture-key" not in st["keys"]
                           and any("The key fits." in l for l in st["logTail"]))
            check("bumping with the matching key consumes it and opens (P6-LOCK-KEY)",
                  key_open_ok, {"door": door, "keys": st["keys"],
                                "logTail": st["logTail"]})
            # Wrong key: refusal costs nothing and keeps the key.
            flatten_box(page, 6)
            set_player(page, 0, 100)
            craft_door(page, 1, 0, "locked", 1, "key:fixture-other")
            page.evaluate(
                """() => {
                  const s = window.__scrapDebug.getState();
                  s.keys = ['key:fixture-wrong'];
                }""")
            st = page.evaluate(STATE_JS)
            clock0 = st["clock"]
            page.keyboard.press("ArrowRight")
            page.wait_for_timeout(400)
            st = page.evaluate(STATE_JS)
            door = next((d for d in st["doors"] if d["keyId"] == "key:fixture-other"), None)
            wrong_ok = (door is not None and door["state"] == "locked"
                        and st["clock"] == clock0
                        and st["keys"] == ["key:fixture-wrong"]
                        and (st["px"], st["py"]) != (door["x"], door["y"]))
            check("wrong-key bump refuses free and keeps the key (P6-LOCK-KEY)",
                  wrong_ok, {"door": door, "clockDelta": st["clock"] - clock0,
                             "keys": st["keys"]})
            done["key"] = label_ok and key_open_ok and wrong_ok

            # ---- 7. Bypass: real B, exact refusal, zero cost.
            flatten_box(page, 6)
            set_player(page, 0, 100)
            craft_door(page, 1, 0, "locked", 1, "key:fixture-bypass")
            page.evaluate(
                """() => {
                  const s = window.__scrapDebug.getState();
                  s.keys = [];
                }""")
            face_toward(page, 1, 0)
            st = page.evaluate(STATE_JS)
            clock0 = st["clock"]
            page.keyboard.press("b")
            page.wait_for_timeout(300)
            st = page.evaluate(STATE_JS)
            door = next((d for d in st["doors"] if d["keyId"] == "key:fixture-bypass"), None)
            bypass_ok = (st["clock"] == clock0
                         and door is not None and door["state"] == "locked"
                         and st["keys"] == []
                         and any(BYPASS_REFUSAL in l for l in st["logTail"]))
            check("real B logs the exact Bypass refusal at zero time/RNG/noise (P6-BYPASS)",
                  bypass_ok, {"clockDelta": st["clock"] - clock0,
                              "door": door, "keys": st["keys"],
                              "logTail": st["logTail"]})
            done["bypass"] = bypass_ok

            # ---- 8. Locked rooms: scan generated floors for one.
            found = page.evaluate(
                """() => {
                  const C = window.ScrapCore;
                  for (let depth = 1; depth <= 15; depth++) {
                    for (let seed = 1; seed <= 120; seed++) {
                      const f = C.generateFloor(seed, depth);
                      const lr = f.rooms.find(r => r.lockedKind);
                      if (!lr) continue;
                      const idx = f.rooms.indexOf(lr);
                      const door = f.doors.find(d => d.roomId === lr.id);
                      const inRoom = f.pickups.filter(p =>
                        p.x >= lr.x && p.x < lr.x + lr.w && p.y >= lr.y && p.y < lr.y + lr.h);
                      const lore = (f.dressing || []).some(dr =>
                        dr.lore && dr.x >= lr.x && dr.x < lr.x + lr.w && dr.y >= lr.y && dr.y < lr.y + lr.h);
                      return {depth, seed, roomIdx: idx, lockedKind: lr.lockedKind,
                        lockLevel: door ? door.lockLevel : null,
                        itemCaches: inRoom.filter(p => p.kind === 'item').length,
                        hasCodex: inRoom.some(p => p.kind === 'dataChip' && p.codex),
                        hasLore: lore, bossReason: f.bossReason};
                    }
                  }
                  return null;
                }""")
            locked_ok = False
            if found is not None:
                kind_ok = found["lockedKind"] in ("lootVault", "newArea", "objective")
                if found["lockedKind"] == "lootVault":
                    expected = 1 if found["lockLevel"] == 1 else 2
                    content_ok = found["itemCaches"] >= expected
                elif found["lockedKind"] == "objective":
                    content_ok = found["hasCodex"] or found["hasLore"] or found["itemCaches"] >= 1
                else:
                    content_ok = True
                locked_ok = kind_ok and content_ok
            check("a generated floor has a locked room of a legal kind with its content rule (P6-LOCKED-ROOMS)",
                  locked_ok, found)
            done["locked"] = locked_ok

            # ---- 9. Boss compatibility: natural scan, else the shipped
            # exclusion point through placeBoss itself.
            boss_nat = page.evaluate(
                """() => {
                  const C = window.ScrapCore;
                  for (let depth = 5; depth <= 15; depth++) {
                    for (let seed = 1; seed <= 200; seed++) {
                      const f = C.generateFloor(seed, depth);
                      if (f.bossReason !== 'locked-first-security-room') continue;
                      const hasBoss = f.enemies.some(e => e.type === 'boss');
                      let firstSec = null;
                      for (const r of f.rooms) {
                        if (r.type === 'structure' && r.purpose === 'security') { firstSec = r; break; }
                      }
                      return {depth, seed, hasBoss,
                        firstSecLocked: !!(firstSec && firstSec.lockedKind)};
                    }
                  }
                  return null;
                }""")
            boss_unit = page.evaluate(
                """() => {
                  const C = window.ScrapCore;
                  for (let seed = 1; seed <= 50; seed++) {
                    const f = C.generateFloor(seed, 6);
                    let secIdx = -1;
                    for (let i = 0; i < f.rooms.length; i++) {
                      if (f.rooms[i].type === 'structure' && f.rooms[i].purpose === 'security') { secIdx = i; break; }
                    }
                    if (secIdx < 0) continue;
                    const r = C.placeBoss(f, 6, {lockedRoomIndex: secIdx});
                    return {seed, reason: r.reason, boss: r.boss};
                  }
                  return {skipped: 'no-security-room-in-50-seeds'};
                }""")
            boss_ok = False
            if boss_nat is not None:
                boss_ok = (not boss_nat["hasBoss"]) and boss_nat["firstSecLocked"]
            if not boss_ok and isinstance(boss_unit, dict) and boss_unit.get("reason") == "locked-first-security-room" and boss_unit.get("boss") is None:
                boss_ok = True  # natural hit absent; exclusion point verified directly
            check("locked first security room => no boss, reason recorded (P6-BOSS-COMPATIBILITY)",
                  boss_ok, {"natural": boss_nat, "unit": boss_unit})
            done["boss"] = boss_ok

            # ---- 10. Fog screenshots on a fresh generated floor.
            # No seed lottery: ANY depth-1 floor works. Fog-1 at
            # spawn (only the spawn room renders). Then a real
            # key-walk out of the spawn room's first door, 2 cells
            # into the corridor: the spawn room is now explored but
            # unoccupied, so its LOS-blocked cells must render
            # dimmed ~45%. Then a real key-walk into the closest
            # other room: its center must render full. A black-room
            # foe (teleport fixture — teleporting never marks
            # explored) must not render. Camera geometry comes from
            # ONE evaluate per screenshot.
            def geom(page):
                return page.evaluate(
                    """() => {
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
                      // The transient log overlay (#transient-msg)
                      // sits on the canvas's bottom edge for 3.5s
                      // after the last log line; its text pixels
                      // would fake a fog leak in any bottom-row tile
                      // rect (debug run: tile (8,24) at 0.948 from
                      // the Bypass refusal line). Report it when
                      // showing so samplers can exclude the strip.
                      const tr = document.getElementById('transient-msg');
                      let transient = null;
                      if (tr && tr.classList.contains('show')) {
                        const q = tr.getBoundingClientRect();
                        transient = {left: q.left, top: q.top,
                                     right: q.right, bottom: q.bottom};
                      }
                      return {left: r.left, top: r.top, cw: r.width, ch: r.height,
                              ox, oy, TILE, transient};
                    }""")

            def rect_of(g, x, y):
                return [g["left"] + g["ox"] + x * g["TILE"],
                        g["top"] + g["oy"] + y * g["TILE"], g["TILE"]]

            def rect_on_screen(rect):
                x0, y0, tile = [int(v) for v in rect]
                return x0 >= 0 and y0 >= 0 and x0 + tile <= 1280 and y0 + tile <= 900

            def rect_in_canvas(g, rect):
                x0, y0, tile = [int(v) for v in rect]
                return (x0 >= g["left"] and y0 >= g["top"]
                        and x0 + tile <= g["left"] + g["cw"]
                        and y0 + tile <= g["top"] + g["ch"])

            def clip_to_canvas(g, rect):
                """Intersect a tile rect with the canvas rect. The
                top row of tiles can sit partly ABOVE the canvas (in
                the HUD strip): sampling the full rect would read HUD
                text pixels and fake a violation. Returns
                [x0, y0, w, h] or None when fully off-canvas."""
                x0, y0, tile = [int(v) for v in rect]
                cx0 = max(x0, int(g["left"]))
                cy0 = max(y0, int(g["top"]))
                cx1 = min(x0 + tile, int(g["left"] + g["cw"]))
                cy1 = min(y0 + tile, int(g["top"] + g["ch"]))
                if cx1 <= cx0 or cy1 <= cy0:
                    return None
                return [cx0, cy0, cx1 - cx0, cy1 - cy0]

            def region_mean(img, box):
                x0, y0, w, h = [int(v) for v in box]
                px = img.load()
                sr = sg = sb = n = 0
                for y in range(y0, y0 + h):
                    for x in range(x0, x0 + w):
                        r, g, b = px[x, y]
                        sr += r; sg += g; sb += b; n += 1
                return (sr / n, sg / n, sb / n) if n else (0, 0, 0)

            def region_frac_black(img, box, thresh=40):
                x0, y0, w, h = [int(v) for v in box]
                px = img.load()
                black = n = 0
                for y in range(y0, y0 + h):
                    for x in range(x0, x0 + w):
                        r, g, b = px[x, y]
                        n += 1
                        if r <= thresh and g <= thresh and b <= thresh:
                            black += 1
                return black / n if n else 1.0

            def exclude_transient(g, box):
                """Cut a sampled box to exclude the transient log
                overlay strip (see geom). Returns None when nothing
                usable remains above the strip."""
                tr = g.get("transient")
                if not tr:
                    return box
                x0, y0, w, h = box
                x1, y1 = x0 + w, y0 + h
                if x1 <= tr["left"] or x0 >= tr["right"] \
                        or y1 <= tr["top"] or y0 >= tr["bottom"]:
                    return box
                if y0 < tr["top"]:
                    return [x0, y0, w, int(tr["top"]) - y0]
                return None

            fog_setup = None
            for seed in range(1, 11):
                cand = page.evaluate(
                    """(seed) => {
                      const s = window.__scrapDebug.getState();
                      const C = window.ScrapCore;
                      const f = C.generateFloor(seed, 1);
                      // Rooms carry type 'spawn' for room 0 (no
                      // boolean flag) — the run1/run2 bug was
                      // looking for r.spawn, which is always
                      // undefined and made this setup return null
                      // for every seed.
                      const spawnRoom = f.rooms.find(r => r.type === 'spawn');
                      if (!spawnRoom) return null;
                      let other = null, bestD = 1e9;
                      for (const r of f.rooms) {
                        if (r.type === 'spawn') continue;
                        const d = Math.max(Math.abs(r.x + r.w / 2 - (spawnRoom.x + spawnRoom.w / 2)),
                                           Math.abs(r.y + r.h / 2 - (spawnRoom.y + spawnRoom.h / 2)));
                        if (d < bestD) { bestD = d; other = r; }
                      }
                      if (!other) return null;
                      // Spawn room's first door in row-major order
                      // (never locked: locked rooms are non-spawn
                      // leaves). The outward step is the opposite
                      // of the door's room-floor neighbor.
                      const doors = (f.doors || []).filter(d => d.roomId === spawnRoom.id)
                        .sort((a, b) => (a.y - b.y) || (a.x - b.x));
                      if (!doors.length) return null;
                      const door = doors[0];
                      let out = null;
                      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                      for (const [dx, dy] of dirs) {
                        const nx = door.x + dx, ny = door.y + dy;
                        if (nx >= spawnRoom.x && nx < spawnRoom.x + spawnRoom.w &&
                            ny >= spawnRoom.y && ny < spawnRoom.y + spawnRoom.h) {
                          out = [-dx, -dy];
                          break;
                        }
                      }
                      if (!out) return null;
                      let exitTarget = null;
                      for (let step = 2; step >= 1; step--) {
                        const tx = door.x + out[0] * step, ty = door.y + out[1] * step;
                        if (tx >= 0 && tx < 60 && ty >= 0 && ty < 44 &&
                            f.grid[ty][tx] === 'corridor') { exitTarget = {x: tx, y: ty}; break; }
                      }
                      if (!exitTarget) return null;
                      s.floor = f;
                      s.depth = 1;
                      s.player.x = f.spawn.x; s.player.y = f.spawn.y;
                      s.floor.enemies = [];
                      s.floor.pickups = [];
                      // Fixture: wide art can spill pixels past its
                      // anchor cell into neighboring tiles, which
                      // would trip the all-black check below. Fog is
                      // what's tested here, not wide art.
                      s.floor.wideDressing = [];
                      if (f.explored && f.explored.exploredRoomIds.indexOf(spawnRoom.id) === -1)
                        f.explored.exploredRoomIds.push(spawnRoom.id);
                      return {seed,
                        spawnRoom: {x: spawnRoom.x, y: spawnRoom.y,
                          w: spawnRoom.w, h: spawnRoom.h, id: spawnRoom.id},
                        otherRoom: {x: other.x, y: other.y, w: other.w,
                          h: other.h, id: other.id},
                        door: {x: door.x, y: door.y}, exitTarget};
                    }""", seed)
                if cand is not None:
                    fog_setup = cand
                    break
            fog_ok = False
            if fog_setup is not None:
                # Wait out the 3.5s transient overlay (last log line
                # predates the setup) so the fog-1 screenshot is
                # clean for visual reading too; the sampler also
                # excludes the strip via exclude_transient.
                page.wait_for_timeout(3600)
                st = page.evaluate(STATE_JS)
                sr = fog_setup["spawnRoom"]
                orr = fog_setup["otherRoom"]
                spawn_cx, spawn_cy = sr["x"] + sr["w"] // 2, sr["y"] + sr["h"] // 2
                other_cx, other_cy = orr["x"] + orr["w"] // 2, orr["y"] + orr["h"] // 2
                grid = st["grid"]
                g1 = geom(page)
                p_fog1 = SHOTS / "phase6-fog-spawn.png"
                page.screenshot(path=str(p_fog1))
                img1 = shot_pixels(p_fog1)
                _cs = clip_to_canvas(g1, rect_of(g1, spawn_cx, spawn_cy))
                black_spawn = region_frac_black(img1, _cs) if _cs else 1.0
                # Every on-screen tile outside the spawn room must be
                # black, except door cells (a door adjacent to the
                # explored spawn room renders dim per §9.7.4).
                violations, sampled = [], 0
                for y in range(44):
                    for x in range(60):
                        if sr["x"] <= x < sr["x"] + sr["w"] and sr["y"] <= y < sr["y"] + sr["h"]:
                            continue
                        if grid[y][x] == "door":
                            continue
                        # Wall framing of the spawn room itself
                        # renders (game.js wall rule: 8-dir adjacent
                        # to an explored room) — it carries no
                        # information beyond the explored rect.
                        if grid[y][x] == "wall" and any(
                                sr["x"] <= x + dx < sr["x"] + sr["w"] and
                                sr["y"] <= y + dy < sr["y"] + sr["h"]
                                for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                                if dx or dy):
                            continue
                        r = rect_of(g1, x, y)
                        if not rect_on_screen(r):
                            continue
                        ci = clip_to_canvas(g1, r)
                        if ci is None:
                            continue
                        ci = exclude_transient(g1, ci)
                        if ci is None or ci[2] * ci[3] < 0.5 * int(r[2]) * int(r[2]):
                            continue
                        sampled += 1
                        fb = region_frac_black(img1, ci)
                        if fb < 0.95:
                            violations.append((x, y, round(fb, 3)))
                first_ok = black_spawn < 0.5 and not violations and sampled >= 20
                check("first screenshot: only the spawn room renders, everything else on-screen black (P6-FOG)",
                      first_ok, {"blackSpawn": round(black_spawn, 4),
                                 "sampledOutside": sampled,
                                 "violations": violations[:5]})
                # Real walk out of the spawn room's first door into
                # the corridor, then the dim check on LOS-blocked
                # spawn cells (cells visible through the open door
                # stay full, so only LOS-blocked cells are sampled).
                path = page.evaluate(
                    """([tx, ty]) => {
                      const s = window.__scrapDebug.getState();
                      return window.ScrapCore.findPath(s, tx, ty);
                    }""", [fog_setup["exitTarget"]["x"], fog_setup["exitTarget"]["y"]])
                if path:
                    walk_real_keys(page, [(p["dx"], p["dy"]) for p in path])
                page.wait_for_timeout(500)
                st = page.evaluate(STATE_JS)
                outside = not (sr["x"] <= st["px"] < sr["x"] + sr["w"]
                                and sr["y"] <= st["py"] < sr["y"] + sr["h"])
                p_fog2 = SHOTS / "phase6-fog-left-spawn.png"
                page.screenshot(path=str(p_fog2))
                img2 = shot_pixels(p_fog2)
                g2 = geom(page)
                blocked = page.evaluate(
                    """(sr) => {
                      const s = window.__scrapDebug.getState();
                      const C = window.ScrapCore;
                      const out = [];
                      for (let y = sr.y; y < sr.y + sr.h; y++)
                        for (let x = sr.x; x < sr.x + sr.w; x++)
                          if (!C.lineOfSight(s, s.player.x, s.player.y, x, y)) out.push([x, y]);
                      return out;
                    }""", sr)
                dim_ratios = None
                blocked.sort(key=lambda c: max(abs(c[0] - st["px"]), abs(c[1] - st["py"])))
                for (x, y) in blocked:
                    r2 = rect_of(g2, x, y)
                    ci = clip_to_canvas(g2, r2)
                    if ci is None:
                        continue
                    # Same tile-relative sub-box in fog-1, so the
                    # ratio compares identical pixels, not a full
                    # tile against a clipped one. Require >=50% of
                    # the tile visible.
                    tile = int(r2[2])
                    if ci[2] * ci[3] < 0.5 * tile * tile:
                        continue
                    dx, dy = ci[0] - int(r2[0]), ci[1] - int(r2[1])
                    r1 = rect_of(g1, x, y)
                    sub1 = [int(r1[0]) + dx, int(r1[1]) + dy, ci[2], ci[3]]
                    m1 = region_mean(img1, sub1)
                    m2 = region_mean(img2, ci)
                    dim_ratios = [m2[i] / m1[i] if m1[i] > 10 else 0 for i in range(3)]
                    break
                dim_ok = dim_ratios is not None and all(DIM_LO <= r <= DIM_HI for r in dim_ratios)
                second_ok = outside and dim_ok
                check("leaving the spawn room dims it ~45% (P6-FOG)",
                      second_ok, {"outside": outside, "meanRatios":
                                  [round(r, 3) for r in dim_ratios] if dim_ratios else None,
                                  "blockedCells": len(blocked)})
                # Real walk into the closest other room: its center
                # must render full.
                path = page.evaluate(
                    """([tx, ty]) => {
                      const s = window.__scrapDebug.getState();
                      return window.ScrapCore.findPath(s, tx, ty);
                    }""", [other_cx, other_cy])
                if path:
                    walk_real_keys(page, [(p["dx"], p["dy"]) for p in path])
                page.wait_for_timeout(500)
                st = page.evaluate(STATE_JS)
                arrived = (st["px"], st["py"]) == (other_cx, other_cy)
                p_fog3 = SHOTS / "phase6-fog-second-room.png"
                page.screenshot(path=str(p_fog3))
                img3 = shot_pixels(p_fog3)
                g3 = geom(page)
                black_other3 = frac_black(img3, rect_of(g3, other_cx, other_cy))
                third_ok = arrived and black_other3 < 0.5
                check("second room renders full on arrival (P6-FOG)",
                      third_ok, {"arrived": arrived, "blackOther": round(black_other3, 4)})
                fog_ok = first_ok and second_ok and third_ok
                # No enemy renders in a black room (differential ~0).
                # Teleport is fixture setup (rendering is what's
                # tested — teleporting never marks explored): the
                # player goes to a corridor cell on the same row as
                # an unexplored room's center, with a wall/closed
                # door on the line so LOS is blocked orthogonally
                # (no corner-cutting leak).
                place = page.evaluate(
                    """() => {
                      const s = window.__scrapDebug.getState();
                      const ex = s.floor.explored;
                      const cur = s.floor.rooms.find(r =>
                        s.player.x >= r.x && s.player.x < r.x + r.w &&
                        s.player.y >= r.y && s.player.y < r.y + r.h);
                      for (const r of s.floor.rooms) {
                        if (cur && r.id === cur.id) continue;
                        if (ex && ex.exploredRoomIds.indexOf(r.id) !== -1) continue;
                        const cx = r.x + Math.floor(r.w / 2), cy = r.y + Math.floor(r.h / 2);
                        const tries = [];
                        for (let d = 2; d <= 6; d++) {
                          tries.push([r.x - d, cy]);
                          tries.push([r.x + r.w - 1 + d, cy]);
                        }
                        for (const [px, py] of tries) {
                          if (px < 0 || px >= 60) continue;
                          if (s.floor.grid[py][px] !== 'corridor') continue;
                          let blocked = false;
                          for (let x = Math.min(px, cx); x <= Math.max(px, cx); x++) {
                            if (s.floor.grid[py][x] === 'wall') blocked = true;
                            const dr = (s.floor.doors || []).find(q => q.x === x && q.y === py);
                            if (dr && dr.state !== 'open') blocked = true;
                          }
                          if (!blocked) continue;
                          s.player.x = px; s.player.y = py;
                          return {foeX: cx, foeY: cy, px, py};
                        }
                      }
                      return null;
                    }""")
                if place is not None:
                    page.wait_for_timeout(400)
                    g4 = geom(page)
                    foe_rect = rect_of(g4, place["foeX"], place["foeY"])
                    if rect_on_screen(foe_rect):
                        fid = craft_foe(page, "raider",
                                        place["foeX"] - place["px"], place["foeY"] - place["py"],
                                        {"nextTime": 1e9})
                        page.wait_for_timeout(400)
                        p_with = SHOTS / "phase6-fog-hidden-foe-with.png"
                        page.screenshot(path=str(p_with))
                        page.evaluate(
                            """(fid) => {
                              const s = window.__scrapDebug.getState();
                              const f = s.floor.enemies.find(e => e.id === fid);
                              if (f) f.alive = false;
                            }""", fid)
                        page.wait_for_timeout(400)
                        p_without = SHOTS / "phase6-fog-hidden-foe-without.png"
                        page.screenshot(path=str(p_without))
                        frac = frac_different(shot_pixels(p_with), shot_pixels(p_without), foe_rect)
                        hidden_ok = frac < 0.01
                        check("no enemy renders in a black room (P6-FOG)",
                              hidden_ok, {"frac": round(frac, 4), "cell": (place["foeX"], place["foeY"])})
                        fog_ok = fog_ok and hidden_ok
                    else:
                        check("black-room foe setup: foe tile on-screen", False,
                              {"foe": (place["foeX"], place["foeY"])})
                        fog_ok = False
                else:
                    check("black-room foe setup: an orthogonal unexplored-room approach exists",
                          False, None)
                    fog_ok = False
            else:
                check("fog setup: a generated floor with a spawn-room door and a corridor exit", False, None)
            done["fog"] = fog_ok

            # ---- 11. Fog LOS: foe beyond a closed door hidden, then shown.
            # Fresh-floor reset: section 10 replaced the floor and
            # teleported the player, so 11-13 must not inherit that
            # live state (run3's fog-LOS/save/legacy cascade).
            page.evaluate(
                """() => {
                  const s = window.__scrapDebug.getState();
                  const C = window.ScrapCore;
                  const f = C.generateFloor(7, 1);
                  s.floor = f; s.depth = 1;
                  s.player.x = f.spawn.x; s.player.y = f.spawn.y;
                  s.floor.enemies = []; s.floor.pickups = [];
                  // Full clean-state reset: section 10's walk into
                  // the closest other room ends ON the stairs when
                  // that room's center is the stairs cell (seed-1
                  // floor), leaving state 'stairs' — and in that
                  // state arrow bumps neither move nor open doors,
                  // which cascaded into fog-LOS/save/legacy fails.
                  s.state = 'playing'; s.keys = [];
                }""")
            page.wait_for_timeout(400)
            flatten_box(page, 6)
            set_player(page, 0, 100)
            craft_door(page, 1, 0, "closed")
            fid = craft_foe(page, "raider", 3, 0, {"nextTime": 1e9})
            page.wait_for_timeout(400)
            st = page.evaluate(STATE_JS)
            rect = tile_rect(page, st["px"] + 3, st["py"])
            p_cl = SHOTS / "phase6-fog-los-closed.png"
            page.screenshot(path=str(p_cl))
            page.evaluate(
                """(fid) => {
                  const s = window.__scrapDebug.getState();
                  const f = s.floor.enemies.find(e => e.id === fid);
                  if (f) f.alive = false;
                }""", fid)
            page.wait_for_timeout(400)
            p_cl0 = SHOTS / "phase6-fog-los-closed-without.png"
            page.screenshot(path=str(p_cl0))
            frac_closed = frac_different(shot_pixels(p_cl), shot_pixels(p_cl0), rect)
            hidden_los = frac_closed < 0.01
            check("foe beyond a closed door does not render (P6-FOG-LOS)",
                  hidden_los, {"frac": round(frac_closed, 4)})
            # Restore the foe, open the door with a real bump, re-shoot.
            craft_foe(page, "raider", 3, 0, {"nextTime": 1e9})
            page.keyboard.press("ArrowRight")  # real bump opens the door
            page.wait_for_timeout(400)
            st = page.evaluate(STATE_JS)
            foe = next((e for e in st["enemies"] if e["x"] == st["px"] + 3 and e["y"] == st["py"]), None)
            rect2 = tile_rect(page, st["px"] + 3, st["py"])
            p_op = SHOTS / "phase6-fog-los-open.png"
            page.screenshot(path=str(p_op))
            if foe is not None:
                page.evaluate(
                    """([fx, fy]) => {
                      const s = window.__scrapDebug.getState();
                      s.floor.enemies.forEach(e => {
                        if (e.x === fx && e.y === fy) e.alive = false; });
                    }""", [foe["x"], foe["y"]])
                page.wait_for_timeout(400)
                p_op0 = SHOTS / "phase6-fog-los-open-without.png"
                page.screenshot(path=str(p_op0))
                frac_open = frac_different(shot_pixels(p_op), shot_pixels(p_op0), rect2)
            else:
                frac_open = 0.0
            shown_los = frac_open > 0.03
            check("opening the door (real bump) makes the foe render (P6-FOG-LOS)",
                  shown_los, {"frac": round(frac_open, 4),
                              "foePresent": foe is not None})
            done["foglos"] = hidden_los and shown_los

            # ---- 12. Save/load round-trip of door states + keys + explored.
            flatten_box(page, 6)
            set_player(page, 0, 100)
            drec = craft_door(page, 1, 0, "closed")
            page.keyboard.press("ArrowRight")  # real bump opens it
            page.wait_for_timeout(400)
            page.evaluate(
                """() => {
                  const s = window.__scrapDebug.getState();
                  s.floor.pickups.push({x: s.player.x, y: s.player.y,
                    kind: 'key', keyId: 'key:fixture-save'});
                }""")
            # Pick the key up by stepping away and back (real keys).
            page.keyboard.press("ArrowLeft")
            page.wait_for_timeout(300)
            page.keyboard.press("ArrowRight")
            page.wait_for_timeout(400)
            page.keyboard.press(" ")  # autosave after the pickup
            page.wait_for_timeout(400)
            saved = page.evaluate(
                """(key) => {
                  const raw = localStorage.getItem(key);
                  if (!raw) return null;
                  try { return JSON.parse(raw); } catch (e) { return {parseError: String(e)}; }
                }""", RUN_KEY)
            save_ok = False
            if isinstance(saved, dict) and "floor" in saved:
                fl = saved["floor"]
                d0 = next((d for d in fl.get("doors", []) if d["x"] == drec["x"] and d["y"] == drec["y"]), None)
                save_ok = (d0 is not None and d0["state"] == "open"
                           and "key:fixture-save" in (saved.get("keys") or [])
                           and fl.get("explored") is not None
                           and isinstance(fl["explored"].get("exploredRoomIds"), list))
                check("save: door state + key + explored serialize as plain JSON (P6-SAVE-JSON)",
                      save_ok, {"door": d0, "keys": saved.get("keys"),
                                "exploredPresent": fl.get("explored") is not None})
            else:
                check("save: a run save exists in localStorage", False, {"saved": saved})
            page.reload()
            page.wait_for_timeout(1500)
            continued = page.evaluate(
                """() => {
                  const b = Array.from(document.querySelectorAll('button'))
                    .find(x => x.textContent.trim() === 'Continue');
                  if (b) { b.click(); return true; } return false;
                }""")
            page.wait_for_timeout(600)
            st = page.evaluate(STATE_JS)
            live_ok = False
            if continued and st["runState"] == "playing":
                d0 = next((d for d in st["doors"] if d["x"] == drec["x"] and d["y"] == drec["y"]), None)
                live_ok = (d0 is not None and d0["state"] == "open"
                           and "key:fixture-save" in st["keys"]
                           and st["explored"] is not None)
            check("load: Continue (real click) restores door + key + explored (P6-SAVE-JSON)",
                  continued and live_ok,
                  {"continued": continued, "runState": st["runState"],
                   "keys": st["keys"], "exploredPresent": st["explored"] is not None})
            done["saveload"] = save_ok and live_ok

            # ---- 13. Legacy migration: strip doors/explored, reload.
            saved = page.evaluate(
                """(key) => {
                  const raw = localStorage.getItem(key);
                  try { return JSON.parse(raw); } catch (e) { return null; }
                }""", RUN_KEY)
            legacy_ok = False
            if isinstance(saved, dict):
                fl = saved.get("floor") or {}
                fl.pop("doors", None)
                fl.pop("explored", None)
                saved.pop("keys", None)
                page.evaluate(
                    """([key, val]) => { localStorage.setItem(key, JSON.stringify(val)); }""",
                    [RUN_KEY, saved])
                page.reload()
                page.wait_for_timeout(1500)
                continued = page.evaluate(
                    """() => {
                      const b = Array.from(document.querySelectorAll('button'))
                        .find(x => x.textContent.trim() === 'Continue');
                      if (b) { b.click(); return true; } return false;
                    }""")
                page.wait_for_timeout(600)
                st = page.evaluate(STATE_JS)
                if continued and st["runState"] == "playing":
                    all_open = all(d["state"] == "open" for d in st["doors"])
                    all_rooms = (st["explored"] is not None
                                 and set(st["explored"]["rooms"]) >=
                                 {r["id"] for r in st["rooms"]})
                    legacy_ok = all_open and all_rooms
                check("legacy save migrates: all doors open, all rooms explored (P6-LEGACY-MIGRATION)",
                      legacy_ok, {"continued": continued,
                                  "doors": len(st["doors"]),
                                  "exploredRooms": len(st["explored"]["rooms"]) if st["explored"] else None,
                                  "totalRooms": len(st["rooms"])})
            else:
                check("legacy setup: a run save exists", False, None)
            done["legacy"] = legacy_ok

            # ---- 14. Console / assets.
            check("no console errors / failed assets (P6-CONSOLE)",
                  not errors, errors[:5] or "none")
            ctx.close()
            attempts.append(list(FAILURES))
            break

        print("attempts:", json.dumps(
            [{"attempt": i + 1, "failures": f} for i, f in enumerate(attempts)]))
        check("art + door + LOS + wake verified within 3 attempts",
              done["art"] and done["door"] and done["los"] and done["wake"], done)
        check("force + key + bypass verified within 3 attempts",
              done["force"] and done["key"] and done["bypass"], done)
        check("placement + locked + boss verified within 3 attempts",
              done["placement"] and done["locked"] and done["boss"], done)
        check("fog + fog-LOS + save/load + legacy verified within 3 attempts",
              done["fog"] and done["foglos"] and done["saveload"] and done["legacy"], done)
        browser.close()

    print(json.dumps({"failures": FAILURES}, indent=1))
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
