import { describe, expect, test } from "bun:test";
import { alpha, DEFAULT_THEME, getPreset, lum, onAccentFor, PRESETS, THEME_TOKENS, themeVars, withAccent } from "../../common/theme.ts";

describe("theme", () => {
    test("every preset defines every token as a hex colour", () => {
        expect(PRESETS.length).toBe(8);
        for (const p of PRESETS) {
            for (const k of THEME_TOKENS) expect(p[k]).toMatch(/^#[0-9a-f]{6}$/i);
        }
        expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    });

    test("moth is the default and unknown ids fall back to it", () => {
        expect(DEFAULT_THEME.id).toBe("moth");
        expect(getPreset("nope").id).toBe("moth");
        expect(getPreset("violet").id).toBe("violet");
    });

    test("lum matches the WCAG endpoints", () => {
        expect(lum("#000000")).toBe(0);
        expect(lum("#ffffff")).toBeCloseTo(1, 5);
        expect(lum("#fff")).toBeCloseTo(1, 5);
        expect(lum("not a colour")).toBe(0);
    });

    test("onAccentFor picks dark text on light accents and white on dark ones", () => {
        expect(onAccentFor("#f0f0f0")).toBe("#111111");
        expect(onAccentFor("#3ddc97")).toBe("#111111");
        expect(onAccentFor("#1d4ed8")).toBe("#ffffff");
    });

    test("withAccent re-derives onacc", () => {
        const t = withAccent(DEFAULT_THEME, "#1d4ed8");
        expect(t.acc).toBe("#1d4ed8");
        expect(t.onacc).toBe("#ffffff");
        expect(t.bg).toBe(DEFAULT_THEME.bg);
    });

    test("themeVars emits one --token per set colour and skips the rest", () => {
        const all = themeVars(DEFAULT_THEME);
        expect(Object.keys(all).sort()).toEqual(THEME_TOKENS.map((k) => `--${k}`).sort());
        expect(themeVars({ acc: "#123456" })).toEqual({ "--acc": "#123456" });
    });

    test("alpha converts hex to rgba", () => {
        expect(alpha("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.5)");
        expect(alpha("var(--x)", 0.5)).toBe("var(--x)");
    });
});
