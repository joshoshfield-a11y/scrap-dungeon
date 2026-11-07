"""Opinions layer — automated tester personas' critique, NOT human players.

Each persona, after its play run, produces 2-4 concrete improvement
suggestions in its own first-person voice. Every suggestion is
GROUNDED in something that persona actually observed in that run:
a Recorder metric (state values, counted behaviour, screenshot
measurements, grid counts), a check's evidence, or a finding from
another persona in the same run (cited as such). A rule whose
observation is missing or contradicts the suggestion does not
fire; the persona's report then says so instead of inventing a
suggestion. Opinions are never bugs and never test failures — they
are an addition to the QC verdict, labelled honestly in REPORT.md.

Categories: graphics/visuals, flow/pacing, readability/clarity,
controls/feel, relatability/fun.
Priorities: high / medium / low.
"""

PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}

VOICES = {
    "casual": "a new player mashing around, figuring the game out as I go",
    "completionist": "a player who wants to clear every floor properly",
    "bug-hunter": "someone poking at every edge to see what breaks",
    "mobile": "a phone-only player, thumb on the screen",
    "graphics-qc": "an art reviewer staring at the sprites and the screen",
}


def _sug(persona, category, priority, key, text, observation):
    return {"persona": persona, "category": category,
            "priority": priority, "key": key, "suggestion": text,
            "observation": observation}


def _grid(rec):
    return rec.metrics.get("start_grid_counts") or {}


def _wall_frac(rec):
    g = _grid(rec)
    total = sum(g.values())
    if not total:
        return None
    return g.get("wall", 0) / total


def _floor_frac(rec):
    g = _grid(rec)
    total = sum(g.values())
    if not total:
        return None
    return (g.get("floor", 0) + g.get("corridor", 0)) / total


def _casual(rec, all_metrics):
    """New-player voice. Grounded in its 120-action random run."""
    out, abst = [], []
    m = rec.metrics
    dead = m.get("dead_ends")
    if dead is not None and dead > 0:
        out.append(_sug("casual", "controls/feel", "high", "wall-bump-feedback",
            "Give wall bumps some feedback — a thud, a tiny shake, or "
            "even just a log line. Right now bumping a wall feels like "
            "the game ignored my input.",
            f"In my run, {dead} move attempts changed nothing at all "
            f"(position and clock both identical) — see the casual "
            f"NOTE 'wall bumps give no feedback'."))
    else:
        abst.append("wall-bump feedback: no silent bumps observed this run")
    kills = m.get("final_kills")
    if kills is not None and kills == 0:
        out.append(_sug("casual", "flow/pacing", "medium", "first-combat-sooner",
            "Put an enemy — or at least a visible goal — closer to spawn. "
            "I wandered a whole session and never got into a fight, so I "
            "never learned what combat feels like.",
            f"{m.get('actions_attempted', '?')} random actions, "
            f"final clock {m.get('final_clock')}, kills 0."))
    elif kills:
        types = m.get("start_enemy_types") or []
        out.append(_sug("casual", "relatability/fun", "low", "enemy-personality",
            "Fights were fun once I found them — I'd love enemies with a "
            "bit more personality, like a nameplate quip or a distinct "
            "attack tell, so each type feels like a character, not just "
            "a stat block.",
            f"I fought and killed {kills} enemies; the floor started with "
            f"enemy types {types}."))
    wf = _wall_frac(rec)
    if wf is not None and wf > 0.45:
        out.append(_sug("casual", "readability/clarity", "medium", "wall-floor-contrast",
            "Make walls read more clearly against floors. When most of "
            "the screen is wall, I kept trying to walk into tiles I "
            "thought were open.",
            f"My starting floor was {wf:.0%} wall tiles "
            f"(grid counts {m.get('start_grid_counts')})."))
    else:
        abst.append("wall/floor contrast: wall share was not high this run")
    if m.get("final_clock") is not None:
        out.append(_sug("casual", "flow/pacing", "low", "objective-reminder",
            "Keep a small 'what am I doing' reminder on screen — stairs "
            "direction or current goal. After a long wander I forgot "
            "whether I was hunting loot or heading down.",
            f"My run lasted {m.get('actions_attempted')} actions to "
            f"clock {m.get('final_clock')} with hp {m.get('final_hp')}."))
    return out, abst


def _completionist(rec, all_metrics):
    """Clear-every-floor voice. Grounded in its pickup/kill/stairs run."""
    out, abst = [], []
    m = rec.metrics
    plen = m.get("first_pickup_path_len")
    if plen is not None and plen >= 8:
        out.append(_sug("completionist", "flow/pacing", "medium", "early-loot-near-spawn",
            "Drop a small salvage pile within a couple of steps of spawn. "
            "Early loot teaches the pickup loop before the player has to "
            "trek for it.",
            f"My first pickup was {plen} steps away "
            f"(kind: {m.get('first_pickup_kind')})."))
    elif plen is not None:
        out.append(_sug("completionist", "flow/pacing", "low", "keep-early-loot-close",
            "Early loot landed close to spawn and that felt right — keep "
            "that pacing. Don't let later floors push the first pickup "
            "far away.",
            f"My first pickup was {plen} steps away "
            f"(kind: {m.get('first_pickup_kind')})."))
    else:
        abst.append("early-loot distance: no pickup path was measured this run")
    slen = m.get("stairs_path_len")
    if slen is not None and slen >= 20:
        out.append(_sug("completionist", "flow/pacing", "medium", "stairs-journey-rewards",
            "If the stairs are a long walk, seed that route with "
            "something — a pickup, a scuffle, a landmark — so the trek "
            "feels like progress, not commuting.",
            f"My first stairs leg was {slen} steps long."))
    else:
        abst.append("stairs-journey rewards: stairs leg was short or unmeasured")
    kinds = m.get("start_pickup_kinds") or []
    if kinds and len(kinds) <= 2:
        out.append(_sug("completionist", "readability/clarity", "medium", "loot-variety-early",
            "Show more kinds of loot early, even just visually. When "
            "everything on the floor looks like the same pickup, I stop "
            "caring about walking over to check.",
            f"My starting floor's pickups were only kinds {kinds}."))
    elif kinds:
        abst.append("loot variety: floor already showed several pickup kinds")
    shared = all_metrics.get("graphics-qc", {}).get("shared_sheets") or []
    if shared:
        out.append(_sug("completionist", "graphics/visuals", "high", "distinct-component-art",
            "Give components their own look — a different colour or icon "
            "from salvage. I kept thinking I'd found salvage when it was "
            "a component, and that muddles the economy in my head.",
            f"graphics-qc found sheet(s) shared by two roles: {shared} "
            f"(pickup_salvage and pickup_component render identically)."))
    else:
        abst.append("distinct component art: no shared pickup sheet this run")
    types = m.get("start_enemy_types") or []
    if types and len(types) <= 2:
        out.append(_sug("completionist", "relatability/fun", "low", "early-enemy-variety",
            "A third early enemy type would make runs feel less samey. "
            "Two types is enough to learn combat, but the third floor in "
            "a row starts to blur.",
            f"My starting floor had enemy types {types}."))
    return out, abst


def _bug_hunter(rec, all_metrics):
    """Edge-poker voice. Grounded in its spam/reload/refusal runs."""
    out, abst = [], []
    m = rec.metrics
    blocked = m.get("dock_clicks_blocked_by_modal")
    if blocked is not None and blocked > 0:
        out.append(_sug("bug-hunter", "controls/feel", "low", "modal-close-affordance",
            "Modal blocking works — but make the way out obvious, like a "
            "big Close button. Blocking stray taps is correct; leaving "
            "me hunting for the exit is not.",
            f"{blocked}/3 dock clicks were blocked by the Bag modal "
            f"overlay in my spam run, and state stayed sane."))
    else:
        abst.append("modal close affordance: no dock clicks were blocked")
    fb = m.get("unheld_item_gave_feedback")
    if fb is False:
        out.append(_sug("bug-hunter", "readability/clarity", "medium", "unheld-item-feedback",
            "Using an item I don't hold should say something — 'no "
            "repair kits' in the log would do. A silent tap makes me "
            "wonder if the button is broken.",
            "My wrench-popup use of an unheld item produced no refusal "
            "text in the log tail."))
    elif fb is True:
        abst.append("unheld-item feedback: the log already reports unheld items")
    if m.get("died_during_wait_spam"):
        out.append(_sug("bug-hunter", "flow/pacing", "medium", "waiting-danger-signal",
            "Waiting should warn me before it kills me — a power or "
            "danger indicator that escalates as enemies close in, so "
            "spamming Wait feels risky, not random.",
            f"Wait-spamming 30x ended with me dead "
            f"(power state after spam: {m.get('power_state_after_spam')})."))
    else:
        abst.append("waiting danger signal: Wait spam did not kill me")
    out.append(_sug("bug-hunter", "relatability/fun", "low", "hub-screen-run-summary",
        "The reload hub screen works cleanly — I'd love a one-line 'last "
        "run' summary on it (depth, kills, banked) so coming back feels "
        "like continuing a story, not just resuming a save.",
        "My save/load round-trip offered Continue and resumed the same "
        "run (hp/depth/clock matched before and after reload)."))
    return out, abst


def _mobile(rec, all_metrics):
    """Phone-player voice. Grounded in 390px measurements."""
    out, abst = [], []
    m = rec.metrics
    tgt = m.get("min_tap_target")
    if tgt and min(tgt["w"], tgt["h"]) < 56:
        out.append(_sug("mobile", "controls/feel", "high" if min(tgt["w"], tgt["h"]) < 44 else "medium",
            "smallest-tap-target",
            "Bump the smallest buttons up toward 56px. On a phone, a "
            "40-something-pixel target is a thumb-miss waiting to happen, "
            "especially mid-combat.",
            f"Smallest tap target at 390px was '{tgt['name']}' at "
            f"{tgt['w']}x{tgt['h']}px."))
    else:
        abst.append("tap-target size: smallest target was already 56px+ or unmeasured")
    if m.get("transient_shows_last_line") is False:
        out.append(_sug("mobile", "readability/clarity", "medium", "last-log-line-visible",
            "Show the last log line above the dock even when the log "
            "modal is closed. On a phone I play with the log closed, "
            "so right now I miss everything that just happened.",
            "The transient overlay did not show the latest log line "
            "after a Wait at 390px."))
    else:
        abst.append("last log line: the transient overlay already shows it")
    if m.get("touch_tap_moved"):
        out.append(_sug("mobile", "controls/feel", "medium", "touch-tap-zone",
            "Touch taps work, but make the tap zone a touch more "
            "forgiving — a near-miss tap on a tile edge shouldn't feel "
            "like a miss. Fat-finger tolerance is the whole game on a "
            "phone.",
            "My touchscreen tap on an adjacent walkable tile moved/attacked "
            "at 390px, but it had to land on the tile precisely."))
    else:
        abst.append("touch tap zone: no successful touch tap was measured")
    ov = m.get("horizontal_overflow_px")
    if ov is not None and ov <= 1:
        out.append(_sug("mobile", "flow/pacing", "low", "phone-viewport-room",
            "The phone layout fits with no sideways scroll, which is "
            "great — use that headroom to show a bit more of the room, "
            "so I can plan further ahead instead of scrolling the map "
            "in my head.",
            f"At 390px, horizontal overflow was {ov}px and the bottom "
            f"dock was on screen."))
    return out, abst


def _graphics(rec, all_metrics):
    """Art-reviewer voice. Grounded in sheet/screenshot measurements."""
    out, abst = [], []
    m = rec.metrics
    shared = m.get("shared_sheets") or []
    if shared:
        out.append(_sug("graphics-qc", "graphics/visuals", "high", "distinct-component-art",
            "Components need their own art — right now they wear "
            "salvage's sprite, so two different resources read as one. "
            "A colour shift alone would fix the scanning problem.",
            f"Sheet(s) shared by two roles: {shared}; "
            f"{m.get('assets_total')} sheets total, "
            f"{m.get('referenced_count')} referenced."))
    else:
        abst.append("distinct component art: no shared sheet this run")
    if m.get("destroyed_sheets_identical"):
        out.append(_sug("graphics-qc", "graphics/visuals", "medium", "distinct-wrecks",
            "Give each mech its own wreck. Killed raiders, drones and "
            "brutes all leave the same wreck pile, which flattens the "
            "moment of a kill — keep a hint of each silhouette in its "
            "wreck.",
            f"All destroyed sheets measured identical opaque-pixel "
            f"counts: {m.get('destroyed_opaque_values')}."))
    else:
        abst.append("distinct wrecks: destroyed sheets already differ")
    delta = m.get("scout_walk_delta_pct")
    if delta is not None and delta < 15:
        out.append(_sug("graphics-qc", "graphics/visuals", "medium", "exaggerate-walk-cycle",
            "Exaggerate the walk cycle — bigger leg swing, more bob. "
            "The two walk frames are so close that movement reads as a "
            "slide, not a stride.",
            f"Scout walk_a vs walk_b differ by only {delta}% in "
            f"opaque pixels."))
    else:
        abst.append("walk cycle: walk frames already differ enough or unmeasured")
    bright = m.get("screenshot_bright_frac")
    if bright is not None and bright < 0.10:
        out.append(_sug("graphics-qc", "graphics/visuals", "medium", "sprite-contrast",
            "Brighten the sprite highlights a touch — the load screen "
            "is mostly dark background, and at a glance the mechs sink "
            "into it.",
            f"Load screenshot: {m.get('screenshot_distinct_colours')} "
            f"distinct colours, bright-sample fraction {bright}."))
    else:
        abst.append("sprite contrast: screenshot already has enough bright samples")
    return out, abst


_RULES = {"casual": _casual, "completionist": _completionist,
          "bug-hunter": _bug_hunter, "mobile": _mobile,
          "graphics-qc": _graphics}


def generate(recs):
    """Returns (per_persona, consolidated).

    per_persona: {persona: {"voice": str, "suggestions": [sug...],
                            "abstentions": [str...]}}
    consolidated: suggestions merged on key, highest-impact first,
    with the list of agreeing personas.
    """
    # Merge duplicate-persona recorders (graphics-qc runs twice: static
    # + browser) so no run's metrics are lost to overwriting.
    import types as _types
    merged_recs = {}
    for r in recs:
        if r.persona not in merged_recs:
            merged_recs[r.persona] = _types.SimpleNamespace(
                persona=r.persona, metrics=dict(r.metrics),
                checks=list(r.checks))
        else:
            merged_recs[r.persona].metrics.update(r.metrics)
            merged_recs[r.persona].checks.extend(r.checks)
    all_metrics = {p: r.metrics for p, r in merged_recs.items()}
    per_persona = {}
    for rec in merged_recs.values():
        fn = _RULES.get(rec.persona)
        if not fn:
            continue
        sugs, abst = fn(rec, all_metrics)
        per_persona[rec.persona] = {
            "voice": VOICES.get(rec.persona, rec.persona),
            "suggestions": sugs[:4], "abstentions": abst}
    # Consolidate on key: same improvement from several personas = one
    # item, with every agreeing persona listed.
    merged = {}
    for persona, data in per_persona.items():
        for s in data["suggestions"]:
            key = s["key"]
            if key not in merged:
                merged[key] = {"category": s["category"],
                               "priority": s["priority"],
                               "suggestion": s["suggestion"],
                               "observations": [s["observation"]],
                               "personas": [persona]}
            else:
                merged[key]["personas"].append(persona)
                if s["observation"] not in merged[key]["observations"]:
                    merged[key]["observations"].append(s["observation"])
                if PRIORITY_RANK[s["priority"]] < PRIORITY_RANK[merged[key]["priority"]]:
                    merged[key]["priority"] = s["priority"]
    consolidated = sorted(
        merged.values(),
        key=lambda c: (PRIORITY_RANK[c["priority"]], -len(c["personas"])))
    return per_persona, consolidated
