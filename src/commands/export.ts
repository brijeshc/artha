import { logger } from '../util/logger';

export interface ExportOptions {
  /** Emit an `AGENTS.md` slice — the only export format in v0.1. */
  agentsMd?: boolean;
}

/**
 * `artha export` — emit a compact, generated `AGENTS.md` of certified entries.
 * Implemented in T09.
 */
export async function exportCommand(options: ExportOptions = {}): Promise<void> {
  const flag = options.agentsMd ? ' --agents-md' : '';
  logger.warn(`\`artha export${flag}\` is not implemented yet (see task 09).`);
}
