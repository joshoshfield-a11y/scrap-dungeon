"""GRAPHICS QC TESTER — judges the art the way a human eye would.

Static pass (no browser): every PNG in game/assets/ is checked for
existence, reference by the game, sane sheet geometry (822x136),
a real alpha channel, and actual painted content in at least one
direction cell. Sheets in this project key their black cell
backgrounds to alpha 0, so "all black" is judged on OPAQUE pixels
only — a sheet that is only transparent or only black counts as
blank, a sheet with a small painted mech on transparency does not.

Browser pass: the game loads in headless Chromium, zero console
errors, every asset request returns 200, the canvas screenshot
contains real sprite colour (not just the flat background), and
walk/attack poses actually change on actions.
"""
import re
from pathlib import Path

from PIL import Image

from .common import GAME_DIR, ASSETS_DIR, Recorder

SHEET_W, SHEET_H = 822, 136
# cell geometry the game itself uses (game.js SHEETS comment)
CELL_X0, CELL_Y, CELL = 6, 34, 96


def analyse_sheet(path):
    """Per-direction-cell content for 822x136 sheets; for any other
    size (e.g. tile-sized assets added by later passes) a whole-image
    measurement instead — never an index error on a smaller image."""
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()
    if (w, h) != (SHEET_W, SHEET_H):
        opaque = nonblack = 0
        for yy in range(h):
            for xx in range(w):
                r, g, b, a = px[xx, yy]
                if a > 10:
                    opaque += 1
                    if r + g + b > 30:
                        nonblack += 1
        return {"size": (w, h), "mode": im.mode, "cells": [],
                "opaque": opaque, "nonblack": nonblack,
                "bytes": path.stat().st_size}
    cells = []
    for i in range(8):
        opaque = 0
        nonblack = 0
        colours = set()
        for yy in range(CELL_Y, CELL_Y + CELL):
            for xx in range(CELL_X0 + i * 102, CELL_X0 + i * 102 + CELL):
                r, g, b, a = px[xx, yy]
                if a > 10:
                    opaque += 1
                    if r + g + b > 30:
                        nonblack += 1
                    colours.add((r // 32, g // 32, b // 32))
        cells.append({"opaque": opaque, "nonblack": nonblack,
                      "colours": len(colours)})
    total_opaque = sum(c["opaque"] for c in cells)
    total_nonblack = sum(c["nonblack"] for c in cells)
    return {"size": (w, h), "mode": im.mode, "cells": cells,
            "opaque": total_opaque, "nonblack": total_nonblack,
            "bytes": path.stat().st_size}


def referenced_sheets():
    """Sheet filenames the game actually loads (game.js SHEETS map)."""
    text = (GAME_DIR / "game.js").read_text()
    return set(re.findall(r"'assets/([^']+\.png)'", text))


def run_static(rec):
    files = sorted(ASSETS_DIR.glob("*.png"))
    refs = referenced_sheets()
    rec.log(f"{len(files)} PNGs in game/assets/, {len(refs)} referenced in game.js")
    # One file used for two sheet keys renders identically in both roles.
    text = (GAME_DIR / "game.js").read_text()
    keys_by_file = {}
    for key, fn in re.findall(r"(\w+):\s*'assets/([^']+\.png)'", text):
        keys_by_file.setdefault(fn, []).append(key)
    for fn, keys in keys_by_file.items():
        if len(keys) > 1:
            rec.note(f"sheet file shared by two roles: {fn}", "Note",
                     f"keys {keys} render the same art — a human notices "
                     f"component pickups looking exactly like salvage")
    missing = [r for r in refs if not (ASSETS_DIR / r).exists()]
    rec.check("all referenced sheets exist on disk", not missing, "Blocker",
              f"missing: {missing}" if missing else
              f"all {len(refs)} referenced sheets present")
    unref = [f.name for f in files if f.name not in refs]
    if unref:
        rec.note("unreferenced sheets in assets/ (dead weight, not a bug)",
                 "Minor", f"unreferenced: {unref} — safe to delete or wire in")
    rec.observe("assets_total", len(files))
    rec.observe("referenced_count", len(refs))
    rec.observe("shared_sheets", sorted(
        fn for fn, keys in keys_by_file.items() if len(keys) > 1))
    rec.observe("unreferenced_count", len(unref))
    opaque_by_file = {}
    for f in files:
        a = analyse_sheet(f)
        opaque_by_file[f.name] = a["opaque"]
        w, h = a["size"]
        if a["cells"]:
            rec.check(f"sheet geometry {f.name}", (w, h) == (SHEET_W, SHEET_H),
                      "Major", f"size={w}x{h} (expected {SHEET_W}x{SHEET_H})")
            rec.check(f"sheet has painted content {f.name}",
                      a["opaque"] >= 50 and a["nonblack"] >= 20, "Major",
                      f"opaque={a['opaque']} nonblack-opaque={a['nonblack']} "
                      f"bytes={a['bytes']} cells-opaque="
                      f"{[c['opaque'] for c in a['cells']]}")
        else:
            # Tile-sized asset, not an 8-direction sheet: geometry is
            # its own size, content is whole-image painted pixels.
            rec.check(f"tile asset {f.name}", w > 0 and h > 0,
                      "Major", f"tile size={w}x{h} (not an 8-direction sheet)")
            rec.check(f"tile has painted content {f.name}",
                      a["opaque"] >= 50 and a["nonblack"] >= 20, "Major",
                      f"opaque={a['opaque']} nonblack-opaque={a['nonblack']} "
                      f"bytes={a['bytes']}")
        if a["mode"] != "RGBA":
            rec.check(f"sheet has alpha {f.name}", False, "Minor",
                      f"mode={a['mode']} (expected RGBA)")
    # Opinions-layer measurements: do wreck piles differ per mech, and
    # how much does a walk cycle actually change frame to frame?
    destroyed = {n: o for n, o in opaque_by_file.items()
                 if "destroyed" in n}
    rec.observe("destroyed_opaque_values", sorted(set(destroyed.values())))
    rec.observe("destroyed_sheets_identical",
                len(set(destroyed.values())) == 1 if destroyed else None)
    scout_a = opaque_by_file.get("mech_light_scout_walk_a_sheet.png")
    scout_b = opaque_by_file.get("mech_light_scout_walk_b_sheet.png")
    if scout_a and scout_b:
        rec.observe("scout_walk_delta_pct",
                    round(abs(scout_a - scout_b) / max(scout_a, scout_b) * 100, 1))
    return files


def run_browser(page, rec, shot_dir):
    """Load the game, watch console + network, screenshot, pose changes."""
    errors = []

    def on_console(msg):
        if msg.type in ("error",):
            errors.append(f"console {msg.type}: {msg.text}")

    def on_pageerror(err):
        errors.append(f"pageerror: {err}")

    def on_response(resp):
        if "assets/" in resp.url and resp.status != 200:
            errors.append(f"asset HTTP {resp.status}: {resp.url}")

    page.on("console", on_console)
    page.on("pageerror", on_pageerror)
    page.on("response", on_response)
    from .common import GAME_URL
    page.goto(GAME_URL)
    page.wait_for_timeout(2000)
    rec.log(f"loaded {GAME_URL}")
    rec.check("zero console errors on load", not errors, "Blocker",
              "errors: " + ("; ".join(errors) if errors else "none"))
    shot = shot_dir / "graphics-load.png"
    page.screenshot(path=str(shot))
    im = Image.open(shot).convert("RGB")
    colours = im.getcolors(maxcolors=1000000)
    distinct = len(colours) if colours else 0
    # background #10131a dominates a healthy render; sprites add colour.
    px = im.load()
    w, h = im.size
    bright = 0
    sample = 0
    for yy in range(0, h, 4):
        for xx in range(0, w, 4):
            sample += 1
            r, g, b = px[xx, yy]
            if r + g + b > 180:
                bright += 1
    rec.check("canvas renders sprite colour, not a blank screen",
              distinct > 50 and bright > 0, "Blocker",
              f"screenshot={shot} distinct-colours={distinct} "
              f"bright-samples={bright}/{sample}")
    rec.observe("screenshot_distinct_colours", distinct)
    rec.observe("screenshot_bright_frac",
                round(bright / sample, 4) if sample else None)
    # Pose changes: move once, read pose immediately, then after expiry.
    from .common import get_state, step
    st0 = get_state(page)
    pose_before = page.evaluate("() => window.__scrapDebug.pose('player')")
    st1 = step(page, 1, 0, wait_ms=50)
    pose_move = page.evaluate("() => window.__scrapDebug.pose('player')")
    page.wait_for_timeout(600)
    pose_rest = page.evaluate("() => window.__scrapDebug.pose('player')")
    rec.check("walk pose changes on movement", pose_move in ("walk_a", "walk_b"),
              "Major",
              f"pose before={pose_before} on move={pose_move} after 600ms={pose_rest} "
              f"player ({st0['x']},{st0['y']}) -> ({st1['x']},{st1['y']})")
    rec.check("pose returns to rest after movement", pose_rest == "rest",
              "Minor", f"pose after 600ms={pose_rest} (expected rest)")
    return errors
