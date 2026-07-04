import { WORDMARK } from '../copy';
import type { Kpi } from '../derive';

/**
 * The instrument bar: wordmark, a breadcrumb that always says where you are,
 * and the four understanding readouts on the right - the leadership numbers,
 * permanently visible instead of a section you scroll past. One row, 48px,
 * never grows.
 */

export interface Crumb {
  label: string;
  href?: string;
  mono?: boolean;
}

export function TopBar({
  crumbs,
  kpis,
  onOpenCmdk,
}: {
  crumbs: Crumb[];
  kpis: Kpi[];
  onOpenCmdk: () => void;
}): JSX.Element {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <a className="wordmark" href="#/">
          {WORDMARK}
        </a>
        <nav className="crumbs" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span className="crumb-seg" key={`${c.label}-${i}`}>
              <span className="crumb-sep" aria-hidden="true">
                /
              </span>
              {c.href ? (
                <a className={c.mono ? 'crumb mono' : 'crumb'} href={c.href}>
                  {c.label}
                </a>
              ) : (
                <span className={c.mono ? 'crumb here mono' : 'crumb here'} aria-current="page">
                  {c.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="topbar-right">
        <dl className="readouts" aria-label="Codebase understanding at a glance">
          {kpis.map((k) => (
            <div className={`readout tone-${k.tone}`} key={k.key} title={k.hint}>
              <dd className="readout-value">{k.value}</dd>
              <dt className="readout-label">{k.label}</dt>
            </div>
          ))}
        </dl>
        <button type="button" className="cmdk-trigger" onClick={onOpenCmdk}>
          <span className="cmdk-trigger-text">Search</span>
          <kbd>⌘K</kbd>
        </button>
      </div>
    </header>
  );
}
