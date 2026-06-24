import { type FactRow, type IndexData, writeIndex } from '../../src/build/db';

function fact(row: Partial<FactRow> & Pick<FactRow, 'id' | 'kind' | 'status'>): FactRow {
  return {
    heading: null,
    body: null,
    severity: null,
    why: null,
    supersedes: null,
    certified_by: null,
    certified_at: null,
    source_path: `.artha/${row.kind}s/${row.id}.yaml`,
    ...row,
  };
}

/**
 * A small but representative index covering every ranking dimension:
 * certified / proposed / stale, FTS hits, pin overlap, scope overlap, and an
 * invariant whose `why` cross-links to a decision.
 */
export const FIXTURE: IndexData = {
  facts: [
    fact({
      id: 'decision.money',
      kind: 'decision',
      status: 'certified',
      heading: 'Store money as integer minor units',
      body: 'Represent money as integer cents everywhere to avoid floating point drift.',
      certified_by: 'Ada',
      certified_at: '2026-06-01',
    }),
    fact({
      id: 'invariant.no_float_money',
      kind: 'invariant',
      status: 'certified',
      heading: 'No floating point for money',
      body: 'Money values must never be represented as a float.',
      severity: 'high',
      why: 'decision.money',
      certified_by: 'Ada',
      certified_at: '2026-06-02',
    }),
    fact({
      id: 'decision.draft',
      kind: 'decision',
      status: 'proposed',
      heading: 'Adopt a decimal money library',
      body: 'Consider using a decimal library for money arithmetic.',
    }),
    fact({
      id: 'decision.old',
      kind: 'decision',
      status: 'stale',
      heading: 'Legacy money handling',
      body: 'Historically money was stored as a float value.',
      certified_by: 'Bob',
      certified_at: '2025-01-01',
    }),
    fact({
      id: 'decision.dates',
      kind: 'decision',
      status: 'certified',
      heading: 'Use UTC for all timestamps',
      body: 'Store and compute timestamps in UTC.',
      certified_by: 'Ada',
      certified_at: '2026-06-03',
    }),
  ],
  pins: [
    {
      fact_id: 'decision.money',
      symbol_id: 'src/money.ts#toCents',
      symbol_ref: 'src/money.ts#toCents',
      content_hash: 'h1',
      is_stale: 0,
    },
    {
      fact_id: 'invariant.no_float_money',
      symbol_id: 'src/money.ts#round',
      symbol_ref: 'src/money.ts#round',
      content_hash: 'h2',
      is_stale: 0,
    },
    {
      fact_id: 'decision.draft',
      symbol_id: null,
      symbol_ref: 'src/money.ts#toCents',
      content_hash: null,
      is_stale: 0,
    },
    {
      fact_id: 'decision.old',
      symbol_id: null,
      symbol_ref: 'src/money.ts#toCents',
      content_hash: null,
      is_stale: 1,
    },
    {
      fact_id: 'decision.dates',
      symbol_id: 'src/time.ts#nowUtc',
      symbol_ref: 'src/time.ts#nowUtc',
      content_hash: 'h3',
      is_stale: 0,
    },
  ],
  scopeFiles: [{ fact_id: 'invariant.no_float_money', file_path: 'src/money.ts' }],
  related: [],
  provenance: [],
  detect: [],
  states: [],
  transitions: [],
  flowSteps: [],
  embeddings: [],
};

export function writeFixtureIndex(dbPath: string): void {
  writeIndex(dbPath, FIXTURE);
}
