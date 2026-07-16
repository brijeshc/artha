# Artha v0.3 - task index (2026-07-05)

**Status: re-centering locked; 21a + task 23 + task 24 shipped; 21b underway (21b-1 - the synthesis pipeline - done).**
Product.md §12 headlined v0.3 as "contradiction detection + trust".
This re-centers v0.3 around **the inferred layer**: a machine-extracted, full-coverage description of code meaning that does the heavy lifting *before* any human is asked for anything.
Rationale and evidence are in [21-inferred-layer.md](21-inferred-layer.md) §Why; the OQ locks are recorded there and in [../PROGRESS.md](../PROGRESS.md).
Contradiction detection remains in v0.3, but as a near-byproduct: once inferred meaning exists, "inferred disagrees with certified" *is* the loophole view.

**Progress:** 21a is done - all four offline extractors ship (module cards + state machines in slice 1; flow skeletons + naming conventions in slice 2), evidence-pinned and byte-deterministic, so a stranger's repo renders a complete moonlight map with zero human input.
**23a is done (2026-07-07)** - the atlas elevation's first slice: honest D11 KPIs (% vouched / % described, no more "explained"), the board pivot (a handmade flowchart on a blackboard), and flow routes.
**23b is done (2026-07-08)** - inner boards: drilling a module into its own blackboard of files + imports.
**23c is done (2026-07-09)** - the observatory: three hand-rolled instrument charts (flying-blind quadrant, vouched burn-up, per-area two-light bars) on a fourth navigator view, built to the dataviz method.
**23d-1 is done (2026-07-09)** - evidence revealed (D5): every pin reveals its exact source lines one click away.
**23d-2 is done (2026-07-09)** - vouch-by-reading (D9 core + OQ-A): an inferred concept/flow can be vouched or corrected in place, materializing into a real `.artha/` entry with `derived_from` provenance - the moonlight layer is now actionable, not just readable.
**23d-3 is done (2026-07-11)** - the review walk (D9): press `R` (or a top-bar Review pill) on any module/capability page to sweep its unvouched claims one at a time - claim left, code right, one keystroke to vouch or correct - page-scoped, never a global queue, and needing no new backend.
**23d-4 is done (2026-07-12)** - the delta band (D6): every capability/module page carries a distinct "What the code can't say" slot for the business rules, constraints, history, and warnings no code holds, rendered as human ink over the machine's print; a new additive `notes` field (`POST /api/notes`) records it without un-certifying the vouched claim, and the states table now marks per-field provenance ("not read from code" instead of a bare dash).
**23d-5 is done (2026-07-12)** - the value queue (D10): the ask queue ranks by agent-consumption × churn × uncertainty, every row wording its own "why now". 23d is complete.
**24 is done (2026-07-16)** - a full UX audit (2026-07-15) found the app harder to follow than its data warrants; all seven slices shipped within two days.
One vocabulary (vouch everywhere, the three-light ladder), honest numbers ("Explain next", dark = unvouched, a reachable vouched %), a default view that fits and defines itself (fit-to-view, zoom, board legend, Δ defined), findability (prefix search, clickable rule hits, arrow keys), one card per capability, a safe review walk (Enter never writes; vouch has undo), and reading-order fixes.
See [24-usability.md](24-usability.md).
**23e-1 is done (2026-07-16)** - the lifecycle in chalk: concept state machines are redrawn in the board's own rough strokes, laid out left-to-right, with a return (a cancel, a retry) routed orthogonally through a lane under the boxes and provably clear of every box it isn't about.
The atlas now reads as one continuous hand at every altitude: repo board → module board → lifecycle.
A box also wears the concept's own standing now, instead of drawing every lifecycle in the phosphor of trust.
**23e-2 is done (2026-07-16)** - the board straightens its rows (a barycentre pass that keeps each product area whole) and outlines an area as a dashed chalk province wherever its modules genuinely sit together.
**23e-3 is done (2026-07-16)** - the team's board: a hand-arranged blackboard can be committed to `.artha/board.yaml` as an ordinary git diff, so it stops dying in the one browser that made it.
Seats answer in order - your hand, then the team's, then the automatic layout - and the file is arrangement only, never meaning: it never reaches the index, an agent, or the numbers.
**23e-4 is done (2026-07-16)** - more trace entry points: a flow's trace is offered wherever a flow is named (navigator rows, catalog cards), and a machine-read flow traces as what it **reaches**, never as a route. **Task 23 is complete.**
**21b-1 is done (2026-07-16)** - the LLM synthesis pipeline: `artha infer` enriches the 21a candidates into product-language names + readable summaries via a pluggable engine (`api` / `claude-cli`, reusing the T06 pattern), opt-in and spend-capped, incremental by a content-hash cache (`.artha/.inferred.json`), with a deterministic **verifier gate** that downgrades any ungrounded claim to `uncertain`; `artha build` overlays the cache and silently reverts on drift.
**The next work is the rest of 21b** (transitions + flow-step text, MCP serving the layer labeled, the `uncertain` render), then 22 (contradiction view), then T18.

| #   | Task | Depends on | One-line summary |
|-----|------|------------|------------------|
| 21a | [Inferred layer - deterministic candidates](21-inferred-layer.md) | v0.2 T12, T13, T17b | offline, LLM-free extraction: module cards, state-machine/flow/convention candidates, all evidence-pinned; the map is never black |
| 21b | [Inferred layer - LLM synthesis + verification](21-inferred-layer.md) | 21a, v0.1 T06 engine | opt-in, spend-capped, incremental synthesis into readable meaning; every claim cites pins; verifier gates confidence. **21b-1 done (2026-07-16): the pipeline - `artha infer`, names+summaries, verifier → inferred/uncertain, build overlay** |
| 21c | [Inferred layer - dashboard reframe](21-inferred-layer.md) | 21a (21b enriches), v0.2 T16d/T17 | two-light map (moonlight/phosphor), vouch-by-reading, the delta band, inverted interview entry |
| 22  | Contradiction view (inferred vs certified) | 21b | the v0.3 loophole view, seeded by disagreement between the machine layer and vouched facts |
| 23  | [Atlas elevation](23-atlas-elevation.md) | T16d, T17b, 21a | drawn linkage (wiring lens + flow routes, **23a shipped**), terrain texture, observatory charts, review mode (delivers 21c's D5/D6/D9/D10), craft debt (**23e-1 chalk lifecycles, 23e-2 straightened rows + provinces, 23e-3 the team's board - all shipped**) |
| 24  | [Usability hardening](24-usability.md) | 23a-23d shipped surface | **done 2026-07-16** - one vocabulary (vouch), honest numbers, orientation on the default view, findability, capability dedup, walk safety, reading order |

## Interplay with unfinished v0.2 tasks

- **T18 (ask-the-human loop)** should be built *after 21a* so its interview is draft-first ("here is my read - what did I get wrong?") instead of blank-first ("explain this module").
  Building T18 against a dark map bakes in the authoring model this re-centering rejects.
- **T20 (success test)** gains a second arm: the non-author test must pass on **inferred content alone** (zero human input, stranger repo), and separately measure how vouching changes trust.

## Critical path

21a → 21c (structural value, fully offline) with 21b enriching both; 22 and T18 hang off 21b.
23 runs alongside: 23a (shipped) needed nothing new from the backend; 23b/23c are pure dashboard, and so is 23e apart from 23e-3's one `.artha/board.yaml` seam; 23d is the delivery vehicle for 21c's D5/D6/D9/D10.
**24 sat in front of 21b/22/T18** (decision 2026-07-15) and **shipped 2026-07-16**: the surface is hardened; 23e's remaining craft items are next, then 21b.
