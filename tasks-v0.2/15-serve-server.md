# Task 15 — `artha serve`: local web server + read API

**Depends on:** 12 (index read shape), 13 (dark-zone queue).
**Spec refs:** [SPEC-v0.2.md](../SPEC-v0.2.md) §"B. `artha serve`"; Constraints (local-first, no code egress for viewing); edge cases (cold start, thousands of symbols, non-author access).
**Design refs:** [Product.md](../design/Product.md) §10.5 (shape of the dashboard).

## Goal

Stand up `artha serve` — a local-first HTTP server that reads `.artha/index.db` + churn and
exposes the read API the dashboard renders, plus the app skeleton it serves. No cloud, no code
egress for viewing.

## Scope

- **`artha serve` command** (`src/serve/server.ts`): boots a local HTTP server (default
  `127.0.0.1:<port>`), serves the static frontend bundle + the JSON read API, reads the index
  **per request** so a fresh `artha build` is picked up. Diagnostics to stderr.
- **Read API** (`src/serve/api.ts`), all read-only:
  - `GET /api/map` — the **area/module-level** map feed: product areas ↔ top-level modules,
    each link's `status`, and dark-zone markers (from T13). **Never** the full symbol graph.
  - `GET /api/concept/:id`, `GET /api/flow/:id` — detail incl. states/transitions/steps + linked symbols.
  - `GET /api/dark-zones` — the ranked ask-queue (T13).
  - `GET /api/search?q=` — retrieval over the index (uses T14 blend when present).
- **OQ5 (developer-owned): what defines an "area."** Implement an `areasOf(index, config)`
  seam — config-declared areas, derived from concept groupings, or inferred from top-level
  folders — so the map's product column is populated before many concepts exist.
- **OQ7 (developer-owned): frontend stack + bundling.** Pick a framework/build that bundles
  into the npm package without bloating the offline CLI (v0.1 kept `cli.js` ~63 KB; the web
  bundle ships separately, not in the CLI hot path).
- **OQ1 note (non-author access):** v0.2 default is local-only / checked-out repo. Whether a
  read-only static export or shared serve is needed is **owned by T20** — leave a seam, don't
  build sharing here.

## Out of scope

- Write-back / mutation (T17). The map/detail **rendering** (T16 — this task ships the API + skeleton).
- The ask interview (T18). Contradiction panel (T19).

## Contracts produced

- `artha serve` + a documented JSON read API (the contract T16/T17/T19 build against).

## Acceptance criteria (SPEC Done-when: `artha serve` launches & reads the index)

- [ ] `artha serve` boots on localhost and serves the app + API against `.artha/index.db`.
- [ ] `GET /api/map` returns an **area/module-level** feed (no per-symbol explosion), with dark-zone flags.
- [ ] **Cold start** (empty/missing index) → API returns a valid, mostly-dark map, **not** an error.
- [ ] A fresh `artha build` is reflected on the next request without a server restart.
- [ ] Viewing is fully **offline** (no network calls on any read endpoint).
- [ ] API responses are covered by tests (vitest over a fixture index), incl. the cold-start shape.
