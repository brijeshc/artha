import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FileGraph } from '../../src/analytics/references';
import { defaultConfig } from '../../src/config/config';
import { openArthaIndex } from '../../src/mcp/query';
import {
  areasOf,
  catalog,
  conceptDetail,
  flowDetail,
  mapFeed,
  moduleBoard,
  moduleDetail,
  refsFeed,
  search,
  vouchedHistory,
} from '../../src/serve/api';
import { fact, fakeIndex, pin } from '../helpers/fakeIndex';
import { writeFixtureIndex } from '../mcp/fixture';

// A non-git temp repo with two source modules on disk. No git → churn is an
// empty map (graceful), so the map feed exercises the fs-universe + coverage.
let repo: string;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'artha-api-'));
  mkdirSync(join(repo, 'src', 'billing'), { recursive: true });
  mkdirSync(join(repo, 'src', 'checkout'), { recursive: true });
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

const config = defaultConfig();

describe('areasOf (OQ5)', () => {
  it('defaults to one area per top-level module', () => {
    expect(areasOf(['src/billing', 'src/checkout'], config)).toEqual([
      { area: 'src/billing', modules: ['src/billing'] },
      { area: 'src/checkout', modules: ['src/checkout'] },
    ]);
  });

  it('groups modules into named areas when config.areas is declared', () => {
    const cfg = { ...config, areas: { Billing: ['src/billing', 'src/payments'] } };
    const areas = areasOf(['src/billing', 'src/payments', 'src/checkout'], cfg);
    expect(areas).toContainEqual({ area: 'Billing', modules: ['src/billing', 'src/payments'] });
    // leftover module keeps its own area (nothing hidden)
    expect(areas).toContainEqual({ area: 'src/checkout', modules: ['src/checkout'] });
  });
});

describe('vouchedHistory (23c)', () => {
  it('returns only dated, certified facts, oldest first', () => {
    const index = fakeIndex({
      facts: [
        fact('concept.checkout', 'certified', { heading: 'Checkout', certified_at: '2026-07-04' }),
        fact('decision.stripe', 'certified', { heading: 'Stripe', certified_at: '2026-06-30' }),
        // certified but undated (a hand-edited entry) → excluded, never guessed
        fact('invariant.money', 'certified', { heading: 'Money', certified_at: null }),
        // proposed → not vouched, excluded
        fact('flow.refund', 'proposed', { heading: 'Refund', certified_at: '2026-07-01' }),
      ],
    });

    const history = vouchedHistory(index);
    expect(history.map((p) => p.id)).toEqual(['decision.stripe', 'concept.checkout']);
    expect(history[0]).toMatchObject({ at: '2026-06-30', kind: 'decision', name: 'Stripe' });
  });

  it('is empty when nothing is vouched yet', () => {
    const index = fakeIndex({
      facts: [fact('flow.refund', 'proposed', { certified_at: '2026-07-01' })],
    });
    expect(vouchedHistory(index)).toEqual([]);
  });
});

describe('mapFeed', () => {
  it('returns area/module nodes with dark-zone flags', () => {
    const index = fakeIndex({
      facts: [fact('concept.invoice', 'certified', { heading: 'Invoice', body: 'An invoice.' })],
      pins: [pin('concept.invoice', 'src/billing/Invoice.ts#Invoice')],
    });

    const feed = mapFeed(repo, index, config);
    expect(feed.cold).toBe(false);

    const billing = feed.modules.find((m) => m.module === 'src/billing');
    const checkout = feed.modules.find((m) => m.module === 'src/checkout');
    expect(billing).toMatchObject({ dark: false, certifiedFacts: 1 });
    expect(checkout).toMatchObject({ dark: true, certifiedFacts: 0 });

    // the concept shows up in its area (= its module, OQ5 default)
    const billingArea = feed.areas.find((a) => a.area === 'src/billing');
    expect(billingArea?.concepts).toContain('concept.invoice');
    expect(billingArea?.dark).toBe(false);
  });

  it('carries the module card description - the slot 21b enriches', () => {
    const index = fakeIndex({
      inferred: [
        {
          id: 'inferred.module.src-billing',
          kind: 'module',
          module: 'src/billing',
          heading: 'Billing',
          body: 'Shared foundation that Checkout builds on.',
          confidence: 'read-from-code',
          origin: 'inferred',
        },
      ],
    });
    const feed = mapFeed(repo, index, config);
    const billing = feed.modules.find((m) => m.module === 'src/billing');
    const checkout = feed.modules.find((m) => m.module === 'src/checkout');
    expect(billing?.described).toBe(true);
    expect(billing?.describedAs).toBe('Shared foundation that Checkout builds on.');
    // no card → the field is honestly null, never invented
    expect(checkout?.describedAs).toBeNull();
  });

  it('cold start: empty index → a valid, all-dark map, not an error', () => {
    const feed = mapFeed(repo, fakeIndex({}), config);
    expect(feed.cold).toBe(true);
    // the two on-disk source modules, both dark (nothing certified)
    expect(feed.modules.map((m) => m.module)).toEqual(['src/billing', 'src/checkout']);
    expect(feed.modules.every((m) => m.dark)).toBe(true);
    expect(feed.areas.every((a) => a.dark)).toBe(true);
  });
});

describe('conceptDetail', () => {
  it('returns states + transitions (ordered) and linked symbols', () => {
    const index = fakeIndex({
      facts: [fact('concept.sub', 'certified', { heading: 'Subscription', body: 'Paid access.' })],
      pins: [pin('concept.sub', 'src/billing/Sub.ts#Sub')],
      states: [
        {
          fact_id: 'concept.sub',
          name: 'active',
          effect: null,
          invariant: 'period in future',
          ord: 0,
        },
        {
          fact_id: 'concept.sub',
          name: 'past_due',
          effect: 'grace window',
          invariant: null,
          ord: 1,
        },
      ],
      transitions: [
        {
          fact_id: 'concept.sub',
          from_state: 'active',
          to_state: 'past_due',
          trigger: 'payment failed',
          ord: 0,
        },
      ],
      related: [{ fact_id: 'concept.sub', related_id: 'concept.invoice' }],
    });

    const detail = conceptDetail(index, 'concept.sub', config);
    expect(detail).toMatchObject({
      id: 'concept.sub',
      name: 'Subscription',
      summary: 'Paid access.',
    });
    expect(detail?.states.map((s) => s.name)).toEqual(['active', 'past_due']);
    expect(detail?.transitions[0]).toEqual({
      from: 'active',
      to: 'past_due',
      trigger: 'payment failed',
    });
    expect(detail?.pins[0]?.symbol).toBe('src/billing/Sub.ts#Sub');
    // related carries its resolved name (24g); this index has no such fact, so
    // the name is honestly null and the client falls back to the id
    expect(detail?.related).toEqual([{ id: 'concept.invoice', name: null }]);
    expect(detail?.modules).toEqual(['src/billing']);
  });

  it('returns null for an unknown / wrong-kind id', () => {
    const index = fakeIndex({ facts: [fact('flow.checkout', 'proposed')] });
    expect(conceptDetail(index, 'flow.checkout', config)).toBeNull();
    expect(conceptDetail(index, 'concept.nope', config)).toBeNull();
  });

  it('carries the human delta band (D6): notes when written, null when not', () => {
    const withNotes = fakeIndex({
      facts: [fact('concept.sub', 'certified', { heading: 'Sub', notes: 'Retries stop at 3.' })],
    });
    expect(conceptDetail(withNotes, 'concept.sub', config)?.notes).toBe('Retries stop at 3.');

    const without = fakeIndex({ facts: [fact('concept.sub', 'certified', { heading: 'Sub' })] });
    expect(conceptDetail(without, 'concept.sub', config)?.notes).toBeNull();
  });
});

describe('flowDetail', () => {
  it('separates entry pins from steps and surfaces a not-yet-linked step', () => {
    const index = fakeIndex({
      facts: [fact('flow.checkout', 'proposed', { heading: 'Checkout', body: 'Cart → order.' })],
      pins: [
        pin('flow.checkout', 'src/checkout/start.ts#start'), // entry (no step references it)
        pin('flow.checkout', 'src/checkout/validate.ts#validate'), // step 0
      ],
      flowSteps: [
        {
          fact_id: 'flow.checkout',
          on_event: 'cart submitted',
          do_action: 'validate',
          pin_symbol_ref: 'src/checkout/validate.ts#validate',
          ord: 0,
        },
        {
          fact_id: 'flow.checkout',
          on_event: null,
          do_action: 'create order',
          pin_symbol_ref: null,
          ord: 1,
        },
      ],
    });

    const detail = flowDetail(index, 'flow.checkout', config);
    expect(detail?.entry.map((p) => p.symbol)).toEqual(['src/checkout/start.ts#start']);
    expect(detail?.steps).toHaveLength(2);
    expect(detail?.steps[0]).toMatchObject({ on: 'cart submitted', do: 'validate' });
    expect(detail?.steps[0]?.pin?.symbol).toBe('src/checkout/validate.ts#validate');
    expect(detail?.steps[1]).toMatchObject({ on: null, do: 'create order', pin: null });
  });

  it('carries the human delta band (D6)', () => {
    const index = fakeIndex({
      facts: [fact('flow.refund', 'certified', { heading: 'Refund', notes: 'Never partial.' })],
    });
    expect(flowDetail(index, 'flow.refund', config)?.notes).toBe('Never partial.');
  });
});

describe('catalog', () => {
  it('summarises concepts (state chain) and flows (step coverage) with modules', () => {
    const index = fakeIndex({
      facts: [
        fact('concept.sub', 'certified', { heading: 'Subscription', body: 'Paid access.' }),
        fact('flow.checkout', 'proposed', { heading: 'Checkout', body: 'Cart → order.' }),
      ],
      pins: [
        pin('concept.sub', 'src/billing/Sub.ts#Sub'),
        pin('flow.checkout', 'src/checkout/validate.ts#validate'),
      ],
      states: [
        { fact_id: 'concept.sub', name: 'active', effect: null, invariant: null, ord: 0 },
        { fact_id: 'concept.sub', name: 'past_due', effect: null, invariant: null, ord: 1 },
      ],
      flowSteps: [
        {
          fact_id: 'flow.checkout',
          on_event: null,
          do_action: 'validate',
          pin_symbol_ref: 'src/checkout/validate.ts#validate',
          ord: 0,
        },
        {
          fact_id: 'flow.checkout',
          on_event: null,
          do_action: 'create order',
          pin_symbol_ref: null,
          ord: 1,
        },
      ],
    });

    const cat = catalog(index, config);
    expect(cat.concepts).toEqual([
      {
        id: 'concept.sub',
        name: 'Subscription',
        status: 'certified',
        modules: ['src/billing'],
        states: ['active', 'past_due'],
      },
    ]);
    expect(cat.flows).toEqual([
      {
        id: 'flow.checkout',
        name: 'Checkout',
        status: 'proposed',
        modules: ['src/checkout'],
        steps: 2,
        linked: 1,
      },
    ]);
  });

  it('is empty (not an error) for a cold index', () => {
    expect(catalog(fakeIndex({}), config)).toEqual({
      concepts: [],
      flows: [],
      inferredConcepts: [],
      inferredFlows: [],
    });
  });
});

describe('moduleDetail (engineer lens, 16c)', () => {
  const richIndex = () =>
    fakeIndex({
      facts: [
        fact('concept.invoice', 'certified', { heading: 'Invoice', body: 'A bill.' }),
        fact('flow.dunning', 'proposed', { heading: 'Dunning', body: 'Chase payment.' }),
        fact('invariant.money', 'certified', {
          heading: 'Money is integer minor units',
          body: 'Never floats.',
        }),
        fact('convention.repo', 'certified', { heading: 'Repository pattern', body: 'One per.' }),
        fact('decision.stripe', 'stale', { heading: 'Use Stripe', body: 'Fewer PCI burdens.' }),
        fact('decision.elsewhere', 'certified', { heading: 'Unrelated', body: 'other module' }),
      ],
      pins: [
        pin('concept.invoice', 'src/billing/Invoice.ts#Invoice'),
        pin('flow.dunning', 'src/billing/dunning.ts#run', { is_stale: 1 }),
        pin('decision.stripe', 'src/billing/stripe.ts#client'),
        pin('decision.elsewhere', 'src/checkout/cart.ts#Cart'),
      ],
      scopeFiles: [
        { fact_id: 'invariant.money', file_path: 'src/billing/Invoice.ts' },
        { fact_id: 'convention.repo', file_path: 'src/billing/InvoiceRepo.ts' },
      ],
    });

  it('groups the facts touching a module into capabilities, rules, and decisions', () => {
    const detail = moduleDetail(repo, richIndex(), config, 'src/billing');
    expect(detail).not.toBeNull();
    expect(detail?.concepts.map((f) => f.id)).toEqual(['concept.invoice']);
    expect(detail?.flows.map((f) => f.id)).toEqual(['flow.dunning']);
    expect(detail?.rules.map((f) => f.id)).toEqual(['convention.repo', 'invariant.money']);
    expect(detail?.decisions.map((f) => f.id)).toEqual(['decision.stripe']);
    // decisions from other modules stay out
    expect(detail?.decisions.some((f) => f.id === 'decision.elsewhere')).toBe(false);
    // the join is visible: pin symbols vs scope reach, and pin drift
    expect(detail?.concepts[0]).toMatchObject({
      symbols: ['src/billing/Invoice.ts#Invoice'],
      viaScope: false,
      stalePins: 0,
    });
    expect(detail?.flows[0]?.stalePins).toBe(1);
    expect(detail?.rules.every((f) => f.viaScope)).toBe(true);
    // certified meaning exists → not dark; rules text rides along for display
    expect(detail?.dark).toBe(false);
    expect(detail?.rules.find((f) => f.id === 'invariant.money')?.body).toBe('Never floats.');
  });

  it('an on-disk module with nothing attached is a valid, dark, empty detail', () => {
    const detail = moduleDetail(repo, fakeIndex({}), config, 'src/checkout');
    expect(detail).toMatchObject({ module: 'src/checkout', dark: true, certifiedFacts: 0 });
    expect(detail?.concepts).toEqual([]);
    expect(detail?.rules).toEqual([]);
  });

  it('returns null for a module that neither exists on disk nor carries meaning', () => {
    expect(moduleDetail(repo, fakeIndex({}), config, 'src/nope')).toBeNull();
  });

  it('names the declared areas containing the module', () => {
    const cfg = { ...config, areas: { 'Billing & Money': ['src/billing'] } };
    const detail = moduleDetail(repo, richIndex(), cfg, 'src/billing');
    expect(detail?.areas).toEqual(['Billing & Money']);
    // undeclared module keeps itself as its area
    const other = moduleDetail(repo, richIndex(), cfg, 'src/checkout');
    expect(other?.areas).toEqual(['src/checkout']);
  });

  it('reports depends-on / used-by from the reference graph, most-coupled first (T17b)', () => {
    const index = fakeIndex({
      facts: [fact('concept.invoice', 'certified', { heading: 'Invoice', body: 'A bill.' })],
      pins: [pin('concept.invoice', 'src/billing/Invoice.ts#Invoice')],
      refs: [
        { from_module: 'src/billing', to_module: 'src/checkout', count: 2 },
        { from_module: 'src/checkout', to_module: 'src/billing', count: 1 },
        { from_module: 'src/ui', to_module: 'src/billing', count: 3 },
      ],
    });
    const detail = moduleDetail(repo, index, config, 'src/billing');
    expect(detail?.dependsOn).toEqual([{ module: 'src/checkout', count: 2 }]);
    // used-by sorts by import count descending: ui (3) then checkout (1)
    expect(detail?.usedBy).toEqual([
      { module: 'src/ui', count: 3 },
      { module: 'src/checkout', count: 1 },
    ]);
  });
});

describe('moduleBoard (23b - the inner board)', () => {
  // billing has three files; refund imports gateway (intra-module) and email in
  // another module (cross-module, drawn on the outer board); checkout is a
  // different module and must not appear on billing's inner board.
  const files = [
    'src/billing/gateway.ts',
    'src/billing/refund.ts',
    'src/billing/Subscription.ts',
    'src/checkout/Checkout.ts',
  ];
  const fileGraph: FileGraph = {
    importsOf: new Map([
      ['src/billing/refund.ts', new Set(['src/billing/gateway.ts', 'src/notifications/email.ts'])],
      ['src/checkout/Checkout.ts', new Set(['src/billing/Subscription.ts'])],
    ]),
    importedBy: new Map(),
  };
  const index = fakeIndex({
    facts: [
      fact('decision.stripe', 'certified', { heading: 'Use Stripe' }),
      fact('flow.refund', 'proposed', { heading: 'Refund a purchase' }),
    ],
    pins: [
      pin('decision.stripe', 'src/billing/gateway.ts#StripeGateway'),
      pin('flow.refund', 'src/billing/refund.ts#validateRefund'),
    ],
  });

  it('boxes only the module’s files, sorted, excluding other modules', () => {
    const board = moduleBoard(index, config, 'src/billing', files, fileGraph);
    expect(board.module).toBe('src/billing');
    expect(board.files.map((f) => f.path)).toEqual([
      'src/billing/Subscription.ts',
      'src/billing/gateway.ts',
      'src/billing/refund.ts',
    ]);
    expect(board.files.map((f) => f.name)).toContain('refund.ts');
  });

  it('keeps only intra-module import edges (a cross-module import is left off)', () => {
    const board = moduleBoard(index, config, 'src/billing', files, fileGraph);
    // refund→gateway stays; refund→notifications/email is dropped (cross-module)
    expect(board.edges).toEqual([{ from: 'src/billing/refund.ts', to: 'src/billing/gateway.ts' }]);
  });

  it('lights each file with the facts pinned into it, strongest standing first', () => {
    const board = moduleBoard(index, config, 'src/billing', files, fileGraph);
    const gateway = board.files.find((f) => f.path === 'src/billing/gateway.ts');
    expect(gateway?.facts).toEqual([
      { id: 'decision.stripe', kind: 'decision', name: 'Use Stripe', status: 'certified' },
    ]);
    const refund = board.files.find((f) => f.path === 'src/billing/refund.ts');
    expect(refund?.facts.map((f) => f.id)).toEqual(['flow.refund']);
    // a file with no pins is a plain box, not an error
    const sub = board.files.find((f) => f.path === 'src/billing/Subscription.ts');
    expect(sub?.facts).toEqual([]);
  });

  it('a module with no source files yields an empty board, never throws', () => {
    const board = moduleBoard(index, config, 'src/nonexistent', files, fileGraph);
    expect(board).toEqual({ module: 'src/nonexistent', files: [], edges: [] });
  });
});

describe('refsFeed', () => {
  it('returns the whole module graph as stored', () => {
    const refs = [
      { from_module: 'src/billing', to_module: 'src/checkout', count: 2 },
      { from_module: 'src/checkout', to_module: 'src/billing', count: 1 },
    ];
    expect(refsFeed(fakeIndex({ refs }))).toEqual(refs);
    expect(refsFeed(fakeIndex({}))).toEqual([]);
  });
});

describe('search', () => {
  const index = fakeIndex({
    facts: [
      fact('decision.money', 'certified', { heading: 'Money as minor units', body: 'integers' }),
      fact('decision.draft', 'proposed', { heading: 'Money draft', body: 'maybe decimals' }),
    ],
    // sqlite bm25 is negative (more negative = better); money is the stronger hit.
    fts: (q) =>
      q.includes('money')
        ? new Map([
            ['decision.money', -2],
            ['decision.draft', -1],
          ])
        : new Map(),
  });

  it('returns ranked hits, certified above proposed', () => {
    const hits = search(index, 'money');
    expect(hits.map((h) => h.id)).toContain('decision.money');
    // certified (×1.0) outranks the weaker proposed (×0.6) hit
    expect(hits[0]?.id).toBe('decision.money');
  });

  it('returns nothing for a blank query', () => {
    expect(search(index, '   ')).toEqual([]);
  });

  it('prefix-matches the token being typed and lands rules on their module (24d)', () => {
    // the fake fts stub above can't exercise prefixing - use the real index
    const dir = mkdtempSync(join(tmpdir(), 'artha-search-'));
    const dbPath = join(dir, 'index.db');
    try {
      writeFixtureIndex(dbPath);
      const real = openArthaIndex(dbPath);
      // mid-word: "mon" must already surface the money facts
      const hits = search(real, 'mon', undefined, 20, ['src']);
      expect(hits.map((h) => h.id)).toContain('decision.money');
      // a rule/decision hit carries the module it governs, so the command bar
      // can open it somewhere real instead of rendering an inert row
      expect(hits.find((h) => h.id === 'decision.money')?.module).toBe('src');
      real.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
