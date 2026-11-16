import React from "react";

export interface StatItem {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Small text after the value, e.g. "▼ 11% vs prev. week". */
  sub?: React.ReactNode;
  /** Colours the sub text. */
  tone?: "good" | "bad" | "dim";
  title?: string;
}

const TONE = { good: "text-good", bad: "text-bad", dim: "text-dim" };

/** One bordered box of label/value cells; cells wrap and grow, so any count fills the rows. */
export const StatStrip: React.FC<{ items: StatItem[]; className?: string }> = ({ items, className = "" }) => (
  <div className={`strip ${className}`}>
    {items.map((it, i) => (
      <div key={i} className="strip-cell" title={it.title}>
        <div className="strip-label">{it.label}</div>
        <div className="strip-value">
          {it.value}
          {it.sub != null && (
            <small className={`ml-1 text-[11px] font-sans font-normal ${TONE[it.tone ?? "dim"]}`}>{it.sub}</small>
          )}
        </div>
      </div>
    ))}
  </div>
);

export default StatStrip;
