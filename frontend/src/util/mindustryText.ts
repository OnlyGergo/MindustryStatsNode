/**
 * Renders Mindustry colour markup as an inline element in a safe way
 *
 *   <mindustry-text text="[orange]Welcome to [#ffd700]Frontier[]!"></mindustry-text>
 *   <mindustry-text watercolor>[red]Raw markup as plain child text[]</mindustry-text>
 *
 * Markup supported
 *   [red] [lightgray] ...  named colours (Mindustry's Palette)
 *   [#rrggbb] [#rrggbbaa]  hex, '#' optional (as in Mindustry's parseColorOrNull)
 *   []                     pop back to the previous colour
 *   [[                     literal '['
 *
 * Alpha is never allowed below 20% (MIN_ALPHA).
 * Output is built with DOM nodes only (never innerHTML), so it is XSS-safe.
 */

/* -------------------------------------------------------------------------- */
/* Colours                                                                    */
/* -------------------------------------------------------------------------- */

/** Colours are packed as unsigned 0xRRGGBBAA. */
export type PackedColor = number;

/** 20% of 255. */
export const MIN_ALPHA = 51;

/** Names are matched lowercase with '_' removed, so lightGray / LIGHT_GRAY / lightgray all work. */
const NAMED_COLORS: Record<string, PackedColor> = {
  white: 0xffffffff,
  lightgray: 0xbfbfbfff, lightgrey: 0xbfbfbfff, // Can't find the source, but the Mindustry client does something similar
  gray: 0x7f7f7fff,      grey: 0x7f7f7fff,      // Gray is the Mindustry version Grey is UK english
  darkgray: 0x3f3f3fff,  darkgrey: 0x3f3f3fff,
  black: 0x000000ff,
  clear: 0x00000000, // clamped to 20% alpha on lookup

  blue: 0x0000ffff,
  navy: 0x000080ff, // 0.5f
  royal: 0x4169e1ff,
  slate: 0x708090ff,
  sky: 0x87ceebff,
  cyan: 0x00ffffff,
  teal: 0x008080ff, // 0.5f

  green: 0x00ff00ff,
  acid: 0x7fff00ff,
  lime: 0x32cd32ff,
  forest: 0x228b22ff,
  olive: 0x6b8e23ff,

  yellow: 0xffff00ff,
  gold: 0xffd700ff,
  goldenrod: 0xdaa520ff,
  orange: 0xffa500ff,

  brown: 0x8b4513ff,
  tan: 0xd2b48cff,
  brick: 0xb22222ff,

  red: 0xff0000ff,
  scarlet: 0xff341cff,
  crimson: 0xdc143cff,
  coral: 0xff7f50ff,
  salmon: 0xfa8072ff,
  pink: 0xff69b4ff,
  magenta: 0xff00ffff,

  purple: 0xa020f0ff,
  violet: 0xee82eeff,
  maroon: 0xb03060ff,

  // https://github.com/Anuken/Mindustry/blob/17012d61d9e4c3cbd9820d87e81c24495486ac53/core/src/mindustry/core/UI.java#L101
  accent: 0xffd37fff,
  unlaunched: 0x8982edff,
  highlight: 0xffe0a5ff, // accent lerp by 0.3 towards white
  stat: 0xffd37fff,
  negstat: 0xe55454ff,
};

function clampAlpha(c: PackedColor): PackedColor {
  return (c & 0xff) >= MIN_ALPHA ? c : (((c & 0xffffff00) | MIN_ALPHA) >>> 0);
}

function hexDigit(code: number): number {
  if (code >= 48 && code <= 57) return code - 48; // 0-9
  if (code >= 97 && code <= 102) return code - 87; // a-f
  if (code >= 65 && code <= 70) return code - 55; // A-F
  return -1;
}

/** Port of Arc: optional '#' and any amount of valid hex digits 
 * Source: https://github.com/Anuken/Arc/blob/7445105cd2683daf5b9ac7033ebb07265d3e814d/arc-core/src/arc/graphics/g2d/GlyphLayout.java#L427
 */
function parseMarkupHex(tag: string): PackedColor | null {
  const d = tag.length - 1;
  if (d < 1 || d > 8 || d === 7) return null;
  let c = 0;
  for (let i = 1; i <= d; i++) {
    const v = hexDigit(tag.charCodeAt(i));
    if (v < 0) return null;
    c = c * 16 + v;
  }
  if (d <= 6) c = c * 16 ** (8 - d) + 0xff;
  return c >>> 0;
}

/** Resolves the inside of a [tag]: named colour first, then hex. */
export function parseColor(tag: string): PackedColor | null {
  if (!tag) return null;
  const c = tag.charCodeAt(0) === 35 ? parseMarkupHex(tag) : NAMED_COLORS[tag];
  return c === undefined || c === null ? null : clampAlpha(c);
}

/* -------------------------------------------------------------------------- */
/* Parser                                                                     */
/* -------------------------------------------------------------------------- */

export interface Segment {
  text: string;
  /** null = inherit the surrounding CSS colour */
  color: PackedColor | null;
}

const MAX_TAG_LENGTH = 10; // longest real tag is '#rrggbbaa' (9); anything longer is just text
const MAX_STACK = 256;
const CACHE_LIMIT = 500;

const parseCache = new Map<string, Segment[]>();

/**
 * Splits markup into coloured runs. Adjacent runs with the same colour are merged.
 * Unknown tags such as [foo] are kept as literal text.
 * Results are cached; treat the returned array as read-only.
 * 
 * Spot-on with https://github.com/Anuken/Arc/blob/7445105cd2683daf5b9ac7033ebb07265d3e814d/arc-core/src/arc/graphics/g2d/GlyphLayout.java#L73
 */
export function parseMindustry(src: string): Segment[] {
  const cached = parseCache.get(src);
  if (cached) return cached;

  const out: Segment[] = [];
  const stack: (PackedColor | null)[] = [];
  let color: PackedColor | null = null;
  let buf = "";

  const flush = (): void => {
    if (!buf) return;
    const last = out[out.length - 1];
    if (last && last.color === color) last.text += buf;
    else out.push({ text: buf, color });
    buf = "";
  };

  const n = src.length;
  let i = 0;
  while (i < n) {
    const open = src.indexOf("[", i);
    if (open === -1) {
      buf += src.slice(i);
      break;
    }
    buf += src.slice(i, open);

    // "[[" -> literal "["
    if (src.charCodeAt(open + 1) === 91) {
      buf += "[";
      i = open + 2;
      continue;
    }

    const close = src.indexOf("]", open + 1);
    if (close === -1 || close - open - 1 > MAX_TAG_LENGTH) {
      buf += "[";
      i = open + 1;
      continue;
    }

    const tag = src.slice(open + 1, close);

    // "[]" -> pop
    if (tag === "") {
      flush();
      color = stack.length ? stack.pop()! : null;
      i = close + 1;
      continue;
    }

    const parsed = parseColor(tag);
    if (parsed === null) {
      buf += "[";
      i = open + 1;
      continue;
    }

    flush();
    if (stack.length < MAX_STACK) stack.push(color);
    color = parsed;
    i = close + 1;
  }
  flush();

  if (parseCache.size >= CACHE_LIMIT) {
    const oldest = parseCache.keys().next().value;
    if (oldest !== undefined) parseCache.delete(oldest);
  }
  parseCache.set(src, out);
  return out;
}

/** Plain text with all colour tags removed (handy for titles, aria-labels, logs). */
export function stripMindustry(src: string): string {
  let s = "";
  for (const seg of parseMindustry(src)) s += seg.text;
  return s;
}

/* -------------------------------------------------------------------------- */
/* Watercolour + rendering                                                    */
/* -------------------------------------------------------------------------- */

export interface WatercolorOptions {
  /** 0-1, how far each channel moves toward mid-grey. Default 0.35 */
  strength?: number;
  /** 0-1 multiplier applied after. Default 0.88 */
  dim?: number;
}

export interface RenderOptions {
  /** true = defaults, or pass custom values. Omit/false = colours untouched. */
  watercolor?: boolean | WatercolorOptions;
}

const DEFAULT_STRENGTH = 0.35;
const DEFAULT_DIM = 0.88;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function toCss(c: PackedColor, wc: { t: number; dim: number } | null): string {
  let r = c >>> 24;
  let g = (c >>> 16) & 255;
  let b = (c >>> 8) & 255;
  const a = c & 255;

  if (wc) {
    const soften = (v: number): number => Math.round((v + (128 - v) * wc.t) * wc.dim);
    r = soften(r);
    g = soften(g);
    b = soften(b);
  }
  return a === 255 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${(a / 255).toFixed(3)})`;
}

function resolveWatercolor(opt: RenderOptions["watercolor"]): { t: number; dim: number } | null {
  if (!opt) return null;
  const o = opt === true ? {} : opt;
  return { t: clamp01(o.strength ?? DEFAULT_STRENGTH), dim: clamp01(o.dim ?? DEFAULT_DIM) };
}

/** Builds a DocumentFragment: text nodes for uncoloured runs, one <span> per coloured run. */
export function renderMindustry(src: string, options: RenderOptions = {}): DocumentFragment {
  const wc = resolveWatercolor(options.watercolor);
  const frag = document.createDocumentFragment();
  const cssCache = new Map<PackedColor, string>();

  for (const seg of parseMindustry(src)) {
    if (seg.color === null) {
      frag.appendChild(document.createTextNode(seg.text));
      continue;
    }
    let css = cssCache.get(seg.color);
    if (css === undefined) {
      css = toCss(seg.color, wc);
      cssCache.set(seg.color, css);
    }
    const span = document.createElement("span");
    span.style.color = css;
    span.textContent = seg.text;
    frag.appendChild(span);
  }
  return frag;
}