import { type FormEvent, useState } from 'react';
import { DELTA } from '../copy';
import type { Curation } from './Curate';
import { SectionHead } from './Status';

/**
 * The delta band (D6): human ink over machine print. Every capability/module page
 * carries one visually distinct "what the code can't say" slot - the business
 * rules, constraints, history, and warnings no code can hold. Human-authored
 * sentences render as **human ink**, typographically distinct from the cooler
 * machine prose above them, so the reader can always tell which is which
 * (provenance per field, not per page). Recording the delta is *additive*: it
 * never re-opens a certification - the vouched claim is untouched; this is
 * knowledge layered on top.
 */
export function DeltaBand({
  n,
  surface,
  notes,
  id,
  curation,
}: {
  /** Section number, so the band takes its place in the page's reading index. */
  n: string;
  /** Which invitation to show when empty - a concept/flow/module reads differently. */
  surface: 'concept' | 'flow' | 'module';
  /** The recorded human ink, or null/empty when nothing is written yet. */
  notes: string | null;
  /** The entry id to write to. Omitted on read-only surfaces (e.g. a module). */
  id?: string;
  /** When present, the band is editable in place (additive - never un-certifies). */
  curation?: Curation;
}): JSX.Element {
  const lines = (notes ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const has = lines.length > 0;

  return (
    <section className={has ? 'cap-section delta-band filled' : 'cap-section delta-band'}>
      <SectionHead n={n} title={DELTA.head} />
      {has ? (
        <div className="delta-ink">
          {lines.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ordered human lines, never reordered
            <p key={i} className="delta-line human-ink">
              {line}
            </p>
          ))}
          <p className="delta-attribution">{DELTA.attribution}</p>
        </div>
      ) : (
        <p className="delta-body">{DELTA.invite[surface] ?? DELTA.invite.concept}</p>
      )}
      {id && curation && <DeltaEditor id={id} notes={notes} curation={curation} has={has} />}
    </section>
  );
}

/**
 * The module page's delta band (D6). A module is not an entry, so there is no
 * single `notes` field to edit here - the human "why" lives in the decisions and
 * invariants that govern it. This compact band is the human-ink *counterpart* to
 * the machine lead directly above it: when a why is recorded it says so and the
 * reader knows to read on; when nothing is, it makes the missing delta visible on
 * the page rather than leaving it silently absent.
 */
export function ModuleDelta({ whyCount }: { whyCount: number }): JSX.Element {
  const has = whyCount > 0;
  return (
    <aside className={has ? 'module-delta filled' : 'module-delta'}>
      <p className="module-delta-head">{DELTA.head}</p>
      <p className={has ? 'delta-line human-ink' : 'delta-body'}>
        {has ? DELTA.moduleWhy(whyCount) : DELTA.invite.module}
      </p>
    </aside>
  );
}

/**
 * Author the delta in place. Rides the additive `curation.setNotes` (D6), so
 * saving records human ink beside the machine's reading **without** touching the
 * certification - unlike {@link EditFields}, which corrects the vouched claim and
 * un-certifies. A collapsed affordance until opened, prefilled with the current
 * text so editing is correcting, not composing blank (D8).
 */
function DeltaEditor({
  id,
  notes,
  curation,
  has,
}: {
  id: string;
  notes: string | null;
  curation: Curation;
  has: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(notes ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost delta-add"
        onClick={() => {
          setDraft(notes ?? '');
          setError(null);
          setOpen(true);
        }}
      >
        {has ? DELTA.edit : `+ ${DELTA.add}`}
      </button>
    );
  }

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await curation.setNotes(id, draft);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="curate-edit delta-edit" onSubmit={submit}>
      <textarea
        id={`delta-${id}`}
        className="curate-input curate-textarea delta-textarea"
        rows={4}
        value={draft}
        placeholder={DELTA.placeholder}
        onChange={(e) => setDraft(e.currentTarget.value)}
        aria-label={DELTA.head}
        // biome-ignore lint/a11y/noAutofocus: opening the editor is an explicit intent to write
        autoFocus
      />
      <div className="curate-row">
        <button type="submit" className="btn btn-certify" disabled={pending}>
          {pending ? DELTA.saving : DELTA.save}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          {DELTA.cancel}
        </button>
        <span className="curate-note">{DELTA.note}</span>
      </div>
      {error && (
        <p className="curate-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
