import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { moduleChurn } from '../../src/analytics/churn';

let repo: string;

function git(args: string[], env: Record<string, string> = {}): void {
  execFileSync('git', args, { cwd: repo, env: { ...process.env, ...env }, stdio: 'pipe' });
}

/** Commit a file with a fixed author/committer date (controls the churn window). */
function commit(file: string, content: string, isoDate: string): void {
  const abs = join(repo, file);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  git(['add', '-A']);
  git(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', `touch ${file}`], {
    GIT_AUTHOR_DATE: isoDate,
    GIT_COMMITTER_DATE: isoDate,
  });
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'artha-churn-'));
  git(['init', '-q']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Test']);
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

const NOW = new Date('2026-06-24T00:00:00Z');
const churn = () => moduleChurn(repo, ['src'], { now: NOW });

describe('moduleChurn', () => {
  it('counts commits per module, deduping multiple files in one commit', () => {
    // one commit touching two files in src/hot → counts once for src/hot
    mkdirSync(join(repo, 'src', 'hot'), { recursive: true });
    writeFileSync(join(repo, 'src', 'hot', 'a.ts'), 'export const a = 1;\n');
    writeFileSync(join(repo, 'src', 'hot', 'b.ts'), 'export const b = 1;\n');
    git(['add', '-A']);
    git(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'two files, one module'], {
      GIT_AUTHOR_DATE: '2026-06-20T10:00:00',
      GIT_COMMITTER_DATE: '2026-06-20T10:00:00',
    });
    commit('src/hot/a.ts', 'export const a = 2;\n', '2026-06-21T10:00:00');
    commit('src/hot/a.ts', 'export const a = 3;\n', '2026-06-22T10:00:00');
    commit('src/calm/c.ts', 'export const c = 1;\n', '2026-06-19T10:00:00');

    const result = churn();
    expect(result.get('src/hot')).toBe(3);
    expect(result.get('src/calm')).toBe(1);
  });

  it('excludes commits older than the 90-day window', () => {
    // chronological order: the old commit is the root, the recent one is HEAD —
    // git log --since walks back from HEAD and drops the out-of-window ancestor.
    commit('src/old/a.ts', 'export const a = 1;\n', '2026-01-01T10:00:00'); // ~175 days back
    commit('src/recent/a.ts', 'export const a = 1;\n', '2026-06-20T10:00:00');

    const result = churn();
    expect(result.get('src/recent')).toBe(1);
    expect(result.has('src/old')).toBe(false);
  });

  it('ignores non-source files (outside the source roots)', () => {
    commit('README.md', '# readme\n', '2026-06-20T10:00:00');
    commit('src/app/a.ts', 'export const a = 1;\n', '2026-06-20T11:00:00');

    const result = churn();
    expect([...result.keys()]).toEqual(['src/app']);
  });

  it('returns an empty map for a non-git directory (graceful, no throw)', () => {
    const notRepo = mkdtempSync(join(tmpdir(), 'artha-nogit-'));
    try {
      expect(moduleChurn(notRepo, ['src'], { now: NOW }).size).toBe(0);
    } finally {
      rmSync(notRepo, { recursive: true, force: true });
    }
  });
});
