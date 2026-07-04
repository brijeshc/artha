# Task 16a — Dashboard redesign, Phase 1: the Understanding Map + KPI header + drawn state machine

**Depends on:** 15 (read API + app skeleton), 16 (the components/seam this reworks).
**Supersedes:** the *scholarly-document* UI shipped in [16-map-ui.md](16-map-ui.md) — same
API, same data, same offline guarantees; this changes the **genre and the visual encoding**.
**Spec refs:** [SPEC-v0.2.md](../SPEC-v0.2.md) §B (map at area/module altitude, detail view,
status everywhere; legibility is a *hard* requirement), §Done-when (map + detail render).
**Design refs:** [Dashboard.md](../design/Dashboard.md) §§4–6, §9 Phase 1;
[Product.md](../design/Product.md) §10.1 (the leadership lens — "where you're flying blind"),
§10.2 (core views).

## Why this task exists

The first build of T16 read as **confusing — failing to deliver meaning** ([Dashboard.md](../design/Dashboard.md) §§1–2):
it rendered the centerpiece as two text lists, hid the quantities we already compute behind
9-point text, and spent the screen explaining Artha instead of the codebase. This phase is the
**make-or-break demo**: it flips the dashboard from a document into an instrument. The three
changes below are the ones that, on their own, move it from "confusing" to "informative."

## Goal

Render the codebase's meaning **at a glance**: a hero **Understanding Map** where churn and
coverage are encoded visually (not counted in text), a **KPI header** answering "how much of
this is explained," and a concept detail that **draws the state machine** instead of tabling
it. Legibility for a non-author remains the load-bearing requirement (the human run is T20).

## Scope

- **KPI header strip** ([Dashboard.md](../design/Dashboard.md) §6) — four stat blocks across
  the top, derived **client-side from the existing `/api/map` + `/api/dark-zones` feeds** (no
  new endpoint):
  - **% active code explained** — recommended: share of total churn sitting in non-dark
    modules (churn-weighted, so it reflects *active* code), with the plain module ratio as a
    fallback when total churn is 0.
  - **dark zones** — count of `dark` modules (with a "↑ busy" marker when the darkest also has
    the highest churn).
  - **stale** — Σ `staleFacts`. **certified** — Σ `certifiedFacts`.
  - Trend deltas (e.g. "+6 / 30d") are **out of scope** here (need history → v0.3); ship the
    absolute numbers only.
- **The Understanding Map (hero)** ([Dashboard.md](../design/Dashboard.md) §5.1) — replace the
  two-column text ledger with **one spatial field of module tiles, grouped under their product
  area**:
  - tile **size** ∝ churn (stepped buckets are acceptable — legibility over treemap fidelity;
    a floor keeps zero-churn modules visible);
  - tile **color** ∝ understanding health (understood → partial → thin → **dark zone**), using
    the per-module `coverage`/`dark` signal; stale carries a distinct marker;
  - selecting a tile keeps the existing **selection state** (the seam T17 hooks into) and
    surfaces the area↔module relationship in words/highlight as today — but on the map, not as
    a separate list;
  - a single **collapsible "How to read this"** replaces the abstract, glossary, and margin
    sidenotes (the legend/definitions move here, opt-in).
- **Concept detail — drawn state machine** ([Dashboard.md](../design/Dashboard.md) §5.3): render
  states as nodes and transitions as labeled arrows in a **hand-rolled, dependency-free SVG**
  (no d3/dagre — keep the bundle small and offline). Keep the per-state effect/invariant table
  *beneath* the diagram, and keep "Implemented in code" (pins) + "Why & related" unchanged.
  A concept with no states/transitions falls back to the existing prose-empty state.

## Out of scope

- Capability catalog cards, connection leader-lines, command-bar search → **16b**.
- Engineer module view, flow-ladder coverage rework, cold-start funnel → **16c**.
- Any **write** interaction (link/certify/edit) → T17. Ask interview → T18. Contradiction
  panel → T19.
- LOC/symbol-count per module for truer tile sizing — see OQ-A; v0.2 sizes by churn.

## Open question (do NOT silently resolve)

- **OQ-A — tile size input.** CodeScene sizes by LOC/complexity and colors by churn-driven
  health; we currently expose churn but **not LOC per module**. *Recommended default:* ship
  **size = churn, color = coverage** now (zero backend work, exercised on the real proof repo);
  add an optional LOC signal to `/api/map` later if the demo wants truer proportions. Flag for
  the developer; do not add the backend field without sign-off.

## Contracts produced

- A reworked map + concept-detail view. **The selection/drill-down state contract from T16 is
  preserved** so T17 write-back, T19 contradiction, and T20 still hook in unchanged.
- The KPI-derivation helper (pure, over the map feed) — reusable by 16b/16c.

## Acceptance criteria

- [ ] The KPI header shows the four numbers, computed from the existing feeds, correct against
      a real-sized fixture (and a cold/empty index → 0%, not an error).
- [ ] The Understanding Map renders module tiles **grouped by area**, with size encoding churn
      and color encoding coverage; **dark zones are the visually darkest tiles** and stale is
      marked. No symbol graph at this altitude (no hairball).
- [ ] Selecting a tile drives the same selection state as T16 (verified the T17 seam still
      holds); the area↔module link is legible on the map.
- [ ] Concept detail **draws** the state machine (SVG nodes + labeled transition arrows);
      states/effects/invariants remain readable beneath it; an empty machine degrades gracefully.
- [ ] The abstract/glossary/sidenotes are gone from the default view, folded into one
      collapsible "How to read this."
- [ ] **Legibility gate (for T20):** on the proof repo, a reader can (a) point to the riskiest
      unexplained area from the map alone and (b) name a concept's states from its detail.
- [ ] All views stay **read-only and offline**; bundle stays system-font, no network on read.
- [ ] Rendering tests (SSR `renderToStaticMarkup`, `node` env — same harness as T16) assert:
      KPI values present; tiles carry the size/heat encoding + module identity; the state-machine
      SVG contains a node per state and an edge per transition.
