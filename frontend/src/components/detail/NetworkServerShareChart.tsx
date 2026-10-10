import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { NetworkServerHistory } from "../../../../common/models/serverData.ts";
import { DateRangeOption } from "../../util/dateRangeConsts.ts";
import {
  buildShareSeries,
  buildStackedData,
  formatTimestampLabel,
  getModeColor,
  SHARE_OTHER_LABEL,
} from "../../util/chartHelpers.ts";
import { createChartTooltip } from "../../util/chartTooltip.ts";
import { removeColors } from "../../util/mindustry.ts";
import { LoadingSpinner } from "../LoadingSpinner.tsx";

interface NetworkServerShareChartProps {
  data: NetworkServerHistory | null;
  loading: boolean;
  selectedRange: DateRangeOption;
}

/** Display labels: colour codes stripped, duplicates disambiguated so colours and tooltip rows stay distinct. */
function buildLabels(series: NetworkServerHistory["series"]): string[] {
  const seen = new Map<string, number>();
  return series.map((s) => {
    const base = s.id == null ? SHARE_OTHER_LABEL : (removeColors(s.name)?.trim() || s.name);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

// Absolute stacked area of the network's top servers plus "Other". Stack height
// at each point equals the main network chart's value (see getNetworkServerHistory).
// Lazily loaded and client-only, like the other uPlot charts.
const NetworkServerShareChart = ({ data, loading, selectedRange }: NetworkServerShareChartProps) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const uplotRef = useRef<uPlot | null>(null);
  const lastSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    if (!outerRef.current || !mountRef.current || !data || data.timestamps.length === 0) return;

    uplotRef.current?.destroy();
    uplotRef.current = null;

    // Stack bottom-up from the biggest family; "Other" (last) sits on top.
    const labels = buildLabels(data.series);
    const stacked = buildStackedData(data.timestamps, labels, data.values);
    const series = buildShareSeries(stacked);
    const tooltip = createChartTooltip(mountRef.current);

    function renderTooltip(u: uPlot, idx: number | null) {
      tooltip.update(u, idx, () => {
        if (idx == null || stacked.totals[idx] == null) return null;
        const ts = (u.data[0] as number[])[idx];
        const rows = stacked.labels
          .map((label, i) => ({
            label,
            value: stacked.players[i][idx] ?? 0,
            color: label === SHARE_OTHER_LABEL ? "#a3a3a3" : getModeColor(label),
          }))
          .filter((r) => r.value > 0)
          .sort((a, b) => b.value - a.value);
        return { title: new Date(ts * 1000).toLocaleString(), rows };
      });
    }

    const opts: uPlot.Options = {
      width: outerRef.current.offsetWidth,
      height: outerRef.current.offsetHeight,
      series,
      axes: [
        {
          stroke: "#9ca3af",
          grid: { stroke: "rgba(255,255,255,0.03)" },
          ticks: { stroke: "rgba(255,255,255,0.03)" },
          values: (_u, splits) => splits.map((ts) => formatTimestampLabel(ts * 1000, selectedRange === "custom" ? "12m" : selectedRange)),
          size: 30,
          font: "10px sans-serif",
        },
        {
          stroke: "#9ca3af",
          grid: { stroke: "rgba(255,255,255,0.03)" },
          ticks: { stroke: "rgba(255,255,255,0.03)" },
          values: (_u, splits) => splits.map((v) => Math.round(v).toLocaleString()),
          size: 60,
          font: "10px sans-serif",
        },
      ],
      scales: {
        x: { time: true },
        y: { range: (_u, _min, max) => [0, Math.max(max * 1.05, 1)] },
      },
      legend: { show: false },
      cursor: { drag: { x: false, y: false } },
      hooks: { setCursor: [(u) => renderTooltip(u, u.cursor.idx ?? null)] },
    };

    uplotRef.current = new uPlot(opts, stacked.data as uPlot.AlignedData, mountRef.current);
    lastSizeRef.current = { width: opts.width, height: opts.height };

    const ro = new ResizeObserver((entries) => {
      if (!uplotRef.current) return;
      const { width, height } = entries[0].contentRect;
      if (width <= 0 || height <= 0) return;
      const last = lastSizeRef.current;
      if (Math.abs(width - last.width) < 1 && Math.abs(height - last.height) < 1) return;
      lastSizeRef.current = { width, height };
      requestAnimationFrame(() => uplotRef.current?.setSize({ width, height }));
    });
    ro.observe(outerRef.current);

    return () => {
      ro.disconnect();
      tooltip.remove();
      uplotRef.current?.destroy();
      uplotRef.current = null;
    };
  }, [data, selectedRange]);

  const labels = data ? buildLabels(data.series) : [];

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 min-h-0 relative">
        <div
          ref={outerRef}
          className={`absolute inset-0 block transition-opacity duration-300 ${
            loading ? "opacity-15 pointer-events-none" : "opacity-100"
          }`}
        >
          <div ref={mountRef} className="absolute inset-0 block overflow-hidden" />
        </div>
        {loading && <LoadingSpinner />}
        {!loading && data && data.timestamps.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-tertiary text-sm">No data for this range</div>
        )}
      </div>
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-secondary">
          {labels.map((label) => (
            <span key={label} className="flex items-center gap-1.5 min-w-0">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: label === SHARE_OTHER_LABEL ? "#a3a3a3" : getModeColor(label) }}
              />
              <span className="truncate max-w-48">{label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default NetworkServerShareChart;
