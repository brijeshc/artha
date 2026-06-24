import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../util/logger';

const KIND_DIRS = ['decisions', 'invariants', 'conventions', 'concepts', 'flows'] as const;

// Commented template showing the defaults. Must stay in sync with the defaults
// in config.ts — the init round-trip test (loadConfig after init === defaults)
// enforces that.
const DEFAULT_CONFIG_YAML = `# Artha project config. All fields are optional; the values shown are the defaults.

# Roots used to expand invariant/convention scope globs.
source_roots:
  - src

# Default severity for invariants when none is given (high | medium | low).
default_severity: medium

# Miner (\`artha mine\`) settings.
miner:
  # Backend used to draft decisions:
  #   api        — Anthropic SDK directly (needs ANTHROPIC_API_KEY / token / \`ant auth login\`).
  #   claude-cli — shell out to the Claude Code CLI, reusing its existing login (no API key).
  # engine: api

  # Model used to draft decisions.
  # Cheaper opt-ins: claude-sonnet-4-6, claude-haiku-4-5.
  model: claude-opus-4-8

# Embedding-assisted ranking (\`artha build\` / retrieval). A local on-device model
# (downloaded once, then fully offline) sharpens "find the right meaning". Set
# enabled: false to skip the model and rank on lexical + structural only.
# embeddings:
#   enabled: true
#   model: Xenova/all-MiniLM-L6-v2

# Forward-compat only — v0.1 uses the built-in tree-sitter resolver and ignores this.
# codegraph_db: .codegraph/graph.db
`;

export interface InitResult {
  arthaDir: string;
  /** Repo-relative paths newly created this run. */
  createdDirs: string[];
  createdFiles: string[];
  /** True when `.artha/config.yaml` already existed (repo was already init'd). */
  alreadyInitialized: boolean;
}

/**
 * Scaffold `.artha/` idempotently: the kind dirs (each with a `.gitkeep`) and a
 * commented `config.yaml`. Re-running never clobbers an existing config or
 * deletes entries — it only fills in what's missing.
 */
export function initArtha(repoRoot: string): InitResult {
  const arthaDir = join(repoRoot, '.artha');
  const createdDirs: string[] = [];
  const createdFiles: string[] = [];
  const alreadyInitialized = existsSync(join(arthaDir, 'config.yaml'));

  for (const dir of KIND_DIRS) {
    const full = join(arthaDir, dir);
    if (!existsSync(full)) {
      mkdirSync(full, { recursive: true });
      createdDirs.push(`.artha/${dir}/`);
    }
    const gitkeep = join(full, '.gitkeep');
    if (!existsSync(gitkeep)) {
      writeFileSync(gitkeep, '');
      createdFiles.push(`.artha/${dir}/.gitkeep`);
    }
  }

  if (!alreadyInitialized) {
    mkdirSync(arthaDir, { recursive: true });
    writeFileSync(join(arthaDir, 'config.yaml'), DEFAULT_CONFIG_YAML);
    createdFiles.push('.artha/config.yaml');
  }

  return { arthaDir, createdDirs, createdFiles, alreadyInitialized };
}

/**
 * `artha init` — scaffold `.artha/{decisions,invariants,conventions,concepts,flows}/`
 * and a default `config.yaml` in the current directory.
 */
export async function initCommand(): Promise<void> {
  const result = initArtha(process.cwd());
  const touched = [...result.createdDirs, ...result.createdFiles];

  if (result.alreadyInitialized) {
    if (touched.length === 0) {
      logger.info('.artha/ already initialized — nothing to do.');
      return;
    }
    logger.info('.artha/ already initialized — filled in missing pieces:');
  } else {
    logger.success('Initialized .artha/');
  }

  for (const path of touched) {
    logger.info(`  created ${path}`);
  }

  if (!result.alreadyInitialized) {
    logger.info('Next: artha mine  →  artha review  →  artha build');
  }
}
