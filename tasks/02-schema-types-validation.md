# Task 02 — Schema, types & validation

**Depends on:** 01.
**Spec refs:** SPEC.md §"In scope" (`.artha/` schema), §Constraints (schema frozen to v0.1).
**Schema refs:** [schema-v0.1.md](../design/schema-v0.1.md) §2–§3, §5, §6, §9.

## Goal

The single source of truth in code for the `.artha/` data model: TypeScript types, the
JSON Schema validator, and the per-file YAML load/dump layer. The miner, build, review,
MCP server, and export all read and write entries through this module — nail it first.

## Scope

- **TS types** (`src/schema/types.ts`) for the base entry + the three kinds + `Pin`, `Provenance`, `Detect`, exactly per schema §2/§4/§5/§9. A discriminated union `ArthaEntry = Decision | Invariant | Convention` keyed on `kind`.
- **JSON Schema** (`src/schema/schema.json`): copy §9 verbatim (Draft 2020-12, shared `$defs` + per-kind via `allOf`). This is the machine-validatable contract; keep it byte-faithful to the spec.
- **Validator** (`src/schema/validate.ts`): AJV (with `ajv-formats` for `date`). Compile once, validate an entry, return typed errors with the offending field path. Enforce the cross-field rules from §7 that JSON Schema already expresses: id pattern + kind-prefix match, `certified_by`/`certified_at` present **iff** `status: certified`.
- **Loader** (`src/schema/load.ts`):
  - Walk `.artha/{decisions,invariants,conventions}/*.{yaml,yml}`, one entry per file (filename is **not** load-bearing; identity is `id`).
  - Parse YAML (`yaml` package), validate, attach `source_path`.
  - **Unknown kinds are ignored, not errored** — `concept.*`/`flow.*`/`exception.*` files are skipped with a debug note (forward-compat, schema §3).
  - Global uniqueness check on `id` across the whole `.artha/` tree (duplicate `id` → error with both paths).
- **Dumper** (`src/schema/load.ts`): write an entry back to its file preserving field order and block scalars where reasonable (review T07 and build T05 rewrite files on disk — certify, staleness flip). Round-trip must not mangle multiline `rule`/`context`/`decision` strings.

## Out of scope

- Pin resolution / content hashing (T04) — `content_hash` is just an optional string here.
- Scope-glob expansion, references resolution warnings — that's build-time (T05); this layer validates structure only.
- Executing `detect` — stored verbatim, validated structurally only (schema §5.4).

## Contracts produced

```ts
// src/schema/load.ts
loadEntries(arthaDir: string): { entries: ArthaEntry[]; skipped: string[] }
writeEntry(entry: ArthaEntry, path: string): void
// src/schema/validate.ts
validateEntry(obj: unknown): { ok: true; entry: ArthaEntry } | { ok: false; errors: ValidationError[] }
// src/schema/types.ts — ArthaEntry, Decision, Invariant, Convention, Pin, Provenance, Detect, Status, Kind
```

These are the types every downstream task imports. Treat the signatures as stable.

## Acceptance criteria

- [ ] Valid fixtures for all three kinds (use the §5 examples) load and validate clean.
- [ ] A `certified` entry missing `certified_by`/`certified_at` fails validation with a clear field path.
- [ ] An `id` not matching `^(decision|invariant|convention)\.[a-z0-9_]+$`, or whose prefix ≠ `kind`, fails.
- [ ] A duplicate `id` across two files errors and names both files.
- [ ] A `concept.*` file in the tree is silently skipped (reported in `skipped`), not errored.
- [ ] Load → dump → load round-trips a multiline-field entry without semantic change.
- [ ] Unit tests cover each rule above.
