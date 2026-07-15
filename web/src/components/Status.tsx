/**
 * Shared primitives in the instrument register. Status is the trust signal
 * that must sit on every item (Product.md §5.9) - colour is data: certified
 * reads phosphor (trusted light), proposed amber (a candidate), stale ember
 * (re-check me). Unknown standings read muted, never alarming.
 */

export type FactStatus = 'certified' | 'proposed' | 'stale' | string;

/** The stored → public spelling (24a): `certified` is a storage/API word; the
 * one word a reader ever sees for it is **vouched**. */
export function statusWord(status: FactStatus): string {
  return status === 'certified' ? 'vouched' : status;
}

export function StatusBadge({ status }: { status: FactStatus }): JSX.Element {
  const known = status === 'certified' || status === 'proposed' || status === 'stale';
  return (
    <span className={`status status-${known ? status : 'unknown'}`}>
      <span className="status-dot" aria-hidden="true" />
      {statusWord(status)}
    </span>
  );
}

/** A page/section heading with the small mono index that keys the reading order. */
export function SectionHead({
  n,
  title,
  gloss,
  aside,
}: {
  n?: string;
  title: string;
  gloss?: string;
  aside?: JSX.Element;
}): JSX.Element {
  return (
    <div className="section-head">
      <div className="section-head-row">
        <h2>
          {n && <span className="section-no">{n}</span>}
          {title}
        </h2>
        {aside}
      </div>
      {gloss && <p className="gloss">{gloss}</p>}
    </div>
  );
}

/** The kind of a fact as a small tag - concept/flow/invariant/convention/decision. */
export function KindTag({ kind }: { kind: string }): JSX.Element {
  return <span className={`kind-tag kind-${kind}`}>{kind}</span>;
}

/** Machine prose with `code spans` rendered as real code (24g) - the summaries
 * cite symbol names, and literal backticks read as a rendering bug. */
export function CodeProse({ text }: { text: string }): JSX.Element {
  const parts = text.split(/`([^`]+)`/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional segments of one string
          <code key={i}>{part}</code>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional segments of one string
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
