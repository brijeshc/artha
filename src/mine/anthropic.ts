import type AnthropicClient from '@anthropic-ai/sdk';
import { ArthaError } from '../util/error';

/** The decision *content* the miner extracts — assembled into a full entry by mine.ts. */
export interface DecisionDraft {
  title: string;
  context: string;
  decision: string;
  consequences?: string;
}

/** Either a drafted decision, or the model's "this commit has no real decision" verdict. */
export type MinerResult = { hasDecision: false } | { hasDecision: true; draft: DecisionDraft };

/** What the miner sees for one commit. */
export interface MinerInput {
  subject: string;
  body: string;
  files: string[];
  patch: string;
}

/** Pluggable miner — the Anthropic implementation in prod, a stub in tests. */
export interface Miner {
  mineCommit(input: MinerInput): Promise<MinerResult>;
}

const ENV_KEY = 'ANTHROPIC_API_KEY';

/** Largest diff (chars) sent to the model; larger diffs are truncated with a marker. */
const MAX_PATCH_CHARS = 16_000;

/**
 * Throw an actionable `ArthaError` if `ANTHROPIC_API_KEY` is unset. `mine`
 * calls this up front so it fails fast and clearly; `build`/`review`/MCP/
 * `export` never touch this path and so stay fully offline.
 */
export function requireApiKey(): void {
  if (!process.env[ENV_KEY]) {
    throw new ArthaError(`${ENV_KEY} is not set — \`artha mine\` needs it to draft decisions.`, {
      hint: `Set it (e.g. export ${ENV_KEY}=sk-ant-...) and re-run. Other commands run fully offline.`,
    });
  }
}

// Focused JSON Schema for structured output. Deliberately NOT the full §5.1
// decision schema (which uses if/then conditionals structured outputs reject) —
// the miner returns only the content fields, and mine.ts assembles + validates
// the complete entry through T02 before writing.
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    has_decision: {
      type: 'boolean',
      description: 'True only if the commit reflects a real, non-trivial engineering decision.',
    },
    title: { type: 'string', description: 'Imperative one-line decision title.' },
    context: { type: 'string', description: 'The problem and forces that prompted the decision.' },
    decision: { type: 'string', description: 'What was decided and why this option.' },
    consequences: {
      type: 'string',
      description: 'Trade-offs and follow-on effects. Empty string if none are evident.',
    },
  },
  required: ['has_decision', 'title', 'context', 'decision', 'consequences'],
} as const;

const SYSTEM_PROMPT = `You mine architectural decisions ("the why") from a single git commit.

Given a commit message and diff, decide whether it records a real engineering DECISION — a deliberate choice with rationale, of the kind a teammate would want to know months later (e.g. "use integer minor units for money", "switch retries to exponential backoff to avoid thundering herd").

Set has_decision=false for routine work with no decision rationale: dependency bumps, formatting, mechanical refactors, generated-file updates, typo fixes, trivial wiring. When in doubt, prefer false — a false negative is cheaper than a fabricated decision.

When has_decision=true, write an ADR-style entry grounded ONLY in evidence present in the commit. Do not invent rationale the commit does not support. title is imperative and specific; context states the problem/forces; decision states the choice and why; consequences captures trade-offs (empty string if none are evident).
When has_decision=false, return empty strings for the other fields.`;

/** Build the Anthropic-backed miner. Lazily loads the SDK so non-mine commands never import it. */
export async function createAnthropicMiner(model: string): Promise<Miner> {
  requireApiKey();
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client: AnthropicClient = new Anthropic();

  return {
    async mineCommit(input: MinerInput): Promise<MinerResult> {
      const response = await client.messages.create({
        model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        // Structured output: the response text is guaranteed to match OUTPUT_SCHEMA.
        output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
        messages: [{ role: 'user', content: renderPrompt(input) }],
      });

      return parseResult(textOf(response));
    },
  };
}

function renderPrompt(input: MinerInput): string {
  const patch =
    input.patch.length > MAX_PATCH_CHARS
      ? `${input.patch.slice(0, MAX_PATCH_CHARS)}\n…[diff truncated]`
      : input.patch;
  const message = input.body ? `${input.subject}\n\n${input.body}` : input.subject;
  return [
    'Commit message:',
    message,
    '',
    `Files changed: ${input.files.join(', ')}`,
    '',
    'Diff:',
    patch,
  ].join('\n');
}

function textOf(response: AnthropicClient.Message): string {
  return response.content
    .filter((block): block is AnthropicClient.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function parseResult(text: string): MinerResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new ArthaError('Miner returned non-JSON output.', { cause });
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.has_decision !== true) return { hasDecision: false };

  const draft: DecisionDraft = {
    title: str(obj.title),
    context: str(obj.context),
    decision: str(obj.decision),
  };
  const consequences = str(obj.consequences);
  if (consequences !== '') draft.consequences = consequences;

  // A claimed decision missing its core fields is treated as "no decision"
  // rather than written as an invalid draft.
  if (draft.title === '' || draft.context === '' || draft.decision === '') {
    return { hasDecision: false };
  }
  return { hasDecision: true, draft };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
