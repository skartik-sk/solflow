// Shared limits for build/test job rows: log clamping and stale-row cutoffs.

/** Builds and tests run elsewhere (browser, GitHub Actions); a row BUILDING/RUNNING longer than this is dead. */
export const JOB_STALE_MS = 20 * 60_000;

export const MAX_LOG_LINES = 500;
export const MAX_LOG_LINE_CHARS = 10_000;
export const MAX_ERROR_ITEMS = 50;
export const MAX_ERROR_CHARS = 20_000;

/**
 * Clamp a string array to `maxItems` entries of at most `maxChars` each. Keeps
 * the LAST lines (where errors usually are) and marks what was dropped, so an
 * oversized log is stored truncated instead of failing validation.
 */
export function clampLines(value: unknown, maxItems: number, maxChars: number): unknown {
  if (!Array.isArray(value)) return value;
  const lines = value.map((v) =>
    typeof v === "string" && v.length > maxChars ? `${v.slice(0, maxChars)}… [truncated]` : v,
  );
  if (lines.length <= maxItems) return lines;
  const dropped = lines.length - (maxItems - 1);
  return [`… ${dropped} earlier line(s) truncated`, ...lines.slice(-(maxItems - 1))];
}

export function isStaleJob(startedAt: Date | string, now = Date.now()): boolean {
  return now - new Date(startedAt).getTime() > JOB_STALE_MS;
}
