/**
 * The seam between a human-written pin (`path#Symbol`) and a real symbol in the
 * target repo. v0.1 ships a built-in tree-sitter implementation
 * (`treeSitterResolver.ts`); the interface exists so a CodeGraph-backed
 * implementation can drop in later without touching callers (SPEC §"In scope").
 */

export interface ResolvedSymbol {
  /** The ref as written, e.g. `src/billing/Money.ts#Money`. */
  symbolRef: string;
  /** Canonical id. v0.1: normalized `posix-path#qualified-name`. */
  symbolId: string;
  /** Absolute path of the file the symbol was found in. */
  filePath: string;
  /** 1-based, inclusive line span of the symbol's source. */
  startLine: number;
  endLine: number;
  /** Truncated SHA-256 of the normalized source span (schema §4). */
  contentHash: string;
}

export interface SymbolResolver {
  /** Resolve a `path#Symbol` ref to a symbol, or `null` if it cannot be found. */
  resolve(symbolRef: string): ResolvedSymbol | null;
  /** Recompute the content hash of an already-resolved symbol from disk. */
  hash(sym: ResolvedSymbol): string;
}
