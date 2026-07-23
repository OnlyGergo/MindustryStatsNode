import { useEffect, useState } from 'react';
import { createServerFn } from '@tanstack/react-start';
import { ServerElement } from '../../../common/models/serverData.ts';
import { ApiPacker } from '../../../common/Packer.ts';

// We adapted the status to fit HTTP requests instead of persistent sockets
export type FetchStatus = 'loading' | 'success' | 'error';

/**
 * Server function used by the route loader for the initial SSR fetch.
 * Runs on the Bun/Elysia server, hits the same cached endpoint that the
 * client polling below uses, and returns already-unpacked data so it can
 * be serialized straight into the loader payload.
 */
export const fetchServers = createServerFn({ method: 'GET' }).handler(async () => {
    const response = await fetch('/api/servers');

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return ApiPacker.unpack<ServerElement>(await response.json());
});

/**
 * Client-side hook that keeps polling `/api/servers` every 10s to stay in
 * sync with the cached backend. `initialData` (typically sourced from the
 * route loader via `fetchServers`) can be passed in to avoid a loading
 * flash on first paint after SSR hydration.
 */
const useApi = (initialData: ServerElement[] | null = null) => {
    const [data, setData] = useState<ServerElement[] | null>(initialData);
    const [connectionStatus, setStatus] = useState<FetchStatus>(initialData ? 'success' : 'loading');
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
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
                    setStatus('success');
                    setError(null); // Clear any previous errors
                }
            } catch (err) {
                console.error('Error fetching server stats:', err);
                if (isMounted) {
                    setStatus('error');
                    setError(err instanceof Error ? err : new Error('Unknown error'));
                }
            }
        };

        // 1. Fetch immediately when the component loads (skip if we already
        // have SSR-provided initialData, still poll afterwards regardless).
        if (!initialData) {
            fetchServerStats().then(() => {});
        }

        // 2. Poll every 10 seconds (10000ms) to sync perfectly with your backend/Cloudflare cache
        const pollInterval = setInterval(fetchServerStats, 10000);

        // 3. Cleanup function: React runs this when the component unmounts/is destroyed
        return () => {
            isMounted = false;
            clearInterval(pollInterval);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // The empty array ensures this setup only runs once when mounted

    return { data, connectionStatus, error };
};

export default useApi;
