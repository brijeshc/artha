import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { ArthaError } from '../util/error';
import { logger } from '../util/logger';
import type { ArthaEntry, Kind } from './types';
import { validateEntry } from './validate';

const KIND_DIRS = ['decisions', 'invariants', 'conventions'] as const;
const CORE_KINDS = new Set<string>(['decision', 'invariant', 'convention']);
const YAML_EXT = new Set(['.yaml', '.yml']);

export interface LoadResult {
  /** Validated entries, each with `source_path` attached. */
  entries: ArthaEntry[];
  /** Paths skipped as unknown/reserved kinds (concept.*, flow.*, exception.*). */
  skipped: string[];
}

/**
 * Walk `.artha/{decisions,invariants,conventions}/*.{yaml,yml}`, parse and
 * validate each entry, and return them with `source_path` attached. The
 * filename is not load-bearing — identity is the `id` field.
 *
 * - Unknown/reserved kinds are skipped (reported in `skipped`), not errored.
 * - Duplicate `id` across the whole tree throws, naming both files.
 * - A structurally invalid entry throws with the offending field path(s).
 * - A missing `.artha/` (or missing kind dirs) yields an empty result.
 */
export function loadEntries(arthaDir: string): LoadResult {
  const entries: ArthaEntry[] = [];
  const skipped: string[] = [];
  const seen = new Map<string, string>();

  for (const dir of KIND_DIRS) {
    const full = join(arthaDir, dir);
    if (!existsSync(full)) continue;

    for (const file of listYamlFiles(full)) {
      const raw = readOne(file);
      const kind = (raw as { kind?: unknown } | null)?.kind;

      if (typeof kind !== 'string' || !CORE_KINDS.has(kind)) {
        skipped.push(file);
        logger.debug(`skipped non-core kind (${String(kind)}): ${file}`);
        continue;
      }

      const result = validateEntry(raw);
      if (!result.ok) {
        const detail = result.errors.map((e) => `  ${e.path}: ${e.message}`).join('\n');
        throw new ArthaError(`Invalid entry ${file}:\n${detail}`);
      }

      const prior = seen.get(result.entry.id);
      if (prior !== undefined) {
        throw new ArthaError(
          `Duplicate id "${result.entry.id}" in two files:\n  ${prior}\n  ${file}`,
        );
      }
      seen.set(result.entry.id, file);
      result.entry.source_path = file;
      entries.push(result.entry);
    }
  }

  return { entries, skipped };
}

// Canonical field order per kind, so dumped files stay stable and readable
// and match the §5 examples. Unknown extra fields are appended (forward-compat).
const FIELD_ORDER: Record<Kind, readonly string[]> = {
  decision: [
    'id',
    'kind',
    'status',
    'title',
    'context',
    'decision',
    'consequences',
    'supersedes',
    'pins',
    'mined_from',
    'related',
    'tags',
    'certified_by',
    'certified_at',
  ],
  invariant: [
    'id',
    'kind',
    'status',
    'name',
    'rule',
    'scope',
    'why',
    'severity',
    'detect',
    'pins',
    'mined_from',
    'related',
    'tags',
    'certified_by',
    'certified_at',
  ],
  convention: [
    'id',
    'kind',
    'status',
    'name',
    'rule',
    'scope',
    'example_good',
    'example_bad',
    'pins',
    'mined_from',
    'related',
    'tags',
    'certified_by',
    'certified_at',
  ],
};

/**
 * Write an entry back to `path` in canonical field order. `source_path` and
 * any `undefined` fields are dropped; multiline strings round-trip as block
 * scalars (`lineWidth: 0` disables folding so long strings aren't mangled).
 */
export function writeEntry(entry: ArthaEntry, path: string): void {
  const yamlText = stringifyYaml(orderEntry(entry), { lineWidth: 0 });
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, yamlText, 'utf8');
}

function orderEntry(entry: ArthaEntry): Record<string, unknown> {
  const src = entry as unknown as Record<string, unknown>;
  const order = FIELD_ORDER[entry.kind];
  const out: Record<string, unknown> = {};

  for (const key of order) {
    if (src[key] !== undefined) out[key] = src[key];
  }
  for (const key of Object.keys(src)) {
    if (key === 'source_path' || order.includes(key)) continue;
    if (src[key] !== undefined) out[key] = src[key];
  }
  return out;
}

function listYamlFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => YAML_EXT.has(extname(name).toLowerCase()))
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile())
    .sort();
}

function readOne(file: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (cause) {
    throw new ArthaError(`Cannot read ${file}`, { cause });
  }
  try {
    return parseYaml(text);
  } catch (cause) {
    throw new ArthaError(`Malformed YAML in ${file}: ${(cause as Error).message}`, { cause });
  }
}
