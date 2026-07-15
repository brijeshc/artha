import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { type MapFeed, type SearchHit, getSearch } from '../api';
import { MISC } from '../copy';
import { shortName } from '../derive';
import type { Route } from '../router';
import { StatusBadge } from './Status';

/**
 * The command bar - a ⌘K overlay that is the dashboard's find-anything line.
 * Owns its own query + debounced /api/search fetch; matches module names
 * locally off the map feed. Results are grouped: modules (→ module page),
 * capabilities (→ their pages), and rules/decisions (→ the module they govern,
 * 24d - every hit goes somewhere). ↑↓ walks the flat list, Enter opens the
 * active hit, exactly like the symbol picker. Degrades to empty offline.
 */
export interface CommandBarProps {
  open: boolean;
  feed: MapFeed;
  onClose: () => void;
  /** Navigate to a route (App owns the hash), then close. */
  onGo: (route: Route) => void;
}

/** One navigable row of the flat result list, whatever group it renders in. */
interface Row {
  key: string;
  route: Route;
  group: 'module' | 'capability' | 'rule';
  hit?: SearchHit;
  module?: string;
}

export function CommandBar({ open, feed, onClose, onGo }: CommandBarProps): JSX.Element | null {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced fact search (semantic + lexical, server-side); empty on failure.
  useEffect(() => {
    setActive(0);
    if (query.trim() === '') {
      setResults([]);
      return;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      getSearch(query)
        .then(setResults)
        .catch(() => setResults([]));
    }, 160);
    return () => clearTimeout(timer.current);
  }, [query]);

  const q = query.trim().toLowerCase();
  const moduleHits = useMemo(
    () =>
      q === ''
        ? []
        : feed.modules
            .filter((m) => m.module.toLowerCase().includes(q))
            .map((m) => m.module)
            .slice(0, 6),
    [q, feed.modules],
  );

  // The flat, keyboard-walkable list (24d): modules, then capabilities, then
  // rules/decisions - a rule opens the module it governs, so nothing is inert.
  // Built in *display* order (the groups render in this order), so ↑↓ always
  // moves the highlight the way the eye reads, never in ranking order.
  const rows = useMemo<Row[]>(() => {
    const modules: Row[] = moduleHits.map((m) => ({
      key: `m:${m}`,
      route: { view: 'module', id: m },
      group: 'module',
      module: m,
    }));
    const capabilities: Row[] = [];
    const rules: Row[] = [];
    for (const h of results) {
      if (h.kind === 'concept' || h.kind === 'flow') {
        capabilities.push({
          key: `c:${h.id}`,
          route: { view: h.kind, id: h.id },
          group: 'capability',
          hit: h,
        });
      } else if (h.module) {
        rules.push({
          key: `r:${h.id}`,
          route: { view: 'module', id: h.module },
          group: 'rule',
          hit: h,
          module: h.module,
        });
      }
    }
    return [...modules, ...capabilities, ...rules];
  }, [moduleHits, results]);

  // Keep the active row visible while arrowing through a scrolled list.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `active` names the moment to re-scroll; the effect reads the DOM
  useEffect(() => {
    listRef.current?.querySelector('.cmdk-hit.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  // Rules/decisions the index can't place anywhere stay visible but unlinked -
  // shown after the navigable rows, honest about having no page yet.
  const unplaced = results.filter((h) => h.kind !== 'concept' && h.kind !== 'flow' && !h.module);
  const nothing = q !== '' && rows.length === 0 && unplaced.length === 0;
  const bounded = Math.min(active, Math.max(0, rows.length - 1));

  const groups: Array<{ label: string; items: Row[] }> = [
    { label: 'Modules', items: rows.filter((r) => r.group === 'module') },
    { label: 'Capabilities', items: rows.filter((r) => r.group === 'capability') },
    { label: 'Rules & decisions', items: rows.filter((r) => r.group === 'rule') },
  ];

  return (
    // biome-ignore lint/a11y/useSemanticElements: a transient overlay, not a focus-trapping native <dialog>
    <div className="cmdk-backdrop" role="dialog" aria-modal="true" aria-label="Search">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss; Esc handled globally in App */}
      <div className="cmdk-scrim" onClick={onClose} />
      <div className="cmdk-panel">
        <input
          ref={inputRef}
          type="search"
          className="cmdk-input"
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls="cmdk-list"
          aria-activedescendant={rows.length > 0 ? `cmdk-opt-${bounded}` : undefined}
          aria-autocomplete="list"
          placeholder={MISC.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, rows.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const row = rows[bounded];
              if (row) onGo(row.route);
            }
          }}
        />

        {q === '' ? (
          <p className="cmdk-hint">{MISC.searchHint}</p>
        ) : nothing ? (
          <p className="cmdk-hint">No match for “{query.trim()}”.</p>
        ) : (
          <div className="cmdk-results" id="cmdk-list" ref={listRef}>
            {groups.map(
              (g) =>
                g.items.length > 0 && (
                  <Group label={g.label} key={g.label}>
                    {g.items.map((row) => (
                      <Hit
                        key={row.key}
                        id={`cmdk-opt-${rows.indexOf(row)}`}
                        active={rows.indexOf(row) === bounded}
                        onGo={() => onGo(row.route)}
                        onHover={() => setActive(rows.indexOf(row))}
                      >
                        {row.group === 'module' ? (
                          <>
                            <span className="hit-kind">module</span>
                            <span className="hit-name mono">{row.module}</span>
                            <span className="hit-go">open →</span>
                          </>
                        ) : (
                          <>
                            <span className="hit-kind">{row.hit?.kind}</span>
                            <span className="hit-name">{row.hit?.heading ?? row.hit?.id}</span>
                            {row.group === 'rule' && row.module && (
                              <span className="hit-go mono">{shortName(row.module)}</span>
                            )}
                            <StatusBadge status={row.hit?.status ?? 'proposed'} />
                          </>
                        )}
                      </Hit>
                    ))}
                  </Group>
                ),
            )}
            {unplaced.length > 0 && (
              <Group label="Not yet linked to code">
                {unplaced.map((h) => (
                  <span key={h.id} className="cmdk-hit inert">
                    <span className="hit-kind">{h.kind}</span>
                    <span className="hit-name">{h.heading ?? h.id}</span>
                    <StatusBadge status={h.status} />
                  </span>
                ))}
              </Group>
            )}
            <p className="cmdk-keys mono">↑↓ pick · enter opens · esc closes</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Hit({
  children,
  id,
  active,
  onGo,
  onHover,
}: {
  children: ReactNode;
  id: string;
  active: boolean;
  onGo: () => void;
  onHover: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      id={id}
      className={active ? 'cmdk-hit active' : 'cmdk-hit'}
      onClick={onGo}
      onMouseEnter={onHover}
    >
      {children}
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="cmdk-group">
      <p className="cmdk-group-label">{label}</p>
      {children}
    </div>
  );
}
