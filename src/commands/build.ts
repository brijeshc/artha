import { buildIndex } from '../build/build';
import { loadConfig } from '../config/config';
import { getEmbedder } from '../embed/embedder';
import { ArthaError } from '../util/error';
import { logger } from '../util/logger';

/**
 * `artha build` — validate `.artha/` YAML, resolve pins via tree-sitter, compute
 * content hashes, flip drifted certified entries to `stale`, embed facts for
 * semantic retrieval (T14, local model — best-effort), and emit the SQLite +
 * FTS5 index. Offline except the one-time embedding-model download.
 */
export async function buildCommand(): Promise<void> {
  const repoRoot = process.cwd();
  const config = loadConfig(repoRoot);
  const embedder = getEmbedder(config);
  if (embedder) {
    logger.info(`Embedding facts with ${embedder.modelId} (first run downloads the model once)…`);
  }

  const report = await buildIndex(repoRoot, config, { embedder });

  for (const warning of report.warnings) logger.warn(warning);
  for (const id of report.staled) {
    logger.warn(`flipped to stale (pinned code changed): ${id}`);
  }

  if (report.errors.length > 0) {
    for (const error of report.errors) logger.error(error);
    throw new ArthaError(`build failed: ${report.errors.length} error(s).`, {
      hint: 'Fix the entries above (e.g. correct the pin ref) and re-run `artha build`.',
    });
  }

  const noun = report.emitted === 1 ? 'entry' : 'entries';
  const vectors = embedder ? ` · ${report.embedded} embedded` : '';
  logger.success(`Built ${report.dbPath} — ${report.emitted} ${noun}${vectors}.`);
}
