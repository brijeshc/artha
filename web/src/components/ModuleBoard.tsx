import type { ModuleBoardData, ModuleBoardFile } from '../api';
import { type FileBoardNode, borderPoint, fileBoardLayout } from '../board';
import { MODULE_BOARD } from '../copy';
import { roughArrowhead, roughLine, roughRect, seedFrom } from '../rough';
import { routeHref } from '../router';
import { type BoardOverrides, useBoardDrag } from './useBoardDrag';

/**
 * The inner board (23b): a module drilled down to its own files, drawn in the
 * same chalk register as the module board one altitude up. Each file is a box;
 * an intra-module import is an arrow reading "imports"; a box is lit by the
 * meaning pinned into it (phosphor vouched, amber proposed, ember stale, dim
 * grey when nothing is pinned there yet). This is the descent a newcomer takes
 * from the module board toward the code, on a blackboard rather than through a
 * wall of text.
 *
 * Selecting a file lives in the URL (`#/module/…?file=…`), like the atlas
 * selection - so a box is a plain anchor (keyboard-accessible, deep-linkable)
 * and the file card retraces on back. Pure given positions + selection
 * (SSR-testable); `ModuleBoardViewport` below owns only the drag state.
 */

export type FileStanding = 'vouched' | 'proposed' | 'stale' | 'plain';

/** A file's standing = the strongest fact pinned into it (the two-light grammar
 * at file altitude). Nothing pinned → plain chalk, honestly unexplained. */
export function fileStanding(file: ModuleBoardFile): FileStanding {
  const has = (status: string) => file.facts.some((f) => f.status === status);
  if (has('certified')) return 'vouched';
  if (has('proposed')) return 'proposed';
  if (has('stale')) return 'stale';
  return 'plain';
}

/** The href that selects a file's box (or clears it, if already selected). */
function fileHref(module: string, path: string, selected: boolean): string {
  return selected
    ? routeHref({ view: 'module', id: module })
    : routeHref({ view: 'module', id: module, file: path });
}

export interface ModuleBoardProps {
  data: ModuleBoardData;
  /** Hand-dragged seats, path → position; wins over the auto layout. */
  overrides?: BoardOverrides;
  /** The file whose box is lit and whose imports run hot (from the URL). */
  selectedFile?: string | null;
  /** Present only in the interactive viewport - absent in SSR renders. */
  onFilePointerDown?: (e: React.PointerEvent, node: FileBoardNode) => void;
  /** True while (or just after) a drag, so the click doesn't navigate. */
  suppressNav?: () => boolean;
}

export function ModuleBoard(props: ModuleBoardProps): JSX.Element {
  const { data, overrides = {}, selectedFile = null } = props;
  const base = fileBoardLayout(
    data.files.map((f) => f.path),
    data.edges,
  );
  const nodes = base.nodes.map((n) => {
    const o = overrides[n.file];
    return o ? { ...n, x: o.x, y: o.y } : n;
  });
  const byPath = new Map(nodes.map((n) => [n.file, n]));
  const fileByPath = new Map(data.files.map((f) => [f.path, f]));

  // The paper grows with dragged boxes so nothing ever leaves it.
  const width = Math.max(base.width, ...nodes.map((n) => n.x + n.w + 32));
  const height = Math.max(base.height, ...nodes.map((n) => n.y + n.h + 32));

  const edges = data.edges.filter((e) => byPath.has(e.from) && byPath.has(e.to));

  return (
    <svg
      className="fboard"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label={MODULE_BOARD.aria}
    >
      <title>{MODULE_BOARD.aria}</title>

      {edges.map((e) => {
        const a = byPath.get(e.from);
        const b = byPath.get(e.to);
        if (!a || !b) return null;
        const seed = seedFrom(`${e.from}→${e.to}`);
        const p1 = borderPoint(a, b.x + b.w / 2, b.y + b.h / 2);
        const p2 = borderPoint(b, a.x + a.w / 2, a.y + a.h / 2);
        const hot = selectedFile !== null && (e.from === selectedFile || e.to === selectedFile);
        const cls = ['bedge', hot ? 'hot' : '', selectedFile !== null && !hot ? 'faded' : '']
          .filter(Boolean)
          .join(' ');
        return (
          <g key={`${e.from}→${e.to}`} className={cls}>
            <path
              d={`${roughLine(p1.x, p1.y, p2.x, p2.y, seed, { bow: 8 })} ${roughArrowhead(p2.x, p2.y, p1.x, p1.y, seed)}`}
              strokeWidth={1.5}
            />
            <title>{`${short(e.from)} ${MODULE_BOARD.imports} ${short(e.to)}`}</title>
          </g>
        );
      })}

      {nodes.map((n) => {
        const file = fileByPath.get(n.file);
        if (!file) return null;
        const standing = fileStanding(file);
        const selected = selectedFile === n.file;
        const dimmed = selectedFile !== null && !selected;
        const seed = seedFrom(n.file);
        const shown = file.facts.slice(0, 2);
        const extra = file.facts.length - shown.length;
        const cls = [
          'fnode',
          `fnode-${standing}`,
          selected ? 'selected' : '',
          dimmed ? 'dimmed' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <a
            key={n.file}
            className={cls}
            href={fileHref(data.module, n.file, selected)}
            aria-current={selected ? 'true' : undefined}
            onPointerDown={
              props.onFilePointerDown ? (e) => props.onFilePointerDown?.(e, n) : undefined
            }
            onClick={
              props.suppressNav ? (e) => props.suppressNav?.() && e.preventDefault() : undefined
            }
          >
            <title>{fileTitle(file)}</title>
            <path className="bnode-frame" d={roughRect(n.x, n.y, n.w, n.h, seed)} />
            <path className="bnode-frame echo" d={roughRect(n.x, n.y, n.w, n.h, seed + 97)} />
            <text className="fnode-name" x={n.x + 14} y={n.y + 23}>
              {clamp(file.name, 22)}
            </text>
            {shown.map((f, i) => (
              <g key={f.id} className="bcap">
                <circle
                  className={`bcap-dot standing-${f.status}`}
                  cx={n.x + 18}
                  cy={n.y + 40 + i * 17}
                  r={3}
                />
                <text x={n.x + 27} y={n.y + 43 + i * 17}>
                  {clamp(f.name ?? f.id, 20)}
                </text>
              </g>
            ))}
            {file.facts.length === 0 && (
              <text className="fnode-empty" x={n.x + 14} y={n.y + 47}>
                {MODULE_BOARD.plain}
              </text>
            )}
            {extra > 0 && (
              <text className="bnode-more" x={n.x + n.w - 12} y={n.y + n.h - 9}>
                +{extra}
              </text>
            )}
          </a>
        );
      })}
    </svg>
  );
}

/** `src/billing/refund.ts` → `refund.ts` for an edge's tooltip. */
function short(path: string): string {
  return path.split('/').pop() ?? path;
}

function fileTitle(file: ModuleBoardFile): string {
  if (file.facts.length === 0) return `${file.path}\n${MODULE_BOARD.noFacts}`;
  const lines = file.facts.map((f) => `${f.kind}: ${f.name ?? f.id} (${f.status})`);
  return `${file.path}\n${lines.join('\n')}`;
}

/** Chalk fits so many letters; past that the ellipsis is honest. */
function clamp(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

// ── the file card (what meaning lives in the selected file) ─────────────────────

/**
 * The selected file's identity card - answers "what does this file mean" without
 * leaving the board: its pinned facts, each concept/flow linking to its page so
 * the descent from board → file → meaning is one click. Mirrors the RouteCard.
 */
export function FileCard({
  file,
  clearHref,
}: {
  file: ModuleBoardFile;
  clearHref: string;
}): JSX.Element {
  return (
    <aside className="route-card file-card" aria-label={`File: ${file.name}`}>
      <p className="route-kind">{MODULE_BOARD.fileKind}</p>
      <p className="route-name">
        <span className="file-card-name mono">{file.name}</span>
      </p>
      <p className="route-coverage mono">{file.path}</p>
      {file.facts.length === 0 ? (
        <p className="route-empty">{MODULE_BOARD.noFacts}</p>
      ) : (
        <ul className="file-card-facts">
          {file.facts.map((f) => {
            const href =
              f.kind === 'concept'
                ? routeHref({ view: 'concept', id: f.id })
                : f.kind === 'flow'
                  ? routeHref({ view: 'flow', id: f.id })
                  : null;
            return (
              <li key={f.id} className="file-card-fact">
                <span className={`status status-${f.status}`}>
                  <span className="status-dot" aria-hidden="true" />
                </span>
                <span className="file-card-fact-kind mono">{f.kind}</span>
                {href ? (
                  <a href={href}>{f.name ?? f.id}</a>
                ) : (
                  <span className="file-card-fact-name">{f.name ?? f.id}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="route-actions">
        <a className="route-clear" href={clearHref}>
          {MODULE_BOARD.clear}
        </a>
      </p>
    </aside>
  );
}

// ── the interactive viewport ────────────────────────────────────────────────────

/**
 * Owns what SSR cannot: dragging files (positions persist per browser, keyed to
 * this module) and the scroll-panned paper. Selection is routed, so it comes in
 * as `selectedFile` rather than being held here. A bounded panel on the module
 * page, not a full-canvas board.
 */
export function ModuleBoardViewport({
  data,
  selectedFile,
}: {
  data: ModuleBoardData;
  selectedFile: string | null;
}): JSX.Element {
  const { overrides, hasHandLayout, onPointerDown, suppressNav, tidy } = useBoardDrag(
    `artha.moduleboard.${data.module}.v1`,
  );
  const selected = data.files.find((f) => f.path === selectedFile) ?? null;

  return (
    <div className="module-board">
      <div className="board-viewport">
        <ModuleBoard
          data={data}
          overrides={overrides}
          selectedFile={selectedFile}
          onFilePointerDown={(e, node) => onPointerDown(e, { id: node.file, x: node.x, y: node.y })}
          suppressNav={suppressNav}
        />
      </div>
      <p className="board-hint">{MODULE_BOARD.hint}</p>
      {hasHandLayout && (
        <button type="button" className="board-tidy" onClick={tidy} title={MODULE_BOARD.tidyHint}>
          {MODULE_BOARD.tidy}
        </button>
      )}
      {selected && (
        <FileCard file={selected} clearHref={routeHref({ view: 'module', id: data.module })} />
      )}
    </div>
  );
}
