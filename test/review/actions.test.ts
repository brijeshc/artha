import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  certifyDraft,
  editorCommand,
  loadProposed,
  readEntryFile,
  rejectDraft,
  resolveIdentity,
} from '../../src/review/actions';
import { loadEntries, writeEntry } from '../../src/schema/load';
import type { Decision } from '../../src/schema/types';
import { isArthaError } from '../../src/util/error';

let root: string;
let arthaDir: string;

function proposed(id: string, overrides: Partial<Decision> = {}): Decision {
  return {
    id,
    kind: 'decision',
    status: 'proposed',
    title: 'Store money as integer minor units',
    context: 'Floats drift under repeated arithmetic.',
    decision: 'Represent money as integer cents everywhere.',
    consequences: 'Convert to/from major units only at the UI edge.',
    mined_from: { commit: 'abc123def456', source: 'git-history' },
    ...overrides,
  };
}

function writeProposed(id: string, overrides: Partial<Decision> = {}): string {
  const path = join(arthaDir, 'decisions', `${id}.yaml`);
  writeEntry(proposed(id, overrides), path);
  return path;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'artha-review-'));
  arthaDir = join(root, '.artha');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('loadProposed', () => {
  it('returns only proposed entries, with source_path attached', () => {
    writeProposed('decision.money');
    writeProposed('decision.done', {
      status: 'certified',
      certified_by: 'X',
      certified_at: '2026-01-01',
    });

    const queue = loadProposed(arthaDir);
    expect(queue.map((e) => e.id)).toEqual(['decision.money']);
    expect(queue[0]?.source_path).toContain('decision.money.yaml');
  });

  it('is empty when there is no .artha dir', () => {
    expect(loadProposed(arthaDir)).toEqual([]);
  });
});

describe('certifyDraft', () => {
  it('stamps status/certified_by/certified_at and writes a schema-valid file', () => {
    writeProposed('decision.money');
    const [draft] = loadProposed(arthaDir);
    if (draft === undefined) throw new Error('expected a draft');

    const certified = certifyDraft(draft, {
      certifiedBy: 'Ada Lovelace',
      certifiedAt: '2026-06-21',
    });
    expect(certified.status).toBe('certified');

    // Re-load from disk: throws if the written file is invalid (T02 acceptance).
    const reloaded = loadEntries(arthaDir).entries.find((e) => e.id === 'decision.money');
    expect(reloaded?.status).toBe('certified');
    expect(reloaded?.certified_by).toBe('Ada Lovelace');
    expect(reloaded?.certified_at).toBe('2026-06-21');
    expect(loadProposed(arthaDir)).toEqual([]); // no longer in the proposed queue
  });

  it('refuses to certify an entry with no source file', () => {
    const orphan = proposed('decision.orphan'); // never written, no source_path
    expect(() => certifyDraft(orphan, { certifiedBy: 'X', certifiedAt: '2026-06-21' })).toThrow(
      /no source file/,
    );
  });
});

describe('rejectDraft', () => {
  it('deletes the draft file from disk', () => {
    const path = writeProposed('decision.money');
    const [draft] = loadProposed(arthaDir);
    if (draft === undefined) throw new Error('expected a draft');

    rejectDraft(draft);
    expect(existsSync(path)).toBe(false);
  });
});

describe('readEntryFile', () => {
  it('returns ok for a valid entry and attaches source_path', () => {
    const path = writeProposed('decision.money');
    const result = readEntryFile(path);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entry.source_path).toBe(path);
  });

  it('reports schema errors without throwing (edit that breaks the schema)', () => {
    const path = join(arthaDir, 'decisions', 'broken.yaml');
    mkdirSync(join(arthaDir, 'decisions'), { recursive: true });
    // Missing the required `decision` field.
    writeFileSync(
      path,
      'id: decision.broken\nkind: decision\nstatus: proposed\ntitle: T\ncontext: C\n',
    );
    const result = readEntryFile(path);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/decision/);
  });

  it('reports malformed YAML without throwing', () => {
    const path = join(arthaDir, 'decisions', 'malformed.yaml');
    mkdirSync(join(arthaDir, 'decisions'), { recursive: true });
    writeFileSync(path, 'id: [unterminated\n');
    const result = readEntryFile(path);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/malformed YAML/i);
  });
});

describe('resolveIdentity', () => {
  it('reads git user.name and formats today as YYYY-MM-DD', () => {
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Grace Hopper'], { cwd: root, stdio: 'ignore' });

    const identity = resolveIdentity(root, new Date(2026, 5, 21));
    expect(identity.certifiedBy).toBe('Grace Hopper');
    expect(identity.certifiedAt).toBe('2026-06-21');
  });
});

describe('editorCommand', () => {
  const saved = { VISUAL: process.env.VISUAL, EDITOR: process.env.EDITOR };
  afterEach(() => {
    process.env.VISUAL = saved.VISUAL;
    process.env.EDITOR = saved.EDITOR;
  });

  it('splits flags and prefers $VISUAL over $EDITOR', () => {
    process.env.EDITOR = 'vi';
    process.env.VISUAL = 'code --wait';
    expect(editorCommand()).toEqual({ cmd: 'code', args: ['--wait'] });
  });
});

describe('ArthaError surface', () => {
  it('certify failure is an ArthaError (actionable at the CLI top level)', () => {
    try {
      certifyDraft(proposed('decision.orphan'), { certifiedBy: 'X', certifiedAt: '2026-06-21' });
      throw new Error('expected throw');
    } catch (error) {
      expect(isArthaError(error)).toBe(true);
    }
  });
});
