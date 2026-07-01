import {useEffect, useState} from 'react';
import {ServerElement} from "../../../common/models/serverData.ts";
import {ApiPacker} from "../../../common/Packer.ts";

// We adapted the status to fit HTTP requests instead of persistent sockets
export type FetchStatus = 'loading' | 'success' | 'error';

const useApi = () => {
    const [data, setData] = useState<ServerElement[] | null>(null);
    const [connectionStatus, setStatus] = useState<FetchStatus>('loading');
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

        // 1. Fetch immediately when the component loads
        fetchServerStats().then(() => {});

        // 2. Poll every 10 seconds (10000ms) to sync perfectly with your backend/Cloudflare cache
        const pollInterval = setInterval(fetchServerStats, 10000);

        // 3. Cleanup function: React runs this when the component unmounts/is destroyed
        return () => {
            isMounted = false;
            clearInterval(pollInterval);
        };
    }, []); // The empty array ensures this setup only runs once when mounted

    return { data, connectionStatus, error };
};

export default useApi;