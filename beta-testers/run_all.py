#!/usr/bin/env python3
"""SCRAP DUNGEON beta-tester suite — one runnable entry point.

Usage:
    ./run_all.sh            # recommended (uses the ML venv's Playwright)
    python3 run_all.py      # needs a Playwright install + Chromium

What it does (READ-ONLY against game/ — it never edits the game):
  1. Graphics QC (static): every PNG in game/assets/ — geometry,
     alpha, painted content, referenced-by-game.
  2. Graphics QC (browser): load in headless Chromium, console
     errors, asset HTTP status, screenshot colour, pose changes.
  3. Casual player: 120 random human-ish actions.
  4. Completionist: pickup -> kill -> stairs -> Descend -> stairs
     -> Extract, checking banking math and the run summary.
  5. Bug hunter: rapid taps, modal spam, Wait/Rest spam, refusals,
     out-of-bounds taps, reload mid-run, save/load presence.
  6. Mobile player: 390px phone viewport, touch only, tap targets,
     overflow, log modal + transient last line, double-tap-zoom
     guard, dock.

Outputs (all under beta-testers/reports/):
  results.json, REPORT.md, screenshots/*.png

Exit code: 1 if any Blocker FAIL, else 0. If a game file hash
changes mid-run (another builder editing game/), the affected
static checks are re-run once and the change is recorded as an
environment note — results are never invented for a check that
could not run.
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from testers.common import GAME_DIR, GAME_URL, Recorder, game_snapshot  # noqa: E402
from testers import graphics_qc, opinions, personas  # noqa: E402

HERE = Path(__file__).parent
REPORTS = HERE / "reports"
SHOTS = REPORTS / "screenshots"


def run_browser_persona(browser, name, fn, viewport=None, mobile=False):
    rec = Recorder(name)
    errors = []
    ctx = browser.new_context(
        viewport=viewport or {"width": 1280, "height": 900},
        has_touch=mobile, is_mobile=mobile)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(f"console {m.type}: {m.text}")
              if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("response", lambda r: errors.append(f"asset HTTP {r.status}: {r.url}")
              if "assets/" in r.url and r.status != 200 else None)
    try:
        page.goto(GAME_URL)
        page.wait_for_timeout(1200)
        fn(page, rec)
    except Exception as exc:  # noqa: BLE001
        rec.check(f"{name} persona completed without a harness crash",
                  False, "Blocker", f"{type(exc).__name__}: {exc}")
    if errors:
        rec.check(f"no uncaught console/page errors during {name}",
                  False, "Blocker", "; ".join(errors[:10]))
    else:
        rec.check(f"no uncaught console/page errors during {name}",
                  True, "Blocker", "none")
    rec.console_errors = errors
    ctx.close()
    return rec


def main():
    REPORTS.mkdir(parents=True, exist_ok=True)
    SHOTS.mkdir(parents=True, exist_ok=True)
    before = game_snapshot()
    all_recs = []

    # 1. Graphics QC — static.
    rec = Recorder("graphics-qc")
    graphics_qc.run_static(rec)
    all_recs.append(rec)

    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox"])
        # 2. Graphics QC — browser.
        rec = Recorder("graphics-qc")
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        try:
            graphics_qc.run_browser(page, rec, SHOTS)
        except Exception as exc:  # noqa: BLE001
            rec.check("graphics browser pass completed", False, "Blocker",
                      f"{type(exc).__name__}: {exc}")
        page.close()
        all_recs.append(rec)

        # 3-5. Desktop personas, each on a fresh page (fresh run).
        for name, fn in (
            ("casual", lambda p, r: personas.run_casual(p, r)),
            ("completionist", lambda p, r: personas.run_completionist(p, r, SHOTS)),
            ("bug-hunter", lambda p, r: personas.run_bug_hunter(p, r)),
        ):
            all_recs.append(run_browser_persona(browser, name, fn))

        # 6. Mobile persona.
        all_recs.append(run_browser_persona(
            browser, "mobile",
            lambda p, r: personas.run_mobile(p, r, SHOTS),
            viewport={"width": 390, "height": 844}, mobile=True))
        browser.close()

    after = game_snapshot()
    mid_flight = {k: (before.get(k), after.get(k))
                  for k in before if before.get(k) != after.get(k)}
    if mid_flight:
        # Re-run the cheap static pass once; never invent browser results.
        rec = Recorder("graphics-qc")
        rec.env("game files changed mid-run (Phase 2 builder active)",
                f"changed: {mid_flight} — static graphics checks re-run once "
                f"below; browser results above are from the earlier snapshot "
                f"and must be re-run after Phase 2 lands for a clean verdict.")
        graphics_qc.run_static(rec)
        all_recs.append(rec)

    # ---- aggregate + write reports ----
    checks = [c.as_dict() for r in all_recs for c in r.checks]
    counts = {"PASS": 0, "FAIL": 0, "NOTE": 0, "ENV": 0}
    for c in checks:
        counts[c["status"]] = counts.get(c["status"], 0) + 1
    blockers = [c for c in checks if c["status"] == "FAIL"
                and c["severity"] == "Blocker"]
    majors = [c for c in checks if c["status"] == "FAIL"
              and c["severity"] == "Major"]

    # Opinions layer: critique only, never a verdict. Each persona's
    # suggestions are grounded in that run's metrics/checks; a rule
    # whose observation is missing abstains instead of inventing one.
    per_persona_opinions, consolidated = opinions.generate(all_recs)

    lines = []
    lines.append("# SCRAP DUNGEON — beta-tester report\n")
    lines.append(f"Generated: {time.strftime('%Y-%m-%d %H:%M %Z')} — "
                 f"game snapshot: {before}\n")
    lines.append("Suite: `beta-testers/run_all.py` (see `beta-testers/README.md`). "
                 "Testers READ the game only; nothing under `game/` was edited.\n")
    lines.append(f"## Totals: {counts['PASS']} PASS, {counts['FAIL']} FAIL, "
                 f"{counts['NOTE']} NOTE, {counts['ENV']} ENV\n")
    lines.append(f"Blocker failures: {len(blockers)} — "
                 f"Major failures: {len(majors)}\n")
    if mid_flight:
        lines.append(f"Environment note: game files changed mid-run: {mid_flight}\n")
    lines.append("## Tester opinions and suggestions\n")
    lines.append("These are the AUTOMATED tester personas' critique — "
                 "not real human players. Opinions are an addition to "
                 "the QC verdict above, never a replacement for it, and "
                 "no opinion is a bug or a test failure. Every suggestion "
                 "names the observation from this run that grounded it; "
                 "where a run did not support a suggestion, the persona "
                 "says so instead of inventing one.\n")
    lines.append(f"### Consolidated, highest-impact first "
                 f"({len(consolidated)} items)\n")
    for c in consolidated:
        lines.append(f"- [{c['priority'].upper()}] ({c['category']}) "
                     f"{c['suggestion']} — agreed by: "
                     f"{', '.join(c['personas'])}")
        for obs in c["observations"]:
            lines.append(f"  - grounded in: {obs}")
    lines.append("")
    for persona, data in per_persona_opinions.items():
        lines.append(f"### {persona} — in their own voice "
                     f"({data['voice']})\n")
        for s in data["suggestions"]:
            lines.append(f"- [{s['priority'].upper()}] ({s['category']}) "
                         f"{s['suggestion']}")
            lines.append(f"  - grounded in: {s['observation']}")
        for a in data["abstentions"]:
            lines.append(f"- (no suggestion) {a}")
        lines.append("")
    for persona in ("graphics-qc", "casual", "completionist", "bug-hunter", "mobile"):
        pcs = [c for c in checks if c["persona"] == persona]
        if not pcs:
            continue
        lines.append(f"## {persona} ({sum(1 for c in pcs if c['status'] == 'PASS')}"
                     f" PASS / {sum(1 for c in pcs if c['status'] == 'FAIL')} FAIL)\n")
        for c in pcs:
            lines.append(f"- [{c['status']}] ({c['severity']}) {c['check']} — "
                         f"{c['evidence']}")
        lines.append("")
    for r in all_recs:
        if r.actions:
            lines.append(f"## {r.persona} — action log (first 60)\n")
            for a in r.actions[:60]:
                lines.append(f"- {a}")
            lines.append("")
    (REPORTS / "results.json").write_text(json.dumps(
        {"snapshot_before": before, "snapshot_after": after,
         "mid_flight_changes": mid_flight, "counts": counts,
         "checks": checks,
         "opinions": {"per_persona": per_persona_opinions,
                      "consolidated": consolidated}}, indent=2))
    (REPORTS / "REPORT.md").write_text("\n".join(lines))
    print(f"PASS={counts['PASS']} FAIL={counts['FAIL']} "
          f"NOTE={counts['NOTE']} ENV={counts['ENV']} "
          f"Blockers={len(blockers)} Majors={len(majors)}")
    for c in blockers + majors:
        print(f"  {c['severity']} FAIL [{c['persona']}] {c['check']} — {c['evidence']}")
    print(f"Report: {REPORTS / 'REPORT.md'}")
    return 1 if blockers else 0


if __name__ == "__main__":
    sys.exit(main())
