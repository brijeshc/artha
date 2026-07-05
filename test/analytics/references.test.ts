import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  computeReferenceGraph,
  referenceGraph,
  resolveSpecifier,
} from '../../src/analytics/references';
import { createTreeSitterResolver } from '../../src/resolver/treeSitterResolver';

describe('resolveSpecifier', () => {
  const known = new Set([
    'src/billing/money.ts',
    'src/billing/invoice.ts',
    'src/checkout/cart.tsx',
    'src/checkout/index.ts',
    'src/legacy/old.js',
  ]);
  const isFile = (p: string) => known.has(p);

  it('resolves a sibling with extension inference', () => {
    expect(resolveSpecifier('src/billing/invoice.ts', './money', isFile)).toBe(
      'src/billing/money.ts',
    );
  });

  it('resolves a parent-relative specifier', () => {
    expect(resolveSpecifier('src/billing/invoice.ts', '../checkout/cart', isFile)).toBe(
      'src/checkout/cart.tsx',
    );
  });

  it('resolves a directory to its index file', () => {
    expect(resolveSpecifier('src/billing/invoice.ts', '../checkout', isFile)).toBe(
      'src/checkout/index.ts',
    );
  });

  it('rewrites an explicit ./x.js specifier to the ./x.ts source (ESM/TS habit)', () => {
    expect(resolveSpecifier('src/billing/invoice.ts', './money.js', isFile)).toBe(
      'src/billing/money.ts',
    );
  });

  it('keeps an explicit extension that already resolves', () => {
    expect(resolveSpecifier('src/checkout/cart.tsx', '../legacy/old.js', isFile)).toBe(
      'src/legacy/old.js',
    );
  });

  it('ignores bare/npm specifiers and unresolved paths', () => {
    expect(resolveSpecifier('src/billing/invoice.ts', 'react', isFile)).toBeNull();
    expect(resolveSpecifier('src/billing/invoice.ts', 'node:fs', isFile)).toBeNull();
    expect(resolveSpecifier('src/billing/invoice.ts', './ghost', isFile)).toBeNull();
  });

  it('drops a specifier escaping the repo root', () => {
    expect(resolveSpecifier('src/billing/invoice.ts', '../../elsewhere/x', isFile)).toBeNull();
  });
});

describe('referenceGraph (pure module roll-up)', () => {
  const roots = ['src'];
  const files = [
    'src/billing/invoice.ts',
    'src/billing/report.ts',
    'src/billing/money.ts',
    'src/checkout/cart.ts',
  ];
  const importsOf = (f: string): string[] => {
    if (f === 'src/billing/invoice.ts') return ['./money', '../checkout/cart']; // self + cross
    if (f === 'src/billing/report.ts') return ['../checkout/cart']; // cross
    if (f === 'src/checkout/cart.ts') return ['../billing/money']; // cross back
    return [];
  };

  it('rolls file edges up to modules, drops self-edges, and counts', () => {
    expect(referenceGraph(files, importsOf, roots)).toEqual([
      { from_module: 'src/billing', to_module: 'src/checkout', count: 2 },
      { from_module: 'src/checkout', to_module: 'src/billing', count: 1 },
    ]);
  });

  it('is deterministic regardless of file order', () => {
    const shuffled = [...files].reverse();
    expect(referenceGraph(shuffled, importsOf, roots)).toEqual(
      referenceGraph(files, importsOf, roots),
    );
  });
});

describe('computeReferenceGraph (over a real fixture repo)', () => {
  let repo: string;

  beforeAll(async () => {
    repo = mkdtempSync(join(tmpdir(), 'artha-refs-'));
    mkdirSync(join(repo, 'src', 'billing'), { recursive: true });
    mkdirSync(join(repo, 'src', 'checkout'), { recursive: true });
    writeFileSync(join(repo, 'src', 'billing', 'money.ts'), 'export class Money {}\n');
    writeFileSync(
      join(repo, 'src', 'billing', 'invoice.ts'),
      "import { Money } from './money';\nimport { Cart } from '../checkout/cart';\nexport class Invoice { c?: Cart; m?: Money; }\n",
    );
    writeFileSync(
      join(repo, 'src', 'checkout', 'cart.ts'),
      "import { Money } from '../billing/money';\nexport class Cart { total?: Money; }\n",
    );
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it('mines module edges from imports alone', async () => {
    const resolver = await createTreeSitterResolver(repo);
    const graph = computeReferenceGraph(repo, resolver, ['src']);
    expect(graph).toEqual([
      { from_module: 'src/billing', to_module: 'src/checkout', count: 1 },
      { from_module: 'src/checkout', to_module: 'src/billing', count: 1 },
    ]);
  });
});
