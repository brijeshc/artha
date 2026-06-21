import type { CommitDiff, CommitMeta } from './git';

/** A commit that survived metadata pre-filtering, with its rank. */
export interface Candidate {
  commit: CommitMeta;
  /** Higher = more likely to carry a real decision. Drives candidate order. */
  score: number;
  /** Human-readable scoring signals, for `--dry-run` and debug output. */
  reasons: string[];
}

/** Verdict for the diff-level (second-stage) skip checks. */
export interface DiffVerdict {
  skip: boolean;
  reason?: string;
}

// Subjects that are almost never a real decision — skipped before the LLM.
const NOISE_SUBJECT =
  /^(merge\b|wip\b|fixup!|squash!|amend!|bump\b|chore\(deps\)|release\b|v?\d+\.\d+\.\d+\b|typo\b|formatting\b|lint\b|prettier\b|rename\b|whitespace\b)/i;

// Rationale phrasing — the strongest signal a commit explains *why*.
const RATIONALE = /\b(because|instead of|rather than|in order to|so that|to avoid|to prevent)\b/i;

// Decision/design vocabulary — a weaker signal than explicit rationale.
const DESIGN = /\b(decide|decided|chose|choose|approach|trade-?off|design|architecture|migrate)\b/i;

const ISSUE_REF = /(#\d+|\bPR\b|\bgh-\d+)/i;

// Files whose changes are mechanical and carry no decision on their own.
const LOCKFILE =
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|cargo\.lock|poetry\.lock|gemfile\.lock|composer\.lock|go\.sum)$/i;

/** Minimum changed content lines below which a commit is "trivial". */
const MIN_CHURN = 2;

/**
 * Metadata-only pre-filter: drop merges and already-mined commits, score the
 * rest by message signals, and return them ranked (highest score first, ties
 * broken by recency). This runs before any diff is read, so it's the cheap
 * cost-control lever — diffs and LLM calls only happen for what survives here.
 */
export function selectCandidates(
  commits: CommitMeta[],
  isMined: (commit: CommitMeta) => boolean,
): Candidate[] {
  const candidates: Candidate[] = [];

  for (const commit of commits) {
    if (commit.parents.length > 1) continue; // merge commit
    if (isMined(commit)) continue;
    if (NOISE_SUBJECT.test(commit.subject)) continue;
    candidates.push({ ...scoreCommit(commit), commit });
  }

  // `commits` is newest-first, so the array index is a stable recency tiebreaker.
  return candidates
    .map((c, index) => ({ c, index }))
    .sort((a, b) => b.c.score - a.c.score || a.index - b.index)
    .map(({ c }) => c);
}

function scoreCommit(commit: CommitMeta): { score: number; reasons: string[] } {
  const text = `${commit.subject}\n${commit.body}`;
  let score = 0;
  const reasons: string[] = [];

  if (/\brevert\b/i.test(text)) {
    score += 3;
    reasons.push('revert');
  }
  if (RATIONALE.test(text)) {
    score += 2;
    reasons.push('rationale phrasing');
  }
  if (DESIGN.test(text)) {
    score += 1;
    reasons.push('design vocabulary');
  }
  if (ISSUE_REF.test(text)) {
    score += 1;
    reasons.push('issue/PR ref');
  }
  if (commit.body.length > 80) {
    score += 1;
    reasons.push('substantive message body');
  }

  return { score, reasons };
}

/**
 * Diff-level (second-stage) skip checks for a candidate, run after its diff is
 * fetched but before any LLM call. Catches mechanical changes that metadata
 * alone can't: lockfile-only churn, pure-formatting diffs, and trivially small
 * changes. A `skip: true` verdict means zero LLM spend for that commit.
 */
export function classifyDiff(diff: CommitDiff): DiffVerdict {
  if (diff.files.length === 0 || diff.patch.trim() === '') {
    return { skip: true, reason: 'empty diff' };
  }

  if (diff.files.every((file) => LOCKFILE.test(file))) {
    return { skip: true, reason: 'lockfile-only' };
  }

  const { added, removed } = changedLines(diff.patch);
  if (added.length + removed.length < MIN_CHURN) {
    return { skip: true, reason: 'trivial (tiny diff)' };
  }

  if (isFormattingOnly(added, removed)) {
    return { skip: true, reason: 'formatting-only' };
  }

  return { skip: false };
}

/** Extract the added/removed *content* lines from a unified diff. */
function changedLines(patch: string): { added: string[]; removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added.push(line.slice(1));
    else if (line.startsWith('-') && !line.startsWith('---')) removed.push(line.slice(1));
  }
  return { added, removed };
}

/**
 * A diff is formatting-only when the added and removed lines are identical once
 * whitespace is normalized — i.e. nothing changed but indentation/spacing. A
 * pure addition or deletion is never formatting-only.
 */
function isFormattingOnly(added: string[], removed: string[]): boolean {
  if (added.length === 0 || removed.length === 0) return false;
  // Strip *all* whitespace so reformatting (indentation, spaces around
  // operators) compares equal; a non-whitespace change won't.
  const norm = (lines: string[]) =>
    lines
      .map((l) => l.replace(/\s+/g, ''))
      .filter((l) => l !== '')
      .sort();
  const a = norm(added);
  const b = norm(removed);
  if (a.length !== b.length) return false;
  return a.every((line, i) => line === b[i]);
}
