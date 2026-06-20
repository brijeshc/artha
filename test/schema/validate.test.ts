import { describe, expect, it } from 'vitest';
import type { Convention, Decision, Invariant } from '../../src/schema/types';
import { validateEntry } from '../../src/schema/validate';

const validDecision: Decision = {
  id: 'decision.no_float_money',
  kind: 'decision',
  status: 'certified',
  title: 'Money as integer minor units',
  context: 'Rounding drift after tax + proration.',
  decision: 'Store and compute money as integer minor units.',
  certified_by: 'brijesh',
  certified_at: '2026-06-20',
};

const validInvariant: Invariant = {
  id: 'invariant.money_minor_units',
  kind: 'invariant',
  status: 'proposed',
  name: 'Money is integer minor units',
  rule: 'All monetary amounts are integers in the minor unit.',
  scope: ['src/billing/**'],
};

const validConvention: Convention = {
  id: 'convention.soft_delete',
  kind: 'convention',
  status: 'proposed',
  name: 'Soft delete via deletedAt',
  rule: 'Records are never hard-deleted.',
  scope: ['src/**/repositories/**'],
};

function errorPaths(obj: unknown): string[] {
  const result = validateEntry(obj);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors.map((e) => e.path);
}

describe('validateEntry', () => {
  it('accepts valid entries of all three kinds', () => {
    for (const entry of [validDecision, validInvariant, validConvention]) {
      const result = validateEntry(entry);
      expect(result.ok).toBe(true);
    }
  });

  it('rejects a certified entry missing certified_by / certified_at with field paths', () => {
    const { certified_by, certified_at, ...rest } = validDecision;
    void certified_by;
    void certified_at;
    const paths = errorPaths(rest);
    expect(paths).toContain('/certified_by');
    expect(paths).toContain('/certified_at');
  });

  it('rejects an id that does not match the pattern', () => {
    const paths = errorPaths({ ...validDecision, id: 'decision.No_Money' });
    expect(paths).toContain('/id');
  });

  it('rejects an id whose prefix does not match kind', () => {
    // structurally a valid decision, but id is invariant.*
    const paths = errorPaths({ ...validDecision, id: 'invariant.money' });
    expect(paths).toContain('/id');
  });

  it('rejects a missing kind-specific required field', () => {
    const { decision, ...rest } = validDecision;
    void decision;
    const paths = errorPaths(rest);
    expect(paths).toContain('/decision');
  });

  it('rejects an invariant with an empty scope', () => {
    expect(validateEntry({ ...validInvariant, scope: [] }).ok).toBe(false);
  });

  it('reports unknown/reserved kinds as a /kind error (caller skips these)', () => {
    expect(errorPaths({ id: 'concept.invoice', kind: 'concept', status: 'proposed' })).toContain(
      '/kind',
    );
  });

  it('rejects non-object input', () => {
    expect(validateEntry(null).ok).toBe(false);
    expect(validateEntry('nope').ok).toBe(false);
    expect(validateEntry([validDecision]).ok).toBe(false);
  });
});
