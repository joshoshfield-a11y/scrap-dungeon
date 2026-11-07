import json, subprocess, sys, time, os
from pathlib import Path

GAME = Path.home() / "workspace/scrap-dungeon/game"
OUT = GAME / "shots-2026-10-27"
OUT.mkdir(exist_ok=True)

# Serve game dir over HTTP so images/canvas load like a real page.
srv = subprocess.Popen(
    [sys.executable, "-m", "http.server", "8765", "--bind", "127.0.0.1"],
    cwd=str(GAME), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
time.sleep(1.0)
try:
    from playwright.sync_api import sync_playwright

    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        # Desktop
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto("http://127.0.0.1:8765/index.html")
        page.wait_for_timeout(2000)
        state0 = page.evaluate("() => { const s = window.__scrapDebug.getState(); return {x: s.player.x, y: s.player.y, hp: s.player.hp, depth: s.depth, enemies: s.enemies ? s.enemies.length : null, state: s.state}; }")
        print("spawn:", state0)
        page.screenshot(path=str(OUT / "01-desktop-spawn.png"))
        # Walk a few steps with arrows/WASD
        for key in ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowDown", "ArrowDown", "ArrowRight"]:
            page.keyboard.press(key)
            page.wait_for_timeout(250)
        state1 = page.evaluate("() => { const s = window.__scrapDebug.getState(); return {x: s.player.x, y: s.player.y, hp: s.player.hp, depth: s.depth, state: s.state}; }")
        print("moved:", state1)
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / "02-desktop-moved.png"))
        # Menu modal
        page.click("#btn-menu")
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / "03-desktop-menu.png"))
        ctx.close()
        # Mobile
        ctx2 = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        page2 = ctx2.new_page()
        page2.on("console", lambda m: errors.append("mobile: " + m.text) if m.type == "error" else None)
        page2.on("pageerror", lambda e: errors.append("mobile: " + str(e)))
        page2.goto("http://127.0.0.1:8765/index.html")
        page2.wait_for_timeout(2000)
        page2.screenshot(path=str(OUT / "04-mobile-spawn.png"))
        for key in ["ArrowRight", "ArrowRight", "ArrowDown"]:
            page2.keyboard.press(key)
            page2.wait_for_timeout(250)
        page2.wait_for_timeout(600)
        page2.screenshot(path=str(OUT / "05-mobile-moved.png"))
        ctx2.close()
        browser.close()
    print("console/page errors:", json.dumps(errors))
    for f in sorted(OUT.glob("*.png")):
        print(f.name, f.stat().st_size)
finally:
    srv.terminate()
