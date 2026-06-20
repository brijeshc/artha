export interface ArthaErrorOptions {
  /** Process exit code to use when this error reaches the CLI top level. */
  exitCode?: number;
  /** A short, actionable next step shown after the message. */
  hint?: string;
  /** Underlying cause, preserved for debugging. */
  cause?: unknown;
}

/**
 * The single error type commands throw for expected, user-facing failures.
 * It carries an actionable message, an optional hint, and the exit code the
 * CLI should terminate with. Unexpected (programmer) errors should NOT use
 * this — let them bubble as raw Errors so their stack is surfaced.
 *
 * Used heavily by the no-API-key path in `artha mine` (T06).
 */
export class ArthaError extends Error {
  readonly exitCode: number;
  readonly hint?: string;

  constructor(message: string, options: ArthaErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'ArthaError';
    this.exitCode = options.exitCode ?? 1;
    this.hint = options.hint;
  }
}

export function isArthaError(value: unknown): value is ArthaError {
  return value instanceof ArthaError;
}
