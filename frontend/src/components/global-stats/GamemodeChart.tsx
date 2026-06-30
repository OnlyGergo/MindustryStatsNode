import React, { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { GamemodeHistoryEntry } from "../../../../common/models/GlobalStatsTypes.js";
import {
    buildGamemodeIndex,
    buildUPlotData,
    formatTimestampLabel,
    getModeColor,
    DateRangeOption,
    ViewMode,
} from "../../util/chartHelpers.ts";

interface GamemodeChartProps {
    data: GamemodeHistoryEntry[];
    loading: boolean;
    error: string | null;
    selectedRange: DateRangeOption;
    viewMode: ViewMode;
}

export const GamemodeChart: React.FC<GamemodeChartProps> = ({
                                                                data,
                                                                loading,
                                                                error,
                                                                selectedRange,
                                                                viewMode,
                                                            }) => {
    const outerRef = useRef<HTMLDivElement>(null);
    const mountRef = useRef<HTMLDivElement>(null);
    const uplotRef = useRef<uPlot | null>(null);
    const lastSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

    useEffect(() => {
        if (!outerRef.current || !mountRef.current || data.length === 0) return;

        uplotRef.current?.destroy();
        uplotRef.current = null;

        // ── Derive sorted unique timestamps & gamemodes ──────────────────────
        const timestamps = [...new Set(data.map((d) => d.timestamp))].sort((a, b) => a - b);
        const gamemodes = [...new Set(data.map((d) => d.modeName))].sort();
        const index = buildGamemodeIndex(data);

        // ── Build uPlot data ─────────────────────────────────────────────────
        const chartData = buildUPlotData(timestamps, gamemodes, index, viewMode);

        const isAgg = viewMode === "aggregated";
        const labels = isAgg ? ["Total Network Players"] : gamemodes;

        // ── Series config ────────────────────────────────────────────────────
        const series: uPlot.Series[] = [
            { label: "Time" }, // x-axis series (required)
            ...labels.map((label) => {
                const color = isAgg ? "#f97316" : getModeColor(label);
                return {
                    label,
                    stroke: color,
                    width: 2,
                    // No custom spline curves, standard uplot lines
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
        mountRef.current.style.position = "relative";
        mountRef.current.appendChild(tooltipEl);

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
                        color: isAgg ? "#f97316" : getModeColor(label)
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
                (!isAgg && rows.length > 1)
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
            const containerW = mountRef.current?.offsetWidth ?? 600;
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
        // Use the OUTER box's dimensions, not the mount element's — the mount
        // element's own size can change once the legend renders into it
        // (e.g. wrapping to 2 lines), and we never want that fed back in.
        const opts: uPlot.Options = {
            width: outerRef.current.offsetWidth,
            height: outerRef.current.offsetHeight,
            series,
            axes,
            scales: {
                x: { time: true },
                y: { range: (u, min, max) => [0, max * 1.05] },
            },
            legend: { show: !isAgg },
            cursor: {
                drag: { x: false, y: false },
                sync: { key: "gamemode-chart" },
            },
            hooks: {
                setCursor: [(u) => renderTooltip(u, u.cursor.idx ?? null)],
            },
            plugins: [],
        };

        uplotRef.current = new uPlot(opts, chartData as uPlot.AlignedData, mountRef.current);
        lastSizeRef.current = { width: opts.width, height: opts.height };

        // Handle resize carefully to avoid infinite expansion loops.
        // CRITICAL: we observe outerRef, NOT mountRef. outerRef's size is
        // determined purely by CSS (absolute inset-0 against its parent) and
        // is completely independent of uPlot's own rendered content (canvas,
        // legend, axis labels). mountRef — where uPlot actually renders —
        // can change size as a side effect of redrawing (e.g. the legend
        // wrapping differently at a new width), and observing that element
        // is what creates the feedback loop in the first place.
        const ro = new ResizeObserver((entries) => {
            if (!uplotRef.current) return;
            const entry = entries[0];
            const { width, height } = entry.contentRect;

            if (width <= 0 || height <= 0) return;

            // Only act on a genuine size change. This is still useful even
            // though we're observing a stable element, since it avoids
            // redundant setSize calls during e.g. drag-resize streams.
            const last = lastSizeRef.current;
            if (Math.abs(width - last.width) < 1 && Math.abs(height - last.height) < 1) {
                return;
            }
            lastSizeRef.current = { width, height };

            requestAnimationFrame(() => {
                uplotRef.current?.setSize({ width, height });
            });
        });
        ro.observe(outerRef.current);

        return () => {
            ro.disconnect();
            tooltipEl.remove();
            uplotRef.current?.destroy();
            uplotRef.current = null;
        };
    }, [data, selectedRange, viewMode]);

    if (loading) {
        return (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-orange-500 border-t-transparent" />
                <span className="text-xs text-neutral-500 font-medium">Recompiling metrics...</span>
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
                No data available for selected time range
            </div>
        );
    }

    // outerRef is the element we observe; its size is fixed purely by CSS
    // (absolute inset-0 against the actual layout parent) and is never
    // affected by what uPlot renders inside mountRef.
    // mountRef fills the outer box and is what uPlot draws into — if its
    // legend wraps and overflows slightly, `overflow-hidden` clips it rather
    // than growing the box, so there's nothing for the observer to react to.
    return (
        <div ref={outerRef} className="absolute inset-0 block">
            <div ref={mountRef} className="absolute inset-0 block overflow-hidden" />
        </div>
    );
};