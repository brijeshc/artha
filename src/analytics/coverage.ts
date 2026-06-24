import type { ArthaConfig } from '../config/config';
import type { ArthaIndex } from '../mcp/query';
import { type ChurnOptions, moduleChurn } from './churn';
import { moduleOf } from './module';

/** Per-module tally of the meaning attached to it. */
export interface ModuleCoverage {
  /** Distinct `certified` facts whose pins/scope resolve into the module. */
  certified: number;
  /** Distinct `stale` facts touching the module (drifted meaning). */
  stale: number;
}

/** A module ranked for the dark-zone queue, with its scoring inputs exposed
 * (the UI shows *why* a module is dark — its churn/coverage/freshness). */
export interface RankedModule {
  module: string;
  /** Health score (§"scoreModule"); **lower = darker**. */
  score: number;
  /** Commits touching the module in the churn window. */
  churn: number;
  /** Coverage term ∈ [0,1): graded, saturating in certified-fact count. */
  coverage: number;
  /** Freshness term ∈ [0,1]: fraction of the module's meaning that isn't stale. */
  freshness: number;
  certifiedFacts: number;
  staleFacts: number;
}

/**
 * Per-module coverage from the built index: for every `certified`/`stale` fact,
 * the modules its pins (symbol file) and scope files resolve into, counted once
 * per fact per module. Pure over the index — no git, no disk.
 */
export function moduleCoverage(
  index: ArthaIndex,
  sourceRoots: string[],
): Map<string, ModuleCoverage> {
  const status = new Map(index.facts.map((f) => [f.id, f.status]));

  // fact id → the set of modules it touches (pins + scope), deduped.
  const modulesByFact = new Map<string, Set<string>>();
  const touch = (factId: string, file: string): void => {
    const mod = moduleOf(file, sourceRoots);
    if (!mod) return;
    let set = modulesByFact.get(factId);
    if (!set) {
      set = new Set();
      modulesByFact.set(factId, set);
    }
    set.add(mod);
  };

  for (const pin of index.pins) touch(pin.fact_id, pin.symbol_ref.split('#')[0] ?? '');
  for (const scope of index.scopeFiles) touch(scope.fact_id, scope.file_path);

  const coverage = new Map<string, ModuleCoverage>();
  const bump = (mod: string, key: keyof ModuleCoverage): void => {
    const c = coverage.get(mod) ?? { certified: 0, stale: 0 };
    c[key] += 1;
    coverage.set(mod, c);
  };

  for (const [factId, modules] of modulesByFact) {
    const s = status.get(factId);
    if (s !== 'certified' && s !== 'stale') continue; // proposed drafts don't count as meaning
    for (const mod of modules) bump(mod, s === 'certified' ? 'certified' : 'stale');
  }

  return coverage;
}

/**
 * The dark-zone **health score** (OQ4, developer-owned 2026-06-24). Isolated in
 * this one function so the formula is swappable without touching the ranking.
 *
 *   score = coverage × freshness × inverse(churn),   lower = darker
 *
 * - `coverage` and `freshness` come from {@link moduleCoverage} (∈ [0,1]).
 * - `inverse(churn) = 1 / (1 + churn)` ∈ (0,1] — heavier churn pulls the score
 *   down. A module with zero certified meaning has coverage 0 → score 0 (the
 *   darkest), so the queue surfaces "churns a lot, explained by nobody" first;
 *   {@link darkZones} breaks score ties by churn so high-churn dark zones lead.
 */
export function scoreModule(inputs: {
  churn: number;
  coverage: number;
  freshness: number;
}): number {
  const inverseChurn = 1 / (1 + Math.max(0, inputs.churn));
  return inputs.coverage * inputs.freshness * inverseChurn;
}

/** Graded, saturating coverage term (OQ4): 0 facts → 0, 1 → 0.5, n → n/(n+1). */
function coverageTerm(certified: number): number {
  return certified / (certified + 1);
}

/** Freshness term: fraction of the module's meaning that is not stale (1 when none). */
function freshnessTerm(certified: number, stale: number): number {
  const total = certified + stale;
  return total === 0 ? 1 : certified / total;
}

export interface DarkZoneOptions extends ChurnOptions {}

/**
 * The ranked dark-zone queue (SPEC-v0.2 §C) — the source T15 serves and T18
 * consumes. Combines git churn with index coverage per module and sorts so the
 * **darkest (high-churn, no/▒stale-meaning) modules come first**.
 *
 * The module universe is `churn ∪ coverage`: actively-churning code (even if
 * unexplained) and any module that already carries meaning. Sort is ascending
 * by score, then **descending by churn** (so among equally-dark modules the
 * busiest leads), then by name — fully deterministic.
 *
 * Cold start (empty index) → every churned module returns with score 0; that's
 * the intended "nobody has explained this" signal, not an error.
 */
export function darkZones(
  repoRoot: string,
  index: ArthaIndex,
  config: ArthaConfig,
  options: DarkZoneOptions = {},
): RankedModule[] {
  const { sourceRoots } = config;
  const churn = moduleChurn(repoRoot, sourceRoots, options);
  const coverage = moduleCoverage(index, sourceRoots);

  const modules = new Set<string>([...churn.keys(), ...coverage.keys()]);
  const ranked: RankedModule[] = [];
  for (const mod of modules) {
    const cov = coverage.get(mod) ?? { certified: 0, stale: 0 };
    const churnN = churn.get(mod) ?? 0;
    const coverageVal = coverageTerm(cov.certified);
    const freshnessVal = freshnessTerm(cov.certified, cov.stale);
    ranked.push({
      module: mod,
      score: scoreModule({ churn: churnN, coverage: coverageVal, freshness: freshnessVal }),
      churn: churnN,
      coverage: coverageVal,
      freshness: freshnessVal,
      certifiedFacts: cov.certified,
      staleFacts: cov.stale,
    });
  }

  ranked.sort((a, b) => a.score - b.score || b.churn - a.churn || a.module.localeCompare(b.module));
  return ranked;
}
