import type { Embedder } from '../../src/embed/embedder';

export interface FakeEmbedder extends Embedder {
  /** How many times `embed()` was invoked (batches count once). */
  calls: number;
  /** The texts passed to the most recent `embed()` call. */
  lastTexts: string[];
}

/**
 * Deterministic embedder for tests: maps each text to a fixed vector (default
 * zero vector for unknown text). Records calls so a test can prove the build
 * cache avoided re-embedding. Optionally throws to exercise the graceful path.
 */
export function fakeEmbedder(
  vectors: Record<string, number[]>,
  opts: { modelId?: string; dim?: number; throws?: boolean } = {},
): FakeEmbedder {
  const dim = opts.dim ?? 3;
  const self: FakeEmbedder = {
    modelId: opts.modelId ?? 'fake-model',
    dimensions: dim,
    calls: 0,
    lastTexts: [],
    async embed(texts: string[]): Promise<number[][]> {
      self.calls++;
      self.lastTexts = texts;
      if (opts.throws) throw new Error('embedder unavailable');
      return texts.map((t) => vectors[t] ?? new Array(dim).fill(0));
    },
  };
  return self;
}
