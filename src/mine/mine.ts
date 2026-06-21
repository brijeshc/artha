import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ArthaConfig } from '../config/config';
import { loadEntries, writeEntry } from '../schema/load';
import type { Decision } from '../schema/types';
import { validateEntry } from '../schema/validate';
import { logger } from '../util/logger';
import { type Miner, createAnthropicMiner, requireApiKey } from './anthropic';
import { type CommitMeta, listCommits, loadCommitDiff } from './git';
import { readLedger, recordMined } from './ledger';
import { type Candidate, classifyDiff, selectCandidates } from './prefilter';

export interface MineOptions {
  /** `git log` depth; undefined = full history. */
  limit?: number;
  /** Max commits sent to the miner this run (the spend cap). 0 = unlimited. */
  maxCommits?: number;
  /** Preview candidates without calling the API or writing anything (no key needed). */
  dryRun?: boolean;
  /** Injected miner — defaults to the Anthropic engine. Tests pass a stub. */
  miner?: Miner;
}

export interface MineReport {
  /** Commits that survived the metadata pre-filter. */
  candidates: number;
  /** Commits actually sent to the miner (the billable count). */
  scanned: number;
  /** Drafts written this run. */
  drafted: { id: string; sha: string; path: string }[];
  /** Commits the miner judged to carry no decision (no file written). */
  noDecision: number;
  /** Candidates dropped at the diff stage before any LLM call. */
  skipped: { sha: string; reason: string }[];
  /** Commits skipped because they were already mined (ledger or existing draft). */
  alreadyMined: number;
}

/** Default spend cap: how many commits a single `mine` will send to the miner. */
const DEFAULT_MAX_COMMITS = 20;

/**
 * Mine git history into `proposed` decision drafts. Pipeline: list commits →
 * metadata pre-filter (skip merges/already-mined, rank) → per candidate, load
 * the diff and apply diff-level skips (free) → send survivors to the miner up
 * to the spend cap → validate (T02) and write each drafted decision, recording
 * every mined SHA in the ledger so re-runs only draft new history.
 */
export async function mine(
  repoRoot: string,
  config: ArthaConfig,
  options: MineOptions = {},
): Promise<MineReport> {
  const arthaDir = join(repoRoot, '.artha');
  const report: MineReport = {
    candidates: 0,
    scanned: 0,
    drafted: [],
    noDecision: 0,
    skipped: [],
    alreadyMined: 0,
  };

  // Fail fast on a missing key before any git work (skipped for --dry-run and
  // when a miner is injected, neither of which calls the API).
  if (!options.dryRun && !options.miner) requireApiKey();

  // Existing state: ids/ADR numbers to avoid collisions, and the union of the
  // ledger + existing drafts' provenance as the authoritative skip-set (Q2).
  const decisions = loadEntries(arthaDir).entries.filter(
    (e): e is Decision => e.kind === 'decision',
  );
  const usedIds = new Set(decisions.map((d) => d.id));
  const draftedRefs = decisions
    .map((d) => d.mined_from?.commit)
    .filter((c): c is string => typeof c === 'string' && c !== '');
  const ledger = readLedger(arthaDir);
  const isMined = (commit: CommitMeta): boolean =>
    ledger.has(commit.short) || draftedRefs.some((ref) => commit.sha.startsWith(ref));

  const commits = listCommits(repoRoot, options.limit);
  report.alreadyMined = commits.filter((c) => c.parents.length <= 1 && isMined(c)).length;

  const candidates = selectCandidates(commits, isMined);
  report.candidates = candidates.length;

  if (options.dryRun) {
    previewCandidates(repoRoot, candidates, report);
    return report;
  }

  const miner = options.miner ?? (await createAnthropicMiner(config.miner.model));
  const budget = options.maxCommits ?? DEFAULT_MAX_COMMITS;
  let nextAdr = nextAdrNumber(arthaDir);

  for (const { commit } of candidates) {
    if (budget !== 0 && report.scanned >= budget) {
      logger.info(`Reached spend cap (${budget} commits). Re-run \`artha mine\` for more.`);
      break;
    }

    const diff = loadCommitDiff(repoRoot, commit.sha);
    const verdict = classifyDiff(diff);
    if (verdict.skip) {
      report.skipped.push({ sha: commit.short, reason: verdict.reason ?? 'skipped' });
      continue;
    }

    report.scanned++;
    const result = await miner.mineCommit({
      subject: commit.subject,
      body: commit.body,
      files: diff.files,
      patch: diff.patch,
    });

    if (!result.hasDecision) {
      report.noDecision++;
      recordMined(arthaDir, { short: commit.short, outcome: 'no-decision' });
      continue;
    }

    const id = uniqueId(result.draft.title, commit.short, usedIds);
    const entry: Decision = {
      id,
      kind: 'decision',
      status: 'proposed',
      title: result.draft.title,
      context: result.draft.context,
      decision: result.draft.decision,
      ...(result.draft.consequences ? { consequences: result.draft.consequences } : {}),
      mined_from: { commit: commit.short, source: 'git-history' },
    };

    const check = validateEntry(entry);
    if (!check.ok) {
      const detail = check.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
      logger.warn(`miner produced an invalid draft for ${commit.short} (${detail}) — skipping.`);
      report.noDecision++;
      recordMined(arthaDir, { short: commit.short, outcome: 'no-decision' });
      continue;
    }

    const path = join(
      arthaDir,
      'decisions',
      `${pad4(nextAdr)}-${slugify(result.draft.title)}.yaml`,
    );
    nextAdr++;
    writeEntry(entry, path);
    usedIds.add(id);
    report.drafted.push({ id, sha: commit.short, path });
    recordMined(arthaDir, { short: commit.short, outcome: 'drafted', decisionId: id });
  }

  return report;
}

/** Dry-run: classify each candidate's diff so the user sees what would be drafted/skipped. */
function previewCandidates(repoRoot: string, candidates: Candidate[], report: MineReport): void {
  for (const { commit } of candidates) {
    const verdict = classifyDiff(loadCommitDiff(repoRoot, commit.sha));
    if (verdict.skip) {
      report.skipped.push({ sha: commit.short, reason: verdict.reason ?? 'skipped' });
    } else {
      report.scanned++; // "would be sent to the miner"
    }
  }
}

/** Next ADR number from existing `NNNN-*.yaml` filenames in `.artha/decisions/`. */
function nextAdrNumber(arthaDir: string): number {
  const dir = join(arthaDir, 'decisions');
  if (!existsSync(dir)) return 1;
  let max = 0;
  for (const name of readdirSync(dir)) {
    const match = /^(\d+)-/.exec(name);
    if (match?.[1]) max = Math.max(max, Number.parseInt(match[1], 10));
  }
  return max + 1;
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}

/** Turn a title into a schema-valid id slug (`[a-z0-9_]+`), bounded in length. */
function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
    .replace(/_+$/g, '');
  return slug;
}

/** A `decision.<slug>` id unique against `used`, falling back to the SHA then a counter. */
function uniqueId(title: string, short: string, used: Set<string>): string {
  const base = slugify(title) || `d_${short.slice(0, 7)}`;
  let candidate = `decision.${base}`;
  if (!used.has(candidate)) return candidate;
  candidate = `decision.${base}_${short.slice(0, 7)}`;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `decision.${base}_${short.slice(0, 7)}_${n}`;
    n++;
  }
  return candidate;
}
