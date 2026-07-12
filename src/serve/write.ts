import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildIndex } from '../build/build';
import { openIndex } from '../build/db';
import type { ArthaConfig } from '../config/config';
import type { Embedder } from '../embed/embedder';
import type { SymbolResolver } from '../resolver/SymbolResolver';
import { certifyDraft, resolveIdentity } from '../review/actions';
import { loadEntries, writeEntry } from '../schema/load';
import type { ArthaEntry, Kind, Status } from '../schema/types';
import { validateEntry } from '../schema/validate';

/**
 * In-dashboard curation (T17): the three mutations that turn the dashboard into
 * an **authoring surface** - link (drag-to-pin), certify, and edit - each written
 * back to `.artha/*.yaml` as an ordinary git diff so the picture and the source
 * of truth never drift, and the index stays a derived read-model.
 *
 * Every mutation is transactional through {@link commitWrite}: the YAML is written,
 * the index is rebuilt so the map reflects it, and if that rebuild fails the file
 * is rolled back - disk is always left in a buildable state. Nothing here can
 * produce a `certified` entry except {@link certifyEntry} (never auto-certify).
 */

/** `.artha/<dir>/` a kind's entries live in. */
const KIND_DIR: Record<Kind, string> = {
  decision: 'decisions',
  invariant: 'invariants',
  convention: 'conventions',
  concept: 'concepts',
  flow: 'flows',
};

export interface WriteOk {
  ok: true;
  id: string;
  status: Status;
  /** Absolute path of the `.artha/*.yaml` that changed - the rollback target. */
  path: string;
  /** File content before the write, or `null` if it did not exist (rollback). */
  priorContent: string | null;
  /** True when the write created a new entry file. */
  created: boolean;
}

export interface WriteErr {
  ok: false;
  /** HTTP-ish status: 400 bad request · 404 not found · 409 conflict · 422 unprocessable. */
  code: number;
  error: string;
}

export type WriteOutcome = WriteOk | WriteErr;

/**
 * Certify an entry in place - the one path to `certified`. Reuses T07's pure
 * {@link certifyDraft}, which stamps `certified_by`/`certified_at`, **validates
 * the exact shape before writing**, and refuses an invalid entry. Explicit user
 * action only; there is no auto-certify anywhere.
 */
export function certifyEntry(repoRoot: string, id: string, now?: Date): WriteOutcome {
  const arthaDir = join(repoRoot, '.artha');
  let entry: ArthaEntry | undefined;
  try {
    entry = findEntry(arthaDir, id);
  } catch (error) {
    return { ok: false, code: 422, error: msg(error) };
  }
  if (!entry) return { ok: false, code: 404, error: `no entry '${id}'` };
  if (entry.source_path === undefined) {
    return { ok: false, code: 422, error: `entry '${id}' has no source file on disk` };
  }

  const path = entry.source_path;
  const priorContent = readMaybe(path);
  try {
    const certified = certifyDraft(entry, resolveIdentity(repoRoot, now));
    return { ok: true, id, status: certified.status, path, priorContent, created: false };
  } catch (error) {
    return { ok: false, code: 422, error: msg(error) };
  }
}

/**
 * Link (drag-to-pin): add a `pin` from an entry to a `path#Symbol`. The symbol
 * must **resolve in the target repo** (checked here before any write), so the
 * on-disk YAML never becomes unbuildable. Adding a link is additive curation -
 * it does not change the entry's standing (a certified concept stays certified
 * when you attach more code to it; the new pin is hashed on rebuild).
 */
export function addPin(
  repoRoot: string,
  id: string,
  symbol: string,
  resolver: SymbolResolver,
): WriteOutcome {
  const arthaDir = join(repoRoot, '.artha');
  const ref = symbol.trim();
  if (ref === '') return { ok: false, code: 400, error: 'a symbol ref (path#Symbol) is required' };

  let entry: ArthaEntry | undefined;
  try {
    entry = findEntry(arthaDir, id);
  } catch (error) {
    return { ok: false, code: 422, error: msg(error) };
  }
  if (!entry) return { ok: false, code: 404, error: `no entry '${id}'` };
  if (entry.source_path === undefined) {
    return { ok: false, code: 422, error: `entry '${id}' has no source file on disk` };
  }
  if (!resolver.resolve(ref)) {
    return {
      ok: false,
      code: 400,
      error: `could not resolve '${ref}' - a pin must be path#Symbol pointing at a real source symbol`,
    };
  }

  const path = entry.source_path;
  const priorContent = readMaybe(path);
  const pins = entry.pins ?? [];
  if (pins.some((p) => p.symbol === ref)) {
    // Already linked - idempotent, nothing to write.
    return { ok: true, id, status: entry.status, path, priorContent, created: false };
  }

  const next: ArthaEntry = { ...entry, pins: [...pins, { symbol: ref }] };
  const result = validateEntry(withoutSourcePath(next));
  if (!result.ok) return invalid(result.errors);

  writeEntry(next, path);
  return { ok: true, id, status: next.status, path, priorContent, created: false };
}

/**
 * Edit: upsert an entry's fields, **merged over the existing entry** so a partial
 * patch (say just `summary`) never drops the fields the UI doesn't show
 * (`pins`, `mined_from`, `tags`). The merged result is re-validated through T02;
 * a schema-breaking edit is reported, never written. An edit is **never a
 * certification** - the result is forced to `proposed` and the certification
 * stamps are cleared, so changed content must be re-vouched via {@link certifyEntry}.
 */
export function upsertEntry(repoRoot: string, patch: unknown): WriteOutcome {
  const arthaDir = join(repoRoot, '.artha');
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return { ok: false, code: 400, error: 'entry must be a JSON object' };
  }
  const obj = patch as Record<string, unknown>;
  const id = obj.id;
  if (typeof id !== 'string' || id === '') {
    return { ok: false, code: 400, error: 'entry.id is required' };
  }

  let existing: ArthaEntry | undefined;
  try {
    existing = findEntry(arthaDir, id);
  } catch (error) {
    return { ok: false, code: 422, error: msg(error) };
  }

  const kind = existing?.kind ?? obj.kind;
  if (typeof kind !== 'string' || !(kind in KIND_DIR)) {
    return {
      ok: false,
      code: 400,
      error: `entry.kind must be one of: ${Object.keys(KIND_DIR).join(', ')}`,
    };
  }
  if (existing && typeof obj.kind === 'string' && obj.kind !== existing.kind) {
    return { ok: false, code: 409, error: `cannot change the kind of '${id}'` };
  }

  // Merge the patch over any existing entry, then force a non-certified standing:
  // editing is not certifying, and changed content must be re-vouched by a human.
  // Drop the stamps + loader-only field so an edit can never carry a certification.
  const base = existing ? withoutSourcePath(existing) : {};
  const { certified_by, certified_at, source_path, ...clean } = { ...base, ...obj };
  void certified_by;
  void certified_at;
  void source_path;
  const merged: Record<string, unknown> = { ...clean, kind, id, status: 'proposed' };

  const result = validateEntry(merged);
  if (!result.ok) return invalid(result.errors);

  const path = existing?.source_path ?? join(arthaDir, KIND_DIR[kind as Kind], `${id}.yaml`);
  const priorContent = readMaybe(path);
  writeEntry(result.entry, path);
  return { ok: true, id, status: 'proposed', path, priorContent, created: existing === undefined };
}

/**
 * Record the delta band (D6): the human ink an entry's `notes` field holds -
 * "what the code can't say". **Additive, like {@link addPin}**: it merges only
 * `notes` and leaves the standing untouched, so recording the delta on a
 * *certified* concept keeps it certified (the vouched claim - its states, its
 * summary - is unchanged; this is knowledge layered on top, not a correction of
 * it). Passing an empty string clears the field. Re-validated through T02; an
 * inferred id has no YAML, so it is refused (materialize it first by vouching).
 */
export function setNotes(repoRoot: string, id: string, notes: string): WriteOutcome {
  const arthaDir = join(repoRoot, '.artha');
  let entry: ArthaEntry | undefined;
  try {
    entry = findEntry(arthaDir, id);
  } catch (error) {
    return { ok: false, code: 422, error: msg(error) };
  }
  if (!entry) return { ok: false, code: 404, error: `no entry '${id}'` };
  if (entry.source_path === undefined) {
    return { ok: false, code: 422, error: `entry '${id}' has no source file on disk` };
  }

  const trimmed = notes.trim();
  const path = entry.source_path;
  const priorContent = readMaybe(path);
  // Empty clears the field entirely (omit it) rather than persisting a blank
  // string; otherwise attach the trimmed delta. Everything else is preserved.
  const { notes: _prior, ...rest } = entry as ArthaEntry & { notes?: string };
  void _prior;
  const next = (trimmed === '' ? rest : { ...rest, notes: trimmed }) as ArthaEntry;

  const result = validateEntry(withoutSourcePath(next));
  if (!result.ok) return invalid(result.errors);

  writeEntry(next, path);
  return { ok: true, id, status: next.status, path, priorContent, created: false };
}

// ── transactional commit (write → rebuild → roll back on failure) ──────────────

export interface CommitDeps {
  repoRoot: string;
  config: ArthaConfig;
  /** `getEmbedder(config)`; used only when the index already carries vectors. */
  embedder: Embedder | null;
  /** The served index path - the has-vectors check and the rebuild target. */
  dbPath: string;
}

export type CommitResult =
  | { ok: true; id: string; status: Status; created: boolean; staled: string[] }
  | { ok: false; code: number; error: string };

/**
 * Run one mutation, then rebuild the index so the served views reflect the new
 * YAML (the map redraws the link). If the rebuild fails, the changed file is
 * rolled back and an error is returned - the index is only ever rebuilt from a
 * buildable tree, so a bad edit can never leave the dashboard broken.
 *
 * Concurrency: writes go through a single lock in the server; an external editor
 * or git touching the same YAML is the user's to reconcile via git (YAML stays
 * the system of record), exactly like any source file.
 */
export async function commitWrite(
  deps: CommitDeps,
  mutate: () => WriteOutcome | Promise<WriteOutcome>,
): Promise<CommitResult> {
  let outcome: WriteOutcome;
  try {
    outcome = await mutate();
  } catch (error) {
    return { ok: false, code: 500, error: msg(error) };
  }
  if (!outcome.ok) return { ok: false, code: outcome.code, error: outcome.error };

  // Reuse the previous index's embeddings only when it already had them: a
  // certify/link changes no fact text, so every vector is a cache hit (no model
  // load, still offline); an index with no vectors stays fast rather than paying
  // a cold full embed on the curation hot path. A manual `artha build` refreshes.
  const embedder = deps.embedder && indexHasEmbeddings(deps.dbPath) ? deps.embedder : undefined;
  const report = await buildIndex(deps.repoRoot, deps.config, { dbPath: deps.dbPath, embedder });

  if (report.errors.length > 0) {
    // A failed build aborts before emitting, so the served index.db is untouched
    // and still matches the pre-write YAML - restoring just this file is enough.
    restoreFile(outcome.path, outcome.priorContent);
    return { ok: false, code: 422, error: `rebuild failed: ${report.errors.join('; ')}` };
  }
  return {
    ok: true,
    id: outcome.id,
    status: outcome.status,
    created: outcome.created,
    staled: report.staled,
  };
}

/** Put a file back to its pre-write state: restore prior content, or delete it if new. */
export function restoreFile(path: string, priorContent: string | null): void {
  if (priorContent === null) {
    if (existsSync(path)) unlinkSync(path);
  } else {
    writeFileSync(path, priorContent, 'utf8');
  }
}

// ── helpers ────────────────────────────────────────────────────────────────────

function findEntry(arthaDir: string, id: string): ArthaEntry | undefined {
  return loadEntries(arthaDir).entries.find((entry) => entry.id === id);
}

function readMaybe(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/** Drop the loader-only `source_path` so we validate/merge exactly what is written. */
function withoutSourcePath(entry: ArthaEntry): Record<string, unknown> {
  const { source_path, ...rest } = entry as ArthaEntry & { source_path?: string };
  void source_path;
  return rest;
}

function invalid(errors: Array<{ path: string; message: string }>): WriteErr {
  return { ok: false, code: 422, error: errors.map((e) => `${e.path}: ${e.message}`).join('; ') };
}

/** True when the served index already holds embedding vectors (pre-write check). */
function indexHasEmbeddings(dbPath: string): boolean {
  if (!existsSync(dbPath)) return false;
  let db: ReturnType<typeof openIndex> | undefined;
  try {
    db = openIndex(dbPath);
    return db.prepare('SELECT 1 FROM artha_embeddings LIMIT 1').get() !== undefined;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

function msg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
