#!/usr/bin/env python3
"""Chart for the Phase 1 sim gate (LOOT-SKILLS-DESIGN.md §4.5).

Reads beta-testers/sim_ammo_results.json (written by sim_ammo.js) and
writes beta-testers/reports/phase1-chart.png:
  left: depth-1 median shots-to-kill per enemy, starter blaster vs
        depth-typical rolled weapon, with the gate limits marked.
  right: sustainable ranged share by depth for the shipped ('current')
        ammo variant, with the 0.7 floor marked.
Re-run: ~/workspace/venvs/ml-stack/bin/python beta-testers/chart_phase1.py
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

HERE = Path(__file__).parent
results = json.loads((HERE / "sim_ammo_results.json").read_text())
kd = results["killDists"]
variants = results["variants"]["current"]

enemies = ["drone", "raider", "brute"]
limits = {"drone": 3, "raider": 4, "brute": 8}
blaster = [kd[f"{e}|1|ranged"]["median"] for e in enemies]
typical = [kd[f"{e}|1|rangedTypical"]["median"] for e in enemies]

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.2))

x = range(len(enemies))
w = 0.36
ax1.bar([i - w / 2 for i in x], blaster, w, label="Common +0 blaster", color="#4aa8ff")
ax1.bar([i + w / 2 for i in x], typical, w, label="Depth-typical rolled", color="#b46ae0")
for i, e in enumerate(enemies):
    ax1.axhline(0, color="none")  # keep autoscale honest
    ax1.plot([i - w, i + w], [limits[e], limits[e]], color="#e05c35",
             linewidth=2, linestyle="--")
    ax1.text(i, limits[e] + 0.25, f"gate ≤{limits[e]}", ha="center",
             fontsize=8, color="#e05c35")
ax1.set_xticks(list(x))
ax1.set_xticklabels(enemies)
ax1.set_ylabel("Median shots to kill (depth 1, 20k trials)")
ax1.set_title("Shots to kill — dice model")
ax1.legend(fontsize=8)
ax1.set_ylim(0, max(max(blaster), max(typical), 8) + 1.5)

depths = [1, 2, 3]
share = [variants[f"depth{d}"]["rangedFracSustainable"]["median"] for d in depths]
ax2.bar([str(d) for d in depths], share, 0.5, color="#35e05c")
ax2.axhline(0.7, color="#e05c35", linewidth=2, linestyle="--")
ax2.text(2.35, 0.73, "gate ≥0.7 (depths 1–2)", ha="right", fontsize=8, color="#e05c35")
for i, s in enumerate(share):
    ax2.text(i, s + 0.03, f"{s:.2f}", ha="center", fontsize=9)
ax2.set_ylim(0, 1.15)
ax2.set_xlabel("Depth")
ax2.set_ylabel("Median sustainable ranged share (200 run-seeds)")
ax2.set_title("Ammo economy — shipped variant (start 16, crate +8)")

fig.suptitle("Scrap Dungeon Phase 1 — sim gates (§4.5)", fontsize=12)
fig.tight_layout()
out = HERE / "reports" / "phase1-chart.png"
out.parent.mkdir(parents=True, exist_ok=True)
fig.savefig(out, dpi=130)
print(f"wrote {out} ({out.stat().st_size} bytes)")
