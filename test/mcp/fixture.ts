import { type FactRow, type IndexData, writeIndex } from '../../src/build/db';

function fact(row: Partial<FactRow> & Pick<FactRow, 'id' | 'kind' | 'status'>): FactRow {
  return {
    heading: null,
    body: null,
    notes: null,
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
  refs: [],
  inferred: [],
  inferredPins: [],
  inferredStates: [],
  inferredSteps: [],
  inferredTransitions: [],
};

/**
 * The machine-described inferred layer (21b-3) over the same money/cents code:
 * one grounded module card and one downgraded (`uncertain`) concept, both
 * lexically matching "money" and pinned into src/money.ts.
 */
export const INFERRED_FIXTURE: Pick<IndexData, 'inferred' | 'inferredPins'> = {
  inferred: [
    {
      id: 'inferred:module:src/money',
      kind: 'module',
      module: 'src/money',
      heading: 'Money',
      body: 'Shared foundation for money and cents handling across the app.',
      confidence: 'read-from-code',
      origin: 'inferred',
    },
    {
      id: 'inferred:concept:src/money.ts#Rounding',
      kind: 'concept',
      module: 'src/money',
      heading: 'Rounding mode',
      body: 'A rounding mode read from the money module.',
      confidence: 'uncertain',
      origin: 'inferred',
    },
  ],
  inferredPins: [
    {
      inferred_id: 'inferred:module:src/money',
      symbol_ref: 'src/money.ts#toCents',
      symbol_id: 'src/money.ts#toCents',
      content_hash: 'h',
      role: 'export',
      ord: 0,
    },
    {
      inferred_id: 'inferred:concept:src/money.ts#Rounding',
      symbol_ref: 'src/money.ts#Rounding',
      symbol_id: null,
      content_hash: 'h',
      role: 'evidence',
      ord: 0,
    },
  ],
};

export function writeFixtureIndex(dbPath: string): void {
  writeIndex(dbPath, FIXTURE);
}

/** The full fixture plus the inferred layer (21b-3). */
export function writeFixtureIndexWithInferred(dbPath: string): void {
  writeIndex(dbPath, { ...FIXTURE, ...INFERRED_FIXTURE });
}

/** Inferred layer only, no vouched facts — a repo the team has not touched (D1). */
export function writeInferredOnlyIndex(dbPath: string): void {
  writeIndex(dbPath, { ...FIXTURE, facts: [], pins: [], scopeFiles: [], ...INFERRED_FIXTURE });
}
