import { GamemodeHistoryEntry } from "../../../../common/models/GlobalStatsTypes.js";
import { PresetRange } from "../../util/chartHelpers.ts";
import { ApiPacker, type ApiResponsePacket } from "../../../../common/Packer.ts";
import { useChartData } from "../useChartData.ts";

interface GamemodeHistory {
    data: GamemodeHistoryEntry[];
    /** Busiest instant's total across every mode. */
    peakPlayers: number;
}

const EMPTY: GamemodeHistory = { data: [], peakPlayers: 0 };

// Runs once per response (the result is cached), not once per render.
function parse(json: unknown): GamemodeHistory {
    const data = ApiPacker.unpack<GamemodeHistoryEntry>(json as ApiResponsePacket);
    const tsSums = new Map<number, number>();
    for (const entry of data) {
        tsSums.set(entry.timestamp, (tsSums.get(entry.timestamp) ?? 0) + (entry.players ?? 0));
    }
    let peakPlayers = 0;
    for (const sum of tsSums.values()) if (sum > peakPlayers) peakPlayers = sum;
    return { data, peakPlayers };
}

export function useGamemodeHistory(range: PresetRange) {
    const { data, loading, error } = useChartData(
        `/api/global/gamemode-history?range=${range}`,
        parse,
        "Unable to load gamemode history data.",
    );
    return { ...(data ?? EMPTY), loading, error };
}
