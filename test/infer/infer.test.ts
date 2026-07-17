import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildIndex } from '../../src/build/build';
import { openIndex } from '../../src/build/db';
import { defaultConfig } from '../../src/config/config';
import { readSynthCache } from '../../src/infer/cache';
import { infer } from '../../src/infer/infer';
import type {
  Inferrer,
  SynthInput,
  SynthResult,
  SynthStepText,
  SynthTransition,
} from '../../src/infer/inferrer';

/**
 * Stub synthesizer: enriches every candidate with a plain, grounded summary by
 * default. `falseFor` plants an ungrounded claim (a mechanism absent from the
 * code) for one heading - the verifier must catch it; `declineFor` refuses one.
 */
class StubInferrer implements Inferrer {
  readonly calls: SynthInput[] = [];
  constructor(private readonly opts: { falseFor?: string; declineFor?: string } = {}) {}
  async synthesize(input: SynthInput): Promise<SynthResult> {
    this.calls.push(input);
    if (input.heading === this.opts.declineFor) return { enriched: false };
    const summary =
      input.heading === this.opts.falseFor
        ? 'Stores everything in `DynamoDB` under the hood.' // ungrounded on purpose
        : 'A clear plain-language description of this unit.';
    // Describe each reached module in plain (grounded) words - plus one entry
    // keyed to a module the flow does NOT reach, to prove alignment drops it.
    const steps: SynthStepText[] = [
      ...(input.steps ?? []).map((s) => ({ module: s.module, text: `does work in ${s.label}` })),
      { module: 'src/nowhere', text: 'a step for a module never reached' },
    ];
    // Propose one transition between real states, plus one to a fabricated state,
    // to prove the caller drops the fabricated edge before storage (21b-2).
    const members = input.members ?? [];
    const transitions: SynthTransition[] =
      members.length >= 2
        ? [
            { from: members[0] as string, to: members[1] as string, trigger: 'the state advances' },
            { from: members[0] as string, to: 'ghost_state', trigger: 'a fabricated edge' },
          ]
        : [];
    return { enriched: true, name: `${input.heading} (clarified)`, summary, steps, transitions };
  }
}

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'artha-infer-'));
  for (const dir of ['decisions', 'invariants', 'conventions', 'concepts', 'flows']) {
    mkdirSync(join(repo, '.artha', dir), { recursive: true });
  }
  mkdirSync(join(repo, 'src', 'billing'), { recursive: true });
  mkdirSync(join(repo, 'src', 'checkout'), { recursive: true });
  writeFileSync(
    join(repo, 'src', 'billing', 'order.ts'),
    "export type OrderState = 'cart' | 'paid' | 'shipped';\n",
  );
  writeFileSync(
    join(repo, 'src', 'billing', 'pay.ts'),
    'export function charge() {}\nexport function refundCharge() {}\n',
  );
  writeCheckout('  charge();\n');
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

/** The cross-module flow entry point; body varies so a drift can be simulated. */
function writeCheckout(body: string): void {
  writeFileSync(
    join(repo, 'src', 'checkout', 'checkout.ts'),
    `import { charge } from '../billing/pay';\nexport function placeOrder() {\n${body}}\n`,
  );
}

const config = () => defaultConfig();
const inferred = (): Record<string, unknown>[] => {
  const db = openIndex(join(repo, '.artha', 'index.db'));
  try {
    return db.prepare('SELECT id, heading, body, confidence FROM artha_inferred').all() as Record<
      string,
      unknown
    >[];
  } finally {
    db.close();
  }
};
const factById = (id: string): Record<string, unknown> | undefined =>
  inferred().find((r) => r.id === id);

/** The synthesized note on one flow step (21b-2), read straight from the index. */
const stepNote = (flowId: string, module: string): unknown => {
  const db = openIndex(join(repo, '.artha', 'index.db'));
  try {
    const row = db
      .prepare('SELECT note FROM artha_inferred_steps WHERE inferred_id = ? AND to_module = ?')
      .get(flowId, module) as { note: unknown } | undefined;
    return row?.note ?? null;
  } finally {
    db.close();
  }
};

/** The transitions stored for a concept (21b-2), read straight from the index. */
const transitionRows = (
  conceptId: string,
): Array<{ from_state: string; to_state: string; trigger: string }> => {
  const db = openIndex(join(repo, '.artha', 'index.db'));
  try {
    return db
      .prepare(
        'SELECT from_state, to_state, trigger FROM artha_inferred_transitions WHERE inferred_id = ? ORDER BY ord',
      )
      .all(conceptId) as Array<{ from_state: string; to_state: string; trigger: string }>;
  } finally {
    db.close();
  }
};

const BILLING_CARD = 'inferred:module:src/billing';
const ORDER_CONCEPT = 'inferred:concept:src/billing/order.ts#OrderState';
const PLACE_FLOW = 'inferred:flow:src/checkout/checkout.ts#placeOrder';

describe('infer (21b synthesis pipeline)', () => {
  it('synthesizes every candidate and writes a verified cache', async () => {
    const stub = new StubInferrer();
    const report = await infer(repo, config(), { inferrer: stub, maxFacts: 0 });

    expect(report.candidates).toBe(4); // 2 module cards + 1 concept + 1 flow
    expect(report.synthesized).toHaveLength(4);
    expect(report.declined).toBe(0);
    expect(report.downgraded).toBe(0);

    const cache = readSynthCache(join(repo, '.artha'));
    expect(cache.get(BILLING_CARD)).toMatchObject({
      name: 'Billing (clarified)',
      confidence: 'inferred',
    });
    // it saw all four kinds, each with resolvable evidence to ground on
    expect(new Set(stub.calls.map((c) => c.kind))).toEqual(new Set(['module', 'concept', 'flow']));
    expect(stub.calls.every((c) => c.evidence.length > 0)).toBe(true);
  });

  it('downgrades a planted false claim to uncertain, keeping a grounded one inferred', async () => {
    const report = await infer(repo, config(), {
      inferrer: new StubInferrer({ falseFor: 'Billing' }),
    });

    expect(report.downgraded).toBe(1);
    const cache = readSynthCache(join(repo, '.artha'));
    expect(cache.get(BILLING_CARD)?.confidence).toBe('uncertain'); // caught
    expect(cache.get('inferred:module:src/checkout')?.confidence).toBe('inferred'); // grounded
  });

  it('is incremental: a second run reuses unchanged candidates for zero spend', async () => {
    await infer(repo, config(), { inferrer: new StubInferrer() });
    const second = new StubInferrer();
    const report = await infer(repo, config(), { inferrer: second });

    expect(report.reused).toBe(4);
    expect(report.synthesized).toHaveLength(0);
    expect(second.calls).toHaveLength(0); // nothing re-sent to the engine
  });

  it('honors the spend cap, leaving the rest for a later run', async () => {
    const stub = new StubInferrer();
    const report = await infer(repo, config(), { inferrer: stub, maxFacts: 1 });

    expect(report.synthesized).toHaveLength(1);
    expect(report.remaining).toBe(3);
    expect(stub.calls).toHaveLength(1);
    expect(readSynthCache(join(repo, '.artha')).size).toBe(1); // partial cache persisted
  });

  it('previews with --dry-run without an engine or credentials', async () => {
    // No inferrer injected: dry-run must return before any engine is built.
    const report = await infer(repo, config(), { dryRun: true });
    expect(report.remaining).toBe(4);
    expect(report.synthesized).toHaveLength(0);
    expect(existsSync(join(repo, '.artha', '.inferred.json'))).toBe(false);
  });

  it('leaves a declined candidate on its 21a text', async () => {
    const report = await infer(repo, config(), {
      inferrer: new StubInferrer({ declineFor: 'Place Order' }),
    });
    expect(report.declined).toBe(1);
    expect(readSynthCache(join(repo, '.artha')).has(PLACE_FLOW)).toBe(false);
  });

  it('synthesizes a flow’s per-step text, dropping steps for modules it never reaches (21b-2)', async () => {
    await infer(repo, config(), { inferrer: new StubInferrer() });
    // the flow reaches src/billing only; the stub's stray src/nowhere step is dropped
    expect(readSynthCache(join(repo, '.artha')).get(PLACE_FLOW)?.steps).toEqual([
      { module: 'src/billing', text: 'does work in Billing' },
    ]);
  });

  it('synthesizes a concept’s transitions, dropping edges to fabricated states (21b-2)', async () => {
    await infer(repo, config(), { inferrer: new StubInferrer() });
    // the stub proposes cart→paid (real states) and cart→ghost_state (fabricated);
    // only the edge between two real states survives alignment
    expect(readSynthCache(join(repo, '.artha')).get(ORDER_CONCEPT)?.transitions).toEqual([
      { from: 'cart', to: 'paid', trigger: 'the state advances' },
    ]);
  });
});

describe('build overlays synthesis (21b) and reverts on drift (D12)', () => {
  it('without infer, the indexed layer stays deterministic 21a', async () => {
    const report = await buildIndex(repo, config());
    expect(report.enriched).toBe(0);
    expect(inferred().every((r) => r.confidence === 'read-from-code')).toBe(true);
  });

  it('overlays the enriched name, prose, and confidence after infer', async () => {
    await infer(repo, config(), { inferrer: new StubInferrer() });
    const report = await buildIndex(repo, config());

    expect(report.enriched).toBe(4);
    expect(factById(BILLING_CARD)).toMatchObject({
      heading: 'Billing (clarified)',
      body: 'A clear plain-language description of this unit.',
      confidence: 'inferred',
    });
  });

  it('silently reverts a drifted fact to 21a text while unchanged facts stay enriched', async () => {
    await infer(repo, config(), { inferrer: new StubInferrer() });
    await buildIndex(repo, config());

    // The flow's pinned entry point changes; the billing files do not.
    writeCheckout('  charge();\n  return true;\n');
    const report = await buildIndex(repo, config()); // rebuild WITHOUT re-infer

    // drifted: the flow falls back to its deterministic name + tier
    expect(factById(PLACE_FLOW)).toMatchObject({
      heading: 'Place Order',
      confidence: 'read-from-code',
    });
    // untouched: the concept (a billing file) keeps its enrichment
    expect(factById(ORDER_CONCEPT)).toMatchObject({
      heading: 'Order State (clarified)',
      confidence: 'inferred',
    });
    // two facts pin the changed placeOrder - the flow and the checkout module
    // card - so both revert; the two billing facts stay enriched.
    expect(report.enriched).toBe(2);
  });

  it('overlays flow step text into the index and reverts it on drift (21b-2)', async () => {
    await infer(repo, config(), { inferrer: new StubInferrer() });
    await buildIndex(repo, config());
    expect(stepNote(PLACE_FLOW, 'src/billing')).toBe('does work in Billing');

    // the flow's pinned entry changes → its step note reverts to bare label
    writeCheckout('  charge();\n  return true;\n');
    await buildIndex(repo, config());
    expect(stepNote(PLACE_FLOW, 'src/billing')).toBeNull();
  });

  it('overlays concept transitions into the index and reverts them on drift (21b-2)', async () => {
    await infer(repo, config(), { inferrer: new StubInferrer() });
    await buildIndex(repo, config());
    expect(transitionRows(ORDER_CONCEPT)).toEqual([
      { from_state: 'cart', to_state: 'paid', trigger: 'the state advances' },
    ]);

    // the concept's declaration changes → its transitions revert (D12), 21a emits none
    writeFileSync(
      join(repo, 'src', 'billing', 'order.ts'),
      "export type OrderState = 'cart' | 'paid' | 'shipped' | 'refunded';\n",
    );
    await buildIndex(repo, config());
    expect(transitionRows(ORDER_CONCEPT)).toEqual([]);
  });
});
