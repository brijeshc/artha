# Task 16c — Dashboard redesign, Phase 3: engineer module view + flow ladder + cold-start funnel

**Depends on:** 16a (map + selection), 16b (connections + catalog).
**Spec refs:** [SPEC-v0.2.md](../SPEC-v0.2.md) §B (concept/flow detail; status everywhere),
§Edge cases (cold start = mostly-dark map, never a blank/error), §Done-when.
**Design refs:** [Dashboard.md](../design/Dashboard.md) §§5.4, 5.5, 5.8, §9 Phase 3;
[Product.md](../design/Product.md) §10.1 (the engineer lens — "enter from code").

## Goal

Complete the three-lens promise: give the **engineer** a way in *from a code module*, make the
flow detail's **coverage** read as an honest "incomplete map," and turn the cold start into a
funnel that invites the first explanation instead of showing emptiness.

## Scope

- **Module view (engineer lens)** ([Dashboard.md](../design/Dashboard.md) §5.5) — clicking a map
  tile opens the module: the **concepts/flows that touch it**, the **invariants/conventions in
  scope** and the **why** (decisions) via `related`, plus its churn / coverage / certified /
  stale facts — each drilling down to the symbol. Data exists today (pins carry the module;
  `related` carries the rules); a thin server shaping helper is acceptable if the current
  endpoints don't already return module-grouped facts (keep it pure + read-only).
- **Flow ladder coverage** ([Dashboard.md](../design/Dashboard.md) §5.4) — render a flow as a
  vertical **ladder**: each step shows linked ✓ / **not-yet-linked ○**, with the count surfaced
  at the top ("4 of 6 steps linked"). The `pin: null` step stays "not yet linked" (the v0.3
  coverage seam) — but now reads as a *visible gap in a ladder*, never an error.
- **Cold-start funnel** ([Dashboard.md](../design/Dashboard.md) §5.8) — when the index is cold,
  the map is honestly **mostly dark** (the true signal), the KPI header reads **"0% of active
  code explained,"** and a single clear call-to-action funnels into the **dark-zone queue**
  (darkest/busiest first, the T13 ranking). No essay, no blank screen — the emptiness is the
  invitation. (The *act* of explaining is T18; this phase only opens the door to the queue.)

## Out of scope

- Drag-to-pin / certify / edit → T17. The ask interview / capture flow itself → T18.
- Contradiction panel → T19. The success-test protocol/harness → T20.

## Contracts produced

- The module-detail view + flow-ladder + cold-start funnel, completing the read-only dashboard
  the success test (T20) runs against and the write features (T17/T18) attach to.

## Acceptance criteria

- [ ] Clicking a map tile opens a module view listing the concepts/flows, invariants/
      conventions, and decisions that touch it, each with `status` and a path to the symbol.
- [ ] A flow renders as a ladder with per-step linked/not-linked markers and a top-line
      coverage count; a `pin: null` step shows "not yet linked," not an error.
- [ ] Cold start → mostly-dark map + "0% explained" KPI + a working funnel into the dark-zone
      queue; no blank/error screen, fully offline.
- [ ] **Legibility gate (for T20):** from a module tile alone, a reader can name the rules that
      govern that module; from a flow, they can see which steps are unimplemented.
- [ ] All views **read-only and offline**.
- [ ] Rendering tests assert: module view groups the right facts for a fixture module; the flow
      ladder marks linked vs null steps and the coverage count; cold start renders the funnel.
