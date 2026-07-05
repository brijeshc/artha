import type { ArthaConfig } from '../config/config';
import { cosineSimilarity } from '../embed/embedder';
import type { ArthaIndex } from '../mcp/query';
import { fileOf } from '../mcp/rank';
import { type SymbolHit, lexicalScore, repoStructure } from './symbols';

/**
 * Machine-proposed pin suggestions (T17b): the second half of the map's edges.
 * Structural edges (imports) are drawn automatically; *meaning* edges (pins)
 * stay machine-proposed, human-confirmed - this ranks the candidates so the
 * human's job collapses to naming meaning and confirming an edge with one
 * keystroke through the existing `POST /api/pin`. Nothing here writes anything.
 *
 * Every candidate comes from the same resolvable-symbol catalog the link picker
 * uses, so **each one is guaranteed to resolve as a pin** (the picker's
 * contract). Each carries a plain-language `why`, ranked so:
 *
 *   1. **reference proximity** - a symbol in a file one hop from already-pinned
 *      code (same file, or a file it imports / is imported by). For a flow with
 *      one pinned entry point, this is the fan-out: one human pin → N candidates.
 *   2. **lexical overlap** - the entry's name/summary tokens vs the symbol.
 *   3. **related meaning** - symbols pinned by *other* facts whose meaning is
 *      embedding-similar to this entry, read from the index's existing vectors
 *      (all cache hits; a vector-less index skips this - no model load here).
 *
 * Weights keep the tiers strict: any proximity hit outranks any lexical-only
 * hit, which outranks any embedding-only hit. Fully offline; no LLM.
 */

export type SuggestWhy = 'referenced by pinned code' | 'name match' | 'related meaning';

export interface Suggestion {
  /** The pin ref, guaranteed resolvable: `src/billing/Money.ts#Money`. */
  ref: string;
  name: string;
  path: string;
  kind: string;
  /** The strongest reason this was surfaced (the instrument explains itself). */
  why: SuggestWhy;
  score: number;
}

const W_PROXIMITY = 1000;
const W_LEXICAL = 10;
const W_EMBEDDING = 1;
/** Below this cosine, an "other fact" is unrelated noise, not related meaning. */
const RELATED_MIN_SIM = 0.4;
const DEFAULT_LIMIT = 8;

/**
 * Rank pin suggestions for one entry. Returns `[]` for an unknown id (cold-start
 * friendly). Reads the repo's structural scan (cached) and the index; no writes.
 */
export async function suggestPins(
  repoRoot: string,
  index: ArthaIndex,
  config: ArthaConfig,
  id: string,
  limit = DEFAULT_LIMIT,
): Promise<Suggestion[]> {
  const entry = index.facts.find((f) => f.id === id);
  if (!entry) return [];

  // Already-linked refs are excluded; their files anchor the proximity search.
  const pinnedRefs = new Set<string>();
  const pinnedFiles = new Set<string>();
  for (const p of index.pins) {
    if (p.fact_id !== id) continue;
    pinnedRefs.add(p.symbol_ref);
    pinnedFiles.add(fileOf(p.symbol_ref));
  }

  const { catalog, fileGraph } = await repoStructure(repoRoot, config);

  // Proximity anchors: each pinned file (same-file helpers) + its first-hop
  // import neighbours (the code it calls into, and the code that calls it).
  const nearFiles = new Set<string>(pinnedFiles);
  for (const f of pinnedFiles) {
    for (const n of fileGraph.importsOf.get(f) ?? []) nearFiles.add(n);
    for (const n of fileGraph.importedBy.get(f) ?? []) nearFiles.add(n);
  }

  const tokens = tokenize(`${entry.heading ?? ''} ${entry.body ?? ''}`);
  const relatedRefs = relatedMeaningRefs(index, id);

  const out: Suggestion[] = [];
  for (const hit of catalog) {
    if (pinnedRefs.has(hit.ref)) continue;
    // Suggest top-level units (a class/function/const), not class members: a pin
    // to `Money` covers the code; `Money.format` is a power-user precision the
    // picker still offers. This keeps suggestions high-signal, not a member dump.
    if (hit.name.includes('.')) continue;

    const proximity = nearFiles.has(hit.path) ? 1 : 0;
    const lexical = tokens.length > 0 ? lexicalMatch(hit, tokens) : 0;
    const embedding = relatedRefs.get(hit.ref) ?? 0;
    if (proximity === 0 && lexical === 0 && embedding === 0) continue;

    const score = proximity * W_PROXIMITY + lexical * W_LEXICAL + embedding * W_EMBEDDING;
    const why: SuggestWhy =
      proximity > 0 ? 'referenced by pinned code' : lexical > 0 ? 'name match' : 'related meaning';
    out.push({ ref: hit.ref, name: hit.name, path: hit.path, kind: hit.kind, why, score });
  }

  out.sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref));
  return out.slice(0, limit);
}

/** A symbol's best lexical affinity to any of the entry's tokens, in [0,1]. */
function lexicalMatch(hit: SymbolHit, tokens: string[]): number {
  let best = 0;
  for (const t of tokens) best = Math.max(best, lexicalScore(hit, t));
  return best / 100; // lexicalScore tops out at 100 (exact name)
}

/**
 * Refs pinned by *other* certified/proposed facts whose meaning is
 * embedding-similar to `id`, scored by that similarity - using only the vectors
 * already in the index (no embedding computed here → no model load). Empty when
 * the entry has no vector or the index carries none.
 */
function relatedMeaningRefs(index: ArthaIndex, id: string): Map<string, number> {
  const out = new Map<string, number>();
  const target = index.embeddings.get(id);
  if (!target || index.embeddings.size === 0) return out;

  const pinsByFact = new Map<string, string[]>();
  for (const p of index.pins) {
    const list = pinsByFact.get(p.fact_id);
    if (list) list.push(p.symbol_ref);
    else pinsByFact.set(p.fact_id, [p.symbol_ref]);
  }

  for (const fact of index.facts) {
    if (fact.id === id) continue;
    if (fact.status !== 'certified' && fact.status !== 'proposed') continue; // stale drifted
    const vec = index.embeddings.get(fact.id);
    if (!vec) continue;
    const sim = cosineSimilarity(target, vec);
    if (sim < RELATED_MIN_SIM) continue;
    for (const ref of pinsByFact.get(fact.id) ?? []) {
      out.set(ref, Math.max(out.get(ref) ?? 0, sim));
    }
  }
  return out;
}

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'this',
  'with',
  'from',
  'into',
  'its',
  'are',
  'has',
  'have',
  'was',
  'were',
  'will',
  'not',
  'but',
  'all',
  'any',
  'can',
  'use',
  'used',
  'when',
  'which',
  'their',
  'they',
  'them',
  'per',
]);

/** Salient lowercased tokens of an entry's name/summary (≥3 chars, no stopwords). */
function tokenize(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (raw.length >= 3 && !STOPWORDS.has(raw)) seen.add(raw);
  }
  return [...seen];
}
