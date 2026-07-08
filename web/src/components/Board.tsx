import { useCallback, useEffect, useRef, useState } from 'react';
import type { Catalog, MapFeed, RefEdge } from '../api';
import { type BoardNode, boardLayout, borderPoint } from '../board';
import { BOARD, ROUTE } from '../copy';
import { type FlowTrace, capabilitiesByModule, isMoonlit, shortName } from '../derive';
import { roughArrowhead, roughCircle, roughLine, roughRect, seedFrom } from '../rough';
import { routeHref } from '../router';

/**
 * The Board - the hero canvas after the 23a′ pivot: a handmade flowchart on a
 * blackboard, not a space-filling map. Modules are chalk boxes with generous
 * air between them, imports are chalk arrows reading "depends on", a traced
 * flow is a numbered route in the flow's own status colour. Auto-layout gives
 * everyone a seat; dragging a box makes the layout yours (the viewport
 * persists positions). Meaning still lights the chalk: phosphor = vouched,
 * moonlight = described, dim = unexplained - the two-light grammar survives
 * the genre change untouched.
 *
 * Pure given positions (SSR-testable); `BoardViewport` below owns drag state.
 */

export type BoardOverrides = Record<string, { x: number; y: number }>;

export interface BoardProps {
  feed: MapFeed;
  refs: RefEdge[];
  /** Names the capabilities each box carries, in product language. */
  catalog: Catalog;
  selectedArea: string | null;
  selectedModule: string | null;
  trace?: FlowTrace | null;
  /** Hand-dragged seats, module → position; wins over the auto layout. */
  overrides?: BoardOverrides;
  /** Present only in the interactive viewport - absent in SSR renders. */
  onNodePointerDown?: (e: React.PointerEvent, node: BoardNode) => void;
  /** True while (or just after) a drag, so the click doesn't navigate. */
  suppressNav?: () => boolean;
}

export function Board(props: BoardProps): JSX.Element {
  const { feed, refs, catalog, selectedArea, selectedModule, overrides = {} } = props;
  const trace = props.trace ?? null;

  const areaOf = new Map<string, string>();
  for (const a of feed.areas) for (const m of a.modules) areaOf.set(m, a.area);
  const capsOf = capabilitiesByModule(catalog);
  const base = boardLayout(feed.modules, refs, areaOf);
  const nodes = base.nodes.map((n) => {
    const o = overrides[n.module];
    return o ? { ...n, x: o.x, y: o.y } : n;
  });
  const byName = new Map(nodes.map((n) => [n.module, n]));
  const moduleOf = new Map(feed.modules.map((m) => [m.module, m]));

  // Extent grows with dragged nodes so nothing ever leaves the paper.
  const width = Math.max(base.width, ...nodes.map((n) => n.x + n.w + 40));
  const height = Math.max(base.height, ...nodes.map((n) => n.y + n.h + 40));

  const lit = new Set<string>();
  if (selectedModule) lit.add(selectedModule);
  if (selectedArea) {
    const area = feed.areas.find((a) => a.area === selectedArea);
    for (const m of area?.modules ?? []) lit.add(m);
  }
  const stationsOf = new Map<string, number[]>();
  if (trace) for (const s of trace.stations) stationsOf.set(s.module, s.steps);
  if (trace) for (const m of stationsOf.keys()) lit.add(m);
  const hasFocus = lit.size > 0;

  const edges = refs.filter(
    (r) => r.from_module !== r.to_module && byName.has(r.from_module) && byName.has(r.to_module),
  );

  const traceStatus = trace
    ? trace.status === 'certified' || trace.status === 'proposed' || trace.status === 'stale'
      ? trace.status
      : 'unknown'
    : null;

  return (
    <svg
      className={traceStatus ? `board route-${traceStatus}` : 'board'}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label="The board - modules and their imports as a flowchart"
    >
      <title>The board - modules and their imports as a flowchart</title>

      {edges.map((e) => {
        const a = byName.get(e.from_module);
        const b = byName.get(e.to_module);
        if (!a || !b) return null;
        const seed = seedFrom(`${e.from_module}→${e.to_module}`);
        // Bow right of travel so a pair of opposite edges splits apart.
        const bow = 10;
        const p1 = borderPoint(a, b.x + b.w / 2, b.y + b.h / 2);
        const p2 = borderPoint(b, a.x + a.w / 2, a.y + a.h / 2);
        const hot =
          selectedModule !== null &&
          (e.from_module === selectedModule || e.to_module === selectedModule);
        const cls = [
          'bedge',
          hot ? 'hot' : '',
          hasFocus && !hot && !(lit.has(e.from_module) && lit.has(e.to_module)) ? 'faded' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <g key={`${e.from_module}→${e.to_module}`} className={cls}>
            <path
              d={`${roughLine(p1.x, p1.y, p2.x, p2.y, seed, { bow })} ${roughArrowhead(p2.x, p2.y, p1.x, p1.y, seed)}`}
              strokeWidth={e.count >= 3 ? 2.3 : 1.5}
            />
            <title>{`${e.from_module} depends on ${e.to_module} · ${e.count} import${e.count === 1 ? '' : 's'}`}</title>
          </g>
        );
      })}

      {trace && <BoardRoute trace={trace} byName={byName} />}

      {nodes.map((n) => {
        const m = moduleOf.get(n.module);
        if (!m) return null;
        const standing =
          m.certifiedFacts > 0 ? 'vouched' : isMoonlit(m) ? 'described' : 'unexplained';
        const selected = selectedModule === n.module;
        const dimmed = hasFocus && !lit.has(n.module) && !selected;
        const seed = seedFrom(n.module);
        const steps = stationsOf.get(n.module);
        const word = standing === 'vouched' ? `${m.certifiedFacts} certified` : standing;
        // The chalk annotations: the machine's one-liner (the 21b slot) and the
        // capabilities this code carries, in product language (D4).
        const desc = m.describedAs ? clamp(m.describedAs, 36) : null;
        const caps = capsOf.get(n.module) ?? [];
        const shown = caps.slice(0, 2);
        const extra = caps.length - shown.length;
        const cls = [
          'bnode',
          `bnode-${standing}`,
          selected ? 'selected' : '',
          dimmed ? 'dimmed' : '',
          m.staleFacts > 0 ? 'has-stale' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <a
            key={n.module}
            className={cls}
            href={
              selected
                ? routeHref({ view: 'module', id: n.module })
                : routeHref({
                    view: 'atlas',
                    module: n.module,
                    ...(trace ? { flow: trace.id } : {}),
                  })
            }
            onPointerDown={
              props.onNodePointerDown ? (e) => props.onNodePointerDown?.(e, n) : undefined
            }
            onClick={
              props.suppressNav ? (e) => props.suppressNav?.() && e.preventDefault() : undefined
            }
            aria-current={selected ? 'true' : undefined}
          >
            <title>{`${n.module} - ${word} · ${m.churn} commits in 90 days${m.staleFacts > 0 ? ` · ${m.staleFacts} stale` : ''}${m.describedAs ? `\n${m.describedAs}` : ''}${selected ? ' · open module' : ''}`}</title>
            {/* the chalk frame, drawn twice - a hand goes over its line */}
            <path className="bnode-frame" d={roughRect(n.x, n.y, n.w, n.h, seed)} />
            <path className="bnode-frame echo" d={roughRect(n.x, n.y, n.w, n.h, seed + 97)} />
            {m.staleFacts > 0 && (
              // an ember chalk tick under the standing word: certified, with a caveat
              <path
                className="bnode-stale"
                d={roughLine(n.x + 16, n.y + n.h - 5, n.x + 60, n.y + n.h - 5, seed + 7, {
                  jitter: 1.1,
                })}
              />
            )}
            <text className="bnode-name" x={n.x + 16} y={n.y + 28}>
              {shortName(n.module)}
            </text>
            {desc && (
              <text className="bnode-desc" x={n.x + 16} y={n.y + 47}>
                {desc}
              </text>
            )}
            {shown.map((c, i) => (
              <g key={c.id} className="bcap">
                <circle
                  className={`bcap-dot standing-${c.standing}`}
                  cx={n.x + 20}
                  cy={n.y + 63 + i * 17}
                  r={3}
                />
                <text x={n.x + 29} y={n.y + 67 + i * 17}>
                  {clamp(c.name, 25)}
                </text>
              </g>
            ))}
            <text className="bnode-meta" x={n.x + 16} y={n.y + n.h - 10}>
              {word} · {m.churn}Δ
            </text>
            {extra > 0 && (
              <text className="bnode-more" x={n.x + n.w - 14} y={n.y + n.h - 10}>
                +{extra} {BOARD.more}
              </text>
            )}
            {steps && (
              <g className="bstation">
                <path d={roughCircle(n.x + 4, n.y + 4, 13, seed + 11)} />
                <text x={n.x + 4} y={n.y + 5}>
                  {steps.join('·')}
                </text>
              </g>
            )}
          </a>
        );
      })}
    </svg>
  );
}

/** Chalk fits so many letters; past that the ellipsis is honest. */
function clamp(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** The traced flow as a chalk route: station to station in the flow's own
 * status colour, each leg stopping at the boxes' borders (like the edges do)
 * so the chalk never runs under a module's name. */
function BoardRoute({
  trace,
  byName,
}: {
  trace: FlowTrace;
  byName: Map<string, BoardNode>;
}): JSX.Element | null {
  const stations = trace.stations.flatMap((s) => byName.get(s.module) ?? []);
  if (stations.length < 2) return null;
  const seed = seedFrom(trace.id);
  const d = stations
    .slice(1)
    .map((to, i) => {
      const from = stations[i];
      const p1 = borderPoint(from, to.x + to.w / 2, to.y + to.h / 2);
      const p2 = borderPoint(to, from.x + from.w / 2, from.y + from.h / 2);
      return roughLine(p1.x, p1.y, p2.x, p2.y, seed + i, { bow: 14, jitter: 1.2 });
    })
    .join(' ');
  return (
    <g className="broute">
      <path d={d} />
    </g>
  );
}

// ── the interactive viewport ──────────────────────────────────────────────────

const STORE_KEY = 'artha.board.layout.v1';

function loadOverrides(): BoardOverrides {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as BoardOverrides) : {};
  } catch {
    return {};
  }
}

/**
 * Owns what SSR cannot: dragging boxes (positions persist per browser), the
 * scroll-panned paper, the tidy control, and the route card. Click grammar
 * matches the terrain's tiles: click selects (inspector), click again opens
 * the module page; a drag never navigates.
 */
export function BoardViewport(props: {
  feed: MapFeed;
  refs: RefEdge[];
  catalog: Catalog;
  selectedArea: string | null;
  selectedModule: string | null;
  trace?: FlowTrace | null;
}): JSX.Element {
  const [overrides, setOverrides] = useState<BoardOverrides>(() =>
    typeof window === 'undefined' ? {} : loadOverrides(),
  );
  const drag = useRef<{
    module: string;
    pointerX: number;
    pointerY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const justDragged = useRef(false);

  const onNodePointerDown = useCallback((e: React.PointerEvent, node: BoardNode) => {
    if (e.button !== 0) return;
    drag.current = {
      module: node.module,
      pointerX: e.clientX,
      pointerY: e.clientY,
      originX: node.x,
      originY: node.y,
      moved: false,
    };
    justDragged.current = false;
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.pointerX;
      const dy = e.clientY - d.pointerY;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      justDragged.current = true;
      setOverrides((prev) => ({
        ...prev,
        [d.module]: { x: Math.max(8, d.originX + dx), y: Math.max(8, d.originY + dy) },
      }));
    };
    const onUp = () => {
      const d = drag.current;
      drag.current = null;
      if (!d?.moved) return;
      setOverrides((prev) => {
        try {
          window.localStorage.setItem(STORE_KEY, JSON.stringify(prev));
        } catch {
          /* private mode - the session still works, the layout just won't stick */
        }
        return prev;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const suppressNav = useCallback(() => {
    const s = justDragged.current;
    justDragged.current = false;
    return s;
  }, []);

  const tidy = () => {
    setOverrides({});
    try {
      window.localStorage.removeItem(STORE_KEY);
    } catch {
      /* nothing to forget */
    }
  };

  const hasHandLayout = Object.keys(overrides).length > 0;
  const trace = props.trace ?? null;

  return (
    <div className="board-wrap">
      <div className="board-viewport">
        <Board
          {...props}
          overrides={overrides}
          onNodePointerDown={onNodePointerDown}
          suppressNav={suppressNav}
        />
      </div>
      <p className="board-hint">{BOARD.hint}</p>
      {hasHandLayout && (
        <button type="button" className="board-tidy" onClick={tidy} title={BOARD.tidyHint}>
          {BOARD.tidy}
        </button>
      )}
      {trace && <RouteCard trace={trace} clearHref="#/" />}
    </div>
  );
}

/** The traced flow's identity card - answers "what am I looking at" without
 * leaving the board: name, standing, coverage, every step with its station. */
export function RouteCard({
  trace,
  clearHref,
}: {
  trace: FlowTrace;
  clearHref: string;
}): JSX.Element {
  const known =
    trace.status === 'certified' || trace.status === 'proposed' || trace.status === 'stale';
  return (
    <aside className="route-card" aria-label={`Flow route: ${trace.name}`}>
      <p className="route-kind">{ROUTE.kind}</p>
      <p className="route-name">
        <a href={routeHref({ view: 'flow', id: trace.id })} title={ROUTE.open}>
          {trace.name}
        </a>
        <span className={`status status-${known ? trace.status : 'unknown'}`}>
          <span className="status-dot" aria-hidden="true" />
          {trace.status}
        </span>
      </p>
      <p className="route-coverage mono">
        {trace.linked}/{trace.total} steps linked
      </p>
      {trace.stations.length === 0 ? (
        <p className="route-empty">{ROUTE.noStations}</p>
      ) : (
        <ol className="route-steps">
          {trace.steps.map((s) => (
            <li key={s.n} className={s.module ? 'route-step' : 'route-step unlinked'}>
              <span className="route-step-n mono">{s.n}</span>
              <span className="route-step-text">{s.text}</span>
              <span className="route-step-module mono">
                {s.module ? shortName(s.module) : ROUTE.notLinked}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="route-actions">
        <a className="route-open" href={routeHref({ view: 'flow', id: trace.id })}>
          {ROUTE.open} →
        </a>
        <a className="route-clear" href={clearHref}>
          {ROUTE.clear}
        </a>
      </p>
    </aside>
  );
}
