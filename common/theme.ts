/**
 * Site theme: the single source of truth for every colour on the site.
 * See DESIGN.md. A theme is a plain object of the tokens below; `themeVars`
 * turns one into CSS custom properties for a wrapper element's `style`.
 */

export const THEME_TOKENS = [
    "bg",     // page background
    "surf",   // panel / card surface
    "surf2",  // raised surface: inputs, hover, selected rows, bar tracks
    "bd",     // borders and dividers
    "tx",     // primary text
    "dim",    // secondary text, labels, axes
    "acc",    // accent: brand, primary series, active controls
    "acc2",   // second accent: secondary series, links
    "onacc",  // text drawn on an --acc fill
    "good",   // online / up / positive
    "bad",    // offline / down / errors
    "sidebg", // sidebar background
    "topbg",  // top bar and bottom nav background
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number];
export type ThemeColours = Record<ThemeToken, string>;
export interface Theme extends ThemeColours {
    id: string;
    name: string;
    note: string;
}

export const PRESETS: readonly Theme[] = [
    { id: "moth", name: "Moth", note: "copper", bg: "#15120f", surf: "#1d1914", surf2: "#26201a", bd: "#322b22", tx: "#ebe3d8", dim: "#a1958a", acc: "#d99d73", acc2: "#8da1e3", onacc: "#15120f", good: "#8fd18f", bad: "#e5826f", sidebg: "#181410", topbg: "#110e0b" },
    { id: "moss", name: "Moss", note: "sage + gold", bg: "#0f1411", surf: "#161d19", surf2: "#1e2822", bd: "#26322b", tx: "#e3ebe5", dim: "#8da295", acc: "#8fbf9f", acc2: "#e8c468", onacc: "#0f1411", good: "#8fd9a8", bad: "#e5826f", sidebg: "#121815", topbg: "#0b0f0d" },
    { id: "mint", name: "Mint", note: "neutral + mint", bg: "#111312", surf: "#181b1a", surf2: "#1f2322", bd: "#2a2f2d", tx: "#e6eae8", dim: "#8f9a96", acc: "#3ddc97", acc2: "#f0b429", onacc: "#07140d", good: "#3ddc97", bad: "#ff7a6b", sidebg: "#0f1110", topbg: "#0c0e0d" },
    { id: "violet", name: "Violet", note: "lilac + coral", bg: "#15111b", surf: "#1f1928", surf2: "#2a2236", bd: "#2f2640", tx: "#ede7f6", dim: "#a095b4", acc: "#b794f6", acc2: "#ff8fab", onacc: "#15111b", good: "#7fe0b0", bad: "#ff8f8f", sidebg: "#181320", topbg: "#110d17" },
    { id: "rose", name: "Rose", note: "rosewood + sand", bg: "#141211", surf: "#1c1816", surf2: "#26201e", bd: "#38312d", tx: "#ede5db", dim: "#a3978c", acc: "#e5645c", acc2: "#d9b36c", onacc: "#141211", good: "#8fd18f", bad: "#ff9a8a", sidebg: "#161312", topbg: "#0f0d0c" },
    { id: "glacier", name: "Glacier", note: "teal + amber", bg: "#0e1416", surf: "#151d20", surf2: "#1c2629", bd: "#263236", tx: "#e2eced", dim: "#8ba3a8", acc: "#5fc3c9", acc2: "#e0b36a", onacc: "#0a1214", good: "#7fdca0", bad: "#f08a7a", sidebg: "#111a1c", topbg: "#0a1012" },
    { id: "brass", name: "Brass", note: "gold + orchid", bg: "#131210", surf: "#1b1915", surf2: "#25221c", bd: "#34302a", tx: "#ece7dc", dim: "#a39b8c", acc: "#e0b84a", acc2: "#b98ae0", onacc: "#17130a", good: "#8fd18f", bad: "#e5826f", sidebg: "#161411", topbg: "#0f0e0c" },
    { id: "graphite", name: "Graphite", note: "monochrome", bg: "#121212", surf: "#1a1a1a", surf2: "#232323", bd: "#303030", tx: "#ececec", dim: "#9a9a9a", acc: "#f0f0f0", acc2: "#8f9aa8", onacc: "#121212", good: "#8fd18f", bad: "#e5826f", sidebg: "#151515", topbg: "#0e0e0e" },
];

export const DEFAULT_THEME_ID = "moth";

export const getPreset = (id: string | null | undefined): Theme =>
    PRESETS.find((p) => p.id === id) ?? PRESETS.find((p) => p.id === DEFAULT_THEME_ID)!;

export const DEFAULT_THEME: Theme = getPreset(DEFAULT_THEME_ID);

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function hexChannels(hex: string): [number, number, number] {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return [0, 2, 4].map((i) => parseInt(h.substring(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance (0 = black, 1 = white) of a #rgb/#rrggbb colour. */
export function lum(hex: string): number {
    if (!HEX_RE.test(hex)) return 0;
    const lin = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const [r, g, b] = hexChannels(hex);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Readable text colour for an --acc fill: near-black on light accents, white on dark ones. */
export const onAccentFor = (hex: string): string => (lum(hex) > 0.4 ? "#111111" : "#ffffff");

/** `rgba()` of a #rgb/#rrggbb colour; anything else is returned unchanged. */
export function alpha(hex: string, a: number): string {
    if (!HEX_RE.test(hex)) return hex;
    const [r, g, b] = hexChannels(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Same theme with a custom accent; --onacc is re-derived from its luminance. */
export const withAccent = <T extends Partial<ThemeColours>>(theme: T, acc: string): T & Pick<ThemeColours, "acc" | "onacc"> =>
    ({ ...theme, acc, onacc: onAccentFor(acc) });

export type ThemeVars = Record<`--${ThemeToken}`, string>;

/** CSS custom properties for a wrapper element's style. Pair it with a `data-theme` attribute. */
export function themeVars(theme: Partial<ThemeColours>): Partial<ThemeVars> {
    const out: Partial<ThemeVars> = {};
    for (const k of THEME_TOKENS) {
        const v = theme[k];
        if (v) out[`--${k}`] = v;
    }
    return out;
}
