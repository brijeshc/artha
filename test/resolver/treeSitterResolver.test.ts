import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedSymbol, SymbolResolver } from '../../src/resolver/SymbolResolver';
import { createTreeSitterResolver } from '../../src/resolver/treeSitterResolver';

const REPO = join(__dirname, '..', 'fixtures', 'repo');

function mustResolve(resolver: SymbolResolver, ref: string): ResolvedSymbol {
  const sym = resolver.resolve(ref);
  if (!sym) throw new Error(`expected to resolve ${ref}`);
  return sym;
}

describe('treeSitterResolver — resolution', () => {
  let resolver: SymbolResolver;
  beforeAll(async () => {
    resolver = await createTreeSitterResolver(REPO);
  });

  it('resolves a top-level class', () => {
    const sym = mustResolve(resolver, 'src/billing/Money.ts#Money');
    expect(sym.symbolId).toBe('src/billing/Money.ts#Money');
    expect(sym.startLine).toBe(1);
    expect(sym.endLine).toBeGreaterThan(sym.startLine);
    expect(sym.contentHash).toMatch(/^[0-9a-f]{6}$/);
  });

  it('resolves a method via Class.method', () => {
    const cls = mustResolve(resolver, 'src/billing/Money.ts#Money');
    const method = mustResolve(resolver, 'src/billing/Money.ts#Money.add');
    // the method lives inside the class body
    expect(method.startLine).toBeGreaterThan(cls.startLine);
    expect(method.endLine).toBeLessThanOrEqual(cls.endLine);
  });

  it('resolves a top-level function and a const', () => {
    expect(resolver.resolve('src/billing/Money.ts#formatMoney')).not.toBeNull();
    expect(resolver.resolve('src/billing/Money.ts#RATE')).not.toBeNull();
  });

  it('resolves symbols in a .tsx file', () => {
    expect(resolver.resolve('src/ui/Button.tsx#Button')).not.toBeNull();
    expect(resolver.resolve('src/ui/Button.tsx#PRIMARY')).not.toBeNull();
  });

  it('returns null for a missing file', () => {
    expect(resolver.resolve('src/does-not-exist.ts#Whatever')).toBeNull();
  });

  it('returns null for a missing symbol and a missing method', () => {
    expect(resolver.resolve('src/billing/Money.ts#Nope')).toBeNull();
    expect(resolver.resolve('src/billing/Money.ts#Money.nope')).toBeNull();
  });

  it('returns null for a non-JS/TS file and a malformed ref', () => {
    expect(resolver.resolve('src/data.json#thing')).toBeNull();
    expect(resolver.resolve('no-hash-here')).toBeNull();
  });
});

describe('treeSitterResolver — content hashing', () => {
  let tmp: string;
  let resolver: SymbolResolver;

  const wrap = (body: string): string => `export class Money {\n${body}\n}\n`;
  const ADD = '  add(o: Money): Money {\n    return new Money(this.amount + o.amount);\n  }';

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'artha-resolver-'));
    mkdirSync(join(tmp, 'src'), { recursive: true });
    writeFileSync(join(tmp, 'src', 'orig.ts'), wrap(ADD));
    writeFileSync(
      join(tmp, 'src', 'reformatted.ts'),
      wrap(
        '  add(o: Money):   Money {\n\n        return new Money(this.amount  +  o.amount);\n\n  }',
      ),
    );
    writeFileSync(
      join(tmp, 'src', 'changed.ts'),
      wrap('  add(o: Money): Money {\n    return new Money(this.amount + o.amount + 1);\n  }'),
    );
    resolver = await createTreeSitterResolver(tmp);
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('is stable across a pure reformat of the pinned symbol', () => {
    const orig = mustResolve(resolver, 'src/orig.ts#Money.add');
    const reformatted = mustResolve(resolver, 'src/reformatted.ts#Money.add');
    expect(reformatted.contentHash).toBe(orig.contentHash);
  });

  it('changes when the symbol logic changes', () => {
    const orig = mustResolve(resolver, 'src/orig.ts#Money.add');
    const changed = mustResolve(resolver, 'src/changed.ts#Money.add');
    expect(changed.contentHash).not.toBe(orig.contentHash);
  });

  it('hash(sym) recomputes the same digest as resolve()', () => {
    const orig = mustResolve(resolver, 'src/orig.ts#Money.add');
    expect(resolver.hash(orig)).toBe(orig.contentHash);
  });
});
