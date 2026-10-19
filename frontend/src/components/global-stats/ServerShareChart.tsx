import React, { useMemo } from "react";
import type uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { ServerShareEntry } from "../../../../common/models/GlobalStatsTypes.js";
import {
    buildServerShareIndex,
    buildShareData,
    buildShareSeries,
    buildTimeAxes,
    SHARE_Y_AXIS_VALUES,
    shareTooltipRows,
} from "../../util/chartHelpers.ts";
import { useUPlot } from "../../hooks/useUPlot.ts";
import { UPlotFrame } from "../UPlotFrame.tsx";

interface ServerShareChartProps {
    data: ServerShareEntry[];
    loading: boolean;
    error: string | null;
    visibleGroups: Set<string>;
}

// uPlot rendering half of GlobalStatsChart's server-share graph - kept in its
// own module so it's only fetched lazily on the client (see ChartSuspense.tsx).
const ServerShareChart: React.FC<ServerShareChartProps> = ({ data, loading, error, visibleGroups }) => {
    const pivot = useMemo(() => ({
        timestamps: [...new Set(data.map((d) => d.timestamp))].sort((a, b) => a - b),
        groups: [...new Set(data.map((d) => d.groupName))].sort(),
        index: buildServerShareIndex(data),
    }), [data]);

    // Hiding a group folds it into "Other", so the series list itself changes.
    const share = useMemo(
        () => buildShareData(pivot.timestamps, pivot.groups, pivot.index, visibleGroups),
        [pivot, visibleGroups],
    );

    const { outerRef, mountRef } = useUPlot({
        shape: `share|${share.labels.join("\u0000")}`,
        data: share.data as uPlot.AlignedData,
        options: ({ narrow }) => ({
            series: buildShareSeries(share),
            axes: buildTimeAxes(narrow, SHARE_Y_AXIS_VALUES),
            scales: {
                x: { time: true },
                y: { range: [0, 100] },
            },
            legend: { show: false },
            cursor: {
                drag: { x: false, y: false },
                sync: { key: "servershare-chart" },
            },
        }),
        tooltip: (u, idx) => ({
            title: new Date((u.data[0] as number[])[idx] * 1000).toLocaleString(),
            rows: shareTooltipRows(share, idx),
        }),
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

export default ServerShareChart;
