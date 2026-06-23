# Task 14 — Embedding-assisted ranking

**Depends on:** 12 (the index).
**Spec refs:** [SPEC-v0.2.md](../SPEC-v0.2.md) §"E. Embedding-assisted ranking"; Done-when (embedding-assisted ranking live); Constraints (token-frugal preserved).
**Design refs:** [Product.md](../design/Product.md) §9 (ranking), §12 (v0.2 roadmap); [schema-v0.1.md](../design/schema-v0.1.md) §8.

## Goal

Upgrade retrieval — for both the MCP server and dashboard search — from lexical-FTS +
structural to **embedding-assisted**, so "find the right meaning for this task/query" returns
better matches without inflating the token budget.

## Scope

- **Build-time vectors** (`src/build/embeddings.ts`): `artha build` embeds each fact's
  `heading + body` and stores the vector in the index (new `artha_embeddings(fact_id, vector)`
  or equivalent). Computed at build → **viewing/retrieval stays offline**.
- **Retrieval blend**: extend the v0.1 ranker so relevance = blend of (embedding cosine
  similarity) + (FTS lexical) + (structural overlap) × `status`. Keep it additive so a
  no-embedding fallback still ranks (graceful if vectors are absent).
- **OQ3 (developer-owned): local vs API embeddings + which model.** Local-first/privacy argues
  on-device; quality/effort argues an API embedder. Implement behind an `Embedder` interface so
  the choice is swappable and the index records which model produced the vectors (for cache
  invalidation on model change).
- **Budget unchanged**: embeddings change *which* items rank, not how many tokens return — the
  ~1.5k default budget from v0.1 holds.

## Out of scope

- Re-embedding on every query (build-time only). Cross-repo / shared vector stores.

## Contracts produced

- `Embedder` interface + a default impl; index vectors; an updated `rank.ts` blend reused by MCP (T08) and dashboard search (T16).

## Acceptance criteria (SPEC: embedding-assisted ranking)

- [ ] `artha build` writes a vector per fact, tagged with the model id.
- [ ] On a fixture, a **semantically-but-not-lexically** matching query (synonyms, no shared
      keywords) ranks the right fact higher **with** embeddings than the lexical-only baseline.
- [ ] Retrieval still returns sensibly when vectors are absent (fallback to FTS × structural).
- [ ] A model-id change invalidates/re-embeds rather than mixing vectors.
- [ ] Token budget unchanged; default bundle still ≤ ~1.5k tokens.
- [ ] Query-time retrieval stays **offline** (embeddings precomputed at build; only build may call an API embedder if OQ3 picks one).
