import { useEffect, useState } from "react";
import { NetworkActivityCell, NetworkBreakdown } from "../../../../common/models/networkAnalytics.ts";
import { getBaseUrl } from "../../util/getApi.ts";

interface State<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
}

/**
 * Client-side fetch of one JSON endpoint; refetches whenever `path` changes.
 * A null `path` waits (still "loading") without fetching.
 */
function useJson<T>(path: string | null): State<T> {
    const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null });

    useEffect(() => {
        if (path === null) return;
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

/** `enabled: false` holds the request back, e.g. until the section is near the viewport. */
export const useNetworkActivity = (networkId: number, days: 7 | 28 | 90, enabled = true) =>
    useJson<NetworkActivityCell[]>(enabled ? `/api/networks/${networkId}/activity?days=${days}` : null);

export const useNetworkBreakdown = (networkId: number, enabled = true) =>
    useJson<NetworkBreakdown>(enabled ? `/api/networks/${networkId}/breakdown` : null);
