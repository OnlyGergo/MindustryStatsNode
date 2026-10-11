import type uPlot from "uplot";
import { GamemodeHistoryEntry, ServerShareEntry } from "../../../common/models/GlobalStatsTypes.js";

export type DateRangeOption = "1d" | "7d" | "14d" | "3m" | "12m";
// "share" is the market-share view: a 100% stacked area of each series' slice
// of the total at every instant (see buildShareData).
export type ViewMode = "share" | "lines" | "aggregated";

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

function stringToHue(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash) % 360;
}

function stringToColor(str: string): string {
    return `hsl(${stringToHue(str)}, 75%, 60%)`;
}

export function getModeColor(modeName: string | null): string {
    if (!modeName) return "#ffffff";
    //const lowerName = modeName.toLowerCase();
    //if (theme?.modeColors?.[lowerName]) {
    //    return theme.modeColors[lowerName];
    //}
    return stringToColor(modeName);
}

/** Solid, slightly darker fill of getModeColor, for stacked areas. */
export function getModeFill(modeName: string | null): string {
    if (!modeName) return "#525252";
    return `hsl(${stringToHue(modeName)}, 60%, 42%)`;
}

export const SHARE_OTHER_LABEL = "Other";

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
        // A group can have several servers live at the same instant; they are
        // distinct canonical servers, so summing them is the group's total.
        tsMap.set(entry.groupName, (tsMap.get(entry.groupName) ?? 0) + (entry.players ?? 0));
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

export interface ShareData {
    /** Stack order, bottom first. Hidden keys are folded into SHARE_OTHER_LABEL. */
    labels: string[];
    /**
     * uPlot AlignedData. data[1..n] are CUMULATIVE percentages, stored top of
     * stack first so each opaque area filled down to 0 is painted before the
     * ones beneath it and never covers them.
     */
    data: (number | null)[][];
    /** Per label (same order as `labels`): raw players at each timestamp. */
    players: (number | null)[][];
    /** Per timestamp: total players across every key, hidden ones included. */
    totals: (number | null)[];
}

/**
 * Build a market-share (100% stacked area) view of an index.
 *
 * Shares are always of the whole total, so hiding a series in the legend moves
 * it into "Other" rather than inflating everyone else's share.  A timestamp with
 * no players at all is a gap (null), not an even split of nothing; within a
 * timestamp that has players, a key with no value is simply 0%.
 *
 * Bottom-to-top order is by total players over the period, so the biggest
 * slice sits on the flat baseline where its size is easiest to read.
 */
export function buildShareData(
    timestamps: number[],          // milliseconds
    keys: string[],
    index: Map<number, Map<string, number>>,
    visible: Set<string>,
): ShareData {
    const xs = timestamps.map((ts) => ts / 1000);

    const volume = new Map<string, number>();
    for (const tsMap of index.values()) {
        tsMap.forEach((v, k) => volume.set(k, (volume.get(k) ?? 0) + v));
    }

    const shown = keys
        .filter((k) => visible.has(k))
        .sort((a, b) => (volume.get(b) ?? 0) - (volume.get(a) ?? 0));
    const hidden = keys.filter((k) => !visible.has(k));

    const totals = timestamps.map((ts) => {
        const tsMap = index.get(ts);
        if (!tsMap) return null;
        let sum = 0;
        tsMap.forEach((v) => (sum += v));
        return sum > 0 ? sum : null;
    });

    const players: (number | null)[][] = shown.map((k) =>
        timestamps.map((ts, i) => (totals[i] == null ? null : (index.get(ts)?.get(k) ?? 0))),
    );
    const labels = [...shown];

    const other = timestamps.map((ts, i) => {
        if (totals[i] == null) return null;
        const tsMap = index.get(ts)!;
        let sum = 0;
        for (const k of hidden) sum += tsMap.get(k) ?? 0;
        return sum;
    });
    if (other.some((v) => v != null && v > 0)) {
        labels.push(SHARE_OTHER_LABEL);
        players.push(other);
    }

    const cumulative: (number | null)[][] = [];
    const running = timestamps.map(() => 0);
    for (const row of players) {
        cumulative.push(row.map((v, i) => {
            const total = totals[i];
            if (total == null || v == null) return null;
            running[i] += v;
            return (running[i] / total) * 100;
        }));
    }

    return { labels, data: [xs, ...cumulative.reverse()], players, totals };
}

/**
 * Absolute-value stacked view: same ShareData shape as buildShareData (so
 * buildShareSeries and the tooltip helpers work unchanged) but `data` holds
 * cumulative player counts instead of percentages.  `players` rows are given
 * bottom of stack first; the stack height at each timestamp is their sum, and a
 * timestamp where `totals` is null (every row null) stays a gap.
 */
export function buildStackedData(
    timestamps: number[],          // milliseconds
    labels: string[],
    players: (number | null)[][],
): ShareData {
    const xs = timestamps.map((ts) => ts / 1000);
    const totals = timestamps.map((_, i) => {
        if (players.every((row) => row[i] == null)) return null;
        let sum = 0;
        for (const row of players) sum += row[i] ?? 0;
        return sum;
    });

    const running = timestamps.map(() => 0);
    const cumulative = players.map((row) =>
        row.map((v, i) => {
            if (totals[i] == null) return null;
            running[i] += v ?? 0;
            return running[i];
        }),
    );

    return { labels, data: [xs, ...cumulative.reverse()], players, totals };
}

function shareColor(label: string): string {
    return label === SHARE_OTHER_LABEL ? "#a3a3a3" : getModeColor(label);
}

/** uPlot series for a ShareData, matching its top-of-stack-first data order. */
export function buildShareSeries(share: ShareData): uPlot.Series[] {
    return [
        { label: "Time" },
        ...[...share.labels].reverse().map((label): uPlot.Series => ({
            label,
            stroke: shareColor(label),
            fill: getModeFill(label === SHARE_OTHER_LABEL ? null : label),
            width: 1,
            spanGaps: false,
            points: { show: false },
        })),
    ];
}

/** Tooltip rows for one instant of a ShareData: "12.3% (45)", biggest first. */
export function shareTooltipRows(share: ShareData, idx: number) {
    const total = share.totals[idx];
    if (total == null) return [];
    return share.labels
        .map((label, i) => ({ label, value: share.players[i][idx] ?? 0 }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value)
        .map((r) => ({
            ...r,
            color: shareColor(r.label),
            display: `${((r.value / total) * 100).toFixed(1)}% (${r.value.toLocaleString()})`,
        }));
}

export const SHARE_Y_AXIS_VALUES = (_u: uPlot, splits: number[]) => splits.map((v) => `${Math.round(v)}%`);
