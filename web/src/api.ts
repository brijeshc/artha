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
  /** The module card's plain-language description (21a) - the board's chalk
   * caption, and the slot 21b's LLM synthesis enriches. */
  describedAs?: string | null;
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

/** A related entry with its display name resolved server-side (24g). */
export interface RelatedRef {
  id: string;
  name: string | null;
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
  related: RelatedRef[];
  modules: string[];
  /** The human delta band (D6): what the code can't say; null until written. */
  notes: string | null;
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
  related: RelatedRef[];
  modules: string[];
  /** The human delta band (D6): what the code can't say; null until written. */
  notes: string | null;
}

export interface SearchHit {
  id: string;
  kind: string;
  heading: string | null;
  status: string;
  score: number;
  /** The module a rule/decision hit opens (24d); null when it touches none. */
  module?: string | null;
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

/** A machine-described flow skeleton (21a) for the catalog - its fan-out preview. */
export interface InferredCatalogFlow {
  id: string;
  name: string;
  module: string | null;
  steps: string[];
  confidence: string;
}

export interface Catalog {
  concepts: CatalogConcept[];
  flows: CatalogFlow[];
  /** Machine-described concepts (21a), rendered in moonlight. Optional for a pre-21a index. */
  inferredConcepts?: InferredCatalogConcept[];
  /** Machine-described flow skeletons (21a), moonlight. Optional for a pre-21a index. */
  inferredFlows?: InferredCatalogFlow[];
}

/** One step of an inferred flow skeleton (21a): a downstream area, linking to its
 * module. `note` is the synthesized one-line description of what the flow does
 * there (21b-2), null until `artha infer` fills it. */
export interface InferredStepView {
  label: string;
  module: string | null;
  note?: string | null;
}

/** One inferred fact (21a) as the dashboard reads it: a module card, a
 * state-machine candidate, a flow skeleton, or a naming convention - its worded
 * confidence, what was read from code, and the evidence pins that back it. */
export interface InferredFactView {
  id: string;
  kind: string;
  module: string | null;
  name: string;
  summary: string | null;
  confidence: string;
  states: string[];
  /** Ordered fan-out steps (flow kind); empty otherwise. Optional for a pre-slice-2 index. */
  steps?: InferredStepView[];
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
  /** Inferred flow skeletons entered from this module (21a). */
  inferredFlows?: InferredFactView[];
  /** Inferred naming conventions this module repeats (21a). */
  inferredConventions?: InferredFactView[];
}

/** A fact pinned into one source file - the meaning that lights its inner-board box. */
export interface ModuleBoardFileFact {
  id: string;
  kind: string;
  name: string | null;
  status: string;
}

/** One source file on a module's inner board (23b): a chalk box lit by its pins. */
export interface ModuleBoardFile {
  path: string;
  name: string;
  facts: ModuleBoardFileFact[];
}

/** A file→file import that stays inside the module (both endpoints local). */
export interface ModuleBoardEdge {
  from: string;
  to: string;
}

/** The inner board of one module (23b): its files as boxes, imports as arrows. */
export interface ModuleBoardData {
  module: string;
  files: ModuleBoardFile[];
  edges: ModuleBoardEdge[];
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

/** One certification event (23c) - a fact that reached `certified`, dated to
 * when it was vouched. The observatory accumulates these into the burn-up. */
export interface VouchedPoint {
  /** `certified_at` - a `YYYY-MM-DD` date. */
  at: string;
  id: string;
  kind: string;
  name: string | null;
}

/** Ranked dark-zone (the darkness score, T13). `score` lower = darker. */
export interface RankedModule {
  module: string;
  score: number;
  churn: number;
  coverage: number;
  freshness: number;
  certifiedFacts: number;
  staleFacts: number;
}

/** A module in the value-ranked ask queue (D10): where explaining pays off next,
 * with the three factors exposed so the row can word its "why now". */
export interface ValueRanked extends RankedModule {
  /** Agent-consumption proxy: how many modules import this one (reference in-degree). */
  reach: number;
  /** Uncertainty ∈ (0,1]: 1 - vouched depth; a dark module ~1, a vouched one ~0. */
  uncertainty: number;
  /** The value score = (1 + reach) × (1 + churn) × uncertainty; higher = sooner. */
  value: number;
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

/** The value-ranked ask queue (D10): where explaining pays off next, each row
 * carrying the reach/churn/uncertainty factors its "why now" is worded from. */
export function getValueQueue(): Promise<ValueRanked[]> {
  return getJson<ValueRanked[]>('api/value-queue');
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

/** A module's inner board (23b) - its files, their imports, and what pins light them. */
export function getModuleBoard(id: string): Promise<ModuleBoardData> {
  return getJson<ModuleBoardData>(`api/module-board/${encodeURIComponent(id)}`);
}

/** One inferred fact (21a) - a module card or state-machine candidate - in moonlight. */
export function getInferred(id: string): Promise<InferredFactView> {
  return getJson<InferredFactView>(`api/inferred/${encodeURIComponent(id)}`);
}

/** The whole module reference graph (T17b) - the atlas outlines a tile's neighbours from it. */
export function getRefs(): Promise<RefEdge[]> {
  return getJson<RefEdge[]>('api/refs');
}

/** Every certified fact as a dated point (23c) - the vouched burn-up's raw series. */
export function getVouchedHistory(): Promise<VouchedPoint[]> {
  return getJson<VouchedPoint[]>('api/vouched-history');
}

/** module → where the team agreed it sits on the board (23e), from
 * `.artha/board.yaml`; `{}` when the team has never committed one. */
export type BoardSeats = Record<string, { x: number; y: number }>;

export function getBoardLayout(): Promise<{ modules: BoardSeats }> {
  return getJson<{ modules: BoardSeats }>('api/board-layout');
}

/** Commit this arrangement as the team's (23e). An empty map clears the file. */
export function saveBoardLayout(modules: BoardSeats): Promise<{ ok: true; modules: BoardSeats }> {
  return postJson<{ ok: true; modules: BoardSeats }>('api/board-layout', { modules });
}

/** Ranked, explainable pin suggestions for an entry (T17b); confirm one via linkPin. */
export function getSuggest(id: string): Promise<Suggestion[]> {
  return getJson<Suggestion[]>(`api/suggest?id=${encodeURIComponent(id)}`);
}

/** The source lines a pin (`path#Symbol`) was read from (D5) - revealed on click
 * under an evidence chip so no machine claim is an unexplained assertion. */
export interface EvidenceView {
  ref: string;
  symbol: string;
  path: string;
  startLine: number;
  endLine: number;
  lines: string[];
  /** How many lines of the symbol were omitted by the length cap (0 when none). */
  truncated: number;
}

/** Resolve a pin ref to its backing source lines; the server 404s a ref that no
 * longer resolves (drifted code), which the reveal surfaces honestly. */
export function getEvidence(ref: string): Promise<EvidenceView> {
  return getJson<EvidenceView>(`api/evidence?ref=${encodeURIComponent(ref)}`);
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

/** Record the delta band (D6) - "what the code can't say" - as human ink. Additive:
 * unlike saveEntry, recording the delta never re-opens a certification. An empty
 * string clears it. */
export function saveNotes(id: string, notes: string): Promise<WriteResult> {
  return postJson<WriteResult>('api/notes', { id, notes });
}
