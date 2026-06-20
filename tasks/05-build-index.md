# Task 05 — `artha build` (compile YAML → SQLite + FTS5)

**Depends on:** 02 (schema/load/validate), 03 (config), 04 (resolver).
**Spec refs:** SPEC.md §"In scope" (`artha build`), Happy path step 4, edge cases (unresolvable pin, staleness flip, reformat-no-flip, empty `.artha/`).
**Schema refs:** [schema-v0.1.md](../design/schema-v0.1.md) §4, §6, §7 (validation), §8 (compiled index — the read contract).

## Goal

Compile the YAML source of truth into a queryable SQLite index, resolving pins, computing
content hashes, flipping drifted certified entries to `stale` (on disk, so it shows in git),
and emitting the §8 tables + an FTS5 index. This is the read contract the MCP server and
export consume — get the table shapes exactly right.

## Scope — the build pipeline (run in order, fail on errors, warn on the rest)

1. **Load + schema-validate** all entries via T02 (`loadEntries`). Unknown kinds already skipped.
2. **Id validation** — pattern, kind-prefix, global uniqueness (T02 covers; assert here).
3. **Certification fields** — `certified_by`/`certified_at` iff `certified` (T02 covers; assert).
4. **Pin resolution (ERROR):** for every `pins[].symbol`, call the resolver (T04). An unresolvable ref **fails the build**, naming the entry id, file, and the bad ref (schema §7.4 / SPEC edge case).
5. **Hash + staleness:** recompute each pin's `content_hash`.
   - Write the freshly computed hash back into the YAML pin (authors leave it blank on new pins).
   - If a `certified` entry has a pin whose hash **changed** vs. what was on disk, flip its `status` to `stale` and **rewrite the file** (T02 `writeEntry`) so the change is visible in git. Record it in the build report.
   - A pure reformat must NOT flip (relies on T04 normalization).
6. **Scope (WARN):** invariants/conventions must have ≥1 glob; expand each glob (repo-root-relative, `**` recursive) into a file set. Empty expansion → warn (likely typo). Store expanded files for overlap/incremental use.
7. **References (WARN):** `why`, `supersedes`, `related` resolve to existing ids; dangling → warn (not error).
8. **Detect (validate):** if present, structurally valid for its `method` (T02's schema already enforces; assert).
9. **Emit SQLite** (overwrite/rebuild): the §8 tables + FTS5.

## SQLite schema (copy §8 exactly — this is the read contract)

```sql
artha_facts(id PK, kind, status, heading, body, severity, why, supersedes,
            certified_by, certified_at, source_path);
artha_pins(fact_id, symbol_id, symbol_ref, content_hash, is_stale);
artha_scope_files(fact_id, file_path);
artha_related(fact_id, related_id);
artha_provenance(fact_id, ref_kind, ref);     -- ref_kind: pr|commit|source
artha_detect(fact_id, method, spec);          -- raw detect block as JSON
-- FTS5 virtual table over (heading, body)
```

- `heading` = `title` (decision) or `name` (invariant/convention). `body` = `decision` text / `rule`, flattened for retrieval.
- Default output path: `.artha/index.db` (configurable). Build is idempotent — a clean rebuild yields identical rows for unchanged input.

## Out of scope

- Ranking / token budgeting / serving (T08 reads this index).
- `AGENTS.md` emission (T09).
- Executing `detect` (stored as JSON only; v0.3).

## Contracts produced

- `.artha/index.db` conforming to §8 — **the stable interface** for T08 and T09.
- `buildIndex(repoRoot, config): BuildReport` with `{ errors, warnings, staled: id[], emitted: count }`.

## Acceptance criteria  (SPEC Done-when #5)

- [ ] Validates YAML, resolves pins via tree-sitter, computes hashes, emits SQLite with an FTS5 table.
- [ ] An unresolvable `path#Symbol` pin **fails the build**, naming the ref.
- [ ] A certified entry whose pinned symbol's logic changed is flipped to `stale` **on disk** and excluded-flagged in the index (`is_stale=1`).
- [ ] A reformat-only change to a pinned symbol does **not** flip staleness.
- [ ] Empty `.artha/` (post-init) → build **succeeds with an empty index**, no error (SPEC edge case).
- [ ] Re-certifying a staled entry (status back to certified) clears `stale` on the next build.
- [ ] Build runs fully **offline** (no API key, no network) — SPEC Done-when #3.
