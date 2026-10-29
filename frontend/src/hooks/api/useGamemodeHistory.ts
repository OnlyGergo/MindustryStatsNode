import { GamemodeHistory } from "../../../../common/models/GlobalStatsTypes.js";
import { PresetRange } from "../../util/chartHelpers.ts";
import { useChartData, type InitialChartData } from "../useChartData.ts";

export interface GamemodePivot {
    /** Milliseconds, ascending. */
    timestamps: number[];
    /** Series order: alphabetical, so a mode keeps its slot across ranges. */
    gamemodes: string[];
    /** timestamp -> mode -> players (a gap counts as 0). */
    index: Map<number, Map<string, number>>;
    /** Each mode's highest point in the window. */
    peaks: Record<string, number>;
    /** Busiest instant's total across every mode. */
    peakPlayers: number;
}

const EMPTY: GamemodePivot = { timestamps: [], gamemodes: [], index: new Map(), peaks: {}, peakPlayers: 0 };

export const gamemodeHistoryUrl = (range: PresetRange) => `/api/global/gamemode-history?range=${range}`;

// Runs once per response (the result is cached), not once per render.
function parse(json: unknown): GamemodePivot {
    const { timestamps, modes, players } = json as GamemodeHistory;
    const index = new Map<number, Map<string, number>>(timestamps.map((ts) => [ts, new Map()]));
    const peaks: Record<string, number> = {};
    const totals = new Array<number>(timestamps.length).fill(0);

    modes.forEach((mode, m) => {
        const row = players[m]!;
        let peak = 0;
        timestamps.forEach((ts, t) => {
            const v = row[t] ?? 0;
            index.get(ts)!.set(mode, v);
            totals[t] += v;
            if (v > peak) peak = v;
        });
        peaks[mode] = peak;
    });

    return {
        timestamps,
        gamemodes: [...modes].sort(),
        index,
        peaks,
        peakPlayers: totals.reduce((max, v) => (v > max ? v : max), 0),
    };
}

export function useGamemodeHistory(range: PresetRange, initial?: InitialChartData | null) {
    const { data, loading, error } = useChartData(
        gamemodeHistoryUrl(range),
        parse,
        "Unable to load gamemode history data.",
        initial,
    );
    return { pivot: data ?? EMPTY, loading, error };
}
