import { afterEach, describe, expect, test } from 'bun:test';
import { fetchJsonWithRetry, FetchRetryError } from '../../frontend/src/util/fetchRetry.ts';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const mock = (...responses: (Response | Error)[]) => {
  let calls = 0;
  globalThis.fetch = (async () => {
    const r = responses[Math.min(calls++, responses.length - 1)];
    if (r instanceof Error) throw r;
    return r.clone();
  }) as unknown as typeof fetch;
  return () => calls;
};

const opts = { attempts: 4, baseDelayMs: 1 };

describe('fetchJsonWithRetry', () => {
  test('retries a Cloudflare challenge then succeeds', async () => {
    const calls = mock(
      new Response('<html>', { status: 403, headers: { 'cf-mitigated': 'challenge', 'content-type': 'text/html' } }),
      json({ ok: 1 }),
    );
    expect(await fetchJsonWithRetry('/x', opts)).toEqual({ ok: 1 });
    expect(calls()).toBe(2);
  });

  test('retries a non-JSON 200 instead of throwing', async () => {
    const calls = mock(new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }), json([1]));
    expect(await fetchJsonWithRetry('/x', opts)).toEqual([1]);
    expect(calls()).toBe(2);
  });

  test('retries network errors and 5xx', async () => {
    const calls = mock(new TypeError('boom'), json({}, 503), json({ a: 1 }));
    expect(await fetchJsonWithRetry('/x', opts)).toEqual({ a: 1 });
    expect(calls()).toBe(3);
  });

  test('does not retry a 404', async () => {
    const calls = mock(json({}, 404));
    await expect(fetchJsonWithRetry('/x', opts)).rejects.toBeInstanceOf(FetchRetryError);
    expect(calls()).toBe(1);
  });

  test('throws the last error once attempts are exhausted', async () => {
    const calls = mock(new Response('x', { status: 403, headers: { 'cf-mitigated': 'challenge' } }));
    const err = await fetchJsonWithRetry('/x', opts).catch((e) => e);
    expect(err).toBeInstanceOf(FetchRetryError);
    expect(err.challenged).toBe(true);
    expect(calls()).toBe(4);
  });

  test('abort stops retrying', async () => {
    mock(json({}, 503));
    const ac = new AbortController();
    const p = fetchJsonWithRetry('/x', { attempts: 5, baseDelayMs: 50, signal: ac.signal });
    setTimeout(() => ac.abort(), 10);
    await expect(p).rejects.toBeDefined();
  });
});
