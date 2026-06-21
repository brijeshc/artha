import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportAgentsMd } from '../../src/export/agentsMd';
import { writeFixtureIndex } from '../mcp/fixture';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'artha-export-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function exportWithFixture(): string {
  writeFixtureIndex(join(dir, '.artha', 'index.db'));
  const { outPath } = exportAgentsMd(dir);
  return readFileSync(outPath, 'utf8');
}

describe('exportAgentsMd', () => {
  it('writes a banner-marked AGENTS.md grouped by kind', () => {
    const md = exportWithFixture();
    expect(md).toMatch(/DO NOT EDIT/);
    expect(md).toContain('## Decisions');
    expect(md).toContain('## Invariants');
    expect(md).not.toContain('## Conventions'); // none certified in the fixture
  });

  it('includes certified decisions and invariants with their cross-links/scope', () => {
    const md = exportWithFixture();
    expect(md).toContain('### decision.money — Store money as integer minor units');
    expect(md).toContain('Represent money as integer cents');
    expect(md).toContain(
      '### invariant.no_float_money — No floating point for money (severity: high)',
    );
    expect(md).toContain('- why: `decision.money`');
    expect(md).toContain('- scope: `src/money.ts`');
    expect(md).toContain('- pins: `src/money.ts#round`');
  });

  it('excludes proposed and stale entries', () => {
    const md = exportWithFixture();
    expect(md).not.toContain('decision.draft'); // proposed
    expect(md).not.toContain('decision.old'); // stale
    expect(md).not.toContain('Adopt a decimal money library');
  });

  it('orders entries deterministically by id within a section', () => {
    const md = exportWithFixture();
    expect(md.indexOf('decision.dates')).toBeLessThan(md.indexOf('decision.money'));
  });

  it('is deterministic: re-export of unchanged input is byte-identical', () => {
    writeFixtureIndex(join(dir, '.artha', 'index.db'));
    const first = exportAgentsMd(dir);
    const a = readFileSync(first.outPath, 'utf8');
    const b = readFileSync(exportAgentsMd(dir).outPath, 'utf8');
    expect(a).toBe(b);
    expect(first.certified).toBe(3);
    expect(first.hadIndex).toBe(true);
  });

  it('honors a custom --out path', () => {
    writeFixtureIndex(join(dir, '.artha', 'index.db'));
    const out = join(dir, 'docs', 'AGENTS.md');
    const result = exportAgentsMd(dir, { out });
    expect(result.outPath).toBe(out);
    expect(existsSync(out)).toBe(true);
  });

  it('writes a valid, non-error empty-state file when nothing is certified', () => {
    const result = exportAgentsMd(dir); // no index built
    const md = readFileSync(result.outPath, 'utf8');
    expect(result.certified).toBe(0);
    expect(result.hadIndex).toBe(false);
    expect(md).toContain('# Product meaning (certified)');
    expect(md).toMatch(/No certified entries yet/);
  });
});
