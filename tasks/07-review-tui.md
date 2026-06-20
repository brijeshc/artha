# Task 07 — `artha review` (Ink TUI)

**Depends on:** 02 (load/validate/write entries). Reads git for diffs (no dependency on T06's internals — works on any `proposed` entry with `mined_from.commit`).
**Spec refs:** SPEC.md §"In scope" (`artha review`), Happy path step 3, §Constraints (never auto-certify).
**Schema refs:** [schema-v0.1.md](../design/schema-v0.1.md) §6 (lifecycle: proposed → certified; reject = delete file).

## Goal

The human-facing seed of Artha: an interactive TUI that shows each drafted entry beside
its source commit/diff and proposed pins, and lets the developer certify / edit / reject
with a single keypress. This is the **only** path to `certified` — nothing auto-certifies.

## Scope

- **Stack:** Ink (React for the terminal), launched by `artha review`.
- **Queue:** all `proposed` entries from `.artha/` (via T02 `loadEntries`). Show queue position (e.g. `3 / 12`) and allow next/prev navigation.
- **Per-entry view (side-by-side):**
  - Left: the rendered draft (title/context/decision/consequences, proposed `pins`).
  - Right: the source commit — message + diff, resolved from `mined_from.commit` via git (use `simple-git` or shell `git show`). Handle missing/absent commit gracefully.
- **Single-key actions:**
  - **Certify** — set `status: certified`, write `certified_by` (from git user / config / `$USER`) + `certified_at` (today, `YYYY-MM-DD`), save via T02 `writeEntry`, advance.
  - **Edit** — open the YAML in `$EDITOR`; on return, re-validate (T02); reject save if invalid and show the error.
  - **Reject** — **delete the proposed file** (schema §6; no tombstone in v0.1). Confirm once to avoid fat-finger.
  - Navigation keys (next/prev/quit). Show the keymap in a footer.
- **Safety:** never write `certified` without an explicit keypress (SPEC constraint, Product.md risk 2). Certify must produce a schema-valid entry (validate before write).

## Out of scope

- Building the index (T05) — review only mutates YAML on disk; the developer runs `artha build` after.
- Editing invariants/conventions specially — the same flow works for any `proposed` entry, but v0.1's miner only produces decisions.
- Re-mining / undo of a reject (deferred; reject is a hard delete).

## Contracts produced

`artha review` mutates `.artha/**` YAML only (certify-in-place / delete). Downstream
state is picked up by `artha build` (T05). No new code contract other than the command.

## Acceptance criteria  (SPEC Done-when #4)

- [ ] Certifies a draft in one keypress; the written file has `status: certified` + `certified_by` + `certified_at` and passes T02 validation.
- [ ] Edits a draft via `$EDITOR`; an edit that breaks the schema is rejected with the validation error (file not corrupted).
- [ ] Rejects a draft in one keypress (after confirm); the file is deleted from disk.
- [ ] Shows the draft beside its source commit/diff and proposed pins; queue navigation works.
- [ ] Runs fully **offline** (no API key needed) — SPEC Done-when #3.
