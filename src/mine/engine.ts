import type { MinerConfig } from '../config/config';
import { createAnthropicMiner } from './anthropic';
import { createClaudeCliMiner } from './claudeCli';
import type { Miner } from './miner';

/**
 * Build the miner for the configured engine, performing the engine's readiness
 * check (credentials for `api`, binary presence for `claude-cli`) so `mine`
 * fails fast with an actionable message before any model call.
 */
export function createMiner(config: MinerConfig): Promise<Miner> {
  if (config.engine === 'claude-cli') return createClaudeCliMiner(config.model);
  return createAnthropicMiner(config.model);
}
