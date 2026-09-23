import { describe, expect, test } from 'bun:test';
import { BAYES_PRIOR_WEIGHT, bayesianScore } from './reviewScoring.js';

describe('bayesianScore', () => {
  test('returns null for zero reviews regardless of the other inputs', () => {
    expect(bayesianScore(0, 0, 3.5)).toBeNull();
    expect(bayesianScore(0, 0, null)).toBeNull();
  });

  test('a single 5-star review ranks below twenty reviews averaging 4.5, given m = 3.5', () => {
    const m = 3.5;
    const oneFiveStar = bayesianScore(5, 1, m);
    const twentyAt4_5 = bayesianScore(4.5 * 20, 20, m);

    expect(oneFiveStar).not.toBeNull();
    expect(twentyAt4_5).not.toBeNull();
    expect(oneFiveStar!).toBeLessThan(twentyAt4_5!);
  });

  test('falls back to a neutral prior of 3 when there is no global mean yet', () => {
    // count=0 phantom prior only: score should sit between the review's own
    // rating and 3, pulled toward 3 by BAYES_PRIOR_WEIGHT phantom reviews.
    const score = bayesianScore(5, 1, null);
    const expected = (BAYES_PRIOR_WEIGHT * 3 + 5) / (BAYES_PRIOR_WEIGHT + 1);
    expect(score).toBeCloseTo(expected);
    expect(score!).toBeGreaterThan(3);
    expect(score!).toBeLessThan(5);
  });

  test('a custom prior weight changes how strongly the mean is pulled toward m', () => {
    const withDefault = bayesianScore(5, 1, 3.5);
    const withHeavierPrior = bayesianScore(5, 1, 3.5, 50);
    // A heavier prior pulls the single review's score closer to m = 3.5.
    expect(Math.abs(withHeavierPrior! - 3.5)).toBeLessThan(Math.abs(withDefault! - 3.5));
  });
});
