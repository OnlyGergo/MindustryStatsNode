import { describe, expect, test } from 'bun:test';
import { isSameOrigin } from './originGuard.js';

const SITE_ORIGIN = 'https://mindustrystats.example';

function req(method: string, origin?: string): Request {
  const headers = new Headers();
  if (origin !== undefined) headers.set('origin', origin);
  return new Request('https://mindustrystats.example/api/whatever', { method, headers });
}

describe('isSameOrigin', () => {
  test('safe methods pass with no Origin header', () => {
    expect(isSameOrigin(req('GET'), SITE_ORIGIN)).toBe(true);
    expect(isSameOrigin(req('HEAD'), SITE_ORIGIN)).toBe(true);
    expect(isSameOrigin(req('OPTIONS'), SITE_ORIGIN)).toBe(true);
  });

  test('a non-safe method with no Origin header fails', () => {
    expect(isSameOrigin(req('POST'), SITE_ORIGIN)).toBe(false);
  });

  test('a non-safe method with the matching Origin header passes', () => {
    expect(isSameOrigin(req('POST', SITE_ORIGIN), SITE_ORIGIN)).toBe(true);
    expect(isSameOrigin(req('PUT', SITE_ORIGIN), SITE_ORIGIN)).toBe(true);
    expect(isSameOrigin(req('DELETE', SITE_ORIGIN), SITE_ORIGIN)).toBe(true);
    expect(isSameOrigin(req('PATCH', SITE_ORIGIN), SITE_ORIGIN)).toBe(true);
  });

  test('a mismatched Origin header fails, including a trailing slash or subdomain', () => {
    expect(isSameOrigin(req('POST', 'https://evil.example'), SITE_ORIGIN)).toBe(false);
    expect(isSameOrigin(req('POST', SITE_ORIGIN + '/'), SITE_ORIGIN)).toBe(false);
    expect(isSameOrigin(req('POST', 'https://sub.mindustrystats.example'), SITE_ORIGIN)).toBe(false);
    expect(isSameOrigin(req('POST', 'http://mindustrystats.example'), SITE_ORIGIN)).toBe(false);
  });

  test('method comparison is case-insensitive', () => {
    expect(isSameOrigin(req('get'), SITE_ORIGIN)).toBe(true);
  });
});
