import { existsSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { type FactRow, type PinRow, type ScopeRow, openIndex } from '../build/db';

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
  /** True when there is no index file or it holds no facts (cold start). */
  readonly empty: boolean;
  /** FTS5 MATCH over heading+body → `fact id → bm25` (lower = better). Empty on blank/invalid query. */
  fts(query: string): Map<string, number>;
  close(): void;
}

const EMPTY: ArthaIndex = {
  facts: [],
  pins: [],
  scopeFiles: [],
  empty: true,
  fts: () => new Map(),
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
    const handle = db;
    return {
      facts,
      pins,
      scopeFiles,
      empty: facts.length === 0,
      fts: (query) => runFts(handle, query),
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

function runFts(db: DatabaseSync, raw: string): Map<string, number> {
  const match = toFtsQuery(raw);
  if (match === '') return new Map();
  try {
    const rows = db
      .prepare(
        'SELECT id, bm25(artha_fts) AS score FROM artha_fts WHERE artha_fts MATCH ? ORDER BY score',
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
 */
export function toFtsQuery(text: string): string {
  const tokens = (text.toLowerCase().match(/[a-z0-9_]+/g) ?? []).filter((t) => t.length >= 2);
  if (tokens.length === 0) return '';
  return [...new Set(tokens)].map((t) => `"${t}"`).join(' OR ');
}
