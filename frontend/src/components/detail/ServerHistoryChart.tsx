import { lazy } from "react";
import {
  ServerElement,
  ServerHistory,
} from "../../../../common/models/serverData.ts";
import { HistoryType, useHistory } from "../../hooks/useHistory.ts";
import { ChartSuspense } from "../ChartSuspense.tsx";
import HistoryRangeControls from "./HistoryRangeControls.tsx";

// uPlot touches the DOM at render time and isn't SSR-safe without extra
// native deps, so the chart itself lives in its own module, loaded lazily
// and only on the client (see ChartSuspense.tsx for the pattern).
const PlayerHistoryChart = lazy(() => import("./PlayerHistoryChart.tsx"));

const ServerHistoryChart = ({ id }: ServerElement) => {
  const { chartData, loading, fetchError, ...range } =
    useHistory<ServerHistory>(id, HistoryType.Server);

  return (
    <div className="h-full w-full flex flex-col">
      <HistoryRangeControls idPrefix="server-history" fetchError={fetchError} {...range} />

      <div className="flex-1 min-h-0 relative">
        <ChartSuspense>
          <PlayerHistoryChart data={chartData} loading={loading} />
        </ChartSuspense>
      </div>
    </div>
  );
};

export default ServerHistoryChart;
