import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { type MapFeed, type SearchHit, getSearch } from '../api';
import { MISC } from '../copy';
import type { Route } from '../router';
import { StatusBadge } from './Status';

/**
 * The command bar - a ⌘K overlay that is the dashboard's find-anything line.
 * Owns its own query + debounced /api/search fetch; matches module names
 * locally off the map feed. Results are grouped: modules (→ module page),
 * capabilities (→ their pages), and other certified facts (context, inert
 * until they get their own page). Degrades to empty offline.
 */
export interface CommandBarProps {
  open: boolean;
  feed: MapFeed;
  onClose: () => void;
  /** Navigate to a route (App owns the hash), then close. */
  onGo: (route: Route) => void;
}

export function CommandBar({ open, feed, onClose, onGo }: CommandBarProps): JSX.Element | null {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Debounced fact search (semantic + lexical, server-side); empty on failure.
  useEffect(() => {
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

  if (!open) return null;

  const capabilities = results.filter((h) => h.kind === 'concept' || h.kind === 'flow');
  const others = results.filter((h) => h.kind !== 'concept' && h.kind !== 'flow');
  const nothing = q !== '' && moduleHits.length === 0 && results.length === 0;

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
          placeholder={MISC.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {q === '' ? (
          <p className="cmdk-hint">{MISC.searchHint}</p>
        ) : nothing ? (
          <p className="cmdk-hint">No match for “{query.trim()}”.</p>
        ) : (
          <div className="cmdk-results">
            {moduleHits.length > 0 && (
              <Group label="Modules">
                {moduleHits.map((m) => (
                  <Hit key={m} onGo={() => onGo({ view: 'module', id: m })}>
                    <span className="hit-kind">module</span>
                    <span className="hit-name mono">{m}</span>
                    <span className="hit-go">open →</span>
                  </Hit>
                ))}
              </Group>
            )}
            {capabilities.length > 0 && (
              <Group label="Capabilities">
                {capabilities.map((h) => (
                  <Hit
                    key={h.id}
                    onGo={() => onGo({ view: h.kind as 'concept' | 'flow', id: h.id })}
                  >
                    <span className="hit-kind">{h.kind}</span>
                    <span className="hit-name">{h.heading ?? h.id}</span>
                    <StatusBadge status={h.status} />
                  </Hit>
                ))}
              </Group>
            )}
            {others.length > 0 && (
              <Group label="Rules & decisions">
                {others.map((h) => (
                  <span key={h.id} className="cmdk-hit inert">
                    <span className="hit-kind">{h.kind}</span>
                    <span className="hit-name">{h.heading ?? h.id}</span>
                    <StatusBadge status={h.status} />
                  </span>
                ))}
              </Group>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Hit({ children, onGo }: { children: ReactNode; onGo: () => void }): JSX.Element {
  return (
    <button type="button" className="cmdk-hit" onClick={onGo}>
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
