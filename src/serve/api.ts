import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type RankedModule, darkZones, moduleCoverage } from '../analytics/coverage';
import { moduleOf } from '../analytics/module';
import type { ArthaConfig } from '../config/config';
import type { ArthaIndex } from '../mcp/query';

/**
 * The read API the dashboard renders (T16/17/19 build against these shapes).
 * Every function here is **pure over a read-only index** (+ git for churn) — no
 * mutation, no network — so the whole viewing surface stays offline.
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
  /** True when nothing is certified yet — the intended mostly-dark cold start. */
  cold: boolean;
}

/** A named product area → the code modules it covers (OQ5). */
export interface AreaDef {
  area: string;
  modules: string[];
}

/**
 * OQ5 (developer-chosen 2026-06-24: **top-level folders, with a config seam**).
 * Default — one area per top-level module, so the map's product column is
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
 * The Product↔Code map feed at **area/module altitude** (SPEC §B) — never the
 * per-symbol graph. Modules carry dark-zone flags + churn/coverage (T13); areas
 * (OQ5) group modules and list the concepts/flows that pin into them.
 */
export function mapFeed(repoRoot: string, index: ArthaIndex, config: ArthaConfig): MapFeed {
  const ranked = new Map<string, RankedModule>(
    darkZones(repoRoot, index, config).map((r) => [r.module, r]),
  );
  const universe = moduleUniverse(repoRoot, index, config);
  for (const m of ranked.keys()) universe.add(m);

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

// ── /api/dark-zones ───────────────────────────────────────────────────────────

export function darkZonesFeed(
  repoRoot: string,
  index: ArthaIndex,
  config: ArthaConfig,
): RankedModule[] {
  return darkZones(repoRoot, index, config);
}

// ── /api/search?q= ────────────────────────────────────────────────────────────

export interface SearchHit {
  id: string;
  kind: string;
  heading: string | null;
  status: string;
  score: number;
}

const STATUS_WEIGHT: Record<string, number> = { certified: 1, proposed: 0.6, stale: 0.3 };

/**
 * Lexical search over the index for the dashboard's search box. FTS bm25 (lower
 * = better) folded into a 0–1 relevance, scaled by status (certified > proposed
 * > stale). The T14 embedding blend layers in here later; the shape is stable.
 */
export function search(index: ArthaIndex, query: string, limit = 20): SearchHit[] {
  const q = query.trim();
  if (q === '') return [];

  const bm25 = index.fts(q); // id → bm25 (lower better); empty if no FTS hit
  const needle = q.toLowerCase();
  const byId = new Map(index.facts.map((f) => [f.id, f]));

  const candidates = new Set<string>(bm25.keys());
  for (const f of index.facts) {
    if (
      (f.heading ?? '').toLowerCase().includes(needle) ||
      (f.body ?? '').toLowerCase().includes(needle)
    ) {
      candidates.add(f.id);
    }
  }

  const hits: SearchHit[] = [];
  for (const id of candidates) {
    const fact = byId.get(id);
    if (!fact) continue;
    // bm25 → (0,1]: 1/(1+score) when present, a small base for substring-only hits.
    const lexical = bm25.has(id) ? 1 / (1 + Math.max(0, bm25.get(id) ?? 0)) : 0.25;
    hits.push({
      id,
      kind: fact.kind,
      heading: fact.heading,
      status: fact.status,
      score: lexical * (STATUS_WEIGHT[fact.status] ?? 0.5),
    });
  }

  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return hits.slice(0, limit);
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
