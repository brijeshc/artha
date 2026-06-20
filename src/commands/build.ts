import { logger } from '../util/logger';

/**
 * `artha build` — validate YAML, resolve pins via tree-sitter, compute content
 * hashes, flip drifted certified entries to `stale`, and emit the SQLite + FTS5
 * index. Implemented in T05.
 */
export async function buildCommand(): Promise<void> {
  logger.warn('`artha build` is not implemented yet (see task 05).');
}
