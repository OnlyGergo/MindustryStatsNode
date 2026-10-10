import { useEffect, useState } from "react";
import { NetworkActivityCell, NetworkBreakdown } from "../../../../common/models/networkAnalytics.ts";
import { getBaseUrl } from "../../util/getApi.ts";

interface State<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
}

/** Client-side fetch of one JSON endpoint; refetches whenever `path` changes. */
function useJson<T>(path: string): State<T> {
    const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });

    useEffect(() => {
        let cancelled = false;
        setState((s) => ({ ...s, loading: true, error: null }));

        fetch(`${getBaseUrl()}${path}`)
            .then((r) => r.ok ? r.json() : Promise.reject(new Error(`Status ${r.status}`)))
            .then((data: T) => { if (!cancelled) setState({ data, loading: false, error: null }); })
            .catch((err) => {
                if (cancelled) return;
                console.error("Error fetching network analytics:", err);
                setState({ data: null, loading: false, error: "Unable to load this data. Please try again later." });
            });

        return () => { cancelled = true; };
    }, [path]);

    return state;
}

export const useNetworkActivity = (networkId: number, days: 7 | 28 | 90) =>
    useJson<NetworkActivityCell[]>(`/api/networks/${networkId}/activity?days=${days}`);

export const useNetworkBreakdown = (networkId: number) =>
    useJson<NetworkBreakdown>(`/api/networks/${networkId}/breakdown`);
