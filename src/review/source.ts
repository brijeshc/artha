import { execFileSync } from 'node:child_process';

/**
 * The commit a draft was mined from, resolved for side-by-side display. Kept
 * independent of the miner's git layer (T06) so review works on any `proposed`
 * entry, and **graceful**: an absent/unresolvable ref yields `{ found: false }`
 * rather than throwing (shallow clones, rebased or squashed history).
 */
export interface CommitSource {
  found: boolean;
  subject?: string;
  body?: string;
  files?: string[];
  patch?: string;
}

// A separator that cannot appear in a commit message, so subject/body split cleanly.
const UNIT = '\x1f';

/** Resolve `ref`'s message + diff for the review pane. Never throws. */
export function loadCommitSource(repoRoot: string, ref: string): CommitSource {
  try {
    const meta = show(repoRoot, ['-s', `--format=%s${UNIT}%b`, ref]);
    const [subject = '', body = ''] = meta.split(UNIT);
    const files = show(repoRoot, ['--name-only', '--format=', ref])
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    const patch = show(repoRoot, ['--format=', '--no-color', ref]);
    return { found: true, subject: subject.trim(), body: body.trim(), files, patch };
  } catch {
    return { found: false };
  }
}

function show(repoRoot: string, args: string[]): string {
  return execFileSync('git', ['show', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}
