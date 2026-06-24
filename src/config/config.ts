import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Severity } from '../schema/types';
import { ArthaError } from '../util/error';

/**
 * Which backend `artha mine` drafts decisions with:
 * - `api`: the Anthropic SDK directly (needs ANTHROPIC_API_KEY / token / `ant
 *   auth login`; leanest, guaranteed structured output).
 * - `claude-cli`: shells out to the Claude Code CLI, reusing its existing login
 *   (subscription or key) — no separate API key needed.
 */
export type MinerEngine = 'api' | 'claude-cli';

export interface MinerConfig {
  /** Backend used to draft decisions. Default `api`. */
  engine: MinerEngine;
  /**
   * Model the miner drafts decisions with. Default is the SPEC's Open Q1 value
   * (`claude-opus-4-8`) — we do not silently downgrade for cost.
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
  /**
   * OQ5 seam (v0.2): named product **areas** → the code modules they cover, for
   * the dashboard map's product column. Optional — when absent, `artha serve`
   * derives one area per top-level module (top-level-folders default). Example:
   * `{ Billing: ['src/billing', 'src/payments'] }`.
   */
  areas?: Record<string, string[]>;
  /** Embedding-assisted ranking (v0.2, OQ3 = local on-device model). */
  embeddings: EmbeddingsConfig;
}

export interface EmbeddingsConfig {
  /** Compute + use embeddings. Default true; set false to skip the model/dep. */
  enabled: boolean;
  /** transformers.js model id stored beside vectors (a change re-embeds). */
  model: string;
}

const DEFAULTS = {
  sourceRoots: ['src'],
  defaultSeverity: 'medium',
  minerEngine: 'api',
  minerModel: 'claude-opus-4-8',
  embeddingsEnabled: true,
  embeddingsModel: 'Xenova/all-MiniLM-L6-v2',
} as const;

const SEVERITIES = new Set<Severity>(['high', 'medium', 'low']);
const MINER_ENGINES = new Set<MinerEngine>(['api', 'claude-cli']);

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
    if (typeof miner.engine === 'string' && MINER_ENGINES.has(miner.engine as MinerEngine)) {
      config.miner.engine = miner.engine as MinerEngine;
    }
  }

  const areas = parseAreas(obj.areas);
  if (areas) config.areas = areas;

  if (typeof obj.embeddings === 'object' && obj.embeddings !== null) {
    const emb = obj.embeddings as Record<string, unknown>;
    if (typeof emb.enabled === 'boolean') config.embeddings.enabled = emb.enabled;
    if (typeof emb.model === 'string' && emb.model.length > 0) config.embeddings.model = emb.model;
  }

  return config;
}

/** Lenient parse of the optional `areas:` map (OQ5 seam): keep only entries
 * shaped `name: [moduleGlob, …]` with ≥1 string module; drop anything else. */
function parseAreas(value: unknown): Record<string, string[]> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const out: Record<string, string[]> = {};
  for (const [name, mods] of Object.entries(value as Record<string, unknown>)) {
    if (isNonEmptyStringArray(mods)) out[name] = mods;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** A fresh, independent defaults object (no shared mutable references). */
export function defaultConfig(): ArthaConfig {
  return {
    sourceRoots: [...DEFAULTS.sourceRoots],
    defaultSeverity: DEFAULTS.defaultSeverity,
    miner: { engine: DEFAULTS.minerEngine, model: DEFAULTS.minerModel },
    embeddings: { enabled: DEFAULTS.embeddingsEnabled, model: DEFAULTS.embeddingsModel },
  };
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string');
}
