import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type ArthaIndex, openArthaIndex } from '../../src/mcp/query';
import { contextBundle, createArthaServer, whyBundle } from '../../src/mcp/server';
import { writeFixtureIndex } from './fixture';

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'artha-server-'));
  dbPath = join(dir, '.artha', 'index.db');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function withIndex<T>(fn: (index: ArthaIndex) => T): T {
  writeFixtureIndex(dbPath);
  const index = openArthaIndex(dbPath);
  try {
    return fn(index);
  } finally {
    index.close();
  }
}

describe('contextBundle', () => {
  it('returns an actionable message on a cold/empty index (not an error)', () => {
    const index = openArthaIndex(dbPath); // never built
    const text = contextBundle(index, { task: 'money' });
    expect(text).toMatch(/no certified context/i);
    expect(text).toMatch(/include_proposed/);
    index.close();
  });

  it('returns certified-tagged items by default, excluding proposed and stale', () => {
    withIndex((index) => {
      const text = contextBundle(index, { task: 'money cents' });
      expect(text).toContain('[certified]');
      expect(text).toContain('decision.money');
      expect(text).not.toContain('decision.draft');
      expect(text).not.toContain('decision.old');
    });
  });

  it('labels proposed drafts when include_proposed is set', () => {
    withIndex((index) => {
      const text = contextBundle(index, { task: 'money', includeProposed: true });
      expect(text).toContain('decision.draft');
      expect(text).toMatch(/proposed/i);
    });
  });

  it('respects the token budget and notes what was omitted', () => {
    withIndex((index) => {
      const text = contextBundle(index, { task: 'money cents' }, 3);
      expect(text).toMatch(/omitted to fit/);
    });
  });
});

describe('whyBundle', () => {
  it('returns rationale touching a symbol, following invariant `why` cross-links', () => {
    withIndex((index) => {
      // src/money.ts#round is pinned only by the invariant, whose `why` points at decision.money.
      const text = whyBundle(index, 'src/money.ts#round');
      expect(text).toContain('invariant.no_float_money');
      expect(text).toContain('decision.money'); // pulled in via cross-link
      expect(text).not.toContain('decision.draft');
    });
  });

  it('shows every status, tagged, for a shared symbol', () => {
    withIndex((index) => {
      const text = whyBundle(index, 'src/money.ts#toCents');
      expect(text).toContain('[certified]');
      expect(text).toMatch(/proposed/i);
      expect(text).toMatch(/stale/i);
    });
  });

  it('reports cleanly when nothing references the symbol', () => {
    withIndex((index) => {
      expect(whyBundle(index, 'src/ghost.ts#nope')).toMatch(/no decision or rule references/i);
    });
  });
});

describe('MCP protocol round-trip (in-memory transport)', () => {
  async function connect() {
    writeFixtureIndex(dbPath);
    const server = createArthaServer({ repoRoot: dir, tokenBudget: 1500 });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(clientTransport);
    return { server, client };
  }

  it('exposes context_for_task and why', async () => {
    const { server, client } = await connect();
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(['context_for_task', 'why']);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('serves a ranked bundle and a why answer over the wire', async () => {
    const { server, client } = await connect();
    try {
      const ctx = await client.callTool({
        name: 'context_for_task',
        arguments: { task: 'money cents' },
      });
      const ctxText = textOf(ctx);
      expect(ctxText).toContain('decision.money');
      expect(ctxText).toContain('[certified]');
      expect(ctxText).not.toContain('decision.draft');

      const withProposed = await client.callTool({
        name: 'context_for_task',
        arguments: { task: 'money', include_proposed: true },
      });
      expect(textOf(withProposed)).toContain('decision.draft');

      const why = await client.callTool({
        name: 'why',
        arguments: { symbol: 'src/money.ts#toCents' },
      });
      expect(textOf(why)).toContain('decision.money');
    } finally {
      await client.close();
      await server.close();
    }
  });
});

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return content.map((c) => c.text ?? '').join('\n');
}
