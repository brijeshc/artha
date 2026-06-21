import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadProposed } from '../../src/review/actions';
import { App } from '../../src/review/app';
import type { CommitSource } from '../../src/review/source';
import { loadEntries, writeEntry } from '../../src/schema/load';
import type { Decision } from '../../src/schema/types';

const tick = () => new Promise((resolve) => setTimeout(resolve, 60));

const IDENTITY = { certifiedBy: 'Tester', certifiedAt: '2026-06-21' };

const FAKE_SOURCE: CommitSource = {
  found: true,
  subject: 'DECIDE: store money as cents',
  body: 'Floats drift.',
  files: ['money.ts'],
  patch: '@@ -0,0 +1 @@\n+export const cents = 0;',
};
const fakeResolve = (): CommitSource => FAKE_SOURCE;

let root: string;
let arthaDir: string;

function writeProposed(id: string, overrides: Partial<Decision> = {}): void {
  const entry: Decision = {
    id,
    kind: 'decision',
    status: 'proposed',
    title: `Title for ${id}`,
    context: 'Context.',
    decision: 'Decision.',
    mined_from: { commit: 'abc123', source: 'git-history' },
    ...overrides,
  };
  writeEntry(entry, join(arthaDir, 'decisions', `${id}.yaml`));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'artha-review-app-'));
  arthaDir = join(root, '.artha');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('review TUI', () => {
  it('shows the draft (with pins) beside its source commit, plus position and keymap', () => {
    writeProposed('decision.money', { pins: [{ symbol: 'src/money.ts#toCents' }] });
    const queue = loadProposed(arthaDir);
    const { lastFrame } = render(
      <App repoRoot={root} initialQueue={queue} identity={IDENTITY} resolveSource={fakeResolve} />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('artha review 1/1');
    expect(frame).toContain('decision.money');
    expect(frame).toContain('Title for decision.money'); // draft (left)
    expect(frame).toContain('src/money.ts#toCents'); // proposed pin (left)
    expect(frame).toContain('DECIDE: store money as cents'); // source (right)
    expect(frame).toContain('c certify');
  });

  it('certifies the current draft on `c` (one keypress → certified file)', async () => {
    writeProposed('decision.money');
    const queue = loadProposed(arthaDir);
    const { stdin } = render(
      <App repoRoot={root} initialQueue={queue} identity={IDENTITY} resolveSource={fakeResolve} />,
    );

    await tick(); // let Ink mount and attach its stdin listener
    stdin.write('c');
    await tick();

    const reloaded = loadEntries(arthaDir).entries.find((e) => e.id === 'decision.money');
    expect(reloaded?.status).toBe('certified');
    expect(reloaded?.certified_by).toBe('Tester');
    expect(reloaded?.certified_at).toBe('2026-06-21');
  });

  it('never certifies without a keypress (file stays proposed at rest)', async () => {
    writeProposed('decision.money');
    const queue = loadProposed(arthaDir);
    render(
      <App repoRoot={root} initialQueue={queue} identity={IDENTITY} resolveSource={fakeResolve} />,
    );
    await tick();
    expect(loadProposed(arthaDir).length).toBe(1);
  });

  it('rejects only after a confirm (`r` then `y` deletes the file)', async () => {
    writeProposed('decision.a');
    writeProposed('decision.b');
    const queue = loadProposed(arthaDir);
    const path = queue[0]?.source_path ?? '';
    const { stdin, lastFrame } = render(
      <App repoRoot={root} initialQueue={queue} identity={IDENTITY} resolveSource={fakeResolve} />,
    );

    await tick(); // let Ink mount and attach its stdin listener
    stdin.write('r');
    await tick();
    expect(lastFrame() ?? '').toMatch(/Reject .*deletes the file/s);
    expect(existsSync(path)).toBe(true); // not yet — awaiting confirm

    stdin.write('y');
    await tick();
    expect(existsSync(path)).toBe(false);
    expect(loadProposed(arthaDir).map((e) => e.id)).toEqual(['decision.b']);
  });

  it('navigates the queue with the arrow keys', async () => {
    writeProposed('decision.a');
    writeProposed('decision.b');
    const queue = loadProposed(arthaDir);
    const { stdin, lastFrame } = render(
      <App repoRoot={root} initialQueue={queue} identity={IDENTITY} resolveSource={fakeResolve} />,
    );

    await tick(); // let Ink mount and attach its stdin listener
    expect(lastFrame() ?? '').toContain('artha review 1/2');
    stdin.write('[C'); // right arrow
    await tick();
    expect(lastFrame() ?? '').toContain('artha review 2/2');
  });
});
