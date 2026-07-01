import { useEffect, useState } from "react";
import {GamemodeInfo} from "../../../../common/models/GlobalStatsTypes.js";
import {ApiPacker} from "../../../../common/Packer.ts";

export function useGamemodeList() {
    const [gamemodeList, setGamemodeList] = useState<GamemodeInfo[]>([]);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/gamemodes")
            .then((r) => r.ok ? r.json() : Promise.reject())
            .then((r) => ApiPacker.unpack<GamemodeInfo>(r))
            .then((data: GamemodeInfo[]) => {
                if (!cancelled) setGamemodeList(data);
            })
            .catch((err) => console.error("Error fetching gamemode list:", err));

        return () => { cancelled = true; };
    }, []);

    return gamemodeList;
}