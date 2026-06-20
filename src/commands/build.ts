import { buildIndex } from '../build/build';
import { loadConfig } from '../config/config';
import { ArthaError } from '../util/error';
import { logger } from '../util/logger';

/**
 * `artha build` — validate `.artha/` YAML, resolve pins via tree-sitter, compute
 * content hashes, flip drifted certified entries to `stale`, and emit the
 * SQLite + FTS5 index. Runs fully offline.
 */
export async function buildCommand(): Promise<void> {
  const repoRoot = process.cwd();
  const report = await buildIndex(repoRoot, loadConfig(repoRoot));

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
  logger.success(`Built ${report.dbPath} — ${report.emitted} ${noun}.`);
}
