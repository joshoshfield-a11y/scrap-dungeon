import json, subprocess, sys, time
from pathlib import Path

GAME = Path.home() / "workspace/scrap-dungeon/game"
OUT = GAME / "shots-dressing-2026-10-27"
OUT.mkdir(exist_ok=True)

srv = subprocess.Popen(
    [sys.executable, "-m", "http.server", "8766", "--bind", "127.0.0.1"],
    cwd=str(GAME), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
time.sleep(1.0)
try:
    from playwright.sync_api import sync_playwright

    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1280, "height": 800})
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto("http://127.0.0.1:8766/index.html")
        page.wait_for_timeout(2000)
        info = page.evaluate("""() => { const s = window.__scrapDebug.getState(); const f = s.floor;
          let free = 0; f.grid.forEach(r => r.forEach(t => { if (t === 'floor') free++; }));
          return {theme: f.theme, depth: s.depth, px: s.player.x, py: s.player.y,
                  dressing: f.dressing.length, free, ratio: +(f.dressing.length / free).toFixed(3),
                  block: f.circuitBlock, spawnDress: f.dressing.filter(d => d.x >= f.rooms[0].x && d.x < f.rooms[0].x + f.rooms[0].w && d.y >= f.rooms[0].y && d.y < f.rooms[0].y + f.rooms[0].h).length}; }""")
        print("spawn:", json.dumps(info))
        page.screenshot(path=str(OUT / "01-desktop-spawn.png"))
        for key in ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowDown", "ArrowDown", "ArrowRight"]:
            page.keyboard.press(key)
            page.wait_for_timeout(250)
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / "02-desktop-moved.png"))
        # Staged camera view only: teleport the player (via the debug hook)
        # to the circuit-block centre so the override tile is on screen.
        # No game code or state rules are involved; this shot is labelled
        # as staged in DRESSING-REPORT.md.
        page.evaluate("""() => { const s = window.__scrapDebug.getState(); const cb = s.floor.circuitBlock;
          s.player.x = cb.x + Math.floor(cb.w / 2); s.player.y = cb.y + Math.floor(cb.h / 2); }""")
        page.wait_for_timeout(600)
        page.screenshot(path=str(OUT / "03-desktop-circuit-block-staged.png"))
        ctx.close()
        ctx2 = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        page2 = ctx2.new_page()
        page2.on("console", lambda m: errors.append("mobile: " + m.text) if m.type == "error" else None)
        page2.on("pageerror", lambda e: errors.append("mobile: " + str(e)))
        page2.goto("http://127.0.0.1:8766/index.html")
        page2.wait_for_timeout(2000)
        info2 = page2.evaluate("""() => { const s = window.__scrapDebug.getState(); const f = s.floor;
          let free = 0; f.grid.forEach(r => r.forEach(t => { if (t === 'floor') free++; }));
          return {theme: f.theme, dressing: f.dressing.length, free, ratio: +(f.dressing.length / free).toFixed(3), block: f.circuitBlock}; }""")
        print("mobile spawn:", json.dumps(info2))
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
