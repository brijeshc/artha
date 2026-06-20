# Artha — build progress log

Running log of task completion against [tasks/README.md](tasks/README.md). Newest entries first.

## Status

| #  | Task                          | Status   | Notes |
|----|-------------------------------|----------|-------|
| 01 | Project scaffold & tooling    | ✅ done  | tsup · commander · vitest · Biome |
| 02 | Schema, types & validation    | ✅ done  | AJV 2020 · YAML load/dump round-trip |
| 03 | Config loading & `artha init` | ⬜ todo  | unblocked (needs 01, 02) |
| 04 | SymbolResolver (tree-sitter)  | ✅ done  | `web-tree-sitter` pinned 0.20.8 |
| 05 | `artha build` — index         | ⬜ todo  | needs 02, 03, 04 |
| 06 | `artha mine` — git → drafts   | ⬜ todo  | needs 02, 03; carries Open Q1–Q3 |
| 07 | `artha review` — Ink TUI      | ⬜ todo  | needs 02 |
| 08 | MCP server (stdio)            | ⬜ todo  | needs 05 |
| 09 | `artha export --agents-md`    | ⬜ todo  | needs 05 |
| 10 | v0.1 success test             | ⬜ todo  | needs 05, 06, 07, 08; carries Open Q5 |

Critical path: 01 → 02 → 04 → 05 → 08 → 10.

## Log

### 2026-06-20

- **T04 — SymbolResolver** done. Built-in tree-sitter JS/TS resolver behind the
  `SymbolResolver` interface; resolves `path#Symbol` and `path#Class.method`,
  hashes normalized spans for staleness. 15 tests.
  - **Open Q4 resolved:** normalize whitespace, keep comments (a comment-only
    edit flips staleness). Isolated to `normalizeForHash` in `src/resolver/hash.ts`.
  - Deviation: `web-tree-sitter` pinned to `0.20.8` (≥0.25 changed the WASM
    linking model and won't load `tree-sitter-wasms` grammars).
  - Deviation: `createTreeSitterResolver` is async (`Promise<SymbolResolver>`)
    because WASM init is async; `resolve`/`hash` remain sync. **T05 must await.**

- **T02 — Schema, types & validation** done. The `.artha/` data model in code:
  `ArthaEntry` union, §9 JSON Schema, AJV validator, YAML loader/dumper. 14 tests.

- **T01 — Project scaffold & tooling** done (commit `638c968`). npm package,
  `artha` CLI shell with stub subcommands, MCP entry, test/lint/typecheck wired.

## Open questions still pending (do not silently resolve)

- **Q1** miner model default vs. cost → owned by T06
- **Q2** idempotency ledger location → owned by T06
- **Q3** PR vs. commit mining → owned by T06
- **Q5** success-test baseline definition → owned by T10
- ~~**Q4** content-hash normalization~~ → resolved 2026-06-20 (see T04 log)
