import { NetworkServerHistory } from "../../../../common/models/serverData.ts";
import { useHistoryRange } from "../useHistory.ts";
import { useChartData } from "../useChartData.ts";

// This endpoint returns plain columnar JSON rather than an ApiPacker packet.
const parse = (json: unknown) => json as NetworkServerHistory;

/** Per-server breakdown of a network's history for the selected range (client-side only). */
export function useNetworkServerHistory(networkId: number) {
    const range = useHistoryRange();
    const { queryString } = range;

    const { data, loading, error } = useChartData(
        queryString === null ? null : `/api/networks/${networkId}/history/servers?${queryString}`,
        parse,
        "Unable to load history data. Please try again later.",
    );

    return { data: data ?? null, loading, fetchError: error, ...range };
}
