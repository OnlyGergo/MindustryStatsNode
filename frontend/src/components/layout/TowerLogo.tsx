import React, { useEffect, useId, useRef, useState } from "react";
import staticSvg from "../../../public/favicon.svg?raw";
import animatedSvg from "../../assets/tower-loader.svg?raw";

/** Length of one turret cycle in tower-loader.svg; its last frame equals its first (= favicon.svg). */
const CYCLE_MS = 6000;

/**
 * Inline the SVG with every id (and `url(#…)` reference) prefixed, so two logos on one
 * page (desktop + mobile top bar) don't share a clipPath, and size it to its container.
 */
function prepare(svg: string, prefix: string): string {
  return svg
    .replace(/^<\?xml[^>]*>\s*/, "")
    .replace('width="512" height="512"', 'width="100%" height="100%" aria-hidden="true" focusable="false"')
    .replace(/\bid="([\w-]+)"/g, `id="${prefix}$1"`)
    .replace(/url\(#([\w-]+)\)/g, `url(#${prefix}$1)`);
}

/**
 * The site logo: the favicon's still frame, swapped for the animated tower while `active`
 * (the brand link is hovered or focused). An inline SVG's SMIL timeline starts when it is
 * inserted, so the swap always plays from frame one; when `active` drops, the current cycle
 * finishes before swapping back, so it never snaps mid-turn. Reduced motion stays still.
 */
const TowerLogo: React.FC<{ active?: boolean; className?: string }> = ({ active = false, className }) => {
  const prefix = "tl" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [playing, setPlaying] = useState(false);
  const startedAt = useRef(0);

  useEffect(() => {
    if (active) {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      if (!playing) {
        startedAt.current = performance.now();
        setPlaying(true);
      }
      return;
    }
    if (!playing) return;
    const elapsed = performance.now() - startedAt.current;
    const t = setTimeout(() => setPlaying(false), CYCLE_MS - (elapsed % CYCLE_MS));
    return () => clearTimeout(t);
  }, [active, playing]);

  return (
    <span
      className={`inline-block ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: prepare(playing ? animatedSvg : staticSvg, prefix) }}
    />
  );
};

export default TowerLogo;
