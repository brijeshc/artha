import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { loadEntries, writeEntry } from '../schema/load';
import type { ArthaEntry } from '../schema/types';
import { validateEntry } from '../schema/validate';
import { ArthaError } from '../util/error';

/** Who/when to stamp on a certified entry. Injectable so tests are deterministic. */
export interface Identity {
  certifiedBy: string;
  /** Today, `YYYY-MM-DD` (schema §2 `certified_at` is `format: date`). */
  certifiedAt: string;
}

/** Outcome of (re)reading a single entry file from disk. */
export type ReloadResult = { ok: true; entry: ArthaEntry } | { ok: false; errors: string[] };

/**
 * Every `proposed` entry under `.artha/`, in load order — the review queue.
 * Reuses T02's loader, so a malformed/duplicate entry anywhere surfaces the same
 * error `artha build` would; review only ever touches the `proposed` slice.
 */
export function loadProposed(arthaDir: string): ArthaEntry[] {
  return loadEntries(arthaDir).entries.filter((entry) => entry.status === 'proposed');
}

/**
 * Certify an entry in place: stamp `status: certified` + `certified_by`/`certified_at`,
 * validate the exact shape that will hit disk, and write it back to its source file.
 * Throws (writing nothing) if the result is invalid or the entry has no file — the
 * "never write an invalid/auto entry" guarantee (SPEC constraint, Product risk 2).
 */
export function certifyDraft(entry: ArthaEntry, identity: Identity): ArthaEntry {
  if (entry.source_path === undefined) {
    throw new ArthaError(`Cannot certify ${entry.id}: it has no source file on disk.`);
  }
  const certified: ArthaEntry = {
    ...entry,
    status: 'certified',
    certified_by: identity.certifiedBy,
    certified_at: identity.certifiedAt,
  };
  assertValid(certified);
  writeEntry(certified, entry.source_path);
  return certified;
}

/**
 * Reject a draft by deleting its file (schema §6 — reject is a hard delete, no
 * tombstone in v0.1). The TUI confirms once before calling this.
 */
export function rejectDraft(entry: ArthaEntry): void {
  if (entry.source_path === undefined) {
    throw new ArthaError(`Cannot reject ${entry.id}: it has no source file on disk.`);
  }
  unlinkSync(entry.source_path);
}

/**
 * Re-read and validate a single entry file (used after an `$EDITOR` session).
 * Never throws: a malformed/invalid file comes back as `{ ok: false, errors }`
 * so the TUI can show the problem and keep the queue intact.
 */
export function readEntryFile(path: string): ReloadResult {
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, 'utf8'));
  } catch (cause) {
    return { ok: false, errors: [`malformed YAML: ${(cause as Error).message}`] };
  }
  const result = validateEntry(raw);
  if (!result.ok) {
    return { ok: false, errors: result.errors.map((e) => `${e.path}: ${e.message}`) };
  }
  result.entry.source_path = path;
  return { ok: true, entry: result.entry };
}

/** Launch `$VISUAL`/`$EDITOR` on `path`, inheriting the terminal, and block until it exits. */
export function openInEditor(path: string): void {
  const { cmd, args } = editorCommand();
  execFileSync(cmd, [...args, path], { stdio: 'inherit' });
}

/** Resolve the certifier ("git user → $USER → unknown") and today's date. */
export function resolveIdentity(repoRoot: string, now: Date = new Date()): Identity {
  return { certifiedBy: resolveCertifier(repoRoot), certifiedAt: isoDate(now) };
}

/** Parse `$VISUAL`/`$EDITOR` (which may carry flags, e.g. `code --wait`) into argv. */
export function editorCommand(): { cmd: string; args: string[] } {
  const raw = process.env.VISUAL ?? process.env.EDITOR ?? defaultEditor();
  const [cmd, ...args] = raw.split(/\s+/).filter((part) => part !== '');
  return { cmd: cmd ?? defaultEditor(), args };
}

function defaultEditor(): string {
  return process.platform === 'win32' ? 'notepad' : 'vi';
}

function assertValid(entry: ArthaEntry): void {
  const result = validateEntry(forValidation(entry));
  if (!result.ok) {
    const detail = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new ArthaError(`Refusing to write invalid entry ${entry.id}: ${detail}`);
  }
}

/** Drop the loader-only `source_path` so we validate exactly what gets written. */
function forValidation(entry: ArthaEntry): unknown {
  return { ...entry, source_path: undefined };
}

function resolveCertifier(repoRoot: string): string {
  const fromGit = gitUserName(repoRoot);
  if (fromGit !== undefined) return fromGit;
  const fromEnv = (process.env.USER ?? process.env.USERNAME ?? '').trim();
  return fromEnv !== '' ? fromEnv : 'unknown';
}

function gitUserName(repoRoot: string): string | undefined {
  try {
    const name = execFileSync('git', ['config', 'user.name'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return name === '' ? undefined : name;
  } catch {
    return undefined;
  }
}

function isoDate(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
