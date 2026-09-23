// ─────────────────────────────────────────────────────────────────────────────
// reviewScoring.ts
// Pure math, no DB/env imports -- a Bayesian average so a single 5-star review
// can't outrank a server with dozens of consistently good ones. Used for
// sort-only display; the raw mean is what's actually shown to a visitor.
// ─────────────────────────────────────────────────────────────────────────────

/** How many "average" phantom reviews a server's own reviews have to outweigh. */
export const BAYES_PRIOR_WEIGHT = 5;

/**
 * `(priorWeight * m + sum) / (priorWeight + count)`, where `m` is the global
 * mean rating across every review site-wide (falling back to 3, a neutral
 * midpoint, when there are no reviews anywhere yet). `null` when this server
 * has no reviews -- there is nothing to rank, and "unrated" must stay
 * distinguishable from "rated exactly at the prior".
 */
export function bayesianScore(
  sum: number,
  count: number,
  globalMean: number | null,
  priorWeight: number = BAYES_PRIOR_WEIGHT,
): number | null {
  if (count === 0) return null;
  const m = globalMean ?? 3;
  return (priorWeight * m + sum) / (priorWeight + count);
}
