import { useEffect, useRef, useState } from 'react';
import { createServerFn } from '@tanstack/react-start';
import { ServerElement } from '../../../common/models/serverData.ts';
import { DEFAULT_REFRESH_INTERVAL_MS } from '../../../common/models/ClientConfig.ts';
import { ApiPacker, ApiResponsePacket } from '../../../common/Packer.ts';
import { getBaseUrl } from '../util/getApi.ts';
import { useClientConfig } from './useClientConfig.ts';

/**
 * Server function used by the route loader for the initial SSR fetch.
 * Runs on the Bun/Elysia server, hits the same cached endpoint that the
 * client polling below uses, and returns already-unpacked data so it can
 * be serialized straight into the loader payload.
 */
export const fetchServers = createServerFn({ method: 'GET' }).handler(async (): Promise<ApiResponsePacket> => {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/servers`);

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
});

/**
 * Client-side hook that keeps polling `/api/servers` every `refreshInterval` (from `/config`) to stay in
 * sync with the cached backend. `initialData` (typically sourced from the
 * route loader via `fetchServers`) can be passed in to avoid a loading
 * flash on first paint after SSR hydration.
 */
const useApi = (initialData: ServerElement[] | null = null) => {
    const [data, setData] = useState<ServerElement[] | null>(initialData);
    const [error, setError] = useState<Error | null>(null);
    const { config: clientConfig, loading: isConfigLoading, error: configError } = useClientConfig();

    // Only the *first* run may skip the immediate fetch. Kept in a ref rather than
    // the deps: callers re-create `initialData` every render (ApiPacker.unpack).
    const skipInitialFetch = useRef(initialData !== null);

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
        if (refreshInterval === null) {
            return;
        }

        // This is a React safety flag. It prevents React from trying to update
        // the state if the user navigates away from the page before the fetch finishes.
        let isMounted = true;

        const fetchServerStats = async () => {
            try {
                // Fetch from your cached HTTP endpoint
                const response = await fetch('/api/servers');

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const jsonData = ApiPacker.unpack<ServerElement>(await response.json());

                if (isMounted) {
                    setData(jsonData);
                    setError(null); // Clear any previous errors
                }
            } catch (err) {
                console.error('Error fetching server stats:', err);
                if (isMounted) {
                    setError(err instanceof Error ? err : new Error('Unknown error'));
                }
            }
        };

        // 1. Fetch immediately once config is known (skip if we already have
        // SSR-provided initialData, still poll afterwards regardless).
        if (skipInitialFetch.current) {
            skipInitialFetch.current = false;
        } else {
            fetchServerStats().then(() => {});
        }

        // 2. Poll at configured increments
        const pollInterval = setInterval(fetchServerStats, refreshInterval);

        // 3. Cleanup function: React runs this when the component unmounts or the interval changes
        return () => {
            isMounted = false;
            clearInterval(pollInterval);
        };
    }, [refreshInterval]); // Re-runs only when the interval resolves/changes, not per render

    return { data, error };
};

export default useApi;
