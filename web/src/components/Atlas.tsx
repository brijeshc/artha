import { useLayoutEffect, useRef, useState } from 'react';
import type { MapFeed, RankedModule } from '../api';
import { COLD, LEGEND } from '../copy';
import { type CoverageBucket, atlasLayout, coverageBucket, isMoonlit, shortName } from '../derive';
import { type Route, routeHref } from '../router';

/**
 * The Terrain - the treemap reading of the codebase (the analytics view since
 * the 23a′ board pivot; the Board is the default canvas). A squarified treemap
 * where every code module is terrain: **area = how much it changes** (churn
 * earns space), **brightness = how well it is understood** (certified
 * coverage), so the eye reads "big and dark = flying blind" with no legend
 * required. Product areas are provinces - named borders over their modules.
 *
 * Pure given width/height (SSR-testable); `AtlasViewport` below measures.
 */

export interface AtlasProps {
  feed: MapFeed;
  width: number;
  height: number;
  selectedArea: string | null;
  selectedModule: string | null;
  /** Ranked dark zones - the cold-start funnel's "start here" list. */
  zones: RankedModule[];
  /** First-hop structural neighbours of the selected module (T17b): outlined,
   * not glowing - glow stays reserved for certified coverage. */
  neighbors?: Set<string>;
}

export function Atlas(props: AtlasProps): JSX.Element {
  const { feed, width, height, selectedArea, selectedModule, zones } = props;
  const neighbors = props.neighbors ?? new Set<string>();
  const provinces = atlasLayout(feed, width, height);

  const lit = new Set<string>();
  if (selectedModule) lit.add(selectedModule);
  if (selectedArea) {
    const area = feed.areas.find((a) => a.area === selectedArea);
    for (const m of area?.modules ?? []) lit.add(m);
  }
  const hasSelection = lit.size > 0;

  return (
    <div className="atlas" style={{ width, height }} aria-label="Understanding terrain">
      {provinces.map((p) => (
        <section
          key={p.area.area}
          className={provinceClass(
            p.grouped,
            selectedArea === p.area.area,
            hasSelection,
            p.area.modules,
            lit,
          )}
          style={place(p.rect)}
          aria-label={p.area.area}
        >
          {p.grouped && (
            <a
              className="province-name"
              href={
                selectedArea === p.area.area
                  ? '#/?lens=terrain'
                  : routeHref({ view: 'atlas', area: p.area.area, lens: 'terrain' })
              }
              title={
                selectedArea === p.area.area ? 'Clear selection' : `Select the ${p.area.area} area`
              }
            >
              {p.area.area}
            </a>
          )}
        </section>
      ))}

      {provinces.flatMap((p) =>
        p.tiles.map((t) => {
          const bucket = coverageBucket(t.module);
          const isSelected = selectedModule === t.module.module;
          const isLit = lit.has(t.module.module);
          const isNeighbor = neighbors.has(t.module.module);
          return (
            <ModuleTile
              key={t.module.module}
              module={t.module.module}
              bucket={bucket}
              moonlit={isMoonlit(t.module)}
              inferredConcepts={t.module.inferredConcepts ?? 0}
              stale={t.module.staleFacts > 0}
              churn={t.module.churn}
              certified={t.module.certifiedFacts}
              rect={t.rect}
              selected={isSelected}
              dimmed={hasSelection && !isLit && !isNeighbor}
              lit={isLit && !isSelected}
              neighbor={isNeighbor && !isSelected}
            />
          );
        }),
      )}

      <Legend />
      {feed.cold && <ColdFunnel zones={zones} />}
    </div>
  );
}

function ModuleTile(props: {
  module: string;
  bucket: CoverageBucket;
  /** No certified meaning, but a machine-described layer exists → moonlight (D2). */
  moonlit: boolean;
  inferredConcepts: number;
  stale: boolean;
  churn: number;
  certified: number;
  rect: { x: number; y: number; w: number; h: number };
  selected: boolean;
  dimmed: boolean;
  lit: boolean;
  neighbor: boolean;
}): JSX.Element {
  const { module, bucket, moonlit, inferredConcepts, stale, churn, certified } = props;
  const { rect, selected, dimmed, lit, neighbor } = props;
  const showName = rect.w >= 64 && rect.h >= 26;
  const showMeta = rect.w >= 116 && rect.h >= 54;
  const cls = [
    'tile',
    `cov-${bucket}`,
    moonlit ? 'moonlit' : '',
    stale ? 'has-stale' : '',
    selected ? 'selected' : '',
    dimmed ? 'dimmed' : '',
    lit ? 'lit' : '',
    neighbor ? 'neighbor' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Standing word: vouched (phosphor) > described (moonlight) > unexplained (dark).
  const standing =
    bucket !== 'dark' ? `${certified} certified` : moonlit ? 'described' : 'unexplained';
  const wired = neighbor ? ' · wired to selection' : '';
  return (
    <a
      className={cls}
      style={place(rect)}
      href={
        selected
          ? routeHref({ view: 'module', id: module })
          : routeHref({ view: 'atlas', module, lens: 'terrain' })
      }
      title={`${module} - ${standing} · ${churn} commits in 90 days${wired}${selected ? ' · open module' : ''}`}
      aria-current={selected ? 'true' : undefined}
    >
      {showName && <span className="tile-name">{shortName(module)}</span>}
      {showMeta && (
        <span className="tile-meta">
          {bucket !== 'dark' ? (
            <span className="tile-standing">{certified} certified</span>
          ) : moonlit ? (
            <span className="tile-standing moon-word">
              described{inferredConcepts > 0 ? ` · ${inferredConcepts}` : ''}
            </span>
          ) : (
            <span className="tile-standing dark-word">unexplained</span>
          )}
          <span className="tile-churn">{churn}Δ</span>
        </span>
      )}
    </a>
  );
}

/** The one place map language is defined - a quiet corner popover. */
function Legend(): JSX.Element {
  return (
    <details className="legend">
      <summary>Legend</summary>
      <div className="legend-body">
        <p>{LEGEND.size}</p>
        <p>{LEGEND.brightness}</p>
        <div className="legend-ramp" aria-label="Coverage ramp">
          {(['dark', 'thin', 'partial', 'understood'] as const).map((b, i) => (
            <span className="legend-step" key={b}>
              <span className={`legend-swatch cov-${b}`} aria-hidden="true" />
              {LEGEND.ramp[i]}
            </span>
          ))}
        </div>
        <p className="legend-two-light">
          <span className="legend-swatch moonlit" aria-hidden="true" />
          {LEGEND.moon}
        </p>
        <p>{LEGEND.dark}</p>
        <p>{LEGEND.stale}</p>
        <p>{LEGEND.select}</p>
      </div>
    </details>
  );
}

/** Cold start: the dark terrain is the true signal; this funnels into action. */
function ColdFunnel({ zones }: { zones: RankedModule[] }): JSX.Element {
  const top = zones.slice(0, 3);
  return (
    <div className="cold-funnel">
      <p className="cold-headline">{COLD.headline}</p>
      <p className="cold-body">{COLD.body}</p>
      {top.length > 0 && (
        <ul className="cold-list">
          {top.map((z, i) => (
            <li key={z.module}>
              <a className="cold-module" href={routeHref({ view: 'module', id: z.module })}>
                <span className="cold-rank mono">{i + 1}</span>
                <span className="mono">{z.module}</span>
                <span className="cold-churn">{z.churn}Δ / 90d</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <a className="cold-cta" href="#/queue">
        {COLD.cta} →
      </a>
    </div>
  );
}

function provinceClass(
  grouped: boolean,
  selected: boolean,
  hasSelection: boolean,
  modules: string[],
  lit: Set<string>,
): string {
  const anyLit = modules.some((m) => lit.has(m));
  return [
    'province',
    grouped ? 'grouped' : 'solo',
    selected ? 'selected' : '',
    hasSelection && !anyLit ? 'dimmed' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function place(r: { x: number; y: number; w: number; h: number }): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  return {
    left: Math.round(r.x),
    top: Math.round(r.y),
    width: Math.round(r.w),
    height: Math.round(r.h),
  };
}

/** Measures the canvas pane and renders the pure Atlas at that exact size. */
export function AtlasViewport(props: Omit<AtlasProps, 'width' | 'height'>): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setSize({ w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="atlas-viewport" ref={ref}>
      {size && size.w > 40 && size.h > 40 && <Atlas {...props} width={size.w} height={size.h} />}
    </div>
  );
}
