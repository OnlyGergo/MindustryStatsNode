import { useEffect, useState } from "react";
import { ServerElement } from "../../../../common/models/serverData.ts";
import { ApiPacker, ApiResponsePacket } from "../../../../common/Packer.ts";
import { getBaseUrl } from "../../util/getApi.ts";
import { fetchJsonWithRetry } from "../../util/fetchRetry.ts";

interface NetworkServersState {
    servers: ServerElement[];
    loading: boolean;
    error: string | null;
}

/** Loads a network's member servers client-side so the SSR payload stays small. */
export function useNetworkServers(networkId: number): NetworkServersState {
    const [state, setState] = useState<NetworkServersState>({
        servers: [],
        loading: true,
        error: null,
    });

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        setState({ servers: [], loading: true, error: null });

        fetchJsonWithRetry<unknown>(`${getBaseUrl()}/api/networks/${networkId}/servers`, { signal: controller.signal })
            .then((r) => ApiPacker.unpack<ServerElement>(r as ApiResponsePacket))
            .then((servers: ServerElement[]) => {
                if (!cancelled) setState({ servers, loading: false, error: null });
            })
            .catch((err) => {
                if (cancelled) return;
                const message = typeof err === "string" ? err : "An error occurred while loading the network's servers.";
                console.error("Error fetching network servers:", err);
                setState({ servers: [], loading: false, error: message });
            });

        return () => { cancelled = true; controller.abort(); };
    }, [networkId]);

    return state;
}
