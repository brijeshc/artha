// Pure derivations over the read-API feeds - no React, no fetch - so they are
// trivially unit-testable and shared by the top bar, the navigator, the atlas,
// and the pages. The dashboard's whole job is turning these numbers into
// pixels; keeping the math here keeps the components about layout.

import type { Catalog, FlowDetail, MapArea, MapFeed, MapModule, RefEdge } from './api';
import { KPI } from './copy';
import { type TreemapRect, treemap } from './treemap';

export type CapabilityKind = 'concept' | 'flow';
export interface CapabilityRef {
  kind: CapabilityKind;
  id: string;
}

/** The modules a capability touches - the connection set the atlas lights up. */
export function modulesForCapability(catalog: Catalog, ref: CapabilityRef): string[] {
  const list = ref.kind === 'concept' ? catalog.concepts : catalog.flows;
  return list.find((c) => c.id === ref.id)?.modules ?? [];
}

/**
 * A module's first-hop structural neighbours (T17b): every module it imports or
 * is imported by. The atlas outlines these when a tile is selected, so you can
 * see a module's blast radius without drawing a single line.
 */
export function neighborsOf(refs: RefEdge[], module: string | null): Set<string> {
  const out = new Set<string>();
  if (!module) return out;
  for (const r of refs) {
    if (r.from_module === module) out.add(r.to_module);
    else if (r.to_module === module) out.add(r.from_module);
  }
  return out;
}

/** `src/billing` → `billing` - the place-name a map tile is labelled with. */
export function shortName(module: string): string {
  const parts = module.split('/');
  return parts[parts.length - 1] || module;
}

/**
 * The module that owns a pinned file - longest-prefix match, so with modules
 * `src` and `src/billing` the path `src/billing/refund.ts` belongs to the
 * deeper one. `null` when no module contains the path (the pin stays plain
 * text rather than linking somewhere wrong).
 */
export function moduleOfPath(path: string, modules: string[]): string | null {
  let best: string | null = null;
  for (const m of modules) {
    if (path === m || path.startsWith(`${m}/`)) {
      if (best === null || m.length > best.length) best = m;
    }
  }
  return best;
}

export type Tone = 'signal' | 'warn' | 'alert' | 'muted' | 'moon';

export interface Kpi {
  key: string;
  label: string;
  /** Pre-formatted display value (e.g. "38%", "7"). */
  value: string;
  hint: string;
  tone: Tone;
}

/** Coverage of a module as a 0..1 fraction: certified/(certified+1), saturating. */
export function coverageOf(m: MapModule): number {
  return m.certifiedFacts <= 0 ? 0 : m.certifiedFacts / (m.certifiedFacts + 1);
}

/** How brightly a tile reads - the visual coverage ramp. */
export type CoverageBucket = 'dark' | 'thin' | 'partial' | 'understood';

export function coverageBucket(m: MapModule): CoverageBucket {
  if (m.dark || m.certifiedFacts <= 0) return 'dark';
  if (m.certifiedFacts === 1) return 'thin';
  if (m.certifiedFacts <= 3) return 'partial';
  return 'understood';
}

/**
 * The two-light grammar (21a, D2): a module with no *vouched* meaning but with a
 * machine-described layer glows **moonlight** rather than sitting truly dark.
 * Phosphor (certified) always wins; moonlight fills the rest of the map so the
 * first-run experience is a lit atlas, not a black homework queue.
 */
export function isMoonlit(m: MapModule): boolean {
  return m.certifiedFacts <= 0 && (m.described ?? false);
}

/** Worded confidence (D7): tiers are named, never numbered. */
export function confidenceLabel(slug: string): string {
  switch (slug) {
    case 'read-from-code':
      return 'read from code';
    case 'inferred':
      return 'inferred';
    case 'uncertain':
      return 'uncertain';
    default:
      return slug;
  }
}

/**
 * The four header stats (D11: honest KPIs). The trust number and the machine
 * number are separate readouts on separate lights - "% described" must never
 * inflate "% vouched", or the day the machine lights everything the top bar
 * becomes a lie. A third D11 readout (disagreements) arrives with T22.
 */
export function kpis(feed: MapFeed): Kpi[] {
  const mods = feed.modules;
  const total = mods.length;
  const dark = mods.filter((m) => m.dark);

  const totalChurn = sum(mods.map((m) => m.churn));
  // Vouched: churn-weighted *depth* of certified coverage. Depth (coverageOf,
  // saturating) rather than a has-any-fact bit, so one lucky fact cannot claim
  // a whole module. Churn-weighted so the number reflects *active* code; falls
  // back to a plain module average when there is no churn signal at all.
  const vouchedPct =
    totalChurn > 0
      ? sum(mods.map((m) => m.churn * coverageOf(m))) / totalChurn
      : total > 0
        ? sum(mods.map(coverageOf)) / total
        : 0;

  // Described: the machine layer's reach - the moonlight number, worded and
  // toned apart from trust.
  const described = mods.filter((m) => m.described ?? false);
  const describedChurn = sum(described.map((m) => m.churn));
  const describedPct =
    totalChurn > 0 ? describedChurn / totalChurn : total > 0 ? described.length / total : 0;

  const staleFacts = sum(mods.map((m) => m.staleFacts));

  // Is the single busiest module also unexplained? That's the sharpest signal.
  const busiest = [...mods].sort((a, b) => b.churn - a.churn)[0];
  const busiestDark = busiest ? busiest.dark && busiest.churn > 0 : false;

  return [
    {
      key: 'vouched',
      label: KPI.vouched,
      value: `${Math.round(vouchedPct * 100)}%`,
      hint: KPI.vouchedHint,
      tone: vouchedPct >= 0.66 ? 'signal' : vouchedPct >= 0.33 ? 'warn' : 'alert',
    },
    {
      key: 'described',
      label: KPI.described,
      value: `${Math.round(describedPct * 100)}%`,
      hint: KPI.describedHint,
      tone: describedPct > 0 ? 'moon' : 'muted',
    },
    {
      key: 'dark',
      label: KPI.darkZones,
      value: String(dark.length),
      hint: busiestDark ? 'incl. the busiest module' : KPI.darkZonesHint,
      tone: dark.length === 0 ? 'signal' : busiestDark ? 'alert' : 'warn',
    },
    {
      key: 'stale',
      label: KPI.stale,
      value: String(staleFacts),
      hint: KPI.staleHint,
      tone: staleFacts > 0 ? 'warn' : 'muted',
    },
  ];
}

// ── the atlas layout ──────────────────────────────────────────────────────────

/** Pixels reserved for a province's name row inside its border. */
export const PROVINCE_HEADER = 22;
/** Breathing room between a province border and its tiles / between provinces. */
export const PROVINCE_PAD = 3;

export interface ModuleTilePlacement {
  module: MapModule;
  rect: TreemapRect;
}

export interface ProvincePlacement {
  area: MapArea;
  rect: TreemapRect;
  /** False for a default one-module-named-after-itself area - drawn borderless. */
  grouped: boolean;
  tiles: ModuleTilePlacement[];
}

/**
 * The whole terrain: areas laid out as provinces (area ∝ Σ module weight),
 * modules squarified inside each. Weight = churn + a floor, so busy code earns
 * space but idle modules stay visible. Solo default areas (one module named
 * after itself) draw as bare tiles - no double label, no border noise.
 */
export function atlasLayout(feed: MapFeed, width: number, height: number): ProvincePlacement[] {
  const byName = new Map(feed.modules.map((m) => [m.module, m]));
  const maxChurn = feed.modules.reduce((t, m) => Math.max(t, m.churn), 0);
  const floor = Math.max(1, Math.ceil(maxChurn * 0.05));
  const weight = (name: string) => (byName.get(name)?.churn ?? 0) + floor;

  const areas = feed.areas.filter((a) => a.modules.length > 0);
  const level1 = treemap(
    areas.map((a) => ({ key: a.area, value: sum(a.modules.map(weight)) })),
    0,
    0,
    width,
    height,
  );
  const rectByArea = new Map(level1.map((r) => [r.key, r]));

  const provinces: ProvincePlacement[] = [];
  for (const area of areas) {
    const rect = rectByArea.get(area.area);
    if (!rect) continue;
    const grouped = area.modules.length > 1 || area.modules[0] !== area.area;

    const inset = grouped
      ? {
          x: rect.x + PROVINCE_PAD,
          y: rect.y + PROVINCE_HEADER,
          w: rect.w - PROVINCE_PAD * 2,
          h: rect.h - PROVINCE_HEADER - PROVINCE_PAD,
        }
      : {
          x: rect.x + PROVINCE_PAD,
          y: rect.y + PROVINCE_PAD,
          w: rect.w - PROVINCE_PAD * 2,
          h: rect.h - PROVINCE_PAD * 2,
        };

    const inner = treemap(
      area.modules.map((m) => ({ key: m, value: weight(m) })),
      inset.x,
      inset.y,
      Math.max(0, inset.w),
      Math.max(0, inset.h),
    );

    provinces.push({
      area,
      rect,
      grouped,
      tiles: inner.flatMap((r) => {
        const m = byName.get(r.key);
        return m ? [{ module: m, rect: r }] : [];
      }),
    });
  }
  return provinces;
}

// ── flow routes (drawn linkage; the board draws them since 23a′) ─────────────

/** A stop on a flow's route: a module plus the 1-based steps it performs
 * (consecutive same-module steps collapse into one station). */
export interface FlowStation {
  module: string;
  steps: number[];
}

/** One step as the route card lists it - every step, linked or not. */
export interface FlowTraceStep {
  n: number;
  text: string;
  module: string | null;
}

export interface FlowTrace {
  id: string;
  name: string;
  status: string;
  linked: number;
  total: number;
  /** Ordered stations the route line runs through - linked steps only. */
  stations: FlowStation[];
  steps: FlowTraceStep[];
}

/**
 * A flow drawn as a route across the terrain: each linked step resolves its
 * pin to the module that owns it (a station); unlinked steps stay in the card
 * as honest gaps but draw nothing - the map never guesses.
 */
export function flowTrace(detail: FlowDetail, moduleNames: string[]): FlowTrace {
  const stations: FlowStation[] = [];
  const steps: FlowTraceStep[] = [];
  detail.steps.forEach((s, i) => {
    const n = i + 1;
    const path = s.pin ? (s.pin.symbol.split('#')[0] ?? '') : null;
    const module = path ? moduleOfPath(path, moduleNames) : null;
    steps.push({ n, text: s.on ? `on ${s.on} - ${s.do}` : s.do, module });
    if (module) {
      const last = stations[stations.length - 1];
      if (last && last.module === module) last.steps.push(n);
      else stations.push({ module, steps: [n] });
    }
  });
  return {
    id: detail.id,
    name: detail.name ?? detail.id,
    status: detail.status,
    linked: steps.filter((s) => s.module !== null).length,
    total: steps.length,
    stations,
    steps,
  };
}

// ── navigator / catalog derivations ──────────────────────────────────────────

export interface AreaStat {
  area: MapArea;
  churn: number;
  certified: number;
  stale: number;
  darkModules: number;
  /** Churn-weighted vouched depth within the area, 0..1 (same honesty rule as
   * the top bar: certified coverage, never the machine layer). */
  vouched: number;
}

export function areaStats(feed: MapFeed): AreaStat[] {
  const byName = new Map(feed.modules.map((m) => [m.module, m]));
  return feed.areas.map((area) => {
    const mods = area.modules.flatMap((m) => byName.get(m) ?? []);
    const churn = sum(mods.map((m) => m.churn));
    return {
      area,
      churn,
      certified: sum(mods.map((m) => m.certifiedFacts)),
      stale: sum(mods.map((m) => m.staleFacts)),
      darkModules: mods.filter((m) => m.dark).length,
      vouched:
        churn > 0
          ? sum(mods.map((m) => m.churn * coverageOf(m))) / churn
          : mods.length > 0
            ? sum(mods.map(coverageOf)) / mods.length
            : 0,
    };
  });
}

export interface CapabilityEntry {
  ref: CapabilityRef;
  name: string;
  status: string;
  modules: string[];
  /** Concept: ordered state names. Flow: absent. */
  states?: string[];
  /** Flow: step counts. Concept: absent. */
  steps?: { total: number; linked: number };
}

/** Every capability, normalized for cards and nav lists, stable order. */
export function capabilityEntries(catalog: Catalog): CapabilityEntry[] {
  const concepts = catalog.concepts.map<CapabilityEntry>((c) => ({
    ref: { kind: 'concept', id: c.id },
    name: c.name ?? c.id,
    status: c.status,
    modules: c.modules,
    states: c.states,
  }));
  const flows = catalog.flows.map<CapabilityEntry>((f) => ({
    ref: { kind: 'flow', id: f.id },
    name: f.name ?? f.id,
    status: f.status,
    modules: f.modules,
    steps: { total: f.steps, linked: f.linked },
  }));
  return [...concepts, ...flows].sort(
    (a, b) => a.name.localeCompare(b.name) || a.ref.id.localeCompare(b.ref.id),
  );
}

/**
 * Group capabilities under the areas whose modules they touch - the "one
 * section per part of the product" reading. A capability spanning several
 * areas appears under each (it genuinely belongs to both); one touching no
 * mapped module lands under `null` (unplaced).
 */
export function capabilitiesByArea(
  catalog: Catalog,
  areas: MapArea[],
): Array<{ area: MapArea | null; entries: CapabilityEntry[] }> {
  const entries = capabilityEntries(catalog);
  const areaOfModule = new Map<string, MapArea[]>();
  for (const a of areas)
    for (const m of a.modules) {
      const list = areaOfModule.get(m) ?? [];
      list.push(a);
      areaOfModule.set(m, list);
    }

  const grouped = new Map<string, CapabilityEntry[]>();
  const unplaced: CapabilityEntry[] = [];
  for (const e of entries) {
    const touched = new Set<MapArea>();
    for (const m of e.modules) for (const a of areaOfModule.get(m) ?? []) touched.add(a);
    if (touched.size === 0) {
      unplaced.push(e);
      continue;
    }
    for (const a of touched) {
      const list = grouped.get(a.area) ?? [];
      list.push(e);
      grouped.set(a.area, list);
    }
  }

  const out: Array<{ area: MapArea | null; entries: CapabilityEntry[] }> = [];
  for (const a of areas) {
    const list = grouped.get(a.area);
    if (list && list.length > 0) out.push({ area: a, entries: list });
  }
  if (unplaced.length > 0) out.push({ area: null, entries: unplaced });
  return out;
}

/** One capability as a board box lists it: product name + standing chalk. */
export interface ModuleCapability {
  id: string;
  kind: 'concept' | 'flow';
  name: string;
  /** certified / proposed / stale for vouched work; `described` for moonlight. */
  standing: string;
}

/**
 * What each module *carries*, in product language - the board's chalk notes.
 * Vouched capabilities first (the trust ladder's order), then machine-described
 * ones; both name things a PM would say, never ids. This is the linkage the
 * board exists to show, and the list 21b's synthesis makes richer.
 */
export function capabilitiesByModule(catalog: Catalog): Map<string, ModuleCapability[]> {
  const out = new Map<string, ModuleCapability[]>();
  const add = (module: string | null, cap: ModuleCapability) => {
    if (!module) return;
    const list = out.get(module) ?? [];
    list.push(cap);
    out.set(module, list);
  };
  for (const e of capabilityEntries(catalog))
    for (const m of e.modules)
      add(m, { id: e.ref.id, kind: e.ref.kind, name: e.name, standing: e.status });
  for (const c of catalog.inferredConcepts ?? [])
    add(c.module, { id: c.id, kind: 'concept', name: c.name, standing: 'described' });
  for (const f of catalog.inferredFlows ?? [])
    add(f.module, { id: f.id, kind: 'flow', name: f.name, standing: 'described' });
  return out;
}

/** id → display name for concepts/flows (and inferred concepts), so `related`
 * lists and breadcrumbs read as product language rather than raw ids. */
export function capabilityNames(catalog: Catalog): Map<string, string> {
  const names = new Map<string, string>();
  for (const c of catalog.concepts) names.set(c.id, c.name ?? c.id);
  for (const f of catalog.flows) names.set(f.id, f.name ?? f.id);
  for (const c of catalog.inferredConcepts ?? []) names.set(c.id, c.name);
  for (const f of catalog.inferredFlows ?? []) names.set(f.id, f.name);
  return names;
}

function sum(ns: number[]): number {
  let t = 0;
  for (const n of ns) t += n;
  return t;
}
