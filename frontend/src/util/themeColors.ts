import type uPlot from "uplot";
import { alpha, type ThemeToken } from "../../../common/theme.ts";

/**
 * Theme colours for code that can't use CSS variables directly: uPlot draws on
 * a canvas, and canvas fill/stroke styles can't resolve var() (or be trusted
 * with color-mix()). Everything here reads the 13 base tokens off an element,
 * so a chart inside a [data-theme] wrapper gets that wrapper's theme.
 * See DESIGN.md, "Charts".
 */

export { alpha };

/** Fired after something changes the theme variables; useUPlot redraws every chart on it. */
export const THEME_CHANGE_EVENT = "theme-change";
export const notifyThemeChange = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
};

/** The resolved value of a theme token (`--acc` ...) on `el`, as a hex string. */
export function cssToken(el: Element | null | undefined, token: ThemeToken): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(el ?? document.documentElement).getPropertyValue(`--${token}`).trim();
}

function rgbOf(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.substring(i, i + 2), 16)) as [number, number, number];
}

/** `weight` of `a` mixed into `b` (the same as color-mix(in srgb, a weight%, b)). */
export function mix(a: string, b: string, weight: number): string {
  const x = rgbOf(a), y = rgbOf(b);
  if (!x || !y) return a;
  const c = x.map((v, i) => Math.round(v * weight + y[i] * (1 - weight)));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/** Chart gridlines: the same value as index.css's --grid. */
export const gridColor = (el: Element) => mix(cssToken(el, "bd"), cssToken(el, "bg"), 0.8);

/** Stable hue (0-359) for a series name, so a gamemode keeps its colour everywhere. */
export function modeHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}

// Saturation/lightness come from --acc, clamped so a grey accent (Graphite)
// still gives distinct series and a very dark or light one stays readable.
const S_RANGE = [35, 80] as const;
const L_RANGE = [50, 70] as const;
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

function accentSL(el: Element): [number, number] {
  const rgb = rgbOf(cssToken(el, "acc"));
  if (!rgb) return [60, 60];
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return [s * 100, l * 100];
}

/** Canvas colour for a named series: its hash hue at the theme accent's saturation/lightness. */
export function seriesColor(el: Element, hue: number): string {
  const [s, l] = accentSL(el);
  return `hsl(${hue}, ${clamp(s, S_RANGE).toFixed(0)}%, ${clamp(l, L_RANGE).toFixed(0)}%)`;
}

/** Darker, solid version of seriesColor for stacked area fills. */
export function seriesFill(el: Element, hue: number): string {
  const [s, l] = accentSL(el);
  return `hsl(${hue}, ${(clamp(s, S_RANGE) - 15).toFixed(0)}%, ${(clamp(l, L_RANGE) - 18).toFixed(0)}%)`;
}

/** Concrete colour of a named series ("Other"/null use --dim) for canvas and tooltips. */
export function labelColor(el: Element, label: string | null, other = false): string {
  return label == null || other ? cssToken(el, "dim") : seriesColor(el, modeHue(label));
}

// uPlot accepts a function anywhere it takes a stroke or fill, and calls it on
// every draw, which is what lets a theme change reach the canvas.
export const tokenStroke = (token: ThemeToken) => (u: uPlot) => cssToken(u.root, token);
export const tokenAlpha = (token: ThemeToken, a: number) => (u: uPlot) => alpha(cssToken(u.root, token), a);
