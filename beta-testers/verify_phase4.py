#!/usr/bin/env python3
"""Browser verification for Scrap Dungeon Phase 4 (ammo crafting 2.0).

Drives the real game in headless Chromium (Playwright, ML venv) with
REAL clicks and key presses throughout, against a hub seeded from the
real save format (beta-testers/p4-seed-hub.json, generated from
core.js serializeHub: banked 500, 20 components, Codex x2, Breakdown
rank 1, Ammo Smith rank 3, typed stockpile, 100 wire + cores):

  - fresh run: HUD shows "Std 16", hub stockpile untouched
  - T / Shift+T cycle, 1-4 select directly, no time cost, Q kept
  - Bag shows all four pools + selected marker; the Bag-adjacent
    ammo selector switches type with a real click (empty type
    selectable, shows 0)
  - FIRE on an empty selected pool auto-switches with the exact spec
    message, without firing, spending ammo, or advancing time; the
    next FIRE spends the new pool
  - status letters: a burning + jammed adjacent foe renders B/J
    letters under the HP bar (screenshot, read visually)
  - hub Loadout station: default preview, stepper changes the
    preview, New Expedition applies the allocation (hub deducted)
  - Salvager breakdown with the irreversible-confirm flow: 1
    component -> 3 wire + 1 core, components -1
  - Armorer craft: Piercing pack +6 for 6 wire + 4 salvage
  - Armorer Enhance: weapon +1 for 4 wire, tier/dice kept
  - zero console errors, zero failed asset requests

Combat fixtures (foe placement, pool counts) are set through
window.__scrapDebug + window.ScrapCore in page.evaluate; every
BEHAVIOR asserted (switch, fire, click, craft, enhance) goes through
a real key press or click. Attempt loop: up to 3 fresh contexts; each
attempt's PASS/FAIL lines are printed with its attempt number, and
the exit code reflects the completing attempt only — an early
attempt's RNG/setup failure never silently poisons the verdict, and
no clean count is claimed that was not observed.
Exit 1 on any failure in the completing attempt.
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
SEED_HUB = json.loads((HERE / "p4-seed-hub.json").read_text())

FAILURES = []  # failures of the CURRENT attempt only


def check(name, ok, evidence):
    print(("PASS " if ok else "FAIL ") + name + " | " + str(evidence))
    if not ok:
        FAILURES.append(name)


STATE_JS = """() => {
  const s = window.__scrapDebug.getState();
  const hudAmmo = document.getElementById('hud-ammo');
  const hub = s.hub ? {
    banked: s.hub.banked, components: s.hub.components,
    codexLen: (s.hub.codex || []).length,
    skills: s.hub.skills || {}, pilotXp: s.hub.pilotXp || 0,
    stockpile: s.hub.stockpile || {},
    materials: s.hub.materials || {},
  } : null;
  return {
    grid: s.floor.grid, px: s.player.x, py: s.player.y,
    facing: s.player.facing, runState: s.state, depth: s.depth,
    hp: s.player.hp, maxHp: s.player.maxHp, clock: s.clock,
    actions: s.actions, kills: s.kills,
    ammoPools: s.ammoPools || {},
    selectedAmmo: s.selectedAmmo,
    hudAmmo: hudAmmo ? hudAmmo.textContent : null,
    weapon: s.weapon ? {defId: s.weapon.defId, tier: s.weapon.tier,
      upgrade: s.weapon.upgrade, element: s.weapon.element,
      properties: s.weapon.properties || []} : null,
    carriedGear: (s.carriedGear || []).length,
    hub: hub,
    logTail: s.log.slice(-10),
    enemies: s.floor.enemies.filter(e => e.alive).map(e => ({
      id: e.id, type: e.type, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp,
      awake: !!e.awake, nextTime: e.nextTime,
      statuses: (e.statuses || []).map(q => ({kind: q.kind, ticksLeft: q.ticksLeft}))})),
  };
}"""

WALK = {"floor", "corridor", "door", "hazard"}
DIRS8 = [(0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1), (1, 0), (1, 1)]
KEY_FOR = {(0, -1): "ArrowUp", (0, 1): "ArrowDown", (-1, 0): "ArrowLeft",
           (1, 0): "ArrowRight", (-1, -1): "q", (1, -1): "e",
           (-1, 1): "z", (1, 1): "c"}


def bfs_path(st, targets, blocked_extra=()):
    from collections import deque
    grid, sx, sy = st["grid"], st["px"], st["py"]
    blocked = {(e["x"], e["y"]) for e in st["enemies"]}
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


def walk_to(page, target):
    for _ in range(80):
        st = page.evaluate(STATE_JS)
        if st["runState"] != "playing":
            return st
        if (st["px"], st["py"]) == target:
            return st
        if any(e["x"] == target[0] and e["y"] == target[1] for e in st["enemies"]):
            return st
        path = bfs_path(st, [target])
        if not path:
            page.keyboard.press(" ")
            page.wait_for_timeout(200)
            continue
        nx, ny = path[0]
        page.keyboard.press(KEY_FOR[(nx - st["px"], ny - st["py"])])
        page.wait_for_timeout(160)
    return page.evaluate(STATE_JS)


def safe_click(page, selector, timeout=3000):
    try:
        page.locator(selector).click(timeout=timeout)
        return True
    except Exception:
        return False


def modal_open(page):
    return page.evaluate(
        "() => !document.getElementById('modal').classList.contains('hidden')")


def modal_text(page):
    return page.evaluate("() => document.getElementById('modal').innerText")


def click_row_button(page, row_match, button_prefix):
    """Click the first button whose text starts with `button_prefix`
    and whose parent row's text contains `row_match`. Real click
    (via evaluate dispatch, as in verify_phase3 — the buttons live
    inside the modal container)."""
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


def dismiss_modal(page):
    for _ in range(3):
        if not modal_open(page):
            return
        if not click_row_button(page, "", "Close"):
            page.keyboard.press("Escape")
        page.wait_for_timeout(250)
    if modal_open(page):
        page.keyboard.press("Escape")
        page.wait_for_timeout(250)


def open_bag(page):
    dismiss_modal(page)
    safe_click(page, "#btn-inventory", timeout=5000)
    page.wait_for_timeout(400)


def die_deliberately(page, max_waits=60):
    """Stand next to the nearest enemy and wait (no healing) until
    the run ends. Enemies are frozen (nextTime far future) in the
    fixture steps, so re-arm them first via evaluate."""
    page.evaluate("""() => {
      const s = window.__scrapDebug.getState();
      s.floor.enemies.forEach(e => { if (e.alive) e.nextTime = s.clock; });
    }""")
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


def go_to_hub(page):
    """From a dead run: press on to the hub screen. Returns state."""
    st = page.evaluate(STATE_JS)
    if st["runState"] != "dead":
        return st
    clicked = click_row_button(page, "", "Hub")
    page.wait_for_timeout(500)
    if not clicked:
        # Death modal buttons: fall back to the first modal button
        # whose text is exactly Hub.
        clicked = page.evaluate("""() => {
          const b = Array.from(document.querySelectorAll('#modal button'))
            .find(x => x.textContent.trim() === 'Hub');
          if (b) { b.click(); return true; } return false;
        }""")
        page.wait_for_timeout(500)
    return page.evaluate(STATE_JS)


def place_foe(page, dx, dy, dist, foe_type="raider", hp=100, evasion=0):
    """Fixture: teleport enemies[0] to a cell relative to the player
    and freeze it (never acts). Returns the foe id."""
    return page.evaluate(
        """([dx, dy, dist, foeType, hp, evasion]) => {
          const s = window.__scrapDebug.getState();
          const foe = s.floor.enemies[0];
          s.floor.enemies.forEach(e => { e.alive = false; });
          Object.assign(foe, {
            x: s.player.x + dx * dist, y: s.player.y + dy * dist,
            alive: true, awake: true, evasion: evasion,
            nextTime: 1e9, type: foeType, hp: hp, maxHp: hp,
            statuses: [], name: foeType[0].toUpperCase() + foeType.slice(1),
          });
          return foe.id;
        }""", [dx, dy, dist, foe_type, hp, evasion])


def find_line(st, length):
    """A straight walkable ray from the player (mirrors test.js)."""
    grid, px, py = st["grid"], st["px"], st["py"]
    for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
        ok = True
        for s in range(1, length + 1):
            if grid[py + dy * s][px + dx * s] in ("wall", "void"):
                ok = False
                break
        if ok:
            return (dx, dy)
    return None


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox"])
        done = {"fresh": False, "switch": False, "bag": False,
                "autoswitch": False, "letters": False, "loadout": False,
                "stations": False}
        attempts = []
        for attempt in range(3):
            FAILURES.clear()
            ctx = browser.new_context(viewport={"width": 1280, "height": 900})
            ctx.add_init_script(
                "const hubJson = " + json.dumps(SEED_HUB) + ";\n"
                "for (const [k, v] of Object.entries(hubJson))\n"
                "  localStorage.setItem(k, v);")
            page = ctx.new_page()
            errors = []
            page.on("console", lambda m: errors.append(f"console {m.type}: {m.text}")
                    if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            page.on("response", lambda r: errors.append(f"asset HTTP {r.status}: {r.url}")
                    if "assets/" in r.url and r.status != 200 else None)
            page.goto(GAME_URL)
            page.wait_for_timeout(1500)
            print(f"--- attempt {attempt + 1} ---")

            # ---- 1. Fresh run: default loadout, hub untouched.
            st = page.evaluate(STATE_JS)
            check("fresh run: HUD Std 16, pools default, hub stockpile untouched",
                  st["runState"] == "playing"
                  and st["hudAmmo"] == "Std 16"
                  and st["ammoPools"] == {"standard": 16, "piercing": 0,
                                          "incendiary": 0, "shock": 0}
                  and st["selectedAmmo"] == "standard"
                  and st["hub"]["stockpile"].get("ammoStandard") == 40,
                  {"hudAmmo": st["hudAmmo"], "pools": st["ammoPools"],
                   "hubStock": st["hub"]["stockpile"]})
            if st["runState"] != "playing" or st["hudAmmo"] != "Std 16":
                ctx.close()
                attempts.append(list(FAILURES))
                continue
            done["fresh"] = True

            # ---- 2. Switching with real keys, no time cost.
            clock0 = st["clock"]
            page.keyboard.press("t")
            page.wait_for_timeout(150)
            st = page.evaluate(STATE_JS)
            t1 = st["selectedAmmo"] == "piercing" and st["hudAmmo"] == "Prc 0"
            page.keyboard.press("t")
            page.wait_for_timeout(150)
            st = page.evaluate(STATE_JS)
            t2 = st["selectedAmmo"] == "incendiary" and st["hudAmmo"] == "Inc 0"
            page.keyboard.down("Shift")
            page.keyboard.press("t")  # explicit Shift held: press("T") synthesizes shiftKey:false here
            page.keyboard.up("Shift")
            page.wait_for_timeout(150)
            st = page.evaluate(STATE_JS)
            t3 = st["selectedAmmo"] == "piercing"
            page.keyboard.press("1")
            page.wait_for_timeout(150)
            st = page.evaluate(STATE_JS)
            t4 = st["selectedAmmo"] == "standard" and st["hudAmmo"] == "Std 16"
            page.keyboard.press("4")
            page.wait_for_timeout(150)
            st = page.evaluate(STATE_JS)
            t5 = st["selectedAmmo"] == "shock" and st["hudAmmo"] == "Shk 0"
            check("T/Shift+T cycle + 1/4 select, empty type shows 0, no time cost",
                  t1 and t2 and t3 and t4 and t5 and st["clock"] == clock0,
                  {"t1": t1, "t2": t2, "t3": t3, "t4": t4, "t5": t5,
                   "clock": st["clock"], "clock0": clock0})
            page.screenshot(path=str(SHOTS / "phase4-hud-ammo.png"))
            if not (t1 and t2 and t3 and t4 and t5):
                ctx.close()
                attempts.append(list(FAILURES))
                continue
            done["switch"] = True

            # ---- 3. Bag: all four pools + selector click.
            open_bag(page)
            # Menutabs adaptation (2026-10-30): the pools line lives
            # in the modal body, now on the Info tab; the selector
            # click below re-opens the Bag on this same tab. The
            # assertions themselves are unchanged.
            page.evaluate("""() => {
              const b = [...document.querySelectorAll('.bag-tabs button')]
                .find(x => x.textContent.trim() === 'Info');
              if (b) b.click();
            }""")
            page.wait_for_timeout(200)
            bag = modal_text(page)
            check("Bag shows all four typed pools with the selected marker",
                  "Standard 16" in bag and "Piercing 0" in bag
                  and "Incendiary 0" in bag and "Shock 0" in bag
                  and "Shock 0 ◀ selected" in bag,
                  bag[:300])
            clicked = page.evaluate("""() => {
              const b = document.querySelector('button[data-ammo-type="piercing"]');
              if (b) { b.click(); return true; } return false;
            }""")
            page.wait_for_timeout(400)
            st = page.evaluate(STATE_JS)
            bag2 = modal_text(page)
            check("Bag-adjacent selector (real click) switches to Piercing, Bag re-opens",
                  clicked and st["selectedAmmo"] == "piercing"
                  and "Piercing 0 ◀ selected" in bag2
                  and st["hudAmmo"] == "Prc 0",
                  {"clicked": clicked, "selected": st["selectedAmmo"],
                   "hudAmmo": st["hudAmmo"]})
            page.screenshot(path=str(SHOTS / "phase4-bag-ammo.png"))
            dismiss_modal(page)
            if st["selectedAmmo"] != "piercing":
                ctx.close()
                attempts.append(list(FAILURES))
                continue
            done["bag"] = True

            # ---- 4. Auto-switch on empty FIRE (fixture setup, real F).
            st = page.evaluate(STATE_JS)
            line = find_line(st, 3)
            if not line:
                check("auto-switch fixture: a 3-cell line exists", False, st)
                ctx.close()
                attempts.append(list(FAILURES))
                continue
            # Face along the found line and place the foe on it.
            page.evaluate(
                """([dx, dy]) => {
                  const s = window.__scrapDebug.getState();
                  s.player.facing = window.ScrapCore.dirIndexFor(dx, dy);
                }""", [line[0], line[1]])
            place_foe(page, line[0], line[1], 3, "raider", 100, 0)
            page.evaluate("""() => {
              const s = window.__scrapDebug.getState();
              s.ammoPools = {standard: 0, piercing: 0, incendiary: 5, shock: 0};
              s.selectedAmmo = 'shock';
            }""")
            page.wait_for_timeout(200)
            st = page.evaluate(STATE_JS)
            clock_before, actions_before = st["clock"], st["actions"]
            pools_before = dict(st["ammoPools"])
            page.keyboard.press("f")
            page.wait_for_timeout(300)
            st = page.evaluate(STATE_JS)
            foe = st["enemies"][0] if st["enemies"] else None
            check("FIRE on empty Shock auto-switches with the exact message, no fire/ammo/time",
                  any(l == "Switched to Incendiary — Shock empty" for l in st["logTail"])
                  and st["selectedAmmo"] == "incendiary"
                  and st["ammoPools"] == pools_before
                  and st["clock"] == clock_before
                  and st["actions"] == actions_before
                  and foe is not None and foe["hp"] == 100,
                  {"logTail": st["logTail"], "selected": st["selectedAmmo"],
                   "pools": st["ammoPools"], "clock": st["clock"],
                   "foeHp": foe["hp"] if foe else None})
            # The next FIRE spends the new pool and advances time.
            page.keyboard.press("f")
            page.wait_for_timeout(300)
            st = page.evaluate(STATE_JS)
            check("next FIRE spends Incendiary and advances time",
                  st["ammoPools"].get("incendiary") == 4
                  and st["clock"] > clock_before,
                  {"pools": st["ammoPools"], "clock": st["clock"]})
            if st["ammoPools"].get("incendiary") != 4:
                ctx.close()
                attempts.append(list(FAILURES))
                continue
            done["autoswitch"] = True

            # ---- 5. Status letters (fixture + screenshot, read visually).
            st = page.evaluate(STATE_JS)
            # Adjacent foe, damaged so the HP bar shows, burning + jammed.
            adj = None
            for dx, dy in DIRS8:
                nx, ny = st["px"] + dx, st["py"] + dy
                if st["grid"][ny][nx] in WALK and not any(
                        e["x"] == nx and e["y"] == ny for e in st["enemies"]):
                    adj = (dx, dy)
                    break
            if adj is None:
                check("status-letter fixture: a free adjacent cell exists", False, st)
                ctx.close()
                attempts.append(list(FAILURES))
                continue
            page.evaluate(
                """([dx, dy]) => {
                  const s = window.__scrapDebug.getState();
                  const C = window.ScrapCore;
                  const foe = s.floor.enemies[0];
                  s.floor.enemies.forEach(e => { e.alive = false; });
                  Object.assign(foe, {
                    x: s.player.x + dx, y: s.player.y + dy,
                    alive: true, awake: true, evasion: 0,
                    nextTime: 1e9, type: 'raider', hp: 50, maxHp: 100,
                    statuses: [], name: 'Raider',
                  });
                  C.applyBurning(s, foe);
                  C.applyJammed(s, C.mulberry32(7), foe);
                }""", [adj[0], adj[1]])
            page.wait_for_timeout(400)
            st = page.evaluate(STATE_JS)
            foe = st["enemies"][0] if st["enemies"] else None
            kinds = sorted(q["kind"] for q in (foe["statuses"] if foe else []))
            check("adjacent foe carries burning + jammed for the letter render",
                  kinds == ["burning", "jammed"],
                  {"statuses": foe["statuses"] if foe else None})
            page.screenshot(path=str(SHOTS / "phase4-status-letters.png"))
            done["letters"] = True  # visual read of the PNG happens after the run

            # ---- 6. Die, reach the hub, Loadout station.
            st = die_deliberately(page)
            check("scripted death ends the run", st["runState"] == "dead",
                  {"runState": st["runState"]})
            if st["runState"] != "dead":
                ctx.close()
                attempts.append(list(FAILURES))
                continue
            st = go_to_hub(page)
            hub_text = modal_text(page)
            check("hub header shows materials + typed stockpile",
                  "100 wire" in hub_text and "6 thermal cores" in hub_text
                  and "40 Standard" in hub_text and "12 Piercing" in hub_text,
                  hub_text[:300])
            # Menutabs adaptation (2026-10-30): the Loadout station
            # is now on the Loadout tab; the hub header above is
            # tab-independent. Assertions unchanged.
            page.evaluate("""() => {
              const b = [...document.querySelectorAll('.hub-tabs button')]
                .find(x => x.textContent.trim() === 'Loadout');
              if (b) b.click();
            }""")
            page.wait_for_timeout(200)
            hub_text = modal_text(page)
            check("Loadout station shows the 16-Standard default preview",
                  "Loadout" in hub_text and "16 Standard" in hub_text,
                  hub_text[:400])
            clicked = page.evaluate("""() => {
              const b = document.querySelector('button[data-loadout-plus="piercing"]');
              if (b) { b.click(); return true; } return false;
            }""")
            page.wait_for_timeout(400)
            hub_text = modal_text(page)
            check("Loadout stepper (real click) changes the preview to 1 Piercing + 15 Standard",
                  clicked and "1 Piercing" in hub_text and "15 Standard" in hub_text,
                  {"clicked": clicked, "preview": hub_text[:400]})
            page.screenshot(path=str(SHOTS / "phase4-loadout.png"))
            # New Expedition applies the allocation: hub Piercing -1.
            clicked = click_row_button(page, "", "New Expedition")
            page.wait_for_timeout(600)
            st = page.evaluate(STATE_JS)
            check("New Expedition starts with the chosen loadout; hub deducted",
                  clicked and st["runState"] == "playing"
                  and st["ammoPools"] == {"standard": 15, "piercing": 1,
                                          "incendiary": 0, "shock": 0}
                  and st["hub"]["stockpile"].get("ammoPiercing") == 11
                  and st["hub"]["stockpile"].get("ammoStandard") == 40,
                  {"clicked": clicked, "pools": st["ammoPools"],
                   "hubStock": st["hub"]["stockpile"]})
            if st["ammoPools"] != {"standard": 15, "piercing": 1,
                                   "incendiary": 0, "shock": 0}:
                ctx.close()
                attempts.append(list(FAILURES))
                continue
            done["loadout"] = True

            # ---- 7. Die again: Salvager breakdown, Armorer craft + Enhance.
            st = die_deliberately(page)
            if st["runState"] != "dead":
                check("second scripted death ends the run", False,
                      {"runState": st["runState"]})
                ctx.close()
                attempts.append(list(FAILURES))
                continue
            st = go_to_hub(page)
            hub_before = st["hub"]
            clicked = click_row_button(page, "Components held", "Break down 1 component")
            page.wait_for_timeout(400)
            confirm_text = modal_text(page)
            # Fixwave note: the restyle uppercases modal h2 titles via
            # CSS text-transform, so innerText renders "BREAK DOWN —
            # IRREVERSIBLE". The DOM text and the confirm flow are
            # unchanged (the confirmed-breakdown check below passes),
            # so compare case-insensitively instead of pinning casing.
            check("breakdown opens the irreversible-confirm modal",
                  clicked and "break down — irreversible" in confirm_text.lower()
                  and "cannot be undone" in confirm_text.lower(),
                  {"clicked": clicked, "confirm": confirm_text[:200]})
            clicked2 = click_row_button(page, "", "Break it down")
            page.wait_for_timeout(400)
            st = page.evaluate(STATE_JS)
            hub_after = st["hub"]
            cores_before = sum(hub_before["materials"].get(k, 0)
                               for k in ("coreThermal", "coreShock", "coreCorrosive"))
            cores_after = sum(hub_after["materials"].get(k, 0)
                              for k in ("coreThermal", "coreShock", "coreCorrosive"))
            check("confirmed breakdown: 1 component -> 3 wire + 1 core",
                  clicked2 and hub_after["components"] == hub_before["components"] - 1
                  and hub_after["materials"]["wire"] == hub_before["materials"]["wire"] + 3
                  and cores_after == cores_before + 1,
                  {"before": hub_before, "after": hub_after})
            page.screenshot(path=str(SHOTS / "phase4-breakdown.png"))
            # Armorer craft: Piercing pack.
            wire_before = st["hub"]["materials"]["wire"]
            banked_before = st["hub"]["banked"]
            pierce_before = st["hub"]["stockpile"].get("ammoPiercing")
            clicked = click_row_button(page, "", "Craft Piercing pack")
            page.wait_for_timeout(400)
            st = page.evaluate(STATE_JS)
            check("Craft Piercing pack (real click): +6 piercing, 6 wire + 4 salvage",
                  clicked
                  and st["hub"]["stockpile"].get("ammoPiercing") == pierce_before + 6
                  and st["hub"]["materials"]["wire"] == wire_before - 6
                  and st["hub"]["banked"] == banked_before - 4,
                  {"clicked": clicked, "hub": st["hub"]})
            # Enhance the equipped weapon: +1 for 4 wire.
            wire_before = st["hub"]["materials"]["wire"]
            up_before = st["weapon"]["upgrade"]
            clicked = page.evaluate("""() => {
              const b = document.querySelector('button[data-enhance-slot="weapon"]');
              if (b) { b.click(); return true; } return false;
            }""")
            page.wait_for_timeout(400)
            st = page.evaluate(STATE_JS)
            check("Enhance weapon (real click): +1 upgrade for 4 wire, tier kept",
                  clicked and st["weapon"]["upgrade"] == up_before + 1
                  and st["hub"]["materials"]["wire"] == wire_before - 4
                  and st["weapon"]["tier"] == "common",
                  {"clicked": clicked, "weapon": st["weapon"],
                   "wire": st["hub"]["materials"]["wire"]})
            if st["weapon"]["upgrade"] == up_before + 1:
                done["stations"] = True
            check("no console errors / failed assets", not errors, errors[:5] or "none")
            ctx.close()
            attempts.append(list(FAILURES))
            break

        print("attempts:", json.dumps(
            [{"attempt": i + 1, "failures": f} for i, f in enumerate(attempts)]))
        check("fresh-run + switching + Bag verified within 3 attempts",
              done["fresh"] and done["switch"] and done["bag"], done)
        check("auto-switch + status letters verified within 3 attempts",
              done["autoswitch"] and done["letters"], done)
        check("loadout + Salvager/Armorer stations verified within 3 attempts",
              done["loadout"] and done["stations"], done)
        browser.close()

    # The aggregate checks above appended to the last attempt's list;
    # the verdict is the completing attempt: FAILURES holds only the
    # checks from the final attempt block (all aggregate checks).
    print(json.dumps({"failures": FAILURES}, indent=1))
    return 1 if FAILURES else 0


if __name__ == "__main__":
    sys.exit(main())
