import { describe, expect, test } from 'bun:test';
import { generateToken, hashToken, isWellFormedToken } from './sessionToken.js';

describe('hashToken', () => {
  test('produces a lowercase 64-char hex sha256 digest', () => {
    const digest = hashToken('some-token-value');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  test('is deterministic for the same input', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  test('differs for different inputs', () => {
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });

  test('matches the known sha256("") digest', () => {
    expect(hashToken('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('generateToken', () => {
  test('is 43 chars of base64url and passes the shape check', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isWellFormedToken(token)).toBe(true);
  });

  test('is unique per call', () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});

describe('isWellFormedToken', () => {
  test('rejects wrong length and non-base64url characters', () => {
    expect(isWellFormedToken('')).toBe(false);
    expect(isWellFormedToken('a'.repeat(42))).toBe(false);
    expect(isWellFormedToken('a'.repeat(44))).toBe(false);
    expect(isWellFormedToken('a'.repeat(42) + '=')).toBe(false);
    expect(isWellFormedToken('a'.repeat(42) + '/')).toBe(false);
  });
});
