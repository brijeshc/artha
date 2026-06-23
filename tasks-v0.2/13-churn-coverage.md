# Task 13 — Churn + coverage → dark-zone ranking

**Depends on:** 12 (the index, incl. per-pin module mapping).
**Spec refs:** [SPEC-v0.2.md](../SPEC-v0.2.md) §"C. Dark-zone queue, ranked by churn"; Done-when (dark-zone queue); edge case "cold start".
**Design refs:** [Product.md](../design/Product.md) §10 (health score), §10.2 (health dashboard).

## Goal

Compute, per code module, *"how much it churns"* and *"how much certified meaning is attached
to it,"* and combine them into the **dark-zone health score** that ranks the ask-the-human
queue — high-churn, no-meaning modules first.

## Scope

- **Churn** (`src/analytics/churn.ts`): from git history, per module (top-level folder, per
  OQ5), commit count / lines-changed over a window. Deterministic given a fixed history.
- **Coverage** (`src/analytics/coverage.ts`): per module, count of **certified** facts whose
  pins/scope resolve into it; `freshness` = fraction not `stale`.
- **Health score** — `coverage × freshness × inverse(churn)`, low = dark zone. **OQ4
  (developer-owned): pin the exact window, the "covered" definition at module altitude, and
  the weighting.** Implement behind a single `scoreModule()` so the formula is swappable.
- **Ranked queue API**: a pure function returning modules sorted by score (dark zones first),
  each with its churn / coverage / freshness inputs, for T15 to serve and T18 to consume.
- **Cold start**: zero certified → every module is a dark zone (max-priority queue), not an
  error.

## Out of scope

- Serving it over HTTP (T15) or rendering it (T16). Acting on it / drafting (T18).

## Contracts produced

- `darkZones(repoRoot, index): RankedModule[]` — the queue source for T15/T18, with inputs exposed for the UI.

## Acceptance criteria (SPEC: dark-zone queue)

- [ ] On a **fixture repo** with a known history, the ranking is **deterministic** and puts a
      hand-seeded high-churn / no-meaning module **above** a low-churn / well-covered one.
- [ ] Adding a certified concept to a module **lowers** its dark-zone priority on recompute.
- [ ] A `stale`-only module ranks **darker** than an equivalently-churned `certified`-covered one (freshness term).
- [ ] Cold start (empty index) → all modules returned as dark zones, no error.
- [ ] The score formula is isolated in one function (OQ4 swappable) and unit-tested at its boundaries.
- [ ] Runs **offline** (git + index only).
