# Artha v0.3 - task index (2026-07-05)

**Status: re-centering locked; 21a shipped (the deterministic offline layer is complete).**
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
Then the delta band (D6) + value-ranked queue (D10) finish 23d, then 21b (LLM synthesis + verification) and 23e (craft debt).

| #   | Task | Depends on | One-line summary |
|-----|------|------------|------------------|
| 21a | [Inferred layer - deterministic candidates](21-inferred-layer.md) | v0.2 T12, T13, T17b | offline, LLM-free extraction: module cards, state-machine/flow/convention candidates, all evidence-pinned; the map is never black |
| 21b | [Inferred layer - LLM synthesis + verification](21-inferred-layer.md) | 21a, v0.1 T06 engine | opt-in, spend-capped, incremental synthesis into readable meaning; every claim cites pins; verifier gates confidence |
| 21c | [Inferred layer - dashboard reframe](21-inferred-layer.md) | 21a (21b enriches), v0.2 T16d/T17 | two-light map (moonlight/phosphor), vouch-by-reading, the delta band, inverted interview entry |
| 22  | Contradiction view (inferred vs certified) | 21b | the v0.3 loophole view, seeded by disagreement between the machine layer and vouched facts |
| 23  | [Atlas elevation](23-atlas-elevation.md) | T16d, T17b, 21a | drawn linkage (wiring lens + flow routes, **23a shipped**), terrain texture, observatory charts, review mode (delivers 21c's D5/D6/D9/D10), craft debt |

## Interplay with unfinished v0.2 tasks

- **T18 (ask-the-human loop)** should be built *after 21a* so its interview is draft-first ("here is my read - what did I get wrong?") instead of blank-first ("explain this module").
  Building T18 against a dark map bakes in the authoring model this re-centering rejects.
- **T20 (success test)** gains a second arm: the non-author test must pass on **inferred content alone** (zero human input, stranger repo), and separately measure how vouching changes trust.

## Critical path

21a → 21c (structural value, fully offline) with 21b enriching both; 22 and T18 hang off 21b.
23 runs alongside: 23a (shipped) needed nothing new from the backend; 23b/23c/23e are pure dashboard; 23d is the delivery vehicle for 21c's D5/D6/D9/D10.
