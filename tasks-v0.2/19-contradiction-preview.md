# Task 19 — Contradiction preview panel (deterministic only)

**Depends on:** 12 (the index), 16 (a panel to render into).
**Spec refs:** [SPEC-v0.2.md](../SPEC-v0.2.md) §"F. Contradiction view — deterministic preview only"; Out of scope (structural/type/LLM detectors + exception loop stay v0.3); edge case (two certified facts contradict → surfaced read-only).
**Design refs:** [contradiction-detection.md](../design/contradiction-detection.md) §6.1 (deterministic consistency checks), §10 (build order step 1).

## Goal

Demonstrate the unique value of holding intent: a **read-only** dashboard panel running only
the **deterministic, zero-false-positive** conflicting-facts checks — the cheapest, most
trustworthy slice of the v0.3 checker, pulled forward.

## Scope

- **Deterministic checks** (`src/contradiction/deterministic.ts`), per contradiction-detection.md §6.1:
  - **Dangling supersession** — A `supersedes: B` but `B.status == certified` (two live contradictory decisions). High severity.
  - **Flow↔concept transition mismatch** — a flow references a transition not in the concept's declared transitions.
  - **Pin integrity** — a pin resolving to no symbol (build should catch; re-surfaced low-severity).
  - **Opposing-detect scope overlap** — two invariants whose `scope` globs intersect and whose structural `detect` queries are provably mutually exclusive.
- **Findings are transient** — recomputed from facts + index on each run, **never committed** (contradiction-detection.md §7).
- **Read-only panel** in the dashboard: list findings with class, the facts/symbols involved, and severity. No triage/exception actions in v0.2 (that's the v0.3 learning loop).

## Out of scope

- Structural/type/**LLM** invariant-violation detectors (§4) — v0.3.
- Flow-**coverage** detector (§5) — v0.3.
- Sanctioned-exception loop / `exception` kind (§8) — v0.3.

## Contracts produced

- `findContradictions(index): Finding[]` (deterministic) + a read-only panel rendering them.

## Acceptance criteria (SPEC Done-when: contradiction preview, zero false positives)

- [ ] Each of the four §6.1 checks **fires** on a planted fixture (a dangling supersession; a flow↔concept mismatch; a dangling pin; an opposing-detect overlap).
- [ ] On a **clean** fixture, **zero** findings — no false positives by construction (deterministic only).
- [ ] Findings are **recomputed per run** and never written to `.artha/` (no committed findings).
- [ ] The panel is **read-only** (no triage/exception UI) and works **offline**.
- [ ] `findContradictions` is pure and unit-tested per check.
