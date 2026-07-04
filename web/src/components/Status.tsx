/**
 * Shared primitives in the instrument register. Status is the trust signal
 * that must sit on every item (Product.md §5.9) - colour is data: certified
 * reads phosphor (trusted light), proposed amber (a candidate), stale ember
 * (re-check me). Unknown standings read muted, never alarming.
 */

export type FactStatus = 'certified' | 'proposed' | 'stale' | string;

export function StatusBadge({ status }: { status: FactStatus }): JSX.Element {
  const known = status === 'certified' || status === 'proposed' || status === 'stale';
  return (
    <span className={`status status-${known ? status : 'unknown'}`}>
      <span className="status-dot" aria-hidden="true" />
      {status}
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
