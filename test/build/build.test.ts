import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildIndex } from '../../src/build/build';
import { openIndex } from '../../src/build/db';
import { defaultConfig } from '../../src/config/config';
import { loadEntries } from '../../src/schema/load';

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'artha-build-'));
  for (const dir of ['decisions', 'invariants', 'conventions']) {
    mkdirSync(join(repo, '.artha', dir), { recursive: true });
  }
  mkdirSync(join(repo, 'src', 'billing'), { recursive: true });
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

const ORIGINAL_ADD = '    return new Money(this.amount + o.amount);';

function money(addBody: string): void {
  writeFileSync(
    join(repo, 'src', 'billing', 'Money.ts'),
    `export class Money {\n  add(o: Money): Money {\n${addBody}\n  }\n}\n`,
  );
}

function writeEntryFile(
  kind: 'decisions' | 'invariants' | 'conventions',
  name: string,
  yaml: string,
): void {
  writeFileSync(join(repo, '.artha', kind, name), yaml);
}

/** A certified decision pinned to Money.add, with a blank content_hash. */
function certifiedDecisionYaml(): string {
  return [
    'id: decision.money',
    'kind: decision',
    'status: certified',
    'title: Money as integer minor units',
    'context: rounding drift',
    'decision: Store money as integer minor units never floats.',
    'pins:',
    '  - symbol: src/billing/Money.ts#Money.add',
    'certified_by: brijesh',
    'certified_at: 2026-06-20',
    '',
  ].join('\n');
}

const dbPath = (): string => join(repo, '.artha', 'index.db');
const run = () => buildIndex(repo, defaultConfig());

function rows(sql: string, ...params: (string | number)[]): Record<string, unknown>[] {
  const db = openIndex(dbPath());
  try {
    return db.prepare(sql).all(...params) as Record<string, unknown>[];
  } finally {
    db.close();
  }
}

describe('buildIndex — emit', () => {
  it('succeeds with an empty index on an empty .artha (no error)', async () => {
    const report = await run();
    expect(report.errors).toEqual([]);
    expect(report.emitted).toBe(0);
    expect(existsSync(dbPath())).toBe(true);
    expect(rows('SELECT count(*) AS n FROM artha_facts')[0]?.n).toBe(0);
  });

  it('validates, resolves a pin, fills the hash, and emits a searchable index', async () => {
    money(ORIGINAL_ADD);
    writeEntryFile('decisions', 'money.yaml', certifiedDecisionYaml());

    const report = await run();
    expect(report.errors).toEqual([]);
    expect(report.emitted).toBe(1);

    const facts = rows('SELECT * FROM artha_facts');
    expect(facts).toHaveLength(1);
    expect(facts[0]?.heading).toBe('Money as integer minor units');
    expect(facts[0]?.body).toContain('integer minor units');
    expect(facts[0]?.source_path).toBe('.artha/decisions/money.yaml');

    const pins = rows('SELECT * FROM artha_pins');
    expect(pins[0]?.symbol_ref).toBe('src/billing/Money.ts#Money.add');
    expect(pins[0]?.symbol_id).toBe('src/billing/Money.ts#Money.add');
    expect(pins[0]?.content_hash).toMatch(/^[0-9a-f]{6}$/);
    expect(pins[0]?.is_stale).toBe(0);

    const hits = rows("SELECT id FROM artha_fts WHERE artha_fts MATCH 'minor'");
    expect(hits.map((r) => r.id)).toContain('decision.money');
  });

  it('expands scope into files, stores provenance, and warns on a dangling ref', async () => {
    money(ORIGINAL_ADD);
    writeEntryFile(
      'invariants',
      'money.yaml',
      [
        'id: invariant.money',
        'kind: invariant',
        'status: proposed',
        'name: Money is integer minor units',
        'rule: All money is integer minor units.',
        'scope:',
        '  - "src/**/*.ts"',
        'why: decision.missing',
        'mined_from: { commit: abc123 }',
        '',
      ].join('\n'),
    );

    const report = await run();
    expect(report.errors).toEqual([]);
    expect(report.warnings.some((w) => w.includes("dangling reference 'decision.missing'"))).toBe(
      true,
    );

    const scope = rows('SELECT file_path FROM artha_scope_files');
    expect(scope.map((r) => r.file_path)).toContain('src/billing/Money.ts');
    const prov = rows('SELECT ref_kind, ref FROM artha_provenance');
    expect(prov[0]).toMatchObject({ ref_kind: 'commit', ref: 'abc123' });
  });
});

describe('buildIndex — pins & staleness', () => {
  it('fails the build, naming the ref, when a pin does not resolve', async () => {
    money(ORIGINAL_ADD);
    writeEntryFile(
      'decisions',
      'bad.yaml',
      [
        'id: decision.bad',
        'kind: decision',
        'status: proposed',
        'title: Bad pin',
        'context: c',
        'decision: d',
        'pins:',
        '  - symbol: src/billing/Money.ts#Money.doesNotExist',
        '',
      ].join('\n'),
    );

    const report = await run();
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain('Money.doesNotExist');
    expect(report.emitted).toBe(0);
    expect(existsSync(dbPath())).toBe(false); // no index emitted on failure
  });

  it('flips a certified entry to stale on disk when the pinned logic changes', async () => {
    money(ORIGINAL_ADD);
    writeEntryFile('decisions', 'money.yaml', certifiedDecisionYaml());

    const first = await run();
    expect(first.staled).toEqual([]); // blank hash filled, no flip

    money('    return new Money(this.amount + o.amount + 1);'); // logic change
    const second = await run();

    expect(second.staled).toContain('decision.money');
    expect(loadEntries(join(repo, '.artha')).entries[0]?.status).toBe('stale');
    const pins = rows('SELECT is_stale FROM artha_pins');
    expect(pins[0]?.is_stale).toBe(1);
  });

  it('does NOT flip on a reformat-only change to the pinned symbol', async () => {
    money(ORIGINAL_ADD);
    writeEntryFile('decisions', 'money.yaml', certifiedDecisionYaml());
    await run();

    // same logic, different whitespace / blank lines
    money('\n        return new Money(this.amount  +  o.amount);\n');
    const report = await run();

    expect(report.staled).toEqual([]);
    expect(loadEntries(join(repo, '.artha')).entries[0]?.status).toBe('certified');
    expect(rows('SELECT status FROM artha_facts')[0]?.status).toBe('certified');
  });

  it('clears stale when a drifted entry is re-certified', async () => {
    money(ORIGINAL_ADD);
    writeEntryFile('decisions', 'money.yaml', certifiedDecisionYaml());
    await run();
    money('    return new Money(this.amount + o.amount + 1);');
    await run(); // → stale, with the drifted hash now stored

    // simulate `artha review` re-certifying: flip status back to certified
    const file = join(repo, '.artha', 'decisions', 'money.yaml');
    writeFileSync(file, readFileSync(file, 'utf8').replace('status: stale', 'status: certified'));

    const report = await run(); // code unchanged since → stored hash matches
    expect(report.staled).toEqual([]);
    expect(rows('SELECT status FROM artha_facts')[0]?.status).toBe('certified');
    expect(rows('SELECT is_stale FROM artha_pins')[0]?.is_stale).toBe(0);
  });
});
