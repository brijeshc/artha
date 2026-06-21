import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readLedger, recordMined } from '../../src/mine/ledger';

let arthaDir: string;

beforeEach(() => {
  arthaDir = mkdtempSync(join(tmpdir(), 'artha-ledger-'));
});

afterEach(() => {
  rmSync(arthaDir, { recursive: true, force: true });
});

describe('ledger', () => {
  it('returns an empty set when the ledger file is missing', () => {
    expect(readLedger(arthaDir).size).toBe(0);
  });

  it('records mined commits and reads them back as a SHA set', () => {
    recordMined(arthaDir, { short: 'abc123def456', outcome: 'drafted', decisionId: 'decision.x' });
    recordMined(arthaDir, { short: '0011aa22bb33', outcome: 'no-decision' });

    const shas = readLedger(arthaDir);
    expect(shas.has('abc123def456')).toBe(true);
    expect(shas.has('0011aa22bb33')).toBe(true);
    expect(shas.size).toBe(2);
  });

  it('writes a comment header that readLedger ignores', () => {
    recordMined(arthaDir, { short: 'abc123def456', outcome: 'drafted', decisionId: 'decision.x' });
    const text = readFileSync(join(arthaDir, '.mined'), 'utf8');
    expect(text.startsWith('#')).toBe(true);
    expect(text).toContain('abc123def456\tdrafted\tdecision.x');
  });

  it('ignores comment and blank lines on read', () => {
    writeFileSync(join(arthaDir, '.mined'), '# header\n\nabc123def456\tdrafted\n# trailing\n');
    expect([...readLedger(arthaDir)]).toEqual(['abc123def456']);
  });
});
