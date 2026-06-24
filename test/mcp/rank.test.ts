import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ArthaIndex, openArthaIndex } from '../../src/mcp/query';
import { estimateTokens, formatItem, rankFacts, selectWithinBudget } from '../../src/mcp/rank';
import { fact, fakeIndex } from '../helpers/fakeIndex';
import { writeFixtureIndex } from './fixture';

let dir: string;
let index: ArthaIndex;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'artha-rank-'));
  const dbPath = join(dir, '.artha', 'index.db');
  writeFixtureIndex(dbPath);
  index = openArthaIndex(dbPath);
});

afterEach(() => {
  index.close();
  rmSync(dir, { recursive: true, force: true });
});

const ids = (items: ReturnType<typeof rankFacts>) => items.map((i) => i.fact.id);

describe('rankFacts — status gating', () => {
  it('task-only ranks on FTS × status, certified-only, stale excluded', () => {
    const result = rankFacts(index, { task: 'money cents' });
    const got = ids(result);
    expect(got).toContain('decision.money');
    expect(got).toContain('invariant.no_float_money');
    expect(got).not.toContain('decision.draft'); // proposed, not requested
    expect(got).not.toContain('decision.old'); // stale, always excluded
    expect(got[0]).toBe('decision.money'); // "cents" hit outranks money-only
  });

  it('include_proposed surfaces proposed drafts too (still no stale)', () => {
    const got = ids(rankFacts(index, { task: 'money', includeProposed: true }));
    expect(got).toContain('decision.draft');
    expect(got).not.toContain('decision.old');
  });

  it('never returns stale entries even on a direct lexical hit', () => {
    const got = ids(rankFacts(index, { task: 'legacy float historically', includeProposed: true }));
    expect(got).not.toContain('decision.old');
  });
});

describe('rankFacts — structural proximity', () => {
  it('ranks on pin overlap when the task text matches nothing lexically', () => {
    const result = rankFacts(index, { task: 'zzznomatch', symbols: ['src/money.ts#toCents'] });
    expect(ids(result)).toEqual(['decision.money']); // only certified fact pinned to toCents
    expect(result[0]?.score).toBeGreaterThan(0);
  });

  it('ranks on file overlap via pins and scope_files', () => {
    const got = ids(rankFacts(index, { task: 'zzznomatch', files: ['src/money.ts'] }));
    expect(got).toContain('decision.money'); // pin file
    expect(got).toContain('invariant.no_float_money'); // pin file + scope file
    expect(got).not.toContain('decision.dates'); // touches src/time.ts only
  });
});

describe('selectWithinBudget', () => {
  it('keeps the top item under a tiny budget and drops the rest', () => {
    const ranked = rankFacts(index, { task: 'money cents' });
    expect(ranked.length).toBeGreaterThan(1);
    const { kept, dropped } = selectWithinBudget(ranked, 3);
    expect(kept.length).toBe(1);
    expect(dropped).toBe(ranked.length - 1);
  });

  it('keeps everything under a generous budget', () => {
    const ranked = rankFacts(index, { task: 'money cents' });
    const { kept, dropped } = selectWithinBudget(ranked, 100_000);
    expect(kept.length).toBe(ranked.length);
    expect(dropped).toBe(0);
  });
});

describe('formatItem / estimateTokens', () => {
  it('tags status and lists pins', () => {
    const [top] = rankFacts(index, { task: 'money cents' });
    if (top === undefined) throw new Error('expected a ranked item');
    const text = formatItem(top);
    expect(text.startsWith('[certified]')).toBe(true);
    expect(text).toContain('pins: src/money.ts#toCents');
  });

  it('labels proposed drafts and shows invariant severity', () => {
    const proposed = rankFacts(index, { task: 'money', includeProposed: true }).find(
      (i) => i.fact.id === 'decision.draft',
    );
    const invariant = rankFacts(index, { task: 'money' }).find(
      (i) => i.fact.id === 'invariant.no_float_money',
    );
    expect(proposed && formatItem(proposed)).toContain('proposed');
    expect(invariant && formatItem(invariant)).toContain('severity: high');
  });

  it('estimates ~4 chars per token', () => {
    expect(estimateTokens('12345678')).toBe(2);
  });
});

describe('rankFacts — semantic (embedding) blend', () => {
  const qVec = [1, 0, 0]; // the embedded query "money back to the customer"
  const semanticIndex = fakeIndex({
    facts: [
      fact('decision.refund', 'certified', { heading: 'Refund a payment', body: '' }),
      fact('decision.auth', 'certified', { heading: 'Login authentication', body: '' }),
    ],
    embeddings: new Map([
      ['decision.refund', Float32Array.from([0.9, 0.1, 0])], // ~parallel to qVec → high cosine
      ['decision.auth', Float32Array.from([0, 0, 1])], // orthogonal → below the floor
    ]),
    embeddingModel: 'fake',
    fts: () => new Map(), // the synonym query shares no keywords → no lexical signal
  });

  it('the lexical baseline finds nothing for a synonym query (no shared keywords)', () => {
    expect(rankFacts(semanticIndex, { task: 'money back to the customer' })).toEqual([]);
  });

  it('embeddings surface the semantic match the lexical baseline missed', () => {
    const got = ids(
      rankFacts(semanticIndex, { task: 'money back to the customer', queryEmbedding: qVec }),
    );
    expect(got).toEqual(['decision.refund']); // auth is below the similarity floor → excluded
  });

  it('falls back to lexical+structural when the index has no vectors', () => {
    const noVecs = fakeIndex({
      facts: [fact('decision.refund', 'certified', { heading: 'Refund', body: '' })],
      fts: (q) => (q.includes('refund') ? new Map([['decision.refund', -1]]) : new Map()),
    });
    // queryEmbedding present but no fact vectors → embedding term is 0, lexical still ranks
    expect(ids(rankFacts(noVecs, { task: 'refund', queryEmbedding: qVec }))).toEqual([
      'decision.refund',
    ]);
  });
});
