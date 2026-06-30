import React, { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { ServerShareEntry } from "../../../../common/models/GlobalStatsTypes.js";
import {
    buildServerShareIndex,
    buildUPlotData,
    formatTimestampLabel,
    getModeColor,
    DateRangeOption,
} from "../../util/chartHelpers.ts";
import { createChartTooltip } from "../../util/chartTooltip.ts";

interface ServerShareChartProps {
    data: ServerShareEntry[];
    loading: boolean;
    error: string | null;
    selectedRange: DateRangeOption;
    gamemode: string;
}

export const ServerShareChart: React.FC<ServerShareChartProps> = ({
                                                                      data,
                                                                      loading,
                                                                      error,
                                                                      selectedRange,
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
        const chartData = buildUPlotData(timestamps, serverGroups, index, "lines");

        const labels = serverGroups;

        const series: uPlot.Series[] = [
            { label: "Time" },
            ...labels.map((label) => ({
                label,
                stroke: getModeColor(label),
                width: 2,
                spanGaps: false,
                points: { show: timestamps.length <= 80, size: 5 },
            })),
        ];

        const tooltip = createChartTooltip(mountRef.current);

        function renderTooltip(u: uPlot, idx: number | null) {
            tooltip.update(u, idx, () => {
                if (idx == null) return null;
                const ts = (u.data[0] as number[])[idx];
                const title = new Date(ts * 1000).toLocaleString();
                const rows: { label: string; value: number; color: string }[] = [];

                labels.forEach((label, si) => {
                    const raw = (u.data[si + 1] as (number | null)[])[idx];
                    if (raw != null && raw > 0) {
                        rows.push({ label, value: raw, color: getModeColor(label) });
                    }
                });

                rows.sort((a, b) => b.value - a.value);
                return { title, rows, isAgg: false };
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
                    values: (_u, splits) => splits.map((v) => Math.round(v).toLocaleString()),
                    size: 60,
                    font: "10px sans-serif",
                },
            ],
            scales: {
                x: { time: true },
                y: { range: (_u, _min, max) => [0, max * 1.05] },
            },
            legend: { show: true },
            cursor: {
                drag: { x: false, y: false },
                sync: { key: "servershare-chart" },
            },
            hooks: {
                setCursor: [(u) => renderTooltip(u, u.cursor.idx ?? null)],
            },
        };

        uplotRef.current = new uPlot(opts, chartData as uPlot.AlignedData, mountRef.current);
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
    }, [data, selectedRange]);

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

            {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-950/10 z-20">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-orange-500 border-t-transparent" />
                    <span className="text-xs text-neutral-400 font-medium tracking-wide animate-pulse">
            Analyzing operational instances...
          </span>
                </div>
            )}

            {error && (
                <div className="absolute inset-0 flex items-center justify-center text-red-400 text-xs font-semibold z-20">
                    {error}
                </div>
            )}
        </div>
    );
};