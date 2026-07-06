import { useState } from 'react';
import type { Catalog, MapFeed } from '../api';
import { CATALOG, INFERRED } from '../copy';
import { capabilitiesByArea } from '../derive';
import { CapCard } from './CapCard';
import { InferredCard } from './Inferred';
import { SectionHead } from './Status';

/**
 * The product lens: every capability, one section per product area - the
 * "what does this product do" reading a PM opens with. Filters cut by
 * standing and kind; each card opens the full capability page.
 */

type StatusFilter = 'all' | 'certified' | 'proposed' | 'stale';
type KindFilter = 'all' | 'concept' | 'flow';

export function CatalogPage({ catalog, feed }: { catalog: Catalog; feed: MapFeed }): JSX.Element {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');

  const groups = capabilitiesByArea(catalog, feed.areas)
    .map((g) => ({
      ...g,
      entries: g.entries.filter(
        (e) => (status === 'all' || e.status === status) && (kind === 'all' || e.ref.kind === kind),
      ),
    }))
    .filter((g) => g.entries.length > 0);

  const total = catalog.concepts.length + catalog.flows.length;
  const inferredConcepts = catalog.inferredConcepts ?? [];
  const inferredFlows = catalog.inferredFlows ?? [];
  // The machine-described tier carries no human status, so it shows under the
  // "all" status filter, below everything a human has vouched (D2). The kind
  // filter still cuts it - concepts under "concept", flows under "flow".
  const inferredCaps = [
    ...(kind !== 'flow' ? inferredConcepts : []),
    ...(kind !== 'concept' ? inferredFlows : []),
  ];
  const showInferred = inferredCaps.length > 0 && status === 'all';
  const anyContent = total > 0 || inferredConcepts.length + inferredFlows.length > 0;

  return (
    <div className="page catalog-page">
      <SectionHead
        title={CATALOG.title}
        gloss={CATALOG.gloss}
        aside={
          total > 0 ? (
            <div className="filters" aria-label="Filters">
              <FilterChips
                value={kind}
                onChange={(v) => setKind(v as KindFilter)}
                options={['all', 'concept', 'flow']}
              />
              <FilterChips
                value={status}
                onChange={(v) => setStatus(v as StatusFilter)}
                options={['all', 'certified', 'proposed', 'stale']}
              />
            </div>
          ) : undefined
        }
      />

      {!anyContent ? (
        <p className="empty-note">{CATALOG.empty}</p>
      ) : (
        <>
          {groups.length === 0 && total > 0 && <p className="empty-note">{CATALOG.noMatch}</p>}
          {groups.map((g) => (
            <section className="catalog-area" key={g.area?.area ?? '·unplaced'}>
              <h3 className="catalog-area-name">
                {g.area ? g.area.area : CATALOG.unplaced}
                <span className="catalog-area-count">{g.entries.length}</span>
              </h3>
              <div className="catalog-grid">
                {g.entries.map((e) => (
                  <CapCard key={e.ref.id} entry={e} />
                ))}
              </div>
            </section>
          ))}

          {showInferred && (
            <section className="catalog-area inferred-area">
              <h3 className="catalog-area-name">
                {INFERRED.inferredCapsHead}
                <span className="catalog-area-count">{inferredCaps.length}</span>
              </h3>
              <p className="gloss">{INFERRED.inferredCapsGloss}</p>
              <div className="catalog-grid">
                {inferredCaps.map((c) => (
                  <InferredCard key={c.id} item={c} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function FilterChips({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}): JSX.Element {
  return (
    <div className="chip-row">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={value === o ? 'chip active' : 'chip'}
          aria-pressed={value === o}
          onClick={() => onChange(o)}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
