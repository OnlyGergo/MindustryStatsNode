import React, { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { ServerShareEntry } from "../../../../common/models/GlobalStatsTypes.js";
import {
    buildServerShareIndex,
    buildShareData,
    buildShareSeries,
    formatTimestampLabel,
    DateRangeOption,
    SHARE_Y_AXIS_VALUES,
    shareTooltipRows,
} from "../../util/chartHelpers.ts";
import { createChartTooltip } from "../../util/chartTooltip.ts";
import { LoadingSpinner } from "../LoadingSpinner.tsx";

interface ServerShareChartProps {
    data: ServerShareEntry[];
    loading: boolean;
    error: string | null;
    selectedRange: DateRangeOption;
    visibleGroups: Set<string>;
}

// uPlot rendering half of GlobalStatsChart's server-share graph - kept in its
// own module so it's only fetched lazily on the client (see ChartSuspense.tsx).
const ServerShareChart: React.FC<ServerShareChartProps> = ({
                                                                      data,
                                                                      loading,
                                                                      error,
                                                                      selectedRange,
                                                                      visibleGroups,
                                                                  }) => {
    const outerRef = useRef<HTMLDivElement>(null);
    const mountRef = useRef<HTMLDivElement>(null);
    const uplotRef = useRef<uPlot | null>(null);
    const lastSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

    useEffect(() => {
        if (!outerRef.current || !mountRef.current || !data || data.length === 0) return;

        uplotRef.current?.destroy();
        uplotRef.current = null;

        const timestamps = [...new Set(data.map((d) => d.timestamp))].sort((a, b) => a - b);
        const serverGroups = [...new Set(data.map((d) => d.groupName))].sort();
        const index = buildServerShareIndex(data);
        const share = buildShareData(timestamps, serverGroups, index, visibleGroups);
        const series = buildShareSeries(share);

        const tooltip = createChartTooltip(mountRef.current);

        function renderTooltip(u: uPlot, idx: number | null) {
            tooltip.update(u, idx, () => {
                if (idx == null) return null;
                const ts = (u.data[0] as number[])[idx];
                const title = new Date(ts * 1000).toLocaleString();
                return { title, rows: shareTooltipRows(share, idx) };
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
                    values: (_u, splits) => splits.map((ts) => formatTimestampLabel(ts * 1000, selectedRange)),
                    size: 30,
                    font: "10px sans-serif",
                },
                {
                    stroke: "#9ca3af",
                    grid: { stroke: "rgba(255,255,255,0.03)" },
                    ticks: { stroke: "rgba(255,255,255,0.03)" },
                    values: SHARE_Y_AXIS_VALUES,
                    size: 60,
                    font: "10px sans-serif",
                },
            ],
            scales: {
                x: { time: true },
                y: { range: [0, 100] },
            },
            legend: { show: false },
            cursor: {
                drag: { x: false, y: false },
                sync: { key: "servershare-chart" },
            },
            hooks: {
                setCursor: [(u) => renderTooltip(u, u.cursor.idx ?? null)],
            },
        };

        uplotRef.current = new uPlot(opts, share.data as uPlot.AlignedData, mountRef.current);
        lastSizeRef.current = { width: opts.width, height: opts.height };

        const ro = new ResizeObserver((entries) => {
            if (!uplotRef.current) return;
            const { width, height } = entries[0].contentRect;
            if (width <= 0 || height <= 0) return;

            const last = lastSizeRef.current;
            if (Math.abs(width - last.width) < 1 && Math.abs(height - last.height) < 1) return;
            lastSizeRef.current = { width, height };

            requestAnimationFrame(() => {
                uplotRef.current?.setSize({ width, height });
            });
        });
        ro.observe(outerRef.current);

        return () => {
            ro.disconnect();
            tooltip.remove();
            uplotRef.current?.destroy();
            uplotRef.current = null;
        };
    }, [data, selectedRange, visibleGroups]);

    return (
        <div className="w-full h-full relative">
            <div
                ref={outerRef}
                className={`absolute inset-0 block transition-opacity duration-300 ${
                    loading ? "opacity-15 pointer-events-none" : "opacity-100"
                }`}
            >
                <div ref={mountRef} className="absolute inset-0 block overflow-hidden" />
            </div>

            {loading && <LoadingSpinner />}

            {error && (
                <div className="absolute inset-0 flex items-center justify-center text-status-offline text-xs font-semibold z-20">
                    {error}
                </div>
            )}
        </div>
    );
};

export default ServerShareChart;