# Spec: Artha v0.2 — Human-input-first product meaning + the dashboard

> Build-spec derived from the `/ask-me` interview on 2026-06-23. Companion to
> [design/Product.md](design/Product.md) (vision, §10 human-facing layer, §12 roadmap),
> [design/schema-v0.1.md](design/schema-v0.1.md) (the base data model this extends),
> [design/contradiction-detection.md](design/contradiction-detection.md) (the v0.3 checker
> whose §6.1 deterministic slice is previewed here), and [SPEC.md](SPEC.md) (the shipped
> v0.1 loop). Those define *what and why*; this defines *what v0.2 builds and how we'll
> know it works*.

## The reframe (why v0.2 exists)

v0.1 proved the **agent-facing, token-saving** loop: mine decisions from git, certify in a
TUI, serve to agents over MCP (−56% discovery tool-calls on the proof repo). That works and
stays.

But the developer's **critical** use case is different and human-facing:

> "I know how code works — what calls what. I struggle with **product meaning**. Once I
> figure it out (from a senior, from somewhere), I solve the issue. Coming back a month
> later, I've forgotten it and have to re-derive it."

So v0.2 shifts the center of gravity from *"mine drafts → human certifies"* to
**"human supplies and reads product meaning, with mining as an assist"** — and makes that
meaning **visible**. The thesis it must prove: a person who did **not** write the code can
open Artha, pick a capability, and correctly describe how it's built and how it behaves —
without reading code. That is the "shared whiteboard between team and AI" from Product.md
§10 made real.

## Goal (one sentence)
Ship a local web dashboard (`artha serve`) that **asks** developers for product meaning on
the highest-risk unexplained code, **captures** it (concepts, flows, decisions, invariants,
conventions) with miner-drafted starting points the human refines through an LLM-guided
interview, and **shows** it back as a legible area-level Product↔Code map — proving a
non-author can read a capability off the map and describe it correctly.

## Users & trigger
- **Primary (new in v0.2):** the **developer / author** — asked by Artha to explain
  dark-zone code, capturing meaning at the moment they understand it so future-them doesn't
  re-derive it.
- **Primary (the success test):** a **non-author reader** (PM, teammate, leadership) who
  opens the dashboard to *understand* a capability — its states, its implementation, its
  rules — without reading code.
- **Continuing (v0.1):** the **AI coding agent** over MCP, now served richer meaning
  (concepts/flows) and better-ranked (embeddings).
- **Trigger (capture):** developer runs `artha serve`, works the dark-zone queue or
  free-captures meaning for an area they just learned.
- **Trigger (read):** anyone opens the dashboard to explore the map / a concept.
- **Trigger (agent):** unchanged — automatic retrieval mid-task in an Artha-enabled repo.

## In scope

### A. Two new schema kinds — `concept` + `flow`
Extend [schema-v0.1.md](design/schema-v0.1.md) (kinds were reserved there for exactly this):
- **`concept`** — a domain capability (Subscription, Checkout, Refund) with its **states**
  and **transitions** (intent not in the TS types), pinned to the symbol(s) that implement
  it. This is the *product-side anchor* of the map. (Product.md §6.1.)
- **`flow`** — a cross-cutting sequence spanning services (checkout, onboarding) with ordered
  steps/transitions, each ideally pinned to an entry symbol. (Product.md §6.5.)
- Both validate, build, index, and serve through the existing pipeline. The build extends to
  resolve their pins and content-hash them like any other entry.
- **Flow *coverage* detection** (does a declared transition have an implementation?) stays
  **v0.3** ([contradiction-detection.md](design/contradiction-detection.md) §5). v0.2 only
  authors and visualizes flows.

### B. `artha serve` — the local web dashboard (the build surface)
A local-first web app served by the CLI, reading the compiled `.artha/index.db`, writing
edits back to `.artha/*.yaml` as ordinary git diffs (picture and source of truth never
drift — Product.md §10.5). No cloud, no code egress for viewing.
- **Product↔Code map (centerpiece), rendered at AREA/MODULE altitude.** Columns are
  **product areas ↔ top-level code modules**, *not* individual symbols — so it stays legible
  on a thousands-of-symbols repo. Symbols appear only when you drill into a concept's detail.
  A module with no attached certified meaning renders as a **dark zone**.
- **Concept / flow detail view.** One capability with its state machine / sequence, its
  governing invariants and conventions, and the *why* (decisions) — each linked to the
  symbols that implement it. Product reads the states; engineers click into the code.
- **Status everywhere.** Every item shows `certified` / `proposed` / `stale` + provenance.

### C. The "ask the human" loop (proactive elicitation)
- **Dark-zone queue, ranked by churn.** Artha ranks code by *"churns a lot, has zero
  certified meaning"* (the Product.md §10 health score: certification coverage × freshness ×
  inverse churn) and surfaces the highest-risk unexplained areas first. Needs git-churn stats
  + coverage math over the index.
- **Miner-drafted starting point + confidence score.** For a queued dark zone, the existing
  git miner pre-fills a candidate draft ("here's my guess at the why"), carrying a
  **confidence score** (pulled forward from the v0.3 roadmap). Low confidence flags the
  drafts that most need a human.
- **LLM-guided interview on edit.** Opening a draft to edit launches an adaptive,
  `/ask-me`-style interview: Artha shows the dark-zone code, asks an opening question, follows
  up on the answers ("you said X — what happens on Y?"), and rewrites the draft in the
  developer's words. The human then **certifies**. (LLM used for the *interview* step —
  online; viewing and certifying stay offline.)
- **Manual free-capture (equal weight).** A path to record meaning for an area the developer
  *just learned*, without waiting to be asked — the capture-on-learning half.

### D. In-dashboard curation — "visualization IS curation" (Product.md §10.3)
- **Link by drag.** Drag a concept onto a symbol/module (or vice versa) to create a `pin` —
  the join that powers both retrieval and the map.
- **Certify in-browser.** The mined-draft / interview output certified with one action;
  writes the certified YAML back to `.artha/` as a git diff.

### E. Embedding-assisted ranking
Upgrade retrieval (both the MCP server and dashboard search) from lexical-FTS + structural to
**embedding-assisted**. Improves "find the right meaning for this task/query." Adds an
embeddings step to `artha build` and the index.

### F. Contradiction view — deterministic preview only
A read-only dashboard panel running the **deterministic, zero-false-positive** conflicting-
facts checks from [contradiction-detection.md](design/contradiction-detection.md) §6.1
(dangling supersession, flow↔concept transition mismatch, pin integrity, opposing-detect
scope overlap). Demonstrates the unique value of holding intent. The **structural/type/LLM
invariant-violation detectors and the exception loop stay v0.3.**

## Out of scope (explicit)
- **Flow-coverage detection** and invariant-violation detectors (structural / type / LLM) —
  v0.3. v0.2's contradiction panel is §6.1 deterministic conflicting-facts **only**.
- **The sanctioned-exception (`exception` kind) loop** — v0.3.
- **Tests-as-spec miner** — explicitly cut. v0.2 leans on *human* input + the existing git
  miner, not a second auto-miner.
- **Cloud / hosted / multi-user-with-auth dashboard** — local-first only.
- **VS Code webview** — v0.4 (Product.md §12). v0.2 is the browser dashboard.
- **Multi-repo, non-JS/TS languages** — unchanged from v0.1.
- **Continuous contradiction watcher / PR-CI integration** — v0.3–v0.4.

## Behavior

### Happy path (numbered steps)
1. Developer runs `artha serve` in an Artha-enabled repo → a local web dashboard opens,
   reading `.artha/index.db`.
2. The dashboard shows the **Product↔Code map** at area/module altitude; high-churn modules
   with no certified meaning are visibly marked as **dark zones**, ranked into an
   "explain these" queue.
3. Developer opens a dark zone → sees the miner's pre-filled draft + its **confidence score**
   beside the source code/commits.
4. Developer clicks **edit** → an LLM-guided `/ask-me`-style **interview** runs: Artha asks,
   the developer answers in their own words, Artha refines the draft (a `decision` /
   `invariant` / `convention` / `concept` / `flow`).
5. Developer **certifies** in-browser → certified YAML is written to `.artha/` as a git diff;
   `certified_by` + `certified_at` stamped.
6. Developer **links** a concept to the module(s)/symbol(s) that implement it by dragging →
   a pin is created; the map now draws that concept↔code link.
7. (Equal-weight alt path) Developer **free-captures** meaning for an area they just learned,
   without being asked.
8. Developer runs `artha build` (or the dashboard rebuilds) → concepts/flows resolved +
   hashed, embeddings computed, index refreshed.
9. **A non-author opens the dashboard**, picks a capability, and reads its states +
   implementation + governing rules off the map — **without reading code**. (Success test.)
10. The **agent**, unchanged, calls `context_for_task` / `why` over MCP and now receives
    concepts/flows too, ranked with embeddings.

### Edge cases
| Situation | Expected behavior |
|---|---|
| Cold start — nothing certified yet | Dashboard loads; the map is **mostly dark zones**. That's the intended signal ("nobody has explained this"), not an error. The ask-queue is full; viewing works offline. |
| Real repo, thousands of symbols | Map renders at **area/module altitude** by default; individual symbols only inside concept detail. Never draws the full symbol graph (the hairball failure mode). |
| Dark zone but no LLM available / offline | Viewing, the structured fields, and certifying work fully offline. Only the **LLM-guided interview** and miner drafting require a model; absent one, the developer fills the draft manually. |
| Miner draft is wrong / hallucinated | Confidence score flags it; the interview is *correction*, not blind acceptance; nothing is `certified` without a human keypress. (Product.md risk 2 — never auto-certify.) |
| Dashboard edits YAML while git / an editor also touches it | Edits are written as plain YAML files (git diffs); concurrent external edits are the user's to reconcile via git, same as any source file. No lock/DB-of-record divergence — YAML stays source of truth. |
| Pinned symbol changed since certify | Entry flips to `stale` on build (unchanged from v0.1); the map shows it with a stale flag and it's demoted in retrieval. |
| Concept/flow spans many symbols (hard to pin) | Pin to the entry/representative symbol(s); coverage-of-every-transition is **not** validated in v0.2 (that's v0.3 flow-coverage). A flow with `pin: null` transitions is allowed, just shown as not-yet-linked. |
| Non-author doesn't have the repo checked out | **Open question** — see below. v0.2 is local-first; cross-person reading mechanics are unresolved. |
| Two certified facts contradict | Surfaced read-only in the contradiction **preview** panel (§6.1 deterministic checks) — not auto-resolved. |

## Constraints
- **Local-first, no code egress for viewing.** Dashboard + server + index run locally. The
  **only** network call is the optional LLM step (miner drafting + the edit interview),
  reusing the existing `miner.engine` config (`api` / `claude-cli`).
- **YAML stays source of truth.** The dashboard writes `.artha/*.yaml` as git diffs; the
  index is a derived read-model, never the system of record. Picture and source never drift.
- **Never auto-certify.** Concepts, flows, and refined drafts all require a human keypress to
  become `certified` (Product.md risk 2).
- **Schema extends, doesn't break.** `concept` / `flow` are added per the reserved prefixes;
  a v0.1 build that ignored unknown kinds must keep working; v0.2 builds them.
- **Legibility is a hard requirement, not a nice-to-have.** The success test is a non-author
  *reading* the map, so the area-level default and concept-first drill-down are load-bearing.
- **Token-frugal retrieval preserved.** Embedding ranking improves *which* items return; the
  budget discipline from v0.1 (~1.5k tokens default) stays.
- **Proof repo:** continue on a real JS/TS repo (the v0.1 proof repo or similar) so dark-zone
  ranking and the map are exercised on real churn, not a toy.

## Open questions (unresolved — do not silently resolve)
1. **Non-author access.** The success test is a non-author reading the map, but the dashboard
   is local-first and assumes a checked-out repo. How does a PM without the repo see it —
   run it locally, a read-only static export of the dashboard, or a shared read-only serve?
   (Affects whether v0.2 needs *any* sharing primitive or stays strictly single-machine.)
2. **Confidence score definition.** How is a draft's confidence computed — the model's own
   self-reported confidence, a heuristic from the strength of the commit's rationale signals
   (revert / "because" / issue-ref), or a blend? And what threshold flags "needs a human"?
3. **Embeddings: local vs API, which model.** Local-first + privacy argues for on-device
   embeddings; quality/effort argues for an API embedder. Pick the v0.2 default and where the
   vectors live in the index.
4. **Health/churn score formula.** Product.md §10 names "coverage × freshness × inverse
   churn." Pin the exact inputs (churn window, what counts as "covered" at module altitude)
   and weighting for the dark-zone ranking.
5. **What defines an "area"** for the map's product column — config-declared areas, derived
   from concept groupings, or inferred from top-level folders? Determines how the centerpiece
   is populated before many concepts exist.
6. **Interview engine reuse.** Does the dashboard interview reuse the `miner.engine` config
   (`api` / `claude-cli`) verbatim, or get its own setting? (Claude-CLI reuse means no API key
   for subscription users, consistent with v0.1.)
7. **Dashboard tech stack** — framework, build tooling, and how it's bundled into the npm
   package without bloating the offline CLI. (v0.1 kept `dist/cli.js` ~63 KB; a frontend is a
   different beast.)

## Done when (checkable acceptance criteria)
- [ ] Schema adds `concept` (states/transitions) and `flow` (ordered steps) kinds; both
      validate, build (pins resolved + content-hashed), index, and serve. v0.1 entries
      unaffected.
- [ ] `artha serve` launches a local web dashboard that reads `.artha/index.db` and renders
      the **Product↔Code map at area/module altitude**, with dark zones (high-churn,
      no-meaning modules) visibly marked.
- [ ] A **concept/flow detail view** shows states/sequence + governing invariants/conventions
      + decisions, each linked to its symbols, with `status` on every item.
- [ ] A **dark-zone queue** ranks modules by the churn-based health score; the top items are
      genuinely the high-churn / no-meaning areas of the proof repo.
- [ ] An ask-flow: a queued dark zone shows a **miner-drafted candidate with a confidence
      score**; clicking edit runs an **LLM-guided interview** that refines it; certifying
      writes certified YAML to `.artha/` as a git diff. Nothing certifies without a keypress.
- [ ] **In-dashboard linking**: dragging a concept↔symbol/module creates a pin and the map
      redraws the link.
- [ ] **Embedding-assisted ranking** is live in `context_for_task` / dashboard search (build
      computes embeddings; retrieval uses them).
- [ ] A **contradiction preview panel** shows the §6.1 deterministic conflicting-facts
      findings, read-only, with zero false positives by construction.
- [ ] The full loop runs **offline except the LLM interview/draft step** (viewing, linking,
      certifying, building, MCP all offline).
- [ ] **v0.2 success test:** a person who did **not** write the code opens the dashboard,
      picks a capability, and **correctly describes its implementation and states without
      reading code** — verified against the proof repo.
