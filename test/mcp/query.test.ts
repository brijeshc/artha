import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openArthaIndex, toFtsQuery } from '../../src/mcp/query';
import { writeFixtureIndex } from './fixture';

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'artha-query-'));
  dbPath = join(dir, '.artha', 'index.db');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('openArthaIndex (cold start)', () => {
  it('returns an empty index when the db file is missing — never throws', () => {
    const index = openArthaIndex(dbPath);
    expect(index.empty).toBe(true);
    expect(index.facts).toEqual([]);
    expect(index.fts('anything')).toEqual(new Map());
    expect(() => index.close()).not.toThrow();
  });
});

describe('openArthaIndex (built)', () => {
  it('reads facts, pins, and scope rows from the index', () => {
    writeFixtureIndex(dbPath);
    const index = openArthaIndex(dbPath);
    try {
      expect(index.empty).toBe(false);
      expect(index.facts.map((f) => f.id).sort()).toContain('decision.money');
      expect(index.pins.length).toBeGreaterThan(0);
      expect(index.scopeFiles.some((s) => s.file_path === 'src/money.ts')).toBe(true);
    } finally {
      index.close();
    }
  });

  it('runs FTS5 MATCH over heading+body, best match first', () => {
    writeFixtureIndex(dbPath);
    const index = openArthaIndex(dbPath);
    try {
      const hits = index.fts('money cents');
      expect(hits.has('decision.money')).toBe(true);
      // "cents" only appears in decision.money, so it should outscore a money-only hit.
      expect(hits.has('decision.dates')).toBe(false); // mentions neither term
      expect(index.fts('')).toEqual(new Map());
    } finally {
      index.close();
    }
  });
});

describe('toFtsQuery', () => {
  it('lowercases, de-dupes, strips punctuation, and quotes each token', () => {
    expect(toFtsQuery('Money, money & CENTS!')).toBe('"money" OR "cents"');
  });

  it('drops sub-2-char tokens and yields empty for no usable tokens', () => {
    expect(toFtsQuery('a ! ?')).toBe('');
  });
});
