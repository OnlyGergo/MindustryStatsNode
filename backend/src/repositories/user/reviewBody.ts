// ─────────────────────────────────────────────────────────────────────────────
// reviewBody.ts
// Pure normalisation, no DB/env imports. Postgres `text` rejects a literal
// \u0000 byte outright (an otherwise-valid review would 500 the request), so
// this has to run before the body ever reaches a query.
// ─────────────────────────────────────────────────────────────────────────────

// C0 control chars except \t (\u0009) and \n (\u000A); \r is handled
// separately below since it's folded into \n rather than stripped.
// eslint-disable-next-line no-control-regex
const C0_CONTROL_EXCEPT_TAB_LF = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/**
 * Strips control chars Postgres/the UI can't render, normalises line endings,
 * collapses excessive blank lines, and trims. Empty (or whitespace-only)
 * input becomes `null`, matching the DB column's nullability.
 */
export function normalizeReviewBody(raw: string | null | undefined): string | null {
  if (raw == null) return null;

  const normalized = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(C0_CONTROL_EXCEPT_TAB_LF, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return normalized.length === 0 ? null : normalized;
}
