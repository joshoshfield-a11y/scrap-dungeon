#!/usr/bin/env python3
"""Re-shoot Phase 4 station screenshots as element captures.

The full-page shots in verify_phase4.py catch only the top of the
long hub modal. This script replays the same seeded-hub flow (die ->
hub), scrolls the Loadout and Salvager station sections into view,
and captures each station element, overwriting
phase4-loadout.png / phase4-breakdown.png. It performs one real
breakdown first so the Salvager shot shows the post-breakdown
materials (103 wire, +1 core). Exits 0 only if both captures land
and the breakdown applied.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from testers.common import GAME_URL  # noqa: E402
import verify_phase4 as v4  # noqa: E402 (helpers only; main() not run)

HERE = Path(__file__).parent
SHOTS = HERE / "reports" / "screenshots"
SEED_HUB = json.loads((HERE / "p4-seed-hub.json").read_text())


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        ctx.add_init_script(
            "const hubJson = " + json.dumps(SEED_HUB) + ";\n"
            "for (const [k, v] of Object.entries(hubJson))\n"
            "  localStorage.setItem(k, v);")
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(m.text)
                if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(GAME_URL)
        page.wait_for_timeout(1500)

        st = v4.die_deliberately(page)
        assert st["runState"] == "dead", st["runState"]
        v4.go_to_hub(page)

        # Loadout: click the Piercing stepper, then capture the station.
        ok = page.evaluate("""() => {
          const b = document.querySelector('button[data-loadout-plus="piercing"]');
          if (b) { b.click(); return true; } return false;
        }""")
        assert ok, "loadout stepper missing"
        page.wait_for_timeout(400)
        loadout = page.locator(".hub-stations > div",
                               has_text="Loadout — starting ammo")
        loadout.scroll_into_view_if_needed()
        page.wait_for_timeout(300)
        loadout.screenshot(path=str(SHOTS / "phase4-loadout.png"))

        # Salvager: run one confirmed breakdown, then capture the station.
        ok = v4.click_row_button(page, "Components held",
                                 "Break down 1 component")
        assert ok, "breakdown button missing"
        page.wait_for_timeout(300)
        ok = v4.click_row_button(page, "", "Break it down")
        assert ok, "breakdown confirm missing"
        page.wait_for_timeout(400)
        st = page.evaluate(v4.STATE_JS)
        assert st["hub"]["components"] == 19, st["hub"]
        assert st["hub"]["materials"]["wire"] == 103, st["hub"]
        salv = page.locator(".hub-stations > div",
                            has_text="The Salvager — exchange")
        salv.scroll_into_view_if_needed()
        page.wait_for_timeout(300)
        salv.screenshot(path=str(SHOTS / "phase4-breakdown.png"))
        print("loadout + breakdown captures ok; console errors:", errors or "none")
        browser.close()
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
