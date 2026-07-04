// Single source of truth for every word on the dashboard. The product's
// premise is legibility for someone who has never seen this codebase, so this
// prose is load-bearing. Register (design-dna: cartographic · instrumental ·
// assured): name the true thing plainly, in the product's own language, and
// let the map carry the rest. Definitions live in the one Legend popover.

export const WORDMARK = 'Artha';
export const TAGLINE = 'What this codebase means - and where it doesn’t.';

/** Labels for the four instrument readouts (values computed in derive.ts). */
export const KPI = {
  explained: 'explained',
  explainedHint: 'share of recent change that carries certified meaning',
  darkZones: 'dark zones',
  darkZonesHint: 'high-churn modules nobody has explained',
  stale: 'stale',
  staleHint: 'certified meaning whose code has since moved',
  certified: 'certified',
  certifiedHint: 'meaning a human has vouched for',
} as const;

/** Navigator sections and view names. */
export const NAV = {
  views: 'Views',
  atlas: 'Atlas',
  capabilities: 'Capabilities',
  queue: 'Dark zones',
  areas: 'Product areas',
  offline: 'Reads .artha/index.db · fully offline',
} as const;

/** The atlas legend - the one place terms are defined. */
export const LEGEND = {
  title: 'Reading the map',
  size: 'A tile is a code module. Its size is how much it changed in the last 90 days.',
  brightness:
    'Its brightness is how well it is understood - how much meaning a human has certified about it.',
  dark: 'A dark tile is a dark zone: code that changes with no certified explanation.',
  stale:
    'A hatched edge means some certified meaning went stale - the code moved after it was written.',
  select: 'Select a tile to inspect it; select it again to open the full module page.',
  ramp: ['dark zone', 'thin', 'partial', 'understood'] as const,
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
