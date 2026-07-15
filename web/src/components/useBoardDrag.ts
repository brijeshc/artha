import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hand-dragging for a blackboard: a box drags with pointer capture, its seat
 * persists per browser under `storeKey`, and a drag never counts as a click
 * (so it never navigates or selects). Shared by the module board and the inner
 * file board (23b) - the one source of the drag/persist/tidy behaviour, keyed
 * so each board remembers its own layout. What SSR cannot do lives here; the
 * boards themselves stay pure given their positions.
 *
 * Three layouts can have an opinion about where a box sits, and they answer in
 * this order (23e): **your hand** (dragged here, kept in this browser), then
 * **the team's** (committed to `.artha/board.yaml`, passed in as `base`), then
 * the automatic one. Your drag is yours until you publish it, and tidying
 * forgets only what *you* moved - it drops you back on the team's board, never
 * silently rewrites it.
 */

export type BoardOverrides = Record<string, { x: number; y: number }>;

/** The minimum a draggable box must expose: its id and its current top-left. */
export interface DragTarget {
  id: string;
  x: number;
  y: number;
}

export interface BoardDrag {
  /** Every seat that overrides the auto layout: the team's, yours on top. */
  overrides: BoardOverrides;
  /** True when *you* have moved something that isn't published yet. */
  hasHandLayout: boolean;
  onPointerDown: (e: React.PointerEvent, target: DragTarget) => void;
  /** True if the last pointer-up ended a drag - call it to swallow the click. */
  suppressNav: () => boolean;
  /** Forget the seats you moved; the team's board (or the auto one) returns. */
  tidy: () => void;
}

function load(storeKey: string): BoardOverrides {
  try {
    const raw = window.localStorage.getItem(storeKey);
    return raw ? (JSON.parse(raw) as BoardOverrides) : {};
  } catch {
    return {};
  }
}

export function useBoardDrag(
  storeKey: string,
  getScale?: () => number,
  /** The team's committed seats, if any - yours layer over these. */
  base?: BoardOverrides,
): BoardDrag {
  const [overrides, setOverrides] = useState<BoardOverrides>(() =>
    typeof window === 'undefined' ? {} : load(storeKey),
  );
  const drag = useRef<{
    id: string;
    pointerX: number;
    pointerY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const justDragged = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent, target: DragTarget) => {
    if (e.button !== 0) return;
    drag.current = {
      id: target.id,
      pointerX: e.clientX,
      pointerY: e.clientY,
      originX: target.x,
      originY: target.y,
      moved: false,
    };
    justDragged.current = false;
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      // Pointer deltas are screen pixels; positions are board units. When the
      // board is zoomed (24c) a screen pixel is 1/scale board units.
      const k = getScale?.() ?? 1;
      const dx = (e.clientX - d.pointerX) / (k > 0 ? k : 1);
      const dy = (e.clientY - d.pointerY) / (k > 0 ? k : 1);
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      justDragged.current = true;
      setOverrides((prev) => ({
        ...prev,
        [d.id]: { x: Math.max(8, d.originX + dx), y: Math.max(8, d.originY + dy) },
      }));
    };
    const onUp = () => {
      const d = drag.current;
      drag.current = null;
      if (!d?.moved) return;
      setOverrides((prev) => {
        try {
          window.localStorage.setItem(storeKey, JSON.stringify(prev));
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
  }, [storeKey, getScale]);

  const suppressNav = useCallback(() => {
    const s = justDragged.current;
    justDragged.current = false;
    return s;
  }, []);

  const tidy = useCallback(() => {
    setOverrides({});
    try {
      window.localStorage.removeItem(storeKey);
    } catch {
      /* nothing to forget */
    }
  }, [storeKey]);

  return {
    overrides: base ? { ...base, ...overrides } : overrides,
    // Only your own unpublished moves count: a board sitting on the team's
    // layout has nothing for *you* to tidy away.
    hasHandLayout: Object.keys(overrides).length > 0,
    onPointerDown,
    suppressNav,
    tidy,
  };
}
