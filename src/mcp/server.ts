import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { FactRow } from '../build/db';
import { logger } from '../util/logger';
import { type ArthaIndex, openArthaIndex } from './query';
import {
  DEFAULT_TOKEN_BUDGET,
  type RankInput,
  type RankedItem,
  fileOf,
  formatItem,
  normRef,
  rankFacts,
  selectWithinBudget,
  statusRank,
} from './rank';

/**
 * Build the ranked, token-budgeted context bundle for a task as agent-facing
 * text. Certified-only unless `includeProposed`; stale excluded. Empty/cold
 * index → a short, actionable message (never an error).
 */
export function contextBundle(
  index: ArthaIndex,
  input: RankInput,
  budget = DEFAULT_TOKEN_BUDGET,
): string {
  const ranked = rankFacts(index, input);
  if (ranked.length === 0) {
    return input.includeProposed
      ? 'No matching product context found (certified or proposed).'
      : 'No certified context found for this task. Retry with include_proposed: true to also see unreviewed drafts.';
  }
  const { kept, dropped } = selectWithinBudget(ranked, budget);
  const body = kept.map(formatItem).join('\n\n');
  return dropped > 0
    ? `${body}\n\n(+${dropped} lower-ranked item(s) omitted to fit the ~${budget}-token budget.)`
    : body;
}

/**
 * Explain a symbol: the decisions/rules whose pins reference `path#Symbol`
 * (plus any decision an invariant's `why` cross-links to). Returns the rationale
 * entries tagged with their status; all statuses are shown (this is explanatory,
 * not trusted-context injection).
 */
export function whyBundle(index: ArthaIndex, symbol: string): string {
  const target = normRef(symbol);
  const fileOnly = !target.includes('#');

  const matched = new Set<string>();
  for (const pin of index.pins) {
    const ref = normRef(pin.symbol_ref);
    const hit = ref === target || pin.symbol_id === symbol || (fileOnly && fileOf(ref) === target);
    if (hit) matched.add(pin.fact_id);
  }

  const byId = new Map(index.facts.map((fact) => [fact.id, fact]));
  // Follow invariant `why` cross-links to the decision that justifies the rule.
  for (const id of [...matched]) {
    const why = byId.get(id)?.why;
    if (why) matched.add(why);
  }

  const facts = [...matched]
    .map((id) => byId.get(id))
    .filter((fact): fact is FactRow => fact !== undefined)
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.id.localeCompare(b.id));

  if (facts.length === 0) return `No decision or rule references ${symbol}.`;

  const pinsByFact = new Map<string, string[]>();
  for (const pin of index.pins) {
    const bucket = pinsByFact.get(pin.fact_id);
    if (bucket) bucket.push(pin.symbol_ref);
    else pinsByFact.set(pin.fact_id, [pin.symbol_ref]);
  }

  return facts
    .map((fact) =>
      formatItem({
        fact,
        pins: pinsByFact.get(fact.id) ?? [],
        scopeFiles: [],
        score: 0,
      } satisfies RankedItem),
    )
    .join('\n\n');
}

// Advertised to the client at initialize so an agent knows to consult Artha
// *before* rediscovering the team's conventions by reading/grepping many files.
const ARTHA_INSTRUCTIONS =
  "Artha serves this team's certified product context — the decisions, conventions, and " +
  'invariants behind this codebase. Before writing or changing code, call `context_for_task` ' +
  'with a short description of what you are about to do (plus any symbols or files you will ' +
  'touch) to load the relevant certified context, and `why` to learn why a specific symbol ' +
  "exists. Prefer these over rediscovering the team's conventions by reading or grepping files.";

export interface ServerOptions {
  /** Repo root holding `.artha/index.db`. Default: `$ARTHA_REPO_ROOT` then `process.cwd()`. */
  repoRoot?: string;
  /** Token budget for `context_for_task`. Default from env or the spec default. */
  tokenBudget?: number;
}

/**
 * Build the `artha` MCP server with both tools registered. Separated from
 * {@link startMcpServer} so a test can drive it over an in-memory transport.
 * The index is opened per call so a fresh `artha build` is picked up without a
 * restart.
 */
export function createArthaServer(options: ServerOptions = {}): McpServer {
  // An MCP client may not launch the server from the repo root, so allow an
  // explicit override (env) before falling back to the working directory.
  const repoRoot = options.repoRoot ?? process.env.ARTHA_REPO_ROOT ?? process.cwd();
  const dbPath = join(repoRoot, '.artha', 'index.db');
  const budget = options.tokenBudget ?? tokenBudgetFromEnv();

  const server = new McpServer(
    { name: 'artha', version: __ARTHA_VERSION__ },
    { instructions: ARTHA_INSTRUCTIONS },
  );

  server.registerTool(
    'context_for_task',
    {
      title: 'Certified context for a task',
      description:
        'Ranked, token-budgeted product decisions/conventions/invariants relevant to a task. ' +
        'Certified-only by default; pass the symbols/files the task touches for structural ranking, ' +
        'and include_proposed: true to also surface unreviewed drafts (clearly labeled).',
      inputSchema: {
        task: z.string().describe('What you are about to do, in natural language.'),
        symbols: z
          .array(z.string())
          .optional()
          .describe('Symbols the task touches, as path#Symbol (improves ranking).'),
        files: z
          .array(z.string())
          .optional()
          .describe('Repo-relative files the task touches (improves ranking).'),
        include_proposed: z
          .boolean()
          .optional()
          .describe('Also return unreviewed proposed drafts (default false → certified only).'),
      },
    },
    async (args) => {
      const index = openArthaIndex(dbPath);
      try {
        const text = contextBundle(
          index,
          {
            task: args.task,
            symbols: args.symbols,
            files: args.files,
            includeProposed: args.include_proposed ?? false,
          },
          budget,
        );
        return { content: [{ type: 'text', text }] };
      } finally {
        index.close();
      }
    },
  );

  server.registerTool(
    'why',
    {
      title: 'Why does this code exist',
      description:
        'The decision(s) and rules behind a symbol — pass path#Symbol. Returns the rationale ' +
        'entries tagged with their status (certified / proposed / stale).',
      inputSchema: {
        symbol: z.string().describe('The symbol to explain, as path#Symbol.'),
      },
    },
    async (args) => {
      const index = openArthaIndex(dbPath);
      try {
        return { content: [{ type: 'text', text: whyBundle(index, args.symbol) }] };
      } finally {
        index.close();
      }
    },
  );

  return server;
}

/**
 * Start the stdio MCP server exposing `context_for_task` and `why`. Runs fully
 * offline and read-only over `.artha/index.db`. Diagnostics go to stderr so
 * stdout stays clean for the JSON-RPC framing.
 */
export async function startMcpServer(options: ServerOptions = {}): Promise<void> {
  const server = createArthaServer(options);
  await server.connect(new StdioServerTransport());
  logger.info('artha MCP server ready on stdio (tools: context_for_task, why).');
}

function tokenBudgetFromEnv(): number {
  const raw = process.env.ARTHA_TOKEN_BUDGET;
  if (raw === undefined) return DEFAULT_TOKEN_BUDGET;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_TOKEN_BUDGET;
}
