import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { InferredPinRow } from '../build/db';
import type { SynthStepText, SynthTransition } from './inferrer';

/**
 * The synthesis cache (`.artha/.inferred.json`): what `artha infer` produced,
 * so `artha build` can overlay it without re-spending and a re-`infer` skips
 * unchanged candidates (the incremental, steady-state-free requirement).
 *
 * It is a **regenerable cache, keyed by content** - each entry records the
 * `evidenceHash` of the exact pinned code the description was read from. When
 * `build` re-derives the 21a layer, it overlays an entry only if that hash
 * still matches; drifted code silently falls back to the deterministic 21a text
 * (D12 - moonlight regenerates quietly, nothing to maintain) until the next
 * `infer`. Unlike the index it survives a rebuild, so it lives on disk beside
 * `.artha/` and, being expensive to regenerate (real spend), is worth committing
 * for the team - an ordinary git diff, like the mined ledger.
 *
 * Read to never break: a missing or mangled file costs a re-infer, not the
 * build - it reads as an empty cache and the layer stays deterministic.
 */

/** One cached synthesis: the enrichment + the content it was verified against. */
export interface SynthCacheEntry {
  /** Hash of the pinned code the description was read from; the drift key. */
  evidenceHash: string;
  /** Synthesized product-language name (21b). */
  name: string;
  /** Synthesized 2-3 sentence summary (21b). */
  summary: string;
  /** Per-step descriptions for a flow (21b-2); empty for other kinds. */
  steps: SynthStepText[];
  /** Grounded transitions for a concept (21b-2); empty for other kinds. */
  transitions: SynthTransition[];
  /** Verified confidence tier: `inferred` or `uncertain` (verify.ts). */
  confidence: string;
}

/** The cache, keyed by inferred fact id. */
export type SynthCache = Map<string, SynthCacheEntry>;

const CACHE_FILE = '.inferred.json';
// v3 (21b-2): entries gained concept transitions (v2 added per-step text). A
// schema change invalidates the cache - old entries re-infer rather than serve a
// shape the reader expects more from.
const CACHE_VERSION = 3;

function cachePath(arthaDir: string): string {
  return join(arthaDir, CACHE_FILE);
}

/**
 * Read the synthesis cache. A missing, unreadable, malformed, or wrong-version
 * file yields an empty cache rather than throwing - the layer stays honest
 * (deterministic 21a) and the next `infer` refills it.
 */
export function readSynthCache(arthaDir: string): SynthCache {
  const path = cachePath(arthaDir);
  if (!existsSync(path)) return new Map();
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return parseCache(raw);
  } catch {
    return new Map();
  }
}

/** Defensive parse: keep only well-formed entries; anything off yields empty. */
function parseCache(raw: unknown): SynthCache {
  if (typeof raw !== 'object' || raw === null) return new Map();
  const obj = raw as { version?: unknown; entries?: unknown };
  if (obj.version !== CACHE_VERSION) return new Map();
  if (typeof obj.entries !== 'object' || obj.entries === null) return new Map();

  const cache: SynthCache = new Map();
  for (const [id, value] of Object.entries(obj.entries as Record<string, unknown>)) {
    const e = value as Record<string, unknown>;
    if (
      typeof e.evidenceHash === 'string' &&
      typeof e.name === 'string' &&
      typeof e.summary === 'string' &&
      typeof e.confidence === 'string'
    ) {
      cache.set(id, {
        evidenceHash: e.evidenceHash,
        name: e.name,
        summary: e.summary,
        steps: parseSteps(e.steps),
        transitions: parseTransitions(e.transitions),
        confidence: e.confidence,
      });
    }
  }
  return cache;
}

/** Read cached per-step text defensively: keep only entries with a real module + text. */
function parseSteps(value: unknown): SynthStepText[] {
  if (!Array.isArray(value)) return [];
  const steps: SynthStepText[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const s = item as Record<string, unknown>;
    if (typeof s.module === 'string' && typeof s.text === 'string') {
      steps.push({ module: s.module, text: s.text });
    }
  }
  return steps;
}

/** Read cached transitions defensively: keep only entries with all three strings. */
function parseTransitions(value: unknown): SynthTransition[] {
  if (!Array.isArray(value)) return [];
  const transitions: SynthTransition[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const t = item as Record<string, unknown>;
    if (typeof t.from === 'string' && typeof t.to === 'string' && typeof t.trigger === 'string') {
      transitions.push({ from: t.from, to: t.to, trigger: t.trigger });
    }
  }
  return transitions;
}

/**
 * Write the synthesis cache, sorted by id so a re-run over unchanged candidates
 * produces a byte-identical file (a reviewable, diff-stable git artifact). An
 * empty cache is written as an empty entries map, not deleted, so a deliberate
 * "nothing synthesized" state is visible rather than looking un-run.
 */
export function writeSynthCache(arthaDir: string, cache: SynthCache): void {
  const path = cachePath(arthaDir);
  mkdirSync(dirname(path), { recursive: true });
  const entries: Record<string, SynthCacheEntry> = {};
  for (const id of [...cache.keys()].sort()) {
    entries[id] = cache.get(id) as SynthCacheEntry;
  }
  writeFileSync(path, `${JSON.stringify({ version: CACHE_VERSION, entries }, null, 2)}\n`, 'utf8');
}

/**
 * The evidence hash for one inferred fact: a stable digest of the content hashes
 * of the pins it was read from. Two builds agree iff every pinned symbol's
 * source is unchanged - the exact condition under which a cached description is
 * still trustworthy. An unresolvable pin contributes a `?` marker, so a
 * fact that loses its evidence re-hashes and re-infers rather than reusing a
 * description read from code that no longer resolves.
 */
export function evidenceHash(pins: Pick<InferredPinRow, 'content_hash' | 'symbol_ref'>[]): string {
  const parts = pins.map((p) => `${p.symbol_ref}@${p.content_hash ?? '?'}`).sort();
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 12);
}
