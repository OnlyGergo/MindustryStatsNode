import { useMemo } from "react";
import type uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { NetworkServerHistory } from "../../../../common/models/serverData.ts";
import {
  buildShareSeries,
  buildStackedData,
  buildTimeAxes,
  countTicks,
  getModeColor,
  SHARE_OTHER_LABEL,
} from "../../util/chartHelpers.ts";
import { removeColors } from "../../util/mindustry.ts";
import { useUPlot } from "../../hooks/useUPlot.ts";
import { UPlotFrame } from "../UPlotFrame.tsx";

interface NetworkServerShareChartProps {
  data: NetworkServerHistory | null;
  loading: boolean;
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

const labelColor = (label: string) => label === SHARE_OTHER_LABEL ? "#a3a3a3" : getModeColor(label);

// Absolute stacked area of the network's top servers plus "Other". Stack height
// at each point equals the main network chart's value (see getNetworkServerHistory).
// Lazily loaded and client-only, like the other uPlot charts.
const NetworkServerShareChart = ({ data, loading }: NetworkServerShareChartProps) => {
  // Stack bottom-up from the biggest family; "Other" (last) sits on top.
  const stacked = useMemo(() => {
    if (!data) return null;
    return buildStackedData(data.timestamps, buildLabels(data.series), data.values);
  }, [data]);

  const { outerRef, mountRef } = useUPlot({
    shape: `stacked|${stacked?.labels.join("\u0000")}`,
    data: stacked ? (stacked.data as uPlot.AlignedData) : null,
    options: ({ narrow }) => ({
      series: buildShareSeries(stacked!),
      axes: buildTimeAxes(narrow, countTicks(narrow)),
      scales: {
        x: { time: true },
        y: { range: (_u, _min, max) => [0, Math.max(max * 1.05, 1)] },
      },
      legend: { show: false },
      cursor: { drag: { x: false, y: false } },
    }),
    tooltip: (u, idx) => {
      if (!stacked || stacked.totals[idx] == null) return null;
      const rows = stacked.labels
        .map((label, i) => ({ label, value: stacked.players[i][idx] ?? 0, color: labelColor(label) }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value);
      return { title: new Date((u.data[0] as number[])[idx] * 1000).toLocaleString(), rows };
    },
  });

  const labels = stacked?.labels ?? [];

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 min-h-0 relative">
        <UPlotFrame outerRef={outerRef} mountRef={mountRef} loading={loading} />
        {!loading && data && data.timestamps.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-tertiary text-sm">No data for this range</div>
        )}
      </div>
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-secondary max-h-20 overflow-y-auto">
          {labels.map((label) => (
            <span key={label} className="flex items-center gap-1.5 min-w-0">
              <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: labelColor(label) }} />
              <span className="truncate max-w-48">{label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default NetworkServerShareChart;
