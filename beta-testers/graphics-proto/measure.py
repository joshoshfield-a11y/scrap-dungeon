#!/usr/bin/env python3
"""Measure the graphics prototype: fps + screenshots, headless Chromium."""
import sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
SHOTS = HERE.parent / "reports" / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)
URL = (HERE / "index.html").as_uri()
errs = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(URL)
    page.wait_for_function("window.__proto", timeout=30000)
    res = page.evaluate("() => window.__proto")
    print("PROTO:", res)
    page.screenshot(path=str(SHOTS / "gfx-proto.png"), full_page=True)
    print("SCREENSHOT:", SHOTS / "gfx-proto.png")
    print("CONSOLE_ERRORS:", errs)
    browser.close()
