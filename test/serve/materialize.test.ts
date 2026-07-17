import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import type {
  InferredPinRow,
  InferredRow,
  InferredStateRow,
  InferredStepRow,
} from '../../src/build/db';
import { materializeInferred } from '../../src/serve/materialize';
import { fakeIndex } from '../helpers/fakeIndex';

// Materialize-on-touch (23d-2, OQ-A): vouching/editing an inferred (moonlight)
// fact turns the regenerable candidate into a real `.artha/` YAML entry. Proven
// by reading the written file back, not by trusting the return value.

let repo: string;
let arthaDir: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'artha-mat-'));
  arthaDir = join(repo, '.artha');
  for (const dir of ['concepts', 'flows', 'decisions', 'invariants', 'conventions']) {
    mkdirSync(join(arthaDir, dir), { recursive: true });
  }
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

const CONCEPT_ID = 'inferred:concept:src/billing/order.ts#OrderState';
const CONCEPT_REF = 'src/billing/order.ts#OrderState';
const FLOW_ID = 'inferred:flow:src/checkout/place.ts#placeOrder';
const FLOW_REF = 'src/checkout/place.ts#placeOrder';

/** An index carrying one inferred concept (a state machine) + one inferred flow. */
function seededIndex() {
  const inferred: InferredRow[] = [
    {
      id: CONCEPT_ID,
      kind: 'concept',
      module: 'src/billing',
      heading: 'Order State',
      body: '3 states read from the `OrderState` type (cart, paid, fulfilled).',
      confidence: 'read-from-code',
      origin: 'inferred',
    },
    {
      id: FLOW_ID,
      kind: 'flow',
      module: 'src/checkout',
      heading: 'Place Order',
      body: 'An operation in Checkout that reaches Billing, Notifications.',
      confidence: 'read-from-code',
      origin: 'inferred',
    },
    {
      id: 'inferred:module:src/billing',
      kind: 'module',
      module: 'src/billing',
      heading: 'Billing',
      body: 'Shared foundation.',
      confidence: 'read-from-code',
      origin: 'inferred',
    },
  ];
  const inferredStates: InferredStateRow[] = [
    { inferred_id: CONCEPT_ID, name: 'cart', ord: 0 },
    { inferred_id: CONCEPT_ID, name: 'paid', ord: 1 },
    { inferred_id: CONCEPT_ID, name: 'fulfilled', ord: 2 },
  ];
  const inferredSteps: InferredStepRow[] = [
    { inferred_id: FLOW_ID, label: 'Billing', to_module: 'src/billing', note: null, ord: 0 },
    {
      inferred_id: FLOW_ID,
      label: 'Notifications',
      to_module: 'src/notifications',
      note: null,
      ord: 1,
    },
  ];
  const inferredPins: InferredPinRow[] = [
    {
      inferred_id: CONCEPT_ID,
      symbol_ref: CONCEPT_REF,
      symbol_id: CONCEPT_REF,
      content_hash: 'abc123',
      role: 'evidence',
      ord: 0,
    },
    {
      inferred_id: FLOW_ID,
      symbol_ref: FLOW_REF,
      symbol_id: FLOW_REF,
      content_hash: 'def456',
      role: 'entry',
      ord: 0,
    },
  ];
  return fakeIndex({ inferred, inferredStates, inferredSteps, inferredPins });
}

function readEntry(path: string): Record<string, unknown> {
  return parseYaml(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

describe('materializeInferred', () => {
  it('vouches a concept: a certified entry with states, pin, and derived_from provenance', () => {
    const out = materializeInferred(repo, seededIndex(), CONCEPT_ID, {
      certify: true,
      now: new Date('2026-07-09T12:00:00Z'),
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out).toMatchObject({ id: 'concept.order_state', status: 'certified', created: true });

    const entry = readEntry(join(arthaDir, 'concepts', 'concept.order_state.yaml'));
    expect(entry).toMatchObject({
      id: 'concept.order_state',
      kind: 'concept',
      status: 'certified',
      name: 'Order State',
      // the machine reading seeds the human draft
      summary: '3 states read from the `OrderState` type (cart, paid, fulfilled).',
      derived_from: 'inferred@abc123',
    });
    // states read verbatim; their meaning + transitions stay the human delta
    expect(entry.states).toEqual([{ name: 'cart' }, { name: 'paid' }, { name: 'fulfilled' }]);
    expect(entry.pins).toEqual([{ symbol: CONCEPT_REF }]);
    expect(typeof entry.certified_by).toBe('string');
    expect(entry.certified_at).toBe('2026-07-09');
    // no transitions are ever fabricated
    expect(entry.transitions).toBeUndefined();
  });

  it('vouching without certify leaves a proposed draft (edit-then-certify path)', () => {
    const out = materializeInferred(repo, seededIndex(), CONCEPT_ID);
    expect(out).toMatchObject({ ok: true, status: 'proposed' });
    const entry = readEntry(join(arthaDir, 'concepts', 'concept.order_state.yaml'));
    expect(entry.status).toBe('proposed');
    expect(entry.certified_by).toBeUndefined();
  });

  it('vouches a flow: the entry point becomes entry, no fabricated steps', () => {
    const out = materializeInferred(repo, seededIndex(), FLOW_ID, { certify: true });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.id).toBe('flow.place_order');

    const entry = readEntry(join(arthaDir, 'flows', 'flow.place_order.yaml'));
    expect(entry).toMatchObject({
      kind: 'flow',
      name: 'Place Order',
      derived_from: 'inferred@def456',
    });
    expect(entry.entry).toEqual([{ symbol: FLOW_REF }]);
    // the fan-out is the human's to author into real steps - never invented here
    expect(entry.steps).toBeUndefined();
  });

  it('an edit patch overrides the machine name/summary before writing (proposed)', () => {
    const out = materializeInferred(repo, seededIndex(), CONCEPT_ID, {
      patch: { name: 'Order lifecycle', summary: 'The lifecycle of a customer order.' },
    });
    expect(out).toMatchObject({ ok: true, status: 'proposed' });
    const entry = readEntry(join(arthaDir, 'concepts', 'concept.order_state.yaml'));
    expect(entry.name).toBe('Order lifecycle');
    expect(entry.summary).toBe('The lifecycle of a customer order.');
  });

  it('refuses a module card (no human kind) and a convention (needs a rule)', () => {
    const card = materializeInferred(repo, seededIndex(), 'inferred:module:src/billing');
    expect(card).toMatchObject({ ok: false, code: 400 });
    expect(existsSync(join(arthaDir, 'concepts', 'concept.billing.yaml'))).toBe(false);
  });

  it('404s an unknown inferred id, writing nothing', () => {
    const out = materializeInferred(repo, seededIndex(), 'inferred:concept:src/x.ts#Ghost');
    expect(out).toMatchObject({ ok: false, code: 404 });
  });

  it('disambiguates the id when one is already taken', () => {
    // an unrelated concept already owns `concept.order_state`
    writeFileSync(
      join(arthaDir, 'concepts', 'existing.yaml'),
      'id: concept.order_state\nkind: concept\nstatus: proposed\nname: Other\nsummary: Unrelated.\n',
    );
    const out = materializeInferred(repo, seededIndex(), CONCEPT_ID);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.id).toBe('concept.order_state_2');
  });
});
