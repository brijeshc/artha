import { type FormEvent, useEffect, useRef, useState } from 'react';
import { type SymbolHit, getSymbols } from '../api';
import { CURATE } from '../copy';

/**
 * Curation primitives (T17): the dashboard as an authoring surface. Each control
 * owns only its local UI state and calls back to the container, which POSTs the
 * write and re-reads - so a certify literally lights the module up on the atlas.
 * Nothing here can certify on its own; certify is always an explicit click.
 */

export interface Curation {
  /** Stamp an entry certified (the one path to `certified`). */
  certify: (id: string) => Promise<void>;
  /** Link an entry to a `path#Symbol` pin. */
  link: (id: string, symbol: string) => Promise<void>;
  /** Upsert an entry's fields (merged; the edit un-certifies). */
  edit: (patch: { id: string } & Record<string, unknown>) => Promise<void>;
}

/** The "vouch for this" action - hidden once an entry is already certified. */
export function CertifyButton({
  id,
  status,
  curation,
}: {
  id: string;
  status: string;
  curation: Curation;
}): JSX.Element | null {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (status === 'certified') return null;

  const onClick = async (): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      await curation.certify(id);
    } catch (e) {
      setError(errText(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <span className="curate-action">
      <button
        type="button"
        className="btn btn-certify"
        onClick={onClick}
        disabled={pending}
        title={CURATE.certifyHint}
      >
        {pending ? CURATE.certifying : CURATE.certify}
      </button>
      {error && (
        <span className="curate-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

/** Link code to an entry - a collapsed affordance that opens the symbol picker.
 * You search your codebase by class/function/file name and pick; no path typing. */
export function LinkCode({ id, curation }: { id: string; curation: Curation }): JSX.Element {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost curate-add" onClick={() => setOpen(true)}>
        + {CURATE.link}
      </button>
    );
  }
  return (
    <SymbolPicker id={id} onPick={(ref) => curation.link(id, ref)} onClose={() => setOpen(false)} />
  );
}

/**
 * A search-and-pick typeahead over the repo's resolvable symbols (`/api/symbols`).
 * Type a class, function, or file name; arrow/enter or click to pick; the chosen
 * `path#Symbol` becomes a pin. Debounced, keyboard-navigable, and race-safe.
 */
function SymbolPicker({
  id,
  onPick,
  onClose,
}: {
  id: string;
  onPick: (ref: string) => Promise<void>;
  onClose: () => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SymbolHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = `symbols-${id}`;
  const optionId = (i: number): string => `${listId}-opt-${i}`;

  // Keep the active option visible while arrowing through a scrolled list.
  // biome-ignore lint/correctness/useExhaustiveDependencies: optionId is render-stable for a given id
  useEffect(() => {
    listRef.current
      ?.querySelector(`#${CSS.escape(optionId(active))}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // Debounced, race-safe fetch: only the latest query's results are applied.
  useEffect(() => {
    const q = query.trim();
    if (q === '') {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      getSymbols(q)
        .then((hits) => {
          if (mine === seq.current) {
            setResults(hits);
            setActive(0);
          }
        })
        .catch(() => {
          if (mine === seq.current) setResults([]);
        })
        .finally(() => {
          if (mine === seq.current) setLoading(false);
        });
    }, 140);
    return () => clearTimeout(timer);
  }, [query]);

  const pick = async (ref: string): Promise<void> => {
    setError(null);
    setPending(true);
    try {
      await onPick(ref);
      onClose(); // the re-read shows the new pin in the list above
    } catch (e) {
      setError(errText(e));
      setPending(false);
    }
  };

  return (
    <div className="curate-form symbol-picker">
      <label className="curate-label" htmlFor={`link-${id}`}>
        {CURATE.linkLabel}
      </label>
      <input
        id={`link-${id}`}
        className="curate-input"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-activedescendant={results.length > 0 ? optionId(active) : undefined}
        aria-autocomplete="list"
        placeholder={CURATE.linkPlaceholder}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const hit = results[active];
            if (hit) void pick(hit.ref);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
        // biome-ignore lint/a11y/noAutofocus: opening the picker is an explicit intent to type
        autoFocus
        spellCheck={false}
        autoComplete="off"
        aria-label={CURATE.linkLabel}
      />

      {loading && <p className="curate-note">{CURATE.searching}</p>}
      {!loading && query.trim() !== '' && results.length === 0 && (
        <p className="curate-note">{CURATE.noSymbols}</p>
      )}
      {results.length > 0 && (
        // ARIA combobox pattern: focus stays on the input; the listbox is only
        // pointed at via aria-activedescendant, so it is deliberately not focusable.
        // biome-ignore lint/a11y/useFocusableInteractive: combobox popup, input keeps focus
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a ul of options is the listbox
        // biome-ignore lint/a11y/useSemanticElements: a native <select> cannot render name·kind·path rows
        <ul className="symbol-results" id={listId} ref={listRef} role="listbox">
          {results.map((hit, i) => (
            <li key={hit.ref} role="presentation">
              <button
                type="button"
                // biome-ignore lint/a11y/useSemanticElements: option inside the ARIA combobox popup, not a <select>
                role="option"
                id={optionId(i)}
                aria-selected={i === active}
                tabIndex={-1}
                className={i === active ? 'symbol-hit active' : 'symbol-hit'}
                onMouseEnter={() => setActive(i)}
                // mousedown (not click) fires before the input blur so focus holds
                onMouseDown={(e) => {
                  e.preventDefault();
                  void pick(hit.ref);
                }}
              >
                <span className="sym-name mono">{hit.name}</span>
                <span className="sym-kind">{hit.kind}</span>
                <span className="sym-path mono">{hit.path}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="curate-row">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {CURATE.cancel}
        </button>
        {results.length > 0 && !pending && (
          <span className="curate-note curate-keys">{CURATE.pickerKeys}</span>
        )}
        {pending && <span className="curate-note">{CURATE.linking}</span>}
        {error && (
          <span className="curate-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

/** Edit an entry's name + summary; saving re-validates and returns it to proposed. */
export function EditFields({
  id,
  name,
  summary,
  curation,
}: {
  id: string;
  name: string | null;
  summary: string | null;
  curation: Curation;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(name ?? '');
  const [draftSummary, setDraftSummary] = useState(summary ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          setDraftName(name ?? '');
          setDraftSummary(summary ?? '');
          setError(null);
          setOpen(true);
        }}
      >
        {CURATE.edit}
      </button>
    );
  }

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await curation.edit({ id, name: draftName, summary: draftSummary });
      setOpen(false);
    } catch (err) {
      setError(errText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="curate-edit" onSubmit={submit}>
      <label className="curate-label" htmlFor={`name-${id}`}>
        {CURATE.nameLabel}
      </label>
      <input
        id={`name-${id}`}
        className="curate-input"
        value={draftName}
        onChange={(e) => setDraftName(e.currentTarget.value)}
      />
      <label className="curate-label" htmlFor={`summary-${id}`}>
        {CURATE.summaryLabel}
      </label>
      <textarea
        id={`summary-${id}`}
        className="curate-input curate-textarea"
        rows={3}
        value={draftSummary}
        onChange={(e) => setDraftSummary(e.currentTarget.value)}
      />
      <div className="curate-row">
        <button type="submit" className="btn btn-certify" disabled={pending}>
          {pending ? CURATE.saving : CURATE.save}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          {CURATE.cancel}
        </button>
        <span className="curate-note">{CURATE.editNote}</span>
      </div>
      {error && (
        <p className="curate-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
