import { readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import type { ArthaConfig } from '../config/config';
import { createTreeSitterResolver } from '../resolver/treeSitterResolver';

/**
 * The link picker's data source (T17): a searchable catalog of every resolvable
 * symbol under the source roots, so linking code is **search-and-pick**, not
 * hand-typing `path#Symbol`. Built once with the built-in tree-sitter resolver
 * (so every ref is guaranteed to resolve as a pin) and cached per repo; fully
 * offline. A source-tree change during the session isn't picked up until the
 * server restarts - the catalog is about code that already exists to link to.
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

const SOURCE_EXT = new Set(['.ts', '.mts', '.cts', '.tsx', '.js', '.mjs', '.cjs', '.jsx']);
const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.artha',
  '.next',
  '.cache',
  '.turbo',
]);
/** Guardrail against a pathological tree; a normal source root is far under this. */
const MAX_FILES = 20000;

const catalogs = new Map<string, Promise<SymbolHit[]>>();

/** Build (once per repo, cached) the symbol catalog. Concurrent callers share the
 * one in-flight build; a failed build is dropped so a later request can retry. */
export function symbolCatalog(repoRoot: string, config: ArthaConfig): Promise<SymbolHit[]> {
  let pending = catalogs.get(repoRoot);
  if (!pending) {
    pending = buildCatalog(repoRoot, config).catch((error) => {
      catalogs.delete(repoRoot);
      throw error;
    });
    catalogs.set(repoRoot, pending);
  }
  return pending;
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
    const name = hit.name.toLowerCase();
    let score: number;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else if (hit.path.toLowerCase().includes(q)) score = 30;
    else continue;
    score -= Math.min(name.length, 40) * 0.1; // prefer the tighter match
    scored.push({ hit, score });
  }
  scored.sort((a, b) => b.score - a.score || a.hit.ref.localeCompare(b.hit.ref));
  return scored.slice(0, limit).map((s) => s.hit);
}

async function buildCatalog(repoRoot: string, config: ArthaConfig): Promise<SymbolHit[]> {
  const files = listSourceFiles(repoRoot, config.sourceRoots);
  const resolver = await createTreeSitterResolver(repoRoot);
  const hits: SymbolHit[] = [];
  for (const rel of files) {
    for (const decl of resolver.list(rel)) {
      hits.push({ ref: `${rel}#${decl.name}`, name: decl.name, path: rel, kind: decl.kind });
    }
  }
  return hits;
}

/** Repo-relative posix paths of every JS/TS source file under the source roots. */
function listSourceFiles(repoRoot: string, sourceRoots: string[]): string[] {
  const files: string[] = [];

  const walk = (absDir: string): void => {
    if (files.length >= MAX_FILES) return;
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return; // unreadable dir → skip, never throw
    }
    for (const entry of entries) {
      if (files.length >= MAX_FILES) return;
      const abs = join(absDir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) walk(abs);
      } else if (entry.isFile() && SOURCE_EXT.has(extname(entry.name).toLowerCase())) {
        files.push(relative(repoRoot, abs).split('\\').join('/'));
      }
    }
  };

  for (const root of sourceRoots) walk(join(repoRoot, root));
  return files;
}
