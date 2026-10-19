// ─────────────────────────────────────────────────────────────────────────────
// imageValidation.ts
// Pure-JS checks for owner uploads (F4): sniff the real format from magic
// bytes, read width/height from the header, and strip metadata -- all without
// decoding a single pixel, so no native dependency is needed.
//
// Only PNG, JPEG and WebP are accepted. SVG is deliberately not: it is a
// document that can carry scripts, not an image. The browser-supplied
// filename and Content-Type are never trusted; the mime stored and served is
// the one sniffed here.
//
// Metadata is stripped because an owner's phone photo can carry GPS
// coordinates in its EXIF block, and these files are served publicly. The
// cost is that EXIF orientation goes with it, so a rotated phone photo shows
// as stored; a background is almost always a screenshot, which has none.
// Stripping also drops anything appended after the image's own end marker.
// ─────────────────────────────────────────────────────────────────────────────

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

export interface SniffedImage {
  mime: ImageMime;
  width: number;
  height: number;
}

export const IMAGE_EXTENSIONS: Record<ImageMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export interface ImageLimits {
  maxBytes: number;
  maxWidth: number;
  maxHeight: number;
}

export type ImageCheckResult =
  | { kind: 'ok'; image: SniffedImage; bytes: Uint8Array }
  | { kind: 'too_large' }
  | { kind: 'unsupported' }
  | { kind: 'too_many_pixels' };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const ascii = (bytes: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

const u16be = (b: Uint8Array, o: number): number => (b[o]! << 8) | b[o + 1]!;
const u32be = (b: Uint8Array, o: number): number => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const u16le = (b: Uint8Array, o: number): number => b[o]! | (b[o + 1]! << 8);
const u24le = (b: Uint8Array, o: number): number => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
const u32le = (b: Uint8Array, o: number): number => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// ── PNG ──────────────────────────────────────────────────────────────────────

/** Ancillary chunks that only carry metadata (text, EXIF, timestamps). */
const PNG_METADATA_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

function processPng(b: Uint8Array): { image: SniffedImage; bytes: Uint8Array } | null {
  if (b.length < 33 || !PNG_SIGNATURE.every((v, i) => b[i] === v)) return null;
  // The first chunk must be a 13-byte IHDR.
  if (u32be(b, 8) !== 13 || ascii(b, 12, 4) !== 'IHDR') return null;
  const width = u32be(b, 16);
  const height = u32be(b, 20);

  const kept: Uint8Array[] = [b.subarray(0, 8)];
  let offset = 8;
  let sawIdat = false;
  for (;;) {
    if (offset + 12 > b.length) return null; // ran out before IEND
    const length = u32be(b, offset);
    const type = ascii(b, offset + 4, 4);
    const end = offset + 12 + length;
    if (end > b.length) return null;

    if (type === 'IDAT') sawIdat = true;
    if (!PNG_METADATA_CHUNKS.has(type)) kept.push(b.subarray(offset, end));
    offset = end;
    if (type === 'IEND') break; // anything after IEND is dropped
  }
  if (!sawIdat) return null;

  return { image: { mime: 'image/png', width, height }, bytes: concat(kept) };
}

// ── JPEG ─────────────────────────────────────────────────────────────────────

const JPEG_APP1 = 0xe1; // EXIF / XMP
const JPEG_APP13 = 0xed; // Photoshop IPTC
const JPEG_COM = 0xfe;
const JPEG_SOS = 0xda;
const JPEG_EOI = 0xd9;

/** Start-of-frame markers: every SOFn except DHT (C4), JPG (C8) and DAC (CC). */
const isSof = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function processJpeg(b: Uint8Array): { image: SniffedImage; bytes: Uint8Array } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;

  const kept: Uint8Array[] = [b.subarray(0, 2)];
  let offset = 2;
  let width = 0;
  let height = 0;

  for (;;) {
    if (offset + 4 > b.length || b[offset] !== 0xff) return null;
    // Any number of 0xFF fill bytes may precede a marker.
    while (offset < b.length && b[offset + 1] === 0xff) offset++;
    const marker = b[offset + 1]!;
    if (marker === JPEG_EOI) return null; // an image with no scan
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) return null;

    const length = u16be(b, offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > b.length) return null;

    if (isSof(marker)) {
      if (length < 7) return null;
      height = u16be(b, offset + 5);
      width = u16be(b, offset + 7);
    }

    if (marker === JPEG_SOS) {
      if (!width || !height) return null; // a scan before any frame header
      // Entropy-coded data follows; copy through to the real EOI. 0xFF inside
      // it is always followed by 0x00 (stuffing) or a restart marker, so the
      // first 0xFFD9 is the end of the image.
      let eoi = -1;
      for (let i = end; i + 1 < b.length; i++) {
        if (b[i] === 0xff && b[i + 1] === JPEG_EOI) {
          eoi = i;
          break;
        }
      }
      if (eoi < 0) return null;
      kept.push(b.subarray(offset, eoi + 2));
      break;
    }

    if (marker !== JPEG_APP1 && marker !== JPEG_APP13 && marker !== JPEG_COM) {
      kept.push(b.subarray(offset, end));
    }
    offset = end;
  }

  return { image: { mime: 'image/jpeg', width, height }, bytes: concat(kept) };
}

// ── WebP ─────────────────────────────────────────────────────────────────────

const WEBP_METADATA_CHUNKS = new Set(['EXIF', 'XMP ']);
const VP8X_EXIF_FLAG = 0x08;
const VP8X_XMP_FLAG = 0x04;

function processWebp(b: Uint8Array): { image: SniffedImage; bytes: Uint8Array } | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const riffEnd = 8 + u32le(b, 4);
  if (riffEnd > b.length || riffEnd < 20) return null;

  const first = ascii(b, 12, 4);
  const firstData = 20;
  let width: number;
  let height: number;
  if (first === 'VP8 ') {
    // Lossy: 3-byte frame tag, then the 9D 01 2A start code, then 14-bit dimensions.
    if (b[firstData + 3] !== 0x9d || b[firstData + 4] !== 0x01 || b[firstData + 5] !== 0x2a) return null;
    width = u16le(b, firstData + 6) & 0x3fff;
    height = u16le(b, firstData + 8) & 0x3fff;
  } else if (first === 'VP8L') {
    // Lossless: 0x2F signature, then (width-1) and (height-1) as 14-bit fields.
    if (b[firstData] !== 0x2f) return null;
    const bits = u32le(b, firstData + 1);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (first === 'VP8X') {
    // Extended: canvas (width-1) and (height-1) as 24-bit fields after flags + 3 reserved bytes.
    width = u24le(b, firstData + 4) + 1;
    height = u24le(b, firstData + 7) + 1;
  } else {
    return null;
  }

  const kept: Uint8Array[] = [];
  let offset = 12;
  while (offset < riffEnd) {
    if (offset + 8 > riffEnd) return null;
    const type = ascii(b, offset, 4);
    const size = u32le(b, offset + 4);
    const end = offset + 8 + size + (size & 1); // chunks are padded to even length
    if (end > riffEnd) return null;

    if (!WEBP_METADATA_CHUNKS.has(type)) {
      if (type === 'VP8X') {
        const copy = b.slice(offset, end);
        copy[8] = copy[8]! & ~(VP8X_EXIF_FLAG | VP8X_XMP_FLAG);
        kept.push(copy);
      } else {
        kept.push(b.subarray(offset, end));
      }
    }
    offset = end;
  }

  const body = concat(kept);
  const header = new Uint8Array(12);
  header.set(b.subarray(0, 4), 0);
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  header.set(b.subarray(8, 12), 8);

  return { image: { mime: 'image/webp', width, height }, bytes: concat([header, body]) };
}

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * Sniffs, size-checks and strips an upload. The returned bytes are what gets
 * written to disk; never the original buffer.
 */
export function checkImage(bytes: Uint8Array, limits: ImageLimits): ImageCheckResult {
  if (bytes.length > limits.maxBytes) return { kind: 'too_large' };

  const result = processPng(bytes) ?? processJpeg(bytes) ?? processWebp(bytes);
  if (!result || result.image.width < 1 || result.image.height < 1) return { kind: 'unsupported' };

  if (result.image.width > limits.maxWidth || result.image.height > limits.maxHeight) {
    return { kind: 'too_many_pixels' };
  }
  return { kind: 'ok', image: result.image, bytes: result.bytes };
}
