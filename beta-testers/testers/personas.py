"""Player personas — automated testers that play like humans.

CASUAL: a new player mashing around — random moves, wall bumps,
self-taps, Bag/Log modal, wrench use-item popup, Search, Menu Rest,
traps.
COMPLETIONIST: plays to finish floors — pickups, combat, stairs
side panel, Descend then Extract, checks the run summary is sane.
BUG-HUNTER: tries to break it — rapid key taps, modal spam, Wait/Rest
spam, reload mid-run, out-of-bounds taps, items at full HP / unheld.
MOBILE: phone viewport, touch only, tap-target and layout checks.

All personas drive the real UI (keyboard, buttons, canvas taps) and
read state only through window.__scrapDebug. Nothing under game/
is edited. Checks that depend on Phase 2 (save/load, salvage drop
pickups, hub) are recorded as NOTE/ENV when Phase 2 has not landed
yet, never invented as PASS.
"""
import random

from .common import (KEY_FOR, Recorder, attack_adjacent_until_dead,
                     bfs_path, click_button, find_stairs, get_state,
                     grid_counts, modal_text, modal_visible, sane_numbers,
                     step, walk_path)


def _adjacent_enemy(state):
    px, py = state["x"], state["y"]
    return [e for e in state["enemies"]
            if max(abs(e["x"] - px), abs(e["y"] - py)) == 1]


def _click_modal_button(page, text):
    page.locator("#modal-btns button", has_text=text).first.click()
    page.wait_for_timeout(300)


def _close_modal(page):
    """Close whichever modal is open via its Close button, if any."""
    if modal_visible(page):
        _click_modal_button(page, "Close")


def _stairs_panel_visible(page):
    return page.evaluate(
        "() => !document.getElementById('stairs-panel')"
        ".classList.contains('hidden')")


def _stairs_panel_text(page):
    return page.evaluate(
        "() => document.getElementById('stairs-info').textContent + ' | ' + "
        "Array.from(document.querySelectorAll('#stairs-panel button'))"
        ".map(b => b.textContent).join(' | ')")


def _click_stairs_button(page, selector):
    """Click a stairs side-panel button by id (Descend/Extract/Cancel)."""
    page.locator(selector).first.click(timeout=3000)
    page.wait_for_timeout(300)


def _open_menu(page):
    click_button(page, "#btn-menu")
    return modal_visible(page)


def _rest_via_menu(page):
    """Rest, which lives inside the Menu modal. Returns False if the
    Menu modal did not open (e.g. a death modal is up instead)."""
    if not _open_menu(page):
        return False
    title = page.evaluate(
        "() => document.getElementById('modal-title').textContent")
    if title != "Menu":
        return False
    _click_modal_button(page, "Rest")
    return True


def _use_item_via_wrench(page, label):
    """Use an item through the wrench use-item popup. `label` is a
    substring of the popup button, e.g. 'health cell'. The popup
    closes itself once an item button is pressed (use or refusal)."""
    click_button(page, "#btn-wrench")
    page.locator("#modal-btns button", has_text=label).first.click(timeout=3000)
    page.wait_for_timeout(300)


def _adjacent_tile_screen_point(page, dx, dy):
    """Viewport (x, y) of the centre of the tile (dx, dy) steps from the
    player, on the current square-grid camera. Replicates the game's
    own tileOrigin/TILE math from live DOM values — no hardcoded
    geometry, and no iso math (the old isometric render is gone)."""
    return page.evaluate("""([dx, dy]) => {
      const s = window.__scrapDebug.getState();
      const cv = document.getElementById('game');
      const rect = cv.getBoundingClientRect();
      const cols = rect.width < 520 ? 9 : rect.width < 900 ? 11 : 12;
      const TILE = Math.max(32, Math.round(rect.width / cols));
      const W = cv.width, H = cv.height;
      const fw = 60 * TILE, fh = 44 * TILE;
      let ox, oy;
      if (fw <= W) ox = (W - fw) / 2;
      else ox = Math.max(W - fw, Math.min(0, W / 2 - (s.player.x + 0.5) * TILE));
      if (fh <= H) oy = (H - fh) / 2;
      else oy = Math.max(H - fh, Math.min(0, H / 2 - (s.player.y + 0.5) * TILE));
      const gx = s.player.x + dx, gy = s.player.y + dy;
      const sx = (ox + (gx + 0.5) * TILE) * (rect.width / W);
      const sy = (oy + (gy + 0.5) * TILE) * (rect.height / H);
      return {x: rect.left + sx, y: rect.top + sy};
    }""", [dx, dy])


# ---------------------------------------------------------------- casual
def run_casual(page, rec):
    rng = random.Random(1234)
    st = get_state(page)
    rec.observe("start_grid_counts", grid_counts(st["grid"]))
    rec.observe("start_enemy_types", sorted({e["type"] for e in st["enemies"]}))
    rec.observe("start_pickup_kinds", sorted({p["kind"] for p in st["pickups"]}))
    rec.log(f"start hp={st['hp']} at ({st['x']},{st['y']}) depth={st['depth']}")
    dead_ends = 0
    for i in range(120):
        if st["runState"] != "playing":
            break
        roll = rng.random()
        before = dict(st)
        try:
            if roll < 0.55:
                dx, dy = rng.choice(list(KEY_FOR.keys()))
                st = step(page, dx, dy, wait_ms=80)
                if (st["x"], st["y"], st["clock"]) == \
                   (before["x"], before["y"], before["clock"]):
                    dead_ends += 1  # move attempt that changed nothing: wall bump
                rec.log(f"move ({dx},{dy}) -> ({st['x']},{st['y']}) hp={st['hp']}")
            elif roll < 0.65:
                click_button(page, "#btn-wait")
                st = get_state(page)
                rec.log(f"wait -> clock={st['clock']}")
            elif roll < 0.72:
                click_button(page, "#btn-search")
                st = get_state(page)
                rec.log(f"search -> clock={st['clock']}")
            elif roll < 0.80:
                click_button(page, "#btn-inventory")
                st = get_state(page)
                rec.log("opened Bag")
                if modal_visible(page):
                    click_button(page, "#modal-btns button", timeout=3000)
                st = get_state(page)
            elif roll < 0.86:
                # Log opens as a modal overlay now (no collapsible
                # #log element); open it, read state, close it, so the
                # next action's dock buttons are not left covered.
                click_button(page, "#btn-log")
                st = get_state(page)
                rec.log("opened Log modal")
                _close_modal(page)
                st = get_state(page)
            elif roll < 0.93:
                # Quickslots are gone; items are used via the wrench
                # use-item popup. Same intent: mash "use health cell"
                # and watch HP/cells (refusal at full HP or with none
                # held is harmless and logged).
                _use_item_via_wrench(page, "health cell")
                st = get_state(page)
                rec.log(f"wrench health cell -> hp={st['hp']} health={st['healthCells']}")
            else:
                # Rest lives in the Menu modal now.
                _rest_via_menu(page)
                st = get_state(page)
                rec.log(f"rest -> hp={st['hp']} clock={st['clock']}")
        except Exception as exc:  # noqa: BLE001 — a human reports the snag
            rec.check(f"casual action {i} did not crash the page", False,
                      "Major", f"action roll={roll:.2f} raised {type(exc).__name__}: {exc}")
            break
    rec.observe("actions_attempted", i + 1 if 'i' in dir() else 120)
    rec.observe("dead_ends", dead_ends)
    rec.observe("final_clock", st["clock"])
    rec.observe("final_kills", st["kills"])
    rec.observe("final_hp", st["hp"])
    ok, why = sane_numbers(st)
    rec.check("casual play ends with sane numbers", ok, "Blocker", why)
    rec.check("casual play never softlocked (state stayed playable)",
              st["runState"] in ("playing", "stairs", "dead", "extracted"),
              "Blocker", f"final state={st['runState']} hp={st['hp']} clock={st['clock']}")
    rec.note("wall bumps give no feedback",
             "Minor" if dead_ends else "Note",
             f"{dead_ends} move attempts changed nothing at all (position "
             f"and clock both identical) — a human notices a wall bump "
             f"produces no log line, no sound, no shake. See game.js "
             f"doMove blocked path (returns blocked without logging).")
    # Wall bump, deliberately: try directions until one moves or all
    # are blocked; either outcome must leave sane, playable state.
    st = get_state(page)
    if st["runState"] == "playing":
        before_pos = (st["x"], st["y"])
        moved = False
        for dx, dy in KEY_FOR:
            s2 = step(page, dx, dy, wait_ms=60)
            if (s2["x"], s2["y"]) != before_pos:
                moved = True
                st = s2
                break
            st = s2
        ok2, why2 = sane_numbers(st)
        rec.check("bumping a wall does not move or corrupt state",
                  ok2 and (moved or (st["x"], st["y"]) == before_pos),
                  "Minor",
                  f"moved={moved} before={before_pos} after=({st['x']},{st['y']}) "
                  f"sane: {why2}")


# --------------------------------------------------------- completionist
def run_completionist(page, rec, shot_dir):
    st = get_state(page)
    rec.observe("start_grid_counts", grid_counts(st["grid"]))
    rec.observe("start_enemy_types", sorted({e["type"] for e in st["enemies"]}))
    rec.observe("start_pickup_kinds", sorted({p["kind"] for p in st["pickups"]}))
    rec.log(f"start depth={st['depth']} hp={st['hp']} at ({st['x']},{st['y']})")
    # 1. Collect one pickup, if any on this floor. A pickup counts as
    # collected when the pickup count drops OR any inventory field
    # rises (salvage, health, food, components, dataChip/codex) —
    # different pickup kinds credit different fields (Phase 2).
    def inventory(st):
        return (st["carried"], st["healthCells"], st["foodCells"],
                st.get("components", 0), st.get("dataChips", 0),
                len(st.get("codex", [])))
    collected = False
    pickup_evidence = ""
    for attempt in range(3):
        st = get_state(page)
        if not st["pickups"]:
            break
        pk = st["pickups"][0]
        blocked = {(e["x"], e["y"]) for e in st["enemies"]}
        path = bfs_path(st["grid"], (st["x"], st["y"]), (pk["x"], pk["y"]), blocked)
        if path is not None:
            rec.observe("first_pickup_path_len", len(path))
            rec.observe("first_pickup_kind", pk["kind"])
        if path is None:
            rec.note("pickup unreachable by BFS", "Major",
                     f"pickup {pk} on depth {st['depth']} has no walkable path")
            break
        before_n, before_inv = len(st["pickups"]), inventory(st)
        st = walk_path(page, path, rec)
        st = get_state(page)
        pickup_evidence = (f"attempt {attempt}: target {pk} path={len(path)} "
                           f"pickups {before_n} -> {len(st['pickups'])} "
                           f"inventory {before_inv} -> {inventory(st)} "
                           f"pos=({st['x']},{st['y']}) state={st['runState']}")
        rec.log(pickup_evidence)
        if len(st["pickups"]) < before_n or inventory(st) != before_inv:
            collected = True
            rec.log(f"collected {pk['kind']} at ({pk['x']},{pk['y']})")
            break
        if _adjacent_enemy(st):
            st = attack_adjacent_until_dead(page, rec)
    rec.check("a pickup can be walked to and collected", collected,
              "Major", pickup_evidence or "no pickups on this floor")
    # 2. Fight at least one enemy if one is reachable, else note it.
    fought = st["kills"] > 0
    if not fought:
        st = get_state(page)
        if st["enemies"]:
            e = st["enemies"][0]
            blocked = {(o["x"], o["y"]) for o in st["enemies"] if o is not e}
            # walk to any tile adjacent to the enemy
            for dx, dy in KEY_FOR:
                ax, ay = e["x"] + dx, e["y"] + dy
                path = bfs_path(st["grid"], (st["x"], st["y"]), (ax, ay), blocked)
                if path:
                    st = walk_path(page, path, rec)
                    st = attack_adjacent_until_dead(page, rec)
                    break
            fought = st["kills"] > 0
    rec.check("an enemy can be fought and killed", fought, "Major",
              f"kills={st['kills']} hp={st['hp']} state={st['runState']}")
    # 3. Stairs -> Descend, banking exactly 25% (floored).
    for attempt in range(2):
        st = get_state(page)
        if st["runState"] == "dead":
            break
        stairs = find_stairs(st)
        if stairs is None:
            break
        blocked = {(e["x"], e["y"]) for e in st["enemies"]}
        path = bfs_path(st["grid"], (st["x"], st["y"]), stairs, blocked)
        if path is not None and "stairs_path_len" not in rec.metrics:
            rec.observe("stairs_path_len", len(path))
        if path is None:
            rec.note("stairs unreachable by BFS", "Blocker",
                     f"depth {st['depth']} stairs at {stairs} has no path")
            break
        st = walk_path(page, path, rec, stop_on_adjacent_enemy=False)
        # A step that attacks instead of moving leaves the rest of the
        # path stale (it was planned from the old position), so re-plan
        # from the current position until we arrive or give up — an
        # enemy that moved onto the path, or died on it, must not end
        # the leg with the player standing next to the stairs.
        guard = 0
        while st["runState"] == "playing" and guard < 8:
            cur = get_state(page)
            if (cur["x"], cur["y"]) == stairs:
                st = cur
                break
            if _adjacent_enemy(cur):
                st = attack_adjacent_until_dead(page, rec)
                cur = get_state(page)
                if cur["runState"] != "playing":
                    st = cur
                    break
            path = bfs_path(cur["grid"], (cur["x"], cur["y"]), stairs,
                            {(e["x"], e["y"]) for e in cur["enemies"]})
            if not path:
                break
            st = walk_path(page, path, rec, stop_on_adjacent_enemy=False)
            guard += 1
        st = get_state(page)
        if st["runState"] != "stairs":
            rec.note("did not reach the stairs menu", "Major",
                     f"after walk: state={st['runState']} at ({st['x']},{st['y']}) "
                     f"stairs={stairs} hp={st['hp']}")
            break
        menu = _stairs_panel_text(page) if _stairs_panel_visible(page) \
            else "stairs panel NOT visible"
        rec.log(f"stairs panel: {menu}")
        carried_before = st["carried"]
        banked_before = st["banked"]
        if attempt == 0:
            _click_stairs_button(page, "#btn-stairs-descend")
            st = get_state(page)
            expected = banked_before + carried_before // 4
            rec.check("Descend banks exactly 25% (floored)",
                      st["banked"] == expected and st["depth"] == 2,
                      "Blocker",
                      f"carried was {carried_before}, banked {banked_before} -> "
                      f"{st['banked']} (expected {expected}), depth={st['depth']}")
        else:
            _click_stairs_button(page, "#btn-stairs-extract")
            st = get_state(page)
            rec.check("Extract keeps all carried salvage in banked total",
                      st["banked"] == banked_before + carried_before
                      and st["runState"] == "extracted",
                      "Blocker",
                      f"carried was {carried_before}, banked {banked_before} -> "
                      f"{st['banked']}, state={st['runState']}")
            shot = shot_dir / "completionist-extracted.png"
            page.screenshot(path=str(shot))
            rec.log(f"extracted screenshot: {shot}")
            break
        # heal up before the next leg if hurt and holding cells:
        # use a health cell through the wrench popup (quickslots gone).
        st = get_state(page)
        if st["hp"] < 50 and st["healthCells"] > 0:
            _use_item_via_wrench(page, "health cell")
    ok, why = sane_numbers(get_state(page))
    rec.check("completionist run ends with sane numbers", ok, "Blocker", why)


# ------------------------------------------------------------- bug hunter
def run_bug_hunter(page, rec):
    st = get_state(page)
    rec.log(f"start hp={st['hp']} clock={st['clock']}")
    # Rapid repeated taps: 60 ArrowRight key presses as fast as
    # Playwright allows (there is no D-pad any more; keyboard moves
    # are the same input path). A death or stairs state mid-spam is
    # gameplay, not corruption — keys are ignored there by the game.
    try:
        for _ in range(60):
            page.keyboard.press("ArrowRight")
        page.wait_for_timeout(500)
        st = get_state(page)
        ok, why = sane_numbers(st)
        rec.check("60 rapid move-key taps do not corrupt state", ok, "Blocker", why)
    except Exception as exc:  # noqa: BLE001
        rec.check("60 rapid move-key taps do not crash", False, "Blocker", str(exc))
    # Modal spam: open Bag, hammer dock buttons, close. A human tap on
    # a dock button while the modal is up should hit the modal overlay,
    # not the button underneath — Playwright timing out on the obscured
    # button is the modal correctly blocking, not a crash.
    try:
        click_button(page, "#btn-inventory")
        was_modal = modal_visible(page)
        blocked = 0
        for sel in ("#btn-wait", "#btn-search", "#btn-log"):
            try:
                page.locator(sel).first.click(timeout=800)
            except Exception:  # noqa: BLE001 — obscured by modal = blocked
                blocked += 1
            page.wait_for_timeout(100)
        if modal_visible(page):
            click_button(page, "#modal-btns button")
        rec.observe("dock_clicks_blocked_by_modal", blocked)
        st = get_state(page)
        ok, why = sane_numbers(st)
        rec.check("clicking dock buttons while Bag modal is open is safe",
                  ok and was_modal, "Major",
                  f"modal was open={was_modal}, dock clicks blocked by "
                  f"overlay={blocked}/3, still sane: {why}")
    except Exception as exc:  # noqa: BLE001
        rec.check("modal spam does not crash", False, "Major", str(exc))
    # Wait / Rest spam. Spamming Wait can legitimately kill the player
    # (enemies act, starving drains) — a death modal covering the dock
    # is gameplay, not a crash. Recover through it and keep testing.
    try:
        died = False
        for _ in range(30):
            try:
                page.locator("#btn-wait").first.click(timeout=1000)
                page.wait_for_timeout(100)
            except Exception:  # noqa: BLE001 — modal over the dock?
                if modal_visible(page):
                    died = True
                    break
                raise
            if modal_visible(page):
                died = True
                break
        if modal_visible(page):
            # Death (or hub) modal: take the New Expedition way out.
            try:
                _click_modal_button(page, "New Expedition")
            except Exception:  # noqa: BLE001
                pass
        else:
            # Rest spam: Rest lives in the Menu modal — open it, hit
            # Rest, repeat. A death modal mid-rest ends the loop.
            for _ in range(30):
                if not _rest_via_menu(page):
                    died = True
                    break
                page.wait_for_timeout(100)
                st_tmp = get_state(page)
                if st_tmp["runState"] != "playing":
                    died = True
                    break
            if modal_visible(page):
                try:
                    _click_modal_button(page, "New Expedition")
                except Exception:  # noqa: BLE001
                    pass
        st = get_state(page)
        rec.observe("died_during_wait_spam", died)
        rec.observe("power_state_after_spam", st.get("powerState"))
        ok, why = sane_numbers(st)
        rec.check("30x Wait + Rest spam keeps sane state", ok, "Major",
                  f"died during spam={died} recovered state={st['runState']} {why}")
    except Exception as exc:  # noqa: BLE001
        rec.check("Wait/Rest spam does not crash", False, "Major", str(exc))
    # Item use / refusal paths, via the wrench use-item popup
    # (quickslots are gone). Prefer an item with none held so the
    # refusal path is exercised; fall back to a health cell at full
    # HP, which refuses for a different reason. A refusal must cost
    # nothing and must say so in the log.
    try:
        st = get_state(page)
        if st["runState"] == "playing":
            hp0 = st["hp"]
            inv0 = (st["healthCells"], st["foodCells"])
            if st.get("repairKits", 0) == 0:
                label, phrases = "repair kit", ("no repair kits",)
            elif st["foodCells"] == 0:
                label, phrases = "food", ("no food",)
            elif st["healthCells"] == 0:
                label, phrases = "health cell", ("no health cells",)
            elif hp0 >= st["maxHp"]:
                label, phrases = "health cell", ("already full HP",)
            else:
                label, phrases = None, ()
            if label is None:
                rec.env("item refusal gives feedback",
                        "player held every item type and was hurt; no "
                        "refusal path was available to exercise")
            else:
                _use_item_via_wrench(page, label)
                st = get_state(page)
                tail = " ".join(st["logTail"])
                gave_feedback = any(p in tail for p in phrases)
                unchanged = (st["healthCells"], st["foodCells"]) == inv0 \
                    and st["hp"] == hp0
                rec.observe("unheld_item_gave_feedback", gave_feedback)
                rec.check("using an unheld item (or at full HP) gives "
                          "feedback and costs nothing",
                          gave_feedback and unchanged, "Minor",
                          f"used {label}: hp {hp0} -> {st['hp']}, "
                          f"cells {inv0} -> {(st['healthCells'], st['foodCells'])}, "
                          f"log tail: {st['logTail']}")
    except Exception as exc:  # noqa: BLE001
        rec.check("item refusal paths do not crash", False, "Minor", str(exc))
    # Out-of-bounds canvas taps (corners) must not crash or corrupt.
    try:
        box = page.locator("#game").bounding_box()
        for px, py in ((box["x"] + 2, box["y"] + 2),
                       (box["x"] + box["width"] - 2, box["y"] + box["height"] - 2)):
            page.mouse.click(px, py)
            page.wait_for_timeout(150)
        st = get_state(page)
        ok, why = sane_numbers(st)
        rec.check("out-of-bounds canvas taps are harmless", ok, "Minor", why)
    except Exception as exc:  # noqa: BLE001
        rec.check("out-of-bounds taps do not crash", False, "Minor", str(exc))
    # Save/load (Phase 2): autosave writes scrapdungeon.hub.v1 and
    # scrapdungeon.run.v1; reload must offer the hub screen with
    # Continue, and Continue must resume the same run.
    try:
        st = get_state(page)
        keys = page.evaluate("() => Object.keys(localStorage)")
        # The run key is only written while a run is resumable
        # (playing/stairs); dead/extracted runs clear it by design.
        need_run = st["runState"] in ("playing", "stairs")
        rec.check("autosave wrote hub + run keys to localStorage",
                  "scrapdungeon.hub.v1" in keys
                  and ("scrapdungeon.run.v1" in keys) == need_run,
                  "Major",
                  f"keys={keys} state={st['runState']} depth={st['depth']} hp={st['hp']} "
                  f"(run key expected={need_run})")
        if st["runState"] == "playing":
            hp0, depth0, clock0 = st["hp"], st["depth"], st["clock"]
            page.reload()
            page.wait_for_timeout(1500)
            hub_modal = modal_visible(page)
            hub_text = modal_text(page) if hub_modal else ""
            # Continue is a BUTTON label (modal-btns), not body text.
            hub_btns = page.evaluate(
                "() => Array.from(document.querySelectorAll('#modal-btns button'))"
                ".map(b => b.textContent).join(' | ')") if hub_modal else ""
            rec.check("reload shows the hub screen with a Continue option",
                      hub_modal and "Continue" in hub_btns, "Major",
                      f"modal visible={hub_modal} buttons=[{hub_btns}] "
                      f"text={hub_text[:160]}")
            if hub_modal and "Continue" in hub_btns:
                _click_modal_button(page, "Continue")
                st = get_state(page)
                rec.check("Continue resumes the saved run",
                          st["runState"] in ("playing", "stairs")
                          and st["hp"] == hp0 and st["depth"] == depth0
                          and st["clock"] == clock0,
                          "Blocker",
                          f"before reload hp={hp0} depth={depth0} clock={clock0} -> "
                          f"after Continue hp={st['hp']} depth={st['depth']} "
                          f"clock={st['clock']} state={st['runState']}")
            # A second reload must still yield a playable game.
            page.reload()
            page.wait_for_timeout(1500)
            st = get_state(page)
            rec.check("second reload mid-run yields a playable game",
                      st["runState"] in ("playing", "stairs", "dead", "extracted"),
                      "Major", f"state after reload={st['runState']} hp={st['hp']}")
    except Exception as exc:  # noqa: BLE001
        rec.check("save/load round-trip does not crash", False, "Major",
                  f"{type(exc).__name__}: {exc}")


# ------------------------------------------------------------------ mobile
def run_mobile(page, rec, shot_dir):
    # Tap targets: every dock button, measured on screen. (Quickslots
    # and the D-pad are gone; Rest lives in the Menu modal, so it has
    # no dock button to measure.)
    selectors = {
        "Wait": "#btn-wait", "Use item": "#btn-wrench",
        "Menu": "#btn-menu", "Search": "#btn-search",
        "Bag": "#btn-inventory", "Recenter": "#btn-recenter",
        "Log": "#btn-log",
        # Quickslot bar (ammo slice, 2026-10-27): same 44px bar.
        "FIRE": "#btn-fire", "+HP slot": "#qs-health",
        "FOOD slot": "#qs-food", "KIT slot": "#qs-repair",
    }
    small = []
    for name, sel in selectors.items():
        box = page.locator(sel).first.bounding_box()
        if not box:
            rec.check(f"tap target visible: {name}", False, "Major",
                      f"{sel} has no bounding box at 390px width")
            continue
        small.append((name, box))
        rec.check(f"tap target >= ~44px: {name}",
                  box["width"] >= 40 and box["height"] >= 40, "Major",
                  f"{name}: {box['width']:.0f}x{box['height']:.0f}px")
    if small:
        name, box = min(small, key=lambda nb: min(nb[1]["width"], nb[1]["height"]))
        rec.observe("min_tap_target", {"name": name,
                                       "w": round(box["width"]),
                                       "h": round(box["height"])})
    # Horizontal overflow at phone width.
    ov = page.evaluate(
        "() => ({scroll: document.documentElement.scrollWidth, "
        "client: document.documentElement.clientWidth})")
    rec.check("no horizontal overflow at 390px",
              ov["scroll"] <= ov["client"] + 1, "Major",
              f"scrollWidth={ov['scroll']} clientWidth={ov['client']}")
    rec.observe("horizontal_overflow_px", ov["scroll"] - ov["client"])
    # HUD fit: the one-line HUD clips inside overflow:hidden, so the
    # document check above cannot see it. Measure the HUD itself, and
    # require the last segment (Power) to sit inside the HUD box.
    hud = page.evaluate(
        "() => { const h = document.getElementById('hud');"
        " const p = document.getElementById('hud-power');"
        " const hr = h.getBoundingClientRect(), pr = p.getBoundingClientRect();"
        " return {scroll: h.scrollWidth, client: h.clientWidth,"
        " hudRight: hr.right, powerRight: pr.right, powerText: p.textContent}; }")
    rec.check("HUD fits on one line at 390px (all segments incl. Power visible)",
              hud["scroll"] <= hud["client"] + 1 and hud["powerRight"] <= hud["hudRight"] + 1, "Major",
              f"hud scrollWidth={hud['scroll']} clientWidth={hud['client']} powerRight={hud['powerRight']:.0f} hudRight={hud['hudRight']:.0f} power={hud['powerText']!r}")
    rec.observe("hud_fit", hud)
    # The log is a modal overlay now, not a collapsible #log element.
    # What a phone player needs instead: the latest log line visible
    # without opening anything (the transient overlay), plus a Log
    # button that opens the full log as a modal and closes cleanly.
    click_button(page, "#btn-wait")
    st = get_state(page)
    transient = page.evaluate(
        "() => ({text: document.getElementById('transient-msg').textContent, "
        "shown: document.getElementById('transient-msg').classList.contains('show')})")
    last_line = st["logTail"][-1] if st["logTail"] else ""
    shows_last = transient["shown"] and transient["text"] == last_line
    rec.observe("transient_shows_last_line", shows_last)
    rec.check("latest log line shows as a transient overlay on phones",
              shows_last, "Minor",
              f"transient={transient!r} last log line={last_line!r}")
    click_button(page, "#btn-log")
    log_title = page.evaluate(
        "() => document.getElementById('modal-title').textContent")
    log_modal_ok = modal_visible(page) and log_title == "Log"
    rec.observe("log_modal_opens", log_modal_ok)
    rec.check("Log button opens the full log as a modal", log_modal_ok,
              "Minor", f"modal visible={modal_visible(page)} title={log_title!r}")
    _close_modal(page)
    rec.check("Log modal closes back to play",
              not modal_visible(page), "Minor",
              f"modal visible after Close={modal_visible(page)}")
    # Double-tap zoom guard: viewport meta must forbid user scaling.
    meta = page.evaluate(
        "() => document.querySelector('meta[name=viewport]')?.content || 'MISSING'")
    rec.check("viewport meta disables double-tap zoom breakage",
              "user-scalable=no" in meta and "maximum-scale=1" in meta,
              "Minor", f"viewport meta: {meta}")
    # Dock visible after scrolling to the bottom.
    page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(300)
    dock = page.locator("#dock").bounding_box()
    vp = page.viewport_size
    rec.check("bottom dock is on screen at phone size",
              dock is not None and dock["y"] < vp["height"], "Major",
              f"dock box={dock} viewport={vp}")
    shot = shot_dir / "mobile.png"
    page.screenshot(path=str(shot))
    rec.log(f"mobile screenshot: {shot}")
    # Touch-only play: tap a WALKABLE adjacent tile via touchscreen.
    # (An earlier version of this check tapped east unconditionally and
    # failed whenever that tile was a wall — a tester bug, not a game
    # bug. The tile is now chosen from the live grid.)
    st = get_state(page)
    if st["runState"] == "playing":
        from .common import WALKABLE
        target = None
        for dx, dy in KEY_FOR:
            nx, ny = st["x"] + dx, st["y"] + dy
            if st["grid"][ny][nx] in WALKABLE and not any(
                    e["x"] == nx and e["y"] == ny for e in st["enemies"]):
                target = (dx, dy)
                break
        if target is None:
            rec.env("touch tap on an adjacent tile",
                    "no walkable adjacent tile from the spawn in this run")
        else:
            dx, dy = target
            # The dock check above scrolled to the bottom, which leaves
            # the canvas partly above the viewport: a tap computed from
            # its box would land off-screen. Bring it back first.
            page.locator("#game").scroll_into_view_if_needed()
            page.wait_for_timeout(300)
            # Square-grid camera: the target tile's screen centre comes
            # from the live tileOrigin/TILE math, not iso offsets.
            pt = _adjacent_tile_screen_point(page, dx, dy)
            tx, ty = pt["x"], pt["y"]
            try:
                page.touchscreen.tap(tx, ty)
            except Exception:  # noqa: BLE001 — fall back to a mouse tap
                page.mouse.click(tx, ty)
            page.wait_for_timeout(400)
            st2 = get_state(page)
            rec.observe("touch_tap_moved",
                        (st2["x"], st2["y"]) != (st["x"], st["y"])
                        or st2["clock"] != st["clock"]
                        or st2["kills"] != st["kills"])
            rec.check("touch tap on an adjacent tile moves or attacks",
                      (st2["x"], st2["y"]) != (st["x"], st["y"])
                      or st2["clock"] != st["clock"] or st2["kills"] != st["kills"],
                      "Major",
                      f"tap direction {target}: player ({st['x']},{st['y']}) -> "
                      f"({st2['x']},{st2['y']}) clock {st['clock']} -> {st2['clock']}")
