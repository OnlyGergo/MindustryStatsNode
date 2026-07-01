import uPlot from "uplot";

interface TooltipRow {
    label: string;
    value: number;
    color: string;
}

interface TooltipConfig {
    title: string;
    rows: TooltipRow[];
    isAgg?: boolean;
}

export const createChartTooltip = (mountNode: HTMLDivElement) => {
    const tooltipEl = document.createElement("div");
    tooltipEl.style.cssText = `
        position: absolute; pointer-events: none; display: none; z-index: 100;
        background: rgba(10, 10, 10, 0.96); border: 1px solid #262626; border-radius: 12px;
        padding: 12px 14px; font-size: 12px; color: #f5f5f5; white-space: nowrap;
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
                  <div style="display: flex; gap: 24px; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="display: flex; align-items: center; gap: 8px; color: #a3a3a3;">
                      <span style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background-color: ${r.color};"></span>
                      ${r.label}
                    </span>
                    <span style="font-weight: 600; color: #f5f5f5;">${r.value.toLocaleString()}</span>
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
          <div style="color: #f97316; font-weight: 700; margin-bottom: 8px; border-bottom: 1px solid #262626; padding-bottom: 6px;">${title}</div>
          <div style="max-height: 200px; overflow-y: auto; padding-right: 4px;">
            ${rowsHtml}
          </div>
          ${footerHtml}
        `;

        const cursorLeft = u.cursor.left ?? 0;
        const cursorTop = u.cursor.top ?? 0;
        const containerW = mountNode.offsetWidth ?? 600;
        const tipW = tooltipEl.offsetWidth || 230;
        const left = cursorLeft + 16 + tipW > containerW ? cursorLeft - tipW - 12 : cursorLeft + 16;

        tooltipEl.style.display = "block";
        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.top = `${cursorTop - 10}px`;
    };

    const remove = () => {
        tooltipEl.remove();
    };

    return { update, remove };
};