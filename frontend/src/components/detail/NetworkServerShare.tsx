import { lazy } from "react";
import { useNetworkServerHistory } from "../../hooks/api/useNetworkServerHistory.ts";
import { ChartSuspense } from "../ChartSuspense.tsx";
import HistoryRangeControls from "./HistoryRangeControls.tsx";
import { useNearViewport } from "../../hooks/useNearViewport.ts";
import Panel from "../ui/Panel.tsx";

const NetworkServerShareChart = lazy(() => import("./NetworkServerShareChart.tsx"));

/** "Players by server" card: range controls plus the lazily loaded stacked chart. */
const NetworkServerShare = ({ networkId }: { networkId: number }) => {
  const [ref, near] = useNearViewport<HTMLElement>();
  const { data, loading, fetchError, ...range } =
    useNetworkServerHistory(networkId, near);

  return (
    <Panel ref={ref} title="Players by server" size="lg">
      <div className="h-[26rem] sm:h-[30rem] flex flex-col">
        <HistoryRangeControls
          idPrefix="network-share"
          fetchError={fetchError}
          {...range}
        />
        <div className="flex-1 min-h-0 relative">
          <ChartSuspense>
            <NetworkServerShareChart data={data} loading={loading} />
          </ChartSuspense>
        </div>
      </div>
    </Panel>
  );
};

export default NetworkServerShare;
