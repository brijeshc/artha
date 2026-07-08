import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type RankedModule, darkZones, moduleCoverage } from '../analytics/coverage';
import { moduleOf } from '../analytics/module';
import type { FileGraph } from '../analytics/references';
import type { RefRow } from '../build/db';
import type { ArthaConfig } from '../config/config';
import type { ArthaIndex } from '../mcp/query';
import { rankFacts } from '../mcp/rank';

/**
 * The read API the dashboard renders (T16/17/19 build against these shapes).
 * Every function here is **pure over a read-only index** (+ git for churn) - no
 * mutation, no network - so the whole viewing surface stays offline.
 */

// ── /api/map ──────────────────────────────────────────────────────────────────

export interface MapModule {
  module: string;
  /** No certified meaning attached → a dark zone. */
  dark: boolean;
  churn: number;
  certifiedFacts: number;
  staleFacts: number;
  /** Health score (T13); lower = darker. */
  score: number;
  /** Machine-described meaning exists here (a module card / state machine) →
   * the tile glows *moonlight* even before anyone vouches (21a, D2). */
  described: boolean;
  /** The module card's plain-language description - what the machine reads this
   * code as. Deterministic prose today (21a); the same slot 21b's LLM synthesis
   * enriches, so the board grows richer with zero client rework. */
  describedAs: string | null;
  /** Inferred state-machine candidates in this module (21a) - moonlight detail. */
  inferredConcepts: number;
}

export interface MapArea {
  area: string;
  /** Code modules this product area covers. */
  modules: string[];
  /** Concept ids whose pins land in this area. */
  concepts: string[];
  /** Flow ids whose pins land in this area. */
  flows: string[];
  /** Every module in the area is dark (no certified meaning). */
  dark: boolean;
}

export interface MapFeed {
  areas: MapArea[];
  modules: MapModule[];
  /** True when nothing is certified yet - the intended mostly-dark cold start. */
  cold: boolean;
}

/** A named product area → the code modules it covers (OQ5). */
export interface AreaDef {
  area: string;
  modules: string[];
}

/**
 * OQ5 (developer-chosen 2026-06-24: **top-level folders, with a config seam**).
 * Default - one area per top-level module, so the map's product column is
 * populated from day one (before any concepts exist). When `config.areas` is
 * declared, those named areas group modules and any leftover module keeps its
 * own area (nothing is hidden). Isolated here so the definition stays swappable.
 */
export function areasOf(modules: string[], config: ArthaConfig): AreaDef[] {
  const all = [...new Set(modules)].sort();
  const declared = config.areas;
  if (!declared || Object.keys(declared).length === 0) {
    return all.map((module) => ({ area: module, modules: [module] }));
  }

  const assigned = new Set<string>();
  const areas: AreaDef[] = [];
  for (const [area, mods] of Object.entries(declared)) {
    const present = mods.filter((m) => all.includes(m));
    for (const m of present) assigned.add(m);
    areas.push({ area, modules: present });
  }
  for (const module of all) {
    if (!assigned.has(module)) areas.push({ area: module, modules: [module] });
  }
  return areas.sort((a, b) => a.area.localeCompare(b.area));
}

/**
 * The Product↔Code map feed at **area/module altitude** (SPEC §B) - never the
 * per-symbol graph. Modules carry dark-zone flags + churn/coverage (T13); areas
 * (OQ5) group modules and list the concepts/flows that pin into them.
 */
export function mapFeed(repoRoot: string, index: ArthaIndex, config: ArthaConfig): MapFeed {
  const ranked = new Map<string, RankedModule>(
    darkZones(repoRoot, index, config).map((r) => [r.module, r]),
  );
  const universe = moduleUniverse(repoRoot, index, config);
  for (const m of ranked.keys()) universe.add(m);

  const inferredConcepts = new Map<string, number>();
  const describedModules = new Set<string>();
  const describedAs = new Map<string, string>();
  for (const row of index.inferred) {
    if (!row.module) continue;
    describedModules.add(row.module);
    if (row.kind === 'module' && row.body) describedAs.set(row.module, row.body);
    if (row.kind === 'concept') {
      inferredConcepts.set(row.module, (inferredConcepts.get(row.module) ?? 0) + 1);
    }
  }

  const modules: MapModule[] = [...universe].sort().map((module) => {
    const r = ranked.get(module);
    const certifiedFacts = r?.certifiedFacts ?? 0;
    return {
      module,
      dark: certifiedFacts === 0,
      churn: r?.churn ?? 0,
      certifiedFacts,
      staleFacts: r?.staleFacts ?? 0,
      score: r?.score ?? 0,
      described: describedModules.has(module),
      describedAs: describedAs.get(module) ?? null,
      inferredConcepts: inferredConcepts.get(module) ?? 0,
    };
  });
  const darkByModule = new Map(modules.map((m) => [m.module, m.dark]));

  const conceptModules = factModules(index, 'concept', config);
  const flowModules = factModules(index, 'flow', config);

  const areas: MapArea[] = areasOf([...universe], config).map((def) => {
    const inArea = new Set(def.modules);
    return {
      area: def.area,
      modules: def.modules,
      concepts: idsTouching(conceptModules, inArea),
      flows: idsTouching(flowModules, inArea),
      dark: def.modules.every((m) => darkByModule.get(m) !== false),
    };
  });

  const cold = !index.facts.some((f) => f.status === 'certified');
  return { areas, modules, cold };
}

// ── /api/concept/:id  and  /api/flow/:id ──────────────────────────────────────

export interface PinView {
  symbol: string;
  symbolId: string | null;
  contentHash: string | null;
  stale: boolean;
}

export interface ConceptDetail {
  id: string;
  kind: 'concept';
  name: string | null;
  summary: string | null;
  status: string;
  certifiedBy: string | null;
  certifiedAt: string | null;
  states: Array<{ name: string; effect: string | null; invariant: string | null }>;
  transitions: Array<{ from: string; to: string; trigger: string }>;
  pins: PinView[];
  related: string[];
  modules: string[];
}

export interface FlowStepView {
  on: string | null;
  do: string;
  pin: PinView | null;
}

export interface FlowDetail {
  id: string;
  kind: 'flow';
  name: string | null;
  summary: string | null;
  status: string;
  certifiedBy: string | null;
  certifiedAt: string | null;
  entry: PinView[];
  steps: FlowStepView[];
  related: string[];
  modules: string[];
}

export function conceptDetail(
  index: ArthaIndex,
  id: string,
  config: ArthaConfig,
): ConceptDetail | null {
  const fact = index.facts.find((f) => f.id === id && f.kind === 'concept');
  if (!fact) return null;
  return {
    id,
    kind: 'concept',
    name: fact.heading,
    summary: fact.body,
    status: fact.status,
    certifiedBy: fact.certified_by,
    certifiedAt: fact.certified_at,
    states: index.states
      .filter((s) => s.fact_id === id)
      .sort((a, b) => a.ord - b.ord)
      .map((s) => ({ name: s.name, effect: s.effect, invariant: s.invariant })),
    transitions: index.transitions
      .filter((t) => t.fact_id === id)
      .sort((a, b) => a.ord - b.ord)
      .map((t) => ({ from: t.from_state, to: t.to_state, trigger: t.trigger })),
    pins: pinViews(index, id),
    related: relatedOf(index, id),
    modules: modulesOf(index, id, config.sourceRoots),
  };
}

export function flowDetail(index: ArthaIndex, id: string, config: ArthaConfig): FlowDetail | null {
  const fact = index.facts.find((f) => f.id === id && f.kind === 'flow');
  if (!fact) return null;

  const steps = index.flowSteps.filter((s) => s.fact_id === id).sort((a, b) => a.ord - b.ord);
  const stepRefs = new Set(
    steps.map((s) => s.pin_symbol_ref).filter((r): r is string => r !== null),
  );
  const pinBySymbol = new Map(pinViews(index, id).map((p) => [p.symbol, p]));

  return {
    id,
    kind: 'flow',
    name: fact.heading,
    summary: fact.body,
    status: fact.status,
    certifiedBy: fact.certified_by,
    certifiedAt: fact.certified_at,
    // A flow's entry points are its pins that no step references.
    entry: [...pinBySymbol.values()].filter((p) => !stepRefs.has(p.symbol)),
    steps: steps.map((s) => ({
      on: s.on_event,
      do: s.do_action,
      pin: s.pin_symbol_ref ? (pinBySymbol.get(s.pin_symbol_ref) ?? null) : null,
    })),
    related: relatedOf(index, id),
    modules: modulesOf(index, id, config.sourceRoots),
  };
}

// ── /api/inferred/:id  (21a - the machine-described layer) ─────────────────────

/**
 * One inferred fact as the dashboard renders it in *moonlight*: a module card or
 * a state-machine candidate, its worded confidence, the states read from code,
 * and the evidence pins that back every claim (D5). Distinct from a `ConceptDetail`
 * so the UI can tell "described" from "vouched" without a status field.
 */
export interface InferredFactView {
  id: string;
  /** `module` card · `concept` (state machine) · `flow` (skeleton) · `convention`. */
  kind: string;
  module: string | null;
  name: string;
  summary: string | null;
  /** Worded confidence tier slug (D7): `read-from-code` for everything in 21a. */
  confidence: string;
  /** Ordered state names read from code (concept kind); empty otherwise. */
  states: string[];
  /** Ordered fan-out steps read from imports (flow kind); empty otherwise. */
  steps: InferredStepView[];
  /** Evidence pins - the code each claim was read from. */
  pins: PinView[];
}

/** One step of an inferred flow skeleton (21a): a downstream area, linking to its
 * module tile. The order/meaning of the step itself is the human delta. */
export interface InferredStepView {
  label: string;
  module: string | null;
}

/** An inferred fact by id (module card or state-machine candidate), or null. */
export function inferredDetail(index: ArthaIndex, id: string): InferredFactView | null {
  const row = index.inferred.find((r) => r.id === id);
  return row ? inferredView(index, row) : null;
}

function inferredView(index: ArthaIndex, row: ArthaIndex['inferred'][number]): InferredFactView {
  return {
    id: row.id,
    kind: row.kind,
    module: row.module,
    name: row.heading,
    summary: row.body,
    confidence: row.confidence,
    states: index.inferredStates
      .filter((s) => s.inferred_id === row.id)
      .sort((a, b) => a.ord - b.ord)
      .map((s) => s.name),
    steps: index.inferredSteps
      .filter((s) => s.inferred_id === row.id)
      .sort((a, b) => a.ord - b.ord)
      .map((s) => ({ label: s.label, module: s.to_module })),
    // Moonlight regenerates on drift, so inferred pins are never "stale" (D12).
    pins: index.inferredPins
      .filter((p) => p.inferred_id === row.id)
      .sort((a, b) => a.ord - b.ord)
      .map((p) => ({
        symbol: p.symbol_ref,
        symbolId: p.symbol_id,
        contentHash: p.content_hash,
        stale: false,
      })),
  };
}

// ── /api/catalog ──────────────────────────────────────────────────────────────

/** A concept summarised for the catalog card - its state chain, not its full machine. */
export interface CatalogConcept {
  id: string;
  name: string | null;
  status: string;
  modules: string[];
  /** Ordered state names, for the card's state-chain preview. */
  states: string[];
}

/** A flow summarised for the catalog card - its step spine + coverage. */
export interface CatalogFlow {
  id: string;
  name: string | null;
  status: string;
  modules: string[];
  steps: number;
  /** Steps with a resolved pin (the rest are "not yet linked"). */
  linked: number;
}

/** An inferred state-machine candidate summarised for the catalog (21a). Carries
 * `confidence` in place of a status - it is described, not vouched (D2/D7). */
export interface InferredCatalogConcept {
  id: string;
  name: string;
  module: string | null;
  states: string[];
  confidence: string;
}

/** An inferred flow skeleton summarised for the catalog (21a): its fan-out
 * preview and worded confidence, described not vouched. */
export interface InferredCatalogFlow {
  id: string;
  name: string;
  module: string | null;
  /** Ordered fan-out step labels - the card's preview. */
  steps: string[];
  confidence: string;
}

export interface Catalog {
  concepts: CatalogConcept[];
  flows: CatalogFlow[];
  /** Machine-described concepts (21a), rendered in moonlight below vouched ones. */
  inferredConcepts: InferredCatalogConcept[];
  /** Machine-described flow skeletons (21a), moonlight below vouched flows. */
  inferredFlows: InferredCatalogFlow[];
}

/**
 * Lightweight summaries of every concept/flow for the dashboard catalog - name,
 * status, the modules each touches, and a glanceable preview (a concept's state
 * chain, a flow's step coverage). Pure over the index; the map feed carries only
 * ids, so this is the read contract the catalog cards render from.
 */
export function catalog(index: ArthaIndex, config: ArthaConfig): Catalog {
  const roots = config.sourceRoots;
  const concepts: CatalogConcept[] = index.facts
    .filter((f) => f.kind === 'concept')
    .map((f) => ({
      id: f.id,
      name: f.heading,
      status: f.status,
      modules: modulesOf(index, f.id, roots),
      states: index.states
        .filter((s) => s.fact_id === f.id)
        .sort((a, b) => a.ord - b.ord)
        .map((s) => s.name),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const flows: CatalogFlow[] = index.facts
    .filter((f) => f.kind === 'flow')
    .map((f) => {
      const steps = index.flowSteps.filter((s) => s.fact_id === f.id);
      return {
        id: f.id,
        name: f.heading,
        status: f.status,
        modules: modulesOf(index, f.id, roots),
        steps: steps.length,
        linked: steps.filter((s) => s.pin_symbol_ref !== null).length,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const inferredConcepts: InferredCatalogConcept[] = index.inferred
    .filter((r) => r.kind === 'concept')
    .map((r) => ({
      id: r.id,
      name: r.heading,
      module: r.module,
      states: index.inferredStates
        .filter((s) => s.inferred_id === r.id)
        .sort((a, b) => a.ord - b.ord)
        .map((s) => s.name),
      confidence: r.confidence,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const inferredFlows: InferredCatalogFlow[] = index.inferred
    .filter((r) => r.kind === 'flow')
    .map((r) => ({
      id: r.id,
      name: r.heading,
      module: r.module,
      steps: index.inferredSteps
        .filter((s) => s.inferred_id === r.id)
        .sort((a, b) => a.ord - b.ord)
        .map((s) => s.label),
      confidence: r.confidence,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return { concepts, flows, inferredConcepts, inferredFlows };
}

// ── /api/dark-zones ───────────────────────────────────────────────────────────

export function darkZonesFeed(
  repoRoot: string,
  index: ArthaIndex,
  config: ArthaConfig,
): RankedModule[] {
  return darkZones(repoRoot, index, config);
}

// ── /api/module/:id ───────────────────────────────────────────────────────────

/** One fact as it touches a module: what it is, its standing, and the join. */
export interface ModuleFact {
  id: string;
  kind: string;
  name: string | null;
  status: string;
  /** The rule / decision / summary text - what the fact actually says. */
  body: string | null;
  /** Pinned symbols that land inside this module. */
  symbols: string[];
  /** Count of those pins whose code has drifted. */
  stalePins: number;
  /** True when the fact reaches the module via a scope glob (not a pin). */
  viaScope: boolean;
}

/** A structural link to another module (T17b), with how many imports back it. */
export interface RefLink {
  module: string;
  count: number;
}

/**
 * The engineer lens (16c): everything certified/proposed that governs one code
 * module. `capabilities` are the concepts/flows built on it; `rules` the
 * invariants + conventions in scope; `decisions` the *why*. `dependsOn`/`usedBy`
 * are the structural neighbours mined from imports (T17b - "what am I wired to").
 * Stats echo the dark-zone ranking so the view can say how dark the module is
 * and where it sits in the ask queue.
 */
export interface ModuleDetail {
  module: string;
  /** Named areas containing this module (config.areas), else itself. */
  areas: string[];
  dark: boolean;
  churn: number;
  score: number;
  certifiedFacts: number;
  staleFacts: number;
  /** 1-based position in the dark-zone queue; null when not ranked. */
  queueRank: number | null;
  concepts: ModuleFact[];
  flows: ModuleFact[];
  rules: ModuleFact[];
  decisions: ModuleFact[];
  /** Modules this one imports from (most-coupled first). */
  dependsOn: RefLink[];
  /** Modules that import this one (most-coupled first). */
  usedBy: RefLink[];
  /** The module's machine-described card (21a) - the moonlight lead prose; null
   * if the module has no inferred card (e.g. a pre-21a index). */
  card: InferredFactView | null;
  /** Inferred state-machine candidates whose evidence lands in this module (21a). */
  inferredConcepts: InferredFactView[];
  /** Inferred flow skeletons entered from this module (21a). */
  inferredFlows: InferredFactView[];
  /** Inferred naming conventions this module repeats (21a). */
  inferredConventions: InferredFactView[];
}

export function moduleDetail(
  repoRoot: string,
  index: ArthaIndex,
  config: ArthaConfig,
  module: string,
): ModuleDetail | null {
  const ranked = darkZones(repoRoot, index, config);
  const universe = moduleUniverse(repoRoot, index, config);
  for (const r of ranked) universe.add(r.module);
  if (!universe.has(module)) return null;

  const roots = config.sourceRoots;
  const facts: ModuleFact[] = [];
  for (const f of index.facts) {
    const symbols: string[] = [];
    let stalePins = 0;
    for (const p of index.pins) {
      if (p.fact_id !== f.id) continue;
      if (moduleOf(p.symbol_ref.split('#')[0] ?? '', roots) !== module) continue;
      symbols.push(p.symbol_ref);
      if (p.is_stale === 1) stalePins += 1;
    }
    const viaScope = index.scopeFiles.some(
      (s) => s.fact_id === f.id && moduleOf(s.file_path, roots) === module,
    );
    if (symbols.length === 0 && !viaScope) continue;
    facts.push({
      id: f.id,
      kind: f.kind,
      name: f.heading,
      status: f.status,
      body: f.body,
      symbols: symbols.sort(),
      stalePins,
      viaScope,
    });
  }
  facts.sort((a, b) => statusWeight(b.status) - statusWeight(a.status) || a.id.localeCompare(b.id));

  const rank = ranked.findIndex((r) => r.module === module);
  const stats = rank >= 0 ? ranked[rank] : null;
  const declared = Object.entries(config.areas ?? {})
    .filter(([, mods]) => mods.includes(module))
    .map(([area]) => area);

  return {
    module,
    areas: declared.length > 0 ? declared.sort() : [module],
    dark: (stats?.certifiedFacts ?? 0) === 0,
    churn: stats?.churn ?? 0,
    score: stats?.score ?? 0,
    certifiedFacts: stats?.certifiedFacts ?? 0,
    staleFacts: stats?.staleFacts ?? 0,
    queueRank: rank >= 0 ? rank + 1 : null,
    concepts: facts.filter((f) => f.kind === 'concept'),
    flows: facts.filter((f) => f.kind === 'flow'),
    rules: facts.filter((f) => f.kind === 'invariant' || f.kind === 'convention'),
    decisions: facts.filter((f) => f.kind === 'decision'),
    dependsOn: refLinks(index.refs, module, 'out'),
    usedBy: refLinks(index.refs, module, 'in'),
    card: (() => {
      const row = index.inferred.find((r) => r.kind === 'module' && r.module === module);
      return row ? inferredView(index, row) : null;
    })(),
    inferredConcepts: index.inferred
      .filter((r) => r.kind === 'concept' && r.module === module)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((r) => inferredView(index, r)),
    inferredFlows: index.inferred
      .filter((r) => r.kind === 'flow' && r.module === module)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((r) => inferredView(index, r)),
    inferredConventions: index.inferred
      .filter((r) => r.kind === 'convention' && r.module === module)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((r) => inferredView(index, r)),
  };
}

// ── /api/module-board/:id  (23b - the inner board) ─────────────────────────────

/** A fact pinned into one source file - the meaning that lights its box. */
export interface ModuleBoardFileFact {
  id: string;
  kind: string;
  name: string | null;
  status: string;
}

/**
 * One source file as the inner board draws it: a chalk box lit by the facts
 * pinned into it. This is the code↔meaning linkage at *file* altitude - the
 * descent a newcomer takes from the module board down toward the code.
 */
export interface ModuleBoardFile {
  /** Repo-relative posix path (`src/billing/refund.ts`). */
  path: string;
  /** Basename for the chalk label (`refund.ts`). */
  name: string;
  /** Facts pinned to symbols in this file, strongest standing first. */
  facts: ModuleBoardFileFact[];
}

/** A file→file import that stays inside the module (both endpoints local). */
export interface ModuleBoardEdge {
  from: string;
  to: string;
}

/** The inner board of one module: its files as boxes, their imports as arrows. */
export interface ModuleBoardData {
  module: string;
  files: ModuleBoardFile[];
  edges: ModuleBoardEdge[];
}

/**
 * The inner board (23b): a module drilled down to its own files. The files come
 * from the repo's structural scan (deterministic); the intra-module import edges
 * are that scan's file graph kept inside the module (a cross-module import is
 * already drawn on the outer board, so it is left off here); each file is lit by
 * the facts pinned into it. Pure over the index + the structural scan (which the
 * server passes in from the cached {@link RepoStructure}), so it stays offline
 * and unit-testable. A module with no source files yields an empty board, never
 * an error - additive to the module page, which handles the 404.
 */
export function moduleBoard(
  index: ArthaIndex,
  config: ArthaConfig,
  module: string,
  files: string[],
  fileGraph: FileGraph,
): ModuleBoardData {
  const roots = config.sourceRoots;
  const inModule = files.filter((f) => moduleOf(f, roots) === module).sort();
  const local = new Set(inModule);

  // file → the facts pinned into it (a pin's ref is `path#Symbol`), deduped.
  const factById = new Map(index.facts.map((f) => [f.id, f]));
  const factsByFile = new Map<string, Map<string, ModuleBoardFileFact>>();
  for (const p of index.pins) {
    const file = p.symbol_ref.split('#')[0] ?? '';
    if (!local.has(file)) continue;
    const fact = factById.get(p.fact_id);
    if (!fact) continue;
    const bucket = factsByFile.get(file) ?? new Map<string, ModuleBoardFileFact>();
    bucket.set(fact.id, { id: fact.id, kind: fact.kind, name: fact.heading, status: fact.status });
    factsByFile.set(file, bucket);
  }

  const boardFiles: ModuleBoardFile[] = inModule.map((path) => ({
    path,
    name: path.split('/').pop() ?? path,
    facts: [...(factsByFile.get(path)?.values() ?? [])].sort(
      (a, b) => statusWeight(b.status) - statusWeight(a.status) || a.id.localeCompare(b.id),
    ),
  }));

  const edges: ModuleBoardEdge[] = [];
  for (const from of inModule) {
    for (const to of fileGraph.importsOf.get(from) ?? []) {
      if (from !== to && local.has(to)) edges.push({ from, to });
    }
  }
  edges.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  return { module, files: boardFiles, edges };
}

// ── /api/refs ─────────────────────────────────────────────────────────────────

/**
 * The whole module reference graph (T17b) for the atlas: every structural
 * edge, already deterministically ordered. Pure over the index; the atlas reads
 * it to outline a selected tile's first-hop neighbours.
 */
export function refsFeed(index: ArthaIndex): RefRow[] {
  return index.refs;
}

/** A module's structural neighbours: `out` = modules it imports, `in` = importers. */
function refLinks(refs: RefRow[], module: string, dir: 'in' | 'out'): RefLink[] {
  return refs
    .filter((r) => (dir === 'out' ? r.from_module : r.to_module) === module)
    .map((r) => ({ module: dir === 'out' ? r.to_module : r.from_module, count: r.count }))
    .sort((a, b) => b.count - a.count || a.module.localeCompare(b.module));
}

/** Certified first, then proposed, then stale - trust order for listing. */
function statusWeight(status: string): number {
  if (status === 'certified') return 3;
  if (status === 'proposed') return 2;
  if (status === 'stale') return 1;
  return 0;
}

// ── /api/search?q= ────────────────────────────────────────────────────────────

export interface SearchHit {
  id: string;
  kind: string;
  heading: string | null;
  status: string;
  score: number;
}

/**
 * Dashboard search box - the **same `rankFacts` blend** the MCP server uses
 * (FTS lexical + structural + semantic × status), so search and agent retrieval
 * agree. Includes `proposed` drafts (the dashboard surfaces them); `stale` is
 * excluded as untrusted. `queryEmbedding` (model-matched, embedded by the server)
 * adds semantic recall; absent → lexical-only, exactly as v0.1.
 */
export function search(
  index: ArthaIndex,
  query: string,
  queryEmbedding?: ArrayLike<number>,
  limit = 20,
): SearchHit[] {
  if (query.trim() === '') return [];
  return rankFacts(index, { task: query, includeProposed: true, queryEmbedding })
    .slice(0, limit)
    .map((item) => ({
      id: item.fact.id,
      kind: item.fact.kind,
      heading: item.fact.heading,
      status: item.fact.status,
      score: item.score,
    }));
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Top-level modules: filesystem folders under each source root ∪ covered modules. */
function moduleUniverse(repoRoot: string, index: ArthaIndex, config: ArthaConfig): Set<string> {
  const set = new Set<string>();
  for (const root of config.sourceRoots) {
    const abs = join(repoRoot, root);
    if (!existsSync(abs)) continue;
    let hasFile = false;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (entry.isDirectory()) set.add(`${root}/${entry.name}`);
      else hasFile = true;
    }
    if (hasFile) set.add(root);
  }
  for (const module of moduleCoverage(index, config.sourceRoots).keys()) set.add(module);
  return set;
}

/** Pin views for one fact, with per-pin stale flag. */
function pinViews(index: ArthaIndex, factId: string): PinView[] {
  return index.pins
    .filter((p) => p.fact_id === factId)
    .map((p) => ({
      symbol: p.symbol_ref,
      symbolId: p.symbol_id,
      contentHash: p.content_hash,
      stale: p.is_stale === 1,
    }));
}

function relatedOf(index: ArthaIndex, factId: string): string[] {
  return index.related.filter((r) => r.fact_id === factId).map((r) => r.related_id);
}

/** The modules a fact's pins resolve into. */
function modulesOf(index: ArthaIndex, factId: string, sourceRoots: string[]): string[] {
  const mods = new Set<string>();
  for (const p of index.pins) {
    if (p.fact_id !== factId) continue;
    const mod = moduleOf(p.symbol_ref.split('#')[0] ?? '', sourceRoots);
    if (mod) mods.add(mod);
  }
  return [...mods].sort();
}

/** fact id → set of modules it touches, for facts of one kind. */
function factModules(
  index: ArthaIndex,
  kind: 'concept' | 'flow',
  config: ArthaConfig,
): Map<string, Set<string>> {
  const ids = new Set(index.facts.filter((f) => f.kind === kind).map((f) => f.id));
  const out = new Map<string, Set<string>>();
  for (const p of index.pins) {
    if (!ids.has(p.fact_id)) continue;
    const mod = moduleOf(p.symbol_ref.split('#')[0] ?? '', config.sourceRoots);
    if (!mod) continue;
    const set = out.get(p.fact_id) ?? new Set<string>();
    set.add(mod);
    out.set(p.fact_id, set);
  }
  return out;
}

/** Ids whose touched-module set overlaps the area's modules. */
function idsTouching(factModuleMap: Map<string, Set<string>>, areaModules: Set<string>): string[] {
  const ids: string[] = [];
  for (const [id, mods] of factModuleMap) {
    for (const m of mods) {
      if (areaModules.has(m)) {
        ids.push(id);
        break;
      }
    }
  }
  return ids.sort();
}
