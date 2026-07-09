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
  darkZonesHint: 'high-churn modules nobody has explained',
  stale: 'stale',
  staleHint: 'certified meaning whose code has since moved',
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
  queue: 'Dark zones',
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
    'Certified facts accumulated by the date each was vouched - reconstructed from the entries’ own history, no new storage.',
  burnY: 'facts vouched',
  burnLatest: 'vouched',
  burnEmpty:
    'Not enough certification history to draw a curve yet - vouch a few facts and the line appears.',
  areasTitle: 'How each area stands',
  areasGloss:
    'One bar per product area, busiest first: the phosphor share is vouched, the moonlight share is described by the machine, any grey is still dark.',
  areasEmpty: 'No product areas to chart yet.',
} as const;

/** The board - the blackboard flowchart, the default canvas since 23a′. */
export const BOARD = {
  hint: 'Drag a box to arrange the board - your layout sticks. An arrow reads "depends on".',
  tidy: 'Tidy the board',
  tidyHint: 'Re-lay every box automatically and forget the hand-placed positions.',
  more: 'more',
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
    'Its brightness is how well it is understood - how much meaning a human has certified about it.',
  moon: 'A cool moonlight tile is described by the machine but not yet vouched by your team - readable, but below certified meaning.',
  dark: 'A dark tile is a dark zone: code that changes with nothing said about it at all.',
  stale:
    'A hatched edge means some certified meaning went stale - the code moved after it was written.',
  select: 'Select a tile to inspect it; select it again to open the full module page.',
  ramp: ['dark zone', 'thin', 'partial', 'understood'] as const,
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
} as const;

/** Cold start - the honest empty state that funnels into the queue. */
export const COLD = {
  headline: '0% of active code explained',
  body: 'Every module on this map is dark: the code changes, but nothing about it has been certified yet. That is the starting point, not a failure - begin with the busiest module.',
  cta: 'Open the dark-zone queue',
} as const;

export const QUEUE = {
  title: 'Dark zones',
  gloss:
    'Modules with the most unexplained change, riskiest first. Each one is a place a newcomer - or an AI agent - is flying blind.',
  coldGloss:
    'Nothing is explained yet, so every changing module is dark. Start at the top: the busiest module is where meaning pays off first.',
  empty: 'Nothing is dark - every changing module carries certified meaning. (Rare. Enjoy it.)',
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
  darkNote: 'Nothing certified touches this module. It is a dark zone.',
} as const;

export const MODULE_PAGE = {
  capabilities: 'Built on this module',
  capabilitiesGloss: 'The product capabilities this code implements.',
  rules: 'Rules in scope',
  rulesGloss: 'Invariants and conventions that govern edits here.',
  decisions: 'Why it is this way',
  decisionsGloss: 'Decisions recorded for this code, with their reasoning.',
  darkEmpty:
    'No certified meaning touches this module yet - it is a dark zone. The riskiest place to change code is one nobody has explained.',
  darkCta: 'See where it sits in the queue',
} as const;

/** Wired-to: the structural neighbours mined from imports (T17b). */
export const WIRED = {
  head: 'Wired to',
  gloss: 'How this code connects, read from its imports - structure, not certified meaning.',
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

/** Curation actions (T17) - the words on the certify / link / edit controls. */
export const CURATE = {
  certify: 'Certify',
  certifying: 'Certifying…',
  certifyHint: 'Vouch for this meaning - stamps it certified and lights the module on the atlas.',
  edit: 'Edit',
  editNote: 'Saving returns this to proposed - certify again to re-vouch.',
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

export const MISC = {
  loading: 'reading the index…',
  notFound: 'Nothing at this address.',
  backToAtlas: 'Back to the atlas',
  searchPlaceholder: 'Find a capability, module, or rule…',
  searchHint: 'Type to search meaning - capabilities open, modules focus the atlas.',
} as const;

/** The search shortcut as this platform actually spells it. The handler accepts
 * both ⌘K and Ctrl-K; the label must not show a Mac glyph to a Windows reader.
 * (SSR render tests see Node's navigator and settle on the Ctrl spelling.) */
export const SEARCH_KEY: string =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? '')
    ? '⌘K'
    : 'Ctrl K';
