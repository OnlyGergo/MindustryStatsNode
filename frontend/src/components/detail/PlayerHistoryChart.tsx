import { useMemo } from "react";
import type uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { ServerHistory } from "../../../../common/models/serverData.ts";
import { buildTimeAxes, countTicks } from "../../util/chartHelpers.ts";
import { useUPlot } from "../../hooks/useUPlot.ts";
import { UPlotFrame } from "../UPlotFrame.tsx";

interface PlayerHistoryChartProps {
  data: ServerHistory[];
  loading: boolean;
}

const COLOR = "rgb(249, 115, 22)";

// Single-series area chart used for both server and network player history.
// This is the uPlot rendering half of NetworkHistoryChart/ServerHistoryChart -
// it's a separate, lazily-loaded module so it never needs to run during SSR.
const PlayerHistoryChart = ({ data, loading }: PlayerHistoryChartProps) => {
  const aligned = useMemo<uPlot.AlignedData>(
    () => [data.map((h) => h.timestamp / 1000), data.map((h) => h.players)],
    [data],
  );
  // Point markers only make sense on sparse data, and they're fixed at build.
  const markers = data.length <= 80;

  const { outerRef, mountRef } = useUPlot({
    shape: `history|${markers}`,
    data: aligned,
    options: ({ narrow }) => ({
      series: [
        { label: "Time" },
        {
          label: "Players",
          stroke: COLOR,
          fill: "rgba(249, 115, 22, 0.1)",
          width: 2,
          spanGaps: false,
          points: { show: markers, size: 5 },
        },
      ],
      axes: buildTimeAxes(narrow, countTicks(narrow), "rgba(249, 115, 22, 0.08)"),
      scales: {
        x: { time: true },
        y: { range: (_u, _min, max) => [0, Math.max(max * 1.05, 1)] },
      },
      legend: { show: false },
      cursor: { drag: { x: false, y: false } },
    }),
    tooltip: (u, idx) => {
      const raw = (u.data[1] as (number | null)[])[idx];
      if (raw == null) return null;
      return {
        title: new Date((u.data[0] as number[])[idx] * 1000).toLocaleString(),
        rows: [{ label: "Players", value: raw, color: COLOR }],
      };
    },
  });

  return (
    <div className="w-full h-full relative">
      <UPlotFrame outerRef={outerRef} mountRef={mountRef} loading={loading} />

      {!loading && data.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-tertiary text-xs font-medium z-20">
          No data available for this range.
        </div>
      )}
    </div>
  );
};

export default PlayerHistoryChart;
