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

/** One symbol a file exposes, for the dashboard's link picker (T17). */
export interface SymbolDecl {
  /** Qualified name `resolve` accepts: `Foo` or `Foo.bar` for a class member. */
  name: string;
  /** Friendly kind: class · function · interface · type · enum · const · method · field. */
  kind: string;
  /** True when the declaration is `export`ed - the module's public surface (21a). */
  exported: boolean;
}

/**
 * A finite set of named states a file declares literally - a string-literal
 * union type (`type X = 'a' | 'b'`) or a TS `enum` - the raw material for
 * inferred state-machine candidates (21a). Structural and deterministic: the
 * members are read verbatim from the source, no meaning invented. A future
 * CodeGraph-backed resolver may return `[]` until it implements this.
 */
export interface EnumLike {
  /** The declared symbol name, e.g. `SubscriptionStatus`. */
  name: string;
  /** `'union'` (string-literal union type) or `'enum'` (TS enum). */
  kind: 'union' | 'enum';
  /** The member/variant names in source order (≥2). */
  members: string[];
}

export interface SymbolResolver {
  /** Resolve a `path#Symbol` ref to a symbol, or `null` if it cannot be found. */
  resolve(symbolRef: string): ResolvedSymbol | null;
  /** Recompute the content hash of an already-resolved symbol from disk. */
  hash(sym: ResolvedSymbol): string;
  /**
   * Enumerate the resolvable symbols a file exposes (top-level declarations +
   * class members), so linking code is search-and-pick, not typing paths. A
   * non-JS/TS or missing file yields `[]`. Every returned name resolves via
   * {@link resolve} (same rules), so a picked symbol always makes a valid pin.
   */
  list(relPath: string): SymbolDecl[];
  /**
   * The string-literal unions and TS enums a file declares (≥2 members each) -
   * the deterministic seed for inferred state-machine candidates (21a). A
   * non-JS/TS or missing file yields `[]`. Structural extraction only: members
   * are read verbatim, transitions/effects are never guessed here.
   */
  enumLikes(relPath: string): EnumLike[];
  /**
   * The raw import/require/re-export specifiers a file declares, as written
   * (`./money`, `../../db`, `react`), in source order. Static `import … from`,
   * `export … from`, `require(...)`, and dynamic `import(...)` are all captured;
   * dynamic/computed specifiers are skipped. Bare/npm specifiers are included
   * as-is - the caller decides which to keep. A non-JS/TS or missing file
   * yields `[]`. This is the raw material for the module reference graph (T17b).
   */
  imports(relPath: string): string[];
  /**
   * The named declarations in `relPath` that **use** one of `state`'s members -
   * a union member as a string literal in an assignment, comparison, `case`, or
   * initializer, or (for an enum) an `Enum.Member` access - each rolled up to its
   * enclosing declaration and returned as a qualified name (`fn` / `Class.method`)
   * resolvable via {@link resolve}, in source order, deduped.
   *
   * This is the cross-file **state-usage index** that grounds inferred transitions
   * (21b-2): scanned across every source file, a concept's usage sites are the
   * code that actually moves the state, which the declaration alone never shows.
   * Precision over recall - only value-like contexts count, never incidental
   * prose. Non-JS/TS or missing file yields `[]`.
   */
  memberUsages(relPath: string, state: EnumLike): string[];
}
