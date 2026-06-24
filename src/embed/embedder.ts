import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ArthaConfig } from '../config/config';
import { logger } from '../util/logger';

/**
 * The seam between text and a vector. Build embeds each fact's heading+body;
 * retrieval embeds the query. The interface keeps the choice swappable (OQ3) and
 * the index records `modelId` so a model change re-embeds rather than mixing
 * vectors. The v0.2 default is a **local on-device** model (offline build *and*
 * query — the only way query-time embedding stays offline).
 */
export interface Embedder {
  /** Stable id stored beside vectors; a change invalidates them. */
  readonly modelId: string;
  /** Vector length, for sanity checks. */
  readonly dimensions: number;
  /** Embed each text → a unit-normalized vector. Batched. */
  embed(texts: string[]): Promise<number[][]>;
}

const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';
const DEFAULT_DIM = 384;

/**
 * On-device embedder via transformers.js (WASM/ONNX, like the existing
 * web-tree-sitter dep). The model (~23 MB, quantized) downloads once to a stable
 * per-user cache and then runs fully offline — no API key, no text egress. The
 * library is loaded lazily (dynamic import) so the offline CLI paths that never
 * embed don't pull it in.
 */
export function createLocalEmbedder(modelId: string = DEFAULT_MODEL): Embedder {
  // biome-ignore lint/suspicious/noExplicitAny: transformers.js ships no types we depend on.
  let pipe: Promise<any> | undefined;

  const load = (): Promise<unknown> => {
    if (!pipe) {
      pipe = (async () => {
        const { pipeline, env } = await import('@xenova/transformers');
        // A stable cache that survives `npm ci` (the default lives in node_modules).
        env.cacheDir =
          process.env.ARTHA_MODEL_CACHE ?? join(homedir(), '.cache', 'artha', 'transformers');
        env.allowRemoteModels = true;
        return pipeline('feature-extraction', modelId);
      })();
    }
    return pipe;
  };

  return {
    modelId,
    dimensions: DEFAULT_DIM,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      // biome-ignore lint/suspicious/noExplicitAny: dynamic transformers.js pipeline.
      const extractor = (await load()) as any;
      const out = await extractor(texts, { pooling: 'mean', normalize: true });
      return out.tolist() as number[][];
    },
  };
}

/**
 * The embedder for the CLI's build/retrieval paths, per config. Returns `null`
 * when embeddings are disabled (`embeddings.enabled: false`) so callers fall back
 * to lexical+structural ranking with no embedding work.
 */
export function getEmbedder(config: ArthaConfig): Embedder | null {
  if (config.embeddings?.enabled === false) return null;
  return createLocalEmbedder(config.embeddings?.model ?? DEFAULT_MODEL);
}

/**
 * Embed one query string, best-effort and **never throwing**: any failure (model
 * can't load, offline first run) logs and returns `undefined` so retrieval
 * degrades to lexical+structural rather than erroring. Keeps query-time robust.
 */
export async function embedQuery(
  embedder: Embedder | null | undefined,
  text: string,
): Promise<number[] | undefined> {
  if (!embedder || text.trim() === '') return undefined;
  try {
    const [vector] = await embedder.embed([text]);
    return vector;
  } catch (error) {
    logger.debug(`query embedding skipped (${(error as Error).message}); using lexical+structural`);
    return undefined;
  }
}

/**
 * Embed a query for retrieval **only when its model matches the index's vectors**
 * (`indexModel`). A mismatch (or no vectors) returns `undefined` so we never
 * compare vectors from two different models — the caller then ranks on
 * lexical+structural alone. Best-effort and non-throwing (see {@link embedQuery}).
 */
export function embedQueryForIndex(
  embedder: Embedder | null | undefined,
  indexModel: string | null,
  text: string,
): Promise<number[] | undefined> {
  if (!embedder || indexModel === null || embedder.modelId !== indexModel) {
    return Promise.resolve(undefined);
  }
  return embedQuery(embedder, text);
}

/** Cosine similarity of two equal-length vectors; 0 if either is a zero vector. */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Pack a vector into a compact little-endian Float32 BLOB for the index. */
export function vectorToBlob(vector: number[]): Uint8Array {
  return new Uint8Array(Float32Array.from(vector).buffer);
}

/** Unpack a Float32 BLOB back into a vector view (zero-copy where aligned). */
export function blobToVector(blob: Uint8Array): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}
