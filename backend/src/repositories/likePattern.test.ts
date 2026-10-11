import { describe, expect, test } from 'bun:test';
import { escapeLike } from './likePattern.js';

describe('escapeLike', () => {
  test('leaves ordinary text alone', () => {
    expect(escapeLike('gergo')).toBe('gergo');
  });

  test('escapes LIKE wildcards so they match literally', () => {
    expect(escapeLike('100%_off')).toBe('100\\%\\_off');
  });

  test('escapes the escape character itself first', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b');
    expect(escapeLike('\\%')).toBe('\\\\\\%');
  });
});
