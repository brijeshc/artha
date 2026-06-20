import type { ErrorObject, SchemaObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import Ajv2020 from 'ajv/dist/2020.js';
import schemaDoc from './schema.json';
import type { ArthaEntry, Kind } from './types';

export interface ValidationError {
  /** JSON-pointer-ish path to the offending field, e.g. `/certified_by`. */
  path: string;
  message: string;
}

export type ValidateResult =
  | { ok: true; entry: ArthaEntry }
  | { ok: false; errors: ValidationError[] };

const CORE_KINDS = new Set<string>(['decision', 'invariant', 'convention']);

// `strict: false` because the §9 document carries the per-kind schemas as
// sibling keys (decision/invariant/convention) alongside `$defs`, which AJV
// would otherwise flag as unknown keywords.
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(schemaDoc as unknown as SchemaObject, 'artha');

const validators: Record<Kind, ValidateFunction> = {
  decision: ajv.compile({ $ref: 'artha#/decision' }),
  invariant: ajv.compile({ $ref: 'artha#/invariant' }),
  convention: ajv.compile({ $ref: 'artha#/convention' }),
};

function toError(error: ErrorObject): ValidationError {
  const at = error.instancePath === '' ? '' : error.instancePath;
  if (error.keyword === 'required' && typeof error.params.missingProperty === 'string') {
    return { path: `${at}/${error.params.missingProperty}`, message: 'is required' };
  }
  return { path: at === '' ? '/' : at, message: error.message ?? 'is invalid' };
}

/**
 * Structurally validate one parsed entry against the §9 JSON Schema, plus the
 * one cross-field rule JSON Schema can't express (§7.2: the id prefix must
 * match `kind`). Returns the entry typed, or a list of field-pathed errors.
 *
 * Note: callers handle *unknown kinds* (concept/flow/exception) by skipping
 * before reaching here; a non-core `kind` is reported as an error if it does.
 */
export function validateEntry(obj: unknown): ValidateResult {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return { ok: false, errors: [{ path: '/', message: 'entry must be a YAML mapping' }] };
  }

  const kind = (obj as { kind?: unknown }).kind;
  if (typeof kind !== 'string' || !CORE_KINDS.has(kind)) {
    return {
      ok: false,
      errors: [{ path: '/kind', message: `unknown or missing kind: ${String(kind)}` }],
    };
  }

  const validate = validators[kind as Kind];
  const errors: ValidationError[] = validate(obj) ? [] : (validate.errors ?? []).map(toError);

  // §7.2 — id prefix must match kind (the pattern alone allows any prefix).
  const id = (obj as { id?: unknown }).id;
  if (typeof id === 'string' && !id.startsWith(`${kind}.`)) {
    errors.push({ path: '/id', message: `id prefix must match kind "${kind}" (got "${id}")` });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, entry: obj as ArthaEntry };
}
