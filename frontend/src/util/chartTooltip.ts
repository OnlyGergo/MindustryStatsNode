import uPlot from "uplot";

export interface TooltipRow {
    label: string;
    value: number;
    color: string;
    /** Shown instead of value.toLocaleString(); value still feeds the total. */
    display?: string;
}

export interface TooltipConfig {
    title: string;
    rows: TooltipRow[];
    isAgg?: boolean;
}

const HTML_ESCAPES: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

/** Labels and titles carry server-reported names (gamemodes, groups), so they are untrusted. */
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);

/** Colours land inside a style attribute; anything that isn't a plain colour token is dropped. */
const safeColor = (value: string): string => /^[#\w\s(),.%-]+$/.test(value) ? value : "transparent";

export const createChartTooltip = (mountNode: HTMLDivElement) => {
    const tooltipEl = document.createElement("div");
    tooltipEl.style.cssText = `
        position: absolute; pointer-events: none; display: none; z-index: 100;
        background: rgba(10, 10, 10, 0.96); border: 1px solid #262626; border-radius: 12px;
        padding: 10px 12px; font-size: 12px; color: #f5f5f5; white-space: nowrap;
        max-width: min(320px, calc(100% - 8px)); box-sizing: border-box;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.7), 0 8px 10px -6px rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
      `;
    mountNode.style.position = "relative";
    mountNode.appendChild(tooltipEl);

    const update = (u: uPlot, idx: number | null, getConfig: () => TooltipConfig | null) => {
        if (idx == null) {
            tooltipEl.style.display = "none";
            return;
        }

        const config = getConfig();
        if (!config) {
            tooltipEl.style.display = "none";
            return;
        }

        const { title, rows, isAgg } = config;
        let total = 0;

        const rowsHtml = rows
            .map((r) => {
                total += r.value;
                return `
                  <div style="display: flex; gap: 16px; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="display: flex; align-items: center; gap: 8px; color: #a3a3a3; min-width: 0;">
                      <span style="flex-shrink: 0; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background-color: ${safeColor(r.color)};"></span>
                      <span style="overflow: hidden; text-overflow: ellipsis;">${escapeHtml(r.label)}</span>
                    </span>
                    <span style="flex-shrink: 0; font-weight: 600; color: #f5f5f5;">${escapeHtml(r.display ?? r.value.toLocaleString())}</span>
                  </div>
                `;
            })
            .join("");

        const footerHtml = (!isAgg && rows.length > 1)
            ? `
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #262626;
                            display: flex; gap: 24px; justify-content: space-between; font-weight: 700;">
                  <span style="color: #f97316;">Total</span>
                  <span style="color: #f97316;">${total.toLocaleString()}</span>
                </div>
              `
            : "";

        tooltipEl.innerHTML = `
          <div style="color: #f97316; font-weight: 700; margin-bottom: 8px; border-bottom: 1px solid #262626; padding-bottom: 6px;">${escapeHtml(title)}</div>
          <div style="max-height: 200px; overflow-y: auto; padding-right: 4px;">
            ${rowsHtml}
          </div>
          ${footerHtml}
        `;

        // Measure after showing, then keep it inside the chart: flip to the
        // cursor's left near the right edge, and clamp both axes so a narrow
        // (phone) chart never pushes it off-screen.
        const narrow = mountNode.offsetWidth < 480;
        tooltipEl.style.fontSize = narrow ? "11px" : "12px";
        tooltipEl.style.padding = narrow ? "8px 10px" : "10px 12px";
        tooltipEl.style.display = "block";
        const cursorLeft = (u.cursor.left ?? 0) + u.over.offsetLeft;
        const cursorTop = (u.cursor.top ?? 0) + u.over.offsetTop;
        const containerW = mountNode.offsetWidth || 600;
        const containerH = mountNode.offsetHeight || 400;
        const tipW = tooltipEl.offsetWidth || 230;
        const tipH = tooltipEl.offsetHeight || 100;
        const preferred = cursorLeft + 16 + tipW > containerW ? cursorLeft - tipW - 12 : cursorLeft + 16;
        const left = Math.max(4, Math.min(preferred, containerW - tipW - 4));
        const top = Math.max(4, Math.min(cursorTop - 10, containerH - tipH - 4));

        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${top}px`;
    };

    const remove = () => {
        tooltipEl.remove();
    };

    return { update, remove };
};