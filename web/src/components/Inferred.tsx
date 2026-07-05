import type { InferredCatalogConcept, InferredFactView, PinView } from '../api';
import { INFERRED } from '../copy';
import { confidenceLabel, moduleOfPath, shortName } from '../derive';
import { routeHref } from '../router';
import { SectionHead } from './Status';

/**
 * The moonlight layer (21a): machine-described meaning, rendered so a reader can
 * tell "described" from "vouched" without a legend (D2), every claim carries its
 * evidence (D5), and the delta the code can't hold is invited, not assumed (D6).
 * Read-only for now - vouch-by-reading (the one-keystroke certify) lands with the
 * dashboard reframe; nothing here ever auto-certifies.
 */

/** Worded confidence (D7) as a small moonlight chip - never a number. */
export function ConfidenceChip({ slug }: { slug: string }): JSX.Element {
  return (
    <span className="confidence" title={INFERRED.kindLabel}>
      <span className="confidence-dot" aria-hidden="true" />
      {confidenceLabel(slug)}
    </span>
  );
}

/** A machine-described capability as a glanceable moonlight card (catalog + module
 * page). Links to the full inferred page; carries confidence, not a status. */
export function InferredCard({
  concept,
}: {
  concept: InferredFactView | InferredCatalogConcept;
}): JSX.Element {
  const states = concept.states;
  // No leading kind chip: these cards live under a "Machine-described" section
  // header, and the moonlight styling + confidence chip already mark the tier -
  // so the name gets the full head width (D4: naming is the readability surface).
  return (
    <a className="cap-card inferred-card" href={routeHref({ view: 'inferred', id: concept.id })}>
      <span className="card-head">
        <span className="card-name">{concept.name}</span>
        <ConfidenceChip slug={concept.confidence} />
      </span>
      <span className="card-preview">
        {states.length > 0 ? (
          <StateChain states={states} />
        ) : (
          <span className="card-empty">a state set read from code</span>
        )}
      </span>
      <span className="card-foot mono">
        {concept.module ? shortName(concept.module) : 'unplaced'}
      </span>
    </a>
  );
}

/** The full page for one inferred fact - prose first, then the states read from
 * code, the evidence behind them, and the delta band inviting the human part. */
export function InferredPage({ detail }: { detail: InferredFactView }): JSX.Element {
  const modules = detail.module ? [detail.module] : [];
  let n = 0;
  const next = (): string => String(++n).padStart(2, '0');
  return (
    <div className="page inferred-page">
      <header className="page-head">
        <p className="page-kind">{INFERRED.page}</p>
        <h2 className="page-title">{detail.name}</h2>
        <p className="page-sub mono">{detail.id}</p>
        {detail.summary && <p className="page-summary moon-prose">{detail.summary}</p>}
        <p className="page-meta">
          <ConfidenceChip slug={detail.confidence} />
          <span className="meta-sep">·</span>
          <span className="inferred-note">{INFERRED.notVouched}</span>
          {detail.module && (
            <>
              <span className="meta-sep">·</span>
              <a
                className="module-chip mono"
                href={routeHref({ view: 'module', id: detail.module })}
              >
                {shortName(detail.module)}
              </a>
            </>
          )}
        </p>
      </header>

      {detail.states.length > 0 && (
        <section className="cap-section">
          <SectionHead n={next()} title={INFERRED.statesHead} />
          <StateChain states={detail.states} />
        </section>
      )}

      {detail.pins.length > 0 && (
        <section className="cap-section">
          <SectionHead n={next()} title={INFERRED.evidenceHead} gloss={INFERRED.evidenceGloss} />
          <ul className="pins">
            {detail.pins.map((p) => (
              <li key={p.symbol}>
                <EvidenceLine pin={p} modules={modules} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The delta band (D6): human ink over machine print - what code can't say. */}
      <section className="cap-section delta-band">
        <SectionHead n={next()} title={INFERRED.deltaHead} />
        <p className="delta-body">{INFERRED.deltaBody}</p>
      </section>
    </div>
  );
}

/** The state names as a moonlight chain: `active → paused → canceled`. */
function StateChain({ states }: { states: string[] }): JSX.Element {
  return (
    <span className="state-chain moon-chain">
      {states.map((s, i) => (
        <span key={s}>
          {i > 0 && <span className="chain-arrow"> · </span>}
          <span className="chain-state">{s}</span>
        </span>
      ))}
    </span>
  );
}

/** An evidence pin (moonlight): the code a claim was read from, linking to its
 * module when known. Never "stale" - moonlight regenerates on drift (D12). */
function EvidenceLine({ pin, modules }: { pin: PinView; modules: string[] }): JSX.Element {
  const module = moduleOfPath(pin.symbol.split('#')[0] ?? '', modules);
  const code = <code>{pin.symbol}</code>;
  return (
    <span className="pin evidence">
      {module ? (
        <a className="pin-link" href={routeHref({ view: 'module', id: module })}>
          {code}
        </a>
      ) : (
        code
      )}
      <span className="confidence">
        <span className="confidence-dot" aria-hidden="true" />
        read from code
      </span>
    </span>
  );
}
