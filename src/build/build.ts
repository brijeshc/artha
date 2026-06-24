import { existsSync, globSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ArthaConfig } from '../config/config';
import type { ResolvedSymbol } from '../resolver/SymbolResolver';
import { createTreeSitterResolver } from '../resolver/treeSitterResolver';
import { loadEntries, writeEntry } from '../schema/load';
import type { ArthaEntry, Pin } from '../schema/types';
import {
  type DetectRow,
  type FactRow,
  type FlowStepRow,
  type IndexData,
  type PinRow,
  type ProvenanceRow,
  type RelatedRow,
  type ScopeRow,
  type StateRow,
  type TransitionRow,
  writeIndex,
} from './db';

export interface BuildReport {
  /** Fatal problems; a non-empty list means the build failed and emitted nothing. */
  errors: string[];
  warnings: string[];
  /** Ids of certified entries flipped to `stale` this build. */
  staled: string[];
  /** Number of facts written to the index. */
  emitted: number;
  dbPath: string;
}

export interface BuildOptions {
  /** Override the output path (default `.artha/index.db`). */
  dbPath?: string;
}

/**
 * Compile `.artha/` YAML into the SQLite + FTS5 index (schema §8). Runs fully
 * offline. Pin-resolution errors fail the build *before* anything is written;
 * staleness flips are written back to disk so they show in git.
 */
export async function buildIndex(
  repoRoot: string,
  config: ArthaConfig,
  options: BuildOptions = {},
): Promise<BuildReport> {
  const arthaDir = join(repoRoot, '.artha');
  const dbPath = options.dbPath ?? join(arthaDir, 'index.db');
  const report: BuildReport = { errors: [], warnings: [], staled: [], emitted: 0, dbPath };

  // 1–3. Load + schema/id/certification validation (T02). Hard failures here
  // abort the build without touching disk.
  let entries: ArthaEntry[];
  try {
    entries = loadEntries(arthaDir).entries;
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    return report;
  }

  // 4. Pin resolution (ERROR). Resolve everything first; any miss fails the
  // build before we write hashes or staleness back to disk. A flow's `entry`
  // and per-step `pin`s resolve through the same mechanism as base `pins`.
  const resolved = new Map<Pin, ResolvedSymbol>();
  const pinnedEntries = entries.filter((entry) => collectPins(entry).length > 0);
  if (pinnedEntries.length > 0) {
    const resolver = await createTreeSitterResolver(repoRoot);
    for (const entry of pinnedEntries) {
      for (const pin of collectPins(entry)) {
        const hit = resolver.resolve(pin.symbol);
        if (hit) {
          resolved.set(pin, hit);
        } else {
          report.errors.push(
            `${entry.id} (${relPath(repoRoot, entry.source_path)}): unresolvable pin '${pin.symbol}'`,
          );
        }
      }
    }
  }
  if (report.errors.length > 0) return report;

  // 5. Hash + staleness. Recompute each pin's hash, fill blanks, and flip a
  // certified entry to `stale` if a pinned symbol's hash changed.
  for (const entry of pinnedEntries) {
    let modified = false;
    let drifted = false;
    for (const pin of collectPins(entry)) {
      const hit = resolved.get(pin);
      if (!hit) continue;
      const previous = pin.content_hash;
      if (entry.status === 'certified' && previous && previous !== hit.contentHash) {
        drifted = true;
      }
      if (previous !== hit.contentHash) {
        pin.content_hash = hit.contentHash;
        modified = true;
      }
    }
    if (drifted) {
      entry.status = 'stale';
      report.staled.push(entry.id);
      modified = true;
    }
    if (modified && entry.source_path) {
      writeEntry(entry, entry.source_path);
    }
  }

  // 6–8 + emit.
  const data = toIndexData(entries, resolved, config, repoRoot, report);
  writeIndex(dbPath, data);
  report.emitted = data.facts.length;
  return report;
}

function toIndexData(
  entries: ArthaEntry[],
  resolved: Map<Pin, ResolvedSymbol>,
  config: ArthaConfig,
  repoRoot: string,
  report: BuildReport,
): IndexData {
  const ids = new Set(entries.map((entry) => entry.id));
  const facts: FactRow[] = [];
  const pins: PinRow[] = [];
  const scopeFiles: ScopeRow[] = [];
  const related: RelatedRow[] = [];
  const provenance: ProvenanceRow[] = [];
  const detect: DetectRow[] = [];
  const states: StateRow[] = [];
  const transitions: TransitionRow[] = [];
  const flowSteps: FlowStepRow[] = [];

  for (const entry of entries) {
    facts.push({
      id: entry.id,
      kind: entry.kind,
      status: entry.status,
      heading: entry.kind === 'decision' ? entry.title : entry.name,
      body: bodyText(entry),
      severity: entry.kind === 'invariant' ? (entry.severity ?? config.defaultSeverity) : null,
      why: entry.kind === 'invariant' ? (entry.why ?? null) : null,
      supersedes: entry.kind === 'decision' ? (entry.supersedes ?? null) : null,
      certified_by: entry.certified_by ?? null,
      certified_at: entry.certified_at ?? null,
      source_path: relPath(repoRoot, entry.source_path),
    });

    // Every resolved pin — base `pins`, a flow's `entry`, and each flow step's
    // `pin` — lands in artha_pins, so the map's concept/flow↔code links and pin
    // staleness work uniformly across kinds.
    const isStale = entry.status === 'stale' ? 1 : 0;
    for (const pin of collectPins(entry)) {
      pins.push({
        fact_id: entry.id,
        symbol_id: resolved.get(pin)?.symbolId ?? null,
        symbol_ref: pin.symbol,
        content_hash: pin.content_hash ?? null,
        is_stale: isStale,
      });
    }

    for (const relatedId of entry.related ?? []) {
      related.push({ fact_id: entry.id, related_id: relatedId });
    }

    if (entry.mined_from) {
      const { pr, commit, source } = entry.mined_from;
      if (pr) provenance.push({ fact_id: entry.id, ref_kind: 'pr', ref: pr });
      if (commit) provenance.push({ fact_id: entry.id, ref_kind: 'commit', ref: commit });
      if (source) provenance.push({ fact_id: entry.id, ref_kind: 'source', ref: source });
    }

    if (entry.kind === 'invariant' && entry.detect) {
      detect.push({
        fact_id: entry.id,
        method: entry.detect.method,
        spec: JSON.stringify(entry.detect),
      });
    }

    // Concept state machine + flow sequence (schema-v0.2.md §6). `ord` preserves
    // the authored order so the dashboard renders states/steps as written.
    if (entry.kind === 'concept') {
      entry.states?.forEach((s, ord) => {
        states.push({
          fact_id: entry.id,
          name: s.name,
          effect: s.effect ?? null,
          invariant: s.invariant ?? null,
          ord,
        });
      });
      entry.transitions?.forEach((t, ord) => {
        transitions.push({
          fact_id: entry.id,
          from_state: t.from,
          to_state: t.to,
          trigger: t.trigger,
          ord,
        });
      });
    }

    if (entry.kind === 'flow') {
      entry.steps?.forEach((step, ord) => {
        flowSteps.push({
          fact_id: entry.id,
          on_event: step.on ?? null,
          do_action: step.do,
          pin_symbol_ref: step.pin?.symbol ?? null,
          ord,
        });
      });
    }

    // 6. Scope expansion (WARN) for invariants/conventions.
    if (entry.kind === 'invariant' || entry.kind === 'convention') {
      const matched = expandScope(entry.scope, repoRoot);
      if (matched.length === 0) {
        report.warnings.push(
          `${entry.id}: scope matched no files (check globs: ${entry.scope.join(', ')})`,
        );
      }
      for (const file of matched) scopeFiles.push({ fact_id: entry.id, file_path: file });
    }

    // 7. Reference resolution (WARN).
    for (const ref of referencesOf(entry)) {
      if (!ids.has(ref)) report.warnings.push(`${entry.id}: dangling reference '${ref}'`);
    }
  }

  return { facts, pins, scopeFiles, related, provenance, detect, states, transitions, flowSteps };
}

/**
 * Every pin an entry carries: base `pins` for all kinds, plus a flow's `entry`
 * points and each (non-null) `steps[].pin`. These are the actual Pin objects, so
 * resolution writes `content_hash` straight back onto them (and thus to disk).
 */
function collectPins(entry: ArthaEntry): Pin[] {
  const pins: Pin[] = [...(entry.pins ?? [])];
  if (entry.kind === 'flow') {
    pins.push(...(entry.entry ?? []));
    for (const step of entry.steps ?? []) {
      if (step.pin) pins.push(step.pin);
    }
  }
  return pins;
}

function expandScope(globs: string[], repoRoot: string): string[] {
  const matched = new Set<string>();
  for (const pattern of globs) {
    for (const hit of globSync(pattern, { cwd: repoRoot })) {
      const abs = join(repoRoot, hit);
      if (existsSync(abs) && statSync(abs).isFile()) {
        matched.add(hit.split('\\').join('/'));
      }
    }
  }
  return [...matched].sort();
}

/**
 * The retrieval body for FTS — the kind's primary prose. Concept/flow index on
 * their `summary`; their structured state machine / step tables are added by T12.
 */
function bodyText(entry: ArthaEntry): string {
  switch (entry.kind) {
    case 'decision':
      return entry.decision;
    case 'invariant':
    case 'convention':
      return entry.rule;
    case 'concept':
    case 'flow':
      return entry.summary;
  }
}

function referencesOf(entry: ArthaEntry): string[] {
  const refs = [...(entry.related ?? [])];
  if (entry.kind === 'decision' && entry.supersedes) refs.push(entry.supersedes);
  if (entry.kind === 'invariant' && entry.why) refs.push(entry.why);
  return refs;
}

function relPath(repoRoot: string, absPath: string | undefined): string | null {
  if (!absPath) return null;
  return relative(repoRoot, absPath).split('\\').join('/');
}
