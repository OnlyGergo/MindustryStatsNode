import uPlot from "uplot";
import { ServerEvent, ServerEventKind } from "../../../common/models/serverData.ts";
import { TooltipNote } from "./chartTooltip.ts";

/**
 * uPlot plugin that draws the `server_events` annotation stream over a chart.
 *
 * One event table drives two shapes (see migration 29): `endsAt === null` is a
 * point event - a version bump, the moment an address changed - drawn as a
 * dashed vertical line; a set `endsAt` is a span - an era of poor DNS
 * resolution, a global outage - drawn as a shaded band.
 *
 * Deliberately monochrome. Colour on these charts means *series identity*
 * (which server / network / gamemode a line belongs to), so an annotation that
 * introduced a colour would read as another data series, and one that
 * recoloured a data segment would silently reassign that segment's identity.
 * Annotations therefore only ever use the neutral surface tokens, which puts
 * them behind the data in the visual hierarchy - context, not content.
 *
 * Usage mirrors `createChartTooltip`: build it once per uPlot instance, hand
 * `plugin` to the options, call `update()` when a new event list arrives (this
 * avoids tearing down the whole chart just because annotations loaded late),
 * and `remove()` in the effect cleanup.
 */

/** Fraction of the x axis annotation markers are allowed to occupy - see `clusterGap`. */
const MARKER_INK_BUDGET = 0.25;

/** Dash pattern for a point marker, in CSS px. The period sets the legibility floor below. */
const MARKER_DASH_CSS = [4, 4];

/** How close (in CSS px) the cursor has to be to a point marker to pick it up. */
const HIT_RADIUS_CSS = 8;

/** Cap on notes surfaced through the tooltip, so a dense cluster can't produce a wall of text. */
const MAX_NOTES = 4;

const KIND_LABELS: Record<ServerEventKind, string> = {
    address_change: "Address change",
    version_change: "Version change",
    data_quality: "Data quality",
};

/**
 * Palette read from the theme rather than hardcoded, so the annotations follow
 * `index.css` if the surface tokens are ever retuned. Resolved once: this is a
 * `getComputedStyle` call, and doing it inside a draw hook would force a style
 * recalc on every frame of a resize.
 */
let palette: { bandFill: string; bandEdge: string; mark: string } | null = null;

function getPalette() {
    if (palette) return palette;

    const style = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) =>
        style?.getPropertyValue(name).trim() || fallback;

    // A deliberate hierarchy within the neutrals: a span covers a large area so
    // it has to be nearly nothing per pixel, while a point marker is a hairline
    // and would disappear at the same contrast.
    const resolved = {
        // Already translucent in the theme, which is exactly what a band wants.
        bandFill: read("--color-border-subtle", "rgba(255, 255, 255, 0.06)"),
        bandEdge: read("--color-border-default", "rgba(255, 255, 255, 0.1)"),
        mark: read("--color-text-tertiary", "#6b6b6b"),
    };

    // Only cached once the tokens have actually been read - caching the
    // fallbacks would freeze them in for the life of the page.
    if (style) palette = resolved;
    return resolved;
}

/**
 * A run of point events collapsed into one marker. `x` is the canvas-space
 * position of the *first* event in the run rather than the run's mean: anchoring
 * on the first keeps the minimum-gap invariant exact as the pass walks left to
 * right, and "the marker sits at the earliest event it stands for" is a claim
 * that stays true, which a drifting average is not.
 */
interface MarkerCluster {
    x: number;
    events: ServerEvent[];
}

export interface ChartAnnotations {
    plugin: uPlot.Plugin;
    /** Swap the event list without rebuilding the chart. */
    update: (events: ServerEvent[]) => void;
    /**
     * Annotations overlapping the cursor, formatted for `createChartTooltip`'s
     * `notes`. An unexplained dashed line is a worse chart than no line at all,
     * so every mark this plugin draws is reachable by hovering it.
     */
    notesAt: (u: uPlot) => TooltipNote[];
    remove: () => void;
}

export const createChartAnnotations = (initialEvents: ServerEvent[] = []): ChartAnnotations => {
    let events = initialEvents;
    let plot: uPlot | null = null;

    // Recomputed on every draw and read back by `notesAt`, so hit testing
    // always matches the marks currently on screen - including the fact that
    // a cluster answers for every event folded into it.
    let clusters: MarkerCluster[] = [];

    // uPlot's x scale here is always seconds (every chart in this codebase feeds
    // it `timestamp / 1000` with `scales.x.time`), while ServerEvent carries ms.
    const startSec = (e: ServerEvent) => e.occurredAt / 1000;
    const endSec = (e: ServerEvent) => (e.endsAt == null ? null : e.endsAt / 1000);

    const spansIn = (min: number, max: number) =>
        events.filter((e) => {
            const end = endSec(e);
            return end != null && end >= min && startSec(e) <= max;
        });

    const pointsIn = (min: number, max: number) =>
        events
            .filter((e) => e.endsAt == null && startSec(e) >= min && startSec(e) <= max)
            .sort((a, b) => a.occurredAt - b.occurredAt);

    const clip = (u: uPlot) => {
        const { ctx, bbox } = u;
        ctx.beginPath();
        ctx.rect(bbox.left, bbox.top, bbox.width, bbox.height);
        ctx.clip();
    };

    /**
     * Bands go in `drawClear` - after the canvas is wiped but before grid,
     * axes and series - so the data always sits on top of its context and a
     * band can never hide a line.
     */
    const drawSpans = (u: uPlot) => {
        const min = u.scales.x?.min;
        const max = u.scales.x?.max;
        if (min == null || max == null) return;

        const visible = spansIn(min, max);
        if (visible.length === 0) return;

        const { ctx, bbox } = u;
        const { bandFill, bandEdge } = getPalette();
        const dpr = uPlot.pxRatio;

        ctx.save();
        clip(u);

        for (const event of visible) {
            const end = endSec(event);
            if (end == null) continue;

            const x0 = u.valToPos(startSec(event), "x", true);
            const x1 = u.valToPos(end, "x", true);
            // A span shorter than the bucket the chart drew can still collapse to
            // sub-pixel width; floor it at one device pixel so it doesn't vanish.
            const width = Math.max(x1 - x0, dpr);

            ctx.fillStyle = bandFill;
            ctx.fillRect(x0, bbox.top, width, bbox.height);

            // Edges, so a band abutting another band still reads as two.
            ctx.strokeStyle = bandEdge;
            ctx.lineWidth = dpr;
            ctx.beginPath();
            ctx.moveTo(x0, bbox.top);
            ctx.lineTo(x0, bbox.top + bbox.height);
            ctx.moveTo(x0 + width, bbox.top);
            ctx.lineTo(x0 + width, bbox.top + bbox.height);
            ctx.stroke();
        }

        ctx.restore();
    };

    /**
     * Point markers go in `draw`, after the series: a dashed hairline over an
     * area fill stays readable, whereas the same line underneath a filled
     * series would be swallowed by it.
     *
     * Density gating. Two independent limits, both in pixels rather than in
     * "number of events", because whether markers are legible is a question
     * about the plot's geometry and not about how busy the server's history
     * happens to be:
     *
     *   1. Legibility floor. A marker is a hairline on a 4-on/4-off dash, so its
     *      pattern repeats every 8 CSS px. Two markers closer together than one
     *      dash period interleave into a single fuzzy band, so that period is the
     *      smallest separation at which two marks still read as two. Dividing the
     *      plot width by it gives the number of distinguishable slots the axis
     *      actually has - the real budget, which a 320px phone chart and a 1400px
     *      desktop one have very different amounts of.
     *   2. Ink budget. Filling every one of those slots is legal but useless: a
     *      chart that is 100% annotation is a barcode. Markers are capped at
     *      MARKER_INK_BUDGET of the slots, and the clustering gap is widened
     *      until the run of events in view fits that cap.
     *
     * Past that, if the *raw* events in view outnumber the slots entirely -
     * more than one event per legible slot across the whole plot - clustering
     * would be drawing a line at essentially every x, which annotates nothing.
     * The markers are dropped in that case; `notesAt` keeps hit testing them,
     * so a dense history is still explorable by hovering, just not by looking.
     */
    const drawMarkers = (u: uPlot) => {
        clusters = [];

        const min = u.scales.x?.min;
        const max = u.scales.x?.max;
        if (min == null || max == null) return;

        const visible = pointsIn(min, max);
        if (visible.length === 0) return;

        const { ctx, bbox } = u;
        const dpr = uPlot.pxRatio;
        const dashPeriod = (MARKER_DASH_CSS[0] + MARKER_DASH_CSS[1]) * dpr;
        const legibleSlots = Math.max(1, Math.floor(bbox.width / dashPeriod));

        // Cluster regardless of how sparse the events are - it is a no-op when
        // they already sit further apart than the gap.
        const markerBudget = Math.max(1, Math.floor(legibleSlots * MARKER_INK_BUDGET));
        const clusterGap = Math.max(dashPeriod, bbox.width / markerBudget);

        for (const event of visible) {
            const x = u.valToPos(startSec(event), "x", true);
            const last = clusters[clusters.length - 1];
            if (last && x - last.x < clusterGap) {
                last.events.push(event);
            } else {
                clusters.push({ x, events: [event] });
            }
        }

        // Hit testing stays on (clusters is populated above); only the ink goes.
        if (visible.length > legibleSlots) return;

        const { mark } = getPalette();

        ctx.save();
        clip(u);

        ctx.strokeStyle = mark;
        ctx.lineWidth = dpr;
        ctx.setLineDash(MARKER_DASH_CSS.map((d) => d * dpr));

        for (const cluster of clusters) {
            ctx.beginPath();
            ctx.moveTo(cluster.x, bbox.top);
            ctx.lineTo(cluster.x, bbox.top + bbox.height);
            ctx.stroke();
        }

        ctx.setLineDash([]);

        // Count badge on collapsed runs only, so the marker never implies it
        // stands for exactly one event when it stands for nine.
        ctx.fillStyle = mark;
        ctx.font = `${10 * dpr}px sans-serif`;
        ctx.textBaseline = "top";
        for (const cluster of clusters) {
            if (cluster.events.length < 2) continue;
            ctx.fillText(`×${cluster.events.length}`, cluster.x + 3 * dpr, bbox.top + 2 * dpr);
        }

        ctx.restore();
    };

    const plugin: uPlot.Plugin = {
        hooks: {
            init: (u: uPlot) => {
                plot = u;
            },
            drawClear: (u: uPlot) => drawSpans(u),
            draw: (u: uPlot) => drawMarkers(u),
            destroy: () => {
                plot = null;
                clusters = [];
            },
        },
    };

    const notesAt = (u: uPlot): TooltipNote[] => {
        const left = u.cursor.left;
        if (left == null || left < 0) return [];

        const at = u.posToVal(left, "x");
        // Convert the pick radius from px into x-scale units at the current zoom,
        // so it stays 8px whether the chart is showing a day or a year.
        const tolerance = Math.abs(u.posToVal(left + HIT_RADIUS_CSS, "x") - at);

        const hits: ServerEvent[] = [];

        for (const event of events) {
            const end = endSec(event);
            if (end != null && startSec(event) <= at && at <= end) hits.push(event);
        }

        for (const cluster of clusters) {
            // Compared in x-scale units rather than by converting cluster.x back:
            // that value is canvas-space (it includes the axis gutter) while the
            // cursor is measured from the plot area, and the cluster's anchor
            // event carries the exact value the marker was drawn at anyway.
            const clusterVal = startSec(cluster.events[0]);
            if (Math.abs(clusterVal - at) <= tolerance) hits.push(...cluster.events);
        }

        if (hits.length === 0) return [];

        const notes = hits.slice(0, MAX_NOTES).map(describeEvent);
        if (hits.length > MAX_NOTES) {
            notes.push({ label: "", text: `+${hits.length - MAX_NOTES} more` });
        }
        return notes;
    };

    return {
        plugin,
        update: (next: ServerEvent[]) => {
            events = next;
            // rebuildPaths: false — the series data hasn't moved, only the
            // annotations over it, so the cached Path2Ds are still valid.
            plot?.redraw(false);
        },
        notesAt,
        remove: () => {
            plot = null;
            clusters = [];
        },
    };
};

function formatMoment(ms: number): string {
    return new Date(ms).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/**
 * `detail` is free-form jsonb, so read it defensively and fall back to nothing.
 *
 * from/to are not necessarily strings: an address_change carries two host:port
 * strings, but a version_change carries two build numbers, which the collector
 * writes through jsonb_build_object() straight from an integer column. Reading
 * only strings here would leave every version bump as an unexplained line.
 */
function describeDetail(detail: Record<string, unknown> | null): string | null {
    if (!detail) return null;

    const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
    const scalar = (v: unknown) =>
        typeof v === "number" && Number.isFinite(v) ? String(v) : str(v);

    const from = scalar(detail.from);
    const to = scalar(detail.to);
    if (from && to) return `${from} → ${to}`;

    return str(detail.reason) ?? str(detail.note) ?? str(detail.message) ?? null;
}

function describeEvent(event: ServerEvent): TooltipNote {
    const when =
        event.endsAt == null
            ? formatMoment(event.occurredAt)
            : `${formatMoment(event.occurredAt)} → ${formatMoment(event.endsAt)}`;

    const detail = describeDetail(event.detail);

    return {
        // A global event annotates every chart, so say so - otherwise it looks
        // like something that happened to this one server.
        label: `${event.serverId === null ? "Global " : ""}${KIND_LABELS[event.kind] ?? event.kind}`,
        text: detail ? `${detail} · ${when}` : when,
    };
}
