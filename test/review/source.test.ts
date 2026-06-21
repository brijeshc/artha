import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadCommitSource } from '../../src/review/source';

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8', stdio: 'pipe' });
}

let repo: string;
let sha: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'artha-source-'));
  git(repo, ['init']);
  writeFileSync(join(repo, 'money.ts'), 'export const cents = 0;\n');
  git(repo, ['add', '-A']);
  git(repo, [
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-m',
    'DECIDE: store money as cents\n\nFloats drift.',
  ]);
  sha = git(repo, ['rev-parse', 'HEAD']).trim();
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe('loadCommitSource', () => {
  it('resolves subject, body, files, and a unified diff', () => {
    const source = loadCommitSource(repo, sha);
    expect(source.found).toBe(true);
    expect(source.subject).toBe('DECIDE: store money as cents');
    expect(source.body).toBe('Floats drift.');
    expect(source.files).toContain('money.ts');
    expect(source.patch).toMatch(/\+export const cents/);
  });

  it('returns { found: false } for an unresolvable ref (never throws)', () => {
    expect(loadCommitSource(repo, 'deadbeefdeadbeef')).toEqual({ found: false });
  });
});
