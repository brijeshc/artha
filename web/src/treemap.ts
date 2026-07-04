// Squarified treemap layout (Bruls, Huizing & van Wijk) - pure geometry, no
// rendering. The atlas needs tiles whose *area* is proportional to churn and
// whose aspect ratio stays near 1 so labels fit; this is the standard algorithm
// for exactly that. Deterministic: input order is normalized before layout.

export interface TreemapItem {
  key: string;
  /** Must be > 0 - callers floor their values (a zero-churn module still exists). */
  value: number;
}

export interface TreemapRect {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Free {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Lay `items` into the rectangle so each item's area ∝ its value. Items are
 * sorted descending (ties by key) - squarify's aspect-ratio guarantee assumes
 * it, and it makes the layout stable run-to-run.
 */
export function treemap(
  items: TreemapItem[],
  x: number,
  y: number,
  w: number,
  h: number,
): TreemapRect[] {
  const sorted = items
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
  if (sorted.length === 0 || w <= 0 || h <= 0) return [];

  const total = sorted.reduce((t, i) => t + i.value, 0);
  const scale = (w * h) / total;
  const areas = sorted.map((i) => ({ key: i.key, area: i.value * scale }));

  const out: TreemapRect[] = [];
  const free: Free = { x, y, w, h };
  let row: Array<{ key: string; area: number }> = [];

  for (const item of areas) {
    const side = Math.min(free.w, free.h);
    if (row.length === 0 || worst(row, side) >= worst([...row, item], side)) {
      row.push(item); // keeps (or improves) the row's worst aspect ratio
    } else {
      layoutRow(row, free, out);
      row = [item];
    }
  }
  if (row.length > 0) layoutRow(row, free, out);
  return out;
}

/** The worst aspect ratio a row would have at the given side length. */
function worst(row: Array<{ area: number }>, side: number): number {
  let sum = 0;
  let max = 0;
  let min = Number.POSITIVE_INFINITY;
  for (const r of row) {
    sum += r.area;
    if (r.area > max) max = r.area;
    if (r.area < min) min = r.area;
  }
  if (sum === 0 || side === 0) return Number.POSITIVE_INFINITY;
  const s2 = sum * sum;
  const l2 = side * side;
  return Math.max((l2 * max) / s2, s2 / (l2 * min));
}

/** Fix a finished row along the shorter side of the free rect, then shrink it. */
function layoutRow(
  row: Array<{ key: string; area: number }>,
  free: Free,
  out: TreemapRect[],
): void {
  const sum = row.reduce((t, r) => t + r.area, 0);
  if (sum <= 0) return;

  if (free.w >= free.h) {
    // vertical strip on the left
    const stripW = sum / free.h;
    let cy = free.y;
    for (const r of row) {
      const rh = r.area / stripW;
      out.push({ key: r.key, x: free.x, y: cy, w: stripW, h: rh });
      cy += rh;
    }
    free.x += stripW;
    free.w -= stripW;
  } else {
    // horizontal strip on top
    const stripH = sum / free.w;
    let cx = free.x;
    for (const r of row) {
      const rw = r.area / stripH;
      out.push({ key: r.key, x: cx, y: free.y, w: rw, h: stripH });
      cx += rw;
    }
    free.y += stripH;
    free.h -= stripH;
  }
}
