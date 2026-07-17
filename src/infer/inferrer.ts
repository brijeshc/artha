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

/** One reached module a flow fans out to (21a), for the synthesizer to describe. */
export interface SynthStep {
  /** The reached module id (`src/billing`); the key the description is aligned to. */
  module: string;
  /** The deterministic label (`Billing`), for context in the prompt. */
  label: string;
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
  /** A flow's reached modules (21b-2), for a one-line description of each. Empty
   * for non-flows. The *order* stays the human's delta (D8) - only what the flow
   * does at each module is read from the entry's code. */
  steps?: SynthStep[];
  /** A concept's states read from code (21b-2), the only names a proposed
   * transition may use. Empty for non-concepts. */
  members?: string[];
}

/** A synthesized description of what a flow does at one reached module (21b-2). */
export interface SynthStepText {
  /** The reached module id this describes - aligns back to the 21a step. */
  module: string;
  /** One grounded line: what the flow does at this module. */
  text: string;
}

/** A synthesized state-machine transition (21b-2): a directed edge the model read
 * from the state's usage code. `from`/`to` must be real states (the verifier drops
 * any that are not); `trigger` must be grounded (or the whole concept downgrades). */
export interface SynthTransition {
  from: string;
  to: string;
  trigger: string;
}

/**
 * The synthesizer's verdict for one candidate: either an enrichment (a better
 * name + a readable summary, plus per-step text for a flow and transitions for a
 * concept) or an honest refusal (`enriched: false`), which leaves the 21a
 * deterministic text in place. A refusal is not a failure - a candidate the model
 * cannot describe more clearly than the code already does keeps its factual card.
 */
export type SynthResult =
  | {
      enriched: true;
      name: string;
      summary: string;
      steps: SynthStepText[];
      transitions: SynthTransition[];
    }
  | { enriched: false };

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
    steps: {
      type: 'array',
      description:
        'For a flow only: one entry per reached module listed in the prompt, describing what the flow does there, grounded in the shown code. Empty array for any other kind, or when the code does not show what happens at a module.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          module: { type: 'string', description: 'The exact reached-module id from the prompt.' },
          text: {
            type: 'string',
            description: 'One line: what the flow does at this module, read from the code.',
          },
        },
        required: ['module', 'text'],
      },
    },
    transitions: {
      type: 'array',
      description:
        'For a concept/state-machine only: directed transitions the shown code makes evident. Each {from, to} must be two of the exact state names listed in the prompt, and `trigger` must be read from the code (the condition or event that moves it). Empty array for any other kind, or when the code does not show a transition.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          from: { type: 'string', description: 'The exact source state name from the prompt.' },
          to: { type: 'string', description: 'The exact target state name from the prompt.' },
          trigger: {
            type: 'string',
            description:
              'What moves it from → to, read from the code (a condition, event, method).',
          },
        },
        required: ['from', 'to', 'trigger'],
      },
    },
  },
  required: ['enriched', 'name', 'summary', 'steps', 'transitions'],
} as const;

export const SYNTH_SYSTEM_PROMPT = `You describe one unit of a codebase (a module, a concept/state-machine, a flow, or a naming convention) in plain product language, for a reader who did not write it.

You are shown a deterministic draft (read mechanically from the code) and the exact source it was read from. Your job is to make it READABLE, not to add facts:
- name: a short name a product manager would say out loud ("Subscription lifecycle", "Refund a purchase"), never a restated file path. Prefer the domain word over the code word.
- summary: two to three sentences describing what this does, grounded ONLY in the shown source. A non-author should be able to read it aloud and understand the unit's role.
- steps: ONLY when the prompt lists "Reaches" modules (a flow). For each reached module, write one line describing what the flow does there, read from the shown code (e.g. "charges the customer's card", "sends an order confirmation"). Do NOT describe the order the steps run in - that is unknown. Omit a module you cannot ground in the code. For any other kind, return an empty array.
- transitions: ONLY when the prompt lists "States" (a concept/state-machine). Return the directed transitions the shown code makes evident - each {from, to} using ONLY the exact state names listed, and a trigger read from the code (the condition or event that moves it). Omit any transition the code does not show; do NOT complete the diagram by guessing. For any other kind, return an empty array.

Hard rules:
- Ground every claim in the shown code. Do NOT invent behaviour, rationale, or the "why" - the reasons behind the code are the human's to add, never yours.
- Do not name libraries, services, or mechanisms that do not appear in the shown source.
- For transitions: never invent an edge to make the machine look complete. A missing transition is correct; a guessed one is a lie.
- If you cannot describe it more clearly than the deterministic draft already does, set enriched=false and return empty strings. A factual draft is better than a vague embellishment.

Respond with ONLY a JSON object of this exact shape - no markdown fences, no commentary:
{"enriched": boolean, "name": string, "summary": string, "steps": [{"module": string, "text": string}], "transitions": [{"from": string, "to": string, "trigger": string}]}`;

/** Render the per-candidate user prompt: the draft + its pinned evidence. */
export function renderSynthPrompt(input: SynthInput): string {
  const evidence = renderEvidence(input.evidence);
  const lines = [
    `Unit kind: ${input.kind}`,
    `Deterministic name: ${input.heading}`,
    `Deterministic description: ${input.body}`,
  ];
  if (input.steps && input.steps.length > 0) {
    lines.push(
      `Reaches (describe what the flow does at each, using this exact module id): ${input.steps
        .map((s) => `${s.module} (${s.label})`)
        .join(', ')}`,
    );
  }
  if (input.members && input.members.length > 0) {
    lines.push(
      `States (propose only transitions the code shows, using these exact names): ${input.members.join(', ')}`,
    );
  }
  lines.push(
    '',
    'Source this was read from:',
    evidence === ''
      ? '(no resolvable source - describe from the draft alone, cautiously)'
      : evidence,
  );
  return lines.join('\n');
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
  return {
    enriched: true,
    name,
    summary,
    steps: parseSteps(obj.steps),
    transitions: parseTransitions(obj.transitions),
  };
}

/** Read the optional per-step text, keeping only entries with a real module +
 * text. A malformed or absent `steps` is simply no step text (never a throw). */
function parseSteps(value: unknown): SynthStepText[] {
  if (!Array.isArray(value)) return [];
  const steps: SynthStepText[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const s = item as Record<string, unknown>;
    const module = str(s.module);
    const text = str(s.text);
    if (module !== '' && text !== '') steps.push({ module, text });
  }
  return steps;
}

/** Read the optional transitions, keeping only entries with all three fields. A
 * malformed or absent `transitions` is simply none (never a throw); the verifier
 * later drops any whose from/to are not real states. */
function parseTransitions(value: unknown): SynthTransition[] {
  if (!Array.isArray(value)) return [];
  const transitions: SynthTransition[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const t = item as Record<string, unknown>;
    const from = str(t.from);
    const to = str(t.to);
    const trigger = str(t.trigger);
    if (from !== '' && to !== '' && trigger !== '') transitions.push({ from, to, trigger });
  }
  return transitions;
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
