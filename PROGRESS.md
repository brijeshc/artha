# Artha — build progress log

Running log of task completion against [tasks/README.md](tasks/README.md) (v0.1) and
[tasks-v0.2/README.md](tasks-v0.2/README.md) (v0.2). Newest entries first.

## Status — v0.2

| #  | Task                          | Status   | Notes |
|----|-------------------------------|----------|-------|
| 11 | Schema — `concept` + `flow`   | ✅ done  | additive kinds; validate · round-trip · index-compile; `design/schema-v0.2.md` |
| 12 | `artha build` — concept/flow  | ⬜ next  | pin resolution + states/transitions/steps tables |
| 13 | Churn + coverage ranking      | ⬜       | dark-zone queue |
| 14 | Embedding-assisted ranking    | ⬜       | |
| 15 | `artha serve` — server + API  | ⬜       | |
| 16 | Product↔Code map UI           | ⬜       | |
| 17 | Write-back (link/certify/edit)| ⬜       | |
| 18 | "Ask the human" loop          | ⬜       | |
| 19 | Contradiction preview panel   | ⬜       | §6.1 deterministic only |
| 20 | v0.2 success test             | ⬜       | non-author reads the map |

Critical path: 11 → 12 → 15 → 16/17 → 18 → 20. Tasks 13, 14, 19 parallelize off it.

## Status — v0.1

| #  | Task                          | Status   | Notes |
|----|-------------------------------|----------|-------|
| 01 | Project scaffold & tooling    | ✅ done  | tsup · commander · vitest · Biome |
| 02 | Schema, types & validation    | ✅ done  | AJV 2020 · YAML load/dump round-trip |
| 03 | Config loading & `artha init` | ✅ done  | `loadConfig` defaults + idempotent init |
| 04 | SymbolResolver (tree-sitter)  | ✅ done  | `web-tree-sitter` pinned 0.20.8 |
| 05 | `artha build` — index         | ✅ done  | node:sqlite + FTS5, zero deps; staleness flip |
| 06 | `artha mine` — git → drafts   | ✅ done  | prefilter + Anthropic structured output + `.mined` ledger |
| 07 | `artha review` — Ink TUI      | ✅ done  | Ink + React; one-keypress certify/edit/reject; offline |
| 08 | MCP server (stdio)            | ✅ done  | `context_for_task` + `why`; ranked, budgeted, certified-only default; offline |
| 09 | `artha export --agents-md`    | ✅ done  | certified-only `AGENTS.md` via T08 `query.ts`; deterministic; `--out` |
| 10 | v0.1 success test             | ✅ done  | A/B on real proof repo: **−56% discovery tool-calls** with Artha (≥30% bar) |

Critical path: 01 → 02 → 04 → 05 → 08 → 10.

## Log

### 2026-06-24

- **T11 — Schema: `concept` + `flow` kinds** done. The two product-meaning kinds the
  dashboard's Product↔Code map maps *to*, added as a **clean additive extension** of the
  frozen v0.1 base model — they validate, round-trip through YAML, and are part of the
  `ArthaEntry` union, ready to build (T12) and serve (T15/16).
  - **Locked the model first** in [design/schema-v0.2.md](design/schema-v0.2.md) (field
    tables + examples + the JSON Schema additions), same discipline as v0.1.
    - `concept` (`concept.*`): `name`, `summary` (both req) + the high-value payload **not
      in the TS types** — `states` (`{ name, effect?, invariant? }`) and `transitions`
      (`{ from, to, trigger }`). States/transitions are **optional** so a concept can be
      captured summary-first and grow its machine via the v0.2 interview.
    - `flow` (`flow.*`): `name`, `summary` (both req) + `steps` (ordered `{ on?, do, pin? }`)
      and `entry` (entry-point pins). A step with **`pin: null` is valid** — coverage-of-every-
      step is a v0.3 check, not a v0.2 validation error.
  - **Schema/types/validation** all extended additively: `id` pattern + base `kind` enum gain
    `concept|flow`; new `$defs` `state`/`transition`/`flowStep`; two `allOf`-on-`base`
    sub-schemas; `Concept`/`Flow`/`State`/`Transition`/`FlowStep` added to the union; both AJV
    validators wired. `certified` still requires `certified_by`+`certified_at` for the new kinds.
  - **Loader + init**: `concepts/` and `flows/` join the walked dirs and `artha init`'s
    scaffold (5 kind dirs now); canonical `FIELD_ORDER` added for stable dumps.
    `exception.*` stays the **still-reserved** kind that the loader skips (the old
    `reserved-concept` fixture/tests moved to `exception`, since concept now loads for real).
  - **Build kept green, not extended**: `build.ts` now compiles + indexes concept/flow facts
    with `heading=name`, `body=summary` (so FTS/structural retrieval works immediately); the
    `review` TUI's `draftFields` made exhaustive over all five kinds. The **states/transitions/
    steps tables + per-step pin resolution are T12**, per the spec's scope split.
  - **Verified**: typecheck + Biome clean; **136 tests pass** (+8 — concept/flow validate &
    round-trip, summary-first concept, malformed transition/step, certified-requires-stamps,
    exception-still-skipped). Live smoke: `init → author concept+flow → build` emits a 2-entry
    index with the rows above. Acceptance criteria (SPEC Done-when #1) all met.

### 2026-06-21

- **T10 — v0.1 success test** done. **Verdict: PASS.** Full write-up in
  [tasks/results/v0.1-success-test.md](results/v0.1-success-test.md).
  - **Q5 locked with developer** ([10-success-test.md](10-success-test.md)) after a
    premise correction: the proof repo is a content-site SPA, not a billing
    service, so the baseline targets its real conventions ("add a topic page"
    workflow + content standard) rather than money/soft-delete.
  - **A/B on the real proof repo** (`claude -p`, headless, identical prompt; fresh
    copies with `CLAUDE.md`/`CONTENT-GUIDE.md` removed; certified index served only
    via MCP from a sidecar dir): Arm B (Artha) used **34 → 15 discovery tool-calls
    (−56%)** and 42 → 25 total (−40%) vs Arm A, via a single `context_for_task`
    call — clearing the **≥30%** bar. Both arms applied the conventions (correct
    data-module exports, Indian-company example, thin page, route + sidebar wiring).
  - **Loop proven on real data:** `init → mine → build → mcp` all run on the
    299-commit repo. `mine` (claude-cli engine) correctly classifies real commits;
    a content repo yields sparse decisions (3/299 carry rationale signals), so the
    certified value here is hand-authored conventions.
  - **Product fixes this test drove:** MCP server `instructions` (Artha tells the
    agent to call `context_for_task` first), `ARTHA_REPO_ROOT` (index resolution
    when the client doesn't launch from the repo root), and the OS-native-path /
    sidecar-index requirements (now in the README + harness).
  - Reproducible harness committed: [scripts/success-test.sh](../scripts/success-test.sh)
    + [scripts/count-tools.mjs](../scripts/count-tools.mjs); certified fixture in
    [tasks/results/proof-repo-fixture/](results/proof-repo-fixture/).

- **T09 — `artha export --agents-md`** done. Emits a compact, generated `AGENTS.md`
  of **certified** entries so flat-file-only tools (no MCP) still get the team's
  certified meaning — the adoption hook. Fully offline.
  - **Source = the built index via T08 `query.ts`** (not a fresh YAML read), so the
    export mirrors the same validated, staleness-resolved state the MCP server
    serves. Proposed/stale are excluded by definition.
  - **Output** (`src/export/agentsMd.ts`): grouped by kind (Decisions / Invariants /
    Conventions); per entry the heading, the one-line decision/rule, `pins`,
    `scope` (capped at 8 expanded files + "(+N more)" to stay terse), and `why` /
    `supersedes` cross-links. `renderAgentsMd(index)` is pure; `exportAgentsMd(repoRoot,
    {out})` does the I/O (creates parent dirs).
  - **Generated-file discipline:** a "DO NOT EDIT" banner and a **static** header
    (no timestamp) so re-exports of unchanged input are **byte-identical** → minimal
    git diffs. Entries sorted by id; pins/scope sorted + de-duped.
  - **Empty/cold state** → a valid `AGENTS.md` with a "nothing certified yet" note,
    never an error; the command hints `artha build` when no index is present.
  - `artha export` defaults to `--agents-md` (the only v0.1 format); `--out <path>`
    overrides the default repo-root `AGENTS.md`.
  - 7 tests (grouping, certified-only exclusion, deterministic re-export, custom out,
    empty state) + a live full-pipeline smoke (`init → build → export`).

- **T08 — MCP server (stdio)** done. A read-only, fully-offline `@modelcontextprotocol/sdk`
  server (launched by `artha mcp` and the standalone `dist/mcp.js`) that serves
  certified product-meaning to agents over stdio via two tools: **`context_for_task`**
  and **`why`**. Server name `artha`.
  - **Read layer** (`src/mcp/query.ts`): opens `.artha/index.db`, eagerly loads
    facts/pins/scope (team-scale → rank in memory) with lazy FTS5. **Cold-start safe**:
    a missing / empty / unreadable index yields an *empty* index, never an error
    (SPEC). Shared API reused by T09. `toFtsQuery` sanitizes free text into a safe
    quoted-OR FTS query.
  - **Ranking** (`src/mcp/rank.ts`): relevance = normalized **FTS-lexical + structural
    overlap** (a fact's pins/scope vs. the task's `symbols`/`files`), times a **status
    weight** (certified 1.0 > proposed 0.6). Additive, not multiplicative — so a
    task-text-only call ranks on pure lexical × status with structural simply not
    applied (SPEC edge case), and a symbols/files-only call ranks structurally.
    **`stale` is always excluded** (pinned code drifted → untrusted). Token budget
    (~1.5k default, `ARTHA_TOKEN_BUDGET` / option override) keeps the highest-ranked
    items, truncating from the bottom, always ≥1.
  - **Tools** (`src/mcp/server.ts`): `context_for_task(task, symbols?, files?,
    include_proposed?)` — **certified-only by default**; `include_proposed: true`
    adds drafts *clearly labeled* `[proposed — unreviewed draft]`. `why(symbol)` —
    decisions/rules whose pins reference `path#Symbol`, following invariant `why`
    cross-links, every status tagged. The index is opened **per call** so a fresh
    `artha build` is picked up without a restart; diagnostics go to stderr so stdout
    stays clean for JSON-RPC.
  - **SDK shape verified against the installed package** (not from memory):
    `registerTool(name, { description, inputSchema }, cb)` with a **raw Zod shape**
    as `inputSchema`, `StdioServerTransport`, `server.connect()`.
  - 24 tests incl. a real in-memory **client↔server round-trip**; also smoke-tested
    live over actual stdio (`tools/list` + a cold-start `context_for_task` call).
  - Deps: `@modelcontextprotocol/sdk` ^1.29.0 + `zod` ^4.4.3 (both externalized by
    tsup; `dist/mcp.js` stays ~11 KB).

- **T07 — `artha review`** done. Ink (React-for-the-terminal) TUI that walks the
  `proposed` queue and shows each draft beside its source commit/diff + proposed
  pins, with one-keypress **certify / edit / reject** — the only path to
  `certified` (nothing auto-certifies). Fully offline.
  - **Layered for testability:** a pure action layer (`src/review/actions.ts`) is
    kept apart from the Ink presentation (`src/review/app.tsx`). Certify validates
    the exact shape that hits disk *before* writing (refuses to write an invalid
    entry); reject is a hard delete (schema §6, after a `y/n` confirm); edit opens
    `$VISUAL`/`$EDITOR`, then re-validates — a schema-breaking edit is reported,
    never silently accepted.
  - **Source pane** (`src/review/source.ts`): resolves the `mined_from.commit`
    message + diff via `git show`, **graceful** on a missing ref (rebased/shallow
    clone → "not found"), independent of T06's git layer.
  - **Certifier identity:** `git config user.name` → `$USER`/`$USERNAME` →
    `unknown`; `certified_at` = today (`YYYY-MM-DD`). Review only mutates
    `.artha/**`; the developer runs `artha build` after to re-index.
  - **Toolchain:** added `ink` + `react` as runtime deps (externalized by tsup, so
    `cli.js` stays ~63 KB) and `@types/react` + `ink-testing-library` (dev);
    automatic JSX wired into `tsconfig.json` and `vitest.config.ts` (`.tsx` tests).
  - 18 tests: action layer, real-git source resolver, and render tests that drive
    keypresses through `ink-testing-library` (certify writes a valid certified
    file; reject deletes after confirm; arrow-key nav; never certifies at rest).

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
