import { existsSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import {
  type FactRow,
  type FlowStepRow,
  type InferredPinRow,
  type InferredRow,
  type InferredStateRow,
  type InferredStepRow,
  type InferredTransitionRow,
  type PinRow,
  type RefRow,
  type RelatedRow,
  type ScopeRow,
  type StateRow,
  type TransitionRow,
  openIndex,
} from '../build/db';

/**
 * Read-only view over a built `.artha/index.db` (schema-v0.1 §8). The rows are
 * read eagerly (the index is team-scale — hundreds of entries, not millions) so
 * ranking can run in memory; `fts()` stays lazy because it needs the open db.
 *
 * Shared read layer: the MCP server (T08) ranks over it; export (T09) reuses the
 * same row shapes. Only ever issues `SELECT`s — it never mutates the index.
 */
export interface ArthaIndex {
  readonly facts: FactRow[];
  readonly pins: PinRow[];
  readonly scopeFiles: ScopeRow[];
  /** Concept state-machine nodes (T12). Empty for v0.1-only / pre-T12 indexes. */
  readonly states: StateRow[];
  /** Concept state-machine edges (T12). */
  readonly transitions: TransitionRow[];
  /** Flow ordered steps (T12). */
  readonly flowSteps: FlowStepRow[];
  /** `related` cross-links between entries. */
  readonly related: RelatedRow[];
  /** Module→module import edges (T17b). Empty for pre-T17b indexes. */
  readonly refs: RefRow[];
  /** Machine-described facts (21a) - module cards + state-machine candidates.
   * Empty for pre-21a indexes. Below vouched facts on the trust ladder. */
  readonly inferred: InferredRow[];
  /** Evidence pins backing inferred facts (21a). */
  readonly inferredPins: InferredPinRow[];
  /** States read from code for inferred state-machine candidates (21a). */
  readonly inferredStates: InferredStateRow[];
  /** Ordered fan-out steps for inferred flow skeletons (21a). */
  readonly inferredSteps: InferredStepRow[];
  /** Grounded transitions for inferred state-machine candidates (21b-2). Empty
   * until `artha infer` grounds them; reverts on drift. */
  readonly inferredTransitions: InferredTransitionRow[];
  /** Fact id → embedding vector (T14). Empty for pre-T14 / no-embedding indexes. */
  readonly embeddings: Map<string, Float32Array>;
  /** The model that produced the vectors, for query-side model matching; null if none. */
  readonly embeddingModel: string | null;
  /** True when there is no index file or it holds no facts (cold start). */
  readonly empty: boolean;
  /** FTS5 MATCH over human facts' heading+body → `fact id → bm25` (lower = better). Empty on blank/invalid query. */
  fts(query: string): Map<string, number>;
  /** FTS5 MATCH over the inferred layer's heading+body (21b-3), a separate corpus
   * from {@link fts} so the machine layer never perturbs human bm25. Empty on a
   * blank/invalid query or a pre-21b-3 index (no table). */
  inferredFts(query: string): Map<string, number>;
  close(): void;
}

const EMPTY: ArthaIndex = {
  facts: [],
  pins: [],
  scopeFiles: [],
  states: [],
  transitions: [],
  flowSteps: [],
  related: [],
  refs: [],
  inferred: [],
  inferredPins: [],
  inferredStates: [],
  inferredSteps: [],
  inferredTransitions: [],
  embeddings: new Map(),
  embeddingModel: null,
  empty: true,
  fts: () => new Map(),
  inferredFts: () => new Map(),
  close: () => {},
};

/**
 * Open the index at `dbPath` for reading. A missing file, or a present-but-
 * unreadable/cold index (no tables yet), yields an **empty** index rather than
 * an error — the cold-start contract (SPEC: empty bundles, not failures).
 */
export function openArthaIndex(dbPath: string): ArthaIndex {
  if (!existsSync(dbPath)) return EMPTY;

  let db: DatabaseSync | undefined;
  try {
    db = openIndex(dbPath);
    const facts = db.prepare('SELECT * FROM artha_facts').all() as unknown as FactRow[];
    const pins = db.prepare('SELECT * FROM artha_pins').all() as unknown as PinRow[];
    const scopeFiles = db.prepare('SELECT * FROM artha_scope_files').all() as unknown as ScopeRow[];
    // The v0.2 product-model tables (T12). Loaded defensively so an older index
    // (built before these tables existed) still yields its facts/pins/scope.
    const states = selectAll<StateRow>(db, 'artha_states');
    const transitions = selectAll<TransitionRow>(db, 'artha_transitions');
    const flowSteps = selectAll<FlowStepRow>(db, 'artha_flow_steps');
    const related = selectAll<RelatedRow>(db, 'artha_related');
    const refs = selectAll<RefRow>(db, 'artha_refs');
    const inferred = selectAll<InferredRow>(db, 'artha_inferred');
    const inferredPins = selectAll<InferredPinRow>(db, 'artha_inferred_pins');
    const inferredStates = selectAll<InferredStateRow>(db, 'artha_inferred_states');
    const inferredSteps = selectAll<InferredStepRow>(db, 'artha_inferred_steps');
    const inferredTransitions = selectAll<InferredTransitionRow>(db, 'artha_inferred_transitions');
    const { embeddings, embeddingModel } = loadEmbeddings(db);
    const handle = db;
    return {
      facts,
      pins,
      scopeFiles,
      states,
      transitions,
      flowSteps,
      related,
      refs,
      inferred,
      inferredPins,
      inferredStates,
      inferredSteps,
      inferredTransitions,
      embeddings,
      embeddingModel,
      empty: facts.length === 0,
      fts: (query) => runFts(handle, query, 'artha_fts'),
      inferredFts: (query) => runFts(handle, query, 'artha_inferred_fts'),
      close: () => {
        try {
          handle.close();
        } catch {
          /* already closed */
        }
      },
    };
  } catch {
    if (db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
    return EMPTY;
  }
}

/** `SELECT *` from a table that may not exist in an older index → `[]` if absent. */
function selectAll<T>(db: DatabaseSync, table: string): T[] {
  try {
    return db.prepare(`SELECT * FROM ${table}`).all() as unknown as T[];
  } catch {
    return [];
  }
}

/** Load fact vectors (T14) → `id → Float32Array` + the model that made them.
 * Defensive: a pre-T14 index (no table) yields an empty map + null model. */
function loadEmbeddings(db: DatabaseSync): {
  embeddings: Map<string, Float32Array>;
  embeddingModel: string | null;
} {
  const embeddings = new Map<string, Float32Array>();
  let embeddingModel: string | null = null;
  try {
    const rows = db
      .prepare('SELECT fact_id, model, vector FROM artha_embeddings')
      .all() as unknown as Array<{
      fact_id: string;
      model: string;
      vector: Uint8Array;
    }>;
    for (const r of rows) {
      embeddingModel ??= r.model;
      const bytes = Uint8Array.from(r.vector);
      embeddings.set(
        r.fact_id,
        new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4),
      );
    }
  } catch {
    /* pre-T14 index → no embeddings */
  }
  return { embeddings, embeddingModel };
}

/** Run the sanitized FTS query against one FTS5 table (`table` is a fixed literal
 * from the caller, never user input). A pre-21b-3 index lacks `artha_inferred_fts`;
 * the catch turns that (and any malformed MATCH) into an empty result, never a crash. */
function runFts(db: DatabaseSync, raw: string, table: string): Map<string, number> {
  const match = toFtsQuery(raw);
  if (match === '') return new Map();
  try {
    const rows = db
      .prepare(
        `SELECT id, bm25(${table}) AS score FROM ${table} WHERE ${table} MATCH ? ORDER BY score`,
      )
      .all(match) as unknown as Array<{ id: string; score: number }>;
    return new Map(rows.map((row) => [row.id, row.score]));
  } catch {
    // A malformed MATCH (despite sanitization) must never crash a tool call.
    return new Map();
  }
}

/**
 * Turn free task text into a safe FTS5 query: alphanumeric tokens (≥2 chars),
 * each quoted so FTS operators in the prose can't break the query, OR-joined.
 * The final token also prefix-matches (24d): a dashboard search for "ref" must
 * already find "Refund a purchase" mid-word, and for a full task sentence the
 * trailing word matching its own inflections ("flow"* → flows) only helps.
 */
export function toFtsQuery(text: string): string {
  const tokens = (text.toLowerCase().match(/[a-z0-9_]+/g) ?? []).filter((t) => t.length >= 2);
  if (tokens.length === 0) return '';
  const last = tokens[tokens.length - 1];
  return [...new Set(tokens)].map((t) => (t === last ? `"${t}"*` : `"${t}"`)).join(' OR ');
}
