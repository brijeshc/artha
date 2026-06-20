import { describe, expect, it } from 'vitest';
import { contentHash, normalizeForHash } from '../../src/resolver/hash';

describe('normalizeForHash', () => {
  it('collapses whitespace, drops blank lines, and normalizes line endings', () => {
    const messy = '  function   f(a,   b)  {\r\n\r\n     return a+b;  \r\n}  ';
    expect(normalizeForHash(messy)).toBe('function f(a, b) {\nreturn a+b;\n}');
  });
});

describe('contentHash', () => {
  const original = 'add(other) {\n  return this.amount + other.amount;\n}';

  it('is a 6-char hex digest', () => {
    expect(contentHash(original)).toMatch(/^[0-9a-f]{6}$/);
  });

  it('is stable across a pure reformat (indent / blank lines / spacing)', () => {
    const reformatted = 'add(other)     {\n\n      return this.amount  +  other.amount;\n\n}';
    expect(contentHash(reformatted)).toBe(contentHash(original));
  });

  it('changes when the logic changes', () => {
    const changed = 'add(other) {\n  return this.amount + other.amount + 1;\n}';
    expect(contentHash(changed)).not.toBe(contentHash(original));
  });

  it('changes when only a comment changes (Q4: comments are kept in the hash)', () => {
    const commented =
      'add(other) {\n  // sum the minor units\n  return this.amount + other.amount;\n}';
    expect(contentHash(commented)).not.toBe(contentHash(original));
  });
});
