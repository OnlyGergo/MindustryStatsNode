import { lazy } from "react";
import { useNetworkServerHistory } from "../../hooks/api/useNetworkServerHistory.ts";
import { ChartSuspense } from "../ChartSuspense.tsx";
import HistoryRangeControls from "./HistoryRangeControls.tsx";

const NetworkServerShareChart = lazy(() => import("./NetworkServerShareChart.tsx"));

/** "Players by server" card: range controls plus the lazily loaded stacked chart. */
const NetworkServerShare = ({ networkId }: { networkId: number }) => {
  const { data, loading, fetchError, selectedRange, ...range } =
    useNetworkServerHistory(networkId);

  return (
    <div className="bg-surface-secondary border border-subtle rounded p-4 sm:p-6 mb-4 sm:mb-6">
      <h2 className="text-base sm:text-lg font-semibold text-primary mb-3 sm:mb-4">Players by server</h2>
      <div className="h-96 sm:h-[30rem] flex flex-col">
        <HistoryRangeControls
          idPrefix="network-share"
          selectedRange={selectedRange}
          fetchError={fetchError}
          {...range}
        />
        <div className="flex-1 min-h-0 relative">
          <ChartSuspense>
            <NetworkServerShareChart data={data} loading={loading} selectedRange={selectedRange} />
          </ChartSuspense>
        </div>
      </div>
    </div>
  );
};

export default NetworkServerShare;
