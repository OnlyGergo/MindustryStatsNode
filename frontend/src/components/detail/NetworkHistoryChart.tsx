import { lazy } from "react";
import {
  NetworkDetails,
  ServerHistory,
} from "../../../../common/models/serverData.ts";
import { HistoryType, useHistory } from "../../hooks/useHistory.ts";
import { ChartSuspense } from "../ChartSuspense.tsx";
import HistoryRangeControls from "./HistoryRangeControls.tsx";

// uPlot touches the DOM at render time and isn't SSR-safe without extra
// native deps, so the chart itself lives in its own module, loaded lazily
// and only on the client (see ChartSuspense.tsx for the pattern).
const PlayerHistoryChart = lazy(() => import("./PlayerHistoryChart.tsx"));

const NetworkHistoryChart = ({ network }: { network: NetworkDetails }) => {
  const { chartData, loading, fetchError, selectedRange, ...range } =
    useHistory<ServerHistory>(network.id, HistoryType.Network);

  return (
    <div className="h-full w-full flex flex-col">
      <HistoryRangeControls
        idPrefix="network-history"
        selectedRange={selectedRange}
        fetchError={fetchError}
        {...range}
      />

      <div className="flex-1 min-h-0 relative">
        <ChartSuspense>
          <PlayerHistoryChart
            data={chartData}
            loading={loading}
            selectedRange={selectedRange}
          />
        </ChartSuspense>
      </div>
    </div>
  );
};

export default NetworkHistoryChart;
