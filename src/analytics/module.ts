/**
 * Module altitude for the dark-zone map (SPEC-v0.2 §C). A "module" is the
 * **top-level folder under a source root** — the area/module column the map
 * renders at, coarse enough to stay legible on a thousands-of-symbols repo.
 *
 * This is T13's working definition; the final "what is an area" decision is
 * **OQ5, owned by T15** — kept isolated here so it's swappable.
 */

/** Normalize a repo path to forward slashes and drop any trailing slash. */
function posix(path: string): string {
  return path.split('\\').join('/').replace(/\/+$/, '');
}

/**
 * The module a repo-relative file belongs to, or `null` if it is outside every
 * source root (so non-source churn and out-of-tree pins don't form modules).
 *
 * - `src/billing/Money.ts`  → `src/billing`  (root + first subfolder)
 * - `src/app.ts`            → `src`          (file directly under the root)
 * - `lib/x.ts` (root `src`) → `null`
 */
export function moduleOf(file: string, sourceRoots: string[]): string | null {
  const norm = posix(file);
  for (const rawRoot of sourceRoots) {
    const root = posix(rawRoot);
    if (root === '') continue;
    if (norm === root) return root;
    if (norm.startsWith(`${root}/`)) {
      const rest = norm.slice(root.length + 1);
      const first = rest.split('/')[0];
      return rest.includes('/') ? `${root}/${first}` : root;
    }
  }
  return null;
}
