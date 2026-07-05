import type { MapModule, ModuleDetail, ModuleFact } from '../api';
import { INSPECTOR, WIRED } from '../copy';
import { type AreaStat, type CapabilityEntry, coverageBucket, shortName } from '../derive';
import { routeHref } from '../router';
import { KindTag, StatusBadge } from './Status';
import { WiredTo } from './Wired';

/**
 * The chart margin: a quick-look at whatever is selected on the atlas, without
 * leaving the map. A module shows its standing, the capabilities built on it,
 * and the rules that govern it - the engineer's "what am I about to touch";
 * the full page is one click. An area shows its coverage and its capabilities.
 */

export type InspectorContent =
  | {
      kind: 'module';
      module: string;
      mapModule: MapModule | null;
      detail: ModuleDetail | null;
    }
  | { kind: 'area'; stat: AreaStat; entries: CapabilityEntry[] };

export function Inspector({ content }: { content: InspectorContent }): JSX.Element {
  return (
    <aside className="inspector" aria-label="Inspector">
      {content.kind === 'module' ? (
        <ModuleLook content={content} />
      ) : (
        <AreaLook content={content} />
      )}
    </aside>
  );
}

function ModuleLook({
  content,
}: {
  content: Extract<InspectorContent, { kind: 'module' }>;
}): JSX.Element {
  const { module, mapModule, detail } = content;
  const bucket = mapModule ? coverageBucket(mapModule) : 'dark';
  const facts: Array<{ head: string; items: ModuleFact[] }> = detail
    ? [
        { head: 'Capabilities', items: [...detail.concepts, ...detail.flows] },
        { head: 'Rules in scope', items: detail.rules },
        { head: 'Why', items: detail.decisions },
      ]
    : [];

  return (
    <>
      <header className="inspector-head">
        <p className="inspector-kind">module</p>
        <h2 className="inspector-title mono">{shortName(module)}</h2>
        <p className="inspector-path mono">{module}</p>
        <a
          className="inspector-close"
          href="#/"
          title={INSPECTOR.close}
          aria-label={INSPECTOR.close}
        >
          ×
        </a>
      </header>

      <div className="inspector-stats">
        <Stat
          label="standing"
          value={
            <span className={`standing standing-${bucket}`}>
              {bucket === 'dark' ? 'dark zone' : bucket}
            </span>
          }
        />
        <Stat label="churn / 90d" value={<span className="mono">{mapModule?.churn ?? '-'}</span>} />
        <Stat
          label="certified"
          value={<span className="mono">{mapModule?.certifiedFacts ?? 0}</span>}
        />
        <Stat label="stale" value={<span className="mono">{mapModule?.staleFacts ?? 0}</span>} />
      </div>

      {detail === null ? (
        <p className="inspector-loading">reading…</p>
      ) : (
        <div className="inspector-body">
          {mapModule?.dark && <p className="inspector-dark-note">{INSPECTOR.darkNote}</p>}
          {facts.map(
            (g) =>
              g.items.length > 0 && (
                <section className="inspector-group" key={g.head}>
                  <p className="inspector-group-head">{g.head}</p>
                  <ul className="inspector-list">
                    {g.items.map((f) => (
                      <li key={f.id}>
                        <FactLine fact={f} />
                      </li>
                    ))}
                  </ul>
                </section>
              ),
          )}
          {(detail.dependsOn.length > 0 || detail.usedBy.length > 0) && (
            <section className="inspector-group">
              <p className="inspector-group-head">{WIRED.head}</p>
              <WiredTo dependsOn={detail.dependsOn} usedBy={detail.usedBy} compact />
            </section>
          )}
        </div>
      )}

      <footer className="inspector-foot">
        <a className="inspector-cta" href={routeHref({ view: 'module', id: module })}>
          {INSPECTOR.openModule} →
        </a>
      </footer>
    </>
  );
}

/** One fact in the quick-look: capability facts link to their page, rules show inline. */
function FactLine({ fact }: { fact: ModuleFact }): JSX.Element {
  const openable = fact.kind === 'concept' || fact.kind === 'flow';
  const name = fact.name ?? fact.id;
  if (openable) {
    return (
      <a
        className="fact-line openable"
        href={routeHref({ view: fact.kind as 'concept' | 'flow', id: fact.id })}
      >
        <KindTag kind={fact.kind} />
        <span className="fact-name">{name}</span>
        <StatusBadge status={fact.status} />
      </a>
    );
  }
  return (
    <span className="fact-line">
      <KindTag kind={fact.kind} />
      <span className="fact-name">
        {name}
        {fact.body && <span className="fact-body-clamp">{fact.body}</span>}
      </span>
      <StatusBadge status={fact.status} />
    </span>
  );
}

function AreaLook({
  content,
}: {
  content: Extract<InspectorContent, { kind: 'area' }>;
}): JSX.Element {
  const { stat, entries } = content;
  const pct = Math.round(stat.explained * 100);
  return (
    <>
      <header className="inspector-head">
        <p className="inspector-kind">product area</p>
        <h2 className="inspector-title">{stat.area.area}</h2>
        <a
          className="inspector-close"
          href="#/"
          title={INSPECTOR.close}
          aria-label={INSPECTOR.close}
        >
          ×
        </a>
      </header>

      <div className="inspector-stats">
        <Stat label="explained" value={<span className="mono">{pct}%</span>} />
        <Stat label="churn / 90d" value={<span className="mono">{stat.churn}</span>} />
        <Stat label="certified" value={<span className="mono">{stat.certified}</span>} />
        <Stat label="dark modules" value={<span className="mono">{stat.darkModules}</span>} />
      </div>

      <div className="inspector-body">
        {entries.length > 0 && (
          <section className="inspector-group">
            <p className="inspector-group-head">Capabilities</p>
            <ul className="inspector-list">
              {entries.map((e) => (
                <li key={e.ref.id}>
                  <a
                    className="fact-line openable"
                    href={routeHref({ view: e.ref.kind, id: e.ref.id })}
                  >
                    <KindTag kind={e.ref.kind} />
                    <span className="fact-name">{e.name}</span>
                    <StatusBadge status={e.status} />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="inspector-group">
          <p className="inspector-group-head">Modules</p>
          <ul className="inspector-list">
            {stat.area.modules.map((m) => (
              <li key={m}>
                <a className="fact-line openable" href={routeHref({ view: 'module', id: m })}>
                  <span className="fact-name mono">{m}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: JSX.Element }): JSX.Element {
  return (
    <div className="inspector-stat">
      <span className="inspector-stat-value">{value}</span>
      <span className="inspector-stat-label">{label}</span>
    </div>
  );
}
