import { ROUTE } from '../copy';
import type { CapabilityEntry } from '../derive';
import { shortName } from '../derive';
import { routeHref } from '../router';
import { StatusBadge } from './Status';

/**
 * One capability as a glanceable card: kind rule, product name, standing, and
 * the preview that tells you what you'll find inside - a concept shows its
 * state chain, a flow its step coverage. Used by the catalog and module page.
 * `also` (24e) quietly names the other areas a shared capability touches -
 * the card itself renders exactly once.
 */
export function CapCard({
  entry,
  also = [],
}: { entry: CapabilityEntry; also?: string[] }): JSX.Element {
  const { ref, name, status, modules, states, steps } = entry;
  return (
    // The card is one big link, so the trace can't live inside it (an anchor in
    // an anchor is not a thing) - it rides the slot alongside, top-right.
    <span className="cap-card-slot">
      <CardBody entry={entry} also={also} />
      {ref.kind === 'flow' && (
        <a
          className="card-trace"
          href={routeHref({ view: 'atlas', flow: ref.id })}
          title={ROUTE.traceHint}
          aria-label={`${ROUTE.trace}: ${name}`}
        >
          ⤳
        </a>
      )}
    </span>
  );
}

function CardBody({ entry, also }: { entry: CapabilityEntry; also: string[] }): JSX.Element {
  const { ref, name, status, modules, states, steps } = entry;
  return (
    <a className={`cap-card kind-${ref.kind}`} href={routeHref({ view: ref.kind, id: ref.id })}>
      <span className="card-head">
        <span className={`card-kind kind-${ref.kind}`}>{ref.kind}</span>
        <span className="card-name">{name}</span>
        <StatusBadge status={status} />
      </span>

      <span className="card-preview">
        {ref.kind === 'concept' ? (
          states && states.length > 0 ? (
            <span className="state-chain">
              {states.map((s, i) => (
                <span key={s}>
                  {i > 0 && <span className="chain-arrow"> → </span>}
                  <span className="chain-state">{s}</span>
                </span>
              ))}
            </span>
          ) : (
            <span className="card-empty">no states described yet</span>
          )
        ) : steps && steps.total > 0 ? (
          <span className="step-coverage">
            <span className="step-dots" aria-hidden="true">
              {Array.from({ length: steps.total }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: positional dots
                <span key={i} className={i < steps.linked ? 'step-dot linked' : 'step-dot'} />
              ))}
            </span>
            <span className="step-count">
              {steps.linked} of {steps.total} steps linked
            </span>
          </span>
        ) : (
          <span className="card-empty">no steps described yet</span>
        )}
      </span>

      <span className="card-foot mono">
        {modules.length > 0 ? modules.map(shortName).join(' · ') : 'not linked to code'}
      </span>
      {also.length > 0 && <span className="card-also">also in {also.join(' · ')}</span>}
    </a>
  );
}
