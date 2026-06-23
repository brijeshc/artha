# Task 20 — v0.2 success test: a non-author reads the map

**Depends on:** 16 (map + detail UI), 17 (write-back/certify), 18 (ask loop). Exercises the whole stack.
**Spec refs:** [SPEC-v0.2.md](../SPEC-v0.2.md) §"Goal", §"Users & trigger" (non-author reader), the **v0.2 success test** Done-when, open question OQ1 (non-author access).
**Design refs:** [Product.md](../design/Product.md) §15 (the metric that matters most), §10 (shared whiteboard).

## Goal

Prove the v0.2 thesis with a repeatable protocol: a person who did **not** write the code opens
the dashboard, picks a capability, and **correctly describes its implementation and states
without reading code** — the legibility/shared-whiteboard win, not the token-saving one.

## Scope

- **Seed the proof repo:** use the ask-the-human loop (T18) to capture certified meaning for a
  handful of the proof repo's high-churn dark zones — at least one `concept` (with states) and
  the decisions/conventions governing it. This itself exercises the loop end-to-end on real churn.
- **Protocol** (`scripts/` harness, mirroring v0.1's `success-test.sh`):
  1. Pick a capability the non-author has never seen implemented.
  2. They open `artha serve`, navigate the map to that capability, read its detail view.
  3. They write down: the capability's **states**, **how it's implemented** (which modules), and
     the **rules** governing it — **without opening the source**.
  4. Score against ground truth (the author's description / the certified entries).
- **Pass bar:** the non-author's description of states + implementation is **substantially
  correct** (define the rubric in the harness) from the map/detail alone.
- **OQ1 (developer-owned): non-author access.** The test needs a non-author to *see* the
  dashboard. Decide the mechanism: run it locally on a checkout, a read-only **static export**
  of the dashboard, or a shared read-only `artha serve`. Pick the minimum that makes the test
  runnable; record the decision and whether v0.2 needs any sharing primitive at all.

## Out of scope

- Building any product feature (those are T11–T19) — this task is seeding + protocol + the run + write-up.

## Contracts produced

- A reproducible harness + a results write-up (like [tasks/results/v0.1-success-test.md](../tasks/results/v0.1-success-test.md)) + an OQ1 decision record.

## Acceptance criteria (SPEC v0.2 success test)

- [ ] The proof repo has certified `concept`/decision/convention meaning seeded **via the T18 ask loop** (not hand-edited YAML), on real dark zones.
- [ ] A **non-author** completes the protocol and produces a **substantially-correct** description of the capability's states + implementation **without reading code**, scored against the rubric.
- [ ] OQ1 is **decided and recorded** (how a non-author accessed the dashboard; whether a sharing primitive is needed).
- [ ] The harness is **reproducible** (committed script + fixture) and the run is written up with the verdict.
- [ ] Negative control: the same non-author, **without** the dashboard, cannot produce the same description — isolating the dashboard as the cause.
