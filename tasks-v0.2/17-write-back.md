# Task 17 — Write-back: link, certify, edit YAML

**Depends on:** 15 (server + read API), v0.1 T02 (validation), v0.1 T07 (certify semantics to reuse).
**Spec refs:** [SPEC-v0.2.md](../SPEC-v0.2.md) §"D. In-dashboard curation"; Constraints (YAML is source of truth; never auto-certify); edge case (concurrent edits reconciled via git).
**Design refs:** [Product.md](../design/Product.md) §10.3 (curation as visualization), §10.5 (edits as git diffs).

## Goal

Make the dashboard an **authoring surface**: drag to create pins, certify in-browser, and edit
entries — every mutation written to `.artha/*.yaml` as an ordinary git diff, so the picture and
the source of truth never drift, and the index stays a derived read-model.

## Scope

- **Write layer** (`src/serve/write.ts`), reused by the UI:
  - **Link (drag-to-pin):** `POST /api/pin` creates a pin on a concept/fact to a symbol/module;
    validates the symbol resolves; writes the YAML; the map redraws the link on next read.
  - **Certify:** `POST /api/certify` stamps `status: certified` + `certified_by` (git
    `user.name` → `$USER`) + `certified_at` (today), **validating the exact shape before
    writing** (reuse T07's pure certify action — refuse to write an invalid entry).
  - **Edit:** `POST /api/entry` upserts an entry's fields, re-validating through T02; a
    schema-breaking edit is reported, never silently written.
- **Never auto-certify:** certify is only ever an explicit user action (Product.md risk 2).
- **Concurrency:** writes are plain YAML files; an external concurrent edit (git/editor) is the
  user's to reconcile via git — **document this**, no DB-of-record lock. The index is rebuilt
  (or live-rebuilt) after writes so the dashboard reflects disk.
- **Rebuild hook:** after a successful write, trigger (or prompt) `artha build` so the served
  views reflect the new YAML.

## Out of scope

- The LLM interview that *produces* the edited prose (T18 — this task is the write/persist + certify/link plumbing).
- Contradiction panel (T19).

## Contracts produced

- `POST /api/pin` · `POST /api/certify` · `POST /api/entry` — the mutation contract T18 calls; all write valid YAML git diffs.

## Acceptance criteria (SPEC Done-when: in-dashboard linking; certify writes git diffs)

- [ ] Dragging a concept↔symbol creates a **valid pin** in the YAML; the map redraws the link after rebuild.
- [ ] Certifying via the API writes a **valid `certified` entry** (`certified_by` + `certified_at`) to `.artha/*.yaml`; an invalid shape is **refused**, not written.
- [ ] An edit that breaks the schema is **reported**, never silently persisted.
- [ ] Every mutation is a readable `.artha/*.yaml` **git diff** (verified by reading the file back); the index is never the system of record.
- [ ] **No path** writes `certified` without an explicit certify action (no auto-certify).
- [ ] Write endpoints are covered by tests over a temp repo (valid + invalid + concurrent-edit-documented cases).
