# Task 10 — v0.1 success test & proof-repo harness

**Depends on:** 05, 06, 07, 08 (the full loop). Touches 03, 09 for completeness.
**Spec refs:** SPEC.md §"Done when" (the **v0.1 success test**), §Constraints (proof repo), Open question 5.

## Goal

Prove the end-to-end v0.1 loop works against a **real** repo and that it delivers the
headline outcome: an agent given `context_for_task` applies the repo's conventions
**without them being pasted into the prompt**, using **measurably fewer discovery
tool-calls** than the same agent without Artha.

## Proof repo

[C:\Code\brijesh-engineering-notes](file:///C:/Code/brijesh-engineering-notes) — real TypeScript service
(365 `.tsx` + 258 `.ts`, Vite + Cloudflare Workers, billing/subscription concepts),
299 commits, GitHub remote `brijeshc/brijesh-engineering-notes`.

## Scope

- **End-to-end dry run:** in the proof repo, run `artha init` → `artha mine` → `artha review`
  (certify a handful of money/soft-delete/validation decisions+conventions) → `artha build`
  → start `artha mcp`. Capture that each step works on real data (not fixtures).
- **Define the A/B baseline (Open Q5 — decide first; see below).**
- **Run the A/B:** the chosen billing-area task, once with the Artha MCP server available and
  once without, with the same agent + prompt. Record discovery tool-calls (greps, file reads,
  symbol lookups) for each arm.
- **Assert the outcome:**
  1. The Artha arm applies the repo's money (integer minor units), soft-delete, and validation
     conventions **without them being in the prompt**.
  2. The Artha arm uses **measurably fewer** discovery tool-calls than the no-Artha arm.
- **Write it up:** a short `tasks/results/` (or repo README section) with the baseline definition,
  the fixed task(s), the tool-call counts for both arms, and the verdict.

## Open question 5 — success-test baseline (DO NOT silently resolve)

Decide with the developer before running:
- The concrete fixed task(s) on the proof repo (e.g. "add a proration line item to an invoice"
  exercising money + validation; or a repository method exercising soft-delete).
- The exact A/B: same task, same agent, same prompt — **with** vs. **without** the Artha MCP server.
- The metric + how it's counted (number of discovery tool-calls: grep/find/read/symbol lookups),
  and what "measurably fewer" threshold counts as a pass.

Record the locked baseline in this file before measuring.

## Out of scope

- Any new product feature — this task only exercises and measures what 01–09 built.
- Optimizing ranking/budget beyond what's needed to pass (note findings as follow-ups).

## Acceptance criteria  (SPEC Done-when #8 — the headline)

- [ ] The full `init → mine → review → build → mcp` loop runs on the real proof repo.
- [ ] Open Q5 baseline (task, A/B, metric, threshold) is decided and recorded here.
- [ ] On the billing-area task, the agent given `context_for_task` applies money/soft-delete/validation
      conventions **without them pasted into the prompt**.
- [ ] The Artha arm shows **measurably fewer** discovery tool-calls than the no-Artha arm, per the recorded baseline.
- [ ] Results (baseline + counts + verdict) are written up and committed.
