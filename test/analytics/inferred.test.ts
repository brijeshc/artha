import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type InferredLayer, humanize, inferLayer } from '../../src/analytics/inferred';
import { listSourceFiles, referenceGraph } from '../../src/analytics/references';
import type { SymbolResolver } from '../../src/resolver/SymbolResolver';
import { createTreeSitterResolver } from '../../src/resolver/treeSitterResolver';

/**
 * A small shop-shaped repo exercising every module-card role branch:
 *   checkout → billing, reports → billing  (billing is a shared hub)
 *   billing → notifications                (notifications is supporting)
 * and one string-literal union in billing (a state-machine candidate).
 */
const FILES: Record<string, string> = {
  'src/billing/api.ts': [
    "export type SubscriptionStatus = 'active' | 'paused' | 'canceled';",
    'export class Invoice {}',
    "import { send } from '../notifications/notify';",
    'export function charge() { send(); }',
  ].join('\n'),
  'src/checkout/flow.ts': [
    "import { charge } from '../billing/api';",
    'export function handleCheckout() { charge(); }',
  ].join('\n'),
  'src/reports/report.ts': [
    "import { Invoice } from '../billing/api';",
    'export function monthly(): Invoice { return new Invoice(); }',
  ].join('\n'),
  'src/notifications/notify.ts': 'export function send() {}',
};

const ROOTS = ['src'];

describe('inferLayer — the deterministic inferred layer (21a)', () => {
  let tmp: string;
  let resolver: SymbolResolver;
  let files: string[];
  let layer: InferredLayer;

  const run = (humanPinned: Set<string> = new Set()): InferredLayer => {
    const refs = referenceGraph(files, (rel) => resolver.imports(rel), ROOTS);
    return inferLayer(files, resolver, refs, humanPinned, ROOTS);
  };

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'artha-inferred-'));
    for (const [rel, content] of Object.entries(FILES)) {
      mkdirSync(join(tmp, rel, '..'), { recursive: true });
      writeFileSync(join(tmp, rel), content);
    }
    resolver = await createTreeSitterResolver(tmp);
    files = listSourceFiles(tmp, ROOTS);
    layer = run();
  });

  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('emits one module card per module, humanized and evidence-pinned', () => {
    const cards = layer.facts.filter((f) => f.kind === 'module');
    expect(cards.map((c) => c.id).sort()).toEqual([
      'inferred:module:src/billing',
      'inferred:module:src/checkout',
      'inferred:module:src/notifications',
      'inferred:module:src/reports',
    ]);
    const billing = cards.find((c) => c.module === 'src/billing');
    expect(billing?.heading).toBe('Billing');
    expect(billing?.confidence).toBe('read-from-code');
    expect(billing?.origin).toBe('inferred');
    // its public surface is pinned, with resolved content hashes
    const pins = layer.pins.filter((p) => p.inferred_id === billing?.id);
    expect(pins.map((p) => p.symbol_ref)).toEqual(
      expect.arrayContaining([
        'src/billing/api.ts#Invoice',
        'src/billing/api.ts#charge',
        'src/billing/api.ts#SubscriptionStatus',
      ]),
    );
    expect(pins.every((p) => /^[0-9a-f]{6}$/.test(p.content_hash ?? ''))).toBe(true);
  });

  it('reads each module role from its import position', () => {
    const body = (module: string): string =>
      layer.facts.find((f) => f.kind === 'module' && f.module === module)?.body ?? '';
    // billing: imported by checkout + reports → a shared foundation
    expect(body('src/billing')).toMatch(/Shared foundation that .*Checkout.*Reports/);
    // checkout / reports: only import, never imported → entry areas
    expect(body('src/checkout')).toMatch(/Entry area that draws on Billing/);
    expect(body('src/reports')).toMatch(/Entry area that draws on Billing/);
    // notifications: imported but imports nothing in-tree → supporting
    expect(body('src/notifications')).toMatch(/Supporting area, wired to Billing/);
  });

  it('emits a state-machine candidate from a string-literal union', () => {
    const id = 'inferred:concept:src/billing/api.ts#SubscriptionStatus';
    const concept = layer.facts.find((f) => f.id === id);
    expect(concept?.kind).toBe('concept');
    expect(concept?.module).toBe('src/billing');
    expect(concept?.heading).toBe('Subscription Status');
    expect(layer.states.filter((s) => s.inferred_id === id).map((s) => s.name)).toEqual([
      'active',
      'paused',
      'canceled',
    ]);
    // the body honestly flags the human delta (transitions / meaning)
    expect(concept?.body).toMatch(/not yet described/);
    // exactly one evidence pin, resolved
    const pins = layer.pins.filter((p) => p.inferred_id === id);
    expect(pins).toHaveLength(1);
    expect(pins[0]?.symbol_ref).toBe('src/billing/api.ts#SubscriptionStatus');
  });

  it('suppresses a candidate whose evidence a human already pins (materialize-on-touch)', () => {
    const withHuman = run(new Set(['src/billing/api.ts#SubscriptionStatus']));
    expect(withHuman.facts.some((f) => f.id.startsWith('inferred:concept:'))).toBe(false);
    // module cards are unaffected - they are structural context, not a claim
    expect(withHuman.facts.some((f) => f.kind === 'module')).toBe(true);
  });

  it('is deterministic: identical inputs → identical output', () => {
    expect(run()).toEqual(layer);
  });

  it('is empty for a repo with no source files', () => {
    expect(inferLayer([], resolver, [], new Set(), ROOTS)).toEqual({
      facts: [],
      pins: [],
      states: [],
    });
  });
});

describe('humanize', () => {
  it('splits camelCase, separators, and title-cases', () => {
    expect(humanize('SubscriptionStatus')).toBe('Subscription Status');
    expect(humanize('user-auth')).toBe('User Auth');
    expect(humanize('billing')).toBe('Billing');
    expect(humanize('order_state_v2')).toBe('Order State V2');
  });
});
