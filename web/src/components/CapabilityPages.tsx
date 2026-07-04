import type { ConceptDetail, FlowDetail, PinView } from '../api';
import { DETAIL } from '../copy';
import { shortName } from '../derive';
import { routeHref } from '../router';
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
}: {
  detail: ConceptDetail;
  names: Map<string, string>;
}): JSX.Element {
  const hasStates = detail.states.length > 0;
  return (
    <div className="page capability-page">
      <CapabilityHead kind="concept" detail={detail} />

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

      <PinsSection n="02" title={DETAIL.pinsHead} pins={detail.pins} />
      <RelatedSection n="03" related={detail.related} names={names} />
    </div>
  );
}

export function FlowPage({
  detail,
  names,
}: {
  detail: FlowDetail;
  names: Map<string, string>;
}): JSX.Element {
  const linked = detail.steps.filter((s) => s.pin !== null).length;
  const total = detail.steps.length;
  return (
    <div className="page capability-page">
      <CapabilityHead kind="flow" detail={detail} />

      {detail.entry.length > 0 && (
        <PinsSection n="01" title={DETAIL.entryHead} pins={detail.entry} />
      )}

      <section className="cap-section">
        <SectionHead
          n={detail.entry.length > 0 ? '02' : '01'}
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
                    <PinLine pin={s.pin} />
                  ) : (
                    <span className="unlinked">{DETAIL.notLinked}</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <RelatedSection
        n={detail.entry.length > 0 ? '03' : '02'}
        related={detail.related}
        names={names}
      />
    </div>
  );
}

function CapabilityHead({
  kind,
  detail,
}: {
  kind: 'concept' | 'flow';
  detail: ConceptDetail | FlowDetail;
}): JSX.Element {
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
      </p>
    </header>
  );
}

function PinsSection({
  n,
  title,
  pins,
}: { n: string; title: string; pins: PinView[] }): JSX.Element {
  return (
    <section className="cap-section">
      <SectionHead n={n} title={title} />
      {pins.length === 0 ? (
        <p className="empty-note">{DETAIL.noPins}</p>
      ) : (
        <ul className="pins">
          {pins.map((p) => (
            <li key={p.symbol}>
              <PinLine pin={p} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PinLine({ pin }: { pin: PinView }): JSX.Element {
  return (
    <span className={pin.stale ? 'pin stale' : 'pin'}>
      <code>{pin.symbol}</code>
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
