export interface ScanLimitConfig {
  readonly limit: number;
  readonly windowMinutes: number;
  readonly windowMs: number;
}

function positiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  maximum: number,
): number {
  const raw = env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum || String(value) !== raw)
    throw new Error(`${name} must be a whole decimal integer from 1 to ${maximum}.`);
  return value;
}

// Read once when constructing the server, never during a request. Blank values are
// configuration mistakes too; omit a variable to use its conservative default.
export function readScanLimitConfig(env: NodeJS.ProcessEnv = process.env): ScanLimitConfig {
  const limit = positiveInteger(env, 'AI_SCAN_LIMIT_PER_WINDOW', 20, 1000);
  const windowMinutes = positiveInteger(env, 'AI_SCAN_LIMIT_WINDOW_MINUTES', 60, 1440);
  return Object.freeze({ limit, windowMinutes, windowMs: windowMinutes * 60 * 1000 });
}
