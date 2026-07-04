import type { RankedModule } from '../api';
import { QUEUE } from '../copy';
import { routeHref } from '../router';
import { SectionHead } from './Status';

/**
 * The ask queue: where meaning is missing, darkest first. Each row is a place
 * someone is flying blind - churn drawn as a bar so "busy and unexplained"
 * is visible, not just countable. Rows open the module page; the act of
 * explaining is T18, this view opens the door.
 */
export function QueuePage({ zones, cold }: { zones: RankedModule[]; cold: boolean }): JSX.Element {
  const maxChurn = zones.reduce((t, z) => Math.max(t, z.churn), 0);
  return (
    <div className="page queue-page">
      <SectionHead title={QUEUE.title} gloss={cold ? QUEUE.coldGloss : QUEUE.gloss} />

      {zones.length === 0 ? (
        <p className="empty-note">{QUEUE.empty}</p>
      ) : (
        <ol className="queue">
          {zones.map((z, i) => (
            <li key={z.module}>
              <a className="queue-row" href={routeHref({ view: 'module', id: z.module })}>
                <span className="queue-rank mono">{String(i + 1).padStart(2, '0')}</span>
                <span className="queue-module mono">{z.module}</span>
                <span className="queue-churn">
                  <span className="queue-churn-bar" aria-hidden="true">
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
                  <span className="queue-churn-n mono">{z.churn}Δ</span>
                </span>
                <span className="queue-standing">
                  {z.certifiedFacts === 0 ? (
                    <span className="standing standing-dark">unexplained</span>
                  ) : (
                    <span className="standing standing-partial">
                      partly explained · {z.certifiedFacts}
                    </span>
                  )}
                  {z.staleFacts > 0 && (
                    <span className="standing standing-stale">{z.staleFacts} stale</span>
                  )}
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
