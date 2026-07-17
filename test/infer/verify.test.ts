import { describe, expect, it } from 'vitest';
import type { EvidenceExcerpt, SynthResult } from '../../src/infer/inferrer';
import { INFERRED, UNCERTAIN, verifySynthesis } from '../../src/infer/verify';

/** An enriched synthesis result (the only shape the verifier grades). */
function enriched(name: string, summary: string): Extract<SynthResult, { enriched: true }> {
  return { enriched: true, name, summary, steps: [] };
}

const codeEvidence: EvidenceExcerpt[] = [
  {
    ref: 'src/billing/subscription.ts#SubscriptionStatus',
    path: 'src/billing/subscription.ts',
    lines: ["export type SubscriptionStatus = 'trialing' | 'active' | 'past_due';"],
  },
];

describe('verifySynthesis (the verification gate, 21b)', () => {
  it('accepts a summary whose only code-shaped tokens are grounded in the evidence', () => {
    const r = enriched(
      'Subscription lifecycle',
      'Tracks a `SubscriptionStatus` from trialing to active. Plain product prose otherwise.',
    );
    expect(verifySynthesis(r, codeEvidence, 'Subscription Status states read from code')).toBe(
      INFERRED,
    );
  });

  it('leaves plain product language in the name unflagged (D4 relabelling passes)', () => {
    // "Subscription lifecycle" is domain language, not a code claim - neither
    // word is code-shaped, so the verifier never demands it appear in the source.
    const r = enriched('Subscription lifecycle', 'Describes the states in plain words only.');
    expect(verifySynthesis(r, codeEvidence, 'draft')).toBe(INFERRED);
  });

  it('downgrades a backtick-quoted claim about a symbol absent from the code', () => {
    const r = enriched(
      'Subscription lifecycle',
      'Persists each change to `DynamoDB` for durability.',
    );
    expect(verifySynthesis(r, codeEvidence, 'draft')).toBe(UNCERTAIN);
  });

  it('downgrades a camelCase mechanism the evidence never mentions', () => {
    const r = enriched('Billing area', 'It calls chargeStripe on every renewal.');
    expect(verifySynthesis(r, codeEvidence, 'draft')).toBe(UNCERTAIN);
  });

  it('grounds a recombined identifier by its word-pieces, not the whole token', () => {
    // `activeSubscription` never appears verbatim, but both pieces (active,
    // subscription) do - a low-risk recombination of real domain words.
    const r = enriched(
      'Subscription lifecycle',
      'Represents an `activeSubscription` in the system.',
    );
    expect(verifySynthesis(r, codeEvidence, 'draft')).toBe(INFERRED);
  });

  it('cannot verify a claim with no evidence, so it downgrades', () => {
    const r = enriched('Some area', 'A perfectly plain summary with no code tokens at all.');
    expect(verifySynthesis(r, [], 'draft')).toBe(UNCERTAIN);
  });

  it('checks a flow step’s text too, downgrading an ungrounded one (21b-2)', () => {
    const grounded = {
      enriched: true as const,
      name: 'X',
      summary: 'Plain.',
      steps: [{ module: 'src/billing', text: 'changes the `SubscriptionStatus`' }],
    };
    expect(verifySynthesis(grounded, codeEvidence, 'draft')).toBe(INFERRED);

    const bad = {
      enriched: true as const,
      name: 'X',
      summary: 'Plain.',
      steps: [
        { module: 'src/billing', text: 'writes to `KafkaTopic`' }, // absent from the code
      ],
    };
    expect(verifySynthesis(bad, codeEvidence, 'draft')).toBe(UNCERTAIN);
  });
});
