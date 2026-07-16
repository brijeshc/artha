import { loadConfig } from '../config/config';
import { type InferOptions, infer } from '../infer/infer';
import { ArthaError } from '../util/error';
import { logger } from '../util/logger';

export interface InferCliOptions {
  dryRun?: boolean;
  max?: string;
}

/**
 * `artha infer` — the opt-in 21b synthesis pass: enrich the deterministic 21a
 * inferred layer into readable product-language names + summaries via the
 * configured engine, verified against the code and spend-capped. Writes the
 * `.artha/.inferred.json` cache the next `artha build` overlays; run `build`
 * after to see it in the index and dashboard.
 */
export async function inferCommand(options: InferCliOptions = {}): Promise<void> {
  const repoRoot = process.cwd();
  const inferOptions: InferOptions = {
    dryRun: options.dryRun ?? false,
    maxFacts: parseCount(options.max, '--max', 0),
  };

  const report = await infer(repoRoot, loadConfig(repoRoot), inferOptions);

  if (inferOptions.dryRun) return; // infer() already logged the preview line

  const n = report.synthesized.length;
  logger.success(
    `Synthesized ${n} description${n === 1 ? '' : 's'} → run \`artha build\` to index them.`,
  );
  logger.info(
    `${report.candidates} candidate(s): ${report.reused} cached, ${n} synthesized ` +
      `(${report.downgraded} downgraded to uncertain), ${report.declined} declined, ` +
      `${report.remaining} left (spend cap).`,
  );
}

/** Parse a numeric CLI flag, enforcing an integer ≥ `min`. */
function parseCount(value: string | undefined, flag: string, min: number): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) {
    throw new ArthaError(`${flag} must be an integer ≥ ${min} (got "${value}").`);
  }
  return n;
}
