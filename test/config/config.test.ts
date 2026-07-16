import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultConfig, loadConfig } from '../../src/config/config';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'artha-config-'));
  mkdirSync(join(tmp, '.artha'), { recursive: true });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeConfig(yaml: string): void {
  writeFileSync(join(tmp, '.artha', 'config.yaml'), yaml);
}

describe('loadConfig', () => {
  it('returns all defaults when no config.yaml exists', () => {
    expect(loadConfig(tmp)).toEqual(defaultConfig());
  });

  it('returns all defaults when the repo has no .artha at all', () => {
    expect(loadConfig(join(tmp, 'nope'))).toEqual(defaultConfig());
  });

  it('overrides only the fields present in a partial config', () => {
    writeConfig('default_severity: high\n');
    const config = loadConfig(tmp);
    expect(config.defaultSeverity).toBe('high');
    expect(config.sourceRoots).toEqual(['src']);
    expect(config.miner.model).toBe('claude-opus-4-8');
  });

  it('reads a full config', () => {
    writeConfig(
      [
        'source_roots:',
        '  - app',
        '  - lib',
        'default_severity: low',
        'codegraph_db: .codegraph/graph.db',
        'miner:',
        '  model: claude-haiku-4-5',
        '',
      ].join('\n'),
    );
    expect(loadConfig(tmp)).toEqual({
      sourceRoots: ['app', 'lib'],
      defaultSeverity: 'low',
      codegraphDb: '.codegraph/graph.db',
      miner: { engine: 'api', model: 'claude-haiku-4-5' },
      infer: { engine: 'api', model: 'claude-opus-4-8' },
      embeddings: { enabled: true, model: 'Xenova/all-MiniLM-L6-v2' },
    });
  });

  it('reads the infer engine + model (21b), ignoring an unknown engine', () => {
    writeConfig('infer:\n  engine: claude-cli\n  model: claude-opus-4-8\n');
    expect(loadConfig(tmp).infer).toEqual({ engine: 'claude-cli', model: 'claude-opus-4-8' });

    writeConfig('infer:\n  engine: bogus\n');
    expect(loadConfig(tmp).infer.engine).toBe('api'); // default retained
  });

  it('reads embeddings settings (enabled + model)', () => {
    writeConfig('embeddings:\n  enabled: false\n  model: custom/model\n');
    expect(loadConfig(tmp).embeddings).toEqual({ enabled: false, model: 'custom/model' });
  });

  it('reads the miner engine, ignoring an unknown value', () => {
    writeConfig('miner:\n  engine: claude-cli\n');
    expect(loadConfig(tmp).miner.engine).toBe('claude-cli');

    writeConfig('miner:\n  engine: bogus\n');
    expect(loadConfig(tmp).miner.engine).toBe('api');
  });

  it('ignores mistyped fields, falling back to defaults', () => {
    writeConfig('source_roots: "not-an-array"\ndefault_severity: bogus\n');
    const config = loadConfig(tmp);
    expect(config.sourceRoots).toEqual(['src']);
    expect(config.defaultSeverity).toBe('medium');
  });

  it('throws an ArthaError on malformed YAML', () => {
    writeConfig('default_severity: "unterminated\n');
    expect(() => loadConfig(tmp)).toThrowError(/Malformed \.artha\/config\.yaml/);
  });

  it('returns fresh objects with no shared mutable state', () => {
    const first = loadConfig(tmp);
    first.sourceRoots.push('mutated');
    expect(loadConfig(tmp).sourceRoots).toEqual(['src']);
  });
});
