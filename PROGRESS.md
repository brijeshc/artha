# Artha — build progress log

Running log of task completion against [tasks/README.md](tasks/README.md). Newest entries first.

## Status

| #  | Task                          | Status   | Notes |
|----|-------------------------------|----------|-------|
| 01 | Project scaffold & tooling    | ✅ done  | tsup · commander · vitest · Biome |
| 02 | Schema, types & validation    | ✅ done  | AJV 2020 · YAML load/dump round-trip |
| 03 | Config loading & `artha init` | ✅ done  | `loadConfig` defaults + idempotent init |
| 04 | SymbolResolver (tree-sitter)  | ✅ done  | `web-tree-sitter` pinned 0.20.8 |
| 05 | `artha build` — index         | ✅ done  | node:sqlite + FTS5, zero deps; staleness flip |
| 06 | `artha mine` — git → drafts   | ✅ done  | prefilter + Anthropic structured output + `.mined` ledger |
| 07 | `artha review` — Ink TUI      | ⬜ todo  | needs 02 |
| 08 | MCP server (stdio)            | ⬜ todo  | needs 05 |
| 09 | `artha export --agents-md`    | ⬜ todo  | needs 05 |
| 10 | v0.1 success test             | ⬜ todo  | needs 05, 06, 07, 08; carries Open Q5 |

Critical path: 01 → 02 → 04 → 05 → 08 → 10.

## Log

### 2026-06-21

- **T06 — `artha mine`** done. Git history → `proposed` decision drafts via the
  Anthropic API. Pipeline: `listCommits` → metadata pre-filter (drop merges /
  already-mined / noise subjects, rank by rationale/revert/issue-ref signals) →
  per candidate, load the diff and apply diff-level skips (lockfile-only,
  formatting-only, trivial) — **zero LLM spend for skips** → send survivors to
  the miner up to a spend cap (`--max`, default 20) → validate each draft through
  T02 → write ADR-numbered `proposed` YAML with `mined_from`. 18 tests (prefilter,
  ledger, end-to-end with a stubbed miner) + verified on real history via
  `mine --dry-run`.
  - **Pluggable engines** behind a shared `Miner` interface + shared prompt/parse
    (`src/mine/miner.ts`); selected by `config.miner.engine` via `engine.ts`:
    - `api` (`src/mine/anthropic.ts`, default): `@anthropic-ai/sdk` with
      **structured output** (`output_config.format` JSON schema) so drafts conform
      by construction. Focused content-only schema (the full §5.1 schema's
      `if/then` conditionals aren't valid for structured outputs); the complete
      entry is assembled + re-validated through T02 before writing. SDK is
      dynamically imported so `build`/`review`/MCP/`export` stay fully offline.
    - `claude-cli` (`src/mine/claudeCli.ts`): shells out to `claude -p
      --output-format json`, **reusing the user's existing Claude Code login**
      (subscription or key) — no separate `ANTHROPIC_API_KEY`. Verified live on
      both engines. Trade-off: each CLI call carries Claude Code's system-prompt
      overhead (~17k cached tokens), so `api` stays leaner for raw-key users.
      Windows-safe spawn (`.cmd` shim via shell; static argv; system prompt +
      commit on stdin). Injectable `CliRunner` for tests.
  - **Auth (broadened):** the `api` engine accepts `ANTHROPIC_API_KEY`,
    `ANTHROPIC_AUTH_TOKEN`, **or** an `ant auth login` OAuth profile on disk
    (subscription, no raw key); missing → `ArthaError` with a hint pointing at all
    three plus `engine: claude-cli`. (Fixes an earlier over-strict env-only check.)
  - **Open Q1 — DECIDED: keep `claude-opus-4-8` default** (no silent downgrade;
    cost bounded by prefilter + spend cap). Cheaper tiers remain config opt-ins.
  - **Open Q2 — DECIDED: separate `.artha/.mined` ledger** (`src/mine/ledger.ts`),
    authoritative skip-set unioned with existing drafts' `mined_from`. A
    rejected/deleted draft's commit stays skipped — never re-drafted or
    re-charged. Every mined SHA (drafted *and* no-decision) is recorded.
  - **Open Q3 — DECIDED: commit messages + diffs only** (no `gh`/GitHub dep).
    Seam left for PR enrichment: `mined_from.source = git-history` + the
    `src/mine/git.ts` layer is the single place a PR enricher would slot in.
  - Batches API (optional per the task) deferred — single-pass + prefilter +
    spend cap is the chosen cost path for v0.1.

### 2026-06-20

- **T05 — `artha build`** done. Compiles `.artha/` YAML → SQLite + FTS5 index
  (schema §8). Pipeline: load/validate (T02) → resolve pins (T04, unresolvable =
  build failure naming the ref) → recompute hashes, fill blanks, flip drifted
  certified entries to `stale` on disk → expand scope globs → warn on dangling
  refs → emit. Fully offline. 7 tests + verified end-to-end.
  - **Zero new dependencies:** uses Node 26's built-in `node:sqlite` (FTS5
    compiled in) and `fs.globSync`. `node:sqlite` is loaded via `createRequire`
    so vitest/Vite (whose builtin list predates it) doesn't choke.
  - `buildIndex(repoRoot, config)` → `Promise<BuildReport>` (async, since the
    resolver is). `.artha/index.db` is the read contract for T08/T09.

- **T03 — Config loading & `artha init`** done. `loadConfig(repoRoot)` returns a
  typed `ArthaConfig` layered over defaults (pure + sync; missing file → defaults,
  malformed → ArthaError, mistyped fields → per-field fallback). `artha init`
  idempotently scaffolds `.artha/{decisions,invariants,conventions}/` (+`.gitkeep`)
  and a commented `config.yaml`, never clobbering an existing config or entries.
  12 tests. Default miner model kept at `claude-opus-4-8` (no silent downgrade; Q1
  semantics still owned by T06).

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

- **Q5** success-test baseline definition → owned by T10
- ~~**Q1** miner model default~~ → resolved 2026-06-21: keep `claude-opus-4-8` (see T06 log)
- ~~**Q2** idempotency ledger~~ → resolved 2026-06-21: separate `.artha/.mined` (see T06 log)
- ~~**Q3** PR vs. commit mining~~ → resolved 2026-06-21: commit-only, PR seam left (see T06 log)
- ~~**Q4** content-hash normalization~~ → resolved 2026-06-20 (see T04 log)
