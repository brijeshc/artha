# Task 03 — Config loading & `artha init`

**Depends on:** 01, 02.
**Spec refs:** SPEC.md §"In scope" (`artha init`), Happy path step 1, edge case "Empty `.artha/`".
**Schema refs:** [schema-v0.1.md](../design/schema-v0.1.md) §1 (directory layout + `config.yaml`).

## Goal

Let a developer turn any repo into an Artha-enabled repo in one command, and give every
other command a typed, defaulted view of `config.yaml`.

## Scope

- **Config loader** (`src/config/config.ts`):
  - Load `.artha/config.yaml` if present; all fields optional with sensible defaults (schema §1):
    - `source_roots: [ "src" ]`
    - `default_severity: medium`
    - `codegraph_db` — accept and store it for forward-compat, **but v0.1 does not use it** (the built-in resolver from T04 is authoritative; SPEC says no CodeGraph dependency).
    - Miner config block for T06: `model` (default per Open Q1 — see T06; do not hardcode a downgrade), plus optional `cheaper` aliases. Define the shape; T06 owns the semantics.
  - Missing file → all-defaults config (never errors).
  - Return a fully-resolved typed `ArthaConfig`.
- **`artha init`** (`src/commands/init.ts`):
  - Scaffold `.artha/decisions/`, `.artha/invariants/`, `.artha/conventions/` (with `.gitkeep`).
  - Write a commented `.artha/config.yaml` showing the defaults.
  - Idempotent: re-running on an existing `.artha/` does not clobber `config.yaml` or delete entries — it fills in only what's missing and reports what it did.
  - Print next steps (`artha mine` → `artha review` → `artha build`).

## Out of scope

- Reading entries (T02 owns the loader; `init` only creates empty dirs).
- Any build/index work (T05).

## Contracts produced

```ts
// src/config/config.ts
loadConfig(repoRoot: string): ArthaConfig         // never throws on missing file
interface ArthaConfig {
  sourceRoots: string[]; defaultSeverity: 'high'|'medium'|'low';
  codegraphDb?: string;                            // stored, unused in v0.1
  miner: { model: string; /* see T06 */ };
}
```

`loadConfig` is imported by T05 (build), T06 (mine), and T08 (MCP). Keep it pure + sync.

## Acceptance criteria

- [ ] `artha init` in an empty repo creates the three dirs + a defaulted `config.yaml`. **(SPEC Done-when #1.)**
- [ ] Re-running `artha init` is non-destructive and reports "already initialized" + any gaps it filled.
- [ ] `loadConfig` on a repo with no `config.yaml` returns all defaults without error.
- [ ] `loadConfig` correctly overrides defaults from a partial `config.yaml`.
- [ ] An `.artha/` that is empty post-init is a valid state (no command should treat it as an error — see T05 empty-index criterion).
