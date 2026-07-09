import type { ConceptDetail, FlowDetail, PinView, Suggestion } from '../api';
import { CURATE, DETAIL, ROUTE } from '../copy';
import { moduleOfPath, shortName } from '../derive';
import { routeHref } from '../router';
import { CertifyButton, type Curation, EditFields, LinkCode, SuggestedCode } from './Curate';
import { EvidenceReveal } from './Evidence';
import { StateMachine } from './StateMachine';
import { KindTag, SectionHead, StatusBadge } from './Status';

/**
 * Capability pages. The load-bearing requirement is that a reader who has
 * never seen the code can describe the capability from this page alone: a
 * concept leads with its state machine *drawn*, a flow with an honest ladder
 * of steps - a hollow rung is a step nobody has linked to code yet. Standing
 * sits on every item.
 */

export function ConceptPage({
  detail,
  names,
  curation,
  suggestions = [],
}: {
  detail: ConceptDetail;
  names: Map<string, string>;
  curation: Curation;
  /** Machine-proposed pins for this concept (T17b). */
  suggestions?: Suggestion[];
}): JSX.Element {
  const hasStates = detail.states.length > 0;
  return (
    <div className="page capability-page">
      <CapabilityHead kind="concept" detail={detail} curation={curation} />

      <section className="cap-section">
        <SectionHead
          n="01"
          title={DETAIL.statesHead}
          gloss={hasStates ? DETAIL.conceptLede : undefined}
        />
        {hasStates ? (
          <>
            <StateMachine states={detail.states} transitions={detail.transitions} />
            <table className="data-table states-table">
              <thead>
                <tr>
                  <th>State</th>
                  <th>What it means</th>
                  <th>Must always hold</th>
                </tr>
              </thead>
              <tbody>
                {detail.states.map((s) => (
                  <tr key={s.name}>
                    <td className="mono state-name">{s.name}</td>
                    <td>{s.effect ?? <span className="dim">-</span>}</td>
                    <td>{s.invariant ?? <span className="dim">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="empty-note">{DETAIL.noStates}</p>
        )}
      </section>

      <PinsSection
        n="02"
        title={DETAIL.pinsHead}
        pins={detail.pins}
        modules={detail.modules}
        linkTo={{ id: detail.id, curation, suggestions }}
      />
      <RelatedSection n="03" related={detail.related} names={names} />
    </div>
  );
}

export function FlowPage({
  detail,
  names,
  curation,
  suggestions = [],
}: {
  detail: FlowDetail;
  names: Map<string, string>;
  curation: Curation;
  /** Machine-proposed pins for this flow (T17b) - the fan-out of its entry point. */
  suggestions?: Suggestion[];
}): JSX.Element {
  const linked = detail.steps.filter((s) => s.pin !== null).length;
  const total = detail.steps.length;
  return (
    <div className="page capability-page">
      <CapabilityHead kind="flow" detail={detail} curation={curation} />

      {/* Always shown: a flow's entry pins are where you link its first symbol. */}
      <PinsSection
        n="01"
        title={DETAIL.entryHead}
        pins={detail.entry}
        modules={detail.modules}
        linkTo={{ id: detail.id, curation, suggestions }}
      />

      <section className="cap-section">
        <SectionHead
          n="02"
          title={DETAIL.stepsHead}
          gloss={total > 0 ? DETAIL.flowLede : undefined}
          aside={
            total > 0 ? (
              <span className="ladder-count mono" aria-label={`${linked} of ${total} steps linked`}>
                {linked}/{total} linked
              </span>
            ) : undefined
          }
        />
        {total === 0 ? (
          <p className="empty-note">{DETAIL.noSteps}</p>
        ) : (
          <ol className="ladder">
            {detail.steps.map((s, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: ordered, never-reordered steps
              <li key={i} className={s.pin ? 'rung linked' : 'rung'}>
                <span className="rung-mark" aria-hidden="true" />
                <div className="rung-body">
                  <p className="rung-text">
                    {s.on && <span className="rung-on">on {s.on} - </span>}
                    {s.do}
                  </p>
                  {s.pin ? (
                    <PinLine pin={s.pin} modules={detail.modules} />
                  ) : (
                    <span className="unlinked">{DETAIL.notLinked}</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <RelatedSection n="03" related={detail.related} names={names} />
    </div>
  );
}

function CapabilityHead({
  kind,
  detail,
  curation,
}: {
  kind: 'concept' | 'flow';
  detail: ConceptDetail | FlowDetail;
  curation: Curation;
}): JSX.Element {
  // A flow can be read *as terrain*: trace it station-by-station on the atlas.
  const traceHref = kind === 'flow' ? routeHref({ view: 'atlas', flow: detail.id }) : null;
  return (
    <header className="page-head">
      <p className="page-kind">{kind}</p>
      <h2 className="page-title">{detail.name ?? detail.id}</h2>
      <p className="page-sub mono">{detail.id}</p>
      {detail.summary && <p className="page-summary">{detail.summary}</p>}
      <p className="page-meta">
        <StatusBadge status={detail.status} />
        <span className="meta-sep">·</span>
        {detail.certifiedBy ? (
          <span>
            certified by {detail.certifiedBy}
            {detail.certifiedAt ? ` on ${detail.certifiedAt}` : ''}
          </span>
        ) : (
          <span>not yet certified by a human</span>
        )}
        {detail.modules.length > 0 && (
          <>
            <span className="meta-sep">·</span>
            {detail.modules.map((m) => (
              <a key={m} className="module-chip mono" href={routeHref({ view: 'module', id: m })}>
                {shortName(m)}
              </a>
            ))}
          </>
        )}
        {traceHref && (
          <>
            <span className="meta-sep">·</span>
            <a className="trace-link" href={traceHref} title={ROUTE.traceHint}>
              {ROUTE.trace} →
            </a>
          </>
        )}
      </p>
      <div className="curate-bar">
        <CertifyButton id={detail.id} status={detail.status} curation={curation} />
        <EditFields
          id={detail.id}
          name={detail.name}
          summary={detail.summary}
          curation={curation}
        />
      </div>
    </header>
  );
}

function PinsSection({
  n,
  title,
  pins,
  modules,
  linkTo,
}: {
  n: string;
  title: string;
  pins: PinView[];
  /** The modules this capability touches - lets each pin open its engineer lens. */
  modules: string[];
  /** When present, render the link affordance + suggestions under the list. */
  linkTo?: { id: string; curation: Curation; suggestions?: Suggestion[] };
}): JSX.Element {
  return (
    <section className="cap-section">
      <SectionHead n={n} title={title} />
      {pins.length === 0 ? (
        <p className="empty-note">{DETAIL.noPins}</p>
      ) : (
        <ul className="pins">
          {pins.map((p) => (
            <li key={p.symbol}>
              <PinLine pin={p} modules={modules} />
            </li>
          ))}
        </ul>
      )}
      {linkTo && (
        <>
          <SuggestedCode
            id={linkTo.id}
            suggestions={linkTo.suggestions ?? []}
            curation={linkTo.curation}
          />
          <LinkCode id={linkTo.id} curation={linkTo.curation} />
        </>
      )}
    </section>
  );
}

/** A pinned `path#Symbol`. When the path falls inside a known module, the pin
 * links to that module's page - product meaning to engineer lens in one step -
 * and reveals the exact source it points at on click (D5). */
function PinLine({ pin, modules }: { pin: PinView; modules: string[] }): JSX.Element {
  const module = moduleOfPath(pin.symbol.split('#')[0] ?? '', modules);
  const code = <code>{pin.symbol}</code>;
  const face = module ? (
    <a
      className="pin-link"
      href={routeHref({ view: 'module', id: module })}
      title={CURATE.openModuleHint}
    >
      {code}
    </a>
  ) : (
    code
  );
  return (
    <span className={pin.stale ? 'pin stale' : 'pin'}>
      <EvidenceReveal refId={pin.symbol}>{face}</EvidenceReveal>
      <span className={`status status-${pin.stale ? 'stale' : 'certified'}`}>
        <span className="status-dot" aria-hidden="true" />
        {pin.stale ? 'stale' : 'linked'}
      </span>
    </span>
  );
}

function RelatedSection({
  n,
  related,
  names,
}: {
  n: string;
  related: string[];
  names: Map<string, string>;
}): JSX.Element | null {
  if (related.length === 0) return null;
  return (
    <section className="cap-section">
      <SectionHead n={n} title={DETAIL.relatedHead} gloss={DETAIL.relatedGloss} />
      <ul className="related-list">
        {related.map((id) => {
          const kind = id.split('.')[0] ?? 'fact';
          const openable = kind === 'concept' || kind === 'flow';
          if (!openable) {
            return (
              <li key={id} className="related-item">
                <KindTag kind={kind} />
                <span className="mono dim">{id}</span>
              </li>
            );
          }
          return (
            <li key={id} className="related-item">
              <KindTag kind={kind} />
              <a
                className="related-link"
                href={routeHref({ view: kind as 'concept' | 'flow', id })}
              >
                {names.get(id) ?? id}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
