#!/usr/bin/env python3
"""One-off verification for the 2026-10-28 Armorer ammo-pack slice.

Drives the real game in headless Chromium (Playwright, ML venv) through
real clicks only (no state mutation from the test):
  - legacy hub save (no ammo key) loads, Armorer shows the ammo recipe
  - Craft Ammo pack deducts 8 salvage, stocks 6 ammo
  - second craft with 2 salvage left fails honestly, nothing moves
  - New Expedition loads up to 12 crafted ammo: HUD ammo 16 + 6 = 22
  - zero console errors, zero failed asset requests
Screenshots go to beta-testers/reports/screenshots/.
Exit 1 on any failure. Read-only against game/.
"""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
GAME_DIR = Path.home() / "workspace" / "scrap-dungeon" / "game"
GAME_URL = GAME_DIR.joinpath("index.html").as_uri()
SHOTS = HERE / "reports" / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

FAILURES = []
ERRORS = []
FAILED_REQS = []


def check(name, ok, evidence):
    print(("PASS " if ok else "FAIL ") + name + " | " + str(evidence))
    if not ok:
        FAILURES.append(name)


# Legacy hub: serialized shape WITHOUT the ammo key (pre-slice save).
LEGACY_HUB = {
    "banked": 10, "components": 0, "codex": [], "wreck": None,
    "lastExtracted": 0, "chassisTier": 0, "bankingTier": 0,
    "stockpile": {"health": 0, "food": 0, "repairKit": 0},
    "deepestDepth": 1,
}
SEED_JS = (
    "() => { localStorage.setItem('scrapdungeon.hub.v1', %s);"
    " localStorage.removeItem('scrapdungeon.run.v1'); }"
    % json.dumps(json.dumps(LEGACY_HUB))
)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    page = ctx.new_page()
    page.on("console", lambda m: ERRORS.append(m.text) if m.type == "error" else None)
    page.on("requestfailed", lambda r: FAILED_REQS.append(r.url))
    page.on("response", lambda r: FAILED_REQS.append(r.url) if r.status >= 400 else None)

    page.goto(GAME_URL)
    page.wait_for_timeout(600)
    # Seed AFTER load: init-script localStorage writes do not survive on
    # file:// origins in this Chromium; evaluate runs in the game's own
    # origin, so the seed sticks for the reload below.
    page.evaluate(
        """(hubJson) => {
          localStorage.setItem('scrapdungeon.hub.v1', hubJson);
          localStorage.removeItem('scrapdungeon.run.v1');
        }""", json.dumps(LEGACY_HUB))

    # Boot auto-starts a run; autosave wrote hub + run saves. Reload to
    # reach the hub screen exactly as a returning player would.
    page.reload()
    page.wait_for_timeout(600)
    # First reload after seeding starts a fresh run (run save was removed);
    # its autosave writes a resumable run save, so a second reload lands
    # on the hub screen.
    page.reload()
    page.wait_for_timeout(600)
    modal_text = page.evaluate(
        "() => document.getElementById('modal-title').textContent + '\\n' +"
        " document.getElementById('modal-body').innerText + '\\n' +"
        " (document.querySelector('.hub-stations') || {}).innerText || ''")
    check("hub screen on reload", "HUB" in modal_text, modal_text[:80])
    check("armorer ammo recipe listed",
          "Craft Ammo pack (8 salvage)" in modal_text, "recipe button present")

    # Craft once: 10 -> 2 banked, 0 -> 6 ammo.
    page.get_by_text("Craft Ammo pack (8 salvage)").click()
    page.wait_for_timeout(300)
    modal_text = page.evaluate(
        "() => document.getElementById('modal-title').textContent + '\\n' +"
        " document.getElementById('modal-body').innerText + '\\n' +"
        " (document.querySelector('.hub-stations') || {}).innerText || ''")
    check("craft deducts + stocks",
          "6 ammo" in modal_text and "Banked salvage: 2" in modal_text,
          [l for l in modal_text.split("\n") if "ammo" in l.lower() or "Banked" in l][:4])

    # Craft again with 2 salvage: honest failure, nothing moves.
    page.get_by_text("Craft Ammo pack (8 salvage)").click()
    page.wait_for_timeout(300)
    msg = page.evaluate(
        "() => (document.querySelector('.hub-stations > div') || {}).textContent || ''")
    modal_text = page.evaluate(
        "() => document.getElementById('modal-title').textContent + '\\n' +"
        " document.getElementById('modal-body').innerText + '\\n' +"
        " (document.querySelector('.hub-stations') || {}).innerText || ''")
    check("honest failure names shortfall",
          "salvage" in msg.lower() and "8" in msg, msg)
    check("failure moves nothing",
          "6 ammo" in modal_text and "Banked salvage: 2" in modal_text,
          "ammo 6, banked 2 after failed craft")

    page.screenshot(path=str(SHOTS / "ammo-craft-hub.png"))
    # New expedition: 16 starting + 6 crafted = 22 ammo.
    page.get_by_text("New Expedition").click()
    page.wait_for_timeout(400)
    ammo = page.evaluate("() => window.__scrapDebug.getState().ammo")
    check("new run loads crafted ammo", ammo == 22, "ammo = %s" % ammo)
    hud = page.evaluate("() => document.body.innerText")
    check("HUD shows ammo 22", "22" in hud, "ammo in HUD text")
    page.screenshot(path=str(SHOTS / "ammo-craft-run.png"))

    check("zero console errors", not ERRORS, ERRORS[:3])
    check("zero failed requests", not FAILED_REQS, FAILED_REQS[:3])
    browser.close()

print("FAILURES:", FAILURES)
raise SystemExit(1 if FAILURES else 0)
