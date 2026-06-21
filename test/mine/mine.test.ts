import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config/config';
import type { Miner, MinerInput, MinerResult } from '../../src/mine/anthropic';
import { mine } from '../../src/mine/mine';
import { loadEntries } from '../../src/schema/load';
import { isArthaError } from '../../src/util/error';

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, env: GIT_ENV, stdio: 'pipe' });
}

function commit(cwd: string, file: string, content: string, message: string): void {
  writeFileSync(join(cwd, file), content);
  git(cwd, ['add', '-A']);
  git(cwd, ['-c', 'commit.gpgsign=false', 'commit', '-m', message]);
}

/** Stub miner: drafts when the subject is tagged `DECIDE:`, else returns no-decision. */
class StubMiner implements Miner {
  readonly calls: MinerInput[] = [];
  async mineCommit(input: MinerInput): Promise<MinerResult> {
    this.calls.push(input);
    if (input.subject.startsWith('DECIDE:')) {
      return {
        hasDecision: true,
        draft: {
          title: input.subject.replace('DECIDE:', '').trim(),
          context: 'Problem and forces.',
          decision: 'The choice we made.',
          consequences: 'The trade-off.',
        },
      };
    }
    return { hasDecision: false };
  }
}

let repo: string;
let savedKey: string | undefined;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'artha-mine-'));
  git(repo, ['init']);
  // Oldest → newest. listCommits returns newest first.
  commit(repo, 'a.ts', 'export const a = 1;\nexport const b = 2;\n', 'Initial commit');
  commit(
    repo,
    'money.ts',
    'export function toMinor(n: number) {\n  return Math.round(n * 100);\n}\n',
    'DECIDE: Store money as integer minor units because floats drift',
  );
  commit(
    repo,
    'money.ts',
    'export function toMinorUnits(n: number) {\n  return n * 100;\n}\n',
    'Tweak helper naming',
  );
  commit(
    repo,
    'package-lock.json',
    '{\n  "lockfileVersion": 3,\n  "name": "x"\n}\n',
    'Update deps',
  );

  savedKey = process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
  if (savedKey === undefined) Reflect.deleteProperty(process.env, 'ANTHROPIC_API_KEY');
  else process.env.ANTHROPIC_API_KEY = savedKey;
});

describe('mine', () => {
  it('drafts a well-formed proposed decision with mined_from provenance', async () => {
    const miner = new StubMiner();
    const report = await mine(repo, defaultConfig(), { miner, maxCommits: 0 });

    expect(report.drafted.length).toBe(1);

    const decisions = loadEntries(join(repo, '.artha')).entries; // throws if any draft is invalid
    expect(decisions.length).toBe(1);
    const [draft] = decisions;
    expect(draft?.kind).toBe('decision');
    expect(draft?.status).toBe('proposed');
    expect(draft?.mined_from?.commit).toBeTruthy();
    expect(draft?.mined_from?.source).toBe('git-history');
    expect(draft?.certified_by).toBeUndefined();
  });

  it('sends only non-skipped commits to the miner; lockfile diff costs zero spend', async () => {
    const miner = new StubMiner();
    const report = await mine(repo, defaultConfig(), { miner, maxCommits: 0 });

    // 4 candidates: initial, decision, tweak, lockfile. Lockfile is diff-skipped.
    expect(report.candidates).toBe(4);
    expect(report.scanned).toBe(3);
    expect(report.noDecision).toBe(2);
    expect(report.skipped.map((s) => s.reason)).toContain('lockfile-only');
    expect(miner.calls.length).toBe(3);
    expect(miner.calls.some((c) => c.files.includes('package-lock.json'))).toBe(false);
  });

  it('writes no file for a no-decision commit', async () => {
    const miner = new StubMiner();
    const report = await mine(repo, defaultConfig(), { miner, maxCommits: 0 });
    const decisionFiles = loadEntries(join(repo, '.artha')).entries;
    expect(decisionFiles.length).toBe(report.drafted.length);
  });

  it('is idempotent: a re-run adds no duplicate drafts and re-sends nothing', async () => {
    await mine(repo, defaultConfig(), { miner: new StubMiner(), maxCommits: 0 });

    const second = new StubMiner();
    const report = await mine(repo, defaultConfig(), { miner: second, maxCommits: 0 });

    expect(report.drafted.length).toBe(0);
    expect(report.scanned).toBe(0);
    expect(second.calls.length).toBe(0);
    expect(report.alreadyMined).toBeGreaterThan(0);
    expect(loadEntries(join(repo, '.artha')).entries.length).toBe(1);
  });

  it('honors the spend cap (maxCommits)', async () => {
    const miner = new StubMiner();
    const report = await mine(repo, defaultConfig(), { miner, maxCommits: 1 });
    expect(report.scanned).toBe(1);
    expect(miner.calls.length).toBe(1);
  });

  it('dry-run previews without an API key and writes nothing', async () => {
    Reflect.deleteProperty(process.env, 'ANTHROPIC_API_KEY');
    const report = await mine(repo, defaultConfig(), { dryRun: true });
    expect(report.candidates).toBe(4);
    expect(existsSync(join(repo, '.artha', 'decisions'))).toBe(false);
  });

  it('fails with an actionable error when ANTHROPIC_API_KEY is unset', async () => {
    Reflect.deleteProperty(process.env, 'ANTHROPIC_API_KEY');
    await expect(mine(repo, defaultConfig(), {})).rejects.toSatisfy(
      (e: unknown) => isArthaError(e) && /ANTHROPIC_API_KEY/.test((e as Error).message),
    );
  });
});
