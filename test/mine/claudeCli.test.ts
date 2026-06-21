import { describe, expect, it } from 'vitest';
import { type CliRunner, assertClaudeCli, createClaudeCliMiner } from '../../src/mine/claudeCli';
import type { MinerInput } from '../../src/mine/miner';
import { isArthaError } from '../../src/util/error';

const INPUT: MinerInput = {
  subject: 'Store money as integer minor units',
  body: 'Floats drift after tax.',
  files: ['src/money.ts'],
  patch: '+export const toMinor = (n: number) => Math.round(n * 100);',
};

/** A fake `claude` CLI: answers `--version`, and returns `envelope` for the generate call. */
function fakeRunner(envelope: unknown): {
  runner: CliRunner;
  calls: { args: string[]; stdin: string }[];
} {
  const calls: { args: string[]; stdin: string }[] = [];
  const runner: CliRunner = async (args, stdin) => {
    calls.push({ args, stdin });
    if (args.includes('--version')) return '2.1.176 (Claude Code)';
    return JSON.stringify(envelope);
  };
  return { runner, calls };
}

const success = (result: string) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  result,
});

describe('createClaudeCliMiner', () => {
  it('parses a drafted decision from the CLI JSON envelope (fenced result)', async () => {
    const decision = {
      has_decision: true,
      title: 'Use integer minor units',
      context: 'Floats drift.',
      decision: 'Store cents as integers.',
      consequences: 'All math is integer.',
    };
    const { runner, calls } = fakeRunner(
      success(`\`\`\`json\n${JSON.stringify(decision)}\n\`\`\``),
    );

    const miner = await createClaudeCliMiner('claude-opus-4-8', runner);
    const result = await miner.mineCommit(INPUT);

    expect(result).toEqual({
      hasDecision: true,
      draft: {
        title: 'Use integer minor units',
        context: 'Floats drift.',
        decision: 'Store cents as integers.',
        consequences: 'All math is integer.',
      },
    });

    // Invoked headless with the right flags, prompt piped via stdin.
    const generate = calls.find((c) => c.args.includes('-p'));
    expect(generate?.args).toEqual(
      expect.arrayContaining(['-p', '--output-format', 'json', '--model', 'claude-opus-4-8']),
    );
    expect(generate?.stdin).toContain('Store money as integer minor units');
  });

  it('maps has_decision=false to a no-decision result', async () => {
    const { runner } = fakeRunner(success('{"has_decision": false}'));
    const miner = await createClaudeCliMiner('claude-opus-4-8', runner);
    expect(await miner.mineCommit(INPUT)).toEqual({ hasDecision: false });
  });

  it('throws an ArthaError when the CLI reports an error envelope', async () => {
    const { runner } = fakeRunner({
      type: 'result',
      subtype: 'error',
      is_error: true,
      result: 'not logged in',
    });
    const miner = await createClaudeCliMiner('claude-opus-4-8', runner);
    await expect(miner.mineCommit(INPUT)).rejects.toSatisfy(isArthaError);
  });

  it('assertClaudeCli throws an actionable error when the binary is missing', async () => {
    const missing: CliRunner = async () => {
      throw Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
    };
    await expect(assertClaudeCli(missing)).rejects.toSatisfy(
      (e: unknown) => isArthaError(e) && /not found/.test((e as Error).message),
    );
  });
});
