import { GamemodeHistoryEntry, ServerShareEntry } from "../../../common/models/GlobalStatsTypes.js";
import { theme } from "../theme.ts";

export type DateRangeOption = "1d" | "7d" | "14d" | "3m" | "12m";
// Note: Changed from "stacked" to "lines" based on the request to remove stacking
export type ViewMode = "lines" | "aggregated";

export interface DateRange {
    label: string;
    value: DateRangeOption;
}

export const DATE_RANGE_OPTIONS: DateRange[] = [
    { label: "1 Day", value: "1d" },
    { label: "7 Days", value: "7d" },
    { label: "14 Days", value: "14d" },
    { label: "3 Months", value: "3m" },
    { label: "12 Months", value: "12m" },
];

function stringToColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 75%, 60%)`;
}

export function getModeColor(modeName: string | null): string {
    if (!modeName) return "#ffffff";
    const lowerName = modeName.toLowerCase();
    if (theme?.modeColors?.[lowerName]) {
        return theme.modeColors[lowerName];
    }
    return stringToColor(modeName);
}

export function formatTimestampLabel(timestampMs: number, range: DateRangeOption): string {
    const date = new Date(timestampMs);
    if (range === "1d") {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (range === "7d" || range === "14d") {
        return date.toLocaleDateString([], { weekday: "short", hour: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * Build an O(n) lookup map: { timestamp -> { modeName -> players } }
 */
export function buildGamemodeIndex(
    data: GamemodeHistoryEntry[],
): Map<number, Map<string, number>> {
    const index = new Map<number, Map<string, number>>();
    for (const entry of data) {
        let tsMap = index.get(entry.timestamp);
        if (!tsMap) {
            tsMap = new Map();
            index.set(entry.timestamp, tsMap);
        }
        const existing = tsMap.get(entry.modeName) ?? 0;
        tsMap.set(entry.modeName, existing + (entry.players ?? 0));
    }
    return index;
}

export function buildServerShareIndex(
    data: ServerShareEntry[],
): Map<number, Map<string, number>> {
    const index = new Map<number, Map<string, number>>();
    for (const entry of data) {
        let tsMap = index.get(entry.timestamp);
        if (!tsMap) {
            tsMap = new Map();
            index.set(entry.timestamp, tsMap);
        }
        tsMap.set(entry.groupName, entry.players ?? 0);
    }
    return index;
}

/**
 * Build standard uPlot-compatible AlignedData arrays.
 *
 * uPlot expects:   data[0] = x values (timestamps in SECONDS)
 *                  data[1..n] = y values per series
 */
export function buildUPlotData(
    timestamps: number[],          // milliseconds
    gamemodes: string[],
    index: Map<number, Map<string, number>>,
    viewMode: ViewMode,
): (number | null)[][] {
    // uPlot x-axis is in seconds
    const xs = timestamps.map((ts) => ts / 1000);

    if (viewMode === "aggregated") {
        const raw = timestamps.map((ts) => {
            const tsMap = index.get(ts);
            if (!tsMap || tsMap.size === 0) return null;
            let sum = 0;
            tsMap.forEach((v) => (sum += v));
            return sum;
        });
        return [xs, raw];
    }

    // ── Standard Multi-Line mode ─────────────────────────────────────────────
    // Raw rows — one array per gamemode
    const rows: (number | null)[][] = gamemodes.map((mode) =>
        timestamps.map((ts) => {
            const v = index.get(ts)?.get(mode);
            // Treat missing as null (not zero) so lines break correctly
            return v != null ? v : null;
        }),
    );

    // This perfectly matches uPlot's required AlignedData format
    return [xs, ...rows];
}