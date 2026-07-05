# Artha v0.2 — Task Breakdown

This folder decomposes [SPEC-v0.2.md](../SPEC-v0.2.md) into independently buildable,
**testable** tasks. Each `NN-*.md` is a self-contained work order: goal, dependencies,
scope, the contracts it produces for downstream tasks, and acceptance criteria mapped back
to the spec's **Done when** checklist.

v0.2 re-centers Artha on **human input + visibility** (see [Product.md](../design/Product.md)
status box). The agent loop from v0.1 stays; these tasks add the product model
(`concept`/`flow`), the dashboard (`artha serve`), the ask-the-human loop, embeddings, and a
contradiction preview.

Read order: this index → the task you're picking up. Each task lists `Depends on` (including
the already-merged v0.1 tasks it builds on) so you can start anything whose dependencies are
ready.

## Tasks

| # | Task | Depends on | Delivers |
|---|---|---|---|
| 11 | [Schema — `concept` + `flow` kinds](11-schema-concept-flow.md) | v0.1 T02 | types + JSON Schema + validation for capabilities & sequences; `design/schema-v0.2.md` |
| 12 | [`artha build` — index concepts/flows](12-build-concept-flow.md) | 11, v0.1 T05 | pin resolution + hashing + index tables for states/transitions/steps |
| 13 | [Churn + coverage → dark-zone ranking](13-churn-coverage.md) | 12 | per-module churn/coverage health score; ranked dark-zone queue API |
| 14 | [Embedding-assisted ranking](14-embeddings.md) | 12 | build-time embeddings + vector-assisted retrieval (MCP + dashboard) |
| 15 | [`artha serve` — server + read API](15-serve-server.md) | 12, 13 | local web server, read endpoints over the index + churn, app skeleton |
| 16 | [Product↔Code map + concept/flow detail (UI)](16-map-ui.md) | 15 | ~~area-level map, detail views~~ — shipped, but read as *confusing*; UI superseded by the 16a–c redesign (see [Dashboard.md](../design/Dashboard.md)) |
| 16a | [Dashboard redesign Ph.1 — Understanding Map + KPI header + drawn state machine](16a-dashboard-foundation.md) | 15, 16 | the make-or-break re-skin: churn/coverage encoded visually; KPIs; state machine drawn |
| 16b | [Dashboard redesign Ph.2 — catalog + connections + command-bar search](16b-catalog-connections.md) | 16a | capability cards, focused product↔code leader-lines, ⌘K search |
| 16c | [Dashboard redesign Ph.3 — engineer module view + flow ladder + cold-start funnel](16c-engineer-lens-polish.md) | 16a, 16b | the third lens (enter from code), honest flow coverage, cold-start funnel |
| 17 | [Write-back — link, certify, edit YAML](17-write-back.md) | 15, 16a | drag-to-pin, in-browser certify, dashboard edits as git diffs |
| 17b | [Auto-map — reference graph + suggested pins](17b-reference-graph.md) | 12, 15, 17 | automatic module dependency graph (imports); ranked, explainable pin suggestions confirmed via `POST /api/pin` |
| 18 | [The "ask the human" loop](18-ask-loop.md) | 13, 17, v0.1 T06 | confidence-scored drafts + LLM-guided interview + manual free-capture |
| 19 | [Contradiction preview panel](19-contradiction-preview.md) | 12, 16 | read-only §6.1 deterministic conflicting-facts findings |
| 20 | [v0.2 success test — non-author reads the map](20-success-test.md) | 16, 17, 18 | repeatable protocol + harness for the legibility proof |

## Dependency graph

```
v0.1 T02 schema ─ 11 concept/flow ─┐
v0.1 T05 build  ───────────────────┴ 12 build ext ──┬─ 13 churn/coverage ─┐
                                                     ├─ 14 embeddings      │
                                                     │                     ▼
                                                     └──────────────── 15 serve (API)
                                                                          ├─ 16 map UI ──┬─ 19 contradiction
                                                                          └─ 17 write-back┤
                                                              v0.1 T06 mine ─ 18 ask loop ┤
                                                                                          ▼
                                                                          20 success test (16,17,18)
```

**Critical path:** 11 → 12 → 15 → 16a → 16b/16c · 17 → 18 → 20. Tasks 13, 14, 19 parallelize
off it. The original T16 shipped but read as confusing; the **16a–16c redesign** (rationale +
target design in [Dashboard.md](../design/Dashboard.md)) is now load-bearing for the T20
legibility proof — **16a is the make-or-break demo**.

> **Update 2026-07-04:** 16a–16c are done.
> The 16a/16b page layout was reviewed a second time and rebuilt as the **full-screen atlas
> shell** (treemap atlas + hash routes + navigator/inspector; see
> [Dashboard.md §11](../design/Dashboard.md)), and 16c's engineer lens shipped inside it as
> the module page over a new `/api/module/:id`.
>
> **T17 write-back is done:** `POST /api/certify · /api/pin · /api/entry` over
> `src/serve/write.ts` — each mutation is a `.artha/*.yaml` git diff with a transactional
> rebuild (roll back on a broken build), and certify/edit/link controls live on the
> capability + module pages in the atlas identity (design contract
> [Dashboard.md §11.5](../design/Dashboard.md)). **T18 ask-loop** now hooks into this same
> curation seam (its interview produces the drafts these endpoints persist + certify).
>
> **17b added 2026-07-04** (post-spec addendum): manual one-by-one linking doesn't scale, so
> structural edges (imports, module tree) become fully automatic and meaning edges become
> machine-proposed, human-confirmed suggestions.
> It mines structure, not meaning, so the "no second auto-miner" cut stands; it parallelizes
> with T18 (whose interview can cite the reference graph as context).
>
> **17b is done (2026-07-04):** `artha build` mines an `artha_refs` import graph (auto,
> offline, deterministic); `/api/module/:id` carries `dependsOn`/`usedBy`, `/api/refs` serves
> the graph, and `/api/suggest?id=` returns ranked, explainable, guaranteed-resolvable pin
> suggestions confirmed one-click through `POST /api/pin`. The dashboard grows a "Wired to"
> section, an atlas neighbour-outline, and a "Suggested code" ledger. See
> [17b](17b-reference-graph.md) §Status and [PROGRESS.md](../PROGRESS.md).

## Suggested source layout (shared contract across tasks)

Agreed up front so tasks don't collide on file paths. Extends the v0.1 layout.

```
src/
  schema/
    types.ts            # + Concept, Flow, State, Transition, FlowStep      (T11)
    schema.json         # + concept/flow sub-schemas                        (T11)
  build/
    build.ts            # + concept/flow pin resolution & index rows        (T12)
    embeddings.ts       # build-time vectors                                (T14)
  analytics/
    churn.ts            # git churn per module                              (T13)
    coverage.ts         # coverage + dark-zone health score                 (T13)
    references.ts       # import graph → module-level `artha_refs`          (T17b)
  serve/
    server.ts           # `artha serve` HTTP server                         (T15)
    api.ts              # read endpoints over index + churn                 (T15)
    write.ts            # YAML write-back (pin/certify/edit)                 (T17)
    suggest.ts          # ranked, explainable pin suggestions                (T17b)
    web/                # dashboard frontend (map, detail, panels)          (T16,17,19)
  ask/
    interview.ts        # LLM-guided /ask-me refinement                     (T18)
    confidence.ts       # draft confidence scoring                          (T18)
  contradiction/
    deterministic.ts    # §6.1 conflicting-facts checks                     (T19)
test/                   # vitest suites mirroring src/ (+ a fixture repo)
```

## Unresolved open questions (do NOT silently resolve)

SPEC-v0.2 §"Open questions" must be decided by the developer, not the implementer. Each is
surfaced inside the task that owns it, with a recommended default flagged.

- **OQ1** non-author access (local-only vs static export vs shared serve) → [20-success-test.md](20-success-test.md), noted in [15-serve-server.md](15-serve-server.md)
- **OQ2** confidence-score definition → [18-ask-loop.md](18-ask-loop.md)
- **OQ3** embeddings local vs API, which model → [14-embeddings.md](14-embeddings.md)
- **OQ4** health/churn score formula → [13-churn-coverage.md](13-churn-coverage.md)
- **OQ5** what defines an "area" → [15-serve-server.md](15-serve-server.md)
- **OQ6** interview engine reuse (`miner.engine` vs its own) → [18-ask-loop.md](18-ask-loop.md)
- **OQ7** dashboard tech stack / bundling → [15-serve-server.md](15-serve-server.md)

## Conventions for every task file

- **Spec is source of truth.** Where a task and [SPEC-v0.2.md](../SPEC-v0.2.md) disagree, the spec wins — fix the task.
- **Schema extends, never breaks v0.1.** A v0.1 index/build must keep working; `concept`/`flow` are additive.
- **Never auto-certify.** Concepts, flows, and refined drafts all require a human keypress (T17/T18).
- **YAML is source of truth.** The dashboard writes `.artha/*.yaml` git diffs; the index is a derived read-model.
- **Offline except the LLM step.** Viewing, linking, certifying, building, and MCP run offline; only miner drafting + the edit interview touch a model.
- A task is **done** when its acceptance criteria pass and it doesn't break another task's contract.
