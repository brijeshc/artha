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

/**
 * Pluggable miner. Two implementations ship: the Anthropic SDK engine
 * (`anthropic.ts`) and the Claude Code CLI engine (`claudeCli.ts`); tests pass
 * a stub. The shared prompt + response parsing below keep both engines'
 * behaviour identical.
 */
export interface Miner {
  mineCommit(input: MinerInput): Promise<MinerResult>;
}

/** Largest diff (chars) sent to the model; larger diffs are truncated with a marker. */
export const MAX_PATCH_CHARS = 16_000;

// JSON Schema for the API engine's structured output. Deliberately NOT the full
// §5.1 decision schema (whose if/then conditionals structured outputs reject) —
// the miner returns only the content fields, and mine.ts assembles + validates
// the complete entry through T02 before writing.
export const DECISION_OUTPUT_SCHEMA = {
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

export const DECISION_SYSTEM_PROMPT = `You mine architectural decisions ("the why") from a single git commit.

Given a commit message and diff, decide whether it records a real engineering DECISION — a deliberate choice with rationale, of the kind a teammate would want to know months later (e.g. "use integer minor units for money", "switch retries to exponential backoff to avoid thundering herd").

Set has_decision=false for routine work with no decision rationale: dependency bumps, formatting, mechanical refactors, generated-file updates, typo fixes, trivial wiring. When in doubt, prefer false — a false negative is cheaper than a fabricated decision.

When has_decision=true, write an ADR-style entry grounded ONLY in evidence present in the commit. Do not invent rationale the commit does not support. title is imperative and specific; context states the problem/forces; decision states the choice and why; consequences captures trade-offs (empty string if none are evident).
When has_decision=false, return empty strings for the other fields.

Respond with ONLY a JSON object of this exact shape — no markdown fences, no commentary:
{"has_decision": boolean, "title": string, "context": string, "decision": string, "consequences": string}`;

/** Render the per-commit user prompt (message + truncated diff). */
export function renderCommitPrompt(input: MinerInput): string {
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

/**
 * Map a model's raw response to a `MinerResult`. Tolerant of markdown fences and
 * surrounding prose (the CLI engine returns fenced text; the API engine returns
 * clean JSON) by extracting the first `{…}` block. A claimed decision missing
 * its core fields is downgraded to "no decision" rather than written as junk.
 */
export function parseMinerResponse(text: string): MinerResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(text));
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

  if (draft.title === '' || draft.context === '' || draft.decision === '') {
    return { hasDecision: false };
  }
  return { hasDecision: true, draft };
}

/** Slice out the first complete `{…}` object so fenced/prose-wrapped JSON still parses. */
function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return text;
  return text.slice(start, end + 1);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
