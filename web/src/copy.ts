// Single source of truth for every word on the dashboard. The product's
// premise is legibility for someone who has never seen this codebase, so this
// prose is load-bearing. Register (design-dna: cartographic · instrumental ·
// assured): name the true thing plainly, in the product's own language, and
// let the map carry the rest. Definitions live in the one Legend popover.

export const WORDMARK = 'Artha';
export const TAGLINE = 'What this codebase means - and where it doesn’t.';

/** Labels for the four instrument readouts (values computed in derive.ts).
 * D11: the trust number and the machine number are separate words on separate
 * lights - "described" must never dress up as "vouched". */
export const KPI = {
  vouched: 'vouched',
  vouchedHint: 'how much of the recent change carries meaning a human vouched for',
  described: 'described',
  describedHint: 'share of recent change the machine has described - readable, not yet vouched',
  darkZones: 'dark zones',
  darkZonesHint: 'busy modules where no vouched meaning holds',
  stale: 'stale',
  staleHint: 'vouched meaning whose code has since moved',
} as const;

/** A flow traced as a route across the board. */
export const ROUTE = {
  kind: 'flow route',
  open: 'Open flow',
  clear: 'Clear route',
  trace: 'Trace on the board',
  traceHint: 'Draw this flow as a route across the board - station by station.',
  notLinked: 'not linked',
  noStations:
    'None of this flow’s steps are linked to code yet, so there is no route to draw. Link a step and the line appears.',
} as const;

/** Navigator sections and view names. */
export const NAV = {
  views: 'Views',
  board: 'Board',
  terrain: 'Terrain',
  capabilities: 'Capabilities',
  observatory: 'Observatory',
  // 24b: the view ranks by *value* (D10), so its name says the action, not the
  // darkness - "dark zone" stays a KPI/legend term for unvouched code.
  queue: 'Explain next',
  areas: 'Product areas',
  offline: 'Reads .artha/index.db · fully offline',
} as const;

/** The observatory (23c) - the charts that answer the leadership questions. The
 * board stays clean; density and analytics live here. Follows the dataviz
 * method: one axis, direct labels, the status palette (no new hues). */
export const OBSERVATORY = {
  title: 'Observatory',
  gloss:
    'The signal behind the map, as charts: where the team is flying blind, how vouched meaning has grown, and how each product area stands. Read off .artha/ - fully offline.',
  // The three standings the charts colour by - the legend that keeps colour from
  // being the only encoding (position and labels carry it too).
  legend: {
    vouched: 'vouched',
    described: 'described',
    unexplained: 'unexplained',
  } as Record<'vouched' | 'described' | 'unexplained', string>,
  blindTitle: 'Where we’re flying blind',
  blindGloss:
    'Each dot is a module: how much it changed (→) against how much of it a human has vouched for (↑). Busy code low on the wall is where a newcomer - or an agent - is flying blind.',
  blindX: 'commits, last 90 days →',
  blindY: 'vouched depth ↑',
  blindQuadrant: 'flying blind',
  blindEmpty: 'No modules to plot yet.',
  burnTitle: 'Vouched over time',
  burnGloss:
    'Vouched facts accumulated by the date each was vouched - reconstructed from the entries’ own history, no new storage.',
  burnY: 'facts vouched',
  burnLatest: 'vouched',
  burnEmpty: 'No vouching history to draw a curve yet - vouch a few facts and the line appears.',
  areasTitle: 'How each area stands',
  areasGloss:
    'One bar per product area, busiest first: the phosphor share is vouched, the moonlight share is described by the machine, any grey is still dark.',
  areasEmpty: 'No product areas to chart yet.',
} as const;

/** The board - the blackboard flowchart, the default canvas since 23a′. */
export const BOARD = {
  hint: 'Drag a box to arrange the board - your layout sticks. An arrow reads "depends on".',
  tidy: 'Tidy the board',
  tidyHint: 'Re-lay every box automatically and forget the positions you moved.',
  /** Same button, when the team has committed a board to fall back to. */
  tidyHintTeam: 'Forget the boxes you moved and go back to the team’s board.',
  // Sharing the board (23e): a hand-arranged blackboard dies in one browser
  // unless it can be committed.
  share: 'Save for the team',
  shareHint:
    'Commit this arrangement to .artha/board.yaml, so everyone who opens the board sees the one you just built. Lands as an ordinary git diff.',
  shared: 'Saved for the team',
  shareFailed: 'Could not save the layout - the board is still yours.',
  more: 'more',
  zoomIn: 'Zoom the board in (Ctrl + scroll works too)',
  zoomOut: 'Zoom the board out (Ctrl + scroll works too)',
  fit: 'Fit',
  fitHint: 'Scale the whole board to the window.',
} as const;

/** The board legend (24c) - the default view defines its own words on-screen;
 * before this, every definition lived on the Terrain or in hover titles. */
export const BOARD_LEGEND = {
  title: 'Reading the board',
  box: 'A box is a code module; an arrow reads "depends on". Thicker chalk means more imports.',
  lights:
    'Bright phosphor chalk is vouched - meaning a human stands behind. Cool moonlight is described by the machine, not yet vouched. Dim chalk is unexplained.',
  counts:
    '"vouched ×3" counts the facts vouched there. "6Δ" counts its commits in the last 90 days (Δ = change).',
  stale:
    'An ember underline means some vouched meaning went stale - the code moved after it was written.',
  select: 'Select a box to inspect it; select it again to open the full module page.',
} as const;

/** The inner board (23b) - a module drilled down to its own files, on its page. */
export const MODULE_BOARD = {
  head: 'Inside this module',
  gloss:
    'The files here and how they import each other. A lit box carries meaning a human has vouched for or proposed; select one to read it.',
  aria: 'The inner board - this module’s files and their imports',
  hint: 'Drag a file to arrange it. An arrow reads "imports"; select a lit file to read its meaning.',
  tidy: 'Tidy the files',
  tidyHint: 'Re-lay every file automatically and forget the hand-placed positions.',
  imports: 'imports',
  fileKind: 'file',
  plain: 'nothing pinned yet',
  noFacts: 'No meaning is pinned to this file yet.',
  clear: 'Close',
  empty: 'No source files were found in this module.',
} as const;

/** Fullscreen focus - the canvas without the chrome, in any view. */
export const FOCUS = {
  enter: 'Fullscreen',
  exit: 'Exit fullscreen',
  enterHint: 'Hide the side panes and go fullscreen - press f anywhere, Esc leaves.',
} as const;

/** The atlas legend - the one place terms are defined. */
export const LEGEND = {
  title: 'Reading the map',
  size: 'A tile is a code module. Its size is how much it changed in the last 90 days.',
  brightness:
    'Its brightness is how well it is understood - how much meaning a human has vouched about it.',
  moon: 'A cool moonlight tile is described by the machine but not yet vouched by your team - readable, but below vouched meaning.',
  dark: 'A dark tile is a dark zone: changing code where no vouched meaning holds - none yet, or it all went stale.',
  stale:
    'A hatched edge means some vouched meaning went stale - the code moved after it was written.',
  churn: 'The NΔ figure counts commits in the last 90 days (Δ = change).',
  select: 'Select a tile to inspect it; select it again to open the full module page.',
  ramp: ['unexplained', 'barely vouched', 'partly vouched', 'well vouched'] as const,
} as const;

/** The inferred layer (21a) - machine-described meaning, below vouched facts. */
export const INFERRED = {
  /** Worded confidence tiers (D7) - named, never numbered. */
  confidence: {
    'read-from-code': 'read from code',
    inferred: 'inferred',
    uncertain: 'uncertain',
  } as Record<string, string>,
  kindLabel: 'machine-described',
  moduleCardHead: 'What this module is',
  moduleCardGloss: 'Read from its code and imports - a starting description, not yet vouched.',
  inferredCapsHead: 'Machine-described capabilities',
  inferredCapsGloss:
    'Concepts and flows found in the code. States and steps are read verbatim; what they mean is yours to add.',
  conventionsHead: 'Machine-noticed conventions',
  conventionsGloss: 'Naming patterns the code repeats. What each one requires is yours to define.',
  statesHead: 'States read from code',
  stepsHead: 'Reaches',
  stepsGloss:
    'The areas this operation touches, read from its imports - not the order it runs them.',
  membersHead: 'Symbols that match',
  membersGloss: 'The exported names this pattern is read from - no unexplained assertions.',
  evidenceHead: 'Read from',
  evidenceGloss: 'The exact code each claim was read from - no unexplained assertions.',
  deltaHead: 'What the code can’t say',
  /** Per-kind delta prose (D6): what the code cannot hold, invited not assumed. */
  delta: {
    concept:
      'Transitions, the meaning of each state, and the why behind them are not in the code. That is the part only you can add.',
    flow: 'The order these steps run, what each one does, and why are not in the code. That is the part only you can add.',
    convention:
      'What this convention requires - and why it exists - is not in the code. That is the part only you can add.',
    module:
      'What this module is for, and the rules that govern changing it, are not in the code. That is the part only you can add.',
  } as Record<string, string>,
  deltaFallback:
    'The meaning and the why behind this are not in the code. That is the part only you can add.',
  /** Card preview fallbacks when there is nothing structured to chain. */
  cardEmpty: {
    concept: 'a state set read from code',
    flow: 'an operation read from code',
    convention: 'a naming pattern read from code',
  } as Record<string, string>,
  notVouched: 'Machine-described · not yet vouched by your team',
  page: 'inferred',
  /** Vouch-by-reading (D9, 23d-2): the reading surface *is* the review surface.
   * Only concepts and flows can be vouched today - a card has no human kind and a
   * convention needs a rule the code can't state. */
  vouchHead: 'Reading is reviewing',
  vouchGloss: {
    concept:
      'Read the states against the code above. If this is right, vouch it - it becomes a vouched concept your team and agents can trust. Correct it first if the name or summary is off.',
    flow: 'Read the entry point against the code above. If this is right, vouch it - it becomes a vouched flow your team and agents can trust. Correct it first if the name or summary is off.',
  } as Record<string, string>,
  /** Why cards + conventions carry no vouch action yet (honest, not a dead end). */
  vouchNotYet: {
    module:
      'A module card is a description, not a claim to vouch - vouch the concepts and flows inside it instead.',
    convention:
      'This convention needs a rule the code can’t state before it can be vouched - that part is still yours to write.',
  } as Record<string, string>,
} as const;

/** Evidence, revealed (D5) - the code a machine claim was read from, one click
 * away, so nothing on the page is an unexplained assertion. */
export const EVIDENCE = {
  // 24a: the reveal control must not share words with the confidence tier
  // ("read from code") - a button that looks like the static chip beside it.
  reveal: 'Show the code',
  revealHint: 'Show the exact source this was read from',
  hide: 'Hide code',
  loading: 'reading the code…',
  gone: 'This code has moved or been renamed since it was read - nothing to show.',
  more: (n: number): string => `+${n} more line${n === 1 ? '' : 's'}`,
} as const;

/** Cold start - the honest empty state that funnels into the queue. */
export const COLD = {
  headline: '0% of active code vouched',
  body: 'Every module on this map is dark: the code changes, but nothing about it has been vouched yet. That is the starting point, not a failure - begin with the busiest module.',
  cta: 'Open Explain next',
} as const;

export const QUEUE = {
  title: 'Explain next',
  // D10: ranked by *value*, not darkness - agent-consumption × churn ×
  // uncertainty (what agents pull, where code moves, where the machine is least
  // sure), so the top is where explaining pays off most, not merely the darkest.
  gloss:
    'Where explaining pays off next, not just the darkest: ranked by what agents pull for context, where code keeps moving, and where the least is vouched. Each row says why it is here.',
  coldGloss:
    'Nothing is vouched yet, so every changing module is worth explaining. Ranked by value: the code agents lean on most, moving the most, leads.',
  empty: 'Nothing is dark - every changing module carries vouched meaning. (Rare. Enjoy it.)',
  /** The worded "why now" per row (D10) - the value factors in plain language. */
  whyLabel: 'why now',
  why: {
    reach: (n: number): string => `${n} module${n === 1 ? ' depends' : 's depend'} on it`,
    churn: (n: number): string => `${n} recent change${n === 1 ? '' : 's'}`,
    unvouched: 'nothing vouched here yet',
    stale: (n: number): string => `${n} vouched fact${n === 1 ? '' : 's'} drifted`,
    partial: 'only partly vouched',
  },
} as const;

export const CATALOG = {
  title: 'Capabilities',
  gloss:
    'What this product does, in its own words - grouped by the part of the product it lives in.',
  empty:
    'No capabilities have been described yet. Explain a dark zone to capture the first concept or flow - what you record here is what a teammate (or an agent) reads back off the map.',
  noMatch: 'No capability matches this filter.',
  unplaced: 'Not yet linked to code',
} as const;

export const INSPECTOR = {
  openModule: 'Open module',
  viewOnAtlas: 'Show on atlas',
  close: 'Close',
  darkNote: 'Nothing vouched touches this module. It is a dark zone.',
} as const;

export const MODULE_PAGE = {
  capabilities: 'Built on this module',
  capabilitiesGloss: 'The product capabilities this code implements.',
  rules: 'Rules in scope',
  rulesGloss: 'Invariants and conventions that govern edits here.',
  decisions: 'Why it is this way',
  decisionsGloss: 'Decisions recorded for this code, with their reasoning.',
  darkEmpty:
    'No vouched meaning touches this module yet - it is a dark zone. The riskiest place to change code is one nobody has explained.',
  darkCta: 'See where it sits in the queue',
} as const;

/** Wired-to: the structural neighbours mined from imports (T17b). */
export const WIRED = {
  head: 'Wired to',
  gloss: 'How this code connects, read from its imports - structure, not vouched meaning.',
  dependsOn: 'Depends on',
  usedBy: 'Used by',
  none: 'Not wired to any other module in the source tree.',
} as const;

/** Suggested code: machine-proposed, human-confirmed pins (T17b). */
export const SUGGEST = {
  head: 'Suggested code',
  gloss:
    'Ranked from the reference graph and names - one click links it, ignoring it costs nothing.',
  link: 'Link',
  linking: 'Linking…',
  why: {
    'referenced by pinned code': 'near linked code',
    'name match': 'name match',
    'related meaning': 'related meaning',
  } as Record<string, string>,
} as const;

/** The delta band (D6): human ink over machine print. Every capability/module
 * page carries one distinct "what the code can't say" slot - the business rules,
 * constraints, history, and warnings no code can hold. Recording it is additive:
 * it never re-opens a certification (the vouched claim is unchanged). */
export const DELTA = {
  head: 'What the code can’t say',
  /** The invitation shown when nothing is recorded yet - per surface, so the
   * empty slot still reads as an inviting prompt, never a dead "-". */
  invite: {
    concept:
      'The states above are read from code. Why they exist, the rules that must always hold, and the warning someone should have left - that part is only yours to add.',
    flow: 'The steps above are read from code. The business rules, the edge cases, and why it works this way live only in someone’s head until you write them here.',
    module:
      'What this module is for, the constraints on changing it, and the history behind it are not in the code. That part is only yours to add.',
  } as Record<string, string>,
  /** Marks the band's content as human-authored, distinct from machine prose. */
  attribution: 'recorded by your team',
  add: 'Add a note',
  edit: 'Edit the note',
  placeholder:
    'business rules · constraints · history · a warning the next person needs - one thought per line',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  /** Additive, so no "returns to proposed" caveat - the standing is untouched. */
  note: 'Saved as human ink beside the machine’s reading - it does not change what is vouched.',
  /** The module page's delta band points at where the human "why" already lives. */
  moduleWhy: (n: number): string =>
    `Your team has recorded ${n} thing${n === 1 ? '' : 's'} here the code can’t say - the why below.`,
  /** An empty state-table cell: honest, not a bare dash. The table lives on
   * human-authored concept pages, so the truth is "nobody wrote this yet" -
   * never provenance-speak implying the machine tried and failed (24g). */
  notRecorded: 'not recorded yet',
} as const;

export const DETAIL = {
  conceptLede:
    'The diagram is this concept’s whole life: every state it can be in, and every event that moves it.',
  flowLede:
    'Read top to bottom: each rung is a step; a filled rung is linked to the code that performs it.',
  statesHead: 'Lifecycle',
  pinsHead: 'Implemented in code',
  entryHead: 'Entry points',
  stepsHead: 'Steps',
  relatedHead: 'Why & related',
  relatedGloss: 'The rules, decisions, and neighbouring capabilities that govern this one.',
  notLinked: 'not yet linked to code',
  noStates: 'No states have been described for this concept yet.',
  noSteps: 'No steps have been described yet.',
  noPins: 'No code has been linked yet.',
} as const;

/** Curation actions (T17) - the words on the vouch / link / edit controls.
 * 24a: "vouch" is the one public word; `certified` lives only in storage/API. */
export const CURATE = {
  certify: 'Vouch',
  certifying: 'Vouching…',
  certifyHint: 'Stand behind this meaning - marks it vouched and lights the module on the atlas.',
  edit: 'Edit',
  editNote: 'Saving returns this to proposed - vouch it again afterwards.',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  nameLabel: 'Name',
  summaryLabel: 'Summary',
  link: 'Link code',
  linkLabel: 'Search your code for a symbol to link',
  linkPlaceholder: 'type a class, function, or file name…',
  searching: 'searching your code…',
  noSymbols: 'No symbol matches - try a class, function, or file name.',
  linking: 'Linking…',
  pickerKeys: '↑↓ pick · enter links · esc closes',
  openModuleHint: 'Open the module this code lives in',
} as const;

/** The review walk (D9, 23d-3): reading a page's unvouched claims one at a time,
 * one keystroke per decision. Page-scoped, never a global queue over thousands of
 * machine facts - that would be the tiredness machine the contract forbids. */
export const REVIEW = {
  enter: 'Review',
  enterHint:
    'Walk this page’s unvouched or drifted claims one at a time - vouch or correct each. Press R.',
  aria: 'Review the unvouched or drifted claims on this page',
  kicker: 'Reading is reviewing',
  reviewing: 'reviewing',
  close: 'Close review',
  // 24a: "read from code" is the confidence tier's phrase alone - the walk's
  // evidence panel names itself without borrowing it.
  codeHead: 'The code behind this claim',
  codeGloss: 'The exact source this claim was read from - decide against the code, not a summary.',
  noPins: 'Nothing is pinned to code here yet - there is no source to check this against.',
  vouch: 'Vouch',
  vouchHint: 'This reads right - vouch it. Press v.',
  edit: 'Correct',
  editHint: 'Fix the name or summary first, then it saves as proposed. Press e.',
  /** 24f: only `v` writes; Enter is plain movement, and a vouch can be undone. */
  undo: 'undo',
  undoHint: 'Take the vouch back - returns it to proposed.',
  keys: 'j / k / enter  move   ·   v  vouch   ·   e  correct   ·   x  flag (soon)   ·   esc  exit',
  flagSoon: 'Flagging a disagreement arrives with contradiction detection.',
  doneTitle: 'Sweep complete',
  done: (n: number, v: number): string =>
    `You walked ${n} claim${n === 1 ? '' : 's'} here - ${v} vouched.`,
  doneNone: 'Nothing was vouched this pass - the code is still worth another read.',
  back: '← last claim',
  closeDone: 'Done',
  vouched: 'vouched',
  corrected: 'corrected',
} as const;

export const MISC = {
  loading: 'reading the index…',
  notFound: 'Nothing at this address.',
  backToAtlas: 'Back to the atlas',
  searchPlaceholder: 'Find a capability, module, or rule…',
  // 24d: say what actually happens - every hit opens its page (a rule opens
  // the module it governs); the old promise ("modules focus the atlas") lied.
  searchHint: 'Type to search meaning - every result opens its page. ↑↓ pick · enter opens.',
} as const;

/** The search shortcut as this platform actually spells it. The handler accepts
 * both ⌘K and Ctrl-K; the label must not show a Mac glyph to a Windows reader.
 * (SSR render tests see Node's navigator and settle on the Ctrl spelling.) */
export const SEARCH_KEY: string =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? '')
    ? '⌘K'
    : 'Ctrl K';
