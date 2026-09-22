import { describe, expect, test } from 'bun:test';
import { discordAvatarUrl } from './discordAvatar.js';

describe('discordAvatarUrl', () => {
  test('builds a CDN URL for a static (png) avatar hash', () => {
    expect(discordAvatarUrl('123456789012345678', 'abcdef0123456789abcdef0123456789')).toBe(
      'https://cdn.discordapp.com/avatars/123456789012345678/abcdef0123456789abcdef0123456789.png?size=64',
    );
  });

  test('uses .gif for animated (a_ prefixed) avatar hashes', () => {
    expect(discordAvatarUrl('123456789012345678', 'a_abcdef0123456789abcdef0123456789')).toBe(
      'https://cdn.discordapp.com/avatars/123456789012345678/a_abcdef0123456789abcdef0123456789.gif?size=64',
    );
  });

  test('falls back to a default avatar keyed on (id >> 22) % 6 when hash is null', () => {
    const id = '250902435361226752'; // a real-looking Discord snowflake
    const expectedIndex = Number((BigInt(id) >> 22n) % 6n);
    expect(discordAvatarUrl(id, null)).toBe(
      `https://cdn.discordapp.com/embed/avatars/${expectedIndex}.png`,
    );
  });

  test('default avatar index is stable and in range 0-5', () => {
    for (const id of ['1', '123', '999999999999999999', '80351110224678912']) {
      const url = discordAvatarUrl(id, null);
      const match = url.match(/avatars\/(\d)\.png$/);
      expect(match).not.toBeNull();
      const index = Number(match![1]);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThanOrEqual(5);
    }
  });
});
