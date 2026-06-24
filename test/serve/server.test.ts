import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
