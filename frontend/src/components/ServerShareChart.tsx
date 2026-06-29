import React, { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { ServerShareEntry } from "../../../common/models/GlobalStatsTypes.js";
import {
    buildServerShareIndex,
    buildUPlotData,
    formatTimestampLabel,
    getModeColor,
    DateRangeOption,
} from "../util/chartHelpers.ts";

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
                                                                      gamemode,
                                                                  }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const uplotRef = useRef<uPlot | null>(null);

    useEffect(() => {
        if (!containerRef.current || data.length === 0) return;

        uplotRef.current?.destroy();
        uplotRef.current = null;

        // ── Derive sorted unique timestamps & server groups ──────────────────
        const timestamps = [...new Set(data.map((d) => d.timestamp))].sort((a, b) => a - b);
        const serverGroups = [...new Set(data.map((d) => d.groupName))].sort();
        const index = buildServerShareIndex(data);

        // ── Build uPlot data ─────────────────────────────────────────────────
        // Pass "lines" explicitly to prevent any aggregation/stacking
        const chartData = buildUPlotData(timestamps, serverGroups, index, "lines");

        const labels = serverGroups;

        // ── Series config ────────────────────────────────────────────────────
        const series: uPlot.Series[] = [
            { label: "Time" }, // x-axis series (required)
            ...labels.map((label) => {
                return {
                    label,
                    stroke: getModeColor(label),
                    width: 2,
                    spanGaps: false, // nulls break the line — no gap-spanning
                    points: { show: timestamps.length <= 80, size: 5 },
                } satisfies uPlot.Series;
            }),
        ];

        // ── Custom tooltip ───────────────────────────────────────────────────
        const tooltipEl = document.createElement("div");
        tooltipEl.style.cssText = `
            position:absolute; pointer-events:none; display:none; z-index:100;
            background:rgba(17,17,17,0.95); border:1px solid #2d2d2d; border-radius:8px;
            padding:10px 12px; font-size:11px; color:#fff; white-space:nowrap;
            box-shadow:0 4px 16px rgba(0,0,0,0.5);
        `;
        containerRef.current.style.position = "relative";
        containerRef.current.appendChild(tooltipEl);

        function renderTooltip(u: uPlot, idx: number | null) {
            if (idx == null) { tooltipEl.style.display = "none"; return; }

            const ts = (u.data[0] as number[])[idx];
            const dateStr = new Date(ts * 1000).toLocaleString();

            const rows: { label: string; value: number; color: string }[] = [];
            let total = 0;

            labels.forEach((label, si) => {
                // u.data[0] is time, so series index is si + 1
                const raw = (u.data[si + 1] as (number | null)[])[idx];
                if (raw != null && raw > 0) {
                    rows.push({
                        label,
                        value: raw,
                        color: getModeColor(label)
                    });
                    total += raw;
                }
            });

            // Sort descending by count
            rows.sort((a, b) => b.value - a.value);

            const rowsHtml = rows
                .map(
                    (r) =>
                        `<div style="display:flex;gap:16px;justify-content:space-between;align-items:center;">
                            <span style="display:flex;align-items:center;gap:6px;color:#9ca3af">
                                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${r.color};"></span>
                                ${r.label}
                            </span>
                            <span>${r.value.toLocaleString()}</span>
                        </div>`,
                )
                .join("");

            const footerHtml =
                (rows.length > 1)
                    ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #333;
                            display:flex;gap:16px;justify-content:space-between">
                            <span style="color:#f97316">Total</span>
                            <span style="color:#f97316">${total.toLocaleString()}</span>
                        </div>`
                    : "";

            tooltipEl.innerHTML = `
                <div style="color:#f97316;font-weight:600;margin-bottom:6px">${dateStr}</div>
                ${rowsHtml}
                ${footerHtml}
            `;

            // Position tooltip near cursor, keep inside bounds
            const cursorLeft = u.cursor.left ?? 0;
            const cursorTop = u.cursor.top ?? 0;
            const containerW = containerRef.current?.offsetWidth ?? 600;
            const tipW = 220;
            const left = cursorLeft + 16 + tipW > containerW ? cursorLeft - tipW - 8 : cursorLeft + 16;

            tooltipEl.style.display = "block";
            tooltipEl.style.left = `${left}px`;
            tooltipEl.style.top = `${cursorTop - 10}px`;
        }

        // ── Axes & scales ────────────────────────────────────────────────────
        const axes: uPlot.Axis[] = [
            {
                stroke: "#9ca3af",
                grid: { stroke: "rgba(255,255,255,0.05)" },
                ticks: { stroke: "rgba(255,255,255,0.05)" },
                values: (u, splits) =>
                    splits.map((ts) => formatTimestampLabel(ts * 1000, selectedRange)),
                size: 30,
                font: "10px sans-serif",
            },
            {
                stroke: "#9ca3af",
                grid: { stroke: "rgba(255,255,255,0.05)" },
                ticks: { stroke: "rgba(255,255,255,0.05)" },
                values: (u, splits) => splits.map((v) => Math.round(v).toLocaleString()),
                size: 60,
                font: "10px sans-serif",
            },
        ];

        // ── uPlot init ───────────────────────────────────────────────────────
        const opts: uPlot.Options = {
            width: containerRef.current.offsetWidth,
            height: containerRef.current.offsetHeight,
            series,
            axes,
            scales: {
                x: { time: true },
                y: { range: (u, min, max) => [0, max * 1.05] },
            },
            legend: { show: true }, // Keep the legend visible for individual server shares
            cursor: {
                drag: { x: false, y: false },
                sync: { key: "servershare-chart" }, // distinct sync key
            },
            hooks: {
                setCursor: [(u) => renderTooltip(u, u.cursor.idx ?? null)],
            },
            plugins: [],
        };

        uplotRef.current = new uPlot(opts, chartData as uPlot.AlignedData, containerRef.current);

        // Handle resize carefully to avoid infinite expansion loops
        const ro = new ResizeObserver((entries) => {
            if (!uplotRef.current) return;
            const entry = entries[0];
            const { width, height } = entry.contentRect;
            if (width > 0 && height > 0) {
                uplotRef.current.setSize({ width, height });
            }
        });
        ro.observe(containerRef.current);

        return () => {
            ro.disconnect();
            tooltipEl.remove();
            uplotRef.current?.destroy();
            uplotRef.current = null;
        };
    }, [data, selectedRange]);

    if (loading) {
        return (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-orange-500 border-t-transparent" />
                <span className="text-xs text-neutral-500 font-medium">Analyzing active instances...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="absolute inset-0 flex items-center justify-center text-red-400 text-xs font-semibold">
                {error}
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-xs">
                No telemetry recorded for this gamemode instance
            </div>
        );
    }

    return <div ref={containerRef} className="absolute inset-0 overflow-hidden" />;
};