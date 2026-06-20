# Task 06 — `artha mine` (git history → drafted decisions)

**Depends on:** 02 (write valid drafts), 03 (config + miner model).
**Spec refs:** SPEC.md §"In scope" (`artha mine`: engine, structured output, commit selection, idempotency), Happy path step 2, edge cases (no API key, re-run, no-decision commit, 299-commit cost), Open questions 1–3.
**Schema refs:** [schema-v0.1.md](../design/schema-v0.1.md) §5.1 (decision), §2 (`mined_from` provenance), §6 (proposed status).

## Goal

Turn git history into `proposed` `decision` drafts with `mined_from` provenance, cheaply
and idempotently, using the Claude API with structured output so drafts conform to the
decision schema by construction. This is the first real test of whether drafts are good
enough that certification feels like one keypress.

## Scope

- **Commit selection — heuristic pre-filter BEFORE any LLM call** (`src/mine/prefilter.ts`):
  - Skip: merge commits, lockfile-only diffs, formatting-only diffs, trivial commits.
  - Favor: reverts, messages containing "because"/"instead of", issue/PR refs, substantive diffs.
  - Output a ranked candidate list; this is the cost-control lever (proof repo = 299 commits).
- **Idempotency** (`src/mine/ledger.ts`): record already-mined commit SHAs and skip them so a re-run only drafts new history. **No duplicate drafts for the same SHA.** (Ledger location is Open Q2 — decide below.)
- **Engine** (`src/mine/anthropic.ts`):
  - `@anthropic-ai/sdk`, model from `config.miner.model` (default per Open Q1). Read `ANTHROPIC_API_KEY` from env.
  - **No key set → fail with a clear, actionable message** (use T01's `ArthaError`). `build`/`review`/MCP/`export` must remain fully offline.
  - **Structured output:** use `output_config.format` (JSON-schema) / `messages.parse()` so each draft conforms to the §5.1 decision shape by construction. Reuse the decision JSON Schema from T02.
  - A commit with no real decision → model returns "no decision" → **no file written** (SPEC edge case).
- **Draft writing** (`src/mine/mine.ts`):
  - Emit `status: proposed` decision YAML into `.artha/decisions/` (ADR-numbered filename suggestion; identity is `id`).
  - Set `mined_from: { commit, pr?, source? }`. No `certified_by` on proposed entries.
  - Validate every draft through T02 before writing; never write an invalid file.
- **Cost optimization (optional):** Batches API (50% cheaper, async) is an available path if a single-pass mine is too costly — wire as an opt-in flag, not the default.

> Verify SDK specifics (model ids, `messages.parse()` / `output_config.format`, Batches) against the **claude-api** skill before implementing — do not code Anthropic calls from memory.

## Open questions — DO NOT silently resolve (surface to developer)

- **Q1 — miner model default vs. cost.** Spec defaults to `claude-opus-4-8` (don't downgrade for cost without the user's call). Decide: keep Opus + rely on pre-filter/Batches, or default the miner to `claude-haiku-4-5` / `claude-sonnet-4-6`. Make it config-driven either way; record the chosen default.
- **Q2 — idempotency ledger location.** Track mined SHAs in each entry's `mined_from` only, OR also keep a separate `.artha/.mined` ledger so a *rejected* (deleted) draft's commit isn't re-drafted forever. Trade-off: ledger-only risks a rejected draft silently returning each mine. Decide and document.
- **Q3 — PR vs. commit mining.** Repo has a GitHub remote. Decide whether to pull PR descriptions/discussion via `gh` (highest-value but adds a GitHub dependency) or work from commit messages + diffs only in v0.1. If commit-only, leave a seam for PR enrichment.

## Out of scope

- Other miners (tests-as-spec, issue-tracker, Notion/Jira) — only git-history → decisions ships.
- Mining `invariant`/`convention` kinds — decisions only in v0.1.
- Auto-certification — drafts are always `proposed` (human certifies in T07).

## Acceptance criteria  (SPEC Done-when #2, #3)

- [ ] Produces ≥1 well-formed `proposed` decision with `mined_from` provenance from the proof repo's history.
- [ ] Re-running adds **no duplicate** drafts (idempotent on SHA).
- [ ] No `ANTHROPIC_API_KEY` → `mine` fails with a clear, actionable message; other commands unaffected.
- [ ] A pre-filtered trivial commit incurs **zero** LLM spend; a "no decision" result writes no file.
- [ ] Every written draft passes T02 validation.
- [ ] Open Q1/Q2/Q3 decisions are recorded in this file before implementation is marked done.
