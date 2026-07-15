import { type FormEvent, useEffect, useRef, useState } from 'react';
import { type EvidenceView, certify, getEvidence, saveEntry } from '../api';
import { CURATE, EVIDENCE, REVIEW } from '../copy';
import type { ReviewClaim } from '../derive';
import { EvidenceCode } from './Evidence';
import { ConfidenceChip } from './Inferred';
import { CodeProse, KindTag, StatusBadge } from './Status';

/**
 * The review walk (D9, 23d-3): reading a page *is* reviewing it. Press R on any
 * module or capability page and its unvouched claims come up one at a time - the
 * claim on the left in its own light (moonlight for machine-described, a status
 * for proposed), the exact code it was read from on the right - with one keystroke
 * per decision: vouch it (materializes/certifies via the existing write path),
 * correct it in place, or move on. Bounded to the page you are already reading -
 * never a global queue over thousands of machine facts (the contract forbids that
 * tiredness machine). Nothing auto-certifies; every vouch is an explicit key.
 */

type Outcome = 'pending' | 'vouched' | 'corrected';
/** A pin's revealed code, or a loading/gone marker while it resolves. */
type EvState = { ref: string; view: EvidenceView | 'loading' | 'gone' };

export function ReviewWalk({
  claims,
  subject,
  onClose,
  onChanged,
}: {
  claims: ReviewClaim[];
  /** What is being reviewed - a module id or a capability name, for the header. */
  subject: string;
  onClose: () => void;
  /** A write landed; the page behind should re-read so it is current on exit. */
  onChanged: () => void;
}): JSX.Element {
  // Snapshot on mount: a background re-read (onChanged) must never reorder the
  // walk under the reader's feet. The walk owns its own list until it closes.
  const [items] = useState(() => claims);
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>(() => items.map(() => 'pending'));
  const [done, setDone] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<EvState[]>([]);
  // What each vouch actually wrote (an inferred claim materializes into a new
  // id) - the undo path (24f) must un-certify the written entry, not the source.
  const writtenIds = useRef(new Map<number, string>());
  const busy = useRef(false);

  const current = items[index];
  const vouchedCount = outcomes.filter((o) => o === 'vouched').length;

  // Reveal the current claim's backing code (D5) - a fresh fetch per station.
  // A local server answers in ~1ms, so refetching on navigate stays instant and
  // keeps the panel honest if the code moved between passes.
  useEffect(() => {
    if (!current) {
      setEvidence([]);
      return;
    }
    let alive = true;
    setEvidence(current.pins.map((ref) => ({ ref, view: 'loading' as const })));
    current.pins.forEach((ref, i) => {
      getEvidence(ref)
        .then((v) => alive && setEvidence((prev) => replaceAt(prev, i, { ref, view: v })))
        .catch(() => alive && setEvidence((prev) => replaceAt(prev, i, { ref, view: 'gone' })));
    });
    return () => {
      alive = false;
    };
  }, [current]);

  const goNext = (): void => {
    setEditing(false);
    setError(null);
    if (index + 1 >= items.length) setDone(true);
    else setIndex(index + 1);
  };
  const goPrev = (): void => {
    setEditing(false);
    setError(null);
    if (done) setDone(false);
    else setIndex((i) => Math.max(0, i - 1));
  };

  const vouch = async (): Promise<void> => {
    if (!current || busy.current) return;
    busy.current = true;
    setError(null);
    try {
      // certify() routes an `inferred:` id through materialize server-side, so
      // one call vouches both tiers; the walk stays put and advances (unlike the
      // page's certify, which navigates to the freshly-materialized entry).
      const res = await certify(current.id);
      writtenIds.current.set(index, res.id);
      setOutcomes((o) => replaceAt(o, index, 'vouched'));
      onChanged();
      goNext();
    } catch (e) {
      setError(errText(e));
    } finally {
      busy.current = false;
    }
  };

  // Take a vouch back (24f): re-saving the written entry returns it to
  // proposed (the edit path un-certifies) - a wrong keystroke is never final.
  const undo = async (i: number): Promise<void> => {
    const claim = items[i];
    if (!claim || busy.current) return;
    busy.current = true;
    setError(null);
    try {
      const id = writtenIds.current.get(i) ?? claim.id;
      await saveEntry({ id, name: claim.name, summary: claim.prose ?? '' });
      setOutcomes((o) => replaceAt(o, i, 'pending'));
      onChanged();
    } catch (e) {
      setError(errText(e));
    } finally {
      busy.current = false;
    }
  };

  const saveCorrection = async (name: string, summary: string): Promise<void> => {
    if (!current) return;
    await saveEntry({ id: current.id, name, summary });
    setOutcomes((o) => replaceAt(o, index, 'corrected'));
    onChanged();
    goNext();
  };

  // The walk owns the keyboard while open (App yields to it): j/k move, v/Enter
  // vouches, e corrects, Esc leaves. x (flag a disagreement) waits on T22. The
  // handler reads the latest state through a ref so the window listener is bound
  // once, not re-subscribed on every navigation.
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  onKeyRef.current = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    const typing =
      t !== null && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (e.key === 'Escape') {
      e.preventDefault();
      if (editing) setEditing(false);
      else onClose();
      return;
    }
    if (typing) return; // let the correction form keep its keys
    if (done) {
      if (e.key === 'k' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
      return;
    }
    switch (e.key) {
      case 'j':
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        goNext();
        break;
      case 'k':
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        goPrev();
        break;
      case 'Enter':
        // Enter reads as "next" in a j/k walk (24f) - it must never write.
        // Vouching stays on its own explicit key.
        e.preventDefault();
        goNext();
        break;
      case 'v':
        e.preventDefault();
        void vouch();
        break;
      case 'e':
        if (current?.canEdit) {
          e.preventDefault();
          setEditing(true);
        }
        break;
      // 'x' - flag a disagreement - arrives with contradiction detection (T22).
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => onKeyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    // biome-ignore lint/a11y/useSemanticElements: a transient overlay; Esc + focus handled here, not a native <dialog>
    <div className="review-backdrop" role="dialog" aria-modal="true" aria-label={REVIEW.aria}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: scrim dismiss; Esc is handled by the walk's own key listener */}
      <div className="review-scrim" onClick={onClose} />
      <div className="review-panel">
        <header className="review-head">
          <div className="review-head-left">
            <span className="review-kicker">{REVIEW.kicker}</span>
            <span className="review-subject mono">{subject}</span>
          </div>
          <div className="review-progress" aria-label={`${index + 1} of ${items.length}`}>
            <span className="review-dots" aria-hidden="true">
              {items.map((it, i) => (
                <span key={it.id} className={dotClass(outcomes[i] ?? 'pending', i, index, done)} />
              ))}
            </span>
            <span className="review-count mono">
              {Math.min(index + 1, items.length)} / {items.length}
            </span>
          </div>
          <button
            type="button"
            className="review-close"
            onClick={onClose}
            aria-label={REVIEW.close}
          >
            ✕
          </button>
        </header>

        {done || !current ? (
          <DonePanel
            count={items.length}
            vouched={vouchedCount}
            onBack={goPrev}
            onClose={onClose}
          />
        ) : (
          <div className="review-body">
            <section className="review-claim">
              <div className="claim-meta">
                <KindTag kind={current.kind} />
                {current.origin === 'inferred' && current.confidence ? (
                  <ConfidenceChip slug={current.confidence} />
                ) : (
                  <StatusBadge status={current.status ?? 'proposed'} />
                )}
                {outcomes[index] === 'vouched' && (
                  <>
                    <span className="claim-outcome vouched">{REVIEW.vouched}</span>
                    <button
                      type="button"
                      className="btn btn-ghost review-undo"
                      onClick={() => void undo(index)}
                      title={REVIEW.undoHint}
                    >
                      {REVIEW.undo}
                    </button>
                  </>
                )}
                {outcomes[index] === 'corrected' && (
                  <span className="claim-outcome corrected">{REVIEW.corrected}</span>
                )}
              </div>
              <h3 className={current.origin === 'inferred' ? 'claim-name moon' : 'claim-name'}>
                {current.name}
              </h3>
              {current.prose && (
                <p className="claim-prose">
                  <CodeProse text={current.prose} />
                </p>
              )}
              {current.states.length > 0 && <Chain items={current.states} sep=" · " />}
              {current.steps.length > 0 && <Chain items={current.steps} sep=" → " />}

              {editing && (
                <ClaimEditor
                  key={current.id}
                  claim={current}
                  onSave={saveCorrection}
                  onCancel={() => setEditing(false)}
                />
              )}
            </section>

            <section className="review-code">
              <p className="review-code-head">
                <span className="review-code-title">{REVIEW.codeHead}</span>
                <span className="review-code-gloss">{REVIEW.codeGloss}</span>
              </p>
              {current.pins.length === 0 ? (
                <p className="review-note">{REVIEW.noPins}</p>
              ) : (
                <div className="review-ev-list">
                  {evidence.map(({ ref, view }) => (
                    <div className="review-ev" key={ref}>
                      {view === 'loading' && <p className="review-note">{EVIDENCE.loading}</p>}
                      {view === 'gone' && (
                        <p className="review-note evidence-gone">{EVIDENCE.gone}</p>
                      )}
                      {typeof view === 'object' && <EvidenceCode evidence={view} />}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {!done && current && (
          <footer className="review-foot">
            <div className="review-actions">
              <button
                type="button"
                className="btn btn-certify"
                onClick={() => void vouch()}
                title={REVIEW.vouchHint}
              >
                {REVIEW.vouch}
              </button>
              {current.canEdit && !editing && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setEditing(true)}
                  title={REVIEW.editHint}
                >
                  {REVIEW.edit}
                </button>
              )}
              {error && (
                <span className="curate-error" role="alert">
                  {error}
                </span>
              )}
            </div>
            <span className="review-keys mono" title={REVIEW.flagSoon}>
              {REVIEW.keys}
            </span>
          </footer>
        )}
      </div>
    </div>
  );
}

/** The end of the sweep: how much moved, and a way back to the last claim. */
function DonePanel({
  count,
  vouched,
  onBack,
  onClose,
}: {
  count: number;
  vouched: number;
  onBack: () => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <div className="review-done">
      <p className="review-done-title">{REVIEW.doneTitle}</p>
      <p className="review-done-body">
        {vouched > 0 ? REVIEW.done(count, vouched) : REVIEW.doneNone}
      </p>
      <div className="review-done-actions">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          {REVIEW.back}
        </button>
        <button type="button" className="btn btn-certify" onClick={onClose}>
          {REVIEW.closeDone}
        </button>
      </div>
    </div>
  );
}

/** Correct a claim's name/summary in place (D8) - the deeper fix. Saving upserts
 * it as proposed and advances; it reuses the same write path the page's edit does. */
function ClaimEditor({
  claim,
  onSave,
  onCancel,
}: {
  claim: ReviewClaim;
  onSave: (name: string, summary: string) => Promise<void>;
  onCancel: () => void;
}): JSX.Element {
  const [name, setName] = useState(claim.name);
  const [summary, setSummary] = useState(claim.prose ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await onSave(name, summary);
    } catch (err) {
      setError(errText(err));
      setPending(false);
    }
  };

  return (
    <form className="review-edit" onSubmit={submit}>
      <label className="curate-label" htmlFor={`rw-name-${claim.id}`}>
        {CURATE.nameLabel}
      </label>
      <input
        id={`rw-name-${claim.id}`}
        className="curate-input"
        value={name}
        onChange={(e) => setName(e.currentTarget.value)}
        // biome-ignore lint/a11y/noAutofocus: pressing e is an explicit intent to correct now
        autoFocus
      />
      <label className="curate-label" htmlFor={`rw-sum-${claim.id}`}>
        {CURATE.summaryLabel}
      </label>
      <textarea
        id={`rw-sum-${claim.id}`}
        className="curate-input curate-textarea"
        rows={3}
        value={summary}
        onChange={(e) => setSummary(e.currentTarget.value)}
      />
      <div className="curate-row">
        <button type="submit" className="btn btn-certify" disabled={pending}>
          {pending ? CURATE.saving : CURATE.save}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
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

/** An ordered chain of tokens: a concept's states (`a · b`) or a flow's fan-out. */
function Chain({ items, sep }: { items: string[]; sep: string }): JSX.Element {
  return (
    <span className="state-chain moon-chain claim-chain">
      {items.map((s, i) => (
        <span key={`${i}-${s}`}>
          {i > 0 && <span className="chain-arrow">{sep}</span>}
          <span className="chain-state">{s}</span>
        </span>
      ))}
    </span>
  );
}

/** A progress dot's class: filled for a decided claim, hot for the current one. */
function dotClass(outcome: Outcome, i: number, index: number, done: boolean): string {
  const base = 'review-dot';
  if (outcome === 'vouched') return `${base} vouched`;
  if (outcome === 'corrected') return `${base} corrected`;
  if (!done && i === index) return `${base} here`;
  return base;
}

/** Replace one element of an array, returning a new array (immutable update). */
function replaceAt<T>(arr: T[], i: number, value: T): T[] {
  const next = arr.slice();
  next[i] = value;
  return next;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
