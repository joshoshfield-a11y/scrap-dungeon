# GENERATOR SPEC — CHATGPT ROUND 1: GROUNDING NOTES

**Source:** ChatGPT chat "Generator Specification Details",
https://chatgpt.com/c/6ae20835-3d68-83e8-a4bd-f8af4b5b0300 (new chat, signed-in
browser session, sent 2026-10-28 ~07:35 PDT, reply received ~07:38 PDT).
**Status: PLANNING ONLY. Nothing in this file is approved, and nothing has been
built from it.** The full verbatim text lives in the chat link above; this file
is a paraphrase plus grounding against the shipped code. Amendment to
`LOOT-SKILLS-DESIGN.md` §10 waits on the user's review.

## 1. What ChatGPT proposed (paraphrased)

- **Pass architecture.** Six passes with explicit ownership: room layout, then
  connectivity/corridors, then structural tiles, then purpose/category, then
  population/dressing, then validation/repair. Each pass owns named fields and
  must preserve earlier passes' guarantees. Later passes never rewrite
  structural kinds to make content fit.
- **Pass 1, exact order.** Initialize all cells to void; choose room count
  (6–10); reserve room ID 0 as the spawn room and place it first; place the
  rest in ascending ID order, dimensions before positions, candidates tested in
  deterministic shuffled order; clearance rule (one tile between outer rects,
  fixed measurement); commit IDs immediately, never renumber; bounded fallback
  (enumerate placements in stable order, shrink toward 6 rooms / smallest
  size, never below the minimum, never accept overlaps).
- **Room representation.** Outer rectangle includes its boundary; walkable
  interior excludes the perimeter (so a 4×4 room has a 2×2 interior). Corridors
  connect to specific boundary cells and must not carve through unrelated
  room interiors.
- **Pass 2, graph first.** Candidate graph over room pairs with a deterministic
  cost (Manhattan distance between closest rectangle points + a fixed awkward-
  routing penalty), edges sorted by (cost, idA, idB). Deterministic
  Kruskal/Prim spanning tree (N−1 edges), then 1–2 genuine loops (no trivial
  detours, no interior crossings). Corridor carving per edge: choose portals,
  route with fixed-tiebreak A*/Dijkstra treating unrelated interiors as
  obstacles, commit path merging into existing corridors, one door per portal,
  record the connection (rooms, type, portals, cells, length).
- **Door correction.** Doors only at recorded portals where a corridor crosses
  a room boundary — two thresholds per standard connection, reuse existing
  portals instead of adding adjacent doors. This is the same fix our §9.1
  proposes, stated as a portal rule.
- **Purpose vs category split.** Purpose = what the place was (workshop,
  reactor, storage, security, arena, ordinary); category = gameplay role
  (spawn/combat/loot/structure/hazard/empty). One purpose can map to several
  categories; assignment happens after the graph is known, spawn + exit rooms
  reserved first, at most one arena per floor (suggested), population via a
  profile of tag filters over existing content only — no new mechanics.
- **Tile metadata contract.** Each cell = structural kind + independent content
  layers (structure, hazard, dressing list, pickup, occupant) + room/corridor/
  portal IDs + flags. Contract table: what each kind may host, connect to, and
  must never do. Hazard should be a content layer over floor/corridor rather
  than a structural kind that erases terrain info. Non-overlap rules as
  assertions. Placement functions take an eligibility predicate and return
  success/failure; failure beats forced placement; omit optional content
  rather than break an invariant.
- **Pass 6, twelve checks in fixed order.** Bounds; room geometry; corridor
  integrity; room-graph BFS reachability; tile-level flood fill (both tests —
  they catch different bugs); door validity; stair placement (exactly one, in
  the farthest room, reachable); locked-door solvability (state-space search
  including collected keys — tile-only BFS insufficient); spawn safety;
  content legality; encounter feasibility; deterministic result. Issues carry
  stable IDs/cells, sorted before repair.
- **Deterministic repair, smallest layer first.** Priority table: invalid
  dressing/pickup → spawn-blocking enemy/hazard → route-blocking encounter →
  bad door → broken corridor → bad stairs → lock deadlock → bad room geometry
  → reject floor. Relocation candidates in fixed order (same room, Manhattan
  distance, y, x). No fresh randomness for routine repairs. Connectivity
  repair recarves only the recorded edge; stair repair never moves the exit
  room; lock repair never invents keys.
- **RNG stream isolation.** Independent streams derived from the floor seed
  (rooms, graph, purposes, tiles, encounters, loot, details, repair), fixed
  derive function, sorted candidate lists, defined draw order — so a dressing
  change leaves topology untouched.
- **Scout reproducibility.** Generation signature includes runSeed, depth, and
  version fields (generator, ruleset, RNG algorithm, tile catalog); bump a
  version when a rule changes instead of silently changing a seed's floor.
  Eight regression tests listed (same-seed, cross-preview, repair determinism,
  invariant sweep, stream isolation, fallback, locked-door, content-density),
  compared on canonical serialized data, not screenshots.
- **Implementation order (8 steps).** Portal doors first; stable IDs + topology
  records; Pass 1 fallback; Pass 2 graph; purpose profiles; metadata contract;
  Pass 6 validation; repairs + regression tests.

## 2. Grounding against the shipped code

### Matches our doc / code (adopt as stated)

- Portal-only doors (§9.1 threshold rule) — same fix, stronger statement.
- Purpose flavoring driving content (§10.2) — the purpose/category split is a
  cleaner formulation of the same idea; adopt the vocabulary.
- Pass 6 wiring `coherenceCheck` into generation — ChatGPT's 12 checks extend
  our list (add corridor integrity, door validity, encounter feasibility, and
  the determinism check).
- Locked-door solvability rule (key reachable before its lock) and state-space
  reachability — matches §9.4/§10.2, stated more rigorously.
- Repair priority + "never publish an invalid floor" — matches our bounded
  fallback; the priority table is new detail worth keeping.
- Two connectivity tests (graph BFS + tile flood fill) — new and correct;
  adopt both.

### Deltas that need reconciliation (follow-up sent 2026-10-28 ~07:39 PDT)

1. **Perimeter room model vs our wall model.** ChatGPT assumes outer rect +
   1-cell perimeter interior. Our generator makes room rects floor and builds
   walls on void cells adjacent to walkable cells (`core.js` wall pass). The
   follow-up asks for an adaptation path that keeps our wall model, or a
   cost/benefit case for the rewrite. Do not assume the rewrite until answered.
2. **Per-stream RNG vs our single stream + plain JSON.** Our generator threads
   one `rng` through `generateFloor`; saves/serialization are plain JSON (no
   classes, Sets, or Maps — the schema shapes in the reply must be re-expressed
   as JSON-safe records). The follow-up asks whether stream isolation is worth
   the refactor or whether a documented single-stream draw order achieves the
   same Scout reproducibility, plus JSON-shape versions of the schemas.
3. **Pass numbering.** ChatGPT numbers purpose assignment as Pass 4 and
   population as Pass 5; our §10 numbers identity as Pass 2 and gameplay as
   Pass 4. Cosmetic — adopt one numbering in the §10 amendment and map the
   other explicitly. No behavior difference.

### New ideas worth adopting (pending his review)

- Generation signature with version fields (generator/ruleset/RNG/catalog) so
  seed stability is explicit across versions instead of implicitly promised.
- Placement API contract: `canPlace*` predicates returning failure, used by
  every placer (pickups, enemies, hazards, dressing).
- Immutable topology records: stable room IDs, corridor IDs, portal IDs, and
  a stored connection record per edge (rooms, type, portals, cells, length).
- Stream-isolation regression test and content-density test, if the RNG
  question resolves in favor of streams.
- "Failure beats forced placement": omit optional content and record a
  diagnostic rather than breaking an invariant to fill a quota — adopt as a
  generator-wide rule.

### To verify in code before the §10 amendment (not yet checked)

- Room margin from the grid edge and the exact clearance rule in the current
  placer (ChatGPT proposes 2-tile margin, 1-tile clearance — treat as
  proposals, not facts about our code).
- Whether the current corridor carver is L-shaped/directional or a
  pathfinder (ChatGPT proposes fixed-tiebreak A*/Dijkstra — verify what exists
  before choosing).
- Whether `coherenceCheck` already covers any of the 12 checks (it is only
  called from tests today; its checklist contents were not re-read for this
  note).

## 4. Reconciliation round 2 (received 2026-10-28 ~07:41 PDT, same chat)

Paraphrase of the follow-up verdicts. Both deltas resolved in favor of the
shipped architecture — no rewrite required.

1. **Wall model: KEEP.** Portal doors adapt to the current model (room rects
   are floor, walls are adjacent void cells). Adaptation: keep room rects as
   floor; generate walls after carving connectivity; store explicit corridor
   endpoints per connection; derive each portal from the room-floor-to-corridor
   transition, with one consistent convention for whether the door replaces a
   wall cell or occupies the threshold cell; validate transitions, not assumed
   perimeters; repair by restoring the recorded route, never reshaping rooms.
   A perimeter rewrite was judged higher-risk with no demonstrated gameplay
   benefit.
2. **Plain-JSON schemas given.** Room, RoomConnection, and GridCell shapes
   using only arrays and JSON primitives: nulls for absent values, [] for
   empty arrays, flags as string arrays, entity IDs instead of references,
   fixed 44×60 row-major grid, kind kept separate from content layers, schema
   validated after load and after generation. Center may be derived rather
   than stored; corridorCells endpoint convention must be fixed and enforced.
3. **Single RNG stream: KEEP, with a draw-order contract.** Same input state +
   same algorithm + same draw order ⇒ same floor. Contract: pass RNG state
   explicitly, fix pass/candidate order, sort candidates before order-
   sensitive operations, no unseeded randomness or runtime hashes, treat any
   added/removed draw as a potential generation-version change, record
   generator + RNG versions in save metadata, add a golden-seed test comparing
   canonical JSON between game and Scout. Per-stream isolation deferred until
   stable layouts-despite-decoration-changes is actually needed, and then with
   a versioned RNG scheme.

**Amendment status:** unblocked. The §10 amendment can now be written on the
user's word, adopting: portal doors on the kept wall model, plain-JSON
topology records, the single-stream draw-order contract + version fields, the
12-check list, repair priorities, and the placement contract.

## 3. Recommendation

Fold this spec into `LOOT-SKILLS-DESIGN.md` §10 after the reconciliation reply
lands and the user reviews this file: keep the portal-door rule, the
purpose/category vocabulary, the 12-check list, the repair priorities, and the
placement contract; resolve the perimeter-model and RNG questions on the
evidence of the follow-up, not by default. Phase 6's build order should follow
ChatGPT's 8-step order (doors → IDs/records → fallback → graph → purposes →
contract → validation → repairs/tests), which is compatible with our phase
sequence.
