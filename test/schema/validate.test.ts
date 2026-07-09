import { describe, expect, it } from 'vitest';
import type { Concept, Convention, Decision, Flow, Invariant } from '../../src/schema/types';
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

const validConcept: Concept = {
  id: 'concept.subscription',
  kind: 'concept',
  status: 'proposed',
  name: 'Subscription',
  summary: 'A customer’s ongoing paid access to a plan.',
  states: [
    { name: 'active', invariant: 'currentPeriodEnd in the future' },
    { name: 'past_due', effect: 'entitlement retained for a grace window' },
  ],
  transitions: [{ from: 'active', to: 'past_due', trigger: 'invoice payment failed' }],
};

const validFlow: Flow = {
  id: 'flow.checkout',
  kind: 'flow',
  status: 'proposed',
  name: 'Checkout',
  summary: 'Turns a cart into a paid order.',
  entry: [{ symbol: 'src/checkout/startCheckout.ts#startCheckout' }],
  steps: [
    { on: 'cart submitted', do: 'validate the cart', pin: { symbol: 'src/checkout/v.ts#v' } },
    { do: 'create the order', pin: null },
  ],
};

function errorPaths(obj: unknown): string[] {
  const result = validateEntry(obj);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors.map((e) => e.path);
}

describe('validateEntry', () => {
  it('accepts valid entries of all five kinds', () => {
    for (const entry of [validDecision, validInvariant, validConvention, validConcept, validFlow]) {
      const result = validateEntry(entry);
      expect(result.ok).toBe(true);
    }
  });

  it('accepts derived_from provenance on a materialized inferred fact (23d-2)', () => {
    const materialized: Concept = {
      ...validConcept,
      derived_from: 'inferred@abc123',
    };
    expect(validateEntry(materialized).ok).toBe(true);
  });

  it('accepts a concept with neither states nor transitions (summary-first capture)', () => {
    const { states, transitions, ...bare } = validConcept;
    void states;
    void transitions;
    expect(validateEntry(bare).ok).toBe(true);
  });

  it('rejects a concept missing the required summary', () => {
    const { summary, ...rest } = validConcept;
    void summary;
    expect(errorPaths(rest)).toContain('/summary');
  });

  it('rejects a concept whose id prefix does not match kind', () => {
    expect(errorPaths({ ...validConcept, id: 'decision.subscription' })).toContain('/id');
  });

  it('rejects a concept with a malformed transition (missing trigger)', () => {
    const bad = { ...validConcept, transitions: [{ from: 'active', to: 'past_due' }] };
    expect(errorPaths(bad)).toContain('/transitions/0/trigger');
  });

  it('rejects a flow step missing the required do', () => {
    const bad = { ...validFlow, steps: [{ on: 'cart submitted' }] };
    expect(errorPaths(bad)).toContain('/steps/0/do');
  });

  it('requires certified_by + certified_at on a certified concept', () => {
    const paths = errorPaths({ ...validConcept, status: 'certified' });
    expect(paths).toContain('/certified_by');
    expect(paths).toContain('/certified_at');
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

  it('reports unknown/still-reserved kinds (exception) as a /kind error (caller skips these)', () => {
    expect(errorPaths({ id: 'exception.legacy', kind: 'exception', status: 'proposed' })).toContain(
      '/kind',
    );
  });

  it('rejects non-object input', () => {
    expect(validateEntry(null).ok).toBe(false);
    expect(validateEntry('nope').ok).toBe(false);
    expect(validateEntry([validDecision]).ok).toBe(false);
  });
});
