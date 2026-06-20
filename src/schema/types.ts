// The single source of truth in code for the `.artha/` data model. Mirrors
// design/schema-v0.1.md §2/§4/§5/§9 exactly. Frozen for v0.1.

export type Kind = 'decision' | 'invariant' | 'convention';
export type Status = 'proposed' | 'certified' | 'stale';
export type Severity = 'high' | 'medium' | 'low';
export type DetectMethod = 'structural' | 'type' | 'llm';

/** A link from a fact to a structural symbol (§4). `content_hash` is filled by `artha build`. */
export interface Pin {
  /** Human/miner-written ref: `‹repo-relative-path›#‹qualified-name›`. */
  symbol: string;
  /** Truncated SHA-256 of the pinned span; written by build, blank on new pins. */
  content_hash?: string;
}

/** Where a mined entry came from (§2). Absent on hand-written entries. */
export interface Provenance {
  pr?: string;
  commit?: string;
  source?: string;
}

/** Executable rule for the v0.3 checker (§5.4). Stored verbatim in v0.1. */
export interface Detect {
  method: DetectMethod;
  query?: string;
  ts_predicate?: string;
  prompt_hint?: string;
  confidence_min?: number;
  advisory?: boolean;
}

/** Fields common to every kind (§2). */
export interface BaseEntry {
  id: string;
  status: Status;
  certified_by?: string;
  certified_at?: string;
  pins?: Pin[];
  mined_from?: Provenance;
  related?: string[];
  tags?: string[];
  /**
   * Absolute path of the `.artha/*.yaml` this entry was loaded from. Populated
   * by the loader at read time; never part of the schema and never written
   * back to disk by the dumper.
   */
  source_path?: string;
}

/** §5.1 — the miner's primary output: the *why*. */
export interface Decision extends BaseEntry {
  kind: 'decision';
  title: string;
  context: string;
  decision: string;
  consequences?: string;
  supersedes?: string | null;
}

/** §5.2 — a rule that must always hold. */
export interface Invariant extends BaseEntry {
  kind: 'invariant';
  name: string;
  rule: string;
  scope: string[];
  why?: string | null;
  severity?: Severity;
  detect?: Detect;
}

/** §5.3 — the unwritten "how we do things here." */
export interface Convention extends BaseEntry {
  kind: 'convention';
  name: string;
  rule: string;
  scope: string[];
  example_good?: string | null;
  example_bad?: string | null;
}

/** Discriminated union keyed on `kind`. */
export type ArthaEntry = Decision | Invariant | Convention;
