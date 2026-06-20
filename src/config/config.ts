import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Severity } from '../schema/types';
import { ArthaError } from '../util/error';

export interface MinerConfig {
  /**
   * Model the miner drafts decisions with. Default is the SPEC's Open Q1 value
   * (`claude-opus-4-8`) — we do not silently downgrade for cost. T06 owns the
   * mining semantics; this only defines the shape + default.
   */
  model: string;
}

export interface ArthaConfig {
  /** Roots used to expand invariant/convention scope globs. */
  sourceRoots: string[];
  /** Default severity for invariants when none is given. */
  defaultSeverity: Severity;
  /** Stored for forward-compat; v0.1 uses the built-in resolver and ignores it. */
  codegraphDb?: string;
  miner: MinerConfig;
}

const DEFAULTS = {
  sourceRoots: ['src'],
  defaultSeverity: 'medium',
  minerModel: 'claude-opus-4-8',
} as const;

const SEVERITIES = new Set<Severity>(['high', 'medium', 'low']);

/**
 * Load `.artha/config.yaml` from `repoRoot`, layered over sensible defaults.
 * Pure + sync; imported by build (T05), mine (T06), and the MCP server (T08).
 *
 * - A missing file yields an all-defaults config (never throws).
 * - A malformed file throws an `ArthaError` naming it.
 * - Unknown or mistyped fields fall back to their default (lenient).
 */
export function loadConfig(repoRoot: string): ArthaConfig {
  const config = defaultConfig();
  const file = join(repoRoot, '.artha', 'config.yaml');
  if (!existsSync(file)) return config;

  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new ArthaError(`Malformed .artha/config.yaml: ${(cause as Error).message}`, { cause });
  }

  if (raw === null || raw === undefined) return config;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ArthaError('.artha/config.yaml must be a YAML mapping.');
  }
  const obj = raw as Record<string, unknown>;

  if (isNonEmptyStringArray(obj.source_roots)) {
    config.sourceRoots = obj.source_roots;
  }
  if (
    typeof obj.default_severity === 'string' &&
    SEVERITIES.has(obj.default_severity as Severity)
  ) {
    config.defaultSeverity = obj.default_severity as Severity;
  }
  if (typeof obj.codegraph_db === 'string') {
    config.codegraphDb = obj.codegraph_db;
  }
  if (typeof obj.miner === 'object' && obj.miner !== null) {
    const miner = obj.miner as Record<string, unknown>;
    if (typeof miner.model === 'string' && miner.model.length > 0) {
      config.miner.model = miner.model;
    }
  }

  return config;
}

/** A fresh, independent defaults object (no shared mutable references). */
export function defaultConfig(): ArthaConfig {
  return {
    sourceRoots: [...DEFAULTS.sourceRoots],
    defaultSeverity: DEFAULTS.defaultSeverity,
    miner: { model: DEFAULTS.minerModel },
  };
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string');
}
