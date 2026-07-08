# Artha Dashboard — what makes it meaningful, and how to deliver it

> Research + design memo on the v0.2 dashboard (Task 16). Written after the first
> build of the Product↔Code map shipped as a *scholarly document* and read as
> **confusing — failing to deliver meaning**. This is the make-or-break surface
> (Product.md §10: the human-facing layer is the spine of v0.2), so it gets a
> first-principles rethink, grounded in how comparable tools actually present a
> codebase. Companion to [Product.md](Product.md) §10 and
> [SPEC-v0.2.md](../SPEC-v0.2.md) §B.
>
> **Status:** Part 1 (§§1–10) diagnosed the scholarly T16 UI and specced the 16a–c
> instrument redesign, which shipped.
> The 16a/16b build was then itself reviewed against the product goal and found
> still short of "powerful and meaningful" (a scrolling page of sections, not a
> navigable knowledge base).
> **Part 2 (§11) documents the second redesign — the shipped full-screen atlas
> shell — which supersedes the page-of-sections layout while keeping every
> principle in §4.**
> **§11.5 documents the T17 curation surface layered onto that shell — certify,
> edit, and link as instrument operations, not a form beside the map.**

---

## 1. The verdict: we built a document; the brief wanted an instrument

Task 16 chose a **scholarly / journal register** (design-scholarly + thesis): a
masthead, a 120-word abstract, a glossary that defines every term, margin
sidenotes, and two-column text ledgers set like a monograph. It is *internally
consistent and well-crafted* — and it is the wrong genre.

A scholarly document optimizes a careful reader moving **linearly** through an
argument. A dashboard optimizes a scanner who must grasp the state of a system
**at a glance** and then drill where it matters. These are opposite information
designs. We applied the reading-an-essay design to a problem that needed a
seeing-a-system design, and the result reads like a paper *about* Artha rather
than an instrument that shows *this codebase's meaning*.

Everything below is the case for that claim and a concrete plan to fix it.

---

## 2. Why the current dashboard fails to deliver meaning

Six specific failures, each fixable.

### 2.1 The map isn't a map — it's two text lists
The centerpiece is specified as a **Product↔Code map where pins are drawn as
links between two columns** (Product.md §10.2). What shipped is two `<ul>`
ledgers; the "link" exists only as a *lit/dimmed* state after you click, plus a
sentence ("Selected the area X — implemented by Y"). Nothing is *drawn*. There is
no line, no spatial relationship, no shape to the connection. A reader cannot
**see** the mapping — they must click one row at a time and read prose to
discover each relationship. That is a lookup table with a reveal animation, not a
map. The single most important visual in the product is the one that isn't visual.

### 2.2 It teaches vocabulary instead of showing the thing
The design assumes the reader must first *learn* "product area," "code module,"
"pin," "dark zone," "churn," "invariant" — via a glossary and margin definitions —
before any value lands. That is a large cognitive toll up front. **The glossary is
a symptom, not a feature:** if a good visual needs "dark zone" defined in the
margin, the visual isn't doing its job. A dark zone should *look* dark; a stale
pin should *look* broken. Show the thing and most of the glossary evaporates.

### 2.3 It explains Artha, not the codebase
Count the words on screen: the overwhelming majority describe *the system*
(what a concept is, how to read the map, what the columns mean) rather than *the
product's actual meaning* (what Checkout does, what states a Subscription has).
The signal-to-noise is inverted. The user's product is "what does this codebase
mean"; the dashboard should be **dominated by that content**, with meta-explanation
demoted to a one-time, dismissible aside.

### 2.4 The quantities we compute are hidden as 9-point text
We already calculate rich signal per module — **churn, coverage, freshness,
health score, certified count, stale count** (T13; exposed on `/api/map` and
`/api/dark-zones`). On screen these appear as tiny grey text ("churn 12", "3
certified"). None of it is *encoded*: no size, no color ramp, no position, no
proportion. A dashboard's whole power is mapping quantity to a visual channel so
the eye does the comparison. We do the expensive computation and then throw away
its legibility.

### 2.5 The register fights the medium
Serif body text, hairline rules, near-zero motion, status-as-small-caps-text
(not color) — this is tuned for *calm linear reading*. It actively suppresses the
contrast, color, and visual weight a scanner needs to triage. "Calm" was the goal
of the scholarly skill; "I can see the state of my codebase in five seconds" is
the goal of this product. They conflict, and the register won.

### 2.6 The leadership promise is unkept
Product.md §10.1 promises leadership a view where "product areas colored by
understanding … high churn plus low certified meaning is where you're flying
blind." There is no such view. There is no at-a-glance answer to *"which parts of
the product does nobody understand anymore?"* — which is the exact value that
makes a non-engineer care, and the exact thing the data is ready to render.

---

## 3. What "meaningful" actually means here — the three jobs

The dashboard serves three readers with three different questions. The design
must answer each in **under five seconds at the overview, then on demand in
depth** (the dashboard "5-second rule" — see Sources).

| Reader | The question they open with | What they need to *see* (not read) |
|---|---|---|
| **PM / leadership** | "What does this product do, and where are we flying blind?" | A map of the codebase where understood areas and **dark, high-churn risk** are visually obvious — coverage and risk encoded in size/color, not counted in text. |
| **PM / new teammate** | "Pick a capability — what is it, what states can it be in, how does it behave?" | A capability they can open into a **drawn state machine + plain-language summary + governing rules**, with status on each, no code-reading. |
| **Engineer** | "I'm about to touch module X — what governs it and why?" | From a code location: the concepts/flows it implements, the invariants/conventions in scope, and the **why** (decisions), each clickable down to the symbol. |

The current design half-serves reader #2 (the detail view is its best part) and
fails #1 and #3 outright. The redesign must serve all three from one overview.

---

## 4. Principles for the redesign (grounded in dashboard practice)

1. **Show, don't define.** Encode meaning so the visual carries it; retire the
   glossary to a single collapsible "How to read this" affordance. A dark zone
   looks dark; stale looks broken; high churn looks big/hot.
2. **Encode quantity on a visual channel.** Map churn → size or heat, coverage →
   color, status → color, freshness → saturation. We *already have these numbers*
   (§2.4); spend them on pixels.
3. **Progressive disclosure: overview → capability → code.** One glanceable hero,
   then drill. Don't put the symbol graph (or the glossary) on the front page.
   (Information overload is the #1 dashboard failure — see Sources.)
4. **Content over chrome.** The product's meaning fills the screen; Artha's
   self-description shrinks to a one-time aside. Invert today's ratio.
5. **One hero visual, not a wall of sections.** Pick the single most important
   thing (the understanding map) and make it the page; everything else supports it.
6. **Keep the substance we got right.** The detail-view *content model* (states,
   transitions, pins, related, status-everywhere), the offline/system-font
   discipline, and the centralized copy are correct. We are changing the **genre
   and the visual encoding**, not the data or the values.

---

## 5. The proposed dashboard

The spine is a **single hero map** plus **progressive drill-down**. Concretely:

### 5.1 Hero — the Understanding Map (a hotspot/health map)

Replace the two text columns with **one spatial field of module tiles**. This is
the design CodeScene proved for codebases: tile/box **size = activity (churn)**,
**color = health** (here, *understanding* health = certified coverage), so the
eye instantly finds *"big and dark"* = high-churn, unexplained = where you're
flying blind. Product areas are **labeled groupings** of their modules, so the
"product side" is present as structure over the same field rather than a
disconnected second list.

```
  THE MAP — what this codebase means, and where it doesn't
  ───────────────────────────────────────────────────────────────────
   Billing                         Checkout              Platform
  ┌───────────┬──────┬────┐      ┌──────────────┐      ┌─────┬───────┐
  │ ███████   │ ████ │ ▒▒ │      │ ░░░░░░░░░░░░ │      │ ███ │ ▓▓▓▓▓ │
  │ payments  │ money│ tax│      │  checkout    │      │ auth│ jobs  │
  │ 4 cert\d  │ 2 c. │ ?  │      │  UNEXPLAINED │      │ 3 c.│ 1 c.  │
  │           │      │    │      │  churn 31 ↑  │      │     │ 2stale│
  └───────────┴──────┴────┘      └──────────────┘      └─────┴───────┘
   ███ understood   ▓▓ partial   ▒▒ thin   ░░ dark (high churn, no meaning)
```

- Tile **size** ∝ churn (active code earns visual weight; the cost of *that*
  being unexplained is what matters).
- Tile **color** ∝ coverage/health: understood (ink/green) → partial → thin →
  **dark zone** (the literal dark tile). Stale gets a hatch/marker.
- Hovering or selecting a tile **draws its connections** to the capabilities that
  explain it (§5.6) and reveals counts; clicking opens the **module view** (§5.5).
- This *is* the leadership view (§2.6) and the engineer's entry point, in one
  picture. No glossary needed to read it.

> This is the one change that flips "confusing" → "informative." It turns the
> data we already compute into the at-a-glance answer the brief asked for.

### 5.2 The Capability Catalog (concepts + flows as cards)

Below/beside the map, the product's capabilities as **a grid of cards** (the
Backstage software-catalog pattern: a discoverable, filterable catalog of "things
the system has"). Each card is glanceable:

```
  ┌─ concept ──────────────┐  ┌─ flow ─────────────────┐
  │ Subscription   ●certified│  │ Checkout      ●proposed │
  │ trialing→active→past_due │  │ 6 steps · 2 not linked  │
  │ →canceled  (4 states)    │  │ cart → pay → confirm →… │
  │ src/billing              │  │ src/checkout            │
  └──────────────────────────┘  └─────────────────────────┘
```

A concept card previews its **state chain**; a flow card previews its **step
spine** and coverage ("2 not linked"). Status is a colored dot, not a word.
Filter by area/status; this is also where search results land (§5.7).

### 5.3 Concept detail — *draw* the state machine

The detail view's content is right; its *presentation of the state machine* is a
table + a separate transitions list, which forces the reader to reassemble the
machine in their head. **Draw it** — nodes and labeled arrows — because the
state machine is the single highest-value thing a PM came to read:

```
   ┌──────────┐  first invoice   ┌────────┐  payment fails  ┌──────────┐
   │ trialing │ ───────────────▶ │ active │ ──────────────▶ │ past_due │
   └──────────┘                  └────────┘                 └──────────┘
                                      │                           │
                                      │ cancel          grace ends│
                                      ▼                           ▼
                                 ┌──────────┐  ◀───────────  (entitlement
                                 │ canceled │                  revoked)
                                 └──────────┘
   active · invariant: currentPeriodEnd is non-null and in the future
```

Keep the per-state effect/invariant as a companion table beneath the diagram, and
keep "Implemented in code" (pins) and "Why & related" exactly as they are. A
small, dependency-free SVG/flow renderer is enough; no heavy graph library.

### 5.4 Flow detail — the step ladder with honest coverage
The current ordered list is close. Strengthen the **coverage signal**: render the
flow as a vertical ladder where each step shows linked ✓ / **not-yet-linked ○**,
and surface the count at the top ("4 of 6 steps linked"). The `pin: null` step
stays "not yet linked," never an error (the v0.3 coverage seam) — but make it a
*visible gap in a ladder*, which reads as "incomplete map," exactly its meaning.

### 5.5 Module view (the engineer's entry)
Clicking a map tile opens the module: the **concepts/flows** that touch it, the
**invariants/conventions in scope**, the **why** (decisions), and its churn/
coverage/stale facts — each drilling to the symbol. This is the §10.1 "engineer
enters from code" lens, currently missing entirely. The data exists (pins carry
the module; `related` carries the rules).

### 5.6 The Product↔Code linkage — how the "map" survives
The literal two-columns-with-lines diagram gets messy past ~15 modules and is
hard to keep legible (the hairball risk the SPEC explicitly warns about). The
better expression of the same relationship:
- **Selection-driven connections.** Select a capability (card) → its modules
  **light up on the map** and thin **leader lines** draw from the card to those
  tiles. Select a module → its capabilities light up in the catalog. The link is
  *drawn*, but only for the focused item — legible at any repo size.
- This keeps Product.md §10.2's "select a concept and its implementation lights
  up" intent, but on a real map instead of two static lists.

### 5.7 Search → a command bar
Wire `/api/search` into a persistent **⌘K-style command bar** ("Find a
capability, module, or rule…"), results grouped by kind, concept/flow hits open
detail, module hits focus the map tile. This is the discovery primitive a portal
lives on (Backstage's most-used feature is search). The debounced fetch already
exists; it just needs to stop being a small inline box and become a first-class
affordance.

### 5.8 Cold start
The map is honestly **mostly dark** — that's the true signal (Product.md edge
case), but it is now a *map* with dark tiles and a header reading **"0% of active
code explained — start here,"** funneling into the dark-zone queue (darkest/
busiest first). No essay, no blank screen; the emptiness itself is the call to
action.

---

## 6. The header strip: KPIs that earn the top of the page

The top-left is where eyes land first (visual-hierarchy research — see Sources).
Spend it on the four numbers leadership actually wants, as **stat blocks**, not a
prose colophon:

```
  ┌─ % active code explained ─┐ ┌─ dark zones ─┐ ┌─ stale ──┐ ┌─ certified ─┐
  │        38%   ▲ +6 / 30d   │ │   7  ↑busy   │ │    3     │ │     21      │
  └───────────────────────────┘ └──────────────┘ └──────────┘ └─────────────┘
```

(Trend deltas are a v0.3 nicety once history exists; the absolute numbers ship
now from the map feed.) This is the leadership lens (§10.1) in four tiles.

---

## 7. What we keep (don't throw out the substance)

- The **detail-view content model** — states, transitions, pins, related,
  status + provenance on every item. Right. Re-skin, don't rebuild.
- **Status everywhere** and the **certified/proposed/stale** vocabulary — core to
  the trust thesis (Product.md §5.9). Keep it; render as **color**, not text.
- **Offline + system-font discipline** — no fetched fonts, reads `index.db`, zero
  network. Non-negotiable; keep exactly.
- **Centralized copy (`copy.ts`)** — good engineering. Keep; just write far less
  of it, and move the definitions behind a single "How to read this" disclosure.
- The **presentational/container split + SSR render tests** — the architecture is
  sound and the seam T17 (write-back) hooks into stays valid.

The redesign is a **genre and encoding change, not a data change.** Same API,
same values, same offline guarantees.

---

## 8. Data: what we have vs. what we'd want

**Already available** (no backend work): per-module `churn`, `coverage`,
`freshness`, `score`, `certifiedFacts`, `staleFacts`, `dark`; area groupings;
concept `states`/`transitions`; flow `steps` with per-step pin; `related`; `pins`
with stale flag. **This is enough to build §§5.1–5.8 and §6 today.**

**Nice to add later** (small backend deltas):
- **LOC (or symbol count) per module** for a more honest tile size than churn
  alone (CodeScene uses size=complexity/LOC, color=churn-driven health; we can
  start with size=churn, color=coverage and refine).
- **Connection list** (area/capability → modules) is derivable from pins already
  in the map feed; no new endpoint needed for §5.6.
- **History** for the trend deltas in §6 — defer to v0.3.

---

## 9. Sequencing — deliver impact without a rewrite

The components are already pure and prop-driven, so this is incremental.

- **Phase 1 — flip the genre (highest impact, ~1 task).**
  1. Header KPI strip (§6).
  2. Turn the module column into the **Understanding Map** of encoded tiles
     (§5.1), areas as groupings.
  3. **Draw the state machine** in concept detail (§5.3).
  Drop the abstract, glossary, and sidenotes to a single collapsible "How to read
  this." These three changes alone move it from "confusing" to "informative."

- **Phase 2 — the catalog and connections.**
  4. Capability cards (§5.2) with state/step previews.
  5. Selection-driven connection highlighting + leader lines (§5.6).
  6. Command-bar search (§5.7).

- **Phase 3 — the engineer lens + polish.**
  7. Module view (§5.5).
  8. Flow ladder coverage (§5.4), cold-start funnel (§5.8).

Phase 1 is the make-or-break demo. Build it, put it in front of a non-author
(the T20 success test), and iterate on *that* signal.

---

## 10. A note on visual identity

Drop the scholarly skin; this is a **control surface / instrument**, not a
journal. The register should be: dense but calm, monospace-comfortable, **color
used as data** (a coverage ramp + the certified/proposed/stale/dark palette doing
real work), high-contrast enough to triage, restrained enough not to look like a
toy. Run [design-dna](skill) first to derive a distinct identity, then a register
closer to **design-minimal or design-brutalist** (exposed structure, honest
density) than scholarly — or use the **impeccable** skill to drive the dashboard
pass directly. The dark-zone palette is the one place color *must* carry meaning;
everything else stays quiet so the data is the loudest thing on screen.

---

## 11. Part 2 — the atlas shell (shipped redesign, 2026-07-04)

### 11.1 Why the 16a/16b page still missed

The instrument re-skin fixed the *encoding* (churn and coverage became pixels) but kept the *genre* of a scrolling web page: KPI cards, then a dark map panel, then a card grid, then a table, stacked 2,800px tall.
Review against the product goal found five residual failures.

1. **A scroll, not a place.** Navigating meaning was scrolling past sections; there was no sense of location, no hierarchy to descend, no URL for anything.
2. **The map still wasn't terrain.** Flex-wrapped rounded buttons in width buckets left dead space everywhere and made "size = churn" barely legible; a tile field is not a map.
3. **Two worlds.** A light page wrapping one dark panel split the identity and demoted the hero to a widget.
4. **Ids over language.** `concept.subscription` chips and `src/...` strings dominated surfaces meant for product readers.
5. **The engineer lens was still missing** (16c unbuilt), so a third of the promise had no surface at all.

### 11.2 The shape that shipped

A **full-screen application shell** (100vh, panes scroll internally, nothing outside it) with the map as the default canvas.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ARTHA / crumb / crumb          62% explained · 7 dark · 3 stale · ⌘K │  top bar 52px
├───────────────┬──────────────────────────────────────┬───────────────┤
│ NAVIGATOR     │                CANVAS                │ INSPECTOR     │
│ Atlas         │  #/            the Understanding     │ (on atlas     │
│ Capabilities  │                Atlas (treemap)       │  selection)   │
│ Dark zones    │  #/capabilities catalog by area      │ module: stats,│
│ ── areas ──   │  #/queue        ranked dark zones    │ capabilities, │
│ ▸ Billing &…  │  #/module/<m>   engineer lens        │ rules, why,   │
│ ▸ Buying      │  #/concept/<id> state machine        │ open →        │
│   …           │  #/flow/<id>    step ladder          │               │
└───────────────┴──────────────────────────────────────┴───────────────┘
```

- **The Understanding Atlas** is a real **squarified treemap** (hand-rolled, `web/src/treemap.ts`, zero deps): area ∝ churn + floor, brightness = certified coverage, stale = hatched seam, product areas drawn as named **provinces** around their modules.
  "Big and dark = flying blind" is now geometry, not annotation.
- **Routes are the state.** A tiny hash router (`web/src/router.ts`) puts every view *and the atlas selection* in the URL (`#/?m=src%2Fbilling`), so the whole knowledge base deep-links and the back button retraces the reader's path.
- **Navigator** (left) is the gazetteer: views, then one expandable section per product area listing its capabilities in product language and its modules in mono.
  This is the "different section for different business logic" hierarchy.
- **Inspector** (right) is the chart margin: select a tile and get standing, stats, the capabilities built on it, the rules in scope, and the why, without leaving the map; select again (or "Open module") for the full page.
- **Module page** (16c engineer lens) from `/api/module/:id`: capabilities, invariants/conventions **with their rule text**, decisions with their reasoning, each with status, pinned symbols, and the scope join.
- **Capability pages** keep the drawn state machine and add the **flow ladder**: filled rungs are linked steps, dashed hollow rungs read as the honest gap, with a `n/m linked` count.
- **Catalog** groups capability cards under area headings with kind/status filter chips.
  **Queue** draws churn bars so "busy and unexplained" ranks visibly.
  **Cold start** renders the all-dark terrain with a centered "0% of active code explained" funnel into the top three dark zones and the queue.

### 11.3 Identity (design-dna contract)

Adjectives: **cartographic · instrumental · assured**.
Reference world: a **satellite night-map** — understanding literally glows like city lights against dark, unexplained territory, which makes the product's own vocabulary ("dark zone", "flying blind") the visual system.
One fully dark world (the light page is gone); phosphor teal is the single hue meaning *certified light*, amber means *proposed*, ember means *stale*; everything non-data stays grey.
Mono-forward type for data and labels, sans for prose, both system stacks so viewing stays offline.
Sharp corners, hairline borders, glow used only as data; motion is one 130ms ease-out.
Product names lead everywhere; ids demote to metadata lines.

### 11.4 What carried over unchanged

The §4 principles (show don't define, encode on visual channels, progressive disclosure, content over chrome), the read API and its offline guarantees, `copy.ts` as the single voice file, the pure-component + SSR render-test architecture, and the drawn `StateMachine`.
The T17 write-back and T18 ask-loop seams now hang off routes and the inspector instead of a page's selection state.

## 11.5 Curation — the map you can write to (T17, shipped 2026-07-04)

The atlas stops being read-only: you certify, edit, and link from the same surface you read.
The design rule was that curation must feel like *operating the instrument*, not filling in a form beside it.

- **Certify is the one loud action.**
It borrows the phosphor of understanding and, on hover, fills and glows — so certifying a dark capability literally lights it up, in the same phosphor the atlas uses for certified coverage.
It is the only path to `certified` (never auto-certify), and it disappears once an entry is certified, because the header stamp already carries that signal.
- **Edit and link stay quiet.**
Edit opens an inline name/summary panel; link opens a **search-and-pick symbol picker** under the pins list — you type a class, function, or file name and choose from ranked candidates, never a hand-typed path (that doesn't scale past a toy repo).
The candidates come from an offline catalog of every resolvable symbol under the source roots (`/api/symbols`, warmed at server start), so every pick is guaranteed to resolve.
Both controls are hairline and collapsed until asked for.
Editing an entry returns it to `proposed` and clears the stamp, because changed content is no longer the thing a human vouched for; you re-certify to re-vouch.
- **Every kind has exactly one certify surface.**
Concepts and flows certify on their capability page; invariants, conventions, and decisions certify in place on the module (engineer) lens.
The inspector stays a read-only quick-look — curation happens on the full page you open into.
- **Every pin is a road to the code.**
A `path#Symbol` pin (concept pins, flow entry points, ladder rungs) links to the module page that owns that path, so the reading loop closes in both directions: the map names the meaning, the pin opens the engineer lens on the code that carries it.
The affordance stays hairline - mono text, underline only on hover, in the pin's own status colour.
- **The picture never drifts from the source.**
Each write is a `.artha/*.yaml` git diff; the server rebuilds the index so the map redraws, and rolls the file back if that rebuild would break — the on-disk YAML is always buildable, and `index.db` is never the system of record.
- **Viewing and curating stay offline.**
Certify, link, and edit touch no model; a write reuses the previous index's embedding vectors when they exist (a certify/link changes no fact text) so the map and search stay warm with no download.
The LLM only enters for the T18 interview that *drafts* the prose — the persist/certify plumbing here is fully local.

## 12. Lenses and honest readouts (shipped 2026-07-07, task 23a)

The atlas gained a second axis of reading: *what* you look at (selection, a traced flow) versus *how* you look at it (the lens).
Both live in the URL, so every reading is deep-linkable; Esc clears the focus but keeps the lens.

### 12.1 The lens grammar *(superseded same day - see §13)*

The first cut drew the import graph as arcs **over the treemap** (`?lens=wiring`).
The developer's verdict, hours later: a treemap has no empty space, so anything drawn over it adds confusion rather than clarity.
The lens was deleted the same day; §13 records the pivot that replaced it.
What survives from this cut: structure draws in **grey ink, never phosphor** (structure is proof, not meaning), and edges touching an unplaced module are skipped, never guessed - both rules carried into the board.

### 12.2 Flow routes *(moved to the board - see §13.3)*

A flow reads as a drawn route: linked steps resolve their pins to modules, consecutive same-module steps collapse into one numbered **station**, and the line runs station to station **in the flow's own status colour** (D2: no new hue - a route inherits exactly the trust its flow has).
Stations light; everything else dims.
The **route card** names the flow, its standing, and every step - unlinked steps stay as dashed, honest gaps that draw nothing.
First shipped over the terrain; since 23a′ the route draws on the board, where it has room.

### 12.3 Honest readouts (D11, partial)

The top bar dropped "explained" (which had become a lie the moment the moonlight layer lit everything) for:

- **% vouched** - churn-weighted certified *depth* (the saturating coverage curve, so one fact cannot claim a module), phosphor/amber/ember by threshold;
- **% described** - the machine layer's reach, on its own **moonlight tone**, never the phosphor of trust;
- dark zones and stale, unchanged.

Navigator area meters and the area inspector show the same vouched-depth metric under the same word.
The third D11 readout (disagreements) arrives with T22.

The remaining elevation program (inner boards, observatory charts, the review pass, craft debt) is specced as [tasks-v0.3/23-atlas-elevation.md](../tasks-v0.3/23-atlas-elevation.md).

## 13. The Board - the blackboard pivot (shipped 2026-07-07, task 23a′)

### 13.1 The design philosophy

The developer's brief, verbatim in spirit: **a handmade flowchart on a classroom blackboard** - simple, ample space, clean, and you can drag things around.
This is now the organizing genre for knowledge discovery, and it is not a skin: it is how a senior engineer actually explains a codebase to a newcomer, which makes it the native visual language for a product whose job is explaining codebases.
The rule going forward: before adding any discovery surface, ask *"how would this look hand-drawn on the board?"* - density belongs in Terrain and the observatory, never on the board.

### 13.2 The shape

- **The Board is the default canvas** (`#/`); the treemap lives on as **Terrain** (`?lens=terrain`), the churn/coverage analytics reading, one nav item away.
- Modules are **chalk boxes** - seeded rough strokes (`web/src/rough.ts`: wobbly lines, corner overshoot, a double-drawn frame like a hand going over its line), names in system handwriting faces (`--chalk`), on a blackboard ground.
Determinism matters: the same repo draws the same wobble, so tests and rebuilds agree.
- **Layered auto-layout** (`web/src/board.ts`): consumers on top, foundations at the bottom (longest-path layering, cycle-safe); generous gaps are the point.
Imports are chalk arrows reading **"depends on"**, border to border, thickness by count, hot/faded under selection.
- **The reader owns the layout**: boxes drag (positions persist per browser, `artha.board.layout.v1`), "Tidy the board" restores the auto seats, scroll pans, a drag never navigates.
A committed team layout (`.artha/board.yaml`) is 23e.
- The night-map identity survives whole: chalk **is** light on dark, so phosphor/moonlight/ember chalk carries the two-light grammar unchanged, and viewing stays offline (system faces only).

### 13.3 Meaning on the board

Standing colours the chalk: a vouched module's frame is phosphor, a described one moonlight, an unexplained one dim grey; an ember chalk tick marks stale meaning.
A box is not just a name - it carries, in chalk: the machine's one-line description (moonlight italic), the capabilities it holds in product language each with its standing dot (top-N with an honest `+N more`), and the standing line (`N certified · churn`).
This is the code↔meaning linkage the board exists to show, drawn where the reader already is.
Flow routes draw here (§12.2): numbered chalk station badges on box corners, legs in the flow's status colour, the route card bottom-right.
Selection keeps the shell grammar: click selects and opens the inspector, click again opens the module page; `?m=` / `?a=` / `?f=` deep-link the board.

### 13.4 The 21b seam

The board is built to get *richer*, not rebuilt, when LLM synthesis (21b) lands.
The machine's per-module prose is a single map-feed field, `MapModule.describedAs`; `capabilitiesByModule` reads inferred concept/flow names the same way it reads vouched ones.
When `artha infer` overwrites those deterministic strings with synthesized meaning, every reader - the board's captions, the inspector, MCP - upgrades with no client change.
The design rule that makes this safe: the board renders *what the layer says*, and the trust grammar (moonlight vs phosphor) already marks it as machine-described until a human vouches.

### 13.5 Fullscreen focus (any view)

Any view can go fullscreen: a top-bar toggle (or `f`, ignored while typing) folds the navigator and inspector away and requests native browser fullscreen where allowed, so the canvas - board, terrain, a capability page - fills the screen for reading or presenting.
Esc leaves focus before it clears a selection; leaving native fullscreen by any route (browser Esc, F11, the OS) unfolds the chrome too, so the two never drift apart.
Focus is transient and deliberately not in the URL - it is a way of looking, not a place.

## Sources

- [CodeScene — Hotspots](https://codescene.io/docs/guides/technical/hotspots.html)
  — size = code/effort, color = health; the proven at-a-glance codebase map this
  borrows for "understanding health."
- [Backstage — Software Catalog](https://backstage.io/docs/features/software-catalog/)
  and [What is Backstage](https://backstage.io/docs/overview/what-is-backstage/)
  — the discoverable, searchable catalog pattern for "things the system has";
  search + entity pages as the spine.
- [UXPin — Dashboard Design Principles](https://www.uxpin.com/studio/blog/dashboard-design-principles/),
  [DataCamp — Effective Dashboard Design](https://www.datacamp.com/tutorial/dashboard-design-tutorial),
  [5of10 — Dashboard Design Best Practices 2025](https://5of10.com/articles/dashboard-design-best-practices/)
  — the 5-second rule, visual hierarchy (critical KPIs top-left), progressive
  disclosure, and information-overload as the #1 dashboard failure.
- [Product.md](Product.md) §10 (human-facing layer; the three lenses; "where
  you're flying blind") and [SPEC-v0.2.md](../SPEC-v0.2.md) §B (area/module
  altitude, legibility as a hard requirement) — the internal brief this serves.
