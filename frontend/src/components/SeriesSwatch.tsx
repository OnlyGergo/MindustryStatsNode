import React from "react";
import { modeHue } from "../util/themeColors.ts";

/**
 * Legend dot for a named chart series. The colour is worked out in CSS from
 * --acc (`series-swatch` in index.css), so it is SSR-safe and follows the
 * theme; the canvas path computes the same colour with seriesColor().
 */
const SeriesSwatch: React.FC<{ label: string; other?: boolean; className?: string }> = ({ label, other, className = "" }) => (
  <span
    aria-hidden="true"
    className={`inline-block shrink-0 ${other ? "bg-dim" : "series-swatch"} ${className}`}
    style={other ? undefined : ({ "--h": modeHue(label) } as React.CSSProperties)}
  />
);

export default SeriesSwatch;
