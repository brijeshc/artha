import { logger } from '../util/logger';

/**
 * Start the stdio MCP server exposing `artha.context_for_task` and `artha.why`.
 *
 * Stub for now — the protocol wiring lands in T08. Kept as a named export so
 * both `artha mcp` (the subcommand) and `dist/mcp.js` (the standalone bin)
 * share one implementation.
 */
export async function startMcpServer(): Promise<void> {
  logger.warn('Artha MCP server is not implemented yet (see task 08).');
}
