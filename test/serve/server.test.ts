import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type IndexData, writeIndex } from '../../src/build/db';
import { defaultConfig } from '../../src/config/config';
import { type ServeHandle, serve } from '../../src/serve/server';

let repo: string;
let server: ServeHandle | undefined;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'artha-serve-'));
  mkdirSync(join(repo, 'src', 'billing'), { recursive: true });
  mkdirSync(join(repo, '.artha'), { recursive: true });
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  rmSync(repo, { recursive: true, force: true });
});

const dbPath = () => join(repo, '.artha', 'index.db');

/** An index with one certified concept pinned into src/billing. */
function indexWith(headings: string[]): IndexData {
  return {
    facts: headings.map((h, i) => ({
      id: `concept.c${i}`,
      kind: 'concept',
      status: 'certified',
      heading: h,
      body: `summary of ${h}`,
      severity: null,
      why: null,
      supersedes: null,
      certified_by: 'ada',
      certified_at: '2026-06-24',
      source_path: `.artha/concepts/c${i}.yaml`,
    })),
    pins: headings.map((_, i) => ({
      fact_id: `concept.c${i}`,
      symbol_id: `src/billing/C${i}.ts#C${i}`,
      symbol_ref: `src/billing/C${i}.ts#C${i}`,
      content_hash: 'h',
      is_stale: 0,
    })),
    scopeFiles: [],
    related: [],
    provenance: [],
    detect: [],
    states: [],
    transitions: [],
    flowSteps: [],
    embeddings: [],
  };
}

async function boot(): Promise<string> {
  // ARTHA_WEB_DIR points at a dir with no index.html → deterministic placeholder.
  server = await serve({
    repoRoot: repo,
    config: defaultConfig(),
    port: 0,
    webDir: join(repo, 'nope'),
  });
  return server.url;
}

describe('artha serve', () => {
  it('boots on localhost and serves the map API against the index', async () => {
    writeIndex(dbPath(), indexWith(['Invoice']));
    const url = await boot();

    const res = await fetch(`${url}/api/map`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');

    const feed = (await res.json()) as {
      cold: boolean;
      modules: Array<{ module: string; dark: boolean }>;
    };
    expect(feed.cold).toBe(false);
    expect(feed.modules.find((m) => m.module === 'src/billing')?.dark).toBe(false);
  });

  it('cold start (no index file) → a valid mostly-dark map, HTTP 200', async () => {
    const url = await boot(); // no writeIndex → .artha/index.db absent

    const res = await fetch(`${url}/api/map`);
    expect(res.status).toBe(200);
    const feed = (await res.json()) as { cold: boolean; modules: Array<{ dark: boolean }> };
    expect(feed.cold).toBe(true);
    expect(feed.modules.every((m) => m.dark)).toBe(true);
  });

  it('reflects a fresh build on the next request without a restart', async () => {
    writeIndex(dbPath(), indexWith(['Invoice']));
    const url = await boot();

    const first = (await (await fetch(`${url}/api/search?q=invoice`)).json()) as Array<{
      id: string;
    }>;
    expect(first.map((h) => h.id)).toContain('concept.c0');

    // simulate a re-`artha build` while the server stays up
    writeIndex(dbPath(), indexWith(['Invoice', 'Refund']));
    const refund = (await (await fetch(`${url}/api/search?q=refund`)).json()) as Array<{
      id: string;
    }>;
    expect(refund.map((h) => h.id)).toContain('concept.c1');
  });

  it('serves a placeholder page at / when the bundle is not built', async () => {
    const url = await boot();
    const res = await fetch(`${url}/`);
    const html = await res.text();
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('Artha');
  });

  it('serves the built bundle (index.html + nested assets) and blocks traversal', async () => {
    const web = join(repo, 'web');
    mkdirSync(join(web, 'assets'), { recursive: true });
    writeFileSync(join(web, 'index.html'), '<!doctype html><title>App</title>');
    writeFileSync(join(web, 'assets', 'app.js'), 'console.log(1)');
    server = await serve({ repoRoot: repo, config: defaultConfig(), port: 0, webDir: web });

    const root = await fetch(`${server.url}/`);
    expect(root.status).toBe(200);
    expect(await root.text()).toContain('App');

    const asset = await fetch(`${server.url}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('text/javascript');

    // path traversal stays contained (raw %2f so fetch doesn't normalize it away)
    expect((await fetch(`${server.url}/..%2f..%2fpackage.json`)).status).toBe(403);
  });

  it('404s an unknown concept and rejects non-GET', async () => {
    writeIndex(dbPath(), indexWith(['Invoice']));
    const url = await boot();

    expect((await fetch(`${url}/api/concept/concept.nope`)).status).toBe(404);
    expect((await fetch(`${url}/api/map`, { method: 'POST' })).status).toBe(405);
  });
});

describe('artha serve — curation writes (T17)', () => {
  /** Seed a `.artha/concepts/*.yaml` entry (the source of truth writes land in). */
  function seedConcept(file: string, obj: Record<string, unknown>): void {
    mkdirSync(join(repo, '.artha', 'concepts'), { recursive: true });
    writeFileSync(
      join(repo, '.artha', 'concepts', `${file}.yaml`),
      Object.entries(obj)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join('\n'),
      'utf8',
    );
  }

  const proposed = (id: string, name: string) => ({
    id,
    kind: 'concept',
    status: 'proposed',
    name,
    summary: `${name} summary.`,
  });

  function post(url: string, path: string, body: unknown): Promise<Response> {
    return fetch(`${url}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const getJson = async (url: string, path: string): Promise<Record<string, unknown>> =>
    (await (await fetch(`${url}${path}`)).json()) as Record<string, unknown>;

  it('certifies via POST and the next read reflects it (git-diff on disk)', async () => {
    seedConcept('sub', proposed('concept.sub', 'Subscription'));
    const url = await boot();

    const res = await post(url, '/api/certify', { id: 'concept.sub' });
    expect(res.status).toBe(200);

    const detail = await getJson(url, '/api/concept/concept.sub');
    expect(detail.status).toBe('certified');
    expect(detail.certifiedBy).toBeTruthy();

    // the mutation is a plain YAML file (a git diff), not just an index row
    const yaml = readFileSync(join(repo, '.artha', 'concepts', 'sub.yaml'), 'utf8');
    expect(yaml).toContain('status: certified');
    expect(yaml).toContain('certified_by:');
  });

  it('links a resolvable symbol via POST and the concept shows the pin', async () => {
    seedConcept('sub', proposed('concept.sub', 'Subscription'));
    writeFileSync(join(repo, 'src', 'billing', 'Sub.ts'), 'export class Sub {}\n');
    const url = await boot();

    const res = await post(url, '/api/pin', {
      id: 'concept.sub',
      symbol: 'src/billing/Sub.ts#Sub',
    });
    expect(res.status).toBe(200);

    const detail = await getJson(url, '/api/concept/concept.sub');
    const pins = (detail.pins as Array<{ symbol: string }>).map((p) => p.symbol);
    expect(pins).toContain('src/billing/Sub.ts#Sub');
  });

  it('refuses a write without a JSON content-type (cross-site form guard)', async () => {
    seedConcept('sub', proposed('concept.sub', 'Subscription'));
    const url = await boot();

    // what a cross-origin <form> or no-preflight fetch can actually send
    const res = await fetch(`${url}/api/certify`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ id: 'concept.sub' }),
    });
    expect(res.status).toBe(415);
    expect(readFileSync(join(repo, '.artha', 'concepts', 'sub.yaml'), 'utf8')).toContain(
      'status: "proposed"',
    );
  });

  it('refuses an unresolvable pin with 400 and writes nothing', async () => {
    seedConcept('sub', proposed('concept.sub', 'Subscription'));
    const url = await boot();

    const res = await post(url, '/api/pin', {
      id: 'concept.sub',
      symbol: 'src/billing/Sub.ts#Ghost',
    });
    expect(res.status).toBe(400);
    expect(readFileSync(join(repo, '.artha', 'concepts', 'sub.yaml'), 'utf8')).not.toContain(
      'pins',
    );
  });

  it('edits via POST /api/entry (un-certifies) and rejects a schema-breaking edit', async () => {
    seedConcept('sub', {
      ...proposed('concept.sub', 'Subscription'),
      status: 'certified',
      certified_by: 'ada',
      certified_at: '2026-06-01',
    });
    const url = await boot();

    const ok = await post(url, '/api/entry', { id: 'concept.sub', summary: 'A clearer summary.' });
    expect(ok.status).toBe(200);
    const d1 = await getJson(url, '/api/concept/concept.sub');
    expect(d1.summary).toBe('A clearer summary.');
    expect(d1.status).toBe('proposed'); // editing content un-certifies

    const bad = await post(url, '/api/entry', { id: 'concept.sub', summary: 42 });
    expect(bad.status).toBe(422);
  });

  it('serves symbol candidates for the link picker (search-and-pick)', async () => {
    writeFileSync(join(repo, 'src', 'billing', 'Money.ts'), 'export class Money {}\n');
    const url = await boot();

    const res = await fetch(`${url}/api/symbols?q=money`);
    expect(res.status).toBe(200);
    const hits = (await res.json()) as Array<{ ref: string; name: string; kind: string }>;
    expect(hits.map((h) => h.ref)).toContain('src/billing/Money.ts#Money');

    // a blank query returns nothing (the picker prompts you to type)
    const empty = (await (await fetch(`${url}/api/symbols?q=`)).json()) as unknown[];
    expect(empty).toEqual([]);
  });

  it('serializes concurrent writes so both are applied', async () => {
    seedConcept('a', proposed('concept.a', 'Alpha'));
    seedConcept('b', proposed('concept.b', 'Beta'));
    const url = await boot();

    const [ra, rb] = await Promise.all([
      post(url, '/api/certify', { id: 'concept.a' }),
      post(url, '/api/certify', { id: 'concept.b' }),
    ]);
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);

    const cat = await getJson(url, '/api/catalog');
    const status = new Map(
      (cat.concepts as Array<{ id: string; status: string }>).map((c) => [c.id, c.status]),
    );
    expect(status.get('concept.a')).toBe('certified');
    expect(status.get('concept.b')).toBe('certified');
  });
});
