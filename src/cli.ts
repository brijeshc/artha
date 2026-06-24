#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';
import { buildCommand } from './commands/build';
import { exportCommand } from './commands/export';
import { initCommand } from './commands/init';
import { mcpCommand } from './commands/mcp';
import { mineCommand } from './commands/mine';
import { reviewCommand } from './commands/review';
import { serveCommand } from './commands/serve';
import { isArthaError } from './util/error';
import { logger } from './util/logger';

/** Build the fully-wired commander program without parsing. Exported for tests. */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name('artha')
    .description('Certified product-meaning for AI coding agents.')
    .version(__ARTHA_VERSION__, '-v, --version', 'print the artha version')
    .showHelpAfterError();

  program
    .command('init')
    .description('scaffold .artha/ and a default config.yaml')
    .action(initCommand);

  program
    .command('mine')
    .description('draft decision entries from git history (Anthropic API)')
    .option('--dry-run', 'preview candidate commits without calling the API or writing drafts')
    .option('--limit <n>', 'how many commits of history to scan (default: all)')
    .option('--max <n>', 'max commits to send to the miner this run (default: 20; 0 = unlimited)')
    .action(mineCommand);

  program
    .command('review')
    .description('certify / edit / reject proposed drafts in a TUI')
    .action(reviewCommand);

  program
    .command('build')
    .description('compile .artha/ YAML into the SQLite + FTS5 index')
    .action(buildCommand);

  program
    .command('export')
    .description('emit a compact AGENTS.md of certified entries')
    .option('--agents-md', 'write an AGENTS.md slice (the only format in v0.1)')
    .option('--out <path>', 'output path (default: AGENTS.md at the repo root)')
    .action((options: { agentsMd?: boolean; out?: string }) => exportCommand(options));

  program.command('mcp').description('start the stdio MCP server').action(mcpCommand);

  program
    .command('serve')
    .description('launch the local web dashboard over .artha/index.db')
    .option('--port <n>', 'port to bind (default: 4123; 0 = pick a free port)')
    .option('--host <host>', 'interface to bind (default: 127.0.0.1)')
    .action((options: { port?: string; host?: string }) => serveCommand(options));

  return program;
}

/** Parse argv and dispatch the matching subcommand. */
export async function run(argv: string[] = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}

/** Map any thrown value to a user-facing message + exit code. */
function reportFatal(error: unknown): number {
  if (isArthaError(error)) {
    logger.error(error.message);
    if (error.hint) logger.info(error.hint);
    return error.exitCode;
  }
  logger.error('Unexpected error:');
  console.error(error);
  return 1;
}

// Auto-run only when executed as the bin entry, never when imported by tests.
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  run().catch((error: unknown) => {
    process.exitCode = reportFatal(error);
  });
}
