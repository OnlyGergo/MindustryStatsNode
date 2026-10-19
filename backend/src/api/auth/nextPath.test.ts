import { describe, expect, test } from 'bun:test';
import { safeNextPath } from './nextPath.js';

const SITE_ORIGIN = 'https://mindustrystats.example';

describe('safeNextPath', () => {
  test('allows a plain same-origin path', () => {
    expect(safeNextPath('/server/5', SITE_ORIGIN)).toBe('/server/5');
  });

  test('allows path + query + hash', () => {
    expect(safeNextPath('/server/5?x=1#y', SITE_ORIGIN)).toBe('/server/5?x=1#y');
  });

  test('defaults to / for missing/undefined/non-string input', () => {
    expect(safeNextPath(undefined, SITE_ORIGIN)).toBe('/');
    expect(safeNextPath(null, SITE_ORIGIN)).toBe('/');
    expect(safeNextPath(123, SITE_ORIGIN)).toBe('/');
    expect(safeNextPath('', SITE_ORIGIN)).toBe('/');
  });

  test('rejects protocol-relative URLs (//evil.com)', () => {
    expect(safeNextPath('//evil.com', SITE_ORIGIN)).toBe('/');
    expect(safeNextPath('//evil.com/path', SITE_ORIGIN)).toBe('/');
  });

  test('rejects backslash tricks', () => {
    expect(safeNextPath('/\\evil.com', SITE_ORIGIN)).toBe('/');
    expect(safeNextPath('\\\\evil.com', SITE_ORIGIN)).toBe('/');
    expect(safeNextPath('/a\\b', SITE_ORIGIN)).toBe('/');
  });

  test('rejects absolute off-origin URLs', () => {
    expect(safeNextPath('https://evil.com', SITE_ORIGIN)).toBe('/');
    expect(safeNextPath('https://evil.com/path', SITE_ORIGIN)).toBe('/');
    expect(safeNextPath('http://mindustrystats.example', SITE_ORIGIN)).toBe('/'); // wrong scheme
  });

  test('rejects API paths', () => {
    expect(safeNextPath('/api/auth/logout', SITE_ORIGIN)).toBe('/');
    expect(safeNextPath('/api/servers/5', SITE_ORIGIN)).toBe('/');
  });

  test('rejects a javascript: scheme', () => {
    expect(safeNextPath('javascript:alert(1)', SITE_ORIGIN)).toBe('/');
  });

  test('rejects encoded slash tricks used to slip past naive prefix checks', () => {
    // Does not decode %2F, so this resolves to a literal same-origin path,
    // never an off-site hop -- but it must never be treated as "//evil.com".
    expect(safeNextPath('/%2F%2Fevil.com', SITE_ORIGIN)).toBe('/%2F%2Fevil.com');
    expect(safeNextPath('%2F%2Fevil.com', SITE_ORIGIN)).toBe('/');
  });

  test('rejects control characters and whitespace', () => {
    expect(safeNextPath('/a\nb', SITE_ORIGIN)).toBe('/');
    expect(safeNextPath('/a\tb', SITE_ORIGIN)).toBe('/');
    expect(safeNextPath('/a b', SITE_ORIGIN)).toBe('/');
    expect(safeNextPath('/a\0b', SITE_ORIGIN)).toBe('/');
  });

  test('rejects paths not starting with /', () => {
    expect(safeNextPath('server/5', SITE_ORIGIN)).toBe('/');
    expect(safeNextPath('', SITE_ORIGIN)).toBe('/');
  });

  test('rejects overly long paths', () => {
    expect(safeNextPath('/' + 'a'.repeat(600), SITE_ORIGIN)).toBe('/');
  });

  test('allows a bare slash', () => {
    expect(safeNextPath('/', SITE_ORIGIN)).toBe('/');
  });
});
