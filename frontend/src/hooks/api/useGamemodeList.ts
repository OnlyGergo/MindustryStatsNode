import { useEffect, useState } from "react";
import { GamemodeInfo } from "../../../../common/models/GlobalStatsTypes.js";

export function useGamemodeList() {
    const [gamemodeList, setGamemodeList] = useState<GamemodeInfo[]>([]);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/gamemodes")
            .then((r) => r.ok ? r.json() : Promise.reject())
            .then((data: GamemodeInfo[]) => {
                if (!cancelled) setGamemodeList(data);
            })
            .catch((err) => console.error("Error fetching gamemode list:", err));

        return () => { cancelled = true; };
    }, []);

    return gamemodeList;
}