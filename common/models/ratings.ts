/**
 * The optional per-aspect ratings a review can carry (F9), alongside its overall
 * 1–5 rating. Each entry maps to one nullable smallint column on server_reviews.
 * Adding an aspect = a migration adding the column + one line here; the backend
 * builds its SQL and validation from this list and the UI renders from it.
 */
export const REVIEW_ASPECTS = [
  { key: 'maps', column: 'rating_maps', label: 'Maps', hint: 'Map selection and quality' },
  { key: 'moderation', column: 'rating_moderation', label: 'Moderation', hint: 'Staff, rules and how they are enforced' },
  { key: 'lag', column: 'rating_lag', label: 'Performance', hint: 'Lag, stability and uptime' },
] as const;

export type ReviewAspect = (typeof REVIEW_ASPECTS)[number];
export type ReviewAspectKey = ReviewAspect['key'];

/** A review's aspect ratings; null = not rated. */
export type AspectRatings = { [K in ReviewAspectKey]: number | null };

/** Per-aspect summary over a server's reviews; average is null when nobody rated that aspect. */
export interface AspectSummary {
  average: number | null;
  count: number;
}
export type AspectSummaries = { [K in ReviewAspectKey]: AspectSummary };
