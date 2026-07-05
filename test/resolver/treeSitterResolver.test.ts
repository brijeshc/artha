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

describe('treeSitterResolver — enumeration (list, for the link picker)', () => {
  let resolver: SymbolResolver;
  beforeAll(async () => {
    resolver = await createTreeSitterResolver(REPO);
  });

  it('lists top-level symbols + class members, every one of which resolves', () => {
    const names = resolver.list('src/billing/Money.ts').map((d) => d.name);
    expect(names).toEqual(expect.arrayContaining(['Money', 'Money.add', 'formatMoney', 'RATE']));
    // the picker's guarantee: every enumerated name is a valid pin target
    for (const name of names) {
      expect(resolver.resolve(`src/billing/Money.ts#${name}`)).not.toBeNull();
    }
  });

  it('tags friendly kinds', () => {
    const decls = resolver.list('src/billing/Money.ts');
    expect(decls.find((d) => d.name === 'Money')?.kind).toBe('class');
    expect(decls.find((d) => d.name === 'Money.add')?.kind).toBe('method');
    expect(decls.find((d) => d.name === 'formatMoney')?.kind).toBe('function');
    expect(decls.find((d) => d.name === 'RATE')?.kind).toBe('const');
  });

  it('returns [] for a non-JS/TS or missing file (never throws)', () => {
    expect(resolver.list('src/data.json')).toEqual([]);
    expect(resolver.list('src/does-not-exist.ts')).toEqual([]);
  });
});

describe('treeSitterResolver — enumLikes (for inferred state machines, 21a)', () => {
  let tmp: string;
  let resolver: SymbolResolver;

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'artha-enums-'));
    mkdirSync(join(tmp, 'src'), { recursive: true });
    writeFileSync(
      join(tmp, 'src', 'states.ts'),
      [
        "export type SubscriptionStatus = 'active' | 'paused' | 'canceled';",
        'export enum Color {',
        '  Red,',
        "  Green = 'green',",
        '  Blue,',
        '}',
        "type Single = 'only';", // one member → not a machine
        'type Id = string | number;', // not string literals → skipped
        "type Nullable = 'a' | 'b' | null;", // null tolerated, still a machine
        "export const NAME = 'x';",
      ].join('\n'),
    );
    resolver = await createTreeSitterResolver(tmp);
  });

  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('extracts a string-literal union as an ordered state set', () => {
    const found = resolver.enumLikes('src/states.ts');
    const sub = found.find((e) => e.name === 'SubscriptionStatus');
    expect(sub).toEqual({
      name: 'SubscriptionStatus',
      kind: 'union',
      members: ['active', 'paused', 'canceled'],
    });
  });

  it('extracts a TS enum (bare and assigned members)', () => {
    const color = resolver.enumLikes('src/states.ts').find((e) => e.name === 'Color');
    expect(color).toEqual({ name: 'Color', kind: 'enum', members: ['Red', 'Green', 'Blue'] });
  });

  it('tolerates a null member but keeps the string states', () => {
    const nullable = resolver.enumLikes('src/states.ts').find((e) => e.name === 'Nullable');
    expect(nullable?.members).toEqual(['a', 'b']);
  });

  it('skips single-member unions and non-string unions', () => {
    const names = resolver.enumLikes('src/states.ts').map((e) => e.name);
    expect(names).not.toContain('Single');
    expect(names).not.toContain('Id');
  });

  it('every candidate resolves as a pin target (path#Name)', () => {
    for (const e of resolver.enumLikes('src/states.ts')) {
      expect(resolver.resolve(`src/states.ts#${e.name}`)).not.toBeNull();
    }
  });

  it('returns [] for a non-JS/TS or missing file (never throws)', () => {
    expect(resolver.enumLikes('src/data.json')).toEqual([]);
    expect(resolver.enumLikes('src/missing.ts')).toEqual([]);
  });

  it('marks the module public surface via the exported flag', () => {
    const decls = resolver.list('src/states.ts');
    expect(decls.find((d) => d.name === 'SubscriptionStatus')?.exported).toBe(true);
    expect(decls.find((d) => d.name === 'NAME')?.exported).toBe(true);
    expect(decls.find((d) => d.name === 'Single')?.exported).toBe(false);
  });
});

describe('treeSitterResolver — imports (for the reference graph)', () => {
  let tmp: string;
  let resolver: SymbolResolver;

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'artha-imports-'));
    mkdirSync(join(tmp, 'src'), { recursive: true });
    writeFileSync(
      join(tmp, 'src', 'a.ts'),
      [
        "import { Money } from './money';",
        "import type { Config } from '../config';",
        "import Default from './default.js';",
        "export { formatMoney } from './money';",
        "export * from './rates';",
        "const db = require('../db/client');",
        "const lazy = () => import('./lazy');",
        "import 'side-effect';", // bare, side-effect
        'const dynamic = await import(`./${name}`);', // computed → skipped
        'export const X = 1;', // export with no source → nothing
      ].join('\n'),
    );
    resolver = await createTreeSitterResolver(tmp);
  });

  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('collects import/export-from/require/dynamic-import specifiers in source order', () => {
    expect(resolver.imports('src/a.ts')).toEqual([
      './money',
      '../config',
      './default.js',
      './money',
      './rates',
      '../db/client',
      './lazy',
      'side-effect',
    ]);
  });

  it('returns [] for a non-JS/TS or missing file (never throws)', () => {
    expect(resolver.imports('src/data.json')).toEqual([]);
    expect(resolver.imports('src/missing.ts')).toEqual([]);
  });
});
