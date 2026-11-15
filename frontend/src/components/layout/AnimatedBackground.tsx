import React from "react";

/*
 * Soft glows behind the app. Each is a radial gradient rather than a box run
 * through `blur-3xl`: a 64px blur filter on a full-viewport fixed layer had to
 * be re-rasterised on every frame of the pulse, which is what made scrolling
 * stutter on phones. A gradient looks the same, and with `will-change: opacity`
 * the pulse is a compositor-only opacity change with no repaint at all.
 */
const glow = (rgba: string): React.CSSProperties => ({
  backgroundImage: `radial-gradient(closest-side, ${rgba}, ${rgba} 40%, transparent)`,
});

const blob = "absolute rounded-full animate-pulse motion-reduce:animate-none will-change-[opacity]";

const AnimatedBackground: React.FC = () => (
  <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
    <div className={`${blob} -top-64 -right-64 w-128 h-128`} style={glow("rgba(249, 115, 22, 0.1)")} />
    <div
      className={`${blob} -bottom-64 -left-64 w-128 h-128`}
      style={{ ...glow("rgba(245, 158, 11, 0.1)"), animationDelay: "1s" }}
    />
    <div
      className={`${blob} top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96`}
      style={{ ...glow("rgba(234, 88, 12, 0.04)"), animationDelay: "2s" }}
    />
  </div>
);

export default AnimatedBackground;
