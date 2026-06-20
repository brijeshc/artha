#!/usr/bin/env node
import { startMcpServer } from './server';

// Thin bin entry for `dist/mcp.js`, referenced directly by MCP client configs
// (`node /path/to/dist/mcp.js`). Nothing imports this file, so the top-level
// run only ever happens for the standalone server — never via the CLI.
startMcpServer().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
