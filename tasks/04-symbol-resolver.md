# Task 04 — SymbolResolver (built-in tree-sitter JS/TS)

**Depends on:** 01.
**Spec refs:** SPEC.md §"In scope" (built-in tree-sitter symbol resolver), §Constraints (self-contained, no CodeGraph dependency), Open question 4.
**Schema refs:** [schema-v0.1.md](../design/schema-v0.1.md) §4 (pin mechanism + staleness).

## Goal

Resolve a pin's human-written `path#Symbol` ref to a real symbol in the target repo, and
compute a stable content hash of that symbol's source span — the join that powers pin
resolution, retrieval ranking, and content-hash staleness. Built-in, behind an interface
so a CodeGraph-backed impl can drop in later without touching callers.

## Scope

- **Interface** (`src/resolver/SymbolResolver.ts`):
  ```ts
  interface ResolvedSymbol {
    symbolRef: string;        // as written, e.g. src/billing/Money.ts#Money
    symbolId: string;         // canonical id (v0.1: normalized path#qualified-name)
    filePath: string; startLine: number; endLine: number;
    contentHash: string;      // truncated sha-256 of normalized span
  }
  interface SymbolResolver {
    resolve(symbolRef: string): ResolvedSymbol | null;   // null = unresolved
    hash(sym: ResolvedSymbol): string;
  }
  ```
- **Tree-sitter impl** (`src/resolver/treeSitterResolver.ts`):
  - Use `web-tree-sitter` or `tree-sitter` + `tree-sitter-typescript` (TS + TSX) and `tree-sitter-javascript`.
  - Parse the file at `path`, walk for the qualified name after `#`:
    - top-level: function/class/const/interface/type/enum declarations.
    - `Class.method` form: method/property inside the named class.
  - Return the node's source span (start/end line). Unresolved ref (file missing, symbol absent) → `null` (caller decides error vs warn).
  - Cache parses per file per run.
- **Content hash** (`src/resolver/hash.ts`):
  - Truncated SHA-256 (e.g. first 6 hex, matching the spec's examples like `3b9e02`) of the symbol's source span **after whitespace normalization**.
  - **Decide and document the normalization rule (Open Q4 — see below).** Implement the chosen rule and make it a single, swappable function so it can be tuned later (schema §4 says "tune later").

## Open question 4 — content-hash normalization aggressiveness (RESOLVED 2026-06-20)

Schema §4 leaves this to v0.1 to pin down. The point: reformatting must **not** trigger
staleness, but a real edit must.

**Decision (developer, 2026-06-20): the recommended v0.1 rule — normalize whitespace, keep
comments.** Applied to a symbol's source span before hashing:
- CRLF/CR → LF
- trim leading/trailing whitespace per line
- collapse runs of intra-line spaces/tabs to a single space
- drop blank lines
- **do not** strip comments or normalize tokens

Accepted trade-off: a **comment-only edit DOES flip staleness** (a comment change is treated
as a meaningful edit worth re-certifying). Implemented as the single swappable function
`normalizeForHash` in [src/resolver/hash.ts](../src/resolver/hash.ts) so it can be retuned
later without touching callers.

## Out of scope

- Resolving against a real `.codegraph/` index (forward-compat only; the interface is the seam).
- Non-JS/TS languages (SPEC out of scope).
- Pin **error reporting** — build (T05) turns a `null` resolve into the build error.

## Contracts produced

`createTreeSitterResolver(repoRoot: string): SymbolResolver` — consumed by T05 to resolve
pins and (re)compute hashes during build.

## Acceptance criteria

- [ ] Resolves `src/foo.ts#Bar` (top-level) and `src/foo.ts#Bar.baz` (method) against fixtures.
- [ ] Returns `null` for a missing file and for a missing symbol in an existing file.
- [ ] `contentHash` is stable across a pure reformat (whitespace/indentation/blank-line change) of the pinned symbol.
- [ ] `contentHash` changes when the symbol's logic changes.
- [ ] The normalization rule is documented here + in code, and isolated to one function.
- [ ] Works on `.ts` and `.tsx` fixtures (proof repo is 365 `.tsx` + 258 `.ts`).
