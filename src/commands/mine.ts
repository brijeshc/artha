import { relative } from 'node:path';
import { loadConfig } from '../config/config';
import { type MineOptions, mine } from '../mine/mine';
import { ArthaError } from '../util/error';
import { logger } from '../util/logger';

export interface MineCliOptions {
  dryRun?: boolean;
  limit?: string;
  max?: string;
}

/**
 * `artha mine` — draft `decision` entries from git history via the Anthropic
 * API. Heuristic pre-filter + idempotency keep the cost bounded; drafts are
 * always `proposed` (human certifies in `artha review`).
 */
export async function mineCommand(options: MineCliOptions = {}): Promise<void> {
  const repoRoot = process.cwd();
  const mineOptions: MineOptions = {
    dryRun: options.dryRun ?? false,
    limit: parseCount(options.limit, '--limit', 1),
    maxCommits: parseCount(options.max, '--max', 0),
  };

  const report = await mine(repoRoot, loadConfig(repoRoot), mineOptions);

  if (mineOptions.dryRun) {
    logger.info(
      `Dry run: ${report.candidates} candidate(s), ${report.scanned} would be mined, ` +
        `${report.skipped.length} diff-skipped, ${report.alreadyMined} already mined.`,
    );
    return;
  }

  for (const draft of report.drafted) {
    logger.success(`drafted ${draft.id} ← ${draft.sha} (${relative(repoRoot, draft.path)})`);
  }

  const n = report.drafted.length;
  logger.success(`Mined ${n} decision draft${n === 1 ? '' : 's'} → review with \`artha review\`.`);
  logger.info(
    `Sent ${report.scanned} commit(s) to the miner — ${report.noDecision} had no decision, ` +
      `${report.skipped.length} diff-skipped, ${report.alreadyMined} already mined.`,
  );
}

/** Parse a numeric CLI flag, enforcing an integer ≥ `min`. */
function parseCount(value: string | undefined, flag: string, min: number): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) {
    throw new ArthaError(`${flag} must be an integer ≥ ${min} (got "${value}").`);
  }
  return n;
}
