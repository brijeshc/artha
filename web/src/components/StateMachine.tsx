import type { ConceptDetail } from '../api';
import { type StateEdge, stateLayout } from '../board';
import { roughArrowhead, roughLine, roughRect, seedFrom } from '../rough';

/**
 * The concept lifecycle, drawn in the board's hand (23e): states are chalk
 * boxes running left-to-right - the start on the left, the life advancing
 * rightward - and a return (a cancel, a retry) drops into a lane under the
 * boxes and runs back orthogonally, so the way back reads as a deliberate
 * route rather than a stray diagonal across the diagram. Same chalk as the
 * board and the inner board, so the atlas reads as one continuous hand at
 * every altitude: repo → module → lifecycle.
 *
 * The two lights hold here too (D2). A state's *name* is read from code, so a
 * box carries the concept's standing. Every *arrow* is human ink: the code
 * never holds the trigger that moves a concept from one state to the next -
 * that is exactly the delta a human supplies (21a leaves transitions blank on
 * purpose). Reading the shape tells a non-author the concept's whole life at a
 * glance, which a table never does.
 *
 * Deliberately small: a box shows only the state name; effects and invariants
 * stay in the companion table beneath. Hand-rolled SVG, no graph library, so
 * the page stays small and offline. Pure and deterministic (SSR-testable).
 */

type State = ConceptDetail['states'][number];
type Transition = ConceptDetail['transitions'][number];

export function StateMachine({
  states,
  transitions,
  status = 'proposed',
}: {
  states: State[];
  transitions: Transition[];
  /** The concept's standing - the state names are only as vouched as it is. */
  status?: string;
}): JSX.Element {
  const names = states.map((s) => s.name);
  const known = new Set(names);
  // A transition naming a state the concept doesn't declare can't be drawn;
  // it is listed under the diagram rather than silently dropped.
  const unknown = transitions.filter((t) => !known.has(t.from) || !known.has(t.to));
  const { nodes, edges, width, height } = stateLayout(names, transitions);
  const standing = status === 'certified' || status === 'stale' ? status : 'proposed';

  return (
    <div className="state-machine-wrap">
      <svg
        className={`state-machine sm-${standing}`}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`Lifecycle: ${names.join(', ')}`}
      >
        {edges.map((e) => (
          <StateEdgeMark key={`${e.kind}-${e.from}-${e.to}-${e.trigger}`} edge={e} />
        ))}

        {nodes.map((n) => {
          const seed = seedFrom(n.name);
          return (
            <g key={n.name} className="sm-node">
              {/* the chalk frame, drawn twice - a hand goes over its line */}
              <path className="sm-node-box" d={roughRect(n.x, n.y, n.w, n.h, seed)} />
              <path className="sm-node-box echo" d={roughRect(n.x, n.y, n.w, n.h, seed + 97)} />
              <text className="sm-node-label" x={n.x + n.w / 2} y={n.y + n.h / 2}>
                {n.name}
              </text>
            </g>
          );
        })}
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

/** One transition in chalk: the route the layout worked out, stroked corner to
 * corner, with the arrowhead where it lands and the trigger on it. A straight
 * run onward, a lane below for a way back, a small loop overhead for staying
 * put - all one hand. */
function StateEdgeMark({ edge }: { edge: StateEdge }): JSX.Element | null {
  const { points } = edge;
  if (points.length < 2) return null;
  const seed = seedFrom(`${edge.from}→${edge.to}→${edge.trigger}`);
  const jitter = edge.kind === 'forward' ? 1.2 : 1;
  const strokes = points
    .slice(1)
    .map((p, i) => roughLine(points[i].x, points[i].y, p.x, p.y, seed + i, { jitter }));
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  strokes.push(roughArrowhead(last.x, last.y, prev.x, prev.y, seed, edge.kind === 'self' ? 7 : 9));
  return (
    <g className={`sm-edge sm-edge-${edge.kind}`}>
      <path d={strokes.join(' ')} />
      {/* the trigger: human ink, haloed in the night so it stays readable
          wherever it crosses its own chalk */}
      <text className="sm-edge-label" x={edge.label.x} y={edge.label.y}>
        {edge.trigger}
      </text>
    </g>
  );
}
