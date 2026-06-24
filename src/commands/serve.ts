import { loadConfig } from '../config/config';
import { serve } from '../serve/server';
import { ArthaError } from '../util/error';
import { logger } from '../util/logger';

export interface ServeCommandOptions {
  port?: string;
  host?: string;
}

/**
 * `artha serve` — boot the local-first dashboard: a read-only HTTP server over
 * `.artha/index.db` (read fresh per request) that serves the Product↔Code map
 * and JSON API. Viewing is fully offline; the process stays up until Ctrl-C.
 */
export async function serveCommand(options: ServeCommandOptions = {}): Promise<void> {
  const repoRoot = process.cwd();
  const config = loadConfig(repoRoot);

  let port: number | undefined;
  if (options.port !== undefined) {
    port = Number(options.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new ArthaError(`invalid --port: ${options.port}`, { hint: 'Pass a port in 0–65535.' });
    }
  }

  const handle = await serve({ repoRoot, config, port, host: options.host });
  logger.success(`Artha dashboard → ${handle.url}`);
  logger.info('Reading .artha/index.db per request. Press Ctrl-C to stop.');

  await new Promise<void>((resolve) => {
    const shutdown = (): void => {
      logger.info('Shutting down…');
      handle.close().finally(resolve);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}
