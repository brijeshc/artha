import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initArtha } from '../../src/commands/init';
import { defaultConfig, loadConfig } from '../../src/config/config';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'artha-init-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('initArtha', () => {
  it('scaffolds the three kind dirs (each with .gitkeep) and a config.yaml', () => {
    const result = initArtha(tmp);
    expect(result.alreadyInitialized).toBe(false);
    for (const dir of ['decisions', 'invariants', 'conventions']) {
      expect(existsSync(join(tmp, '.artha', dir, '.gitkeep'))).toBe(true);
    }
    expect(existsSync(join(tmp, '.artha', 'config.yaml'))).toBe(true);
    expect(result.createdFiles).toContain('.artha/config.yaml');
  });

  it('writes a config.yaml that loads back as the defaults', () => {
    initArtha(tmp);
    expect(loadConfig(tmp)).toEqual(defaultConfig());
  });

  it('is idempotent: a second run creates nothing and reports already-initialized', () => {
    initArtha(tmp);
    const second = initArtha(tmp);
    expect(second.alreadyInitialized).toBe(true);
    expect(second.createdDirs).toEqual([]);
    expect(second.createdFiles).toEqual([]);
  });

  it('does not clobber an existing config or delete entries', () => {
    initArtha(tmp);
    const configPath = join(tmp, '.artha', 'config.yaml');
    const entryPath = join(tmp, '.artha', 'decisions', 'mine.yaml');
    writeFileSync(configPath, 'source_roots:\n  - custom\n');
    writeFileSync(entryPath, 'id: decision.x\n');

    initArtha(tmp);

    expect(readFileSync(configPath, 'utf8')).toBe('source_roots:\n  - custom\n');
    expect(existsSync(entryPath)).toBe(true);
    expect(loadConfig(tmp).sourceRoots).toEqual(['custom']);
  });

  it('fills in a missing kind dir on re-run (partial init)', () => {
    initArtha(tmp);
    rmSync(join(tmp, '.artha', 'invariants'), { recursive: true, force: true });

    const result = initArtha(tmp);
    expect(result.alreadyInitialized).toBe(true);
    expect(result.createdDirs).toContain('.artha/invariants/');
    expect(existsSync(join(tmp, '.artha', 'invariants', '.gitkeep'))).toBe(true);
  });
});
