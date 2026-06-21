import { relative } from 'node:path';
import { exportAgentsMd } from '../export/agentsMd';
import { logger } from '../util/logger';

export interface ExportOptions {
  /** Emit an `AGENTS.md` slice — the only format in v0.1 (the default action). */
  agentsMd?: boolean;
  /** Output path (default: `AGENTS.md` at the repo root). */
  out?: string;
}

/**
 * `artha export` — emit a compact, generated `AGENTS.md` of certified entries so
 * flat-file-only tools still get the team's certified meaning. Runs fully
 * offline; `--agents-md` is the only (and default) format in v0.1.
 */
export async function exportCommand(options: ExportOptions = {}): Promise<void> {
  const repoRoot = process.cwd();
  const { outPath, certified, hadIndex } = exportAgentsMd(repoRoot, { out: options.out });

  if (!hadIndex) {
    logger.info(
      'No built index found (or it is empty). Run `artha build` first if you expect certified entries.',
    );
  }
  const noun = certified === 1 ? 'entry' : 'entries';
  logger.success(`Wrote ${relative(repoRoot, outPath)} — ${certified} certified ${noun}.`);
}
