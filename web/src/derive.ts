// Pure derivations over the read-API feeds - no React, no fetch - so they are
// trivially unit-testable and shared by the top bar, the navigator, the atlas,
// and the pages. The dashboard's whole job is turning these numbers into
// pixels; keeping the math here keeps the components about layout.

import type { Catalog, MapArea, MapFeed, MapModule } from './api';
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

/** `src/billing` → `billing` - the place-name a map tile is labelled with. */
export function shortName(module: string): string {
  const parts = module.split('/');
  return parts[parts.length - 1] || module;
}

export type Tone = 'signal' | 'warn' | 'alert' | 'muted';

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

/** The four header stats, derived entirely from the map feed (no extra fetch). */
export function kpis(feed: MapFeed): Kpi[] {
  const mods = feed.modules;
  const total = mods.length;
  const dark = mods.filter((m) => m.dark);
  const nonDark = total - dark.length;

  const totalChurn = sum(mods.map((m) => m.churn));
  const explainedChurn = sum(mods.filter((m) => !m.dark).map((m) => m.churn));
  // Churn-weighted so the number reflects *active* code, not idle folders.
  // Falls back to a plain module ratio when there is no churn signal at all.
  const explainedPct =
    totalChurn > 0 ? explainedChurn / totalChurn : total > 0 ? nonDark / total : 0;

  const staleFacts = sum(mods.map((m) => m.staleFacts));
  const certifiedFacts = sum(mods.map((m) => m.certifiedFacts));

  // Is the single busiest module also unexplained? That's the sharpest signal.
  const busiest = [...mods].sort((a, b) => b.churn - a.churn)[0];
  const busiestDark = busiest ? busiest.dark && busiest.churn > 0 : false;

  return [
    {
      key: 'explained',
      label: KPI.explained,
      value: `${Math.round(explainedPct * 100)}%`,
      hint: KPI.explainedHint,
      tone: explainedPct >= 0.66 ? 'signal' : explainedPct >= 0.33 ? 'warn' : 'alert',
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
    {
      key: 'certified',
      label: KPI.certified,
      value: String(certifiedFacts),
      hint: KPI.certifiedHint,
      tone: certifiedFacts > 0 ? 'signal' : 'muted',
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

// ── navigator / catalog derivations ──────────────────────────────────────────

export interface AreaStat {
  area: MapArea;
  churn: number;
  certified: number;
  stale: number;
  darkModules: number;
  /** Churn-weighted explained share within the area, 0..1. */
  explained: number;
}

export function areaStats(feed: MapFeed): AreaStat[] {
  const byName = new Map(feed.modules.map((m) => [m.module, m]));
  return feed.areas.map((area) => {
    const mods = area.modules.flatMap((m) => byName.get(m) ?? []);
    const churn = sum(mods.map((m) => m.churn));
    const explainedChurn = sum(mods.filter((m) => !m.dark).map((m) => m.churn));
    const nonDark = mods.filter((m) => !m.dark).length;
    return {
      area,
      churn,
      certified: sum(mods.map((m) => m.certifiedFacts)),
      stale: sum(mods.map((m) => m.staleFacts)),
      darkModules: mods.filter((m) => m.dark).length,
      explained: churn > 0 ? explainedChurn / churn : mods.length > 0 ? nonDark / mods.length : 0,
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

/** id → display name for concepts/flows, so `related` lists read as product language. */
export function capabilityNames(catalog: Catalog): Map<string, string> {
  const names = new Map<string, string>();
  for (const c of catalog.concepts) names.set(c.id, c.name ?? c.id);
  for (const f of catalog.flows) names.set(f.id, f.name ?? f.id);
  return names;
}

function sum(ns: number[]): number {
  let t = 0;
  for (const n of ns) t += n;
  return t;
}
