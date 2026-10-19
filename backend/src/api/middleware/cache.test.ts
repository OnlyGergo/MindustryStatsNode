import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { clearCaches, withCache } from './cache.js';

const get = (app: { handle(r: Request): Promise<Response> }, path = '/x') =>
  app.handle(new Request(`http://localhost${path}`));

describe('withCache', () => {
  test('a hit does not extend the entry, so a hot key still expires', async () => {
    let calls = 0;
    const app = new Elysia().get('/x', () => ({ n: ++calls }), { ...withCache({ ttlMs: 80 }) });

    expect(await (await get(app)).json()).toEqual({ n: 1 });
    for (let i = 0; i < 4; i++) {
      await Bun.sleep(30);
      await get(app);
    }
    // 120ms in, with hits every 30ms: a hit-refreshed expiry would still say n: 1.
    expect(calls).toBe(2);
  });

  test('concurrent misses on one key run the handler once', async () => {
    let calls = 0;
    const app = new Elysia().get('/x', async () => {
      calls++;
      await Bun.sleep(30);
      return { n: calls };
    }, { ...withCache({ ttlMs: 60_000 }) });

    const responses = await Promise.all(Array.from({ length: 10 }, () => get(app)));
    expect(calls).toBe(1);
    for (const r of responses) expect(await r.json()).toEqual({ n: 1 });
  });

  test('waiters fall through to the handler when the leader throws', async () => {
    let calls = 0;
    const app = new Elysia()
      .onError(() => ({ error: true }))
      .get('/x', async () => {
        calls++;
        await Bun.sleep(20);
        if (calls === 1) throw new Error('boom');
        return { ok: true };
      }, { ...withCache({ ttlMs: 60_000 }) });

    const [first, second] = await Promise.all([get(app), get(app)]);
    expect(await first.json()).toEqual({ error: true });
    expect(await second.json()).toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  test('per-request headers set before the handler are never replayed', async () => {
    let seq = 0;
    const app = new Elysia()
      .onRequest(({ set }) => {
        set.headers['x-ratelimit-remaining'] = String(++seq);
        set.headers['access-control-allow-origin'] = `https://site${seq}.example`;
      })
      .get('/x', ({ set }) => {
        set.headers['x-handler'] = 'kept';
        return { ok: true };
      }, { ...withCache({ ttlMs: 60_000 }) });

    await get(app);
    const hit = await get(app);
    expect(hit.headers.get('x-cache')).toBe('HIT');
    expect(hit.headers.get('x-handler')).toBe('kept');
    expect(hit.headers.get('x-ratelimit-remaining')).toBe('2');
    expect(hit.headers.get('access-control-allow-origin')).toBe('https://site2.example');
  });

  test('a fill that started before clearCaches is not stored', async () => {
    let calls = 0;
    const app = new Elysia().get('/x', async () => {
      calls++;
      await Bun.sleep(30);
      return { n: calls };
    }, { ...withCache({ ttlMs: 60_000, name: 'clear-race' }) });

    const inFlight = get(app);
    await Bun.sleep(10);
    clearCaches('clear-race');
    await inFlight;

    expect(await (await get(app)).json()).toEqual({ n: 2 });
  });

  test('a stale hit replays at once and refreshes in the background', async () => {
    let calls = 0;
    const handler = async () => {
      calls++;
      await Bun.sleep(40);
      return { n: calls };
    };
    const app = new Elysia().get('/x', handler, {
      ...withCache({ ttlMs: 30, staleWhileRevalidate: { staleMs: 60_000, refresh: handler } }),
    });

    expect(await (await get(app)).json()).toEqual({ n: 1 });
    await Bun.sleep(40);

    // Expired: three stale hits come back without waiting, and start one refresh.
    const started = performance.now();
    const stale = await Promise.all([get(app), get(app), get(app)]);
    expect(performance.now() - started).toBeLessThan(30);
    for (const r of stale) expect(await r.json()).toEqual({ n: 1 });

    await Bun.sleep(60);
    expect(calls).toBe(2);
    const fresh = await get(app);
    expect(fresh.headers.get('x-cache')).toBe('HIT');
    expect(await fresh.json()).toEqual({ n: 2 });
  });

  test('a failed refresh keeps serving the stale entry', async () => {
    let calls = 0;
    const handler = () => {
      if (++calls > 1) throw new Error('db down');
      return { n: calls };
    };
    const app = new Elysia().get('/x', handler, {
      ...withCache({ ttlMs: 20, staleWhileRevalidate: { staleMs: 60_000, refresh: handler } }),
    });

    await get(app);
    await Bun.sleep(30);
    expect(await (await get(app)).json()).toEqual({ n: 1 });
    await Bun.sleep(10);
    expect(await (await get(app)).json()).toEqual({ n: 1 });
  });

  test('without staleWhileRevalidate an expired entry is a plain miss', async () => {
    let calls = 0;
    const app = new Elysia().get('/x', () => ({ n: ++calls }), { ...withCache({ ttlMs: 20 }) });

    await get(app);
    await Bun.sleep(30);
    expect(await (await get(app)).json()).toEqual({ n: 2 });
  });
});
