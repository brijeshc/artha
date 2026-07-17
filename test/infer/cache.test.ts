import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type SynthCache,
  evidenceHash,
  readSynthCache,
  writeSynthCache,
} from '../../src/infer/cache';

let arthaDir: string;

beforeEach(() => {
  arthaDir = join(mkdtempSync(join(tmpdir(), 'artha-cache-')), '.artha');
  mkdirSync(arthaDir, { recursive: true });
});
afterEach(() => {
  rmSync(join(arthaDir, '..'), { recursive: true, force: true });
});

const cachePath = (): string => join(arthaDir, '.inferred.json');

function sample(): SynthCache {
  return new Map([
    [
      'inferred:module:src/billing',
      { evidenceHash: 'aaa', name: 'Billing', summary: 'S1', steps: [], confidence: 'inferred' },
    ],
    [
      'inferred:flow:src/checkout#placeOrder',
      {
        evidenceHash: 'bbb',
        name: 'Place order',
        summary: 'S2',
        steps: [{ module: 'src/billing', text: 'charges the card' }],
        confidence: 'uncertain',
      },
    ],
  ]);
}

describe('synthesis cache round-trip', () => {
  it('writes and reads back the same entries, including flow step text', () => {
    writeSynthCache(arthaDir, sample());
    const back = readSynthCache(arthaDir);
    expect(back.get('inferred:module:src/billing')).toEqual({
      evidenceHash: 'aaa',
      name: 'Billing',
      summary: 'S1',
      steps: [],
      confidence: 'inferred',
    });
    expect(back.get('inferred:flow:src/checkout#placeOrder')?.steps).toEqual([
      { module: 'src/billing', text: 'charges the card' },
    ]);
  });

  it('reads a missing file as an empty cache', () => {
    expect(readSynthCache(arthaDir).size).toBe(0);
  });

  it('reads a mangled file as empty rather than throwing (never breaks the build)', () => {
    writeFileSync(cachePath(), '{ this is not: valid json ]]');
    expect(readSynthCache(arthaDir).size).toBe(0);
  });

  it('discards a cache written by a superseded schema version (forces re-infer)', () => {
    // v1 (21b-1, no step text) is discarded by the current reader, not misread.
    writeFileSync(
      cachePath(),
      JSON.stringify({
        version: 1,
        entries: { x: { evidenceHash: 'h', name: 'n', summary: 's', confidence: 'inferred' } },
      }),
    );
    expect(readSynthCache(arthaDir).size).toBe(0);
  });

  it('drops entries missing required fields, keeping the well-formed ones', () => {
    writeFileSync(
      cachePath(),
      JSON.stringify({
        version: 2,
        entries: {
          good: { evidenceHash: 'h', name: 'n', summary: 's', steps: [], confidence: 'inferred' },
          bad: { evidenceHash: 'h', name: 'n' }, // no summary/confidence
        },
      }),
    );
    const cache = readSynthCache(arthaDir);
    expect([...cache.keys()]).toEqual(['good']);
  });

  it('writes sorted, so re-saving the same map is byte-identical regardless of order', () => {
    writeSynthCache(arthaDir, sample());
    const first = readFileSync(cachePath(), 'utf8');

    const reversed: SynthCache = new Map([...sample().entries()].reverse());
    writeSynthCache(arthaDir, reversed);
    expect(readFileSync(cachePath(), 'utf8')).toBe(first);
  });
});

describe('evidenceHash (the drift key)', () => {
  const pins = [
    { symbol_ref: 'src/a.ts#A', content_hash: '111' },
    { symbol_ref: 'src/b.ts#B', content_hash: '222' },
  ];

  it('is stable for the same pins and independent of pin order', () => {
    expect(evidenceHash(pins)).toBe(evidenceHash([...pins].reverse()));
  });

  it('changes when a pinned symbol’s content hash changes (drift)', () => {
    const drifted = [pins[0], { symbol_ref: 'src/b.ts#B', content_hash: '999' }];
    expect(evidenceHash(drifted as typeof pins)).not.toBe(evidenceHash(pins));
  });

  it('marks an unresolvable pin so a fact that loses its evidence re-hashes', () => {
    const lost = [pins[0], { symbol_ref: 'src/b.ts#B', content_hash: null }];
    expect(evidenceHash(lost as typeof pins)).not.toBe(evidenceHash(pins));
  });
});
