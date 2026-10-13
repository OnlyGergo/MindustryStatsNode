import { describe, expect, test } from 'bun:test';
import { checkImage, type ImageLimits } from './imageValidation.js';

// Tiny real images (made with Pillow), each carrying the string "SecretCam" as metadata.
const PNG_WITH_TEXT = 'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEXRFWHRDb21tZW50AFNlY3JldENhbfebO90AAAAQSURBVHicY/zPAAVMMAYDABMpAQPw2AeEAAAAAElFTkSuQmCC';
const JPEG_WITH_EXIF = '/9j/4AAQSkZJRgABAQAAAQABAAD/4QAsRXhpZgAATU0AKgAAAAgAAQEPAAIAAAAKAAAAGgAAAABTZWNyZXRDYW0A/9sAQwAIBgYHBgUIBwcHCQkICgwUDQwLCwwZEhMPFB0aHx4dGhwcICQuJyAiLCMcHCg3KSwwMTQ0NB8nOT04MjwuMzQy/9sAQwEJCQkMCwwYDQ0YMiEcITIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy/8AAEQgAAwAEAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/aAAwDAQACEQMRAD8A1qKKK/ND8gP/2Q==';
const WEBP_LOSSY_WITH_EXIF = 'UklGRngAAABXRUJQVlA4WAoAAAAIAAAABAAAAwAAVlA4IC4AAACwAQCdASoFAAQAAsBMJaACdAEO/gLsAP74Ryo/9tD//20P//bQ/6jvBskU5IAARVhJRiQAAABNTQAqAAAACAABAQ8AAgAAAAoAAAAaAAAAAFNlY3JldENhbQA=';
const WEBP_LOSSLESS = 'UklGRhwAAABXRUJQVlA4TA8AAAAvBYABEAcQ0f8CBiKi/wEA';
const WEBP_LOSSY = 'UklGRjoAAABXRUJQVlA4IC4AAACwAQCdASoJAAgAAsBMJaACdAEO/gLsAP74Ryo/9tD//20P//bQ/6jvBskU5IAA';

const LIMITS: ImageLimits = { maxBytes: 2 * 1024 * 1024, maxWidth: 3840, maxHeight: 2160 };

const bytesOf = (b64: string): Uint8Array => new Uint8Array(Buffer.from(b64, 'base64'));
const contains = (haystack: Uint8Array, needle: string): boolean => Buffer.from(haystack).includes(needle);

function expectOk(input: Uint8Array) {
  const result = checkImage(input, LIMITS);
  if (result.kind !== 'ok') throw new Error(`expected ok, got ${result.kind}`);
  return result;
}

describe('checkImage', () => {
  test('PNG: sniffs dimensions and drops text chunks', () => {
    const input = bytesOf(PNG_WITH_TEXT);
    expect(contains(input, 'SecretCam')).toBe(true);
    const { image, bytes } = expectOk(input);
    expect(image).toEqual({ mime: 'image/png', width: 3, height: 2 });
    expect(contains(bytes, 'SecretCam')).toBe(false);
    // Still a well-formed PNG once stripped.
    expect(expectOk(bytes).image).toEqual(image);
  });

  test('PNG: drops data appended after IEND', () => {
    const input = Buffer.concat([bytesOf(PNG_WITH_TEXT), Buffer.from('<script>alert(1)</script>')]);
    const { bytes } = expectOk(new Uint8Array(input));
    expect(contains(bytes, '<script>')).toBe(false);
  });

  test('JPEG: sniffs dimensions and drops EXIF', () => {
    const input = bytesOf(JPEG_WITH_EXIF);
    expect(contains(input, 'SecretCam')).toBe(true);
    const { image, bytes } = expectOk(input);
    expect(image).toEqual({ mime: 'image/jpeg', width: 4, height: 3 });
    expect(contains(bytes, 'SecretCam')).toBe(false);
    expect(contains(bytes, 'JFIF')).toBe(true);
    expect(bytes[bytes.length - 2]).toBe(0xff);
    expect(bytes[bytes.length - 1]).toBe(0xd9);
    expect(expectOk(bytes).image).toEqual(image);
  });

  test('WebP (VP8X): sniffs canvas size, drops EXIF and clears its flag', () => {
    const input = bytesOf(WEBP_LOSSY_WITH_EXIF);
    expect(contains(input, 'SecretCam')).toBe(true);
    const { image, bytes } = expectOk(input);
    expect(image).toEqual({ mime: 'image/webp', width: 5, height: 4 });
    expect(contains(bytes, 'SecretCam')).toBe(false);
    expect(bytes[20]! & 0x08).toBe(0);
    // RIFF size matches the rewritten file.
    expect(new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true)).toBe(bytes.length - 8);
    expect(expectOk(bytes).image).toEqual(image);
  });

  test('WebP (VP8 / VP8L): sniffs dimensions', () => {
    expect(expectOk(bytesOf(WEBP_LOSSY)).image).toEqual({ mime: 'image/webp', width: 9, height: 8 });
    expect(expectOk(bytesOf(WEBP_LOSSLESS)).image).toEqual({ mime: 'image/webp', width: 6, height: 7 });
  });

  test('rejects anything that is not PNG/JPEG/WebP', () => {
    const exe = new Uint8Array(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]));
    expect(checkImage(exe, LIMITS).kind).toBe('unsupported');
    const svg = new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
    expect(checkImage(svg, LIMITS).kind).toBe('unsupported');
    const gif = new Uint8Array(Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;'));
    expect(checkImage(gif, LIMITS).kind).toBe('unsupported');
    expect(checkImage(new Uint8Array(), LIMITS).kind).toBe('unsupported');
  });

  test('rejects a truncated image', () => {
    for (const b64 of [PNG_WITH_TEXT, JPEG_WITH_EXIF, WEBP_LOSSY_WITH_EXIF]) {
      const full = bytesOf(b64);
      expect(checkImage(full.subarray(0, full.length - 6), LIMITS).kind).toBe('unsupported');
    }
  });

  test('enforces the byte and dimension limits', () => {
    const png = bytesOf(PNG_WITH_TEXT);
    expect(checkImage(png, { ...LIMITS, maxBytes: png.length - 1 }).kind).toBe('too_large');
    expect(checkImage(png, { ...LIMITS, maxWidth: 2 }).kind).toBe('too_many_pixels');
    expect(checkImage(png, { ...LIMITS, maxHeight: 1 }).kind).toBe('too_many_pixels');
  });
});
