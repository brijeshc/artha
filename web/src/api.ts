// Thin typed client for the read API (src/serve/api.ts). The dashboard is
// read-only in T15/T16; write-back lands in T17. Types here mirror the server's
// response shapes exactly — the API is the contract between the two.

export interface MapModule {
  module: string;
  dark: boolean;
  churn: number;
  certifiedFacts: number;
  staleFacts: number;
  score: number;
}

export interface MapArea {
  area: string;
  modules: string[];
  concepts: string[];
  flows: string[];
  dark: boolean;
}

export interface MapFeed {
  areas: MapArea[];
  modules: MapModule[];
  cold: boolean;
}

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

export interface SearchHit {
  id: string;
  kind: string;
  heading: string | null;
  status: string;
  score: number;
}

export interface CatalogConcept {
  id: string;
  name: string | null;
  status: string;
  modules: string[];
  /** Ordered state names — the card's state-chain preview. */
  states: string[];
}

export interface CatalogFlow {
  id: string;
  name: string | null;
  status: string;
  modules: string[];
  steps: number;
  /** Steps with a resolved pin (the rest are "not yet linked"). */
  linked: number;
}

export interface Catalog {
  concepts: CatalogConcept[];
  flows: CatalogFlow[];
}

/** One fact as it touches a module: what it is, its standing, and the join. */
export interface ModuleFact {
  id: string;
  kind: string;
  name: string | null;
  status: string;
  body: string | null;
  symbols: string[];
  stalePins: number;
  viaScope: boolean;
}

/** The engineer lens: everything that governs one code module. */
export interface ModuleDetail {
  module: string;
  areas: string[];
  dark: boolean;
  churn: number;
  score: number;
  certifiedFacts: number;
  staleFacts: number;
  queueRank: number | null;
  concepts: ModuleFact[];
  flows: ModuleFact[];
  rules: ModuleFact[];
  decisions: ModuleFact[];
}

/** Ranked dark-zone (the ask-queue, T13). `score` lower = darker. */
export interface RankedModule {
  module: string;
  score: number;
  churn: number;
  coverage: number;
  freshness: number;
  certifiedFacts: number;
  staleFacts: number;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export function getMap(): Promise<MapFeed> {
  return getJson<MapFeed>('api/map');
}

export function getDarkZones(): Promise<RankedModule[]> {
  return getJson<RankedModule[]>('api/dark-zones');
}

export function getCatalog(): Promise<Catalog> {
  return getJson<Catalog>('api/catalog');
}

export function getConcept(id: string): Promise<ConceptDetail> {
  return getJson<ConceptDetail>(`api/concept/${encodeURIComponent(id)}`);
}

export function getFlow(id: string): Promise<FlowDetail> {
  return getJson<FlowDetail>(`api/flow/${encodeURIComponent(id)}`);
}

export function getModule(id: string): Promise<ModuleDetail> {
  return getJson<ModuleDetail>(`api/module/${encodeURIComponent(id)}`);
}

export function getSearch(query: string): Promise<SearchHit[]> {
  return getJson<SearchHit[]>(`api/search?q=${encodeURIComponent(query)}`);
}
