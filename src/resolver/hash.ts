import { createHash } from 'node:crypto';

/**
 * Content-hash normalization rule — Open Question 4, locked for v0.1.
 *
 * Decision (2026-06-20, recorded in tasks/04-symbol-resolver.md): **normalize
 * whitespace, keep comments.** Reformatting must NOT flip a certified entry to
 * stale, but a real edit must — and a comment-only edit is treated as a real
 * edit (it stays in the hash), so it DOES flip staleness.
 *
 * The rule, applied to a symbol's source span before hashing:
 *   - CRLF / CR  → LF
 *   - trim leading & trailing whitespace on each line
 *   - collapse runs of intra-line spaces/tabs to a single space
 *   - drop blank lines
 *   - comments and tokens are left intact
 *
 * This is the single, swappable normalization function (schema §4: "tune
 * later") — change only this to retune what counts as a meaningful edit.
 */
export function normalizeForHash(source: string): string {
  return source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/[ \t]+/g, ' '))
    .filter((line) => line.length > 0)
    .join('\n');
}

/** Length of the truncated hex digest (schema §4 examples: `3b9e02`, `9f2a1c`). */
const HASH_HEX_LENGTH = 6;

/** Truncated SHA-256 of the normalized source span. */
export function contentHash(source: string): string {
  return createHash('sha256')
    .update(normalizeForHash(source))
    .digest('hex')
    .slice(0, HASH_HEX_LENGTH);
}
