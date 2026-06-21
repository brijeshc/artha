import { execFile } from 'node:child_process';
import { ArthaError } from '../util/error';
import {
  DECISION_SYSTEM_PROMPT,
  type Miner,
  type MinerInput,
  type MinerResult,
  parseMinerResponse,
  renderCommitPrompt,
} from './miner';

/** Runs the `claude` CLI with args + stdin, resolving to stdout. Injectable for tests. */
export type CliRunner = (args: string[], stdin: string) => Promise<string>;

const BINARY = 'claude';

function realRunner(args: string[], stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const done = (error: Error | null, stdout: string | Buffer): void => {
      if (error) reject(error);
      else resolve(String(stdout));
    };
    const options = { maxBuffer: 64 * 1024 * 1024 } as const;
    // On Windows `claude` is a `.cmd` shim that execFile can't resolve without a
    // shell. All args are static, space-free tokens, so a joined command string
    // is safe (and avoids DEP0190); the variable content rides on stdin.
    const child =
      process.platform === 'win32'
        ? execFile([BINARY, ...args].join(' '), { ...options, shell: true }, done)
        : execFile(BINARY, args, options, done);
    child.stdin?.end(stdin);
  });
}

/** Verify the Claude Code CLI is installed; throw an actionable error if not. */
export async function assertClaudeCli(runner: CliRunner = realRunner): Promise<void> {
  try {
    await runner(['--version'], '');
  } catch (cause) {
    throw new ArthaError('Claude Code CLI (`claude`) not found on PATH.', {
      cause,
      hint: 'Install Claude Code, or set miner.engine: api with an ANTHROPIC_API_KEY.',
    });
  }
}

/**
 * Build the Claude Code CLI miner (the `claude-cli` engine). Shells out to
 * `claude -p` in headless mode, reusing the user's existing Claude Code login
 * (subscription or key) — no separate `ANTHROPIC_API_KEY` needed. Trade-off:
 * each call carries Claude Code's system-prompt overhead, so the `api` engine
 * stays leaner for raw-key users.
 */
export async function createClaudeCliMiner(
  model: string,
  runner: CliRunner = realRunner,
): Promise<Miner> {
  await assertClaudeCli(runner);

  return {
    async mineCommit(input: MinerInput): Promise<MinerResult> {
      // Keep argv all-static (shell-safe on Windows); send the system prompt +
      // commit on stdin rather than as a special-char `--system-prompt` arg.
      const args = ['-p', '--output-format', 'json', '--model', model];
      const stdin = `${DECISION_SYSTEM_PROMPT}\n\n---\n\n${renderCommitPrompt(input)}`;
      const stdout = await runner(args, stdin);
      return parseMinerResponse(resultText(stdout));
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
      hint: 'Run `claude` once interactively to log in, or switch to miner.engine: api.',
    });
  }
  return String(envelope.result ?? '');
}
