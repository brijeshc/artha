import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type FactRow, type IndexData, writeIndex } from '../../src/build/db';
import { embedFacts, readEmbedCache } from '../../src/build/embeddings';
import { fakeEmbedder } from '../helpers/fakeEmbedder';
import { fact } from '../helpers/fakeIndex';

let dir: string;
let dbPath: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'artha-emb-'));
  dbPath = join(dir, 'index.db');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const A = fact('decision.a', 'certified', { heading: 'Alpha', body: 'one' });
const B = fact('decision.b', 'certified', { heading: 'Beta', body: 'two' });
const C = fact('decision.c', 'certified', { heading: 'Gamma', body: 'three' });
const VECTORS = { 'Alpha\none': [1, 0], 'Beta\ntwo': [0, 1], 'Gamma\nthree': [1, 1] };

function indexData(facts: FactRow[], embeddings: IndexData['embeddings']): IndexData {
  return {
    facts,
    pins: [],
    scopeFiles: [],
    related: [],
    provenance: [],
    detect: [],
    states: [],
    transitions: [],
    flowSteps: [],
    embeddings,
    refs: [],
    inferred: [],
    inferredPins: [],
    inferredStates: [],
    inferredSteps: [],
    inferredTransitions: [],
  };
}

describe('embedFacts', () => {
  it('embeds every fact and tags each row with the model id', async () => {
    const emb = fakeEmbedder(VECTORS, { modelId: 'm1', dim: 2 });
    const report = { warnings: [] as string[] };

    const rows = await embedFacts([A, B], emb, new Map(), report);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.model === 'm1' && r.dim === 2)).toBe(true);
    expect(emb.lastTexts.sort()).toEqual(['Alpha\none', 'Beta\ntwo']);
    expect(report.warnings).toEqual([]);
  });

  it('reuses cached vectors for unchanged facts, embedding only the new ones', async () => {
    const emb = fakeEmbedder(VECTORS, { modelId: 'm1', dim: 2 });
    const report = { warnings: [] as string[] };

    // build an index with A,B embedded, then read it back as the cache
    const seed = await embedFacts([A, B], emb, new Map(), report);
    writeIndex(dbPath, indexData([A, B], seed));
    const cache = readEmbedCache(dbPath);
    expect(cache.size).toBe(2);

    const emb2 = fakeEmbedder(VECTORS, { modelId: 'm1', dim: 2 });
    const rows = await embedFacts([A, B, C], emb2, cache, report);
    expect(rows).toHaveLength(3);
    expect(emb2.lastTexts).toEqual(['Gamma\nthree']); // A,B from cache → only C embedded
  });

  it('re-embeds (does not mix) when the model id changes', async () => {
    const emb = fakeEmbedder(VECTORS, { modelId: 'm1', dim: 2 });
    const report = { warnings: [] as string[] };
    const seed = await embedFacts([A, B], emb, new Map(), report);
    writeIndex(dbPath, indexData([A, B], seed));
    const cache = readEmbedCache(dbPath); // keyed under m1

    const emb2 = fakeEmbedder(VECTORS, { modelId: 'm2', dim: 2 });
    const rows = await embedFacts([A, B], emb2, cache, report);
    expect(emb2.lastTexts.sort()).toEqual(['Alpha\none', 'Beta\ntwo']); // m1 cache ≠ m2 → all re-embed
    expect(rows.every((r) => r.model === 'm2')).toBe(true);
  });

  it('is best-effort: on embedder failure it keeps cache hits and warns, never throws', async () => {
    const ok = fakeEmbedder(VECTORS, { modelId: 'm1', dim: 2 });
    const report = { warnings: [] as string[] };
    const seed = await embedFacts([A, B], ok, new Map(), report);
    writeIndex(dbPath, indexData([A, B], seed));
    const cache = readEmbedCache(dbPath);

    const bad = fakeEmbedder({}, { modelId: 'm1', dim: 2, throws: true });
    const rows = await embedFacts([A, B, C], bad, cache, report); // C is new → embedder called → throws
    expect(rows.map((r) => r.fact_id).sort()).toEqual(['decision.a', 'decision.b']); // cache hits kept
    expect(report.warnings).toHaveLength(1);
  });
});

describe('readEmbedCache', () => {
  it('returns an empty cache for a missing index (cold start), no throw', () => {
    expect(readEmbedCache(join(dir, 'nope.db')).size).toBe(0);
  });
});
