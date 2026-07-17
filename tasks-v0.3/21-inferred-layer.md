# Task 21 - The inferred layer: machine-described code meaning (DRAFT)

**Status: draft for review, 2026-07-05. Nothing here is locked; OQs at the bottom must be resolved with the developer before build.**

**Depends on:** v0.2 T12 (index), T13 (module altitude + churn), T17 (write-back), T17b (reference graph, structural scan); v0.1 T06 (pluggable miner engine, ledger, spend cap) for phase 21b.
**Spec refs:** revises the v0.2 cut "no second auto-miner" (SPEC-v0.2 §Cut) - see §Why for the argument; extends Product.md §8 (curation pipeline) and §12 (roadmap).
**Design refs:** Product.md §5 (design principles - §5.2 anti-bloat is *preserved*, see §Model), Dashboard.md §11 (atlas identity this extends); the UX contract in §UX below is to be lifted into Dashboard.md §12 when the build starts.

## Why (and why it revises the v0.2 cut)

The realization (2026-07-05): in practice, human input on meaning will exist but to a *lesser extent* than v0.2 assumes.
Before a human will curate anything, the map must already be lit by a comprehensive, AI-extracted representation of code meaning.
Otherwise the first-run experience is a black map plus a homework queue, and most developers stop before the loop starts.

Evidence from this project's own data:

- The v0.1 success test mined a real 299-commit repo and found **3** commits with rationale signals; every certified fact of value was hand-authored (tasks/results/v0.1-success-test.md).
- Product.md risk #1 names curation cost as the central risk, but v0.2 only made the *certify click* cheap; the *authoring* of stratum-2 meaning (below) stayed with the human, at a blank page.
- The v0.2 proof (T20, "a non-author reads the map") presupposes a filled map; today nothing fills it.

The framing: meaning has **three strata**.

1. **Structure** - imports, module tree. Proof-grade, extracted automatically since T17b. No human, no LLM.
2. **Derivable meaning** - what the code does and how: module purposes, concepts embodied in types, state machines in status fields, flows behind entry points, invariants implied by guards, conventions visible as repetition.
   An LLM (seeded by deterministic candidates) recovers this reliably. **This is the missing foundation, and this task.**
3. **The delta** - what code cannot contain: the why, business rules, constraints, tribal warnings, planned meaning.
   Irreplaceable human input; the interface must make placing it effortless (§UX, D6).

Why this does not reopen the hallucination door the v0.2 cut was guarding:
the cut protected against machine-invented *intent*.
Stratum 2 is *description*, checkable against the code it cites; every claim must carry resolvable evidence pins and pass a verification gate (21b).
Intent (stratum 3) stays human, and **nothing auto-certifies - ever**.

## Goal

`artha build` (plus an opt-in synthesis step) produces a full-coverage, evidence-pinned, confidence-graded **inferred layer** of code meaning, so that:

- a stranger's repo renders a lit, readable map within minutes of clone, with zero human input;
- the human's job collapses to **vouching, correcting, and adding the delta** - never authoring descriptions from blank;
- agents over MCP receive inferred meaning clearly labeled as machine-described, below vouched facts in budget priority.

## Model (the architectural decision)

**The inferred layer is a regenerable cache, not knowledge.**

- Inferred facts live in the index, content-hashed against the code they describe, and re-derive on drift.
  They cannot rot; there is nothing to maintain.
- The `.artha/` YAML store remains exactly what it is today: the **human delta** (and human-touched materializations - see below).
  Product.md §5.2 ("store only what is not recoverable from code") survives intact: we *store* the delta, we *compute* the description.
- **Trust ladder** replaces the binary: structure (proof) < inferred (described, labeled) < certified (vouched).
  `status` in YAML remains the human lifecycle (proposed / certified / stale).
  Inferred facts carry an `origin: inferred` marker + confidence in the index; the moment a human touches one (vouch or edit), it **materializes** into `.artha/` YAML with provenance (`derived_from: inferred@<hash>`) and enters the normal lifecycle.
- Vouching an inferred fact = the existing one-keystroke certify (T17 path, a git diff); correcting it = the existing edit path.
  No new write machinery.

## Scope

### 21a - deterministic candidates (offline, LLM-free, ~free)

Extraction over machinery that already exists (tree-sitter resolver, T17b structural scan, T13 module altitude):

- **Module cards**: purpose candidates from exported symbol names, file names, and the T17b dependency position (hub vs leaf).
- **State-machine candidates**: union types, enums, and `status`-like string fields → concept drafts with states; transitions guessed only when literal assignments/comparisons make them evident.
- **Flow skeletons**: exported entry points + T17b import fan-out → ordered step candidates (file-level; symbol-level call graph stays out of scope).
- **Convention candidates**: naming regularities (e.g. `*Repo`, `*Handler`) and repeated guard shapes across a module.
- Everything is **evidence-pinned** (the pins are where the candidate was read from), deterministic, offline; rebuild is byte-identical.
- Emitted into the index as `origin: inferred`, confidence tier "read from code".

### 21b - LLM synthesis + verification (opt-in, spend-capped, incremental)

- `artha infer` (command seam; also a build flag) enriches 21a candidates into **readable meaning**: product-language names, 2-3 sentence summaries, completed state machines, flow step descriptions.
  Hierarchical map-reduce: file cards with a cheap model, module/area synthesis with a strong one.
- **Pluggable engine + ledger + spend cap**, reusing the T06 `Miner` pattern (`api` / `claude-cli`); incremental by content hash - only changed subtrees re-synthesize; steady-state cost ≈ 0.
- **Verification gate**: every claim must cite pins that resolve; a checker pass validates claim-vs-pinned-code; unverifiable claims are dropped or downgraded to the lowest confidence tier.
  Confidence is stored per fact.
- **MCP**: inferred facts are served clearly labeled (like `[proposed]` today, e.g. `[machine-described, unverified by team]`), ranked below vouched facts, never served as certified.
  Rationale-shaped text (a "why") is **never** synthesized as fact; at most the machine asks the human for it (§UX, D8).
- Viewing/serving stays fully offline; synthesis is the only network touch, opt-in, like `mine`.

### 21c - the dashboard reframe

Implements the UX contract below on the existing atlas shell: the two-light grammar, prose-first pages, vouch-by-reading, the delta band, the inverted interview entry point, the value-ranked queue, honest KPIs.

## UX design contract (draft) - readability and meaning above all

The failure mode this contract exists to prevent: **people tire and leave**.
They tire when pages read as machine output, when the tool asks before it gives, and when they cannot tell what to trust.
Every choice below is subordinate to one test, inherited from Dashboard.md: *any view must answer "what am I looking at, and how much do I trust it" in five seconds*.

**D1. Value before ask.**
The dashboard must be worth opening even if the team never vouches a single fact - as an onboarding and reading tool over the inferred layer.
Vouching multiplies value; it is never the price of admission.
No modal prompts, no gamification, every ask dismissible.

**D2. Two lights, one grammar.**
Machine-described renders as **moonlight** (a cooler, dimmer tier of the existing ramp); human-vouched keeps the **phosphor** glow; disagreement uses the existing ember/stale treatments.
No third hue is introduced; confidence maps to intensity within moonlight, never to new colors.
The map answers "described vs trusted" at a glance without a legend.

**D3. Prose first, structure second.**
Every capability/module page leads with 2-3 plain-language sentences a non-author can read aloud.
State machines, tables, and pin lists come after the prose, never instead of it.
Density is capped: top-N per section with "and 12 more", because walls of generated text are how tools get closed.

**D4. Product language or silence.**
Inferred concepts get names a PM would say ("Subscription lifecycle"), never restated paths; module ids stay mono, as today.
Naming is the highest-risk readability surface of machine text, so: the synthesis prompt optimizes for it, low-confidence names fall back to neutral descriptions rather than jargon, and **renaming is the cheapest correction** (one field, one keystroke, high-signal).

**D5. Every machine sentence carries its evidence, one interaction away.**
Any inferred claim reveals the pins that back it on hover/click (the T17b `why` pattern, generalized).
No unexplained assertions anywhere in the UI.

**D6. The delta band: human ink over machine print.**
Every capability/module page has one visually distinct slot - "What the code can't say" - for business rules, constraints, history, warnings.
Human-authored sentences are typographically distinct from machine prose (weight/ink within the existing system stacks - no new fonts, viewing stays offline).
Provenance is per field, not per page: states may be inferred while the why is human, and the reader can always tell which is which.

**D7. Confidence is worded, not numbered.**
Never "0.73".
Three tiers, in words: "read from code" (deterministic), "inferred" (synthesized, verified), "uncertain" (survived with a downgrade).
Numbers on a page are reserved for facts (churn, counts), so that when a number appears it means something.

**D8. Correct, don't compose.**
Every authoring entry point presents a machine draft to react to; blank composition exists but is never the default path.
The T18 interview inverts accordingly: "Here is my read of refunds - what did I get wrong, and what's missing?" instead of "explain this module".
Where inference is weak it asks one targeted question ("I can see retry attempts 3 times; I can't see why 3"), never presents a form.

**D9. Reading is reviewing.**
The vouch affordance lives on the reading surface: one keystroke on any inferred page ("looks right") certifies via the existing T17 path; edit-in-place is the deeper correction.
There is no separate review mode for the ambient layer, and the proposed-queue pattern is not extended to it - a queue over thousands of inferred facts would be the tiredness machine this contract forbids.

**D10. The queue ranks by value, not darkness.**
The ask-queue reorders by **agent-consumption × churn × uncertainty** (what agents actually pull over MCP, where code moves, where the machine is least sure).
Every row states its "why now" in words, same discipline as D5.

**D11. Honest KPIs.**
"% explained" would become a lie the day the machine lights everything.
The top bar reframes to: **% described** (machine), **% vouched** (team), **disagreements** (count).
The inferred layer must never inflate a trust metric.
*(Shipped 2026-07-07 via task 23a: % vouched as churn-weighted certified depth, % described as machine reach on a moonlight tone; the disagreements readout still waits on T22.)*

**D12. Drift is quiet for moonlight, loud for phosphor.**
Inferred facts regenerate silently on code change (cache semantics - nothing to nag about).
Vouched facts keep the existing stale seam and re-certify flow.
Users are never asked to maintain machine text.

## Out of scope

- Local-model synthesis (a small on-device LLM for file cards) - attractive later, not v0.3.
- Doc/ticket/wiki ingestion for the product side - v0.4.
- Symbol-level call-graph flow precision - unchanged from the v0.2 position.
- Auto-certify - forbidden everywhere, forever.
- Multi-language - unchanged (JS/TS).

## Contracts produced

- `origin` + `confidence` on index facts (and the `derived_from` provenance field on materialized YAML) - the trust ladder T22 (contradictions), T18 (interview), and MCP labeling read from.
- `artha infer` command seam + engine/config (mirrors T06).
- The evidence-pin requirement: no inferred fact exists in the index without resolvable pins.
- The UX contract above, lifted into Dashboard.md §12 at build time.

## Acceptance criteria (per phase)

21a: **done (2026-07-07).**
- [x] On a repo with **zero** `.artha/` entries, `artha build` emits inferred module cards + state-machine/flow/convention candidates, all evidence-pinned; the dashboard renders a lit (moonlight) map - never black.
- [x] Fully offline, no LLM; rebuild byte-deterministic; existing v0.1/v0.2 behavior unchanged when inferred facts are ignored.

21b: **21b-1 shipped 2026-07-16** (the synthesis pipeline: names + summaries, verifier gate, cache + build overlay). OQ-C locked with the developer 2026-07-16: **single strong model** (`infer.model`, default `claude-opus-4-8`, no cheap tier for now); scope reaches transitions + flow-step text (a later slice); an unverifiable claim is **kept and marked `uncertain`**, never silently dropped.
- [x] `artha infer` is opt-in, spend-capped, incremental (unchanged candidate → zero spend, content-hash cache), engine-pluggable (`api` / `claude-cli`); a failed/absent engine leaves 21a output intact (build overlays only what `infer` cached).
- [x] Every synthesized claim cites resolvable pins; the verifier demonstrably downgrades a planted false claim in tests (a code-shaped assertion absent from the pinned evidence → `uncertain`). *(21b-1 covers names + summaries; transitions + flow-step verification land with that slice.)*
- [x] MCP serves inferred facts labeled, below vouched facts in budget order; never as certified; rationale is never synthesized. *(21b-3, 2026-07-17: `rankInferred` + `formatInferredItem` in `rank.ts`; a separate `artha_inferred_fts` corpus so human bm25 is untouched; `contextBundle` fills the budget with vouched facts first and seats the machine layer in the remainder; on by default via `include_inferred`; `why` stays human-only.)*

**21b sub-slices** (impact-ordered, mirroring 23d):
- [x] **21b-1 - the synthesis pipeline (shipped 2026-07-16).** `Inferrer` engine (`src/infer/*`, mirroring the T06 `Miner`: `api` + `claude-cli`, shared prompt/schema/parse); `artha infer` (`src/infer/infer.ts` + `src/commands/infer.ts`) re-derives the exact 21a candidates, reuses an unchanged **content-hash cache** (`.artha/.inferred.json`, committable like `.mined`, drift-keyed by the pins' hashes), and synthesizes the rest up to a per-candidate spend cap (`--max`, default 50). The **verifier** (`src/infer/verify.ts`) grounds every code-shaped assertion (backtick spans + camelCase/snake_case/digit-mix identifiers) against the pinned evidence by word-pieces, downgrading the ungrounded to `uncertain` (plain product language passes; a foreign term does not); no evidence → `uncertain`. `artha build` overlays the cache onto the 21a facts only where the evidence hash still matches, so drift silently reverts to the deterministic text (D12). `+33` tests (verifier grounding/downgrade/empty-evidence; parse/prompt; cache round-trip/mangled/versioned/drift-hash; orchestrator synthesize/downgrade-planted-false/incremental-reuse/spend-cap/dry-run/decline; build overlay + drift revert; config parse), lint + both typechecks, **live E2E** via the `claude-cli` engine on the demo (`infer --max 1` synthesized `OrderState` → "Order lifecycle" + a grounded summary that itself notes the transition rules "are not defined here", verified `inferred`; `build` overlaid it into the index while the other 8 stayed `read-from-code`).
- [x] **21b-2 - transitions + flow-step text (done 2026-07-17).** Synthesis + the verifier extended to state-machine transitions (both states must be real members; the trigger stays grounded) and flow-step descriptions, with the storage + render they need.
  - [x] **flow-step text.** A flow's reached modules (already extracted by 21a as `inferred_steps`) each get one synthesized line - what the flow does there, read from the entry's pinned code - keyed back to the real module so a hallucinated step is dropped, verifier-gated on the same tier as the name/summary, stored in a new `note` column that the build overlays and reverts on drift (D12), and rendered as a moonlight list beside each module. The *order* is never synthesized (D8). Cache v2.
  - [x] **state-machine transitions.** Locked with the developer: **the model proposes, a deterministic gate grounds** (a deterministic edge+trigger extractor would need dataflow the project cut), fed by a new **cross-file state-usage index** (`SymbolResolver.memberUsages`; 21a pins the usage sites as `usage` evidence, so the code that moves a state - usually in another file - is pinned, drift-hashed, revealable). `infer.ts` drops any edge whose from/to is not a real state (fabricated = false, not uncertain); `verify.ts` grounds each surviving trigger on the concept's one tier. New `artha_inferred_transitions` table, cache v3, build overlay + drift-revert; `materializeInferred` seeds the human `transitions` draft. **Render: a moonlight list** (`Transitions read from code`), not the 23e-1 chalk lifecycle - the live E2E showed the diagram tangles under many verbose machine triggers, and the list stays readable; a happy consequence is that 23e-1's "every concept arrow is human ink" holds unchanged. Live-E2E'd with the real engine (7 grounded transitions read cross-file).
- [x] **21b-3 - MCP serving (2026-07-17).** `rank.ts` surfaces inferred facts labeled (`[machine-described, unverified by team]`; `uncertain` → `[machine-described, uncertain]`), ranked in a **separate `artha_inferred_fts` corpus** so the machine layer never perturbs human bm25, and seated by `contextBundle` in **only the budget the vouched facts leave over** (a shared greedy packer). On by default (`include_inferred`, opt-out for a vouched-only bundle); never certified; `why` stays human-rationale-only, so rationale is never synthesized. Live-E2E'd on a real build.
- [ ] **21b-4 - the `uncertain` render.** The dimmest-moonlight tier + worded label on the dashboard (the tier already words itself via `INFERRED.confidence`; this is the visual treatment).

21c:
- [ ] The two-light grammar, prose-first pages, delta band, worded confidence, vouch-by-reading, inverted-draft entry points, value-ranked queue, and reframed KPIs ship per D1-D12.
- [ ] Vouching an inferred fact is one keystroke → a `.artha/` YAML git diff via the existing write path; editing materializes with `derived_from` provenance.
- [ ] **Proof:** on a stranger repo, clone-to-lit-map in under 10 minutes with zero human input, and a non-author correctly describes a capability from inferred content alone (the T20 protocol, arm 1).

## Open questions

**Locked with the developer 2026-07-05 (build of 21a underway):**

- **OQ-A - inferred storage → LOCKED: index-only regenerable cache + materialize-on-touch.**
  Inferred facts live only in `.artha/index.db`; nothing new is committed.
  Vouching/editing one materializes it into `.artha/` YAML with `derived_from: inferred@<hash>` provenance, entering the normal human lifecycle.
  (`artha export --inferred` for PR review of the machine layer stays a later option, not built now.)
- **OQ-B - schema shape → LOCKED: `origin` + `confidence`, human `status` trio untouched.**
  Implemented as **parallel `artha_inferred*` tables** in the same index (not a fourth `status` value), so existing v0.1/v0.2 queries are byte-unchanged when inferred facts are ignored (the 21a acceptance criterion, satisfied by construction).
  MCP label derives from `origin`.
- **OQ-D - confidence wording → LOCKED (D7 wording): `read from code` (deterministic 21a), `inferred` (synthesized+verified 21b), `uncertain` (survived with a downgrade).**
  Stored as slug (`read-from-code`), rendered as words; 21a emits only `read-from-code`.
- **OQ-E - sequencing → LOCKED: 21a lands before T18** so the interview is built inverted (D8); T20 then runs both arms (inferred-only, then vouched).

**Still open (deferred to 21b):**

- **OQ-C - synthesis engine + cost defaults.** Which models per tier, default cap, resume semantics (mirror T06's decisions). Resolved when 21b starts.
