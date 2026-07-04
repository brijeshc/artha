import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config/config';
import { type SymbolHit, rankSymbols, searchSymbols } from '../../src/serve/symbols';

describe('rankSymbols', () => {
  const cat: SymbolHit[] = [
    {
      ref: 'src/billing/Money.ts#Money',
      name: 'Money',
      path: 'src/billing/Money.ts',
      kind: 'class',
    },
    {
      ref: 'src/billing/Money.ts#formatMoney',
      name: 'formatMoney',
      path: 'src/billing/Money.ts',
      kind: 'function',
    },
    { ref: 'src/checkout/Cart.ts#Cart', name: 'Cart', path: 'src/checkout/Cart.ts', kind: 'class' },
  ];

  it('ranks an exact name match above a substring match', () => {
    const hits = rankSymbols(cat, 'money');
    expect(hits[0]?.name).toBe('Money');
    expect(hits.map((h) => h.name)).toContain('formatMoney'); // substring hit still returned
  });

  it('matches on the file path too, so a folder name finds its symbols', () => {
    const hits = rankSymbols(cat, 'checkout');
    expect(hits.map((h) => h.ref)).toContain('src/checkout/Cart.ts#Cart');
  });

  it('returns nothing for a blank query and respects the limit', () => {
    expect(rankSymbols(cat, '   ')).toEqual([]);
    expect(rankSymbols(cat, 'a', 1).length).toBeLessThanOrEqual(1);
  });
});

describe('searchSymbols (over a real repo)', () => {
  let repo: string;
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'artha-symbols-'));
    mkdirSync(join(repo, 'src', 'billing'), { recursive: true });
    writeFileSync(
      join(repo, 'src', 'billing', 'Money.ts'),
      'export class Money {\n  add(o: Money): Money { return o; }\n}\nexport function formatMoney(): string { return ""; }\n',
    );
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('enumerates and finds a symbol by name (no path typing)', async () => {
    const hits = await searchSymbols(repo, defaultConfig(), 'money');
    const refs = hits.map((h) => h.ref);
    expect(refs).toContain('src/billing/Money.ts#Money');
    expect(hits.some((h) => h.name === 'Money.add' && h.kind === 'method')).toBe(true);
  });

  it('a blank query returns nothing', async () => {
    expect(await searchSymbols(repo, defaultConfig(), '')).toEqual([]);
  });
});
