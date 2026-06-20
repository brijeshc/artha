# Artha — `.artha/` schema (v0.1)

> Companion to `Product.md` (§6, §7) and `contradiction-detection.md`. This is the concrete, buildable data-model spec for v0.1. The miner, the MCP server, and the contradiction checker all read and write against it, so it is the foundation — nail it before writing code.
> v0.1 kinds: **decision**, **invariant**, **convention**. (`concept`, `flow`, `exception` are reserved for v0.2–v0.3; the base model is designed to extend to them without breaking.)

---

## 1. Directory layout

```
.artha/
  config.yaml          # project config (optional)
  decisions/           # decision entries — one per file
  invariants/          # invariant entries
  conventions/         # convention entries
  # reserved (not in v0.1): concepts/  flows/  exceptions/
```

One entry per file. **The filename is not load-bearing** — the canonical identity is the `id` field. Recommended conventions: numbered ADR-style for decisions (`0007-no-float-money.yaml`), slug for the rest (`money-minor-units.yaml`). Source of truth is the YAML; `artha build` compiles it to a queryable index (§8).

`config.yaml` (all optional, with sensible defaults):

```yaml
codegraph_db: .codegraph/graph.db   # where to resolve pins
source_roots: [ "src" ]             # roots for scope globs
default_severity: medium
```

---

## 2. The base entry (fields common to every kind)

| Field | Type | Req? | Notes |
|---|---|---|---|
| `id` | string | yes | Canonical identity. Pattern `^(decision\|invariant\|convention)\.[a-z0-9_]+$`. Globally unique. Prefix must match `kind`. |
| `kind` | enum | yes | `decision` \| `invariant` \| `convention`. |
| `status` | enum | yes | `proposed` \| `certified` \| `stale`. (Rejected drafts are deleted, not retained — see §6.) |
| `certified_by` | string | if certified | Who approved it. Required when `status: certified`. |
| `certified_at` | date | if certified | `YYYY-MM-DD`. Required when `status: certified`. |
| `pins` | Pin[] | no* | Links to structural symbols (§4). The anchor for content-hash staleness. *Required-in-spirit for facts tied to specific code; see per-kind. |
| `mined_from` | Provenance | no | Set by miners; absent on hand-written entries. `{ pr?, commit?, source? }`. |
| `related` | id[] | no | Cross-links to other entry ids. |
| `tags` | string[] | no | Free-form. |

Everything else is kind-specific (§5).

---

## 3. Identity & cross-references

- `id` is dotted and kind-prefixed: `decision.no_float_money`, `invariant.money_minor_units`, `convention.soft_delete`.
- All cross-references use `id`, never filenames: `why: decision.no_float_money`, `supersedes: decision.0003_legacy_money`, `related: [concept.invoice]`.
- Reserved prefixes for forward-compat: `concept.*`, `flow.*`, `exception.*`. A v0.1 build ignores unknown kinds rather than erroring, so a repo can adopt v0.2 entries incrementally.

---

## 4. The pin mechanism (and how staleness works)

A **pin** links a fact to a specific symbol in the CodeGraph structural layer. It is the join that powers retrieval ranking, the dashboard's concept↔code links, and content-hash staleness.

```yaml
pins:
  - symbol: src/billing/Subscription.ts#Subscription   # human-readable ref
    content_hash: 9f2a1c                                # filled by `artha build`
```

- **Symbol ref** is written by humans/miners as `‹repo-relative-path›#‹qualified-name›` (methods: `path#Class.method`). At build time, `artha build` resolves this against the CodeGraph index to the canonical CodeGraph symbol id and stores both; an unresolvable ref is a build error (§7).
- **`content_hash`** is a truncated SHA-256 of the pinned symbol's source span with insignificant whitespace normalized (so reformatting doesn't trigger drift; tune the normalization later). It is **computed and written by `artha build`**, not by hand — authors leave it blank on new pins.

**Staleness (v0.1):** on each build, recompute every pin's hash. If a `certified` entry has a pin whose hash changed, the entry flips to `stale` (§6). Re-certifying recomputes and clears it.

> Scope note: content-hash staleness applies only to **pinned** facts. Most invariants and conventions are located by `scope` globs (§5), not a single symbol, so they do **not** content-hash-stale in v0.1 — "is this rule still obeyed?" is the contradiction checker's job (v0.3), not staleness. Pin an invariant to the symbol that *embodies* it (e.g. a `Money` helper) when one exists, and that pin can stale normally.

---

## 5. Per-kind schemas

### 5.1 decision (the v0.1 miner's primary output)

The highest-value, least-recoverable content — the *why*.

| Field | Type | Req? | Notes |
|---|---|---|---|
| `title` | string | yes | One line. |
| `context` | string | yes | Why this came up / the problem. |
| `decision` | string | yes | What was decided. |
| `consequences` | string | no | What it implies downstream. |
| `supersedes` | id\|null | no | A prior decision this replaces. |
| `pins` | Pin[] | no | The symbol embodying it, if any. |

```yaml
id: decision.no_float_money
kind: decision
status: certified
title: Represent money as integer minor units, not floats
context: Invoices showed rounding drift of a few paise after tax + proration.
decision: Store and compute money as integer minor units; format only at the edge.
consequences: All billing math uses integer ops; a Money helper enforces it.
pins:
  - symbol: src/billing/Money.ts#Money
    content_hash: 3b9e02
mined_from: { pr: "#412", commit: a1b2c3d }
certified_by: brijesh
certified_at: 2026-06-20
```

### 5.2 invariant

A rule that must always hold. The `detect` block is what the v0.3 checker executes (see `contradiction-detection.md` §4); **optional in v0.1**, but if present it must be valid.

| Field | Type | Req? | Notes |
|---|---|---|---|
| `name` | string | yes | |
| `rule` | string | yes | The rule statement. |
| `scope` | glob[] | yes | ≥1 glob, repo-root-relative, `**` recursive. Union. |
| `why` | id\|null | no | Cross-link to the rationale decision. |
| `severity` | enum | no | `high`\|`medium`\|`low`; default from config. |
| `detect` | Detect | no | Executable rule for the checker (§5.4). |
| `pins` | Pin[] | no | If embodied by a specific symbol. |

```yaml
id: invariant.money_minor_units
kind: invariant
status: certified
name: Money is integer minor units
rule: >
  All monetary amounts are integers in the currency's minor unit (paise/cents).
  Never floats. Across API boundaries money is { amount: int, currency: string }.
scope: [ "src/billing/**", "src/payments/**" ]
why: decision.no_float_money
severity: high
detect:
  method: structural
  query: |
    (binary_expression operator: ["*" "/"] right: (number) @amt (#match? @amt "\\."))
certified_by: brijesh
certified_at: 2026-06-20
```

### 5.3 convention

The unwritten "how we do things here."

| Field | Type | Req? | Notes |
|---|---|---|---|
| `name` | string | yes | |
| `rule` | string | yes | |
| `scope` | glob[] | yes | ≥1 glob. |
| `example_good` | symbolRef\|null | no | An exemplar to imitate. |
| `example_bad` | symbolRef\|null | no | A counter-example. |
| `pins` | Pin[] | no | |

```yaml
id: convention.soft_delete
kind: convention
status: certified
name: Soft delete via deletedAt
rule: >
  Records are never hard-deleted. Set deletedAt; default queries filter deletedAt IS NULL.
  A hard delete must be explicitly justified in the PR.
scope: [ "src/**/repositories/**" ]
example_good: src/users/UserRepository.ts#softDelete
certified_by: brijesh
certified_at: 2026-06-20
```

### 5.4 The `detect` sub-object (forward-referenced; checker is v0.3)

```yaml
detect:
  method: structural        # structural | type | llm
  # method: structural →
  query: <tree-sitter S-expression>
  # method: type →
  ts_predicate: <pseudocode/expression against the TS compiler>
  # method: llm →
  prompt_hint: <string>
  confidence_min: <0..1>
  advisory: true            # always true for llm
```

See `contradiction-detection.md` §4 for semantics. v0.1 stores it verbatim; v0.3 executes it.

---

## 6. Status lifecycle (on disk)

```
proposed ──certify──▶ certified ──pin hash drifts──▶ stale
   │                      ▲                              │
 reject               re-certify ◀───────────re-certify─┘
   ▼
 (file deleted)
```

- `proposed` — a mined draft awaiting human review. Carries `mined_from`; no `certified_by`.
- `certified` — human-approved. The only status served to agents as trusted (§8).
- `stale` — a certified entry whose pin drifted (§4). Excluded from trusted retrieval; shown with a stale flag.
- **rejected** is not a stored status — the reviewer deletes the proposed file (or the miner re-drafts). Keeping tombstones is deferred.

---

## 7. Validation (`artha build`)

Build fails on errors, warns on the rest:

1. **Schema** — YAML parses and validates against the JSON Schema (§9).
2. **Id** — matches the pattern, prefix matches `kind`, globally unique.
3. **Certification fields** — `certified_by` and `certified_at` present iff `status: certified`.
4. **Pin resolution (error)** — every `pins[].symbol` resolves to a CodeGraph symbol.
5. **Hash + staleness** — (re)compute each pin's `content_hash`; if a `certified` entry's pin changed, rewrite its `status` to `stale` on disk (so the change shows in git) and record it.
6. **Scope** — invariants/conventions have ≥1 valid glob; globs compile to a non-empty file set (warn if empty — likely a typo).
7. **References (warn)** — `why`, `supersedes`, `related` resolve to existing ids; dangling refs warn.
8. **Detect** — if present, the block is structurally valid for its `method`.

---

## 8. The compiled index (the read contract)

`artha build` emits SQLite tables alongside CodeGraph's, giving the MCP server (Product.md §9) and the checker a stable interface to query. Minimal v0.1 shape:

```sql
artha_facts(
  id TEXT PRIMARY KEY, kind TEXT, status TEXT,
  heading TEXT,        -- title (decision) or name (invariant/convention)
  body TEXT,           -- decision text / rule, flattened for retrieval
  severity TEXT, why TEXT, supersedes TEXT,
  certified_by TEXT, certified_at TEXT,
  source_path TEXT     -- the .artha/*.yaml it came from
);
artha_pins(fact_id TEXT, symbol_id TEXT, symbol_ref TEXT, content_hash TEXT, is_stale INT);
artha_scope_files(fact_id TEXT, file_path TEXT);   -- globs expanded to files (for overlap + incremental checks)
artha_related(fact_id TEXT, related_id TEXT);
artha_provenance(fact_id TEXT, ref_kind TEXT, ref TEXT);   -- ref_kind: pr|commit|source
artha_detect(fact_id TEXT, method TEXT, spec TEXT);        -- raw detect block (JSON), for v0.3
-- plus an FTS5 virtual table over (heading, body) for v0.1 lexical retrieval
```

Retrieval in v0.1 ranks on FTS lexical match × structural proximity (pins/scope vs. the symbols a task touches) × `status` (certified > proposed; stale demoted). Glob expansion into `artha_scope_files` at build time is what lets both incremental contradiction checks and scope-overlap detection stay cheap (`contradiction-detection.md` §9, §11).

---

## 9. JSON Schema (machine-validatable)

Draft 2020-12. Shared `$defs` + one schema per kind via `allOf`.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$defs": {
    "symbolRef": { "type": "string", "pattern": "^[^#]+#[^#]+$" },
    "glob": { "type": "string", "minLength": 1 },
    "id": { "type": "string", "pattern": "^(decision|invariant|convention)\\.[a-z0-9_]+$" },
    "pin": {
      "type": "object",
      "required": ["symbol"],
      "additionalProperties": false,
      "properties": {
        "symbol": { "$ref": "#/$defs/symbolRef" },
        "content_hash": { "type": "string" }
      }
    },
    "provenance": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "pr": { "type": "string" },
        "commit": { "type": "string" },
        "source": { "type": "string" }
      }
    },
    "detect": {
      "type": "object",
      "required": ["method"],
      "properties": {
        "method": { "enum": ["structural", "type", "llm"] },
        "query": { "type": "string" },
        "ts_predicate": { "type": "string" },
        "prompt_hint": { "type": "string" },
        "confidence_min": { "type": "number", "minimum": 0, "maximum": 1 },
        "advisory": { "type": "boolean" }
      },
      "allOf": [
        { "if": { "properties": { "method": { "const": "structural" } } },
          "then": { "required": ["query"] } },
        { "if": { "properties": { "method": { "const": "type" } } },
          "then": { "required": ["ts_predicate"] } },
        { "if": { "properties": { "method": { "const": "llm" } } },
          "then": { "required": ["prompt_hint", "advisory"] } }
      ]
    },
    "base": {
      "type": "object",
      "required": ["id", "kind", "status"],
      "properties": {
        "id": { "$ref": "#/$defs/id" },
        "kind": { "enum": ["decision", "invariant", "convention"] },
        "status": { "enum": ["proposed", "certified", "stale"] },
        "certified_by": { "type": "string" },
        "certified_at": { "type": "string", "format": "date" },
        "pins": { "type": "array", "items": { "$ref": "#/$defs/pin" } },
        "mined_from": { "$ref": "#/$defs/provenance" },
        "related": { "type": "array", "items": { "$ref": "#/$defs/id" } },
        "tags": { "type": "array", "items": { "type": "string" } }
      },
      "allOf": [
        { "if": { "properties": { "status": { "const": "certified" } } },
          "then": { "required": ["certified_by", "certified_at"] } }
      ]
    }
  },

  "decision": {
    "allOf": [
      { "$ref": "#/$defs/base" },
      { "properties": {
          "kind": { "const": "decision" },
          "title": { "type": "string" },
          "context": { "type": "string" },
          "decision": { "type": "string" },
          "consequences": { "type": "string" },
          "supersedes": { "oneOf": [ { "$ref": "#/$defs/id" }, { "type": "null" } ] }
        },
        "required": ["title", "context", "decision"]
      }
    ]
  },

  "invariant": {
    "allOf": [
      { "$ref": "#/$defs/base" },
      { "properties": {
          "kind": { "const": "invariant" },
          "name": { "type": "string" },
          "rule": { "type": "string" },
          "scope": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/glob" } },
          "why": { "oneOf": [ { "$ref": "#/$defs/id" }, { "type": "null" } ] },
          "severity": { "enum": ["high", "medium", "low"] },
          "detect": { "$ref": "#/$defs/detect" }
        },
        "required": ["name", "rule", "scope"]
      }
    ]
  },

  "convention": {
    "allOf": [
      { "$ref": "#/$defs/base" },
      { "properties": {
          "kind": { "const": "convention" },
          "name": { "type": "string" },
          "rule": { "type": "string" },
          "scope": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/glob" } },
          "example_good": { "oneOf": [ { "$ref": "#/$defs/symbolRef" }, { "type": "null" } ] },
          "example_bad": { "oneOf": [ { "$ref": "#/$defs/symbolRef" }, { "type": "null" } ] }
        },
        "required": ["name", "rule", "scope"]
      }
    ]
  }
}
```

---

## 10. What v0.1 deliberately omits

- **Kinds:** `concept` (state machines) and `flow` (cross-cutting) — v0.2; `exception` (sanctioned-exception facts) — v0.3.
- **Embeddings** in the index — v0.1 retrieval is lexical (FTS) + structural; vectors come in v0.2.
- **Detect execution** — the `detect` block is stored but not run until the v0.3 checker.
- **Tombstones** for rejected drafts, multi-repo, and any non-JS/TS resolution — later.

Keeping the surface this small is the point: three kinds, one pin mechanism, one build, one index. Everything else extends these without breaking them.

---

*Lock this, then the next step turns paper into code: the git-history → decisions miner (Product.md §16, step 2), which emits `proposed` decision entries conforming to §5.1 — the first real test of whether mined drafts are good enough that certification feels like one keypress.*
