import { describe, expect, it } from 'vitest';
import type { CommitDiff, CommitMeta } from '../../src/mine/git';
import { classifyDiff, selectCandidates } from '../../src/mine/prefilter';

function commit(overrides: Partial<CommitMeta>): CommitMeta {
  const sha = overrides.sha ?? 'a'.repeat(40);
  return {
    sha,
    short: sha.slice(0, 12),
    parents: ['p'.repeat(40)],
    subject: 'Subject',
    body: '',
    ...overrides,
  };
}

const neverMined = () => false;

describe('selectCandidates', () => {
  it('drops merge commits', () => {
    const merge = commit({ sha: '1'.repeat(40), parents: ['a'.repeat(40), 'b'.repeat(40)] });
    expect(selectCandidates([merge], neverMined)).toEqual([]);
  });

  it('drops already-mined commits', () => {
    const c = commit({ sha: '2'.repeat(40), subject: 'Real change because reasons' });
    expect(selectCandidates([c], () => true)).toEqual([]);
  });

  it('drops noise subjects (bumps, wip, version tags)', () => {
    const noise = [
      commit({ sha: '3'.repeat(40), subject: 'bump deps to 1.2.3' }),
      commit({ sha: '4'.repeat(40), subject: 'wip' }),
      commit({ sha: '5'.repeat(40), subject: 'v1.4.0' }),
      commit({ sha: '6'.repeat(40), subject: 'Merge branch main' }),
    ];
    expect(selectCandidates(noise, neverMined)).toEqual([]);
  });

  it('ranks rationale + reverts above terse commits', () => {
    const terse = commit({ sha: '7'.repeat(40), subject: 'Add endpoint' });
    const rationale = commit({
      sha: '8'.repeat(40),
      subject: 'Store money as integer minor units because floats drift',
    });
    const revert = commit({ sha: '9'.repeat(40), subject: 'Revert switch to UTC offsets' });

    const ranked = selectCandidates([terse, rationale, revert], neverMined);
    expect(ranked.map((c) => c.commit.sha)).toEqual([
      '9'.repeat(40), // revert (+3)
      '8'.repeat(40), // rationale (+2)
      '7'.repeat(40), // terse (0)
    ]);
    expect(ranked[1]?.reasons).toContain('rationale phrasing');
  });

  it('breaks score ties by recency (input order)', () => {
    const newer = commit({ sha: 'c'.repeat(40), subject: 'Add A' });
    const older = commit({ sha: 'd'.repeat(40), subject: 'Add B' });
    const ranked = selectCandidates([newer, older], neverMined);
    expect(ranked.map((c) => c.commit.sha)).toEqual(['c'.repeat(40), 'd'.repeat(40)]);
  });
});

describe('classifyDiff', () => {
  const diff = (files: string[], patch: string): CommitDiff => ({ files, patch });

  it('skips empty diffs', () => {
    expect(classifyDiff(diff([], ''))).toEqual({ skip: true, reason: 'empty diff' });
  });

  it('skips lockfile-only diffs', () => {
    const patch = '+++ b/package-lock.json\n+  "lockfileVersion": 3,\n-  "lockfileVersion": 2,';
    expect(classifyDiff(diff(['package-lock.json'], patch)).skip).toBe(true);
    expect(classifyDiff(diff(['package-lock.json'], patch)).reason).toBe('lockfile-only');
  });

  it('keeps a diff that touches a lockfile AND source', () => {
    const patch = '+const x = 1;\n+const y = 2;';
    expect(classifyDiff(diff(['package-lock.json', 'src/a.ts'], patch)).skip).toBe(false);
  });

  it('skips trivial (tiny) diffs', () => {
    expect(classifyDiff(diff(['src/a.ts'], '+x')).skip).toBe(true);
  });

  it('skips formatting-only diffs (whitespace changes)', () => {
    const patch = '-const x=1;\n-const y=2;\n+const x = 1;\n+const y = 2;';
    expect(classifyDiff(diff(['src/a.ts'], patch))).toEqual({
      skip: true,
      reason: 'formatting-only',
    });
  });

  it('keeps a substantive code change', () => {
    const patch = '+export function retry() {\n+  return backoff();\n+}';
    expect(classifyDiff(diff(['src/retry.ts'], patch)).skip).toBe(false);
  });
});
