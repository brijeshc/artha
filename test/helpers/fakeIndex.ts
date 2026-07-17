import type {
  FactRow,
  FlowStepRow,
  InferredPinRow,
  InferredRow,
  InferredStateRow,
  InferredStepRow,
  PinRow,
  RefRow,
  RelatedRow,
  ScopeRow,
  StateRow,
  TransitionRow,
} from '../../src/build/db';
import type { ArthaIndex } from '../../src/mcp/query';

/** A `FactRow` with sensible nulls; override only what a test cares about. */
export function fact(id: string, status: string, over: Partial<FactRow> = {}): FactRow {
  return {
    id,
    kind: id.split('.')[0] ?? 'decision',
    status,
    heading: null,
    body: null,
    notes: null,
    severity: null,
    why: null,
    supersedes: null,
    certified_by: null,
    certified_at: null,
    source_path: null,
    ...over,
  };
}

export function pin(fact_id: string, symbol_ref: string, over: Partial<PinRow> = {}): PinRow {
  return { fact_id, symbol_id: symbol_ref, symbol_ref, content_hash: 'h', is_stale: 0, ...over };
}

/** An `InferredRow` (21a/21b) with sensible defaults; override what a test cares about. */
export function inferredFact(
  id: string,
  confidence: string,
  over: Partial<InferredRow> = {},
): InferredRow {
  return {
    id,
    kind: 'module',
    module: null,
    heading: id,
    body: null,
    confidence,
    origin: 'inferred',
    ...over,
  };
}

export function inferredPin(
  inferred_id: string,
  symbol_ref: string,
  over: Partial<InferredPinRow> = {},
): InferredPinRow {
  return {
    inferred_id,
    symbol_ref,
    symbol_id: symbol_ref,
    content_hash: 'h',
    role: 'evidence',
    ord: 0,
    ...over,
  };
}

/** An in-memory `ArthaIndex` for testing the read layer without a real db. */
export function fakeIndex(parts: {
  facts?: FactRow[];
  pins?: PinRow[];
  scopeFiles?: ScopeRow[];
  states?: StateRow[];
  transitions?: TransitionRow[];
  flowSteps?: FlowStepRow[];
  related?: RelatedRow[];
  refs?: RefRow[];
  inferred?: InferredRow[];
  inferredPins?: InferredPinRow[];
  inferredStates?: InferredStateRow[];
  inferredSteps?: InferredStepRow[];
  embeddings?: Map<string, Float32Array>;
  embeddingModel?: string | null;
  fts?: (q: string) => Map<string, number>;
  inferredFts?: (q: string) => Map<string, number>;
}): ArthaIndex {
  const facts = parts.facts ?? [];
  const embeddings = parts.embeddings ?? new Map();
  return {
    facts,
    pins: parts.pins ?? [],
    scopeFiles: parts.scopeFiles ?? [],
    states: parts.states ?? [],
    transitions: parts.transitions ?? [],
    flowSteps: parts.flowSteps ?? [],
    related: parts.related ?? [],
    refs: parts.refs ?? [],
    inferred: parts.inferred ?? [],
    inferredPins: parts.inferredPins ?? [],
    inferredStates: parts.inferredStates ?? [],
    inferredSteps: parts.inferredSteps ?? [],
    embeddings,
    embeddingModel: parts.embeddingModel ?? (embeddings.size > 0 ? 'fake-model' : null),
    empty: facts.length === 0,
    fts: parts.fts ?? (() => new Map()),
    inferredFts: parts.inferredFts ?? (() => new Map()),
    close: () => {},
  };
}
