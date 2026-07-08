// Hand-drawn ("chalk") SVG strokes, dependency-free and deterministic: every
// path is seeded by the thing it draws, so a rebuild - and an SSR render test -
// produces byte-identical wobble. The board's whole register is a handmade
// flowchart on a blackboard; these are the chalk.

/** FNV-1a - a stable 32-bit seed from any id. */
export function seedFrom(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 - tiny deterministic PRNG over the seed. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * A chalk line: subdivided every ~26px, interior points nudged off the true
 * line, optional overall bow. Endpoints stay honest so arrows and joins land.
 */
export function roughLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  seed: number,
  opts: { bow?: number; jitter?: number } = {},
): string {
  const { bow = 0, jitter = 1.6 } = opts;
  const rand = rng(seed);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len; // unit perpendicular
  const py = dx / len;
  const n = Math.max(2, Math.min(9, Math.round(len / 26)));

  let d = `M ${r1(x1)} ${r1(y1)}`;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const wobble = i === n ? 0 : (rand() * 2 - 1) * jitter;
    const arc = Math.sin(Math.PI * t) * bow;
    d += ` L ${r1(x1 + dx * t + px * (wobble + arc))} ${r1(y1 + dy * t + py * (wobble + arc))}`;
  }
  return d;
}

/**
 * A chalk rectangle: four rough strokes with slight corner overshoot (a hand
 * never stops exactly at the corner). One path, so it strokes as one mark.
 */
export function roughRect(x: number, y: number, w: number, h: number, seed: number): string {
  const rand = rng(seed);
  const over = () => 1.5 + rand() * 2.5;
  const j = { jitter: 1.3 };
  return [
    roughLine(x - over(), y, x + w + over(), y, seed + 1, j),
    roughLine(x + w, y - over(), x + w, y + h + over(), seed + 2, j),
    roughLine(x + w + over(), y + h, x - over(), y + h, seed + 3, j),
    roughLine(x, y + h + over(), x, y - over(), seed + 4, j),
  ].join(' ');
}

/** A chalk circle: a 14-gon with a jittered radius, closed. */
export function roughCircle(cx: number, cy: number, r: number, seed: number): string {
  const rand = rng(seed);
  const n = 14;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + (rand() * 2 - 1) * 0.07);
    pts.push(`${r1(cx + Math.cos(a) * rr)} ${r1(cy + Math.sin(a) * rr)}`);
  }
  return `M ${pts[0]} L ${pts.slice(1).join(' L ')} Z`;
}

/** A chalk arrowhead: two short strokes at the tip of a line ending (x,y)
 * arriving from direction (fromX,fromY). */
export function roughArrowhead(
  x: number,
  y: number,
  fromX: number,
  fromY: number,
  seed: number,
  size = 9,
): string {
  const dx = x - fromX;
  const dy = y - fromY;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const wing = (side: number, s: number) =>
    roughLine(
      x - ux * size + -uy * side * (size * 0.55),
      y - uy * size + ux * side * (size * 0.55),
      x,
      y,
      s,
      { jitter: 0.8 },
    );
  return `${wing(1, seed + 5)} ${wing(-1, seed + 6)}`;
}
