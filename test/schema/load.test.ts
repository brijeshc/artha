import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEntries, writeEntry } from '../../src/schema/load';
import type { Convention } from '../../src/schema/types';

const FIXTURES = join(__dirname, '..', 'fixtures', 'artha');

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'artha-load-'));
  for (const dir of ['decisions', 'invariants', 'conventions']) {
    mkdirSync(join(tmp, dir), { recursive: true });
  }
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('loadEntries', () => {
  it('loads all three §5 example kinds and skips a reserved kind', () => {
    const { entries, skipped } = loadEntries(FIXTURES);

    const ids = entries.map((e) => e.id).sort();
    expect(ids).toEqual([
      'convention.soft_delete',
      'decision.no_float_money',
      'invariant.money_minor_units',
    ]);
    for (const entry of entries) {
      expect(entry.source_path).toBeTypeOf('string');
    }

    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatch(/reserved-concept\.yaml$/);
  });

  it('returns empty for a missing .artha directory', () => {
    expect(loadEntries(join(tmp, 'does-not-exist'))).toEqual({ entries: [], skipped: [] });
  });

  it('throws naming both files on a duplicate id', () => {
    const body = (n: number) =>
      `id: decision.dup\nkind: decision\nstatus: proposed\ntitle: T${n}\ncontext: C\ndecision: D\n`;
    writeFileSync(join(tmp, 'decisions', 'a.yaml'), body(1));
    writeFileSync(join(tmp, 'decisions', 'b.yaml'), body(2));

    expect(() => loadEntries(tmp)).toThrowError(/Duplicate id "decision\.dup"/);
    try {
      loadEntries(tmp);
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toMatch(/a\.yaml/);
      expect(message).toMatch(/b\.yaml/);
    }
  });

  it('throws with a field path on an invalid entry', () => {
    // missing the required `decision` field
    writeFileSync(
      join(tmp, 'decisions', 'broken.yaml'),
      'id: decision.broken\nkind: decision\nstatus: proposed\ntitle: T\ncontext: C\n',
    );
    expect(() => loadEntries(tmp)).toThrowError(/\/decision: is required/);
  });

  it('round-trips a multiline field through dump → load without semantic change', () => {
    const original: Convention = {
      id: 'convention.multiline_demo',
      kind: 'convention',
      status: 'proposed',
      name: 'Multiline demo',
      rule: 'Line one of the rule.\nLine two after a break.\n\nA third line after a blank line.\n',
      scope: ['src/**'],
      tags: ['demo'],
    };

    const file = join(tmp, 'conventions', 'demo.yaml');
    writeEntry(original, file);

    const { entries } = loadEntries(tmp);
    expect(entries).toHaveLength(1);
    const { source_path, ...loaded } = entries[0] as Convention & { source_path?: string };
    expect(source_path).toBe(file);
    expect(loaded).toEqual(original);
  });

  it('does not write source_path back to disk', () => {
    const original: Convention = {
      id: 'convention.no_leak',
      kind: 'convention',
      status: 'proposed',
      name: 'No leak',
      rule: 'A single line rule.',
      scope: ['src/**'],
      source_path: '/should/not/be/written',
    };
    const file = join(tmp, 'conventions', 'leak.yaml');
    writeEntry(original, file);

    const { entries } = loadEntries(tmp);
    expect(entries[0]?.source_path).toBe(file);
  });
});
