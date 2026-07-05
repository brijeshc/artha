import type { RefLink } from '../api';
import { WIRED } from '../copy';
import { shortName } from '../derive';
import { routeHref } from '../router';

/**
 * "Wired to" (T17b): a module's structural neighbours, mined from imports - what
 * it depends on and what depends on it. Structure, not certified meaning, so it
 * stays a quiet hairline (no phosphor glow). Each neighbour links to its module
 * page, with a small ×N when the coupling is more than a single import.
 */
export function WiredTo({
  dependsOn,
  usedBy,
  compact,
}: {
  dependsOn: RefLink[];
  usedBy: RefLink[];
  compact?: boolean;
}): JSX.Element | null {
  if (dependsOn.length === 0 && usedBy.length === 0) return null;
  return (
    <div className={compact ? 'wired compact' : 'wired'}>
      <RefGroup label={WIRED.dependsOn} links={dependsOn} />
      <RefGroup label={WIRED.usedBy} links={usedBy} />
    </div>
  );
}

function RefGroup({ label, links }: { label: string; links: RefLink[] }): JSX.Element | null {
  if (links.length === 0) return null;
  return (
    <div className="wired-group">
      <span className="wired-label">{label}</span>
      <div className="wired-links">
        {links.map((l) => (
          <a
            key={l.module}
            className="wired-link"
            href={routeHref({ view: 'module', id: l.module })}
            title={l.module}
          >
            <span className="mono">{shortName(l.module)}</span>
            {l.count > 1 && <span className="wired-count">×{l.count}</span>}
          </a>
        ))}
      </div>
    </div>
  );
}
