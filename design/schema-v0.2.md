# Artha — `.artha/` schema (v0.2 additions)

> Companion to [schema-v0.1.md](schema-v0.1.md) (the frozen base model), [Product.md](Product.md)
> (§6.1 concept, §6.5 flow, §10 human-facing layer), and [SPEC-v0.2.md](../SPEC-v0.2.md)
> (§A "Two new schema kinds"). This doc is the concrete, buildable data-model spec for the two
> product-meaning kinds v0.2 adds — **concept** and **flow** — the product-side anchors the
> dashboard's Product↔Code map maps *to*. It **extends, never breaks** v0.1: a v0.1 build that
> ignored unknown kinds keeps working; v0.2 builds them.
>
> v0.2 kinds: **concept**, **flow** (in addition to the v0.1 **decision** / **invariant** /
> **convention**). `exception` stays reserved for v0.3.

---

## 1. Directory layout (extended)

```
.artha/
  config.yaml
  decisions/           # v0.1
  invariants/          # v0.1
  conventions/         # v0.1
  concepts/            # NEW (v0.2) — domain capabilities with state machines
  flows/               # NEW (v0.2) — cross-cutting sequences
  # reserved (not in v0.2): exceptions/   (v0.3)
```

One entry per file, same as v0.1. The filename is not load-bearing — identity is the `id`
field. `artha init` scaffolds the two new dirs (each with a `.gitkeep`); the loader treats a
missing dir as empty, and the dashboard/review write-back creates a dir on demand.

---

## 2. Relationship to the base entry

`concept` and `flow` are **additive sub-kinds of the §2 base entry** (schema-v0.1.md). They
inherit every base field unchanged — `id`, `kind`, `status`, `certified_by`, `certified_at`,
`pins`, `mined_from`, `related`, `tags` — and the same lifecycle (§6, schema-v0.1.md), the same
pin/staleness mechanism (§4, schema-v0.1.md), and the same certification rule (`certified`
requires `certified_by` + `certified_at`). Only the **kind-specific payload** is new.

What's genuinely new and high-value is the **intent that is not in the TS types**: a concept's
**state machine** (states + transitions) and a flow's **ordered sequence** (steps). That payload
is the reason a non-author can read a capability off the map without reading code.

### Identity

- `id` prefix must match `kind`, same as v0.1: `concept.subscription`, `flow.checkout`.
- The `id` pattern extends to `^(decision|invariant|convention|concept|flow)\.[a-z0-9_]+$`.
- Cross-references (`related`) use `id`, never filenames, and may point at any kind:
  `related: [concept.invoice, decision.no_float_money]`.

---

## 3. `concept` — a domain capability with its state machine

What a thing *means* in the product, including the states it can be in and the transitions
between them. This is the **product-side anchor** of the map (Product.md §6.1). It pins to the
symbol(s) that implement it; the dashboard draws the concept↔code link from those pins.

| Field | Type | Req? | Notes |
|---|---|---|---|
| `name` | string | yes | The capability's product name (`Subscription`, `Checkout`). |
| `summary` | string | yes | The product meaning, in a sentence or two. The legible payload a reader sees first. |
| `states` | State[] | no | The state machine's nodes — intent **not** in the TS types. |
| `transitions` | Transition[] | no | Edges between states. |
| `pins` | Pin[] | no | The symbol(s) embodying the concept (§4, schema-v0.1.md). |
| `related` | id[] | no | Cross-links to other entries (concepts, decisions, invariants…). |

`states`/`transitions` are **optional** — a concept can be captured summary-first and grow its
state machine later through the v0.2 "ask the human" interview. A concept with neither is valid
(just a named capability + meaning); one with both is the full payload.

### State (`states[]`)

| Field | Type | Req? | Notes |
|---|---|---|---|
| `name` | string | yes | The state's name (`active`, `past_due`). Referenced by transitions. |
| `effect` | string | no | Free-text: what holds / what the system does in this state. |
| `invariant` | string | no | Free-text: a rule true *in this state* (not a cross-ref to an `invariant` entry — that's `related`). |

### Transition (`transitions[]`)

| Field | Type | Req? | Notes |
|---|---|---|---|
| `from` | string | yes | Source state name. |
| `to` | string | yes | Target state name. |
| `trigger` | string | yes | What causes the transition (`first successful invoice`). |

> v0.2 does **not** validate that `from`/`to` name a declared `state`, nor that every transition
> has an implementation. Referential coverage (transition ↔ code) is the **v0.3** flow-coverage /
> contradiction checker ([contradiction-detection.md](contradiction-detection.md) §5). v0.2 models
> and visualizes the machine; it does not prove it.

```yaml
# .artha/concepts/subscription.yaml
id: concept.subscription
kind: concept
status: certified
name: Subscription
summary: >
  A customer's ongoing paid access to a plan. Source of truth for entitlement:
  access checks read Subscription.status, never the Stripe object directly.
states:
  - name: trialing
    effect: no charge; entitlement granted
  - name: active
    invariant: currentPeriodEnd is non-null and in the future
  - name: past_due
    effect: entitlement retained for a 7-day grace window
  - name: canceled
    effect: entitlement revoked at period end, not immediately
transitions:
  - { from: trialing, to: active,   trigger: first successful invoice }
  - { from: active,   to: past_due, trigger: invoice payment failed }
  - { from: past_due, to: canceled, trigger: grace window elapsed }
pins:
  - symbol: src/billing/Subscription.ts#Subscription
related: [concept.invoice, invariant.money_minor_units]
certified_by: brijesh
certified_at: 2026-06-24
```

> Note on Product.md §6.1: that early sketch used `kind: domain_concept` and an inline
> `name: x { effect: ... }` shape that isn't valid YAML. The canonical, lockable form is the one
> here — `kind: concept` (so the id-prefix-matches-kind rule holds, consistent with every other
> kind) and explicit `states[]` / `transitions[]` mappings.

---

## 4. `flow` — a cross-cutting sequence

A multi-step behavior that spans services (checkout, onboarding, refund). It holds the **ordered
sequence**, the **entry point(s)** as pins, and per-step pins into the code that implements each
step (Product.md §6.5). Kept lightweight: it links to the concepts/invariants above via `related`
rather than restating them.

| Field | Type | Req? | Notes |
|---|---|---|---|
| `name` | string | yes | The flow's product name (`Checkout`). |
| `summary` | string | yes | What the flow does, end to end. |
| `steps` | FlowStep[] | no | The ordered sequence. Order in the list **is** the sequence order. |
| `entry` | Pin[] | no | The entry-point symbol(s) — where the flow starts in the code. |
| `pins` | Pin[] | no | Inherited from base; rarely needed when `entry` is set, but allowed. |
| `related` | id[] | no | Cross-links to the concepts/invariants the flow touches. |

### FlowStep (`steps[]`)

| Field | Type | Req? | Notes |
|---|---|---|---|
| `on` | string | no | The trigger/condition for this step. |
| `do` | string | yes | What happens at this step. |
| `pin` | Pin \| null | no | The symbol implementing the step. **`pin: null` is valid in v0.2** — a not-yet-linked step (coverage is v0.3). |

A step with `pin: null` (or no `pin`) is **valid and expected** in v0.2 — it models a known step
the author hasn't linked to code yet. Coverage-of-every-step is the **v0.3** flow-coverage check,
not a v0.2 validation error.

```yaml
# .artha/flows/checkout.yaml
id: flow.checkout
kind: flow
status: proposed
name: Checkout
summary: >
  Turns a cart into a paid order: validate the cart, authorize payment, create the
  order, then fulfil. Spans cart, payments, and orders services.
entry:
  - symbol: src/checkout/startCheckout.ts#startCheckout
steps:
  - on: cart submitted
    do: validate the cart and lock prices
    pin: { symbol: src/checkout/validateCart.ts#validateCart }
  - on: cart valid
    do: authorize payment with the gateway
    pin: { symbol: src/payments/authorize.ts#authorize }
  - do: create the order and decrement inventory
    pin: null                       # known step, not yet linked — valid in v0.2
  - on: order created
    do: enqueue fulfilment
    pin: null
related: [concept.subscription]
```

---

## 5. Validation (additions to §7, schema-v0.1.md)

`artha build` applies the same pipeline. The concept/flow-specific rules:

1. **Schema** — validates against the §7 JSON Schema below. `name` + `summary` are required for
   both kinds; `states`/`transitions`/`steps`/`entry` are optional arrays of well-shaped items.
2. **Id** — pattern + prefix-matches-kind + globally unique, identical to v0.1.
3. **Certification** — `certified` requires `certified_by` + `certified_at`, identical to v0.1.
4. **Pins** — top-level `pins` (and, from T12, a flow's `entry` and each `steps[].pin`) resolve to
   a symbol and content-hash for staleness, identical to v0.1's pin mechanism. A `steps[].pin` of
   `null` is skipped, not an error.

**Deliberately *not* validated in v0.2** (these are v0.3): transition `from`/`to` referencing a
declared state; every step/transition having an implementation (flow coverage); concept↔flow
transition agreement (that's the §6.1 contradiction preview's read-only job, T19).

---

## 6. Index (additions to §8, schema-v0.1.md) — built by T12

Concept/flow rows land in `artha_facts` with `heading = name` and `body = summary` (so FTS +
structural retrieval works immediately, and is also searchable). The state machine / sequence get
their own ordered tables so the dashboard and `why`/`context_for_task` can serve them:

```sql
artha_states(fact_id TEXT, name TEXT, effect TEXT, invariant TEXT, ord INT);
artha_transitions(fact_id TEXT, from_state TEXT, to_state TEXT, trigger TEXT, ord INT);
artha_flow_steps(fact_id TEXT, on_event TEXT, do_action TEXT, pin_symbol_ref TEXT, ord INT);
```

`ord` is the 0-based authoring order (states/steps render as written). **All pins** — a
decision/invariant/convention/concept's base `pins`, a flow's `entry` points, *and* each
`steps[].pin` — reuse the existing `artha_pins` table (resolved symbol id, content hash, stale
flag). A flow step's `pin_symbol_ref` therefore joins to `artha_pins.symbol_ref` for that step's
code link and staleness; a `null` `pin_symbol_ref` is the not-yet-linked / v0.3-coverage signal.
A v0.1-only repo builds these three tables **empty** (present, not absent) — no regression.

> **Area/module map feed (SPEC §B):** each pin's `symbol_ref` already carries the file path
> (`src/billing/Subscription.ts#Subscription`), which is the raw material for the area/module
> column of the map. *How* a file rolls up into an "area" is **OQ5**, owned by T15 — the build
> deliberately does not bake a granularity choice into the index here.

T11 stops at "loads, validates, round-trips, and is part of the `ArthaEntry` union"; it makes the
existing build *compile and not crash* on the new kinds (heading/body from name/summary), and
leaves the structured tables + per-step pin resolution to T12.

---

## 7. JSON Schema (additions)

Draft 2020-12, same document as §9 schema-v0.1.md. The shared `$defs` gain `state`,
`transition`, and `flowStep`; the `id` pattern and the base `kind` enum gain `concept`/`flow`;
two new per-kind sub-schemas are added via `allOf` on `base`.

```json
{
  "$defs": {
    "id": { "type": "string", "pattern": "^(decision|invariant|convention|concept|flow)\\.[a-z0-9_]+$" },

    "state": {
      "type": "object",
      "required": ["name"],
      "additionalProperties": false,
      "properties": {
        "name": { "type": "string", "minLength": 1 },
        "effect": { "type": "string" },
        "invariant": { "type": "string" }
      }
    },
    "transition": {
      "type": "object",
      "required": ["from", "to", "trigger"],
      "additionalProperties": false,
      "properties": {
        "from": { "type": "string", "minLength": 1 },
        "to": { "type": "string", "minLength": 1 },
        "trigger": { "type": "string", "minLength": 1 }
      }
    },
    "flowStep": {
      "type": "object",
      "required": ["do"],
      "additionalProperties": false,
      "properties": {
        "on": { "type": "string" },
        "do": { "type": "string", "minLength": 1 },
        "pin": { "oneOf": [ { "$ref": "#/$defs/pin" }, { "type": "null" } ] }
      }
    },

    "base": {
      "properties": {
        "kind": { "enum": ["decision", "invariant", "convention", "concept", "flow"] }
      }
    }
  },

  "concept": {
    "allOf": [
      { "$ref": "#/$defs/base" },
      { "properties": {
          "kind": { "const": "concept" },
          "name": { "type": "string" },
          "summary": { "type": "string" },
          "states": { "type": "array", "items": { "$ref": "#/$defs/state" } },
          "transitions": { "type": "array", "items": { "$ref": "#/$defs/transition" } }
        },
        "required": ["name", "summary"]
      }
    ]
  },

  "flow": {
    "allOf": [
      { "$ref": "#/$defs/base" },
      { "properties": {
          "kind": { "const": "flow" },
          "name": { "type": "string" },
          "summary": { "type": "string" },
          "steps": { "type": "array", "items": { "$ref": "#/$defs/flowStep" } },
          "entry": { "type": "array", "items": { "$ref": "#/$defs/pin" } }
        },
        "required": ["name", "summary"]
      }
    ]
  }
}
```

(The `base` block above shows only the **changed** key — the `kind` enum. Every other base
property is unchanged from §9, schema-v0.1.md.)

---

## 8. What v0.2 deliberately omits (for these kinds)

- **Flow-coverage detection** (does each step/transition have an implementation?) — v0.3.
- **Concept↔flow transition-agreement** and other cross-entry contradiction checks — the v0.2
  dashboard previews the §6.1 *deterministic* slice read-only (T19); the full checker is v0.3.
- **The `exception` kind** — v0.3.
- **State-reference validation** (transition endpoints naming declared states) — kept lax so
  capture-first authoring isn't blocked; promoted to a v0.3 check.

Keeping the surface this small is the point, same as v0.1: two new kinds, the same pin mechanism,
the same build, the same index — extended, never broken.
