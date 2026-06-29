import { useEffect, useState } from "react";
import { GamemodeHistoryEntry } from "../../../../common/models/GlobalStatsTypes.js";
import { DateRangeOption } from "../../util/chartHelpers.ts";

interface GamemodeHistoryState {
    data: GamemodeHistoryEntry[];
    loading: boolean;
    error: string | null;
    peakPlayers: number;
}

export function useGamemodeHistory(range: DateRangeOption): GamemodeHistoryState {
    const [state, setState] = useState<GamemodeHistoryState>({
        data: [],
        loading: true,
        error: null,
        peakPlayers: 0,
    });

    useEffect(() => {
        let cancelled = false;
        setState((s) => ({ ...s, loading: true, error: null }));

        fetch(`/api/global/gamemode-history?range=${range}`)
            .then((r) => r.ok ? r.json() : Promise.reject("Unable to load gamemode history data."))
            .then((data: GamemodeHistoryEntry[]) => {
                if (cancelled) return;

                // Compute peak: group by timestamp, sum players, find max
                const tsSums = new Map<number, number>();
                for (const entry of data) {
                    tsSums.set(entry.timestamp, (tsSums.get(entry.timestamp) ?? 0) + (entry.players ?? 0));
                }
                const peakPlayers = Math.max(0, ...tsSums.values());

                setState({ data, loading: false, error: null, peakPlayers });
            })
            .catch((err) => {
                if (cancelled) return;
                const message = typeof err === "string" ? err : "An error occurred while loading gamemode history data.";
                console.error("Error fetching gamemode history data:", err);
                setState({ data: [], loading: false, error: message, peakPlayers: 0 });
            });

        return () => { cancelled = true; };
    }, [range]);

    return state;
}