import { useEffect, useRef, useState } from 'react';
import { ServerElement, ServerListItem } from '../../../common/models/serverData.ts';
import { DEFAULT_REFRESH_INTERVAL_MS } from '../../../common/models/ClientConfig.ts';
import { ApiPacker } from '../../../common/Packer.ts';
import { getBaseUrl } from '../util/getApi.ts';
import { useClientConfig } from './useClientConfig.ts';

/** The full server list, from the server (SSR loader) or the browser alike. */
export const loadServerList = async (): Promise<ServerListItem[]> => {
    const response = await fetch(`${getBaseUrl()}/api/servers`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return ApiPacker.unpack<ServerElement>(await response.json());
};

/**
 * Client-side hook that keeps polling `/api/servers` every `refreshInterval` (from `/config`) to stay in
 * sync with the cached backend. Without `initialData` (an SSR page: the list
 * isn't embedded in it) the first fetch goes out on mount, not after `/config`.
 */
const useApi = (initialData: ServerListItem[] | null = null) => {
    const [data, setData] = useState<ServerListItem[] | null>(initialData);
    const [error, setError] = useState<Error | null>(null);
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
        let isMounted = true;

        const fetchServerStats = async () => {
            try {
                const servers = await loadServerList();
                if (isMounted) {
                    setData(servers);
                    setError(null);
                }
            } catch (err) {
                console.error('Error fetching server stats:', err);
                if (isMounted) {
                    setError(err instanceof Error ? err : new Error('Unknown error'));
                }
            }
        };
        fetchRef.current = fetchServerStats;

        if (skipInitialFetch.current) {
            skipInitialFetch.current = false;
        } else {
            void fetchServerStats();
        }

        return () => {
            isMounted = false;
            fetchRef.current = null;
        };
    }, []);

    // Polling waits for the interval from /config; the first fetch above doesn't.
    useEffect(() => {
        if (refreshInterval === null) return;
        const pollInterval = setInterval(() => void fetchRef.current?.(), refreshInterval);
        return () => clearInterval(pollInterval);
    }, [refreshInterval]);

    return { data, error };
};

export default useApi;
