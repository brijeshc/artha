import type { EvidenceExcerpt, SynthResult } from './inferrer';

/**
 * The verification gate (21b): a synthesized description is only as trustworthy
 * as the code it can be checked against. This is the deterministic, offline
 * checker the spec requires - "every claim must cite pins that resolve; a
 * checker validates claim-vs-pinned-code; unverifiable claims are downgraded".
 *
 * It does not re-run a model. It checks the one thing a machine can check
 * cheaply and honestly: whether the **code-shaped assertions** in the synthesis
 * (backtick-quoted spans and identifier-shaped words - the risky claims about
 * specific symbols, services, or mechanisms) are grounded in the evidence the
 * claim was read from. A synthesis that names a symbol or mechanism absent from
 * its own pins is exactly the hallucination this gate exists to catch.
 *
 * Plain product language in a name ("Subscription lifecycle" over
 * `SubscriptionStatus`) is grounded by word-pieces, so D4's domain-word
 * relabelling passes; a foreign term ("DynamoDB", "Redis") whose pieces are
 * nowhere in the code does not. What it cannot verify - a summary with no
 * resolvable evidence at all - it downgrades rather than trusts.
 *
 * Two tiers out (D7 wording): `inferred` (grounded, verified) or `uncertain`
 * (kept, but the reader is told it survived a downgrade). The synthesized prose
 * is never silently dropped (decided with the developer 2026-07-16); the label
 * carries the honesty.
 */

export const INFERRED = 'inferred';
export const UNCERTAIN = 'uncertain';

export type VerifiedTier = typeof INFERRED | typeof UNCERTAIN;

/**
 * Verify a synthesis against its evidence. `deterministic` is the 21a heading +
 * body - itself read from code, so a word the model kept from the draft is
 * already grounded. Returns the confidence tier the fact should carry.
 */
export function verifySynthesis(
  result: Extract<SynthResult, { enriched: true }>,
  evidence: EvidenceExcerpt[],
  deterministic: string,
): VerifiedTier {
  // Nothing to check the claim against - honest floor is "uncertain".
  if (evidence.length === 0) return UNCERTAIN;

  const vocabulary = groundedVocabulary(evidence, deterministic);
  // Every synthesized sentence is checked together: the name, the summary, and
  // each flow step's description (21b-2) - one ungrounded code claim anywhere
  // downgrades the whole fact, since they share one confidence tier.
  const claimed = [result.name, result.summary, ...result.steps.map((s) => s.text)].join('\n');
  for (const token of codeAssertions(claimed)) {
    if (!isGrounded(token, vocabulary)) return UNCERTAIN;
  }
  return INFERRED;
}

/** The lowercased word-pieces the claim is allowed to draw on: every word in the
 * evidence source, the pin refs, and the deterministic 21a draft. */
function groundedVocabulary(evidence: EvidenceExcerpt[], deterministic: string): Set<string> {
  const vocab = new Set<string>();
  const add = (text: string): void => {
    for (const piece of wordPieces(text)) vocab.add(piece);
  };
  for (const e of evidence) {
    add(e.ref);
    for (const line of e.lines) add(line);
  }
  add(deterministic);
  return vocab;
}

/**
 * The code-shaped assertions in a piece of synthesized text: backtick-quoted
 * spans (explicit code claims) and identifier-shaped words - camelCase,
 * PascalCase, snake_case, or letter+digit mixes. Plain prose words are ignored;
 * they are the summary's job and carry no code claim.
 */
function codeAssertions(text: string): string[] {
  const tokens: string[] = [];
  for (const m of text.matchAll(/`([^`]+)`/g)) {
    if (m[1]) tokens.push(m[1]);
  }
  for (const m of text.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
    const word = m[0];
    if (isCodeShaped(word)) tokens.push(word);
  }
  return tokens;
}

/** An identifier the reader would recognize as code, not an ordinary English
 * word: an internal case boundary, an underscore, or a letter+digit mix. */
function isCodeShaped(word: string): boolean {
  if (word.length < 2) return false;
  if (word.includes('_')) return true;
  if (/[a-z][A-Z]/.test(word)) return true; // camelCase / PascalCase boundary
  if (/[A-Za-z]\d|\d[A-Za-z]/.test(word)) return true; // v2, s3, oauth2
  return false;
}

/** A token is grounded when every word-piece it decomposes into appears in the
 * evidence vocabulary - so recombined domain words pass, foreign terms do not. */
function isGrounded(token: string, vocabulary: Set<string>): boolean {
  const pieces = wordPieces(token);
  if (pieces.length === 0) return true; // punctuation-only span - nothing claimed
  return pieces.every((p) => vocabulary.has(p));
}

/** Split any text into lowercased alphanumeric word-pieces, breaking camelCase,
 * separators, and letter/digit boundaries: `OrderState` -> [order, state]. */
function wordPieces(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
