# Artha — build progress log

Running log of task completion against [tasks/README.md](tasks/README.md) (v0.1),
[tasks-v0.2/README.md](tasks-v0.2/README.md) (v0.2), and
[tasks-v0.3/README.md](tasks-v0.3/README.md) (v0.3). Newest entries first.

## Status - v0.3

| #    | Task                                | Status       | Notes |
|------|-------------------------------------|--------------|-------|
| 21a  | Inferred layer - deterministic      | ✅ done      | all four offline extractors, evidence-pinned, `origin`/`confidence` in parallel index tables (+ `artha_inferred_steps`): module cards + state machines (slice 1), flow skeletons + naming conventions (slice 2). Byte-deterministic; the moonlight map is complete |
| 21b  | Inferred layer - LLM synthesis      | ⬜            | opt-in, spend-capped enrichment + verification gate |
| 21c  | Inferred layer - dashboard reframe  | 🟡 partial   | two-light grammar, prose-first pages, delta band, worded confidence shipped; flow (Reaches) + convention (Symbols that match) moonlight pages + module/catalog sections shipped in slice 2; **KPI reframe (D11) shipped via 23a**; **evidence revealed (D5) shipped via 23d-1**; **vouch-by-reading + materialize-on-touch (D9 core, OQ-A) shipped via 23d-2**; **the review walk (D9) shipped via 23d-3**; **the delta band as human ink on human pages (D6) shipped via 23d-4**; the value-ranked queue (D10) remains - delivered by the rest of 23d |
| 22   | Contradiction view                  | ⬜            | inferred vs certified |
| 24   | Usability hardening                 | ✅ done      | full UX audit 2026-07-15 walked every view as a first-time user; all seven slices shipped 2026-07-15/16 - **one vocabulary** (vouch everywhere via `statusWord`, three-light standing ladder, "Show the code" reveal), **honest numbers** ("Explain next" queue with badge = rows, dark = unvouched, reachable vouched % shared by top bar / area meters / area bars, self-labelled "% vouched" readouts, solo pseudo-areas off the area chart), **orientation** (board fit-to-view + zoom + Ctrl-scroll, route scroll-into-view, board legend defining Δ), **findability** (FTS prefix on the typed token, rule/decision hits land on their module, ↑↓/Enter combobox), **one card per capability** (`capabilitiesByPrimaryArea` + "also in" chips, nav dedup), **walk safety** (Enter never writes, inline vouch-undo via the written id), **reading order** (flow Steps lead, `related` resolves names server-side (`RelatedRef`), "not recorded yet" state cells, `CodeProse` code spans); 414 tests, lint, both typechecks, live CDP verification per slice - see [tasks-v0.3/24-usability.md](tasks-v0.3/24-usability.md) |
| 23   | Atlas elevation                     | 🟡 23a-23d + 23e-1 done | honest KPIs (% vouched / % described), the **blackboard Board** (handmade flowchart, chalk = light), **inner boards** (23b - drill a module into its own blackboard), **the observatory** (23c - three hand-rolled instrument charts on a fourth nav view, dataviz method), **evidence revealed** (23d-1 - every pin reveals its exact source lines, D5), **vouch-by-reading** (23d-2 - an inferred concept/flow vouches/edits in place, materializing into a real entry with `derived_from` provenance, D9 core + OQ-A), **the review walk** (23d-3 - press R on any module/capability page to sweep its unvouched claims one at a time, D9), and **the delta band** (23d-4 - a distinct "What the code can't say" slot of human ink on every capability/module page, backed by an additive `notes` field that never un-certifies, D6); **the value queue** (23d-5 - the ask queue ranked by agent-consumption × churn × uncertainty, every row wording its own "why now", D10) - 23d complete; task 24 (usability hardening) done; **the lifecycle in chalk** (23e-1 - concept state machines redrawn in the board's hand, left-to-right with orthogonal returns routed clear of every box, each box wearing the concept's own standing) - see [tasks-v0.3/23-atlas-elevation.md](tasks-v0.3/23-atlas-elevation.md) |

OQ locks (2026-07-05): index-only regenerable cache + materialize-on-touch (OQ-A);
`origin`/`confidence` in parallel `artha_inferred*` tables, human `status` trio untouched (OQ-B);
worded confidence `read from code` / `inferred` / `uncertain` (OQ-D); 21a before T18 (OQ-E).
See [tasks-v0.3/21-inferred-layer.md](tasks-v0.3/21-inferred-layer.md).

UX locks (2026-07-15, interviewed for task 24): **vouch** is the one public word for the act and state
(`certified` survives only in storage/API); the visible standing ladder is **vouched / described / unexplained**
(+ stale modifier; bucket words thin/partial/understood leave the UI); the queue view is **"Explain next"**
(badge = row count); **dark = unvouched** (copy redefined, server semantics unchanged); the vouched KPI becomes a
**reachable churn-weighted share** (modules with >= 1 fresh vouched fact; saturating depth stays internal for ranking).
See [tasks-v0.3/24-usability.md](tasks-v0.3/24-usability.md).

## Status — v0.2

| #  | Task                          | Status   | Notes |
|----|-------------------------------|----------|-------|
| 11 | Schema — `concept` + `flow`   | ✅ done  | additive kinds; validate · round-trip · index-compile; `design/schema-v0.2.md` |
| 12 | `artha build` — concept/flow  | ✅ done  | flow entry/step pins resolved+hashed; states/transitions/steps tables; FTS |
| 13 | Churn + coverage ranking      | ✅ done  | OQ4 locked (90d window · graded coverage); `darkZones()` queue, swappable `scoreModule()` |
| 14 | Embedding-assisted ranking    | ✅ done  | OQ3 local model (transformers.js/MiniLM); build vectors + cosine blend; offline query |
| 15 | `artha serve` — server + API  | ✅ done  | OQ7 Vite+React · OQ5 top-level-folders+seam; node:http API, cold-start safe |
| 16 | Product↔Code map UI           | ✅ done  | map (lit/dim cross-links) + concept/flow detail + search + cold-start ask-queue; 12 SSR render tests. **UI read as confusing → redesigned (16a–c, see [design/Dashboard.md](design/Dashboard.md))** |
| 16a| Dashboard redesign Ph.1        | ✅ done  | instrument re-skin: Understanding Map (churn=size, coverage=brightness) + KPI strip + drawn state machine; 19 SSR render tests |
| 16b| Dashboard redesign Ph.2        | ✅ done  | capability catalog (state-chain/coverage cards + filters) · hover-to-connect leader lines · ⌘K command bar · `/api/catalog`; 24 web render tests |
| 16c| Dashboard redesign Ph.3        | ✅ done  | engineer module view (`/api/module/:id`) + flow ladder + cold-start funnel — shipped inside the **atlas shell** rebuild ([Dashboard.md §11](design/Dashboard.md)) |
| 16d| Dashboard v3 — the atlas shell | ✅ done  | page-of-sections → full-screen app shell: treemap Understanding Atlas, hash routes (deep-linkable selection), navigator/inspector, product-language everywhere; 30 web tests |
| 17 | Write-back (link/certify/edit)| ✅ done  | `POST /api/certify·pin·entry` over `src/serve/write.ts`; YAML git diffs + transactional rebuild/rollback; certify "lights up" the atlas; edit un-certifies; +22 tests, live E2E |
| 17b| Auto-map (refs + suggestions) | ✅ done  | `artha_refs` import graph (auto, offline) + ranked `/api/suggest` pins (proximity→lexical→embedding, each with a why); atlas neighbour-outline · module/inspector "Wired to" · capability "Suggested code" (1-click via `POST /api/pin`); +29 tests |
| 18 | "Ask the human" loop          | ⬜ next  | unblocked (write/certify plumbing shipped; hooks into the curation seam) |
| 19 | Contradiction preview panel   | ⬜       | §6.1 deterministic only |
| 20 | v0.2 success test             | ⬜       | non-author reads the map |

Critical path: 11 → 12 → 15 → 16/17 → 18 → 20. Tasks 13, 14, 19 parallelize off it.

## Status — v0.1

| #  | Task                          | Status   | Notes |
|----|-------------------------------|----------|-------|
| 01 | Project scaffold & tooling    | ✅ done  | tsup · commander · vitest · Biome |
| 02 | Schema, types & validation    | ✅ done  | AJV 2020 · YAML load/dump round-trip |
| 03 | Config loading & `artha init` | ✅ done  | `loadConfig` defaults + idempotent init |
| 04 | SymbolResolver (tree-sitter)  | ✅ done  | `web-tree-sitter` pinned 0.20.8 |
| 05 | `artha build` — index         | ✅ done  | node:sqlite + FTS5, zero deps; staleness flip |
| 06 | `artha mine` — git → drafts   | ✅ done  | prefilter + Anthropic structured output + `.mined` ledger |
| 07 | `artha review` — Ink TUI      | ✅ done  | Ink + React; one-keypress certify/edit/reject; offline |
| 08 | MCP server (stdio)            | ✅ done  | `context_for_task` + `why`; ranked, budgeted, certified-only default; offline |
| 09 | `artha export --agents-md`    | ✅ done  | certified-only `AGENTS.md` via T08 `query.ts`; deterministic; `--out` |
| 10 | v0.1 success test             | ✅ done  | A/B on real proof repo: **−56% discovery tool-calls** with Artha (≥30% bar) |

Critical path: 01 → 02 → 04 → 05 → 08 → 10.

## Log

### 2026-07-16

- **T23e-3 - the team's board** done - the last of the board refinements ([tasks-v0.3/23-atlas-elevation.md](tasks-v0.3/23-atlas-elevation.md) §23e). A hand-arranged blackboard used to die in the browser that made it: the person who actually understands the system arranges it once, and nobody else ever sees it. It can now be **committed**.
  - **The seam** (`src/serve/boardSeats.ts`, `GET`/`POST /api/board-layout`): `.artha/board.yaml`, an ordinary git diff - reviewed like any other change, cloned with the repo. **Save for the team** publishes the board **as it stands** - every box, not just the ones you moved, because what a teammate should open is the arrangement you are *looking at*, not a patch over an auto layout that may shift under them. Your local seats then clear: they are the team's now, so there is nothing of yours left unpublished (and the button goes away until you move something again).
  - **Three layouts, one order**: **your hand** (dragged, kept in this browser) → **the team's** (committed) → the **automatic** one. `useBoardDrag` gained a `base` for the middle one, and `hasHandLayout` still means "*I* have unsaved moves" - a board merely sitting on the team's layout has nothing for you to tidy away. Tidy forgets only what you moved and drops you back on the team's board; it never silently rewrites it. (To be rid of the team's, delete the file - which the file's own header comment tells you.)
  - **Deliberately not a fact.** It carries no meaning about the code, so it stays out of `artha_facts`, out of the index, and off the build entirely - nothing downstream (MCP, export, the KPIs) can see it. That is also why the write **does not ride `commitWrite`**: there is no index to rebuild and nothing a bad layout could break, so a rebuild would be theatre. It still takes the write lock, so two tabs can't interleave the one file, and it keeps the same 415 cross-site guard the fact writes have.
  - **Written to be reviewed, read to never break**: sorted by module and rounded, so re-saving an unmoved board produces **no diff at all**; an empty layout deletes the file rather than committing an empty `modules:`. On the read side a mangled or half-merged file costs the reader their arrangement, not their dashboard - it reads as "no layout" and the board lays itself out.
  - **Verified**: typecheck (CLI + web) + Biome clean; **440 tests pass** (+10: round-trip; no layout before one is committed; a reviewable diff - sorted, rounded, self-explaining; re-saving unmoved is byte-identical; empty deletes the file; a mangled file never throws; a seat that isn't two real coordinates is dropped; never seated off the paper; booted-server commit → serve-back → clear; 400 on a bad seat + 415 on the cross-site guard). Also fixed an a11y lint the new control raised: the save result is an `<output>` (the status live-region) rather than a `<span role="status">`. Web bundle 81.1 KB gzip JS. **Live E2E** on the demo over CDP: with no local layout there is no Save button; a synthetic-PointerEvent drag of `auth` made it appear and stored the seat; clicking it wrote all five modules to `.artha/board.yaml`, reported "Saved for the team", cleared the local layout and hid the button; a fresh reader with no `localStorage` then opens the team's board.
  - **Remaining on T23e**: more trace entry points (navigator flow rows + catalog flow cards offer the trace; inferred flow skeletons trace in moonlight).

- **T23e-2 - the board straightened + its provinces** done - two of the three board refinements ([tasks-v0.3/23-atlas-elevation.md](tasks-v0.3/23-atlas-elevation.md) §23e); the shareable committed layout is the remaining one.
  - **Crossing-minimizing order** (`straightenRows`, `web/src/board.ts`): a row now orders by where its edges actually land - the barycentre of a node's neighbours in the row above/below - swept up and down four times. A node with nothing in the adjacent row keeps its seat rather than drifting to the edge. Deterministic by construction (a seeded order, a fixed sweep count, the sort key breaking every tie), which matters more here than the last crossing. `layeredLayout`'s fourth argument became a `LayoutOrder` (`{ sortKey?, groupOf? }`), so 23b's inner file board gets the pass for free.
  - **Chalk provinces** (`areaProvinces`, pure over the *placed* nodes): a dashed chalk boundary around each product area, recessive - the ground the flowchart stands on, not a mark competing with it. Drawn **only where an area's boxes truly sit together**; a boundary that would swallow another area's module is left undrawn, because the board would rather say nothing than draw a border that lies. Reading the placed nodes (not the auto layout) means a hand-dragged board re-answers honestly.
  - **The two wanted opposite row orders** - a barycentre pass reorders by connectivity, which scatters areas; provinces need areas whole. Resolved with the developer in favour of **barycentre *within* areas**: the pass orders the areas themselves, and the boxes inside each, so a province stays one unbroken block and the arrows straighten *around* the areas rather than through them.
  - **Known and accepted**: the board is layered by dependency depth and a product area is not, so **the demo draws no province at all** (`Platform` owns `auth` at layer 0 and `notifications` at layer 3 with two other areas between them; every other demo area owns one module). That is the rule working, not a gap - surfaced to the developer, who kept it: it costs little, stays quiet when it cannot be honest, and pays off on a repo wide enough for an area to cluster. Terrain remains the lens where provinces are contiguous by construction. The render path is verified by SSR tests over a feed that does cluster, since the demo cannot exercise it.
  - **Verified**: typecheck (CLI + web) + Biome clean; **430 tests pass** (+7: a row reorders to cut a crossing; every product area stays contiguous in its row; `areaProvinces` outlines a clustered area / skips a lone box / draws nothing rather than a lying border; the board renders + names the outline; the selected area's province lights). Web bundle 80.7 KB gzip JS. Live check on the demo board (`npm run demo`, CDP element capture): the flowchart draws unchanged and correctly carries no province.

- **T23e-1 - the lifecycle in chalk** done - the first slice of the trimmed craft debt ([tasks-v0.3/23-atlas-elevation.md](tasks-v0.3/23-atlas-elevation.md) §23e), and the piece that finally makes the atlas read as **one continuous hand at every altitude**: repo board → module board → lifecycle, all the same chalk.
  A concept's state machine was the last diagram still drawn in the old instrument register (a mono-labelled vertical spine with bezier arcs); it now draws with the board's own rough strokes.
  - **The shape** (`web/src/board.ts` `stateLayout`, pure + SSR-tested): states are chalk boxes gone over twice, laid out **left-to-right** - the start on the left, the life advancing rightward, the longest path deciding the column so no state ever sits left of what leads into it - and a **return** (a cancel, a retry) drops into a **lane under the boxes** and runs back **orthogonally**. Nothing else arrives from below, so a way back is unmistakable.
  - **Its own engine, deliberately** - not an adapter over 23b's `layeredLayout`. A lifecycle wants three things an import graph does not: the states' **declared** order (read verbatim from code - that *is* the order the life runs in; alphabetical never is), **columns** instead of rows, and a **real cycle break**. On an import graph a cycle is an anomaly the board can afford to seat by name; on a state machine the returns *are* the shape, and a lifecycle where every state has a way in would collapse into a single column under the board's fallback. Back-edges are found by DFS rooted at the true starts, so a lifecycle that loops all the way round still reads from the state the code declares first.
  - **The layout emits the route, not just the endpoints** - because "a way back never crosses a state it isn't about" is geometry, and geometry is testable. Verticals only ever run in a column gap and the long horizontal only ever in the lane: the two places a box can never be. Where a box sits directly under another the route steps aside into the gap first - caught live, not in theory: the demo's own `past_due`/`canceled` share a column, so the first draft dropped the `retry succeeds` return straight through `canceled`. Returns **nest** (the shortest hugs the boxes, longer ones swing out below), which is also a fix found by writing its test: seating a long return *close* would force every shorter one to cut across it.
  - **A quiet dishonesty cleared** (CLAUDE.md's "fix what you see"): the diagram drew **every** lifecycle in phosphor, so an unvouched concept's states wore the light of trust. A box now carries the concept's own standing (phosphor vouched / amber proposed / ember stale), while every **arrow stays human ink** - the code never holds the trigger that moves a concept along (21a leaves transitions blank on purpose), so the two lights hold here too (D2). `StateMachine` takes `status` and is now a dumb chalk renderer over the pure layout.
  - **Verified**: typecheck (CLI + web) + Biome clean; **423 tests pass** (+9: left-to-right layering incl. longest-path-over-shortcut; a way back routed through the lane, never a forward arrow; declared order over the alphabet; a fully-cyclic lifecycle still reads from the declared start; nested lanes; determinism under transition reordering; no two boxes overlap; and the invariant - **no return leg touches a box it isn't about** - on the demo's stacked-column shape and on a three-deep column reached from both ends). Web bundle 80.0 KB gzip JS / 9.8 KB gzip CSS. **Live E2E** on the seeded shop (`npm run demo`) with a CDP element capture at 3×: `concept.subscription` draws `trialing → active → past_due`/`canceled` in phosphor chalk with `retry succeeds` stepping around `canceled` and arriving into `active`'s bottom, its trigger riding the lane; the stale `concept.checkout` draws `cart → paying → paid` in ember; trigger labels now sit inside the column gap (the gap widened to 124 after the first pass showed "first payment succeeds" spilling over both boxes).
  - **Remaining on T23e**: board refinements (crossing-minimizing barycenter order within layers, dashed chalk area provinces, a shareable committed `.artha/board.yaml` layout) and more trace entry points (navigator flow rows + catalog flow cards offer the trace; inferred flow skeletons trace in moonlight). Then 21b (LLM synthesis) → 22 (contradiction view) → T18.

### 2026-07-12

- **T23d-4 - the delta band (D6)** done - the fourth sub-slice of "reading is reviewing" ([tasks-v0.3/23-atlas-elevation.md](tasks-v0.3/23-atlas-elevation.md) §23d), and the piece that gives the *human* pages the one thing the machine can never supply: the delta.
  Every capability and module page now carries one visually distinct **"What the code can't say"** slot for the business rules, constraints, history, and warnings no code holds - human ink over the machine's print (D6: "the reader can always tell which is which").
  - **The field** (`src/schema/types.ts`, `schema.json`): a free-prose **`notes`** on `BaseEntry` (every kind), indexed as a new `artha_facts.notes` column (`src/build/db.ts`, `build.ts`) and **folded into the FTS body** (not the `body` column) so search finds "that warning about the gateway" while the retrieval prose stays pure. Round-trips through load/dump in canonical field order (after `derived_from`). `ConceptDetail`/`FlowDetail` carry it (`src/serve/api.ts`).
  - **Additive by design** (`src/serve/write.ts` `setNotes`, `POST /api/notes`): recording the delta **mirrors `addPin`, not `edit`** - it merges only `notes` and leaves the standing untouched, so adding a warning to a *certified* concept keeps it certified. The vouched claim (its states, its summary) is unchanged; this is knowledge layered on top, not a correction of it (contrast the un-certifying `saveEntry`). An empty string clears the field entirely (omitted, never a blank string). Re-validated through T02; an inferred id has no YAML, so it is refused. Rides the existing transactional `commitWrite`.
  - **Human ink on the reading surface** (`web/src/components/Delta.tsx`): `DeltaBand` renders `notes` as full-strength, slightly-heavier **human ink** (no new hue, D2) - a filled solid panel - or a per-surface **invitation** (dashed) when empty, so the slot is *always present* (D6). The additive `DeltaEditor` prefills the current text (correct, don't compose, D8) and shows no "returns to proposed" caveat because it does not un-certify. **Per-field provenance**: the concept states table now marks a filled effect/invariant as human ink and an empty one as an honest **"not read from code"** rather than a bare dash (also clears a 23e honesty item). The module page - not an entry, so read-only - carries a compact `ModuleDelta` framing band directly under the machine (moonlight) lead: the human-ink *counterpart* to the machine's reading, naming the recorded why (decisions + invariants) or inviting one; skipped only on a pure cold module the dark-empty funnel already speaks to. `Curation` gains `setNotes` (`web/src/App.tsx`).
  - **Verified**: typecheck (CLI + web) + Biome clean; **405 tests pass** (+10: `setNotes` additive-keeps-certified / clears-on-empty / 404s-unknown + refuses-inferred; `conceptDetail`+`flowDetail` carry notes / null when unwritten; the build round-trips `notes` into the column and the FTS body [`dunning` finds the concept]; booted-server `POST /api/notes` lands human ink + stays certified + a `notes:` YAML diff, and clearing removes the field still-certified; web render: the concept filled delta band + human ink + "recorded by your team" + state-cell provenance, the flow dashed invitation + "Add the delta", the module framing band with the why count, and the dark-module gate that omits it). Web bundle 77.1 KB gzip JS / 9.6 KB gzip CSS. **Live E2E** on the seeded shop (`node scripts/demo.mjs`): `POST /api/notes {id: "concept.subscription", notes: …}` returned **`status: certified`** (additive), wrote a `notes: |-` block-scalar git diff sitting between `pins` and `certified_by`, and `/api/search?q=rate-limits` then found the concept; **headless-Edge** on the demo's Subscription concept page renders section **02 "What the code can't say"** as a filled panel with the two delta lines in bright human ink + "recorded by your team" + "Edit the delta", and the Lifecycle table shows filled cells in human ink beside muted italic "not read from code"; the refund flow page shows the dashed invitation ("Add the delta"); the billing module page pairs the moonlight machine lead with a human-ink "Your team has recorded 3 things here the code can't say" band.
  - **Remaining on T23d**: the value-ranked queue with a worded "why now" (D10 - agent-consumption × churn × uncertainty). Then 23e (craft debt); and on the inferred track 21b (LLM synthesis) → 22 (contradiction view).

### 2026-07-11

- **T23d-3 - the review walk (D9)** done - the third sub-slice of "reading is reviewing" ([tasks-v0.3/23-atlas-elevation.md](tasks-v0.3/23-atlas-elevation.md) §23d), and the piece that turns a page full of machine-described and proposed meaning into an actual *sweep*. Reading a page now **is** reviewing it: press `R` (or the new top-bar **Review N** pill) on any module or capability page and its unvouched claims come up one at a time in a focused lightbox, one keystroke per decision - the writable culmination of D9 ("the vouch affordance lives on the reading surface; there is no separate review mode; the proposed-queue pattern is *not* extended to the ambient layer").
  - **Page-scoped by design.** The walk only ever sweeps what you are already reading - the unvouched claims on *this* page - never a global queue over thousands of inferred facts (the "tiredness machine" the 21c contract explicitly forbids). The claim set is two pure derivations (`web/src/derive.ts`): `moduleReviewClaims` (proposed human capabilities, then the machine-described concepts + flows, then proposed rules + decisions - in reading order) and `capabilityReviewClaims` (the capability itself, unless already certified). Certified facts are done and left out; module **cards** and naming **conventions** can't be vouched yet, so they stay read-only on the page and out of the walk - every station is something you can actually decide.
  - **The lightbox** (`web/src/components/ReviewWalk.tsx`): the claim on the left in its own light (moonlight name + worded confidence for machine-described, a status badge for proposed), the exact code it was read from on the right (auto-revealed via `/api/evidence`, reusing `EvidenceCode` - D5, so no claim is an unexplained assertion). One keystroke per decision: `j`/`k` (and arrows) move; `v`/Enter **vouches**; `e` opens an inline **correct** editor (D8); Esc leaves. A progress row of dots (filled on a decision, hot on the current) plus `n / m` tracks the sweep; a done panel closes it. `x` (flag a disagreement) is an honest deferred key in the legend, awaiting T22's disagreement surface.
  - **No new backend.** Vouching rides the *existing* write path - `certify()` routes an `inferred:` id through `materializeInferred` server-side (23d-2), so one call vouches both tiers, and the walk stays put and advances (unlike the page's certify, which navigates to the freshly-materialized entry). Correcting rides `saveEntry`. The App yields the keyboard to the walk while it is open and re-reads the page feeds after each decision, so the page behind is current on exit. `TopBar` gains `onReview` + `reviewCount` (the pill, shown only when the page carries unvouched claims); the shell adds an `R` shortcut guarded against typing.
  - **Verified**: typecheck (CLI + web) + Biome clean; **395 tests pass** (+8: `moduleReviewClaims` sweeps proposed + machine-described and excludes certified/card/convention, normalizes each tier's origin/editability/states, and orders proposed-caps → inferred → rules; `capabilityReviewClaims` one-station-when-proposed + empty-when-certified; `ReviewWalk` renders the current claim + code head + vouch + key legend + deferred `x`, lights a machine claim in moonlight with worded confidence + states, and shows a done panel when empty; `TopBar` surfaces the pill with the count and hides it at zero). Web bundle 76.3 KB gzip JS / 9.4 KB gzip CSS. **Live CDP E2E** on the seeded shop (`dist/cli.js serve`): on `src/checkout` the **Review 3** pill showed, `R` opened the walk on the stale `Checkout` concept with its `Checkout.ts` source revealed, `j` advanced to `Refund a purchase`, and `v` **certified `flow.refund` as a real `.artha/flows/refund.yaml` git diff** (68% vouched, 3 certified, the inner-board `Checkout.ts` box lit phosphor); the moonlight `Place Order` flow rendered its `Billing → Notifications` fan-out with worded confidence; the `e` correct editor (prefilled name/summary + "returns to proposed" note) and the done panel both verified.
  - **Remaining on T23d**: the delta band as human ink on human capability/module pages (D6) and the value-ranked queue with a worded "why now" (D10). Then 23e (craft debt); and on the inferred track 21b (LLM synthesis) → 22 (contradiction view).

### 2026-07-09

- **T23d-2 - vouch-by-reading / materialize-on-touch (D9 core, OQ-A)** done - the second sub-slice of "reading is reviewing" ([tasks-v0.3/23-atlas-elevation.md](tasks-v0.3/23-atlas-elevation.md) §23d), and the piece that makes the machine layer *actionable*. Reading an inferred (moonlight) concept or flow now **is** reviewing it: the page carries a "Reading is reviewing" vouch bar, and vouching/editing a machine candidate turns the regenerable cache into a real `.artha/` YAML fact that enters the normal human lifecycle - the locked **OQ-A** (materialize-on-touch), and the writable core of D9 ("the vouch affordance lives on the reading surface; one keystroke certifies via the existing T17 path; edit-in-place is the deeper correction").
  - **The materialize path** (`src/serve/materialize.ts` `materializeInferred`, pure over the index): an inferred **concept** → a `Concept` (name + machine summary as the starting draft, states read verbatim, transitions/effects left as the human delta), an inferred **flow** → a `Flow` (the entry point becomes `entry`; the fan-out is *never* fabricated into `do` steps - that stays the human's to author). A fresh collision-free `concept.…`/`flow.…` id (schema suffix `[a-z0-9_]+`, disambiguated `_2`,`_3`… on clash), and **`derived_from: inferred@<hash>`** provenance recording the content hash of the code the description was read from (drift-detectable). `certify` stamps it certified via T07's `resolveIdentity`; an `edit` patch overrides name/summary and leaves it **proposed** (D8: correct the draft, don't compose blank). Validated through T02 before it touches disk. Only concepts + flows materialize - a module **card** has no human kind and a **convention** needs a rule the code can't state, so both stay read-only moonlight with an honest note (a later slice can ask for the missing part).
  - **The wiring** (`src/serve/server.ts`): `POST /api/certify` and `POST /api/entry` detect an `inferred:…` id and route through `materializeInferred` inside the same transactional `commitWrite` (write → rebuild → roll back on a bad build), opening the index for the one read. On the rebuild the new human entry pins the same code the candidate did, so the candidate is **suppressed** (materialize-on-touch, the existing 21a `humanPinnedRefs` gate) - never a duplicate. The write reports the **new human id**; the dashboard (`web/src/App.tsx` `landAfterMaterialize`) navigates to the now-vouched page, which glows phosphor. The `VouchBar` (`web/src/components/Inferred.tsx`) reuses `CertifyButton` + `EditFields`; a schema-level `derived_from` (optional, every kind) round-trips through load/dump.
  - **Verified**: typecheck (CLI + web) + Biome clean; **387 tests pass** (+14: `materializeInferred` concept→certified-with-states-pin-provenance / flow→entry-no-fabricated-steps / proposed-without-certify / edit-patch / card+convention refusal / 404 / id-collision; booted-server `POST /api/certify` on an inferred id materializes + suppresses + writes `derived_from`, `POST /api/entry` materializes proposed, module-card → 400; web render: the vouch bar on a concept, read-only without curation, the honest card note; `derived_from` validates). Web bundle 73.5 KB gzip JS / 8.6 KB gzip CSS. **Live E2E** on the seeded shop (`npm run demo`): `POST /api/certify {id: "inferred:concept:…OrderState"}` returned `concept.order_state` certified; the `.artha/concepts/concept.order_state.yaml` git diff carries the 5 states + `derived_from: inferred@299181`; the candidate dropped from `/api/catalog` and `/api/inferred/…` 404s; the flow vouched to `flow.place_order` (entry pin, no steps), an edit materialized `concept.channel` proposed, and a module card was refused 400. **CDP click** on the demo's Order State inferred page: clicking "Certify" materialized the concept and **navigated to `#/concept/concept.order_state` showing the certified badge** - reading became reviewing in one click.
  - **Remaining on T23d**: the review *walk* (D9 - `R`/`j`/`k` claim-by-claim, composing 23d-2's vouch + 23d-1's evidence; `x` flag awaits T22), the delta band as human ink (D6), the value-ranked queue (D10). Then 23e (craft debt); and on the inferred track 21b (LLM synthesis) → 22 (contradiction view).

- **T23d-1 - evidence, revealed (D5)** done - the first sub-slice of "reading is reviewing" ([tasks-v0.3/23-atlas-elevation.md](tasks-v0.3/23-atlas-elevation.md) §23d), and the foundation the D9 review pass will reuse. Every pin on the dashboard now reveals *the exact source it points at* one interaction away, so no machine claim (and no vouched pin) is an unexplained assertion - the literal subject of D5 ("every machine sentence carries its evidence, one interaction away").
  - **The read surface** (`src/serve/evidence.ts` `evidenceFor` + `GET /api/evidence?ref=path%23Symbol`, `src/serve/server.ts`): resolve a `path#Symbol` pin to its symbol and return that symbol's own source lines (`{ ref, symbol, path, startLine, endLine, lines, truncated }`). Pure over the repo via a new **cached `repoResolver`** (`src/serve/symbols.ts`) - read *off the index*, like the link-picker symbol catalog, so it stays offline and is only hit on a click (a reveal), never on the hot path. A long symbol (a big class) is capped at 60 lines with an honest `truncated` remainder; a ref that no longer resolves (drifted/renamed code) or an unreadable file returns `null` → the server 404s and the reveal shows a "this code has moved" note. Only the symbol's own span is returned (a `const` above the function is excluded), so the evidence is exactly what the claim was read from.
  - **The reveal** (`web/src/components/Evidence.tsx`): `EvidenceReveal` renders a quiet moonlight **"Read from code"** toggle beside the pin; clicking it **lazily** fetches once and drops `EvidenceCode` - a line-numbered code panel with the real 1-based line span in its caption - then flips to "Hide code". The panel wraps full-width beneath the pin (the `.pin` flex-wrap), all-`<span>` markup (styled to lay out as blocks) so it stays valid inside an inline pin. Wired into the inferred evidence pins (`Inferred.tsx`, replacing the redundant static "read from code" chip - confidence still sits in the header) and the capability concept/flow pin lines (`CapabilityPages.tsx`, keeping the linked/stale standing). Nothing here mutates: it shows code, it never writes.
  - **Verified**: typecheck (CLI + web) + Biome clean; **373 tests pass** (+8: `evidenceFor` returns the symbol's own span / caps a long symbol with an honest remainder / null on a drifted ref; booted-server `/api/evidence` 200 + 404 for unresolvable + 404 for a missing ref; `EvidenceCode` shows path·span·numbered lines + "+N more lines"; `EvidenceReveal` is a collapsed lazy toggle; the inferred page's evidence pin carries the toggle). Web bundle 73.1 KB gzip JS / 8.6 KB gzip CSS. **Live E2E** on the seeded shop (`dist/cli.js serve`): `/api/evidence` returns the exact source of a real symbol (`evidenceFor` itself, lines 38-64) and 404s a ghost ref; headless-Edge + CDP on the demo's **Order State** inferred page - clicking "Read from code" reveals `export type OrderState = 'cart' | 'placed' | 'paid' | 'fulfilled' | 'cancelled';` in a line-numbered panel, letting a reader check "5 states read from the OrderState type" against the code itself.
  - **Remaining on T23d**: the review pass (D9, reuses `/api/evidence`), the delta band as human ink (D6), the value-ranked queue (D10). Then 23e (craft debt); and on the inferred track 21b (LLM synthesis) → 22 (contradiction view).

- **T23c - the observatory (charts that answer questions)** done - the next slice of the atlas elevation ([tasks-v0.3/23-atlas-elevation.md](tasks-v0.3/23-atlas-elevation.md)), chosen off the 23-doc's impact-per-effort order. The signal behind the map now has a home: a fourth navigator view (`#/observatory`, glyph `◔`) holding three hand-rolled instrument charts. The board stays a clean blackboard; density and analytics live here instead - the design philosophy locked at the board pivot ("charts stay in the observatory; the board stays clean") made real.
  - **Built to the dataviz method** (loaded the `dataviz` skill first): one axis each, recessive dashed grid, direct labels over legend boxes, the **status palette as the chart palette** (no new hues - phosphor vouched / moonlight described / dim ink unexplained), `<title>` hover tooltips on every mark (consistent with the board/atlas). Colour is never the only encoding - position (the quadrant, the bar order) and a shared legend carry the same reading, so a colour-blind or printed page still answers the question. All hand-rolled SVG like `treemap.ts` (zero deps, offline).
  - **Three charts** (`web/src/components/Observatory.tsx`, pure over the read feeds, SSR-tested). **Flying-blind quadrant** - churn (x) vs vouched depth (y), one dot per module in its standing colour; the busy-and-under-half-vouched region is washed + labelled "flying blind", the busiest such modules get selective direct labels (never every dot). **Vouched burn-up** - certified facts accumulated over time as a phosphor step line with a faint fill, the running total direct-labelled at the endpoint; honest empty state below two dated certifications. **Per-area two-light bars** - vouched / described / unexplained shares stacked, one row per area (busiest first), 2px surface gaps, the vouched % direct-labelled.
  - **The one new backend surface** (`src/serve/api.ts` `vouchedHistory` + `/api/vouched-history`, `src/serve/server.ts`): certified facts as dated points (`{ at, id, kind, name }`, certified-and-dated only, oldest first). Reconstructed from each entry's own `certified_at` - **deterministic and offline, no git-log archaeology** (the 23-doc guessed "reconstruct from `git log` over `.artha/`", but the timestamp is already stored, which is strictly better - no subprocess, byte-deterministic, unit-testable). The quadrant and area bars need no new data - they derive from the existing map feed via `derive.flyingBlind` / `derive.areaShares` / `derive.vouchedBurnup` / `derive.standingOf` (all pure, tested).
  - **Verified**: typecheck (CLI + web) + Biome clean; **365 tests pass** (+8: `vouchedHistory` certified-and-dated-only + sort + empty; `flyingBlind` mapping/standing/busiest-first; `areaShares` three-share-sum-to-1 + described-vs-dark split + all-moonlight area; `vouchedBurnup` cumulative + empty; the page renders one dot per module, a shared legend, the two standings, a bar row per area, the burn-up line + `3 vouched` endpoint label, and an honest empty state; router round-trips `observatory`). Web bundle 72.6 KB gzip JS / 8.3 KB gzip CSS. **Live E2E** on the seeded shop (`npm run demo`): `/api/vouched-history` returns the three currently-certified dated facts (two on 2026-06-30, one on 2026-07-04); headless-Edge screenshots confirm the burn-up draws a phosphor step to "3 vouched", the area bars show Billing & Money at 75% vouched (phosphor) over a moonlight described backdrop, and the quadrant places billing (well-vouched) above the wash while checkout/auth (busy, unvouched) sit inside the labelled flying-blind region.
  - **Remaining on T23**: 23d (reading is reviewing - delivers 21c's D5/D6/D9/D10), 23e (craft debt). And on the inferred track: 21b (LLM synthesis) → 22 (contradiction view).

### 2026-07-08

- **T23b - inner boards (drill the blackboard down)** done - the next slice of the atlas elevation ([tasks-v0.3/23-atlas-elevation.md](tasks-v0.3/23-atlas-elevation.md)), chosen off the 23-doc's impact-per-effort order. Opening a module now descends into its **own blackboard**: the module page leads (section 01, above every wall of text) with its source files as chalk boxes, their intra-module imports as chalk arrows, and each box lit by the meaning pinned into it - so board → module board → meaning reads as one continuous diagram in the same hand, one altitude down.
  - **The read API** (`src/serve/api.ts` `moduleBoard` + `/api/module-board/:id`, `src/serve/server.ts`): a module's files (filtered from the repo's structural scan), its **intra-module** file→file import edges only (a cross-module import already draws on the outer board, so it is left off here), and the facts pinned into each file (strongest standing first). Pure over the index + the cached `RepoStructure` (which gained a `files: string[]`), so it stays offline and off the hot path, exactly like the pin suggester. A module with no source files yields an empty board, never an error.
  - **The two-light grammar at file altitude** (`web/src/components/ModuleBoard.tsx`): a file box's chalk frame is phosphor when a certified fact is pinned there, amber for proposed, ember for stale, dim grey when nothing is pinned yet; the filename is chalk handwriting; up to two pinned facts show with standing dots and an honest `+N`. Selecting a file (deep-linked as `#/module/…?file=…`, like the atlas selection) lights its box + imports, dims the rest, and opens a **file card** listing the meaning pinned there - each concept/flow linking to its page, so the descent to meaning is one click. Esc / the card's Close / a second click let go.
  - **Shared blackboard machinery** (a behavior-preserving refactor): `boardLayout`'s layered-flowchart math is extracted into a generic **`layeredLayout(ids, links, metrics, sortKey?)`** (both the module board and the new `fileBoardLayout` are thin adapters over it), and the drag/persist/tidy behaviour into a shared **`useBoardDrag(storeKey)`** hook (each board remembers its own hand layout per browser). So the inner board is the same seeded chalk (`rough.ts`), few marks, ample space, and draggable - the blackboard philosophy holds one level down. Capability chalk-marks on the *outer* boxes were already delivered by 23a″. Symbol-level boxes inside a file are a later slice (the box is the file today).
  - **Verified**: typecheck (CLI + web) + Biome clean; **357 tests pass** (+15: `moduleBoard` file-set/intra-module-edges/pin-lighting/empty-module; `fileBoardLayout` layering + no-overlap + determinism; `ModuleBoard` boxes-lit-by-pins, two-shown-+N, one-arrow-reading-imports, selection hot/faded/dimmed + deep-link hrefs; `FileCard` links concepts/flows + honest empty; the module page leads with the board and omits it when empty; the `?file=` route round-trips). Web bundle 70.0 KB gzip JS / 7.9 KB gzip CSS. **Live E2E** on the seeded shop (`npm run demo`): `/api/module-board/src%2Fbilling` returns billing's three files, the `refund.ts → gateway.ts` import (the cross-module `refund → notifications/email` correctly excluded), and each box's real pins; headless-Edge screenshots confirm the module page leads with the inner board (refund.ts amber, Subscription.ts + gateway.ts phosphor, gateway.ts's stale Checkout in ember), and selecting gateway.ts lights its box + arrow, dims the rest, and opens the file card with its DECISION + stale CONCEPT.
  - **Remaining on T23**: 23c (observatory charts), 23d (reading is reviewing - delivers 21c's D5/D6/D9/D10), 23e (craft debt). And on the inferred track: 21b (LLM synthesis) → 22 (contradiction view).

### 2026-07-07

- **T23 - atlas elevation (honest KPIs → the blackboard Board)** done through 23a″ - the elevation program ([tasks-v0.3/23-atlas-elevation.md](tasks-v0.3/23-atlas-elevation.md)), specced after a 6.5/10 review of the demo, then pivoted twice the same day on developer feedback. The through-line: knowledge discovery reads best as a *handmade flowchart on a blackboard*, not a denser map.
  - **23a - honest KPIs (D11, partial)** (`web/src/derive.ts`, `copy.ts`): "explained" is gone. **% vouched** = churn-weighted certified *depth* (the saturating `coverageOf` curve, so one lucky fact cannot claim a whole module); **% described** = the machine layer's reach, on a new `moon` tone so moonlight never wears the phosphor of trust; dark zones + stale unchanged. Navigator area meters and the area inspector reworded to the same vouched metric (`AreaStat.explained` → `vouched`). The disagreements readout waits on T22.
  - **23a′ - the board pivot** (supersedes 23a's wiring lens the same day): developer verdict was that arrows over a space-filling treemap "make it even more confusing" - a treemap has no empty space, so nothing drawn over it can be clean. **The Board is now the default canvas** (`#/`): a handmade flowchart on a blackboard. Chalk register (`web/src/rough.ts`: seeded, deterministic rough strokes; system handwriting faces via `--chalk`), layered auto-layout consumers→foundations (`web/src/board.ts`, longest-path, cycle-safe), imports as chalk arrows reading "depends on", drag-to-arrange with per-browser persistence + "Tidy the board", scroll-pan. The two-light grammar survives as chalk colour (phosphor vouched / moonlight described / dim unexplained / ember stale tick). The treemap demotes to a **Terrain** nav item (`#/?lens=terrain`); the wiring lens is deleted. Flow routes moved onto the board (numbered chalk station badges, route legs in the flow's status colour, route card).
  - **23a″ - meaningful chalk + fullscreen focus**: every box now carries meaning, not just a name - the machine's one-line description in moonlight italic, up to two capabilities in product language with standing dots, an honest `+N more`, the standing line. `/api/map` modules gained **`describedAs`** - the module card's prose today, the exact slot 21b's LLM synthesis will overwrite so the board enriches with zero client rework. **Fullscreen focus** (top-bar toggle + `f`, guarded against typing) folds the side panes and requests native fullscreen; Esc/exit-fullscreen unfold together.
  - **Pure derivations** (`flowTrace`, `capabilitiesByModule`, `boardLayout`, `borderPoint`, the `rough` strokes) are SSR-tested; router round-trips `lens`/`f` params.
  - **Verified**: typecheck (CLI + web) + Biome clean; **342 tests pass** (+12 net over 21a slice 2: honest-KPI derivation, area vouched rollup, chalk determinism, board layering incl. cycles + no-overlap, board markup + annotations + `+N more`, capabilities-by-module ordering, flow routes on the board, fullscreen toggle, `describedAs` on the map feed). **Live E2E** on the running demo: top bar reads **59% vouched · 100% described**; the board draws billing as the shared foundation with its machine description and certified capabilities, checkout/reports as consumers above; `flow.refund` traces billing (1·2) → notifications (3) with step 4 an honest dashed gap.
- **T21a slice 2 - the inferred layer (flow skeletons + naming conventions)** done - the deterministic, offline 21a layer is now complete (all four extractors), so a stranger's repo renders module cards, state machines, **flows, and conventions** in moonlight with zero human input.
  - **The extractor** (`src/analytics/inferred.ts`): two new deterministic, evidence-pinned outputs alongside the slice-1 pair.
    **Flow skeletons** - an exported **action-verb function** (`FLOW_VERBS`, matched on the first humanized word) whose file **reaches across modules** is read as a flow entry point; its steps are that file's import fan-out rolled to module altitude (source order, deduped, own module excluded). The entry point is the single resolvable evidence pin (`role: entry`); the step *order and meaning* are deliberately left as the human delta (D6). Precision-first: the cross-module-fan-out requirement filters utilities, and the verb list keeps a `session()` accessor / `validate()` predicate from being mislabelled a flow. A flow whose entry a human already pins is suppressed (materialize-on-touch), as with state machines.
    **Convention candidates** - a naming regularity a module repeats: ≥3 exported top-level symbols sharing a first word (`use*`) or last word (`*Repo`), pinned to the symbols that embody it. Aggregate structural context like module cards (not a single-evidence claim), so **not** suppressed by human pins. A shared word `<3` chars or appearing `<3` times never anchors a convention.
    New helpers: a shared `words()` splitter (humanize now builds on it), `isFlowVerb`/`fanOut`/`flowBody`, `conventions`/`affixGroups`/`conventionBody`.
  - **Index** (`src/build/db.ts`): flow/convention facts land in the same parallel `artha_inferred`/`_pins` tables with new `kind` values `flow` + `convention`; a new **`artha_inferred_steps(inferred_id, label, to_module, ord)`** table carries the fan-out (mirrors `artha_flow_steps`, room for 21b's on/do prose). `artha build` still reports `· N inferred` (the demo now emits **9**: 5 cards + 2 state machines + 1 flow + 1 convention). Loaded defensively in `ArthaIndex` (a pre-slice-2 index yields `[]`).
  - **Read API** (`src/serve/api.ts`): `InferredFactView` grows `steps` (label + module link); `/api/inferred/:id` serves flow steps + convention members; `moduleDetail` grows `inferredFlows` + `inferredConventions`; the catalog grows `inferredFlows`. Byte-unchanged for the human `artha_facts` path.
  - **The moonlight dashboard** (`web/`): the two-light grammar (D2) now spans all four kinds. Flow pages lead with prose, then a **"Reaches"** fan-out of module-linked chips (honestly *not* a numbered sequence - the order is the delta), then evidence, then a flow-specific delta band ("The order these steps run… is not in the code"). Convention pages relabel evidence as **"Symbols that match"** and carry a convention-specific delta. `InferredCard` adapts its preview per kind (state `·` chain / flow `→` chain / convention member list); module pages gain a **"Machine-noticed conventions"** section beside "Machine-described capabilities"; the catalog groups inferred flows with concepts; the inferred breadcrumb falls back to the fact's own heading so a convention reads `*Refund`, never its raw id.
  - **Verified**: typecheck (CLI + web) + Biome clean; **324 tests pass** (+11: flow entry detection / action-verb + cross-module gate / step order / entry-pin suppression; convention suffix+prefix / below-threshold / member pins; the build pipeline round-trips flows + conventions + the steps table byte-deterministically; four web render tests for the flow page "Reaches", convention page "Symbols that match", module flow/convention sections, catalog inferred flows). **Live E2E** on the seeded shop (`npm run demo`, enriched with a `placeOrder` orchestrator): the checkout page shows a **Place Order** flow (`Billing → Notifications`) beside the Order State machine; billing shows a **`*Refund`** machine-noticed convention (`issueRefund, startRefund, validateRefund`) distinct from the human `*Repo` rule; the catalog groups all three inferred capabilities in moonlight; the flow and convention detail pages render prose → structure → evidence → the honest delta band. All 21a offline acceptance criteria met.
  - **Remaining**: 21b (LLM synthesis + verification) and the rest of 21c (vouch-by-reading, value-ranked queue, KPI reframe D9-D11), then 22 (contradiction view).

### 2026-07-05

- **T21a slice 1 - the inferred layer (deterministic module cards + state machines)** done.
  The map is no longer black on first open.
  A fully offline, LLM-free extraction pass now describes every module and reads state machines straight out of the code, so a stranger's repo renders a lit, readable atlas with zero human input - the missing foundation the v0.3 re-centering exists to build (see [tasks-v0.3/21-inferred-layer.md](tasks-v0.3/21-inferred-layer.md) §Why).
  - **Structural extraction** (`src/resolver/*`): the tree-sitter resolver gained `enumLikes(file)` - the string-literal unions (`type X = 'a' | 'b'`) and TS enums a file declares, members read verbatim (left-nested unions flattened; `null`/`undefined` tolerated; non-string unions rejected for precision) - and an `exported` flag on each `list()` declaration (the module's public surface). A future CodeGraph resolver can return `[]` until it implements `enumLikes`.
  - **The extractor** (`src/analytics/inferred.ts`): two deterministic, evidence-pinned outputs. **Module cards** - one per module: a humanized name, a role read from the T17b import position (shared foundation / entry area / supporting), and its public surface. **State-machine candidates** - a concept draft per union/enum, states read from code, transitions and effects deliberately left blank (that is the human delta). A candidate whose evidence a human already pins is suppressed (materialize-on-touch). Byte-deterministic: identical inputs → identical, sorted output.
  - **Index** (`src/build/db.ts`, `src/build/build.ts`): the layer lands in **parallel `artha_inferred` / `artha_inferred_pins` / `artha_inferred_states` tables** carrying `origin: inferred` + a worded `confidence` (`read-from-code`). Human `artha_facts` are byte-unchanged, so all v0.1/v0.2 behavior is identical when inferred facts are ignored (the acceptance criterion, satisfied by construction). `artha build` reports `· N inferred`.
  - **Read API** (`src/serve/api.ts`, `server.ts`): `/api/inferred/:id` serves a module card / state-machine view (states + evidence pins + confidence); the map feed grows `described` + `inferredConcepts` per module; module detail grows `card` + `inferredConcepts`; the catalog grows `inferredConcepts`. `ArthaIndex` loads the new tables defensively (a pre-21a index yields `[]`).
  - **The moonlight dashboard** (`web/`): the two-light grammar (D2) - vouched code keeps its **phosphor** glow, machine-described code reads in cooler **moonlight**, and no tile is black. Module and inferred pages lead with plain-language prose (D3), name capabilities in product language (D4), reveal the exact code every claim was read from (D5), and carry a distinct **"What the code can't say"** delta band inviting the human part (D6). Confidence is **worded, never numbered** (D7). A new `#/inferred/:id` route renders the full moonlight page.
  - **Verified**: typecheck (CLI + web) + Biome clean; **313 tests pass** (+20: `enumLikes` union/enum/precision + `exported`; `inferLayer` module-card roles, state-machine extraction, human-pin suppression, determinism, `humanize`; moonlight atlas tile + legend, inferred page prose/states/evidence/delta-band, module-page lead + inferred section, catalog machine-described section, inferred route round-trip). **Live E2E** on the seeded shop demo (`npm run demo`): `artha build` emits **7 inferred facts** (5 module cards + Order State union + Channel enum); the atlas renders every module lit (billing phosphor, the rest moonlight, none black); the checkout module page leads with its read-from-code description and lists the Order State machine; the inferred page shows states, the evidence pin, and the delta band; the catalog groups a "Machine-described capabilities" section below vouched work. All 21a acceptance criteria for the offline layer met.
  - **Locked with the developer**: index-only regenerable cache + materialize-on-touch (OQ-A); `origin`/`confidence` in parallel tables, not a fourth `status` (OQ-B); `read from code` / `inferred` / `uncertain` wording (OQ-D); 21a before T18 (OQ-E). Remaining 21a slices: flow skeletons + convention candidates. Then 21b (LLM synthesis + verification) and the rest of 21c (vouch-by-reading, value-ranked queue, KPI reframe D9-D11).

### 2026-07-04

- **T17b — Auto-map: reference graph + suggested pins** done. The map's two kinds of
  edges are now both handled: **structural edges** (imports) are extracted **fully
  automatically** - no human, no LLM - and **meaning edges** (pins) become **ranked,
  explainable suggestions** a human confirms with one keystroke. Fully offline.
  - **`resolver.imports()`** (`src/resolver/*`): the raw import/`export…from`/`require`/
    dynamic-`import()` specifiers a file declares, in source order, via tree-sitter
    (computed specifiers skipped, bare kept as-is). Mirrors T17's `list()`.
  - **Reference graph** (`src/analytics/references.ts`, wired into `artha build`):
    `resolveSpecifier` resolves relative specifiers to repo files (`./`, `../`, extension
    inference, `index.*`, and the ESM `./x.js`→`./x.ts` rewrite; bare/out-of-tree → null);
    `referenceGraph` rolls file→file edges up to **module altitude** (reuses T13/OQ5),
    drops self-edges, keeps counts, and emits a **deterministic** order → the new
    `artha_refs(from_module, to_module, count)` index table. Rebuilding is byte-identical.
    `fileImportGraph` keeps the file-level adjacency for the suggester's proximity signal.
  - **One structural scan** (`src/serve/symbols.ts` → `repoStructure`): the link-picker
    symbol catalog **and** the file import graph now come from a single cached resolver
    pass over the source roots (no second walk), shared by the picker and the suggester.
  - **Read API** (`src/serve/api.ts`): `/api/module/:id` gains `dependsOn`/`usedBy`
    (`{module, count}`, most-coupled first); `GET /api/refs` returns the whole module graph
    for the atlas. Pure over the index, offline.
  - **Suggested pins** (`src/serve/suggest.ts` + `GET /api/suggest?id=`): candidates are
    the resolvable-symbol catalog (so **every suggestion resolves as a pin**, the picker's
    guarantee), scored by **reference proximity** (a symbol in a file one hop from
    already-pinned code — for a flow, the fan-out of its entry point) **> lexical overlap**
    (entry name/summary vs symbol, reusing T17's `lexicalScore`) **> related meaning**
    (symbols pinned by *other* facts whose vectors are embedding-similar — read from the
    index's existing vectors, **all cache hits, no model load** on the read path). Each hit
    carries a `why` (`referenced by pinned code` · `name match` · `related meaning`); weights
    keep the tiers strict; suggestions are **top-level units**, not class-member noise
    (the picker still offers members for precision).
  - **UI** (atlas identity, hairline until asked for): module page + inspector grow a
    **"Wired to"** section (depends-on / used-by as module links with ×N coupling); the
    **atlas outlines a selected tile's first-hop neighbours** (dashed, undimmed — glow stays
    reserved for certified coverage) so "blast radius" reads at a glance; capability pages
    grow a **"Suggested code"** ledger under the pins list — each row is name·kind·path·why
    with a **one-click "+ Link"** that rides the existing `POST /api/pin` (ignoring costs
    nothing). App reads `/api/refs` once (structure is immutable under curation) and re-ranks
    suggestions after each link.
  - **v0.2 cut honoured**: this mines **structure, not meaning**, and **proposes** rather
    than writes — no second auto-*miner*, no auto-certify, no write without an explicit click.
  - **Verified**: typecheck (CLI+web) + Biome clean; **293 tests pass** (+29 — import
    extraction, `resolveSpecifier`/`referenceGraph` unit + fixture roll-up, byte-deterministic
    `artha_refs`, `dependsOn`/`usedBy` + `refsFeed`, suggestion ranking [proximity beats
    lexical beats nothing · related-meaning via vectors · members excluded · every candidate
    resolves · flow fan-out], booted-server `/api/refs` + suggestion→pin round trip, and web
    render of wired-to/neighbour-outline/suggested-code). Bundle 61.2 KB gzip JS / 6.4 KB CSS;
    `dist/cli.js` stays react-free (134 KB). **Live E2E** against the real `dist/cli.js serve`
    on a seeded shop demo wired with cross-module imports: `artha build` mines 6 module refs;
    `/api/refs`, `dependsOn`/`usedBy` (billing is the hub), and `/api/suggest` return live
    data; headless-Edge visual pass on the atlas neighbour-outline (leaf-module selection dims
    non-neighbours), the module/inspector "Wired to", and the capability "Suggested code";
    and a **CDP click-to-link**: `+ Link` on a suggestion lands the pin, drops it from the
    list, and the graph **re-ranks** (a newly-pinned file's importers surface next). All 6
    acceptance criteria met.

- **T17b spec'd — auto-map: reference graph + suggested pins** ([tasks-v0.2/17b](tasks-v0.2/17b-reference-graph.md)).
  Design decision behind it: the map has two kinds of edges.
  Structural edges (imports, module tree) claim nothing about meaning, so they are extracted fully automatically - no human in the loop.
  Meaning edges (pins) are what agents trust over MCP, so they stay machine-proposed, human-confirmed - suggestions ranked by reference proximity, lexical overlap, and (when vectors exist) embeddings, each with a stated why, confirmed through the existing `POST /api/pin`.
  Mines structure, not meaning, so v0.2's "no second auto-miner" cut stands.

- **T17 polish — review + live preview pass.**
  Reviewed the T17 diff against a served demo repo (headless-Edge drive of the picker, edit form, and a real certify round-trip; YAML git diff verified) and landed four improvements.
  - **Pins now open the engineer lens.**
    Every `path#Symbol` pin (concept pins, flow entry points, ladder rungs) links to the module page that owns the code via a longest-prefix `moduleOfPath` match - product meaning to code surface in one click, quiet hairline hover in the pin's own status colour.
  - **Platform-spelled search shortcut.**
    The top bar showed a hardcoded `⌘K` to Windows/Linux readers; `SEARCH_KEY` in `copy.ts` now spells it `Ctrl K` off-Mac (the handler always accepted both).
  - **Symbol picker: keyboard affordance + combobox a11y.**
    A `↑↓ pick · enter links · esc closes` hint in the picker footer, ARIA combobox/listbox/option semantics with `aria-activedescendant`, and the active option scrolls into view while arrowing through a long list.
  - **Write endpoints require `application/json` (415 otherwise).**
    A cross-site form can only send text/plain-family types without a CORS preflight, so this stops a random web page from mutating `.artha/` through the localhost server; verified live with a text/plain POST.
  - Typecheck (CLI+web) + Biome clean; **264 tests pass** (+4: `moduleOfPath` unit, concept + flow pin-link render, 415 guard).
    Live E2E re-run on the rebuilt bundle: pin hrefs resolve on both capability pages, picker hint renders, 415 confirmed.

- **T17 — Write-back: link · certify · edit** done. The dashboard becomes an **authoring
  surface**: every mutation writes `.artha/*.yaml` as a plain git diff, the index is rebuilt so
  the map redraws, and a write that would break the build is rolled back - disk is always left
  buildable. Fully offline; **nothing auto-certifies**.
  - **Write layer** (`src/serve/write.ts`, pure over the `.artha/` tree): `certifyEntry` reuses
    T07's `certifyDraft` (stamps `certified_by`/`certified_at`, validates the exact shape, refuses
    an invalid entry) - the **one** path to `certified`. `addPin` resolves the `path#Symbol`
    against the live repo **before** writing (an unresolvable ref is a 400, never touches disk, so
    the YAML stays buildable) and is idempotent. `upsertEntry` **merges** a partial patch over the
    existing entry (editing just `summary` never drops `pins`/`tags`/`mined_from`), re-validates
    through T02, and **forces `proposed`** - an edit is never a certification; changed content must
    be re-vouched.
  - **Transactional commit** (`commitWrite`): write → `buildIndex` → if the rebuild errors, restore
    the one changed file and return 422. A failed build aborts before emitting, so the served
    `index.db` is untouched and still matches the restored YAML. Embeddings are reused from the
    previous index only when it already had vectors (a certify/link changes no fact text → all
    cache hits, no model load, still offline; a vector-less index stays fast — a full `artha build`
    refreshes vectors).
  - **Server** (`src/serve/server.ts`): `POST /api/certify · /api/pin · /api/entry` with size-capped
    JSON bodies and a per-server **write lock** serializing writes (two tabs can't interleave a
    rebuild). Read endpoints stay GET-only (`POST /api/map` is still 405). A concurrent external
    editor/git edit is the user's to reconcile via git — YAML stays the system of record.
  - **Link discovery** (`src/serve/symbols.ts` + a new `resolver.list()`): linking is
    **search-and-pick, not path-typing** — hand-typing `path#Symbol` doesn't scale to a real
    codebase. `list()` enumerates every resolvable symbol a file exposes (top-level declarations +
    class members); `GET /api/symbols?q=` searches a cached, offline catalog of them (warmed at
    server start, ranked by name then path). Every candidate is guaranteed to resolve as a pin.
  - **UI** (design-dna *cartographic · instrumental · assured*): curation reads as native, not
    bolted-on. A **Certify** button borrows the phosphor of understanding and lights up (fill +
    glow) on hover — certifying a dark capability literally makes it glow — then disappears once
    certified. **Edit** opens an inline name/summary panel; **Link code** opens a **typeahead
    symbol picker** (type a class/function/file name → ranked candidates → arrow/click to pick),
    so no one types a path (a flow always exposes an entry-link surface). The engineer lens
    (module page) certifies rules/decisions in place. `web/src/components/Curate.tsx`; `App` owns
    the POST-then-refresh so the map redraws without a reload. Design contract:
    [Dashboard.md §11.5](design/Dashboard.md).
  - **Verified**: typecheck (CLI+web) + Biome clean; **260 tests pass** (+31 — 13 write-layer unit
    [certify/pin/upsert valid+invalid+refused, merge-preserve, never-auto-certify, rollback on a
    failed rebuild], 5 booted-server POST round-trips incl. concurrent writes, 4 web render
    [certify by status, link/edit affordances], and +9 for the link picker: 3 `resolver.list`
    enumeration, 5 `symbols` rank/search, 1 `/api/symbols` endpoint). Bundle 59.9 KB gzip JS /
    6.0 KB CSS; `dist/cli.js` stays react-free (124 KB). **Live E2E** against the real
    `dist/cli.js serve`: certify stamps a real `certified_by` + today's date as a YAML diff, a
    resolvable pin links, an unresolvable pin is a 400, an edit un-certifies while preserving the
    pin, and `/api/symbols?q=refund` returns the three refund functions. **Headless-Edge visual
    pass** on the concept + module pages, the open forms, and the live symbol picker (caught +
    fixed a flex-column bug that stretched the edit NAME input to full height). All 6 acceptance
    criteria met.

- **Dashboard v3 — the atlas shell (16c + 16d)** done. The 16a/16b instrument page was
  reviewed against the product goal and found still short: a 2,800px scroll of sections,
  a "map" of flex-wrapped buttons, a light page around one dark panel, ids where product
  language belonged, and no engineer lens.
  Diagnosis + the new design are recorded in [design/Dashboard.md §11](design/Dashboard.md);
  this build replaces the page with a **full-screen application shell** and completes 16c.
  - **`/api/module/:id`** (`src/serve/api.ts` `moduleDetail()` + a slash-tolerant route in
    `server.ts`): everything governing one module — concepts/flows built on it, invariants/
    conventions in scope, decisions (the why) — each with status, pinned symbols, stale-pin
    count, and the scope join; plus churn/coverage/stale stats and the module's dark-zone
    queue rank. Pure over the index; 4 new API tests.
  - **The shell** (`web/src/App.tsx`): 100vh instrument — top bar (wordmark, breadcrumb, the
    four KPI readouts, ⌘K), left **navigator** (views + one expandable section per product
    area: capabilities in product language, modules in mono), center canvas, right
    **inspector** on atlas selection. Panes scroll internally; the page never does.
  - **Hash router** (`web/src/router.ts`): every view *and the atlas selection* live in the
    URL (`#/module/src%2Fbilling`, `#/?a=Billing`), so the knowledge base deep-links and
    back always retraces. Esc clears selection; ⌘K searches; plain anchors throughout.
  - **The Understanding Atlas** (`web/src/treemap.ts` + `components/Atlas.tsx`): a
    hand-rolled **squarified treemap** (zero deps, deterministic) — tile area ∝ churn,
    brightness = coverage ramp, stale = hatched seam, areas drawn as named provinces;
    labels degrade with tile size; selection lights, others dim. Replaces the button field.
  - **Views**: module page (the 16c engineer lens, incl. dark-empty → queue funnel) ·
    concept page (drawn state machine kept) · **flow ladder** (filled vs dashed-hollow
    rungs + `n/m linked`) · catalog grouped by area with filter chips · queue with churn
    bars · **cold start** = all-dark terrain + "0% of active code explained" funnel.
  - **Identity** (design-dna: *cartographic · instrumental · assured*): one fully dark
    world (satellite night-map — understanding glows, dark zones recede), phosphor/amber/
    ember as the only meaning-bearing hues, mono-forward system stacks (still no fetched
    fonts → offline holds), sharp + hairline throughout.
  - **Fixed en route:** `typecheck:web` had been silently skipping `test/web` — the root
    tsconfig's `exclude: ["test/web"]` was inherited by `web/tsconfig.json` and cancelled
    its `include` — so the web suite was type-unchecked since 16a. Overridden; it checks now.
  - **Verified**: typecheck + typecheck:web + Biome clean; **229 tests pass** (+10 net: 4
    moduleDetail, 30 rewritten web render tests asserting the treemap geometry
    [area ∝ value, in-bounds, no overlap, deterministic], router round-trips, coverage
    classes, ladder rungs, module-page grouping, cold funnel). Bundle 58.3 KB gzip JS /
    5.5 KB CSS. Live-verified in headless Edge against a rich mock fixture (atlas,
    inspector, module/concept/flow/catalog/queue, cold start, 820px narrow) **and against
    the real `dist/cli.js serve` on this repo** (cold index → real churn terrain + funnel;
    `/api/module/src%2Fserve` returns live data). All 16c acceptance criteria met.

### 2026-06-27

- **Dashboard redesign — Phase 2 (T16b)** done. Capabilities made discoverable and
  connected, on the 16a instrument.
  - **`/api/catalog`** (`src/serve/api.ts` `catalog()` + server route): pure, offline summaries
    of every concept (state chain) / flow (step coverage) with the modules each touches — the
    map feed carries only ids, so this is what the cards render from.
  - **Capability catalog** (`web/src/components/Catalog.tsx`): concept/flow **cards** with a
    state-chain or coverage-bar preview, a colored status dot, and modules; **filter by area +
    standing**; cold/empty → an inviting empty state. Replaces the buried area chips as the
    capability browser.
  - **Hover-to-connect** (`Connections.tsx` + `derive.modulesForCapability` + MapView
    `connectionModules`/tile-ref registry): hovering/focusing a card lights the modules it
    touches on the map and draws **dashed leader lines** from card to tile (client-only overlay
    reading live rects → renders nothing in SSR; the connection *set* is unit-tested instead).
    Selecting a map tile reverse-highlights the cards that touch it. Only the focused item's
    links ever draw — no hairball.
  - **⌘K command bar** (`CommandBar.tsx`, replaces the inline search box): keyboard-opened
    overlay over `/api/search`, results grouped into **modules** (jump to the map tile),
    **capabilities** (→ detail), and **rules/decisions** (context, inert); module names matched
    locally off the map feed. Esc/scrim to close.
  - **Verified**: typecheck (CLI+web) + Biome clean; **219 tests pass** (+7 — `catalog()` shape +
    cold; the connection-set helper; catalog cards/filters/connected/empty; command-bar open/closed;
    the map connection-highlight). Bundle builds (55 KB gzip JS, 4.2 KB CSS). **Live-previewed** in
    a real browser against a rich fixture (mock-API server over the built bundle): map, catalog,
    ⌘K bar, and leader-line connections all confirmed working. All 16b acceptance criteria met.

- **Dashboard redesign — research + Phase 1 (T16a)** done. The shipped T16 map read as
  *confusing — failing to deliver meaning*: it was a **scholarly document** (abstract, glossary,
  margin sidenotes, two text-list "columns") when the brief wanted a **rich, at-a-glance
  instrument**. Diagnosed and re-specced before any code.
  - **Research memo** ([design/Dashboard.md](design/Dashboard.md)): six concrete failures (the
    map isn't a map; teaches vocabulary instead of showing the thing; explains Artha not the
    codebase; computed quantities hidden as 9pt text; register fights the medium; the leadership
    "where am I flying blind" view never built). Grounded in CodeScene hotspots, the Backstage
    catalog, and dashboard-design practice (5-second rule, progressive disclosure, visual
    hierarchy). Proposes a hero **Understanding Map**, capability catalog, drawn state machines,
    KPI header, engineer lens — same API/data, genre + encoding change only.
  - **Phased specs**: [16a](tasks-v0.2/16a-dashboard-foundation.md) (foundation, this),
    [16b](tasks-v0.2/16b-catalog-connections.md), [16c](tasks-v0.2/16c-engineer-lens-polish.md);
    index + critical path updated. T17 now depends on 16a.
  - **Design DNA** (design-dna): *instrumental · legible · honest*; reference world an
    observatory/radar console; **mono-forward** system-font identity (serif dropped); one signal
    hue (teal) used as data; sharp + hairline; the dark map panel is the single art-directed
    surface. Fonts stay system stacks → **viewing remains fully offline**.
  - **Built** (`web/src/`): `derive.ts` (pure KPI + churn/coverage bucketing) · `Kpis` (the four
    stats: % active code explained [churn-weighted], dark zones, stale, certified) · `HowToRead`
    (one opt-in panel replacing abstract + glossary + sidenotes) · `MapView` rewritten as the
    **Understanding Map** — a dark instrument screen of module tiles where **size = churn,
    brightness = coverage**; understood code glows, dark zones recede, selection lights links ·
    `StateMachine` (hand-rolled, dependency-free SVG: vertical spine + right-side arcs for
    branches/loop-backs) wired into `ConceptView` · `DarkZoneQueue` + `Scholar` trimmed to the
    instrument register · `styles.css` fully rewritten.
  - **Verified**: typecheck + typecheck:web + Biome clean; **212 tests pass** (web render rewritten
    to assert the *encoding* — KPI figures, tile size/coverage classes, a node-per-state +
    edge-per-transition SVG; 19 web tests); bundle builds (53 KB gzip JS, 3.35 KB gzip CSS).
    Visual QA via headless-Edge screenshots of a rich seeded fixture (map + concept) confirmed the
    design renders correctly and legibly (caught + fixed a state-machine label collision). All 16a
    acceptance criteria met (structural; the human legibility run stays gated to T20).

### 2026-06-24

- **T16 — Product↔Code map + concept/flow detail (UI)** done. The dashboard's
  centerpiece on the T15 skeleton: an area/module-altitude map, concept & flow detail views,
  find-a-capability search, and a cold-start ask-queue — all **read-only and offline**.
  Legibility is the load-bearing requirement (the human run is T20); this ships the structure.
  - **Map** (`web/src/components/MapView.tsx`): two columns (product areas ↔ code modules) at
    **area/module altitude — never the symbol graph**. Selecting an area **lights up** the
    modules it covers (and a module lights up the areas reaching it); unrelated rows dim. Dark
    zones are visually distinct; concepts/flows in an area are clickable chips that open detail.
  - **Detail** (`web/src/components/Detail.tsx`): concept view = states + transitions +
    invariants + governing-rules/why (related), each with `status`, pins shown linked/stale;
    flow view = entry pins + ordered steps, with a `pin: null` step rendered **"not yet linked"**
    (the v0.3 coverage seam), never an error. `← map` back nav.
  - **Search** (`SearchBox.tsx` + debounced container): wires `GET /api/search` into a
    find-a-capability box; concept/flow hits open detail, other kinds render inert.
  - **Cold start** (`DarkZoneQueue.tsx`): a mostly-dark map turns into an inviting "explain
    these" entry into the T13 dark-zone queue (darkest-first) — never a blank/error screen.
  - **Architecture for testability**: pure presentational components (props in, JSX out, no CSS
    import) + a thin `App.tsx` container owning fetch + selection/drill-down state (the seam T17
    write features hook into). The test env is `node`, so **12 rendering tests** assert structure
    via `react-dom/server` `renderToStaticMarkup` — no jsdom/testing-library added. `test/web` is
    DOM-typed, so it's excluded from the node root `tsc` and folded into `typecheck:web` instead.
  - **Legibility/design pass (design-scholarly + design-scene:thesis)**: the bare two-column
    list was rebuilt as a self-explaining scholarly document — a university-press/journal
    register chosen because the product's whole premise is a stranger reading the map. Adds an
    **abstract** (what this is / who it's for / how to read it), a one-line gloss under every
    heading, and **margin sidenotes that define every term from scratch** (product area, code
    module, concept, flow, state machine, invariant, pin, stale, dark zone, churn) — no prior
    knowledge assumed. Text-serif stack + IBM Plex Sans small-caps + mono; one evidence accent
    (archive blue) for links/data/section numbers; hairline rules, journal-style tables (states,
    dark zones), status as small-caps text (not pills), dark zones rendered grey/“unexplained”
    not alarm-red, near-zero motion. All copy centralised in `web/src/copy.ts`; primitives in
    `components/Scholar.tsx` (Term/sidenote, StatusBadge, SectionHead). Fonts are a **system
    stack — no font is fetched**, so offline viewing holds. Verified in headless Edge against the
    seeded demo: map + concept detail render with margin definitions correctly placed (caught &
    fixed a float-collision bug where a sidenote inside a `<table>` overprinted — sidenotes now
    live only in flowing prose).
  - **Verified**: `typecheck` + `typecheck:web` + Biome clean; **207 tests pass** (+14, incl.
    assertions that the abstract + glossary definitions actually ship in the markup); web bundle
    builds (52 KB gzip JS, 2.8 KB gzip CSS); live serve smoke against the real `dist/web` bundle —
    `/` returns the hashed-asset app, cold `/api/map` + `/api/dark-zones` return 200. All 6
    acceptance criteria met (structural; the human legibility run is gated to T20).

- **T14 — Embedding-assisted ranking** done. Retrieval (MCP `context_for_task` + dashboard
  search) upgraded from lexical-FTS + structural to **+ semantic (embedding) similarity**, so
  "find the right meaning" surfaces synonym matches the keyword baseline misses — without
  inflating the token budget.
  - **OQ3 LOCKED with developer**: a **local on-device model** (transformers.js,
    `Xenova/all-MiniLM-L6-v2`, 384-d, ~23 MB quantized — WASM/ONNX, consistent with the existing
    web-tree-sitter dep). Validated in a spike (synonym cosine 0.56 vs unrelated 0.06). The only
    choice that keeps **query-time embedding offline** (no API key, no text egress); a one-time
    model download is the sole network touch, to a stable per-user cache.
  - **`Embedder` interface** (`src/embed/embedder.ts`) keeps it swappable; `createLocalEmbedder`
    loads transformers.js **lazily** (dynamic import → externalized, never in `dist/cli.js`:
    110 KB, no onnxruntime). `getEmbedder(config)` honors `embeddings.enabled/model` (new config,
    default on). `embedQueryForIndex` embeds a query **only when its model matches the index
    vectors** — never mixes models; best-effort + non-throwing → lexical fallback.
  - **Build vectors** (`src/build/embeddings.ts`): `artha build` embeds each fact's heading+body
    into `artha_embeddings(fact_id, model, dim, vector BLOB)`, **best-effort** (failure leaves
    facts vector-less, build still succeeds) and **cached against the previous index** so a
    rebuild re-embeds only new/changed facts; a model change re-embeds (different cache keys).
    Library `buildIndex` embeds only when handed an embedder → existing build tests stay hermetic
    /offline; `artha build` wires the real one.
  - **Blend** (`rank.ts`): relevance = lexical + structural + **semantic**, each normalized to
    its own max (equal footing), semantic gated by a 0.3 cosine floor so unrelated facts stay
    out. Absent query vector / index vectors → term is 0 (exact v0.1 behavior). The token budget
    is untouched. The **same `rankFacts` blend now powers dashboard search** (`/api/search`) and
    MCP, so search and agent retrieval agree.
  - **Verified**: typecheck + Biome clean; **193 tests pass** (+22 — cosine/blob, model-matched
    query embedding, build embeds+tags, prev-index cache reuse, model-change re-embed, graceful
    failure, and the headline blend test: a no-shared-keyword synonym query surfaces the right
    fact that the lexical baseline returns *nothing* for). Live CLI smoke: real MiniLM build
    embeds 2 facts (384-d, tagged); `/api/search?q=reimburse the purchaser` returns
    `decision.refund` **first** despite zero keyword overlap. All 6 acceptance criteria met.

- **T15 — `artha serve`: local web server + read API** done. A local-first, read-only HTTP
  server over `.artha/index.db` (read **fresh per request** → a new `artha build` shows up with
  no restart) that serves the Product↔Code map JSON API + the static dashboard. **Viewing is
  fully offline** (node:http + node:sqlite + git only; zero network on any read endpoint).
  - **OQ7 LOCKED with developer**: **Vite + React** static bundle in `dist/web/` (46 KB gzip),
    served by the zero-dep `node:http` server. React **never enters the CLI hot path** —
    `dist/cli.js` carries only the server/API/analytics (104 KB, no react-dom; verified). Build
    is `tsup && vite build` (web emitted after tsup's clean so `dist/web/` survives); `react-dom`
    + `@vitejs/plugin-react` + `vite` are **devDependencies** (the bundle ships pre-built).
  - **OQ5 LOCKED with developer**: an **`areasOf()`** seam — default **one area per top-level
    module** (`moduleOf`, reused from T13), so the product column renders at cold start before
    any concepts exist; `config.areas` (new optional, lenient-parsed) groups modules into named
    areas, leftover modules keep their own. Final "what is an area" stays swappable here.
  - **Read API** (`src/serve/api.ts`, pure over the index): `GET /api/map` (area/module
    altitude, dark-zone flags, **never** the symbol graph), `/api/concept/:id` + `/api/flow/:id`
    (states/transitions/steps + linked symbols; flow entry-pins separated from step-pins),
    `/api/dark-zones` (T13 queue), `/api/search?q=` (FTS + substring, status-weighted; the T14
    embedding blend slots in here). Module universe = on-disk top-level dirs ∪ covered modules.
  - **Read layer** (`mcp/query.ts`): `ArthaIndex` extended to load `states`/`transitions`/
    `flowSteps`/`related` **defensively** (per-table try/catch → `[]`), so an older pre-T12
    index still yields its facts. Shared `test/helpers/fakeIndex.ts` for the read-layer tests.
  - **Server** (`src/serve/server.ts`): binds `127.0.0.1` (never `0.0.0.0`), GET-only, opens the
    index per request, serves `dist/web/` with a **resolve()-based path-containment** guard
    (caught + fixed a real `%2f` traversal / cross-platform-separator 403 bug via a live smoke),
    and a graceful placeholder page when the bundle isn't built. `artha serve --port/--host`.
  - **Verified**: typecheck + `typecheck:web` + Biome clean; **171 tests pass** (+15 — map/detail/
    search/areasOf over a fixture index incl. cold start, and a booted-server suite: live fetch,
    cold start, fresh-build-without-restart, static bundle + traversal, 404/405). Live CLI smoke:
    `init → author concept → build → serve` returns the map, concept detail, dark-zones, search,
    and serves the real React bundle + assets. All 6 acceptance criteria met.

- **T13 — Churn + coverage → dark-zone ranking** done. Per code module, *"how much it
  churns"* × *"how much certified meaning is attached"* → the **dark-zone health score** that
  ranks the ask-the-human queue (high-churn, no-meaning first). New `src/analytics/` layer;
  the queue source `darkZones(repoRoot, index, config)` for T15 to serve / T18 to consume.
  - **OQ4 LOCKED with developer** (2026-06-24): churn = **commits in the last 90 days**
    (recent = current risk; swappable via `windowDays`); "covered" = **graded & saturating**,
    `coverage = certified/(certified+1)` (0 facts → 0, 1 → ½, n → n/(n+1)); score =
    `coverage × freshness × inverse(churn)`, isolated in **`scoreModule()`** so the whole
    formula swaps without touching the ranking.
  - **`module.ts`**: `moduleOf(file, sourceRoots)` → top-level folder under a source root
    (`src/billing/Money.ts → src/billing`), the map's area altitude. This is T13's working
    definition; the final "what is an area" is **OQ5, owned by T15** — kept isolated.
  - **`churn.ts`**: `moduleChurn` over `git log --since=<90d> --name-only -- <roots>`, counting
    **distinct commits per module** (multiple files in one commit count once; merges/non-source
    naturally excluded). Resilient: a non-git dir / failed history → **empty map, logged not
    thrown** (degrades to "no churn signal," consistent with cold-start).
  - **`coverage.ts`**: `moduleCoverage` tallies distinct certified vs stale facts per module
    (pins' symbol-file + scope files; proposed drafts don't count). `darkZones` unions
    churn∪coverage modules, scores each, sorts **ascending by score, then descending by churn**
    so among equally-dark (score-0) modules the busiest leads — the SPEC's "churns a lot,
    explained by nobody" intent. Fully deterministic.
  - **Verified**: typecheck + Biome clean; **156 tests pass** (+16 — `moduleOf` boundaries,
    churn window/dedup/non-git, `scoreModule` boundaries + monotonicity, and the 4 `darkZones`
    acceptance criteria over real temp git repos with dated commits). Offline (git + index).
    All 6 acceptance criteria met.

- **T12 — `artha build`: index concepts & flows** done. Concept/flow entries are now
  pin-resolved, content-hashed, staleness-tracked, and written to the SQLite index as
  queryable rows — the read contract the dashboard (T15/16) and MCP serve from.
  - **Pins generalized** ([build.ts](src/build/build.ts)): a new `collectPins(entry)` gathers
    every pin a kind carries — base `pins` (all kinds), plus a **flow's `entry` points and each
    `steps[].pin`** — and the resolve / hash / staleness / emit paths all run over it. So a
    flow's entry + per-step symbols resolve (or fail the build, naming the ref) and content-hash
    exactly like a v0.1 decision pin, and **all** of them land in `artha_pins` → the map's
    concept/flow↔code links and pin staleness work uniformly. A certified concept whose pinned
    symbol drifts flips to `stale`, same mechanism as v0.1.
  - **Three ordered tables** ([db.ts](src/build/db.ts)): `artha_states(fact_id, name, effect,
    invariant, ord)`, `artha_transitions(fact_id, from_state, to_state, trigger, ord)`,
    `artha_flow_steps(fact_id, on_event, do_action, pin_symbol_ref, ord)`. `ord` is 0-based
    authoring order (states/steps render as written); a step's `pin_symbol_ref` is **null** for a
    not-yet-linked step (the v0.3 coverage signal) and otherwise joins to `artha_pins`. Base
    `artha_facts` carries `heading=name`/`body=summary` (from T11) so FTS already finds them.
  - **`schema-v0.2.md` §6** reconciled to the final column names + documented the all-pins-in-
    `artha_pins` rule and that area/module rollup for the map is **OQ5 (T15)**, deliberately not
    baked into the index (the pin's `symbol_ref` file path is the raw material).
  - **No v0.1 regression**: the three tables build **present-but-empty** for a v0.1-only repo;
    all prior build tests pass unchanged. Build stays **offline** (local tree-sitter resolver).
  - **Verified**: typecheck + Biome clean; **140 tests pass** (+4 — full concept+flow row
    assertions, unresolvable flow-step-pin fails the build, certified-concept staleness, FTS-by-
    summary). Live CLI smoke (dist): `init → author concept+flow → build` populates
    states/transitions/flow_steps + resolves the concept pin's hash. All 6 acceptance criteria met.

- **T11 — Schema: `concept` + `flow` kinds** done. The two product-meaning kinds the
  dashboard's Product↔Code map maps *to*, added as a **clean additive extension** of the
  frozen v0.1 base model — they validate, round-trip through YAML, and are part of the
  `ArthaEntry` union, ready to build (T12) and serve (T15/16).
  - **Locked the model first** in [design/schema-v0.2.md](design/schema-v0.2.md) (field
    tables + examples + the JSON Schema additions), same discipline as v0.1.
    - `concept` (`concept.*`): `name`, `summary` (both req) + the high-value payload **not
      in the TS types** — `states` (`{ name, effect?, invariant? }`) and `transitions`
      (`{ from, to, trigger }`). States/transitions are **optional** so a concept can be
      captured summary-first and grow its machine via the v0.2 interview.
    - `flow` (`flow.*`): `name`, `summary` (both req) + `steps` (ordered `{ on?, do, pin? }`)
      and `entry` (entry-point pins). A step with **`pin: null` is valid** — coverage-of-every-
      step is a v0.3 check, not a v0.2 validation error.
  - **Schema/types/validation** all extended additively: `id` pattern + base `kind` enum gain
    `concept|flow`; new `$defs` `state`/`transition`/`flowStep`; two `allOf`-on-`base`
    sub-schemas; `Concept`/`Flow`/`State`/`Transition`/`FlowStep` added to the union; both AJV
    validators wired. `certified` still requires `certified_by`+`certified_at` for the new kinds.
  - **Loader + init**: `concepts/` and `flows/` join the walked dirs and `artha init`'s
    scaffold (5 kind dirs now); canonical `FIELD_ORDER` added for stable dumps.
    `exception.*` stays the **still-reserved** kind that the loader skips (the old
    `reserved-concept` fixture/tests moved to `exception`, since concept now loads for real).
  - **Build kept green, not extended**: `build.ts` now compiles + indexes concept/flow facts
    with `heading=name`, `body=summary` (so FTS/structural retrieval works immediately); the
    `review` TUI's `draftFields` made exhaustive over all five kinds. The **states/transitions/
    steps tables + per-step pin resolution are T12**, per the spec's scope split.
  - **Verified**: typecheck + Biome clean; **136 tests pass** (+8 — concept/flow validate &
    round-trip, summary-first concept, malformed transition/step, certified-requires-stamps,
    exception-still-skipped). Live smoke: `init → author concept+flow → build` emits a 2-entry
    index with the rows above. Acceptance criteria (SPEC Done-when #1) all met.

### 2026-06-21

- **T10 — v0.1 success test** done. **Verdict: PASS.** Full write-up in
  [tasks/results/v0.1-success-test.md](results/v0.1-success-test.md).
  - **Q5 locked with developer** ([10-success-test.md](10-success-test.md)) after a
    premise correction: the proof repo is a content-site SPA, not a billing
    service, so the baseline targets its real conventions ("add a topic page"
    workflow + content standard) rather than money/soft-delete.
  - **A/B on the real proof repo** (`claude -p`, headless, identical prompt; fresh
    copies with `CLAUDE.md`/`CONTENT-GUIDE.md` removed; certified index served only
    via MCP from a sidecar dir): Arm B (Artha) used **34 → 15 discovery tool-calls
    (−56%)** and 42 → 25 total (−40%) vs Arm A, via a single `context_for_task`
    call — clearing the **≥30%** bar. Both arms applied the conventions (correct
    data-module exports, Indian-company example, thin page, route + sidebar wiring).
  - **Loop proven on real data:** `init → mine → build → mcp` all run on the
    299-commit repo. `mine` (claude-cli engine) correctly classifies real commits;
    a content repo yields sparse decisions (3/299 carry rationale signals), so the
    certified value here is hand-authored conventions.
  - **Product fixes this test drove:** MCP server `instructions` (Artha tells the
    agent to call `context_for_task` first), `ARTHA_REPO_ROOT` (index resolution
    when the client doesn't launch from the repo root), and the OS-native-path /
    sidecar-index requirements (now in the README + harness).
  - Reproducible harness committed: [scripts/success-test.sh](../scripts/success-test.sh)
    + [scripts/count-tools.mjs](../scripts/count-tools.mjs); certified fixture in
    [tasks/results/proof-repo-fixture/](results/proof-repo-fixture/).

- **T09 — `artha export --agents-md`** done. Emits a compact, generated `AGENTS.md`
  of **certified** entries so flat-file-only tools (no MCP) still get the team's
  certified meaning — the adoption hook. Fully offline.
  - **Source = the built index via T08 `query.ts`** (not a fresh YAML read), so the
    export mirrors the same validated, staleness-resolved state the MCP server
    serves. Proposed/stale are excluded by definition.
  - **Output** (`src/export/agentsMd.ts`): grouped by kind (Decisions / Invariants /
    Conventions); per entry the heading, the one-line decision/rule, `pins`,
    `scope` (capped at 8 expanded files + "(+N more)" to stay terse), and `why` /
    `supersedes` cross-links. `renderAgentsMd(index)` is pure; `exportAgentsMd(repoRoot,
    {out})` does the I/O (creates parent dirs).
  - **Generated-file discipline:** a "DO NOT EDIT" banner and a **static** header
    (no timestamp) so re-exports of unchanged input are **byte-identical** → minimal
    git diffs. Entries sorted by id; pins/scope sorted + de-duped.
  - **Empty/cold state** → a valid `AGENTS.md` with a "nothing certified yet" note,
    never an error; the command hints `artha build` when no index is present.
  - `artha export` defaults to `--agents-md` (the only v0.1 format); `--out <path>`
    overrides the default repo-root `AGENTS.md`.
  - 7 tests (grouping, certified-only exclusion, deterministic re-export, custom out,
    empty state) + a live full-pipeline smoke (`init → build → export`).

- **T08 — MCP server (stdio)** done. A read-only, fully-offline `@modelcontextprotocol/sdk`
  server (launched by `artha mcp` and the standalone `dist/mcp.js`) that serves
  certified product-meaning to agents over stdio via two tools: **`context_for_task`**
  and **`why`**. Server name `artha`.
  - **Read layer** (`src/mcp/query.ts`): opens `.artha/index.db`, eagerly loads
    facts/pins/scope (team-scale → rank in memory) with lazy FTS5. **Cold-start safe**:
    a missing / empty / unreadable index yields an *empty* index, never an error
    (SPEC). Shared API reused by T09. `toFtsQuery` sanitizes free text into a safe
    quoted-OR FTS query.
  - **Ranking** (`src/mcp/rank.ts`): relevance = normalized **FTS-lexical + structural
    overlap** (a fact's pins/scope vs. the task's `symbols`/`files`), times a **status
    weight** (certified 1.0 > proposed 0.6). Additive, not multiplicative — so a
    task-text-only call ranks on pure lexical × status with structural simply not
    applied (SPEC edge case), and a symbols/files-only call ranks structurally.
    **`stale` is always excluded** (pinned code drifted → untrusted). Token budget
    (~1.5k default, `ARTHA_TOKEN_BUDGET` / option override) keeps the highest-ranked
    items, truncating from the bottom, always ≥1.
  - **Tools** (`src/mcp/server.ts`): `context_for_task(task, symbols?, files?,
    include_proposed?)` — **certified-only by default**; `include_proposed: true`
    adds drafts *clearly labeled* `[proposed — unreviewed draft]`. `why(symbol)` —
    decisions/rules whose pins reference `path#Symbol`, following invariant `why`
    cross-links, every status tagged. The index is opened **per call** so a fresh
    `artha build` is picked up without a restart; diagnostics go to stderr so stdout
    stays clean for JSON-RPC.
  - **SDK shape verified against the installed package** (not from memory):
    `registerTool(name, { description, inputSchema }, cb)` with a **raw Zod shape**
    as `inputSchema`, `StdioServerTransport`, `server.connect()`.
  - 24 tests incl. a real in-memory **client↔server round-trip**; also smoke-tested
    live over actual stdio (`tools/list` + a cold-start `context_for_task` call).
  - Deps: `@modelcontextprotocol/sdk` ^1.29.0 + `zod` ^4.4.3 (both externalized by
    tsup; `dist/mcp.js` stays ~11 KB).

- **T07 — `artha review`** done. Ink (React-for-the-terminal) TUI that walks the
  `proposed` queue and shows each draft beside its source commit/diff + proposed
  pins, with one-keypress **certify / edit / reject** — the only path to
  `certified` (nothing auto-certifies). Fully offline.
  - **Layered for testability:** a pure action layer (`src/review/actions.ts`) is
    kept apart from the Ink presentation (`src/review/app.tsx`). Certify validates
    the exact shape that hits disk *before* writing (refuses to write an invalid
    entry); reject is a hard delete (schema §6, after a `y/n` confirm); edit opens
    `$VISUAL`/`$EDITOR`, then re-validates — a schema-breaking edit is reported,
    never silently accepted.
  - **Source pane** (`src/review/source.ts`): resolves the `mined_from.commit`
    message + diff via `git show`, **graceful** on a missing ref (rebased/shallow
    clone → "not found"), independent of T06's git layer.
  - **Certifier identity:** `git config user.name` → `$USER`/`$USERNAME` →
    `unknown`; `certified_at` = today (`YYYY-MM-DD`). Review only mutates
    `.artha/**`; the developer runs `artha build` after to re-index.
  - **Toolchain:** added `ink` + `react` as runtime deps (externalized by tsup, so
    `cli.js` stays ~63 KB) and `@types/react` + `ink-testing-library` (dev);
    automatic JSX wired into `tsconfig.json` and `vitest.config.ts` (`.tsx` tests).
  - 18 tests: action layer, real-git source resolver, and render tests that drive
    keypresses through `ink-testing-library` (certify writes a valid certified
    file; reject deletes after confirm; arrow-key nav; never certifies at rest).

- **T06 — `artha mine`** done. Git history → `proposed` decision drafts via the
  Anthropic API. Pipeline: `listCommits` → metadata pre-filter (drop merges /
  already-mined / noise subjects, rank by rationale/revert/issue-ref signals) →
  per candidate, load the diff and apply diff-level skips (lockfile-only,
  formatting-only, trivial) — **zero LLM spend for skips** → send survivors to
  the miner up to a spend cap (`--max`, default 20) → validate each draft through
  T02 → write ADR-numbered `proposed` YAML with `mined_from`. 18 tests (prefilter,
  ledger, end-to-end with a stubbed miner) + verified on real history via
  `mine --dry-run`.
  - **Pluggable engines** behind a shared `Miner` interface + shared prompt/parse
    (`src/mine/miner.ts`); selected by `config.miner.engine` via `engine.ts`:
    - `api` (`src/mine/anthropic.ts`, default): `@anthropic-ai/sdk` with
      **structured output** (`output_config.format` JSON schema) so drafts conform
      by construction. Focused content-only schema (the full §5.1 schema's
      `if/then` conditionals aren't valid for structured outputs); the complete
      entry is assembled + re-validated through T02 before writing. SDK is
      dynamically imported so `build`/`review`/MCP/`export` stay fully offline.
    - `claude-cli` (`src/mine/claudeCli.ts`): shells out to `claude -p
      --output-format json`, **reusing the user's existing Claude Code login**
      (subscription or key) — no separate `ANTHROPIC_API_KEY`. Verified live on
      both engines. Trade-off: each CLI call carries Claude Code's system-prompt
      overhead (~17k cached tokens), so `api` stays leaner for raw-key users.
      Windows-safe spawn (`.cmd` shim via shell; static argv; system prompt +
      commit on stdin). Injectable `CliRunner` for tests.
  - **Auth (broadened):** the `api` engine accepts `ANTHROPIC_API_KEY`,
    `ANTHROPIC_AUTH_TOKEN`, **or** an `ant auth login` OAuth profile on disk
    (subscription, no raw key); missing → `ArthaError` with a hint pointing at all
    three plus `engine: claude-cli`. (Fixes an earlier over-strict env-only check.)
  - **Open Q1 — DECIDED: keep `claude-opus-4-8` default** (no silent downgrade;
    cost bounded by prefilter + spend cap). Cheaper tiers remain config opt-ins.
  - **Open Q2 — DECIDED: separate `.artha/.mined` ledger** (`src/mine/ledger.ts`),
    authoritative skip-set unioned with existing drafts' `mined_from`. A
    rejected/deleted draft's commit stays skipped — never re-drafted or
    re-charged. Every mined SHA (drafted *and* no-decision) is recorded.
  - **Open Q3 — DECIDED: commit messages + diffs only** (no `gh`/GitHub dep).
    Seam left for PR enrichment: `mined_from.source = git-history` + the
    `src/mine/git.ts` layer is the single place a PR enricher would slot in.
  - Batches API (optional per the task) deferred — single-pass + prefilter +
    spend cap is the chosen cost path for v0.1.

### 2026-06-20

- **T05 — `artha build`** done. Compiles `.artha/` YAML → SQLite + FTS5 index
  (schema §8). Pipeline: load/validate (T02) → resolve pins (T04, unresolvable =
  build failure naming the ref) → recompute hashes, fill blanks, flip drifted
  certified entries to `stale` on disk → expand scope globs → warn on dangling
  refs → emit. Fully offline. 7 tests + verified end-to-end.
  - **Zero new dependencies:** uses Node 26's built-in `node:sqlite` (FTS5
    compiled in) and `fs.globSync`. `node:sqlite` is loaded via `createRequire`
    so vitest/Vite (whose builtin list predates it) doesn't choke.
  - `buildIndex(repoRoot, config)` → `Promise<BuildReport>` (async, since the
    resolver is). `.artha/index.db` is the read contract for T08/T09.

- **T03 — Config loading & `artha init`** done. `loadConfig(repoRoot)` returns a
  typed `ArthaConfig` layered over defaults (pure + sync; missing file → defaults,
  malformed → ArthaError, mistyped fields → per-field fallback). `artha init`
  idempotently scaffolds `.artha/{decisions,invariants,conventions}/` (+`.gitkeep`)
  and a commented `config.yaml`, never clobbering an existing config or entries.
  12 tests. Default miner model kept at `claude-opus-4-8` (no silent downgrade; Q1
  semantics still owned by T06).

- **T04 — SymbolResolver** done. Built-in tree-sitter JS/TS resolver behind the
  `SymbolResolver` interface; resolves `path#Symbol` and `path#Class.method`,
  hashes normalized spans for staleness. 15 tests.
  - **Open Q4 resolved:** normalize whitespace, keep comments (a comment-only
    edit flips staleness). Isolated to `normalizeForHash` in `src/resolver/hash.ts`.
  - Deviation: `web-tree-sitter` pinned to `0.20.8` (≥0.25 changed the WASM
    linking model and won't load `tree-sitter-wasms` grammars).
  - Deviation: `createTreeSitterResolver` is async (`Promise<SymbolResolver>`)
    because WASM init is async; `resolve`/`hash` remain sync. **T05 must await.**

- **T02 — Schema, types & validation** done. The `.artha/` data model in code:
  `ArthaEntry` union, §9 JSON Schema, AJV validator, YAML loader/dumper. 14 tests.

- **T01 — Project scaffold & tooling** done (commit `638c968`). npm package,
  `artha` CLI shell with stub subcommands, MCP entry, test/lint/typecheck wired.

## Open questions still pending (do not silently resolve)

- **Q5** success-test baseline definition → owned by T10
- ~~**Q1** miner model default~~ → resolved 2026-06-21: keep `claude-opus-4-8` (see T06 log)
- ~~**Q2** idempotency ledger~~ → resolved 2026-06-21: separate `.artha/.mined` (see T06 log)
- ~~**Q3** PR vs. commit mining~~ → resolved 2026-06-21: commit-only, PR seam left (see T06 log)
- ~~**Q4** content-hash normalization~~ → resolved 2026-06-20 (see T04 log)
