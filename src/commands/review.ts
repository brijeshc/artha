import { runReview } from '../review/app';

/**
 * `artha review` — Ink TUI to certify / edit / reject proposed drafts beside
 * their source commit/diff. The only path to `certified` (SPEC: never
 * auto-certify); runs fully offline.
 */
export async function reviewCommand(): Promise<void> {
  await runReview({ repoRoot: process.cwd() });
}
