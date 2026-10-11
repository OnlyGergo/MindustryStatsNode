import { useEffect, useState } from "react";
import { ServerElement } from "../../../../common/models/serverData.ts";
import { ApiPacker } from "../../../../common/Packer.ts";
import { getBaseUrl } from "../../util/getApi.ts";

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
        setState({ servers: [], loading: true, error: null });

        fetch(`${getBaseUrl()}/api/networks/${networkId}/servers`)
            .then((r) => r.ok ? r.json() : Promise.reject("Unable to load the network's servers."))
            .then((r) => ApiPacker.unpack<ServerElement>(r))
            .then((servers: ServerElement[]) => {
                if (!cancelled) setState({ servers, loading: false, error: null });
            })
            .catch((err) => {
                if (cancelled) return;
                const message = typeof err === "string" ? err : "An error occurred while loading the network's servers.";
                console.error("Error fetching network servers:", err);
                setState({ servers: [], loading: false, error: message });
            });

        return () => { cancelled = true; };
    }, [networkId]);

    return state;
}
