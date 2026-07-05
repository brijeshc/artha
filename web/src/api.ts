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
  /** Machine-described meaning exists here (21a) → the tile glows moonlight even
   * before anyone vouches. Optional so a pre-21a index still types. */
  described?: boolean;
  /** Inferred state-machine candidates in this module (21a). */
  inferredConcepts?: number;
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

/** A machine-described state-machine candidate (21a) for the catalog. Carries a
 * worded `confidence` in place of a status - described, not vouched. */
export interface InferredCatalogConcept {
  id: string;
  name: string;
  module: string | null;
  states: string[];
  confidence: string;
}

export interface Catalog {
  concepts: CatalogConcept[];
  flows: CatalogFlow[];
  /** Machine-described capabilities (21a), rendered in moonlight. Optional for a pre-21a index. */
  inferredConcepts?: InferredCatalogConcept[];
}

/** One inferred fact (21a) as the dashboard reads it: a module card or a
 * state-machine candidate, its worded confidence, states read from code, and
 * the evidence pins that back it. */
export interface InferredFactView {
  id: string;
  kind: string;
  module: string | null;
  name: string;
  summary: string | null;
  confidence: string;
  states: string[];
  pins: PinView[];
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

/** A structural link to another module (T17b), with how many imports back it. */
export interface RefLink {
  module: string;
  count: number;
}

/** One directed module→module import edge (T17b). */
export interface RefEdge {
  from_module: string;
  to_module: string;
  count: number;
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
  /** Modules this one imports from (most-coupled first). */
  dependsOn: RefLink[];
  /** Modules that import this one (most-coupled first). */
  usedBy: RefLink[];
  /** The module's machine-described card (21a) - the moonlight lead prose. */
  card?: InferredFactView | null;
  /** Inferred state-machine candidates whose evidence lands in this module (21a). */
  inferredConcepts?: InferredFactView[];
}

/** A machine-proposed pin (T17b): a resolvable symbol, ranked, with a plain why. */
export interface Suggestion {
  /** The pin ref, guaranteed resolvable: `src/billing/Money.ts#Money`. */
  ref: string;
  name: string;
  path: string;
  kind: string;
  /** referenced by pinned code · name match · related meaning. */
  why: string;
  score: number;
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

/** One inferred fact (21a) - a module card or state-machine candidate - in moonlight. */
export function getInferred(id: string): Promise<InferredFactView> {
  return getJson<InferredFactView>(`api/inferred/${encodeURIComponent(id)}`);
}

/** The whole module reference graph (T17b) - the atlas outlines a tile's neighbours from it. */
export function getRefs(): Promise<RefEdge[]> {
  return getJson<RefEdge[]>('api/refs');
}

/** Ranked, explainable pin suggestions for an entry (T17b); confirm one via linkPin. */
export function getSuggest(id: string): Promise<Suggestion[]> {
  return getJson<Suggestion[]>(`api/suggest?id=${encodeURIComponent(id)}`);
}

export function getSearch(query: string): Promise<SearchHit[]> {
  return getJson<SearchHit[]>(`api/search?q=${encodeURIComponent(query)}`);
}

/** One symbol candidate for the link picker (T17). */
export interface SymbolHit {
  /** The pin ref: `src/billing/Money.ts#Money`. */
  ref: string;
  name: string;
  path: string;
  kind: string;
}

/** Search the repo's resolvable symbols (name or path) for the link picker. */
export function getSymbols(query: string): Promise<SymbolHit[]> {
  return getJson<SymbolHit[]>(`api/symbols?q=${encodeURIComponent(query)}`);
}

// ── curation writes (T17) ───────────────────────────────────────────────────
// Each POST mutates one `.artha/*.yaml` (a git diff) and rebuilds the index, so
// the very next read reflects it. The server rolls a bad write back; on failure
// these throw the server's message so the UI can surface it inline.

/** What a successful mutation reports back. `staled` names entries the rebuild
 * flipped to `stale` (their pinned code had drifted). */
export interface WriteResult {
  ok: true;
  id: string;
  status: string;
  created: boolean;
  staled: string[];
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data as { error?: string }).error;
    throw new Error(message ?? `POST ${path} → ${res.status}`);
  }
  return data as T;
}

/** Certify an entry - the one path to `certified` (never auto-certify). */
export function certify(id: string): Promise<WriteResult> {
  return postJson<WriteResult>('api/certify', { id });
}

/** Link an entry to a `path#Symbol`; the server refuses an unresolvable ref. */
export function linkPin(id: string, symbol: string): Promise<WriteResult> {
  return postJson<WriteResult>('api/pin', { id, symbol });
}

/** Upsert an entry's fields (merged over the existing entry); edits un-certify. */
export function saveEntry(patch: { id: string } & Record<string, unknown>): Promise<WriteResult> {
  return postJson<WriteResult>('api/entry', patch);
}
