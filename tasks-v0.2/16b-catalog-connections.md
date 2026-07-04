# Task 16b — Dashboard redesign, Phase 2: capability catalog + connections + command-bar search

**Depends on:** 16a (KPI header + Understanding Map + selection state).
**Spec refs:** [SPEC-v0.2.md](../SPEC-v0.2.md) §B (concept/flow detail; status everywhere),
§Done-when (detail views; search wired).
**Design refs:** [Dashboard.md](../design/Dashboard.md) §§5.2, 5.6, 5.7, §9 Phase 2;
[Product.md](../design/Product.md) §10.2 (concept/flow catalog), §10.3 (the map *is* the
authoring surface — this builds the seam T17 writes through).

## Goal

Make the product's capabilities **discoverable and connected**. Turn concepts/flows from
buried list items into a **glanceable catalog**, draw the **product↔code connection** for the
focused item (the real "map" relationship, legibly, at any repo size), and make **search** a
first-class command bar — the discovery primitive a portal lives on.

## Scope

- **Capability catalog** ([Dashboard.md](../design/Dashboard.md) §5.2) — concepts and flows as a
  filterable **grid of cards**, each glanceable from existing data:
  - concept card previews its **state chain** (e.g. `trialing→active→past_due→canceled`) +
    state count; flow card previews its **step spine** + coverage ("2 of 6 not linked");
  - **status as a colored dot** (certified/proposed/stale), module shown, click → detail;
  - filter by area and status; the catalog is also where search results land (below).
- **Selection-driven connections** ([Dashboard.md](../design/Dashboard.md) §5.6) — replace the
  static "two columns with lines" idea with **focused** linking:
  - select a capability card → its modules **light up on the Understanding Map** and thin
    **leader lines** draw from the card to those tiles;
  - select a map tile → the capabilities that touch it light up in the catalog;
  - connections are derivable from pins already in the map feed + detail responses — **no new
    endpoint**. Only the focused item's links draw, so it stays legible on a large repo
    (the hairball the SPEC warns against never appears).
- **Command-bar search** ([Dashboard.md](../design/Dashboard.md) §5.7) — promote the inline box
  to a persistent **⌘K-style command bar** ("Find a capability, module, or rule…"):
  - reuse the existing debounced `/api/search` fetch; group results by kind;
  - concept/flow hits open detail; **module hits focus/scroll the map tile**; other kinds
    render inert (as today). Keyboard-openable and dismissible.

## Out of scope

- Engineer module view, flow-ladder detail rework, cold-start funnel → **16c**.
- Drag-to-pin / certify / edit (the *write* half of "visualization is curation") → T17 — but
  the selection + connection state here is the surface T17 attaches those actions to.
- Contradiction panel → T19. Ask interview → T18.

## Contracts produced

- The capability catalog + connection-highlight state, layered on 16a's selection model
  (still the T17 seam).
- A pure "links for a focused item" derivation over the map/detail data — reused by 16c's
  module view.

## Acceptance criteria

- [ ] Concepts and flows render as cards with a state-chain / step-spine preview, a colored
      status dot, and module; clicking opens the correct detail view.
- [ ] Catalog filters by area and by status; an empty/cold catalog shows an inviting empty
      state, not an error.
- [ ] Selecting a capability lights its modules on the map **and** draws leader lines to them;
      selecting a module lights its capabilities in the catalog. Only the focused item's
      connections draw (verified legible on a real-sized fixture — no hairball).
- [ ] The command bar opens via keyboard, queries `/api/search`, groups hits by kind, opens
      concept/flow detail, and focuses the map tile for a module hit.
- [ ] Everything stays **read-only and offline**; search degrades to empty (never error) when
      the index is cold.
- [ ] Rendering tests assert: a card carries its preview + status; the focused-item connection
      set is correct for a fixture; search hits route to the right target kind.
