import { useEffect, useRef, useState } from 'react';
import { ServerElement, ServerListItem } from '../../../common/models/serverData.ts';
import { DEFAULT_REFRESH_INTERVAL_MS } from '../../../common/models/ClientConfig.ts';
import { ApiPacker, ApiResponsePacket } from '../../../common/Packer.ts';
import { getBaseUrl } from '../util/getApi.ts';
import { useClientConfig } from './useClientConfig.ts';
import { fetchJsonWithRetry } from '../util/fetchRetry.ts';

/** The full server list, from the server (SSR loader) or the browser alike. */
export const loadServerList = async (signal?: AbortSignal): Promise<ServerListItem[]> =>
    // Retries Cloudflare challenges on a visitor's first fetch (single attempt during SSR).
    ApiPacker.unpack<ServerElement>(await fetchJsonWithRetry<ApiResponsePacket>(`${getBaseUrl()}/api/servers`, { signal }));

/**
 * Client-side hook that keeps polling `/api/servers` every `refreshInterval` (from `/config`) to stay in
 * sync with the cached backend. Without `initialData` (an SSR page: the list
 * isn't embedded in it) the first fetch goes out on mount, not after `/config`.
 */
const useApi = (initialData: ServerListItem[] | null = null) => {
    const [data, setData] = useState<ServerListItem[] | null>(initialData);
    const [error, setError] = useState<Error | null>(null);
    // True until the first fetch settles (it may be retrying behind a Cloudflare challenge).
    const [fetching, setFetching] = useState(initialData === null);
    const dataRef = useRef<ServerListItem[] | null>(initialData);
    const { config: clientConfig, loading: isConfigLoading, error: configError } = useClientConfig();

    // Only the *first* run may skip the immediate fetch. Kept in a ref rather than
    // the deps: callers re-create `initialData` every render (ApiPacker.unpack).
    const skipInitialFetch = useRef(initialData !== null);
    const fetchRef = useRef<(() => Promise<void>) | null>(null);

    // Wait for config, but if it failed fall back to the default interval rather
    // than never polling: a stale list is worse than a slightly off cadence.
    const refreshInterval = isConfigLoading
        ? null
        : clientConfig?.refreshInterval ?? DEFAULT_REFRESH_INTERVAL_MS;

    useEffect(() => {
        if (configError) {
            console.warn('Client config unavailable, polling at default interval:', configError);
        }
    }, [configError]);

    useEffect(() => {
        const controller = new AbortController();
        let inFlight = false;

        const fetchServerStats = async () => {
            // A retry loop can outlast the poll interval; never stack a second one.
            if (inFlight) return;
            inFlight = true;
            try {
                const servers = await loadServerList(controller.signal);
                if (controller.signal.aborted) return;
                dataRef.current = servers;
                setData(servers);
                setError(null);
            } catch (err) {
                if (controller.signal.aborted) return;
                if (dataRef.current) {
                    // Keep showing the last good list; the next poll tries again.
                    console.warn('Server list refresh failed, keeping previous data:', err);
                } else {
                    console.error('Error fetching server stats:', err);
                    setError(err instanceof Error ? err : new Error('Unknown error'));
                }
            } finally {
                inFlight = false;
                if (!controller.signal.aborted) setFetching(false);
            }
        };
        fetchRef.current = fetchServerStats;

        if (skipInitialFetch.current) {
            skipInitialFetch.current = false;
        } else {
            void fetchServerStats();
        }

        return () => {
            controller.abort();
            fetchRef.current = null;
        };
    }, []);

    // Polling waits for the interval from /config; the first fetch above doesn't.
    useEffect(() => {
        if (refreshInterval === null) return;
        const pollInterval = setInterval(() => void fetchRef.current?.(), refreshInterval);
        return () => clearInterval(pollInterval);
    }, [refreshInterval]);

    return { data, error, loading: fetching && !data };
};

export default useApi;
