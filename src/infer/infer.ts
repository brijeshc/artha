import { join } from 'node:path';
import { type InferredLayer, inferLayer } from '../analytics/inferred';
import { listSourceFiles, referenceGraph } from '../analytics/references';
import { collectPins } from '../build/build';
import type { InferredPinRow, InferredRow, InferredStateRow, InferredStepRow } from '../build/db';
import type { ArthaConfig } from '../config/config';
import type { SymbolResolver } from '../resolver/SymbolResolver';
import { createTreeSitterResolver } from '../resolver/treeSitterResolver';
import { loadEntries } from '../schema/load';
import { evidenceFor } from '../serve/evidence';
import { logger } from '../util/logger';
import { type SynthCache, evidenceHash, readSynthCache, writeSynthCache } from './cache';
import { createInferrer } from './engine';
import type {
  EvidenceExcerpt,
  Inferrer,
  SynthStep,
  SynthStepText,
  SynthTransition,
} from './inferrer';
import { UNCERTAIN, verifySynthesis } from './verify';

export interface InferOptions {
  /** Max candidates sent to the synthesizer this run (the spend cap). 0 = unlimited. */
  maxFacts?: number;
  /** Preview what would be synthesized without any engine call or credentials. */
  dryRun?: boolean;
  /** Injected synthesizer - defaults to the configured engine. Tests pass a stub. */
  inferrer?: Inferrer;
}

export interface InferReport {
  /** Total 21a candidates in the repo. */
  candidates: number;
  /** Candidates served unchanged from the cache (zero spend). */
  reused: number;
  /** Candidates enriched this run (verified `inferred` or downgraded `uncertain`). */
  synthesized: { id: string; confidence: string }[];
  /** Candidates the synthesizer declined to enrich (kept their 21a text). */
  declined: number;
  /** Of `synthesized`, how many the verifier downgraded to `uncertain`. */
  downgraded: number;
  /** Candidates left un-synthesized because the spend cap was hit. */
  remaining: number;
}

/** Default spend cap: how many candidates a single `infer` will synthesize. */
const DEFAULT_MAX_FACTS = 50;

/**
 * `artha infer` (21b): enrich the deterministic 21a inferred layer into readable
 * meaning, opt-in and spend-capped. Pipeline: re-derive the same 21a candidates
 * `build` does -> for each, reuse an unchanged cached synthesis (content-hash
 * keyed, zero spend) or send it to the synthesizer up to the cap -> verify each
 * claim against its pinned code (downgrading the ungrounded to `uncertain`) ->
 * write the cache `build` overlays. A failed or absent engine leaves the 21a
 * output untouched; viewing/serving stays offline (this is the only network step).
 */
export async function infer(
  repoRoot: string,
  config: ArthaConfig,
  options: InferOptions = {},
): Promise<InferReport> {
  const arthaDir = join(repoRoot, '.artha');
  const report: InferReport = {
    candidates: 0,
    reused: 0,
    synthesized: [],
    declined: 0,
    downgraded: 0,
    remaining: 0,
  };

  const { layer, resolver } = await deriveLayer(repoRoot, config);
  report.candidates = layer.facts.length;
  if (layer.facts.length === 0 || !resolver) return report;

  const pinsByFact = groupBy(layer.pins, (p) => p.inferred_id);
  const stepsByFact = groupBy(layer.steps, (s) => s.inferred_id);
  const statesByFact = groupBy(layer.states, (s) => s.inferred_id);
  const cache = readSynthCache(arthaDir);

  // First pass: keep every still-valid cached synthesis (its pinned code is
  // unchanged), and collect the rest as the work to spend on.
  const next: SynthCache = new Map();
  const pending: { fact: InferredRow; hash: string; pins: InferredPinRow[] }[] = [];
  for (const fact of [...layer.facts].sort((a, b) => a.id.localeCompare(b.id))) {
    const pins = pinsByFact.get(fact.id) ?? [];
    const hash = evidenceHash(pins);
    const cached = cache.get(fact.id);
    if (cached && cached.evidenceHash === hash) {
      next.set(fact.id, cached);
      report.reused++;
    } else {
      pending.push({ fact, hash, pins });
    }
  }

  if (options.dryRun) {
    report.remaining = pending.length;
    logger.info(
      `Dry run: ${report.candidates} candidate(s), ${report.reused} cached, ` +
        `${pending.length} would be synthesized.`,
    );
    return report;
  }

  // Build the synthesizer (engine readiness check happens here) only when there
  // is work, so a fully-cached repo needs no credentials.
  if (pending.length > 0) {
    const inferrer = options.inferrer ?? (await createInferrer(config.infer));
    const budget = options.maxFacts ?? DEFAULT_MAX_FACTS;
    let calls = 0;
    for (const { fact, hash, pins } of pending) {
      if (budget !== 0 && calls >= budget) {
        report.remaining = pending.length - calls;
        logger.info(`Reached spend cap (${budget} candidates). Re-run \`artha infer\` for more.`);
        break;
      }
      calls++;

      const evidence = gatherEvidence(pins, resolver);
      const factSteps = stepsByFact.get(fact.id) ?? [];
      const factStates = statesByFact.get(fact.id) ?? [];
      const result = await inferrer.synthesize({
        kind: fact.kind,
        heading: fact.heading,
        body: fact.body ?? '',
        evidence,
        steps: stepInputs(factSteps),
        members: factStates.map((s) => s.name),
      });
      if (!result.enriched) {
        report.declined++;
        continue;
      }

      // Keep only step text for modules the flow really reaches and transitions
      // between real states, then verify what we'll actually store - a dropped
      // stray step or fabricated-state edge never taints the tier.
      const steps = alignSteps(result.steps, factSteps);
      const transitions = alignTransitions(result.transitions, factStates);
      const tier = verifySynthesis(
        { ...result, steps, transitions },
        evidence,
        `${fact.heading} ${fact.body ?? ''}`,
      );
      next.set(fact.id, {
        evidenceHash: hash,
        name: result.name,
        summary: result.summary,
        steps,
        transitions,
        confidence: tier,
      });
      report.synthesized.push({ id: fact.id, confidence: tier });
      if (tier === UNCERTAIN) report.downgraded++;
    }
  }

  writeSynthCache(arthaDir, next);
  return report;
}

/** Re-derive the exact 21a candidates `build` emits, so `infer` enriches the
 * same set that will be indexed (same files, resolver, refs, human-pin
 * suppression). Returns the resolver too, so evidence gathering reuses the one
 * tree-sitter parse rather than walking the repo twice. */
async function deriveLayer(
  repoRoot: string,
  config: ArthaConfig,
): Promise<{ layer: InferredLayer; resolver: SymbolResolver | null }> {
  const sourceFiles = listSourceFiles(repoRoot, config.sourceRoots);
  if (sourceFiles.length === 0) {
    return { layer: { facts: [], pins: [], states: [], steps: [] }, resolver: null };
  }
  const resolver = await createTreeSitterResolver(repoRoot);
  const refs = referenceGraph(sourceFiles, (file) => resolver.imports(file), config.sourceRoots);
  const humanPinnedRefs = new Set(
    loadEntries(join(repoRoot, '.artha')).entries.flatMap((entry) =>
      collectPins(entry).map((pin) => pin.symbol),
    ),
  );
  return {
    layer: inferLayer(sourceFiles, resolver, refs, humanPinnedRefs, config.sourceRoots),
    resolver,
  };
}

/** The reached modules a flow fans out to, as synthesizer input (21b-2). Ordered
 * and deduped by the 21a step order; a non-flow has none. */
function stepInputs(steps: InferredStepRow[]): SynthStep[] {
  const out: SynthStep[] = [];
  const seen = new Set<string>();
  for (const s of [...steps].sort((a, b) => a.ord - b.ord)) {
    if (!s.to_module || seen.has(s.to_module)) continue;
    seen.add(s.to_module);
    out.push({ module: s.to_module, label: s.label });
  }
  return out;
}

/** Keep only the model's step text that maps to a module the flow really reaches
 * (21a), so a hallucinated or mis-keyed step is dropped, not stored. */
function alignSteps(synthesized: SynthStepText[], steps: InferredStepRow[]): SynthStepText[] {
  const reached = new Set(steps.map((s) => s.to_module).filter((m): m is string => m !== null));
  const seen = new Set<string>();
  const out: SynthStepText[] = [];
  for (const s of synthesized) {
    if (!reached.has(s.module) || seen.has(s.module)) continue;
    seen.add(s.module);
    out.push(s);
  }
  return out;
}

/** Keep only transitions between real states (21b-2): both endpoints must be
 * members of the concept's own state set, so a fabricated state - the machine
 * "completing" the diagram - is dropped before it can be stored or taint the
 * tier. Deduped by the (from → to) pair; the trigger's grounding is the verifier's. */
function alignTransitions(
  synthesized: SynthTransition[],
  states: InferredStateRow[],
): SynthTransition[] {
  const real = new Set(states.map((s) => s.name));
  const seen = new Set<string>();
  const out: SynthTransition[] = [];
  for (const t of synthesized) {
    if (!real.has(t.from) || !real.has(t.to)) continue;
    const key = `${t.from} ${t.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Resolve a fact's pins to the source lines that back them (D5), skipping any
 * pin that no longer resolves - the synthesizer and verifier see only real code. */
function gatherEvidence(pins: InferredPinRow[], resolver: SymbolResolver): EvidenceExcerpt[] {
  const out: EvidenceExcerpt[] = [];
  for (const pin of [...pins].sort((a, b) => a.ord - b.ord)) {
    const view = evidenceFor(resolver, pin.symbol_ref);
    if (view) out.push({ ref: view.ref, path: view.path, lines: view.lines });
  }
  return out;
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) bucket.push(item);
    else map.set(k, [item]);
  }
  return map;
}
