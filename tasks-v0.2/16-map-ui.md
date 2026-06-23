# Task 16 — Product↔Code map + concept/flow detail (UI)

**Depends on:** 15 (read API + app skeleton).
**Spec refs:** [SPEC-v0.2.md](../SPEC-v0.2.md) §"B" (map at area/module altitude, detail view, status everywhere); Done-when (map renders; detail view); the **success test** (a non-author reads a capability off the map).
**Design refs:** [Product.md](../design/Product.md) §10.2 (core views).

## Goal

Render the dashboard's centerpiece — the **Product↔Code map at area/module altitude** and the
**concept/flow detail views** — legibly enough that a non-author can read a capability and
describe it without reading code. **Legibility is the load-bearing requirement**, not polish.

## Scope

- **Map view (centerpiece):** two columns — product areas ↔ top-level code modules — with pins
  drawn as links. Selecting an area/concept lights up its implementation. **Dark zones**
  (high-churn, no-meaning modules) are visibly marked. Status (`certified`/`proposed`/`stale`)
  shown per item. Symbols are **not** drawn at this altitude — only on drill-down.
- **Concept detail:** the state machine (states + transitions), governing invariants/conventions,
  and the *why* (decisions), each linked to the symbols that implement it. Product reads states;
  engineers click into code.
- **Flow detail:** the ordered sequence; steps with `pin: null` shown clearly as "not yet
  linked" (the v0.3 coverage seam), not as errors.
- **Search:** wire `GET /api/search` into a find-a-capability box.
- **Empty/cold state:** a mostly-dark map with an inviting "explain these" entry into the
  dark-zone queue — never a blank error.

## Out of scope

- Any **write** interaction — linking, certifying, editing (T17). The ask interview (T18). Contradiction panel (T19).

## Contracts produced

- The rendered map + detail + search views; selection/drill-down state the write features (T17) hook into.

## Acceptance criteria (SPEC Done-when: map + detail views)

- [ ] The map renders at **area/module altitude** on a real-sized fixture **without** becoming
      a full-symbol hairball; dark zones are visually distinct.
- [ ] Selecting a concept shows its **states + transitions + governing rules + why**, each
      linked to symbols, with `status` on every item.
- [ ] A flow with a `pin: null` step renders it as "not yet linked," not an error.
- [ ] Cold start → mostly-dark map with a working path into the ask-queue, no blank/error screen.
- [ ] **Legibility check (gate for T20):** on the proof repo, a reader can name a capability's
      states from the detail view alone. (Rendering tests cover structure; T20 does the human run.)
- [ ] All views are read-only here and work **offline**.
