import { execFileSync } from 'node:child_process';
import { logger } from '../util/logger';
import { moduleOf } from './module';

/** How far back churn is measured. OQ4 default (developer-chosen 2026-06-24):
 * the **last 90 days** — "churns a lot" means *recent*, current risk, so old,
 * settled churn stops counting. Swappable via {@link ChurnOptions.windowDays}. */
export const DEFAULT_CHURN_WINDOW_DAYS = 90;

export interface ChurnOptions {
  /** Window length in days (default {@link DEFAULT_CHURN_WINDOW_DAYS}). */
  windowDays?: number;
  /** "Now" for the window's lower bound; injectable so tests are deterministic. */
  now?: Date;
}

// A record separator that cannot appear in a commit hash, so splitting the
// formatted `git log` is unambiguous.
const RECORD = '\x1e';

/**
 * Commits-per-module churn over the window (SPEC-v0.2 §C). A module's churn is
 * the **number of commits in the window that touched ≥1 file in it** (a single
 * commit touching three files in one module counts once). Deterministic given a
 * fixed history. Restricted to `sourceRoots` so only code modules form.
 *
 * Resilient by design: a non-git dir or an empty/failed history yields an
 * **empty** map (logged, not thrown) — the dashboard degrades to "no churn
 * signal," never a crash (consistent with the cold-start contract).
 */
export function moduleChurn(
  repoRoot: string,
  sourceRoots: string[],
  options: ChurnOptions = {},
): Map<string, number> {
  const churn = new Map<string, number>();
  if (sourceRoots.length === 0) return churn;

  const windowDays = options.windowDays ?? DEFAULT_CHURN_WINDOW_DAYS;
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10); // YYYY-MM-DD

  let out: string;
  try {
    out = execFileSync(
      'git',
      ['log', `--since=${since}`, '--name-only', `--format=${RECORD}%H`, '--', ...sourceRoots],
      // Capture stdout; silence stderr so the expected "not a git repository"
      // path stays quiet (it's handled gracefully below, not surfaced).
      {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
  } catch (cause) {
    logger.debug(`churn: git log failed, treating as no churn — ${(cause as Error).message}`);
    return churn;
  }

  for (const chunk of out.split(RECORD)) {
    const lines = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '');
    if (lines.length === 0) continue;
    // First line is the commit hash; the rest are the files it changed.
    const modules = new Set<string>();
    for (const file of lines.slice(1)) {
      const mod = moduleOf(file, sourceRoots);
      if (mod) modules.add(mod);
    }
    for (const mod of modules) churn.set(mod, (churn.get(mod) ?? 0) + 1);
  }

  return churn;
}
