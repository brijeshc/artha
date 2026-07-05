/**
 * The **inferred layer** (21a): a deterministic, offline, LLM-free extraction of
 * code *meaning* that lights the map before any human is asked for anything.
 *
 * Two extractors, both structural - they only ever *describe* what the code
 * literally contains, never invent intent (that stays the human delta):
 *
 * - **Module cards** - one readable card per module: a product-leaning name, a
 *   role read from its import position (hub vs leaf, via the T17b graph), and its
 *   public surface. So every tile on the atlas has something to say.
 * - **State-machine candidates** - a concept draft per string-literal union / TS
 *   enum a module declares, with its states read verbatim. Effects, transitions,
 *   and "why" are deliberately left blank: those are the human delta (D6/D8).
 *
 * Everything is evidence-pinned, `origin: inferred`, confidence `read-from-code`,
 * and re-derives on every build (a regenerable cache, not stored knowledge). A
 * candidate whose evidence a human already pins is suppressed - the human owns
 * it once they've touched it (materialize-on-touch).
 */

import type { InferredPinRow, InferredRow, InferredStateRow } from '../build/db';
import type { EnumLike, SymbolResolver } from '../resolver/SymbolResolver';
import { moduleOf } from './module';
import type { RefEdge } from './references';

/** The deterministic confidence tier for everything 21a emits (D7 wording). */
export const READ_FROM_CODE = 'read-from-code';

export interface InferredLayer {
  facts: InferredRow[];
  pins: InferredPinRow[];
  states: InferredStateRow[];
}

const EMPTY: InferredLayer = { facts: [], pins: [], states: [] };

/** How many public symbols a module card names before "and N more". */
const CARD_SYMBOL_CAP = 8;
/** How many state names a state-machine body inlines before "…". */
const STATE_INLINE_CAP = 4;

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
  for (const file of [...files].sort()) {
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

  facts.sort((a, b) => a.id.localeCompare(b.id));
  return { facts, pins, states };
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

// ── small deterministic string helpers ─────────────────────────────────────

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

/**
 * Turn a code identifier into readable words: split camelCase and separators,
 * title-case each word. `SubscriptionStatus` → "Subscription Status";
 * `user-auth` → "User Auth"; `billing` → "Billing".
 */
export function humanize(identifier: string): string {
  const words = identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase boundary
    .replace(/[_\-.]+/g, ' ') // separators
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return identifier;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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
