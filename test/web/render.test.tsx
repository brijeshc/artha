import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  Catalog as CatalogData,
  ConceptDetail,
  EvidenceView,
  FlowDetail,
  InferredFactView,
  MapArea,
  MapFeed,
  ModuleBoardData,
  ModuleDetail,
  RankedModule,
  RefEdge,
  Suggestion,
  ValueRanked,
  VouchedPoint,
} from '../../web/src/api';
import { GAP_Y, boardLayout, fileBoardLayout } from '../../web/src/board';
import { Atlas } from '../../web/src/components/Atlas';
import { Board, BoardViewport, RouteCard } from '../../web/src/components/Board';
import { CapCard } from '../../web/src/components/CapCard';
import { ConceptPage, FlowPage } from '../../web/src/components/CapabilityPages';
import { CatalogPage } from '../../web/src/components/CatalogPage';
import { CommandBar } from '../../web/src/components/CommandBar';
import { EvidenceCode, EvidenceReveal } from '../../web/src/components/Evidence';
import { InferredPage } from '../../web/src/components/Inferred';
import { Inspector } from '../../web/src/components/Inspector';
import { FileCard, ModuleBoard } from '../../web/src/components/ModuleBoard';
import { ModulePage } from '../../web/src/components/ModulePage';
import { Navigator } from '../../web/src/components/Navigator';
import { Observatory } from '../../web/src/components/Observatory';
import { QueuePage } from '../../web/src/components/QueuePage';
import { ReviewWalk } from '../../web/src/components/ReviewWalk';
import { TopBar } from '../../web/src/components/TopBar';
import {
  areaShares,
  areaStats,
  atlasLayout,
  capabilitiesByArea,
  capabilitiesByModule,
  capabilitiesByPrimaryArea,
  capabilityEntries,
  capabilityReviewClaims,
  coverageBucket,
  flowTrace,
  flyingBlind,
  kpis,
  moduleOfPath,
  moduleReviewClaims,
  shortName,
  vouchedBurnup,
  whyNow,
} from '../../web/src/derive';
import { roughLine, roughRect, seedFrom } from '../../web/src/rough';
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
  setNotes: async () => {},
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
    {
      module: 'src/legacy',
      dark: true,
      churn: 20,
      certifiedFacts: 0,
      staleFacts: 0,
      score: 0,
      described: true,
      describedAs: 'Old order paths kept for imports.',
    },
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
      { view: 'atlas', flow: 'flow.refund' },
      { view: 'atlas', module: 'src/billing', flow: 'flow.refund', lens: 'terrain' },
      { view: 'atlas', lens: 'terrain' },
      { view: 'capabilities' },
      { view: 'observatory' },
      { view: 'queue' },
      { view: 'module', id: 'src/billing' },
      // the inner-board file selection (23b) is in the URL, so it deep-links
      { view: 'module', id: 'src/billing', file: 'src/billing/refund.ts' },
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

  it('derives honest KPIs: vouched depth and machine reach on separate lights (D11)', () => {
    const k = kpis(feed);
    const byKey = Object.fromEntries(k.map((x) => [x.key, x]));
    // vouched = the reachable share (24b): churn in modules holding a fresh
    // vouched fact - (40 + 10) / 70 - reaches 100% when every busy module does
    expect(byKey.vouched.value).toBe('71%');
    // described = the machine layer's reach (src/legacy only): 20 of 70 churn -
    // it reads moonlight, never the phosphor tone of trust
    expect(byKey.described.value).toBe('29%');
    expect(byKey.described.tone).toBe('moon');
    expect(byKey.dark.value).toBe('1');
    expect(byKey.stale.value).toBe('1');
    // the machine layer never inflates the trust number
    expect(byKey.vouched.value).not.toBe('100%');
  });

  it('rolls areas up for the navigator', () => {
    const stats = areaStats(feed);
    const billing = stats.find((s) => s.area.area === 'Billing & Money');
    expect(billing).toMatchObject({ churn: 50, certified: 6, stale: 1, darkModules: 0 });
    // the same reachable share as the top bar (24b): both modules hold a fresh
    // vouched fact, so the area reads fully vouched
    expect(billing?.vouched).toBeCloseTo(1, 6);
  });

  it('groups capabilities under the areas their modules belong to', () => {
    const groups = capabilitiesByArea(catalog, feed.areas);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.area?.area).toBe('Billing & Money');
    expect(groups[0]?.entries.map((e) => e.name)).toEqual(['Invoice', 'Refund a purchase']);
  });

  it('places each capability once, under its primary area with "also" chips (24e)', () => {
    // a flow spanning two areas must not become two cards
    const twoAreas: MapArea[] = [
      { area: 'Billing', modules: ['src/billing'], concepts: [], flows: [], dark: false },
      { area: 'Ops', modules: ['src/payments'], concepts: [], flows: [], dark: false },
    ];
    const spanning: CatalogData = {
      concepts: [],
      flows: [
        {
          id: 'flow.refund',
          name: 'Refund a purchase',
          status: 'proposed',
          modules: ['src/billing', 'src/payments'],
          steps: 3,
          linked: 2,
        },
      ],
    };
    const groups = capabilitiesByPrimaryArea(spanning, twoAreas);
    expect(groups).toHaveLength(1); // one placement, not one per touched area
    expect(groups[0]?.area?.area).toBe('Billing');
    expect(groups[0]?.entries).toHaveLength(1);
    expect(groups[0]?.entries[0]?.also).toEqual(['Ops']); // the rest named, not repeated
    // an unplaced capability still lands in the null group
    const unplaced = capabilitiesByPrimaryArea(
      { concepts: [], flows: [{ ...spanning.flows[0], modules: [] }] },
      twoAreas,
    );
    expect(unplaced[0]?.area).toBeNull();
  });

  it('shortens module paths to place-names', () => {
    expect(shortName('src/billing')).toBe('billing');
    expect(shortName('lib')).toBe('lib');
  });

  it('lists what each module carries - vouched first, then machine-described', () => {
    const caps = capabilitiesByModule({
      ...catalog,
      inferredConcepts: [
        {
          id: 'inferred.concept.order',
          name: 'Order State',
          module: 'src/billing',
          states: ['placed'],
          confidence: 'read-from-code',
        },
      ],
    });
    expect(caps.get('src/billing')?.map((c) => `${c.name}:${c.standing}`)).toEqual([
      'Invoice:certified',
      'Refund a purchase:proposed',
      'Order State:described',
    ]);
    expect(caps.get('src/payments')?.map((c) => c.name)).toEqual(['Refund a purchase']);
  });

  it('resolves a pinned path to its owning module (longest prefix wins)', () => {
    expect(moduleOfPath('src/billing/refund.ts', ['src', 'src/billing'])).toBe('src/billing');
    expect(moduleOfPath('src/billing', ['src/billing'])).toBe('src/billing');
    // `src/billing-x` must not match `src/billing` (prefix ends at a separator)
    expect(moduleOfPath('src/billing-x/a.ts', ['src/billing'])).toBeNull();
    expect(moduleOfPath('lib/util.ts', ['src/billing'])).toBeNull();
  });

  it('words a value-queue row’s "why now" from its factors (D10)', () => {
    const base = { module: 'm', score: 0, coverage: 0, freshness: 1, value: 1, uncertainty: 1 };
    // a busy, foundational, unvouched module: leverage · movement · the gap
    expect(whyNow({ ...base, churn: 30, reach: 3, certifiedFacts: 0, staleFacts: 0 })).toEqual([
      '3 modules depend on it',
      '30 recent changes',
      'nothing vouched here yet',
    ]);
    // a single importer agrees the verb: "1 module depends on it", not "depend"
    expect(whyNow({ ...base, churn: 4, reach: 1, certifiedFacts: 0, staleFacts: 0 })).toEqual([
      '1 module depends on it',
      '4 recent changes',
      'nothing vouched here yet',
    ]);
    // drift is a louder uncertainty than "partly vouched"
    expect(whyNow({ ...base, churn: 2, reach: 0, certifiedFacts: 3, staleFacts: 1 })).toEqual([
      '2 recent changes',
      '1 vouched fact drifted',
    ]);
    // drift also outranks emptiness: a module whose only vouched fact has drifted
    // reads "…drifted", never "nothing vouched here yet" (the "yet" would be a lie).
    expect(whyNow({ ...base, churn: 4, reach: 0, certifiedFacts: 0, staleFacts: 1 })).toEqual([
      '4 recent changes',
      '1 vouched fact drifted',
    ]);
    // reach 0 omits the leverage clause; some vouched, none drifted → partial
    expect(whyNow({ ...base, churn: 0, reach: 0, certifiedFacts: 2, staleFacts: 0 })).toEqual([
      'only partly vouched',
    ]);
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
    expect(html).toContain('0% of active code vouched');
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

// ── the board (blackboard flowchart, default canvas since 23a′) ──────────────

const refEdges: RefEdge[] = [
  { from_module: 'src/billing', to_module: 'src/payments', count: 3 },
  { from_module: 'src/payments', to_module: 'src/billing', count: 1 },
  { from_module: 'src/payments', to_module: 'src/legacy', count: 1 },
  { from_module: 'src/legacy', to_module: 'src/legacy', count: 9 }, // self-edge: never drawn
  { from_module: 'src/billing', to_module: 'src/gone', count: 2 }, // unplaced: skipped, not guessed
];

describe('chalk strokes (rough)', () => {
  it('is deterministic per seed - a rebuild redraws the same hand', () => {
    const a = roughLine(0, 0, 200, 80, seedFrom('src/billing'));
    const b = roughLine(0, 0, 200, 80, seedFrom('src/billing'));
    expect(a).toBe(b);
    expect(roughLine(0, 0, 200, 80, seedFrom('src/payments'))).not.toBe(a);
  });

  it('a chalk rectangle is four strokes with honest corners', () => {
    const d = roughRect(10, 10, 190, 72, 7);
    expect(count(d, /M /g)).toBe(4); // one stroke per side
    expect(d).not.toContain('NaN');
  });
});

describe('boardLayout', () => {
  const mod = (module: string): MapFeed['modules'][number] => ({
    module,
    dark: false,
    churn: 1,
    certifiedFacts: 0,
    staleFacts: 0,
    score: 0,
  });

  it('layers by dependency depth - consumers on top, foundations below', () => {
    const layout = boardLayout(
      [mod('src/a'), mod('src/b'), mod('src/c')],
      [
        { from_module: 'src/a', to_module: 'src/b', count: 1 },
        { from_module: 'src/b', to_module: 'src/c', count: 1 },
        { from_module: 'src/a', to_module: 'src/c', count: 2 },
      ],
    );
    const byName = new Map(layout.nodes.map((n) => [n.module, n]));
    expect(byName.get('src/a')?.layer).toBe(0);
    expect(byName.get('src/b')?.layer).toBe(1);
    expect(byName.get('src/c')?.layer).toBe(2); // longest path wins, not shortest
    // ample space: full row gaps between layers, nothing crammed
    const a = byName.get('src/a');
    const b = byName.get('src/b');
    if (!a || !b) throw new Error('missing nodes');
    expect(b.y - (a.y + a.h)).toBe(GAP_Y);
  });

  it('survives an import cycle deterministically', () => {
    const cyclic = [
      { from_module: 'src/billing', to_module: 'src/payments', count: 1 },
      { from_module: 'src/payments', to_module: 'src/billing', count: 1 },
    ];
    const one = boardLayout([mod('src/billing'), mod('src/payments')], cyclic);
    const two = boardLayout([mod('src/payments'), mod('src/billing')], cyclic);
    expect(one).toEqual(two); // input order never changes the board
    expect(one.nodes).toHaveLength(2);
  });

  it('never overlaps two boxes', () => {
    const layout = boardLayout(feed.modules, refEdges);
    for (let i = 0; i < layout.nodes.length; i++)
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i];
        const b = layout.nodes[j];
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
  });
});

describe('Board', () => {
  const base = {
    feed,
    refs: refEdges,
    catalog,
    selectedArea: null,
    selectedModule: null,
  };

  it('draws chalk boxes carrying the two-light grammar', () => {
    const html = markup(<Board {...base} />);
    expect(html).toContain('bnode-frame'); // the chalk frame
    expect(count(html, /class="bnode /g)).toBe(3);
    expect(html).toContain('bnode-vouched'); // billing/payments carry phosphor chalk
    expect(html).toContain('bnode-described'); // legacy glows moonlight, not black
    expect(html).toContain('has-stale'); // billing's ember chalk tick
    expect(html).toContain('billing'); // place-names in chalk
    expect(html).toContain('vouched ×5'); // one footer grammar: word, then count (24a)
  });

  it('scale shrinks the paper, never the board units (24c)', () => {
    const widthOf = (h: string) => Number(/<svg[^>]*width="([\d.]+)"/.exec(h)?.[1]);
    const plain = markup(<Board {...base} />);
    const half = markup(<Board {...base} scale={0.5} />);
    expect(widthOf(half)).toBeCloseTo(widthOf(plain) / 2, 5);
    // the viewBox (board units) is identical - positions and hrefs are scale-free
    const viewBox = (h: string) => /viewBox="[^"]*"/.exec(h)?.[0];
    expect(viewBox(half)).toBe(viewBox(plain));
  });

  it('the viewport carries the legend, zoom controls, and defines Δ (24c)', () => {
    const html = markup(<BoardViewport {...base} />);
    expect(html).toContain('board-controls');
    expect(html).toContain('Reading the board'); // the default view defines its words
    expect(html).toContain('Δ = change'); // the glyph is defined on-screen
    expect(html).toContain('board-zoom'); // the zoom readout
  });

  it('annotates boxes with meaning: the machine one-liner and product capabilities', () => {
    const html = markup(<Board {...base} />);
    // the module card's description, in moonlight chalk - the 21b slot
    expect(html).toContain('Old order paths kept for imports.');
    // what the box carries, in product language with standing dots
    expect(html).toContain('Invoice');
    expect(html).toContain('Refund a purchase');
    expect(html).toContain('standing-certified');
    expect(html).toContain('standing-proposed');
  });

  it('shows two capabilities and counts the rest honestly', () => {
    const rich: CatalogData = {
      ...catalog,
      inferredConcepts: [
        {
          id: 'inferred.concept.order',
          name: 'Order State',
          module: 'src/billing',
          states: ['placed'],
          confidence: 'read-from-code',
        },
      ],
      inferredFlows: [
        {
          id: 'inferred.flow.pay',
          name: 'Take Payment',
          module: 'src/payments',
          steps: ['Billing'],
          confidence: 'read-from-code',
        },
      ],
    };
    const html = markup(<Board {...base} catalog={rich} />);
    expect(html).toContain('+1 more'); // billing carries 3 - two shown, one counted
    expect(html).toContain('standing-described'); // payments' machine-described flow dot
    expect(html).toContain('Take Payment');
  });

  it('draws one chalk arrow per drawable import edge, reading "depends on"', () => {
    const html = markup(<Board {...base} />);
    expect(count(html, /class="bedge"/g)).toBe(3); // self + unplaced skipped
    expect(html).toContain('src/billing depends on src/payments · 3 imports');
  });

  it('selection makes a module’s edges hot, fades the rest, dims other boxes', () => {
    const html = markup(<Board {...base} selectedModule="src/billing" />);
    expect(count(html, /class="bedge hot"/g)).toBe(2);
    expect(count(html, /class="bedge faded"/g)).toBe(1);
    expect(html).toContain('dimmed');
    // second click opens the module page - same grammar as the terrain's tiles
    expect(html).toContain(`href="${routeHref({ view: 'module', id: 'src/billing' })}"`);
  });

  it('a dragged seat wins over the auto layout', () => {
    const html = markup(<Board {...base} overrides={{ 'src/billing': { x: 1234, y: 567 } }} />);
    expect(html).toContain('1234'); // the hand-placed x lands in the markup
  });
});

describe('flow routes on the board', () => {
  const base = {
    feed,
    refs: refEdges,
    catalog,
    selectedArea: null,
    selectedModule: null,
  };

  const routeDetail: FlowDetail = {
    id: 'flow.refund',
    kind: 'flow',
    name: 'Refund a purchase',
    summary: null,
    status: 'proposed',
    certifiedBy: null,
    certifiedAt: null,
    entry: [],
    steps: [
      {
        on: null,
        do: 'validate the request',
        pin: {
          symbol: 'src/billing/validate.ts#validate',
          symbolId: 'a',
          contentHash: 'h',
          stale: false,
        },
      },
      {
        on: null,
        do: 'reverse the charge',
        pin: {
          symbol: 'src/billing/gateway.ts#reverse',
          symbolId: 'b',
          contentHash: 'h',
          stale: false,
        },
      },
      {
        on: null,
        do: 'notify the customer',
        pin: {
          symbol: 'src/payments/email.ts#send',
          symbolId: 'c',
          contentHash: 'h',
          stale: false,
        },
      },
      { on: 'ledger closed', do: 'reconcile', pin: null },
    ],
    related: [],
    modules: ['src/billing', 'src/payments'],
    notes: null,
  };

  it('collapses consecutive same-module steps into stations; unlinked steps draw nothing', () => {
    const t = flowTrace(
      routeDetail,
      feed.modules.map((m) => m.module),
    );
    expect(t.stations).toEqual([
      { module: 'src/billing', steps: [1, 2] },
      { module: 'src/payments', steps: [3] },
    ]);
    expect(t.linked).toBe(3);
    expect(t.total).toBe(4);
    expect(t.steps[3]).toEqual({ n: 4, text: 'on ledger closed - reconcile', module: null });
  });

  it('draws the route in the flow’s own status colour with numbered station badges', () => {
    const t = flowTrace(
      routeDetail,
      feed.modules.map((m) => m.module),
    );
    const html = markup(<Board {...base} trace={t} />);
    expect(html).toContain('route-proposed'); // never a new hue - the flow's own status
    expect(html).toContain('broute'); // the chalk route line
    expect(count(html, /class="bstation"/g)).toBe(2);
    expect(html).toContain('1·2'); // the collapsed billing station badge
    // the route lights its stations; the rest of the board dims
    expect(html).toContain('dimmed');
  });

  it('the route card answers "what am I looking at" with honest coverage', () => {
    const t = flowTrace(
      routeDetail,
      feed.modules.map((m) => m.module),
    );
    const html = markup(<RouteCard trace={t} clearHref="#/" />);
    expect(html).toContain('Refund a purchase');
    expect(html).toContain('3/4 steps linked');
    expect(html).toContain('not linked'); // the honest dashed gap
    expect(html).toContain(`href="${routeHref({ view: 'flow', id: 'flow.refund' })}"`);
  });

  it('a route with no linked steps says so instead of drawing a guess', () => {
    const bare: FlowDetail = {
      ...routeDetail,
      steps: [{ on: null, do: 'reverse the charge', pin: null }],
    };
    const t = flowTrace(
      bare,
      feed.modules.map((m) => m.module),
    );
    expect(markup(<Board {...base} trace={t} />)).not.toContain('broute');
    expect(markup(<RouteCard trace={t} clearHref="#/" />)).toContain('no route to draw');
  });
});

// ── the inner board (23b - a module's files as its own blackboard) ────────────

const innerBoard: ModuleBoardData = {
  module: 'src/billing',
  files: [
    {
      path: 'src/billing/Subscription.ts',
      name: 'Subscription.ts',
      facts: [{ id: 'concept.sub', kind: 'concept', name: 'Subscription', status: 'certified' }],
    },
    {
      path: 'src/billing/gateway.ts',
      name: 'gateway.ts',
      facts: [
        { id: 'decision.stripe', kind: 'decision', name: 'Use Stripe', status: 'certified' },
        { id: 'flow.refund', kind: 'flow', name: 'Refund a purchase', status: 'proposed' },
        { id: 'concept.checkout', kind: 'concept', name: 'Checkout', status: 'stale' },
      ],
    },
    { path: 'src/billing/refund.ts', name: 'refund.ts', facts: [] },
  ],
  edges: [{ from: 'src/billing/refund.ts', to: 'src/billing/gateway.ts' }],
};

describe('fileBoardLayout', () => {
  it('layers files by their intra-module imports and never overlaps two boxes', () => {
    const layout = fileBoardLayout(
      ['a.ts', 'b.ts', 'c.ts'],
      [
        { from: 'a.ts', to: 'b.ts' },
        { from: 'b.ts', to: 'c.ts' },
      ],
    );
    const byFile = new Map(layout.nodes.map((n) => [n.file, n]));
    expect(byFile.get('a.ts')?.layer).toBe(0);
    expect(byFile.get('b.ts')?.layer).toBe(1);
    expect(byFile.get('c.ts')?.layer).toBe(2);
    for (let i = 0; i < layout.nodes.length; i++)
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i];
        const b = layout.nodes[j];
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
  });

  it('is deterministic under input reordering', () => {
    const edges = [{ from: 'a.ts', to: 'b.ts' }];
    expect(fileBoardLayout(['a.ts', 'b.ts'], edges)).toEqual(
      fileBoardLayout(['b.ts', 'a.ts'], edges),
    );
  });
});

describe('ModuleBoard', () => {
  it('draws a chalk box per file, lit by its strongest pinned fact', () => {
    const html = markup(<ModuleBoard data={innerBoard} />);
    expect(count(html, /class="fnode /g)).toBe(3);
    expect(html).toContain('bnode-frame'); // the chalk frame, same register as the outer board
    expect(html).toContain('fnode-vouched'); // Subscription.ts carries a certified concept
    expect(html).toContain('fnode-plain'); // refund.ts has nothing pinned yet
    expect(html).toContain('Subscription.ts');
    expect(html).toContain('nothing pinned yet'); // the honest empty box label
  });

  it('shows two pinned facts and counts the rest honestly', () => {
    const html = markup(<ModuleBoard data={innerBoard} />);
    // gateway.ts carries three facts - two shown, one counted
    expect(html).toContain('Use Stripe');
    expect(html).toContain('+1');
    expect(html).toContain('standing-certified');
    expect(html).toContain('standing-proposed');
  });

  it('draws one arrow per intra-module import, reading "imports"', () => {
    const html = markup(<ModuleBoard data={innerBoard} />);
    expect(count(html, /class="bedge"/g)).toBe(1);
    expect(html).toContain('refund.ts imports gateway.ts');
  });

  it('a selected file lights its box and its imports, fading + dimming the rest', () => {
    const html = markup(<ModuleBoard data={innerBoard} selectedFile="src/billing/gateway.ts" />);
    expect(html).toContain('class="fnode fnode-vouched selected"');
    expect(html).toContain('class="bedge hot"'); // the edge touching gateway.ts runs hot
    expect(html).toContain('dimmed'); // the unselected boxes recede
    // the box is a plain anchor - selecting is deep-linkable, keyboard-native; a
    // second click on the selected box clears the selection
    expect(html).toContain(`href="${routeHref({ view: 'module', id: 'src/billing' })}"`);
  });

  it('an unselected box deep-links to selecting that file', () => {
    const html = markup(<ModuleBoard data={innerBoard} />);
    expect(html).toContain(
      `href="${routeHref({ view: 'module', id: 'src/billing', file: 'src/billing/refund.ts' })}"`,
    );
  });
});

describe('FileCard', () => {
  it('lists the selected file’s meaning, linking concepts/flows to their pages', () => {
    const file = innerBoard.files[1]; // gateway.ts, three facts
    const html = markup(<FileCard file={file} clearHref="#/module/src%2Fbilling" />);
    expect(html).toContain('gateway.ts');
    expect(html).toContain(`href="${routeHref({ view: 'flow', id: 'flow.refund' })}"`);
    expect(html).toContain('decision'); // a decision has no page - shown as text, not a link
    expect(html).toContain('Use Stripe');
  });

  it('an empty file says so honestly', () => {
    const html = markup(<FileCard file={innerBoard.files[2]} clearHref="#/module/src%2Fbilling" />);
    expect(html).toContain('No meaning is pinned to this file yet.');
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
    expect(html).toContain('71%'); // vouched, the reachable share (24b)
    expect(html).toContain('described'); // the machine layer, on its own light
    expect(html).toContain('dark zones');
    // platform-spelled shortcut: ⌘K on a Mac, Ctrl K everywhere else
    expect(html).toMatch(/⌘K|Ctrl K/);
  });

  it('offers fullscreen focus in any view when the shell provides the toggle', () => {
    const html = markup(
      <TopBar crumbs={[]} kpis={kpis(feed)} onOpenCmdk={noop} focus={false} onToggleFocus={noop} />,
    );
    expect(html).toContain('focus-trigger');
    expect(html).toContain('aria-pressed="false"');
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
        queueCount={1}
      />,
    );
    expect(html).toContain('Board'); // the default canvas since the 23a′ pivot
    expect(html).toContain('Terrain'); // the treemap, one nav item away
    expect(html).toContain('Capabilities');
    expect(html).toContain('Explain next'); // the value queue's action name (24b)
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
    expect(html).toContain('vouched'); // the three-light ladder, not a bucket word (24a)
    expect(html).not.toContain('understood');
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
    // the reachable share, the same rule as the top bar (24b)
    expect(html).toContain('100%');
    expect(html).toContain('vouched');
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

  it('frames the human delta (D6): the module-scope counterpart to the machine lead', () => {
    const html = markup(
      <ModulePage detail={detail} capabilityOf={capabilityOf} curation={noopCuration} />,
    );
    // a module is not an entry, so the band points at the why (1 decision + 1 rule = 2)
    expect(html).toContain('module-delta filled');
    expect(html).toContain('What the code can’t say');
    expect(html).toContain('2 things here the code can’t say');
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
    // a pure cold module skips the delta band - the dark-empty funnel already speaks to it
    expect(html).not.toContain('module-delta');
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

  it('leads with the inner board (23b) when the module has files', () => {
    const html = markup(
      <ModulePage
        detail={detail}
        board={innerBoard}
        capabilityOf={capabilityOf}
        curation={noopCuration}
      />,
    );
    expect(html).toContain('Inside this module'); // the inner-board section head
    expect(html).toContain('class="fboard"'); // the file blackboard is drawn
    expect(html).toContain('Subscription.ts');
    // and it precedes the text sections (the descent, not a wall of text)
    expect(html.indexOf('Inside this module')).toBeLessThan(html.indexOf('Built on this module'));
  });

  it('omits the inner board when the module has no files (no empty panel)', () => {
    const html = markup(
      <ModulePage
        detail={detail}
        board={{ module: 'src/billing', files: [], edges: [] }}
        capabilityOf={capabilityOf}
        curation={noopCuration}
      />,
    );
    expect(html).not.toContain('Inside this module');
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
    // Names resolve server-side (24g); the null name exercises the id fallback.
    related: [
      { id: 'decision.no_float_money', name: 'No floating point for money' },
      { id: 'flow.refund', name: null },
    ],
    modules: ['src/billing'],
    notes:
      'Invoices are immutable once issued - void, never delete.\nAmounts are always in minor units (cents).',
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
    // related reads in product language (24g): the server-resolved heading for
    // the decision, the catalog name for the flow - never a raw id when a name
    // exists anywhere
    expect(html).toContain('Refund a purchase');
    expect(html).toContain('No floating point for money');
    expect(html).not.toContain('decision.no_float_money');
    expect(html).toContain('vouched by brijesh'); // the public word (24a)
  });

  it('links each pin to the module that owns the code (the engineer lens)', () => {
    const html = markup(<ConceptPage detail={detail} names={new Map()} curation={noopCuration} />);
    expect(html).toContain(
      `class="pin-link" href="${routeHref({ view: 'module', id: 'src/billing' })}"`,
    );
  });

  it('carries the delta band as human ink when written (D6), a filled distinct slot', () => {
    const html = markup(<ConceptPage detail={detail} names={new Map()} curation={noopCuration} />);
    expect(html).toContain('What the code can’t say'); // the one distinct slot
    expect(html).toContain('cap-section delta-band filled'); // authored, not the dashed invite
    expect(html).toContain('delta-line human-ink'); // typographically distinct from machine prose
    expect(html).toContain('Invoices are immutable once issued'); // first delta line
    expect(html).toContain('Amounts are always in minor units (cents).'); // second delta line
    expect(html).toContain('recorded by your team'); // provenance attribution
    expect(html).toContain('Edit the note'); // additive editor (has content → "Edit")
  });

  it('marks per-field provenance in the states table: human ink vs "not recorded yet"', () => {
    const html = markup(<ConceptPage detail={detail} names={new Map()} curation={noopCuration} />);
    // a filled effect/invariant is the human's intent - human ink
    expect(html).toContain('class="human-ink">not yet sent');
    expect(html).toContain('class="human-ink">amount is positive');
    // an empty cell on this human-authored table says so honestly (24g) -
    // never a bare dash, and never provenance-speak (draft-inv, open-eff, paid-inv)
    expect(count(html, /class="state-empty">not recorded yet/g)).toBe(3);
    expect(html).not.toContain('not read from code');
    expect(html).not.toContain('<td><span class="dim">-</span></td>');
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
    notes: null,
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
    // the flow can be read as a route: the trace CTA deep-links the board
    expect(html).toContain('Trace on the board');
    expect(html).toContain(`href="${routeHref({ view: 'atlas', flow: 'flow.refund' })}"`);
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

  it('leads with the steps; the linking workbench follows them (24g)', () => {
    const html = markup(<FlowPage detail={detail} names={new Map()} curation={noopCuration} />);
    // the reader's contract: describe the flow from this page alone - the
    // meaning outranks the curation tooling
    expect(html.indexOf('Steps')).toBeGreaterThan(-1);
    expect(html.indexOf('Steps')).toBeLessThan(html.indexOf('Entry points'));
  });

  it('shows the delta band as an invitation when no human ink is recorded (D6)', () => {
    // this flow's notes are null
    const html = markup(<FlowPage detail={detail} names={new Map()} curation={noopCuration} />);
    expect(html).toContain('What the code can’t say'); // the slot is always present
    expect(html).toContain('class="cap-section delta-band"'); // the dashed invite, not filled
    expect(html).not.toContain('delta-band filled');
    expect(html).toContain('The steps above are read from code'); // the flow-specific invitation
    expect(html).toContain('Add a note'); // the additive editor affordance (no content yet)
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
    notes: null,
  });

  it('a proposed capability offers vouch, link, and edit', () => {
    const html = markup(
      <ConceptPage detail={concept('proposed')} names={new Map()} curation={noopCuration} />,
    );
    expect(count(html, /btn-certify/g)).toBeGreaterThanOrEqual(1);
    expect(html).toContain('Vouch'); // the public word (24a); `certified` is storage-only
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
      notes: null,
    };
    const html = markup(<FlowPage detail={emptyFlow} names={new Map()} curation={noopCuration} />);
    expect(html).toContain('Entry points');
    expect(html).toContain('Link code');
    expect(html).toContain('Vouch');
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
    notes: null,
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
      notes: null,
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

describe('QueuePage (value-ranked, D10)', () => {
  // A value-ranked queue: a busy, foundational, unvouched module leads; a
  // partly-vouched-but-drifted one follows.
  const valueZones: ValueRanked[] = [
    {
      module: 'src/checkout',
      score: 0,
      churn: 30,
      coverage: 0,
      freshness: 1,
      certifiedFacts: 0,
      staleFacts: 0,
      reach: 3,
      uncertainty: 1,
      value: (1 + 3) * (1 + 30) * 1,
    },
    {
      module: 'src/billing',
      score: 0.4,
      churn: 8,
      coverage: 0.5,
      freshness: 0.5,
      certifiedFacts: 1,
      staleFacts: 1,
      reach: 1,
      uncertainty: 0.75,
      value: (1 + 1) * (1 + 8) * 0.75,
    },
  ];

  it('ranks by value and states each row’s "why now" in words (D10)', () => {
    const html = markup(<QueuePage queue={valueZones} cold={false} />);
    // value order: checkout (busy, foundational, unvouched) leads billing
    expect(html.indexOf('src/checkout')).toBeLessThan(html.indexOf('src/billing'));
    expect(html).toContain('01');
    // the why-now clauses, worded from the factors (reach · churn · the gap)
    expect(html).toContain('3 modules depend on it'); // reach (agent-consumption)
    expect(html).toContain('30 recent changes'); // churn
    expect(html).toContain('nothing vouched here yet'); // the unvouched gap
    // the second row's gap is drift, not emptiness (it has a certified-but-stale fact)
    expect(html).toContain('1 vouched fact drifted');
    expect(html).toContain(routeHref({ view: 'module', id: 'src/checkout' }));
    // the reframed gloss makes the value ranking explicit, not "darkest first"
    expect(html).toContain('Where explaining pays off next');
  });

  it('empty queue is a statement, not an error', () => {
    const html = markup(<QueuePage queue={[]} cold={false} />);
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
    // (the word itself appears in the always-present Legend ramp, so assert the
    // tile-level class - dark-word - rather than the page text)
    expect(html).toContain('moonlit');
    expect(html).toContain('moon-word');
    expect(html).not.toContain('dark-word');
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

  it('every evidence pin carries a reveal-the-code toggle (D5)', () => {
    const html = markup(<InferredPage detail={inferredConcept} />);
    // the pin now offers to show its backing source, one interaction away
    expect(html).toContain('evidence-toggle');
    expect(html).toContain('Show the code'); // 24a: never the confidence tier's words
    expect(html).toContain('aria-expanded="false"'); // collapsed until asked
    // and the code panel is lazy - nothing is fetched/shown in the collapsed state
    expect(html).not.toContain('evidence-panel');
  });

  it('reading is reviewing (D9): a concept inferred page offers vouch + correct', () => {
    const html = markup(<InferredPage detail={inferredConcept} curation={noopCuration} />);
    expect(html).toContain('Reading is reviewing'); // the vouch bar head
    expect(html).toContain('btn-certify'); // the one-keystroke vouch
    expect(html).toContain('Vouch');
    expect(html).toContain('Edit'); // correct-in-place is the deeper fix
  });

  it('no curation → the inferred page stays read-only (no vouch bar)', () => {
    const html = markup(<InferredPage detail={inferredConcept} />);
    expect(html).not.toContain('Reading is reviewing');
    expect(html).not.toContain('btn-certify');
  });

  it('a module card cannot be vouched - an honest note, never a dead button', () => {
    const card: InferredFactView = {
      id: 'inferred:module:src/orders',
      kind: 'module',
      module: 'src/orders',
      name: 'Orders',
      summary: 'Entry area that draws on Billing.',
      confidence: 'read-from-code',
      states: [],
      steps: [],
      pins: [],
    };
    const html = markup(<InferredPage detail={card} curation={noopCuration} />);
    expect(html).toContain('vouch-note');
    expect(html).toContain('not a claim to vouch'); // honest reason, not a dead button
    expect(html).not.toContain('btn-certify');
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

  // ── flow skeletons + convention candidates (21a slice 2) ───────────────────

  const inferredFlow: InferredFactView = {
    id: 'inferred:flow:src/checkout/checkout.ts#placeOrder',
    kind: 'flow',
    module: 'src/checkout',
    name: 'Place Order',
    summary:
      'An operation in Checkout that reaches Billing and Notifications (read from its imports). What happens at each step, and in what order, is not yet described.',
    confidence: 'read-from-code',
    states: [],
    steps: [
      { label: 'Billing', module: 'src/billing' },
      { label: 'Notifications', module: 'src/notifications' },
    ],
    pins: [
      {
        symbol: 'src/checkout/checkout.ts#placeOrder',
        symbolId: 'src/checkout/checkout.ts#placeOrder',
        contentHash: 'abc123',
        stale: false,
      },
    ],
  };

  const inferredConvention: InferredFactView = {
    id: 'inferred:convention:src/data:suffix:Repo',
    kind: 'convention',
    module: 'src/data',
    name: '*Repo',
    summary:
      '3 exported names here match `*Repo` (InvoiceRepo, OrderRepo, UserRepo). A naming convention read from the code; what it requires of them is not yet described.',
    confidence: 'read-from-code',
    states: [],
    steps: [],
    pins: ['UserRepo', 'OrderRepo', 'InvoiceRepo'].map((n) => ({
      symbol: `src/data/repos.ts#${n}`,
      symbolId: `src/data/repos.ts#${n}`,
      contentHash: 'abc123',
      stale: false,
    })),
  };

  it('the inferred page renders a flow skeleton: the areas it reaches + the flow delta', () => {
    const html = markup(<InferredPage detail={inferredFlow} />);
    expect(html).toContain('Place Order');
    expect(html).toContain('Reaches'); // the fan-out section head
    expect(html).toContain('Billing');
    expect(html).toContain('Notifications');
    // each step links to its module tile
    expect(html).toContain(routeHref({ view: 'module', id: 'src/billing' }));
    // the delta is flow-specific, not the state-machine wording
    expect(html).toContain('The order these steps run');
    expect(html).not.toContain('the meaning of each state');
  });

  it('the inferred page renders a convention: the symbols that match + the convention delta', () => {
    const html = markup(<InferredPage detail={inferredConvention} />);
    expect(html).toContain('*Repo');
    expect(html).toContain('Symbols that match'); // conventions relabel the evidence head
    expect(html).toContain('src/data/repos.ts#UserRepo'); // a member, shown as evidence
    expect(html).toContain('What this convention requires'); // convention-specific delta
  });

  it('the module page lists inferred flows and machine-noticed conventions', () => {
    const detail: ModuleDetail = {
      module: 'src/data',
      areas: ['src/data'],
      dark: true,
      churn: 3,
      score: 0.2,
      certifiedFacts: 0,
      staleFacts: 0,
      queueRank: null,
      concepts: [],
      flows: [],
      rules: [],
      decisions: [],
      dependsOn: [],
      usedBy: [],
      card: null,
      inferredConcepts: [],
      inferredFlows: [inferredFlow],
      inferredConventions: [inferredConvention],
    };
    const html = markup(
      <ModulePage detail={detail} capabilityOf={() => null} curation={noopCuration} />,
    );
    // flows render under the capabilities section, conventions under their own
    expect(html).toContain('Machine-described capabilities');
    expect(html).toContain('Place Order');
    expect(html).toContain('Machine-noticed conventions');
    expect(html).toContain('*Repo');
    expect(html).toContain(routeHref({ view: 'inferred', id: inferredFlow.id }));
    expect(html).toContain(routeHref({ view: 'inferred', id: inferredConvention.id }));
    // a module with only inferred content is not the black dark-empty state
    expect(html).not.toContain('No certified meaning touches this module');
  });

  it('the catalog shows machine-described flows alongside concepts', () => {
    const withFlows: CatalogData = {
      concepts: [],
      flows: [],
      inferredConcepts: [],
      inferredFlows: [
        {
          id: inferredFlow.id,
          name: 'Place Order',
          module: 'src/checkout',
          steps: ['Billing', 'Notifications'],
          confidence: 'read-from-code',
        },
      ],
    };
    const html = markup(<CatalogPage catalog={withFlows} feed={moonFeed} />);
    expect(html).toContain('Machine-described capabilities');
    expect(html).toContain('Place Order');
    expect(html).not.toContain('No capabilities have been described yet');
  });
});

// ── evidence, revealed (23d - D5) ─────────────────────────────────────────────

describe('evidence, revealed (D5)', () => {
  const evidence: EvidenceView = {
    ref: 'src/billing/refund.ts#issueRefund',
    symbol: 'issueRefund',
    path: 'src/billing/refund.ts',
    startLine: 12,
    endLine: 14,
    lines: ['export function issueRefund(cents: number): number {', '  return cents;', '}'],
    truncated: 0,
  };

  it('EvidenceCode shows the file, its real line span, and every source line', () => {
    const html = markup(<EvidenceCode evidence={evidence} />);
    expect(html).toContain('src/billing/refund.ts');
    expect(html).toContain(':12-14'); // the real 1-based span, so a reader can find it
    // a numbered row per source line (12, 13, 14)
    expect(html).toContain('>12<');
    expect(html).toContain('>13<');
    expect(html).toContain('>14<');
    expect(html).toContain('export function issueRefund');
  });

  it('EvidenceCode reports an honest remainder when a long symbol was capped', () => {
    const capped: EvidenceView = { ...evidence, endLine: 80, truncated: 26 };
    const html = markup(<EvidenceCode evidence={capped} />);
    expect(html).toContain('+26 more lines');
  });

  it('EvidenceReveal is a collapsed toggle - lazy, nothing fetched until asked', () => {
    const html = markup(
      <EvidenceReveal refId="src/billing/refund.ts#issueRefund">
        <code>src/billing/refund.ts#issueRefund</code>
      </EvidenceReveal>,
    );
    expect(html).toContain('src/billing/refund.ts#issueRefund'); // the chip face
    expect(html).toContain('Show the code'); // the reveal action (24a wording)
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('evidence-panel'); // the panel is not rendered until open
  });
});

// ── the observatory (23c) ─────────────────────────────────────────────────────

describe('observatory', () => {
  const history: VouchedPoint[] = [
    { at: '2026-06-30', id: 'decision.stripe', kind: 'decision', name: 'Stripe' },
    { at: '2026-06-30', id: 'invariant.money', kind: 'invariant', name: 'Money' },
    { at: '2026-07-04', id: 'concept.checkout', kind: 'concept', name: 'Checkout' },
  ];

  it('flyingBlind maps every module to a dot, busiest first, with its standing', () => {
    const dots = flyingBlind(feed);
    expect(dots.map((d) => d.module)).toEqual(['src/billing', 'src/legacy', 'src/payments']);
    const legacy = dots.find((d) => d.module === 'src/legacy');
    // legacy: no certified facts but machine-described → moonlight, not dark
    expect(legacy).toMatchObject({ churn: 20, vouched: 0, standing: 'described' });
    // billing: 5 certified facts → vouched, coverage the saturating 5/6 depth
    const billing = dots.find((d) => d.module === 'src/billing');
    expect(billing?.standing).toBe('vouched');
    expect(billing?.vouched).toBeCloseTo(5 / 6, 5);
  });

  it('areaShares: three-light churn masses that sum to ~1, real areas only (24b)', () => {
    const shares = areaShares(feed);
    // a solo module named after itself is not a product area - excluded
    expect(shares.find((s) => s.area === 'src/legacy')).toBeUndefined();
    expect(shares).toHaveLength(1);
    // both billing modules hold fresh vouched facts: the phosphor segment IS
    // the area's vouched share, the same number the top bar reports
    expect(shares[0]).toMatchObject({ area: 'Billing & Money', vouched: 1 });
    for (const s of shares) {
      expect(s.vouched + s.described + s.unexplained).toBeCloseTo(1, 5);
    }
    // mixed standings split the churn mass whole-module by standing
    const mixed = areaShares({
      areas: [
        {
          area: 'Shop',
          modules: ['src/a', 'src/b', 'src/c'],
          concepts: [],
          flows: [],
          dark: false,
        },
      ],
      modules: [
        { module: 'src/a', dark: false, churn: 10, certifiedFacts: 2, staleFacts: 0, score: 1 },
        {
          module: 'src/b',
          dark: true,
          churn: 20,
          certifiedFacts: 0,
          staleFacts: 0,
          score: 0,
          described: true,
        },
        { module: 'src/c', dark: true, churn: 10, certifiedFacts: 0, staleFacts: 0, score: 0 },
      ],
      cold: false,
    } as MapFeed);
    expect(mixed[0].vouched).toBeCloseTo(0.25, 5);
    expect(mixed[0].described).toBeCloseTo(0.5, 5);
    expect(mixed[0].unexplained).toBeCloseTo(0.25, 5);
  });

  it('vouchedBurnup accumulates certifications by date, monotonically', () => {
    expect(vouchedBurnup(history)).toEqual([
      { date: '2026-06-30', count: 2 },
      { date: '2026-07-04', count: 3 },
    ]);
    expect(vouchedBurnup([])).toEqual([]);
  });

  it('renders one dot per module, a shared legend, and the two standings', () => {
    const html = markup(<Observatory feed={feed} history={history} />);
    expect(count(html, /obs-dot/g)).toBe(feed.modules.length);
    // the legend keeps colour from being the only encoding
    expect(html).toContain('obs-legend');
    expect(html).toContain('standing-vouched');
    expect(html).toContain('standing-described');
    // one bar row per *real* product area (solo pseudo-areas excluded, 24b),
    // each with a self-labelling vouched readout
    expect(count(html, /obs-row-label/g)).toBe(1);
    expect(html).toContain('% vouched');
    expect(html).toContain('obs-seg');
  });

  it('draws the burn-up line and direct-labels the running total', () => {
    const html = markup(<Observatory feed={feed} history={history} />);
    expect(html).toContain('obs-line');
    // the endpoint is labelled with the cumulative count, not a legend
    expect(html).toContain('3 vouched');
    expect(html).toContain('2026-07-04');
  });

  it('shows an honest empty state when there is no certification history', () => {
    const html = markup(<Observatory feed={feed} history={[]} />);
    expect(html).toContain('No vouching history');
    expect(html).not.toContain('obs-line');
    // the other two charts still draw
    expect(count(html, /obs-dot/g)).toBe(feed.modules.length);
  });
});

// ── the review walk (D9, 23d-3: reading is reviewing) ────────────────────────

describe('review walk (D9, 23d-3)', () => {
  const pin = (symbol: string) => ({ symbol, symbolId: symbol, contentHash: 'h', stale: false });
  const moduleDetail: ModuleDetail = {
    module: 'src/billing',
    areas: ['Billing & Money'],
    dark: false,
    churn: 40,
    score: 0.7,
    certifiedFacts: 5,
    staleFacts: 1,
    queueRank: null,
    concepts: [
      // certified → done, out of the walk
      {
        id: 'concept.invoice',
        kind: 'concept',
        name: 'Invoice',
        status: 'certified',
        body: null,
        symbols: ['src/billing/Invoice.ts#Invoice'],
        stalePins: 0,
        viaScope: false,
      },
      // proposed → a claim to vouch
      {
        id: 'concept.refund',
        kind: 'concept',
        name: 'Refund draft',
        status: 'proposed',
        body: 'A partial refund.',
        symbols: ['src/billing/refund.ts#issueRefund'],
        stalePins: 0,
        viaScope: false,
      },
    ],
    flows: [],
    rules: [
      {
        id: 'invariant.money',
        kind: 'invariant',
        name: 'Money integer',
        status: 'proposed',
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
        status: 'certified',
        body: 'PCI.',
        symbols: [],
        stalePins: 0,
        viaScope: false,
      },
    ],
    dependsOn: [],
    usedBy: [],
    card: {
      id: 'inferred:card:src/billing',
      kind: 'card',
      module: 'src/billing',
      name: 'billing',
      summary: 'Billing module.',
      confidence: 'read-from-code',
      states: [],
      pins: [pin('src/billing/index.ts#x')],
    },
    inferredConcepts: [
      {
        id: 'inferred:concept:src/billing/types.ts#Dunning',
        kind: 'concept',
        module: 'src/billing',
        name: 'Dunning',
        summary: '3 states read from the Dunning type.',
        confidence: 'read-from-code',
        states: ['active', 'retrying', 'failed'],
        pins: [pin('src/billing/types.ts#Dunning')],
      },
    ],
    inferredFlows: [
      {
        id: 'inferred:flow:src/billing/refund.ts#issueRefund',
        kind: 'flow',
        module: 'src/billing',
        name: 'Issue refund',
        summary: 'Reaches notifications.',
        confidence: 'read-from-code',
        states: [],
        steps: [{ label: 'Notifications', module: 'src/notifications' }],
        pins: [pin('src/billing/refund.ts#issueRefund')],
      },
    ],
    inferredConventions: [
      {
        id: 'inferred:convention:src/billing',
        kind: 'convention',
        module: 'src/billing',
        name: '*Repo',
        summary: 'A naming pattern.',
        confidence: 'read-from-code',
        states: [],
        pins: [pin('src/billing/x.ts#UserRepo')],
      },
    ],
  };

  it('sweeps the unvouched only - proposed + machine-described, never certified/card/convention', () => {
    const ids = moduleReviewClaims(moduleDetail).map((c) => c.id);
    // proposed work is in; certified work is done and left out
    expect(ids).toContain('concept.refund');
    expect(ids).toContain('invariant.money');
    expect(ids).not.toContain('concept.invoice'); // certified
    expect(ids).not.toContain('decision.stripe'); // certified
    // both machine-described capabilities are in (vouching materializes them)
    expect(ids).toContain('inferred:concept:src/billing/types.ts#Dunning');
    expect(ids).toContain('inferred:flow:src/billing/refund.ts#issueRefund');
    // a module card + a naming convention can't be vouched yet → never a station
    expect(ids).not.toContain('inferred:card:src/billing');
    expect(ids).not.toContain('inferred:convention:src/billing');
  });

  it('normalizes each tier: inferred is editable moonlight with states, a rule is not', () => {
    const claims = moduleReviewClaims(moduleDetail);
    const dunning = claims.find((c) => c.id.includes('Dunning'));
    expect(dunning).toMatchObject({
      origin: 'inferred',
      canEdit: true,
      confidence: 'read-from-code',
      states: ['active', 'retrying', 'failed'],
      pins: ['src/billing/types.ts#Dunning'],
    });
    const rule = claims.find((c) => c.id === 'invariant.money');
    expect(rule).toMatchObject({ origin: 'human', status: 'proposed', canEdit: false });
  });

  it('walks in reading order: proposed caps, then machine-described, then rules', () => {
    const ids = moduleReviewClaims(moduleDetail).map((c) => c.id);
    expect(ids.indexOf('concept.refund')).toBeLessThan(
      ids.indexOf('inferred:concept:src/billing/types.ts#Dunning'),
    );
    expect(ids.indexOf('inferred:flow:src/billing/refund.ts#issueRefund')).toBeLessThan(
      ids.indexOf('invariant.money'),
    );
  });

  it('capabilityReviewClaims is a one-station walk for a proposed capability, empty when certified', () => {
    const proposed: ConceptDetail = {
      id: 'concept.refund',
      kind: 'concept',
      name: 'Refund',
      summary: 'A refund.',
      status: 'proposed',
      certifiedBy: null,
      certifiedAt: null,
      states: [{ name: 'requested', effect: null, invariant: null }],
      transitions: [],
      pins: [pin('src/billing/refund.ts#issueRefund')],
      related: [],
      modules: ['src/billing'],
      notes: null,
    };
    const claims = capabilityReviewClaims(proposed);
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      id: 'concept.refund',
      origin: 'human',
      canEdit: true,
      states: ['requested'],
      pins: ['src/billing/refund.ts#issueRefund'],
    });
    // a certified capability has nothing left to review
    expect(capabilityReviewClaims({ ...proposed, status: 'certified' })).toEqual([]);
  });

  it('renders the current claim, the code panel head, the vouch action, and the key legend', () => {
    const claims = moduleReviewClaims(moduleDetail);
    const html = markup(
      <ReviewWalk claims={claims} subject="src/billing" onClose={noop} onChanged={noop} />,
    );
    expect(html).toContain('Reading is reviewing'); // the kicker
    expect(html).toContain('src/billing'); // the subject
    expect(html).toContain(`1 / ${claims.length}`); // progress
    expect(html).toContain('Refund draft'); // the first claim (proposed) leads
    expect(html).toContain('The code behind this claim'); // the evidence panel head (D5)
    expect(html).toContain('Vouch'); // the one-keystroke decision
    expect(html).toContain('esc'); // the key legend
    expect(html).toContain('flag (soon)'); // x-flag is honestly deferred, not a dead button
  });

  it('lights a machine-described claim in moonlight with worded confidence and its states', () => {
    const claims = moduleReviewClaims(moduleDetail).filter((c) => c.origin === 'inferred');
    const html = markup(
      <ReviewWalk claims={claims} subject="src/billing" onClose={noop} onChanged={noop} />,
    );
    expect(html).toContain('claim-name moon'); // moonlight, never the phosphor of trust
    expect(html).toContain('read from code'); // worded confidence (D7), never a number
    expect(html).toContain('active'); // a state read from code, laid out on the left
  });

  it('shows a done panel when there is nothing to walk', () => {
    const html = markup(
      <ReviewWalk claims={[]} subject="src/billing" onClose={noop} onChanged={noop} />,
    );
    expect(html).toContain('Sweep complete');
  });

  it('the top bar surfaces a review pill with the unvouched count, and hides it at zero', () => {
    const withWork = markup(
      <TopBar
        crumbs={[{ label: 'x' }]}
        kpis={kpis(feed)}
        onOpenCmdk={noop}
        onReview={noop}
        reviewCount={3}
      />,
    );
    expect(withWork).toContain('review-trigger');
    expect(withWork).toContain('Review');
    expect(withWork).toContain('>3<'); // the count badge

    const none = markup(
      <TopBar crumbs={[{ label: 'x' }]} kpis={kpis(feed)} onOpenCmdk={noop} reviewCount={0} />,
    );
    expect(none).not.toContain('review-trigger');
  });
});
