import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * The mined-commit ledger (`.artha/.mined`). Open Q2 decided: keep a separate
 * ledger of every commit we sent to the miner — in addition to `mined_from` on
 * each draft — so a *rejected* (deleted) draft's commit stays skipped and is
 * never re-drafted (and never re-charged to the API) on a later `mine`.
 *
 * Format: one record per line, `‹short-sha›\t‹outcome›[\t‹decision-id›]`.
 * Lines beginning with `#` are comments. The short SHA is the skip key.
 */

export type MineOutcome = 'drafted' | 'no-decision';

export interface LedgerEntry {
  short: string;
  outcome: MineOutcome;
  decisionId?: string;
}

const LEDGER_FILE = '.mined';
const HEADER =
  '# artha mined-commit ledger — short SHAs already sent to the miner.\n' +
  '# Skipped on re-runs so rejected drafts are not re-drafted. Do not hand-edit ids.\n';

function ledgerPath(arthaDir: string): string {
  return join(arthaDir, LEDGER_FILE);
}

/** Read the set of short SHAs already mined. Missing file → empty set. */
export function readLedger(arthaDir: string): Set<string> {
  const path = ledgerPath(arthaDir);
  if (!existsSync(path)) return new Set();

  const shas = new Set<string>();
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const short = line.split('\t')[0];
    if (short) shas.add(short);
  }
  return shas;
}

/**
 * Append a mined commit to the ledger (creating it, with a header, on first
 * write). Caller is responsible for not re-recording an already-mined SHA;
 * `readLedger` is the skip-set checked before mining.
 */
export function recordMined(arthaDir: string, entry: LedgerEntry): void {
  const path = ledgerPath(arthaDir);
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, HEADER, 'utf8');
  }
  const fields = [entry.short, entry.outcome];
  if (entry.decisionId) fields.push(entry.decisionId);
  appendFileSync(path, `${fields.join('\t')}\n`, 'utf8');
}
