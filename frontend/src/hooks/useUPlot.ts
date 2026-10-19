import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import { createChartTooltip, type TooltipConfig } from "../util/chartTooltip.ts";

/** Below this chart width, axes switch to bigger labels, fewer ticks and compact counts. */
const NARROW_PX = 640;

export interface UPlotSpec {
    /**
     * Identifies the chart's shape: series count, labels, kind. A change
     * rebuilds the chart; anything else is handed over with setData/setSeries.
     */
    shape: string;
    /** Called only on (re)build, so it may close over the current props freely. */
    options: (ctx: { narrow: boolean }) => Omit<uPlot.Options, "width" | "height" | "hooks">;
    data: uPlot.AlignedData | null;
    /** Visibility of series 1..n, applied without a rebuild. */
    show?: boolean[];
    tooltip?: (u: uPlot, idx: number) => TooltipConfig | null;
}

/**
 * Touch: tap or drag sideways moves the cursor (vertical drags still scroll
 * the page), and a tap anywhere outside the plot clears it. uPlot itself only
 * listens for mouse events.
 */
function attachTouchCursor(u: uPlot): () => void {
    const over = u.over;
    over.style.touchAction = "pan-y";
    const move = (e: PointerEvent) => {
        if (e.pointerType === "mouse") return;
        const rect = over.getBoundingClientRect();
        u.setCursor({ left: e.clientX - rect.left, top: e.clientY - rect.top });
    };
    const outside = (e: PointerEvent) => {
        if (e.pointerType !== "mouse" && !over.contains(e.target as Node)) u.setCursor({ left: -10, top: -10 });
    };
    over.addEventListener("pointerdown", move);
    over.addEventListener("pointermove", move);
    document.addEventListener("pointerdown", outside);
    return () => {
        over.removeEventListener("pointerdown", move);
        over.removeEventListener("pointermove", move);
        document.removeEventListener("pointerdown", outside);
    };
}

/**
 * One uPlot instance per shape: owns creation, resizing, the tooltip and
 * teardown, and feeds new data or series visibility into the live chart rather
 * than destroying it. Attach `outerRef` to the sized container and `mountRef`
 * to an absolutely-positioned child.
 */
export function useUPlot(spec: UPlotSpec) {
    const outerRef = useRef<HTMLDivElement>(null);
    const mountRef = useRef<HTMLDivElement>(null);
    const plotRef = useRef<uPlot | null>(null);
    const dataRef = useRef<uPlot.AlignedData | null>(null);
    const specRef = useRef(spec);
    // Bumped when the chart crosses NARROW_PX, since axis fonts/sizes are fixed at build.
    const [layoutTick, setLayoutTick] = useState(0);

    useEffect(() => { specRef.current = spec; });

    const hasData = spec.data != null && spec.data[0].length > 0;

    useEffect(() => {
        const outer = outerRef.current;
        const mount = mountRef.current;
        const { options, data } = specRef.current;
        if (!outer || !mount || !data || data[0].length === 0) return;

        const narrow = outer.offsetWidth < NARROW_PX;
        const tooltip = createChartTooltip(mount);
        const plot = new uPlot({
            ...options({ narrow }),
            width: outer.offsetWidth,
            height: outer.offsetHeight,
            hooks: {
                setCursor: [(u) => {
                    const idx = u.cursor.idx ?? null;
                    tooltip.update(u, idx, () => idx == null ? null : specRef.current.tooltip?.(u, idx) ?? null);
                }],
            },
        }, data, mount);
        plotRef.current = plot;
        dataRef.current = data;
        specRef.current.show?.forEach((show, i) => {
            if (plot.series[i + 1] && plot.series[i + 1].show !== show) plot.setSeries(i + 1, { show });
        });
        const detachTouch = attachTouchCursor(plot);

        let last = { width: outer.offsetWidth, height: outer.offsetHeight };
        const ro = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            if (width <= 0 || height <= 0) return;
            if (width < NARROW_PX !== narrow) {
                setLayoutTick((t) => t + 1);
                return;
            }
            if (Math.abs(width - last.width) < 1 && Math.abs(height - last.height) < 1) return;
            last = { width, height };
            requestAnimationFrame(() => plot.setSize({ width, height }));
        });
        ro.observe(outer);

        return () => {
            ro.disconnect();
            detachTouch();
            tooltip.remove();
            plot.destroy();
            plotRef.current = null;
            dataRef.current = null;
        };
    }, [spec.shape, hasData, layoutTick]);

    // Same shape, new numbers: no rebuild.
    useEffect(() => {
        const plot = plotRef.current;
        if (!plot || !spec.data || spec.data === dataRef.current) return;
        dataRef.current = spec.data;
        plot.setData(spec.data);
    }, [spec.data]);

    const showKey = spec.show?.join(",");
    useEffect(() => {
        const plot = plotRef.current;
        if (!plot) return;
        specRef.current.show?.forEach((show, i) => {
            if (plot.series[i + 1] && plot.series[i + 1].show !== show) plot.setSeries(i + 1, { show });
        });
    }, [showKey]);

    return { outerRef, mountRef };
}
