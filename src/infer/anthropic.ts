import type AnthropicClient from '@anthropic-ai/sdk';
import { requireApiAuth } from '../mine/anthropic';
import {
  type Inferrer,
  SYNTH_OUTPUT_SCHEMA,
  SYNTH_SYSTEM_PROMPT,
  type SynthInput,
  type SynthResult,
  parseSynthResponse,
  renderSynthPrompt,
} from './inferrer';

/**
 * Build the Anthropic-SDK synthesizer (the `api` engine). Uses structured
 * output so each response matches the synthesis schema by construction, and
 * reuses the miner's credential check (`ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`
 * / an `ant auth login` profile). Lazily loads the SDK so non-`infer` commands
 * never import it - viewing/serving stays fully offline.
 */
export async function createAnthropicInferrer(model: string): Promise<Inferrer> {
  requireApiAuth();
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client: AnthropicClient = new Anthropic();

  return {
    async synthesize(input: SynthInput): Promise<SynthResult> {
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: SYNTH_SYSTEM_PROMPT,
        output_config: { format: { type: 'json_schema', schema: SYNTH_OUTPUT_SCHEMA } },
        messages: [{ role: 'user', content: renderSynthPrompt(input) }],
      });
      return parseSynthResponse(textOf(response));
    },
  };
}

function textOf(response: AnthropicClient.Message): string {
  return response.content
    .filter((block): block is AnthropicClient.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}
