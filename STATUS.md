# Artha - where we are

A living, two-page summary.
For the full detail, see [PROGRESS.md](PROGRESS.md) (the running log) and [tasks-v0.3/README.md](tasks-v0.3/README.md) (the current task index).
Last updated: 2026-07-16.

## What we are building

Codebases lose their meaning.
The reason a thing was built one way, the rule it must obey, the warning everyone learned the hard way - none of it lives in the code, and all of it is gone in a month.
Humans re-derive it every time, and AI agents never had it at all.

Artha is a local tool that captures a codebase's **product meaning** and serves it to both.
It reads your repo, describes what it finds, asks you only for the part it cannot know, and hands the result to your AI coding agent over MCP so the agent applies your team's rules without you pasting them into every prompt.

Two surfaces:

- **A local web dashboard** (`artha serve`) where a human reads and confirms the meaning of the codebase.
- **An MCP server** (`artha mcp`) where an agent asks "what should I know about this task?" and gets a ranked, trustworthy answer.

## The core idea: three layers of meaning

This is the thing to understand.
Everything else follows from it.

1. **Structure** - imports, files, the module tree.
   Machine-extracted, proof-grade, free. No human, no AI.
2. **Description** - what the code does: module purposes, state machines, flows, naming conventions.
   The machine reads this straight out of the code and shows it in cool "moonlight".
   Reliable, because every claim points at the exact lines it came from.
3. **The delta** - what code can never hold: the why, the business rule, the constraint, the tribal warning.
   Only a human has this. This is the only thing we ask you for.

The big shift (2026-07-05) was ordering these correctly.
Earlier versions opened on a black map and a homework queue, so nobody got past the first screen.
Now the machine fills layers 1 and 2 first, and the human's job shrinks from *authoring* to **vouching, correcting, and adding the delta**.

Two rules hold everywhere:

- **Nothing auto-certifies.** A machine claim is labelled as machine-read until a human vouches for it.
- **The reader can always tell which is which.** Machine prose is moonlight, human knowledge is bright "human ink".

## Where we are

**v0.1 and v0.2 are done. v0.3 is roughly two-thirds done.**
The whole loop works end to end today: index a repo, read the map, vouch the machine's read, add what it missed, serve it to an agent.
414 tests pass across 33 files, typecheck and lint clean.

You can see it right now: `npm run demo` builds, seeds a fake shop repo, and serves the dashboard at http://127.0.0.1:4173.

### Done

**v0.1 - the agent loop (all 10 tasks).**
`init → mine → review → build → mcp/export`.
Mines candidate decisions from git history, certifies them in a terminal UI, compiles to a SQLite index, serves them over MCP.
Proven: on a real repo, an agent with Artha needed **56% fewer discovery tool-calls** (the bar was 30%).

**v0.2 - human input and visibility (11 of 14 tasks).**
Added the product model (capabilities and flows), churn and coverage ranking, embeddings, `artha serve`, and the dashboard.
The dashboard was rebuilt twice after honest reviews and is now a full-screen **atlas shell**.
Write-back works: link, certify, and edit from the browser, each landing as a normal `.artha/*.yaml` git diff.
The import graph and pin suggestions are fully automatic.

**v0.3 - the inferred layer and the atlas elevation (the current work).**

- **21a (done)** - the machine layer, fully offline, no AI needed.
  Four extractors ship: module cards, state machines, flow skeletons, naming conventions.
  A stranger's repo now renders a complete, lit, readable map with zero human input.
- **23a-23c (done)** - honest KPIs (% vouched, % described), the **Board** (a handmade flowchart on a blackboard, the default view), inner boards that drill a module down to its files, and an **observatory** of three charts that answer real questions.
- **23d (done, five slices)** - "reading is reviewing".
  Every claim reveals its exact source lines one click away (23d-1).
  Vouching a machine claim turns it into a real entry with provenance (23d-2).
  Press `R` on any page to sweep its unvouched claims one at a time (23d-3).
  Every page carries a "What the code can't say" slot for human ink, added without un-certifying anything (23d-4).
  The ask queue now ranks by **where explaining pays off next** - how many modules depend on it, how much it changes, how uncertain it is - and each row says why in plain words (23d-5).
- **24 (done, 2026-07-16)** - usability hardening, from a full UX audit.
  One public vocabulary (vouch everywhere, the vouched/described/unexplained ladder), honest numbers (the queue is "Explain next" with a matching badge, dark = unvouched, a vouched % that can reach 100), a default Board that fits the window with its own legend and zoom, prefix search with clickable rule hits and arrow keys, one card per capability, a review walk where Enter never writes and a vouch can be undone, and capability pages that lead with meaning.

### Not done

- **21b** - AI synthesis. Turning the deterministic candidates into richer prose, opt-in and spend-capped, with a verifier gate.
- **21c** - fully delivered except what 21b enriches.
- **22** - the contradiction view: where the machine's read disagrees with what a human vouched.
- **23e** - craft debt (trimmed; catalog dedup and zoom moved into 24).
- **T18** - the ask-the-human interview.
- **T19 / T20** - contradiction preview and the v0.2 success test.

## What is next

In order:

1. **23e - craft debt (trimmed).**
   The pure-craft leftovers: state machines redrawn in chalk, board refinements (crossing-minimizing layout, a shareable committed board layout), more trace entry points.

2. **21b - AI synthesis and verification.**
   The machine layer currently describes code deterministically, which is honest but thin.
   21b makes it *readable*, with every claim citing its pins and a verifier gating confidence.
   The dashboard already reserves the exact slot this writes into (`describedAs`), so it enriches with no client rework.

3. **22 - the contradiction view.**
   Nearly a byproduct: once inferred meaning exists, "the machine disagrees with a vouched fact" *is* the view.
   The review walk already has a deferred `x` key waiting on it.

4. **T18 - the ask-the-human loop.**
   Deliberately held until after 21a, so the interview opens with "here is my read, what did I get wrong?" instead of a blank page.
   The write and certify plumbing it needs is already shipped.

5. **T20 - the success test.**
   A non-author reads the map and answers questions about the codebase.
   Now with a second arm: it must pass on **machine-inferred content alone**, zero human input, on a stranger's repo.

## Open decisions

- **OQ1** - how a non-author gets access (local-only vs static export vs shared serve). Owned by T20.
- **Q5** - the success-test baseline definition. Owned by T10.

Everything else has been resolved and logged in [PROGRESS.md](PROGRESS.md).

## Map of the docs

| File | What it is |
|---|---|
| [README.md](README.md) | Install, commands, agent wiring |
| [PROGRESS.md](PROGRESS.md) | The full running log, newest first (long) |
| [SPEC.md](SPEC.md) / [SPEC-v0.2.md](SPEC-v0.2.md) | The v0.1 and v0.2 build specs |
| [design/Product.md](design/Product.md) | The product thinking and roadmap |
| [design/Dashboard.md](design/Dashboard.md) | The dashboard design contract |
| [tasks-v0.3/](tasks-v0.3/) | The current task index and specs |
