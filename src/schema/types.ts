// The single source of truth in code for the `.artha/` data model. Mirrors
// design/schema-v0.1.md §2/§4/§5/§9 (frozen v0.1 base) and design/schema-v0.2.md
// §3/§4/§7 (the additive `concept` + `flow` kinds).

export type Kind = 'decision' | 'invariant' | 'convention' | 'concept' | 'flow';
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
   * Provenance for an entry that began as a machine inference (21a) and was
   * materialized into `.artha/` YAML when a human vouched/edited it (OQ-A).
   * `inferred@<hash>` records the content hash of the code span the machine read
   * its description from, so a later reader can tell whether the code has drifted
   * since it was vouched. Absent on hand-written and mined entries.
   */
  derived_from?: string;
  /**
   * The delta band (D6): human ink over machine print. Free-prose the *code
   * cannot hold* - business rules, constraints, history, the warning someone
   * left - kept apart from the machine-read `summary`/`states` so the reader can
   * always tell which is which. Purely additive: unlike an `edit`, recording the
   * delta never re-opens a certification (the vouched claim is unchanged; this is
   * knowledge layered on top). Absent until a human writes it.
   */
  notes?: string;
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

/** schema-v0.2 §3 — one node in a concept's state machine. `effect`/`invariant`
 * are free-text intent (the meaning not in the TS types), not cross-refs. */
export interface State {
  name: string;
  effect?: string;
  invariant?: string;
}

/** schema-v0.2 §3 — one edge in a concept's state machine. */
export interface Transition {
  from: string;
  to: string;
  trigger: string;
}

/** schema-v0.2 §3 — a domain capability with its state machine. */
export interface Concept extends BaseEntry {
  kind: 'concept';
  name: string;
  summary: string;
  states?: State[];
  transitions?: Transition[];
}

/** schema-v0.2 §4 — one ordered step in a flow. `pin: null` is valid in v0.2
 * (a known-but-not-yet-linked step; coverage is a v0.3 check). */
export interface FlowStep {
  /** The trigger/condition for this step, if any. */
  on?: string;
  /** What happens at this step. */
  do: string;
  /** The symbol implementing the step; `null` when not yet linked. */
  pin?: Pin | null;
}

/** schema-v0.2 §4 — a cross-cutting sequence spanning services. */
export interface Flow extends BaseEntry {
  kind: 'flow';
  name: string;
  summary: string;
  steps?: FlowStep[];
  /** Entry-point symbol(s) for the flow. */
  entry?: Pin[];
}

/** Discriminated union keyed on `kind`. */
export type ArthaEntry = Decision | Invariant | Convention | Concept | Flow;
