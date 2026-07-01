import { useEffect, useState } from "react";
import { ServerShareEntry } from "../../../../common/models/GlobalStatsTypes.js";
import { DateRangeOption } from "../../util/chartHelpers.ts";
import {ApiPacker} from "../../../../common/Packer.ts";

interface ServerShareState {
    data: ServerShareEntry[];
    loading: boolean;
    error: string | null;
}

export function useServerShare(
    gamemode: string | null,
    range: DateRangeOption,
): ServerShareState {
    const [state, setState] = useState<ServerShareState>({
        data: [],
        loading: false,
        error: null,
    });

    useEffect(() => {
        if (!gamemode) {
            setState({ data: [], loading: false, error: null });
            return;
        }

        let cancelled = false;
        setState((s) => ({ ...s, loading: true, error: null }));

        fetch(`/api/gamemodes/${encodeURIComponent(gamemode)}/servers?range=${range}`)
            .then((r) => r.ok ? r.json() : Promise.reject("Unable to load server share data."))
            .then((r) => ApiPacker.unpack<ServerShareEntry>(r))
            .then((data: ServerShareEntry[]) => {
                if (!cancelled) setState({ data, loading: false, error: null });
            })
            .catch((err) => {
                if (cancelled) return;
                const message = typeof err === "string" ? err : "An error occurred while loading server share data.";
                console.error("Error fetching server share data:", err);
                setState({ data: [], loading: false, error: message });
            });

        return () => { cancelled = true; };
    }, [gamemode, range]);

    return state;
}