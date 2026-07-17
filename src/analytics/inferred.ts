/**
 * The **inferred layer** (21a): a deterministic, offline, LLM-free extraction of
 * code *meaning* that lights the map before any human is asked for anything.
 *
 * Four extractors, all structural - they only ever *describe* what the code
 * literally contains, never invent intent (that stays the human delta):
 *
 * - **Module cards** - one readable card per module: a product-leaning name, a
 *   role read from its import position (hub vs leaf, via the T17b graph), and its
 *   public surface. So every tile on the atlas has something to say.
 * - **State-machine candidates** - a concept draft per string-literal union / TS
 *   enum a module declares, with its states read verbatim. Effects, transitions,
 *   and "why" are deliberately left blank: those are the human delta (D6/D8).
 * - **Flow skeletons** - an ordered fan-out per exported operation (an action-
 *   verb function) whose file reaches across modules: the areas it touches, read
 *   from the file's imports. What each step does and the order it runs in are the
 *   human delta - only the reachable areas are read from code (file-level; no
 *   symbol-level call graph, per the v0.2 cut).
 * - **Convention candidates** - a naming regularity a module repeats (`*Repo`,
 *   `use*`): ≥3 exported symbols sharing an affix, pinned to the symbols that
 *   embody it. What the convention *requires* is left for the human to say.
 *
 * Everything is evidence-pinned, `origin: inferred`, confidence `read-from-code`,
 * and re-derives on every build (a regenerable cache, not stored knowledge). A
 * candidate whose evidence a human already pins is suppressed - the human owns
 * it once they've touched it (materialize-on-touch).
 */

import type { InferredPinRow, InferredRow, InferredStateRow, InferredStepRow } from '../build/db';
import type { EnumLike, SymbolResolver } from '../resolver/SymbolResolver';
import { moduleOf } from './module';
import { type RefEdge, resolveSpecifier } from './references';

/** The deterministic confidence tier for everything 21a emits (D7 wording). */
export const READ_FROM_CODE = 'read-from-code';

export interface InferredLayer {
  facts: InferredRow[];
  pins: InferredPinRow[];
  states: InferredStateRow[];
  steps: InferredStepRow[];
}

const EMPTY: InferredLayer = { facts: [], pins: [], states: [], steps: [] };

/** How many public symbols a module card / convention names before "and N more". */
const CARD_SYMBOL_CAP = 8;
/** How many state names a state-machine body inlines before "…". */
const STATE_INLINE_CAP = 4;
/** How many times a naming affix must repeat in a module to read as a convention
 * (2 is coincidence; 3 is a pattern). */
const CONVENTION_MIN = 3;
/** Shortest affix word that can anchor a convention - drops `Id`, `V2`, `of`. */
const AFFIX_MIN_LEN = 3;

/**
 * First words that mark an exported function as a process/operation worth reading
 * as a flow - not a getter, predicate, or accessor. Precision-first: the
 * cross-module fan-out requirement (a real flow orchestrates across areas) does
 * most of the filtering, and this list keeps a utility that merely imports across
 * modules (a `session()` accessor, a `validate()` predicate) from being mislabelled
 * a flow. Matched against the first humanized word, so `handleCheckout` → `handle`.
 */
const FLOW_VERBS = new Set([
  'handle',
  'process',
  'run',
  'execute',
  'perform',
  'submit',
  'place',
  'checkout',
  'purchase',
  'pay',
  'charge',
  'refund',
  'cancel',
  'approve',
  'reject',
  'send',
  'dispatch',
  'publish',
  'sync',
  'migrate',
  'deploy',
  'register',
  'signup',
  'login',
  'logout',
  'authenticate',
  'authorize',
  'onboard',
  'provision',
  'schedule',
  'enqueue',
  'start',
  'create',
  'generate',
]);

/**
 * Build the inferred layer for a repo from the structural scan already done for
 * pins + the reference graph. Pure and deterministic: identical inputs → an
 * identical, sorted result, so a rebuild is byte-for-byte the same.
 *
 * @param humanPinnedRefs every `path#Symbol` a human fact pins - candidates over
 *   these are suppressed (the human already claims that evidence).
 */
export function inferLayer(
  files: string[],
  resolver: SymbolResolver,
  refs: RefEdge[],
  humanPinnedRefs: Set<string>,
  sourceRoots: string[],
): InferredLayer {
  if (files.length === 0) return EMPTY;

  const facts: InferredRow[] = [];
  const pins: InferredPinRow[] = [];
  const states: InferredStateRow[] = [];
  const steps: InferredStepRow[] = [];
  const sorted = [...files].sort();
  // The known-file set for resolving import specifiers to in-tree files (T17b's
  // resolver, reused here for flow fan-out) - deterministic, no fs, offline.
  const known = new Set(files.map(toPosix));

  // Fill each pin's content hash + canonical id from the resolver (all cache
  // hits - these files were just parsed for the structural scan).
  const resolvePin = (
    inferredId: string,
    ref: string,
    role: string,
    ord: number,
  ): InferredPinRow => {
    const hit = resolver.resolve(ref);
    return {
      inferred_id: inferredId,
      symbol_ref: ref,
      symbol_id: hit?.symbolId ?? null,
      content_hash: hit?.contentHash ?? null,
      role,
      ord,
    };
  };

  // ── Module cards ─────────────────────────────────────────────────────────
  const filesByModule = groupByModule(files, sourceRoots);
  for (const [module, moduleFiles] of filesByModule) {
    const card = moduleCard(module, moduleFiles, resolver, refs, sourceRoots);
    facts.push(card.fact);
    card.symbolRefs.forEach((ref, i) => {
      pins.push(resolvePin(card.fact.id, ref, 'export', i));
    });
  }

  // ── State-machine candidates ─────────────────────────────────────────────
  for (const file of sorted) {
    const module = moduleOf(file, sourceRoots);
    for (const found of resolver.enumLikes(file)) {
      const ref = `${file}#${found.name}`;
      if (humanPinnedRefs.has(ref)) continue; // the human owns this evidence
      const id = `inferred:concept:${ref}`;
      facts.push({
        id,
        kind: 'concept',
        module,
        heading: humanize(found.name),
        body: stateMachineBody(found),
        confidence: READ_FROM_CODE,
        origin: 'inferred',
      });
      found.members.forEach((name, ord) => states.push({ inferred_id: id, name, ord }));
      pins.push(resolvePin(id, ref, 'evidence', 0));
    }
  }

  // ── Flow skeletons ───────────────────────────────────────────────────────
  // An exported action-verb function whose file reaches across modules is an
  // entry point; its steps are the areas that file imports (file-level fan-out,
  // in source order). Steps' meaning/order are the human delta - only the
  // reachable areas are read from code.
  for (const file of sorted) {
    const module = moduleOf(file, sourceRoots);
    if (!module) continue;
    for (const decl of resolver.list(file)) {
      if (decl.kind !== 'function' || !decl.exported || decl.name.includes('.')) continue;
      if (!isFlowVerb(decl.name)) continue;
      const ref = `${file}#${decl.name}`;
      if (humanPinnedRefs.has(ref)) continue; // the human owns this evidence
      const fan = fanOut(file, module, resolver, known, sourceRoots);
      if (fan.length === 0) continue; // no downstream area → not a flow skeleton
      const id = `inferred:flow:${ref}`;
      facts.push({
        id,
        kind: 'flow',
        module,
        heading: humanize(decl.name),
        body: flowBody(module, fan),
        confidence: READ_FROM_CODE,
        origin: 'inferred',
      });
      fan.forEach((s, ord) =>
        steps.push({ inferred_id: id, label: s.label, to_module: s.module, note: null, ord }),
      );
      pins.push(resolvePin(id, ref, 'entry', 0));
    }
  }

  // ── Convention candidates ────────────────────────────────────────────────
  // Naming regularities a module repeats (≥3 exported symbols sharing an affix).
  // Like module cards, these are aggregate structural context, not a single-
  // evidence claim, so they are not suppressed by human pins.
  for (const cand of conventions(sorted, resolver, sourceRoots)) {
    facts.push({
      id: cand.id,
      kind: 'convention',
      module: cand.module,
      heading: cand.heading,
      body: cand.body,
      confidence: READ_FROM_CODE,
      origin: 'inferred',
    });
    cand.memberRefs.forEach((ref, ord) => pins.push(resolvePin(cand.id, ref, 'member', ord)));
  }

  facts.sort((a, b) => a.id.localeCompare(b.id));
  return { facts, pins, states, steps };
}

interface ModuleCard {
  fact: InferredRow;
  /** Public-surface symbol refs, in deterministic order, to pin as evidence. */
  symbolRefs: string[];
}

/**
 * A single module's card: name from its folder, role from its import position,
 * surface from its exported symbols. Honest and glanceable - the LLM pass (21b)
 * rewrites the prose into a real purpose; 21a keeps it factual.
 */
function moduleCard(
  module: string,
  moduleFiles: string[],
  resolver: SymbolResolver,
  refs: RefEdge[],
  sourceRoots: string[],
): ModuleCard {
  // Public surface: exported top-level declarations across the module, in a
  // stable order. Fall back to all top-level decls when nothing is `export`ed
  // (e.g. an entry file that only runs side effects).
  const exportRefs: string[] = [];
  const allRefs: string[] = [];
  for (const file of [...moduleFiles].sort()) {
    for (const decl of resolver.list(file)) {
      if (decl.name.includes('.')) continue; // class members are not the surface
      const ref = `${file}#${decl.name}`;
      allRefs.push(ref);
      if (decl.exported) exportRefs.push(ref);
    }
  }
  const surface = exportRefs.length > 0 ? exportRefs : allRefs;

  const importers = neighbours(refs, module, 'in', sourceRoots);
  const dependencies = neighbours(refs, module, 'out', sourceRoots);

  return {
    fact: {
      id: `inferred:module:${module}`,
      kind: 'module',
      module,
      heading: humanize(basename(module)),
      body: moduleBody(surface, importers, dependencies, moduleFiles.length),
      confidence: READ_FROM_CODE,
      origin: 'inferred',
    },
    symbolRefs: surface.slice(0, CARD_SYMBOL_CAP),
  };
}

/** Neighbour module labels (humanized), most-coupled first, for the card prose. */
function neighbours(
  refs: RefEdge[],
  module: string,
  dir: 'in' | 'out',
  sourceRoots: string[],
): string[] {
  return refs
    .filter((r) => (dir === 'in' ? r.to_module : r.from_module) === module)
    .sort((a, b) => b.count - a.count || a.from_module.localeCompare(b.from_module))
    .map((r) => humanize(basename(dir === 'in' ? r.from_module : r.to_module)));
}

/**
 * The module card's prose: one role sentence read from the import graph, one
 * surface sentence read from the exports. Product-leaning but never invented.
 */
function moduleBody(
  surface: string[],
  importers: string[],
  dependencies: string[],
  fileCount: number,
): string {
  let role: string;
  if (importers.length >= 2 && importers.length >= dependencies.length) {
    role = `Shared foundation that ${formatList(importers)} build on.`;
  } else if (dependencies.length >= 1 && importers.length === 0) {
    role = `Entry area that draws on ${formatList(dependencies)}.`;
  } else if (importers.length > 0 || dependencies.length > 0) {
    const wired = [...importers, ...dependencies];
    role = `Supporting area, wired to ${formatList(wired)}.`;
  } else {
    role = `Self-contained area (${fileCount} ${plural(fileCount, 'file')}).`;
  }

  if (surface.length === 0) return role;
  const names = surface.slice(0, 3).map(symbolName);
  const extra = surface.length - names.length;
  const more = extra > 0 ? ` and ${extra} more` : '';
  return `${role} Exposes ${formatList(names)}${more}.`;
}

/** A state-machine candidate's prose: the states, and an honest flag that the
 * meaning of each state and its transitions are still the human's to add. */
function stateMachineBody(found: EnumLike): string {
  const shown = found.members.slice(0, STATE_INLINE_CAP);
  const ellipsis = found.members.length > shown.length ? ', …' : '';
  const noun = found.kind === 'enum' ? 'enum' : 'type';
  const states = `${shown.join(', ')}${ellipsis}`;
  const tail = 'What each state means and how it transitions are not yet described.';
  return `${found.members.length} states read from the \`${found.name}\` ${noun} (${states}). ${tail}`;
}

// ── Flow skeletons ──────────────────────────────────────────────────────────

/** One downstream area a flow reaches: the module and its readable label. */
interface FanStep {
  module: string;
  label: string;
}

/** True when a function name reads as an operation (its first word is an action
 * verb), so it is a plausible flow entry point rather than a getter/accessor. */
function isFlowVerb(name: string): boolean {
  const first = words(name)[0];
  return first !== undefined && FLOW_VERBS.has(first.toLowerCase());
}

/**
 * The in-tree modules a file imports, rolled to module altitude, deduped, in
 * source order - the file-level fan-out that seeds a flow's step candidates. The
 * entry's own module is excluded (a flow describes what it reaches *out* to).
 */
function fanOut(
  file: string,
  ownModule: string,
  resolver: SymbolResolver,
  known: Set<string>,
  sourceRoots: string[],
): FanStep[] {
  const seen = new Set<string>();
  const out: FanStep[] = [];
  for (const spec of resolver.imports(file)) {
    const target = resolveSpecifier(toPosix(file), spec, (p) => known.has(p));
    if (!target) continue;
    const module = moduleOf(target, sourceRoots);
    if (!module || module === ownModule || seen.has(module)) continue;
    seen.add(module);
    out.push({ module, label: humanize(basename(module)) });
  }
  return out;
}

/** A flow skeleton's prose: where it starts, the areas it reaches, and an honest
 * flag that the steps themselves are still the human's to describe. */
function flowBody(module: string, fan: FanStep[]): string {
  const here = humanize(basename(module));
  const reaches = formatList(fan.map((s) => s.label));
  const tail = 'What happens at each step, and in what order, is not yet described.';
  return `An operation in ${here} that reaches ${reaches} (read from its imports). ${tail}`;
}

// ── Convention candidates ───────────────────────────────────────────────────

/** One exported symbol considered for a module's naming conventions. */
interface NamedSymbol {
  name: string;
  ref: string;
}

/** A convention candidate ready to become an inferred fact + evidence pins. */
interface ConventionCand {
  id: string;
  module: string;
  heading: string;
  body: string;
  /** Member symbol refs to pin as evidence (capped, deterministic order). */
  memberRefs: string[];
}

/**
 * The naming conventions each module repeats: ≥3 exported top-level symbols
 * sharing a first word (`use*`) or last word (`*Repo`). Deterministic - modules,
 * symbols, and affixes are all processed in sorted order.
 */
function conventions(
  sortedFiles: string[],
  resolver: SymbolResolver,
  sourceRoots: string[],
): ConventionCand[] {
  const byModule = new Map<string, NamedSymbol[]>();
  for (const file of sortedFiles) {
    const module = moduleOf(file, sourceRoots);
    if (!module) continue;
    for (const decl of resolver.list(file)) {
      if (!decl.exported || decl.name.includes('.')) continue; // public top-level only
      const bucket = byModule.get(module) ?? [];
      bucket.push({ name: decl.name, ref: `${file}#${decl.name}` });
      byModule.set(module, bucket);
    }
  }

  const cands: ConventionCand[] = [];
  for (const [module, symbols] of [...byModule.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    for (const where of ['suffix', 'prefix'] as const) {
      for (const [affix, members] of affixGroups(symbols, where)) {
        if (members.length < CONVENTION_MIN) continue;
        const glob = where === 'suffix' ? `*${affix}` : `${affix}*`;
        cands.push({
          id: `inferred:convention:${module}:${where}:${affix}`,
          module,
          heading: glob,
          body: conventionBody(glob, members),
          memberRefs: members.map((m) => m.ref).slice(0, CARD_SYMBOL_CAP),
        });
      }
    }
  }
  return cands;
}

/** A convention candidate's prose: how many names match, a sample, and an honest
 * flag that what the convention *requires* is still the human's to say. */
function conventionBody(glob: string, members: NamedSymbol[]): string {
  const sample = formatList(members.map((m) => m.name));
  const tail =
    'A naming convention read from the code; what it requires of them is not yet described.';
  return `${members.length} exported names here match \`${glob}\` (${sample}). ${tail}`;
}

/**
 * Group a module's symbols by their leading (`prefix`) or trailing (`suffix`)
 * word, keeping only words long enough to be meaningful. Members within a group
 * are sorted by name for a byte-stable pin order; groups iterate in affix order.
 */
function affixGroups(
  symbols: NamedSymbol[],
  where: 'prefix' | 'suffix',
): Map<string, NamedSymbol[]> {
  const groups = new Map<string, NamedSymbol[]>();
  for (const sym of symbols) {
    const parts = words(sym.name);
    const affix = where === 'suffix' ? parts[parts.length - 1] : parts[0];
    if (!affix || affix.length < AFFIX_MIN_LEN) continue;
    const bucket = groups.get(affix) ?? [];
    bucket.push(sym);
    groups.set(affix, bucket);
  }
  for (const bucket of groups.values()) {
    bucket.sort((a, b) => a.name.localeCompare(b.name) || a.ref.localeCompare(b.ref));
  }
  return new Map([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

// ── small deterministic string helpers ─────────────────────────────────────

/** Repo-relative path with forward slashes, for `resolveSpecifier` + the known set. */
function toPosix(path: string): string {
  return path.split('\\').join('/');
}

/** Group files by their module (top-level folder), skipping out-of-tree files.
 * Returns a map iterated in sorted module order for deterministic output. */
function groupByModule(files: string[], sourceRoots: string[]): Map<string, string[]> {
  const byModule = new Map<string, string[]>();
  for (const file of files) {
    const module = moduleOf(file, sourceRoots);
    if (!module) continue;
    const bucket = byModule.get(module);
    if (bucket) bucket.push(file);
    else byModule.set(module, [file]);
  }
  return new Map([...byModule.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

/** Last path segment of a module id: `src/billing` → `billing`, `src` → `src`. */
function basename(module: string): string {
  const parts = module.split('/');
  return parts[parts.length - 1] ?? module;
}

/** The symbol name of a `path#Name` ref. */
function symbolName(ref: string): string {
  return ref.slice(ref.indexOf('#') + 1);
}

/** Split a code identifier into its words, original case preserved:
 * `SubscriptionStatus` → ['Subscription', 'Status']; `use-auth` → ['use', 'auth']. */
function words(identifier: string): string[] {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase boundary
    .replace(/[_\-.]+/g, ' ') // separators
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Turn a code identifier into readable words: split camelCase and separators,
 * title-case each word. `SubscriptionStatus` → "Subscription Status";
 * `user-auth` → "User Auth"; `billing` → "Billing".
 */
export function humanize(identifier: string): string {
  const parts = words(identifier);
  if (parts.length === 0) return identifier;
  return parts.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Join names as prose: "a", "a and b", "a, b and c" (capped at 3 + "N more"). */
function formatList(names: string[], cap = 3): string {
  const shown = names.slice(0, cap);
  const extra = names.length - shown.length;
  if (extra > 0) shown.push(`${extra} more`);
  if (shown.length === 1) return shown[0] as string;
  if (shown.length === 2) return `${shown[0]} and ${shown[1]}`;
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`;
}
