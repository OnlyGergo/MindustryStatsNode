import { describe, expect, test } from 'bun:test';
import { normalizeReviewBody } from './reviewBody.js';

describe('normalizeReviewBody', () => {
  test('null/undefined stay null', () => {
    expect(normalizeReviewBody(null)).toBeNull();
    expect(normalizeReviewBody(undefined)).toBeNull();
  });

  test('empty or whitespace-only input becomes null', () => {
    expect(normalizeReviewBody('')).toBeNull();
    expect(normalizeReviewBody('   \n\t  ')).toBeNull();
  });

  test('strips NUL and other C0 control chars, keeping \\n and \\t', () => {
    expect(normalizeReviewBody('a\u0000b\u0001c\td\ne')).toBe('abc\td\ne');
  });

  test('normalises \\r\\n and lone \\r to \\n', () => {
    expect(normalizeReviewBody('a\r\nb\rc')).toBe('a\nb\nc');
  });

  test('collapses runs of 3+ newlines to 2', () => {
    expect(normalizeReviewBody('a\n\n\n\n\nb')).toBe('a\n\nb');
    expect(normalizeReviewBody('a\n\nb')).toBe('a\n\nb');
  });

  test('trims leading/trailing whitespace', () => {
    expect(normalizeReviewBody('  hello world  ')).toBe('hello world');
  });

  test('passes clean text through unchanged (aside from trimming)', () => {
    expect(normalizeReviewBody('Great server, would join again!')).toBe('Great server, would join again!');
  });
});
