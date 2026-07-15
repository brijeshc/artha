import type { ValueRanked } from '../api';
import { QUEUE } from '../copy';
import { whyNow } from '../derive';
import { routeHref } from '../router';
import { SectionHead } from './Status';

/**
 * The ask queue, ranked by **value, not darkness** (D10): where explaining pays
 * off next - agent-consumption (how many modules pull it as context) × churn
 * (where code moves) × uncertainty (where the machine is least sure). Every row
 * states its own "why now" in plain words, the same discipline as the evidence
 * why (D5), so the ranking is legible rather than a black-box score. Churn is
 * drawn as a bar so "busy" stays visible; rows open the module page, where the
 * act of explaining begins.
 */
export function QueuePage({ queue, cold }: { queue: ValueRanked[]; cold: boolean }): JSX.Element {
  const maxChurn = queue.reduce((t, z) => Math.max(t, z.churn), 0);
  return (
    <div className="page queue-page">
      <SectionHead title={QUEUE.title} gloss={cold ? QUEUE.coldGloss : QUEUE.gloss} />

      {queue.length === 0 ? (
        <p className="empty-note">{QUEUE.empty}</p>
      ) : (
        <ol className="queue">
          {queue.map((z, i) => (
            <li key={z.module}>
              <a className="queue-row" href={routeHref({ view: 'module', id: z.module })}>
                <span className="queue-rank mono">{String(i + 1).padStart(2, '0')}</span>
                <span className="queue-module mono">{z.module}</span>
                <span className="queue-why" aria-label={QUEUE.whyLabel}>
                  {whyNow(z).map((reason) => (
                    <span key={reason} className="why-chip">
                      {reason}
                    </span>
                  ))}
                </span>
                {/* The bar visualizes movement; the why-chip already words the
                    exact count ("6 recent changes") - no second number (24b). */}
                <span className="queue-churn">
                  <span
                    className="queue-churn-bar"
                    role="img"
                    aria-label={`${z.churn} recent changes`}
                  >
                    <span
                      className="queue-churn-fill"
                      style={{
                        width:
                          maxChurn > 0
                            ? `${Math.max(2, Math.round((z.churn / maxChurn) * 100))}%`
                            : '0%',
                      }}
                    />
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
