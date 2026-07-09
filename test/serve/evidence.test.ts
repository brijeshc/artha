import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTreeSitterResolver } from '../../src/resolver/treeSitterResolver';
import { EVIDENCE_MAX_LINES, evidenceFor } from '../../src/serve/evidence';

describe('evidenceFor (D5 - the code a claim was read from)', () => {
  let repo: string;
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'artha-evidence-'));
    mkdirSync(join(repo, 'src', 'billing'), { recursive: true });
  });
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('returns the pinned symbol’s own source lines, with its real line span', async () => {
    writeFileSync(
      join(repo, 'src', 'billing', 'refund.ts'),
      'const TAX = 0.1;\n\nexport function issueRefund(cents: number): number {\n  return Math.round(cents * (1 + TAX));\n}\n',
    );
    const resolver = await createTreeSitterResolver(repo);

    const view = evidenceFor(resolver, 'src/billing/refund.ts#issueRefund');
    expect(view).not.toBeNull();
    if (!view) return;
    expect(view.path).toBe('src/billing/refund.ts');
    expect(view.symbol).toBe('issueRefund');
    // the function is declared on line 3 (1-based); its body ends on line 5
    expect(view.startLine).toBe(3);
    expect(view.endLine).toBe(5);
    expect(view.lines[0]).toContain('export function issueRefund');
    expect(view.lines.some((l) => l.includes('Math.round'))).toBe(true);
    // it shows only the symbol, not the whole file (the TAX const above is excluded)
    expect(view.lines.join('\n')).not.toContain('const TAX');
    expect(view.truncated).toBe(0);
  });

  it('caps a long symbol at the line limit and reports the honest remainder', async () => {
    const body = Array.from({ length: 90 }, (_, i) => `  const x${i} = ${i};`).join('\n');
    writeFileSync(
      join(repo, 'src', 'billing', 'big.ts'),
      `export function big(): void {\n${body}\n}\n`,
    );
    const resolver = await createTreeSitterResolver(repo);

    const view = evidenceFor(resolver, 'src/billing/big.ts#big');
    expect(view).not.toBeNull();
    if (!view) return;
    expect(view.lines.length).toBe(EVIDENCE_MAX_LINES);
    // the span is 92 lines (signature + 90 body + close); the cap omits the rest
    expect(view.truncated).toBe(92 - EVIDENCE_MAX_LINES);
  });

  it('returns null for a ref that no longer resolves (drifted / renamed code)', async () => {
    writeFileSync(join(repo, 'src', 'billing', 'refund.ts'), 'export function issueRefund() {}\n');
    const resolver = await createTreeSitterResolver(repo);
    expect(evidenceFor(resolver, 'src/billing/refund.ts#gone')).toBeNull();
    expect(evidenceFor(resolver, 'src/billing/missing.ts#whatever')).toBeNull();
  });
});
