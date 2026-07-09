import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ArthaIndex } from '../mcp/query';
import { resolveIdentity } from '../review/actions';
import { loadEntries, writeEntry } from '../schema/load';
import type { ArthaEntry, Pin, State } from '../schema/types';
import { validateEntry } from '../schema/validate';
import { inferredDetail } from './api';
import type { WriteOutcome } from './write';

/**
 * Materialize-on-touch (OQ-A): when a human vouches or corrects an inferred
 * (moonlight) fact, turn that regenerable candidate into a real `.artha/` YAML
 * entry that enters the normal human lifecycle. The machine's reading becomes the
 * human's **starting draft** - states and summary read from code, provenance
 * recording the code it was read from - never authored from blank (D8). This is
 * what makes "reading is reviewing" (D9) writable: the vouch/edit affordance on
 * an inferred page rides the exact same certify/edit path a human fact uses,
 * once the fact exists on disk.
 *
 * Only **concepts and flows** materialize: both carry every field a human entry
 * requires (name + summary, from the inference). A module card has no human kind
 * to become, and a convention's whole point is a rule the code cannot state - so
 * those stay read-only moonlight until a later slice can ask for the missing part.
 *
 * Returns a {@link WriteOutcome} so it rides the same transactional `commitWrite`
 * as every other mutation - written, rebuilt, and rolled back on a bad build. On
 * the rebuild, the human entry pins the same code the candidate did, so the
 * inferred candidate is suppressed (materialize-on-touch) and never duplicated.
 */
export interface MaterializeOpts {
  /** Vouch: stamp the materialized entry `certified` (else it stays `proposed`). */
  certify?: boolean;
  /** Edit: override the machine's name/summary before writing (the correction path). */
  patch?: { name?: string; summary?: string };
  /** Injected so certify stamps are deterministic in tests. */
  now?: Date;
}

const KIND_DIR = { concept: 'concepts', flow: 'flows' } as const;

export function materializeInferred(
  repoRoot: string,
  index: ArthaIndex,
  id: string,
  opts: MaterializeOpts = {},
): WriteOutcome {
  const view = inferredDetail(index, id);
  if (!view) return { ok: false, code: 404, error: `no inferred fact '${id}'` };
  if (view.kind !== 'concept' && view.kind !== 'flow') {
    return {
      ok: false,
      code: 400,
      error: `only an inferred concept or flow can be vouched (got '${view.kind}')`,
    };
  }

  const arthaDir = join(repoRoot, '.artha');
  const existingIds = new Set(loadEntries(arthaDir).entries.map((e) => e.id));
  const entryId = uniqueId(`${view.kind}.${slug(view.name)}`, existingIds);

  // The machine reading seeds the human draft; an edit overrides it, else it
  // stands as-is. A summary is required, so fall back to a minimal honest one.
  const name = opts.patch?.name?.trim() || view.name;
  const summary = opts.patch?.summary?.trim() || view.summary || `${view.name} - read from code.`;
  // Provenance (OQ-A): the code hash the description was read from, so a later
  // reader can tell whether the code has drifted since it was vouched.
  const derived_from = `inferred@${view.pins[0]?.contentHash ?? view.id}`;
  const pins: Pin[] = view.pins.map((p) => ({ symbol: p.symbol }));

  let entry: ArthaEntry =
    view.kind === 'concept'
      ? {
          id: entryId,
          kind: 'concept',
          status: 'proposed',
          name,
          summary,
          // States read verbatim; their meaning + transitions stay the human delta.
          states: view.states.map((s): State => ({ name: s })),
          pins,
          derived_from,
        }
      : {
          id: entryId,
          kind: 'flow',
          status: 'proposed',
          name,
          summary,
          // The entry point is the one thing read from code; the steps' order and
          // meaning are the human's to author (the machine only knows the fan-out).
          entry: pins,
          derived_from,
        };

  if (opts.certify) {
    const { certifiedBy, certifiedAt } = resolveIdentity(repoRoot, opts.now);
    entry = { ...entry, status: 'certified', certified_by: certifiedBy, certified_at: certifiedAt };
  }

  const result = validateEntry(entry);
  if (!result.ok) {
    return {
      ok: false,
      code: 422,
      error: result.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
    };
  }

  const path = join(arthaDir, KIND_DIR[view.kind], `${entryId}.yaml`);
  const priorContent = existsSync(path) ? readFileSync(path, 'utf8') : null;
  writeEntry(result.entry, path);
  return {
    ok: true,
    id: entryId,
    status: entry.status,
    path,
    priorContent,
    created: priorContent === null,
  };
}

/** A schema-legal id suffix (`[a-z0-9_]+`) from a display name: split camelCase,
 * lowercase, and collapse every other run to a single `_`. */
function slug(name: string): string {
  const s = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s || 'x';
}

/** `base`, or `base_2`, `base_3`… - the first id not already taken. */
function uniqueId(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`;
    if (!existing.has(candidate)) return candidate;
  }
}
