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

  it('emits a flow skeleton for an exported operation that reaches across modules', () => {
    const id = 'inferred:flow:src/checkout/flow.ts#handleCheckout';
    const flow = layer.facts.find((f) => f.id === id);
    expect(flow?.kind).toBe('flow');
    expect(flow?.module).toBe('src/checkout');
    expect(flow?.heading).toBe('Handle Checkout');
    expect(flow?.confidence).toBe('read-from-code');
    // steps are the areas the entry file imports - read from imports, at module altitude
    const steps = layer.steps.filter((s) => s.inferred_id === id).sort((a, b) => a.ord - b.ord);
    expect(steps.map((s) => s.to_module)).toEqual(['src/billing']);
    expect(steps.map((s) => s.label)).toEqual(['Billing']);
    // the body honestly flags the human delta (the order/meaning of steps)
    expect(flow?.body).toMatch(/not yet described/);
    // the entry point is the single evidence pin, resolved
    const pins = layer.pins.filter((p) => p.inferred_id === id);
    expect(pins).toHaveLength(1);
    expect(pins[0]?.role).toBe('entry');
    expect(pins[0]?.symbol_ref).toBe('src/checkout/flow.ts#handleCheckout');
    expect(pins[0]?.content_hash).toMatch(/^[0-9a-f]{6}$/);
  });

  it('does not emit a flow for a non-operation name or a leaf with no fan-out', () => {
    const flowIds = layer.facts.filter((f) => f.kind === 'flow').map((f) => f.id);
    // `monthly` is not an action verb → not read as a flow (precision over recall)
    expect(flowIds).not.toContain('inferred:flow:src/reports/report.ts#monthly');
    // `send` is an action verb, but its file imports nothing in-tree → no fan-out, no flow
    expect(flowIds).not.toContain('inferred:flow:src/notifications/notify.ts#send');
  });

  it('suppresses a flow whose entry point a human already pins (materialize-on-touch)', () => {
    const withHuman = run(new Set(['src/checkout/flow.ts#handleCheckout']));
    expect(
      withHuman.facts.some((f) => f.id === 'inferred:flow:src/checkout/flow.ts#handleCheckout'),
    ).toBe(false);
  });

  it('is deterministic: identical inputs → identical output', () => {
    expect(run()).toEqual(layer);
  });

  it('is empty for a repo with no source files', () => {
    expect(inferLayer([], resolver, [], new Set(), ROOTS)).toEqual({
      facts: [],
      pins: [],
      states: [],
      steps: [],
    });
  });
});

describe('inferLayer — state-usage pins (the transition-evidence index, 21b-2)', () => {
  let tmp: string;
  let layer: InferredLayer;

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'artha-usage-pins-'));
    const files: Record<string, string> = {
      'src/order/state.ts': "export type OrderState = 'cart' | 'paid';\n",
      'src/order/checkout.ts': [
        "import type { OrderState } from './state';",
        'export class Checkout {',
        "  state: OrderState = 'cart';", // Checkout.state
        '  pay(): void {',
        "    this.state = 'paid';", // Checkout.pay
        '  }',
        '}',
      ].join('\n'),
    };
    for (const [rel, content] of Object.entries(files)) {
      mkdirSync(join(tmp, rel, '..'), { recursive: true });
      writeFileSync(join(tmp, rel), content);
    }
    const resolver = await createTreeSitterResolver(tmp);
    const list = listSourceFiles(tmp, ROOTS);
    const refs = referenceGraph(list, (rel) => resolver.imports(rel), ROOTS);
    layer = inferLayer(list, resolver, refs, new Set(), ROOTS);
  });

  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it('pins the cross-file declarations that move the state, as `usage` evidence', () => {
    const id = 'inferred:concept:src/order/state.ts#OrderState';
    const pins = layer.pins.filter((p) => p.inferred_id === id);
    // the declaration (evidence) plus the sites that move it (usage), all resolved
    expect(pins.find((p) => p.role === 'evidence')?.symbol_ref).toBe(
      'src/order/state.ts#OrderState',
    );
    expect(pins.filter((p) => p.role === 'usage').map((p) => p.symbol_ref)).toEqual([
      'src/order/checkout.ts#Checkout.state',
      'src/order/checkout.ts#Checkout.pay',
    ]);
    expect(pins.every((p) => /^[0-9a-f]{6}$/.test(p.content_hash ?? ''))).toBe(true);
  });
});

/**
 * A repo built to exercise the convention extractor: one module with a `*Repo`
 * suffix cluster (and a below-threshold `load*` prefix), one with a `use*` prefix
 * cluster, and one with no regularity at all.
 */
const CONV_FILES: Record<string, string> = {
  'src/data/repos.ts': [
    'export class UserRepo {}',
    'export class OrderRepo {}',
    'export class InvoiceRepo {}',
    'export function loadUser() {}',
    'export function loadOrder() {}',
  ].join('\n'),
  'src/hooks/hooks.ts': [
    'export function useAuth() {}',
    'export function useCart() {}',
    'export function useOrders() {}',
  ].join('\n'),
  'src/solo/one.ts': ['export class Widget {}', 'export class Gadget {}'].join('\n'),
};

describe('inferLayer — convention candidates (21a)', () => {
  let tmp: string;
  let layer: InferredLayer;

  beforeAll(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'artha-conv-'));
    for (const [rel, content] of Object.entries(CONV_FILES)) {
      mkdirSync(join(tmp, rel, '..'), { recursive: true });
      writeFileSync(join(tmp, rel), content);
    }
    const resolver = await createTreeSitterResolver(tmp);
    const files = listSourceFiles(tmp, ROOTS);
    const refs = referenceGraph(files, (rel) => resolver.imports(rel), ROOTS);
    layer = inferLayer(files, resolver, refs, new Set(), ROOTS);
  });

  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  const conv = (id: string) => layer.facts.find((f) => f.id === id);
  const members = (id: string) =>
    layer.pins
      .filter((p) => p.inferred_id === id)
      .sort((a, b) => a.ord - b.ord)
      .map((p) => p.symbol_ref);

  it('emits a suffix convention when ≥3 exported names share a trailing word', () => {
    const id = 'inferred:convention:src/data:suffix:Repo';
    expect(conv(id)?.kind).toBe('convention');
    expect(conv(id)?.heading).toBe('*Repo');
    expect(conv(id)?.module).toBe('src/data');
    expect(conv(id)?.confidence).toBe('read-from-code');
    expect(conv(id)?.body).toMatch(/3 exported names/);
    expect(members(id)).toEqual([
      'src/data/repos.ts#InvoiceRepo',
      'src/data/repos.ts#OrderRepo',
      'src/data/repos.ts#UserRepo',
    ]);
    // every evidence pin is a member of the pattern
    expect(layer.pins.filter((p) => p.inferred_id === id).every((p) => p.role === 'member')).toBe(
      true,
    );
  });

  it('emits a prefix convention (`use*`) from repeated leading words', () => {
    const id = 'inferred:convention:src/hooks:prefix:use';
    expect(conv(id)?.heading).toBe('use*');
    expect(members(id)).toEqual([
      'src/hooks/hooks.ts#useAuth',
      'src/hooks/hooks.ts#useCart',
      'src/hooks/hooks.ts#useOrders',
    ]);
  });

  it('does not emit a convention below the repetition threshold', () => {
    // `load*` appears only twice in src/data → coincidence, not a convention
    expect(conv('inferred:convention:src/data:prefix:load')).toBeUndefined();
    // src/solo's two names share no affix → nothing at all
    expect(layer.facts.some((f) => f.kind === 'convention' && f.module === 'src/solo')).toBe(false);
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
