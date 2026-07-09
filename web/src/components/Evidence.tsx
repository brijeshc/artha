import { useState } from 'react';
import { type EvidenceView, getEvidence } from '../api';
import { EVIDENCE } from '../copy';

/**
 * Evidence, revealed (D5): every machine claim carries its proof one interaction
 * away. A pin ref reads as a quiet chip; clicking it fetches and reveals the
 * exact source lines the claim was read from, so nothing on the page is an
 * unexplained assertion. Read-only: this shows code, it never mutates anything.
 */

/** The revealed panel: the pinned symbol's source, with real line numbers and an
 * honest "+N more lines" when a long symbol was capped. All spans (styled to lay
 * out as blocks) so it stays valid inside an inline pin. Pure - SSR-testable. */
export function EvidenceCode({ evidence }: { evidence: EvidenceView }): JSX.Element {
  return (
    <span className="evidence-code">
      <span className="evidence-cap mono">
        {evidence.path}
        <span className="evidence-lines">
          :{evidence.startLine}
          {evidence.endLine > evidence.startLine ? `-${evidence.endLine}` : ''}
        </span>
      </span>
      <span className="evidence-pre mono">
        {evidence.lines.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: source lines are a fixed, ordered slice
          <span className="evidence-row" key={i}>
            <span className="evidence-ln" aria-hidden="true">
              {evidence.startLine + i}
            </span>
            <span className="evidence-src">{line || ' '}</span>
          </span>
        ))}
      </span>
      {evidence.truncated > 0 && (
        <span className="evidence-more mono">{EVIDENCE.more(evidence.truncated)}</span>
      )}
    </span>
  );
}

/**
 * A pin ref that reveals its backing code on click (D5). Collapsed it is a chip
 * carrying the ref (`children`); open, it fetches once and shows the source, or
 * an honest note if the code has since moved. The fetch is lazy and cached in
 * local state - the panel only pays for the network when a reader asks to see it.
 */
export function EvidenceReveal({
  refId,
  children,
}: {
  /** The pin ref to resolve, `path#Symbol`. */
  refId: string;
  /** The chip's visible face - typically the `<code>` ref (linked or plain). */
  children: React.ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceView | null>(null);
  const [loading, setLoading] = useState(false);
  const [gone, setGone] = useState(false);
  const panelId = `ev-${refId}`;

  const toggle = async (): Promise<void> => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (evidence || gone) return; // already fetched once
    setLoading(true);
    try {
      setEvidence(await getEvidence(refId));
    } catch {
      setGone(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className="evidence-reveal">
      {children}
      <button
        type="button"
        className="evidence-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        title={EVIDENCE.revealHint}
        onClick={toggle}
      >
        {open ? EVIDENCE.hide : EVIDENCE.reveal}
      </button>
      {open && (
        <span className="evidence-panel" id={panelId}>
          {loading && <span className="evidence-note">{EVIDENCE.loading}</span>}
          {evidence && <EvidenceCode evidence={evidence} />}
          {gone && <span className="evidence-note evidence-gone">{EVIDENCE.gone}</span>}
        </span>
      )}
    </span>
  );
}
