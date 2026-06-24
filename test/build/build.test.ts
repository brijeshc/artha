import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildIndex } from '../../src/build/build';
import { openIndex } from '../../src/build/db';
import { defaultConfig } from '../../src/config/config';
import { openArthaIndex } from '../../src/mcp/query';
import { loadEntries } from '../../src/schema/load';
import { fakeEmbedder } from '../helpers/fakeEmbedder';

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'artha-build-'));
  for (const dir of ['decisions', 'invariants', 'conventions', 'concepts', 'flows']) {
    mkdirSync(join(repo, '.artha', dir), { recursive: true });
  }
  mkdirSync(join(repo, 'src', 'billing'), { recursive: true });
  mkdirSync(join(repo, 'src', 'checkout'), { recursive: true });
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

const ORIGINAL_ADD = '    return new Money(this.amount + o.amount);';

function money(addBody: string): void {
  writeFileSync(
    join(repo, 'src', 'billing', 'Money.ts'),
    `export class Money {\n  add(o: Money): Money {\n${addBody}\n  }\n}\n`,
  );
}

function writeEntryFile(
  kind: 'decisions' | 'invariants' | 'conventions' | 'concepts' | 'flows',
  name: string,
  yaml: string,
): void {
  writeFileSync(join(repo, '.artha', kind, name), yaml);
}

const ORIGINAL_SUB = '  state(): string {\n    return this.value;\n  }';

/** A `Subscription` class whose body the concept pins to. */
function subscription(body: string): void {
  writeFileSync(
    join(repo, 'src', 'billing', 'Subscription.ts'),
    `export class Subscription {\n${body}\n}\n`,
  );
}

/** Two top-level functions a flow's entry + first step pin to. */
function checkout(): void {
  writeFileSync(
    join(repo, 'src', 'checkout', 'checkout.ts'),
    'export function startCheckout() {\n  return validateCart();\n}\n' +
      'export function validateCart() {\n  return true;\n}\n',
  );
}

/** A certified concept: 2 states, 1 transition, pinned to Subscription. */
function conceptYaml(): string {
  return [
    'id: concept.subscription',
    'kind: concept',
    'status: certified',
    'name: Subscription',
    'summary: A customer ongoing paid access to a plan; entitlement source of truth.',
    'states:',
    '  - name: active',
    '    invariant: currentPeriodEnd is in the future',
    '  - name: past_due',
    '    effect: entitlement retained for a 7-day grace window',
    'transitions:',
    '  - { from: active, to: past_due, trigger: invoice payment failed }',
    'pins:',
    '  - symbol: src/billing/Subscription.ts#Subscription',
    'certified_by: brijesh',
    'certified_at: 2026-06-24',
    '',
  ].join('\n');
}

/** A flow: an entry pin + 2 ordered steps, the second with pin: null. */
function flowYaml(): string {
  return [
    'id: flow.checkout',
    'kind: flow',
    'status: proposed',
    'name: Checkout',
    'summary: Turns a cart into a paid order.',
    'entry:',
    '  - symbol: src/checkout/checkout.ts#startCheckout',
    'steps:',
    '  - on: cart submitted',
    '    do: validate the cart',
    '    pin:',
    '      symbol: src/checkout/checkout.ts#validateCart',
    '  - do: create the order',
    '    pin: null',
    '',
  ].join('\n');
}

/** A certified decision pinned to Money.add, with a blank content_hash. */
function certifiedDecisionYaml(): string {
  return [
    'id: decision.money',
    'kind: decision',
    'status: certified',
    'title: Money as integer minor units',
    'context: rounding drift',
    'decision: Store money as integer minor units never floats.',
    'pins:',
    '  - symbol: src/billing/Money.ts#Money.add',
    'certified_by: brijesh',
    'certified_at: 2026-06-20',
    '',
  ].join('\n');
}

const dbPath = (): string => join(repo, '.artha', 'index.db');
const run = () => buildIndex(repo, defaultConfig());

function rows(sql: string, ...params: (string | number)[]): Record<string, unknown>[] {
  const db = openIndex(dbPath());
  try {
    return db.prepare(sql).all(...params) as Record<string, unknown>[];
  } finally {
    db.close();
  }
}

describe('buildIndex — emit', () => {
  it('succeeds with an empty index on an empty .artha (no error)', async () => {
    const report = await run();
    expect(report.errors).toEqual([]);
    expect(report.emitted).toBe(0);
    expect(existsSync(dbPath())).toBe(true);
    expect(rows('SELECT count(*) AS n FROM artha_facts')[0]?.n).toBe(0);
    // v0.2 tables are present-but-empty, never absent-erroring.
    for (const t of ['artha_states', 'artha_transitions', 'artha_flow_steps', 'artha_embeddings']) {
      expect(rows(`SELECT count(*) AS n FROM ${t}`)[0]?.n).toBe(0);
    }
  });

  it('embeds each fact with the given embedder, tagged with the model id (T14)', async () => {
    writeEntryFile('decisions', 'money.yaml', certifiedDecisionYaml());
    money(ORIGINAL_ADD);
    const emb = fakeEmbedder({}, { modelId: 'test-emb', dim: 4 });

    const report = await buildIndex(repo, defaultConfig(), { embedder: emb });
    expect(report.errors).toEqual([]);
    expect(report.embedded).toBe(1);

    const embeddings = rows('SELECT fact_id, model, dim FROM artha_embeddings');
    expect(embeddings[0]).toMatchObject({ fact_id: 'decision.money', model: 'test-emb', dim: 4 });

    // and the read layer exposes them as vectors + the model id
    const idx = openArthaIndex(dbPath());
    expect(idx.embeddingModel).toBe('test-emb');
    expect(idx.embeddings.get('decision.money')?.length).toBe(4);
    idx.close();
  });

  it('emits no embeddings when no embedder is given (hermetic default)', async () => {
    writeEntryFile('decisions', 'money.yaml', certifiedDecisionYaml());
    money(ORIGINAL_ADD);
    const report = await buildIndex(repo, defaultConfig());
    expect(report.embedded).toBe(0);
    expect(rows('SELECT count(*) AS n FROM artha_embeddings')[0]?.n).toBe(0);
  });

  it('validates, resolves a pin, fills the hash, and emits a searchable index', async () => {
    money(ORIGINAL_ADD);
    writeEntryFile('decisions', 'money.yaml', certifiedDecisionYaml());

    const report = await run();
    expect(report.errors).toEqual([]);
    expect(report.emitted).toBe(1);

    const facts = rows('SELECT * FROM artha_facts');
    expect(facts).toHaveLength(1);
    expect(facts[0]?.heading).toBe('Money as integer minor units');
    expect(facts[0]?.body).toContain('integer minor units');
    expect(facts[0]?.source_path).toBe('.artha/decisions/money.yaml');

    const pins = rows('SELECT * FROM artha_pins');
    expect(pins[0]?.symbol_ref).toBe('src/billing/Money.ts#Money.add');
    expect(pins[0]?.symbol_id).toBe('src/billing/Money.ts#Money.add');
    expect(pins[0]?.content_hash).toMatch(/^[0-9a-f]{6}$/);
    expect(pins[0]?.is_stale).toBe(0);

    const hits = rows("SELECT id FROM artha_fts WHERE artha_fts MATCH 'minor'");
    expect(hits.map((r) => r.id)).toContain('decision.money');
  });

  it('expands scope into files, stores provenance, and warns on a dangling ref', async () => {
    money(ORIGINAL_ADD);
    writeEntryFile(
      'invariants',
      'money.yaml',
      [
        'id: invariant.money',
        'kind: invariant',
        'status: proposed',
        'name: Money is integer minor units',
        'rule: All money is integer minor units.',
        'scope:',
        '  - "src/**/*.ts"',
        'why: decision.missing',
        'mined_from: { commit: abc123 }',
        '',
      ].join('\n'),
    );

    const report = await run();
    expect(report.errors).toEqual([]);
    expect(report.warnings.some((w) => w.includes("dangling reference 'decision.missing'"))).toBe(
      true,
    );

    const scope = rows('SELECT file_path FROM artha_scope_files');
    expect(scope.map((r) => r.file_path)).toContain('src/billing/Money.ts');
    const prov = rows('SELECT ref_kind, ref FROM artha_provenance');
    expect(prov[0]).toMatchObject({ ref_kind: 'commit', ref: 'abc123' });
  });
});

describe('buildIndex — pins & staleness', () => {
  it('fails the build, naming the ref, when a pin does not resolve', async () => {
    money(ORIGINAL_ADD);
    writeEntryFile(
      'decisions',
      'bad.yaml',
      [
        'id: decision.bad',
        'kind: decision',
        'status: proposed',
        'title: Bad pin',
        'context: c',
        'decision: d',
        'pins:',
        '  - symbol: src/billing/Money.ts#Money.doesNotExist',
        '',
      ].join('\n'),
    );

    const report = await run();
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain('Money.doesNotExist');
    expect(report.emitted).toBe(0);
    expect(existsSync(dbPath())).toBe(false); // no index emitted on failure
  });

  it('flips a certified entry to stale on disk when the pinned logic changes', async () => {
    money(ORIGINAL_ADD);
    writeEntryFile('decisions', 'money.yaml', certifiedDecisionYaml());

    const first = await run();
    expect(first.staled).toEqual([]); // blank hash filled, no flip

    money('    return new Money(this.amount + o.amount + 1);'); // logic change
    const second = await run();

    expect(second.staled).toContain('decision.money');
    expect(loadEntries(join(repo, '.artha')).entries[0]?.status).toBe('stale');
    const pins = rows('SELECT is_stale FROM artha_pins');
    expect(pins[0]?.is_stale).toBe(1);
  });

  it('does NOT flip on a reformat-only change to the pinned symbol', async () => {
    money(ORIGINAL_ADD);
    writeEntryFile('decisions', 'money.yaml', certifiedDecisionYaml());
    await run();

    // same logic, different whitespace / blank lines
    money('\n        return new Money(this.amount  +  o.amount);\n');
    const report = await run();

    expect(report.staled).toEqual([]);
    expect(loadEntries(join(repo, '.artha')).entries[0]?.status).toBe('certified');
    expect(rows('SELECT status FROM artha_facts')[0]?.status).toBe('certified');
  });

  it('clears stale when a drifted entry is re-certified', async () => {
    money(ORIGINAL_ADD);
    writeEntryFile('decisions', 'money.yaml', certifiedDecisionYaml());
    await run();
    money('    return new Money(this.amount + o.amount + 1);');
    await run(); // → stale, with the drifted hash now stored

    // simulate `artha review` re-certifying: flip status back to certified
    const file = join(repo, '.artha', 'decisions', 'money.yaml');
    writeFileSync(file, readFileSync(file, 'utf8').replace('status: stale', 'status: certified'));

    const report = await run(); // code unchanged since → stored hash matches
    expect(report.staled).toEqual([]);
    expect(rows('SELECT status FROM artha_facts')[0]?.status).toBe('certified');
    expect(rows('SELECT is_stale FROM artha_pins')[0]?.is_stale).toBe(0);
  });
});

describe('buildIndex — concepts & flows (v0.2)', () => {
  it('indexes a concept (states/transitions) and a flow (steps incl. pin: null)', async () => {
    subscription(ORIGINAL_SUB);
    checkout();
    writeEntryFile('concepts', 'subscription.yaml', conceptYaml());
    writeEntryFile('flows', 'checkout.yaml', flowYaml());

    const report = await run();
    expect(report.errors).toEqual([]);
    expect(report.emitted).toBe(2);

    // base fact row: heading = name, body = summary
    const concept = rows("SELECT heading, body FROM artha_facts WHERE id = 'concept.subscription'");
    expect(concept[0]?.heading).toBe('Subscription');
    expect(concept[0]?.body).toContain('entitlement source of truth');

    // state machine, in authored order
    const states = rows(
      "SELECT name, effect, invariant, ord FROM artha_states WHERE fact_id = 'concept.subscription' ORDER BY ord",
    );
    expect(states).toEqual([
      { name: 'active', effect: null, invariant: 'currentPeriodEnd is in the future', ord: 0 },
      {
        name: 'past_due',
        effect: 'entitlement retained for a 7-day grace window',
        invariant: null,
        ord: 1,
      },
    ]);
    const transitions = rows(
      "SELECT from_state, to_state, trigger, ord FROM artha_transitions WHERE fact_id = 'concept.subscription'",
    );
    expect(transitions).toEqual([
      { from_state: 'active', to_state: 'past_due', trigger: 'invoice payment failed', ord: 0 },
    ]);

    // flow sequence: second step is not yet linked (pin_symbol_ref null)
    const steps = rows(
      "SELECT on_event, do_action, pin_symbol_ref, ord FROM artha_flow_steps WHERE fact_id = 'flow.checkout' ORDER BY ord",
    );
    expect(steps).toEqual([
      {
        on_event: 'cart submitted',
        do_action: 'validate the cart',
        pin_symbol_ref: 'src/checkout/checkout.ts#validateCart',
        ord: 0,
      },
      { on_event: null, do_action: 'create the order', pin_symbol_ref: null, ord: 1 },
    ]);

    // every resolved pin — concept pin, flow entry, flow step — lands in artha_pins
    const pinRefs = rows('SELECT fact_id, symbol_ref FROM artha_pins ORDER BY fact_id, symbol_ref');
    expect(pinRefs).toEqual([
      { fact_id: 'concept.subscription', symbol_ref: 'src/billing/Subscription.ts#Subscription' },
      { fact_id: 'flow.checkout', symbol_ref: 'src/checkout/checkout.ts#startCheckout' },
      { fact_id: 'flow.checkout', symbol_ref: 'src/checkout/checkout.ts#validateCart' },
    ]);
  });

  it('fails the build, naming the ref, when a flow step pin does not resolve', async () => {
    checkout();
    writeEntryFile(
      'flows',
      'bad.yaml',
      [
        'id: flow.bad',
        'kind: flow',
        'status: proposed',
        'name: Bad',
        'summary: a flow with an unresolvable step pin',
        'steps:',
        '  - do: do a thing',
        '    pin:',
        '      symbol: src/checkout/checkout.ts#nope',
        '',
      ].join('\n'),
    );

    const report = await run();
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain('checkout.ts#nope');
    expect(report.emitted).toBe(0);
    expect(existsSync(dbPath())).toBe(false);
  });

  it('flips a certified concept to stale when its pinned symbol drifts', async () => {
    subscription(ORIGINAL_SUB);
    writeEntryFile('concepts', 'subscription.yaml', conceptYaml());

    const first = await run();
    expect(first.staled).toEqual([]); // blank hash filled, no flip

    subscription('  state(): string {\n    return this.value + 1;\n  }'); // logic change
    const second = await run();

    expect(second.staled).toContain('concept.subscription');
    expect(loadEntries(join(repo, '.artha')).entries[0]?.status).toBe('stale');
    expect(
      rows("SELECT status FROM artha_facts WHERE id = 'concept.subscription'")[0]?.status,
    ).toBe('stale');
  });

  it('makes a concept searchable by a word in its summary', async () => {
    subscription(ORIGINAL_SUB);
    writeEntryFile('concepts', 'subscription.yaml', conceptYaml());
    await run();

    const hits = rows("SELECT id FROM artha_fts WHERE artha_fts MATCH 'entitlement'");
    expect(hits.map((r) => r.id)).toContain('concept.subscription');
  });
});
