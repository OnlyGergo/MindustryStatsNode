import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Guard for DESIGN.md's one rule: every colour in the frontend comes from a theme
 * token. Flags hex/rgb()/hsl() literals and Tailwind default-palette classes in
 * frontend/src/**.ts(x). Files that legitimately hold colour data are allowlisted;
 * a single line can opt out with a `theme-ok` comment.
 */

const SRC = join(import.meta.dir, "../../frontend/src");

const ALLOW = new Set([
    "util/mindustryText.ts", // in-game colour tags are data, not styling
    "util/themeColors.ts",   // builds canvas colours from the tokens
]);

const RULES: [string, RegExp][] = [
    ["hex colour", /(?<![&\w])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/i],
    ["rgb()/hsl()", /\b(?:rgba?|hsla?)\(/],
    [
        "Tailwind palette class",
        /\b(?:text|bg|border|from|via|to|ring|fill|stroke|divide|outline|shadow|accent|decoration|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
    ],
];

function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) return files(p);
        return /\.tsx?$/.test(name) ? [p] : [];
    });
}

describe("frontend colours", () => {
    test("components only use theme tokens", () => {
        const problems: string[] = [];
        for (const file of files(SRC)) {
            const rel = relative(SRC, file).replaceAll("\\", "/");
            if (ALLOW.has(rel) || rel.endsWith(".test.ts")) continue;
            readFileSync(file, "utf8").split("\n").forEach((line, i) => {
                if (line.includes("theme-ok")) return;
                for (const [what, re] of RULES) {
                    if (re.test(line)) problems.push(`${rel}:${i + 1} ${what}: ${line.trim()}`);
                }
            });
        }
        expect(problems).toEqual([]);
    });
});
