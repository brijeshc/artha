# Task 23 - Atlas elevation: from readable to knowledge discovery

**Status: 23a shipped 2026-07-07; 23a′ (the board pivot) shipped the same day and supersedes 23a's wiring lens; 23b-23e specced below, sequenced by impact per effort.**

**Depends on:** v0.2 T16d (atlas shell), T17 (write-back), T17b (reference graph); 21a (inferred layer feeds the two-light grammar).
**Design refs:** Dashboard.md §11 (the shell this elevates) and §12 (the lens grammar + honest readouts, recorded at 23a ship time); the 21c UX contract D1-D12 (21-inferred-layer.md), which 23d partially delivers.

## Why

Assessment of the shipped dashboard (2026-07-07, on the demo): the shell is right, but the experience sits at 6.5-7/10 against the product's own bar.
Three structural gaps keep it from being a knowledge-discovery instrument:

1. **Nothing was ever drawn between things.**
   T17b mined a full import graph and flows literally span modules, yet no edge or journey was ever rendered - the single most requested reading ("architecture diagrams that link code to meaning") had no surface.
2. **The terrain is empty.**
   A module tile is a flat rectangle with a corner label; at demo scale that is hundreds of thousands of pixels carrying zero information, which reads as low quality regardless of craft elsewhere.
3. **The numbers were thin and one was a lie.**
   The top bar said "100% explained" above a queue of partly-explained modules (the exact D11 failure), and none of the computed signal (churn, coverage, freshness, history) existed as a chart.

The elevation program closes these in order: draw the linkage (23a), texture the terrain (23b), spend the numbers on charts (23c), make reading into reviewing (23d), then finish the craft debt (23e).

## 23a - honest KPIs + the drawn linkage (shipped 2026-07-07)

- [x] **D11 KPI reframe (partial).** Top bar: `% vouched` (churn-weighted certified *depth* via the saturating coverage curve - one lucky fact cannot claim a module) and `% described` (machine reach, moonlight tone `tone-moon`), plus dark zones and stale.
      "Explained" is gone; the machine layer can never inflate the trust number.
      The third D11 readout (disagreements) still waits on T22.
- [x] **Area rollups honest too.** Navigator meters and the area inspector now show the same vouched-depth metric, worded "vouched".
- [x] **Wiring lens.** `#/?lens=wiring` dims the terrain and draws every T17b import edge as an arc (tile centre to tile centre, endpoints inset), thickness ∝ import count, arrowhead at the imported module, opposite directions bowing apart.
      Selection makes a module's edges hot and fades the rest; edges to unplaced modules are skipped, never guessed.
      Structure draws in grey ink - never phosphor (wiring is proof, not meaning).
- [x] **Flow routes.** `#/?f=<flow>` traces a flow as a transit line: linked steps resolve their pins to modules (stations, consecutive same-module steps collapsing into one numbered stop), the line draws in the flow's own status colour (D2: no new hue), stations light while the rest of the terrain dims.
      A route card (in whichever corner is farthest from the stations) lists every step - unlinked steps stay as honest dashed gaps that draw nothing.
      Entry point: "Trace on atlas" on the flow page; Esc clears focus but keeps the lens.
- [x] Tests (router round-trips, edge geometry, trace collapse, lens/route markup), lint, typecheck; demo seed extended so the refund flow shows a real multi-station route *and* keeps an unlinked step.

## 23a′ - the board pivot (shipped 2026-07-07, supersedes the wiring lens)

Developer verdict on 23a, same day: the honest KPIs stand, but arrows over a treemap "make it even more confusing" - a treemap has **no empty space**, so nothing drawn over it can ever be clean.
The stated design philosophy to pivot on: **a handmade flowchart on a classroom blackboard** - simple, ample space, clean, draggable.
That is also how a senior engineer actually explains a codebase, which makes it the right genre for a knowledge-discovery product, not just a prettier skin.

What shipped:

- [x] **The Board is the default canvas** (`#/`); the treemap demotes to a **Terrain** nav item (`#/?lens=terrain`) for the churn/coverage analytics reading.
      The wiring lens is deleted - the board *is* the wiring, with room to breathe.
- [x] **Chalk register** (`web/src/rough.ts`): seeded, deterministic hand-drawn strokes (wobbly lines, corner overshoot, double-pass frames), chalk handwriting for module names via system faces only (`--chalk`), on a blackboard ground.
      The two-light grammar survives as chalk colours: phosphor frame = vouched, moonlight = described, dim grey = unexplained, an ember chalk tick = stale.
- [x] **Layered auto-layout** (`web/src/board.ts`): consumers on top, foundations below (longest-path layering, cycle-safe, deterministic), generous gaps as a design feature; edges are chalk arrows reading "depends on", stopping at box borders, thickness by import count, hot/faded on selection.
- [x] **Drag to arrange**: boxes drag with pointer capture; positions persist per browser (`artha.board.layout.v1`), "Tidy the board" forgets them; a drag never navigates; the paper grows so a dragged box never falls off; scroll pans.
- [x] **Flow routes moved onto the board**: same `flowTrace` derivation, numbered chalk station badges on box corners, route legs border-to-border in the flow's status colour, route card bottom-right, "Trace on the board" from flow pages.
- [x] Selection grammar unchanged (click selects + opens the inspector, click again opens the module page); `#/?m=`/`#/?a=` deep links land on the board; Esc clears focus, keeps the lens.
- [x] 337 tests (chalk determinism, layering incl. cycles, no-overlap, board markup, routes, honest-gap card), lint, both typechecks, live demo screenshots.

## 23a″ - meaningful chalk + fullscreen focus (shipped 2026-07-07)

Developer review of the board: right direction; wanted fullscreen in any view, meaningful data *on* the board, and the foundations for 21b to enrich it.

- [x] **Chalk annotations on every box.** Name, the machine's one-line description in moonlight italic (clamped, full text in the tooltip), up to two capabilities the module carries in product language with standing dots (phosphor/amber/ember chalk for vouched work, moonlight for machine-described), an honest `+N more`, and the standing line; the stale tick underlines the certified count it caveats.
      The board now shows the code↔meaning linkage directly, not just architecture.
- [x] **The 21b slot.** `/api/map` modules gain `describedAs` - the module card's plain-language description, deterministic 21a prose today, the exact field 21b's LLM synthesis overwrites.
      When `artha infer` lands, the board (and any other reader of the map feed) gets richer prose with zero client rework; `capabilitiesByModule` likewise picks up enriched inferred concept/flow names automatically.
- [x] **Fullscreen focus in any view.** A top-bar toggle (and `f` anywhere, guarded against typing) folds the navigator/inspector away and requests native fullscreen where the browser allows; Esc leaves focus before it clears selection; leaving native fullscreen by any means unfolds the chrome too.

## Design philosophy (locked by this pivot)

**The blackboard is the organizing genre for knowledge discovery**: few marks, generous space, hand placement, chalk = light.
Every future discovery surface should ask "how would this look hand-drawn on the board?" before reaching for a denser encoding.
Charts (23c) stay in the observatory; density stays in Terrain; the board stays clean.

## 23b - inner boards (drill the blackboard down)

Re-aimed by the 23a′ pivot: depth comes from **boards within boards**, not treemap texture.

- Opening a module from the board offers its **inner board**: the module's files (later symbols) as chalk boxes, their imports as arrows, pinned facts lighting the boxes that carry them.
- Capability chalk-marks on module boxes (small concept/flow glyphs), so the product layer is on the board itself, not only in the navigator.
- The level-2 *treemap* texture stays an optional Terrain nicety, no longer the headline.
- Acceptance: a newcomer can descend board → module board → code without meeting a wall of text; every inner board obeys the blackboard philosophy (few marks, ample space, draggable).

## 23c - the observatory (charts that answer questions)

- **Flying-blind quadrant:** churn (x) vs vouched depth (y), one dot per module in its standing colour - the leadership question as one chart.
- **Vouched burn-up:** the certification time series reconstructed from `git log` over `.artha/` - history is already in git, no new storage; drawn as a plain line with the phosphor reserved for the vouched series.
- **Per-area bars:** vouched / described / unexplained shares, stacked, one row per product area.
- All hand-rolled SVG like `treemap.ts` (zero deps, offline); follow the dataviz method (one axis, direct labels, no new hues - the status palette is the chart palette).
- Placement: a fourth navigator view ("Observatory"), not widgets crowding the atlas.

## 23d - reading is reviewing (delivers part of 21c)

This slice *is* the D5/D6/D9/D10 portion of the 21c contract - build it against that spec, do not fork it:

- Evidence chips inline on every inferred sentence (D5): hover/click reveals the pinned code lines.
- The review pass (D9): `R` on any module/capability page walks claim by claim - claim left, pinned code right; `v` vouch, `e` edit, `x` flag, `j`/`k` move; one keystroke per decision, exit anywhere.
- The delta band (D6): "What the code can't say" as typographically distinct human ink on every capability/module page.
- The queue re-ranked by value (D10) with a worded "why now" per row.

## 23e - craft debt (small, visible)

- Catalog dedup: one card per capability with area chips, instead of the same card repeated under every area it touches.
- State-machine layout: redraw concept lifecycles in the **chalk register** (the board's rough strokes), layered left-to-right with orthogonal return edges.
- State table honesty: empty effect/invariant cells say "not read from code" instead of a bare dash.
- Board refinements: crossing-minimizing order within layers (barycenter pass), chalk area boundaries (dashed provinces around same-area boxes when adjacent), a shareable committed layout (`.artha/board.yaml`) so a team sees one hand-arranged board, zoom.
- More trace entry points: navigator flow rows and catalog flow cards offer the trace, not only the flow page; inferred flow skeletons trace in moonlight.

## Out of scope

- Symbol-level call graphs (unchanged v0.2 position).
- Any new hue (D2 stands everywhere: phosphor, moonlight, amber, ember, grey ink carry everything).
- Physics/force-directed layouts - the board is layered and hand-arranged, never jittering.

## Contracts produced (23a + 23a′ + 23a″)

- Atlas route params: `lens=terrain`, `f=<flowId>`; `#/` is the board.
- `web/src/rough.ts` (seeded chalk strokes) and `web/src/board.ts` (`boardLayout`, `borderPoint`) - pure, SSR-tested; any future hand-drawn surface (23b inner boards, 23e chalk state machines) draws with them.
- `derive.flowTrace(detail, modules)` and `derive.capabilitiesByModule(catalog)` - pure derivations shared by any canvas.
- **`MapModule.describedAs`** on `/api/map` - the machine's per-module prose; the 21b synthesis writes here and every reader upgrades for free.
- `Kpi.tone` gained `moon`; `AreaStat.explained` renamed to `vouched` (the honest metric everywhere).
- Persisted hand layout: `localStorage['artha.board.layout.v1']` (per-browser; the committed team layout is 23e).
