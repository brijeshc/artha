import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { darkZones, moduleCoverage, scoreModule } from '../../src/analytics/coverage';
import { moduleOf } from '../../src/analytics/module';
import type { FactRow, PinRow, ScopeRow } from '../../src/build/db';
import { defaultConfig } from '../../src/config/config';
import type { ArthaIndex } from '../../src/mcp/query';

// ── helpers ─────────────────────────────────────────────────────────────────

function fact(id: string, status: string): FactRow {
  return {
    id,
    kind: id.split('.')[0] ?? 'decision',
    status,
    heading: null,
    body: null,
    severity: null,
    why: null,
    supersedes: null,
    certified_by: null,
    certified_at: null,
    source_path: null,
  };
}

function pin(fact_id: string, symbol_ref: string): PinRow {
  return { fact_id, symbol_id: symbol_ref, symbol_ref, content_hash: 'h', is_stale: 0 };
}

function fakeIndex(parts: {
  facts?: FactRow[];
  pins?: PinRow[];
  scopeFiles?: ScopeRow[];
}): ArthaIndex {
  const facts = parts.facts ?? [];
  return {
    facts,
    pins: parts.pins ?? [],
    scopeFiles: parts.scopeFiles ?? [],
    empty: facts.length === 0,
    fts: () => new Map(),
    close: () => {},
  };
}

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
