import { useCallback, useEffect, useRef, useState } from 'react';
import { type Catalog, type MapFeed, type RefEdge, getBoardLayout, saveBoardLayout } from '../api';
import { type BoardNode, areaProvinces, boardLayout, borderPoint } from '../board';
import { BOARD, BOARD_LEGEND, ROUTE } from '../copy';
import { type FlowTrace, capabilitiesByModule, isMoonlit, shortName } from '../derive';
import { roughArrowhead, roughCircle, roughLine, roughRect, seedFrom } from '../rough';
import { routeHref } from '../router';
import { statusWord } from './Status';
import { type BoardOverrides, useBoardDrag } from './useBoardDrag';

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
  /** Rendered size = board units × scale (24c fit/zoom); positions stay in
   * board units, so drags and hrefs are scale-free. */
  scale?: number;
  /** Present only in the interactive viewport - absent in SSR renders. */
  onNodePointerDown?: (e: React.PointerEvent, node: BoardNode) => void;
  /** True while (or just after) a drag, so the click doesn't navigate. */
  suppressNav?: () => boolean;
}

/** The auto layout with hand overrides applied, plus the paper extent - shared
 * by the Board itself and the viewport's fit/scroll math (24c). */
export function placedLayout(
  feed: MapFeed,
  refs: RefEdge[],
  overrides: BoardOverrides,
): { nodes: BoardNode[]; width: number; height: number } {
  const areaOf = new Map<string, string>();
  for (const a of feed.areas) for (const m of a.modules) areaOf.set(m, a.area);
  const base = boardLayout(feed.modules, refs, areaOf);
  const nodes = base.nodes.map((n) => {
    const o = overrides[n.module];
    return o ? { ...n, x: o.x, y: o.y } : n;
  });
  // Extent grows with dragged nodes so nothing ever leaves the paper.
  const width = Math.max(base.width, ...nodes.map((n) => n.x + n.w + 40));
  const height = Math.max(base.height, ...nodes.map((n) => n.y + n.h + 40));
  return { nodes, width, height };
}

export function Board(props: BoardProps): JSX.Element {
  const { feed, refs, catalog, selectedArea, selectedModule, overrides = {} } = props;
  const trace = props.trace ?? null;
  const scale = props.scale ?? 1;

  const capsOf = capabilitiesByModule(catalog);
  const { nodes, width, height } = placedLayout(feed, refs, overrides);
  const byName = new Map(nodes.map((n) => [n.module, n]));
  const moduleOf = new Map(feed.modules.map((m) => [m.module, m]));
  const areaOf = new Map<string, string>();
  for (const a of feed.areas) for (const m of a.modules) areaOf.set(m, a.area);
  const provinces = areaProvinces(nodes, areaOf);

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
  // The entry is the only station a machine-read flow can name (23e-4).
  const entryModule = trace?.kind === 'reaches' ? (trace.stations[0]?.module ?? null) : null;

  const edges = refs.filter(
    (r) => r.from_module !== r.to_module && byName.has(r.from_module) && byName.has(r.to_module),
  );

  const traceStatus = trace
    ? trace.status === 'certified' ||
      trace.status === 'proposed' ||
      trace.status === 'stale' ||
      trace.status === 'described'
      ? trace.status
      : 'unknown'
    : null;

  return (
    <svg
      className={traceStatus ? `board route-${traceStatus}` : 'board'}
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      aria-label="The board - modules and their imports as a flowchart"
    >
      <title>The board - modules and their imports as a flowchart</title>

      {/* the provinces first: a chalk boundary is drawn around, never over */}
      {provinces.map((p) => {
        const seed = seedFrom(`province:${p.area}`);
        return (
          <g
            key={p.area}
            className={`bprovince${selectedArea === p.area ? ' hot' : ''}${
              hasFocus && selectedArea !== p.area ? ' faded' : ''
            }`}
          >
            <path d={roughRect(p.x, p.y, p.w, p.h, seed)} />
            <text x={p.x + 10} y={p.y + 16}>
              {p.area}
            </text>
          </g>
        );
      })}

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
        // One footer grammar for every standing (24a): the word, then counts.
        const word = standing === 'vouched' ? `vouched ×${m.certifiedFacts}` : standing;
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
              // A machine-read flow's stations carry no number (23e-4): the
              // code says this module is touched, never that it is touched
              // third. The badge marks the entry - the one thing it does say.
              <g className={trace?.kind === 'reaches' ? 'bstation bstation-reaches' : 'bstation'}>
                <path d={roughCircle(n.x + 4, n.y + 4, 13, seed + 11)} />
                <text x={n.x + 4} y={n.y + 5}>
                  {steps.length > 0 ? steps.join('·') : n.module === entryModule ? '⌂' : '·'}
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
 * so the chalk never runs under a module's name.
 *
 * A machine-read flow draws differently (23e-4): its legs all fan out *from
 * the entry*, dashed, because the code states what the flow touches but not
 * the order it touches them in. A chain here would invent that order. */
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
  const leg = (from: BoardNode, to: BoardNode, i: number) => {
    const p1 = borderPoint(from, to.x + to.w / 2, to.y + to.h / 2);
    const p2 = borderPoint(to, from.x + from.w / 2, from.y + from.h / 2);
    return roughLine(p1.x, p1.y, p2.x, p2.y, seed + i, { bow: 14, jitter: 1.2 });
  };
  const reaches = trace.kind === 'reaches';
  const entry = stations[0];
  const d = stations
    .slice(1)
    // reaches: every leg leaves the entry. route: each leg leaves the one before.
    .map((to, i) => leg(reaches ? entry : stations[i], to, i))
    .join(' ');
  return (
    <g className={reaches ? 'broute broute-reaches' : 'broute'}>
      <path d={d} />
    </g>
  );
}

// ── the interactive viewport ──────────────────────────────────────────────────

/** Zoom bounds (24c): far enough out to fit a big repo, in enough to read. */
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2;

/**
 * Owns what SSR cannot: dragging boxes (positions persist per browser via the
 * shared {@link useBoardDrag} hook), the scroll-panned paper, fit-to-view and
 * zoom (24c), the tidy control, the legend, and the route card. Click grammar
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
  const trace = props.trace ?? null;
  const viewportRef = useRef<HTMLDivElement>(null);

  // Fit-to-view (24c): the whole graph is visible on first paint - never a
  // half-cut box with no cue that more exists. `zoom` is the hand override;
  // null means "keep fitting", also what the Fit button restores.
  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null);
  const scale = zoom ?? fitScale;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const getScale = useCallback(() => scaleRef.current, []);

  // The team's committed board (23e), if there is one - your drags sit on top.
  const [team, setTeam] = useState<BoardOverrides>({});
  const [shareState, setShareState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  useEffect(() => {
    let live = true;
    getBoardLayout()
      .then((r) => live && setTeam(r.modules))
      // No committed layout is the normal case, not an error worth a banner.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const { overrides, hasHandLayout, onPointerDown, suppressNav, tidy } = useBoardDrag(
    'artha.board.layout.v1',
    getScale,
    team,
  );
  const { nodes, width, height } = placedLayout(props.feed, props.refs, overrides);

  // Publish the board as it stands - every box, not just the ones you moved -
  // because what a teammate should open is the arrangement you are looking at,
  // not a patch over an auto layout that may shift under them.
  const share = useCallback(async () => {
    setShareState('saving');
    const seats = Object.fromEntries(nodes.map((n) => [n.module, { x: n.x, y: n.y }]));
    try {
      const r = await saveBoardLayout(seats);
      setTeam(r.modules);
      tidy(); // your seats are the team's now; nothing of yours is unpublished
      setShareState('saved');
    } catch {
      setShareState('failed');
    }
  }, [nodes, tidy]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const measure = () => {
      const fit = Math.min(1, (vp.clientWidth - 16) / width, (vp.clientHeight - 16) / height);
      setFitScale(Math.max(ZOOM_MIN, Number.isFinite(fit) && fit > 0 ? fit : 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [width, height]);

  // Ctrl+scroll zooms (plain scroll still pans) - non-passive so it can take
  // the gesture from the browser's page zoom.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => clampZoom((z ?? scaleRef.current) * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, []);

  // A traced route (or an off-screen selection) scrolls into view - station 3
  // must never sit beyond the fold while the card talks about it.
  const focusModule = trace?.stations[0]?.module ?? props.selectedModule ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: nodes is fresh each render; the focus target + scale name the moment to re-scroll
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !focusModule) return;
    const n = nodes.find((x) => x.module === focusModule);
    if (!n) return;
    vp.scrollTo({
      left: Math.max(0, (n.x + n.w / 2) * scale - vp.clientWidth / 2),
      top: Math.max(0, (n.y + n.h / 2) * scale - vp.clientHeight / 2),
      behavior: 'smooth',
    });
  }, [focusModule, scale]);

  return (
    <div className="board-wrap">
      <div className="board-viewport" ref={viewportRef}>
        <Board
          {...props}
          overrides={overrides}
          scale={scale}
          onNodePointerDown={(e, node) =>
            onPointerDown(e, { id: node.module, x: node.x, y: node.y })
          }
          suppressNav={suppressNav}
        />
      </div>
      <p className="board-hint">{BOARD.hint}</p>
      <div className="board-controls">
        <BoardLegend />
        <button
          type="button"
          className="board-ctl"
          onClick={() => setZoom((z) => clampZoom((z ?? scaleRef.current) / 1.2))}
          title={BOARD.zoomOut}
          aria-label={BOARD.zoomOut}
        >
          −
        </button>
        <span className="board-zoom mono" aria-live="polite">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          className="board-ctl"
          onClick={() => setZoom((z) => clampZoom((z ?? scaleRef.current) * 1.2))}
          title={BOARD.zoomIn}
          aria-label={BOARD.zoomIn}
        >
          +
        </button>
        {zoom !== null && (
          <button
            type="button"
            className="board-ctl board-fit"
            onClick={() => setZoom(null)}
            title={BOARD.fitHint}
          >
            {BOARD.fit}
          </button>
        )}
        {hasHandLayout && (
          <button
            type="button"
            className="board-ctl"
            onClick={tidy}
            title={Object.keys(team).length > 0 ? BOARD.tidyHintTeam : BOARD.tidyHint}
          >
            {BOARD.tidy}
          </button>
        )}
        {hasHandLayout && (
          <button
            type="button"
            className="board-ctl board-share"
            onClick={share}
            disabled={shareState === 'saving'}
            title={BOARD.shareHint}
          >
            {BOARD.share}
          </button>
        )}
        {shareState !== 'idle' && shareState !== 'saving' && (
          // <output> is the status live-region, semantically - a screen reader
          // hears the result of the save without being sent anywhere.
          <output className={shareState === 'saved' ? 'board-shared' : 'board-shared failed'}>
            {shareState === 'saved' ? BOARD.shared : BOARD.shareFailed}
          </output>
        )}
      </div>
      {trace && <RouteCard trace={trace} clearHref="#/" />}
    </div>
  );
}

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/** The board's own legend (24c): the default view defines every word and glyph
 * it uses, on-screen - the terrain's popover never covered the board. */
function BoardLegend(): JSX.Element {
  return (
    <details className="legend legend-top">
      <summary>{BOARD_LEGEND.title}</summary>
      <div className="legend-body">
        <p>{BOARD_LEGEND.box}</p>
        <p>{BOARD_LEGEND.lights}</p>
        <p>{BOARD_LEGEND.counts}</p>
        <p>{BOARD_LEGEND.stale}</p>
        <p>{BOARD_LEGEND.select}</p>
      </div>
    </details>
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
    trace.status === 'certified' ||
    trace.status === 'proposed' ||
    trace.status === 'stale' ||
    trace.status === 'described';
  const reaches = trace.kind === 'reaches';
  // A machine-read flow opens on its moonlight page, not a capability page.
  const href = reaches
    ? routeHref({ view: 'inferred', id: trace.id })
    : routeHref({ view: 'flow', id: trace.id });
  return (
    <aside className="route-card" aria-label={`Flow route: ${trace.name}`}>
      <p className="route-kind">{reaches ? ROUTE.reachKind : ROUTE.kind}</p>
      <p className="route-name">
        <a href={href} title={ROUTE.open}>
          {trace.name}
        </a>
        <span className={`status status-${known ? trace.status : 'unknown'}`}>
          <span className="status-dot" aria-hidden="true" />
          {statusWord(trace.status)}
        </span>
      </p>
      <p className="route-coverage mono">
        {reaches
          ? `${trace.stations.length} modules reached`
          : `${trace.linked}/${trace.total} steps linked`}
      </p>
      {trace.stations.length === 0 ? (
        <p className="route-empty">{reaches ? ROUTE.noReach : ROUTE.noStations}</p>
      ) : reaches ? (
        // Unordered on purpose (23e-4): a numbered list would claim the very
        // sequence the code never states.
        <>
          <p className="route-unordered">{ROUTE.unordered}</p>
          <ul className="route-reach">
            {trace.steps.map((s) => (
              <li key={s.text} className={s.module ? 'route-step' : 'route-step unlinked'}>
                <span className="route-step-text">{s.text}</span>
                <span className="route-step-module mono">
                  {s.module ? shortName(s.module) : ROUTE.notLinked}
                </span>
              </li>
            ))}
          </ul>
        </>
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
        <a className="route-open" href={href}>
          {ROUTE.open} →
        </a>
        <a className="route-clear" href={clearHref}>
          {ROUTE.clear}
        </a>
      </p>
    </aside>
  );
}
