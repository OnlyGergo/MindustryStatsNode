import React, { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { GamemodeHistoryEntry } from "../../../../common/models/GlobalStatsTypes.js";
import { ServerEvent } from "../../../../common/models/serverData.ts";
import {
    buildGamemodeIndex,
    buildUPlotData,
    formatTimestampLabel,
    getModeColor,
    DateRangeOption,
    ViewMode,
} from "../../util/chartHelpers.ts";
import { createChartTooltip } from "../../util/chartTooltip.ts";
import { ChartAnnotations, createChartAnnotations } from "../../util/chartAnnotations.ts";
import { LoadingSpinner } from "../LoadingSpinner.tsx";

interface GamemodeChartProps {
    data: GamemodeHistoryEntry[];
    loading: boolean;
    error: string | null;
    selectedRange: DateRangeOption;
    viewMode: ViewMode;
    visibleModes: Set<string>;
    /** Global annotation stream for the same window `data` covers. */
    events?: ServerEvent[];
}

// uPlot rendering half of GlobalStatsChart's gamemode graph - kept in its own
// module so it's only fetched lazily on the client (see ChartSuspense.tsx).
const GamemodeChart: React.FC<GamemodeChartProps> = ({
                                                                data,
                                                                loading,
                                                                error,
                                                                selectedRange,
                                                                viewMode,
                                                                visibleModes,
                                                                events,
                                                            }) => {
    const outerRef = useRef<HTMLDivElement>(null);
    const mountRef = useRef<HTMLDivElement>(null);
    const uplotRef = useRef<uPlot | null>(null);
    const lastSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

    // Kept out of the chart effect's deps: annotations usually arrive after the
    // history and are pushed into the live plugin instead of forcing a rebuild.
    const annotationsRef = useRef<ChartAnnotations | null>(null);
    const eventsRef = useRef<ServerEvent[]>(events ?? []);

    useEffect(() => {
        if (!outerRef.current || !mountRef.current || !data || data.length === 0) return;

        uplotRef.current?.destroy();
        uplotRef.current = null;

        const timestamps = [...new Set(data.map((d) => d.timestamp))].sort((a, b) => a - b);
        const gamemodes = [...new Set(data.map((d) => d.modeName))].sort();
        const index = buildGamemodeIndex(data);
        const chartData = buildUPlotData(timestamps, gamemodes, index, viewMode);

        const isAgg = viewMode === "aggregated";
        const labels = isAgg ? ["Total Network Players"] : gamemodes;

        const series: uPlot.Series[] = [
            { label: "Time" },
            ...labels.map((label) => {
                const color = isAgg ? "#f97316" : getModeColor(label);
                return {
                    label,
                    stroke: color,
                    width: 2,
                    show: isAgg || visibleModes.has(label),
                    spanGaps: false,
                    points: { show: timestamps.length <= 80, size: 5 },
                } satisfies uPlot.Series;
            }),
        ];

        const tooltip = createChartTooltip(mountRef.current);
        const annotations = createChartAnnotations(eventsRef.current);
        annotationsRef.current = annotations;

        function renderTooltip(u: uPlot, idx: number | null) {
            tooltip.update(u, idx, () => {
                if (idx == null) return null;
                const ts = (u.data[0] as number[])[idx];
                const title = new Date(ts * 1000).toLocaleString();
                const rows: { label: string; value: number; color: string }[] = [];

                labels.forEach((label, si) => {
                    const sIdx = si + 1;
                    if (isAgg || u.series[sIdx].show) {
                        const raw = (u.data[sIdx] as (number | null)[])[idx];
                        if (raw != null && raw > 0) {
                            rows.push({
                                label,
                                value: raw,
                                color: isAgg ? "#f97316" : getModeColor(label),
                            });
                        }
                    }
                });

                rows.sort((a, b) => b.value - a.value);

                // This chart already shows a tooltip across a gap (rows just come
                // back empty), so annotations only ever add to it - which is the
                // useful case: the gap is what the annotation is explaining.
                return { title, rows, notes: annotations.notesAt(u), isAgg };
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
            legend: { show: false },
            cursor: {
                drag: { x: false, y: false },
                sync: { key: "gamemode-chart" },
            },
            plugins: [annotations.plugin],
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
            annotations.remove();
            annotationsRef.current = null;
            uplotRef.current?.destroy();
            uplotRef.current = null;
        };
    }, [data, selectedRange, viewMode, visibleModes]);

    useEffect(() => {
        eventsRef.current = events ?? [];
        annotationsRef.current?.update(eventsRef.current);
    }, [events]);

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

export default GamemodeChart;