import { describe, expect, it } from 'vitest';
import {
  MAX_EVIDENCE_CHARS,
  type SynthInput,
  parseSynthResponse,
  renderSynthPrompt,
} from '../../src/infer/inferrer';
import { isArthaError } from '../../src/util/error';

describe('parseSynthResponse', () => {
  it('parses a clean enriched response', () => {
    const r = parseSynthResponse(
      '{"enriched": true, "name": "Refund a purchase", "summary": "Reverses a charge.", "steps": []}',
    );
    expect(r).toEqual({
      enriched: true,
      name: 'Refund a purchase',
      summary: 'Reverses a charge.',
      steps: [],
    });
  });

  it('reads a flow’s per-step text, dropping malformed entries (21b-2)', () => {
    const r = parseSynthResponse(
      '{"enriched": true, "name": "Place order", "summary": "S", "steps": [' +
        '{"module": "src/billing", "text": "charges the card"}, {"module": "src/x"}]}',
    );
    if (!('steps' in r)) throw new Error('expected enriched');
    expect(r.steps).toEqual([{ module: 'src/billing', text: 'charges the card' }]);
  });

  it('reads enriched=false as an honest refusal', () => {
    expect(parseSynthResponse('{"enriched": false, "name": "", "summary": ""}')).toEqual({
      enriched: false,
    });
  });

  it('downgrades a claimed enrichment missing its name or summary to a refusal', () => {
    expect(parseSynthResponse('{"enriched": true, "name": "X", "summary": ""}')).toEqual({
      enriched: false,
    });
  });

  it('tolerates markdown fences and surrounding prose (the CLI engine wraps output)', () => {
    const wrapped =
      'Here you go:\n```json\n{"enriched": true, "name": "Order lifecycle", "summary": "States."}\n```';
    expect(parseSynthResponse(wrapped)).toEqual({
      enriched: true,
      name: 'Order lifecycle',
      summary: 'States.',
      steps: [],
    });
  });

  it('throws an ArthaError on non-JSON output', () => {
    try {
      parseSynthResponse('not json at all');
      throw new Error('expected a throw');
    } catch (e) {
      expect(isArthaError(e)).toBe(true);
    }
  });
});

describe('renderSynthPrompt', () => {
  const base: SynthInput = {
    kind: 'concept',
    heading: 'Order State',
    body: '3 states read from code.',
    evidence: [{ ref: 'src/o.ts#OrderState', path: 'src/o.ts', lines: ['type OrderState = ...'] }],
  };

  it('carries the draft and its pinned evidence', () => {
    const prompt = renderSynthPrompt(base);
    expect(prompt).toContain('Unit kind: concept');
    expect(prompt).toContain('Order State');
    expect(prompt).toContain('src/o.ts#OrderState');
    expect(prompt).toContain('type OrderState = ...');
  });

  it('says so plainly when there is no resolvable source', () => {
    expect(renderSynthPrompt({ ...base, evidence: [] })).toContain('no resolvable source');
  });

  it('asks for per-module descriptions when a flow reaches modules (21b-2)', () => {
    const prompt = renderSynthPrompt({
      ...base,
      kind: 'flow',
      steps: [{ module: 'src/billing', label: 'Billing' }],
    });
    expect(prompt).toContain('Reaches');
    expect(prompt).toContain('src/billing (Billing)');
  });

  it('truncates oversized evidence with a marker', () => {
    const huge = 'x'.repeat(MAX_EVIDENCE_CHARS + 500);
    const prompt = renderSynthPrompt({
      ...base,
      evidence: [{ ref: 'a#b', path: 'a', lines: [huge] }],
    });
    expect(prompt).toContain('[evidence truncated]');
  });
});
