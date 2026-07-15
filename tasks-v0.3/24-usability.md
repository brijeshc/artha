# 24 - Usability hardening (robust before the next step)

**Status: complete. Specced 2026-07-15 from a full UX audit of the live demo; 24a-24b shipped 2026-07-15, 24c-24g shipped 2026-07-16.**
**This task gated 21b, 22, and T18** - the decision (2026-07-15) was that the application must be robust and legible before new layers are added on top. The gate is now open.

## Why

The audit walked every view as a first-time user (board, terrain, capabilities, observatory, queue, module/concept/flow/inferred pages, command bar, review walk, evidence reveal) and found one root complaint confirmed three ways: **the UI is harder to follow than its data warrants**.

1. Four overlapping vocabularies name one trust ladder, and the same act is "Vouch" in the walk but "Certify" on pages.
2. Capabilities render once per area they touch, so 3 real things display as 8 cards/rows.
3. The default Board view cuts off content at first paint and defines none of its terms on-screen.

Everything below is a verified finding with a locked decision.
The product decisions were interviewed and locked 2026-07-15 (see the UX locks in [../PROGRESS.md](../PROGRESS.md)).

## Locked decisions (2026-07-15)

- **Vouch everywhere.** The public word for the human act and its state is *vouch / vouched* on every button, pill, and KPI. `certified` survives only in storage and the API (`.artha/*.yaml` status, `/api` payloads).
- **Three-light ladder only.** The visible standing of anything is *vouched / described / unexplained*, with *stale* as a modifier. The coverage-bucket words (dark zone / thin / partial / understood) leave the UI; depth reads as a plain number ("3 facts vouched").
- **The queue is "Explain next".** Nav item, page title, and crumb; the badge is the queue length, so the number always matches the rows.
- **Dark = unvouched.** Server semantics stay (`certifiedFacts === 0`); every definition is reworded to "busy code with no vouched meaning yet". Moonlight lights the reading but does not cure darkness.
- **The vouched KPI becomes a reachable share.** % of recent change (churn) sitting in modules with at least one fresh (non-stale) vouched fact; reaches 100%; the same formula feeds the area meters and the inspector. Saturating depth (`c/(c+1)`) stays internal as a ranking signal (queue uncertainty).
- **Task home.** This file; it absorbs two 23e items (catalog dedup, zoom) so there is one prioritized list.

## Slices, in fix order

### 24a - one vocabulary (shipped 2026-07-15)

The lexicon pass; almost entirely `web/src/copy.ts` plus the components that spell status by hand.

- [x] Every certify control says **Vouch** (`CURATE.certify` -> 'Vouch'/'Vouching…'; the inferred-page callout no longer contradicts its own gloss).
- [x] Status pills read **vouched / proposed / stale** - a new `statusWord()` display map in `Status.tsx` over the stored `certified`, reused by the route card and the catalog filter chips.
- [x] The standing slot shows the three-light ladder + a stale modifier chip (module page + inspector); bucket words (thin/partial/understood/dark zone) deleted from the UI; depth reads "facts vouched: N".
- [x] Board and terrain footers use one grammar: `vouched ×N` / `described` / `unexplained` (the terrain's mystery "described · 1" became `described ×N`).
- [x] The evidence-reveal button is **"Show the code"**; the review walk's evidence panel head is "The code behind this claim" - "read from code" now belongs to the confidence tier alone.
- [x] Review-walk framing says **"unvouched or drifted claims"**.
- [x] "+ Add a note" / "Edit the note" replace the delta-jargon button labels.
- [x] The "in scope" chip reads **"applies module-wide"** with an explanatory title.
- [x] Acceptance: `grep certif` over `web/src` shows only storage values, API paths, CSS class names, and type comparisons; 408 tests + lint + both typechecks pass; verified live on the demo (inspector, module page, inferred page screenshots).

### 24b - honest numbers (shipped 2026-07-15)

Every number's referent must be visible or one click away; no two disagreeing counts.

- [x] Queue view renamed **Explain next** (`NAV.queue`, `QUEUE.title`, cold CTA); the nav badge is the queue length (`queueCount` prop fed from the value queue), so the number always matches the rows.
- [x] Dark redefined wherever it appears: KPI hint "busy modules where no vouched meaning holds", terrain legend "no vouched meaning holds - none yet, or it all went stale", cold headline "0% of active code vouched" (the inspector/module wording had landed with 24a).
- [x] Vouched KPI is the **reachable churn-weighted share** (modules holding >= 1 fresh vouched fact; `hasVouch` in `derive.ts`); `areaStats.vouched` uses the identical formula, so the top bar, area meters, and area inspector are one number system. `coverageOf` stays internal (queue uncertainty, the flying-blind y axis, terrain brightness).
- [x] `areaShares` reframed to the same grammar: each module's churn mass lands wholly on its standing, so the phosphor segment *is* the area's vouched share - the same number everywhere.
- [x] Observatory area bars self-label ("100% vouched"), so a fully-described bar can no longer read as a broken bare "0%".
- [x] Solo pseudo-areas (a module named after itself, e.g. `reports`) are excluded from the area bars - "one bar per product area" is now true.
- [x] Queue rows print churn once: the why-chip words the count, the bar (now aria-labelled) visualizes it; the duplicate `NΔ` readout is gone.
- [x] Acceptance: demo badge 5 = 5 rows; every on-screen % carries its referent; top bar reads 30% vouched / 100% described with definitions that no longer contradict. 408 tests + lint + both typechecks; verified live (queue + observatory screenshots).

### 24c - orientation on the default view (shipped 2026-07-15)

The five-second rule on screen one.

- [x] Board fits the viewport on first paint: `placedLayout` (extracted, shared) gives the extent; the viewport measures itself (ResizeObserver) and renders the SVG at `min(1, fit)` - the demo loads at 73% with every box visible.
- [x] Tracing a flow (or selecting an off-screen module) scrolls the first station into view, smooth-centred.
- [x] **Zoom** (absorbed from 23e): − / % / + controls plus Ctrl+scroll; Fit restores auto-fit; drags divide by the scale so hand layouts stay exact while zoomed (`useBoardDrag(storeKey, getScale)`).
- [x] The Board carries its own Legend ("Reading the board", `BOARD_LEGEND`) in a top-right controls row - box/arrow grammar, the three lights, the counts, the stale underline, the click grammar.
- [x] `Δ` is defined in both legends ("6Δ counts its commits in the last 90 days (Δ = change)"; `LEGEND.churn` added to the terrain popover).
- [x] Acceptance: at 1600x900 the whole demo graph is visible on load (screenshot); the traced route shows every station (screenshot); every glyph on the default view is defined one click away. 410 tests + lint + both typechecks.

### 24d - findability (shipped 2026-07-16)

The command bar must find what exists and every hit must go somewhere.

- [x] Prefix matching for facts: `toFtsQuery` treats the final token as still being typed (`"ref"*`), so "ref" finds "Refund a purchase" mid-word; shared with MCP retrieval, where a trailing word matching its own inflections only helps.
- [x] Rules & decisions hits navigate: `/api/search` hits carry the module the fact governs (first pin/scope via `moduleOf`), and the command bar opens it; a fact touching no module stays visible under an honest "Not yet linked to code" group.
- [x] Arrow-key + Enter navigation with the ARIA combobox pattern (ids + `aria-activedescendant`); the flat list is built in *display* order so ↑↓ moves the way the eye reads, and a keys line ("↑↓ pick · enter opens · esc closes") sits under the results.
- [x] Hint copy matches behavior: "every result opens its page".
- [x] Acceptance: live-verified over CDP - "mon" surfaces the Money invariant labelled with its landing module (billing), ArrowDown moves the highlight down the visible list; `/api/search?q=ref` returns the refund flow. 412 tests + lint + both typechecks.

### 24e - one card per capability (absorbed from 23e; shipped 2026-07-16)

- [x] Catalog: one card per capability under its primary area with quiet "also in Buying · Platform" chips (`capabilitiesByPrimaryArea` in `derive.ts`; `CapCard` grows an `also` line).
- [x] Navigator: each capability listed once under its primary area (a title names the other areas); the area *inspector* keeps the full per-area listing via `capabilitiesByArea` - inspecting one area should list everything it touches.
- [x] Checkout-concept vs checkout-module: with the dedup, "Checkout" appears once as a card and once as a module row; the kind glyph (●/→ vs ▪ mono) carries the distinction.
- [x] Acceptance: the demo catalog shows exactly 3 vouched-tier + 3 machine-described cards (screenshot); nav capability rows equal distinct capabilities. 413 tests + lint + both typechecks.

### 24f - safe hands in the review walk (shipped 2026-07-16)

- [x] **Enter advances; only `v` vouches**; the key legend reads "j / k / enter move · v vouch".
- [x] After a vouch, the claim card offers an inline **undo** beside the outcome pill; it re-proposes via the existing edit path against the *written* id (a materialized inferred claim un-certifies the new entry, honestly staying a proposed draft with provenance).
- [x] Acceptance (live, CDP): Enter ×3 through the billing walk ends on "Nothing was vouched this pass" with server state byte-identical; `v` on the stale Checkout concept certifies it, undo returns it to proposed. Tests + lint + typechecks green.

### 24g - reading order and honest details (shipped 2026-07-16)

- [x] Flow page: **Steps are section 01**; the entry pins + Suggested-code workbench follow as section 02 - the reader's contract ("describe the capability from this page alone") outranks the curation tooling.
- [x] "Why & related" reads in product language: `related` now carries the resolved heading server-side (`RelatedRef { id, name }` from `relatedOf`), so `invariant.money` renders as "Money is integer minor units"; a raw id is the last-resort fallback only.
- [x] State-table empty cells say **"not recorded yet"** (`DELTA.notRecorded`); the table lives only on human-authored concept pages, where "not read from code" was provenance-speak implying the wrong author.
- [x] Machine summaries render `` `code spans` `` as real code (shared `CodeProse` in `Status.tsx`, applied to the inferred page, the module lead, and the walk's claim prose).
- [x] Acceptance: demo flow page leads with Steps (screenshot); render tests pin the order, the name resolution, and the honest empty cell. 414 tests + lint + both typechecks.

## Out of scope

- The remaining pure-craft 23e items (chalk state machines, crossing-minimizing board layout, committed board layout, more trace entry points) stay in 23e.
- The a11y pass (keyboard traps, contrast, screen-reader labels) is its own audit and task.
- 21b/22/T18 feature work; this task exists so they land on a legible surface.

## Verification

Each slice ships with its own web render tests (the SSR harness covers all of this), lint + both typechecks, and a live E2E pass on `npm run demo` with screenshots.
The whole task closes with a repeat of the audit walk: a first-time reader must be able to say what every visible word, number, and glyph means using only what is on screen or one click away.
