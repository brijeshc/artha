import { type CliRunner, assertClaudeCli, realCliRunner } from '../mine/claudeCli';
import { ArthaError } from '../util/error';
import {
  type Inferrer,
  SYNTH_SYSTEM_PROMPT,
  type SynthInput,
  type SynthResult,
  parseSynthResponse,
  renderSynthPrompt,
} from './inferrer';

/**
 * Build the Claude Code CLI synthesizer (the `claude-cli` engine). Shells out to
 * `claude -p` in headless mode, reusing the user's existing Claude Code login -
 * no separate `ANTHROPIC_API_KEY`. Mirrors the miner's CLI engine (the runner,
 * the all-static argv, the system prompt on stdin) so the two behave identically.
 */
export async function createClaudeCliInferrer(
  model: string,
  runner: CliRunner = realCliRunner,
): Promise<Inferrer> {
  await assertClaudeCli(runner);

  return {
    async synthesize(input: SynthInput): Promise<SynthResult> {
      const args = ['-p', '--output-format', 'json', '--model', model];
      const stdin = `${SYNTH_SYSTEM_PROMPT}\n\n---\n\n${renderSynthPrompt(input)}`;
      const stdout = await runner(args, stdin);
      return parseSynthResponse(resultText(stdout));
    },
  };
}

/** Pull the assistant text out of `claude --output-format json`'s result envelope. */
function resultText(stdout: string): string {
  let envelope: { is_error?: boolean; subtype?: string; result?: unknown };
  try {
    envelope = JSON.parse(stdout);
  } catch (cause) {
    throw new ArthaError('claude CLI returned non-JSON output.', { cause });
  }
  if (envelope.is_error || envelope.subtype !== 'success') {
    const reason = String(envelope.result ?? envelope.subtype ?? 'unknown');
    throw new ArthaError(`claude CLI error: ${reason}`, {
      hint: 'Run `claude` once interactively to log in, or switch to infer.engine: api.',
    });
  }
  return String(envelope.result ?? '');
}
