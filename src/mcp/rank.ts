import type { FactRow, InferredRow } from '../build/db';
import { cosineSimilarity } from '../embed/embedder';
import type { ArthaIndex } from './query';

/** SPEC default context budget (~1.5k tokens; Product.md §9). */
export const DEFAULT_TOKEN_BUDGET = 1500;

/**
 * Minimum cosine for an embedding match to count (T14). Below this, the query and
 * fact are unrelated noise (in practice ~0.05 for unrelated vs ~0.5+ for a real
 * semantic match), so gating here keeps "everything is slightly similar" out of
 * the bundle while letting genuine synonym matches in.
 */
const EMBEDDING_MIN_SIM = 0.3;

export interface RankInput {
  /** Natural-language task text (drives the FTS lexical term). */
  task?: string;
  /** Symbols the task touches, `path#Symbol` (drives structural proximity). */
  symbols?: string[];
  /** Repo-relative files the task touches (drives structural proximity). */
  files?: string[];
  /** Include `proposed` drafts alongside `certified`. Default false. */
  includeProposed?: boolean;
  /**
   * Include the machine-described inferred layer (21b-3), ranked strictly below
   * all human facts and clearly labeled. Default true — the layer's whole point
   * is to give an agent useful context on a repo the team has not vouched yet
   * (D1: value before ask). Set false for a vouched-only bundle.
   */
  includeInferred?: boolean;
  /**
   * Query embedding for semantic ranking (T14), precomputed by the caller so
   * `rankFacts` stays sync. Must come from the **same model** that produced the
   * index vectors — the caller passes it only on a model match; absent → the
   * blend is lexical+structural exactly as in v0.1.
   */
  queryEmbedding?: ArrayLike<number>;
}

export interface RankedItem {
  fact: FactRow;
  /** This fact's pinned symbol refs. */
  pins: string[];
  /** This fact's expanded scope files. */
  scopeFiles: string[];
  score: number;
}

// certified outranks proposed at equal relevance; stale never reaches ranking.
const STATUS_WEIGHT: Record<string, number> = { certified: 1, proposed: 0.6 };

const STATUS_TAG: Record<string, string> = {
  certified: '[certified]',
  proposed: '[proposed — unreviewed draft]',
  stale: '[stale — pinned code changed]',
};

/** One machine-described fact (21b-3), ranked and formatted for the agent. Its own
 * type (not {@link RankedItem}) because an inferred fact has no human `status`,
 * `severity`, or `why` — only a worded confidence tier. */
export interface RankedInferredItem {
  fact: InferredRow;
  /** This fact's pinned symbol refs (the evidence it was read from). */
  pins: string[];
  score: number;
}

// Within the inferred tier, a downgraded (`uncertain`) fact ranks below a grounded
// one at equal relevance; the deterministic (`read-from-code`) and verified
// (`inferred`) tiers are equally trustworthy for retrieval.
const CONFIDENCE_WEIGHT: Record<string, number> = {
  'read-from-code': 1,
  inferred: 1,
  uncertain: 0.6,
};

/** The agent-facing label for a machine-described fact. Never "certified": the
 * team has not vouched it. `uncertain` (the verifier downgraded it) says so. */
export function inferredTag(confidence: string): string {
  return confidence === 'uncertain'
    ? '[machine-described, uncertain]'
    : '[machine-described, unverified by team]';
}

/**
 * Rank facts for a task by **lexical (FTS) + structural proximity + semantic
 * (embedding) similarity, weighted by status** (schema §8; T14). The three
 * relevance terms are added (not multiplied): a pure multiply would zero an item
 * that matches on only one signal, and each term must simply *not apply* when its
 * input is absent (no `symbols`/`files` → no structural; no `queryEmbedding`/
 * vectors → no semantic). Each term is normalized to its own max so they blend on
 * equal footing. `stale` is always excluded (untrusted); `proposed` is included
 * only when asked. Items with zero relevance are dropped.
 */
export function rankFacts(index: ArthaIndex, input: RankInput): RankedItem[] {
  const allowed = new Set(input.includeProposed ? ['certified', 'proposed'] : ['certified']);
  const candidates = index.facts.filter((fact) => allowed.has(fact.status));
  if (candidates.length === 0) return [];

  const pinsByFact = groupBy(index.pins, (pin) => pin.fact_id);
  const scopeByFact = groupBy(index.scopeFiles, (scope) => scope.fact_id);

  // Lexical: FTS bm25 (negative; higher -bm25 = better), normalized to (0, 1].
  const lexRaw = new Map<string, number>();
  if (input.task) {
    for (const [id, bm25] of index.fts(input.task)) lexRaw.set(id, -bm25);
  }
  const lexMax = Math.max(0, ...lexRaw.values());

  // Structural: count overlaps of pins/scope with the touched symbols/files.
  const touchedSymbols = new Set((input.symbols ?? []).map(normRef));
  const touchedFiles = new Set((input.files ?? []).map(normRef));
  const hasStructuralSignal = touchedSymbols.size > 0 || touchedFiles.size > 0;
  const structRaw = new Map<string, number>();
  if (hasStructuralSignal) {
    for (const fact of candidates) {
      let overlap = 0;
      for (const pin of pinsByFact.get(fact.id) ?? []) {
        const ref = normRef(pin.symbol_ref);
        if (touchedSymbols.has(ref)) overlap++;
        if (touchedFiles.has(fileOf(ref))) overlap++;
        if (pin.symbol_id != null && touchedSymbols.has(normRef(pin.symbol_id))) overlap++;
      }
      for (const scope of scopeByFact.get(fact.id) ?? []) {
        if (touchedFiles.has(normRef(scope.file_path))) overlap++;
      }
      if (overlap > 0) structRaw.set(fact.id, overlap);
    }
  }
  const structMax = Math.max(0, ...structRaw.values());

  // Semantic: cosine of the query vector against each fact vector, gated by a
  // min-similarity floor so unrelated facts contribute nothing. Normalized like
  // the other terms; absent query/vectors → this term is simply 0 (v0.1 fallback).
  const embRaw = new Map<string, number>();
  if (input.queryEmbedding && index.embeddings.size > 0) {
    for (const fact of candidates) {
      const vec = index.embeddings.get(fact.id);
      if (!vec) continue;
      const sim = cosineSimilarity(input.queryEmbedding, vec);
      if (sim >= EMBEDDING_MIN_SIM) embRaw.set(fact.id, sim);
    }
  }
  const embMax = Math.max(0, ...embRaw.values());

  const items: RankedItem[] = [];
  for (const fact of candidates) {
    const lexical = lexMax > 0 ? (lexRaw.get(fact.id) ?? 0) / lexMax : 0;
    const structural = structMax > 0 ? (structRaw.get(fact.id) ?? 0) / structMax : 0;
    const semantic = embMax > 0 ? (embRaw.get(fact.id) ?? 0) / embMax : 0;
    const relevance = lexical + structural + semantic;
    if (relevance <= 0) continue;
    items.push({
      fact,
      pins: (pinsByFact.get(fact.id) ?? []).map((pin) => pin.symbol_ref),
      scopeFiles: (scopeByFact.get(fact.id) ?? []).map((scope) => scope.file_path),
      score: relevance * (STATUS_WEIGHT[fact.status] ?? 0.5),
    });
  }

  items.sort(
    (a, b) =>
      b.score - a.score ||
      statusRank(a.fact.status) - statusRank(b.fact.status) ||
      a.fact.id.localeCompare(b.fact.id),
  );
  return items;
}

/**
 * Rank the **machine-described inferred layer** (21b-3) for a task by lexical
 * (its own FTS corpus) + structural proximity, weighted by confidence tier. There
 * is no semantic term — inferred facts are not embedded (T14 vectors cover human
 * facts only), so the term is simply absent, exactly as structural is when no
 * symbols/files are given. Items with zero relevance are dropped. The caller
 * (`contextBundle`) always seats these strictly below vouched facts in the budget.
 */
export function rankInferred(index: ArthaIndex, input: RankInput): RankedInferredItem[] {
  const candidates = index.inferred;
  if (candidates.length === 0) return [];

  const pinsByFact = groupBy(index.inferredPins, (pin) => pin.inferred_id);

  // Lexical: bm25 over the inferred-only FTS (normalized to (0, 1], like rankFacts).
  const lexRaw = new Map<string, number>();
  if (input.task) {
    for (const [id, bm25] of index.inferredFts(input.task)) lexRaw.set(id, -bm25);
  }
  const lexMax = Math.max(0, ...lexRaw.values());

  // Structural: overlap of the fact's evidence pins with the touched symbols/files.
  const touchedSymbols = new Set((input.symbols ?? []).map(normRef));
  const touchedFiles = new Set((input.files ?? []).map(normRef));
  const hasStructuralSignal = touchedSymbols.size > 0 || touchedFiles.size > 0;
  const structRaw = new Map<string, number>();
  if (hasStructuralSignal) {
    for (const fact of candidates) {
      let overlap = 0;
      for (const pin of pinsByFact.get(fact.id) ?? []) {
        const ref = normRef(pin.symbol_ref);
        if (touchedSymbols.has(ref)) overlap++;
        if (touchedFiles.has(fileOf(ref))) overlap++;
        if (pin.symbol_id != null && touchedSymbols.has(normRef(pin.symbol_id))) overlap++;
      }
      if (overlap > 0) structRaw.set(fact.id, overlap);
    }
  }
  const structMax = Math.max(0, ...structRaw.values());

  const items: RankedInferredItem[] = [];
  for (const fact of candidates) {
    const lexical = lexMax > 0 ? (lexRaw.get(fact.id) ?? 0) / lexMax : 0;
    const structural = structMax > 0 ? (structRaw.get(fact.id) ?? 0) / structMax : 0;
    const relevance = lexical + structural;
    if (relevance <= 0) continue;
    items.push({
      fact,
      pins: (pinsByFact.get(fact.id) ?? []).map((pin) => pin.symbol_ref),
      score: relevance * (CONFIDENCE_WEIGHT[fact.confidence] ?? 0.6),
    });
  }

  items.sort(
    (a, b) =>
      b.score - a.score ||
      confidenceRank(a.fact.confidence) - confidenceRank(b.fact.confidence) ||
      a.fact.id.localeCompare(b.fact.id),
  );
  return items;
}

export interface BudgetResult<T = RankedItem> {
  kept: T[];
  /** How many ranked items were dropped to fit the budget. */
  dropped: number;
  approxTokens: number;
}

/**
 * Greedily keep the highest-ranked items whose combined formatted size fits the
 * token budget, truncating from the lowest-ranked end. Always keeps at least the
 * top item (a single over-budget item is better than an empty bundle).
 */
export function selectWithinBudget(items: RankedItem[], budget: number): BudgetResult {
  return packWithinBudget(items, formatItem, budget, { forceFirst: true });
}

/**
 * Select machine-described facts (21b-3) into whatever budget the vouched facts
 * left over. `startTokens` is what those facts already spent, so inferred can only
 * fill the remainder — vouched context is never crowded out by the machine layer.
 * `forceFirst` keeps a single over-budget top item only when the bundle would
 * otherwise be empty, so a repo with nothing vouched still says something useful.
 */
export function selectInferredWithinBudget(
  items: RankedInferredItem[],
  budget: number,
  startTokens: number,
  forceFirst: boolean,
): BudgetResult<RankedInferredItem> {
  return packWithinBudget(items, formatInferredItem, budget, { startTokens, forceFirst });
}

const SEPARATOR_TOKENS = 2;

/**
 * The shared greedy packer behind both selectors: keep items in rank order while
 * `startTokens` (content already in the bundle) plus the running cost fits the
 * budget. A separator is charged before every item that follows earlier content —
 * whether that content was kept here or already counted in `startTokens`.
 */
function packWithinBudget<T>(
  items: T[],
  format: (item: T) => string,
  budget: number,
  opts: { startTokens?: number; forceFirst?: boolean },
): BudgetResult<T> {
  const startTokens = opts.startTokens ?? 0;
  const kept: T[] = [];
  let total = 0;
  for (const item of items) {
    const precededByContent = startTokens > 0 || kept.length > 0;
    const cost = estimateTokens(format(item)) + (precededByContent ? SEPARATOR_TOKENS : 0);
    const isFirstOverall = startTokens === 0 && kept.length === 0;
    if (!(opts.forceFirst && isFirstOverall) && startTokens + total + cost > budget) break;
    total += cost;
    kept.push(item);
  }
  return { kept, dropped: items.length - kept.length, approxTokens: total };
}

/** Approximate token count (~4 chars/token) — enough to enforce a budget. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Render one human fact as a compact, status-tagged block for the agent. */
export function formatItem(item: RankedItem): string {
  const { fact } = item;
  const tag = STATUS_TAG[fact.status] ?? `[${fact.status}]`;
  const lines = [itemHeader(tag, fact.id, fact.heading ?? '')];
  if (fact.body) lines.push(fact.body);
  if (fact.kind === 'invariant' && fact.severity) lines.push(`severity: ${fact.severity}`);
  if (item.pins.length > 0) lines.push(`pins: ${item.pins.join(', ')}`);
  return lines.join('\n');
}

/** Render one machine-described fact (21b-3) in the same block shape as a human
 * fact, but tagged so an agent can never mistake it for vouched context. */
export function formatInferredItem(item: RankedInferredItem): string {
  const { fact } = item;
  const lines = [itemHeader(inferredTag(fact.confidence), fact.id, fact.heading)];
  if (fact.body) lines.push(fact.body);
  if (item.pins.length > 0) lines.push(`pins: ${item.pins.join(', ')}`);
  return lines.join('\n');
}

/** The shared header line for a bundle item: `<tag> <id> — <heading>`. */
function itemHeader(tag: string, id: string, heading: string): string {
  return `${tag} ${id} — ${heading}`.trimEnd();
}

/** Sort key so certified < proposed < stale < anything else. */
export function statusRank(status: string): number {
  if (status === 'certified') return 0;
  if (status === 'proposed') return 1;
  if (status === 'stale') return 2;
  return 3;
}

/** Sort key within the inferred tier: grounded (`read-from-code`/`inferred`)
 * before a downgraded `uncertain` fact. */
export function confidenceRank(confidence: string): number {
  return confidence === 'uncertain' ? 1 : 0;
}

/** Normalize a symbol/file ref for comparison: forward slashes, trimmed. */
export function normRef(ref: string): string {
  return ref.replace(/\\/g, '/').trim();
}

/** The file part of a `path#Symbol` ref (or the whole thing if there is no `#`). */
export function fileOf(ref: string): string {
  const hash = ref.indexOf('#');
  return hash === -1 ? ref : ref.slice(0, hash);
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const bucket = map.get(k);
    if (bucket) bucket.push(row);
    else map.set(k, [row]);
  }
  return map;
}
