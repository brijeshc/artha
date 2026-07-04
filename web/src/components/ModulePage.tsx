import type { ModuleDetail, ModuleFact } from '../api';
import { MODULE_PAGE } from '../copy';
import { type CapabilityEntry, shortName } from '../derive';
import { routeHref } from '../router';
import { CapCard } from './CapCard';
import { CertifyButton, type Curation } from './Curate';
import { KindTag, SectionHead, StatusBadge } from './Status';

/**
 * The engineer lens (16c): "I'm about to touch this module - what governs it
 * and why?" Everything certified about one module: the capabilities built on
 * it, the invariants/conventions in scope (their actual rule text, not just
 * names), and the decisions behind it, each with standing and the symbols it
 * pins. A dark module says so plainly and points at the queue.
 */
export function ModulePage({
  detail,
  capabilityOf,
  curation,
}: {
  detail: ModuleDetail;
  /** Resolve a concept/flow ModuleFact into a card entry (from the catalog). */
  capabilityOf: (fact: ModuleFact) => CapabilityEntry | null;
  curation: Curation;
}): JSX.Element {
  const caps = [...detail.concepts, ...detail.flows];
  const bucketWord =
    detail.certifiedFacts === 0
      ? 'dark zone'
      : detail.certifiedFacts === 1
        ? 'thin'
        : detail.certifiedFacts <= 3
          ? 'partial'
          : 'understood';
  const empty = caps.length === 0 && detail.rules.length === 0 && detail.decisions.length === 0;

  return (
    <div className="page module-page">
      <header className="page-head">
        <p className="page-kind">module</p>
        <h2 className="page-title mono">{shortName(detail.module)}</h2>
        <p className="page-sub mono">{detail.module}</p>
        <p className="page-meta">
          <span
            className={`standing standing-${detail.certifiedFacts === 0 ? 'dark' : bucketWord}`}
          >
            {bucketWord}
          </span>
          {detail.areas
            .filter((a) => a !== detail.module)
            .map((a) => (
              <a key={a} className="page-area-link" href={routeHref({ view: 'atlas', area: a })}>
                {a}
              </a>
            ))}
        </p>
        <dl className="page-stats">
          <PageStat label="churn / 90d" value={String(detail.churn)} />
          <PageStat label="certified" value={String(detail.certifiedFacts)} />
          <PageStat label="stale" value={String(detail.staleFacts)} />
          {detail.queueRank !== null && detail.dark && (
            <PageStat label="queue position" value={`#${detail.queueRank}`} />
          )}
        </dl>
      </header>

      {empty ? (
        <div className="module-dark-empty">
          <p>{MODULE_PAGE.darkEmpty}</p>
          <a className="inspector-cta" href="#/queue">
            {MODULE_PAGE.darkCta} →
          </a>
        </div>
      ) : (
        <>
          {caps.length > 0 && (
            <section className="module-section">
              <SectionHead
                n="01"
                title={MODULE_PAGE.capabilities}
                gloss={MODULE_PAGE.capabilitiesGloss}
              />
              <div className="catalog-grid">
                {caps.map((f) => {
                  const entry = capabilityOf(f);
                  return entry ? <CapCard key={f.id} entry={entry} /> : null;
                })}
              </div>
            </section>
          )}

          {detail.rules.length > 0 && (
            <section className="module-section">
              <SectionHead
                n={String(1 + (caps.length > 0 ? 1 : 0)).padStart(2, '0')}
                title={MODULE_PAGE.rules}
                gloss={MODULE_PAGE.rulesGloss}
              />
              <ul className="rule-list">
                {detail.rules.map((f) => (
                  <RuleItem key={f.id} fact={f} curation={curation} />
                ))}
              </ul>
            </section>
          )}

          {detail.decisions.length > 0 && (
            <section className="module-section">
              <SectionHead
                n={String(
                  1 + (caps.length > 0 ? 1 : 0) + (detail.rules.length > 0 ? 1 : 0),
                ).padStart(2, '0')}
                title={MODULE_PAGE.decisions}
                gloss={MODULE_PAGE.decisionsGloss}
              />
              <ul className="rule-list">
                {detail.decisions.map((f) => (
                  <RuleItem key={f.id} fact={f} curation={curation} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** A rule/decision with its full text, the symbols it pins here, and - when it
 * isn't certified yet - the engineer-lens certify action. */
function RuleItem({ fact, curation }: { fact: ModuleFact; curation: Curation }): JSX.Element {
  return (
    <li className="rule-item">
      <div className="rule-head">
        <KindTag kind={fact.kind} />
        <span className="rule-name">{fact.name ?? fact.id}</span>
        <StatusBadge status={fact.status} />
        <CertifyButton id={fact.id} status={fact.status} curation={curation} />
      </div>
      {fact.body && <p className="rule-body">{fact.body}</p>}
      <div className="rule-joins">
        {fact.symbols.map((s) => (
          <code key={s} className={fact.stalePins > 0 ? 'pin-chip stale' : 'pin-chip'}>
            {s}
          </code>
        ))}
        {fact.viaScope && <span className="via-scope">in scope</span>}
        {fact.stalePins > 0 && (
          <span className="standing standing-stale">
            {fact.stalePins} stale pin{fact.stalePins > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </li>
  );
}

function PageStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="page-stat">
      <dd className="page-stat-value mono">{value}</dd>
      <dt className="page-stat-label">{label}</dt>
    </div>
  );
}
