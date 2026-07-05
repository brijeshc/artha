import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  Catalog as CatalogData,
  ConceptDetail,
  FlowDetail,
  MapFeed,
  ModuleDetail,
  RankedModule,
  Suggestion,
} from '../../web/src/api';
import { Atlas } from '../../web/src/components/Atlas';
import { CapCard } from '../../web/src/components/CapCard';
import { ConceptPage, FlowPage } from '../../web/src/components/CapabilityPages';
import { CatalogPage } from '../../web/src/components/CatalogPage';
import { CommandBar } from '../../web/src/components/CommandBar';
import { InferredPage } from '../../web/src/components/Inferred';
import { Inspector } from '../../web/src/components/Inspector';
import { ModulePage } from '../../web/src/components/ModulePage';
import { Navigator } from '../../web/src/components/Navigator';
import { QueuePage } from '../../web/src/components/QueuePage';
import { TopBar } from '../../web/src/components/TopBar';
import {
  areaStats,
  atlasLayout,
  capabilitiesByArea,
  capabilityEntries,
  coverageBucket,
  kpis,
  moduleOfPath,
  shortName,
} from '../../web/src/derive';
import { parseRoute, routeHref } from '../../web/src/router';
import { treemap } from '../../web/src/treemap';

// Structure-level rendering checks (the human legibility run is T20). The test
// env is `node`, so pure presentational components render to static markup -
// no jsdom, no fetch - and the assertions target the visual *encoding*: the
// treemap's area∝churn geometry, the coverage classes, the ladder's
// linked/hollow rungs, the module page's fact grouping.

const noop = () => {};

// Curation is exercised at the server/write layer; here the pages only need a
// no-op so the presentational structure (the affordances) renders.
const noopCuration = {
  certify: async () => {},
  link: async () => {},
  edit: async () => {},
};

function markup(el: JSX.Element): string {
  return renderToStaticMarkup(el);
}

function count(html: string, re: RegExp): number {
  return (html.match(re) ?? []).length;
}

// ── fixtures ─────────────────────────────────────────────────────────────────

const feed: MapFeed = {
  cold: false,
  areas: [
    {
      area: 'Billing & Money',
      modules: ['src/billing', 'src/payments'],
      concepts: ['concept.invoice'],
      flows: ['flow.refund'],
      dark: false,
    },
    { area: 'src/legacy', modules: ['src/legacy'], concepts: [], flows: [], dark: true },
  ],
  modules: [
    {
      module: 'src/billing',
      dark: false,
      churn: 40,
      certifiedFacts: 5,
      staleFacts: 1,
      score: 0.7,
    },
    {
      module: 'src/payments',
      dark: false,
      churn: 10,
      certifiedFacts: 1,
      staleFacts: 0,
      score: 0.4,
    },
    { module: 'src/legacy', dark: true, churn: 20, certifiedFacts: 0, staleFacts: 0, score: 0 },
  ],
};

const catalog: CatalogData = {
  concepts: [
    {
      id: 'concept.invoice',
      name: 'Invoice',
      status: 'certified',
      modules: ['src/billing'],
      states: ['draft', 'open', 'paid'],
    },
  ],
  flows: [
    {
      id: 'flow.refund',
      name: 'Refund a purchase',
      status: 'proposed',
      modules: ['src/billing', 'src/payments'],
      steps: 4,
      linked: 2,
    },
  ],
};

const zones: RankedModule[] = [
  {
    module: 'src/legacy',
    score: 0,
    churn: 20,
    coverage: 0,
    freshness: 1,
    certifiedFacts: 0,
    staleFacts: 0,
  },
  {
    module: 'src/payments',
    score: 0.4,
    churn: 10,
    coverage: 0.5,
    freshness: 1,
    certifiedFacts: 1,
    staleFacts: 0,
  },
];

// ── router ───────────────────────────────────────────────────────────────────

describe('router', () => {
  it('round-trips every route through its href', () => {
    const routes = [
      { view: 'atlas' },
      { view: 'atlas', area: 'Billing & Money' },
      { view: 'atlas', module: 'src/billing' },
      { view: 'capabilities' },
      { view: 'queue' },
      { view: 'module', id: 'src/billing' },
      { view: 'concept', id: 'concept.invoice' },
      { view: 'flow', id: 'flow.refund' },
    ] as const;
    for (const r of routes) expect(parseRoute(routeHref(r))).toEqual(r);
  });

  it('falls back to the atlas on junk', () => {
    expect(parseRoute('')).toEqual({ view: 'atlas' });
    expect(parseRoute('#/nonsense/x')).toEqual({ view: 'atlas' });
    expect(parseRoute('#/module/')).toEqual({ view: 'atlas' });
  });
});

// ── treemap geometry ─────────────────────────────────────────────────────────

describe('treemap', () => {
  const items = [
    { key: 'a', value: 6 },
    { key: 'b', value: 3 },
    { key: 'c', value: 1 },
  ];

  it('gives each item area proportional to its value and tiles the whole rect', () => {
    const rects = treemap(items, 0, 0, 100, 100);
    const areaOf = (k: string) => {
      const r = rects.find((x) => x.key === k);
      if (!r) throw new Error(`missing ${k}`);
      return r.w * r.h;
    };
    expect(areaOf('a')).toBeCloseTo(6000, 5);
    expect(areaOf('b')).toBeCloseTo(3000, 5);
    expect(areaOf('c')).toBeCloseTo(1000, 5);
    expect(rects.reduce((t, r) => t + r.w * r.h, 0)).toBeCloseTo(10000, 5);
  });

  it('keeps every rect inside the bounds and never overlaps', () => {
    const rects = treemap(items, 10, 20, 300, 200);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(10 - 1e-6);
      expect(r.y).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(r.x + r.w).toBeLessThanOrEqual(310 + 1e-6);
      expect(r.y + r.h).toBeLessThanOrEqual(220 + 1e-6);
    }
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        expect(Math.min(overlapX, overlapY)).toBeLessThanOrEqual(1e-6);
      }
  });

  it('is deterministic regardless of input order', () => {
    const shuffled = [items[2], items[0], items[1]];
    expect(treemap(shuffled, 0, 0, 100, 100)).toEqual(treemap(items, 0, 0, 100, 100));
  });

  it('drops zero-value items and survives a zero rect', () => {
    expect(treemap([{ key: 'z', value: 0 }], 0, 0, 100, 100)).toEqual([]);
    expect(treemap(items, 0, 0, 0, 100)).toEqual([]);
  });
});

describe('atlasLayout', () => {
  it('lays grouped areas as provinces with their modules inside', () => {
    const provinces = atlasLayout(feed, 800, 600);
    const billing = provinces.find((p) => p.area.area === 'Billing & Money');
    expect(billing?.grouped).toBe(true);
    expect(billing?.tiles.map((t) => t.module.module).sort()).toEqual([
      'src/billing',
      'src/payments',
    ]);
    // solo default area renders borderless (no double label)
    const legacy = provinces.find((p) => p.area.area === 'src/legacy');
    expect(legacy?.grouped).toBe(false);

    // area ∝ churn: billing (40) gets more terrain than payments (10)
    const rectOf = (m: string) => {
      const t = billing?.tiles.find((x) => x.module.module === m);
      if (!t) throw new Error(`missing ${m}`);
      return t.rect.w * t.rect.h;
    };
    expect(rectOf('src/billing')).toBeGreaterThan(rectOf('src/payments') * 2);

    // every tile stays inside its province
    for (const p of provinces)
      for (const t of p.tiles) {
        expect(t.rect.x).toBeGreaterThanOrEqual(p.rect.x - 1e-6);
        expect(t.rect.x + t.rect.w).toBeLessThanOrEqual(p.rect.x + p.rect.w + 1e-6);
      }
  });
});

// ── derive ───────────────────────────────────────────────────────────────────

describe('derive', () => {
  it('buckets coverage by certified depth', () => {
    expect(coverageBucket(feed.modules[0])).toBe('understood'); // 5 certified
    expect(coverageBucket(feed.modules[1])).toBe('thin'); // 1
    expect(coverageBucket(feed.modules[2])).toBe('dark'); // 0
  });

  it('derives churn-weighted KPIs from the map feed', () => {
    const k = kpis(feed);
    const byKey = Object.fromEntries(k.map((x) => [x.key, x]));
    expect(byKey.explained.value).toBe('71%'); // 50 of 70 churn is explained
    expect(byKey.dark.value).toBe('1');
    expect(byKey.stale.value).toBe('1');
    expect(byKey.certified.value).toBe('6');
  });

  it('rolls areas up for the navigator', () => {
    const stats = areaStats(feed);
    const billing = stats.find((s) => s.area.area === 'Billing & Money');
    expect(billing).toMatchObject({ churn: 50, certified: 6, stale: 1, darkModules: 0 });
    expect(billing?.explained).toBe(1);
  });

  it('groups capabilities under the areas their modules belong to', () => {
    const groups = capabilitiesByArea(catalog, feed.areas);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.area?.area).toBe('Billing & Money');
    expect(groups[0]?.entries.map((e) => e.name)).toEqual(['Invoice', 'Refund a purchase']);
  });

  it('shortens module paths to place-names', () => {
    expect(shortName('src/billing')).toBe('billing');
    expect(shortName('lib')).toBe('lib');
  });

  it('resolves a pinned path to its owning module (longest prefix wins)', () => {
    expect(moduleOfPath('src/billing/refund.ts', ['src', 'src/billing'])).toBe('src/billing');
    expect(moduleOfPath('src/billing', ['src/billing'])).toBe('src/billing');
    // `src/billing-x` must not match `src/billing` (prefix ends at a separator)
    expect(moduleOfPath('src/billing-x/a.ts', ['src/billing'])).toBeNull();
    expect(moduleOfPath('lib/util.ts', ['src/billing'])).toBeNull();
  });
});

// ── atlas rendering ──────────────────────────────────────────────────────────

describe('Atlas', () => {
  const base = {
    feed,
    width: 800,
    height: 600,
    selectedArea: null,
    selectedModule: null,
    zones,
  };

  it('encodes coverage as terrain brightness classes', () => {
    const html = markup(<Atlas {...base} />);
    expect(html).toContain('cov-understood');
    expect(html).toContain('cov-thin');
    expect(html).toContain('cov-dark');
    expect(html).toContain('has-stale'); // billing's stale fact hatches its tile
    expect(html).toContain('Billing &amp; Money'); // the province is named
    expect(html).toContain('billing'); // tiles carry place-names
  });

  it('selection lights the module and dims the rest', () => {
    const html = markup(<Atlas {...base} selectedModule="src/billing" />);
    expect(count(html, /class="[^"]*\bselected\b[^"]*"/g)).toBeGreaterThanOrEqual(1);
    expect(html).toContain('dimmed');
    // a selected tile's second click opens its module page
    expect(html).toContain(`href="${routeHref({ view: 'module', id: 'src/billing' })}"`);
  });

  it('outlines a selected tile’s first-hop structural neighbours (T17b)', () => {
    const html = markup(
      <Atlas {...base} selectedModule="src/billing" neighbors={new Set(['src/payments'])} />,
    );
    // the neighbour is outlined (not lit/glowing) and stays undimmed
    expect(count(html, /class="[^"]*\bneighbor\b[^"]*"/g)).toBe(1);
    // an unrelated tile still dims - the outline is not a global un-dim
    expect(html).toContain('dimmed');
  });

  it('cold start renders the funnel over the dark terrain, never a blank', () => {
    const coldFeed: MapFeed = {
      cold: true,
      areas: [{ area: 'src/app', modules: ['src/app'], concepts: [], flows: [], dark: true }],
      modules: [
        { module: 'src/app', dark: true, churn: 9, certifiedFacts: 0, staleFacts: 0, score: 0 },
      ],
    };
    const html = markup(<Atlas {...base} feed={coldFeed} zones={[zones[0]]} />);
    expect(html).toContain('0% of active code explained');
    expect(html).toContain('cold-funnel');
    expect(html).toContain(routeHref({ view: 'module', id: 'src/legacy' }));
    expect(html).toContain('#/queue');
  });

  it('ships the legend so the encoding is explained on the surface', () => {
    const html = markup(<Atlas {...base} />);
    expect(html).toContain('Legend');
    expect(html).toContain('dark zone');
  });
});

// ── shell chrome ─────────────────────────────────────────────────────────────

describe('TopBar', () => {
  it('shows the wordmark, breadcrumb, and the four readouts', () => {
    const html = markup(
      <TopBar
        crumbs={[
          { label: 'Atlas', href: '#/' },
          { label: 'src/billing', mono: true },
        ]}
        kpis={kpis(feed)}
        onOpenCmdk={noop}
      />,
    );
    expect(html).toContain('Artha');
    expect(html).toContain('src/billing');
    expect(html).toContain('71%');
    expect(html).toContain('dark zones');
    // platform-spelled shortcut: ⌘K on a Mac, Ctrl K everywhere else
    expect(html).toMatch(/⌘K|Ctrl K/);
  });
});

describe('Navigator', () => {
  it('lists views, product areas with capabilities, and solo modules', () => {
    const html = markup(
      <Navigator
        route={{ view: 'atlas' }}
        feed={feed}
        catalog={catalog}
        stats={areaStats(feed)}
        zoneCount={1}
      />,
    );
    expect(html).toContain('Atlas');
    expect(html).toContain('Capabilities');
    expect(html).toContain('Dark zones');
    expect(html).toContain('Billing &amp; Money');
    expect(html).toContain('Invoice'); // capability by product name
    expect(html).toContain('legacy'); // solo module under "Other modules"
    expect(html).toContain(routeHref({ view: 'concept', id: 'concept.invoice' }));
  });
});

describe('Inspector', () => {
  const detail: ModuleDetail = {
    module: 'src/billing',
    areas: ['Billing & Money'],
    dark: false,
    churn: 40,
    score: 0.7,
    certifiedFacts: 5,
    staleFacts: 1,
    queueRank: null,
    concepts: [
      {
        id: 'concept.invoice',
        kind: 'concept',
        name: 'Invoice',
        status: 'certified',
        body: 'A bill.',
        symbols: ['src/billing/Invoice.ts#Invoice'],
        stalePins: 0,
        viaScope: false,
      },
    ],
    flows: [],
    rules: [
      {
        id: 'invariant.money',
        kind: 'invariant',
        name: 'Money is integer minor units',
        status: 'certified',
        body: 'Never floats.',
        symbols: [],
        stalePins: 0,
        viaScope: true,
      },
    ],
    decisions: [],
    dependsOn: [{ module: 'src/checkout', count: 2 }],
    usedBy: [{ module: 'src/payments', count: 1 }],
  };

  it('quick-looks a module: standing, stats, capabilities, rules', () => {
    const html = markup(
      <Inspector
        content={{
          kind: 'module',
          module: 'src/billing',
          mapModule: feed.modules[0],
          detail,
        }}
      />,
    );
    expect(html).toContain('billing');
    expect(html).toContain('understood');
    expect(html).toContain('40');
    expect(html).toContain('Invoice');
    expect(html).toContain('Money is integer minor units');
    expect(html).toContain('Open module');
  });

  it('quick-looks an area with its capabilities and modules', () => {
    const stat = areaStats(feed)[0];
    const entries = capabilityEntries(catalog);
    const html = markup(<Inspector content={{ kind: 'area', stat, entries }} />);
    expect(html).toContain('Billing &amp; Money');
    expect(html).toContain('100%');
    expect(html).toContain('Invoice');
    expect(html).toContain('src/payments');
  });

  it('shows the module’s structural neighbours (wired to, T17b)', () => {
    const html = markup(
      <Inspector
        content={{ kind: 'module', module: 'src/billing', mapModule: feed.modules[0], detail }}
      />,
    );
    expect(html).toContain('Wired to');
    expect(html).toContain('checkout'); // a depends-on neighbour, by place-name
  });
});

// ── pages ────────────────────────────────────────────────────────────────────

describe('ModulePage (engineer lens, 16c)', () => {
  const detail: ModuleDetail = {
    module: 'src/billing',
    areas: ['Billing & Money'],
    dark: false,
    churn: 40,
    score: 0.7,
    certifiedFacts: 5,
    staleFacts: 1,
    queueRank: null,
    concepts: [
      {
        id: 'concept.invoice',
        kind: 'concept',
        name: 'Invoice',
        status: 'certified',
        body: 'A bill.',
        symbols: ['src/billing/Invoice.ts#Invoice'],
        stalePins: 0,
        viaScope: false,
      },
    ],
    flows: [],
    rules: [
      {
        id: 'invariant.money',
        kind: 'invariant',
        name: 'Money is integer minor units',
        status: 'certified',
        body: 'All money is integer minor units. Never floats.',
        symbols: [],
        stalePins: 0,
        viaScope: true,
      },
    ],
    decisions: [
      {
        id: 'decision.stripe',
        kind: 'decision',
        name: 'Use Stripe',
        status: 'stale',
        body: 'Fewer PCI burdens.',
        symbols: ['src/billing/stripe.ts#client'],
        stalePins: 1,
        viaScope: false,
      },
    ],
    dependsOn: [{ module: 'src/payments', count: 3 }],
    usedBy: [{ module: 'src/checkout', count: 1 }],
  };
  const capabilityOf = (f: { id: string }) =>
    capabilityEntries(catalog).find((e) => e.ref.id === f.id) ?? null;

  it('groups capabilities, rules (with their text), and the why', () => {
    const html = markup(
      <ModulePage detail={detail} capabilityOf={capabilityOf} curation={noopCuration} />,
    );
    expect(html).toContain('Built on this module');
    expect(html).toContain('Invoice');
    expect(html).toContain('Rules in scope');
    expect(html).toContain('All money is integer minor units. Never floats.');
    expect(html).toContain('in scope'); // the via-scope join is visible
    expect(html).toContain('Why it is this way');
    expect(html).toContain('Fewer PCI burdens.');
    expect(html).toContain('1 stale pin');
    expect(html).toContain('src/billing/stripe.ts#client');
  });

  it('a dark module says so and funnels into the queue', () => {
    const darkDetail: ModuleDetail = {
      ...detail,
      dark: true,
      certifiedFacts: 0,
      staleFacts: 0,
      queueRank: 1,
      concepts: [],
      flows: [],
      rules: [],
      decisions: [],
    };
    const html = markup(
      <ModulePage detail={darkDetail} capabilityOf={capabilityOf} curation={noopCuration} />,
    );
    expect(html).toContain('dark zone');
    expect(html).toContain('#/queue');
    expect(html).toContain('#1'); // its queue position
    // even a dark module shows how it's wired in code (structure survives no meaning)
    expect(html).toContain('Wired to');
  });

  it('shows what the module is wired to, with links and coupling counts (T17b)', () => {
    const html = markup(
      <ModulePage detail={detail} capabilityOf={capabilityOf} curation={noopCuration} />,
    );
    expect(html).toContain('Wired to');
    expect(html).toContain('Depends on');
    expect(html).toContain('Used by');
    expect(html).toContain(`href="${routeHref({ view: 'module', id: 'src/payments' })}"`);
    expect(html).toContain('×3'); // src/payments is imported 3 times
  });
});

describe('ConceptPage', () => {
  const detail: ConceptDetail = {
    id: 'concept.invoice',
    kind: 'concept',
    name: 'Invoice',
    summary: 'A bill the customer owes.',
    status: 'certified',
    certifiedBy: 'brijesh',
    certifiedAt: '2026-06-18',
    states: [
      { name: 'draft', effect: 'not yet sent', invariant: null },
      { name: 'open', effect: null, invariant: 'amount is positive' },
      { name: 'paid', effect: 'revenue recognised', invariant: null },
    ],
    transitions: [
      { from: 'draft', to: 'open', trigger: 'sent to customer' },
      { from: 'open', to: 'paid', trigger: 'payment lands' },
      { from: 'open', to: 'draft', trigger: 'withdrawn' },
    ],
    pins: [
      { symbol: 'src/billing/Invoice.ts#Invoice', symbolId: 's1', contentHash: 'h', stale: false },
    ],
    related: ['decision.no_float_money', 'flow.refund'],
    modules: ['src/billing'],
  };

  it('draws the machine (node per state, edge per transition) plus the table', () => {
    const html = markup(
      <ConceptPage
        detail={detail}
        names={new Map([['flow.refund', 'Refund a purchase']])}
        curation={noopCuration}
      />,
    );
    expect(count(html, /sm-node-box/g)).toBe(3);
    expect(count(html, /class="sm-edge /g)).toBe(3); // one <g> per transition
    expect(html).toContain('sent to customer');
    expect(html).toContain('amount is positive'); // invariant column
    expect(html).toContain('src/billing/Invoice.ts#Invoice');
    // related resolves to product names where known, ids elsewhere
    expect(html).toContain('Refund a purchase');
    expect(html).toContain('decision.no_float_money');
    expect(html).toContain('certified by brijesh');
  });

  it('links each pin to the module that owns the code (the engineer lens)', () => {
    const html = markup(<ConceptPage detail={detail} names={new Map()} curation={noopCuration} />);
    expect(html).toContain(
      `class="pin-link" href="${routeHref({ view: 'module', id: 'src/billing' })}"`,
    );
  });
});

describe('FlowPage', () => {
  const detail: FlowDetail = {
    id: 'flow.refund',
    kind: 'flow',
    name: 'Refund a purchase',
    summary: 'Give the money back safely.',
    status: 'proposed',
    certifiedBy: null,
    certifiedAt: null,
    entry: [
      { symbol: 'src/refunds/routes.ts#postRefund', symbolId: 'e', contentHash: 'h', stale: false },
    ],
    steps: [
      {
        on: 'customer asks',
        do: 'validate the request',
        pin: {
          symbol: 'src/refunds/validate.ts#validate',
          symbolId: 's',
          contentHash: 'h',
          stale: false,
        },
      },
      { on: null, do: 'reverse the charge', pin: null },
    ],
    related: [],
    modules: ['src/refunds'],
  };

  it('renders the ladder with linked and hollow rungs and the coverage count', () => {
    const html = markup(<FlowPage detail={detail} names={new Map()} curation={noopCuration} />);
    expect(html).toContain('1/2 linked');
    expect(count(html, /class="rung linked"/g)).toBe(1);
    expect(count(html, /class="rung"/g)).toBe(1); // the not-yet-linked rung
    expect(html).toContain('not yet linked to code');
    expect(html).toContain('Entry points');
    expect(html).toContain('on customer asks');
    expect(html).not.toContain('error');
  });

  it('entry and step pins link to their module page', () => {
    const html = markup(<FlowPage detail={detail} names={new Map()} curation={noopCuration} />);
    const href = routeHref({ view: 'module', id: 'src/refunds' });
    // the entry pin and the one linked step both resolve to src/refunds
    // (the header's module chip also links there, so count pin-links only)
    expect(
      count(
        html,
        new RegExp(`class="pin-link" href="${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g'),
      ),
    ).toBe(2);
  });
});

describe('curation affordances (T17)', () => {
  const concept = (status: string): ConceptDetail => ({
    id: 'concept.checkout',
    kind: 'concept',
    name: 'Checkout',
    summary: 'Cart to a paid order.',
    status,
    certifiedBy: status === 'certified' ? 'ada' : null,
    certifiedAt: status === 'certified' ? '2026-06-01' : null,
    states: [],
    transitions: [],
    pins: [],
    related: [],
    modules: [],
  });

  it('a proposed capability offers certify, link, and edit', () => {
    const html = markup(
      <ConceptPage detail={concept('proposed')} names={new Map()} curation={noopCuration} />,
    );
    expect(count(html, /btn-certify/g)).toBeGreaterThanOrEqual(1);
    expect(html).toContain('Certify');
    expect(html).toContain('Link code'); // the drag-to-pin affordance
    expect(html).toContain('Edit');
  });

  it('a certified capability hides certify but still allows link + edit', () => {
    const html = markup(
      <ConceptPage detail={concept('certified')} names={new Map()} curation={noopCuration} />,
    );
    // the "Certify" button is gone once certified…
    expect(count(html, /class="btn btn-certify"/g)).toBe(0);
    // …but you can still link more code and edit
    expect(html).toContain('Link code');
    expect(html).toContain('Edit');
  });

  it('a flow always exposes an entry-point link surface, even with no pins', () => {
    const emptyFlow: FlowDetail = {
      id: 'flow.onboarding',
      kind: 'flow',
      name: 'Onboarding',
      summary: 'First run.',
      status: 'proposed',
      certifiedBy: null,
      certifiedAt: null,
      entry: [],
      steps: [],
      related: [],
      modules: [],
    };
    const html = markup(<FlowPage detail={emptyFlow} names={new Map()} curation={noopCuration} />);
    expect(html).toContain('Entry points');
    expect(html).toContain('Link code');
    expect(html).toContain('Certify');
  });

  it('the module lens certifies exactly the not-yet-certified rules/decisions', () => {
    const detail: ModuleDetail = {
      module: 'src/billing',
      areas: ['src/billing'],
      dark: false,
      churn: 12,
      score: 0.3,
      certifiedFacts: 1,
      staleFacts: 0,
      queueRank: null,
      concepts: [],
      flows: [],
      rules: [
        {
          id: 'invariant.money',
          kind: 'invariant',
          name: 'Money',
          status: 'certified',
          body: 'Integer minor units.',
          symbols: [],
          stalePins: 0,
          viaScope: true,
        },
      ],
      decisions: [
        {
          id: 'decision.stripe',
          kind: 'decision',
          name: 'Use Stripe',
          status: 'proposed',
          body: 'Fewer PCI burdens.',
          symbols: ['src/billing/stripe.ts#client'],
          stalePins: 0,
          viaScope: false,
        },
      ],
      dependsOn: [],
      usedBy: [],
    };
    const html = markup(
      <ModulePage detail={detail} capabilityOf={() => null} curation={noopCuration} />,
    );
    // one certify button: the proposed decision, not the certified invariant
    expect(count(html, /btn-certify/g)).toBe(1);
  });
});

describe('suggested code (T17b)', () => {
  const suggestions: Suggestion[] = [
    {
      ref: 'src/checkout/checkout.ts#finalize',
      name: 'finalize',
      path: 'src/checkout/checkout.ts',
      kind: 'function',
      why: 'referenced by pinned code',
      score: 1000,
    },
    {
      ref: 'src/billing/refund.ts#issueRefund',
      name: 'issueRefund',
      path: 'src/billing/refund.ts',
      kind: 'function',
      why: 'name match',
      score: 6,
    },
  ];

  const proposedConcept: ConceptDetail = {
    id: 'concept.checkout',
    kind: 'concept',
    name: 'Checkout',
    summary: 'Cart to a paid order.',
    status: 'proposed',
    certifiedBy: null,
    certifiedAt: null,
    states: [],
    transitions: [],
    pins: [],
    related: [],
    modules: [],
  };

  it('offers ranked, explainable one-click pins under the pins list', () => {
    const html = markup(
      <ConceptPage
        detail={proposedConcept}
        names={new Map()}
        curation={noopCuration}
        suggestions={suggestions}
      />,
    );
    expect(html).toContain('Suggested code');
    expect(html).toContain('issueRefund');
    expect(html).toContain('finalize');
    expect(html).toContain('near linked code'); // the "referenced by pinned code" label
    expect(html).toContain('name match');
    // one Link button per suggestion (confirm rides POST /api/pin)
    expect(count(html, /suggest-link/g)).toBe(2);
  });

  it('a flow surfaces the fan-out of its entry point as suggestions', () => {
    const flow: FlowDetail = {
      id: 'flow.checkout',
      kind: 'flow',
      name: 'Checkout',
      summary: 'Cart to a paid order.',
      status: 'proposed',
      certifiedBy: null,
      certifiedAt: null,
      entry: [],
      steps: [],
      related: [],
      modules: [],
    };
    const html = markup(
      <FlowPage
        detail={flow}
        names={new Map()}
        curation={noopCuration}
        suggestions={suggestions}
      />,
    );
    expect(html).toContain('Suggested code');
    expect(html).toContain('finalize');
  });

  it('renders no suggestion block when there are none', () => {
    const html = markup(
      <ConceptPage
        detail={proposedConcept}
        names={new Map()}
        curation={noopCuration}
        suggestions={[]}
      />,
    );
    expect(html).not.toContain('Suggested code');
  });
});

describe('CatalogPage', () => {
  it('sections capabilities by product area', () => {
    const html = markup(<CatalogPage catalog={catalog} feed={feed} />);
    expect(html).toContain('Billing &amp; Money');
    expect(html).toContain('Invoice');
    expect(html).toContain('draft'); // the state chain preview
    expect(html).toContain('2 of 4 steps linked');
  });

  it('cold catalog invites the first capability, never errors', () => {
    const html = markup(<CatalogPage catalog={{ concepts: [], flows: [] }} feed={feed} />);
    expect(html).toContain('No capabilities have been described yet');
  });
});

describe('QueuePage', () => {
  it('ranks dark zones with churn bars and standings', () => {
    const html = markup(<QueuePage zones={zones} cold={false} />);
    expect(html).toContain('01');
    expect(html).toContain('src/legacy');
    expect(html).toContain('unexplained');
    expect(html).toContain('partly explained');
    expect(html).toContain(routeHref({ view: 'module', id: 'src/legacy' }));
  });

  it('empty queue is a statement, not an error', () => {
    const html = markup(<QueuePage zones={[]} cold={false} />);
    expect(html).toContain('Nothing is dark');
  });
});

describe('CapCard', () => {
  it('previews a flow as step dots', () => {
    const entry = capabilityEntries(catalog).find((e) => e.ref.kind === 'flow');
    if (!entry) throw new Error('missing flow entry');
    const html = markup(<CapCard entry={entry} />);
    expect(count(html, /step-dot linked/g)).toBe(2);
    expect(count(html, /step-dot\b/g)).toBe(4);
  });
});

describe('CommandBar', () => {
  it('renders nothing when closed and an input when open', () => {
    expect(markup(<CommandBar open={false} feed={feed} onClose={noop} onGo={noop} />)).toBe('');
    const html = markup(<CommandBar open feed={feed} onClose={noop} onGo={noop} />);
    expect(html).toContain('cmdk-input');
    expect(html).toContain('Find a capability, module, or rule…');
  });
});

// ── the inferred layer / moonlight (21a) ─────────────────────────────────────

describe('inferred layer (21a) - moonlight', () => {
  const moonFeed: MapFeed = {
    cold: false,
    areas: [{ area: 'src/orders', modules: ['src/orders'], concepts: [], flows: [], dark: true }],
    modules: [
      {
        module: 'src/orders',
        dark: true,
        churn: 12,
        certifiedFacts: 0,
        staleFacts: 0,
        score: 0.2,
        described: true,
        inferredConcepts: 2,
      },
    ],
  };

  it('renders a described (dark, no-certified) module as a moonlit tile, not black', () => {
    const html = markup(
      <Atlas
        feed={moonFeed}
        width={800}
        height={600}
        selectedArea={null}
        selectedModule={null}
        zones={[]}
      />,
    );
    // the tile carries the moonlight class and reads "described", not "unexplained"
    expect(html).toContain('moonlit');
    expect(html).toContain('moon-word');
    expect(html).not.toContain('unexplained');
  });

  it('the legend explains the two lights (described vs vouched)', () => {
    const html = markup(
      <Atlas
        feed={moonFeed}
        width={800}
        height={600}
        selectedArea={null}
        selectedModule={null}
        zones={[]}
      />,
    );
    expect(html).toContain('moonlight');
    expect(html).toContain('not yet vouched by your team');
  });

  it('router round-trips the inferred route', () => {
    const r = { view: 'inferred', id: 'inferred:concept:src/orders/types.ts#OrderStatus' } as const;
    expect(parseRoute(routeHref(r))).toEqual(r);
  });

  const inferredConcept = {
    id: 'inferred:concept:src/orders/types.ts#OrderStatus',
    kind: 'concept',
    module: 'src/orders',
    name: 'Order Status',
    summary:
      '3 states read from the `OrderStatus` type. What each state means is not yet described.',
    confidence: 'read-from-code',
    states: ['pending', 'shipped', 'delivered'],
    pins: [
      {
        symbol: 'src/orders/types.ts#OrderStatus',
        symbolId: 'src/orders/types.ts#OrderStatus',
        contentHash: 'abc123',
        stale: false,
      },
    ],
  };

  it('the inferred page leads with prose, states, evidence, and the delta band', () => {
    const html = markup(<InferredPage detail={inferredConcept} />);
    expect(html).toContain('Order Status');
    expect(html).toContain('read from code'); // worded confidence, never a number
    expect(html).toContain('not yet vouched');
    expect(html).toContain('pending'); // a state read from code
    expect(html).toContain('src/orders/types.ts#OrderStatus'); // the evidence pin
    expect(html).toContain('What the code can’t say'); // the delta band (D6)
  });

  it('the module page leads with the moonlight card and lists inferred capabilities', () => {
    const detail: ModuleDetail = {
      module: 'src/orders',
      areas: ['src/orders'],
      dark: true,
      churn: 12,
      score: 0.2,
      certifiedFacts: 0,
      staleFacts: 0,
      queueRank: 3,
      concepts: [],
      flows: [],
      rules: [],
      decisions: [],
      dependsOn: [],
      usedBy: [],
      card: {
        id: 'inferred:module:src/orders',
        kind: 'module',
        module: 'src/orders',
        name: 'Orders',
        summary: 'Entry area that draws on Billing. Exposes placeOrder, OrderStatus and 2 more.',
        confidence: 'read-from-code',
        states: [],
        pins: [],
      },
      inferredConcepts: [inferredConcept],
    };
    const html = markup(
      <ModulePage detail={detail} capabilityOf={() => null} curation={noopCuration} />,
    );
    // the lead prose replaces the black dark-empty state
    expect(html).toContain('Entry area that draws on Billing');
    expect(html).not.toContain('No certified meaning touches this module');
    // the machine-described capability surfaces and links to the inferred page
    expect(html).toContain('Machine-described capabilities');
    expect(html).toContain(
      routeHref({ view: 'inferred', id: 'inferred:concept:src/orders/types.ts#OrderStatus' }),
    );
  });

  it('the catalog shows a machine-described section below vouched capabilities', () => {
    const withInferred: CatalogData = {
      concepts: [],
      flows: [],
      inferredConcepts: [
        {
          id: inferredConcept.id,
          name: 'Order Status',
          module: 'src/orders',
          states: ['pending', 'shipped', 'delivered'],
          confidence: 'read-from-code',
        },
      ],
    };
    const html = markup(<CatalogPage catalog={withInferred} feed={moonFeed} />);
    expect(html).toContain('Machine-described capabilities');
    expect(html).toContain('Order Status');
    // not the empty state - the catalog has inferred content even with no vouched facts
    expect(html).not.toContain('No capabilities have been described yet');
  });
});
