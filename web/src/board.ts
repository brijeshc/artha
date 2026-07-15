// The board layout - a layered flowchart, not a space-filling map. Consumers
// sit at the top, shared foundations sink to the bottom, and every row gets
// generous air: the register is a handmade blackboard diagram, so whitespace
// is a feature, not waste. Pure and deterministic (SSR-testable); hand-dragged
// positions override these seats and are stored by the viewport, never here.

import type { MapModule, RefEdge } from './api';

// Box size leaves room for the chalk annotations (name, the machine's one-line
// description, two capability notes, the standing line) without crowding.
export const NODE_W = 208;
export const NODE_H = 118;
export const GAP_X = 96;
export const GAP_Y = 132;
export const MARGIN = 72;

// The inner board's file boxes (23b) carry less - a filename and a couple of
// pinned-fact notes - so they run smaller, with the same generous air.
export const FILE_NODE_W = 176;
export const FILE_NODE_H = 78;
export const FILE_GAP_X = 76;
export const FILE_GAP_Y = 100;
export const FILE_MARGIN = 56;

export interface BoardNode {
  module: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0 = imported by nobody (a consumer); deeper = more foundational. */
  layer: number;
}

export interface BoardLayout {
  nodes: BoardNode[];
  width: number;
  height: number;
}

/** One directed link between two board nodes, by id. */
export interface Link {
  from: string;
  to: string;
}

/** Box geometry + gaps a {@link layeredLayout} lays out with. */
export interface LayoutMetrics {
  nodeW: number;
  nodeH: number;
  gapX: number;
  gapY: number;
  margin: number;
}

export interface LayeredNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  layer: number;
}

export interface LayeredLayout {
  nodes: LayeredNode[];
  width: number;
  height: number;
}

/** How the caller wants a row ordered. */
export interface LayoutOrder {
  /** The seed order and the tie-break - the last word, so a row is never
   * arbitrary. */
  sortKey?: (id: string) => string;
  /** Keeps a group's members contiguous in a row: a product area is a
   * province, and it reads as one block or not at all. Omit for one group. */
  groupOf?: (id: string) => string;
}

/**
 * The blackboard's layout engine, generic over node ids: layer by dependency
 * depth (an edge from→to pushes `to` below `from`, longest path via Kahn),
 * order each row to cut edge crossings, centre it, and give every row generous
 * air. Cycles cannot happen cleanly in import graphs but do happen - members
 * that never top-sort keep a deterministic name-ordered fallback seat and their
 * back-edges simply don't constrain the layering. Shared by the module board
 * and the inner file board so both hands draw the same flowchart. Pure and
 * deterministic: reordering the inputs never changes the output.
 */
export function layeredLayout(
  ids: string[],
  links: Link[],
  metrics: LayoutMetrics,
  order: LayoutOrder = {},
): LayeredLayout {
  const sortKey = order.sortKey ?? ((id: string) => id);
  const groupOf = order.groupOf ?? (() => '');
  const { nodeW, nodeH, gapX, gapY, margin } = metrics;
  const names = [...ids].sort();
  const known = new Set(names);
  const edges = links.filter((e) => e.from !== e.to && known.has(e.from) && known.has(e.to));

  // Kahn over from→to; in-degree = how many nodes point at you.
  const inDeg = new Map<string, number>(names.map((n) => [n, 0]));
  for (const e of edges) inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);

  const layer = new Map<string, number>();
  let queue = names.filter((n) => (inDeg.get(n) ?? 0) === 0);
  for (const n of queue) layer.set(n, 0);
  const deg = new Map(inDeg);
  while (queue.length > 0) {
    queue.sort();
    const next: string[] = [];
    for (const from of queue) {
      for (const e of edges) {
        if (e.from !== from) continue;
        const proposed = (layer.get(from) ?? 0) + 1;
        if ((layer.get(e.to) ?? -1) < proposed) layer.set(e.to, proposed);
        const d = (deg.get(e.to) ?? 1) - 1;
        deg.set(e.to, d);
        if (d === 0) next.push(e.to);
      }
    }
    queue = next;
  }
  // Cycle members (never reached zero in-degree): seat below their deepest
  // already-layered importer, else at 0 - name order keeps it deterministic.
  for (const n of names) {
    if (layer.has(n)) continue;
    const importers = edges
      .filter((e) => e.to === n && layer.has(e.from))
      .map((e) => (layer.get(e.from) ?? 0) + 1);
    layer.set(n, importers.length > 0 ? Math.max(...importers) : 0);
  }

  const rows = new Map<number, string[]>();
  for (const n of names) {
    const l = layer.get(n) ?? 0;
    const row = rows.get(l) ?? [];
    row.push(n);
    rows.set(l, row);
  }
  // Seed with the caller's order, then straighten the arrows.
  for (const row of rows.values()) row.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  const layers = [...rows.keys()].sort((a, b) => a - b);
  straightenRows(rows, layers, edges, groupOf, sortKey);
  const widest = Math.max(...layers.map((l) => (rows.get(l) ?? []).length), 1);
  const width = margin * 2 + widest * nodeW + (widest - 1) * gapX;
  const height = margin * 2 + layers.length * nodeH + (layers.length - 1) * gapY;

  const nodes: LayeredNode[] = [];
  layers.forEach((l, rowIndex) => {
    const row = rows.get(l) ?? [];
    const rowWidth = row.length * nodeW + (row.length - 1) * gapX;
    const x0 = (width - rowWidth) / 2;
    row.forEach((n, i) => {
      nodes.push({
        id: n,
        x: Math.round(x0 + i * (nodeW + gapX)),
        y: Math.round(margin + rowIndex * (nodeH + gapY)),
        w: nodeW,
        h: nodeH,
        layer: l,
      });
    });
  });
  return { nodes, width, height };
}

/** Sweeps of the barycentre pass. Four settles every board this size draws;
 * a fixed count keeps the result deterministic, which matters more here than
 * the last crossing. */
const SWEEPS = 4;

/**
 * Cut the crossings: order each row by where its edges actually land (the
 * barycentre of a node's neighbours in the next row over), sweeping up and
 * down a few times. A node with nothing in the adjacent row keeps its seat
 * rather than drifting to the edge.
 *
 * Groups stay contiguous throughout: the pass orders the *groups* by their own
 * barycentre and the members inside each one, so a product area still reads as
 * one province - the arrows straighten around the areas, never through them.
 * Deterministic: a seeded order, a fixed sweep count, and the sort key
 * breaking every tie.
 */
function straightenRows(
  rows: Map<number, string[]>,
  layers: number[],
  edges: Link[],
  groupOf: (id: string) => string,
  sortKey: (id: string) => string,
): void {
  for (let pass = 0; pass < SWEEPS; pass++) {
    // alternate: settle against the row above, then against the row below
    const up = pass % 2 === 0;
    const walk = up ? layers.slice(1) : layers.slice(0, -1).reverse();
    for (const l of walk) {
      const row = rows.get(l) ?? [];
      if (row.length < 2) continue;
      const other = rows.get(up ? l - 1 : l + 1) ?? [];
      const seat = new Map(other.map((n, i) => [n, i]));

      const pull = new Map<string, number>();
      row.forEach((n, i) => {
        const hits: number[] = [];
        for (const e of edges) {
          const mine = up ? e.to : e.from;
          const theirs = up ? e.from : e.to;
          if (mine !== n) continue;
          const s = seat.get(theirs);
          if (s !== undefined) hits.push(s);
        }
        // nothing to be pulled by: keep the seat you have
        pull.set(n, hits.length > 0 ? hits.reduce((a, b) => a + b, 0) / hits.length : i);
      });

      const groups = new Map<string, string[]>();
      for (const n of row) groups.set(groupOf(n), [...(groups.get(groupOf(n)) ?? []), n]);
      const groupPull = new Map<string, number>();
      for (const [g, members] of groups)
        groupPull.set(g, members.reduce((s, n) => s + (pull.get(n) ?? 0), 0) / members.length);

      const next: string[] = [];
      for (const g of [...groups.keys()].sort(
        (a, b) => (groupPull.get(a) ?? 0) - (groupPull.get(b) ?? 0) || a.localeCompare(b),
      ))
        next.push(
          ...[...(groups.get(g) ?? [])].sort(
            (a, b) =>
              (pull.get(a) ?? 0) - (pull.get(b) ?? 0) || sortKey(a).localeCompare(sortKey(b)),
          ),
        );
      rows.set(l, next);
    }
  }
}

/**
 * The module board's layout: modules layered by their import graph, rows
 * straightened to cut crossings while each product area stays one province.
 * A thin adapter over {@link layeredLayout}.
 */
export function boardLayout(
  modules: MapModule[],
  refs: RefEdge[],
  areaOf?: Map<string, string>,
): BoardLayout {
  const links = refs.map((r) => ({ from: r.from_module, to: r.to_module }));
  const metrics = { nodeW: NODE_W, nodeH: NODE_H, gapX: GAP_X, gapY: GAP_Y, margin: MARGIN };
  const { nodes, width, height } = layeredLayout(
    modules.map((m) => m.module),
    links,
    metrics,
    {
      groupOf: (n) => areaOf?.get(n) ?? '~',
      sortKey: (n) => `${areaOf?.get(n) ?? '~'} ${n}`,
    },
  );
  return {
    nodes: nodes.map((n) => ({ module: n.id, x: n.x, y: n.y, w: n.w, h: n.h, layer: n.layer })),
    width,
    height,
  };
}

export interface FileBoardNode {
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
  layer: number;
}

export interface FileBoardLayout {
  nodes: FileBoardNode[];
  width: number;
  height: number;
}

/**
 * The inner board's layout (23b): a module's files layered by their intra-module
 * imports, smaller boxes, plain-name row order. A thin adapter over
 * {@link layeredLayout} - the same hand, one altitude down.
 */
export function fileBoardLayout(files: string[], edges: Link[]): FileBoardLayout {
  const metrics = {
    nodeW: FILE_NODE_W,
    nodeH: FILE_NODE_H,
    gapX: FILE_GAP_X,
    gapY: FILE_GAP_Y,
    margin: FILE_MARGIN,
  };
  // One module's files are one group, so the pass straightens them freely.
  const { nodes, width, height } = layeredLayout(files, edges, metrics);
  return {
    nodes: nodes.map((n) => ({ file: n.id, x: n.x, y: n.y, w: n.w, h: n.h, layer: n.layer })),
    width,
    height,
  };
}

/** A product area drawn as a province: the dashed chalk boundary around it. */
export interface Province {
  area: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How much air a province's boundary leaves around its boxes. */
export const PROVINCE_PAD = 22;

/**
 * The chalk boundaries around each product area - drawn only where an area's
 * boxes actually sit together. An outline that swallowed a module from another
 * area would claim a province that isn't there, so that one is left undrawn:
 * the board would rather say nothing than draw a border that lies. A lone box
 * is not a province either - its own frame already says everything an outline
 * would.
 *
 * Pure over the *placed* nodes, so a hand-dragged board re-answers the question
 * honestly: drag a foreign module into the middle of an area and that area's
 * boundary simply stops being drawn.
 */
export function areaProvinces(
  nodes: Array<{ module: string; x: number; y: number; w: number; h: number }>,
  areaOf: Map<string, string>,
  pad: number = PROVINCE_PAD,
): Province[] {
  const byArea = new Map<string, typeof nodes>();
  for (const n of nodes) {
    const area = areaOf.get(n.module);
    if (area) byArea.set(area, [...(byArea.get(area) ?? []), n]);
  }
  const out: Province[] = [];
  for (const [area, members] of [...byArea].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (members.length < 2) continue;
    const x = Math.min(...members.map((m) => m.x)) - pad;
    const y = Math.min(...members.map((m) => m.y)) - pad;
    const w = Math.max(...members.map((m) => m.x + m.w)) + pad - x;
    const h = Math.max(...members.map((m) => m.y + m.h)) + pad - y;
    const mine = new Set(members.map((m) => m.module));
    const swallowsAForeigner = nodes.some(
      (n) => !mine.has(n.module) && n.x < x + w && n.x + n.w > x && n.y < y + h && n.y + n.h > y,
    );
    if (!swallowsAForeigner) out.push({ area, x, y, w, h });
  }
  return out;
}

// ── the concept lifecycle (23e) ───────────────────────────────────────────────

// A lifecycle's boxes hold one state name, so they run smaller than a module's;
// the column gap is wide enough for a trigger to sit on its arrow.
export const STATE_NODE_W = 136;
export const STATE_NODE_H = 44;
export const STATE_GAP_X = 124;
export const STATE_GAP_Y = 26;
export const STATE_MARGIN = 30;
/** The first return lane sits this far under the boxes; each next one steps down. */
export const STATE_LANE_GAP = 26;
export const STATE_LANE_STEP = 20;
/** How far a route steps out of a box before it turns - it stays inside the
 * gap under the box, so the turn never touches a neighbour. */
const STATE_STUB = 13;

export interface StateNode {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0 = the start of the life; deeper = further along it. */
  layer: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Forward = onward through the life; return = a way back; self = stays put. */
export type StateEdgeKind = 'forward' | 'return' | 'self';

export interface StateEdge {
  from: string;
  to: string;
  trigger: string;
  kind: StateEdgeKind;
  /** Return edges only: the lane under the boxes it runs in (0 = nearest). */
  lane: number;
  /**
   * The route the chalk follows, corner to corner, with the arrowhead at the
   * last point. Computed here rather than at the drawing, because "a way back
   * never crosses a state it isn't about" is geometry - and geometry is
   * testable. Returns keep every vertical run in a column gap and every long
   * horizontal in the lane below the boxes: the two places a box can never be.
   */
  points: Point[];
  /** Where the trigger sits - on the route, clear of the boxes. */
  label: Point;
}

export interface StateLayout {
  nodes: StateNode[];
  edges: StateEdge[];
  width: number;
  height: number;
  /** Y of the first return lane; further lanes step down by STATE_LANE_STEP. */
  laneY: number;
}

interface StateLink {
  from: string;
  to: string;
  trigger: string;
}

/**
 * The lifecycle's layout: states left-to-right, the start on the left, every
 * return routed through a lane below the boxes.
 *
 * Its own engine rather than an adapter over {@link layeredLayout}, because a
 * lifecycle wants three things the board's engine deliberately does not give
 * it. The states' **declared order** (read verbatim from code - that is the
 * order the life runs in; alphabetical never is). **Columns**, not rows - a
 * life reads left-to-right. And a **real cycle break**: on an import graph a
 * cycle is an anomaly the board can afford to seat by name, but on a state
 * machine the returns *are* the shape, and a lifecycle where every state has a
 * way in would collapse into a single column under the board's fallback.
 *
 * Pure and deterministic: the same states and transitions always draw the same
 * diagram, and reordering the transitions never moves a box.
 */
export function stateLayout(states: string[], transitions: StateLink[]): StateLayout {
  const names = states.filter((n, i) => states.indexOf(n) === i);
  const known = new Set(names);
  const links = transitions.filter((t) => known.has(t.from) && known.has(t.to));

  const selfLoops = new Set<number>();
  links.forEach((t, i) => {
    if (t.from === t.to) selfLoops.add(i);
  });
  const back = backEdges(names, links, selfLoops);
  // What is left leads strictly onward, so the longest path is a true depth.
  const dag = links.filter((_, i) => !back.has(i) && !selfLoops.has(i));
  const layer = lifeDepth(names, dag);

  const cols = new Map<number, string[]>();
  for (const n of names) {
    const l = layer.get(n) ?? 0;
    const col = cols.get(l) ?? [];
    col.push(n); // `names` runs in declared order, so each column does too
    cols.set(l, col);
  }
  const depths = [...cols.keys()].sort((a, b) => a - b);
  const tallest = Math.max(...depths.map((l) => (cols.get(l) ?? []).length), 1);
  const width = STATE_MARGIN * 2 + depths.length * STATE_NODE_W + (depths.length - 1) * STATE_GAP_X;
  const boxesH = STATE_MARGIN * 2 + tallest * STATE_NODE_H + (tallest - 1) * STATE_GAP_Y;

  const nodes: StateNode[] = [];
  depths.forEach((l, colIndex) => {
    const col = cols.get(l) ?? [];
    const colH = col.length * STATE_NODE_H + (col.length - 1) * STATE_GAP_Y;
    const y0 = (boxesH - colH) / 2; // each column centred against the tallest
    col.forEach((n, i) => {
      nodes.push({
        name: n,
        x: Math.round(STATE_MARGIN + colIndex * (STATE_NODE_W + STATE_GAP_X)),
        y: Math.round(y0 + i * (STATE_NODE_H + STATE_GAP_Y)),
        w: STATE_NODE_W,
        h: STATE_NODE_H,
        layer: l,
      });
    });
  });

  // Lanes: the shortest way back hugs the boxes and longer ones swing out
  // below it, so returns nest instead of crossing - a short return seated
  // outside a long one would have to cut straight through the long one's run.
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const centreX = (name: string) => {
    const n = byName.get(name);
    return n ? n.x + n.w / 2 : 0;
  };
  const returns = links.map((_, i) => i).filter((i) => back.has(i));
  const span = (i: number) => Math.abs(centreX(links[i].from) - centreX(links[i].to));
  const laneOf = new Map<number, number>();
  [...returns].sort((a, b) => span(a) - span(b) || a - b).forEach((i, lane) => laneOf.set(i, lane));

  const laneY = boxesH - STATE_MARGIN + STATE_LANE_GAP;
  // A box directly under another shares its column's x exactly, so a straight
  // drop out of the upper one would run right through it: those routes step
  // aside into the column gap instead.
  const covered = new Set<string>();
  for (const col of cols.values()) for (const n of col.slice(0, -1)) covered.add(n);

  const edges: StateEdge[] = links.map((t, i) => {
    const kind: StateEdgeKind = selfLoops.has(i) ? 'self' : back.has(i) ? 'return' : 'forward';
    const lane = laneOf.get(i) ?? 0;
    const from = byName.get(t.from);
    const to = byName.get(t.to);
    const base = { from: t.from, to: t.to, trigger: t.trigger, kind, lane };
    if (!from || !to) return { ...base, points: [], label: { x: 0, y: 0 } };
    if (kind === 'self') return { ...base, ...selfRoute(from) };
    if (kind === 'return')
      return { ...base, ...returnRoute(from, to, laneY + lane * STATE_LANE_STEP, covered) };
    return { ...base, ...forwardRoute(from, to) };
  });

  const height =
    returns.length > 0 ? laneY + (returns.length - 1) * STATE_LANE_STEP + STATE_MARGIN : boxesH;
  return { nodes, edges, width, height, laneY };
}

/** Onward through the life: a direct stroke, border to border. */
function forwardRoute(from: StateNode, to: StateNode): { points: Point[]; label: Point } {
  const a = borderPoint(from, to.x + to.w / 2, to.y + to.h / 2);
  const b = borderPoint(to, from.x + from.w / 2, from.y + from.h / 2);
  return { points: [a, b], label: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 6 } };
}

/** Staying put: a small loop up out of the top and back in. The gap above a box
 * is always at least STATE_GAP_Y, so the loop never reaches a neighbour. */
function selfRoute(n: StateNode): { points: Point[]; label: Point } {
  const x1 = n.x + n.w * 0.35;
  const x2 = n.x + n.w * 0.65;
  const top = n.y - 16;
  return {
    points: [
      { x: x1, y: n.y },
      { x: x1, y: top },
      { x: x2, y: top },
      { x: x2, y: n.y },
    ],
    label: { x: (x1 + x2) / 2, y: top - 6 },
  };
}

/**
 * A way back: out of the bottom, along a lane under the boxes, and up into the
 * target's bottom - so a return is unmistakable (nothing else arrives from
 * below). Where a box sits directly underneath, the route steps aside into the
 * column gap first: verticals only ever run in a gap or clear of the stack, and
 * the long horizontal only ever runs in the lane, so it crosses nothing.
 */
function returnRoute(
  from: StateNode,
  to: StateNode,
  ly: number,
  covered: Set<string>,
): { points: Point[]; label: Point } {
  const fx = from.x + from.w / 2;
  const tx = to.x + to.w / 2;
  // The gap left of a column is always empty; a return always travels leftward,
  // so stepping aside that way also heads the right direction.
  const gapLeftOf = (n: StateNode) => Math.max(n.x - STATE_GAP_X / 2, STATE_MARGIN / 2);
  const points: Point[] = [{ x: fx, y: from.y + from.h }];
  if (covered.has(from.name)) {
    const gx = gapLeftOf(from);
    points.push({ x: fx, y: from.y + from.h + STATE_STUB });
    points.push({ x: gx, y: from.y + from.h + STATE_STUB });
    points.push({ x: gx, y: ly });
  } else {
    points.push({ x: fx, y: ly });
  }
  if (covered.has(to.name)) {
    const gx = gapLeftOf(to);
    points.push({ x: gx, y: ly });
    points.push({ x: gx, y: to.y + to.h + STATE_STUB });
    points.push({ x: tx, y: to.y + to.h + STATE_STUB });
  } else {
    points.push({ x: tx, y: ly });
  }
  points.push({ x: tx, y: to.y + to.h });
  // The trigger rides the lane - the one run guaranteed clear of every box.
  const lane = points.filter((p) => p.y === ly);
  const x = lane.length > 1 ? (lane[0].x + lane[lane.length - 1].x) / 2 : (fx + tx) / 2;
  return { points, label: { x, y: ly - 5 } };
}

/**
 * The transitions that lead back onto the path they came from - a cancel, a
 * retry. Found by DFS in declared order, rooted at the true starts (nothing
 * leads into them) first, so a lifecycle that loops all the way round still
 * roots at the state the code declares first and reads left-to-right from it.
 */
function backEdges(names: string[], links: StateLink[], selfLoops: Set<number>): Set<number> {
  const out = new Map<string, number[]>();
  const inDeg = new Map<string, number>(names.map((n) => [n, 0]));
  links.forEach((t, i) => {
    if (selfLoops.has(i)) return;
    out.set(t.from, [...(out.get(t.from) ?? []), i]);
    inDeg.set(t.to, (inDeg.get(t.to) ?? 0) + 1);
  });

  const path = new Set<string>();
  const done = new Set<string>();
  const back = new Set<number>();
  const visit = (n: string): void => {
    path.add(n);
    for (const i of out.get(n) ?? []) {
      const to = links[i].to;
      if (path.has(to)) back.add(i);
      else if (!done.has(to)) visit(to);
    }
    path.delete(n);
    done.add(n);
  };
  for (const n of [...names.filter((n) => inDeg.get(n) === 0), ...names])
    if (!done.has(n)) visit(n);
  return back;
}

/** How far along the life each state sits: the longest path into it. */
function lifeDepth(names: string[], dag: StateLink[]): Map<string, number> {
  const into = new Map<string, string[]>();
  for (const e of dag) into.set(e.to, [...(into.get(e.to) ?? []), e.from]);
  const memo = new Map<string, number>();
  const depth = (n: string, seen: Set<string>): number => {
    const hit = memo.get(n);
    if (hit !== undefined) return hit;
    if (seen.has(n)) return 0; // unreachable once the returns are cut; a guard, not a policy
    seen.add(n);
    let d = 0;
    for (const from of into.get(n) ?? []) d = Math.max(d, depth(from, seen) + 1);
    seen.delete(n);
    memo.set(n, d);
    return d;
  };
  return new Map(names.map((n) => [n, depth(n, new Set())]));
}

/** Where an edge meets a node: the border point on the centre-to-centre line. */
export function borderPoint(
  node: { x: number; y: number; w: number; h: number },
  towardX: number,
  towardY: number,
): { x: number; y: number } {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const dx = towardX - cx;
  const dy = towardY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx !== 0 ? node.w / 2 / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const sy = dy !== 0 ? node.h / 2 / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}
