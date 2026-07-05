# Task 17b - Auto-map: reference graph + suggested pins

**Depends on:** 12 (build/index), 15 (server + read API), 17 (write-back: `POST /api/pin`, symbol catalog).
**Spec refs:** post-spec addendum agreed 2026-07-04 - extends [SPEC-v0.2.md](../SPEC-v0.2.md) §"D. In-dashboard curation"; honors Constraints (offline; never auto-certify) and the §"Cut" note (see below).
**Design refs:** [Product.md](../design/Product.md) §5 (human vouches for meaning), §10.3 (curation as visualization); [Dashboard.md §11.5](../design/Dashboard.md) (curation surface this extends).

## Why (and why it doesn't violate the v0.2 cut)

Manual one-by-one linking cannot scale past a toy repo: the reviewer of T17 confirmed the picker makes one edge cheap, but a real codebase has thousands of edges.
The fix is to split what the map draws into **two kinds of edges**:

- **Structural edges** (imports, the module tree) claim nothing about meaning - the code itself is the proof - so they are extracted **fully automatically** and never need a human.
- **Meaning edges** (pins: "this code *is* that capability") are what agents later trust over MCP, so they stay **machine-proposed, human-confirmed** - one keystroke, exactly the miner's propose→certify pattern.

v0.2 explicitly cut a second auto-*miner*; this task mines **structure, not meaning**, and proposes rather than writes.
Nothing here creates a pin or a certification without an explicit user action.

## Goal

The coding tree and inter-module references are mapped out with zero human work, and every entry gets ranked, explainable **pin suggestions** so the human's job collapses to naming meaning and confirming edges.

## Scope

- **Reference extraction** (`src/resolver/*`): extend `SymbolResolver` with `imports(relPath): string[]` - the raw import/require/re-export specifiers a file declares (tree-sitter, mirroring T17's `list()`).
- **Reference graph** (`src/analytics/references.ts`, wired into `artha build`):
  - Resolve relative specifiers to repo-relative files (`./`, `../`, extension inference, `index.*`); ignore bare/npm specifiers.
  - Roll file→file edges up to module level (reuse the T13/OQ5 module mapping); drop self-edges; keep counts.
  - Persist as an `artha_refs` table in `index.db` (from_module, to_module, count). Deterministic, offline, no LLM.
- **Read API** (`src/serve/api.ts`):
  - `/api/module/:id` gains `dependsOn: [{module, count}]` and `usedBy: [{module, count}]`.
  - `GET /api/refs` returns the whole module graph for the atlas.
- **Suggested pins** (`src/serve/suggest.ts` + `GET /api/suggest?id=<entry>`): ranked candidates from the T17 symbol catalog (so every candidate is guaranteed to resolve), scored by
  1. **reference proximity** - symbols in files one hop from the entry's already-pinned files (for a flow: the fan-out of its pinned entry point), weighted highest;
  2. **lexical overlap** - entry name/summary tokens vs symbol name/path (reuse T17's `rankSymbols` scoring);
  3. **embeddings, only when the index already carries vectors** (T14 embedder, all cache hits; a vector-less index skips this - no model load on the read path).
  Each hit carries a human-readable `why` (`referenced by pinned code` · `name match` · `related meaning`) - the instrument explains itself.
- **UI** (atlas identity, hairline until asked for):
  - Module page + inspector: a "Wired to" section listing depends-on / used-by as module links.
  - Atlas: selecting a tile faintly outlines its first-hop neighbors (glow stays reserved for certified coverage).
  - Capability pages: a "Suggested code" row under the pins list and beside unlinked flow rungs; **one click confirms** via the existing `POST /api/pin`; ignoring a suggestion costs nothing and writes nothing.

## Out of scope

- Symbol-level call-graph precision (v0.3; file-level imports rolled to modules is the v0.2 answer - flag if this proves too coarse).
- External/npm dependency edges; monorepo path aliases beyond relative specifiers (record as a known limitation).
- Any LLM involvement; any write without an explicit user action; auto-certify (forbidden everywhere).
- Drawing reference edges as lines on the atlas (neighbor outline only; leader lines stay capability↔module).
- v0.3 flow-coverage validation.

## Contracts produced

- `artha_refs` in `index.db` + `resolver.imports()` - the structural-edge source T19 (contradiction checks) and T18 (interview context: "used by billing and checkout - what does it mean to them?") can read.
- `dependsOn`/`usedBy` on module detail; `GET /api/refs`; `GET /api/suggest?id=` - suggestion confirmation rides T17's `POST /api/pin` unchanged.

## Acceptance criteria

- [x] `artha build` on a fixture repo writes a module-level reference graph from imports alone (relative specifiers incl. `index.*` and extension inference resolved; bare specifiers ignored); rebuilding is byte-deterministic.
- [x] `/api/module/:id` reports depends-on/used-by with counts; the module page and inspector render them as links; atlas selection outlines first-hop neighbors - all offline.
- [x] `GET /api/suggest?id=` returns ranked candidates, each with a `why`, and **every candidate resolves as a pin** (same guarantee as `/api/symbols`).
- [x] A flow with one pinned entry point gets its callees'/neighbors' symbols suggested for unlinked steps (the fan-out case: one human pin yields N suggestions).
- [x] Confirming a suggestion is exactly one action through `POST /api/pin`; no path writes a pin or a certification without that action.
- [x] Tests: import-resolution unit cases, graph roll-up over the fixture repo, suggestion ranking (proximity beats lexical; lexical beats nothing), and a booted-server suggestion→pin round trip.

## Status — done (2026-07-04)

Shipped as specified. Notes on decisions taken during the build:

- **Related-meaning without a model load.** The embedding signal reads the index's
  *existing* fact vectors (cosine of the entry vs other facts) and surfaces those facts'
  pinned symbols - so it is all cache hits, never embeds on the read path, and a vector-less
  index simply skips the term. The T14 embedder is not needed at suggest time.
- **Suggestions are top-level units, not class members.** A pin to `Money` covers the code;
  `Money.format` is a precision the picker still offers, but suggesting every member floods
  the list, so members are filtered out of suggestions (kept high-signal).
- **Flow rungs.** Confirmation rides `POST /api/pin` unchanged, which appends a base/entry
  pin (a flow's established T17 link surface). The "Suggested code" ledger therefore sits
  under the entry/pins section, where a confirmed suggestion visibly becomes a pin - rather
  than per-rung buttons that would leave a step's hollow rung unfilled and read as broken.
  Symbol-level step-pin coverage stays a v0.3 concern (per Out of scope).
- **One structural scan.** The link-picker catalog and the file import graph now come from a
  single cached resolver pass (`repoStructure`), shared by the picker and the suggester.
