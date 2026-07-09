import { readFileSync } from 'node:fs';
import type { SymbolResolver } from '../resolver/SymbolResolver';

/**
 * Evidence, revealed (D5): the source a machine claim was read from, one
 * interaction away. A pin ref (`src/billing/refund.ts#issueRefund`) resolves to
 * a real symbol; this returns that symbol's own source lines so the reader can
 * check the assertion against the code instead of trusting it. Pure over the
 * repo + the resolver - no index, no network - so it stays offline like the pin
 * suggester, and it is hit on click (a reveal), never on the hot path.
 */

export interface EvidenceView {
  /** The pin ref as requested: `path#Symbol`. */
  ref: string;
  /** The symbol name (`issueRefund`), the `#…` tail of the ref. */
  symbol: string;
  /** Repo-relative posix path of the file the symbol lives in. */
  path: string;
  /** 1-based inclusive line span of the symbol's source (for real line numbers). */
  startLine: number;
  endLine: number;
  /** The source lines shown (the span, capped at {@link EVIDENCE_MAX_LINES}). */
  lines: string[];
  /** How many lines of the span were omitted by the cap (0 when none). */
  truncated: number;
}

/** A long symbol (a big class) is capped so the reveal stays a readable panel,
 * not a scroll of the whole file; the honest remainder is reported as `truncated`. */
export const EVIDENCE_MAX_LINES = 60;

/**
 * Resolve a `path#Symbol` pin ref to the source lines that back it, or `null`
 * when the ref does not resolve (drifted/renamed code) or the file cannot be
 * read - the caller answers 404, never a guess.
 */
export function evidenceFor(resolver: SymbolResolver, ref: string): EvidenceView | null {
  const resolved = resolver.resolve(ref);
  if (!resolved) return null;

  let source: string;
  try {
    source = readFileSync(resolved.filePath, 'utf8');
  } catch {
    return null;
  }

  const all = source.split('\n');
  // startLine/endLine are 1-based inclusive; slice end is exclusive → endLine.
  const span = all.slice(resolved.startLine - 1, resolved.endLine);
  const shown = span.slice(0, EVIDENCE_MAX_LINES);
  const hash = ref.indexOf('#');

  return {
    ref,
    symbol: hash >= 0 ? ref.slice(hash + 1) : ref,
    path: hash >= 0 ? ref.slice(0, hash) : ref,
    startLine: resolved.startLine,
    endLine: resolved.endLine,
    lines: shown,
    truncated: span.length - shown.length,
  };
}
