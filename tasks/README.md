# Artha v0.1 — Task Breakdown

This folder decomposes [SPEC.md](../SPEC.md) into independently buildable tasks for v0.1.
Each `NN-*.md` file is a self-contained work order: goal, dependencies, scope, the
contracts it produces for downstream tasks, and acceptance criteria mapped back to the
spec's **Done when** checklist.

Read order: this index → the task you're picking up. Each task lists its `Depends on`
so you can start anything whose dependencies are merged.

## Tasks

| # | Task | Depends on | Delivers |
|---|---|---|---|
| 01 | [Project scaffold & tooling](01-project-scaffold.md) | — | npm package, `artha` CLI shell, MCP entry stub, test harness |
| 02 | [Schema, types & validation](02-schema-types-validation.md) | 01 | TS types + JSON Schema + AJV validator + YAML load/dump |
| 03 | [Config loading & `artha init`](03-config-and-init.md) | 01, 02 | `config.yaml` loader, `artha init` scaffold |
| 04 | [SymbolResolver (tree-sitter JS/TS)](04-symbol-resolver.md) | 01 | `SymbolResolver` iface + tree-sitter impl + content-hash |
| 05 | [`artha build` — compile to SQLite + FTS5](05-build-index.md) | 02, 03, 04 | validation pipeline, index, staleness flip, read contract |
| 06 | [`artha mine` — git → drafts](06-mine.md) | 02, 03 | heuristic pre-filter + Anthropic miner + idempotency |
| 07 | [`artha review` — Ink TUI](07-review-tui.md) | 02 | certify/edit/reject TUI over proposed drafts |
| 08 | [MCP server (stdio)](08-mcp-server.md) | 05 | `artha.context_for_task` + `artha.why`, ranked + budgeted |
| 09 | [`artha export --agents-md`](09-export-agents-md.md) | 05 | compact generated `AGENTS.md` of certified entries |
| 10 | [v0.1 success test & proof-repo harness](10-success-test.md) | 05, 06, 07, 08 | end-to-end A/B against the proof repo |

## Dependency graph

```
01 scaffold
├─ 02 schema ──┬─ 03 config+init ─┐
│              ├─ 06 mine          │
│              └─ 07 review        │
├─ 04 resolver ───────────────────┤
│                                  ▼
│                            05 build/index ──┬─ 08 mcp
│                                             └─ 09 export
└──────────────────────────────────────────────┘
                                                 ▼
                                          10 success test (needs 05,06,07,08)
```

**Critical path:** 01 → 02 → 04 → 05 → 08 → 10. Tasks 06, 07, 09 parallelize off it.

## Proposed source layout (shared contract across tasks)

Agreed up front so tasks don't collide on file paths.

```
package.json            tsconfig.json
src/
  cli.ts                # commander/clipanion entry, maps to bin "artha"
  commands/             # init.ts mine.ts review.tsx build.ts export.ts
  config/config.ts      # load .artha/config.yaml + defaults          (T03)
  schema/
    types.ts            # TS types for entries + pins/provenance/detect (T02)
    schema.json         # JSON Schema §9                               (T02)
    validate.ts         # AJV compile + validate                       (T02)
    load.ts             # per-file YAML load/dump                      (T02)
  resolver/
    SymbolResolver.ts   # interface                                    (T04)
    treeSitterResolver.ts
    hash.ts             # content-hash + whitespace normalization      (T04)
  build/
    build.ts            # the pipeline                                 (T05)
    db.ts index.sql     # SQLite schema §8                             (T05)
  mine/                 # prefilter.ts anthropic.ts ledger.ts mine.ts  (T06)
  review/app.tsx        # Ink UI                                       (T07)
  mcp/
    server.ts           # stdio MCP server                            (T08)
    query.ts            # shared read layer over the index            (T08, used by T09)
    rank.ts             # FTS × structural × status ranking           (T08)
  export/agentsMd.ts    #                                              (T09)
```

## Unresolved open questions (do NOT silently resolve)

SPEC §"Open questions" must be decided by the developer, not the implementer. They are
surfaced inside the task that owns them, with the spec's recommended default flagged:

- **Q1** miner model default vs. cost → [06-mine.md](06-mine.md)
- **Q2** idempotency ledger location → [06-mine.md](06-mine.md)
- **Q3** PR vs. commit mining → [06-mine.md](06-mine.md)
- **Q4** content-hash normalization aggressiveness → [04-symbol-resolver.md](04-symbol-resolver.md)
- **Q5** success-test baseline definition → [10-success-test.md](10-success-test.md)

## Conventions for every task file

- **Spec is source of truth.** Where a task and the spec disagree, the spec wins — fix the task.
- **Schema is frozen to v0.1** ([design/schema-v0.1.md](../design/schema-v0.1.md)). Unknown kinds (`concept.*`/`flow.*`/`exception.*`) are *ignored, never errored*.
- **Never auto-certify.** Nothing reaches `certified` without a human keypress (T07 only).
- A task is **done** when its acceptance criteria pass and it doesn't break another task's contract.
