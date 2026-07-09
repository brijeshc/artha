import type {
  InferredCatalogConcept,
  InferredCatalogFlow,
  InferredFactView,
  InferredStepView,
  PinView,
} from '../api';
import { INFERRED } from '../copy';
import { confidenceLabel, moduleOfPath, shortName } from '../derive';
import { routeHref } from '../router';
import { EvidenceReveal } from './Evidence';
import { SectionHead } from './Status';

/**
 * The moonlight layer (21a): machine-described meaning, rendered so a reader can
 * tell "described" from "vouched" without a legend (D2), every claim carries its
 * evidence (D5), and the delta the code can't hold is invited, not assumed (D6).
 * One grammar spans all four inferred kinds - module cards, state machines, flow
 * skeletons, and naming conventions. Read-only for now: vouch-by-reading (the
 * one-keystroke certify) lands with the dashboard reframe; nothing auto-certifies.
 */

/** Anything the moonlight card can render: a full inferred view or a catalog summary. */
type CardItem =
  | InferredFactView
  | InferredCatalogConcept
  | InferredCatalogFlow
  | {
      id: string;
      name: string;
      module: string | null;
      confidence: string;
      kind?: string;
      states?: string[];
      steps?: Array<string | InferredStepView>;
      pins?: PinView[];
    };

/** Worded confidence (D7) as a small moonlight chip - never a number. */
export function ConfidenceChip({ slug }: { slug: string }): JSX.Element {
  return (
    <span className="confidence" title={INFERRED.kindLabel}>
      <span className="confidence-dot" aria-hidden="true" />
      {confidenceLabel(slug)}
    </span>
  );
}

/** A machine-described unit as a glanceable moonlight card (catalog + module page).
 * Links to the full inferred page; carries confidence, not a status. Its preview
 * adapts to the kind - a state chain, a fan-out chain, or the symbols a
 * convention is read from. */
export function InferredCard({ item }: { item: CardItem }): JSX.Element {
  // No leading kind chip: these cards live under a "Machine-described" header,
  // and the moonlight styling + confidence chip already mark the tier - so the
  // name gets the full head width (D4: naming is the readability surface).
  return (
    <a className="cap-card inferred-card" href={routeHref({ view: 'inferred', id: item.id })}>
      <span className="card-head">
        <span className="card-name">{item.name}</span>
        <ConfidenceChip slug={item.confidence} />
      </span>
      <span className="card-preview">
        <CardPreview item={item} />
      </span>
      <span className="card-foot mono">{item.module ? shortName(item.module) : 'unplaced'}</span>
    </a>
  );
}

/** The card's kind-adaptive preview: states → a `·` chain, a flow's fan-out → a
 * `→` chain, a convention → the symbols it repeats; else an honest one-liner. */
function CardPreview({ item }: { item: CardItem }): JSX.Element {
  const kind = 'kind' in item ? item.kind : undefined;
  const states = 'states' in item ? (item.states ?? []) : [];
  const steps = stepLabels('steps' in item ? item.steps : undefined);
  const pins = 'pins' in item ? (item.pins ?? []) : [];
  if (states.length > 0) return <Chain items={states} sep=" · " />;
  if (steps.length > 0) return <Chain items={steps} sep=" → " />;
  if (kind === 'convention' && pins.length > 0) return <MemberPreview pins={pins} />;
  return (
    <span className="card-empty">{INFERRED.cardEmpty[kind ?? 'concept'] ?? 'read from code'}</span>
  );
}

/** The full page for one inferred fact - prose first, then what was read from
 * code (states, a fan-out, or matched symbols), the evidence, and the delta band
 * inviting the human part. */
export function InferredPage({ detail }: { detail: InferredFactView }): JSX.Element {
  const modules = detail.module ? [detail.module] : [];
  const steps = detail.steps ?? [];
  const isConvention = detail.kind === 'convention';
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
          <Chain items={detail.states} sep=" · " />
        </section>
      )}

      {steps.length > 0 && (
        <section className="cap-section">
          <SectionHead n={next()} title={INFERRED.stepsHead} gloss={INFERRED.stepsGloss} />
          <ul className="moon-steps">
            {steps.map((s) => (
              <li key={s.module ?? s.label} className="moon-step">
                {s.module ? (
                  <a className="pin-link" href={routeHref({ view: 'module', id: s.module })}>
                    {s.label}
                  </a>
                ) : (
                  s.label
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.pins.length > 0 && (
        <section className="cap-section">
          <SectionHead
            n={next()}
            title={isConvention ? INFERRED.membersHead : INFERRED.evidenceHead}
            gloss={isConvention ? INFERRED.membersGloss : INFERRED.evidenceGloss}
          />
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
        <p className="delta-body">{INFERRED.delta[detail.kind] ?? INFERRED.deltaFallback}</p>
      </section>
    </div>
  );
}

/** An ordered chain of moonlight tokens: states (`a · b · c`) or a flow's fan-out
 * (`Billing → Notifications`). */
function Chain({ items, sep }: { items: string[]; sep: string }): JSX.Element {
  return (
    <span className="state-chain moon-chain">
      {items.map((s, i) => (
        <span key={s}>
          {i > 0 && <span className="chain-arrow">{sep}</span>}
          <span className="chain-state">{s}</span>
        </span>
      ))}
    </span>
  );
}

/** A convention card's preview: the symbols it repeats, in code voice. */
function MemberPreview({ pins }: { pins: PinView[] }): JSX.Element {
  const names = pins.slice(0, 3).map((p) => symbolName(p.symbol));
  const more = pins.length - names.length;
  return (
    <span className="member-preview mono">
      {names.join(', ')}
      {more > 0 ? ` +${more}` : ''}
    </span>
  );
}

/** An evidence pin (moonlight): the code a claim was read from, linking to its
 * module when known and revealing the exact source on click (D5). Never "stale"
 * - moonlight regenerates on drift (D12). */
function EvidenceLine({ pin, modules }: { pin: PinView; modules: string[] }): JSX.Element {
  const module = moduleOfPath(pin.symbol.split('#')[0] ?? '', modules);
  const code = <code>{pin.symbol}</code>;
  const face = module ? (
    <a className="pin-link" href={routeHref({ view: 'module', id: module })}>
      {code}
    </a>
  ) : (
    code
  );
  return (
    <span className="pin evidence">
      <EvidenceReveal refId={pin.symbol}>{face}</EvidenceReveal>
    </span>
  );
}

/** The symbol name of a `path#Name` pin ref. */
function symbolName(ref: string): string {
  return ref.slice(ref.indexOf('#') + 1) || ref;
}

/** Normalize a card's `steps` (string labels or step views) to display labels. */
function stepLabels(steps: Array<string | InferredStepView> | undefined): string[] {
  return (steps ?? []).map((s) => (typeof s === 'string' ? s : s.label));
}
