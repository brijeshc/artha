import { startMcpServer } from '../mcp/server';

/**
 * `artha mcp` — start the stdio MCP server. The real protocol wiring lands in
 * T08; this routes to the shared server entry point so the subcommand and the
 * standalone `dist/mcp.js` bin run the exact same code.
 */
export async function mcpCommand(): Promise<void> {
  await startMcpServer();
}
