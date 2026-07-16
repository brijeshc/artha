import { ArthaError } from '../util/error';

/**
 * The synthesizer (21b) enriches a single deterministic 21a candidate into
 * readable meaning. It is the `infer` counterpart of the T06 `Miner`: two
 * engines ship (`api` via the Anthropic SDK, `claude-cli` via the Claude Code
 * CLI); tests inject a stub. The shared prompt + response parsing below keep
 * both engines' behaviour identical, exactly as the miner does.
 *
 * What it may claim is bounded by design: a **name** (product-language) and a
 * **summary** (2-3 plain sentences), both grounded in the pinned code shown to
 * it. It never invents the "why" (that is the human delta, D8); the verifier
 * (`verify.ts`) then checks the claim against the same evidence and downgrades
 * anything it cannot ground. Richer claims (state-machine transitions, flow
 * step text) arrive in a later slice over this same seam.
 */

/** One pinned symbol's source, shown to the synthesizer as the evidence a claim
 * must be grounded in (D5). `lines` is the symbol's own span, already resolved. */
export interface EvidenceExcerpt {
  /** The pin ref: `src/billing/refund.ts#issueRefund`. */
  ref: string;
  /** Repo-relative posix path of the file the symbol lives in. */
  path: string;
  /** The symbol's source lines (the evidence text). */
  lines: string[];
}

/** What the synthesizer sees for one 21a candidate. */
export interface SynthInput {
  /** `module` · `concept` · `flow` · `convention` - shapes the prompt's ask. */
  kind: string;
  /** The deterministic 21a name (humanized identifier), the draft to improve on. */
  heading: string;
  /** The deterministic 21a prose, stating what was read from code. */
  body: string;
  /** The pinned code every claim must stay grounded in. May be empty (drifted). */
  evidence: EvidenceExcerpt[];
}

/**
 * The synthesizer's verdict for one candidate: either an enrichment (a better
 * name + a readable summary) or an honest refusal (`enriched: false`), which
 * leaves the 21a deterministic text in place. A refusal is not a failure - a
 * candidate the model cannot describe more clearly than the code already does
 * keeps its factual 21a card.
 */
export type SynthResult = { enriched: true; name: string; summary: string } | { enriched: false };

/**
 * Pluggable synthesizer. Mirrors {@link '../mine/miner'.Miner}: one method, two
 * shipped engines, a stub in tests.
 */
export interface Inferrer {
  synthesize(input: SynthInput): Promise<SynthResult>;
}

/** Largest evidence payload (chars) sent to the model; longer is truncated with
 * a marker, like the miner's diff cap - a card never needs the whole module. */
export const MAX_EVIDENCE_CHARS = 12_000;

// JSON Schema for the API engine's structured output. The synthesizer returns
// only content fields; `infer.ts` verifies and assembles the enrichment. A
// candidate the model declines to enrich sets enriched=false and empty strings.
export const SYNTH_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    enriched: {
      type: 'boolean',
      description:
        'True only if you can describe this more clearly than the code already does, grounded in the shown source.',
    },
    name: {
      type: 'string',
      description:
        'A short product-language name a PM would say (e.g. "Subscription lifecycle"). Empty string if not enriched.',
    },
    summary: {
      type: 'string',
      description:
        'Two to three plain-language sentences a non-author can read aloud, grounded only in the shown code. Empty string if not enriched.',
    },
  },
  required: ['enriched', 'name', 'summary'],
} as const;

export const SYNTH_SYSTEM_PROMPT = `You describe one unit of a codebase (a module, a concept/state-machine, a flow, or a naming convention) in plain product language, for a reader who did not write it.

You are shown a deterministic draft (read mechanically from the code) and the exact source it was read from. Your job is to make it READABLE, not to add facts:
- name: a short name a product manager would say out loud ("Subscription lifecycle", "Refund a purchase"), never a restated file path. Prefer the domain word over the code word.
- summary: two to three sentences describing what this does, grounded ONLY in the shown source. A non-author should be able to read it aloud and understand the unit's role.

Hard rules:
- Ground every claim in the shown code. Do NOT invent behaviour, rationale, or the "why" - the reasons behind the code are the human's to add, never yours.
- Do not name libraries, services, or mechanisms that do not appear in the shown source.
- If you cannot describe it more clearly than the deterministic draft already does, set enriched=false and return empty strings. A factual draft is better than a vague embellishment.

Respond with ONLY a JSON object of this exact shape - no markdown fences, no commentary:
{"enriched": boolean, "name": string, "summary": string}`;

/** Render the per-candidate user prompt: the draft + its pinned evidence. */
export function renderSynthPrompt(input: SynthInput): string {
  const evidence = renderEvidence(input.evidence);
  return [
    `Unit kind: ${input.kind}`,
    `Deterministic name: ${input.heading}`,
    `Deterministic description: ${input.body}`,
    '',
    'Source this was read from:',
    evidence === ''
      ? '(no resolvable source - describe from the draft alone, cautiously)'
      : evidence,
  ].join('\n');
}

/** Concatenate the evidence excerpts, bounded by {@link MAX_EVIDENCE_CHARS}. */
function renderEvidence(evidence: EvidenceExcerpt[]): string {
  let out = '';
  for (const e of evidence) {
    const block = `// ${e.ref}\n${e.lines.join('\n')}\n`;
    if (out.length + block.length > MAX_EVIDENCE_CHARS) {
      out += '…[evidence truncated]\n';
      break;
    }
    out += block;
  }
  return out.trimEnd();
}

/**
 * Map a model's raw response to a {@link SynthResult}. Tolerant of markdown
 * fences and surrounding prose (the CLI engine wraps output) by extracting the
 * first `{…}` block. A claimed enrichment missing its name or summary is
 * downgraded to a refusal rather than written as junk (mirrors the miner).
 */
export function parseSynthResponse(text: string): SynthResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObject(text));
  } catch (cause) {
    throw new ArthaError('Synthesizer returned non-JSON output.', { cause });
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.enriched !== true) return { enriched: false };

  const name = str(obj.name);
  const summary = str(obj.summary);
  if (name === '' || summary === '') return { enriched: false };
  return { enriched: true, name, summary };
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
