import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

/**
 * The team's board layout (23e): one hand-arranged blackboard, committed.
 *
 * Dragging a box already sticks per browser (`useBoardDrag`), but that layout
 * dies with the machine it was made on - the person who understands the system
 * arranges it once and nobody else ever sees it. This is the seam that lets
 * them share it: `.artha/board.yaml`, an ordinary git diff, reviewed like any
 * other change and cloned with the repo.
 *
 * Deliberately **not** a fact. It carries no meaning about the code, so it
 * stays out of `artha_facts`, out of the index, and off the build entirely -
 * nothing downstream (MCP, export, the KPIs) can see it. That is also why the
 * write does not ride `commitWrite`: there is no index to rebuild and nothing
 * a bad layout could break, so a rebuild would be theatre. The worst a corrupt
 * file can do is be ignored (see {@link readBoardSeats}).
 */

/** A module's hand-placed top-left corner, in board units. */
export interface Seat {
  x: number;
  y: number;
}

/** module id → where the team agreed it sits. */
export type BoardSeats = Record<string, Seat>;

const FILE = 'board.yaml';

const HEADER = `# The team's board layout - where each module sits on the blackboard.
# Written by the dashboard ("Save for the team"); safe to edit or delete by hand.
# This records arrangement only, never meaning: nothing here reaches the index,
# an agent, or the numbers. Delete the file and the board lays itself out again.
`;

function pathOf(repoRoot: string): string {
  return join(repoRoot, '.artha', FILE);
}

/** A finite number, and nothing else, is a coordinate. */
function seatOf(value: unknown): Seat | null {
  if (typeof value !== 'object' || value === null) return null;
  const { x, y } = value as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  // A negative seat would sit off the paper; the board clamps its own drags to
  // 8, so anything below that was not written by us.
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

/**
 * The committed layout, or `{}` when there isn't one.
 *
 * Never throws: a hand-mangled or half-merged `board.yaml` costs the reader
 * their arrangement, not their dashboard, so a bad file reads as "no layout"
 * and the board lays itself out. Unknown modules are kept rather than dropped -
 * a branch that deletes a module shouldn't quietly rewrite the team's file
 * when someone else saves.
 */
export function readBoardSeats(repoRoot: string): BoardSeats {
  const path = pathOf(repoRoot);
  if (!existsSync(path)) return {};
  try {
    const doc = parseYaml(readFileSync(path, 'utf8')) as unknown;
    const modules = (doc as { modules?: unknown } | null)?.modules;
    if (typeof modules !== 'object' || modules === null) return {};
    const seats: BoardSeats = {};
    for (const [module, value] of Object.entries(modules as Record<string, unknown>)) {
      const seat = seatOf(value);
      if (seat) seats[module] = seat;
    }
    return seats;
  } catch {
    return {};
  }
}

/**
 * Commit a layout. An empty one deletes the file rather than leaving an empty
 * `modules:` behind - "the team has no layout" and "the team has an empty
 * layout" are the same thing, and only one of them is a clean git diff.
 *
 * Module order is sorted and coordinates are rounded, so re-saving an unmoved
 * board produces **no diff at all** - the file is only noise in a review when
 * the arrangement actually changed.
 */
export function writeBoardSeats(repoRoot: string, seats: BoardSeats): void {
  const path = pathOf(repoRoot);
  const clean: BoardSeats = {};
  for (const module of Object.keys(seats).sort()) {
    const seat = seatOf(seats[module]);
    if (seat) clean[module] = { x: Math.round(seat.x), y: Math.round(seat.y) };
  }
  if (Object.keys(clean).length === 0) {
    if (existsSync(path)) unlinkSync(path);
    return;
  }
  mkdirSync(join(repoRoot, '.artha'), { recursive: true });
  writeFileSync(path, `${HEADER}${stringifyYaml({ modules: clean })}`, 'utf8');
}
