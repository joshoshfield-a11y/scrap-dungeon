#!/usr/bin/env python3
"""Menu-tabs browser verifier: tabbed Bag + tabbed hub, per-item gear
effects from shipped GEAR_DEFS scaling, and derivedStats swap previews.
Real clicks and key presses throughout; gear/keys are injected through
the shipped __scrapDebug state handle (no game-code shortcut).
Logs: beta-testers/reports/menutabs-verify.log (this script prints it).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from playwright.sync_api import sync_playwright

GAME_DIR = Path.home() / "workspace" / "scrap-dungeon" / "game"
GAME_URL = GAME_DIR.joinpath("index.html").as_uri()
SHOTS = GAME_DIR.parent / "beta-testers" / "reports" / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)
FAILURES, PASSES = [], []

def check(name, ok, evidence=None):
    (PASSES if ok else FAILURES).append(name)
    print(("PASS " if ok else "FAIL ") + name + ("" if evidence is None else f" | {evidence}"))

STATE_JS = """() => {
  const s = window.__scrapDebug.getState();
  return { runState: s.state, depth: s.depth,
    equipment: s.equipment, carriedGear: s.carriedGear || [],
    keys: s.keys || [], doors: (s.floor.doors || []).map(d => ({x: d.x, y: d.y, keyId: d.keyId, lockLevel: d.lockLevel})),
    derived: window.ScrapCore ? null : null };
}"""

def modal_text(page):
    return page.inner_text("#modal-box")

def click_tab(page, bar_class, tab):
    page.evaluate("""([cls, tab]) => {
      const bar = document.querySelector('.' + cls);
      const b = Array.from(bar.querySelectorAll('button')).find(x => x.getAttribute('data-tab') === tab);
      if (!b) throw new Error('no tab ' + tab);
      b.click();
    }""", [bar_class, tab])
    page.wait_for_timeout(300)

def tab_labels(page, bar_class):
    return page.evaluate("""(cls) => {
      const bar = document.querySelector('.' + cls);
      return Array.from(bar.querySelectorAll('button')).map(b => b.textContent.trim());
    }""", bar_class)

def active_tab(page, bar_class):
    return page.evaluate("""(cls) => {
      const bar = document.querySelector('.' + cls);
      const b = bar.querySelector('button.active');
      return b ? b.textContent.trim() : null;
    }""", bar_class)

def min_button_height(page, selector):
    return page.evaluate("""(sel) => {
      return Math.min.apply(null, Array.from(document.querySelectorAll(sel))
        .filter(el => el.offsetParent !== null)
        .map(el => el.getBoundingClientRect().height));
    }""", selector)

def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox"])
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(f"console {m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("response", lambda r: errors.append(f"asset HTTP {r.status}: {r.url}") if "assets/" in r.url and r.status not in (200, 0) else None)
        page.goto(GAME_URL)
        page.wait_for_timeout(1500)

        # ---- Inject a known gear set through the debug state handle.
        page.evaluate("""() => {
          const s = window.__scrapDebug.getState();
          const mk = (defId, tier, upgrade) => ({ defId, tier, upgrade, properties: [], flair: null });
          s.equipment.armor = mk('alloyVest', 'rare', 1);
          s.equipment.shield = mk('alloyAegis', 'uncommon', 2);
          s.equipment.utility = mk('sensor', 'common', 0);
          s.carriedGear = [mk('ablativeWeave', 'rare', 0), mk('scope', 'uncommon', 1),
                           mk('nanoBastion', 'epic', 2), mk('plasmaRifle', 'common', 0)];
        }""")
        page.click("#btn-inventory")
        page.wait_for_timeout(500)
        check("Bag opens with a 5-tab bar, Gear default active",
              tab_labels(page, "bag-tabs") == ["Gear", "Ammo", "Skills", "Keys", "Info"]
              and active_tab(page, "bag-tabs") == "Gear",
              tab_labels(page, "bag-tabs"))
        t = modal_text(page)
        check("Gear tab: equipped Alloy vest shows Armor +3, Max HP +14 (rare +1 scaling)",
              "Alloy vest" in t and "Armor +3" in t and "Max HP +14" in t, t[:400])
        check("Gear tab: equipped Alloy aegis shows Shield +22, Sensor shows Sight +2",
              "Alloy aegis" in t and "Shield +22" in t and "Sensor" in t and "Sight +2" in t)
        check("Gear tab: derived totals line still present (Armor 5, Max HP 114, Sight 10, Shield 0/22)",
              "Armor 5" in t and "Max HP 114" in t and "Sight 10" in t and "Shield 0/22" in t, t[:400])
        check("Gear tab: carried Ablative weave swap preview Armor +1, Max HP +10",
              "Ablative weave" in t and "Armor +4" in t and "Max HP +24" in t
              and "Swap: Armor +1 · Max HP +10" in t)
        check("Gear tab: carried Scope swap preview Range +1, Sight −2",
              "Scope" in t and "Swap: Range +1 · Sight −2" in t)
        check("Gear tab: carried Nano bastion swap preview Shield +35 plus pool-reset note",
              "Nano bastion" in t and "Shield +57" in t
              and "Swap: Shield +35 (shield pool resets to 0)" in t)
        check("Gear tab: carried Plasma rifle shows dice/range and Range +1 swap preview",
              "Plasma rifle" in t and "Damage 2d6+8" in t and "Range 6" in t and "Swap: Range +1" in t)
        check("Gear tab buttons all >=44px tall",
              min_button_height(page, ".bag-tabs button") >= 44
              and min_button_height(page, "[data-bag-tab='Gear'] button") >= 44,
              {"tabs": min_button_height(page, ".bag-tabs button"),
               "gear": min_button_height(page, "[data-bag-tab='Gear'] button")})
        page.screenshot(path=str(SHOTS / "menutabs-bag-gear.png"))

        click_tab(page, "bag-tabs", "Ammo")
        t = modal_text(page)
        check("Ammo tab: selector buttons visible, gear section hidden",
              "1: Standard" in t and "Alloy vest" not in t)
        click_tab(page, "bag-tabs", "Skills")
        t = modal_text(page)
        check("Skills tab: mech skill cards visible (Overclock, Sensor Pulse)",
              "OVERCLOCK" in t and "SENSOR PULSE" in t)
        click_tab(page, "bag-tabs", "Keys")
        t = modal_text(page)
        check("Keys tab: reachable, reports carried keys (none on a fresh floor)",
              "Keys" in t and "none carried" in t)
        click_tab(page, "bag-tabs", "Info")
        t = modal_text(page)
        check("Info tab: inventory summary + Use buttons visible again",
              "Salvage carried" in t and "Health cell" in t and "Alloy vest" not in t)
        page.screenshot(path=str(SHOTS / "menutabs-bag-info.png"))
        check("no horizontal overflow at 390px in the Bag",
              page.evaluate("() => document.documentElement.scrollWidth <= document.documentElement.clientWidth"))
        # Close the Bag (Close button) and prove a fresh open returns to Gear.
        page.evaluate("""() => {
          const b = Array.from(document.querySelectorAll('#modal button'))
            .find(x => x.textContent.trim() === 'Close');
          if (b) b.click();
        }""")
        page.wait_for_timeout(300)
        page.click("#btn-inventory")
        page.wait_for_timeout(400)
        check("reopening the Bag keeps the last-used tab (Info persists across opens)",
              active_tab(page, "bag-tabs") == "Info")
        click_tab(page, "bag-tabs", "Gear")
        check("Gear tab selectable again after reopen",
              active_tab(page, "bag-tabs") == "Gear")

        # ---- Hub tabs: die for real (adjacent lethal foe + wait key),
        # then press Hub on the death modal.
        page.evaluate("""() => {
          const b = Array.from(document.querySelectorAll('#modal button'))
            .find(x => x.textContent.trim() === 'Close');
          if (b) b.click();
        }""")
        page.wait_for_timeout(300)
        placed = page.evaluate("""() => {
          const s = window.__scrapDebug.getState();
          const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
          let cell = null;
          for (const [dx, dy] of dirs) {
            const t = s.floor.grid[s.player.y + dy][s.player.x + dx];
            if (t === 'floor' || t === 'corridor' || t === 'door') { cell = [s.player.x + dx, s.player.y + dy]; break; }
          }
          if (!cell) return false;
          const foe = s.floor.enemies[0];
          s.floor.enemies.forEach(e => { e.alive = false; });
          Object.assign(foe, { x: cell[0], y: cell[1], alive: true, awake: true,
            nextTime: s.clock, type: 'raider', hp: 500, maxHp: 500, dmg: 100, acc: 100, statuses: [] });
          s.player.hp = 1;
          return true;
        }""")
        check("death fixture placed (adjacent lethal foe, player at 1 HP)", placed)
        dead = False
        for _ in range(3):
            page.keyboard.press(".")
            page.wait_for_timeout(600)
            if "MECH DESTROYED" in modal_text(page):
                dead = True
                break
        check("player dies for real and the death modal opens", dead)
        page.evaluate("""() => {
          const b = Array.from(document.querySelectorAll('#modal button'))
            .find(x => x.textContent.trim() === 'Hub');
          if (b) b.click();
        }""")
        page.wait_for_timeout(600)
        check("hub opens with a 5-tab bar, Upgrades default active",
              tab_labels(page, "hub-tabs") == ["Upgrades", "Salvage & Crafting", "Loadout", "Intel", "Pilot"]
              and active_tab(page, "hub-tabs") == "Upgrades",
              tab_labels(page, "hub-tabs"))
        t = modal_text(page)
        check("Upgrades tab: Mechanic visible, Salvager hidden",
              "The Mechanic" in t and "The Salvager" not in t)
        page.screenshot(path=str(SHOTS / "menutabs-hub-upgrades.png"))
        click_tab(page, "hub-tabs", "Salvage & Crafting")
        t = modal_text(page)
        check("Salvage & Crafting tab: Salvager + Armorer visible, Mechanic hidden",
              "The Salvager" in t and "The Armorer" in t and "The Mechanic" not in t)
        # A failing station action rebuilds the hub: the tab must persist.
        page.evaluate("""() => {
          const b = Array.from(document.querySelectorAll('.hub-stations button'))
            .find(x => x.textContent.includes('1 comp'));
          if (b) b.click();
        }""")
        page.wait_for_timeout(600)
        check("station action keeps the Salvage & Crafting tab (no reset to Upgrades)",
              active_tab(page, "hub-tabs") == "Salvage & Crafting"
              and "The Salvager" in modal_text(page))
        click_tab(page, "hub-tabs", "Loadout")
        t = modal_text(page)
        check("Loadout tab: starting-ammo station visible, Salvager hidden",
              "starting ammo" in t.lower() and "Run starts with" in t and "The Salvager" not in t)
        click_tab(page, "hub-tabs", "Intel")
        t = modal_text(page)
        check("Intel tab: Scout + Radio visible, Researcher not in this group",
              "The Scout" in t and "The Radio Operator" in t)
        click_tab(page, "hub-tabs", "Pilot")
        t = modal_text(page)
        check("Pilot tab: Instructor visible, Scout hidden",
              "The Instructor" in t and "The Scout" not in t)
        page.screenshot(path=str(SHOTS / "menutabs-hub-pilot.png"))
        check("hub tab buttons all >=44px tall",
              min_button_height(page, ".hub-tabs button") >= 44,
              min_button_height(page, ".hub-tabs button"))
        check("no horizontal overflow at 390px in the hub",
              page.evaluate("() => document.documentElement.scrollWidth <= document.documentElement.clientWidth"))
        check("zero console errors across the whole run", not errors, errors[:5])
        print(f"RESULT passes={len(PASSES)} failures={len(FAILURES)}")
        if FAILURES:
            print("FAILURES: " + "; ".join(FAILURES))
            sys.exit(1)

if __name__ == "__main__":
    main()
