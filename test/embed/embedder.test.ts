import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config/config';
import {
  blobToVector,
  cosineSimilarity,
  embedQuery,
  embedQueryForIndex,
  getEmbedder,
  vectorToBlob,
} from '../../src/embed/embedder';
import { fakeEmbedder } from '../helpers/fakeEmbedder';

describe('cosineSimilarity', () => {
  it('is 1 for identical, 0 for orthogonal, negative for opposite', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });
  it('is 0 for a zero vector (no divide-by-zero)', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('vectorToBlob / blobToVector', () => {
  it('round-trips a vector through the Float32 BLOB', () => {
    const v = [0.5, -0.25, 1.5, 0];
    const back = Array.from(blobToVector(vectorToBlob(v)));
    expect(back).toEqual(v);
  });
});

describe('embedQuery', () => {
  it('returns the vector for non-empty text', async () => {
    const e = fakeEmbedder({ hello: [1, 2, 3] });
    expect(await embedQuery(e, 'hello')).toEqual([1, 2, 3]);
  });
  it('returns undefined for a blank query or a null embedder', async () => {
    expect(await embedQuery(fakeEmbedder({}), '   ')).toBeUndefined();
    expect(await embedQuery(null, 'hello')).toBeUndefined();
  });
  it('never throws — a failing embedder yields undefined (lexical fallback)', async () => {
    const e = fakeEmbedder({}, { throws: true });
    expect(await embedQuery(e, 'hello')).toBeUndefined();
  });
});

describe('embedQueryForIndex (model matching)', () => {
  const e = fakeEmbedder({ q: [1, 0, 0] }, { modelId: 'model-A' });

  it('embeds only when the query model matches the index model', async () => {
    expect(await embedQueryForIndex(e, 'model-A', 'q')).toEqual([1, 0, 0]);
  });
  it('returns undefined on a model mismatch (never mixes vectors)', async () => {
    expect(await embedQueryForIndex(e, 'model-B', 'q')).toBeUndefined();
    expect(e.calls).toBe(1); // only the matching call actually embedded
  });
  it('returns undefined when the index has no vectors or there is no embedder', async () => {
    expect(await embedQueryForIndex(e, null, 'q')).toBeUndefined();
    expect(await embedQueryForIndex(null, 'model-A', 'q')).toBeUndefined();
  });
});

describe('getEmbedder', () => {
  it('returns null when embeddings are disabled', () => {
    const config = { ...defaultConfig(), embeddings: { enabled: false, model: 'x' } };
    expect(getEmbedder(config)).toBeNull();
  });
  it('returns a local embedder tagged with the configured model', () => {
    const config = {
      ...defaultConfig(),
      embeddings: { enabled: true, model: 'Xenova/all-MiniLM-L6-v2' },
    };
    expect(getEmbedder(config)?.modelId).toBe('Xenova/all-MiniLM-L6-v2');
  });
});
