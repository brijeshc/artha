import type { ModuleBoardData, ModuleDetail, ModuleFact } from '../api';
import { INFERRED, MODULE_BOARD, MODULE_PAGE, WIRED } from '../copy';
import { type CapabilityEntry, shortName } from '../derive';
import { routeHref } from '../router';
import { CapCard } from './CapCard';
import { CertifyButton, type Curation } from './Curate';
import { ModuleDelta } from './Delta';
import { InferredCard } from './Inferred';
import { ModuleBoardViewport } from './ModuleBoard';
import { CodeProse, KindTag, SectionHead, StatusBadge } from './Status';
import { WiredTo } from './Wired';

/**
 * The engineer lens (16c): "I'm about to touch this module - what governs it
 * and why?" Everything certified about one module: the capabilities built on
 * it, the invariants/conventions in scope (their actual rule text, not just
 * names), and the decisions behind it, each with standing and the symbols it
 * pins. A dark module says so plainly and points at the queue.
 */
export function ModulePage({
  detail,
  board,
  selectedFile = null,
  capabilityOf,
  curation,
}: {
  detail: ModuleDetail;
  /** The module's inner board (23b) - its files + imports; null until loaded. */
  board?: ModuleBoardData | null;
  /** The file selected on the inner board (from the URL), or null. */
  selectedFile?: string | null;
  /** Resolve a concept/flow ModuleFact into a card entry (from the catalog). */
  capabilityOf: (fact: ModuleFact) => CapabilityEntry | null;
  curation: Curation;
}): JSX.Element {
  const caps = [...detail.concepts, ...detail.flows];
  const card = detail.card ?? null;
  // Concepts + flows are both moonlight *capabilities*; conventions are rules.
  const inferredCaps = [...(detail.inferredConcepts ?? []), ...(detail.inferredFlows ?? [])];
  const inferredConventions = detail.inferredConventions ?? [];
  const hasCertified = caps.length > 0 || detail.rules.length > 0 || detail.decisions.length > 0;
  const hasInferred = card !== null || inferredCaps.length > 0 || inferredConventions.length > 0;
  const hasWired = detail.dependsOn.length > 0 || detail.usedBy.length > 0;
  // The three-light ladder is the only visible standing (24a); depth reads as a
  // plain number in the stats row, and stale rides as a modifier chip.
  const standing =
    detail.certifiedFacts > 0 ? 'vouched' : hasInferred ? 'described' : 'unexplained';

  // Section numbers run in render order across both certified and machine-
  // described sections, so the reading index stays continuous whatever exists.
  let section = 0;
  const no = (): string => String(++section).padStart(2, '0');

  return (
    <div className="page module-page">
      <header className="page-head">
        <p className="page-kind">module</p>
        <h2 className="page-title mono">{shortName(detail.module)}</h2>
        <p className="page-sub mono">{detail.module}</p>
        <p className="page-meta">
          <span className={`standing standing-${standing}`}>{standing}</span>
          {detail.staleFacts > 0 && <span className="standing standing-stale">stale</span>}
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
          <PageStat label="facts vouched" value={String(detail.certifiedFacts)} />
          <PageStat label="stale" value={String(detail.staleFacts)} />
          {detail.queueRank !== null && detail.dark && (
            <PageStat label="queue position" value={`#${detail.queueRank}`} />
          )}
        </dl>
      </header>

      {/* Moonlight lead: a machine-read description so the page is never blank,
          even before a single fact is vouched (21a). */}
      {card?.summary && (
        <p className="module-lead moon-prose" aria-label={INFERRED.moduleCardHead}>
          <CodeProse text={card.summary} />
        </p>
      )}

      {/* The delta band (D6): the human-ink counterpart to the machine lead - what
          the code can't say. A module is not an entry, so it points at the why
          (decisions + invariants) rather than editing a field. Skipped only on a
          pure cold module, which the dark-empty funnel below already speaks to. */}
      {(hasCertified || hasInferred) && (
        <ModuleDelta whyCount={detail.decisions.length + detail.rules.length} />
      )}

      {/* The descent: the module drawn as its own blackboard of files, so a
          newcomer reads the structure before any wall of text (23b). */}
      {board && board.files.length > 0 && (
        <section className="module-section">
          <SectionHead n={no()} title={MODULE_BOARD.head} gloss={MODULE_BOARD.gloss} />
          <ModuleBoardViewport data={board} selectedFile={selectedFile} />
        </section>
      )}

      {!hasCertified && !hasInferred && (
        <div className="module-dark-empty">
          <p>{MODULE_PAGE.darkEmpty}</p>
          <a className="inspector-cta" href="#/queue">
            {MODULE_PAGE.darkCta} →
          </a>
        </div>
      )}

      {caps.length > 0 && (
        <section className="module-section">
          <SectionHead
            n={no()}
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

      {inferredCaps.length > 0 && (
        <section className="module-section">
          <SectionHead
            n={no()}
            title={INFERRED.inferredCapsHead}
            gloss={INFERRED.inferredCapsGloss}
          />
          <div className="catalog-grid">
            {inferredCaps.map((c) => (
              <InferredCard key={c.id} item={c} />
            ))}
          </div>
        </section>
      )}

      {inferredConventions.length > 0 && (
        <section className="module-section">
          <SectionHead
            n={no()}
            title={INFERRED.conventionsHead}
            gloss={INFERRED.conventionsGloss}
          />
          <div className="catalog-grid">
            {inferredConventions.map((c) => (
              <InferredCard key={c.id} item={c} />
            ))}
          </div>
        </section>
      )}

      {detail.rules.length > 0 && (
        <section className="module-section">
          <SectionHead n={no()} title={MODULE_PAGE.rules} gloss={MODULE_PAGE.rulesGloss} />
          <ul className="rule-list">
            {detail.rules.map((f) => (
              <RuleItem key={f.id} fact={f} curation={curation} />
            ))}
          </ul>
        </section>
      )}

      {detail.decisions.length > 0 && (
        <section className="module-section">
          <SectionHead n={no()} title={MODULE_PAGE.decisions} gloss={MODULE_PAGE.decisionsGloss} />
          <ul className="rule-list">
            {detail.decisions.map((f) => (
              <RuleItem key={f.id} fact={f} curation={curation} />
            ))}
          </ul>
        </section>
      )}

      {hasWired && (
        <section className="module-section">
          <SectionHead n={no()} title={WIRED.head} gloss={WIRED.gloss} />
          <WiredTo dependsOn={detail.dependsOn} usedBy={detail.usedBy} />
        </section>
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
        {fact.viaScope && (
          <span
            className="via-scope"
            title="This rule’s scope covers the whole module - it applies here without a direct pin."
          >
            applies module-wide
          </span>
        )}
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
