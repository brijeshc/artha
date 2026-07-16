import type { InferConfig } from '../config/config';
import { createAnthropicInferrer } from './anthropic';
import { createClaudeCliInferrer } from './claudeCli';
import type { Inferrer } from './inferrer';

/**
 * Build the synthesizer for the configured engine, performing the engine's
 * readiness check (credentials for `api`, binary presence for `claude-cli`) so
 * `infer` fails fast with an actionable message before any model call - exactly
 * as the miner's factory does.
 */
export function createInferrer(config: InferConfig): Promise<Inferrer> {
  if (config.engine === 'claude-cli') return createClaudeCliInferrer(config.model);
  return createAnthropicInferrer(config.model);
}
