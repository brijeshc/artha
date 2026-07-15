import type { MapFeed, VouchedPoint } from '../api';
import { OBSERVATORY as O } from '../copy';
import {
  type AreaShare,
  type BlindDot,
  type BurnPoint,
  type Standing,
  areaShares,
  flyingBlind,
  shortName,
  vouchedBurnup,
} from '../derive';

/**
 * The observatory (23c): the signal behind the map, drawn as charts. The board
 * stays a clean blackboard; density and analytics live here instead - three
 * hand-rolled SVGs (zero deps, offline, like {@link treemap}) built to the
 * dataviz method: one axis each, recessive gridlines, direct labels over a
 * legend box, and the *status palette as the chart palette* (no new hues -
 * phosphor = vouched, moonlight = described, dim ink = unexplained). Colour is
 * never the only encoding: position (the quadrant, the bar order) and labels
 * carry the same reading, so a colour-blind or printed page still answers the
 * question. Pure over the read feeds (SSR-testable).
 */
export function Observatory({
  feed,
  history,
}: {
  feed: MapFeed;
  history: VouchedPoint[];
}): JSX.Element {
  const dots = flyingBlind(feed);
  const shares = areaShares(feed);
  const burn = vouchedBurnup(history);

  return (
    <div className="page observatory">
      <header className="page-head">
        <h1 className="page-title">{O.title}</h1>
        <p className="page-gloss">{O.gloss}</p>
        <Legend />
      </header>

      <figure className="obs-figure">
        <figcaption>
          <h2 className="obs-title">{O.blindTitle}</h2>
          <p className="obs-gloss">{O.blindGloss}</p>
        </figcaption>
        <FlyingBlindChart dots={dots} />
      </figure>

      <figure className="obs-figure">
        <figcaption>
          <h2 className="obs-title">{O.burnTitle}</h2>
          <p className="obs-gloss">{O.burnGloss}</p>
        </figcaption>
        <BurnupChart burn={burn} />
      </figure>

      <figure className="obs-figure">
        <figcaption>
          <h2 className="obs-title">{O.areasTitle}</h2>
          <p className="obs-gloss">{O.areasGloss}</p>
        </figcaption>
        <AreaBarsChart shares={shares} />
      </figure>
    </div>
  );
}

const ORDER: Standing[] = ['vouched', 'described', 'unexplained'];

/** The one legend the charts share, so a colour reads the same in every figure. */
function Legend(): JSX.Element {
  return (
    <ul className="obs-legend" aria-label="What the colours mean">
      {ORDER.map((s) => (
        <li key={s} className="obs-legend-item">
          <span className={`obs-swatch standing-${s}`} aria-hidden="true" />
          {O.legend[s]}
        </li>
      ))}
    </ul>
  );
}

// ── flying-blind quadrant ─────────────────────────────────────────────────────

const Q = { w: 680, h: 380, l: 48, r: 136, t: 20, b: 42 };

function FlyingBlindChart({ dots }: { dots: BlindDot[] }): JSX.Element {
  if (dots.length === 0) return <p className="obs-empty">{O.blindEmpty}</p>;

  const plotW = Q.w - Q.l - Q.r;
  const plotH = Q.h - Q.t - Q.b;
  const xMax = Math.max(1, ...dots.map((d) => d.churn));
  const x = (churn: number) => Q.l + (churn / xMax) * plotW;
  const y = (v: number) => Q.t + (1 - v) * plotH;
  const baseline = y(0);

  // The "flying blind" region: busier than the median (positive) churn and less
  // than half vouched. Shading + a label make the concern legible at a glance.
  const churns = dots.map((d) => d.churn).filter((c) => c > 0);
  const churnCut = churns.length > 0 ? median(churns) : xMax;
  const vouchedCut = 0.5;

  // Callouts go to the flying-blind dots (busiest first, capped) - never a label
  // on every point.
  const called = dots.filter((d) => d.churn >= churnCut && d.vouched < vouchedCut).slice(0, 4);
  const isCalled = new Set(called.map((d) => d.module));

  return (
    <svg
      className="obs-chart quadrant"
      viewBox={`0 0 ${Q.w} ${Q.h}`}
      width="100%"
      role="img"
      aria-label={`${O.blindTitle}: ${dots.length} modules by churn and vouched depth`}
    >
      <title>{O.blindTitle}</title>

      {/* the flying-blind quadrant wash (busy AND under half-vouched) + its label */}
      <rect
        className="obs-quadrant"
        x={x(churnCut)}
        y={y(vouchedCut)}
        width={Q.l + plotW - x(churnCut)}
        height={baseline - y(vouchedCut)}
        rx={4}
      />
      <text className="obs-quadrant-label" x={Q.l + plotW - 8} y={baseline - 10}>
        {O.blindQuadrant}
      </text>

      {/* recessive y grid at 0 / 50 / 100% vouched */}
      {[0, 0.5, 1].map((v) => (
        <g key={v} className="obs-grid">
          <line x1={Q.l} y1={y(v)} x2={Q.l + plotW} y2={y(v)} />
          <text className="obs-tick" x={Q.l - 8} y={y(v) + 4}>
            {Math.round(v * 100)}%
          </text>
        </g>
      ))}

      {/* axes */}
      <line className="obs-axis" x1={Q.l} y1={Q.t} x2={Q.l} y2={baseline} />
      <line className="obs-axis" x1={Q.l} y1={baseline} x2={Q.l + plotW} y2={baseline} />
      <text className="obs-axis-label x" x={Q.l + plotW} y={baseline + 30}>
        {O.blindX}
      </text>
      <text className="obs-axis-label y" x={-Q.t} y={14} transform="rotate(-90)" textAnchor="end">
        {O.blindY}
      </text>

      {/* the dots - drawn unexplained→described→vouched so trust sits on top */}
      {[...dots]
        .sort((a, b) => weight(a.standing) - weight(b.standing))
        .map((d) => (
          <circle
            key={d.module}
            className={`obs-dot standing-${d.standing}`}
            cx={x(d.churn)}
            cy={y(d.vouched)}
            r={isCalled.has(d.module) ? 6 : 5}
          >
            <title>{`${d.module} - ${d.churn} commits · ${Math.round(d.vouched * 100)}% vouched · ${d.standing}`}</title>
          </circle>
        ))}

      {/* selective direct labels: the flying-blind modules */}
      {called.map((d) => (
        <text
          key={`l-${d.module}`}
          className="obs-callout"
          x={Math.min(x(d.churn) + 10, Q.l + plotW)}
          y={y(d.vouched) + 4}
        >
          {shortName(d.module)}
        </text>
      ))}
    </svg>
  );
}

// ── vouched burn-up ───────────────────────────────────────────────────────────

const B = { w: 680, h: 300, l: 46, r: 120, t: 20, b: 42 };
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function BurnupChart({ burn }: { burn: BurnPoint[] }): JSX.Element {
  if (burn.length === 0) return <p className="obs-empty">{O.burnEmpty}</p>;

  const plotW = B.w - B.l - B.r;
  const plotH = B.h - B.t - B.b;
  const first = Date.parse(burn[0].date);
  const last = Date.parse(burn[burn.length - 1].date);
  const spanDays = Math.max(1, (last - first) / MS_PER_DAY);
  const yMax = Math.max(1, ...burn.map((p) => p.count));
  const x = (date: string) => B.l + ((Date.parse(date) - first) / MS_PER_DAY / spanDays) * plotW;
  const y = (count: number) => B.t + (1 - count / yMax) * plotH;
  const baseline = y(0);
  const xEnd = B.l + plotW;

  // A step function - the count holds flat between certifications, then jumps -
  // starting at the baseline on the first vouched date and held to the right edge.
  let prevY = baseline;
  let line = `M ${x(burn[0].date)} ${baseline}`;
  for (const p of burn) {
    line += ` L ${x(p.date)} ${prevY} L ${x(p.date)} ${y(p.count)}`;
    prevY = y(p.count);
  }
  line += ` L ${xEnd} ${prevY}`;
  const area = `${line} L ${xEnd} ${baseline} L ${x(burn[0].date)} ${baseline} Z`;
  const lastPoint = burn[burn.length - 1];

  return (
    <svg
      className="obs-chart burnup"
      viewBox={`0 0 ${B.w} ${B.h}`}
      width="100%"
      role="img"
      aria-label={`${O.burnTitle}: ${lastPoint.count} facts vouched by ${lastPoint.date}`}
    >
      <title>{O.burnTitle}</title>

      {/* recessive y grid at 0 / max */}
      {[0, yMax].map((c) => (
        <g key={c} className="obs-grid">
          <line x1={B.l} y1={y(c)} x2={B.l + plotW} y2={y(c)} />
          <text className="obs-tick" x={B.l - 8} y={y(c) + 4}>
            {c}
          </text>
        </g>
      ))}

      <line className="obs-axis" x1={B.l} y1={B.t} x2={B.l} y2={baseline} />
      <line className="obs-axis" x1={B.l} y1={baseline} x2={B.l + plotW} y2={baseline} />
      <text className="obs-axis-label y" x={-B.t} y={14} transform="rotate(-90)" textAnchor="end">
        {O.burnY}
      </text>

      <path className="obs-area" d={area} />
      <path className="obs-line" d={line} />

      {burn.map((p) => (
        <circle className="obs-node" key={p.date} cx={x(p.date)} cy={y(p.count)} r={4}>
          <title>{`${p.date} - ${p.count} vouched`}</title>
        </circle>
      ))}

      {/* the endpoints, direct-labelled: the running total and the date range */}
      <text
        className="obs-callout strong"
        x={Math.min(xEnd + 8, B.w - 4)}
        y={y(lastPoint.count) + 4}
      >
        {lastPoint.count} {O.burnLatest}
      </text>
      <text className="obs-tick" x={B.l} y={baseline + 30}>
        {burn[0].date}
      </text>
      {burn.length > 1 && (
        <text className="obs-tick end" x={xEnd} y={baseline + 30}>
          {lastPoint.date}
        </text>
      )}
    </svg>
  );
}

// ── per-area two-light bars ───────────────────────────────────────────────────

// r leaves room for the self-labelling "NN% vouched" readout (24b).
const A = { w: 680, l: 128, r: 104, rowH: 34, barH: 16, pad: 8 };

function AreaBarsChart({ shares }: { shares: AreaShare[] }): JSX.Element {
  if (shares.length === 0) return <p className="obs-empty">{O.areasEmpty}</p>;

  const barW = A.w - A.l - A.r;
  const height = A.pad * 2 + shares.length * A.rowH;

  return (
    <svg
      className="obs-chart areabars"
      viewBox={`0 0 ${A.w} ${height}`}
      width="100%"
      role="img"
      aria-label={`${O.areasTitle}: ${shares.length} product areas by vouched / described / unexplained share`}
    >
      <title>{O.areasTitle}</title>
      {shares.map((s, i) => {
        const cy = A.pad + i * A.rowH + A.rowH / 2;
        const barY = cy - A.barH / 2;
        const segs: Array<{ k: Standing; frac: number }> = [
          { k: 'vouched', frac: s.vouched },
          { k: 'described', frac: s.described },
          { k: 'unexplained', frac: s.unexplained },
        ].filter((seg) => seg.frac > 0.001) as Array<{ k: Standing; frac: number }>;
        let cx = A.l;
        return (
          <g key={s.area} className="obs-row">
            <text className="obs-row-label" x={A.l - 10} y={cy + 4} textAnchor="end">
              {shortName(s.area)}
            </text>
            {segs.map((seg) => {
              // 2px surface gap between fills, so segments never bleed together.
              const w = Math.max(0, seg.frac * barW - (segs.length > 1 ? 2 : 0));
              const rect = (
                <rect
                  key={seg.k}
                  className={`obs-seg standing-${seg.k}`}
                  x={cx}
                  y={barY}
                  width={w}
                  height={A.barH}
                  rx={3}
                >
                  <title>{`${s.area} - ${O.legend[seg.k]}: ${Math.round(seg.frac * 100)}%`}</title>
                </rect>
              );
              cx += seg.frac * barW;
              return rect;
            })}
            {/* Self-labelling readout (24b): a bare number beside a stacked bar
                reads as the bar's total - "0%" on a fully-described bar looked
                broken. The word makes the referent visible on every row. */}
            <text className="obs-row-pct" x={A.w - A.r + 8} y={cy + 4}>
              {Math.round(s.vouched * 100)}% vouched
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Draw order so the phosphor of trust sits on top of the moonlight and dim. */
function weight(s: Standing): number {
  return s === 'vouched' ? 3 : s === 'described' ? 2 : 1;
}

/** The median of a non-empty list (average of the middle pair when even). */
function median(ns: number[]): number {
  const sorted = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
