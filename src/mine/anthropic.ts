import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type AnthropicClient from '@anthropic-ai/sdk';
import { ArthaError } from '../util/error';
import {
  DECISION_OUTPUT_SCHEMA,
  DECISION_SYSTEM_PROMPT,
  type Miner,
  type MinerInput,
  type MinerResult,
  parseMinerResponse,
  renderCommitPrompt,
} from './miner';

/**
 * Ensure the `api` engine has usable Anthropic credentials before doing any
 * work. Accepts any auth the SDK can resolve: `ANTHROPIC_API_KEY`,
 * `ANTHROPIC_AUTH_TOKEN`, or an `ant auth login` OAuth profile (a Claude
 * subscription login — no raw key, no per-call billing). `build`/`review`/MCP/
 * `export` never call this and so stay fully offline.
 */
export function requireApiAuth(): void {
  if (hasApiCredentials()) return;
  throw new ArthaError('No Anthropic credentials for the `api` miner engine (ANTHROPIC_API_KEY).', {
    hint:
      'Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN, run `ant auth login`, or set ' +
      'miner.engine: claude-cli in .artha/config.yaml to reuse your Claude Code login.',
  });
}

function hasApiCredentials(): boolean {
  if (process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim())
    return true;
  return hasLoginProfile();
}

/** Best-effort check for an `ant auth login` OAuth profile on disk. */
function hasLoginProfile(): boolean {
  const base =
    process.env.ANTHROPIC_CONFIG_DIR ??
    (process.platform === 'win32' && process.env.APPDATA
      ? join(process.env.APPDATA, 'Anthropic')
      : join(homedir(), '.config', 'anthropic'));
  const credDir = join(base, 'credentials');
  try {
    return existsSync(credDir) && readdirSync(credDir).some((f) => f.endsWith('.json'));
  } catch {
    return false;
  }
}

/**
 * Build the Anthropic-SDK miner (the `api` engine). Uses structured output so
 * each draft matches the decision schema by construction. Lazily loads the SDK
 * so non-mine commands never import it.
 */
export async function createAnthropicMiner(model: string): Promise<Miner> {
  requireApiAuth();
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client: AnthropicClient = new Anthropic();

  return {
    async mineCommit(input: MinerInput): Promise<MinerResult> {
      const response = await client.messages.create({
        model,
        max_tokens: 2048,
        system: DECISION_SYSTEM_PROMPT,
        // Structured output: the response text is guaranteed to match the schema.
        output_config: { format: { type: 'json_schema', schema: DECISION_OUTPUT_SCHEMA } },
        messages: [{ role: 'user', content: renderCommitPrompt(input) }],
      });
      return parseMinerResponse(textOf(response));
    },
  };
}

function textOf(response: AnthropicClient.Message): string {
  return response.content
    .filter((block): block is AnthropicClient.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}
