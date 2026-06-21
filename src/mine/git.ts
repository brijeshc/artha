import { execFileSync } from 'node:child_process';
import { ArthaError } from '../util/error';

/** One commit's metadata, cheap to fetch in bulk (no diff). */
export interface CommitMeta {
  /** Full 40-char SHA. */
  sha: string;
  /** First 12 chars of `sha` — what we store in `mined_from` and the ledger. */
  short: string;
  /** Parent SHAs; length > 1 means a merge commit. */
  parents: string[];
  /** Commit subject (first line of the message). */
  subject: string;
  /** Commit body (everything after the subject), trimmed. */
  body: string;
}

/** A commit's changes, fetched lazily only for ranked candidates. */
export interface CommitDiff {
  /** Repo-relative paths touched by the commit. */
  files: string[];
  /** The unified diff text (`git show` patch, no metadata header). */
  patch: string;
}

// Field/record separators that cannot appear in commit metadata, so parsing a
// formatted `git log` is unambiguous even when subjects/bodies contain anything.
const UNIT = '\x1f';
const RECORD = '\x1e';

/** Truncate a full SHA to the short form we persist. */
export function shortSha(sha: string): string {
  return sha.slice(0, 12);
}

function git(repoRoot: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (cause) {
    throw new ArthaError(`git ${args[0]} failed`, {
      cause,
      hint: 'Run `artha mine` inside a git repository with commit history.',
    });
  }
}

/**
 * Return up to `limit` commits, newest first, with metadata only (no diffs).
 * This is the cheap input to the pre-filter; diffs are fetched separately for
 * survivors via {@link loadCommitDiff} so trivial commits never cost an LLM call.
 */
export function listCommits(repoRoot: string, limit?: number): CommitMeta[] {
  const format = ['%H', '%P', '%s', '%b'].join(UNIT) + RECORD;
  const args = ['log', `--format=${format}`];
  if (limit !== undefined) args.splice(1, 0, `-n${limit}`);

  const out = git(repoRoot, args);
  const commits: CommitMeta[] = [];

  for (const record of out.split(RECORD)) {
    const trimmed = record.replace(/^\s+/, '');
    if (trimmed === '') continue;
    const [sha = '', parents = '', subject = '', body = ''] = trimmed.split(UNIT);
    if (sha === '') continue;
    commits.push({
      sha,
      short: shortSha(sha),
      parents: parents.split(' ').filter((p) => p !== ''),
      subject: subject.trim(),
      body: body.trim(),
    });
  }

  return commits;
}

/**
 * Fetch one commit's changed-file list and unified diff. Called only for
 * pre-filtered candidates, so its cost is bounded by the candidate budget.
 */
export function loadCommitDiff(repoRoot: string, sha: string): CommitDiff {
  const files = git(repoRoot, ['show', '--name-only', '--format=', sha])
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const patch = git(repoRoot, ['show', '--format=', '--no-color', sha]);
  return { files, patch };
}
