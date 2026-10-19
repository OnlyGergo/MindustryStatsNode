import React, { useMemo } from "react";
import type uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { GamemodeHistoryEntry } from "../../../../common/models/GlobalStatsTypes.js";
import {
    buildGamemodeIndex,
    buildShareData,
    buildShareSeries,
    buildTimeAxes,
    buildUPlotData,
    countTicks,
    getModeColor,
    SHARE_Y_AXIS_VALUES,
    ViewMode,
    shareTooltipRows,
} from "../../util/chartHelpers.ts";
import { useUPlot } from "../../hooks/useUPlot.ts";
import { UPlotFrame } from "../UPlotFrame.tsx";

interface GamemodeChartProps {
    data: GamemodeHistoryEntry[];
    loading: boolean;
    error: string | null;
    viewMode: ViewMode;
    visibleModes: Set<string>;
}

const AGG_COLOR = "#f97316";

// uPlot rendering half of GlobalStatsChart's gamemode graph - kept in its own
// module so it's only fetched lazily on the client (see ChartSuspense.tsx).
const GamemodeChart: React.FC<GamemodeChartProps> = ({ data, loading, error, viewMode, visibleModes }) => {
    const pivot = useMemo(() => ({
        timestamps: [...new Set(data.map((d) => d.timestamp))].sort((a, b) => a - b),
        gamemodes: [...new Set(data.map((d) => d.modeName))].sort(),
        index: buildGamemodeIndex(data),
    }), [data]);

    const isShare = viewMode === "share";
    const isAgg = viewMode === "aggregated";
    const labels = isAgg ? ["Total Network Players"] : pivot.gamemodes;
    const markers = pivot.timestamps.length <= 80;

    // Lines/aggregated data ignores visibility (toggles are setSeries calls);
    // share folds hidden modes into "Other", so it rebuilds on toggle.
    const plain = useMemo(
        () => isShare ? null : buildUPlotData(pivot.timestamps, pivot.gamemodes, pivot.index, viewMode),
        [pivot, viewMode, isShare],
    );
    const share = useMemo(
        () => isShare ? buildShareData(pivot.timestamps, pivot.gamemodes, pivot.index, visibleModes) : null,
        [pivot, visibleModes, isShare],
    );

    const { outerRef, mountRef } = useUPlot({
        shape: share
            ? `share|${share.labels.join("\u0000")}`
            : `${viewMode}|${markers}|${labels.join("\u0000")}`,
        data: (share ? share.data : plain) as uPlot.AlignedData | null,
        show: isShare || isAgg ? undefined : labels.map((label) => visibleModes.has(label)),
        options: ({ narrow }) => ({
            series: share ? buildShareSeries(share) : [
                { label: "Time" },
                ...labels.map((label): uPlot.Series => ({
                    label,
                    stroke: isAgg ? AGG_COLOR : getModeColor(label),
                    width: 2,
                    show: isAgg || visibleModes.has(label),
                    spanGaps: false,
                    points: { show: markers, size: 5 },
                })),
            ],
            axes: buildTimeAxes(narrow, share ? SHARE_Y_AXIS_VALUES : countTicks(narrow)),
            scales: {
                x: { time: true },
                y: { range: share ? [0, 100] : (_u, _min, max) => [0, max * 1.05] },
            },
            legend: { show: false },
            cursor: {
                drag: { x: false, y: false },
                sync: { key: "gamemode-chart" },
            },
        }),
        tooltip: (u, idx) => {
            const title = new Date((u.data[0] as number[])[idx] * 1000).toLocaleString();
            if (share) return { title, rows: shareTooltipRows(share, idx) };
            const rows = labels
                .map((label, si) => ({
                    label,
                    show: isAgg || u.series[si + 1].show,
                    value: (u.data[si + 1] as (number | null)[])[idx],
                    color: isAgg ? AGG_COLOR : getModeColor(label),
                }))
                .filter((r): r is typeof r & { value: number } => r.show === true && r.value != null && r.value > 0)
                .map(({ label, value, color }) => ({ label, value, color }))
                .sort((a, b) => b.value - a.value);
            return { title, rows, isAgg };
        },
    });

    return (
        <div className="w-full h-full relative">
            <UPlotFrame outerRef={outerRef} mountRef={mountRef} loading={loading} />

            {error && (
              <div className="absolute inset-0 flex items-center justify-center text-status-offline text-xs font-semibold z-20">
                {error}
              </div>
            )}
        </div>
    );
};

export default GamemodeChart;
