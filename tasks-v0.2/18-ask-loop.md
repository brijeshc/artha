# Task 18 — The "ask the human" loop

**Depends on:** 13 (dark-zone queue), 17 (write-back/certify), v0.1 T06 (the git miner).
**Spec refs:** [SPEC-v0.2.md](../SPEC-v0.2.md) §"C. The 'ask the human' loop"; Happy path steps 3–7; Constraints (offline except the LLM step; never auto-certify); edge case (no LLM → manual).
**Design refs:** [Product.md](../design/Product.md) §10.3 (annotate the dark), §8 (curation as the spine).

## Goal

Close the elicitation loop: for a dark zone, show the **miner-drafted candidate with a
confidence score**; let the developer refine it through an **LLM-guided `/ask-me`-style
interview**; and let them **free-capture** meaning for an area they just learned — all ending in
an explicit certify. Mining seeds, the human authors.

## Scope

- **Confidence-scored drafts** (`src/ask/confidence.ts`): when the miner pre-fills a draft for a
  queued dark zone, attach a **confidence score**; low confidence flags the drafts that most need
  a human. **OQ2 (developer-owned): the score's definition** — model self-report, a heuristic
  from rationale-signal strength (revert / "because" / issue-ref), or a blend; and the
  "needs-a-human" threshold. Isolate in one scorer so it's tunable.
- **LLM-guided interview** (`src/ask/interview.ts`): opening a draft to edit runs an adaptive
  interview — show the dark-zone code, ask an opening question, follow up on answers ("you said
  X — what happens on Y?"), and rewrite the draft into the developer's words. Output flows into
  T17's edit/certify. **OQ6 (developer-owned): engine reuse** — reuse the `miner.engine` config
  (`api` / `claude-cli`, so subscription users need no API key) or a dedicated setting.
- **Manual free-capture (equal weight):** a path to author meaning for an area the developer
  *just* learned, without being asked — same certify/link plumbing (T17).
- **Offline fallback:** no LLM available → the draft + a **structured form** (fields prompted:
  what it does / why / what rule governs it) still works; only the *interview refinement* needs a model.

## Out of scope

- The write/persist/certify plumbing itself (T17). The map/queue rendering (T16). Tests-as-spec miner (cut from v0.2).

## Contracts produced

- The dark-zone → draft(+confidence) → interview → certify flow, wired to T17's write API and T13's queue.

## Acceptance criteria (SPEC Done-when: ask flow; never auto-certify)

- [ ] A queued dark zone surfaces a **miner-drafted candidate with a confidence score**; low-confidence drafts are flagged.
- [ ] Opening a draft to edit runs an **adaptive LLM interview** that incorporates the developer's answers into the refined entry (testable with a stubbed LLM: given scripted answers, the output reflects them).
- [ ] Certifying the refined draft writes a **valid `certified` entry** (via T17). **Nothing certifies without the keypress.**
- [ ] **Manual free-capture** produces a valid certified entry for an area with no prior draft.
- [ ] **No LLM available** → the structured-form fallback still captures + certifies; only interview refinement is unavailable.
- [ ] The confidence scorer is isolated (OQ2 tunable) and unit-tested at its thresholds.
