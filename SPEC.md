# Spec: Artha v0.1 (MVP)

> Build-spec derived from the `/ask-me` interview on 2026-06-20. Companion to the design docs in [design/](design/): [Product.md](design/Product.md) (vision + §11 MVP), [schema-v0.1.md](design/schema-v0.1.md) (data model), [contradiction-detection.md](design/contradiction-detection.md) (v0.3, out of scope here). Those define *what and why*; this defines *what to build first and how we'll know it works*.

## Goal (one sentence)
Ship the end-to-end v0.1 loop — mine `decision` drafts from git history, certify them in a TUI, compile to a queryable index, and serve certified product-meaning to agents over MCP — proven against a real TypeScript repo with measurably fewer agent discovery tool-calls.

## Users & trigger
- **Primary:** an AI coding agent (Claude Code, Cursor, etc.) calling `artha.context_for_task` / `artha.why` over MCP mid-task, to get the team's certified conventions/decisions/invariants without them being pasted into the prompt.
- **Secondary:** the developer (Brijesh) running `artha mine` → `artha review` → `artha build` to populate and curate `.artha/`.
- **Trigger:** developer runs the CLI to seed/curate meaning; agent triggers retrieval automatically when working on a task in an Artha-enabled repo.

## In scope
- **Implementation stack:** TypeScript / Node, shipped as an npm package exposing an `artha` CLI + an MCP server (stdio transport).
- **`.artha/` schema** for three kinds — `decision`, `invariant`, `convention` — exactly per [schema-v0.1.md](design/schema-v0.1.md). YAML is source of truth.
- **`artha build`** — compile YAML → SQLite index (validation, pin resolution, content-hash computation, staleness flip, FTS5 over heading/body). Schema §7–§8.
- **Built-in tree-sitter symbol resolver** — Artha runs its own thin tree-sitter (JS/TS) pass to resolve `path#Symbol` pins and hash symbol spans. No external CodeGraph dependency (the target repo happens to have a `.codegraph/`, but v0.1 does not depend on it). Define this behind a `SymbolResolver` interface so a CodeGraph-backed impl can drop in later.
- **`artha mine`** — git-history → drafted `decision` entries (`status: proposed`) with `mined_from` provenance, using the Claude API.
  - **Engine:** Anthropic SDK (`@anthropic-ai/sdk`), model `claude-opus-4-8` (configurable in `config.yaml`; `claude-sonnet-4-6` / `claude-haiku-4-5` available as cheaper opt-ins). Reads `ANTHROPIC_API_KEY` from env.
  - **Structured output:** use `output_config.format` (JSON-schema) / `messages.parse()` so drafts conform to the `decision` schema by construction.
  - **Commit selection:** cheap heuristic pre-filter *before* any LLM call — skip merges, lockfile-only, formatting-only, and trivial commits; favor reverts, "because/instead of", issue refs, and substantive diffs.
  - **Idempotent re-runs:** record already-mined commit SHAs (in `mined_from` / a build-tracked ledger) and skip them, so a re-run only drafts new history.
- **`artha review`** — interactive TUI (Ink): drafted entry beside the source commit/diff + proposed pins, single-key certify / edit / reject, queue navigation. This is the v0.1 seed of the human-facing layer. Reject = delete the proposed file.
- **Staleness** — `artha build` flips a `certified` entry to `stale` when a pinned symbol's content hash changes (schema §4, §6).
- **MCP server** — two tools:
  - `artha.context_for_task(task, symbols?, files?)` — ranked, token-budgeted bundle. Optional `symbols`/`files` args drive structural-proximity ranking; with task text only it's FTS-lexical × `status`. **Returns certified-only by default**, with an opt-in `include_proposed` flag that surfaces proposed drafts clearly labeled. Stale entries demoted/excluded.
  - `artha.why(symbol)` — the decision(s)/rationale touching a symbol.
- **`artha export --agents-md`** — emit a compact, generated `AGENTS.md` slice of certified entries (adoption hook).
- **`artha init`** — scaffold `.artha/{decisions,invariants,conventions}/` + `config.yaml`.

## Out of scope (explicit)
- `concept` / `flow` kinds, state machines (v0.2).
- The web dashboard / Product↔Code map and the contradiction/loophole view (v0.2–v0.3; [contradiction-detection.md](design/contradiction-detection.md)).
- Executing the `detect` block (stored verbatim only; v0.3).
- Embeddings-based ranking (v0.1 is lexical FTS + structural).
- Tests-as-spec / issue-tracker / Notion-Jira miners (only the git-history → decisions miner ships).
- Real CodeGraph integration, multi-repo, non-JS/TS languages, any cloud component.
- Tombstones for rejected drafts.

## Behavior

### Happy path (numbered steps)
1. Developer runs `artha init` in the repo → `.artha/` + `config.yaml` scaffolded.
2. Developer runs `artha mine` → heuristic pre-filter selects candidate commits; Claude drafts `decision` entries with provenance; new `proposed` YAML files written (already-mined SHAs skipped).
3. Developer runs `artha review` → TUI shows each draft beside its source commit/diff; developer certifies/edits/rejects with one keypress. Certified entries get `certified_by` + `certified_at`.
4. Developer runs `artha build` → YAML validated, pins resolved via tree-sitter, content hashes computed, drifted certified entries flipped to `stale`, SQLite index (+ FTS5) emitted.
5. Agent (configured to use the Artha MCP server) calls `artha.context_for_task({ task, symbols? })` while working → receives a ranked, budgeted bundle of certified meaning, each item with pins + `status`.
6. Agent writes code that respects the team's conventions/decisions without them being pasted into the prompt.
7. (Optional) Developer runs `artha export --agents-md` → compact `AGENTS.md` for flat-file-only tools.

### Edge cases
| Situation | Expected behavior |
|---|---|
| No `ANTHROPIC_API_KEY` set | `artha mine` errors with a clear, actionable message. `build` / `review` / MCP / `export` all work fully offline. |
| `artha mine` re-run | Idempotent — skips commits already mined; only drafts new history. No duplicate drafts for the same SHA. |
| Commit with no real decision | Pre-filter drops it before any LLM spend; if it slips through, the model returns "no decision" and no file is written. |
| Pin's `path#Symbol` doesn't resolve | `artha build` fails with a build error naming the unresolved ref (schema §7.4). |
| Pinned symbol's code changed | Certified entry flipped to `stale` on build (written to disk so it shows in git); excluded from trusted retrieval. |
| Cold start (drafts exist, little certified) | MCP returns certified-only by default → possibly little/nothing; agent can pass `include_proposed: true` to see labeled drafts. |
| `context_for_task` with task text only | Pure FTS-lexical × `status` ranking; structural proximity simply not applied. |
| Reformatting-only change to a pinned symbol | No staleness flip — content hash normalizes insignificant whitespace (schema §4). |
| Empty `.artha/` (post-init, pre-mine) | `build` succeeds with an empty index; MCP tools return empty bundles, not errors. |
| Mining 299-commit history cost | Pre-filter + idempotency bound it; Batches API (50% cheaper, async) is an available optimization if a single-pass mine is too costly. |

## Constraints
- **Self-contained:** no external CodeGraph, no cloud component, no code egress beyond the Anthropic API calls the miner makes. Local-first.
- **Schema is frozen to v0.1:** conform exactly to [schema-v0.1.md](design/schema-v0.1.md); unknown kinds (`concept.*`/`flow.*`/`exception.*`) are ignored, not errored.
- **Never auto-certify:** nothing is served as `certified` without a human keypress (Product.md risk 2).
- **Token-frugal retrieval:** default `context_for_task` budget ≈ a few hundred to ~1.5k tokens (Product.md §9).
- **Proof repo:** [C:\Code\brijesh-engineering-notes](file:///C:/Code/brijesh-engineering-notes) — real TypeScript service (365 `.tsx` + 258 `.ts`, Vite + Cloudflare Workers, billing/subscription concepts), 299 commits, GitHub remote `brijeshc/brijesh-engineering-notes`.
- **MCP transport:** stdio (the standard for local agents).

## Open questions (unresolved — do not silently resolve)
1. **Miner model default vs. cost.** Spec defaults to `claude-opus-4-8` per the Anthropic guidance (don't downgrade for cost without the user's call). Confirm whether to default the *miner* to a cheaper tier (`claude-haiku-4-5` / `claude-sonnet-4-6`) given it runs over many commits, or keep Opus and rely on pre-filter + Batches to control spend.
2. **Idempotency ledger location.** Track mined SHAs in each entry's `mined_from` only, or also maintain a separate `.artha/.mined` ledger so skipped-but-rejected commits aren't re-drafted forever? (Affects whether a rejected draft silently comes back on the next mine.)
3. **PR vs. commit mining.** The repo has a GitHub remote — should the miner pull PR descriptions/discussion via `gh`, or work from commit messages + diffs only in v0.1? (Design lists PRs as highest-value but adds a GitHub dependency.)
4. **Content-hash normalization aggressiveness** — exactly which whitespace/formatting is "insignificant" (schema §4 says "tune later"). Pick a v0.1 rule.
5. **Success-test baseline** — what's the concrete A/B for "measurably fewer discovery tool-calls": same task with vs. without the MCP server, on which fixed task(s) against the proof repo?

## Done when (checkable acceptance criteria)
- [ ] `artha init` scaffolds `.artha/` + `config.yaml`.
- [ ] `artha mine` produces ≥1 well-formed `proposed` `decision` entry with `mined_from` provenance from the proof repo's history; re-running it adds no duplicates.
- [ ] A no-API-key run of `mine` fails with a clear message; `build`/`review`/MCP/`export` all run offline.
- [ ] `artha review` certifies/edits/rejects a draft in one keypress each; certify writes `certified_by` + `certified_at`; reject deletes the file.
- [ ] `artha build` validates YAML, resolves pins via tree-sitter, computes hashes, flips a drifted certified entry to `stale`, and emits a SQLite index with an FTS5 table; an unresolvable pin fails the build.
- [ ] MCP server exposes `artha.context_for_task` (with optional `symbols`/`files`, certified-only default, `include_proposed` opt-in) and `artha.why`; both return correctly ranked, budgeted, status-tagged bundles.
- [ ] `artha export --agents-md` emits a compact `AGENTS.md` of certified entries.
- [ ] **v0.1 success test:** on a billing-area task against the proof repo, an agent given `context_for_task` applies the repo's money/soft-delete/validation conventions *without* them being pasted into the prompt, and does so with measurably fewer discovery tool-calls than the same agent without Artha (baseline per open question 5).
