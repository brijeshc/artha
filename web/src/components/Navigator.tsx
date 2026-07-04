import { useState } from 'react';
import type { Catalog, MapFeed } from '../api';
import { NAV } from '../copy';
import { type AreaStat, type CapabilityEntry, capabilitiesByArea, shortName } from '../derive';
import { type Route, routeHref } from '../router';

/**
 * The gazetteer: the knowledge base as a navigable tree. Views first, then one
 * section per product area - each expandable into the capabilities it offers
 * (product language) and the modules that implement it (code language). This
 * is the "different section for different business logic" spine; everything
 * in it is a plain link, so the whole tree deep-links.
 */

export interface NavigatorProps {
  route: Route;
  feed: MapFeed;
  catalog: Catalog;
  stats: AreaStat[];
  zoneCount: number;
}

export function Navigator({ route, feed, catalog, stats, zoneCount }: NavigatorProps): JSX.Element {
  const grouped = capabilitiesByArea(catalog, feed.areas);
  const capsByArea = new Map(
    grouped
      .filter((g) => g.area !== null)
      .map((g) => [(g.area as NonNullable<typeof g.area>).area, g.entries]),
  );

  // Real (grouped) areas make the tree; default one-module areas collapse into
  // a single "modules" section so the nav doesn't repeat the map tile by tile.
  const groupedStats = stats.filter(
    (s) => s.area.modules.length > 1 || s.area.modules[0] !== s.area.area,
  );
  const soloStats = stats.filter(
    (s) => !(s.area.modules.length > 1 || s.area.modules[0] !== s.area.area),
  );

  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(groupedStats.length <= 6 ? groupedStats.map((s) => s.area.area) : []),
  );
  const toggle = (area: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(area) ? next.delete(area) : next.add(area);
      return next;
    });

  const selectedArea = route.view === 'atlas' ? (route.area ?? null) : null;
  const selectedModule =
    route.view === 'atlas' ? (route.module ?? null) : route.view === 'module' ? route.id : null;

  return (
    <nav className="navigator" aria-label="Knowledge base">
      <div className="nav-section">
        <p className="nav-heading">{NAV.views}</p>
        <ViewLink href="#/" label={NAV.atlas} active={route.view === 'atlas'} glyph="◆" />
        <ViewLink
          href="#/capabilities"
          label={NAV.capabilities}
          active={route.view === 'capabilities'}
          glyph="▤"
        />
        <ViewLink
          href="#/queue"
          label={NAV.queue}
          active={route.view === 'queue'}
          glyph="◌"
          badge={zoneCount > 0 ? String(zoneCount) : undefined}
        />
      </div>

      {groupedStats.length > 0 && (
        <div className="nav-section nav-areas">
          <p className="nav-heading">{NAV.areas}</p>
          {groupedStats.map((s) => (
            <AreaNode
              key={s.area.area}
              stat={s}
              caps={capsByArea.get(s.area.area) ?? []}
              open={open.has(s.area.area)}
              onToggle={() => toggle(s.area.area)}
              selectedArea={selectedArea}
              selectedModule={selectedModule}
            />
          ))}
        </div>
      )}

      {soloStats.length > 0 && (
        <div className="nav-section nav-areas">
          <p className="nav-heading">{groupedStats.length > 0 ? 'Other modules' : 'Modules'}</p>
          <ul className="nav-list">
            {soloStats.map((s) => (
              <li key={s.area.area}>
                <ModuleLink
                  module={s.area.area}
                  dark={s.darkModules > 0}
                  selected={selectedModule === s.area.area}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="nav-foot">{NAV.offline}</p>
    </nav>
  );
}

function ViewLink({
  href,
  label,
  active,
  glyph,
  badge,
}: {
  href: string;
  label: string;
  active: boolean;
  glyph: string;
  badge?: string;
}): JSX.Element {
  return (
    <a
      className={active ? 'nav-view active' : 'nav-view'}
      href={href}
      aria-current={active ? 'page' : undefined}
    >
      <span className="nav-glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="nav-view-label">{label}</span>
      {badge && <span className="nav-badge">{badge}</span>}
    </a>
  );
}

function AreaNode({
  stat,
  caps,
  open,
  onToggle,
  selectedArea,
  selectedModule,
}: {
  stat: AreaStat;
  caps: CapabilityEntry[];
  open: boolean;
  onToggle: () => void;
  selectedArea: string | null;
  selectedModule: string | null;
}): JSX.Element {
  const a = stat.area;
  const active = selectedArea === a.area;
  return (
    <div className={open ? 'nav-area open' : 'nav-area'}>
      <div className="nav-area-row">
        <button
          type="button"
          className="nav-disclose"
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${a.area}`}
          onClick={onToggle}
        >
          {open ? '▾' : '▸'}
        </button>
        <a
          className={active ? 'nav-area-name active' : 'nav-area-name'}
          href={routeHref({ view: 'atlas', area: a.area })}
          title={`Show ${a.area} on the atlas`}
        >
          {a.area}
        </a>
        <span
          className="nav-area-meter"
          title={`${Math.round(stat.explained * 100)}% of this area's recent change is explained`}
          aria-hidden="true"
        >
          <span
            className="nav-area-meter-fill"
            style={{ width: `${Math.round(stat.explained * 100)}%` }}
          />
        </span>
      </div>

      {open && (
        <ul className="nav-list nav-area-children">
          {caps.map((c) => (
            <li key={c.ref.id}>
              <a
                className={`nav-cap kind-${c.ref.kind}`}
                href={routeHref({ view: c.ref.kind, id: c.ref.id })}
              >
                <span className={`cap-glyph kind-${c.ref.kind}`} aria-hidden="true">
                  {c.ref.kind === 'concept' ? '●' : '→'}
                </span>
                {c.name}
              </a>
            </li>
          ))}
          {a.modules.map((m) => (
            <li key={m}>
              <ModuleLink module={m} dark={false} selected={selectedModule === m} indent />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ModuleLink({
  module,
  dark,
  selected,
  indent,
}: {
  module: string;
  dark: boolean;
  selected: boolean;
  indent?: boolean;
}): JSX.Element {
  const cls = [
    'nav-module',
    selected ? 'active' : '',
    indent ? 'indent' : '',
    dark ? 'is-dark' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <a className={cls} href={routeHref({ view: 'module', id: module })} title={module}>
      <span className="nav-glyph mono" aria-hidden="true">
        ▪
      </span>
      <span className="mono">{shortName(module)}</span>
    </a>
  );
}
