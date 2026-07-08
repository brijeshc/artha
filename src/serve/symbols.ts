import { type FileGraph, fileImportGraph, listSourceFiles } from '../analytics/references';
import type { ArthaConfig } from '../config/config';
import { createTreeSitterResolver } from '../resolver/treeSitterResolver';

/**
 * The repo's **structural scan**: one offline tree-sitter pass over the source
 * roots that yields both the link picker's symbol catalog (T17) and the file
 * import graph (T17b). Built once per repo and cached, so the picker's per-
 * keystroke search and the pin suggester's proximity signal share a single pass
 * (no second resolver, no double walk). A source-tree change during the session
 * isn't picked up until the server restarts - this is about code that already
 * exists to link to.
 */

export interface SymbolHit {
  /** The pin ref: `src/billing/Money.ts#Money`. */
  ref: string;
  /** Qualified name (`Money`, `Money.format`). */
  name: string;
  /** Repo-relative posix path of the file. */
  path: string;
  /** class · function · interface · type · enum · const · method · field. */
  kind: string;
}

/** Everything one structural scan produces: the symbol catalog + the file graph
 * + the repo-relative source-file list (the inner board, 23b, boxes these). */
export interface RepoStructure {
  catalog: SymbolHit[];
  fileGraph: FileGraph;
  files: string[];
}

const structures = new Map<string, Promise<RepoStructure>>();

/** Build (once per repo, cached) the structural scan. Concurrent callers share
 * the one in-flight build; a failed build is dropped so a later request retries. */
export function repoStructure(repoRoot: string, config: ArthaConfig): Promise<RepoStructure> {
  let pending = structures.get(repoRoot);
  if (!pending) {
    pending = buildStructure(repoRoot, config).catch((error) => {
      structures.delete(repoRoot);
      throw error;
    });
    structures.set(repoRoot, pending);
  }
  return pending;
}

/** The link picker's symbol catalog (cached via {@link repoStructure}). */
export async function symbolCatalog(repoRoot: string, config: ArthaConfig): Promise<SymbolHit[]> {
  return (await repoStructure(repoRoot, config)).catalog;
}

/** Search the (cached) catalog for a query. Empty query → nothing (the picker
 * prompts the user to type first). Offline; pure filter over memory. */
export async function searchSymbols(
  repoRoot: string,
  config: ArthaConfig,
  query: string,
): Promise<SymbolHit[]> {
  if (query.trim() === '') return [];
  return rankSymbols(await symbolCatalog(repoRoot, config), query);
}

/**
 * Rank symbols for a query: exact name > name-prefix > name-substring >
 * path-substring, shorter names nudged higher, deterministic ties. Matches on
 * both the symbol name and its path, so "Money" and "billing" both work.
 */
export function rankSymbols(catalog: SymbolHit[], query: string, limit = 25): SymbolHit[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];

  const scored: Array<{ hit: SymbolHit; score: number }> = [];
  for (const hit of catalog) {
    const score = lexicalScore(hit, q);
    if (score > 0) scored.push({ hit, score });
  }
  scored.sort((a, b) => b.score - a.score || a.hit.ref.localeCompare(b.hit.ref));
  return scored.slice(0, limit).map((s) => s.hit);
}

/**
 * One symbol's lexical affinity to a lowercased query term: exact name (100) >
 * name-prefix (80) > name-substring (60) > path-substring (30), with shorter
 * names nudged up. `0` means no match. Shared by the link picker's ranking and
 * the pin suggester's lexical signal (T17b) so they agree on "name match".
 */
export function lexicalScore(hit: SymbolHit, term: string): number {
  const name = hit.name.toLowerCase();
  let score: number;
  if (name === term) score = 100;
  else if (name.startsWith(term)) score = 80;
  else if (name.includes(term)) score = 60;
  else if (hit.path.toLowerCase().includes(term)) score = 30;
  else return 0;
  return score - Math.min(name.length, 40) * 0.1; // prefer the tighter match
}

async function buildStructure(repoRoot: string, config: ArthaConfig): Promise<RepoStructure> {
  const files = listSourceFiles(repoRoot, config.sourceRoots);
  const resolver = await createTreeSitterResolver(repoRoot);
  const catalog: SymbolHit[] = [];
  for (const rel of files) {
    for (const decl of resolver.list(rel)) {
      catalog.push({ ref: `${rel}#${decl.name}`, name: decl.name, path: rel, kind: decl.kind });
    }
  }
  const fileGraph = fileImportGraph(files, (rel) => resolver.imports(rel));
  return { catalog, fileGraph, files };
}
