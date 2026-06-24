import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type * as SqliteModule from 'node:sqlite';

// `node:sqlite` is a Node builtin, but newer than some bundlers' builtin lists
// (Vite/vitest strips the `node:` prefix and fails to resolve `sqlite`). Load it
// via createRequire so the module resolver never tries to transform it; esbuild
// (dist) handles the native import fine. The type import above is erased.
const { DatabaseSync: Database } = createRequire(import.meta.url)(
  'node:sqlite',
) as typeof SqliteModule;

/**
 * The compiled index schema — schema-v0.1.md §8, the read contract T08 (MCP)
 * and T09 (export) query. Kept as a string constant (rather than a separate
 * `.sql` asset) so it bundles cleanly with no loader config.
 */
export const SCHEMA_SQL = `
CREATE TABLE artha_facts (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,
  status        TEXT NOT NULL,
  heading       TEXT,
  body          TEXT,
  severity      TEXT,
  why           TEXT,
  supersedes    TEXT,
  certified_by  TEXT,
  certified_at  TEXT,
  source_path   TEXT
);
CREATE TABLE artha_pins (
  fact_id       TEXT NOT NULL,
  symbol_id     TEXT,
  symbol_ref    TEXT NOT NULL,
  content_hash  TEXT,
  is_stale      INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE artha_scope_files (
  fact_id       TEXT NOT NULL,
  file_path     TEXT NOT NULL
);
CREATE TABLE artha_related (
  fact_id       TEXT NOT NULL,
  related_id    TEXT NOT NULL
);
CREATE TABLE artha_provenance (
  fact_id       TEXT NOT NULL,
  ref_kind      TEXT NOT NULL,
  ref           TEXT NOT NULL
);
CREATE TABLE artha_detect (
  fact_id       TEXT NOT NULL,
  method        TEXT NOT NULL,
  spec          TEXT NOT NULL
);
CREATE TABLE artha_states (
  fact_id       TEXT NOT NULL,
  name          TEXT NOT NULL,
  effect        TEXT,
  invariant     TEXT,
  ord           INTEGER NOT NULL
);
CREATE TABLE artha_transitions (
  fact_id       TEXT NOT NULL,
  from_state    TEXT NOT NULL,
  to_state      TEXT NOT NULL,
  trigger       TEXT NOT NULL,
  ord           INTEGER NOT NULL
);
CREATE TABLE artha_flow_steps (
  fact_id         TEXT NOT NULL,
  on_event        TEXT,
  do_action       TEXT NOT NULL,
  pin_symbol_ref  TEXT,
  ord             INTEGER NOT NULL
);
CREATE TABLE artha_embeddings (
  fact_id  TEXT NOT NULL,
  model    TEXT NOT NULL,
  dim      INTEGER NOT NULL,
  vector   BLOB NOT NULL
);
CREATE VIRTUAL TABLE artha_fts USING fts5(id UNINDEXED, heading, body);
`;

export interface FactRow {
  id: string;
  kind: string;
  status: string;
  heading: string | null;
  body: string | null;
  severity: string | null;
  why: string | null;
  supersedes: string | null;
  certified_by: string | null;
  certified_at: string | null;
  source_path: string | null;
}

export interface PinRow {
  fact_id: string;
  symbol_id: string | null;
  symbol_ref: string;
  content_hash: string | null;
  is_stale: number;
}

export interface ScopeRow {
  fact_id: string;
  file_path: string;
}

export interface RelatedRow {
  fact_id: string;
  related_id: string;
}

export interface ProvenanceRow {
  fact_id: string;
  ref_kind: string;
  ref: string;
}

export interface DetectRow {
  fact_id: string;
  method: string;
  spec: string;
}

/** A concept's state-machine node (schema-v0.2.md §3/§6). `ord` preserves authoring order. */
export interface StateRow {
  fact_id: string;
  name: string;
  effect: string | null;
  invariant: string | null;
  ord: number;
}

/** A concept's state-machine edge (schema-v0.2.md §3/§6). */
export interface TransitionRow {
  fact_id: string;
  from_state: string;
  to_state: string;
  trigger: string;
  ord: number;
}

/** One ordered step of a flow (schema-v0.2.md §4/§6). `pin_symbol_ref` is null
 * for a not-yet-linked step (the v0.3 coverage signal). */
export interface FlowStepRow {
  fact_id: string;
  on_event: string | null;
  do_action: string;
  pin_symbol_ref: string | null;
  ord: number;
}

/** One fact's embedding vector (T14). `model` tags which embedder produced it
 * so a model change re-embeds rather than mixing vectors. */
export interface EmbeddingRow {
  fact_id: string;
  model: string;
  dim: number;
  vector: Uint8Array;
}

export interface IndexData {
  facts: FactRow[];
  pins: PinRow[];
  scopeFiles: ScopeRow[];
  related: RelatedRow[];
  provenance: ProvenanceRow[];
  detect: DetectRow[];
  states: StateRow[];
  transitions: TransitionRow[];
  flowSteps: FlowStepRow[];
  embeddings: EmbeddingRow[];
}

/** Emit a fresh `.artha/index.db` from scratch (idempotent: same input → same rows). */
export function writeIndex(dbPath: string, data: IndexData): void {
  // Rebuild from a clean slate so removed entries never linger.
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix);
  }
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  try {
    db.exec(SCHEMA_SQL);
    db.exec('BEGIN');

    const fact = db.prepare(
      `INSERT INTO artha_facts
        (id, kind, status, heading, body, severity, why, supersedes, certified_by, certified_at, source_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const fts = db.prepare('INSERT INTO artha_fts (id, heading, body) VALUES (?, ?, ?)');
    for (const r of data.facts) {
      fact.run(
        r.id,
        r.kind,
        r.status,
        r.heading,
        r.body,
        r.severity,
        r.why,
        r.supersedes,
        r.certified_by,
        r.certified_at,
        r.source_path,
      );
      fts.run(r.id, r.heading ?? '', r.body ?? '');
    }

    const pin = db.prepare(
      'INSERT INTO artha_pins (fact_id, symbol_id, symbol_ref, content_hash, is_stale) VALUES (?, ?, ?, ?, ?)',
    );
    for (const r of data.pins) {
      pin.run(r.fact_id, r.symbol_id, r.symbol_ref, r.content_hash, r.is_stale);
    }

    const scope = db.prepare('INSERT INTO artha_scope_files (fact_id, file_path) VALUES (?, ?)');
    for (const r of data.scopeFiles) scope.run(r.fact_id, r.file_path);

    const related = db.prepare('INSERT INTO artha_related (fact_id, related_id) VALUES (?, ?)');
    for (const r of data.related) related.run(r.fact_id, r.related_id);

    const prov = db.prepare(
      'INSERT INTO artha_provenance (fact_id, ref_kind, ref) VALUES (?, ?, ?)',
    );
    for (const r of data.provenance) prov.run(r.fact_id, r.ref_kind, r.ref);

    const detect = db.prepare('INSERT INTO artha_detect (fact_id, method, spec) VALUES (?, ?, ?)');
    for (const r of data.detect) detect.run(r.fact_id, r.method, r.spec);

    const state = db.prepare(
      'INSERT INTO artha_states (fact_id, name, effect, invariant, ord) VALUES (?, ?, ?, ?, ?)',
    );
    for (const r of data.states) state.run(r.fact_id, r.name, r.effect, r.invariant, r.ord);

    const transition = db.prepare(
      'INSERT INTO artha_transitions (fact_id, from_state, to_state, trigger, ord) VALUES (?, ?, ?, ?, ?)',
    );
    for (const r of data.transitions) {
      transition.run(r.fact_id, r.from_state, r.to_state, r.trigger, r.ord);
    }

    const flowStep = db.prepare(
      'INSERT INTO artha_flow_steps (fact_id, on_event, do_action, pin_symbol_ref, ord) VALUES (?, ?, ?, ?, ?)',
    );
    for (const r of data.flowSteps) {
      flowStep.run(r.fact_id, r.on_event, r.do_action, r.pin_symbol_ref, r.ord);
    }

    const embedding = db.prepare(
      'INSERT INTO artha_embeddings (fact_id, model, dim, vector) VALUES (?, ?, ?, ?)',
    );
    for (const r of data.embeddings) embedding.run(r.fact_id, r.model, r.dim, r.vector);

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}

/** Open an existing index for reading (used by the MCP server, export, and tests). */
export function openIndex(dbPath: string): SqliteModule.DatabaseSync {
  return new Database(dbPath);
}
