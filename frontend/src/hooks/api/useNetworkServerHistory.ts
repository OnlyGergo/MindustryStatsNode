import { useEffect, useState } from "react";
import { NetworkServerHistory } from "../../../../common/models/serverData.ts";
import { getBaseUrl } from "../../util/getApi.ts";
import { useHistoryRange } from "../useHistory.ts";

/** Per-server breakdown of a network's history for the selected range (client-side only). */
export function useNetworkServerHistory(networkId: number) {
    const range = useHistoryRange();
    const { queryString } = range;

    const [data, setData] = useState<NetworkServerHistory | null>(null);
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    useEffect(() => {
        if (queryString === null) return;
        let cancelled = false;
        setLoading(true);
        setFetchError(null);

        fetch(`${getBaseUrl()}/api/networks/${networkId}/history/servers?${queryString}`)
            .then((r) => r.ok ? r.json() : Promise.reject(new Error(`Status ${r.status}`)))
            .then((d: NetworkServerHistory) => { if (!cancelled) setData(d); })
            .catch((err) => {
                if (cancelled) return;
                console.error("Error fetching network server history:", err);
                setFetchError("Unable to load history data. Please try again later.");
            })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [networkId, queryString]);

    return { data, loading, fetchError, ...range };
}
