import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { darkZones, moduleCoverage, scoreModule, valueQueue } from '../../src/analytics/coverage';
import { moduleOf } from '../../src/analytics/module';
import { defaultConfig } from '../../src/config/config';
import type { ArthaIndex } from '../../src/mcp/query';
import { fact, fakeIndex, pin } from '../helpers/fakeIndex';

// ── moduleOf ──────────────────────────────────────────────────────────────────

describe('moduleOf', () => {
  it('maps a file to its top-level folder under a source root', () => {
    expect(moduleOf('src/billing/Money.ts', ['src'])).toBe('src/billing');
    expect(moduleOf('src/app.ts', ['src'])).toBe('src'); // directly under the root
    expect(moduleOf('packages/core/src/x.ts', ['packages/core'])).toBe('packages/core/src');
  });

  it('returns null for a file outside every source root', () => {
    expect(moduleOf('lib/x.ts', ['src'])).toBeNull();
    expect(moduleOf('README.md', ['src'])).toBeNull();
  });

  it('normalizes backslashes', () => {
    expect(moduleOf('src\\billing\\Money.ts', ['src'])).toBe('src/billing');
  });
});

// ── moduleCoverage ────────────────────────────────────────────────────────────

describe('moduleCoverage', () => {
  it('counts certified vs stale facts per module, deduping by fact', () => {
    const index = fakeIndex({
      facts: [
        fact('decision.a', 'certified'),
        fact('invariant.b', 'stale'),
        fact('decision.c', 'proposed'), // drafts are not meaning — excluded
      ],
      pins: [
        pin('decision.a', 'src/billing/Money.ts#Money'),
        pin('decision.a', 'src/billing/Tax.ts#Tax'), // same module → counts once
        pin('invariant.b', 'src/billing/Money.ts#round'),
        pin('decision.c', 'src/billing/Draft.ts#Draft'),
      ],
    });

    const cov = moduleCoverage(index, ['src']);
    expect(cov.get('src/billing')).toEqual({ certified: 1, stale: 1 });
  });

  it('attributes scope-file coverage too, and ignores out-of-root pins', () => {
    const index = fakeIndex({
      facts: [fact('convention.x', 'certified')],
      scopeFiles: [
        { fact_id: 'convention.x', file_path: 'src/api/routes.ts' },
        { fact_id: 'convention.x', file_path: 'vendor/lib.ts' }, // outside src → ignored
      ],
    });
    const cov = moduleCoverage(index, ['src']);
    expect(cov.get('src/api')).toEqual({ certified: 1, stale: 0 });
    expect(cov.has('vendor')).toBe(false);
  });
});

// ── scoreModule (OQ4 formula, isolated) ───────────────────────────────────────

describe('scoreModule', () => {
  it('is 0 when there is no coverage (the darkest)', () => {
    expect(scoreModule({ churn: 0, coverage: 0, freshness: 1 })).toBe(0);
    expect(scoreModule({ churn: 50, coverage: 0, freshness: 1 })).toBe(0);
  });

  it('is the product coverage × freshness × 1/(1+churn)', () => {
    expect(scoreModule({ churn: 0, coverage: 1, freshness: 1 })).toBe(1);
    expect(scoreModule({ churn: 9, coverage: 1, freshness: 1 })).toBeCloseTo(0.1);
    expect(scoreModule({ churn: 1, coverage: 0.5, freshness: 0.5 })).toBeCloseTo(0.125);
  });

  it('moves the right direction in each term', () => {
    const base = { churn: 2, coverage: 0.5, freshness: 1 };
    expect(scoreModule({ ...base, churn: 5 })).toBeLessThan(scoreModule(base)); // more churn → darker
    expect(scoreModule({ ...base, coverage: 0.9 })).toBeGreaterThan(scoreModule(base));
    expect(scoreModule({ ...base, freshness: 0.5 })).toBeLessThan(scoreModule(base)); // staler → darker
  });
});

// ── darkZones (integration: git churn + index coverage) ───────────────────────

let repo: string;
const NOW = new Date('2026-06-24T00:00:00Z');

function git(args: string[], env: Record<string, string> = {}): void {
  execFileSync('git', args, { cwd: repo, env: { ...process.env, ...env }, stdio: 'pipe' });
}

function commit(file: string, content: string, isoDate = '2026-06-20T10:00:00'): void {
  const abs = join(repo, file);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  git(['add', '-A']);
  git(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', `touch ${file}`], {
    GIT_AUTHOR_DATE: isoDate,
    GIT_COMMITTER_DATE: isoDate,
  });
}

/** Churn module `name` `times` times (distinct commits). */
function churnModule(name: string, times: number): void {
  for (let i = 0; i < times; i++) commit(`src/${name}/f.ts`, `export const v = ${i};\n`);
}

describe('darkZones', () => {
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'artha-dz-'));
    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test']);
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  const dz = (index: ArthaIndex) => darkZones(repo, index, defaultConfig(), { now: NOW });

  it('ranks a high-churn/no-meaning module above a low-churn/covered one (deterministic)', () => {
    churnModule('hot', 4);
    churnModule('calm', 1);
    const index = fakeIndex({
      facts: [fact('concept.calm', 'certified')],
      pins: [pin('concept.calm', 'src/calm/f.ts#calm')],
    });

    const ranked = dz(index);
    expect(ranked[0]?.module).toBe('src/hot');
    expect(ranked.at(-1)?.module).toBe('src/calm');
    const hot = ranked.find((r) => r.module === 'src/hot');
    const calm = ranked.find((r) => r.module === 'src/calm');
    expect(hot?.score).toBe(0);
    expect(calm?.score).toBeGreaterThan(0);
    // deterministic: a second identical call returns the same ranking
    expect(dz(index)).toEqual(ranked);
  });

  it('lowers a module’s dark-zone priority once a certified fact is added', () => {
    churnModule('a', 2);
    churnModule('b', 2);

    const before = dz(fakeIndex({}));
    // both uncovered → score 0, tie broken by name → [a, b]
    expect(before.map((r) => r.module)).toEqual(['src/a', 'src/b']);

    const after = dz(
      fakeIndex({
        facts: [fact('concept.a', 'certified')],
        pins: [pin('concept.a', 'src/a/f.ts#a')],
      }),
    );
    // a is now covered → it sinks below the still-dark b
    expect(after.map((r) => r.module)).toEqual(['src/b', 'src/a']);
    expect(after.find((r) => r.module === 'src/a')?.score).toBeGreaterThan(0);
  });

  it('ranks a stale-only module darker than an equally-churned certified one', () => {
    churnModule('x', 2);
    churnModule('y', 2);
    const index = fakeIndex({
      facts: [fact('decision.x', 'stale'), fact('decision.y', 'certified')],
      pins: [pin('decision.x', 'src/x/f.ts#x'), pin('decision.y', 'src/y/f.ts#y')],
    });

    const ranked = dz(index);
    expect(ranked.map((r) => r.module)).toEqual(['src/x', 'src/y']);
    expect(ranked.find((r) => r.module === 'src/x')?.score).toBe(0); // no certified meaning
    expect(ranked.find((r) => r.module === 'src/y')?.score).toBeGreaterThan(0);
  });

  it('cold start: empty index → every churned module is a dark zone, no error', () => {
    churnModule('hot', 3);
    churnModule('calm', 1);

    const ranked = dz(fakeIndex({}));
    expect(ranked.map((r) => r.module).sort()).toEqual(['src/calm', 'src/hot']);
    expect(ranked.every((r) => r.score === 0)).toBe(true);
    // high-churn leads among equally-dark (score-0) modules
    expect(ranked[0]?.module).toBe('src/hot');
  });
});

describe('valueQueue (D10 - value, not darkness)', () => {
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'artha-vq-'));
    git(['init', '-q']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test']);
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  const vq = (index: ArthaIndex) => valueQueue(repo, index, defaultConfig(), { now: NOW });

  it('lifts a foundational (many-imported) dark module above an equally-churned leaf', () => {
    churnModule('core', 2);
    churnModule('leaf', 2);
    // three distinct modules import core; nothing imports leaf.
    const index = fakeIndex({
      refs: [
        { from_module: 'src/a', to_module: 'src/core', count: 5 },
        { from_module: 'src/b', to_module: 'src/core', count: 1 },
        { from_module: 'src/c', to_module: 'src/core', count: 1 },
        { from_module: 'src/core', to_module: 'src/core', count: 9 }, // self-edge ignored
      ],
    });

    const ranked = vq(index);
    const core = ranked.find((r) => r.module === 'src/core');
    const leaf = ranked.find((r) => r.module === 'src/leaf');
    // reach = distinct importers (self-edge excluded) = 3
    expect(core?.reach).toBe(3);
    expect(leaf?.reach).toBe(0);
    // both dark + equally churned, but core is pulled far more → it leads
    expect(core?.value).toBeGreaterThan(leaf?.value ?? 0);
    expect(ranked.indexOf(core ?? ranked[0])).toBeLessThan(ranked.indexOf(leaf ?? ranked[0]));
    // deterministic
    expect(vq(index)).toEqual(ranked);
  });

  it('sinks a well-vouched module: low uncertainty → low value (same churn, no reach)', () => {
    churnModule('done', 3);
    churnModule('dark', 3); // equal churn, so uncertainty is the only differentiator
    const index = fakeIndex({
      // three certified facts on `done` → deep coverage → low uncertainty
      facts: ['a', 'b', 'c'].map((n) => fact(`concept.done_${n}`, 'certified')),
      pins: ['a', 'b', 'c'].map((n) => pin(`concept.done_${n}`, `src/done/${n}.ts#${n}`)),
    });

    const ranked = vq(index);
    const done = ranked.find((r) => r.module === 'src/done');
    const dark = ranked.find((r) => r.module === 'src/dark');
    // the vouched module is far less uncertain than the dark one…
    expect(done?.uncertainty).toBeLessThan(dark?.uncertainty ?? 1);
    // …so at equal churn it sinks below the still-dark module
    expect(dark?.value).toBeGreaterThan(done?.value ?? 0);
    expect(ranked[0]?.module).toBe('src/dark');
  });
});
