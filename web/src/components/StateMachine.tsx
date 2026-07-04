import type { ConceptDetail } from '../api';

/**
 * The state machine, drawn — not tabled. A concept's states stack as a vertical
 * lifeline; transitions are arrows: the common "next step" flows straight down
 * the spine, branches and loop-backs arc out to the right with their trigger.
 * Reading the shape tells a non-author the concept's whole life at a glance,
 * which a table never does. Hand-rolled SVG — no graph library, so the bundle
 * stays small and the page stays offline.
 *
 * Deliberately small: each node shows only the state name; effects/invariants
 * stay in the companion table beneath (Detail.tsx). Layout is fully deterministic.
 */

type State = ConceptDetail['states'][number];
type Transition = ConceptDetail['transitions'][number];

const NODE_W = 188;
const NODE_H = 44;
const GAP_Y = 40;
const PAD = 16;
const ARC_GAP = 18; // first arc lane, right of the node column
const ARC_STEP = 22; // spacing between stacked arc lanes
const CHAR_W = 6.4; // rough label width per char, for sizing the canvas

export function StateMachine({
  states,
  transitions,
}: {
  states: State[];
  transitions: Transition[];
}): JSX.Element {
  const index = new Map(states.map((s, i) => [s.name, i]));
  const colX = PAD;
  const centerX = colX + NODE_W / 2;
  const rightEdge = colX + NODE_W;
  const nodeY = (i: number) => PAD + i * (NODE_H + GAP_Y);

  // Split transitions: straight spine arrows vs. arcs vs. unknown endpoints.
  const known: Transition[] = [];
  const unknown: Transition[] = [];
  for (const t of transitions) {
    if (index.has(t.from) && index.has(t.to)) known.push(t);
    else unknown.push(t);
  }
  const isSpine = (t: Transition) => (index.get(t.to) ?? -9) === (index.get(t.from) ?? -1) + 1;
  const arcs = known.filter((t) => !isSpine(t));
  const spine = known.filter(isSpine);

  let maxArcLabel = 0;
  for (const t of arcs) maxArcLabel = Math.max(maxArcLabel, t.trigger.length);
  const arcRoom =
    arcs.length === 0 ? 0 : ARC_GAP + arcs.length * ARC_STEP + maxArcLabel * CHAR_W + 16;
  const width = Math.ceil(rightEdge + arcRoom);

  // Spine labels run leftward from the column; reserve negative canvas for them.
  let maxSpineLabel = 0;
  for (const t of spine) maxSpineLabel = Math.max(maxSpineLabel, t.trigger.length);
  const leftPad = Math.max(0, Math.ceil(maxSpineLabel * CHAR_W) - (centerX - 10) + 10);
  const height = PAD * 2 + states.length * NODE_H + Math.max(0, states.length - 1) * GAP_Y;

  return (
    <div className="state-machine-wrap">
      <svg
        className="state-machine"
        viewBox={`${-leftPad} 0 ${width + leftPad} ${height}`}
        width={width + leftPad}
        height={height}
        role="img"
        aria-label={`State machine: ${states.map((s) => s.name).join(', ')}`}
      >
        <defs>
          <marker
            id="sm-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="sm-arrowhead" />
          </marker>
        </defs>

        {spine.map((t) => {
          const fi = index.get(t.from) ?? 0;
          const ti = index.get(t.to) ?? 0;
          const y1 = nodeY(fi) + NODE_H;
          const y2 = nodeY(ti);
          const midY = (y1 + y2) / 2;
          return (
            <g key={`s-${t.from}-${t.to}`} className="sm-edge sm-edge-spine">
              <path d={`M ${centerX} ${y1} L ${centerX} ${y2}`} markerEnd="url(#sm-arrow)" />
              {/* Spine labels sit left of the column; arc labels sit right — so the two never collide. */}
              <text
                className="sm-edge-label"
                x={centerX - 10}
                y={midY}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {t.trigger}
              </text>
            </g>
          );
        })}

        {arcs.map((t, k) => {
          const fi = index.get(t.from) ?? 0;
          const ti = index.get(t.to) ?? 0;
          const laneX = rightEdge + ARC_GAP + k * ARC_STEP;
          const self = fi === ti;
          const y1 = nodeY(fi) + (self ? 12 : NODE_H / 2);
          const y2 = nodeY(ti) + (self ? NODE_H - 12 : NODE_H / 2);
          const labelY = (y1 + y2) / 2;
          const d = self
            ? `M ${rightEdge} ${y1} C ${laneX + 14} ${y1}, ${laneX + 14} ${y2}, ${rightEdge} ${y2}`
            : `M ${rightEdge} ${y1} C ${laneX} ${y1}, ${laneX} ${y2}, ${rightEdge} ${y2}`;
          return (
            <g key={`a-${t.from}-${t.to}-${k}`} className="sm-edge sm-edge-arc">
              <path d={d} markerEnd="url(#sm-arrow)" fill="none" />
              <text className="sm-edge-label" x={laneX + 8} y={labelY} dominantBaseline="middle">
                {t.trigger}
              </text>
            </g>
          );
        })}

        {states.map((s, i) => (
          <g key={s.name} className="sm-node" transform={`translate(${colX}, ${nodeY(i)})`}>
            <rect className="sm-node-box" width={NODE_W} height={NODE_H} rx="3" />
            <text className="sm-node-label" x={NODE_W / 2} y={NODE_H / 2} dominantBaseline="middle">
              {s.name}
            </text>
          </g>
        ))}
      </svg>

      {unknown.length > 0 && (
        <ul className="sm-extra">
          {unknown.map((t, k) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: parallel to source order
            <li key={k}>
              <code>{t.from}</code> → <code>{t.to}</code>{' '}
              <span className="sm-extra-when">when {t.trigger}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
