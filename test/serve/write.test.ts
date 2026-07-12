import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { openIndex } from '../../src/build/db';
import { defaultConfig } from '../../src/config/config';
import type { ResolvedSymbol, SymbolResolver } from '../../src/resolver/SymbolResolver';
import { addPin, certifyEntry, commitWrite, setNotes, upsertEntry } from '../../src/serve/write';

// T17 write layer, exercised over a real `.artha/` tree on disk - every mutation
// is a plain YAML file (a git diff), and validation/build discipline is proven by
// reading the file back, not by trusting the return value.

let repo: string;
let arthaDir: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'artha-write-'));
  arthaDir = join(repo, '.artha');
  for (const dir of ['concepts', 'decisions', 'invariants', 'conventions', 'flows']) {
    mkdirSync(join(arthaDir, dir), { recursive: true });
  }
  mkdirSync(join(repo, 'src', 'billing'), { recursive: true });
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

const config = defaultConfig();

/** Write an entry YAML into its kind dir. */
function seed(dir: string, name: string, obj: Record<string, unknown>): string {
  const path = join(arthaDir, dir, `${name}.yaml`);
  writeFileSync(
    path,
    Object.entries(obj)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join('\n'),
    'utf8',
  );
  return path;
}

function readEntry(path: string): Record<string, unknown> {
  return parseYaml(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

/** A deterministic resolver: resolves only the refs it is told about. */
function fakeResolver(known: string[]): SymbolResolver {
  const hit = (ref: string): ResolvedSymbol => ({
    symbolRef: ref,
    symbolId: ref,
    filePath: join(repo, ref.split('#')[0] ?? ''),
    startLine: 1,
    endLine: 1,
    contentHash: 'h',
  });
  return {
    resolve: (ref) => (known.includes(ref) ? hit(ref) : null),
    hash: () => 'h',
    list: () => [],
    enumLikes: () => [],
    imports: () => [],
  };
}

describe('certifyEntry', () => {
  it('stamps a proposed entry certified and writes valid YAML back', () => {
    const path = seed('concepts', 'sub', {
      id: 'concept.sub',
      kind: 'concept',
      status: 'proposed',
      name: 'Subscription',
      summary: 'Paid recurring access.',
    });

    const out = certifyEntry(repo, 'concept.sub');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.status).toBe('certified');

    const entry = readEntry(path);
    expect(entry.status).toBe('certified');
    expect(typeof entry.certified_by).toBe('string');
    expect(entry.certified_by).not.toBe('');
    expect(entry.certified_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('404s an unknown id and writes nothing', () => {
    const out = certifyEntry(repo, 'concept.nope');
    expect(out).toMatchObject({ ok: false, code: 404 });
  });
});

describe('addPin (link)', () => {
  const seedSub = () =>
    seed('concepts', 'sub', {
      id: 'concept.sub',
      kind: 'concept',
      status: 'proposed',
      name: 'Subscription',
      summary: 'Paid recurring access.',
    });

  it('adds a resolvable pin and preserves the entry standing', () => {
    const path = seedSub();
    const ref = 'src/billing/Sub.ts#Sub';
    const out = addPin(repo, 'concept.sub', ref, fakeResolver([ref]));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.status).toBe('proposed'); // linking does not change standing

    const entry = readEntry(path);
    expect(entry.pins).toEqual([{ symbol: ref }]);
  });

  it('refuses an unresolvable symbol, writing nothing', () => {
    const path = seedSub();
    const out = addPin(repo, 'concept.sub', 'src/billing/Sub.ts#Ghost', fakeResolver([]));
    expect(out).toMatchObject({ ok: false, code: 400 });
    expect(readEntry(path).pins).toBeUndefined();
  });

  it('is idempotent for an already-linked symbol (no duplicate pin)', () => {
    const path = seedSub();
    const ref = 'src/billing/Sub.ts#Sub';
    const resolver = fakeResolver([ref]);
    addPin(repo, 'concept.sub', ref, resolver);
    const again = addPin(repo, 'concept.sub', ref, resolver);
    expect(again.ok).toBe(true);
    expect(readEntry(path).pins).toEqual([{ symbol: ref }]);
  });

  it('404s an unknown entry', () => {
    seedSub();
    const out = addPin(repo, 'concept.ghost', 'src/billing/Sub.ts#Sub', fakeResolver(['x']));
    expect(out).toMatchObject({ ok: false, code: 404 });
  });
});

describe('upsertEntry (edit)', () => {
  const seedCertifiedSub = (path = 'sub') =>
    seed('concepts', path, {
      id: 'concept.sub',
      kind: 'concept',
      status: 'certified',
      name: 'Subscription',
      summary: 'Old summary.',
      certified_by: 'ada',
      certified_at: '2026-06-01',
      tags: ['billing'],
      pins: [{ symbol: 'src/billing/Sub.ts#Sub' }],
    });

  it('merges a partial patch, preserves unshown fields, and un-certifies', () => {
    const path = seedCertifiedSub();
    const out = upsertEntry(repo, { id: 'concept.sub', summary: 'A clearer summary.' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.status).toBe('proposed');

    const entry = readEntry(path);
    expect(entry.summary).toBe('A clearer summary.');
    // fields the UI never sent survive the merge
    expect(entry.tags).toEqual(['billing']);
    expect(entry.pins).toEqual([{ symbol: 'src/billing/Sub.ts#Sub' }]);
    // editing certified content drops it back to proposed (must be re-vouched)
    expect(entry.status).toBe('proposed');
    expect(entry.certified_by).toBeUndefined();
    expect(entry.certified_at).toBeUndefined();
  });

  it('creates a new entry file for a new id (proposed)', () => {
    const out = upsertEntry(repo, {
      id: 'concept.checkout',
      kind: 'concept',
      name: 'Checkout',
      summary: 'Cart to paid order.',
    });
    expect(out).toMatchObject({ ok: true, created: true, status: 'proposed' });

    const path = join(arthaDir, 'concepts', 'concept.checkout.yaml');
    expect(existsSync(path)).toBe(true);
    expect(readEntry(path)).toMatchObject({ status: 'proposed', name: 'Checkout' });
  });

  it('reports a schema-breaking edit and never writes it', () => {
    const path = seedCertifiedSub();
    const out = upsertEntry(repo, { id: 'concept.sub', summary: 42 });
    expect(out).toMatchObject({ ok: false, code: 422 });
    // the file is untouched: still the certified original
    expect(readEntry(path)).toMatchObject({ status: 'certified', summary: 'Old summary.' });
  });

  it('refuses to change an entry kind', () => {
    seedCertifiedSub();
    const out = upsertEntry(repo, { id: 'concept.sub', kind: 'decision' });
    expect(out).toMatchObject({ ok: false, code: 409 });
  });

  it('never writes certified via edit, even when the payload asks for it', () => {
    const path = seed('concepts', 'draft', {
      id: 'concept.draft',
      kind: 'concept',
      status: 'proposed',
      name: 'Draft',
      summary: 'A draft.',
    });
    const out = upsertEntry(repo, {
      id: 'concept.draft',
      status: 'certified',
      certified_by: 'attacker',
      certified_at: '2020-01-01',
      summary: 'sneaky',
    });
    expect(out.ok).toBe(true);
    const entry = readEntry(path);
    expect(entry.status).toBe('proposed');
    expect(entry.certified_by).toBeUndefined();
  });
});

describe('setNotes (the delta band, D6)', () => {
  const seedCertifiedSub = () =>
    seed('concepts', 'sub', {
      id: 'concept.sub',
      kind: 'concept',
      status: 'certified',
      name: 'Subscription',
      summary: 'Paid recurring access.',
      certified_by: 'ada',
      certified_at: '2026-06-01',
      pins: [{ symbol: 'src/billing/Sub.ts#Sub' }],
    });

  it('records human ink WITHOUT un-certifying (additive, unlike an edit)', () => {
    const path = seedCertifiedSub();
    const out = setNotes(repo, 'concept.sub', '  Retries stop after 3 attempts.  ');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    // the vouched claim is untouched - the delta is layered on top
    expect(out.status).toBe('certified');

    const entry = readEntry(path);
    expect(entry.notes).toBe('Retries stop after 3 attempts.'); // trimmed
    expect(entry.status).toBe('certified');
    expect(entry.certified_by).toBe('ada');
    expect(entry.certified_at).toBe('2026-06-01');
    // additive: the pins the UI never sent survive
    expect(entry.pins).toEqual([{ symbol: 'src/billing/Sub.ts#Sub' }]);
  });

  it('clears the field entirely when given an empty string', () => {
    const path = seedCertifiedSub();
    setNotes(repo, 'concept.sub', 'temporary note');
    expect(readEntry(path).notes).toBe('temporary note');
    const out = setNotes(repo, 'concept.sub', '   ');
    expect(out.ok).toBe(true);
    expect(readEntry(path).notes).toBeUndefined(); // omitted, not a blank string
  });

  it('404s an unknown entry and refuses an inferred (un-materialized) id', () => {
    expect(setNotes(repo, 'concept.ghost', 'x')).toMatchObject({ ok: false, code: 404 });
    expect(setNotes(repo, 'inferred:concept:src/x.ts#Y', 'x')).toMatchObject({
      ok: false,
      code: 404,
    });
  });
});

describe('commitWrite (transactional rebuild + rollback)', () => {
  const deps = () => ({
    repoRoot: repo,
    config,
    embedder: null,
    dbPath: join(arthaDir, 'index.db'),
  });

  it('commits a certify and rebuilds the index to match', async () => {
    seed('concepts', 'sub', {
      id: 'concept.sub',
      kind: 'concept',
      status: 'proposed',
      name: 'Subscription',
      summary: 'Paid recurring access.',
    });

    const result = await commitWrite(deps(), () => certifyEntry(repo, 'concept.sub'));
    expect(result).toMatchObject({ ok: true, status: 'certified' });

    // the derived index reflects the new YAML
    const db = openIndex(join(arthaDir, 'index.db'));
    try {
      const row = db.prepare('SELECT status FROM artha_facts WHERE id = ?').get('concept.sub') as {
        status: string;
      };
      expect(row.status).toBe('certified');
    } finally {
      db.close();
    }
  });

  it('rolls the YAML back when the rebuild fails, leaving disk buildable', async () => {
    const subPath = seed('concepts', 'sub', {
      id: 'concept.sub',
      kind: 'concept',
      status: 'proposed',
      name: 'Subscription',
      summary: 'Paid recurring access.',
    });
    // A second entry whose pin can never resolve → any rebuild fails.
    seed('concepts', 'broken', {
      id: 'concept.broken',
      kind: 'concept',
      status: 'proposed',
      name: 'Broken',
      summary: 'Pinned at a symbol that does not exist.',
      pins: [{ symbol: 'src/billing/Missing.ts#Missing' }],
    });

    const result = await commitWrite(deps(), () => certifyEntry(repo, 'concept.sub'));
    expect(result).toMatchObject({ ok: false, code: 422 });
    if (result.ok) return;
    expect(result.error).toContain('rebuild failed');

    // the certify was rolled back: sub is proposed again on disk
    expect(readEntry(subPath).status).toBe('proposed');
  });
});
