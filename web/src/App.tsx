import { useEffect, useState } from 'react';
import { type MapFeed, getMap } from './api';

/**
 * The dashboard skeleton (T15): fetches the area/module map feed and renders the
 * two columns + dark-zone markers, proving the API↔UI pipeline. The real
 * Product↔Code map, concept/flow detail, drag-to-link, and panels land in T16+.
 */
export function App(): JSX.Element {
  const [map, setMap] = useState<MapFeed | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMap()
      .then(setMap)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <main className="wrap">
        <h1>Artha</h1>
        <p className="err">{error}</p>
      </main>
    );
  }
  if (!map) {
    return (
      <main className="wrap">
        <h1>Artha</h1>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main className="wrap">
      <header>
        <h1>
          Artha — Product<span className="link-arrow">↔</span>Code map
        </h1>
        <p className="sub">
          Area / module altitude ·{' '}
          {map.cold ? 'cold start — nothing certified yet' : `${map.modules.length} modules`}
        </p>
      </header>

      {map.cold && (
        <p className="banner">
          Most of the map is dark: nobody has explained this code yet. That’s the signal, not an
          error — work the dark-zone queue to light it up.
        </p>
      )}

      <section className="cols">
        <div className="col">
          <h2>Product areas</h2>
          <ul className="list">
            {map.areas.map((a) => (
              <li key={a.area} className={a.dark ? 'item dark' : 'item'}>
                <span className="name">{a.area}</span>
                <span className="meta">
                  {a.concepts.length} concepts · {a.flows.length} flows
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="col">
          <h2>Code modules</h2>
          <ul className="list">
            {map.modules.map((m) => (
              <li key={m.module} className={m.dark ? 'item dark' : 'item'}>
                <span className="name">{m.module}</span>
                <span className="meta">
                  {m.dark ? 'dark zone' : `${m.certifiedFacts} certified`}
                  {m.staleFacts > 0 ? ` · ${m.staleFacts} stale` : ''} · churn {m.churn}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
