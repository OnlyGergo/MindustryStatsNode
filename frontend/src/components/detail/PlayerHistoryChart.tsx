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
const OFFLINE_FILL = "rgba(239, 68, 68, 0.1)";
const OFFLINE_COLOR = "rgb(239, 68, 68)";

/**
 * A null bucket means offline (every server in scope, for a network) or no
 * data, which reads the same; 0 means online with nobody on. Nulls before the
 * first real value are left alone: that is the server not being tracked yet,
 * not downtime. Each run is [start, end) in seconds, clipped at now so the
 * still-empty bucket the range pads on is not drawn as an outage.
 */
function offlineRuns(ts: number[], ys: (number | null)[]): [number, number][] {
  const first = ys.findIndex((y) => y != null);
  if (first < 0) return [];
  const step = ts.length > 1 ? ts[1] - ts[0] : 0;
  const now = Date.now() / 1000;
  const runs: [number, number][] = [];
  for (let i = first; i < ys.length; i++) {
    if (ys[i] != null) continue;
    let j = i;
    while (j + 1 < ys.length && ys[j + 1] == null) j++;
    const end = Math.min(j + 1 < ts.length ? ts[j + 1] : ts[j] + step, now);
    if (end > ts[i]) runs.push([ts[i], end]);
    i = j;
  }
  return runs;
}

/** Shades offline runs under the series, so a gap reads as "offline", not "missing". */
const offlineBands = (): uPlot.Plugin => ({
  hooks: {
    drawClear: [
      (u) => {
        const ts = u.data[0] as number[];
        const runs = offlineRuns(ts, u.data[1] as (number | null)[]);
        if (runs.length === 0) return;
        const { ctx, bbox } = u;
        ctx.save();
        ctx.fillStyle = OFFLINE_FILL;
        for (const [a, b] of runs) {
          const x0 = Math.max(bbox.left, u.valToPos(a, "x", true));
          const x1 = Math.min(bbox.left + bbox.width, u.valToPos(b, "x", true));
          if (x1 > x0) ctx.fillRect(x0, bbox.top, Math.max(1, x1 - x0), bbox.height);
        }
        ctx.restore();
      },
    ],
  },
});

// Single-series area chart used for both server and network player history.
// 0 is "online, nobody on"; null is "offline" (the whole network, for a
// network chart) and is drawn as a red-shaded gap.
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
      plugins: [offlineBands()],
    }),
    tooltip: (u, idx) => {
      const ys = u.data[1] as (number | null)[];
      const raw = ys[idx];
      const title = new Date((u.data[0] as number[])[idx] * 1000).toLocaleString();
      if (raw != null) return { title, rows: [{ label: "Players", value: raw, color: COLOR }] };
      // Only inside a shaded run: not before tracking began, not in the future.
      const t = (u.data[0] as number[])[idx];
      if (!offlineRuns(u.data[0] as number[], ys).some(([a, b]) => t >= a && t < b)) return null;
      return { title, rows: [{ label: "Status", value: 0, color: OFFLINE_COLOR, display: "Offline" }] };
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
