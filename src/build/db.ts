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
  notes         TEXT,
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
CREATE TABLE artha_refs (
  from_module  TEXT NOT NULL,
  to_module    TEXT NOT NULL,
  count        INTEGER NOT NULL
);
CREATE TABLE artha_inferred (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  module      TEXT,
  heading     TEXT NOT NULL,
  body        TEXT,
  confidence  TEXT NOT NULL,
  origin      TEXT NOT NULL DEFAULT 'inferred'
);
CREATE TABLE artha_inferred_pins (
  inferred_id   TEXT NOT NULL,
  symbol_ref    TEXT NOT NULL,
  symbol_id     TEXT,
  content_hash  TEXT,
  role          TEXT,
  ord           INTEGER NOT NULL
);
CREATE TABLE artha_inferred_states (
  inferred_id  TEXT NOT NULL,
  name         TEXT NOT NULL,
  ord          INTEGER NOT NULL
);
CREATE TABLE artha_inferred_steps (
  inferred_id  TEXT NOT NULL,
  label        TEXT NOT NULL,
  to_module    TEXT,
  note         TEXT,
  ord          INTEGER NOT NULL
);
CREATE VIRTUAL TABLE artha_fts USING fts5(id UNINDEXED, heading, body);
`;

export interface FactRow {
  id: string;
  kind: string;
  status: string;
  heading: string | null;
  body: string | null;
  /** Human-authored delta (D6): "what the code can't say"; null until written. */
  notes: string | null;
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

/** One directed module→module import edge (T17b). `count` = how many imports
 * back it. Structural (mined from code), never a claim about meaning. */
export interface RefRow {
  from_module: string;
  to_module: string;
  count: number;
}

/**
 * One inferred fact (21a): a machine-described unit of code meaning that lights
 * the map before any human input. `origin='inferred'` and `confidence` place it
 * on the trust ladder *below* vouched facts; it is a regenerable cache (never
 * committed) that re-derives on every build. `kind` is `module` (a module card)
 * or `concept` (a state-machine candidate). Materializing on human touch (vouch/
 * edit) turns it into a normal `.artha/` YAML fact - these rows never do.
 */
export interface InferredRow {
  id: string;
  kind: string;
  /** The module this fact belongs to, for atlas grouping; null if repo-wide. */
  module: string | null;
  /** Readable, product-leaning name (deterministically humanized in 21a). */
  heading: string;
  /** A plain-language description; the FTS body. */
  body: string | null;
  /** Worded confidence tier slug: `read-from-code` (21a) · `inferred` · `uncertain`. */
  confidence: string;
  /** Trust-ladder marker; always `inferred` for these rows. */
  origin: string;
}

/** Evidence pin backing an inferred fact (21a) - the code it was read from.
 * `role` is the "why" (`export` · `evidence` · `entry`); every claim cites pins. */
export interface InferredPinRow {
  inferred_id: string;
  symbol_ref: string;
  symbol_id: string | null;
  content_hash: string | null;
  role: string | null;
  ord: number;
}

/** One state read literally from code for an inferred state-machine candidate
 * (21a). Effects/invariants/transitions are the human delta, never emitted here. */
export interface InferredStateRow {
  inferred_id: string;
  name: string;
  ord: number;
}

/** One step of an inferred flow skeleton (21a): a downstream area the entry
 * point fans out to, read from its file's imports (file-level; symbol-level call
 * order stays out of scope). `to_module` links the step to its module tile; the
 * event/action prose is the human delta (D6), never emitted here. */
export interface InferredStepRow {
  inferred_id: string;
  label: string;
  to_module: string | null;
  /** Synthesized description of what the flow does at this module (21b-2);
   * null until `artha infer` fills it, and reverts to null on drift. */
  note: string | null;
  ord: number;
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
  refs: RefRow[];
  inferred: InferredRow[];
  inferredPins: InferredPinRow[];
  inferredStates: InferredStateRow[];
  inferredSteps: InferredStepRow[];
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
        (id, kind, status, heading, body, notes, severity, why, supersedes, certified_by, certified_at, source_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const fts = db.prepare('INSERT INTO artha_fts (id, heading, body) VALUES (?, ?, ?)');
    for (const r of data.facts) {
      fact.run(
        r.id,
        r.kind,
        r.status,
        r.heading,
        r.body,
        r.notes,
        r.severity,
        r.why,
        r.supersedes,
        r.certified_by,
        r.certified_at,
        r.source_path,
      );
      // Fold the human delta into the FTS body (not the `body` column) so search
      // finds "that warning about the gateway" while the retrieval prose stays pure.
      fts.run(r.id, r.heading ?? '', [r.body, r.notes].filter(Boolean).join('\n'));
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

    const ref = db.prepare(
      'INSERT INTO artha_refs (from_module, to_module, count) VALUES (?, ?, ?)',
    );
    for (const r of data.refs) ref.run(r.from_module, r.to_module, r.count);

    const inferred = db.prepare(
      `INSERT INTO artha_inferred (id, kind, module, heading, body, confidence, origin)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const r of data.inferred) {
      inferred.run(r.id, r.kind, r.module, r.heading, r.body, r.confidence, r.origin);
    }

    const inferredPin = db.prepare(
      `INSERT INTO artha_inferred_pins (inferred_id, symbol_ref, symbol_id, content_hash, role, ord)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const r of data.inferredPins) {
      inferredPin.run(r.inferred_id, r.symbol_ref, r.symbol_id, r.content_hash, r.role, r.ord);
    }

    const inferredState = db.prepare(
      'INSERT INTO artha_inferred_states (inferred_id, name, ord) VALUES (?, ?, ?)',
    );
    for (const r of data.inferredStates) inferredState.run(r.inferred_id, r.name, r.ord);

    const inferredStep = db.prepare(
      'INSERT INTO artha_inferred_steps (inferred_id, label, to_module, note, ord) VALUES (?, ?, ?, ?, ?)',
    );
    for (const r of data.inferredSteps) {
      inferredStep.run(r.inferred_id, r.label, r.to_module, r.note ?? null, r.ord);
    }

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
