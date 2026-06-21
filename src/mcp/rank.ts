import type { FactRow } from '../build/db';
import type { ArthaIndex } from './query';

/** SPEC default context budget (~1.5k tokens; Product.md §9). */
export const DEFAULT_TOKEN_BUDGET = 1500;

export interface RankInput {
  /** Natural-language task text (drives the FTS lexical term). */
  task?: string;
  /** Symbols the task touches, `path#Symbol` (drives structural proximity). */
  symbols?: string[];
  /** Repo-relative files the task touches (drives structural proximity). */
  files?: string[];
  /** Include `proposed` drafts alongside `certified`. Default false. */
  includeProposed?: boolean;
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

/**
 * Rank facts for a task by **lexical (FTS) + structural proximity, weighted by
 * status** (schema §8). The two relevance terms are added (not multiplied): a
 * pure multiply would zero an item that matches lexically but not structurally,
 * and the SPEC requires structural proximity to simply *not apply* when no
 * `symbols`/`files` are given. `stale` is always excluded (untrusted); `proposed`
 * is included only when asked. Items with zero relevance are dropped.
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

  const items: RankedItem[] = [];
  for (const fact of candidates) {
    const lexical = lexMax > 0 ? (lexRaw.get(fact.id) ?? 0) / lexMax : 0;
    const structural = structMax > 0 ? (structRaw.get(fact.id) ?? 0) / structMax : 0;
    const relevance = lexical + structural;
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

export interface BudgetResult {
  kept: RankedItem[];
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
  const kept: RankedItem[] = [];
  let total = 0;
  for (const item of items) {
    const cost = estimateTokens(formatItem(item)) + (kept.length > 0 ? SEPARATOR_TOKENS : 0);
    if (kept.length > 0 && total + cost > budget) break;
    total += cost;
    kept.push(item);
  }
  return { kept, dropped: items.length - kept.length, approxTokens: total };
}

const SEPARATOR_TOKENS = 2;

/** Approximate token count (~4 chars/token) — enough to enforce a budget. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Render one item as a compact, status-tagged block for the agent. */
export function formatItem(item: RankedItem): string {
  const { fact } = item;
  const tag = STATUS_TAG[fact.status] ?? `[${fact.status}]`;
  const lines = [`${tag} ${fact.id} — ${fact.heading ?? ''}`.trimEnd()];
  if (fact.body) lines.push(fact.body);
  if (fact.kind === 'invariant' && fact.severity) lines.push(`severity: ${fact.severity}`);
  if (item.pins.length > 0) lines.push(`pins: ${item.pins.join(', ')}`);
  return lines.join('\n');
}

/** Sort key so certified < proposed < stale < anything else. */
export function statusRank(status: string): number {
  if (status === 'certified') return 0;
  if (status === 'proposed') return 1;
  if (status === 'stale') return 2;
  return 3;
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
