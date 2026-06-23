# Task 11 — Schema: `concept` + `flow` kinds

**Depends on:** v0.1 T02 (schema types, JSON Schema, AJV validator, YAML load/dump).
**Spec refs:** [SPEC-v0.2.md](../SPEC-v0.2.md) §"A. Two new schema kinds"; Done-when #1.
**Design refs:** [Product.md](../design/Product.md) §6.1 (concept), §6.5 (flow); [schema-v0.1.md](../design/schema-v0.1.md) §3 (reserved prefixes), §2 (base entry).

## Goal

Add the two product-meaning kinds the map maps *to* — `concept` (a capability with a state
machine) and `flow` (a cross-cutting sequence) — as a clean, additive extension of the frozen
v0.1 base model, so they validate, round-trip through YAML, and are ready to build and serve.

## Scope

- **Author `design/schema-v0.2.md`** — the concrete data model for both kinds, mirroring the
  style of schema-v0.1.md (field tables + examples + JSON Schema). This is the lockable
  artifact; nail it before code (same discipline as v0.1).
- **`concept`** (`id` prefix `concept.`):
  - `name` (req), `summary` (req — the product meaning), `states` (list of `{ name, effect?,
    invariant? }`), `transitions` (list of `{ from, to, trigger }`), `pins`, `related`.
  - States/transitions are the **intent not in the TS types** — the high-value payload.
- **`flow`** (`id` prefix `flow.`):
  - `name` (req), `summary` (req), `steps`/`transitions` (ordered list of `{ on?, do, pin? }`),
    `entry` (pinned entry symbol(s)), `related`.
  - A transition with `pin: null` is **valid** in v0.2 (coverage-of-every-transition is a v0.3
    check) — model it, don't reject it.
- **Types** (`src/schema/types.ts`): add `Concept`, `Flow`, `State`, `Transition`, `FlowStep`
  to the `ArthaEntry` union.
- **JSON Schema** (`src/schema/schema.json`): add `concept`/`flow` sub-schemas via `allOf` on
  the shared `base`, reusing `$defs` (pin, provenance, id). Extend the `id` pattern and the
  `kind` enum to include the two kinds.
- **Validation**: certify fields, id-prefix-matches-kind, and unique-id rules apply unchanged.

## Out of scope

- Building / indexing them (T12). Resolving their pins (T12).
- Flow **coverage** detection (v0.3). Concept **contradiction** checks beyond schema validity (T19/v0.3).
- The `exception` kind (v0.3).

## Contracts produced

- `design/schema-v0.2.md` (the locked model) + extended `types.ts` / `schema.json` / validator.
- A `Concept`/`Flow` TS type that T12 indexes and T16 renders.

## Acceptance criteria (SPEC Done-when #1)

- [ ] A well-formed `concept` YAML (states + transitions) and a well-formed `flow` YAML
      (ordered steps, one with `pin: null`) both **validate**.
- [ ] An ill-formed one (missing `summary`; `id` prefix not matching `kind`; bad transition
      shape) **fails validation** with a clear error.
- [ ] YAML load → dump **round-trips** both kinds losslessly (vitest).
- [ ] Existing v0.1 entries (decision/invariant/convention) still validate unchanged — the
      extension is additive, not breaking.
- [ ] `certified` requires `certified_by` + `certified_at` for the new kinds too.
