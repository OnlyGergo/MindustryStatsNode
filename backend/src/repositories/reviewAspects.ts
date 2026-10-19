// ─────────────────────────────────────────────────────────────────────────────
// reviewAspects.ts
// Pure SQL-fragment builders + row mappers derived from REVIEW_ASPECTS
// (common/models/ratings.ts). No DB/env import -- shared by the write path
// (reviewRepository.ts, user connection) and the read path
// (reviewReadRepository.ts) so adding a fourth aspect is a migration + one
// line in REVIEW_ASPECTS, never a hand-edit to a column list here.
//
// Interpolating `a.column`/`a.key` into the SQL below is fine: REVIEW_ASPECTS
// is a compile-time constant, not user input.
// ─────────────────────────────────────────────────────────────────────────────

import { REVIEW_ASPECTS, type AspectRatings, type AspectSummaries } from '../../../common/models/ratings.js';

/** A DB row's rating_* columns, keyed by their SQL names -- what REVIEW_COLUMNS selects. */
export type AspectColumnRow = { [K in (typeof REVIEW_ASPECTS)[number]['column']]: number | null };

/** A summary row's per-aspect avg/count columns, keyed `<key>_avg` / `<key>_count`. */
export type AspectSummaryColumnRow =
  { [K in (typeof REVIEW_ASPECTS)[number]['key'] as `${K}_avg`]: number | null } &
  { [K in (typeof REVIEW_ASPECTS)[number]['key'] as `${K}_count`]: number };

/** `rating_maps, rating_moderation, rating_lag` -- for SELECT/RETURNING/INSERT column lists. */
export function aspectColumnsSql(): string {
  return REVIEW_ASPECTS.map((a) => a.column).join(', ');
}

/** `:aspect_maps, :aspect_moderation, :aspect_lag` -- INSERT VALUES, paired with aspectReplacements. */
export function aspectPlaceholdersSql(): string {
  return REVIEW_ASPECTS.map((a) => `:aspect_${a.key}`).join(', ');
}

/** `rating_maps = :aspect_maps, ...` -- UPDATE SET clause, paired with aspectReplacements. */
export function aspectAssignmentsSql(): string {
  return REVIEW_ASPECTS.map((a) => `${a.column} = :aspect_${a.key}`).join(', ');
}

/**
 * Sequelize replacements for aspectPlaceholdersSql/aspectAssignmentsSql's
 * `:aspect_<key>` names. PUT is a full replace, so a key missing from `input`
 * writes NULL, same as an explicit `null`.
 */
export function aspectReplacements(input: Partial<AspectRatings>): Record<string, number | null> {
  const replacements: Record<string, number | null> = {};
  for (const a of REVIEW_ASPECTS) replacements[`aspect_${a.key}`] = input[a.key] ?? null;
  return replacements;
}

/** Maps a row's rating_* columns into `{ maps, moderation, lag }`. */
export function rowToAspects(row: AspectColumnRow): AspectRatings {
  const aspects = {} as AspectRatings;
  for (const a of REVIEW_ASPECTS) aspects[a.key] = row[a.column] ?? null;
  return aspects;
}

/**
 * `avg(rating_maps) FILTER (WHERE rating_maps IS NOT NULL)::float8 AS "maps_avg",
 *  count(rating_maps)::int AS "maps_count", ...` for the summary query, run over
 * the same deduped family_reviews CTE the overall count/histogram use.
 */
export function aspectSummaryColumnsSql(): string {
  return REVIEW_ASPECTS
    .map((a) => `avg(${a.column}) FILTER (WHERE ${a.column} IS NOT NULL)::float8 AS "${a.key}_avg", count(${a.column})::int AS "${a.key}_count"`)
    .join(',\n       ');
}

/** Maps a summary row's per-aspect avg/count columns into AspectSummaries. */
export function rowToAspectSummaries(row: AspectSummaryColumnRow): AspectSummaries {
  const summaries = {} as AspectSummaries;
  for (const a of REVIEW_ASPECTS) {
    summaries[a.key] = { average: row[`${a.key}_avg`] ?? null, count: row[`${a.key}_count`] ?? 0 };
  }
  return summaries;
}
