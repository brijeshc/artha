# Task 08 — MCP server (stdio): `context_for_task` + `why`

**Depends on:** 05 (the `.artha/index.db` read contract). Indirectly 03 (config).
**Spec refs:** SPEC.md §"In scope" (MCP server, two tools), Happy path steps 5–6, §Constraints (stdio transport, token-frugal retrieval, certified-only default), edge cases (cold start, task-text-only ranking).
**Schema refs:** [schema-v0.1.md](../design/schema-v0.1.md) §8 (index + retrieval ranking).

## Goal

Serve certified product-meaning to agents over MCP so the team's conventions/decisions/
invariants reach the model mid-task **without being pasted into the prompt** — ranked,
token-budgeted, status-tagged, certified-only by default.

## Scope

- **Transport:** stdio MCP server (`@modelcontextprotocol/sdk`), launched by `artha mcp` (T01 entry). Server name `artha`.
- **Read layer** (`src/mcp/query.ts`): open `.artha/index.db` read-only; query `artha_facts` + `artha_pins` + `artha_scope_files` + FTS5. Shared so T09 (export) can reuse it. Gracefully handle a missing/empty index (return empty bundles, not errors).
- **Tool `artha.context_for_task(task, symbols?, files?)`:**
  - Returns a ranked, **token-budgeted** bundle (default ≈ a few hundred to ~1.5k tokens; SPEC constraint / Product.md §9). Each item carries its pins + `status`.
  - **Ranking** = FTS lexical match × structural proximity × `status` (schema §8):
    - structural proximity = overlap of the item's pins/`scope_files` with the `symbols`/`files` the task touches.
    - **task text only** (no `symbols`/`files`) → pure FTS-lexical × `status`; structural proximity simply not applied (SPEC edge case).
    - `status` weighting: certified > proposed; **stale demoted/excluded**.
  - **`include_proposed` flag** (default `false`): default returns **certified-only**; when `true`, proposed drafts are surfaced **clearly labeled** as proposed.
  - **Cold start** (few/no certified): certified-only default may return little/nothing — that's correct; the agent can pass `include_proposed: true`.
- **Tool `artha.why(symbol)`:** the decision(s)/rationale touching a symbol — match the given `path#Symbol` against `artha_pins.symbol_ref`/`symbol_id` (and the `why` cross-links), return the rationale entries with `status`.
- **Token budgeting:** approximate token counting to enforce the budget; truncate the lowest-ranked items first. Make the budget a server option with the spec's default.

> Confirm MCP SDK tool-registration shape and the stdio server entry against the
> **claude-api** / Claude Code guidance before wiring — don't code the protocol from memory.

## Out of scope

- Embeddings-based ranking (v0.1 is lexical FTS + structural).
- Writing/mutating entries — the server is read-only over the index.
- Building the index (T05 owns it); if the index is stale vs. YAML, that's the developer's `artha build` responsibility.

## Contracts produced

- Two MCP tools with documented input schemas (`task`, optional `symbols: string[]`, `files: string[]`, `include_proposed: boolean`; and `symbol: string`).
- `query.ts` read API reused by T09.

## Acceptance criteria  (SPEC Done-when #6)

- [ ] Exposes `artha.context_for_task` (optional `symbols`/`files`, **certified-only default**, `include_proposed` opt-in) and `artha.why`.
- [ ] Both return correctly **ranked, budgeted, status-tagged** bundles.
- [ ] Stale entries are demoted/excluded from trusted results.
- [ ] Task-text-only call ranks on pure FTS × status (no structural term).
- [ ] Empty/missing index → empty bundles, not errors (cold-start + post-init edge cases).
- [ ] Default bundle respects the ~1.5k-token budget; `include_proposed: true` adds clearly-labeled proposed drafts.
- [ ] Runs fully **offline** — SPEC Done-when #3.
