import { lazy } from "react";
import {
  NetworkDetails,
  ServerHistory,
} from "../../../../common/models/serverData.ts";
import { DATE_RANGE_OPTIONS } from "../../util/dateRangeConsts.ts";
import { HistoryType, useHistory } from "../../hooks/useHistory.ts";
import { useGlobalEvents } from "../../hooks/api/useServerEvents.ts";
import { ChartSuspense } from "../ChartSuspense.tsx";

// uPlot touches the DOM at render time and isn't SSR-safe without extra
// native deps, so the chart itself lives in its own module, loaded lazily
// and only on the client (see ChartSuspense.tsx for the pattern).
const PlayerHistoryChart = lazy(() => import("./PlayerHistoryChart.tsx"));

const NetworkHistoryChart = ({ network }: { network: NetworkDetails }) => {
  const {
    chartData,
    loading,
    fetchError,
    dateError,
    selectedRange,
    setSelectedRange,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
  } = useHistory<ServerHistory>(network.id, HistoryType.Network);

  // Global events only. `server_events` hangs off a canonical *server* identity,
  // and this chart is a sum over a whole network, so a single member's address
  // change says nothing about the line drawn here - but a tracker-wide outage or
  // data-quality era distorts the aggregate exactly as much as any single server.
  const { events } = useGlobalEvents(selectedRange, customStartDate, customEndDate);

  // Get today's date for max attribute on date inputs
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="h-full w-full flex flex-col">
      {/* Date Range Selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {DATE_RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => setSelectedRange(option.value)}
            className={`px-3 py-1 text-sm ${
              selectedRange === option.value ? "button-accent" : "button-secondary"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Custom Date Range Inputs */}
      {selectedRange === "custom" && (
        <div className="flex gap-4 mb-4">
          <div className="flex items-center gap-2">
            <label
              htmlFor="custom-start-date"
              className="text-sm text-tertiary"
            >
              From:
            </label>
            <input
              id="custom-start-date"
              type="date"
              value={customStartDate}
              max={today}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="bg-surface-tertiary border border-default rounded px-3 py-1 text-sm text-primary focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="custom-end-date" className="text-sm text-tertiary">
              To:
            </label>
            <input
              id="custom-end-date"
              type="date"
              value={customEndDate}
              max={today}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="bg-surface-tertiary border border-default rounded px-3 py-1 text-sm text-primary focus:outline-none focus:border-accent"
            />
          </div>
        </div>
      )}

      {/* Date Range Error */}
      {dateError && (
        <div className="text-status-offline text-sm mb-4">{dateError}</div>
      )}

      {/* Fetch Error */}
      {fetchError && (
        <div className="text-status-offline text-sm mb-4 bg-status-offline border border-status-offline rounded p-3">
          {fetchError}
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 min-h-0 relative">
        <ChartSuspense>
          <PlayerHistoryChart
            data={chartData}
            loading={loading}
            selectedRange={selectedRange}
            events={events}
          />
        </ChartSuspense>
      </div>
    </div>
  );
};

export default NetworkHistoryChart;
