import { describe, expect, test } from 'bun:test';
import { REVIEW_ASPECTS } from '../../../common/models/ratings.js';
import {
  aspectAssignmentsSql,
  aspectColumnsSql,
  aspectPlaceholdersSql,
  aspectReplacements,
  aspectSummaryColumnsSql,
  rowToAspects,
  rowToAspectSummaries,
} from './reviewAspects.js';

describe('aspectColumnsSql', () => {
  test('lists every REVIEW_ASPECTS column, comma-separated', () => {
    expect(aspectColumnsSql()).toBe(REVIEW_ASPECTS.map((a) => a.column).join(', '));
    for (const a of REVIEW_ASPECTS) expect(aspectColumnsSql()).toContain(a.column);
  });
});

describe('aspectPlaceholdersSql / aspectAssignmentsSql', () => {
  test('one :aspect_<key> placeholder per aspect', () => {
    for (const a of REVIEW_ASPECTS) expect(aspectPlaceholdersSql()).toContain(`:aspect_${a.key}`);
  });

  test('one "<column> = :aspect_<key>" assignment per aspect', () => {
    for (const a of REVIEW_ASPECTS) expect(aspectAssignmentsSql()).toContain(`${a.column} = :aspect_${a.key}`);
  });
});

describe('aspectReplacements', () => {
  test('every aspect gets a replacement, even when input is empty', () => {
    const replacements = aspectReplacements({});
    expect(Object.keys(replacements)).toHaveLength(REVIEW_ASPECTS.length);
    for (const a of REVIEW_ASPECTS) expect(replacements[`aspect_${a.key}`]).toBeNull();
  });

  test('a provided value passes through', () => {
    const key = REVIEW_ASPECTS[0]!.key;
    const replacements = aspectReplacements({ [key]: 4 });
    expect(replacements[`aspect_${key}`]).toBe(4);
  });

  test('an omitted aspect and an explicit null both write null (PUT is a full replace)', () => {
    const [first, second] = REVIEW_ASPECTS;
    const withExplicitNull = aspectReplacements({ [first!.key]: null });
    expect(withExplicitNull[`aspect_${first!.key}`]).toBeNull();
    expect(withExplicitNull[`aspect_${second!.key}`]).toBeNull(); // omitted entirely
  });
});

describe('rowToAspects', () => {
  test('maps every aspect column, defaulting a missing/null value to null', () => {
    const row = Object.fromEntries(REVIEW_ASPECTS.map((a) => [a.column, null])) as Parameters<typeof rowToAspects>[0];
    const aspects = rowToAspects(row);
    expect(Object.keys(aspects)).toHaveLength(REVIEW_ASPECTS.length);
    for (const a of REVIEW_ASPECTS) expect(aspects[a.key]).toBeNull();
  });

  test('a rated column round-trips its value', () => {
    const key = REVIEW_ASPECTS[0]!.key;
    const column = REVIEW_ASPECTS[0]!.column;
    const row = Object.fromEntries(REVIEW_ASPECTS.map((a) => [a.column, a.column === column ? 3 : null])) as Parameters<typeof rowToAspects>[0];
    expect(rowToAspects(row)[key]).toBe(3);
  });
});

describe('aspectSummaryColumnsSql / rowToAspectSummaries', () => {
  test('emits an avg + count select per aspect', () => {
    for (const a of REVIEW_ASPECTS) {
      expect(aspectSummaryColumnsSql()).toContain(`"${a.key}_avg"`);
      expect(aspectSummaryColumnsSql()).toContain(`"${a.key}_count"`);
    }
  });

  test('maps a summary row into AspectSummaries, defaulting a null average and a missing count', () => {
    const row = Object.fromEntries(
      REVIEW_ASPECTS.flatMap((a) => [[`${a.key}_avg`, null], [`${a.key}_count`, 0]]),
    ) as Parameters<typeof rowToAspectSummaries>[0];
    const summaries = rowToAspectSummaries(row);
    expect(Object.keys(summaries)).toHaveLength(REVIEW_ASPECTS.length);
    for (const a of REVIEW_ASPECTS) expect(summaries[a.key]).toEqual({ average: null, count: 0 });
  });

  test('a rated aspect carries its average and count through', () => {
    const key = REVIEW_ASPECTS[0]!.key;
    const row = Object.fromEntries(
      REVIEW_ASPECTS.flatMap((a) => [[`${a.key}_avg`, a.key === key ? 4.5 : null], [`${a.key}_count`, a.key === key ? 2 : 0]]),
    ) as Parameters<typeof rowToAspectSummaries>[0];
    expect(rowToAspectSummaries(row)[key]).toEqual({ average: 4.5, count: 2 });
  });
});
