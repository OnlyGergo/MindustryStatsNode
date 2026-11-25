import { describe, expect, test } from 'bun:test';
import { createSeoIndex } from './seoIndex.js';

describe('seoIndex', () => {
  test('loads once, answers membership, shares concurrent loads', async () => {
    let loads = 0;
    const idx = createSeoIndex(async () => { loads++; return { serverIds: [1, 2], networkIds: [7] }; });
    const [a, b] = await Promise.all([idx.isServerIndexable(1), idx.isServerIndexable(3)]);
    expect([a, b]).toEqual([true, false]);
    expect(await idx.isNetworkIndexable(7)).toBe(true);
    expect(loads).toBe(1);
  });

  test('serves the expired set while refreshing, and reloads after invalidate', async () => {
    let t = 0;
    let ids = [1];
    let loads = 0;
    const idx = createSeoIndex(async () => { loads++; return { serverIds: ids, networkIds: [] }; }, () => t);
    expect(await idx.isServerIndexable(1)).toBe(true);
    ids = [2];
    t = 3_600_000;
    expect(await idx.isServerIndexable(1)).toBe(true); // stale served
    await Promise.resolve(); await Promise.resolve();
    expect(await idx.isServerIndexable(2)).toBe(true); // refreshed
    ids = [3];
    idx.invalidate();
    expect(await idx.isServerIndexable(3)).toBe(true);
    expect(loads).toBe(3);
  });
});
