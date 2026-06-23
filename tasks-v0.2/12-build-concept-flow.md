# Task 12 — `artha build`: index concepts & flows

**Depends on:** 11 (the new kinds), v0.1 T05 (build pipeline + index), v0.1 T04 (resolver).
**Spec refs:** [SPEC-v0.2.md](../SPEC-v0.2.md) §"A" (build/index/serve through the existing pipeline); Done-when #1.
**Design refs:** [schema-v0.1.md](../design/schema-v0.1.md) §8 (compiled index), §4 (pins/staleness).

## Goal

Extend the build so `concept`/`flow` entries are validated, pin-resolved, content-hashed, and
written into the SQLite index as queryable rows — giving the dashboard (T15/T16) and the agent
(MCP) a stable read contract for the product model.

## Scope

- **Pin resolution + hashing** — reuse the v0.1 resolver: a concept/flow pin resolves to a
  symbol or fails the build; recompute `content_hash`; a `certified` concept/flow whose pinned
  symbol drifted flips to `stale` (same mechanism as v0.1).
- **Index tables** (extend `src/build/db.ts` / `index.sql`):
  - Reuse `artha_facts` for the base row (`heading` = concept/flow `name`, `body` = `summary`).
  - `artha_states(fact_id, name, effect, invariant, ord)` — concept states.
  - `artha_transitions(fact_id, from_state, to_state, trigger, ord)` — concept transitions.
  - `artha_flow_steps(fact_id, on_event, do_action, pin_symbol_ref, ord)` — flow sequence
    (`pin_symbol_ref` nullable → drives the "not yet linked" / v0.3 coverage signal).
  - FTS5 includes the new `name`/`summary` text so concepts/flows are searchable.
- **Map feed**: ensure the index exposes enough to render the **area/module-level** map —
  i.e. each fact's pinned symbols map to their containing module/area (see T15 OQ5 for how
  "area" is defined; the build just records module paths per pin).

## Out of scope

- Embeddings (T14). Churn/coverage (T13). The HTTP layer (T15).
- Flow coverage / contradiction (T19, v0.3).

## Contracts produced

- Index rows for concepts/flows + their states/transitions/steps, queryable by T15/T16/MCP.
- A documented read shape (which tables, which columns) added to `schema-v0.2.md` §index.

## Acceptance criteria

- [ ] A repo with one `concept` (2 states, 1 transition) and one `flow` (2 steps, one
      `pin: null`) **builds** into the expected `artha_states` / `artha_transitions` /
      `artha_flow_steps` rows (vitest over a fixture).
- [ ] A concept/flow pin to a non-existent symbol **fails the build**, naming the ref.
- [ ] Changing a pinned concept symbol flips a `certified` concept to `stale` on rebuild.
- [ ] FTS search returns a concept by a word in its `summary`.
- [ ] v0.1-only repos build byte-identically (no regression) — the new tables are empty, not absent-erroring.
- [ ] Build stays **offline**.
