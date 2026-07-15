import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readBoardSeats, writeBoardSeats } from '../../src/serve/boardSeats';

/**
 * The team's committed board layout (23e). It is arrangement, not meaning, so
 * the bar is different from an entry's: it must never break the dashboard, and
 * it must produce a git diff a human would be happy to review.
 */

let repo: string;
const file = () => join(repo, '.artha', 'board.yaml');

beforeEach(() => {
  repo = join(tmpdir(), `artha-board-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(repo, '.artha'), { recursive: true });
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('board seats', () => {
  it('round-trips a layout through a real YAML file', () => {
    writeBoardSeats(repo, { 'src/billing': { x: 72, y: 336 }, 'src/auth': { x: 8, y: 12 } });
    expect(readBoardSeats(repo)).toEqual({
      'src/billing': { x: 72, y: 336 },
      'src/auth': { x: 8, y: 12 },
    });
  });

  it('has no layout before anyone commits one', () => {
    expect(readBoardSeats(repo)).toEqual({});
  });

  it('writes a diff a reviewer would accept: sorted, rounded, self-explaining', () => {
    writeBoardSeats(repo, { 'src/zed': { x: 1.4, y: 2.6 }, 'src/abc': { x: 10, y: 20 } });
    const text = readFileSync(file(), 'utf8');
    expect(text.indexOf('src/abc')).toBeLessThan(text.indexOf('src/zed')); // sorted
    expect(text).toContain('x: 1'); // rounded, not 1.4000000001
    expect(text).toContain('y: 3');
    expect(text).toContain('#'); // the file says what it is and how to be rid of it
  });

  it('re-saving an unmoved board writes byte-identical YAML (no noise in review)', () => {
    const seats = { 'src/b': { x: 5, y: 6 }, 'src/a': { x: 1, y: 2 } };
    writeBoardSeats(repo, seats);
    const first = readFileSync(file(), 'utf8');
    writeBoardSeats(repo, { 'src/a': { x: 1, y: 2 }, 'src/b': { x: 5, y: 6 } }); // other order
    expect(readFileSync(file(), 'utf8')).toBe(first);
  });

  it('an empty layout deletes the file rather than committing an empty one', () => {
    writeBoardSeats(repo, { 'src/a': { x: 1, y: 2 } });
    expect(existsSync(file())).toBe(true);
    writeBoardSeats(repo, {});
    expect(existsSync(file())).toBe(false);
    expect(readBoardSeats(repo)).toEqual({});
  });

  it('a mangled file costs the reader their arrangement, never their dashboard', () => {
    writeFileSync(file(), 'modules: [this is not\n  a: map', 'utf8');
    expect(readBoardSeats(repo)).toEqual({}); // reads as "no layout", never throws
  });

  it('drops a seat that is not a pair of real coordinates', () => {
    writeFileSync(
      file(),
      'modules:\n  src/ok: { x: 1, y: 2 }\n  src/bad: { x: "left", y: 2 }\n  src/half: { x: 3 }\n  src/nan: { x: .nan, y: 1 }\n',
      'utf8',
    );
    expect(readBoardSeats(repo)).toEqual({ 'src/ok': { x: 1, y: 2 } });
  });

  it('never seats a box off the paper', () => {
    writeFileSync(file(), 'modules:\n  src/a: { x: -400, y: -9 }\n', 'utf8');
    expect(readBoardSeats(repo)).toEqual({ 'src/a': { x: 0, y: 0 } });
  });
});
