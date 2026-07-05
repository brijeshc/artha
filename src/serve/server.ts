import { existsSync, readFileSync, statSync } from 'node:fs';
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ArthaConfig } from '../config/config';
import { type Embedder, embedQueryForIndex, getEmbedder } from '../embed/embedder';
import { openArthaIndex } from '../mcp/query';
import { createTreeSitterResolver } from '../resolver/treeSitterResolver';
import {
  catalog,
  conceptDetail,
  darkZonesFeed,
  flowDetail,
  inferredDetail,
  mapFeed,
  moduleDetail,
  refsFeed,
  search,
} from './api';
import { suggestPins } from './suggest';
import { searchSymbols, symbolCatalog } from './symbols';
import { addPin, certifyEntry, commitWrite, upsertEntry } from './write';

export interface ServeOptions {
  repoRoot: string;
  config: ArthaConfig;
  /** Port to bind (default 4123). `0` picks an ephemeral free port (tests). */
  port?: number;
  /** Interface to bind. Default `127.0.0.1` - local-first, never `0.0.0.0`. */
  host?: string;
  /** Override the built frontend dir (default `<pkg>/dist/web`). */
  webDir?: string;
}

export interface ServeHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
}

const DEFAULT_PORT = 4123;
const DEFAULT_HOST = '127.0.0.1';

/**
 * Boot the local-first dashboard server. Read-only: every request opens
 * `.artha/index.db` fresh (so a new `artha build` shows up without a restart),
 * serves the JSON API + the static frontend, and never makes a network call.
 */
export function serve(options: ServeOptions): Promise<ServeHandle> {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const webDir = options.webDir ?? defaultWebDir();
  const dbPath = join(options.repoRoot, '.artha', 'index.db');
  // Built once; the model loads lazily only when a query hits an index that has
  // matching vectors (a no-embedding index never touches the model).
  const embedder = getEmbedder(options.config);
  // Serialize curation writes (T17) so two dashboard tabs can't interleave a rebuild.
  const writeLock = createWriteLock();

  const server = createServer((req, res) => {
    handle(req, res, { ...options, webDir, dbPath, embedder, writeLock }).catch(
      (error: unknown) => {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      },
    );
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      // Warm the link-picker symbol catalog off the request path so the first
      // "link code" search is instant (best-effort; a search rebuilds it if not).
      void symbolCatalog(options.repoRoot, options.config).catch(() => {});
      const actual = server.address();
      const boundPort = typeof actual === 'object' && actual ? actual.port : port;
      resolve({
        url: `http://${host}:${boundPort}`,
        port: boundPort,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}

interface Ctx extends ServeOptions {
  webDir: string;
  dbPath: string;
  embedder: Embedder | null;
  writeLock: <T>(fn: () => Promise<T>) => Promise<T>;
}

async function handle(req: IncomingMessage, res: ServerResponse, ctx: Ctx): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    if (req.method === 'GET') {
      // The symbol catalog is repo-derived, not index-derived - answer it
      // without opening the index (it's hit per keystroke in the link picker).
      if (url.pathname === '/api/symbols') {
        const q = url.searchParams.get('q') ?? '';
        sendJson(res, 200, await searchSymbols(ctx.repoRoot, ctx.config, q));
        return;
      }
      await handleApi(url, res, ctx);
    } else if (req.method === 'POST') {
      await handleWrite(url, req, res, ctx);
    } else {
      sendJson(res, 405, { error: 'method not allowed' });
    }
    return;
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }
  handleStatic(url, res, ctx);
}

async function handleApi(url: URL, res: ServerResponse, ctx: Ctx): Promise<void> {
  // Open the index per request → a fresh `artha build` is picked up live.
  const index = openArthaIndex(ctx.dbPath);
  try {
    const path = url.pathname;

    if (path === '/api/map') {
      sendJson(res, 200, mapFeed(ctx.repoRoot, index, ctx.config));
      return;
    }
    if (path === '/api/dark-zones') {
      sendJson(res, 200, darkZonesFeed(ctx.repoRoot, index, ctx.config));
      return;
    }
    if (path === '/api/catalog') {
      sendJson(res, 200, catalog(index, ctx.config));
      return;
    }
    if (path === '/api/refs') {
      sendJson(res, 200, refsFeed(index));
      return;
    }
    if (path === '/api/suggest') {
      const id = url.searchParams.get('id') ?? '';
      sendJson(res, 200, await suggestPins(ctx.repoRoot, index, ctx.config, id));
      return;
    }
    if (path === '/api/search') {
      const q = url.searchParams.get('q') ?? '';
      // Embed the query offline for semantic search (best-effort, model-matched).
      const queryEmbedding = await embedQueryForIndex(ctx.embedder, index.embeddingModel, q);
      sendJson(res, 200, search(index, q, queryEmbedding));
      return;
    }
    const concept = matchId(path, '/api/concept/');
    if (concept) {
      const detail = conceptDetail(index, concept, ctx.config);
      detail ? sendJson(res, 200, detail) : sendJson(res, 404, { error: `no concept ${concept}` });
      return;
    }
    const flow = matchId(path, '/api/flow/');
    if (flow) {
      const detail = flowDetail(index, flow, ctx.config);
      detail ? sendJson(res, 200, detail) : sendJson(res, 404, { error: `no flow ${flow}` });
      return;
    }
    const module = matchModule(path);
    if (module) {
      const detail = moduleDetail(ctx.repoRoot, index, ctx.config, module);
      detail ? sendJson(res, 200, detail) : sendJson(res, 404, { error: `no module ${module}` });
      return;
    }
    const inferred = matchInferred(path);
    if (inferred) {
      const detail = inferredDetail(index, inferred);
      detail
        ? sendJson(res, 200, detail)
        : sendJson(res, 404, { error: `no inferred ${inferred}` });
      return;
    }
    sendJson(res, 404, { error: `no such endpoint: ${path}` });
  } finally {
    index.close();
  }
}

/**
 * The T17 curation writes: **certify** · **link** (pin) · **edit**. Each mutates
 * one `.artha/*.yaml` and rebuilds the index so the next read reflects it (the
 * map redraws); a write that would break the build is rolled back. Writes are
 * serialized (`ctx.writeLock`) so concurrent tabs can't interleave a rebuild.
 * Read endpoints stay GET-only, so `POST /api/map` is a 405.
 */
async function handleWrite(
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
  ctx: Ctx,
): Promise<void> {
  const path = url.pathname;
  if (path !== '/api/certify' && path !== '/api/pin' && path !== '/api/entry') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  // Writes must declare application/json. A cross-site form can only send
  // text/plain-family types without a CORS preflight (which this server never
  // grants), so this keeps a random web page from mutating `.artha/` through
  // the localhost server.
  const contentType = (req.headers['content-type'] ?? '').toLowerCase();
  if (!contentType.includes('application/json')) {
    sendJson(res, 415, { error: 'content-type must be application/json' });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
    return;
  }

  const deps = {
    repoRoot: ctx.repoRoot,
    config: ctx.config,
    embedder: ctx.embedder,
    dbPath: ctx.dbPath,
  };

  const result = await ctx.writeLock(() =>
    commitWrite(deps, async () => {
      if (path === '/api/certify') {
        return certifyEntry(ctx.repoRoot, asString(body.id));
      }
      if (path === '/api/pin') {
        // Resolve against the live repo so an unresolvable pin is refused before
        // it ever reaches disk (the on-disk YAML stays buildable).
        const resolver = await createTreeSitterResolver(ctx.repoRoot);
        return addPin(ctx.repoRoot, asString(body.id), asString(body.symbol), resolver);
      }
      return upsertEntry(ctx.repoRoot, body);
    }),
  );

  if (result.ok) {
    sendJson(res, 200, result);
  } else {
    sendJson(res, result.code, { error: result.error });
  }
}

/** Entries are small YAML; cap the body so a runaway POST can't exhaust memory. */
const MAX_BODY_BYTES = 1_000_000;

/** Read + JSON-parse a request body into an object (empty body → `{}`). */
function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (text === '') {
        resolve({});
        return;
      }
      try {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          reject(new Error('request body must be a JSON object'));
          return;
        }
        resolve(parsed as Record<string, unknown>);
      } catch {
        reject(new Error('request body must be valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/** A per-server mutex: chains write closures so only one runs (and rebuilds) at a time. */
function createWriteLock(): <T>(fn: () => Promise<T>) => Promise<T> {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => {},
      () => {},
    );
    return run;
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Serve the built frontend from `webDir`; fall back to a placeholder page so
 * `/` always responds even before `npm run build:web` has produced a bundle. */
function handleStatic(url: URL, res: ServerResponse, ctx: Ctx): void {
  const root = resolve(ctx.webDir);
  const rel =
    url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  // Resolve against root and require the result to stay inside it - `resolve`
  // normalizes separators on both sides, so any `..` escape is caught here.
  const file = resolve(root, rel);
  if (file !== root && !file.startsWith(root + sep)) {
    sendText(res, 403, 'forbidden');
    return;
  }

  if (existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': contentType(file) });
    res.end(readFileSync(file));
    return;
  }
  if (url.pathname === '/' || !existsSync(root)) {
    res.writeHead(existsSync(root) ? 200 : 503, { 'content-type': 'text/html; charset=utf-8' });
    res.end(placeholderPage(!existsSync(root)));
    return;
  }
  sendText(res, 404, 'not found');
}

function defaultWebDir(): string {
  if (process.env.ARTHA_WEB_DIR) return process.env.ARTHA_WEB_DIR;
  // Bundled, this module is dist/cli.js → its dir is dist/, so dist/web sits beside it.
  const here = fileURLToPath(new URL('.', import.meta.url));
  return join(here, 'web');
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

function contentType(file: string): string {
  return MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

function matchId(path: string, prefix: string): string | null {
  if (!path.startsWith(prefix)) return null;
  const id = decodeURIComponent(path.slice(prefix.length));
  return id.length > 0 && !id.includes('/') ? id : null;
}

/** Module ids contain slashes (`src/billing`) - encoded or literal - so this
 * matcher allows them while still rejecting empties and path escapes. */
function matchModule(path: string): string | null {
  const prefix = '/api/module/';
  if (!path.startsWith(prefix)) return null;
  const id = decodeURIComponent(path.slice(prefix.length));
  return id.length > 0 && !id.split('/').some((seg) => seg === '' || seg === '..') ? id : null;
}

/** Inferred ids look like `inferred:concept:src/x.ts#Y` / `inferred:module:src/z`
 * - slashes and a `#` (encoded as %23), so this allows the path shape while
 * rejecting empties and `..` escapes, same discipline as {@link matchModule}. */
function matchInferred(path: string): string | null {
  const prefix = '/api/inferred/';
  if (!path.startsWith(prefix)) return null;
  const id = decodeURIComponent(path.slice(prefix.length));
  return id.length > 0 && !id.split('/').some((seg) => seg === '' || seg === '..') ? id : null;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(body);
}

function placeholderPage(notBuilt: boolean): string {
  const note = notBuilt
    ? 'The dashboard bundle is not built yet. Run <code>npm run build:web</code>.'
    : 'Loading…';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Artha</title></head>
<body style="font-family:system-ui;margin:3rem;max-width:40rem">
<h1>Artha</h1><p>${note}</p>
<p>The read API is live: <a href="/api/map">/api/map</a>, <a href="/api/dark-zones">/api/dark-zones</a>.</p>
</body></html>`;
}

export type { Server };
