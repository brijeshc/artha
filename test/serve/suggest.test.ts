import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config/config';
import { createTreeSitterResolver } from '../../src/resolver/treeSitterResolver';
import { suggestPins } from '../../src/serve/suggest';
import { fact, fakeIndex, pin } from '../helpers/fakeIndex';

// A small repo whose imports give the suggester real proximity to work with:
// checkout.ts imports cart.ts; orders + billing stand apart (lexical/embedding).
let repo: string;
const cfg = defaultConfig();

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'artha-suggest-'));
  for (const d of ['checkout', 'orders', 'billing', 'util']) {
    mkdirSync(join(repo, 'src', d), { recursive: true });
  }
  writeFileSync(
    join(repo, 'src', 'checkout', 'checkout.ts'),
    "import { validateCart } from './cart';\n" +
      'export function startCheckout() {\n  return validateCart();\n}\n' +
      'export function finalizeCheckout() {\n  return true;\n}\n',
  );
  writeFileSync(
    join(repo, 'src', 'checkout', 'cart.ts'),
    'export function validateCart() {\n  return true;\n}\nexport class Cart {}\n',
  );
  writeFileSync(
    join(repo, 'src', 'orders', 'order.ts'),
    'export function createOrder() {\n  return true;\n}\n',
  );
  writeFileSync(
    join(repo, 'src', 'billing', 'refund.ts'),
    'export function processRefund() {\n  return true;\n}\n',
  );
  // A symbol that shares NO tokens with the refund concept, so only an embedding
  // link (not a name match) can surface it.
  writeFileSync(
    join(repo, 'src', 'billing', 'credit.ts'),
    'export function issueCredit() {\n  return true;\n}\n',
  );
  writeFileSync(
    join(repo, 'src', 'util', 'logger.ts'),
    'export function logMessage() {\n  return true;\n}\n',
  );
});

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('suggestPins — proximity / lexical / nothing', () => {
  // A flow with ONE pinned entry point — the fan-out case.
  const flowIndex = () =>
    fakeIndex({
      facts: [
        fact('flow.checkout', 'proposed', {
          heading: 'Checkout',
          body: 'Turns a cart into a paid order.',
        }),
      ],
      pins: [pin('flow.checkout', 'src/checkout/checkout.ts#startCheckout')],
    });

  it('turns one pinned entry point into N first-hop suggestions (fan-out)', async () => {
    const s = await suggestPins(repo, flowIndex(), cfg, 'flow.checkout');
    const byRef = new Map(s.map((x) => [x.ref, x]));

    // same-file helper + the file it imports → all "referenced by pinned code"
    for (const ref of [
      'src/checkout/checkout.ts#finalizeCheckout',
      'src/checkout/cart.ts#validateCart',
      'src/checkout/cart.ts#Cart',
    ]) {
      expect(byRef.get(ref)?.why).toBe('referenced by pinned code');
    }
    // the pinned symbol itself is never re-suggested
    expect(byRef.has('src/checkout/checkout.ts#startCheckout')).toBe(false);
  });

  it('ranks proximity above lexical, and lexical above nothing', async () => {
    const s = await suggestPins(repo, flowIndex(), cfg, 'flow.checkout');
    const byRef = new Map(s.map((x) => [x.ref, x]));

    // createOrder matches the "order" token but is not near the pinned code
    const order = byRef.get('src/orders/order.ts#createOrder');
    expect(order?.why).toBe('name match');

    // every proximity hit outranks the lexical-only hit
    const proximityScores = s
      .filter((x) => x.why === 'referenced by pinned code')
      .map((x) => x.score);
    expect(Math.min(...proximityScores)).toBeGreaterThan(order?.score ?? 0);

    // an unrelated symbol (no proximity, no token, no vector) is not suggested
    expect(byRef.has('src/util/logger.ts#logMessage')).toBe(false);
  });

  it('guarantees every candidate resolves as a pin (the picker contract)', async () => {
    const s = await suggestPins(repo, flowIndex(), cfg, 'flow.checkout');
    expect(s.length).toBeGreaterThan(0);
    const resolver = await createTreeSitterResolver(repo);
    for (const hit of s) {
      expect(resolver.resolve(hit.ref)).not.toBeNull();
      expect(hit.why).toMatch(/referenced by pinned code|name match|related meaning/);
      // suggestions are top-level units, never class members (kept high-signal)
      expect(hit.name).not.toContain('.');
    }
  });

  it('returns [] for an unknown entry (cold-start friendly)', async () => {
    expect(await suggestPins(repo, flowIndex(), cfg, 'concept.ghost')).toEqual([]);
  });
});

describe('suggestPins — related meaning via index vectors', () => {
  it('surfaces a related fact’s pinned symbols using existing vectors (no model load)', async () => {
    const index = fakeIndex({
      facts: [
        fact('concept.refund', 'proposed', {
          heading: 'Refund',
          body: 'Returning money to a buyer.',
        }),
        fact('decision.credit', 'certified', {
          heading: 'Store credit',
          body: 'Compensating a buyer without cash.',
        }),
      ],
      // issueCredit shares no tokens with "Refund", so only the embedding link can reach it
      pins: [pin('decision.credit', 'src/billing/credit.ts#issueCredit')],
      embeddings: new Map([
        ['concept.refund', new Float32Array([1, 0, 0])],
        ['decision.credit', new Float32Array([0.96, 0.12, 0])],
      ]),
    });

    const s = await suggestPins(repo, index, cfg, 'concept.refund');
    const hit = s.find((x) => x.ref === 'src/billing/credit.ts#issueCredit');
    expect(hit?.why).toBe('related meaning');
  });

  it('skips the embedding signal entirely when the index has no vectors', async () => {
    const index = fakeIndex({
      facts: [
        fact('concept.refund', 'proposed', { heading: 'Refund', body: 'Returning money.' }),
        fact('decision.credit', 'certified', { heading: 'Store credit', body: 'no cash' }),
      ],
      pins: [pin('decision.credit', 'src/billing/credit.ts#issueCredit')],
    });
    const s = await suggestPins(repo, index, cfg, 'concept.refund');
    // issueCredit has no proximity and no token match, so with no vectors it's out
    expect(s.some((x) => x.ref === 'src/billing/credit.ts#issueCredit')).toBe(false);
  });
});
